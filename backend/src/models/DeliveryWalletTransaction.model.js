import mongoose from 'mongoose';

const deliveryWalletTransactionSchema = new mongoose.Schema(
    {
        deliveryBoyId: { type: mongoose.Schema.Types.ObjectId, ref: 'DeliveryBoy', required: true, index: true },
        type: {
            type: String,
            enum: ['DELIVERY_EARNING', 'COD_COLLECTION', 'COD_SETTLEMENT', 'WITHDRAWAL', 'WITHDRAWAL_REFUND', 'ADJUSTMENT'],
            required: true
        },
        amount: { type: Number, required: true },
        referenceId: { type: String, required: true, unique: true }, // Unique constraint for idempotency
        performedBy: {
            id: { type: mongoose.Schema.Types.ObjectId },
            role: { type: String, enum: ['system', 'admin', 'delivery_boy'], required: true }
        },
        orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
        settlementId: { type: mongoose.Schema.Types.ObjectId, ref: 'CashSettlement' },
        walletBalanceBefore: { type: Number, required: true },
        walletBalanceAfter: { type: Number, required: true },
        cashInHandBefore: { type: Number, required: true },
        cashInHandAfter: { type: Number, required: true },
        notes: String
    },
    { timestamps: true }
);

deliveryWalletTransactionSchema.index({ deliveryBoyId: 1, createdAt: -1 });

const DeliveryWalletTransaction = mongoose.model('DeliveryWalletTransaction', deliveryWalletTransactionSchema);
export default DeliveryWalletTransaction;
export { DeliveryWalletTransaction };
