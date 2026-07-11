import { useState, useEffect } from "react";
import { Outlet, useNavigate, useLocation, Link } from "react-router-dom";
import {
  FiLogOut,
  FiTruck,
  FiPackage,
  FiHome,
  FiUser,
  FiMenu,
  FiBell,
  FiMessageSquare,
  FiCreditCard,
} from "react-icons/fi";
import { useDeliveryAuthStore } from "../../store/deliveryStore";
import { useDeliveryNotificationStore } from "../../store/deliveryNotificationStore";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import DeliveryBottomNav from "./DeliveryBottomNav";
import { appLogo } from "../../../../data/logos";

const DeliveryLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { deliveryBoy, logout } = useDeliveryAuthStore();
  const { unreadCount, fetchNotifications } = useDeliveryNotificationStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(
    localStorage.getItem("delivery_sidebar_collapsed") === "true",
  );

  const toggleSidebar = () => {
    const nextVal = !isCollapsed;
    setIsCollapsed(nextVal);
    localStorage.setItem("delivery_sidebar_collapsed", String(nextVal));
  };

  useEffect(() => {
    fetchNotifications(1);
    const interval = setInterval(() => fetchNotifications(1), 60000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const handleLogout = () => {
    logout();
    toast.success("Logged out successfully");
    navigate("/delivery/login");
  };

  const menuItems = [
    { icon: FiHome, label: "Dashboard", path: "/delivery/dashboard" },
    { icon: FiPackage, label: "Orders", path: "/delivery/orders" },
    { icon: FiCreditCard, label: "Wallet", path: "/delivery/wallet" },
    { icon: FiBell, label: "Notifications", path: "/delivery/notifications" },
    { icon: FiMessageSquare, label: "Support", path: "/delivery/support" },
    { icon: FiUser, label: "Profile", path: "/delivery/profile" },
  ];

  const getStatusColor = (status) => {
    switch (status) {
      case "available":
        return "bg-emerald-500 shadow-emerald-200";
      case "busy":
        return "bg-amber-500 shadow-amber-200";
      case "offline":
        return "bg-slate-400 shadow-slate-200";
      default:
        return "bg-slate-400 shadow-slate-200";
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Desktop Persistent Sidebar (md and up) */}
      <aside
        className={`hidden md:flex flex-col w-64 bg-white border-r border-slate-100 fixed top-0 bottom-0 left-0 z-30 transition-transform duration-300 ${isCollapsed ? "-translate-x-full" : "translate-x-0"}`}
      >
        {/* Sidebar Header with Logo */}
        <div className="p-5 border-b border-slate-100 flex items-center h-16 flex-shrink-0">
          <Link
            to="/delivery/dashboard"
            className="flex items-center gap-2.5 overflow-visible"
          >
            {appLogo.src ? (
              <img
                src={appLogo.src}
                alt={appLogo.alt}
                className="h-10 w-auto object-contain"
                onError={(e) => {
                  e.target.style.display = "none";
                  const p = e.target.parentElement;
                  if (p && !p.querySelector(".logo-fallback")) {
                    const el = document.createElement("span");
                    el.className =
                      "logo-fallback text-primary-600 font-extrabold text-sm";
                    el.textContent = "Porutkal";
                    p.appendChild(el);
                  }
                }}
              />
            ) : (
              <span className="logo-fallback text-primary-600 font-extrabold text-sm">
                Porutkal
              </span>
            )}
            <div className="flex flex-col">
              <span className="text-xs font-black text-slate-800 tracking-tight leading-none">
                DELIVERY
              </span>
              <span className="text-[8px] font-bold text-primary-600 tracking-widest uppercase mt-0.5 leading-none">
                PORTAL
              </span>
            </div>
          </Link>
        </div>

        {/* User Card */}
        <div className="p-5 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center font-black text-white text-sm shadow-sm">
              {(deliveryBoy?.name || "D").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="font-extrabold text-slate-800 text-sm truncate leading-tight">
                {deliveryBoy?.name || "Delivery Boy"}
              </h2>
              <p className="text-[10px] text-slate-400 font-bold truncate mt-0.5 leading-none">
                {deliveryBoy?.email}
              </p>
            </div>
          </div>
          <div className="mt-3.5 flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full shadow-sm ${getStatusColor(deliveryBoy?.status)}`}
            />
            <span className="text-[9px] text-slate-500 font-black uppercase tracking-wider capitalize">
              {deliveryBoy?.status || "offline"}
            </span>
          </div>
        </div>

        {/* Navigation Menu */}
        <nav className="p-3 flex-1 space-y-1 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all ${
                  isActive
                    ? "bg-primary-50 text-primary-700 shadow-sm"
                    : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                }`}
              >
                <Icon className="text-base flex-shrink-0" />
                <span>{item.label}</span>
                {item.path === "/delivery/notifications" && unreadCount > 0 && (
                  <span className="ml-auto min-w-[18px] px-1 py-0.5 rounded-full bg-red-500 text-white text-[9px] font-black text-center">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Logout Button */}
        <div className="p-3 border-t border-slate-100 flex-shrink-0">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold text-red-600 hover:bg-red-50 transition-all"
          >
            <FiLogOut className="text-base flex-shrink-0" />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Workspace Wrapper */}
      <div
        className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ${isCollapsed ? "md:pl-0" : "md:pl-64"}`}
      >
        {/* Header */}
        <header
          className={`fixed top-0 left-0 right-0 z-20 bg-white border-b border-slate-100 shadow-sm transition-all duration-300 ${isCollapsed ? "md:left-0" : "md:left-64"}`}
        >
          <div className="flex items-center justify-between px-4 py-3 h-16">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (window.innerWidth >= 768) {
                    toggleSidebar();
                  } else {
                    setSidebarOpen(true);
                  }
                }}
                className="p-2 rounded-xl hover:bg-slate-50 transition-colors"
                aria-label="Toggle menu"
              >
                <FiMenu className="text-slate-600 text-xl" />
              </button>
              <div className="md:hidden flex items-center overflow-visible relative">
                {appLogo.src ? (
                  <img
                    src={appLogo.src}
                    alt={appLogo.alt}
                    className="h-10 w-auto object-contain"
                    onError={(e) => {
                      e.target.style.display = "none";
                    }}
                  />
                ) : (
                  <span className="text-primary-600 font-extrabold text-sm">
                    Porutkal
                  </span>
                )}
              </div>
              <FiTruck className="hidden md:block text-primary-600 text-lg" />
              <h1 className="text-xs font-black text-slate-800 uppercase tracking-widest leading-none ml-1.5 hidden md:block">
                Delivery Portal
              </h1>
            </div>

            {/* Quick unread badge in top navbar for mobile */}
            <div className="md:hidden">
              <Link
                to="/delivery/notifications"
                className="relative p-2 block hover:bg-slate-50 rounded-xl"
              >
                <FiBell className="text-slate-600 text-xl" />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                )}
              </Link>
            </div>
          </div>
        </header>

        {/* Sidebar Overlay for Mobile */}
        <AnimatePresence>
          {sidebarOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSidebarOpen(false)}
                className="fixed inset-0 bg-black bg-opacity-50 z-40"
              />
              <motion.div
                initial={{ x: -300 }}
                animate={{ x: 0 }}
                exit={{ x: -300 }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                className="fixed left-0 top-0 bottom-0 w-64 bg-white shadow-xl z-50 overflow-y-auto flex flex-col"
              >
                {/* Sidebar Header */}
                <div className="p-4 border-b border-gray-200">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center font-bold text-white text-xl shadow-sm">
                      {(deliveryBoy?.name || "D").charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h2 className="font-semibold text-gray-800 leading-tight">
                        {deliveryBoy?.name || "Delivery Boy"}
                      </h2>
                      <p className="text-xs text-gray-600 truncate max-w-[150px] mt-0.5 leading-none">
                        {deliveryBoy?.email}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full ${getStatusColor(deliveryBoy?.status)}`}
                    />
                    <span className="text-xs text-gray-600 capitalize">
                      {deliveryBoy?.status || "offline"}
                    </span>
                  </div>
                </div>

                {/* Navigation Menu */}
                <nav className="p-2 flex-1 space-y-1">
                  {menuItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = location.pathname === item.path;
                    return (
                      <button
                        key={item.path}
                        onClick={() => {
                          navigate(item.path);
                          setSidebarOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                          isActive
                            ? "bg-primary-50 text-primary-700"
                            : "text-gray-700 hover:bg-gray-100"
                        }`}
                      >
                        <Icon className="text-xl flex-shrink-0" />
                        <span className="font-medium">{item.label}</span>
                        {item.path === "/delivery/notifications" &&
                          unreadCount > 0 && (
                            <span className="ml-auto min-w-[20px] px-1.5 py-0.5 rounded-full bg-red-500 text-white text-xs font-semibold text-center">
                              {unreadCount > 99 ? "99+" : unreadCount}
                            </span>
                          )}
                      </button>
                    );
                  })}
                </nav>

                {/* Logout Button */}
                <div className="p-2 border-t border-gray-200">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <FiLogOut className="text-xl flex-shrink-0" />
                    <span className="font-medium">Logout</span>
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Main Content */}
        <main
          className={`pt-20 ${location.pathname === "/delivery/support" && new URLSearchParams(location.search).get("id") ? "pb-0" : "pb-20"} md:pb-6 flex-1 bg-slate-50/30`}
        >
          <Outlet />
        </main>

        {/* Bottom Navigation */}
        {!(
          location.pathname === "/delivery/support" &&
          new URLSearchParams(location.search).get("id")
        ) && <DeliveryBottomNav />}
      </div>
    </div>
  );
};

export default DeliveryLayout;
