import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import toast from "react-hot-toast";
import { useAuthStore } from "./authStore";
import { setPostLoginAction, setPostLoginRedirect } from "../utils/postLoginAction";
import { getVariantSignature } from "../utils/variant";
import api from "../utils/api";

const getCartLineKey = (id, variant = {}) =>
  `${String(id)}::${getVariantSignature(variant)}`;

const getCurrentAuthUserId = () => {
  const authState = useAuthStore.getState();
  return String(authState?.user?.id || authState?.user?._id || "").trim();
};

const redirectToLogin = () => {
  if (typeof window === "undefined") return;
  const currentPath = window.location.pathname || "/home";
  if (currentPath === "/login") return;

  const fromPath = `${window.location.pathname || ""}${window.location.search || ""}${window.location.hash || ""}`;
  setPostLoginRedirect(fromPath || "/home");

  const nextState = { from: { pathname: fromPath || "/home" } };
  window.history.pushState(nextState, "", "/login");
  window.dispatchEvent(new PopStateEvent("popstate", { state: nextState }));
};

// Map backend cart item to frontend store item structure
const mapBackendItemToStore = (item) => ({
  id: item.productId?._id || item.productId,
  itemId: item._id, // MongoDB _id of the cart item
  name: item.productId?.name,
  image: item.productId?.image,
  price: item.productId?.price,
  variant: item.variant,
  quantity: item.quantity,
  stockQuantity: item.productId?.stockQuantity,
  stock: item.productId?.stock,
  cartLineKey: getCartLineKey(item.productId?._id || item.productId, item.variant),
  vendorId: item.productId?.vendorId || 1,
  vendorName: item.productId?.vendorName || "Vendor",
  taxRate: item.productId?.taxRate !== undefined ? item.productId.taxRate : 18,
  taxIncluded: !!item.productId?.taxIncluded,
});

// Cart Store
export const useCartStore = create(
  persist(
    (set, get) => ({
      items: [],
      ownerUserId: null,
      isLoading: false,

      fetchCart: async () => {
        const authState = useAuthStore.getState();
        if (!authState?.isAuthenticated) return;

        set({ isLoading: true });
        try {
          const response = await api.get("/user/cart");
          const cart = response?.data || response;
          const items = (cart.items || []).map(mapBackendItemToStore);
          set({ 
            items, 
            ownerUserId: getCurrentAuthUserId(), 
            isLoading: false 
          });
        } catch (error) {
          set({ isLoading: false });
          console.error("Failed to fetch cart:", error);
        }
      },

      mergeCart: async () => {
        const authState = useAuthStore.getState();
        if (!authState?.isAuthenticated) return;

        const localItems = get().items;
        if (!localItems.length) {
          await get().fetchCart();
          return;
        }

        try {
          const itemsToMerge = localItems.map(item => ({
            productId: item.id,
            variant: item.variant,
            quantity: item.quantity
          }));
          const response = await api.post("/user/cart/merge", { items: itemsToMerge });
          const cart = response?.data || response;
          const items = (cart.items || []).map(mapBackendItemToStore);
          set({ items, ownerUserId: getCurrentAuthUserId() });
          toast.success("Guest cart merged with your account");
        } catch (error) {
          console.error("Failed to merge cart:", error);
          await get().fetchCart();
        }
      },

      addItem: async (item) => {
        const authState = useAuthStore.getState();
        const currentUserId = getCurrentAuthUserId();
        
        // Optimistic update logic
        const lineKey = getCartLineKey(item.id, item.variant);
        const existingItem = get().items.find(i => i.cartLineKey === lineKey);
        const quantityToAdd = item.quantity || 1;
        const newQuantity = existingItem ? existingItem.quantity + quantityToAdd : quantityToAdd;

        // Stock check (local)
        if (item.stockQuantity !== undefined && newQuantity > item.stockQuantity) {
            toast.error(`Only ${item.stockQuantity} items available in stock`);
            return false;
        }

        if (authState?.isAuthenticated) {
          try {
            const response = await api.post("/user/cart/add", {
              productId: item.id,
              variant: item.variant,
              quantity: quantityToAdd
            });
            const cart = response?.data || response;
            set({ items: (cart.items || []).map(mapBackendItemToStore), ownerUserId: currentUserId });
          } catch (error) {
            // Error handled by API interceptor
            return false;
          }
        } else {
          // Guest mode
          const itemWithLineKey = {
            ...item,
            cartLineKey: lineKey,
            quantity: newQuantity,
            vendorId: item.vendorId || 1,
            vendorName: item.vendorName || "Vendor",
          };

          set((state) => {
            if (existingItem) {
              return {
                items: state.items.map(i => i.cartLineKey === lineKey ? itemWithLineKey : i),
                ownerUserId: null
              };
            }
            return {
              items: [...state.items, { ...itemWithLineKey, quantity: quantityToAdd }],
              ownerUserId: null
            };
          });
        }

        toast.success("Added to cart");
        const { triggerCartAnimation } = useUIStore.getState();
        triggerCartAnimation();
        return true;
      },

      removeItem: async (id, variant = null) => {
        const authState = useAuthStore.getState();
        const lineKey = getCartLineKey(id, variant);
        const itemToRemove = get().items.find(i => i.cartLineKey === lineKey);

        if (authState?.isAuthenticated && itemToRemove?.itemId) {
          try {
            const response = await api.delete(`/user/cart/item/${itemToRemove.itemId}`);
            const cart = response?.data || response;
            set({ items: (cart.items || []).map(mapBackendItemToStore) });
          } catch (error) {
            return;
          }
        } else {
          set((state) => ({
            items: state.items.filter(i => i.cartLineKey !== lineKey)
          }));
        }
      },

      updateQuantity: async (id, quantity, variant = null) => {
        if (quantity <= 0) {
          return get().removeItem(id, variant);
        }

        const authState = useAuthStore.getState();
        const lineKey = getCartLineKey(id, variant);
        const targetItem = get().items.find(i => i.cartLineKey === lineKey);

        if (authState?.isAuthenticated && targetItem?.itemId) {
          try {
            const response = await api.put("/user/cart/update", {
              itemId: targetItem.itemId,
              quantity
            });
            const cart = response?.data || response;
            set({ items: (cart.items || []).map(mapBackendItemToStore) });
          } catch (error) {
            return;
          }
        } else {
          // Guest update
          if (targetItem && targetItem.stockQuantity !== undefined && quantity > targetItem.stockQuantity) {
            toast.error(`Only ${targetItem.stockQuantity} items available in stock`);
            quantity = targetItem.stockQuantity;
          }
          set((state) => ({
            items: state.items.map(i => i.cartLineKey === lineKey ? { ...i, quantity } : i)
          }));
        }
      },

      clearCart: async () => {
        const authState = useAuthStore.getState();
        if (authState?.isAuthenticated) {
          await api.delete("/user/cart/clear").catch(() => {});
        }
        set({ items: [] });
      },

      resetCart: () => {
        set({ items: [], ownerUserId: null });
      },

      getTotal: () => {
        return get().items.reduce((total, item) => total + (item.price || 0) * item.quantity, 0);
      },

      getItemCount: () => {
        return get().items.reduce((count, item) => count + item.quantity, 0);
      },

      getItemsByVendor: () => {
        const vendorGroups = {};
        get().items.forEach((item) => {
          const vId = String(item.vendorId || 1);
          if (!vendorGroups[vId]) {
            vendorGroups[vId] = { vendorId: vId, vendorName: item.vendorName || "Vendor", items: [], subtotal: 0 };
          }
          vendorGroups[vId].items.push(item);
          vendorGroups[vId].subtotal += (item.price || 0) * item.quantity;
        });
        return Object.values(vendorGroups);
      },
    }),
    {
      name: "cart-storage",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        items: state.items,
        ownerUserId: state.ownerUserId,
      }),
    }
  )
);

// UI Store
export const useUIStore = create((set) => ({
  isMenuOpen: false,
  isCartOpen: false,
  isLoading: false,
  cartAnimationTrigger: 0,
  toggleMenu: () => set((state) => ({ isMenuOpen: !state.isMenuOpen })),
  toggleCart: () => set((state) => ({ isCartOpen: !state.isCartOpen })),
  setLoading: (loading) => set({ isLoading: loading }),
  triggerCartAnimation: () => set((state) => ({ cartAnimationTrigger: state.cartAnimationTrigger + 1 })),
}));
