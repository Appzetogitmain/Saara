import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { categories as initialCategories } from '../../data/categories';
import {
  getAllCategories,
  getPublicCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories as reorderCategoriesApi,
} from '../../modules/Admin/services/adminService';
import {
  getVendorCategoryRequests,
  requestVendorCategory,
  resubmitVendorCategoryRequest,
} from '../../modules/Vendor/services/vendorService';
import toast from 'react-hot-toast';

export const useCategoryStore = create(
  persist(
    (set, get) => ({
      categories: [],
      categoryRequests: [],
      isLoading: false,

      // Initialize categories
      initialize: async () => {
        set({ isLoading: true });
        try {
          const isAdminArea =
            typeof window !== 'undefined' &&
            window.location.pathname.startsWith('/admin');
          const response = isAdminArea
            ? await getAllCategories()
            : await getPublicCategories();
          const normalizedCategories = response.data.map(cat => ({
            ...cat,
            id: cat._id // Ensure UI compatibility by aliasing _id to id
          }));
          set({ categories: normalizedCategories, isLoading: false });
        } catch (error) {
          set({ isLoading: false });
          // Error toast is handled in api.js interceptor
        }
      },

      // Get all categories
      getCategories: () => {
        const state = get();
        if (state.categories.length === 0) {
          state.initialize();
        }
        return get().categories;
      },

      // Get category by ID
      getCategoryById: (id) => {
        const targetId = id && typeof id === 'object' ? (id._id || id.id) : id;
        return get().categories.find((cat) => {
          const catId = cat.id && typeof cat.id === 'object' ? (cat.id._id || cat.id.id) : cat.id;
          return String(catId || '') === String(targetId || '');
        });
      },

      // Create category
      createCategory: async (categoryData) => {
        set({ isLoading: true });
        try {
          const response = await createCategory(categoryData);
          const newCategory = {
            ...response.data,
            id: response.data._id
          };

          set((state) => ({
            categories: [...state.categories, newCategory],
            isLoading: false
          }));
          toast.success('Category created successfully');
          return newCategory;
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      // Update category
      updateCategory: async (id, categoryData) => {
        set({ isLoading: true });
        try {
          const response = await updateCategory(id, categoryData);
          const updatedCategory = {
            ...response.data,
            id: response.data._id
          };

          set((state) => ({
            categories: state.categories.map((cat) =>
              String(cat.id) === String(id) ? updatedCategory : cat
            ),
            isLoading: false
          }));
          toast.success('Category updated successfully');
          return updatedCategory;
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      // Delete category
      deleteCategory: async (id) => {
        set({ isLoading: true });
        try {
          await deleteCategory(id);
          set((state) => ({
            categories: state.categories.filter((cat) => String(cat.id) !== String(id)),
            isLoading: false
          }));
          toast.success('Category deleted successfully');
          return true;
        } catch (error) {
          set({ isLoading: false });
          return false;
        }
      },

      // Bulk delete categories
      bulkDeleteCategories: async (ids) => {
        set({ isLoading: true });
        try {
          // Sequentially delete for now, or updating backend to support bulk delete would be better
          // But to stick to constraints and existing service, we'll map
          await Promise.all(ids.map(id => deleteCategory(id)));

          set((state) => ({
            categories: state.categories.filter(
              (cat) => !ids.map(String).includes(String(cat.id))
            ),
            isLoading: false
          }));
          toast.success(`${ids.length} categories deleted successfully`);
          return true;
        } catch (error) {
          set({ isLoading: false });
          return false;
        }
      },

      // Toggle category status
      toggleCategoryStatus: (id) => {
        const category = get().getCategoryById(id);
        if (category) {
          get().updateCategory(id, { isActive: !category.isActive });
        }
      },

      // Get categories by parent
      getCategoriesByParent: (parentId) => {
        return get().categories.filter((cat) => {
          const normalizedParent = cat.parentId && typeof cat.parentId === 'object'
            ? (cat.parentId._id || cat.parentId.id)
            : cat.parentId;
          const targetParentId = parentId && typeof parentId === 'object' 
            ? (parentId._id || parentId.id) 
            : parentId;
          return String(normalizedParent || '') === String(targetParentId || '');
        });
      },

      // Get root categories
      getRootCategories: () => {
        return get().categories.filter((cat) => {
          const normalizedParent = cat.parentId && typeof cat.parentId === 'object'
            ? (cat.parentId._id || cat.parentId.id)
            : cat.parentId;
          return !normalizedParent;
        });
      },

      // Reorder categories
      reorderCategories: async (categoryIds) => {
        set({ isLoading: true });
        try {
          const response = await reorderCategoriesApi(categoryIds);
          const normalizedCategories = (response.data || []).map((cat) => ({
            ...cat,
            id: cat._id,
          }));
          set({ categories: normalizedCategories, isLoading: false });
          toast.success('Category order updated successfully');
          return true;
        } catch (error) {
          set({ isLoading: false });
          return false;
        }
      },

      // Fetch Category Requests for current vendor
      fetchCategoryRequests: async (params = {}) => {
        set({ isLoading: true });
        try {
          const response = await getVendorCategoryRequests(params);
          const payload = response.data;
          set({
            categoryRequests: payload.requests || payload,
            isLoading: false
          });
          return payload;
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      // Vendor submits a new category request
      requestCategory: async (categoryData) => {
        set({ isLoading: true });
        try {
          const response = await requestVendorCategory(categoryData);
          set({ isLoading: false });
          toast.success('Category request submitted successfully');
          return response.data;
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      // Vendor resubmits a rejected category request
      resubmitCategoryRequest: async (id, categoryData) => {
        set({ isLoading: true });
        try {
          const response = await resubmitVendorCategoryRequest(id, categoryData);
          set({ isLoading: false });
          toast.success('Category request resubmitted successfully');
          return response.data;
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },
    }),
    {
      name: 'category-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
