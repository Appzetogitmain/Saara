/**
 * Logistics Domain Event Name Constants
 *
 * RULE: All event names must be declared here. Never use raw strings when
 * emitting or listening to logistics events. Always import from this file.
 *
 * Names follow the pattern: ENTITY_ACTION (past tense — events describe what happened)
 *
 * Frozen at runtime so no code can accidentally mutate or add event names.
 */

const LOGISTICS_EVENTS = Object.freeze({
    // ─── Shipment Lifecycle ───────────────────────────────────────────────────
    SHIPMENT_CREATED:          'SHIPMENT_CREATED',
    SHIPMENT_CONFIRMED:        'SHIPMENT_CONFIRMED',
    SHIPMENT_PICKUP_SCHEDULED: 'SHIPMENT_PICKUP_SCHEDULED',
    SHIPMENT_PICKED_UP:        'SHIPMENT_PICKED_UP',
    SHIPMENT_IN_TRANSIT:       'SHIPMENT_IN_TRANSIT',
    SHIPMENT_OUT_FOR_DELIVERY: 'SHIPMENT_OUT_FOR_DELIVERY',
    SHIPMENT_DELIVERED:        'SHIPMENT_DELIVERED',
    SHIPMENT_CANCELLED:        'SHIPMENT_CANCELLED',
    SHIPMENT_RETURN_INITIATED: 'SHIPMENT_RETURN_INITIATED',
    SHIPMENT_RETURNED:         'SHIPMENT_RETURNED',

    // ─── Reverse Logistics ────────────────────────────────────────────────────
    REVERSE_SHIPMENT_UPDATED:  'REVERSE_SHIPMENT_UPDATED',

    // ─── Financial ────────────────────────────────────────────────────────────
    COD_RECEIVED:              'COD_RECEIVED',        // Courier remitted COD cash to platform
    ESCROW_RELEASED:           'ESCROW_RELEASED',     // Vendor wallet credited
    DRIVER_PAYOUT_PROCESSED:   'DRIVER_PAYOUT_PROCESSED',

    // ─── Provider / Engine ────────────────────────────────────────────────────
    DELIVERY_ENGINE_RUN_COMPLETED: 'DELIVERY_ENGINE_RUN_COMPLETED',
});

export default LOGISTICS_EVENTS;
export { LOGISTICS_EVENTS };
