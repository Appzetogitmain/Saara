import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { getVendorDetail } from '../src/modules/admin/controllers/vendor.controller.js';

dotenv.config();

const runTest = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const req = {
            params: {
                id: '6996c04b4a33b2417858505e'
            }
        };

        const res = {
            status: function(code) {
                console.log('STATUS:', code);
                return this;
            },
            json: function(data) {
                console.log('JSON DATA:', data);
                return this;
            }
        };

        console.log('Invoking controller getVendorDetail...');
        // getVendorDetail is wrapped in asyncHandler. To capture errors, we must handle the promise rejection.
        await getVendorDetail(req, res, (err) => {
            if (err) {
                console.error('Next middleware called with error:', err);
            }
        });
    } catch (err) {
        console.error('Fatal Test Error:', err);
    } finally {
        await mongoose.disconnect();
    }
};

runTest();
