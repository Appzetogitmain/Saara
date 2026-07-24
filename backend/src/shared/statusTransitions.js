/**
 * Shared Status Transitions Configuration
 * Decouples state validation from presentation, used by admin, vendor, delivery boy controllers and workflow services.
 */

export const ALLOWED_STATUSES = [
    'pending',
    'approved',
    'pickup_pending',
    'pickup_assigned',
    'picked_up',
    'delivered_to_vendor',
    'replacement_preparing',
    'replacement_ready',
    'replacement_assigned',
    'out_for_delivery',
    'completed',
    'rejected'
];

export const EXCHANGE_TRANSITIONS = {
    pending: ['approved', 'rejected'],
    approved: ['pickup_pending'],
    pickup_pending: ['pickup_assigned'],
    pickup_assigned: ['picked_up'],
    picked_up: ['delivered_to_vendor'],
    delivered_to_vendor: ['replacement_preparing', 'replacement_ready', 'rejected'],
    replacement_preparing: ['replacement_ready'],
    replacement_ready: ['replacement_assigned'],
    replacement_assigned: ['out_for_delivery'],
    out_for_delivery: ['completed'],
    completed: [],
    rejected: [],
};

export const RETURN_TRANSITIONS = {
    pending: ['approved', 'rejected'],
    approved: ['pickup_pending'],
    pickup_pending: ['pickup_assigned'],
    pickup_assigned: ['picked_up'],
    picked_up: ['delivered_to_vendor'],
    delivered_to_vendor: ['completed', 'rejected'],
    completed: [],
    rejected: [],
};
