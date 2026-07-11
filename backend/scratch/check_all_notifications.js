import 'dotenv/config';
import mongoose from 'mongoose';
import Notification from '../src/models/Notification.model.js';

const checkAllNotifications = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const notifications = await Notification.find({
            createdAt: { $gte: todayStart }
        }).sort({ createdAt: -1 }).lean();

        console.log(`Found ${notifications.length} notifications created today:`);
        notifications.forEach((n, idx) => {
            console.log(`${idx + 1}. To: ${n.recipientType} (${n.recipientId}) | Title: "${n.title}" | Msg: "${n.message}" | Created: ${n.createdAt}`);
        });

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

checkAllNotifications();
