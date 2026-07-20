import mongoose from 'mongoose';

const mediaAssetSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        url: { type: String, required: true },
        folder: {
            type: String,
            enum: ['Home', 'Collections', 'Logos', 'Promotions', 'Seasonal', 'Archive', 'Misc'],
            default: 'Misc',
            index: true
        },
        assetCategory: {
            type: String,
            enum: ['image', 'video', 'document', 'icon', 'other'],
            default: 'image',
            index: true
        },
        usage: {
            type: String,
            enum: ['banner', 'logo', 'category', 'collection', 'promotion', 'thumbnail', 'gallery', 'other'],
            default: 'other',
            index: true
        },
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
        metadata: {
            aspectRatio: {
                desktop: { type: String, default: '21:9' },
                tablet: { type: String, default: '16:9' },
                mobile: { type: String, default: '4:3' }
            },
            altText: { type: String, default: '' },
            fileSize: { type: Number } // in bytes
        },
        isActive: { type: Boolean, default: true, index: true }
    },
    { timestamps: true }
);

mediaAssetSchema.index({ ownerType: 1, ownerId: 1, folder: 1 });

const MediaAsset = mongoose.model('MediaAsset', mediaAssetSchema);

export { MediaAsset };
export default MediaAsset;
