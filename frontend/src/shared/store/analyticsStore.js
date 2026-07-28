import { create } from 'zustand';
import * as adminService from '../../modules/Admin/services/adminService';
import toast from 'react-hot-toast';

export const useAnalyticsStore = create((set, get) => ({
    dashboardStats: null,
    revenueData: [],
    financialSummary: [],
    inventoryStats: null,
    isLoading: false,
    error: null,

    fetchDashboardStats: async () => {
        set({ isLoading: true });
        try {
            const data = await adminService.getDashboardStats();
            set({ dashboardStats: data, isLoading: false });
        } catch (error) {
            set({ error: error.message, isLoading: false });
        }
    },

    fetchFinancialSummary: async (period = 'monthly', params = {}) => {
        set({ isLoading: true });
        try {
            const response = await adminService.getFinancialSummary(period, params);
            const data = Array.isArray(response) ? response : (response?.data || []);
            set({ financialSummary: data, isLoading: false });
        } catch (error) {
            set({ financialSummary: [], error: error.message, isLoading: false });
            toast.error('Failed to fetch financial data');
        }
    },

    fetchInventoryStats: async () => {
        set({ isLoading: true });
        try {
            const data = await adminService.getInventoryStats();
            set({ inventoryStats: data, isLoading: false });
        } catch (error) {
            set({ error: error.message, isLoading: false });
        }
    },

    fetchRevenueData: async (period = 'monthly', params = {}) => {
        set({ isLoading: true });
        try {
            const response = await adminService.getRevenueData(period, params);
            const data = Array.isArray(response) ? response : (response?.data || []);
            set({ revenueData: data, isLoading: false });
        } catch (error) {
            set({ revenueData: [], error: error.message, isLoading: false });
        }
    }
}));
