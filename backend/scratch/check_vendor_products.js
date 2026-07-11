import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from '../src/models/Product.model.js';

dotenv.config();

const runTest = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected.');
        const vendorId = '6a47541b86ec58d5b3793f16';
        const list = await Product.find({ vendorId }).select('name price stock stockQuantity').lean();
        console.log('Products owned by vendor:', list);
        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
};

runTest();
