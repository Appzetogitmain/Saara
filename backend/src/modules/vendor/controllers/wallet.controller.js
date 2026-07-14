import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Commission from '../../../models/Commission.model.js';
import Settlement from '../../../models/Settlement.model.js';
import Vendor from '../../../models/Vendor.model.js';
import Order from '../../../models/Order.model.js';
import Withdrawal from '../../../models/Withdrawal.model.js';
import VendorWalletTransaction from '../../../models/VendorWalletTransaction.model.js';
import Admin from '../../../models/Admin.model.js';
import { createNotification } from '../../../services/notification.service.js';
import mongoose from 'mongoose';

// GET /api/vendor/wallet/stats
export const getWalletStats = asyncHandler(async (req, res) => {
    const vendorId = req.user.id;

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) throw new ApiError(404, 'Vendor not found.');

    // T2.7: Query Commission directly for accurate per-vendor escrow amounts.
    // Old approach: Order.find({ 'items.vendorId': vendorId }) returned inflated amounts
    // because order.escrowAmount is the TOTAL for ALL vendors, not just this vendor's share.
    const heldCommissions = await Commission.find({
        vendorId: vendorId,
        escrowStatus: 'held',
        status: { $ne: 'cancelled' },
    }).populate('orderId', 'orderId escrowReleaseDate').lean();

    const expectedReleases = heldCommissions.map(comm => {
        const amount = comm.vendorNetEarnings !== undefined ? comm.vendorNetEarnings : (comm.vendorEarnings || 0);
        const releaseDate = comm.escrowReleaseDate || (comm.orderId && comm.orderId.escrowReleaseDate);
        return {
            orderId: comm.orderId?.orderId || String(comm.orderId?._id || comm.orderId),
            amount: parseFloat((amount || 0).toFixed(2)),
            releaseDate: releaseDate || null,
            daysRemaining: releaseDate
                ? Math.max(0, Math.ceil((new Date(releaseDate).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
                : null,
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

    // SEC-07: Normalize amount — reject negative, non-numeric, or excessively precise values
    const reqAmount = parseFloat(Number(amount).toFixed(2));
    if (!amount || isNaN(reqAmount) || reqAmount <= 0) {
        throw new ApiError(400, 'Invalid withdrawal amount.');
    }
    const MIN_WITHDRAWAL = 100;
    if (reqAmount < MIN_WITHDRAWAL) {
        throw new ApiError(400, `Minimum withdrawal amount is ₹${MIN_WITHDRAWAL}.`);
    }

    // Resolve bank details outside the transaction
    const vendorForDetails = await Vendor.findById(vendorId).select('bankDetails storeName name walletBalance').lean();
    if (!vendorForDetails) throw new ApiError(404, 'Vendor not found.');

    const payoutBankDetails = bankDetails || {
        accountHolder: vendorForDetails.bankDetails?.accountName || '',
        accountNumber: vendorForDetails.bankDetails?.accountNumber || '',
        ifsc:          vendorForDetails.bankDetails?.ifscCode || '',
        bankName:      vendorForDetails.bankDetails?.bankName || '',
    };

    if (!payoutBankDetails.accountNumber || !payoutBankDetails.accountHolder) {
        throw new ApiError(400, 'Bank details are required to process withdrawals. Please update store profile first.');
    }

    const session = await mongoose.startSession();
    let withdrawal;
    try {
        await session.withTransaction(async () => {
            // STEP 1 — Check for existing pending withdrawal FIRST (idempotency guard)
            const existingPending = await Withdrawal.findOne(
                { vendorId, status: { $in: ['pending', 'approved', 'processing'] } },
                null,
                { session }
            );
            if (existingPending) {
                throw new ApiError(409, 'You already have a pending withdrawal request. Please wait for it to be processed.');
            }

            // STEP 2 — Atomic balance deduction (prevents race condition via filter on $gte)
            const vendor = await Vendor.findOneAndUpdate(
                { _id: vendorId, walletBalance: { $gte: reqAmount } },
                { $inc: { walletBalance: -reqAmount, pendingWithdrawal: reqAmount } },
                { new: true, session }
            );
            if (!vendor) {
                throw new ApiError(400, 'Insufficient balance in wallet.');
            }

            // STEP 3 — Create withdrawal record
            const [created] = await Withdrawal.create([{
                vendorId,
                amount: reqAmount,
                bankDetails: payoutBankDetails,
                status: 'pending',
            }], { session });
            withdrawal = created;

            // STEP 4 — Create WITHDRAWAL_HOLD ledger entry
            await VendorWalletTransaction.create([{
                vendorId,
                type:                'WITHDRAWAL_HOLD',
                amount:              -reqAmount,
                referenceId:         `WITHDRAWAL_HOLD_${withdrawal._id}`,
                walletBalanceBefore: vendor.walletBalance + reqAmount,
                walletBalanceAfter:  vendor.walletBalance,
                performedBy:         { role: 'vendor', id: vendorId },
                relatedWithdrawalId: withdrawal._id,
                notes:               `Withdrawal request of ₹${reqAmount}`,
            }], { session });
        });
    } finally {
        await session.endSession();
    }

    // Notify Admins (outside transaction — fire and forget, EXTERNAL API RULE)
    const admins = await Admin.find({ isActive: true }).select('_id').lean();
    await Promise.allSettled(admins.map(admin =>
        createNotification({
            recipientId:   admin._id,
            recipientType: 'admin',
            title:         'New Withdrawal Request',
            message:       `Vendor "${vendorForDetails.storeName || vendorForDetails.name}" requested a payout of ₹${reqAmount}.`,
            type:          'payout',
            data:          { withdrawalId: String(withdrawal._id), vendorId: String(vendorId) },
        }).catch(console.error)
    ));

    res.status(201).json(new ApiResponse(201, withdrawal, 'Withdrawal request submitted successfully.'));
});

// GET /api/vendor/wallet/history
export const getTransactionHistory = asyncHandler(async (req, res) => {
    const { page = 1, limit = 15 } = req.query;
    const vendorId = req.user.id;
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

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
