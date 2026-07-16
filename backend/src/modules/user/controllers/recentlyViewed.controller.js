import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import RecentlyViewed from '../../../models/RecentlyViewed.model.js';
import Product from '../../../models/Product.model.js';
import mongoose from 'mongoose';

// GET /api/user/recently-viewed
export const getRecentlyViewed = asyncHandler(async (req, res) => {
    const list = await RecentlyViewed.find({ userId: req.user.id })
        .sort({ viewedAt: -1 })
        .populate({
            path: 'productId',
            select: '-faqs -relatedProducts -__v',
            populate: [
                { path: 'categoryId', select: 'name' },
                { path: 'brandId', select: 'name' },
                { path: 'vendorId', select: 'storeName' }
            ]
        })
        .lean();

    // Map and filter out invalid/inactive/out-of-stock products if any
    const products = list
        .map((item) => {
            if (!item?.productId) return null;
            const p = item.productId;
            return {
                ...p,
                id: String(p._id),
                _id: String(p._id),
            };
        })
        .filter((p) => p && p.isActive !== false);

    res.status(200).json(new ApiResponse(200, products, 'Recently viewed history fetched.'));
});

// POST /api/user/recently-viewed
export const recordRecentlyViewed = asyncHandler(async (req, res) => {
    const { productId } = req.body;
    const normalizedProductId = String(productId || '').trim();

    if (!mongoose.Types.ObjectId.isValid(normalizedProductId)) {
        throw new ApiError(400, 'Invalid product id.');
    }

    const product = await Product.findOne({ _id: normalizedProductId, isActive: true }).select('_id');
    if (!product) {
        throw new ApiError(404, 'Product not found.');
    }

    const userId = req.user.id;

    // Upsert the record (update viewedAt if duplicate user-product combination exists)
    await RecentlyViewed.findOneAndUpdate(
        { userId, productId: normalizedProductId },
        { viewedAt: new Date() },
        { upsert: true, new: true }
    );

    // Limit history to 30 items
    const history = await RecentlyViewed.find({ userId })
        .sort({ viewedAt: -1 })
        .select('_id')
        .lean();

    if (history.length > 30) {
        const toKeepIds = history.slice(0, 30).map((doc) => doc._id);
        await RecentlyViewed.deleteMany({ userId, _id: { $nin: toKeepIds } });
    }

    res.status(200).json(new ApiResponse(200, null, 'Recently viewed logged successfully.'));
});
