import mongoose from 'mongoose';

const bannerAssetSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true }, // Identifier for management
        title: { type: String, default: '' },
        subtitle: { type: String, default: '' },
        desktopImage: { type: String, required: true },
        mobileImage: { type: String, default: '' },
        ctaText: { type: String, default: '' },
        ctaLink: { type: String, default: '' },
        textColor: { type: String, default: '#ffffff' },
        buttonColor: { type: String, default: '#ffffff' },
        backgroundColor: { type: String, default: '#7c3aed' },
        gradient: { type: String, default: '' },
        overlayOpacity: { type: Number, default: 0.3, min: 0, max: 1 },
        tags: [{ type: String, index: true }],
        isDefault: { type: Boolean, default: false, index: true },
        sectionType: {
            type: String,
            enum: ['flash_sale', 'seasonal_collection', 'promotional_banner', 'generic'],
            default: 'generic',
            index: true
        },
        aspectRatio: {
            desktop: { type: String, default: '21:9' },
            tablet: { type: String, default: '16:9' },
            mobile: { type: String, default: '4:3' }
        },
        ownerType: {
            type: String,
            enum: ['admin', 'vendor'],
            default: 'admin',
            index: true
        },
        ownerId: {
            type: mongoose.Schema.Types.ObjectId,
            refPath: 'ownerType',
            index: true
        },
        startDate: { type: Date },
        endDate: { type: Date },
        isActive: { type: Boolean, default: true, index: true }
    },
    { timestamps: true }
);

// Indexes for quick lookup
bannerAssetSchema.index({ ownerType: 1, ownerId: 1 });
bannerAssetSchema.index({ isActive: 1, isDefault: 1, sectionType: 1 });

const BannerAsset = mongoose.model('BannerAsset', bannerAssetSchema);

export { BannerAsset };
export default BannerAsset;
