import mongoose from 'mongoose';

const recentlyViewedSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
        viewedAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

// Compound Unique Index to prevent duplicate records per user-product combo
recentlyViewedSchema.index({ userId: 1, productId: 1 }, { unique: true });
// Index for fast sorting of history by most recently viewed
recentlyViewedSchema.index({ userId: 1, viewedAt: -1 });

const RecentlyViewed = mongoose.model('RecentlyViewed', recentlyViewedSchema);
export { RecentlyViewed };
export default RecentlyViewed;
