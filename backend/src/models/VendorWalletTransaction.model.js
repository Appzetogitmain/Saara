import mongoose from 'mongoose';

const vendorWalletTransactionSchema = new mongoose.Schema(
    {
        vendorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Vendor',
            required: true,
            index: true,
        },
        type: {
            type: String,
            enum: [
                'ESCROW_RELEASE',    // Order payout credited from cron after delivery confirmation
                'WITHDRAWAL_HOLD',   // Balance locked on withdrawal request
                'WITHDRAWAL_REFUND', // Balance returned on withdrawal rejection
                'ADJUSTMENT',        // Admin manual bonus or penalty
                'RETURN_CLAWBACK',   // Deducted when vendor already paid and return approved
            ],
            required: true,
            index: true,
        },
        amount: {
            type: Number,
            required: true, // positive = credit, negative = debit
        },
        referenceId: {
            type: String,
            unique: true,
            sparse: true, // allows null, but unique when set
            index: true,
        },
        notes: {
            type: String,
        },
        walletBalanceBefore: {
            type: Number,
            required: true,
        },
        walletBalanceAfter: {
            type: Number,
            required: true, // may be negative (allowed for clawbacks)
        },
        performedBy: {
            role: { type: String }, // 'vendor', 'admin', 'system'
            id:   { type: mongoose.Schema.Types.ObjectId },
        },
        relatedOrderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Order',
        },
        relatedWithdrawalId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Withdrawal',
        },
        relatedRefundId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Refund',
        },
    },
    { timestamps: true }
);

vendorWalletTransactionSchema.index({ vendorId: 1, createdAt: -1 });
vendorWalletTransactionSchema.index({ vendorId: 1, type: 1 });

const VendorWalletTransaction = mongoose.model('VendorWalletTransaction', vendorWalletTransactionSchema);
export default VendorWalletTransaction;
