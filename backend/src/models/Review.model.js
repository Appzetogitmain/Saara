import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema(
    {
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', index: true },
        orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
        rating: { type: Number, required: true, min: 1, max: 5 },
        title: { type: String, default: "" },
        comment: { type: String, alias: 'review' },
        images: { type: [String], alias: 'reviewImages' },
        helpfulCount: { type: Number, default: 0 },
        notHelpfulCount: { type: Number, default: 0 },
        helpfulUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
        notHelpfulUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
        isApproved: { type: Boolean, default: false, index: true },
        isHidden: { type: Boolean, default: false, index: true },
        vendorResponse: { type: String, default: '' },
        responseDate: { type: Date },
        isVerifiedPurchase: { type: Boolean, default: false },
    },
    { timestamps: true }
);

// One review per user per product
reviewSchema.index({ productId: 1, userId: 1 }, { unique: true });

const Review = mongoose.model('Review', reviewSchema);
export { Review };
export default Review;
