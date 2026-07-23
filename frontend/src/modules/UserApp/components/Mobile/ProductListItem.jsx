import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { FiShoppingBag, FiHeart, FiTrash2 } from "react-icons/fi";
import { useCartStore, useUIStore } from "../../../../shared/store/useStore";
import { useWishlistStore } from "../../../../shared/store/wishlistStore";
import { formatPrice } from "../../../../shared/utils/helpers";
import toast from "react-hot-toast";
import LazyImage from '../../../../shared/components/LazyImage';
import VendorBadge from "../../../Vendor/components/VendorBadge";
import { getVendorById } from "../../data/catalogData";
import { getVariantSignature } from "../../../../shared/utils/variant";

const ProductListItem = ({ product, index, isFlashSale = false }) => {
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
  };

  const handleRemoveFromCart = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    removeItem(product.id, {});
    toast.success("Removed from cart!");
  };

  const handleFavorite = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
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

  const soldPercentage = product.stockQuantity ? Math.min(95, Math.floor(100 - (product.stockQuantity / 2))) : 75;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      className={`bg-white rounded-2xl p-3.5 mb-3 border border-slate-200/80 shadow-sm hover:shadow-md transition-all ${isFlashSale ? "bg-red-50/20 border-red-100" : ""}`}>
      <div className="flex gap-4">
        {/* Product Image Section */}
        <Link to={productLink} className="flex-shrink-0 relative group">
          <div className="w-24 h-24 md:w-32 md:h-32 rounded-xl overflow-hidden bg-slate-50 p-2">
            <LazyImage
              src={product.image}
              alt={product.name}
              className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500"
              onError={(e) => {
                e.target.src = "https://via.placeholder.com/200x200?text=Product";
              }}
            />
          </div>
          {product.originalPrice && (
            <div className="absolute top-1 left-1 bg-emerald-50 text-emerald-600 border border-emerald-200/60 text-[9px] font-bold px-1.5 py-0.5 rounded-md shadow-sm">
              {Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)}% OFF
            </div>
          )}
        </Link>

        {/* Product Info Section */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Top Row: Name + Favorite */}
          <div className="flex items-start justify-between gap-2 mb-1">
            <Link to={productLink} className="flex-1 min-w-0">
              <h3 className="font-bold text-gray-900 text-sm md:text-base mb-0 line-clamp-2 md:line-clamp-1 leading-snug group-hover:text-primary-600 transition-colors">
                {product.name}
              </h3>
            </Link>
            <button
              onClick={handleFavorite}
              className={`flex-shrink-0 p-2 rounded-full border transition-all ${isFavorite
                ? "bg-red-50 border-red-100 text-red-500 shadow-sm"
                : "bg-white border-slate-100 text-slate-400 hover:bg-slate-50"
                }`}>
              <FiHeart
                className={`text-sm ${isFavorite ? "fill-current scale-110" : ""}`}
              />
            </button>
          </div>

          <div className="flex items-center gap-2 mb-1">
            {product.rating && (
              <div className="flex items-center bg-amber-400/10 px-1.5 py-0.5 rounded-md">
                <span className="text-[10px] md:text-xs font-bold text-amber-700">⭐ {product.rating}</span>
                <span className="text-[9px] text-slate-400 font-medium ml-1">({product.reviewCount || 0})</span>
              </div>
            )}
            <span className="text-[10px] md:text-xs text-slate-400 border-l border-slate-200 pl-2">{product.unit}</span>
          </div>

          {/* Flash Sale Progress */}
          {isFlashSale && (
            <div className="mb-2 space-y-1 max-w-[200px]">
              <div className="flex justify-between text-[9px] font-bold">
                <span className="text-slate-400 uppercase">Stock Left</span>
                <span className="text-orange-600">{soldPercentage}% Sold</span>
              </div>
              <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-red-500 to-orange-400 transition-all duration-1000"
                  style={{ width: `${soldPercentage}%` }}
                />
              </div>
            </div>
          )}

          {/* Bottom Row: Price + Add Button */}
          <div className="mt-auto flex items-center justify-between gap-3 pt-2 border-t border-slate-100">
            <div className="flex flex-col">
              <span className="text-base md:text-xl font-extrabold text-gray-900 leading-none">
                {formatPrice(product.price)}
              </span>
              {product.originalPrice && (
                <span className="text-[10px] md:text-xs text-slate-400 line-through font-medium mt-0.5">
                  {formatPrice(product.originalPrice)}
                </span>
              )}
            </div>

            {isInCart ? (
              <button
                type="button"
                onClick={handleRemoveFromCart}
                className="px-4 py-2 rounded-xl font-bold text-xs md:text-sm flex items-center gap-2 bg-rose-50 text-rose-600 border border-rose-100 transition-all shadow-sm active:scale-95">
                <FiTrash2 className="text-xs md:text-base" />
                <span>Remove</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleAddToCart}
                className={`px-4 py-2 rounded-xl font-bold text-xs md:text-sm flex items-center gap-2 transition-all shadow-sm active:scale-95 whitespace-nowrap ${isFlashSale
                  ? "bg-gradient-to-r from-red-500 to-orange-500 text-white hover:shadow-red-200"
                  : "bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white shadow-md shadow-primary-500/20"
                  }`}>
                <FiShoppingBag className="text-xs md:text-base" />
                <span className="hidden sm:inline">Add to Cart</span>
                <span className="sm:hidden">Add</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default ProductListItem;
