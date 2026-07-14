import mongoose from 'mongoose';

const deliveryWithdrawalSchema = new mongoose.Schema(
    {
        deliveryBoyId: { type: mongoose.Schema.Types.ObjectId, ref: 'DeliveryBoy', required: true, index: true },
        amount: { type: Number, required: true },
        status: {
            type: String,
            enum: ['pending', 'processing', 'completed', 'failed', 'rejected'],
            default: 'pending',
            index: true
        },
        payoutMethodDetails: {
            method: { type: String, required: true },
            bankDetails: Object,
            upiId: String
        },
        rejectionReason: String,
        transactionId: String,
        processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
        processedAt: Date
    },
    { timestamps: true }
);

deliveryWithdrawalSchema.index({ status: 1, createdAt: -1 });
// T4.4: Compound index for withdrawal idempotency check: { deliveryBoyId, status: { $in: ['pending','processing'] } }
deliveryWithdrawalSchema.index({ deliveryBoyId: 1, status: 1 });

const DeliveryWithdrawal = mongoose.model('DeliveryWithdrawal', deliveryWithdrawalSchema);
export default DeliveryWithdrawal;
export { DeliveryWithdrawal };
