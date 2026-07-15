import 'dotenv/config';
import mongoose from 'mongoose';
import Settings from '../models/Settings.model.js'; // Let's check if Settings.model.js exists. If not, mongoose will connect to collection 'settings'.

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
    console.error('❌ MONGO_URI not set in .env');
    process.exit(1);
}

const deleteConfig = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB');

        // Let's delete the Settings document atomically
        const res = await mongoose.connection.collection('settings').deleteOne({ key: 'product_tax_pricing_rules' });
        console.log(`✅ Legacy tax settings document removed. Deleted count: ${res.deletedCount}`);

    } catch (err) {
        console.error('❌ DB operations failed:', err.message);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Disconnected from MongoDB');
        process.exit(0);
    }
};

deleteConfig();
