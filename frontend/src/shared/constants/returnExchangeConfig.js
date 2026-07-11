/**
 * Unified return and exchange frontend configurations.
 * Contains presentation details (colors, icons, steps) and allowed transitions for frontend UI elements.
 */

export const RETURN_TIMELINE = [
    {
        status: 'pending',
        label: 'Pending Approval',
        color: 'bg-yellow-50 text-yellow-700 border-yellow-200',
        icon: 'Clock',
        description: 'Waiting for vendor review and approval'
    },
    {
        status: 'approved',
        label: 'Approved',
        color: 'bg-blue-50 text-blue-700 border-blue-200',
        icon: 'CheckCircle',
        description: 'Request approved, awaiting pickup arrangements'
    },
    {
        status: 'pickup_pending',
        label: 'Pickup Pending',
        color: 'bg-indigo-50 text-indigo-700 border-indigo-200',
        icon: 'Truck',
        description: 'Pickup scheduled, preparing delivery boy assignment'
    },
    {
        status: 'pickup_assigned',
        label: 'Pickup Assigned',
        color: 'bg-purple-50 text-purple-700 border-purple-200',
        icon: 'UserCheck',
        description: 'Rider assigned to pick up the return item'
    },
    {
        status: 'picked_up',
        label: 'Picked Up',
        color: 'bg-orange-50 text-orange-700 border-orange-200',
        icon: 'Package',
        description: 'Returned item picked up by rider, in transit to vendor'
    },
    {
        status: 'delivered_to_vendor',
        label: 'Delivered to Vendor',
        color: 'bg-teal-50 text-teal-700 border-teal-200',
        icon: 'Home',
        description: 'Returned item delivered to vendor warehouse'
    },
    {
        status: 'completed',
        label: 'Completed',
        color: 'bg-green-50 text-green-700 border-green-200',
        icon: 'CheckCircle2',
        description: 'Return processed, refund issued'
    },
    {
        status: 'rejected',
        label: 'Rejected',
        color: 'bg-red-50 text-red-700 border-red-200',
        icon: 'XCircle',
        description: 'Return request rejected'
    }
];

export const EXCHANGE_TIMELINE = [
    {
        status: 'pending',
        label: 'Pending Approval',
        color: 'bg-yellow-50 text-yellow-700 border-yellow-200',
        icon: 'Clock',
        description: 'Awaiting vendor review and stock check'
    },
    {
        status: 'approved',
        label: 'Approved',
        color: 'bg-blue-50 text-blue-700 border-blue-200',
        icon: 'CheckCircle',
        description: 'Exchange approved, replacement stock reserved'
    },
    {
        status: 'pickup_pending',
        label: 'Pickup Pending',
        color: 'bg-indigo-50 text-indigo-700 border-indigo-200',
        icon: 'Truck',
        description: 'Return pickup scheduled, assigning rider'
    },
    {
        status: 'pickup_assigned',
        label: 'Pickup Assigned',
        color: 'bg-purple-50 text-purple-700 border-purple-200',
        icon: 'UserCheck',
        description: 'Rider assigned to pick up return item'
    },
    {
        status: 'picked_up',
        label: 'Picked Up',
        color: 'bg-orange-50 text-orange-700 border-orange-200',
        icon: 'Package',
        description: 'Old item picked up by rider, in transit to vendor'
    },
    {
        status: 'delivered_to_vendor',
        label: 'Returned to Vendor',
        color: 'bg-teal-50 text-teal-700 border-teal-200',
        icon: 'Home',
        description: 'Old item received by vendor for inspection'
    },
    {
        status: 'replacement_preparing',
        label: 'Preparing Replacement',
        color: 'bg-sky-50 text-sky-700 border-sky-200',
        icon: 'PackageSearch',
        description: 'Vendor preparing the replacement item'
    },
    {
        status: 'replacement_ready',
        label: 'Replacement Ready',
        color: 'bg-cyan-50 text-cyan-700 border-cyan-200',
        icon: 'PackageOpen',
        description: 'Replacement ready, awaiting courier dispatch'
    },
    {
        status: 'replacement_assigned',
        label: 'Delivery Assigned',
        color: 'bg-violet-50 text-violet-700 border-violet-200',
        icon: 'UserCheck',
        description: 'Rider assigned to deliver replacement'
    },
    {
        status: 'out_for_delivery',
        label: 'Out for Delivery',
        color: 'bg-amber-50 text-amber-700 border-amber-200',
        icon: 'TruckIcon',
        description: 'Replacement item is out for delivery to customer'
    },
    {
        status: 'completed',
        label: 'Completed',
        color: 'bg-green-50 text-green-700 border-green-200',
        icon: 'CheckCircle2',
        description: 'Replacement item delivered successfully'
    },
    {
        status: 'rejected',
        label: 'Rejected',
        color: 'bg-red-50 text-red-700 border-red-200',
        icon: 'XCircle',
        description: 'Exchange request rejected'
    }
];

export const RETURN_TRANSITIONS = {
    pending: ['approved', 'rejected'],
    approved: ['pickup_pending', 'completed'],
    pickup_pending: ['pickup_assigned', 'completed'],
    pickup_assigned: ['picked_up'],
    picked_up: ['delivered_to_vendor'],
    delivered_to_vendor: ['completed', 'rejected'],
    completed: [],
    rejected: [],
};

export const EXCHANGE_TRANSITIONS = {
    pending: ['approved', 'rejected'],
    approved: ['pickup_pending'],
    pickup_pending: ['pickup_assigned'],
    pickup_assigned: ['picked_up'],
    picked_up: ['delivered_to_vendor'],
    delivered_to_vendor: ['replacement_preparing', 'rejected'],
    replacement_preparing: ['replacement_ready'],
    replacement_ready: ['replacement_assigned'],
    replacement_assigned: ['out_for_delivery'],
    out_for_delivery: ['completed'],
    completed: [],
    rejected: [],
};

/**
 * Gets the timeline config array based on requestType
 * @param {string} type - 'return' or 'exchange'
 */
export const getTimelineConfig = (type) => {
    return type === 'exchange' ? EXCHANGE_TIMELINE : RETURN_TIMELINE;
};

/**
 * Gets the status configuration object (label, color, icon, description)
 * @param {string} status - current status
 * @param {string} type - 'return' or 'exchange'
 */
export const getStatusConfig = (status, type) => {
    const timeline = getTimelineConfig(type);
    return timeline.find(item => item.status === status) || {
        status,
        label: status ? status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ') : 'Unknown',
        color: 'bg-gray-50 text-gray-700 border-gray-200',
        icon: 'HelpCircle',
        description: ''
    };
};
