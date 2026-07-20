import { create } from 'zustand';
import * as adminService from '../../modules/Admin/services/adminService';
import toast from 'react-hot-toast';

export const useCouponStore = create((set, get) => ({
    coupons: [],
    isLoading: false,
    pagination: {
        total: 0,
        page: 1,
        limit: 10,
        pages: 1
    },

    fetchCoupons: async (params = {}) => {
        set({ isLoading: true });
        try {
            const { fetchAll = true, ...queryParams } = params || {};
            const pageSize = Math.max(Number.parseInt(queryParams.limit, 10) || 100, 1);
            let currentPage = Math.max(Number.parseInt(queryParams.page, 10) || 1, 1);
            let totalPages = 1;
            let latestPagination = {
                total: 0,
                page: currentPage,
                limit: pageSize,
                pages: 1,
            };
            const allCoupons = [];

            do {
                const response = await adminService.getAllCoupons({
                    ...queryParams,
                    page: currentPage,
                    limit: pageSize,
                });

                const payload = response?.data ?? response;
                const pageCoupons = Array.isArray(payload?.coupons)
                    ? payload.coupons
                    : (Array.isArray(payload) ? payload : []);
                allCoupons.push(...pageCoupons);

                const pagination = payload?.pagination || response?.pagination || {};
                latestPagination = {
                    total: Number.isFinite(Number(pagination.total))
                        ? Number(pagination.total)
                        : allCoupons.length,
                    page: Number.isFinite(Number(pagination.page))
                        ? Number(pagination.page)
                        : currentPage,
                    limit: Number.isFinite(Number(pagination.limit))
                        ? Number(pagination.limit)
                        : pageSize,
                    pages: Math.max(Number.parseInt(pagination.pages, 10) || 1, 1),
                };

                totalPages = fetchAll ? latestPagination.pages : currentPage;
                currentPage += 1;
            } while (fetchAll && currentPage <= totalPages);

            set({
                coupons: allCoupons,
                pagination: fetchAll
                    ? {
                        total: latestPagination.total,
                        page: 1,
                        limit: latestPagination.limit,
                        pages: latestPagination.pages,
                    }
                    : latestPagination,
                isLoading: false
            });
        } catch (error) {
            set({ isLoading: false });
            toast.error(error.message || 'Failed to fetch coupons');
        }
    },

    addCoupon: async (couponData) => {
        set({ isLoading: true });
        try {
            const response = await adminService.createCoupon(couponData);
            const payload = response?.data ?? response;
            set(state => ({
                coupons: [payload, ...state.coupons],
                isLoading: false
            }));
            toast.success('Coupon created successfully');
            return payload;
        } catch (error) {
            set({ isLoading: false });
            toast.error(error.message || 'Failed to create coupon');
            throw error;
        }
    },

    updateCoupon: async (id, couponData) => {
        set({ isLoading: true });
        try {
            const response = await adminService.updateCoupon(id, couponData);
            const payload = response?.data ?? response;
            set(state => ({
                coupons: state.coupons.map(c => c._id === id ? payload : c),
                isLoading: false
            }));
            toast.success('Coupon updated successfully');
            return payload;
        } catch (error) {
            set({ isLoading: false });
            toast.error(error.message || 'Failed to update coupon');
            throw error;
        }
    },

    deleteCoupon: async (id) => {
        set({ isLoading: true });
        try {
            await adminService.deleteCoupon(id);
            set(state => ({
                coupons: state.coupons.filter(c => c._id !== id),
                isLoading: false
            }));
            toast.success('Coupon deleted successfully');
        } catch (error) {
            set({ isLoading: false });
            toast.error(error.message || 'Failed to delete coupon');
            throw error;
        }
    }
}));
