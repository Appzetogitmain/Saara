import Product from '../models/Product.model.js';
import ApiError from '../utils/ApiError.js';
import crypto from 'crypto';

// ─── Variant Key Resolution Helpers ───────────────────────────────────────────

export const normalizeVariantPart = (value) => String(value || '').trim().toLowerCase();

export const normalizeAxisName = (value) =>
    String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');

export const toVariantStockEntries = (stockMap) => {
    if (!stockMap) return [];
    if (typeof stockMap.entries === 'function') return [...stockMap.entries()];
    return Object.entries(stockMap);
};

export const toVariantPriceEntries = (prices) => {
    if (!prices) return [];
    if (typeof prices.entries === 'function') return [...prices.entries()];
    return Object.entries(prices);
};

export const createDynamicVariantKey = (selection = {}) => {
    const keys = Object.keys(selection).sort();
    if (!keys.length) return null;
    return keys.map((k) => `${k}:${selection[k]}`).join('|');
};

export const resolveOrderItemVariantKey = (product, orderItem) => {
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

export const getVariantKeyFromVariant = (variant) => {
    if (!variant) return '';
    const size = variant.size ? String(variant.size).trim().toLowerCase() : '';
    const color = variant.color ? String(variant.color).trim().toLowerCase() : '';
    if (size && color) return `${size}|${color}`;
    return size || color || '';
};

export const getOrderItemIdentifier = (item) => {
    if (item.orderItemId) return String(item.orderItemId);
    if (item._id) return String(item._id);
    const variantKey = item.variantKey || (item.variant ? getVariantKeyFromVariant(item.variant) : '');
    if (variantKey) return `${String(item.productId)}_${variantKey}`;
    return String(item.productId);
};

export const findMatchingOrderItem = (retItem, orderItems, matchedTrack = new Set()) => {
    const candidates = orderItems.filter(item => String(item.productId) === String(retItem.productId));
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];

    // 1. Prefer orderItemId
    if (retItem.orderItemId) {
        const match = candidates.find(item => String(item._id) === String(retItem.orderItemId) || String(item.orderItemId) === String(retItem.orderItemId));
        if (match) return match;
    }

    // 2. Fallback: productId + variantKey
    const retVariantKey = retItem.variantKey || (retItem.variant ? getVariantKeyFromVariant(retItem.variant) : '');
    if (retVariantKey) {
        const match = candidates.find(item => {
            const itemVariantKey = item.variantKey || (item.variant ? getVariantKeyFromVariant(item.variant) : '');
            return itemVariantKey === retVariantKey;
        });
        if (match) return match;
    }

    // 3. Last fallback: Try to match any candidate not fully matched in matchedTrack
    for (const candidate of candidates) {
        const key = String(candidate._id);
        if (!matchedTrack.has(key)) {
            return candidate;
        }
    }
    return candidates[0];
};

// ─── OTP & Stock Actions ──────────────────────────────────────────────────────

/**
 * Generates and hashes a 6-digit Return Pickup OTP
 * @param {Object} request - ReturnRequest Mongoose document
 */
export const generateReturnPickupOtp = (request) => {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const hash = crypto.createHash('sha256').update(otp).digest('hex');
    request.returnPickupOtpHash = hash;
    request.returnPickupOtpExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins
    request.returnPickupOtpAttempts = 0;
    request.returnPickupOtpVerified = false;
    request.returnPickupOtpDebug = otp;
};

/**
 * Reserves replacement stock for an approved exchange
 * @param {Object} request - ReturnRequest document
 * @param {Object} session - Mongoose Transaction Session
 */
export const reserveReplacementStock = async (request, session) => {
    const size = request.exchangeDetails?.requestedVariant?.size;
    const color = request.exchangeDetails?.requestedVariant?.color;
    const variantKey = request.exchangeDetails?.requestedVariant?.variantKey;

    for (const item of request.items || []) {
        const product = await Product.findById(item.productId).session(session);
        if (!product) continue;

        if (variantKey) {
            const getStockFromMap = (stockMap, key) => {
                if (!stockMap) return 0;
                if (typeof stockMap.get === 'function') return Number(stockMap.get(key) || 0);
                return Number(stockMap[key] || 0);
            };
            const currentStock = getStockFromMap(product.variants?.stockMap, variantKey);
            if (currentStock < item.quantity) {
                throw new ApiError(400, `Cannot approve exchange. Replacement variant (Size: ${size}, Color: ${color}) is out of stock.`);
            }

            // Reserve/Decrement Stock immediately
            product.variants?.stockMap?.set(variantKey, currentStock - item.quantity);
            product.stockQuantity = Math.max(0, product.stockQuantity - item.quantity);

            if (product.stockQuantity <= 0) product.stock = 'out_of_stock';
            else if (product.stockQuantity <= product.lowStockThreshold) product.stock = 'low_stock';
            else product.stock = 'in_stock';

            await product.save({ session });
        }
    }
};

/**
 * Restores reserved replacement stock if an exchange is rejected after approval
 * @param {Object} request - ReturnRequest document
 * @param {Object} session - Mongoose Transaction Session
 */
export const restoreReservedStockOnRejection = async (request, session) => {
    const variantKey = request.exchangeDetails?.requestedVariant?.variantKey;
    for (const item of request.items || []) {
        const product = await Product.findById(item.productId).session(session);
        if (!product) continue;

        if (variantKey) {
            const getStockFromMap = (stockMap, key) => {
                if (!stockMap) return 0;
                if (typeof stockMap.get === 'function') return Number(stockMap.get(key) || 0);
                return Number(stockMap[key] || 0);
            };
            const currentStock = getStockFromMap(product.variants?.stockMap, variantKey);
            product.variants?.stockMap?.set(variantKey, currentStock + item.quantity);
            product.stockQuantity = product.stockQuantity + item.quantity;

            if (product.stockQuantity <= 0) product.stock = 'out_of_stock';
            else if (product.stockQuantity <= product.lowStockThreshold) product.stock = 'low_stock';
            else product.stock = 'in_stock';

            await product.save({ session });
        }
    }
};

/**
 * Restores returned (old) product/variant stock
 * @param {Object} request - ReturnRequest document
 * @param {Object} order - Order document
 * @param {Object} session - Mongoose Transaction Session
 */
export const restoreReturnedStock = async (request, order, session) => {
    const stockRestores = (request.items || []).map(async (item) => {
        const qty = Number(item?.quantity || 0);
        if (!item?.productId || qty <= 0) return;

        const product = await Product.findById(item.productId).session(session);
        if (!product) return;

        const orderItem = order.items.find(it => String(it.productId) === String(product._id));
        const oldVariantKey = resolveOrderItemVariantKey(product, orderItem);

        if (oldVariantKey) {
            const getStockFromMap = (stockMap, key) => {
                if (!stockMap) return 0;
                if (typeof stockMap.get === 'function') return Number(stockMap.get(key) || 0);
                return Number(stockMap[key] || 0);
            };
            const currentVarStock = getStockFromMap(product.variants?.stockMap, oldVariantKey);
            product.variants?.stockMap?.set(oldVariantKey, currentVarStock + qty);
        }

        product.stockQuantity += qty;
        if (product.stockQuantity <= 0) product.stock = 'out_of_stock';
        else if (product.stockQuantity <= product.lowStockThreshold) product.stock = 'low_stock';
        else product.stock = 'in_stock';

        await product.save({ session });
    });
    await Promise.all(stockRestores);
};
