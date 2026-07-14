import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Order from '../../../models/Order.model.js';
import Payment from '../../../models/Payment.model.js';
import PaymentAttempt from '../../../models/PaymentAttempt.model.js';
import Commission from '../../../models/Commission.model.js';
import Product from '../../../models/Product.model.js';
import Coupon from '../../../models/Coupon.model.js';
import Vendor from '../../../models/Vendor.model.js';
import mongoose from 'mongoose';
import { getWallet, debitWallet, getWalletTransactions } from '../../../services/wallet.service.js';
import { calculateOrderFinancials } from '../../../services/financial.service.js';
import { getDefaultCommissionRate } from '../../../services/settingsService.js';
import { createNotification } from '../../../services/notification.service.js';
import { sendOrderConfirmationEmail } from '../../../services/email.service.js';
import { notifyOrderUpdate } from '../../../services/socket.service.js';

/**
 * @desc    Get logged-in user's wallet
 * @route   GET /api/user/wallet
 * @access  Private (Customer)
 */
export const getCustomerWallet = asyncHandler(async (req, res) => {
    const wallet = await getWallet(req.user.id);
    res.status(200).json(new ApiResponse(200, wallet, 'Wallet details fetched successfully'));
});

/**
 * @desc    Get logged-in user's wallet transactions
 * @route   GET /api/user/wallet/transactions
 * @access  Private (Customer)
 */
export const getCustomerWalletTransactions = asyncHandler(async (req, res) => {
    const { type, transactionType, startDate, endDate, page = 1, limit = 20 } = req.query;
    const filters = {
        type,
        transactionType,
        startDate,
        endDate,
        page: parseInt(page, 10) || 1,
        limit: parseInt(limit, 10) || 20,
    };

    const data = await getWalletTransactions(req.user.id, filters);
    res.status(200).json(new ApiResponse(200, data, 'Wallet transactions fetched successfully'));
});

/**
 * @desc    Pay for a pending order fully using wallet balance
 * @route   POST /api/user/wallet/pay
 * @access  Private (Customer)
 */
export const payWithWallet = asyncHandler(async (req, res) => {
    const { orderId } = req.body;
    const userId = req.user.id;

    if (!orderId) {
        throw new ApiError(400, 'Order ID is required');
    }

    const order = await Order.findOne({ orderId, userId });
    if (!order) {
        throw new ApiError(404, 'Order not found');
    }

    if (order.status !== 'payment_pending') {
        throw new ApiError(400, `Order is not in payment_pending status (current: ${order.status})`);
    }

    const wallet = await getWallet(userId);
    if (wallet.balance < order.total) {
        throw new ApiError(400, `Insufficient wallet balance to cover total ₹${order.total}`);
    }

    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            // 1. Debit wallet fully
            await debitWallet(userId, order.total, 'wallet_payment', {
                orderId: order._id,
                description: `Paid fully using wallet for order #${order.orderId}`
            }, session);

            // 2. Deduct product variant stock atomically
            for (const item of order.items) {
                const qty = Number(item.quantity || 0);
                if (qty <= 0) continue;

                const baseFilter = {
                    _id:           item.productId,
                    stock:         { $ne: 'out_of_stock' },
                    stockQuantity: { $gte: qty },
                };

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
                    throw new ApiError(409, `Insufficient stock for item: ${item.name}`);
                }

                const nextStock = updatedProduct.stockQuantity <= 0 ? 'out_of_stock'
                    : updatedProduct.stockQuantity <= (updatedProduct.lowStockThreshold || 5) ? 'low_stock'
                    : 'in_stock';
                await Product.updateOne({ _id: updatedProduct._id }, { $set: { stock: nextStock } }, { session });
            }

            // 3. Setup vendor commissions
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
            const vendorNameMap = Object.fromEntries(vendors.map(v => [String(v._id), v.vendorName || v.name || '']));

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
            }

            // 4. Increment coupon usage
            if (order.couponCode) {
                const couponFilter = order.couponId
                    ? { _id: order.couponId }
                    : { code: order.couponCode.toUpperCase() };
                await Coupon.updateOne(couponFilter, { $inc: { usedCount: 1 } }, { session });
            }

            // 5. Update Order status
            order.status = 'processing';
            order.paymentStatus = 'paid';
            order.paymentMethod = 'wallet';
            order.walletAmountUsed = order.total;
            await order.save({ session });

            // 6. Create payment record
            await Payment.create([{
                orderId: order._id,
                userId,
                amount: order.total,
                status: 'paid',
                method: 'wallet',
            }], { session });

            // 7. Expire pending payment attempts
            await PaymentAttempt.updateMany(
                { orderId: order._id, status: 'created' },
                { $set: { status: 'failed', notes: 'Paid fully via User Wallet' } },
                { session }
            );
        });
    } finally {
        await session.endSession();
    }

    // Trigger async side-effects
    createNotification({
        recipientId: userId,
        recipientType: 'user',
        title: 'Order Confirmed',
        message: `Your order #${order.orderId} has been confirmed successfully!`,
        type: 'order',
        data: { orderId: String(order._id) },
    }).catch(console.error);

    try {
        await sendOrderConfirmationEmail(order, order.shippingAddress?.email || req.user?.email);
    } catch (e) {
        console.error('[payWithWallet Email Error]', e.message);
    }

    notifyOrderUpdate(order).catch(console.error);

    res.status(200).json(new ApiResponse(200, { orderId: order.orderId }, 'Order paid successfully with wallet balance'));
});
