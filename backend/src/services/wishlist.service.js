import Wishlist from '../models/Wishlist.model.js';
import RecentlyViewed from '../models/RecentlyViewed.model.js';
import RecommendationService from './recommendation.service.js';
import Product from '../models/Product.model.js';
import Brand from '../models/Brand.model.js';
import Vendor from '../models/Vendor.model.js';

export class WishlistService {
    static async getUserWishlist(userId, { page = 1, limit = 20 }) {
        let wishlist = await Wishlist.findOne({ userId })
            .populate({
                path: 'items.productId',
                populate: [
                    { path: 'brandId', select: 'name logo' },
                    { path: 'vendorId', select: 'storeName name' }
                ]
            });

        if (!wishlist) {
            wishlist = await Wishlist.create({ userId, items: [] });
        }

        // Filter out inactive products
        const activeItems = (wishlist.items || []).filter(item => 
            item.productId && item.productId.isActive !== false
        );

        // Calculations for summary stats
        let inStock = 0;
        let outOfStock = 0;

        activeItems.forEach(item => {
            const prod = item.productId;
            const isOutOfStock = prod.stock === 'out_of_stock' || (prod.stockQuantity !== undefined && prod.stockQuantity <= 0);
            if (isOutOfStock) {
                outOfStock++;
            } else {
                inStock++;
            }
        });

        const summary = {
            totalItems: activeItems.length,
            selectedItems: 0,
            inStock,
            outOfStock
        };

        // Static filters mapping
        const filters = [
            { key: 'all', label: 'All' },
            { key: 'instock', label: 'In Stock' },
            { key: 'sale', label: 'On Sale' },
            { key: 'pricedrop', label: 'Price Dropped' },
            { key: 'recent', label: 'Recently Added' }
        ];

        // Pagination
        const numericPage = Math.max(Number(page) || 1, 1);
        const numericLimit = Math.max(Number(limit) || 20, 1);
        const skip = (numericPage - 1) * numericLimit;

        const paginatedListItems = activeItems.slice(skip, skip + numericLimit);
        const hasNext = skip + numericLimit < activeItems.length;

        // Extract raw products for category/brand matching recommendations
        const activeProducts = activeItems.map(i => i.productId);
        const categories = [...new Set(activeProducts.map(p => String(p.categoryId)))];
        const brands = [...new Set(activeProducts.map(p => String(p.brandId)).filter(Boolean))];
        const averagePrice = activeProducts.length > 0
            ? activeProducts.reduce((acc, p) => acc + p.price, 0) / activeProducts.length
            : 0;

        // Fetch Recommendations
        const recommendations = await RecommendationService.getProducts({
            source: 'wishlist',
            categories,
            brands,
            averagePrice,
            excludeProductIds: activeProducts.map(p => String(p._id)),
            limit: 12
        });

        // Fetch Recently Viewed
        const recentViews = await RecentlyViewed.find({ userId })
            .sort({ viewedAt: -1 })
            .limit(12)
            .populate({
                path: 'productId',
                populate: [
                    { path: 'brandId', select: 'name logo' },
                    { path: 'vendorId', select: 'storeName name' }
                ]
            })
            .lean();

        const recentlyViewedProducts = recentViews
            .map(rv => rv.productId)
            .filter(p => p && p.isActive !== false)
            .map(p => ({
                ...p,
                id: String(p._id)
            }));

        // Analyze price drops
        const recentPriceDrops = activeItems
            .filter(item => {
                const prod = item.productId;
                return item.priceAtWishlist && prod.price < item.priceAtWishlist;
            })
            .map(item => {
                const prod = item.productId.toObject ? item.productId.toObject() : item.productId;
                return {
                    ...prod,
                    id: String(prod._id),
                    priceAtWishlist: item.priceAtWishlist
                };
            });

        // Normalize paginated items for return
        const normalizedItems = paginatedListItems.map(item => {
            const prod = item.productId.toObject ? item.productId.toObject() : item.productId;
            return {
                id: String(item._id),
                productId: String(prod._id),
                variantId: item.variantId || '',
                priceAtWishlist: item.priceAtWishlist || prod.price,
                addedAt: item.addedAt,
                notes: item.notes || '',
                priority: item.priority || 0,
                product: {
                    ...prod,
                    id: String(prod._id)
                }
            };
        });

        return {
            summary,
            filters,
            items: normalizedItems,
            sections: [
                {
                    type: 'recent_price_drops',
                    title: 'Price Dropped',
                    products: recentPriceDrops
                },
                {
                    type: 'recommended',
                    title: 'Recommended For You',
                    products: recommendations
                },
                {
                    type: 'recently_viewed',
                    title: 'Recently Viewed',
                    products: recentlyViewedProducts
                }
            ],
            pagination: {
                page: numericPage,
                limit: numericLimit,
                hasNext
            }
        };
    }
}

export default WishlistService;
