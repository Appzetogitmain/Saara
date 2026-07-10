import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import DeliveryBoy from '../../../models/DeliveryBoy.model.js';
import DeliveryWithdrawal from '../../../models/DeliveryWithdrawal.model.js';
import DeliveryWalletTransaction from '../../../models/DeliveryWalletTransaction.model.js';
import mongoose from 'mongoose';

/**
 * @desc    List all driver withdrawal requests
 * @route   GET /api/admin/delivery/payout-requests
 * @access  Private (Admin)
 */
export const getWithdrawalRequests = asyncHandler(async (req, res) => {
    const { status, page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const filter = {};
    if (status) {
        filter.status = status;
    }

    const list = await DeliveryWithdrawal.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate('deliveryBoyId', 'name email phone walletBalance cashInHand');

    const total = await DeliveryWithdrawal.countDocuments(filter);

    res.status(200).json(
        new ApiResponse(200, {
            requests: list,
            currentPage: Number(page),
            totalPages: Math.ceil(total / limit),
            totalCount: total
        }, 'Withdrawal requests retrieved successfully.')
    );
});

/**
 * @desc    Process/Approve/Reject a withdrawal request
 * @route   PATCH /api/admin/delivery/payout-requests/:id/status
 * @access  Private (Admin)
 */
export const updateWithdrawalStatus = asyncHandler(async (req, res) => {
    const { action, transactionId, rejectionReason } = req.body;
    const { id } = req.params;

    if (!['approve', 'reject', 'process', 'fail'].includes(action)) {
        throw new ApiError(400, 'Invalid action. Action must be "process", "approve", "reject", or "fail".');
    }

    if (action === 'approve' && !transactionId) {
        throw new ApiError(400, 'Transaction reference ID is required to approve a payout.');
    }

    if (action === 'reject' && !rejectionReason) {
        throw new ApiError(400, 'Rejection reason is required to reject a payout.');
    }

    // 1. If transitioning to processing (locking the state)
    if (action === 'process') {
        const withdrawal = await DeliveryWithdrawal.findOneAndUpdate(
            { _id: id, status: 'pending' },
            { $set: { status: 'processing' } },
            { new: true }
        );
        if (!withdrawal) {
            throw new ApiError(400, 'Withdrawal request is not pending or already processed.');
        }
        return res.status(200).json(new ApiResponse(200, withdrawal, 'Withdrawal request marked as processing.'));
    }

    // 2. If approving (completed)
    if (action === 'approve') {
        // Approve can transition from either 'pending' or 'processing'
        const withdrawal = await DeliveryWithdrawal.findOneAndUpdate(
            { _id: id, status: { $in: ['pending', 'processing'] } },
            {
                $set: {
                    status: 'completed',
                    transactionId,
                    processedBy: req.user.id,
                    processedAt: new Date()
                }
            },
            { new: true }
        );
        if (!withdrawal) {
            throw new ApiError(400, 'Withdrawal request is already processed or invalid.');
        }
        return res.status(200).json(new ApiResponse(200, withdrawal, 'Withdrawal request approved successfully.'));
    }

    // 3. If rejecting or failing (refunding)
    const session = await mongoose.startSession();
    let withdrawalResult = null;

    try {
        await session.withTransaction(async () => {
            const statusTarget = action === 'reject' ? 'rejected' : 'failed';

            // Atomic lock check to prevent double refund
            const withdrawal = await DeliveryWithdrawal.findOneAndUpdate(
                { _id: id, status: { $in: ['pending', 'processing'] } },
                {
                    $set: {
                        status: statusTarget,
                        rejectionReason: rejectionReason || `Payout ${statusTarget} by admin`,
                        processedBy: req.user.id,
                        processedAt: new Date()
                    }
                },
                { session, new: true }
            );

            if (!withdrawal) {
                throw new Error('Withdrawal request is already processed or invalid.');
            }

            withdrawalResult = withdrawal;

            // Refund rider walletBalance
            const boy = await DeliveryBoy.findById(withdrawal.deliveryBoyId).session(session);
            if (!boy) throw new Error('Driver profile not found.');

            const walletBefore = boy.walletBalance;
            const cashBefore = boy.cashInHand;

            boy.walletBalance = parseFloat((boy.walletBalance + withdrawal.amount).toFixed(2));
            await boy.save({ session });

            // Create ledger entry
            await DeliveryWalletTransaction.create(
                [{
                    deliveryBoyId: withdrawal.deliveryBoyId,
                    type: 'WITHDRAWAL_REFUND',
                    amount: withdrawal.amount,
                    referenceId: `WITHDRAWAL_REFUND_${withdrawal._id}`,
                    performedBy: { role: 'admin', id: req.user.id },
                    walletBalanceBefore: walletBefore,
                    walletBalanceAfter: boy.walletBalance,
                    cashInHandBefore: cashBefore,
                    cashInHandAfter: boy.cashInHand,
                    notes: `Refunded ₹${withdrawal.amount} due to ${statusTarget} payout request #${withdrawal._id}. Reason: ${withdrawal.rejectionReason}`
                }],
                { session }
            );
        });
    } catch (err) {
        throw new ApiError(400, err.message);
    } finally {
        await session.endSession();
    }

    res.status(200).json(new ApiResponse(200, withdrawalResult, `Withdrawal request successfully marked as ${action === 'reject' ? 'rejected' : 'failed'} and refunded.`));
});

/**
 * @desc    Perform manual adjustment on a delivery boy's wallet (penalty/bonus)
 * @route   POST /api/admin/delivery-boys/:id/adjustment
 * @access  Private (Admin)
 */
export const adjustWalletBalance = asyncHandler(async (req, res) => {
    const { amount, type, notes } = req.body;
    const adjAmount = parseFloat(Number(amount).toFixed(2));

    if (isNaN(adjAmount) || adjAmount <= 0) {
        throw new ApiError(400, 'Please enter a valid amount.');
    }

    if (!type || !['bonus', 'penalty'].includes(type)) {
        throw new ApiError(400, 'Adjustment type must be either "bonus" or "penalty".');
    }

    if (!notes || notes.trim().length === 0) {
        throw new ApiError(400, 'Reconciliation notes/reason is required for audits.');
    }

    const valueChange = type === 'bonus' ? adjAmount : -adjAmount;

    const session = await mongoose.startSession();
    let updatedBoy = null;

    try {
        await session.withTransaction(async () => {
            const boy = await DeliveryBoy.findById(req.params.id).session(session);
            if (!boy) throw new Error('Delivery boy not found.');

            const walletBefore = boy.walletBalance;
            const cashBefore = boy.cashInHand;

            boy.walletBalance = parseFloat((boy.walletBalance + valueChange).toFixed(2));
            await boy.save({ session });

            updatedBoy = boy;

            // Log ledger adjustment
            const randHex = crypto.randomBytes(4).toString('hex');
            await DeliveryWalletTransaction.create(
                [{
                    deliveryBoyId: req.params.id,
                    type: 'ADJUSTMENT',
                    amount: valueChange,
                    referenceId: `ADJUSTMENT_${req.params.id}_${Date.now()}_${randHex}`,
                    performedBy: { role: 'admin', id: req.user.id },
                    walletBalanceBefore: walletBefore,
                    walletBalanceAfter: boy.walletBalance,
                    cashInHandBefore: cashBefore,
                    cashInHandAfter: boy.cashInHand,
                    notes: `Admin adjustment (${type}): ${notes}`
                }],
                { session }
            );
        });
    } catch (err) {
        throw new ApiError(400, err.message);
    } finally {
        await session.endSession();
    }

    res.status(200).json(
        new ApiResponse(
            200,
            {
                earningsBalance: updatedBoy.walletBalance,
                codLiability: updatedBoy.cashInHand,
                availableWithdrawal: updatedBoy.walletBalance - updatedBoy.cashInHand
            },
            `Successfully posted ${type} adjustment of ₹${adjAmount}.`
        )
    );
});
