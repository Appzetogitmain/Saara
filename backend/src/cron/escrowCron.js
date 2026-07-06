import mongoose from 'mongoose';
import Order from '../models/Order.model.js';
import Vendor from '../models/Vendor.model.js';
import ReturnRequest from '../models/ReturnRequest.model.js';
import Commission from '../models/Commission.model.js';
import Settlement from '../models/Settlement.model.js';
import { createNotification } from '../services/notification.service.js';

export const releaseEscrowPayments = async () => {
    console.log('[Escrow Cron] Starting daily auto-release scanner...');
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    try {
        // Find delivered orders held in escrow delivered more than 7 days ago
        const orders = await Order.find({
            status: 'delivered',
            escrowStatus: 'held',
            deliveredAt: { $lte: sevenDaysAgo }
        });

        console.log(`[Escrow Cron] Found ${orders.length} eligible orders for release evaluation.`);

        for (const order of orders) {
            try {
                // Check for active returns, exchanges, or disputes
                const activeReturn = await ReturnRequest.findOne({
                    orderId: order._id,
                    status: { 
                        $in: ['pending', 'approved', 'pickup_pending', 'pickup_assigned', 'picked_up', 'delivered_to_vendor', 'replacement_preparing', 'replacement_ready', 'replacement_assigned', 'out_for_delivery'] 
                    }
                });

                if (activeReturn) {
                    console.log(`[Escrow Cron] Order ${order.orderId} skipped: Active Return/Exchange in progress.`);
                    continue;
                }

                // Transition escrowStatus to released
                order.escrowStatus = 'released';
                await order.save();

                // Find all completed return requests for this order
                const completedReturns = await ReturnRequest.find({
                    orderId: order._id,
                    status: 'completed'
                });

                // Collect returned product IDs
                const returnedProductIds = new Set();
                for (const ret of completedReturns) {
                    if (Array.isArray(ret.items)) {
                        for (const retItem of ret.items) {
                            returnedProductIds.add(String(retItem.productId || retItem.id || ''));
                        }
                    }
                }

                // Group item payouts by vendor (excluding returned products)
                const payouts = {};
                for (const item of order.items) {
                    const productIdStr = String(item.productId || item.id || '');
                    if (returnedProductIds.has(productIdStr)) {
                        console.log(`[Escrow Cron] Excluding returned product ${productIdStr} from vendor payout.`);
                        continue;
                    }
                    const vId = String(item.vendorId);
                    if (!payouts[vId]) payouts[vId] = 0;
                    payouts[vId] += item.price * item.quantity;
                }

                // Distribute funds to vendors
                for (const [vendorId, amount] of Object.entries(payouts)) {
                    if (amount <= 0) continue; // skip zero payouts
                    const vendor = await Vendor.findById(vendorId);
                    if (vendor) {
                        vendor.walletBalance = (vendor.walletBalance || 0) + amount;
                        if (vendor.onHoldBalance >= amount) {
                            vendor.onHoldBalance -= amount;
                        } else {
                            vendor.onHoldBalance = 0;
                        }
                        await vendor.save();

                        // Find matching pending commissions
                        const commissions = await Commission.find({
                            orderId: order._id,
                            vendorId: vendor._id,
                            status: { $in: ['pending', 'awaiting_settlement'] }
                        });
                        const commissionIds = commissions.map(c => c._id);

                        if (commissionIds.length > 0) {
                            // Create Settlement document
                            const settlement = await Settlement.create({
                                vendorId: vendor._id,
                                commissionIds,
                                amount,
                                paymentMethod: 'wallet',
                                status: 'completed',
                                notes: `Auto-release of escrow for Order #${order.orderId}`
                            });

                            // Link commissions to settlement and set status to paid
                            await Commission.updateMany(
                                { _id: { $in: commissionIds } },
                                {
                                    $set: {
                                        status: 'paid',
                                        paidAt: new Date(),
                                        settlementId: settlement._id
                                    }
                                }
                            );
                        }

                        // Notify Vendor
                        await createNotification({
                            recipientId: vendor._id,
                            recipientType: 'vendor',
                            title: 'Payment Released',
                            message: `Payment of Rs.${amount} for Order #${order.orderId} has been released to your wallet.`,
                            type: 'payment',
                            data: { orderId: String(order.orderId), amount }
                        });
                    }
                }

                // Notify Admins of release completion
                const { default: Admin } = await import('../models/Admin.model.js');
                const admins = await Admin.find({ isActive: true }).select('_id').lean();
                for (const admin of admins) {
                    await createNotification({
                        recipientId: admin._id,
                        recipientType: 'admin',
                        title: 'Escrow Release Completed',
                        message: `Escrow release completed for Order #${order.orderId}.`,
                        type: 'system',
                        data: { orderId: String(order.orderId) }
                    });
                }

                console.log(`[Escrow Cron] Successfully released escrow for Order ${order.orderId}.`);
            } catch (itemErr) {
                console.error(`[Escrow Cron] Error releasing Order ${order.orderId}:`, itemErr);
            }
        }
    } catch (err) {
        console.error('[Escrow Cron] Scanning error:', err);
    }
};
