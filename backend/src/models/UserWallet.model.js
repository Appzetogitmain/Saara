import mongoose from 'mongoose';

const userWalletSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            unique: true,
            index: true,
        },
        balance: {
            type: Number,
            required: true,
            default: 0,
        },
        rewardPoints: {
            type: Number,
            required: true,
            default: 0,
        },
        cashbackBalance: {
            type: Number,
            required: true,
            default: 0,
        },
        totalCredits: {
            type: Number,
            required: true,
            default: 0,
        },
        totalDebits: {
            type: Number,
            required: true,
            default: 0,
        },
        currency: {
            type: String,
            required: true,
            default: 'INR',
        },
        status: {
            type: String,
            enum: ['active', 'locked'],
            default: 'active',
        },
    },
    { timestamps: true }
);

const UserWallet = mongoose.model('UserWallet', userWalletSchema);
export { UserWallet };
export default UserWallet;
