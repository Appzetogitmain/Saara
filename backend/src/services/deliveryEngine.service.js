/**
 * Delivery Engine Service
 *
 * The core decision-making brain of the logistics system. Given a delivery context
 * (origin, destination, package, payment method), this engine:
 *
 *   1. Loads all enabled providers from LogisticsProvider collection
 *   2. Hard-filters each provider by capability flags (no API calls, no scoring)
 *   3. Checks serviceability for each remaining provider
 *   4. Fetches quotes from all serviceable providers in parallel (with timeout)
 *   5. Scores all successful quotes using a weighted formula
 *   6. Selects the winner (highest score; ties broken by provider.priority)
 *   7. Persists a full DeliveryEngineRun document (every step is traceable)
 *   8. Creates a ShippingQuote token (passed to checkout / order creation)
 *   9. Returns the result to the caller
 *
 * ─── Architecture Rules ──────────────────────────────────────────────────────
 * 1. The engine is STATELESS and DETERMINISTIC: same inputs + same provider DB
 *    state always produces the same selected provider.
 *
 * 2. The engine makes ALL selection decisions. Providers only answer:
 *    "Can I do it?" and "What does it cost?"
 *
 * 3. The engine NEVER throws. All failures are caught and stored in the
 *    DeliveryEngineRun record. The caller receives a result with
 *    selectedProviderId = null if no provider is available.
 *
 * 4. One provider failure NEVER stops evaluation of remaining providers.
 *    Promise.allSettled() is used for parallel quote fetching.
 *
 * ─── Scoring Formula ─────────────────────────────────────────────────────────
 *   score = (weights.serviceability × 100)             // 100 = serviceable (only scored if true)
 *         + (weights.eta × etaScore)                   // 0–100, inverse of etaHours, normalized
 *         + (weights.margin × marginScore)             // 0–100, normalized across providers
 *         + (weights.reliability × reliabilityScore)   // 0–100, from LogisticsProvider.reliabilityScore
 *
 * All weights come from LogisticsProvider.scoringWeights. Default fallback:
 *   { serviceability: 50, eta: 20, margin: 20, reliability: 10 }
 *
 * Normalization (linear, 0–100):
 *   etaScore    = fastest ETA gets 100; slowest gets 0. All same → 100.
 *   marginScore = highest margin gets 100; lowest gets 0. All same → 100.
 *
 * ─── Timeout ─────────────────────────────────────────────────────────────────
 * Each provider's quote fetch races against QUOTE_TIMEOUT_MS (default: 3000ms).
 * If timeout fires first, provider is marked API_TIMEOUT and excluded from scoring.
 *
 * ─── DeliveryEngineRun Storage ───────────────────────────────────────────────
 * Every run persists:
 *   - Capability filter result (UNAVAILABLE with CAPABILITY_MISMATCH reason)
 *   - Serviceability result (UNAVAILABLE with specific reason)
 *   - Quote data (financial, ETA, raw response)
 *   - Score for every evaluated provider
 *   - selectionStatus: SELECTED | REJECTED | UNAVAILABLE | API_TIMEOUT
 *   - rejectionReason: exactly why each provider was not chosen
 *   - Auto-generated human-readable selectionNotes
 */

import LogisticsProvider from '../models/LogisticsProvider.model.js';
import AppConfig from '../models/AppConfig.model.js';
import DeliveryEngineRun   from '../models/DeliveryEngineRun.model.js';
import ShippingQuote        from '../models/ShippingQuote.model.js';
import ownFleetProvider     from '../providers/ownFleet.provider.js';
import shiprocketProvider   from '../providers/shiprocket.provider.js';  // Phase 4
import delhiveryProvider    from '../providers/delhivery.provider.js';

// ─── Provider Registry ────────────────────────────────────────────────────────
// Map of providerId → adapter instance.
// When a new provider is added, import and register it here.
// The engine never imports providers directly — it looks them up from this map.

const PROVIDER_ADAPTERS = {
    own_fleet:  ownFleetProvider,
    shiprocket: shiprocketProvider,   // Phase 4 — disabled by default (isEnabled: false in DB)
    delhivery:  delhiveryProvider,
};

// ─── Constants ────────────────────────────────────────────────────────────────

const QUOTE_TIMEOUT_MS = Number(process.env.DELIVERY_ENGINE_TIMEOUT_MS) || 3000;

// Default scoring weights — used if LogisticsProvider.scoringWeights fields are missing
const DEFAULT_WEIGHTS = Object.freeze({
    serviceability: 50,
    eta:            20,
    margin:         20,
    reliability:    10,
});

// ─── Helper: Capability Hard Filter ──────────────────────────────────────────

/**
 * Check whether a provider passes all capability hard filters for the given context.
 * Returns { passes: true } if all checks pass.
 * Returns { passes: false, reason: string } if any check fails.
 *
 * These are binary checks — no scoring. A provider that fails any check is
 * immediately marked UNAVAILABLE with CAPABILITY_MISMATCH.
 */
const checkCapabilities = (provider, context) => {
    const cap = provider.capabilities || {};
    const isCod = context.paymentMethod === 'cod' || context.paymentMethod === 'cash';

    // API health (soft-fail — checked first)
    if (provider.apiStatus?.isHealthy === false) {
        return { passes: false, reason: 'PROVIDER_API_UNHEALTHY' };
    }

    // COD support
    if (isCod && !cap.supportsCOD) {
        return { passes: false, reason: 'COD_NOT_SUPPORTED' };
    }

    // Weight limit
    if (cap.maxWeightGrams > 0 && context.packageWeight > cap.maxWeightGrams) {
        return { passes: false, reason: 'WEIGHT_EXCEEDED' };
    }

    // Hyperlocal / interstate classification
    const originCity  = String(context.origin?.city || '').toLowerCase().trim();
    const destCity    = String(context.destination?.city || '').toLowerCase().trim();
    const originState = String(context.origin?.state || '').toLowerCase().trim();
    const destState   = String(context.destination?.state || '').toLowerCase().trim();

    const isHyperlocal = Boolean(originCity && destCity && originCity === destCity);
    const isInterstate = Boolean(originState && destState && originState !== destState);

    if (isHyperlocal && cap.supportsHyperlocal === false) {
        return { passes: false, reason: 'CAPABILITY_MISMATCH' };
    }
    if (isInterstate && cap.supportsInterstate === false) {
        return { passes: false, reason: 'INTERSTATE_NOT_SUPPORTED' };
    }
    if (!isHyperlocal && !isInterstate && cap.supportsHyperlocal === false && cap.supportsInterstate === false) {
        return { passes: false, reason: 'CAPABILITY_MISMATCH' };
    }

    // Distance limit (0 = unlimited)
    if (cap.maxDistanceKm > 0 && context.estimatedDistanceKm > cap.maxDistanceKm) {
        return { passes: false, reason: 'DISTANCE_EXCEEDED' };
    }

    return { passes: true };
};

// ─── Helper: Timed Quote Fetch ────────────────────────────────────────────────

/**
 * Wraps a provider's getQuote() call with a hard timeout.
 * Returns a quote result or a synthetic timeout error.
 */
const fetchQuoteWithTimeout = (adapter, context, timeoutMs) => {
    const timeoutPromise = new Promise(resolve =>
        setTimeout(() => resolve({
            success:      false,
            providerId:   adapter.providerId,
            providerName: adapter.providerName,
            error:        { code: 'API_TIMEOUT', message: `Quote fetch exceeded ${timeoutMs}ms timeout` },
            _timedOut:    true,
        }), timeoutMs)
    );
    return Promise.race([adapter.getQuote(context), timeoutPromise]);
};

// ─── Helper: Normalize Scores ─────────────────────────────────────────────────

/**
 * Normalize an array of raw values to a 0–100 scale (linear).
 * If all values are the same (or there is only one), all receive 100.
 * For ETA: lower is better → we invert (maxVal - val) / range × 100
 * For Margin: higher is better → (val - minVal) / range × 100
 */
const normalizeInverse = (values) => {
    // Lower value = better score (used for ETA)
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;
    if (range === 0) return values.map(() => 100);
    return values.map(v => parseFloat(((max - v) / range * 100).toFixed(2)));
};

const normalizeDirect = (values) => {
    // Higher value = better score (used for margin)
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;
    if (range === 0) return values.map(() => 100);
    return values.map(v => parseFloat(((v - min) / range * 100).toFixed(2)));
};

// ─── Helper: Compute Score ────────────────────────────────────────────────────

/**
 * Compute the weighted selection score for a provider.
 * All component scores are 0–100. Weights sum to ~100.
 */
const computeScore = (weights, etaScore, marginScore, reliabilityScore) => {
    const w = { ...DEFAULT_WEIGHTS, ...weights };
    return parseFloat((
        (w.serviceability * 100 / 100) +    // serviceability component: 100% weight × 100 score
        (w.eta            * etaScore    / 100) +
        (w.margin         * marginScore / 100) +
        (w.reliability    * reliabilityScore / 100)
    ).toFixed(4));
};

// ─── Helper: Generate Selection Notes ────────────────────────────────────────

const buildSelectionNotes = (quotes, selectedProviderId, noProvidersReason = null) => {
    if (!selectedProviderId) {
        return noProvidersReason || 'No provider was available or serviceable for this delivery.';
    }

    const parts = [];
    for (const q of quotes) {
        if (q.selectionStatus === 'SELECTED') {
            parts.push(`${q.providerName} SELECTED (Score: ${q.selectionScore})`);
        } else if (q.selectionStatus === 'REJECTED') {
            parts.push(`${q.providerName} REJECTED: lower score (${q.selectionScore} vs winner)`);
        } else if (q.selectionStatus === 'UNAVAILABLE') {
            parts.push(`${q.providerName} UNAVAILABLE: ${q.rejectionReason}`);
        } else if (q.selectionStatus === 'API_TIMEOUT') {
            parts.push(`${q.providerName} TIMED OUT: no quote returned within ${QUOTE_TIMEOUT_MS}ms`);
        } else {
            parts.push(`${q.providerName}: ${q.selectionStatus}`);
        }
    }
    return parts.join('. ');
};

// ─── Main Export: runEngine ───────────────────────────────────────────────────

/**
 * Run the Delivery Engine for a given delivery context.
 *
 * @param {object} context - Standard delivery context (see providerInterface.js for schema)
 * @param {object} [options]
 * @param {string} [options.orderId]    - Optional: link DeliveryEngineRun to an existing order
 * @param {string} [options.vendorId]   - Optional: link DeliveryEngineRun to a vendor
 *
 * @returns {Promise<{
 *   selectedProviderId: string | null,
 *   selectedBy:         'AUTO',
 *   quote:              object | null,          // winning provider's quote response
 *   shippingQuoteId:    string | null,          // ShippingQuote.quoteId token
 *   deliveryEngineRunId: string,               // DeliveryEngineRun._id
 *   runId:              string,                // DER-YYYY-XXXXXX
 *   runDurationMs:      number,
 *   selectionNotes:     string,
 *   allQuotes:          object[],              // all evaluated quotes (for logging)
 *   noProviderAvailable: boolean,
 * }>}
 */
const runEngine = async (context, options = {}) => {
    const engineStart = Date.now();
    const runTriggeredAt = new Date(engineStart);
    const logger = (msg) => console.log(`[DeliveryEngine] ${msg}`);

    logger(`Engine triggered. origin=${context.origin?.pincode} dest=${context.destination?.pincode} weight=${context.packageWeight}g payment=${context.paymentMethod}`);

    // ── 0. Load Global Weights ─────────────────────────────────────────────
    let globalWeights = DEFAULT_WEIGHTS;
    try {
        const config = await AppConfig.findOne({ key: 'logistics_engine' }).lean();
        if (config && config.value) {
            globalWeights = { ...DEFAULT_WEIGHTS, ...config.value };
        }
    } catch (err) {
        logger(`WARN: Failed to load global weights: ${err.message}. Using defaults.`);
    }

    // ── 1. Load enabled providers ─────────────────────────────────────────────
    let providerDocs;
    try {
        providerDocs = await LogisticsProvider
            .find({ isEnabled: true })
            .sort({ priority: 1 })  // lower priority number = evaluated first (deterministic order)
            .lean();
    } catch (err) {
        logger(`FATAL: Failed to load LogisticsProviders: ${err.message}`);
        providerDocs = [];
    }

    logger(`${providerDocs.length} enabled provider(s) loaded`);

    // ── 2. Capability filtering + serviceability + quote fetching ─────────────
    // For each provider we build a quoteEntry for DeliveryEngineRun.
    // We collect promises so all providers are queried concurrently.

    const quoteEntries = [];        // DeliveryEngineRun.quotes entries
    const successfulQuotes = [];    // providers that returned a valid quote

    // Phase A: capability hard-filter (sync, no API calls)
    const capabilityPassed = [];
    for (const providerDoc of providerDocs) {
        const capResult = checkCapabilities(providerDoc, context);
        if (!capResult.passes) {
            logger(`Provider '${providerDoc.providerId}' CAPABILITY_FILTER FAILED: ${capResult.reason}`);
            quoteEntries.push({
                providerId:      providerDoc.providerId,
                providerName:    providerDoc.displayName,
                selectionStatus: 'UNAVAILABLE',
                rejectionReason: capResult.reason,
                reliabilityScore: providerDoc.reliabilityScore,
                rawResponse:     { capabilityCheck: capResult },
            });
        } else {
            capabilityPassed.push(providerDoc);
        }
    }

    // Phase B: serviceability + quote fetch (async, concurrent per provider)
    const startQuoteTime = Date.now();

    const quotePromises = capabilityPassed.map(async (providerDoc) => {
        const adapter = PROVIDER_ADAPTERS[providerDoc.providerId];
        if (!adapter) {
            logger(`No adapter registered for provider '${providerDoc.providerId}' — skipping`);
            return {
                providerDoc,
                serviceability: null,
                quote:          null,
                apiResponseMs:  0,
                notRegistered:  true,
            };
        }

        const provStart = Date.now();

        // Serviceability check first
        let serviceability;
        const serviceabilityMethod = options.serviceabilityMethod || 'checkServiceability';
        
        try {
            serviceability = await fetchQuoteWithTimeout(
                { 
                    getQuote: (ctx) => typeof adapter[serviceabilityMethod] === 'function' 
                        ? adapter[serviceabilityMethod](ctx) 
                        : adapter.checkServiceability(ctx), 
                    providerId: adapter.providerId, 
                    providerName: adapter.providerName 
                },
                context,
                QUOTE_TIMEOUT_MS
            );
        } catch (err) {
            serviceability = { success: false, serviceable: false, reason: err.message };
        }

        if (!serviceability.serviceable) {
            const apiResponseMs = Date.now() - provStart;
            logger(`Provider '${providerDoc.providerId}' NOT SERVICEABLE: ${serviceability.reason || 'unknown'}`);
            return { providerDoc, serviceability, quote: null, apiResponseMs, notServiceable: true };
        }

        // Get quote
        const quoteResult = await fetchQuoteWithTimeout(adapter, context, Math.max(QUOTE_TIMEOUT_MS - (Date.now() - provStart), 500));
        const apiResponseMs = Date.now() - provStart;

        return { providerDoc, serviceability, quote: quoteResult, apiResponseMs };
    });

    const settled = await Promise.allSettled(quotePromises);

    // Phase C: process results into quoteEntries
    for (const result of settled) {
        if (result.status === 'rejected') {
            // This shouldn't happen since we catch inside, but handle defensively
            logger(`Unexpected promise rejection: ${result.reason}`);
            continue;
        }

        const { providerDoc, serviceability, quote, apiResponseMs, notRegistered, notServiceable } = result.value;

        if (notRegistered) {
            quoteEntries.push({
                providerId:      providerDoc.providerId,
                providerName:    providerDoc.displayName,
                selectionStatus: 'UNAVAILABLE',
                rejectionReason: 'NO_ADAPTER_REGISTERED',
                reliabilityScore: providerDoc.reliabilityScore,
            });
            continue;
        }

        if (notServiceable) {
            const isTimeout = serviceability._timedOut;
            quoteEntries.push({
                providerId:      providerDoc.providerId,
                providerName:    providerDoc.displayName,
                selectionStatus: isTimeout ? 'API_TIMEOUT' : 'UNAVAILABLE',
                rejectionReason: isTimeout ? 'SERVICEABILITY_TIMEOUT' : (serviceability.reason || 'NOT_SERVICEABLE'),
                reliabilityScore: providerDoc.reliabilityScore,
                apiResponseMs,
                rawResponse:     serviceability,
            });
            continue;
        }

        // quote may be a timeout result
        if (!quote || !quote.success) {
            const isTimeout = quote?._timedOut;
            logger(`Provider '${providerDoc.providerId}' quote ${isTimeout ? 'TIMED OUT' : 'FAILED'}: ${quote?.error?.message}`);
            quoteEntries.push({
                providerId:      providerDoc.providerId,
                providerName:    providerDoc.displayName,
                selectionStatus: isTimeout ? 'API_TIMEOUT' : 'UNAVAILABLE',
                rejectionReason: quote?.error?.code || 'QUOTE_FAILED',
                reliabilityScore: providerDoc.reliabilityScore,
                apiResponseMs,
                rawResponse:     quote,
            });
            continue;
        }

        // Valid quote received
        logger(`Provider '${providerDoc.providerId}' quote received: estimatedCost=₹${quote.estimatedCost} etaHours=${quote.etaHours} (${apiResponseMs}ms)`);
        successfulQuotes.push({
            providerDoc,
            quote,
            apiResponseMs,
        });
    }

    const totalQuoteMs = Date.now() - startQuoteTime;
    logger(`Quote phase complete in ${totalQuoteMs}ms. ${successfulQuotes.length} valid quote(s)`);

    // ── 3. Scoring ────────────────────────────────────────────────────────────
    let selectedEntry     = null;
    let noProviderReason  = null;

    if (successfulQuotes.length === 0) {
        noProviderReason = 'No provider passed capability checks and returned a valid quote.';
        logger(`No providers available. ${noProviderReason}`);
    } else {
        // Normalize ETA and margin across all successful quotes
        const etaValues    = successfulQuotes.map(sq => sq.quote.etaHours ?? 999);
        const marginValues = successfulQuotes.map(sq => sq.quote.margin  ?? -99999);
        const etaScores    = normalizeInverse(etaValues);
        const marginScores = normalizeDirect(marginValues);

        // Compute score for each
        const scored = successfulQuotes.map((sq, i) => {
            const weights = globalWeights;
            const reliabilityScore = sq.providerDoc.reliabilityScore ?? 0;
            const score = computeScore(weights, etaScores[i], marginScores[i], reliabilityScore);

            logger(
                `Score for '${sq.providerDoc.providerId}': ` +
                `eta=${etaScores[i]} margin=${marginScores[i]} reliability=${reliabilityScore} ` +
                `→ SCORE=${score}`
            );

            return { ...sq, score, etaScore: etaScores[i], marginScore: marginScores[i] };
        });

        // Sort by score DESC; tie-break by provider.priority ASC (lower = better)
        scored.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return (a.providerDoc.priority || 999) - (b.providerDoc.priority || 999);
        });

        selectedEntry = scored[0];
        logger(`Winner: '${selectedEntry.providerDoc.providerId}' (score=${selectedEntry.score})`);

        // Build quoteEntries for all scored providers
        for (const sq of scored) {
            const isWinner = sq.providerDoc.providerId === selectedEntry.providerDoc.providerId;
            quoteEntries.push({
                providerId:      sq.providerDoc.providerId,
                providerName:    sq.providerDoc.displayName,
                customerCharge:  sq.quote.customerCharge,
                estimatedCost:   sq.quote.estimatedCost,
                margin:          sq.quote.margin,
                etaHours:        sq.quote.etaHours,
                etaDate:         sq.quote.etaDate,
                reliabilityScore: sq.providerDoc.reliabilityScore,
                selectionScore:  sq.score,
                selectionStatus: isWinner ? 'SELECTED' : 'REJECTED',
                rejectionReason: isWinner ? null : 'LOWER_SCORE',
                apiResponseMs:   sq.apiResponseMs,
                rawResponse:     sq.quote.providerMetadata,
            });
        }
    }

    // ── 4. Persist DeliveryEngineRun ──────────────────────────────────────────
    const runCompletedAt = new Date();
    const runDurationMs  = Date.now() - engineStart;
    const selectionNotes = buildSelectionNotes(
        quoteEntries,
        selectedEntry?.providerDoc.providerId || null,
        noProviderReason
    );

    let engineRun;
    try {
        engineRun = await DeliveryEngineRun.create({
            orderId:    options.orderId  || undefined,
            vendorId:   options.vendorId || undefined,
            runTriggeredAt,
            runCompletedAt,
            runDurationMs,
            origin:      { pincode: context.origin?.pincode, city: context.origin?.city, state: context.origin?.state },
            destination: { pincode: context.destination?.pincode, city: context.destination?.city, state: context.destination?.state },
            packageWeight:     context.packageWeight,
            packageDimensions: context.packageDimensions,
            paymentMethod:     context.paymentMethod,
            quotes:            quoteEntries,
            selectedProviderId: selectedEntry?.providerDoc.providerId || null,
            selectedBy:        'AUTO',
            selectionNotes,
        });
        logger(`DeliveryEngineRun persisted: ${engineRun.runId} (${runDurationMs}ms)`);
    } catch (err) {
        logger(`ERROR persisting DeliveryEngineRun: ${err.message}`);
        // Do not rethrow — return result without run ID rather than crash
    }

    // ── 5. Persist ShippingQuote (only if a provider was selected) ────────────
    let shippingQuote;
    if (selectedEntry) {
        try {
            const winningQuote = selectedEntry.quote;
            shippingQuote = await ShippingQuote.create({
                deliveryEngineRunId: engineRun?._id,
                vendorId:            options.vendorId || undefined,
                providerId:          selectedEntry.providerDoc.providerId,
                customerCharge:      winningQuote.customerCharge,
                estimatedCost:       winningQuote.estimatedCost,
                etaDate:             winningQuote.etaDate,
                expiresAt:           winningQuote.expiresAt,
                quoteScope:          options.quoteScope || 'unknown',
            });
            logger(`ShippingQuote created: ${shippingQuote.quoteId}`);
        } catch (err) {
            logger(`ERROR persisting ShippingQuote: ${err.message}`);
        }
    }

    // ── 6. Build and return result ────────────────────────────────────────────
    const engineResult = {
        selectedProviderId:  selectedEntry?.providerDoc.providerId || null,
        selectedBy:          'AUTO',
        quote:               selectedEntry?.quote || null,
        shippingQuoteId:     shippingQuote?.quoteId || null,
        deliveryEngineRunId: engineRun?._id?.toString() || null,
        runId:               engineRun?.runId || null,
        runDurationMs,
        selectionNotes,
        allQuotes:           quoteEntries,
        noProviderAvailable: !selectedEntry,
    };

    logger(
        `Engine complete in ${runDurationMs}ms. ` +
        `Selected: ${engineResult.selectedProviderId || 'NONE'}. ` +
        `Quote: ${engineResult.shippingQuoteId || 'N/A'}. ` +
        `Run: ${engineResult.runId || 'N/A'}`
    );

    return engineResult;
};

export default runEngine;
export { runEngine, normalizeInverse, normalizeDirect, computeScore };
