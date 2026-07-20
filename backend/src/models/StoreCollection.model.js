import mongoose from 'mongoose';

const conditionSchema = new mongoose.Schema({
    field: {
        type: String,
        enum: ['category', 'brand', 'price', 'discount', 'rating', 'tag'],
        required: true
    },
    operator: {
        type: String,
        enum: ['equals', 'greater_than', 'less_than', 'contains'],
        required: true
    },
    value: { type: String, required: true }
}, { _id: false });

const ruleGroupSchema = new mongoose.Schema({
    match: {
        type: String,
        enum: ['all', 'any'],
        default: 'all'
    },
    conditions: [conditionSchema]
}, { _id: false });

const storeCollectionSchema = new mongoose.Schema(
    {
        storeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'VendorStore',
            required: true,
            index: true
        },
        name: { type: String, required: true, trim: true },
        slug: { type: String, required: true, index: true },
        image: { type: String, default: '' },
        curationMode: {
            type: String,
            enum: ['manual', 'automatic'],
            default: 'manual'
        },
        // Extensible Rule Groups Curation logic
        ruleGroups: [ruleGroupSchema],
        // Manual products list fallback
        products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
        order: { type: Number, default: 0 },
        enabled: { type: Boolean, default: true }
    },
    { timestamps: true }
);

storeCollectionSchema.index({ storeId: 1, slug: 1 }, { unique: true });

const StoreCollection = mongoose.model('StoreCollection', storeCollectionSchema);

export { StoreCollection };
export default StoreCollection;
