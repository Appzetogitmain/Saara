import { create } from "zustand";
import toast from "react-hot-toast";
import {
  getVendorNotifications,
  markVendorNotificationAsRead,
  markAllVendorNotificationsAsRead,
  deleteVendorNotification,
} from "../services/vendorService";

export const useVendorNotificationStore = create((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  page: 1,
  hasMore: true,

  fetchNotifications: async (page = 1) => {
    set({ isLoading: true });
    try {
      const response = await getVendorNotifications({ page, limit: 10 });
      const payload = response?.notifications ? response : (response?.data || response || {});
      const list = Array.isArray(payload.notifications) ? payload.notifications : [];
      const pages = Number(payload.pages || 1);

      set((state) => ({
        notifications: page === 1 ? list : [...state.notifications, ...list],
        unreadCount: Number(payload.unreadCount !== undefined ? payload.unreadCount : state.unreadCount),
        page: Number(page),
        hasMore: Number(page) < pages,
        isLoading: false,
      }));
    } catch (error) {
      console.error("Failed to fetch vendor notifications:", error);
      set({ isLoading: false });
    }
  },

  markAsRead: async (id) => {
    try {
      await markVendorNotificationAsRead(id);
      set((state) => {
        const changed = state.notifications.some((n) => n._id === id && !n.isRead);
        return {
          notifications: state.notifications.map((n) =>
            n._id === id ? { ...n, isRead: true } : n
          ),
          unreadCount: changed
            ? Math.max(0, Number(state.unreadCount || 0) - 1)
            : state.unreadCount,
        };
      });
    } catch (error) {
      console.error("Failed to mark vendor notification as read:", error);
    }
  },

  markAllAsRead: async () => {
    try {
      await markAllVendorNotificationsAsRead();
      set((state) => ({
        notifications: state.notifications.map((n) => ({ ...n, isRead: true })),
        unreadCount: 0,
      }));
      toast.success("All notifications marked as read");
    } catch (error) {
      console.error("Failed to mark all vendor notifications as read:", error);
      toast.error("Failed to mark all notifications as read");
    }
  },

  removeNotification: async (id) => {
    try {
      await deleteVendorNotification(id);
      set((state) => {
        const existing = state.notifications.find((n) => n._id === id);
        return {
          notifications: state.notifications.filter((n) => n._id !== id),
          unreadCount:
            existing && !existing.isRead
              ? Math.max(0, Number(state.unreadCount || 0) - 1)
              : state.unreadCount,
        };
      });
      toast.success("Notification deleted");
    } catch (error) {
      console.error("Failed to delete vendor notification:", error);
      toast.error("Failed to delete notification");
    }
  },

  addNotification: (notification) => {
    set((state) => {
      const exists = state.notifications.some((n) => n._id === notification._id);
      if (exists) return {};
      return {
        notifications: [notification, ...state.notifications],
        unreadCount: (state.unreadCount || 0) + 1,
      };
    });
  },
}));

