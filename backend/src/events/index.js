/**
 * Logistics Event Bus — Listener Registration
 *
 * This file is the single entry point for all logistics event listener registrations.
 * It must be imported ONCE at server startup (in server.js), after the DB connection
 * is established.
 *
 * ─── Rules ───────────────────────────────────────────────────────────────────
 * 1. Only import from this file in server.js — never import and re-register elsewhere.
 * 2. All listeners are registered exactly once. Calling initLogisticsListeners()
 *    more than once will cause duplicate listener registrations — the guard below
 *    prevents this.
 * 3. Adding a new listener in the future: create the file, import it here,
 *    add one line below. No other file needs changing.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import logisticsEventBus           from './logisticsEventBus.js';
import LOGISTICS_EVENTS            from './logisticsEvents.js';
import { shipmentCreatedListener } from './listeners/shipmentCreated.listener.js';
import { shipmentDeliveredListener } from './listeners/shipmentDelivered.listener.js';
import { shipmentCancelledListener } from './listeners/shipmentCancelled.listener.js';
import { codReceivedListener }     from './listeners/codReceived.listener.js';
import { escrowReleasedListener }  from './listeners/escrowReleased.listener.js';

let _initialized = false;

/**
 * Register all logistics event listeners on the singleton event bus.
 * Must be called once at server startup. Subsequent calls are no-ops.
 */
const initLogisticsListeners = () => {
    if (_initialized) {
        console.warn('[LogisticsEvents] initLogisticsListeners() called more than once — skipping duplicate registration.');
        return;
    }

    // ── Shipment Lifecycle ────────────────────────────────────────────────────
    logisticsEventBus.on(LOGISTICS_EVENTS.SHIPMENT_CREATED,   shipmentCreatedListener);
    logisticsEventBus.on(LOGISTICS_EVENTS.SHIPMENT_DELIVERED, shipmentDeliveredListener);
    logisticsEventBus.on(LOGISTICS_EVENTS.SHIPMENT_CANCELLED, shipmentCancelledListener);

    // ── Financial ─────────────────────────────────────────────────────────────
    logisticsEventBus.on(LOGISTICS_EVENTS.COD_RECEIVED,       codReceivedListener);
    logisticsEventBus.on(LOGISTICS_EVENTS.ESCROW_RELEASED,    escrowReleasedListener);

    _initialized = true;

    // Log the registration summary
    const registeredEvents = [
        LOGISTICS_EVENTS.SHIPMENT_CREATED,
        LOGISTICS_EVENTS.SHIPMENT_DELIVERED,
        LOGISTICS_EVENTS.SHIPMENT_CANCELLED,
        LOGISTICS_EVENTS.COD_RECEIVED,
        LOGISTICS_EVENTS.ESCROW_RELEASED,
    ];

    console.log(`[LogisticsEvents] ${registeredEvents.length} event listeners registered:`);
    registeredEvents.forEach(ev => {
        const count = logisticsEventBus.listenerCount(ev);
        console.log(`  → ${ev} (${count} listener${count !== 1 ? 's' : ''})`);
    });
};

export default initLogisticsListeners;
export { initLogisticsListeners };
