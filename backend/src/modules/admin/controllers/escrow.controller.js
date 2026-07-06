import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Order from '../../../models/Order.model.js';
import Vendor from '../../../models/Vendor.model.js';
import Withdrawal from '../../../models/Withdrawal.model.js';
import { createNotification } from '../../../services/notification.service.js';

// GET /api/admin/escrow/summary
export const getEscrowSummary = asyncHandler(async (req, res) => {
    // Total Escrow Balance (held in delivered orders)
    const heldOrders = await Order.find({ escrowStatus: 'held', status: 'delivered' }).lean();
    let totalEscrowBalance = 0;
    heldOrders.forEach(o => {
        totalEscrowBalance += (o.total || 0);
    });

    // Payments On Hold
    const paymentsOnHold = heldOrders.length;

    // Payments Released Today
    const startOfToday = new Date();
    startOfToday.setHours(0,0,0,0);
    const releasedTodayOrders = await Order.find({
        escrowStatus: 'released',
        updatedAt: { $gte: startOfToday }
    }).lean();

    let paymentsReleasedToday = 0;
    releasedTodayOrders.forEach(o => {
        paymentsReleasedToday += (o.total || 0);
    });

    // Pending Refunds
    const pendingRefundOrders = await Order.find({
        escrowStatus: 'refund_processing'
    }).lean();

    let pendingRefunds = 0;
    pendingRefundOrders.forEach(o => {
        pendingRefunds += (o.total || 0);
    });

    // Refunds Completed
    const completedRefundOrders = await Order.find({
        escrowStatus: 'refunded'
    }).lean();

    let refundsCompleted = 0;
    completedRefundOrders.forEach(o => {
        refundsCompleted += (o.total || 0);
    });

    // Withdrawal Requests metrics
    const pendingWithdrawalsCount = await Withdrawal.countDocuments({ status: 'pending' });
    const completedWithdrawals = await Withdrawal.find({ status: 'completed' }).lean();
    let totalCompletedWithdrawals = 0;
    completedWithdrawals.forEach(w => {
        totalCompletedWithdrawals += w.amount;
    });

    res.status(200).json(new ApiResponse(200, {
        totalEscrowBalance,
        paymentsOnHold,
        paymentsReleasedToday,
        pendingRefunds,
        refundsCompleted,
        pendingWithdrawalsCount,
        totalCompletedWithdrawals,
    }, 'Admin escrow summary fetched.'));
});

// GET /api/admin/escrow/withdrawals
export const getWithdrawalRequests = asyncHandler(async (req, res) => {
    const { status = 'all', page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    
    const filter = {};
    if (status !== 'all') {
        filter.status = status;
    }

    const withdrawals = await Withdrawal.find(filter)
        .populate('vendorId', 'name storeName storeLogo email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit, 10))
        .lean();

    const total = await Withdrawal.countDocuments(filter);

    res.status(200).json(new ApiResponse(200, {
        withdrawals,
        total,
        page: Number(page),
        pages: Math.ceil(total / parseInt(limit, 10))
    }, 'Withdrawal requests list fetched.'));
});

// PATCH /api/admin/escrow/withdrawals/:id/status
export const updateWithdrawalStatus = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { status } = req.body; // 'approved', 'processing', 'completed', 'rejected'

    if (!['approved', 'processing', 'completed', 'rejected'].includes(status)) {
        throw new ApiError(400, 'Invalid status update request.');
    }

    const withdrawal = await Withdrawal.findById(id);
    if (!withdrawal) throw new ApiError(404, 'Withdrawal request not found.');

    if (withdrawal.status === 'completed' || withdrawal.status === 'rejected') {
        throw new ApiError(400, 'This withdrawal request has already been finalized.');
    }

    const vendor = await Vendor.findById(withdrawal.vendorId);
    if (!vendor) throw new ApiError(404, 'Associated vendor not found.');

    const oldStatus = withdrawal.status;
    withdrawal.status = status;
    if (status === 'completed' || status === 'rejected') {
        withdrawal.processedAt = new Date();
    }
    await withdrawal.save();

    // Adjust vendor account balances if status changes
    if (status === 'completed') {
        vendor.pendingWithdrawal = Math.max(0, (vendor.pendingWithdrawal || 0) - withdrawal.amount);
        vendor.totalWithdrawn = (vendor.totalWithdrawn || 0) + withdrawal.amount;
        await vendor.save();

        // Notify Vendor
        await createNotification({
            recipientId: vendor._id,
            recipientType: 'vendor',
            title: 'Withdrawal Completed',
            message: `Your withdrawal of Rs.${withdrawal.amount} has been successfully completed & sent to your bank.`,
            type: 'wallet',
            data: { withdrawalId: String(withdrawal._id), amount: withdrawal.amount }
        });
    } else if (status === 'rejected') {
        // Return funds to vendor's wallet balance
        vendor.pendingWithdrawal = Math.max(0, (vendor.pendingWithdrawal || 0) - withdrawal.amount);
        vendor.walletBalance = (vendor.walletBalance || 0) + withdrawal.amount;
        await vendor.save();

        // Notify Vendor
        await createNotification({
            recipientId: vendor._id,
            recipientType: 'vendor',
            title: 'Withdrawal Rejected',
            message: `Your withdrawal request of Rs.${withdrawal.amount} was rejected. Funds returned to your balance.`,
            type: 'wallet',
            data: { withdrawalId: String(withdrawal._id), amount: withdrawal.amount }
        });
    } else if (status === 'approved' && oldStatus === 'pending') {
        // Notify Vendor of approval
        await createNotification({
            recipientId: vendor._id,
            recipientType: 'vendor',
            title: 'Withdrawal Approved',
            message: `Your withdrawal of Rs.${withdrawal.amount} was approved and is being processed.`,
            type: 'wallet',
            data: { withdrawalId: String(withdrawal._id), amount: withdrawal.amount }
        });
    }

    res.status(200).json(new ApiResponse(200, withdrawal, `Withdrawal request status updated to ${status}.`));
});
