import 'dotenv/config';
import mongoose from 'mongoose';
import Order from '../src/models/Order.model.js';
import DeliveryBoy from '../src/models/DeliveryBoy.model.js';
import Vendor from '../src/models/Vendor.model.js';
import { autoAssignDeliveryPartner } from '../src/services/assignmentService.js';

// Setup Mock Fetch for Google Maps API
const originalFetch = global.fetch;
function setupMockGoogleMaps() {
    global.fetch = async (url) => {
        if (url.includes('googleapis.com')) {
            console.log('   [Mock Fetch] Google Maps API called.');
            return {
                ok: true,
                json: async () => ({
                    status: 'OK',
                    rows: [{
                        elements: [
                            { status: 'OK', duration: { value: 300 }, distance: { value: 1200 } }, // Candidate 1 (Rider A)
                            { status: 'OK', duration: { value: 600 }, distance: { value: 5000 } }  // Candidate 2 (Rider B)
                        ]
                    }]
                })
            };
        }
        return originalFetch ? originalFetch(url) : null;
    };
}

function restoreFetch() {
    global.fetch = originalFetch;
}

let originalStatuses = [];

async function cleanup(vendorId, orderId, boyIds) {
    console.log('🧹 Cleaning up test data...');
    if (vendorId) await Vendor.deleteOne({ _id: vendorId });
    if (orderId) await Order.deleteOne({ _id: orderId });
    if (boyIds && boyIds.length) {
        await DeliveryBoy.deleteMany({ _id: { $in: boyIds } });
    }
    
    // Restore original statuses of other delivery boys
    if (originalStatuses.length) {
        console.log('🔄 Restoring original delivery boy statuses...');
        for (const state of originalStatuses) {
            await DeliveryBoy.updateOne({ _id: state.id }, { status: state.status });
        }
    }
}

async function main() {
    const mongoUri = process.env.MONGO_URI;
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    let testVendorId, testOrderId;
    const testBoyIds = [];

    try {
        // Back up and set existing delivery boys to offline so they do not interfere
        const existingBoys = await DeliveryBoy.find({}).lean();
        originalStatuses = existingBoys.map(b => ({ id: b._id, status: b.status }));
        await DeliveryBoy.updateMany({}, { status: 'offline' });
        console.log(`🔌 Temporarily set ${existingBoys.length} existing delivery boys to offline.`);
        // 1. Create a test Vendor in Mumbai with GeoJSON coordinates [lng, lat]
        console.log('Creating test Vendor in Mumbai...');
        const vendor = await Vendor.create({
            name: 'Test Mumbai Store',
            email: `mumbai_store_${Date.now()}@test.com`,
            password: 'password123',
            storeName: 'Mumbai Bazaar',
            address: {
                city: 'mumbai',
                country: 'India',
                location: {
                    type: 'Point',
                    coordinates: [72.8777, 19.0760] // Mumbai Center [lng, lat]
                }
            },
            status: 'approved'
        });
        testVendorId = vendor._id;

        // 2. Create online Delivery Boys:
        // - Rider A (Mumbai Center: closest)
        // - Rider B (Further away)
        // - Rider C (Busy / Over capacity)
        console.log('Creating test Delivery Boys...');
        const riderA = await DeliveryBoy.create({
            name: 'Rider A (Closest)',
            email: `rider_a_${Date.now()}@test.com`,
            password: 'password123',
            phone: '1234567890',
            status: 'available',
            isActive: true,
            applicationStatus: 'approved',
            currentLocation: {
                type: 'Point',
                coordinates: [72.8777, 19.0760] // Mumbai Center
            },
            maxActiveOrders: 3
        });
        testBoyIds.push(riderA._id);

        const riderB = await DeliveryBoy.create({
            name: 'Rider B (Further)',
            email: `rider_b_${Date.now()}@test.com`,
            password: 'password123',
            phone: '1234567891',
            status: 'available',
            isActive: true,
            applicationStatus: 'approved',
            currentLocation: {
                type: 'Point',
                coordinates: [72.9000, 19.1200] // ~5km away
            },
            maxActiveOrders: 3
        });
        testBoyIds.push(riderB._id);

        const riderC = await DeliveryBoy.create({
            name: 'Rider C (Busy/Overloaded)',
            email: `rider_c_${Date.now()}@test.com`,
            password: 'password123',
            phone: '1234567892',
            status: 'available',
            isActive: true,
            applicationStatus: 'approved',
            currentLocation: {
                type: 'Point',
                coordinates: [72.8780, 19.0765] // Very close (0.1km) but overloaded!
            },
            maxActiveOrders: 0 // Max limit is 0, so should be filtered out!
        });
        testBoyIds.push(riderC._id);

        // 3. Create a test Order
        console.log('Creating test Order...');
        const order = await Order.create({
            orderId: `TEST-${Date.now()}`,
            vendorItems: [{
                vendorId: vendor._id,
                items: [],
                status: 'pending'
            }],
            status: 'pending'
        });
        testOrderId = order._id;

        // Ensure 2dsphere index has finished building
        await DeliveryBoy.syncIndexes();

        // 4. Test 1: Google Maps matching enabled
        console.log('\n--- Test 1: Google Maps auto-assignment ---');
        process.env.USE_GOOGLE_MAPS_ASSIGNMENT = 'true';
        process.env.GOOGLE_MAPS_API_KEY = 'mock_key';
        setupMockGoogleMaps();

        await autoAssignDeliveryPartner(order._id);

        let updatedOrder = await Order.findById(order._id);
        console.log(`Assigned Rider ID: ${updatedOrder.deliveryBoyId} (Expected Rider A: ${riderA._id})`);
        console.log(`Assignment Status: ${updatedOrder.deliveryAssignmentStatus} (Expected: assigned)`);
        
        if (String(updatedOrder.deliveryBoyId) !== String(riderA._id)) {
            throw new Error('Test 1 Failed: Rider A was not assigned via Google Maps!');
        }
        console.log('✅ Test 1 Passed: Google Maps assignment matching success.');

        // 5. Test 2: Google Maps API Fallback (re-route on rejection)
        console.log('\n--- Test 2: Re-route to Rider B on Rider A rejection (Haversine/2dsphere Fallback) ---');
        // Disable Google Maps to force Priority 2 (2dsphere fallback)
        process.env.USE_GOOGLE_MAPS_ASSIGNMENT = 'false';
        restoreFetch();

        updatedOrder.rejectedDeliveryBoys.push(riderA._id);
        updatedOrder.deliveryBoyId = undefined;
        updatedOrder.deliveryAssignmentStatus = 'pending';
        await updatedOrder.save();

        await autoAssignDeliveryPartner(order._id);

        updatedOrder = await Order.findById(order._id);
        console.log(`Assigned Rider ID: ${updatedOrder.deliveryBoyId} (Expected Rider B: ${riderB._id})`);
        console.log(`Assignment Status: ${updatedOrder.deliveryAssignmentStatus} (Expected: assigned)`);
        
        if (String(updatedOrder.deliveryBoyId) !== String(riderB._id)) {
            throw new Error('Test 2 Failed: Order was not re-routed to Rider B via 2dsphere fallback!');
        }
        console.log('✅ Test 2 Passed: Proximity-based 2dsphere fallback assignment success.');

        // 6. Test 3: No couriers available (sets failed state)
        console.log('\n--- Test 3: Failed state if no riders available ---');
        updatedOrder.rejectedDeliveryBoys.push(riderB._id);
        updatedOrder.deliveryBoyId = undefined;
        updatedOrder.deliveryAssignmentStatus = 'pending';
        await updatedOrder.save();

        await autoAssignDeliveryPartner(order._id);

        updatedOrder = await Order.findById(order._id);
        console.log(`Assigned Rider: ${updatedOrder.deliveryBoyId} (Expected: undefined)`);
        console.log(`Assignment Status: ${updatedOrder.deliveryAssignmentStatus} (Expected: failed)`);
        
        if (updatedOrder.deliveryBoyId || updatedOrder.deliveryAssignmentStatus !== 'failed') {
            throw new Error('Test 3 Failed: Order was not set to failed state!');
        }
        console.log('✅ Test 3 Passed: Order correctly marked as failed.');

    } catch (error) {
        console.error('❌ Test execution failed:', error.message);
    } finally {
        await cleanup(testVendorId, testOrderId, testBoyIds);
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
        process.exit(0);
    }
}

main();
