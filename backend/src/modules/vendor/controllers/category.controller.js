import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Category from '../../../models/Category.model.js';
import CategoryRequest from '../../../models/CategoryRequest.model.js';
import Admin from '../../../models/Admin.model.js';
import { emitToRoom } from '../../../services/socket.service.js';
import { createNotification } from '../../../services/notification.service.js';

// GET /api/vendor/category-requests
// Returns paginated requests for the current vendor, with filters, search, sort, and date range
export const getVendorCategoryRequests = asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, status, search, sort = 'newest' } = req.query;
    const numericPage = Math.max(1, Number(page) || 1);
    const numericLimit = Math.max(1, Number(limit) || 20);
    const skip = (numericPage - 1) * numericLimit;

    const filter = { vendorId: req.user.id };
    if (status && status !== 'all') filter.status = status;
    if (search) {
        filter.categoryName = { $regex: String(search).trim(), $options: 'i' };
    }

    const sortMap = {
        newest: { createdAt: -1 },
        oldest: { createdAt: 1 },
        'name-asc': { categoryName: 1 },
        'name-desc': { categoryName: -1 }
    };

    const [requests, total] = await Promise.all([
        CategoryRequest.find(filter)
            .populate('requestedParentCategoryId', 'name')
            .sort(sortMap[sort] || { createdAt: -1 })
            .skip(skip)
            .limit(numericLimit)
            .lean(),
        CategoryRequest.countDocuments(filter)
    ]);

    res.status(200).json(new ApiResponse(200, {
        requests,
        total,
        page: numericPage,
        pages: Math.ceil(total / numericLimit)
    }, 'Vendor category requests fetched.'));
});

// POST /api/vendor/category-requests
// Submits a new category request with uniqueness checks
export const requestVendorCategory = asyncHandler(async (req, res) => {
    const { categoryName, description, image, reason, requestedParentCategoryId } = req.body;

    if (!categoryName || !categoryName.trim()) {
        throw new ApiError(400, 'Category name is required.');
    }

    const nameRegex = new RegExp(`^${categoryName.trim()}$`, 'i');

    // 1. Check global category exists
    const existingCategory = await Category.findOne({ name: nameRegex });
    if (existingCategory) {
        throw new ApiError(400, 'A category with this name already exists.');
    }

    // 2. Check vendor already has a pending request
    const pendingRequest = await CategoryRequest.findOne({ categoryName: nameRegex, vendorId: req.user.id, status: 'pending' });
    if (pendingRequest) {
        throw new ApiError(400, 'You already have a pending request for this category.');
    }

    // 3. Check vendor already has an approved request (wait, this would create category, but checking request too)
    const approvedRequest = await CategoryRequest.findOne({ categoryName: nameRegex, vendorId: req.user.id, status: 'approved' });
    if (approvedRequest) {
        throw new ApiError(400, 'You already have an approved request for this category.');
    }

    // 4. Check vendor already has a rejected request
    const rejectedRequest = await CategoryRequest.findOne({ categoryName: nameRegex, vendorId: req.user.id, status: 'rejected' });
    if (rejectedRequest) {
        throw new ApiError(400, 'You already have a rejected request for this category name. Please edit and resubmit that request instead of creating a new one.');
    }

    const request = await CategoryRequest.create({
        vendorId: req.user.id,
        categoryName: categoryName.trim(),
        description,
        image,
        reason,
        requestedParentCategoryId: requestedParentCategoryId || null,
        status: 'pending'
    });

    // Notify all active admins
    const admins = await Admin.find({ isActive: true }).select('_id');
    await Promise.all(
        admins.map((admin) =>
            createNotification({
                recipientId: admin._id,
                recipientType: 'admin',
                title: 'New Category Request',
                message: `Vendor requested a new category: "${categoryName.trim()}"`,
                type: 'system',
                data: { requestId: String(request._id) }
            })
        )
    );

    // Socket Event
    emitToRoom('admin_room', 'category_request_created', request);

    res.status(201).json(new ApiResponse(201, request, 'Category request submitted.'));
});

// PUT /api/vendor/category-requests/:id/resubmit
// Resubmits a rejected category request, updating metadata and clearing rejection reason
export const resubmitVendorCategoryRequest = asyncHandler(async (req, res) => {
    const { categoryName, description, image, reason, requestedParentCategoryId } = req.body;

    const request = await CategoryRequest.findOne({ _id: req.params.id, vendorId: req.user.id });
    if (!request) {
        throw new ApiError(404, 'Category request not found.');
    }
    if (request.status !== 'rejected') {
        throw new ApiError(400, 'Only rejected requests can be resubmitted.');
    }

    if (!categoryName || !categoryName.trim()) {
        throw new ApiError(400, 'Category name is required.');
    }

    const nameRegex = new RegExp(`^${categoryName.trim()}$`, 'i');

    // 1. Check global category exists
    const existingCategory = await Category.findOne({ name: nameRegex });
    if (existingCategory) {
        throw new ApiError(400, 'A category with this name already exists.');
    }

    // 2. Check vendor already has a pending request (excluding current request ID)
    const pendingRequest = await CategoryRequest.findOne({
        _id: { $ne: request._id },
        categoryName: nameRegex,
        vendorId: req.user.id,
        status: 'pending'
    });
    if (pendingRequest) {
        throw new ApiError(400, 'You already have another pending request for this category name.');
    }

    // Update request fields, resetting status, and incrementing resubmission counter
    request.categoryName = categoryName.trim();
    request.description = description;
    request.image = image;
    request.reason = reason;
    request.requestedParentCategoryId = requestedParentCategoryId || null;
    request.status = 'pending';
    request.rejectionReason = null;
    request.rejectedAt = null;
    request.rejectedBy = null;
    request.resubmittedCount = (request.resubmittedCount || 0) + 1;

    await request.save();

    // Socket Event
    emitToRoom('admin_room', 'category_request_updated', request);

    res.status(200).json(new ApiResponse(200, request, 'Category request resubmitted.'));
});
