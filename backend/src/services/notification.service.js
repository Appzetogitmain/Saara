import Notification from '../models/Notification.model.js';
import { emitToRoom } from './socket.service.js';

/**
 * Create a notification for a user/vendor/delivery/admin
 * @param {Object} options - { recipientId, recipientType, title, message, type, data }
 */
export const createNotification = async ({ recipientId, recipientType, title, message, type = 'system', data = {} }) => {
    const notification = await Notification.create({ recipientId, recipientType, title, message, type, data });
    
    // Real-time broadcast
    const room = `${recipientType}_${recipientId}`;
    emitToRoom(room, 'notification', notification);
    emitToRoom(room, 'new_notification', notification);
    
    return notification;
};

/**
 * Get unread notifications for a recipient
 */
export const getUnreadNotifications = async (recipientId, recipientType) => {
    return Notification.find({ recipientId, recipientType, isRead: false }).sort({ createdAt: -1 }).limit(20);
};

/**
 * Mark all notifications as read for a recipient
 */
export const markAllAsRead = async (recipientId, recipientType) => {
    return Notification.updateMany({ recipientId, recipientType, isRead: false }, { isRead: true });
};
