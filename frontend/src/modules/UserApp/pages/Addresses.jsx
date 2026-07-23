import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { FiMapPin, FiEdit, FiTrash2, FiCheck, FiX, FiArrowLeft } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import MobileLayout from "../components/Layout/MobileLayout";
import toast from 'react-hot-toast';
import PageTransition from '../../../shared/components/PageTransition';
import ProtectedRoute from '../../../shared/components/Auth/ProtectedRoute';
import { useAddressStore } from '../../../shared/store/addressStore';
import { useAuthStore } from '../../../shared/store/authStore';

const MobileAddresses = () => {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuthStore();
  const { addresses, addAddress, updateAddress, deleteAddress, setDefaultAddress, fetchAddresses, isLoading } =
    useAddressStore();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm();

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchAddresses().catch(() => null);
  }, [isAuthenticated, fetchAddresses]);

  const onSubmit = async (data) => {
    try {
      const payload = {
        ...data,
        fullName: editingAddress?.fullName || user?.name || 'Customer',
        phone: editingAddress?.phone || user?.phone || '0000000000',
      };

      if (editingAddress) {
        await updateAddress(editingAddress.id, payload);
        toast.success('Address updated successfully!');
      } else {
        await addAddress(payload);
        toast.success('Address added successfully!');
      }
      reset();
      setIsFormOpen(false);
      setEditingAddress(null);
    } catch (error) {
      toast.error(error?.message || 'Failed to save address');
    }
  };

  const handleEdit = (address) => {
    setEditingAddress(address);
    reset(address);
    setIsFormOpen(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this address?')) {
      try {
        await deleteAddress(id);
        toast.success('Address deleted successfully!');
      } catch (error) {
        toast.error(error?.message || 'Failed to delete address');
      }
    }
  };

  const handleCancel = () => {
    reset();
    setIsFormOpen(false);
    setEditingAddress(null);
  };

  return (
    <ProtectedRoute>
      <PageTransition>
        <MobileLayout showBottomNav={true} showCartBar={!isFormOpen}>
          <div className="w-full pb-24">
            <div className="px-4 py-4 bg-white border-b border-gray-200">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => navigate(-1)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <FiArrowLeft className="text-xl text-gray-700" />
                </button>
                <h1 className="text-xl font-bold text-gray-800 flex-1 text-center mr-10">Address</h1>
              </div>
            </div>

            {/* Addresses List */}
            <div className="px-4 py-4">
              {isLoading ? (
                <div className="text-center py-12">
                  <p className="text-gray-600">Loading addresses...</p>
                </div>
              ) : addresses.length === 0 ? (
                <div className="text-center py-12">
                  <FiMapPin className="text-6xl text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-bold text-gray-800 mb-2">No addresses saved</h3>
                  <p className="text-sm text-gray-600 mb-6">Add your first address to get started</p>
                  <button
                    onClick={() => setIsFormOpen(true)}
                    className="gradient-green text-white px-6 py-3 rounded-xl font-semibold"
                  >
                    Add Address
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex justify-end">
                    <button
                      onClick={() => setIsFormOpen(true)}
                      className="rounded-md bg-[#e7f7f5] px-5 py-3 text-[15px] font-semibold text-[#0f5c56] shadow-sm"
                    >
                      Add New Address
                    </button>
                  </div>
                  {addresses.map((address) => (
                    <motion.div
                      key={address.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-3xl bg-white p-5 shadow-sm border border-gray-100"
                    >
                      <div className="min-w-0">
                        <div className="mb-1 flex items-center gap-2">
                          <h3 className="text-[16px] font-bold capitalize text-[#0f5c56]">{address.name}</h3>
                        </div>
                        <p className="text-[14px] font-semibold leading-5 text-gray-400">
                          {[address.address, address.city, address.state, address.country, address.zipCode]
                            .filter(Boolean)
                            .join(', ')}
                        </p>
                        {address.isDefault && (
                          <div className="mt-4 flex items-center justify-between gap-3">
                            <p className="text-[12px] font-semibold text-[#0f5c56]">Default Address.</p>
                            <div className="flex items-center gap-4">
                              <button
                                onClick={() => handleEdit(address)}
                                className="text-[#0f5c56]"
                              >
                                <FiEdit className="text-[18px]" />
                              </button>
                              <button
                                onClick={() => handleDelete(address.id)}
                                className="text-red-400"
                              >
                                <FiTrash2 className="text-[18px]" />
                              </button>
                            </div>
                          </div>
                        )}
                        {!address.isDefault && (
                          <div className="mt-4 flex items-center justify-between gap-3">
                            <button
                              onClick={async () => {
                                try {
                                  await setDefaultAddress(address.id);
                                  toast.success('Default address updated');
                                } catch (error) {
                                  toast.error(error?.message || 'Failed to set default address');
                                }
                              }}
                              className="rounded-md bg-[#e7f7f5] px-5 py-2 text-sm font-semibold text-[#0f5c56] shadow-sm"
                            >
                              Set Default
                            </button>
                            <div className="flex items-center gap-4">
                              <button
                                onClick={() => handleEdit(address)}
                                className="text-[#0f5c56]"
                              >
                                <FiEdit className="text-[18px]" />
                              </button>
                              <button
                                onClick={() => handleDelete(address.id)}
                                className="text-red-400"
                              >
                                <FiTrash2 className="text-[18px]" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="fixed bottom-20 left-4 right-4 z-40">
            <button
              type="button"
              onClick={() => navigate('/checkout')}
              className="w-full rounded-md bg-[#339af0] px-5 py-3 text-[15px] font-semibold text-white shadow-md"
            >
              Select Address
            </button>
          </div>

          {/* Address Form Modal */}
          <AnimatePresence>
            {isFormOpen && (
              <AddressFormModal
                onSubmit={onSubmit}
                onCancel={handleCancel}
                editingAddress={editingAddress}
                register={register}
                handleSubmit={handleSubmit}
                errors={errors}
              />
            )}
          </AnimatePresence>
        </MobileLayout>
      </PageTransition>
    </ProtectedRoute>
  );
};

// Address Form Modal Component
const AddressFormModal = ({
  onSubmit,
  onCancel,
  editingAddress,
  register,
  handleSubmit,
  errors,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 z-[10050] flex items-end"
      onClick={onCancel}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-t-3xl p-6 pb-24 w-full max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-800">
            {editingAddress ? 'Edit Address' : 'Add New Address'}
          </h2>
          <button onClick={onCancel} className="p-2 hover:bg-gray-100 rounded-full">
            <FiX className="text-xl" />
          </button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Address Label</label>
            <input
              type="text"
              {...register('name', { required: 'Address label is required' })}
              className={`w-full px-4 py-3 rounded-xl border-2 ${errors.name ? 'border-red-300' : 'border-gray-200'
                } focus:outline-none focus:ring-2 focus:ring-primary-500 text-base`}
              placeholder="Home, Work, etc."
            />
            {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>}
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Street Address</label>
            <input
              type="text"
              {...register('address', { required: 'Address is required' })}
              className={`w-full px-4 py-3 rounded-xl border-2 ${errors.address ? 'border-red-300' : 'border-gray-200'
                } focus:outline-none focus:ring-2 focus:ring-primary-500 text-base`}
            />
            {errors.address && (
              <p className="mt-1 text-sm text-red-600">{errors.address.message}</p>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">City</label>
              <input
                type="text"
                {...register('city', { required: 'City is required' })}
                className={`w-full px-4 py-3 rounded-xl border-2 ${errors.city ? 'border-red-300' : 'border-gray-200'
                  } focus:outline-none focus:ring-2 focus:ring-primary-500 text-base`}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">State</label>
              <input
                type="text"
                {...register('state', { required: 'State is required' })}
                className={`w-full px-4 py-3 rounded-xl border-2 ${errors.state ? 'border-red-300' : 'border-gray-200'
                  } focus:outline-none focus:ring-2 focus:ring-primary-500 text-base`}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Zip Code</label>
              <input
                type="text"
                {...register('zipCode', { required: 'Zip code is required' })}
                className={`w-full px-4 py-3 rounded-xl border-2 ${errors.zipCode ? 'border-red-300' : 'border-gray-200'
                  } focus:outline-none focus:ring-2 focus:ring-primary-500 text-base`}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Country</label>
            <input
              type="text"
              {...register('country', { required: 'Country is required' })}
              className={`w-full px-4 py-3 rounded-xl border-2 ${errors.country ? 'border-red-300' : 'border-gray-200'
                } focus:outline-none focus:ring-2 focus:ring-primary-500 text-base`}
            />
          </div>
          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              className="flex-1 bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white py-3.5 rounded-2xl font-bold shadow-lg shadow-primary-500/20 active:scale-95 transition-all"
            >
              {editingAddress ? 'Update Address' : 'Add Address'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
};

export default MobileAddresses;

