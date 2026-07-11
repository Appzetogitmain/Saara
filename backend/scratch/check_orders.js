import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const checkDb = async () => {
    try {
        const uri = process.env.MONGO_URI;
        await mongoose.connect(uri);
        console.log('Connected to MongoDB.');

        const Order = mongoose.model('Order', new mongoose.Schema({}, { strict: false }));
        
        const recent = await Order.find({})
            .sort({ createdAt: -1 })
            .limit(5)
            .select('orderId status paymentStatus createdAt')
            .lean();

        console.log('Recent orders:');
        console.log(JSON.stringify(recent, null, 2));

        await mongoose.disconnect();
    } catch (err) {
        console.error('Error:', err);
    }
};

checkDb();
