import mongoose from 'mongoose';

const categoryRequestSchema = new mongoose.Schema(
    {
        vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
        categoryName: { type: String, required: true, trim: true },
        description: { type: String, trim: true },
        image: { type: String },
        reason: { type: String },
        requestedParentCategoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
        status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
        approvedCategoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
        resubmittedCount: { type: Number, default: 0 },
        approvedAt: { type: Date, default: null },
        approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
        rejectedAt: { type: Date, default: null },
        rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
        rejectionReason: { type: String, default: null }
    },
    { timestamps: true }
);

categoryRequestSchema.index({ vendorId: 1, status: 1 });
categoryRequestSchema.index({ categoryName: 1, status: 1 });

const CategoryRequest = mongoose.model('CategoryRequest', categoryRequestSchema);
export { CategoryRequest };
export default CategoryRequest;
