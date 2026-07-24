import ReturnRequest from '../../../models/ReturnRequest.model.js';
import Order from '../../../models/Order.model.js';
import User from '../../../models/User.model.js';
import Product from '../../../models/Product.model.js';
import Commission from '../../../models/Commission.model.js';
import Vendor from '../../../models/Vendor.model.js';
import VendorWalletTransaction from '../../../models/VendorWalletTransaction.model.js';
import Refund from '../../../models/Refund.model.js';
import { creditWallet } from '../../../services/wallet.service.js';
import PaymentAttempt from '../../../models/PaymentAttempt.model.js';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { createNotification } from '../../../services/notification.service.js';
import { initiateRefund } from '../../../services/payment.service.js';
import { buildReturnItemsSummary, buildExchangeSummary } from '../../../utils/notificationProductFormatter.js';
import ApiError from '../../../utils/ApiError.js';
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

    // Fetch reverse shipment with minimal DB overhead
    const Shipment = (await import('../../../models/Shipment.model.js')).default;
    const shipment = await Shipment.findOne({
        returnRequestId: request._id,
        type: 'reverse'
    }).lean().select('shipmentNumber providerId awbCode trackingUrl status errorNotes deliveryBoyId').populate('deliveryBoyId', 'name phone');

    if (shipment) {
        normalized.reverseShipment = {
            shipmentId: shipment._id,
            shipmentNumber: shipment.shipmentNumber,
            providerId: shipment.providerId,
            awbCode: shipment.awbCode,
            trackingUrl: shipment.trackingUrl,
            status: shipment.status,
            errorNotes: shipment.errorNotes,
            deliveryBoyId: shipment.deliveryBoyId
        };
    }

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
                        
                        // Process exchange price difference refund to wallet
                        const priceDelta = updatedRequest.exchangeDetails?.priceDelta;
                        if (priceDelta && priceDelta < 0) {
                            const refundAmount = Math.abs(priceDelta);
                            await creditWallet(
                                updatedRequest.userId?._id || updatedRequest.userId,
                                refundAmount,
                                'exchange_refund',
                                {
                                    returnRequestId: updatedRequest._id,
                                    orderId: updatedRequest.orderId?._id || updatedRequest.orderId,
                                    description: `Credited ₹${refundAmount} to wallet for exchange price difference on Return #${updatedRequest._id}`,
                                    reference: `EXCHANGE_DOWNGRADE_REFUND_${updatedRequest._id}`
                                },
                                session
                            );

                            await Refund.create([{
                                orderId: updatedRequest.orderId?._id || updatedRequest.orderId,
                                returnRequestId: updatedRequest._id,
                                userId: updatedRequest.userId?._id || updatedRequest.userId,
                                amount: refundAmount,
                                referenceId: `EXCHANGE_DOWNGRADE_REFUND_${updatedRequest._id}`,
                                method: 'wallet_credit',
                                destination: 'wallet',
                                status: 'completed',
                                notes: 'Exchange downgrade refund credited to wallet'
                            }], { session });

                            updatedRequest.exchangeDetails.priceDeltaStatus = 'refunded';
                            await updatedRequest.save({ session });
                        }
                    } else {
                        // Return completion logic + financial updates
                        const order = await Order.findById(request.orderId?._id || request.orderId).session(session);
                        if (!order) throw new ApiError(404, 'Associated order not found');

                        const commRecord = await Commission.findOne({
                            orderId: order._id,
                            vendorId: request.vendorId,
                            status: { $ne: 'cancelled' }
                        }).session(session);
                        const originalEarnings = commRecord ? (commRecord.vendorNetEarnings || commRecord.vendorEarnings || 0) : 0;

                        updatedRequest = await exchangeWorkflow.transition(request._id, request.status, 'completed', actor, 'Return completed by admin.', session);

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

                        const vendorCompletedReturns = await ReturnRequest.find({
                            orderId: order._id,
                            vendorId: request.vendorId,
                            status: 'completed',
                            _id: { $ne: request._id }
                        }).session(session);

                        const returnedQuantities = {};
                        const allReturns = [...vendorCompletedReturns, updatedRequest];
                        for (const ret of allReturns) {
                            if (Array.isArray(ret.items)) {
                                for (const retItem of ret.items) {
                                    const pid = String(retItem.productId || retItem.id || '');
                                    if (!returnedQuantities[pid]) returnedQuantities[pid] = 0;
                                    returnedQuantities[pid] += Number(retItem.quantity || 0);
                                }
                            }
                        }

                        const orderItems = Array.isArray(order.items) ? order.items : [];
                        const vendorItems = orderItems.filter(item => String(item.vendorId) === String(request.vendorId));
                        
                        let keptSubtotal = 0;
                        let totalItemsCount = 0;
                        let returnedItemsCount = 0;

                        for (const item of vendorItems) {
                            const pid = String(item.productId || item.id || '');
                            const purchasedQty = Number(item.quantity || 0);
                            const retQty = Number(returnedQuantities[pid] || 0);
                            const keptQty = Math.max(0, purchasedQty - retQty);
                            
                            keptSubtotal += item.price * keptQty;
                            totalItemsCount += purchasedQty;
                            returnedItemsCount += retQty;
                        }

                        if (returnedItemsCount >= totalItemsCount || keptSubtotal <= 0) {
                            await Commission.updateMany(
                                {
                                    orderId: order._id,
                                    vendorId: request.vendorId,
                                    status: { $ne: 'cancelled' },
                                },
                                {
                                    $set: {
                                        status: 'cancelled',
                                        paidAt: null,
                                        settlementId: null,
                                        subtotal: 0,
                                        discountShare: 0,
                                        effectiveSubtotal: 0,
                                        commission: 0,
                                        vendorEarnings: 0,
                                        vendorSubtotal: 0,
                                        vendorCouponDiscount: 0,
                                        vendorDiscountedSubtotal: 0,
                                        vendorTax: 0,
                                        vendorTotalPaidByCustomer: 0,
                                        commissionAmount: 0,
                                        vendorNetEarnings: 0,
                                        escrowAmount: 0,
                                        escrowStatus: 'refunded',
                                        settlementStatus: 'cancelled',
                                        releasedAt: null
                                    },
                                },
                                { session }
                            );
                        } else {
                            const comm = await Commission.findOne({
                                orderId: order._id,
                                vendorId: request.vendorId,
                                status: { $ne: 'cancelled' }
                            }).session(session);
                            if (comm) {
                                const originalDiscountShare = comm.discountShare !== undefined ? comm.discountShare : 0;
                                const originalSubtotal = comm.subtotal || 0;
                                
                                let newDiscountShare = 0;
                                if (originalSubtotal > 0) {
                                    newDiscountShare = parseFloat((keptSubtotal * (originalDiscountShare / originalSubtotal)).toFixed(2));
                                }
                                
                                if (newDiscountShare > keptSubtotal) {
                                    newDiscountShare = keptSubtotal;
                                }
                                
                                const newEffectiveSubtotal = parseFloat((keptSubtotal - newDiscountShare).toFixed(2));
                                const newCommission = parseFloat(((newEffectiveSubtotal * comm.commissionRate) / 100).toFixed(2));
                                const newVendorEarnings = parseFloat((newEffectiveSubtotal - newCommission).toFixed(2));
                                
                                let itemDiscountSum = 0;
                                let newVendorTax = 0;
                                
                                const sortedVendorItems = [...vendorItems].sort((a, b) =>
                                    String(a.productId || a.id).localeCompare(String(b.productId || b.id))
                                );
                                
                                sortedVendorItems.forEach((item, index) => {
                                    const pid = String(item.productId || item.id || '');
                                    const purchasedQty = Number(item.quantity || 0);
                                    const retQty = Number(returnedQuantities[pid] || 0);
                                    const keptQty = Math.max(0, purchasedQty - retQty);
                                    
                                    if (keptQty > 0) {
                                        const itemSub = item.price * keptQty;
                                        let itemDiscountShare = 0;
                                        
                                        if (newDiscountShare > 0 && keptSubtotal > 0) {
                                            const isLastKept = sortedVendorItems.slice(index + 1).every(rem => {
                                                const rPid = String(rem.productId || rem.id || '');
                                                const rPurchasedQty = Number(rem.quantity || 0);
                                                const rRetQty = Number(returnedQuantities[rPid] || 0);
                                                return Math.max(0, rPurchasedQty - rRetQty) <= 0;
                                            });
                                            
                                            if (isLastKept) {
                                                itemDiscountShare = parseFloat((newDiscountShare - itemDiscountSum).toFixed(2));
                                            } else {
                                                itemDiscountShare = parseFloat(((newDiscountShare * itemSub) / keptSubtotal).toFixed(2));
                                                itemDiscountSum = parseFloat((itemDiscountSum + itemDiscountShare).toFixed(2));
                                            }
                                        }
                                        
                                        const discountedItemSubtotal = parseFloat((itemSub - itemDiscountShare).toFixed(2));
                                        const taxRate = Number(item.taxRate !== undefined ? item.taxRate : 18);
                                        const itemTax = parseFloat(((discountedItemSubtotal * taxRate) / 100).toFixed(2));
                                        newVendorTax = parseFloat((newVendorTax + itemTax).toFixed(2));
                                    }
                                });
                                
                                const vi = (order.vendorItems || []).find(vItem => String(vItem.vendorId) === String(request.vendorId)) || {};
                                const newTotalPaid = parseFloat((newEffectiveSubtotal + (vi.shipping || 0) + newVendorTax).toFixed(2));

                                comm.subtotal = keptSubtotal;
                                comm.discountShare = newDiscountShare;
                                comm.effectiveSubtotal = newEffectiveSubtotal;
                                comm.commission = newCommission;
                                comm.vendorEarnings = newVendorEarnings;
                                
                                comm.vendorSubtotal = keptSubtotal;
                                comm.vendorCouponDiscount = newDiscountShare;
                                comm.vendorDiscountedSubtotal = newEffectiveSubtotal;
                                comm.vendorTax = newVendorTax;
                                comm.vendorTotalPaidByCustomer = newTotalPaid;
                                comm.commissionAmount = newCommission;
                                comm.vendorNetEarnings = newVendorEarnings;
                                comm.escrowAmount = newVendorEarnings;
                                
                                await comm.save({ session });
                            }
                        }

                        const refundAmount = request.refundAmount || 0;

                        if (refundAmount > 0) {
                            await creditWallet(
                                request.userId?._id || request.userId,
                                refundAmount,
                                'return_refund',
                                {
                                    returnRequestId: request._id,
                                    orderId: order._id,
                                    description: `Refunded ₹${refundAmount} to wallet for Return #${request._id}`,
                                    reference: `RETURN_REFUND_${request._id}`
                                },
                                session
                            );
                        }

                        const refund = (await Refund.create([{
                            orderId:         request.orderId?._id || request.orderId,
                            returnRequestId: request._id,
                            userId:          request.userId?._id || request.userId,
                            amount:          refundAmount,
                            referenceId:     `RETURN_REFUND_${request._id}`,
                            method:          'wallet_credit',
                            destination:     'wallet',
                            status:          'completed',
                            notes:           'Refund credited to customer wallet'
                        }], { session }))[0];

                        updatedRequest.refundId = refund._id;
                        updatedRequest.refundStatus = 'processed';

                        const allItemsReturned = returnedItemsCount >= totalItemsCount || keptSubtotal <= 0;
                        const isEscrowReleased = order.escrowStatus === 'released';

                        if (isEscrowReleased) {
                            const clawbackAmount = parseFloat(Math.max(0, originalEarnings - (allItemsReturned ? 0 : (commRecord ? (commRecord.vendorNetEarnings || commRecord.vendorEarnings || 0) : 0))).toFixed(2));
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
                        } else {
                            let newEarnings = 0;
                            if (!allItemsReturned && commRecord) {
                                const freshComm = await Commission.findOne({
                                    orderId: order._id,
                                    vendorId: request.vendorId,
                                    status: { $ne: 'cancelled' }
                                }).session(session);
                                if (freshComm) {
                                    newEarnings = freshComm.vendorNetEarnings || freshComm.vendorEarnings || 0;
                                }
                            }
                            const decrementAmount = parseFloat(Math.max(0, originalEarnings - newEarnings).toFixed(2));

                            if (decrementAmount > 0) {
                                await Vendor.findByIdAndUpdate(
                                    request.vendorId,
                                    { $inc: { onHoldBalance: -decrementAmount } },
                                    { session }
                                );
                                console.log('[FINANCIAL_EVENT] Admin complete: onHoldBalance decremented', {
                                    vendorId: String(request.vendorId),
                                    amount: decrementAmount
                                });
                            }
                        }

                        if (allItemsReturned) {
                            if (order.status !== 'cancelled') {
                                order.status = 'returned';
                            }
                            order.paymentStatus = 'refunded';
                            order.escrowStatus = 'refunded';
                        } else {
                            order.status = 'delivered';
                            order.escrowStatus = isEscrowReleased ? 'released' : 'held';
                        }
                        await order.save({ session });
                        notifyOrderUpdate(order);
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

/**
 * @desc    Manually reassign/retry reverse pickup for a failed return shipment
 * @route   POST /api/admin/return-requests/:id/reassign
 * @access  Private (Admin)
 */
export const reassignReversePickup = asyncHandler(async (req, res) => {
    const { overrideProviderId, reason } = req.body;

    const request = await ReturnRequest.findById(req.params.id);
    if (!request) {
        throw new ApiError(404, 'Return request not found');
    }

    // Capture old state for audit
    const Shipment = (await import('../../../models/Shipment.model.js')).default;
    const oldShipment = await Shipment.findOne({ returnRequestId: request._id, type: 'reverse' }).lean();
    
    const reverseEngine = (await import('../../../services/reverseEngine.service.js')).default;
    
    const adminId = req.user?._id || req.user?.id || new mongoose.Types.ObjectId();
    const adminName = req.user?.name || 'Admin';

    // Call engine (idempotency is handled securely inside the engine)
    const engineResult = await reverseEngine.processReturn(request._id, {
        overrideProviderId,
        manualAdminId: adminId
    });

    if (!engineResult.success) {
        throw new ApiError(500, `Reassignment failed: ${engineResult.error || engineResult.reason}`);
    }

    // Add audit log to ReturnRequest
    request.statusHistory.push({
        status: request.status,
        changedAt: new Date(),
        notes: `[Manual Reassignment] Provider changed from ${oldShipment?.providerId || 'None'} to ${engineResult.providerId}. Status changed from ${oldShipment?.status || 'None'} to pickup_scheduled. Reason: ${reason || 'N/A'}`,
        performedById: adminId,
        performedByName: adminName,
        performedByRole: 'admin'
    });
    
    await request.save();

    res.status(200).json(new ApiResponse(200, engineResult, 'Reverse pickup reassigned successfully'));
});
