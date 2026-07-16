import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import HomeBanner from '../../../models/HomeBanner.model.js';

// Enforce single default banner per section type
const handleSingleDefaultConstraint = async (sectionType, bannerId) => {
    if (!sectionType) return;
    // Set all other defaults for this section type to false
    await HomeBanner.updateMany(
        { sectionType, isDefault: true, _id: { $ne: bannerId } },
        { $set: { isDefault: false } }
    );
};

// GET /api/admin/marketing/banners
export const getAllBanners = asyncHandler(async (req, res) => {
    const { sectionType, tag, search } = req.query;
    
    const query = {};
    if (sectionType) query.sectionType = sectionType;
    if (tag) query.tags = tag;
    if (search) {
        query.name = { $regex: search, $options: 'i' };
    }

    const banners = await HomeBanner.find(query).sort({ createdAt: -1 });

    res.status(200).json(new ApiResponse(200, banners, 'Banners fetched successfully.'));
});

// POST /api/admin/marketing/banners
export const createBanner = asyncHandler(async (req, res) => {
    const { name, desktopImage } = req.body;
    if (!name || !desktopImage) {
        throw new ApiError(400, 'Banner name and desktop image are required.');
    }

    const banner = await HomeBanner.create(req.body);

    if (banner.isDefault && banner.sectionType) {
        await handleSingleDefaultConstraint(banner.sectionType, banner._id);
    }

    res.status(201).json(new ApiResponse(201, banner, 'Banner created successfully.'));
});

// PUT /api/admin/marketing/banners/:id
export const updateBanner = asyncHandler(async (req, res) => {
    const banner = await HomeBanner.findById(req.params.id);
    if (!banner) {
        throw new ApiError(404, 'Banner not found.');
    }

    const updated = await HomeBanner.findByIdAndUpdate(
        req.params.id,
        { $set: req.body },
        { new: true, runValidators: true }
    );

    if (updated.isDefault && updated.sectionType) {
        await handleSingleDefaultConstraint(updated.sectionType, updated._id);
    }

    res.status(200).json(new ApiResponse(200, updated, 'Banner updated successfully.'));
});

// DELETE /api/admin/marketing/banners/:id
export const deleteBanner = asyncHandler(async (req, res) => {
    const banner = await HomeBanner.findById(req.params.id);
    if (!banner) {
        throw new ApiError(404, 'Banner not found.');
    }

    if (banner.isDefault) {
        throw new ApiError(400, 'Cannot delete the default banner. Mark another banner as default first.');
    }

    await HomeBanner.findByIdAndDelete(req.params.id);

    res.status(200).json(new ApiResponse(200, null, 'Banner deleted successfully.'));
});
