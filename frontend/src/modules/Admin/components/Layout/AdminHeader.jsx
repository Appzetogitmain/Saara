import { useState } from 'react';
import { FiMenu, FiBell, FiLogOut } from 'react-icons/fi';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAdminAuthStore } from '../../store/adminStore';
import { useNotificationStore } from '../../store/notificationStore';
import { useEffect } from 'react';
import toast from 'react-hot-toast';
import Button from '../Button';
import NotificationWindow from './NotificationWindow';

const AdminHeader = ({ onMenuClick, isCollapsed, onToggleSidebar }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAdminAuthStore();
  const { notifications, unreadCount, fetchNotifications } = useNotificationStore();
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000); // Poll every minute
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
    navigate('/admin/login');
  };

  const toggleNotifications = () => {
    setShowNotifications(!showNotifications);
  };

  // Get page name from pathname
  const getPageName = (pathname) => {
    const path = pathname.split('/').pop() || 'dashboard';
    const pageNames = {
      dashboard: 'Dashboard',
      products: 'Products',
      categories: 'Categories',
      brands: 'Brands',
      orders: 'Orders',
      customers: 'Customers',
      inventory: 'Inventory',
      campaigns: 'Campaigns',
      'home-content': 'Home Content',
      'home-sliders': 'Home Sliders',
      offers: 'Offers',
      promocodes: 'Promo Codes',
      'banner-library': 'Banner Library',
      reels: 'Reel Moderation',
      payouts: 'Affiliate Payouts',
      'audit-logs': 'Audit Logs',
      'payout-requests': 'Payout Requests',
      support: 'Support Desk',
      'ticket-types': 'Support Categories',
      tickets: 'Tickets',
      reviews: 'Reviews',
      analytics: 'Analytics',
      content: 'Content',
      settings: 'Settings',
      more: 'More',
    };
    return pageNames[path] || path.charAt(0).toUpperCase() + path.slice(1);
  };

  const pageName = getPageName(location.pathname);

  return (
    <header
      className={`bg-white border-b border-gray-200 fixed top-0 left-0 right-0 z-30 transition-all duration-300 ${isCollapsed ? 'lg:left-0' : 'lg:left-64'}`}
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
      }}
    >
      <div className="flex items-center justify-between px-4 lg:px-6 py-4">
        {/* Left: Menu Button */}
        <div className="flex items-center gap-4">
          <Button
            onClick={() => {
              if (window.innerWidth >= 1024) {
                onToggleSidebar();
              } else {
                onMenuClick();
              }
            }}
            variant="icon"
            className="text-gray-700"
            icon={FiMenu}
          />

          {/* Page Heading - Desktop Only */}
          <div className="hidden lg:block">
            <h1 className="text-2xl font-bold text-gray-800 mb-1">{pageName}</h1>
            <p className="text-sm text-gray-600">Welcome back! Here's your business overview.</p>
          </div>
        </div>

        {/* Right: Notifications & Logout */}
        <div className="flex items-center gap-4">
          {/* Notifications */}
          <div className="relative">
            <Button
              data-notification-button
              onClick={toggleNotifications}
              variant="icon"
              className="text-gray-700"
              icon={FiBell}
            />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
            )}

            {/* Notification Window - positioned relative to this container */}
            <NotificationWindow
              isOpen={showNotifications}
              onClose={() => setShowNotifications(false)}
              position="right"
            />
          </div>

          {/* Logout Button */}
          <Button
            onClick={handleLogout}
            variant="ghost"
            icon={FiLogOut}
            size="sm"
            className="text-gray-700 hover:bg-red-600 hover:text-white hover:border-red-600 border border-gray-300"
          >
            Logout
          </Button>
        </div>
      </div>
    </header>
  );
};

export default AdminHeader;

