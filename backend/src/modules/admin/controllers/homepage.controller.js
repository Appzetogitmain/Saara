import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import HomeSection from '../../../models/HomeSection.model.js';
import HomeBanner from '../../../models/HomeBanner.model.js';
import Product from '../../../models/Product.model.js';
import Category from '../../../models/Category.model.js';
import Banner from '../../../models/Banner.model.js';
import Order from '../../../models/Order.model.js';
import RecentlyViewed from '../../../models/RecentlyViewed.model.js';

// Helper to filter out active and in-stock products
const cleanProducts = (products = []) => {
    return products
        .map((p) => {
            if (!p) return null;
            return {
                ...p,
                id: String(p._id),
                _id: String(p._id),
            };
        })
        .filter((p) => p && p.isActive !== false);
};

// Helper to build dynamic mongoose query and fetch products for automatic rule builders
const queryRuleBuilderProducts = async (sec) => {
    const query = { isActive: true, stock: { $ne: 'out_of_stock' } };
    
    // Categories filter
    if (Array.isArray(sec.autoCategories) && sec.autoCategories.length > 0) {
        query.categoryId = { $in: sec.autoCategories };
    }
    
    // Brands filter
    if (Array.isArray(sec.autoBrands) && sec.autoBrands.length > 0) {
        query.brandId = { $in: sec.autoBrands };
    }
    
    // Minimum Discount % filter
    if (sec.autoMinDiscount > 0) {
        query.originalPrice = { $exists: true };
        query.$expr = {
            $gte: [
                {
                    $multiply: [
                        { $divide: [ { $subtract: ["$originalPrice", "$price"] }, "$originalPrice" ] },
                        100
                    ]
                },
                sec.autoMinDiscount
            ]
        };
    }

    // Sort mapping
    let sortObj = { createdAt: -1 };
    if (sec.autoSortBy === 'best_sellers') {
        sortObj = { reviewCount: -1 };
    } else if (sec.autoSortBy === 'top_rated') {
        sortObj = { rating: -1, reviewCount: -1 };
    } else if (sec.autoSortBy === 'new_arrivals' || sec.autoSortBy === 'latest') {
        sortObj = { createdAt: -1 };
    }

    const limit = sec.displayLimit || 10;

    const rawProducts = await Product.find(query)
        .sort(sortObj)
        .limit(limit)
        .populate('categoryId', 'name')
        .populate('brandId', 'name')
        .populate('vendorId', 'storeName')
        .lean();

    return cleanProducts(rawProducts);
};

// GET /api/homepage
export const getHomepage = asyncHandler(async (req, res) => {
    const now = new Date();

    // 1. Fetch hero banners, categories, featured products, and general fallback products
    const [banners, categoriesList, featuredProductsRaw, fallbackProductsRaw] = await Promise.all([
        Banner.find({ isActive: true, type: { $in: ['home_slider', 'hero'] } })
            .sort({ order: 1 })
            .lean(),
        Category.find({ isActive: true })
            .sort({ order: 1, name: 1 })
            .lean(),
        Product.find({ isActive: true })
            .sort({ reviewCount: -1, rating: -1 })
            .limit(10)
            .populate('categoryId', 'name')
            .populate('brandId', 'name')
            .populate('vendorId', 'storeName')
            .lean(),
        Product.find({ isActive: true })
            .limit(10)
            .populate('categoryId', 'name')
            .populate('brandId', 'name')
            .populate('vendorId', 'storeName')
            .lean(),
    ]);

    const heroBanners = banners.map((b) => ({
        ...b,
        id: String(b._id),
        _id: String(b._id),
    }));

    const categories = categoriesList.map((c) => ({
        ...c,
        id: String(c._id),
        _id: String(c._id),
    }));

    const featuredProducts = cleanProducts(featuredProductsRaw);
    const fallbackProducts = cleanProducts(fallbackProductsRaw);

    // 2. Fetch CMS-managed homepage sections
    const cmsSections = await HomeSection.find({ isActive: true })
        .populate({
            path: 'products',
            populate: [
                { path: 'categoryId', select: 'name' },
                { path: 'brandId', select: 'name' },
                { path: 'vendorId', select: 'storeName' }
            ]
        })
        .populate('categories', 'name slug')
        .populate('vendors', 'storeName name email logo rating reviewCount')
        .populate('bannerAsset')
        .sort({ order: 1 })
        .lean();

    // Filter by schedule
    const activeCmsSections = cmsSections.filter((section) => {
        const isStarted = !section.startDate || section.startDate <= now;
        const isEnded = section.endDate && section.endDate < now;
        return isStarted && !isEnded;
    });

    // 3. Resolve Public Automatic Sections (Best Sellers, Top Rated)
    
    // Best Sellers Aggregation
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

    // Fallback if not enough orders
    if (bestSellersRaw.length < 4) {
        bestSellersRaw = await Product.find({ isActive: true, stock: { $ne: 'out_of_stock' } })
            .sort({ reviewCount: -1 })
            .limit(10)
            .populate('categoryId', 'name')
            .populate('brandId', 'name')
            .populate('vendorId', 'storeName')
            .lean();
    }
    const bestSellers = cleanProducts(bestSellersRaw);

    // Top Rated Products
    const topRatedRaw = await Product.find({ isActive: true })
        .sort({ rating: -1, reviewCount: -1 })
        .limit(15)
        .populate('categoryId', 'name')
        .populate('brandId', 'name')
        .populate('vendorId', 'storeName')
        .lean();
    const topRated = cleanProducts(topRatedRaw);

    // 4. Construct unified sections array (CMS + public automatic)
    const sections = [];

    const resolvedCmsSections = await Promise.all(
        activeCmsSections.map(async (sec) => {
            let secProducts = [];
            
            if (sec.curationMode === 'automatic') {
                secProducts = await queryRuleBuilderProducts(sec);
            } else {
                secProducts = cleanProducts(sec.products || []);
            }

            // Fallback to general products if empty
            if (secProducts.length === 0) {
                secProducts = [...fallbackProducts];
            }

            // Resolve Banner Priority
            let resolvedBanner = null;
            
            // Priority 1: linked custom banner if active and scheduled
            if (sec.bannerAsset && sec.bannerAsset.isActive) {
                const bStarted = !sec.bannerAsset.startDate || sec.bannerAsset.startDate <= now;
                const bEnded = sec.bannerAsset.endDate && sec.bannerAsset.endDate < now;
                if (bStarted && !bEnded) {
                    resolvedBanner = sec.bannerAsset;
                }
            }

            // Priority 2: default banner for this section type
            if (!resolvedBanner) {
                const defaultBanner = await HomeBanner.findOne({
                    sectionType: sec.sectionType,
                    isDefault: true,
                    isActive: true
                }).lean();
                if (defaultBanner) {
                    resolvedBanner = defaultBanner;
                }
            }

            // Construct properties
            const bannerProps = resolvedBanner ? {
                banner: resolvedBanner.desktopImage,
                mobileBanner: resolvedBanner.mobileImage || resolvedBanner.desktopImage,
                bannerTitle: resolvedBanner.title || '',
                bannerSubtitle: resolvedBanner.subtitle || '',
                ctaText: resolvedBanner.ctaText || '',
                ctaLink: resolvedBanner.ctaLink || '',
                textColor: resolvedBanner.textColor || '#ffffff',
                buttonColor: resolvedBanner.buttonColor || '#ffffff',
                backgroundColor: sec.backgroundColor || '',
                gradient: sec.gradient || '',
                bannerBgColor: resolvedBanner.backgroundColor || '',
                bannerBgGradient: resolvedBanner.gradient || '',
                overlayOpacity: resolvedBanner.overlayOpacity ?? 0.3
            } : {
                banner: null,
                mobileBanner: null,
                bannerTitle: '',
                bannerSubtitle: '',
                ctaText: sec.ctaText || '',
                ctaLink: sec.ctaLink || '',
                textColor: '#1f2937', // default dark gray text for css visual card fallback
                buttonColor: '#4f46e5',
                backgroundColor: sec.backgroundColor || '',
                gradient: sec.gradient || '',
                bannerBgColor: '',
                bannerBgGradient: '',
                overlayOpacity: 0
            };

            // Fallback category spotlights if empty
            let secCategories = sec.categories || [];
            if (secCategories.length === 0 && sec.key === 'seasonal_collection') {
                secCategories = categories.slice(0, 5);
            }

            return {
                type: sec.key,
                order: sec.order || 0,
                priority: sec.priority || 0,
                layout: sec.layout || 'horizontal',
                minimumProducts: sec.minimumProducts ?? 4,
                title: sec.title || '',
                subtitle: sec.subtitle || '',
                ...bannerProps,
                countdownDate: sec.countdownDate || null,
                categories: secCategories,
                vendors: sec.vendors || [],
                version: sec.version || 1,
                data: secProducts.slice(0, sec.displayLimit || 10),
            };
        })
    );

    // Push CMS resolved sections
    sections.push(...resolvedCmsSections);

    // Add Best Sellers
    sections.push({
        type: 'best_sellers',
        order: 10,
        layout: 'horizontal',
        minimumProducts: 4,
        title: 'Best Sellers',
        subtitle: 'Our most popular products based on sales',
        data: bestSellers,
    });

    // Add Top Rated
    sections.push({
        type: 'top_rated',
        order: 12,
        layout: 'horizontal',
        minimumProducts: 4,
        title: 'Top Rated',
        subtitle: 'Highest rated products by customer reviews',
        data: topRated,
    });

    // Sort all sections dynamically by order/priority
    sections.sort((a, b) => a.order - b.order || b.priority - a.priority);

    res.status(200).json({
        success: true,
        generatedAt: now.toISOString(),
        heroBanners,
        categories,
        featuredProducts,
        sections,
    });
});

// GET /api/user/homepage
export const getUserHomepage = asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const now = new Date();

    const historyList = await RecentlyViewed.find({ userId })
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
        .limit(20)
        .lean();

    const recentlyViewed = cleanProducts(historyList.map((item) => item.productId));

    const sections = [
        {
            type: 'recently_viewed',
            order: 8,
            layout: 'horizontal',
            minimumProducts: 1,
            title: 'Recently Viewed',
            subtitle: 'Pick up where you left off',
            data: recentlyViewed,
        }
    ];

    res.status(200).json({
        success: true,
        generatedAt: now.toISOString(),
        sections,
    });
});
