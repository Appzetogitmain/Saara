import UserWallet from '../models/UserWallet.model.js';
import WalletTransaction from '../models/WalletTransaction.model.js';
import { debitWallet } from '../services/wallet.service.js';
import mongoose from 'mongoose';

/**
 * Background scanner that identifies expired promotional credits and debits them from active user wallets.
 */
export const expirePromotionalBalances = async () => {
    console.log('[WALLET_CRON] Scanning for expired promotional balances...');
    const now = new Date();

    try {
        // Find completed promo_credit transactions that have expired and are not already reversed
        const expiredCredits = await WalletTransaction.find({
            type: 'credit',
            transactionType: 'promo_credit',
            expiresAt: { $lt: now },
            status: 'completed'
        }).lean();

        for (const creditTxn of expiredCredits) {
            const referenceKey = `PROMO_EXPIRY_${creditTxn._id}`;
            const session = await mongoose.startSession();
            
            try {
                await session.withTransaction(async () => {
                    // Check if already reversed
                    const alreadyReversed = await WalletTransaction.findOne({
                        reference: referenceKey
                    }).session(session);

                    if (alreadyReversed) return;

                    const wallet = await UserWallet.findOne({ userId: creditTxn.userId }).session(session);
                    if (!wallet || wallet.balance <= 0) {
                        // Mark as reversed since no balance is left to expire
                        await WalletTransaction.findByIdAndUpdate(creditTxn._id, { status: 'reversed' }, { session });
                        return;
                    }

                    // Expire amount: cap at current available balance
                    const amountToExpire = Math.min(wallet.balance, creditTxn.amount);
                    
                    if (amountToExpire > 0) {
                        await debitWallet(
                            creditTxn.userId,
                            amountToExpire,
                            'reversal',
                            {
                                description: `Expired promotional balance from transaction #${creditTxn._id}`,
                                reference: referenceKey
                            },
                            session
                        );
                    }

                    // Update original transaction status to reversed
                    await WalletTransaction.findByIdAndUpdate(creditTxn._id, { status: 'reversed' }, { session });
                    console.log(`[WALLET_CRON] Expired ₹${amountToExpire} promo balance for user: ${creditTxn.userId}`);
                });
            } catch (txnErr) {
                console.error(`[WALLET_CRON] Transaction failed for txn: ${creditTxn._id}`, txnErr.message);
            } finally {
                await session.endSession();
            }
        }
    } catch (err) {
        console.error('[WALLET_CRON] Scan failed:', err.message);
    }
};
