import 'dotenv/config';
import mongoose from 'mongoose';
import TicketType from '../models/TicketType.model.js';
import SupportTicket from '../models/SupportTicket.model.js';

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
    console.error('❌ MONGO_URI not set in .env');
    process.exit(1);
}

const defaultCategories = [
  {
    name: 'Order Issue',
    description: 'Issues related to order placement, processing, tracking',
    portals: ['customer'],
    icon: '🛒',
    sortOrder: 1,
    isSystem: false
  },
  {
    name: 'Payment Issue',
    description: 'Payment failures, double charges, payout settlement',
    portals: ['customer', 'vendor', 'delivery'],
    icon: '💳',
    sortOrder: 2,
    isSystem: false
  },
  {
    name: 'Delivery Issue',
    description: 'Delayed delivery, wrong item, delivery rider behaviour',
    portals: ['customer'],
    icon: '🚚',
    sortOrder: 3,
    isSystem: false
  },
  {
    name: 'Refund Request',
    description: 'Refund queries and status',
    portals: ['customer'],
    icon: '💰',
    sortOrder: 4,
    isSystem: false
  },
  {
    name: 'Product Quality',
    description: 'Damaged products, counterfeit claims',
    portals: ['customer'],
    icon: '📦',
    sortOrder: 5,
    isSystem: false
  },
  {
    name: 'Account Issue',
    description: 'Profile, settings, or access problems',
    portals: ['customer'],
    icon: '👤',
    sortOrder: 6,
    isSystem: false
  },
  {
    name: 'Product Listing',
    description: 'Issues adding or updating products',
    portals: ['vendor'],
    icon: '🏷️',
    sortOrder: 7,
    isSystem: false
  },
  {
    name: 'Inventory',
    description: 'Stock management and synchronization issues',
    portals: ['vendor'],
    icon: '📦',
    sortOrder: 8,
    isSystem: false
  },
  {
    name: 'Settlement',
    description: 'Payouts, bank accounts, pending balances',
    portals: ['vendor'],
    icon: '💰',
    sortOrder: 9,
    isSystem: false
  },
  {
    name: 'Store Verification',
    description: 'Store approval and KYC validation queries',
    portals: ['vendor'],
    icon: '🏢',
    sortOrder: 10,
    isSystem: false
  },
  {
    name: 'Orders',
    description: 'Processing vendor orders and shipments',
    portals: ['vendor'],
    icon: '📋',
    sortOrder: 11,
    isSystem: false
  },
  {
    name: 'Commission',
    description: 'Platform fees, payouts deduction questions',
    portals: ['vendor'],
    icon: '⚖️',
    sortOrder: 12,
    isSystem: false
  },
  {
    name: 'Pickup Issue',
    description: 'Merchant not available, store closed, package not ready',
    portals: ['delivery'],
    icon: '🏢',
    sortOrder: 13,
    isSystem: false
  },
  {
    name: 'Delivery Failed',
    description: 'Unable to complete delivery',
    portals: ['delivery'],
    icon: '❌',
    sortOrder: 14,
    isSystem: false
  },
  {
    name: 'Wrong Address',
    description: 'Pin mismatch, incorrect address instructions',
    portals: ['delivery'],
    icon: '📍',
    sortOrder: 15,
    isSystem: false
  },
  {
    name: 'Vehicle Issue',
    description: 'Breakdown, fuel shortage, transport problems',
    portals: ['delivery'],
    icon: '🚲',
    sortOrder: 16,
    isSystem: false
  },
  {
    name: 'Customer Not Available',
    description: 'Customer unreachable or refuse delivery',
    portals: ['delivery'],
    icon: '📞',
    sortOrder: 17,
    isSystem: false
  },
  {
    name: 'Technical Issue',
    description: 'App crashes, display errors, performance issues',
    portals: ['customer', 'vendor', 'delivery'],
    icon: '🐞',
    sortOrder: 90,
    isSystem: true
  },
  {
    name: 'Other',
    description: 'General queries and unspecified issues',
    portals: ['customer', 'vendor', 'delivery'],
    icon: '❓',
    sortOrder: 100,
    isSystem: true
  }
];

const migrate = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB');

        // 1. Seed default support categories
        console.log('🌱 Seeding support categories...');
        for (const cat of defaultCategories) {
            await TicketType.findOneAndUpdate(
                { name: cat.name },
                { $set: cat },
                { upsert: true, new: true }
            );
        }
        console.log('✅ Seeding completed.');

        // 2. Fetch the seeded "Other" category to use as a fallback
        const otherCategory = await TicketType.findOne({ name: 'Other' });
        if (!otherCategory) {
            throw new Error('Fallback category "Other" not found in seeded categories');
        }

        // 3. Find the test category named "one" (case-insensitive)
        const testCategory = await TicketType.findOne({ name: { $regex: /^one$/i } });
        if (testCategory) {
            console.log(`⚠️ Found test category "one" (ID: ${testCategory._id}). Migrating tickets...`);

            // Migrate all tickets pointing to the test category ID to otherCategory ID
            const result = await SupportTicket.updateMany(
                { ticketTypeId: testCategory._id },
                { $set: { ticketTypeId: otherCategory._id } }
            );
            console.log(`📦 Migrated ${result.modifiedCount} support tickets to "Other" category.`);

            // Delete the test category
            await TicketType.deleteOne({ _id: testCategory._id });
            console.log('🗑️ Deleted test category "one".');
        } else {
            console.log('ℹ️ No test category "one" found. Skipping migration.');
        }

    } catch (err) {
        console.error('❌ Migration failed:', err.message);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Disconnected from MongoDB');
        process.exit(0);
    }
};

migrate();
