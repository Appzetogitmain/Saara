/**
 * Listener: COD_RECEIVED
 *
 * Fires when admin confirms that a courier has remitted COD cash to the platform.
 * This is the HARD GATE that unblocks vendor escrow release for courier COD orders.
 *
 * ─── Phase 3 (Current) ───────────────────────────────────────────────────────
 * STUB: Logs event receipt.
 *
 * ─── Phase 6 Business Logic (to implement) ───────────────────────────────────
 *   1. ESCROW GATE CLEARANCE:
 *      → Find Commission for orderId
 *      → Verify CourierCODRemittance.remittanceStatus === 'received'
 *      → Set Commission.escrowStatus = 'release_pending' (now eligible for cron)
 *      → Set Shipment.escrowReleaseDate = confirmedAt + 7 days
 *
 *   2. NOTIFICATION:
 *      → Notify vendor: "COD amount received by platform. Earnings releasing soon."
 *
 *   3. ANALYTICS:
 *      → Record remittance event with variance (expected vs received amount)
 *      → Flag disputed/partial remittances for admin review
 *
 * ─── IMPORTANT ───────────────────────────────────────────────────────────────
 * Before this event fires, the following must be true:
 *   - CourierCODRemittance.remittanceStatus === 'received'
 *   - Shipment.status === 'delivered'
 * The admin controller validates both conditions before emitting this event.
 *
 * ─── Expected Payload ────────────────────────────────────────────────────────
 * {
 *   remittanceId:   ObjectId (string)
 *   shipmentId:     ObjectId (string)
 *   orderId:        ObjectId (string)
 *   vendorId:       ObjectId (string)
 *   amountReceived: number
 *   providerId:     string
 * }
 */

import LOGISTICS_EVENTS from '../logisticsEvents.js';
import Commission from '../../models/Commission.model.js';
import Shipment from '../../models/Shipment.model.js';
import logger from '../../utils/logger.js';
import { createNotification } from '../../services/notification.service.js';

const codReceivedListener = async (payload) => {
    try {
        console.log(
            `[${LOGISTICS_EVENTS.COD_RECEIVED}] Received:`,
            `orderId=${payload.orderId}`,
            `providerId=${payload.providerId}`,
            `amountReceived=₹${payload.amountReceived}`
        );

        // 1. ESCROW GATE CLEARANCE
        const commission = await Commission.findOne({ orderId: payload.orderId });
        if (commission) {
            commission.escrowStatus = 'release_pending';
            await commission.save();
            logger.info(`[COD_RECEIVED] Escrow cleared for commission ${commission._id}`);
        }

        const shipment = await Shipment.findOne({ orderId: payload.orderId });
        if (shipment) {
            shipment.escrowReleaseDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
            await shipment.save();
        }

        // 2. NOTIFICATION
        if (payload.vendorId) {
            await createNotification({
                recipientId: payload.vendorId,
                type: 'COD_REMITTED',
                title: 'COD Received',
                message: `COD amount of ₹${payload.amountReceived} has been remitted. Earnings releasing soon.`,
                metadata: { orderId: payload.orderId }
            });
        }

        // 3. ANALYTICS
        // Assuming analytics recorded elsewhere or could be extended later.

    } catch (err) {
        logger.error(`[${LOGISTICS_EVENTS.COD_RECEIVED}] Listener error:`, { message: err.message });
    }
};

export default codReceivedListener;
export { codReceivedListener };
