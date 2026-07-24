import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Order from '../../../models/Order.model.js';
import Shipment from '../../../models/Shipment.model.js';
import Payment from '../../../models/Payment.model.js';
import PaymentAttempt from '../../../models/PaymentAttempt.model.js';
import Commission from '../../../models/Commission.model.js';
import Product from '../../../models/Product.model.js';
import Coupon from '../../../models/Coupon.model.js';
import Vendor from '../../../models/Vendor.model.js';
import ReturnRequest from '../../../models/ReturnRequest.model.js';
import mongoose from 'mongoose';
import { createRazorpayOrder, verifyPaymentSignature } from '../../../services/payment.service.js';
import { getWallet, debitWallet } from '../../../services/wallet.service.js';
import LogisticsEventBus from '../../../events/logisticsEventBus.js';
import LOGISTICS_EVENTS from '../../../events/logisticsEvents.js';
import { processCapturedPayment } from '../../../services/paymentProcessor.js';
import { getDefaultCommissionRate, isPaymentMethodEnabled } from '../../../services/settingsService.js';
import Admin from '../../../models/Admin.model.js';
import { createNotification } from '../../../services/notification.service.js';
import { sendOrderConfirmationEmail } from '../../../services/email.service.js';
import { notifyOrderUpdate } from '../../../services/socket.service.js';
import { buildOrderItemsSummary, buildVendorItemsSummary } from '../../../utils/notificationProductFormatter.js';
import ShippingQuote from '../../../models/ShippingQuote.model.js';

import { calculateOrderFinancials } from '../../../services/financial.service.js';
import { calculateVendorShippingForGroups } from '../../../services/vendorShipping.service.js';
import { generateOrderId } from '../../../utils/generateOrderId.js';
import { generateTrackingNumber } from '../../../utils/generateTrackingNumber.js';

// ─── POST /api/user/payment/initialize ────────────────────────────────────────
// Creates DB order (payment_pending) + Razorpay order. No stock deducted yet.
export const initializePayment = asyncHandler(async (req, res) => {
    const {
        items,
        couponCode,
        shippingAddress,
        paymentMethod,
        shippingOption,
        shippingQuotes,
        idempotencyKey,
    } = req.body;

    const userId = req.user?.id;
    const normalizedPaymentMethod = paymentMethod === 'cash' ? 'cod' : paymentMethod;

    // Validate that payment method is enabled
    const isMethodActive = await isPaymentMethodEnabled(normalizedPaymentMethod);
    if (!isMethodActive) {
        throw new ApiError(400, `${paymentMethod === 'cash' ? 'Cash on Delivery' : paymentMethod} is currently unavailable.`);
    }

    // 4.3 — Idempotency: if client sends a key, return the existing order if it was already created
    if (idempotencyKey) {
        const existing = await Order.findOne({
            userId,
            idempotencyKey,
            status: { $in: ['payment_pending', 'processing', 'pending'] },
        }).lean();
        if (existing) {
            const existingAttempt = await PaymentAttempt.findOne({ orderId: existing._id }).sort({ attemptNumber: -1 }).lean();
            return res.status(200).json(new ApiResponse(200, {
                orderId: existing.orderId,
                razorpayOrderId: existingAttempt?.razorpayOrderId || null,
                amount: existing.total,
                currency: 'INR',
                key: process.env.RAZORPAY_KEY_ID,
                idempotent: true,
            }, 'Returning existing payment session.'));
        }
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
        throw new ApiError(400, 'Order items are required.');
    }
    if (!shippingAddress) {
        throw new ApiError(400, 'Shipping address is required.');
    }

    // --- Resolve products and validate server-side pricing ---
    const productIds = [...new Set(items.map(i => i.productId))];
    const products = await Product.find({ _id: { $in: productIds }, isActive: true }).lean();
    const productMap = Object.fromEntries(products.map(p => [String(p._id), p]));

    const enrichedItems = [];
    const vendorMap = {};

    for (const item of items) {
        const product = productMap[String(item.productId)];
        if (!product) throw new ApiError(404, `Product not found: ${item.productId}`);

        const basePrice = Number(product.price);
        if (!Number.isFinite(basePrice)) throw new ApiError(400, `Invalid price for ${product.name}`);

        const price = basePrice;
        const quantity = Number(item.quantity);
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000) {
            throw new ApiError(400, `Invalid quantity for product ${item.productId}. Must be a positive integer between 1 and 10000.`);
        }
        const vendorId = String(product.vendorId);

        const variantKey = item.variantKey || null;
        const variantImage =
            variantKey && product.variants?.imageMap
                ? String((product.variants.imageMap instanceof Map || typeof product.variants.imageMap.get === 'function' ? product.variants.imageMap.get(variantKey) : product.variants.imageMap[variantKey]) || '').trim()
                : '';

        enrichedItems.push({
            productId: product._id,
            name: product.name,
            image: variantImage || product.image || '',
            price,
            quantity,
            vendorId: product.vendorId,
            taxRate: product.taxRate,
            taxIncluded: product.taxIncluded,
            variantKey,
        });

        if (!vendorMap[vendorId]) {
            vendorMap[vendorId] = {
                vendorId: product.vendorId,
                vendorName: product.vendorName || '',
                items: [],
            };
        }
        vendorMap[vendorId].items.push({ ...item, price, quantity });
    }

    // --- Coupon validation ---
    let appliedCoupon = null;
    let couponDiscount = 0;
    if (couponCode) {
        const coupon = await Coupon.findOne({
            code: couponCode.toUpperCase(),
            isActive: true,
            expiresAt: { $gt: new Date() },
        }).lean();
        if (coupon) {
            appliedCoupon = coupon;
            const rawSubtotal = enrichedItems.reduce((s, i) => s + i.price * i.quantity, 0);
            couponDiscount = coupon.type === 'percentage'
                ? (rawSubtotal * coupon.value) / 100
                : coupon.value;
            if (coupon.minOrderValue && rawSubtotal < coupon.minOrderValue) couponDiscount = 0;
        }
    }

    // --- Shipping calculation ---
    const vendorDocs = await Vendor.find({ _id: { $in: Object.keys(vendorMap) } })
        .select('_id commissionRate storeName name')
        .lean();
    const vendorDocsMap = Object.fromEntries(vendorDocs.map(v => [String(v._id), v]));

    const vendorShippingInput = Object.values(vendorMap).map(v => {
        const doc = vendorDocsMap[String(v.vendorId)] || {};
        const vSubtotal = v.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        return {
            vendorId: v.vendorId,
            subtotal: vSubtotal,
        };
    });

    const shippingResult = await calculateVendorShippingForGroups({
        vendorGroups: vendorShippingInput,
        shippingAddress,
        shippingOption: shippingOption || 'standard',
        couponType: appliedCoupon?.type || null,
    });
    const shipping = shippingResult?.totalShipping || 0;
    const shippingByVendor = shippingResult?.shippingByVendor || {};
    const defaultRate = await getDefaultCommissionRate();
    const vendorCommissions = Object.fromEntries(vendorDocs.map(v => [
        String(v._id),
        v.commissionRate !== undefined && v.commissionRate !== null ? v.commissionRate : defaultRate
    ]));

    // --- Calculate financials server-side ---
    const financials = calculateOrderFinancials({
        items: enrichedItems,
        couponDiscount,
        shipping,
        vendorCommissions,
        vendorShippings: shippingByVendor,
    });

    const { finalTotal: total, discountedSubtotal: subtotal, tax } = financials;

    // Create populated vendorItems array with full financials, commissions, and item details (names, images)
    const vendorItems = financials.vendorCalculations.map(vc => {
        const vendorIdStr = String(vc.vendorId);
        const doc = vendorDocsMap[vendorIdStr] || {};
        const groupItems = financials.items
            .filter(item => String(item.vendorId) === vendorIdStr)
            .map(item => ({
                productId: item.productId,
                vendorId: item.vendorId,
                name: item.name,
                image: item.image,
                price: item.price,
                quantity: item.quantity,
                variant: item.variantKey ? { variantKey: item.variantKey } : {},
                variantKey: item.variantKey || undefined,
                // --- FINANCIAL SNAPSHOT FIELDS ---
                taxRate: item.taxRate,
                taxIncluded: item.taxIncluded,
                lineSubtotal: item.lineSubtotal,
                couponDiscount: item.couponDiscount,
                discountedSubtotal: item.discountedSubtotal,
                baseAmount: item.baseAmount,
                taxAmount: item.taxAmount,
                shippingCharge: item.shippingCharge,
                commissionRate: item.commissionRate,
                commissionAmount: item.commissionAmount,
                vendorEarnings: item.vendorEarnings,
                platformCommission: item.platformCommission,
                finalLineTotal: item.finalLineTotal,
            }));

        return {
            vendorId: vc.vendorId,
            vendorName: doc.storeName || doc.name || '',
            items: groupItems,
            subtotal: vc.subtotal,
            shipping: Number(shippingByVendor[vendorIdStr] || 0),
            tax: vc.vendorTax,
            discount: vc.discountShare,
            status: 'pending',
            commissionRate: vc.commissionRate,
            commissionAmount: vc.commission,
            vendorEarnings: vc.vendorEarnings,
            isOnHoldBalanceAdded: false,
        };
    });

    // ─── Resolve Valid Shipping Quotes ─────────────────────────────────────────
    let validQuotes = {};
    if (shippingQuotes && typeof shippingQuotes === 'object') {
        const quoteIds = Object.values(shippingQuotes).map(q => q?.quoteId).filter(Boolean);
        if (quoteIds.length > 0) {
            const dbQuotes = await ShippingQuote.find({ quoteId: { $in: quoteIds } }).lean();
            validQuotes = Object.fromEntries(dbQuotes.map(q => [q.quoteId, q]));
        }
    }

    // ─── COD: Create order immediately with stock deduction ───────────────────
    if (normalizedPaymentMethod === 'cod') {
        const session = await mongoose.startSession();
        let order;
        let createdShipments = [];
        try {
            await session.withTransaction(async () => {
                const orderId = generateOrderId();
                const [createdOrder] = await Order.create([{
                    orderId,
                    userId,
                    items: financials.items.map(item => ({
                        productId: item.productId,
                        vendorId: item.vendorId,
                        name: item.name,
                        image: item.image,
                        price: item.price,
                        quantity: item.quantity,
                        variant: item.variantKey ? { variantKey: item.variantKey } : {},
                        variantKey: item.variantKey || undefined,
                        // --- FINANCIAL SNAPSHOT FIELDS ---
                        taxRate: item.taxRate,
                        taxIncluded: item.taxIncluded,
                        lineSubtotal: item.lineSubtotal,
                        couponDiscount: item.couponDiscount,
                        discountedSubtotal: item.discountedSubtotal,
                        baseAmount: item.baseAmount,
                        taxAmount: item.taxAmount,
                        shippingCharge: item.shippingCharge,
                        commissionRate: item.commissionRate,
                        commissionAmount: item.commissionAmount,
                        vendorEarnings: item.vendorEarnings,
                        platformCommission: item.platformCommission,
                        finalLineTotal: item.finalLineTotal,
                    })),
                    vendorItems,
                    shippingAddress,
                    paymentMethod: 'cod',

                    status: 'processing',
                    paymentStatus: 'pending',
                    subtotal,
                    shipping,
                    tax,
                    discount: couponDiscount,
                    total,
                    couponCode: couponCode?.toUpperCase(),
                    couponDiscount,
                    discountedSubtotal: financials.discountedSubtotal,
                    taxableAmount: financials.taxableAmount,
                    commissionAmount: financials.commissionAmount,
                    vendorEarnings: financials.vendorEarnings,
                    escrowAmount: financials.escrowAmount,
                    settlementAmount: financials.settlementAmount,
                    platformRevenue: financials.platformRevenue,
                    trackingNumber: generateTrackingNumber(),
                    estimatedDelivery: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
                    invoiceNumber: `INV-${orderId}`,
                    invoiceDate: new Date(),
                }], { session });
                order = createdOrder;

                // Deduct stock
                for (const item of enrichedItems) {
                    const updatedProduct = await Product.findOneAndUpdate(
                        { _id: item.productId, stock: { $ne: 'out_of_stock' }, stockQuantity: { $gte: Number(item.quantity) } },
                        { $inc: { stockQuantity: -Number(item.quantity) } },
                        { new: true, session }
                    );
                    if (!updatedProduct) throw new ApiError(409, `Insufficient stock for ${item.name}.`);

                    const nextStock = updatedProduct.stockQuantity <= 0 ? 'out_of_stock'
                        : updatedProduct.stockQuantity <= updatedProduct.lowStockThreshold ? 'low_stock' : 'in_stock';
                    await Product.updateOne({ _id: updatedProduct._id }, { $set: { stock: nextStock } }, { session });
                }

                // Create commissions — all required Commission schema fields populated
                const commissionDocs = financials.vendorCalculations.map(vc => ({
                    orderId:                   order._id,
                    vendorId:                  vc.vendorId,
                    vendorName:                vendorMap[String(vc.vendorId)]?.vendorName || '',
                    subtotal:                  vc.subtotal,
                    vendorSubtotal:            vc.subtotal,
                    discountShare:             vc.discountShare,
                    vendorCouponDiscount:      vc.discountShare,
                    effectiveSubtotal:         vc.effectiveSubtotal,
                    vendorDiscountedSubtotal:  vc.effectiveSubtotal,
                    commissionRate:            vc.commissionRate,
                    commission:                vc.commission,
                    commissionAmount:          vc.commission,
                    vendorEarnings:            vc.vendorEarnings,
                    vendorNetEarnings:         vc.vendorEarnings,
                    escrowAmount:              vc.vendorEarnings,
                    walletCredit:              0,
                    escrowStatus:              'held',
                    settlementStatus:          'pending',
                    vendorTax:                 vc.vendorTax || 0,
                    vendorTotalPaidByCustomer: vc.vendorTotalPaidByCustomer || vc.subtotal,
                    ...(appliedCoupon ? {
                        couponId:    appliedCoupon._id,
                        couponCode:  appliedCoupon.code,
                        couponType:  appliedCoupon.type,
                        couponValue: appliedCoupon.value,
                    } : {}),
                }));
                await Commission.insertMany(commissionDocs, { session });

                // Coupon usage
                if (appliedCoupon) {
                    await Coupon.updateOne({ _id: appliedCoupon._id }, { $inc: { usedCount: 1 } }, { session });
                }

                // Phase 5.1 Parity: Create Shipments for COD order
                const shipmentDocs = vendorItems.map((vGroup) => {
                    let providerId = 'own_fleet';
                    let quoteId = null;
                    let estCost = 0;
                    let notes = 'Shipment created at order placement (COD fallback)';

                    const vQuoteReq = shippingQuotes ? shippingQuotes[String(vGroup.vendorId)] : null;
                    if (vQuoteReq && vQuoteReq.quoteId && validQuotes[vQuoteReq.quoteId]) {
                        const dbQuote = validQuotes[vQuoteReq.quoteId];
                        providerId = dbQuote.providerId || 'own_fleet';
                        quoteId = dbQuote._id;
                        estCost = dbQuote.estimatedCost || 0;
                        notes = `Shipment created with provider ${providerId} via quote ${dbQuote.quoteId}`;
                    }

                    return {
                        orderId:                order._id,
                        vendorId:               vGroup.vendorId,
                        vendorName:             vGroup.vendorName,
                        providerId:             providerId,
                        shippingQuoteId:        quoteId,
                        selectedBy:             'AUTO',
                        providerLocked:         false,
                        customerShippingCharge: Number(vGroup.shipping) || 0,
                        estimatedDeliveryCost:  estCost,
                        status:                 'pending',
                        statusHistory: [{
                            status:    'pending',
                            updatedAt: new Date(),
                            updatedBy: 'system',
                            notes:     notes,
                        }],
                        packageWeight: vGroup.items.reduce(
                            (sum, item) => sum + (500 * (item.quantity || 1)), 0
                        ) || 500,
                        escrowStatus: 'held',
                        deliveryAssignmentStatus: 'pending',
                        rejectedDeliveryBoys: [],
                    };
                });

                for (const doc of shipmentDocs) {
                    const shipment = new Shipment(doc);
                    await shipment.save({ session });
                    createdShipments.push(shipment);
                }

                // Mark quotes as used
                if (validQuotes && Object.keys(validQuotes).length > 0) {
                    const quoteIdsToUpdate = Object.values(validQuotes).map(q => q._id);
                    await ShippingQuote.updateMany(
                        { _id: { $in: quoteIdsToUpdate } },
                        { $set: { usedForOrder: true, orderId: order._id } },
                        { session }
                    );
                }
            });
        } finally {
            await session.endSession();
        }

        // Emit SHIPMENT_CREATED events
        for (const shipment of createdShipments) {
            LogisticsEventBus.emitEvent(LOGISTICS_EVENTS.SHIPMENT_CREATED, {
                shipmentId:  String(shipment._id),
                shipmentNumber: shipment.shipmentNumber,
                orderId:     String(order._id),
                orderNumber: order.orderId,
                vendorId:    String(shipment.vendorId),
                providerId:  shipment.providerId,
                selectedBy:  shipment.selectedBy,
            });
        }

        // Trigger notifications and email asynchronously (non-blocking)
        if (order && order.orderId) {
            const notificationTasks = [];
            
            // 1. User Notification
            if (userId) {
                const itemsText = buildOrderItemsSummary(order.items);
                notificationTasks.push(
                    createNotification({
                        recipientId: userId,
                        recipientType: 'user',
                        title: 'Order Placed!',
                        message: `Your order ${order.orderId} has been placed successfully.${itemsText}`,
                        type: 'order',
                        data: { link: `/orders/${order.orderId}` },
                    }).catch(err => console.error('[COD User Notification] Failed:', err.message))
                );
            }

            // 2. Admin Notifications
            Admin.find({ isActive: true }).select('_id').lean()
                .then(admins => {
                    admins.forEach(adm => {
                        createNotification({
                            recipientId: adm._id,
                            recipientType: 'admin',
                            title: 'New Order Placed',
                            message: `A new COD order #${order.orderId} of total ₹${order.total} has been placed.`,
                            type: 'order',
                            data: { orderId: String(order._id) },
                        }).catch(err => console.error('[COD Admin Notification] Failed:', err.message));
                    });
                })
                .catch(err => console.error('[COD Admin Fetch] Failed:', err.message));

            // 3. Vendor Notifications
            (order.vendorItems || []).forEach(vGroup => {
                const vendorId = vGroup.vendorId?._id || vGroup.vendorId;
                if (!vendorId) return;
                const vItemsText = buildVendorItemsSummary(vGroup.items);
                notificationTasks.push(
                    createNotification({
                        recipientId: vendorId,
                        recipientType: 'vendor',
                        title: 'New Order Received!',
                        message: `You have received a new order ${order.orderId} totalling ₹${vGroup.subtotal}.${vItemsText}`,
                        type: 'order',
                        data: {
                            orderId: String(order.orderId),
                            orderMongoId: String(order._id),
                        },
                    }).catch(err => console.error('[COD Vendor Notification] Failed:', err.message))
                );
            });

            // 4. Send Confirmation Email & Socket updates
            const emailAddress = order?.shippingAddress?.email || (req.user?.email);
            if (emailAddress) {
                sendOrderConfirmationEmail(order, emailAddress).catch((err) =>
                    console.error(`[COD Order Email] Failed to send for ${order.orderId}:`, err.message)
                );
            }
            notifyOrderUpdate(order);
        }

        return res.status(201).json(new ApiResponse(201, {
            orderId: order.orderId,
            total,
            paymentMethod: 'cod',
        }, 'COD order placed successfully.'));
    }

    // ─── Online Payment: Create payment_pending order + Razorpay order ─────────
    const session = await mongoose.startSession();
    let order, payment, attempt;
    let rzpOrder = null;
    let walletAmountUsed = 0;
    let createdShipments = [];
    try {
        await session.withTransaction(async () => {
            const orderId = generateOrderId();

            // 1. Calculate wallet deductions if useWallet is true
            if (req.body.useWallet) {
                const wallet = await getWallet(userId);
                walletAmountUsed = Math.min(wallet.balance, total);
            }

            const remainingTotal = Number((total - walletAmountUsed).toFixed(2));
            const isFullyPaidByWallet = walletAmountUsed === total;

            const [createdOrder] = await Order.create([{
                orderId,
                userId,
                items: financials.items.map(item => ({
                    productId: item.productId,
                    vendorId: item.vendorId,
                    name: item.name,
                    image: item.image,
                    price: item.price,
                    quantity: item.quantity,
                    variant: item.variantKey ? { variantKey: item.variantKey } : {},
                    variantKey: item.variantKey || undefined,
                    // --- FINANCIAL SNAPSHOT FIELDS ---
                    taxRate: item.taxRate,
                    taxIncluded: item.taxIncluded,
                    lineSubtotal: item.lineSubtotal,
                    couponDiscount: item.couponDiscount,
                    discountedSubtotal: item.discountedSubtotal,
                    baseAmount: item.baseAmount,
                    taxAmount: item.taxAmount,
                    shippingCharge: item.shippingCharge,
                    commissionRate: item.commissionRate,
                    commissionAmount: item.commissionAmount,
                    vendorEarnings: item.vendorEarnings,
                    platformCommission: item.platformCommission,
                    finalLineTotal: item.finalLineTotal,
                })),
                vendorItems,

                shippingAddress,
                paymentMethod: isFullyPaidByWallet ? 'wallet' : normalizedPaymentMethod,
                status: isFullyPaidByWallet ? 'processing' : 'payment_pending',  // No stock deducted yet unless fully paid
                paymentStatus: isFullyPaidByWallet ? 'paid' : 'pending',
                subtotal,
                shipping,
                tax,
                discount: couponDiscount,
                total,
                walletAmountUsed,
                couponCode: couponCode?.toUpperCase(),
                couponDiscount,
                discountedSubtotal: financials.discountedSubtotal,
                taxableAmount: financials.taxableAmount,
                commissionAmount: financials.commissionAmount,
                vendorEarnings: financials.vendorEarnings,
                escrowAmount: financials.escrowAmount,
                settlementAmount: financials.settlementAmount,
                platformRevenue: financials.platformRevenue,
                trackingNumber: generateTrackingNumber(),
                estimatedDelivery: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
                invoiceNumber: `INV-${orderId}`,
                invoiceDate: new Date(),
                // Store coupon info for use at webhook time
                couponId: appliedCoupon?._id,
            }], { session });
            order = createdOrder;

            // 2. Debit wallet if needed
            if (walletAmountUsed > 0) {
                await debitWallet(userId, walletAmountUsed, 'wallet_payment', {
                    orderId: order._id,
                    description: `Paid ₹${walletAmountUsed} via wallet for order #${order.orderId}`
                }, session);
            }

            if (isFullyPaidByWallet) {
                // Fully paid by wallet - complete order setups (stock, commissions, coupon count)
                for (const item of enrichedItems) {
                    const updatedProduct = await Product.findOneAndUpdate(
                        { _id: item.productId, stock: { $ne: 'out_of_stock' }, stockQuantity: { $gte: Number(item.quantity) } },
                        { $inc: { stockQuantity: -Number(item.quantity) } },
                        { new: true, session }
                    );
                    if (!updatedProduct) throw new ApiError(409, `Insufficient stock for ${item.name}.`);

                    const nextStock = updatedProduct.stockQuantity <= 0 ? 'out_of_stock'
                        : updatedProduct.stockQuantity <= updatedProduct.lowStockThreshold ? 'low_stock' : 'in_stock';
                    await Product.updateOne({ _id: updatedProduct._id }, { $set: { stock: nextStock } }, { session });
                }

                // Commissions
                const commissionDocs = financials.vendorCalculations.map(vc => ({
                    orderId:                   order._id,
                    vendorId:                  vc.vendorId,
                    vendorName:                vendorMap[String(vc.vendorId)]?.vendorName || '',
                    subtotal:                  vc.subtotal,
                    vendorSubtotal:            vc.subtotal,
                    discountShare:             vc.discountShare,
                    vendorCouponDiscount:      vc.discountShare,
                    effectiveSubtotal:         vc.effectiveSubtotal,
                    vendorDiscountedSubtotal:  vc.effectiveSubtotal,
                    commissionRate:            vc.commissionRate,
                    commission:                vc.commission,
                    commissionAmount:          vc.commission,
                    vendorEarnings:            vc.vendorEarnings,
                    vendorNetEarnings:         vc.vendorEarnings,
                    escrowAmount:              vc.vendorEarnings,
                    walletCredit:              0,
                    escrowStatus:              'held',
                    settlementStatus:          'pending',
                    vendorTax:                 vc.vendorTax || 0,
                    vendorTotalPaidByCustomer: vc.vendorTotalPaidByCustomer || vc.subtotal,
                    ...(appliedCoupon ? {
                        couponId:    appliedCoupon._id,
                        couponCode:  appliedCoupon.code,
                        couponType:  appliedCoupon.type,
                        couponValue: appliedCoupon.value,
                    } : {}),
                }));
                await Commission.insertMany(commissionDocs, { session });

                if (appliedCoupon) {
                    await Coupon.updateOne({ _id: appliedCoupon._id }, { $inc: { usedCount: 1 } }, { session });
                }

                // Create Payment record
                await Payment.create([{
                    orderId: order._id,
                    userId,
                    amount: total,
                    status: 'paid',
                    method: 'wallet',
                }], { session });

            } else {
                // Partially paid by wallet - we need to charge remaining via Razorpay
                const [createdPayment] = await Payment.create([{
                    orderId: order._id,
                    userId,
                    amount: remainingTotal,
                    status: 'pending',
                }], { session });
                payment = createdPayment;

                // Create Razorpay order INSIDE DB transaction (external API call)
                try {
                    rzpOrder = await createRazorpayOrder(remainingTotal, 'INR', order.orderId, { userId: String(userId) });
                } catch (err) {
                    console.error('[RAZORPAY_INITIALIZE_ERROR] Failed to create order:', err);
                    throw new ApiError(502, 'Payment gateway error. Please try again.');
                }

                // Create PaymentAttempt
                attempt = (await PaymentAttempt.create([{
                    orderId: order._id,
                    paymentId: payment._id,
                    razorpayOrderId: rzpOrder.id,
                    purpose: 'ORDER_PAYMENT',
                    status: 'created',
                    attemptNumber: 1,
                }], { session }))[0];
            }

            // Phase 5.1 Parity: Create Shipments for prepaid order
            const shipmentDocs = vendorItems.map((vGroup) => {
                let providerId = 'own_fleet';
                let quoteId = null;
                let estCost = 0;
                let notes = 'Shipment created at order placement (Prepaid fallback)';

                const vQuoteReq = shippingQuotes ? shippingQuotes[String(vGroup.vendorId)] : null;
                if (vQuoteReq && vQuoteReq.quoteId && validQuotes[vQuoteReq.quoteId]) {
                    const dbQuote = validQuotes[vQuoteReq.quoteId];
                    providerId = dbQuote.providerId || 'own_fleet';
                    quoteId = dbQuote._id;
                    estCost = dbQuote.estimatedCost || 0;
                    notes = `Shipment created with provider ${providerId} via quote ${dbQuote.quoteId}`;
                }

                return {
                    orderId:                order._id,
                    vendorId:               vGroup.vendorId,
                    vendorName:             vGroup.vendorName,
                    providerId:             providerId,
                    shippingQuoteId:        quoteId,
                    selectedBy:             'AUTO',
                    providerLocked:         false,
                    customerShippingCharge: Number(vGroup.shipping) || 0,
                    estimatedDeliveryCost:  estCost,
                    status:                 'pending',
                    statusHistory: [{
                        status:    'pending',
                        updatedAt: new Date(),
                        updatedBy: 'system',
                        notes:     notes,
                    }],
                    packageWeight: vGroup.items.reduce(
                        (sum, item) => sum + (500 * (item.quantity || 1)), 0
                    ) || 500,
                    escrowStatus: 'held',
                    deliveryAssignmentStatus: 'pending',
                    rejectedDeliveryBoys: [],
                };
            });

            for (const doc of shipmentDocs) {
                const shipment = new Shipment(doc);
                await shipment.save({ session });
                createdShipments.push(shipment);
            }

            // Mark quotes as used
            if (validQuotes && Object.keys(validQuotes).length > 0) {
                const quoteIdsToUpdate = Object.values(validQuotes).map(q => q._id);
                await ShippingQuote.updateMany(
                    { _id: { $in: quoteIdsToUpdate } },
                    { $set: { usedForOrder: true, orderId: order._id } },
                    { session }
                );
            }
        });
    } finally {
        await session.endSession();
    }

    if (walletAmountUsed === total) {
        // Emit SHIPMENT_CREATED events if fully paid by wallet
        for (const shipment of createdShipments) {
            LogisticsEventBus.emitEvent(LOGISTICS_EVENTS.SHIPMENT_CREATED, {
                shipmentId:  String(shipment._id),
                shipmentNumber: shipment.shipmentNumber,
                orderId:     String(order._id),
                orderNumber: order.orderId,
                vendorId:    String(shipment.vendorId),
                providerId:  shipment.providerId,
                selectedBy:  shipment.selectedBy,
            });
        }

        // Fully paid by wallet - trigger async side effects
        createNotification({
            recipientId: userId,
            recipientType: 'user',
            title: 'Order Confirmed',
            message: `Your order #${order.orderId} has been confirmed successfully!`,
            type: 'order',
            data: { orderId: String(order._id) },
        }).catch(console.error);

        // Notify each admin individually
        Admin.find({ isActive: true }).select('_id').lean()
            .then(admins => {
                admins.forEach(adm => {
                    createNotification({
                        recipientId: adm._id,
                        recipientType: 'admin',
                        title: 'New Order Placed',
                        message: `A new order #${order.orderId} of total ₹${order.total} has been placed.`,
                        type: 'order',
                        data: { orderId: String(order._id) },
                    }).catch(err => console.error('[Wallet Admin Notification] Failed:', err.message));
                });
            })
            .catch(err => console.error('[Wallet Admin Fetch] Failed:', err.message));

        // Notify vendors
        (order.vendorItems || []).forEach(vGroup => {
            const vendorId = vGroup.vendorId?._id || vGroup.vendorId;
            if (!vendorId) return;
            const vItemsText = buildVendorItemsSummary(vGroup.items);
            createNotification({
                recipientId: vendorId,
                recipientType: 'vendor',
                title: 'New Order Received!',
                message: `You have received a new order ${order.orderId} totalling ₹${vGroup.subtotal}.${vItemsText}`,
                type: 'order',
                data: {
                    orderId: String(order.orderId),
                    orderMongoId: String(order._id),
                },
            }).catch(err => console.error('[Wallet Vendor Notification] Failed:', err.message));
        });

        try {
            await sendOrderConfirmationEmail(order, order.shippingAddress?.email || req.user?.email);
        } catch (e) {
            console.error('[Email Error]', e.message);
        }

        order.status = 'processing';
        order.paymentStatus = 'paid';
        notifyOrderUpdate(order).catch(console.error);

        return res.status(201).json(new ApiResponse(201, {
            orderId: order.orderId,
            total,
            paymentMethod: 'wallet',
            paymentStatus: 'paid',
        }, 'Order placed successfully using wallet balance.'));
    }

    return res.status(201).json(new ApiResponse(201, {
        orderId: order.orderId,
        razorpayOrderId: rzpOrder.id,
        amount: Number((total - walletAmountUsed).toFixed(2)),
        currency: 'INR',
        key: process.env.RAZORPAY_KEY_ID,
    }, 'Payment initialized. Complete payment to confirm order.'));
});

// ─── POST /api/user/payment/retry/:orderId ─────────────────────────────────
// Creates a new PaymentAttempt for a payment_pending order (retry after failed UPI etc.)
export const retryPayment = asyncHandler(async (req, res) => {
    const { orderId } = req.params;
    const userId = req.user?.id;

    const order = await Order.findOne({ orderId, userId }).lean();
    if (!order) throw new ApiError(404, 'Order not found.');

    // Validate if the order's paymentMethod is still active in settings
    const isRetryMethodActive = await isPaymentMethodEnabled(order.paymentMethod);
    if (!isRetryMethodActive) {
        throw new ApiError(400, `The payment method ${order.paymentMethod === 'cod' ? 'Cash on Delivery' : order.paymentMethod} used for this order is currently unavailable.`);
    }
    if (order.status !== 'payment_pending') {
        throw new ApiError(400, 'This order is not awaiting payment. Cannot retry.');
    }

    // 4.10 — Max 5 payment attempts per order guard
    const attemptCount = await PaymentAttempt.countDocuments({ orderId: order._id });
    if (attemptCount >= 5) {
        throw new ApiError(429, 'Maximum payment attempts (5) reached for this order. Please cancel and create a new order.');
    }

    const payment = await Payment.findOne({ orderId: order._id }).lean();
    if (!payment) throw new ApiError(404, 'Payment record not found.');

    // Get current max attempt number
    const lastAttempt = await PaymentAttempt.findOne({ orderId: order._id })
        .sort({ attemptNumber: -1 })
        .lean();
    const attemptNumber = (lastAttempt?.attemptNumber || 0) + 1;

    // Create new Razorpay order
    let rzpOrder;
    try {
        rzpOrder = await createRazorpayOrder(order.total, 'INR', `${order.orderId}-retry-${attemptNumber}`);
    } catch (err) {
        console.error('[RAZORPAY_RETRY_ERROR] Failed to create retry order:', err);
        throw new ApiError(502, 'Payment gateway error. Please try again.');
    }

    const attempt = await PaymentAttempt.create({
        orderId: order._id,
        paymentId: payment._id,
        razorpayOrderId: rzpOrder.id,
        purpose: 'ORDER_PAYMENT',
        status: 'created',
        attemptNumber,
    });

    return res.status(200).json(new ApiResponse(200, {
        orderId: order.orderId,
        razorpayOrderId: rzpOrder.id,
        amount: order.total,
        currency: 'INR',
        key: process.env.RAZORPAY_KEY_ID,
        attemptNumber,
    }, 'New payment attempt created.'));
});

// ─── POST /api/user/payment/exchange-upgrade/:returnRequestId ──────────────
// Creates a PaymentAttempt for extra charge on price-upgrade exchange
export const exchangeUpgradePayment = asyncHandler(async (req, res) => {
    const { returnRequestId } = req.params;
    const userId = req.user?.id;

    const request = await ReturnRequest.findOne({ _id: returnRequestId, userId }).lean();
    if (!request) throw new ApiError(404, 'Return request not found.');
    if (request.requestType !== 'exchange') throw new ApiError(400, 'Not an exchange request.');

    const priceDelta = request.exchangeDetails?.priceDelta;
    const priceDeltaStatus = request.exchangeDetails?.priceDeltaStatus;
    if (!priceDelta || priceDelta <= 0) throw new ApiError(400, 'No upgrade payment required.');
    if (priceDeltaStatus !== 'pending') throw new ApiError(400, `Price delta already ${priceDeltaStatus}.`);

    // 4.9 — Idempotency: prevent duplicate exchange upgrade attempts
    const existingAttempt = await PaymentAttempt.findOne({
        relatedReturnId: request._id,
        purpose: 'EXCHANGE_UPGRADE',
        status: { $in: ['created', 'processing'] },
    }).lean();
    if (existingAttempt) {
        return res.status(200).json(new ApiResponse(200, {
            razorpayOrderId: existingAttempt.razorpayOrderId,
            amount: priceDelta,
            currency: 'INR',
            key: process.env.RAZORPAY_KEY_ID,
            idempotent: true,
        }, 'Returning existing exchange upgrade payment.'));
    }

    const order = await Order.findById(request.orderId).lean();
    const payment = await Payment.findOne({ orderId: order._id }).lean();

    let rzpOrder;
    try {
        rzpOrder = await createRazorpayOrder(priceDelta, 'INR', `exchange-${request._id}`);
    } catch (err) {
        console.error('[RAZORPAY_EXCHANGE_UPGRADE_ERROR] Failed to create upgrade order:', err);
        throw new ApiError(502, 'Payment gateway error.');
    }

    const attempt = await PaymentAttempt.create({
        orderId: order._id,
        paymentId: payment?._id,
        razorpayOrderId: rzpOrder.id,
        purpose: 'EXCHANGE_UPGRADE',
        status: 'created',
        attemptNumber: 1,
        relatedReturnId: request._id,
    });

    await ReturnRequest.findByIdAndUpdate(request._id, {
        'exchangeDetails.exchangePaymentId': attempt._id,
    });

    return res.status(200).json(new ApiResponse(200, {
        razorpayOrderId: rzpOrder.id,
        amount: priceDelta,
        currency: 'INR',
        key: process.env.RAZORPAY_KEY_ID,
    }, 'Exchange upgrade payment initialized.'));
});

// ─── POST /api/user/payment/verify ───────────────────────────────────────────
// Verifies Razorpay signatures from the frontend, then processes the payment.
export const verifyPayment = asyncHandler(async (req, res) => {
    const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

    if (!orderId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
        throw new ApiError(400, 'Missing payment verification details.');
    }

    // Verify signature cryptographically
    const isValid = verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);
    if (!isValid) {
        throw new ApiError(400, 'Invalid payment signature. Verification failed.');
    }

    // T3.2: Enforce order ownership — prevent any user from triggering payment processing on another user's order.
    const order = await Order.findOne({ orderId, userId: req.user.id }).lean();
    if (!order) throw new ApiError(404, 'Order not found.');

    // Process using the shared, concurrent-safe payment processor
    await processCapturedPayment({
        razorpayOrderId,
        razorpayPaymentId,
        method: order.paymentMethod || 'card',
        payload: { source: 'frontend_direct_verify', body: req.body }
    });

    const updatedOrder = await Order.findById(order._id)
        .select('orderId status paymentStatus total')
        .lean();

    return res.status(200).json(
        new ApiResponse(200, {
            orderId: updatedOrder.orderId,
            status: updatedOrder.status,
            paymentStatus: updatedOrder.paymentStatus,
        }, 'Payment verified and order processed successfully.')
    );
});

