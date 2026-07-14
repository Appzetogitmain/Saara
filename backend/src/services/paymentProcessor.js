import mongoose from 'mongoose';
import ApiError from '../utils/ApiError.js';
import PaymentAttempt from '../models/PaymentAttempt.model.js';
import Payment from '../models/Payment.model.js';
import Order from '../models/Order.model.js';
import Product from '../models/Product.model.js';
import Commission from '../models/Commission.model.js';
import Coupon from '../models/Coupon.model.js';
import Refund from '../models/Refund.model.js';
import ReturnRequest from '../models/ReturnRequest.model.js';
import Vendor from '../models/Vendor.model.js';
import Admin from '../models/Admin.model.js';
import { initiateRefund } from './payment.service.js';
import { calculateOrderFinancials } from './financial.service.js';
import { createNotification } from './notification.service.js';
import { sendOrderConfirmationEmail } from './email.service.js';
import { notifyOrderUpdate } from './socket.service.js';
import { getDefaultCommissionRate } from './settingsService.js';

/**
 * Reusable core payment processor.
 * Guarantees atomic transition from 'created' -> 'processing' -> 'paid'.
 * Safely handles race conditions if both Webhook and Direct Client Verification hit simultaneously.
 */
export async function processCapturedPayment({ razorpayOrderId, razorpayPaymentId, method, payload }) {
    if (!razorpayOrderId || !razorpayPaymentId) {
        throw new Error('Missing razorpayOrderId or razorpayPaymentId.');
    }

    // Atomic idempotency lock: only proceed if status is 'created'
    const attempt = await PaymentAttempt.findOneAndUpdate(
        { razorpayOrderId, status: 'created' },
        { $set: { status: 'processing', razorpayPaymentId, webhookPayload: payload } },
        { new: true }
    );
    if (!attempt) {
        // Already processing or paid — exit safely to avoid double stock deduction
        console.warn(`[PAYMENT_PROCESSOR] Attempt ${razorpayOrderId} already processed or processing.`);
        return;
    }

    const order = await Order.findById(attempt.orderId);
    if (!order) throw new Error(`Order not found for attempt ${attempt._id}`);

    // ─── Handle EXCHANGE_UPGRADE payment ─────────────────────────────────────
    if (attempt.purpose === 'EXCHANGE_UPGRADE') {
        // T4.2: Both writes must be atomic — if server crashes between them,
        // the PaymentAttempt would show 'paid' but priceDeltaStatus stays 'pending'.
        const xSess = await mongoose.startSession();
        try {
            await xSess.withTransaction(async () => {
                await PaymentAttempt.findByIdAndUpdate(
                    attempt._id,
                    { status: 'paid' },
                    { session: xSess }
                );
                await ReturnRequest.findByIdAndUpdate(
                    attempt.relatedReturnId,
                    { 'exchangeDetails.priceDeltaStatus': 'collected' },
                    { session: xSess }
                );
            });
        } finally {
            await xSess.endSession();
        }
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
            // IDEMPOTENCY: only create commissions if none exist for this order yet
            const existingCount = await Commission.countDocuments({ orderId: order._id }).session(session);
            if (existingCount === 0) {
                const commissionDocs = (order.vendorItems || []).map(vc => ({
                    orderId:                   order._id,
                    vendorId:                  vc.vendorId,
                    vendorName:                vc.vendorName || '',
                    subtotal:                  vc.subtotal,
                    vendorSubtotal:            vc.subtotal,
                    discountShare:             vc.discount || 0,
                    vendorCouponDiscount:      vc.discount || 0,
                    effectiveSubtotal:         parseFloat((vc.subtotal - (vc.discount || 0)).toFixed(2)),
                    vendorDiscountedSubtotal:  parseFloat((vc.subtotal - (vc.discount || 0)).toFixed(2)),
                    commissionRate:            vc.commissionRate,
                    commission:                vc.commissionAmount || 0,
                    commissionAmount:          vc.commissionAmount || 0,
                    vendorEarnings:            vc.vendorEarnings || 0,
                    vendorNetEarnings:         vc.vendorEarnings || 0,
                    escrowAmount:              vc.vendorEarnings || 0,
                    walletCredit:              0,
                    escrowStatus:              'held',
                    settlementStatus:          'pending',
                    vendorTax:                 vc.tax || 0,
                    vendorTotalPaidByCustomer: parseFloat((vc.subtotal - (vc.discount || 0) + (vc.shipping || 0) + (vc.tax || 0)).toFixed(2)),
                    ...(order.couponId ? { couponId: order.couponId, couponCode: order.couponCode } : {}),
                }));
                await Commission.insertMany(commissionDocs, { session });

                console.log('[FINANCIAL_EVENT] Commission created via shared processor', {
                    orderId:         String(order._id),
                    customerId:      String(order.userId),
                    vendorCount:     commissionDocs.length,
                    totalCommission: order.commissionAmount,
                    timestamp:       new Date().toISOString(),
                });
            }

            // Increment coupon usage — use couponId (ObjectId) for precise lookup
            if (order.couponCode) {
                const couponFilter = order.couponId
                    ? { _id: order.couponId }
                    : { code: order.couponCode.toUpperCase() };
                await Coupon.updateOne(couponFilter, { $inc: { usedCount: 1 } }, { session });
            }

            // Update Order status
            await Order.findByIdAndUpdate(
                order._id,
                { $set: { status: 'processing', paymentStatus: 'paid' } },
                { session }
            );

            // Update Payment attempt
            await PaymentAttempt.findByIdAndUpdate(attempt._id, { $set: { status: 'paid' } }, { session });

            // Update Payment summary
            await Payment.findByIdAndUpdate(attempt.paymentId, { $set: { status: 'paid', method } }, { session });

            // Invalidate other attempts
            await PaymentAttempt.updateMany(
                { orderId: order._id, _id: { $ne: attempt._id }, status: 'created' },
                { $set: { status: 'failed' } },
                { session }
            );

            console.log('[FINANCIAL_EVENT] Payment captured successfully via shared processor', {
                orderId:           String(order._id),
                razorpayOrderId,
                razorpayPaymentId,
                amount:            order.total,
                timestamp:         new Date().toISOString(),
            });
        });
    } catch (err) {
        if (stockFailed) {
            // EXTERNAL API RULE: Razorpay refund called AFTER session handling, not inside transaction
            // Auto-refund for stock exhaustion (no session needed — session already aborted)
            await PaymentAttempt.findByIdAndUpdate(attempt._id, { status: 'stock_failed_refunding' });
            await Payment.findByIdAndUpdate(attempt.paymentId, { status: 'refund_pending' });
            await Order.findByIdAndUpdate(order._id, { status: 'payment_failed', paymentStatus: 'failed' });

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
                console.warn('[FINANCIAL_EVENT] Auto-refund triggered due to stock fail', {
                    orderId: String(order._id), amount: order.total, timestamp: new Date().toISOString()
                });
            } catch (refundErr) {
                console.error('[REFUND_ERROR] Auto-refund failed:', refundErr.message);
            }
        } else {
            // Non-stock error — rethrow and let finally clean up
            throw err;
        }
    } finally {
        try { if (session.inTransaction()) await session.abortTransaction(); } catch (_) {}
        try { await session.endSession(); } catch (_) {}
    }

    // ─── Post-transaction notifications (fire-and-forget) ─────────────────────
    if (!stockFailed) {
        try {
            // T1.2: Fixed recipient → recipientId (notification.service.js requires 'recipientId')
            await createNotification({
                recipientId:   order.userId,
                recipientType: 'user',
                title:         'Order Confirmed',
                message:       `Your order #${order.orderId} has been confirmed successfully!`,
                type:          'order_status',
                data:          { orderId: String(order._id) },
            });

            // Notify each admin individually with their recipientId
            const admins = await Admin.find({ isActive: true }).select('_id').lean();
            await Promise.allSettled(admins.map(adm =>
                createNotification({
                    recipientId:   adm._id,
                    recipientType: 'admin',
                    title:         'New Order Placed',
                    message:       `A new order #${order.orderId} of total ₹${order.total} has been placed.`,
                    type:          'order_status',
                    data:          { orderId: String(order._id) },
                })
            ));

            const vendorIds = [...new Set(order.items.map(i => String(i.vendorId)).filter(Boolean))];
            for (const vId of vendorIds) {
                await createNotification({
                    recipientId:   vId,
                    recipientType: 'vendor',
                    title:         'New Order Received',
                    message:       `You have received a new order #${order.orderId}.`,
                    type:          'order_status',
                    data:          { orderId: String(order._id) },
                });
            }
        } catch (notifErr) {
            console.error('[NOTIFICATION_ERROR] Post-payment notification failed:', notifErr.message);
        }

        try {
            await sendOrderConfirmationEmail(order._id);
        } catch (emailErr) {
            console.error('[EMAIL_ERROR] Order confirmation email failed:', emailErr.message);
        }

        try {
            await notifyOrderUpdate(order._id, { status: 'processing', paymentStatus: 'paid' });
        } catch (socketErr) {
            console.error('[SOCKET_ERROR] Socket update failed:', socketErr.message);
        }
    }
}
