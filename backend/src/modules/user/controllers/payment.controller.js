import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Order from '../../../models/Order.model.js';
import Payment from '../../../models/Payment.model.js';
import PaymentAttempt from '../../../models/PaymentAttempt.model.js';
import Commission from '../../../models/Commission.model.js';
import Product from '../../../models/Product.model.js';
import Coupon from '../../../models/Coupon.model.js';
import Vendor from '../../../models/Vendor.model.js';
import ReturnRequest from '../../../models/ReturnRequest.model.js';
import mongoose from 'mongoose';
import { createRazorpayOrder } from '../../../services/payment.service.js';
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
        idempotencyKey,
    } = req.body;

    const userId = req.user?.id;
    const normalizedPaymentMethod = paymentMethod === 'cash' ? 'cod' : paymentMethod;

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
    const vendorGroups = Object.values(vendorMap).map(v => ({
        vendorId: v.vendorId,
        items: v.items,
        shippingOption: shippingOption || 'standard',
    }));
    const shippingResult = await calculateVendorShippingForGroups(vendorGroups, shippingAddress);
    const shipping = shippingResult?.total || 0;

    // --- Vendor commissions map ---
    const vendorDocs = await Vendor.find({ _id: { $in: Object.keys(vendorMap) } })
        .select('_id commissionRate')
        .lean();
    const vendorCommissions = Object.fromEntries(vendorDocs.map(v => [String(v._id), v.commissionRate || 10]));

    // --- Calculate financials server-side ---
    const financials = calculateOrderFinancials({
        items: enrichedItems,
        couponDiscount,
        shipping,
        vendorCommissions,
    });

    const { finalTotal: total, discountedSubtotal: subtotal, tax } = financials;

    // ─── COD: Create order immediately with stock deduction ───────────────────
    if (normalizedPaymentMethod === 'cod') {
        const session = await mongoose.startSession();
        let order;
        try {
            await session.withTransaction(async () => {
                const orderId = generateOrderId();
                const [createdOrder] = await Order.create([{
                    orderId,
                    userId,
                    items: enrichedItems,
                    vendorItems: Object.values(vendorMap).map(v => ({ vendorId: v.vendorId, items: v.items, status: 'pending' })),
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
            });
        } finally {
            await session.endSession();
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
    try {
        await session.withTransaction(async () => {
            const orderId = generateOrderId();
            const [createdOrder] = await Order.create([{
                orderId,
                userId,
                items: enrichedItems,
                vendorItems: Object.values(vendorMap).map(v => ({ vendorId: v.vendorId, items: v.items, status: 'pending' })),
                shippingAddress,
                paymentMethod: normalizedPaymentMethod,
                status: 'payment_pending',  // No stock deducted yet
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
                // Store coupon info for use at webhook time
                couponId: appliedCoupon?._id,
            }], { session });
            order = createdOrder;

            // Create Payment summary record
            const [createdPayment] = await Payment.create([{
                orderId: order._id,
                userId,
                amount: total,
                status: 'pending',
            }], { session });
            payment = createdPayment;
        });
    } finally {
        await session.endSession();
    }

    // Create Razorpay order OUTSIDE DB transaction (external API call)
    let rzpOrder;
    try {
        rzpOrder = await createRazorpayOrder(total, 'INR', order.orderId, { userId: String(userId) });
    } catch (err) {
        // If Razorpay fails, mark order as payment_failed
        console.error('[RAZORPAY_INITIALIZE_ERROR] Failed to create order:', err);
        await Order.findByIdAndUpdate(order._id, { status: 'payment_failed' });
        throw new ApiError(502, 'Payment gateway error. Please try again.');
    }

    // Create PaymentAttempt
    attempt = await PaymentAttempt.create({
        orderId: order._id,
        paymentId: payment._id,
        razorpayOrderId: rzpOrder.id,
        purpose: 'ORDER_PAYMENT',
        status: 'created',
        attemptNumber: 1,
    });

    return res.status(201).json(new ApiResponse(201, {
        orderId: order.orderId,
        razorpayOrderId: rzpOrder.id,
        amount: total,
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
