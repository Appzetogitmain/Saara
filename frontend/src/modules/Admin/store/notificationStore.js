import { create } from 'zustand';
import {
    getAdminNotifications,
    markNotificationAsRead,
    markAllNotificationsAsRead
} from '../services/adminService';
import toast from 'react-hot-toast';

export const useNotificationStore = create((set, get) => ({
    notifications: [],
    unreadCount: 0,
    isLoading: false,
    page: 1,
    hasMore: true,

    fetchNotifications: async (page = 1) => {
        set({ isLoading: true });
        try {
            const response = await getAdminNotifications({ page, limit: 10 });
            const payload = response?.notifications ? response : (response?.data || response || {});
            const notifications = Array.isArray(payload.notifications) ? payload.notifications : [];
            const unreadCount = Number(payload.unreadCount !== undefined ? payload.unreadCount : get().unreadCount);
            const pages = Number(payload.pages || 1);

            set((state) => ({
                notifications: page === 1 ? notifications : [...state.notifications, ...notifications],
                unreadCount,
                page,
                hasMore: page < pages,
                isLoading: false,
            }));
        } catch (error) {
            console.error('Failed to fetch notifications:', error);
            set({ isLoading: false });
        }
    },

    markAsRead: async (id) => {
        try {
            await markNotificationAsRead(id);
            set((state) => ({
                notifications: state.notifications.map((n) =>
                    n._id === id ? { ...n, isRead: true } : n
                ),
                unreadCount: Math.max(0, state.unreadCount - 1)
            }));
        } catch (error) {
            console.error('Failed to mark notification as read:', error);
        }
    },

    markAllAsRead: async () => {
        try {
            await markAllNotificationsAsRead();
            set((state) => ({
                notifications: state.notifications.map((n) => ({ ...n, isRead: true })),
                unreadCount: 0
            }));
            toast.success('All notifications marked as read');
        } catch (error) {
            console.error('Failed to mark all as read:', error);
            toast.error('Failed to mark all as read');
        }
    },
}));
