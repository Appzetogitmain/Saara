import mongoose from 'mongoose';
import connectDB from './src/config/db.js';
import DeliveryBoy from './src/models/DeliveryBoy.model.js';
import dotenv from 'dotenv';

dotenv.config();

(async () => {
  await connectDB();
  const boys = await DeliveryBoy.find().lean();
  console.log('Delivery Boys:');
  boys.forEach(b => console.log(b._id, b.name, b.email));
  process.exit(0);
})();
