import mongoose from 'mongoose';
import crypto from 'crypto';

const orderItemSchema = new mongoose.Schema({
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', index: true },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', index: true },
    name: String,
    image: String,
    price: Number,
    quantity: Number,
    variant: { type: mongoose.Schema.Types.Mixed, default: {} },
    variantKey: String,
    // --- FINANCIAL SNAPSHOT FIELDS ---
    taxRate: { type: Number },
    taxIncluded: { type: Boolean },
    lineSubtotal: { type: Number },
    couponDiscount: { type: Number },
    discountedSubtotal: { type: Number },
    baseAmount: { type: Number },
    taxAmount: { type: Number },
    shippingCharge: { type: Number },
    shippingTax: { type: Number },
    commissionRate: { type: Number },
    commissionAmount: { type: Number },
    vendorEarnings: { type: Number },
    platformCommission: { type: Number },
    finalLineTotal: { type: Number }
});

const vendorItemGroupSchema = new mongoose.Schema({
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
    vendorName: String,
    items: [orderItemSchema],
    subtotal: Number,
    shipping: Number,
    tax: Number,
    discount: Number,
    status: {
        type: String,
        enum: ['pending', 'processing', 'ready_for_pickup', 'shipped', 'delivered', 'cancelled'],
        default: 'pending',
    },
    // 5.1: per-vendor escrow status for multi-vendor order split tracking
    escrowStatus: {
        type: String,
        enum: ['held', 'processing', 'release_pending', 'partially_released', 'released', 'refunded', 'cancelled'],
        default: 'held',
    },
    commissionRate: { type: Number, default: 0 },
    commissionAmount: { type: Number, default: 0 },
    vendorEarnings: { type: Number, default: 0 },
    isOnHoldBalanceAdded: { type: Boolean, default: false }
});


const orderSchema = new mongoose.Schema(
    {
        orderId: { type: String, required: true, unique: true, index: true },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, default: null },
        guestInfo: { name: String, email: String, phone: String },
        items: [orderItemSchema],
        vendorItems: [vendorItemGroupSchema],
        shippingAddress: {
            name: String,
            email: String,
            phone: String,
            address: String,
            city: String,
            state: String,
            zipCode: String,
            country: String,
        },
        paymentMethod: { type: String, enum: ['card', 'cash', 'bank', 'wallet', 'upi', 'cod'] },
        paymentStatus: {
            type: String,
            enum: ['pending', 'paid', 'failed', 'refund_queued', 'refunded', 'partially_refunded'],
            default: 'pending',
        },
        status: {
            type: String,
            enum: [
                'payment_pending',   // online order created, awaiting payment confirmation
                'payment_failed',    // payment failed or stock exhausted after payment
                'pending',           // COD order awaiting delivery assignment
                'processing',
                'ready_for_pickup',
                'shipped',
                'delivered',
                'cancelled',
                'returned',
            ],
            default: 'pending',
            index: true,
        },
        subtotal: { type: Number, default: 0 },
        shipping: { type: Number, default: 0 },
        tax: { type: Number, default: 0 },
        discount: { type: Number, default: 0 },
        total: { type: Number, default: 0 },
        couponId: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon' }, // stored for webhook-time coupon increment
        couponCode: { type: String },
        couponDiscount: { type: Number, default: 0 },
        discountedSubtotal: { type: Number, default: 0 },
        taxableAmount: { type: Number, default: 0 },
        commissionAmount: { type: Number, default: 0 },
        vendorEarnings: { type: Number, default: 0 },
        escrowAmount: { type: Number, default: 0 },
        settlementAmount: { type: Number, default: 0 },
        platformRevenue: { type: Number, default: 0 },
        invoiceNumber: { type: String, unique: true, sparse: true },
        invoiceDate: { type: Date },
        idempotencyKey: { type: String, sparse: true },
        idempotencyScope: { type: String, sparse: true },
        trackingNumber: { type: String, unique: true, sparse: true },
        deliveryBoyId: { type: mongoose.Schema.Types.ObjectId, ref: 'DeliveryBoy', index: true },
        deliveryAssignmentStatus: {
            type: String,
            enum: ['pending', 'assigned', 'accepted', 'manual_override', 'failed'],
            default: 'pending',
            index: true,
        },
        rejectedDeliveryBoys: [{ type: mongoose.Schema.Types.ObjectId, ref: 'DeliveryBoy' }],
        deliveryOtpHash: { type: String, select: false },
        deliveryOtpExpiry: { type: Date, select: false },
        deliveryOtpSentAt: { type: Date, select: false },
        deliveryOtpDebug: { type: String, select: false },
        deliveryOtpVerifiedAt: Date,
        deliveryOtpAttempts: { type: Number, default: 0, select: false },
        pickupOtpHash: { type: String, select: false },
        pickupOtpExpiry: { type: Date, select: false },
        pickupOtpSentAt: { type: Date, select: false },
        pickupOtpDebug: { type: String, select: false },
        estimatedDelivery: Date,
        processingAt: Date,
        readyForPickupAt: Date,
        shippedAt: Date,
        deliveredAt: Date,
        isCashSettled: { type: Boolean, default: false },
        settledAt: Date,
        cancelledAt: Date,
        cancellationReason: String,
        isDeleted: { type: Boolean, default: false, index: true },
        legacyFinancialSnapshot: { type: Boolean, default: false },
        deletedAt: Date,
        deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
        deliveryPriority: { type: Number, default: 0, index: true },
        deliverySequence: { type: Number, default: 0 },
        escrowStatus: {
            type: String,
            enum: ["held", "processing", "release_pending", "partially_released", "released", "refund_processing", "refunded"],
            default: "held"
        },
        escrowReleaseDate: { type: Date, default: null },
        refundMethod: {
            type: String,
            enum: ["bank", "upi"]
        },
        walletAmountUsed: { type: Number, default: 0 },
        bankDetails: {
            accountHolder: String,
            accountNumber: String,
            ifsc: String,
            bankName: String
        },
        upiId: String,
        distance: { type: Number, default: 0 },
        deliveryPayoutProcessed: { type: Boolean, default: false, index: true },
        deliveryPayoutProcessedAt: Date,
        cashSettlementId: { type: mongoose.Schema.Types.ObjectId, ref: 'CashSettlement' },
    },
    { timestamps: true }
);

// Prevent duplicate order creation for the same retry key per actor (user/guest).
orderSchema.index(
    { idempotencyScope: 1, idempotencyKey: 1 },
    {
        unique: true,
        sparse: true,
        partialFilterExpression: {
            idempotencyScope: { $exists: true, $type: 'string' },
            idempotencyKey: { $exists: true, $type: 'string' },
        },
    }
);

orderSchema.index({ isDeleted: 1, createdAt: -1 });
orderSchema.index({ isDeleted: 1, status: 1, createdAt: -1 });
orderSchema.index({ 'vendorItems.vendorId': 1, createdAt: -1 });
orderSchema.index({ status: 1, escrowStatus: 1, deliveredAt: 1 });
// T4.4: COD settlement query: admin settleCash filters by all 4 fields \u2014 compound index prevents full scan
orderSchema.index({ deliveryBoyId: 1, status: 1, isCashSettled: 1 });

orderSchema.pre('save', function (next) {
    if (this.isModified('status')) {
        const now = new Date();
        if (this.status === 'processing' && !this.processingAt) {
            this.processingAt = now;
        } else if (this.status === 'ready_for_pickup' && !this.readyForPickupAt) {
            this.readyForPickupAt = now;
        } else if (this.status === 'shipped') {
            if (!this.shippedAt) {
                this.shippedAt = now;
            }
            if (!this.deliveryOtpHash) {
                const otp = String(Math.floor(100000 + Math.random() * 900000));
                const secret = process.env.JWT_SECRET || 'fallback-secret-key';
                const hash = crypto.createHash('sha256').update(`${otp}:${secret}`).digest('hex');
                
                this.deliveryOtpHash = hash;
                const isProduction = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
                this.deliveryOtpExpiry = new Date(Date.now() + (isProduction ? 10 * 60 * 1000 : 24 * 60 * 60 * 1000)); // 10 minutes in prod, 24 hours in dev
                this.deliveryOtpSentAt = now;
                this.deliveryOtpAttempts = 0;
                
                if (!isProduction) {
                    this.deliveryOtpDebug = otp;
                }
            }
        } else if (this.status === 'delivered' && !this.deliveredAt) {
            this.deliveredAt = now;
        } else if (this.status === 'cancelled' && !this.cancelledAt) {
            this.cancelledAt = now;
        }
    }
    next();
});

const Order = mongoose.model('Order', orderSchema);
export { Order };
export default Order;
