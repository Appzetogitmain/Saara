import 'dotenv/config';
import mongoose from 'mongoose';
import Order from '../src/models/Order.model.js';

const checkOrderTimes = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const order = await Order.findOne({ orderId: 'ORD-1783765179707-INBG' }).lean();
        if (!order) {
            console.log('Order not found.');
            process.exit(0);
        }
        console.log(`Order: ${order.orderId}`);
        console.log(`Created At: ${order.createdAt}`);
        console.log(`Updated At: ${order.updatedAt}`);
        console.log(`Payment Status: ${order.paymentStatus}`);
        console.log(`Status: ${order.status}`);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

checkOrderTimes();
