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

const runVerification = async () => {
    await connectDB();
    console.log('Connected to Database.');

    // 1. Create a mock vendor
    const mockVendor = await Vendor.create({
        name: 'Test Vendor Name',
        storeName: 'Test Escrow Vendor',
        email: `vendor-${Date.now()}@test.com`,
        password: 'password123',
        walletBalance: 1000,
        onHoldBalance: 500, // starting on-hold balance
        commissionRate: 10,
    });
    console.log(`Created mock Vendor: ${mockVendor._id}`);

    // 2. Create mock products
    const product1 = await Product.create({
        name: 'Item 1 - To be returned',
        price: 150,
        stockQuantity: 10,
        vendorId: mockVendor._id,
        categoryId: new mongoose.Types.ObjectId(),
        slug: `item-1-${Date.now()}`,
    });
    const product2 = await Product.create({
        name: 'Item 2 - To be kept',
        price: 350,
        stockQuantity: 10,
        vendorId: mockVendor._id,
        categoryId: new mongoose.Types.ObjectId(),
        slug: `item-2-${Date.now()}`,
    });
    console.log(`Created products: ${product1._id} and ${product2._id}`);

    // 3. Create a mock Order
    const orderItemId1 = new mongoose.Types.ObjectId();
    const orderItemId2 = new mongoose.Types.ObjectId();

    const mockOrder = await Order.create({
        orderId: `ORD-TEST-${Date.now()}`,
        status: 'delivered',
        deliveredAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000), // Delivered 8 days ago (bypass 7 day constraint)
        paymentStatus: 'paid',
        escrowStatus: 'held',
        items: [
            {
                _id: orderItemId1,
                productId: product1._id,
                vendorId: mockVendor._id,
                name: product1.name,
                price: 150,
                quantity: 1,
            },
            {
                _id: orderItemId2,
                productId: product2._id,
                vendorId: mockVendor._id,
                name: product2.name,
                price: 350,
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
                        price: 150,
                        quantity: 1,
                    },
                    {
                        _id: orderItemId2,
                        productId: product2._id,
                        vendorId: mockVendor._id,
                        name: product2.name,
                        price: 350,
                        quantity: 1,
                    }
                ],
                subtotal: 500,
                status: 'delivered',
            }
        ],
        subtotal: 500,
        total: 500,
    });
    console.log(`Created mock Order: ${mockOrder.orderId}`);

    // 4. Create mock Commission
    const mockCommission = await Commission.create({
        orderId: mockOrder._id,
        vendorId: mockVendor._id,
        vendorName: mockVendor.storeName,
        subtotal: 500,
        commissionRate: 10,
        commission: 50,
        vendorEarnings: 450,
        status: 'pending',
    });
    console.log(`Created mock Commission: ${mockCommission._id}`);

    // 5. Create a mock ReturnRequest for Item 1
    const mockReturn = await ReturnRequest.create({
        orderId: mockOrder._id,
        vendorId: mockVendor._id,
        items: [
            {
                productId: product1._id,
                name: product1.name,
                quantity: 1,
                reason: 'Wrong Size',
            }
        ],
        requestType: 'return',
        status: 'delivered_to_vendor', // ready to be completed
        refundAmount: 150,
        refundStatus: 'pending',
        returnReason: 'Wrong Size',
    });
    console.log(`Created mock ReturnRequest: ${mockReturn._id}`);

    // 6. Simulate calling updateVendorReturnRequestStatus to complete the return
    // We mock req and res objects
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
    console.log(`Controller responded with status: ${statusCalled}`);

    // 7. Verify DB updates immediately after return completion
    const updatedOrder = await Order.findById(mockOrder._id);
    console.log('\n--- Verifying Order Status After Return ---');
    console.log(`Expected status: "delivered", Actual: "${updatedOrder.status}"`);
    console.log(`Expected escrowStatus: "held", Actual: "${updatedOrder.escrowStatus}"`);
    console.log(`Expected paymentStatus: "paid", Actual: "${updatedOrder.paymentStatus}"`);

    if (updatedOrder.status !== 'delivered' || updatedOrder.escrowStatus !== 'held') {
        throw new Error('Verification failed: Order status/escrow status not correct for partial return.');
    }

    // Verify Commission recalculation
    const updatedCommission = await Commission.findById(mockCommission._id);
    console.log('\n--- Verifying Commission After Return ---');
    console.log(`Expected subtotal: 350, Actual: ${updatedCommission.subtotal}`);
    console.log(`Expected commission: 35, Actual: ${updatedCommission.commission}`);
    console.log(`Expected vendorEarnings: 315, Actual: ${updatedCommission.vendorEarnings}`);
    console.log(`Expected status: "pending", Actual: "${updatedCommission.status}"`);

    if (updatedCommission.subtotal !== 350 || updatedCommission.vendorEarnings !== 315) {
        throw new Error('Verification failed: Commission recalculation was not correct.');
    }

    // Verify Vendor onHoldBalance reduction
    const updatedVendor = await Vendor.findById(mockVendor._id);
    console.log('\n--- Verifying Vendor Balances After Return ---');
    // Starting onHoldBalance (500) - refundAmount (150) = 350
    console.log(`Expected Vendor onHoldBalance: 350, Actual: ${updatedVendor.onHoldBalance}`);
    if (updatedVendor.onHoldBalance !== 350) {
        throw new Error('Verification failed: Vendor onHoldBalance was not reduced correctly.');
    }

    // 8. Execute Escrow Cron Release Payments
    console.log('\n--- Running Escrow Release Cron Job ---');
    const balanceBeforeCron = updatedVendor.walletBalance;
    await releaseEscrowPayments();

    // 9. Verify Post-Cron State
    const finalVendor = await Vendor.findById(mockVendor._id);
    const finalOrder = await Order.findById(mockOrder._id);
    const finalCommission = await Commission.findById(mockCommission._id);
    const settlements = await Settlement.find({ vendorId: mockVendor._id });

    console.log('\n--- Verifying Post-Cron State ---');
    console.log(`Expected Order escrowStatus: "released", Actual: "${finalOrder.escrowStatus}"`);
    // Wallet should increase only by the kept item's earnings (315)
    console.log(`Vendor wallet balance before: ${balanceBeforeCron}, after: ${finalVendor.walletBalance}`);
    console.log(`Expected wallet increase: 315, Actual: ${finalVendor.walletBalance - balanceBeforeCron}`);
    console.log(`Expected Commission status: "paid", Actual: "${finalCommission.status}"`);
    console.log(`Settlements found: ${settlements.length}`);
    if (settlements.length > 0) {
        console.log(`Settlement 1 amount: ${settlements[0].amount}`);
    }

    // Assertions
    if (finalOrder.escrowStatus !== 'released') {
        throw new Error('Verification failed: Escrow status was not released.');
    }
    if (finalVendor.walletBalance - balanceBeforeCron !== 315) {
        throw new Error('Verification failed: Vendor wallet balance did not increase by exactly 315.');
    }
    if (finalCommission.status !== 'paid') {
        throw new Error('Verification failed: Commission status was not paid.');
    }
    if (settlements.length !== 1 || settlements[0].amount !== 315) {
        throw new Error('Verification failed: Settlement amount was not exactly 315.');
    }

    // Clean up
    console.log('\nCleaning up mock data...');
    await Order.deleteOne({ _id: mockOrder._id });
    await Product.deleteOne({ _id: product1._id });
    await Product.deleteOne({ _id: product2._id });
    await Vendor.deleteOne({ _id: mockVendor._id });
    await Commission.deleteOne({ _id: mockCommission._id });
    await ReturnRequest.deleteOne({ _id: mockReturn._id });
    await Settlement.deleteMany({ vendorId: mockVendor._id });

    console.log('\nVerification run successfully and all assertions passed!');
    process.exit(0);
};

runVerification().catch(err => {
    console.error('Verification error:', err);
    process.exit(1);
});
