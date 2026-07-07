import 'dotenv/config';
import connectDB from '../src/config/db.js';
import Order from '../src/models/Order.model.js';
import mongoose from 'mongoose';
import crypto from 'crypto';

const resetToShipped = async () => {
    await connectDB();
    console.log('Resetting order ORD-1783423050771-NVS3 to SHIPPED...');

    const order = await Order.findOne({ orderId: 'ORD-1783423050771-NVS3' });
    if (!order) {
        console.error('Order not found');
        process.exit(1);
    }

    const secret = process.env.JWT_SECRET || 'fallback-secret-key';
    const otp = '903403'; // Set delivery OTP back to 903403

    order.status = 'shipped';
    order.deliveryAssignmentStatus = 'accepted';
    order.vendorItems = order.vendorItems.map(vi => ({
        ...vi.toObject(),
        status: 'shipped'
    }));

    order.pickupOtpHash = undefined;
    order.pickupOtpExpiry = undefined;
    order.pickupOtpDebug = undefined;

    order.deliveryOtpHash = crypto.createHash('sha256').update(`${otp}:${secret}`).digest('hex');
    order.deliveryOtpExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours TTL
    order.deliveryOtpSentAt = new Date();
    order.deliveryOtpAttempts = 0;
    order.deliveryOtpDebug = otp;
    order.deliveryOtpVerifiedAt = undefined;

    await order.save();
    console.log('Reset successful!');
    console.log('Status:', order.status);
    console.log('Delivery OTP:', order.deliveryOtpDebug);
    console.log('Delivery OTP Expiry:', order.deliveryOtpExpiry);

    await mongoose.disconnect();
};

resetToShipped();
