import { useState, useMemo, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { FiFilter, FiArrowLeft, FiGrid, FiX, FiCheckCircle, FiStar, FiShoppingBag } from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";
import MobileLayout from "../components/Layout/MobileLayout";
import ProductCard from "../../../shared/components/ProductCard";
import ProductListItem from "../components/Mobile/ProductListItem";
import { getProductsByVendor, getVendorById } from "../data/catalogData";
import { useCategoryStore } from "../../../shared/store/categoryStore";
import { categories as fallbackCategories } from "../../../data/categories";
import PageTransition from "../../../shared/components/PageTransition";
import useInfiniteScroll from "../../../shared/hooks/useInfiniteScroll";
import LazyImage from "../../../shared/components/LazyImage";
import { getPlaceholderImage } from "../../../shared/utils/helpers";
import api from "../../../shared/utils/api";

const normalizeVendor = (raw) => ({
    ...raw,
    id: String(raw?.id || raw?._id || ""),
    _id: String(raw?.id || raw?._id || ""),
    rating: Number(raw?.rating) || 0,
    reviewCount: Number(raw?.reviewCount) || 0,
    isVerified: !!raw?.isVerified,
});

const normalizeProduct = (raw) => ({
    ...raw,
    id: String(raw?.id || raw?._id || ""),
    _id: String(raw?.id || raw?._id || ""),
    vendorId: String(raw?.vendorId?._id || raw?.vendorId || ""),
    brandId: String(raw?.brandId?._id || raw?.brandId || ""),
    image: raw?.image || raw?.images?.[0] || "",
    images: Array.isArray(raw?.images) ? raw.images : raw?.image ? [raw.image] : [],
    price: Number(raw?.price) || 0,
    rating: Number(raw?.rating) || 0,
    reviewCount: Number(raw?.reviewCount) || 0,
});

const Seller = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const vendorId = String(id ?? "").trim();
    const { categories, initialize, getRootCategories } = useCategoryStore();

    // Initialize store on mount
    useEffect(() => {
        initialize();
    }, [initialize]);

    const rootCategories = useMemo(() => {
        const roots = getRootCategories().filter((cat) => cat.isActive !== false);
        return roots.length ? roots : fallbackCategories;
    }, [categories, getRootCategories]);

    const [catalogVersion, setCatalogVersion] = useState(0);
    const [remoteVendor, setRemoteVendor] = useState(null);
    const [remoteProducts, setRemoteProducts] = useState([]);
    const [isResolvingVendor, setIsResolvingVendor] = useState(true);

    // Get vendor information
    const vendor = useMemo(
        () => getVendorById(vendorId) || remoteVendor,
        [vendorId, catalogVersion, remoteVendor]
    );

    const PRICE_MAX = 50000;
    const [showFilters, setShowFilters] = useState(false);
    const [viewMode, setViewMode] = useState("grid"); // 'grid' or 'list'
    const [filters, setFilters] = useState({
        minPrice: "",
        maxPrice: "",
        minRating: "",
        categoryId: "",
    });

    // Get products for this vendor
    const rawVendorProducts = useMemo(() => {
        if (!vendorId) return [];

        const local = getProductsByVendor(vendorId);
        if (!remoteProducts.length) return local;

        const merged = [...remoteProducts];
        local.forEach((item) => {
            const exists = merged.some(
                (p) => String(p.id) === String(item.id)
            );
            if (!exists) merged.push(item);
        });

        return merged;
    }, [vendorId, remoteProducts, catalogVersion]);

    const vendorProducts = useMemo(() => {
        let result = rawVendorProducts;

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

        if (filters.categoryId) {
            result = result.filter(
                (product) => String(product.categoryId) === String(filters.categoryId)
            );
        }

        return result;
    }, [rawVendorProducts, filters]);

    const { displayedItems, hasMore, isLoading, loadMore, loadMoreRef } =
        useInfiniteScroll(vendorProducts, 10, 10);

    const filterButtonRef = useRef(null);

    const handleFilterChange = (name, value) => {
        setFilters({ ...filters, [name]: value });
    };

    const clearFilters = () => {
        setFilters({
            minPrice: "",
            maxPrice: "",
            minRating: "",
            categoryId: "",
        });
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

    useEffect(() => {
        const handleCatalogUpdate = () => setCatalogVersion((prev) => prev + 1);
        window.addEventListener("catalog-cache-updated", handleCatalogUpdate);
        return () => {
            window.removeEventListener("catalog-cache-updated", handleCatalogUpdate);
        };
    }, []);

    useEffect(() => {
        let active = true;
        const fetchVendorData = async () => {
            if (!vendorId) {
                if (active) {
                    setRemoteVendor(null);
                    setRemoteProducts([]);
                    setIsResolvingVendor(false);
                }
                return;
            }

            setIsResolvingVendor(true);
            try {
                const [vendorRes, productsRes] = await Promise.all([
                    api.get(`/vendors/${vendorId}`),
                    api.get(`/vendors/${vendorId}/products`, { params: { page: 1, limit: 100 } }),
                ]);

                if (!active) return;

                const vendorPayload = vendorRes?.data ?? vendorRes;
                const productsPayload = productsRes?.data ?? productsRes;
                const vendorDoc = vendorPayload ? normalizeVendor(vendorPayload) : null;

                if (vendorDoc && vendorDoc.storefrontId?.slug) {
                    navigate(`/store/${vendorDoc.storefrontId.slug}`, { replace: true });
                    return;
                }
                const allProducts = Array.isArray(productsPayload?.products)
                    ? [...productsPayload.products]
                    : [];
                const totalPages = Math.max(1, Number(productsPayload?.pages || 1));
                for (let page = 2; page <= totalPages; page += 1) {
                    const nextRes = await api.get(`/vendors/${vendorId}/products`, {
                        params: { page, limit: 100 },
                    });
                    const nextPayload = nextRes?.data ?? nextRes;
                    if (Array.isArray(nextPayload?.products) && nextPayload.products.length) {
                        allProducts.push(...nextPayload.products);
                    }
                }

                const productList = allProducts.map(normalizeProduct);

                setRemoteVendor(vendorDoc);
                setRemoteProducts(productList);
            } catch {
                if (!active) return;
                setRemoteVendor(null);
                setRemoteProducts([]);
            } finally {
                if (active) setIsResolvingVendor(false);
            }
        };

        fetchVendorData();
        return () => {
            active = false;
        };
    }, [vendorId]);

    if (isResolvingVendor) {
        return (
            <PageTransition>
                <MobileLayout showBottomNav={false} showCartBar={false}>
                    <div className="flex items-center justify-center min-h-[60vh] px-4">
                        <p className="text-gray-600">Loading seller...</p>
                    </div>
                </MobileLayout>
            </PageTransition>
        );
    }

    if (!vendor) {
        return (
            <PageTransition>
                <MobileLayout showBottomNav={false} showCartBar={false}>
                    <div className="flex items-center justify-center min-h-[60vh] px-4">
                        <div className="text-center">
                            <h2 className="text-xl font-bold text-gray-800 mb-4">
                                Seller Not Found
                            </h2>
                            <button
                                onClick={() => navigate("/home")}
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
                <div className="w-full pb-24 lg:pb-12 max-w-7xl mx-auto min-h-screen bg-gray-50">
                    {/* Header */}
                    <div className="bg-white border-b border-gray-200 sticky top-0 z-30">
                        <div className="px-2 md:px-4 py-2 md:py-4">
                            <div className="flex items-center gap-3 mb-4">
                                <button
                                    onClick={() => navigate(-1)}
                                    className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                                >
                                    <FiArrowLeft className="text-xl text-gray-700" />
                                </button>
                                <div className="flex-1">
                                    <h1 className="text-xl font-bold text-gray-800 line-clamp-1">{vendor.storeName || vendor.name}</h1>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="flex items-center bg-gray-100 rounded-lg p-1">
                                        <button
                                            onClick={() => setViewMode("grid")}
                                            className={`p-1.5 rounded transition-colors ${viewMode === "grid"
                                                ? "bg-white text-primary-600 shadow-sm"
                                                : "text-gray-600"
                                                }`}
                                        >
                                            <FiGrid className="text-lg" />
                                        </button>
                                    </div>
                                    <div ref={filterButtonRef} className="relative">
                                        <button
                                            onClick={() => setShowFilters(!showFilters)}
                                            className={`p-2.5 glass-card rounded-xl hover:bg-white/80 transition-colors ${showFilters ? "bg-white/80" : ""
                                                }`}
                                        >
                                            <FiFilter
                                                className={`text-lg transition-colors ${hasActiveFilters ? "text-blue-600" : "text-gray-600"
                                                    }`}
                                            />
                                        </button>
                                        {/* Filter Dropdown */}
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
                                                        className="filter-dropdown absolute right-0 top-full w-56 bg-white rounded-xl shadow-2xl border border-gray-200 z-[10001] overflow-hidden"
                                                        style={{ marginTop: "10px" }}
                                                    >
                                                        {/* Filter Content (Same as Brand.jsx) */}
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
                                                        <div className="max-h-[50vh] overflow-y-auto scrollbar-hide">
                                                            <div className="p-2 space-y-2">
                                                                {/* Category Filter - Image Based */}
                                                                <div>
                                                                    <h4 className="font-semibold text-gray-700 mb-2 text-xs">
                                                                        Category
                                                                    </h4>
                                                                    <div className="grid grid-cols-4 gap-2">
                                                                        <button
                                                                            onClick={() => handleFilterChange("categoryId", "")}
                                                                            className={`flex flex-col items-center gap-1 p-1 rounded-lg border transition-all ${!filters.categoryId ? "border-primary-500 bg-primary-50" : "border-gray-100 hover:bg-gray-50"}`}
                                                                        >
                                                                            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-600">
                                                                                ALL
                                                                            </div>
                                                                            <span className="text-[9px] text-gray-600 font-medium">All</span>
                                                                        </button>
                                                                        {rootCategories.map((cat) => (
                                                                            <button
                                                                                key={cat.id}
                                                                                onClick={() => handleFilterChange("categoryId", cat.id)}
                                                                                className={`flex flex-col items-center gap-1 p-1 rounded-lg border transition-all ${String(filters.categoryId) === String(cat.id) ? "border-primary-500 bg-primary-50" : "border-gray-100 hover:bg-gray-50"}`}
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

                            {/* Vendor Profile Card */}
                            <div className="bg-gray-50 rounded-xl p-3 md:p-4 flex flex-col items-center text-center gap-3">
                                <div className="w-20 h-20 rounded-full bg-white p-1 shadow-sm overflow-hidden">
                                    <LazyImage
                                        src={vendor.storeLogo}
                                        alt={vendor.storeName || vendor.name}
                                        className="w-full h-full object-cover rounded-full"
                                        onError={(e) => {
                                            e.target.src = getPlaceholderImage(80, 80, (vendor.storeName || vendor.name).charAt(0));
                                        }}
                                    />
                                </div>
                                <div>
                                    <div className="flex items-center justify-center gap-1 mb-1">
                                        <h2 className="font-bold text-gray-800 text-lg">{vendor.storeName || vendor.name}</h2>
                                        {vendor.isVerified && <FiCheckCircle className="text-blue-500 text-sm" />}
                                    </div>
                                    <div className="flex items-center justify-center gap-4 text-sm text-gray-600">
                                        <div className="flex items-center gap-1">
                                            <FiStar className="text-yellow-500 fill-yellow-500" />
                                            <span>{vendor.rating} Ratings</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <FiShoppingBag className="text-gray-500" />
                                            <span>{vendorProducts.length} Products</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Products List */}
                    <div className="px-4 py-4 lg:p-6">
                        {vendorProducts.length === 0 ? (
                            <div className="text-center py-12">
                                <div className="text-6xl text-gray-300 mx-auto mb-4">🏪</div>
                                <h3 className="text-xl font-bold text-gray-800 mb-2">
                                    No products found
                                </h3>
                                <p className="text-gray-600">
                                    This seller has no products available at the moment.
                                </p>
                            </div>
                        ) : viewMode === "grid" ? (
                            <>
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-5 gap-3 md:gap-4 lg:gap-6">
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

export default Seller;
