import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { buildOrderItemsSummary, buildVendorItemsSummary } from '../src/utils/notificationProductFormatter.js';

dotenv.config();

const runTest = async () => {
    try {
        const uri = process.env.MONGO_URI;
        await mongoose.connect(uri);
        console.log('Connected to DB.');

        const Order = mongoose.model('Order', new mongoose.Schema({}, { strict: false }));
        
        const orderDoc = await Order.findOne({ orderId: 'ORD-1783769922882-0JU1' }).lean();
        if (!orderDoc) {
            console.error('Order not found');
            process.exit(1);
        }

        console.log('Order Items:', orderDoc.items);
        console.log('Order VendorItems:', orderDoc.vendorItems);

        console.log('Running buildOrderItemsSummary...');
        const orderSummary = buildOrderItemsSummary(orderDoc.items);
        console.log('Order summary result:', JSON.stringify(orderSummary));

        console.log('Running buildVendorItemsSummary...');
        const vendorGroup = orderDoc.vendorItems[0];
        const vendorSummary = buildVendorItemsSummary(vendorGroup.items);
        console.log('Vendor summary result:', JSON.stringify(vendorSummary));

        await mongoose.disconnect();
    } catch (err) {
        console.error('Error occurred:', err);
    }
};

runTest();
