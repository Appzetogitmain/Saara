import mongoose from 'mongoose';
import connectDB from './src/config/db.js';
import Shipment from './src/models/Shipment.model.js';
import Order from './src/models/Order.model.js';
import dotenv from 'dotenv';
dotenv.config();

(async () => {
  await connectDB();
  mongoose.set('debug', true); // THIS WILL SHOW US EXACTLY WHAT MONGOOSE SENDS TO DB
  const orderId = 'ORD-1784619852270-CK4Y';
  const order = await Order.findOne({ orderId });
  const shipment = await Shipment.findOne({ orderId: order?._id });
  
  if (!shipment) {
    console.log('No shipment found');
    process.exit(0);
  }
  
  console.log('Before update, status is:', shipment.status);
  
  const verifiedAt = new Date();
  
  try {
    const result = await Shipment.findByIdAndUpdate(shipment._id, {
      $set:   { deliveryOtpVerifiedAt: verifiedAt, status: 'delivered', deliveredAt: new Date() },
      $unset: { deliveryOtpHash: '', deliveryOtpExpiry: '', deliveryOtpSentAt: '', deliveryOtpAttempts: 0, deliveryOtpDebug: '' },
    }, { new: true, runValidators: true });
    
    console.log('Result from findByIdAndUpdate:', result?.status);
  } catch (err) {
    console.log('Error updating:', err);
  }
  
  const after = await Shipment.findById(shipment._id);
  console.log('After update, status is:', after?.status);
  
  process.exit(0);
})();
