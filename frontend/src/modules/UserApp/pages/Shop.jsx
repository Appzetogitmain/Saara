import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  FiSearch,
  FiFilter,
  FiX,
  FiGrid,
  FiList,
  FiChevronDown,
  FiShoppingBag,
  FiTrash2,
  FiCheck
} from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import MobileLayout from '../components/Layout/MobileLayout';
import ProductCard from '../../../shared/components/ProductCard';
import ProductListItem from '../components/Mobile/ProductListItem';
import LazyImage from '../../../shared/components/LazyImage';
import PageTransition from '../../../shared/components/PageTransition';
import { useAuthStore } from '../../../shared/store/authStore';
import toast from 'react-hot-toast';
import api from '../../../shared/utils/api';

const PAGE_SIZE = 50;

const normalizeProduct = (raw) => {
  const id = String(raw?.id || raw?._id || '').trim();
  return {
    ...raw,
    id,
    _id: id,
    image: raw?.image || raw?.images?.[0] || '',
    images: Array.isArray(raw?.images) ? raw.images : raw?.image ? [raw.image] : [],
    price: Number(raw?.price) || 0,
    rating: Number(raw?.rating) || 0,
  };
};

const Shop = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();

  // Search input
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState({ products: [], categories: [] });

  // View state & Local Storage Preference
  const [viewMode, setViewMode] = useState('grid');

  // Drawer / Modals
  const [showFilters, setShowFilters] = useState(false);
  const [showSortModal, setShowSortModal] = useState(false);

  // Metadata Lists
  const [metaCategories, setMetaCategories] = useState([]);
  const [metaBrands, setMetaBrands] = useState([]);
  const [metaVendors, setMetaVendors] = useState([]);
  const [metaQuickFilters, setMetaQuickFilters] = useState([]);
  const [metaFiltersSchema, setMetaFiltersSchema] = useState([]);
  const [priceStats, setPriceStats] = useState({ min: 0, max: 50000 });
  const [shopBanner, setShopBanner] = useState(null);

  // Listing Data
  const [products, setProducts] = useState([]);
  const [totalProducts, setTotalProducts] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Personalized & Fallbacks
  const [recentlyViewed, setRecentlyViewed] = useState([]);
  const [trendingProducts, setTrendingProducts] = useState([]);

  // Active filters State
  const [selectedSort, setSelectedSort] = useState(searchParams.get('sort') || 'newest');
  const [activeQuickChip, setActiveQuickChip] = useState('all');
  
  const filterQuery = useMemo(() => ({
    category: searchParams.get('category') || '',
    brand: searchParams.get('brand') || '',
    vendor: searchParams.get('vendor') || '',
    minPrice: searchParams.get('minPrice') || '',
    maxPrice: searchParams.get('maxPrice') || '',
    minRating: searchParams.get('minRating') || '',
    discount: searchParams.get('discount') || '',
    stock: searchParams.get('stock') || '',
    deliveryType: searchParams.get('deliveryType') || '',
    color: searchParams.get('color') || '',
    size: searchParams.get('size') || ''
  }), [searchParams]);

  // Track search suggestions fetch
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSuggestions({ products: [], categories: [] });
      return;
    }
    const delayDebounceFn = setTimeout(async () => {
      try {
        const res = await api.get('/search/autocomplete', { params: { q: searchQuery } });
        const dataPayload = res?.data || res || {};
        setSuggestions(dataPayload || { products: [], categories: [] });
      } catch (err) {
        console.error(err);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  // Load shop configuration metadata
  useEffect(() => {
    const loadMeta = async () => {
      try {
        const res = await api.get('/shop/meta');
        const payload = res?.data || res || {};
        setMetaCategories(payload.categories || []);
        setMetaBrands(payload.brands || []);
        setMetaVendors(payload.vendors || []);
        setMetaQuickFilters(payload.quickFilters || []);
        setMetaFiltersSchema(payload.filters || []);
        if (payload.priceRange) {
          setPriceStats(payload.priceRange);
        }
        setShopBanner(payload.banner);
      } catch (err) {
        console.error('Failed to load shop configuration metadata:', err);
      }
    };

    // Load trending fallback
    const loadTrending = async () => {
      try {
        const res = await api.get('/products/top-rated');
        const list = res?.data || res || [];
        setTrendingProducts(list.slice(0, 10).map(normalizeProduct));
      } catch (err) {
        console.error(err);
      }
    };

    loadMeta();
    loadTrending();
  }, []);

  // Load recently viewed if logged in
  useEffect(() => {
    if (!isAuthenticated) return;
    const loadRecentlyViewed = async () => {
      try {
        const res = await api.get('/user/recently-viewed');
        const payload = res?.data || res || [];
        // Extract products from populated model items
        const list = payload.map(item => item.productId).filter(Boolean);
        setRecentlyViewed(list.slice(0, 8).map(normalizeProduct));
      } catch (err) {
        console.error('Failed to load recently viewed:', err);
      }
    };
    loadRecentlyViewed();
  }, [isAuthenticated]);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (showFilters) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showFilters]);

  // Sync quick chip matching url state
  useEffect(() => {
    const q = searchParams.get('q') || '';
    setSearchQuery(q);

    const sort = searchParams.get('sort') || 'newest';
    setSelectedSort(sort);

    let foundChip = 'all';
    for (const chip of metaQuickFilters) {
      try {
        const chipParams = JSON.parse(chip.queryParams || '{}');
        const isMatch = Object.keys(chipParams).every(key => searchParams.get(key) === String(chipParams[key]));
        if (isMatch && Object.keys(chipParams).length > 0) {
          foundChip = chip.label;
          break;
        }
      } catch (e) {}
    }
    setActiveQuickChip(foundChip);
  }, [searchParams, metaQuickFilters]);

  // Fetch shop products
  const fetchProducts = useCallback(async (pageNumber = 1) => {
    setIsLoading(true);
    try {
      // Build filters
      const params = {
        page: pageNumber,
        limit: PAGE_SIZE,
        sort: selectedSort
      };

      const q = searchParams.get('q');
      if (q) params.q = q;

      Object.keys(filterQuery).forEach(key => {
        if (filterQuery[key]) {
          params[key] = filterQuery[key];
        }
      });

      const res = await api.get('/shop/products', { params });
      const payload = res?.data || res || {};
      const list = (payload.products || []).map(normalizeProduct);

      setProducts(list);
      setTotalProducts(payload.totalProducts || 0);
      setCurrentPage(Number(payload.page || 1));
      setTotalPages(Number(payload.pages || 1));
    } catch (err) {
      toast.error('Error fetching catalog products');
    } finally {
      setIsLoading(false);
    }
  }, [filterQuery, selectedSort, searchParams]);

  // Load initial listing on query sync
  useEffect(() => {
    const pageVal = Number(searchParams.get('page') || 1);
    fetchProducts(pageVal);
  }, [fetchProducts, searchParams]);

  // Handle updates to view modes
  const handleViewModeToggle = () => {
    const nextMode = viewMode === 'grid' ? 'list' : 'grid';
    setViewMode(nextMode);
    localStorage.setItem('shop_view_mode', nextMode);
  };

  // Run searches
  const handleSearchSubmit = (e) => {
    if (e) e.preventDefault();
    const newParams = new URLSearchParams(searchParams);
    if (searchQuery.trim()) {
      newParams.set('q', searchQuery.trim());
    } else {
      newParams.delete('q');
    }
    setSearchParams(newParams);
    setShowSuggestions(false);
  };

  // Toggle dynamic filters drawer
  const handleFilterChange = (key, value) => {
    const newParams = new URLSearchParams(searchParams);
    if (value) {
      newParams.set(key, value);
    } else {
      newParams.delete(key);
    }
    setSearchParams(newParams);
  };

  // Toggle quick chip
  const handleQuickChipClick = (chip) => {
    const newParams = new URLSearchParams();
    
    // Carry over q query search parameter
    const currentQ = searchParams.get('q');
    if (currentQ) {
      newParams.set('q', currentQ);
    }

    if (chip.label !== 'All') {
      try {
        const chipParams = JSON.parse(chip.queryParams || '{}');
        Object.keys(chipParams).forEach(key => {
          newParams.set(key, chipParams[key]);
        });
      } catch (e) {}
    }
    setSearchParams(newParams);
  };

  // Clear all active selections
  const handleClearAllFilters = () => {
    setSearchParams({});
    setSearchQuery('');
  };

  // Drawer options checker
  const isFilterEnabled = (key) => {
    return metaFiltersSchema.some(f => f.key === key);
  };

  // Check if any filter is active
  const hasActiveFilters = useMemo(() => {
    return Object.values(filterQuery).some(val => val !== '') || !!searchParams.get('q');
  }, [filterQuery, searchParams]);

  // Get active filter labels for rendering tags
  const activeFiltersList = useMemo(() => {
    const list = [];
    if (searchParams.get('q')) {
      list.push({ key: 'q', value: searchParams.get('q'), label: `Search: "${searchParams.get('q')}"` });
    }
    Object.keys(filterQuery).forEach(key => {
      const val = filterQuery[key];
      if (val) {
        let label = `${key}: ${val}`;
        if (key === 'category') {
          const match = metaCategories.find(c => (c.id || c._id) === val);
          label = match ? `Category: ${match.name}` : `Category: ${val}`;
        } else if (key === 'brand') {
          const match = metaBrands.find(b => (b.id || b._id) === val);
          label = match ? `Brand: ${match.name}` : `Brand: ${val}`;
        } else if (key === 'minRating') {
          label = `Rating: ${val}★ & above`;
        } else if (key === 'discount') {
          label = `Discount: Min ${val}%`;
        } else if (key === 'maxPrice') {
          label = `Price: Under ₹${val}`;
        } else if (key === 'stock') {
          label = 'In Stock Only';
        } else if (key === 'deliveryType') {
          label = 'Express Delivery';
        }
        list.push({ key, value: val, label });
      }
    });
    return list;
  }, [filterQuery, searchParams, metaCategories, metaBrands]);

  return (
    <>
      <PageTransition>
      <MobileLayout showBottomNav={true} showCartBar={true}>
        <div className="w-full min-h-screen bg-gray-50 flex flex-col">
          

          {/* 2. Shop Hero Promo Banner */}
          {shopBanner && (
            <div className="px-4 pt-4">
              <div
                onClick={() => shopBanner.ctaLink && navigate(shopBanner.ctaLink)}
                className="relative rounded-2xl overflow-hidden h-56 sm:h-72 md:h-80 flex flex-col justify-center px-6 text-white cursor-pointer group shadow-sm"
                style={{
                  background: `linear-gradient(135deg, ${shopBanner.textColor === '#ffffff' ? '#7C3AED' : '#f3f4f6'}, #4F46E5)`
                }}
              >
                {shopBanner.desktopImage && (
                  <img
                    src={shopBanner.desktopImage}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  />
                )}
                
                <div
                  className="absolute inset-0 bg-black"
                  style={{ opacity: shopBanner.overlayOpacity }}
                />

                <div className="relative z-10 max-w-md space-y-1.5">
                  {shopBanner.subtitle && (
                    <span className="text-[10px] uppercase font-bold tracking-widest bg-white/20 px-2 py-0.5 rounded-full backdrop-blur-sm">
                      {shopBanner.subtitle}
                    </span>
                  )}
                  <h2 className="text-lg sm:text-2xl font-black leading-tight">{shopBanner.title}</h2>
                  {shopBanner.ctaText && (
                    <button
                      className="mt-2 text-[10px] sm:text-xs font-bold px-4 py-1.5 rounded-xl hover:shadow-lg transition-all"
                      style={{ backgroundColor: shopBanner.buttonColor, color: shopBanner.textColor }}
                    >
                      {shopBanner.ctaText}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 3. Horizontal Scroll Categories Carousel */}
          {metaCategories.length > 0 && (
            <div className="py-4 bg-white border-b border-gray-100">
              <div className="px-4 mb-2 flex items-center justify-between">
                <span className="text-xs font-black text-slate-800 uppercase tracking-wider">Popular Categories</span>
              </div>
              <div className="flex gap-4 overflow-x-auto px-4 scrollbar-hide snap-x">
                {metaCategories.map(cat => (
                  <button
                    key={cat.id || cat._id}
                    onClick={() => handleFilterChange('category', filterQuery.category === (cat.id || cat._id) ? '' : (cat.id || cat._id))}
                    className="flex flex-col items-center gap-1.5 shrink-0 snap-start"
                  >
                    <div className={`w-16 h-16 rounded-full overflow-hidden border-2 transition-all p-0.5 ${filterQuery.category === (cat.id || cat._id) ? 'border-primary-500 scale-105 shadow-md bg-primary-50' : 'border-transparent bg-gray-50'}`}>
                      <img src={cat.image} alt={cat.name} className="w-full h-full object-cover rounded-full" />
                    </div>
                    <span className="text-[10px] font-bold text-gray-700 line-clamp-1 max-w-[76px]">{cat.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 4. Quick Scroll Filter Chips */}
          {metaQuickFilters.length > 0 && (
            <div className="py-3 bg-white flex gap-2 overflow-x-auto px-4 border-b border-gray-100 scrollbar-hide sticky top-[73px] z-30 shadow-sm">
              <button
                onClick={() => handleQuickChipClick({ label: 'All', queryParams: '{}' })}
                className={`px-4 py-1.5 rounded-full text-xs font-bold shrink-0 transition-all border ${activeQuickChip === 'all' ? 'bg-primary-600 border-primary-600 text-white shadow-sm' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'}`}
              >
                All Products
              </button>
              {metaQuickFilters.map((chip, index) => (
                <button
                  key={index}
                  onClick={() => handleQuickChipClick(chip)}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold shrink-0 transition-all border ${activeQuickChip === chip.label ? 'bg-primary-600 border-primary-600 text-white shadow-sm' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'}`}
                >
                  {chip.label}
                </button>
              ))}
            </div>
          )}

          {/* Active Filter Tags info bar */}
          {hasActiveFilters && (
            <div className="px-4 py-2 bg-gray-100/70 border-b border-gray-200 flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-bold text-gray-400 uppercase mr-1">Active:</span>
              {activeFiltersList.map(tag => (
                <span
                  key={`${tag.key}-${tag.value}`}
                  className="inline-flex items-center gap-1 bg-white border border-gray-200 text-[10px] font-bold text-gray-700 px-2 py-0.5 rounded-md shadow-sm"
                >
                  <span>{tag.label}</span>
                  <button
                    onClick={() => {
                      if (tag.key === 'q') {
                        setSearchQuery('');
                        const newParams = new URLSearchParams(searchParams);
                        newParams.delete('q');
                        setSearchParams(newParams);
                      } else {
                        handleFilterChange(tag.key, '');
                      }
                    }}
                    className="p-0.5 hover:bg-gray-100 rounded-full text-gray-400 hover:text-red-500"
                  >
                    <FiX />
                  </button>
                </span>
              ))}
              <button
                onClick={handleClearAllFilters}
                className="text-[10px] font-bold text-red-500 hover:text-red-750 underline ml-auto"
              >
                Clear All
              </button>
            </div>
          )}

          {/* 5. Desktop/Tablet Tool Bar */}
          <div className="px-4 py-3.5 bg-white border-b border-gray-150 flex items-center justify-between z-20">
            <span className="text-xs lg:text-sm font-extrabold text-gray-700">
              Showing <span className="text-primary-600">{totalProducts.toLocaleString()}</span> products
            </span>

            <div className="flex items-center gap-3">
              {/* Sort selector dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowSortModal(!showSortModal)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-250 text-xs font-bold text-gray-700 hover:bg-gray-50"
                >
                  <span>Sort By: {[
                    { key: 'newest', label: 'Newest' },
                    { key: 'popular', label: 'Popularity' },
                    { key: 'price-asc', label: 'Price Low → High' },
                    { key: 'price-desc', label: 'Price High → Low' },
                    { key: 'rating', label: 'Highest Rated' },
                    { key: 'discount', label: 'Biggest Discount' }
                  ].find(o => o.key === selectedSort)?.label}</span>
                  <FiChevronDown />
                </button>
                
                <AnimatePresence>
                  {showSortModal && (
                    <>
                      <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setShowSortModal(false)} />
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden"
                      >
                        {[
                          { key: 'newest', label: 'Newest' },
                          { key: 'popular', label: 'Popularity' },
                          { key: 'price-asc', label: 'Price Low → High' },
                          { key: 'price-desc', label: 'Price High → Low' },
                          { key: 'rating', label: 'Highest Rated' },
                          { key: 'discount', label: 'Biggest Discount' }
                        ].map((opt) => (
                          <button
                            key={opt.key}
                            onClick={() => {
                              setSelectedSort(opt.key);
                              const newParams = new URLSearchParams(searchParams);
                              newParams.set('sort', opt.key);
                              setSearchParams(newParams);
                              setShowSortModal(false);
                            }}
                            className={`w-full text-left px-4 py-2.5 text-xs font-bold transition-colors ${selectedSort === opt.key ? 'bg-primary-50 text-primary-600' : 'text-gray-700 hover:bg-gray-50'}`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>

              {/* View Toggle */}
              <button
                onClick={handleViewModeToggle}
                className="p-2 border border-gray-250 rounded-xl hover:bg-gray-50 text-gray-600 hidden md:block"
                title={viewMode === 'grid' ? 'Switch to List' : 'Switch to Grid'}
              >
                {viewMode === 'grid' ? <FiList className="text-sm" /> : <FiGrid className="text-sm" />}
              </button>

              {/* Filter Button */}
              <button
                onClick={() => setShowFilters(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-primary-100 bg-primary-50/50 hover:bg-primary-50 text-primary-700 text-xs font-bold"
              >
                <FiFilter />
                <span>Filter</span>
              </button>
            </div>
          </div>



          {/* 7. Product List Display */}
          <div className="flex-1 px-4 py-4 md:px-0">
            {isLoading && products.length === 0 ? (
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
            ) : products.length === 0 ? (
              /* 8. Empty State */
              <div className="w-full max-w-md md:max-w-4xl mx-auto bg-white rounded-3xl border border-gray-150 shadow-sm md:shadow-md p-6 md:p-12 flex flex-col md:flex-row items-center justify-center gap-6 md:gap-12 my-8">
                <div className="flex flex-col items-center md:items-start text-center md:text-left flex-grow space-y-4">
                  <span className="text-5xl md:text-7xl">😔</span>
                  <h3 className="text-base md:text-xl font-black text-gray-800 tracking-tight leading-snug">
                    No matches found for your choices
                  </h3>
                  <p className="text-xs md:text-sm text-gray-400 font-medium max-w-sm">
                    Try clearing your active filters or query search keywords to explore our collections.
                  </p>
                  <button
                    onClick={handleClearAllFilters}
                    className="bg-primary-600 hover:bg-primary-750 text-white font-extrabold text-xs px-6 py-3 rounded-full hover:shadow-lg transition-all"
                  >
                    Reset Active Filters
                  </button>
                </div>
                
                {/* Popular Trending fallbacks inside empty states - right side on desktop, bottom on mobile */}
                {trendingProducts.length > 0 && (
                  <div className="w-full md:w-1/2 border-t md:border-t-0 md:border-l border-gray-150 pt-6 md:pt-0 md:pl-8">
                    <h4 className="text-[10px] md:text-xs font-black uppercase tracking-widest text-gray-400 mb-4">
                      Popular Trending Deals
                    </h4>
                    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide snap-x">
                      {trendingProducts.map(prod => (
                        <div key={prod.id} className="w-32 shrink-0 snap-start">
                          <ProductCard product={prod} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : viewMode === 'grid' ? (
              /* Premium Responsive Grid */
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4 lg:gap-5">
                {products.map((product, idx) => (
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
              /* List Layout */
              <div className="max-w-3xl mx-auto space-y-3">
                {products.map((product, idx) => (
                  <ProductListItem key={product.id} product={product} index={idx} />
                ))}
              </div>
            )}

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-1.5 mt-8 pb-4">
                <button
                  disabled={currentPage === 1 || isLoading}
                  onClick={() => {
                    const nextPg = currentPage - 1;
                    const newParams = new URLSearchParams(searchParams);
                    newParams.set('page', String(nextPg));
                    setSearchParams(newParams);
                    window.scrollTo({ top: 300, behavior: 'smooth' });
                  }}
                  className="px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>

                {/* Numbered Buttons */}
                {Array.from({ length: totalPages }).map((_, idx) => {
                  const pg = idx + 1;
                  if (
                    pg === 1 ||
                    pg === totalPages ||
                    (pg >= currentPage - 2 && pg <= currentPage + 2)
                  ) {
                    return (
                      <button
                        key={pg}
                        onClick={() => {
                          const newParams = new URLSearchParams(searchParams);
                          newParams.set('page', String(pg));
                          setSearchParams(newParams);
                          window.scrollTo({ top: 300, behavior: 'smooth' });
                        }}
                        className={`w-9 h-9 rounded-xl text-xs font-extrabold transition-all border ${
                          currentPage === pg
                            ? 'bg-primary-600 border-primary-600 text-white shadow-md'
                            : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {pg}
                      </button>
                    );
                  }
                  
                  if (pg === 2 || pg === totalPages - 1) {
                    return (
                      <span key={pg} className="px-1.5 text-xs text-gray-400 font-extrabold select-none">
                        ...
                      </span>
                    );
                  }

                  return null;
                })}

                <button
                  disabled={currentPage === totalPages || isLoading}
                  onClick={() => {
                    const nextPg = currentPage + 1;
                    const newParams = new URLSearchParams(searchParams);
                    newParams.set('page', String(nextPg));
                    setSearchParams(newParams);
                    window.scrollTo({ top: 300, behavior: 'smooth' });
                  }}
                  className="px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            )}
          </div>

          {/* 9. Personalized Section: Recently Viewed */}
          {isAuthenticated && recentlyViewed.length > 0 && (
            <div className="py-6 bg-white border-t border-gray-100 mt-auto">
              <div className="px-4 mb-3 flex items-center justify-between">
                <span className="text-xs font-black text-slate-800 uppercase tracking-wider">Recently Viewed Products</span>
              </div>
              <div className="flex gap-4 overflow-x-auto px-4 scrollbar-hide snap-x">
                {recentlyViewed.map(prod => (
                  <div key={prod.id} className="w-36 shrink-0 snap-start p-0.5">
                    <ProductCard product={prod} />
                  </div>
                ))}
              </div>
            </div>
          )}


        </div>
      </MobileLayout>
    </PageTransition>

    {/* 6. Dynamic Filter Drawer */}
    <AnimatePresence>
      {showFilters && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowFilters(false)}
            className="fixed inset-0 bg-black/40 z-[99999]"
          />
          
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.3 }}
            className="fixed top-0 right-0 bottom-0 w-80 max-w-[90vw] bg-white z-[999999] shadow-2xl flex flex-col"
          >
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <h3 className="font-bold text-gray-800 uppercase text-xs tracking-wider">Refine Selection</h3>
              <button
                onClick={() => setShowFilters(false)}
                className="p-1.5 hover:bg-gray-200 rounded-full text-gray-600"
              >
                <FiX />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              {/* Category Filter */}
              {isFilterEnabled('category') && metaCategories.length > 0 && (
                <div className="space-y-1.5">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Categories</h4>
                  <div className="grid grid-cols-2 gap-1.5">
                    {metaCategories.map(cat => (
                      <button
                        key={cat.id || cat._id}
                        onClick={() => handleFilterChange('category', filterQuery.category === (cat.id || cat._id) ? '' : (cat.id || cat._id))}
                        className={`px-2.5 py-1.5 rounded-lg border text-left text-xs font-semibold truncate ${filterQuery.category === (cat.id || cat._id) ? 'bg-primary-50 border-primary-500 text-primary-700' : 'bg-white border-gray-200 text-gray-600'}`}
                      >
                        {cat.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Brand Filter */}
              {isFilterEnabled('brand') && metaBrands.length > 0 && (
                <div className="space-y-1.5">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Brands</h4>
                  <div className="grid grid-cols-2 gap-1.5">
                    {metaBrands.map(b => (
                      <button
                        key={b._id || b.id}
                        onClick={() => handleFilterChange('brand', filterQuery.brand === (b._id || b.id) ? '' : (b._id || b.id))}
                        className={`px-2.5 py-1.5 rounded-lg border text-left text-xs font-semibold truncate ${filterQuery.brand === (b._id || b.id) ? 'bg-primary-50 border-primary-500 text-primary-700' : 'bg-white border-gray-200 text-gray-600'}`}
                      >
                        {b.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Price Slider */}
              {isFilterEnabled('price') && (
                <div className="space-y-1.5">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Price threshold</h4>
                  <div className="space-y-1">
                    <input
                      type="range"
                      min={priceStats.min}
                      max={priceStats.max}
                      step={100}
                      value={filterQuery.maxPrice || priceStats.max}
                      onChange={(e) => handleFilterChange('maxPrice', e.target.value)}
                      className="w-full h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary-600"
                    />
                    <div className="flex items-center justify-between text-xs font-bold text-primary-700">
                      <span>₹{priceStats.min}</span>
                      <span>₹{filterQuery.maxPrice || priceStats.max}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Rating Selector */}
              {isFilterEnabled('rating') && (
                <div className="space-y-1.5">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Rating</h4>
                  <div className="flex gap-2">
                    {[4, 3, 2, 1].map(stars => (
                      <button
                        key={stars}
                        onClick={() => handleFilterChange('minRating', filterQuery.minRating === String(stars) ? '' : String(stars))}
                        className={`flex-1 py-1.5 rounded-lg border text-center text-xs font-bold ${filterQuery.minRating === String(stars) ? 'bg-yellow-50 border-yellow-500 text-yellow-700 font-extrabold' : 'bg-white border-gray-200 text-gray-600'}`}
                      >
                        ⭐ {stars}+
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Discount Filter */}
              {isFilterEnabled('discount') && (
                <div className="space-y-1.5">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Discount</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {[10, 20, 30, 40, 50].map(disc => (
                      <button
                        key={disc}
                        onClick={() => handleFilterChange('discount', filterQuery.discount === String(disc) ? '' : String(disc))}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-semibold ${filterQuery.discount === String(disc) ? 'bg-primary-50 border-primary-500 text-primary-700' : 'bg-white border-gray-200 text-gray-600'}`}
                      >
                        {disc}% Off
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Availability toggle */}
              {isFilterEnabled('stock') && (
                <label className="flex items-center justify-between p-2 rounded-xl border border-gray-250 cursor-pointer select-none">
                  <span className="text-xs font-bold text-gray-700">In Stock Items Only</span>
                  <input
                    type="checkbox"
                    checked={filterQuery.stock === 'in_stock'}
                    onChange={() => handleFilterChange('stock', filterQuery.stock === 'in_stock' ? '' : 'in_stock')}
                    className="rounded text-primary-600 focus:ring-primary-500"
                  />
                </label>
              )}

              {/* Express delivery option */}
              {isFilterEnabled('deliveryType') && (
                <label className="flex items-center justify-between p-2 rounded-xl border border-gray-250 cursor-pointer select-none">
                  <span className="text-xs font-bold text-gray-700">Express Delivery</span>
                  <input
                    type="checkbox"
                    checked={filterQuery.deliveryType === 'express'}
                    onChange={() => handleFilterChange('deliveryType', filterQuery.deliveryType === 'express' ? '' : 'express')}
                    className="rounded text-primary-600 focus:ring-primary-500"
                  />
                </label>
              )}

              {/* Vendor Filter */}
              {isFilterEnabled('vendor') && metaVendors.length > 0 && (
                <div className="space-y-1.5">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Stores</h4>
                  <select
                    value={filterQuery.vendor}
                    onChange={(e) => handleFilterChange('vendor', e.target.value)}
                    className="w-full rounded-lg border-gray-250 text-xs px-2.5 py-2 bg-gray-50 font-bold text-gray-700 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  >
                    <option value="">All Stores</option>
                    {metaVendors.map(v => (
                      <option key={v._id || v.id} value={v._id || v.id}>{v.storeName || v.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-150 bg-gray-50 flex gap-2">
              <button
                onClick={() => {
                  handleClearAllFilters();
                  setShowFilters(false);
                }}
                className="flex-1 py-2.5 bg-gray-200 text-gray-700 font-bold text-xs rounded-xl hover:bg-gray-300 transition-colors"
              >
                Reset All
              </button>
              <button
                onClick={() => setShowFilters(false)}
                className="flex-1 py-2.5 bg-primary-600 text-white font-bold text-xs rounded-xl hover:bg-primary-750 hover:shadow-lg transition-all"
              >
                Apply Options
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
    </>
  );
};

export default Shop;
