import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  FiArrowLeft,
  FiFilter,
  FiGrid,
  FiX,
  FiTag,
  FiSearch,
} from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import MobileLayout from "../components/Layout/MobileLayout";
import ProductCard from "../../../shared/components/ProductCard";
import ProductListItem from "../components/Mobile/ProductListItem";
import PageTransition from "../../../shared/components/PageTransition";
import api from "../../../shared/utils/api";

const normalizeProduct = (raw) => ({
  ...raw,
  id: String(raw?.id || raw?._id || ""),
  _id: String(raw?.id || raw?._id || ""),
  vendorId: String(raw?.vendorId?._id || raw?.vendorId || ""),
  brandId: String(raw?.brandId?._id || raw?.brandId || ""),
  image: raw?.image || raw?.images?.[0] || "",
  images: Array.isArray(raw?.images)
    ? raw.images
    : raw?.image
      ? [raw.image]
      : [],
  price: Number(raw?.price) || 0,
  rating: Number(raw?.rating) || 0,
  reviewCount: Number(raw?.reviewCount) || 0,
});

const MobileNewArrivals = () => {
  const navigate = useNavigate();
  const PRICE_MAX = 50000;
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState("grid");
  const [sortBy, setSortBy] = useState("newest");
  const [filters, setFilters] = useState({
    minPrice: "",
    maxPrice: "",
    minRating: "",
  });
  const [products, setProducts] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  const filterButtonRef = useRef(null);

  const hasActiveFilters =
    Boolean(filters.minPrice) ||
    Boolean(filters.maxPrice) ||
    Boolean(filters.minRating) ||
    sortBy !== "newest";

  const handleFilterChange = (name, value) => {
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const clearFilters = () => {
    setFilters({
      minPrice: "",
      maxPrice: "",
      minRating: "",
    });
    setSearchQuery("");
    setSortBy("newest");
  };

  const fetchNewArrivals = useCallback(
    async ({ nextPage = 1, append = false } = {}) => {
      setIsLoading(true);
      try {
        const response = await api.get("/new-arrivals", {
          params: {
            page: nextPage,
            limit: 20,
            sort: sortBy,
            ...(searchQuery.trim() ? { search: searchQuery.trim() } : {}),
            ...(filters.minPrice ? { minPrice: Number(filters.minPrice) } : {}),
            ...(filters.maxPrice ? { maxPrice: Number(filters.maxPrice) } : {}),
            ...(filters.minRating ? { minRating: Number(filters.minRating) } : {}),
          },
        });

        const payload = response?.data ?? response;
        const list = Array.isArray(payload?.products)
          ? payload.products.map(normalizeProduct).filter((p) => p.id)
          : [];

        setProducts((prev) => (append ? [...prev, ...list] : list));
        setPage(Number(payload?.page || nextPage));
        setHasMore(Number(payload?.page || nextPage) < Number(payload?.pages || 1));
      } catch {
        if (!append) {
          setProducts([]);
          setPage(1);
          setHasMore(false);
        }
      } finally {
        setIsLoading(false);
        setIsInitialLoading(false);
      }
    },
    [filters.maxPrice, filters.minPrice, filters.minRating, searchQuery, sortBy]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchNewArrivals({ nextPage: 1, append: false });
    }, 250);
    return () => clearTimeout(timer);
  }, [fetchNewArrivals]);

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

  const filteredCountText = useMemo(() => {
    if (isInitialLoading) return "Loading items...";
    return `${products.length} new items`;
  }, [isInitialLoading, products.length]);

  const handleLoadMore = () => {
    if (isLoading || !hasMore) return;
    fetchNewArrivals({ nextPage: page + 1, append: true });
  };

  return (
    <PageTransition>
      <MobileLayout showBottomNav={true} showCartBar={true}>
        <div className="w-full pb-24">
          <div className="px-4 py-4 bg-gradient-to-r from-cyan-50 to-blue-50 border-b border-gray-200 sticky top-1 z-30">
            <div className="flex items-center gap-3 mb-3">
              <button
                onClick={() => navigate(-1)}
                className="p-2 hover:bg-white/50 rounded-full transition-colors"
              >
                <FiArrowLeft className="text-xl text-gray-700" />
              </button>
              <div className="flex-1">
                <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                  <span>New Arrivals</span>
                  <FiTag className="text-cyan-500" />
                </h1>
                <p className="text-[10px] text-gray-500 mt-0.5">{filteredCountText}</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-gray-100 rounded-lg p-1">
                  <button
                    onClick={() => setViewMode("grid")}
                    className={`p-1 rounded transition-colors ${
                      viewMode === "grid"
                        ? "bg-white text-primary-600 shadow-sm"
                        : "text-gray-600"
                    }`}
                  >
                    <FiGrid className="text-sm" />
                  </button>
                </div>
                <div ref={filterButtonRef} className="relative">
                  <button
                    onClick={() => setShowFilters(!showFilters)}
                    className={`p-1.5 glass-card rounded-lg hover:bg-white/80 transition-colors ${
                      showFilters ? "bg-white/80" : ""
                    }`}
                  >
                    <FiFilter
                      className={`text-sm transition-colors ${
                        hasActiveFilters ? "text-blue-600" : "text-gray-600"
                      }`}
                    />
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
                            <div className="flex items-center gap-1.5">
                              <FiFilter className="text-sm text-gray-700" />
                              <h3 className="text-sm font-bold text-gray-800">Filters</h3>
                            </div>
                            <button
                              onClick={() => setShowFilters(false)}
                              className="p-0.5 hover:bg-gray-200 rounded-full transition-colors"
                            >
                              <FiX className="text-sm text-gray-600" />
                            </button>
                          </div>

                          <div className="max-h-[50vh] overflow-y-auto scrollbar-hide">
                            <div className="p-2 space-y-2">
                              <div>
                                <h4 className="font-semibold text-gray-700 mb-1 text-xs">Sort By</h4>
                                <select
                                  value={sortBy}
                                  onChange={(e) => setSortBy(e.target.value)}
                                  className="w-full px-2 py-1.5 rounded-md border border-gray-200 bg-white focus:outline-none focus:ring-1 focus:ring-primary-500 text-xs"
                                >
                                  <option value="newest">Newest</option>
                                  <option value="popular">Most Popular</option>
                                  <option value="rating">Top Rated</option>
                                  <option value="price-asc">Price: Low to High</option>
                                  <option value="price-desc">Price: High to Low</option>
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

                              <div>
                                <h4 className="font-semibold text-gray-700 mb-1 text-xs">Minimum Rating</h4>
                                <div className="space-y-0.5">
                                  {[4, 3, 2, 1].map((rating) => (
                                    <label
                                      key={rating}
                                      className="flex items-center gap-1.5 cursor-pointer p-1 rounded-md hover:bg-gray-50 transition-colors"
                                    >
                                      <input
                                        type="radio"
                                        name="minRating"
                                        value={rating}
                                        checked={filters.minRating === rating.toString()}
                                        onChange={(e) => handleFilterChange("minRating", e.target.value)}
                                        className="w-3 h-3 appearance-none rounded-full border-2 border-gray-300 bg-white checked:bg-white checked:border-primary-500 relative cursor-pointer"
                                        style={{
                                          backgroundImage:
                                            filters.minRating === rating.toString()
                                              ? "radial-gradient(circle, #10b981 40%, transparent 40%)"
                                              : "none",
                                        }}
                                      />
                                      <span className="text-xs text-gray-700">{rating}+ Stars</span>
                                    </label>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="border-t border-gray-200 p-2 bg-gray-50 space-y-1.5">
                            <button
                              onClick={clearFilters}
                              className="w-full py-1.5 bg-gray-200 text-gray-700 rounded-md font-semibold text-xs hover:bg-gray-300 transition-colors"
                            >
                              Clear All
                            </button>
                            <button
                              onClick={() => setShowFilters(false)}
                              className="w-full py-1.5 gradient-green text-white rounded-md font-semibold text-xs hover:shadow-glow-green transition-all"
                            >
                              Apply Filters
                            </button>
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
            {isInitialLoading ? (
              <div className="text-center py-12 text-gray-600">Loading new arrivals...</div>
            ) : products.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-6xl text-gray-300 mx-auto mb-4 flex justify-center">
                  <FiTag />
                </div>
                <h3 className="text-xl font-bold text-gray-800 mb-2">No new arrivals</h3>
                <p className="text-gray-600">Check back later for fresh products.</p>
              </div>
            ) : viewMode === "grid" ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-5 gap-3 md:gap-6">
                  {products.map((product, index) => (
                    <motion.div
                      key={product.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.03 }}
                    >
                      <ProductCard product={product} />
                    </motion.div>
                  ))}
                </div>

                {hasMore && (
                  <div className="mt-6 flex flex-col items-center gap-4">
                    {isLoading && (
                      <div className="flex items-center gap-2 text-gray-600">
                        <span className="text-sm">Loading more products...</span>
                      </div>
                    )}
                    <button
                      onClick={handleLoadMore}
                      disabled={isLoading}
                      className="px-6 py-3 gradient-green text-white rounded-xl font-semibold hover:shadow-glow-green transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isLoading ? "Loading..." : "Load More"}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="space-y-3">
                  {products.map((product, index) => (
                    <ProductListItem key={product.id} product={product} index={index} />
                  ))}
                </div>

                {hasMore && (
                  <div className="mt-6 flex flex-col items-center gap-4">
                    {isLoading && (
                      <div className="flex items-center gap-2 text-gray-600">
                        <span className="text-sm">Loading more products...</span>
                      </div>
                    )}
                    <button
                      onClick={handleLoadMore}
                      disabled={isLoading}
                      className="px-6 py-3 gradient-green text-white rounded-xl font-semibold hover:shadow-glow-green transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
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

export default MobileNewArrivals;
