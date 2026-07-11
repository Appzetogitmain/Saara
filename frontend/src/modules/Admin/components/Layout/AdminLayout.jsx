import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import AdminSidebar from './AdminSidebar';
import AdminHeader from './AdminHeader';
import AdminBottomNav from './AdminBottomNav';
import useAdminHeaderHeight from '../../hooks/useAdminHeaderHeight';

const AdminLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(
    localStorage.getItem('admin_sidebar_collapsed') === 'true'
  );
  const headerHeight = useAdminHeaderHeight();
  
  const toggleSidebar = () => {
    const nextVal = !isCollapsed;
    setIsCollapsed(nextVal);
    localStorage.setItem('admin_sidebar_collapsed', String(nextVal));
  };
  
  // Bottom nav height is 64px (h-16)
  const bottomNavHeight = 64;
  
  // Add small buffer to prevent content overlap (8px)
  const topPadding = headerHeight + 8;
  const bottomPadding = bottomNavHeight + 8;

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <AdminSidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        isCollapsed={isCollapsed}
        onToggleCollapse={toggleSidebar}
      />

      {/* Main Content */}
      <div className={`flex-1 flex flex-col min-w-0 max-w-full overflow-x-hidden transition-all duration-300 ${isCollapsed ? 'lg:ml-0' : 'lg:ml-64'}`}>
        {/* Header */}
        <AdminHeader
          onMenuClick={() => setSidebarOpen(true)}
          isCollapsed={isCollapsed}
          onToggleSidebar={toggleSidebar}
        />

        {/* Page Content - with dynamic padding to account for fixed header and bottom nav */}
        <main 
          className="flex-1 p-3 sm:p-4 lg:p-6 overflow-y-auto overflow-x-hidden lg:pb-6 scrollbar-admin w-full min-w-0"
          style={{
            // Mobile: Use calculated heights with safe area support
            // Desktop: use the same computed top spacing for consistency
            paddingTop: `${Math.max(topPadding, 80)}px`, // Use calculated height or 80px, whichever is larger
            paddingBottom: `calc(${Math.max(bottomPadding, 80)}px + env(safe-area-inset-bottom, 0px))`, // Use calculated height + safe area or 80px + safe area, whichever is larger
          }}
        >
          <div className="w-full max-w-full overflow-x-hidden min-w-0">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Bottom Navigation - Mobile Only */}
      <AdminBottomNav />
    </div>
  );
};

export default AdminLayout;

