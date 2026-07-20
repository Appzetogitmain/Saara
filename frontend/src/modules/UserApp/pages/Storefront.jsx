import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, useSearchParams, Link, useLocation } from "react-router-dom";
import { 
  FiSearch, FiStar, FiCheckCircle, FiInfo, FiFolder, 
  FiMail, FiPhone, FiMapPin, FiArrowLeft, FiFilter 
} from "react-icons/fi";
import { FaFacebookF, FaInstagram, FaTwitter, FaYoutube, FaWhatsapp } from "react-icons/fa";
import api from "../../../shared/utils/api";
import toast from "react-hot-toast";
import { formatPrice } from "../../../shared/utils/helpers";
import MobileLayout from "../components/Layout/MobileLayout";
import CmsPageRenderer from "../../../shared/components/CmsPageRenderer";
import ProductCard from "../../../shared/components/ProductCard";

const Storefront = () => {
  const { slug, pageKey: rawPageKey = "home", collectionSlug, categorySlug } = useParams();
  const pageKey = rawPageKey === "offer" ? "offers" : rawPageKey;
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();

  const [store, setStore] = useState(null);
  const [pageData, setPageData] = useState(null);
  const [collections, setCollections] = useState([]);
  const [storeNavigation, setStoreNavigation] = useState([]);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const filteredNavigation = useMemo(() => {
    return (storeNavigation || []).filter(item => {
      if (!item.visibility) return true;
      if (isMobile) {
        return item.visibility.mobile !== false;
      } else {
        return item.visibility.desktop !== false;
      }
    });
  }, [storeNavigation, isMobile]);

  const [storeStats, setStoreStats] = useState(null);
  const [catalogProducts, setCatalogProducts] = useState([]);
  
  const [homeProducts, setHomeProducts] = useState([]);
  const [homePage, setHomePage] = useState(1);
  const [homeTotalPages, setHomeTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);

  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [catalogLoading, setCatalogLoading] = useState(false);

  // Search & Filter Parameters
  const searchQuery = searchParams.get("q") || "";
  const [tempSearch, setTempSearch] = useState(searchQuery);
  const categoryFilter = searchParams.get("category") || "";
  const priceMinFilter = searchParams.get("priceMin") || "";
  const priceMaxFilter = searchParams.get("priceMax") || "";
  const ratingFilter = searchParams.get("rating") || "";
  const discountFilter = searchParams.get("discount") || "";
  const sortFilter = searchParams.get("sort") || "newest";
  const pageFilter = Number(searchParams.get("page")) || 1;

  const [showMobileFilters, setShowMobileFilters] = useState(false);

  // Dynamic Contact Form state
  const [contactSubmitted, setContactSubmitted] = useState(false);
  const [contactSubmitting, setContactSubmitting] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactMessage, setContactMessage] = useState("");

  const currentView = useMemo(() => {
    const path = location.pathname;
    if (path.includes("/search")) return "search";
    if (path.includes("/products")) return "products";
    if (path.includes("/category/")) return "category";
    if (path.includes("/collection/")) return "single-collection";
    if (path.includes("/collections/")) return "single-collection";
    if (path.includes("/collections")) return "collections";
    if (path.includes("/about")) return "about";
    if (path.includes("/contact")) return "contact";
    return "cms";
  }, [location.pathname]);

  const hasCustomProductsBlock = useMemo(() => {
    if (!pageData?.sections) return false;
    return pageData.sections.some(sec => 
      sec.sectionType === "Product Grid" || 
      sec.sectionType === "Product Carousel" || 
      sec.sectionType === "Collection"
    );
  }, [pageData]);

  const isPlaceholderOnly = useMemo(() => {
    if (!pageData?.sections || pageData.sections.length !== 1) return false;
    const first = pageData.sections[0];
    return first.sectionType === "Text Block" && String(first.title).startsWith("Welcome to");
  }, [pageData]);

  // Load basic store metadata
  useEffect(() => {
    const loadStorefrontMetadata = async () => {
      setLoading(true);
      try {
        const res = await api.get(`/store/${slug}`, { params: { pageKey } });
        const payload = res?.data ?? res;
        setStore(payload.store);
        setPageData(payload.page);
        setCollections(payload.collections || []);
        setStoreStats(payload.stats || null);
        setStoreNavigation(payload.navigation || []);
      } catch (err) {
        console.error("Error loading store details:", err);
      } finally {
        setLoading(false);
      }
    };
    loadStorefrontMetadata();
  }, [slug, pageKey]);

  // Fetch sections layout if cmsView is active
  useEffect(() => {
    if (currentView !== "cms" || !store) return;
    const fetchPage = async () => {
      try {
        const res = await api.get(`/store/${slug}/page/${pageKey}`);
        const payload = res?.data ?? res;
        setPageData(payload.page);
      } catch (err) {
        console.error("Error loading custom page:", err);
      }
    };
    fetchPage();
  }, [slug, pageKey, currentView, store]);

  // Fetch homepage products catalog initially (page 1)
  useEffect(() => {
    if (currentView !== "cms") return;
    const fetchInitialHomeCatalog = async () => {
      setCatalogLoading(true);
      try {
        const res = await api.get(`/store/${slug}/products`, { params: { page: 1, limit: 12 } });
        const payload = res?.data ?? res;
        setHomeProducts(payload.products || []);
        setHomeTotalPages(payload.pages || 1);
        setHomePage(1);
      } catch (err) {
        console.error("Error loading home catalog:", err);
      } finally {
        setCatalogLoading(false);
      }
    };
    fetchInitialHomeCatalog();
  }, [slug, currentView]);

  // Fetch catalog listing for products/collections tabs (pageFilter searchParams)
  useEffect(() => {
    if (currentView !== "products" && currentView !== "single-collection") return;
    const fetchCatalog = async () => {
      setCatalogLoading(true);
      try {
        const params = {
          page: pageFilter,
          collection: collectionSlug || ""
        };
        const res = await api.get(`/store/${slug}/products`, { params });
        const payload = res?.data ?? res;
        setCatalogProducts(payload.products || []);
        setTotalPages(payload.pages || 1);
        setTotalCount(payload.totalProducts || 0);
      } catch (err) {
        console.error("Error fetching products catalog:", err);
      } finally {
        setCatalogLoading(false);
      }
    };
    fetchCatalog();
  }, [slug, pageFilter, collectionSlug, currentView]);

  // Fetch advanced filtered search catalog results or category listings
  useEffect(() => {
    if (currentView !== "search" && currentView !== "category") return;
    const fetchSearchResults = async () => {
      setCatalogLoading(true);
      try {
        const params = {
          q: searchQuery,
          category: currentView === "category" ? categorySlug : categoryFilter,
          priceMin: priceMinFilter,
          priceMax: priceMaxFilter,
          rating: ratingFilter,
          discount: discountFilter,
          sort: sortFilter,
          page: pageFilter
        };
        const res = await api.get(`/store/${slug}/search`, { params });
        const payload = res?.data ?? res;
        setCatalogProducts(payload.products || []);
        setTotalPages(payload.pages || 1);
        setTotalCount(payload.totalProducts || 0);
      } catch (err) {
        console.error("Error searching store products:", err);
      } finally {
        setCatalogLoading(false);
      }
    };
    fetchSearchResults();
  }, [slug, searchQuery, categoryFilter, categorySlug, priceMinFilter, priceMaxFilter, ratingFilter, discountFilter, sortFilter, pageFilter, currentView]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    navigate(`/store/${slug}/search?q=${tempSearch}`);
  };

  const handleContactSubmit = async (e) => {
    e.preventDefault();
    if (!contactName.trim() || !contactEmail.trim() || !contactMessage.trim()) {
      toast.error("Please fill in all inquiry fields.");
      return;
    }
    setContactSubmitting(true);
    try {
      await api.post(`/store/${slug}/contact`, {
        name: contactName,
        email: contactEmail,
        message: contactMessage
      });
      setContactSubmitted(true);
      setContactName("");
      setContactEmail("");
      setContactMessage("");
      toast.success("Inquiry submitted successfully to vendor!");
    } catch (err) {
      console.error("Error submitting contact inquiry:", err);
      toast.error("Failed to submit inquiry. Please try again.");
    } finally {
      setContactSubmitting(false);
    }
  };

  const handleClearFilters = () => {
    setSearchParams({ q: searchQuery });
    setShowMobileFilters(false);
  };

  const handleLoadMoreHomeProducts = async () => {
    if (homePage >= homeTotalPages || loadingMore) return;
    setLoadingMore(true);
    const nextPage = homePage + 1;
    try {
      const res = await api.get(`/store/${slug}/products`, { params: { page: nextPage, limit: 12 } });
      const payload = res?.data ?? res;
      setHomeProducts(prev => [...prev, ...(payload.products || [])]);
      setHomePage(nextPage);
    } catch (err) {
      console.error("Error loading more home products:", err);
    } finally {
      setLoadingMore(false);
    }
  };

  if (loading) {
    return (
      <MobileLayout showBottomNav={true}>
        <div className="flex items-center justify-center min-h-[60vh] text-slate-500">
          <div className="w-8 h-8 border-3 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
          <span className="ml-2 font-bold text-xs uppercase tracking-widest">Loading Storefront...</span>
        </div>
      </MobileLayout>
    );
  }

  if (!store) {
    return (
      <MobileLayout showBottomNav={true}>
        <div className="text-center py-20">
          <h2 className="text-xl font-black text-slate-800">Store Not Found</h2>
          <Link to="/" className="mt-4 inline-block bg-purple-600 text-white px-6 py-2 rounded-xl font-bold text-xs">
            Go Back Home
          </Link>
        </div>
      </MobileLayout>
    );
  }

  return (
    <MobileLayout showBottomNav={true} showHeader={true}>
      <div className="w-full min-h-screen bg-gray-50 pb-20">
        
        {/* Compact Store Header (rendered on all pages except About) */}
        {currentView !== "about" && (
          <div className="bg-white border-b px-4 py-3 sm:py-4">
            <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                {/* Logo */}
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full overflow-hidden border bg-white flex items-center justify-center shrink-0 shadow-sm">
                  {store.logo ? (
                    <img src={store.logo} className="w-full h-full object-cover" alt="Logo" />
                  ) : (
                    <div className="w-full h-full bg-purple-600 text-white font-black text-sm flex items-center justify-center uppercase select-none">
                      {store.storeName ? store.storeName[0] : "S"}
                    </div>
                  )}
                </div>

                {/* Name, Tagline, Rating, Verified */}
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h2 className="text-sm sm:text-base font-black text-slate-800 leading-tight">{store.storeName}</h2>
                    {store.verified && <FiCheckCircle className="text-blue-500 text-xs sm:text-sm shrink-0" />}
                    <span className="flex items-center gap-0.5 bg-yellow-50 text-yellow-750 border border-yellow-150 px-1.5 py-0.5 rounded text-[9px] font-bold">
                      ★ {storeStats?.rating || store.rating || 4.8}
                    </span>
                  </div>
                  {store.businessInfo?.tagline && (
                    <p className="text-[10px] sm:text-xs text-slate-400 font-semibold mt-0.5 line-clamp-1 italic">
                      "{store.businessInfo.tagline}"
                    </p>
                  )}
                </div>
              </div>

              {/* Store Status / Callout */}
              {store.businessInfo?.status === "vacation" && (
                <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider animate-pulse shrink-0">
                  🟡 Vacation Mode
                </span>
              )}
            </div>
          </div>
        )}

        {/* Dynamic Navigation Tabs */}
        <div className="bg-white border-b sticky top-0 z-40 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-4 overflow-x-auto pb-1 scrollbar-hide">
              {(filteredNavigation || []).map((nav, idx) => {
                let targetPath = `/store/${slug}`;
                const dest = nav.destination || nav.target || {};

                if (dest.type === "page") {
                  if (dest.path && dest.path !== "home") {
                    const mappedPath = dest.path === "offer" ? "offers" : dest.path;
                    targetPath = `/store/${slug}/${mappedPath}`;
                  }
                } else if (dest.type === "collection") {
                  targetPath = `/store/${slug}/collection/${dest.path || dest.slug}`;
                } else if (dest.type === "category") {
                  targetPath = `/store/${slug}/category/${dest.path || dest.slug}`;
                } else if (dest.type === "custom" || dest.type === "url") {
                  const p = dest.path || "";
                  if (p === "/collections") targetPath = `/store/${slug}/collections`;
                  else if (p === "/about") targetPath = `/store/${slug}/about`;
                  else if (p === "/contact") targetPath = `/store/${slug}/contact`;
                  else if (p === "/products") targetPath = `/store/${slug}/products`;
                  else if (p === "/offers" || p === "/offer") targetPath = `/store/${slug}/offers`;
                  else if (p.startsWith("/")) targetPath = `/store/${slug}${p}`;
                  else targetPath = p || `/store/${slug}`;
                }

                const normalizeTabPath = (p) => p.replace(/\/offers$/, "/offers").replace(/\/about$/, "/about").replace(/\/contact$/, "/contact");
                const isActive = normalizeTabPath(window.location.pathname) === normalizeTabPath(targetPath) && currentView !== "search";
                const label = nav.label || nav.title || "Link";

                return (
                  <Link
                    key={idx}
                    to={targetPath}
                    className={`text-sm font-bold whitespace-nowrap pb-1 border-b-2 transition-all ${
                      isActive 
                        ? "text-slate-800 border-slate-800 font-black" 
                        : "text-slate-500 border-transparent hover:text-slate-800"
                    }`}
                  >
                    {label}
                  </Link>
                );
              })}
            </div>

            {/* Store search input */}
            <form onSubmit={handleSearchSubmit} className="relative w-full md:w-80">
              <input
                type="text"
                placeholder="Search in store..."
                value={tempSearch}
                onChange={e => setTempSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-xs border rounded-xl bg-gray-50 focus:outline-none focus:bg-white"
              />
              <FiSearch className="absolute left-3.5 top-3 text-gray-400" />
            </form>
          </div>
        </div>

        {/* Large Store Hero Banner (only on About page) */}
        {currentView === "about" && (
          <div className="relative w-full aspect-[21/9] sm:aspect-[21/6] bg-slate-900 overflow-hidden border-b">
            {store.coverBanner ? (
              <img src={store.coverBanner} className="w-full h-full object-cover opacity-60" alt="Cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-r from-purple-900 to-indigo-900 opacity-60" />
            )}

            <div className="absolute inset-0 flex items-end p-4 md:p-8 bg-gradient-to-t from-black/80 via-black/20 to-transparent">
              <div className="flex items-center gap-4 text-white">
                <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-full overflow-hidden border-2 border-white bg-white shrink-0 shadow-md flex items-center justify-center">
                  {store.logo ? (
                    <img src={store.logo} className="w-full h-full object-cover" alt="Logo" />
                  ) : (
                    <div className="w-full h-full bg-purple-600 text-white font-black text-xl sm:text-3xl flex items-center justify-center uppercase select-none">
                      {store.storeName ? store.storeName[0] : "S"}
                    </div>
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-xl sm:text-3xl font-black tracking-tight leading-none">{store.storeName}</h1>
                    {store.verified && <FiCheckCircle className="text-blue-400 text-lg sm:text-2xl fill-current animate-pulse" />}
                  </div>
                  {store.businessInfo?.tagline && (
                    <p className="text-xs sm:text-sm font-semibold italic text-purple-200 mt-1">"{store.businessInfo.tagline}"</p>
                  )}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2 text-xs text-gray-300 font-semibold">
                    <span className="flex items-center gap-1 text-yellow-450 font-black">
                      <FiStar className="fill-current" />
                      ★ {storeStats?.rating || store.rating || 4.8} ({store.vendorId?.reviewCount || 48} reviews)
                    </span>
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-500 hidden sm:inline" />
                    <span>Joined: {new Date(store.vendorId?.joinDate || store.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short' })}</span>
                    {store.businessInfo?.establishedYear && (
                      <>
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-500 hidden sm:inline" />
                        <span>Est. {store.businessInfo.establishedYear}</span>
                      </>
                    )}
                  </div>

                  {store.businessInfo?.status === "vacation" && (
                    <div className="mt-2 bg-amber-500/90 text-amber-950 text-[10px] font-black px-3 py-1 rounded-lg inline-block animate-pulse">
                      🟡 Store on Vacation. {store.businessInfo?.vacationResumeDate ? `Resuming ${store.businessInfo.vacationResumeDate}` : ''}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Content Wrapper */}
        <div className="max-w-7xl mx-auto px-4 py-6">
          
          {/* 1. CMS LAYOUT RESOLVER & PRODUCTS LIST */}
          {(!currentView || currentView === "cms") && pageData && (
            <div className="space-y-10">
              {pageData.sections && pageData.sections.length > 0 && (
                <CmsPageRenderer 
                  sections={pageData.sections || []} 
                  themeOverrides={{
                    primaryColor: store.theme?.primaryColor,
                    accentColor: store.theme?.accentColor,
                    borderRadius: store.theme?.borderRadius,
                    buttonStyle: store.theme?.buttonStyle,
                    slug
                  }} 
                />
              )}
              {pageKey === "home" && !hasCustomProductsBlock && (
                <div className="space-y-6 pt-6 border-t border-gray-150">
                  <div className="border-b pb-2">
                    <h2 className="text-lg font-black text-slate-800 tracking-tight">Our Products</h2>
                    <p className="text-xs text-slate-405 font-semibold">Explore all items from our catalog.</p>
                  </div>
                  {catalogLoading && homeProducts.length === 0 ? (
                    <div className="py-12 text-center">
                      <div className="w-8 h-8 border-3 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        {homeProducts.map(p => (
                          <ProductCard key={p.id} product={p} />
                        ))}
                        {homeProducts.length === 0 && (
                          <div className="col-span-full py-12 text-center text-xs text-slate-400 font-bold uppercase tracking-widest">
                            No products found in this store.
                          </div>
                        )}
                      </div>
                      {homePage < homeTotalPages && (
                        <div className="flex justify-center pt-6">
                          <button
                            onClick={handleLoadMoreHomeProducts}
                            disabled={loadingMore}
                            className="px-6 py-2.5 bg-purple-600 text-white rounded-xl text-xs font-bold shadow-md hover:bg-purple-750 disabled:opacity-50 transition-all active:scale-95"
                          >
                            {loadingMore ? "Loading..." : "Load More Products"}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Page Not Found 404 Fallback */}
          {(!currentView || currentView === "cms") && !pageData && (
            <div className="py-16 text-center max-w-md mx-auto space-y-4">
              <span className="text-4xl">🔍</span>
              <h2 className="text-xl font-black text-slate-800">Page Not Found</h2>
              <p className="text-xs text-slate-400 font-semibold leading-relaxed">
                The storefront page you requested could not be found or has been deleted by the vendor.
              </p>
              <Link
                to={`/store/${slug}`}
                className="inline-block px-5 py-2 bg-purple-600 text-white rounded-xl text-xs font-bold shadow transition-all hover:scale-105 active:scale-95"
              >
                Go to Homepage
              </Link>
            </div>
          )}

          {/* 2. ADVANCED FILTERED SEARCH VIEW */}
          {currentView === "search" && (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
              
              {/* Sidebar Filters */}
              <div className="lg:col-span-1 bg-white border rounded-2xl p-4 shadow-sm space-y-6 hidden lg:block">
                <div className="flex justify-between items-center border-b pb-2">
                  <span className="font-bold text-sm text-slate-800 flex items-center gap-1.5"><FiFilter /> Filters</span>
                  <button onClick={handleClearFilters} className="text-xs font-bold text-pink-500 hover:underline">Clear All</button>
                </div>

                {/* Rating filter */}
                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-slate-450 uppercase">Customer Rating</span>
                  <div className="space-y-1">
                    {[4, 3, 2].map(stars => (
                      <label key={stars} className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                        <input
                          type="radio"
                          name="rating"
                          checked={ratingFilter === String(stars)}
                          onChange={() => setSearchParams(prev => { prev.set("rating", String(stars)); return prev; })}
                        />
                        <span className="flex items-center gap-0.5">{stars}★ & Up</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Price range filter */}
                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-slate-455 uppercase">Price Range</span>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      placeholder="Min"
                      value={priceMinFilter}
                      onChange={e => setSearchParams(prev => { prev.set("priceMin", e.target.value); return prev; })}
                      className="px-2 py-1 border rounded-lg text-xs"
                    />
                    <input
                      type="number"
                      placeholder="Max"
                      value={priceMaxFilter}
                      onChange={e => setSearchParams(prev => { prev.set("priceMax", e.target.value); return prev; })}
                      className="px-2 py-1 border rounded-lg text-xs"
                    />
                  </div>
                </div>

                {/* Discount filter */}
                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-slate-455 uppercase">Discount</span>
                  <div className="space-y-1">
                    {[10, 20, 30].map(pct => (
                      <label key={pct} className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                        <input
                          type="radio"
                          name="discount"
                          checked={discountFilter === String(pct)}
                          onChange={() => setSearchParams(prev => { prev.set("discount", String(pct)); return prev; })}
                        />
                        <span>{pct}% Off or More</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              {/* Main search result panel */}
              <div className="lg:col-span-3 space-y-4">
                <div className="flex justify-between items-center border-b pb-2">
                  <div>
                    <h3 className="font-bold text-sm text-slate-800">Search results for "{searchQuery}"</h3>
                    <span className="text-xs text-slate-400 font-semibold">{totalCount} products found</span>
                  </div>

                  <select
                    value={sortFilter}
                    onChange={e => setSearchParams(prev => { prev.set("sort", e.target.value); return prev; })}
                    className="px-3 py-1.5 border rounded-xl text-xs bg-white focus:outline-none"
                  >
                    <option value="newest">Newest Arrivals</option>
                    <option value="price-asc">Price: Low to High</option>
                    <option value="price-desc">Price: High to Low</option>
                    <option value="rating">Rating: High to Low</option>
                  </select>
                </div>

                {catalogLoading ? (
                  <div className="py-20 text-center">
                    <div className="w-8 h-8 border-3 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {catalogProducts.map(p => (
                      <ProductCard key={p.id} product={p} />
                    ))}
                    {catalogProducts.length === 0 && (
                      <div className="col-span-full py-12 text-center text-xs text-slate-450 uppercase font-black">
                        No products match your search.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* CATEGORY PRODUCT LISTING VIEW */}
          {currentView === "category" && (
            <div className="space-y-6">
              {/* Breadcrumb & Header */}
              <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
                <Link to={`/store/${slug}`} className="hover:text-slate-655">Storefront</Link>
                <span>&rarr;</span>
                <span className="text-slate-700 capitalize">{categorySlug?.replace("-", " ")}</span>
              </div>

              <div className="flex justify-between items-center border-b pb-2">
                <div>
                  <h2 className="text-2xl font-black text-slate-800 tracking-tight capitalize">
                    {categorySlug?.replace("-", " ")} Catalog
                  </h2>
                  <span className="text-xs text-slate-400 font-semibold">{totalCount} items found</span>
                </div>

                <select
                  value={sortFilter}
                  onChange={e => setSearchParams(prev => { prev.set("sort", e.target.value); return prev; })}
                  className="px-3 py-1.5 border rounded-xl text-xs bg-white focus:outline-none"
                >
                  <option value="newest">Newest Arrivals</option>
                  <option value="price-asc">Price: Low to High</option>
                  <option value="price-desc">Price: High to Low</option>
                  <option value="rating">Rating: High to Low</option>
                </select>
              </div>

              {catalogLoading ? (
                <div className="py-20 text-center">
                  <div className="w-8 h-8 border-3 border-purple-550 border-t-transparent rounded-full animate-spin mx-auto"></div>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {catalogProducts.map(p => (
                    <ProductCard key={p.id} product={p} />
                  ))}
                  {catalogProducts.length === 0 && (
                    <div className="col-span-full py-12 text-center text-xs font-bold text-slate-400 uppercase tracking-widest">
                      No products found in this category.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 3. CATALOG LISTINGS VIEW */}
          {currentView === "products" && (
            <div className="space-y-6">
              <h2 className="text-xl font-black text-slate-850">Our Product Catalog</h2>
              {catalogLoading ? (
                <div className="py-20 text-center">
                  <div className="w-8 h-8 border-3 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {catalogProducts.map(p => (
                    <ProductCard key={p.id} product={p} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 4. COLLECTIONS LIST VIEW */}
          {currentView === "collections" && (
            <div className="space-y-6">
              <h2 className="text-xl font-black text-slate-850">Product Collections</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {collections.map(col => (
                  <Link
                    key={col.id}
                    to={`/store/${slug}/collections/${col.slug}`}
                    className="border rounded-2xl p-3 bg-white hover:shadow-md transition-shadow flex flex-col gap-2"
                  >
                    <div className="w-full aspect-square bg-gray-50 border rounded-xl overflow-hidden">
                      <img src={col.image || "/placeholder.jpg"} className="w-full h-full object-cover" alt={col.name} />
                    </div>
                    <span className="font-bold text-sm text-slate-800 line-clamp-1 block">{col.name}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* 5. SINGLE COLLECTION PRODUCTS VIEW */}
          {currentView === "single-collection" && (
            <div className="space-y-6">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
                <Link to={`/store/${slug}`} className="hover:text-slate-655">Storefront</Link>
                <span>&rarr;</span>
                <Link to={`/store/${slug}/collections`} className="hover:text-slate-655">Collections</Link>
                <span>&rarr;</span>
                <span className="text-slate-700 capitalize">{collectionSlug?.replace("-", " ")}</span>
              </div>

              <h2 className="text-2xl font-black text-slate-800 tracking-tight capitalize">
                {collectionSlug?.replace("-", " ")} Collection
              </h2>

              {catalogLoading ? (
                <div className="py-20 text-center">
                  <div className="w-8 h-8 border-3 border-purple-550 border-t-transparent rounded-full animate-spin mx-auto"></div>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {catalogProducts.map(p => (
                    <ProductCard key={p.id} product={p} />
                  ))}
                  {catalogProducts.length === 0 && (
                    <div className="col-span-full py-12 text-center text-xs font-bold text-slate-400 uppercase tracking-widest">
                      No products in this collection.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {/* 6. DYNAMIC ABOUT PAGE VIEW */}
          {currentView === "about" && (
            <div className="space-y-8 animate-fade-in pb-12">

              {/* Grid Layout */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                
                {/* Left Columns (Bio, Stats, Accordions, Contact Form) */}
                <div className="lg:col-span-2 space-y-8">
                  
                  {/* About Our Store */}
                  <div className="bg-white border rounded-2xl p-6 shadow-sm space-y-4">
                    <h3 className="text-base font-black text-slate-800 border-b pb-2.5">
                      About Our Store
                    </h3>
                    <p className="text-xs text-slate-550 leading-relaxed font-semibold whitespace-pre-line">
                      {store.description || "Welcome to our store! We provide high quality, verified authentic goods with the best services."}
                    </p>
                  </div>

                  {/* Dynamic Rule-based Trust Badges */}
                  <div className="bg-white border rounded-2xl p-6 shadow-sm space-y-4">
                    <h3 className="text-base font-black text-slate-800 border-b pb-2.5">Why Choose Us</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {store.verified && (
                        <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-900">
                          <FiCheckCircle className="text-emerald-600 text-lg shrink-0" />
                          <div>
                            <span className="text-xs font-bold block">Verified Seller</span>
                            <span className="text-[10px] text-emerald-700/80 font-semibold">Merchant documents audited & verified</span>
                          </div>
                        </div>
                      )}
                      
                      {(storeStats?.rating || store.rating || 4.8) >= 4.5 && (
                        <div className="flex items-center gap-3 p-3 bg-yellow-50 border border-yellow-100 rounded-xl text-yellow-900">
                          <FiStar className="text-yellow-600 text-lg shrink-0" />
                          <div>
                            <span className="text-xs font-bold block">Top Rated Merchant</span>
                            <span className="text-[10px] text-yellow-700/80 font-semibold">Consistently high ratings from customers</span>
                          </div>
                        </div>
                      )}

                      {(storeStats?.ordersCompleted || 0) >= 100 && (
                        <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-100 rounded-xl text-blue-900">
                          <FiCheckCircle className="text-blue-600 text-lg shrink-0" />
                          <div>
                            <span className="text-xs font-bold block">Trusted Store</span>
                            <span className="text-[10px] text-blue-700/80 font-semibold">Over {storeStats?.ordersCompleted} successful shipments</span>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-3 p-3 bg-slate-50 border rounded-xl text-slate-800">
                        <FiCheckCircle className="text-purple-600 text-lg shrink-0" />
                        <div>
                          <span className="text-xs font-bold block">Secure Payments</span>
                          <span className="text-[10px] text-slate-500 font-semibold">Safe checkout guaranteed</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 p-3 bg-slate-50 border rounded-xl text-slate-800">
                        <FiCheckCircle className="text-purple-600 text-lg shrink-0" />
                        <div>
                          <span className="text-xs font-bold block">Fast Delivery</span>
                          <span className="text-[10px] text-slate-500 font-semibold">Quick updates on every dispatch</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Store Statistics */}
                  <div className="bg-white border rounded-2xl p-6 shadow-sm space-y-4">
                    <h3 className="text-base font-black text-slate-800 border-b pb-2.5">Store Statistics</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                      <div className="bg-slate-50 p-4 rounded-xl">
                        <span className="text-2xl font-black text-purple-750 block">{storeStats?.productsCount || 0}</span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mt-0.5">Products</span>
                      </div>
                      <div className="bg-slate-50 p-4 rounded-xl">
                        <span className="text-2xl font-black text-purple-750 block">{storeStats?.ordersCompleted || 15}</span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mt-0.5">Orders Completed</span>
                      </div>
                      <div className="bg-slate-50 p-4 rounded-xl">
                        <span className="text-2xl font-black text-purple-750 block">★ {storeStats?.rating || store.rating || 4.8}</span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mt-0.5">Average Rating</span>
                      </div>
                      <div className="bg-slate-50 p-4 rounded-xl">
                        <span className="text-2xl font-black text-purple-750 block">{storeStats?.yearsInBusiness || 1}</span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mt-0.5">Years Active</span>
                      </div>
                    </div>
                  </div>

                  {/* Interactive Contact Form (Merged at the Bottom of About) */}
                  <div className="bg-white border rounded-2xl p-6 shadow-sm space-y-4">
                    <h3 className="text-base font-black text-slate-800 border-b pb-2.5">Need Help? Contact Form</h3>
                    
                    {contactSubmitted ? (
                      <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-6 rounded-2xl space-y-3 text-center">
                        <FiCheckCircle className="text-emerald-600 text-4xl mx-auto" />
                        <h4 className="font-bold text-sm">Message Sent Successfully!</h4>
                        <p className="text-xs text-emerald-600 leading-relaxed max-w-sm mx-auto">
                          Thank you for contacting us. We have received your inquiry and will respond within {store.businessInfo?.responseTime || "24 hours"}.
                        </p>
                        <button
                          onClick={() => setContactSubmitted(false)}
                          className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow transition-all"
                        >
                          Send Another Message
                        </button>
                      </div>
                    ) : (
                      <form onSubmit={handleContactSubmit} className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase block">Your Name</label>
                            <input
                              type="text"
                              required
                              value={contactName}
                              onChange={e => setContactName(e.target.value)}
                              className="w-full px-4 py-2 border rounded-xl text-xs bg-slate-50/50 focus:outline-none focus:ring-1 focus:ring-purple-650"
                              placeholder="e.g. Jane Doe"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase block">Email Address</label>
                            <input
                              type="email"
                              required
                              value={contactEmail}
                              onChange={e => setContactEmail(e.target.value)}
                              className="w-full px-4 py-2 border rounded-xl text-xs bg-slate-50/50 focus:outline-none focus:ring-1 focus:ring-purple-650"
                              placeholder="e.g. jane@example.com"
                            />
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-400 uppercase block">Your Message</label>
                          <textarea
                            required
                            rows={4}
                            value={contactMessage}
                            onChange={e => setContactMessage(e.target.value)}
                            className="w-full px-4 py-2 border rounded-xl text-xs bg-slate-50/50 focus:outline-none focus:ring-1 focus:ring-purple-650"
                            placeholder="Write your message details here..."
                          />
                        </div>

                        <button
                          type="submit"
                          disabled={contactSubmitting}
                          className="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow transition-all active:scale-95 cursor-pointer"
                        >
                          {contactSubmitting ? "Sending..." : "Submit Message"}
                        </button>
                      </form>
                    )}
                  </div>
                </div>

                {/* Right Column (Contact Info, Social Links, Maps Link) */}
                <div className="space-y-6">
                  
                  {/* Actionable contact details */}
                  <div className="bg-white border rounded-2xl p-6 shadow-sm space-y-4">
                    <h3 className="text-base font-black text-slate-800 border-b pb-2.5">Contact Us</h3>
                    
                    <div className="space-y-3">
                      {store.contact?.phone && (
                        <a 
                          href={`tel:${store.contact.phone}`}
                          className="flex items-center gap-3 p-3 bg-purple-50 hover:bg-purple-100/70 border rounded-xl text-purple-900 transition-all active:scale-98"
                        >
                          <FiPhone className="text-purple-600 text-lg shrink-0" />
                          <div>
                            <span className="text-[9px] font-black text-slate-400 uppercase block">Phone Number</span>
                            <span className="text-xs font-black">📞 Call {store.contact.phone}</span>
                          </div>
                        </a>
                      )}

                      {store.contact?.whatsapp && (
                        <a 
                          href={`https://wa.me/${store.contact.whatsapp.replace(/\D/g, "")}`} 
                          target="_blank" 
                          rel="noreferrer"
                          className="flex items-center gap-3 p-3 bg-emerald-50 hover:bg-emerald-100/70 border rounded-xl text-emerald-900 transition-all active:scale-98"
                        >
                          <FaWhatsapp className="text-emerald-500 text-xl shrink-0" />
                          <div>
                            <span className="text-[9px] font-black text-slate-400 uppercase block">WhatsApp Messenger</span>
                            <span className="text-xs font-black">💬 Chat Live</span>
                          </div>
                        </a>
                      )}

                      {store.contact?.email && (
                        <a 
                          href={`mailto:${store.contact.email}`}
                          className="flex items-center gap-3 p-3 bg-blue-50 hover:bg-blue-100/70 border rounded-xl text-blue-900 transition-all active:scale-98"
                        >
                          <FiMail className="text-blue-600 text-lg shrink-0" />
                          <div>
                            <span className="text-[9px] font-black text-slate-400 uppercase block">Email Address</span>
                            <span className="text-xs font-black">📧 Email Us</span>
                          </div>
                        </a>
                      )}

                      {store.contact?.address && (
                        <a 
                          href={store.contact.mapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(store.contact.address)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-3 p-3 bg-slate-50 hover:bg-slate-100 border rounded-xl text-slate-900 transition-all active:scale-98"
                        >
                          <FiMapPin className="text-slate-650 text-lg shrink-0" />
                          <div>
                            <span className="text-[9px] font-black text-slate-400 uppercase block">Location Map</span>
                            <span className="text-xs font-black">📍 Open in Maps</span>
                          </div>
                        </a>
                      )}
                    </div>

                    <div className="pt-2 divide-y text-xs font-semibold text-slate-650 space-y-2">
                      {store.contact?.businessHours && (
                        <div className="pt-2">
                          <span className="text-[9px] font-black text-slate-400 uppercase block">Working Hours</span>
                          <span className="whitespace-pre-line text-slate-600 mt-0.5 block leading-relaxed">{store.contact.businessHours}</span>
                        </div>
                      )}
                      {store.businessInfo?.responseTime && (
                        <div className="pt-2">
                          <span className="text-[9px] font-black text-slate-400 uppercase block">Response Time</span>
                          <span className="text-slate-600 mt-0.5 block">{store.businessInfo.responseTime}</span>
                        </div>
                      )}
                      {store.contact?.address && (
                        <div className="pt-2">
                          <span className="text-[9px] font-black text-slate-400 uppercase block">Full Address</span>
                          <span className="whitespace-pre-line text-slate-600 mt-0.5 block leading-relaxed">{store.contact.address}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Social media connections */}
                  {store.socialLinks && Object.values(store.socialLinks).some(Boolean) && (
                    <div className="bg-white border rounded-2xl p-6 shadow-sm space-y-4">
                      <h3 className="text-base font-black text-slate-800 border-b pb-2.5">Social Connections</h3>
                      <div className="flex flex-wrap gap-2">
                        {store.socialLinks.website && (
                          <a 
                            href={store.socialLinks.website} 
                            target="_blank" 
                            rel="noreferrer"
                            className="px-3 py-2 bg-slate-100 hover:bg-purple-50 text-slate-700 hover:text-purple-750 border rounded-xl flex items-center justify-center text-xs font-bold transition-all"
                          >
                            🌐 Website
                          </a>
                        )}
                        {store.socialLinks.facebook && (
                          <a 
                            href={store.socialLinks.facebook} 
                            target="_blank" 
                            rel="noreferrer"
                            className="w-10 h-10 bg-slate-100 hover:bg-purple-50 text-slate-700 hover:text-purple-750 border rounded-xl flex items-center justify-center transition-all"
                          >
                            <FaFacebookF />
                          </a>
                        )}
                        {store.socialLinks.instagram && (
                          <a 
                            href={store.socialLinks.instagram} 
                            target="_blank" 
                            rel="noreferrer"
                            className="w-10 h-10 bg-slate-100 hover:bg-purple-50 text-slate-700 hover:text-purple-750 border rounded-xl flex items-center justify-center transition-all"
                          >
                            <FaInstagram />
                          </a>
                        )}
                        {store.socialLinks.twitter && (
                          <a 
                            href={store.socialLinks.twitter} 
                            target="_blank" 
                            rel="noreferrer"
                            className="w-10 h-10 bg-slate-100 hover:bg-purple-50 text-slate-700 hover:text-purple-750 border rounded-xl flex items-center justify-center transition-all"
                          >
                            <FaTwitter />
                          </a>
                        )}
                        {store.socialLinks.youtube && (
                          <a 
                            href={store.socialLinks.youtube} 
                            target="_blank" 
                            rel="noreferrer"
                            className="w-10 h-10 bg-slate-100 hover:bg-purple-50 text-slate-700 hover:text-purple-750 border rounded-xl flex items-center justify-center transition-all"
                          >
                            <FaYoutube />
                          </a>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Explore CTA */}
                  <div className="pt-2">
                    <Link
                      to={`/store/${slug}`}
                      className="w-full py-3.5 bg-gradient-to-tr from-purple-700 to-purple-650 hover:from-purple-800 hover:to-purple-700 text-white font-black text-xs rounded-2xl shadow-lg flex items-center justify-center gap-1.5 transition-all hover:-translate-y-0.5 active:translate-y-0 uppercase tracking-widest cursor-pointer"
                    >
                      🛍 Explore Our Products &rarr;
                    </Link>
                  </div>

                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </MobileLayout>
  );
};

export default Storefront;
