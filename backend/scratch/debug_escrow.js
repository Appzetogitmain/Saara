import 'dotenv/config';
import connectDB from '../src/config/db.js';
import Order from '../src/models/Order.model.js';
import ReturnRequest from '../src/models/ReturnRequest.model.js';
import Vendor from '../src/models/Vendor.model.js';
import Commission from '../src/models/Commission.model.js';
import Settlement from '../src/models/Settlement.model.js';
import mongoose from 'mongoose';

const runDebug = async () => {
    await connectDB();
    console.log('Connected to DB');

    const orderId = 'ORD-1783341415762-3CQH';
    const order = await Order.findOne({ orderId });
    if (!order) {
        console.log(`Order ${orderId} not found.`);
        process.exit(1);
    }

    console.log(`\n=== Diagnosing Order: ${order.orderId} ===`);
    console.log(`escrowStatus: "${order.escrowStatus}"`);
    console.log(`status: "${order.status}"`);
    console.log(`deliveredAt: ${order.deliveredAt}`);

    // Backdate deliveredAt to 8 days ago
    order.deliveredAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    order.escrowStatus = 'held';
    await order.save();
    console.log('Delivered date backdated to 8 days ago. escrowStatus set to "held".');

    // Run the release logic step by step with console logs
    console.log('\n--- Step 1: Query active returns ---');
    const activeReturn = await ReturnRequest.findOne({
        orderId: order._id,
        status: { 
            $in: ['pending', 'approved', 'pickup_pending', 'pickup_assigned', 'picked_up', 'delivered_to_vendor', 'replacement_preparing', 'replacement_ready', 'replacement_assigned', 'out_for_delivery'] 
        }
    });
    console.log('Active return found:', activeReturn ? activeReturn._id : 'None');

    if (activeReturn) {
        console.log(`Skipped: Active Return/Exchange in progress.`);
        process.exit(0);
    }

    console.log('\n--- Step 2: Get completed returns ---');
    const completedReturns = await ReturnRequest.find({
        orderId: order._id,
        status: 'completed'
    });
    console.log(`Found ${completedReturns.length} completed returns.`);

    const returnedProductIds = new Set();
    for (const ret of completedReturns) {
        console.log(`ReturnRequest ${ret._id} items:`, JSON.stringify(ret.items));
        if (Array.isArray(ret.items)) {
            for (const retItem of ret.items) {
                const prodId = String(retItem.productId || retItem.id || '');
                returnedProductIds.add(prodId);
                console.log(`- Added returned product ID: "${prodId}"`);
            }
        }
    }

    console.log('\n--- Step 3: Map payouts ---');
    const payouts = {};
    for (const item of order.items) {
        const productIdStr = String(item.productId || item.id || '');
        console.log(`Checking order item productIdStr: "${productIdStr}", name: "${item.name}"`);
        if (returnedProductIds.has(productIdStr)) {
            console.log(`-> Excluded: returned product ${productIdStr}`);
            continue;
        }
        const vId = String(item.vendorId);
        if (!payouts[vId]) payouts[vId] = 0;
        payouts[vId] += item.price * item.quantity;
        console.log(`-> Included: vendor ${vId}, price: ${item.price}, quantity: ${item.quantity}`);
    }

    console.log('\nPayouts map:', payouts);

    console.log('\n--- Step 4: Distribute funds to vendors ---');
    for (const [vendorId, amount] of Object.entries(payouts)) {
        console.log(`Processing payout for vendor ${vendorId}, amount: ${amount}`);
        if (amount <= 0) {
            console.log('-> Skipped: amount <= 0');
            continue;
        }
        const vendor = await Vendor.findById(vendorId);
        if (!vendor) {
            console.log('-> Error: Vendor not found in DB!');
            continue;
        }
        console.log(`Vendor ${vendor.storeName || vendor.shopName || vendor._id} current wallet balance: ${vendor.walletBalance}, onHoldBalance: ${vendor.onHoldBalance}`);
        
        const commissions = await Commission.find({
            orderId: order._id,
            vendorId: vendor._id,
            status: { $in: ['pending', 'awaiting_settlement'] }
        });
        console.log(`Found ${commissions.length} pending/awaiting commissions:`, commissions.map(c => ({ id: c._id, status: c.status })));
    }

    await mongoose.disconnect();
    console.log('\nDisconnected.');
};

runDebug().catch(console.error);
