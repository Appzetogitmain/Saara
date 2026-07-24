/**
 * Provider Interface — Abstract Contract for All Logistics Providers
 *
 * Every logistics provider (Own Fleet, Shiprocket, Delhivery, Porter, etc.) MUST
 * implement this interface. The Delivery Engine only ever calls methods defined here,
 * which guarantees that swapping or adding a provider requires zero changes to the engine.
 *
 * ─── Architecture Rules ──────────────────────────────────────────────────────
 * 1. Provider implementations MUST NOT contain business logic.
 *    Business logic belongs in deliveryEngine.service.js.
 *    Providers only: check serviceability, get quotes, create/cancel shipments,
 *    and translate provider-specific formats into this common interface.
 *
 * 2. Providers MUST NOT throw unhandled exceptions.
 *    All methods return a standardised { success, error } envelope.
 *    Callers never need to wrap provider calls in try/catch.
 *
 * 3. Provider-specific formats and mappings MUST stay inside the provider.
 *    The engine and all other services receive only the standardised schemas defined here.
 *
 * 4. Credentials and provider-specific configuration MUST be read from
 *    LogisticsProvider.config (loaded by the engine) and never hardcoded.
 *
 * ─── Standardised Schemas ────────────────────────────────────────────────────
 *
 * Context object (passed to getQuote and checkServiceability):
 * {
 *   // Origin = vendor warehouse
 *   origin: {
 *     pincode:   string,
 *     city:      string,
 *     state:     string,
 *     lat?:      number,   // optional latitude
 *     lng?:      number,   // optional longitude
 *   },
 *   // Destination = customer address
 *   destination: {
 *     pincode:   string,
 *     city:      string,
 *     state:     string,
 *     lat?:      number,
 *     lng?:      number,
 *   },
 *   packageWeight:      number,   // grams
 *   packageDimensions?: { length: number, breadth: number, height: number },
 *   paymentMethod:      'cod' | 'online' | 'wallet',
 *   customerShippingCharge: number,  // what the customer pays (already decided)
 *   estimatedDistanceKm?:  number,   // pre-computed distance if available
 *   vehicleType?:          string,   // hint for own fleet payout calculator
 *   vendorId:   string,
 *   orderId?:   string,
 * }
 *
 * Quote response (returned by getQuote):
 * {
 *   success:         boolean,
 *   providerId:      string,
 *   providerName:    string,
 *   customerCharge:  number,   // what customer pays (passed through from context)
 *   estimatedCost:   number,   // platform's expected cost (driver payout / courier invoice)
 *   margin:          number,   // customerCharge - estimatedCost
 *   etaHours:        number,   // estimated delivery time from pickup
 *   etaDate:         Date,     // absolute estimated delivery date
 *   quotedAt:        Date,
 *   expiresAt:       Date,     // quote validity window (e.g., 30 minutes)
 *   breakdown?:      object,   // provider-specific cost breakdown (own fleet: payout breakdown)
 *   providerMetadata?: object, // raw provider response (for storage in DeliveryEngineRun)
 *   error:           null | { code: string, message: string },
 * }
 *
 * Serviceability response (returned by checkServiceability):
 * {
 *   success:      boolean,
 *   serviceable:  boolean,
 *   providerId:   string,
 *   providerName: string,
 *   reason:       string | null,   // null if serviceable; error/reason if not
 *   checkedAt:    Date,
 *   error:        null | { code: string, message: string },
 * }
 *
 * Create shipment response (returned by createShipment):
 * {
 *   success:          boolean,
 *   providerId:       string,
 *   awbCode:          string | null,
 *   trackingUrl:      string | null,
 *   courierName:      string | null,
 *   labelUrl:         string | null,
 *   estimatedPickupAt: Date | null,
 *   providerMetadata: object,   // raw provider response
 *   error:            null | { code: string, message: string },
 * }
 *
 * Cancel shipment response (returned by cancelShipment):
 * {
 *   success:    boolean,
 *   providerId: string,
 *   cancelled:  boolean,
 *   error:      null | { code: string, message: string },
 * }
 */

/**
 * Error codes used in standardised error envelopes.
 * Providers should use these codes where they apply.
 * Custom provider-specific codes are allowed but must be prefixed with the provider ID.
 */
const PROVIDER_ERROR_CODES = Object.freeze({
    NOT_SERVICEABLE:        'NOT_SERVICEABLE',         // pincode/area not covered
    NO_DRIVERS_AVAILABLE:   'NO_DRIVERS_AVAILABLE',    // own fleet: no driver found
    COD_NOT_SUPPORTED:      'COD_NOT_SUPPORTED',       // provider does not support COD
    WEIGHT_EXCEEDED:        'WEIGHT_EXCEEDED',          // package over provider limit
    API_ERROR:              'API_ERROR',                // external API call failed
    API_TIMEOUT:            'API_TIMEOUT',              // external API timed out
    AUTH_FAILED:            'AUTH_FAILED',              // provider credential error
    SHIPMENT_NOT_FOUND:     'SHIPMENT_NOT_FOUND',       // AWB not found for cancel
    NOT_IMPLEMENTED:        'NOT_IMPLEMENTED',          // base class called directly
    INTERNAL_ERROR:         'INTERNAL_ERROR',           // unexpected error inside adapter
});

/**
 * BaseProvider — Abstract base class.
 *
 * Do NOT instantiate this class directly.
 * Do NOT call its methods directly.
 * Extend this class in every provider adapter and override all methods.
 */
class BaseProvider {
    /**
     * @param {string} providerId   - Unique provider ID (matches LogisticsProvider.providerId)
     * @param {string} providerName - Human-readable display name
     */
    constructor(providerId, providerName) {
        if (new.target === BaseProvider) {
            throw new Error(
                'BaseProvider cannot be instantiated directly. ' +
                'Extend it and implement all required methods.'
            );
        }
        this.providerId   = providerId;
        this.providerName = providerName;
    }

    // ─── Methods to Override ──────────────────────────────────────────────────

    /**
     * Check if the provider can deliver from origin to destination.
     * Should return quickly — this is called before getQuote() as a hard filter.
     *
     * @param {object} context - Standard delivery context object (see schema above)
     * @returns {Promise<ServiceabilityResponse>}
     */
    async checkServiceability(context) {   // eslint-disable-line no-unused-vars
        return this._notImplemented('checkServiceability');
    }

    /**
     * Get a delivery quote for the given context.
     * Should return estimated cost, ETA, and margin.
     * Must NOT create any shipment or persist anything.
     *
     * @param {object} context - Standard delivery context object (see schema above)
     * @returns {Promise<QuoteResponse>}
     */
    async getQuote(context) {   // eslint-disable-line no-unused-vars
        return this._notImplemented('getQuote');
    }

    /**
     * Create a shipment with the provider.
     * Called by shipmentService.handleReadyForPickup() — NOT at checkout.
     *
     * @param {object} shipment - Shipment document from the DB
     * @returns {Promise<CreateShipmentResponse>}
     */
    async createShipment(shipment) {   // eslint-disable-line no-unused-vars
        return this._notImplemented('createShipment');
    }

    /**
     * Cancel a shipment with the provider.
     *
     * @param {object} shipment - Shipment document from the DB
     * @returns {Promise<CancelShipmentResponse>}
     */
    async cancelShipment(shipment) {   // eslint-disable-line no-unused-vars
        return this._notImplemented('cancelShipment');
    }

    /**
     * Check if the provider can execute a reverse pickup from customer to vendor.
     *
     * @param {object} context - Standard delivery context object
     * @returns {Promise<ServiceabilityResponse>}
     */
    async checkReverseServiceability(context) {   // eslint-disable-line no-unused-vars
        return this._notImplemented('checkReverseServiceability');
    }

    /**
     * Create a reverse pickup shipment with the provider.
     *
     * @param {object} shipment - Reverse Shipment document from the DB
     * @returns {Promise<CreateShipmentResponse>}
     */
    async createReversePickup(shipment) {   // eslint-disable-line no-unused-vars
        return this._notImplemented('createReversePickup');
    }

    /**
     * Cancel a reverse pickup shipment with the provider.
     *
     * @param {object} shipment - Reverse Shipment document from the DB
     * @returns {Promise<CancelShipmentResponse>}
     */
    async cancelReversePickup(shipment) {   // eslint-disable-line no-unused-vars
        return this._notImplemented('cancelReversePickup');
    }

    // ─── Helpers (available to all subclasses) ────────────────────────────────

    /**
     * Build a standardised NOT_IMPLEMENTED error response.
     * Used as the default return from all base class methods.
     * @private
     */
    _notImplemented(methodName) {
        const err = {
            code:    PROVIDER_ERROR_CODES.NOT_IMPLEMENTED,
            message: `${this.constructor.name}.${methodName}() is not implemented.`,
        };
        return {
            success:     false,
            providerId:  this.providerId,
            providerName: this.providerName,
            error:       err,
        };
    }

    /**
     * Build a standardised internal error response from a caught exception.
     * Providers should use this in their catch blocks.
     *
     * @param {Error}  err         - The caught error
     * @param {string} methodName  - The method where the error occurred (for logging)
     * @param {object} extra       - Any additional fields to merge into the response
     */
    _internalError(err, methodName, extra = {}) {
        console.error(
            `[${this.providerId}] Error in ${methodName}():`,
            err?.message || err
        );
        return {
            success:      false,
            providerId:   this.providerId,
            providerName: this.providerName,
            error: {
                code:    PROVIDER_ERROR_CODES.INTERNAL_ERROR,
                message: err?.message || 'An unexpected error occurred.',
            },
            ...extra,
        };
    }

    /**
     * Build a standardised serviceability response.
     * @param {boolean} serviceable
     * @param {string|null} reason - Required if not serviceable
     */
    _serviceabilityResponse(serviceable, reason = null) {
        return {
            success:      true,
            serviceable,
            providerId:   this.providerId,
            providerName: this.providerName,
            reason:       serviceable ? null : reason,
            checkedAt:    new Date(),
            error:        null,
        };
    }

    /**
     * Build a standardised not-serviceable response with an error code.
     * Distinct from _serviceabilityResponse(false) — use this for hard errors
     * (e.g., API failure during serviceability check).
     */
    _notServiceable(code, message) {
        return {
            success:      false,
            serviceable:  false,
            providerId:   this.providerId,
            providerName: this.providerName,
            reason:       message,
            checkedAt:    new Date(),
            error:        { code, message },
        };
    }
}

export default BaseProvider;
export { BaseProvider, PROVIDER_ERROR_CODES };
