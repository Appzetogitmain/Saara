import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { FiBell, FiCheck, FiTrash2, FiInbox, FiRefreshCw } from "react-icons/fi";
import MobileLayout from "../components/Layout/MobileLayout";
import PageTransition from "../../../shared/components/PageTransition";
import { useUserNotificationStore } from "../store/userNotificationStore";

const formatDateTime = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
};

const UserNotifications = () => {
  const {
    notifications,
    unreadCount,
    isLoading,
    page,
    hasMore,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    removeNotification,
  } = useUserNotificationStore();

  const navigate = useNavigate();

  const handleNotificationClick = async (notification) => {
    if (!notification) return;
    
    // Mark as read if unread
    if (!notification.isRead) {
      await markAsRead(notification._id);
    }

    const data = notification.data || {};
    const titleLower = (notification.title || '').toLowerCase();
    const msgLower = (notification.message || '').toLowerCase();

    // Determine target route
    if (data.orderId) {
      navigate(`/orders/${data.orderId}`);
    } else if (titleLower.includes('wallet') || msgLower.includes('wallet') || data.walletId) {
      navigate('/user/wallet');
    } else if (titleLower.includes('support') || titleLower.includes('ticket') || data.ticketId) {
      navigate('/support');
    } else if (notification.type === 'order') {
      navigate('/orders');
    }
  };

  useEffect(() => {
    fetchNotifications(1);
  }, [fetchNotifications]);

  return (
    <PageTransition>
      <MobileLayout showBottomNav={true} showCartBar={true}>
        <div className="px-4 py-4 sm:py-6 space-y-4">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start justify-between gap-3"
          >
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Notifications</h1>
              <p className="text-sm text-gray-600">{unreadCount} unread</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchNotifications(1)}
                className="px-3 py-2 rounded-lg border border-gray-200 text-gray-700 text-sm font-semibold hover:bg-gray-50"
                type="button"
              >
                <span className="inline-flex items-center gap-1">
                  <FiRefreshCw />
                  Refresh
                </span>
              </button>
              <button
                onClick={markAllAsRead}
                disabled={!notifications.length || unreadCount === 0}
                className="px-3 py-2 rounded-lg bg-primary-600 text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                type="button"
              >
                Mark all read
              </button>
            </div>
          </motion.div>

          {isLoading && notifications.length === 0 ? (
            <div className="bg-white rounded-2xl p-6 text-center shadow-sm border border-gray-200 text-gray-600">
              Loading notifications...
            </div>
          ) : notifications.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center shadow-sm border border-gray-200">
              <FiInbox className="mx-auto mb-3 text-4xl text-gray-400" />
              <p className="text-gray-700 font-semibold">No notifications yet</p>
              <p className="text-sm text-gray-500 mt-1">
                Order and account updates will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {notifications.map((notification, idx) => (
                <motion.div
                  key={notification?._id || `${idx}-${notification?.createdAt || ""}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  onClick={() => handleNotificationClick(notification)}
                  className={`rounded-2xl p-4 shadow-sm border cursor-pointer transition-all duration-200 hover:shadow-md hover:scale-[1.01] ${
                    notification?.isRead
                      ? "bg-white border-gray-200 hover:border-gray-300"
                      : "bg-blue-50 border-blue-200 hover:bg-blue-100/50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <FiBell className={notification?.isRead ? "text-gray-400" : "text-primary-600"} />
                        <h3 className="font-semibold text-gray-800 truncate">
                          {notification?.title || "Notification"}
                        </h3>
                      </div>
                      <p className="text-sm text-gray-700 mt-1 break-words">
                        {notification?.message || "-"}
                      </p>
                      <p className="text-xs text-gray-500 mt-2">
                        {formatDateTime(notification?.createdAt)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {!notification?.isRead && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            markAsRead(notification?._id);
                          }}
                          className="p-2 rounded-lg border border-gray-200 text-gray-700 hover:bg-white"
                          title="Mark as read"
                          type="button"
                        >
                          <FiCheck />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeNotification(notification?._id);
                        }}
                        className="p-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                        title="Delete notification"
                        type="button"
                      >
                        <FiTrash2 />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {hasMore && notifications.length > 0 && (
            <div className="pt-2">
              <button
                onClick={() => fetchNotifications(Number(page || 1) + 1)}
                disabled={isLoading}
                className="w-full py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                type="button"
              >
                {isLoading ? "Loading..." : "Load more"}
              </button>
            </div>
          )}
        </div>
      </MobileLayout>
    </PageTransition>
  );
};

export default UserNotifications;

