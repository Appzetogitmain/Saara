import 'dotenv/config';
import connectDB from '../src/config/db.js';
import Order from '../src/models/Order.model.js';
import Vendor from '../src/models/Vendor.model.js';
import Commission from '../src/models/Commission.model.js';
import Settlement from '../src/models/Settlement.model.js';
import { calculateOrderFinancials } from '../src/services/financial.service.js';

const runMigration = async () => {
    await connectDB();
    console.log('Database connected for financial migration.');

    const orders = await Order.find({ isDeleted: { $ne: true } });
    console.log(`Found ${orders.length} active orders to migrate.`);

    let updatedOrdersCount = 0;
    let updatedCommissionsCount = 0;
    let updatedSettlementsCount = 0;

    for (const order of orders) {
        // Fetch or build vendor groups
        const commissions = await Commission.find({ orderId: order._id });
        
        const vendorGroups = [];
        for (const vi of order.vendorItems) {
            const comm = commissions.find(c => String(c.vendorId) === String(vi.vendorId));
            let commissionRate = comm ? comm.commissionRate : 10;
            
            if (!comm) {
                const vendorObj = await Vendor.findById(vi.vendorId);
                if (vendorObj) {
                    commissionRate = vendorObj.commissionRate || 10;
                }
            }

            vendorGroups.push({
                vendorId: String(vi.vendorId),
                subtotal: vi.subtotal || 0,
                commissionRate
            });
        }

        if (vendorGroups.length === 0) continue;

        // Calculate financials using the centralized service
        const couponDiscount = order.couponDiscount !== undefined ? order.couponDiscount : order.discount || 0;
        const financials = calculateOrderFinancials({
            subtotal: order.subtotal || 0,
            couponDiscount,
            shipping: order.shipping || 0,
            vendorGroups
        });

        // Update the order with new calculated properties using updateOne to bypass unrelated validation rules
        await Order.updateOne(
            { _id: order._id },
            {
                $set: {
                    discountedSubtotal: financials.discountedSubtotal,
                    taxableAmount: financials.taxableAmount,
                    commissionAmount: financials.commissionAmount,
                    vendorEarnings: financials.vendorEarnings,
                    escrowAmount: financials.escrowAmount,
                    settlementAmount: financials.settlementAmount,
                    platformRevenue: financials.platformRevenue
                }
            }
        );
        updatedOrdersCount++;

        // Update Commission records
        for (const vc of financials.vendorCalculations) {
            const comm = commissions.find(c => String(c.vendorId) === String(vc.vendorId));
            if (comm) {
                const oldEarnings = comm.vendorEarnings;
                comm.discountShare = vc.discountShare;
                comm.effectiveSubtotal = vc.effectiveSubtotal;
                comm.commission = vc.commission;
                comm.vendorEarnings = vc.vendorEarnings;
                await comm.save();
                updatedCommissionsCount++;

                // If already settled, update Settlement amount and adjust Vendor wallet balance if needed
                if (comm.status === 'paid') {
                    const settlements = await Settlement.find({ orderId: order._id, vendorId: vc.vendorId });
                    for (const sett of settlements) {
                        const earningsDifference = vc.vendorEarnings - oldEarnings;
                        if (Math.abs(earningsDifference) > 0.01) {
                            sett.amount = vc.vendorEarnings;
                            await sett.save();
                            updatedSettlementsCount++;

                            // Adjust vendor's wallet balance
                            const vendor = await Vendor.findById(vc.vendorId);
                            if (vendor) {
                                vendor.walletBalance = parseFloat((vendor.walletBalance + earningsDifference).toFixed(2));
                                await vendor.save();
                                console.log(`Adjusted Vendor ${vendor.storeName} wallet balance by ${earningsDifference.toFixed(2)} due to settlement recalculation.`);
                            }
                        }
                    }
                }
            }
        }
    }

    console.log(`\nMigration completed successfully:`);
    console.log(`- Orders updated: ${updatedOrdersCount}`);
    console.log(`- Commissions updated: ${updatedCommissionsCount}`);
    console.log(`- Settlements updated: ${updatedSettlementsCount}`);
    
    process.exit(0);
};

runMigration().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
