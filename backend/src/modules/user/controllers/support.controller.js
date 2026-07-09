import SupportTicket from '../../../models/SupportTicket.model.js';
import TicketType from '../../../models/TicketType.model.js';
import { ApiError } from '../../../utils/ApiError.js';
import { ApiResponse } from '../../../utils/ApiResponse.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { emitToRoom } from '../../../services/socket.service.js';

/**
 * @desc    Create a new support ticket
 * @route   POST /api/user/support/tickets
 * @access  Private (User)
 */
export const createTicket = asyncHandler(async (req, res) => {
    const { subject, message, ticketTypeId, priority = 'low' } = req.body;
    const trimmedSubject = String(subject || '').trim();
    const trimmedMessage = String(message || '').trim();

    if (!trimmedSubject || !trimmedMessage || !ticketTypeId) {
        throw new ApiError(400, 'Subject, message and category are required');
    }

    if (trimmedSubject.length < 3 || trimmedSubject.length > 100) {
        throw new ApiError(400, 'Subject must be between 3 and 100 characters');
    }

    if (trimmedMessage.length < 3 || trimmedMessage.length > 1000) {
        throw new ApiError(400, 'Message must be between 3 and 1000 characters');
    }

    const ticketType = await TicketType.findOne({
        _id: ticketTypeId,
        isActive: true,
        isArchived: false,
        portals: 'customer'
    });
    if (!ticketType) {
        throw new ApiError(400, 'Invalid or inactive support category');
    }

    const ticket = await SupportTicket.create({
        userId: req.user.id,
        subject: trimmedSubject,
        ticketTypeId,
        priority,
        status: 'open',
        messages: [{
            senderId: req.user.id,
            senderType: 'user',
            message: trimmedMessage
        }]
    });

    res.status(201).json(
        new ApiResponse(201, ticket, 'Support ticket created successfully')
    );
});

/**
 * @desc    Get all support tickets for the logged in user
 * @route   GET /api/user/support/tickets
 * @access  Private (User)
 */
export const getUserTickets = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, status } = req.query;
    const filter = { userId: req.user.id };

    if (status && status !== 'all') {
        filter.status = status;
    }

    const tickets = await SupportTicket.find(filter)
        .populate('ticketTypeId', 'name')
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit));

    const total = await SupportTicket.countDocuments(filter);

    res.status(200).json(
        new ApiResponse(200, {
            tickets,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit)
            }
        }, 'User tickets fetched successfully')
    );
});

/**
 * @desc    Get ticket details
 * @route   GET /api/user/support/tickets/:id
 * @access  Private (User)
 */
export const getTicketById = asyncHandler(async (req, res) => {
    const ticket = await SupportTicket.findOne({
        _id: req.params.id,
        userId: req.user.id
    }).populate('ticketTypeId', 'name');

    if (!ticket) {
        throw new ApiError(404, 'Ticket not found');
    }

    res.status(200).json(
        new ApiResponse(200, ticket, 'Ticket details fetched successfully')
    );
});

/**
 * @desc    Add message to ticket
 * @route   POST /api/user/support/tickets/:id/messages
 * @access  Private (User)
 */
export const addTicketMessage = asyncHandler(async (req, res) => {
    const { message } = req.body;
    if (!message || !message.trim()) {
        throw new ApiError(400, 'Message is required');
    }

    const ticket = await SupportTicket.findOne({
        _id: req.params.id,
        userId: req.user.id
    });

    if (!ticket) {
        throw new ApiError(404, 'Ticket not found');
    }

    if (ticket.status === 'closed') {
        throw new ApiError(400, 'Cannot reply to a closed ticket');
    }

    ticket.messages.push({
        senderId: req.user.id,
        senderType: 'user',
        message: message.trim()
    });

    // If it was resolved, reopen it? Or just keep it as is.
    // Usually, user reply keeps it in_progress or open.
    if (ticket.status === 'resolved') {
        ticket.status = 'in_progress';
    }

    await ticket.save();

    const latestMsg = ticket.messages[ticket.messages.length - 1];

    const savedMessage = latestMsg.toObject();

    const msgWithTicket = {
        ...savedMessage,
        ticketId: ticket._id,
        status: ticket.status,
        updatedAt: ticket.updatedAt
    };

    // Real-time update
    emitToRoom(`ticket_${ticket._id}`, 'new_support_message', msgWithTicket);
    emitToRoom(`user_${ticket.userId}`, 'new_support_message', msgWithTicket);
    emitToRoom('admin_room', 'new_support_message', msgWithTicket);

    res.status(200).json(
        new ApiResponse(200, latestMsg, 'Message added successfully')
    );
});

/**
 * @desc    Get active ticket types
 * @route   GET /api/user/support/ticket-types
 * @access  Private (User)
 */
export const getActiveTicketTypes = asyncHandler(async (req, res) => {
    const ticketTypes = await TicketType.find({
        isActive: true,
        isArchived: false,
        portals: 'customer'
    }).sort({ sortOrder: 1 });
    res.status(200).json(new ApiResponse(200, ticketTypes, 'Support categories fetched successfully'));
});
