import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Order from '../../../models/Order.model.js';
import Shipment from '../../../models/Shipment.model.js';
import Product from '../../../models/Product.model.js';
import Coupon from '../../../models/Coupon.model.js';
import Commission from '../../../models/Commission.model.js';
import ReturnRequest from '../../../models/ReturnRequest.model.js';
import Admin from '../../../models/Admin.model.js';
import Payment from '../../../models/Payment.model.js';
import PaymentAttempt from '../../../models/PaymentAttempt.model.js';
import Refund from '../../../models/Refund.model.js';
import ShippingQuote from '../../../models/ShippingQuote.model.js';
import { creditWallet } from '../../../services/wallet.service.js';
import { processCancellationRefund } from '../../../services/cancellationRefundService.js';
import { generateOrderId } from '../../../utils/generateOrderId.js';
import { generateTrackingNumber } from '../../../utils/generateTrackingNumber.js';
import mongoose from 'mongoose';
import { createNotification } from '../../../services/notification.service.js';
import { buildExchangeSummary, buildOrderItemsSummary, buildVendorItemsSummary } from '../../../utils/notificationProductFormatter.js';
import { calculateVendorShippingForGroups } from '../../../services/vendorShipping.service.js';
import { sendOrderConfirmationEmail } from '../../../services/email.service.js';
import { uploadLocalFileToCloudinaryAndCleanup } from '../../../services/upload.service.js';
import crypto from 'crypto';
import { notifyOrderUpdate, notifyReturnUpdate, emitToRoom } from '../../../services/socket.service.js';
import { calculateOrderFinancials } from '../../../services/financial.service.js';
import { initiateRefund } from '../../../services/payment.service.js';
import { getDefaultCommissionRate, isPaymentMethodEnabled } from '../../../services/settingsService.js';
import logisticsEventBus from '../../../events/logisticsEventBus.js';
import LOGISTICS_EVENTS from '../../../events/logisticsEvents.js';
import AuditLog from '../../../models/AuditLog.model.js';
import { cancelShipmentDeliveryAssignment } from '../../../services/assignmentService.js';

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
    const { items, shippingAddress, paymentMethod, couponCode, shippingOption, shippingQuotes } = req.body;
    const normalizedPaymentMethod = paymentMethod === 'cash' ? 'cod' : paymentMethod;

    // Validate that payment method is enabled
    const isMethodActive = await isPaymentMethodEnabled(normalizedPaymentMethod);
    if (!isMethodActive) {
        throw new ApiError(400, `${paymentMethod === 'cash' ? 'Cash on Delivery' : paymentMethod} is currently unavailable.`);
    }
    const userId = req.user?.id || null;
    const rawIdempotencyKey = String(req.get('x-idempotency-key') || '').trim();
    const idempotencyKey = rawIdempotencyKey || null;
    const normalizedGuestEmail = String(shippingAddress?.email || '').trim().toLowerCase();
    const normalizedGuestPhone = String(shippingAddress?.phone || '').replace(/\D/g, '').slice(-10);
    const idempotencyScope = userId
        ? `user:${String(userId)}`
        : `guest:${normalizedGuestEmail || normalizedGuestPhone || 'anonymous'}`;
    const defaultRate = await getDefaultCommissionRate();

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
            'commissionRate storeName'
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
                commissionRate: product.vendorId.commissionRate !== undefined && product.vendorId.commissionRate !== null ? product.vendorId.commissionRate : defaultRate,
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

    // 5. Build vendor item groups with dynamic tax snapshot
    const vendorItems = Object.values(vendorMap).map((v) => {
        const vendorIdStr = String(v.vendorId);
        const vCalc = financials.vendorCalculations.find(vc => String(vc.vendorId) === vendorIdStr) || {};
        
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
            vendorId: v.vendorId,
            vendorName: v.vendorName,
            items: groupItems,
            subtotal: v.subtotal,
            shipping: Number(shippingByVendor[vendorIdStr] || 0),
            tax: vCalc.vendorTax,
            discount: vCalc.discountShare || 0,
            status: 'pending',
            commissionRate: vCalc.commissionRate !== undefined && vCalc.commissionRate !== null ? vCalc.commissionRate : defaultRate,
            commissionAmount: vCalc.commission || 0,
            vendorEarnings: vCalc.vendorEarnings || 0,
            isOnHoldBalanceAdded: false,
        };
    });

    // 6-10. Transactional order creation to avoid partial writes.
    let order = null;
    let idempotentReplay = false;
    let createdShipments = [];   // Phase 5.1: collected inside transaction for post-commit events
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

            // --- Phase 7: Quote Validation ---
            let normalizedQuotes = {};
            if (shippingQuotes && typeof shippingQuotes === 'object') {
                normalizedQuotes = shippingQuotes;
            } else if (shippingOption && typeof shippingOption === 'object' && shippingOption.quoteId && vendorItems.length > 0) {
                // Legacy fallback for frontends sending { quoteId: "..." } in shippingOption
                normalizedQuotes[String(vendorItems[0].vendorId)] = shippingOption.quoteId;
            } else if (typeof shippingOption === 'string' && shippingOption.startsWith('QT-') && vendorItems.length > 0) {
                // If they passed a string like QT-123
                normalizedQuotes[String(vendorItems[0].vendorId)] = shippingOption;
            }

            const validatedQuotes = {};
            for (const [vId, qId] of Object.entries(normalizedQuotes)) {
                if (!qId) continue;
                const quote = await ShippingQuote.findOne({ quoteId: qId }).session(session);
                if (!quote) throw new ApiError(400, `Shipping quote ${qId} not found.`);
                if (quote.usedForOrder) throw new ApiError(400, `Shipping quote ${qId} has already been used.`);
                if (quote.expiresAt < new Date()) throw new ApiError(400, `Shipping quote ${qId} has expired. Please refresh checkout.`);
                if (quote.quoteScope !== idempotencyScope) throw new ApiError(403, `Shipping quote ${qId} does not belong to the current session.`);
                if (String(quote.vendorId) !== String(vId)) throw new ApiError(400, `Shipping quote ${qId} does not match the assigned vendor.`);
                
                validatedQuotes[String(vId)] = quote;
            }

            const orderId = generateOrderId();
            const orderIdSuffix = orderId;
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

            // --- Phase 7: Consume Quotes ---
            for (const quote of Object.values(validatedQuotes)) {
                quote.orderId = order._id;
                quote.usedForOrder = true;
                await quote.save({ session });
            }

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

            // ─────────────────────────────────────────────────────────────────────
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

            // ─────────────────────────────────────────────────────────────────────
            // 10. Create Shipment documents — one per vendor group. (Phase 5.1)
            //
            // Shipment creation is INSIDE the same transaction as Order creation.
            // If Shipment creation fails, the entire transaction rolls back —
            // there will never be an Order without its corresponding Shipment(s).
            //
            // Provider selection:
            //   - If shippingOption.quoteId is present, resolve the ShippingQuote
            //     and use its providerId + estimatedCost. (Phase 5.1 — future enhancement)
            //   - Fallback: 'own_fleet' with estimatedDeliveryCost=0 (legacy path,
            //     for backward compatibility with frontends that don't send a quoteId).
            //
            // One Shipment per vendor group (vendorItems[]), not per item.
            // A multi-vendor order creates N Shipments where N = number of vendors.
            // ─────────────────────────────────────────────────────────────────────
            if (!idempotentReplay) {
                const shipmentDocs = vendorItems.map((vGroup) => {
                    const quote = validatedQuotes[String(vGroup.vendorId)];
                    return {
                        orderId:                order._id,
                        vendorId:               vGroup.vendorId,
                        vendorName:             vGroup.vendorName,
                        providerId:             quote ? quote.providerId : 'own_fleet',
                        // No quote provided → system automatically defaults to own_fleet. 'AUTO' is correct.
                        selectedBy:             'AUTO',
                        providerLocked:         !!quote,
                        customerShippingCharge: Number(vGroup.shipping) || 0,
                        estimatedDeliveryCost:  quote ? quote.estimatedCost : 0,
                        status:                 'pending',
                        statusHistory: [{
                            status:    'pending',
                            updatedAt: new Date(),
                            updatedBy: 'system',
                            notes:     quote ? `Shipment created with provider ${quote.providerId} via quote ${quote.quoteId}` : 'Shipment created at order placement (legacy fallback)',
                        }],
                        // Package — estimated from order items for this vendor
                        packageWeight: vGroup.items.reduce(
                            (sum, item) => sum + (500 * (item.quantity || 1)), 0
                        ) || 500,
                        escrowStatus: 'held',
                        deliveryAssignmentStatus: 'pending',
                        rejectedDeliveryBoys: [],
                    };
                });

                // Phase 5.1: Create Shipments one-by-one using .save({ session }).
                //
                // WHY NOT Shipment.create([...], { session })?
                // → Mongoose/MongoDB requires `ordered: true` for bulk inserts in a session,
                //   but more critically, we NEED the pre-save hook to run for each doc
                //   (the hook generates the unique shipmentNumber). Using insertMany() would
                //   bypass the pre-save hooks entirely.
                //
                // WHY NOT insertMany()?
                // → insertMany() skips Mongoose middleware (pre/post-save hooks).
                //   shipmentNumber would not be generated, leaving a required-unique field empty.
                //
                // Using new Shipment(doc).save({ session }) per document is the correct
                // pattern for transactional inserts that need middleware execution.
                createdShipments = [];
                for (const doc of shipmentDocs) {
                    const shipment = new Shipment(doc);
                    await shipment.save({ session });
                    createdShipments.push(shipment);
                }

                console.log(
                    `[placeOrder] ${createdShipments.length} Shipment(s) created for Order ${order.orderId}:`,
                    createdShipments.map(s => s.shipmentNumber).join(', ')
                );
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

    // ─── Post-commit: Async side effects ──────────────────────────────────────
    // IMPORTANT: Events and notifications are emitted ONLY after the transaction
    // has committed successfully. If the transaction rolled back, createdShipments
    // is empty and no events are emitted.
    if (!idempotentReplay && order?.orderId) {
        // Phase 5.1: Emit SHIPMENT_CREATED for each shipment (non-blocking).
        // Each event fires independently — one listener failure does not affect others.
        // Events are emitted after commit, so a transaction rollback produces zero events.
        for (const shipment of createdShipments) {
            logisticsEventBus.emitEvent(LOGISTICS_EVENTS.SHIPMENT_CREATED, {
                shipmentId:  String(shipment._id),
                shipmentNumber: shipment.shipmentNumber,
                orderId:     String(order._id),
                orderNumber: order.orderId,
                vendorId:    String(shipment.vendorId),
                providerId:  shipment.providerId,
                selectedBy:  shipment.selectedBy,
            });
        }

        const emailAddress = order?.shippingAddress?.email || (req.user?.email);
        if (emailAddress) {
            sendOrderConfirmationEmail(order, emailAddress).catch((err) =>
                console.error(`[Order Email] Failed to send for ${order.orderId}:`, err.message)
            );
        }

        if (userId) {
            const itemsText = buildOrderItemsSummary(order.items);
            createNotification({
                recipientId: userId,
                recipientType: 'user',
                title: 'Order Placed!',
                message: `Your order ${order.orderId} has been placed successfully.${itemsText}`,
                type: 'order',
                data: { link: `/orders/${order.orderId}` },
            }).catch((err) => console.error('[Order Notification] Failed to create:', err.message));
        }

        // Notify vendors and create database notifications
        (order.vendorItems || []).forEach((vGroup) => {
            const vItemsText = buildVendorItemsSummary(vGroup.items);
            createNotification({
                recipientId: vGroup.vendorId,
                recipientType: 'vendor',
                title: 'New Order Received!',
                message: `You have received a new order ${order.orderId} totalling ₹${vGroup.subtotal}.${vItemsText}`,
                type: 'order',
                data: {
                    orderId: String(order.orderId),
                    orderMongoId: String(order._id),
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
    // A-8: Parse as integers to prevent skip(NaN). Clamp limit to prevent full collection dumps.
    const numPage  = Math.max(1, parseInt(req.query.page,  10) || 1);
    const numLimit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip = (numPage - 1) * numLimit;
    const orders = await Order.find({ userId: req.user.id })
        .populate('shipments')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(numLimit);
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

    // Attach returnRequests and dynamically compute overall status from Shipments
    const ordersWithReturns = orders.map(order => {
        const orderObj = order.toObject({ virtuals: true });
        orderObj.returnRequests = returnMap[String(order._id)] || [];
        
        if (orderObj.shipments && orderObj.shipments.length > 0) {
            const allDelivered = orderObj.shipments.every(s => s.status === 'delivered');
            const anyShipped = orderObj.shipments.some(s => ['shipped', 'out_for_delivery'].includes(s.status));
            const anyReady = orderObj.shipments.some(s => s.status === 'ready_for_pickup');
            
            if (allDelivered) {
                orderObj.status = 'delivered';
                orderObj.deliveredAt = orderObj.shipments.find(s => s.deliveredAt)?.deliveredAt || new Date();
            } else if (anyShipped) {
                orderObj.status = 'shipped';
            } else if (anyReady) {
                orderObj.status = 'ready_for_pickup';
            }
        }
        
        return orderObj;
    });

    res.status(200).json(new ApiResponse(200, { orders: ordersWithReturns, total, page: numPage, pages: Math.ceil(total / numLimit) }, 'Orders fetched.'));

});

// GET /api/user/orders/:id
export const getOrderDetail = asyncHandler(async (req, res) => {
    const isMongoId = mongoose.Types.ObjectId.isValid(req.params.id);
    const query = isMongoId
        ? { _id: req.params.id, userId: req.user.id }
        : { orderId: req.params.id, userId: req.user.id };

    const order = await Order.findOne(query)
        .populate({ path: 'shipments', select: '+deliveryOtpDebug' })
        .select('+deliveryOtpDebug');
    if (!order) throw new ApiError(404, 'Order not found.');

    const returnRequests = await ReturnRequest.find({ orderId: order._id }).populate('vendorId', 'storeName email');
    const orderObject = order.toObject({ virtuals: true });
    orderObject.returnRequests = returnRequests || [];

    if (orderObject.shipments && orderObject.shipments.length > 0) {
        const allDelivered = orderObject.shipments.every(s => s.status === 'delivered');
        const anyShipped = orderObject.shipments.some(s => ['shipped', 'out_for_delivery'].includes(s.status));
        const anyReady = orderObject.shipments.some(s => s.status === 'ready_for_pickup');
        
        if (allDelivered) {
            orderObject.status = 'delivered';
            orderObject.deliveredAt = orderObject.shipments.find(s => s.deliveredAt)?.deliveredAt || new Date();
        } else if (anyShipped) {
            orderObject.status = 'shipped';
            const shipmentWithOtp = orderObject.shipments.find(s => s.deliveryOtpDebug);
            if (shipmentWithOtp) {
                orderObject.deliveryOtpDebug = shipmentWithOtp.deliveryOtpDebug;
            }
        } else if (anyReady) {
            orderObject.status = 'ready_for_pickup';
        }
    }

    res.status(200).json(new ApiResponse(200, orderObject, 'Order detail fetched.'));
});

// PATCH /api/user/orders/:id/cancel
export const cancelOrder = asyncHandler(async (req, res) => {
    const isMongoId = mongoose.Types.ObjectId.isValid(req.params.id);
    const query = isMongoId
        ? { _id: req.params.id, userId: req.user.id }
        : { orderId: req.params.id, userId: req.user.id };

    const order = await Order.findOne(query);
    if (!order) throw new ApiError(404, 'Order not found.');
    if (!['pending', 'processing', 'payment_pending'].includes(order.status)) {
        throw new ApiError(400, 'Order cannot be cancelled at this stage.');
    }

    const result = await processCancellationRefund({
        orderId: order._id,
        cancelledBy: 'customer',
        reason: req.body.reason || 'Cancelled by customer',
    });

    // Expire all pending/created PaymentAttempts so no zombie payment can succeed
    await PaymentAttempt.updateMany(
        { orderId: order._id, status: { $in: ['created', 'processing'] } },
        { $set: { status: 'failed', notes: 'Order cancelled by customer' } }
    );

    notifyOrderUpdate(result.order || order);
    res.status(200).json(
        new ApiResponse(
            200,
            result.order || order,
            `Order cancelled successfully.${result.refundAmount > 0 ? ` ₹${result.refundAmount} refunded to your wallet.` : ''}`
        )
    );
});

// PATCH /api/user/orders/:id/items/:vendorItemId/cancel
export const cancelVendorItem = asyncHandler(async (req, res) => {
    const { id: orderIdParam, vendorItemId } = req.params;
    const { reason, comment } = req.body;

    if (!reason) {
        throw new ApiError(400, 'Cancellation reason is required.');
    }

    const isMongoId = mongoose.Types.ObjectId.isValid(orderIdParam);
    const query = isMongoId
        ? { _id: orderIdParam, userId: req.user.id }
        : { orderId: orderIdParam, userId: req.user.id };

    const order = await Order.findOne(query);
    if (!order) throw new ApiError(404, 'Order not found.');

    const targetVendorGroup = (order.vendorItems || []).find(
        (vGroup) => String(vGroup._id) === String(vendorItemId) || String(vGroup.vendorId) === String(vendorItemId)
    );

    if (!targetVendorGroup) {
        throw new ApiError(404, 'Package / Vendor items not found in this order.');
    }

    // 1. Conflict Validation: Check active return/exchange requests
    const activeReturn = await ReturnRequest.findOne({
        orderId: order._id,
        vendorId: targetVendorGroup.vendorId,
        status: { $nin: ['rejected'] },
    });

    if (activeReturn) {
        throw new ApiError(400, 'Cannot cancel package. An active return or exchange request already exists for this vendor.');
    }

    // 2. Validate package status is cancellable
    if (targetVendorGroup.status === 'cancelled') {
        throw new ApiError(400, 'This package is already cancelled.');
    }

    const nonCancellableStatuses = ['packed', 'pickup_assigned', 'shipped', 'delivered', 'returned'];
    if (nonCancellableStatuses.includes(targetVendorGroup.status)) {
        throw new ApiError(400, `Package cannot be cancelled at status: ${targetVendorGroup.status}.`);
    }

    const result = await processCancellationRefund({
        orderId: order._id,
        vendorGroupId: targetVendorGroup.vendorId,
        cancelledBy: 'customer',
        reason,
        comment: comment || '',
    });

    notifyOrderUpdate(result.order || order);
    res.status(200).json(
        new ApiResponse(
            200,
            {
                orderId: (result.order || order).orderId,
                status: (result.order || order).status,
                vendorItems: (result.order || order).vendorItems,
                refundAmount: result.refundAmount || 0,
            },
            `Package cancelled successfully.${result.refundAmount > 0 ? ` ₹${result.refundAmount} refunded to your wallet.` : ''}`
        )
    );
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
    const isMongoId = mongoose.Types.ObjectId.isValid(req.params.id);
    const query = isMongoId
        ? { _id: req.params.id, userId: req.user.id }
        : { orderId: req.params.id, userId: req.user.id };

    const order = await Order.findOne(query);
    if (!order) throw new ApiError(404, 'Order not found.');

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

    // Verify Shipment / Delivery status
    const shipments = await Shipment.find({ orderId: order._id, vendorId });
    if (shipments.length > 1) {
        throw new ApiError(400, 'Multiple shipments found for this vendor. Please contact support.');
    }
    
    if (shipments.length === 1) {
        if (shipments[0].status !== 'delivered') {
            throw new ApiError(400, 'Return can only be requested for delivered orders.');
        }
    } else {
        // Fallback for legacy orders that do not have shipments
        if (order.status !== 'delivered') {
            throw new ApiError(400, 'Return can only be requested for delivered orders.');
        }
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
        let requestedVariantObj = {};

        if (req.body.exchangeDetails) {
            let details = req.body.exchangeDetails;
            if (typeof details === 'string') {
                try { details = JSON.parse(details); } catch (e) {}
            }
            requestedVariantObj = details.requestedVariant || details || {};
        } else if (req.body.exchangeVariantJson) {
            try { requestedVariantObj = JSON.parse(req.body.exchangeVariantJson); } catch (e) {}
        }

        size = String(requestedVariantObj.size || req.body.exchangeSize || '').trim();
        color = String(requestedVariantObj.color || req.body.exchangeColor || '').trim();

        const hasVariantSelection = Boolean(size || color || (typeof requestedVariantObj === 'object' && Object.keys(requestedVariantObj).length > 0));
        if (!hasVariantSelection) {
            throw new ApiError(400, 'Requested size or color variant selection is required for exchange.');
        }

        // Validate requested variants exist and have stock
        for (const item of normalizedItems) {
            const product = await Product.findById(item.productId);
            if (!product) throw new ApiError(404, `Product not found: ${item.productId}`);

            const mockOrderItem = {
                productId: item.productId,
                variant: { ...requestedVariantObj, size, color }
            };
            const variantKey = resolveOrderItemVariantKey(product, mockOrderItem);
            if (!variantKey) {
                throw new ApiError(400, `The variant Size: ${size || 'N/A'}, Color: ${color || 'N/A'} is not available for product ${product.name}.`);
            }

            // Prevent exchanging for the exact same variant
            const orderItemMatch = order.items.find(it => String(it.productId) === String(product._id));
            if (orderItemMatch) {
                const purchasedSize = String(orderItemMatch.variant?.size || '').trim().toLowerCase();
                const purchasedColor = String(orderItemMatch.variant?.color || '').trim().toLowerCase();
                if (size && color && purchasedSize === size.toLowerCase() && purchasedColor === color.toLowerCase()) {
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
                throw new ApiError(400, `The requested variant (Size: ${size || 'N/A'}, Color: ${color || 'N/A'}) is currently out of stock for product ${product.name}.`);
            }

            exchangeDetails = {
                requestedVariant: { ...requestedVariantObj, size, color, variantKey }
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

    const requestTypeLabel = requestType === 'exchange' ? 'exchange' : 'return';
    const itemsText = buildExchangeSummary(request);

    const admins = await Admin.find({ isActive: true }).select('_id').lean();
    await Promise.all(
        admins.map((admin) =>
            createNotification({
                recipientId: admin._id,
                recipientType: 'admin',
                title: requestType === 'exchange' ? 'New Exchange Request' : 'New Return Request',
                message: `Order ${order.orderId} has a new ${requestTypeLabel} request awaiting review.${itemsText}`,
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
        title: requestType === 'exchange' ? 'New Exchange Request' : 'New Return Request',
        message: `Order ${order.orderId} has a ${requestTypeLabel} request from customer.${itemsText}`,
        type: 'order',
        data: {
            returnRequestId: String(request._id),
            orderId: String(order.orderId),
            vendorId: String(vendorId),
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
