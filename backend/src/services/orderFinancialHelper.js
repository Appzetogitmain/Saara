import Vendor from '../models/Vendor.model.js';
import Commission from '../models/Commission.model.js';

/**
 * Helper to update vendor balances when order items are delivered.
 * Transitions vendor escrow records to "held" with a release date, 
 * and credits the vendor's onHoldBalance exactly once.
 */
export const handleOrderDeliveryBalances = async (order) => {
    if (!order || !order.vendorItems) return;
    
    for (const vi of order.vendorItems) {
        if (vi.status === 'delivered' && !vi.isOnHoldBalanceAdded) {
            const now = new Date();
            const escrowReleaseDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
            
            vi.deliveredAt = vi.deliveredAt || now;
            vi.escrowReleaseDate = vi.escrowReleaseDate || escrowReleaseDate;
            vi.isOnHoldBalanceAdded = true;
            
            // Find and update Commission record
            const comm = await Commission.findOne({
                orderId: order._id,
                vendorId: vi.vendorId,
                status: { $ne: 'cancelled' }
            });
            
            if (comm) {
                comm.escrowStatus = 'held';
                comm.escrowReleaseDate = vi.escrowReleaseDate;
                await comm.save();
                
                // Update Vendor onHoldBalance
                const vendor = await Vendor.findById(vi.vendorId);
                if (vendor) {
                    const earnings = comm.vendorNetEarnings || comm.vendorEarnings || vi.vendorEarnings || 0;
                    vendor.onHoldBalance = parseFloat(((vendor.onHoldBalance || 0) + earnings).toFixed(2));
                    await vendor.save();
                    console.log(`[Delivery Helper] Increased Vendor ${vendor.storeName} onHoldBalance by ${earnings} for Order ${order.orderId}`);
                }
            } else {
                console.warn(`[Delivery Helper] Commission record not found for Order ${order.orderId}, Vendor ${vi.vendorId}`);
            }
        }
    }
};
