import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

import axios from 'axios';
import delhiveryProvider from './providers/delhivery.provider.js';

// --- MOCK AXIOS ---
const originalAxiosGet = axios.get;
const originalAxiosPost = axios.post;

axios.get = async (url, config) => {
    if (url.includes('/c/api/pin-code/json/')) {
        return {
            data: {
                delivery_codes: [{
                    postal_code: {
                        pin: config.params.filter_codes,
                        cod: 'Y',
                        pre_paid: 'Y',
                        pickup: 'Y' // Crucial for reverse serviceability
                    }
                }]
            }
        };
    }
    return originalAxiosGet(url, config);
};

axios.post = async (url, data, config) => {
    if (url.includes('/api/cmu/create.json')) {
        // Parse the urlencoded payload for validation
        const payloadString = data.split('data=')[1];
        const payload = JSON.parse(decodeURIComponent(payloadString));
        
        console.log('\n[Delhivery Mock] Received Payload:', JSON.stringify(payload, null, 2));

        return {
            data: {
                success: true,
                packages: [{
                    waybill: 'DLV' + Date.now(),
                    status: 'Manifested'
                }]
            }
        };
    }
    
    if (url.includes('/api/p/edit')) {
        return {
            data: {
                status: 'True',
                remark: 'Cancelled successfully'
            }
        };
    }

    return originalAxiosPost(url, data, config);
};

// --- MOCK DATABASE ENTITIES ---
// Note: In Delhivery provider, the `shipment` object passed by the Engine 
// already contains originAddress and destinationAddress populated!
// This is different from Shiprocket which fetches Order/Vendor.
const mockShipment = {
    _id: 's456',
    shipmentNumber: 'SHP-DLV-TEST',
    orderId: 'o456',
    vendorId: 'v456',
    providerId: 'delhivery',
    type: 'reverse',
    paymentMethod: 'online',
    totalWeight: 1500,
    trackingNumber: 'DLV999999999', // For cancellation
    originAddress: { // Customer Address
        fullName: 'Jane Customer',
        addressLine1: '456 Customer Ave',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400001',
        phone: '9999999999'
    },
    destinationAddress: { // Vendor Warehouse
        addressLine1: '123 Vendor St',
        city: 'Delhi',
        state: 'Delhi',
        pincode: '110001',
        phone: '8888888888'
    }
};

async function verifyImplementation() {
    console.log('--- Verifying Delhivery Reverse Implementation ---');

    // Force API token to bypass Auth check
    delhiveryProvider.apiToken = 'MOCK_TOKEN_123';

    try {
        // Test checkReverseServiceability
        const context = {
            origin: { pincode: mockShipment.originAddress.pincode }, 
            destination: { pincode: mockShipment.destinationAddress.pincode },
            packageWeight: 1500
        };
        const serviceability = await delhiveryProvider.checkReverseServiceability(context);
        console.log('\n[checkReverseServiceability]', serviceability.success ? 'PASS' : 'FAIL', serviceability);

        // Test createReversePickup
        const createResult = await delhiveryProvider.createReversePickup(mockShipment);
        console.log('\n[createReversePickup]', createResult.success ? 'PASS' : 'FAIL', createResult);

        // Test cancelReversePickup
        const cancelResult = await delhiveryProvider.cancelReversePickup(mockShipment);
        console.log('\n[cancelReversePickup]', cancelResult.success ? 'PASS' : 'FAIL', cancelResult);

    } catch (error) {
        console.error('Test Error:', error);
    }
}

verifyImplementation();
