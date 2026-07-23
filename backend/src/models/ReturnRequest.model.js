import mongoose from 'mongoose';

const returnRequestSchema = new mongoose.Schema(
    {
        orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
        vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', index: true },
        items: [
            {
                productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
                name: String,
                quantity: Number,
                reason: String,
            },
        ],
        requestType: {
            type: String,
            enum: ['return', 'exchange'],
            default: 'return',
            required: true,
            index: true,
        },
        exchangeDetails: {
            requestedVariant: {
                size: String,
                color: String,
                variantKey: String,
            },
            newProductPrice:   { type: Number },
            oldProductPrice:   { type: Number },
            priceDelta:        { type: Number }, // positive = customer owes extra; negative = customer gets refund
            priceDeltaStatus:  { type: String, enum: ['pending', 'collected', 'refunded', 'waived'], default: 'pending' },
            exchangePaymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentAttempt' },
        },
        evidenceImages: [
            {
                url: String,
                public_id: String,
            }
        ],
        returnReason: {
            type: String,
            enum: [
                "Wrong Size",
                "Wrong Color",
                "Received Wrong Variant",
                "Defective Product",
                "Wrong Product Received",
                "Product Damaged",
                "Quality Not As Expected",
                "Missing Parts or Accessories",
                "Product Not Matching Description",
                "Changed My Mind",
                "Other"
            ],
            required: true
        },
        customReason: {
            type: String,
            default: ""
        },
        status: {
            type: String,
            enum: [
                'pending',
                'approved',
                'pickup_pending',
                'pickup_assigned',
                'picked_up',
                'delivered_to_vendor',
                'replacement_preparing',
                'replacement_ready',
                'replacement_assigned',
                'out_for_delivery',
                'completed',
                'rejected'
            ],
            default: 'pending',
            index: true,
        },
        refundAmount: Number,
        refundStatus: { type: String, enum: ['pending', 'processed', 'failed'] },
        adminNote: String,
        rejectionReason: String,
        images: [String],
        deliveryBoyId: { type: mongoose.Schema.Types.ObjectId, ref: 'DeliveryBoy', index: true },
        deliveryAssignmentStatus: {
            type: String,
            enum: ['pending', 'assigned', 'accepted', 'failed'],
            default: 'pending',
            index: true,
        },
        rejectedDeliveryBoys: [{ type: mongoose.Schema.Types.ObjectId, ref: 'DeliveryBoy' }],
        returnPickupOtpHash: { type: String, default: null },
        returnPickupOtpExpiresAt: { type: Date, default: null },
        returnPickupOtpAttempts: { type: Number, default: 0 },
        returnPickupOtpDebug: { type: String, default: null },
        returnPickupOtpVerified: { type: Boolean, default: false },
        riderPickupPhotos: [
            {
                url: String,
                public_id: String,
            }
        ],
        vendorHandoffOtpHash: { type: String, default: null },
        vendorHandoffOtpExpiresAt: { type: Date, default: null },
        vendorHandoffOtpAttempts: { type: Number, default: 0 },
        vendorHandoffOtpDebug: { type: String, default: null },
        vendorHandoffOtpVerified: { type: Boolean, default: false },
        
        vendorHandoverOtpHash: { type: String, default: null },
        vendorHandoverOtpExpiresAt: { type: Date, default: null },
        vendorHandoverOtpAttempts: { type: Number, default: 0 },
        vendorHandoverOtpDebug: { type: String, default: null },
        vendorHandoverOtpVerified: { type: Boolean, default: false },

        customerDeliveryOtpHash: { type: String, default: null },
        customerDeliveryOtpExpiresAt: { type: Date, default: null },
        customerDeliveryOtpAttempts: { type: Number, default: 0 },
        customerDeliveryOtpDebug: { type: String, default: null },
        customerDeliveryOtpVerified: { type: Boolean, default: false },
        returnPickupPayoutProcessed: { type: Boolean, default: false, index: true },
        returnPickupPayoutProcessedAt: Date,
        replacementPayoutProcessed: { type: Boolean, default: false, index: true },
        replacementPayoutProcessedAt: Date,
        refundDetails: {
            method:      { type: String, enum: ['bank', 'upi'] },
            bankDetails: {
                accountHolder: String,
                accountNumber: String,
                ifsc:          String,
                bankName:      String,
            },
            upiId: { type: String },
        },
        refundId: { type: mongoose.Schema.Types.ObjectId, ref: 'Refund' },
        statusHistory: [
            {
                status: { type: String, required: true },
                changedAt: { type: Date, default: Date.now },
                performedByRole: { type: String, enum: ['admin', 'vendor', 'delivery_partner', 'user', 'system'], required: true },
                performedById: { 
                    type: mongoose.Schema.Types.ObjectId, 
                    required: function() {
                        return this.performedByRole !== 'system';
                    }
                },
                performedByName: { type: String, required: true },
                notes: { type: String }
            }
        ],
    },
    { timestamps: true }
);

const ReturnRequest = mongoose.model('ReturnRequest', returnRequestSchema);
export { ReturnRequest };
export default ReturnRequest;
