import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Vendor from '../src/models/Vendor.model.js';

dotenv.config();

const testQuery = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');
        
        const vendorId = '6996c04b4a33b2417858505e';
        
        console.log('Running query with mixed select...');
        const vendor = await Vendor.findById(vendorId)
            .select('-password -otp -otpExpiry +bankDetails.accountName +bankDetails.accountNumber +bankDetails.bankName +bankDetails.ifscCode +upiId +paypalEmail')
            .lean();
            
        console.log('Query Succeeded!', vendor);
    } catch (err) {
        console.error('Query Failed with Error:', err);
    } finally {
        await mongoose.disconnect();
    }
};

testQuery();
