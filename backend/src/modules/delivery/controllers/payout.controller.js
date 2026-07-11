import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import DeliveryBoy from '../../../models/DeliveryBoy.model.js';
import DeliveryWithdrawal from '../../../models/DeliveryWithdrawal.model.js';
import DeliveryWalletTransaction from '../../../models/DeliveryWalletTransaction.model.js';
import mongoose from 'mongoose';

/**
 * @desc    Get delivery boy wallet summary
 * @route   GET /api/delivery/wallet/summary
 * @access  Private (Delivery Boy)
 */
export const getWalletSummary = asyncHandler(async (req, res) => {
    const boy = await DeliveryBoy.findById(req.user.id).select('+payoutMethodDetails');
    if (!boy) throw new ApiError(404, 'Driver profile not found.');

    const earningsBalance = parseFloat((boy.walletBalance || 0).toFixed(2));
    const codLiability = parseFloat((boy.cashInHand || 0).toFixed(2));
    const availableWithdrawal = parseFloat((earningsBalance - codLiability).toFixed(2));

    res.status(200).json(
        new ApiResponse(200, {
            earningsBalance,
            codLiability,
            availableWithdrawal,
            payoutMethodDetails: boy.payoutMethodDetails || null
        }, 'Wallet summary retrieved successfully.')
    );
});

/**
 * @desc    Request withdrawal of earnings
 * @route   POST /api/delivery/wallet/withdraw
 * @access  Private (Delivery Boy)
 */
export const requestWithdrawal = asyncHandler(async (req, res) => {
    const { amount } = req.body;
    const reqAmount = parseFloat(Number(amount).toFixed(2));

    if (isNaN(reqAmount) || reqAmount <= 0) {
        throw new ApiError(400, 'Please enter a valid amount.');
    }

    const MIN_WITHDRAWAL = 100;
    if (reqAmount < MIN_WITHDRAWAL) {
        throw new ApiError(400, `Minimum withdrawal amount is ₹${MIN_WITHDRAWAL}.`);
    }

    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            const boy = await DeliveryBoy.findById(req.user.id).select('+payoutMethodDetails').session(session);
            if (!boy) throw new ApiError(404, 'Driver profile not found.');

            if (!boy.payoutMethodDetails || (!boy.payoutMethodDetails.upiId && !boy.payoutMethodDetails.bankDetails?.accountNumber)) {
                throw new ApiError(400, 'Please set up your bank account or UPI ID details first before requesting withdrawal.');
            }

            const available = parseFloat((boy.walletBalance - boy.cashInHand).toFixed(2));
            if (reqAmount > available) {
                throw new ApiError(
                    400,
                    `Dues check failed. Available: ₹${available} (Wallet: ₹${boy.walletBalance}, Cash: ₹${boy.cashInHand}). Please clear your COD dues first.`
                );
            }

            const walletBefore = boy.walletBalance;
            const cashBefore = boy.cashInHand;

            // Update balance
            boy.walletBalance = parseFloat((boy.walletBalance - reqAmount).toFixed(2));
            await boy.save({ session });

            // Create withdrawal request
            const [withdrawal] = await DeliveryWithdrawal.create(
                [{
                    deliveryBoyId: req.user.id,
                    amount: reqAmount,
                    payoutMethodDetails: boy.payoutMethodDetails
                }],
                { session }
            );

            // Log ledger transaction
            await DeliveryWalletTransaction.create(
                [{
                    deliveryBoyId: req.user.id,
                    type: 'WITHDRAWAL',
                    amount: -reqAmount,
                    referenceId: `WITHDRAWAL_REQUEST_${withdrawal._id}`,
                    performedBy: { role: 'delivery_boy', id: req.user.id },
                    walletBalanceBefore: walletBefore,
                    walletBalanceAfter: boy.walletBalance,
                    cashInHandBefore: cashBefore,
                    cashInHandAfter: boy.cashInHand,
                    notes: `Withdrawal request of ₹${reqAmount} submitted (Ref: #${withdrawal._id})`
                }],
                { session }
            );
        });
    } finally {
        await session.endSession();
    }

    res.status(200).json(new ApiResponse(200, null, 'Withdrawal request submitted successfully.'));
});

/**
 * @desc    Set or update payout method details
 * @route   PUT /api/delivery/wallet/payout-settings
 * @access  Private (Delivery Boy)
 */
export const updatePayoutSettings = asyncHandler(async (req, res) => {
    const { method, bankDetails, upiId } = req.body;

    if (!method || !['bank', 'upi'].includes(method)) {
        throw new ApiError(400, 'Payout method must be either "bank" or "upi".');
    }

    if (method === 'upi' && !upiId) {
        throw new ApiError(400, 'UPI ID is required for UPI payout method.');
    }

    if (method === 'bank') {
        if (!bankDetails || !bankDetails.accountHolder || !bankDetails.accountNumber || !bankDetails.ifsc || !bankDetails.bankName) {
            throw new ApiError(400, 'All bank details (holder, account number, IFSC, bank name) are required.');
        }
    }

    const payoutMethodDetails = {
        method,
        upiId: method === 'upi' ? upiId : undefined,
        bankDetails: method === 'bank' ? bankDetails : undefined
    };

    const boy = await DeliveryBoy.findByIdAndUpdate(
        req.user.id,
        { $set: { payoutMethodDetails } },
        { new: true }
    ).select('+payoutMethodDetails');

    res.status(200).json(new ApiResponse(200, boy.payoutMethodDetails, 'Payout details updated successfully.'));
});

/**
 * @desc    Get ledger transactions list for current driver
 * @route   GET /api/delivery/wallet/transactions
 * @access  Private (Delivery Boy)
 */
export const getWalletTransactions = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const list = await DeliveryWalletTransaction.find({ deliveryBoyId: req.user.id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate('orderId', 'orderId total paymentMethod');

    const total = await DeliveryWalletTransaction.countDocuments({ deliveryBoyId: req.user.id });

    res.status(200).json(
        new ApiResponse(200, {
            transactions: list,
            currentPage: Number(page),
            totalPages: Math.ceil(total / limit),
            totalCount: total
        }, 'Wallet transactions retrieved successfully.')
    );
});
