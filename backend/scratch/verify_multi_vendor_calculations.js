import assert from 'assert';
import { calculateOrderFinancials } from '../src/services/financial.service.js';

console.log('=== STARTING MULTI-VENDOR CALCULATIONS VERIFICATION ===\n');

try {
    // ----------------------------------------------------
    // Scenario 1: Multi-vendor order with fixed coupon
    // ----------------------------------------------------
    console.log('Testing Scenario 1: Multi-vendor order with fixed coupon...');
    const result1 = calculateOrderFinancials({
        items: [
            { productId: 'prod-A', price: 1000, quantity: 1, taxRate: 18, vendorId: 'vendor-A' },
            { productId: 'prod-B', price: 1000, quantity: 1, taxRate: 18, vendorId: 'vendor-B' }
        ],
        couponDiscount: 399.70,
        shipping: 100,
        vendorCommissions: {
            'vendor-A': 10,
            'vendor-B': 8
        },
        vendorShippings: {
            'vendor-A': 50,
            'vendor-B': 50
        }
    });

    // Subtotals and Coupon allocation checks
    assert.strictEqual(result1.originalSubtotal, 2000);
    assert.strictEqual(result1.couponDiscount, 399.70);
    assert.strictEqual(result1.discountedSubtotal, 1600.30);

    const calcA = result1.vendorCalculations.find(vc => vc.vendorId === 'vendor-A');
    const calcB = result1.vendorCalculations.find(vc => vc.vendorId === 'vendor-B');

    assert.ok(calcA && calcB, 'Vendor calculations must exist');
    assert.strictEqual(calcA.subtotal, 1000);
    assert.strictEqual(calcB.subtotal, 1000);

    // Assert exact proportional splits
    assert.strictEqual(calcA.discountShare, 199.85);
    assert.strictEqual(calcB.discountShare, 199.85);

    assert.strictEqual(calcA.effectiveSubtotal, 800.15);
    assert.strictEqual(calcB.effectiveSubtotal, 800.15);

    // Commission checks
    assert.strictEqual(calcA.commission, 80.02); // 800.15 * 10% = 80.015 -> rounded to 80.02
    assert.strictEqual(calcB.commission, 64.01); // 800.15 * 8% = 64.012 -> rounded to 64.01
    assert.strictEqual(result1.commissionAmount, 144.03); // 80.02 + 64.01

    // Earnings checks
    assert.strictEqual(calcA.vendorEarnings, 720.13); // 800.15 - 80.02
    assert.strictEqual(calcB.vendorEarnings, 736.14); // 800.15 - 64.01
    assert.strictEqual(result1.vendorEarnings, 1456.27); // 720.13 + 736.14

    // Customer Paid Amount checks (effectiveSubtotal + shipping + tax)
    assert.strictEqual(calcA.vendorTax, 144.03); // 800.15 * 18% = 144.027 -> 144.03
    assert.strictEqual(calcB.vendorTax, 144.03);
    assert.strictEqual(calcA.vendorTotalPaidByCustomer, 994.18); // 800.15 + 50 + 144.03
    assert.strictEqual(calcB.vendorTotalPaidByCustomer, 994.18); // 800.15 + 50 + 144.03

    console.log('✓ Scenario 1 passed successfully.\n');


    // ----------------------------------------------------
    // Scenario 2: Single-vendor order with coupon
    // ----------------------------------------------------
    console.log('Testing Scenario 2: Single-vendor order with coupon...');
    const result2 = calculateOrderFinancials({
        items: [
            { productId: 'prod-A1', price: 1000, quantity: 1, taxRate: 18, vendorId: 'vendor-A' }
        ],
        couponDiscount: 150,
        shipping: 50,
        vendorCommissions: {
            'vendor-A': 10
        },
        vendorShippings: {
            'vendor-A': 50
        }
    });

    assert.strictEqual(result2.originalSubtotal, 1000);
    assert.strictEqual(result2.couponDiscount, 150);
    assert.strictEqual(result2.discountedSubtotal, 850);

    const calcA2 = result2.vendorCalculations.find(vc => vc.vendorId === 'vendor-A');
    assert.strictEqual(calcA2.discountShare, 150);
    assert.strictEqual(calcA2.effectiveSubtotal, 850);
    assert.strictEqual(calcA2.commission, 85.00); // 850 * 10%
    assert.strictEqual(calcA2.vendorEarnings, 765.00); // 850 - 85
    assert.strictEqual(calcA2.vendorTax, 153.00); // 850 * 18% = 153

    console.log('✓ Scenario 2 passed successfully.\n');


    // ----------------------------------------------------
    // Scenario 3: Multi-vendor order with percentage coupon
    // ----------------------------------------------------
    console.log('Testing Scenario 3: Multi-vendor order with percentage coupon...');
    const result3 = calculateOrderFinancials({
        items: [
            { productId: 'prod-A', price: 500, quantity: 1, taxRate: 18, vendorId: 'vendor-A' },
            { productId: 'prod-B', price: 1000, quantity: 1, taxRate: 18, vendorId: 'vendor-B' }
        ],
        couponDiscount: 150, // 10% of 1500
        shipping: 80,
        vendorCommissions: {
            'vendor-A': 12,
            'vendor-B': 10
        },
        vendorShippings: {
            'vendor-A': 30,
            'vendor-B': 50
        }
    });

    assert.strictEqual(result3.originalSubtotal, 1500);
    assert.strictEqual(result3.couponDiscount, 150);
    assert.strictEqual(result3.discountedSubtotal, 1350);

    const calcA3 = result3.vendorCalculations.find(vc => vc.vendorId === 'vendor-A');
    const calcB3 = result3.vendorCalculations.find(vc => vc.vendorId === 'vendor-B');

    assert.strictEqual(calcA3.discountShare, 50.00); // 500 / 1500 * 150
    assert.strictEqual(calcB3.discountShare, 100.00); // 1000 / 1500 * 150

    assert.strictEqual(calcA3.effectiveSubtotal, 450.00);
    assert.strictEqual(calcB3.effectiveSubtotal, 900.00);

    assert.strictEqual(calcA3.commission, 54.00); // 450 * 12%
    assert.strictEqual(calcB3.commission, 90.00); // 900 * 10%

    assert.strictEqual(calcA3.vendorEarnings, 396.00);
    assert.strictEqual(calcB3.vendorEarnings, 810.00);

    console.log('✓ Scenario 3 passed successfully.\n');


    // ----------------------------------------------------
    // Scenario 4: Multi-vendor item-wise tax calculation
    // ----------------------------------------------------
    console.log('Testing Scenario 4: Item-wise tax calculations with rounding...');
    const result4 = calculateOrderFinancials({
        items: [
            { productId: 'prod-A1', price: 600, quantity: 1, taxRate: 18, vendorId: 'vendor-A' },
            { productId: 'prod-A2', price: 400, quantity: 1, taxRate: 12, vendorId: 'vendor-A' },
            { productId: 'prod-B1', price: 1000, quantity: 1, taxRate: 5, vendorId: 'vendor-B' }
        ],
        couponDiscount: 300, // 300 discount in total 2000 cart
        shipping: 100,
        vendorCommissions: {
            'vendor-A': 10,
            'vendor-B': 10
        },
        vendorShippings: {
            'vendor-A': 50,
            'vendor-B': 50
        }
    });

    // Total subtotal = 2000. Vendor A = 1000, Vendor B = 1000.
    // Vendor A discount share = 150. Vendor B discount share = 150.
    // Item A1 (subtotal 600) -> 90 discount share -> discounted subtotal = 510 -> tax = 510 * 18% = 91.80
    // Item A2 (subtotal 400) -> 60 discount share -> discounted subtotal = 340 -> tax = 340 * 12% = 40.80
    // Vendor A total tax = 91.80 + 40.80 = 132.60
    const calcA4 = result4.vendorCalculations.find(vc => vc.vendorId === 'vendor-A');
    assert.strictEqual(calcA4.vendorTax, 132.60);

    // Item B1 (subtotal 1000) -> 150 discount share -> discounted subtotal = 850 -> tax = 850 * 5% = 42.50
    const calcB4 = result4.vendorCalculations.find(vc => vc.vendorId === 'vendor-B');
    assert.strictEqual(calcB4.vendorTax, 42.50);

    // Total tax
    assert.strictEqual(result4.tax, 175.10);

    console.log('✓ Scenario 4 passed successfully.\n');

    console.log('=== ALL TESTS PASSED SUCCESSFULLY! ===');

} catch (error) {
    console.error('❌ Assertion failed or error occurred:', error);
    process.exit(1);
}
