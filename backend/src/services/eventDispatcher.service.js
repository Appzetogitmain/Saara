/**
 * Central Event Dispatcher (Queue-Ready)
 * 
 * A completely domain-agnostic publish-subscribe router.
 * It has zero knowledge of business logic, logistics, or database models.
 * It purely routes string-based events to registered handler functions.
 * 
 * Future Upgrade: When Redis/BullMQ is added, `dispatch()` will simply enqueue the payload,
 * and background workers will invoke these handlers asynchronously.
 */

class EventDispatcher {
    constructor() {
        this.handlers = new Map();
    }

    /**
     * Register a handler function for a specific event.
     * @param {string} eventName 
     * @param {Function} handler 
     */
    register(eventName, handler) {
        if (!this.handlers.has(eventName)) {
            this.handlers.set(eventName, []);
        }
        this.handlers.get(eventName).push(handler);
        console.log(`[EventDispatcher] Registered handler for ${eventName}`);
    }

    /**
     * Dispatch an event to all registered handlers concurrently.
     * Handlers execute in isolated contexts; a crash in one does not crash others.
     * 
     * @param {string} eventName 
     * @param {object} payload 
     */
    async dispatch(eventName, payload) {
        const eventHandlers = this.handlers.get(eventName);
        
        if (!eventHandlers || eventHandlers.length === 0) {
            console.log(`[EventDispatcher] No handlers registered for event: ${eventName}`);
            return;
        }

        console.log(`[EventDispatcher] Dispatching ${eventName} to ${eventHandlers.length} handler(s)`);

        // Execute all handlers concurrently and isolate failures using allSettled
        const results = await Promise.allSettled(
            eventHandlers.map(handler => handler(payload))
        );

        // Log failures to prevent silent swallowing
        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                console.error(`[EventDispatcher] Handler ${index} failed for event ${eventName}:`, result.reason);
            }
        });
    }
}

export default new EventDispatcher();
