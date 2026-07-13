import { useEffect } from "react";
import api from "../utils/api";
import { useCartStore } from "../store/useStore";
import { useAuthStore } from "../store/authStore";
import { getSocket, joinRoom, leaveRoom } from "../utils/socket";
import { useOrderStore } from "../store/orderStore";
import { useSettingsStore } from "../store/settingsStore";
import { getPublicGeneralSettings } from "../services/publicService";
import toast from "react-hot-toast";

const PRODUCTS_CACHE_KEY = "user-catalog-products-cache";
const VENDORS_CACHE_KEY = "user-catalog-vendors-cache";
const BRANDS_CACHE_KEY = "user-catalog-brands-cache";

const normalizeProduct = (raw) => {
  const vendorObj =
    raw?.vendorId && typeof raw.vendorId === "object" ? raw.vendorId : null;
  const brandObj =
    raw?.brandId && typeof raw.brandId === "object" ? raw.brandId : null;
  const categoryObj =
    raw?.categoryId && typeof raw.categoryId === "object" ? raw.categoryId : null;

  return {
    ...raw,
    id: raw?._id || raw?.id,
    vendorId: vendorObj?._id || raw?.vendorId,
    brandId: brandObj?._id || raw?.brandId,
    categoryId: categoryObj?._id || raw?.categoryId,
    vendorName: raw?.vendorName || vendorObj?.storeName || "",
    brandName: raw?.brandName || brandObj?.name || "",
    categoryName: raw?.categoryName || categoryObj?.name || "",
    image: raw?.image || raw?.images?.[0] || "",
    images: Array.isArray(raw?.images) ? raw.images : raw?.image ? [raw.image] : [],
  };
};

const normalizeVendor = (raw) => ({
  ...raw,
  id: raw?._id || raw?.id,
});

const normalizeBrand = (raw) => ({
  ...raw,
  id: raw?._id || raw?.id,
});

const AppBootstrap = () => {
  const { isAuthenticated, user } = useAuthStore();
  const { fetchCart } = useCartStore();

  useEffect(() => {
    if (isAuthenticated) {
      fetchCart();
    }
  }, [isAuthenticated, fetchCart]);

  useEffect(() => {
    const loadPublicSettings = async () => {
      try {
        const res = await getPublicGeneralSettings();
        const data = res?.data ?? res ?? {};
        if (data) {
          useSettingsStore.getState().setLocalSettings("general", data);
        }
      } catch (err) {
        console.error("Failed to load public general settings:", err);
      }
    };
    loadPublicSettings();
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;

    const token = localStorage.getItem('token') || localStorage.getItem('user-token');
    if (!token) return;

    const socket = getSocket(token);
    if (!socket) return;

    joinRoom(`user_${user.id}`);

    const handleOrderUpdate = (updatedOrder) => {
      const currentPath = window.location.pathname;
      const orderId = updatedOrder.orderId || updatedOrder._id;
      const isViewingThisOrder = currentPath.includes(`/orders/${orderId}`);

      // Centralized order store update
      useOrderStore.getState().fetchOrderById(orderId);

      if (!isViewingThisOrder) {
        const orderDisplayId = String(updatedOrder.orderId || updatedOrder._id).slice(-6).toUpperCase();
        toast.success(`Order #${orderDisplayId} status updated to: ${String(updatedOrder.status).replace(/_/g, ' ').toUpperCase()}`);
      }
    };

    const handleReturnUpdate = (updatedReturn) => {
      const currentPath = window.location.pathname;
      const orderId = updatedReturn.orderId;
      const isViewingThisOrder = orderId ? currentPath.includes(`/orders/${orderId}`) : false;

      // Centralized store update by re-fetching order details
      if (orderId) {
        useOrderStore.getState().fetchOrderById(orderId);
      }

      if (!isViewingThisOrder) {
        toast.success(`Return status updated to: ${String(updatedReturn.status).replace(/_/g, ' ').toUpperCase()}`);
      }
    };

    socket.on('order_updated', handleOrderUpdate);
    socket.on('return_updated', handleReturnUpdate);

    return () => {
      socket.off('order_updated', handleOrderUpdate);
      socket.off('return_updated', handleReturnUpdate);
      leaveRoom(`user_${user.id}`);
    };
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    let cancelled = false;

    const syncCatalog = async () => {
      try {
        const [productsRes, vendorsRes, brandsRes] = await Promise.allSettled([
          api.get("/products", { params: { page: 1, limit: 500 } }),
          api.get("/vendors/all", { params: { status: "approved", page: 1, limit: 200 } }),
          api.get("/brands/all"),
        ]);

        let updated = false;

        if (productsRes.status === "fulfilled" && !cancelled) {
          const payload = productsRes.value?.data;
          const list = Array.isArray(payload?.products)
            ? payload.products.map(normalizeProduct)
            : [];
          if (list.length) {
            localStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify(list));
            updated = true;
          }
        }

        if (vendorsRes.status === "fulfilled" && !cancelled) {
          const payload = vendorsRes.value?.data;
          const list = Array.isArray(payload?.vendors)
            ? payload.vendors.map(normalizeVendor)
            : [];
          if (list.length) {
            localStorage.setItem(VENDORS_CACHE_KEY, JSON.stringify(list));
            updated = true;
          }
        }

        if (brandsRes.status === "fulfilled" && !cancelled) {
          const payload = brandsRes.value?.data;
          const list = Array.isArray(payload) ? payload.map(normalizeBrand) : [];
          if (list.length) {
            localStorage.setItem(BRANDS_CACHE_KEY, JSON.stringify(list));
            updated = true;
          }
        }

        if (updated && !cancelled) {
          window.dispatchEvent(new Event("catalog-cache-updated"));
        }
      } catch {
        // Keep static fallback silently.
      }
    };

    syncCatalog();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
};

export default AppBootstrap;
