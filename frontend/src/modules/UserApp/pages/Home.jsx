import { useState, useEffect, useMemo, useCallback, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, matchPath, useNavigate, useSearchParams } from "react-router-dom";
import { FiHeart } from "react-icons/fi";
import { useAuthStore } from "../../../shared/store/authStore";
import React from 'react';
import MobileLayout from "../components/Layout/MobileLayout";
import ProductCard from "../../../shared/components/ProductCard";
import AnimatedBanner from "../components/Mobile/AnimatedBanner";
import NewArrivalsSection from "../components/Mobile/NewArrivalsSection";
import DailyDealsSection from "../components/Mobile/DailyDealsSection";
import RecommendedSection from "../components/Mobile/RecommendedSection";
import FeaturedVendorsSection from "../components/Mobile/FeaturedVendorsSection";
import BrandLogosScroll from "../components/Mobile/BrandLogosScroll";
import MobileCategoryGrid from "../components/Mobile/MobileCategoryGrid";
import CategoryInFocus from "../components/Mobile/CategoryInFocus";
import DealsSection from "../components/Mobile/DealsSection";
import TrustBar from "../components/Mobile/TrustBar";
import LazyImage from "../../../shared/components/LazyImage";
import {
  getMostPopular,
  getTrending,
  getFlashSale,
  getDailyDeals,
  getAllNewArrivals,
  getRecommendedProducts,
  getApprovedVendors,
  getCatalogBrands,
} from "../data/catalogData";
import PageTransition from "../../../shared/components/PageTransition";
import usePullToRefresh from "../hooks/usePullToRefresh";
import toast from "react-hot-toast";
import api from "../../../shared/utils/api";
import heroSlide1 from "../../../../data/hero/slide1.png";
import heroSlide2 from "../../../../data/hero/slide2.png";
import heroSlide3 from "../../../../data/hero/slide3.png";
import heroSlide4 from "../../../../data/hero/slide4.png";
import stylishWatchImg from "../../../../data/products/stylish watch.png";

const normalizeId = (value) => String(value ?? "").trim();
const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeProduct = (raw) => {
  const vendorObj =
    raw?.vendor && typeof raw.vendor === "object"
      ? raw.vendor
      : raw?.vendorId && typeof raw.vendorId === "object"
        ? raw.vendorId
        : null;
  const brandObj =
    raw?.brand && typeof raw.brand === "object"
      ? raw.brand
      : raw?.brandId && typeof raw.brandId === "object"
        ? raw.brandId
        : null;
  const categoryObj =
    raw?.category && typeof raw.category === "object"
      ? raw.category
      : raw?.categoryId && typeof raw.categoryId === "object"
        ? raw.categoryId
        : null;

  const id = normalizeId(raw?.id || raw?._id);
  const vendorId = normalizeId(
    vendorObj?._id || vendorObj?.id || raw?.vendorId,
  );
  const brandId = normalizeId(brandObj?._id || brandObj?.id || raw?.brandId);
  const categoryId = normalizeId(
    categoryObj?._id || categoryObj?.id || raw?.categoryId,
  );
  const image = raw?.image || raw?.images?.[0] || "";

  return {
    ...raw,
    id,
    _id: id,
    vendorId,
    vendorName:
      raw?.vendorName || vendorObj?.storeName || vendorObj?.name || "",
    brandId,
    brandName: raw?.brandName || brandObj?.name || "",
    categoryId,
    categoryName: raw?.categoryName || categoryObj?.name || "",
    image,
    images: Array.isArray(raw?.images) ? raw.images : image ? [image] : [],
    price: toNumber(raw?.price, 0),
    originalPrice:
      raw?.originalPrice !== undefined
        ? toNumber(raw.originalPrice, undefined)
        : undefined,
    rating: toNumber(raw?.rating, 0),
    reviewCount: toNumber(raw?.reviewCount, 0),
    isActive: raw?.isActive !== false,
    flashSale: !!raw?.flashSale,
    isNew: !!raw?.isNewArrival,
  };
};

const normalizeVendor = (raw) => ({
  ...raw,
  id: normalizeId(raw?.id || raw?._id),
  _id: normalizeId(raw?.id || raw?._id),
  isVerified: !!raw?.isVerified,
  rating: toNumber(raw?.rating, 0),
  reviewCount: toNumber(raw?.reviewCount, 0),
  status: raw?.status || "approved",
});

const normalizeBrand = (raw) => ({
  ...raw,
  id: normalizeId(raw?.id || raw?._id),
  _id: normalizeId(raw?.id || raw?._id),
  name: raw?.name || "",
  logo: raw?.logo || "",
});

const deriveDailyDeals = (products = []) => {
  const flash = products.filter((p) => p.flashSale);
  const discounted = products.filter(
    (p) =>
      p.originalPrice !== undefined &&
      toNumber(p.originalPrice, 0) > toNumber(p.price, 0) &&
      !p.flashSale,
  );
  const merged = [...flash, ...discounted];
  return merged.filter(
    (p, index, arr) =>
      index === arr.findIndex((x) => normalizeId(x.id) === normalizeId(p.id)),
  );
};

const DEFAULT_HERO_SLIDES = [
  {
    image: heroSlide1,
    link: "/search",
    hasOverlay: false,
  },
  {
    image: heroSlide2,
    link: "/offers",
    hasOverlay: false,
  },
  {
    image: heroSlide3,
    link: "/categories",
    hasOverlay: false,
  },
  {
    image: heroSlide4,
    link: "/new-arrivals",
    hasOverlay: false,
  },
];

const extractResponseData = (response) => {
  if (response && typeof response === "object") {
    if (Object.prototype.hasOwnProperty.call(response, "data")) {
      return response.data;
    }
    return response;
  }
  return null;
};

const asList = (value) => (Array.isArray(value) ? value : []);
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
  String(target || "")
    .trim()
    .split("?")[0]
    .split("#")[0];

const isKnownInternalRoute = (target) => {
  const pathname = getPathnameFromTarget(target);
  if (!pathname) return false;
  return KNOWN_USER_ROUTE_PATTERNS.some(
    (pattern) => !!matchPath({ path: pattern, end: true }, pathname),
  );
};

const resolveBannerLink = (banner) => {
  const candidate = String(
    banner?.linkUrl || banner?.link || banner?.url || "",
  ).trim();
  if (!candidate) return "";
  if (isExternalLink(candidate)) return candidate;
  if (isSafeInternalPath(candidate) && isKnownInternalRoute(candidate))
    return candidate;
  return "";
};

const isExternalLink = (target) =>
  /^https?:\/\//i.test(String(target || "").trim());
const isSafeInternalPath = (target) => String(target || "").startsWith("/");

const getButtonStyleClasses = (style = "primary", isDarkBg = false) => {
  const base =
    "inline-flex items-center justify-center gap-2 font-black py-2.5 px-6 md:py-3.5 md:px-8 rounded-xl transition-all duration-300 shadow-md cursor-pointer select-none text-[10px] md:text-sm active:scale-95 whitespace-nowrap";
  if (isDarkBg) {
    switch (style) {
      case "secondary":
        return `${base} bg-slate-800 text-white hover:bg-slate-700 border border-slate-700 hover:scale-[1.02] shadow-[0_4px_15px_rgba(0,0,0,0.3)]`;
      case "outline":
        return `${base} bg-transparent text-white border-2 border-white/80 hover:bg-white/10 hover:scale-[1.02]`;
      case "primary":
      default:
        return `${base} bg-gradient-to-r from-primary-500 to-primary-600 text-white hover:from-primary-600 hover:to-primary-700 hover:scale-[1.02] shadow-[0_4px_20px_rgba(124,58,237,0.35)]`;
    }
  } else {
    switch (style) {
      case "secondary":
        return `${base} bg-slate-100 hover:bg-slate-200 text-slate-800 hover:scale-[1.02] border border-slate-200/80`;
      case "outline":
        return `${base} bg-transparent border-2 border-primary-600 text-primary-600 hover:bg-primary-50 hover:scale-[1.02]`;
      case "primary":
      default:
        return `${base} bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white hover:scale-[1.02] shadow-[0_4px_20px_rgba(109,40,217,0.35)]`;
    }
  }
};

const SECTION_COMPONENTS = {
  flash_sale: React.lazy(() => import('../components/HomeSections/FlashSaleSection')),
  seasonal_collection: React.lazy(() => import('../components/HomeSections/SeasonalCollectionSection')),
  promotional_banner: React.lazy(() => import('../components/HomeSections/PromotionalBannerSection')),
  best_sellers: React.lazy(() => import('../components/HomeSections/BestSellersSection')),
  recently_viewed: React.lazy(() => import('../components/HomeSections/RecentlyViewedSection')),
  top_rated: React.lazy(() => import('../components/HomeSections/TopRatedSection'))
};

const MobileHome = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get("q");
  
  const { isAuthenticated } = useAuthStore();
  const [homepageSections, setHomepageSections] = useState([]);
  const [userSections, setUserSections] = useState([]);
  const [homepageLoading, setHomepageLoading] = useState(true);

  // Catalog & Banners State
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [homeVendors, setHomeVendors] = useState([]);
  const [homeBrands, setHomeBrands] = useState([]);
  const [slides, setSlides] = useState(DEFAULT_HERO_SLIDES);
  const [promoBanners, setPromoBanners] = useState([]);
  const [sideBanner, setSideBanner] = useState(null);
  const [categoryFocusBanner, setCategoryFocusBanner] = useState(null);
  const [categoryFocusItems, setCategoryFocusItems] = useState([]);
  const [dealItems, setDealItems] = useState([]);

  // Search State
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  // Slide state
  const [currentSlide, setCurrentSlide] = useState(0);
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [autoSlidePaused, setAutoSlidePaused] = useState(false);
  const [isDraggingSlide, setIsDraggingSlide] = useState(false);

  useEffect(() => {
    if (q) {
      setIsSearching(true);
      api.get("/products", { params: { q, page: 1, limit: 120 } })
        .then(res => {
          const payload = extractResponseData(res);
          const rawList = Array.isArray(payload?.products) ? payload.products : (Array.isArray(payload) ? payload : []);
          let list = rawList.map(normalizeProduct).filter((p) => p.id && p.isActive !== false);

          if (list.length === 0 && catalogProducts.length > 0) {
            const lowerQ = String(q).toLowerCase().trim();
            list = catalogProducts.filter(p =>
              String(p.name || '').toLowerCase().includes(lowerQ) ||
              String(p.categoryName || '').toLowerCase().includes(lowerQ) ||
              String(p.brandName || '').toLowerCase().includes(lowerQ) ||
              String(p.description || '').toLowerCase().includes(lowerQ)
            );
          }

          setSearchResults(list);
          setIsSearching(false);
        })
        .catch(() => {
          if (catalogProducts.length > 0) {
            const lowerQ = String(q).toLowerCase().trim();
            const list = catalogProducts.filter(p =>
              String(p.name || '').toLowerCase().includes(lowerQ) ||
              String(p.categoryName || '').toLowerCase().includes(lowerQ) ||
              String(p.brandName || '').toLowerCase().includes(lowerQ) ||
              String(p.description || '').toLowerCase().includes(lowerQ)
            );
            setSearchResults(list);
          } else {
            setSearchResults([]);
          }
          setIsSearching(false);
        });
    } else {
      setSearchResults([]);
    }
  }, [q, catalogProducts]);

  const fallbackMostPopular = getMostPopular();
  const fallbackTrending = getTrending();
  const fallbackFlashSale = getFlashSale();
  const fallbackNewArrivals = getAllNewArrivals().slice(0, 6);
  const fallbackDailyDeals = getDailyDeals().slice(0, 5);
  const fallbackRecommended = getRecommendedProducts(6);
  const fallbackVendors = getApprovedVendors();
  const fallbackBrands = getCatalogBrands().slice(0, 10);

  const computedNewArrivals = useMemo(() => {
    if (catalogProducts.length === 0) return fallbackNewArrivals;
    return catalogProducts.filter((p) => p.isNew).slice(0, 6);
  }, [catalogProducts, fallbackNewArrivals]);

  const computedDailyDeals = useMemo(() => {
    if (catalogProducts.length === 0) return fallbackDailyDeals;
    return deriveDailyDeals(catalogProducts).slice(0, 5);
  }, [catalogProducts, fallbackDailyDeals]);

  const computedRecommended = useMemo(() => {
    if (catalogProducts.length === 0) return fallbackRecommended;
    return [...catalogProducts]
      .sort((a, b) => toNumber(b.rating, 0) - toNumber(a.rating, 0))
      .slice(0, 6);
  }, [catalogProducts, fallbackRecommended]);

  const computedMostPopular = useMemo(() => {
    if (catalogProducts.length === 0) return fallbackMostPopular.slice(0, 6);
    return [...catalogProducts]
      .sort((a, b) => {
        const reviewsDiff =
          toNumber(b.reviewCount, 0) - toNumber(a.reviewCount, 0);
        if (reviewsDiff !== 0) return reviewsDiff;
        return toNumber(b.rating, 0) - toNumber(a.rating, 0);
      })
      .slice(0, 6);
  }, [catalogProducts, fallbackMostPopular]);

  const computedTrending = useMemo(() => {
    if (catalogProducts.length === 0) return fallbackTrending.slice(0, 6);
    return [...catalogProducts]
      .sort((a, b) => {
        const ratingDiff = toNumber(b.rating, 0) - toNumber(a.rating, 0);
        if (ratingDiff !== 0) return ratingDiff;
        return toNumber(b.reviewCount, 0) - toNumber(a.reviewCount, 0);
      })
      .slice(0, 6);
  }, [catalogProducts, fallbackTrending]);

  const computedFlashSale = useMemo(() => {
    if (catalogProducts.length === 0) return fallbackFlashSale.slice(0, 6);
    return catalogProducts.filter((product) => product.flashSale).slice(0, 6);
  }, [catalogProducts, fallbackFlashSale]);

  const computedVendors = useMemo(() => {
    if (homeVendors.length === 0) return fallbackVendors;
    return [...homeVendors]
      .filter((vendor) => vendor.status === "approved")
      .sort((a, b) => toNumber(b.rating, 0) - toNumber(a.rating, 0))
      .slice(0, 10);
  }, [homeVendors, fallbackVendors]);

  const computedBrands = useMemo(() => {
    if (homeBrands.length === 0) return fallbackBrands;
    return homeBrands.slice(0, 10);
  }, [homeBrands, fallbackBrands]);

  const combinedSections = useMemo(() => {
    const all = [...homepageSections, ...userSections];
    const sorted = all.sort((a, b) => a.order - b.order || b.priority - a.priority);
    return sorted;
  }, [homepageSections, userSections]);

  const fetchHomeData = useCallback(async () => {
    try {
      const [productsRes, vendorsRes, brandsRes, bannersRes, homepageRes] =
        await Promise.allSettled([
          api.get("/products", { params: { page: 1, limit: 120 } }),
          api.get("/vendors/all", {
            params: { status: "approved", page: 1, limit: 50 },
          }),
          api.get("/brands/all"),
          api.get("/banners"),
          api.get("/homepage"),
        ]);

      if (productsRes.status === "fulfilled") {
        const payload = extractResponseData(productsRes.value);
        const productsSource = asList(payload?.products);
        const normalizedProducts = productsSource
          .map(normalizeProduct)
          .filter((product) => product.id && product.isActive !== false);
        setCatalogProducts(normalizedProducts);
      }

      if (vendorsRes.status === "fulfilled") {
        const payload = extractResponseData(vendorsRes.value);
        const vendorsSource = asList(payload?.vendors);
        setHomeVendors(
          vendorsSource.map(normalizeVendor).filter((vendor) => vendor.id),
        );
      }

      if (brandsRes.status === "fulfilled") {
        const payload = extractResponseData(brandsRes.value);
        const brandsSource = asList(payload);
        setHomeBrands(
          brandsSource.map(normalizeBrand).filter((brand) => brand.id),
        );
      }

      if (bannersRes.status === "fulfilled") {
        const payload = extractResponseData(bannersRes.value);
        const allBanners = asList(payload).filter(
          (banner) => banner?.image && banner?.isActive !== false,
        );

        const bannerSlides = allBanners
          .filter((banner) =>
            ["home_slider", "hero"].includes(String(banner?.type || "")),
          )
          .sort((a, b) => toNumber(a.order, 0) - toNumber(b.order, 0))
          .map((banner, index) => ({
            id: normalizeId(banner._id || banner.id || `home-slide-${index}`),
            image: banner.image,
            mobileImage: banner.mobileImage,
            altText: banner.altText || "",
            openInNewTab: !!banner.openInNewTab,
            showButton: banner.showButton !== false,
            buttonText: banner.buttonText || "Shop Now",
            buttonStyle: banner.buttonStyle || "primary",
            link: resolveBannerLink(banner),
            title: banner.title || "Shop Smart. Live Better.",
            subtitle: banner.subtitle || "BEST DEALS",
            description:
              banner.description ||
              "Discover the best products at unbeatable prices. Quality you can trust.",
            hasOverlay: !!banner.title,
          }));
        setSlides(bannerSlides.length > 0 ? bannerSlides : DEFAULT_HERO_SLIDES);

        const banners = allBanners
          .filter((banner) => String(banner?.type || "") === "promotional")
          .sort((a, b) => toNumber(a.order, 0) - toNumber(b.order, 0))
          .map((banner, index) => ({
            id: normalizeId(banner._id || banner.id || `promo-banner-${index}`),
            title: banner.title || "Special Offer",
            subtitle: banner.subtitle || "Limited Time",
            description: banner.description || "",
            discount: banner.buttonText || banner.description || "Shop Now",
            link: resolveBannerLink(banner),
            image: banner.image,
            mobileImage: banner.mobileImage,
            altText: banner.altText || "",
            openInNewTab: !!banner.openInNewTab,
            showButton: banner.showButton !== false,
            buttonText: banner.buttonText || "Shop Now",
            buttonStyle: banner.buttonStyle || "primary",
            type: banner.type || "promotional",
          }));
        setPromoBanners(banners);

        const mapped = allBanners
          .filter((banner) => String(banner?.type || "") === "side_banner")
          .sort((a, b) => toNumber(a.order, 0) - toNumber(b.order, 0))
          .map((banner, index) => ({
            id: normalizeId(banner._id || banner.id || `side-banner-${index}`),
            image: banner.image,
            mobileImage: banner.mobileImage,
            altText: banner.altText || "",
            openInNewTab: !!banner.openInNewTab,
            showButton: banner.showButton !== false,
            buttonText: banner.buttonText || "Explore Now",
            buttonStyle: banner.buttonStyle || "primary",
            title: banner.title || "PREMIUM",
            subtitle: banner.subtitle || "Exclusive Collection",
            description: banner.description || "",
            link: resolveBannerLink(banner),
          }));
        setSideBanner(mapped[0] || null);

        // Category Focus Banner
        const focusBanner = allBanners
          .filter(
            (banner) => String(banner?.type || "") === "category_focus_banner",
          )
          .sort((a, b) => toNumber(a.order, 0) - toNumber(b.order, 0))[0];
        if (focusBanner) {
          setCategoryFocusBanner({
            title: focusBanner.title,
            subtitle: focusBanner.subtitle,
            description: focusBanner.description,
            image: focusBanner.image,
            mobileImage: focusBanner.mobileImage,
            altText: focusBanner.altText || "",
            openInNewTab: !!focusBanner.openInNewTab,
            showButton: focusBanner.showButton !== false,
            buttonText: focusBanner.buttonText || "Shop Now",
            buttonStyle: focusBanner.buttonStyle || "primary",
            link: resolveBannerLink(focusBanner),
          });
        } else {
          setCategoryFocusBanner(null);
        }

        // Category Focus Items
        const focusItems = allBanners
          .filter(
            (banner) => String(banner?.type || "") === "category_focus_item",
          )
          .sort((a, b) => toNumber(a.order, 0) - toNumber(b.order, 0))
          .map((banner) => ({
            name: banner.title,
            image: banner.image,
            mobileImage: banner.mobileImage,
            altText: banner.altText || "",
            openInNewTab: !!banner.openInNewTab,
            showButton: banner.showButton !== false,
            buttonText: banner.buttonText || "Shop Now",
            buttonStyle: banner.buttonStyle || "primary",
            link: resolveBannerLink(banner),
          }));
        setCategoryFocusItems(focusItems);

        // Deal Items
        const deals = allBanners
          .filter((banner) => String(banner?.type || "") === "deal_item")
          .sort((a, b) => toNumber(a.order, 0) - toNumber(b.order, 0))
          .map((banner) => ({
            brand: banner.title,
            offer: banner.subtitle,
            image: banner.image,
            mobileImage: banner.mobileImage,
            altText: banner.altText || "",
            openInNewTab: !!banner.openInNewTab,
            showButton: banner.showButton !== false,
            buttonText: banner.buttonText || "Shop Now",
            buttonStyle: banner.buttonStyle || "primary",
            link: resolveBannerLink(banner),
          }));
        setDealItems(deals);
      } else {
        setSlides(DEFAULT_HERO_SLIDES);
        setPromoBanners([]);
        setSideBanner(null);
        setCategoryFocusBanner(null);
        setCategoryFocusItems([]);
        setDealItems([]);
      }

      if (homepageRes.status === "fulfilled") {
        const payload = extractResponseData(homepageRes.value) || {};
        const parsedSections = (payload.sections || []).map(sec => {
          if (Array.isArray(sec.data)) {
            return {
              ...sec,
              data: sec.data.map(normalizeProduct).filter(Boolean)
            };
          }
          return sec;
        });
        setHomepageSections(parsedSections);
      }

      if (isAuthenticated) {
        try {
          const userHomeRes = await api.get("/user/homepage");
          const payload = extractResponseData(userHomeRes) || {};
          const parsedUserSections = (payload.sections || []).map(sec => {
            if (Array.isArray(sec.data)) {
              return {
                ...sec,
                data: sec.data.map(normalizeProduct).filter(Boolean)
              };
            }
            return sec;
          });
          setUserSections(parsedUserSections);
        } catch (err) {
          console.error("Failed to load user-specific homepage sections:", err);
        }
      } else {
        setUserSections([]);
      }
      setHomepageLoading(false);

      return true;
    } catch {
      setHomepageLoading(false);
      return false;
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetchHomeData();
  }, [fetchHomeData]);

  // Auto-slide functionality (pauses when user is dragging)
  useEffect(() => {
    if (autoSlidePaused) return;

    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [slides.length, autoSlidePaused]);

  // Minimum swipe distance (in pixels) to trigger slide change
  const minSwipeDistance = 50;

  const onTouchStart = (e) => {
    e.stopPropagation(); // Prevent pull-to-refresh from interfering
    setTouchEnd(null);
    setIsDraggingSlide(false);
    const touch = e.targetTouches[0];
    setTouchStart(touch.clientX);
    setDragOffset(0);
    setAutoSlidePaused(true);
  };

  const onTouchMove = (e) => {
    if (touchStart === null) return;
    e.stopPropagation(); // Prevent pull-to-refresh from interfering
    const touch = e.targetTouches[0];
    const currentX = touch.clientX;
    // Calculate difference: positive when swiping left, negative when swiping right
    const diff = touchStart - currentX;
    if (Math.abs(diff) > 8) {
      setIsDraggingSlide(true);
    }
    // Constrain the drag offset to prevent over-dragging
    // Use container width for better responsiveness
    const containerWidth = e.currentTarget?.offsetWidth || 400;
    const maxDrag = containerWidth * 0.5; // Maximum drag distance (50% of container)
    // dragOffset: positive = swiping left (show next), negative = swiping right (show previous)
    setDragOffset(Math.max(-maxDrag, Math.min(maxDrag, diff)));
    setTouchEnd(currentX);
  };

  const onTouchEnd = (e) => {
    if (e) e.stopPropagation(); // Prevent pull-to-refresh from interfering

    if (touchStart === null) {
      setAutoSlidePaused(false);
      return;
    }

    // Calculate swipe distance: positive = left swipe, negative = right swipe
    const distance = touchStart - (touchEnd || touchStart);
    const isLeftSwipe = distance > minSwipeDistance; // Finger moved left = show next slide
    const isRightSwipe = distance < -minSwipeDistance; // Finger moved right = show previous slide

    if (isLeftSwipe) {
      // Swipe left (finger moved left) - go to next slide (slide moves left)
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    } else if (isRightSwipe) {
      // Swipe right (finger moved right) - go to previous slide (slide moves right)
      setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length);
    }

    // Reset touch state
    setTouchStart(null);
    setTouchEnd(null);
    setDragOffset(0);

    // Resume auto-slide after a short delay
    setTimeout(() => {
      setAutoSlidePaused(false);
    }, 2000);
    setTimeout(() => {
      setIsDraggingSlide(false);
    }, 150);
  };

  const handleSlideClick = (slide) => {
    if (isDraggingSlide) return;
    const target = String(slide?.link || "").trim();
    if (!target) return;

    if (slide.openInNewTab || isExternalLink(target)) {
      window.open(target, "_blank", "noopener,noreferrer");
      return;
    }
    if (isSafeInternalPath(target)) {
      navigate(target);
    }
  };

  const handleBannerNavigation = (banner) => {
    if (!banner) return;
    const target =
      typeof banner === "string"
        ? banner
        : String(banner?.link || banner?.linkUrl || "").trim();
    if (!target) return;

    const openInNewTab =
      typeof banner === "object" && banner !== null
        ? !!banner.openInNewTab
        : false;

    if (openInNewTab || isExternalLink(target)) {
      window.open(target, "_blank", "noopener,noreferrer");
      return;
    }
    navigate(target);
  };

  // Pull to refresh handler
  const handleRefresh = async () => {
    const ok = await fetchHomeData();
    if (!ok) {
      toast.error("Refresh failed. Showing available data.");
      return;
    }
    toast.success("Refreshed");
  };

  const {
    pullDistance,
    isPulling,
    elementRef,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  } = usePullToRefresh(handleRefresh);

  return (
    <PageTransition>
      <MobileLayout>
        <div
          ref={elementRef}
          className="w-full"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{
            transform: `translateY(${Math.min(pullDistance, 80)}px)`,
            transition: isPulling ? "none" : "transform 0.3s ease-out",
          }}
        >
          {q ? (
            <div className="px-4 py-6 md:px-8 min-h-[60vh]">
              <div className="mb-6">
                <h2 className="text-xl md:text-2xl font-black text-gray-800">Search Results</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Showing {searchResults.length} {searchResults.length === 1 ? 'product' : 'products'} for <span className="font-bold text-gray-900">"{q}"</span>
                </p>
              </div>

              {isSearching ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4 lg:gap-5">
                  {[...Array(12)].map((_, i) => (
                    <div key={i} className="bg-white border rounded-2xl p-3 animate-pulse space-y-3">
                      <div className="bg-gray-200 rounded-xl h-36 w-full" />
                      <div className="h-4 bg-gray-200 rounded w-3/4" />
                      <div className="h-3 bg-gray-200 rounded w-1/2" />
                      <div className="h-6 bg-gray-200 rounded w-1/3" />
                    </div>
                  ))}
                </div>
              ) : searchResults.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4 lg:gap-5">
                  {searchResults.map((product, idx) => (
                    <motion.div
                      key={product.id}
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(idx * 0.04, 0.4) }}
                    >
                      <ProductCard product={product} />
                    </motion.div>
                  ))}
                </div>
              ) : (
                <div className="w-full max-w-md md:max-w-2xl mx-auto bg-white rounded-3xl border border-gray-150 shadow-sm p-8 md:p-12 flex flex-col items-center text-center my-8">
                  <span className="text-5xl md:text-7xl mb-4">😔</span>
                  <h3 className="text-lg md:text-xl font-black text-gray-800 mb-2">No products found</h3>
                  <p className="text-sm text-gray-500 mb-6">
                    Try searching for something else, like:
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {['Shoes', 'Watches', 'Bags', 'Clothing'].map(term => (
                      <button
                        key={term}
                        onClick={() => setSearchParams({ q: term })}
                        className="px-4 py-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-full text-xs font-bold text-gray-700 transition-colors"
                      >
                        {term}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
          {/* Hero Banner */}
          <div className="px-4 pb-4 pt-2">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div
                className="relative w-full h-40 md:h-80 lg:h-[400px] xl:h-[450px] rounded-2xl md:rounded-3xl overflow-hidden lg:col-span-2 border border-slate-800/80 shadow-[0_12px_40px_rgba(0,0,0,0.35)]"
                data-carousel
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
                style={{ touchAction: "pan-y", userSelect: "none" }}
              >
                {/* Slider Container - All slides in a row */}
                <motion.div
                  className="flex h-full"
                  style={{
                    width: `${slides.length * 100}%`,
                    height: "100%",
                  }}
                  animate={{
                    x:
                      dragOffset !== 0
                        ? `calc(-${
                            currentSlide * (100 / slides.length)
                          }% - ${dragOffset}px)`
                        : `-${currentSlide * (100 / slides.length)}%`,
                  }}
                  transition={{
                    duration: dragOffset !== 0 ? 0 : 0.6,
                    ease: [0.25, 0.46, 0.45, 0.94], // Smooth easing
                    type: "tween",
                  }}
                >
                  {slides.map((slide, index) => (
                    <div
                      key={index}
                      className="flex-shrink-0 relative animate-fadeIn"
                      onClick={() => handleSlideClick(slide)}
                      style={{
                        width: `${100 / slides.length}%`,
                        height: "100%",
                        cursor: slide?.link ? "pointer" : "default",
                      }}
                    >
                      <picture className="w-full h-full pointer-events-none select-none">
                        {slide.mobileImage && (
                          <source
                            media="(max-width: 640px)"
                            srcSet={slide.mobileImage}
                          />
                        )}
                        <img
                          src={slide.image}
                          alt={slide.altText || `Slide ${index + 1}`}
                          className="w-full h-full object-cover pointer-events-none select-none"
                          draggable={false}
                          onError={(e) => {
                            e.target.src = `https://via.placeholder.com/400x200?text=Slide+${index + 1}`;
                          }}
                        />
                      </picture>

                      {/* Text & Button overlays on the left */}
                      {slide.hasOverlay !== false && (
                        <>
                          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/40 to-transparent md:bg-gradient-to-r md:from-slate-950/90 md:via-slate-950/50 md:to-transparent z-10 pointer-events-none" />
                          <div className="absolute inset-y-0 left-0 pl-6 pr-4 md:pl-16 flex flex-col justify-center text-left z-20 max-w-[65%] pointer-events-auto">
                            <div className="space-y-2 md:space-y-4">
                              {slide.subtitle && (
                                <span className="inline-block bg-primary-500/15 text-primary-300 border border-primary-500/30 backdrop-blur-md px-3 py-0.5 md:px-3.5 md:py-1 rounded-full text-[9px] md:text-xs font-extrabold tracking-wider uppercase select-none shadow-[0_2px_10px_rgba(124,58,237,0.2)]">
                                  {slide.subtitle}
                                </span>
                              )}
                              <h2 className="text-white text-lg md:text-3xl lg:text-4xl xl:text-5xl font-black leading-tight tracking-tight drop-shadow-md">
                                {slide.title || "Shop Smart. Live Better."}
                              </h2>
                              <p className="text-slate-200 text-[10px] md:text-sm lg:text-base font-medium leading-relaxed max-w-sm line-clamp-2 md:line-clamp-none drop-shadow">
                                {slide.description ||
                                  "Discover the best products at unbeatable prices."}
                              </p>
                            </div>

                            {/* Action buttons */}
                            {slide.showButton !== false && (
                              <div className="flex items-center gap-3 md:gap-4 mt-4 md:mt-8">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation(); // Avoid triggering parent click
                                    handleSlideClick(slide);
                                  }}
                                  className={getButtonStyleClasses(
                                    slide.buttonStyle,
                                    true,
                                  )}
                                >
                                  <span>{slide.buttonText || "Shop Now"}</span>
                                  <span>&rarr;</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation(); // Avoid triggering parent click
                                    navigate("/offers");
                                  }}
                                  className="flex items-center gap-1.5 md:gap-2 text-slate-200 font-bold text-[9px] md:text-sm hover:text-white transition-colors cursor-pointer select-none bg-slate-900/60 hover:bg-slate-900/80 border border-slate-700/60 backdrop-blur-md px-3 py-1.5 md:px-4 md:py-2 rounded-xl shadow-sm"
                                >
                                  <span className="w-5 h-5 md:w-7 md:h-7 rounded-full bg-slate-800/90 text-slate-200 flex items-center justify-center shadow border border-slate-700 text-xs font-bold font-mono">
                                    &gt;
                                  </span>
                                  <span>Explore Deals</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </motion.div>
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 z-30 pointer-events-none">
                  {slides.map((_, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCurrentSlide(index);
                        setAutoSlidePaused(true);
                        setTimeout(() => setAutoSlidePaused(false), 2000);
                      }}
                      className={`h-1.5 rounded-full transition-all duration-300 pointer-events-auto ${
                        index === currentSlide
                          ? "bg-gradient-to-r from-primary-400 to-primary-500 w-8 shadow-[0_0_10px_rgba(167,139,250,0.6)]"
                          : "bg-white/40 hover:bg-white/70 w-2"
                      }`}
                    />
                  ))}
                </div>
              </div>

              {/* Side Banner for Large Screens (Luxury Collection) */}
              <div
                onClick={() => handleBannerNavigation(sideBanner)}
                className="hidden lg:flex lg:col-span-1 h-[400px] xl:h-[450px] rounded-3xl overflow-hidden relative bg-gradient-to-br from-slate-900 via-slate-900/95 to-slate-950 p-8 border border-slate-800/90 cursor-pointer group shadow-[0_12px_40px_rgba(0,0,0,0.4)]"
              >
                {/* Ambient glowing backlight behind watch */}
                <div className="absolute -right-10 -bottom-10 w-56 h-56 bg-primary-500/10 rounded-full blur-3xl group-hover:bg-primary-500/20 transition-all duration-700 pointer-events-none" />

                {/* Text and Actions (Left side) */}
                <div className="flex-1 flex flex-col justify-between z-20 text-left h-full max-w-[60%]">
                  <div className="space-y-4">
                    <span className="inline-block bg-amber-500/10 text-amber-400 border border-amber-500/20 px-3 py-1 rounded-full text-xs font-black tracking-widest uppercase">
                      {sideBanner?.subtitle || "PREMIUM COLLECTION"}
                    </span>
                    <h3 className="text-white text-3xl font-black leading-tight tracking-tight drop-shadow-sm">
                      {sideBanner?.title || "Luxury that Defines You"}
                    </h3>
                    <p className="text-slate-300 text-sm font-medium leading-relaxed">
                      {sideBanner?.description ||
                        "Exclusive watches for every occasion."}
                    </p>
                  </div>

                  {sideBanner?.showButton !== false && (
                    <button
                      type="button"
                      className={`${getButtonStyleClasses(
                        sideBanner?.buttonStyle,
                        true,
                      )} self-start`}
                    >
                      <span>{sideBanner?.buttonText || "Explore Now"}</span>
                      <span>&rarr;</span>
                    </button>
                  )}
                </div>

                {/* Watch Image (Right side, absolute and offset) */}
                <div className="absolute right-0 bottom-0 top-0 w-[55%] flex items-center justify-end z-10 select-none overflow-hidden">
                  <picture className="h-[110%] w-auto object-contain translate-x-[12%] group-hover:scale-105 group-hover:translate-x-[8%] transition-transform duration-700 pointer-events-none select-none">
                    {sideBanner?.mobileImage && (
                      <source
                        media="(max-width: 640px)"
                        srcSet={sideBanner.mobileImage}
                      />
                    )}
                    <img
                      src={sideBanner?.image || stylishWatchImg}
                      alt={sideBanner?.altText || "Premium Watch"}
                      className="h-full w-auto object-contain pointer-events-none select-none"
                      draggable={false}
                      onError={(e) => {
                        e.target.src =
                          "https://via.placeholder.com/400x400?text=Premium+Watch";
                      }}
                    />
                  </picture>
                </div>
              </div>
            </div>
          </div>

          {/* Brand Logos Scroll */}
          <BrandLogosScroll brands={computedBrands} />

          {/* Categories */}
          <MobileCategoryGrid />

          {/* Animated Banner */}
          <AnimatedBanner banners={promoBanners} />

          {/* Featured Products */}
          <div className="py-4 bg-white mb-2">
            <div className="px-4 flex items-center justify-between mb-4">
              <h2 className="text-xl lg:text-2xl font-black text-gray-900 tracking-tight">
                Featured Products
              </h2>
              <Link
                to="/search"
                className="text-xs lg:text-sm font-bold text-primary-600 hover:text-primary-700 transition-colors uppercase tracking-wider"
              >
                See All &rarr;
              </Link>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
              {computedMostPopular.slice(0, 6).map((product, index) => (
                <motion.div
                  key={product.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="min-w-[170px] w-[170px] flex-shrink-0"
                >
                  <ProductCard product={product} />
                </motion.div>
              ))}
            </div>
          </div>

          {/* Category In Focus */}
          <CategoryInFocus
            banner={categoryFocusBanner}
            items={categoryFocusItems}
          />

          {/* Deals Section */}
          <DealsSection items={dealItems} />

          {/* Dynamic sections registry map */}
          <div className="space-y-4 px-4 md:px-0">
            <Suspense fallback={
              <div className="py-12 flex justify-center items-center">
                <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            }>
              {combinedSections.map((section) => {
                const Component = SECTION_COMPONENTS[section.type];
                if (!Component) {
                  return null;
                }

                const hasData = Array.isArray(section.data) ? section.data.length > 0 : !!section.data;
                if (!hasData) {
                  return null;
                }

                // Honor minimumProducts display condition
                if (Array.isArray(section.data) && section.data.length < (section.minimumProducts || 0)) {
                  return null;
                }

                // Render best_sellers, recently_viewed, top_rated by passing products
                if (['best_sellers', 'recently_viewed', 'top_rated'].includes(section.type)) {
                  return <Component key={section.type} products={section.data} title={section.title} subtitle={section.subtitle} />;
                }

                return (
                  <Component
                    key={section.type}
                    data={section.data}
                    layout={section.layout}
                    title={section.title}
                    subtitle={section.subtitle}
                    banner={section.banner}
                    mobileBanner={section.mobileBanner}
                    bannerTitle={section.bannerTitle}
                    bannerSubtitle={section.bannerSubtitle}
                    ctaText={section.ctaText}
                    ctaLink={section.ctaLink}
                    backgroundColor={section.backgroundColor}
                    gradient={section.gradient}
                    bannerBgColor={section.bannerBgColor}
                    bannerBgGradient={section.bannerBgGradient}
                    textColor={section.textColor}
                    buttonColor={section.buttonColor}
                    overlayOpacity={section.overlayOpacity}
                    countdownDate={section.countdownDate}
                    categories={section.categories}
                    vendors={section.vendors}
                  />
                );
              })}
            </Suspense>
          </div>

          {/* Trust Bar */}
          <TrustBar />


          {/* Bottom Spacing */}
          <div className="h-4" />
            </>
          )}
        </div>
      </MobileLayout>
    </PageTransition>
  );
};

export default MobileHome;
