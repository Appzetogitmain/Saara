import mongoose from 'mongoose';

const storeInquirySchema = new mongoose.Schema(
    {
        storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'VendorStore', required: true, index: true },
        vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
        customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
        customerName: { type: String, required: true },
        customerEmail: { type: String, required: true },
        subject: { type: String, default: 'Storefront Inquiry' },
        message: { type: String, required: true },
        replies: [
            {
                senderType: { type: String, enum: ['vendor'], default: 'vendor' },
                senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
                message: { type: String, required: true },
                createdAt: { type: Date, default: Date.now }
            }
        ],
        internalNotes: [
            {
                message: { type: String, required: true },
                createdAt: { type: Date, default: Date.now },
                createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' }
            }
        ],
        status: {
            type: String,
            enum: ['new', 'in_progress', 'replied', 'closed'],
            default: 'new',
            index: true
        },
        isRead: { type: Boolean, default: false },
        lastActivityAt: { type: Date, default: Date.now, index: true }
    },
    { timestamps: true }
);

const StoreInquiry = mongoose.model('StoreInquiry', storeInquirySchema);
export { StoreInquiry };
export default StoreInquiry;
