import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Order from '../../../models/Order.model.js';
import Product from '../../../models/Product.model.js';
import Coupon from '../../../models/Coupon.model.js';
import Commission from '../../../models/Commission.model.js';
import ReturnRequest from '../../../models/ReturnRequest.model.js';
import Admin from '../../../models/Admin.model.js';
import Payment from '../../../models/Payment.model.js';
import PaymentAttempt from '../../../models/PaymentAttempt.model.js';
import Refund from '../../../models/Refund.model.js';
import { generateOrderId } from '../../../utils/generateOrderId.js';
import { generateTrackingNumber } from '../../../utils/generateTrackingNumber.js';
import mongoose from 'mongoose';
import { createNotification } from '../../../services/notification.service.js';
import { calculateVendorShippingForGroups } from '../../../services/vendorShipping.service.js';
import { sendOrderConfirmationEmail } from '../../../services/email.service.js';
import { uploadLocalFileToCloudinaryAndCleanup } from '../../../services/upload.service.js';
import crypto from 'crypto';
import { notifyOrderUpdate, notifyReturnUpdate } from '../../../services/socket.service.js';
import { calculateOrderFinancials } from '../../../services/financial.service.js';
import { initiateRefund } from '../../../services/payment.service.js';


const normalizeVariantPart = (value) => String(value || '').trim().toLowerCase();
const normalizeAxisName = (value) =>
    String(value || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_');
const createDynamicVariantKey = (selection = {}) =>
    Object.entries(selection || {})
        .map(([axis, value]) => [normalizeAxisName(axis), normalizeVariantPart(value)])
        .filter(([axis, value]) => axis && value)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([axis, value]) => `${axis}=${value}`)
        .join('|');

const toVariantPriceEntries = (variantPrices) => {
    if (!variantPrices) return [];
    if (variantPrices instanceof Map) return Array.from(variantPrices.entries());
    if (typeof variantPrices === 'object') return Object.entries(variantPrices);
    return [];
};

const toVariantStockEntries = (stockMap) => {
    if (!stockMap) return [];
    if (stockMap instanceof Map) return Array.from(stockMap.entries());
    if (typeof stockMap === 'object') return Object.entries(stockMap);
    return [];
};

const resolveVariantSelection = (product, selectedVariant) => {
    const basePrice = Number(product?.price);
    if (!Number.isFinite(basePrice)) {
        throw new ApiError(400, `Invalid price configured for product ${product?.name || product?._id || ''}.`);
    }

    const entries = toVariantPriceEntries(product?.variants?.prices);
    const attributeAxes = Array.isArray(product?.variants?.attributes)
        ? product.variants.attributes
            .map((attr) => ({
                axisKey: normalizeAxisName(attr?.name),
                values: Array.isArray(attr?.values) ? attr.values : [],
            }))
            .filter((attr) => attr.axisKey && attr.values.length > 0)
        : [];
    const hasDynamicAxes = attributeAxes.length > 0;

    if (hasDynamicAxes) {
        const normalizedSelection = {};
        Object.entries(selectedVariant || {}).forEach(([axis, value]) => {
            const axisKey = normalizeAxisName(axis);
            const selectedValue = String(value || '').trim();
            if (axisKey && selectedValue) normalizedSelection[axisKey] = selectedValue;
        });

        const missingAxis = attributeAxes.find((attr) => !String(normalizedSelection[attr.axisKey] || '').trim());
        if (missingAxis) {
            throw new ApiError(400, `Please select ${missingAxis.axisKey.replace(/_/g, ' ')} for ${product?.name || 'product'}.`);
        }

        const selectionKey = createDynamicVariantKey(normalizedSelection);
        if (!selectionKey) {
            throw new ApiError(400, `Please select a variant for ${product?.name || 'product'}.`);
        }
        if (!entries.length) {
            return { price: basePrice, variantKey: selectionKey, hasVariantAxes: true };
        }

        const exact = entries.find(([rawKey]) => String(rawKey).trim() === selectionKey);
        if (exact) {
            const price = Number(exact[1]);
            if (Number.isFinite(price) && price >= 0) {
                return { price, variantKey: String(exact[0]).trim(), hasVariantAxes: true };
            }
        }
        const normalized = entries.find(
            ([rawKey]) => normalizeVariantPart(rawKey) === normalizeVariantPart(selectionKey)
        );
        if (normalized) {
            const price = Number(normalized[1]);
            if (Number.isFinite(price) && price >= 0) {
                return { price, variantKey: String(normalized[0]).trim(), hasVariantAxes: true };
            }
        }
        throw new ApiError(400, `Selected variant is not available for ${product?.name || 'product'}.`);
    }

    const sizes = Array.isArray(product?.variants?.sizes) ? product.variants.sizes : [];
    const colors = Array.isArray(product?.variants?.colors) ? product.variants.colors : [];
    const hasVariantAxes = sizes.length > 0 || colors.length > 0;

    const size = normalizeVariantPart(selectedVariant?.size);
    const color = normalizeVariantPart(selectedVariant?.color);
    if (hasVariantAxes && !size && !color) {
        throw new ApiError(400, `Please select a variant for ${product?.name || 'product'}.`);
    }
    if (!entries.length || (!size && !color)) {
        return { price: basePrice, variantKey: null, hasVariantAxes };
    }

    const candidateKeys = [
        `${size}|${color}`,
        `${size}-${color}`,
        `${size}_${color}`,
        `${size}:${color}`,
        size && !color ? size : null,
        color && !size ? color : null,
    ].filter(Boolean);

    for (const candidate of candidateKeys) {
        const exact = entries.find(([rawKey]) => String(rawKey).trim() === candidate);
        if (exact) {
            const price = Number(exact[1]);
            if (Number.isFinite(price) && price >= 0) {
                return { price, variantKey: String(exact[0]).trim(), hasVariantAxes };
            }
        }

        const normalized = entries.find(
            ([rawKey]) => normalizeVariantPart(rawKey) === normalizeVariantPart(candidate)
        );
        if (normalized) {
            const price = Number(normalized[1]);
            if (Number.isFinite(price) && price >= 0) {
                return { price, variantKey: String(normalized[0]).trim(), hasVariantAxes };
            }
        }
    }

    if (hasVariantAxes) {
        throw new ApiError(400, `Selected variant is not available for ${product?.name || 'product'}.`);
    }
    return { price: basePrice, variantKey: null, hasVariantAxes };
};

const resolveOrderItemVariantKey = (product, orderItem) => {
    const explicitKey = String(orderItem?.variantKey || '').trim();
    if (explicitKey) return explicitKey;

    const stockEntries = toVariantStockEntries(product?.variants?.stockMap).map(([k]) => String(k).trim());
    const priceEntries = toVariantPriceEntries(product?.variants?.prices).map(([k]) => String(k).trim());
    const existingKeys = [...new Set([...stockEntries, ...priceEntries])];
    if (!existingKeys.length) return null;

    const dynamicSelection = Object.entries(orderItem?.variant || {}).reduce((acc, [axis, value]) => {
        const axisKey = normalizeAxisName(axis);
        const selectedValue = String(value || '').trim();
        if (axisKey && selectedValue) acc[axisKey] = selectedValue;
        return acc;
    }, {});
    const dynamicKey = createDynamicVariantKey(dynamicSelection);
    if (dynamicKey) {
        const exactDynamic = existingKeys.find((key) => key === dynamicKey);
        if (exactDynamic) return exactDynamic;
        const normalizedDynamic = existingKeys.find(
            (key) => normalizeVariantPart(key) === normalizeVariantPart(dynamicKey)
        );
        if (normalizedDynamic) return normalizedDynamic;
    }

    const size = normalizeVariantPart(orderItem?.variant?.size);
    const color = normalizeVariantPart(orderItem?.variant?.color);
    if (!size && !color) return null;

    const candidates = [
        `${size}|${color}`,
        `${size}-${color}`,
        `${size}_${color}`,
        `${size}:${color}`,
        size && !color ? size : null,
        color && !size ? color : null,
    ].filter(Boolean);

    for (const candidate of candidates) {
        const exact = existingKeys.find((key) => key === candidate);
        if (exact) return exact;
        const normalized = existingKeys.find((key) => normalizeVariantPart(key) === normalizeVariantPart(candidate));
        if (normalized) return normalized;
    }
    return null;
};

// POST /api/user/orders
export const placeOrder = asyncHandler(async (req, res) => {
    const { items, shippingAddress, paymentMethod, couponCode, shippingOption } = req.body;
    const normalizedPaymentMethod = paymentMethod === 'cash' ? 'cod' : paymentMethod;
    const userId = req.user?.id || null;
    const rawIdempotencyKey = String(req.get('x-idempotency-key') || '').trim();
    const idempotencyKey = rawIdempotencyKey || null;
    const normalizedGuestEmail = String(shippingAddress?.email || '').trim().toLowerCase();
    const normalizedGuestPhone = String(shippingAddress?.phone || '').replace(/\D/g, '').slice(-10);
    const idempotencyScope = userId
        ? `user:${String(userId)}`
        : `guest:${normalizedGuestEmail || normalizedGuestPhone || 'anonymous'}`;

    if (idempotencyKey) {
        const existingOrder = await Order.findOne({ idempotencyScope, idempotencyKey })
            .select('orderId total trackingNumber')
            .lean();
        if (existingOrder) {
            return res.status(200).json(
                new ApiResponse(
                    200,
                    {
                        orderId: existingOrder.orderId,
                        total: existingOrder.total,
                        trackingNumber: existingOrder.trackingNumber,
                        idempotentReplay: true,
                    },
                    'Duplicate order request ignored. Returning existing order.'
                )
            );
        }
    }

    // 1. Validate items and calculate subtotal
    let subtotal = 0;
    const enrichedItems = [];
    const vendorMap = {};

    for (const item of items) {
        const product = await Product.findById(item.productId).populate(
            'vendorId',
            'commissionRate storeName shippingEnabled defaultShippingRate freeShippingThreshold'
        );
        if (!product) throw new ApiError(404, `Product not found: ${item.productId}`);
        if (!product.vendorId) {
            throw new ApiError(400, `The vendor for product ${product.name} is inactive or does not exist.`);
        }
        if (product.stock === 'out_of_stock') throw new ApiError(400, `${product.name} is out of stock.`);
        if (product.stockQuantity < item.quantity) throw new ApiError(400, `Only ${product.stockQuantity} units of ${product.name} available.`);

        // 4.8 — Enforce minimumOrderQuantity and totalAllowedQuantity (per-product limits)
        if (product.minimumOrderQuantity && item.quantity < product.minimumOrderQuantity) {
            throw new ApiError(400, `Minimum order quantity for "${product.name}" is ${product.minimumOrderQuantity}.`);
        }
        if (product.totalAllowedQuantity && item.quantity > product.totalAllowedQuantity) {
            throw new ApiError(400, `Maximum order quantity for "${product.name}" is ${product.totalAllowedQuantity}.`);
        }

        // Always trust server-side product pricing; never trust client-sent item.price.
        const { price: itemPrice, variantKey, hasVariantAxes } = resolveVariantSelection(product, item.variant);
        const variantStockValue = variantKey ? Number(product?.variants?.stockMap?.get?.(variantKey) ?? product?.variants?.stockMap?.[variantKey]) : null;
        if (hasVariantAxes && variantKey && Number.isFinite(variantStockValue) && variantStockValue < item.quantity) {
            throw new ApiError(400, `Only ${variantStockValue} units available for selected variant of ${product.name}.`);
        }
        const itemSubtotal = itemPrice * item.quantity;
        const itemTaxRate = Number(product.taxRate || 18);
        const itemTax = parseFloat(((itemSubtotal * itemTaxRate) / 100).toFixed(2));
        subtotal += itemSubtotal;

        const variantImage =
            variantKey
                ? String((product?.variants?.imageMap?.get?.(variantKey) ?? product?.variants?.imageMap?.[variantKey]) || '').trim()
                : '';
        const enriched = {
            productId: product._id,
            vendorId: product.vendorId._id,
            name: product.name,
            image: variantImage || product.image,
            price: itemPrice,
            quantity: item.quantity,
            taxRate: itemTaxRate,
            tax: itemTax,
            variant: item.variant,
            variantKey: variantKey || undefined,
        };
        enrichedItems.push(enriched);

        // Group by vendor
        const vid = product.vendorId._id.toString();
        if (!vendorMap[vid]) {
            vendorMap[vid] = {
                vendorId: product.vendorId._id,
                vendorName: product.vendorId.storeName,
                commissionRate: product.vendorId.commissionRate || 10,
                shippingEnabled: product.vendorId.shippingEnabled !== false,
                defaultShippingRate: product.vendorId.defaultShippingRate,
                freeShippingThreshold: product.vendorId.freeShippingThreshold,
                items: [],
                subtotal: 0,
            };
        }
        vendorMap[vid].items.push(enriched);
        vendorMap[vid].subtotal += itemSubtotal;
    }

    // 2. Validate coupon
    let couponDiscount = 0;
    let appliedCoupon = null;
    if (couponCode) {
        const coupon = await Coupon.findOne({ code: couponCode.toUpperCase(), isActive: true });
        if (!coupon) throw new ApiError(400, 'Invalid coupon code.');
        if (coupon.startsAt && coupon.startsAt > Date.now()) throw new ApiError(400, 'Coupon is not active yet.');
        if (coupon.expiresAt && coupon.expiresAt < Date.now()) throw new ApiError(400, 'Coupon has expired.');
        if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) throw new ApiError(400, 'Coupon usage limit reached.');
        if (subtotal < coupon.minOrderValue) throw new ApiError(400, `Minimum order value for this coupon is Rs.${coupon.minOrderValue}.`);

        if (coupon.type === 'percentage') {
            couponDiscount = (subtotal * coupon.value) / 100;
            if (coupon.maxDiscount) couponDiscount = Math.min(couponDiscount, coupon.maxDiscount);
        } else if (coupon.type === 'fixed') {
            couponDiscount = coupon.value;
        }
        appliedCoupon = coupon;
        couponDiscount = parseFloat(Math.min(couponDiscount, subtotal).toFixed(2));
    }

    // 3. Calculate shipping
    const vendorShippingInput = Object.values(vendorMap).map((vendorGroup) => ({
        vendorId: vendorGroup.vendorId,
        subtotal: vendorGroup.subtotal,
        shippingEnabled: vendorGroup.shippingEnabled,
        defaultShippingRate: vendorGroup.defaultShippingRate,
        freeShippingThreshold: vendorGroup.freeShippingThreshold,
    }));
    const { totalShipping: shipping, shippingByVendor } = await calculateVendorShippingForGroups({
        vendorGroups: vendorShippingInput,
        shippingAddress,
        shippingOption,
        couponType: appliedCoupon?.type || null,
    });

    // 4. Calculate financial totals using centralized helper
    enrichedItems.sort((a, b) => String(a.productId).localeCompare(String(b.productId)));

    const vendorCommissions = {};
    Object.values(vendorMap).forEach(v => {
        vendorCommissions[String(v.vendorId)] = v.commissionRate;
    });

    const financials = calculateOrderFinancials({
        items: enrichedItems,
        couponDiscount,
        shipping,
        vendorCommissions,
        vendorShippings: shippingByVendor
    });

    // Update enrichedItems tax with calculated itemTax from financials
    financials.items.forEach((fItem, idx) => {
        enrichedItems[idx].tax = fItem.itemTax;
    });

    const tax = financials.tax;
    const total = financials.finalTotal;

    // 5. Build vendor item groups with dynamic tax
    const vendorItems = Object.values(vendorMap).map((v) => {
        const vCalc = financials.vendorCalculations.find(vc => String(vc.vendorId) === String(v.vendorId)) || {};
        const vTax = financials.items
            .filter(item => String(item.vendorId) === String(v.vendorId))
            .reduce((acc, item) => acc + item.itemTax, 0);

        v.items.forEach(item => {
            const fItem = financials.items.find(fi => String(fi.productId) === String(item.productId));
            if (fItem) {
                item.tax = fItem.itemTax;
            }
        });

        return {
            vendorId: v.vendorId,
            vendorName: v.vendorName,
            items: v.items,
            subtotal: v.subtotal,
            shipping: Number(shippingByVendor[String(v.vendorId)] || 0),
            tax: parseFloat(vTax.toFixed(2)),
            discount: vCalc.discountShare || 0,
            status: 'pending',
            commissionRate: vCalc.commissionRate || 10,
            commissionAmount: vCalc.commission || 0,
            vendorEarnings: vCalc.vendorEarnings || 0,
            isOnHoldBalanceAdded: false
        };
    });

    // 6-9. Transactional order creation to avoid partial writes.
    let order = null;
    let idempotentReplay = false;
    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            if (idempotencyKey) {
                const existingOrder = await Order.findOne({ idempotencyScope, idempotencyKey })
                    .select('orderId total trackingNumber')
                    .session(session);
                if (existingOrder) {
                    order = existingOrder;
                    idempotentReplay = true;
                    return;
                }
            }

            const orderId = generateOrderId();
            const orderIdSuffix = orderId;
            const [createdOrder] = await Order.create([{
                orderId,
                userId,
                items: enrichedItems,
                vendorItems,
                shippingAddress,
                paymentMethod: normalizedPaymentMethod,
                // COD orders are automatically confirmed; online orders wait for payment.
                status: normalizedPaymentMethod === 'cod' ? 'processing' : 'pending',
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
                estimatedDelivery: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // +5 days
                invoiceNumber: `INV-${orderIdSuffix}`, // Using the generated Order ID suffix or full ID
                invoiceDate: new Date(),
                idempotencyKey: idempotencyKey || undefined,
                idempotencyScope: idempotencyKey ? idempotencyScope : undefined,
            }], { session });
            order = createdOrder;

            // 7. Deduct stock atomically to prevent oversell under concurrent checkout.
            for (const item of enrichedItems) {
                const product = await Product.findById(item.productId).session(session);
                const hasVariantStock = item.variantKey && product?.variants?.stockMap && (
                    (product.variants.stockMap instanceof Map && product.variants.stockMap.has(item.variantKey)) ||
                    (typeof product.variants.stockMap === 'object' && product.variants.stockMap[item.variantKey] !== undefined)
                );
                const variantPath = hasVariantStock ? `variants.stockMap.${item.variantKey}` : null;
                const baseFilter = {
                    _id: item.productId,
                    stock: { $ne: 'out_of_stock' },
                    stockQuantity: { $gte: Number(item.quantity || 0) },
                };
                if (variantPath) {
                    baseFilter[variantPath] = { $gte: Number(item.quantity || 0) };
                }


                const updatePayload = { $inc: { stockQuantity: -Number(item.quantity || 0) } };
                if (variantPath) {
                    updatePayload.$inc[variantPath] = -Number(item.quantity || 0);
                }

                const updatedProduct = await Product.findOneAndUpdate(
                    baseFilter,
                    updatePayload,
                    { new: true, session }
                );

                if (!updatedProduct) {
                    throw new ApiError(409, `Insufficient stock while processing ${item.name}. Please refresh and try again.`);
                }

                const nextStockState =
                    updatedProduct.stockQuantity <= 0
                        ? 'out_of_stock'
                        : (updatedProduct.stockQuantity <= updatedProduct.lowStockThreshold ? 'low_stock' : 'in_stock');

                await Product.updateOne(
                    { _id: updatedProduct._id },
                    { $set: { stock: nextStockState } },
                    { session }
                );
            }

            // 8. Record commissions
            const commissionDocs = financials.vendorCalculations.map((vc) => {
                const v = Object.values(vendorMap).find(vm => String(vm.vendorId) === String(vc.vendorId));
                return {
                    orderId: order._id,
                    vendorId: vc.vendorId,
                    vendorName: v ? v.vendorName : '',
                    subtotal: vc.subtotal,
                    discountShare: vc.discountShare,
                    effectiveSubtotal: vc.effectiveSubtotal,
                    commissionRate: vc.commissionRate,
                    commission: vc.commission,
                    vendorEarnings: vc.vendorEarnings,
                    // Step 12 financial snapshot & lifecycle fields
                    vendorSubtotal: vc.subtotal,
                    vendorCouponDiscount: vc.discountShare,
                    vendorDiscountedSubtotal: vc.effectiveSubtotal,
                    vendorTax: vc.vendorTax,
                    vendorTotalPaidByCustomer: vc.vendorTotalPaidByCustomer,
                    commissionAmount: vc.commission,
                    vendorNetEarnings: vc.vendorEarnings,
                    escrowAmount: vc.vendorEarnings,
                    walletCredit: 0,
                    escrowStatus: 'held',
                    settlementStatus: 'pending',
                    releasedAt: null,
                    escrowReleaseDate: null,
                    ...(appliedCoupon ? {
                        couponId: appliedCoupon._id,
                        couponCode: appliedCoupon.code,
                        couponType: appliedCoupon.type,
                        couponValue: appliedCoupon.value,
                    } : {})
                };
            });
            await Commission.insertMany(commissionDocs, { session });

            // 9. Increment coupon usage
            if (appliedCoupon) {
                if (appliedCoupon.usageLimit) {
                    const usageResult = await Coupon.updateOne(
                        {
                            _id: appliedCoupon._id,
                            usedCount: { $lt: appliedCoupon.usageLimit },
                        },
                        { $inc: { usedCount: 1 } },
                        { session }
                    );
                    if (!usageResult?.modifiedCount) {
                        throw new ApiError(409, 'Coupon usage limit reached.');
                    }
                } else {
                    await Coupon.updateOne(
                        { _id: appliedCoupon._id },
                        { $inc: { usedCount: 1 } },
                        { session }
                    );
                }
            }
        });
    } catch (err) {
        if (idempotencyKey && err?.code === 11000) {
            const existingOrder = await Order.findOne({ idempotencyScope, idempotencyKey })
                .select('orderId total trackingNumber')
                .lean();
            if (existingOrder) {
                order = existingOrder;
                idempotentReplay = true;
            } else {
                throw err;
            }
        } else {
            throw err;
        }
    } finally {
        await session.endSession();
    }

    const responseStatus = idempotentReplay ? 200 : 201;
    const responseMessage = idempotentReplay
        ? 'Duplicate order request ignored. Returning existing order.'
        : 'Order placed successfully.';
    res.status(responseStatus).json(
        new ApiResponse(
            responseStatus,
            {
                orderId: order.orderId,
                total: order.total,
                trackingNumber: order.trackingNumber,
                ...(idempotentReplay ? { idempotentReplay: true } : {}),
            },
            responseMessage
        )
    );

    // Send confirmation email and notifications (async, non-blocking)
    if (!idempotentReplay && order?.orderId) {
        const emailAddress = order?.shippingAddress?.email || (req.user?.email);
        if (emailAddress) {
            sendOrderConfirmationEmail(order, emailAddress).catch((err) =>
                console.error(`[Order Email] Failed to send for ${order.orderId}:`, err.message)
            );
        }

        if (userId) {
            createNotification({
                recipientId: userId,
                recipientType: 'user',
                title: 'Order Placed!',
                message: `Your order ${order.orderId} has been placed successfully.`,
                type: 'order',
                data: { link: `/orders/${order.orderId}` },
            }).catch((err) => console.error('[Order Notification] Failed to create:', err.message));
        }

        // Notify vendors and create database notifications
        (order.vendorItems || []).forEach((vGroup) => {
            createNotification({
                recipientId: vGroup.vendorId,
                recipientType: 'vendor',
                title: 'New Order Received!',
                message: `You have received a new order ${order.orderId} for ${vGroup.items?.length || 0} item(s) totalling ₹${vGroup.subtotal}.`,
                type: 'order',
                data: {
                    orderId: String(order.orderId || order._id),
                },
            }).catch((err) => console.error('[Vendor Order Notification] Failed to create:', err.message));

            emitToRoom(`vendor_${vGroup.vendorId}`, 'new_order', {
                orderId: order.orderId,
                total: vGroup.subtotal,
                itemsCount: vGroup.items?.length || 0,
            });
        });
        notifyOrderUpdate(order);
    }
});

// GET /api/user/orders
export const getUserOrders = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;
    const orders = await Order.find({ userId: req.user.id }).sort({ createdAt: -1 }).skip(skip).limit(Number(limit));
    const total = await Order.countDocuments({ userId: req.user.id });

    // Fetch return requests for these orders
    const orderIds = orders.map(o => o._id);
    const returnRequests = await ReturnRequest.find({ orderId: { $in: orderIds } }).lean();

    // Group return requests by orderId
    const returnMap = {};
    returnRequests.forEach(retReq => {
        const oId = String(retReq.orderId);
        if (!returnMap[oId]) returnMap[oId] = [];
        returnMap[oId].push(retReq);
    });

    // Attach returnRequests to each order
    const ordersWithReturns = orders.map(order => {
        const orderObj = order.toObject();
        orderObj.returnRequests = returnMap[String(order._id)] || [];
        return orderObj;
    });

    res.status(200).json(new ApiResponse(200, { orders: ordersWithReturns, total, page: Number(page), pages: Math.ceil(total / limit) }, 'Orders fetched.'));
});

// GET /api/user/orders/:id
export const getOrderDetail = asyncHandler(async (req, res) => {
    const order = await Order.findOne({ orderId: req.params.id, userId: req.user.id }).select('+deliveryOtpDebug');
    if (!order) throw new ApiError(404, 'Order not found.');

    const returnRequests = await ReturnRequest.find({ orderId: order._id }).populate('vendorId', 'storeName email');
    const orderObject = order.toObject();
    orderObject.returnRequests = returnRequests || [];

    res.status(200).json(new ApiResponse(200, orderObject, 'Order detail fetched.'));
});

// PATCH /api/user/orders/:id/cancel
export const cancelOrder = asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    let order = null;
    let shouldRefund = null;
    try {
        await session.withTransaction(async () => {
            order = await Order.findOne({ orderId: req.params.id, userId: req.user.id }).session(session);
            if (!order) throw new ApiError(404, 'Order not found.');
            if (!['pending', 'processing', 'payment_pending'].includes(order.status)) throw new ApiError(400, 'Order cannot be cancelled at this stage.');

            order.status = 'cancelled';
            order.cancelledAt = new Date();
            order.cancellationReason = req.body.reason || 'Cancelled by customer';
            if (Array.isArray(order.vendorItems)) {
                order.vendorItems = order.vendorItems.map((vendorGroup) => ({
                    ...vendorGroup.toObject(),
                    status: 'cancelled',
                }));
            }

            // Queue refund for online-paid orders (COD = no refund, customer hasn't paid)
            if (order.paymentStatus === 'paid') {
                const paidAttempt = await PaymentAttempt.findOne({
                    orderId: order._id, status: 'paid',
                }).session(session);
                if (paidAttempt?.razorpayPaymentId) {
                    shouldRefund = {
                        razorpayPaymentId: paidAttempt.razorpayPaymentId,
                        amount: order.total,
                        orderId: order._id,
                        paymentId: paidAttempt.paymentId,
                    };
                }
                order.paymentStatus = 'refunded';
            }
            // COD cancellation: no refund needed (customer has not paid yet)

            await order.save({ session });

            // Restore stock and status (only for orders that had stock deducted — not payment_pending)
            if (order.status !== 'payment_pending') {
                for (const item of order.items) {
                    const quantity = Number(item.quantity || 0);
                    if (quantity <= 0) continue;

                    const productSnapshot = await Product.findById(item.productId)
                        .select('variants.stockMap variants.prices')
                        .session(session)
                        .lean();
                    const variantKey = resolveOrderItemVariantKey(productSnapshot, item);

                    const incUpdate = { stockQuantity: quantity };
                    if (variantKey) {
                        incUpdate[`variants.stockMap.${variantKey}`] = quantity;
                    }

                    const product = await Product.findByIdAndUpdate(item.productId, { $inc: incUpdate }, { new: true, session });
                    if (!product) continue;

                    const nextStockState =
                        product.stockQuantity <= 0
                            ? 'out_of_stock'
                            : (product.stockQuantity <= product.lowStockThreshold ? 'low_stock' : 'in_stock');

                    await Product.updateOne(
                        { _id: product._id },
                        { $set: { stock: nextStockState } },
                        { session }
                    );
                }
            }

            // Reverse vendor earnings visibility for this order.
            await Commission.updateMany(
                {
                    orderId: order._id,
                    status: { $ne: 'cancelled' },
                },
                {
                    $set: {
                        status: 'cancelled',
                        paidAt: null,
                        settlementId: null,
                    },
                },
                { session }
            );
        });
    } finally {
        await session.endSession();
    }

    // After transaction: initiate Razorpay refund for online-paid orders
    if (shouldRefund) {
        try {
            const rzpRefund = await initiateRefund(shouldRefund.razorpayPaymentId, shouldRefund.amount, {
                reason: 'customer_cancellation',
            });
            await Refund.create({
                orderId:          shouldRefund.orderId,
                amount:           shouldRefund.amount,
                referenceId:      `ORDER_CANCEL_REFUND_${shouldRefund.orderId}`, // unique — prevents double refund
                method:           'razorpay_auto',
                status:           'processing',
                razorpayRefundId: rzpRefund.id,
                paymentAttemptId: shouldRefund.paymentId,
                notes:            'Refund: customer cancelled order',
            });
            await Payment.findOneAndUpdate({ orderId: shouldRefund.orderId }, { status: 'refunded' });
        } catch (refundErr) {
            // Log but don't fail the cancel — order is already cancelled
            console.error('[CANCEL_REFUND_ERROR]', shouldRefund.orderId, refundErr.message);
        }
    }

    if (order) {
        notifyOrderUpdate(order);
    }

    res.status(200).json(new ApiResponse(200, null, 'Order cancelled successfully.'));
});

const normalizeReturnRequest = (requestDoc) => {
    const request = typeof requestDoc?.toObject === 'function' ? requestDoc.toObject() : requestDoc;
    const orderOrderId = request?.orderId?.orderId || '';
    const orderRefId = request?.orderId?._id || request?.orderId || null;
    return {
        ...request,
        id: String(request?._id || ''),
        orderId: orderOrderId || String(orderRefId || ''),
        orderRefId: orderRefId ? String(orderRefId) : null,
        requestDate: request?.createdAt,
    };
};

// POST /api/user/orders/:id/returns
export const createReturnRequest = asyncHandler(async (req, res) => {
    const order = await Order.findOne({ orderId: req.params.id, userId: req.user.id });
    if (!order) throw new ApiError(404, 'Order not found.');
    if (order.status !== 'delivered') {
        throw new ApiError(400, 'Return can only be requested for delivered orders.');
    }

    const requestedVendorId = String(req.body.vendorId || '').trim();
    const orderItems = Array.isArray(order.items) ? order.items : [];
    const orderVendorIds = [...new Set(orderItems.map((item) => String(item?.vendorId || '')).filter(Boolean))];

    let vendorId = requestedVendorId;
    if (!vendorId) {
        if (orderVendorIds.length > 1) {
            throw new ApiError(400, 'vendorId is required for multi-vendor orders.');
        }
        vendorId = orderVendorIds[0] || '';
    }
    if (!vendorId) {
        throw new ApiError(400, 'Unable to resolve vendor for return request.');
    }

    const vendorScopedItems = orderItems.filter((item) => String(item?.vendorId || '') === vendorId);
    if (vendorScopedItems.length === 0) {
        throw new ApiError(400, 'Selected vendor has no items in this order.');
    }

    let requestedItems = [];
    if (req.body.itemsJson) {
        try {
            requestedItems = JSON.parse(req.body.itemsJson);
        } catch (err) {
            throw new ApiError(400, 'Invalid itemsJson payload format.');
        }
    } else if (Array.isArray(req.body.items)) {
        requestedItems = req.body.items;
    }

    let normalizedItems = [];

    if (requestedItems.length > 0) {
        normalizedItems = requestedItems.map((inputItem) => {
            const productId = String(inputItem?.productId || '');
            const orderItem = vendorScopedItems.find((it) => String(it?.productId || '') === productId);
            if (!orderItem) {
                throw new ApiError(400, `Product ${productId} is not valid for this return request.`);
            }

            const requestedQty = Number(inputItem?.quantity || 0);
            const maxQty = Number(orderItem?.quantity || 0);
            if (!Number.isFinite(requestedQty) || requestedQty <= 0 || requestedQty > maxQty) {
                throw new ApiError(400, `Invalid quantity for product ${orderItem.name || productId}.`);
            }

            return {
                productId: orderItem.productId,
                name: orderItem.name,
                quantity: requestedQty,
                reason: String(inputItem?.reason || req.body.returnReason || '').trim(),
            };
        });
    } else {
        if (req.body.itemsJson || Array.isArray(req.body.items)) {
            throw new ApiError(400, 'Please select at least one item to return/exchange.');
        }
        normalizedItems = vendorScopedItems.map((item) => ({
            productId: item.productId,
            name: item.name,
            quantity: Number(item.quantity || 1),
            reason: String(req.body.returnReason || '').trim(),
        }));
    }

    const existingOpen = await ReturnRequest.findOne({
        orderId: order._id,
        userId: req.user.id,
        vendorId,
        status: { $in: ['pending', 'approved', 'pickup_pending', 'pickup_assigned', 'picked_up', 'delivered_to_vendor'] },
    });
    if (existingOpen) {
        throw new ApiError(409, 'An active return request already exists for this vendor in the selected order.');
    }

    // 1. Upload files in req.files to Cloudinary
    const evidenceImages = [];
    if (Array.isArray(req.files) && req.files.length > 0) {
        for (const file of req.files) {
            const uploaded = await uploadLocalFileToCloudinaryAndCleanup(file.path, 'returns');
            if (uploaded) {
                evidenceImages.push({
                    url: uploaded.url,
                    public_id: uploaded.publicId || uploaded.public_id || ''
                });
            }
        }
    }

    const returnReason = req.body.returnReason;
    const customReason = String(req.body.customReason || '').trim();

    // 2. Validate conditionally mandatory image uploads
    const evidenceRequiredReasons = [
        "Product Damaged",
        "Wrong Product Received",
        "Missing Parts or Accessories",
        "Product Not Matching Description",
        "Defective Product"
    ];
    if (evidenceRequiredReasons.includes(returnReason) && evidenceImages.length === 0) {
        throw new ApiError(400, `Evidence images are required for reason: ${returnReason}`);
    }

    const requestType = req.body.requestType === 'exchange' ? 'exchange' : 'return';
    let exchangeDetails = undefined;

    // 3. Exchange validations
    if (requestType === 'exchange') {
        let size = '';
        let color = '';
        if (req.body.exchangeDetails?.requestedVariant) {
            size = String(req.body.exchangeDetails.requestedVariant.size || '').trim();
            color = String(req.body.exchangeDetails.requestedVariant.color || '').trim();
        } else {
            size = String(req.body.exchangeSize || '').trim();
            color = String(req.body.exchangeColor || '').trim();
        }

        if (!size && !color) {
            throw new ApiError(400, 'Requested size or color variant selection is required for exchange.');
        }

        // Validate requested variants exist and have stock
        for (const item of normalizedItems) {
            const product = await Product.findById(item.productId);
            if (!product) throw new ApiError(404, `Product not found: ${item.productId}`);

            const mockOrderItem = {
                productId: item.productId,
                variant: { size, color }
            };
            const variantKey = resolveOrderItemVariantKey(product, mockOrderItem);
            if (!variantKey) {
                throw new ApiError(400, `The variant Size: ${size}, Color: ${color} is not available for product ${product.name}.`);
            }

            // Prevent exchanging for the exact same variant
            const orderItemMatch = order.items.find(it => String(it.productId) === String(product._id));
            if (orderItemMatch) {
                const purchasedSize = String(orderItemMatch.variant?.size || '').trim().toLowerCase();
                const purchasedColor = String(orderItemMatch.variant?.color || '').trim().toLowerCase();
                if (purchasedSize === size.toLowerCase() && purchasedColor === color.toLowerCase()) {
                    throw new ApiError(400, 'Cannot exchange for the exact same variant size and color.');
                }
            }

            const getStockFromMap = (stockMap, key) => {
                if (!stockMap) return 0;
                if (typeof stockMap.get === 'function') return Number(stockMap.get(key) || 0);
                return Number(stockMap[key] || 0);
            };
            const stock = getStockFromMap(product.variants?.stockMap, variantKey);
            if (stock < item.quantity) {
                throw new ApiError(400, `The requested variant Size: ${size}, Color: ${color} is currently out of stock for product ${product.name}.`);
            }

            exchangeDetails = {
                requestedVariant: { size, color, variantKey }
            };
        }
    }

    const commission = await Commission.findOne({ orderId: order._id, vendorId });
    let discountRatio = 0;
    if (commission) {
        const discountShare = commission.discountShare !== undefined ? commission.discountShare : 0;
        const commSubtotal = commission.subtotal || 0;
        if (commSubtotal > 0) {
            discountRatio = discountShare / commSubtotal;
        }
    }

    const refundAmount = normalizedItems.reduce((sum, item) => {
        const orderItem = vendorScopedItems.find((it) => String(it?.productId || '') === String(item.productId || ''));
        const unitPrice = Number(orderItem?.price || 0);
        const originalAmount = unitPrice * Number(item.quantity || 0);
        const itemRefundAmount = originalAmount * (1 - discountRatio);
        return sum + itemRefundAmount;
    }, 0);

    if (returnReason === "Other") {
        if (!customReason) {
            throw new ApiError(400, "Custom reason is required when 'Other' is selected.");
        }
        if (customReason.length < 10 || customReason.length > 500) {
            throw new ApiError(400, "Custom reason must be between 10 and 500 characters.");
        }
    }

    if (requestType === 'return' && order.paymentMethod === 'cod') {
        const refundMethod = req.body.refundMethod;
        if (!refundMethod || !['bank', 'upi'].includes(refundMethod)) {
            throw new ApiError(400, 'Refund method is required for Cash on Delivery returns.');
        }

        order.refundMethod = refundMethod;
        if (refundMethod === 'bank') {
            const details = req.body.bankDetails || {};
            if (!details.accountHolder || !details.accountNumber || !details.ifsc || !details.bankName) {
                throw new ApiError(400, 'All bank details (accountHolder, accountNumber, ifsc, bankName) are required.');
            }
            order.bankDetails = {
                accountHolder: details.accountHolder,
                accountNumber: details.accountNumber,
                ifsc: details.ifsc,
                bankName: details.bankName
            };
            order.upiId = undefined;
        } else {
            const upiId = req.body.upiId;
            if (!upiId || !upiId.includes('@')) {
                throw new ApiError(400, 'A valid UPI ID is required.');
            }
            order.upiId = upiId;
            order.bankDetails = undefined;
        }
        await order.save();
    }

    const request = await ReturnRequest.create({
        orderId: order._id,
        userId: req.user.id,
        vendorId,
        items: normalizedItems,
        requestType,
        exchangeDetails,
        evidenceImages,
        returnReason,
        customReason,
        status: 'pending',
        refundAmount: Number(refundAmount.toFixed(2)),
        refundStatus: 'pending',
        images: evidenceImages.map(img => img.url),
    });

    const admins = await Admin.find({ isActive: true }).select('_id').lean();
    await Promise.all(
        admins.map((admin) =>
            createNotification({
                recipientId: admin._id,
                recipientType: 'admin',
                title: 'New Return Request',
                message: `Order ${order.orderId} has a new return request awaiting review.`,
                type: 'order',
                data: {
                    returnRequestId: String(request._id),
                    orderId: String(order.orderId),
                    vendorId: String(vendorId),
                },
            })
        )
    );

    await createNotification({
        recipientId: vendorId,
        recipientType: 'vendor',
        title: 'New Return Request',
        message: `Order ${order.orderId} has a return request from customer.`,
        type: 'order',
        data: {
            returnRequestId: String(request._id),
            orderId: String(order.orderId),
        },
    });

    const populated = await ReturnRequest.findById(request._id)
        .populate('orderId', 'orderId total createdAt')
        .populate('vendorId', 'storeName email');

    notifyReturnUpdate(populated);

    res.status(201).json(new ApiResponse(201, normalizeReturnRequest(populated), 'Return request submitted successfully.'));
});

// GET /api/user/returns
export const getUserReturnRequests = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, status } = req.query;
    const numericPage = Math.max(1, Number(page) || 1);
    const numericLimit = Math.max(1, Number(limit) || 20);
    const filter = { userId: req.user.id };
    if (status && status !== 'all') filter.status = status;

    const [requests, total] = await Promise.all([
        ReturnRequest.find(filter)
            .populate('orderId', 'orderId total createdAt')
            .populate('vendorId', 'storeName email')
            .sort({ createdAt: -1 })
            .skip((numericPage - 1) * numericLimit)
            .limit(numericLimit),
        ReturnRequest.countDocuments(filter),
    ]);

    res.status(200).json(new ApiResponse(200, {
        returnRequests: requests.map(normalizeReturnRequest),
        pagination: {
            total,
            page: numericPage,
            limit: numericLimit,
            pages: Math.ceil(total / numericLimit),
        },
    }, 'Return requests fetched.'));
});

// GET /api/user/returns/:id
export const getUserReturnRequestById = asyncHandler(async (req, res) => {
    const request = await ReturnRequest.findOne({ _id: req.params.id, userId: req.user.id })
        .populate('orderId', 'orderId total createdAt')
        .populate('vendorId', 'storeName email');
    if (!request) throw new ApiError(404, 'Return request not found.');
    res.status(200).json(new ApiResponse(200, normalizeReturnRequest(request), 'Return request fetched.'));
});

// POST /api/user/returns/:id/regenerate-otp
export const regenerateReturnPickupOtp = asyncHandler(async (req, res) => {
    const returnRequest = await ReturnRequest.findOne({
        _id: req.params.id,
        userId: req.user.id
    }).populate('orderId', 'orderId');

    if (!returnRequest) throw new ApiError(404, 'Return request not found.');

    const activeStatuses = ['approved', 'pickup_pending', 'pickup_assigned'];
    if (!activeStatuses.includes(returnRequest.status)) {
        throw new ApiError(400, `Cannot regenerate OTP. Return request is in status: ${returnRequest.status}`);
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const hash = crypto.createHash('sha256').update(otp).digest('hex');

    returnRequest.returnPickupOtpHash = hash;
    returnRequest.returnPickupOtpExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins
    returnRequest.returnPickupOtpAttempts = 0;
    returnRequest.returnPickupOtpVerified = false;

    // 5.1 — Only store/return plain-text OTP in non-production environments
    const isDev = process.env.NODE_ENV !== 'production';
    returnRequest.returnPickupOtpDebug = isDev ? otp : null;

    await returnRequest.save();
    notifyReturnUpdate(returnRequest);

    return res.status(200).json(new ApiResponse(200, {
        ...(isDev && { otpDebug: otp }),   // never exposed in production
        expiresAt: returnRequest.returnPickupOtpExpiresAt,
        returnRequest: normalizeReturnRequest(returnRequest)
    }, 'OTP regenerated successfully.'));
});
