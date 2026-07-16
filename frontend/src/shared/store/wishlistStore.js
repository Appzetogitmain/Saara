import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import api from '../utils/api';
import { useAuthStore } from './authStore';
import { setPostLoginAction, setPostLoginRedirect } from '../utils/postLoginAction';
import toast from 'react-hot-toast';

const isMongoId = (value) => /^[a-fA-F0-9]{24}$/.test(String(value || ''));
const normalizeId = (value) => String(value ?? '').trim();
const getCurrentAuthUserId = () => {
  const authState = useAuthStore.getState();
  return normalizeId(authState?.user?.id || authState?.user?._id);
};

const redirectToLogin = () => {
  if (typeof window === 'undefined') return;
  const currentPath = window.location.pathname || '/home';
  if (currentPath === '/login') return;

  const fromPath = `${window.location.pathname || ''}${window.location.search || ''}${window.location.hash || ''}`;
  setPostLoginRedirect(fromPath || '/home');

  // SPA-friendly redirect without full page reload.
  const nextState = { from: { pathname: fromPath || '/home' } };
  window.history.pushState(nextState, '', '/login');
  window.dispatchEvent(new PopStateEvent('popstate', { state: nextState }));
};

const normalizeWishlistItem = (item) => {
  const product = item?.product || item?.productId || item;
  const id = normalizeId(product?.id || product?._id || item?.id || item?.productId);
  return {
    id,
    name: product?.name || item?.name || 'Product',
    price: Number(product?.price ?? item?.price ?? 0),
    image: product?.image || item?.image || '',
    stock: product?.stock || item?.stock,
    unit: product?.unit || item?.unit,
    rating: Number(product?.rating ?? item?.rating ?? 0),
    reviewCount: Number(product?.reviewCount ?? item?.reviewCount ?? 0),
    originalPrice:
      product?.originalPrice !== undefined
        ? Number(product.originalPrice)
        : item?.originalPrice !== undefined
          ? Number(item.originalPrice)
          : undefined,
    productId: normalizeId(product?._id || item?.productId || item?.id),
    variantId: item?.variantId || '',
    priceAtWishlist: Number(item?.priceAtWishlist ?? product?.price ?? item?.price ?? 0),
    notes: item?.notes || '',
    priority: Number(item?.priority ?? 0),
    addedAt: item?.addedAt,
    brandName: product?.brandId?.name || '',
    vendorName: product?.vendorId?.storeName || product?.vendorId?.name || '',
    stockQuantity: product?.stockQuantity !== undefined ? Number(product.stockQuantity) : undefined,
    deliveryLabel: product?.deliveryLabel || 'Standard Delivery'
  };
};

export const useWishlistStore = create(
  persist(
    (set, get) => ({
      items: [],
      filters: [],
      sections: [],
      summary: { totalItems: 0, selectedItems: 0, inStock: 0, outOfStock: 0 },
      pagination: { page: 1, limit: 20, hasNext: false },
      isLoading: false,
      hasFetched: false,
      ownerUserId: null,

      fetchWishlist: async (page = 1, limit = 20, append = false) => {
        const authState = useAuthStore.getState();
        if (!authState?.isAuthenticated) {
          set({ items: [], filters: [], sections: [], summary: { totalItems: 0, selectedItems: 0, inStock: 0, outOfStock: 0 }, hasFetched: false, ownerUserId: null, isLoading: false });
          return get().items;
        }

        const currentUserId = getCurrentAuthUserId();
        if (currentUserId && get().ownerUserId && normalizeId(get().ownerUserId) !== currentUserId) {
          set({ items: [], filters: [], sections: [], summary: { totalItems: 0, selectedItems: 0, inStock: 0, outOfStock: 0 }, hasFetched: false });
        }

        set({ isLoading: true });
        try {
          const response = await api.get('/user/wishlist', { params: { page, limit } });
          const payload = response?.data ?? response ?? {};
          
          const itemsRaw = Array.isArray(payload) ? payload : (Array.isArray(payload?.items) ? payload.items : []);
          const list = itemsRaw.map(normalizeWishlistItem).filter((item) => item.id);

          set((state) => ({
            items: append ? [...state.items, ...list] : list,
            filters: payload.filters || [],
            sections: payload.sections || [],
            summary: payload.summary || { totalItems: list.length, selectedItems: 0, inStock: list.length, outOfStock: 0 },
            pagination: payload.pagination || { page, limit, hasNext: false },
            isLoading: false,
            hasFetched: true,
            ownerUserId: currentUserId || null
          }));
          return list;
        } catch {
          set({ isLoading: false });
          return get().items;
        }
      },

      ensureHydrated: () => {
        const authState = useAuthStore.getState();
        const state = get();
        const currentUserId = getCurrentAuthUserId();

        if (!authState?.isAuthenticated) {
          if (state.items.length || state.hasFetched || state.ownerUserId) {
            set({ items: [], filters: [], sections: [], summary: { totalItems: 0, selectedItems: 0, inStock: 0, outOfStock: 0 }, hasFetched: false, ownerUserId: null });
          }
          return;
        }

        if (
          currentUserId &&
          state.ownerUserId &&
          normalizeId(state.ownerUserId) !== currentUserId
        ) {
          set({ items: [], filters: [], sections: [], summary: { totalItems: 0, selectedItems: 0, inStock: 0, outOfStock: 0 }, hasFetched: false, ownerUserId: currentUserId });
          return;
        }

        if (!state.hasFetched && !state.isLoading) {
          state.fetchWishlist().catch(() => null);
        }
      },

      // Add item to wishlist
      addItem: (item, variantId = '') => {
        const authState = useAuthStore.getState();
        if (!authState?.isAuthenticated) {
          setPostLoginAction({
            type: 'wishlist:add',
            payload: { ...item, variantId },
          });
          redirectToLogin();
          return false;
        }

        const normalizedItem = normalizeWishlistItem(item);
        if (!normalizedItem.id) {
          return false;
        }
        const currentUserId = getCurrentAuthUserId();
        let added = false;
        set((state) => {
          const ownerMismatch =
            currentUserId &&
            state.ownerUserId &&
            normalizeId(state.ownerUserId) !== currentUserId;
          const safeItems = ownerMismatch ? [] : state.items;
          const existingItem = safeItems.find(
            (i) => normalizeId(i.id) === normalizeId(normalizedItem.id) && (i.variantId || '') === (variantId || '')
          );
          if (existingItem) {
            return state; // Item already in wishlist
          }
          added = true;
          return {
            items: [...safeItems, { ...normalizedItem, variantId }],
            ownerUserId: currentUserId || state.ownerUserId || null,
          };
        });

        if (authState?.isAuthenticated && isMongoId(normalizedItem.id)) {
          api.post('/user/wishlist', { productId: String(normalizedItem.id), variantId }).then(res => {
            const payload = res?.data ?? res ?? {};
            const itemsRaw = Array.isArray(payload) ? payload : (Array.isArray(payload?.items) ? payload.items : []);
            const list = itemsRaw.map(normalizeWishlistItem).filter((i) => i.id);
            set({
              items: list,
              filters: payload.filters || [],
              sections: payload.sections || [],
              summary: payload.summary || { totalItems: list.length, selectedItems: 0, inStock: list.length, outOfStock: 0 },
              pagination: payload.pagination || { page: 1, limit: 20, hasNext: false }
            });
          }).catch(() => null);
        }

        return added;
      },

      // Remove item from wishlist
      removeItem: (productId, variantId = '') => {
        const normalizedId = normalizeId(productId);
        const currentUserId = getCurrentAuthUserId();
        set((state) => ({
          items: state.items.filter((item) => !(normalizeId(item.productId) === normalizedId && (item.variantId || '') === variantId)),
          ownerUserId: currentUserId || state.ownerUserId || null,
        }));

        const authState = useAuthStore.getState();
        if (authState?.isAuthenticated && isMongoId(normalizedId)) {
          api.delete(`/user/wishlist/${normalizedId}`, { params: { variantId } }).then(res => {
            const payload = res?.data ?? res ?? {};
            const itemsRaw = Array.isArray(payload) ? payload : (Array.isArray(payload?.items) ? payload.items : []);
            const list = itemsRaw.map(normalizeWishlistItem).filter((i) => i.id);
            set({
              items: list,
              filters: payload.filters || [],
              sections: payload.sections || [],
              summary: payload.summary || { totalItems: list.length, selectedItems: 0, inStock: list.length, outOfStock: 0 },
              pagination: payload.pagination || { page: 1, limit: 20, hasNext: false }
            });
          }).catch(() => {
            get().fetchWishlist().catch(() => null);
          });
        }
      },

      // Check if item is in wishlist
      isInWishlist: (id) => {
        get().ensureHydrated();
        const state = get();
        const authState = useAuthStore.getState();
        if (!authState?.isAuthenticated || !state.hasFetched) {
          return false;
        }
        const normalizedId = normalizeId(id);
        return state.items.some((item) => normalizeId(item.productId) === normalizedId);
      },

      // Clear wishlist
      clearWishlist: () => {
        const items = [...get().items];
        const currentUserId = getCurrentAuthUserId();
        set({ items: [], ownerUserId: currentUserId || null });

        const authState = useAuthStore.getState();
        if (authState?.isAuthenticated) {
          items
            .filter((item) => isMongoId(item.productId))
            .forEach((item) => {
              api.delete(`/user/wishlist/${item.productId}`, { params: { variantId: item.variantId } }).catch(() => null);
            });
        }
      },

      // Get wishlist count
      getItemCount: () => {
        get().ensureHydrated();
        const state = get();
        const authState = useAuthStore.getState();
        if (!authState?.isAuthenticated || !state.hasFetched) {
          return 0;
        }
        return state.items.length;
      },

      // Move item from wishlist to cart (returns item for cart)
      moveToCart: (productId, variantId = '') => {
        const normalizedId = normalizeId(productId);
        const state = get();
        const currentUserId = getCurrentAuthUserId();
        const item = state.items.find((i) => normalizeId(i.productId) === normalizedId && (i.variantId || '') === variantId);
        if (item) {
          set({
            items: state.items.filter((i) => !(normalizeId(i.productId) === normalizedId && (i.variantId || '') === variantId)),
            ownerUserId: currentUserId || state.ownerUserId || null,
          });

          const authState = useAuthStore.getState();
          if (authState?.isAuthenticated && isMongoId(normalizedId)) {
            api.delete(`/user/wishlist/${normalizedId}`, { params: { variantId } }).catch(() => null);
          }

          return item;
        }
        return null;
      },

      moveSelectedToCart: async (selectedItems) => {
        set({ isLoading: true });
        try {
          const res = await api.post('/user/wishlist/move-selected', { items: selectedItems });
          const payload = res?.data ?? res ?? {};
          
          if (payload.wishlist) {
            const itemsRaw = Array.isArray(payload.wishlist.items) ? payload.wishlist.items : [];
            const list = itemsRaw.map(normalizeWishlistItem).filter((i) => i.id);
            set({
              items: list,
              filters: payload.wishlist.filters || [],
              sections: payload.wishlist.sections || [],
              summary: payload.wishlist.summary || { totalItems: list.length, selectedItems: 0, inStock: list.length, outOfStock: 0 },
              pagination: payload.wishlist.pagination || { page: 1, limit: 20, hasNext: false }
            });
          }
          return payload;
        } catch (err) {
          toast.error('Failed to move selected items.');
          return null;
        } finally {
          set({ isLoading: false });
        }
      },

      removeSelectedFromWishlist: async (selectedItems) => {
        set({ isLoading: true });
        try {
          const res = await api.post('/user/wishlist/remove-selected', { items: selectedItems });
          const payload = res?.data ?? res ?? {};
          
          const itemsRaw = Array.isArray(payload.items) ? payload.items : [];
          const list = itemsRaw.map(normalizeWishlistItem).filter((i) => i.id);
          set({
            items: list,
            filters: payload.filters || [],
            sections: payload.sections || [],
            summary: payload.summary || { totalItems: list.length, selectedItems: 0, inStock: list.length, outOfStock: 0 },
            pagination: payload.pagination || { page: 1, limit: 20, hasNext: false }
          });
          return true;
        } catch (err) {
          toast.error('Failed to remove selected items.');
          return false;
        } finally {
          set({ isLoading: false });
        }
      },

      resetWishlist: () => {
        set({ items: [], filters: [], sections: [], summary: { totalItems: 0, selectedItems: 0, inStock: 0, outOfStock: 0 }, hasFetched: false, ownerUserId: null, isLoading: false });
      },
    }),
    {
      name: 'wishlist-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        items: state.items,
        ownerUserId: state.ownerUserId,
      }),
    }
  )
);
