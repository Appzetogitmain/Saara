import mongoose from 'mongoose';

const withdrawalSchema = new mongoose.Schema(
    {
        vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
        amount: { type: Number, required: true },
        status: {
            type: String,
            enum: ['pending', 'approved', 'processing', 'completed', 'failed', 'rejected'],
            default: 'pending',
            index: true,
        },
        bankDetails: {
            accountHolder: String,
            accountNumber: String,
            ifsc: String,
            bankName: String
        },
        requestedAt: { type: Date, default: Date.now },
        processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
        processedAt: { type: Date },
        rejectionReason: { type: String },
        transactionReference: { type: String }, // bank/UPI transfer reference from admin
        notes: { type: String },
    },
    { timestamps: true }
);

const Withdrawal = mongoose.model('Withdrawal', withdrawalSchema);
export { Withdrawal };
export default Withdrawal;
