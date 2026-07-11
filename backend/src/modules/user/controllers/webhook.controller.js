import mongoose from 'mongoose';
import ApiError from '../../../utils/ApiError.js';
import WebhookEvent from '../../../models/WebhookEvent.model.js';
import PaymentAttempt from '../../../models/PaymentAttempt.model.js';
import Payment from '../../../models/Payment.model.js';
import Order from '../../../models/Order.model.js';
import Product from '../../../models/Product.model.js';
import Commission from '../../../models/Commission.model.js';
import Coupon from '../../../models/Coupon.model.js';
import Refund from '../../../models/Refund.model.js';
import ReturnRequest from '../../../models/ReturnRequest.model.js';
import Vendor from '../../../models/Vendor.model.js';
import { verifyWebhookSignature, initiateRefund } from '../../../services/payment.service.js';
import { processCapturedPayment } from '../../../services/paymentProcessor.js';
import { createNotification } from '../../../services/notification.service.js';
import { sendOrderConfirmationEmail } from '../../../services/email.service.js';
import { buildOrderItemsSummary } from '../../../utils/notificationProductFormatter.js';
import { notifyOrderUpdate } from '../../../services/socket.service.js';

/**
 * POST /api/webhook/razorpay
 * Raw body required — mounted before express.json() in app.js
 */
export const handleRazorpayWebhook = async (req, res) => {
    // 1 — Verify signature
    const signature = req.headers['x-razorpay-signature'];
    try {
        verifyWebhookSignature(req.body, signature);
    } catch {
        return res.status(400).json({ status: 'invalid_signature' });
    }

    // Parse payload safely since body is raw Buffer
    let payload;
    try {
        payload = JSON.parse(req.body.toString());
    } catch {
        return res.status(400).json({ status: 'invalid_json' });
    }

    const eventType = payload.event;
    const eventId = payload.id;

    // 2 — Idempotency: create WebhookEvent with status 'processing'
    let webhookEvent;
    try {
        webhookEvent = await WebhookEvent.create({
            eventId,
            eventType,
            payload,
            status: 'processing',
        });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(200).json({ status: 'duplicate_event' });
        }
        return res.status(500).json({ status: 'db_error', error: err.message });
    }

    try {
        if (eventType === 'payment.captured') {
            const entity = payload?.payload?.payment?.entity;
            await processCapturedPayment({
                razorpayOrderId: entity?.order_id,
                razorpayPaymentId: entity?.id,
                method: entity?.method,
                payload
            });
        } else if (eventType === 'payment.failed') {
            await handlePaymentFailed(payload);
        } else if (eventType === 'refund.processed') {
            await handleRefundProcessed(payload);
        } else if (eventType === 'refund.failed') {
            await handleRefundFailed(payload);
        }

        await WebhookEvent.findByIdAndUpdate(webhookEvent._id, { status: 'completed' });
        return res.status(200).json({ status: 'ok' });
    } catch (err) {
        console.error('[WEBHOOK_ERROR]', eventType, err.message);
        await WebhookEvent.findByIdAndUpdate(webhookEvent._id, {
            status: 'failed',
            error: err.message,
        });
        return res.status(200).json({ status: 'processed_with_error', error: err.message });
    }
};

// ─── payment.captured is delegated to processCapturedPayment service


// ─── payment.failed ───────────────────────────────────────────────────────────
async function handlePaymentFailed(payload) {
    const entity = payload?.payload?.payment?.entity;
    const razorpayOrderId = entity?.order_id;
    if (!razorpayOrderId) return;

    const attempt = await PaymentAttempt.findOneAndUpdate(
        { razorpayOrderId, status: 'created' },
        { $set: { status: 'failed', webhookPayload: payload } },
        { new: true }
    );
    if (!attempt) return;

    // Check if ALL attempts for this order are failed
    const activeAttempts = await PaymentAttempt.countDocuments({
        orderId: attempt.orderId,
        status:  { $in: ['created', 'paid'] },
    });

    if (activeAttempts === 0) {
        await Payment.findByIdAndUpdate(attempt.paymentId, { status: 'failed' });
        await Order.findByIdAndUpdate(attempt.orderId, { status: 'payment_failed' });
    }
    // If user still has active/created attempts, keep order as payment_pending
}

// ─── refund.processed ─────────────────────────────────────────────────────────
async function handleRefundProcessed(payload) {
    const entity = payload?.payload?.refund?.entity;
    const razorpayRefundId = entity?.id;
    if (!razorpayRefundId) return;

    const refund = await Refund.findOneAndUpdate(
        { razorpayRefundId },
        { $set: { status: 'completed' } },
        { new: true }
    );
    if (!refund) return;

    // Update order paymentStatus
    const order = await Order.findById(refund.orderId);
    if (order) {
        // Check if fully refunded or partial
        const isFullRefund = refund.amount >= order.total;
        await Order.findByIdAndUpdate(order._id, {
            paymentStatus: isFullRefund ? 'refunded' : 'partially_refunded',
        });
    }

    // Notify customer
    if (refund.userId) {
        const itemsText = order ? buildOrderItemsSummary(order.items) : '';
        await createNotification({
            recipientId:   refund.userId,
            recipientType: 'user',          // fix: was 'customer' — schema enum is 'user'
            title:         'Refund Processed',
            message:       `Your refund of ₹${refund.amount} has been successfully processed.${itemsText}`,
            type:          'refund',
            data:          { refundId: String(refund._id), amount: refund.amount },
        }).catch(console.error);
    }
}

// ─── refund.failed ────────────────────────────────────────────────────────────
async function handleRefundFailed(payload) {
    const entity = payload?.payload?.refund?.entity;
    const razorpayRefundId = entity?.id;
    if (!razorpayRefundId) return;

    const refund = await Refund.findOneAndUpdate(
        { razorpayRefundId },
        { $set: { status: 'failed', failureReason: entity?.description || 'Refund failed' } },
        { new: true }
    );
    if (!refund) return;

    // Notify admins
    const { default: Admin } = await import('../../../models/Admin.model.js');
    const admins = await Admin.find({ isActive: true }).select('_id').lean();
    const order = await Order.findById(refund.orderId).lean();
    const itemsText = order ? buildOrderItemsSummary(order.items) : '';
    for (const admin of admins) {
        await createNotification({
            recipientId:   admin._id,
            recipientType: 'admin',
            title:         'Refund Failed — Action Required',
            message:       `Refund of ₹${refund.amount} for order ${order?.orderId || ''} failed. Manual intervention needed.${itemsText}`,
            type:          'refund',
            data:          { refundId: String(refund._id), orderId: String(refund.orderId) },
        }).catch(console.error);
    }
}
