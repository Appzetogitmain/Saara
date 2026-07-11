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
import { verifyWebhookSignature, initiateRefund } from '../../../services/payment.service.js';
import { createNotification } from '../../../services/notification.service.js';
import { sendOrderConfirmationEmail } from '../../../services/email.service.js';
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

    let payload;
    try {
        payload = JSON.parse(req.body.toString());
    } catch {
        return res.status(400).json({ status: 'invalid_payload' });
    }

    const eventType = payload.event;
    const eventId = req.headers['x-razorpay-event-id'] || payload.id || `${eventType}-${Date.now()}`;

    // 2 — Idempotency: create WebhookEvent with status 'processing'
    let webhookEvent;
    try {
        webhookEvent = await WebhookEvent.create({
            eventId,
            provider: 'razorpay',
            eventType,
            status: 'processing',
            payload,
        });
    } catch (err) {
        if (err.code === 11000) {
            // Already processed or processing — safe to acknowledge
            return res.status(200).json({ status: 'already_processed' });
        }
        return res.status(500).json({ status: 'error', message: err.message });
    }

    // 3 — Route by event type
    try {
        switch (eventType) {
            case 'payment.captured':
                await handlePaymentCaptured(payload);
                break;
            case 'payment.failed':
                await handlePaymentFailed(payload);
                break;
            case 'refund.processed':
                await handleRefundProcessed(payload);
                break;
            case 'refund.failed':
                await handleRefundFailed(payload);
                break;
            default:
                // Unknown event — acknowledge but don't process
                break;
        }

        // Mark event as completed
        await WebhookEvent.findByIdAndUpdate(webhookEvent._id, { status: 'completed' });
        return res.status(200).json({ status: 'ok' });
    } catch (err) {
        console.error('[WEBHOOK_ERROR]', eventType, err.message);
        await WebhookEvent.findByIdAndUpdate(webhookEvent._id, {
            status: 'failed',
            error: err.message,
        });
        // Always return 200 to prevent Razorpay retries for business logic errors
        return res.status(200).json({ status: 'processed_with_error', error: err.message });
    }
};

// ─── payment.captured ─────────────────────────────────────────────────────────
async function handlePaymentCaptured(payload) {
    const entity = payload?.payload?.payment?.entity;
    const razorpayOrderId   = entity?.order_id;
    const razorpayPaymentId = entity?.id;
    const method            = entity?.method;

    if (!razorpayOrderId || !razorpayPaymentId) {
        throw new Error('Missing razorpayOrderId or razorpayPaymentId in payment.captured payload.');
    }

    // Atomic idempotency lock: only proceed if status is 'created'
    const attempt = await PaymentAttempt.findOneAndUpdate(
        { razorpayOrderId, status: 'created' },
        { $set: { status: 'processing', razorpayPaymentId, webhookPayload: payload } },
        { new: true }
    );
    if (!attempt) {
        // Already processing or paid — exit safely
        return;
    }

    const order = await Order.findById(attempt.orderId);
    if (!order) throw new Error(`Order not found for attempt ${attempt._id}`);

    // ─── Handle EXCHANGE_UPGRADE payment ─────────────────────────────────────
    if (attempt.purpose === 'EXCHANGE_UPGRADE') {
        await PaymentAttempt.findByIdAndUpdate(attempt._id, { status: 'paid' });
        await ReturnRequest.findByIdAndUpdate(attempt.relatedReturnId, {
            'exchangeDetails.priceDeltaStatus': 'collected',
        });
        return;
    }

    // ─── Handle ORDER_PAYMENT ─────────────────────────────────────────────────
    const session = await mongoose.startSession();
    let stockFailed = false;

    try {
        await session.withTransaction(async () => {
            // Deduct stock atomically
            for (const item of order.items) {
                const qty = Number(item.quantity || 0);
                if (qty <= 0) continue;

                const baseFilter = {
                    _id:           item.productId,
                    stock:         { $ne: 'out_of_stock' },
                    stockQuantity: { $gte: qty },
                };

                // Also check variant stock if applicable
                const variantPath = item.variantKey ? `variants.stockMap.${item.variantKey}` : null;
                if (variantPath) baseFilter[variantPath] = { $gte: qty };

                const incUpdate = { stockQuantity: -qty };
                if (variantPath) incUpdate[variantPath] = -qty;

                const updatedProduct = await Product.findOneAndUpdate(
                    baseFilter,
                    { $inc: incUpdate },
                    { new: true, session }
                );

                if (!updatedProduct) {
                    stockFailed = true;
                    throw new Error(`Stock exhausted for item: ${item.name}`);
                }

                const nextStock = updatedProduct.stockQuantity <= 0 ? 'out_of_stock'
                    : updatedProduct.stockQuantity <= (updatedProduct.lowStockThreshold || 5) ? 'low_stock'
                    : 'in_stock';
                await Product.updateOne({ _id: updatedProduct._id }, { $set: { stock: nextStock } }, { session });
            }

            // ── All stock deducted successfully ──
            // Create Commission records from the pre-calculated financials on Order
            const { default: Vendor } = await import('../../../models/Vendor.model.js');
            const vendorIds = [...new Set(order.items.map(i => String(i.vendorId)).filter(Boolean))];
            const vendors = await Vendor.find({ _id: { $in: vendorIds } }).select('_id commissionRate').session(session).lean();
            const vendorCommissionMap = Object.fromEntries(vendors.map(v => [String(v._id), v.commissionRate || 10]));

            // Build per-vendor commission from order financials
            const vendorItemMap = {};
            for (const item of order.items) {
                const vid = String(item.vendorId);
                if (!vendorItemMap[vid]) vendorItemMap[vid] = { vendorId: item.vendorId, subtotal: 0 };
                vendorItemMap[vid].subtotal += (item.price || 0) * (item.quantity || 0);
            }

            const commissionDocs = Object.values(vendorItemMap).map(v => {
                const rate = vendorCommissionMap[String(v.vendorId)] || 10;
                const commission = parseFloat(((v.subtotal * rate) / 100).toFixed(2));
                const vendorEarnings = parseFloat((v.subtotal - commission).toFixed(2));
                return {
                    orderId:          order._id,
                    vendorId:         v.vendorId,
                    subtotal:         v.subtotal,
                    effectiveSubtotal: v.subtotal,
                    commissionRate:   rate,
                    commission,
                    vendorEarnings,
                    discountShare:    0,
                };
            });

            await Commission.insertMany(commissionDocs, { session });

            // Increment coupon usage if order had a coupon
            if (order.couponCode) {
                await Coupon.updateOne(
                    { code: order.couponCode },
                    { $inc: { usedCount: 1 } },
                    { session }
                );
            }

            // Update Order status
            await Order.findByIdAndUpdate(
                order._id,
                { $set: { status: 'processing', paymentStatus: 'paid' } },
                { session }
            );

            // Update PaymentAttempt
            await PaymentAttempt.findByIdAndUpdate(
                attempt._id,
                { $set: { status: 'paid', method } },
                { session }
            );

            // Update Payment summary
            await Payment.findByIdAndUpdate(
                attempt.paymentId,
                { $set: { status: 'paid', method } },
                { session }
            );
        });
    } catch (err) {
        if (stockFailed) {
            // Paid but stock exhausted — trigger auto-refund
            await PaymentAttempt.findByIdAndUpdate(attempt._id, { status: 'stock_failed_refunding' });
            await Payment.findByIdAndUpdate(attempt.paymentId, { status: 'refund_pending' });
            await Order.findByIdAndUpdate(order._id, { status: 'payment_failed', paymentStatus: 'failed' });

            // Initiate Razorpay refund
            try {
                const rzpRefund = await initiateRefund(razorpayPaymentId, order.total, { reason: 'stock_exhausted' });
                await Refund.create({
                    orderId:          order._id,
                    amount:           order.total,
                    referenceId:      `STOCK_FAIL_REFUND_${attempt._id}`,
                    method:           'razorpay_auto',
                    status:           'processing',
                    razorpayRefundId: rzpRefund.id,
                    paymentAttemptId: attempt._id,
                    notes:            'Auto-refund: stock exhausted after payment',
                });
            } catch (refundErr) {
                console.error('[REFUND_ERROR] Auto-refund failed:', refundErr.message);
            }
        } else {
            await session.endSession();
            throw err;
        }
    } finally {
        if (session.inTransaction()) await session.abortTransaction();
        await session.endSession();
    }

    // ── Post-transaction notifications (fire-and-forget) ──
    if (!stockFailed) {
        try {
            const freshOrder = await Order.findById(order._id).populate('userId', 'email name').lean();
            if (freshOrder?.userId?.email) {
                await sendOrderConfirmationEmail(freshOrder.userId.email, freshOrder).catch(console.error);
            }
            notifyOrderUpdate(freshOrder || order);
        } catch (notifyErr) {
            console.error('[NOTIFY_ERROR]', notifyErr.message);
        }
    }
}

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
        await createNotification({
            recipientId:   refund.userId,
            recipientType: 'customer',
            title:         'Refund Processed',
            message:       `Your refund of ₹${refund.amount} has been successfully processed.`,
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
    for (const admin of admins) {
        await createNotification({
            recipientId:   admin._id,
            recipientType: 'admin',
            title:         'Refund Failed — Action Required',
            message:       `Refund of ₹${refund.amount} for order failed. Manual intervention needed.`,
            type:          'refund',
            data:          { refundId: String(refund._id), orderId: String(refund.orderId) },
        }).catch(console.error);
    }
}
