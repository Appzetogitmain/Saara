import { useState, useMemo, useEffect, useRef } from "react";
import { FiArrowLeft, FiFilter, FiGrid, FiX, FiSearch } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import MobileLayout from "../components/Layout/MobileLayout";
import ProductCard from "../../../shared/components/ProductCard";
import ProductListItem from "../components/Mobile/ProductListItem";
import { categories as fallbackCategories } from "../../../data/categories";
import PageTransition from "../../../shared/components/PageTransition";
import useInfiniteScroll from "../../../shared/hooks/useInfiniteScroll";
import api from "../../../shared/utils/api";
import { useCategoryStore } from "../../../shared/store/categoryStore";

const normalizeProduct = (raw) => {
  const categoryObj =
    raw?.categoryId && typeof raw.categoryId === "object" ? raw.categoryId : null;

  return {
    ...raw,
    id: raw?._id || raw?.id,
    categoryId: String(categoryObj?._id || raw?.categoryId || ""),
    image: raw?.image || raw?.images?.[0] || "",
    images: Array.isArray(raw?.images) ? raw.images : [],
    price: Number(raw?.price) || 0,
    originalPrice:
      raw?.originalPrice !== undefined ? Number(raw.originalPrice) : undefined,
    rating: Number(raw?.rating) || 0,
  };
};

const MobileDailyDeals = () => {
  const navigate = useNavigate();
  const { categories: storeCategories, initialize: initializeCategories } = useCategoryStore();
  const [allDeals, setAllDeals] = useState([]);
  const PRICE_MAX = 50000;
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState("grid");
  const [filters, setFilters] = useState({
    category: "",
    minPrice: "",
    maxPrice: "",
    minRating: "",
  });

  useEffect(() => {
    initializeCategories();
  }, [initializeCategories]);

  const categories = useMemo(() => {
    const activeStoreCategories = storeCategories.filter((cat) => cat.isActive !== false);
    if (activeStoreCategories.length) {
      return activeStoreCategories;
    }
    return fallbackCategories;
  }, [storeCategories]);

  useEffect(() => {
    let cancelled = false;

    const loadDeals = async () => {
      try {
        const campaignList = await api.get("/campaigns", {
          params: { type: "daily_deal", limit: 20 },
        });
        const campaignsPayload = campaignList?.data ?? campaignList;
        const slugs = Array.isArray(campaignsPayload)
          ? campaignsPayload
            .map((c) => String(c?.slug || "").trim())
            .filter(Boolean)
          : [];

        if (!slugs.length) {
          if (!cancelled) setAllDeals([]);
          return;
        }

        const details = await Promise.allSettled(
          [...new Set(slugs)].map((slug) => api.get(`/campaigns/${slug}`))
        );

        const map = new Map();
        details
          .filter((result) => result.status === "fulfilled")
          .forEach((result) => {
            const payload = result.value?.data ?? result.value;
            const products = Array.isArray(payload?.products) ? payload.products : [];
            products.forEach((product) => {
              const normalized = normalizeProduct(product);
              if (!normalized.id) return;
              if (!map.has(normalized.id)) map.set(normalized.id, normalized);
            });
          });

        if (!cancelled) setAllDeals(Array.from(map.values()));
      } catch {
        if (!cancelled) setAllDeals([]);
      }
    };

    loadDeals();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredProducts = useMemo(() => {
    let result = allDeals;

    if (filters.category) {
      result = result.filter(
        (product) => String(product.categoryId || "") === String(filters.category)
      );
    }
    if (searchQuery) {
      result = result.filter((product) =>
        String(product.name || "").toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    if (filters.minPrice) {
      result = result.filter((product) => product.price >= parseFloat(filters.minPrice));
    }
    if (filters.maxPrice) {
      result = result.filter((product) => product.price <= parseFloat(filters.maxPrice));
    }
    if (filters.minRating) {
      result = result.filter(
        (product) => product.rating >= parseFloat(filters.minRating)
      );
    }

    return result;
  }, [allDeals, filters, searchQuery]);

  const { displayedItems, hasMore, isLoading, loadMore, loadMoreRef } = useInfiniteScroll(
    filteredProducts,
    10,
    10
  );

  const filterButtonRef = useRef(null);

  const handleFilterChange = (name, value) => {
    setFilters({ ...filters, [name]: value });
  };

  const clearFilters = () => {
    setFilters({ category: "", minPrice: "", maxPrice: "", minRating: "" });
    setSearchQuery("");
  };

  const hasActiveFilters =
    filters.minPrice || filters.maxPrice || filters.minRating || filters.category;

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        showFilters &&
        filterButtonRef.current &&
        !filterButtonRef.current.contains(event.target) &&
        !event.target.closest(".filter-dropdown")
      ) {
        setShowFilters(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [showFilters]);

  return (
    <PageTransition>
      <MobileLayout showBottomNav={true} showCartBar={true}>
        <div className="w-full pb-24">
          <div className="px-4 py-4 bg-white border-b border-gray-200 sticky top-0 z-30">
            <div className="flex items-center gap-3 mb-3">
              <button
                onClick={() => navigate(-1)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <FiArrowLeft className="text-xl text-gray-700" />
              </button>
              <div className="flex-1">
                <h1 className="text-xl font-bold text-gray-800">Daily Deals</h1>
                <div className="relative mt-1">
                  <FiSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs" />
                  <input
                    type="text"
                    placeholder="Search in deals..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-10 py-1.5 bg-gray-100 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 p-1 hover:bg-gray-200 rounded-full transition-colors"
                    >
                      <FiX className="text-xs" />
                    </button>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <div className="flex items-center bg-gray-100 rounded-lg p-1">
                  <button
                    onClick={() => setViewMode("grid")}
                    className={`p-1 rounded transition-colors ${viewMode === "grid" ? "bg-white text-primary-600 shadow-sm" : "text-gray-600"
                      }`}
                  >
                    <FiGrid className="text-sm" />
                  </button>
                </div>
                <div ref={filterButtonRef} className="relative">
                  <button
                    onClick={() => setShowFilters(!showFilters)}
                    className={`p-1.5 glass-card rounded-lg hover:bg-white/80 transition-colors ${showFilters ? "bg-white/80" : ""}`}
                  >
                    <FiFilter className={`text-sm transition-colors ${hasActiveFilters ? "text-blue-600" : "text-gray-600"}`} />
                  </button>
                  <AnimatePresence>
                    {showFilters && (
                      <>
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          onClick={() => setShowFilters(false)}
                          className="fixed inset-0 bg-black/20 z-[10000]"
                        />
                        <motion.div
                          initial={{ opacity: 0, y: -10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -10, scale: 0.95 }}
                          transition={{ type: "spring", stiffness: 300, damping: 30 }}
                          className="filter-dropdown absolute right-0 top-full w-56 bg-white rounded-xl shadow-2xl border border-gray-200 z-[10001] overflow-hidden"
                          style={{ marginTop: "-50px" }}
                        >
                          <div className="flex items-center justify-between px-2 py-1.5 border-b border-gray-200 bg-gray-50">
                            <h3 className="text-sm font-bold text-gray-800">Filters</h3>
                            <button onClick={() => setShowFilters(false)} className="p-0.5 hover:bg-gray-200 rounded-full">
                              <FiX className="text-sm text-gray-600" />
                            </button>
                          </div>
                          <div className="max-h-[50vh] overflow-y-auto scrollbar-hide p-2 space-y-2">
                            <div>
                              <h4 className="font-semibold text-gray-700 mb-1 text-xs">Category</h4>
                              <select
                                value={filters.category}
                                onChange={(e) => handleFilterChange("category", e.target.value)}
                                className="w-full px-2 py-1.5 rounded-md border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-primary-500 text-xs"
                              >
                                <option value="">All Categories</option>
                                {categories.map((cat) => (
                                  <option key={cat.id} value={String(cat.id)}>
                                    {cat.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <h4 className="font-semibold text-gray-700 mb-2 text-xs">Price Range</h4>
                              <div className="px-1">
                                <div className="flex justify-between text-[10px] font-semibold text-primary-600 mb-1">
                                  <span>₹{filters.minPrice || 0}</span>
                                  <span>₹{filters.maxPrice || PRICE_MAX}</span>
                                </div>
                                <div className="relative h-5 flex items-center">
                                  <div className="absolute w-full h-1.5 rounded-full bg-gray-200" />
                                  <div
                                    className="absolute h-1.5 rounded-full bg-primary-500"
                                    style={{
                                      left: `${((Number(filters.minPrice) || 0) / PRICE_MAX) * 100}%`,
                                      right: `${100 - ((Number(filters.maxPrice) || PRICE_MAX) / PRICE_MAX) * 100}%`,
                                    }}
                                  />
                                  <input
                                    type="range"
                                    min={0}
                                    max={PRICE_MAX}
                                    step={100}
                                    value={Number(filters.minPrice) || 0}
                                    onChange={(e) => {
                                      const val = Number(e.target.value);
                                      const max = Number(filters.maxPrice) || PRICE_MAX;
                                      handleFilterChange("minPrice", val < max ? String(val) : String(max - 100));
                                    }}
                                    className="absolute w-full h-1.5 appearance-none bg-transparent cursor-pointer range-thumb"
                                    style={{ zIndex: (Number(filters.minPrice) || 0) > PRICE_MAX - 1000 ? 5 : 3 }}
                                  />
                                  <input
                                    type="range"
                                    min={0}
                                    max={PRICE_MAX}
                                    step={100}
                                    value={Number(filters.maxPrice) || PRICE_MAX}
                                    onChange={(e) => {
                                      const val = Number(e.target.value);
                                      const min = Number(filters.minPrice) || 0;
                                      handleFilterChange("maxPrice", val > min ? String(val) : String(min + 100));
                                    }}
                                    className="absolute w-full h-1.5 appearance-none bg-transparent cursor-pointer range-thumb"
                                    style={{ zIndex: 4 }}
                                  />
                                </div>
                                <div className="flex justify-between text-[9px] text-gray-400 mt-1">
                                  <span>₹0</span>
                                  <span>₹{(PRICE_MAX / 2).toLocaleString()}</span>
                                  <span>₹{PRICE_MAX.toLocaleString()}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="border-t border-gray-200 p-2 bg-gray-50 space-y-1.5">
                            <button onClick={clearFilters} className="w-full py-1.5 bg-gray-200 text-gray-700 rounded-md font-semibold text-xs hover:bg-gray-300">Clear All</button>
                            <button onClick={() => setShowFilters(false)} className="w-full py-1.5 gradient-green text-white rounded-md font-semibold text-xs">Apply Filters</button>
                          </div>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </div>

          <div className="px-4 py-4">
            {filteredProducts.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-6xl text-gray-300 mx-auto mb-4">[ ]</div>
                <h3 className="text-xl font-bold text-gray-800 mb-2">No deals found</h3>
                <p className="text-gray-600">Check back later for new deals.</p>
              </div>
            ) : viewMode === "grid" ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6">
                  {displayedItems.map((product, index) => (
                    <motion.div key={product.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }}>
                      <ProductCard product={product} isFlashSale={true} />
                    </motion.div>
                  ))}
                </div>
                {hasMore && (
                  <div ref={loadMoreRef} className="mt-6 flex flex-col items-center gap-4">
                    <button onClick={loadMore} disabled={isLoading} className="px-6 py-3 gradient-green text-white rounded-xl font-semibold disabled:opacity-50">
                      {isLoading ? "Loading..." : "Load More"}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="space-y-3">
                  {displayedItems.map((product, index) => (
                    <ProductListItem key={product.id} product={product} index={index} isFlashSale={true} />
                  ))}
                </div>
                {hasMore && (
                  <div ref={loadMoreRef} className="mt-6 flex flex-col items-center gap-4">
                    <button onClick={loadMore} disabled={isLoading} className="px-6 py-3 gradient-green text-white rounded-xl font-semibold disabled:opacity-50">
                      {isLoading ? "Loading..." : "Load More"}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </MobileLayout>
    </PageTransition>
  );
};

export default MobileDailyDeals;
