import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Brand from '../../../models/Brand.model.js';
import BrandRequest from '../../../models/BrandRequest.model.js';
import { slugify } from '../../../utils/slugify.js';

// GET /api/vendor/brands
// Returns approved global brands + approved private brands owned by current vendor
export const getVendorBrands = asyncHandler(async (req, res) => {
    const brands = await Brand.find({
        isActive: true,
        $or: [
            { visibility: 'global' },
            { visibility: 'private', ownerVendorId: req.user.id }
        ]
    }).sort({ name: 1 }).lean();

    res.status(200).json(new ApiResponse(200, brands, 'Vendor brands fetched.'));
});

// GET /api/vendor/brand-requests
// Returns paginated requests for the current vendor, with filters, search, sort, and date range
export const getVendorBrandRequests = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, status, search, sort = 'newest' } = req.query;
    const numericPage = Math.max(1, Number(page) || 1);
    const numericLimit = Math.max(1, Number(limit) || 20);
    const skip = (numericPage - 1) * numericLimit;

    const filter = { vendorId: req.user.id };
    if (status && status !== 'all') filter.status = status;
    if (search) {
        filter.brandName = { $regex: String(search).trim(), $options: 'i' };
    }

    const sortMap = {
        newest: { createdAt: -1 },
        oldest: { createdAt: 1 },
        'name-asc': { brandName: 1 },
        'name-desc': { brandName: -1 }
    };

    const [requests, total] = await Promise.all([
        BrandRequest.find(filter)
            .sort(sortMap[sort] || { createdAt: -1 })
            .skip(skip)
            .limit(numericLimit)
            .lean(),
        BrandRequest.countDocuments(filter)
    ]);

    res.status(200).json(new ApiResponse(200, {
        requests,
        total,
        page: numericPage,
        pages: Math.ceil(total / numericLimit)
    }, 'Vendor brand requests fetched.'));
});

// POST /api/vendor/brand-requests
// Submits a new brand request with uniqueness checks
export const requestVendorBrand = asyncHandler(async (req, res) => {
    const { brandName, description, website, logo, country, ownershipType, reason, requestedVisibility } = req.body;

    if (!brandName || !brandName.trim()) {
        throw new ApiError(400, 'Brand name is required.');
    }
    if (!requestedVisibility || !['global', 'private'].includes(requestedVisibility)) {
        throw new ApiError(400, 'Requested visibility must be global or private.');
    }

    const nameRegex = new RegExp(`^${brandName.trim()}$`, 'i');

    // 1. Check global brand exists
    const existingGlobalBrand = await Brand.findOne({ name: nameRegex, visibility: 'global' });
    if (existingGlobalBrand) {
        throw new ApiError(400, 'A global brand with this name already exists.');
    }

    // 2. Check vendor already has private brand
    const existingPrivateBrand = await Brand.findOne({ name: nameRegex, visibility: 'private', ownerVendorId: req.user.id });
    if (existingPrivateBrand) {
        throw new ApiError(400, 'You already have an approved private brand with this name.');
    }

    // 3. Check vendor already has a pending request
    const pendingRequest = await BrandRequest.findOne({ brandName: nameRegex, vendorId: req.user.id, status: 'pending' });
    if (pendingRequest) {
        throw new ApiError(400, 'You already have a pending request for this brand.');
    }

    // 4. Check vendor already has a rejected request
    const rejectedRequest = await BrandRequest.findOne({ brandName: nameRegex, vendorId: req.user.id, status: 'rejected' });
    if (rejectedRequest) {
        throw new ApiError(400, 'You already have a rejected request for this brand name. Please edit and resubmit that request instead of creating a new one.');
    }

    const request = await BrandRequest.create({
        vendorId: req.user.id,
        brandName: brandName.trim(),
        description,
        website,
        logo,
        country,
        ownershipType: requestedVisibility === 'private' ? ownershipType : null,
        reason,
        requestedVisibility,
        status: 'pending'
    });

    res.status(201).json(new ApiResponse(201, request, 'Brand request submitted.'));
});

// PUT /api/vendor/brand-requests/:id/resubmit
// Resubmits a rejected brand request, updating metadata and clearing rejection reason
export const resubmitVendorBrandRequest = asyncHandler(async (req, res) => {
    const { brandName, description, website, logo, country, ownershipType, reason, requestedVisibility } = req.body;

    const request = await BrandRequest.findOne({ _id: req.params.id, vendorId: req.user.id });
    if (!request) {
        throw new ApiError(404, 'Brand request not found.');
    }
    if (request.status !== 'rejected') {
        throw new ApiError(400, 'Only rejected requests can be resubmitted.');
    }

    if (!brandName || !brandName.trim()) {
        throw new ApiError(400, 'Brand name is required.');
    }
    if (!requestedVisibility || !['global', 'private'].includes(requestedVisibility)) {
        throw new ApiError(400, 'Requested visibility must be global or private.');
    }

    const nameRegex = new RegExp(`^${brandName.trim()}$`, 'i');

    // 1. Check global brand exists
    const existingGlobalBrand = await Brand.findOne({ name: nameRegex, visibility: 'global' });
    if (existingGlobalBrand) {
        throw new ApiError(400, 'A global brand with this name already exists.');
    }

    // 2. Check vendor already has private brand
    const existingPrivateBrand = await Brand.findOne({ name: nameRegex, visibility: 'private', ownerVendorId: req.user.id });
    if (existingPrivateBrand) {
        throw new ApiError(400, 'You already have an approved private brand with this name.');
    }

    // 3. Check vendor already has a pending request (excluding current request ID)
    const pendingRequest = await BrandRequest.findOne({
        _id: { $ne: request._id },
        brandName: nameRegex,
        vendorId: req.user.id,
        status: 'pending'
    });
    if (pendingRequest) {
        throw new ApiError(400, 'You already have another pending request for this brand name.');
    }

    // Update request fields, resetting status and clearing rejection details
    request.brandName = brandName.trim();
    request.description = description;
    request.website = website;
    request.logo = logo;
    request.country = country;
    request.ownershipType = requestedVisibility === 'private' ? ownershipType : null;
    request.reason = reason;
    request.requestedVisibility = requestedVisibility;
    request.status = 'pending';
    request.rejectionReason = null;
    request.rejectedAt = null;
    request.reviewedBy = null;

    await request.save();

    res.status(200).json(new ApiResponse(200, request, 'Brand request resubmitted.'));
});
