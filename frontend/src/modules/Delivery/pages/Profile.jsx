import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useDeliveryAuthStore } from '../store/deliveryStore';
import { FiUser, FiMail, FiPhone, FiTruck, FiEdit2, FiSave, FiX, FiLogOut, FiChevronDown } from 'react-icons/fi';
import PageTransition from '../../../shared/components/PageTransition';
import toast from 'react-hot-toast';
import { formatPrice } from '../../../shared/utils/helpers';

const DeliveryProfile = () => {
  const navigate = useNavigate();
  const { deliveryBoy, updateProfile, fetchProfile, fetchProfileSummary, isLoading, logout } = useDeliveryAuthStore();
  const [isEditing, setIsEditing] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [profileMetrics, setProfileMetrics] = useState({
    totalDeliveries: 0,
    completedToday: 0,
    earnings: 0,
  });
  const [formData, setFormData] = useState({
    name: deliveryBoy?.name || '',
    email: deliveryBoy?.email || '',
    phone: deliveryBoy?.phone || '',
    vehicleType: deliveryBoy?.vehicleType || '',
    vehicleNumber: deliveryBoy?.vehicleNumber || '',
  });
  const [vehicleDropdownOpen, setVehicleDropdownOpen] = useState(false);

  const loadProfile = useCallback(async () => {
    try {
      setLoadFailed(false);
      const profile = await fetchProfile();
      try {
        const summary = await fetchProfileSummary();
        setProfileMetrics({
          totalDeliveries: Number(summary?.totalDeliveries || 0),
          completedToday: Number(summary?.completedToday || 0),
          earnings: Number(summary?.earnings || 0),
        });
      } catch {
        setProfileMetrics({
          totalDeliveries: Number(profile?.totalDeliveries || 0),
          completedToday: 0,
          earnings: 0,
        });
      }
    } catch {
      setLoadFailed(true);
    }
  }, [fetchProfile, fetchProfileSummary]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    setFormData({
      name: deliveryBoy?.name || '',
      email: deliveryBoy?.email || '',
      phone: deliveryBoy?.phone || '',
      vehicleType: deliveryBoy?.vehicleType || '',
      vehicleNumber: deliveryBoy?.vehicleNumber || '',
    });
  }, [deliveryBoy]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSave = async () => {
    if (!formData.name?.trim()) {
      toast.error('Name is required');
      return;
    }
    if (!formData.email?.trim()) {
      toast.error('Email is required');
      return;
    }
    if (!formData.phone?.trim()) {
      toast.error('Phone is required');
      return;
    }
    if (!formData.vehicleType?.trim()) {
      toast.error('Vehicle type is required');
      return;
    }
    if (!formData.vehicleNumber?.trim()) {
      toast.error('Vehicle number is required');
      return;
    }
    try {
      await updateProfile({
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        phone: formData.phone.trim(),
        vehicleType: formData.vehicleType.trim(),
        vehicleNumber: formData.vehicleNumber.trim(),
      });
      setIsEditing(false);
      toast.success('Profile updated successfully');
    } catch {
      // Error toast handled by API interceptor.
    }
  };

  const handleCancel = () => {
    setFormData({
      name: deliveryBoy?.name || '',
      email: deliveryBoy?.email || '',
      phone: deliveryBoy?.phone || '',
      vehicleType: deliveryBoy?.vehicleType || '',
      vehicleNumber: deliveryBoy?.vehicleNumber || '',
    });
    setIsEditing(false);
  };

  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
    navigate('/delivery/login');
  };

  const stats = [
    { 
      label: 'Total Deliveries', 
      value: Number(profileMetrics.totalDeliveries || 0),
      bg: 'bg-gradient-to-br from-blue-50 to-indigo-50/30 border-blue-100',
      color: 'text-blue-600'
    },
    { 
      label: 'Completed Today', 
      value: Number(profileMetrics.completedToday || 0),
      bg: 'bg-gradient-to-br from-green-50 to-emerald-50/30 border-green-100',
      color: 'text-green-600'
    },
    { 
      label: 'Rating', 
      value: `${Number(deliveryBoy?.rating || 0).toFixed(1)} ★`,
      bg: 'bg-gradient-to-br from-yellow-50 to-amber-50/30 border-yellow-100',
      color: 'text-yellow-600'
    },
    { 
      label: 'Earnings', 
      value: formatPrice(Number(profileMetrics.earnings || 0)),
      bg: 'bg-gradient-to-br from-purple-50 to-violet-50/30 border-purple-100',
      color: 'text-purple-600'
    },
  ];

  const initials = (() => {
    const name = deliveryBoy?.name || 'Delivery Boy';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  })();

  return (
    <PageTransition>
      <div className="px-4 py-6 space-y-6 max-w-3xl mx-auto pb-24">
        {/* Profile Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-primary-600 to-primary-800 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden"
        >
          {/* Decorative shapes */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16" />
          <div className="absolute -bottom-8 -left-8 w-24 h-24 bg-white/5 rounded-full" />

          <div className="flex items-center justify-between mb-4 relative z-10">
            <h1 className="text-lg font-extrabold tracking-tight">My Profile</h1>
            {loadFailed && (
              <button
                onClick={loadProfile}
                className="text-[10px] bg-red-50 text-red-600 px-2 py-0.5 rounded-lg font-bold uppercase tracking-wider"
              >
                Retry
              </button>
            )}
            {!isEditing ? (
              <button
                onClick={() => setIsEditing(true)}
                className="p-2 bg-white bg-opacity-20 rounded-xl hover:bg-opacity-30 transition-all"
              >
                <FiEdit2 className="text-sm" />
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={isLoading}
                  className="p-2 bg-white bg-opacity-20 rounded-xl hover:bg-opacity-30 transition-all"
                >
                  <FiSave className="text-sm" />
                </button>
                <button
                  onClick={handleCancel}
                  className="p-2 bg-white bg-opacity-20 rounded-xl hover:bg-opacity-30 transition-all"
                >
                  <FiX className="text-sm" />
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-4 relative z-10">
            <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center font-black text-white text-xl shadow-sm flex-shrink-0">
              {initials}
            </div>
            <div>
              <p className="text-base font-extrabold">{deliveryBoy?.name || 'Delivery Boy'}</p>
              <p className="text-primary-100 text-xs mt-0.5">{deliveryBoy?.email || 'email@example.com'}</p>
            </div>
          </div>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.1 }}
              className={`${stat.bg} rounded-3xl p-5 border shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden`}
            >
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1.5">{stat.label}</p>
              <p className={`text-xl font-black font-mono leading-none ${stat.color}`}>{stat.value}</p>
            </motion.div>
          ))}
        </div>

        {/* Profile Information */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-4"
        >
          <h2 className="text-base font-black text-slate-800 uppercase tracking-wide mb-2">Personal Information</h2>

          {/* Name */}
          <div>
            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <FiUser />
              Full Name
            </label>
            {isEditing ? (
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-2xl border-2 border-slate-100 focus:border-primary-500 focus:outline-none text-sm transition-all"
              />
            ) : (
              <p className="px-4 py-3 bg-slate-50/50 border border-slate-50 rounded-2xl text-slate-800 text-sm font-semibold">{formData.name}</p>
            )}
          </div>

          {/* Email */}
          <div>
            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <FiMail />
              Email Address
            </label>
            {isEditing ? (
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-2xl border-2 border-slate-100 focus:border-primary-500 focus:outline-none text-sm transition-all"
              />
            ) : (
              <p className="px-4 py-3 bg-slate-50/50 border border-slate-50 rounded-2xl text-slate-800 text-sm font-semibold">{formData.email}</p>
            )}
          </div>

          {/* Phone */}
          <div>
            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <FiPhone />
              Phone Number
            </label>
            {isEditing ? (
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-2xl border-2 border-slate-100 focus:border-primary-500 focus:outline-none text-sm transition-all"
              />
            ) : (
              <p className="px-4 py-3 bg-slate-50/50 border border-slate-50 rounded-2xl text-slate-800 text-sm font-semibold font-mono">{formData.phone}</p>
            )}
          </div>
        </motion.div>

        {/* Vehicle Information */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-4"
        >
          <h2 className="text-base font-black text-slate-800 uppercase tracking-wide mb-2 flex items-center gap-2">
            <FiTruck />
            Vehicle Information
          </h2>

          {/* Vehicle Type */}
          <div>
            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1.5">Vehicle Type</label>
            {isEditing ? (
              <div className="relative w-full">
                <button
                  type="button"
                  onClick={() => setVehicleDropdownOpen(!vehicleDropdownOpen)}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-2xl border-2 border-slate-100 focus:border-primary-500 focus:outline-none text-sm bg-white transition-all text-left"
                >
                  <span className="font-semibold text-slate-800">{formData.vehicleType || 'Select Vehicle Type'}</span>
                  <FiChevronDown className={`text-slate-400 text-base flex-shrink-0 transition-transform ${vehicleDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                <AnimatePresence>
                  {vehicleDropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-100 rounded-2xl shadow-xl z-50 overflow-hidden"
                    >
                      {['Bike', 'Scooter', 'Car', 'Van'].map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => {
                            setFormData({ ...formData, vehicleType: type });
                            setVehicleDropdownOpen(false);
                          }}
                          className={`w-full text-left px-4 py-3 text-sm font-semibold hover:bg-primary-50 transition-colors ${formData.vehicleType === type ? 'bg-primary-50 text-primary-700 font-extrabold' : 'text-slate-700'}`}
                        >
                          {type}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <p className="px-4 py-3 bg-slate-50/50 border border-slate-50 rounded-2xl text-slate-800 text-sm font-semibold">{formData.vehicleType}</p>
            )}
          </div>

          {/* Vehicle Number */}
          <div>
            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1.5">Vehicle Number</label>
            {isEditing ? (
              <input
                type="text"
                name="vehicleNumber"
                value={formData.vehicleNumber}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-2xl border-2 border-slate-100 focus:border-primary-500 focus:outline-none text-sm transition-all"
              />
            ) : (
              <p className="px-4 py-3 bg-slate-50/50 border border-slate-50 rounded-2xl text-slate-800 text-sm font-semibold font-mono">{formData.vehicleNumber}</p>
            )}
          </div>
        </motion.div>

        {/* Logout Button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm"
        >
          <button
            onClick={handleLogout}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-red-50 text-red-600 rounded-2xl font-bold hover:bg-red-100 transition-colors text-sm uppercase tracking-wider"
          >
            <FiLogOut className="text-lg" />
            <span>Logout</span>
          </button>
        </motion.div>
      </div>
    </PageTransition>
  );
};

export default DeliveryProfile;
