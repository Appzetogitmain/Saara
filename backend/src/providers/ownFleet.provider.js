/**
 * Own Fleet Provider Adapter
 *
 * Implements the BaseProvider interface for the platform's own delivery fleet.
 * Wraps the existing driver availability and assignment logic.
 *
 * ─── Responsibilities ────────────────────────────────────────────────────────
 * - checkServiceability: queries DeliveryBoy collection for available drivers
 * - getQuote:            calls payoutCalculator + wraps result in standard schema
 * - createShipment:      STUB — Phase 5 will wire in autoAssignDeliveryPartner()
 * - cancelShipment:      STUB — Phase 5 will unassign driver and free capacity
 *
 * ─── No Business Logic ───────────────────────────────────────────────────────
 * This adapter does NOT decide whether own fleet should be selected.
 * That decision belongs in deliveryEngine.service.js.
 * This adapter only answers: "Can we do it?" and "What does it cost?"
 *
 * ─── ETA Estimation ──────────────────────────────────────────────────────────
 * Own Fleet ETA is estimated as:
 *   etaHours = SAME_DAY_BUFFER_HOURS + (distanceKm / AVG_SPEED_KMH)
 * where AVG_SPEED_KMH = 25 (conservative city-driving average).
 * This is an estimate only. Actual delivery time depends on driver.
 * No SLA is implied.
 *
 * ─── Quote Expiry ────────────────────────────────────────────────────────────
 * Quotes expire after QUOTE_VALIDITY_MINUTES (default 30 minutes).
 * After expiry, the checkout UI must re-call the estimate endpoint.
 */

import { BaseProvider, PROVIDER_ERROR_CODES } from './providerInterface.js';
import { calculatePayout }                     from '../services/payoutCalculator.service.js';
import DeliveryBoy                             from '../models/DeliveryBoy.model.js';
import Shipment                                from '../models/Shipment.model.js';
import { autoAssignDeliveryPartner, autoAssignReturnPickupPartner } from '../services/assignmentService.js';
import LogisticsEventBus                       from '../events/logisticsEventBus.js';
import LOGISTICS_EVENTS                        from '../events/logisticsEvents.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const PROVIDER_ID             = 'own_fleet';
const PROVIDER_NAME           = 'Own Delivery Fleet';
const AVG_SPEED_KMH           = 25;     // conservative city average
const SAME_DAY_BUFFER_HOURS   = 1;      // minimum processing + pickup time
const QUOTE_VALIDITY_MINUTES  = 30;
const DEFAULT_DISTANCE_KM     = 5;      // used when coordinates are unavailable
const MAX_COD_CASH_IN_HAND    = 20000;  // must match assignmentService.js

// ─── Haversine Distance Calculator ───────────────────────────────────────────
// Extracted from assignmentService.js — same formula, consistent across codebase.
// Returns distance in km. Returns DEFAULT_DISTANCE_KM if coordinates are missing.

const haversineDistanceKm = (lat1, lon1, lat2, lon2) => {
    if (!lat1 || !lon1 || !lat2 || !lon2) return DEFAULT_DISTANCE_KM;
    const R    = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a    = Math.sin(dLat / 2) ** 2 +
                 Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                 Math.sin(dLon / 2) ** 2;
    return parseFloat((R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(3));
};

// ─── Own Fleet Provider ───────────────────────────────────────────────────────

class OwnFleetProvider extends BaseProvider {
    constructor() {
        super(PROVIDER_ID, PROVIDER_NAME);
    }

    // ─── checkServiceability ───────────────────────────────────────────────────

    /**
     * Checks if own fleet can service this delivery.
     * A delivery is serviceable if at least one approved, available driver exists.
     * COD orders additionally require at least one driver under the COD cash limit.
     *
     * Phase 5 enhancement: add geo-proximity filter (only count drivers within radius).
     */
    async checkServiceability(context) {
        const method = 'checkServiceability';
        console.log(`[${PROVIDER_ID}] Starting ${method}: paymentMethod=${context?.paymentMethod}`);

        try {
            const query = {
                status:             'available',
                isActive:           true,
                applicationStatus:  'approved',
            };

            // For COD orders, check driver can accept more cash
            const isCod = context?.paymentMethod === 'cod' || context?.paymentMethod === 'cash';
            if (isCod) {
                // Approximate: check at least one driver is under the COD limit
                // Exact order total not known at serviceability check time, use limit headroom
                query.cashInHand = { $lt: MAX_COD_CASH_IN_HAND };
            }

            const availableCount = await DeliveryBoy.countDocuments(query);

            if (availableCount === 0) {
                const reason = isCod
                    ? 'No drivers available with sufficient COD capacity'
                    : 'No drivers currently available';

                console.log(`[${PROVIDER_ID}] ${method}: NOT serviceable — ${reason}`);
                return this._serviceabilityResponse(false, reason);
            }

            console.log(`[${PROVIDER_ID}] ${method}: Serviceable — ${availableCount} driver(s) available`);
            return this._serviceabilityResponse(true);

        } catch (err) {
            return this._notServiceable(
                PROVIDER_ERROR_CODES.INTERNAL_ERROR,
                `Own fleet serviceability check failed: ${err.message}`
            );
        }
    }

    // ─── getQuote ──────────────────────────────────────────────────────────────

    /**
     * Returns a standardised delivery quote for own fleet.
     *
     * estimatedCost  = driver payout (from payoutCalculator — DB-driven, configurable)
     * customerCharge = passed through from context (already decided upstream)
     * margin         = customerCharge - estimatedCost
     *
     * Distance resolution order:
     *   1. context.estimatedDistanceKm  (pre-computed, most accurate)
     *   2. Haversine from lat/lng coords
     *   3. DEFAULT_DISTANCE_KM (5km fallback)
     */
    async getQuote(context) {
        const method = 'getQuote';
        console.log(
            `[${PROVIDER_ID}] Starting ${method}:`,
            `origin=${context?.origin?.pincode}`,
            `dest=${context?.destination?.pincode}`,
            `weight=${context?.packageWeight}g`,
            `payment=${context?.paymentMethod}`
        );

        try {
            // ── Distance ────────────────────────────────────────────────────────
            let distanceKm = context.estimatedDistanceKm;

            if (!distanceKm || distanceKm <= 0) {
                distanceKm = haversineDistanceKm(
                    context.origin?.lat,
                    context.origin?.lng,
                    context.destination?.lat,
                    context.destination?.lng
                );
            }

            distanceKm = parseFloat(distanceKm.toFixed(3));

            // ── Payout Calculation ──────────────────────────────────────────────
            const payoutResult = await calculatePayout({
                distanceKm,
                vehicleType: context.vehicleType || 'all',
                deliveredAt: new Date(),  // use now for quote; actual delivery time unknown
            });

            const estimatedCost   = payoutResult.payoutAmount;
            const customerCharge  = Number(context.customerShippingCharge) || 0;
            const margin          = parseFloat((customerCharge - estimatedCost).toFixed(2));

            // ── ETA ─────────────────────────────────────────────────────────────
            const travelHours = distanceKm / AVG_SPEED_KMH;
            const etaHours    = parseFloat((SAME_DAY_BUFFER_HOURS + travelHours).toFixed(2));
            const quotedAt    = new Date();
            const etaDate     = new Date(quotedAt.getTime() + etaHours * 60 * 60 * 1000);
            const expiresAt   = new Date(quotedAt.getTime() + QUOTE_VALIDITY_MINUTES * 60 * 1000);

            const quote = {
                success:          true,
                providerId:       PROVIDER_ID,
                providerName:     PROVIDER_NAME,
                customerCharge,
                estimatedCost,
                margin,
                etaHours,
                etaDate,
                quotedAt,
                expiresAt,
                breakdown:        payoutResult.breakdown,
                appliedSurcharges: payoutResult.appliedSurcharges,
                providerMetadata: {
                    distanceKm,
                    vehicleType:      context.vehicleType || 'all',
                    rateConfigId:     payoutResult.rateConfigId,
                    configSource:     payoutResult.configSource,
                    isEmergencyDefault: payoutResult.isEmergencyDefault,
                },
                error: null,
            };

            console.log(
                `[${PROVIDER_ID}] ${method} success:`,
                `dist=${distanceKm}km`,
                `estimatedCost=₹${estimatedCost}`,
                `customerCharge=₹${customerCharge}`,
                `margin=₹${margin}`,
                `etaHours=${etaHours}`,
                `configSource=${payoutResult.configSource}`
            );

            return quote;

        } catch (err) {
            return this._internalError(err, method, {
                customerCharge: context?.customerShippingCharge || 0,
                estimatedCost:  null,
                margin:         null,
                etaHours:       null,
                etaDate:        null,
                quotedAt:       new Date(),
                expiresAt:      null,
                breakdown:      null,
                providerMetadata: {},
            });
        }
    }

    // ─── createShipment ────────────────────────────────────────────────────────

    /**
     * Creates a shipment with the own fleet.
     * For own fleet this means: trigger auto-assignment of a driver.
     *
     * PHASE 3 STUB: Returns success=true with placeholder data.
     * Phase 5 will call autoAssignDeliveryPartner() here and emit SHIPMENT_CREATED.
     *
     * @param {object} shipment - Shipment document
     */
    async createShipment(shipment) {
        const method = 'createShipment';
        console.log(`[${PROVIDER_ID}] ${method} called for shipment ${shipment?._id}`);

        try {
            // Trigger background assignment process
            autoAssignDeliveryPartner(shipment._id).catch(err => {
                console.error(`[${PROVIDER_ID}] Background assignment failed: ${err.message}`);
            });

            // Update status immediately so frontend knows it's searching for a driver
            shipment.deliveryAssignmentStatus = 'pending';
            await shipment.save();

            // Emit generic SHIPMENT_CREATED for analytics/notifications
            LogisticsEventBus.emit(LOGISTICS_EVENTS.SHIPMENT_CREATED, {
                shipmentId: shipment._id,
                orderId: shipment.orderId,
                vendorId: shipment.vendorId,
                providerId: PROVIDER_ID,
                courierName: PROVIDER_NAME,
                awbNumber: null
            });

            return {
                success:           true,
                providerId:        PROVIDER_ID,
                awbCode:           null,
                trackingUrl:       null,
                courierName:       PROVIDER_NAME,
                labelUrl:          null,
                estimatedPickupAt: null,
                providerMetadata:  { note: 'Auto-assignment triggered' },
                error:             null,
            };
        } catch (err) {
            return {
                success: false,
                providerId: PROVIDER_ID,
                error: err.message
            };
        }
    }

    // ─── cancelShipment ────────────────────────────────────────────────────────

    /**
     * Cancels an own fleet shipment.
     * For own fleet this means: unassign the driver and free their capacity.
     *
     * PHASE 3 STUB: Returns success=true.
     * Phase 5 will unassign driver, set DeliveryBoy.status = 'available', emit SHIPMENT_CANCELLED.
     *
     * @param {object} shipment - Shipment document
     */
    async cancelShipment(shipment) {
        const method = 'cancelShipment';
        console.log(`[${PROVIDER_ID}] ${method} called for shipment ${shipment?._id}`);

        try {
            if (shipment.deliveryBoyId) {
                await DeliveryBoy.findByIdAndUpdate(shipment.deliveryBoyId, {
                    isAvailable: true,
                    currentShipmentId: null
                });
            }

            LogisticsEventBus.emit(LOGISTICS_EVENTS.SHIPMENT_CANCELLED, {
                shipmentId: shipment._id,
                orderId: shipment.orderId,
                vendorId: shipment.vendorId,
                cancelledBy: 'system',
                refundRequired: false
            });

            return {
                success:    true,
                providerId: PROVIDER_ID,
                cancelled:  true,
                error:      null,
            };
        } catch (err) {
            return {
                success: false,
                providerId: PROVIDER_ID,
                cancelled: false,
                error: err.message
            };
        }
    }

    // ─── Reverse Logistics (Own Fleet) ───────────────────────────────────────

    /**
     * Checks if own fleet can service this reverse pickup.
     * A reverse pickup is serviceable if at least one approved, available driver exists.
     */
    async checkReverseServiceability(context) {
        const method = 'checkReverseServiceability';
        console.log(`[${PROVIDER_ID}] Starting ${method}`);

        try {
            const query = {
                status:             'available',
                isActive:           true,
                applicationStatus:  'approved',
            };

            const availableCount = await DeliveryBoy.countDocuments(query);

            if (availableCount === 0) {
                console.log(`[${PROVIDER_ID}] ${method}: NOT serviceable — No drivers currently available`);
                return this._serviceabilityResponse(false, 'No drivers currently available for reverse pickup');
            }

            console.log(`[${PROVIDER_ID}] ${method}: Serviceable — ${availableCount} driver(s) available`);
            return this._serviceabilityResponse(true);

        } catch (err) {
            return this._notServiceable(
                PROVIDER_ERROR_CODES.INTERNAL_ERROR,
                `Own fleet reverse serviceability check failed: ${err.message}`
            );
        }
    }

    /**
     * Creates a reverse pickup with the own fleet.
     * Triggers auto-assignment of a driver for the Return Request.
     *
     * @param {object} shipment - Reverse Shipment document
     */
    async createReversePickup(shipment) {
        const method = 'createReversePickup';
        console.log(`[${PROVIDER_ID}] ${method} called for shipment ${shipment?._id}`);

        try {
            const returnRequestId = shipment.returnRequestId || shipment.returnRequest;

            if (returnRequestId) {
                // Trigger background return pickup assignment process
                autoAssignReturnPickupPartner(returnRequestId).catch(err => {
                    console.error(`[${PROVIDER_ID}] Background return assignment failed: ${err.message}`);
                });
            } else {
                console.warn(`[${PROVIDER_ID}] ${method}: No returnRequestId found on shipment ${shipment?._id}`);
            }

            return {
                success:           true,
                providerId:        PROVIDER_ID,
                awbCode:           null,
                trackingUrl:       null,
                courierName:       PROVIDER_NAME,
                labelUrl:          null,
                estimatedPickupAt: null,
                providerMetadata:  { note: 'Reverse auto-assignment triggered' },
                error:             null,
            };
        } catch (err) {
            return {
                success: false,
                providerId: PROVIDER_ID,
                error: err.message
            };
        }
    }

    async cancelReversePickup(shipment) {
        return this._notImplemented('cancelReversePickup');
    }
}

// Export a singleton instance — same object reused across all engine invocations.
// This is safe because the adapter holds no mutable state.
const ownFleetProvider = new OwnFleetProvider();

export default ownFleetProvider;
export { OwnFleetProvider, ownFleetProvider, PROVIDER_ID as OWN_FLEET_PROVIDER_ID };
