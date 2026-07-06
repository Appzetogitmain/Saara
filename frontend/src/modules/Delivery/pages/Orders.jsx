import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiPackage, FiMapPin, FiClock, FiCheckCircle, FiXCircle, FiNavigation, FiChevronRight, FiRefreshCw, FiTruck, FiCheck } from 'react-icons/fi';
import { useNavigate, useLocation } from 'react-router-dom';
import PageTransition from '../../../shared/components/PageTransition';
import { formatPrice } from '../../../shared/utils/helpers';
import toast from 'react-hot-toast';
import { useDeliveryAuthStore } from '../store/deliveryStore';

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

  useEffect(() => {
    if (activeTab === 'deliveries') {
      loadOrders(currentPage, filter);
    } else {
      loadReturns();
    }
  }, [activeTab, currentPage, filter]);

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
          className="flex items-center justify-between"
        >
          <div>
            <h1 className="text-2xl font-black text-slate-800 uppercase tracking-wide">
              {activeTab === 'deliveries' ? 'Assigned Deliveries' : 'Return Pickups'}
            </h1>
            <p className="text-xs text-slate-400 font-bold mt-0.5">
              {activeTab === 'deliveries'
                ? 'Manage forwards orders details'
                : 'Collect items from customers and deliver to shops'}
            </p>
          </div>
          <span className="text-xs font-bold text-slate-400 bg-slate-50 border border-slate-100 px-3 py-1 rounded-full">
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
            className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-4 px-4"
          >
            {['all', 'pending', 'in-transit', 'completed'].map((tab) => (
              <button
                key={tab}
                onClick={() => {
                  setFilter(tab);
                  setCurrentPage(1);
                }}
                className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                  filter === tab
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'bg-slate-50 border border-slate-100 text-slate-500 hover:text-slate-800'
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
            className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-4 px-4"
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
                className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                  returnFilter === tab.id
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'bg-slate-50 border border-slate-100 text-slate-500 hover:text-slate-800'
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
                    className="bg-white border border-slate-100 hover:border-slate-200 rounded-3xl p-4 shadow-sm hover:shadow-md transition-all duration-300 relative pl-6 flex flex-col gap-3 group"
                  >
                    <div className={`absolute top-0 bottom-0 left-0 w-1.5 rounded-l-3xl ${currentStatus.bar}`} />
                    
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[8px] font-black uppercase tracking-wider mr-1.5">
                          {isReplacementLeg2 ? 'Replacement Delivery' : 'Return Pickup'}
                        </span>
                        <span className="font-mono text-[9px] font-black text-slate-500 bg-slate-50 border border-slate-100 px-2 py-0.5 rounded-md inline-block">
                          ID: {String(ret._id).slice(-6).toUpperCase()}
                        </span>
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mt-2 leading-none">
                          {isReplacementLeg2 ? 'Pickup from Shop:' : 'Pickup from Customer:'}
                        </h3>
                        <p className="text-sm font-bold text-slate-800 mt-1 leading-tight">
                          {isReplacementLeg2 
                            ? (ret.vendorId?.storeName || ret.vendorId?.shopName || 'Vendor Shop')
                            : (ret.orderId?.shippingAddress?.name || 'Customer')
                          }
                        </p>
                      </div>
                      <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${currentStatus.badge}`}>
                        {currentStatus.label}
                      </span>
                    </div>

                    {/* Pickup Location Details */}
                    <div className="flex items-start gap-2 p-3 bg-slate-50/50 border border-slate-50 rounded-2xl">
                      <FiMapPin className="text-primary-650 mt-0.5 flex-shrink-0 text-sm" />
                      <p className="text-xs font-semibold text-slate-650 leading-tight">
                        {isReplacementLeg2 
                          ? (formatVendorAddress(ret.vendorId?.address) || 'Vendor shop address')
                          : (ret.orderId?.shippingAddress?.address || 'Customer pickup location')
                        }
                      </p>
                    </div>

                    {/* Destination Handoff Details */}
                    <div className="border-t border-dashed border-slate-150 pt-2.5 space-y-1.5">
                      <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">
                        {isReplacementLeg2 ? 'Deliver to Customer:' : 'Deliver back to Vendor:'}
                      </h3>
                      <div className="flex items-center gap-2">
                        <FiTruck className="text-slate-450 text-xs flex-shrink-0" />
                        <span className="text-xs font-black text-slate-700 truncate">
                          {isReplacementLeg2
                            ? (ret.orderId?.shippingAddress?.name || 'Customer')
                            : (ret.vendorId?.storeName || ret.vendorId?.shopName || 'Vendor Shop')
                          }
                        </span>
                      </div>
                      <div className="flex items-start gap-1.5">
                        <FiMapPin className="text-slate-450 text-xs flex-shrink-0 mt-0.5" />
                        <p className="text-[11px] font-semibold text-slate-500 leading-tight">
                          {isReplacementLeg2
                            ? (ret.orderId?.shippingAddress?.address || 'Customer shipping address')
                            : (formatVendorAddress(ret.vendorId?.address) || 'Vendor shop address')
                          }
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-slate-50 pt-3">
                      <div className="flex items-center gap-3 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                        <span>Items: {ret.items?.length || 0}</span>
                        <div className="w-1 h-1 rounded-full bg-slate-200" />
                        <span>Reason: {ret.returnReason}</span>
                      </div>
                      <p className="font-black text-slate-800 text-xs font-mono">{formatPrice(ret.refundAmount)}</p>
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-2">
                      {isOffer ? (
                        <>
                          <button
                            onClick={() => handleAcceptReturn(ret._id)}
                            className="flex-1 px-3 py-2 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                          >
                            {isReplacementLeg2 ? 'Accept Delivery' : 'Accept Pickup'}
                          </button>
                          <button
                            onClick={() => handleRejectReturn(ret._id)}
                            className="flex-1 px-3 py-2 bg-slate-50 hover:bg-red-50 text-slate-600 hover:text-red-600 border border-slate-100 rounded-xl text-xs font-bold transition-all"
                          >
                            Reject
                          </button>
                        </>
                      ) : (
                        <>
                           {ret.status === 'pickup_assigned' && (
                            <div className="w-full space-y-4 border-t border-dashed border-slate-100 pt-3 mt-3">
                              {/* Steps Indicator */}
                              <div className="bg-slate-50 rounded-2xl p-3 border border-slate-100 space-y-2">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Steps to Complete Return Pickup</h4>
                                <div className="grid grid-cols-4 gap-1 text-center">
                                  <div className="flex flex-col items-center">
                                    <span className="w-4 h-4 rounded-full bg-indigo-600 text-white text-[9px] font-black flex items-center justify-center">1</span>
                                    <span className="text-[8px] font-bold text-indigo-600 mt-1">Reach Location</span>
                                  </div>
                                  <div className="flex flex-col items-center">
                                    <span className={`w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center ${ret.returnPickupOtpVerified ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'}`}>2</span>
                                    <span className={`text-[8px] font-bold mt-1 ${ret.returnPickupOtpVerified ? 'text-indigo-600' : 'text-slate-400'}`}>Verify OTP</span>
                                  </div>
                                  <div className="flex flex-col items-center">
                                    <span className={`w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center ${ret.returnPickupOtpVerified && Object.keys(checklists[ret._id] || {}).filter(k => checklists[ret._id][k]).length === 8 ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'}`}>3</span>
                                    <span className="text-[8px] font-bold text-slate-400 mt-1">Verify Items</span>
                                  </div>
                                  <div className="flex flex-col items-center">
                                    <span className="w-4 h-4 rounded-full bg-slate-200 text-slate-500 text-[9px] font-black flex items-center justify-center">4</span>
                                    <span className="text-[8px] font-bold text-slate-400 mt-1">Mark Pickup</span>
                                  </div>
                                </div>
                              </div>

                              {/* Instructions Card */}
                              <div className="bg-amber-50/30 border border-amber-200/50 rounded-2xl p-3 space-y-1.5">
                                <h4 className="text-[10px] font-black text-amber-800 uppercase tracking-widest flex items-center gap-1">📋 Return Instructions</h4>
                                <ul className="text-[10px] font-bold text-amber-700/90 list-disc list-inside space-y-0.5">
                                  <li>Check customer matches the details and request OTP.</li>
                                  <li>Ensure original tags, packaging, and accessories are present.</li>
                                  <li>Confirm variant color and sizes match return request.</li>
                                  <li>{["Product Damaged", "Wrong Product Received", "Missing Parts or Accessories", "Product Not Matching Description", "Defective Product"].includes(ret.returnReason) ? 'Take evidence photos (Required).' : 'Take photos of package condition (Optional).'}</li>
                                </ul>
                              </div>

                              {/* Step 1: Reach Customer Location Toggle */}
                              {!arrivedRequests[ret._id] ? (
                                <button
                                  onClick={() => setArrivedRequests((prev) => ({ ...prev, [ret._id]: true }))}
                                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5"
                                >
                                  📍 I'm at Customer Location
                                </button>
                              ) : (
                                <div className="space-y-4 border-t border-slate-100 pt-3">
                                  {/* Step 2: OTP Verification */}
                                  {!ret.returnPickupOtpVerified ? (
                                    <div className="space-y-2 bg-indigo-50/20 border border-indigo-150 p-3 rounded-2xl">
                                      <label className="text-[10px] font-black text-indigo-900 uppercase tracking-wider block">Enter Customer OTP</label>
                                      <div className="flex gap-2">
                                        <input
                                          type="text"
                                          maxLength={6}
                                          placeholder="Enter 6-digit OTP"
                                          value={otpInputs[ret._id] || ''}
                                          onChange={(e) => setOtpInputs((prev) => ({ ...prev, [ret._id]: e.target.value.replace(/\D/g, '') }))}
                                          className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold font-mono tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        />
                                        <button
                                          onClick={() => handleVerifyOtp(ret._id)}
                                          disabled={otpVerifying[ret._id]}
                                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors disabled:bg-indigo-400"
                                        >
                                          {otpVerifying[ret._id] ? 'Verifying...' : 'Verify OTP'}
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="space-y-4">
                                      {/* OTP Success badge */}
                                      <div className="flex items-center gap-1.5 text-xs font-black text-green-700 bg-green-50 border border-green-150 p-2.5 rounded-xl">
                                        <FiCheck className="text-sm" />
                                        <span>Customer Verification Successful (OTP Verified)</span>
                                      </div>

                                      {/* Customer Claims Evidence Previews */}
                                      {ret.evidenceImages && ret.evidenceImages.length > 0 && (
                                        <div className="space-y-1.5 p-3 bg-slate-50/50 border border-slate-50 rounded-2xl">
                                          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Customer Uploaded Photos:</h4>
                                          <div className="flex gap-1.5 overflow-x-auto py-1">
                                            {ret.evidenceImages.map((img, idx) => (
                                              <a href={img.url} target="_blank" rel="noopener noreferrer" key={idx} className="w-12 h-12 rounded-lg border border-slate-200 overflow-hidden flex-shrink-0 flex items-center justify-center bg-black hover:opacity-85 transition-opacity">
                                                <img src={img.url} className="w-full h-full object-cover" alt="customer-evidence" />
                                              </a>
                                            ))}
                                          </div>
                                        </div>
                                      )}

                                      {/* Product Detail Card */}
                                      <div className="bg-slate-50/80 border border-slate-100 rounded-2xl p-3 space-y-1.5">
                                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Target Item Details:</h4>
                                        {ret.items && ret.items.map((item, idx) => (
                                          <div key={idx} className="flex gap-3">
                                            {item.image && (
                                              <img src={item.image} className="w-10 h-10 rounded-lg object-cover border border-slate-150 flex-shrink-0" alt="product" />
                                            )}
                                            <div>
                                              <p className="text-xs font-bold text-slate-800 leading-tight">{item.name}</p>
                                              <p className="text-[10px] font-bold text-slate-400 mt-0.5">Quantity: {item.quantity}</p>
                                            </div>
                                          </div>
                                        ))}
                                      </div>

                                      {/* Step 3: Product Checklist */}
                                      <div className="bg-slate-50/50 border border-slate-50 p-3 rounded-2xl space-y-2.5">
                                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Rider Verification Checklist</h4>
                                        <div className="space-y-2">
                                          {[
                                            { id: 'match', label: 'Product matches the order' },
                                            { id: 'qty', label: 'Correct quantity received' },
                                            { id: 'variant', label: 'Correct size/color' },
                                            { id: 'brand', label: 'Brand matches' },
                                            { id: 'tag', label: 'Original tags attached' },
                                            { id: 'accessories', label: 'Accessories included' },
                                            { id: 'sealed', label: 'Package is sealed (if applicable)' },
                                            { id: 'condition', label: 'Product condition matches return reason' }
                                          ].map((check) => {
                                            const isChecked = checklists[ret._id]?.[check.id] || false;
                                            return (
                                              <label key={check.id} className="flex items-start gap-2.5 cursor-pointer select-none">
                                                <input
                                                  type="checkbox"
                                                  checked={isChecked}
                                                  onChange={(e) => {
                                                    const val = e.target.checked;
                                                    setChecklists((prev) => ({
                                                      ...prev,
                                                      [ret._id]: {
                                                        ...(prev[ret._id] || {}),
                                                        [check.id]: val
                                                      }
                                                    }));
                                                  }}
                                                  className="mt-0.5 w-3.5 h-3.5 border-slate-300 rounded focus:ring-indigo-500 text-indigo-600"
                                                />
                                                <span className={`text-xs font-semibold ${isChecked ? 'text-slate-855' : 'text-slate-500'}`}>{check.label}</span>
                                              </label>
                                            );
                                          })}
                                        </div>
                                      </div>

                                      {/* Step 4: Photo Capture */}
                                      <div className="bg-slate-50/50 border border-slate-50 p-3 rounded-2xl space-y-2.5">
                                        <div className="flex justify-between items-center">
                                          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Capture Pickup Proof</h4>
                                          {["Product Damaged", "Wrong Product Received", "Missing Parts or Accessories", "Product Not Matching Description", "Defective Product"].includes(ret.returnReason) && (
                                            <span className="text-[9px] font-black uppercase text-red-650 bg-red-50 px-2 py-0.5 rounded border border-red-150">Required</span>
                                          )}
                                        </div>
                                        <input
                                          type="file"
                                          multiple
                                          accept="image/*"
                                          id={`rider-photo-upload-${ret._id}`}
                                          className="hidden"
                                          onChange={(e) => {
                                            const newFiles = Array.from(e.target.files || []);
                                            setRiderPhotos((prev) => ({
                                              ...prev,
                                              [ret._id]: [...(prev[ret._id] || []), ...newFiles].slice(0, 5)
                                            }));
                                          }}
                                        />
                                        <div className="flex flex-wrap gap-2">
                                          <label
                                            htmlFor={`rider-photo-upload-${ret._id}`}
                                            className="w-12 h-12 bg-white hover:bg-slate-50 border border-dashed border-slate-300 rounded-lg flex flex-col items-center justify-center cursor-pointer text-slate-400 hover:text-slate-655 transition-all shadow-sm"
                                          >
                                            <span className="text-lg font-black leading-none">+</span>
                                            <span className="text-[7px] font-black uppercase tracking-wider mt-0.5">Photo</span>
                                          </label>
                                          {riderPhotos[ret._id] && riderPhotos[ret._id].map((file, fIdx) => (
                                            <div key={fIdx} className="w-12 h-12 rounded-lg border border-slate-150 overflow-hidden relative group bg-black">
                                              <img src={URL.createObjectURL(file)} className="w-full h-full object-cover" alt="rider-proof" />
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setRiderPhotos((prev) => ({
                                                    ...prev,
                                                    [ret._id]: prev[ret._id].filter((_, idx) => idx !== fIdx)
                                                  }));
                                                }}
                                                className="absolute top-0.5 right-0.5 w-3.5 h-3.5 bg-black/60 hover:bg-red-650 text-white rounded-full flex items-center justify-center text-[8px] font-bold transition-colors"
                                              >
                                                ×
                                              </button>
                                            </div>
                                          ))}
                                        </div>
                                      </div>

                                      {/* Complete Action Button */}
                                      <button
                                        onClick={() => handlePickupReturnWithChecklist(ret._id, ret.returnReason)}
                                        disabled={
                                          Object.keys(checklists[ret._id] || {}).filter(k => checklists[ret._id][k]).length < 8 ||
                                          (["Product Damaged", "Wrong Product Received", "Missing Parts or Accessories", "Product Not Matching Description", "Defective Product"].includes(ret.returnReason) && (!riderPhotos[ret._id] || riderPhotos[ret._id].length === 0))
                                        }
                                        className="w-full py-2.5 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 disabled:from-slate-150 disabled:to-slate-200 text-white rounded-xl text-xs font-bold transition-all shadow-sm disabled:cursor-not-allowed"
                                      >
                                        Mark Picked Up
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                          {ret.status === 'picked_up' && (
                            <div className="w-full p-4 bg-indigo-50 border border-indigo-200 rounded-2xl space-y-3 mt-2">
                              <h4 className="text-xs font-black text-indigo-900 uppercase tracking-widest flex items-center gap-1.5">
                                🔑 Vendor Handoff OTP
                              </h4>
                              <p className="text-[11px] text-indigo-700 font-semibold leading-relaxed">
                                Share this verification code with the shop vendor when delivering the items. The vendor must enter it on their portal to confirm delivery.
                              </p>
                              <div className="text-center bg-white border border-indigo-200 rounded-xl py-3 font-mono text-2xl font-black tracking-widest text-indigo-950 shadow-sm">
                                {ret.vendorHandoffOtpDebug || '123456'}
                              </div>
                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider text-center">
                                Status: In Transit to Shop
                              </p>
                            </div>
                          )}
                          {ret.status === 'delivered_to_vendor' && (
                            <span className="flex-1 text-center py-2 px-3 bg-slate-50 border border-slate-100 text-slate-400 rounded-xl text-[10px] font-bold uppercase tracking-wider">
                              Awaiting Vendor Confirmation
                            </span>
                          )}
                          {ret.status === 'replacement_assigned' && (
                            <button
                              onClick={() => handleUpdateReturnStatus(ret._id, 'out_for_delivery', 'Out for Delivery')}
                              className="flex-1 px-3 py-2 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                            >
                              Mark Picked Up Replacement
                            </button>
                          )}
                          {ret.status === 'out_for_delivery' && (
                            <button
                              onClick={() => handleUpdateReturnStatus(ret._id, 'completed', 'Completed')}
                              className="flex-1 px-3 py-2 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                            >
                              Mark Replacement Delivered
                            </button>
                          )}
                          {ret.status === 'completed' && (
                            <span className="flex-1 text-center py-2 px-3 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-xl text-[10px] font-bold uppercase tracking-wider">
                              {isExchange ? 'Exchange Completed' : 'Refund Settled'}
                            </span>
                          )}
                        </>
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
