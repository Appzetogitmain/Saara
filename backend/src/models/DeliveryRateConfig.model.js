import mongoose from 'mongoose';

// ─── Sub-schemas ─────────────────────────────────────────────────────────────

const nightChargeSchema = new mongoose.Schema(
    {
        enabled:          { type: Boolean, default: false },
        startHour:        { type: Number, default: 22, min: 0, max: 23 }, // 24h format
        endHour:          { type: Number, default: 6,  min: 0, max: 23 },
        additionalAmount: { type: Number, default: 0, min: 0 }, // flat ₹ added to payout
    },
    { _id: false }
);

const peakWindowSchema = new mongoose.Schema(
    {
        startHour:        { type: Number, required: true, min: 0, max: 23 },
        endHour:          { type: Number, required: true, min: 0, max: 23 },
        additionalAmount: { type: Number, required: true, min: 0 },
    },
    { _id: false }
);

const peakHourChargeSchema = new mongoose.Schema(
    {
        enabled: { type: Boolean, default: false },
        windows: { type: [peakWindowSchema], default: [] },
    },
    { _id: false }
);

const rainChargeSchema = new mongoose.Schema(
    {
        enabled:          { type: Boolean, default: false },
        additionalAmount: { type: Number, default: 0, min: 0 },
    },
    { _id: false }
);

// ─── Main Schema ─────────────────────────────────────────────────────────────

const deliveryRateConfigSchema = new mongoose.Schema(
    {
        // Scope — one config per vehicle type; 'all' is the default fallback
        vehicleType: {
            type:     String,
            enum:     ['bike', 'scooter', 'van', 'truck', 'all'],
            required: true,
            default:  'all',
            index:    true,
        },

        // ─── Base Payout Formula ─────────────────────────────────────────
        // payout = basePayAmount + max(0, distance - baseDistanceKm) * perKmRate
        basePayAmount:   { type: Number, required: true, default: 50,  min: 0 },
        baseDistanceKm:  { type: Number, required: true, default: 5,   min: 0 },
        perKmRate:       { type: Number, required: true, default: 5,   min: 0 },
        maximumPayAmount: { type: Number, required: true, default: 500, min: 0 }, // cap

        // ─── Time-Based Surcharges ───────────────────────────────────────
        nightCharge:     { type: nightChargeSchema,    default: () => ({}) },
        peakHourCharge:  { type: peakHourChargeSchema, default: () => ({}) },

        // ─── Condition-Based Surcharges ──────────────────────────────────
        rainCharge:      { type: rainChargeSchema, default: () => ({}) },

        // Live admin toggle — turns on rain surcharge platform-wide immediately.
        // Admin enables this from the dashboard when it's raining.
        // Future: can be auto-set by a weather API integration.
        isRainModeActive: { type: Boolean, default: false },

        // ─── Versioning ──────────────────────────────────────────────────
        isActive: { type: Boolean, default: true, index: true },

        // This config applies to deliveries where deliveredAt >= effectiveFrom.
        // When a new config is created, the previous one should have effectiveTo set.
        effectiveFrom: { type: Date, required: true, default: Date.now, index: true },
        effectiveTo:   { type: Date, default: null },  // null = currently active

        // Audit
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref:  'Admin',
        },
        notes: { type: String, trim: true }, // e.g., "Diwali rate increase"
    },
    { timestamps: true }
);

// ─── Indexes ─────────────────────────────────────────────────────────────────

// Primary query for payout calculation:
// find active config for vehicleType where effectiveFrom <= now
deliveryRateConfigSchema.index({ vehicleType: 1, isActive: 1, effectiveFrom: -1 });

const DeliveryRateConfig = mongoose.model('DeliveryRateConfig', deliveryRateConfigSchema);
export default DeliveryRateConfig;
export { DeliveryRateConfig };
