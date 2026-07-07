import fs from 'fs';

const filePath = 'backend/src/cron/escrowCron.js';
let content = fs.readFileSync(filePath, 'utf8');

// Normalize newlines to LF for safe replacement
let normalized = content.replace(/\r\n/g, '\n');

const blockSearch = `                // Distribute funds to vendors
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
                                notes: \`Auto-release of escrow for Order #\${order.orderId}\`
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
                            message: \`Payment of Rs.\${amount} for Order #\${order.orderId} has been released to your wallet.\`,
                            type: 'payment',
                            data: { orderId: String(order.orderId), amount }
                        });
                    }
                }`;

const blockReplace = `                // Distribute funds to vendors
                for (const [vendorId, amount] of Object.entries(payouts)) {
                    if (amount <= 0) continue; // skip zero payouts
                    const vendor = await Vendor.findById(vendorId);
                    if (vendor) {
                        // Find matching pending commissions
                        const commissions = await Commission.find({
                            orderId: order._id,
                            vendorId: vendor._id,
                            status: { $in: ['pending', 'awaiting_settlement'] }
                        });

                        const netPayout = commissions.reduce(
                            (sum, commission) => sum + Number(commission.vendorEarnings || 0),
                            0
                        );

                        if (netPayout <= 0) continue;

                        vendor.walletBalance = (vendor.walletBalance || 0) + netPayout;
                        if (vendor.onHoldBalance >= netPayout) {
                            vendor.onHoldBalance -= netPayout;
                        } else {
                            vendor.onHoldBalance = 0;
                        }
                        await vendor.save();

                        const commissionIds = commissions.map(c => c._id);

                        if (commissionIds.length > 0) {
                            // Create Settlement document
                            const settlement = await Settlement.create({
                                vendorId: vendor._id,
                                commissionIds,
                                amount: netPayout,
                                paymentMethod: 'wallet',
                                status: 'completed',
                                notes: \`Auto-release of escrow for Order #\${order.orderId}\`
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
                            message: \`Payment of Rs.\${netPayout} for Order #\${order.orderId} has been released to your wallet.\`,
                            type: 'payment',
                            data: { orderId: String(order.orderId), amount: netPayout }
                        });
                    }
                }`;

if (!normalized.includes(blockSearch)) {
    console.error("Could not find blockSearch target in escrowCron.js!");
    process.exit(1);
}

normalized = normalized.replace(blockSearch, blockReplace);

// Restore CRLF line endings
const finalContent = normalized.replace(/\n/g, '\r\n');
fs.writeFileSync(filePath, finalContent, 'utf8');
console.log("Successfully patched escrowCron.js!");
