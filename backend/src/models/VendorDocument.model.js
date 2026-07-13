import mongoose from 'mongoose';

const vendorDocumentSchema = new mongoose.Schema(
    {
        vendorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Vendor',
            required: true,
            index: true,
        },
        name: { type: String, required: true, trim: true },
        category: {
            type: String,
            enum: ['License', 'Certificate', 'Tax Document', 'Other'],
            default: 'Other',
        },
        expiryDate: { type: Date, default: null },
        status: {
            type: String,
            enum: ['pending', 'approved', 'rejected'],
            default: 'pending',
            index: true,
        },
        fileUrl: { type: String, required: true },
        filePublicId: { type: String, required: true },
        fileName: { type: String, required: true },
        fileType: { type: String, required: true },
        fileSize: { type: Number, default: 0 },
        uploadedAt: { type: Date, default: Date.now },
        remarks: { type: String, default: '' },
        reviewedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Admin',
            default: null,
        },
        reviewedAt: { type: Date, default: null },
    },
    { timestamps: true }
);

vendorDocumentSchema.index({ vendorId: 1, createdAt: -1 });

const VendorDocument = mongoose.model('VendorDocument', vendorDocumentSchema);
export { VendorDocument };
export default VendorDocument;
