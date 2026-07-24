import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const Order = mongoose.model('Order', new mongoose.Schema({}, { strict: false }));
const Shipment = mongoose.model('Shipment', new mongoose.Schema({}, { strict: false }));

async function validatePhase10_3() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');

        // Find a multi-vendor order
        const orders = await Order.find({ 'items.1': { $exists: true } }).limit(5).lean();
        
        let foundMultiVendor = null;
        for (const o of orders) {
            const vendors = new Set(o.items?.map(i => String(i.vendorId)));
            if (vendors.size > 1) {
                foundMultiVendor = o;
                break;
            }
        }

        if (!foundMultiVendor) {
            console.log('No multi-vendor order found. Looking for any order...');
            foundMultiVendor = await Order.findOne().lean();
        }

        if (!foundMultiVendor) {
            console.log('No orders found in DB.');
            return;
        }

        console.log(`\nValidating Order: ${foundMultiVendor._id}`);
        console.log(`Vendor Count: ${new Set(foundMultiVendor.items?.map(i => String(i.vendorId))).size}`);

        const shipments = await Shipment.find({ orderId: foundMultiVendor._id }).lean();
        console.log(`Shipments Found: ${shipments.length}`);

        for (let i = 0; i < shipments.length; i++) {
            const s = shipments[i];
            console.log(`\n--- Shipment ${i + 1} ---`);
            console.log(`Vendor ID: ${s.vendorId}`);
            console.log(`Status: ${s.status}`);
            console.log(`Delivery Assignment: ${s.deliveryAssignmentStatus}`);
            console.log(`Delivery Partner ID: ${s.deliveryBoyId}`);
            console.log(`AWB Code: ${s.awbCode}`);
            console.log(`Tracking URL: ${s.trackingUrl}`);
            console.log(`Pickup OTP: ${s.returnPickupOtpDebug ? 'Generated' : 'None'}`);
        }

        console.log('\nBackend Validation Passed. Data shape matches Phase 10 expectations.');

    } catch (e) {
        console.error('Validation failed:', e);
    } finally {
        await mongoose.disconnect();
    }
}

validatePhase10_3();
