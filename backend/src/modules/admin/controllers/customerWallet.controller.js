import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import UserWallet from '../../../models/UserWallet.model.js';
import WalletTransaction from '../../../models/WalletTransaction.model.js';
import User from '../../../models/User.model.js';
import { getWallet, creditWallet, debitWallet, getWalletTransactions } from '../../../services/wallet.service.js';

/**
 * @desc    Credit user's wallet manually by admin
 * @route   POST /api/admin/wallet/admin-credit
 * @access  Private (Admin)
 */
export const adminCreditWallet = asyncHandler(async (req, res) => {
    const { userId, amount, description, reason } = req.body;
    const adminId = req.user.id;

    if (!userId || !amount) {
        throw new ApiError(400, 'User ID and credit amount are required');
    }

    const customer = await User.findOne({ _id: userId, role: 'customer' });
    if (!customer) {
        throw new ApiError(404, 'Customer not found');
    }

    const validReasons = [
        'Compensation',
        'Promotional Credit',
        'Refund Correction',
        'Fraud Recovery',
        'Manual Refund',
        'Other'
    ];
    if (!reason || !validReasons.includes(reason)) {
        throw new ApiError(400, `A valid adjustment reason category is required. Choose from: ${validReasons.join(', ')}`);
    }

    const remark = String(description || '').trim();
    if (!remark || remark.length < 10) {
        throw new ApiError(400, 'A detailed remark of at least 10 characters is required for manual adjustments');
    }

    const result = await creditWallet(userId, Number(amount), 'admin_adjustment', {
        description: remark,
        createdBy: adminId,
        createdByModel: 'Admin',
        adjustmentReason: reason,
        reference: `ADMIN_CREDIT_${Date.now()}_${Math.floor(Math.random() * 1000)}`
    });

    res.status(200).json(new ApiResponse(200, result, 'Wallet manually credited successfully'));
});

/**
 * @desc    Debit user's wallet manually by admin
 * @route   POST /api/admin/wallet/admin-debit
 * @access  Private (Admin)
 */
export const adminDebitWallet = asyncHandler(async (req, res) => {
    const { userId, amount, description, reason } = req.body;
    const adminId = req.user.id;

    if (!userId || !amount) {
        throw new ApiError(400, 'User ID and debit amount are required');
    }

    const customer = await User.findOne({ _id: userId, role: 'customer' });
    if (!customer) {
        throw new ApiError(404, 'Customer not found');
    }

    const validReasons = [
        'Compensation',
        'Promotional Credit',
        'Refund Correction',
        'Fraud Recovery',
        'Manual Refund',
        'Other'
    ];
    if (!reason || !validReasons.includes(reason)) {
        throw new ApiError(400, `A valid adjustment reason category is required. Choose from: ${validReasons.join(', ')}`);
    }

    const remark = String(description || '').trim();
    if (!remark || remark.length < 10) {
        throw new ApiError(400, 'A detailed remark of at least 10 characters is required for manual adjustments');
    }

    const wallet = await getWallet(userId);
    if (wallet.balance < Number(amount)) {
        throw new ApiError(400, `Cannot debit. User wallet balance is ₹${wallet.balance}, which is less than the requested debit amount ₹${amount}`);
    }

    const result = await debitWallet(userId, Number(amount), 'admin_adjustment', {
        description: remark,
        createdBy: adminId,
        createdByModel: 'Admin',
        adjustmentReason: reason,
        reference: `ADMIN_DEBIT_${Date.now()}_${Math.floor(Math.random() * 1000)}`
    });

    res.status(200).json(new ApiResponse(200, result, 'Wallet manually debited successfully'));
});

/**
 * @desc    Get any customer's wallet (Admin view)
 * @route   GET /api/admin/customers/:id/wallet
 * @access  Private (Admin)
 */
export const getAnyCustomerWallet = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const customer = await User.findOne({ _id: id, role: 'customer' });
    if (!customer) {
        throw new ApiError(404, 'Customer not found');
    }

    const wallet = await getWallet(id);
    res.status(200).json(new ApiResponse(200, wallet, 'Customer wallet details fetched successfully'));
});

/**
 * @desc    Get any customer's wallet transactions (Admin view)
 * @route   GET /api/admin/customers/:id/wallet/transactions
 * @access  Private (Admin)
 */
export const getAnyCustomerWalletTransactions = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const customer = await User.findOne({ _id: id, role: 'customer' });
    if (!customer) {
        throw new ApiError(404, 'Customer not found');
    }

    const { type, transactionType, startDate, endDate, page = 1, limit = 20 } = req.query;
    const filters = {
        type,
        transactionType,
        startDate,
        endDate,
        page: parseInt(page, 10) || 1,
        limit: parseInt(limit, 10) || 20,
    };

    const data = await getWalletTransactions(id, filters);
    res.status(200).json(new ApiResponse(200, data, 'Customer wallet transactions fetched successfully'));
});

/**
 * @desc    Get administrative wallet summary reporting metrics
 * @route   GET /api/admin/wallet/summary
 * @access  Private (Admin)
 */
export const getAdminWalletSummary = asyncHandler(async (req, res) => {
    // 1. Total Wallet Balance
    const [totalBalanceGroup] = await UserWallet.aggregate([
        { $group: { _id: null, total: { $sum: '$balance' } } }
    ]);
    
    // 2. Locked Wallets Count
    const lockedWalletsCount = await UserWallet.countDocuments({ status: 'locked' });

    // 3. Total Refunds Credited
    const [refundCreditsGroup] = await WalletTransaction.aggregate([
        { 
            $match: { 
                type: 'credit', 
                transactionType: { $in: ['return_refund', 'cancel_refund', 'exchange_refund'] },
                status: 'completed'
            } 
        },
        { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    // 4. Total Wallet Payments
    const [walletPaymentsGroup] = await WalletTransaction.aggregate([
        { 
            $match: { 
                type: 'debit', 
                transactionType: 'wallet_payment',
                status: 'completed'
            } 
        },
        { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    // 5. Total Manual Credits
    const [manualCreditsGroup] = await WalletTransaction.aggregate([
        { 
            $match: { 
                type: 'credit', 
                transactionType: 'admin_adjustment',
                status: 'completed'
            } 
        },
        { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    // 6. Total Manual Debits
    const [manualDebitsGroup] = await WalletTransaction.aggregate([
        { 
            $match: { 
                type: 'debit', 
                transactionType: 'admin_adjustment',
                status: 'completed'
            } 
        },
        { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    res.status(200).json(
        new ApiResponse(200, {
            totalWalletBalance: totalBalanceGroup?.total || 0,
            lockedWalletsCount,
            totalRefundCredits: refundCreditsGroup?.total || 0,
            totalWalletPayments: walletPaymentsGroup?.total || 0,
            totalManualCredits: manualCreditsGroup?.total || 0,
            totalManualDebits: manualDebitsGroup?.total || 0
        }, 'Wallet summary metrics fetched successfully')
    );
});

/**
 * @desc    Toggle lock/unlock status of a customer's wallet
 * @route   PATCH /api/admin/customers/:id/wallet/toggle-lock
 * @access  Private (Admin)
 */
export const toggleLockCustomerWallet = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const customer = await User.findOne({ _id: id, role: 'customer' });
    if (!customer) {
        throw new ApiError(404, 'Customer not found');
    }

    const wallet = await getWallet(id);
    wallet.isLocked = !wallet.isLocked;
    await wallet.save();

    res.status(200).json(new ApiResponse(200, wallet, `Wallet successfully ${wallet.isLocked ? 'locked' : 'unlocked'}`));
});
