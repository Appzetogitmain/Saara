import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import { VendorStore } from '../../../models/VendorStore.model.js';
import { StorePage } from '../../../models/StorePage.model.js';
import { StoreCollection } from '../../../models/StoreCollection.model.js';
import { StoreMenu } from '../../../models/StoreMenu.model.js';
import { MediaAsset } from '../../../models/MediaAsset.model.js';
import Product from '../../../models/Product.model.js';
import Vendor from '../../../models/Vendor.model.js';
import Category from '../../../models/Category.model.js';
import Brand from '../../../models/Brand.model.js';
import { slugify } from '../../../utils/slugify.js';
import { RESERVED_SLUGS } from '../../../../../frontend/src/shared/constants/reservedSlugs.js';
import mongoose from 'mongoose';
import { createNotification } from '../../../services/notification.service.js';
import { StoreInquiry } from '../../../models/StoreInquiry.model.js';

// Helper to sanitize vendor product properties for rendering
const sanitizeProducts = (products = []) => {
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

// Helper to parse condition rule groups and evaluate queries on MongoDB
const fetchProductsByRuleGroups = async (ruleGroups = [], vendorId, limit = 10) => {
    const query = { vendorId, isActive: true };
    const groupQueries = [];

    for (const group of ruleGroups) {
        const conditionsList = [];
        for (const cond of group.conditions || []) {
            let term = {};
            if (cond.field === 'category') {
                term.categoryId = cond.value;
            } else if (cond.field === 'brand') {
                term.brandId = cond.value;
            } else if (cond.field === 'price') {
                const valNum = Number(cond.value);
                if (cond.operator === 'greater_than') term.price = { $gt: valNum };
                else if (cond.operator === 'less_than') term.price = { $lt: valNum };
                else term.price = valNum;
            } else if (cond.field === 'discount') {
                const valNum = Number(cond.value);
                term.originalPrice = { $exists: true };
                term.$expr = {
                    $gte: [
                        { $multiply: [ { $divide: [ { $subtract: ["$originalPrice", "$price"] }, "$originalPrice" ] }, 100 ] },
                        valNum
                    ]
                };
            } else if (cond.field === 'rating') {
                term.rating = { $gte: Number(cond.value) };
            } else if (cond.field === 'tag') {
                term.tags = cond.value;
            }
            conditionsList.push(term);
        }

        if (conditionsList.length > 0) {
            if (group.match === 'any') {
                groupQueries.push({ $or: conditionsList });
            } else {
                groupQueries.push({ $and: conditionsList });
            }
        }
    }

    if (groupQueries.length > 0) {
        query.$and = groupQueries;
    }

    const rawProducts = await Product.find(query)
        .limit(limit)
        .populate('categoryId', 'name')
        .populate('brandId', 'name')
        .populate('vendorId', 'storeName storeLogo rating')
        .lean();

    return sanitizeProducts(rawProducts);
};

// Helper to resolve and populate sections of a CMS Page (Draft or Published)
const resolvePageSections = async (sections = [], vendorId, mode = 'published') => {
    const resolved = [];

    for (const sec of sections) {
        if (!sec.enabled) continue;

        let data = [];

        if (sec.sectionType === 'Collection' && sec.collectionId) {
            const col = await StoreCollection.findOne({ _id: sec.collectionId, enabled: true }).lean();
            if (col) {
                if (col.curationMode === 'automatic') {
                    data = await fetchProductsByRuleGroups(col.ruleGroups || [], vendorId, sec.displayLimit || 10);
                } else if (Array.isArray(col.products) && col.products.length > 0) {
                    const rawProducts = await Product.find({ _id: { $in: col.products }, isActive: true })
                        .limit(sec.displayLimit || 10)
                        .populate('categoryId', 'name')
                        .populate('brandId', 'name')
                        .populate('vendorId', 'storeName storeLogo rating')
                        .lean();
                    data = sanitizeProducts(rawProducts);
                }
            }
        } else if (['Product Carousel', 'Product Grid'].includes(sec.sectionType)) {
            if (sec.curationMode === 'automatic') {
                // Map auto filters into ruleGroups representation
                const legacyRuleGroup = [{
                    match: 'all',
                    conditions: [
                        sec.autoCategories?.length > 0 && { field: 'category', operator: 'equals', value: String(sec.autoCategories[0]) },
                        sec.autoBrands?.length > 0 && { field: 'brand', operator: 'equals', value: String(sec.autoBrands[0]) },
                        sec.autoMinDiscount > 0 && { field: 'discount', operator: 'greater_than', value: String(sec.autoMinDiscount) }
                    ].filter(Boolean)
                }];
                data = await fetchProductsByRuleGroups(legacyRuleGroup, vendorId, sec.displayLimit || 10);
            } else if (Array.isArray(sec.products) && sec.products.length > 0) {
                const rawProducts = await Product.find({ _id: { $in: sec.products }, isActive: true })
                    .limit(sec.displayLimit || 10)
                    .populate('categoryId', 'name')
                    .populate('brandId', 'name')
                    .populate('vendorId', 'storeName storeLogo rating')
                    .lean();
                data = sanitizeProducts(rawProducts);
            }
        } else if (sec.sectionType === 'Category Grid' && Array.isArray(sec.categories) && sec.categories.length > 0) {
            const Product = mongoose.models.Product || mongoose.model('Product');
            const activeCategoryIds = await Product.find({ vendorId, isActive: true }).distinct('categoryId');
            const activeCategoryStrIds = activeCategoryIds.map(String);

            // Filter out any categories that do not contain products from this vendor
            const allowedCategoryIds = sec.categories.filter(id => activeCategoryStrIds.includes(String(id)));

            const cats = await Category.find({ _id: { $in: allowedCategoryIds }, isActive: true }).select('name slug image').lean();
            data = cats.map(c => ({ ...c, id: String(c._id) }));
        }

        let mediaDetails = null;
        if (sec.bannerAsset) {
            mediaDetails = await MediaAsset.findOne({ _id: sec.bannerAsset, isActive: true }).lean();
        }

        resolved.push({
            _id: String(sec._id),
            sectionType: sec.sectionType,
            title: sec.title,
            subtitle: sec.subtitle,
            layout: sec.layout,
            banner: mediaDetails,
            bannerUrl: sec.bannerUrl,
            ctaText: sec.ctaText,
            ctaLink: sec.ctaLink,
            visibility: sec.visibility,
            order: sec.order,
            data
        });
    }

    return resolved;
};

// ─── PUBLIC ENDPOINTS ──────────────────────────────────────────────────────────

// GET /api/store/:slug
// GET /api/store/:slug/page/:pageKey
export const getPublicStorefront = asyncHandler(async (req, res) => {
    const { slug } = req.params;
    let pageKey = req.params.pageKey || req.query.pageKey || 'home';
    if (pageKey === 'offer') pageKey = 'offers';
    const previewMode = req.query.preview === 'true'; // allows draft previewing inside builder

    const store = await VendorStore.findOne({ slug, isActive: true })
        .populate('vendorId', 'storeName storeLogo rating reviewCount isVerified joinDate')
        .populate('featuredCategories.category', 'name slug image')
        .lean();

    if (!store) {
        throw new ApiError(404, 'Storefront not found.');
    }

    // Fetch CMS page (fetching drafts or published depending on parameters)
    const page = await StorePage.findOne({
        ownerId: store.vendorId._id,
        ownerType: 'vendor',
        pageKey,
        isActive: true
    }).lean();

    let resolvedSections = [];
    if (page) {
        const sectionsToResolve = previewMode ? page.sections : page.publishedSections;
        resolvedSections = await resolvePageSections(sectionsToResolve || [], store.vendorId._id, previewMode ? 'draft' : 'published');
    }

    const isPlaceholderOnly = resolvedSections.length === 1 && 
        resolvedSections[0].sectionType === 'Text Block' && 
        String(resolvedSections[0].title).startsWith('Welcome to');

    if ((resolvedSections.length === 0 || isPlaceholderOnly) && pageKey === 'home') {
        const latestProducts = await Product.find({ vendorId: store.vendorId._id, isActive: true })
            .sort({ createdAt: -1 })
            .limit(8)
            .populate('categoryId', 'name')
            .populate('brandId', 'name')
            .populate('vendorId', 'storeName storeLogo rating')
            .lean();

        const vendorProductCategoryIds = await Product.find({ vendorId: store.vendorId._id, isActive: true })
            .distinct('categoryId');
        const categories = await Category.find({ _id: { $in: vendorProductCategoryIds }, isActive: true })
            .select('name slug image')
            .limit(8)
            .lean();

        const bestSellerProducts = await Product.find({ vendorId: store.vendorId._id, isActive: true })
            .sort({ reviewCount: -1, rating: -1 })
            .limit(8)
            .populate('categoryId', 'name')
            .populate('brandId', 'name')
            .populate('vendorId', 'storeName storeLogo rating')
            .lean();

        const allProducts = await Product.find({ vendorId: store.vendorId._id, isActive: true })
            .sort({ createdAt: -1 })
            .limit(20)
            .populate('categoryId', 'name')
            .populate('brandId', 'name')
            .populate('vendorId', 'storeName storeLogo rating')
            .lean();

        resolvedSections = [
            {
                _id: 'auto-featured',
                sectionType: 'Product Grid',
                title: 'Featured Products',
                subtitle: 'Handpicked items selected for you.',
                order: 1,
                visibility: { desktop: true, tablet: true, mobile: true },
                data: sanitizeProducts(latestProducts),
                enabled: true
            },
            categories.length > 0 && {
                _id: 'auto-categories',
                sectionType: 'Category Grid',
                title: 'Shop by Category',
                subtitle: 'Browse through our product categories.',
                order: 2,
                visibility: { desktop: true, tablet: true, mobile: true },
                data: categories.map(c => ({ ...c, id: String(c._id) })),
                enabled: true
            },
            {
                _id: 'auto-new-arrivals',
                sectionType: 'Product Carousel',
                title: 'New Arrivals',
                subtitle: 'Check out our freshest drops.',
                order: 3,
                visibility: { desktop: true, tablet: true, mobile: true },
                data: sanitizeProducts(latestProducts),
                enabled: true
            },
            {
                _id: 'auto-best-sellers',
                sectionType: 'Product Carousel',
                title: 'Best Sellers',
                subtitle: 'Most popular customer favorites.',
                order: 4,
                visibility: { desktop: true, tablet: true, mobile: true },
                data: sanitizeProducts(bestSellerProducts),
                enabled: true
            },
            {
                _id: 'auto-all-products',
                sectionType: 'Product Grid',
                title: 'All Products',
                subtitle: 'View our entire catalog collection.',
                order: 5,
                visibility: { desktop: true, tablet: true, mobile: true },
                data: sanitizeProducts(allProducts),
                enabled: true
            }
        ].filter(Boolean);
    }

    // Fetch store collections list
    const collections = await StoreCollection.find({ storeId: store._id, enabled: true })
        .select('name slug image curationMode')
        .sort({ order: 1 })
        .lean();

    // Fetch dynamic storefront menus
    const storeMenus = await StoreMenu.find({ storeId: store._id }).lean();
    const headerMenu = storeMenus.find(m => m.menuType === 'header');

    // Compute live store statistics
    let stats = {
        productsCount: 0,
        ordersCompleted: 0,
        rating: 4.8,
        yearsInBusiness: 1
    };

    try {
        const vendorId = store.vendorId?._id || store.vendorId;
        const productsCount = await Product.countDocuments({ vendorId, isActive: true });
        
        const OrderModel = mongoose.models.Order || mongoose.model('Order');
        const dbOrders = await OrderModel.countDocuments({ vendorId, status: 'delivered' }) || 0;
        
        const establishedYear = store.businessInfo?.establishedYear || 2025;
        const yearsInBusiness = Math.max(1, new Date().getFullYear() - establishedYear);

        stats = {
            productsCount,
            ordersCompleted: dbOrders,
            rating: store.rating || 4.8,

            yearsInBusiness
        };
    } catch (e) {
        console.error("Error computing store statistics:", e);
    }

    res.status(200).json(new ApiResponse(200, {
        store: {
            ...store,
            id: String(store._id),
            _id: String(store._id)
        },
        page: page ? {
            pageKey: page.pageKey,
            layout: page.layout,
            pageSettings: page.pageSettings,
            sections: resolvedSections,
            status: page.status,
            publishVersion: page.publishVersion
        } : {
            pageKey,
            layout: { type: 'fullWidth' },
            pageSettings: { title: pageKey.charAt(0).toUpperCase() + pageKey.slice(1) },
            sections: resolvedSections
        },
        collections: collections.map(c => ({ ...c, id: String(c._id) })),
        theme: store.theme,
        navigation: headerMenu?.items || store.navigation || [],
        stats
    }, 'Public storefront loaded successfully.'));
});

// GET /api/store/:slug/products (Default catalog list)
export const getStorefrontProducts = asyncHandler(async (req, res) => {
    const { slug } = req.params;
    const { page = 1, limit = 20, sort = 'newest' } = req.query;

    const store = await VendorStore.findOne({ slug, isActive: true }).lean();
    if (!store) throw new ApiError(404, 'Storefront not found.');

    const numPage = Math.max(Number(page) || 1, 1);
    const numLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const skip = (numPage - 1) * numLimit;

    const filter = { vendorId: store.vendorId, isActive: true };

    const sortMap = {
        newest: { createdAt: -1 },
        oldest: { createdAt: 1 },
        'price-asc': { price: 1 },
        'price-desc': { price: -1 },
        popular: { reviewCount: -1 }
    };

    const [products, total] = await Promise.all([
        Product.find(filter)
            .select('name slug price originalPrice images image categoryId brandId vendorId stock stockQuantity rating reviewCount isNewArrival')
            .populate('categoryId', 'name')
            .populate('brandId', 'name')
            .sort(sortMap[sort] || { createdAt: -1 })
            .skip(skip)
            .limit(numLimit)
            .lean(),
        Product.countDocuments(filter)
    ]);

    res.status(200).json(new ApiResponse(200, {
        products: sanitizeProducts(products),
        page: numPage,
        pages: Math.ceil(total / numLimit),
        totalProducts: total
    }, 'Catalog products loaded.'));
});

// GET /api/store/:slug/search (Advanced filtered search)
export const searchStorefrontProducts = asyncHandler(async (req, res) => {
    const { slug } = req.params;
    const {
        q,
        category,
        priceMin,
        priceMax,
        rating,
        discount,
        sort = 'newest',
        page = 1,
        limit = 20
    } = req.query;

    const store = await VendorStore.findOne({ slug, isActive: true }).lean();
    if (!store) throw new ApiError(404, 'Storefront not found.');

    const numPage = Math.max(Number(page) || 1, 1);
    const numLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const skip = (numPage - 1) * numLimit;

    const filter = { vendorId: store.vendorId, isActive: true };

    // Search query q
    if (q) {
        const queryText = String(q).trim();
        filter.$or = [
            { name: { $regex: queryText, $options: 'i' } },
            { sku: { $regex: queryText, $options: 'i' } },
            { tags: { $regex: queryText, $options: 'i' } }
        ];
    }

    // Category filter
    if (category) {
        let catDoc = mongoose.isValidObjectId(category)
            ? await Category.findById(category).lean()
            : await Category.findOne({ slug: category }).lean();
        if (catDoc) filter.categoryId = catDoc._id;
    }

    // Price filters
    if (priceMin || priceMax) {
        filter.price = {};
        if (priceMin) filter.price.$gte = Number(priceMin);
        if (priceMax) filter.price.$lte = Number(priceMax);
    }

    // Rating filter
    if (rating) {
        filter.rating = { $gte: Number(rating) };
    }

    // Discount filter
    if (discount) {
        filter.originalPrice = { $exists: true, $gt: 0 };
        filter.$expr = {
            $gte: [
                { $multiply: [ { $divide: [ { $subtract: ["$originalPrice", "$price"] }, "$originalPrice" ] }, 100 ] },
                Number(discount)
            ]
        };
    }

    const sortMap = {
        newest: { createdAt: -1 },
        'price-asc': { price: 1 },
        'price-desc': { price: -1 },
        rating: { rating: -1 }
    };

    const [products, total] = await Promise.all([
        Product.find(filter)
            .select('name slug price originalPrice images image categoryId brandId vendorId rating reviewCount')
            .populate('categoryId', 'name')
            .populate('brandId', 'name')
            .sort(sortMap[sort] || { createdAt: -1 })
            .skip(skip)
            .limit(numLimit)
            .lean(),
        Product.countDocuments(filter)
    ]);

    res.status(200).json(new ApiResponse(200, {
        products: sanitizeProducts(products),
        page: numPage,
        pages: Math.ceil(total / numLimit),
        totalProducts: total
    }, 'Store search results fetched.'));
});

// GET /api/store/:slug/about
export const getStorefrontAbout = asyncHandler(async (req, res) => {
    const { slug } = req.params;

    const store = await VendorStore.findOne({ slug, isActive: true })
        .populate('vendorId', 'storeDescription phone email rating reviewCount joinDate')
        .lean();

    if (!store) throw new ApiError(404, 'Storefront not found.');

    res.status(200).json(new ApiResponse(200, {
        storeName: store.storeName,
        logo: store.logo,
        coverBanner: store.coverBanner,
        verified: store.verified,
        description: store.description || store.vendorId?.storeDescription || '',
        contact: store.contact,
        rating: store.vendorId?.rating || 0,
        reviewCount: store.vendorId?.reviewCount || 0
    }, 'Store details fetched.'));
});

// POST /api/store/:slug/contact
export const createStorefrontInquiry = asyncHandler(async (req, res) => {
    const { slug } = req.params;
    const { name, email, message } = req.body;

    const store = await VendorStore.findOne({ slug, isActive: true });
    if (!store) {
        throw new ApiError(404, 'Storefront not found.');
    }

    let customerId = null;
    let customerName = name || (req.user?.name || '');
    let customerEmail = email || (req.user?.email || '');

    // Logged-in user profile mapping for database reference
    if (req.user) {
        customerId = req.user.id;
    }

    if (!customerName || !customerEmail || !message) {
        throw new ApiError(400, 'Please provide name, email, and message details.');
    }

    // Rate-limiting spam protection: Max 5 inquiries per hour per email/store combination
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentCount = await StoreInquiry.countDocuments({
        storeId: store._id,
        customerEmail: customerEmail.toLowerCase(),
        createdAt: { $gte: oneHourAgo }
    });

    if (recentCount >= 5) {
        throw new ApiError(429, 'Too many inquiries submitted. Maximum 5 per hour. Please try again later.');
    }

    const inquiry = await StoreInquiry.create({
        storeId: store._id,
        vendorId: store.vendorId,
        customerId,
        customerName,
        customerEmail: customerEmail.toLowerCase(),
        subject: 'Storefront Inquiry',
        message,
        status: 'new',
        isRead: false,
        lastActivityAt: new Date()
    });

    // Broadcast real-time system notification to vendor
    await createNotification({
        recipientId: store.vendorId,
        recipientType: 'vendor',
        title: '🔔 New Storefront Inquiry',
        message: `${customerName} sent you a new inquiry.`,
        type: 'store_inquiry',
        data: { inquiryId: String(inquiry._id), module: "store-builder" }
    }).catch(err => console.error("Failed to trigger storefront inquiry notification:", err));

    res.status(201).json(new ApiResponse(201, inquiry, 'Your inquiry has been sent successfully. The store owner will reply to your email shortly.'));
});

// ─── VENDOR PANEL MANAGEMENT ENDPOINTS ───────────────────────────────────────

// GET /api/vendor/store
export const getVendorStorefront = asyncHandler(async (req, res) => {
    const vendorId = req.user.id;

    let store = await VendorStore.findOne({ vendorId })
        .populate('featuredCategories.category', 'name slug image')
        .lean();

    if (!store) {
        const vendor = await Vendor.findById(vendorId);
        if (!vendor) throw new ApiError(404, 'Vendor not found.');

        let baseSlug = slugify(vendor.storeName || vendor.name || 'store');
        let uniqueSlug = baseSlug;
        let suffix = 1;
        while (await VendorStore.exists({ slug: uniqueSlug })) {
            uniqueSlug = `${baseSlug}-${suffix}`;
            suffix += 1;
        }

        store = await VendorStore.create({
            vendorId,
            storeName: vendor.storeName || vendor.name,
            slug: uniqueSlug,
            description: vendor.storeDescription || '',
            logo: vendor.storeLogo || '',
            verified: vendor.isVerified || false,
            navigation: [
                { title: 'Home', iconName: 'FiHome', target: { type: 'page', targetValue: 'home' }, order: 1, enabled: true },
                { title: 'About', iconName: 'FiInfo', target: { type: 'custom', targetValue: '/about' }, order: 2, enabled: true }
            ]
        });

        vendor.storefrontId = store._id;
        await vendor.save();

        await StorePage.create({
            ownerId: vendorId,
            ownerType: 'vendor',
            pageType: 'home',
            pageKey: 'home',
            slug: 'home',
            title: 'Home Page',
            pageSettings: { title: 'Home Page', enabled: true },
            sections: [
                {
                    sectionType: 'Text Block',
                    title: `Welcome to ${store.storeName}`,
                    subtitle: 'Designing high-quality collections for our marketplace.',
                    order: 1,
                    enabled: true
                }
            ],
            publishedSections: [
                {
                    sectionType: 'Text Block',
                    title: `Welcome to ${store.storeName}`,
                    subtitle: 'Designing high-quality collections for our marketplace.',
                    order: 1,
                    enabled: true
                }
            ],
            status: 'published',
            publishVersion: 1
        });
    }

    const Product = mongoose.models.Product || mongoose.model('Product');
    const activeCategoryIds = await Product.find({ vendorId, isActive: true }).distinct('categoryId');
    const responseData = {
        ...store,
        activeCategoryIds: activeCategoryIds.map(String)
    };

    res.status(200).json(new ApiResponse(200, responseData, 'Vendor store details.'));
});

// PUT /api/vendor/store
export const updateVendorStorefront = asyncHandler(async (req, res) => {
    const vendorId = req.user.id;
    const payload = req.body;

    const store = await VendorStore.findOne({ vendorId });
    if (!store) throw new ApiError(404, 'Store settings not found.');

    if (payload.slug && payload.slug !== store.slug) {
        const cleanSlug = slugify(payload.slug);
        const exists = await VendorStore.exists({ slug: cleanSlug, _id: { $ne: store._id } });
        if (exists) throw new ApiError(400, 'Slug is already in use.');
        store.slug = cleanSlug;
    }

    if (payload.storeName) store.storeName = payload.storeName;
    if (typeof payload.description !== 'undefined') store.description = payload.description;
    if (typeof payload.logo !== 'undefined') store.logo = payload.logo;
    if (typeof payload.coverBanner !== 'undefined') store.coverBanner = payload.coverBanner;
    if (payload.theme) store.theme = payload.theme;
    if (payload.navigation) store.navigation = payload.navigation;
    if (payload.contact) store.contact = payload.contact;
    if (payload.settings) store.settings = payload.settings;
    if (payload.socialLinks) store.socialLinks = payload.socialLinks;
    if (payload.businessInfo) store.businessInfo = payload.businessInfo;
    if (payload.seo) store.seo = payload.seo;
    if (payload.status) store.status = payload.status;

    await store.save();

    await Vendor.findByIdAndUpdate(vendorId, {
        storeName: store.storeName,
        storeLogo: store.logo,
        storeDescription: store.description
    });

    const Product = mongoose.models.Product || mongoose.model('Product');
    const activeCategoryIds = await Product.find({ vendorId, isActive: true }).distinct('categoryId');
    const responseData = {
        ...store.toObject(),
        activeCategoryIds: activeCategoryIds.map(String)
    };

    res.status(200).json(new ApiResponse(200, responseData, 'Storefront settings updated successfully.'));
});

// GET /api/vendor/store/menus
export const getVendorStoreMenus = asyncHandler(async (req, res) => {
    const vendorId = req.user.id;
    const store = await VendorStore.findOne({ vendorId }).lean();
    if (!store) throw new ApiError(404, 'Store settings not found.');

    // Ensure default menus exist
    let headerMenu = await StoreMenu.findOne({ storeId: store._id, menuType: 'header' });
    if (!headerMenu) {
        headerMenu = await StoreMenu.create({
            storeId: store._id,
            menuType: 'header',
            items: store.navigation && store.navigation.length > 0 ? store.navigation.map((n, i) => ({
                label: n.title,
                iconName: n.iconName || '',
                sortOrder: i,
                destination: {
                    type: n.target?.type || 'page',
                    path: n.target?.path || n.target?.slug || n.target?.targetValue || ''
                }
            })) : [
                { label: 'Home', iconName: '🏠', sortOrder: 0, destination: { type: 'page', path: 'home' } },
                { label: 'About', iconName: 'ℹ️', sortOrder: 1, destination: { type: 'page', path: 'about' } }
            ]
        });
    }

    let footerMenu = await StoreMenu.findOne({ storeId: store._id, menuType: 'footer' });
    if (!footerMenu) {
        footerMenu = await StoreMenu.create({
            storeId: store._id,
            menuType: 'footer',
            items: [
                { label: 'Privacy Policy', iconName: '🔒', sortOrder: 0, destination: { type: 'page', path: 'privacy-policy' } },
                { label: 'Terms of Service', iconName: '📋', sortOrder: 1, destination: { type: 'page', path: 'terms-of-service' } }
            ]
        });
    }

    const menus = await StoreMenu.find({ storeId: store._id }).lean();
    res.status(200).json(new ApiResponse(200, menus, 'Store menus fetched successfully.'));
});

// PUT /api/vendor/store/menus/:menuType
export const updateVendorStoreMenu = asyncHandler(async (req, res) => {
    const vendorId = req.user.id;
    const { menuType } = req.params;
    const { items } = req.body;

    const store = await VendorStore.findOne({ vendorId }).lean();
    if (!store) throw new ApiError(404, 'Store settings not found.');

    let menu = await StoreMenu.findOne({ storeId: store._id, menuType });
    if (!menu) {
        menu = new StoreMenu({
            storeId: store._id,
            menuType
        });
    }

    if (items && Array.isArray(items)) {
        menu.items = items.map((item, idx) => {
            const mappedItem = {
                label: item.label,
                iconName: item.iconName || '',
                sortOrder: item.sortOrder || idx,
                destination: {
                    type: item.destination?.type || 'page',
                    path: item.destination?.path || ''
                }
            };
            if (item.destination?.destinationId) {
                mappedItem.destination.destinationId = item.destination.destinationId;
            }
            return mappedItem;
        });
    }

    await menu.save();
    res.status(200).json(new ApiResponse(200, menu, `Store ${menuType} menu updated successfully.`));
});

// DELETE /api/vendor/store/pages/:pageKey
export const deleteVendorStorefrontPage = asyncHandler(async (req, res) => {
    const vendorId = req.user.id;
    const { pageKey } = req.params;

    if (['home', 'about', 'offers'].includes(pageKey)) {
        throw new ApiError(400, 'This core system page cannot be deleted.');
    }

    const result = await StorePage.findOneAndDelete({
        ownerId: vendorId,
        ownerType: 'vendor',
        pageKey
    });

    if (!result) {
        throw new ApiError(404, 'Page not found.');
    }

    res.status(200).json(new ApiResponse(200, null, 'Page deleted successfully.'));
});

// POST /api/vendor/store/pages/:pageKey/publish (Publish layout drafts)
export const publishVendorPage = asyncHandler(async (req, res) => {
    const vendorId = req.user.id;
    const { pageKey } = req.params;

    let page = await StorePage.findOne({
        ownerId: vendorId,
        ownerType: 'vendor',
        pageKey
    });

    if (page) {
        if (!page.title) page.title = page.pageKey.toUpperCase();
        if (!page.slug) page.slug = page.pageKey;
        if (!page.pageType || page.pageType === 'storefront') {
            page.pageType = page.pageKey === 'home' ? 'home' : 'standard';
        }
    } else {
        page = await StorePage.create({
            ownerId: vendorId,
            ownerType: 'vendor',
            pageType: pageKey === 'home' ? 'home' : 'standard',
            pageKey,
            slug: pageKey,
            title: pageKey.toUpperCase(),
            pageSettings: {
                title: pageKey.toUpperCase(),
                enabled: true
            },
            sections: [],
            publishedSections: [],
            status: 'draft',
            publishVersion: 0
        });
    }

    page.publishedSections = page.sections; // Publish draft
    page.status = 'published';
    page.publishVersion += 1;
    page.publishedAt = new Date();
    page.publishedBy = vendorId;

    try {
        await page.save();
    } catch (err) {
        console.error("PUBLISH PAGE FAILED:", err);
        throw new ApiError(400, `Validation failed: ${err.message}`);
    }

    res.status(200).json(new ApiResponse(200, page, 'Page layout published successfully.'));
});

// GET /api/vendor/store/analytics
export const getVendorStorefrontAnalytics = asyncHandler(async (req, res) => {
    res.status(200).json(new ApiResponse(200, {
        summary: {
            visitors: 0,
            pageViews: 0,
            orders: 0,
            conversionRate: 0
        },
        topProducts: [],
        topSearches: [],
        trafficSources: []
    }, 'Store analytics fetched.'));
});

// GET /api/vendor/store/pages
export const getVendorStorefrontPages = asyncHandler(async (req, res) => {
    const vendorId = req.user.id;
    
    // Ensure default storefront pages exist (home and offers)
    const defaultPageKeys = ['home', 'offers'];
    for (const key of defaultPageKeys) {
        const exists = await StorePage.exists({ ownerId: vendorId, ownerType: 'vendor', pageKey: key });
        if (!exists) {
            await StorePage.create({
                ownerId: vendorId,
                ownerType: 'vendor',
                pageType: key === 'home' ? 'home' : 'standard',
                pageKey: key,
                slug: key,
                title: key.toUpperCase(),
                pageSettings: {
                    title: key.toUpperCase(),
                    enabled: true
                },
                sections: [],
                publishedSections: [],
                status: 'draft',
                publishVersion: 0
            });
        }
    }

    const pages = await StorePage.find({ 
        ownerId: vendorId, 
        ownerType: 'vendor',
        pageKey: { $nin: ['about'] }
    }).lean();
    res.status(200).json(new ApiResponse(200, pages, 'Storefront pages fetched.'));
});

// PUT /api/vendor/store/pages/:pageKey
export const saveVendorStorefrontPage = asyncHandler(async (req, res) => {
    const vendorId = req.user.id;
    const { pageKey } = req.params;


    const { pageSettings, layout, sections } = req.body;
    if (pageKey.toLowerCase() !== "home" && RESERVED_SLUGS.includes(pageKey.toLowerCase())) {
        throw new ApiError(400, `The slug "${pageKey}" is reserved for system use.`);
    }

    let page = await StorePage.findOne({
        ownerId: vendorId,
        ownerType: 'vendor',
        pageKey
    });

    if (page) {
        if (!page.title) page.title = page.pageKey.toUpperCase();
        if (!page.slug) page.slug = page.pageKey;
        if (!page.pageType || page.pageType === 'storefront') {
            page.pageType = page.pageKey === 'home' ? 'home' : 'standard';
        }
    } else {
        page = new StorePage({
            ownerId: vendorId,
            ownerType: 'vendor',
            pageType: pageKey === 'home' ? 'home' : 'standard',
            pageKey,
            slug: pageKey,
            title: pageSettings?.title || pageKey.toUpperCase()
        });
    }

    if (pageSettings) {
        if (pageSettings.title !== undefined) {
            page.title = pageSettings.title;
        }
        if (pageSettings.enabled !== undefined) {
            page.enabled = pageSettings.enabled;
        }
    }
    if (layout) page.layout = layout;
    if (sections && Array.isArray(sections)) {
        page.sections = sections.map(sec => {
            const sanitized = { ...sec };
            if (sanitized._id && (!/^[0-9a-fA-F]{24}$/.test(String(sanitized._id)))) {
                delete sanitized._id;
            }
            return sanitized;
        });
    } else if (sections) {
        page.sections = sections;
    }
    page.status = 'draft';

    try {
        await page.save();
    } catch (err) {
        console.error("SAVE PAGE DRAFT FAILED:", err);
        throw new ApiError(400, `Validation failed: ${err.message}`);
    }

    res.status(200).json(new ApiResponse(200, page, 'Storefront page saved as draft successfully.'));
});

// GET /api/vendor/store/collections
export const getVendorCollections = asyncHandler(async (req, res) => {
    const vendorId = req.user.id;
    const store = await VendorStore.findOne({ vendorId }).lean();
    if (!store) throw new ApiError(404, 'Storefront not found.');

    const collections = await StoreCollection.find({ storeId: store._id })
        .sort({ order: 1 })
        .lean();

    res.status(200).json(new ApiResponse(200, collections.map(c => ({ ...c, id: String(c._id) })), 'Collections loaded.'));
});

// POST /api/vendor/store/collections
export const createVendorCollection = asyncHandler(async (req, res) => {
    const vendorId = req.user.id;
    const { name, curationMode, ruleGroups, products, image } = req.body;

    const store = await VendorStore.findOne({ vendorId }).lean();
    if (!store) throw new ApiError(404, 'Storefront not found.');

    const slug = slugify(name || 'New Collection');
    const col = new StoreCollection({
        storeId: store._id,
        name: name || 'New Collection',
        slug,
        curationMode: curationMode || 'manual',
        ruleGroups: ruleGroups || [],
        products: products || [],
        image: image || '',
        enabled: true
    });

    await col.save();
    res.status(201).json(new ApiResponse(201, { ...col.toObject(), id: String(col._id) }, 'Collection created successfully.'));
});

// PUT /api/vendor/store/collections/:collectionId
export const updateVendorCollection = asyncHandler(async (req, res) => {
    const vendorId = req.user.id;
    const { collectionId } = req.params;
    const { name, curationMode, ruleGroups, products, image, enabled, order } = req.body;

    const store = await VendorStore.findOne({ vendorId }).lean();
    if (!store) throw new ApiError(404, 'Storefront not found.');

    const col = await StoreCollection.findOne({ _id: collectionId, storeId: store._id });
    if (!col) throw new ApiError(404, 'Collection not found.');

    if (name) {
        col.name = name;
        col.slug = slugify(name);
    }
    if (curationMode) col.curationMode = curationMode;
    if (ruleGroups) col.ruleGroups = ruleGroups;
    if (products) col.products = products;
    if (image !== undefined) col.image = image;
    if (enabled !== undefined) col.enabled = enabled;
    if (order !== undefined) col.order = order;

    await col.save();
    res.status(200).json(new ApiResponse(200, { ...col.toObject(), id: String(col._id) }, 'Collection updated successfully.'));
});

// DELETE /api/vendor/store/collections/:collectionId
export const deleteVendorCollection = asyncHandler(async (req, res) => {
    const vendorId = req.user.id;
    const { collectionId } = req.params;

    const store = await VendorStore.findOne({ vendorId }).lean();
    if (!store) throw new ApiError(404, 'Storefront not found.');

    const col = await StoreCollection.findOneAndDelete({ _id: collectionId, storeId: store._id });
    if (!col) throw new ApiError(404, 'Collection not found.');

    res.status(200).json(new ApiResponse(200, null, 'Collection deleted successfully.'));
});

// GET /api/vendor/store/inquiries
export const getVendorInquiries = asyncHandler(async (req, res) => {
    const vendorId = req.user.id;
    const { status, unread, search, sort = 'newest' } = req.query;

    const filter = { vendorId };
    if (status) filter.status = status;
    if (unread === 'true') filter.isRead = false;
    
    if (search) {
        filter.$or = [
            { customerName: { $regex: search, $options: 'i' } },
            { message: { $regex: search, $options: 'i' } }
        ];
    }

    const sortOption = sort === 'oldest' ? { lastActivityAt: 1 } : { lastActivityAt: -1 };

    const inquiries = await StoreInquiry.find(filter)
        .sort(sortOption)
        .lean();

    const total = await StoreInquiry.countDocuments({ vendorId });
    const unreadCount = await StoreInquiry.countDocuments({ vendorId, isRead: false });

    res.status(200).json(new ApiResponse(200, {
        inquiries: inquiries.map(i => ({ ...i, id: String(i._id) })),
        total,
        unreadCount
    }, 'Inquiries retrieved.'));
});

// GET /api/vendor/store/inquiries/:id
export const getVendorInquiryById = asyncHandler(async (req, res) => {
    const vendorId = req.user.id;
    const { id } = req.params;

    const inquiry = await StoreInquiry.findOne({ _id: id, vendorId });
    if (!inquiry) throw new ApiError(404, 'Inquiry not found.');

    if (!inquiry.isRead) {
        inquiry.isRead = true;
        await inquiry.save();
    }

    res.status(200).json(new ApiResponse(200, { ...inquiry.toObject(), id: String(inquiry._id) }, 'Inquiry details fetched.'));
});

// POST /api/vendor/store/inquiries/:id/replies
export const replyToInquiry = asyncHandler(async (req, res) => {
    const vendorId = req.user.id;
    const { id } = req.params;
    const { message } = req.body;

    if (!message || !message.trim()) {
        throw new ApiError(400, 'Reply message content cannot be empty.');
    }

    const inquiry = await StoreInquiry.findOne({ _id: id, vendorId });
    if (!inquiry) throw new ApiError(404, 'Inquiry not found.');

    inquiry.replies.push({
        senderType: 'vendor',
        senderId: req.user.id,
        message,
        createdAt: new Date()
    });

    inquiry.status = 'replied';
    inquiry.lastActivityAt = new Date();
    inquiry.isRead = true; // Mark as read since vendor just replied to it
    await inquiry.save();

    // Fetch store branding details for email
    const store = await VendorStore.findOne({ vendorId }).lean();
    const storeName = store?.storeName || 'Store Owner';
    const subject = `${storeName} replied to your inquiry`;
    const html = `
    <div style="font-family: 'Inter', -apple-system, sans-serif; color: #1e293b; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
      <div style="background: linear-gradient(to right, #7c3aed, #6d28d9); padding: 24px; text-align: center; color: white;">
        <h2 style="margin: 0; font-weight: 900; letter-spacing: -0.025em; font-size: 20px;">${storeName}</h2>
      </div>
      <div style="padding: 24px; line-height: 1.6; background-color: #ffffff;">
        <p style="font-size: 14px; font-weight: 600; color: #64748b; margin: 0 0 16px 0;">Hello ${inquiry.customerName},</p>
        <p style="font-size: 15px; margin: 0 0 24px 0;">Thank you for contacting us. Here is our reply to your inquiry:</p>
        
        <div style="background-color: #f8fafc; border-left: 4px solid #7c3aed; padding: 16px; margin: 0 0 24px 0; border-radius: 4px 8px 8px 4px;">
          <p style="font-size: 11px; font-weight: 800; color: #7c3aed; text-transform: uppercase; margin: 0 0 8px 0; letter-spacing: 0.05em;">Your Inquiry:</p>
          <p style="font-size: 14px; font-style: italic; color: #475569; margin: 0;">"${inquiry.message}"</p>
        </div>
        
        <div style="background-color: #f0fdf4; border-left: 4px solid #22c55e; padding: 16px; margin: 0 0 24px 0; border-radius: 4px 8px 8px 4px;">
          <p style="font-size: 11px; font-weight: 800; color: #22c55e; text-transform: uppercase; margin: 0 0 8px 0; letter-spacing: 0.05em;">Our Reply:</p>
          <p style="font-size: 14px; font-weight: 550; color: #1e293b; margin: 0;">${message}</p>
        </div>
        
        <p style="font-size: 14px; margin: 24px 0 0 0;">Regards,</p>
        <p style="font-size: 14px; font-weight: 850; color: #7c3aed; margin: 4px 0 0 0;">${storeName}</p>
      </div>
      <div style="background-color: #f8fafc; padding: 16px; text-align: center; border-top: 1px solid #e2e8f0;">
        <p style="font-size: 11px; color: #94a3b8; margin: 0 0 4px 0;">This message was sent from ${storeName} through Porutkal Marketplace.</p>
        <p style="font-size: 11px; color: #94a3b8; margin: 0; font-weight: 600;">Please do not reply directly to this email.</p>
      </div>
    </div>
    `;

    const { sendEmail } = await import('../../../services/email.service.js');
    await sendEmail({
        to: inquiry.customerEmail,
        subject,
        html
    }).catch(err => console.error("Failed to send customer email reply:", err));

    res.status(200).json(new ApiResponse(200, { ...inquiry.toObject(), id: String(inquiry._id) }, 'Reply sent successfully.'));
});

// PATCH /api/vendor/store/inquiries/:id/status
export const updateInquiryStatus = asyncHandler(async (req, res) => {
    const vendorId = req.user.id;
    const { id } = req.params;
    const { status } = req.body;

    if (!['new', 'in_progress', 'replied', 'closed'].includes(status)) {
        throw new ApiError(400, 'Invalid inquiry status value.');
    }

    const inquiry = await StoreInquiry.findOne({ _id: id, vendorId });
    if (!inquiry) throw new ApiError(404, 'Inquiry not found.');

    inquiry.status = status;
    inquiry.lastActivityAt = new Date();
    await inquiry.save();

    res.status(200).json(new ApiResponse(200, { ...inquiry.toObject(), id: String(inquiry._id) }, 'Status updated successfully.'));
});
