/**
 * Centralized financial calculator for order checkout and settlements.
 * Enforces:
 * - Coupon cap business rule (couponDiscount = min(couponDiscount, subtotal))
 * - Proportional coupon discount distribution across vendors first, then items
 * - Reuses item-specific tax rates on the discounted item subtotal
 * - Commission calculated on discounted subtotal (vendor-funded coupons)
 * - Vendor Earnings = effective subtotal - commission
 * - Escrow Amount = Vendor Earnings
 * - Settlement Amount = Vendor Earnings
 * - Platform Revenue = Commission
 * - Immediate two-decimal-place rounding
 * - Exact reconciliation across all vendor-wise splits
 */
export const calculateOrderFinancials = ({
    items, // array of { productId, price, quantity, taxRate, taxIncluded, vendorId }
    couponDiscount,
    shipping, // total shipping
    vendorCommissions, // object of { [vendorId]: commissionRate }
    vendorShippings = {} // object of { [vendorId]: shippingAmount }
}) => {
    const rawCouponDiscount = Number(couponDiscount || 0);
    const rawShipping = Number(shipping || 0);

    // 1. Sort items deterministically
    const sortedItems = [...items].sort((a, b) =>
        String(a.productId || a.id).localeCompare(String(b.productId || b.id))
    );

    // Calculate original subtotals
    let originalSubtotal = 0;
    const itemSubtotals = sortedItems.map(item => {
        const price = Number(item.price || 0);
        const quantity = Number(item.quantity || 1);
        const sub = parseFloat((price * quantity).toFixed(2));
        originalSubtotal = parseFloat((originalSubtotal + sub).toFixed(2));
        return { ...item, sub };
    });

    const actualCouponDiscount = parseFloat(Math.min(rawCouponDiscount, originalSubtotal).toFixed(2));
    const discountedSubtotal = parseFloat((originalSubtotal - actualCouponDiscount).toFixed(2));

    // 2. Group items by vendor to compute vendor subtotals
    const vendorMap = {};
    itemSubtotals.forEach(item => {
        const vid = String(item.vendorId);
        if (!vendorMap[vid]) {
            vendorMap[vid] = {
                vendorId: vid,
                subtotal: 0,
                items: []
            };
        }
        vendorMap[vid].subtotal = parseFloat((vendorMap[vid].subtotal + item.sub).toFixed(2));
        vendorMap[vid].items.push(item);
    });

    const sortedVendors = Object.values(vendorMap).sort((a, b) =>
        String(a.vendorId).localeCompare(String(b.vendorId))
    );

    // 3. Proportional Coupon Distribution across Vendors
    let distributedDiscountSum = 0;
    sortedVendors.forEach((v, index) => {
        let discountShare = 0;
        if (actualCouponDiscount > 0 && originalSubtotal > 0) {
            if (index === sortedVendors.length - 1) {
                discountShare = parseFloat((actualCouponDiscount - distributedDiscountSum).toFixed(2));
            } else {
                discountShare = parseFloat(((actualCouponDiscount * v.subtotal) / originalSubtotal).toFixed(2));
                distributedDiscountSum = parseFloat((distributedDiscountSum + discountShare).toFixed(2));
            }
        }
        v.discountShare = discountShare;
    });

    // 4. Proportional Coupon Distribution across items under each vendor, and tax calculation
    const itemsWithDiscount = [];
    let totalTax = 0;
    let totalCommission = 0;
    let totalVendorEarnings = 0;

    sortedVendors.forEach(v => {
        let itemDiscountSum = 0;
        let itemShippingSum = 0;
        let itemTaxSum = 0;
        let itemCommissionSum = 0;
        let itemVendorEarningsSum = 0;

        const commissionRate = vendorCommissions[v.vendorId];
        if (commissionRate === undefined || commissionRate === null) {
            throw new Error(`Commission rate not found for vendor ${v.vendorId}. Ensure vendorCommissions is fully populated.`);
        }

        const vendorShipping = Number(vendorShippings[v.vendorId] || 0);

        v.items.forEach((item, index) => {
            // A. Coupon Discount Share
            let itemDiscountShare = 0;
            if (v.discountShare > 0 && v.subtotal > 0) {
                if (index === v.items.length - 1) {
                    itemDiscountShare = parseFloat((v.discountShare - itemDiscountSum).toFixed(2));
                } else {
                    itemDiscountShare = parseFloat(((v.discountShare * item.sub) / v.subtotal).toFixed(2));
                    itemDiscountSum = parseFloat((itemDiscountSum + itemDiscountShare).toFixed(2));
                }
            }

            const discountedItemSubtotal = parseFloat((item.sub - itemDiscountShare).toFixed(2));
            const rate = Number(item.taxRate !== undefined ? item.taxRate : 18);

            // B. Tax Included / Excluded calculation
            let itemTax = 0;
            let commissionBase = 0;
            if (item.taxIncluded) {
                const base = parseFloat((discountedItemSubtotal / (1 + rate / 100)).toFixed(2));
                itemTax = parseFloat((discountedItemSubtotal - base).toFixed(2));
                commissionBase = base;
            } else {
                itemTax = parseFloat(((discountedItemSubtotal * rate) / 100).toFixed(2));
                commissionBase = discountedItemSubtotal;
            }

            // C. Shipping Charge allocation
            let itemShipping = 0;
            if (vendorShipping > 0 && v.subtotal > 0) {
                if (index === v.items.length - 1) {
                    itemShipping = parseFloat((vendorShipping - itemShippingSum).toFixed(2));
                } else {
                    itemShipping = parseFloat(((vendorShipping * item.sub) / v.subtotal).toFixed(2));
                    itemShippingSum = parseFloat((itemShippingSum + itemShipping).toFixed(2));
                }
            }

            // D. Item Commission & Vendor Earnings
            const itemCommission = parseFloat(((commissionBase * commissionRate) / 100).toFixed(2));
            const itemVendorEarnings = parseFloat((commissionBase - itemCommission + itemTax).toFixed(2));

            // E. Final Line Total Paid by Customer
            const totalTaxAmount = parseFloat((itemTax).toFixed(2));
            const finalLineTotal = parseFloat((discountedItemSubtotal + (item.taxIncluded ? 0 : itemTax) + itemShipping).toFixed(2));

            itemsWithDiscount.push({
                productId: item.productId,
                name: item.name,
                image: item.image || '',
                price: item.price,
                quantity: item.quantity,
                taxRate: rate,
                taxIncluded: !!item.taxIncluded,
                lineSubtotal: item.sub,
                couponDiscount: itemDiscountShare,
                discountedSubtotal: discountedItemSubtotal,
                baseAmount: commissionBase,
                taxAmount: totalTaxAmount,
                shippingCharge: itemShipping,
                commissionRate: commissionRate,
                commissionAmount: itemCommission,
                vendorEarnings: itemVendorEarnings,
                platformCommission: itemCommission,
                finalLineTotal: finalLineTotal,
                vendorId: item.vendorId,
                variantKey: item.variantKey || null,
            });

            totalTax = parseFloat((totalTax + totalTaxAmount).toFixed(2));
            totalCommission = parseFloat((totalCommission + itemCommission).toFixed(2));
            totalVendorEarnings = parseFloat((totalVendorEarnings + itemVendorEarnings).toFixed(2));

            itemTaxSum = parseFloat((itemTaxSum + totalTaxAmount).toFixed(2));
            itemCommissionSum = parseFloat((itemCommissionSum + itemCommission).toFixed(2));
            itemVendorEarningsSum = parseFloat((itemVendorEarningsSum + itemVendorEarnings).toFixed(2));
        });

        // Store aggregated sums on vendor object for vendor calculations section below
        v.vendorTax = itemTaxSum;
        v.commission = itemCommissionSum;
        v.vendorEarnings = itemVendorEarningsSum;
        v.vendorShipping = vendorShipping;
    });

    // 5. Vendor final calculations (commission, earnings, tax, total paid by customer)
    const vendorCalculations = sortedVendors.map(v => {
        const commissionRate = vendorCommissions[v.vendorId];
        const effectiveSubtotal = parseFloat(
            itemsWithDiscount
                .filter(item => String(item.vendorId) === String(v.vendorId))
                .reduce((sum, item) => sum + item.baseAmount, 0)
                .toFixed(2)
        );

        const vendorTotalPaidByCustomer = parseFloat(
            itemsWithDiscount
                .filter(item => String(item.vendorId) === String(v.vendorId))
                .reduce((sum, item) => sum + item.finalLineTotal, 0)
                .toFixed(2)
        );

        return {
            vendorId: v.vendorId,
            subtotal: v.subtotal,
            discountShare: v.discountShare,
            effectiveSubtotal,
            commissionRate,
            commission: v.commission,
            vendorEarnings: v.vendorEarnings,
            vendorTax: v.vendorTax,
            vendorTotalPaidByCustomer
        };
    });

    const tax = totalTax;
    const finalTotal = parseFloat(itemsWithDiscount.reduce((sum, item) => sum + item.finalLineTotal, 0).toFixed(2));

    return {
        originalSubtotal,
        couponDiscount: actualCouponDiscount,
        discountedSubtotal,
        taxableAmount: discountedSubtotal,
        tax,
        finalTotal,
        commissionAmount: totalCommission,
        vendorEarnings: totalVendorEarnings,
        escrowAmount: totalVendorEarnings,
        settlementAmount: totalVendorEarnings,
        platformRevenue: totalCommission,
        vendorCalculations,
        items: itemsWithDiscount
    };
};
