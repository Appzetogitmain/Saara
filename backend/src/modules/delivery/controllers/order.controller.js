import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Order from '../../../models/Order.model.js';
import DeliveryBoy from '../../../models/DeliveryBoy.model.js';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { sendEmail } from '../../../services/email.service.js';
import { createNotification } from '../../../services/notification.service.js';
import { emitToRoom, notifyOrderUpdate } from '../../../services/socket.service.js';
import { autoAssignDeliveryPartner } from '../../../services/assignmentService.js';
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

const generateDeliveryOtp = () => String(Math.floor(100000 + Math.random() * 900000));

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

    if (!hasPaginationParams) {
        const orders = await Order.find(filter).sort({ createdAt: -1 });
        return res.status(200).json(new ApiResponse(200, orders, 'Assigned orders fetched.'));
    }

    const numericPage = Math.max(1, Number(page) || 1);
    const requestedLimit = Number(limit) || 20;
    const numericLimit = Math.min(Math.max(1, requestedLimit), 100);
    const skip = (numericPage - 1) * numericLimit;

    const [orders, total] = await Promise.all([
        Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(numericLimit),
        Order.countDocuments(filter),
    ]);

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

    const [statusStats, completedTodayCount, earningsStats, recentOrders] = await Promise.all([
        Order.aggregate([
            { $match: { deliveryBoyId: new mongoose.Types.ObjectId(deliveryBoyId), isDeleted: { $ne: true } } },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                },
            },
        ]),
        Order.countDocuments({
            deliveryBoyId,
            isDeleted: { $ne: true },
            status: 'delivered',
            $or: [
                { deliveredAt: { $gte: todayStart } },
                { deliveredAt: { $exists: false }, updatedAt: { $gte: todayStart } },
                { deliveredAt: null, updatedAt: { $gte: todayStart } },
            ],
        }),
        Order.aggregate([
            {
                $match: {
                    deliveryBoyId: new mongoose.Types.ObjectId(deliveryBoyId),
                    isDeleted: { $ne: true },
                    status: 'delivered',
                },
            },
            {
                $group: {
                    _id: null,
                    totalDeliveryFees: { $sum: { $ifNull: ['$shipping', 0] } },
                },
            },
        ]),
        Order.find({ deliveryBoyId, isDeleted: { $ne: true } }).sort({ createdAt: -1 }).limit(3),
    ]);

    const countByStatus = statusStats.reduce((acc, row) => {
        acc[String(row?._id || '')] = Number(row?.count || 0);
        return acc;
    }, {});

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
        Order.aggregate([
            {
                $match: {
                    deliveryBoyId: new mongoose.Types.ObjectId(deliveryBoyId),
                    isDeleted: { $ne: true },
                    status: 'delivered',
                },
            },
            {
                $group: {
                    _id: null,
                    totalDeliveries: { $sum: 1 },
                    earnings: { $sum: { $ifNull: ['$shipping', 0] } },
                },
            },
        ]),
        Order.countDocuments({
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
    const query = {
        deliveryBoyId: req.user.id,
        isDeleted: { $ne: true },
        $or: [{ orderId: req.params.id }],
    };
    if (mongoose.isValidObjectId(req.params.id)) {
        query.$or.push({ _id: req.params.id });
    }

    const order = await Order.findOne(query)
        .select('+deliveryOtpHash +deliveryOtpExpiry +deliveryOtpSentAt +deliveryOtpAttempts +deliveryOtpDebug +pickupOtpHash +pickupOtpExpiry +pickupOtpDebug')
        .populate('vendorItems.vendorId', 'storeName phone address');
    if (!order) throw new ApiError(404, 'Order not found.');
    res.status(200).json(new ApiResponse(200, order, 'Order detail fetched.'));
});

// PATCH /api/delivery/orders/:id/status
export const updateDeliveryStatus = asyncHandler(async (req, res) => {
    const { status, otp } = req.body;
    const allowed = ['shipped', 'delivered'];
    if (!allowed.includes(status)) throw new ApiError(400, `Status must be one of: ${allowed.join(', ')}`);

    const query = {
        deliveryBoyId: req.user.id,
        isDeleted: { $ne: true },
        $or: [{ orderId: req.params.id }],
    };
    if (mongoose.isValidObjectId(req.params.id)) {
        query.$or.push({ _id: req.params.id });
    }

    const order = await Order.findOne(query).select('+deliveryOtpHash +deliveryOtpExpiry +deliveryOtpSentAt +deliveryOtpAttempts +deliveryOtpDebug');
    if (!order) throw new ApiError(404, 'Order not found.');

    // Server-side transition guard (frontend guard already exists).
    const transitionAllowed =
        (status === 'shipped' && ['pending', 'processing', 'ready_for_pickup'].includes(order.status)) ||
        (status === 'delivered' && order.status === 'shipped');
    if (!transitionAllowed) {
        throw new ApiError(409, `Cannot move order from ${order.status} to ${status}.`);
    }

    if (status === 'shipped') {
        const generatedOtp = generateDeliveryOtp();
        order.deliveryOtpHash = hashDeliveryOtp(generatedOtp);
        order.deliveryOtpExpiry = new Date(Date.now() + DELIVERY_OTP_TTL_MS);
        order.deliveryOtpSentAt = new Date();
        order.deliveryOtpAttempts = 0;
        order.deliveryOtpVerifiedAt = undefined;
        if (!IS_PRODUCTION) {
            order.deliveryOtpDebug = generatedOtp;
        }

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

        if (!order.deliveryOtpHash || !order.deliveryOtpExpiry) {
            throw new ApiError(400, 'Delivery OTP was not generated. Re-mark order as shipped first.');
        }

        if (order.deliveryOtpExpiry < new Date()) {
            throw new ApiError(400, 'Delivery OTP has expired. Please resend OTP.');
        }

        const attempts = Number(order.deliveryOtpAttempts || 0);
        if (attempts >= DELIVERY_OTP_MAX_ATTEMPTS) {
            throw new ApiError(429, 'Maximum OTP attempts reached. Please resend OTP.');
        }

        const isMatch = order.deliveryOtpHash === hashDeliveryOtp(normalizedOtp);
        if (!isMatch) {
            order.deliveryOtpAttempts = attempts + 1;
            await order.save();
            throw new ApiError(400, 'Invalid delivery OTP.');
        }

        order.deliveryOtpVerifiedAt = new Date();
        order.deliveryOtpHash = undefined;
        order.deliveryOtpExpiry = undefined;
        order.deliveryOtpSentAt = undefined;
        order.deliveryOtpAttempts = 0;
        order.deliveryOtpDebug = undefined;
    }

    order.status = status;
    // Keep vendor sub-order statuses aligned with delivery progression.
    if (status === 'shipped') {
        order.vendorItems = (order.vendorItems || []).map((vi) => {
            const current = String(vi?.status || 'pending');
            if (current === 'cancelled' || current === 'delivered') return vi;
            return { ...vi.toObject(), status: 'shipped' };
        });
    }
    if (status === 'delivered') {
        order.vendorItems = (order.vendorItems || []).map((vi) => {
            const current = String(vi?.status || 'pending');
            if (current === 'cancelled') return vi;
            return { ...vi.toObject(), status: 'delivered' };
        });
    }
    if (status === 'delivered') {
        order.deliveredAt = new Date();
    }
    await handleOrderDeliveryBalances(order);
    await order.save();
    notifyOrderUpdate(order);

    const statusNotificationTasks = [];
    if (order.userId) {
        statusNotificationTasks.push(
            createNotification({
                recipientId: order.userId,
                recipientType: 'user',
                title: status === 'delivered' ? 'Order delivered' : 'Order shipped',
                message:
                    status === 'delivered'
                        ? `Your order ${order.orderId} has been delivered.`
                        : `Your order ${order.orderId} is out for delivery.`,
                type: 'order',
                data: {
                    orderId: String(order.orderId || order._id),
                    status: String(status),
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
        statusNotificationTasks.push(
            createNotification({
                recipientId: vendorId,
                recipientType: 'vendor',
                title: 'Delivery status update',
                message: `Order ${order.orderId} moved to ${status}.`,
                type: 'order',
                data: {
                    orderId: String(order.orderId || order._id),
                    status: String(status),
                },
            })
        );
    });

    if (statusNotificationTasks.length > 0) {
        await Promise.allSettled(statusNotificationTasks);
    }

    res.status(200).json(new ApiResponse(200, order, 'Delivery status updated.'));
});

// POST /api/delivery/orders/:id/resend-delivery-otp
export const resendDeliveryOtp = asyncHandler(async (req, res) => {
    const query = {
        deliveryBoyId: req.user.id,
        isDeleted: { $ne: true },
        $or: [{ orderId: req.params.id }],
    };

    if (mongoose.isValidObjectId(req.params.id)) {
        query.$or.push({ _id: req.params.id });
    }

    const order = await Order.findOne(query);
    if (!order) throw new ApiError(404, 'Order not found.');

    if (order.status !== 'shipped') {
        throw new ApiError(409, 'OTP can only be resent when order is in shipped state.');
    }

    if (
        order.deliveryOtpSentAt &&
        new Date(order.deliveryOtpSentAt).getTime() + DELIVERY_OTP_RESEND_COOLDOWN_MS > Date.now()
    ) {
        throw new ApiError(429, 'Please wait before requesting another OTP.');
    }

    const generatedOtp = generateDeliveryOtp();
    order.deliveryOtpHash = hashDeliveryOtp(generatedOtp);
    order.deliveryOtpExpiry = new Date(Date.now() + DELIVERY_OTP_TTL_MS);
    order.deliveryOtpSentAt = new Date();
    order.deliveryOtpAttempts = 0;
    if (!IS_PRODUCTION) {
        order.deliveryOtpDebug = generatedOtp;
    }
    await order.save();
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

    // Emit real-time location to all orders assigned to this delivery boy
    const activeOrders = await Order.find({ 
        deliveryBoyId: req.user.id, 
        status: 'shipped' 
    }).select('_id orderId');

    activeOrders.forEach(order => {
        emitToRoom(`order_${order.orderId}`, 'delivery_location_update', { lat, lng });
    });

    res.status(200).json(new ApiResponse(200, deliveryBoy.currentLocation, 'Location updated.'));
});

// GET /api/delivery/orders/:id/debug-otp (non-production only)
export const getDeliveryOtpForDebug = asyncHandler(async (req, res) => {
    if (IS_PRODUCTION) {
        throw new ApiError(404, 'Route not found.');
    }

    const query = {
        deliveryBoyId: req.user.id,
        isDeleted: { $ne: true },
        $or: [{ orderId: req.params.id }],
    };
    if (mongoose.isValidObjectId(req.params.id)) {
        query.$or.push({ _id: req.params.id });
    }

    const order = await Order.findOne(query).select('+deliveryOtpDebug +deliveryOtpExpiry status orderId');
    if (!order) throw new ApiError(404, 'Order not found.');
    if (order.status !== 'shipped') {
        throw new ApiError(409, 'Debug OTP is only available while order is in shipped state.');
    }

    const otp = String(order.deliveryOtpDebug || '').trim();
    if (!otp) {
        throw new ApiError(404, 'Delivery OTP debug value is not available.');
    }

    return res.status(200).json(new ApiResponse(200, {
        orderId: order.orderId,
        otp,
        expiresAt: order.deliveryOtpExpiry,
    }, 'Debug OTP fetched.'));
});

// POST /api/delivery/orders/:id/accept
export const acceptOrder = asyncHandler(async (req, res) => {
    const query = {
        deliveryBoyId: req.user.id,
        isDeleted: { $ne: true },
        $or: [{ orderId: req.params.id }],
    };
    if (mongoose.isValidObjectId(req.params.id)) {
        query.$or.push({ _id: req.params.id });
    }

    const order = await Order.findOne(query);
    if (!order) throw new ApiError(404, 'Order not found.');

    if (order.deliveryAssignmentStatus !== 'assigned') {
        throw new ApiError(409, `Cannot accept order. Assignment status is ${order.deliveryAssignmentStatus}.`);
    }

    order.deliveryAssignmentStatus = 'accepted';
    
    // Generate Pickup OTP for Vendor Handoff verification
    const generatedPickupOtp = generateDeliveryOtp();
    order.pickupOtpHash = hashDeliveryOtp(generatedPickupOtp);
    order.pickupOtpExpiry = new Date(Date.now() + (IS_PRODUCTION ? 30 * 60 * 1000 : 24 * 60 * 60 * 1000)); // 30 minutes in production, 24 hours in dev
    order.pickupOtpSentAt = new Date();
    if (!IS_PRODUCTION) {
        order.pickupOtpDebug = generatedPickupOtp;
    }
    
    // Also transition order status to 'processing' if it's currently pending
    if (order.status === 'pending') {
        order.status = 'processing';
        order.vendorItems = (order.vendorItems || []).map((vi) => {
            const current = String(vi?.status || 'pending');
            if (current === 'cancelled' || current === 'delivered') return vi;
            return { ...vi.toObject(), status: 'processing' };
        });
    }

    await order.save();
    notifyOrderUpdate(order);

    return res.status(200).json(new ApiResponse(200, order, 'Order offer accepted successfully.'));
});

// POST /api/delivery/orders/:id/reject
export const rejectOrder = asyncHandler(async (req, res) => {
    const query = {
        deliveryBoyId: req.user.id,
        isDeleted: { $ne: true },
        $or: [{ orderId: req.params.id }],
    };
    if (mongoose.isValidObjectId(req.params.id)) {
        query.$or.push({ _id: req.params.id });
    }

    const order = await Order.findOne(query);
    if (!order) throw new ApiError(404, 'Order not found.');

    if (order.deliveryAssignmentStatus !== 'assigned') {
        throw new ApiError(409, 'No active assignment offer found to reject.');
    }

    // Push current rider to rejected list, clear current assignment, set status to pending
    order.rejectedDeliveryBoys.push(req.user.id);
    order.deliveryBoyId = undefined;
    order.deliveryAssignmentStatus = 'pending';
    await order.save();
    notifyOrderUpdate(order);

    // Re-trigger auto-assignment for the order asynchronously
    autoAssignDeliveryPartner(order._id);

    return res.status(200).json(new ApiResponse(200, null, 'Order offer rejected. Re-routing.'));
});
