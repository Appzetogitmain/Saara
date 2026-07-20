import mongoose from 'mongoose';

const storeMenuItemSchema = new mongoose.Schema({
    label: { type: String, required: true },
    iconName: { type: String, default: '' },
    sortOrder: { type: Number, default: 0 },
    destination: {
        type: {
            type: String,
            enum: ['page', 'category', 'collection', 'custom'],
            required: true
        },
        destinationId: { type: mongoose.Schema.Types.ObjectId, default: null }, // references page/category/collection depending on type
        externalUrl: { type: String, default: '' },
        path: { type: String, default: '' } // URL for custom external URLs
    }
}, { _id: false });

const storeMenuSchema = new mongoose.Schema(
    {
        storeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'VendorStore',
            required: true,
            index: true
        },
        menuType: {
            type: String,
            enum: ['header', 'footer', 'mobile', 'sidebar'],
            default: 'header',
            required: true,
            index: true
        },
        items: [storeMenuItemSchema]
    },
    { timestamps: true }
);

storeMenuSchema.index({ storeId: 1, menuType: 1 }, { unique: true });

const StoreMenu = mongoose.model('StoreMenu', storeMenuSchema);

export { StoreMenu };
export default StoreMenu;
