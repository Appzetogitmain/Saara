import logger from '../utils/logger.js';
/**
 * Shiprocket API Client
 *
 * Raw HTTP client for the Shiprocket REST API.
 * This is the ONLY file that makes HTTP calls to Shiprocket.
 * All other Shiprocket code imports from this file.
 *
 * ─── Architecture Rules ──────────────────────────────────────────────────────
 *
 * 1. ISOLATION: No business logic lives here. This file only translates HTTP
 *    requests and responses. All business decisions belong in shiprocket.provider.js.
 *
 * 2. MOCK MODE: When config.mockMode === true (default), all methods return
 *    realistic deterministic simulated responses — zero real HTTP calls are made.
 *    Switching to live mode: set config.mockMode = false and provide credentials.
 *
 * 3. ERROR SAFETY: Every public method returns a { success, data, error } envelope.
 *    Callers NEVER need to wrap calls in try/catch. All exceptions are caught here.
 *
 * 4. TOKEN CACHING: JWT tokens are cached in memory with an expiry check.
 *    Tokens are valid for 10 days (Shiprocket default). Cache is per-singleton instance.
 *    On 401, the token is cleared and re-fetched once (one retry per request).
 *
 * 5. TIMEOUT: All live requests time out at REQUEST_TIMEOUT_MS (default 8000ms).
 *    In mock mode, responses are instantaneous (0ms network latency).
 *
 * ─── Base URLs ────────────────────────────────────────────────────────────────
 * Auth:    POST https://apiv2.shiprocket.in/v1/external/auth/login
 * Rate:    GET  https://apiv2.shiprocket.in/v1/external/courier/serviceability/
 * Order:   POST https://apiv2.shiprocket.in/v1/external/orders/create/adhoc
 * AWB:     POST https://apiv2.shiprocket.in/v1/external/courier/assign/awb
 * Label:   POST https://apiv2.shiprocket.in/v1/external/courier/generate/label
 * Pickup:  POST https://apiv2.shiprocket.in/v1/external/courier/generate/pickup
 * Cancel:  POST https://apiv2.shiprocket.in/v1/external/orders/cancel
 * Track:   GET  https://apiv2.shiprocket.in/v1/external/courier/track/awb/{awb_code}
 *
 * ─── Token Lifecycle ──────────────────────────────────────────────────────────
 * 1. First request: fetch token (POST /auth/login)
 * 2. Cache token in memory with expiresAt = now + 9 days (1-day safety margin)
 * 3. Each request: check cache. If valid → use it. If expired → re-fetch.
 * 4. On 401 response: invalidate cache, re-fetch once, retry the original request.
 */

import { PROVIDER_ERROR_CODES } from '../providers/providerInterface.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE_URL             = 'https://apiv2.shiprocket.in/v1/external';
const REQUEST_TIMEOUT_MS   = Number(process.env.SHIPROCKET_TIMEOUT_MS) || 8000;
const TOKEN_VALIDITY_DAYS  = 9;   // Shiprocket tokens last 10 days; we refresh after 9
const COD_SURCHARGE_RATE   = 0.018;  // 1.8% — Shiprocket standard COD charge

// ─── Mock Response Generators ─────────────────────────────────────────────────
// All mock responses are deterministic and realistic.
// They simulate actual Shiprocket API shapes and courier options.

/**
 * Generates a realistic Shiprocket serviceability response.
 * Used in mock mode for checkServiceability() and rate calls.
 *
 * @param {string} pickupPincode
 * @param {string} deliveryPincode
 * @param {number} weightGrams
 * @param {boolean} isCod
 */
const generateMockRateResponse = (pickupPincode, deliveryPincode, weightGrams, isCod) => {
    const weightKg = (weightGrams / 1000).toFixed(2);

    // Simulate non-serviceable pincodes (edge cases for testing)
    const UNSERVICEABLE_PINCODES = ['999999', '000000'];
    if (UNSERVICEABLE_PINCODES.includes(String(deliveryPincode))) {
        return {
            status:      200,
            data:        [],
            message:     'No courier available for this pincode',
            serviceable: false,
        };
    }

    // Determine if same city/state (first 3 digits of pincode as a proxy)
    const isSameCity  = String(pickupPincode).slice(0, 4) === String(deliveryPincode).slice(0, 4);
    const isSameState = String(pickupPincode).slice(0, 2) === String(deliveryPincode).slice(0, 2);

    // Base rates vary by zone (hyper-local, same state, interstate)
    const zoneMultiplier = isSameCity ? 1.0 : isSameState ? 1.4 : 1.9;
    const baseRatePerKg  = 35;  // ₹35/500g base for air mode
    const baseRateSurface = 28; // ₹28/500g for surface mode

    // Simulate 3 courier options that Shiprocket typically returns
    const couriers = [
        {
            courier_company_id:    5,
            courier_name:          'Delhivery Surface',
            courier_type:          2,   // 2 = surface
            rate:                  parseFloat((baseRateSurface * zoneMultiplier * Math.max(1, weightGrams / 500)).toFixed(2)),
            etd:                   isSameCity ? '1 Days' : isSameState ? '3 Days' : '5 Days',
            estimated_delivery_days: isSameCity ? 1 : isSameState ? 3 : 5,
            cod:                   isCod ? 1 : 0,
            cod_charges:           isCod ? parseFloat((baseRateSurface * zoneMultiplier * 0.018).toFixed(2)) : 0,
            freight_charge:        parseFloat((baseRateSurface * zoneMultiplier * Math.max(1, weightGrams / 500)).toFixed(2)),
            min_weight:            0.5,
            is_surface:            1,
            is_return:             1,
            city:                  'Delhi',
            is_hyperlocal:         0,
        },
        {
            courier_company_id:    1,
            courier_name:          'DTDC Air',
            courier_type:          1,   // 1 = air
            rate:                  parseFloat((baseRatePerKg * zoneMultiplier * Math.max(1, weightGrams / 500)).toFixed(2)),
            etd:                   isSameCity ? '1 Days' : isSameState ? '2 Days' : '3 Days',
            estimated_delivery_days: isSameCity ? 1 : isSameState ? 2 : 3,
            cod:                   isCod ? 1 : 0,
            cod_charges:           isCod ? parseFloat((baseRatePerKg * zoneMultiplier * 0.018).toFixed(2)) : 0,
            freight_charge:        parseFloat((baseRatePerKg * zoneMultiplier * Math.max(1, weightGrams / 500)).toFixed(2)),
            min_weight:            0.5,
            is_surface:            0,
            is_return:             1,
            city:                  'Delhi',
            is_hyperlocal:         0,
        },
        {
            courier_company_id:    2,
            courier_name:          'Blue Dart Express',
            courier_type:          1,
            rate:                  parseFloat((baseRatePerKg * zoneMultiplier * 1.3 * Math.max(1, weightGrams / 500)).toFixed(2)),
            etd:                   isSameCity ? '1 Days' : isSameState ? '1 Days' : '2 Days',
            estimated_delivery_days: isSameCity ? 1 : isSameState ? 1 : 2,
            cod:                   0,   // Blue Dart doesn't always support COD
            cod_charges:           0,
            freight_charge:        parseFloat((baseRatePerKg * zoneMultiplier * 1.3 * Math.max(1, weightGrams / 500)).toFixed(2)),
            min_weight:            0.5,
            is_surface:            0,
            is_return:             0,
            city:                  'Delhi',
            is_hyperlocal:         0,
        },
    ];

    // Filter out couriers that don't support COD when required
    const availableCouriers = isCod
        ? couriers.filter(c => c.cod === 1)
        : couriers;

    return {
        status:           200,
        serviceable:      availableCouriers.length > 0,
        pickup_available: true,
        delivery_codes:   availableCouriers.map(c => ({
            courier_data: {
                ...c,
                weight:   weightKg,
                surface_max_weight: '100',
            },
        })),
    };
};

/**
 * Generates a mock auth token response.
 */
const generateMockTokenResponse = (email) => ({
    id:         9999,
    first_name: 'Mock',
    last_name:  'Platform',
    email,
    company_id: 8888,
    token:      `MOCK_TOKEN_${Date.now()}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
});

// ─── Shiprocket API Client ─────────────────────────────────────────────────────

class ShiprocketApiClient {
    /**
     * @param {object} config - Provider config from LogisticsProvider.config
     * @param {string}  config.email
     * @param {string}  config.password
     * @param {boolean} config.mockMode     - If true, skip real HTTP calls
     * @param {number}  [config.channelId]  - Shiprocket channel ID (optional)
     */
    constructor(config = {}) {
        this._config    = config;
        this._mockMode  = config.mockMode !== false;   // default: mock mode ON
        this._token     = null;
        this._tokenExpiresAt = null;
    }

    // ─── Token Management ─────────────────────────────────────────────────────

    /**
     * Returns a valid Bearer token, fetching/refreshing as needed.
     * In mock mode, always returns a fake token without making HTTP calls.
     *
     * @returns {Promise<string>} Bearer token
     */
    async _getToken() {
        // Mock mode: return a fake token immediately
        if (this._mockMode) {
            if (!this._token) {
                const resp = generateMockTokenResponse(this._config.email || 'mock@platform.com');
                this._token          = resp.token;
                this._tokenExpiresAt = Date.now() + TOKEN_VALIDITY_DAYS * 24 * 60 * 60 * 1000;
                console.log(`[shiprocket.api] Mock token issued: ${this._token.slice(0, 30)}...`);
            }
            return this._token;
        }

        // Live mode: check cache, re-fetch if expired
        const now = Date.now();
        if (this._token && this._tokenExpiresAt && now < this._tokenExpiresAt) {
            return this._token;
        }

        console.log('[shiprocket.api] Fetching new auth token...');
        const result = await this._fetchToken();
        if (!result.success) {
            throw new Error(`Shiprocket auth failed: ${result.error?.message}`);
        }

        this._token          = result.data.token;
        this._tokenExpiresAt = now + TOKEN_VALIDITY_DAYS * 24 * 60 * 60 * 1000;
        console.log('[shiprocket.api] Token cached. Expires:', new Date(this._tokenExpiresAt).toISOString());
        return this._token;
    }

    /**
     * Invalidates the cached token (called on 401 responses).
     */
    _invalidateToken() {
        console.log('[shiprocket.api] Token invalidated (will re-fetch on next call)');
        this._token          = null;
        this._tokenExpiresAt = null;
    }

    /**
     * Fetch a new token from Shiprocket (live mode only).
     * @returns {Promise<{ success, data, error }>}
     */
    async _fetchToken() {
        try {
            const resp = await this._httpRequest('POST', '/auth/login', {
                email:    this._config.email,
                password: this._config.password,
            }, { skipAuth: true });
            return resp;
        } catch (err) {
            return {
                success: false,
                data:    null,
                error:   { code: PROVIDER_ERROR_CODES.AUTH_FAILED, message: err.message },
            };
        }
    }

    // ─── HTTP Request Helper ──────────────────────────────────────────────────

    /**
     * Core HTTP request method. All live API calls go through here.
     * Never called in mock mode.
     *
     * @param {string}  method       - HTTP method ('GET', 'POST', etc.)
     * @param {string}  path         - API path (e.g., '/auth/login')
     * @param {object}  [body]       - Request body (JSON)
     * @param {object}  [options]
     * @param {boolean} [options.skipAuth]   - If true, don't attach Bearer token
     * @param {object}  [options.params]     - Query string parameters (GET requests)
     * @param {boolean} [options.isRetry]    - True if this is a 401-retry attempt
     * @returns {Promise<{ success, data, error }>}
     */
    async _httpRequest(method, path, body = null, options = {}) {
        const controller = new AbortController();
        const timeoutId  = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        try {
            const headers = { 'Content-Type': 'application/json' };

            if (!options.skipAuth) {
                const token = await this._getToken();
                headers['Authorization'] = `Bearer ${token}`;
            }

            // Build URL with query params for GET requests
            let url = `${BASE_URL}${path}`;
            if (options.params && Object.keys(options.params).length > 0) {
                const qs = new URLSearchParams(options.params).toString();
                url = `${url}?${qs}`;
            }

            const fetchOptions = {
                method,
                headers,
                signal: controller.signal,
            };
            if (body && method !== 'GET') {
                fetchOptions.body = JSON.stringify(body);
            }

            const response = await fetch(url, fetchOptions);

            // Handle 401 — token expired or invalid
            if (response.status === 401 && !options.isRetry) {
                this._invalidateToken();
                return this._httpRequest(method, path, body, { ...options, isRetry: true });
            }

            const data = await response.json();

            if (!response.ok) {
                return {
                    success: false,
                    data:    null,
                    error: {
                        code:    response.status === 401 ? PROVIDER_ERROR_CODES.AUTH_FAILED : PROVIDER_ERROR_CODES.API_ERROR,
                        message: data?.message || `HTTP ${response.status}`,
                    },
                };
            }

            return { success: true, data, error: null };

        } catch (err) {
            if (err.name === 'AbortError') {
                return {
                    success: false,
                    data:    null,
                    error: { code: PROVIDER_ERROR_CODES.API_TIMEOUT, message: `Shiprocket API timed out after ${REQUEST_TIMEOUT_MS}ms` },
                };
            }
            return {
                success: false,
                data:    null,
                error: { code: PROVIDER_ERROR_CODES.API_ERROR, message: err.message },
            };
        } finally {
            clearTimeout(timeoutId);
        }
    }

    // ─── Public API Methods ───────────────────────────────────────────────────

    /**
     * Check courier serviceability and get rate quotes.
     *
     * Uses the combined Courier Serviceability API which returns both
     * serviceability and rate quotes in a single call:
     *   GET /courier/serviceability/?pickup_postcode=...&delivery_postcode=...&weight=...&cod=...
     *
     * @param {string|number} pickupPincode
     * @param {string|number} deliveryPincode
     * @param {number}        weightGrams      - Package weight in grams
     * @param {boolean}       isCod            - true for Cash on Delivery orders
     * @returns {Promise<{ success, data: { couriers, serviceable }, error }>}
     */
    async checkServiceability(pickupPincode, deliveryPincode, weightGrams, isCod) {
        console.log(
            `[shiprocket.api] checkServiceability:`,
            `pickup=${pickupPincode}`,
            `delivery=${deliveryPincode}`,
            `weight=${weightGrams}g`,
            `cod=${isCod}`,
            `mode=${this._mockMode ? 'MOCK' : 'LIVE'}`
        );

        try {
            // ── Mock Mode ──────────────────────────────────────────────────────
            if (this._mockMode) {
                // Ensure token is "issued" (for test traceability)
                await this._getToken();

                const mockResp = generateMockRateResponse(pickupPincode, deliveryPincode, weightGrams, isCod);

                if (!mockResp.serviceable || !mockResp.delivery_codes?.length) {
                    return {
                        success: true,
                        data:    { couriers: [], serviceable: false },
                        error:   null,
                    };
                }

                const couriers = mockResp.delivery_codes.map(d => d.courier_data);
                return {
                    success: true,
                    data:    { couriers, serviceable: true },
                    error:   null,
                };
            }

            // ── Live Mode ──────────────────────────────────────────────────────
            const weightKg = (weightGrams / 1000).toFixed(2);
            const result = await this._httpRequest('GET', '/courier/serviceability/', null, {
                params: {
                    pickup_postcode:   String(pickupPincode),
                    delivery_postcode: String(deliveryPincode),
                    weight:            weightKg,
                    cod:               isCod ? 1 : 0,
                },
            });

            if (!result.success) return { success: false, data: null, error: result.error };

            const deliveryCodes = result.data?.data?.available_courier_companies || [];
            const serviceable   = deliveryCodes.length > 0;
            const couriers      = deliveryCodes;

            return {
                success: true,
                data:    { couriers, serviceable },
                error:   null,
            };

        } catch (err) {
            logger.error('[shiprocket.api] checkServiceability error:', err.message);
            return {
                success: false,
                data:    null,
                error:   { code: PROVIDER_ERROR_CODES.INTERNAL_ERROR, message: err.message },
            };
        }
    }

    async createOrder(payload) {
        console.log(`[shiprocket.api] createOrder called (mockMode=${this._mockMode})`);

        if (this._mockMode) {
            return {
                success: true,
                data: {
                    order_id:             Math.floor(Math.random() * 10000000),
                    channel_order_id:     payload?.order_id || `MOCK-${Date.now()}`,
                    shipment_id:          Math.floor(Math.random() * 10000000),
                    status:               'NEW',
                    status_code:          1,
                    onboarding_completed_now: false,
                    awb_code:             null,
                    courier_company_id:   null,
                    courier_name:         null,
                    note:                 'Mock mode createOrder',
                },
                error: null,
            };
        }

        const result = await this._httpRequest('POST', '/orders/create/adhoc', payload);
        return result;
    }

    async createReturnOrder(payload) {
        console.log(`[shiprocket.api] createReturnOrder called (mockMode=${this._mockMode})`);

        if (this._mockMode) {
            return {
                success: true,
                data: {
                    order_id:             Math.floor(Math.random() * 10000000),
                    channel_order_id:     payload?.order_id || `MOCK-RET-${Date.now()}`,
                    shipment_id:          Math.floor(Math.random() * 10000000),
                    status:               'NEW',
                    status_code:          1,
                    onboarding_completed_now: false,
                    awb_code:             null,
                    courier_company_id:   null,
                    courier_name:         null,
                    note:                 'Mock mode createReturnOrder',
                },
                error: null,
            };
        }

        // Shiprocket Return Order endpoint
        const result = await this._httpRequest('POST', '/orders/create/return', payload);
        return result;
    }


    async generateAWB(shiprocketShipmentId, courierId) {
        console.log(`[shiprocket.api] generateAWB called (shipmentId=${shiprocketShipmentId})`);

        if (this._mockMode) {
            return {
                success: true,
                data: {
                    awb_assign_status: 1,
                    response: {
                        data: {
                            awb_code:     `AWB${Date.now()}${Math.floor(Math.random() * 1000)}`,
                            courier_name: 'Mock Courier',
                        },
                    },
                },
                error: null,
            };
        }

        const result = await this._httpRequest('POST', '/courier/assign/awb', {
            shipment_id: shiprocketShipmentId,
            courier_id: courierId
        });
        return result;
    }

    async generateLabel(shiprocketShipmentId) {
        console.log(`[shiprocket.api] generateLabel called (shipmentId=${shiprocketShipmentId})`);

        if (this._mockMode) {
            return {
                success: true,
                data: {
                    label_created:  1,
                    label_url:      'https://mock.shiprocket.in/label.pdf',
                },
                error: null,
            };
        }

        const result = await this._httpRequest('POST', '/courier/generate/label', {
            shipment_id: [shiprocketShipmentId]
        });
        return result;
    }

    /**
     * Schedule a pickup with Shiprocket.
     *
     * PHASE 4 STUB: Returns a mock scheduled pickup confirmation.
     * Phase 6 will implement: POST /courier/generate/pickup
     *
     * @param {string|number} shiprocketShipmentId
     * @returns {Promise<{ success, data, error }>}
     */
    async schedulePickup(shiprocketShipmentId) {
        console.log(`[shiprocket.api] schedulePickup called (Phase 4 stub, shipmentId=${shiprocketShipmentId})`);

        return {
            success: true,
            data: {
                pickup_scheduled_date: null,
                response: {
                    pickup_scheduled_date: null,
                    message: 'Phase 4 stub — schedulePickup activated in Phase 6',
                },
                note: 'Phase 4 stub — schedulePickup activated in Phase 6',
            },
            error: null,
        };
    }

    async cancelOrder(shiprocketOrderIds) {
        console.log(`[shiprocket.api] cancelOrder called (orderIds=${JSON.stringify(shiprocketOrderIds)})`);

        if (this._mockMode) {
            return {
                success: true,
                data: {
                    message:  'Order cancelled successfully',
                    status: 200
                },
                error: null,
            };
        }

        const result = await this._httpRequest('POST', '/orders/cancel/routines', {
            ids: shiprocketOrderIds
        });
        return result;
    }

    /**
     * Track a shipment by AWB code.
     *
     * PHASE 4 STUB: Returns a mock tracking status.
     * Phase 6 will implement: GET /courier/track/awb/{awb_code}
     *
     * @param {string} awbCode
     * @returns {Promise<{ success, data, error }>}
     */
    async trackShipment(awbCode) {
        console.log(`[shiprocket.api] trackShipment called (Phase 4 stub, awb=${awbCode})`);

        return {
            success: true,
            data: {
                awb_code:       awbCode,
                current_status: 'PICKUP PENDING',
                shipment_track: [],
                note:           'Phase 4 stub — trackShipment activated in Phase 6',
            },
            error: null,
        };
    }

    // ─── Utility Accessors ────────────────────────────────────────────────────

    /** Returns true if the client is in mock mode */
    get isMockMode()       { return this._mockMode; }

    /** Returns COD surcharge rate (constant for now; can be made configurable) */
    get codSurchargeRate() { return COD_SURCHARGE_RATE; }

    /** Returns true if a token is currently cached and valid */
    get hasValidToken()    {
        return !!(this._token && this._tokenExpiresAt && Date.now() < this._tokenExpiresAt);
    }
}

// ─── Factory Function ──────────────────────────────────────────────────────────
//
// The engine provides the LogisticsProvider config when calling provider methods.
// The provider adapter (shiprocket.provider.js) creates a client instance per call
// using this factory, OR maintains a singleton if the config is stable.
//
// For Phase 4: the provider creates a singleton from the DB config.
// For Phase 6+: config hot-reload (admin changes credentials) can invalidate and
// recreate the singleton without restarting the server.

/**
 * Create a ShiprocketApiClient from a LogisticsProvider config object.
 * @param {object} config - LogisticsProvider.config document
 * @returns {ShiprocketApiClient}
 */
const createShiprocketClient = (config = {}) => {
    return new ShiprocketApiClient(config);
};

export default createShiprocketClient;
export { ShiprocketApiClient, createShiprocketClient, COD_SURCHARGE_RATE };
