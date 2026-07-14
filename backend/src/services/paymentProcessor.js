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
import { creditWallet } from './wallet.service.js';
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
            // FINANCIAL SNAPSHOT RULE: use stored order.items prices — not live product prices.
            const vendorIds = [...new Set(order.items.map(i => String(i.vendorId)).filter(Boolean))];
            const vendors = await Vendor.find({ _id: { $in: vendorIds } })
                .select('_id commissionRate vendorName name')
                .session(session)
                .lean();

            const defaultRate = await getDefaultCommissionRate();
            const vendorCommissionMap = Object.fromEntries(vendors.map(v => [
                String(v._id),
                v.commissionRate !== undefined && v.commissionRate !== null ? v.commissionRate : defaultRate
            ]));
            const vendorNameMap       = Object.fromEntries(vendors.map(v => [String(v._id), v.vendorName || v.name || '']));

            const financials = calculateOrderFinancials({
                items: order.items.map(i => ({
                    productId:   i.productId,
                    price:       i.price,
                    quantity:    i.quantity,
                    taxRate:     i.taxRate     ?? 18,
                    taxIncluded: i.taxIncluded ?? false,
                    vendorId:    i.vendorId,
                })),
                couponDiscount:    order.couponDiscount || 0,
                shipping:          order.shipping       || 0,
                vendorCommissions: vendorCommissionMap,
            });

            // IDEMPOTENCY: only create commissions if none exist for this order yet
            const existingCount = await Commission.countDocuments({ orderId: order._id }).session(session);
            if (existingCount === 0) {
                const commissionDocs = financials.vendorCalculations.map(vc => ({
                    orderId:                   order._id,
                    vendorId:                  vc.vendorId,
                    vendorName:                vendorNameMap[String(vc.vendorId)] || '',
                    subtotal:                  vc.subtotal,
                    vendorSubtotal:            vc.subtotal,
                    discountShare:             vc.discountShare,
                    vendorCouponDiscount:      vc.discountShare,
                    effectiveSubtotal:         vc.effectiveSubtotal,
                    vendorDiscountedSubtotal:  vc.effectiveSubtotal,
                    commissionRate:            vc.commissionRate,
                    commission:                vc.commission,
                    commissionAmount:          vc.commission,
                    vendorEarnings:            vc.vendorEarnings,
                    vendorNetEarnings:         vc.vendorEarnings,
                    escrowAmount:              vc.vendorEarnings,
                    walletCredit:              0,
                    escrowStatus:              'held',
                    settlementStatus:          'pending',
                    vendorTax:                 vc.vendorTax || 0,
                    vendorTotalPaidByCustomer: vc.vendorTotalPaidByCustomer || vc.subtotal,
                    ...(order.couponId ? { couponId: order.couponId, couponCode: order.couponCode } : {}),
                }));
                await Commission.insertMany(commissionDocs, { session });

                console.log('[FINANCIAL_EVENT] Commission created via shared processor', {
                    orderId:         String(order._id),
                    customerId:      String(order.userId),
                    vendorCount:     commissionDocs.length,
                    totalCommission: financials.commissionAmount,
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

            const rzpRefundAmount = Number((order.total - (order.walletAmountUsed || 0)).toFixed(2));
            const walletRefundAmount = order.walletAmountUsed || 0;

            // 1. Process Razorpay refund if any cash was paid online
            if (rzpRefundAmount > 0) {
                try {
                    const rzpRefund = await initiateRefund(razorpayPaymentId, rzpRefundAmount, { reason: 'stock_exhausted' });
                    await Refund.create({
                        orderId:          order._id,
                        amount:           rzpRefundAmount,
                        referenceId:      `STOCK_FAIL_REFUND_RZP_${attempt._id}`,
                        method:           'razorpay_auto',
                        destination:      'original_source',
                        status:           'processing',
                        razorpayRefundId: rzpRefund.id,
                        paymentAttemptId: attempt._id,
                        notes:            'Auto-refund: stock exhausted after payment (Razorpay portion)',
                    });
                    console.warn('[FINANCIAL_EVENT] Auto-refund Razorpay triggered due to stock fail', {
                        orderId: String(order._id), amount: rzpRefundAmount, timestamp: new Date().toISOString()
                    });
                } catch (refundErr) {
                    console.error('[REFUND_ERROR] Razorpay auto-refund failed:', refundErr.message);
                }
            }

            // 2. Process Wallet refund if any wallet balance was used
            if (walletRefundAmount > 0) {
                try {
                    await creditWallet(
                        order.userId,
                        walletRefundAmount,
                        'cancel_refund',
                        {
                            orderId: order._id,
                            description: `Reversed ₹${walletRefundAmount} wallet payment due to stock failure after payment capture`,
                            reference: `STOCK_FAIL_REFUND_WALLET_${attempt._id}`
                        }
                    );
                    await Refund.create({
                        orderId:          order._id,
                        amount:           walletRefundAmount,
                        referenceId:      `STOCK_FAIL_REFUND_WALLET_${attempt._id}`,
                        method:           'wallet_credit',
                        destination:      'wallet',
                        status:           'completed',
                        paymentAttemptId: attempt._id,
                        notes:            'Auto-refund: stock exhausted after payment (Wallet portion)',
                    });
                    console.warn('[FINANCIAL_EVENT] Auto-refund Wallet triggered due to stock fail', {
                        orderId: String(order._id), amount: walletRefundAmount, timestamp: new Date().toISOString()
                    });
                } catch (walletErr) {
                    console.error('[REFUND_ERROR] Wallet auto-refund failed:', walletErr.message);
                }
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
