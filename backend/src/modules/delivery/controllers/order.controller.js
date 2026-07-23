import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Order from '../../../models/Order.model.js';
import Shipment from '../../../models/Shipment.model.js';
import DeliveryBoy from '../../../models/DeliveryBoy.model.js';
import DeliveryWalletTransaction from '../../../models/DeliveryWalletTransaction.model.js';
import mongoose from 'mongoose';
import { processDeliveryBoyPayout } from '../../../services/deliveryPayout.service.js';
import crypto from 'crypto';
import { sendEmail } from '../../../services/email.service.js';
import { createNotification } from '../../../services/notification.service.js';
import { emitToRoom, notifyOrderUpdate } from '../../../services/socket.service.js';
import LogisticsEventBus from '../../../events/logisticsEventBus.js';
import LOGISTICS_EVENTS from '../../../events/logisticsEvents.js';
import {
    autoAssignDeliveryPartner,
    autoAssignDeliveryPartnerLegacy,
} from '../../../services/assignmentService.js';
import { handleOrderDeliveryBalances } from '../../../services/orderFinancialHelper.js';

const IS_PRODUCTION = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
const DELIVERY_OTP_TTL_MS = IS_PRODUCTION ? 10 * 60 * 1000 : 24 * 60 * 60 * 1000;
const DELIVERY_OTP_MAX_ATTEMPTS = 5;
const DELIVERY_OTP_RESEND_COOLDOWN_MS = 60 * 1000;

const hashDeliveryOtp = (otp) => {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET is not configured.');
    return crypto.createHash('sha256').update(`${String(otp)}:${secret}`).digest('hex');
};

const generateDeliveryOtp = () => {
    const { randomInt } = crypto;
    return String(randomInt(100000, 1000000)); // T5.1: cryptographically secure
};

// ───────────────────────────────────────────────────────────────────────────────
// Phase 5.3 — Shipment-primary lookup helper
//
// Returns { shipment, order, isLegacy }:
//   isLegacy = false — Shipment found, use Shipment as primary
//   isLegacy = true  — No Shipment but Order has this deliveryBoyId (pre-5.1 order)
//
// The URL param is always orderId (the delivery boy received orderId in their
// offer notification). We look up the Shipment internally by orderId + deliveryBoyId.
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Phase 5.3 primary lookup.
 * Resolves orderId → Order → Shipment (for this delivery boy).
 * Falls back to legacy Order-only path if no Shipment found.
 *
 * @param {string}   orderId          - URL param (orderId string or ObjectId)
 * @param {string}   deliveryBoyId    - req.user.id
 * @param {string}   [shipmentSelect] - Additional Shipment fields (e.g. '+deliveryOtpHash')
 * @param {string}   [orderSelect]    - Additional Order fields (e.g. '+deliveryOtpHash')
 * @returns {{ shipment, order, isLegacy }}
 */
const findShipmentAndOrderForAgentOrThrow = async (
    orderId,
    deliveryBoyId,
    shipmentSelect = '',
    orderSelect    = '',
) => {
    // ─ 1. Find the Order ────────────────────────────────────────────────
    const orderMatch = { isDeleted: { $ne: true }, $or: [{ orderId }] };
    if (mongoose.isValidObjectId(orderId)) {
        orderMatch.$or.push({ _id: orderId });
    }

    let orderQuery = Order.findOne(orderMatch);
    if (orderSelect) orderQuery = orderQuery.select(orderSelect);
    const order = await orderQuery;
    if (!order) throw new ApiError(404, 'Order not found.');

    // ─ 2. Look for a Shipment assigned to this delivery boy ─────────────
    let shipmentQuery = Shipment.findOne({ orderId: order._id, deliveryBoyId });
    if (shipmentSelect) shipmentQuery = shipmentQuery.select(shipmentSelect);
    const shipment = await shipmentQuery;

    if (shipment) {
        // New order (Phase 5.1+): Shipment is primary
        return { shipment, order, isLegacy: false };
    }

    // Not assigned to this driver at all
    throw new ApiError(403, 'Order offer has expired or is not assigned to you.');
};

// ───────────────────────────────────────────────────────────────────────────────
// Legacy helper (preserved for any internal call that still needs Order-only lookup)
// ───────────────────────────────────────────────────────────────────────────────

const findOrderForAgentOrThrow = async (orderId, deliveryBoyId, selectFields = '', populateFields = []) => {
    const existsQuery = {
        isDeleted: { $ne: true },
        $or: [{ orderId }],
    };
    if (mongoose.isValidObjectId(orderId)) {
        existsQuery.$or.push({ _id: orderId });
    }

    const orderExists = await Order.findOne(existsQuery);
    if (!orderExists) {
        throw new ApiError(404, 'Order not found.');
    }

    if (String(orderExists.deliveryBoyId) !== String(deliveryBoyId)) {
        throw new ApiError(403, 'Order offer has expired or is not assigned to you.');
    }

    let queryBuilder = Order.findOne({ ...existsQuery, deliveryBoyId });
    if (selectFields) {
        queryBuilder = queryBuilder.select(selectFields);
    }
    for (const pop of populateFields) {
        queryBuilder = queryBuilder.populate(pop.path, pop.select);
    }

    return await queryBuilder;
};

const getCustomerEmail = (order) => {
    return (
        String(order?.shippingAddress?.email || '').trim().toLowerCase() ||
        String(order?.guestInfo?.email || '').trim().toLowerCase()
    );
};

const sendDeliveryOtpEmail = async (order, otp) => {
    const to = getCustomerEmail(order);
    if (!to) return false;

    await sendEmail({
        to,
        subject: `Delivery OTP for order ${order.orderId || order._id}`,
        text: `Your delivery verification OTP is ${otp}. Share it with the delivery partner only after receiving your order. It expires in 10 minutes.`,
        html: `<p>Your delivery verification OTP is <strong>${otp}</strong>.</p><p>Share it with the delivery partner only after receiving your order.</p><p>This OTP expires in 10 minutes.</p>`,
    });

    return true;
};

// GET /api/delivery/orders
export const getAssignedOrders = asyncHandler(async (req, res) => {
    const { status, page, limit } = req.query;
    const filter = { deliveryBoyId: req.user.id, isDeleted: { $ne: true } };
    if (status === 'open') {
        filter.status = { $in: ['pending', 'processing', 'ready_for_pickup'] };
    } else if (status) {
        filter.status = status;
    }

    const hasPaginationParams = page !== undefined || limit !== undefined;

    const formatShipmentAsOrder = (shipment) => {
        if (!shipment.orderId) return shipment;
        const orderObj = shipment.orderId.toObject ? shipment.orderId.toObject() : shipment.orderId;
        return {
            ...orderObj,
            _id: orderObj._id, // Must preserve Order ID for /api/delivery/orders/:id lookups
            status: shipment.status,
            deliveryAssignmentStatus: shipment.deliveryAssignmentStatus,
            assignedAt: shipment.assignedAt,
            deliveredAt: shipment.deliveredAt,
            pickedUpAt: shipment.pickedUpAt,
            shipmentId: shipment._id
        };
    };

    if (!hasPaginationParams) {
        const shipments = await mongoose.model('Shipment').find(filter)
            .populate('orderId')
            .sort({ createdAt: -1 });
        const orders = shipments.map(formatShipmentAsOrder);
        return res.status(200).json(new ApiResponse(200, orders, 'Assigned orders fetched.'));
    }

    const numericPage = Math.max(1, Number(page) || 1);
    const requestedLimit = Number(limit) || 20;
    const numericLimit = Math.min(Math.max(1, requestedLimit), 100);
    const skip = (numericPage - 1) * numericLimit;

    const [shipments, total] = await Promise.all([
        mongoose.model('Shipment').find(filter).populate('orderId').sort({ createdAt: -1 }).skip(skip).limit(numericLimit),
        mongoose.model('Shipment').countDocuments(filter),
    ]);

    const orders = shipments.map(formatShipmentAsOrder);

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                orders,
                pagination: {
                    total,
                    page: numericPage,
                    limit: numericLimit,
                    pages: Math.ceil(total / numericLimit) || 1,
                },
            },
            'Assigned orders fetched.'
        )
    );
});

// GET /api/delivery/orders/dashboard-summary
export const getDashboardSummary = asyncHandler(async (req, res) => {
    const deliveryBoyId = req.user.id;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [statusStats, completedTodayCount, earningsStats, recentShipments] = await Promise.all([
        mongoose.model('Shipment').aggregate([
            { $match: { deliveryBoyId: new mongoose.Types.ObjectId(deliveryBoyId), isDeleted: { $ne: true } } },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                },
            },
        ]),
        mongoose.model('Shipment').countDocuments({
            deliveryBoyId,
            isDeleted: { $ne: true },
            status: 'delivered',
            $or: [
                { deliveredAt: { $gte: todayStart } },
                { deliveredAt: { $exists: false }, updatedAt: { $gte: todayStart } },
                { deliveredAt: null, updatedAt: { $gte: todayStart } },
            ],
        }),
        // T1.1: Use DeliveryWalletTransaction to get actual driver earnings, not order.shipping
        DeliveryWalletTransaction.aggregate([
            {
                $match: {
                    deliveryBoyId: new mongoose.Types.ObjectId(deliveryBoyId),
                    type: 'DELIVERY_EARNING',
                },
            },
            { $group: { _id: null, totalDeliveryFees: { $sum: '$amount' } } },
        ]),
        mongoose.model('Shipment').find({ deliveryBoyId, isDeleted: { $ne: true } })
            .populate('orderId')
            .sort({ createdAt: -1 })
            .limit(3),
    ]);

    const countByStatus = statusStats.reduce((acc, row) => {
        acc[String(row?._id || '')] = Number(row?.count || 0);
        return acc;
    }, {});

    const formatShipmentAsOrder = (shipment) => {
        if (!shipment.orderId) return shipment;
        const orderObj = shipment.orderId.toObject ? shipment.orderId.toObject() : shipment.orderId;
        return {
            ...orderObj,
            _id: orderObj._id,
            status: shipment.status,
            deliveryAssignmentStatus: shipment.deliveryAssignmentStatus,
            assignedAt: shipment.assignedAt,
            deliveredAt: shipment.deliveredAt,
            pickedUpAt: shipment.pickedUpAt,
            shipmentId: shipment._id
        };
    };

    const recentOrders = recentShipments.map(formatShipmentAsOrder);

    const summary = {
        totalOrders:
            Number(countByStatus.pending || 0) +
            Number(countByStatus.processing || 0) +
            Number(countByStatus.ready_for_pickup || 0) +
            Number(countByStatus.shipped || 0) +
            Number(countByStatus.delivered || 0) +
            Number(countByStatus.cancelled || 0) +
            Number(countByStatus.returned || 0),
        completedToday: Number(completedTodayCount || 0),
        openOrders: 
            Number(countByStatus.pending || 0) + 
            Number(countByStatus.processing || 0) + 
            Number(countByStatus.ready_for_pickup || 0),
        earnings: Number(earningsStats?.[0]?.totalDeliveryFees || 0),
        recentOrders,
    };

    return res.status(200).json(new ApiResponse(200, summary, 'Dashboard summary fetched.'));
});

// GET /api/delivery/orders/profile-summary
export const getProfileSummary = asyncHandler(async (req, res) => {
    const deliveryBoyId = req.user.id;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [deliveredStats, completedTodayCount] = await Promise.all([
        // T1.1: Aggregate actual driver earnings from DeliveryWalletTransaction, not order.shipping
        DeliveryWalletTransaction.aggregate([
            {
                $match: {
                    deliveryBoyId: new mongoose.Types.ObjectId(deliveryBoyId),
                    type: 'DELIVERY_EARNING',
                },
            },
            {
                $group: {
                    _id: null,
                    totalDeliveries: { $sum: 1 },
                    earnings: { $sum: '$amount' },
                },
            },
        ]),
        mongoose.model('Shipment').countDocuments({
            deliveryBoyId,
            isDeleted: { $ne: true },
            status: 'delivered',
            $or: [
                { deliveredAt: { $gte: todayStart } },
                { deliveredAt: { $exists: false }, updatedAt: { $gte: todayStart } },
                { deliveredAt: null, updatedAt: { $gte: todayStart } },
            ],
        }),
    ]);

    const row = deliveredStats?.[0] || {};
    return res.status(200).json(
        new ApiResponse(
            200,
            {
                totalDeliveries: Number(row.totalDeliveries || 0),
                completedToday: Number(completedTodayCount || 0),
                earnings: Number(row.earnings || 0),
            },
            'Profile summary fetched.'
        )
    );
});

// GET /api/delivery/orders/:id
export const getOrderDetail = asyncHandler(async (req, res) => {
    const OTP_SELECT_S = '+deliveryOtpHash +deliveryOtpExpiry +deliveryOtpSentAt +deliveryOtpAttempts +deliveryOtpDebug +pickupOtpHash +pickupOtpExpiry +pickupOtpDebug';
    const { shipment, order, isLegacy } = await findShipmentAndOrderForAgentOrThrow(
        req.params.id, req.user.id,
        OTP_SELECT_S,   // Shipment OTP fields
        OTP_SELECT_S,   // Order OTP fields (for legacy + populate)
    );

    // Populate vendor info on Order for display
    await order.populate('vendorItems.vendorId', 'storeName phone address');

    if (!isLegacy && shipment) {
        // Overlay the Shipment status and OTP fields on top of the Order response
        const doc = order.toObject();
        doc.status = shipment.status;
        doc.deliveryAssignmentStatus = shipment.deliveryAssignmentStatus;
        doc.assignedAt = shipment.assignedAt;
        doc.deliveredAt = shipment.deliveredAt;
        doc.pickedUpAt = shipment.pickedUpAt;
        
        doc._shipment = {
            _id:                   shipment._id,
            shipmentNumber:        shipment.shipmentNumber,
            deliveryAssignmentStatus: shipment.deliveryAssignmentStatus,
            deliveryOtpSentAt:     shipment.deliveryOtpSentAt,
            deliveryOtpAttempts:   shipment.deliveryOtpAttempts,
            deliveryOtpVerifiedAt: shipment.deliveryOtpVerifiedAt,
            pickupOtpSentAt:       shipment.pickupOtpSentAt,
            status:                shipment.status,
        };
        
        // Add debug OTPs if not in production
        const IS_PRODUCTION = process.env.NODE_ENV === 'production';
        if (!IS_PRODUCTION) {
            doc.pickupOtpDebug = shipment.pickupOtpDebug;
            doc.deliveryOtpDebug = shipment.deliveryOtpDebug;
        }

        return res.status(200).json(new ApiResponse(200, doc, 'Order detail fetched.'));
    }

    res.status(200).json(new ApiResponse(200, order, 'Order detail fetched.'));
});

// PATCH /api/delivery/orders/:id/status
export const updateDeliveryStatus = asyncHandler(async (req, res) => {
    const { status, otp } = req.body;
    const allowed = ['shipped', 'delivered'];
    if (!allowed.includes(status)) throw new ApiError(400, `Status must be one of: ${allowed.join(', ')}`);

    const OTP_SELECT = '+deliveryOtpHash +deliveryOtpExpiry +deliveryOtpSentAt +deliveryOtpAttempts +deliveryOtpDebug';
    const { shipment, order, isLegacy } = await findShipmentAndOrderForAgentOrThrow(
        req.params.id, req.user.id,
        OTP_SELECT,  // Shipment OTP fields
        OTP_SELECT,  // Order OTP fields
    );

    // ─ Transition guard (multi-layer) ──────────────────────────────────────────
    //
    // Rule 1 — Linear state machine for Shipment status.
    const shipmentStatusOk =
        (status === 'shipped'   && ['pending', 'confirmed', 'ready_for_pickup', 'processing', 'picked_up'].includes(shipment.status)) ||
        (status === 'delivered' && ['shipped', 'out_for_delivery'].includes(shipment.status));
    if (!shipmentStatusOk) {
        throw new ApiError(409, `Cannot move order from '${shipment.status}' to '${status}'.`);
    }

    // Rule 2 — Assignment-level gate for new (Shipment-tracked) orders.
    //   Prevents marking 'shipped' before the driver has accepted the assignment.
    //   Prevents marking 'delivered' after delivery is already complete.
    if (shipment) {
        if (status === 'shipped' && shipment.deliveryAssignmentStatus !== 'accepted') {
            throw new ApiError(409,
                `Cannot generate delivery OTP before accepting the assignment. ` +
                `Assignment status is '${shipment.deliveryAssignmentStatus}'.`);
        }
        if (status === 'delivered' && shipment.status === 'delivered') {
            throw new ApiError(409, 'Order has already been delivered.');
        }
    }

    // ─ OTP source: Shipment if available, Order for legacy ───────────────
    // `otpSource` is the document we read OTP fields FROM.
    // ─ OTP source: Shipment if available ───────────────
    const otpSource = shipment;

    if (status === 'shipped') {
        const generatedOtp = generateDeliveryOtp();
        const otpHash      = hashDeliveryOtp(generatedOtp);
        const otpExpiry    = new Date(Date.now() + DELIVERY_OTP_TTL_MS);
        const otpSentAt    = new Date();

        if (shipment) {
            // ─ Phase 5.3: Shipment-primary write ───────────────────────
            await Shipment.findByIdAndUpdate(shipment._id, {
                $set: {
                    deliveryOtpHash:     otpHash,
                    deliveryOtpExpiry:   otpExpiry,
                    deliveryOtpSentAt:   otpSentAt,
                    deliveryOtpAttempts: 0,
                    deliveryOtpVerifiedAt: undefined,
                    deliveryOtpDebug:    !IS_PRODUCTION ? generatedOtp : undefined,
                    status:              'out_for_delivery',
                },
            });
        }

        // Send OTP email regardless of which path was taken
        try {
            const sent = await sendDeliveryOtpEmail(order, generatedOtp);
            if (!sent) {
                console.warn(`[Delivery OTP] Missing customer email for order ${order.orderId || order._id}`);
            }
        } catch (err) {
            console.warn(`[Delivery OTP] Failed to send OTP email for order ${order.orderId || order._id}: ${err.message}`);
        }
    }

    if (status === 'delivered') {
        const normalizedOtp = String(otp || '').trim();
        if (!/^\d{6}$/.test(normalizedOtp)) {
            throw new ApiError(400, 'Delivery OTP is required to complete delivery.');
        }

        if (!otpSource.deliveryOtpHash || !otpSource.deliveryOtpExpiry) {
            throw new ApiError(400, 'Delivery OTP was not generated. Re-mark order as shipped first.');
        }

        if (otpSource.deliveryOtpExpiry < new Date()) {
            throw new ApiError(400, 'Delivery OTP has expired. Please resend OTP.');
        }

        const attempts = Number(otpSource.deliveryOtpAttempts || 0);
        if (attempts >= DELIVERY_OTP_MAX_ATTEMPTS) {
            throw new ApiError(429, 'Maximum OTP attempts reached. Please resend OTP.');
        }

        const isMatch = otpSource.deliveryOtpHash === hashDeliveryOtp(normalizedOtp);
        if (!isMatch) {
            // Increment attempt counter on the canonical source
            if (shipment) {
                await Shipment.findByIdAndUpdate(shipment._id, { $inc: { deliveryOtpAttempts: 1 } });
            }
            throw new ApiError(400, 'Invalid delivery OTP.');
        }

        const verifiedAt = new Date();
        if (shipment) {
            // Phase 5.3: Shipment-primary write
            await Shipment.findByIdAndUpdate(shipment._id, {
                $set:   { deliveryOtpVerifiedAt: verifiedAt, status: 'delivered', deliveredAt: new Date() },
                $unset: { deliveryOtpHash: '', deliveryOtpExpiry: '', deliveryOtpSentAt: '', deliveryOtpAttempts: 0, deliveryOtpDebug: '' },
            });
        }
    }

    // ─ Handle Payouts ─────────────────────────────────────────
    if (status === 'delivered') {
        // Phase 5 flow: Asynchronous payout via event listener
        // (Order status is no longer synced here; it is computed dynamically on read,
        // or synced via the shipmentDelivered event listener if needed)
        await handleOrderDeliveryBalances(order);

        // Emit the event to trigger payout asynchronously
        LogisticsEventBus.emit(LOGISTICS_EVENTS.SHIPMENT_DELIVERED, {
            shipmentId:    shipment._id,
            orderId:       order._id,
            vendorId:      order.vendorItems?.[0]?.vendorId || null,
            deliveredAt:   new Date(),
            providerId:    shipment.providerId,
            paymentMethod: order.paymentMethod,
        });
    } else {
        await handleOrderDeliveryBalances(order);
    }

    notifyOrderUpdate(order); // Uses order_${order.orderId} room — standardized in Phase 5.0

    const statusNotificationTasks = [];
    const itemsSummary = (order.items || [])
        .map((item) => `${item.name} (x${item.quantity})`)
        .join(', ');

    if (order.userId) {
        statusNotificationTasks.push(
            createNotification({
                recipientId: order.userId,
                recipientType: 'user',
                title: status === 'delivered' ? 'Order delivered' : 'Order shipped',
                message:
                    status === 'delivered'
                        ? `Your order ${order.orderId} containing [${itemsSummary}] has been delivered.`
                        : `Your order ${order.orderId} containing [${itemsSummary}] is out for delivery.`,
                type: 'order',
                data: {
                    orderId: String(order.orderId || order._id),
                    status:  String(status),
                },
            })
        );
    }

    const vendorIds = [
        ...new Set(
            (order.vendorItems || [])
                .map((item) => String(item?.vendorId || '').trim())
                .filter(Boolean)
        ),
    ];
    vendorIds.forEach((vendorId) => {
        const vendorGroup = (order.vendorItems || []).find((vg) => String(vg.vendorId) === String(vendorId));
        const vItemsSummary = vendorGroup
            ? (vendorGroup.items || []).map((item) => `${item.name} (x${item.quantity})`).join(', ')
            : '';

        statusNotificationTasks.push(
            createNotification({
                recipientId:   vendorId,
                recipientType: 'vendor',
                title:         'Delivery status update',
                message:       `Order ${order.orderId} containing [${vItemsSummary}] moved to ${status}.`,
                type:          'order',
                data: {
                    orderId: String(order.orderId || order._id),
                    status:  String(status),
                },
            })
        );
    });

    if (statusNotificationTasks.length > 0) {
        await Promise.allSettled(statusNotificationTasks);
    }

    const doc = order.toObject();
    if (shipment) {
        // Fix: Make sure memory object reflects the updated status for response
        if (status === 'delivered') {
            shipment.status = 'delivered';
            shipment.deliveredAt = new Date();
            shipment.deliveryOtpVerifiedAt = new Date();
        } else if (status === 'shipped') {
            shipment.status = 'out_for_delivery';
        }

        doc.status = shipment.status;
        doc.deliveryAssignmentStatus = shipment.deliveryAssignmentStatus;
        doc.assignedAt = shipment.assignedAt;
        doc.deliveredAt = shipment.deliveredAt;
        doc.pickedUpAt = shipment.pickedUpAt;
        
        doc._shipment = {
            _id:                   shipment._id,
            shipmentNumber:        shipment.shipmentNumber,
            deliveryAssignmentStatus: shipment.deliveryAssignmentStatus,
            deliveryOtpSentAt:     shipment.deliveryOtpSentAt,
            deliveryOtpAttempts:   shipment.deliveryOtpAttempts,
            deliveryOtpVerifiedAt: shipment.deliveryOtpVerifiedAt,
            pickupOtpSentAt:       shipment.pickupOtpSentAt,
            status:                shipment.status,
        };
        
        const IS_PRODUCTION = process.env.NODE_ENV === 'production';
        if (!IS_PRODUCTION) {
            doc.pickupOtpDebug = shipment.pickupOtpDebug;
            doc.deliveryOtpDebug = shipment.deliveryOtpDebug;
        }
    }

    res.status(200).json(new ApiResponse(200, doc, 'Delivery status updated.'));
});

// POST /api/delivery/orders/:id/resend-delivery-otp
export const resendDeliveryOtp = asyncHandler(async (req, res) => {
    const { shipment, order } = await findShipmentAndOrderForAgentOrThrow(
        req.params.id, req.user.id
    );

    if (shipment.status !== 'out_for_delivery') {
        throw new ApiError(409, 'Cannot resend OTP. Order is not out for delivery.');
    }

    // Cooldown check: use Shipment as source if available, otherwise Order
    const otpSentAt = shipment.deliveryOtpSentAt;
    if (
        otpSentAt &&
        new Date(otpSentAt).getTime() + DELIVERY_OTP_RESEND_COOLDOWN_MS > Date.now()
    ) {
        throw new ApiError(429, 'Please wait before requesting another OTP.');
    }

    const generatedOtp = generateDeliveryOtp();
    const otpHash      = hashDeliveryOtp(generatedOtp);
    const otpExpiry    = new Date(Date.now() + DELIVERY_OTP_TTL_MS);
    const otpNow       = new Date();

    if (shipment) {
        // Phase 5.3: Shipment-primary write
        await Shipment.findByIdAndUpdate(shipment._id, {
            $set: {
                deliveryOtpHash:     otpHash,
                deliveryOtpExpiry:   otpExpiry,
                deliveryOtpSentAt:   otpNow,
                deliveryOtpAttempts: 0,
                deliveryOtpDebug:    !IS_PRODUCTION ? generatedOtp : undefined,
            },
        });
    }

    notifyOrderUpdate(order);

    try {
        const sent = await sendDeliveryOtpEmail(order, generatedOtp);
        if (!sent) {
            throw new ApiError(400, 'Customer email is not available for this order.');
        }
    } catch (err) {
        if (err instanceof ApiError) throw err;
        console.warn(`[Delivery OTP] Failed to resend OTP for order ${order.orderId || order._id}: ${err.message}`);
        throw new ApiError(500, 'Failed to send OTP email. Please try again.');
    }

    return res.status(200).json(new ApiResponse(200, null, 'Delivery OTP resent successfully.'));
});

// PATCH /api/delivery/location
export const updateLocation = asyncHandler(async (req, res) => {
    const { lat, lng } = req.body;
    if (lat === undefined || lng === undefined) throw new ApiError(400, 'Coordinates required.');

    const deliveryBoy = await DeliveryBoy.findByIdAndUpdate(
        req.user.id,
        { currentLocation: { lat, lng } },
        { new: true }
    );

    // Emit real-time location to all shipments assigned to this delivery boy
    const activeShipments = await mongoose.model('Shipment').find({ 
        deliveryBoyId: req.user.id, 
        status: 'shipped' 
    }).populate('orderId', 'orderId');

    activeShipments.forEach(shipment => {
        if (shipment.orderId) {
            emitToRoom(`order_${shipment.orderId.orderId}`, 'delivery_location_update', { lat, lng });
        }
    });

    res.status(200).json(new ApiResponse(200, deliveryBoy.currentLocation, 'Location updated.'));
});

// GET /api/delivery/orders/:id/debug-otp (non-production only)
export const getDeliveryOtpForDebug = asyncHandler(async (req, res) => {
    if (IS_PRODUCTION) {
        throw new ApiError(404, 'Route not found.');
    }

    const { shipment, order } = await findShipmentAndOrderForAgentOrThrow(
        req.params.id, req.user.id,
        '+deliveryOtpDebug +deliveryOtpExpiry',
        '+deliveryOtpDebug +deliveryOtpExpiry status orderId',
    );

    if (shipment.status !== 'out_for_delivery') {
        throw new ApiError(409, 'Debug OTP is only available while order is out for delivery.');
    }

    // Read from Shipment if available, otherwise fall back to Order
    const otpSource = shipment;
    const otp = String(otpSource.deliveryOtpDebug || '').trim();
    if (!otp) {
        throw new ApiError(404, 'Delivery OTP debug value is not available.');
    }

    return res.status(200).json(new ApiResponse(200, {
        orderId:   order.orderId,
        otp,
        expiresAt: otpSource.deliveryOtpExpiry,
    }, 'Debug OTP fetched.'));
});

// POST /api/delivery/orders/:id/accept
export const acceptOrder = asyncHandler(async (req, res) => {
    const PICKUP_OTP_TTL_MS = IS_PRODUCTION ? 30 * 60 * 1000 : 24 * 60 * 60 * 1000;

    const { shipment, order } = await findShipmentAndOrderForAgentOrThrow(
        req.params.id, req.user.id
    );

    // ─ Idempotency + state guard ───────────────────────────────────────────
    const assignmentStatus = shipment.deliveryAssignmentStatus;

    if (assignmentStatus !== 'assigned') {
        throw new ApiError(409, `Cannot accept order. Assignment status is ${assignmentStatus}.`);
    }

    // ─ Generate Pickup OTP ─────────────────────────────────────────────
    const generatedPickupOtp = generateDeliveryOtp();
    const pickupOtpHash      = hashDeliveryOtp(generatedPickupOtp);
    const pickupOtpExpiry    = new Date(Date.now() + PICKUP_OTP_TTL_MS);
    const pickupOtpNow       = new Date();

    // Determine new order status (processing if was pending, else unchanged)
    const newOrderStatus   = order.status === 'pending' ? 'processing' : order.status;

    // ─ Phase 5.3: Shipment-primary write ─────────────────────────
    const shipmentStatusUpdate = shipment.status === 'pending' ? 'confirmed' : shipment.status;
    await Shipment.findByIdAndUpdate(shipment._id, {
        $set: {
            deliveryAssignmentStatus: 'accepted',
            pickupOtpHash:            pickupOtpHash,
            pickupOtpExpiry:          pickupOtpExpiry,
            pickupOtpSentAt:          pickupOtpNow,
            pickupOtpDebug:           !IS_PRODUCTION ? generatedPickupOtp : undefined,
            status:                   shipmentStatusUpdate,
        },
    });

    // Re-fetch a minimal order snapshot for socket notification + response
    // (we need orderId for the socket room key)
    const updatedOrder = await Order.findById(order._id).select("+pickupOtpHash").lean();
    notifyOrderUpdate(updatedOrder); // Uses order_${order.orderId} room

    // Surface pickup OTP debug value in the response (non-production only) so tests
    // can verify it without a separate debug endpoint.
    const responseData = { ...(updatedOrder || {}), status: newOrderStatus };
    if (!IS_PRODUCTION) {
        responseData.pickupOtpDebug = generatedPickupOtp;
    }

    return res.status(200).json(new ApiResponse(200, responseData, 'Order offer accepted successfully.'));
});

// POST /api/delivery/orders/:id/reject
export const rejectOrder = asyncHandler(async (req, res) => {
    const { shipment, order } = await findShipmentAndOrderForAgentOrThrow(
        req.params.id, req.user.id
    );

    // ─ State guard (Shipment-primary) ───────────────────────────────────
    const assignmentStatus = shipment.deliveryAssignmentStatus;

    if (assignmentStatus !== 'assigned') {
        throw new ApiError(409, 'No active assignment offer found to reject.');
    }

    Shipment.findByIdAndUpdate(
        shipment._id,
        {
            $unset: { deliveryBoyId: '' },
            $set:   { deliveryAssignmentStatus: 'pending' },
            $push:  { rejectedDeliveryBoys: req.user.id },
        }
    ).then(async () => {
        // Re-fetch for socket room key
        const updatedOrder = await Order.findById(order._id).lean();
        if (updatedOrder) notifyOrderUpdate(updatedOrder);
        
        autoAssignDeliveryPartner(shipment._id);
    }).catch(err => {
        console.error(`[rejectOrder] Shipment sync failed for Order ${order.orderId}:`, err.message);
    });

    return res.status(200).json(new ApiResponse(200, null, 'Order offer rejected. Re-routing.'));
});
