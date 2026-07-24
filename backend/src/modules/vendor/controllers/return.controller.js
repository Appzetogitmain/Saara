import mongoose from 'mongoose';
import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import ReturnRequest from '../../../models/ReturnRequest.model.js';
import Refund from '../../../models/Refund.model.js';
import { creditWallet } from '../../../services/wallet.service.js';
import PaymentAttempt from '../../../models/PaymentAttempt.model.js';
import Vendor from '../../../models/Vendor.model.js';
import crypto from 'crypto';
import Order from '../../../models/Order.model.js';
import Product from '../../../models/Product.model.js';
import Commission from '../../../models/Commission.model.js';
import User from '../../../models/User.model.js';
import Admin from '../../../models/Admin.model.js';
import { createNotification } from '../../../services/notification.service.js';
import { initiateRefund } from '../../../services/payment.service.js';
import { buildReturnItemsSummary, buildExchangeSummary } from '../../../utils/notificationProductFormatter.js';
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

const normalizeReturnRequest = (requestDoc) => {
    const request = requestDoc.toObject ? requestDoc.toObject() : requestDoc;
    const orderOrderId = request.orderId?.orderId;
    const orderRefId = request.orderId?._id ?? request.orderId ?? null;

    return {
        ...request,
        id: String(request._id),
        customer: request.userId
            ? {
                name: request.userId.name ?? 'Guest',
                email: request.userId.email ?? 'N/A',
                phone: request.userId.phone ?? '',
            }
            : { name: 'Guest', email: 'N/A', phone: '' },
        orderId: orderOrderId || String(orderRefId || ''),
        orderRefId: orderRefId ? String(orderRefId) : null,
        requestDate: request.createdAt,
        rejectionReason: request.rejectionReason || request.adminNote || '',
        items: enrichReturnItems(request),
    };
};

// GET /api/vendor/return-requests
export const getVendorReturnRequests = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, search = '', status } = req.query;
    const numericPage = Math.max(1, Number(page) || 1);
    const numericLimit = Math.max(1, Number(limit) || 20);

    const filter = { vendorId: req.user.id };
    if (status && status !== 'all') {
        filter.status = status;
    }

    if (search) {
        const regex = new RegExp(search, 'i');
        const isObjectId = /^[0-9a-fA-F]{24}$/.test(search);

        const [matchedOrders, matchedUsers] = await Promise.all([
            Order.find({ orderId: regex }).select('_id').lean(),
            User.find({
                $or: [{ name: regex }, { email: regex }, { phone: regex }],
            })
                .select('_id')
                .limit(200)
                .lean(),
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

        filter.$or = orFilters;
    }

    const [requests, total] = await Promise.all([
        ReturnRequest.find(filter)
            .populate('userId', 'name email phone')
            .populate('orderId', 'orderId total items vendorItems status paymentStatus')
            .sort({ createdAt: -1 })
            .skip((numericPage - 1) * numericLimit)
            .limit(numericLimit),
        ReturnRequest.countDocuments(filter),
    ]);

    const normalized = requests.map(normalizeReturnRequest);
    res.status(200).json(
        new ApiResponse(
            200,
            {
                returnRequests: normalized,
                pagination: {
                    total,
                    page: numericPage,
                    limit: numericLimit,
                    pages: Math.ceil(total / numericLimit),
                },
            },
            'Return requests fetched.'
        )
    );
});

// GET /api/vendor/return-requests/:id
export const getVendorReturnRequestById = asyncHandler(async (req, res) => {
    const request = await ReturnRequest.findOne({
        _id: req.params.id,
        vendorId: req.user.id,
    })
        .populate('userId', 'name email phone')
        .populate('orderId', 'orderId total createdAt items vendorItems status paymentStatus')
        .populate('deliveryBoyId', 'name phone email');

    if (!request) throw new ApiError(404, 'Return request not found.');

    const normalized = normalizeReturnRequest(request);

    const Shipment = (await import('../../../models/Shipment.model.js')).default;
    const shipment = await Shipment.findOne({
        returnRequestId: request._id,
        type: 'reverse'
    }).lean().select('shipmentNumber providerId awbCode trackingUrl status deliveryBoyId').populate('deliveryBoyId', 'name phone');

    if (shipment) {
        normalized.reverseShipment = {
            shipmentId: shipment._id,
            shipmentNumber: shipment.shipmentNumber,
            providerId: shipment.providerId,
            awbCode: shipment.awbCode,
            trackingUrl: shipment.trackingUrl,
            status: shipment.status,
            deliveryBoyId: shipment.deliveryBoyId
        };
    }

    res.status(200).json(
        new ApiResponse(200, normalized, 'Return request fetched.')
    );
});

// PATCH /api/vendor/return-requests/:id/status
export const updateVendorReturnRequestStatus = asyncHandler(async (req, res) => {
    const { status, refundStatus, rejectionReason } = req.body;
    const allowedRefundStatuses = ['pending', 'processed', 'failed'];
    const refundTransitions = {
        pending: ['processed', 'failed'],
        failed: ['processed'],
        processed: [],
    };

    if (status && !ALLOWED_STATUSES.includes(status)) {
        throw new ApiError(400, `Status must be one of: ${ALLOWED_STATUSES.join(', ')}`);
    }
    if (refundStatus && !allowedRefundStatuses.includes(refundStatus)) {
        throw new ApiError(
            400,
            `Refund status must be one of: ${allowedRefundStatuses.join(', ')}`
        );
    }

    const request = await ReturnRequest.findOne({
        _id: req.params.id,
        vendorId: req.user.id,
    })
        .populate('userId', 'name email phone')
        .populate('orderId', 'orderId total items vendorItems status paymentStatus escrowStatus');
    if (!request) throw new ApiError(404, 'Return request not found.');

    const isExchange = request.requestType === 'exchange';
    const transitionMap = isExchange ? EXCHANGE_TRANSITIONS : RETURN_TRANSITIONS;

    const nextStatus = status || request.status;
    const nextRefundStatus = refundStatus || request.refundStatus;
    const nextRejectionReason = rejectionReason !== undefined
        ? String(rejectionReason || '').trim()
        : String(request.rejectionReason || '');
    const statusUnchanged = nextStatus === request.status;
    const refundUnchanged = nextRefundStatus === request.refundStatus;
    const rejectionReasonUnchanged =
        rejectionReason === undefined || nextRejectionReason === String(request.rejectionReason || '');

    if (statusUnchanged && refundUnchanged && rejectionReasonUnchanged) {
        return res.status(200).json(
            new ApiResponse(200, normalizeReturnRequest(request), 'No changes applied.')
        );
    }

    const vendorAllowedStatuses = ['approved', 'rejected', 'replacement_preparing', 'replacement_ready', 'completed'];
    if (status && !vendorAllowedStatuses.includes(status)) {
        throw new ApiError(400, `Vendors are not authorized to update status to '${status}'. Only delivery partners and system triggers can update delivery states.`);
    }

    if (status && status !== request.status) {
        const allowedNext = transitionMap[request.status] || [];
        if (!allowedNext.includes(status)) {
            throw new ApiError(400, `Invalid transition. Cannot move return request from ${request.status} to ${status}.`);
        }
    }

    const currentRefundStatus = request.refundStatus || 'pending';
    if (refundStatus && refundStatus !== request.refundStatus) {
        const allowedRefundNext = refundTransitions[currentRefundStatus] || [];
        if (!allowedRefundNext.includes(refundStatus)) {
            throw new ApiError(400, `Invalid transition. Cannot move refund status from ${currentRefundStatus} to ${refundStatus}.`);
        }
    }

    const actor = {
        id: req.user._id || req.user.id,
        name: req.user.storeName || req.user.shopName || 'Vendor',
        role: 'vendor'
    };

    const session = await mongoose.startSession();
    let updatedRequest = request;

    try {
        await session.withTransaction(async () => {
            if (status && status !== request.status) {
                if (status === 'approved') {
                    updatedRequest = await exchangeWorkflow.approve(request._id, 'pending', actor, session);
                } else if (status === 'rejected') {
                    updatedRequest = await exchangeWorkflow.reject(request._id, request.status, rejectionReason, actor, session);
                } else if (status === 'replacement_preparing') {
                    const order = await Order.findById(request.orderId?._id || request.orderId).session(session);
                    updatedRequest = await exchangeWorkflow.prepareReplacement(request._id, 'delivered_to_vendor', order, actor, session);
                } else if (status === 'replacement_ready') {
                    if (request.status === 'delivered_to_vendor') {
                        const order = await Order.findById(request.orderId?._id || request.orderId).session(session);
                        updatedRequest = await exchangeWorkflow.prepareReplacement(request._id, 'delivered_to_vendor', order, actor, session);
                    }
                    updatedRequest = await exchangeWorkflow.markReplacementReady(request._id, updatedRequest.status, actor, session);
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
                        // Returns completions + financial logic (reversals, clawbacks, refunds)
                        updatedRequest = await exchangeWorkflow.transition(request._id, request.status, 'completed', actor, 'Return completed. Refund processed.', session);
                        
                        const order = await Order.findById(request.orderId?._id || request.orderId).session(session);
                        if (order && order.isDeleted !== true) {
                            const stockRestores = (request.items || []).map(async (item) => {
                                const qty = Number(item?.quantity || 0);
                                if (!item?.productId || qty <= 0) return;

                                const product = await Product.findById(item.productId).session(session);
                                if (!product) return;

                                const orderItem = order.items.find(it => String(it.productId) === String(product._id));
                                const oldVariantKey = resolveOrderItemVariantKey(product, orderItem);

                                if (oldVariantKey) {
                                    const getStockFromMap = (stockMap, key) => {
                                        if (!stockMap) return 0;
                                        if (typeof stockMap.get === 'function') return Number(stockMap.get(key) || 0);
                                        return Number(stockMap[key] || 0);
                                    };
                                    const currentVarStock = getStockFromMap(product.variants?.stockMap, oldVariantKey);
                                    product.variants?.stockMap?.set(oldVariantKey, currentVarStock + qty);
                                }

                                product.stockQuantity += qty;
                                if (product.stockQuantity <= 0) product.stock = 'out_of_stock';
                                else if (product.stockQuantity <= product.lowStockThreshold) product.stock = 'low_stock';
                                else product.stock = 'in_stock';

                                await product.save({ session });
                            });
                            await Promise.all(stockRestores);

                            const commRecord = await Commission.findOne({
                                orderId: order._id,
                                vendorId: req.user.id,
                                status: { $ne: 'cancelled' }
                            }).session(session);
                            const originalEarnings = commRecord ? (commRecord.vendorNetEarnings || commRecord.vendorEarnings || 0) : 0;

                            const vendorCompletedReturns = await ReturnRequest.find({
                                orderId: order._id,
                                vendorId: req.user.id,
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
                            const vendorItems = orderItems.filter(item => String(item.vendorId) === String(req.user.id));
                            
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
                                        vendorId: req.user.id,
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
                                    vendorId: req.user.id,
                                    status: { $ne: 'cancelled' }
                                }).session(session);
                                if (comm) {
                                    if (order.legacyFinancialSnapshot) {
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
                                        
                                        const vi = (order.vendorItems || []).find(vItem => String(vItem.vendorId) === String(req.user.id)) || {};
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
                                    } else {
                                        let newDiscountShare = 0;
                                        let newEffectiveSubtotal = 0;
                                        let newCommission = 0;
                                        let newVendorEarnings = 0;
                                        let newVendorTax = 0;

                                        vendorItems.forEach(item => {
                                            const pid = String(item.productId || item.id || '');
                                            const purchasedQty = Number(item.quantity || 1);
                                            const retQty = Number(returnedQuantities[pid] || 0);
                                            const keptQty = Math.max(0, purchasedQty - retQty);

                                            if (keptQty > 0) {
                                                const factor = keptQty / purchasedQty;
                                                newDiscountShare += (item.couponDiscount || 0) * factor;
                                                newEffectiveSubtotal += (item.baseAmount || 0) * factor;
                                                newCommission += (item.commissionAmount || 0) * factor;
                                                newVendorEarnings += (item.vendorEarnings || 0) * factor;
                                                newVendorTax += (item.taxAmount || 0) * factor;
                                            }
                                        });

                                        newDiscountShare = parseFloat(newDiscountShare.toFixed(2));
                                        newEffectiveSubtotal = parseFloat(newEffectiveSubtotal.toFixed(2));
                                        newCommission = parseFloat(newCommission.toFixed(2));
                                        newVendorEarnings = parseFloat(newVendorEarnings.toFixed(2));
                                        newVendorTax = parseFloat(newVendorTax.toFixed(2));

                                        const vi = (order.vendorItems || []).find(vItem => String(vItem.vendorId) === String(req.user.id)) || {};
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
                                    }
                                    
                                    await comm.save({ session });
                                }
                            }

                            const allItemsReturnedCalculated = returnedItemsCount >= totalItemsCount || keptSubtotal <= 0;
                            let newEarnings = 0;
                            if (!allItemsReturnedCalculated && commRecord) {
                                const freshComm = await Commission.findOne({
                                    orderId: order._id,
                                    vendorId: req.user.id,
                                    status: { $ne: 'cancelled' }
                                }).session(session);
                                if (freshComm) {
                                    newEarnings = freshComm.vendorNetEarnings || freshComm.vendorEarnings || 0;
                                }
                            }
                            const decrementAmount = parseFloat(Math.max(0, originalEarnings - newEarnings).toFixed(2));

                            if (decrementAmount > 0) {
                                await Vendor.findByIdAndUpdate(
                                    req.user.id,
                                    { $inc: { onHoldBalance: -decrementAmount } },
                                    { session }
                                );
                                console.log('[FINANCIAL_EVENT] onHoldBalance decremented on return', {
                                    vendorId: String(req.user.id),
                                    amount: decrementAmount
                                });
                            }

                            const completedReturnRequests = await ReturnRequest.find({
                                orderId: order._id,
                                status: 'completed',
                                _id: { $ne: request._id }
                            }).session(session);
                            const allOrderCompletedReturns = [...completedReturnRequests, updatedRequest];

                            const returnedQuantitiesMap = {};
                            const matchedTrack = new Set();
                            const allOrderItems = Array.isArray(order.items) ? order.items : [];

                            for (const ret of allOrderCompletedReturns) {
                                if (Array.isArray(ret.items)) {
                                    for (const retItem of ret.items) {
                                        const matchedOrderItem = findMatchingOrderItem(retItem, allOrderItems, matchedTrack);
                                        const identifier = matchedOrderItem ? getOrderItemIdentifier(matchedOrderItem) : (retItem.orderItemId || String(retItem.productId));
                                        if (matchedOrderItem) {
                                            matchedTrack.add(String(matchedOrderItem._id));
                                        }

                                        if (!returnedQuantitiesMap[identifier]) {
                                            returnedQuantitiesMap[identifier] = 0;
                                        }
                                        returnedQuantitiesMap[identifier] += Number(retItem.quantity || 0);
                                    }
                                }
                            }

                            let allItemsReturned = true;
                            for (const item of allOrderItems) {
                                const identifier = getOrderItemIdentifier(item);
                                const purchasedQty = Number(item.quantity || 0);
                                const returnedQty = Number(returnedQuantitiesMap[identifier] || 0);
                                if (returnedQty < purchasedQty) {
                                    allItemsReturned = false;
                                    break;
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
                                orderId: order._id,
                                returnRequestId: request._id,
                                userId: request.userId?._id || request.userId,
                                amount: refundAmount,
                                referenceId: `RETURN_REFUND_${request._id}`,
                                method: 'wallet_credit',
                                destination: 'wallet',
                                status: 'completed',
                                notes: 'Refund credited to customer wallet'
                            }], { session }))[0];

                            updatedRequest.refundId = refund._id;
                            updatedRequest.refundStatus = 'processed';

                            if (allItemsReturned) {
                                if (order.status !== 'cancelled') {
                                    order.status = 'returned';
                                }
                                order.paymentStatus = 'refunded';
                                order.escrowStatus = 'refunded';
                            } else {
                                order.status = 'delivered';
                                order.escrowStatus = 'held';
                            }
                            await order.save({ session });
                            notifyOrderUpdate(order);
                        }
                    }
                }
            } else {
                if (status) {
                    updatedRequest = await exchangeWorkflow.transition(request._id, request.status, status, actor, 'Status updated by vendor.', session);
                }
            }

            if (refundStatus && refundStatus !== request.refundStatus) {
                updatedRequest.refundStatus = refundStatus;
                await updatedRequest.save({ session });
            }
        });
    } finally {
        await session.endSession();
    }

    const freshRequest = await ReturnRequest.findById(request._id)
        .populate('userId', 'name email phone')
        .populate('orderId', 'orderId total items vendorItems status paymentStatus');
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

    const notificationTasks = [
        createNotification({
            recipientId: req.user.id,
            recipientType: 'vendor',
            title: 'Return request updated',
            message: `Return request for order ${updatedRequest.orderId?.orderId || updatedRequest.orderId} updated to ${updatedRequest.status}.${itemsText}`,
            type: 'order',
            data: {
                returnRequestId: String(updatedRequest._id),
                orderId: String(updatedRequest.orderId?.orderId || updatedRequest.orderId || ''),
                status: String(updatedRequest.status),
                refundStatus: String(updatedRequest.refundStatus || ''),
            },
        }),
    ];

    if (updatedRequest.userId?._id) {
        notificationTasks.push(
            createNotification({
                recipientId: updatedRequest.userId._id,
                recipientType: 'user',
                title: 'Return request status updated',
                message: `Your return request for order ${updatedRequest.orderId?.orderId || updatedRequest.orderId} is now ${updatedRequest.status}.${itemsText}`,
                type: 'order',
                data: {
                    returnRequestId: String(updatedRequest._id),
                    orderId: String(updatedRequest.orderId?.orderId || updatedRequest.orderId || ''),
                    status: String(updatedRequest.status),
                    refundStatus: String(updatedRequest.refundStatus || ''),
                },
            })
        );
    }

    const admins = await Admin.find({ isActive: true }).select('_id').lean();
    admins.forEach((admin) => {
        notificationTasks.push(
            createNotification({
                recipientId: admin._id,
                recipientType: 'admin',
                title: 'Return request updated',
                message: `Return request for order ${updatedRequest.orderId?.orderId || updatedRequest.orderId} moved to ${updatedRequest.status}.${itemsText}`,
                type: 'order',
                data: {
                    returnRequestId: String(updatedRequest._id),
                    orderId: String(updatedRequest.orderId?.orderId || updatedRequest.orderId || ''),
                    status: String(updatedRequest.status),
                    refundStatus: String(updatedRequest.refundStatus || ''),
                },
            })
        );
    });

    await Promise.allSettled(notificationTasks);

    res.status(200).json(
        new ApiResponse(
            200,
            normalizeReturnRequest(request),
            'Return request status updated.'
        )
    );
});

// POST /api/vendor/return-requests/:id/verify-handoff-otp
export const verifyHandoffOtp = asyncHandler(async (req, res) => {
    const { otp } = req.body;
    if (!otp) throw new ApiError(400, 'Handoff OTP is required.');

    const request = await ReturnRequest.findOne({
        _id: req.params.id,
        vendorId: req.user.id
    }).populate('orderId', 'orderId');

    if (!request) throw new ApiError(404, 'Return request not found.');

    if (request.status !== 'picked_up') {
        throw new ApiError(400, `Cannot verify handoff OTP. Return request is in status: ${request.status}`);
    }

    if (request.vendorHandoffOtpAttempts >= 5) {
        throw new ApiError(400, 'Verification locked. Maximum verification attempts reached (5).');
    }

    if (!request.vendorHandoffOtpExpiresAt || Date.now() > new Date(request.vendorHandoffOtpExpiresAt)) {
        throw new ApiError(400, 'Handoff OTP has expired.');
    }

    const hashedInput = crypto.createHash('sha256').update(String(otp).trim()).digest('hex');
    if (hashedInput !== request.vendorHandoffOtpHash) {
        request.vendorHandoffOtpAttempts += 1;
        await request.save();
        notifyReturnUpdate(request);
        const remaining = 5 - request.vendorHandoffOtpAttempts;
        throw new ApiError(400, `Incorrect OTP. ${remaining} attempts remaining.`);
    }

    request.vendorHandoffOtpVerified = true;
    request.vendorHandoffOtpAttempts = 0;
    request.status = 'delivered_to_vendor';
    await request.save();
    notifyReturnUpdate(request);

    // Trigger notification tasks
    const notificationTasks = [];
    if (request.userId) {
        const itemsText = buildReturnItemsSummary(request.items);
        notificationTasks.push(
            createNotification({
                recipientId: request.userId,
                recipientType: 'user',
                title: 'Returned items delivered to vendor',
                message: `Rider has delivered the returned items for order ${request.orderId?.orderId || ''} to the vendor. Awaiting inspection.${itemsText}`,
                type: 'order',
                data: { returnRequestId: String(request._id), status: 'delivered_to_vendor' }
            })
        );
    }
    await Promise.allSettled(notificationTasks);

    return res.status(200).json(
        new ApiResponse(200, normalizeReturnRequest(request), 'Handoff OTP verified successfully. Return marked as delivered to vendor.')
    );
});
