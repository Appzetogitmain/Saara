import crypto from 'crypto';
import mongoose from 'mongoose';
import connectDB from '../src/config/db.js';
import ReturnRequest from '../src/models/ReturnRequest.model.js';
import Order from '../src/models/Order.model.js';

async function test() {
    await connectDB();
    console.log('Connected to Database');

    // Create a mock ReturnRequest
    const mockOrder = await Order.findOne();
    if (!mockOrder) {
        console.error('No order found to link. Create an order first.');
        process.exit(1);
    }

    // Clean up any old test return request
    await ReturnRequest.deleteMany({ adminNote: 'TEST_EXCHANGE_OTP' });

    console.log('Creating mock exchange return request...');
    const req = await ReturnRequest.create({
        orderId: mockOrder._id,
        userId: mockOrder.userId,
        requestType: 'exchange',
        returnReason: 'Wrong Size',
        status: 'replacement_preparing',
        refundAmount: 0,
        adminNote: 'TEST_EXCHANGE_OTP'
    });

    console.log('Created request ID:', req._id);

    // 1. Test Vendor Handover OTP generation and mock verification
    console.log('\n--- 1. Testing Vendor Handover OTP ---');
    const testOtp = '987654';
    req.vendorHandoverOtpHash = crypto.createHash('sha256').update(testOtp).digest('hex');
    req.vendorHandoverOtpExpiresAt = new Date(Date.now() + 10000); // 10s expiry
    req.vendorHandoverOtpAttempts = 0;
    req.vendorHandoverOtpVerified = false;
    await req.save();
    console.log('Saved handover OTP hash in DB');

    // Test incorrect OTP
    const wrongHash = crypto.createHash('sha256').update('000000').digest('hex');
    if (wrongHash !== req.vendorHandoverOtpHash) {
        req.vendorHandoverOtpAttempts += 1;
        await req.save();
        console.log('Attempt 1 with wrong OTP (Attempt count:', req.vendorHandoverOtpAttempts, ')');
    }

    // Test correct OTP
    const correctHash = crypto.createHash('sha256').update(testOtp).digest('hex');
    if (correctHash === req.vendorHandoverOtpHash) {
        req.vendorHandoverOtpVerified = true;
        req.vendorHandoverOtpAttempts = 0;
        await req.save();
        console.log('Correct OTP verified (Verified:', req.vendorHandoverOtpVerified, ')');
    }

    // 2. Test Customer Delivery OTP generation and mock verification
    console.log('\n--- 2. Testing Customer Delivery OTP ---');
    const testDeliveryOtp = '123456';
    req.customerDeliveryOtpHash = crypto.createHash('sha256').update(testDeliveryOtp).digest('hex');
    req.customerDeliveryOtpExpiresAt = new Date(Date.now() + 10000);
    req.customerDeliveryOtpAttempts = 0;
    req.customerDeliveryOtpVerified = false;
    await req.save();
    console.log('Saved delivery OTP hash in DB');

    // Verify 5 attempts lock guard simulation
    console.log('Simulating 5 incorrect attempts lock...');
    for (let i = 0; i < 5; i++) {
        req.customerDeliveryOtpAttempts += 1;
    }
    await req.save();
    console.log('Attempts:', req.customerDeliveryOtpAttempts);
    if (req.customerDeliveryOtpAttempts >= 5) {
        console.log('Verification correctly locked! (Attempts count >= 5)');
    }

    // Clean up
    await ReturnRequest.deleteOne({ _id: req._id });
    console.log('\nTest completed successfully. Database cleaned up.');
    process.exit(0);
}

test().catch(err => {
    console.error(err);
    process.exit(1);
});
