import EventDispatcher from './services/eventDispatcher.service.js';

// Create a mock handler that simulates an asynchronous task
const mockHandler1 = async (payload) => {
    return new Promise((resolve) => {
        setTimeout(() => {
            console.log(`[Handler 1] Processed payload:`, payload);
            resolve();
        }, 100);
    });
};

// Create a mock handler that fails
const mockHandler2Failing = async (payload) => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            console.log(`[Handler 2] Failing intentionally...`);
            reject(new Error('Simulated failure in Handler 2'));
        }, 50);
    });
};

// Create another handler to prove it still runs despite Handler 2 failing
const mockHandler3 = async (payload) => {
    return new Promise((resolve) => {
        setTimeout(() => {
            console.log(`[Handler 3] Processed payload despite Handler 2 failure`);
            resolve();
        }, 150);
    });
};

async function runTests() {
    console.log('--- Testing Event Dispatcher ---');

    EventDispatcher.register('RETURN_APPROVED', mockHandler1);
    EventDispatcher.register('RETURN_APPROVED', mockHandler2Failing);
    EventDispatcher.register('RETURN_APPROVED', mockHandler3);

    console.log('Dispatching RETURN_APPROVED...');
    const startTime = Date.now();
    
    // The dispatch should await all of them concurrently, and isolate the failure
    await EventDispatcher.dispatch('RETURN_APPROVED', { returnRequestId: 'req-123' });
    
    const endTime = Date.now();
    console.log(`Dispatch completed in ${endTime - startTime}ms`);
    console.log('Test completed. Handlers 1 and 3 should have succeeded, Handler 2 should have logged a failure without crashing the process.');
}

runTests();
