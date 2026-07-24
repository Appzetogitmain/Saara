import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { FiTrash2, FiMinus, FiPlus, FiAlertCircle } from "react-icons/fi";
import { toast } from "react-hot-toast";
import { useCartStore } from "../../store/useStore";
import { useWishlistStore } from "../../store/wishlistStore";
import { formatPrice } from "../../utils/helpers";
import { formatVariantLabel } from "../../utils/variant";
import useSwipeGesture from "../../../modules/UserApp/hooks/useSwipeGesture";

const getVariantText = (variant) => {
    const color = String(variant?.color || "").trim();
    const size = String(variant?.size || "").trim();

    if (color) return `Color: ${color}`;
    if (size) return `Size: ${size}`;
    return formatVariantLabel(variant);
};

const getSizeOptions = (size) => {
    const normalizedSize = String(size || "").trim();
    if (!normalizedSize) return ["S", "M", "L", "XL"];

    if (/^\d+$/.test(normalizedSize)) {
        const baseSize = Number(normalizedSize);
        return [baseSize - 1, baseSize, baseSize + 2, baseSize + 2]
            .filter((value) => value > 0)
            .map(String);
    }

    const commonSizes = ["XS", "S", "M", "L", "XL", "XXL"];
    return Array.from(new Set([normalizedSize, ...commonSizes]));
};

const getPriceMeta = (item) => {
    const currentPrice = Number(item?.price) || 0;
    const originalPrice = Number(item?.originalPrice) || 0;
    const hasDiscount = originalPrice > currentPrice && currentPrice > 0;

    return {
        currentPrice,
        originalPrice,
        hasDiscount,
        discountPercent: hasDiscount
            ? Math.round(((originalPrice - currentPrice) / originalPrice) * 100)
            : 0,
        savings: hasDiscount ? originalPrice - currentPrice : 0,
    };
};

const SwipeableCartItem = ({ item, index }) => {
    const [swipeOffset, setSwipeOffset] = useState(0);
    const [isDeleted, setIsDeleted] = useState(false);
    const [isRemoving, setIsRemoving] = useState(false);
    const [hasAnimated, setHasAnimated] = useState(false);
    const [selectedSize, setSelectedSize] = useState(String(item?.variant?.size || "XL"));
    const deletedItemRef = useRef(null);

    const { removeItem, updateQuantity } = useCartStore();
    const { addItem: addToWishlist } = useWishlistStore();

    // Only animate on mount
    useEffect(() => {
        setHasAnimated(true);
    }, []);

    const getProductStock = () => Number(item?.stockQuantity);

    const isLowStock = () => String(item?.stock || "") === "low_stock";
    const sizeOptions = getSizeOptions(selectedSize);
    const { currentPrice, originalPrice, hasDiscount, discountPercent, savings } = getPriceMeta(item);

    const handleQuantityChange = (id, currentQuantity, change, variant) => {
        const newQuantity = currentQuantity + change;
        const availableStock = Number(item?.stockQuantity);

        if (newQuantity <= 0) {
            removeItem(id, variant);
            return;
        }

        if (Number.isFinite(availableStock) && newQuantity > availableStock) {
            toast.error(`Only ${availableStock} items available in stock`);
            return;
        }

        updateQuantity(id, newQuantity, variant);
    };

    const handleSwipeRight = () => {
        setIsDeleted(true);
        deletedItemRef.current = { ...item };
        removeItem(item.id, item.variant);
        toast.success("Item removed", {
            duration: 3000,
            action: {
                label: "Undo",
                onClick: () => {
                    if (deletedItemRef.current) {
                        const { addItem: addToCart } = useCartStore.getState();
                        addToCart(deletedItemRef.current);
                        setIsDeleted(false);
                        deletedItemRef.current = null;
                    }
                },
            },
        });
    };

    const swipeHandlers = useSwipeGesture({
        onSwipeRight: handleSwipeRight,
        threshold: 100,
    });

    // Update offset based on swipe state
    useEffect(() => {
        if (swipeHandlers.swipeState.isSwiping) {
            setSwipeOffset(Math.max(0, swipeHandlers.swipeState.offset));
        } else if (!swipeHandlers.swipeState.isSwiping && swipeOffset < 100) {
            setSwipeOffset(0);
        }
    }, [swipeHandlers.swipeState.isSwiping, swipeHandlers.swipeState.offset]);

    if (isDeleted) return null;

    return (
        <motion.div
            initial={hasAnimated ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0, x: swipeOffset }}
            exit={{ opacity: 0, x: "100%" }}
            transition={{
                type: "spring",
                stiffness: 300,
                damping: 30,
            }}
            style={{ willChange: "transform, opacity", transform: "translateZ(0)" }}
            className="relative"
            onTouchStart={swipeHandlers.onTouchStart}
            onTouchMove={swipeHandlers.onTouchMove}
            onTouchEnd={swipeHandlers.onTouchEnd}>
            <div className="bg-white rounded-2xl relative border border-slate-200/80 overflow-hidden shadow-sm">
                {/* Delete Background */}
                {swipeOffset > 0 && (
                    <div className="absolute inset-0 bg-rose-500 rounded-2xl flex items-center justify-end pr-4">
                        <FiTrash2 className="text-white text-xl" />
                    </div>
                )}
                <div className="flex gap-4 p-3.5 relative z-10">
                    {/* Product Image */}
                    <div className="w-20 h-20 flex-shrink-0 rounded-xl overflow-hidden bg-slate-50 border border-slate-100 p-1 relative z-10">
                        <img
                            src={item.image}
                            alt={item.name}
                            className="w-full h-full object-contain"
                        />
                    </div>

                    {/* Product Info */}
                    <div className="flex-1 min-w-0 relative z-10">
                        <h3 className="font-bold text-gray-900 text-[13px] leading-snug mb-1 line-clamp-2">
                            {item.name}
                        </h3>
                        <div className="flex items-center gap-2 mb-2">
                            <div className="relative">
                                <select
                                    value={selectedSize}
                                    onChange={(e) => setSelectedSize(e.target.value)}
                                    className="appearance-none pl-2.5 pr-5 py-1 bg-slate-100 rounded-md text-[11px] font-medium text-slate-600 focus:outline-none"
                                >
                                    {sizeOptions.map((sizeOption) => (
                                        <option key={sizeOption} value={sizeOption}>
                                            {`Size ${sizeOption}`}
                                        </option>
                                    ))}
                                </select>
                                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">▼</span>
                            </div>
                            <div className="flex items-center bg-slate-100 rounded-lg px-1 py-0.5 border border-slate-200/60">
                                <button
                                    type="button"
                                    onClick={() => handleQuantityChange(item.id, item.quantity, -1, item.variant)}
                                    className="w-6 h-6 flex items-center justify-center text-slate-600 hover:bg-slate-200 rounded-md transition-colors"
                                >
                                    <FiMinus size={11} />
                                </button>
                                <span className="text-[11px] font-bold text-slate-800 px-2 min-w-[20px] text-center">
                                    {item.quantity}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => handleQuantityChange(item.id, item.quantity, 1, item.variant)}
                                    className="w-6 h-6 flex items-center justify-center text-slate-600 hover:bg-slate-200 rounded-md transition-colors"
                                >
                                    <FiPlus size={11} />
                                </button>
                            </div>
                        </div>
                        <div className="mb-1">
                            <div className="flex items-center gap-1.5 leading-none">
                                <span className="text-sm font-extrabold text-gray-900">
                                    {formatPrice(currentPrice)}
                                </span>
                                {hasDiscount && (
                                    <>
                                        <span className="text-[11px] text-slate-400 line-through font-medium">
                                            {formatPrice(originalPrice)}
                                        </span>
                                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1 py-0.5 rounded">
                                            {discountPercent}% OFF
                                        </span>
                                    </>
                                )}
                            </div>
                            {hasDiscount && (
                                <p className="mt-1 text-[11px] font-bold text-emerald-600">
                                    You save {formatPrice(savings)}
                                </p>
                            )}
                        </div>
                        {/* Stock Warning */}
                        {isLowStock() && (
                            <div className="flex items-center gap-1 text-xs text-orange-600 mb-2">
                                <FiAlertCircle className="text-xs" />
                                <span>Only {getProductStock()} left!</span>
                            </div>
                        )}
                    </div>
                </div>
                <div className="border-t border-slate-100 px-4 py-2 flex justify-end relative z-10 bg-slate-50/50">
                    <button
                        type="button"
                        disabled={isRemoving}
                        onClick={async (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (isRemoving) return;
                            setIsRemoving(true);
                            try {
                                await removeItem(item.id, item.variant);
                            } finally {
                                setIsRemoving(false);
                            }
                        }}
                        className={`text-[12px] font-bold transition-colors ${isRemoving ? 'text-slate-400 cursor-not-allowed' : 'text-rose-500 hover:text-rose-600'}`}
                    >
                        {isRemoving ? 'Removing...' : 'Remove'}
                    </button>
                </div>
            </div>
        </motion.div>
    );
};

export default SwipeableCartItem;
