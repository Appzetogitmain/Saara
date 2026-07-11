import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema(
    {
        orderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Order',
            required: true,
            index: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            index: true,
        },
        gateway: {
            type: String,
            enum: ['razorpay'],
            default: 'razorpay',
        },
        amount: {
            type: Number,
            required: true,
        },
        currency: {
            type: String,
            default: 'INR',
        },
        // Summary-level status only — attempt-level states live on PaymentAttempt
        status: {
            type: String,
            enum: [
                'pending',            // created, no attempt paid yet
                'paid',               // at least one attempt succeeded
                'failed',             // all attempts failed, order abandoned
                'refund_pending',     // paid but stock failed, refund queued
                'partially_refunded', // partial items refunded
                'refunded',           // fully refunded
            ],
            default: 'pending',
            index: true,
        },
        method: {
            type: String, // upi / card / netbanking / wallet — set from paid attempt
        },
    },
    { timestamps: true }
);

const Payment = mongoose.model('Payment', paymentSchema);
export default Payment;
