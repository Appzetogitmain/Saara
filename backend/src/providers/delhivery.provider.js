import axios from 'axios';
import { BaseProvider, PROVIDER_ERROR_CODES } from './providerInterface.js';

class DelhiveryProvider extends BaseProvider {
    constructor() {
        super('delhivery', 'Delhivery');
        
        // Environment configurations
        this.apiBaseUrl = process.env.DELHIVERY_API_URL || 'https://track.delhivery.com';
        this.apiToken = process.env.DELHIVERY_TOKEN; // To be set by admin in env later
    }

    _getHeaders() {
        return {
            'Content-Type': 'application/json',
            'Authorization': `Token ${this.apiToken}`,
        };
    }

    async checkServiceability(context) {
        if (!this.apiToken) {
             return this._notServiceable(PROVIDER_ERROR_CODES.AUTH_FAILED, 'Delhivery token not configured.');
        }

        try {
            const { destination } = context;
            
            // Using Delhivery Pincode Serviceability API
            const response = await axios.get(`${this.apiBaseUrl}/c/api/pin-code/json/`, {
                headers: this._getHeaders(),
                params: { filter_codes: destination.pincode }
            });

            const data = response.data;
            if (data?.delivery_codes?.length > 0) {
                const deliveryData = data.delivery_codes[0].postal_code;
                
                if (context.paymentMethod === 'cod' && deliveryData.cod !== 'Y') {
                    return this._serviceabilityResponse(false, 'COD_NOT_SUPPORTED_FOR_PINCODE');
                }

                // Consider serviceable if the destination pincode exists
                return this._serviceabilityResponse(true);
            }
            
            return this._serviceabilityResponse(false, 'NOT_SERVICEABLE_BY_DELHIVERY');

        } catch (error) {
            return this._internalError(error, 'checkServiceability');
        }
    }

    async getQuote(context) {
        if (!this.apiToken) {
            return {
                success: false,
                providerId: this.providerId,
                providerName: this.providerName,
                error: { code: PROVIDER_ERROR_CODES.AUTH_FAILED, message: 'Delhivery API token is not configured.' }
            };
        }

        try {
            const { origin, destination, packageWeight, paymentMethod, customerShippingCharge } = context;
            
            // Check serviceability again or rely on the engine? The engine calls checkServiceability first.
            // Using Delhivery rate calculator API (mock/standard endpoint)
            const response = await axios.get(`${this.apiBaseUrl}/api/kinko/v1/invoice/charges/.json`, {
                headers: this._getHeaders(),
                params: {
                    md: paymentMethod === 'cod' || paymentMethod === 'cash' ? 'C' : 'P', // C for COD, P for Prepaid
                    ss: 'Delivered', // standard status
                    d_pin: destination.pincode,
                    o_pin: origin.pincode,
                    cgm: packageWeight // weight in grams
                }
            });

            const data = response.data;
            if (data?.length > 0 && data[0].total_amount) {
                const estimatedCost = data[0].total_amount;
                
                return {
                    success: true,
                    providerId: this.providerId,
                    providerName: this.providerName,
                    customerCharge: customerShippingCharge,
                    estimatedCost: estimatedCost,
                    margin: customerShippingCharge - estimatedCost,
                    etaHours: 72, // Defaulting to 3 days (Delhivery APIs sometimes omit exact ETA)
                    etaDate: new Date(Date.now() + 72 * 60 * 60 * 1000),
                    quotedAt: new Date(),
                    expiresAt: new Date(Date.now() + 30 * 60 * 1000), // Valid for 30 minutes
                    providerMetadata: data[0],
                    error: null
                };
            }

            return {
                success: false,
                providerId: this.providerId,
                providerName: this.providerName,
                error: { code: PROVIDER_ERROR_CODES.API_ERROR, message: 'Invalid response from Delhivery API.' }
            };

        } catch (error) {
            return this._internalError(error, 'getQuote');
        }
    }

    async createShipment(shipment) {
        if (!this.apiToken) {
            return {
                success: false,
                providerId: this.providerId,
                error: { code: PROVIDER_ERROR_CODES.AUTH_FAILED, message: 'Delhivery token not configured.' }
            };
        }

        try {
            // Using Delhivery Create Order API
            const payload = {
                format: "json",
                data: {
                    shipments: [{
                        name: shipment.shippingAddress.fullName,
                        add: shipment.shippingAddress.addressLine1,
                        pin: shipment.shippingAddress.pincode,
                        city: shipment.shippingAddress.city,
                        state: shipment.shippingAddress.state,
                        country: "India",
                        phone: shipment.shippingAddress.phoneNumber,
                        order: shipment.orderId.toString(),
                        payment_mode: shipment.paymentMethod === 'cod' || shipment.paymentMethod === 'cash' ? 'COD' : 'Pre-paid',
                        return_pin: shipment.originAddress.pincode,
                        return_city: shipment.originAddress.city,
                        return_phone: shipment.originAddress.phone,
                        return_add: shipment.originAddress.addressLine1,
                        return_state: shipment.originAddress.state,
                        return_country: "India",
                        products_desc: "E-commerce Goods",
                        cod_amount: shipment.paymentMethod === 'cod' || shipment.paymentMethod === 'cash' ? shipment.codAmount : 0,
                        name_info: shipment.shippingAddress.fullName,
                        weight: shipment.totalWeight / 1000 // Convert grams to kg
                    }],
                    pickup_location: {
                        name: shipment.vendorId.toString(),
                        add: shipment.originAddress.addressLine1,
                        city: shipment.originAddress.city,
                        pin_code: shipment.originAddress.pincode,
                        country: "India",
                        phone: shipment.originAddress.phone
                    }
                }
            };

            const response = await axios.post(`${this.apiBaseUrl}/api/cmu/create.json`, `format=json&data=${JSON.stringify(payload.data)}`, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Token ${this.apiToken}`,
                }
            });

            const data = response.data;
            if (data?.success && data?.packages?.length > 0) {
                const pkg = data.packages[0];
                return {
                    success: true,
                    providerId: this.providerId,
                    awbCode: pkg.waybill,
                    trackingUrl: `https://www.delhivery.com/track/package/${pkg.waybill}`,
                    courierName: 'Delhivery',
                    labelUrl: null, // Label fetching requires a separate API call in Delhivery usually
                    estimatedPickupAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Next day pickup
                    providerMetadata: pkg,
                    error: null
                };
            }

            return {
                success: false,
                providerId: this.providerId,
                error: { code: PROVIDER_ERROR_CODES.API_ERROR, message: data.rmk || 'Failed to create shipment on Delhivery.' }
            };

        } catch (error) {
            return this._internalError(error, 'createShipment');
        }
    }

    async cancelShipment(shipment) {
        if (!this.apiToken) {
            return {
                success: false,
                providerId: this.providerId,
                error: { code: PROVIDER_ERROR_CODES.AUTH_FAILED, message: 'Delhivery token not configured.' }
            };
        }

        try {
            const waybill = shipment.trackingNumber;
            if (!waybill) {
                return {
                    success: false,
                    providerId: this.providerId,
                    error: { code: PROVIDER_ERROR_CODES.SHIPMENT_NOT_FOUND, message: 'Tracking number (AWB) is missing.' }
                };
            }

            const response = await axios.post(`${this.apiBaseUrl}/api/p/edit`, {
                waybill: waybill,
                cancellation: "true"
            }, {
                headers: this._getHeaders()
            });

            if (response.data?.status === 'True') {
                return {
                    success: true,
                    providerId: this.providerId,
                    cancelled: true,
                    error: null
                };
            }

            return {
                success: false,
                providerId: this.providerId,
                cancelled: false,
                error: { code: PROVIDER_ERROR_CODES.API_ERROR, message: response.data?.remark || 'Cancellation failed.' }
            };

        } catch (error) {
            return this._internalError(error, 'cancelShipment');
        }
    }

    // ─── Reverse Logistics ───────────────────────────────────────────────────

    async checkReverseServiceability(context) {
        if (!this.apiToken) {
             return this._notServiceable(PROVIDER_ERROR_CODES.AUTH_FAILED, 'Delhivery token not configured.');
        }

        try {
            // For reverse, origin is the Customer's address
            const customerPincode = context.origin.pincode;
            
            const response = await axios.get(`${this.apiBaseUrl}/c/api/pin-code/json/`, {
                headers: this._getHeaders(),
                params: { filter_codes: customerPincode }
            });

            const data = response.data;
            if (data?.delivery_codes?.length > 0) {
                const deliveryData = data.delivery_codes[0].postal_code;
                
                // For reverse pickups, verify the pincode supports pickup
                if (deliveryData.pickup !== 'Y' && deliveryData.pickup !== 'y') {
                    return this._serviceabilityResponse(false, 'PICKUP_NOT_SUPPORTED_FOR_PINCODE');
                }

                return this._serviceabilityResponse(true);
            }
            
            return this._serviceabilityResponse(false, 'NOT_SERVICEABLE_BY_DELHIVERY');

        } catch (error) {
            return this._internalError(error, 'checkReverseServiceability');
        }
    }

    async createReversePickup(shipment) {
        if (!this.apiToken) {
            return {
                success: false,
                providerId: this.providerId,
                error: { code: PROVIDER_ERROR_CODES.AUTH_FAILED, message: 'Delhivery token not configured.' }
            };
        }

        try {
            // Extract addresses from shipment context (populated by Engine)
            // Reverse: originAddress = Customer, destinationAddress = Vendor Warehouse
            const customerAddress = shipment.originAddress;
            const vendorAddress = shipment.destinationAddress;

            const payload = {
                format: "json",
                data: {
                    shipments: [{
                        // Customer Address (Where to pick up from)
                        name: customerAddress.fullName || customerAddress.name,
                        add: customerAddress.addressLine1 || customerAddress.address,
                        pin: customerAddress.pincode || customerAddress.zipCode,
                        city: customerAddress.city,
                        state: customerAddress.state,
                        country: "India",
                        phone: customerAddress.phoneNumber || customerAddress.phone,
                        order: shipment.shipmentNumber || shipment.orderId.toString(),
                        
                        // Delhivery Reverse specific fields
                        package_type: "Pickup",
                        payment_mode: "Pre-paid", // Reverse is always prepaid by the merchant
                        
                        // Where it should be returned if not delivered back to merchant (Fallback)
                        return_pin: vendorAddress.pincode,
                        return_city: vendorAddress.city,
                        return_phone: vendorAddress.phone,
                        return_add: vendorAddress.addressLine1 || vendorAddress.address,
                        return_state: vendorAddress.state,
                        return_country: "India",
                        
                        products_desc: "Return Shipment",
                        cod_amount: 0,
                        name_info: customerAddress.fullName || customerAddress.name,
                        weight: (shipment.totalWeight || shipment.packageWeight || 500) / 1000 // Convert grams to kg
                    }],
                    // Vendor Registered Warehouse (Where to return the package)
                    pickup_location: {
                        name: shipment.vendorId.toString(),
                        add: vendorAddress.addressLine1 || vendorAddress.address,
                        city: vendorAddress.city,
                        pin_code: vendorAddress.pincode,
                        country: "India",
                        phone: vendorAddress.phone
                    }
                }
            };

            const response = await axios.post(`${this.apiBaseUrl}/api/cmu/create.json`, `format=json&data=${JSON.stringify(payload.data)}`, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Token ${this.apiToken}`,
                }
            });

            const data = response.data;
            if (data?.success && data?.packages?.length > 0) {
                const pkg = data.packages[0];
                return {
                    success: true,
                    providerId: this.providerId,
                    awbCode: pkg.waybill,
                    trackingUrl: `https://www.delhivery.com/track/package/${pkg.waybill}`,
                    courierName: 'Delhivery',
                    labelUrl: null,
                    estimatedPickupAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Next day pickup
                    providerMetadata: pkg,
                    error: null
                };
            }

            return {
                success: false,
                providerId: this.providerId,
                error: { code: PROVIDER_ERROR_CODES.API_ERROR, message: data.rmk || 'Failed to create reverse shipment on Delhivery.' }
            };

        } catch (error) {
            return this._internalError(error, 'createReversePickup');
        }
    }

    async cancelReversePickup(shipment) {
        // Delhivery cancellation operates uniformly via the Waybill number.
        return this.cancelShipment(shipment);
    }
}

const delhiveryProvider = new DelhiveryProvider();
export default delhiveryProvider;
