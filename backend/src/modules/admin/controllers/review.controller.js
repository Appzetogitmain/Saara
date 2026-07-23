import Review from '../../../models/Review.model.js';
import ApiError from '../../../utils/ApiError.js';
import { ApiResponse } from '../../../utils/ApiResponse.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { syncProductAndVendorReviewStats } from '../../../services/reviewAggregate.service.js';

/**
 * @desc    Get all reviews with filtering and pagination
 * @route   GET /api/admin/reviews
 * @access  Private (Admin)
 */
export const getAllReviews = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, search = '', status } = req.query;
    const numericPage = Number(page) || 1;
    const numericLimit = Number(limit) || 10;

    const filter = {};

    if (status === 'approved') filter.isApproved = true;
    if (status === 'pending') filter.isApproved = false;

    if (search) {
        const regex = new RegExp(search, 'i');
        const isObjectId = /^[0-9a-fA-F]{24}$/.test(String(search || ''));

        const [matchedUsers, matchedProducts] = await Promise.all([
            Review.db.model('User').find({
                $or: [{ name: regex }, { email: regex }],
            }).select('_id').limit(200).lean(),
            Review.db.model('Product').find({
                $or: [{ name: regex }, { description: regex }],
            }).select('_id').limit(200).lean(),
        ]);

        const matchedUserIds = matchedUsers.map((u) => u._id);
        const matchedProductIds = matchedProducts.map((p) => p._id);
        const orFilters = [
            { comment: regex },
            ...(matchedUserIds.length > 0 ? [{ userId: { $in: matchedUserIds } }] : []),
            ...(matchedProductIds.length > 0 ? [{ productId: { $in: matchedProductIds } }] : []),
        ];

        if (isObjectId) {
            orFilters.push({ _id: search }, { productId: search }, { userId: search });
        }

        if (orFilters.length > 0) {
            filter.$or = orFilters;
        }
    }

    const reviews = await Review.find(filter)
        .populate('userId', 'name email')
        .populate('productId', 'name')
        .sort({ createdAt: -1 })
        .skip((numericPage - 1) * numericLimit)
        .limit(numericLimit);

    const total = await Review.countDocuments(filter);

    // Normalize for frontend
    const normalizedReviews = reviews.map(review => ({
        ...review._doc,
        id: review._id,
        customerName: review.userId ? review.userId.name : 'Unknown',
        customerEmail: review.userId ? review.userId.email : 'N/A',
        productName: review.productId ? review.productId.name : 'Unknown Product',
        productId: review.productId?._id ? String(review.productId._id) : '',
        review: review.comment || '',
        status: review.isApproved ? 'approved' : 'pending'
    }));

    res.status(200).json(
        new ApiResponse(200, {
            reviews: normalizedReviews,
            pagination: {
                total,
                page: numericPage,
                limit: numericLimit,
                pages: Math.ceil(total / numericLimit)
            }
        }, 'Reviews fetched successfully')
    );
});

/**
 * @desc    Update review status (approve/reject)
 * @route   PATCH /api/admin/reviews/:id/status
 * @access  Private (Admin)
 */
export const updateReviewStatus = asyncHandler(async (req, res) => {
    const { status } = req.body;
    const review = await Review.findById(req.params.id);

    if (!review) {
        throw new ApiError(404, 'Review not found');
    }

    if (status === 'approved') {
        review.isApproved = true;
    } else if (status === 'rejected' || status === 'pending') {
        review.isApproved = false;
    }

    await review.save();
    await syncProductAndVendorReviewStats(review.productId);

    res.status(200).json(
        new ApiResponse(200, review, 'Review status updated successfully')
    );
});

/**
 * @desc    Delete a review
 * @route   DELETE /api/admin/reviews/:id
 * @access  Private (Admin)
 */
export const deleteReview = asyncHandler(async (req, res) => {
    const review = await Review.findByIdAndDelete(req.params.id);

    if (!review) {
        throw new ApiError(404, 'Review not found');
    }
    await syncProductAndVendorReviewStats(review.productId);

    res.status(200).json(
        new ApiResponse(200, {}, 'Review deleted successfully')
    );
});
