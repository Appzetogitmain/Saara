import mongoose from 'mongoose';

const wishlistSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
        items: [
            {
                productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', index: true, required: true },
                variantId: { type: String, index: true },
                priceAtWishlist: { type: Number },
                addedAt: { type: Date, default: Date.now },
                notes: { type: String, default: "" },
                priority: { type: Number, default: 0 }
            },
        ],
    },
    { timestamps: true }
);

const Wishlist = mongoose.model('Wishlist', wishlistSchema);
export default Wishlist;
