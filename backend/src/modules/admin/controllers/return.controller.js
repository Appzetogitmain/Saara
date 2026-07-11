import ReturnRequest from '../../../models/ReturnRequest.model.js';
import Order from '../../../models/Order.model.js';
import User from '../../../models/User.model.js';
import Product from '../../../models/Product.model.js';
import Commission from '../../../models/Commission.model.js';
import Vendor from '../../../models/Vendor.model.js';
import VendorWalletTransaction from '../../../models/VendorWalletTransaction.model.js';
import Refund from '../../../models/Refund.model.js';
import PaymentAttempt from '../../../models/PaymentAttempt.model.js';
import mongoose from 'mongoose';
import { createNotification } from '../../../services/notification.service.js';
import { initiateRefund } from '../../../services/payment.service.js';
import { ApiError } from '../../../utils/ApiError.js';
import { ApiResponse } from '../../../utils/ApiResponse.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

const enrichReturnItems = (request) => {
    const orderItems = Array.isArray(request?.orderId?.items) ? request.orderId.items : [];
    const returnItems = Array.isArray(request?.items) ? request.items : [];

    return returnItems.map((item) => {
        const productId = String(item?.productId || '');
        const matchedOrderItem = orderItems.find(
            (orderItem) => String(orderItem?.productId || '') === productId
        );

        return {
            ...item,
            name: item?.name || matchedOrderItem?.name || 'Unknown Product',
            price: Number(item?.price ?? matchedOrderItem?.price ?? 0),
            image: item?.image || matchedOrderItem?.image || '',
        };
    });
};

const normalizeReturnRequest = (request) => ({
    ...request._doc,
    id: request._id,
    customer: request.userId
        ? {
            name: request.userId.name,
            email: request.userId.email,
            phone: request.userId.phone
        }
        : { name: 'Guest', email: 'N/A' },
    orderId: request.orderId?.orderId || 'N/A',
    orderRefId: request.orderId?._id || null,
    requestDate: request.createdAt,
    items: enrichReturnItems(request),
});

/**
 * @desc    Get all return requests with filtering and pagination
 * @route   GET /api/admin/return-requests
 * @access  Private (Admin)
 */
export const getAllReturnRequests = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, search = '', status, startDate, endDate } = req.query;
    const numericPage = Number(page) || 1;
    const numericLimit = Number(limit) || 10;

    const filter = {};

    if (status && status !== 'all') {
        filter.status = status;
    }
    if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) filter.createdAt.$gte = new Date(startDate);
        if (endDate) filter.createdAt.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
    }

    // Search by return id, order number, customer fields, and reason text
    if (search) {
        const regex = new RegExp(search, 'i');
        const isObjectId = search.match(/^[0-9a-fA-F]{24}$/);

        const [matchedOrders, matchedUsers] = await Promise.all([
            Order.find({ orderId: regex }).select('_id').lean(),
            User.find({
                $or: [{ name: regex }, { email: regex }, { phone: regex }]
            }).select('_id').limit(200).lean(),
        ]);

        const matchedOrderIds = matchedOrders.map((o) => o._id);
        const matchedUserIds = matchedUsers.map((u) => u._id);

        const orFilters = [
            { reason: regex },
            { 'items.name': regex },
            ...(matchedOrderIds.length > 0 ? [{ orderId: { $in: matchedOrderIds } }] : []),
            ...(matchedUserIds.length > 0 ? [{ userId: { $in: matchedUserIds } }] : []),
        ];

        if (isObjectId) {
            orFilters.push({ _id: search }, { orderId: search });
        }

        if (orFilters.length > 0) {
            filter.$or = orFilters;
        }
    }

    const returnRequests = await ReturnRequest.find(filter)
        .populate('userId', 'name email phone')
        .populate('orderId', 'orderId total')
        .sort({ createdAt: -1 })
        .skip((numericPage - 1) * numericLimit)
        .limit(numericLimit);

    const total = await ReturnRequest.countDocuments(filter);

    // Normalize data for frontend
    const normalizedRequests = returnRequests.map(normalizeReturnRequest);

    res.status(200).json(
        new ApiResponse(200, {
            returnRequests: normalizedRequests,
            pagination: {
                total,
                page: numericPage,
                limit: numericLimit,
                pages: Math.ceil(total / numericLimit)
            }
        }, 'Return requests fetched successfully')
    );
});

/**
 * @desc    Get return request detail
 * @route   GET /api/admin/return-requests/:id
 * @access  Private (Admin)
 */
export const getReturnRequestById = asyncHandler(async (req, res) => {
    const request = await ReturnRequest.findById(req.params.id)
        .populate('userId', 'name email phone')
        .populate('orderId', 'orderId total createdAt items')
        .populate('vendorId', 'shopName email');

    if (!request) {
        throw new ApiError(404, 'Return request not found');
    }

    // Normalize
    const normalized = normalizeReturnRequest(request);

    res.status(200).json(
        new ApiResponse(200, normalized, 'Return request details fetched successfully')
    );
});

/**
 * @desc    Update return request status
 * @route   PATCH /api/admin/return-requests/:id/status
 * @access  Private (Admin)
 */
export const updateReturnRequestStatus = asyncHandler(async (req, res) => {
    const { status, adminNote, refundStatus } = req.body;

    const request = await ReturnRequest.findById(req.params.id)
        .populate('userId', 'name email phone')
        .populate('orderId', 'orderId total items paymentStatus escrowStatus');

    if (!request) {
        throw new ApiError(404, 'Return request not found');
    }

    // H-8 fix: Removed invalid 'processing' status — approved → pickup_pending or completed
    const allowedStatuses = ['pending', 'approved', 'pickup_pending', 'rejected', 'completed'];
    const statusTransitions = {
        pending:        ['approved', 'rejected'],
        approved:       ['pickup_pending', 'completed'],
        pickup_pending: ['completed'],
        rejected:       [],
        completed:      [],
    };

    if (status && !allowedStatuses.includes(status)) {
        throw new ApiError(400, `Status must be one of: ${allowedStatuses.join(', ')}`);
    }

    const statusUnchanged = !status || status === request.status;
    const adminNoteUnchanged = adminNote === undefined || adminNote === request.adminNote;
    if (statusUnchanged && adminNoteUnchanged) {
        const normalizedNoop = normalizeReturnRequest(request);
        return res.status(200).json(new ApiResponse(200, normalizedNoop, 'No changes applied.'));
    }

    if (status && status !== request.status) {
        const allowedNext = statusTransitions[request.status] || [];
        if (!allowedNext.includes(status)) {
            throw new ApiError(409, `Cannot move return request from '${request.status}' to '${status}'.`);
        }
    }

    const session = await mongoose.startSession();

    try {
        await session.withTransaction(async () => {
            // FIX CRIT-14: fetch order INSIDE transaction so we get a session-consistent read
            const order = await Order.findById(request.orderId?._id || request.orderId).session(session);

            // ── On APPROVED ──
            if (status === 'approved') {
                // Mark order as returned
                if (order && !['cancelled', 'returned'].includes(order.status)) {
                    await Order.findByIdAndUpdate(order._id, { status: 'returned' }, { session });
                }

                // H-4 fix + Refinement #6: Cancel only the RETURNING VENDOR's commission
                // Not all commissions — other vendors on same order are unaffected
                if (request.vendorId) {
                    await Commission.updateMany(
                        {
                            orderId:  request.orderId?._id || request.orderId,
                            vendorId: request.vendorId,   // scoped to returning vendor only
                            status:   { $ne: 'cancelled' },
                        },
                        {
                            $set: { status: 'cancelled', paidAt: null },
                        },
                        { session }
                    );
                }
            }

            // ── On COMPLETED ──
            if (status === 'completed') {
                // L-1 fix: Restore stock including variant stock
                for (const item of (request.items || [])) {
                    const qty = Number(item?.quantity || 0);
                    if (!item?.productId || qty <= 0) continue;

                    const incUpdate = { stockQuantity: qty };
                    // Also restore variant stock if applicable
                    if (item.variantKey) {
                        incUpdate[`variants.stockMap.${item.variantKey}`] = qty;
                    }

                    // L-2: Check if stock was <= 0 before the increment
                    const productBefore = await Product.findById(item.productId).session(session);
                    const wasOutOfStock = productBefore ? productBefore.stockQuantity <= 0 : false;

                    const product = await Product.findByIdAndUpdate(
                        item.productId,
                        { $inc: incUpdate },
                        { new: true, session }
                    );
                    if (product) {
                        const nextStock = product.stockQuantity <= 0 ? 'out_of_stock'
                            : product.stockQuantity <= (product.lowStockThreshold || 5) ? 'low_stock'
                            : 'in_stock';
                        await Product.updateOne({ _id: product._id }, { $set: { stock: nextStock } }, { session });
                    }
                }

                // Create Refund record with idempotency key (Refinement #3)
                const refund = (await Refund.create([{
                    orderId:         request.orderId?._id || request.orderId,
                    returnRequestId: request._id,
                    userId:          request.userId?._id || request.userId,
                    amount:          request.refundAmount || 0,
                    referenceId:     `RETURN_REFUND_${request._id}`,   // unique — prevents double refund
                    method:          request.refundDetails?.method === 'upi' ? 'upi' : 'bank_transfer',
                    bankDetails:     request.refundDetails?.bankDetails,
                    upiId:           request.refundDetails?.upiId,
                    status:          'requested',
                }], { session }))[0];

                // Auto-trigger Razorpay refund for online-paid orders
                if (order?.paymentStatus === 'paid') {
                    try {
                        const paidAttempt = await PaymentAttempt.findOne({
                            orderId: order._id, status: 'paid',
                        });
                        if (paidAttempt?.razorpayPaymentId && refund.amount > 0) {
                            const rzpRefund = await initiateRefund(
                                paidAttempt.razorpayPaymentId,
                                refund.amount,
                                { reason: 'return_approved' }
                            );
                            await Refund.findByIdAndUpdate(refund._id, {
                                razorpayRefundId: rzpRefund.id,
                                status: 'processing',
                                paymentAttemptId: paidAttempt._id,
                            }, { session });
                        }
                    } catch (rzpErr) {
                        console.error('[RETURN_REFUND_ERROR]', request._id, rzpErr.message);
                        // Don't fail the return — admin can manually process
                    }
                }

                // Update ReturnRequest with refundId back-link
                request.refundId = refund._id;

                // C-6 + Refinement #7: Vendor clawback ONLY if escrow already released
                // Fetch commission by orderId + vendorId for exact amount (not full order commission)
                if (order?.escrowStatus === 'released' && request.vendorId) {
                    const commission = await Commission.findOne({
                        orderId:  order._id,
                        vendorId: request.vendorId,
                    }).session(session);

                    const clawbackAmount = commission?.vendorEarnings || 0;

                    if (clawbackAmount > 0) {
                        // Allow negative balance (Refinement #8) — do NOT block return
                        const vendor = await Vendor.findByIdAndUpdate(
                            request.vendorId,
                            { $inc: { walletBalance: -clawbackAmount } },
                            { new: true, session }
                        );

                        if (vendor) {
                            const txn = (await VendorWalletTransaction.create([{
                                vendorId:            request.vendorId,
                                type:                'RETURN_CLAWBACK',
                                amount:              -clawbackAmount,
                                referenceId:         `RETURN_CLAWBACK_${request._id}`,
                                walletBalanceBefore: vendor.walletBalance + clawbackAmount,
                                walletBalanceAfter:  vendor.walletBalance,  // may be negative
                                performedBy:         { role: 'admin', id: req.user?.id },
                                relatedOrderId:      order._id,
                                relatedRefundId:     refund._id,
                            }], { session }))[0];

                            // Cross-link refund to vendor transaction
                            await Refund.findByIdAndUpdate(refund._id,
                                { vendorTransactionId: txn._id },
                                { session }
                            );

                            if (vendor.walletBalance < 0) {
                                // Fire-and-forget admin notification
                                createNotification({
                                    recipientType: 'admin',
                                    title:         'Vendor Negative Balance',
                                    message:       `Vendor ${vendor.storeName || vendor._id} balance is ₹${vendor.walletBalance.toFixed(2)} after return clawback on order ${order?.orderId}.`,
                                    type:          'alert',
                                }).catch(console.error);
                            }
                        }
                    }
                }
            }

            // Save the request status update
            request.status = status || request.status;
            if (adminNote !== undefined) request.adminNote = adminNote;
            await request.save({ session });
        });
    } finally {
        await session.endSession();
    }

    // Notifications
    const notificationTasks = [];
    if (request.userId?._id) {
        notificationTasks.push(
            createNotification({
                recipientId:   request.userId._id,
                recipientType: 'user',
                title:         'Return request updated',
                message:       `Your return request for order ${request.orderId?.orderId || request.orderId} is now ${request.status}.`,
                type:          'order',
                data: {
                    returnRequestId: String(request._id),
                    orderId:         String(request.orderId?.orderId || request.orderId || ''),
                    status:          String(request.status || ''),
                },
            })
        );
    }

    if (request.vendorId) {
        notificationTasks.push(
            createNotification({
                recipientId:   request.vendorId,
                recipientType: 'vendor',
                title:         'Return request updated by admin',
                message:       `Return request for order ${request.orderId?.orderId || request.orderId} is now ${request.status}.`,
                type:          'order',
                data: {
                    returnRequestId: String(request._id),
                    orderId:         String(request.orderId?.orderId || request.orderId || ''),
                    status:          String(request.status || ''),
                },
            })
        );
    }

    if (notificationTasks.length > 0) await Promise.allSettled(notificationTasks);

    const normalized = normalizeReturnRequest(request);
    res.status(200).json(new ApiResponse(200, normalized, 'Return request status updated successfully'));
});
