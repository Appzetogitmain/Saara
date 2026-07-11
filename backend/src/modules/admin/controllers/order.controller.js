import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Order from '../../../models/Order.model.js';
import DeliveryBoy from '../../../models/DeliveryBoy.model.js';
import User from '../../../models/User.model.js';
import Commission from '../../../models/Commission.model.js';
import Product from '../../../models/Product.model.js';
import { createNotification } from '../../../services/notification.service.js';
import { notifyOrderUpdate } from '../../../services/socket.service.js';
import { handleOrderDeliveryBalances } from '../../../services/orderFinancialHelper.js';
import mongoose from 'mongoose';
import { processDeliveryBoyPayout } from '../../../services/deliveryPayout.service.js';

// GET /api/admin/orders
export const getAllOrders = asyncHandler(async (req, res) => {
    const { status, page = 1, limit = 20, search, startDate, endDate, userId } = req.query;
    const numericPage = Number(page) || 1;
    const numericLimit = Number(limit) || 20;
    const skip = (numericPage - 1) * numericLimit;
    const filter = { isDeleted: { $ne: true } };

    if (status && status !== 'all') filter.status = status;
    if (String(req.query.assignableOnly || '') === 'true' && !filter.status) {
        filter.status = { $in: ['pending', 'processing', 'shipped'] };
    }
    if (search) {
        const regex = new RegExp(search, 'i');
        const matchedUsers = await User.find({
            $or: [{ name: regex }, { email: regex }, { phone: regex }]
        }).select('_id').limit(200).lean();
        const matchedUserIds = matchedUsers.map((u) => u._id);

        filter.$or = [
            { orderId: regex },
            { 'shippingAddress.name': regex },
            { 'shippingAddress.email': regex },
            ...(matchedUserIds.length > 0 ? [{ userId: { $in: matchedUserIds } }] : []),
        ];
    }
    if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) filter.createdAt.$gte = new Date(startDate);
        if (endDate) filter.createdAt.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
    }
    if (req.query.vendorId) {
        filter['vendorItems.vendorId'] = req.query.vendorId;
    }
    if (userId) {
        filter.userId = userId;
    }
    if (String(req.query.onlyUnassigned || '') === 'true') {
        filter.deliveryBoyId = null;
    }

    const [orders, total] = await Promise.all([
        Order.find(filter)
            .populate('userId', 'name email phone')
            .populate('deliveryBoyId', 'name phone')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(numericLimit)
            .lean(),
        Order.countDocuments(filter),
    ]);

    res.status(200).json(new ApiResponse(200, {
        orders,
        total,
        page: numericPage,
        pages: Math.ceil(total / numericLimit),
    }, 'Orders fetched.'));
});

// GET /api/admin/orders/:id
export const getOrderById = asyncHandler(async (req, res) => {
    const order = await Order.findOne({
        $or: [{ orderId: req.params.id }, { _id: req.params.id.match(/^[0-9a-fA-F]{24}$/) ? req.params.id : null }],
        isDeleted: { $ne: true },
    })
        .populate('userId', 'name email phone')
        .populate('deliveryBoyId', 'name phone email vehicleType vehicleNumber')
        .populate('items.productId', 'name images price')
        .lean();

    if (!order) throw new ApiError(404, 'Order not found.');

    const commissions = await Commission.find({ orderId: order._id }).lean();
    order.commissions = commissions || [];

    res.status(200).json(new ApiResponse(200, order, 'Order fetched.'));
});

// PATCH /api/admin/orders/:id/status
export const updateOrderStatus = asyncHandler(async (req, res) => {
    const { status } = req.body;
    const allowed = ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'];
    if (!allowed.includes(status)) throw new ApiError(400, `Status must be one of: ${allowed.join(', ')}`);

    const order = await Order.findOne({
        $or: [{ orderId: req.params.id }, { _id: req.params.id.match(/^[0-9a-fA-F]{24}$/) ? req.params.id : null }],
        isDeleted: { $ne: true },
    }).populate('userId', 'name email');

    if (!order) throw new ApiError(404, 'Order not found.');

    const previousStatus = String(order.status || '').toLowerCase();
    const nextStatus = String(status || '').toLowerCase();

    const allowedTransitions = {
        pending: ['processing', 'cancelled'],
        processing: ['shipped', 'cancelled'],
        shipped: ['delivered', 'cancelled', 'returned'],
        delivered: ['returned'],
        cancelled: [],
        returned: [],
    };

    if (previousStatus !== nextStatus) {
        const nextAllowed = allowedTransitions[previousStatus] || [];
        if (!nextAllowed.includes(nextStatus)) {
            throw new ApiError(409, `Cannot move order from ${previousStatus} to ${nextStatus}.`);
        }
    }

    if (nextStatus === 'delivered' && order.deliveryBoyId && !order.deliveryPayoutProcessed) {
        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                await processDeliveryBoyPayout(order._id, order.deliveryBoyId, session);
            });
        } finally {
            await session.endSession();
        }
        const freshOrder = await Order.findById(order._id).populate('userId', 'name email');
        await handleOrderDeliveryBalances(freshOrder);
        await freshOrder.save();
        Object.assign(order, freshOrder.toObject());
    } else {
        order.status = nextStatus;
        if (nextStatus === 'delivered') {
            order.deliveredAt = new Date();
            order.cancelledAt = null;
        } else if (nextStatus === 'cancelled') {
            order.cancelledAt = new Date();
        } else if (nextStatus === 'returned') {
            order.cancelledAt = null;
        } else {
            order.deliveredAt = null;
            order.cancelledAt = null;
        }

        if (nextStatus === 'processing') {
            order.vendorItems = (order.vendorItems || []).map((vi) => {
                const current = String(vi?.status || 'pending');
                if (current === 'cancelled' || current === 'delivered') return vi;
                return { ...vi.toObject(), status: 'processing' };
            });
        }
        if (nextStatus === 'shipped') {
            order.vendorItems = (order.vendorItems || []).map((vi) => {
                const current = String(vi?.status || 'pending');
                if (current === 'cancelled' || current === 'delivered') return vi;
                return { ...vi.toObject(), status: 'shipped' };
            });
        }
        if (nextStatus === 'delivered') {
            order.vendorItems = (order.vendorItems || []).map((vi) => {
                const current = String(vi?.status || 'pending');
                if (current === 'cancelled') return vi;
                return { ...vi.toObject(), status: 'delivered' };
            });
        }
        if (nextStatus === 'cancelled') {
            order.vendorItems = (order.vendorItems || []).map((vi) => {
                const current = String(vi?.status || 'pending');
                if (current === 'delivered') return vi;
                return { ...vi.toObject(), status: 'cancelled' };
            });
        }

        if (nextStatus === 'cancelled' && previousStatus !== 'cancelled' && ['pending', 'processing', 'shipped'].includes(previousStatus)) {
            for (const item of order.items || []) {
                const product = await Product.findById(item.productId);
                if (!product) continue;
                product.stockQuantity += Number(item.quantity || 0);
                if (product.stockQuantity <= 0) product.stock = 'out_of_stock';
                else if (product.stockQuantity <= product.lowStockThreshold) product.stock = 'low_stock';
                else product.stock = 'in_stock';
                await product.save();
            }
        }

        await handleOrderDeliveryBalances(order);
        await order.save();
    }
    notifyOrderUpdate(order);

    if (nextStatus === 'cancelled') {
        // Reverse vendor earnings visibility for this order.
        // Keep it idempotent by only updating commissions not already cancelled.
        await Commission.updateMany(
            {
                orderId: order._id,
                status: { $ne: 'cancelled' },
            },
            {
                $set: {
                    status: 'cancelled',
                    paidAt: null,
                    settlementId: null,
                },
            }
        );
    }

    const notificationTasks = [];

    if (order.userId) {
        notificationTasks.push(
            createNotification({
                recipientId: order.userId,
                recipientType: 'user',
                title: 'Order status updated',
                message: `Your order ${order.orderId} is now ${status}.`,
                type: 'order',
                data: {
                    orderId: String(order.orderId),
                    status: String(nextStatus),
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
        notificationTasks.push(
            createNotification({
                recipientId: vendorId,
                recipientType: 'vendor',
                title: 'Order status updated by admin',
                message: `Order ${order.orderId} was updated to ${status} by admin.`,
                type: 'order',
                data: {
                    orderId: String(order.orderId),
                    status: String(nextStatus),
                },
            })
        );
    });

    if (order.deliveryBoyId) {
        notificationTasks.push(
            createNotification({
                recipientId: order.deliveryBoyId,
                recipientType: 'delivery',
                title: 'Assigned order updated',
                message: `Order ${order.orderId} is now ${status}.`,
                type: 'order',
                data: {
                    orderId: String(order.orderId),
                    status: String(nextStatus),
                },
            })
        );
    }

    if (notificationTasks.length > 0) {
        await Promise.allSettled(notificationTasks);
    }

    res.status(200).json(new ApiResponse(200, order, 'Order status updated.'));
});


// DELETE /api/admin/orders/:id
export const deleteOrder = asyncHandler(async (req, res) => {
    const order = await Order.findOneAndUpdate(
        {
            $or: [{ orderId: req.params.id }, { _id: req.params.id.match(/^[0-9a-fA-F]{24}$/) ? req.params.id : null }],
            isDeleted: { $ne: true },
        },
        {
            isDeleted: true,
            deletedAt: new Date(),
            deletedBy: req.user?.id || null,
        },
        { new: true }
    );
    if (!order) throw new ApiError(404, 'Order not found.');
    res.status(200).json(new ApiResponse(200, null, 'Order archived.'));
});
