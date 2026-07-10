import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import Order from '../../../models/Order.model.js';
import Product from '../../../models/Product.model.js';
import Commission from '../../../models/Commission.model.js';
import mongoose from 'mongoose';

const toDateKey = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().split('T')[0];
};

const getDateRange = (period = 'month') => {
    const now = new Date();
    if (period === 'today') {
        return {
            start: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
            end: now,
        };
    }
    if (period === 'week') {
        return {
            start: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
            end: now,
        };
    }
    if (period === 'year') {
        return {
            start: new Date(now.getFullYear(), 0, 1),
            end: now,
        };
    }
    return {
        start: new Date(now.getFullYear(), now.getMonth(), 1),
        end: now,
    };
};

const getVendorOrderStatus = (order, vendorId) => {
    const vendorItem = order?.vendorItems?.find(
        (vi) => String(vi?.vendorId) === String(vendorId)
    );
    return String(vendorItem?.status || order?.status || 'pending').toLowerCase();
};

const getVendorOrderRevenue = (order, vendorId) => {
    const vendorItem = order?.vendorItems?.find(
        (vi) => String(vi?.vendorId) === String(vendorId)
    );
    if (!vendorItem) return 0;
    const discount = Number(vendorItem.discount || 0);
    return Number(vendorItem.subtotal || 0) - discount;
};

export const getAnalyticsOverview = asyncHandler(async (req, res) => {
    const period = String(req.query?.period || 'month').toLowerCase();
    const { start, end } = getDateRange(period);
    const vendorObjectId = new mongoose.Types.ObjectId(req.user.id);

    const [orders, productsCount, commissions] = await Promise.all([
        Order.find({
            'vendorItems.vendorId': req.user.id,
            isDeleted: { $ne: true },
            status: { $nin: ['cancelled', 'returned'] },
            createdAt: { $gte: start, $lte: end },
        })
            .select('createdAt date status vendorItems')
            .sort({ createdAt: 1 })
            .lean(),
        Product.countDocuments({ vendorId: req.user.id }),
        Commission.find({
            vendorId: req.user.id,
            status: { $ne: 'cancelled' },
            createdAt: { $gte: start, $lte: end },
        })
            .select('vendorEarnings status')
            .lean(),
    ]);

    const dailyMap = {};
    const statusCounts = {};
    let activeOrdersCount = 0;
    for (const order of orders) {
        const vendorItem = order?.vendorItems?.find(
            (vi) => String(vi?.vendorId) === String(vendorObjectId)
        );
        if (!vendorItem) continue;
        if (String(vendorItem?.status || '').toLowerCase() === 'cancelled') continue;

        const dateKey = toDateKey(order?.createdAt || order?.date);
        if (!dateKey) continue;

        const revenue = getVendorOrderRevenue(order, req.user.id);
        if (!dailyMap[dateKey]) {
            dailyMap[dateKey] = { date: dateKey, revenue: 0, orders: 0 };
        }
        dailyMap[dateKey].revenue += revenue;
        dailyMap[dateKey].orders += 1;
        activeOrdersCount += 1;

        const status = getVendorOrderStatus(order, req.user.id);
        statusCounts[status] = (statusCounts[status] || 0) + 1;
    }

    const timeseries = Object.values(dailyMap).sort(
        (a, b) => new Date(a.date) - new Date(b.date)
    );

    const totalRevenue = timeseries.reduce((sum, point) => sum + Number(point?.revenue || 0), 0);
    const pendingEarnings = commissions
        .filter((c) => c?.status === 'pending')
        .reduce((sum, c) => sum + Number(c?.vendorEarnings || 0), 0);

    const summary = {
        totalRevenue,
        pendingEarnings,
        totalOrders: activeOrdersCount,
        totalProducts: productsCount,
    };

    const statusBreakdown = Object.entries(statusCounts).map(([status, count]) => ({
        status,
        count,
    }));

    res.status(200).json(
        new ApiResponse(
            200,
            { summary, timeseries, statusBreakdown },
            'Analytics overview fetched.'
        )
    );
});
