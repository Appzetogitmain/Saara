import { useState, useMemo, useEffect } from "react";
import { useParams, useNavigate, Link, useSearchParams } from "react-router-dom";
import {
  FiStar,
  FiHeart,
  FiShoppingBag,
  FiMinus,
  FiPlus,
  FiArrowLeft,
  FiShare2,
  FiCheckCircle,
  FiTrash2,
  FiChevronRight,
} from "react-icons/fi";
import { motion } from "framer-motion";
import { useCartStore, useUIStore } from "../../../shared/store/useStore";
import { useWishlistStore } from "../../../shared/store/wishlistStore";
import { useReviewsStore } from "../../../shared/store/reviewsStore";
import { useOrderStore } from "../../../shared/store/orderStore";
import { useAuthStore } from "../../../shared/store/authStore";
import {
  getProductById,
  getSimilarProducts,
  getVendorById,
  getBrandById,
} from "../data/catalogData";
import api from "../../../shared/utils/api";
import { formatPrice } from "../../../shared/utils/helpers";
import toast from "react-hot-toast";
import MobileLayout from "../components/Layout/MobileLayout";
import ImageGallery from "../../../shared/components/Product/ImageGallery";
import VariantSelector from "../../../shared/components/Product/VariantSelector";
import ReviewForm from "../../../shared/components/Product/ReviewForm";
import MobileProductCard from "../components/Mobile/MobileProductCard";
import PageTransition from "../../../shared/components/PageTransition";
import Badge from "../../../shared/components/Badge";
import ProductCard from "../../../shared/components/ProductCard";
import { getVariantSignature } from "../../../shared/utils/variant";
import AffiliateBadge from "../../Affiliate/components/AffiliateBadge";

const FlipkartCompactCard = ({ product }) => {
  const navigate = useNavigate();
  return (
    <div 
      onClick={() => navigate(`/product/${product.id}`)}
      className="min-w-[140px] w-[140px] bg-white rounded-xl border border-gray-100 overflow-hidden shrink-0 active:scale-95 transition-transform"
    >
      <div className="relative h-[140px] bg-gray-50 flex items-center justify-center">
        <button className="absolute top-2 right-2 p-1.5 bg-white/80 backdrop-blur-md rounded-full shadow-sm z-10">
          <FiHeart className="text-xs text-gray-400" />
        </button>
        <img src={product.image} className="w-full h-full object-cover" alt={product.name} />
      </div>
      
      <div className="p-2 space-y-1">
        <div className="inline-block bg-blue-50 text-blue-600 text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider">
          BESTSELLER
        </div>
        <div>
          <div className="text-[10px] font-bold text-gray-400 uppercase leading-none">{product.brandName || "Brand"}</div>
          <div className="text-[11px] font-bold text-gray-800 line-clamp-1 leading-tight">{product.name}</div>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs font-black text-gray-900">{formatPrice(product.price)}</span>
          {product.originalPrice && (
            <>
              <span className="text-[9px] text-gray-400 line-through font-medium">{formatPrice(product.originalPrice)}</span>
              <span className="text-[9px] text-green-600 font-bold">
                {Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)}% Off
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1 pt-0.5">
          <div className="flex items-center gap-0.5">
            {[...Array(5)].map((_, i) => (
              <FiStar 
                key={i} 
                className={`text-[9px] ${i < Math.floor(product.rating || 4.5) ? 'text-gray-500 fill-gray-500' : 'text-gray-200'}`} 
              />
            ))}
          </div>
          <span className="text-[9px] text-gray-400 font-bold">({product.reviewCount || "47"})</span>
        </div>
      </div>
    </div>
  );
};

const DeliveryBlock = () => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-start gap-3">
          <div className="w-5 h-5 rounded-full border border-green-500 flex items-center justify-center mt-0.5">
            <svg className="w-3.5 h-3.5 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
          <div>
            <div className="text-sm font-bold text-slate-800">Delivery by Wed, 26 Apr</div>
            <div className="text-xs text-gray-400 font-medium">638504 <span className="text-gray-300">(Anthiyour)</span></div>
          </div>
        </div>
        <button className="px-4 py-2 border border-gray-100 rounded-lg text-sm text-pink-500 font-bold shadow-sm">Change</button>
      </div>

      <div className="flex gap-4 pt-4 border-t border-gray-50">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <div className="p-2 bg-gray-50 rounded-lg">
            <svg className="w-4 h-4 text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <path d="M16 10a4 4 0 0 1-8 0"></path>
            </svg>
          </div>
          <span>Free delivery above ₹499</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <div className="p-2 bg-gray-50 rounded-lg">
            <svg className="w-4 h-4 text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="5" width="20" height="14" rx="2" />
              <line x1="2" y1="10" x2="22" y2="10" />
            </svg>
          </div>
          <span>COD on orders above ₹499</span>
        </div>
      </div>
    </div>
  );
};

const resolveVariantPrice = (product, selectedVariant) => {
  const basePrice = Number(product?.price) || 0;
  if (!selectedVariant || !product?.variants?.prices) return basePrice;

  const entries =
    product.variants.prices instanceof Map
      ? Array.from(product.variants.prices.entries())
      : Object.entries(product.variants.prices || {});
  const dynamicKey = getVariantSignature(selectedVariant || {});
  if (dynamicKey) {
    const direct = entries.find(([key]) => String(key).trim() === dynamicKey);
    if (direct) {
      const parsed = Number(direct[1]);
      if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
    const normalized = entries.find(
      ([key]) => String(key).trim().toLowerCase() === dynamicKey.toLowerCase()
    );
    if (normalized) {
      const parsed = Number(normalized[1]);
      if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
  }

  const size = String(selectedVariant.size || "").trim().toLowerCase();
  const color = String(selectedVariant.color || "").trim().toLowerCase();

  const candidates = [
    `${size}|${color}`,
    `${size}-${color}`,
    `${size}_${color}`,
    `${size}:${color}`,
    size && !color ? size : null,
    color && !size ? color : null,
  ].filter(Boolean);

  for (const candidate of candidates) {
    const exact = entries.find(([key]) => String(key).trim() === candidate);
    if (exact) {
      const parsed = Number(exact[1]);
      if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
    const normalized = entries.find(
      ([key]) => String(key).trim().toLowerCase() === candidate
    );
    if (normalized) {
      const parsed = Number(normalized[1]);
      if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
  }

  return basePrice;
};

const resolveVariantStock = (product, selectedVariant) => {
  const baseStock = Number(product?.stockQuantity) || 0;
  if (!selectedVariant || !product?.variants?.stockMap) return baseStock;

  const entries =
    product.variants.stockMap instanceof Map
      ? Array.from(product.variants.stockMap.entries())
      : Object.entries(product.variants.stockMap || {});

  const dynamicKey = getVariantSignature(selectedVariant || {});
  if (dynamicKey) {
    const direct = entries.find(([key]) => String(key).trim() === dynamicKey);
    if (direct) {
      const parsed = Number(direct[1]);
      if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
    const normalized = entries.find(
      ([key]) => String(key).trim().toLowerCase() === dynamicKey.toLowerCase()
    );
    if (normalized) {
      const parsed = Number(normalized[1]);
      if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
  }

  const size = String(selectedVariant.size || "").trim().toLowerCase();
  const color = String(selectedVariant.color || "").trim().toLowerCase();

  const candidates = [
    `${size}|${color}`,
    `${size}-${color}`,
    `${size}_${color}`,
    `${size}:${color}`,
    size && !color ? size : null,
    color && !size ? color : null,
  ].filter(Boolean);

  for (const candidate of candidates) {
    const exact = entries.find(([key]) => String(key).trim() === candidate);
    if (exact) {
      const parsed = Number(exact[1]);
      if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
    const normalized = entries.find(
      ([key]) => String(key).trim().toLowerCase() === candidate
    );
    if (normalized) {
      const parsed = Number(normalized[1]);
      if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
  }

  return baseStock;
};

const isMongoId = (value) => /^[a-fA-F0-9]{24}$/.test(String(value || ""));
const normalizeProduct = (raw) => {
  if (!raw) return null;

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

  const id = String(raw?.id || raw?._id || "").trim();
  if (!id) return null;

  const vendorId = String(vendorObj?._id || vendorObj?.id || raw?.vendorId || "").trim();
  const brandId = String(brandObj?._id || brandObj?.id || raw?.brandId || "").trim();
  const categoryId = String(categoryObj?._id || categoryObj?.id || raw?.categoryId || "").trim();
  const image = raw?.image || raw?.images?.[0] || "";
  const images = Array.isArray(raw?.images) ? raw.images.filter(Boolean) : image ? [image] : [];

  return {
    ...raw,
    id,
    _id: id,
    vendorId,
    brandId,
    categoryId,
    image,
    images,
    price: Number(raw?.price) || 0,
    originalPrice:
      raw?.originalPrice !== undefined && raw?.originalPrice !== null
        ? Number(raw.originalPrice)
        : undefined,
    rating: Number(raw?.rating) || 0,
    reviewCount: Number(raw?.reviewCount) || 0,
    stockQuantity: Number(raw?.stockQuantity) || 0,
    vendorName: raw?.vendorName || vendorObj?.storeName || vendorObj?.name || "",
    brandName: raw?.brandName || brandObj?.name || "",
    categoryName: raw?.categoryName || categoryObj?.name || "",
    vendor: vendorObj
      ? {
        ...vendorObj,
        id: String(vendorObj?.id || vendorObj?._id || vendorId),
      }
      : null,
    brand: brandObj
      ? {
        ...brandObj,
        id: String(brandObj?.id || brandObj?._id || brandId),
      }
      : null,
    stock:
      raw?.stock ||
      (Number(raw?.stockQuantity) > 0 ? "in_stock" : "out_of_stock"),
    description: String(raw?.description || "").trim(),
  };
};

const MobileProductDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const localFallbackProduct = useMemo(() => normalizeProduct(getProductById(id)), [id]);
  const [product, setProduct] = useState(localFallbackProduct);
  const [similarProducts, setSimilarProducts] = useState([]);
  const [isLoadingProduct, setIsLoadingProduct] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [activeTab, setActiveTab] = useState("Description");
  const [isExpanded, setIsExpanded] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);

  const { items, addItem, removeItem } = useCartStore();
  const { triggerCartAnimation, toggleCart } = useUIStore();
  const {
    addItem: addToWishlist,
    removeItem: removeFromWishlist,
    isInWishlist,
  } = useWishlistStore();
  const { reviews, reviewsMeta, fetchReviews, sortReviews, addReview, updateReview } = useReviewsStore();
  const { orders, fetchUserOrders, getAllOrders } = useOrderStore();
  const { user, isAuthenticated } = useAuthStore();
  const vendor = useMemo(() => {
    if (!product) return null;
    if (product.vendor?.id) return product.vendor;
    return getVendorById(product.vendorId);
  }, [product]);
  const storeLink = useMemo(() => {
    const popVendor = product?.vendorId;
    if (popVendor && popVendor.storefrontId?.slug) {
      return `/store/${popVendor.storefrontId.slug}`;
    }
    const rawVendor = product?.vendor || product?.vendorId;
    if (rawVendor && rawVendor.storefrontId?.slug) {
      return `/store/${rawVendor.storefrontId.slug}`;
    }
    return vendor ? `/seller/${vendor.id || vendor._id}` : "#";
  }, [product, vendor]);

  const brand = useMemo(() => {
    if (!product) return null;
    if (product.brand?.id) return product.brand;
    return getBrandById(product.brandId);
  }, [product]);

  const isFavorite = product ? isInWishlist(product.id) : false;
  const selectedVariantSignature = getVariantSignature(selectedVariant || {});
  const isInCart = product
    ? items.some(
      (item) =>
        String(item.id) === String(product.id) &&
        getVariantSignature(item.variant || {}) === selectedVariantSignature
    )
    : false;
  const [showReviewForm, setShowReviewForm] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      fetchUserOrders().catch(() => null);
    }
  }, [isAuthenticated, fetchUserOrders]);

  const hasPurchasedAndDelivered = useMemo(() => {
    if (!isAuthenticated || !orders || !product?.id) return false;
    return orders.some(
      (order) =>
        order.status === 'delivered' &&
        order.items.some((item) => String(item.productId || item.id) === String(product.id))
    );
  }, [orders, product?.id, isAuthenticated]);

  const productReviews = useMemo(() => {
    if (!product?.id) return [];
    return reviews[product.id] || [];
  }, [reviews, product?.id]);

  const userReview = useMemo(() => {
    if (!isAuthenticated || !user) return null;
    return productReviews.find(
      (r) => String(r.userId?._id || r.userId) === String(user.id)
    );
  }, [productReviews, user, isAuthenticated]);

  const meta = useMemo(() => {
    if (!product?.id) {
      return {
        averageRating: 0,
        totalReviews: 0,
        distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        images: []
      };
    }
    return reviewsMeta[product.id] || {
      averageRating: product.rating || 0,
      totalReviews: product.reviewCount || 0,
      distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      images: []
    };
  }, [reviewsMeta, product]);

  const handleReviewSubmit = async (reviewData) => {
    if (!product?.id) return false;
    const matchingOrder = orders.find(
      (order) =>
        order.status === 'delivered' &&
        order.items.some((item) => String(item.productId || item.id) === String(product.id))
    );
    const orderId = matchingOrder?._id || matchingOrder?.id;

    let result;
    if (userReview) {
      result = await updateReview(product.id, {
        ...reviewData,
        orderId
      });
    } else {
      result = await addReview(product.id, {
        ...reviewData,
        orderId
      });
    }

    if (result !== false) {
      setShowReviewForm(false);
    }
    return result;
  };

  useEffect(() => {
    let active = true;
    setIsLoadingProduct(true);

    const loadProductDetail = async () => {
      try {
        const [detailRes, similarRes] = await Promise.allSettled([
          api.get(`/products/${id}`),
          api.get(`/similar/${id}`),
        ]);

        const detailPayload =
          detailRes.status === "fulfilled"
            ? detailRes.value?.data ?? detailRes.value
            : null;
        const resolvedProduct = normalizeProduct(detailPayload) || localFallbackProduct;

        const similarPayload =
          similarRes.status === "fulfilled"
            ? similarRes.value?.data ?? similarRes.value
            : null;
        const resolvedSimilar = Array.isArray(similarPayload)
          ? similarPayload
            .map(normalizeProduct)
            .filter(
              (item) => item?.id && String(item.id) !== String(resolvedProduct?.id || "")
            )
            .slice(0, 5)
          : [];

        if (!active) return;

        setProduct(resolvedProduct);
        if (resolvedProduct?.id && isAuthenticated) {
          api.post("/user/recently-viewed", { productId: resolvedProduct.id }).catch((err) => console.error("Error logging product view:", err));
        }

        if (resolvedSimilar.length > 0) {
          setSimilarProducts(resolvedSimilar);
        } else if (resolvedProduct?.id) {
          setSimilarProducts(getSimilarProducts(resolvedProduct.id, 5));
        } else {
          setSimilarProducts([]);
        }
      } catch {
        if (!active) return;
        setProduct(localFallbackProduct);
        setSimilarProducts(
          localFallbackProduct?.id ? getSimilarProducts(localFallbackProduct.id, 5) : []
        );
      } finally {
        if (active) setIsLoadingProduct(false);
      }
    };

    loadProductDetail();
    return () => {
      active = false;
    };
  }, [id, localFallbackProduct]);

  useEffect(() => {
    if (!product) return;
    const urlColor = searchParams.get("variantColor");
    const urlSize = searchParams.get("variantSize");

    if (urlColor || urlSize) {
      const foundVariant = {};
      if (urlSize) foundVariant.size = urlSize;
      if (urlColor) foundVariant.color = urlColor;

      setSelectedVariant({
        ...(product.variants?.defaultSelection || product.variants?.defaultVariant || {}),
        ...foundVariant
      });
      return;
    }

    if (product?.variants?.defaultSelection && typeof product.variants.defaultSelection === "object") {
      setSelectedVariant(product.variants.defaultSelection);
      return;
    }
    if (product?.variants?.defaultVariant) {
      setSelectedVariant(product.variants.defaultVariant);
      return;
    }
    setSelectedVariant({});
  }, [product, searchParams]);

  useEffect(() => {
    setIsExpanded(false);
  }, [activeTab]);

  useEffect(() => {
    if (product?.id) {
      fetchReviews(product.id, { sort: "newest", limit: 50 });
    }
  }, [product?.id, fetchReviews]);

  const handleAddToCart = () => {
    if (!product) return;
    if (product.stock === "out_of_stock") {
      toast.error("Product is out of stock");
      return;
    }
    const attributeAxes = Array.isArray(product?.variants?.attributes)
      ? product.variants.attributes.filter((attr) => Array.isArray(attr?.values) && attr.values.length > 0)
      : [];
    const hasDynamicAxes = attributeAxes.length > 0;
    const hasSizeVariants = Array.isArray(product?.variants?.sizes) && product.variants.sizes.length > 0;
    const hasColorVariants = Array.isArray(product?.variants?.colors) && product.variants.colors.length > 0;
    const hasMaterialVariants = Array.isArray(product?.variants?.materials) && product.variants.materials.length > 0;

    const isMissingDynamicAxis = hasDynamicAxes
      ? attributeAxes.some((attr) => {
        const slug = String(attr.name || "").trim().toLowerCase().replace(/\s+/g, "_");
        const val = selectedVariant?.[attr.name] || selectedVariant?.[slug];
        return !String(val || "").trim();
      })
      : false;

    const selectedSize = String(selectedVariant?.size || "").trim();
    const selectedColor = String(selectedVariant?.color || "").trim();
    const selectedMaterial = String(selectedVariant?.material || "").trim();

    const isMissingStandardAxis = 
      (hasSizeVariants && !selectedSize) || 
      (hasColorVariants && !selectedColor) || 
      (hasMaterialVariants && !selectedMaterial);

    if (isMissingDynamicAxis || isMissingStandardAxis) {
      toast.error("Please select required variant options");
      return;
    }

    const finalPrice = resolveVariantPrice(product, selectedVariant);
    const effectiveStock = resolveVariantStock(product, selectedVariant);
    if (effectiveStock <= 0) {
      toast.error("Selected variant is out of stock");
      return;
    }
    if (quantity > effectiveStock) {
      toast.error(`Only ${effectiveStock} item(s) available for selected variant`);
      return;
    }

    if (isInCart) {
      toggleCart();
      return;
    }

    const addedToCart = addItem({
      id: product.id,
      name: product.name,
      price: finalPrice,
      originalPrice: product.originalPrice,
      image: product.image,
      quantity: quantity,
      variant: selectedVariant,
      stockQuantity: effectiveStock,
      vendorId: product.vendorId,
      vendorName: vendor?.storeName || vendor?.name || product.vendorName,
    });
    if (!addedToCart) return;
    triggerCartAnimation();
    toast.success("Added to cart!");
  };

  const handleRemoveFromCart = () => {
    if (!product) return;
    removeItem(product.id, selectedVariant || {});
    toast.success("Removed from cart!");
  };

  const handleBuyNow = () => {
    if (!product) return;
    
    // Add to cart first
    handleAddToCart();
    
    // If user is authenticated, go to checkout. 
    // If not, handleAddToCart already added it, so just go to login/register or checkout.
    // Actually, checkout route is protected, so it will redirect to login automatically.
    navigate("/checkout");
  };

  const handleFavorite = () => {
    if (!product) return;
    if (isFavorite) {
      removeFromWishlist(product.id);
      toast.success("Removed from wishlist");
    } else {
      const addedToWishlist = addToWishlist({
        id: product.id,
        name: product.name,
        price: product.price,
        image: product.image,
      });
      if (addedToWishlist) {
        toast.success("Added to wishlist");
      }
    }
  };

  const handleQuantityChange = (change) => {
    const newQuantity = quantity + change;
    const maxStock = resolveVariantStock(product, selectedVariant);
    if (change > 0 && newQuantity > (maxStock || 10)) {
      toast.error(`Only ${maxStock || 10} item(s) available in stock`);
      return;
    }
    if (newQuantity >= 1) {
      setQuantity(newQuantity);
    }
  };

  const productImages = useMemo(() => {
    if (!product) return [];
    const selectedVariantKey = getVariantSignature(selectedVariant || {});
    const variantImage = String(
      product?.variants?.imageMap?.[selectedVariantKey] ||
      product?.variants?.imageMap?.get?.(selectedVariantKey) ||
      ""
    ).trim();
    const images =
      Array.isArray(product.images) && product.images.length > 0
        ? product.images.filter(Boolean)
        : product.image
          ? [product.image]
          : [];
    if (variantImage) {
      return [variantImage, ...images.filter((img) => img !== variantImage)];
    }
    return images;
  }, [product, selectedVariant]);

  const currentPrice = useMemo(() => {
    return resolveVariantPrice(product, selectedVariant);
  }, [product, selectedVariant]);

  const selectedAvailableStock = useMemo(() => {
    return resolveVariantStock(product, selectedVariant);
  }, [product, selectedVariant]);

  const productFaqs = useMemo(() => {
    if (!Array.isArray(product?.faqs)) return [];
    return product.faqs
      .map((faq) => ({
        question: String(faq?.question || "").trim(),
        answer: String(faq?.answer || "").trim(),
      }))
      .filter((faq) => faq.question && faq.answer);
  }, [product?.faqs]);

  const eligibleDeliveredOrderId = useMemo(() => {
    if (!isAuthenticated || !user?.id || !isMongoId(product?.id)) return null;
    const userOrders = getAllOrders(user.id) || [];
    const eligibleOrder = userOrders.find((order) => {
      if (String(order?.status || "").toLowerCase() !== "delivered") return false;
      const items = Array.isArray(order?.items) ? order.items : [];
      return items.some(
        (item) => String(item?.productId || item?.id || "") === String(product.id)
      );
    });
    return eligibleOrder?._id || null;
  }, [isAuthenticated, user?.id, product?.id, getAllOrders]);

  const handleSubmitReview = async (reviewData) => {
    if (!eligibleDeliveredOrderId) {
      toast.error("You can review only after this product is delivered");
      return false;
    }

    const ok = await addReview(product.id, {
      ...reviewData,
      orderId: eligibleDeliveredOrderId,
    });
    if (!ok) {
      toast.error("Unable to submit review");
      return false;
    }

    await fetchReviews(product.id, { sort: "newest", limit: 50 });
    return true;
  };

  const productFeatures = useMemo(() => {
    if (Array.isArray(product?.features) && product.features.length > 0) return product.features;
    // Professional fallback features to satisfy UI requirements
    return [
      { id: 1, label: "Premium Build", desc: "Expertly crafted using high-grade, durable materials." },
      { id: 2, label: "Modern Design", desc: "Sleek and minimalist aesthetic that suits any style." },
      { id: 3, label: "Quality Tested", desc: "Undergoes rigorous inspection for maximum reliability." },
      { id: 4, label: "Skin Friendly", desc: "Hypoallergenic components designed for daily comfort." }
    ];
  }, [product]);

  if (!product) {
    return (
      <PageTransition>
        <MobileLayout showBottomNav={false} showCartBar={false}>
          <div className="flex items-center justify-center min-h-[60vh] px-4">
            <div className="text-center">
              {isLoadingProduct ? (
                <h2 className="text-xl font-bold text-gray-800 mb-4">Loading product...</h2>
              ) : (
                <>
                  <h2 className="text-xl font-bold text-gray-800 mb-4">
                    Product Not Found
                  </h2>
                  <button
                    onClick={() => navigate("/home")}
                    className="gradient-green text-white px-6 py-3 rounded-xl font-semibold">
                    Go Back Home
                  </button>
                </>
              )}
            </div>
          </div>
        </MobileLayout>
      </PageTransition>
    );
  }

  return (
    <>
      <PageTransition disabled={true}>
        <MobileLayout showBottomNav={false} showCartBar={false} showHeader={false}>
          <div className="w-full min-h-screen bg-gray-50 flex flex-col pb-24">
            {/* Mobile Overlay Header */}
            <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-4 lg:hidden pointer-events-none">
              <button
                onClick={() => navigate(-1)}
                className="w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-lg pointer-events-auto"
              >
                <FiArrowLeft className="text-2xl text-gray-500" />
              </button>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    if (navigator.share) {
                      navigator.share({
                        title: product.name,
                        text: `Check out ${product.name}`,
                        url: window.location.href,
                      });
                    } else {
                      navigator.clipboard.writeText(window.location.href);
                      toast.success("Link copied to clipboard");
                    }
                  }}
                  className="w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-lg pointer-events-auto"
                >
                  <FiShare2 className="text-2xl text-gray-500" />
                </button>
                <button
                  onClick={handleFavorite}
                  className="w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-lg pointer-events-auto"
                >
                  <FiHeart className={`text-2xl ${isFavorite ? "text-red-500 fill-current" : "text-gray-500"}`} />
                </button>
              </div>
            </div>

            <div className="flex flex-col lg:flex-row lg:max-w-[1440px] lg:mx-auto lg:gap-12 lg:p-8 lg:items-start">
              {/* Left Column: Sticky Image Gallery on Desktop, Swipeable on Mobile */}
              <div className="w-full lg:w-[50%] relative bg-white lg:sticky lg:top-[120px] lg:rounded-3xl lg:p-6 lg:border lg:border-gray-100 lg:shadow-sm flex flex-col gap-4">
                <div className="relative w-full aspect-[3/4] lg:aspect-[3/4] lg:rounded-2xl overflow-hidden">
                  <ImageGallery 
                    images={productImages} 
                    productName={product.name} 
                    externalIndex={galleryIndex}
                    onIndexChange={setGalleryIndex} 
                  />
                  {/* Similar Button Overlay (Mobile Only) */}
                  <div className="absolute bottom-4 right-4 lg:hidden">
                    <button className="w-14 h-14 bg-white rounded-full shadow-lg flex flex-col items-center justify-center border border-gray-50 p-2">
                      <svg className="w-5 h-5 text-slate-700 mb-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="8" width="12" height="12" rx="2"></rect>
                        <path d="M8 3h11a2 2 0 0 1 2 2v11"></path>
                      </svg>
                      <span className="text-[9px] font-black text-slate-700 uppercase tracking-tight">Similar</span>
                    </button>
                  </div>
                </div>

                {/* Angle Gallery Thumbnails (Visible underneath the main image on both mobile and desktop) */}
                {productImages.length > 1 && (
                  <div className="bg-white py-2 border-t border-gray-50 mt-2">
                    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                      {productImages.map((img, idx) => (
                        <button
                          key={idx}
                          onClick={() => setGalleryIndex(idx)}
                          className={`relative min-w-[60px] w-[60px] aspect-square rounded-xl overflow-hidden border-2 transition-all duration-300 shrink-0 ${
                            galleryIndex === idx ? "border-emerald-500 shadow-md scale-95" : "border-gray-100 bg-gray-50"
                          }`}
                        >
                          <img src={img} className="w-full h-full object-cover" alt={`Angle ${idx + 1}`} />
                          {galleryIndex === idx && (
                            <div className="absolute inset-0 bg-emerald-500/10 flex items-center justify-center">
                              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Product Info & Actions (Scrolls on Desktop) */}
              <div className="w-full lg:w-[46%] flex flex-col gap-4 lg:gap-6">
                {/* Main Product Info Wrapper (Card on Desktop, list style on Mobile) */}
                <div className="bg-white border-b border-gray-100 lg:border lg:border-gray-100 lg:rounded-3xl lg:p-6 lg:shadow-sm flex flex-col lg:gap-6">
                  {/* Seller Bar */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 lg:bg-transparent lg:border-none lg:px-0 lg:py-0 lg:border-b-0">
                    <div className="flex items-center flex-wrap gap-2 text-xs">
                      <span className="text-gray-500 font-semibold">Sold by:</span>
                      <Link to={storeLink} className="flex items-center gap-1 font-bold text-[#024d3e] hover:underline">
                        <span>{vendor?.storeName || vendor?.name || product?.vendorName || "ecom storess"}</span>
                        {(vendor?.isVerified || (product?.vendorId && product.vendorId.isVerified)) && (
                          <div className="w-3.5 h-3.5 bg-blue-500 rounded-full flex items-center justify-center">
                            <svg className="w-2 h-2 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                          </div>
                        )}
                      </Link>
                      <div className="flex items-center gap-0.5 text-[10px] bg-yellow-50 text-yellow-700 px-1.5 py-0.5 rounded-full font-bold">
                        <FiStar className="fill-current text-[8px]" />
                        <span>{vendor?.rating || 4.5}</span>
                      </div>
                      <span className="text-gray-300">|</span>
                      <Link to={storeLink} className="text-xs font-black text-pink-500 hover:text-pink-600 transition-colors uppercase tracking-wider flex items-center gap-0.5">
                        Visit Store <span>&rarr;</span>
                      </Link>
                    </div>
                  </div>

                  <div className="px-4 py-4 space-y-4 lg:px-0 lg:py-0 lg:space-y-6">
                    <div>
                      <h1 className="text-base font-bold text-slate-900 uppercase mb-0.5 leading-tight lg:text-xl">
                        {product.name}
                      </h1>
                      <div className="flex items-center gap-1.5 mb-2">
                        <div className="flex text-gray-400">
                          {[...Array(5)].map((_, i) => (
                            <FiStar key={i} className={`text-xs ${i < Math.floor(product.rating || 0) ? 'fill-current text-gray-500' : ''}`} />
                          ))}
                        </div>
                        <span className="text-xs text-gray-400">({product.reviewCount || 0})</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <div className="text-2xl font-extrabold text-gray-900 tracking-tight lg:text-3xl">
                        {formatPrice(currentPrice)}
                      </div>
                      {product.originalPrice && product.originalPrice > currentPrice && (
                        <>
                          <div className="text-xs text-slate-400 line-through font-medium lg:text-sm">
                            {formatPrice(product.originalPrice)}
                          </div>
                          <div className="text-xs font-extrabold text-emerald-600 bg-emerald-50 border border-emerald-200/60 px-2 py-0.5 rounded-md shadow-sm">
                            {Math.round(
                              ((product.originalPrice - currentPrice) /
                                product.originalPrice) *
                              100
                            )}% OFF
                          </div>
                        </>
                      )}
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-sm text-slate-500 font-medium">Brand:</span>
                      <span className="text-sm font-bold text-gray-900 leading-none">
                        {brand?.name || product.brandName || "Gucci"}
                      </span>
                    </div>

                    {/* Variants */}
                    {product.variants && (
                      <div className="pt-2">
                        <VariantSelector
                          variants={product.variants}
                          onVariantChange={setSelectedVariant}
                          currentPrice={product.price}
                          selectedVariant={selectedVariant}
                        />
                      </div>
                    )}

                    {/* Quantity (Inline details for both Mobile and Desktop) */}
                    <div className="flex items-center justify-between pt-2">
                      <div className="text-sm font-medium text-slate-700">Quantity:</div>
                      <div className="flex-1 flex items-center justify-between ml-6">
                        <div className="flex items-center gap-4">
                          <button
                            onClick={() => handleQuantityChange(-1)}
                            className="w-8 h-8 border border-slate-200 rounded-full flex items-center justify-center text-slate-500 text-base shadow-sm hover:bg-slate-50 transition-colors"
                          >
                            <FiMinus />
                          </button>
                          <span className="text-lg font-bold text-slate-800">{quantity}</span>
                          <button
                            onClick={() => handleQuantityChange(1)}
                            className="w-8 h-8 border border-slate-200 rounded-full flex items-center justify-center text-slate-800 text-base shadow-sm hover:bg-slate-50 transition-colors"
                          >
                            <FiPlus />
                          </button>
                        </div>
                        <span className="text-slate-400 text-[11px] text-right leading-tight max-w-[72px]">({selectedAvailableStock} available)</span>
                    </div>
                  </div>

                  {/* Inline Buy/Cart Actions for Desktop only */}
                  <div className="hidden lg:flex items-center gap-4 pt-4 border-t border-slate-100">
                    <button
                      onClick={isInCart ? toggleCart : handleAddToCart}
                      disabled={product.stock === "out_of_stock"}
                      className={`flex-1 h-12 rounded-2xl font-bold text-sm tracking-wide flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-95 shadow-md ${
                        product.stock === "out_of_stock"
                          ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                          : "bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white shadow-primary-500/20"
                      }`}
                    >
                      <FiShoppingBag className="text-base" />
                      {isInCart ? "Go to Cart" : "Add to Cart"}
                    </button>
                    <button
                      onClick={handleBuyNow}
                      disabled={product.stock === "out_of_stock"}
                      className={`flex-1 h-12 rounded-2xl font-bold text-sm tracking-wide flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-95 shadow-md ${
                        product.stock === "out_of_stock"
                          ? "bg-slate-100 text-slate-300 cursor-not-allowed"
                          : "bg-slate-900 hover:bg-slate-950 text-white"
                      }`}
                    >
                      Buy Now
                    </button>
                  </div>
                </div>
              </div>

                {/* Delivery Section (Visible as a card on desktop) */}
                <div className="mt-4 bg-white px-4 py-4 space-y-4 lg:border lg:border-gray-100 lg:rounded-3xl lg:p-6 lg:shadow-sm lg:mt-0">
                  <DeliveryBlock />
                </div>

                {/* Product Details Section */}
                <div className="mt-4 bg-white border-t border-gray-50 lg:border lg:border-gray-100 lg:rounded-3xl lg:p-6 lg:shadow-sm lg:border-t-0 lg:mt-0">
                  <div className="px-4 py-4">
                    <h3 className="text-lg font-bold text-slate-800">Product Details</h3>
                  </div>
                                  {/* Tabs */}
                  <div className="flex items-center border-b border-gray-100 px-4">
                    {["Description"].map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-4 py-3 text-sm transition-all duration-200 ${activeTab === tab
                            ? "text-pink-500 font-bold border-b-2 border-pink-500"
                            : "text-slate-500 font-medium"
                          }`}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>

                  <div className="px-6 py-6 min-h-[160px]">
                    {activeTab === "Description" && (
                      <div className="space-y-4">
                        <p className="text-xs text-teal-900 font-medium leading-relaxed">
                          {product.description || "40+ years experience. Fugiat culpa deserunt labore ut occaecat eu velit cupidatat et aliqua officia."}
                        </p>

                        <motion.div
                          initial={false}
                          animate={{ height: isExpanded ? "auto" : 0, opacity: isExpanded ? 1 : 0 }}
                          className="overflow-hidden space-y-6"
                        >
                          {/* Expanded Images */}
                          <div className="grid grid-cols-2 gap-2 pt-2">
                            {productImages.slice(1, 5).map((img, idx) => (
                              <div key={idx} className="aspect-square rounded-xl bg-gray-50 overflow-hidden border border-gray-100">
                                <img src={img} alt={`Feature ${idx}`} className="w-full h-full object-cover" />
                              </div>
                            ))}
                          </div>

                          {/* Features List */}
                          <div className="space-y-4 border-t border-gray-50 pt-6">
                            <h4 className="text-sm font-bold text-slate-800 tracking-wider">Features & Highlights</h4>
                            <div className="grid grid-cols-1 gap-4">
                              {productFeatures.map((feature) => (
                                <div key={feature.id} className="flex gap-3">
                                  <div className="w-1.5 h-1.5 rounded-full bg-pink-500 mt-1.5 shrink-0" />
                                  <div>
                                    <div className="text-[11px] font-semibold text-slate-900">{feature.label}</div>
                                    <div className="text-[10px] text-slate-500 font-medium leading-tight mt-0.5">{feature.desc}</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </motion.div>
                      </div>
                    )}

                    <div className="flex items-center justify-center mt-4">
                      <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        className="flex items-center gap-1 text-pink-500 font-bold text-sm"
                      >
                        {isExpanded ? "Read Less" : "Read More"}
                        {isExpanded ? <FiMinus className="text-xs" /> : <FiPlus className="text-xs" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Policy Links Section */}
                <div className="mt-4 bg-white border-y border-gray-50 lg:border lg:border-gray-100 lg:rounded-3xl lg:p-6 lg:shadow-sm lg:border-y-0 lg:mt-0">
                  {[
                    { title: "Seller Policy", path: "/policy/seller-terms" },
                    { title: "Return Policy", path: "/policy/refund-policy" },
                    { title: "Support Policy", path: "/policy/faq" }
                  ].map((item, idx) => (
                    <Link
                      key={idx}
                      to={item.path}
                      className={`flex items-center justify-between px-6 py-5 ${idx !== 0 ? 'border-t border-gray-50' : ''}`}
                    >
                      <span className="text-sm font-bold text-[#024d3e] tracking-tight">{item.title}</span>
                      <FiChevronRight className="text-gray-400 text-lg" />
                    </Link>
                  ))}
                </div>

              </div>
            </div>

            {/* Recommendations Section (Full Screen Width on Desktop) */}
            <div className="w-full lg:max-w-[1440px] lg:mx-auto px-0 lg:px-8 mt-6 flex flex-col gap-6">
              {/* Ratings & Reviews Section */}
              <div className="bg-white lg:border lg:border-gray-100 lg:rounded-3xl lg:p-6 lg:shadow-sm lg:mt-0">
                <div className="px-4 py-6 border-b border-gray-50">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold text-slate-800">Ratings & Reviews</h3>
                    {hasPurchasedAndDelivered ? (
                      <div className="flex flex-col items-end gap-1">
                        {userReview && (
                          <span className="text-[10px] text-green-600 font-bold uppercase tracking-wider flex items-center gap-1">
                            ✔ You reviewed this product
                          </span>
                        )}
                        <button 
                          onClick={() => setShowReviewForm(!showReviewForm)}
                          className="px-6 py-2 border border-[#024d3e] hover:bg-slate-50 rounded-lg text-sm text-[#024d3e] font-black shadow-sm transition-all"
                        >
                          {userReview ? "Edit Review" : "Rate Product"}
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400 font-bold max-w-[200px] text-right">
                        You can rate this product after delivery.
                      </span>
                    )}
                  </div>

                  {/* Review input form display toggle */}
                  {showReviewForm && (
                    <div className="mb-6">
                      <ReviewForm 
                        productId={product.id} 
                        initialReview={userReview} 
                        onSubmit={handleReviewSubmit} 
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                    <div className="flex items-end gap-4">
                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-black text-slate-850 font-mono">{meta.averageRating || "0.0"}</span>
                        <span className="text-xl text-gray-400 font-medium">/5</span>
                      </div>
                      <div className="pb-1">
                        <div className="text-sm font-black text-slate-800">Overall Rating</div>
                        <div className="text-xs text-gray-400 font-semibold">{meta.totalReviews || "0"} reviews</div>
                      </div>
                    </div>

                    {/* Star Distribution percentages */}
                    <div className="space-y-1.5">
                      {[5, 4, 3, 2, 1].map((stars) => {
                        const count = meta.distribution?.[stars] || 0;
                        const pct = meta.totalReviews > 0 ? Math.round((count / meta.totalReviews) * 100) : 0;
                        return (
                          <div key={stars} className="flex items-center gap-3 text-[11px] text-slate-650 font-semibold">
                            <span className="w-8 font-black flex items-center gap-0.5 justify-end">
                              {stars} <FiStar className="text-[10px] text-yellow-400 fill-yellow-400" />
                            </span>
                            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full bg-yellow-400 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="w-16 text-slate-400 font-mono text-right">{pct}% ({count})</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Review Images */}
                  {Array.isArray(meta.images) && meta.images.length > 0 && (
                    <div className="mt-6">
                      <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Product Photos from Reviews</h4>
                      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                        {meta.images.map((imgUrl, idx) => (
                          <div key={idx} className="min-w-[80px] w-20 h-20 rounded-xl bg-gray-50 overflow-hidden shrink-0 shadow-sm border border-gray-100">
                            <img src={imgUrl} alt="Review attachment" className="w-full h-full object-cover" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Individual Review list */}
                <div className="divide-y divide-gray-100">
                  {productReviews.length > 0 ? (
                    productReviews.map((rev, revIdx) => (
                      <div key={rev.id || rev._id || revIdx} className="px-4 py-6 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-700 text-xs font-bold uppercase border border-slate-200">
                              {(rev.userId?.name || rev.user || "U")[0]}
                            </div>
                            <div>
                              <div className="text-xs font-bold text-slate-800 leading-tight">
                                {rev.userId?.name || rev.user || "Anonymous Buyer"}
                              </div>
                              {rev.isVerifiedPurchase && (
                                <div className="flex items-center gap-1 mt-0.5">
                                  <span className="inline-flex items-center justify-center w-3 h-3 rounded-full bg-emerald-500 text-white text-[7px] font-black">✔</span>
                                  <span className="text-[9px] text-emerald-600 font-black uppercase tracking-wider">Verified Purchase</span>
                                </div>
                              )}
                            </div>
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {new Date(rev.createdAt || rev.date).toLocaleDateString()}
                          </span>
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <div className="px-1.5 py-0.5 bg-emerald-600 text-white text-[9px] font-black rounded flex items-center gap-0.5">
                              {rev.rating} <FiStar className="fill-current text-[7px]" />
                            </div>
                            {rev.title && (
                              <span className="text-xs font-black text-slate-800">{rev.title}</span>
                            )}
                          </div>
                          <p className="text-xs text-slate-600 leading-relaxed font-medium">
                            {rev.comment || rev.review}
                          </p>
                        </div>

                        {/* Review specific images */}
                        {Array.isArray(rev.images) && rev.images.length > 0 && (
                          <div className="flex gap-2 overflow-x-auto py-1 scrollbar-hide">
                            {rev.images.map((imgUrl, imgIdx) => (
                              <div key={imgIdx} className="min-w-[70px] w-[70px] h-16 rounded-lg bg-gray-50 overflow-hidden shrink-0 border border-gray-100">
                                <img src={imgUrl} alt="Review attachment details" className="w-full h-full object-cover" />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="px-4 py-8 text-center text-xs text-slate-400 font-bold uppercase tracking-wider">
                      No reviews yet for this product.
                    </div>
                  )}
                </div>
              </div>

              {/* Similar To Section */}
              <div className="bg-white border-y border-gray-50 px-6 py-4 flex items-center justify-between lg:border lg:border-gray-100 lg:rounded-t-3xl lg:p-6 lg:shadow-sm lg:border-y-0">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-lg bg-white overflow-hidden border-2 border-purple-100 shadow-sm p-0.5 shrink-0">
                    <img src={product.image} className="w-full h-full object-cover rounded-md" alt="Similar" />
                  </div>
                  <div className="flex flex-col">
                    <h4 className="text-sm font-bold text-slate-800 leading-tight tracking-tight">Similar To</h4>
                    <p className="text-[10px] text-slate-500 font-medium line-clamp-1 mt-0.5">
                      {product.brandName || "Brand"}: {product.name}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => navigate(`/similar-explore/${product.id}?title=Similar Products`)}
                  className="text-sm font-bold text-pink-500 active:scale-95 transition-transform shrink-0"
                >
                  View All
                </button>
              </div>

              <div className="bg-white px-4 pb-6 overflow-x-auto flex gap-3 scrollbar-hide lg:border lg:border-t-0 lg:border-gray-100 lg:rounded-b-3xl lg:px-6 lg:pb-6 lg:shadow-sm">
                {similarProducts.map((p) => (
                  <FlipkartCompactCard key={p.id} product={p} />
                ))}
              </div>

              {/* Customers Also Viewed Section */}
              <div className="bg-white border-y border-gray-50 px-6 py-4 flex items-center justify-between lg:border lg:border-gray-100 lg:rounded-t-3xl lg:p-6 lg:shadow-sm lg:border-y-0">
                <h4 className="text-base font-bold text-slate-800 leading-tight tracking-tight">Customers Also Viewed</h4>
                <button 
                  onClick={() => navigate(`/similar-explore/${product.id}?title=Customers Also Viewed`)}
                  className="text-sm font-bold text-pink-500 active:scale-95 transition-transform shrink-0"
                >
                  View All
                </button>
              </div>

              <div className="bg-white px-4 pb-6 overflow-x-auto flex gap-3 scrollbar-hide lg:border lg:border-t-0 lg:border-gray-100 lg:rounded-b-3xl lg:px-6 lg:pb-6 lg:shadow-sm">
                {similarProducts.slice().reverse().map((p) => (
                  <FlipkartCompactCard key={p.id} product={p} />
                ))}
              </div>
            </div>

          </div>
        </MobileLayout>
      </PageTransition>

      {/* Fixed Action Bar (Flipkart Style) - Outside PageTransition to avoid transform conflicts */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200/80 p-2.5 z-[9999] shadow-[0_-8px_20px_rgba(0,0,0,0.12)] lg:hidden">
        <div className="flex items-center gap-2.5 w-full max-w-7xl mx-auto px-1">
          <button
            onClick={isInCart ? toggleCart : handleAddToCart}
            disabled={product.stock === "out_of_stock"}
            className={`flex-1 h-12 rounded-xl font-bold text-sm tracking-wide flex items-center justify-center gap-2 transition-all active:scale-95 ${product.stock === "out_of_stock"
              ? "bg-slate-200 text-slate-400 cursor-not-allowed"
              : "bg-gradient-to-r from-primary-600 to-primary-700 text-white shadow-md shadow-primary-500/20"
              }`}
          >
            {isInCart ? "Go to Cart" : "Add to Cart"}
          </button>
          <button
            onClick={handleBuyNow}
            disabled={product.stock === "out_of_stock"}
            className={`flex-1 h-12 rounded-xl font-bold text-sm tracking-wide flex items-center justify-center gap-2 transition-all active:scale-95 shadow-md ${product.stock === "out_of_stock"
              ? "bg-slate-100 text-slate-300 cursor-not-allowed"
              : "bg-slate-900 text-white"
              }`}
          >
            Buy Now
          </button>
        </div>
      </div>
    </>
  );
};

export default MobileProductDetail;
