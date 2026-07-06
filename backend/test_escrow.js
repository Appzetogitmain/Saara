import 'dotenv/config';
import connectDB from './src/config/db.js';
import Order from './src/models/Order.model.js';
import { releaseEscrowPayments } from './src/cron/escrowCron.js';
import mongoose from 'mongoose';

const testEscrow = async () => {
    // 1. Connect to Database
    await connectDB();
    console.log('\n======================================');
    console.log('Running Escrow Manual Tester...');
    console.log('======================================\n');

    // 2. Find any delivered order that has escrowStatus = 'held'
    let order = await Order.findOne({ status: 'delivered', escrowStatus: 'held' });
    if (!order) {
        order = await Order.findOne({ status: 'delivered', escrowStatus: 'released' });
        if (order) {
            console.log(`Found previously processed order ${order.orderId}. Resetting escrowStatus to "held" for re-testing...`);
            order.escrowStatus = 'held';
            await order.save();
        }
    }

    if (order) {
        console.log(`Found order ${order.orderId} in escrow (held).`);
        console.log(`Setting delivery date to 8 days ago to bypass 7-day restriction...`);
        
        // Backdate delivery date to 8 days ago
        order.deliveredAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
        await order.save();
        console.log(`Order ${order.orderId} backdated successfully.\n`);
    } else {
        console.log('No order in "delivered" state was found.');
        console.log('Please make sure you have placed an order and marked it as delivered first.\n');
    }

    // 3. Run the Escrow Release scanner
    console.log('Triggering Escrow Payout release script...');
    await releaseEscrowPayments();
    
    console.log('\nDisconnecting database...');
    await mongoose.disconnect();
    console.log('Done!');
};

testEscrow().catch(console.error);
