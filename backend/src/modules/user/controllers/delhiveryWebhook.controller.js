import { asyncHandler } from '../../../utils/asyncHandler.js';
import ApiError from '../../../utils/ApiError.js';
import { ApiResponse } from '../../../utils/ApiResponse.js';
import Shipment from '../../../models/Shipment.model.js';
import Order from '../../../models/Order.model.js';
import logisticsEventBus from '../../../events/logisticsEventBus.js';
import { LOGISTICS_EVENTS } from '../../../events/logisticsEvents.js';
import EventDispatcher from '../../../services/eventDispatcher.service.js';

// Status Mapping: Delhivery -> Saara internal Shipment status
// Note: Delhivery's webhook payload statuses can vary slightly.
const DELHIVERY_STATUS_MAP = {
    'DISPATCHED': 'shipped',
    'IN TRANSIT': 'in_transit',
    'PENDING': 'pending',
    'DELIVERED': 'delivered',
    'CANCELED': 'cancelled',
    'RETURNED': 'returned',
    'RTO': 'returned',
    'UNDELIVERED': 'failed',
    'PICKED UP': 'picked_up'
};

const REVERSE_DELHIVERY_STATUS_MAP = {
    'DISPATCHED': 'in_transit',
    'IN TRANSIT': 'in_transit',
    'PENDING': 'processing',
    'DELIVERED': 'delivered',
    'CANCELED': 'failed',
    'RETURNED': 'failed',
    'RTO': 'failed',
    'UNDELIVERED': 'failed',
    'PICKED UP': 'picked_up'
};

export const handleDelhiveryWebhook = asyncHandler(async (req, res) => {
    // 1. Authenticate webhook (Optional depending on Delhivery configuration)
    // Delhivery usually doesn't send auth headers, you configure the webhook URL secretly.
    // If you add a ?token=XYZ query param, verify it here.
    const token = req.query.token;
    if (process.env.DELHIVERY_WEBHOOK_TOKEN && token !== process.env.DELHIVERY_WEBHOOK_TOKEN) {
        throw new ApiError(401, 'Unauthorized webhook access');
    }

    let payload;
    try {
        // Express.raw() is used, so req.body is a Buffer
        const bodyString = req.body.toString();
        // Delhivery might send JSON stringified twice or form-data, handling standard JSON.
        payload = JSON.parse(bodyString);
    } catch (err) {
        throw new ApiError(400, 'Invalid JSON payload');
    }

    // Delhivery typically sends: { "Shipment": { "AWB": "12345", "Status": { "Status": "Delivered" } } }
    // Structure might vary, adapt safely.
    const awb = payload.Shipment?.AWB || payload.waybill;
    const current_status = payload.Shipment?.Status?.Status || payload.status;
    
    if (!awb) {
        throw new ApiError(400, 'Missing AWB in webhook payload');
    }

    // 2. Find Shipment
    const shipment = await Shipment.findOne({ awbCode: awb });

    if (!shipment) {
        console.warn(`[Webhook] Delhivery shipment not found for AWB: ${awb}`);
        // Return 200 so Delhivery doesn't retry infinitely for unknown shipments
        return res.status(200).json(new ApiResponse(200, null, 'Shipment not found, ignored'));
    }

    const rawStatus = (current_status || '').toUpperCase();
    const isReverse = shipment.type === 'reverse';
    const mappedStatus = isReverse ? REVERSE_DELHIVERY_STATUS_MAP[rawStatus] : DELHIVERY_STATUS_MAP[rawStatus];

    // Persist raw provider information
    const newHistoryEntry = {
        status: mappedStatus || shipment.status,
        updatedBy: 'webhook',
        notes: 'Delhivery Webhook Update',
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
            } else if (mappedStatus === 'returned' && !shipment.returnInitiatedAt) {
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

    res.status(200).json(new ApiResponse(200, null, 'Delhivery Webhook processed successfully'));
});
