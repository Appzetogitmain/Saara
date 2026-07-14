import mongoose from 'mongoose';

const walletTransactionSchema = new mongoose.Schema(
    {
        walletId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'UserWallet',
            required: true,
            index: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        type: {
            type: String,
            enum: ['credit', 'debit'],
            required: true,
        },
        transactionType: {
            type: String,
            enum: [
                'return_refund',
                'cancel_refund',
                'exchange_refund',
                'reward',
                'promo_credit',
                'wallet_payment',
                'admin_adjustment',
                'reversal',
            ],
            required: true,
        },
        status: {
            type: String,
            enum: ['pending', 'completed', 'failed', 'reversed'],
            default: 'completed',
            required: true,
        },
        amount: {
            type: Number,
            required: true,
        },
        balanceBefore: {
            type: Number,
            required: true,
        },
        balanceAfter: {
            type: Number,
            required: true,
        },
        orderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Order',
            index: true,
        },
        returnRequestId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'ReturnRequest',
            index: true,
        },
        description: {
            type: String,
            required: true,
        },
        reference: {
            type: String,
            unique: true,
            sparse: true,
            index: true,
        },
        expiresAt: {
            type: Date,
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            refPath: 'createdByModel',
        },
        createdByModel: {
            type: String,
            enum: ['User', 'Admin'],
        },
        adjustmentReason: {
            type: String,
            enum: [
                'Compensation',
                'Promotional Credit',
                'Refund Correction',
                'Fraud Recovery',
                'Manual Refund',
                'Other',
            ],
        },
    },
    { timestamps: true }
);

const WalletTransaction = mongoose.model('WalletTransaction', walletTransactionSchema);
export { WalletTransaction };
export default WalletTransaction;
