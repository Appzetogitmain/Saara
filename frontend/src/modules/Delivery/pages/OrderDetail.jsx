import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  FiArrowLeft,
  FiMapPin,
  FiPhone,
  FiClock,
  FiPackage,
  FiNavigation,
  FiCheckCircle,
  FiUser,
  FiTrendingUp,
} from 'react-icons/fi';
import PageTransition from '../../../shared/components/PageTransition';
import { getSocket, joinRoom, leaveRoom } from '../../../shared/utils/socket';
import { formatPrice } from '../../../shared/utils/helpers';
import toast from 'react-hot-toast';
import { useDeliveryAuthStore } from '../store/deliveryStore';

const DeliveryOrderDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { fetchOrderById, acceptOrder, rejectOrder, completeOrder, resendDeliveryOtp, updateOrderStatus, isLoadingOrder, isUpdatingOrderStatus } = useDeliveryAuthStore();
  const [order, setOrder] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [deliveryOtp, setDeliveryOtp] = useState('');
  const [isResendingOtp, setIsResendingOtp] = useState(false);

  const loadOrder = useCallback(async (isBackground = false) => {
    try {
      setLoadFailed(false);
      setErrorMsg('');
      const response = await fetchOrderById(id, isBackground);
      setOrder(response);
    } catch (err) {
      setLoadFailed(true);
      setOrder(null);
      const apiMessage = err?.response?.data?.message || err?.message || 'Unable to load order details';
      setErrorMsg(apiMessage);
    }
  }, [id, fetchOrderById]);

  useEffect(() => {
    let mounted = true;

    const loadOrderData = async (isBackground = false) => {
      if (mounted) {
        await loadOrder(isBackground);
      }
    };

    loadOrderData(false);

    const token = localStorage.getItem('delivery-token') || localStorage.getItem('token');
    if (token && id) {
      const socket = getSocket(token);
      if (socket) {
        joinRoom(`order_${id}`);

        const handleOrderUpdate = (updatedOrder) => {
          const isMatch = String(updatedOrder._id) === String(id) || String(updatedOrder.orderId) === String(id);
          if (isMatch && mounted) {
            loadOrder(true);
          }
        };

        const handleReturnUpdate = (updatedReturn) => {
          if (String(updatedReturn.orderId) === String(id) && mounted) {
            loadOrder(true);
          }
        };

        socket.on('order_updated', handleOrderUpdate);
        socket.on('return_updated', handleReturnUpdate);

        return () => {
          mounted = false;
          socket.off('order_updated', handleOrderUpdate);
          socket.off('return_updated', handleReturnUpdate);
          leaveRoom(`order_${id}`);
        };
      }
    }

    return () => {
      mounted = false;
    };
  }, [id, loadOrder]);

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'in-transit':
        return 'bg-blue-100 text-blue-800';
      case 'completed':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const handleAcceptOrder = async () => {
    if (!order) return;
    try {
      const updated = await acceptOrder(order.id);
      setOrder(updated);
      toast.success('Order accepted successfully');
    } catch {
      // Error toast handled by API interceptor.
    }
  };

  const handleRejectOrder = async () => {
    if (!order) return;
    try {
      await rejectOrder(order.id);
      toast.success('Order rejected successfully');
      navigate('/delivery/orders');
    } catch {
      // Error toast handled by API interceptor.
    }
  };

  const handleCompleteOrder = async () => {
    if (!order || order.status !== 'in-transit') return;
    const normalizedOtp = String(deliveryOtp || '').trim();
    if (!/^\d{6}$/.test(normalizedOtp)) {
      toast.error('Please enter valid 6-digit OTP');
      return;
    }

    try {
      const updated = await completeOrder(order.id, normalizedOtp);
      setOrder(updated);
      setDeliveryOtp('');
      toast.success('Order marked as delivered');
    } catch {
      // Error toast handled by API interceptor.
    }
  };

  const handleResendOtp = async () => {
    if (!order || order.status !== 'in-transit' || isResendingOtp) return;
    try {
      setIsResendingOtp(true);
      await resendDeliveryOtp(order.id);
      toast.success('Delivery OTP resent to customer');
      await loadOrder();
    } catch {
      // Error toast handled by API interceptor.
    } finally {
      setIsResendingOtp(false);
    }
  };

  const openInGoogleMaps = () => {
    const { latitude, longitude } = order;
    
    // Detect platform
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    const isIOS = /iPad|iPhone|iPod/.test(userAgent) && !window.MSStream;
    const isAndroid = /android/i.test(userAgent);
    
    if (isAndroid) {
      // Android: Use intent URL (opens Google Maps app if installed, otherwise web)
      const intentUrl = `intent://maps.google.com/maps?daddr=${latitude},${longitude}&directionsmode=driving#Intent;scheme=https;package=com.google.android.apps.maps;end`;
      window.location.href = intentUrl;
    } else if (isIOS) {
      // iOS: Try Google Maps app URL scheme first
      const appUrl = `comgooglemaps://?daddr=${latitude},${longitude}&directionsmode=driving`;
      // Universal link as fallback (opens app if installed, otherwise web)
      const universalUrl = `https://maps.google.com/maps?daddr=${latitude},${longitude}&directionsmode=driving`;
      
      // Try app URL
      const link = document.createElement('a');
      link.href = appUrl;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Fallback to universal link after brief delay
      setTimeout(() => {
        window.location.href = universalUrl;
      }, 400);
    } else {
      // Desktop: Use web version
      const webUrl = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
      window.open(webUrl, '_blank');
    }
  };

  if (isLoadingOrder) {
    return (
      <PageTransition>
        <div className="px-4 py-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            <div className="h-64 bg-gray-200 rounded"></div>
          </div>
        </div>
      </PageTransition>
    );
  }

  if (!order) {
    return (
      <PageTransition>
        <div className="px-4 py-6 text-center space-y-3">
          <p className="text-gray-600">{loadFailed ? (errorMsg || 'Unable to load order details') : 'Order not found'}</p>
          {loadFailed && (
            <button
              onClick={loadOrder}
              className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-semibold"
            >
              Retry
            </button>
          )}
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="px-4 py-6 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-4 mb-4">
          <button
            onClick={() => navigate('/delivery/orders')}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <FiArrowLeft className="text-xl text-gray-700" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-800">{order.id}</h1>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
              order.status === 'pending' && order.deliveryAssignmentStatus === 'accepted'
                ? 'bg-blue-100 text-blue-800'
                : getStatusColor(order.status)
            }`}>
              {order.status === 'pending' && order.deliveryAssignmentStatus === 'accepted'
                ? 'accepted'
                : order.status.replace('-', ' ')}
            </span>
          </div>
        </div>

        {/* Customer Info */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl p-4 shadow-sm"
        >
          <h2 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
            <FiUser />
            Customer Information
          </h2>
          <div className="space-y-2">
            <p className="text-gray-800 font-semibold">{order.customer}</p>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <FiPhone />
              <a
                href={order.phone ? `tel:${order.phone}` : '#'}
                className={`hover:text-primary-600 ${!order.phone ? 'pointer-events-none opacity-60' : ''}`}
              >
                {order.phone || 'Phone unavailable'}
              </a>
            </div>
            <p className="text-sm text-gray-600">{order.email || '-'}</p>
          </div>
        </motion.div>

        {/* Pickup Address */}
        {order.vendorItems && order.vendorItems.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100"
          >
            <h2 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
              <FiPackage className="text-primary-600" />
              Pickup Store Address
            </h2>
            <div className="space-y-4">
              {order.vendorItems.map((group, idx) => {
                const vendor = group.vendorId || {};
                const addr = vendor.address || {};
                const formattedAddress = [
                  addr.street,
                  addr.city,
                  addr.state,
                  addr.zipCode,
                  addr.country
                ].filter(Boolean).join(', ');

                return (
                  <div key={idx} className="pb-3 border-b border-gray-100 last:border-0 last:pb-0">
                    <p className="font-bold text-gray-800">{vendor.storeName || group.vendorName || 'Store'}</p>
                    <p className="text-sm text-gray-600 mt-1">{formattedAddress || 'Address unavailable'}</p>
                    {vendor.phone && (
                      <p className="text-xs text-primary-600 mt-1">
                        📞 Phone: <a href={`tel:${vendor.phone}`} className="hover:underline">{vendor.phone}</a>
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Delivery Address */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl p-4 shadow-sm"
        >
          <h2 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
            <FiMapPin />
            Delivery Address
          </h2>
          <p className="text-gray-700 mb-3">{order.address || 'Address unavailable'}</p>
          <div className="flex items-center gap-4 text-sm text-gray-600">
            <div className="flex items-center gap-1">
              <FiNavigation />
              <span>{order.distance}</span>
            </div>
            <div className="flex items-center gap-1">
              <FiClock />
              <span>{order.estimatedTime}</span>
            </div>
          </div>
          {order.instructions && (
            <div className="mt-3 p-3 bg-yellow-50 rounded-xl border border-yellow-200">
              <p className="text-sm text-yellow-800">
                <span className="font-semibold">Instructions: </span>
                {order.instructions}
              </p>
            </div>
          )}
        </motion.div>

        {/* Map - Show when order is accepted */}
        {(order.status === 'in-transit' || order.status === 'completed') && order.latitude && order.longitude && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="bg-white rounded-2xl p-4 shadow-sm"
          >
            <h2 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
              <FiMapPin className="text-primary-600" />
              Delivery Location
            </h2>
            <div className="rounded-xl overflow-hidden border border-gray-200" style={{ height: '300px' }}>
              <iframe
                width="100%"
                height="100%"
                style={{ border: 0 }}
                loading="lazy"
                allowFullScreen
                referrerPolicy="no-referrer-when-downgrade"
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${order.longitude - 0.01},${order.latitude - 0.01},${order.longitude + 0.01},${order.latitude + 0.01}&layer=mapnik&marker=${order.latitude},${order.longitude}`}
                title="Delivery Location Map"
              />
            </div>
            <div className="mt-3">
              <button
                onClick={openInGoogleMaps}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-xl font-semibold text-sm hover:bg-primary-700 transition-colors"
              >
                <FiNavigation />
                Open in Google Maps
              </button>
            </div>
          </motion.div>
        )}

        {/* Order Items */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-2xl p-4 shadow-sm"
        >
          <h2 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
            <FiPackage />
            Order Items
          </h2>
          <div className="space-y-3">
            {order.items.length === 0 && (
              <p className="text-sm text-gray-500">No items available for this order.</p>
            )}
            {order.items.map((item, index) => (
              <div key={index} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div>
                  <p className="font-semibold text-gray-800">{item.name || 'Item'}</p>
                  <p className="text-sm text-gray-600">Quantity: {item.quantity || 0}</p>
                </div>
                <p className="font-semibold text-gray-800">{formatPrice(item.price || 0)}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Order Summary */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-2xl p-4 shadow-sm"
        >
          <h2 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
            <FiTrendingUp />
            Order Summary
          </h2>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-gray-700">
              <span>Subtotal</span>
              <span>{formatPrice(order.amount)}</span>
            </div>
            <div className="flex items-center justify-between text-gray-700">
              <span>Delivery Fee</span>
              <span>{formatPrice(order.deliveryFee)}</span>
            </div>
            {(order.status === 'delivered' || order.status === 'completed') && (
              <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-gray-700">
                <span>Delivered On</span>
                <span className="font-semibold text-gray-800 text-sm">
                  {order.deliveredAt ? new Date(order.deliveredAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true,
                  }) : '—'}
                </span>
              </div>
            )}
            <div className="pt-2 border-t border-gray-200 flex items-center justify-between">
              <span className="font-bold text-gray-800">Total</span>
              <span className="font-bold text-primary-600 text-lg">{formatPrice(order.total)}</span>
            </div>
          </div>
        </motion.div>

        {/* Action Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="space-y-3 pt-4"
        >
          {order.status === 'pending' && order.deliveryAssignmentStatus === 'assigned' && (
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleRejectOrder}
                disabled={isUpdatingOrderStatus}
                className="w-full bg-red-50 text-red-600 border border-red-200 py-4 rounded-xl font-semibold text-base flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed hover:bg-red-100 transition-colors"
              >
                Reject Order
              </button>
              <button
                onClick={handleAcceptOrder}
                disabled={isUpdatingOrderStatus}
                className="w-full gradient-green text-white py-4 rounded-xl font-semibold text-base flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <FiCheckCircle />
                {isUpdatingOrderStatus ? 'Please wait...' : 'Accept Order'}
              </button>
            </div>
          )}
          {['pending', 'processing', 'ready_for_pickup', 'confirmed'].includes(order.status) && order.deliveryAssignmentStatus === 'accepted' && (
            <div className="space-y-3">
              <div className="bg-blue-50 text-blue-700 border border-blue-200 p-4 rounded-2xl text-center font-semibold text-sm">
                🚚 Offer Accepted. Please go to the store to pick up the items.
                <p className="text-xs text-blue-500 font-normal mt-1">Waiting for vendor to mark order as Shipped (picked up).</p>
              </div>

              {/* Pickup Verification OTP */}
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl text-center">
                <p className="text-xs text-amber-700 font-medium mb-1">🔐 VENDOR PICKUP OTP CODE</p>
                <p className="text-sm text-amber-600 mb-2">Provide this code to the store clerk to verify pickup:</p>
                <p className="text-3xl font-extrabold text-amber-800 tracking-widest bg-white py-2 rounded-xl border border-amber-300 font-mono">
                  {order.pickupOtpDebug || 'Check Inbox'}
                </p>
              </div>
            </div>
          )}
          {order.status === 'picked_up' && (
            <div className="space-y-3">
              <button
                onClick={async () => {
                  try {
                    const updated = await updateOrderStatus(order.id, 'shipped');
                    setOrder(updated);
                    toast.success('Started delivery!');
                  } catch (e) {
                    toast.error(e?.response?.data?.message || 'Failed to start delivery');
                  }
                }}
                disabled={isUpdatingOrderStatus}
                className="w-full gradient-green text-white py-4 rounded-xl font-semibold text-base flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <FiNavigation />
                {isUpdatingOrderStatus ? 'Starting...' : 'Start Delivery'}
              </button>
            </div>
          )}
          {order.status === 'in-transit' && (
            <div className="space-y-3">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={deliveryOtp}
                onChange={(e) => setDeliveryOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="Enter 6-digit delivery OTP"
                className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-primary-500 focus:outline-none text-base"
              />
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handleResendOtp}
                  disabled={isResendingOtp || isUpdatingOrderStatus}
                  className="w-full bg-gray-100 text-gray-700 py-3 rounded-xl font-semibold text-sm hover:bg-gray-200 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isResendingOtp ? 'Resending...' : 'Resend OTP'}
                </button>
                <button
                  onClick={handleCompleteOrder}
                  disabled={isUpdatingOrderStatus}
                  className="w-full gradient-green text-white py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <FiCheckCircle />
                  {isUpdatingOrderStatus ? 'Please wait...' : 'Mark as Delivered'}
                </button>
              </div>
            </div>
          )}
          <button
            onClick={() => order.phone && window.open(`tel:${order.phone}`, '_self')}
            disabled={!order.phone}
            className="w-full bg-gray-100 text-gray-700 py-4 rounded-xl font-semibold text-base flex items-center justify-center gap-2 hover:bg-gray-200 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <FiPhone />
            Call Customer
          </button>
        </motion.div>
      </div>
    </PageTransition>
  );
};

export default DeliveryOrderDetail;



