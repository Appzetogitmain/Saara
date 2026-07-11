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
        // Find all commissions held in escrow
        const commissions = await Commission.find({
            status: { $in: ['pending', 'awaiting_settlement'] },
            escrowStatus: 'held'
        }).populate('orderId');

        console.log(`[Escrow Cron] Found ${commissions.length} commission records held in escrow.`);

        for (const comm of commissions) {
            try {
                const order = comm.orderId;
                if (!order || order.isDeleted) {
                    console.log(`[Escrow Cron] Skip: Order not found or deleted for commission ${comm._id}`);
                    continue;
                }

                // Check release date eligibility
                const releaseDate = comm.escrowReleaseDate;
                const isEligible = releaseDate 
                    ? releaseDate <= now 
                    : (order.status === 'delivered' && order.deliveredAt && order.deliveredAt <= sevenDaysAgo);

                if (!isEligible) {
                    continue;
                }

                // Check for active returns, exchanges, or disputes for this vendor and order
                const activeReturn = await ReturnRequest.findOne({
                    orderId: order._id,
                    vendorId: comm.vendorId,
                    status: { 
                        $in: ['pending', 'approved', 'pickup_pending', 'pickup_assigned', 'picked_up', 'delivered_to_vendor', 'replacement_preparing', 'replacement_ready', 'replacement_assigned', 'out_for_delivery'] 
                    }
                });

                if (activeReturn) {
                    console.log(`[Escrow Cron] Commission ${comm._id} (Order ${order.orderId}, Vendor ${comm.vendorId}) skipped: Active Return/Exchange in progress.`);
                    continue;
                }

                // Retrieve payout earnings
                const netPayout = Number(comm.vendorNetEarnings !== undefined ? comm.vendorNetEarnings : comm.vendorEarnings || 0);

                if (netPayout <= 0) {
                    // Update commission record and skip wallet update
                    comm.escrowStatus = 'released';
                    comm.status = 'paid';
                    comm.settlementStatus = 'paid';
                    comm.paidAt = now;
                    comm.releasedAt = now;
                    comm.walletCredit = 0;
                    await comm.save();
                    continue;
                }

                const vendor = await Vendor.findById(comm.vendorId);
                if (vendor) {
                    // 1. Update vendor wallet balances
                    vendor.walletBalance = parseFloat(((vendor.walletBalance || 0) + netPayout).toFixed(2));
                    if (vendor.onHoldBalance >= netPayout) {
                        vendor.onHoldBalance = parseFloat((vendor.onHoldBalance - netPayout).toFixed(2));
                    } else {
                        vendor.onHoldBalance = 0;
                    }
                    await vendor.save();

                    // 2. Create Settlement document
                    const settlement = await Settlement.create({
                        vendorId: vendor._id,
                        commissionIds: [comm._id],
                        amount: netPayout,
                        paymentMethod: 'wallet',
                        status: 'completed',
                        notes: `Auto-release of escrow for Order #${order.orderId}`
                    });

                    // 3. Update Commission record
                    comm.escrowStatus = 'released';
                    comm.status = 'paid';
                    comm.settlementStatus = 'paid';
                    comm.paidAt = now;
                    comm.releasedAt = now;
                    comm.settlementId = settlement._id;
                    comm.walletCredit = netPayout;
                    await comm.save();

                    // 4. Update the order's vendorItems array (for UI display status only, not for financials)
                    const orderDoc = await Order.findById(order._id);
                    if (orderDoc) {
                        orderDoc.vendorItems = (orderDoc.vendorItems || []).map(vi => {
                            if (String(vi.vendorId) === String(comm.vendorId)) {
                                vi.escrowStatus = 'released';
                                vi.settlementStatus = 'paid';
                                vi.releasedAt = now;
                                vi.walletCredit = netPayout;
                            }
                            return vi;
                        });

                        // Reevaluate top-level order escrowStatus
                        const allStatuses = orderDoc.vendorItems.map(vi => vi.escrowStatus || 'held');
                        if (allStatuses.every(s => s === 'released')) {
                            orderDoc.escrowStatus = 'released';
                        } else {
                            orderDoc.escrowStatus = 'partially_released';
                        }
                        await orderDoc.save();
                    }

                    // 5. Notify Vendor
                    await createNotification({
                        recipientId: vendor._id,
                        recipientType: 'vendor',
                        title: 'Payment Released',
                        message: `Payment of Rs.${netPayout} for Order #${order.orderId} has been released to your wallet.`,
                        type: 'payment',
                        data: { orderId: String(order.orderId), amount: netPayout }
                    });

                    // 6. Notify Admins of release completion
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

                    console.log(`[Escrow Cron] Successfully released escrow for commission ${comm._id} (Order ${order.orderId}, Vendor ${vendor.storeName}, Payout: Rs.${netPayout}).`);
                }
            } catch (commErr) {
                console.error(`[Escrow Cron] Error releasing commission ${comm._id}:`, commErr);
            }
        }
    } catch (err) {
        console.error('[Escrow Cron] Scanning error:', err);
    }
};
