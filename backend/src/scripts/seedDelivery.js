import 'dotenv/config';
import mongoose from 'mongoose';
import DeliveryBoy from '../models/DeliveryBoy.model.js';

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('MONGO_URI not set in .env');
  process.exit(1);
}

const seedDelivery = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const email = 'delivery@delivery.com';
    const existing = await DeliveryBoy.findOne({ email }).select('+password');

    if (existing) {
      existing.name = 'Delivery Agent';
      existing.phone = existing.phone || '+1234567000';
      existing.password = 'delivery123';
      existing.isActive = true;
      existing.isAvailable = true;
      existing.status = 'available';
      existing.applicationStatus = 'approved';
      existing.vehicleType = existing.vehicleType || 'Bike';
      existing.vehicleNumber = existing.vehicleNumber || 'DL-01-AB-1234';
      await existing.save();
      console.log('Delivery account updated: delivery@delivery.com / delivery123');
    } else {
      await DeliveryBoy.create({
        name: 'Delivery Agent',
        email,
        password: 'delivery123',
        phone: '+1234567000',
        isActive: true,
        isAvailable: true,
        status: 'available',
        applicationStatus: 'approved',
        vehicleType: 'Bike',
        vehicleNumber: 'DL-01-AB-1234',
      });
      console.log('Delivery account created: delivery@delivery.com / delivery123');
    }
  } catch (err) {
    console.error('Seed failed:', err.message);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    process.exit(0);
  }
};

seedDelivery();
