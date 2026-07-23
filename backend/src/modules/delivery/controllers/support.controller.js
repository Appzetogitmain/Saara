import mongoose from 'mongoose';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { ApiResponse } from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import SupportTicket from '../../../models/SupportTicket.model.js';
import TicketType from '../../../models/TicketType.model.js';
import { emitToRoom } from '../../../services/socket.service.js';

// GET /api/delivery/support/ticket-types
export const getTicketTypes = asyncHandler(async (req, res) => {
    const types = await TicketType.find({
        isActive: true,
        isArchived: false,
        portals: 'delivery'
    }).sort({ sortOrder: 1 });
    res.status(200).json(new ApiResponse(200, types, 'Support categories fetched.'));
});

// GET /api/delivery/support/tickets
export const getMyTickets = asyncHandler(async (req, res) => {
    const tickets = await SupportTicket.find({ deliveryBoyId: req.user.id })
        .populate('ticketTypeId', 'name icon')
        .sort({ updatedAt: -1 })
        .lean();
    res.status(200).json(new ApiResponse(200, tickets, 'Support tickets fetched.'));
});

// POST /api/delivery/support/tickets
export const createTicket = asyncHandler(async (req, res) => {
    const { subject, message, priority = 'medium', ticketTypeId } = req.body;
    const trimmedSubject = String(subject || '').trim();
    const trimmedMessage = String(message || '').trim();

    if (!trimmedSubject || !trimmedMessage || !ticketTypeId) {
        throw new ApiError(400, 'Subject, message and category are required.');
    }

    if (trimmedSubject.length < 3 || trimmedSubject.length > 100) {
        throw new ApiError(400, 'Subject must be between 3 and 100 characters.');
    }

    if (trimmedMessage.length < 3 || trimmedMessage.length > 1000) {
        throw new ApiError(400, 'Message must be between 3 and 1000 characters.');
    }

    const ticketType = await TicketType.findOne({
        _id: ticketTypeId,
        isActive: true,
        isArchived: false,
        portals: 'delivery'
    });
    if (!ticketType) {
        throw new ApiError(400, 'Invalid or inactive support category.');
    }

    const ticket = await SupportTicket.create({
        deliveryBoyId: req.user.id,
        ticketTypeId,
        subject: trimmedSubject,
        priority,
        messages: [{
            senderId: req.user.id,
            senderType: 'delivery',
            message: trimmedMessage
        }],
    });

    // Fetch delivery boy for name
    const rider = await mongoose.model('DeliveryBoy').findById(req.user.id);

    // Notify Admin
    emitToRoom('admin_room', 'new_notification', {
        type: 'new_support_ticket',
        ticketId: ticket._id,
        from: rider?.name || 'Delivery Partner',
        subject: ticket.subject
    });

    res.status(201).json(new ApiResponse(201, ticket, 'Support ticket created.'));
});

// POST /api/delivery/support/tickets/:id/message
export const replyToTicket = asyncHandler(async (req, res) => {
    const { message } = req.body;
    const ticket = await SupportTicket.findOne({ _id: req.params.id, deliveryBoyId: req.user.id });

    if (!ticket) throw new ApiError(404, 'Ticket not found.');
    if (ticket.status === 'closed') throw new ApiError(400, 'Cannot reply to a closed ticket.');

    const newMessage = {
        senderId: req.user.id,
        senderType: 'delivery',
        message
    };
    
    ticket.messages.push(newMessage);
    ticket.status = 'open'; // Re-open if it was resolved
    await ticket.save();

    // Fetch delivery boy for name
    const rider = await mongoose.model('DeliveryBoy').findById(req.user.id);

    const latestMsg = ticket.messages[ticket.messages.length - 1];
    const savedMessage = latestMsg.toObject();

    const msgWithTicket = {
        ...savedMessage,
        ticketId: ticket._id,
        status: ticket.status,
        updatedAt: ticket.updatedAt
    };

    // Notify Admin
    emitToRoom(`ticket_${ticket._id}`, 'new_support_message', msgWithTicket);
    emitToRoom(`delivery_${ticket.deliveryBoyId}`, 'new_support_message', msgWithTicket);
    emitToRoom('admin_room', 'new_support_message', msgWithTicket);
    emitToRoom('admin_room', 'new_notification', {
        type: 'support_reply',
        ticketId: ticket._id,
        from: rider?.name || 'Delivery Partner'
    });

    res.status(200).json(new ApiResponse(200, ticket, 'Reply added.'));
});
