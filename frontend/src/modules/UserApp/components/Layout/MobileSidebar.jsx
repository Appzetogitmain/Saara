import { motion, AnimatePresence } from "framer-motion";
import {
  FiX,
  FiGrid,
  FiTag,
  FiHome,
  FiCompass,
  FiPlay,
  FiUser,
  FiHeart,
  FiShoppingBag,
} from "react-icons/fi";
import { Link } from "react-router-dom";
import { appLogo } from "../../../../data/logos";
import { useAuthStore } from "../../../../shared/store/authStore";
import { useUIStore } from "../../../../shared/store/useStore";

const MobileSidebar = ({ isOpen, onClose }) => {
  const { user, isAuthenticated } = useAuthStore();
  const { toggleCart } = useUIStore();

  const menuItems = [
    { label: "Home", icon: FiHome, path: "/home" },
    { label: "Offers", icon: FiTag, path: "/offers" },
    { label: "Explore", icon: FiCompass, path: "/explore" },
    { label: "Reels", icon: FiPlay, path: "/reels" },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-[10005] md:hidden"
          />

          {/* Sidebar */}
          <motion.div
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed top-0 left-0 bottom-0 w-[280px] bg-white z-[10006] md:hidden shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <Link
                to="/home"
                onClick={onClose}
                className="flex items-center gap-2"
              >
                {appLogo.src ? (
                  <img
                    src={appLogo.src}
                    alt={appLogo.alt}
                    className="h-8 w-auto object-contain"
                  />
                ) : (
                  <span className="text-xl font-bold text-primary-600">
                    LOGO
                  </span>
                )}
              </Link>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <FiX className="text-2xl text-gray-600" />
              </button>
            </div>

            {/* User Profile Section */}
            <div className="p-4 bg-gray-50 border-b border-gray-100">
              {isAuthenticated ? (
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center overflow-hidden border-2 border-white shadow-sm">
                    {user?.avatar ? (
                      <img
                        src={user.avatar}
                        alt={user.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <FiUser className="text-2xl text-primary-600" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-800 leading-tight">
                      {user?.name || "User"}
                    </h3>
                    <p className="text-xs text-gray-500 truncate max-w-[160px]">
                      {user?.email}
                    </p>
                  </div>
                </div>
              ) : (
                <Link
                  to="/login"
                  onClick={onClose}
                  className="flex items-center gap-3 p-2 bg-primary-600 text-white rounded-lg justify-center font-medium"
                >
                  Login / Sign Up
                </Link>
              )}
            </div>

            {/* Menu Links */}
            <div className="flex-1 overflow-y-auto py-4">
              <div className="px-4 mb-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  Main Menu
                </p>
              </div>
              <nav className="flex flex-col gap-1 px-2">
                {menuItems.map((item) => (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={onClose}
                    className="flex items-center gap-4 px-4 py-3 text-gray-700 hover:bg-primary-50 hover:text-primary-600 rounded-xl transition-all group"
                  >
                    <item.icon className="text-xl group-hover:scale-110 transition-transform" />
                    <span className="font-medium">{item.label}</span>
                  </Link>
                ))}
              </nav>

              <div className="px-4 mt-6 mb-2 border-t border-gray-50 pt-6">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  Shopping
                </p>
              </div>
              <nav className="flex flex-col gap-1 px-2">
                <Link
                  to="/wishlist"
                  onClick={onClose}
                  className="flex items-center gap-4 px-4 py-3 text-gray-700 hover:bg-red-50 hover:text-red-600 rounded-xl transition-all group"
                >
                  <FiHeart className="text-xl group-hover:scale-110 transition-transform" />
                  <span className="font-medium">My Wishlist</span>
                </Link>
                <button
                  onClick={() => {
                    onClose();
                    toggleCart();
                  }}
                  className="flex items-center gap-4 w-full px-4 py-3 text-gray-700 hover:bg-blue-50 hover:text-blue-600 rounded-xl transition-all group"
                >
                  <FiShoppingBag className="text-xl group-hover:scale-110 transition-transform" />
                  <span className="font-medium text-left">My Cart</span>
                </button>
              </nav>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-100 text-center">
              <p className="text-xs text-gray-400">
                © 2026 Porutkal. All rights reserved.
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default MobileSidebar;
