import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const deliveryBoySchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        email: { type: String, required: true, unique: true, lowercase: true },
        password: { type: String, required: true, select: false },
        phone: { type: String, required: true },
        address: { type: String, required: [true, 'Address is required'], trim: true },
        vehicleType: { type: String, required: [true, 'Vehicle type is required'], trim: true },
        vehicleNumber: { type: String, required: [true, 'Vehicle number is required'], trim: true },
        avatar: { type: String },
        applicationStatus: {
            type: String,
            enum: ['pending', 'approved', 'rejected'],
            default: 'pending',
            index: true,
        },
        rejectionReason: { type: String, trim: true },
        documents: {
            drivingLicense: { type: String, trim: true },
            aadharCard: { type: String, trim: true },
        },
        resetOtp: { type: String, select: false },
        resetOtpExpiry: { type: Date, select: false },
        resetOtpVerified: { type: Boolean, default: false, select: false },
        refreshTokenHash: { type: String, select: false },
        refreshTokenExpiresAt: { type: Date, select: false },
        isActive: { type: Boolean, default: true },
        isAvailable: { type: Boolean, default: true },
        status: {
            type: String,
            enum: ['available', 'busy', 'offline'],
            default: 'available',
        },
        currentLocation: {
            type: { type: String, enum: ['Point'], default: 'Point' },
            coordinates: { type: [Number], default: [0, 0] }
        },
        totalDeliveries: { type: Number, default: 0 },
        rating: { type: Number, default: 0 },
        cashCollected: { type: Number, default: 0 },
        maxActiveOrders: { type: Number, default: 3 },
        walletBalance: { type: Number, default: 0 },
        cashInHand: { type: Number, default: 0 },
        payoutMethodDetails: {
            type: {
                method: { type: String, enum: ['bank', 'upi'] },
                bankDetails: {
                    accountHolder: String,
                    accountNumber: String,
                    ifsc: String,
                    bankName: String
                },
                upiId: String
            },
            select: false
        }
    },
    { timestamps: true }
);

deliveryBoySchema.index({ currentLocation: "2dsphere" });

deliveryBoySchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 12);
    next();
});

deliveryBoySchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

const DeliveryBoy = mongoose.model('DeliveryBoy', deliveryBoySchema);
export default DeliveryBoy;
