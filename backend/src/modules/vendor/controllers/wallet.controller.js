import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Commission from '../../../models/Commission.model.js';
import Settlement from '../../../models/Settlement.model.js';
import Vendor from '../../../models/Vendor.model.js';
import Order from '../../../models/Order.model.js';
import mongoose from 'mongoose';

// GET /api/vendor/wallet/stats
export const getWalletStats = asyncHandler(async (req, res) => {
    const vendorId = req.user.id;

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) throw new ApiError(404, 'Vendor not found.');

    // Expected Payout Releases (delivered but on hold)
    const heldOrders = await Order.find({
        status: 'delivered',
        escrowStatus: 'held',
        'items.vendorId': vendorId
    }).lean();

    const heldOrderIds = heldOrders.map(order => order._id);
    const expectedCommissions = await Commission.find({
        orderId: { $in: heldOrderIds },
        vendorId: vendorId
    }).lean();

    const expectedCommMap = expectedCommissions.reduce((acc, comm) => {
        const earnings = comm.vendorEarnings !== undefined 
            ? comm.vendorEarnings 
            : parseFloat((comm.subtotal - comm.commission).toFixed(2));
        acc[String(comm.orderId)] = earnings;
        return acc;
    }, {});

    const expectedReleases = heldOrders.map(order => {
        const amount = expectedCommMap[String(order._id)] || 0;
        return {
            orderId: order.orderId,
            amount: parseFloat(amount.toFixed(2)),
            releaseDate: order.escrowReleaseDate,
            daysRemaining: Math.max(0, Math.ceil((new Date(order.escrowReleaseDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
        };
    });

    // Recent Releases (released in last 30 days)
    const recentReleasedOrders = await Order.find({
        status: 'delivered',
        escrowStatus: 'released',
        'items.vendorId': vendorId,
        updatedAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    }).sort({ updatedAt: -1 }).limit(10).lean();

    const recentOrderIds = recentReleasedOrders.map(order => order._id);
    const recentCommissions = await Commission.find({
        orderId: { $in: recentOrderIds },
        vendorId: vendorId
    }).lean();

    const recentCommMap = recentCommissions.reduce((acc, comm) => {
        const earnings = comm.vendorEarnings !== undefined 
            ? comm.vendorEarnings 
            : parseFloat((comm.subtotal - comm.commission).toFixed(2));
        acc[String(comm.orderId)] = earnings;
        return acc;
    }, {});

    const recentReleases = recentReleasedOrders.map(order => {
        const amount = recentCommMap[String(order._id)] || 0;
        return {
            orderId: order.orderId,
            amount: parseFloat(amount.toFixed(2)),
            releasedAt: order.updatedAt
        };
    });

    res.status(200).json(new ApiResponse(200, {
        walletBalance: parseFloat((vendor.walletBalance || 0).toFixed(2)),
        onHoldBalance: parseFloat((vendor.onHoldBalance || 0).toFixed(2)),
        pendingWithdrawal: parseFloat((vendor.pendingWithdrawal || 0).toFixed(2)),
        totalWithdrawn: parseFloat((vendor.totalWithdrawn || 0).toFixed(2)),
        expectedReleases,
        recentReleases
    }, 'Wallet stats fetched.'));
});

// POST /api/vendor/wallet/withdraw
export const requestWithdrawal = asyncHandler(async (req, res) => {
    const { amount, bankDetails } = req.body;
    const vendorId = req.user.id;

    if (!amount || amount <= 0) {
        throw new ApiError(400, 'Invalid withdrawal amount.');
    }

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) throw new ApiError(404, 'Vendor not found.');

    if (vendor.walletBalance < amount) {
        throw new ApiError(400, 'Insufficient balance in wallet.');
    }

    const { default: Withdrawal } = await import('../../../models/Withdrawal.model.js');
    
    const payoutBankDetails = bankDetails || {
        accountHolder: vendor.bankDetails?.accountName || '',
        accountNumber: vendor.bankDetails?.accountNumber || '',
        ifsc: vendor.bankDetails?.ifscCode || '',
        bankName: vendor.bankDetails?.bankName || ''
    };

    if (!payoutBankDetails.accountNumber || !payoutBankDetails.accountHolder) {
        throw new ApiError(400, 'Bank details are required to process withdrawals. Please update store profile first.');
    }

    const withdrawal = await Withdrawal.create({
        vendorId,
        amount,
        bankDetails: payoutBankDetails,
        status: 'pending'
    });

    // Update vendor balances
    vendor.walletBalance -= amount;
    vendor.pendingWithdrawal = (vendor.pendingWithdrawal || 0) + amount;
    await vendor.save();

    // Notify Admins
    const { default: Admin } = await import('../../../models/Admin.model.js');
    const admins = await Admin.find({ isActive: true }).select('_id').lean();
    const { createNotification } = await import('../../../services/notification.service.js');
    for (const admin of admins) {
        await createNotification({
            recipientId: admin._id,
            recipientType: 'admin',
            title: 'New Withdrawal Request',
            message: `Vendor "${vendor.storeName || vendor.name}" requested a payout of Rs.${amount}.`,
            type: 'payout',
            data: { withdrawalId: String(withdrawal._id), vendorId: String(vendor._id) }
        });
    }

    res.status(201).json(new ApiResponse(201, withdrawal, 'Withdrawal request submitted successfully.'));
});

// GET /api/vendor/wallet/history
export const getTransactionHistory = asyncHandler(async (req, res) => {
    const { page = 1, limit = 15 } = req.query;
    const vendorId = req.user.id;
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const { default: Withdrawal } = await import('../../../models/Withdrawal.model.js');

    const withdrawals = await Withdrawal.find({ vendorId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit, 10))
        .lean();

    const transactions = withdrawals.map(w => ({
        id: w._id,
        type: 'payout',
        amount: w.amount,
        description: `Withdrawal request (${w.status.toUpperCase()})`,
        date: w.createdAt,
        status: w.status
    }));

    res.status(200).json(new ApiResponse(200, {
        transactions,
        page: Number(page),
        hasMore: transactions.length >= parseInt(limit, 10)
    }, 'Transaction history fetched.'));
});
