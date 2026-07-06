import { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { FiArrowLeft, FiFilter, FiX, FiSearch, FiLayers } from "react-icons/fi";
import MobileLayout from "../components/Layout/MobileLayout";
import { categories as fallbackCategories } from "../../../data/categories";
import { getCatalogProducts } from "../data/catalogData";
import { useCategoryStore } from "../../../shared/store/categoryStore";
import PageTransition from "../../../shared/components/PageTransition";
import LazyImage from "../../../shared/components/LazyImage";
import ProductCard from "../../../shared/components/ProductCard";
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

const MobileCategories = () => {
  const navigate = useNavigate();
  const { categories, initialize, getCategoriesByParent, getRootCategories } =
    useCategoryStore();

  // Initialize store on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Get root categories (categories without parent) and merge with fallback.
  // Backend category image should take priority when present.
  const rootCategories = useMemo(() => {
    const roots = getRootCategories().filter((cat) => cat.isActive !== false);
    if (roots.length === 0) {
      return fallbackCategories;
    }
    // Keep backend values as source of truth.
    // Use fallback image only when backend category has no image.
    return roots.map((cat) => {
      const fallbackCat = fallbackCategories.find(
        (fc) =>
          normalizeId(fc.id) === normalizeId(cat.id) ||
          fc.name?.toLowerCase() === cat.name?.toLowerCase()
      );
      if (fallbackCat) {
        return {
          ...fallbackCat,
          ...cat,
          image: cat.image || fallbackCat.image,
        };
      }
      return cat;
    });
  }, [categories, getRootCategories]);

  const [selectedCategoryId, setSelectedCategoryId] = useState(
    rootCategories[0]?.id || null
  );
  const categoryListRef = useRef(null);
  const activeCategoryRef = useRef(null);
  const filterButtonRef = useRef(null);
  const [isInitialMount, setIsInitialMount] = useState(true);
  const [selectedSubcategory, setSelectedSubcategory] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    minPrice: "",
    maxPrice: "",
    minRating: "",
  });
  const [categoryProductsFeed, setCategoryProductsFeed] = useState([]);

  // Get subcategories for selected category
  const subcategories = useMemo(() => {
    if (!selectedCategoryId) return [];
    const subcats = getCategoriesByParent(selectedCategoryId);
    return subcats.filter((cat) => cat.isActive !== false);
  }, [selectedCategoryId, categories, getCategoriesByParent]);

  useEffect(() => {
    if (!rootCategories.length) return;
    if (!selectedCategoryId) {
      setSelectedCategoryId(rootCategories[0].id);
      return;
    }
    const exists = rootCategories.some(
      (cat) => normalizeId(cat.id) === normalizeId(selectedCategoryId)
    );
    if (!exists) {
      setSelectedCategoryId(rootCategories[0].id);
    }
  }, [rootCategories, selectedCategoryId]);

  // Reset selected subcategory when category changes
  useEffect(() => {
    setSelectedSubcategory(null);
  }, [selectedCategoryId]);

  useEffect(() => {
    let cancelled = false;

    const fetchCategoryProducts = async () => {
      const targetCategoryId = normalizeId(selectedSubcategory || selectedCategoryId);
      if (!targetCategoryId) {
        if (!cancelled) {
          setCategoryProductsFeed([]);
        }
        return;
      }

      try {
        const response = await api.get("/products", {
          params: {
            category: targetCategoryId,
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
        const selectedId = normalizeId(selectedCategoryId);
        const selectedSubId = normalizeId(selectedSubcategory);
        const fallback = getCatalogProducts().filter((product) => {
          const productCategoryId = normalizeId(product.categoryId);
          const productCategory = categories.find(
            (cat) => normalizeId(cat.id) === productCategoryId
          );
          const productParentId = getParentId(productCategory);

          if (selectedSubId) return productCategoryId === selectedSubId;
          return productCategoryId === selectedId || productParentId === selectedId;
        });
        setCategoryProductsFeed(fallback);
      }
    };

    fetchCategoryProducts();
    return () => {
      cancelled = true;
    };
  }, [selectedCategoryId, selectedSubcategory, categories]);

  // Filter products based on selected category, subcategory, search query, and filters
  const filteredProducts = useMemo(() => {
    if (!selectedCategoryId) return [];
    let filtered = [...categoryProductsFeed];

    // Filter by search query
    if (searchQuery) {
      filtered = filtered.filter((product) =>
        product.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Filter by price range
    if (filters.minPrice) {
      filtered = filtered.filter(
        (product) => product.price >= parseFloat(filters.minPrice)
      );
    }
    if (filters.maxPrice) {
      filtered = filtered.filter(
        (product) => product.price <= parseFloat(filters.maxPrice)
      );
    }

    // Filter by minimum rating
    if (filters.minRating) {
      filtered = filtered.filter(
        (product) => product.rating >= parseFloat(filters.minRating)
      );
    }

    return filtered;
  }, [
    selectedCategoryId,
    categoryProductsFeed,
    searchQuery,
    filters,
  ]);

  // Mark initial mount as complete after first render
  useEffect(() => {
    if (isInitialMount) {
      // Use requestAnimationFrame to ensure smooth initial render
      requestAnimationFrame(() => {
        setIsInitialMount(false);
      });
    }
  }, [isInitialMount]);

  // Scroll active category into view (optimized with requestAnimationFrame) - Vertical scroll
  useEffect(() => {
    if (activeCategoryRef.current && categoryListRef.current) {
      const categoryElement = activeCategoryRef.current;
      const listContainer = categoryListRef.current;

      const elementTop = categoryElement.offsetTop;
      const elementHeight = categoryElement.offsetHeight;
      const containerHeight = listContainer.clientHeight;
      const scrollTop = listContainer.scrollTop;

      // Check if element is not fully visible
      if (
        elementTop < scrollTop ||
        elementTop + elementHeight > scrollTop + containerHeight
      ) {
        // Use requestAnimationFrame for smoother scrolling
        requestAnimationFrame(() => {
          listContainer.scrollTo({
            top: elementTop - listContainer.offsetTop - 10,
            behavior: "smooth",
          });
        });
      }
    }
  }, [selectedCategoryId]);

  const handleCategorySelect = (categoryId) => {
    setSelectedCategoryId(categoryId);
  };

  const handleFilterChange = (name, value) => {
    setFilters({ ...filters, [name]: value });
  };

  const clearFilters = () => {
    setFilters({
      minPrice: "",
      maxPrice: "",
      minRating: "",
    });
  };

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

  const selectedCategory = rootCategories.find(
    (cat) => normalizeId(cat.id) === normalizeId(selectedCategoryId)
  );

  // Check if any filter is active
  const hasActiveFilters =
    filters.minPrice || filters.maxPrice || filters.minRating;

  // Calculate available height for content (accounting for bottom nav and cart bar)
  const contentHeight = `calc(100vh - 80px)`;

  // Handle empty categories
  if (rootCategories.length === 0) {
    return (
      <PageTransition>
        <MobileLayout showBottomNav={true} showCartBar={true}>
          <div className="w-full flex items-center justify-center min-h-[60vh] px-4">
            <div className="text-center">
              <div className="text-6xl text-gray-300 mx-auto mb-4">📦</div>
              <h2 className="text-xl font-bold text-gray-800 mb-2">
                No Categories Available
              </h2>
              <p className="text-gray-600">
                There are no categories to display at the moment.
              </p>
            </div>
          </div>
        </MobileLayout>
      </PageTransition>
    );
  }

  // Calculate header height for layout calculations
  const headerSectionHeight = 80;

  return (
    <PageTransition>
      <MobileLayout showBottomNav={true} showCartBar={true}>
        <div
          className="w-full flex flex-col"
          style={{ minHeight: contentHeight }}>
          {/* Category Header - Fixed at top */}
          {selectedCategory && (
            <div className="sticky top-0 z-40 bg-white border-b border-gray-200 px-4 py-3">
              {/* Search Bar Row */}
              <div className="relative">
                <FiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
                <input
                  type="text"
                  placeholder="Search in category..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-10 py-2 bg-gray-100 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-primary-500 shadow-inner placeholder:text-gray-400"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                  >
                    <FiX className="text-sm" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Main Content Area - Sidebar and Products */}
          <div
            className="flex flex-1"
            style={{
              minHeight: `calc(${contentHeight} - ${headerSectionHeight}px)`,
            }}>
            {/* Left Panel - Vertical Category Sidebar */}
            <div
              ref={categoryListRef}
              className="w-20 md:w-24 bg-gray-50 border-r border-gray-200 overflow-y-auto scrollbar-hide flex-shrink-0"
              style={{
                maxHeight: `calc(${contentHeight} - ${headerSectionHeight}px)`,
              }}>
              <div className="pb-[190px]">
                {rootCategories.map((category) => {
                  const isActive =
                    normalizeId(category.id) === normalizeId(selectedCategoryId);
                  return (
                    <div
                      key={category.id}
                      ref={isActive ? activeCategoryRef : null}
                      style={{
                        willChange: isActive ? "transform" : "auto",
                        transform: "translateZ(0)",
                      }}>
                      <motion.button
                        onClick={() => handleCategorySelect(category.id)}
                        initial={isInitialMount ? { opacity: 0 } : false}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.2 }}
                        whileTap={{ scale: 0.95 }}
                        className={`w-full px-2 py-1.5 text-left transition-all duration-200 relative ${isActive ? "bg-white shadow-sm" : "hover:bg-gray-100"
                          }`}
                        style={{ willChange: "transform" }}>
                        <div className="flex flex-col items-center gap-1">
                          <div
                            className={`w-12 h-12 rounded-2xl overflow-hidden bg-gray-100 flex-shrink-0 transition-all duration-200 ${isActive
                              ? "ring-2 ring-primary-500 ring-offset-1 scale-105"
                              : ""
                              }`}
                            style={{
                              willChange: isActive ? "transform" : "auto",
                            }}>
                            <LazyImage
                              src={category.image}
                              alt={category.name}
                              className="w-full h-full object-cover"
                              placeholderWidth={48}
                              placeholderHeight={48}
                              placeholderText={category.name}
                            />
                          </div>
                          <span
                            className={`text-[11px] font-semibold text-center leading-tight transition-colors ${isActive ? "text-primary-600" : "text-gray-700"
                              }`}>
                            {category.name}
                          </span>
                        </div>
                      </motion.button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Panel - Products Grid */}
            <div
              className="flex-1 overflow-y-auto bg-white flex-shrink-0"
              style={{
                maxHeight: `calc(${contentHeight} - ${headerSectionHeight}px)`,
              }}>
              <div className="p-1 md:p-6">
                <AnimatedBanner showPadding={false} className="mb-2" />
                {/* Top Header */}
                <div className="flex items-center gap-4 mb-4 px-1">
                  <h2 className="text-sm font-bold text-gray-800 whitespace-nowrap uppercase tracking-wide">
                    Top Categories For You
                  </h2>
                  <div className="flex-1 border-t border-dotted border-gray-300"></div>
                </div>

                {/* Subcategory Scroll Bar */}
                {subcategories.length > 0 && (
                  <div 
                    className="flex items-center gap-3 overflow-x-auto py-3 px-1 mb-5 border-b border-gray-100"
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedSubcategory(null)}
                      className={`flex items-center gap-2.5 px-6 py-2.5 rounded-full text-xs md:text-sm font-black tracking-wider uppercase whitespace-nowrap transition-all duration-200 hover:scale-105 active:scale-95 border ${
                        selectedSubcategory === null
                          ? "bg-gradient-to-r from-primary-500 to-primary-600 text-white border-primary-600 shadow-md shadow-primary-500/20 scale-105"
                          : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:text-gray-900 hover:border-gray-300"
                      }`}
                    >
                      <FiLayers className={`text-base ${selectedSubcategory === null ? "text-white" : "text-primary-500"}`} />
                      All Products
                    </button>
                    {subcategories.map((sub) => {
                      const isSelected = normalizeId(sub.id) === normalizeId(selectedSubcategory);
                      return (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => setSelectedSubcategory(sub.id)}
                          className={`flex items-center gap-2.5 px-6 py-2.5 rounded-full text-xs md:text-sm font-black tracking-wider uppercase whitespace-nowrap transition-all duration-200 hover:scale-105 active:scale-95 border ${
                            isSelected
                              ? "bg-gradient-to-r from-primary-500 to-primary-600 text-white border-primary-600 shadow-md shadow-primary-500/20 scale-105"
                              : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:text-gray-900 hover:border-gray-300"
                          }`}
                        >
                          <div className="w-7 h-7 rounded-full overflow-hidden bg-gray-50 flex-shrink-0 border border-gray-200/60 shadow-sm">
                             <LazyImage
                               src={sub.image}
                               alt={sub.name}
                               className="w-full h-full object-cover"
                               placeholderWidth={28}
                               placeholderHeight={28}
                               placeholderText={sub.name}
                             />
                           </div>
                           {sub.name}
                        </button>
                      );
                    })}
                  </div>
                )}



                {filteredProducts.length === 0 ? (
                  <div key="empty" className="text-center py-12">
                    <div className="text-6xl text-gray-300 mx-auto mb-4">
                      📦
                    </div>
                    <h3 className="text-lg font-bold text-gray-800 mb-2">
                      No products found
                    </h3>
                    <p className="text-sm text-gray-600">
                      There are no products available in this category at the
                      moment.
                    </p>
                  </div>
                ) : (
                  <motion.div
                    key={`products-${selectedCategoryId}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-y-6 gap-x-3 p-1"
                    style={{
                      willChange: "opacity",
                      transform: "translateZ(0)",
                    }}>
                    {filteredProducts.map((product) => (
                      <div
                        key={product.id}
                        onClick={() => navigate(`/product/${product.id}`)}
                        className="flex flex-col items-center gap-2 cursor-pointer group"
                      >
                        <div className="w-full aspect-square bg-gray-50 rounded-2xl p-2 flex items-center justify-center overflow-hidden transition-all group-hover:scale-105 shadow-sm border border-gray-100">
                          <LazyImage
                            src={product.image}
                            alt={product.name}
                            className="w-full h-full object-contain"
                            placeholderWidth={100}
                            placeholderHeight={100}
                          />
                        </div>
                        <span className="text-[11px] font-medium text-gray-700 text-center line-clamp-2 leading-tight px-1 group-hover:text-primary-600 transition-colors">
                          {product.name}
                        </span>
                      </div>
                    ))}
                  </motion.div>
                )}
              </div>
            </div>
          </div>
        </div>
      </MobileLayout>
    </PageTransition >
  );
};

export default MobileCategories;
