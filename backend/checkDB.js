import mongoose from 'mongoose';
import connectDB from './src/config/db.js';
import Order from './src/models/Order.model.js';
import Shipment from './src/models/Shipment.model.js';
import dotenv from 'dotenv';

dotenv.config();

(async () => {
  await connectDB();
  const order = await Order.findOne({ orderId: 'ORD-1784619852270-CK4Y' }).lean();
  console.log('Order Status:', order?.status);
  console.log('Order vendorItem 0 status:', order?.vendorItems?.[0]?.status);
  
  if (order) {
    const shipment = await Shipment.findOne({ orderId: order._id }).lean();
    console.log('Shipment:', shipment ? {
      status: shipment.status,
      deliveryAssignmentStatus: shipment.deliveryAssignmentStatus,
      deliveryBoyId: shipment.deliveryBoyId
    } : null);
  }
  process.exit(0);
})();
