import mongoose from 'mongoose';

const commissionSchema = new mongoose.Schema(
    {
        orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
        vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
        vendorName: String,
        subtotal: { type: Number, required: true },
        commissionRate: { type: Number, required: true },
        commission: { type: Number, required: true },
        vendorEarnings: { type: Number, required: true },
        discountShare: { type: Number, default: 0 },
        effectiveSubtotal: { type: Number },
        // Step 12 compliant lifecycle and snapshot fields
        vendorSubtotal: { type: Number, required: true },
        vendorCouponDiscount: { type: Number, default: 0 },
        vendorDiscountedSubtotal: { type: Number },
        vendorTax: { type: Number, default: 0 },
        vendorTotalPaidByCustomer: { type: Number, default: 0 },
        commissionAmount: { type: Number, required: true },
        vendorNetEarnings: { type: Number, required: true },
        escrowAmount: { type: Number, required: true },
        walletCredit: { type: Number, default: 0 },
        escrowStatus: {
            type: String,
            enum: ['held', 'processing', 'released', 'failed', 'refund_processing', 'refunded'],
            default: 'held',
            index: true,
        },
        settlementStatus: {
            type: String,
            enum: ['pending', 'paid', 'cancelled'],
            default: 'pending',
            index: true,
        },
        releasedAt: { type: Date, default: null },
        escrowReleaseDate: { type: Date, default: null },
        couponId: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon' },
        couponCode: { type: String },
        couponType: { type: String, enum: ["fixed", "percentage"] },
        couponValue: { type: Number },
        status: {
            type: String,
            enum: ['pending', 'paid', 'cancelled'],
            default: 'pending',
            index: true,
        },
        paidAt: Date,
        settlementId: { type: mongoose.Schema.Types.ObjectId, ref: 'Settlement' },
        legacyFinancialSnapshot: { type: Boolean, default: false },
    },
    { timestamps: true }
);

const Commission = mongoose.model('Commission', commissionSchema);
export default Commission;
