import mongoose from 'mongoose';

const brandSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        slug: { type: String, required: true, unique: true },
        logo: { type: String },
        description: { type: String },
        website: { type: String, trim: true },
        isActive: { type: Boolean, default: true },
        visibility: { type: String, enum: ['global', 'private'], default: 'global', index: true },
        ownerVendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', default: null, index: true },
        createdBy: { type: String, enum: ['admin', 'vendor'], default: 'admin' },
        ownershipType: { type: String, enum: ['manufacturer', 'reseller', 'distributor', 'private_label'], default: null },
        country: { type: String, trim: true },
    },
    { timestamps: true }
);

brandSchema.index({ isActive: 1, name: 1 });
brandSchema.index({ ownerVendorId: 1, visibility: 1 });

const Brand = mongoose.model('Brand', brandSchema);
export { Brand };
export default Brand;
