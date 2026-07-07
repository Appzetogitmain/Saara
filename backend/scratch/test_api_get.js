import 'dotenv/config';
import connectDB from '../src/config/db.js';
import { getOrderDetail } from '../src/modules/delivery/controllers/order.controller.js';
import mongoose from 'mongoose';
import Vendor from '../src/models/Vendor.model.js'; // Ensure Vendor model is registered

const testGetDetail = async () => {
    await connectDB();

    const req = {
        user: { id: '69980d681126b3b604b8734b' },
        params: { id: 'ORD-1783423050771-NVS3' }
    };

    const res = {
        statusCode: 200,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(data) {
            console.log('API Response Status:', this.statusCode);
            console.log('API Response Body:', JSON.stringify(data, null, 2));
        }
    };

    try {
        await getOrderDetail(req, res);
    } catch (err) {
        console.error('Error running controller:', err);
    }

    await mongoose.disconnect();
};

testGetDetail();
