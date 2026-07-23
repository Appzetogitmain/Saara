import { Router } from 'express';
import asyncHandler from '../utils/asyncHandler.js';
import ApiResponse from '../utils/ApiResponse.js';
import ApiError from '../utils/ApiError.js';
import Product from '../models/Product.model.js';
import Category from '../models/Category.model.js';
import Brand from '../models/Brand.model.js';
import Vendor from '../models/Vendor.model.js';
import Coupon from '../models/Coupon.model.js';
import Banner from '../models/Banner.model.js';
import Campaign from '../models/Campaign.model.js';
import { calculateVendorShippingForGroups } from '../services/vendorShipping.service.js';
import { runEngine }                         from '../services/deliveryEngine.service.js';
import { cacheResponse } from '../middlewares/responseCache.js';
import Settings from '../models/Settings.model.js';
import PlatformPolicy from '../models/PlatformPolicy.model.js';
import { getHomepage } from '../modules/admin/controllers/homepage.controller.js';
import Order from '../models/Order.model.js';
import AppConfig from '../models/AppConfig.model.js';
import HomeBanner from '../models/HomeBanner.model.js';

const router = Router();

// GET /api/homepage (Public dynamic homepage data resolver)
router.get('/homepage', getHomepage);

// GET /api/search/trending
router.get('/search/trending', asyncHandler(async (req, res) => {
    const { default: SearchQuery } = await import('../models/SearchQuery.model.js');
    const trending = await SearchQuery.find()
        .sort({ count: -1 })
        .limit(10)
        .select('query count')
        .lean();
    res.status(200).json(new ApiResponse(200, trending.map(t => t.query), 'Trending searches.'));
}));

// GET /api/products/best-sellers
router.get('/products/best-sellers', asyncHandler(async (req, res) => {
    const bestSellersAgg = await Order.aggregate([
        { $match: { paymentStatus: 'paid', status: { $nin: ['cancelled', 'returned'] } } },
        { $unwind: '$items' },
        { $group: { _id: '$items.productId', totalQty: { $sum: '$items.quantity' } } },
        { $sort: { totalQty: -1 } },
        { $limit: 20 }
    ]);
    const bestSellerIds = bestSellersAgg.map((item) => item._id);
    let bestSellersRaw = await Product.find({
        _id: { $in: bestSellerIds },
        isActive: true,
        stock: { $ne: 'out_of_stock' }
    })
    .populate('categoryId', 'name')
    .populate('brandId', 'name')
    .populate('vendorId', 'storeName')
    .lean();

    if (bestSellersRaw.length < 4) {
        bestSellersRaw = await Product.find({ isActive: true, stock: { $ne: 'out_of_stock' } })
            .sort({ reviewCount: -1 })
            .limit(10)
            .populate('categoryId', 'name')
            .populate('brandId', 'name')
            .populate('vendorId', 'storeName')
            .lean();
    }
    const products = bestSellersRaw.map(p => ({ ...p, id: String(p._id), _id: String(p._id) })).filter(p => p.isActive !== false);
    res.status(200).json(new ApiResponse(200, products, 'Best sellers fetched.'));
}));

// GET /api/products/top-rated
router.get('/products/top-rated', asyncHandler(async (req, res) => {
    const topRatedRaw = await Product.find({ isActive: true })
        .sort({ rating: -1, reviewCount: -1 })
        .limit(15)
        .populate('categoryId', 'name')
        .populate('brandId', 'name')
        .populate('vendorId', 'storeName')
        .lean();
    const products = topRatedRaw.map(p => ({ ...p, id: String(p._id), _id: String(p._id) })).filter(p => p.isActive !== false);
    res.status(200).json(new ApiResponse(200, products, 'Top rated fetched.'));
}));
const listCache = cacheResponse({ ttlSeconds: 30, maxEntries: 1000 });
const detailCache = cacheResponse({ ttlSeconds: 60, maxEntries: 1000 });
const catalogCache = cacheResponse({ ttlSeconds: 300, maxEntries: 200 });
const marketingCache = cacheResponse({ ttlSeconds: 120, maxEntries: 300 });

const PRODUCT_LIST_SELECT = '-faqs -relatedProducts -__v';
const EXCLUSIVE_SALE_CAMPAIGN_TYPES = ['flash_sale', 'daily_deal', 'special_offer', 'festival'];

const toPublicVendor = (vendorDoc) => {
    const vendor = typeof vendorDoc?.toObject === 'function'
        ? vendorDoc.toObject()
        : (vendorDoc || {});

    return {
        ...vendor,
        password: undefined,
        otp: undefined,
        otpExpiry: undefined,
        bankDetails: undefined,
        commissionRate: undefined,
    };
};

const normalizeVariantPart = (value) => String(value || '').trim().toLowerCase();
const normalizeVariantKey = (key) => String(key || '').trim().toLowerCase();

const toVariantPriceEntries = (variantPrices) => {
    if (!variantPrices) return [];
    if (variantPrices instanceof Map) return Array.from(variantPrices.entries());
    if (typeof variantPrices === 'object') return Object.entries(variantPrices);
    return [];
};

const resolveVariantPrice = (product, selectedVariant) => {
    const basePrice = Number(product?.price);
    if (!Number.isFinite(basePrice) || basePrice < 0) return 0;

    const selectionEntries = Object.entries(selectedVariant || {})
        .map(([axis, value]) => [String(axis || '').trim(), String(value || '').trim()])
        .filter(([axis, value]) => axis && value);

    const dynamicKey = selectionEntries.length
        ? selectionEntries
            .map(([axis, value]) => `${normalizeVariantPart(axis)}=${normalizeVariantPart(value)}`)
            .sort()
            .join('|')
        : '';

    const size = normalizeVariantPart(selectedVariant?.size);
    const color = normalizeVariantPart(selectedVariant?.color);
    const entries = toVariantPriceEntries(product?.variants?.prices);
    if (!entries.length || (!dynamicKey && !size && !color)) return basePrice;

    const candidateKeys = [
        dynamicKey || null,
        `${size}|${color}`,
        `${size}-${color}`,
        `${size}_${color}`,
        `${size}:${color}`,
        size && !color ? size : null,
        color && !size ? color : null,
    ].filter(Boolean);

    for (const candidate of candidateKeys) {
        if (!candidate) continue;
        const exact = entries.find(([rawKey]) => String(rawKey).trim() === candidate);
        if (exact) {
            const price = Number(exact[1]);
            if (Number.isFinite(price) && price >= 0) return price;
        }

        const normalized = entries.find(
            ([rawKey]) => normalizeVariantKey(rawKey) === normalizeVariantKey(candidate)
        );
        if (normalized) {
            const price = Number(normalized[1]);
            if (Number.isFinite(price) && price >= 0) return price;
        }
    }

    return basePrice;
};

const activeCampaignWindowQuery = (now = new Date()) => ({
    isActive: true,
    $and: [
        { $or: [{ startDate: null }, { startDate: { $exists: false } }, { startDate: { $lte: now } }] },
        { $or: [{ endDate: null }, { endDate: { $exists: false } }, { endDate: { $gte: now } }] }
    ]
});

const collectCampaignProductIds = (campaigns = []) => {
    const idSet = new Set();
    campaigns.forEach((campaign) => {
        const ids = Array.isArray(campaign?.productIds) ? campaign.productIds : [];
        ids.forEach((value) => {
            const normalized = String(value || '').trim();
            if (/^[a-fA-F0-9]{24}$/.test(normalized)) {
                idSet.add(normalized);
            }
        });
    });
    return [...idSet];
};

// 60-second in-process cache for active sale product IDs (reduces DB load on every listing call)
let _saleCache = { ids: null, expiresAt: 0 };

const getActiveSaleProductIds = async (type = null) => {
    const now = Date.now();
    // Only cache the "all types" query; typed queries are used rarely on specific pages
    if (!type && _saleCache.ids && now < _saleCache.expiresAt) {
        return _saleCache.ids;
    }

    const query = {
        ...activeCampaignWindowQuery(new Date(now)),
        type: type
            ? String(type || '').trim()
            : { $in: EXCLUSIVE_SALE_CAMPAIGN_TYPES },
    };

    const campaigns = await Campaign.find(query).select('productIds').lean();
    const ids = collectCampaignProductIds(campaigns);

    if (!type) {
        _saleCache = { ids, expiresAt: now + 60_000 };
    }

    return ids;
};

const listProducts = asyncHandler(async (req, res) => {
    const {
        page = 1,
        limit = 12,
        category,
        brand,
        vendor,
        search,
        q,
        sort = 'newest',
        flashSale,
        isNewArrival,
        minPrice,
        maxPrice,
        minRating
    } = req.query;
    const numericPage = Math.max(Number(page) || 1, 1);
    const numericLimit = Math.min(Math.max(Number(limit) || 12, 1), 100);
    const skip = (numericPage - 1) * numericLimit;
    const filter = { isActive: true };

    if (category) {
        const fetchAllChildCategoryIds = async (id) => {
            const subs = await Category.find({ parentId: id, isActive: true }).select('_id').lean();
            let ids = subs.map(s => String(s._id));
            for (const subId of ids) {
                const deeperIds = await fetchAllChildCategoryIds(subId);
                ids = [...ids, ...deeperIds];
            }
            return ids;
        };
        const categoryId = String(category);
        const categoryIds = [categoryId, ...(await fetchAllChildCategoryIds(categoryId))];
        filter.categoryId = { $in: categoryIds };
    }

    if (brand) filter.brandId = brand;
    if (vendor) filter.vendorId = vendor;
    if (flashSale === 'true') filter.flashSale = true;
    if (isNewArrival === 'true') filter.isNewArrival = true;
    if (minPrice || maxPrice) filter.price = { ...(minPrice && { $gte: Number(minPrice) }), ...(maxPrice && { $lte: Number(maxPrice) }) };
    if (minRating) filter.rating = { $gte: Number(minRating) };

    const searchQuery = String(search || q || '').trim();
    if (searchQuery) {
        // Track the search query asynchronously
        import('../models/SearchQuery.model.js').then(({ default: SearchQuery }) => {
            SearchQuery.findOneAndUpdate(
                { query: searchQuery.toLowerCase() },
                { $inc: { count: 1 } },
                { upsert: true, new: true }
            ).catch((err) => console.error('Error tracking search query:', err));
        });

        // Use $text search for multi-word queries for relevance.
        // For single words, use regex to support partial matches (which $text doesn't handle well).
        // Mixing $text and $regex in an $or block often causes "No query solutions" errors in MongoDB.
        if (searchQuery.includes(' ')) {
            filter.$text = { $search: searchQuery };
        } else {
            filter.$or = [
                { name: { $regex: searchQuery, $options: 'i' } },
                { tags: { $regex: searchQuery, $options: 'i' } }
            ];
        }
    }

    const activeSaleProductIds = await getActiveSaleProductIds();
    if (activeSaleProductIds.length) {
        filter._id = { $nin: activeSaleProductIds };
    }

    const sortMap = { 
        newest: { createdAt: -1 }, 
        oldest: { createdAt: 1 }, 
        'price-asc': { price: 1 }, 
        'price-desc': { price: -1 }, 
        popular: { reviewCount: -1 }, 
        rating: { rating: -1 } 
    };

    const [products, total] = await Promise.all([
        Product.find(filter)
            .select(PRODUCT_LIST_SELECT)
            .populate('categoryId', 'name')
            .populate('brandId', 'name')
            .populate('vendorId', 'storeName')
            .sort(sortMap[sort] || { createdAt: -1 })
            .skip(skip)
            .limit(numericLimit)
            .lean(),
        Product.countDocuments(filter),
    ]);

    res.status(200).json(new ApiResponse(200, { products, total, page: numericPage, pages: Math.ceil(total / numericLimit) }, 'Products fetched.'));
});

const getShopMetadata = asyncHandler(async (req, res) => {
    let shopConfig = await AppConfig.findOne({ key: 'shop' }).lean();
    if (!shopConfig) {
        shopConfig = {
            value: {
                defaultSort: 'newest',
                productsPerPage: 20,
                defaultViewMode: 'grid',
                quickFilters: [],
                featuredCategories: [],
                featuredBrands: [],
                bannerAsset: null,
                enabledFilters: {}
            }
        };
    }
    const configVal = shopConfig.value || {};

    // 1. Categories
    let categories;
    if (configVal.featuredCategories && configVal.featuredCategories.length > 0) {
        categories = await Category.find({ _id: { $in: configVal.featuredCategories }, isActive: true }).lean();
    } else {
        categories = await Category.find({ isActive: true, parentId: null }).lean();
    }

    // 2. Brands
    let brands;
    if (configVal.featuredBrands && configVal.featuredBrands.length > 0) {
        brands = await Brand.find({ _id: { $in: configVal.featuredBrands }, isActive: true }).lean();
    } else {
        brands = await Brand.find({ isActive: true }).lean();
    }

    // 3. Vendors
    const vendors = await Vendor.find({ status: 'approved' })
        .select('_id id storeName name isVerified logo')
        .lean();

    // 4. Dynamic Price Range
    const priceStats = await Product.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: null, min: { $min: "$price" }, max: { $max: "$price" } } }
    ]);
    const priceRange = {
        min: priceStats[0]?.min ?? 0,
        max: priceStats[0]?.max ?? 50000
    };

    // 5. Shop Banner
    let resolvedBanner = null;
    if (configVal.bannerAsset) {
        resolvedBanner = await HomeBanner.findOne({ _id: configVal.bannerAsset, isActive: true }).lean();
    }
    if (!resolvedBanner) {
        resolvedBanner = await HomeBanner.findOne({ sectionType: 'promotional_banner', isDefault: true, isActive: true }).lean();
    }

    // 6. Dynamic Filters configuration schema
    const enabled = configVal.enabledFilters || {};
    const allFilters = [
        { key: 'category', label: 'Categories', enabled: enabled.category !== false, type: 'multi-select' },
        { key: 'brand', label: 'Brands', enabled: enabled.brand !== false, type: 'multi-select' },
        { key: 'price', label: 'Price Range', enabled: enabled.price !== false, type: 'range' },
        { key: 'rating', label: 'Customer Rating', enabled: enabled.rating !== false, type: 'stars' },
        { key: 'discount', label: 'Discount %', enabled: enabled.discount !== false, type: 'discount' },
        { key: 'stock', label: 'Availability', enabled: enabled.stock !== false, type: 'toggle' },
        { key: 'vendor', label: 'Store Vendors', enabled: enabled.vendor !== false, type: 'multi-select' },
        { key: 'deliveryType', label: 'Delivery Option', enabled: enabled.deliveryType !== false, type: 'toggle' },
        { key: 'color', label: 'Colors', enabled: enabled.color !== false, type: 'multi-select' },
        { key: 'size', label: 'Sizes', enabled: enabled.size !== false, type: 'multi-select' }
    ];

    res.status(200).json(new ApiResponse(200, {
        categories,
        brands,
        vendors,
        quickFilters: configVal.quickFilters || [],
        priceRange,
        banner: resolvedBanner ? {
            desktopImage: resolvedBanner.desktopImage,
            mobileImage: resolvedBanner.mobileImage || resolvedBanner.desktopImage,
            title: resolvedBanner.title || '',
            subtitle: resolvedBanner.subtitle || '',
            ctaText: resolvedBanner.ctaText || '',
            ctaLink: resolvedBanner.ctaLink || '',
            textColor: resolvedBanner.textColor || '#ffffff',
            buttonColor: resolvedBanner.buttonColor || '#ffffff',
            overlayOpacity: resolvedBanner.overlayOpacity ?? 0.3
        } : null,
        filters: allFilters.filter(f => f.enabled)
    }, 'Shop metadata loaded.'));
});

const getShopProducts = asyncHandler(async (req, res) => {
    const {
        page = 1,
        limit = 20,
        sort = 'newest',
        q,
        search,
        category,
        brand,
        vendor,
        minPrice,
        maxPrice,
        minRating,
        discount,
        stock,
        deliveryType,
        color,
        size
    } = req.query;

    const numericPage = Math.max(Number(page) || 1, 1);
    const numericLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const skip = (numericPage - 1) * numericLimit;

    const filter = { isActive: true };

    // Search Query
    const searchQuery = String(search || q || '').trim();
    if (searchQuery) {
        if (searchQuery.includes(' ')) {
            filter.$text = { $search: searchQuery };
        } else {
            filter.$or = [
                { name: { $regex: searchQuery, $options: 'i' } },
                { tags: { $regex: searchQuery, $options: 'i' } }
            ];
        }
    }

    // Categories (Including Child Categories)
    if (category) {
        const categoryIds = Array.isArray(category) ? category.map(String) : String(category).split(',');
        
        const fetchAllChildCategoryIds = async (id) => {
            const subs = await Category.find({ parentId: id, isActive: true }).select('_id').lean();
            let ids = subs.map(s => String(s._id));
            for (const subId of ids) {
                const deeperIds = await fetchAllChildCategoryIds(subId);
                ids = [...ids, ...deeperIds];
            }
            return ids;
        };

        let expandedIds = [...categoryIds];
        for (const catId of categoryIds) {
            const children = await fetchAllChildCategoryIds(catId);
            expandedIds = [...expandedIds, ...children];
        }

        filter.categoryId = { $in: expandedIds };
    }

    // Brand Filter
    if (brand) {
        const brandIds = Array.isArray(brand) ? brand.map(String) : String(brand).split(',');
        filter.brandId = { $in: brandIds };
    }

    // Vendor Filter
    if (vendor) {
        const vendorIds = Array.isArray(vendor) ? vendor.map(String) : String(vendor).split(',');
        filter.vendorId = { $in: vendorIds };
    }

    // Price Filter
    if (minPrice || maxPrice) {
        filter.price = {
            ...(minPrice && { $gte: Number(minPrice) }),
            ...(maxPrice && { $lte: Number(maxPrice) })
        };
    }

    // Rating Filter
    if (minRating) {
        filter.rating = { $gte: Number(minRating) };
    }

    // Discount Filter (mathematical comparison)
    if (discount) {
        const discountNum = Number(discount);
        filter.originalPrice = { $exists: true, $gt: 0 };
        filter.$expr = {
            $gte: [
                { $multiply: [ { $divide: [ { $subtract: ["$originalPrice", "$price"] }, "$originalPrice" ] }, 100 ] },
                discountNum
            ]
        };
    }

    // Availability Filter (Stock)
    if (stock) {
        if (stock === 'in_stock') {
            filter.stock = { $in: ['in_stock', 'low_stock'] };
        } else if (stock === 'out_of_stock') {
            filter.stock = 'out_of_stock';
        }
    }

    // Delivery Type (Standard vs Express simulated check)
    if (deliveryType === 'express') {
        filter.codAllowed = true;
    }

    // Colors Filter
    if (color) {
        const colors = Array.isArray(color) ? color : String(color).split(',');
        filter['variants.colors'] = { $in: colors };
    }

    // Sizes Filter
    if (size) {
        const sizes = Array.isArray(size) ? size : String(size).split(',');
        filter['variants.sizes'] = { $in: sizes };
    }

    // Sorting
    const sortMap = {
        newest: { createdAt: -1 },
        oldest: { createdAt: 1 },
        'price-asc': { price: 1 },
        'price-desc': { price: -1 },
        popular: { reviewCount: -1 },
        rating: { rating: -1 },
        discount: { originalPrice: -1, price: 1 } // sorting by biggest potential discounts
    };

    const activeSaleProductIds = await getActiveSaleProductIds();
    if (activeSaleProductIds.length) {
        filter._id = { $nin: activeSaleProductIds };
    }

    const [products, total] = await Promise.all([
        Product.find(filter)
            .select('name slug price originalPrice images image categoryId brandId vendorId stock stockQuantity rating reviewCount isNewArrival isFeatured flashSale variants')
            .populate('categoryId', 'name')
            .populate('brandId', 'name')
            .populate('vendorId', 'storeName')
            .sort(sortMap[sort] || { createdAt: -1 })
            .skip(skip)
            .limit(numericLimit)
            .lean(),
        Product.countDocuments(filter)
    ]);

    res.status(200).json(new ApiResponse(200, {
        products,
        page: numericPage,
        pages: Math.ceil(total / numericLimit),
        totalProducts: total,
        hasMore: numericPage < Math.ceil(total / numericLimit)
    }, 'Shop products fetched.'));
});

router.get('/', listCache, listProducts);
router.get('/products', listCache, listProducts);
router.get('/shop/meta', getShopMetadata);
router.get('/shop/products', getShopProducts);

// GET /api/search/autocomplete
router.get('/search/autocomplete', cacheResponse({ ttlSeconds: 300, maxEntries: 1000 }), asyncHandler(async (req, res) => {
    const query = String(req.query?.q || '').trim();
    if (!query || query.length < 2) {
        return res.status(200).json(new ApiResponse(200, { products: [], categories: [] }, 'Query too short.'));
    }

    const safeRegex = new RegExp(`^${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
    
    const [products, categories] = await Promise.all([
        Product.find({ name: safeRegex, isActive: true })
            .select('name image price slug')
            .limit(8)
            .lean(),
        Category.find({ name: safeRegex, isActive: true })
            .select('name slug')
            .limit(4)
            .lean()
    ]);

    res.status(200).json(new ApiResponse(200, { products, categories }, 'Autocomplete results.'));
}));

// GET /api/search/suggestions
router.get('/search/suggestions', catalogCache, asyncHandler(async (req, res) => {
    const [categories, brands] = await Promise.all([
        Category.find({ isActive: true, isFeatured: true }).select('name slug').limit(10).lean(),
        Brand.find({ isActive: true }).select('name').limit(10).lean()
    ]);
    
    const suggestions = [
        ...categories.map(c => c.name),
        ...brands.map(b => b.name)
    ].sort(() => 0.5 - Math.random()).slice(0, 10);

    res.status(200).json(new ApiResponse(200, suggestions, 'Search suggestions.'));
}));

// GET /api/products/flash-sale
router.get('/flash-sale', marketingCache, asyncHandler(async (req, res) => {
    const flashSaleProductIds = await getActiveSaleProductIds('flash_sale');
    if (!flashSaleProductIds.length) {
        return res.status(200).json(new ApiResponse(200, [], 'Flash sale products.'));
    }
    const products = await Product.find({ isActive: true, _id: { $in: flashSaleProductIds } })
        .select(PRODUCT_LIST_SELECT)
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();
    res.status(200).json(new ApiResponse(200, products, 'Flash sale products.'));
}));

// GET /api/products/new-arrivals
router.get('/new-arrivals', listCache, asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, sort = 'newest', search, q, minPrice, maxPrice, minRating } = req.query;
    const numericPage = Math.max(Number(page) || 1, 1);
    const numericLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const skip = (numericPage - 1) * numericLimit;
    const filter = { isActive: true, isNewArrival: true };

    const searchQuery = String(search || q || '').trim();
    if (searchQuery) filter.$text = { $search: searchQuery };

    if (minPrice || maxPrice) {
        filter.price = {
            ...(minPrice ? { $gte: Number(minPrice) } : {}),
            ...(maxPrice ? { $lte: Number(maxPrice) } : {}),
        };
    }
    if (minRating) filter.rating = { $gte: Number(minRating) };

    const activeSaleProductIds = await getActiveSaleProductIds();
    if (activeSaleProductIds.length) {
        filter._id = { $nin: activeSaleProductIds };
    }

    const sortMap = {
        newest: { createdAt: -1 },
        oldest: { createdAt: 1 },
        'price-asc': { price: 1 },
        'price-desc': { price: -1 },
        popular: { reviewCount: -1 },
        rating: { rating: -1 },
    };

    const [products, total] = await Promise.all([
        Product.find(filter)
            .select(PRODUCT_LIST_SELECT)
            .populate('categoryId', 'name')
            .populate('brandId', 'name')
            .populate('vendorId', 'storeName')
            .sort(sortMap[sort] || sortMap.newest)
            .skip(skip)
            .limit(numericLimit)
            .lean(),
        Product.countDocuments(filter),
    ]);

    res.status(200).json(new ApiResponse(200, { products, total, page: numericPage, pages: Math.ceil(total / numericLimit) }, 'New arrivals fetched.'));
}));

// GET /api/products/popular
router.get('/popular', marketingCache, asyncHandler(async (req, res) => {
    const activeSaleProductIds = await getActiveSaleProductIds();
    const filter = { isActive: true };
    if (activeSaleProductIds.length) {
        filter._id = { $nin: activeSaleProductIds };
    }
    const products = await Product.find(filter)
        .select(PRODUCT_LIST_SELECT)
        .sort({ reviewCount: -1, rating: -1, createdAt: -1 })
        .limit(10)
        .lean();
    res.status(200).json(new ApiResponse(200, products, 'Popular products.'));
}));

// GET /api/products/similar/:id
router.get('/similar/:id', detailCache, asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id).select('_id categoryId').lean();
    if (!product) throw new ApiError(404, 'Product not found.');
    const activeSaleProductIds = await getActiveSaleProductIds();
    const similarFilter = { isActive: true, _id: { $ne: product._id }, categoryId: product.categoryId };
    if (activeSaleProductIds.length) {
        similarFilter._id = { $nin: [String(product._id), ...activeSaleProductIds] };
    }
    const similar = await Product.find(similarFilter)
        .select(PRODUCT_LIST_SELECT)
        .sort({ createdAt: -1 })
        .limit(6)
        .lean();
    res.status(200).json(new ApiResponse(200, similar, 'Similar products.'));
}));

const getProductDetail = asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id)
        .populate('categoryId', 'name')
        .populate('brandId', 'name')
        .populate('vendorId', 'storeName storeLogo rating')
        .lean();
    if (!product) throw new ApiError(404, 'Product not found.');
    res.status(200).json(new ApiResponse(200, product, 'Product detail.'));
});

// GET /api/products/:id
router.get('/products/:id', detailCache, getProductDetail);

// GET /api/products/:productId/reviews
router.get('/products/:productId/reviews', asyncHandler(async (req, res) => {
    const { sort = 'newest', page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const productId = req.params.productId;

    const sortMap = {
        newest: { createdAt: -1 },
        oldest: { createdAt: 1 },
        'highest-rating': { rating: -1 },
        'lowest-rating': { rating: 1 },
    };

    const { Review } = await import('../models/Review.model.js');
    const { default: mongoose } = await import('mongoose');

    const reviews = await Review.find({ productId, isApproved: true, isHidden: false })
        .populate('userId', 'name avatar')
        .sort(sortMap[sort] || { createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit, 10))
        .lean();

    const total = await Review.countDocuments({ productId, isApproved: true, isHidden: false });

    const stats = await Review.aggregate([
        { $match: { productId: new mongoose.Types.ObjectId(productId), isApproved: true, isHidden: false } },
        {
            $group: {
                _id: '$rating',
                count: { $sum: 1 }
            }
        }
    ]);

    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let sum = 0;
    let totalRatings = 0;
    stats.forEach(s => {
        distribution[s._id] = s.count;
        sum += s._id * s.count;
        totalRatings += s.count;
    });

    const averageRating = totalRatings > 0 ? parseFloat((sum / totalRatings).toFixed(1)) : 0;

    const allImages = [];
    reviews.forEach(r => {
        if (Array.isArray(r.images)) {
            allImages.push(...r.images);
        }
    });

    res.status(200).json(new ApiResponse(200, {
        reviews,
        total,
        averageRating,
        totalReviews: total,
        distribution,
        images: allImages.slice(0, 30),
        page: parseInt(page, 10),
        pages: Math.ceil(total / parseInt(limit, 10))
    }, 'Product reviews fetched.'));
}));

// GET /api/categories (public)
router.get('/categories/all', catalogCache, asyncHandler(async (req, res) => {
    const categories = await Category.find({ isActive: true })
        .sort({ order: 1, name: 1 })
        .lean();
    res.status(200).json(new ApiResponse(200, categories, 'Categories fetched.'));
}));

// GET /api/brands (public)
router.get('/brands/all', catalogCache, asyncHandler(async (req, res) => {
    const brands = await Brand.find({ isActive: true, visibility: 'global' }).sort({ name: 1 }).lean();
    res.status(200).json(new ApiResponse(200, brands, 'Brands fetched.'));
}));

// GET /api/vendors/all (public)
router.get('/vendors/all', detailCache, asyncHandler(async (req, res) => {
    const { status = 'approved', page = 1, limit = 50, search } = req.query;
    const numericPage = Math.max(parseInt(page, 10) || 1, 1);
    const numericLimit = Math.max(parseInt(limit, 10) || 50, 1);
    const skip = (numericPage - 1) * numericLimit;
    const filter = {};
    if (status && status !== 'all') {
        filter.status = status;
    }
    const trimmedSearch = String(search || '').trim();
    if (trimmedSearch) {
        const safeRegex = new RegExp(trimmedSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        filter.$or = [{ name: safeRegex }, { email: safeRegex }, { storeName: safeRegex }];
    }
    const [vendors, total] = await Promise.all([
        Vendor.find(filter)
            .select('-password -otp -otpExpiry')
            .sort({ rating: -1, reviewCount: -1, createdAt: -1 })
            .skip(skip)
            .limit(numericLimit)
            .lean(),
        Vendor.countDocuments(filter),
    ]);
    res.status(200).json(new ApiResponse(200, {
        vendors: vendors.map(toPublicVendor),
        total,
        page: numericPage,
        pages: Math.ceil(total / numericLimit)
    }, 'Vendors fetched.'));
}));

// GET /api/vendors/:id (public)
router.get('/vendors/:id', detailCache, asyncHandler(async (req, res) => {
    const vendor = await Vendor.findOne({
        _id: req.params.id,
        status: 'approved',
    }).select('-password -otp -otpExpiry').lean();
    if (!vendor) throw new ApiError(404, 'Vendor not found.');
    res.status(200).json(new ApiResponse(200, toPublicVendor(vendor), 'Vendor detail fetched.'));
}));

// GET /api/vendors/:id/products (public)
router.get('/vendors/:id/products', listCache, asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, sort = 'newest' } = req.query;
    const numericPage = Math.max(parseInt(page, 10) || 1, 1);
    const numericLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const skip = (numericPage - 1) * numericLimit;
    const sortMap = {
        newest: { createdAt: -1 },
        oldest: { createdAt: 1 },
        'price-asc': { price: 1 },
        'price-desc': { price: -1 },
        popular: { reviewCount: -1 },
        rating: { rating: -1 },
    };
    const vendor = await Vendor.findOne({
        _id: req.params.id,
        status: 'approved',
    }).select('_id').lean();
    if (!vendor) throw new ApiError(404, 'Vendor not found.');
    const activeSaleProductIds = await getActiveSaleProductIds();
    const filter = { isActive: true, vendorId: req.params.id };
    if (activeSaleProductIds.length) {
        filter._id = { $nin: activeSaleProductIds };
    }
    const [products, total] = await Promise.all([
        Product.find(filter)
            .select(PRODUCT_LIST_SELECT)
            .populate('categoryId', 'name')
            .populate('brandId', 'name')
            .populate('vendorId', 'storeName')
            .sort(sortMap[sort] || { createdAt: -1 })
            .skip(skip)
            .limit(numericLimit)
            .lean(),
        Product.countDocuments(filter),
    ]);
    res.status(200).json(new ApiResponse(200, {
        products,
        total,
        page: numericPage,
        pages: Math.ceil(total / numericLimit)
    }, 'Vendor products fetched.'));
}));

// POST /api/coupons/validate
router.post('/coupons/validate', asyncHandler(async (req, res) => {
    const rawCode = String(req.body?.code || '').trim();
    const cartTotal = Number(req.body?.cartTotal);
    if (!rawCode) throw new ApiError(400, 'Coupon code is required.');
    if (!Number.isFinite(cartTotal) || cartTotal < 0) throw new ApiError(400, 'Cart total must be valid.');
    const coupon = await Coupon.findOne({ code: rawCode.toUpperCase(), isActive: true }).lean();
    if (!coupon) throw new ApiError(400, 'Invalid coupon code.');
    if (coupon.startsAt && coupon.startsAt > Date.now()) throw new ApiError(400, 'Coupon not active.');
    if (coupon.expiresAt && coupon.expiresAt < Date.now()) throw new ApiError(400, 'Coupon expired.');
    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) throw new ApiError(400, 'Usage limit reached.');
    if (cartTotal < coupon.minOrderValue) throw new ApiError(400, `Min Rs.${coupon.minOrderValue} required.`);
    let discount = coupon.type === 'percentage' ? (cartTotal * coupon.value) / 100 : coupon.value;
    if (coupon.type === 'percentage' && coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);
    res.status(200).json(new ApiResponse(200, { coupon: { code: coupon.code, type: coupon.type, value: coupon.value }, discount }, 'Coupon valid.'));
}));

// GET /api/coupons/available
router.get('/coupons/available', marketingCache, asyncHandler(async (req, res) => {
    const now = new Date();
    const coupons = await Coupon.find({
        isActive: true,
        $and: [
            { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
            { $or: [{ expiresAt: null }, { expiresAt: { $gte: now } }] }
        ]
    }).limit(30).lean();
    res.status(200).json(new ApiResponse(200, coupons, 'Available coupons.'));
}));

// POST /api/shipping/estimate
// ─────────────────────────────────────────────────────────────────────────────
// BACKWARD COMPATIBILITY CONTRACT
// The response shape is guaranteed to remain:
//   { shipping: number, byVendor: { [vendorId]: number } }
//
// Phase 3.5 adds two OPTIONAL fields that callers may ignore:
//   quoteId : string | null   — ShippingQuote token; pass back at order creation
//   eta     : { date, hours } | null   — estimated delivery window
//
// If the Delivery Engine fails for any reason, the endpoint still returns
// the original { shipping, byVendor } response without modification.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/shipping/estimate', asyncHandler(async (req, res) => {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const { shippingAddress, shippingOption, couponType, paymentMethod } = req.body;

    // ── Fast path: empty cart ──────────────────────────────────────────────
    if (!items.length) {
        return res.status(200).json(new ApiResponse(200, { shipping: 0, byVendor: {}, quoteId: null, eta: null }));
    }

    const productIds = items.map(i => i.productId).filter(id => /^[a-fA-F0-9]{24}$/.test(id));

    // Fetch products with vendor shipping config AND warehouse address (for engine origin)
    const products = await Product.find({ _id: { $in: productIds }, isActive: true })
        .populate('vendorId', 'shippingEnabled defaultShippingRate freeShippingThreshold warehouseAddress')
        .lean();

    const productMap = new Map(products.map(p => [String(p._id), p]));
    const vendorMap = {};

    items.forEach(item => {
        const product = productMap.get(String(item.productId));
        if (!product || !product.vendorId) return;
        const vId = String(product.vendorId._id);
        const subtotal = (resolveVariantPrice(product, item.variant) || product.price) * item.quantity;
        if (!vendorMap[vId]) {
            vendorMap[vId] = {
                vendorId:             vId,
                subtotal:             0,
                shippingEnabled:      product.vendorId.shippingEnabled !== false,
                defaultShippingRate:  product.vendorId.defaultShippingRate,
                freeShippingThreshold: product.vendorId.freeShippingThreshold,
                // Warehouse address fields added for engine — not used by existing shipping calc
                warehouseAddress:     product.vendorId.warehouseAddress,
            };
        }
        vendorMap[vId].subtotal += subtotal;
    });

    // ── Existing shipping calculation (UNCHANGED logic) ────────────────────
    // Engine runs in parallel — existing result is never blocked by it
    const vendorGroups = Object.values(vendorMap);

    // ── Delivery Engine (Phase 7 addition) ──────────────────────────────
    // Runs concurrently with existing shipping calc. Any failure is silenced.
    // Calculate static shipping first so we can pass customerShippingCharge to the engine
    const shippingResult = await calculateVendorShippingForGroups({ vendorGroups, shippingAddress, shippingOption, couponType });

    const userId = req.user?.id || null;
    const normalizedGuestEmail = String(shippingAddress?.email || '').trim().toLowerCase();
    const normalizedGuestPhone = String(shippingAddress?.phone || '').replace(/\D/g, '').slice(-10);
    const quoteScope = userId 
        ? `user:${String(userId)}` 
        : `guest:${normalizedGuestEmail || normalizedGuestPhone || 'anonymous'}`;

    const enginePromises = vendorGroups.map(async (vGroup) => {
        try {
            const wh = vGroup.warehouseAddress || {};
            const originContext = {
                pincode: wh.pincode  || null,
                city:    wh.city     || null,
                state:   wh.state    || null,
                lat:     wh.location?.coordinates?.[1] || null,
                lng:     wh.location?.coordinates?.[0] || null,
            };

            const destContext = {
                pincode: shippingAddress?.pincode  || shippingAddress?.zipCode || null,
                city:    shippingAddress?.city     || null,
                state:   shippingAddress?.state    || null,
                lat:     shippingAddress?.lat      || null,
                lng:     shippingAddress?.lng      || null,
            };

            // Estimate total package weight from items for THIS vendor
            // Fallback to 500g per item if not specified
            // Wait, items in vGroup aren't tracked? vendorGroups only has subtotal etc.
            // We need to compute totalWeightGrams from original items array mapped to this vendor
            const vItems = items.filter(item => {
                const p = productMap.get(String(item.productId));
                return p && String(p.vendorId._id) === String(vGroup.vendorId);
            });
            const totalWeightGrams = vItems.reduce((sum, item) => sum + (Number(item.weight) || 500) * (Number(item.quantity) || 1), 0);
            
            const customerCharge = shippingResult.shippingByVendor[vGroup.vendorId] || 0;

            const engineContext = {
                origin:                 originContext,
                destination:            destContext,
                packageWeight:          totalWeightGrams,
                paymentMethod:          paymentMethod || 'online',
                customerShippingCharge: customerCharge, 
            };

            const engineResult = await runEngine(engineContext, {
                vendorId: vGroup.vendorId || undefined,
                quoteScope: quoteScope
            });

            return { vendorId: vGroup.vendorId, engineResult };
        } catch (err) {
            console.error(`[ShippingEstimate] Delivery Engine error for vendor ${vGroup.vendorId}:`, err.message);
            return { vendorId: vGroup.vendorId, engineResult: null };
        }
    });

    const engineResultsArray = await Promise.all(enginePromises);
    
    // ── Build response ─────────────────────────────────────────────────────
    
    const quotesByVendor = {};
    let firstQuoteId = null;
    let firstEta = null;

    engineResultsArray.forEach(({ vendorId, engineResult }) => {
        if (engineResult && engineResult.shippingQuoteId) {
            if (!firstQuoteId) {
                firstQuoteId = engineResult.shippingQuoteId;
                firstEta = engineResult.quote?.etaDate 
                    ? { date: engineResult.quote.etaDate, hours: engineResult.quote.etaHours } 
                    : null;
            }
            quotesByVendor[vendorId] = {
                quoteId: engineResult.shippingQuoteId,
                eta: engineResult.quote?.etaDate ? { date: engineResult.quote.etaDate, hours: engineResult.quote.etaHours } : null,
                customerCharge: shippingResult.shippingByVendor[vendorId] || 0
            };
        }
    });

    // ORIGINAL fields: unchanged, always present
    const responseData = {
        shipping:  shippingResult.totalShipping,
        byVendor:  shippingResult.shippingByVendor,

        // ADDED fields (Phase 3.5 backward compat): null when engine unavailable
        quoteId: firstQuoteId,
        eta:     firstEta,
        
        // ADDED field (Phase 7): complete map of quotes for multi-vendor checkout
        quotesByVendor
    };

    res.status(200).json(new ApiResponse(200, responseData));
}));


// GET /api/banners
router.get('/banners', marketingCache, asyncHandler(async (req, res) => {
    const { type } = req.query;
    const now = new Date();
    const filter = {
        isActive: true,
        $and: [
            {
                $or: [
                    { startDate: { $exists: false } },
                    { startDate: null },
                    { startDate: { $lte: now } }
                ]
            },
            {
                $or: [
                    { endDate: { $exists: false } },
                    { endDate: null },
                    { endDate: { $gte: now } }
                ]
            }
        ]
    };
    if (type) filter.type = type;
    const banners = await Banner.find(filter).sort({ order: 1 }).lean();
    res.status(200).json(new ApiResponse(200, banners, 'Banners fetched.'));
}));

// GET /api/campaigns
router.get('/campaigns', marketingCache, asyncHandler(async (req, res) => {
    const { type } = req.query;
    const filter = { isActive: true };
    if (type) filter.type = type;
    const campaigns = await Campaign.find(filter).sort({ createdAt: -1 }).lean();
    res.status(200).json(new ApiResponse(200, campaigns, 'Campaigns fetched.'));
}));

// GET /api/campaigns/:slug
router.get('/campaigns/:slug', detailCache, asyncHandler(async (req, res) => {
    const campaign = await Campaign.findOne({ slug: req.params.slug, isActive: true }).lean();
    if (!campaign) throw new ApiError(404, 'Campaign not found.');
    const products = await Product.find({ _id: { $in: campaign.productIds || [] }, isActive: true }).select(PRODUCT_LIST_SELECT).lean();
    res.status(200).json(new ApiResponse(200, { ...campaign, products }, 'Campaign details.'));
}));

// GET /api/orders/track/:id
router.get('/orders/track/:id', detailCache, asyncHandler(async (req, res) => {
    const { default: Order } = await import('../models/Order.model.js');
    const order = await Order.findOne({ orderId: req.params.id }).select('orderId status trackingNumber estimatedDelivery deliveredAt readyForPickupAt processingAt shippedAt deliveryOtpDebug').lean();
    if (!order) throw new ApiError(404, 'Order not found.');
    res.status(200).json(new ApiResponse(200, order, 'Order tracking.'));
}));

// GET /api/settings/general
router.get('/settings/general', listCache, asyncHandler(async (req, res) => {
    const settings = await Settings.findOne({ key: 'general' }).lean();
    const value = settings?.value || {};
    
    // Filter out private administrative fields to protect platform configuration data
    const publicSettings = {
        storeName: value.storeName || "Porutkal E-commerce",
        storeDescription: value.storeDescription || "",
        contactEmail: value.contactEmail || "contact@example.com",
        contactPhone: value.contactPhone || "",
        address: value.address || "",
        socialMedia: value.socialMedia || {
            facebook: "",
            instagram: "",
            twitter: "",
            linkedin: "",
        }
    };
    
    res.status(200).json(new ApiResponse(200, publicSettings, 'Public general settings fetched.'));
}));

// GET /api/settings/checkout
router.get('/settings/checkout', asyncHandler(async (req, res) => {
    const [paymentSettings, shippingSettings] = await Promise.all([
        Settings.findOne({ key: 'payment' }).lean(),
        Settings.findOne({ key: 'shipping' }).lean(),
    ]);

    const payVal = paymentSettings?.value || {};
    const shipVal = shippingSettings?.value || {};

    const publicSettings = {
        payment: {
            cod: payVal.codEnabled !== false,
            razorpay: payVal.cardEnabled !== false,
            wallet: payVal.walletEnabled !== false,
            upi: payVal.upiEnabled !== false,
        },
        shipping: {
            defaultShippingRate: shipVal.defaultShippingRate !== undefined ? Number(shipVal.defaultShippingRate) : 0,
            freeShippingThreshold: shipVal.freeShippingThreshold !== undefined ? Number(shipVal.freeShippingThreshold) : 0,
        }
    };

    res.status(200).json(new ApiResponse(200, publicSettings, 'Public checkout settings fetched.'));
}));

// GET /api/policies/:policyKey
router.get('/policies/:policyKey', asyncHandler(async (req, res) => {
    const { policyKey } = req.params;
    const doc = await PlatformPolicy.findOne().lean();

    let policy = null;
    if (policyKey === 'privacy' || policyKey === 'privacy-policy') {
        policy = doc?.privacy;
    } else if (policyKey === 'refund' || policyKey === 'refund-policy') {
        policy = doc?.refund;
    } else if (policyKey === 'terms' || policyKey === 'terms-conditions') {
        policy = doc?.terms;
    }

    if (!policy) {
        return res.status(404).json(new ApiResponse(404, null, 'Policy not found.'));
    }

    res.status(200).json(new ApiResponse(200, {
        title: policy.title,
        content: policy.content,
        lastUpdated: policy.lastUpdated
    }, 'Public policy fetched.'));
}));

router.get('/:id([a-fA-F0-9]{24})', detailCache, getProductDetail);

export default router;