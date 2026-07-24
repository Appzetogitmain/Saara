import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const vendorSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        email: { type: String, required: true, unique: true, lowercase: true, index: true },
        password: { type: String, required: true, select: false },
        phone: { type: String },
        storeName: { type: String, required: true },
        storeLogo: { type: String },
        storeDescription: { type: String },
        storefrontId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'VendorStore',
            default: null
        },
        status: {
            type: String,
            enum: ['pending', 'approved', 'suspended', 'rejected'],
            default: 'pending',
            index: true,
        },
        suspensionReason: { type: String },
        commissionRate: { type: Number, default: 10, min: 0, max: 100 },
        isVerified: { type: Boolean, default: false },
        rating: { type: Number, default: 0 },
        reviewCount: { type: Number, default: 0 },
        totalSales: { type: Number, default: 0 },
        totalEarnings: { type: Number, default: 0 },
        address: {
            street: String,
            city: String,
            state: String,
            zipCode: String,
            country: String,
            location: {
                type: { type: String, default: 'Point' },
                coordinates: [Number] // [lng, lat]
            }
        },

        // Warehouse / Pickup Address — required for courier provider pickup scheduling.
        // This is distinct from the business registration address above.
        // Couriers ALWAYS use this address for pickup, never the address above.
        warehouseAddress: {
            warehouseName:  { type: String, trim: true }, // e.g., "Main Warehouse"
            contactPerson:  { type: String, trim: true }, // person courier should contact
            contactNumber:  { type: String, trim: true },
            address:        { type: String, trim: true }, // full street address
            city:           { type: String, trim: true },
            state:          { type: String, trim: true },
            pincode:        { type: String, trim: true },
            location: {
                type:        { type: String, default: 'Point' },
                coordinates: [Number] // [longitude, latitude]
            },
            // Map of providerId → provider's registered pickup location ID.
            // Example: { 'shiprocket': 'WH_001', 'delhivery': 'DLV_PKL_9823' }
            // No schema change needed when a new courier provider is added.
            providerPickupLocationIds: {
                type: Map,
                of:   String,
            },
            isVerified: { type: Boolean, default: false }, // admin-verified
            verifiedAt: { type: Date },
        },
        bankDetails: {
            accountName: { type: String, select: false },
            accountNumber: { type: String, select: false },
            bankName: { type: String, select: false },
            ifscCode: { type: String, select: false },
        },
        paymentMethods: {
            bankTransfer: { type: Boolean, default: true },
            upi: { type: Boolean, default: false },
            paypal: { type: Boolean, default: false },
        },
        upiId: { type: String, select: false },
        paypalEmail: { type: String, select: false },
        documents: {
            gst: String,
            pan: String,
            aadhar: String,
            businessLicense: String,
        },
        otp: { type: String, select: false },
        otpExpiry: { type: Date, select: false },
        resetOtp: { type: String, select: false },
        resetOtpExpiry: { type: Date, select: false },
        resetOtpVerified: { type: Boolean, default: false, select: false },
        refreshTokenHash: { type: String, select: false },
        refreshTokenExpiresAt: { type: Date, select: false },
        joinDate: { type: Date, default: Date.now },
        walletBalance: { type: Number, default: 0 },
        onHoldBalance: { type: Number, default: 0 },
        pendingWithdrawal: { type: Number, default: 0 },
        totalWithdrawn: { type: Number, default: 0 },
        statusHistory: [
            {
                previousStatus: { type: String },
                newStatus: { type: String },
                reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
                reviewedAt: { type: Date, default: Date.now },
                reason: { type: String },
            }
        ],
    },
    { timestamps: true }
);

vendorSchema.index({ status: 1, rating: -1, reviewCount: -1, createdAt: -1 });
vendorSchema.index({ status: 1, createdAt: -1 });

vendorSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 12);
    next();
});

vendorSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

const Vendor = mongoose.model('Vendor', vendorSchema);
export { Vendor };
export default Vendor;
