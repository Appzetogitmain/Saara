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
    items, // array of { productId, price, quantity, taxRate, vendorId }
    couponDiscount,
    shipping, // total shipping
    vendorCommissions, // object of { [vendorId]: commissionRate }
    vendorShippings = {} // object of { [vendorId]: shippingAmount }
}) => {
    const rawCouponDiscount = Number(couponDiscount || 0);
    const rawShipping = Number(shipping || 0);

    // 1. Sort items deterministically
    const sortedItems = [...items].sort((a, b) =>
        String(a.productId).localeCompare(String(b.productId))
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
        v.effectiveSubtotal = parseFloat((v.subtotal - discountShare).toFixed(2));
    });

    // 4. Proportional Coupon Distribution across items under each vendor, and tax calculation
    const itemsWithDiscount = [];
    let totalTax = 0;

    sortedVendors.forEach(v => {
        let itemDiscountSum = 0;
        v.items.forEach((item, index) => {
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
            const taxRate = Number(item.taxRate !== undefined ? item.taxRate : 18);
            const itemTax = parseFloat(((discountedItemSubtotal * taxRate) / 100).toFixed(2));
            totalTax = parseFloat((totalTax + itemTax).toFixed(2));

            itemsWithDiscount.push({
                ...item,
                discountShare: itemDiscountShare,
                discountedItemSubtotal,
                itemTax
            });
        });
    });

    // Sort itemsWithDiscount back to match original sortedItems order
    itemsWithDiscount.sort((a, b) =>
        String(a.productId).localeCompare(String(b.productId))
    );

    // 5. Vendor final calculations (commission, earnings, tax, total paid by customer)
    let totalCommission = 0;
    let totalVendorEarnings = 0;

    const vendorCalculations = sortedVendors.map(v => {
        const commissionRate = vendorCommissions[v.vendorId] || 10;
        const commission = parseFloat(((v.effectiveSubtotal * commissionRate) / 100).toFixed(2));
        const vendorEarnings = parseFloat((v.effectiveSubtotal - commission).toFixed(2));

        totalCommission = parseFloat((totalCommission + commission).toFixed(2));
        totalVendorEarnings = parseFloat((totalVendorEarnings + vendorEarnings).toFixed(2));

        // Calculate vendor tax from itemTax
        const vendorTax = parseFloat(
            itemsWithDiscount
                .filter(item => String(item.vendorId) === String(v.vendorId))
                .reduce((sum, item) => sum + item.itemTax, 0)
                .toFixed(2)
        );

        const vendorShipping = Number(vendorShippings[v.vendorId] || 0);
        const vendorTotalPaidByCustomer = parseFloat((v.effectiveSubtotal + vendorShipping + vendorTax).toFixed(2));

        return {
            vendorId: v.vendorId,
            subtotal: v.subtotal,
            discountShare: v.discountShare,
            effectiveSubtotal: v.effectiveSubtotal,
            commissionRate,
            commission,
            vendorEarnings,
            vendorTax,
            vendorTotalPaidByCustomer
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
