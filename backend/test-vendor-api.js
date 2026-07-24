import mongoose from 'mongoose';

// Simulate DB populated object
const shipment = {
    _id: new mongoose.Types.ObjectId(),
    shipmentNumber: 'SHP123',
    providerId: 'own_fleet',
    status: 'pickup_assigned',
    deliveryBoyId: {
        _id: new mongoose.Types.ObjectId(),
        name: 'John Driver',
        phone: '1234567890'
    }
};

const normalized = {};

normalized.reverseShipment = {
    shipmentId: shipment._id,
    shipmentNumber: shipment.shipmentNumber,
    providerId: shipment.providerId,
    awbCode: shipment.awbCode,
    trackingUrl: shipment.trackingUrl,
    status: shipment.status,
    deliveryBoyId: shipment.deliveryBoyId
};

console.log("FINAL API RESPONSE:");
console.log(JSON.stringify(normalized.reverseShipment, null, 2));
