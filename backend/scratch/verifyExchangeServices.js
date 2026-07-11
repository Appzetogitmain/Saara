import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import { ALLOWED_STATUSES, EXCHANGE_TRANSITIONS, RETURN_TRANSITIONS } from '../src/shared/statusTransitions.js';
import * as exchangeService from '../src/services/exchange.service.js';
import * as exchangeWorkflow from '../src/services/exchangeWorkflow.service.js';

console.log('--- EXPORTED CONFIG VERIFICATION ---');
console.log('ALLOWED_STATUSES length:', ALLOWED_STATUSES.length);
console.log('EXCHANGE_TRANSITIONS pending next states:', EXCHANGE_TRANSITIONS.pending);
console.log('RETURN_TRANSITIONS pending next states:', RETURN_TRANSITIONS.pending);

console.log('\n--- EXCHANGE SERVICE FUNCTIONS VERIFICATION ---');
const functionsToVerify = [
    'resolveOrderItemVariantKey',
    'getVariantKeyFromVariant',
    'getOrderItemIdentifier',
    'findMatchingOrderItem',
    'generateReturnPickupOtp',
    'reserveReplacementStock',
    'restoreReservedStockOnRejection',
    'restoreReturnedStock'
];

for (const name of functionsToVerify) {
    if (typeof exchangeService[name] === 'function') {
        console.log(`[PASS] exchangeService.${name} is a function`);
    } else {
        console.error(`[FAIL] exchangeService.${name} is missing or not a function`);
    }
}

console.log('\n--- WORKFLOW SERVICE FUNCTIONS VERIFICATION ---');
const workflowFunctions = [
    'approve',
    'reject',
    'prepareReplacement',
    'markReplacementReady',
    'completeExchange',
    'transition',
    'handlePostSaveApproval',
    'handlePostSaveReplacementReady'
];

for (const name of workflowFunctions) {
    if (typeof exchangeWorkflow[name] === 'function') {
        console.log(`[PASS] exchangeWorkflow.${name} is a function`);
    } else {
        console.error(`[FAIL] exchangeWorkflow.${name} is missing or not a function`);
    }
}

console.log('\nVerification complete!');
process.exit(0);
