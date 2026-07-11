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
import crypto from 'crypto';
import { createNotification } from '../../../services/notification.service.js';
import { initiateRefund } from '../../../services/payment.service.js';
import { buildReturnItemsSummary, buildExchangeSummary } from '../../../utils/notificationProductFormatter.js';
import { ApiError } from '../../../utils/ApiError.js';
import { ApiResponse } from '../../../utils/ApiResponse.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { notifyOrderUpdate, notifyReturnUpdate } from '../../../services/socket.service.js';
import {
    resolveOrderItemVariantKey,
    getVariantKeyFromVariant,
    getOrderItemIdentifier,
    findMatchingOrderItem
} from '../../../services/exchange.service.js';
import {
    ALLOWED_STATUSES,
    EXCHANGE_TRANSITIONS,
    RETURN_TRANSITIONS
} from '../../../shared/statusTransitions.js';
import * as exchangeWorkflow from '../../../services/exchangeWorkflow.service.js';

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
        .populate('vendorId', 'shopName email')
        .populate('deliveryBoyId', 'name phone email');

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

    const isExchange = request.requestType === 'exchange';
    const transitionMap = isExchange ? EXCHANGE_TRANSITIONS : RETURN_TRANSITIONS;

    if (status && !ALLOWED_STATUSES.includes(status)) {
        throw new ApiError(400, `Status must be one of: ${ALLOWED_STATUSES.join(', ')}`);
    }

    const statusUnchanged = !status || status === request.status;
    const adminNoteUnchanged = adminNote === undefined || adminNote === request.adminNote;
    if (statusUnchanged && adminNoteUnchanged) {
        const normalizedNoop = normalizeReturnRequest(request);
        return res.status(200).json(new ApiResponse(200, normalizedNoop, 'No changes applied.'));
    }

    if (status && status !== request.status) {
        const allowedNext = transitionMap[request.status] || [];
        if (!allowedNext.includes(status)) {
            throw new ApiError(409, `Cannot move return request from '${request.status}' to '${status}'.`);
        }

        // OTP verification validation guards for Admin manual overrides
        if (status === 'picked_up' && !request.returnPickupOtpVerified) {
            throw new ApiError(400, 'Customer OTP must be verified before marking the return as picked up.');
        }
        if (status === 'delivered_to_vendor' && !request.vendorHandoffOtpVerified) {
            throw new ApiError(400, 'Vendor must verify the handoff OTP on their dashboard to mark this return request as delivered.');
        }
        if (status === 'out_for_delivery' && !request.vendorHandoverOtpVerified) {
            throw new ApiError(400, 'Vendor Handover OTP must be verified before marking the replacement as picked up.');
        }
        if (status === 'completed' && isExchange && !request.customerDeliveryOtpVerified) {
            throw new ApiError(400, 'Customer Delivery OTP must be verified before marking the replacement as completed.');
        }
    }

    const actor = {
        id: req.user?._id || req.user?.id || new mongoose.Types.ObjectId(),
        name: req.user?.name || 'Admin',
        role: 'admin'
    };

    const session = await mongoose.startSession();
    let updatedRequest = request;

    try {
        await session.withTransaction(async () => {
            if (status && status !== request.status) {
                if (status === 'approved') {
                    if (isExchange) {
                        updatedRequest = await exchangeWorkflow.approve(request._id, 'pending', actor, session);
                    } else {
                        // Standard return approval (pickup pending transition, cancel vendor commission)
                        updatedRequest = await exchangeWorkflow.approve(request._id, 'pending', actor, session);

                        // Mark order as returned
                        const order = await Order.findById(request.orderId?._id || request.orderId).session(session);
                        if (order && !['cancelled', 'returned'].includes(order.status)) {
                            await Order.findByIdAndUpdate(order._id, { status: 'returned' }, { session });
                        }

                        // Cancel returning vendor's commission
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
                } else if (status === 'rejected') {
                    updatedRequest = await exchangeWorkflow.reject(request._id, request.status, adminNote, actor, session);
                } else if (status === 'replacement_preparing') {
                    const order = await Order.findById(request.orderId?._id || request.orderId).session(session);
                    updatedRequest = await exchangeWorkflow.prepareReplacement(request._id, 'delivered_to_vendor', order, actor, session);
                } else if (status === 'replacement_ready') {
                    updatedRequest = await exchangeWorkflow.markReplacementReady(request._id, 'replacement_preparing', actor, session);
                } else if (status === 'completed') {
                    if (isExchange) {
                        updatedRequest = await exchangeWorkflow.completeExchange(request._id, 'out_for_delivery', actor, session);
                    } else {
                        // Return completion logic + financial updates
                        updatedRequest = await exchangeWorkflow.transition(request._id, request.status, 'completed', actor, 'Return completed by admin.', session);

                        const order = await Order.findById(request.orderId?._id || request.orderId).session(session);
                        
                        // L-1 fix: Restore stock including variant stock
                        for (const item of (request.items || [])) {
                            const qty = Number(item?.quantity || 0);
                            if (!item?.productId || qty <= 0) continue;

                            const incUpdate = { stockQuantity: qty };
                            if (item.variantKey) {
                                incUpdate[`variants.stockMap.${item.variantKey}`] = qty;
                            }

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

                        // Create Refund record with idempotency key
                        const refund = (await Refund.create([{
                            orderId:         request.orderId?._id || request.orderId,
                            returnRequestId: request._id,
                            userId:          request.userId?._id || request.userId,
                            amount:          request.refundAmount || 0,
                            referenceId:     `RETURN_REFUND_${request._id}`,
                            method:          request.refundDetails?.method === 'upi' ? 'upi' : 'bank_transfer',
                            bankDetails:     request.refundDetails?.bankDetails,
                            upiId:           request.refundDetails?.upiId,
                            status:          'requested',
                        }], { session }))[0];

                        // Auto-trigger Razorpay refund
                        if (order?.paymentStatus === 'paid') {
                            try {
                                const paidAttempt = await PaymentAttempt.findOne({
                                    orderId: order._id, status: 'paid',
                                }).session(session);
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
                            }
                        }

                        updatedRequest.refundId = refund._id;

                        // Vendor clawback
                        if (order?.escrowStatus === 'released' && request.vendorId) {
                            const commission = await Commission.findOne({
                                orderId:  order._id,
                                vendorId: request.vendorId,
                            }).session(session);

                            const clawbackAmount = commission?.vendorEarnings || 0;

                            if (clawbackAmount > 0) {
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
                                        walletBalanceAfter:  vendor.walletBalance,
                                        performedBy:         { role: 'admin', id: req.user?.id },
                                        relatedOrderId:      order._id,
                                        relatedRefundId:     refund._id,
                                    }], { session }))[0];

                                    await Refund.findByIdAndUpdate(refund._id,
                                        { vendorTransactionId: txn._id },
                                        { session }
                                    );

                                    if (vendor.walletBalance < 0) {
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
                } else {
                    // Generic Transition (intermediate statuses)
                    updatedRequest = await exchangeWorkflow.transition(request._id, request.status, status, actor, 'Status updated by admin.', session);
                }
            }

            if (adminNote !== undefined) {
                updatedRequest.adminNote = adminNote;
                await updatedRequest.save({ session });
            }
        });
    } finally {
        await session.endSession();
    }

    const freshRequest = await ReturnRequest.findById(request._id)
        .populate('userId', 'name email phone')
        .populate('orderId', 'orderId total items paymentStatus escrowStatus');
    if (freshRequest) {
        updatedRequest = freshRequest;
    }

    if (status && status !== request.status) {
        if (status === 'approved') {
            exchangeWorkflow.handlePostSaveApproval(request._id);
        } else if (status === 'replacement_ready') {
            exchangeWorkflow.handlePostSaveReplacementReady(request._id);
        }
    }

    notifyReturnUpdate(updatedRequest);

    const itemsText = buildExchangeSummary(updatedRequest);

    const notificationTasks = [];
    if (updatedRequest.userId?._id) {
        notificationTasks.push(
            createNotification({
                recipientId:   updatedRequest.userId._id,
                recipientType: 'user',
                title:         'Return request updated',
                message:       `Your return request for order ${updatedRequest.orderId?.orderId || updatedRequest.orderId} is now ${updatedRequest.status}.${itemsText}`,
                type:          'order',
                data: {
                    returnRequestId: String(updatedRequest._id),
                    orderId:         String(updatedRequest.orderId?.orderId || updatedRequest.orderId || ''),
                    status:          String(updatedRequest.status || ''),
                },
            })
        );
    }

    if (updatedRequest.vendorId) {
        notificationTasks.push(
            createNotification({
                recipientId:   updatedRequest.vendorId,
                recipientType: 'vendor',
                title:         'Return request updated by admin',
                message:       `Return request for order ${updatedRequest.orderId?.orderId || updatedRequest.orderId} is now ${updatedRequest.status}.${itemsText}`,
                type:          'order',
                data: {
                    returnRequestId: String(updatedRequest._id),
                    orderId:         String(updatedRequest.orderId?.orderId || updatedRequest.orderId || ''),
                    status:          String(updatedRequest.status || ''),
                },
            })
        );
    }

    if (notificationTasks.length > 0) await Promise.allSettled(notificationTasks);

    const normalized = normalizeReturnRequest(updatedRequest);
    res.status(200).json(new ApiResponse(200, normalized, 'Return request status updated successfully'));
});
