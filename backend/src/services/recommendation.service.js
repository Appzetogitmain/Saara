import Product from '../models/Product.model.js';

export class RecommendationService {
    static async getProducts({ source, categories = [], brands = [], averagePrice, excludeProductIds = [], limit = 12 }) {
        const excludeList = excludeProductIds.map(id => String(id));

        const baseQuery = {
            isActive: true,
            _id: { $nin: excludeList }
        };

        let matchingProducts = [];

        // 1. Same Category
        if (categories.length > 0) {
            const catMatches = await Product.find({
                ...baseQuery,
                categoryId: { $in: categories }
            })
            .limit(limit)
            .lean();
            matchingProducts = [...catMatches];
        }

        // 2. Same Brand
        if (matchingProducts.length < limit && brands.length > 0) {
            const currentIds = matchingProducts.map(p => String(p._id));
            const remainingLimit = limit - matchingProducts.length;
            const brandMatches = await Product.find({
                ...baseQuery,
                _id: { $nin: [...excludeList, ...currentIds] },
                brandId: { $in: brands }
            })
            .limit(remainingLimit)
            .lean();
            matchingProducts = [...matchingProducts, ...brandMatches];
        }

        // 3. Similar Price Range (+/- 20% of averagePrice)
        if (matchingProducts.length < limit && averagePrice > 0) {
            const currentIds = matchingProducts.map(p => String(p._id));
            const remainingLimit = limit - matchingProducts.length;
            const minPrice = averagePrice * 0.8;
            const maxPrice = averagePrice * 1.2;
            const priceMatches = await Product.find({
                ...baseQuery,
                _id: { $nin: [...excludeList, ...currentIds] },
                price: { $gte: minPrice, $lte: maxPrice }
            })
            .limit(remainingLimit)
            .lean();
            matchingProducts = [...matchingProducts, ...priceMatches];
        }

        // 4. Fallback (Trending/Best Sellers/Newest)
        if (matchingProducts.length < limit) {
            const currentIds = matchingProducts.map(p => String(p._id));
            const remainingLimit = limit - matchingProducts.length;
            const fallbacks = await Product.find({
                ...baseQuery,
                _id: { $nin: [...excludeList, ...currentIds] }
            })
            .sort({ rating: -1, reviewCount: -1, createdAt: -1 })
            .limit(remainingLimit)
            .lean();
            matchingProducts = [...matchingProducts, ...fallbacks];
        }

        // Standardize IDs for frontend mapping
        return matchingProducts.slice(0, limit).map(p => ({
            ...p,
            id: String(p._id)
        }));
    }
}

export default RecommendationService;
