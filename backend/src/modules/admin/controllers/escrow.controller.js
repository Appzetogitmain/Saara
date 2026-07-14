import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Order from '../../../models/Order.model.js';
import Vendor from '../../../models/Vendor.model.js';
import Withdrawal from '../../../models/Withdrawal.model.js';
import VendorWalletTransaction from '../../../models/VendorWalletTransaction.model.js';
import mongoose from 'mongoose';
import { createNotification } from '../../../services/notification.service.js';

// GET /api/admin/escrow/summary
export const getEscrowSummary = asyncHandler(async (req, res) => {
    // Total Escrow Balance (held in delivered orders)
    const heldOrders = await Order.find({ escrowStatus: 'held', status: 'delivered' }).lean();
    let totalEscrowBalance = 0;
    heldOrders.forEach(o => {
        totalEscrowBalance += (o.escrowAmount !== undefined ? o.escrowAmount : o.vendorEarnings !== undefined ? o.vendorEarnings : o.total || 0);
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
        paymentsReleasedToday += (o.escrowAmount !== undefined ? o.escrowAmount : o.vendorEarnings !== undefined ? o.vendorEarnings : o.total || 0);
    });

    // Pending Refunds
    const pendingRefundOrders = await Order.find({
        escrowStatus: 'refund_processing'
    }).lean();

    let pendingRefunds = 0;
    pendingRefundOrders.forEach(o => {
        pendingRefunds += (o.escrowAmount !== undefined ? o.escrowAmount : o.vendorEarnings !== undefined ? o.vendorEarnings : o.total || 0);
    });

    // Refunds Completed
    const completedRefundOrders = await Order.find({
        escrowStatus: 'refunded'
    }).lean();

    let refundsCompleted = 0;
    completedRefundOrders.forEach(o => {
        refundsCompleted += (o.escrowAmount !== undefined ? o.escrowAmount : o.vendorEarnings !== undefined ? o.vendorEarnings : o.total || 0);
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
    const { status, transactionReference, rejectionReason, notes } = req.body;

    if (!['approved', 'processing', 'completed', 'rejected'].includes(status)) {
        throw new ApiError(400, 'Invalid status. Must be: approved, processing, completed, or rejected.');
    }

    const session = await mongoose.startSession();
    let withdrawal;
    try {
        await session.withTransaction(async () => {
            // Atomic status lock — prevents double-approval (H-5, H-6 fix)
            withdrawal = await Withdrawal.findOneAndUpdate(
                { _id: id, status: { $nin: ['completed', 'rejected', 'failed'] } },
                {
                    $set: {
                        status,
                        processedBy:          req.user?.id,
                        processedAt:          new Date(),
                        ...(transactionReference && { transactionReference }),
                        ...(rejectionReason    && { rejectionReason }),
                        ...(notes             && { notes }),
                    }
                },
                { new: true, session }
            );
            if (!withdrawal) {
                throw new ApiError(400, 'Withdrawal already finalized or not found.');
            }

            if (status === 'completed') {
                // Adjust vendor tracking counters
                const vendor = await Vendor.findByIdAndUpdate(
                    withdrawal.vendorId,
                    { $inc: { pendingWithdrawal: -withdrawal.amount, totalWithdrawn: withdrawal.amount } },
                    { new: true, session }
                );

                // MED-11: Create WITHDRAWAL_COMPLETED ledger entry for full audit trail
                if (vendor) {
                    await VendorWalletTransaction.create([{
                        vendorId:            withdrawal.vendorId,
                        type:                'WITHDRAWAL_COMPLETED',
                        amount:              -withdrawal.amount,   // negative = money left wallet
                        referenceId:         `WITHDRAWAL_COMPLETED_${withdrawal._id}`,
                        walletBalanceBefore: vendor.walletBalance,   // already deducted at HOLD time
                        walletBalanceAfter:  vendor.walletBalance,   // no further change
                        performedBy:         { role: 'admin', id: req.user?.id },
                        relatedWithdrawalId: withdrawal._id,
                        // T5.4: Same before/after balance is intentional \u2014 wallet was deducted at WITHDRAWAL_HOLD.
                        // This entry records physical fund disbursement, not a wallet deduction.
                        notes: `Withdrawal completed. Transaction ref: ${transactionReference || 'N/A'}. ${notes || ''} [Balance deducted at WITHDRAWAL_HOLD stage \u2014 this is an informational disbursement record]`.trim(),
                    }], { session });
                }
            }


            if (status === 'rejected') {
                // Atomically refund balance and clear pending hold
                const vendor = await Vendor.findByIdAndUpdate(
                    withdrawal.vendorId,
                    { $inc: { pendingWithdrawal: -withdrawal.amount, walletBalance: withdrawal.amount } },
                    { new: true, session }
                );

                if (vendor) {
                    // Create WITHDRAWAL_REFUND ledger entry
                    await VendorWalletTransaction.create([{
                        vendorId:            withdrawal.vendorId,
                        type:                'WITHDRAWAL_REFUND',
                        amount:              withdrawal.amount,   // positive = credit back
                        referenceId:         `WITHDRAWAL_REFUND_${withdrawal._id}`,
                        walletBalanceBefore: vendor.walletBalance - withdrawal.amount,
                        walletBalanceAfter:  vendor.walletBalance,
                        performedBy:         { role: 'admin', id: req.user?.id },
                        relatedWithdrawalId: withdrawal._id,
                        notes:               rejectionReason || 'Withdrawal request rejected',
                    }], { session });
                }
            }
        });
    } finally {
        await session.endSession();
    }

    // Notifications (outside transaction)
    const vendor = await Vendor.findById(withdrawal.vendorId).select('_id storeName').lean();
    if (vendor) {
        let notifTitle, notifMsg;
        if (status === 'completed') {
            notifTitle = 'Withdrawal Completed';
            notifMsg   = `Your withdrawal of ₹${withdrawal.amount} has been successfully processed and sent to your bank.`;
        } else if (status === 'rejected') {
            notifTitle = 'Withdrawal Rejected';
            notifMsg   = `Your withdrawal of ₹${withdrawal.amount} was rejected. Funds returned to your wallet.${rejectionReason ? ' Reason: ' + rejectionReason : ''}`;
        } else if (status === 'approved') {
            notifTitle = 'Withdrawal Approved';
            notifMsg   = `Your withdrawal of ₹${withdrawal.amount} is approved and is being processed.`;
        }

        if (notifTitle) {
            await createNotification({
                recipientId:   vendor._id,
                recipientType: 'vendor',
                title:         notifTitle,
                message:       notifMsg,
                type:          'wallet',
                data:          { withdrawalId: String(withdrawal._id), amount: withdrawal.amount },
            }).catch(console.error);
        }
    }

    res.status(200).json(new ApiResponse(200, withdrawal, `Withdrawal status updated to '${status}'.`));
});
