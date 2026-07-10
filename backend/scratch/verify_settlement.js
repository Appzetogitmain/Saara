import 'dotenv/config';
import connectDB from '../src/config/db.js';
import Order from '../src/models/Order.model.js';
import Product from '../src/models/Product.model.js';
import Vendor from '../src/models/Vendor.model.js';
import Commission from '../src/models/Commission.model.js';
import ReturnRequest from '../src/models/ReturnRequest.model.js';
import Settlement from '../src/models/Settlement.model.js';
import mongoose from 'mongoose';
import { releaseEscrowPayments } from '../src/cron/escrowCron.js';
import { updateVendorReturnRequestStatus } from '../src/modules/vendor/controllers/return.controller.js';

import { calculateOrderFinancials } from '../src/services/financial.service.js';

const runAllTests = async () => {
    console.log('=== STARTING MATHEMATICAL VERIFICATION ===');

    // Test Case 1: Single Vendor
    console.log('\n--- Test Case 1: Single Vendor ---');
    const case1Result = calculateOrderFinancials({
        items: [
            { productId: 'p1', price: 1000, quantity: 1, taxRate: 18, vendorId: 'vendor1' }
        ],
        couponDiscount: 100,
        shipping: 0,
        vendorCommissions: { vendor1: 10 }
    });
    console.log(case1Result.vendorCalculations);
    if (case1Result.vendorCalculations[0].effectiveSubtotal !== 900 || case1Result.vendorCalculations[0].commission !== 90 || case1Result.vendorCalculations[0].vendorEarnings !== 810) {
        throw new Error('Test Case 1 Failed');
    }
    console.log('Test Case 1 Passed!');

    // Test Case 2: Two Vendors (Proportional)
    console.log('\n--- Test Case 2: Two Vendors ---');
    const case2Result = calculateOrderFinancials({
        items: [
            { productId: 'p1', price: 600, quantity: 1, taxRate: 18, vendorId: 'vendor1' },
            { productId: 'p2', price: 400, quantity: 1, taxRate: 18, vendorId: 'vendor2' }
        ],
        couponDiscount: 100,
        shipping: 0,
        vendorCommissions: { vendor1: 10, vendor2: 10 }
    });
    console.log(case2Result.vendorCalculations);
    const v1 = case2Result.vendorCalculations.find(r => r.vendorId === 'vendor1');
    const v2 = case2Result.vendorCalculations.find(r => r.vendorId === 'vendor2');
    if (v1.discountShare !== 60 || v1.effectiveSubtotal !== 540 || v1.commission !== 54 || v1.vendorEarnings !== 486) {
        throw new Error('Test Case 2: Vendor A Failed');
    }
    if (v2.discountShare !== 40 || v2.effectiveSubtotal !== 360 || v2.commission !== 36 || v2.vendorEarnings !== 324) {
        throw new Error('Test Case 2: Vendor B Failed');
    }
    console.log('Test Case 2 Passed!');

    // Test Case 3: Extreme Coupon
    console.log('\n--- Test Case 3: Extreme Coupon ---');
    const case3Result = calculateOrderFinancials({
        items: [
            { productId: 'p1', price: 100, quantity: 1, taxRate: 18, vendorId: 'vendor1' }
        ],
        couponDiscount: 100,
        shipping: 0,
        vendorCommissions: { vendor1: 10 }
    });
    console.log(case3Result.vendorCalculations);
    if (case3Result.vendorCalculations[0].effectiveSubtotal !== 0 || case3Result.vendorCalculations[0].commission !== 0 || case3Result.vendorCalculations[0].vendorEarnings !== 0) {
        throw new Error('Test Case 3 Failed');
    }
    console.log('Test Case 3 Passed!');

    // Test Case 4: Multi-vendor different commission rates
    console.log('\n--- Test Case 4: Different Commission Rates ---');
    const case4Result = calculateOrderFinancials({
        items: [
            { productId: 'p1', price: 600, quantity: 1, taxRate: 18, vendorId: 'vendor1' },
            { productId: 'p2', price: 400, quantity: 1, taxRate: 18, vendorId: 'vendor2' }
        ],
        couponDiscount: 100,
        shipping: 0,
        vendorCommissions: { vendor1: 10, vendor2: 20 }
    });
    console.log(case4Result.vendorCalculations);
    const v1_4 = case4Result.vendorCalculations.find(r => r.vendorId === 'vendor1');
    const v2_4 = case4Result.vendorCalculations.find(r => r.vendorId === 'vendor2');
    if (v1_4.discountShare !== 60 || v1_4.effectiveSubtotal !== 540 || v1_4.commission !== 54 || v1_4.vendorEarnings !== 486) {
        throw new Error('Test Case 4: Vendor A Failed');
    }
    if (v2_4.discountShare !== 40 || v2_4.effectiveSubtotal !== 360 || v2_4.commission !== 72 || v2_4.vendorEarnings !== 288) {
        throw new Error('Test Case 4: Vendor B Failed');
    }
    console.log('Test Case 4 Passed!');

    // Test Case 5: Percentage coupon with max cap
    console.log('\n--- Test Case 5: Percentage Coupon with Cap ---');
    const case5Result = calculateOrderFinancials({
        items: [
            { productId: 'p1', price: 3000, quantity: 1, taxRate: 18, vendorId: 'vendor1' },
            { productId: 'p2', price: 2000, quantity: 1, taxRate: 18, vendorId: 'vendor2' }
        ],
        couponDiscount: 500,
        shipping: 0,
        vendorCommissions: { vendor1: 10, vendor2: 10 }
    });
    console.log(case5Result.vendorCalculations);
    const v1_5 = case5Result.vendorCalculations.find(r => r.vendorId === 'vendor1');
    const v2_5 = case5Result.vendorCalculations.find(r => r.vendorId === 'vendor2');
    if (v1_5.discountShare !== 300 || v1_5.effectiveSubtotal !== 2700 || v1_5.commission !== 270 || v1_5.vendorEarnings !== 2430) {
        throw new Error('Test Case 5: Vendor A Failed');
    }
    if (v2_5.discountShare !== 200 || v2_5.effectiveSubtotal !== 1800 || v2_5.commission !== 180 || v2_5.vendorEarnings !== 1620) {
        throw new Error('Test Case 5: Vendor B Failed');
    }
    console.log('Test Case 5 Passed!');

    // Test Case 6: Dynamic Rounding (Paise differences)
    console.log('\n--- Test Case 6: Dynamic Rounding ---');
    const case6Result = calculateOrderFinancials({
        items: [
            { productId: 'p1', price: 333, quantity: 1, taxRate: 18, vendorId: 'vendor1' },
            { productId: 'p2', price: 333, quantity: 1, taxRate: 18, vendorId: 'vendor2' },
            { productId: 'p3', price: 334, quantity: 1, taxRate: 18, vendorId: 'vendor3' }
        ],
        couponDiscount: 100,
        shipping: 0,
        vendorCommissions: { vendor1: 10, vendor2: 10, vendor3: 10 }
    });
    console.log(case6Result.vendorCalculations);
    const sumDiscounts = case6Result.vendorCalculations.reduce((sum, v) => sum + v.discountShare, 0);
    console.log(`Sum of discounts: ${sumDiscounts}`);
    if (Math.abs(sumDiscounts - 100) > 0.001) {
        throw new Error('Test Case 6: Discounts do not sum to total coupon value');
    }
    console.log('Test Case 6 Passed!');

    // Test Case 7: Exact Example Order (₹2600 subtotal, ₹520 coupon discount, 8% commission)
    console.log('\n--- Test Case 7: User Example Order ---');
    const case7Result = calculateOrderFinancials({
        items: [
            { productId: 'p1', price: 2600, quantity: 1, taxRate: 18, vendorId: 'vendor1' }
        ],
        couponDiscount: 520,
        shipping: 0,
        vendorCommissions: { vendor1: 8 }
    });
    console.log(case7Result);
    if (case7Result.couponDiscount !== 520) throw new Error('Test Case 7: Coupon discount incorrect');
    if (case7Result.discountedSubtotal !== 2080) throw new Error('Test Case 7: Discounted selling price incorrect');
    if (case7Result.commissionAmount !== 166.40) throw new Error('Test Case 7: Platform commission incorrect');
    if (case7Result.vendorEarnings !== 1913.60) throw new Error('Test Case 7: Vendor earnings incorrect');
    if (case7Result.escrowAmount !== 1913.60) throw new Error('Test Case 7: Escrow amount incorrect');
    if (case7Result.settlementAmount !== 1913.60) throw new Error('Test Case 7: Settlement amount incorrect');
    if (case7Result.platformRevenue !== 166.40) throw new Error('Test Case 7: Platform revenue incorrect');
    console.log('Test Case 7 Passed!');


    // Integration tests
    console.log('\n=== CONNECTING DATABASE FOR INTEGRATION TEST ===');
    await connectDB();

    // Setup mock data
    const mockVendor = await Vendor.create({
        name: 'Integration Vendor',
        storeName: 'Integration Escrow Vendor',
        email: `vendor-int-${Date.now()}@test.com`,
        password: 'password123',
        walletBalance: 1000,
        onHoldBalance: 500,
        commissionRate: 10,
    });

    const product1 = await Product.create({
        name: 'Item 1 - Returned',
        price: 600,
        stockQuantity: 10,
        vendorId: mockVendor._id,
        categoryId: new mongoose.Types.ObjectId(),
        slug: `item-1-int-${Date.now()}`,
    });

    const product2 = await Product.create({
        name: 'Item 2 - Kept',
        price: 400,
        stockQuantity: 10,
        vendorId: mockVendor._id,
        categoryId: new mongoose.Types.ObjectId(),
        slug: `item-2-int-${Date.now()}`,
    });

    const orderItemId1 = new mongoose.Types.ObjectId();
    const orderItemId2 = new mongoose.Types.ObjectId();

    // Place Order: Subtotal = 1000, Coupon = 100 (10% off), Customer Paid = 900
    // Vendor discountShare = 100. effectiveSubtotal = 900.
    const mockOrder = await Order.create({
        orderId: `ORD-INT-${Date.now()}`,
        status: 'delivered',
        deliveredAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000), // delivered 8 days ago
        paymentStatus: 'paid',
        escrowStatus: 'held',
        items: [
            {
                _id: orderItemId1,
                productId: product1._id,
                vendorId: mockVendor._id,
                name: product1.name,
                price: 600,
                quantity: 1,
            },
            {
                _id: orderItemId2,
                productId: product2._id,
                vendorId: mockVendor._id,
                name: product2.name,
                price: 400,
                quantity: 1,
            }
        ],
        vendorItems: [
            {
                vendorId: mockVendor._id,
                vendorName: mockVendor.storeName,
                items: [
                    {
                        _id: orderItemId1,
                        productId: product1._id,
                        vendorId: mockVendor._id,
                        name: product1.name,
                        price: 600,
                        quantity: 1,
                    },
                    {
                        _id: orderItemId2,
                        productId: product2._id,
                        vendorId: mockVendor._id,
                        name: product2.name,
                        price: 400,
                        quantity: 1,
                    }
                ],
                subtotal: 1000,
                discount: 100, // snapshot
                status: 'delivered',
            }
        ],
        subtotal: 1000,
        couponDiscount: 100,
        discount: 100,
        total: 900,
    });

    // Recording Commission with proportional coupon
    const mockCommission = await Commission.create({
        orderId: mockOrder._id,
        vendorId: mockVendor._id,
        vendorName: mockVendor.storeName,
        subtotal: 1000,
        discountShare: 100,
        effectiveSubtotal: 900,
        commissionRate: 10,
        commission: 90,
        vendorEarnings: 810,
        status: 'pending',
        couponCode: 'SAVE100',
        couponType: 'fixed',
        couponValue: 100
    });

    console.log(`Placed order ${mockOrder.orderId} and recorded commission ${mockCommission._id}`);

    // Create a mock ReturnRequest for Item 1 (Price = 600)
    // Discount ratio = 100 / 1000 = 0.1 (10% off)
    // Refund amount should be: 600 * (1 - 0.1) = 540.
    const mockReturn = await ReturnRequest.create({
        orderId: mockOrder._id,
        vendorId: mockVendor._id,
        items: [
            {
                productId: product1._id,
                name: product1.name,
                quantity: 1,
            }
        ],
        requestType: 'return',
        status: 'delivered_to_vendor', // ready to be completed
        refundAmount: 540, // calculated based on discount ratio (600 - 60)
        refundStatus: 'pending',
        returnReason: 'Wrong Color',
    });

    // Simulate Return Completion recalculation
    const req = {
        params: { id: mockReturn._id.toString() },
        body: { status: 'completed' },
        user: { id: mockVendor._id.toString() }
    };

    let statusCalled = null;
    let jsonResponse = null;
    const res = {
        status: function(code) {
            statusCalled = code;
            return this;
        },
        json: function(data) {
            jsonResponse = data;
            return this;
        }
    };

    console.log('\n--- Completing the Return Request ---');
    await updateVendorReturnRequestStatus(req, res);
    console.log(`Controller status: ${statusCalled}`);

    // Verify Commission Recalculation
    // Kept subtotal = 400.
    // Kept discount share = 400 * 0.1 = 40.
    // Kept effective subtotal = 360.
    // Kept commission = 36.
    // Kept vendor earnings = 324.
    const updatedCommission = await Commission.findById(mockCommission._id);
    console.log('\n--- Verifying Commission After Recalculation ---');
    console.log(`Expected subtotal: 400, Actual: ${updatedCommission.subtotal}`);
    console.log(`Expected discountShare: 40, Actual: ${updatedCommission.discountShare}`);
    console.log(`Expected effectiveSubtotal: 360, Actual: ${updatedCommission.effectiveSubtotal}`);
    console.log(`Expected commission: 36, Actual: ${updatedCommission.commission}`);
    console.log(`Expected vendorEarnings: 324, Actual: ${updatedCommission.vendorEarnings}`);

    if (updatedCommission.subtotal !== 400 || updatedCommission.discountShare !== 40 || updatedCommission.effectiveSubtotal !== 360 || updatedCommission.vendorEarnings !== 324) {
        throw new Error('Integration: Partial return commission recalculation failed');
    }

    // Verify vendor onHoldBalance reduced by refundAmount (540)
    const updatedVendor = await Vendor.findById(mockVendor._id);
    console.log('\n--- Verifying Vendor Balances After Return ---');
    // Starting onHoldBalance (500) - refundAmount (540) = 0 (clamped)
    console.log(`Expected Vendor onHoldBalance: 0, Actual: ${updatedVendor.onHoldBalance}`);
    if (updatedVendor.onHoldBalance !== 0) {
        throw new Error('Integration: Vendor onHoldBalance clamping failed.');
    }

    // Run Daily Escrow cron
    console.log('\n--- Executing Escrow Cron auto-release ---');
    const balanceBeforeCron = updatedVendor.walletBalance;
    await releaseEscrowPayments();

    const finalVendor = await Vendor.findById(mockVendor._id);
    const finalOrder = await Order.findById(mockOrder._id);
    const finalCommission = await Commission.findById(mockCommission._id);

    console.log('\n--- Verifying Escrow Release Outcomes ---');
    console.log(`Order Escrow Status: ${finalOrder.escrowStatus}`);
    console.log(`Vendor wallet increased by: ${finalVendor.walletBalance - balanceBeforeCron} (Expected: 324)`);
    console.log(`Commission Status: ${finalCommission.status} (Expected: "paid")`);

    if (finalOrder.escrowStatus !== 'released') {
        throw new Error('Integration: Order escrow was not released');
    }
    if (finalVendor.walletBalance - balanceBeforeCron !== 324) {
        throw new Error('Integration: Vendor did not receive correct earnings of 324');
    }
    if (finalCommission.status !== 'paid') {
        throw new Error('Integration: Commission status was not set to "paid"');
    }

    // Clean up
    console.log('\nCleaning up mock documents...');
    await Order.deleteOne({ _id: mockOrder._id });
    await Product.deleteOne({ _id: product1._id });
    await Product.deleteOne({ _id: product2._id });
    await Vendor.deleteOne({ _id: mockVendor._id });
    await Commission.deleteOne({ _id: mockCommission._id });
    await ReturnRequest.deleteOne({ _id: mockReturn._id });
    await Settlement.deleteMany({ vendorId: mockVendor._id });

    console.log('\n=== ALL SETTLEMENT AND COUPON VERIFICATIONS SUCCESSFUL! ===');
    process.exit(0);
};

runAllTests().catch(err => {
    console.error('Verification suite failed:', err);
    process.exit(1);
});
