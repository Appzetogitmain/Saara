import mongoose from 'mongoose';

const homeBannerSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true }, // Identifier for admin
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
            enum: ['flash_sale', 'seasonal_collection', 'promotional_banner'],
            index: true
        },
        startDate: { type: Date },
        endDate: { type: Date },
        isActive: { type: Boolean, default: true, index: true }
    },
    { timestamps: true }
);

// Compounding indexes for scheduling lookup
homeBannerSchema.index({ isActive: 1, isDefault: 1, sectionType: 1 });

const HomeBanner = mongoose.model('HomeBanner', homeBannerSchema);

export { HomeBanner };
export default HomeBanner;
