import { useEffect, useState, useRef, useMemo } from "react";
import {
  FiX,
  FiShoppingBag,
} from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";
import { useCartStore, useUIStore } from "../../store/useStore";
import { useAuthStore } from "../../store/authStore";
import { formatPrice } from "../../utils/helpers";
import { Link } from "react-router-dom";
import SwipeableCartItem from "./SwipeableCartItem";

const DUMMY_COUPONS = [
    { code: "SAVE10", label: "10% OFF on this order" },
    { code: "FLAT200", label: "Flat 200 OFF above 1999" },
    { code: "FREESHIP", label: "Free shipping coupon" },
];

const CartDrawer = () => {
  const checkoutLink = "/checkout";
  const { isCartOpen, toggleCart } = useUIStore();
  const {
    items,
    getTotal,
    clearCart,
    getItemsByVendor,
  } = useCartStore();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  
  const [showCoupons, setShowCoupons] = useState(false);
  const [showConvenienceInfo, setShowConvenienceInfo] = useState(false);

  // Group items by vendor
  const itemsByVendor = useMemo(
    () => getItemsByVendor(),
    [items, getItemsByVendor]
  );

  // Calculations for order details
  const bagOriginalTotal = useMemo(() => {
    return items.reduce((acc, item) => acc + (Number(item.originalPrice || item.price) * item.quantity), 0);
  }, [items]);

  const bagSavings = useMemo(() => {
    return items.reduce((acc, item) => {
      const orig = Number(item.originalPrice) || 0;
      const curr = Number(item.price) || 0;
      return acc + (orig > curr ? (orig - curr) * item.quantity : 0);
    }, 0);
  }, [items]);

  const bagSubtotal = useMemo(() => {
    return items.reduce((acc, item) => acc + (Number(item.price) * item.quantity), 0);
  }, [items]);

  const deliveryFee = useMemo(() => {
    return bagSubtotal > 499 ? 0 : 99;
  }, [bagSubtotal]);

  const amountPayable = useMemo(() => {
    return bagSubtotal + deliveryFee;
  }, [bagSubtotal, deliveryFee]);

  // Prevent body scroll when cart is open
  useEffect(() => {
    if (!isAuthenticated && items.length > 0) {
      clearCart();
    }
  }, [isAuthenticated, items.length, clearCart]);

  useEffect(() => {
    if (isCartOpen) {
      document.body.style.overflowY = "hidden";
    } else {
      document.body.style.overflowY = "";
    }
    return () => {
      document.body.style.overflowY = "";
    };
  }, [isCartOpen]);

  return (
    <AnimatePresence>
      {isCartOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={toggleCart}
            className="fixed inset-0 bg-black/50 z-[10000]"
          />

          {/* Cart Drawer */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={{ left: 0, right: 0.2 }}
            onDragEnd={(event, info) => {
              if (info.offset.x > 200) {
                toggleCart();
              }
            }}
            style={{ willChange: "transform", transform: "translateZ(0)" }}
            className="fixed right-0 top-0 h-full w-full sm:w-[23rem] bg-white shadow-2xl z-[10000] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-5 border-b border-gray-200">
              <h2 className="text-[18px] font-bold text-slate-800">Shopping Cart</h2>
              <button
                onClick={toggleCart}
                className="p-1.5 rounded-full transition-colors">
                <FiX className="text-[22px] text-slate-500" />
              </button>
            </div>

            {/* Cart Items */}
            <div className="flex-1 overflow-y-auto px-4 py-4 bg-white">
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <FiShoppingBag className="text-6xl text-gray-300 mb-4" />
                  <p className="text-gray-500 font-medium mb-2">
                    Your cart is empty
                  </p>
                  <p className="text-sm text-gray-400">
                    Add some items to get started!
                  </p>
                </div>
              ) : (
                <div className="space-y-5">
                  <AnimatePresence mode="popLayout">
                    <div className="space-y-5">
                      {itemsByVendor.map((vendorGroup, vendorIndex) => (
                        <div key={vendorGroup.vendorId} className="space-y-3">
                          {/* Vendor Header */}
                          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-violet-50 border border-violet-100">
                            <div className="w-6 h-6 rounded-full bg-violet-500 flex items-center justify-center flex-shrink-0">
                              <FiShoppingBag className="text-white text-[11px]" />
                            </div>
                            <span className="text-sm font-bold text-violet-700 flex-1">
                              {vendorGroup.vendorName}
                            </span>
                            <span className="text-sm font-bold text-violet-600 bg-white px-2.5 py-1 rounded-lg">
                              {formatPrice(vendorGroup.subtotal)}
                            </span>
                          </div>
                          {/* Vendor Items */}
                          <div className="space-y-3">
                            {vendorGroup.items.map((item, index) => (
                              <SwipeableCartItem
                                key={item.cartLineKey || `${item.id}-${index}`}
                                item={item}
                                index={index}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </AnimatePresence>

                  {/* Summary & Policy Details rendered ONCE at bottom of scrollable list */}
                  <div className="pt-2 space-y-4 border-t border-gray-100">
                    {/* Apply coupon */}
                    <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-4 px-1">
                      <div className="flex items-center gap-3">
                        <svg
                          className="text-gray-500 w-[18px] h-[18px]"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <circle cx="12" cy="12" r="3.2" />
                          <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1.9 1.9 0 1 1-2.7 2.7l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a1.9 1.9 0 1 1-3.8 0v-.2a1 1 0 0 0-.7-.9 1 1 0 0 0-1.1.2l-.1.1a1.9 1.9 0 1 1-2.7-2.7l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a1.9 1.9 0 1 1 0-3.8h.2a1 1 0 0 0 .9-.7 1 1 0 0 0-.2-1.1l-.1-.1a1.9 1.9 0 1 1 2.7-2.7l.1.1a1 1 0 0 0 1.1.2h.1a1 1 0 0 0 .6-.9V4a1.9 1.9 0 1 1 3.8 0v.2a1 1 0 0 0 .6.9h.1a1 1 0 0 0 1.1-.2l.1-.1a1.9 1.9 0 1 1 2.7 2.7l-.1.1a1 1 0 0 0-.2 1.1v.1a1 1 0 0 0 .9.6H20a1.9 1.9 0 1 1 0 3.8h-.2a1 1 0 0 0-.9.6Z" />
                        </svg>
                        <span className="text-[14px] font-normal text-gray-800">Apply coupon</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowCoupons((prev) => !prev)}
                        className="text-[14px] font-medium text-sky-500"
                      >
                        Select
                      </button>
                    </div>
                    {showCoupons && (
                      <div className="mt-3 space-y-2 px-1">
                        {DUMMY_COUPONS.map((coupon) => (
                          <button
                            key={coupon.code}
                            type="button"
                            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-left"
                          >
                            <p className="text-[12px] font-semibold text-gray-800">{coupon.code}</p>
                            <p className="text-[11px] text-gray-500">{coupon.label}</p>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Order Details */}
                    <div className="mt-4 rounded-[20px] bg-white border border-gray-200 overflow-hidden">
                      <div className="h-5 bg-[#f4f7fb] relative">
                        <div className="absolute inset-x-0 top-full -translate-y-1/2 flex justify-between px-2">
                          {Array.from({ length: 14 }).map((_, punchIndex) => (
                            <span
                              key={punchIndex}
                              className="block h-2.5 w-2.5 rounded-full bg-[#eef3f8]"
                            />
                          ))}
                        </div>
                      </div>
                      <div className="px-4 pt-7 pb-4">
                        <h3 className="text-[16px] font-semibold text-gray-900 mb-4">Order Details</h3>
                        <div className="space-y-3 text-[13px]">
                          <div className="flex items-center justify-between text-gray-700">
                            <span>Bag Total</span>
                            <span>{formatPrice(bagOriginalTotal)}</span>
                          </div>
                          <div className="flex items-center justify-between text-gray-700">
                            <span>Bag Savings</span>
                            <span className="text-emerald-500">-{formatPrice(bagSavings)}</span>
                          </div>
                          <div className="flex items-center justify-between text-gray-700">
                            <span>Coupon savings</span>
                            <button type="button" className="text-sky-500 font-medium">Apply coupon</button>
                          </div>
                          <div className="flex items-center justify-between text-gray-700">
                            <div className="flex items-center gap-2">
                              <span>Convenience Fee</span>
                              <button
                                type="button"
                                onClick={() => setShowConvenienceInfo((prev) => !prev)}
                                className="text-sky-500 font-medium"
                              >
                                What's this?
                              </button>
                            </div>
                            <span />
                          </div>
                          {showConvenienceInfo && (
                            <div className="rounded-xl bg-sky-50 border border-sky-100 px-3 py-2 text-[12px] text-gray-600">
                              Convenience fee helps cover platform handling and service support for your order.
                            </div>
                          )}
                          <div className="flex items-center justify-between text-gray-400 pl-3">
                            <span>Delivery Fee</span>
                            <span>{deliveryFee > 0 ? formatPrice(deliveryFee) : "FREE"}</span>
                          </div>
                        </div>
                        <div className="mt-4 flex items-center justify-between text-[15px] font-semibold text-gray-900">
                          <span>Amount Payable</span>
                          <span>{formatPrice(amountPayable)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Return policy */}
                    <div className="mt-4 rounded-[20px] bg-white border border-gray-200 px-4 py-3">
                      <h3 className="text-[15px] font-semibold text-gray-900">Return/Refund policy</h3>
                      <p className="mt-2 text-[12px] leading-5 text-gray-700">
                        In case of return, we ensure quick refunds. Full amount will be
                        refunded excluding Convenience Fee
                      </p>
                      <Link
                        to="/policy/refund-policy"
                        onClick={toggleCart}
                        className="mt-2 inline-block text-[13px] font-semibold text-sky-500"
                      >
                        Read policy
                      </Link>
                    </div>

                    {/* Savings notification */}
                    {bagSavings > 0 && (
                      <div className="mt-2 rounded-sm bg-[#dff8ef] px-3 py-2 text-center text-[13px] font-semibold text-gray-800">
                        <span aria-hidden="true" className="mr-1">🎊</span>
                        Cheers! You saved {formatPrice(bagSavings)}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            {items.length > 0 && (
              <div className="sticky bottom-0 z-30 border-t border-slate-200/80 px-4 py-3 bg-white/95 backdrop-blur-md">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-lg font-black text-gray-900 leading-tight">
                        {formatPrice(amountPayable)}
                      </p>
                      <Link
                        to={checkoutLink}
                        onClick={toggleCart}
                        className="text-xs font-bold text-primary-600 hover:text-primary-700">
                        View details
                      </Link>
                    </div>
                    <Link
                      to={checkoutLink}
                      onClick={toggleCart}
                      className="flex-1 rounded-2xl bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 px-5 py-3 text-center text-sm font-bold text-white shadow-lg shadow-primary-500/20 active:scale-95 transition-all">
                      Proceed to Checkout
                    </Link>
                  </div>
                  <button
                    onClick={clearCart}
                    className="w-full py-1 text-xs text-slate-400 hover:text-rose-500 font-semibold transition-colors">
                    Clear Cart
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default CartDrawer;
