import mongoose from 'mongoose';

const cmsSectionSchema = new mongoose.Schema({
    sectionType: {
        type: String,
        required: true,
        enum: [
            'Banner',
            'Product Carousel',
            'Product Grid',
            'Collection',
            'Category Grid',
            'Text Block',
            'Spacer',
            'Divider',
            'Image'
        ]
    },
    title: { type: String, default: '' },
    subtitle: { type: String, default: '' },
    layout: { type: String, default: 'carousel' },
    bannerAsset: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'MediaAsset',
        default: null
    },
    bannerUrl: { type: String, default: '' },
    curationMode: {
        type: String,
        enum: ['manual', 'automatic'],
        default: 'manual'
    },
    
    // Automatic product selection filters (fallback settings for simple sections)
    autoCategories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
    autoBrands: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Brand' }],
    autoMinDiscount: { type: Number, default: 0 },
    autoSortBy: {
        type: String,
        enum: ['best_sellers', 'new_arrivals', 'top_rated', 'latest'],
        default: 'latest'
    },
    
    // Manual product curation lists
    products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    
    // Links to collection model or category models
    collectionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'StoreCollection',
        default: null
    },
    categories: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
    
    displayLimit: { type: Number, default: 10 },
    ctaText: { type: String, default: '' },
    ctaLink: { type: String, default: '' },
    
    // Granular visibility rules
    visibility: {
        desktop: { type: Boolean, default: true },
        tablet: { type: Boolean, default: true },
        mouse: { type: Boolean, default: true },
        mobile: { type: Boolean, default: true },
        authenticatedOnly: { type: Boolean, default: false },
        guestOnly: { type: Boolean, default: false },
        vendorOnly: { type: Boolean, default: false }
      },
      
      order: { type: Number, default: 0 },
      enabled: { type: Boolean, default: true }
  });
  
  const storePageSchema = new mongoose.Schema(
      {
          ownerType: {
              type: String,
              enum: ['admin', 'vendor'],
              required: true,
              index: true
          },
          ownerId: {
              type: mongoose.Schema.Types.ObjectId,
              refPath: 'ownerType',
              required: true,
              index: true
          },
          pageType: {
              type: String,
              enum: ['home', 'standard', 'landing', 'policy'],
              default: 'standard',
              index: true
          },
          slug: {
              type: String,
              required: true,
              index: true
          },
          pageKey: { // kept for backward compatibility with queries using pageKey
              type: String,
              required: true,
              index: true
          },
          title: { type: String, required: true },
          enabled: { type: Boolean, default: true },
          status: {
              type: String,
              enum: ['draft', 'published', 'archived'],
              default: 'draft'
          },
          visibility: { type: Boolean, default: true },
          sortOrder: { type: Number, default: 0 },
          seo: {
              title: { type: String, default: '' },
              description: { type: String, default: '' },
              ogImage: { type: String, default: '' }
          },
          sections: [cmsSectionSchema], // Working Draft Version
          publishedSections: [cmsSectionSchema], // Publicly Visible Published Version
          publishedAt: { type: Date },
          publishVersion: { type: Number, default: 0 },
          isActive: { type: Boolean, default: true, index: true }
      },
      { timestamps: true }
  );
  
  storePageSchema.index({ ownerType: 1, ownerId: 1, pageType: 1, slug: 1 }, { unique: true });
  
  const StorePage = mongoose.model('StorePage', storePageSchema, 'cmspages');
  
  export { StorePage };
  export default StorePage;
  
