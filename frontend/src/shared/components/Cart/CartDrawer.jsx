import { useEffect, useState, useRef, useMemo } from "react";
import {
  FiX,
  FiPlus,
  FiMinus,
  FiTrash2,
  FiShoppingBag,
  FiHeart,
  FiAlertCircle,
} from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";
import { useCartStore, useUIStore } from "../../store/useStore";
import { useAuthStore } from "../../store/authStore";
import { formatPrice } from "../../utils/helpers";
import { Link } from "react-router-dom";
import SwipeableCartItem from "./SwipeableCartItem";

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
  const total = getTotal();

  // Group items by vendor
  const itemsByVendor = useMemo(
    () => getItemsByVendor(),
    [items, getItemsByVendor]
  );

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
            dragElastic={0.2}
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
              )}
            </div>

            {/* Footer */}
            {items.length > 0 && (
              <div className="sticky bottom-0 z-30 border-t border-gray-200 px-4 py-2 bg-white">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[16px] font-semibold text-gray-900">
                        {formatPrice(total)}
                      </p>
                      <Link
                        to={checkoutLink}
                        onClick={toggleCart}
                        className="mt-0 inline-block text-[13px] font-medium text-sky-600">
                        View details
                      </Link>
                    </div>
                    <Link
                      to={checkoutLink}
                      onClick={toggleCart}
                      className="block min-w-[196px] rounded-[10px] bg-[#232323] px-5 py-2.5 text-center text-[15px] font-semibold text-white">
                      Proceed to Payment
                    </Link>
                  </div>
                  <button
                    onClick={clearCart}
                    className="w-full py-1.5 text-sm text-gray-600 hover:text-red-600 font-medium transition-colors">
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
