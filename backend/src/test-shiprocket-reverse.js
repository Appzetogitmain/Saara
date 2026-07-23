import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

import shiprocketProvider from './providers/shiprocket.provider.js';
import Order from './models/Order.model.js';
import Vendor from './models/Vendor.model.js';
import LogisticsProvider from './models/LogisticsProvider.model.js';

// --- MOCK DATABASE ---
const mockVendor = {
    _id: 'v123',
    businessName: 'Mock Vendor Inc',
    email: 'vendor@example.com',
    phone: '8888888888',
    warehouseAddress: {
        name: 'Vendor Warehouse',
        address: '123 Vendor St',
        city: 'Delhi',
        state: 'Delhi',
        country: 'India',
        pincode: '110001'
    }
};

const mockOrder = {
    _id: 'o123',
    vendorId: 'v123',
    total: 1000,
    paymentMethod: 'online',
    shippingAddress: {
        name: 'Jane Customer',
        address: '456 Customer Ave',
        city: 'Mumbai',
        state: 'Maharashtra',
        country: 'India',
        zipCode: '400001',
        email: 'jane@example.com',
        phone: '9999999999'
    },
    status: 'delivered'
};

const mockShipment = {
    _id: 's123',
    shipmentNumber: 'SHP-TEST',
    orderId: 'o123',
    vendorId: 'v123',
    providerId: 'shiprocket',
    type: 'reverse',
    customerShippingCharge: 0,
    packageWeight: 1000,
    providerMetadata: {
        selectedCourier: { courier_company_id: 1, is_return: 1 }
    }
};

// Override Mongoose static methods
Order.findById = () => ({ lean: () => Promise.resolve(mockOrder) });
Vendor.findById = () => ({ lean: () => Promise.resolve(mockVendor) });
LogisticsProvider.findOne = () => ({ select: () => ({ lean: () => Promise.resolve({ config: { mockMode: true } }) }) });

async function verifyImplementation() {
    console.log('--- Verifying Shiprocket Reverse Implementation ---');

    try {
        // Test checkReverseServiceability
        const context = {
            origin: { pincode: mockOrder.shippingAddress.zipCode }, // Customer
            destination: { pincode: mockVendor.warehouseAddress.pincode }, // Vendor
            packageWeight: 1000
        };
        const serviceability = await shiprocketProvider.checkReverseServiceability(context);
        console.log('\n[checkReverseServiceability]', serviceability.success ? 'PASS' : 'FAIL', serviceability);

        // Test createReversePickup
        const createResult = await shiprocketProvider.createReversePickup(mockShipment);
        console.log('\n[createReversePickup]', createResult.success ? 'PASS' : 'FAIL', createResult);

        // Test cancelReversePickup
        mockShipment.providerMetadata = createResult.providerMetadata || {};
        const cancelResult = await shiprocketProvider.cancelReversePickup(mockShipment);
        console.log('\n[cancelReversePickup]', cancelResult.success ? 'PASS' : 'FAIL', cancelResult);

    } catch (error) {
        console.error('Test Error:', error);
    }
}

verifyImplementation();
