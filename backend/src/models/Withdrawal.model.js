import mongoose from 'mongoose';

const withdrawalSchema = new mongoose.Schema(
    {
        vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
        amount: { type: Number, required: true },
        status: {
            type: String,
            enum: ["pending", "approved", "processing", "completed", "rejected"],
            default: "pending",
            index: true
        },
        bankDetails: {
            accountHolder: String,
            accountNumber: String,
            ifsc: String,
            bankName: String
        },
        requestedAt: { type: Date, default: Date.now },
        processedAt: Date
    },
    { timestamps: true }
);

const Withdrawal = mongoose.model('Withdrawal', withdrawalSchema);
export { Withdrawal };
export default Withdrawal;
