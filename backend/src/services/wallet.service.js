import logger from '../utils/logger.js';
import UserWallet from '../models/UserWallet.model.js';
import WalletTransaction from '../models/WalletTransaction.model.js';
import Refund from '../models/Refund.model.js';
import Order from '../models/Order.model.js';
import { createNotification } from './notification.service.js';
import ApiError from '../utils/ApiError.js';

/**
 * Ensures a wallet exists for the user. Creates it if missing.
 */
export const createWalletIfMissing = async (userId, session = null) => {
    let wallet = await UserWallet.findOne({ userId }).session(session);
    if (!wallet) {
        const docs = await UserWallet.create(
            [{
                userId,
                balance: 0,
                rewardPoints: 0,
                cashbackBalance: 0,
                totalCredits: 0,
                totalDebits: 0,
                currency: 'INR',
                status: 'active'
            }],
            { session }
        );
        wallet = docs[0];
    }
    return wallet;
};

/**
 * Fetches a user's wallet.
 */
export const getWallet = async (userId) => {
    return await createWalletIfMissing(userId);
};

/**
 * Credits the user's wallet.
 */
export const creditWallet = async (userId, amount, transactionType, details = {}, session = null) => {
    if (amount <= 0) {
        throw new ApiError(400, 'Credit amount must be greater than zero');
    }

    // 1. Check if reference already exists to prevent duplicate credit
    const { reference, returnRequestId, orderId, description, expiresAt, createdBy, createdByModel, adjustmentReason } = details;
    if (reference) {
        // Check if Wallet transaction with the same reference already exists
        const existingTxn = await WalletTransaction.findOne({ reference }).session(session);
        if (existingTxn) {
            console.warn(`[Wallet Service] Duplicate wallet credit skipped. Reference: ${reference}`);
            return {
                wallet: await UserWallet.findOne({ userId }).session(session),
                transaction: existingTxn
            };
        }

        // Check if Refund with reference already exists and is completed
        const existingRefund = await Refund.findOne({ referenceId: reference }).session(session);
        if (existingRefund && existingRefund.status === 'completed') {
            console.warn(`[Wallet Service] Duplicate credit skipped. Refund already completed for reference: ${reference}`);
            return {
                wallet: await UserWallet.findOne({ userId }).session(session)
            };
        }
    }

    // 2. Validate against already completed Refund records
    if (returnRequestId) {
        const completedRefund = await Refund.findOne({
            returnRequestId,
            status: 'completed'
        }).session(session);
        if (completedRefund) {
            console.warn(`[Wallet Service] Refund already completed in Refund model for Return: ${returnRequestId}`);
            return {
                wallet: await UserWallet.findOne({ userId }).session(session)
            };
        }
    }

    let wallet = await UserWallet.findOne({ userId }).session(session);
    if (!wallet) {
        wallet = await createWalletIfMissing(userId, session);
    }

    const balanceBefore = wallet.balance;
    const balanceAfter = Number((balanceBefore + amount).toFixed(2));

    wallet.balance = balanceAfter;
    wallet.totalCredits = Number((wallet.totalCredits + amount).toFixed(2));
    
    // If transaction is cashback, also add to cashbackBalance
    if (transactionType === 'cashback') {
        wallet.cashbackBalance = Number((wallet.cashbackBalance + amount).toFixed(2));
    }
    
    await wallet.save({ session });

    const [transaction] = await WalletTransaction.create(
        [{
            walletId: wallet._id,
            userId,
            type: 'credit',
            transactionType,
            status: 'completed',
            amount,
            balanceBefore,
            balanceAfter,
            orderId,
            returnRequestId,
            description: description || `Credited ₹${amount} for ${transactionType}`,
            reference,
            expiresAt,
            createdBy,
            createdByModel,
            adjustmentReason,
        }],
        { session }
    );

    // Contextual notification message builder
    let notificationMsg = `₹${amount} has been credited to your wallet.`;
    if (transactionType === 'return_refund' && returnRequestId) {
        notificationMsg = `₹${amount} has been credited to your wallet for Return #${returnRequestId}.`;
    } else if (transactionType === 'cancel_refund') {
        let orderNumber = 'N/A';
        if (orderId) {
            const orderObj = await Order.findById(orderId).session(session).lean();
            if (orderObj) orderNumber = orderObj.orderId;
        }
        notificationMsg = `₹${amount} has been credited to your wallet for cancelled Order #${orderNumber}.`;
    } else if (transactionType === 'exchange_refund') {
        notificationMsg = `₹${amount} has been credited to your wallet for exchange price difference on Return #${returnRequestId || 'N/A'}.`;
    } else if (transactionType === 'reward') {
        notificationMsg = `Reward bonus of ₹${amount} has been added to your wallet.`;
    } else if (transactionType === 'promo_credit') {
        notificationMsg = `₹${amount} promotional credit has been added to your wallet.`;
    } else if (transactionType === 'admin_adjustment') {
        notificationMsg = `₹${amount} manual adjustment has been credited to your wallet: ${description || 'Admin credit'}`;
    }

    createNotification({
        recipientId: userId,
        recipientType: 'user',
        title: 'Wallet Credited',
        message: notificationMsg,
        type: 'payment',
        data: {
            walletId: String(wallet._id),
            transactionId: String(transaction._id),
            amount: String(amount),
            transactionType
        }
    }).catch(err => logger.error('[Wallet Credit Notification Error]', err.message));

    return { wallet, transaction };
};

/**
 * Debits the user's wallet. Capped at zero balance. Blocked if locked.
 */
export const debitWallet = async (userId, amount, transactionType, details = {}, session = null) => {
    if (amount <= 0) {
        throw new ApiError(400, 'Debit amount must be greater than zero');
    }

    let wallet = await UserWallet.findOne({ userId }).session(session);
    if (!wallet) {
        wallet = await createWalletIfMissing(userId, session);
    }

    // 1. Verify wallet is active. Locked wallets block debits/payments
    if (wallet.status === 'locked') {
        throw new ApiError(403, "Your wallet is temporarily locked. Wallet balance cannot be used for purchases at the moment. Any eligible refunds will still be credited to your wallet.");
    }

    // 2. Enforce zero balance floor
    const balanceBefore = wallet.balance;
    if (balanceBefore < amount) {
        throw new ApiError(400, 'Insufficient wallet balance');
    }

    const balanceAfter = Number((balanceBefore - amount).toFixed(2));

    wallet.balance = balanceAfter;
    wallet.totalDebits = Number((wallet.totalDebits + amount).toFixed(2));
    
    // Deduct cashbackBalance first if payment, then remaining from standard balance
    if (transactionType === 'wallet_payment' || transactionType === 'purchase') {
        if (wallet.cashbackBalance > 0) {
            const cashbackDeducted = Math.min(wallet.cashbackBalance, amount);
            wallet.cashbackBalance = Number((wallet.cashbackBalance - cashbackDeducted).toFixed(2));
        }
    }

    await wallet.save({ session });

    const { orderId, returnRequestId, description, reference, createdBy, createdByModel, adjustmentReason } = details;

    const [transaction] = await WalletTransaction.create(
        [{
            walletId: wallet._id,
            userId,
            type: 'debit',
            transactionType,
            status: 'completed',
            amount,
            balanceBefore,
            balanceAfter,
            orderId,
            returnRequestId,
            description: description || `Deducted ₹${amount} for ${transactionType}`,
            reference,
            createdBy,
            createdByModel,
            adjustmentReason,
        }],
        { session }
    );

    let notificationMsg = `₹${amount} has been deducted from your wallet.`;
    if (transactionType === 'wallet_payment' || transactionType === 'purchase') {
        notificationMsg = `₹${amount} has been deducted from your wallet for purchase.`;
    } else if (transactionType === 'admin_adjustment') {
        notificationMsg = `₹${amount} manual adjustment has been debited from your wallet: ${description || 'Admin debit'}`;
    }

    createNotification({
        recipientId: userId,
        recipientType: 'user',
        title: 'Wallet Debited',
        message: notificationMsg,
        type: 'payment',
        data: {
            walletId: String(wallet._id),
            transactionId: String(transaction._id),
            amount: String(amount),
            transactionType
        }
    }).catch(err => logger.error('[Wallet Debit Notification Error]', err.message));

    return { wallet, transaction };
};

/**
 * Returns wallet transactions with optional pagination and filters.
 */
export const getWalletTransactions = async (userId, filters = {}) => {
    const { type, transactionType, startDate, endDate, page = 1, limit = 20 } = filters;
    const query = { userId };
    
    if (type) query.type = type;
    if (transactionType) query.transactionType = transactionType;
    
    if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) query.createdAt.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
    }

    const skip = (page - 1) * limit;
    const transactions = await WalletTransaction.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('orderId', 'orderId total')
        .populate('returnRequestId', 'id status');

    const total = await WalletTransaction.countDocuments(query);
    return { transactions, total };
};

/**
 * Validates balance availability.
 */
export const validateWalletBalance = async (userId, amount) => {
    const wallet = await createWalletIfMissing(userId);
    return wallet.balance >= amount;
};
