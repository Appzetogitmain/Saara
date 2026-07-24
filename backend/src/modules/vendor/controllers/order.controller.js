import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import crypto from 'crypto';
import ApiError from '../../../utils/ApiError.js';
import Order from '../../../models/Order.model.js';
import Shipment from '../../../models/Shipment.model.js';
import Commission from '../../../models/Commission.model.js';
import Settlement from '../../../models/Settlement.model.js';
import mongoose from 'mongoose';
import { createNotification } from '../../../services/notification.service.js';
import {
    autoAssignDeliveryPartner,
    autoAssignDeliveryPartnerLegacy,
} from '../../../services/assignmentService.js';
import { notifyOrderUpdate } from '../../../services/socket.service.js';
import { buildVendorItemsSummary } from '../../../utils/notificationProductFormatter.js';
import { getDefaultCommissionRate } from '../../../services/settingsService.js';

const deriveTopLevelOrderStatus = (vendorItems = [], fallback = 'pending') => {
    const statuses = (vendorItems || [])
        .map((item) => String(item?.status || '').toLowerCase())
        .filter(Boolean);

    if (!statuses.length) return String(fallback || 'pending').toLowerCase();

    if (statuses.every((s) => s === 'cancelled')) return 'cancelled';
    if (statuses.every((s) => s === 'delivered')) return 'delivered';
    if (statuses.includes('shipped')) return 'shipped';
    if (statuses.includes('ready_for_pickup')) return 'ready_for_pickup';
    if (statuses.includes('processing')) return 'processing';
    if (statuses.includes('pending')) return 'pending';

    return String(fallback || 'pending').toLowerCase();
};

// GET /api/vendor/orders
export const getVendorOrders = asyncHandler(async (req, res) => {
    const { status, page = 1, limit = 20 } = req.query;
    const numericPage = Math.max(1, Number(page) || 1);
    const numericLimit = Math.max(1, Number(limit) || 20);
    const skip = (numericPage - 1) * numericLimit;

    const filter = status
        ? { vendorItems: { $elemMatch: { vendorId: req.user.id, status } } }
        : { 'vendorItems.vendorId': req.user.id };

    const orders = await Order.find(filter)
        .populate({
            path: 'shipments',
            match: { vendorId: req.user.id },
            populate: { path: 'deliveryBoyId', select: 'name email phone vehicleType vehicleNumber status' }
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(numericLimit)
        .lean();
    const total = await Order.countDocuments(filter);

    const orderIds = orders.map(o => o._id);
    const commissions = await Commission.find({
        orderId: { $in: orderIds },
        vendorId: req.user.id
    }).lean();

    const defaultRate = await getDefaultCommissionRate();
    const ordersWithCommissions = orders.map(order => {
        const comm = commissions.find(c => String(c.orderId) === String(order._id));
        const filteredItems = (order.items || []).filter(item => String(item.vendorId) === String(req.user.id));
        const filteredVendorItems = (order.vendorItems || []).filter(vi => String(vi.vendorId) === String(req.user.id));
        
        const vi = filteredVendorItems[0] || {};
        const vSubtotal = vi.subtotal || 0;
        const vDiscount = vi.discount || 0;
        const vTax = vi.tax || 0;
        const vShipping = vi.shipping || 0;
        const vCommissionRate = vi.commissionRate !== undefined && vi.commissionRate !== null ? vi.commissionRate : defaultRate;
        
        const commSubtotal = comm ? (comm.vendorSubtotal || comm.subtotal || vSubtotal) : vSubtotal;
        const commDiscount = comm ? (comm.vendorCouponDiscount !== undefined ? comm.vendorCouponDiscount : comm.discountShare || vDiscount) : vDiscount;
        const commDiscountedSub = comm ? (comm.vendorDiscountedSubtotal !== undefined ? comm.vendorDiscountedSubtotal : comm.effectiveSubtotal || (commSubtotal - commDiscount)) : (commSubtotal - commDiscount);
        const commTax = comm ? (comm.vendorTax || vTax) : vTax;
        const commPaidAmount = comm ? (comm.vendorTotalPaidByCustomer || (commDiscountedSub + vShipping + commTax)) : (commDiscountedSub + vShipping + commTax);
        const commRate = comm ? comm.commissionRate : vCommissionRate;
        const commAmount = comm ? (comm.commissionAmount !== undefined ? comm.commissionAmount : comm.commission) : parseFloat((commDiscountedSub * commRate / 100).toFixed(2));
        const commEarnings = comm ? (comm.vendorNetEarnings !== undefined ? comm.vendorNetEarnings : comm.vendorEarnings) : parseFloat((commDiscountedSub - commAmount).toFixed(2));
        const escrowStatus = comm ? (comm.escrowStatus || 'held') : 'held';
        const settlementStatus = comm ? (comm.settlementStatus || comm.status || 'pending') : 'pending';

        return {
            ...order,
            items: filteredItems,
            vendorItems: filteredVendorItems,
            commissionDetails: comm ? {
                ...comm,
                effectiveSubtotal: commDiscountedSub,
                commission: commAmount,
                vendorEarnings: commEarnings
            } : null,
            vendorFinancials: {
                subtotal: parseFloat(commSubtotal.toFixed(2)),
                discount: parseFloat(commDiscount.toFixed(2)),
                tax: parseFloat(commTax.toFixed(2)),
                shipping: parseFloat(vShipping.toFixed(2)),
                customerPaidAmount: parseFloat(commPaidAmount.toFixed(2)),
                commission: parseFloat(commAmount.toFixed(2)),
                earnings: parseFloat(commEarnings.toFixed(2)),
                escrowStatus,
                settlementStatus
            }
        };
    });

    res.status(200).json(new ApiResponse(200, { orders: ordersWithCommissions, total, page: numericPage, pages: Math.ceil(total / numericLimit) }, 'Orders fetched.'));
});

// GET /api/vendor/orders/:id
export const getVendorOrderById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const idFilter = [{ orderId: id }];
    if (mongoose.Types.ObjectId.isValid(id)) {
        idFilter.push({ _id: id });
    }

    const order = await Order.findOne({
        $or: idFilter,
        'vendorItems.vendorId': req.user.id,
    })
    .populate({
        path: 'shipments',
        match: { vendorId: req.user.id },
        populate: { path: 'deliveryBoyId', select: 'name email phone vehicleType vehicleNumber status' }
    })
    .populate('userId', 'name email');

    if (!order) throw new ApiError(404, 'Order not found.');

    const commissionDoc = await Commission.findOne({
        orderId: order._id,
        vendorId: req.user.id
    }).lean();

    const defaultRate = await getDefaultCommissionRate();
    const orderObj = order.toObject({ virtuals: true });
    const comm = commissionDoc;
    const filteredItems = (orderObj.items || []).filter(item => String(item.vendorId) === String(req.user.id));
    const filteredVendorItems = (orderObj.vendorItems || []).filter(vi => String(vi.vendorId) === String(req.user.id));
    
    const vi = filteredVendorItems[0] || {};
    const vSubtotal = vi.subtotal || 0;
    const vDiscount = vi.discount || 0;
    const vTax = vi.tax || 0;
    const vShipping = vi.shipping || 0;
    const vCommissionRate = vi.commissionRate !== undefined && vi.commissionRate !== null ? vi.commissionRate : defaultRate;
    
    const commSubtotal = comm ? (comm.vendorSubtotal || comm.subtotal || vSubtotal) : vSubtotal;
    const commDiscount = comm ? (comm.vendorCouponDiscount !== undefined ? comm.vendorCouponDiscount : comm.discountShare || vDiscount) : vDiscount;
    const commDiscountedSub = comm ? (comm.vendorDiscountedSubtotal !== undefined ? comm.vendorDiscountedSubtotal : comm.effectiveSubtotal || (commSubtotal - commDiscount)) : (commSubtotal - commDiscount);
    const commTax = comm ? (comm.vendorTax || vTax) : vTax;
    const commPaidAmount = comm ? (comm.vendorTotalPaidByCustomer || (commDiscountedSub + vShipping + commTax)) : (commDiscountedSub + vShipping + commTax);
    const commRate = comm ? comm.commissionRate : vCommissionRate;
    const commAmount = comm ? (comm.commissionAmount !== undefined ? comm.commissionAmount : comm.commission) : parseFloat((commDiscountedSub * commRate / 100).toFixed(2));
    const commEarnings = comm ? (comm.vendorNetEarnings !== undefined ? comm.vendorNetEarnings : comm.vendorEarnings) : parseFloat((commDiscountedSub - commAmount).toFixed(2));
    const escrowStatus = comm ? (comm.escrowStatus || 'held') : 'held';
    const settlementStatus = comm ? (comm.settlementStatus || comm.status || 'pending') : 'pending';

    orderObj.items = filteredItems;
    orderObj.vendorItems = filteredVendorItems;
    orderObj.commissionDetails = comm ? {
        ...comm,
        effectiveSubtotal: commDiscountedSub,
        commission: commAmount,
        vendorEarnings: commEarnings
    } : null;
    orderObj.vendorFinancials = {
        subtotal: parseFloat(commSubtotal.toFixed(2)),
        discount: parseFloat(commDiscount.toFixed(2)),
        tax: parseFloat(commTax.toFixed(2)),
        shipping: parseFloat(vShipping.toFixed(2)),
        customerPaidAmount: parseFloat(commPaidAmount.toFixed(2)),
        commission: parseFloat(commAmount.toFixed(2)),
        earnings: parseFloat(commEarnings.toFixed(2)),
        escrowStatus,
        settlementStatus
    };

    res.status(200).json(new ApiResponse(200, orderObj, 'Order fetched.'));
});

// PATCH /api/vendor/orders/:id/status
export const updateOrderStatus = asyncHandler(async (req, res) => {
    const { status } = req.body;
    if (!status) throw new ApiError(400, 'Status is required.');
    const allowed = ['pending', 'processing', 'ready_for_pickup', 'shipped', 'cancelled'];
    if (!allowed.includes(status)) throw new ApiError(400, `Status must be one of: ${allowed.join(', ')}`);

    const transitionMap = {
        pending: ['pending', 'processing', 'cancelled'],
        processing: ['processing', 'ready_for_pickup', 'cancelled'],
        ready_for_pickup: ['ready_for_pickup', 'shipped'],
        shipped: ['shipped'],
        cancelled: ['cancelled'],
    };

    const orderIdParam = req.params.id;
    const isMongoId = mongoose.Types.ObjectId.isValid(orderIdParam);
    const query = {
        $or: [
            { orderId: orderIdParam },
            { _id: isMongoId ? orderIdParam : null }
        ],
        'vendorItems.vendorId': req.user.id,
    };

    const order = await Order.findOne(query);
    if (!order) throw new ApiError(404, 'Order not found.');
    const vendorItem = order.vendorItems.find((vi) => String(vi.vendorId) === String(req.user.id));
    if (!vendorItem) throw new ApiError(404, 'Vendor order item not found.');

    const currentStatus = String(vendorItem.status || 'pending');
    const allowedNextStatuses = transitionMap[currentStatus] || [];
    if (!allowedNextStatuses.includes(status)) {
        throw new ApiError(409, `Cannot move order from ${currentStatus} to ${status}.`);
    }

    if (status === 'cancelled') {
        const result = await processCancellationRefund({
            orderId: order._id,
            vendorGroupId: req.user.id,
            cancelledBy: 'vendor',
            reason: req.body.reason || 'Cancelled by vendor',
            comment: req.body.comment || '',
        });

        notifyOrderUpdate(result.order || order);
        return res.status(200).json(new ApiResponse(200, result.order || order, `Order item marked as cancelled and refund of ₹${result.refundAmount || 0} processed.`));
    }

    // Update only this vendor's items status
    order.vendorItems = order.vendorItems.map((vi) =>
        vi.vendorId.toString() === req.user.id ? { ...vi.toObject(), status } : vi
    );
    order.status = deriveTopLevelOrderStatus(order.vendorItems, order.status);
    await order.save();
    notifyOrderUpdate(order);

    const shipmentForVendor = await Shipment.findOne({
        orderId: order._id,
        vendorId: req.user.id,
    });

    if (shipmentForVendor) {
        shipmentForVendor.status = status === 'processing' ? 'confirmed' : status;
        await shipmentForVendor.save();
    }

    if (status === 'ready_for_pickup') {
        // Phase 5.2: Use Shipment-primary assignment for new orders (with Shipment),
        // fall back to legacy Order-primary assignment for old orders (without Shipment).
        //
        // [⚠️ DUAL-WRITE] The Shipment path writes Shipment first, then dual-writes
        // Order.deliveryBoyId for backward compatibility. The legacy path writes Order only.
        // Both paths are fire-and-forget (non-blocking).

        if (shipmentForVendor) {
            // New order (Phase 5.1+): use Shipment-primary assignment
            if (shipmentForVendor.providerId === 'shiprocket') {
                // Fire and forget Shiprocket assignment
                import('../../../providers/shiprocket.provider.js')
                    .then(({ default: shiprocketProvider }) => {
                        shiprocketProvider.createShipment(shipmentForVendor).then(res => {
                            if (res.success) {
                                shipmentForVendor.awbCode = res.awbCode;
                                shipmentForVendor.trackingUrl = res.trackingUrl;
                                shipmentForVendor.labelUrl = res.labelUrl;
                                shipmentForVendor.providerOrderId = res.providerMetadata?.shiprocketOrderId;
                                shipmentForVendor.providerMetadata = res.providerMetadata;
                                shipmentForVendor.save().catch(e => console.error('Failed to save 3PL shipment info:', e));
                            } else {
                                console.error('[3PL] Shiprocket createShipment failed:', res.error);
                                shipmentForVendor.deliveryAssignmentStatus = 'failed';
                                shipmentForVendor.save().catch(e => console.error(e));
                            }
                        }).catch(err => console.error('[3PL] Shiprocket createShipment exception:', err));
                    })
                    .catch(err => console.error('Failed to load shiprocket provider:', err));
            } else if (shipmentForVendor.providerId === 'delhivery') {
                // Fire and forget Delhivery assignment
                import('../../../providers/delhivery.provider.js')
                    .then(({ default: delhiveryProvider }) => {
                        delhiveryProvider.createShipment(shipmentForVendor).then(res => {
                            if (res.success) {
                                shipmentForVendor.awbCode = res.awbCode;
                                shipmentForVendor.trackingUrl = res.trackingUrl;
                                shipmentForVendor.labelUrl = res.labelUrl;
                                shipmentForVendor.providerOrderId = res.providerMetadata?.waybill;
                                shipmentForVendor.providerMetadata = res.providerMetadata;
                                shipmentForVendor.save().catch(e => console.error('Failed to save 3PL shipment info:', e));
                            } else {
                                console.error('[3PL] Delhivery createShipment failed:', res.error);
                                shipmentForVendor.deliveryAssignmentStatus = 'failed';
                                shipmentForVendor.save().catch(e => console.error(e));
                            }
                        }).catch(err => console.error('[3PL] Delhivery createShipment exception:', err));
                    })
                    .catch(err => console.error('Failed to load delhivery provider:', err));
            } else if (shipmentForVendor.providerId === 'own_fleet') {
                autoAssignDeliveryPartner(shipmentForVendor._id);
            } else {
                console.warn(`[Auto Assign] Unknown provider ${shipmentForVendor.providerId} for shipment ${shipmentForVendor._id}.`);
            }
        } else {
            // Legacy order (pre-Phase-5.1): use Order-primary assignment
            autoAssignDeliveryPartnerLegacy(order._id);
        }
    }

    const notificationTasks = [];
    const vItemsText = buildVendorItemsSummary(vendorItem.items);

    if (order.userId) {
        notificationTasks.push(
            createNotification({
                recipientId: order.userId,
                recipientType: 'user',
                title: 'Order item status updated',
                message: `An item in your order ${order.orderId || order._id} is now ${status}.${vItemsText}`,
                type: 'order',
                data: {
                    orderId: String(order.orderId || order._id),
                    status: String(status),
                    scope: 'vendor_item',
                },
            })
        );
    }

    notificationTasks.push(
        createNotification({
            recipientId: req.user.id,
            recipientType: 'vendor',
            title: 'Order status updated',
            message: `Order ${order.orderId || order._id} moved to ${status}.${vItemsText}`,
            type: 'order',
            data: {
                orderId: String(order.orderId || order._id),
                status: String(status),
            },
        })
    );

    await Promise.allSettled(notificationTasks);

    res.status(200).json(new ApiResponse(200, order, 'Order status updated.'));
});

// GET /api/vendor/earnings
export const getEarnings = asyncHandler(async (req, res) => {
    const {
        page = 1,
        limit = 50,
        settlementsPage = 1,
        settlementsLimit = 50,
    } = req.query;
    const numericPage = Math.max(1, Number(page) || 1);
    const numericLimit = Math.max(1, Number(limit) || 50);
    const commissionSkip = (numericPage - 1) * numericLimit;
    const numericSettlementsPage = Math.max(1, Number(settlementsPage) || 1);
    const numericSettlementsLimit = Math.max(1, Number(settlementsLimit) || 50);
    const settlementSkip = (numericSettlementsPage - 1) * numericSettlementsLimit;

    const [commissionDocs, totalCommissions, settlements, totalSettlements] = await Promise.all([
        Commission.find({ vendorId: req.user.id })
            .populate('orderId', 'orderId status')
            .sort({ createdAt: -1 })
            .skip(commissionSkip)
            .limit(numericLimit),
        Commission.countDocuments({ vendorId: req.user.id }),
        Settlement.find({ vendorId: req.user.id })
            .sort({ createdAt: -1 })
            .skip(settlementSkip)
            .limit(numericSettlementsLimit),
        Settlement.countDocuments({ vendorId: req.user.id }),
    ]);
    const allCommissionsForSummary = await Commission.find({ vendorId: req.user.id })
        .populate('orderId', 'orderId status')
        .sort({ createdAt: -1 });

    const commissions = commissionDocs.map((doc) => {
        const commission = doc.toObject();
        const orderRef = commission.orderId?._id || commission.orderId;
        const orderDisplayId = commission.orderId?.orderId || String(orderRef || '');
        const orderStatus = String(commission.orderId?.status || '').toLowerCase();
        const effectiveStatus = orderStatus === 'cancelled' ? 'cancelled' : String(commission.status || 'pending');
        return {
            ...commission,
            orderRef,
            orderDisplayId,
            effectiveStatus,
        };
    });

    const summary = allCommissionsForSummary.reduce((acc, doc) => {
        const c = doc.toObject();
        const status = String(c.status || 'pending');
        const orderStatus = String(c.orderId?.status || '').toLowerCase();
        const effectiveStatus = orderStatus === 'cancelled' ? 'cancelled' : status;
        const earnings = Number(c.vendorEarnings || 0);
        const commissionAmount = Number(c.commission || 0);

        // Cancelled commissions should not contribute to active earnings totals.
        if (effectiveStatus !== 'cancelled') {
            acc.totalEarnings += earnings;
            acc.totalCommission += commissionAmount;
            acc.totalOrders += 1;
        }

        if (effectiveStatus === 'pending') acc.pendingEarnings += earnings;
        if (effectiveStatus === 'paid') acc.paidEarnings += earnings;
        if (effectiveStatus === 'cancelled') acc.cancelledEarnings += earnings;
        return acc;
    }, {
        totalEarnings: 0,
        pendingEarnings: 0,
        paidEarnings: 0,
        cancelledEarnings: 0,
        totalCommission: 0,
        totalOrders: 0
    });

    res.status(200).json(
        new ApiResponse(
            200,
            {
                summary,
                commissions,
                settlements,
                pagination: {
                    totalCommissions,
                    page: numericPage,
                    limit: numericLimit,
                    pages: Math.max(1, Math.ceil(totalCommissions / numericLimit)),
                },
                settlementsPagination: {
                    totalSettlements,
                    page: numericSettlementsPage,
                    limit: numericSettlementsLimit,
                    pages: Math.max(1, Math.ceil(totalSettlements / numericSettlementsLimit)),
                },
            },
            'Earnings fetched.'
        )
    );
});

// POST /api/vendor/orders/:id/verify-pickup
export const verifyPickup = asyncHandler(async (req, res) => {
    const { otp } = req.body;
    const normalizedOtp = String(otp || '').trim();
    if (!/^\d{6}$/.test(normalizedOtp)) {
        throw new ApiError(400, 'Please enter a valid 6-digit Pickup OTP.');
    }

    const { id } = req.params;
    const idFilter = [{ orderId: id }];
    if (mongoose.Types.ObjectId.isValid(id)) {
        idFilter.push({ _id: id });
    }

    const order = await Order.findOne({
        $or: idFilter,
        'vendorItems.vendorId': req.user.id,
    });

    if (!order) throw new ApiError(404, 'Order not found.');

    const shipment = await mongoose.model('Shipment').findOne({
        orderId: order._id,
        vendorId: req.user.id
    }).select('+pickupOtpHash +pickupOtpExpiry +pickupOtpDebug');

    if (!shipment) throw new ApiError(404, 'Shipment not found for this vendor.');

    const vendorItem = order.vendorItems.find((vi) => String(vi.vendorId) === String(req.user.id));
    if (!vendorItem) throw new ApiError(404, 'Vendor order item not found.');

    if (!['ready_for_pickup', 'confirmed'].includes(shipment.status)) {
        throw new ApiError(409, `Pickup verification is only allowed when shipment is Ready for Pickup. Current status is ${shipment.status}.`);
    }

    if (shipment.deliveryAssignmentStatus !== 'accepted') {
        throw new ApiError(409, `No active accepted delivery partner for this shipment. Current status is ${shipment.deliveryAssignmentStatus}.`);
    }

    if (!shipment.pickupOtpHash || !shipment.pickupOtpExpiry) {
        throw new ApiError(400, 'Pickup OTP was not generated. Please re-assign or re-accept the delivery offer.');
    }

    if (shipment.pickupOtpExpiry < new Date()) {
        throw new ApiError(400, 'Pickup OTP has expired. Please ask the delivery boy to resend it.');
    }

    // Verify OTP
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET is not configured.');
    const hashedInput = crypto.createHash('sha256').update(`${normalizedOtp}:${secret}`).digest('hex');

    if (shipment.pickupOtpHash !== hashedInput) {
        throw new ApiError(400, 'Invalid Pickup OTP.');
    }

    // OTP Verified! Advance status to picked_up
    shipment.status = 'picked_up';
    shipment.pickedUpAt = new Date();
    shipment.pickupOtpHash = undefined;
    shipment.pickupOtpDebug = undefined;
    await shipment.save();

    // Update order vendor item status
    order.vendorItems = order.vendorItems.map((vi) =>
        String(vi.vendorId) === String(req.user.id) ? { ...vi.toObject(), status: 'shipped' } : vi
    );
    order.status = deriveTopLevelOrderStatus(order.vendorItems, order.status);
    await order.save();
    
    notifyOrderUpdate(order);
    
    // Trigger notification tasks
    const notificationTasks = [];
    const vItemsText = buildVendorItemsSummary(vendorItem.items);

    if (order.userId) {
        notificationTasks.push(
            createNotification({
                recipientId: order.userId,
                recipientType: 'user',
                title: 'Order item status updated',
                message: `An item in your order ${order.orderId || order._id} is now shipped.${vItemsText}`,
                type: 'order',
                data: {
                    orderId: String(order.orderId || order._id),
                    status: 'shipped',
                    scope: 'vendor_item',
                },
            })
        );
    }

    notificationTasks.push(
        createNotification({
            recipientId: req.user.id,
            recipientType: 'vendor',
            title: 'Package picked up successfully',
            message: `Order ${order.orderId || order._id} has been handed over to the courier.${vItemsText}`,
            type: 'order',
            data: {
                orderId: String(order.orderId || order._id),
                status: 'shipped',
            },
        })
    );

    if (order.deliveryBoyId) {
        notificationTasks.push(
            createNotification({
                recipientId: order.deliveryBoyId,
                recipientType: 'delivery',
                title: 'Pickup verified successfully',
                message: `Pickup for order ${order.orderId || order._id} has been verified. You can now proceed to deliver the items.${vItemsText}`,
                type: 'order',
                data: {
                    orderId: String(order.orderId || order._id),
                    status: 'shipped',
                },
            })
        );
    }

    await Promise.allSettled(notificationTasks);

    res.status(200).json(new ApiResponse(200, order, 'Pickup OTP verified successfully. Package marked as shipped.'));
});
