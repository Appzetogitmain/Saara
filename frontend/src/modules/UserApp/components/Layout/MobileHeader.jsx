import { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  FiShoppingBag,
  FiHeart,
  FiBell,
  FiMenu,
} from "react-icons/fi";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useCartStore, useUIStore } from "../../../../shared/store/useStore";
import { useWishlistStore } from "../../../../shared/store/wishlistStore";
import { useUserNotificationStore } from "../../store/userNotificationStore";
import { useAuthStore } from "../../../../shared/store/authStore";
import { appLogo } from "../../../../data/logos";
import { motion } from "framer-motion";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import SearchBar from "../../../../shared/components/SearchBar";
import MobileCategoryIcons from "../Mobile/MobileCategoryIcons";
import MobileSidebar from "./MobileSidebar";

// Category gradient mapping - Very subtle pastel colors
const categoryGradients = {
  1: "from-pink-50 via-rose-50 to-pink-100", // Clothing - Pinkish
  2: "from-amber-50 via-amber-100 to-yellow-50", // Footwear - Brownish
  3: "from-orange-50 via-orange-100 to-orange-50", // Bags - Orangeish
  4: "from-green-50 via-emerald-50 to-teal-50", // Jewelry - Greenish
  5: "from-purple-50 via-purple-100 to-indigo-50", // Accessories - Purple
  6: "from-blue-50 via-cyan-50 to-teal-50", // Athletic
};

const MobileHeader = ({ onSearch }) => {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showCartAnimation, setShowCartAnimation] = useState(false);
  const [positionsReady, setPositionsReady] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [animationPositions, setAnimationPositions] = useState({
    startX: 0,
    startY: 0,
    endX: 0,
    endY: 0,
  });
  const [isTopRowVisible, setIsTopRowVisible] = useState(true);
  const [topRowHeight, setTopRowHeight] = useState(70);
  const lastScrollYRef = useRef(0);
  const topRowRef = useRef(null);
  const headerContentRef = useRef(null);
  const userMenuRef = useRef(null);
  const logoRef = useRef(null);
  const cartRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();

  const itemCount = useCartStore((state) => state.getItemCount());
  const wishlistCount = useWishlistStore((state) => state.getItemCount());
  const unreadCount = useUserNotificationStore((state) => state.unreadCount);
  const ensureNotifications = useUserNotificationStore(
    (state) => state.ensureHydrated
  );
  const toggleCart = useUIStore((state) => state.toggleCart);
  const cartAnimationTrigger = useUIStore(
    (state) => state.cartAnimationTrigger
  );
  const { user, isAuthenticated, logout } = useAuthStore();

  // Get current category from URL (supports both /category/:id and legacy /app/category/:id)
  const getCurrentCategoryId = () => {
    const match = location.pathname.match(/\/(?:app\/)?category\/([^/]+)/);
    return match ? String(match[1]) : null;
  };

  const currentCategoryId = getCurrentCategoryId();

  // Get current page from location
  const getCurrentPage = () => {
    const path = location.pathname;
    if (path === "/" || path === "/home") return "home";
    if (path.startsWith("/product/")) return "product";
    if (path.startsWith("/category/")) return "category";
    if (path === "/search") return "search";
    if (path === "/wishlist") return "wishlist";
    if (path === "/profile") return "profile";
    if (path === "/orders") return "orders";
    if (path.startsWith("/orders/")) return "orderDetail";
    if (path === "/checkout") return "checkout";
    if (path === "/offers") return "offers";
    if (path === "/daily-deals") return "dailyDeals";
    if (path === "/flash-sale") return "flashSale";
    if (path.startsWith("/seller/")) return "vendor";
    return "default";
  };

  const currentPage = getCurrentPage();

  // Memoize gradient background style to prevent unnecessary re-renders
  const headerBackground = useMemo(() => {
    // Category pages - keep existing category-specific gradients
    if (currentCategoryId) {
      const gradientMap = {
        1: "linear-gradient(to bottom, rgb(252, 231, 243) 0%, rgb(255, 240, 245) 50%, rgb(255, 255, 255) 100%)", // Pink - moderate
        2: "linear-gradient(to bottom, rgb(254, 243, 199) 0%, rgb(255, 248, 220) 50%, rgb(255, 255, 255) 100%)", // Brown/Amber - moderate
        3: "linear-gradient(to bottom, rgb(255, 237, 213) 0%, rgb(255, 245, 230) 50%, rgb(255, 255, 255) 100%)", // Orange - moderate
        4: "linear-gradient(to bottom, rgb(209, 250, 229) 0%, rgb(236, 253, 245) 50%, rgb(255, 255, 255) 100%)", // Green - moderate
        5: "linear-gradient(to bottom, rgb(243, 232, 255) 0%, rgb(250, 245, 255) 50%, rgb(255, 255, 255) 100%)", // Purple - moderate
        6: "linear-gradient(to bottom, rgb(219, 234, 254) 0%, rgb(239, 246, 255) 50%, rgb(255, 255, 255) 100%)", // Blue - moderate
      };
      return (
        gradientMap[currentCategoryId] ||
        "linear-gradient(to bottom, #EDE9FE 0%, #F5F3FF 50%, #FFFFFF 100%)"
      );
    }

    // Page-specific gradients
    const pageGradients = {
      home: "linear-gradient(to bottom, rgb(196, 181, 253) 0%, rgb(221, 214, 254) 25%, rgb(245, 243, 255) 50%, rgb(255, 255, 255) 100%)", // Purple gradient for home - lighter intensity
      product:
        "linear-gradient(to bottom, rgb(237, 233, 254) 0%, rgb(245, 243, 255) 50%, rgb(255, 255, 255) 100%)", // Light purple
      search:
        "linear-gradient(to bottom, rgb(249, 115, 22) 0%, rgb(251, 146, 60) 30%, rgb(255, 237, 213) 60%, rgb(255, 255, 255) 100%)", // Orange gradient
      wishlist:
        "linear-gradient(to bottom, rgb(239, 68, 68) 0%, rgb(248, 113, 113) 30%, rgb(254, 226, 226) 60%, rgb(255, 255, 255) 100%)", // Red/pink gradient
      profile:
        "linear-gradient(to bottom, rgb(16, 185, 129) 0%, rgb(52, 211, 153) 30%, rgb(209, 250, 229) 60%, rgb(255, 255, 255) 100%)", // Green gradient
      orders:
        "linear-gradient(to bottom, rgb(59, 130, 246) 0%, rgb(96, 165, 250) 30%, rgb(219, 234, 254) 60%, rgb(255, 255, 255) 100%)", // Blue gradient
      orderDetail:
        "linear-gradient(to bottom, rgb(59, 130, 246) 0%, rgb(96, 165, 250) 30%, rgb(219, 234, 254) 60%, rgb(255, 255, 255) 100%)", // Blue gradient
      checkout:
        "linear-gradient(to bottom, rgb(16, 185, 129) 0%, rgb(52, 211, 153) 30%, rgb(209, 250, 229) 60%, rgb(255, 255, 255) 100%)", // Green gradient
      offers:
        "linear-gradient(to bottom, rgb(249, 115, 22) 0%, rgb(251, 146, 60) 30%, rgb(255, 237, 213) 60%, rgb(255, 255, 255) 100%)", // Orange gradient
      dailyDeals:
        "linear-gradient(to bottom, rgb(234, 179, 8) 0%, rgb(250, 204, 21) 30%, rgb(254, 243, 199) 60%, rgb(255, 255, 255) 100%)", // Yellow gradient
      flashSale:
        "linear-gradient(to bottom, rgb(239, 68, 68) 0%, rgb(248, 113, 113) 30%, rgb(254, 226, 226) 60%, rgb(255, 255, 255) 100%)", // Red gradient
      vendor:
        "linear-gradient(to bottom, rgb(124, 58, 237) 0%, rgb(167, 139, 250) 30%, rgb(237, 233, 254) 60%, rgb(255, 255, 255) 100%)", // Purple gradient
      default:
        "linear-gradient(to bottom, rgb(237, 233, 254) 0%, rgb(245, 243, 255) 50%, rgb(255, 255, 255) 100%)", // Light purple default
    };

    return pageGradients[currentPage] || pageGradients.default;
  }, [currentCategoryId, currentPage, location.pathname]);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setShowUserMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Measure header height for scroll hiding
  useEffect(() => {
    const measureHeader = () => {
      if (headerContentRef.current) {
        setTopRowHeight(headerContentRef.current.offsetHeight);
      } else if (topRowRef.current) {
        setTopRowHeight(topRowRef.current.offsetHeight);
      }
    };

    measureHeader();
    window.addEventListener("resize", measureHeader);
    // Recalculate after a short delay to account for conditional rendering
    const timer = setTimeout(measureHeader, 100);
    return () => {
      window.removeEventListener("resize", measureHeader);
      clearTimeout(timer);
    };
  }, [currentPage]);

  // Handle scroll to hide/show top row with smooth throttling
  useEffect(() => {
    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const currentScrollY = window.scrollY;
          const lastScrollY = lastScrollYRef.current;

          // Show top row when at top or scrolling up
          if (currentScrollY < 10) {
            setIsTopRowVisible(true);
          } else if (currentScrollY < lastScrollY) {
            // Scrolling up - show top row
            setIsTopRowVisible(true);
          } else if (currentScrollY > lastScrollY && currentScrollY > 50) {
            // Scrolling down and past threshold - hide top row
            setIsTopRowVisible(false);
          }

          lastScrollYRef.current = currentScrollY;
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Hydrate notifications on mount if authenticated
  useEffect(() => {
    if (isAuthenticated) {
      ensureNotifications();
    }
  }, [isAuthenticated, ensureNotifications]);

  // Calculate animation positions after component mounts
  useEffect(() => {
    const calculatePositions = () => {
      if (logoRef.current && cartRef.current) {
        const logoRect = logoRef.current.getBoundingClientRect();
        const cartRect = cartRef.current.getBoundingClientRect();

        const positions = {
          startX: logoRect.left + logoRect.width / 2,
          startY: logoRect.top + logoRect.height / 2,
          endX: cartRect.left + cartRect.width / 2,
          endY: cartRect.top + cartRect.height / 2,
        };

        // Only set positions if they're valid and animation hasn't played yet
        if (
          positions.startX > 0 &&
          positions.endX > 0 &&
          positions.startY > 0 &&
          positions.endY > 0 &&
          !hasPlayed
        ) {
          setAnimationPositions(positions);
          setPositionsReady(true);
          // Start animation once positions are ready
          setShowCartAnimation(true);
          setHasPlayed(true);
        }
      }
    };

    // Calculate positions after delays to ensure elements are rendered
    const timer1 = setTimeout(calculatePositions, 100);
    const timer2 = setTimeout(calculatePositions, 500);
    const timer3 = setTimeout(calculatePositions, 1000);

    // Recalculate on resize
    window.addEventListener("resize", calculatePositions);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      window.removeEventListener("resize", calculatePositions);
    };
  }, [hasPlayed]);

  const handleLogout = () => {
    logout();
    setShowUserMenu(false);
    navigate("/");
  };

  // Animation content - straight line movement only, starting from behind logo
  const shouldShowAnimation =
    showCartAnimation &&
    positionsReady &&
    animationPositions.startX > 0 &&
    animationPositions.endX > 0;

  const animationContent = shouldShowAnimation ? (
    <motion.div
      className="fixed pointer-events-none"
      style={{
        left: 0,
        top: 0,
        zIndex: 10000, // Above navbar but will be behind logo due to stacking context
        willChange: "transform, opacity",
        transform: "translateZ(0)",
        backfaceVisibility: "hidden",
        WebkitBackfaceVisibility: "hidden",
      }}
      initial={{
        x: animationPositions.startX - 24,
        y: animationPositions.startY - 24,
        scale: 0.8,
        opacity: 0,
      }}
      animate={{
        x: animationPositions.endX - 24,
        y: animationPositions.endY - 24,
        scale: [0.8, 1, 1.05, 0.95],
        opacity: [0, 1, 1, 0.8, 0],
      }}
      transition={{
        duration: 4,
        ease: [0.25, 0.1, 0.25, 1],
        times: [0, 0.1, 0.7, 0.9, 1],
        type: "tween",
      }}
      onAnimationComplete={() => {
        setShowCartAnimation(false);
      }}>
      <div className="w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center">
        <DotLottieReact
          src="https://lottie.host/083a2680-e854-4006-a50b-674276be82cd/oQMRcuZUkS.lottie"
          autoplay
          loop={false}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </motion.div>
  ) : null;

  const headerContent = (
    <motion.header
      key="mobile-header" // Stable key to prevent re-mounting
      className="fixed top-0 left-0 right-0 z-[9999] shadow-lg overflow-visible md:hidden"
      style={{
        background: headerBackground,
        transition: "background 0.5s ease-in-out",
      }}
      initial={false}
      animate={{
        y: isTopRowVisible ? 0 : -(topRowHeight + 12),
      }}
      transition={{
        type: "spring",
        stiffness: 300,
        damping: 30,
        mass: 0.8,
      }}>
      <div ref={headerContentRef} className="px-4 pt-4 pb-1.5 overflow-visible">
        {/* First Row: Logo and Actions */}
        <motion.div
          ref={topRowRef}
          className="flex items-center justify-between gap-3 mb-1.5"
          initial={false}
          animate={{
            opacity: isTopRowVisible ? 1 : 0,
          }}
          transition={{
            type: "spring",
            stiffness: 400,
            damping: 35,
            mass: 0.6,
          }}
          style={{
            pointerEvents: isTopRowVisible ? "auto" : "none",
          }}>
          {/* Menu and Logo */}
          <div className="flex items-center gap-2 flex-shrink-0 overflow-visible relative z-[10001]">
            {/* Hamburger Menu */}
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 -ml-2 hover:bg-white/50 rounded-full transition-all duration-300"
            >
              <FiMenu className="text-2xl text-gray-700" />
            </button>

            <Link
              to="/home"
              className="flex items-center overflow-visible relative z-[10002]">
              <div
                ref={logoRef}
                className="overflow-visible relative z-[10003]">
                {appLogo.src ? (
                  <img
                    src={appLogo.src}
                    alt={appLogo.alt}
                    className="h-10 sm:h-12 w-auto object-contain origin-left relative z-[10004]"
                    onError={(e) => {
                      // Hide image if logo doesn't exist
                      e.target.style.display = "none";
                      // Show text fallback
                      const parent = e.target.parentElement;
                      if (
                        parent &&
                        !parent.querySelector(".logo-text-fallback")
                      ) {
                        const fallback = document.createElement("span");
                        fallback.className =
                          "logo-text-fallback text-primary-600 font-bold text-sm sm:text-lg";
                        fallback.textContent = "LOGO";
                        parent.appendChild(fallback);
                      }
                    }}
                  />
                ) : (
                  <span className="logo-text-fallback text-primary-600 font-bold text-sm sm:text-lg">
                    LOGO
                  </span>
                )}
              </div>
            </Link>
          </div>

          {/* Right Side Actions */}
          <div className="flex items-center gap-1 sm:gap-2">
            {/* Wishlist Button */}
            <Link
              to="/wishlist"
              className="relative p-2.5 hover:bg-white/50 rounded-full transition-all duration-300"
            >
              <FiHeart className="text-xl text-gray-700" />
              {wishlistCount > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                  style={{ backgroundColor: "#ffc101" }}
                >
                  {wishlistCount > 9 ? "9+" : wishlistCount}
                </motion.span>
              )}
            </Link>

            {/* Cart Button */}
            <motion.button
              ref={cartRef}
              data-cart-icon
              onClick={toggleCart}
              className="relative p-2.5 hover:bg-white/50 rounded-full transition-all duration-300"
              animate={
                cartAnimationTrigger > 0
                  ? {
                      scale: [1, 1.2, 1],
                    }
                  : {}
              }
              transition={{ duration: 0.5, ease: "easeOut" }}>
              <FiShoppingBag className="text-xl text-gray-700" />
              {itemCount > 0 && (
                <motion.span
                  key={itemCount}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                  style={{ backgroundColor: "#ffc101" }}>
                  {itemCount > 9 ? "9+" : itemCount}
                </motion.span>
              )}
            </motion.button>

            {/* Notification Button */}
            <Link
              to="/notifications"
              className="relative p-2.5 hover:bg-white/50 rounded-full transition-all duration-300"
            >
              <FiBell className="text-xl text-gray-700" />
              {unreadCount > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                  style={{ backgroundColor: "#ffc101" }}
                >
                  {unreadCount > 9 ? "9+" : unreadCount}
                </motion.span>
              )}
            </Link>
          </div>
        </motion.div>

        {/* Search Bar Row - Added only for the home page in mobile view */}
        {currentPage === "home" && (
          <motion.div
            initial={false}
            animate={{
              opacity: isTopRowVisible ? 1 : 0,
              y: isTopRowVisible ? 0 : -10,
            }}
            transition={{
              type: "spring",
              stiffness: 400,
              damping: 35,
              mass: 0.6,
            }}
            className="mb-1"
            style={{
              pointerEvents: isTopRowVisible ? "auto" : "none",
            }}>
            <SearchBar onSearch={onSearch} />
          </motion.div>
        )}
      </div>
    </motion.header>
  );

  // Use portal to render outside of transformed containers (like PageTransition)
  return (
    <>
      {typeof document !== "undefined" &&
        createPortal(headerContent, document.body)}
      {typeof document !== "undefined" &&
        createPortal(
          <MobileSidebar
            isOpen={isSidebarOpen}
            onClose={() => setIsSidebarOpen(false)}
          />,
          document.body
        )}
    </>
  );
};

export default MobileHeader;
