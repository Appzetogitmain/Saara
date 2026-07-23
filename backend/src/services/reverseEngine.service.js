/**
 * Reverse Decision Engine
 * 
 * An orchestrator that routes Return Requests through the main Delivery Engine.
 * It builds a delivery context with the Customer as the Origin and the Vendor as the Destination,
 * leverages the core routing logic, and then seamlessly creates the reverse pickup.
 */

import runEngine from './deliveryEngine.service.js';
import Shipment from '../models/Shipment.model.js';
import Order from '../models/Order.model.js';
import ReturnRequest from '../models/ReturnRequest.model.js';
import Vendor from '../models/Vendor.model.js';
import ownFleetProvider from '../providers/ownFleet.provider.js';
import shiprocketProvider from '../providers/shiprocket.provider.js';
import delhiveryProvider from '../providers/delhivery.provider.js';

const PROVIDER_ADAPTERS = {
    own_fleet: ownFleetProvider,
    shiprocket: shiprocketProvider,
    delhivery: delhiveryProvider,
};

class ReverseEngine {
    
    /**
     * Process a return request by selecting the best logistics provider
     * and creating a reverse shipment (DTO).
     * 
     * @param {string} returnRequestId - ID of the approved ReturnRequest
     * @returns {Promise<object>} - Result of the reverse pickup creation
     */
    async processReturn(returnRequestId, options = {}) {
        const { overrideProviderId, manualAdminId } = options;
        try {
            // 1. Load context entities
            const returnReq = await ReturnRequest.findById(returnRequestId).populate('orderId');
            if (!returnReq) throw new Error('ReturnRequest not found');

            const order = returnReq.orderId;
            if (!order) throw new Error('Order not found');

            const vendorId = returnReq.vendorId || order.vendorId;
            const vendor = await Vendor.findById(vendorId);
            if (!vendor) throw new Error(`Vendor not found for ID ${vendorId}`);

            // 2. Build reversed context (Customer -> Vendor)
            const customerAddress = order.shippingAddress || {};
            const vendorWarehouse = (vendor.warehouseAddress && vendor.warehouseAddress.pincode) 
                ? vendor.warehouseAddress 
                : (vendor.address || {});

            const context = {
                origin: {
                    city: customerAddress.city || '',
                    state: customerAddress.state || '',
                    pincode: String(customerAddress.zipCode || customerAddress.pincode || ''),
                    lat: customerAddress.lat,
                    lng: customerAddress.lng
                },
                destination: {
                    city: vendorWarehouse.city || '',
                    state: vendorWarehouse.state || '',
                    pincode: String(vendorWarehouse.pincode || vendorWarehouse.zipCode || ''),
                    lat: vendorWarehouse.lat || vendorWarehouse.location?.coordinates?.[1],
                    lng: vendorWarehouse.lng || vendorWarehouse.location?.coordinates?.[0]
                },
                // Assuming single item returns for Phase 5; weight mapping could be expanded
                packageWeight: 500, // Default reverse package weight
                paymentMethod: 'online', // Reverse is prepaid/online by merchant
                customerShippingCharge: 0, 
            };

            let selectedProviderId = overrideProviderId;

            // 3. Delegate to Delivery Engine via Strategy Injection (if no manual override)
            if (!selectedProviderId) {
                const engineResult = await runEngine(context, {
                    serviceabilityMethod: 'checkReverseServiceability',
                    orderId: order._id,
                    vendorId: vendor._id
                });

                if (!engineResult.selectedProviderId) {
                    return {
                        success: false,
                        reason: 'NO_SERVICEABLE_PROVIDER',
                        runId: engineResult.runId
                    };
                }
                selectedProviderId = engineResult.selectedProviderId;
            }

            // 4. Generate or Update the Shipment Document (with Intent Lock)
            let shipmentDoc = await Shipment.findOne({ returnRequestId: returnReq._id, type: 'reverse' });
            
            if (shipmentDoc) {
                if (shipmentDoc.status !== 'failed' && shipmentDoc.status !== 'pending') {
                    throw new Error(`Cannot reassign. Shipment is currently in '${shipmentDoc.status}' state.`);
                }
                
                // Atomic update to 'processing' to prevent concurrent manual reassignments
                shipmentDoc = await Shipment.findOneAndUpdate(
                    { _id: shipmentDoc._id, status: { $in: ['failed', 'pending'] } },
                    { 
                        $set: { 
                            status: 'pending',
                            providerId: selectedProviderId,
                            shipmentNumber: `RTO-${Date.now()}`, // Regenerate to avoid provider duplicate order errors
                            errorNotes: null 
                        }
                    },
                    { new: true }
                );

                if (!shipmentDoc) {
                    throw new Error('Concurrent reassignment detected. Please refresh.');
                }
            } else {
                shipmentDoc = new Shipment({
                    orderId: order._id,
                    vendorId: vendor._id,
                    returnRequestId: returnReq._id, // Link it explicitly
                    shipmentNumber: `RTO-${Date.now()}`,
                    providerId: selectedProviderId,
                    type: 'reverse',
                    customerShippingCharge: 0,
                    originAddress: customerAddress,
                    destinationAddress: vendorWarehouse,
                    paymentMethod: 'prepaid',
                    status: 'pending', // Intent lock status
                    packageWeight: context.packageWeight,
                    totalWeight: context.packageWeight
                });
                await shipmentDoc.save();
            }

            // 5. Execute Pickup
            const adapter = PROVIDER_ADAPTERS[selectedProviderId];
            if (!adapter) throw new Error('Selected provider adapter not found');

            const createResult = await adapter.createReversePickup(shipmentDoc);

            if (createResult.success) {
                shipmentDoc.trackingNumber = createResult.awbCode;
                shipmentDoc.trackingUrl = createResult.trackingUrl;
                shipmentDoc.providerMetadata = createResult.providerMetadata;
                shipmentDoc.status = 'pickup_scheduled';
                await shipmentDoc.save();
                
                // Update return request status
                if (selectedProviderId !== 'own_fleet') {
                    returnReq.status = 'pickup_assigned';
                } else if (returnReq.status === 'approved') {
                    returnReq.status = 'pickup_pending';
                }
                await returnReq.save();
            } else {
                shipmentDoc.status = 'failed';
                shipmentDoc.errorNotes = createResult.error?.message;
                await shipmentDoc.save();
            }

            return {
                success: createResult.success,
                providerId: selectedProviderId,
                shipmentId: shipmentDoc._id,
                awb: createResult.awbCode,
                error: createResult.error
            };

        } catch (error) {
            console.error('[ReverseEngine] Error:', error);
            return { success: false, error: error.message };
        }
    }
}

export default new ReverseEngine();
