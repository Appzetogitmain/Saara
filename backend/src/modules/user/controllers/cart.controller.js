import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Cart from '../../../models/Cart.model.js';
import Product from '../../../models/Product.model.js';

const normalizeVariantPart = (v) => String(v || '').trim().toLowerCase();

const areVariantsEqual = (v1, v2) => {
    if (!v1 && !v2) return true;
    if (!v1 || !v2) return false;

    // Check primary axes first
    if (normalizeVariantPart(v1.size) !== normalizeVariantPart(v2.size)) return false;
    if (normalizeVariantPart(v1.color) !== normalizeVariantPart(v2.color)) return false;
    if (normalizeVariantPart(v1.material) !== normalizeVariantPart(v2.material)) return false;
    
    // Normalize dynamic selection to plain objects for comparison
    const getSelectionObj = (v) => {
        if (!v?.selection) return {};
        if (v.selection instanceof Map) return Object.fromEntries(v.selection);
        if (typeof v.selection.toObject === 'function') return v.selection.toObject();
        return v.selection;
    };

    const s1 = getSelectionObj(v1);
    const s2 = getSelectionObj(v2);
    
    const keys1 = Object.keys(s1).filter(k => s1[k]);
    const keys2 = Object.keys(s2).filter(k => s2[k]);

    if (keys1.length !== keys2.length) return false;
    
    return keys1.every(k => {
        const val1 = normalizeVariantPart(s1[k]);
        const val2 = normalizeVariantPart(s2[k]);
        return val1 === val2;
    });
};

// GET /api/user/cart
export const getCart = asyncHandler(async (req, res) => {
    let cart = await Cart.findOne({ userId: req.user.id }).populate({
        path: 'items.productId',
        select: 'name image price stock stockQuantity variants isActive taxRate taxIncluded'
    });

    if (!cart) {
        cart = await Cart.create({ userId: req.user.id, items: [] });
    }

    res.status(200).json(new ApiResponse(200, cart, 'Cart fetched.'));
});

// POST /api/user/cart/add
export const addToCart = asyncHandler(async (req, res) => {
    const { productId, variant, quantity = 1 } = req.body;

    const product = await Product.findById(productId);
    if (!product || !product.isActive) throw new ApiError(404, 'Product not found.');

    // Stock validation
    const requestedQuantity = Number(quantity);
    if (product.stock === 'out_of_stock' || product.stockQuantity <= 0) {
        throw new ApiError(400, 'Product is out of stock.');
    }

    let cart = await Cart.findOne({ userId: req.user.id });
    if (!cart) cart = new Cart({ userId: req.user.id, items: [] });

    const existingItemIndex = cart.items.findIndex(item => 
        String(item.productId) === String(productId) && areVariantsEqual(item.variant, variant)
    );

    const currentQtyInCart = existingItemIndex > -1 ? cart.items[existingItemIndex].quantity : 0;
    const totalQtyRequested = currentQtyInCart + requestedQuantity;

    if (totalQtyRequested > product.stockQuantity) {
        throw new ApiError(400, `Only ${product.stockQuantity} items available in stock.`);
    }

    if (existingItemIndex > -1) {
        cart.items[existingItemIndex].quantity = totalQtyRequested;
    } else {
        cart.items.push({
            productId,
            variant,
            quantity: Number(quantity),
            priceAtAddition: product.price
        });
    }

    await cart.save();
    
    // Return populated cart
    const populatedCart = await Cart.findById(cart._id).populate({
        path: 'items.productId',
        select: 'name image price stock stockQuantity variants isActive taxRate taxIncluded'
    });

    res.status(200).json(new ApiResponse(200, populatedCart, 'Item added to cart.'));
});

// PUT /api/user/cart/update
export const updateCartItem = asyncHandler(async (req, res) => {
    const { itemId, quantity } = req.body;

    const cart = await Cart.findOne({ userId: req.user.id });
    if (!cart) throw new ApiError(404, 'Cart not found.');

    const item = cart.items.id(itemId);
    if (!item) throw new ApiError(404, 'Item not found in cart.');

    if (quantity > 0) {
        const product = await Product.findById(item.productId);
        if (product && quantity > product.stockQuantity) {
            throw new ApiError(400, `Only ${product.stockQuantity} items available in stock.`);
        }
        item.quantity = Number(quantity);
    } else {
        cart.items.pull(itemId);
    }

    await cart.save();
    
    const populatedCart = await Cart.findById(cart._id).populate({
        path: 'items.productId',
        select: 'name image price stock stockQuantity variants isActive taxRate taxIncluded'
    });

    res.status(200).json(new ApiResponse(200, populatedCart, 'Cart updated.'));
});

// DELETE /api/user/cart/item/:itemId
export const removeFromCart = asyncHandler(async (req, res) => {
    const cart = await Cart.findOne({ userId: req.user.id });
    if (!cart) throw new ApiError(404, 'Cart not found.');

    cart.items.pull(req.params.itemId);
    await cart.save();

    const populatedCart = await Cart.findById(cart._id).populate({
        path: 'items.productId',
        select: 'name image price stock stockQuantity variants isActive taxRate taxIncluded'
    });

    res.status(200).json(new ApiResponse(200, populatedCart, 'Item removed.'));
});

// DELETE /api/user/cart/clear
export const clearCart = asyncHandler(async (req, res) => {
    const cart = await Cart.findOne({ userId: req.user.id });
    if (cart) {
        cart.items = [];
        await cart.save();
    }
    res.status(200).json(new ApiResponse(200, null, 'Cart cleared.'));
});

// Internal helper for merging (called during login)
export const mergeCartLogic = async (userId, guestItems = []) => {
    if (!Array.isArray(guestItems) || guestItems.length === 0) return;

    let cart = await Cart.findOne({ userId });
    if (!cart) cart = new Cart({ userId, items: [] });

    for (const guestItem of guestItems) {
        const existingItemIndex = cart.items.findIndex(item => 
            String(item.productId) === String(guestItem.productId) && areVariantsEqual(item.variant, guestItem.variant)
        );

        if (existingItemIndex > -1) {
            cart.items[existingItemIndex].quantity += Number(guestItem.quantity);
        } else {
            cart.items.push(guestItem);
        }
    }

    await cart.save();
};

// POST /api/user/cart/merge
export const mergeCart = asyncHandler(async (req, res) => {
    const { items } = req.body;
    await mergeCartLogic(req.user.id, items);
    
    const cart = await Cart.findOne({ userId: req.user.id }).populate({
        path: 'items.productId',
        select: 'name image price stock stockQuantity variants isActive taxRate taxIncluded'
    });

    res.status(200).json(new ApiResponse(200, cart, 'Cart merged.'));
});
