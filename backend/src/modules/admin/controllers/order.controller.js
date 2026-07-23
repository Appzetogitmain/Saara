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
import { buildOrderItemsSummary, buildVendorItemsSummary } from '../../../utils/notificationProductFormatter.js';
import { handleOrderDeliveryBalances } from '../../../services/orderFinancialHelper.js';
import mongoose from 'mongoose';
import { processDeliveryBoyPayout } from '../../../services/deliveryPayout.service.js';

// GET /api/admin/orders
export const getAllOrders = asyncHandler(async (req, res) => {
    const { status, page = 1, limit = 20, search, startDate, endDate, userId } = req.query;
    const numericPage = Number(page) || 1;
    const numericLimit = Number(limit) || 20;
    const skip = (numericPage - 1) * numericLimit;
    let filter = { isDeleted: { $ne: true } };

    if (status && status !== 'all') {
        const deliveryStatuses = ['ready_for_pickup', 'shipped', 'out_for_delivery', 'delivered'];
        if (deliveryStatuses.includes(status)) {
            const matchingShipments = await mongoose.model('Shipment').find({ status }).select('orderId').lean();
            const orderIds = matchingShipments.map(s => s.orderId);
            if (filter._id) {
                filter._id.$in = filter._id.$in.filter(id => orderIds.some(oid => String(oid) === String(id)));
            } else {
                filter._id = { $in: orderIds };
            }
        } else {
            filter.status = status;
        }
    }
    
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
        const unassignedShipments = await mongoose.model('Shipment').find({
            deliveryBoyId: { $in: [null, undefined] },
            status: { $nin: ['delivered', 'cancelled', 'returned'] } // Only active shipments
        }).select('orderId').lean();
        const orderIds = unassignedShipments.map(s => s.orderId);
        filter._id = { $in: orderIds };
    }

    const [orders, total] = await Promise.all([
        Order.find(filter)
            .populate('userId', 'name email phone')
            .populate({
                path: 'shipments',
                populate: { path: 'deliveryBoyId', select: 'name phone' }
            })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(numericLimit)
            .lean(),
        Order.countDocuments(filter),
    ]);

    const ordersWithDynamicStatus = orders.map(order => {
        if (order.shipments && order.shipments.length > 0) {
            const allDelivered = order.shipments.every(s => s.status === 'delivered');
            const anyShipped = order.shipments.some(s => ['shipped', 'out_for_delivery'].includes(s.status));
            const anyReady = order.shipments.some(s => s.status === 'ready_for_pickup');
            
            if (allDelivered) {
                order.status = 'delivered';
                order.deliveredAt = order.shipments.find(s => s.deliveredAt)?.deliveredAt || new Date();
            } else if (anyShipped) {
                order.status = 'shipped';
            } else if (anyReady) {
                order.status = 'ready_for_pickup';
            }
        }
        return order;
    });

    res.status(200).json(new ApiResponse(200, {
        orders: ordersWithDynamicStatus,
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
        .populate({
            path: 'shipments',
            populate: { path: 'deliveryBoyId', select: 'name phone email vehicleType vehicleNumber' }
        })
        .populate('items.productId', 'name images price')
        .lean();

    if (!order) throw new ApiError(404, 'Order not found.');

    const commissions = await Commission.find({ orderId: order._id }).lean();
    order.commissions = commissions || [];

    if (order.shipments && order.shipments.length > 0) {
        const allDelivered = order.shipments.every(s => s.status === 'delivered');
        const anyShipped = order.shipments.some(s => ['shipped', 'out_for_delivery'].includes(s.status));
        const anyReady = order.shipments.some(s => s.status === 'ready_for_pickup');
        
        if (allDelivered) {
            order.status = 'delivered';
            order.deliveredAt = order.shipments.find(s => s.deliveredAt)?.deliveredAt || new Date();
        } else if (anyShipped) {
            order.status = 'shipped';
        } else if (anyReady) {
            order.status = 'ready_for_pickup';
        }
    }

    res.status(200).json(new ApiResponse(200, order, 'Order fetched.'));
});

// PATCH /api/admin/orders/:id/status
export const updateOrderStatus = asyncHandler(async (req, res) => {
    const { status } = req.body;
    const allowed = ['pending', 'processing', 'ready_for_pickup', 'shipped', 'delivered', 'cancelled', 'returned'];
    if (!allowed.includes(status)) throw new ApiError(400, `Status must be one of: ${allowed.join(', ')}`);

    const order = await Order.findOne({
        $or: [{ orderId: req.params.id }, { _id: req.params.id.match(/^[0-9a-fA-F]{24}$/) ? req.params.id : null }],
        isDeleted: { $ne: true },
    }).populate('userId', 'name email');

    if (!order) throw new ApiError(404, 'Order not found.');

    let currentDynamicStatus = String(order.status || '').toLowerCase();
    
    // Dynamically calculate status from shipments (if any exist)
    const shipments = await mongoose.model('Shipment').find({ orderId: order._id }).lean();
    if (shipments && shipments.length > 0) {
        const allDelivered = shipments.every(s => s.status === 'delivered');
        const anyShipped = shipments.some(s => ['shipped', 'out_for_delivery'].includes(s.status));
        const anyReady = shipments.some(s => s.status === 'ready_for_pickup');
        
        if (allDelivered) currentDynamicStatus = 'delivered';
        else if (anyShipped) currentDynamicStatus = 'shipped';
        else if (anyReady) currentDynamicStatus = 'ready_for_pickup';
    }

    const previousStatus = currentDynamicStatus;
    const nextStatus = String(status || '').toLowerCase();

    const allowedTransitions = {
        pending:          ['processing', 'cancelled'],
        processing:       ['ready_for_pickup', 'shipped', 'cancelled'],
        ready_for_pickup: ['shipped', 'cancelled'],
        shipped:          ['delivered', 'cancelled', 'returned'],
        delivered:        ['returned'],
        cancelled:        [],
        returned:         [],
    };

    if (previousStatus !== nextStatus) {
        const nextAllowed = allowedTransitions[previousStatus] || [];
        if (!nextAllowed.includes(nextStatus)) {
            throw new ApiError(409, `Cannot move order from '${previousStatus}' to '${nextStatus}'.`);
        }
    }

    // Legacy delivery boy payout trigger removed (Phase 9.1).
    // Payouts are now triggered exclusively by Shipment lifecycle events,
    // not by manual Order status updates in the admin panel.

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
    await order.save();
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
    const itemsText = buildOrderItemsSummary(order.items);

    if (order.userId) {
        notificationTasks.push(
            createNotification({
                recipientId: order.userId,
                recipientType: 'user',
                title: 'Order status updated',
                message: `Your order ${order.orderId} is now ${status}.${itemsText}`,
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
        const vendorGroup = (order.vendorItems || []).find((vg) => String(vg.vendorId) === String(vendorId));
        const vItemsText = vendorGroup ? buildVendorItemsSummary(vendorGroup.items) : '';

        notificationTasks.push(
            createNotification({
                recipientId: vendorId,
                recipientType: 'vendor',
                title: 'Order status updated by admin',
                message: `Order ${order.orderId} was updated to ${status} by admin.${vItemsText}`,
                type: 'order',
                data: {
                    orderId: String(order.orderId),
                    status: String(nextStatus),
                },
            })
        );
    });

    const orderShipments = await mongoose.model('Shipment').find({ orderId: order._id, deliveryBoyId: { $exists: true, $ne: null } }).lean();
    const deliveryBoyIds = [...new Set(orderShipments.map(s => String(s.deliveryBoyId)))];

    deliveryBoyIds.forEach(boyId => {
        notificationTasks.push(
            createNotification({
                recipientId: boyId,
                recipientType: 'delivery',
                title: 'Assigned order updated',
                message: `Order ${order.orderId} is now ${status}.${itemsText}`,
                type: 'order',
                data: {
                    orderId: String(order.orderId),
                    status: String(nextStatus),
                },
            })
        );
    });

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
