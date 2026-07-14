import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { getAllBrands, getPublicBrands, createBrand, updateBrand, deleteBrand } from '../../modules/Admin/services/adminService';
import { getVendorBrands, getVendorBrandRequests, requestVendorBrand, resubmitVendorBrandRequest } from '../../modules/Vendor/services/vendorService';
import toast from 'react-hot-toast';

export const useBrandStore = create(
  persist(
    (set, get) => ({
      brands: [],
      brandRequests: [],
      isLoading: false,

      // Initialize brands
      initialize: async () => {
        set({ isLoading: true });
        try {
          const isVendorArea =
            typeof window !== 'undefined' &&
            window.location.pathname.startsWith('/vendor');
          const response = isVendorArea
            ? await getVendorBrands()
            : await getAllBrands();
          const normalizedBrands = response.data.map(brand => ({
            ...brand,
            id: brand._id // Ensure UI compatibility by aliasing _id to id
          }));
          set({ brands: normalizedBrands, isLoading: false });
        } catch (error) {
          set({ isLoading: false });
          // Error toast is handled in api.js interceptor
        }
      },

      // Get all brands
      getBrands: () => {
        const state = get();
        if (state.brands.length === 0) {
          state.initialize();
        }
        return get().brands;
      },

      // Get brand by ID
      getBrandById: (id) => {
        return get().brands.find((brand) => String(brand.id) === String(id));
      },

      // Create brand
      createBrand: async (brandData) => {
        set({ isLoading: true });
        try {
          const response = await createBrand(brandData);
          const newBrand = {
            ...response.data,
            id: response.data._id
          };

          set((state) => ({
            brands: [...state.brands, newBrand],
            isLoading: false
          }));
          toast.success('Brand created successfully');
          return newBrand;
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      // Update brand
      updateBrand: async (id, brandData) => {
        set({ isLoading: true });
        try {
          const response = await updateBrand(id, brandData);
          const updatedBrand = {
            ...response.data,
            id: response.data._id
          };

          set((state) => ({
            brands: state.brands.map((brand) =>
              String(brand.id) === String(id) ? updatedBrand : brand
            ),
            isLoading: false
          }));
          toast.success('Brand updated successfully');
          return updatedBrand;
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      // Delete brand
      deleteBrand: async (id) => {
        set({ isLoading: true });
        try {
          await deleteBrand(id);
          set((state) => ({
            brands: state.brands.filter((brand) => String(brand.id) !== String(id)),
            isLoading: false
          }));
          toast.success('Brand deleted successfully');
          return true;
        } catch (error) {
          set({ isLoading: false });
          return false;
        }
      },

      // Bulk delete brands
      bulkDeleteBrands: async (ids) => {
        set({ isLoading: true });
        try {
          await Promise.all(ids.map(id => deleteBrand(id)));
          set((state) => ({
            brands: state.brands.filter(
              (brand) => !ids.map(String).includes(String(brand.id))
            ),
            isLoading: false
          }));
          toast.success(`${ids.length} brands deleted successfully`);
          return true;
        } catch (error) {
          set({ isLoading: false });
          return false;
        }
      },

      // Fetch Brand Requests for current vendor
      fetchBrandRequests: async (params = {}) => {
        set({ isLoading: true });
        try {
          const response = await getVendorBrandRequests(params);
          const payload = response.data;
          set({
            brandRequests: payload.requests || payload,
            isLoading: false
          });
          return payload;
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      // Vendor submits a new brand request
      requestBrand: async (brandData) => {
        set({ isLoading: true });
        try {
          const response = await requestVendorBrand(brandData);
          set({ isLoading: false });
          toast.success('Brand request submitted successfully');
          return response.data;
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      // Vendor resubmits a rejected brand request
      resubmitBrand: async (id, brandData) => {
        set({ isLoading: true });
        try {
          const response = await resubmitVendorBrandRequest(id, brandData);
          set({ isLoading: false });
          toast.success('Brand request resubmitted successfully');
          return response.data;
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      // Toggle brand status
      toggleBrandStatus: (id) => {
        const brand = get().getBrandById(id);
        if (brand) {
          get().updateBrand(id, { isActive: !brand.isActive });
        }
      },
    }),
    {
      name: 'brand-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

