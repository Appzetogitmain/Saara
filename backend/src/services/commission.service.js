import Commission from '../models/Commission.model.js';
import Vendor from '../models/Vendor.model.js';
import { getDefaultCommissionRate } from './settingsService.js';

/**
 * Calculate commission for a vendor order item group.
 * 4.2 — Unified with financial.service.js logic:
 *   - Commission is applied to the PRE-TAX base price only (not tax-inclusive subtotal).
 *   - Matches the calculation done in calculateOrderFinancials().
 *
 * @param {string} vendorId
 * @param {number} subtotal        - Tax-inclusive subtotal for this vendor group
 * @param {number} [taxRate=18]    - Blended tax rate for the group (default 18%)
 * @param {boolean} [taxIncluded]  - Whether tax is already baked into the subtotal
 * @returns {{ commission, vendorEarnings, commissionRate }}
 */
export const calculateCommission = async (vendorId, subtotal, taxRate = 18, taxIncluded = false, precalculatedBase = null) => {
    const vendor = await Vendor.findById(vendorId).select('commissionRate');
    if (!vendor) throw new Error(`Vendor not found: ${vendorId}`);

    const defaultRate = await getDefaultCommissionRate();
    const commissionRate = vendor.commissionRate !== undefined && vendor.commissionRate !== null ? vendor.commissionRate : defaultRate;

    // If precalculated base is provided, use it directly (target architecture snapshot base)
    const commissionBase = precalculatedBase !== null && precalculatedBase !== undefined
        ? precalculatedBase
        : taxIncluded
            ? parseFloat((subtotal / (1 + taxRate / 100)).toFixed(2))
            : subtotal;

    const commission     = parseFloat(((commissionBase * commissionRate) / 100).toFixed(2));
    const vendorEarnings = parseFloat((commissionBase - commission).toFixed(2));

    return { commissionRate, commission, vendorEarnings, commissionBase };
};

/**
 * Get commission summary for a vendor
 */
export const getVendorCommissionSummary = async (vendorId) => {
    const result = await Commission.aggregate([
        { $match: { vendorId: vendorId } },
        {
            $group: {
                _id: '$status',
                total: { $sum: '$vendorEarnings' },
                count: { $sum: 1 },
            },
        },
    ]);

    return result.reduce((acc, r) => {
        acc[r._id] = { total: r.total, count: r.count };
        return acc;
    }, {});
};
