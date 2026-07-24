import mongoose from 'mongoose';
import connectDB from './src/config/db.js';
import Order from './src/models/Order.model.js';
import Shipment from './src/models/Shipment.model.js';
import Vendor from './src/models/Vendor.model.js';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

function generateDeliveryOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function hashDeliveryOtp(otp) {
    const secret = process.env.JWT_SECRET;
    return crypto.createHash('sha256').update(otp + ':' + secret).digest('hex');
}

(async () => {
  await connectDB();
  const orderId = 'ORD-1784626291721-VD8R';
  const order = await Order.findOne({ orderId });
  
  for (const vGroup of order.vendorItems) {
    const existing = await Shipment.findOne({ orderId: order._id, vendorId: vGroup.vendorId });
    if (!existing) {
        const vendor = await Vendor.findById(vGroup.vendorId);
        
        const otp = order.deliveryOtpDebug || generateDeliveryOtp();
        const otpHash = hashDeliveryOtp(otp);
        const otpExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);

        const doc = {
            orderId: order._id,
            vendorId: vGroup.vendorId,
            vendorName: vendor ? vendor.storeName : 'Unknown Vendor',
            providerId: 'own_fleet',
            selectedBy: 'AUTO',
            providerLocked: false,
            customerShippingCharge: Number(vGroup.shipping) || 0,
            estimatedDeliveryCost: 0,
            status: 'out_for_delivery',
            statusHistory: [{
                status: 'out_for_delivery',
                updatedAt: new Date(),
                updatedBy: 'system',
                notes: 'Shipment created retrospectively via script'
            }],
            packageWeight: vGroup.items.reduce((sum, item) => sum + (500 * (item.quantity || 1)), 0) || 500,
            escrowStatus: 'held',
            deliveryAssignmentStatus: 'accepted',
            deliveryOtpHash: otpHash,
            deliveryOtpExpiry: otpExpiry,
            deliveryOtpSentAt: new Date(),
            deliveryOtpDebug: otp,
            rejectedDeliveryBoys: [],
            migratedFromOrder: true
        };
        const shipment = new Shipment(doc);
        await shipment.save();
        console.log('Created shipment for vendor', vGroup.vendorId, 'with ID', shipment._id, 'and OTP', otp);
        
        const { autoAssignDeliveryPartner } = await import('./src/services/deliveryAssignment.service.js');
        await autoAssignDeliveryPartner(shipment._id);
        console.log('Auto-assigned delivery partner for shipment', shipment._id);
    } else {
        console.log('Shipment already exists for vendor', vGroup.vendorId);
    }
  }
  
  process.exit(0);
})();
