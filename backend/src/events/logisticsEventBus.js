/**
 * Logistics Event Bus — Singleton EventEmitter
 *
 * This is the single event bus for all logistics domain events.
 * Import this wherever you need to emit or listen to logistics events.
 *
 * ─── Design Decisions ────────────────────────────────────────────────────────
 *
 * 1. SINGLETON: Node.js module system caches modules by resolved path.
 *    The same EventEmitter instance is returned on every import.
 *
 * 2. ERROR SAFETY: All listeners must wrap their logic in try/catch.
 *    The bus attaches a global 'error' event handler to prevent crashes
 *    from unhandled error events.
 *
 * 3. MAX LISTENERS: Set to a high value to prevent Node.js "possible EventEmitter
 *    memory leak" warnings as more listeners are registered over time.
 *    (Default limit is 10 — we will exceed that as the system grows.)
 *
 * 4. FUTURE-PROOF: When scaling to multiple processes (e.g., PM2 cluster mode),
 *    swap only this file's implementation for Redis pub/sub or BullMQ.
 *    Zero changes to any emitter or listener code — they all import the same interface.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { EventEmitter } from 'events';

class LogisticsEventBus extends EventEmitter {
    constructor() {
        super();

        // Raise the listener limit — we will have many listeners for the same events
        this.setMaxListeners(50);

        // Global error handler — prevents uncaught 'error' events from crashing the process
        this.on('error', (err) => {
            console.error('[LogisticsEventBus] Unhandled error event:', err?.message || err);
        });
    }

    /**
     * Emit a logistics domain event with a structured payload.
     * Always prefer this over calling .emit() directly so we get consistent logging.
     *
     * @param {string} eventName  - One of LOGISTICS_EVENTS constants
     * @param {object} payload    - Event payload object
     */
    emitEvent(eventName, payload) {
        const timestamp = new Date().toISOString();
        const enriched  = { ...payload, _eventName: eventName, _emittedAt: timestamp };

        if (process.env.NODE_ENV !== 'production') {
            console.log(`[LogisticsEventBus] Emitting: ${eventName}`, JSON.stringify(payload));
        }

        this.emit(eventName, enriched);
    }
}

// Export a singleton instance — same object returned on every import
const logisticsEventBus = new LogisticsEventBus();

export default logisticsEventBus;
export { logisticsEventBus };
