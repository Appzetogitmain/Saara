import { useState, useMemo, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { FiFilter, FiArrowLeft, FiGrid, FiX, FiSearch } from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";
import MobileLayout from "../components/Layout/MobileLayout";
import ProductCard from "../../../shared/components/ProductCard";
import ProductListItem from "../components/Mobile/ProductListItem";
import { getCatalogProducts } from "../data/catalogData";
import { categories as fallbackCategories } from "../../../data/categories";
import { useCategoryStore } from "../../../shared/store/categoryStore";
import PageTransition from "../../../shared/components/PageTransition";
import useInfiniteScroll from "../../../shared/hooks/useInfiniteScroll";
import LazyImage from "../../../shared/components/LazyImage";
import { getPlaceholderImage } from "../../../shared/utils/helpers";
import api from "../../../shared/utils/api";
import AnimatedBanner from "../components/Mobile/AnimatedBanner";

const normalizeId = (value) => String(value ?? "").trim();

const getParentId = (category) => {
  const parent = category?.parentId;
  if (!parent) return null;
  if (typeof parent === "object") {
    return normalizeId(parent?._id ?? parent?.id ?? "");
  }
  return normalizeId(parent);
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

  return {
    ...raw,
    id,
    _id: id,
    vendorId: normalizeId(vendorObj?._id || vendorObj?.id || raw?.vendorId),
    vendorName: raw?.vendorName || vendorObj?.storeName || vendorObj?.name || "",
    brandId: normalizeId(brandObj?._id || brandObj?.id || raw?.brandId),
    brandName: raw?.brandName || brandObj?.name || "",
    categoryId: normalizeId(categoryObj?._id || categoryObj?.id || raw?.categoryId),
    categoryName: raw?.categoryName || categoryObj?.name || "",
    image: raw?.image || raw?.images?.[0] || "",
    images: Array.isArray(raw?.images)
      ? raw.images
      : raw?.image
        ? [raw.image]
        : [],
    price: Number(raw?.price) || 0,
    rating: Number(raw?.rating) || 0,
  };
};

const MobileCategory = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const categoryId = normalizeId(id);
  const { categories, initialize, getCategoryById } = useCategoryStore();

  // Initialize store on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Get category from store or fallback
  const category = useMemo(() => {
    const cat = getCategoryById(categoryId);
    return (
      cat ||
      fallbackCategories.find((fallbackCat) => {
        const fallbackId = normalizeId(fallbackCat.id);
        return (
          fallbackId === categoryId ||
          fallbackCat.name?.toLowerCase() === categoryId.toLowerCase()
        );
      })
    );
  }, [categoryId, categories, getCategoryById]);

  const PRICE_MAX = 50000;
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState("grid"); // 'grid' or 'list'
  const [categoryProductsFeed, setCategoryProductsFeed] = useState([]);
  const [filters, setFilters] = useState({
    minPrice: "",
    maxPrice: "",
    minRating: "",
  });

  useEffect(() => {
    let cancelled = false;

    const fetchCategoryProducts = async () => {
      if (!categoryId) {
        if (!cancelled) {
          setCategoryProductsFeed([]);
        }
        return;
      }

      try {
        const response = await api.get("/products", {
          params: {
            category: categoryId,
            page: 1,
            limit: 200,
            sort: "newest",
          },
        });
        const payload = response?.data ?? response;
        const products = Array.isArray(payload?.products) ? payload.products : [];
        if (cancelled) return;

        setCategoryProductsFeed(
          products.map(normalizeProduct).filter((product) => product.id)
        );
      } catch {
        if (cancelled) return;
        const fallback = getCatalogProducts().filter((product) => {
          const productCategoryId = normalizeId(product.categoryId);
          const productCategory = categories.find(
            (cat) => normalizeId(cat.id) === productCategoryId
          );
          const productParentId = getParentId(productCategory);
          return productCategoryId === categoryId || productParentId === categoryId;
        });
        setCategoryProductsFeed(fallback);
      }
    };

    fetchCategoryProducts();
    return () => {
      cancelled = true;
    };
  }, [categoryId, categories]);

  const rootCategories = useMemo(() => {
    const roots = categories.filter(
      (cat) => !getParentId(cat) && cat.isActive !== false
    );
    if (roots.length) return roots;
    return fallbackCategories;
  }, [categories]);

  const categoryProducts = useMemo(() => {
    if (!category) return [];
    let result = [...categoryProductsFeed];

    if (searchQuery) {
      result = result.filter((product) =>
        product.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (filters.minPrice) {
      result = result.filter(
        (product) => product.price >= parseFloat(filters.minPrice)
      );
    }
    if (filters.maxPrice) {
      result = result.filter(
        (product) => product.price <= parseFloat(filters.maxPrice)
      );
    }
    if (filters.minRating) {
      result = result.filter(
        (product) => product.rating >= parseFloat(filters.minRating)
      );
    }

    return result;
  }, [category, categoryProductsFeed, filters, searchQuery]);

  const { displayedItems, hasMore, isLoading, loadMore, loadMoreRef } =
    useInfiniteScroll(categoryProducts, 10, 10);

  const filterButtonRef = useRef(null);

  const handleFilterChange = (name, value) => {
    setFilters({ ...filters, [name]: value });
  };

  const clearFilters = () => {
    setFilters({
      minPrice: "",
      maxPrice: "",
      minRating: "",
    });
    setSearchQuery("");
  };

  // Check if any filter is active
  const hasActiveFilters =
    filters.minPrice ||
    filters.maxPrice ||
    filters.minRating;

  // Close filter dropdown when clicking outside
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

  if (!category) {
    return (
      <PageTransition>
        <MobileLayout showBottomNav={false} showCartBar={false}>
          <div className="flex items-center justify-center min-h-[60vh] px-4">
            <div className="text-center">
              <h2 className="text-xl font-bold text-gray-800 mb-4">
                Category Not Found
              </h2>
              <button
                onClick={() => navigate("/")}
                className="gradient-green text-white px-6 py-3 rounded-xl font-semibold">
                Go Back Home
              </button>
            </div>
          </div>
        </MobileLayout>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <MobileLayout showBottomNav={true} showCartBar={true}>
        <div className="w-full pb-24">
          {/* Header */}
          <div className="px-4 py-4 bg-white border-b border-gray-200">
            <div className="flex items-center gap-3 mb-4">
              <button
                onClick={() => navigate(-1)}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                <FiArrowLeft className="text-xl text-gray-700" />
              </button>
              <div className="w-12 h-12 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
                <LazyImage
                  src={category.image}
                  alt={category.name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.target.src = getPlaceholderImage(48, 48, "Category");
                  }}
                />
              </div>
              <div className="flex-1">
                <h1 className="text-xl font-bold text-gray-800">
                  {category.name}
                </h1>
                <div className="relative mt-1">
                  <FiSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs" />
                  <input
                    type="text"
                    placeholder="Search in category..."
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
                <p className="text-[10px] text-gray-500 mt-1">
                  {categoryProducts.length} product
                  {categoryProducts.length !== 1 ? "s" : ""} available
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                {/* View Toggle Buttons */}
                <div className="flex items-center bg-gray-100 rounded-lg p-1">
                  <button
                    onClick={() => setViewMode("grid")}
                    className={`p-1.5 rounded transition-colors ${viewMode === "grid"
                      ? "bg-white text-primary-600 shadow-sm"
                      : "text-gray-600"
                      }`}>
                    <FiGrid className="text-lg" />
                  </button>
                </div>
                <div ref={filterButtonRef} className="relative">
                  <button
                    onClick={() => setShowFilters(!showFilters)}
                    className={`p-2.5 glass-card rounded-xl hover:bg-white/80 transition-colors ${showFilters ? "bg-white/80" : ""
                      }`}>
                    <FiFilter
                      className={`text-lg transition-colors ${hasActiveFilters ? "text-blue-600" : "text-gray-600"
                        }`}
                    />
                  </button>

                  {/* Filter Dropdown */}
                  <AnimatePresence>
                    {showFilters && (
                      <>
                        {/* Backdrop */}
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
                          transition={{
                            type: "spring",
                            stiffness: 300,
                            damping: 30,
                          }}
                          className="filter-dropdown absolute right-0 top-full w-56 bg-white rounded-xl shadow-2xl border border-gray-200 z-[10001] overflow-hidden"
                          style={{ marginTop: "-50px" }}>
                          {/* Header */}
                          <div className="flex items-center justify-between px-2 py-1.5 border-b border-gray-200 bg-gray-50">
                            <div className="flex items-center gap-1.5">
                              <FiFilter className="text-sm text-gray-700" />
                              <h3 className="text-sm font-bold text-gray-800">
                                Filters
                              </h3>
                            </div>
                            <button
                              onClick={() => setShowFilters(false)}
                              className="p-0.5 hover:bg-gray-200 rounded-full transition-colors">
                              <FiX className="text-sm text-gray-600" />
                            </button>
                          </div>

                          {/* Filter Content */}
                          <div className="max-h-[50vh] overflow-y-auto scrollbar-hide">
                            <div className="p-2 space-y-2">
                              {/* Category Switcher - Image Based */}
                              <div>
                                <h4 className="font-semibold text-gray-700 mb-2 text-xs">
                                  Switch Category
                                </h4>
                                <div className="grid grid-cols-4 gap-2">
                                  {rootCategories.map((cat) => (
                                    <button
                                      key={cat.id}
                                      onClick={() => {
                                        const newId = normalizeId(cat.id);
                                        if (newId) navigate(`/category/${newId}`);
                                        setShowFilters(false);
                                      }}
                                      className={`flex flex-col items-center gap-1 p-1 rounded-lg border transition-all ${normalizeId(categoryId) === normalizeId(cat.id) ? "border-primary-500 bg-primary-50" : "border-gray-100 hover:bg-gray-50"}`}
                                    >
                                      <div className="w-8 h-8 rounded-full overflow-hidden border border-gray-100">
                                        <LazyImage
                                          src={cat.image}
                                          alt={cat.name}
                                          className="w-full h-full object-cover"
                                          placeholderWidth={32}
                                          placeholderHeight={32}
                                        />
                                      </div>
                                      <span className="text-[9px] text-gray-600 font-medium line-clamp-1">{cat.name}</span>
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Price Range */}
                              <div>
                                <h4 className="font-semibold text-gray-700 mb-2 text-xs">Price Range</h4>
                                <div className="px-1">
                                  {/* Min/Max labels */}
                                  <div className="flex justify-between text-[10px] font-semibold text-primary-600 mb-1">
                                    <span>₹{filters.minPrice || 0}</span>
                                    <span>₹{filters.maxPrice || PRICE_MAX}</span>
                                  </div>
                                  {/* Dual-range slider wrapper */}
                                  <div className="relative h-5 flex items-center">
                                    {/* Track background */}
                                    <div className="absolute w-full h-1.5 rounded-full bg-gray-200" />
                                    {/* Filled track */}
                                    <div
                                      className="absolute h-1.5 rounded-full bg-primary-500"
                                      style={{
                                        left: `${((Number(filters.minPrice) || 0) / PRICE_MAX) * 100}%`,
                                        right: `${100 - ((Number(filters.maxPrice) || PRICE_MAX) / PRICE_MAX) * 100}%`,
                                      }}
                                    />
                                    {/* Min thumb */}
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
                                    {/* Max thumb */}
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
                                  {/* Scale labels */}
                                  <div className="flex justify-between text-[9px] text-gray-400 mt-1">
                                    <span>₹0</span>
                                    <span>₹{(PRICE_MAX / 2).toLocaleString()}</span>
                                    <span>₹{PRICE_MAX.toLocaleString()}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Rating Filter */}
                              <div>
                                <h4 className="font-semibold text-gray-700 mb-1 text-xs">
                                  Minimum Rating
                                </h4>
                                <div className="space-y-0.5">
                                  {[4, 3, 2, 1].map((rating) => (
                                    <label
                                      key={rating}
                                      className="flex items-center gap-1.5 cursor-pointer p-1 rounded-md hover:bg-gray-50 transition-colors">
                                      <input
                                        type="radio"
                                        name="minRating"
                                        value={rating}
                                        checked={
                                          filters.minRating ===
                                          rating.toString()
                                        }
                                        onChange={(e) =>
                                          handleFilterChange(
                                            "minRating",
                                            e.target.value
                                          )
                                        }
                                        className="w-3 h-3 appearance-none rounded-full border-2 border-gray-300 bg-white checked:bg-white checked:border-primary-500 relative cursor-pointer"
                                        style={{
                                          backgroundImage:
                                            filters.minRating ===
                                              rating.toString()
                                              ? "radial-gradient(circle, #10b981 40%, transparent 40%)"
                                              : "none",
                                        }}
                                      />
                                      <span className="text-xs text-gray-700">
                                        {rating}+ Stars
                                      </span>
                                    </label>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Footer */}
                          <div className="border-t border-gray-200 p-2 bg-gray-50 space-y-1.5">
                            <button
                              onClick={clearFilters}
                              className="w-full py-1.5 bg-gray-200 text-gray-700 rounded-md font-semibold text-xs hover:bg-gray-300 transition-colors">
                              Clear All
                            </button>
                            <button
                              onClick={() => setShowFilters(false)}
                              className="w-full py-1.5 gradient-green text-white rounded-md font-semibold text-xs hover:shadow-glow-green transition-all">
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

          <AnimatedBanner />
          {/* Products List */}
          <div className="px-4 py-4">
            {categoryProducts.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-6xl text-gray-300 mx-auto mb-4">📦</div>
                <h3 className="text-xl font-bold text-gray-800 mb-2">
                  No products found
                </h3>
                <p className="text-gray-600">
                  There are no products available in this category at the
                  moment.
                </p>
              </div>
            ) : viewMode === "grid" ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-6">
                  {displayedItems.map((product, index) => (
                    <motion.div
                      key={product.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}>
                      <ProductCard product={product} />
                    </motion.div>
                  ))}
                </div>

                {hasMore && (
                  <div
                    ref={loadMoreRef}
                    className="mt-6 flex flex-col items-center gap-4">
                    {isLoading && (
                      <div className="flex items-center gap-2 text-gray-600">
                        <span className="text-sm">
                          Loading more products...
                        </span>
                      </div>
                    )}
                    <button
                      onClick={loadMore}
                      disabled={isLoading}
                      className="px-6 py-3 gradient-green text-white rounded-xl font-semibold hover:shadow-glow-green transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed">
                      {isLoading ? "Loading..." : "Load More"}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="space-y-3">
                  {displayedItems.map((product, index) => (
                    <ProductListItem
                      key={product.id}
                      product={product}
                      index={index}
                    />
                  ))}
                </div>

                {hasMore && (
                  <div
                    ref={loadMoreRef}
                    className="mt-6 flex flex-col items-center gap-4">
                    {isLoading && (
                      <div className="flex items-center gap-2 text-gray-600">
                        <span className="text-sm">
                          Loading more products...
                        </span>
                      </div>
                    )}
                    <button
                      onClick={loadMore}
                      disabled={isLoading}
                      className="px-6 py-3 gradient-green text-white rounded-xl font-semibold hover:shadow-glow-green transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed">
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

export default MobileCategory;
