import mongoose from 'mongoose';

const webhookEventSchema = new mongoose.Schema(
    {
        eventId: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        provider: {
            type: String,
            default: 'razorpay',
        },
        eventType: {
            type: String,
        },
        status: {
            type: String,
            enum: ['processing', 'completed', 'failed'],
            default: 'processing',
            index: true,
        },
        payload: {
            type: mongoose.Schema.Types.Mixed,
        },
        error: {
            type: String,
        },
    },
    { timestamps: true }
);

const WebhookEvent = mongoose.model('WebhookEvent', webhookEventSchema);
export default WebhookEvent;
