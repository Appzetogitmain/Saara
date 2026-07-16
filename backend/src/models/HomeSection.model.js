import mongoose from 'mongoose';

const homeSectionSchema = new mongoose.Schema(
    {
        key: { type: String, required: true, unique: true }, // e.g., 'flash_sale', 'seasonal_collection', 'promotional_banner'
        sectionType: {
            type: String,
            required: true,
            enum: ['flash_sale', 'seasonal_collection', 'promotional_banner'],
        },
        title: { type: String, default: '' },
        subtitle: { type: String, default: '' },
        banner: { type: String, default: '' }, // Desktop banner url (legacy/fallback)
        mobileBanner: { type: String, default: '' }, // Mobile banner url (legacy/fallback)
        ctaText: { type: String, default: '' },
        ctaLink: { type: String, default: '' },
        
        // Reusable Banner Decoupling
        bannerAsset: { type: mongoose.Schema.Types.ObjectId, ref: 'HomeBanner', default: null },

        // Curation Mode & Automatic Rule Builder
        curationMode: { type: String, enum: ['manual', 'automatic'], default: 'manual' },
        autoCategories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
        autoBrands: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Brand' }],
        autoMinDiscount: { type: Number, default: 0 },
        autoSortBy: { 
            type: String, 
            enum: ['best_sellers', 'new_arrivals', 'top_rated', 'latest'], 
            default: 'latest' 
        },

        // Curation lists
        products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
        categories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
        vendors: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' }],
        
        // Date configurations
        countdownDate: { type: Date },
        startDate: { type: Date },
        endDate: { type: Date },
        
        // Visual configurations
        backgroundColor: { type: String, default: '' },
        gradient: { type: String, default: '' },
        order: { type: Number, default: 0 },
        isActive: { type: Boolean, default: true },
        displayLimit: { type: Number, default: 10 },
        priority: { type: Number, default: 0 },
        minimumProducts: { type: Number, default: 4 },
        version: { type: Number, default: 1 },
        layout: {
            type: String,
            enum: ['horizontal', 'grid', 'banner', 'carousel'],
            default: 'horizontal',
        },
        sorting: {
            type: String,
            enum: ['manual', 'best_selling', 'top_rated', 'latest'],
            default: 'manual',
        },
    },
    { timestamps: true }
);

homeSectionSchema.index({ order: 1, isActive: 1 });

const HomeSection = mongoose.model('HomeSection', homeSectionSchema);
export { HomeSection };
export default HomeSection;
