import { useEffect, useState, useRef, useMemo } from "react";
import { 
  FiHeart, 
  FiArrowLeft, 
  FiShoppingBag, 
  FiShare2, 
  FiLink2, 
  FiTrash2, 
  FiCheckSquare, 
  FiSquare, 
  FiStar, 
  FiEye,
  FiTrendingUp,
  FiCheckCircle,
  FiAlertTriangle,
  FiChevronLeft,
  FiChevronRight
} from "react-icons/fi";
import { Link, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import MobileLayout from "../components/Layout/MobileLayout";
import { useWishlistStore } from "../../../shared/store/wishlistStore";
import { useCartStore } from "../../../shared/store/useStore";
import { useAuthStore } from "../../../shared/store/authStore";
import toast from "react-hot-toast";
import PageTransition from '../../../shared/components/PageTransition';
import ProductCard from "../../../shared/components/ProductCard";
import { formatPrice } from "../../../shared/utils/helpers";
import api from "../../../shared/utils/api";

const WishlistCarouselSection = ({ icon: Icon, iconBg, iconColor, title, subtitle, products }) => {
  const scrollContainerRef = useRef(null);
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const handleScroll = (direction) => {
    if (!scrollContainerRef.current) return;
    const scrollAmount = direction === "left" ? -360 : 360;
    scrollContainerRef.current.scrollBy({ left: scrollAmount, behavior: "smooth" });
  };

  const handleMouseDown = (e) => {
    if (!scrollContainerRef.current) return;
    setIsMouseDown(true);
    setStartX(e.pageX - scrollContainerRef.current.offsetLeft);
    setScrollLeft(scrollContainerRef.current.scrollLeft);
  };

  const handleMouseLeave = () => {
    setIsMouseDown(false);
  };

  const handleMouseUp = () => {
    setIsMouseDown(false);
  };

  const handleMouseMove = (e) => {
    if (!isMouseDown || !scrollContainerRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollContainerRef.current.offsetLeft;
    const walk = (x - startX) * 1.5;
    scrollContainerRef.current.scrollLeft = scrollLeft - walk;
  };

  if (!Array.isArray(products) || products.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between select-none">
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-full ${iconBg} flex items-center justify-center ${iconColor}`}>
            <Icon className="text-base" />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">{title}</h3>
            <p className="text-[10px] text-gray-400 font-medium">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => handleScroll("left")}
            className="w-8 h-8 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center text-gray-600 hover:bg-gray-50 hover:text-gray-900 active:scale-95 transition-all cursor-pointer"
            aria-label="Previous products"
          >
            <FiChevronLeft className="text-base" />
          </button>
          <button
            onClick={() => handleScroll("right")}
            className="w-8 h-8 rounded-full bg-white border border-gray-200 shadow-sm flex items-center justify-center text-gray-600 hover:bg-gray-50 hover:text-gray-900 active:scale-95 transition-all cursor-pointer"
            aria-label="Next products"
          >
            <FiChevronRight className="text-base" />
          </button>
        </div>
      </div>

      <div
        ref={scrollContainerRef}
        onMouseDown={handleMouseDown}
        onMouseLeave={handleMouseLeave}
        onMouseUp={handleMouseUp}
        onMouseMove={handleMouseMove}
        className={`flex gap-4 overflow-x-auto pb-4 ${isMouseDown ? "cursor-grabbing select-none" : "cursor-grab"} scroll-smooth snap-x scrollbar-hide [::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] touch-pan-x`}
      >
        {products.map((prod) => (
          <div key={prod.id || prod._id} className="w-44 sm:w-52 shrink-0 snap-start">
            <ProductCard product={prod} />
          </div>
        ))}
      </div>
    </div>
  );
};

const Wishlist = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const { 
    items, 
    filters, 
    sections, 
    summary, 
    pagination, 
    removeItem, 
    addItem, 
    clearWishlist, 
    fetchWishlist, 
    moveSelectedToCart, 
    removeSelectedFromWishlist,
    isLoading 
  } = useWishlistStore();
  
  const { addItem: addToCart } = useCartStore();

  const [selectedFilter, setSelectedFilter] = useState("all");
  const [selectedItems, setSelectedItems] = useState([]);
  const [removedItemCache, setRemovedItemCache] = useState(null);

  // Load wishlist on mount / auth change
  useEffect(() => {
    if (isAuthenticated) {
      fetchWishlist(1, 20, false).catch(() => null);
    }
  }, [isAuthenticated, fetchWishlist]);

  // Infinite Scroll Intersection Observer for pagination
  const sentinelRef = useRef(null);
  useEffect(() => {
    if (!sentinelRef.current || !pagination.hasNext || isLoading) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        fetchWishlist(pagination.page + 1, 20, true).catch(() => null);
      }
    }, { rootMargin: '100px' });

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [pagination, isLoading, fetchWishlist]);

  // Client-side filtering of wishlist items
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const prod = item.product || {};
      const isOutOfStock = prod.stock === 'out_of_stock' || (prod.stockQuantity !== undefined && prod.stockQuantity <= 0);
      
      switch (selectedFilter) {
        case "instock":
          return !isOutOfStock;
        case "outstock":
          return isOutOfStock;
        case "sale":
          return prod.originalPrice && prod.price < prod.originalPrice;
        case "pricedrop":
          return item.priceAtWishlist && prod.price < item.priceAtWishlist;
        case "recent":
          // Last 7 days or just default pass
          const addedDate = item.addedAt ? new Date(item.addedAt) : new Date();
          const diffDays = (new Date() - addedDate) / (1000 * 60 * 60 * 24);
          return diffDays <= 7;
        default:
          return true;
      }
    });
  }, [items, selectedFilter]);

  // Selection toggle handlers
  const handleItemSelect = (productId, variantId) => {
    setSelectedItems(prev => {
      const exists = prev.some(i => i.productId === productId && i.variantId === variantId);
      if (exists) {
        return prev.filter(i => !(i.productId === productId && i.variantId === variantId));
      } else {
        return [...prev, { productId, variantId }];
      }
    });
  };

  const handleSelectAll = () => {
    const allSelected = filteredItems.every(item => 
      selectedItems.some(i => i.productId === item.productId && i.variantId === item.variantId)
    );

    if (allSelected) {
      setSelectedItems([]);
    } else {
      setSelectedItems(filteredItems.map(item => ({
        productId: item.productId,
        variantId: item.variantId
      })));
    }
  };

  // Bulk Actions
  const handleMoveSelected = async () => {
    if (selectedItems.length === 0) return;
    const res = await moveSelectedToCart(selectedItems);
    if (res) {
      const { addedItems = [], outOfStockItems = [], failedItems = [] } = res;
      if (addedItems.length > 0) {
        toast.success(`Successfully moved ${addedItems.length} items to cart!`);
      }
      if (outOfStockItems.length > 0) {
        toast.error(`${outOfStockItems.length} items are out of stock.`);
      }
      setSelectedItems([]);
    }
  };

  const handleRemoveSelected = async () => {
    if (selectedItems.length === 0) return;
    const toastId = toast.custom((t) => (
      <div className={`${t.visible ? 'animate-enter' : 'animate-leave'} max-w-sm w-full bg-white shadow-xl rounded-2xl pointer-events-auto p-4 border border-gray-150 flex flex-col gap-3`}>
        <div className="flex items-center gap-2">
          <FiTrash2 className="text-red-500 text-base shrink-0" />
          <span className="text-xs font-black text-gray-800 uppercase tracking-wider">Remove Selected Items</span>
        </div>
        <p className="text-xs text-gray-500 font-bold leading-normal">
          Are you sure you want to remove the {selectedItems.length} selected items from your wishlist?
        </p>
        <div className="flex gap-2 justify-end mt-1">
          <button
            onClick={() => toast.dismiss(toastId)}
            className="px-4 py-2 text-[10px] font-black text-gray-500 hover:text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-xl transition-all"
          >
            Cancel
          </button>
          <button
            onClick={async () => {
              toast.dismiss(toastId);
              const success = await removeSelectedFromWishlist(selectedItems);
              if (success) {
                toast.success("Removed selected items.");
                setSelectedItems([]);
              }
            }}
            className="px-4 py-2 text-[10px] font-black bg-red-600 hover:bg-red-750 text-white rounded-xl shadow-sm transition-all"
          >
            Remove
          </button>
        </div>
      </div>
    ), {
      duration: 6000,
      position: 'top-center'
    });
  };

  // Share Wishlist options
  const handleShareWishlist = async () => {
    const shareUrl = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "My Porutkal Wishlist",
          text: "Check out the products I saved on Porutkal!",
          url: shareUrl
        });
      } catch (err) {
        // Fallback to copy link
        copyToClipboard(shareUrl);
      }
    } else {
      copyToClipboard(shareUrl);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      toast.success("Wishlist link copied to clipboard!");
    }).catch(() => {
      toast.error("Failed to copy link.");
    });
  };

  const handleClearAll = () => {
    const toastId = toast.custom((t) => (
      <div className={`${t.visible ? 'animate-enter' : 'animate-leave'} max-w-sm w-full bg-white shadow-xl rounded-2xl pointer-events-auto p-4 border border-gray-150 flex flex-col gap-3`}>
        <div className="flex items-center gap-2">
          <FiTrash2 className="text-red-500 text-base shrink-0" />
          <span className="text-xs font-black text-gray-800 uppercase tracking-wider">Clear Wishlist</span>
        </div>
        <p className="text-xs text-gray-500 font-bold leading-normal">
          Are you sure you want to remove all items from your wishlist? This action cannot be undone.
        </p>
        <div className="flex gap-2 justify-end mt-1">
          <button
            onClick={() => toast.dismiss(toastId)}
            className="px-4 py-2 text-[10px] font-black text-gray-500 hover:text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-xl transition-all"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              toast.dismiss(toastId);
              clearWishlist();
              toast.success("Wishlist cleared.");
              setSelectedItems([]);
            }}
            className="px-4 py-2 text-[10px] font-black bg-red-600 hover:bg-red-750 text-white rounded-xl shadow-sm transition-all"
          >
            Clear All
          </button>
        </div>
      </div>
    ), {
      duration: 6000,
      position: 'top-center'
    });
  };

  // Gmail-style Undo deletion pattern
  const handleRemoveSingle = (item) => {
    // Cache the item locally in state
    setRemovedItemCache(item);
    
    // Call store remove instantly (optimistic deletion on client)
    removeItem(item.productId, item.variantId);

    // Show undo toast
    const toastId = toast.custom((t) => (
      <div className={`${t.visible ? 'animate-enter' : 'animate-leave'} max-w-sm w-full bg-slate-900 text-white shadow-xl rounded-xl pointer-events-auto flex items-center justify-between p-3.5 border border-slate-800`}>
        <span className="text-xs font-bold text-slate-100 flex items-center gap-2">
          <FiTrash2 className="text-red-400 text-sm" />
          Removed "{item.name}" from wishlist
        </span>
        <button
          onClick={() => {
            toast.dismiss(toastId);
            handleUndoRemove(item);
          }}
          className="text-xs font-black text-primary-400 hover:text-primary-300 uppercase tracking-widest pl-3 border-l border-slate-700"
        >
          Undo
        </button>
      </div>
    ), { duration: 5000 });
  };

  const handleUndoRemove = async (cachedItem) => {
    if (!cachedItem) return;
    try {
      // API call to re-add
      await addItem(cachedItem.product || cachedItem, cachedItem.variantId);
      toast.success(`Restored "${cachedItem.name}" to wishlist.`);
    } catch {
      toast.error("Failed to restore item.");
    } finally {
      setRemovedItemCache(null);
    }
  };

  const handleMoveSingleToCart = (item) => {
    const prod = item.product || {};
    const isOutOfStock = prod.stock === 'out_of_stock' || (prod.stockQuantity !== undefined && prod.stockQuantity <= 0);

    if (isOutOfStock) {
      toast.error("Item is currently out of stock.");
      return;
    }

    // Add to cart
    addToCart({
      id: item.productId,
      name: item.name,
      price: item.price,
      image: item.image,
      stock: item.stock,
      unit: item.unit,
      quantity: 1,
      variant: item.variantId ? { size: item.variantId } : null
    });

    // Remove from wishlist
    removeItem(item.productId, item.variantId);
    toast.success("Moved to cart!");
  };

  // Find sections returned by unified API
  const priceDropSection = sections.find(s => s.type === "recent_price_drops");
  const recommendedSection = sections.find(s => s.type === "recommended");
  const recentlyViewedSection = sections.find(s => s.type === "recently_viewed");

  return (
    <PageTransition>
      <MobileLayout showBottomNav={true} showCartBar={true}>
        <div className="w-full min-h-screen bg-gray-50 flex flex-col pb-6 lg:pb-8">
          
          {/* Wishlist Header */}
          <div className="px-4 py-4 bg-white border-b border-gray-150 sticky top-0 z-40 shadow-sm">
            <div className="flex flex-col gap-3.5 max-w-7xl mx-auto">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => navigate(-1)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors flex-shrink-0"
                >
                  <FiArrowLeft className="text-xl text-gray-700" />
                </button>
                <div className="flex-1 min-w-0">
                  <h1 className="text-lg md:text-2xl font-black text-gray-800 tracking-tight">
                    My Wishlist
                  </h1>
                  <p className="text-xs text-gray-500 font-medium mt-0.5">
                    {summary.totalItems || 0} items saved • {summary.inStock || 0} in stock
                  </p>
                </div>
                {items.length > 0 && (
                  <button
                    onClick={handleClearAll}
                    className="text-xs text-red-600 hover:text-red-700 font-bold px-3 py-1.5 hover:bg-red-50 rounded-xl transition-all"
                  >
                    Clear All
                  </button>
                )}
              </div>

              {items.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-gray-100">
                  <button
                    onClick={handleSelectAll}
                    className="flex items-center gap-2 text-xs font-bold text-gray-600 hover:text-gray-900 select-none"
                  >
                    {filteredItems.length > 0 && filteredItems.every(item => 
                      selectedItems.some(i => i.productId === item.productId && i.variantId === item.variantId)
                    ) ? (
                      <FiCheckSquare className="text-primary-600 text-lg" />
                    ) : (
                      <FiSquare className="text-gray-400 text-lg" />
                    )}
                    <span>Select All ({filteredItems.length})</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleShareWishlist}
                      className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition-all"
                    >
                      <FiShare2 />
                      <span className="hidden sm:inline">Share</span>
                    </button>
                    {selectedItems.length > 0 && (
                      <>
                        <button
                          onClick={handleMoveSelected}
                          className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white rounded-xl text-xs font-extrabold shadow-md shadow-primary-500/20 active:scale-95 transition-all"
                        >
                          <FiShoppingBag />
                          <span>Move Selected ({selectedItems.length})</span>
                        </button>
                        <button
                          onClick={handleRemoveSelected}
                          className="flex items-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-xl text-xs font-bold transition-all"
                        >
                          <FiTrash2 />
                          <span>Remove</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
            
            {/* Dynamic Filter Chips */}
            {filters.length > 0 && items.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-hide snap-x">
                {filters.map(f => (
                  <button
                    key={f.key}
                    onClick={() => setSelectedFilter(f.key)}
                    className={`px-4 py-1.5 rounded-full text-xs font-bold shrink-0 transition-all border ${
                      selectedFilter === f.key
                        ? 'bg-gradient-to-r from-primary-600 to-primary-700 text-white border-transparent shadow-md shadow-primary-500/20'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}

            {isLoading && items.length === 0 ? (
              /* Loading Skeletons */
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {[...Array(12)].map((_, i) => (
                  <div key={i} className="bg-white border rounded-3xl p-3.5 animate-pulse space-y-3">
                    <div className="bg-gray-200 rounded-2xl h-44 w-full" />
                    <div className="h-4 bg-gray-200 rounded w-3/4" />
                    <div className="h-3 bg-gray-200 rounded w-1/2" />
                    <div className="h-6 bg-gray-200 rounded w-1/3" />
                  </div>
                ))}
              </div>
            ) : items.length === 0 ? (
              /* Empty Wishlist State */
              <div className="w-full bg-white rounded-3xl border border-gray-150 p-8 md:p-16 text-center max-w-lg mx-auto shadow-sm my-6">
                <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-5 text-red-500">
                  <FiHeart className="text-3xl fill-current" />
                </div>
                <h3 className="text-lg font-black text-gray-800 mb-2">Your Wishlist is Empty</h3>
                <p className="text-xs text-gray-400 font-medium max-w-xs mx-auto mb-6">
                  Save products you love to purchase or monitor price drops later.
                </p>
                <Link
                  to="/shop"
                  className="bg-primary-600 hover:bg-primary-750 text-white font-extrabold text-xs px-6 py-3 rounded-full hover:shadow-lg transition-all"
                >
                  Browse Products
                </Link>
              </div>
            ) : filteredItems.length === 0 ? (
              /* Filtered Empty State */
              <div className="py-16 text-center bg-white rounded-3xl border border-gray-150 my-6">
                <p className="text-sm font-bold text-gray-500">No items match the selected filter chip.</p>
              </div>
            ) : (
              /* Main Wishlist Grid */
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4 lg:gap-5">
                <AnimatePresence mode="popLayout">
                  {filteredItems.map(item => {
                    const prod = item;
                    const targetProductId = item.productId || prod.id || prod._id;
                    const productLink = `/product/${targetProductId}`;
                    const isSelected = selectedItems.some(i => i.productId === item.productId && i.variantId === item.variantId);
                    const isOutOfStock = prod.stock === 'out_of_stock' || (prod.stockQuantity !== undefined && prod.stockQuantity <= 0);
                    const discount = prod.originalPrice ? Math.round(((prod.originalPrice - prod.price) / prod.originalPrice) * 100) : 0;
                    const hasPriceDrop = item.priceAtWishlist && prod.price < item.priceAtWishlist;
                    
                    return (
                      <motion.div
                        key={`${item.productId}-${item.variantId}`}
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9, y: 15 }}
                        transition={{ duration: 0.25 }}
                        className="bg-white border border-gray-150 rounded-2xl overflow-hidden relative shadow-sm hover:shadow-md hover:border-gray-250 transition-all flex flex-col group"
                      >
                        {/* Selection Checkbox */}
                        <button
                          onClick={() => handleItemSelect(item.productId, item.variantId)}
                          className="absolute top-3 left-3 z-20 bg-white/95 rounded-lg p-1.5 shadow-sm text-lg hover:scale-105 active:scale-95 transition-all"
                        >
                          {isSelected ? (
                            <FiCheckSquare className="text-primary-600" />
                          ) : (
                            <FiSquare className="text-gray-400" />
                          )}
                        </button>

                        {/* Image Container */}
                        <Link to={productLink} className="relative aspect-square w-full bg-gray-50 overflow-hidden block cursor-pointer">
                          <img
                            src={prod.image || prod.images?.[0] || "/placeholder.jpg"}
                            alt={prod.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                          
                          {/* Price Drop Badge */}
                          {hasPriceDrop && (
                            <span className="absolute bottom-2 left-2 z-10 bg-rose-500 text-white text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-lg shadow-sm animate-pulse">
                              🔥 Price Dropped ₹{item.priceAtWishlist - prod.price}
                            </span>
                          )}

                          {/* Discount tag */}
                          {discount > 0 && !hasPriceDrop && (
                            <span className="absolute bottom-2 left-2 z-10 bg-emerald-500 text-white text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-lg shadow-sm">
                              {discount}% OFF
                            </span>
                          )}
                        </Link>

                        {/* Card Details */}
                        <div className="p-3 flex-1 flex flex-col">
                          <Link to={productLink} className="block group-hover:text-primary-600 transition-colors">
                            {prod.brandName && (
                              <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider block">
                                {prod.brandName}
                              </span>
                            )}
                            <h4 className="text-xs font-bold text-gray-700 line-clamp-2 mt-0.5 leading-snug flex-1 group-hover:text-primary-600 transition-colors">
                              {prod.name}
                            </h4>
                          </Link>

                          {/* Ratings */}
                          <div className="flex items-center gap-1 mt-1.5">
                            <div className="flex items-center text-amber-400">
                              {[...Array(5)].map((_, starIdx) => (
                                <FiStar
                                  key={starIdx}
                                  className={`text-[10px] ${starIdx < Math.round(prod.rating || 0) ? 'fill-current' : 'text-gray-200'}`}
                                />
                              ))}
                            </div>
                            <span className="text-[9px] text-gray-400 font-bold">({prod.reviewCount || 0})</span>
                          </div>

                          {/* Price details */}
                          <div className="flex items-baseline gap-1.5 mt-2">
                            <span className="text-sm font-black text-gray-800">{formatPrice(prod.price)}</span>
                            {prod.originalPrice && (
                              <span className="text-[10px] text-gray-400 line-through font-bold">
                                {formatPrice(prod.originalPrice)}
                              </span>
                            )}
                          </div>

                          {/* Stock details */}
                          <div className="mt-2.5">
                            {isOutOfStock ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-red-50 text-red-600 text-[9px] font-black uppercase tracking-wider border border-red-100">
                                <FiAlertTriangle /> Out of Stock
                              </span>
                            ) : prod.stockQuantity <= 5 ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-50 text-amber-600 text-[9px] font-black uppercase tracking-wider border border-amber-100">
                                <FiAlertTriangle /> Only {prod.stockQuantity} Left
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-600 text-[9px] font-black uppercase tracking-wider border border-emerald-100">
                                <FiCheckCircle /> In Stock
                              </span>
                            )}
                          </div>

                          {/* Delivery info */}
                          <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-2">
                            🚚 {item.deliveryLabel || "Standard Delivery"}
                          </p>

                          {/* Bottom Action buttons */}
                          <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-gray-100">
                            <button
                              onClick={() => handleRemoveSingle(item)}
                              className="py-2 text-[10px] font-bold text-gray-500 hover:text-red-600 border border-gray-200 rounded-xl hover:bg-red-50 transition-colors flex items-center justify-center gap-1"
                            >
                              <FiTrash2 /> Remove
                            </button>
                            <button
                              onClick={() => handleMoveSingleToCart(item)}
                              disabled={isOutOfStock}
                              className="py-2 text-[10px] font-black text-white bg-primary-600 hover:bg-primary-750 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-all flex items-center justify-center gap-1 shadow-sm"
                            >
                              <FiShoppingBag /> Move
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}

            {/* Pagination Intersection Sentinel */}
            <div ref={sentinelRef} className="w-full flex items-center justify-center my-1 min-h-[4px]">
              {isLoading && pagination.page > 1 && (
                <div className="flex items-center gap-2 text-gray-500 font-bold text-xs py-2">
                  <div className="animate-spin rounded-full h-4.5 w-4.5 border-b-2 border-primary-600" />
                  <span>Loading more saved items...</span>
                </div>
              )}
            </div>

            {/* Dynamic Layout Sections */}
            <div className="mt-4 space-y-8 border-t border-gray-100 pt-5">
              {/* 1. Price Drops Carousel */}
              {priceDropSection && (
                <WishlistCarouselSection
                  icon={FiTrendingUp}
                  iconBg="bg-rose-50"
                  iconColor="text-rose-500"
                  title={priceDropSection.title}
                  subtitle="Deals with price reductions since you added them"
                  products={priceDropSection.products}
                />
              )}

              {/* 2. Recommendations Carousel */}
              {recommendedSection && (
                <WishlistCarouselSection
                  icon={FiHeart}
                  iconBg="bg-primary-50"
                  iconColor="text-primary-500"
                  title={recommendedSection.title}
                  subtitle="Curated picks based on categories and brands you saved"
                  products={recommendedSection.products}
                />
              )}

              {/* 3. Recently Viewed Carousel */}
              {recentlyViewedSection && (
                <WishlistCarouselSection
                  icon={FiEye}
                  iconBg="bg-gray-100"
                  iconColor="text-gray-500"
                  title={recentlyViewedSection.title}
                  subtitle="Pick up right where you left off"
                  products={recentlyViewedSection.products}
                />
              )}
            </div>
          </div>
        </div>
      </MobileLayout>
    </PageTransition>
  );
};

export default Wishlist;
