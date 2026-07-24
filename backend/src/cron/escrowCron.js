import mongoose from 'mongoose';
import Order from '../models/Order.model.js';
import Vendor from '../models/Vendor.model.js';
import Admin from '../models/Admin.model.js';
import ReturnRequest from '../models/ReturnRequest.model.js';
import Commission from '../models/Commission.model.js';
import Settlement from '../models/Settlement.model.js';
import VendorWalletTransaction from '../models/VendorWalletTransaction.model.js';
import { createNotification } from '../services/notification.service.js';

// Module-level guard: prevents overlapping runs on single instance
let _cronRunning = false;

export const releaseEscrowPayments = async () => {
    if (_cronRunning) {
        console.warn('[Escrow Cron] Previous run still active — skipping this interval.');
        return;
    }
    _cronRunning = true;
    try {
        await _runEscrowRelease();
    } finally {
        _cronRunning = false;
    }
};

async function _runEscrowRelease() {
    console.log('[Escrow Cron] Starting daily auto-release scanner...');
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    try {
        // Find all commissions held in escrow — fix: removed dead 'awaiting_settlement' status
        const commissions = await Commission.find({
            status: { $in: ['pending'] },
            escrowStatus: 'held'
        }).populate('orderId');

        console.log(`[Escrow Cron] Found ${commissions.length} commission records held in escrow.`);

        let skippedCod = 0;
        let skippedReturn = 0;
        let skippedNotEligible = 0;
        let releasedCount = 0;

        for (const comm of commissions) {
            const session = await mongoose.startSession();
            // Collect data for post-transaction notifications (EXTERNAL API RULE)
            let notificationData = null;

            try {
                await session.withTransaction(async () => {
                    // ATOMIC CLAIM LOCK: prevents double-release on multi-server deployments
                    const lockedComm = await Commission.findOneAndUpdate(
                        { _id: comm._id, escrowStatus: 'held' },
                        { $set: { escrowStatus: 'processing' } },
                        { new: true, session }
                    );
                    if (!lockedComm) {
                        if (process.env.DEBUG_ESCROW === 'true') {
                            console.warn(`[Escrow Cron] Commission ${comm._id} already claimed — skipping.`);
                        }
                        return; // exit withTransaction safely
                    }

                    const order = comm.orderId;
                    if (!order || order.isDeleted) {
                        if (process.env.DEBUG_ESCROW === 'true') {
                            console.log(`[Escrow Cron] Skip: Order not found or deleted for commission ${comm._id}`);
                        }
                        // Mark failed to prevent infinite retry
                        await Commission.findByIdAndUpdate(comm._id, { escrowStatus: 'failed', notes: 'Order not found at escrow release time' }, { session });
                        return;
                    }

                    // Check COD/Cash order cash-settlement condition
                    const isCodOrCash = ['cod', 'cash'].includes(order.paymentMethod);
                    if (isCodOrCash && !order.isCashSettled) {
                        skippedCod++;
                        if (process.env.DEBUG_ESCROW === 'true') {
                            console.log(`[Escrow Cron] Skip: COD/Cash order ${order.orderId} is not cash-settled yet.`);
                        }
                        // Revert claim lock back to 'held' so it can be retried
                        await Commission.findByIdAndUpdate(comm._id, { escrowStatus: 'held' }, { session });
                        return;
                    }

                    // Check release date eligibility
                    const releaseDate = lockedComm.escrowReleaseDate;
                    const isEligible = releaseDate
                        ? releaseDate <= now
                        : (order.status === 'delivered' && order.deliveredAt && order.deliveredAt <= sevenDaysAgo);

                    if (!isEligible) {
                        skippedNotEligible++;
                        // Revert claim lock back to 'held'
                        await Commission.findByIdAndUpdate(comm._id, { escrowStatus: 'held' }, { session });
                        return;
                    }

                    // Check for active returns, exchanges, or disputes for this vendor and order
                    const activeReturn = await ReturnRequest.findOne({
                        orderId: order._id,
                        vendorId: comm.vendorId,
                        status: {
                            $in: ['pending', 'approved', 'pickup_pending', 'pickup_assigned', 'picked_up', 'delivered_to_vendor', 'replacement_preparing', 'replacement_ready', 'replacement_assigned', 'out_for_delivery']
                        }
                    }).session(session);

                    if (activeReturn) {
                        skippedReturn++;
                        if (process.env.DEBUG_ESCROW === 'true') {
                            console.log(`[Escrow Cron] Commission ${comm._id} (Order ${order.orderId}, Vendor ${comm.vendorId}) skipped: Active Return/Exchange in progress.`);
                        }
                        // Revert claim lock back to 'held'
                        await Commission.findByIdAndUpdate(comm._id, { escrowStatus: 'held' }, { session });
                        return;
                    }

                    // Retrieve payout earnings
                    const netPayout = Number(lockedComm.vendorNetEarnings !== undefined ? lockedComm.vendorNetEarnings : lockedComm.vendorEarnings || 0);

                    if (netPayout <= 0) {
                        // Update commission record and skip wallet update
                        await Commission.findByIdAndUpdate(comm._id, {
                            escrowStatus: 'released',
                            status: 'paid',
                            settlementStatus: 'paid',
                            paidAt: now,
                            releasedAt: now,
                            walletCredit: 0,
                        }, { session });
                        return;
                    }

                    const vendor = await Vendor.findById(comm.vendorId).session(session);
                    if (!vendor) {
                        // Vendor deleted — mark commission failed for manual review
                        await Commission.findByIdAndUpdate(comm._id, {
                            escrowStatus: 'failed',
                            notes: `Vendor ${comm.vendorId} not found at escrow release — manual review required`,
                        }, { session });
                        console.error('[Escrow Cron] Vendor not found — Commission marked failed', {
                            commissionId: String(comm._id),
                            vendorId:     String(comm.vendorId),
                            orderId:      String(order._id),
                            timestamp:    new Date().toISOString(),
                        });
                        return;
                    }

                    const walletBalanceBefore = vendor.walletBalance || 0;

                    // T2.6: Check onHoldBalance BEFORE updating wallet.
                    // Previously this check used stale data AFTER the update — false positives possible.
                    // Now: abort and mark failed if the vendor's onHoldBalance is less than what we're releasing.
                    const onHoldNow = vendor.onHoldBalance || 0;
                    if (onHoldNow < netPayout) {
                        console.error(`[ACCOUNTING_CRITICAL] onHoldBalance shortfall for vendor:${vendor._id} order:${order._id}. Required: ${netPayout}, Available: ${onHoldNow}`);
                        await Commission.findByIdAndUpdate(comm._id, {
                            escrowStatus: 'failed',
                            notes: `onHoldBalance shortfall: available=${onHoldNow}, required=${netPayout}. Manual review required.`,
                        }, { session });
                        return; // exit transaction, skip wallet update
                    }

                    // 1. Update vendor wallet balances atomically
                    const updatedVendor = await Vendor.findByIdAndUpdate(
                        vendor._id,
                        {
                            $inc: {
                                walletBalance:  netPayout,
                                onHoldBalance: -netPayout,
                            }
                        },
                        { new: true, session }
                    );

                    const walletBalanceAfter = updatedVendor.walletBalance;

                    // 2. Create Settlement document
                    const settlement = await Settlement.create([{
                        vendorId: vendor._id,
                        commissionIds: [comm._id],
                        amount: netPayout,
                        paymentMethod: 'wallet',
                        status: 'completed',
                        notes: `Auto-release of escrow for Order #${order.orderId}`
                    }], { session });

                    // 3. Update Commission record
                    await Commission.findByIdAndUpdate(comm._id, {
                        escrowStatus:     'released',
                        status:           'paid',
                        settlementStatus: 'paid',
                        paidAt:           now,
                        releasedAt:       now,
                        settlementId:     settlement[0]._id,
                        walletCredit:     netPayout,
                    }, { session });

                    // 4. Create ESCROW_RELEASE ledger entry for audit log
                    await VendorWalletTransaction.create([{
                        vendorId:            vendor._id,
                        type:                'ESCROW_RELEASE',
                        amount:              netPayout,
                        referenceId:         `ESCROW_RELEASE_${order._id}_${vendor._id}_${comm._id}`,
                        walletBalanceBefore: walletBalanceBefore,
                        walletBalanceAfter:  walletBalanceAfter,
                        performedBy:         { role: 'system', id: null },
                        relatedOrderId:      order._id,
                        notes:               `Escrow released for Order #${order.orderId} (Commission ${comm._id})`,
                    }], { session });

                    // 5. Update the order's vendorItems array (UI display only)
                    const orderDoc = await Order.findById(order._id).session(session);
                    if (orderDoc) {
                        orderDoc.vendorItems = (orderDoc.vendorItems || []).map(vi => {
                            if (String(vi.vendorId) === String(comm.vendorId)) {
                                vi.escrowStatus    = 'released';
                                vi.settlementStatus = 'paid';
                                vi.releasedAt      = now;
                                vi.walletCredit    = netPayout;
                            }
                            return vi;
                        });

                        // Reevaluate top-level order escrowStatus
                        const allStatuses = orderDoc.vendorItems.map(vi => vi.escrowStatus || 'held');
                        orderDoc.escrowStatus = allStatuses.every(s => s === 'released') ? 'released' : 'partially_released';
                        await orderDoc.save({ session });
                    }

                    console.log(`[FINANCIAL_EVENT] Escrow released`, {
                        commissionId: String(comm._id),
                        orderId:      String(order._id),
                        vendorId:     String(vendor._id),
                        amount:       netPayout,
                        timestamp:    new Date().toISOString(),
                    });

                    // Collect data for post-transaction notifications
                    releasedCount++;
                    notificationData = {
                        vendorId:    String(vendor._id),
                        vendorName:  vendor.storeName || String(vendor._id),
                        orderId:     String(order.orderId),
                        orderMongoId: String(order._id),
                        netPayout,
                    };
                });
            } catch (commErr) {
                console.error(`[Escrow Cron] Error releasing commission ${comm._id}:`, commErr);
            } finally {
                await session.endSession();
            }

            // EXTERNAL API RULE: Notifications called AFTER transaction commits
            if (notificationData) {
                try {
                    await createNotification({
                        recipientId:   notificationData.vendorId,
                        recipientType: 'vendor',
                        title:         'Payment Released',
                        message:       `Payment of ₹${notificationData.netPayout} for Order #${notificationData.orderId} has been released to your wallet.`,
                        type:          'payment',
                        data:          { orderId: notificationData.orderId, amount: notificationData.netPayout },
                    });

                    const admins = await Admin.find({ isActive: true }).select('_id').lean();
                    await Promise.allSettled(admins.map(admin =>
                        createNotification({
                            recipientId:   admin._id,
                            recipientType: 'admin',
                            title:         'Escrow Release Completed',
                            message:       `Escrow release completed for Order #${notificationData.orderId} — ₹${notificationData.netPayout} credited to vendor.`,
                            type:          'system',
                            data:          { orderId: notificationData.orderId },
                        })
                    ));
                } catch (notifyErr) {
                    console.error('[Escrow Cron] Notification failed:', notifyErr.message);
                }
            }
        }

        console.log(`[Escrow Cron] Scanner complete. Released: ${releasedCount}, Skipped COD (unsettled): ${skippedCod}, Skipped Active Return: ${skippedReturn}, Holding period pending: ${skippedNotEligible}`);
    } catch (err) {
        console.error('[Escrow Cron] Scanning error:', err);
    }
}
