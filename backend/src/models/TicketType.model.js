import mongoose from 'mongoose';

const ticketTypeSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, unique: true },
        description: { type: String },
        portals: [{ type: String, enum: ['customer', 'vendor', 'delivery'] }],
        icon: { type: String, default: '❓' },
        isActive: { type: Boolean, default: true },
        isArchived: { type: Boolean, default: false },
        isSystem: { type: Boolean, default: false },
        sortOrder: { type: Number, default: 0 },
    },
    { timestamps: true }
);

const TicketType = mongoose.model('TicketType', ticketTypeSchema);
export default TicketType;
