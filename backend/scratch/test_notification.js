import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { createNotification } from '../src/services/notification.service.js';

dotenv.config();

const runTest = async () => {
    try {
        const uri = process.env.MONGO_URI;
        await mongoose.connect(uri);
        console.log('Connected to DB.');

        const vendorId = '6996c04b4a33b2417858505e'; // Fashion Hub Store vendorId
        
        console.log('Sending test notification to vendor...');
        const notif = await createNotification({
            recipientId: vendorId,
            recipientType: 'vendor',
            title: 'Test Notification',
            message: 'Hello, this is a test notification. Product: • Shoes ×1',
            type: 'order',
            data: { orderId: 'ORD-TEST-123' }
        });

        console.log('Notification created successfully:', notif);

        await mongoose.disconnect();
    } catch (err) {
        console.error('Error:', err);
    }
};

runTest();
