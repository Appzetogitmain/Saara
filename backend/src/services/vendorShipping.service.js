import { getPlatformShippingDefaults } from './settingsService.js';

const normalizeText = (value) => String(value || '').trim().toLowerCase();

const toNumber = (value, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

export const calculateVendorShippingForGroups = async ({
    vendorGroups = [],
    shippingAddress = {}, // kept for signature compatibility
    shippingOption = 'standard',
    couponType = null,
}) => {
    const { defaultShippingRate: platformDefaultShippingRate, freeShippingThreshold: platformFreeShippingThreshold } = await getPlatformShippingDefaults();
    const groups = Array.isArray(vendorGroups) ? vendorGroups : [];
    if (!groups.length) {
        return { totalShipping: 0, shippingByVendor: {} };
    }

    if (normalizeText(couponType) === 'freeship') {
        const freeMap = groups.reduce((acc, group) => {
            acc[String(group.vendorId)] = 0;
            return acc;
        }, {});
        return { totalShipping: 0, shippingByVendor: freeMap };
    }

    const shippingByVendor = {};

    groups.forEach((group) => {
        const vendorId = String(group.vendorId || '');
        const subtotal = Math.max(0, toNumber(group.subtotal, 0));
        // Use platform rules globally (vendor-specific settings have been deprecated and removed)
        if (platformFreeShippingThreshold > 0 && subtotal >= platformFreeShippingThreshold) {
            shippingByVendor[vendorId] = 0;
        } else {
            const fallbackStandard = Math.max(0, toNumber(platformDefaultShippingRate, 0));
            shippingByVendor[vendorId] = normalizeText(shippingOption) === 'express'
                ? (fallbackStandard * 2)
                : fallbackStandard;
        }
    });

    const totalShipping = Number(
        Object.values(shippingByVendor).reduce((sum, amount) => sum + toNumber(amount, 0), 0).toFixed(2)
    );

    return { totalShipping, shippingByVendor };
};
