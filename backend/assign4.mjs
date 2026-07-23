import mongoose from 'mongoose';
import connectDB from './src/config/db.js';
import DeliveryBoy from './src/models/DeliveryBoy.model.js';
import Shipment from './src/models/Shipment.model.js';
import dotenv from 'dotenv';
dotenv.config();

(async () => {
  await connectDB();
  const dboy = await DeliveryBoy.findOne();
  console.log('Delivery Boy ID:', dboy._id);
  
  await Shipment.updateOne(
    { _id: '6a5f49233d048a44e69d0d34' },
    { $set: { deliveryBoyId: dboy._id, deliveryAssignmentStatus: 'accepted' } }
  );
  console.log('Assigned!');
  
  process.exit(0);
})();
