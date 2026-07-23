import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve('C:/Users/RCom/Desktop/Saara/backend/.env') });

import Order from 'C:/Users/RCom/Desktop/Saara/backend/src/models/Order.model.js';
import Shipment from 'C:/Users/RCom/Desktop/Saara/backend/src/models/Shipment.model.js';

async function fixMissingShipments() {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to DB');

    const orders = await Order.find({ status: { $ne: 'cancelled' } }).lean();
    let fixedCount = 0;

    for (const order of orders) {
        const shipmentCount = await Shipment.countDocuments({ orderId: order._id });
        if (shipmentCount === 0 && order.vendorItems && order.vendorItems.length > 0) {
            console.log(`Fixing Order ${order.orderId} (missing shipments)`);
            
            const shipmentDocs = order.vendorItems.map((vGroup) => {
                return {
                    orderId:                order._id,
                    vendorId:               vGroup.vendorId,
                    vendorName:             vGroup.vendorName,
                    providerId:             'own_fleet',
                    selectedBy:             'AUTO',
                    providerLocked:         false,
                    customerShippingCharge: Number(vGroup.shipping) || 0,
                    estimatedDeliveryCost:  0,
                    status:                 'pending',
                    statusHistory: [{
                        status:    'pending',
                        updatedAt: new Date(),
                        updatedBy: 'system',
                        notes:     'Shipment backfilled by system script',
                    }],
                    packageWeight: vGroup.items.reduce(
                        (sum, item) => sum + (500 * (item.quantity || 1)), 0
                    ) || 500,
                    escrowStatus: 'held',
                    deliveryAssignmentStatus: 'pending',
                    rejectedDeliveryBoys: [],
                };
            });

            for (const doc of shipmentDocs) {
                const shipment = new Shipment(doc);
                await shipment.save();
                console.log(` -> Created Shipment ${shipment.shipmentNumber}`);
            }
            fixedCount++;
        }
    }

    console.log(`Finished fixing ${fixedCount} orders.`);
    await mongoose.disconnect();
}

fixMissingShipments().catch(console.error);
