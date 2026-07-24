import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

import reverseEngine from './services/reverseEngine.service.js';
import runEngine from './services/deliveryEngine.service.js';
import ReturnRequest from './models/ReturnRequest.model.js';
import Order from './models/Order.model.js';
import Vendor from './models/Vendor.model.js';
import LogisticsProvider from './models/LogisticsProvider.model.js';
import Shipment from './models/Shipment.model.js';

// --- MOCK DATABASE ENTITIES ---
const mockVendor = {
    _id: 'v789',
    businessName: 'Mock Engine Vendor',
    warehouseAddress: {
        addressLine1: '123 Vendor St',
        city: 'Delhi',
        state: 'Delhi',
        pincode: '110001',
        lat: 28.6139,
        lng: 77.2090
    }
};

const mockOrder = {
    _id: 'o789',
    vendorId: 'v789',
    shippingAddress: {
        fullName: 'Jane Customer',
        addressLine1: '456 Customer Ave',
        city: 'Mumbai',
        state: 'Maharashtra',
        zipCode: '400001', // Note: mapped to pincode internally
        lat: 19.0760,
        lng: 72.8777
    }
};

const mockReturnRequest = {
    _id: 'rr789',
    orderId: mockOrder, // Populated
    status: 'approved'
};

const mockProviders = [
    {
        providerId: 'shiprocket',
        displayName: 'Shiprocket',
        isEnabled: true,
        priority: 1,
        reliabilityScore: 90,
        capabilities: { supportsCOD: true, maxWeightGrams: 0, supportsHyperlocal: true, supportsInterstate: true }
    },
    {
        providerId: 'delhivery',
        displayName: 'Delhivery',
        isEnabled: true,
        priority: 2,
        reliabilityScore: 95,
        capabilities: { supportsCOD: true, maxWeightGrams: 0, supportsHyperlocal: true, supportsInterstate: true }
    },
    {
        providerId: 'own_fleet',
        displayName: 'Own Fleet',
        isEnabled: true,
        priority: 3,
        reliabilityScore: 80,
        capabilities: { supportsCOD: true, maxWeightGrams: 0, supportsHyperlocal: true, supportsInterstate: false }
    }
];

// --- MOCK MONGOOSE ---
ReturnRequest.findById = () => ({
    populate: () => Promise.resolve(mockReturnRequest)
});

Vendor.findById = () => Promise.resolve(mockVendor);

LogisticsProvider.find = () => ({
    sort: () => ({
        lean: () => Promise.resolve(mockProviders)
    })
});

// Mock Shipment.save
Shipment.prototype.save = async function() {
    this._id = 's-mocked-789';
    return this;
};

// --- MOCK PROVIDER ADAPTERS ---
// We'll mock the adapters directly to simulate their response to the Delivery Engine
import shiprocketProvider from './providers/shiprocket.provider.js';
import delhiveryProvider from './providers/delhivery.provider.js';
import ownFleetProvider from './providers/ownFleet.provider.js';

shiprocketProvider.checkReverseServiceability = async () => ({ success: true, serviceable: true });
shiprocketProvider.getQuote = async () => ({
    success: true, estimatedCost: 100, margin: 50, etaHours: 72, providerMetadata: {}
});
shiprocketProvider.createReversePickup = async () => ({
    success: true, awbCode: 'SHIPROCKET-AWB-123', trackingUrl: 'http://track.shiprocket.com'
});

delhiveryProvider.checkReverseServiceability = async () => ({ success: true, serviceable: true });
delhiveryProvider.getQuote = async () => ({
    success: true, estimatedCost: 150, margin: 0, etaHours: 48, providerMetadata: {}
});

ownFleetProvider.checkReverseServiceability = async () => ({ success: true, serviceable: false, reason: 'Out of range' });


async function verifyImplementation() {
    console.log('--- Verifying Reverse Engine Implementation ---');

    // MOCK DeliveryEngineRun.prototype.save
    const _DeliveryEngineRun = (await import('./models/DeliveryEngineRun.model.js')).default;
    _DeliveryEngineRun.prototype.save = async function() { return this; };

    try {
        const result = await reverseEngine.processReturn('rr789');
        console.log('\n[ReverseEngine Result]:', result);
        
        if (result.success && result.providerId === 'shiprocket') {
            console.log('PASS: Engine correctly routed and picked Shiprocket (best margin)');
        } else {
            console.log('FAIL: Engine selection logic failed');
        }

    } catch (error) {
        console.error('Test Error:', error);
    }
}

verifyImplementation();
