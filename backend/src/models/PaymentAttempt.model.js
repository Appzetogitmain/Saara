import mongoose from 'mongoose';

const paymentAttemptSchema = new mongoose.Schema(
    {
        orderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Order',
            required: true,
            index: true,
        },
        paymentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Payment',
            index: true,
        },
        razorpayOrderId: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        razorpayPaymentId: {
            type: String,
            sparse: true,
            unique: true,
        },
        razorpaySignature: {
            type: String,
        },
        purpose: {
            type: String,
            enum: ['ORDER_PAYMENT', 'EXCHANGE_UPGRADE'],
            default: 'ORDER_PAYMENT',
            index: true,
        },
        status: {
            type: String,
            enum: [
                'created',               // Razorpay order created, awaiting user payment
                'processing',            // Webhook received, atomic lock acquired
                'paid',                  // Stock deducted, commission created
                'failed',                // User failed/abandoned payment
                'stock_failed_refunding',// Paid but stock out, refund triggered
            ],
            default: 'created',
            index: true,
        },
        attemptNumber: {
            type: Number,
            default: 1,
        },
        webhookPayload: {
            type: mongoose.Schema.Types.Mixed,
        },
        relatedReturnId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'ReturnRequest',
        },
    },
    { timestamps: true }
);

const PaymentAttempt = mongoose.model('PaymentAttempt', paymentAttemptSchema);
export default PaymentAttempt;
