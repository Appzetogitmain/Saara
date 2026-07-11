import Vendor from '../models/Vendor.model.js';
import Commission from '../models/Commission.model.js';

/**
 * Helper to update vendor balances when order items are delivered.
 * Transitions vendor escrow records to "held" with a release date,
 * and credits the vendor's onHoldBalance exactly once.
 *
 * FIX (CRIT-09): Replaced non-atomic findById+save with atomic $inc to eliminate
 * the read-modify-write race condition under concurrent delivery confirmations.
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
            const comm = await Commission.findOneAndUpdate(
                {
                    orderId:  order._id,
                    vendorId: vi.vendorId,
                    status:   { $ne: 'cancelled' },
                },
                {
                    $set: {
                        escrowStatus:     'held',
                        escrowReleaseDate: vi.escrowReleaseDate,
                    }
                },
                { new: true }
            );

            if (comm) {
                const earnings = parseFloat(Number(
                    comm.vendorNetEarnings || comm.vendorEarnings || vi.vendorEarnings || 0
                ).toFixed(2));

                if (earnings > 0) {
                    // ATOMIC $inc: no read-modify-write race condition
                    await Vendor.findByIdAndUpdate(
                        vi.vendorId,
                        { $inc: { onHoldBalance: earnings } }
                    );
                    console.log('[FINANCIAL_EVENT] onHoldBalance incremented', {
                        vendorId:  String(vi.vendorId),
                        orderId:   String(order._id || ''),
                        amount:    earnings,
                        timestamp: new Date().toISOString(),
                    });
                }
            } else {
                console.warn(`[Delivery Helper] Commission record not found for Order ${order.orderId}, Vendor ${vi.vendorId}`);
            }
        }
    }
};
