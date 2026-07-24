import mongoose from 'mongoose';
import logger from '../utils/logger.js';
import Order from '../models/Order.model.js';
import Product from '../models/Product.model.js';
import Commission from '../models/Commission.model.js';
import Coupon from '../models/Coupon.model.js';
import Refund from '../models/Refund.model.js';
import Shipment from '../models/Shipment.model.js';
import { creditWallet } from './wallet.service.js';
import { cancelShipmentDeliveryAssignment } from './assignmentService.js';

const resolveOrderItemVariantKey = (productSnapshot, item) => {
    if (item?.variantKey) return item.variantKey;
    const variantObject = item?.variant || {};
    const size = String(variantObject?.size || '').trim();
    const color = String(variantObject?.color || '').trim();
    if (!size && !color) return null;
    const stockMap = productSnapshot?.variants?.stockMap;
    if (!stockMap) return null;
    const keys = stockMap instanceof Map ? Array.from(stockMap.keys()) : Object.keys(stockMap);
    for (const key of keys) {
        const parts = String(key).split('_');
        const keySize = parts[0] || '';
        const keyColor = parts[1] || '';
        if (
            (!size || keySize.toLowerCase() === size.toLowerCase()) &&
            (!color || keyColor.toLowerCase() === color.toLowerCase())
        ) {
            return key;
        }
    }
    return null;
};

/**
 * Reusable cancellation refund and inventory restoration processor.
 * Safely handles Full Order and Partial Package cancellations by User, Vendor, or Admin.
 */
export const processCancellationRefund = async ({
    orderId,
    vendorGroupId = null,
    cancelledBy = 'system',
    reason = 'Cancelled',
    comment = '',
    session = null,
}) => {
    let internalSession = session;
    let ownsSession = false;

    if (!internalSession) {
        internalSession = await mongoose.startSession();
        internalSession.startTransaction();
        ownsSession = true;
    }

    try {
        const query = mongoose.Types.ObjectId.isValid(orderId)
            ? { _id: orderId }
            : { orderId: orderId };

        const order = await Order.findOne(query).session(internalSession);
        if (!order) {
            throw new Error(`Order ${orderId} not found for cancellation.`);
        }

        let refundAmount = 0;
        let refundReference = '';
        let refundNotes = '';

        if (!vendorGroupId) {
            // ─────────────────────────────────────────────────────────────────
            // FULL ORDER CANCELLATION
            // ─────────────────────────────────────────────────────────────────
            const originalStatus = order.status;
            order.status = 'cancelled';
            order.cancelledAt = new Date();
            order.cancellationReason = reason;

            if (Array.isArray(order.vendorItems)) {
                order.vendorItems = order.vendorItems.map((vg) => ({
                    ...(vg.toObject ? vg.toObject() : vg),
                    status: 'cancelled',
                    cancelledAt: new Date(),
                    cancelledBy,
                    cancellationReason: reason,
                    cancellationComment: comment,
                }));
            }

            // Calculate refund amount
            if (order.paymentStatus === 'paid') {
                refundAmount = Number(order.total || 0);
            } else if (Number(order.walletAmountUsed || 0) > 0) {
                refundAmount = Number(order.walletAmountUsed || 0);
            }

            refundReference = `ORDER_CANCEL_REFUND_${order._id}`;
            refundNotes = `Refund: Order #${order.orderId} cancelled by ${cancelledBy} (${reason})`;

            // Perform Wallet Credit if user is registered and refund > 0
            if (refundAmount > 0 && order.userId) {
                await creditWallet(
                    order.userId,
                    refundAmount,
                    'cancel_refund',
                    {
                        orderId: order._id,
                        orderNumber: order.orderId,
                        reason,
                        comment,
                        description: `Refunded ₹${refundAmount} to wallet for cancelled Order #${order.orderId}`,
                        reference: refundReference,
                    },
                    internalSession
                );

                await Refund.create(
                    [
                        {
                            orderId: order._id,
                            userId: order.userId,
                            amount: refundAmount,
                            referenceId: refundReference,
                            method: 'wallet_credit',
                            destination: 'wallet',
                            status: 'completed',
                            notes: refundNotes,
                        },
                    ],
                    { session: internalSession }
                );

                order.paymentStatus = 'refunded';
            }

            await order.save({ session: internalSession });

            // Restore Product Inventory Stock
            if (originalStatus !== 'payment_pending') {
                for (const item of order.items || []) {
                    const quantity = Number(item.quantity || 0);
                    if (quantity <= 0) continue;

                    const productSnapshot = await Product.findById(item.productId)
                        .select('variants.stockMap variants.prices')
                        .session(internalSession)
                        .lean();
                    const variantKey = resolveOrderItemVariantKey(productSnapshot, item);

                    const incUpdate = { stockQuantity: quantity };
                    if (variantKey) {
                        incUpdate[`variants.stockMap.${variantKey}`] = quantity;
                    }

                    const product = await Product.findByIdAndUpdate(
                        item.productId,
                        { $inc: incUpdate },
                        { new: true, session: internalSession }
                    );
                    if (!product) continue;

                    const nextStockState =
                        product.stockQuantity <= 0
                            ? 'out_of_stock'
                            : product.stockQuantity <= product.lowStockThreshold
                            ? 'low_stock'
                            : 'in_stock';

                    await Product.updateOne(
                        { _id: product._id },
                        { $set: { stock: nextStockState } },
                        { session: internalSession }
                    );
                }
            }

            // Restore Coupon Usage Slot
            if (order.couponCode) {
                const couponFilter = order.couponId
                    ? { _id: order.couponId, usedCount: { $gt: 0 } }
                    : { code: order.couponCode.toUpperCase(), usedCount: { $gt: 0 } };
                await Coupon.updateOne(
                    couponFilter,
                    { $inc: { usedCount: -1 } },
                    { session: internalSession }
                );
            }

            // Reverse Vendor Commissions
            await Commission.updateMany(
                {
                    orderId: order._id,
                    status: { $ne: 'cancelled' },
                },
                {
                    $set: {
                        status: 'cancelled',
                        escrowStatus: 'cancelled',
                        paidAt: null,
                        settlementId: null,
                    },
                },
                { session: internalSession }
            );

            // Cancel all associated shipments
            const shipments = await Shipment.find({ orderId: order._id }).session(internalSession);
            for (const shipment of shipments) {
                await cancelShipmentDeliveryAssignment(shipment._id, reason, internalSession);
            }

        } else {
            // ─────────────────────────────────────────────────────────────────
            // PARTIAL PACKAGE / VENDOR GROUP CANCELLATION
            // ─────────────────────────────────────────────────────────────────
            const vGroupIndex = (order.vendorItems || []).findIndex(
                (vg) =>
                    String(vg._id) === String(vendorGroupId) ||
                    String(vg.vendorId) === String(vendorGroupId)
            );

            if (vGroupIndex === -1) {
                throw new Error(`Vendor package ${vendorGroupId} not found in order ${orderId}.`);
            }

            const targetVendorGroup = order.vendorItems[vGroupIndex];
            if (targetVendorGroup.status === 'cancelled') {
                return { order, refundAmount: 0, skipped: true };
            }

            targetVendorGroup.status = 'cancelled';
            targetVendorGroup.cancelledAt = new Date();
            targetVendorGroup.cancelledBy = cancelledBy;
            targetVendorGroup.cancellationReason = reason;
            targetVendorGroup.cancellationComment = comment;

            // Calculate financial refund for this package
            const productAmount = parseFloat((targetVendorGroup.subtotal || 0).toFixed(2));
            const taxRefund = parseFloat((targetVendorGroup.tax || 0).toFixed(2));
            const shippingRefund = parseFloat((targetVendorGroup.shipping || 0).toFixed(2));
            const discountAdjustment = parseFloat((targetVendorGroup.discount || 0).toFixed(2));
            const calculatedRefund = parseFloat(
                (productAmount - discountAdjustment + taxRefund + shippingRefund).toFixed(2)
            );

            targetVendorGroup.refundBreakdown = {
                productAmount,
                taxRefund,
                shippingRefund,
                discountAdjustment: -discountAdjustment,
                finalRefund: calculatedRefund,
            };

            refundReference = `PARTIAL_CANCEL_${order._id}_${targetVendorGroup.vendorId}`;
            refundNotes = `Partial Refund: ${targetVendorGroup.vendorName} package cancelled by ${cancelledBy} (${reason})`;

            if ((order.paymentStatus === 'paid' || Number(order.walletAmountUsed || 0) > 0) && calculatedRefund > 0 && order.userId) {
                refundAmount = calculatedRefund;
                const itemNames = (targetVendorGroup.items || []).map((i) => i.name).join(', ');

                await creditWallet(
                    order.userId,
                    refundAmount,
                    'cancel_refund',
                    {
                        orderId: order._id,
                        orderNumber: order.orderId,
                        vendorId: targetVendorGroup.vendorId,
                        vendorName: targetVendorGroup.vendorName,
                        items: itemNames,
                        reason,
                        comment,
                        description: `Refund ₹${refundAmount} for cancelled ${targetVendorGroup.vendorName} package in Order #${order.orderId}`,
                        reference: refundReference,
                    },
                    internalSession
                );

                await Refund.create(
                    [
                        {
                            orderId: order._id,
                            userId: order.userId,
                            amount: refundAmount,
                            referenceId: refundReference,
                            method: 'wallet_credit',
                            destination: 'wallet',
                            status: 'completed',
                            notes: refundNotes,
                        },
                    ],
                    { session: internalSession }
                );

                targetVendorGroup.refundedAmount = refundAmount;
            }

            // Restore Inventory Stock for target vendor items
            for (const item of targetVendorGroup.items || []) {
                const quantity = Number(item.quantity || 0);
                if (quantity <= 0) continue;

                const productSnapshot = await Product.findById(item.productId)
                    .select('variants.stockMap variants.prices')
                    .session(internalSession)
                    .lean();
                const variantKey = resolveOrderItemVariantKey(productSnapshot, item);

                const incUpdate = { stockQuantity: quantity };
                if (variantKey) {
                    incUpdate[`variants.stockMap.${variantKey}`] = quantity;
                }

                const product = await Product.findByIdAndUpdate(
                    item.productId,
                    { $inc: incUpdate },
                    { new: true, session: internalSession }
                );
                if (product) {
                    const nextStockState =
                        product.stockQuantity <= 0
                            ? 'out_of_stock'
                            : product.stockQuantity <= product.lowStockThreshold
                            ? 'low_stock'
                            : 'in_stock';

                    await Product.updateOne(
                        { _id: product._id },
                        { $set: { stock: nextStockState } },
                        { session: internalSession }
                    );
                }
            }

            // Cancel shipment for this vendor
            const shipment = await Shipment.findOne({
                orderId: order._id,
                vendorId: targetVendorGroup.vendorId,
            }).session(internalSession);

            if (shipment) {
                await cancelShipmentDeliveryAssignment(shipment._id, reason, internalSession);
            }

            // Cancel commission for this vendor
            await Commission.updateMany(
                {
                    orderId: order._id,
                    vendorId: targetVendorGroup.vendorId,
                    status: { $ne: 'cancelled' },
                },
                {
                    $set: {
                        status: 'cancelled',
                        escrowStatus: 'cancelled',
                        paidAt: null,
                        settlementId: null,
                    },
                },
                { session: internalSession }
            );

            // Re-evaluate overall order status
            const allVendorStatuses = order.vendorItems.map((v) => String(v.status || '').toLowerCase());
            if (allVendorStatuses.every((s) => s === 'cancelled')) {
                order.status = 'cancelled';
                order.cancelledAt = new Date();
                order.cancellationReason = reason;
            }

            await order.save({ session: internalSession });
        }

        if (ownsSession) {
            await internalSession.commitTransaction();
        }

        return { order, refundAmount };
    } catch (err) {
        if (ownsSession) {
            await internalSession.abortTransaction();
        }
        logger.error(`[CANCELLATION_REFUND_ERROR] Failed for order ${orderId}:`, err.message);
        throw err;
    } finally {
        if (ownsSession) {
            await internalSession.endSession();
        }
    }
};
