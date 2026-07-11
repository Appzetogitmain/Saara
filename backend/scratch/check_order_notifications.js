import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const checkDb = async () => {
    try {
        const uri = process.env.MONGO_URI;
        await mongoose.connect(uri);
        console.log('Connected to MongoDB.');

        const Notification = mongoose.model('Notification', new mongoose.Schema({}, { strict: false }));
        
        // Find any notifications with orderId in data
        const list = await Notification.find({
            $or: [
                { 'data.orderId': 'ORD-1783770530522-6K5S' },
                { message: /ORD-1783770530522-6K5S/ }
            ]
        }).lean();

        console.log('Notifications for recent order:', list);

        // Find all notifications created after 11:35:00 UTC
        const cutoff = new Date('2026-07-11T11:35:00.000Z');
        const afterCutoff = await Notification.find({
            createdAt: { $gte: cutoff }
        }).sort({ createdAt: -1 }).lean();

        console.log('All notifications after cutoff:', afterCutoff);

        await mongoose.disconnect();
    } catch (err) {
        console.error('Error:', err);
    }
};

checkDb();
