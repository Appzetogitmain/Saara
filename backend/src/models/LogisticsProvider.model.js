import mongoose from 'mongoose';

// ─── Sub-schemas ─────────────────────────────────────────────────────────────

const capabilitiesSchema = new mongoose.Schema(
    {
        supportsCOD:            { type: Boolean, default: false },
        supportsReversePickup:  { type: Boolean, default: false },
        supportsHyperlocal:     { type: Boolean, default: false }, // same-city, <50km
        supportsInterstate:     { type: Boolean, default: false }, // cross-city/state
        supportsInternational:  { type: Boolean, default: false },
        maxWeightGrams:         { type: Number, default: 50000 }, // 50kg default cap
        maxDistanceKm:          { type: Number, default: 0 },     // 0 = unlimited
        supportedPincodeRegex:  { type: String },                 // optional regex filter
    },
    { _id: false }
);

const apiStatusSchema = new mongoose.Schema(
    {
        isHealthy:      { type: Boolean, default: true },
        lastCheckedAt:  { type: Date },
        lastErrorAt:    { type: Date },
        lastErrorMsg:   { type: String },
        successRate7d:  { type: Number, default: 100 }, // % of successful API calls in last 7 days
    },
    { _id: false }
);

const scoringWeightsSchema = new mongoose.Schema(
    {
        // Weights for the Delivery Engine scoring formula.
        // Must sum to 100 (enforced at application layer, not schema).
        serviceability: { type: Number, default: 50 }, // hard gate — high default
        eta:            { type: Number, default: 20 },
        margin:         { type: Number, default: 20 },
        reliability:    { type: Number, default: 10 },
    },
    { _id: false }
);

// ─── Main Schema ─────────────────────────────────────────────────────────────

const logisticsProviderSchema = new mongoose.Schema(
    {
        // Identity — human-defined, stable slug
        providerId: {
            type:     String,
            required: true,
            unique:   true,
            index:    true,
            trim:     true,
            // Examples: 'own_fleet' | 'shiprocket' | 'delhivery' | 'porter' | 'shadowfax'
        },
        displayName: {
            type:     String,
            required: true,
            trim:     true,
        },
        logoUrl: { type: String },

        // ─── Operational Control ─────────────────────────────────────────
        isEnabled: { type: Boolean, default: false, index: true },
        // Lower priority number = higher preference in tie-breaking
        priority:       { type: Number, default: 99 },
        reliabilityScore: { type: Number, default: 100, min: 0, max: 100 },

        // ─── Capability Registry ─────────────────────────────────────────
        // Used as HARD FILTERS by the Delivery Engine before scoring.
        // A provider that fails a capability check is marked UNAVAILABLE.
        capabilities: { type: capabilitiesSchema, default: () => ({}) },

        // ─── API Health ──────────────────────────────────────────────────
        // Auto-updated by the engine after each provider API call.
        apiStatus: { type: apiStatusSchema, default: () => ({}) },

        // ─── Provider Config ──────────────────────────────────────────────────
        // Non-sensitive operational settings only. Schema is provider-specific (Mixed).
        //
        // Examples by provider:
        //   own_fleet:   {} (no external API — internal system, no config needed)
        //   shiprocket:  { channelId, courierSelectionStrategy, mockMode }
        //   delhivery:   { warehouseId, ...operationalSettings }
        //
        // IMPORTANT: API credentials are NEVER stored here.
        //   Shiprocket credentials are read from environment variables:
        //     SHIPROCKET_EMAIL     — set in .env or deployment environment
        //     SHIPROCKET_PASSWORD  — set in .env or deployment environment
        //   See shiprocket.provider.js → _loadConfig() for injection logic.
        config: { type: mongoose.Schema.Types.Mixed, select: false },

        // ─── Scoring Weights ─────────────────────────────────────────────
        // Per-provider override of the global scoring formula weights.
        scoringWeights: { type: scoringWeightsSchema, default: () => ({}) },
    },
    { timestamps: true }
);

// ─── Indexes ─────────────────────────────────────────────────────────────────

logisticsProviderSchema.index({ isEnabled: 1, priority: 1 });

const LogisticsProvider = mongoose.model('LogisticsProvider', logisticsProviderSchema);
export default LogisticsProvider;
export { LogisticsProvider };
