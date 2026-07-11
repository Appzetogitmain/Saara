import Order from '../models/Order.model.js';
import DeliveryBoy from '../models/DeliveryBoy.model.js';
import Vendor from '../models/Vendor.model.js';
import ReturnRequest from '../models/ReturnRequest.model.js';
import { createNotification } from './notification.service.js';

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

export const autoAssignDeliveryPartner = async (orderId) => {
    try {
        const order = await Order.findById(orderId);
        if (!order || order.isDeleted) return;

        // Skip if order is cancelled, delivered, or already accepted
        if (['cancelled', 'returned', 'delivered'].includes(order.status)) return;
        if (order.deliveryAssignmentStatus === 'accepted' || order.deliveryAssignmentStatus === 'manual_override') return;

        // 1. Identify the vendor and get their location
        const vendorId = order.vendorItems?.[0]?.vendorId || order.items?.[0]?.vendorId;
        if (!vendorId) {
            console.error(`[Auto Assign] Vendor ID not found for order ${order._id}`);
            order.deliveryAssignmentStatus = 'failed';
            await order.save();
            return;
        }

        const vendor = await Vendor.findById(vendorId);
        if (!vendor) {
            console.error(`[Auto Assign] Vendor not found: ${vendorId} for order ${order._id}`);
            order.deliveryAssignmentStatus = 'failed';
            await order.save();
            return;
        }

        // Validate vendor has GeoJSON coordinates
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
            console.log(`[Auto Assign] No available delivery boys found for order ${order._id}`);
            order.deliveryAssignmentStatus = 'failed';
            await order.save();
            return;
        }

        // 3. For each candidate, find their active orders count
        const driverIds = deliveryBoys.map(d => d._id);
        const activeOrdersCounts = await Order.aggregate([
            { 
                $match: { 
                    deliveryBoyId: { $in: driverIds }, 
                    status: { $in: ['pending', 'processing', 'ready_for_pickup', 'accepted', 'assigned'] } 
                } 
            },
            { $group: { _id: '$deliveryBoyId', count: { $sum: 1 } } }
        ]);

        const countsMap = activeOrdersCounts.reduce((acc, row) => {
            acc[String(row._id)] = row.count;
            return acc;
        }, {});

        // Filter out couriers who are at or above capacity
        const eligibleBoys = deliveryBoys.filter(db => {
            const activeCount = countsMap[String(db._id)] || 0;
            const maxLimit = typeof db.maxActiveOrders === 'number' ? db.maxActiveOrders : 3;
            return activeCount < maxLimit;
        });

        if (eligibleBoys.length === 0) {
            console.log(`[Auto Assign] No delivery boys have available capacity for order ${order._id}`);
            order.deliveryAssignmentStatus = 'failed';
            await order.save();
            return;
        }

        let selectedRider = null;
        let assignmentMethod = '';

        // Priority 1: Google Maps Distance Matrix API
        const useGoogleMaps = process.env.USE_GOOGLE_MAPS_ASSIGNMENT === 'true';
        const googleApiKey = process.env.GOOGLE_MAPS_API_KEY;

        if (useGoogleMaps && googleApiKey && hasVendorCoords) {
            try {
                // Ensure candidates have locations
                const candidatesWithLoc = eligibleBoys.filter(b => b.currentLocation?.coordinates?.length === 2);
                if (candidatesWithLoc.length > 0) {
                    const origins = candidatesWithLoc.map(b => `${b.currentLocation.coordinates[1]},${b.currentLocation.coordinates[0]}`);
                    const destination = `${vendorLocation.coordinates[1]},${vendorLocation.coordinates[0]}`;
                    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origins.join('|')}&destinations=${destination}&key=${googleApiKey}`;
                    
                    const response = await fetch(url);
                    if (response.ok) {
                        const data = await response.json();
                        if (data.status === 'OK' && data.rows?.[0]?.elements) {
                            const elements = data.rows[0].elements;
                            
                            const ranked = candidatesWithLoc.map((db, idx) => {
                                const element = elements[idx];
                                const activeCount = countsMap[String(db._id)] || 0;
                                const eta = element?.status === 'OK' ? element.duration.value : 999999;
                                const roadDistance = element?.status === 'OK' ? element.distance.value : 999999;

                                return {
                                    ...db,
                                    eta,
                                    activeCount,
                                    distance: roadDistance
                                };
                            }).sort((a, b) => {
                                // 1. Sort by lowest ETA
                                if (a.eta !== b.eta) return a.eta - b.eta;
                                // 2. Sort by lowest active order count
                                if (a.activeCount !== b.activeCount) return a.activeCount - b.activeCount;
                                // 3. Sort by shortest distance
                                return a.distance - b.distance;
                            });

                            selectedRider = ranked[0];
                            assignmentMethod = 'Google Maps API';
                        }
                    }
                }
            } catch (err) {
                console.warn(`[Auto Assign] Google Maps matching failed. Falling back to MongoDB 2dsphere. Reason:`, err.message);
            }
        }

        // Priority 2: MongoDB 2dsphere Fallback
        if (!selectedRider && hasVendorCoords) {
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
                        // 1. Sort by lowest active order count
                        if (a.activeCount !== b.activeCount) return a.activeCount - b.activeCount;
                        // 2. Sort by nearest distance
                        return a.distance - b.distance;
                    });

                    selectedRider = ranked[0];
                    assignmentMethod = 'MongoDB 2dsphere fallback';
                }
            } catch (err) {
                console.error(`[Auto Assign] MongoDB 2dsphere query failed:`, err.message);
            }
        }

        // Priority 3: General Online Rider Fallback (e.g. for testing when coordinates are missing or far)
        if (!selectedRider) {
            try {
                console.log(`[Auto Assign Fallback] Distance matching returned no riders. Selecting first available online rider.`);
                const ranked = eligibleBoys.map(db => {
                    const activeCount = countsMap[String(db._id)] || 0;
                    return {
                        ...db,
                        activeCount
                    };
                }).sort((a, b) => a.activeCount - b.activeCount);

                if (ranked.length > 0) {
                    selectedRider = ranked[0];
                    assignmentMethod = 'General available fallback';
                }
            } catch (err) {
                console.error(`[Auto Assign] General fallback failed:`, err.message);
            }
        }

        // If no courier matched or fallback failed
        if (!selectedRider) {
            console.log(`[Auto Assign] Failed to match a delivery partner for order ${order._id}`);
            order.deliveryBoyId = undefined;
            order.deliveryAssignmentStatus = 'failed';
            await order.save();
            return;
        }

        // Update order assignment
        order.deliveryBoyId = selectedRider._id;
        order.deliveryAssignmentStatus = 'assigned';

        let distanceInKm = 0;
        if (selectedRider.distance !== undefined) {
            distanceInKm = assignmentMethod === 'Google Maps API' ? parseFloat((selectedRider.distance / 1000).toFixed(2)) : parseFloat(selectedRider.distance.toFixed(2));
        }
        order.distance = distanceInKm;

        await order.save();

        console.log(`[Auto Assign] Order ${order.orderId || order._id} assigned to ${selectedRider.name} via ${assignmentMethod}`);

        // Dispatch Notification
        // Generate detailed summaries of items and vendors for the notification alert
        const itemsSummary = (order.items || [])
            .map((item) => `${item.name} (x${item.quantity})`)
            .join(', ');
        const vendorsSummary = (order.vendorItems || [])
            .map((v) => v.vendorName)
            .join(', ');
        const richOfferMessage = `You have been offered order ${order.orderId || order._id} containing [${itemsSummary}] from [${vendorsSummary}]. Please accept or reject within 5 minutes.`;

        await createNotification({
            recipientId: selectedRider._id,
            recipientType: 'delivery',
            title: 'New order offer',
            message: richOfferMessage,
            type: 'order',
            data: {
                orderId: String(order.orderId || order._id),
                assignedAt: new Date().toISOString()
            }
        });

    } catch (err) {
        console.error(`[Auto Assign] Error during auto-assignment:`, err.message);
    }
};

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
            console.error(`[Auto Assign Return] Vendor not found: ${returnRequest.vendorId} for return request ${returnRequest._id}`);
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
                console.error(`[Auto Assign Return] 2dsphere proximity query failed:`, err.message);
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
        await createNotification({
            recipientId: selectedRider._id,
            recipientType: 'delivery',
            title: 'New return pickup offer',
            message: `You have been offered a return pickup request from customer for vendor [${vendor.storeName || vendor.shopName}]. Please accept or reject within 5 minutes.`,
            type: 'order',
            data: {
                returnRequestId: String(returnRequest._id),
                assignedAt: new Date().toISOString()
            }
        });

    } catch (err) {
        console.error(`[Auto Assign Return] Error:`, err.message);
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
            console.error(`[Auto Assign Replacement] Vendor not found: ${returnRequest.vendorId}`);
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
                console.error(`[Auto Assign Replacement] Proximity query failed:`, err.message);
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
        await createNotification({
            recipientId: selectedRider._id,
            recipientType: 'delivery',
            title: 'New replacement delivery offer',
            message: `You have been offered a replacement delivery request. Please pick up the product from vendor [${vendor.storeName || vendor.shopName}] and deliver to customer. Please accept or reject within 5 minutes.`,
            type: 'order',
            data: {
                returnRequestId: String(returnRequest._id),
                assignedAt: new Date().toISOString()
            }
        });

    } catch (err) {
        console.error(`[Auto Assign Replacement] Error:`, err.message);
    }
};

// Polling scheduler for offer timeouts
export const initAssignmentScheduler = () => {
    const TIMEOUT_INTERVAL_MS = 30000; // run every 30 seconds

    console.log('⏰ Automated Delivery Assignment Timeout Scheduler Initialized.');

    setInterval(async () => {
        try {
            const timeoutSeconds = Number(process.env.DELIVERY_ASSIGNMENT_TIMEOUT || 300);
            const timeoutLimit = new Date(Date.now() - (timeoutSeconds * 1000));

            // 1. Handle Forward Delivery timeouts
            const expiredOrders = await Order.find({
                deliveryAssignmentStatus: 'assigned',
                updatedAt: { $lt: timeoutLimit },
                isDeleted: { $ne: true }
            });

            for (const order of expiredOrders) {
                console.log(`[Assignment Timeout] Order ${order.orderId || order._id} offer to Delivery Boy ${order.deliveryBoyId} expired. Re-routing.`);

                order.rejectedDeliveryBoys.push(order.deliveryBoyId);
                order.deliveryBoyId = undefined;
                order.deliveryAssignmentStatus = 'pending';
                await order.save();

                autoAssignDeliveryPartner(order._id);
            }

            // 2. Handle Return Pickup timeouts
            const expiredReturns = await ReturnRequest.find({
                status: 'pickup_pending',
                deliveryAssignmentStatus: 'assigned',
                updatedAt: { $lt: timeoutLimit }
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

            // 3. Handle Exchange Replacement timeouts
            const expiredReplacements = await ReturnRequest.find({
                status: 'replacement_assigned',
                deliveryAssignmentStatus: 'assigned',
                updatedAt: { $lt: timeoutLimit }
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
            console.error('[Assignment Timeout Scheduler] Error:', err.message);
        }
    }, TIMEOUT_INTERVAL_MS);
};
