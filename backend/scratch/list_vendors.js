import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const runTest = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected.');

        const Vendor = mongoose.model('Vendor', new mongoose.Schema({}, { strict: false }));
        const list = await Vendor.find({}).select('storeName email name').lean();
        console.log('Vendors:', list);

        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
};

runTest();
