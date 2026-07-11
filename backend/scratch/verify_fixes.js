import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../src/config/db.js';
import Order from '../src/models/Order.model.js';
import DeliveryBoy from '../src/models/DeliveryBoy.model.js';
import DeliveryWalletTransaction from '../src/models/DeliveryWalletTransaction.model.js';
import Vendor from '../src/models/Vendor.model.js';
import Commission from '../src/models/Commission.model.js';
import Settlement from '../src/models/Settlement.model.js';
import CashSettlement from '../src/models/CashSettlement.model.js';
import ReturnRequest from '../src/models/ReturnRequest.model.js';
import { processDeliveryBoyPayout } from '../src/services/deliveryPayout.service.js';
import { releaseEscrowPayments } from '../src/cron/escrowCron.js';

const runTests = async () => {
    await connectDB();
    console.log('Connected to DB. Starting verification tests...');

    const testRiderId = new mongoose.Types.ObjectId();
    const testVendorId = new mongoose.Types.ObjectId();
    const testUserId = new mongoose.Types.ObjectId();

    // 1. Create a dummy delivery boy
    const driver = await DeliveryBoy.create({
        _id: testRiderId,
        name: 'Test Rider',
        phone: '1234567890',
        email: `rider_${Date.now()}@test.com`,
        password: 'dummy',
        passwordHash: 'dummy',
        walletBalance: 100,
        cashInHand: 0,
        currentLocation: { type: 'Point', coordinates: [0, 0] }
    });

    console.log(`Created test rider. Wallet: ${driver.walletBalance}, Cash: ${driver.cashInHand}`);

    // 2. Create a dummy vendor
    const vendor = await Vendor.create({
        _id: testVendorId,
        name: 'Test Vendor',
        storeName: 'Test Store',
        phone: '9876543210',
        email: `vendor_${Date.now()}@test.com`,
        password: 'dummy',
        passwordHash: 'dummy',
        walletBalance: 0,
        onHoldBalance: 1000,
        commissionRate: 10
    });

    // 3. Test Rider Delivery Payout & COD Collection (with balance sequence verification)
    console.log('\n--- TESTING DELIVERY BOY PAYOUT & COD BALANCE SEQUENCING ---');
    const orderCOD = await Order.create({
        orderId: `OD_COD_${Date.now()}`,
        userId: testUserId,
        items: [{
            productId: new mongoose.Types.ObjectId(),
            name: 'Item A',
            price: 500,
            quantity: 2,
            vendorId: testVendorId
        }],
        total: 1000,
        paymentMethod: 'cod',
        status: 'shipped',
        deliveryBoyId: testRiderId,
        distance: 10, // distance > 5: pay = 50 + (10-5)*5 = 75
        deliveryOtpHash: 'dummy_hash',
        deliveryOtpDebug: '123456'
    });

    const session = await mongoose.startSession();
    await session.withTransaction(async () => {
        await processDeliveryBoyPayout(orderCOD._id, testRiderId, session);
    });
    await session.endSession();

    // Re-fetch
    const updatedOrder = await Order.findById(orderCOD._id);
    const updatedDriver = await DeliveryBoy.findById(testRiderId);

    console.log('Updated Order Status:', updatedOrder.status);
    console.log('Order payout processed:', updatedOrder.deliveryPayoutProcessed);
    console.log('OTP Hash cleared:', updatedOrder.deliveryOtpHash === undefined);
    console.log('Driver Wallet (Expected: 175):', updatedDriver.walletBalance);
    console.log('Driver Cash In Hand (Expected: 1000):', updatedDriver.cashInHand);

    // Verify Ledger Sequential Balance correctness
    const ledgers = await DeliveryWalletTransaction.find({ orderId: orderCOD._id }).sort({ createdAt: 1 });
    console.log(`Found ${ledgers.length} ledger transactions.`);
    for (const tx of ledgers) {
        console.log(`Type: ${tx.type}, Amt: ${tx.amount}`);
        console.log(`  Wallet Before: ${tx.walletBalanceBefore} -> After: ${tx.walletBalanceAfter}`);
        console.log(`  Cash Before: ${tx.cashInHandBefore} -> After: ${tx.cashInHandAfter}`);
    }

    if (ledgers.length === 2) {
        const earning = ledgers.find(l => l.type === 'DELIVERY_EARNING');
        const collection = ledgers.find(l => l.type === 'COD_COLLECTION');

        if (earning && collection) {
            const ok = earning.cashInHandAfter === earning.cashInHandBefore && 
                       collection.walletBalanceAfter === collection.walletBalanceBefore;
            console.log('Ledger Sequential Integrity:', ok ? 'PASS' : 'FAIL');
        }
    }

    // 4. Test Cash Settlement Race Condition Simulation
    console.log('\n--- TESTING CASH SETTLEMENT CONCURRENCY LOCK ---');
    // Let's manually create another COD order and complete it to increase cashInHand
    const orderCOD2 = await Order.create({
        orderId: `OD_COD2_${Date.now()}`,
        userId: testUserId,
        items: [{
            productId: new mongoose.Types.ObjectId(),
            name: 'Item B',
            price: 400,
            quantity: 1,
            vendorId: testVendorId
        }],
        total: 400,
        paymentMethod: 'cod',
        status: 'shipped',
        deliveryBoyId: testRiderId,
        distance: 2
    });

    const session2 = await mongoose.startSession();
    await session2.withTransaction(async () => {
        await processDeliveryBoyPayout(orderCOD2._id, testRiderId, session2);
    });
    await session2.endSession();

    // Now driver has two COD orders completed: orderCOD (₹1000) and orderCOD2 (₹400). Total cashInHand: ₹1400.
    const orderIdsToSettle = [orderCOD._id, orderCOD2._id];
    console.log('Triggering concurrent settlements for orders:', orderIdsToSettle);

    const settleAction = async (adminId) => {
        const sess = await mongoose.startSession();
        let modified = 0;
        try {
            await sess.withTransaction(async () => {
                // Simulate controller logic with isCashSettled condition
                const pendingOrders = await Order.find({
                    _id: { $in: orderIdsToSettle },
                    deliveryBoyId: testRiderId,
                    isCashSettled: { $ne: true }
                }).session(sess);

                if (pendingOrders.length === 0) return;

                const settledAmount = pendingOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);

                // Create CashSettlement
                const [settlement] = await CashSettlement.create(
                    [{
                        deliveryBoyId: testRiderId,
                        amount: settledAmount,
                        collectedByAdmin: adminId,
                        orders: pendingOrders.map(o => o._id),
                        paymentMode: 'cash'
                    }],
                    { session: sess }
                );

                // Update orders with the condition
                const result = await Order.updateMany(
                    { _id: { $in: pendingOrders.map(o => o._id) }, isCashSettled: { $ne: true } },
                    { $set: { isCashSettled: true, settledAt: new Date(), cashSettlementId: settlement._id } },
                    { session: sess }
                );

                modified = result.modifiedCount;
                if (modified !== pendingOrders.length) {
                    throw new Error('Some orders in this session have already been settled.');
                }

                // Update boy
                const boy = await DeliveryBoy.findById(testRiderId).session(sess);
                boy.cashInHand = parseFloat((boy.cashInHand - settledAmount).toFixed(2));
                await boy.save({ session: sess });
            });
            return { status: 'SUCCESS', modified };
        } catch (err) {
            return { status: 'FAILED', error: err.message };
        } finally {
            await sess.endSession();
        }
    };

    // Run two settlements concurrently
    const results = await Promise.all([
        settleAction(new mongoose.Types.ObjectId()),
        settleAction(new mongoose.Types.ObjectId())
    ]);

    console.log('Concurrent Settlement Results:', results);
    const driverAfterSettlement = await DeliveryBoy.findById(testRiderId);
    console.log('Driver Cash In Hand after concurrent settlement (Expected: 0):', driverAfterSettlement.cashInHand);
    
    const countSettledOrders = await Order.countDocuments({ _id: { $in: orderIdsToSettle }, isCashSettled: true });
    console.log('Total settled orders count (Expected: 2):', countSettledOrders);

    // 5. Test Escrow Release Transaction & Concurrency Robustness
    console.log('\n--- TESTING ESCROW RELEASE TRANSACTION & CRASH ROBUSTNESS ---');
    // Create commission for orderCOD
    const commission = await Commission.create({
        orderId: orderCOD._id,
        vendorId: testVendorId,
        subtotal: 1000,
        commissionRate: 10,
        commission: 100,
        vendorEarnings: 900,
        status: 'pending'
    });

    // Make orderCOD eligible: delivered status, escrowStatus = held, deliveredAt = 8 days ago, isCashSettled = true
    await Order.updateOne(
        { _id: orderCOD._id },
        { 
            $set: { 
                status: 'delivered', 
                escrowStatus: 'held', 
                deliveredAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) 
            } 
        }
    );

    console.log('Running Escrow release cron scanner...');
    await releaseEscrowPayments();

    const finalOrder = await Order.findById(orderCOD._id);
    const finalVendor = await Vendor.findById(testVendorId);
    const finalCommission = await Commission.findById(commission._id);

    console.log('Order Escrow Status (Expected: released):', finalOrder.escrowStatus);
    console.log('Vendor Wallet Balance (Expected: 900):', finalVendor.walletBalance);
    console.log('Vendor On Hold Balance (Expected: 1000 - 900 = 100):', finalVendor.onHoldBalance);
    console.log('Commission Status (Expected: paid):', finalCommission.status);

    // CLEANUP
    await Order.deleteMany({ userId: testUserId });
    await DeliveryBoy.findByIdAndDelete(testRiderId);
    await Vendor.findByIdAndDelete(testVendorId);
    await Commission.deleteMany({ orderId: orderCOD._id });
    await Settlement.deleteMany({ vendorId: testVendorId });
    await DeliveryWalletTransaction.deleteMany({ deliveryBoyId: testRiderId });

    console.log('\nAll test validations completed!');
    await mongoose.disconnect();
};

runTests().catch(async (e) => {
    console.error(e);
    await mongoose.disconnect();
});
