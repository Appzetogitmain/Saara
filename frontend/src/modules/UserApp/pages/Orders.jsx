import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiFilter } from 'react-icons/fi';
import { motion } from 'framer-motion';
import MobileLayout from "../components/Layout/MobileLayout";
import MobileOrderCard from '../components/Mobile/MobileOrderCard';
import { useOrderStore } from '../../../shared/store/orderStore';
import { useAuthStore } from '../../../shared/store/authStore';
import PageTransition from '../../../shared/components/PageTransition';
import usePullToRefresh from '../hooks/usePullToRefresh';
import toast from 'react-hot-toast';

const MobileOrders = () => {
  const navigate = useNavigate();
  const { getAllOrders, fetchUserOrders, isLoading, orderPagination } = useOrderStore();
  const { user } = useAuthStore();
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [showFilter, setShowFilter] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const statusOptions = [
    { value: 'all', label: 'All Orders' },
    { value: 'pending', label: 'Pending' },
    { value: 'processing', label: 'Processing' },
    { value: 'shipped', label: 'Shipped' },
    { value: 'delivered', label: 'Delivered' },
    { value: 'cancelled', label: 'Cancelled' },
  ];

  const allOrders = getAllOrders(user?.id || null);

  useEffect(() => {
    if (user?.id) {
      fetchUserOrders(1, 20).catch(() => null);
    }
  }, [user?.id, fetchUserOrders]);

  const filteredOrders = useMemo(() => {
    if (selectedStatus === 'all') return allOrders;
    return allOrders.filter((order) => order.status === selectedStatus);
  }, [selectedStatus, allOrders]);

  // Pull to refresh handler
  const handleRefresh = async () => {
    if (!user?.id) return;
    await fetchUserOrders(1, 20);
    toast.success('Orders refreshed');
  };

  const hasMore = orderPagination.page < orderPagination.pages;

  const handleLoadMore = async () => {
    if (!user?.id || !hasMore || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      await fetchUserOrders(orderPagination.page + 1, 20);
    } catch {
      toast.error('Failed to load more orders');
    } finally {
      setIsLoadingMore(false);
    }
  };

  const {
    pullDistance,
    isPulling,
    isRefreshing,
    elementRef,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  } = usePullToRefresh(handleRefresh);

  return (
    <PageTransition>
      <MobileLayout showBottomNav={true} showCartBar={true}>
        <div className="w-full max-w-4xl mx-auto px-4 lg:px-0 py-6 pb-24">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate(-1)}
                className="w-12 h-12 bg-white border border-gray-100 hover:bg-gray-50 rounded-2xl flex items-center justify-center text-slate-700 shadow-sm transition-all"
              >
                <FiArrowLeft className="text-xl" />
              </button>
              <div>
                <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tight">My Orders</h1>
                <p className="text-xs font-semibold text-slate-400 mt-1">
                  {filteredOrders.length} {filteredOrders.length === 1 ? 'order' : 'orders'} placed
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 self-start sm:self-center">
              <button
                onClick={() => setShowFilter(!showFilter)}
                className={`p-2.5 rounded-xl border transition-all ${showFilter ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-white border-gray-100 text-slate-600 hover:bg-gray-50 shadow-sm'}`}
              >
                <FiFilter className="text-lg" />
              </button>
            </div>
          </div>

          {/* Filter Options */}
          {showFilter && (
            <div className="bg-white border border-gray-100 rounded-3xl p-4 shadow-sm mb-6 flex gap-2 overflow-x-auto scrollbar-hide">
              {statusOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    setSelectedStatus(option.value);
                  }}
                  className={`px-4 py-2 rounded-xl font-bold text-xs uppercase tracking-wider transition-all whitespace-nowrap ${
                    selectedStatus === option.value
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-gray-100'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}

          {/* Orders List */}
          <div
            ref={elementRef}
            className="w-full"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{
              transform: `translateY(${Math.min(pullDistance, 80)}px)`,
              transition: isPulling ? 'none' : 'transform 0.3s ease-out',
            }}
          >
              {isLoading ? (
                <div className="text-center py-12">
                  <p className="text-gray-600">Loading orders...</p>
                </div>
              ) : filteredOrders.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-6xl text-gray-300 mx-auto mb-4">📦</div>
                  <h3 className="text-xl font-bold text-gray-800 mb-2">No orders found</h3>
                  <p className="text-gray-600 mb-6">
                    {selectedStatus === 'all'
                      ? "You haven't placed any orders yet"
                      : `No ${selectedStatus} orders`}
                  </p>
                  <button
                    onClick={() => navigate('/home')}
                    className="gradient-green text-white px-6 py-3 rounded-xl font-semibold"
                  >
                    Start Shopping
                  </button>
                </div>
              ) : (
                <div className="space-y-0">
                  {filteredOrders.map((order, index) => (
                    <motion.div
                      key={order.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <MobileOrderCard order={order} />
                    </motion.div>
                  ))}
                  {selectedStatus === 'all' && hasMore && (
                    <div className="pt-4">
                      <button
                        onClick={handleLoadMore}
                        disabled={isLoadingMore}
                        className="w-full py-3 bg-white border border-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition-colors disabled:opacity-60"
                      >
                        {isLoadingMore ? 'Loading...' : 'Load More Orders'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
      </MobileLayout>
    </PageTransition>
  );
};

export default MobileOrders;

