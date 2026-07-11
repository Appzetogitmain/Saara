import 'dotenv/config';
import mongoose from 'mongoose';
import Order from '../src/models/Order.model.js';
import { createNotification } from '../src/services/notification.service.js';

const debugNotification = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB.');

        const order = await Order.findOne({ orderId: 'ORD-1783765179707-INBG' });
        if (!order) {
            console.log('Order not found.');
            process.exit(1);
        }

        console.log('Order found. Vendor items length:', order.vendorItems?.length);

        const userId = order.userId;
        if (userId) {
            console.log('Attempting to create user notification...');
            try {
                const n = await createNotification({
                    recipientId: userId,
                    recipientType: 'user',
                    title: 'Order Placed!',
                    message: `Your order ${order.orderId} has been placed successfully.`,
                    type: 'order',
                    data: { link: `/orders/${order.orderId}` },
                });
                console.log('User notification created successfully:', n._id);
            } catch (err) {
                console.error('User Notification Error:', err);
            }
        }

        for (const vGroup of order.vendorItems || []) {
            console.log(`Attempting to create vendor notification for ${vGroup.vendorId}...`);
            try {
                const n = await createNotification({
                    recipientId: vGroup.vendorId,
                    recipientType: 'vendor',
                    title: 'New Order Received!',
                    message: `You have received a new order ${order.orderId} for ${vGroup.items?.length || 0} item(s) totalling ₹${vGroup.subtotal}.`,
                    type: 'order',
                    data: {
                        orderId: String(order.orderId || order._id),
                    },
                });
                console.log('Vendor notification created successfully:', n._id);
            } catch (err) {
                console.error('Vendor Notification Error:', err);
            }
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

debugNotification();
