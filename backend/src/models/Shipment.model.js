import mongoose from 'mongoose';

// ─── Sub-schemas ─────────────────────────────────────────────────────────────

const statusHistorySchema = new mongoose.Schema(
    {
        status:    { type: String, required: true },
        updatedAt: { type: Date, default: Date.now },
        updatedBy: { type: String }, // 'system' | 'admin' | 'vendor' | 'driver' | 'webhook'
        notes:     { type: String },
        providerStatus: { type: String }, // Raw status from the 3PL provider
        providerPayload: { type: mongoose.Schema.Types.Mixed }, // Raw webhook payload for auditability
    },
    { _id: false }
);

const packageDimensionsSchema = new mongoose.Schema(
    {
        length: { type: Number, default: 15 }, // cm
        breadth: { type: Number, default: 12 },
        height:  { type: Number, default: 8 },
    },
    { _id: false }
);

const providerOverrideSchema = new mongoose.Schema(
    {
        previousProviderId: { type: String, required: true },
        newProviderId:      { type: String, required: true },
        overriddenBy:       { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
        overrideReason:     { type: String, required: true },
        overriddenAt:       { type: Date, default: Date.now },
    },
    { _id: false }
);

// ─── Main Schema ─────────────────────────────────────────────────────────────

const shipmentSchema = new mongoose.Schema(
    {
        // ─── Identity ────────────────────────────────────────────────────
        type: {
            type: String,
            enum: ['forward', 'reverse', 'exchange_forward'],
            default: 'forward',
            index: true
        },
        shipmentNumber: {
            type:   String,
            unique: true,
            index:  true,
            // Populated by pre-save hook below (e.g., SHP-2026-000001)
        },

        // ─── References ──────────────────────────────────────────────────
        orderId: {
            type:     mongoose.Schema.Types.ObjectId,
            ref:      'Order',
            required: true,
            index:    true,
        },
        returnRequestId: {
            type:     mongoose.Schema.Types.ObjectId,
            ref:      'ReturnRequest',
            index:    true,
        },
        vendorId: {
            type:     mongoose.Schema.Types.ObjectId,
            ref:      'Vendor',
            required: true,
            index:    true,
        },
        vendorName: { type: String },
        deliveryEngineRunId: {
            type: mongoose.Schema.Types.ObjectId,
            ref:  'DeliveryEngineRun',
        },

        // ─── Provider (LOCKED at order creation) ─────────────────────────
        providerId: {
            type:     String,
            required: true,
            // 'own_fleet' | 'shiprocket' | 'delhivery' | ...
            // No enum — open to any future provider
            index:    true,
        },
        providerLocked: { type: Boolean, default: false },
        selectedBy: {
            type:    String,
            enum:    ['AUTO', 'ADMIN', 'MANUAL_OVERRIDE'],
            default: 'AUTO',
        },
        providerOverrideHistory: { type: [providerOverrideSchema], default: [] },

        // ─── Financial (all immutable or controlled) ─────────────────────
        // customerShippingCharge: IMMUTABLE after order creation.
        customerShippingCharge: { type: Number, default: 0, min: 0 },

        // estimatedDeliveryCost: Set from DeliveryEngine quote. IMMUTABLE after order.
        estimatedDeliveryCost: { type: Number, default: 0, min: 0 },

        // actualDeliveryCost: Set post-delivery.
        //   Own Fleet: = payoutAmount (set at payout time).
        //   Couriers:  = invoice amount (set via admin reconciliation).
        actualDeliveryCost: { type: Number, default: null },

        // shippingProfit: Computed when actualDeliveryCost is set.
        //   = customerShippingCharge - actualDeliveryCost
        //   Positive = platform profit, Negative = platform loss.
        shippingProfit: { type: Number, default: null },

        // ─── Package ─────────────────────────────────────────────────────
        packageWeight:      { type: Number, default: 500 }, // grams
        packageDimensions:  { type: packageDimensionsSchema, default: () => ({}) },
        packageDescription: { type: String },

        // ─── Status ──────────────────────────────────────────────────────
        status: {
            type:    String,
            enum:    [
                'pending',
                'confirmed',
                'ready_for_pickup',
                'pickup_scheduled',
                'picked_up',
                'shipped',
                'in_transit',
                'out_for_delivery',
                'delivered',
                'cancelled',
                'return_initiated',
                'returned',
                'failed',
            ],
            default: 'pending',
            index:   true,
        },
        statusHistory: { type: [statusHistorySchema], default: [] },

        // ─── Tracking ────────────────────────────────────────────────────
        providerOrderId: { type: String }, // ID assigned by the 3PL provider
        awbCode:       { type: String }, // sparse index declared via schema.index() below
        trackingUrl:   { type: String },
        courierName:   { type: String },
        labelUrl:      { type: String }, // cloud URL for shipping label PDF
        lastTrackedAt: { type: Date },

        // ─── Dates ───────────────────────────────────────────────────────
        estimatedPickupAt:   { type: Date },
        estimatedDeliveryAt: { type: Date },
        pickedUpAt:          { type: Date },
        deliveredAt:         { type: Date, index: true }, // used by escrow cron
        cancelledAt:         { type: Date },
        returnInitiatedAt:   { type: Date },

        // ─── Escrow ──────────────────────────────────────────────────────
        escrowStatus: {
            type:    String,
            enum:    ['held', 'release_pending', 'released', 'refunded'],
            default: 'held',
            index:   true,
        },
        escrowReleaseDate: { type: Date },

        // ─── COD (Any courier) ───────────────────────────────────────────
        // Points to CourierCODRemittance. Null for online payments or Own Fleet
        // (Own Fleet COD uses CashSettlement instead).
        codRemittanceId: {
            type: mongoose.Schema.Types.ObjectId,
            ref:  'CourierCODRemittance',
        },

        // ─── Provider Metadata ───────────────────────────────────────────
        // Provider's registered pickup location ID for this vendor's warehouse.
        // Set from Vendor.warehouseAddress.providerPickupLocationIds[providerId].
        providerPickupLocationId: { type: String },

        // Provider-specific metadata blob.
        // e.g., { shiprocketOrderId, shiprocketShipmentId, channelOrderId, ... }
        providerMetadata: { type: mongoose.Schema.Types.Mixed },

        // ─── OWN FLEET FIELDS ────────────────────────────────────────────
        // All fields below are null/undefined for courier-based shipments.

        deliveryBoyId: {
            type:  mongoose.Schema.Types.ObjectId,
            ref:   'DeliveryBoy',
            index: true,
        },
        deliveryAssignmentStatus: {
            type: String,
            enum: ['pending', 'assigned', 'accepted', 'rejected', 'manual_override', 'failed', 'cancelled'],
        },
        rejectedDeliveryBoys: [{ type: mongoose.Schema.Types.ObjectId, ref: 'DeliveryBoy' }],
        deliveryPriority: { type: Number },
        deliverySequence: { type: Number },

        // Delivery OTP (customer-facing — verified at doorstep)
        deliveryOtpHash:       { type: String, select: false },
        deliveryOtpExpiry:     { type: Date, select: false },
        deliveryOtpSentAt:     { type: Date },
        deliveryOtpAttempts:   { type: Number, default: 0 },
        deliveryOtpDebug:      { type: String, select: false },
        deliveryOtpVerifiedAt: { type: Date },

        // Pickup OTP (vendor-facing — verified when driver picks up package)
        pickupOtpHash:    { type: String, select: false },
        pickupOtpExpiry:  { type: Date, select: false },
        pickupOtpSentAt:  { type: Date },
        pickupOtpDebug:   { type: String, select: false },

        // Driver payout
        distance:                  { type: Number }, // km
        payoutAmount:              { type: Number }, // computed at delivery; = actualDeliveryCost for own_fleet
        deliveryPayoutProcessed:   { type: Boolean, default: false },
        deliveryPayoutProcessedAt: { type: Date },
        payoutStatus:              { type: String, enum: ['pending', 'processed', 'failed'], default: 'pending' },
        payoutError:               { type: String },

        // COD cash (Own Fleet only)
        isCashSettled:   { type: Boolean, default: false },
        cashSettlementId: {
            type: mongoose.Schema.Types.ObjectId,
            ref:  'CashSettlement',
        },

        // Which DeliveryRateConfig was used to compute payoutAmount
        payoutRateConfigId: {
            type: mongoose.Schema.Types.ObjectId,
            ref:  'DeliveryRateConfig',
        },

        // ─── Phase 8 Migration ───────────────────────────────────────────────
        // Set to true exclusively by the Phase 8 backfill migration script.
        // Enables idempotency (re-runs skip existing Shipments) and clean rollback
        // (db.shipments.deleteMany({ migratedFromOrder: true })).
        // Never set by normal application flow.
        migratedFromOrder: { type: Boolean, default: false, index: true },
    },
    { timestamps: true }

);

// ─── Indexes ─────────────────────────────────────────────────────────────────

shipmentSchema.index({ orderId: 1, vendorId: 1 });
shipmentSchema.index({ returnRequestId: 1, type: 1 });
shipmentSchema.index({ deliveryBoyId: 1, status: 1 });
shipmentSchema.index({ awbCode: 1 }, { sparse: true }); // sparse — only set for courier shipments
shipmentSchema.index({ status: 1, deliveredAt: 1 });    // escrow cron query
shipmentSchema.index({ providerId: 1, status: 1 });

// ─── Pre-save: Generate shipmentNumber ───────────────────────────────────────
// Uses timestamp + random suffix (not countDocuments) to avoid duplicate key
// errors under concurrent inserts — same pattern as DeliveryEngineRun.runId.
// Format: SHP-{year}-{base36-timestamp}-{4-random-chars}
// Example: SHP-2026-MRQ4Z5XA-SLBY

shipmentSchema.pre('save', async function (next) {
    if (this.isNew && !this.shipmentNumber) {
        const year = new Date().getFullYear();
        const ts   = Date.now().toString(36).toUpperCase();         // base-36 timestamp
        const rand = Math.random().toString(36).slice(2, 6).toUpperCase(); // 4 random chars
        this.shipmentNumber = `SHP-${year}-${ts}-${rand}`;
    }
    next();
});

// ─── Pre-save: Recompute shippingProfit when actualDeliveryCost is set ───────

shipmentSchema.pre('save', function (next) {
    if (
        this.isModified('actualDeliveryCost') &&
        this.actualDeliveryCost !== null &&
        this.actualDeliveryCost !== undefined
    ) {
        this.shippingProfit = parseFloat(
            (this.customerShippingCharge - this.actualDeliveryCost).toFixed(2)
        );
    }
    next();
});

const Shipment = mongoose.model('Shipment', shipmentSchema);
export default Shipment;
export { Shipment };
