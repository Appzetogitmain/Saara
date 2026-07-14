import mongoose from 'mongoose';

const brandRequestSchema = new mongoose.Schema(
    {
        vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
        brandName: { type: String, required: true, trim: true },
        description: { type: String },
        website: { type: String, trim: true },
        logo: { type: String },
        country: { type: String, trim: true },
        ownershipType: { type: String, enum: ['manufacturer', 'reseller', 'distributor', 'private_label'], default: null },
        reason: { type: String },
        requestedVisibility: { type: String, enum: ['global', 'private'], required: true },
        status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
        approvedBrandId: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', default: null },
        rejectionReason: { type: String, default: null },
        rejectedAt: { type: Date, default: null },
    },
    { timestamps: true }
);

brandRequestSchema.index({ vendorId: 1, status: 1 });
brandRequestSchema.index({ brandName: 1, requestedVisibility: 1, status: 1 });

const BrandRequest = mongoose.model('BrandRequest', brandRequestSchema);
export { BrandRequest };
export default BrandRequest;
