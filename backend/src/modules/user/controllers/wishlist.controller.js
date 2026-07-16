import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Wishlist from '../../../models/Wishlist.model.js';
import Product from '../../../models/Product.model.js';
import Cart from '../../../models/Cart.model.js';
import WishlistService from '../../../services/wishlist.service.js';
import mongoose from 'mongoose';

const normalizeVariantPart = (v) => String(v || '').trim().toLowerCase();

const areVariantsEqual = (v1, v2) => {
    if (!v1 && !v2) return true;
    if (!v1 || !v2) return false;
    if (normalizeVariantPart(v1.size) !== normalizeVariantPart(v2.size)) return false;
    if (normalizeVariantPart(v1.color) !== normalizeVariantPart(v2.color)) return false;
    return true;
};

// GET /api/user/wishlist
export const getWishlist = asyncHandler(async (req, res) => {
    const payload = await WishlistService.getUserWishlist(req.user.id, req.query);
    res.status(200).json(new ApiResponse(200, payload, 'Wishlist fetched.'));
});

// POST /api/user/wishlist
export const addToWishlist = asyncHandler(async (req, res) => {
    const { productId, variantId, notes, priority } = req.body;
    const normalizedProductId = String(productId || '').trim();
    if (!mongoose.Types.ObjectId.isValid(normalizedProductId)) {
        throw new ApiError(400, 'Invalid product id.');
    }

    const product = await Product.findOne({ _id: normalizedProductId, isActive: true }).select('price');
    if (!product) {
        throw new ApiError(404, 'Product not found.');
    }

    let wishlist = await Wishlist.findOne({ userId: req.user.id });
    if (!wishlist) {
        wishlist = await Wishlist.create({
            userId: req.user.id,
            items: [{
                productId: normalizedProductId,
                variantId: variantId || '',
                priceAtWishlist: product.price,
                notes: notes || '',
                priority: priority || 0
            }]
        });
    } else {
        const exists = wishlist.items.some(
            (i) => i.productId.toString() === normalizedProductId && (i.variantId || '') === (variantId || '')
        );
        if (exists) throw new ApiError(409, 'Product already in wishlist.');
        
        wishlist.items.push({
            productId: normalizedProductId,
            variantId: variantId || '',
            priceAtWishlist: product.price,
            notes: notes || '',
            priority: priority || 0
        });
        await wishlist.save();
    }

    const payload = await WishlistService.getUserWishlist(req.user.id, {});
    res.status(201).json(new ApiResponse(201, payload, 'Added to wishlist.'));
});

// DELETE /api/user/wishlist/:productId
export const removeFromWishlist = asyncHandler(async (req, res) => {
    const normalizedProductId = String(req.params.productId || '').trim();
    const variantId = req.query.variantId || '';
    if (!mongoose.Types.ObjectId.isValid(normalizedProductId)) {
        throw new ApiError(400, 'Invalid product id.');
    }

    const wishlist = await Wishlist.findOne({ userId: req.user.id });
    if (wishlist) {
        wishlist.items = wishlist.items.filter(
            (i) => !(i.productId.toString() === normalizedProductId && (i.variantId || '') === (variantId || ''))
        );
        await wishlist.save();
    }

    const payload = await WishlistService.getUserWishlist(req.user.id, {});
    res.status(200).json(new ApiResponse(200, payload, 'Removed from wishlist.'));
});

// POST /api/user/wishlist/move-selected
export const moveSelectedToCart = asyncHandler(async (req, res) => {
    const { items } = req.body; // array of { productId, variantId }
    if (!Array.isArray(items) || items.length === 0) {
        throw new ApiError(400, 'Items list is required.');
    }

    let cart = await Cart.findOne({ userId: req.user.id });
    if (!cart) cart = new Cart({ userId: req.user.id, items: [] });

    let wishlist = await Wishlist.findOne({ userId: req.user.id });
    if (!wishlist) {
        throw new ApiError(404, 'Wishlist not found.');
    }

    const addedItems = [];
    const outOfStockItems = [];
    const failedItems = [];

    for (const target of items) {
        const prodId = String(target.productId || '');
        const varId = String(target.variantId || '');

        const product = await Product.findById(prodId);
        if (!product || !product.isActive) {
            failedItems.push(prodId);
            continue;
        }

        if (product.stock === 'out_of_stock' || (product.stockQuantity !== undefined && product.stockQuantity <= 0)) {
            outOfStockItems.push(prodId);
            continue;
        }

        let parsedVariant = null;
        if (varId) {
            const parts = varId.split('-');
            if (parts.length === 2) {
                parsedVariant = { size: parts[0], color: parts[1] };
            } else {
                parsedVariant = { size: varId };
            }
        }

        const existingItemIndex = cart.items.findIndex(item => 
            String(item.productId) === prodId && areVariantsEqual(item.variant, parsedVariant)
        );

        const currentQtyInCart = existingItemIndex > -1 ? cart.items[existingItemIndex].quantity : 0;
        if (currentQtyInCart + 1 > product.stockQuantity) {
            outOfStockItems.push(prodId);
            continue;
        }

        if (existingItemIndex > -1) {
            cart.items[existingItemIndex].quantity += 1;
        } else {
            cart.items.push({
                productId: prodId,
                variant: parsedVariant,
                quantity: 1,
                priceAtAddition: product.price
            });
        }

        wishlist.items = wishlist.items.filter(
            (i) => !(i.productId.toString() === prodId && (i.variantId || '') === varId)
        );

        addedItems.push(prodId);
    }

    await Promise.all([
        cart.save(),
        wishlist.save()
    ]);

    const refreshedWishlist = await WishlistService.getUserWishlist(req.user.id, {});
    res.status(200).json(new ApiResponse(200, {
        wishlist: refreshedWishlist,
        addedItems,
        outOfStockItems,
        failedItems
    }, 'Selected wishlist items moved to cart.'));
});

// POST /api/user/wishlist/remove-selected
export const removeSelectedFromWishlist = asyncHandler(async (req, res) => {
    const { items } = req.body; // array of { productId, variantId }
    if (!Array.isArray(items) || items.length === 0) {
        throw new ApiError(400, 'Items list is required.');
    }

    const wishlist = await Wishlist.findOne({ userId: req.user.id });
    if (wishlist) {
        wishlist.items = wishlist.items.filter(item => {
            const matchesTarget = items.some(target => 
                String(target.productId) === item.productId.toString() &&
                String(target.variantId || '') === (item.variantId || '')
            );
            return !matchesTarget;
        });
        await wishlist.save();
    }

    const refreshedWishlist = await WishlistService.getUserWishlist(req.user.id, {});
    res.status(200).json(new ApiResponse(200, refreshedWishlist, 'Selected items removed.'));
});
