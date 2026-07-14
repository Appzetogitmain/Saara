import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Product from '../../../models/Product.model.js';
import Vendor from '../../../models/Vendor.model.js';
import Category from '../../../models/Category.model.js';
import Brand from '../../../models/Brand.model.js';
import BrandRequest from '../../../models/BrandRequest.model.js';
import CategoryRequest from '../../../models/CategoryRequest.model.js';
import Settings from '../../../models/Settings.model.js';
import { emitToRoom } from '../../../services/socket.service.js';
import { slugify } from '../../../utils/slugify.js';
import { createNotification } from '../../../services/notification.service.js';
import mongoose from 'mongoose';

const sanitizeFaqs = (faqs) => {
    if (!Array.isArray(faqs)) return [];
    return faqs
        .map((faq) => ({
            question: String(faq?.question || '').trim(),
            answer: String(faq?.answer || '').trim(),
        }))
        .filter((faq) => faq.question && faq.answer);
};

const normalizeVariantPart = (value) => String(value || '').trim().toLowerCase();

const uniqueAxisValues = (values = []) => {
    const seen = new Set();
    const out = [];
    for (const raw of values) {
        const value = String(raw || '').trim();
        if (!value) continue;
        const key = normalizeVariantPart(value);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(value);
    }
    return out;
};

const createVariantKey = (size = '', color = '') =>
    `${normalizeVariantPart(size)}|${normalizeVariantPart(color)}`;
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

const toObjectEntries = (value) => {
    if (!value) return [];
    if (value instanceof Map) return Array.from(value.entries());
    if (typeof value === 'object') return Object.entries(value);
    return [];
};

const toNonNegativeNumber = (raw) => {
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const normalizeAttributes = (rawAttributes = []) => {
    const seen = new Set();
    const attributes = [];
    for (const raw of rawAttributes || []) {
        const name = String(raw?.name || '').trim();
        const axisKey = normalizeAxisName(name);
        if (!name || !axisKey || seen.has(axisKey)) continue;
        seen.add(axisKey);
        const values = uniqueAxisValues(raw?.values || []);
        if (!values.length) continue;
        attributes.push({ name, axisKey, values });
    }
    return attributes;
};

const buildCombinationsFromAttributes = (attributes = []) => {
    if (!attributes.length) return [];
    let combos = [{}];
    attributes.forEach((attr) => {
        const next = [];
        combos.forEach((selection) => {
            attr.values.forEach((value) => next.push({ ...selection, [attr.axisKey]: value }));
        });
        combos = next;
    });
    return combos;
};

const normalizeVariantsPayload = (rawVariants = {}, fallbackPrice) => {
    if (!rawVariants || typeof rawVariants !== 'object') {
        return { sizes: [], colors: [], prices: {}, stockMap: {}, imageMap: {}, defaultVariant: {} };
    }

    const sizes = uniqueAxisValues(rawVariants.sizes || []);
    const colors = uniqueAxisValues(rawVariants.colors || []);
    const attributes = normalizeAttributes(rawVariants.attributes || []);
    const hasSizeAxis = sizes.length > 0;
    const hasColorAxis = colors.length > 0;
    const hasDynamicAxes = attributes.length > 0;
    const hasAnyAxis = hasDynamicAxes || hasSizeAxis || hasColorAxis;

    if (!hasAnyAxis) {
        return { sizes: [], colors: [], attributes: [], prices: {}, stockMap: {}, imageMap: {}, defaultVariant: {}, defaultSelection: {} };
    }

    const combinations = [];
    if (hasDynamicAxes) {
        buildCombinationsFromAttributes(attributes).forEach((selection) => combinations.push({ selection }));
    } else if (hasSizeAxis && hasColorAxis) {
        sizes.forEach((size) => colors.forEach((color) => combinations.push({ selection: { size, color } })));
    } else if (hasSizeAxis) {
        sizes.forEach((size) => combinations.push({ selection: { size } }));
    } else {
        colors.forEach((color) => combinations.push({ selection: { color } }));
    }

    const pricesSource = Object.fromEntries(toObjectEntries(rawVariants.prices));
    const stockSource = Object.fromEntries(toObjectEntries(rawVariants.stockMap));
    const imageSource = Object.fromEntries(toObjectEntries(rawVariants.imageMap));
    const prices = {};
    const stockMap = {};
    const imageMap = {};

    combinations.forEach(({ selection }) => {
        const size = String(selection?.size || '');
        const color = String(selection?.color || '');
        const key = hasDynamicAxes
            ? createDynamicVariantKey(selection)
            : createVariantKey(size, color);
        const parsedPrice = toNonNegativeNumber(pricesSource[key]);
        if (parsedPrice !== null) {
            prices[key] = parsedPrice;
        } else {
            const fallback = toNonNegativeNumber(fallbackPrice);
            if (fallback !== null) prices[key] = fallback;
        }

        const parsedStock = toNonNegativeNumber(stockSource[key]);
        if (parsedStock !== null) stockMap[key] = parsedStock;

        const image = String(imageSource[key] || '').trim();
        if (image) imageMap[key] = image;
    });

    const defaultSize = String(rawVariants?.defaultVariant?.size || '').trim();
    const defaultColor = String(rawVariants?.defaultVariant?.color || '').trim();
    const normalizedDefaultSize = hasSizeAxis ? defaultSize : '';
    const normalizedDefaultColor = hasColorAxis ? defaultColor : '';
    const hasValidDefaultSize = !normalizedDefaultSize || sizes.some((s) => normalizeVariantPart(s) === normalizeVariantPart(normalizedDefaultSize));
    const hasValidDefaultColor = !normalizedDefaultColor || colors.some((c) => normalizeVariantPart(c) === normalizeVariantPart(normalizedDefaultColor));
    if (!hasValidDefaultSize || !hasValidDefaultColor) {
        throw new ApiError(400, 'Default variant must exist in provided sizes/colors.');
    }

    const defaultSelection = {};
    if (rawVariants?.defaultSelection && typeof rawVariants.defaultSelection === 'object') {
        Object.entries(rawVariants.defaultSelection).forEach(([axis, value]) => {
            const axisKey = normalizeAxisName(axis);
            const selectedValue = String(value || '').trim();
            if (!axisKey || !selectedValue) return;
            const axisMeta = attributes.find((attr) => attr.axisKey === axisKey);
            if (!axisMeta) return;
            const matched = axisMeta.values.find(
                (candidate) => normalizeVariantPart(candidate) === normalizeVariantPart(selectedValue)
            );
            if (matched) defaultSelection[axisKey] = matched;
        });
    }

    return {
        sizes,
        colors,
        attributes: attributes.map((attr) => ({ name: attr.name, values: attr.values })),
        prices,
        stockMap,
        imageMap,
        defaultVariant: {
            size: normalizedDefaultSize,
            color: normalizedDefaultColor,
        },
        defaultSelection,
    };
};

const calculateVariantAggregateStock = (variants = {}) => {
    const entries = toObjectEntries(variants.stockMap);
    if (!entries.length) return null;
    return entries.reduce((sum, [, value]) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed >= 0 ? sum + parsed : sum;
    }, 0);
};

const sanitizeCategoryPayload = (payload = {}) => {
    const allowed = ['name', 'description', 'image', 'icon', 'parentId', 'order', 'isActive'];
    const sanitized = {};
    for (const key of allowed) {
        if (Object.prototype.hasOwnProperty.call(payload, key)) {
            sanitized[key] = payload[key];
        }
    }
    if (Object.prototype.hasOwnProperty.call(sanitized, 'parentId')) {
        sanitized.parentId = sanitized.parentId || null;
    }
    return sanitized;
};

const assertValidCategoryParent = async ({ categoryId = null, parentId }) => {
    if (!parentId) return;

    if (categoryId && String(categoryId) === String(parentId)) {
        throw new ApiError(400, 'Category cannot be parent of itself.');
    }

    const parent = await Category.findById(parentId).select('_id parentId');
    if (!parent) {
        throw new ApiError(400, 'Selected parent category does not exist.');
    }

    // Prevent cycles when changing parent during edit.
    if (categoryId) {
        let cursor = parent;
        while (cursor?.parentId) {
            if (String(cursor.parentId) === String(categoryId)) {
                throw new ApiError(400, 'Invalid parent category hierarchy.');
            }
            cursor = await Category.findById(cursor.parentId).select('_id parentId');
        }
    }
};

const sanitizeBrandPayload = (payload = {}) => {
    const allowed = ['name', 'logo', 'description', 'website', 'isActive', 'visibility', 'ownerVendorId', 'createdBy', 'ownershipType', 'country'];
    const sanitized = {};
    for (const key of allowed) {
        if (Object.prototype.hasOwnProperty.call(payload, key)) {
            sanitized[key] = payload[key];
        }
    }
    if (sanitized.ownerVendorId === '' || sanitized.ownerVendorId === 'null') {
        sanitized.ownerVendorId = null;
    }
    return sanitized;
};

// Check brand name uniqueness against approved brands and pending requests
const checkBrandNameUnique = async ({ name, visibility, ownerVendorId, excludeBrandId = null, excludeRequestId = null }) => {
    const nameRegex = new RegExp(`^${name.trim()}$`, 'i');

    if (visibility === 'global') {
        // 1. Check if any global brand has this name
        const globalBrandQuery = { name: nameRegex, visibility: 'global' };
        if (excludeBrandId) globalBrandQuery._id = { $ne: excludeBrandId };
        const existingGlobalBrand = await Brand.findOne(globalBrandQuery);
        if (existingGlobalBrand) {
            throw new ApiError(400, 'A global brand with this name already exists.');
        }

        // 2. Check if any pending global brand request has this name
        const globalRequestQuery = { brandName: nameRegex, requestedVisibility: 'global', status: 'pending' };
        if (excludeRequestId) globalRequestQuery._id = { $ne: excludeRequestId };
        const existingGlobalRequest = await BrandRequest.findOne(globalRequestQuery);
        if (existingGlobalRequest) {
            throw new ApiError(400, 'A global brand request with this name is already pending approval.');
        }
    } else if (visibility === 'private') {
        if (!ownerVendorId) {
            throw new ApiError(400, 'Owner vendor ID is required for private brands.');
        }

        // 1. Check if this vendor already has an approved private brand with this name
        const privateBrandQuery = { name: nameRegex, visibility: 'private', ownerVendorId };
        if (excludeBrandId) privateBrandQuery._id = { $ne: excludeBrandId };
        const existingPrivateBrand = await Brand.findOne(privateBrandQuery);
        if (existingPrivateBrand) {
            throw new ApiError(400, 'You already have a private brand with this name.');
        }

        // 2. Check if this vendor already has a pending private request with this name
        const privateRequestQuery = { brandName: nameRegex, requestedVisibility: 'private', vendorId: ownerVendorId, status: 'pending' };
        if (excludeRequestId) privateRequestQuery._id = { $ne: excludeRequestId };
        const existingPrivateRequest = await BrandRequest.findOne(privateRequestQuery);
        if (existingPrivateRequest) {
            throw new ApiError(400, 'A private brand request with this name is already pending approval.');
        }
    }
};

// GET /api/admin/products
export const getAllProducts = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, search, vendorId, categoryId, status, includeInactive = 'false' } = req.query;
    const numericPage = Number(page) || 1;
    const numericLimit = Number(limit) || 20;
    const skip = (numericPage - 1) * numericLimit;
    const filter = {};
    if (search) filter.$text = { $search: search };
    if (vendorId) filter.vendorId = vendorId;
    if (categoryId) filter.categoryId = categoryId;
    if (status) filter.stock = status;
    if (String(includeInactive) !== 'true') {
        filter.isActive = { $ne: false };
    }

    const [products, total] = await Promise.all([
        Product.find(filter)
            .select('-faqs -relatedProducts -__v')
            .populate('vendorId', 'storeName')
            .populate('categoryId', 'name')
            .populate('brandId', 'name')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(numericLimit)
            .lean(),
        Product.countDocuments(filter),
    ]);
    res.status(200).json(new ApiResponse(200, { products, total, page: numericPage, pages: Math.ceil(total / numericLimit) }, 'Products fetched.'));
});

// GET /api/admin/products/:id
export const getProductById = asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id)
        .populate('vendorId', 'storeName')
        .populate('categoryId', 'name')
        .populate('brandId', 'name')
        .lean();

    if (!product) throw new ApiError(404, 'Product not found.');
    res.status(200).json(new ApiResponse(200, product, 'Product fetched.'));
});

// POST /api/admin/products
export const createProduct = asyncHandler(async (req, res) => {
    const { name, stockQuantity = 0, stock, vendorId, ...rest } = req.body;

    let targetVendorId = vendorId;
    if (!targetVendorId) {
        let adminVendor = await Vendor.findOne({ email: 'admin@admin.com' });
        if (!adminVendor) {
            adminVendor = await Vendor.create({
                name: 'Platform Admin',
                email: 'admin@admin.com',
                password: 'dummy-password-not-used-for-admin-vendor',
                phone: '0000000000',
                storeName: 'Saara Platform Store',
                storeDescription: 'Default vendor account for products uploaded by platform admin',
                status: 'approved',
                isVerified: true,
                commissionRate: 0,
            });
        }
        targetVendorId = adminVendor._id;
    }

    const slug = slugify(name) + '-' + Date.now();
    const normalizedVariants = normalizeVariantsPayload(rest.variants, rest.price);

    const numericStockQuantity = Number(stockQuantity) || 0;
    const variantAggregateStock = calculateVariantAggregateStock(normalizedVariants);
    const finalStockQuantity = Number.isFinite(variantAggregateStock)
        ? variantAggregateStock
        : numericStockQuantity;
    const normalizedStock = stock || (finalStockQuantity <= 0
        ? 'out_of_stock'
        : finalStockQuantity <= 10
            ? 'low_stock'
            : 'in_stock');

    if (rest.brandId) {
        const brand = await Brand.findById(rest.brandId);
        if (!brand) throw new ApiError(404, 'Brand not found.');
        if (!brand.isActive) throw new ApiError(400, 'Selected brand is inactive.');
        if (brand.visibility === 'private' && String(brand.ownerVendorId) !== String(targetVendorId)) {
            throw new ApiError(400, 'Selected brand is private and belongs to another vendor.');
        }
    }

    const product = await Product.create({
        name,
        slug,
        stock: normalizedStock,
        stockQuantity: finalStockQuantity,
        vendorId: targetVendorId,
        ...rest,
        variants: normalizedVariants,
        faqs: sanitizeFaqs(rest.faqs),
    });
    res.status(201).json(new ApiResponse(201, product, 'Product created.'));
});



// PUT /api/admin/products/:id
export const updateProduct = asyncHandler(async (req, res) => {
    const payload = { ...req.body };
    if (payload.brandId) {
        const product = await Product.findById(req.params.id).select('vendorId');
        if (!product) throw new ApiError(404, 'Product not found.');
        const targetVendorId = payload.vendorId || product.vendorId;

        const brand = await Brand.findById(payload.brandId);
        if (!brand) throw new ApiError(404, 'Brand not found.');
        if (!brand.isActive) throw new ApiError(400, 'Selected brand is inactive.');
        if (brand.visibility === 'private' && String(brand.ownerVendorId) !== String(targetVendorId)) {
            throw new ApiError(400, 'Selected brand is private and belongs to another vendor.');
        }
    }

    if (payload.name) {
        payload.slug = slugify(payload.name) + '-' + Date.now();
    }
    if (payload.vendorId === '' || payload.vendorId === null) {
        delete payload.vendorId;
    }

    if (payload.stockQuantity !== undefined) {
        const numericStockQuantity = Number(payload.stockQuantity) || 0;
        payload.stockQuantity = numericStockQuantity;
        if (!payload.stock) {
            payload.stock = numericStockQuantity <= 0
                ? 'out_of_stock'
                : numericStockQuantity <= 10
                    ? 'low_stock'
                    : 'in_stock';
        }
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'faqs')) {
        payload.faqs = sanitizeFaqs(payload.faqs);
    }
    if (Object.prototype.hasOwnProperty.call(payload, 'variants')) {
        const fallbackPrice =
            Object.prototype.hasOwnProperty.call(payload, 'price')
                ? payload.price
                : (await Product.findById(req.params.id).select('price').lean())?.price;
        payload.variants = normalizeVariantsPayload(payload.variants, fallbackPrice);
        const variantAggregateStock = calculateVariantAggregateStock(payload.variants);
        if (Number.isFinite(variantAggregateStock)) {
            payload.stockQuantity = variantAggregateStock;
            if (!payload.stock) {
                payload.stock = variantAggregateStock <= 0
                    ? 'out_of_stock'
                    : variantAggregateStock <= 10
                        ? 'low_stock'
                        : 'in_stock';
            }
        }
    }

    const product = await Product.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
    if (!product) throw new ApiError(404, 'Product not found.');
    res.status(200).json(new ApiResponse(200, product, 'Product updated.'));
});

// DELETE /api/admin/products/:id
export const deleteProduct = asyncHandler(async (req, res) => {
    const product = await Product.findByIdAndUpdate(
        req.params.id,
        { isActive: false },
        { new: true, runValidators: true }
    );
    if (!product) throw new ApiError(404, 'Product not found.');
    res.status(200).json(new ApiResponse(200, null, 'Product disabled.'));
});

// GET /api/admin/products/tax-pricing-rules
export const getTaxPricingRules = asyncHandler(async (req, res) => {
    const settings = await Settings.findOne({ key: 'product_tax_pricing_rules' }).lean();
    const value = settings?.value || {};
    const taxRules = Array.isArray(value.taxRules) ? value.taxRules : [];
    const pricingRules = Array.isArray(value.pricingRules) ? value.pricingRules : [];

    res.status(200).json(
        new ApiResponse(200, { taxRules, pricingRules }, 'Tax and pricing rules fetched.')
    );
});

// PUT /api/admin/products/tax-pricing-rules
export const updateTaxPricingRules = asyncHandler(async (req, res) => {
    const { taxRules = [], pricingRules = [] } = req.body;

    await Settings.findOneAndUpdate(
        { key: 'product_tax_pricing_rules' },
        { key: 'product_tax_pricing_rules', value: { taxRules, pricingRules } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(200).json(
        new ApiResponse(200, { taxRules, pricingRules }, 'Tax and pricing rules updated.')
    );
});

// GET /api/admin/categories
export const getAllCategories = asyncHandler(async (req, res) => {
    const categories = await Category.find().sort({ order: 1, name: 1 });
    res.status(200).json(new ApiResponse(200, categories, 'Categories fetched.'));
});

// POST /api/admin/categories
export const createCategory = asyncHandler(async (req, res) => {
    const payload = sanitizeCategoryPayload(req.body);
    const { name, ...rest } = payload;
    await assertValidCategoryParent({ parentId: rest.parentId });
    const slug = slugify(name);
    const category = await Category.create({ name, slug, ...rest });
    res.status(201).json(new ApiResponse(201, category, 'Category created.'));
});

// PUT /api/admin/categories/:id
export const updateCategory = asyncHandler(async (req, res) => {
    const existingCategory = await Category.findById(req.params.id);
    if (!existingCategory) throw new ApiError(404, 'Category not found.');

    const payload = sanitizeCategoryPayload(req.body);
    await assertValidCategoryParent({
        categoryId: existingCategory._id,
        parentId: payload.parentId,
    });

    if (payload.name) {
        payload.slug = slugify(payload.name);
    }

    const category = await Category.findByIdAndUpdate(req.params.id, payload, {
        new: true,
        runValidators: true,
    });
    if (!category) throw new ApiError(404, 'Category not found.');
    res.status(200).json(new ApiResponse(200, category, 'Category updated.'));
});

// DELETE /api/admin/categories/:id
export const deleteCategory = asyncHandler(async (req, res) => {
    const category = await Category.findById(req.params.id).select('_id');
    if (!category) {
        throw new ApiError(404, 'Category not found.');
    }

    const [subcategoriesCount, productsCount] = await Promise.all([
        Category.countDocuments({ parentId: req.params.id }),
        Product.countDocuments({ categoryId: req.params.id }),
    ]);

    if (subcategoriesCount > 0) {
        throw new ApiError(409, 'Cannot delete category with existing subcategories.');
    }
    if (productsCount > 0) {
        throw new ApiError(409, 'Cannot delete category with existing products.');
    }

    await Category.findByIdAndDelete(req.params.id);
    res.status(200).json(new ApiResponse(200, null, 'Category deleted.'));
});

// PATCH /api/admin/categories/reorder
export const reorderCategories = asyncHandler(async (req, res) => {
    const uniqueIds = Array.from(new Set(req.body.categoryIds.map((id) => String(id))));

    const rootCategories = await Category.find({
        _id: { $in: uniqueIds },
        parentId: null,
    }).select('_id');

    if (rootCategories.length !== uniqueIds.length) {
        throw new ApiError(400, 'Only root categories can be reordered.');
    }

    const bulkUpdates = uniqueIds.map((id, index) => ({
        updateOne: {
            filter: { _id: id },
            update: { $set: { order: index + 1 } },
        },
    }));

    if (bulkUpdates.length > 0) {
        await Category.bulkWrite(bulkUpdates);
    }

    const categories = await Category.find().sort({ order: 1, name: 1 });
    res.status(200).json(new ApiResponse(200, categories, 'Category order updated.'));
});

// GET /api/admin/brands
export const getAllBrands = asyncHandler(async (req, res) => {
    const brands = await Brand.find().sort({ name: 1 });
    res.status(200).json(new ApiResponse(200, brands, 'Brands fetched.'));
});

// POST /api/admin/brands
export const createBrand = asyncHandler(async (req, res) => {
    const payload = sanitizeBrandPayload(req.body);
    const { name } = payload;
    
    // Ignore client-supplied values for visibility, ownerVendorId, createdBy
    payload.visibility = 'global';
    payload.createdBy = 'admin';
    payload.ownerVendorId = null;
    
    // Check uniqueness (Global brand uniqueness check)
    await checkBrandNameUnique({ name, visibility: 'global', ownerVendorId: null });
    
    const slug = slugify(name) + '-' + Date.now();
    const brand = await Brand.create({ ...payload, slug });
    res.status(201).json(new ApiResponse(201, brand, 'Brand created.'));
});

// PUT /api/admin/brands/:id
export const updateBrand = asyncHandler(async (req, res) => {
    const payload = sanitizeBrandPayload(req.body);
    
    // Never allow updating visibility, ownerVendorId, createdBy
    delete payload.visibility;
    delete payload.createdBy;
    delete payload.ownerVendorId;

    const existing = await Brand.findById(req.params.id);
    if (!existing) throw new ApiError(404, 'Brand not found.');

    if (payload.name) {
        // Enforce uniqueness rules based on existing brand visibility
        await checkBrandNameUnique({
            name: payload.name,
            visibility: existing.visibility,
            ownerVendorId: existing.ownerVendorId,
            excludeBrandId: existing._id
        });
    }

    if (payload.name) {
        payload.slug = slugify(payload.name) + '-' + Date.now();
    }

    const brand = await Brand.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
    res.status(200).json(new ApiResponse(200, brand, 'Brand updated.'));
});

// DELETE /api/admin/brands/:id
export const deleteBrand = asyncHandler(async (req, res) => {
    const brand = await Brand.findById(req.params.id).select('_id');
    if (!brand) throw new ApiError(404, 'Brand not found.');

    const linkedProductsCount = await Product.countDocuments({ brandId: req.params.id });
    if (linkedProductsCount > 0) {
        throw new ApiError(400, 'Cannot delete brand used in products. Please set it as Inactive instead.');
    }

    await Brand.findByIdAndDelete(req.params.id);
    res.status(200).json(new ApiResponse(200, null, 'Brand deleted.'));
});

// GET /api/admin/brand-requests
export const getAllBrandRequests = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, status, search } = req.query;
    const numericPage = Math.max(1, Number(page) || 1);
    const numericLimit = Math.max(1, Number(limit) || 20);
    const skip = (numericPage - 1) * numericLimit;

    const filter = {};
    if (status) filter.status = status;
    if (search) {
        filter.brandName = { $regex: String(search).trim(), $options: 'i' };
    }

    const [requests, total] = await Promise.all([
        BrandRequest.find(filter)
            .populate('vendorId', 'name storeName email')
            .populate('reviewedBy', 'name email')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(numericLimit)
            .lean(),
        BrandRequest.countDocuments(filter),
    ]);

    res.status(200).json(
        new ApiResponse(
            200,
            { requests, total, page: numericPage, pages: Math.ceil(total / numericLimit) },
            'Brand requests fetched.'
        )
    );
});

// POST /api/admin/brand-requests/:id/approve
export const approveBrandRequest = asyncHandler(async (req, res) => {
    const request = await BrandRequest.findById(req.params.id);
    if (!request) throw new ApiError(404, 'Brand request not found.');
    if (request.status !== 'pending') {
        throw new ApiError(400, 'This request has already been reviewed.');
    }

    // Verify name uniqueness first
    await checkBrandNameUnique({
        name: request.brandName,
        visibility: request.requestedVisibility,
        ownerVendorId: request.vendorId,
        excludeRequestId: request._id
    });

    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        // Create Brand
        const slug = slugify(request.brandName) + '-' + Date.now();
        const brand = await Brand.create(
            [
                {
                    name: request.brandName,
                    slug,
                    logo: request.logo,
                    description: request.description,
                    website: request.website,
                    visibility: request.requestedVisibility,
                    ownerVendorId: request.requestedVisibility === 'private' ? request.vendorId : null,
                    createdBy: 'vendor',
                    ownershipType: request.ownershipType,
                    country: request.country,
                    isActive: true,
                },
            ],
            { session }
        );

        // Update Request
        request.status = 'approved';
        request.reviewedBy = req.user.id;
        request.approvedBrandId = brand[0]._id;
        await request.save({ session });

        await session.commitTransaction();

        // Send Notification
        await createNotification({
            recipientId: request.vendorId,
            recipientType: 'vendor',
            title: 'Brand Approved',
            message: `Your brand "${request.brandName}" has been approved. Use it in products now.`,
            type: 'system',
            data: { brandId: String(brand[0]._id) },
        });

        res.status(200).json(new ApiResponse(200, request, 'Brand request approved.'));
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
});

// POST /api/admin/brand-requests/:id/reject
export const rejectBrandRequest = asyncHandler(async (req, res) => {
    const { rejectionReason } = req.body;
    if (!rejectionReason || !rejectionReason.trim()) {
        throw new ApiError(400, 'Rejection reason is required.');
    }

    const request = await BrandRequest.findById(req.params.id);
    if (!request) throw new ApiError(404, 'Brand request not found.');
    if (request.status !== 'pending') {
        throw new ApiError(400, 'This request has already been reviewed.');
    }

    request.status = 'rejected';
    request.reviewedBy = req.user.id;
    request.rejectionReason = rejectionReason.trim();
    request.rejectedAt = new Date();
    await request.save();

    // Send Notification
    await createNotification({
        recipientId: request.vendorId,
        recipientType: 'vendor',
        title: 'Brand Rejected',
        message: `Your brand request "${request.brandName}" has been rejected. Reason: ${rejectionReason}`,
        type: 'system',
        data: { requestId: String(request._id) },
    });

    res.status(200).json(new ApiResponse(200, request, 'Brand request rejected.'));
});

// POST /api/admin/brand-requests/:id/convert-to-global
export const convertToGlobalBrandRequest = asyncHandler(async (req, res) => {
    const request = await BrandRequest.findById(req.params.id);
    if (!request) throw new ApiError(404, 'Brand request not found.');
    if (request.status !== 'pending') {
        throw new ApiError(400, 'This request has already been reviewed.');
    }

    // Verify name uniqueness as global brand
    await checkBrandNameUnique({
        name: request.brandName,
        visibility: 'global',
        excludeRequestId: request._id
    });

    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        // Create a Global Brand
        const slug = slugify(request.brandName) + '-' + Date.now();
        const brand = await Brand.create(
            [
                {
                    name: request.brandName,
                    slug,
                    logo: request.logo,
                    description: request.description,
                    website: request.website,
                    visibility: 'global',
                    ownerVendorId: null,
                    createdBy: 'admin',
                    ownershipType: request.ownershipType,
                    country: request.country,
                    isActive: true,
                },
            ],
            { session }
        );

        // Update Request
        request.status = 'approved';
        request.requestedVisibility = 'global';
        request.reviewedBy = req.user.id;
        request.approvedBrandId = brand[0]._id;
        await request.save({ session });

        await session.commitTransaction();

        // Send Notification
        await createNotification({
            recipientId: request.vendorId,
            recipientType: 'vendor',
            title: 'Brand Approved as Global',
            message: `Your brand "${request.brandName}" has been approved as a Global Brand. All sellers can select it.`,
            type: 'system',
            data: { brandId: String(brand[0]._id) },
        });

        res.status(200).json(new ApiResponse(200, request, 'Brand request converted to global and approved.'));
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
});

// Helper to generate a unique category slug
const generateUniqueCategorySlug = async (name, session = null) => {
    let baseSlug = slugify(name);
    let uniqueSlug = baseSlug;
    let counter = 1;
    while (true) {
        const query = { slug: uniqueSlug };
        const existing = session 
            ? await Category.findOne(query).session(session)
            : await Category.findOne(query);
        if (!existing) {
            return uniqueSlug;
        }
        uniqueSlug = `${baseSlug}-${counter}`;
        counter++;
    }
};

// GET /api/admin/category-requests
export const getAllCategoryRequests = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, status, search } = req.query;
    const numericPage = Math.max(1, Number(page) || 1);
    const numericLimit = Math.max(1, Number(limit) || 20);
    const skip = (numericPage - 1) * numericLimit;

    const filter = {};
    if (status) filter.status = status;
    if (search) {
        filter.categoryName = { $regex: String(search).trim(), $options: 'i' };
    }

    const [requests, total] = await Promise.all([
        CategoryRequest.find(filter)
            .populate('vendorId', 'name storeName email')
            .populate('approvedBy', 'name email')
            .populate('rejectedBy', 'name email')
            .populate('requestedParentCategoryId', 'name')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(numericLimit)
            .lean(),
        CategoryRequest.countDocuments(filter),
    ]);

    res.status(200).json(
        new ApiResponse(
            200,
            { requests, total, page: numericPage, pages: Math.ceil(total / numericLimit) },
            'Category requests fetched.'
        )
    );
});

// POST /api/admin/category-requests/:id/approve
export const approveCategoryRequest = asyncHandler(async (req, res) => {
    const { parentCategoryId, mergeWithCategoryId } = req.body;

    const request = await CategoryRequest.findById(req.params.id);
    if (!request) throw new ApiError(404, 'Category request not found.');
    if (request.status !== 'pending') {
        throw new ApiError(400, 'This request has already been reviewed.');
    }

    // 1. If merging with an existing category
    if (mergeWithCategoryId) {
        const existingCategory = await Category.findById(mergeWithCategoryId);
        if (!existingCategory) throw new ApiError(404, 'Merge target category not found.');

        request.status = 'approved';
        request.approvedCategoryId = existingCategory._id;
        request.approvedBy = req.user.id;
        request.approvedAt = new Date();
        await request.save();

        // Send Notification
        await createNotification({
            recipientId: request.vendorId,
            recipientType: 'vendor',
            title: 'Category Approved',
            message: `Your category request "${request.categoryName}" has been approved. Use it in products now.`,
            type: 'system',
            data: { categoryId: String(existingCategory._id) },
        });

        // Emit Socket Event
        emitToRoom(`vendor_${request.vendorId}`, 'category_request_approved', request);
        emitToRoom('admin_room', 'category_request_approved', request);

        return res.status(200).json(new ApiResponse(200, request, 'Category request approved and merged.'));
    }

    // 2. Otherwise, create a new category
    // Verify name uniqueness (case-insensitive)
    const nameRegex = new RegExp(`^${request.categoryName.trim()}$`, 'i');
    const duplicateCategory = await Category.findOne({ name: nameRegex });
    if (duplicateCategory) {
        throw new ApiError(400, 'A category with this name already exists.');
    }

    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        // Resolve parent category ID (Admin override or vendor requested)
        const finalParentId = typeof parentCategoryId !== 'undefined'
            ? (parentCategoryId === '' || parentCategoryId === 'null' ? null : parentCategoryId)
            : request.requestedParentCategoryId;

        // Generate unique slug
        const uniqueSlug = await generateUniqueCategorySlug(request.categoryName, session);

        // Create Category
        const category = await Category.create(
            [
                {
                    name: request.categoryName.trim(),
                    slug: uniqueSlug,
                    description: request.description || '',
                    image: request.image || '',
                    parentId: finalParentId || null,
                    isActive: true,
                },
            ],
            { session }
        );

        // Update Request
        request.status = 'approved';
        request.approvedCategoryId = category[0]._id;
        request.approvedBy = req.user.id;
        request.approvedAt = new Date();
        await request.save({ session });

        await session.commitTransaction();

        // Send Notification
        await createNotification({
            recipientId: request.vendorId,
            recipientType: 'vendor',
            title: 'Category Approved',
            message: `Your category request "${request.categoryName}" has been approved. Use it in products now.`,
            type: 'system',
            data: { categoryId: String(category[0]._id) },
        });

        // Emit Socket Event
        emitToRoom(`vendor_${request.vendorId}`, 'category_request_approved', request);
        emitToRoom('admin_room', 'category_request_approved', request);

        res.status(200).json(new ApiResponse(200, request, 'Category request approved.'));
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
});

// POST /api/admin/category-requests/:id/reject
export const rejectCategoryRequest = asyncHandler(async (req, res) => {
    const { rejectionReason } = req.body;
    if (!rejectionReason || !rejectionReason.trim()) {
        throw new ApiError(400, 'Rejection reason is required.');
    }

    const request = await CategoryRequest.findById(req.params.id);
    if (!request) throw new ApiError(404, 'Category request not found.');
    if (request.status !== 'pending') {
        throw new ApiError(400, 'This request has already been reviewed.');
    }

    request.status = 'rejected';
    request.rejectionReason = rejectionReason.trim();
    request.rejectedBy = req.user.id;
    request.rejectedAt = new Date();
    await request.save();

    // Send Notification
    await createNotification({
        recipientId: request.vendorId,
        recipientType: 'vendor',
        title: 'Category Rejected',
        message: `Your category request "${request.categoryName}" has been rejected. Reason: ${rejectionReason}`,
        type: 'system',
        data: { requestId: String(request._id) },
    });

    // Emit Socket Event
    emitToRoom(`vendor_${request.vendorId}`, 'category_request_rejected', request);
    emitToRoom('admin_room', 'category_request_rejected', request);

    res.status(200).json(new ApiResponse(200, request, 'Category request rejected.'));
});
