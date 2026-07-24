import { asyncHandler } from '../../../utils/asyncHandler.js';
import ApiError from '../../../utils/ApiError.js';
import { ApiResponse } from '../../../utils/ApiResponse.js';
import Shipment from '../../../models/Shipment.model.js';
import Order from '../../../models/Order.model.js';
import logisticsEventBus from '../../../events/logisticsEventBus.js';
import { LOGISTICS_EVENTS } from '../../../events/logisticsEvents.js';
import EventDispatcher from '../../../services/eventDispatcher.service.js';

// Status Mapping: Shiprocket -> Saara internal Shipment status
const SHIPROCKET_STATUS_MAP = {
    'NEW': 'pending',
    'AWB ASSIGNED': 'assigned',
    'PICKUP SCHEDULED': 'assigned',
    'OUT FOR PICKUP': 'assigned',
    'PICKED UP': 'shipped',
    'IN TRANSIT': 'shipped',
    'OUT FOR DELIVERY': 'out_for_delivery',
    'DELIVERED': 'delivered',
    'CANCELED': 'cancelled',
    'RTO INITIATED': 'return_initiated',
    'RTO DELIVERED': 'returned',
    'UNDELIVERED': 'failed'
};

const REVERSE_SHIPROCKET_STATUS_MAP = {
    'NEW': 'processing',
    'AWB ASSIGNED': 'pickup_scheduled',
    'PICKUP SCHEDULED': 'pickup_scheduled',
    'OUT FOR PICKUP': 'pickup_scheduled',
    'PICKED UP': 'picked_up',
    'IN TRANSIT': 'in_transit',
    'OUT FOR DELIVERY': 'in_transit',
    'DELIVERED': 'delivered',
    'CANCELED': 'failed',
    'UNDELIVERED': 'failed'
};

export const handleShiprocketWebhook = asyncHandler(async (req, res) => {
    // 1. Authenticate webhook token
    const token = req.headers['x-api-key'] || req.query.token;
    if (process.env.SHIPROCKET_WEBHOOK_TOKEN && token !== process.env.SHIPROCKET_WEBHOOK_TOKEN) {
        throw new ApiError(401, 'Unauthorized webhook access');
    }

    let payload;
    try {
        // Express.raw() is used, so req.body is a Buffer
        payload = JSON.parse(req.body.toString());
    } catch (err) {
        throw new ApiError(400, 'Invalid JSON payload');
    }

    const { awb, current_status, order_id } = payload;
    if (!awb && !order_id) {
        throw new ApiError(400, 'Missing awb or order_id');
    }

    // 2. Find Shipment
    const query = awb ? { awbCode: awb } : { 'providerMetadata.shiprocketOrderId': order_id };
    const shipment = await Shipment.findOne(query);

    if (!shipment) {
        console.warn(`[Webhook] Shiprocket shipment not found for AWB: ${awb}, OrderId: ${order_id}`);
        // Return 200 so Shiprocket doesn't retry infinitely for unknown shipments
        return res.status(200).json(new ApiResponse(200, null, 'Shipment not found, ignored'));
    }

    const rawStatus = (current_status || '').toUpperCase();
    const isReverse = shipment.type === 'reverse';
    const mappedStatus = isReverse ? REVERSE_SHIPROCKET_STATUS_MAP[rawStatus] : SHIPROCKET_STATUS_MAP[rawStatus];

    // Persist raw provider information
    const newHistoryEntry = {
        status: mappedStatus || shipment.status,
        updatedBy: 'webhook',
        notes: 'Shiprocket Webhook Update',
        providerStatus: rawStatus,
        providerPayload: payload
    };
    shipment.statusHistory.push(newHistoryEntry);

    let isNewlyDelivered = false;
    let stateChanged = false;

    if (mappedStatus) {
        // 3. Idempotency & Out-of-Order Check
        const terminalStatuses = ['delivered', 'cancelled', 'returned', 'failed'];
        
        if (terminalStatuses.includes(shipment.status) && !terminalStatuses.includes(mappedStatus)) {
            console.warn(`[Webhook] Ignoring out-of-order status ${mappedStatus} for already ${shipment.status} shipment ${shipment._id}`);
        } else if (isReverse) {
            // Strict State Guards for Reverse Logistics
            const stateRank = {
                'processing': 0,
                'pickup_scheduled': 1,
                'picked_up': 2,
                'in_transit': 3,
                'delivered': 4,
                'failed': 5
            };
            const currentRank = stateRank[shipment.status] || 0;
            const newRank = stateRank[mappedStatus] || 0;
            
            if (newRank < currentRank && mappedStatus !== 'failed') {
                console.warn(`[Webhook] Ignoring backward transition from ${shipment.status} to ${mappedStatus} for shipment ${shipment._id}`);
            } else if (shipment.status !== mappedStatus) {
                shipment.status = mappedStatus;
                stateChanged = true;
                
                if (mappedStatus === 'delivered' && !shipment.deliveredAt) {
                    shipment.deliveredAt = new Date();
                    isNewlyDelivered = true;
                } else if (mappedStatus === 'picked_up' && !shipment.pickedUpAt) {
                    shipment.pickedUpAt = new Date();
                }
            }
        } else if (shipment.status !== mappedStatus) {
            // Forward Shipment logic
            shipment.status = mappedStatus;
            stateChanged = true;
            
            // Timestamps
            if (mappedStatus === 'delivered' && !shipment.deliveredAt) {
                shipment.deliveredAt = new Date();
                isNewlyDelivered = true;
            } else if (mappedStatus === 'cancelled' && !shipment.cancelledAt) {
                shipment.cancelledAt = new Date();
            } else if (mappedStatus === 'return_initiated' && !shipment.returnInitiatedAt) {
                shipment.returnInitiatedAt = new Date();
            }
        }
    }

    shipment.lastTrackedAt = new Date();
    await shipment.save();

    // 4. Trigger Events
    if (isReverse && stateChanged) {
        // Use domain-agnostic EventDispatcher for reverse workflow
        EventDispatcher.dispatch('REVERSE_SHIPMENT_UPDATED', {
            shipmentId: shipment._id,
            returnRequestId: shipment.returnRequestId,
            status: shipment.status,
            trackingNumber: shipment.awbCode
        });
    } else if (!isReverse && isNewlyDelivered) {
        const order = await Order.findById(shipment.orderId).lean();
        logisticsEventBus.emit(LOGISTICS_EVENTS.SHIPMENT_DELIVERED, {
            orderId: shipment.orderId,
            shipmentId: shipment._id,
            shipmentNumber: shipment.shipmentNumber,
            vendorId: shipment.vendorId,
            providerId: shipment.providerId,
            deliveredAt: shipment.deliveredAt,
            paymentMethod: order?.paymentMethod || 'prepaid'
        });
    }

    res.status(200).json(new ApiResponse(200, null, 'Webhook processed successfully'));
});
