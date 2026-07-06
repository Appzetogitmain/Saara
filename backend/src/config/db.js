import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    const maxPoolSize = Math.max(Number(process.env.MONGO_MAX_POOL_SIZE) || 20, 5);
    const minPoolSize = Math.max(Number(process.env.MONGO_MIN_POOL_SIZE) || 5, 0);
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      maxPoolSize,
      minPoolSize,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);

    // Self-healing migration: Fix malformed currentLocation fields on DeliveryBoy
    await conn.connection.db.collection('deliveryboys').updateMany(
        {
            $or: [
                { 'currentLocation.coordinates': { $exists: false } },
                { 'currentLocation.coordinates': { $size: 0 } },
                { 'currentLocation': null },
                { 'currentLocation.type': { $exists: true }, 'currentLocation.coordinates': { $exists: false } }
            ]
        },
        { $set: { currentLocation: { type: 'Point', coordinates: [72.8777, 19.0760] } } }
    );

    // Self-healing migration: Fix malformed address.location fields on Vendor
    await conn.connection.db.collection('vendors').updateMany(
        {
            $or: [
                { 'address.location.coordinates': { $exists: false } },
                { 'address.location.coordinates': { $size: 0 } },
                { 'address.location': null },
                { 'address.location.type': { $exists: true }, 'address.location.coordinates': { $exists: false } }
            ]
        },
        { $set: { 'address.location': { type: 'Point', coordinates: [72.8777, 19.0760] } } }
    );

    console.log(`✅ Self-healing coordinates migration complete.`);
  } catch (error) {
    console.error(`MongoDB connection error: ${error.message}`);
    process.exit(1);
  }
};

export default connectDB;
