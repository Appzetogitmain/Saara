import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import HomeSection from '../../../models/HomeSection.model.js';
import { clearResponseCache } from '../../../middlewares/responseCache.js';

// GET /api/admin/marketing/homepage-sections
export const getAllSections = asyncHandler(async (req, res) => {
    const sections = await HomeSection.find()
        .populate('products', 'name price image stock')
        .populate('categories', 'name slug')
        .populate('vendors', 'storeName name email')
        .populate('bannerAsset')
        .sort({ order: 1, createdAt: -1 });

    res.status(200).json(new ApiResponse(200, sections, 'Homepage sections fetched successfully.'));
});

// POST /api/admin/marketing/homepage-sections
export const createSection = asyncHandler(async (req, res) => {
    const { key } = req.body;
    
    const exists = await HomeSection.exists({ key });
    if (exists) {
        throw new ApiError(400, `Homepage section with key '${key}' already exists.`);
    }

    const payload = { ...req.body };
    // Clean arrays
    if (Array.isArray(payload.products)) {
        payload.products = payload.products.filter(id => id && String(id).trim() !== '');
    }
    if (Array.isArray(payload.categories)) {
        payload.categories = payload.categories.filter(id => id && String(id).trim() !== '');
    }
    if (Array.isArray(payload.vendors)) {
        payload.vendors = payload.vendors.filter(id => id && String(id).trim() !== '');
    }
    if (Array.isArray(payload.autoCategories)) {
        payload.autoCategories = payload.autoCategories.filter(id => id && String(id).trim() !== '');
    }
    if (Array.isArray(payload.autoBrands)) {
        payload.autoBrands = payload.autoBrands.filter(id => id && String(id).trim() !== '');
    }
    // Clean bannerAsset and dates
    if (payload.bannerAsset === '') payload.bannerAsset = null;
    if (payload.countdownDate === '') payload.countdownDate = null;
    if (payload.startDate === '') payload.startDate = null;
    if (payload.endDate === '') payload.endDate = null;

    const section = await HomeSection.create(payload);
    clearResponseCache();

    res.status(201).json(new ApiResponse(201, section, 'Homepage section created successfully.'));
});

// PUT /api/admin/marketing/homepage-sections/:id
export const updateSection = asyncHandler(async (req, res) => {
    const section = await HomeSection.findById(req.params.id);
    if (!section) {
        throw new ApiError(404, 'Homepage section not found.');
    }

    // Don't allow changing the key directly to avoid integrity issues
    const payload = { ...req.body };
    delete payload.key;

    // Clean arrays
    if (Array.isArray(payload.products)) {
        payload.products = payload.products.filter(id => id && String(id).trim() !== '');
    }
    if (Array.isArray(payload.categories)) {
        payload.categories = payload.categories.filter(id => id && String(id).trim() !== '');
    }
    if (Array.isArray(payload.vendors)) {
        payload.vendors = payload.vendors.filter(id => id && String(id).trim() !== '');
    }
    if (Array.isArray(payload.autoCategories)) {
        payload.autoCategories = payload.autoCategories.filter(id => id && String(id).trim() !== '');
    }
    if (Array.isArray(payload.autoBrands)) {
        payload.autoBrands = payload.autoBrands.filter(id => id && String(id).trim() !== '');
    }
    // Clean bannerAsset and dates
    if (payload.bannerAsset === '') payload.bannerAsset = null;
    if (payload.countdownDate === '') payload.countdownDate = null;
    if (payload.startDate === '') payload.startDate = null;
    if (payload.endDate === '') payload.endDate = null;

    // Increment version on update
    payload.version = (section.version || 1) + 1;

    const updated = await HomeSection.findByIdAndUpdate(
        req.params.id,
        { $set: payload },
        { new: true, runValidators: true }
    ).populate('bannerAsset');
    clearResponseCache();

    res.status(200).json(new ApiResponse(200, updated, 'Homepage section updated successfully.'));
});

// DELETE /api/admin/marketing/homepage-sections/:id
export const deleteSection = asyncHandler(async (req, res) => {
    const section = await HomeSection.findByIdAndDelete(req.params.id);
    if (!section) {
        throw new ApiError(404, 'Homepage section not found.');
    }
    clearResponseCache();

    res.status(200).json(new ApiResponse(200, null, 'Homepage section deleted successfully.'));
});

// PATCH /api/admin/marketing/homepage-sections/reorder
export const reorderSections = asyncHandler(async (req, res) => {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (items.length === 0) {
        throw new ApiError(400, 'Reorder list is empty.');
    }

    const bulkOps = items
        .filter((item) => item?.id && Number.isFinite(Number(item?.order)))
        .map((item) => ({
            updateOne: {
                filter: { _id: String(item.id) },
                update: { $set: { order: Number(item.order) } },
            },
        }));

    if (bulkOps.length === 0) {
        throw new ApiError(400, 'Invalid reorder items.');
    }

    await HomeSection.bulkWrite(bulkOps, { ordered: false });
    clearResponseCache();

    res.status(200).json(new ApiResponse(200, null, 'Homepage sections reordered successfully.'));
});
