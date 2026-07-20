import { create } from 'zustand';
import * as adminService from '../../modules/Admin/services/adminService';
import toast from 'react-hot-toast';

export const useDeliveryStore = create(
    (set, get) => ({
        deliveryBoys: [],
        isLoading: false,
        error: null,
        pagination: {
            total: 0,
            page: 1,
            limit: 10,
            pages: 1
        },

        fetchDeliveryBoys: async (params = {}) => {
            set({ isLoading: true });
            try {
                const response = await adminService.getAllDeliveryBoys(params);
                const payload = response?.data ?? response;
                const deliveryBoys = (payload.deliveryBoys || []).map((boy) => ({
                    ...boy,
                    id: boy.id || boy._id,
                    status: boy.status || (boy.isActive ? 'active' : 'inactive'),
                    applicationStatus: boy.applicationStatus || 'approved',
                    documentUrls: boy.documentUrls || {},
                    totalDeliveries: boy.totalDeliveries ?? boy.stats?.totalDeliveries ?? 0,
                    pendingDeliveries: boy.pendingDeliveries ?? boy.stats?.pendingDeliveries ?? 0,
                    cashInHand: boy.cashInHand ?? boy.stats?.cashInHand ?? 0
                }));
                set({
                    deliveryBoys,
                    pagination: payload.pagination,
                    isLoading: false
                });
            } catch (error) {
                set({ error: error.message, isLoading: false });
                toast.error(error.message || 'Failed to fetch delivery boys');
            }
        },

        addDeliveryBoy: async (boyData) => {
            set({ isLoading: true });
            try {
                const response = await adminService.createDeliveryBoy(boyData);
                const payload = response?.data ?? response;
                const createdBoy = {
                    ...payload,
                    id: payload.id || payload._id,
                    status: payload.status || (payload.isActive ? 'active' : 'inactive'),
                    totalDeliveries: payload.totalDeliveries ?? 0,
                    pendingDeliveries: payload.pendingDeliveries ?? 0,
                    cashInHand: payload.cashInHand ?? 0
                };
                set((state) => ({
                    deliveryBoys: [createdBoy, ...state.deliveryBoys],
                    isLoading: false
                }));
                toast.success('Delivery boy added successfully');
                return true;
            } catch (error) {
                set({ isLoading: false });
                toast.error(error.message || 'Failed to add delivery boy');
                return false;
            }
        },

        updateStatus: async (id, isActive) => {
            try {
                await adminService.updateDeliveryBoyStatus(id, isActive);
                set((state) => ({
                    deliveryBoys: state.deliveryBoys.map((b) =>
                        b.id === id ? { ...b, isActive, status: isActive ? 'active' : 'inactive' } : b
                    )
                }));
                toast.success('Status updated successfully');
            } catch (error) {
                toast.error(error.message || 'Failed to update status');
            }
        },

        updateApplicationStatus: async (id, applicationStatus, reason = '') => {
            try {
                const response = await adminService.updateDeliveryBoyApplicationStatus(id, applicationStatus, reason);
                const updated = response?.data ?? response ?? {};
                set((state) => ({
                    deliveryBoys: state.deliveryBoys.map((boy) =>
                        String(boy.id) === String(id)
                            ? {
                                ...boy,
                                ...updated,
                                id: updated.id || updated._id || boy.id,
                                applicationStatus: updated.applicationStatus || applicationStatus,
                                status: updated.isActive ? 'active' : 'inactive',
                            }
                            : boy
                    ),
                }));
                toast.success(`Application ${applicationStatus} successfully`);
                return true;
            } catch (error) {
                toast.error(error.message || `Failed to ${applicationStatus} application`);
                return false;
            }
        },

        updateDeliveryBoyDetail: async (id, payload) => {
            set({ isLoading: true });
            try {
                const response = await adminService.updateDeliveryBoy(id, payload);
                const data = response?.data ?? response;
                const updatedBoy = {
                    ...data,
                    id: data.id || data._id,
                    status: data.status || (data.isActive ? 'active' : 'inactive')
                };
                set((state) => ({
                    deliveryBoys: state.deliveryBoys.map((boy) =>
                        String(boy.id) === String(id) ? { ...boy, ...updatedBoy } : boy
                    ),
                    isLoading: false
                }));
                toast.success('Delivery boy updated successfully');
                return true;
            } catch (error) {
                set({ isLoading: false });
                toast.error(error.message || 'Failed to update delivery boy');
                return false;
            }
        },

        removeDeliveryBoy: async (id) => {
            set({ isLoading: true });
            try {
                await adminService.deleteDeliveryBoy(id);
                set((state) => ({
                    deliveryBoys: state.deliveryBoys.filter((boy) => String(boy.id) !== String(id)),
                    isLoading: false
                }));
                toast.success('Delivery boy deleted successfully');
                return true;
            } catch (error) {
                set({ isLoading: false });
                toast.error(error.message || 'Failed to delete delivery boy');
                return false;
            }
        },

        settleCash: async (id, amount) => {
            set({ isLoading: true });
            try {
                await adminService.settleCash(id, amount);
                // Refresh data
                await get().fetchDeliveryBoys();
                toast.success('Cash settled successfully');
                set({ isLoading: false });
                return true;
            } catch (error) {
                set({ isLoading: false });
                toast.error(error.message || 'Failed to settle cash');
                return false;
            }
        }
    })
);
