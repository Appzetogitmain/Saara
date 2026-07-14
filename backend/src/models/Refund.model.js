import mongoose from 'mongoose';

const refundSchema = new mongoose.Schema(
    {
        orderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Order',
            required: true,
            index: true,
        },
        returnRequestId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'ReturnRequest',
            index: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
        paymentAttemptId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'PaymentAttempt',
        },
        amount: {
            type: Number,
            required: true,
        },
        // Unique idempotency key — prevents double-refund on admin retry or webhook replay
        referenceId: {
            type: String,
            unique: true,
            sparse: true,
            index: true,
            // Examples:
            //   ORDER_CANCEL_REFUND_${orderId}
            //   RETURN_REFUND_${returnRequestId}
            //   STOCK_FAIL_REFUND_${paymentAttemptId}
            //   EXCHANGE_DOWNGRADE_REFUND_${returnRequestId}
        },
        method: {
            type: String,
            enum: ['razorpay_auto', 'bank_transfer', 'upi', 'wallet_credit'],
        },
        destination: {
            type: String,
            enum: ['bank', 'upi', 'wallet', 'original_source'],
            default: 'wallet',
        },
        status: {
            type: String,
            enum: [
                'requested',   // queued, no action taken yet
                'approved',    // admin confirmed amount is correct
                'processing',  // Razorpay/bank transfer initiated
                'completed',   // confirmed received by customer
                'failed',      // failed, needs manual retry
            ],
            default: 'requested',
            index: true,
        },
        razorpayRefundId: {
            type: String,
            unique: true,
            sparse: true,
        },
        bankDetails: {
            accountHolder: String,
            accountNumber: String,
            ifsc:          String,
            bankName:      String,
        },
        upiId:         { type: String },
        processedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
        failureReason: { type: String },
        notes:         { type: String },
        // Cross-link to VendorWalletTransaction (set when vendor clawback happens)
        vendorTransactionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'VendorWalletTransaction',
        },
        // --- FINANCIAL SNAPSHOT FIELDS ---
        refundBase: { type: Number },
        refundTax: { type: Number },
        refundShipping: { type: Number },
        refundTotal: { type: Number },
    },
    { timestamps: true }
);

refundSchema.index({ orderId: 1, status: 1 });

const Refund = mongoose.model('Refund', refundSchema);
export default Refund;
