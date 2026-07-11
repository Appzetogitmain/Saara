/**
 * Centralized financial calculator for order checkout and settlements.
 * Enforces:
 * - Coupon cap business rule (couponDiscount = min(couponDiscount, subtotal))
 * - Proportional coupon discount distribution across order items
 * - Reuses item-specific tax rates on the discounted item subtotal
 * - Commission calculated on discounted subtotal (vendor-funded coupons)
 * - Vendor Earnings = effective subtotal - commission
 * - Escrow Amount = Vendor Earnings
 * - Settlement Amount = Vendor Earnings
 * - Platform Revenue = Commission
 * - Immediate two-decimal-place rounding
 */
export const calculateOrderFinancials = ({
    items, // array of { productId, price, quantity, taxRate, vendorId }
    couponDiscount,
    shipping, // total shipping
    vendorCommissions // object of { [vendorId]: commissionRate }
}) => {
    const rawCouponDiscount = Number(couponDiscount || 0);
    const rawShipping = Number(shipping || 0);

    // 1. Sort items deterministically and calculate original subtotals
    const sortedItems = [...items].sort((a, b) =>
        String(a.productId).localeCompare(String(b.productId))
    );

    let originalSubtotal = 0;
    const itemSubtotals = sortedItems.map(item => {
        const sub = (item.price || 0) * (item.quantity || 1);
        originalSubtotal += sub;
        return { ...item, sub };
    });

    originalSubtotal = parseFloat(originalSubtotal.toFixed(2));
    const actualCouponDiscount = parseFloat(Math.min(rawCouponDiscount, originalSubtotal).toFixed(2));
    const discountedSubtotal = parseFloat((originalSubtotal - actualCouponDiscount).toFixed(2));

    // 2. Distribute coupon discount share across items proportionally
    let distributedDiscountSum = 0;
    let totalTax = 0;
    
    const itemsWithDiscount = itemSubtotals.map((item, index) => {
        let discountShare = 0;
        if (actualCouponDiscount > 0 && originalSubtotal > 0) {
            if (index === itemSubtotals.length - 1) {
                discountShare = parseFloat((actualCouponDiscount - distributedDiscountSum).toFixed(2));
            } else {
                discountShare = parseFloat(((actualCouponDiscount * item.sub) / originalSubtotal).toFixed(2));
                distributedDiscountSum = parseFloat((distributedDiscountSum + discountShare).toFixed(2));
            }
        }
        
        const discountedItemSubtotal = parseFloat((item.sub - discountShare).toFixed(2));

        // Backward tax extraction for taxIncluded products (Refinement #13)
        // If tax is included in price: extract it backwards instead of adding 0
        let itemTax;
        let commissionBase; // commission is calculated on pre-tax base price
        if (item.taxIncluded) {
            const rate = Number(item.taxRate !== undefined ? item.taxRate : 18);
            // Extract: base = discounted / (1 + rate/100), tax = discounted - base
            const base = parseFloat((discountedItemSubtotal / (1 + rate / 100)).toFixed(2));
            itemTax = parseFloat((discountedItemSubtotal - base).toFixed(2));
            commissionBase = base; // commission on base price only
        } else {
            const rate = Number(item.taxRate !== undefined ? item.taxRate : 18);
            itemTax = parseFloat(((discountedItemSubtotal * rate) / 100).toFixed(2));
            commissionBase = discountedItemSubtotal;
        }
        totalTax = parseFloat((totalTax + itemTax).toFixed(2));

        return {
            ...item,
            discountShare,
            discountedItemSubtotal,
            commissionBase, // used in vendor grouping for correct commission calculation
            itemTax
        };
    });

    // 3. Group by vendor
    const vendorMap = {};
    itemsWithDiscount.forEach(item => {
        const vid = String(item.vendorId);
        if (!vendorMap[vid]) {
            vendorMap[vid] = {
                vendorId: vid,
                subtotal: 0,
                discountShare: 0,
                effectiveSubtotal: 0,
                commissionRate: vendorCommissions[vid] || 10,
                commission: 0,
                vendorEarnings: 0
            };
        }
        vendorMap[vid].subtotal = parseFloat((vendorMap[vid].subtotal + item.sub).toFixed(2));
        vendorMap[vid].discountShare = parseFloat((vendorMap[vid].discountShare + item.discountShare).toFixed(2));
        // Use commissionBase (pre-tax price for taxIncluded items, discounted price otherwise)
        const base = item.commissionBase !== undefined ? item.commissionBase : item.discountedItemSubtotal;
        vendorMap[vid].effectiveSubtotal = parseFloat((vendorMap[vid].effectiveSubtotal + base).toFixed(2));
    });

    let totalCommission = 0;
    let totalVendorEarnings = 0;

    const vendorCalculations = Object.values(vendorMap).map(v => {
        const commission = parseFloat(((v.effectiveSubtotal * v.commissionRate) / 100).toFixed(2));
        const vendorEarnings = parseFloat((v.effectiveSubtotal - commission).toFixed(2));

        totalCommission = parseFloat((totalCommission + commission).toFixed(2));
        totalVendorEarnings = parseFloat((totalVendorEarnings + vendorEarnings).toFixed(2));

        return {
            ...v,
            commission,
            vendorEarnings
        };
    });

    const tax = totalTax;
    const finalTotal = parseFloat((discountedSubtotal + rawShipping + tax).toFixed(2));

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
