import 'dotenv/config';
import connectDB from '../src/config/db.js';
import Order from '../src/models/Order.model.js';
import Commission from '../src/models/Commission.model.js';

const migrate = async () => {
    console.log('=== STARTING FINANCIAL SCHEMAS MIGRATION ===');
    await connectDB();

    const commissions = await Commission.find({});
    console.log(`Found ${commissions.length} commission documents.`);

    let updatedCount = 0;
    for (const comm of commissions) {
        let dirty = false;
        
        if (comm.vendorSubtotal === undefined) {
            comm.vendorSubtotal = comm.subtotal || 0;
            dirty = true;
        }
        if (comm.vendorCouponDiscount === undefined) {
            comm.vendorCouponDiscount = comm.discountShare || 0;
            dirty = true;
        }
        if (comm.vendorDiscountedSubtotal === undefined) {
            comm.vendorDiscountedSubtotal = comm.effectiveSubtotal !== undefined ? comm.effectiveSubtotal : (comm.subtotal - (comm.discountShare || 0));
            dirty = true;
        }
        if (comm.vendorTax === undefined) {
            // Default tax to 18% of discounted subtotal
            comm.vendorTax = parseFloat((comm.vendorDiscountedSubtotal * 0.18).toFixed(2));
            dirty = true;
        }
        if (comm.vendorTotalPaidByCustomer === undefined) {
            comm.vendorTotalPaidByCustomer = parseFloat((comm.vendorDiscountedSubtotal + comm.vendorTax).toFixed(2));
            dirty = true;
        }
        if (comm.commissionAmount === undefined) {
            comm.commissionAmount = comm.commission || 0;
            dirty = true;
        }
        if (comm.vendorNetEarnings === undefined) {
            comm.vendorNetEarnings = comm.vendorEarnings || 0;
            dirty = true;
        }
        if (comm.escrowAmount === undefined) {
            comm.escrowAmount = comm.vendorEarnings || 0;
            dirty = true;
        }
        if (comm.escrowStatus === undefined) {
            comm.escrowStatus = comm.status === 'paid' ? 'released' : 'held';
            dirty = true;
        }
        if (comm.settlementStatus === undefined) {
            comm.settlementStatus = comm.status === 'paid' ? 'paid' : 'pending';
            dirty = true;
        }
        if (comm.releasedAt === undefined && comm.status === 'paid') {
            comm.releasedAt = comm.paidAt || new Date();
            dirty = true;
        }

        if (dirty) {
            await comm.save();
            updatedCount++;
        }
    }

    console.log(`Successfully migrated ${updatedCount} commission documents.`);
    process.exit(0);
};

migrate().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
