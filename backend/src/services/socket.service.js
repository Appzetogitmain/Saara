import { Server } from 'socket.io';
import { verifyAccessToken } from '../config/jwt.js';
import logger from '../utils/logger.js';

let io;

const ALLOWED_ORIGINS = process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(',').map((o) => o.trim())
    : ['http://localhost:5173'];

// Rooms that require authentication to join
const PROTECTED_ROOM_PREFIXES = ['user_', 'vendor_', 'delivery_', 'order_', 'chat_', 'admin_'];

const isProtectedRoom = (room) =>
    PROTECTED_ROOM_PREFIXES.some((prefix) => String(room || '').startsWith(prefix));

export const initSocket = (server) => {
    io = new Server(server, {
        cors: {
            origin: ALLOWED_ORIGINS,
            methods: ['GET', 'POST'],
            credentials: true,
        },
    });

    // Authenticate socket connection via JWT in handshake
    io.use((socket, next) => {
        const token =
            socket.handshake.auth?.token ||
            socket.handshake.headers?.authorization?.replace('Bearer ', '');

        if (token) {
            try {
                socket.user = verifyAccessToken(token);
            } catch {
                // Non-fatal: public clients won't have a token.
                // Protected rooms will be blocked at join time.
                socket.user = null;
            }
        } else {
            socket.user = null;
        }

        next();
    });

    io.on('connection', (socket) => {
        socket.on('join', (room) => {
            const roomStr = String(room || '').trim();
            if (!roomStr) return;

            // Block unauthenticated clients from joining protected rooms
            if (isProtectedRoom(roomStr) && !socket.user) {
                socket.emit('error', { message: 'Authentication required to join this room.' });
                return;
            }

            // Enforce private room access: role_ID (e.g., user_123)
            const privatePrefixes = ['user_', 'vendor_', 'delivery_'];
            const matchedPrefix = privatePrefixes.find(p => roomStr.startsWith(p));
            
            if (matchedPrefix && socket.user) {
                const requestedId = roomStr.replace(matchedPrefix, '');
                const currentId = String(socket.user.id || '');
                const isAdmin = socket.user.role === 'admin' || socket.user.role === 'superadmin';
                
                if (!isAdmin && requestedId !== currentId) {
                    socket.emit('error', { message: 'Access denied to this private room.' });
                    return;
                }
            }
            socket.join(roomStr);
        });

        socket.on('leave', (room) => {
            const roomStr = String(room || '').trim();
            if (roomStr) {
                socket.leave(roomStr);
            }
        });

        socket.on('disconnect', () => {
            logger.info(`Socket disconnected: ${socket.id}`);
        });
    });

    return io;
};

export const getIO = () => {
    if (!io) throw new Error('Socket.io not initialized!');
    return io;
};

// Helper to emit events to a specific room
export const emitToRoom = (room, event, data) => {
    if (io) io.to(room).emit(event, data);
};

// Helper to notify order updates real-time
export const notifyOrderUpdate = async (order) => {
    try {
        if (!order) return;
        const payload = order.toObject ? order.toObject() : order;
        const orderId = payload._id || payload.orderId;
        const userId = payload.userId?._id || payload.userId;
        const deliveryBoyId = payload.deliveryBoyId?._id || payload.deliveryBoyId;

        // Emit to the specific order room
        emitToRoom(`order_${orderId}`, 'order_updated', payload);

        // Emit to user room
        if (userId) {
            emitToRoom(`user_${userId}`, 'order_updated', payload);
        }

        // Emit to delivery boy room
        if (deliveryBoyId) {
            emitToRoom(`delivery_${deliveryBoyId}`, 'order_updated', payload);
        }

        // Emit to admin room
        emitToRoom('admin_room', 'order_updated', payload);

        // Emit to all vendors involved
        if (Array.isArray(payload.vendorItems)) {
            const vendorIds = [...new Set(payload.vendorItems.map(item => String(item.vendorId?._id || item.vendorId || '')))].filter(Boolean);
            vendorIds.forEach(vendorId => {
                emitToRoom(`vendor_${vendorId}`, 'order_updated', payload);
            });
        }
    } catch (err) {
        logger.error('[SOCKET_ERROR] Error emitting order status update:', { message: err.message, orderId: order?._id });
    }
};

// Helper to notify return updates real-time
export const notifyReturnUpdate = async (request) => {
    try {
        if (!request) return;
        const payload = request.toObject ? request.toObject() : request;
        const returnId = payload._id;
        const orderId = payload.orderId;
        const userId = payload.userId?._id || payload.userId;
        const vendorId = payload.vendorId?._id || payload.vendorId;
        const deliveryBoyId = payload.deliveryBoyId?._id || payload.deliveryBoyId;

        // Emit to specific order room
        if (orderId) {
            emitToRoom(`order_${orderId}`, 'return_updated', payload);
        }

        // Emit to user room
        if (userId) {
            emitToRoom(`user_${userId}`, 'return_updated', payload);
        }

        // Emit to vendor room
        if (vendorId) {
            emitToRoom(`vendor_${vendorId}`, 'return_updated', payload);
        }

        // Emit to delivery boy room
        if (deliveryBoyId) {
            emitToRoom(`delivery_${deliveryBoyId}`, 'return_updated', payload);
        }

        // Emit to admin room
        emitToRoom('admin_room', 'return_updated', payload);
    } catch (err) {
        logger.error('[SOCKET_ERROR] Error emitting return status update:', { message: err.message, returnRequestId: request?._id });
    }
};
