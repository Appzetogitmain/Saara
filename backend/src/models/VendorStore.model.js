import mongoose from 'mongoose';

const navigationItemSchema = new mongoose.Schema({
    title: { type: String, required: true },
    iconName: { type: String, default: '' }, // e.g. 'FiHome', 'FiTag'
    target: {
        type: {
            type: String,
            enum: ['page', 'collection', 'category', 'url', 'custom'],
            required: true
        },
        id: { type: String, default: '' },
        slug: { type: String, default: '' },
        path: { type: String, default: '' }
    },
    enabled: { type: Boolean, default: true },
    order: { type: Number, default: 0 }
}, { _id: false });

const vendorStoreSchema = new mongoose.Schema(
    {
        vendorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Vendor',
            required: true,
            unique: true,
            index: true
        },
        storeName: { type: String, required: true, trim: true },
        slug: { type: String, required: true, unique: true, index: true },
        description: { type: String, default: '' },
        logo: { type: String, default: '' },
        coverBanner: { type: String, default: '' },
        verified: { type: Boolean, default: false },
        
        featuredCategories: [
            {
                category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
                image: { type: String, default: '' },
                order: { type: Number, default: 0 }
            }
        ],
        
        theme: {
            preset: {
                type: String,
                enum: ['classic', 'modern', 'luxury', 'dark', 'minimal'],
                default: 'modern'
            },
            primaryColor: { type: String, default: '' },
            accentColor: { type: String, default: '' },
            borderRadius: {
                type: String,
                enum: ['none', 'sm', 'md', 'lg', 'full'],
                default: 'lg'
            },
            buttonStyle: {
                type: String,
                enum: ['filled', 'outline', 'pill'],
                default: 'filled'
            },
            font: { type: String, default: 'Inter' },
            spacing: {
                type: String,
                enum: ['compact', 'cozy', 'spacious'],
                default: 'cozy'
            },
            shadowLevel: {
                type: String,
                enum: ['none', 'sm', 'md', 'lg'],
                default: 'sm'
            }
        },
        
        navigation: [navigationItemSchema],
        
        // DEPRECATED - To be removed in a future database migration
        policies: {
            shipping: { type: String, default: '' },
            returns: { type: String, default: '' },
            warranty: { type: String, default: '' },
            support: { type: String, default: '' },
            privacy: { type: String, default: '' },
            exchange: { type: String, default: '' }
        },
        
        contact: {
            email: { type: String, default: '' },
            phone: { type: String, default: '' },
            whatsapp: { type: String, default: '' },
            address: { type: String, default: '' },
            businessHours: { type: String, default: '' },
            supportHours: { type: String, default: '' },
            mapsUrl: { type: String, default: '' }
        },

        socialLinks: {
            facebook: { type: String, default: '' },
            instagram: { type: String, default: '' },
            twitter: { type: String, default: '' },
            youtube: { type: String, default: '' },
            website: { type: String, default: '' }
        },

        businessInfo: {
            establishedYear: { type: Number, default: 2025 },
            gst: { type: String, default: '' },
            responseTime: { type: String, default: 'Within 24 hours' },
            tagline: { type: String, default: '' },
            status: { type: String, enum: ['open', 'closed', 'vacation'], default: 'open' },
            vacationResumeDate: { type: String, default: '' }
        },
        
        settings: {
            currency: { type: String, default: 'INR' },
            language: { type: String, default: 'en' },
            shippingMethods: [{ type: String }],
            returnWindow: { type: Number, default: 7 }
        },

        seo: {
            metaTitle: { type: String, default: '' },
            metaDescription: { type: String, default: '' },
            metaKeywords: [{ type: String }]
        },
        
        status: {
            type: String,
            enum: ['draft', 'published', 'suspended'],
            default: 'draft'
        },
        isActive: { type: Boolean, default: true }
    },
    { timestamps: true }
);

const VendorStore = mongoose.model('VendorStore', vendorStoreSchema);

export { VendorStore };
export default VendorStore;
