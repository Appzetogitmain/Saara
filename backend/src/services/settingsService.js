import Settings from '../models/Settings.model.js';

/**
 * Retrieve the default platform commission rate configured in the admin dashboard settings.
 * Returns the configured rate as a number, or 10 as a default fallback.
 * @returns {Promise<number>}
 */
export const getDefaultCommissionRate = async () => {
    try {
        const settings = await Settings.findOne({ key: 'general' }).lean();
        if (settings && settings.value && settings.value.defaultCommissionRate !== undefined) {
            const rate = Number(settings.value.defaultCommissionRate);
            if (Number.isFinite(rate)) {
                return rate;
            }
        }
    } catch (err) {
        console.error('Error fetching default commission rate:', err);
    }
    return 10; // Default fallback
};

/**
 * Retrieve whether vendor approval is required from the general settings.
 * Returns true if required (default), or false if explicitly disabled.
 * @returns {Promise<boolean>}
 */
export const isVendorApprovalRequired = async () => {
    try {
        const settings = await Settings.findOne({ key: 'general' }).lean();
        if (settings && settings.value && settings.value.vendorApprovalRequired !== undefined) {
            return settings.value.vendorApprovalRequired !== false;
        }
    } catch (err) {
        console.error('Error fetching vendor approval required setting:', err);
    }
    return true; // Default fallback
};

