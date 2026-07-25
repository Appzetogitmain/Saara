import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiPackage, FiMapPin, FiClock, FiCheckCircle, FiXCircle, FiNavigation, FiChevronRight, FiRefreshCw, FiTruck, FiCheck } from 'react-icons/fi';
import { useNavigate, useLocation } from 'react-router-dom';
import PageTransition from '../../../shared/components/PageTransition';
import { formatPrice } from '../../../shared/utils/helpers';
import toast from 'react-hot-toast';
import { useDeliveryAuthStore } from '../store/deliveryStore';
import { getSocket, joinRoom, leaveRoom } from '../../../shared/utils/socket';

const DeliveryOrders = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    orders,
    ordersPagination,
    isLoadingOrders,
    isUpdatingOrderStatus,
    fetchOrders,
    acceptOrder,
    completeOrder,
    returnPickups,
    isLoadingReturns,
    fetchReturnPickups,
    acceptReturnPickup,
    rejectReturnPickup,
    updateReturnPickupStatus,
    verifyReturnPickupOtp,
    verifyVendorHandoverOtp,
    verifyCustomerDeliveryOtp,
  } = useDeliveryAuthStore();

  const [activeTab, setActiveTab] = useState(() => {
    const params = new URLSearchParams(location.search);
    return params.get('tab') || 'deliveries';
  }); // deliveries, pickups
  const [filter, setFilter] = useState('all'); // all, pending, in-transit, completed
  const [returnFilter, setReturnFilter] = useState('all'); // all, offers, active, completed
  const [loadFailed, setLoadFailed] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 20;

  const [arrivedRequests, setArrivedRequests] = useState({});
  const [otpInputs, setOtpInputs] = useState({});
  const [otpVerifying, setOtpVerifying] = useState({});
  const [checklists, setChecklists] = useState({});
  const [riderPhotos, setRiderPhotos] = useState({});

  const getBackendStatusFilter = (value) => {
    if (value === 'all') return undefined;
    if (value === 'pending') return 'open';
    if (value === 'in-transit') return 'shipped';
    if (value === 'completed') return 'delivered';
    return undefined;
  };

  const formatVendorAddress = (addr) => {
    if (!addr) return '';
    if (typeof addr === 'string') return addr;
    const parts = [addr.street, addr.city, addr.state, addr.zipCode].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : 'Vendor address details';
  };

  const loadOrders = async (page = currentPage, activeFilter = filter) => {
    try {
      setLoadFailed(false);
      await fetchOrders({
        page,
        limit: PAGE_SIZE,
        status: getBackendStatusFilter(activeFilter),
      });
    } catch {
      setLoadFailed(true);
    }
  };

  const loadReturns = async () => {
    try {
      setLoadFailed(false);
      await fetchReturnPickups();
    } catch {
      setLoadFailed(true);
    }
  };

  const { deliveryBoy } = useDeliveryAuthStore();

  useEffect(() => {
    if (activeTab === 'deliveries') {
      loadOrders(currentPage, filter);
    } else {
      loadReturns();
    }

    const token = localStorage.getItem('delivery-token') || localStorage.getItem('token');
    if (token && deliveryBoy?.id) {
      const socket = getSocket(token);
      if (socket) {
        joinRoom(`delivery_${deliveryBoy.id}`);

        const handleOrderUpdate = () => {
          if (activeTab === 'deliveries') {
            loadOrders(currentPage, filter);
          }
        };

        const handleReturnUpdate = () => {
          if (activeTab === 'pickups') {
            loadReturns();
          }
        };

        socket.on('order_updated', handleOrderUpdate);
        socket.on('return_updated', handleReturnUpdate);

        return () => {
          socket.off('order_updated', handleOrderUpdate);
          socket.off('return_updated', handleReturnUpdate);
          leaveRoom(`delivery_${deliveryBoy.id}`);
        };
      }
    }
  }, [activeTab, currentPage, filter, deliveryBoy?.id]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get('tab');
    if (tab && (tab === 'deliveries' || tab === 'pickups')) {
      setActiveTab(tab);
    }
  }, [location.search]);

  const handleAcceptOrder = async (orderId) => {
    try {
      await acceptOrder(orderId);
      toast.success('Order accepted successfully');
    } catch {
      // Handled by API interceptor
    }
  };

  const handleCompleteOrder = async (orderId) => {
    const otp = window.prompt('Enter 6-digit delivery OTP shared by customer:');
    if (otp === null) return;
    if (!/^\d{6}$/.test(String(otp).trim())) {
      toast.error('Please enter a valid 6-digit OTP');
      return;
    }

    try {
      await completeOrder(orderId, String(otp).trim());
      toast.success('Order marked as delivered');
    } catch {
      // Handled by API interceptor
    }
  };

  // Return actions
  const handleAcceptReturn = async (id) => {
    try {
      await acceptReturnPickup(id);
      toast.success('Return pickup accepted');
      loadReturns();
    } catch {
      // Handled by API interceptor
    }
  };

  const handleRejectReturn = async (id) => {
    try {
      if (window.confirm('Are you sure you want to reject this return pickup offer?')) {
        await rejectReturnPickup(id);
        toast.success('Return pickup offer rejected');
        loadReturns();
      }
    } catch {
      // Handled by API interceptor
    }
  };

  const handleUpdateReturnStatus = async (id, nextStatus, label) => {
    try {
      if (window.confirm(`Mark this return pickup as ${label}?`)) {
        await updateReturnPickupStatus(id, nextStatus);
        toast.success(`Status updated to ${label}`);
        loadReturns();
      }
    } catch {
      // Handled by API interceptor
    }
  };

  const handleVerifyOtp = async (retId) => {
    const inputOtp = otpInputs[retId] || '';
    if (!inputOtp || inputOtp.length !== 6) {
      toast.error('Please enter a valid 6-digit OTP.');
      return;
    }

    setOtpVerifying((prev) => ({ ...prev, [retId]: true }));
    try {
      await verifyReturnPickupOtp(retId, inputOtp);
      toast.success('OTP verified successfully!');
      loadReturns();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Verification failed');
    } finally {
      setOtpVerifying((prev) => ({ ...prev, [retId]: false }));
    }
  };

  const handleVerifyVendorHandoverOtp = async (retId) => {
    const inputOtp = otpInputs[retId] || '';
    if (!inputOtp || inputOtp.length !== 6) {
      toast.error('Please enter a valid 6-digit OTP.');
      return;
    }

    setOtpVerifying((prev) => ({ ...prev, [retId]: true }));
    try {
      await verifyVendorHandoverOtp(retId, inputOtp);
      toast.success('Vendor Handover OTP verified successfully!');
      loadReturns();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Verification failed');
    } finally {
      setOtpVerifying((prev) => ({ ...prev, [retId]: false }));
    }
  };

  const handleVerifyCustomerDeliveryOtp = async (retId) => {
    const inputOtp = otpInputs[retId] || '';
    if (!inputOtp || inputOtp.length !== 6) {
      toast.error('Please enter a valid 6-digit OTP.');
      return;
    }

    setOtpVerifying((prev) => ({ ...prev, [retId]: true }));
    try {
      await verifyCustomerDeliveryOtp(retId, inputOtp);
      toast.success('Customer Delivery OTP verified successfully!');
      loadReturns();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Verification failed');
    } finally {
      setOtpVerifying((prev) => ({ ...prev, [retId]: false }));
    }
  };

  const handlePickupReturnWithChecklist = async (retId, reason) => {
    try {
      const files = riderPhotos[retId] || [];
      const evidenceRequiredReasons = [
        "Product Damaged",
        "Wrong Product Received",
        "Missing Parts or Accessories",
        "Product Not Matching Description",
        "Defective Product"
      ];
      const isEvidenceBased = evidenceRequiredReasons.includes(reason);
      if (isEvidenceBased && files.length === 0) {
        toast.error(`At least one pickup photo is required for reason: ${reason}`);
        return;
      }

      if (window.confirm('Mark this return pickup as Picked Up?')) {
        const formData = new FormData();
        files.forEach((file) => {
          formData.append('photos', file);
        });

        await updateReturnPickupStatus(retId, 'picked_up', formData);
        toast.success('Status updated to Picked Up');
        loadReturns();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Update failed');
    }
  };

  const handlePreviousPage = () => {
    setCurrentPage((prev) => Math.max(1, prev - 1));
  };

  const handleNextPage = () => {
    setCurrentPage((prev) => Math.min(Number(ordersPagination?.pages || 1), prev + 1));
  };

  // Filter return requests in memory
  const filteredReturns = (returnPickups || []).filter((item) => {
    if (returnFilter === 'all') return true;
    if (returnFilter === 'offers') return item.deliveryAssignmentStatus === 'assigned';
    if (returnFilter === 'active') return ['pickup_assigned', 'picked_up'].includes(item.status);
    if (returnFilter === 'completed') return ['delivered_to_vendor', 'completed'].includes(item.status);
    return true;
  });

  return (
    <PageTransition>
      <div className="px-4 py-6 space-y-5 max-w-5xl mx-auto pb-24">
        
        {/* Toggle between Forward Deliveries and Return Pickups */}
        <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200/50">
          <button
            onClick={() => {
              setActiveTab('deliveries');
              setCurrentPage(1);
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
              activeTab === 'deliveries'
                ? 'bg-white text-primary-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <FiPackage className="text-sm" />
            Deliveries
          </button>
          <button
            onClick={() => {
              setActiveTab('pickups');
              setCurrentPage(1);
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-black uppercase tracking-wider rounded-xl transition-all ${
              activeTab === 'pickups'
                ? 'bg-white text-primary-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <FiRefreshCw className="text-sm" />
            Return Pickups
          </button>
        </div>

        {/* Tab Header */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-2"
        >
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-800 uppercase tracking-wide">
              {activeTab === 'deliveries' ? 'Assigned Deliveries' : 'Return Pickups'}
            </h1>
            <p className="text-xs text-slate-400 font-bold mt-0.5">
              {activeTab === 'deliveries'
                ? 'Manage forward order details'
                : 'Collect items from customers and deliver to shops'}
            </p>
          </div>
          <span className="text-xs font-bold text-slate-500 bg-slate-100 border border-slate-200 px-3 py-1 rounded-full w-fit">
            {activeTab === 'deliveries'
              ? `${Number(ordersPagination?.total || orders.length)} orders`
              : `${filteredReturns.length} returns`}
          </span>
        </motion.div>

        {/* Filters */}
        {activeTab === 'deliveries' ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex gap-2 overflow-x-auto pb-2 scrollbar-none no-scrollbar -mx-4 px-4 max-w-[100vw]"
          >
            {['all', 'pending', 'in-transit', 'completed'].map((tab) => (
              <button
                key={tab}
                onClick={() => {
                  setFilter(tab);
                  setCurrentPage(1);
                }}
                className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap shrink-0 transition-all ${
                  filter === tab
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1).replace('-', ' ')}
              </button>
            ))}
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex gap-2 overflow-x-auto pb-2 scrollbar-none no-scrollbar -mx-4 px-4 max-w-[100vw]"
          >
            {[
              { id: 'all', label: 'All Returns' },
              { id: 'offers', label: 'New Offers' },
              { id: 'active', label: 'Active Pickups' },
              { id: 'completed', label: 'Completed' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setReturnFilter(tab.id)}
                className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap shrink-0 transition-all ${
                  returnFilter === tab.id
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </motion.div>
        )}

        {/* Dynamic Lists */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
          {activeTab === 'deliveries' ? (
            // Forward Deliveries list (Original code structure maintained)
            isLoadingOrders ? (
              <div className="text-center py-12 col-span-full">
                <p className="text-slate-400 text-xs font-bold">Loading orders...</p>
              </div>
            ) : loadFailed ? (
              <div className="text-center py-12 col-span-full">
                <FiXCircle className="text-red-400 text-5xl mx-auto mb-4" />
                <p className="text-gray-700 mb-3">Could not load orders.</p>
                <button
                  onClick={() => loadOrders(currentPage, filter)}
                  className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-semibold"
                >
                  Retry
                </button>
              </div>
            ) : orders.length === 0 ? (
              <div className="text-center py-12 col-span-full">
                <FiPackage className="text-gray-400 text-5xl mx-auto mb-4" />
                <p className="text-gray-600">No orders found</p>
              </div>
            ) : (
              orders.map((order, index) => {
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
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    onClick={() => navigate(`/delivery/orders/${order.id}`)}
                    className="bg-white border border-slate-100 hover:border-slate-200 rounded-3xl p-4 shadow-sm hover:shadow-md transition-all duration-300 relative pl-6 flex flex-col gap-3 group cursor-pointer"
                  >
                    <div className={`absolute top-0 bottom-0 left-0 w-1.5 rounded-l-3xl ${currentStatus.bar}`} />
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="font-mono text-xs font-bold text-slate-500 bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-md">
                          {order.id}
                        </span>
                        <p className="text-sm font-bold text-slate-800 mt-1.5">{order.customer}</p>
                        <p className="text-[10px] text-slate-400 font-bold font-mono">{order.phone || 'Phone unavailable'}</p>
                      </div>
                      <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${currentStatus.badge}`}>
                        {currentStatus.label}
                      </span>
                    </div>

                    <div className="flex items-start gap-2 p-3 bg-slate-50/50 border border-slate-50 rounded-2xl">
                      <FiMapPin className="text-primary-600 mt-0.5 flex-shrink-0 text-sm" />
                      <p className="text-xs font-semibold text-slate-500 leading-tight">{order.address || 'Address unavailable'}</p>
                    </div>

                    <div className="flex items-center justify-between border-b border-slate-50 pb-3 mb-1">
                      <div className="flex items-center gap-3 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                        <div className="flex items-center gap-1">
                          <FiPackage />
                          <span>{Array.isArray(order.items) ? order.items.length : 0} items</span>
                        </div>
                        <div className="w-1 h-1 rounded-full bg-slate-200" />
                        <div className="flex items-center gap-1">
                          <FiNavigation />
                          <span>{order.distance || '-'}</span>
                        </div>
                      </div>
                      <p className="font-black text-slate-800 text-sm font-mono">{formatPrice(order.amount)}</p>
                    </div>

                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                      {order.status === 'pending' && (
                        <button
                          onClick={() => handleAcceptOrder(order.id)}
                          disabled={isUpdatingOrderStatus}
                          className="flex-1 px-4 py-2 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm disabled:opacity-60"
                        >
                          {isUpdatingOrderStatus ? 'Please wait...' : 'Accept Order'}
                        </button>
                      )}
                      {order.status === 'in-transit' && (
                        <button
                          onClick={() => handleCompleteOrder(order.id)}
                          disabled={isUpdatingOrderStatus}
                          className="flex-1 px-4 py-2 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm disabled:opacity-60"
                        >
                          {isUpdatingOrderStatus ? 'Please wait...' : 'Mark Complete'}
                        </button>
                      )}
                      <button
                        onClick={() => navigate(`/delivery/orders/${order.id}`)}
                        className="flex-1 px-4 py-2 bg-slate-50 hover:bg-primary-600 hover:text-white border border-gray-100 text-slate-700 hover:border-transparent rounded-xl text-xs font-bold transition-all shadow-sm"
                      >
                        View Details
                      </button>
                    </div>
                  </motion.div>
                );
              })
            )
          ) : (
            // Return Pickups list
            isLoadingReturns ? (
              <div className="text-center py-12 col-span-full">
                <p className="text-slate-400 text-xs font-bold">Loading return requests...</p>
              </div>
            ) : filteredReturns.length === 0 ? (
              <div className="text-center py-12 col-span-full">
                <FiRefreshCw className="text-gray-400 text-5xl mx-auto mb-4 animate-spin-slow" />
                <p className="text-gray-600">No return requests found</p>
              </div>
            ) : (
              filteredReturns.map((ret, index) => {
                const isExchange = ret.requestType === 'exchange';
                const isReplacementLeg2 = isExchange && ['replacement_ready', 'replacement_assigned', 'out_for_delivery', 'completed'].includes(ret.status);
                const isOffer = ret.deliveryAssignmentStatus === 'assigned';
                
                const statusMap = {
                  pickup_pending: {
                    bar: 'bg-yellow-500',
                    badge: 'bg-yellow-50 text-yellow-750 border-yellow-100',
                    label: 'Awaiting Acceptance',
                  },
                  pickup_assigned: {
                    bar: 'bg-blue-500',
                    badge: 'bg-blue-50 text-blue-755 border-blue-100',
                    label: 'Pickup Assigned',
                  },
                  picked_up: {
                    bar: 'bg-indigo-650',
                    badge: 'bg-indigo-50 text-indigo-700 border-indigo-100',
                    label: 'Items Picked Up',
                  },
                  delivered_to_vendor: {
                    bar: 'bg-teal-500',
                    badge: 'bg-teal-50 text-teal-750 border-teal-100',
                    label: 'Delivered back to shop',
                  },
                  replacement_ready: {
                    bar: 'bg-purple-500',
                    badge: 'bg-purple-50 text-purple-750 border-purple-100',
                    label: 'Replacement Ready',
                  },
                  replacement_assigned: {
                    bar: 'bg-blue-500',
                    badge: 'bg-blue-50 text-blue-755 border-blue-100',
                    label: 'Replacement Assigned',
                  },
                  out_for_delivery: {
                    bar: 'bg-indigo-650',
                    badge: 'bg-indigo-50 text-indigo-750 border-indigo-100',
                    label: 'Out for Delivery',
                  },
                  completed: {
                    bar: 'bg-emerald-500',
                    badge: 'bg-emerald-50 text-emerald-700 border-emerald-100',
                    label: 'Completed',
                  }
                };

                const currentStatus = statusMap[ret.status] || statusMap.pickup_pending;

                return (
                  <motion.div
                    key={ret._id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    onClick={() => navigate(`/delivery/return-pickups/${ret._id}`)}
                    className="bg-white border border-slate-100 hover:border-slate-200 rounded-3xl p-4 shadow-sm hover:shadow-md transition-all duration-300 relative pl-6 flex flex-col gap-3 group cursor-pointer"
                  >
                    <div className={`absolute top-0 bottom-0 left-0 w-1.5 rounded-l-3xl ${currentStatus.bar}`} />
                    
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[9px] font-black uppercase tracking-wider">
                            {isReplacementLeg2 ? 'Replacement Delivery' : 'Return Pickup'}
                          </span>
                          <span className="font-mono text-[9px] font-black text-slate-500 bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-md">
                            ID: {String(ret._id).slice(-6).toUpperCase()}
                          </span>
                        </div>
                        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1.5 leading-none">
                          {isReplacementLeg2 ? 'Pickup from Shop:' : 'Pickup from Customer:'}
                        </h3>
                        <p className="text-sm font-bold text-slate-800 mt-1 leading-tight break-words">
                          {isReplacementLeg2 
                            ? (ret.vendorId?.storeName || ret.vendorId?.shopName || 'Vendor Shop')
                            : (ret.orderId?.shippingAddress?.name || 'Customer')
                          }
                        </p>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider border shrink-0 w-fit ${currentStatus.badge}`}>
                        {currentStatus.label}
                      </span>
                    </div>

                    {/* Pickup Location Details */}
                    <div className="flex items-start gap-2 p-3 bg-slate-50/50 border border-slate-100 rounded-2xl min-w-0">
                      <FiMapPin className="text-primary-650 mt-0.5 flex-shrink-0 text-sm" />
                      <p className="text-xs font-semibold text-slate-650 leading-tight break-words min-w-0">
                        {isReplacementLeg2 
                          ? (formatVendorAddress(ret.vendorId?.address) || 'Vendor shop address')
                          : (ret.orderId?.shippingAddress?.address || 'Customer pickup location')
                        }
                      </p>
                    </div>

                    {/* Destination Handoff Details */}
                    <div className="border-t border-dashed border-slate-200 pt-2.5 space-y-1.5 min-w-0">
                      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">
                        {isReplacementLeg2 ? 'Deliver to Customer:' : 'Deliver back to Vendor:'}
                      </h3>
                      <div className="flex items-center gap-2 min-w-0">
                        <FiTruck className="text-slate-450 text-xs flex-shrink-0" />
                        <span className="text-xs font-black text-slate-700 truncate">
                          {isReplacementLeg2
                            ? (ret.orderId?.shippingAddress?.name || 'Customer')
                            : (ret.vendorId?.storeName || ret.vendorId?.shopName || 'Vendor Shop')
                          }
                        </span>
                      </div>
                      <div className="flex items-start gap-1.5 min-w-0">
                        <FiMapPin className="text-slate-450 text-xs flex-shrink-0 mt-0.5" />
                        <p className="text-[11px] font-semibold text-slate-500 leading-tight break-words min-w-0">
                          {isReplacementLeg2
                            ? (ret.orderId?.shippingAddress?.address || 'Customer shipping address')
                            : (formatVendorAddress(ret.vendorId?.address) || 'Vendor shop address')
                          }
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                      <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500 font-bold uppercase tracking-wider min-w-0 flex-1">
                        <span>Items: {ret.items?.length || 0}</span>
                        <div className="w-1 h-1 rounded-full bg-slate-300" />
                        <span className="truncate max-w-[150px]">Reason: {ret.returnReason}</span>
                      </div>
                      <p className="font-black text-slate-800 text-xs font-mono shrink-0 ml-auto">{formatPrice(ret.refundAmount)}</p>
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-col sm:flex-row gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                      {isOffer ? (
                        <>
                          <button
                            onClick={() => handleAcceptReturn(ret._id)}
                            className="w-full flex-1 px-3 py-2.5 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                          >
                            {isReplacementLeg2 ? 'Accept Delivery' : 'Accept Pickup'}
                          </button>
                          <button
                            onClick={() => handleRejectReturn(ret._id)}
                            className="w-full flex-1 px-3 py-2.5 bg-slate-50 hover:bg-red-50 text-slate-600 hover:text-red-600 border border-slate-200 rounded-xl text-xs font-bold transition-all"
                          >
                            Reject
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => navigate(`/delivery/return-pickups/${ret._id}`)}
                          className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-extrabold transition-all shadow-sm flex items-center justify-center gap-1.5"
                        >
                          View Details & Process Pickup →
                        </button>
                      )}
                    </div>
                  </motion.div>
                );
              })
            )
          )}
        </div>

        {activeTab === 'deliveries' && !isLoadingOrders && !loadFailed && Number(ordersPagination?.pages || 1) > 1 && (
          <div className="flex items-center justify-between bg-white rounded-3xl border border-slate-100 px-4 py-3 shadow-sm">
            <button
              onClick={handlePreviousPage}
              disabled={currentPage <= 1}
              className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-100 hover:bg-slate-100 text-slate-600 text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">
              Page {currentPage} of {Number(ordersPagination?.pages || 1)}
            </span>
            <button
              onClick={handleNextPage}
              disabled={currentPage >= Number(ordersPagination?.pages || 1)}
              className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-100 hover:bg-slate-100 text-slate-600 text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </PageTransition>
  );
};

export default DeliveryOrders;
