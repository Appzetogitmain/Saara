/**
 * Payout Calculator Service
 *
 * Replaces the hardcoded delivery payout formula in deliveryPayout.service.js
 * with a fully DB-driven, configurable calculation.
 *
 * ─── Architecture Rule ───────────────────────────────────────────────────────
 * This service is PURE CALCULATION — it reads from DB but NEVER writes.
 * It does not credit wallets, update models, or emit events.
 * The caller (Phase 5 shipmentDelivered listener) is responsible for persisting
 * the result and emitting DRIVER_PAYOUT_PROCESSED.
 *
 * ─── Config Resolution Order ─────────────────────────────────────────────────
 * 1. Active config for the driver's specific vehicleType (e.g., 'bike')
 * 2. Active config for vehicleType = 'all' (universal fallback)
 * 3. Hard-coded emergency default (prevents production outage if DB has no config)
 *    Emergency default = Phase 2.3 seed values: base=50, baseKm=5, perKm=5, max=500
 *
 * ─── Payout Formula ──────────────────────────────────────────────────────────
 * pay  = basePayAmount
 *      + max(0, distanceKm - baseDistanceKm) × perKmRate
 *      + nightSurcharge  (if nightCharge.enabled AND delivery hour is in night window)
 *      + peakSurcharge   (if peakHourCharge.enabled AND delivery hour is in a peak window)
 *      + rainSurcharge   (if rainCharge.enabled AND config.isRainModeActive === true)
 *
 * pay  = min(pay, maximumPayAmount)   ← cap applies AFTER all surcharges
 *
 * ─── Night Window Note ───────────────────────────────────────────────────────
 * Night windows can cross midnight (e.g., startHour=22, endHour=6).
 * We handle this correctly:
 *   hour >= startHour OR hour < endHour  →  in night window
 *
 * ─── Effective Config at Delivery Time ───────────────────────────────────────
 * We find the config whose effectiveFrom <= deliveredAt AND effectiveTo is null (or >= deliveredAt).
 * This ensures the correct rates apply to historical deliveries even after a rate change.
 */

import DeliveryRateConfig from '../models/DeliveryRateConfig.model.js';

// ─── Emergency Fallback (mirrors Phase 2.3 seed values) ──────────────────────
// Used ONLY if no DB config exists. Should never happen in production
// because the seed script always ensures at least one 'all' config.
const EMERGENCY_DEFAULT_CONFIG = {
    vehicleType:      'all',
    basePayAmount:    50,
    baseDistanceKm:   5,
    perKmRate:        5,
    maximumPayAmount: 500,
    nightCharge:      { enabled: false, startHour: 22, endHour: 6, additionalAmount: 0 },
    peakHourCharge:   { enabled: false, windows: [] },
    rainCharge:       { enabled: false, additionalAmount: 0 },
    isRainModeActive: false,
    _isEmergencyDefault: true,   // flag so callers can log/alert when this is used
};

// ─── Night Window Check ───────────────────────────────────────────────────────

/**
 * Returns true if `hour` (0–23) falls within the night window defined by
 * `startHour` and `endHour`. Correctly handles windows that cross midnight.
 *
 * Examples:
 *   isInNightWindow(23, 22, 6)  → true  (23:00 is in 22:00–06:00 window)
 *   isInNightWindow(3,  22, 6)  → true  (03:00 is in 22:00–06:00 window)
 *   isInNightWindow(7,  22, 6)  → false (07:00 is outside 22:00–06:00 window)
 *   isInNightWindow(14, 20, 23) → false (14:00 is outside 20:00–23:00 window)
 *   isInNightWindow(21, 20, 23) → true  (21:00 is in 20:00–23:00 same-day window)
 */
const isInNightWindow = (hour, startHour, endHour) => {
    if (startHour > endHour) {
        // Window crosses midnight (e.g., 22 → 6)
        return hour >= startHour || hour < endHour;
    }
    // Same-day window (e.g., 20 → 23)
    return hour >= startHour && hour < endHour;
};

// ─── Peak Window Check ────────────────────────────────────────────────────────

/**
 * Returns the first matching peak window for the given hour, or null if none match.
 * Returns the window object so the caller can extract additionalAmount.
 */
const findMatchingPeakWindow = (hour, windows) => {
    if (!Array.isArray(windows) || windows.length === 0) return null;
    return windows.find(w => isInNightWindow(hour, w.startHour, w.endHour)) ?? null;
};

// ─── Config Resolver ─────────────────────────────────────────────────────────

/**
 * Finds the most appropriate DeliveryRateConfig for a delivery.
 *
 * Attempts vehicle-specific config first, then universal 'all' fallback.
 * Uses `deliveredAt` to find the config that was effective at delivery time,
 * ensuring accurate historical payout calculations.
 *
 * @param {string} vehicleType  - Driver's vehicle type ('bike'|'scooter'|'van'|'truck')
 * @param {Date}   deliveredAt  - When the delivery occurred (for time-accurate config lookup)
 * @returns {{ config: object, source: string }} - Resolved config + its source label
 */
const resolveRateConfig = async (vehicleType, deliveredAt) => {
    const deliveryDate = deliveredAt instanceof Date ? deliveredAt : new Date(deliveredAt || Date.now());
    const baseQuery = {
        isActive: true,
        effectiveFrom: { $lte: deliveryDate },
        $or: [
            { effectiveTo: null },
            { effectiveTo: { $exists: false } },
            { effectiveTo: { $gte: deliveryDate } },
        ],
    };

    // 1. Vehicle-specific config
    if (vehicleType && vehicleType !== 'all') {
        const specific = await DeliveryRateConfig
            .findOne({ ...baseQuery, vehicleType })
            .sort({ effectiveFrom: -1 })
            .lean();

        if (specific) {
            return { config: specific, source: `vehicleType:${vehicleType}` };
        }
    }

    // 2. Universal 'all' fallback
    const universal = await DeliveryRateConfig
        .findOne({ ...baseQuery, vehicleType: 'all' })
        .sort({ effectiveFrom: -1 })
        .lean();

    if (universal) {
        return { config: universal, source: 'vehicleType:all' };
    }

    // 3. Emergency hardcoded default
    console.warn('[PayoutCalculator] WARNING: No active DeliveryRateConfig found in DB. Using emergency default.');
    return { config: EMERGENCY_DEFAULT_CONFIG, source: 'emergency_default' };
};

// ─── Main Export: calculatePayout ────────────────────────────────────────────

/**
 * Calculate the delivery payout for an Own Fleet driver.
 *
 * @param {object} params
 * @param {number} params.distanceKm    - Delivery distance in kilometres
 * @param {string} params.vehicleType   - Driver's vehicle type ('bike'|'scooter'|'van'|'truck'|'all')
 * @param {Date}   params.deliveredAt   - Delivery timestamp (used for night/peak surcharge check and config lookup)
 *
 * @returns {Promise<{
 *   payoutAmount:     number,   // Final payout in ₹ (capped, rounded to 2dp)
 *   rateConfigId:     string,   // MongoDB _id of the config used (null if emergency default)
 *   configSource:     string,   // 'vehicleType:bike' | 'vehicleType:all' | 'emergency_default'
 *   isEmergencyDefault: boolean,
 *   breakdown: {
 *     basePay:        number,   // basePayAmount from config
 *     distanceKm:     number,   // actual km used in calculation
 *     extraDistanceKm: number,  // km beyond baseDistanceKm
 *     extraDistancePay: number, // extraDistanceKm * perKmRate
 *     nightSurcharge: number,   // 0 if not applicable
 *     peakSurcharge:  number,   // 0 if not applicable
 *     rainSurcharge:  number,   // 0 if not applicable
 *     subtotal:       number,   // sum before cap
 *     cap:            number,   // maximumPayAmount from config
 *     wasCapped:      boolean,  // true if subtotal exceeded cap
 *   },
 *   appliedSurcharges: string[],  // human-readable list e.g. ['night', 'rain']
 * }>}
 */
const calculatePayout = async ({ distanceKm, vehicleType, deliveredAt }) => {
    // ── Input Normalisation ────────────────────────────────────────────────────
    const dist     = Math.max(Number(distanceKm) || 0, 0);
    const vType    = vehicleType || 'all';
    const delAt    = deliveredAt instanceof Date ? deliveredAt : new Date(deliveredAt || Date.now());
    const delHour  = delAt.getHours(); // 0–23 in LOCAL server time

    // ── Config Resolution ──────────────────────────────────────────────────────
    const { config, source } = await resolveRateConfig(vType, delAt);

    // ── Base Pay ───────────────────────────────────────────────────────────────
    const basePay         = Number(config.basePayAmount) || 50;
    const baseDistanceKm  = Number(config.baseDistanceKm) || 5;
    const perKmRate       = Number(config.perKmRate) || 5;
    const maximumPayAmount= Number(config.maximumPayAmount) || 500;

    const extraDistanceKm  = Math.max(0, dist - baseDistanceKm);
    const extraDistancePay = parseFloat((extraDistanceKm * perKmRate).toFixed(2));

    // ── Night Surcharge ────────────────────────────────────────────────────────
    let nightSurcharge = 0;
    if (config.nightCharge?.enabled) {
        const { startHour, endHour, additionalAmount } = config.nightCharge;
        if (isInNightWindow(delHour, startHour, endHour)) {
            nightSurcharge = Number(additionalAmount) || 0;
        }
    }

    // ── Peak Hour Surcharge ────────────────────────────────────────────────────
    let peakSurcharge = 0;
    if (config.peakHourCharge?.enabled) {
        const matchedWindow = findMatchingPeakWindow(delHour, config.peakHourCharge.windows || []);
        if (matchedWindow) {
            peakSurcharge = Number(matchedWindow.additionalAmount) || 0;
        }
    }

    // ── Rain Surcharge ─────────────────────────────────────────────────────────
    // Only applied if BOTH the rain feature is enabled in config AND
    // admin has activated rain mode platform-wide (isRainModeActive toggle).
    let rainSurcharge = 0;
    if (config.rainCharge?.enabled && config.isRainModeActive === true) {
        rainSurcharge = Number(config.rainCharge.additionalAmount) || 0;
    }

    // ── Subtotal + Cap ─────────────────────────────────────────────────────────
    const subtotal = parseFloat(
        (basePay + extraDistancePay + nightSurcharge + peakSurcharge + rainSurcharge).toFixed(2)
    );
    const wasCapped     = subtotal > maximumPayAmount;
    const payoutAmount  = parseFloat(Math.min(subtotal, maximumPayAmount).toFixed(2));

    // ── Applied Surcharge Labels (for breakdown readability) ───────────────────
    const appliedSurcharges = [];
    if (nightSurcharge > 0) appliedSurcharges.push('night');
    if (peakSurcharge  > 0) appliedSurcharges.push('peak');
    if (rainSurcharge  > 0) appliedSurcharges.push('rain');

    return {
        payoutAmount,
        rateConfigId:       config._id ? String(config._id) : null,
        configSource:       source,
        isEmergencyDefault: config._isEmergencyDefault === true,
        breakdown: {
            basePay,
            distanceKm:       parseFloat(dist.toFixed(3)),
            extraDistanceKm:  parseFloat(extraDistanceKm.toFixed(3)),
            extraDistancePay,
            nightSurcharge,
            peakSurcharge,
            rainSurcharge,
            subtotal,
            cap:              maximumPayAmount,
            wasCapped,
        },
        appliedSurcharges,
    };
};

export default calculatePayout;
export { calculatePayout, resolveRateConfig, isInNightWindow, findMatchingPeakWindow };
