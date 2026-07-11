import mongoose from 'mongoose';

const bannerSchema = new mongoose.Schema(
    {
        title: String,
        subtitle: String,
        description: String,
        image: { type: String, required: true },
        mobileImage: String,
        altText: String,
        openInNewTab: { type: Boolean, default: false },
        showButton: { type: Boolean, default: true },
        buttonText: { type: String, default: "Shop Now" },
        buttonStyle: { type: String, default: "primary" },
        link: String,
        type: {
            type: String,
            enum: ['home_slider', 'festival_offer', 'banner', 'hero', 'promotional', 'side_banner', 'category_focus_banner', 'category_focus_item', 'deal_item'],
            default: 'banner',
        },
        order: { type: Number, default: 0 },
        isActive: { type: Boolean, default: true },
        startDate: Date,
        endDate: Date,
    },
    { timestamps: true }
);

bannerSchema.index({ isActive: 1, type: 1, order: 1 });
bannerSchema.index({ isActive: 1, startDate: 1, endDate: 1 });

const Banner = mongoose.model('Banner', bannerSchema);
export { Banner };
export default Banner;
