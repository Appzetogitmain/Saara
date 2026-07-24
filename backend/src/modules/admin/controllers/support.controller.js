import mongoose from 'mongoose';
import SupportTicket from '../../../models/SupportTicket.model.js';
import TicketType from '../../../models/TicketType.model.js';
import ApiError from '../../../utils/ApiError.js';
import { ApiResponse } from '../../../utils/ApiResponse.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { emitToRoom } from '../../../services/socket.service.js';
import { createNotification } from '../../../services/notification.service.js';

const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * @desc    Get all support tickets with filtering and pagination
 * @route   GET /api/admin/support/tickets
 * @access  Private (Admin)
 */
export const getAllTickets = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, search = '', status, priority, source, category, dateRange } = req.query;
    const pageNumber = Math.max(parseInt(page, 10) || 1, 1);
    const limitNumber = Math.max(parseInt(limit, 10) || 10, 1);

    const filter = {};

    if (status && status !== 'all') {
        filter.status = status;
    }

    if (priority && priority !== 'all') {
        filter.priority = priority;
    }

    if (category && category !== 'all') {
        filter.ticketTypeId = category;
    }

    if (source && source !== 'all') {
        if (source === 'customer') {
            filter.userId = { $exists: true, $ne: null };
        } else if (source === 'vendor') {
            filter.vendorId = { $exists: true, $ne: null };
        } else if (source === 'delivery') {
            filter.deliveryBoyId = { $exists: true, $ne: null };
        }
    }

    if (dateRange && dateRange !== 'all') {
        const now = new Date();
        if (dateRange === 'today') {
            const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            filter.createdAt = { $gte: startOfToday };
        } else if (dateRange === 'last_7_days') {
            const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            filter.createdAt = { $gte: sevenDaysAgo };
        } else if (dateRange === 'last_30_days') {
            const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            filter.createdAt = { $gte: thirtyDaysAgo };
        }
    }

    if (search) {
        const searchRegex = { $regex: search, $options: 'i' };

        // Find matching User IDs
        const matchingUsers = await mongoose.model('User').find({
            $or: [
                { name: searchRegex },
                { email: searchRegex }
            ]
        }).select('_id');
        const userIds = matchingUsers.map(u => u._id);

        // Find matching Vendor IDs
        const matchingVendors = await mongoose.model('Vendor').find({
            $or: [
                { name: searchRegex },
                { storeName: searchRegex },
                { email: searchRegex }
            ]
        }).select('_id');
        const vendorIds = matchingVendors.map(v => v._id);

        // Find matching Delivery Partner IDs
        const matchingDeliveries = await mongoose.model('DeliveryBoy').find({
            $or: [
                { name: searchRegex },
                { email: searchRegex }
            ]
        }).select('_id');
        const deliveryBoyIds = matchingDeliveries.map(d => d._id);

        // Find matching TicketType (category) IDs by name or icon
        const matchingTypes = await TicketType.find({
            $or: [
                { name: searchRegex },
                { icon: searchRegex }
            ]
        }).select('_id');
        const ticketTypeIds = matchingTypes.map(t => t._id);

        filter.$or = [
            { subject: searchRegex },
            { userId: { $in: userIds } },
            { vendorId: { $in: vendorIds } },
            { deliveryBoyId: { $in: deliveryBoyIds } },
            { ticketTypeId: { $in: ticketTypeIds } },
            ...(search.match(/^[0-9a-fA-F]{24}$/) ? [{ _id: search }] : [])
        ];
    }

    const tickets = await SupportTicket.find(filter)
        .populate('userId', 'name email phone')
        .populate('vendorId', 'storeName email')
        .populate('deliveryBoyId', 'name email phone')
        .populate('ticketTypeId', 'name icon')
        .sort({ updatedAt: -1 })
        .skip((pageNumber - 1) * limitNumber)
        .limit(limitNumber);

    const total = await SupportTicket.countDocuments(filter);

    // Fetch categories map for synchronous fallback
    const allCategories = await TicketType.find({});
    const categoryMap = {};
    const portalDefaultMap = {};

    allCategories.forEach(cat => {
        categoryMap[cat._id.toString()] = { name: cat.name, icon: cat.icon };
        if (cat.isSystem && cat.name.toLowerCase().includes('other')) {
            cat.portals.forEach(portal => {
                portalDefaultMap[portal] = { name: cat.name, icon: cat.icon };
            });
        }
    });

    // Normalize for frontend
    const normalizedTickets = tickets.map(ticket => {
        const portal = ticket.userId ? 'customer' : (ticket.vendorId ? 'vendor' : 'delivery');
        const catId = ticket.ticketTypeId?._id?.toString() || ticket.ticketTypeId?.toString();
        const catInfo = catId ? categoryMap[catId] : null;
        const fallback = portalDefaultMap[portal] || { name: 'Other', icon: '❓' };

        return {
            ...ticket._doc,
            id: ticket._id,
            customer: ticket.userId ? {
                name: ticket.userId.name,
                email: ticket.userId.email,
                phone: ticket.userId.phone
            } : (ticket.vendorId ? {
                name: ticket.vendorId.storeName,
                email: ticket.vendorId.email
            } : (ticket.deliveryBoyId ? {
                name: ticket.deliveryBoyId.name,
                email: ticket.deliveryBoyId.email,
                phone: ticket.deliveryBoyId.phone
            } : { name: 'Anonymous' })),
            raisedBy: ticket.userId ? 'customer' : (ticket.vendorId ? 'vendor' : (ticket.deliveryBoyId ? 'delivery' : 'unknown')),
            category: catInfo ? `${catInfo.icon} ${catInfo.name}` : `${fallback.icon} ${fallback.name}`,
            lastUpdate: ticket.updatedAt
        };
    });

    res.status(200).json(
        new ApiResponse(200, {
            tickets: normalizedTickets,
            pagination: {
                total,
                page: pageNumber,
                limit: limitNumber,
                pages: Math.ceil(total / limitNumber)
            }
        }, 'Support tickets fetched successfully')
    );
});

/**
 * @desc    Get ticket details with messages
 * @route   GET /api/admin/support/tickets/:id
 * @access  Private (Admin)
 */
export const getTicketById = asyncHandler(async (req, res) => {
    const ticket = await SupportTicket.findById(req.params.id)
        .populate('userId', 'name email phone')
        .populate('vendorId', 'storeName email')
        .populate('deliveryBoyId', 'name email phone')
        .populate('ticketTypeId', 'name icon');

    if (!ticket) {
        throw new ApiError(404, 'Ticket not found');
    }

    // Fallback category resolution
    const portal = ticket.userId ? 'customer' : (ticket.vendorId ? 'vendor' : 'delivery');
    let fallback = await TicketType.findOne({ isSystem: true, portals: portal, name: { $regex: /Other/i }, isArchived: false });
    if (!fallback) {
        fallback = { name: 'Other', icon: '❓' };
    }

    const catName = ticket.ticketTypeId ? ticket.ticketTypeId.name : fallback.name;
    const catIcon = ticket.ticketTypeId ? ticket.ticketTypeId.icon : fallback.icon;

    // Normalize
    const normalized = {
        ...ticket._doc,
        id: ticket._id,
        customer: ticket.userId ? {
            name: ticket.userId.name,
            email: ticket.userId.email,
            phone: ticket.userId.phone
        } : (ticket.vendorId ? {
            name: ticket.vendorId.storeName,
            email: ticket.vendorId.email
        } : (ticket.deliveryBoyId ? {
            name: ticket.deliveryBoyId.name,
            email: ticket.deliveryBoyId.email,
            phone: ticket.deliveryBoyId.phone
        } : { name: 'Anonymous' })),
        raisedBy: ticket.userId ? 'customer' : (ticket.vendorId ? 'vendor' : (ticket.deliveryBoyId ? 'delivery' : 'unknown')),
        category: `${catIcon} ${catName}`
    };

    res.status(200).json(
        new ApiResponse(200, normalized, 'Ticket details fetched successfully')
    );
});

/**
 * @desc    Update ticket status
 * @route   PATCH /api/admin/support/tickets/:id/status
 * @access  Private (Admin)
 */
export const updateTicketStatus = asyncHandler(async (req, res) => {
    const { status, priority } = req.body;

    const ticket = await SupportTicket.findById(req.params.id);

    if (!ticket) {
        throw new ApiError(404, 'Ticket not found');
    }

    if (status) {
        ticket.status = status;
        if (status === 'closed') {
            ticket.closedBy = 'admin';
            ticket.closedAt = new Date();
        }
    }
    if (priority) ticket.priority = priority;

    await ticket.save();

    // Notify user/vendor/delivery of status update
    const roomPrefix = ticket.vendorId ? 'vendor_' : (ticket.userId ? 'user_' : 'delivery_');
    const recipientId = ticket.vendorId || ticket.userId || ticket.deliveryBoyId;
    emitToRoom(`${roomPrefix}${recipientId}`, 'new_notification', {
        type: 'support_ticket_update',
        ticketId: ticket._id,
        status: ticket.status
    });

    res.status(200).json(
        new ApiResponse(200, ticket, 'Ticket status updated successfully')
    );
});

/**
 * @desc    Add message to ticket
 * @route   POST /api/admin/support/tickets/:id/messages
 * @access  Private (Admin)
 */
export const addTicketMessage = asyncHandler(async (req, res) => {
    const { message } = req.body;
    const trimmedMsg = String(message || '').trim();

    if (!trimmedMsg) {
        throw new ApiError(400, 'Message cannot be empty');
    }

    const ticket = await SupportTicket.findById(req.params.id);

    if (!ticket) {
        throw new ApiError(404, 'Ticket not found');
    }

    if (ticket.status === 'closed') {
        throw new ApiError(400, 'Cannot reply to a closed ticket');
    }

    // Append Admin message
    const newMessage = {
        senderId: req.user.id,
        senderType: 'admin',
        message: trimmedMsg
    };

    ticket.messages.push(newMessage);
    ticket.status = 'in_progress';
    await ticket.save();

    // Notify via socket
    const roomPrefix = ticket.vendorId ? 'vendor_' : (ticket.userId ? 'user_' : 'delivery_');
    const recipientId = ticket.vendorId || ticket.userId || ticket.deliveryBoyId;
    emitToRoom(`${roomPrefix}${recipientId}`, 'new_notification', {
        type: 'new_support_message',
        ticketId: ticket._id
    });

    const latestMsg = ticket.messages[ticket.messages.length - 1];
    const savedMessage = latestMsg.toObject();

    const msgWithTicket = {
        ...savedMessage,
        ticketId: ticket._id,
        status: ticket.status,
        updatedAt: ticket.updatedAt
    };

    // Notify ticket specific room
    emitToRoom(`ticket_${ticket._id}`, 'new_support_message', msgWithTicket);

    // Notify admin room and recipient role room
    emitToRoom('admin_room', 'new_support_message', msgWithTicket);
    emitToRoom(`${roomPrefix}${recipientId}`, 'new_support_message', msgWithTicket);

    res.status(200).json(
        new ApiResponse(200, latestMsg, 'Reply sent successfully')
    );
});

/**
 * @desc    Get all ticket types (Categories)
 * @route   GET /api/admin/support/ticket-types
 * @access  Private (Admin)
 */
export const getAllTicketTypes = asyncHandler(async (req, res) => {
    const { status } = req.query;
    const filter = { isArchived: false };

    if (status === 'active') filter.isActive = true;
    if (status === 'inactive') filter.isActive = false;

    const ticketTypes = await TicketType.find(filter).sort({ sortOrder: 1 });

    const normalized = ticketTypes.map((type) => ({
        ...type._doc,
        id: type._id,
        status: type.isActive ? 'active' : 'inactive',
    }));

    res.status(200).json(new ApiResponse(200, normalized, 'Support categories fetched successfully'));
});

/**
 * @desc    Create ticket type (Category)
 * @route   POST /api/admin/support/ticket-types
 * @access  Private (Admin)
 */
export const createTicketType = asyncHandler(async (req, res) => {
    const { name, description, portals, icon, status, sortOrder } = req.body;
    const trimmedName = String(name || '').trim();
    const trimmedDesc = String(description || '').trim();
    const trimmedIcon = String(icon || '❓').trim();

    if (!trimmedName || trimmedName.length < 3 || trimmedName.length > 50) {
        throw new ApiError(400, 'Support category name must be between 3 and 50 characters');
    }

    if (trimmedDesc.length > 200) {
        throw new ApiError(400, 'Description must not exceed 200 characters');
    }

    if (!Array.isArray(portals) || portals.length === 0) {
        throw new ApiError(400, 'At least one portal mapping is required');
    }

    const existing = await TicketType.findOne({
        name: new RegExp(`^${escapeRegex(trimmedName)}$`, 'i'),
        isArchived: false
    });
    if (existing) throw new ApiError(409, 'Support category already exists');

    // Get default sort order if not provided
    let calculatedSortOrder = parseInt(sortOrder, 10);
    if (isNaN(calculatedSortOrder)) {
        const count = await TicketType.countDocuments({ isArchived: false });
        calculatedSortOrder = count;
    }

    const ticketType = await TicketType.create({
        name: trimmedName,
        description: trimmedDesc,
        portals,
        icon: trimmedIcon,
        isActive: status ? status === 'active' : true,
        sortOrder: calculatedSortOrder
    });

    res.status(201).json(
        new ApiResponse(
            201,
            { ...ticketType._doc, id: ticketType._id, status: ticketType.isActive ? 'active' : 'inactive' },
            'Support category created successfully'
        )
    );
});

/**
 * @desc    Update ticket type (Category)
 * @route   PUT /api/admin/support/ticket-types/:id
 * @access  Private (Admin)
 */
export const updateTicketType = asyncHandler(async (req, res) => {
    const { name, description, portals, icon, status, sortOrder } = req.body;
    const ticketType = await TicketType.findById(req.params.id);

    if (!ticketType) throw new ApiError(404, 'Support category not found');

    const nextActive = status !== undefined ? (String(status).toLowerCase() === 'active') : ticketType.isActive;
    const nextPortals = portals !== undefined ? portals : ticketType.portals;

    // Validation Guard: Ensure every portal has at least one active category
    if (!nextActive) {
        for (const portal of nextPortals) {
            const activeCount = await TicketType.countDocuments({
                _id: { $ne: req.params.id },
                portals: portal,
                isActive: true,
                isArchived: false
            });
            if (activeCount === 0) {
                throw new ApiError(400, `Cannot disable this category. The '${portal}' portal must have at least one active category.`);
            }
        }
    }

    // System Protection: block name/portals change for core categories
    if (ticketType.isSystem) {
        if (name !== undefined && String(name).trim() !== ticketType.name) {
            throw new ApiError(400, 'System categories cannot be renamed');
        }
        if (portals !== undefined) {
            // Verify portals are not removed
            const hasAll = ticketType.portals.every(p => portals.includes(p));
            if (!hasAll) throw new ApiError(400, 'System category portals cannot be removed');
        }
    }

    if (name !== undefined) {
        const trimmedName = String(name || '').trim();
        if (!trimmedName || trimmedName.length < 3 || trimmedName.length > 50) {
            throw new ApiError(400, 'Support category name must be between 3 and 50 characters');
        }

        const existing = await TicketType.findOne({
            _id: { $ne: req.params.id },
            name: new RegExp(`^${escapeRegex(trimmedName)}$`, 'i'),
            isArchived: false
        });
        if (existing) throw new ApiError(409, 'Support category already exists');

        ticketType.name = trimmedName;
    }

    if (description !== undefined) {
        const trimmedDesc = String(description || '').trim();
        if (trimmedDesc.length > 200) {
            throw new ApiError(400, 'Description must not exceed 200 characters');
        }
        ticketType.description = trimmedDesc;
    }

    if (portals !== undefined) {
        if (!Array.isArray(portals) || portals.length === 0) {
            throw new ApiError(400, 'At least one portal mapping is required');
        }
        ticketType.portals = portals;
    }

    if (icon !== undefined) {
        ticketType.icon = String(icon || '❓').trim();
    }

    if (status !== undefined) {
        ticketType.isActive = nextActive;
    }

    if (sortOrder !== undefined) {
        ticketType.sortOrder = parseInt(sortOrder, 10) || 0;
    }

    await ticketType.save();

    res.status(200).json(
        new ApiResponse(
            200,
            { ...ticketType._doc, id: ticketType._id, status: ticketType.isActive ? 'active' : 'inactive' },
            'Support category updated successfully'
        )
    );
});

/**
 * @desc    Delete/Archive ticket type (Category)
 * @route   DELETE /api/admin/support/ticket-types/:id
 * @access  Private (Admin)
 */
export const deleteTicketType = asyncHandler(async (req, res) => {
    const ticketType = await TicketType.findById(req.params.id);
    if (!ticketType) throw new ApiError(404, 'Support category not found');

    if (ticketType.isSystem) {
        throw new ApiError(400, 'System categories cannot be deleted or archived');
    }

    // Check if category is used by existing tickets
    const usedCount = await SupportTicket.countDocuments({ ticketTypeId: req.params.id });
    if (usedCount > 0) {
        throw new ApiError(400, 'This category is used by existing support tickets and cannot be deleted or archived. You can deactivate (disable) it instead.');
    }

    // Hard delete if it was never used
    await TicketType.findByIdAndDelete(req.params.id);

    res.status(200).json(new ApiResponse(200, null, 'Support category deleted successfully'));
});

/**
 * @desc    Reorder ticket types (Categories)
 * @route   POST /api/admin/support/ticket-types/reorder
 * @access  Private (Admin)
 */
export const reorderTicketTypes = asyncHandler(async (req, res) => {
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds)) {
        throw new ApiError(400, 'orderedIds must be an array of category IDs');
    }

    for (let i = 0; i < orderedIds.length; i++) {
        await TicketType.findByIdAndUpdate(orderedIds[i], { $set: { sortOrder: i } });
    }

    res.status(200).json(new ApiResponse(200, null, 'Support categories reordered successfully'));
});
