import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from '../src/models/Product.model.js';

dotenv.config();

const runTest = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected.');
        const product = await Product.findById('69c54d1cbc43573c4ed0afe0').lean();
        console.log('Product variants:', JSON.stringify(product.variants, null, 2));
        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
};

runTest();
