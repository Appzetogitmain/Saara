import { create } from "zustand";
import * as adminService from "../../modules/Admin/services/adminService";
import toast from "react-hot-toast";

export const useBannerStore = create((set, get) => ({
  banners: [],
  isLoading: false,

  initialize: async () => {
    await get().fetchBanners();
  },

  fetchBanners: async () => {
    set({ isLoading: true });
    try {
      const response = await adminService.getAllBanners();
      set({ banners: response.data, isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      toast.error(error.message || 'Failed to fetch banners');
    }
  },

  createBanner: async (bannerData) => {
    set({ isLoading: true });
    try {
      const response = await adminService.createBanner(bannerData);
      set(state => ({
        banners: [...state.banners, response.data],
        isLoading: false
      }));
      toast.success("Banner created successfully");
      return response.data;
    } catch (error) {
      set({ isLoading: false });
      toast.error(error.message || "Failed to create banner");
      throw error;
    }
  },

  updateBanner: async (id, bannerData) => {
    set({ isLoading: true });
    try {
      const response = await adminService.updateBanner(id, bannerData);
      set(state => ({
        banners: state.banners.map(b => b._id === id ? response.data : b),
        isLoading: false
      }));
      toast.success("Banner updated successfully");
      return response.data;
    } catch (error) {
      set({ isLoading: false });
      toast.error(error.message || "Failed to update banner");
      throw error;
    }
  },

  deleteBanner: async (id) => {
    set({ isLoading: true });
    try {
      await adminService.deleteBanner(id);
      set(state => ({
        banners: state.banners.filter(b => b._id !== id),
        isLoading: false
      }));
      toast.success("Banner deleted successfully");
    } catch (error) {
      set({ isLoading: false });
      toast.error(error.message || "Failed to delete banner");
      throw error;
    }
  },

  toggleBannerStatus: async (id) => {
    const banner = get().banners.find(b => b._id === id);
    if (banner) {
      await get().updateBanner(id, { isActive: !banner.isActive });
    }
  },

  getBannersByType: (type) => {
    if (!type) return get().banners;
    return get().banners.filter((banner) => banner.type === type);
  },

  getBannersByTypes: (types) => {
    if (!types || !types.length) return get().banners;
    return get().banners.filter((banner) => types.includes(banner.type));
  }
}));
