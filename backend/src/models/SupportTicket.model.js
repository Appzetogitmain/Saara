import mongoose from 'mongoose';

const supportTicketSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
        vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', index: true },
        deliveryBoyId: { type: mongoose.Schema.Types.ObjectId, ref: 'DeliveryBoy', index: true },
        ticketTypeId: { type: mongoose.Schema.Types.ObjectId, ref: 'TicketType' },
        subject: { type: String, required: true },
        status: {
            type: String,
            enum: ['open', 'in_progress', 'resolved', 'closed'],
            default: 'open',
            index: true,
        },
        priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
        closedBy: { type: String, enum: ['admin', 'user', 'vendor', 'delivery'] },
        closedAt: { type: Date },
        messages: [
            {
                senderId: { type: mongoose.Schema.Types.ObjectId },
                senderType: { type: String, enum: ['user', 'vendor', 'admin', 'delivery'] },
                message: String,
                attachments: [String],
                createdAt: { type: Date, default: Date.now },
            },
        ],
    },
    { timestamps: true }
);

const SupportTicket = mongoose.model('SupportTicket', supportTicketSchema);
export { SupportTicket };
export default SupportTicket;
