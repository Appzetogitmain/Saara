/**
 * Listener: SHIPMENT_CANCELLED
 *
 * Fires when any shipment is cancelled — by customer, admin, or courier webhook.
 *
 * ─── Phase 3 (Current) ───────────────────────────────────────────────────────
 * STUB: Logs event receipt.
 *
 * ─── Phase 5/6 Business Logic (to implement) ─────────────────────────────────
 *   1. NOTIFICATION:
 *      → Notify customer: "Your order has been cancelled."
 *      → Notify vendor: "Order #X cancelled."
 *
 *   2. REFUND (if refundRequired):
 *      → Initiate Razorpay refund for online payment orders
 *      → For wallet payments: credit user wallet
 *
 *   3. ESCROW:
 *      → If Commission.escrowStatus === 'held': set to 'refund_processing'
 *      → Do NOT release to vendor
 *
 *   4. OWN FLEET:
 *      → If driver assigned: unassign, set DeliveryBoy.isAvailable = true
 *
 *   5. COURIER:
 *      → If AWB issued: call provider.cancelShipment() (Phase 6)
 *
 * ─── Expected Payload ────────────────────────────────────────────────────────
 * {
 *   shipmentId:     ObjectId (string)
 *   orderId:        ObjectId (string)
 *   vendorId:       ObjectId (string)
 *   cancelledBy:    string   ('customer' | 'vendor' | 'admin' | 'system' | 'courier_webhook')
 *   reason:         string
 *   refundRequired: boolean
 * }
 */

import LOGISTICS_EVENTS from '../logisticsEvents.js';
import Shipment from '../../models/Shipment.model.js';
import DeliveryBoy from '../../models/DeliveryBoy.model.js';
import Commission from '../../models/Commission.model.js';
import Order from '../../models/Order.model.js';
import logger from '../../utils/logger.js';
import { createNotification } from '../../services/notification.service.js';
import { initiateRefund } from '../../services/payment.service.js';
import Refund from '../../models/Refund.model.js';

const shipmentCancelledListener = async (payload) => {
    try {
        logger.info(`[${LOGISTICS_EVENTS.SHIPMENT_CANCELLED}] Received: orderId=${payload.orderId} cancelledBy=${payload.cancelledBy} refundRequired=${payload.refundRequired}`);

        const shipment = await Shipment.findById(payload.shipmentId);
        
        // 1. Unassign driver if own fleet
        if (shipment?.deliveryBoyId) {
            await DeliveryBoy.findByIdAndUpdate(shipment.deliveryBoyId, {
                isAvailable: true,
                currentShipmentId: null
            });
        }

        // 2. Set Commission.escrowStatus = 'refund_processing'
        const commission = await Commission.findOne({ orderId: payload.orderId });
        if (commission && commission.escrowStatus === 'held') {
            commission.escrowStatus = 'refund_processing';
            await commission.save();
        }

        // 3. Notification
        const order = await Order.findById(payload.orderId);
        if (order?.userId) {
            await createNotification({
                recipientId: order.userId,
                type: 'ORDER_CANCELLED',
                title: 'Order Cancelled',
                message: `Your order #${order._id} has been cancelled.`,
                metadata: { orderId: order._id }
            });
        }
        if (payload.vendorId) {
            await createNotification({
                recipientId: payload.vendorId,
                type: 'ORDER_CANCELLED',
                title: 'Order Cancelled',
                message: `Order #${payload.orderId} has been cancelled.`,
                metadata: { orderId: payload.orderId }
            });
        }

        // 4. Initiate Refund
        if (payload.refundRequired && order && order.paymentStatus === 'paid') {
            try {
                // If the entire order is cancelled, we could refund the total.
                // In a production app, we would calculate the exact refund amount per shipment.
                // Here we will log and assume a manual process or an exact shipment refund if implemented.
                logger.info(`[SHIPMENT_CANCELLED] Refund needed for order ${order._id}`);
                
                // If it was a Razorpay payment, find the Payment attempt
                const PaymentAttempt = (await import('../../models/PaymentAttempt.model.js')).default;
                const attempt = await PaymentAttempt.findOne({ razorpayOrderId: order.paymentGatewayOrderId, status: 'paid' });
                
                if (attempt && attempt.razorpayPaymentId) {
                    const rzpRefund = await initiateRefund(attempt.razorpayPaymentId, order.total, { reason: 'shipment_cancelled' });
                    await Refund.create({
                        userId: order.userId,
                        orderId: order._id,
                        amount: order.total,
                        method: 'razorpay',
                        status: 'completed',
                        razorpayRefundId: rzpRefund.id,
                        reason: 'Shipment Cancelled'
                    });
                    logger.info(`[SHIPMENT_CANCELLED] Refund initiated successfully for order ${order._id}`);
                }

            } catch (refundErr) {
                logger.error(`[SHIPMENT_CANCELLED] Refund initiation failed: ${refundErr.message}`);
            }
        }

        // 5. Courier provider cancellation
        if (shipment && shipment.providerId && shipment.providerId !== 'own_fleet' && (shipment.awbCode || shipment.providerOrderId)) {
            logger.info(`[SHIPMENT_CANCELLED] Initiating API cancellation for ${shipment.providerId} AWB/OrderId ${shipment.awbCode || shipment.providerOrderId}`);
            try {
                let providerModule;
                if (shipment.providerId === 'shiprocket') {
                    providerModule = await import('../../providers/shiprocket.provider.js');
                } else if (shipment.providerId === 'delhivery') {
                    providerModule = await import('../../providers/delhivery.provider.js');
                }

                if (providerModule && providerModule.default) {
                    const provider = providerModule.default;
                    // Format shipment slightly if provider cancelShipment expects trackingNumber
                    // Delhivery looks at shipment.trackingNumber for the AWB
                    const shipArg = {
                        ...shipment.toObject(),
                        trackingNumber: shipment.awbCode
                    };
                    const cancelRes = await provider.cancelShipment(shipArg);

                    if (cancelRes.success) {
                        logger.info(`[SHIPMENT_CANCELLED] Successfully cancelled ${shipment.providerId} pickup for ${shipment.shipmentNumber}`);
                        shipment.statusHistory.push({
                            status: shipment.status,
                            updatedBy: 'system',
                            notes: `Courier pickup successfully cancelled on ${shipment.providerId}`
                        });
                        await shipment.save();
                    } else {
                        logger.warn(`[SHIPMENT_CANCELLED] Failed to cancel ${shipment.providerId} pickup: ${cancelRes.error?.message}`);
                        shipment.statusHistory.push({
                            status: shipment.status,
                            updatedBy: 'system',
                            notes: `Courier pickup cancellation failed: ${cancelRes.error?.message}`
                        });
                        await shipment.save();
                    }
                } else {
                    logger.warn(`[SHIPMENT_CANCELLED] Provider module for ${shipment.providerId} not found`);
                }
            } catch (apiErr) {
                logger.error(`[SHIPMENT_CANCELLED] Courier API error during cancellation: ${apiErr.message}`);
            }
        }

    } catch (err) {
        logger.error(`[${LOGISTICS_EVENTS.SHIPMENT_CANCELLED}] Listener error:`, { message: err.message });
    }
};

export default shipmentCancelledListener;
export { shipmentCancelledListener };
