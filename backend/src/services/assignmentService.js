import logger from '../utils/logger.js';
import Order from '../models/Order.model.js';
import Shipment from '../models/Shipment.model.js';
import DeliveryBoy from '../models/DeliveryBoy.model.js';
import Vendor from '../models/Vendor.model.js';
import ReturnRequest from '../models/ReturnRequest.model.js';
import { createNotification } from './notification.service.js';
import { notifyOrderUpdate } from './socket.service.js';
import { buildOrderItemsSummary, buildReturnItemsSummary } from '../utils/notificationProductFormatter.js';

const calculateDistance = (lat1, lon1, lat2, lon2) => {
    if (!lat1 || !lon1 || !lat2 || !lon2) return 999999;
    const R = 6371; // Radius of the Earth in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
};

// ───────────────────────────────────────────────────────────────────────────────
// Phase 5.2: Shipment-Primary Auto-Assignment
//
// autoAssignDeliveryPartner(shipmentId) is the NEW primary entry point for
// new orders that have a Shipment record (created in Phase 5.1).
//
// Design decisions:
//   • Shipment is primary source of truth. Order is dual-written for backward
//     compatibility only (Phase 5.3 will remove the dual-write).
//   • Idempotency: uses findOneAndUpdate with conditional filter so concurrent
//     calls cannot double-assign the same Shipment.
//   • No partial updates: Shipment write happens first; Order dual-write is
//     best-effort (failure logged, not propagated).
//   • Per-vendor scope: each Shipment belongs to exactly one vendor, so
//     vendorId comes directly from Shipment.vendorId (no ambiguity).
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Shipment-primary auto-assignment.
 * Called by the SHIPMENT_CREATED listener and the scheduler for new orders.
 *
 * @param {string|ObjectId} shipmentId  - Shipment._id (primary lookup key)
 */
export const autoAssignDeliveryPartner = async (shipmentId) => {
    try {
        // ─ 1. Load Shipment ──────────────────────────────────────────────────
        const shipment = await Shipment.findById(shipmentId);
        if (!shipment) {
            console.warn(`[Auto Assign] Shipment ${shipmentId} not found. Skipping.`);
            return;
        }

        // ─ 2. Idempotency guard ───────────────────────────────────────────────
        // 'accepted' and 'manual_override' are terminal — never re-assign.
        if (shipment.deliveryAssignmentStatus === 'accepted' ||
            shipment.deliveryAssignmentStatus === 'manual_override') {
            console.log(`[Auto Assign] Shipment ${shipment.shipmentNumber} already in terminal state (${shipment.deliveryAssignmentStatus}). Skipping.`);
            return;
        }

        // ─ 3. Load Order for context (vendor, payment method, total) ───────
        const order = await Order.findById(shipment.orderId);
        if (!order || order.isDeleted) {
            console.warn(`[Auto Assign] Order ${shipment.orderId} not found for Shipment ${shipment.shipmentNumber}. Skipping.`);
            return;
        }
        if (['cancelled', 'returned', 'delivered'].includes(order.status)) {
            console.log(`[Auto Assign] Order ${order.orderId} is ${order.status}. Skipping Shipment ${shipment.shipmentNumber}.`);
            return;
        }

        // ─ 4. Load the Shipment's specific vendor ──────────────────────────
        // Each Shipment has its own vendorId (not the whole order's vendors).
        const vendor = await Vendor.findById(shipment.vendorId);
        if (!vendor) {
            logger.error(`[Auto Assign] Vendor ${shipment.vendorId} not found for Shipment ${shipment.shipmentNumber}.`);
            await _markShipmentFailed(shipment, order);
            return;
        }

        const vendorLocation = vendor.address?.location;
        const hasVendorCoords = vendorLocation?.coordinates?.length === 2;

        // ─ 5. Find eligible delivery partners ─────────────────────────────
        const MAX_COD_LIMIT = 20000;
        const driverQuery = {
            status: 'available',
            isActive: true,
            applicationStatus: 'approved',
            _id: { $nin: shipment.rejectedDeliveryBoys || [] },
        };
        if (order.paymentMethod === 'cash' || order.paymentMethod === 'cod') {
            driverQuery.cashInHand = { $lte: MAX_COD_LIMIT - (order.total || 0) };
        }

        const deliveryBoys = await DeliveryBoy.find(driverQuery).lean();
        if (deliveryBoys.length === 0) {
            console.log(`[Auto Assign] No available delivery partners for Shipment ${shipment.shipmentNumber}.`);
            await _markShipmentFailed(shipment, order);
            return;
        }

        // ─ 6. Capacity filtering ──────────────────────────────────────────
        const driverIds = deliveryBoys.map(d => d._id);
        const activeOrdersCounts = await Order.aggregate([
            {
                $match: {
                    deliveryBoyId: { $in: driverIds },
                    status: { $in: ['pending', 'processing', 'ready_for_pickup', 'accepted', 'assigned'] },
                },
            },
            { $group: { _id: '$deliveryBoyId', count: { $sum: 1 } } },
        ]);
        const countsMap = activeOrdersCounts.reduce((acc, row) => {
            acc[String(row._id)] = row.count;
            return acc;
        }, {});

        const eligibleBoys = deliveryBoys.filter(db => {
            const activeCount = countsMap[String(db._id)] || 0;
            const maxLimit = typeof db.maxActiveOrders === 'number' ? db.maxActiveOrders : 3;
            return activeCount < maxLimit;
        });

        if (eligibleBoys.length === 0) {
            console.log(`[Auto Assign] No delivery partners have capacity for Shipment ${shipment.shipmentNumber}.`);
            await _markShipmentFailed(shipment, order);
            return;
        }

        // ─ 7. Rider selection (same 3-tier algorithm as legacy) ──────────
        const { selectedRider, assignmentMethod } = await _selectRider(
            eligibleBoys, countsMap, vendorLocation, hasVendorCoords
        );

        if (!selectedRider) {
            console.log(`[Auto Assign] Failed to match a delivery partner for Shipment ${shipment.shipmentNumber}.`);
            await _markShipmentFailed(shipment, order);
            return;
        }

        // ─ 8. Compute distance ──────────────────────────────────────────
        let distanceInKm = 0;
        if (selectedRider.distance !== undefined) {
            distanceInKm = assignmentMethod === 'Google Maps API'
                ? parseFloat((selectedRider.distance / 1000).toFixed(2))
                : parseFloat(selectedRider.distance.toFixed(2));
        }

        // ─ 9. Atomic Shipment write (primary, with idempotency guard) ──────
        // We use findOneAndUpdate with a conditional filter so that if two
        // concurrent calls race, only one wins.
        const updatedShipment = await Shipment.findOneAndUpdate(
            {
                _id: shipment._id,
                // Only update if still unassigned/failed (not yet accepted or manual_override)
                deliveryAssignmentStatus: { $nin: ['accepted', 'manual_override', 'assigned'] },
            },
            {
                $set: {
                    deliveryBoyId:             selectedRider._id,
                    deliveryAssignmentStatus:  'assigned',
                    distance:                  distanceInKm,
                },
            },
            { new: true }
        );

        if (!updatedShipment) {
            // Another concurrent call already assigned this Shipment — this is correct behavior.
            console.log(`[Auto Assign] Shipment ${shipment.shipmentNumber} was already assigned by a concurrent call. Skipping.`);
            return;
        }

        console.log(`[Auto Assign] Shipment ${updatedShipment.shipmentNumber} assigned to ${selectedRider.name} via ${assignmentMethod}`);

        // ─ 11. Notify delivery partner ─────────────────────────────────────
        const itemsText      = buildOrderItemsSummary(order.items);
        const vendorsSummary = (order.vendorItems || []).map(v => v.vendorName).join(', ');
        const richOfferMessage =
            `You have been offered order ${order.orderId || order._id} from [${vendorsSummary}]. ` +
            `Please accept or reject within 5 minutes.${itemsText}`;

        await createNotification({
            recipientId:   selectedRider._id,
            recipientType: 'delivery',
            title:         'New order offer',
            message:       richOfferMessage,
            type:          'order',
            data: {
                orderId:     String(order.orderId || order._id),
                shipmentId:  String(updatedShipment._id),
                assignedAt:  new Date().toISOString(),
            },
        });

        notifyOrderUpdate(order);

    } catch (err) {
        logger.error(`[Auto Assign] Error during Shipment-based auto-assignment:`, err.message);
    }
};

// ───────────────────────────────────────────────────────────────────────────────
// Legacy Path: Order-primary auto-assignment
//
// autoAssignDeliveryPartnerLegacy(orderId) is used for:
//   • Orders created BEFORE Phase 5.1 (no Shipment record exists)
//   • Called by the vendor controller when no Shipment is found for the order
//   • Called by the scheduler for timed-out legacy orders
//
// Do NOT call this for orders that have a Shipment — use autoAssignDeliveryPartner().
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Legacy (Order-primary) auto-assignment.
 * Preserved for backward compatibility with orders created before Phase 5.1.
 * The original autoAssignDeliveryPartner logic is unchanged here.
 *
 * @param {string|ObjectId} orderId  - Order._id
 */
export const autoAssignDeliveryPartnerLegacy = async (orderId) => {
    try {
        const order = await Order.findById(orderId);
        if (!order || order.isDeleted) return;

        // Skip if order is cancelled, delivered, or already accepted
        if (['cancelled', 'returned', 'delivered'].includes(order.status)) return;
        if (order.deliveryAssignmentStatus === 'accepted' || order.deliveryAssignmentStatus === 'manual_override') return;

        // 1. Identify the vendor and get their location
        const vendorId = order.vendorItems?.[0]?.vendorId || order.items?.[0]?.vendorId;
        if (!vendorId) {
            logger.error(`[Auto Assign Legacy] Vendor ID not found for order ${order._id}`);
            order.deliveryAssignmentStatus = 'failed';
            await order.save();
            return;
        }

        const vendor = await Vendor.findById(vendorId);
        if (!vendor) {
            logger.error(`[Auto Assign Legacy] Vendor not found: ${vendorId} for order ${order._id}`);
            order.deliveryAssignmentStatus = 'failed';
            await order.save();
            return;
        }

        const vendorLocation = vendor.address?.location;
        const hasVendorCoords = vendorLocation?.coordinates?.length === 2;

        // 2. Fetch all online, active, approved delivery boys
        const MAX_COD_LIMIT = 20000;
        const query = {
            status: 'available',
            isActive: true,
            applicationStatus: 'approved',
            _id: { $nin: order.rejectedDeliveryBoys || [] }
        };
        if (order.paymentMethod === 'cash' || order.paymentMethod === 'cod') {
            query.cashInHand = { $lte: MAX_COD_LIMIT - order.total };
        }

        const deliveryBoys = await DeliveryBoy.find(query).lean();
        if (deliveryBoys.length === 0) {
            console.log(`[Auto Assign Legacy] No available delivery boys found for order ${order._id}`);
            order.deliveryAssignmentStatus = 'failed';
            await order.save();
            return;
        }

        // 3. Capacity filtering
        const driverIds = deliveryBoys.map(d => d._id);
        const activeOrdersCounts = await Order.aggregate([
            {
                $match: {
                    deliveryBoyId: { $in: driverIds },
                    status: { $in: ['pending', 'processing', 'ready_for_pickup', 'accepted', 'assigned'] },
                },
            },
            { $group: { _id: '$deliveryBoyId', count: { $sum: 1 } } },
        ]);
        const countsMap = activeOrdersCounts.reduce((acc, row) => {
            acc[String(row._id)] = row.count;
            return acc;
        }, {});

        const eligibleBoys = deliveryBoys.filter(db => {
            const activeCount = countsMap[String(db._id)] || 0;
            const maxLimit = typeof db.maxActiveOrders === 'number' ? db.maxActiveOrders : 3;
            return activeCount < maxLimit;
        });

        if (eligibleBoys.length === 0) {
            console.log(`[Auto Assign Legacy] No delivery boys have available capacity for order ${order._id}`);
            order.deliveryAssignmentStatus = 'failed';
            await order.save();
            return;
        }

        const { selectedRider, assignmentMethod } = await _selectRider(
            eligibleBoys, countsMap, vendorLocation, hasVendorCoords
        );

        if (!selectedRider) {
            console.log(`[Auto Assign Legacy] Failed to match a delivery partner for order ${order._id}`);
            order.deliveryBoyId = undefined;
            order.deliveryAssignmentStatus = 'failed';
            await order.save();
            return;
        }

        order.deliveryBoyId = selectedRider._id;
        order.deliveryAssignmentStatus = 'assigned';

        let distanceInKm = 0;
        if (selectedRider.distance !== undefined) {
            distanceInKm = assignmentMethod === 'Google Maps API'
                ? parseFloat((selectedRider.distance / 1000).toFixed(2))
                : parseFloat(selectedRider.distance.toFixed(2));
        }
        order.distance = distanceInKm;
        await order.save();

        console.log(`[Auto Assign Legacy] Order ${order.orderId || order._id} assigned to ${selectedRider.name} via ${assignmentMethod}`);

        const itemsText      = buildOrderItemsSummary(order.items);
        const vendorsSummary = (order.vendorItems || []).map(v => v.vendorName).join(', ');
        const richOfferMessage =
            `You have been offered order ${order.orderId || order._id} from [${vendorsSummary}]. ` +
            `Please accept or reject within 5 minutes.${itemsText}`;

        await createNotification({
            recipientId:   selectedRider._id,
            recipientType: 'delivery',
            title:         'New order offer',
            message:       richOfferMessage,
            type:          'order',
            data: {
                orderId:    String(order.orderId || order._id),
                assignedAt: new Date().toISOString(),
            },
        });

    } catch (err) {
        logger.error(`[Auto Assign Legacy] Error during legacy auto-assignment:`, err.message);
    }
};

// ───────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Mark a Shipment and its linked Order as assignment-failed.
 * Best-effort on Order update (failure logged, not thrown).
 */
async function _markShipmentFailed(shipment, order) {
    try {
        await Shipment.findByIdAndUpdate(
            shipment._id,
            { $set: { deliveryAssignmentStatus: 'failed' } }
        );
    } catch (err) {
        logger.error(`[Auto Assign] Could not mark Shipment ${shipment.shipmentNumber} as failed:`, err.message);
        // Legacy dual-write removed
    }
}

/**
 * 3-tier rider selection algorithm (shared by both Shipment and legacy paths).
 * Returns { selectedRider, assignmentMethod }.
 */
async function _selectRider(eligibleBoys, countsMap, vendorLocation, hasVendorCoords) {
    let selectedRider = null;
    let assignmentMethod = '';

    // Priority 1: Google Maps Distance Matrix API
    const useGoogleMaps = process.env.USE_GOOGLE_MAPS_ASSIGNMENT === 'true';
    const googleApiKey  = process.env.GOOGLE_MAPS_API_KEY;

    if (useGoogleMaps && googleApiKey && hasVendorCoords) {
        try {
            const candidatesWithLoc = eligibleBoys.filter(b => b.currentLocation?.coordinates?.length === 2);
            if (candidatesWithLoc.length > 0) {
                const origins     = candidatesWithLoc.map(b => `${b.currentLocation.coordinates[1]},${b.currentLocation.coordinates[0]}`);
                const destination = `${vendorLocation.coordinates[1]},${vendorLocation.coordinates[0]}`;
                const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origins.join('|')}&destinations=${destination}&key=${googleApiKey}`;

                const response = await fetch(url);
                if (response.ok) {
                    const data = await response.json();
                    if (data.status === 'OK' && data.rows?.[0]?.elements) {
                        const elements = data.rows[0].elements;
                        const ranked = candidatesWithLoc.map((db, idx) => {
                            const element     = elements[idx];
                            const activeCount = countsMap[String(db._id)] || 0;
                            const eta         = element?.status === 'OK' ? element.duration.value : 999999;
                            const roadDist    = element?.status === 'OK' ? element.distance.value  : 999999;
                            return { ...db, eta, activeCount, distance: roadDist };
                        }).sort((a, b) => {
                            if (a.eta !== b.eta)           return a.eta - b.eta;
                            if (a.activeCount !== b.activeCount) return a.activeCount - b.activeCount;
                            return a.distance - b.distance;
                        });
                        selectedRider    = ranked[0];
                        assignmentMethod = 'Google Maps API';
                    }
                }
            }
        } catch (err) {
            console.warn(`[Auto Assign] Google Maps matching failed. Falling back to 2dsphere.`, err.message);
        }
    }

    // Priority 2: MongoDB 2dsphere proximity
    if (!selectedRider && hasVendorCoords) {
        try {
            const boysNear = await DeliveryBoy.find({
                _id: { $in: eligibleBoys.map(eb => eb._id) },
                currentLocation: {
                    $near: { $geometry: vendorLocation, $maxDistance: 10000 },
                },
            }).lean();

            if (boysNear.length > 0) {
                const ranked = boysNear.map(db => {
                    const activeCount = countsMap[String(db._id)] || 0;
                    const distance    = calculateDistance(
                        vendorLocation.coordinates[1], vendorLocation.coordinates[0],
                        db.currentLocation.coordinates[1], db.currentLocation.coordinates[0]
                    );
                    return { ...db, activeCount, distance };
                }).sort((a, b) => {
                    if (a.activeCount !== b.activeCount) return a.activeCount - b.activeCount;
                    return a.distance - b.distance;
                });
                selectedRider    = ranked[0];
                assignmentMethod = 'MongoDB 2dsphere fallback';
            }
        } catch (err) {
            logger.error(`[Auto Assign] MongoDB 2dsphere query failed:`, err.message);
        }
    }

    // Priority 3: General fallback (least active)
    if (!selectedRider) {
        console.log(`[Auto Assign Fallback] Distance matching returned no riders. Selecting first available rider.`);
        const ranked = eligibleBoys
            .map(db => ({ ...db, activeCount: countsMap[String(db._id)] || 0 }))
            .sort((a, b) => a.activeCount - b.activeCount);
        if (ranked.length > 0) {
            selectedRider    = ranked[0];
            assignmentMethod = 'General available fallback';
        }
    }

    return { selectedRider, assignmentMethod };
}


export const autoAssignReturnPickupPartner = async (returnRequestId) => {
    try {
        const returnRequest = await ReturnRequest.findById(returnRequestId);
        if (!returnRequest) return;

        // Skip if request is rejected, completed, or already accepted/assigned
        if (['rejected', 'completed', 'pickup_assigned', 'picked_up', 'delivered_to_vendor'].includes(returnRequest.status)) return;
        if (returnRequest.deliveryAssignmentStatus === 'accepted') return;

        // 1. Identify the vendor and get their location
        const vendor = await Vendor.findById(returnRequest.vendorId);
        if (!vendor) {
            logger.error(`[Auto Assign Return] Vendor not found: ${returnRequest.vendorId} for return request ${returnRequest._id}`);
            returnRequest.deliveryAssignmentStatus = 'failed';
            await returnRequest.save();
            return;
        }

        // Validate vendor has GeoJSON coordinates
        const vendorLocation = vendor.address?.location;
        const hasVendorCoords = vendorLocation?.coordinates?.length === 2;

        // 2. Fetch all online, active, approved delivery boys
        const query = {
            status: 'available',
            isActive: true,
            applicationStatus: 'approved',
            _id: { $nin: returnRequest.rejectedDeliveryBoys || [] }
        };

        const deliveryBoys = await DeliveryBoy.find(query).lean();
        if (deliveryBoys.length === 0) {
            console.log(`[Auto Assign Return] No available delivery boys found for return request ${returnRequest._id}`);
            returnRequest.deliveryAssignmentStatus = 'failed';
            await returnRequest.save();
            return;
        }

        // 3. Find active tasks (orders + returns) count for capacity matching
        const driverIds = deliveryBoys.map(d => d._id);
        const [activeOrdersCounts, activeReturnsCounts] = await Promise.all([
            Order.aggregate([
                { 
                    $match: { 
                        deliveryBoyId: { $in: driverIds }, 
                        status: { $in: ['pending', 'processing', 'ready_for_pickup', 'accepted', 'assigned'] } 
                    } 
                },
                { $group: { _id: '$deliveryBoyId', count: { $sum: 1 } } }
            ]),
            ReturnRequest.aggregate([
                {
                    $match: {
                        deliveryBoyId: { $in: driverIds },
                        status: { $in: ['pickup_pending', 'pickup_assigned', 'picked_up'] }
                    }
                },
                { $group: { _id: '$deliveryBoyId', count: { $sum: 1 } } }
            ])
        ]);

        const countsMap = {};
        activeOrdersCounts.forEach(row => {
            countsMap[String(row._id)] = (countsMap[String(row._id)] || 0) + row.count;
        });
        activeReturnsCounts.forEach(row => {
            countsMap[String(row._id)] = (countsMap[String(row._id)] || 0) + row.count;
        });

        // Filter out couriers who are at capacity
        const eligibleBoys = deliveryBoys.filter(db => {
            const activeCount = countsMap[String(db._id)] || 0;
            const maxLimit = typeof db.maxActiveOrders === 'number' ? db.maxActiveOrders : 3;
            return activeCount < maxLimit;
        });

        if (eligibleBoys.length === 0) {
            console.log(`[Auto Assign Return] No delivery boys have capacity for return request ${returnRequest._id}`);
            returnRequest.deliveryAssignmentStatus = 'failed';
            await returnRequest.save();
            return;
        }

        let selectedRider = null;
        let assignmentMethod = '';

        // Match based on proximity to the Vendor (since geocoded customer coordinates are not stored in Phase 1)
        if (hasVendorCoords) {
            try {
                const boysNear = await DeliveryBoy.find({
                    _id: { $in: eligibleBoys.map(eb => eb._id) },
                    currentLocation: {
                        $near: {
                            $geometry: vendorLocation,
                            $maxDistance: 10000 // 10 km
                        }
                    }
                }).lean();

                if (boysNear.length > 0) {
                    const ranked = boysNear.map(db => {
                        const activeCount = countsMap[String(db._id)] || 0;
                        const distance = calculateDistance(
                            vendorLocation.coordinates[1],
                            vendorLocation.coordinates[0],
                            db.currentLocation.coordinates[1],
                            db.currentLocation.coordinates[0]
                        );

                        return {
                            ...db,
                            activeCount,
                            distance
                        };
                    }).sort((a, b) => {
                        if (a.activeCount !== b.activeCount) return a.activeCount - b.activeCount;
                        return a.distance - b.distance;
                    });

                    selectedRider = ranked[0];
                    assignmentMethod = 'Proximity to Vendor location';
                }
            } catch (err) {
                logger.error(`[Auto Assign Return] 2dsphere proximity query failed:`, err.message);
            }
        }

        // Fallback: select available rider with least tasks
        if (!selectedRider) {
            const ranked = eligibleBoys.map(db => {
                const activeCount = countsMap[String(db._id)] || 0;
                return { ...db, activeCount };
            }).sort((a, b) => a.activeCount - b.activeCount);

            if (ranked.length > 0) {
                selectedRider = ranked[0];
                assignmentMethod = 'General capacity fallback';
            }
        }

        if (!selectedRider) {
            console.log(`[Auto Assign Return] Failed to match a delivery partner for return ${returnRequest._id}`);
            returnRequest.deliveryBoyId = undefined;
            returnRequest.deliveryAssignmentStatus = 'failed';
            await returnRequest.save();
            return;
        }

        // Update return request assignment fields
        returnRequest.deliveryBoyId = selectedRider._id;
        returnRequest.deliveryAssignmentStatus = 'assigned';
        if (returnRequest.status === 'approved') {
            returnRequest.status = 'pickup_pending';
        }
        await returnRequest.save();

        console.log(`[Auto Assign Return] Return request ${returnRequest._id} assigned to ${selectedRider.name} via ${assignmentMethod}`);

        // Dispatch notification to delivery partner
        const itemsText = buildReturnItemsSummary(returnRequest.items);
        await createNotification({
            recipientId: selectedRider._id,
            recipientType: 'delivery',
            title: 'New return pickup offer',
            message: `You have been offered a return pickup request from customer for vendor [${vendor.storeName || vendor.shopName}]. Please accept or reject within 5 minutes.${itemsText}`,
            type: 'order',
            data: {
                returnRequestId: String(returnRequest._id),
                assignedAt: new Date().toISOString()
            }
        });

    } catch (err) {
        logger.error(`[Auto Assign Return] Error:`, err.message);
    }
};

export const autoAssignExchangeReplacementPartner = async (returnRequestId) => {
    try {
        const returnRequest = await ReturnRequest.findById(returnRequestId);
        if (!returnRequest) return;

        // Skip if not in replacement_ready state or already assigned/completed
        if (returnRequest.status !== 'replacement_ready') return;
        if (returnRequest.deliveryAssignmentStatus === 'accepted') return;

        // 1. Identify the vendor and get their location
        const vendor = await Vendor.findById(returnRequest.vendorId);
        if (!vendor) {
            logger.error(`[Auto Assign Replacement] Vendor not found: ${returnRequest.vendorId}`);
            returnRequest.deliveryAssignmentStatus = 'failed';
            await returnRequest.save();
            return;
        }

        const vendorLocation = vendor.address?.location;
        const hasVendorCoords = vendorLocation?.coordinates?.length === 2;

        // 2. Fetch active delivery boys
        const query = {
            status: 'available',
            isActive: true,
            applicationStatus: 'approved',
            _id: { $nin: returnRequest.rejectedDeliveryBoys || [] }
        };

        const deliveryBoys = await DeliveryBoy.find(query).lean();
        if (deliveryBoys.length === 0) {
            console.log(`[Auto Assign Replacement] No available delivery boys found for return request ${returnRequest._id}`);
            returnRequest.deliveryAssignmentStatus = 'failed';
            await returnRequest.save();
            return;
        }

        // 3. Aggregate capacity counts
        const driverIds = deliveryBoys.map(d => d._id);
        const [activeOrdersCounts, activeReturnsCounts] = await Promise.all([
            Order.aggregate([
                { 
                    $match: { 
                        deliveryBoyId: { $in: driverIds }, 
                        status: { $in: ['pending', 'processing', 'ready_for_pickup', 'accepted', 'assigned'] } 
                    } 
                },
                { $group: { _id: '$deliveryBoyId', count: { $sum: 1 } } }
            ]),
            ReturnRequest.aggregate([
                {
                    $match: {
                        deliveryBoyId: { $in: driverIds },
                        status: { $in: ['pickup_pending', 'pickup_assigned', 'picked_up', 'replacement_ready', 'replacement_assigned', 'out_for_delivery'] }
                    }
                },
                { $group: { _id: '$deliveryBoyId', count: { $sum: 1 } } }
            ])
        ]);

        const countsMap = {};
        activeOrdersCounts.forEach(row => {
            countsMap[String(row._id)] = (countsMap[String(row._id)] || 0) + row.count;
        });
        activeReturnsCounts.forEach(row => {
            countsMap[String(row._id)] = (countsMap[String(row._id)] || 0) + row.count;
        });

        // Filter out couriers who are at capacity
        const eligibleBoys = deliveryBoys.filter(db => {
            const activeCount = countsMap[String(db._id)] || 0;
            const maxLimit = typeof db.maxActiveOrders === 'number' ? db.maxActiveOrders : 3;
            return activeCount < maxLimit;
        });

        if (eligibleBoys.length === 0) {
            console.log(`[Auto Assign Replacement] No delivery boys have capacity for return request ${returnRequest._id}`);
            returnRequest.deliveryAssignmentStatus = 'failed';
            await returnRequest.save();
            return;
        }

        let selectedRider = null;
        let assignmentMethod = '';

        // Match based on proximity to the Vendor
        if (hasVendorCoords) {
            try {
                const boysNear = await DeliveryBoy.find({
                    _id: { $in: eligibleBoys.map(eb => eb._id) },
                    currentLocation: {
                        $near: {
                            $geometry: vendorLocation,
                            $maxDistance: 10000 // 10 km
                        }
                    }
                }).lean();

                if (boysNear.length > 0) {
                    const ranked = boysNear.map(db => {
                        const activeCount = countsMap[String(db._id)] || 0;
                        const distance = calculateDistance(
                            vendorLocation.coordinates[1],
                            vendorLocation.coordinates[0],
                            db.currentLocation.coordinates[1],
                            db.currentLocation.coordinates[0]
                        );

                        return {
                            ...db,
                            activeCount,
                            distance
                        };
                    }).sort((a, b) => {
                        if (a.activeCount !== b.activeCount) return a.activeCount - b.activeCount;
                        return a.distance - b.distance;
                    });

                    selectedRider = ranked[0];
                    assignmentMethod = 'Proximity to Vendor location';
                }
            } catch (err) {
                logger.error(`[Auto Assign Replacement] Proximity query failed:`, err.message);
            }
        }

        // Fallback: select available rider with least tasks
        if (!selectedRider) {
            const ranked = eligibleBoys.map(db => {
                const activeCount = countsMap[String(db._id)] || 0;
                return { ...db, activeCount };
            }).sort((a, b) => a.activeCount - b.activeCount);

            if (ranked.length > 0) {
                selectedRider = ranked[0];
                assignmentMethod = 'General capacity fallback';
            }
        }

        if (!selectedRider) {
            console.log(`[Auto Assign Replacement] Failed to match a delivery partner for exchange replacement ${returnRequest._id}`);
            returnRequest.deliveryBoyId = undefined;
            returnRequest.deliveryAssignmentStatus = 'failed';
            await returnRequest.save();
            return;
        }

        // Update return request assignment fields
        returnRequest.deliveryBoyId = selectedRider._id;
        returnRequest.deliveryAssignmentStatus = 'assigned';
        returnRequest.status = 'replacement_assigned';
        await returnRequest.save();

        console.log(`[Auto Assign Replacement] Exchange replacement request ${returnRequest._id} assigned to ${selectedRider.name} via ${assignmentMethod}`);

        // Dispatch notification to delivery partner
        const itemsText = buildReturnItemsSummary(returnRequest.items);
        await createNotification({
            recipientId: selectedRider._id,
            recipientType: 'delivery',
            title: 'New replacement delivery offer',
            message: `You have been offered a replacement delivery request. Please pick up the product from vendor [${vendor.storeName || vendor.shopName}] and deliver to customer. Please accept or reject within 5 minutes.${itemsText}`,
            type: 'order',
            data: {
                returnRequestId: String(returnRequest._id),
                assignedAt: new Date().toISOString()
            }
        });

    } catch (err) {
        logger.error(`[Auto Assign Replacement] Error:`, err.message);
    }
};

/**
 * Unassign rider and cancel shipment delivery task.
 * Called when a vendor item/package is cancelled by customer or admin.
 */
export const cancelShipmentDeliveryAssignment = async (shipmentId, reason = 'Package cancelled', session = null) => {
    try {
        const shipment = await Shipment.findById(shipmentId).session(session);
        if (!shipment) return;

        const assignedRiderId = shipment.deliveryBoyId;

        // Update shipment status and assignment
        shipment.status = 'cancelled';
        shipment.deliveryAssignmentStatus = 'cancelled';
        shipment.deliveryBoyId = undefined;
        if (!Array.isArray(shipment.statusHistory)) {
            shipment.statusHistory = [];
        }
        shipment.statusHistory.push({
            status: 'cancelled',
            updatedAt: new Date(),
            updatedBy: 'system',
            notes: `Shipment cancelled: ${reason}`
        });

        if (session) {
            await shipment.save({ session });
        } else {
            await shipment.save();
        }

        // Notify assigned rider if rider was assigned
        if (assignedRiderId) {
            createNotification({
                recipientId: assignedRiderId,
                recipientType: 'delivery',
                title: 'Delivery Task Cancelled',
                message: `Delivery task for Shipment #${shipment.shipmentNumber || shipment._id} has been cancelled. Reason: ${reason}`,
                type: 'order',
                data: { shipmentId: String(shipment._id) }
            }).catch(err => console.error('[Rider Notification Error]:', err.message));
        }
    } catch (err) {
        logger.error(`[cancelShipmentDeliveryAssignment] Error:`, err.message);
        throw err;
    }
};


// ───────────────────────────────────────────────────────────────────────────────
// Polling scheduler for offer timeouts
// ───────────────────────────────────────────────────────────────────────────────

export const initAssignmentScheduler = () => {
    const TIMEOUT_INTERVAL_MS = 30000; // run every 30 seconds

    console.log('⏰ Automated Delivery Assignment Timeout Scheduler Initialized.');

    setInterval(async () => {
        try {
            const timeoutSeconds = Number(process.env.DELIVERY_ASSIGNMENT_TIMEOUT || 300);
            const timeoutLimit   = new Date(Date.now() - (timeoutSeconds * 1000));

            // ─ 1. Handle Shipment-based forward delivery timeouts (Phase 5.2+) ──
            //
            // Find Shipments whose assignment offer has expired without being accepted.
            const expiredShipments = await Shipment.find({
                deliveryAssignmentStatus: 'assigned',
                updatedAt: { $lt: timeoutLimit },
            }).select('_id shipmentNumber deliveryBoyId rejectedDeliveryBoys orderId');

            for (const shipment of expiredShipments) {
                console.log(
                    `[Assignment Timeout] Shipment ${shipment.shipmentNumber} offer to ` +
                    `Delivery Boy ${shipment.deliveryBoyId} expired. Re-routing.`
                );

                // Clear assignment and add rider to rejected list (atomic)
                await Shipment.findByIdAndUpdate(shipment._id, {
                    $set:  { deliveryBoyId: undefined, deliveryAssignmentStatus: 'pending' },
                    $push: { rejectedDeliveryBoys: shipment.deliveryBoyId },
                });

                // (Dual-write to Order removed in Phase 9.3)

                // Re-trigger Shipment-based assignment
                autoAssignDeliveryPartner(shipment._id);
            }

            // ─ 2. Handle Return Pickup timeouts (unchanged) ───────────────
            const expiredReturns = await ReturnRequest.find({
                status: 'pickup_pending',
                deliveryAssignmentStatus: 'assigned',
                updatedAt: { $lt: timeoutLimit },
            });

            for (const ret of expiredReturns) {
                console.log(`[Assignment Timeout] Return request ${ret._id} offer to Delivery Boy ${ret.deliveryBoyId} expired. Re-routing.`);

                ret.rejectedDeliveryBoys.push(ret.deliveryBoyId);
                ret.deliveryBoyId = undefined;
                ret.deliveryAssignmentStatus = 'pending';
                ret.status = 'pickup_pending';
                await ret.save();

                autoAssignReturnPickupPartner(ret._id);
            }

            // ─ 4. Handle Exchange Replacement timeouts (unchanged) ─────────
            const expiredReplacements = await ReturnRequest.find({
                status: 'replacement_assigned',
                deliveryAssignmentStatus: 'assigned',
                updatedAt: { $lt: timeoutLimit },
            });

            for (const ret of expiredReplacements) {
                console.log(`[Assignment Timeout] Exchange replacement ${ret._id} offer to Delivery Boy ${ret.deliveryBoyId} expired. Re-routing.`);

                ret.rejectedDeliveryBoys.push(ret.deliveryBoyId);
                ret.deliveryBoyId = undefined;
                ret.deliveryAssignmentStatus = 'pending';
                ret.status = 'replacement_ready';
                await ret.save();

                autoAssignExchangeReplacementPartner(ret._id);
            }

        } catch (err) {
            logger.error('[Assignment Timeout Scheduler] Error:', err.message);
        }
    }, TIMEOUT_INTERVAL_MS);
};
