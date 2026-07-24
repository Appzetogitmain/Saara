import Razorpay from 'razorpay';
import crypto from 'crypto';
import ApiError from '../utils/ApiError.js';

const razorpay = new Razorpay({
    key_id:     process.env.RAZORPAY_KEY_ID || 'rzp_test_mock12345',
    key_secret: process.env.RAZORPAY_KEY_SECRET || 'mock_secret12345',
});

/**
 * Create a Razorpay order for the given amount.
 * @param {number} amountInRupees - Amount in ₹ (will be converted to paise)
 * @param {string} currency - e.g. 'INR'
 * @param {string} receiptId - Human-readable reference (order ID)
 * @param {object} notes - Optional metadata
 */
export const createRazorpayOrder = (amountInRupees, currency = 'INR', receiptId, notes = {}) =>
    razorpay.orders.create({
        amount:   Math.round(amountInRupees * 100),
        currency,
        receipt:  String(receiptId),
        notes,
    });

/**
 * Verify the HMAC-SHA256 signature sent by Razorpay webhooks.
 * Throws ApiError 400 if signature is invalid.
 */
export const verifyWebhookSignature = (rawBody, signature) => {
    if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
        throw new Error('RAZORPAY_WEBHOOK_SECRET is not configured.');
    }
    const expected = crypto
        .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
        .update(rawBody)
        .digest('hex');
    // SEC-01: Use timingSafeEqual to prevent timing-based signature forgery
    const expectedBuf = Buffer.from(expected);
    const actualBuf   = Buffer.from(signature || '');
    const isValid = expectedBuf.length === actualBuf.length &&
        crypto.timingSafeEqual(expectedBuf, actualBuf);
    if (!isValid) {
        throw new ApiError(400, 'Invalid Razorpay webhook signature.');
    }
};

/**
 * Verify the payment signature returned by the frontend after payment.
 * Returns true if valid, false otherwise.
 */
export const verifyPaymentSignature = (razorpayOrderId, razorpayPaymentId, signature) => {
    const expected = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(`${razorpayOrderId}|${razorpayPaymentId}`)
        .digest('hex');
    // SEC-01: Constant-time comparison prevents timing attack enumeration
    const expectedBuf = Buffer.from(expected);
    const actualBuf   = Buffer.from(signature || '');
    return expectedBuf.length === actualBuf.length &&
        crypto.timingSafeEqual(expectedBuf, actualBuf);
};

/**
 * Initiate a refund for a Razorpay payment.
 * @param {string} razorpayPaymentId - The payment ID to refund
 * @param {number} amountInRupees - Amount to refund in ₹
 * @param {object} notes - Optional metadata for audit
 */
export const initiateRefund = (razorpayPaymentId, amountInRupees, notes = {}) =>
    razorpay.payments.refund(razorpayPaymentId, {
        amount: Math.round(amountInRupees * 100),
        notes,
    });
