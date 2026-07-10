import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDeliveryAuthStore } from '../store/deliveryStore';
import { FiPackage, FiCheckCircle, FiClock, FiTrendingUp, FiMapPin, FiTruck, FiChevronRight, FiChevronDown } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import PageTransition from '../../../shared/components/PageTransition';
import toast from 'react-hot-toast';
import { formatPrice } from '../../../shared/utils/helpers';

const DeliveryDashboard = () => {
  const { deliveryBoy, updateStatus, fetchProfile, fetchDashboardSummary, isUpdatingStatus } = useDeliveryAuthStore();
  const navigate = useNavigate();
  const statusMenuRef = useRef(null);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [recentOrders, setRecentOrders] = useState([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isDashboardLoading, setIsDashboardLoading] = useState(true);
  const [stats, setStats] = useState({
    totalOrders: 0,
    completedToday: 0,
    openOrders: 0,
    earnings: 0,
  });

  const statCards = [
    {
      icon: FiPackage,
      label: 'Total Orders',
      value: stats.totalOrders,
      color: 'text-blue-600',
      bg: 'bg-gradient-to-br from-blue-50 to-indigo-50/30 border-blue-100',
    },
    {
      icon: FiCheckCircle,
      label: 'Completed Today',
      value: stats.completedToday,
      color: 'text-green-600',
      bg: 'bg-gradient-to-br from-green-50 to-emerald-50/30 border-green-100',
    },
    {
      icon: FiClock,
      label: 'Open Orders',
      value: stats.openOrders,
      color: 'text-yellow-600',
      bg: 'bg-gradient-to-br from-yellow-50 to-amber-50/30 border-yellow-100',
    },
    {
      icon: FiTrendingUp,
      label: 'Earnings',
      value: formatPrice(stats.earnings),
      color: 'text-purple-600',
      bg: 'bg-gradient-to-br from-purple-50 to-violet-50/30 border-purple-100',
    },
  ];

  const loadDashboardData = async () => {
    try {
      setLoadFailed(false);
      setIsDashboardLoading(true);
      await fetchProfile();
      const summary = await fetchDashboardSummary();
      setRecentOrders(summary.recentOrders || []);
      setStats({
        totalOrders: Number(summary.totalOrders || 0),
        completedToday: Number(summary.completedToday || 0),
        openOrders: Number(summary.openOrders || 0),
        earnings: Number(summary.earnings || 0),
      });
    } catch {
      setLoadFailed(true);
      setRecentOrders([]);
      setStats({
        totalOrders: 0,
        completedToday: 0,
        openOrders: 0,
        earnings: 0,
      });
    } finally {
      setIsDashboardLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, [fetchDashboardSummary, fetchProfile]);

  useEffect(() => {
    if (!statusMenuOpen) return undefined;
    const handleClickOutside = (event) => {
      if (statusMenuRef.current && !statusMenuRef.current.contains(event.target)) {
        setStatusMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [statusMenuOpen]);

  const handleStatusChange = async (newStatus) => {
    if (isUpdatingStatus) return;
    try {
      await updateStatus(newStatus);
      toast.success(`Status updated to ${newStatus}`);
      setStatusMenuOpen(false);
    } catch {
      // Error toast already handled by API interceptor.
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'in-transit':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'completed':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  const getStatusButtonColor = (status) => {
    switch (status) {
      case 'available':
        return 'bg-emerald-500 hover:bg-emerald-600 shadow-emerald-100';
      case 'busy':
        return 'bg-amber-500 hover:bg-amber-600 shadow-amber-100';
      case 'offline':
        return 'bg-slate-500 hover:bg-slate-600 shadow-slate-100';
      default:
        return 'bg-slate-500 hover:bg-slate-600 shadow-slate-100';
    }
  };

  const displayOrders = recentOrders.length > 0 ? recentOrders : [];

  const initials = (() => {
    const name = deliveryBoy?.name || 'Delivery Boy';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  })();

  return (
    <PageTransition>
      <div className="px-4 py-6 space-y-6 max-w-3xl mx-auto pb-24">
        {/* Welcome Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-primary-600 to-primary-800 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden"
        >
          {/* Decorative gradients */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16" />
          <div className="absolute -bottom-8 -left-8 w-24 h-24 bg-white/5 rounded-full" />

          <div className="flex items-start justify-between mb-4 relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center font-black text-white text-base shadow-sm flex-shrink-0">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-lg font-extrabold tracking-tight truncate leading-tight">
                  {deliveryBoy?.name || 'Delivery Boy'}
                </h1>
                <p className="text-primary-100 text-[10px] font-bold uppercase tracking-wider mt-0.5">
                  {deliveryBoy?.status === 'available' 
                    ? 'Online & Active' 
                    : deliveryBoy?.status === 'busy'
                    ? 'Active (Busy)'
                    : 'Offline'}
                </p>
              </div>
            </div>
            
            <div className="relative" ref={statusMenuRef}>
              <button
                onClick={() => setStatusMenuOpen(!statusMenuOpen)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-white text-xs font-bold transition-all shadow-md ${getStatusButtonColor(deliveryBoy?.status)}`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                <span className="capitalize">{deliveryBoy?.status || 'offline'}</span>
                <FiChevronDown className="text-xs" />
              </button>

              <AnimatePresence>
                {statusMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute right-0 mt-2 w-36 bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden z-50 p-1"
                  >
                    <button
                      onClick={() => handleStatusChange('available')}
                      disabled={isUpdatingStatus}
                      className="w-full text-left px-3 py-2 text-xs font-bold hover:bg-emerald-50 text-emerald-700 rounded-xl transition-all"
                    >
                      Available
                    </button>
                    <button
                      onClick={() => handleStatusChange('busy')}
                      disabled={isUpdatingStatus}
                      className="w-full text-left px-3 py-2 text-xs font-bold hover:bg-amber-50 text-amber-700 rounded-xl transition-all"
                    >
                      Busy
                    </button>
                    <button
                      onClick={() => handleStatusChange('offline')}
                      disabled={isUpdatingStatus}
                      className="w-full text-left px-3 py-2 text-xs font-bold hover:bg-slate-50 text-slate-700 rounded-xl transition-all"
                    >
                      Offline
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
          
          <div className="mt-5 flex items-center gap-4 border-t border-white/10 pt-4 text-xs font-semibold text-primary-100 z-10 relative">
            <div className="flex items-center gap-1.5">
              <FiTruck className="text-sm" />
              <span>{deliveryBoy?.vehicleType || 'Bike'}</span>
            </div>
            <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
            <div className="font-mono bg-white/10 px-2 py-0.5 rounded-md">
              {deliveryBoy?.vehicleNumber || 'N/A'}
            </div>
            <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
            <div className="text-amber-300 flex items-center gap-1">
              <span>★</span>
              <span>{Number(deliveryBoy?.rating || 5.0).toFixed(1)}</span>
            </div>
          </div>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {statCards.map((stat, index) => {
            const Icon = stat.icon;
            const isEarnings = stat.label === 'Earnings';
            return (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.1 }}
                onClick={isEarnings ? () => navigate('/delivery/wallet') : undefined}
                className={`${stat.bg} rounded-3xl p-5 border shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden ${
                  isEarnings ? 'cursor-pointer hover:border-purple-300' : ''
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{stat.label}</p>
                  <div className={`p-2 bg-white rounded-xl shadow-sm ${stat.color}`}>
                    <Icon className="text-base" />
                  </div>
                </div>
                <p className="text-2xl font-black text-slate-800 font-mono leading-tight">
                  {isDashboardLoading ? <span className="inline-block h-6 w-16 rounded bg-slate-100 animate-pulse" /> : stat.value}
                </p>
              </motion.div>
            );
          })}
        </div>

        {/* Recent Orders */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-base font-black text-slate-800 uppercase tracking-wide">Recent Orders</h2>
            <div className="flex items-center gap-3">
              {loadFailed && (
                <button
                  onClick={loadDashboardData}
                  className="text-red-500 text-xs font-bold"
                >
                  Retry
                </button>
              )}
              <button
                onClick={() => navigate('/delivery/orders')}
                className="text-primary-600 text-xs font-bold uppercase tracking-wider hover:underline"
              >
                View All
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {isDashboardLoading && (
              <div className="space-y-3">
                {[1, 2].map((item) => (
                  <div key={item} className="border border-slate-100 rounded-3xl p-4 space-y-3 animate-pulse">
                    <div className="flex justify-between items-center">
                      <div className="h-4 w-24 bg-slate-100 rounded" />
                      <div className="h-4 w-12 bg-slate-100 rounded" />
                    </div>
                    <div className="h-10 w-full bg-slate-50 rounded" />
                  </div>
                ))}
              </div>
            )}
            {!isDashboardLoading && displayOrders.length === 0 && (
              <div className="text-xs text-slate-400 font-bold py-6 text-center">No assigned orders yet.</div>
            )}
            {!isDashboardLoading && displayOrders.map((order, index) => {
              const status = order.status || 'pending';
              
              const statusConfig = {
                pending: {
                  bar: 'bg-amber-500',
                  badge: 'bg-amber-50 text-amber-700 border-amber-100',
                  label: 'Pending',
                },
                'in-transit': {
                  bar: 'bg-blue-500',
                  badge: 'bg-blue-50 text-blue-700 border-blue-100',
                  label: 'In Transit',
                },
                completed: {
                  bar: 'bg-emerald-500',
                  badge: 'bg-emerald-50 text-emerald-700 border-emerald-100',
                  label: 'Completed',
                },
                cancelled: {
                  bar: 'bg-rose-500',
                  badge: 'bg-rose-50 text-rose-700 border-rose-100',
                  label: 'Cancelled',
                },
              };
              
              const currentStatus = statusConfig[status.toLowerCase()] || statusConfig.pending;

              return (
                <motion.div
                  key={order.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + index * 0.1 }}
                  onClick={() => navigate(`/delivery/orders/${order.id}`)}
                  className="bg-white border border-slate-100 hover:border-slate-200 rounded-3xl p-4 shadow-sm hover:shadow-md transition-all duration-300 relative pl-6 flex flex-col gap-3 group cursor-pointer"
                >
                  {/* Status Bar */}
                  <div className={`absolute top-0 bottom-0 left-0 w-1.5 rounded-l-3xl ${currentStatus.bar}`} />
                  
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="font-mono text-xs font-bold text-slate-500 bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-md">
                        {order.id}
                      </span>
                      <p className="text-sm font-bold text-slate-800 mt-1.5">{order.customer}</p>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${currentStatus.badge}`}>
                      {currentStatus.label}
                    </span>
                  </div>

                  <div className="flex items-start gap-2 p-3 bg-slate-50/50 border border-slate-50 rounded-2xl">
                    <FiMapPin className="text-primary-600 mt-0.5 flex-shrink-0 text-sm" />
                    <p className="text-xs font-semibold text-slate-500 leading-tight">
                      {order.address || 'Address unavailable'}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-3 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                      <span>Distance: {order.distance || '-'}</span>
                    </div>
                    <div className="flex items-center gap-1.5 font-bold text-xs text-primary-600">
                      <span>{formatPrice(order.amount)}</span>
                      <FiChevronRight className="transform group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      </div>
    </PageTransition>
  );
};

export default DeliveryDashboard;
