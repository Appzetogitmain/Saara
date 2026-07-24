/**
 * Shiprocket Provider Adapter
 *
 * Implements the BaseProvider interface for Shiprocket courier integration.
 * This adapter is the ONLY place where Shiprocket-specific response formats,
 * field names, and business rules are handled. Nothing Shiprocket-specific
 * ever leaves this file.
 *
 * ─── Architecture Rules ──────────────────────────────────────────────────────
 *
 * 1. ISOLATION: All Shiprocket response translation happens here. The engine,
 *    event bus, and all other services only ever see the standardised
 *    providerInterface.js schemas.
 *
 * 2. NO BUSINESS LOGIC: This adapter does not decide whether Shiprocket should
 *    be selected. It only answers "Can Shiprocket deliver this?" and
 *    "What does Shiprocket charge?" — selection belongs to the engine.
 *
 * 3. CONFIG LOADING: Non-sensitive operational config (strategy, mockMode, channelId)
 *    is loaded lazily from the LogisticsProvider DB record (providerId='shiprocket')
 *    and cached per-process with a 5-minute TTL.
 *
 *    Credentials are NEVER stored in the database. They are read from environment
 *    variables at config load time:
 *      SHIPROCKET_EMAIL     — Shiprocket API authentication email
 *      SHIPROCKET_PASSWORD  — Shiprocket API authentication password
 *
 *    Hot-reload is supported: call shiprocketProvider.reloadConfig() to force
 *    a fresh DB read and credential injection on the next adapter call.
 *
 * 4. API CLIENT: A single ShiprocketApiClient instance is held per config load.
 *    In mock mode (config.mockMode = true) no real HTTP calls are made.
 *
 * 5. COURIER SELECTION: Shiprocket returns multiple courier options. The adapter
 *    selects one according to config.courierSelectionStrategy:
 *      'lowest_cost'  (default) — pick the courier with the lowest rate
 *      'fastest_eta'             — pick the courier with fewest delivery days
 *    The selection is entirely internal — the engine receives a single quote.
 *
 * 6. GRACEFUL FAILURE: Every method returns a standardised error envelope.
 *    No method ever throws. All exceptions are caught and wrapped.
 *
 * ─── Courier Selection Strategy ──────────────────────────────────────────────
 *
 *   Shiprocket returns N courier options per rate call.
 *   We pick ONE to quote to the engine using courierSelectionStrategy.
 *
 *   If strategy is unknown, 'lowest_cost' is used as fallback.
 *   If no couriers are returned, the adapter returns NOT_SERVICEABLE.
 *
 * ─── COD Handling ────────────────────────────────────────────────────────────
 *
 *   Shiprocket charges a COD surcharge (~1.8%) in addition to the freight charge.
 *   estimatedCost = freight_charge + cod_charges (already included in courier.rate
 *   for COD routes in the mock; extracted from courier.cod_charges for live).
 *
 * ─── Quote Validity ───────────────────────────────────────────────────────────
 *
 *   Quotes expire after QUOTE_VALIDITY_MINUTES (30 minutes).
 *   After expiry the checkout UI should re-call /api/shipping/estimate.
 *
 * ─── Phase Activation ────────────────────────────────────────────────────────
 *
 *   Phase 4 (now):    checkServiceability + getQuote ACTIVE (mock mode)
 *   Phase 5 (now):    Credentials moved to env vars (SHIPROCKET_EMAIL / SHIPROCKET_PASSWORD)
 *   Phase 6 (later):  createShipment + cancelShipment activated with live credentials
 *
 * ─── Activation Checklist ────────────────────────────────────────────────────
 *
 *   To switch from mock to live Shiprocket:
 *   1. Set SHIPROCKET_EMAIL=<your_email>     in environment / .env
 *   2. Set SHIPROCKET_PASSWORD=<your_pass>   in environment / .env
 *   3. Update DB:  config.mockMode = false
 *   4. Update DB:  isEnabled = true
 *   No code changes are needed.
 */

import { BaseProvider, PROVIDER_ERROR_CODES } from './providerInterface.js';
import { createShiprocketClient }              from '../services/shiprocket.api.js';
import LogisticsProvider                       from '../models/LogisticsProvider.model.js';
import Order                                   from '../models/Order.model.js';
import Vendor                                  from '../models/Vendor.model.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const PROVIDER_ID            = 'shiprocket';
const PROVIDER_NAME          = 'Shiprocket';
const QUOTE_VALIDITY_MINUTES = 30;
const CONFIG_CACHE_TTL_MS    = 5 * 60 * 1000;   // re-read DB config every 5 minutes

// COD surcharge applied when courier.cod_charges is not available in response
const DEFAULT_COD_SURCHARGE = 0.018;   // 1.8%

// Courier selection strategies
const STRATEGIES = Object.freeze({
    LOWEST_COST: 'lowest_cost',
    FASTEST_ETA: 'fastest_eta',
});

// ─── Shiprocket Provider ──────────────────────────────────────────────────────

class ShiprocketProvider extends BaseProvider {

    constructor() {
        super(PROVIDER_ID, PROVIDER_NAME);

        // Lazy-loaded config cache
        this._apiClient       = null;
        this._config          = null;
        this._configLoadedAt  = null;
        this._configLoading   = null;   // in-flight promise guard (prevents parallel DB reads)
    }

    // ─── Config Loading ────────────────────────────────────────────────────────

    /**
     * Load (or return cached) operational config from the LogisticsProvider DB record
     * and inject credentials from environment variables.
     *
     * ─── Credential Injection (Phase 5.0) ─────────────────────────────────────
     * Credentials are NEVER stored in the database. They are read from:
     *   process.env.SHIPROCKET_EMAIL
     *   process.env.SHIPROCKET_PASSWORD
     *
     * If credentials are missing and mockMode is false, a warning is logged.
     * The adapter will still construct the client — the first real API call will
     * fail with an authentication error, which is surfaced as a provider error
     * (graceful failure, never a crash).
     *
     * ─── Cache ────────────────────────────────────────────────────────────────
     * Uses a 5-minute TTL cache. Thread-safe via in-flight promise guard.
     *
     * @returns {Promise<object>} Merged config: DB operational settings + env credentials
     */
    async _loadConfig() {
        const now = Date.now();

        // Return cached config if still fresh
        if (this._config && this._configLoadedAt && (now - this._configLoadedAt) < CONFIG_CACHE_TTL_MS) {
            return this._config;
        }

        // Prevent parallel DB reads on concurrent first calls
        if (this._configLoading) {
            return this._configLoading;
        }

        this._configLoading = (async () => {
            try {
                // 1. Load non-sensitive operational config from DB
                const doc = await LogisticsProvider
                    .findOne({ providerId: PROVIDER_ID })
                    .select('+config')   // config has { select: false } — must opt-in
                    .lean();
                const dbConfig = doc?.config || {};

                // Default to mock mode if not explicitly set to false
                if (dbConfig.mockMode === undefined) dbConfig.mockMode = true;

                // Override with .env variable if provided
                if (process.env.SHIPROCKET_MOCK_MODE !== undefined) {
                    dbConfig.mockMode = process.env.SHIPROCKET_MOCK_MODE === 'true';
                }

                // 2. Inject credentials from environment variables
                //    Credentials are NEVER in the DB — this is the only place they enter.
                const email    = process.env.SHIPROCKET_EMAIL    || '';
                const password = process.env.SHIPROCKET_PASSWORD || '';

                // Warn if live mode is enabled but credentials are not set
                if (!dbConfig.mockMode && (!email || !password)) {
                    console.warn(
                        `[${PROVIDER_ID}] WARNING: mockMode=false but SHIPROCKET_EMAIL or`,
                        `SHIPROCKET_PASSWORD is not set in environment.`,
                        `API calls will fail authentication. Set env vars to activate live mode.`
                    );
                }

                // 3. Merge: DB operational config + env credentials
                const config = {
                    ...dbConfig,
                    email,
                    password,
                };

                this._config         = config;
                this._configLoadedAt = Date.now();

                // 4. (Re-)create the API client with the merged config
                this._apiClient = createShiprocketClient(config);

                console.log(
                    `[${PROVIDER_ID}] Config loaded:`,
                    `mockMode=${config.mockMode}`,
                    `strategy=${config.courierSelectionStrategy || STRATEGIES.LOWEST_COST}`,
                    `credentials=${email ? 'env ✓' : 'env ✗ (not set)'}`
                );
                return this._config;
            } finally {
                this._configLoading = null;
            }
        })();

        return this._configLoading;
    }

    /**
     * Force a config reload on the next adapter call.
     * Call this after admin updates credentials via the dashboard.
     */
    reloadConfig() {
        console.log(`[${PROVIDER_ID}] Config cache invalidated — will reload on next call`);
        this._config         = null;
        this._configLoadedAt = null;
        this._apiClient      = null;
    }

    // ─── Courier Selection ─────────────────────────────────────────────────────

    /**
     * Select a single courier from Shiprocket's returned list
     * according to the configured strategy.
     *
     * @param {object[]} couriers        - Array of courier objects from the API
     * @param {string}   strategy        - 'lowest_cost' | 'fastest_eta'
     * @param {boolean}  isCod           - Whether this is a COD order
     * @returns {object|null} Selected courier, or null if none available
     */
    _selectCourier(couriers, strategy, isCod) {
        if (!couriers || couriers.length === 0) return null;

        // For COD orders, only consider couriers that support COD
        const eligible = isCod
            ? couriers.filter(c => c.cod === 1)
            : couriers;

        if (eligible.length === 0) {
            console.log(`[${PROVIDER_ID}] No eligible couriers for COD=true — all rejected`);
            return null;
        }

        let selected;
        switch (strategy) {
            case STRATEGIES.FASTEST_ETA:
                selected = eligible.reduce((best, c) =>
                    (c.estimated_delivery_days ?? 999) < (best.estimated_delivery_days ?? 999) ? c : best
                );
                break;

            case STRATEGIES.LOWEST_COST:
            default:
                selected = eligible.reduce((best, c) => {
                    const costA = (c.freight_charge ?? c.rate ?? 0) + (isCod ? (c.cod_charges ?? 0) : 0);
                    const costB = (best.freight_charge ?? best.rate ?? 0) + (isCod ? (best.cod_charges ?? 0) : 0);
                    return costA < costB ? c : best;
                });
        }

        console.log(
            `[${PROVIDER_ID}] Courier selected:`,
            `"${selected.courier_name}"`,
            `(strategy=${strategy || STRATEGIES.LOWEST_COST})`,
            `rate=₹${selected.rate}`,
            `eta=${selected.estimated_delivery_days}d`
        );

        return selected;
    }

    /**
     * Compute the total estimatedCost from a selected courier object.
     * For COD: freight_charge + cod_charges.
     * For non-COD: freight_charge (or rate as fallback).
     *
     * @param {object}  courier
     * @param {boolean} isCod
     * @returns {number}
     */
    _computeEstimatedCost(courier, isCod) {
        const freight = courier.freight_charge ?? courier.rate ?? 0;
        if (!isCod) return parseFloat(freight.toFixed(2));

        // Use explicit cod_charges if present; otherwise apply surcharge rate
        const codCharge = (typeof courier.cod_charges === 'number' && courier.cod_charges > 0)
            ? courier.cod_charges
            : parseFloat((freight * DEFAULT_COD_SURCHARGE).toFixed(2));

        return parseFloat((freight + codCharge).toFixed(2));
    }

    // ─── checkServiceability ───────────────────────────────────────────────────

    /**
     * Check whether Shiprocket can deliver from origin to destination.
     * Uses the combined serviceability + rate API endpoint.
     *
     * A delivery is serviceable if Shiprocket returns at least one courier
     * that covers the route (and supports COD, if required).
     *
     * @param {object} context - Standard delivery context
     * @returns {Promise<ServiceabilityResponse>}
     */
    async checkServiceability(context) {
        const method = 'checkServiceability';
        console.log(
            `[${PROVIDER_ID}] Starting ${method}:`,
            `origin=${context?.origin?.pincode}`,
            `dest=${context?.destination?.pincode}`,
            `weight=${context?.packageWeight}g`,
            `payment=${context?.paymentMethod}`
        );

        try {
            const config   = await this._loadConfig();
            const isCod    = context?.paymentMethod === 'cod' || context?.paymentMethod === 'cash';
            const strategy = config.courierSelectionStrategy || STRATEGIES.LOWEST_COST;

            // Validate required context fields
            if (!context?.origin?.pincode) {
                return this._notServiceable(
                    PROVIDER_ERROR_CODES.NOT_SERVICEABLE,
                    'Origin pincode is required for Shiprocket serviceability check'
                );
            }
            if (!context?.destination?.pincode) {
                return this._notServiceable(
                    PROVIDER_ERROR_CODES.NOT_SERVICEABLE,
                    'Destination pincode is required for Shiprocket serviceability check'
                );
            }

            const result = await this._apiClient.checkServiceability(
                context.origin.pincode,
                context.destination.pincode,
                context.packageWeight || 500,
                isCod
            );

            // API-level failure (network, auth, timeout)
            if (!result.success) {
                console.log(`[${PROVIDER_ID}] ${method} API error: ${result.error?.message}`);
                return this._notServiceable(
                    result.error?.code || PROVIDER_ERROR_CODES.API_ERROR,
                    result.error?.message || 'Shiprocket serviceability API failed'
                );
            }

            // No couriers available
            if (!result.data.serviceable) {
                const reason = 'No Shiprocket couriers available for this route';
                console.log(`[${PROVIDER_ID}] ${method}: NOT serviceable — ${reason}`);
                return this._serviceabilityResponse(false, reason);
            }

            // Check if an eligible courier exists for this context (COD check)
            const eligible = isCod
                ? result.data.couriers.filter(c => c.cod === 1)
                : result.data.couriers;

            if (eligible.length === 0) {
                const reason = isCod
                    ? 'No Shiprocket couriers support COD for this route'
                    : 'No Shiprocket couriers available for this route';
                console.log(`[${PROVIDER_ID}] ${method}: NOT serviceable — ${reason}`);
                return this._serviceabilityResponse(false, reason);
            }

            console.log(
                `[${PROVIDER_ID}] ${method}: Serviceable —`,
                `${result.data.couriers.length} courier(s) total,`,
                `${eligible.length} eligible for ${isCod ? 'COD' : 'prepaid'}`
            );

            return this._serviceabilityResponse(true);

        } catch (err) {
            return this._notServiceable(
                PROVIDER_ERROR_CODES.INTERNAL_ERROR,
                `Shiprocket serviceability check failed: ${err.message}`
            );
        }
    }

    // ─── getQuote ──────────────────────────────────────────────────────────────

    /**
     * Get a standardised delivery quote from Shiprocket.
     *
     * Steps:
     *   1. Call the combined serviceability+rate API
     *   2. Select the best courier using courierSelectionStrategy
     *   3. Compute estimatedCost (freight + COD surcharge if applicable)
     *   4. Compute margin = customerShippingCharge - estimatedCost
     *   5. Translate ETA to hours + absolute date
     *   6. Return standardised quote object
     *
     * @param {object} context - Standard delivery context
     * @returns {Promise<QuoteResponse>}
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
            const config          = await this._loadConfig();
            const isCod           = context?.paymentMethod === 'cod' || context?.paymentMethod === 'cash';
            const strategy        = config.courierSelectionStrategy || STRATEGIES.LOWEST_COST;
            const customerCharge  = Number(context?.customerShippingCharge) || 0;

            // Call the combined serviceability + rate API
            const result = await this._apiClient.checkServiceability(
                context.origin?.pincode,
                context.destination?.pincode,
                context.packageWeight || 500,
                isCod
            );

            // API-level failure
            if (!result.success) {
                console.log(`[${PROVIDER_ID}] ${method} API error: ${result.error?.message}`);
                return this._internalError(
                    new Error(result.error?.message || 'Shiprocket rate API failed'),
                    method,
                    {
                        customerCharge,
                        estimatedCost:  null,
                        margin:         null,
                        etaHours:       null,
                        etaDate:        null,
                        quotedAt:       new Date(),
                        expiresAt:      null,
                        breakdown:      null,
                        providerMetadata: {},
                    }
                );
            }

            // No couriers returned
            if (!result.data.serviceable || !result.data.couriers.length) {
                console.log(`[${PROVIDER_ID}] ${method}: No couriers available — cannot quote`);
                return {
                    success:        false,
                    providerId:     PROVIDER_ID,
                    providerName:   PROVIDER_NAME,
                    customerCharge,
                    estimatedCost:  null,
                    margin:         null,
                    etaHours:       null,
                    etaDate:        null,
                    quotedAt:       new Date(),
                    expiresAt:      null,
                    breakdown:      null,
                    providerMetadata: { couriersReturned: 0 },
                    error: {
                        code:    PROVIDER_ERROR_CODES.NOT_SERVICEABLE,
                        message: 'No Shiprocket couriers available for this route',
                    },
                };
            }

            // Select courier using configured strategy
            const selectedCourier = this._selectCourier(result.data.couriers, strategy, isCod);

            if (!selectedCourier) {
                const reason = isCod
                    ? 'No Shiprocket couriers support COD for this route'
                    : 'Courier selection failed (no eligible couriers)';
                console.log(`[${PROVIDER_ID}] ${method}: ${reason}`);
                return {
                    success:        false,
                    providerId:     PROVIDER_ID,
                    providerName:   PROVIDER_NAME,
                    customerCharge,
                    estimatedCost:  null,
                    margin:         null,
                    etaHours:       null,
                    etaDate:        null,
                    quotedAt:       new Date(),
                    expiresAt:      null,
                    breakdown:      null,
                    providerMetadata: { couriersReturned: result.data.couriers.length, strategy },
                    error: {
                        code:    PROVIDER_ERROR_CODES.NOT_SERVICEABLE,
                        message: reason,
                    },
                };
            }

            // ── Compute financial fields ─────────────────────────────────────────
            const estimatedCost = this._computeEstimatedCost(selectedCourier, isCod);
            const margin        = parseFloat((customerCharge - estimatedCost).toFixed(2));

            // ── ETA translation ──────────────────────────────────────────────────
            // Shiprocket returns estimated_delivery_days (integer, from today).
            // We convert to etaHours for consistency with Own Fleet.
            const deliveryDays = selectedCourier.estimated_delivery_days || 1;
            const etaHours     = parseFloat((deliveryDays * 24).toFixed(2));
            const quotedAt     = new Date();
            const etaDate      = new Date(quotedAt.getTime() + etaHours * 60 * 60 * 1000);
            const expiresAt    = new Date(quotedAt.getTime() + QUOTE_VALIDITY_MINUTES * 60 * 1000);

            // ── Build breakdown (Shiprocket-specific detail, stored in providerMetadata) ─
            const breakdown = {
                freightCharge:       parseFloat((selectedCourier.freight_charge ?? selectedCourier.rate ?? 0).toFixed(2)),
                codCharge:           isCod ? parseFloat((selectedCourier.cod_charges ?? 0).toFixed(2)) : 0,
                totalCost:           estimatedCost,
                courierCompanyId:    selectedCourier.courier_company_id,
                courierName:         selectedCourier.courier_name,
                strategy,
                deliveryDays,
            };

            const quote = {
                success:        true,
                providerId:     PROVIDER_ID,
                providerName:   PROVIDER_NAME,
                customerCharge,
                estimatedCost,
                margin,
                etaHours,
                etaDate,
                quotedAt,
                expiresAt,
                breakdown,
                providerMetadata: {
                    selectedCourier,
                    totalCouriersReturned: result.data.couriers.length,
                    strategy,
                    isCod,
                    mockMode: config.mockMode,
                },
                error: null,
            };

            console.log(
                `[${PROVIDER_ID}] ${method} success:`,
                `courier="${selectedCourier.courier_name}"`,
                `estimatedCost=₹${estimatedCost}`,
                `customerCharge=₹${customerCharge}`,
                `margin=₹${margin}`,
                `etaHours=${etaHours}`,
                `(${deliveryDays} day(s))`
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
     * Create a Shiprocket shipment.
     *
     * @param {object} shipment - Shipment document from DB
     * @returns {Promise<CreateShipmentResponse>}
     */
    async createShipment(shipment) {
        const method = 'createShipment';
        console.log(`[${PROVIDER_ID}] ${method} called for shipment ${shipment?._id}`);

        try {
            await this._loadConfig();

            const order = await Order.findById(shipment.orderId).lean();
            if (!order) throw new Error(`Order ${shipment.orderId} not found`);

            const vendor = await Vendor.findById(shipment.vendorId).lean();
            if (!vendor) throw new Error(`Vendor ${shipment.vendorId} not found`);

            const isCod = order.paymentMethod === 'cod' || order.paymentMethod === 'cash';

            // 1. Create Order in Shiprocket
            const createPayload = {
                order_id: shipment.shipmentNumber,
                order_date: new Date().toISOString(),
                pickup_location: vendor.warehouseAddress?.city || 'Default',
                billing_customer_name: order.shippingAddress?.name || 'Customer',
                billing_last_name: '',
                billing_address: order.shippingAddress?.address || 'Unknown',
                billing_city: order.shippingAddress?.city || 'Unknown',
                billing_pincode: order.shippingAddress?.zipCode || '000000',
                billing_state: order.shippingAddress?.state || 'Unknown',
                billing_country: order.shippingAddress?.country || 'India',
                billing_email: order.shippingAddress?.email || 'test@example.com',
                billing_phone: order.shippingAddress?.phone || '9999999999',
                shipping_is_billing: true,
                order_items: [{
                    name: 'Products',
                    sku: 'SKU',
                    units: 1,
                    selling_price: shipment.customerShippingCharge || 10,
                }],
                payment_method: isCod ? 'COD' : 'Prepaid',
                sub_total: shipment.customerShippingCharge || 10,
                length: 10,
                breadth: 10,
                height: 10,
                weight: (shipment.packageWeight || 500) / 1000,
            };

            const createRes = await this._apiClient.createOrder(createPayload);
            if (!createRes.success) {
                return this._internalError(new Error(createRes.error?.message), method, {});
            }

            const shiprocketOrderId = createRes.data.order_id;
            const shiprocketShipmentId = createRes.data.shipment_id;
            let awbCode = null;
            let labelUrl = null;

            // 2. Generate AWB
            const awbRes = await this._apiClient.generateAWB(shiprocketShipmentId, shipment.providerMetadata?.selectedCourier?.courier_company_id || 1);
            if (awbRes.success && awbRes.data?.response?.data?.awb_code) {
                awbCode = awbRes.data.response.data.awb_code;

                // 3. Generate Label (only possible if AWB generated)
                const labelRes = await this._apiClient.generateLabel(shiprocketShipmentId);
                if (labelRes.success && labelRes.data?.label_url) {
                    labelUrl = labelRes.data.label_url;
                }
            }

            return {
                success:            true,
                providerId:         PROVIDER_ID,
                awbCode:            awbCode,
                trackingUrl:        awbCode ? `https://shiprocket.co/tracking/${awbCode}` : null,
                courierName:        awbRes.success ? awbRes.data?.response?.data?.courier_name : null,
                labelUrl:           labelUrl,
                estimatedPickupAt:  null,
                providerMetadata:   {
                    ...shipment.providerMetadata,
                    shiprocketOrderId,
                    shiprocketShipmentId
                },
                error:              null,
            };

        } catch (err) {
            return this._internalError(err, method, {});
        }
    }

    // ─── cancelShipment ────────────────────────────────────────────────────────

    /**
     * Cancel a Shiprocket shipment.
     *
     * @param {object} shipment - Shipment document from DB
     * @returns {Promise<CancelShipmentResponse>}
     */
    async cancelShipment(shipment) {
        const method = 'cancelShipment';
        console.log(`[${PROVIDER_ID}] ${method} called for shipment ${shipment?._id}`);

        try {
            await this._loadConfig();

            const orderId = shipment.providerMetadata?.shiprocketOrderId;
            if (!orderId) {
                return {
                    success: true,
                    providerId: PROVIDER_ID,
                    cancelled: true,
                    error: null,
                };
            }

            const cancelRes = await this._apiClient.cancelOrder([orderId]);
            if (!cancelRes.success) {
                return this._internalError(new Error(cancelRes.error?.message), method, {});
            }

            return {
                success:    true,
                providerId: PROVIDER_ID,
                cancelled:  true,
                error:      null,
            };
        } catch (err) {
            return this._internalError(err, method, {});
        }
    }

    // ─── Reverse Logistics ───────────────────────────────────────────────────

    async checkReverseServiceability(context) {
        const method = 'checkReverseServiceability';
        console.log(
            `[${PROVIDER_ID}] Starting ${method}:`,
            `origin=${context?.origin?.pincode}`,
            `dest=${context?.destination?.pincode}`,
            `weight=${context?.packageWeight}g`
        );

        try {
            await this._loadConfig();
            
            if (!context?.origin?.pincode || !context?.destination?.pincode) {
                return this._notServiceable(
                    PROVIDER_ERROR_CODES.NOT_SERVICEABLE,
                    'Origin and destination pincodes are required for reverse serviceability'
                );
            }

            // A reverse shipment is always prepaid (the platform pays Shiprocket)
            const isCod = false;

            const result = await this._apiClient.checkServiceability(
                context.origin.pincode,
                context.destination.pincode,
                context.packageWeight || 500,
                isCod
            );

            if (!result.success) {
                return this._notServiceable(
                    result.error?.code || PROVIDER_ERROR_CODES.API_ERROR,
                    result.error?.message || 'Shiprocket serviceability API failed'
                );
            }

            if (!result.data.serviceable) {
                return this._serviceabilityResponse(false, 'No Shiprocket couriers available for this route');
            }

            // Filter for return-capable couriers
            const eligible = result.data.couriers.filter(c => c.is_return === 1);

            if (eligible.length === 0) {
                return this._serviceabilityResponse(false, 'No Shiprocket couriers support reverse pickup for this route');
            }

            return this._serviceabilityResponse(true);

        } catch (err) {
            return this._notServiceable(
                PROVIDER_ERROR_CODES.INTERNAL_ERROR,
                `Shiprocket reverse serviceability check failed: ${err.message}`
            );
        }
    }

    async createReversePickup(shipment) {
        const method = 'createReversePickup';
        console.log(`[${PROVIDER_ID}] ${method} called for shipment ${shipment?._id}`);

        try {
            await this._loadConfig();

            const order = await Order.findById(shipment.orderId).lean();
            if (!order) throw new Error(`Order ${shipment.orderId} not found`);

            const vendor = await Vendor.findById(shipment.vendorId).lean();
            if (!vendor) throw new Error(`Vendor ${shipment.vendorId} not found`);

            // For reverse pickups, the customer is the pickup location and vendor is the destination
            const customerAddress = order.shippingAddress;
            const vendorAddress = vendor.warehouseAddress;

            const createPayload = {
                order_id: shipment.shipmentNumber,
                order_date: new Date().toISOString(),
                channel_id: "",
                
                // Pickup (Customer)
                pickup_customer_name: customerAddress?.name || 'Customer',
                pickup_last_name: '',
                pickup_address: customerAddress?.address || 'Unknown',
                pickup_city: customerAddress?.city || 'Unknown',
                pickup_state: customerAddress?.state || 'Unknown',
                pickup_country: customerAddress?.country || 'India',
                pickup_pincode: customerAddress?.zipCode || '000000',
                pickup_email: customerAddress?.email || 'test@example.com',
                pickup_phone: customerAddress?.phone || '9999999999',
                
                // Shipping (Vendor)
                shipping_customer_name: vendorAddress?.name || vendor.businessName || 'Vendor',
                shipping_last_name: '',
                shipping_address: vendorAddress?.address || 'Unknown',
                shipping_city: vendorAddress?.city || 'Unknown',
                shipping_state: vendorAddress?.state || 'Unknown',
                shipping_country: vendorAddress?.country || 'India',
                shipping_pincode: vendorAddress?.pincode || '000000',
                shipping_email: vendor.email || 'test@example.com',
                shipping_phone: vendor.phone || '9999999999',
                
                order_items: [{
                    name: 'Return Items',
                    sku: 'RETURN-SKU',
                    units: 1,
                    selling_price: shipment.customerShippingCharge || 10,
                }],
                payment_method: 'Prepaid', // Return shipments are always prepaid
                sub_total: shipment.customerShippingCharge || 10,
                length: 10,
                breadth: 10,
                height: 10,
                weight: (shipment.packageWeight || 500) / 1000,
            };

            const createRes = await this._apiClient.createReturnOrder(createPayload);
            if (!createRes.success) {
                return this._internalError(new Error(createRes.error?.message), method, {});
            }

            const shiprocketOrderId = createRes.data.order_id;
            const shiprocketShipmentId = createRes.data.shipment_id;
            let awbCode = null;
            let labelUrl = null;

            // Generate AWB
            const awbRes = await this._apiClient.generateAWB(shiprocketShipmentId, shipment.providerMetadata?.selectedCourier?.courier_company_id || 1);
            if (awbRes.success && awbRes.data?.response?.data?.awb_code) {
                awbCode = awbRes.data.response.data.awb_code;

                // Generate Label
                const labelRes = await this._apiClient.generateLabel(shiprocketShipmentId);
                if (labelRes.success && labelRes.data?.label_url) {
                    labelUrl = labelRes.data.label_url;
                }
            }

            return {
                success:            true,
                providerId:         PROVIDER_ID,
                awbCode:            awbCode,
                trackingUrl:        awbCode ? `https://shiprocket.co/tracking/${awbCode}` : null,
                courierName:        awbRes.success ? awbRes.data?.response?.data?.courier_name : null,
                labelUrl:           labelUrl,
                estimatedPickupAt:  null,
                providerMetadata:   {
                    ...shipment.providerMetadata,
                    shiprocketOrderId,
                    shiprocketShipmentId
                },
                error:              null,
            };

        } catch (err) {
            return this._internalError(err, method, {});
        }
    }

    async cancelReversePickup(shipment) {
        const method = 'cancelReversePickup';
        console.log(`[${PROVIDER_ID}] ${method} called for shipment ${shipment?._id} - Delegating to cancelShipment`);
        // Shiprocket cancellation API handles both forward and return orders identically by ID
        return this.cancelShipment(shipment);
    }
}

// ─── Singleton Export ──────────────────────────────────────────────────────────
// Same pattern as ownFleetProvider — one instance per process.
// The adapter holds no mutable per-request state (config cache is process-wide).

const shiprocketProvider = new ShiprocketProvider();

export default shiprocketProvider;
export { ShiprocketProvider, shiprocketProvider, PROVIDER_ID as SHIPROCKET_PROVIDER_ID, STRATEGIES };
