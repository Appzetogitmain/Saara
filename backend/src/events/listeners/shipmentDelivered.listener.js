/**
 * Listener: SHIPMENT_DELIVERED
 *
 * Most critical listener in the system. Fires when a shipment is confirmed delivered.
 *
 * ─── Phase 3 (Current) ───────────────────────────────────────────────────────
 * STUB: Logs event receipt. Full logic is wired in Phase 5.
 *
 * ─── Phase 5 Business Logic (to implement) ───────────────────────────────────
 *   1. OWN FLEET PAYOUT:
 *      if (payload.providerId === 'own_fleet') {
 *        → payoutCalculator.calculatePayout(distance, vehicleType, deliveredAt)
 *        → Credit DeliveryWalletTransaction (delivery earning)
 *        → Set Shipment.actualDeliveryCost = payoutAmount
 *        → Set Shipment.shippingProfit = customerShippingCharge - actualDeliveryCost
 *        → Emit DRIVER_PAYOUT_PROCESSED
 *      }
 *
 *   2. ESCROW UNLOCK:
 *      → Find Commission for orderId
 *      → Set Commission.escrowStatus = 'release_pending'
 *      → Set Shipment.escrowReleaseDate = deliveredAt + 7 days
 *      (Cron handles actual wallet credit; this listener makes it eligible)
 *
 *   3. NOTIFICATIONS:
 *      → Notify customer: "Your order has been delivered!"
 *      → Notify vendor: "Order delivered. Earnings releasing in 7 days."
 *
 * ─── Expected Payload ────────────────────────────────────────────────────────
 * {
 *   shipmentId:    ObjectId (string)
 *   orderId:       ObjectId (string)
 *   vendorId:      ObjectId (string)
 *   deliveredAt:   ISO date string
 *   providerId:    string
 *   paymentMethod: string ('cod' | 'online' | 'wallet')
 * }
 */

import mongoose from 'mongoose';
import Shipment from '../../models/Shipment.model.js';
import LOGISTICS_EVENTS from '../logisticsEvents.js';
import LogisticsEventBus from '../logisticsEventBus.js';
import { processShipmentPayout } from '../../services/deliveryPayout.service.js';
import logger from '../../utils/logger.js';

const shipmentDeliveredListener = async (payload) => {
    try {
        console.log(
            `[${LOGISTICS_EVENTS.SHIPMENT_DELIVERED}] Received:`,
            `orderId=${payload.orderId}`,
            `providerId=${payload.providerId}`,
            `deliveredAt=${payload.deliveredAt}`,
            `paymentMethod=${payload.paymentMethod}`
        );

        // Phase 5.4: Own Fleet — compute payout via payoutCalculator, credit wallet
        if (payload.providerId === 'own_fleet') {
            const session = await mongoose.startSession();
            try {
                await session.withTransaction(async () => {
                    await processShipmentPayout(payload.shipmentId, session);
                });
                console.log(`[SHIPMENT_DELIVERED] Payout processed successfully for shipment ${payload.shipmentId}`);
                
                // Emit DRIVER_PAYOUT_PROCESSED for future hooks
                LogisticsEventBus.emitEvent(LOGISTICS_EVENTS.DRIVER_PAYOUT_PROCESSED, {
                    shipmentId: payload.shipmentId,
                    orderId: payload.orderId,
                    vendorId: payload.vendorId,
                    providerId: payload.providerId,
                    deliveredAt: payload.deliveredAt
                });
            } catch (payoutErr) {
                console.error(`[SHIPMENT_DELIVERED] Payout failed for shipment ${payload.shipmentId}:`, payoutErr.message);
                
                // Persist the failure to the Shipment document for retry later
                await Shipment.updateOne(
                    { _id: payload.shipmentId },
                    { 
                        $set: { 
                            payoutStatus: 'failed', 
                            payoutError: payoutErr.message 
                        } 
                    }
                ).catch(dbErr => {
                    console.error(`[SHIPMENT_DELIVERED] Failed to persist payout error to DB:`, dbErr.message);
                });
            } finally {
                await session.endSession();
            }
        }

        // 2. ESCROW UNLOCK
        if (payload.paymentMethod !== 'cod') {
            const Commission = (await import('../../models/Commission.model.js')).default;
            const commission = await Commission.findOne({ orderId: payload.orderId });
            if (commission && commission.escrowStatus === 'held') {
                commission.escrowStatus = 'release_pending';
                await commission.save();
                logger.info(`[SHIPMENT_DELIVERED] Escrow set to release_pending for commission ${commission._id}`);
            }

            const shipment = await Shipment.findOne({ orderId: payload.orderId });
            if (shipment) {
                shipment.escrowReleaseDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
                await shipment.save();
            }
        }

        // 3. NOTIFICATIONS
        const Order = (await import('../../models/Order.model.js')).default;
        const { createNotification } = await import('../../services/notification.service.js');
        const order = await Order.findById(payload.orderId);
        if (order?.userId) {
            await createNotification({
                recipientId: order.userId,
                type: 'ORDER_DELIVERED',
                title: 'Order Delivered',
                message: `Your order #${order._id} has been delivered!`,
                metadata: { orderId: order._id }
            });
        }
        if (payload.vendorId) {
            await createNotification({
                recipientId: payload.vendorId,
                type: 'ORDER_DELIVERED',
                title: 'Order Delivered',
                message: `Order #${payload.orderId} delivered. Earnings releasing in 7 days.`,
                metadata: { orderId: payload.orderId }
            });
        }

    } catch (err) {
        // CRITICAL: Never propagate — delivery confirmation must succeed even if this listener fails.
        logger.error(`[${LOGISTICS_EVENTS.SHIPMENT_DELIVERED}] Listener error:`, { message: err.message });
    }
};

export default shipmentDeliveredListener;
export { shipmentDeliveredListener };
