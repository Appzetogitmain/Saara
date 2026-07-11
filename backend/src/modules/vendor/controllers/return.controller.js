import mongoose from 'mongoose';
import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import ReturnRequest from '../../../models/ReturnRequest.model.js';
import crypto from 'crypto';
import Order from '../../../models/Order.model.js';
import Product from '../../../models/Product.model.js';
import Commission from '../../../models/Commission.model.js';
import User from '../../../models/User.model.js';
import Admin from '../../../models/Admin.model.js';
import { createNotification } from '../../../services/notification.service.js';
import { autoAssignReturnPickupPartner, autoAssignExchangeReplacementPartner } from '../../../services/assignmentService.js';
import { notifyOrderUpdate, notifyReturnUpdate } from '../../../services/socket.service.js';

const normalizeVariantPart = (value) => String(value || '').trim().toLowerCase();
const normalizeAxisName = (value) =>
    String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');

const toVariantStockEntries = (stockMap) => {
    if (!stockMap) return [];
    if (typeof stockMap.entries === 'function') return [...stockMap.entries()];
    return Object.entries(stockMap);
};

const toVariantPriceEntries = (prices) => {
    if (!prices) return [];
    if (typeof prices.entries === 'function') return [...prices.entries()];
    return Object.entries(prices);
};

const createDynamicVariantKey = (selection = {}) => {
    const keys = Object.keys(selection).sort();
    if (!keys.length) return null;
    return keys.map((k) => `${k}:${selection[k]}`).join('|');
};

const resolveOrderItemVariantKey = (product, orderItem) => {
    const explicitKey = String(orderItem?.variantKey || '').trim();
    if (explicitKey) return explicitKey;

    const stockEntries = toVariantStockEntries(product?.variants?.stockMap).map(([k]) => String(k).trim());
    const priceEntries = toVariantPriceEntries(product?.variants?.prices).map(([k]) => String(k).trim());
    const existingKeys = [...new Set([...stockEntries, ...priceEntries])];
    if (!existingKeys.length) return null;

    const dynamicSelection = Object.entries(orderItem?.variant || {}).reduce((acc, [axis, value]) => {
        const axisKey = normalizeAxisName(axis);
        const selectedValue = String(value || '').trim();
        if (axisKey && selectedValue) acc[axisKey] = selectedValue;
        return acc;
    }, {});
    const dynamicKey = createDynamicVariantKey(dynamicSelection);
    if (dynamicKey) {
        const exactDynamic = existingKeys.find((key) => key === dynamicKey);
        if (exactDynamic) return exactDynamic;
        const normalizedDynamic = existingKeys.find(
            (key) => normalizeVariantPart(key) === normalizeVariantPart(dynamicKey)
        );
        if (normalizedDynamic) return normalizedDynamic;
    }

    const size = normalizeVariantPart(orderItem?.variant?.size);
    const color = normalizeVariantPart(orderItem?.variant?.color);
    if (!size && !color) return null;

    const candidates = [
        `${size}|${color}`,
        `${size}-${color}`,
        `${size}_${color}`,
        `${size}:${color}`,
        size && !color ? size : null,
        color && !size ? color : null,
    ].filter(Boolean);

    for (const candidate of candidates) {
        const exact = existingKeys.find((key) => key === candidate);
        if (exact) return exact;
        const normalized = existingKeys.find((key) => normalizeVariantPart(key) === normalizeVariantPart(candidate));
        if (normalized) return normalized;
    }
    return null;
};


const getVariantKeyFromVariant = (variant) => {
    if (!variant) return '';
    const size = variant.size ? String(variant.size).trim().toLowerCase() : '';
    const color = variant.color ? String(variant.color).trim().toLowerCase() : '';
    if (size && color) return `${size}|${color}`;
    return size || color || '';
};

const getOrderItemIdentifier = (item) => {
    if (item.orderItemId) return String(item.orderItemId);
    if (item._id) return String(item._id);
    const variantKey = item.variantKey || (item.variant ? getVariantKeyFromVariant(item.variant) : '');
    if (variantKey) return `${String(item.productId)}_${variantKey}`;
    return String(item.productId);
};

const findMatchingOrderItem = (retItem, orderItems, matchedTrack = new Set()) => {
    const candidates = orderItems.filter(item => String(item.productId) === String(retItem.productId));
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];

    // 1. Prefer orderItemId
    if (retItem.orderItemId) {
        const match = candidates.find(item => String(item._id) === String(retItem.orderItemId) || String(item.orderItemId) === String(retItem.orderItemId));
        if (match) return match;
    }

    // 2. Fallback: productId + variantKey
    const retVariantKey = retItem.variantKey || (retItem.variant ? getVariantKeyFromVariant(retItem.variant) : '');
    if (retVariantKey) {
        const match = candidates.find(item => {
            const itemVariantKey = item.variantKey || (item.variant ? getVariantKeyFromVariant(item.variant) : '');
            return itemVariantKey === retVariantKey;
        });
        if (match) return match;
    }

    // 3. Last fallback: Try to match any candidate not fully matched in matchedTrack
    for (const candidate of candidates) {
        const key = String(candidate._id);
        if (!matchedTrack.has(key)) {
            return candidate;
        }
    }
    return candidates[0];
};

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
        .populate('orderId', 'orderId total createdAt items vendorItems status paymentStatus');

    if (!request) throw new ApiError(404, 'Return request not found.');

    res.status(200).json(
        new ApiResponse(200, normalizeReturnRequest(request), 'Return request fetched.')
    );
});

// PATCH /api/vendor/return-requests/:id/status
export const updateVendorReturnRequestStatus = asyncHandler(async (req, res) => {
    const { status, refundStatus, rejectionReason } = req.body;
    const allowedStatuses = [
        'pending',
        'approved',
        'pickup_pending',
        'pickup_assigned',
        'picked_up',
        'delivered_to_vendor',
        'replacement_preparing',
        'replacement_ready',
        'replacement_assigned',
        'out_for_delivery',
        'completed',
        'rejected'
    ];
    const allowedRefundStatuses = ['pending', 'processed', 'failed'];
    const statusTransitions = {
        pending: ['approved', 'rejected'],
        approved: ['pickup_pending'],
        pickup_pending: ['pickup_assigned'],
        pickup_assigned: ['picked_up'],
        picked_up: ['delivered_to_vendor'],
        delivered_to_vendor: ['completed', 'replacement_preparing', 'rejected'],
        replacement_preparing: ['replacement_ready'],
        replacement_ready: ['replacement_assigned'],
        replacement_assigned: ['out_for_delivery'],
        out_for_delivery: ['completed'],
        completed: [],
        rejected: [],
    };
    const refundTransitions = {
        pending: ['processed', 'failed'],
        failed: ['processed'],
        processed: [],
    };

    if (status && !allowedStatuses.includes(status)) {
        throw new ApiError(400, `Status must be one of: ${allowedStatuses.join(', ')}`);
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
        .populate('orderId', 'orderId total items vendorItems status paymentStatus');
    if (!request) throw new ApiError(404, 'Return request not found.');

    const isApproving = status === 'approved';
    let nextStatus = isApproving ? 'pickup_pending' : (status || request.status);
    let nextRefundStatus = isApproving ? 'pending' : (status === 'completed' ? 'processed' : (refundStatus || request.refundStatus));
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

    if (status && status !== request.status) {
        const allowedNext = statusTransitions[request.status] || [];
        if (!allowedNext.includes(status)) {
            throw new ApiError(409, `Cannot move return request from ${request.status} to ${status}.`);
        }
    }

    const currentRefundStatus = request.refundStatus || 'pending';
    if (refundStatus && refundStatus !== request.refundStatus) {
        const allowedRefundNext = refundTransitions[currentRefundStatus] || [];
        if (!allowedRefundNext.includes(refundStatus)) {
            throw new ApiError(409, `Cannot move refund status from ${currentRefundStatus} to ${refundStatus}.`);
        }
    }

    // --- BUSINESS LOGIC ON STATUS TRANSITIONS ---

    if (isApproving) {
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const hash = crypto.createHash('sha256').update(otp).digest('hex');
        request.returnPickupOtpHash = hash;
        request.returnPickupOtpExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins
        request.returnPickupOtpAttempts = 0;
        request.returnPickupOtpVerified = false;
        request.returnPickupOtpDebug = otp;
    }

    if (status === 'rejected') {
        nextRefundStatus = 'failed';
        if (request.status !== 'pending' && request.requestType === 'exchange') {
            const variantKey = request.exchangeDetails?.requestedVariant?.variantKey;
            for (const item of request.items || []) {
                const product = await Product.findById(item.productId);
                if (!product) continue;

                if (variantKey) {
                    const getStockFromMap = (stockMap, key) => {
                        if (!stockMap) return 0;
                        if (typeof stockMap.get === 'function') return Number(stockMap.get(key) || 0);
                        return Number(stockMap[key] || 0);
                    };
                    const currentStock = getStockFromMap(product.variants?.stockMap, variantKey);
                    product.variants?.stockMap?.set(variantKey, currentStock + item.quantity);
                    product.stockQuantity = product.stockQuantity + item.quantity;

                    if (product.stockQuantity <= 0) product.stock = 'out_of_stock';
                    else if (product.stockQuantity <= product.lowStockThreshold) product.stock = 'low_stock';
                    else product.stock = 'in_stock';

                    await product.save();
                }
            }
        }
    }

    // 1. STOCK RESERVATION ON VENDOR APPROVAL (EXCHANGE FLOW)
    if (isApproving && request.requestType === 'exchange') {
        const size = request.exchangeDetails?.requestedVariant?.size;
        const color = request.exchangeDetails?.requestedVariant?.color;
        const variantKey = request.exchangeDetails?.requestedVariant?.variantKey;

        for (const item of request.items || []) {
            const product = await Product.findById(item.productId);
            if (!product) continue;

            if (variantKey) {
                const getStockFromMap = (stockMap, key) => {
                    if (!stockMap) return 0;
                    if (typeof stockMap.get === 'function') return Number(stockMap.get(key) || 0);
                    return Number(stockMap[key] || 0);
                };
                const currentStock = getStockFromMap(product.variants?.stockMap, variantKey);
                if (currentStock < item.quantity) {
                    throw new ApiError(400, `Cannot approve exchange. Replacement variant (Size: ${size}, Color: ${color}) is out of stock.`);
                }

                // Reserve/Decrement Stock immediately
                product.variants?.stockMap?.set(variantKey, currentStock - item.quantity);
                product.stockQuantity = Math.max(0, product.stockQuantity - item.quantity);

                if (product.stockQuantity <= 0) product.stock = 'out_of_stock';
                else if (product.stockQuantity <= product.lowStockThreshold) product.stock = 'low_stock';
                else product.stock = 'in_stock';

                await product.save();
            }
        }
    }

    // 2. PRODUCT RECEIPT CONFIRMATION (STOCK RESTORE & REFUND BRANCHING)
    if (status === 'completed' || status === 'replacement_preparing') {
        const linkedOrderId = request.orderId?._id || request.orderId;
        if (linkedOrderId) {
            const order = await Order.findById(linkedOrderId);
            if (order && order.isDeleted !== true) {
                const vendorGroups = Array.isArray(order.vendorItems) ? order.vendorItems : [];
                const uniqueVendorIds = [
                    ...new Set(vendorGroups.map((group) => String(group?.vendorId || '')).filter(Boolean)),
                ];
                const isSingleVendorOrder = uniqueVendorIds.length <= 1;

                // Restore stock of returned (old) variant
                const stockRestores = (request.items || []).map(async (item) => {
                    const qty = Number(item?.quantity || 0);
                    if (!item?.productId || qty <= 0) return;

                    const product = await Product.findById(item.productId);
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

                    await product.save();
                });
                await Promise.all(stockRestores);

                // For completed Returns (issue refunds, reverse commissions) - process only once (Idempotency)
                if (status === 'completed' && request.status !== 'completed') {
                    // Find all completed return requests for this order and vendor (excluding current request which is not saved as completed yet)
                    const vendorCompletedReturns = await ReturnRequest.find({
                        orderId: order._id,
                        vendorId: req.user.id,
                        status: 'completed',
                        _id: { $ne: request._id }
                    });

                    const returnedQuantities = {};
                    const allReturns = [...vendorCompletedReturns, request];
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
                        // Cancel the commission completely since all items are returned
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
                                    vendorEarnings: 0
                                },
                            }
                        );
                    } else {
                        // Partial return: recalculate subtotal and commission for kept items
                        const comm = await Commission.findOne({
                            orderId: order._id,
                            vendorId: req.user.id,
                            status: { $ne: 'cancelled' }
                        });
                        if (comm) {
                            // Apply Backward Compatibility Rule for legacy documents
                            const originalDiscountShare = comm.discountShare !== undefined ? comm.discountShare : 0;
                            const originalSubtotal = comm.subtotal || 0;
                            
                            let newDiscountShare = 0;
                            if (originalSubtotal > 0) {
                                newDiscountShare = parseFloat((keptSubtotal * (originalDiscountShare / originalSubtotal)).toFixed(2));
                            }
                            
                            // Edge-case Validation: Coupon Freeze & Capping
                            if (newDiscountShare > keptSubtotal) {
                                newDiscountShare = keptSubtotal;
                            }
                            
                            const newEffectiveSubtotal = parseFloat((keptSubtotal - newDiscountShare).toFixed(2));
                            const newCommission = parseFloat(((newEffectiveSubtotal * comm.commissionRate) / 100).toFixed(2));
                            const newVendorEarnings = parseFloat((newEffectiveSubtotal - newCommission).toFixed(2));
                            
                            comm.subtotal = keptSubtotal;
                            comm.discountShare = newDiscountShare;
                            comm.effectiveSubtotal = newEffectiveSubtotal;
                            comm.commission = newCommission;
                            comm.vendorEarnings = newVendorEarnings;
                            await comm.save();
                        }
                    }

                    // Reduce vendor onHoldBalance
                    const Vendor = mongoose.model('Vendor');
                    const vendor = await Vendor.findById(req.user.id);
                    if (vendor) {
                        vendor.onHoldBalance = Math.max(0, (vendor.onHoldBalance || 0) - (request.refundAmount || 0));
                        await vendor.save();
                    }

                    // 1. Retrieve all completed ReturnRequests for the order
                    const completedReturnRequests = await ReturnRequest.find({
                        orderId: order._id,
                        status: 'completed',
                        _id: { $ne: request._id }
                    });
                    const allOrderCompletedReturns = [...completedReturnRequests, request];

                    // 2. Build a returned quantity map using the same identifier as the order items
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

                    // 3. Compare every order item against the returned quantities.
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

                    // 4. Create Refund record with idempotency key (Refinement #3 / M-5 / 4.9)
                    const Refund = mongoose.model('Refund');
                    const refundAmount = request.refundAmount || 0;
                    
                    const refund = (await Refund.create([{
                        orderId: order._id,
                        returnRequestId: request._id,
                        userId: request.userId?._id || request.userId,
                        amount: refundAmount,
                        referenceId: `RETURN_REFUND_${request._id}`, // unique — prevents double refund
                        method: request.refundDetails?.method === 'upi' ? 'upi' : 'bank_transfer',
                        bankDetails: request.refundDetails?.bankDetails,
                        upiId: request.refundDetails?.upiId,
                        status: 'requested',
                    }], { session }))[0];

                    request.refundId = refund._id;

                    // Auto-trigger Razorpay refund for online-paid orders
                    if (order.paymentStatus === 'paid' && refundAmount > 0) {
                        try {
                            const PaymentAttempt = mongoose.model('PaymentAttempt');
                            const paidAttempt = await PaymentAttempt.findOne({
                                orderId: order._id,
                                status: 'paid',
                            }).session(session);

                            if (paidAttempt?.razorpayPaymentId) {
                                const { initiateRefund } = await import('../../../services/payment.service.js');
                                const rzpRefund = await initiateRefund(
                                    paidAttempt.razorpayPaymentId,
                                    refundAmount,
                                    { reason: 'return_approved' }
                                );
                                await Refund.findByIdAndUpdate(refund._id, {
                                    razorpayRefundId: rzpRefund.id,
                                    status: 'processing',
                                    paymentAttemptId: paidAttempt._id,
                                }, { session });
                            }
                        } catch (rzpErr) {
                            console.error('[VENDOR_RETURN_REFUND_ERROR]', request._id, rzpErr.message);
                        }
                    }

                    // Update order and escrow status accordingly
                    if (allItemsReturned) {
                        if (order.status !== 'cancelled') {
                            order.status = 'returned';
                        }
                        order.escrowStatus = 'refunded';
                    } else {
                        // Partial return
                        order.status = 'delivered';
                        order.escrowStatus = 'held';
                    }
                    await order.save();
                    notifyOrderUpdate(order);
                }
            }
        }
    }

    request.status = nextStatus;
    request.refundStatus = nextRefundStatus;
    if (rejectionReason !== undefined) request.rejectionReason = nextRejectionReason;
    if (status !== 'rejected' && request.rejectionReason) request.rejectionReason = '';
    await request.save();
    notifyReturnUpdate(request);

    // 3. AUTO-ASSIGN LOGISTICS DISPATCH TRIGGERS
    if (isApproving) {
        autoAssignReturnPickupPartner(request._id);
    }

    if (status === 'replacement_ready') {
        autoAssignExchangeReplacementPartner(request._id);
    }

    const notificationTasks = [
        createNotification({
            recipientId: req.user.id,
            recipientType: 'vendor',
            title: 'Return request updated',
            message: `Return request for order ${request.orderId?.orderId || request.orderId} updated to ${request.status}.`,
            type: 'order',
            data: {
                returnRequestId: String(request._id),
                orderId: String(request.orderId?.orderId || request.orderId || ''),
                status: String(request.status),
                refundStatus: String(request.refundStatus || ''),
            },
        }),
    ];

    if (request.userId?._id) {
        notificationTasks.push(
            createNotification({
                recipientId: request.userId._id,
                recipientType: 'user',
                title: 'Return request status updated',
                message: `Your return request for order ${request.orderId?.orderId || request.orderId} is now ${request.status}.`,
                type: 'order',
                data: {
                    returnRequestId: String(request._id),
                    orderId: String(request.orderId?.orderId || request.orderId || ''),
                    status: String(request.status),
                    refundStatus: String(request.refundStatus || ''),
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
                message: `Return request for order ${request.orderId?.orderId || request.orderId} moved to ${request.status}.`,
                type: 'order',
                data: {
                    returnRequestId: String(request._id),
                    orderId: String(request.orderId?.orderId || request.orderId || ''),
                    status: String(request.status),
                    refundStatus: String(request.refundStatus || ''),
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
        notificationTasks.push(
            createNotification({
                recipientId: request.userId,
                recipientType: 'user',
                title: 'Returned items delivered to vendor',
                message: `Rider has delivered the returned items for order ${request.orderId?.orderId || ''} to the vendor. Awaiting inspection.`,
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
