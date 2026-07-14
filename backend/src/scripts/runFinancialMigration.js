import 'dotenv/config';
import mongoose from 'mongoose';
import Product from '../models/Product.model.js';
import Order from '../models/Order.model.js';

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
    console.error('❌ MONGO_URI not set in .env');
    process.exit(1);
}

const runFinancialMigration = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB');

        // 1. Migrate Products
        console.log('🔄 Running product tax fields migration...');
        const productRes = await Product.updateMany(
            { taxRate: { $exists: false } },
            { $set: { taxRate: 18, taxIncluded: false } }
        );
        console.log(`✅ Product migration completed. Modified: ${productRes.modifiedCount} products.`);

        // 2. Migrate Orders (Mark legacy orders for compatibility)
        console.log('🔄 Running order compatibility flag migration...');
        const orderRes = await Order.updateMany(
            { 'items.baseAmount': { $exists: false } },
            { $set: { legacyFinancialSnapshot: true } }
        );
        console.log(`✅ Order compatibility migration completed. Modified: ${orderRes.modifiedCount} orders.`);

    } catch (err) {
        console.error('❌ Migration failed:', err.message);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Disconnected from MongoDB');
        process.exit(0);
    }
};

runFinancialMigration();
