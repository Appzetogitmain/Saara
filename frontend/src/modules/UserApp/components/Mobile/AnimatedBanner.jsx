import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { matchPath, useNavigate } from "react-router-dom";
import { FiArrowRight, FiZap, FiTag } from "react-icons/fi";

const getButtonStyleClasses = (style = "primary", isDarkBg = false) => {
  const base = "inline-flex items-center justify-center gap-1.5 font-bold py-1.5 px-4 rounded-xl transition-all duration-300 shadow-md cursor-pointer select-none text-[10px] md:text-xs active:scale-95 mt-2 self-start border border-gray-100/10 group-hover:translate-x-1";
  if (isDarkBg) {
    switch (style) {
      case "secondary":
        return `${base} bg-gray-800 text-white hover:bg-gray-700 border border-gray-700 hover:scale-[1.02]`;
      case "outline":
        return `${base} bg-transparent text-white border-2 border-white hover:bg-white/10 hover:scale-[1.02]`;
      case "primary":
      default:
        return `${base} bg-white text-gray-900 hover:bg-gray-100 hover:scale-[1.02]`;
    }
  } else {
    switch (style) {
      case "secondary":
        return `${base} bg-gray-100 hover:bg-gray-200 text-gray-800 hover:scale-[1.02]`;
      case "outline":
        return `${base} bg-transparent border-2 border-primary-600 text-primary-600 hover:bg-primary-50 hover:scale-[1.02]`;
      case "primary":
      default:
        return `${base} bg-primary-600 hover:bg-primary-700 text-white hover:scale-[1.02]`;
    }
  }
};

// Hero images for the parallax effect
import sneakersImg from "../../../../../data/products/sneakers.png";
import watchImg from "../../../../../data/products/stylish watch.png";
import sunglassImg from "../../../../../data/products/sunglass.png";

const defaultBanners = [
  {
    id: 1,
    title: "Flash Sale",
    subtitle: "Limited Time Offer",
    discount: "Up to 50% OFF",
    description: "Shop now before it ends!",
    gradient: "from-red-500 via-pink-500 to-orange-500",
    link: "/flash-sale",
    icon: FiZap,
    heroImage: sneakersImg,
  },
  {
    id: 2,
    title: "Daily Deals",
    subtitle: "New Deals Every Day",
    discount: "Save 30%",
    description: "Check out today's best deals",
    gradient: "from-blue-500 via-purple-500 to-indigo-500",
    link: "/daily-deals",
    icon: FiTag,
    heroImage: sunglassImg,
  },
  {
    id: 3,
    title: "Special Offers",
    subtitle: "Exclusive Discounts",
    discount: "Up to 40% OFF",
    description: "Don't miss out!",
    gradient: "from-green-500 via-teal-500 to-cyan-500",
    link: "/offers",
    icon: FiTag,
    heroImage: watchImg,
  },
];

const gradientPalette = [
  "from-red-500 via-pink-500 to-orange-500",
  "from-blue-500 via-purple-500 to-indigo-500",
  "from-green-500 via-teal-500 to-cyan-500",
];

const KNOWN_USER_ROUTE_PATTERNS = [
  "/",
  "/home",
  "/search",
  "/offers",
  "/daily-deals",
  "/flash-sale",
  "/new-arrivals",
  "/categories",
  "/category/:id",
  "/brand/:id",
  "/seller/:id",
  "/product/:id",
  "/sale/:slug",
  "/track-order/:orderId",
];

const getPathnameFromTarget = (target) =>
  String(target || "").trim().split("?")[0].split("#")[0];

const isKnownInternalRoute = (target) => {
  const pathname = getPathnameFromTarget(target);
  if (!pathname) return false;
  return KNOWN_USER_ROUTE_PATTERNS.some((pattern) =>
    !!matchPath({ path: pattern, end: true }, pathname)
  );
};

const resolveBannerLink = (banner) => {
  const candidate = String(
    banner?.linkUrl || banner?.link || banner?.url || ""
  ).trim();
  if (!candidate) return "";
  if (isExternalLink(candidate)) return candidate;
  if (isSafeInternalPath(candidate) && isKnownInternalRoute(candidate))
    return candidate;
  return "";
};

const isExternalLink = (target) => /^https?:\/\//i.test(String(target || "").trim());
const isSafeInternalPath = (target) => String(target || "").startsWith("/");

const AnimatedBanner = ({ banners = null, showPadding = true, className = "" }) => {
  const navigate = useNavigate();
  const [currentBanner, setCurrentBanner] = useState(0);

  const resolvedBanners =
    Array.isArray(banners) && banners.length > 0
      ? banners.map((banner, index) => ({
          id: banner.id || `banner-${index}`,
          title: banner.title || "Special Offer",
          subtitle: banner.subtitle || "Limited Time",
          discount: banner.discount || "Shop Now",
          description: banner.description || "",
          gradient:
            banner.gradient || gradientPalette[index % gradientPalette.length],
          link: resolveBannerLink(banner),
          icon: banner.icon || FiTag,
          heroImage: banner.image || banner.heroImage || watchImg,
          mobileImage: banner.mobileImage || null,
          altText: banner.altText || "",
          openInNewTab: !!banner.openInNewTab,
          showButton: banner.showButton !== false,
          buttonText: banner.buttonText || banner.discount || "Shop Now",
          buttonStyle: banner.buttonStyle || "primary",
        }))
      : defaultBanners;

  const handleBannerClick = (banner) => {
    if (!banner) return;
    const target = typeof banner === "string" ? banner : String(banner.link || "").trim();
    if (!target) return;

    const openInNewTab = typeof banner === "object" && banner !== null ? !!banner.openInNewTab : false;

    if (openInNewTab || isExternalLink(target)) {
      window.open(target, "_blank", "noopener,noreferrer");
      return;
    }
    navigate(target);
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentBanner((prev) => (prev + 1) % resolvedBanners.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [resolvedBanners.length]);

  return (
    <div className={`${showPadding ? "px-4 py-3" : ""} ${className}`}>
      <div className="relative w-full h-40 md:h-[180px] lg:h-[230px] rounded-3xl overflow-hidden shadow-xl">
        <AnimatePresence mode="wait">
          {resolvedBanners.map((banner, index) => {
            if (index !== currentBanner) return null;
            const Icon = banner.icon;

            return (
              <motion.div
                key={banner.id}
                initial={{ opacity: 0, scale: 1.05, x: "100%" }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.95, x: "-100%" }}
                transition={{
                  duration: 0.55,
                  ease: [0.25, 0.1, 0.25, 1],
                }}
                style={{ willChange: "transform, opacity" }}
                className={`absolute inset-0 bg-gradient-to-br ${banner.gradient} p-4 md:p-6 flex flex-col justify-center select-none`}>
                {/* 3D Depth Parallax Background */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
                  {/* Layer 1: Background (Blurred Product) */}
                  <motion.div
                    initial={{ opacity: 0, scale: 1.5, rotate: -5, x: 50 }}
                    animate={{ opacity: 0.15, scale: 1.8, rotate: 0, x: 0 }}
                    transition={{ duration: 10, repeat: Infinity, repeatType: "reverse" }}
                    className="absolute right-[-10%] top-[-10%] w-[120%] h-[120%]"
                  >
                    <img
                      src={banner.heroImage}
                      className="w-full h-full object-contain blur-2xl opacity-30 brightness-150"
                      alt=""
                    />
                  </motion.div>

                  {/* Layer 2: Midground (Bokeh Particles) */}
                  {[...Array(6)].map((_, i) => (
                    <motion.div
                      key={i}
                      initial={{
                        opacity: 0,
                        x: Math.random() * 200,
                        y: Math.random() * 100
                      }}
                      animate={{
                        opacity: [0, 0.4, 0],
                        x: [null, Math.random() * -100],
                        y: [null, Math.random() * -50],
                      }}
                      transition={{
                        duration: 3 + Math.random() * 4,
                        repeat: Infinity,
                        delay: i * 0.5
                      }}
                      className="absolute w-1 h-1 bg-white rounded-full blur-[1px]"
                      style={{
                        right: `${10 + (i * 15)}%`,
                        top: `${20 + (i * 10)}%`,
                      }}
                    />
                  ))}

                  {/* Layer 3: Foreground (Sharp Hero Product) */}
                  <div className="absolute right-[5%] top-1/2 -translate-y-1/2 w-24 h-24 md:w-36 md:h-36 flex items-center justify-center pointer-events-none select-none z-10 rounded-2xl overflow-hidden">
                    <motion.div
                      initial={{ opacity: 0, x: 80, scale: 0.7, rotate: 8 }}
                      animate={{ opacity: 1, x: 0, scale: 1.1, rotate: 0 }}
                      transition={{
                        type: "spring",
                        stiffness: 90,
                        damping: 14,
                        delay: 0.2
                      }}
                      className="w-full h-full flex items-center justify-center"
                    >
                      <picture className="w-full h-full object-contain pointer-events-none select-none">
                        {banner.mobileImage && <source media="(max-width: 640px)" srcSet={banner.mobileImage} />}
                        <motion.img
                          src={banner.heroImage}
                          alt={banner.altText || "Hero Product"}
                          className="w-full h-full object-contain drop-shadow-[0_12px_24px_rgba(0,0,0,0.3)] rounded-2xl"
                          animate={{
                            y: [0, -6, 0],
                          }}
                          transition={{
                            duration: 4.5,
                            repeat: Infinity,
                            ease: "easeInOut"
                          }}
                        />
                      </picture>
                    </motion.div>
                  </div>
                </div>

                {/* Content */}
                <button
                  type="button"
                  onClick={() => handleBannerClick(banner)}
                  disabled={!banner.link}
                  className="relative z-10 h-full flex items-center justify-between text-left group w-full pointer-events-auto">
                  <div className="flex-1 flex flex-col justify-center h-full space-y-1 md:space-y-2 max-w-[60%]">
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="flex items-center gap-1.5 md:gap-2 mb-0.5">
                      <motion.div
                        animate={{
                          scale: [1, 1.15, 1],
                          rotate: [0, 8, -8, 0],
                        }}
                        transition={{
                          duration: 2.5,
                          repeat: Infinity,
                          ease: "easeInOut",
                        }}>
                        <Icon className="text-white text-sm md:text-lg drop-shadow-md" />
                      </motion.div>
                      <span className="text-white/95 text-[10px] md:text-sm font-extrabold uppercase tracking-wider drop-shadow-sm">
                        {banner.subtitle}
                      </span>
                    </motion.div>

                    <motion.h3
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      className="text-white text-base md:text-2xl lg:text-3xl font-black leading-none tracking-tight drop-shadow-md">
                      {banner.title}
                    </motion.h3>

                    {banner.description && banner.description !== banner.title && banner.description !== banner.discount && (
                      <motion.p
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 }}
                        className="text-white/80 text-[10px] md:text-sm font-semibold max-w-sm line-clamp-1 leading-relaxed">
                        {banner.description}
                      </motion.p>
                    )}

                    {banner.showButton !== false && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.5, type: "spring" }}
                        className={getButtonStyleClasses(banner.buttonStyle, true)}
                        whileTap={{ scale: 0.95 }}>
                        <span>
                          {banner.buttonText}
                        </span>
                        <FiArrowRight className="text-xs md:text-sm" />
                      </motion.div>
                    )}
                  </div>
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Indicator Dots */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-20">
          {resolvedBanners.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentBanner(index)}
              className="focus:outline-none">
              <motion.div
                animate={{
                  width: index === currentBanner ? 24 : 6,
                  opacity: index === currentBanner ? 1 : 0.5,
                }}
                transition={{ duration: 0.3 }}
                className={`h-1.5 rounded-full bg-white ${index === currentBanner ? "w-6" : "w-1.5"
                  }`}
              />
            </button>
          ))}
        </div>
      </div>
    </div >
  );
};

export default AnimatedBanner;
