import { FiHeart, FiShoppingBag, FiStar, FiTrash2 } from "react-icons/fi";
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { useCartStore, useUIStore } from "../store/useStore";
import { useWishlistStore } from "../store/wishlistStore";
import { formatPrice, getPlaceholderImage } from "../utils/helpers";
import toast from "react-hot-toast";
import LazyImage from "./LazyImage";
import { useState, useRef } from "react";
import useLongPress from "../../modules/UserApp/hooks/useLongPress";
import LongPressMenu from "../../modules/UserApp/components/Mobile/LongPressMenu";
import FlyingItem from "../../modules/UserApp/components/Mobile/FlyingItem";
import { getVariantSignature } from "../utils/variant";


const ProductCard = ({
  product,
  hideRating = false,
  isFlashSale = false,
  enhancedLayout = false,
}) => {
  const navigate = useNavigate();
  const productLink = `/product/${product.id}`;
  const { items, addItem, removeItem } = useCartStore();
  const triggerCartAnimation = useUIStore(
    (state) => state.triggerCartAnimation
  );
  const {
    addItem: addToWishlist,
    removeItem: removeFromWishlist,
    isInWishlist,
  } = useWishlistStore();
  const hasNoVariant = (cartItem) => !getVariantSignature(cartItem?.variant || {});
  const isFavorite = isInWishlist(product.id);
  const isInCart = items.some(
    (item) => item.id === product.id && hasNoVariant(item)
  );
  const [isAdding, setIsAdding] = useState(false);
  const [showLongPressMenu, setShowLongPressMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [showFlyingItem, setShowFlyingItem] = useState(false);
  const [flyingItemPos, setFlyingItemPos] = useState({
    start: { x: 0, y: 0 },
    end: { x: 0, y: 0 },
  });
  const buttonRef = useRef(null);

  const handleAddToCart = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    const hasDynamicAxes =
      Array.isArray(product?.variants?.attributes) &&
      product.variants.attributes.some((attr) => Array.isArray(attr?.values) && attr.values.length > 0);
    const hasSizeVariants = Array.isArray(product?.variants?.sizes) && product.variants.sizes.length > 0;
    const hasColorVariants = Array.isArray(product?.variants?.colors) && product.variants.colors.length > 0;
    if (hasDynamicAxes || hasSizeVariants || hasColorVariants) {
      toast.error("Please select variant on product page");
      navigate(productLink);
      return;
    }

    const isLargeScreen = window.innerWidth >= 1024;

    if (!isLargeScreen) {
      setIsAdding(true);

      const buttonRect = buttonRef.current?.getBoundingClientRect();
      const startX = buttonRect ? buttonRect.left + buttonRect.width / 2 : 0;
      const startY = buttonRect ? buttonRect.top + buttonRect.height / 2 : 0;

      setTimeout(() => {
        const cartBar = document.querySelector("[data-cart-bar]");
        let endX = window.innerWidth / 2;
        let endY = window.innerHeight - 100;

        if (cartBar) {
          const cartRect = cartBar.getBoundingClientRect();
          endX = cartRect.left + cartRect.width / 2;
          endY = cartRect.top + cartRect.height / 2;
        } else {
          const cartIcon = document.querySelector("[data-cart-icon]");
          if (cartIcon) {
            const cartRect = cartIcon.getBoundingClientRect();
            endX = cartRect.left + cartRect.width / 2;
            endY = cartRect.top + cartRect.height / 2;
          }
        }

        setFlyingItemPos({
          start: { x: startX, y: startY },
          end: { x: endX, y: endY },
        });
        setShowFlyingItem(true);
      }, 50);

      setTimeout(() => setIsAdding(false), 600);
    }

    const addedToCart = addItem({
      id: product.id,
      name: product.name,
      price: product.price,
      originalPrice: product.originalPrice,
      image: product.image,
      quantity: 1,
      stockQuantity: product.stockQuantity,
      vendorId: product.vendorId,
      vendorName: product.vendorName,
    });
    if (!addedToCart) return;
    triggerCartAnimation();
    toast.success("Added to cart!");
  };

  const handleRemoveFromCart = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    removeItem(product.id, {});
    toast.success("Removed from cart!");
  };

  const handleLongPress = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuPosition({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });
    setShowLongPressMenu(true);
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: product.name,
        text: `Check out ${product.name}`,
        url: window.location.origin + productLink,
      });
    } else {
      navigator.clipboard.writeText(window.location.origin + productLink);
      toast.success("Link copied to clipboard");
    }
  };

  const longPressHandlers = useLongPress(handleLongPress, 500);

  const handleFavorite = (e) => {
    e.stopPropagation();
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

  return (
    <>
      <motion.div
        style={{ willChange: "transform", transform: "translateZ(0)" }}
        className="bg-white rounded-2xl overflow-hidden group cursor-pointer h-full flex flex-col hover:shadow-lg transition-all duration-300 border border-slate-200/80 shadow-sm"
        {...longPressHandlers}>
        <div className="relative">
          {/* Favorite Icon */}
          <div className="absolute top-2 right-2 z-10">
            <button
              onClick={handleFavorite}
              className="p-1.5 bg-white/90 backdrop-blur-md rounded-full shadow-sm border border-slate-100 transition-all duration-300 group/heart hover:bg-white hover:scale-110">
              <FiHeart
                className={`text-sm transition-colors duration-300 ${isFavorite
                  ? "text-red-500 fill-red-500"
                  : "text-gray-500 group-heart:text-red-400"
                  }`}
              />
            </button>
          </div>

          {/* Product Image */}
          <Link to={productLink} className="block">
            <div
              className={`w-full bg-slate-50 flex items-center justify-center overflow-hidden relative group-hover:bg-slate-100/60 transition-colors ${enhancedLayout
                  ? "h-40 sm:h-48 md:h-56"
                  : "h-36 md:h-44"
                }`}>
              <LazyImage
                src={product.image}
                alt={product.name}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
                style={{ willChange: "transform", transform: "translateZ(0)" }}
                onError={(e) => {
                  e.target.src = getPlaceholderImage(300, 300, "Product Image");
                }}
              />
            </div>
          </Link>
        </div>

        {/* Product Info */}
        <div className="p-2.5 flex-1 flex flex-col">
          {/* Featured Tag */}
          <div className="mb-1">
            <span className="text-[9px] font-bold bg-primary-500/10 text-primary-600 px-2 py-0.5 rounded-full uppercase tracking-wider">
              Bestseller
            </span>
          </div>

          <Link to={productLink} className="block mb-0.5">
            <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider truncate">
              {product.brandName || "Premium Brand"}
            </h4>
            <h3 className="text-xs font-bold text-gray-900 line-clamp-1 leading-tight mb-1 group-hover:text-primary-600 transition-colors">
              {product.name}
            </h3>
          </Link>

          {/* Price Section */}
          <div className="flex items-center flex-wrap gap-1.5 mb-1">
            <span className="text-base font-extrabold text-gray-900">
              {formatPrice(product.price)}
            </span>
            {product.originalPrice && (
              <>
                <span className="text-[11px] text-slate-400 line-through font-medium">
                  {formatPrice(product.originalPrice)}
                </span>
                <span className="text-[10px] text-emerald-600 bg-emerald-50 font-bold px-1.5 py-0.5 rounded-md">
                  {Math.round(
                    ((product.originalPrice - product.price) /
                      product.originalPrice) *
                    100
                  )}% Off
                </span>
              </>
            )}
          </div>

          {/* Rating Row */}
          <div className="flex items-center justify-between mt-auto">
            <div className="flex items-center gap-0.5">
              {[...Array(5)].map((_, i) => (
                <FiStar
                  key={i}
                  className={`text-[10px] ${i < Math.floor(product.rating || 4)
                      ? "text-amber-400 fill-amber-400"
                      : "text-slate-200"
                    }`}
                />
              ))}
              <span className="text-[10px] text-slate-400 font-medium ml-1">
                ({product.reviewCount || 47})
              </span>
            </div>
          </div>

          {/* Add to Cart Button */}
          <div className="mt-2">
            {isInCart ? (
              <motion.button
                type="button"
                onClick={handleRemoveFromCart}
                whileTap={{ scale: 0.95 }}
                className="w-full py-2.5 rounded-xl font-bold text-xs bg-rose-50 text-rose-600 border border-rose-100 hover:bg-rose-100 transition-all flex items-center justify-center gap-2 shadow-sm">
                <FiTrash2 className="text-sm" />
                <span>Remove</span>
              </motion.button>
            ) : (
              <motion.button
                ref={buttonRef}
                type="button"
                onClick={handleAddToCart}
                disabled={product.stock === "out_of_stock" || isAdding}
                whileTap={{ scale: 0.95 }}
                className={`w-full py-2.5 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 ${product.stock === "out_of_stock"
                    ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                    : "bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white shadow-md shadow-primary-500/20 active:scale-95"
                  }`}>
                <FiShoppingBag className="text-sm" />
                <span>{isAdding ? "Adding..." : "Add"}</span>
              </motion.button>
            )}
          </div>
        </div>
      </motion.div>

      <LongPressMenu
        isOpen={showLongPressMenu}
        onClose={() => setShowLongPressMenu(false)}
        position={menuPosition}
        onAddToCart={handleAddToCart}
        onAddToWishlist={handleFavorite}
        onShare={handleShare}
        isInWishlist={isFavorite}
      />

      {showFlyingItem && (
        <FlyingItem
          image={product.image}
          startPosition={flyingItemPos.start}
          endPosition={flyingItemPos.end}
          onComplete={() => setShowFlyingItem(false)}
        />
      )}
    </>
  );
};

export default ProductCard;
