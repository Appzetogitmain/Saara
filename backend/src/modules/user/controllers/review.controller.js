import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Review from '../../../models/Review.model.js';
import Product from '../../../models/Product.model.js';
import Order from '../../../models/Order.model.js';
import mongoose from 'mongoose';
import { uploadLocalFileToCloudinaryAndCleanup } from '../../../services/upload.service.js';

// Helper to update product aggregates
const updateProductRating = async (productId) => {
    const stats = await Review.aggregate([
        { $match: { productId: new mongoose.Types.ObjectId(productId), isApproved: true } },
        {
            $group: {
                _id: '$productId',
                avgRating: { $avg: '$rating' },
                count: { $sum: 1 }
            }
        }
    ]);

    if (stats.length > 0) {
        await Product.findByIdAndUpdate(productId, {
            rating: parseFloat(stats[0].avgRating.toFixed(1)),
            reviewCount: stats[0].count
        });
    } else {
        await Product.findByIdAndUpdate(productId, { rating: 0, reviewCount: 0 });
    }
};

// GET /api/user/reviews/product/:productId
export const getProductReviews = asyncHandler(async (req, res) => {
    const { sort = 'newest', page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const sortMap = {
        newest: { createdAt: -1 },
        oldest: { createdAt: 1 },
        'highest-rating': { rating: -1 },
        'lowest-rating': { rating: 1 },
        'most-helpful': { helpfulCount: -1 },
    };

    const reviews = await Review.find({ productId: req.params.productId, isApproved: true, isHidden: false })
        .populate('userId', 'name avatar')
        .sort(sortMap[sort] || { createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean();

    const total = await Review.countDocuments({ productId: req.params.productId, isApproved: true, isHidden: false });
    
    res.status(200).json(new ApiResponse(200, { 
        reviews, 
        total, 
        page: Number(page), 
        pages: Math.ceil(total / limit) 
    }, 'Reviews fetched.'));
});

// POST /api/user/reviews
export const addReview = asyncHandler(async (req, res) => {
    const productId = req.params.productId || req.body.productId;
    const { orderId, rating, comment, title, images } = req.body;

    if (!productId) throw new ApiError(400, 'Product ID is required.');
    if (!orderId) throw new ApiError(400, 'Order ID is required.');

    // Spam Protection & Verification
    const order = await Order.findOne({ 
        _id: orderId, 
        userId: req.user.id, 
        'items.productId': productId, 
        status: 'delivered' 
    });
    
    if (!order) throw new ApiError(403, 'You can only review products you have purchased and received.');

    // Check if returned or refunded
    const { ReturnRequest } = await import('../../../models/ReturnRequest.model.js');
    const returnReq = await ReturnRequest.findOne({
        orderId,
        'items.productId': productId,
        status: { $in: ['picked_up', 'delivered_to_vendor', 'replacement_preparing', 'replacement_ready', 'replacement_assigned', 'out_for_delivery', 'completed'] }
    });
    if (returnReq) {
        throw new ApiError(400, 'Reviews are blocked for returned or refunded products.');
    }

    const existing = await Review.findOne({ productId, userId: req.user.id });
    if (existing) throw new ApiError(409, 'You have already reviewed this product.');

    const sanitizedComment = String(comment || req.body.review || '')
        .replace(/[<>]/g, '')          // strip HTML tags
        .trim();

    const URL_PATTERN = /https?:\/\/|www\.\S+/i;
    if (URL_PATTERN.test(sanitizedComment)) {
        throw new ApiError(400, 'Reviews cannot contain URLs.');
    }
    if (sanitizedComment.length > 0 && sanitizedComment.length < 10) {
        throw new ApiError(400, 'Comment must be at least 10 characters.');
    }

    // Process new images
    const reviewImages = [];
    if (Array.isArray(req.files) && req.files.length > 0) {
        for (const file of req.files) {
            const uploaded = await uploadLocalFileToCloudinaryAndCleanup(file.path, 'reviews');
            if (uploaded) {
                reviewImages.push(uploaded.url);
            }
        }
    } else if (Array.isArray(images)) {
        reviewImages.push(...images);
    } else if (Array.isArray(req.body.reviewImages)) {
        reviewImages.push(...req.body.reviewImages);
    }

    // Fetch product to resolve vendorId
    const productObj = await Product.findById(productId).select('vendorId').lean();

    const review = await Review.create({ 
        productId, 
        userId: req.user.id, 
        vendorId: productObj?.vendorId || null,
        orderId, 
        rating: Number(rating || 5), 
        title: String(title || '').trim(),
        comment: sanitizedComment, 
        images: reviewImages, 
        isVerifiedPurchase: true,
        isApproved: true
    });

    // Update product aggregates
    await updateProductRating(productId);

    res.status(201).json(new ApiResponse(201, review, 'Review submitted successfully.'));
});

// PATCH /api/user/products/:productId/review
export const updateReview = asyncHandler(async (req, res) => {
    const productId = req.params.productId;
    const userId = req.user.id;

    const reviewDoc = await Review.findOne({ productId, userId });
    if (!reviewDoc) throw new ApiError(404, 'Review not found.');

    const { rating, comment, title, images } = req.body;

    if (rating !== undefined) {
        reviewDoc.rating = Number(rating);
    }
    if (title !== undefined) {
        reviewDoc.title = String(title).trim();
    }
    if (comment !== undefined || req.body.review !== undefined) {
        const commentContent = comment !== undefined ? comment : req.body.review;
        const sanitized = String(commentContent || '')
            .replace(/[<>]/g, '')
            .trim();
        const URL_PATTERN = /https?:\/\/|www\.\S+/i;
        if (URL_PATTERN.test(sanitized)) {
            throw new ApiError(400, 'Reviews cannot contain URLs.');
        }
        reviewDoc.comment = sanitized;
    }

    // Process new images
    const reviewImages = [];
    if (Array.isArray(req.files) && req.files.length > 0) {
        for (const file of req.files) {
            const uploaded = await uploadLocalFileToCloudinaryAndCleanup(file.path, 'reviews');
            if (uploaded) {
                reviewImages.push(uploaded.url);
            }
        }
        reviewDoc.images = reviewImages;
    } else if (images !== undefined) {
        reviewDoc.images = Array.isArray(images) ? images : [];
    } else if (req.body.reviewImages !== undefined) {
        reviewDoc.images = Array.isArray(req.body.reviewImages) ? req.body.reviewImages : [];
    }

    await reviewDoc.save();
    await updateProductRating(productId);

    res.status(200).json(new ApiResponse(200, reviewDoc, 'Review updated successfully.'));
});

// POST /api/user/reviews/:id/vote
export const voteReview = asyncHandler(async (req, res) => {
    const { type } = req.body; // 'helpful' or 'unhelpful'
    const userId = req.user.id;
    const reviewId = req.params.id;

    const review = await Review.findById(reviewId);
    if (!review) throw new ApiError(404, 'Review not found.');

    if (type === 'helpful') {
        // Prevent multiple helpful votes
        if (review.helpfulUsers.includes(userId)) {
            // Undo vote if clicked again
            await Review.findByIdAndUpdate(reviewId, {
                $pull: { helpfulUsers: userId },
                $inc: { helpfulCount: -1 }
            });
            return res.status(200).json(new ApiResponse(200, null, 'Vote removed.'));
        }
        
        // Add helpful vote and remove from unhelpful if exists
        await Review.findByIdAndUpdate(reviewId, {
            $addToSet: { helpfulUsers: userId },
            $pull: { notHelpfulUsers: userId },
            $inc: { 
                helpfulCount: 1, 
                notHelpfulCount: review.notHelpfulUsers.includes(userId) ? -1 : 0 
            }
        });
    } else if (type === 'unhelpful') {
        if (review.notHelpfulUsers.includes(userId)) {
            await Review.findByIdAndUpdate(reviewId, {
                $pull: { notHelpfulUsers: userId },
                $inc: { notHelpfulCount: -1 }
            });
            return res.status(200).json(new ApiResponse(200, null, 'Vote removed.'));
        }

        await Review.findByIdAndUpdate(reviewId, {
            $addToSet: { notHelpfulUsers: userId },
            $pull: { helpfulUsers: userId },
            $inc: { 
                notHelpfulCount: 1, 
                helpfulCount: review.helpfulUsers.includes(userId) ? -1 : 0 
            }
        });
    }

    const updatedReview = await Review.findById(reviewId);
    res.status(200).json(new ApiResponse(200, updatedReview, 'Vote recorded.'));
});

// DELETE /api/user/reviews/:id
export const deleteReview = asyncHandler(async (req, res) => {
    const review = await Review.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!review) throw new ApiError(404, 'Review not found or unauthorized.');

    await updateProductRating(review.productId);
    res.status(200).json(new ApiResponse(200, null, 'Review deleted.'));
});
