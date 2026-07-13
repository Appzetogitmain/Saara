import { Link, useNavigate } from "react-router-dom";
import { useCartStore, useUIStore } from "../../../../shared/store/useStore";
import { useWishlistStore } from "../../../../shared/store/wishlistStore";
import { useAuthStore } from "../../../../shared/store/authStore";
import { useCategoryStore } from "../../../../shared/store/categoryStore";
import { appLogo } from "../../../../data/logos";
import {
  FiHeart,
  FiShoppingBag,
  FiUser,
  FiLogOut,
  FiGrid,
  FiBell,
  FiPlay,
  FiCompass,
  FiSearch,
  FiChevronDown,
  FiMenu,
  FiPercent,
  FiZap,
} from "react-icons/fi";
import { HiOutlineUserCircle } from "react-icons/hi";
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUserNotificationStore } from "../../store/userNotificationStore";

const DesktopHeader = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuthStore();
  const itemCount = useCartStore((state) => state.getItemCount());
  const wishlistCount = useWishlistStore((state) => state.getItemCount());
  const unreadCount = useUserNotificationStore((state) => state.unreadCount);
  const ensureHydrated = useUserNotificationStore(
    (state) => state.ensureHydrated,
  );
  const toggleCart = useUIStore((state) => state.toggleCart);

  // Category Store
  const { categories, initialize, getRootCategories } = useCategoryStore();
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [selectedCategoryName, setSelectedCategoryName] =
    useState("All Categories");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const [showNavCategories, setShowNavCategories] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const categoryDropdownRef = useRef(null);
  const navCategoriesRef = useRef(null);
  const userMenuRef = useRef(null);

  useEffect(() => {
    ensureHydrated();
    initialize();
  }, [ensureHydrated, initialize, isAuthenticated]);

  // Click outside menus handlers
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        categoryDropdownRef.current &&
        !categoryDropdownRef.current.contains(event.target)
      ) {
        setShowCategoryDropdown(false);
      }
      if (
        navCategoriesRef.current &&
        !navCategoriesRef.current.contains(event.target)
      ) {
        setShowNavCategories(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setShowUserMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = () => {
    logout();
    setShowUserMenu(false);
    navigate("/home");
  };

  const handleSearchSubmit = (e) => {
    if (e) e.preventDefault();
    let searchRoute = `/search?q=${encodeURIComponent(searchQuery.trim())}`;
    if (selectedCategoryId) {
      searchRoute += `&category=${selectedCategoryId}`;
    }
    navigate(searchRoute);
  };

  const rootCategories = getRootCategories() || [];

  return (
    <header className="hidden md:block sticky top-0 z-[999] bg-white shadow-sm border-b border-gray-100 w-full">

      {/* 2. MAIN HEADER BAR */}
      <div className="w-full bg-white py-4 border-b border-gray-50">
        <div className="max-w-[1440px] mx-auto px-4 md:px-8 lg:px-12 flex items-center justify-between gap-8 h-16">
          {/* Logo */}
          <Link to="/home" className="flex-shrink-0 flex items-center gap-2">
            {appLogo.src ? (
              <div className="flex items-center gap-2">
                <img
                  src={appLogo.src}
                  alt={appLogo.alt}
                  className="h-10 lg:h-12 w-auto object-contain"
                />
                <span className="text-xl lg:text-2xl font-black text-gray-800 tracking-tight">
                  Porutkal
                </span>
              </div>
            ) : (
              <span className="text-2xl font-extrabold text-primary-600">
                Porutkal
              </span>
            )}
          </Link>

          {/* Premium Search Bar with Category Dropdown */}
          <div className="flex-1 max-w-xl">
            <form
              onSubmit={handleSearchSubmit}
              className="relative flex items-center bg-gray-50 rounded-full pl-5 pr-1 py-1 border border-gray-200 focus-within:border-primary-500 focus-within:bg-white focus-within:shadow-md transition-all duration-300"
            >
              {/* Category selector */}
              <div
                ref={categoryDropdownRef}
                className="relative pr-3 mr-3 border-r border-gray-200 shrink-0"
              >
                <button
                  type="button"
                  onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
                  className="flex items-center gap-1 text-gray-600 text-xs lg:text-sm font-bold hover:text-primary-600 select-none cursor-pointer focus:outline-none"
                >
                  <span className="max-w-[100px] truncate">
                    {selectedCategoryName}
                  </span>
                  <FiChevronDown className="text-gray-400" />
                </button>
                <AnimatePresence>
                  {showCategoryDropdown && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute left-0 mt-3 bg-white rounded-xl shadow-xl border border-gray-100 p-2 z-[1000] min-w-[200px]"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCategoryName("All Categories");
                          setSelectedCategoryId("");
                          setShowCategoryDropdown(false);
                        }}
                        className="w-full text-left px-3 py-2 rounded-lg text-xs lg:text-sm text-gray-700 hover:bg-gray-50 hover:text-primary-600 font-semibold"
                      >
                        All Categories
                      </button>
                      {rootCategories.map((cat) => (
                        <button
                          key={cat.id || cat._id}
                          type="button"
                          onClick={() => {
                            setSelectedCategoryName(cat.name);
                            setSelectedCategoryId(cat.id || cat._id);
                            setShowCategoryDropdown(false);
                          }}
                          className="w-full text-left px-3 py-2 rounded-lg text-xs lg:text-sm text-gray-700 hover:bg-gray-50 hover:text-primary-600 font-semibold truncate"
                        >
                          {cat.name}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Text Input */}
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search for products, brands and more..."
                className="w-full bg-transparent focus:outline-none text-xs lg:text-sm text-gray-700 placeholder:text-gray-400 py-1.5"
              />

              {/* Search Button */}
              <button
                type="submit"
                className="bg-primary-600 hover:bg-primary-700 text-white p-2 rounded-full transition-all shrink-0 ml-2 cursor-pointer"
              >
                <FiSearch className="text-base lg:text-lg" />
              </button>
            </form>
          </div>

          {/* Action Links (Icons + Labels Beside) */}
          <div className="flex items-center gap-6 lg:gap-8">
            {/* Wishlist */}
            <Link
              to="/wishlist"
              className="flex items-center gap-2 text-gray-600 hover:text-primary-600 transition-colors"
            >
              <div className="relative p-1">
                <FiHeart className="text-xl lg:text-2xl" />
                {wishlistCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                    {wishlistCount}
                  </span>
                )}
              </div>
              <span className="text-xs lg:text-sm font-semibold tracking-wide hidden xl:inline">
                Wishlist
              </span>
            </Link>

            {/* Cart */}
            <button
              onClick={toggleCart}
              className="flex items-center gap-2 text-gray-600 hover:text-primary-600 transition-colors focus:outline-none"
            >
              <div className="relative p-1">
                <FiShoppingBag className="text-xl lg:text-2xl" />
                {itemCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary-600 text-white text-[9px] font-bold flex items-center justify-center">
                    {itemCount}
                  </span>
                )}
              </div>
              <span className="text-xs lg:text-sm font-semibold tracking-wide hidden xl:inline">
                Cart
              </span>
            </button>

            {/* Notifications */}
            <Link
              to={isAuthenticated ? "/notifications" : "/login"}
              className="flex items-center gap-2 text-gray-600 hover:text-primary-600 transition-colors"
            >
              <div className="relative p-1">
                <FiBell className="text-xl lg:text-2xl" />
                {isAuthenticated && unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </div>
              <span className="text-xs lg:text-sm font-semibold tracking-wide hidden xl:inline">
                Notifications
              </span>
            </Link>

            {/* User Profile */}
            {isAuthenticated ? (
              <div ref={userMenuRef} className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-2.5 p-1.5 rounded-full hover:bg-gray-50 border border-transparent hover:border-gray-200 transition-all text-left focus:outline-none"
                >
                  {user?.avatar ? (
                    <img
                      src={user.avatar}
                      alt={user.name}
                      className="w-8 h-8 rounded-full object-cover border border-gray-200"
                    />
                  ) : (
                    <HiOutlineUserCircle className="text-gray-500 text-3xl" />
                  )}
                  <div className="hidden lg:flex flex-col select-none">
                    <span className="text-xs font-black text-gray-800 leading-none max-w-[100px] truncate mb-0.5">
                      {user?.name || "User"}
                    </span>
                    <span className="text-[10px] text-gray-500 font-semibold leading-none">
                      My Account
                    </span>
                  </div>
                  <FiChevronDown className="text-gray-400 hidden lg:inline" />
                </button>

                <AnimatePresence>
                  {showUserMenu && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute right-0 mt-3 bg-white rounded-2xl shadow-xl border border-gray-100 p-2.5 z-[1000] min-w-[220px]"
                    >
                      <div className="px-3 py-2 border-b border-gray-100 mb-2">
                        <p className="font-bold text-gray-800 text-sm">
                          {user?.name || "User"}
                        </p>
                        <p className="text-xs text-gray-500 truncate mt-0.5">
                          {user?.email || ""}
                        </p>
                      </div>
                      <Link
                        to="/profile"
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 rounded-xl transition-colors text-left text-gray-700 text-sm font-semibold"
                      >
                        <FiUser className="text-gray-500 text-base" />
                        <span>Profile</span>
                      </Link>
                      <Link
                        to="/orders"
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 rounded-xl transition-colors text-left text-gray-700 text-sm font-semibold"
                      >
                        <FiShoppingBag className="text-gray-500 text-base" />
                        <span>Orders</span>
                      </Link>
                      <button
                        onClick={handleLogout}
                        className="flex items-center gap-3 w-full px-3 py-2 hover:bg-red-50 rounded-xl transition-colors text-left text-red-600 text-sm font-bold mt-1 cursor-pointer"
                      >
                        <FiLogOut className="text-red-500 text-base" />
                        <span>Logout</span>
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <Link
                to="/login"
                className="px-6 py-2.5 bg-primary-600 text-white rounded-full font-bold text-sm hover:bg-primary-700 transition-all shadow-sm shadow-primary-200 hover:shadow-md cursor-pointer"
              >
                Login
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* 3. SUB-HEADER NAVIGATION BAR */}
      <div className="w-full bg-white border-b border-gray-200">
        <div className="max-w-[1440px] mx-auto px-4 md:px-8 lg:px-12 flex items-center justify-between h-12">
          {/* Categories Button with dropdown */}
          <div ref={navCategoriesRef} className="relative">
            <button
              onClick={() => setShowNavCategories(!showNavCategories)}
              className="flex items-center gap-2 bg-[#f3f4f6] text-gray-700 hover:text-primary-600 px-4 py-2 rounded-xl text-xs lg:text-sm font-bold transition-all hover:bg-gray-100 focus:outline-none"
            >
              <FiMenu className="text-base" />
              <span>Categories</span>
              <FiChevronDown className="text-gray-400" />
            </button>
            <AnimatePresence>
              {showNavCategories && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="absolute left-0 mt-2 bg-white rounded-2xl shadow-xl border border-gray-100 p-2.5 z-[1000] min-w-[240px]"
                >
                  <Link
                    to="/categories"
                    onClick={() => setShowNavCategories(false)}
                    className="flex items-center gap-2 px-3.5 py-2.5 hover:bg-gray-50 rounded-xl transition-colors text-left text-gray-800 text-xs lg:text-sm font-bold border-b border-gray-100"
                  >
                    <FiGrid className="text-gray-500" />
                    <span>View All Categories</span>
                  </Link>
                  <div className="mt-1.5 space-y-0.5">
                    {rootCategories.map((cat) => (
                      <Link
                        key={cat.id || cat._id}
                        to={`/category/${cat.id || cat._id}`}
                        onClick={() => setShowNavCategories(false)}
                        className="flex items-center justify-between px-3.5 py-2 hover:bg-gray-50 rounded-xl transition-colors text-left text-gray-700 text-xs lg:text-sm font-semibold truncate"
                      >
                        <span>{cat.name}</span>
                        <span className="text-[10px] text-gray-400">
                          &rarr;
                        </span>
                      </Link>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Navigation Links */}
          <nav className="flex items-center gap-6 lg:gap-8 h-full">
            {[
              { path: "/home", label: "Home" },
              { path: "/offers", label: "Offers", badge: "New" },
              { path: "/explore", label: "Explore" },
              { path: "/reels", label: "Reels" },
              { path: "/search", label: "Brands" },
              { path: "/new-arrivals", label: "New Arrivals" },
            ].map((link, idx) => {
              const isActive = window.location.pathname === link.path;
              return (
                <Link
                  key={idx}
                  to={link.path}
                  className={`relative flex items-center gap-1.5 text-xs lg:text-sm font-bold tracking-wide transition-colors h-full px-1 border-b-2 hover:text-primary-600 ${
                    isActive
                      ? "border-primary-600 text-primary-600"
                      : "border-transparent text-gray-600"
                  }`}
                >
                  {link.label}
                  {link.badge && (
                    <span className="bg-red-500 text-white text-[8px] px-1 py-0.2 rounded font-black tracking-normal uppercase scale-90 origin-left">
                      {link.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Secondary links / micro promotion details */}
          <div className="hidden lg:flex items-center gap-4 text-xs font-semibold text-gray-500">
            <span className="flex items-center gap-1">
              <FiPercent /> Smart Offers
            </span>
            <span className="flex items-center gap-1">
              <FiZap /> Trending Now
            </span>
          </div>
        </div>
      </div>
    </header>
  );
};

export default DesktopHeader;
