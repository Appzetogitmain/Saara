import 'dotenv/config';
import mongoose from 'mongoose';
import Notification from '../src/models/Notification.model.js';

const checkNotifications = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);

        const VendorSchema = new mongoose.Schema({}, { strict: false });
        const Vendor = mongoose.model('Vendor', VendorSchema);
        const vendor = await Vendor.findOne({ storeName: 'Fashion Hub Store' });
        if (!vendor) {
            console.log('Vendor "Fashion Hub Store" not found.');
            process.exit(0);
        }
        console.log(`Found Vendor: ID = ${vendor._id}, Name = ${vendor.name}, Store = ${vendor.storeName}`);

        const notifications = await Notification.find({
            recipientId: vendor._id,
            recipientType: 'vendor'
        }).sort({ createdAt: -1 }).limit(30);

        console.log(`\nFound ${notifications.length} notifications:`);
        notifications.forEach((n, idx) => {
            console.log(`${idx + 1}. Title: "${n.title}" | Msg: "${n.message}" | Read: ${n.isRead} | Created At: ${n.createdAt}`);
        });

        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
};

checkNotifications();
