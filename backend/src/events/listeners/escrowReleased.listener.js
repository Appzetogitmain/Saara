/**
 * Listener: ESCROW_RELEASED
 *
 * Fires after the escrow cron successfully credits vendor wallet.
 * Purely a notification + analytics listener — no financial logic here.
 *
 * ─── Phase 3 (Current) ───────────────────────────────────────────────────────
 * STUB: Logs event receipt.
 *
 * ─── Phase 5 Business Logic (to implement) ───────────────────────────────────
 *   1. NOTIFICATION:
 *      → Notify vendor: "₹{amount} has been credited to your wallet for order #{orderId}."
 *
 *   2. ANALYTICS:
 *      → Record escrow release event
 *      → Compute and store hold duration (deliveredAt → releasedAt)
 *      → Flag unusually long holds for admin audit
 *
 * ─── Expected Payload ────────────────────────────────────────────────────────
 * {
 *   commissionId: ObjectId (string)
 *   orderId:      ObjectId (string)
 *   vendorId:     ObjectId (string)
 *   amount:       number
 *   releasedAt:   ISO date string
 * }
 */

import LOGISTICS_EVENTS from '../logisticsEvents.js';
import logger from '../../utils/logger.js';
import { createNotification } from '../../services/notification.service.js';

const escrowReleasedListener = async (payload) => {
    try {
        logger.info(`[${LOGISTICS_EVENTS.ESCROW_RELEASED}] Received: orderId=${payload.orderId} vendorId=${payload.vendorId} amount=₹${payload.amount}`);

        // 1. NOTIFICATION
        if (payload.vendorId) {
            await createNotification({
                recipientId: payload.vendorId,
                type: 'ESCROW_RELEASED',
                title: 'Earnings Credited',
                message: `₹${payload.amount} has been credited to your wallet for order #${payload.orderId}.`,
                metadata: { orderId: payload.orderId, commissionId: payload.commissionId }
            });
        }

        // 2. ANALYTICS
        // Assuming analytics recorded elsewhere or could be extended later.

    } catch (err) {
        logger.error(`[${LOGISTICS_EVENTS.ESCROW_RELEASED}] Listener error:`, { message: err.message });
    }
};

export default escrowReleasedListener;
export { escrowReleasedListener };
