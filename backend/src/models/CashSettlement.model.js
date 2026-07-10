import mongoose from 'mongoose';

const cashSettlementSchema = new mongoose.Schema(
    {
        deliveryBoyId: { type: mongoose.Schema.Types.ObjectId, ref: 'DeliveryBoy', required: true, index: true },
        amount: { type: Number, required: true }, // Total settled cash
        collectedByAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
        orders: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Order' }],
        paymentMode: { type: String, enum: ['cash', 'upi', 'bank'], default: 'cash' },
        receiptPhoto: String, // Path or URL to receipt upload/proof photo
        notes: String,
        settledAt: { type: Date, default: Date.now }
    },
    { timestamps: true }
);

const CashSettlement = mongoose.model('CashSettlement', cashSettlementSchema);
export default CashSettlement;
export { CashSettlement };
