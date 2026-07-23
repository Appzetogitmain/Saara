import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FiCheckCircle, FiClock, FiPackage, FiTruck, FiMapPin, FiArrowLeft } from 'react-icons/fi';
import MobileLayout from "../components/Layout/MobileLayout";
import { useOrderStore } from '../../../shared/store/orderStore';
import { formatPrice } from '../../../shared/utils/helpers';
import { formatVariantLabel } from '../../../shared/utils/variant';
import PageTransition from '../../../shared/components/PageTransition';
import Badge from '../../../shared/components/Badge';
import LazyImage from '../../../shared/components/LazyImage';
import { useAuthStore } from '../../../shared/store/authStore';

const MobileTrackOrder = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { getOrder, fetchOrderById, fetchPublicTrackingOrder, lastError } = useOrderStore();
  const { user } = useAuthStore();
  const [isResolving, setIsResolving] = useState(true);
  const order = getOrder(orderId);
  const shippingAddress = order?.shippingAddress || {};
  const orderItems = Array.isArray(order?.items) ? order.items : [];
  const normalizedStatus = String(order?.status || 'pending').toLowerCase();
  const displayOrderId = order?.id || order?.orderId || orderId;
  const hasShippingAddress = Boolean(
    shippingAddress?.name ||
    shippingAddress?.address ||
    shippingAddress?.city ||
    shippingAddress?.state ||
    shippingAddress?.zipCode
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (orderId) {
        const privateOrder = await fetchOrderById(orderId);
        if (!privateOrder) {
          await fetchPublicTrackingOrder(orderId);
        }
      }
      if (mounted) setIsResolving(false);
    })();
    return () => {
      mounted = false;
    };
  }, [orderId, fetchOrderById, fetchPublicTrackingOrder]);

  useEffect(() => {
    if (!isResolving && !order) {
      navigate(user?.id ? '/orders' : '/home');
    }
  }, [isResolving, order, navigate, user?.id]);

  if (isResolving) {
    return (
      <PageTransition>
        <MobileLayout showBottomNav={false} showCartBar={false}>
          <div className="flex items-center justify-center min-h-[60vh] px-4">
            <p className="text-gray-600">Loading order...</p>
          </div>
        </MobileLayout>
      </PageTransition>
    );
  }

  if (!order) {
    return (
      <PageTransition>
        <MobileLayout showBottomNav={false} showCartBar={false}>
          <div className="flex items-center justify-center min-h-[60vh] px-4">
            <div className="text-center">
              <h2 className="text-xl font-bold text-gray-800 mb-4">Order Not Found</h2>
              {lastError ? (
                <p className="text-sm text-gray-500 mb-4">{lastError}</p>
              ) : null}
              <button
                onClick={() => navigate(user?.id ? '/orders' : '/home')}
                className="gradient-green text-white px-6 py-3 rounded-xl font-semibold"
              >
                {user?.id ? 'Back to Orders' : 'Go Home'}
              </button>
            </div>
          </div>
        </MobileLayout>
      </PageTransition>
    );
  }

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return 'N/A';
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getTrackingSteps = () => {
    const isCancelled = normalizedStatus === 'cancelled';
    const isReturned = normalizedStatus === 'returned';
    const isProcessingOrLater = ['processing', 'ready_for_pickup', 'shipped', 'delivered', 'returned'].includes(normalizedStatus);
    const isReadyForPickupOrLater = ['ready_for_pickup', 'shipped', 'delivered', 'returned'].includes(normalizedStatus);
    const isShippedOrLater = ['shipped', 'delivered', 'returned'].includes(normalizedStatus);
    const isDelivered = normalizedStatus === 'delivered';

    const steps = [
      {
        label: 'Order Placed',
        completed: true,
        date: order?.date || order?.createdAt,
        icon: FiCheckCircle,
      },
      {
        label: 'Processing',
        completed: !isCancelled && isProcessingOrLater,
        date: order?.processingAt || null,
        icon: FiPackage,
      },
      {
        label: 'Ready for Pickup',
        completed: !isCancelled && isReadyForPickupOrLater,
        date: order?.readyForPickupAt || null,
        icon: FiClock,
      },
      {
        label: 'Shipped',
        completed: !isCancelled && isShippedOrLater,
        date: order?.shippedAt || null,
        icon: FiTruck,
      },
      {
        label: 'Delivered',
        completed: isDelivered,
        date: isDelivered ? (order?.deliveredAt || order?.estimatedDelivery) : null,
        icon: FiCheckCircle,
      },
    ];

    if (isCancelled || isReturned) {
      steps.push({
        label: isCancelled ? 'Cancelled' : 'Returned',
        completed: true,
        date: order?.cancelledAt || order?.returnedAt || order?.updatedAt || order?.date || order?.createdAt,
        icon: FiClock,
      });
    }
    return steps;
  };

  return (
    <PageTransition>
      <MobileLayout showBottomNav={false} showCartBar={true}>
          <div className="w-full pb-24">
            {/* Header */}
            <div className="px-4 py-4 bg-white border-b border-gray-200 sticky top-1 z-30">
              <div className="flex items-center gap-3 mb-3">
                <button
                  onClick={() => navigate(-1)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <FiArrowLeft className="text-xl text-gray-700" />
                </button>
                <div className="flex-1">
                  <h1 className="text-xl font-bold text-gray-800">Track Order</h1>
                  <p className="text-sm text-gray-600">Order #{displayOrderId}</p>
                </div>
                <Badge variant={normalizedStatus}>{normalizedStatus.toUpperCase()}</Badge>
              </div>
            </div>

            <div className="px-4 py-4 space-y-4 animate-fadeIn">
              {/* Tracking Timeline */}
              {order.shipments && order.shipments.length > 0 && (
                <div className="space-y-4">
                  {order.shipments.map((shipment, index) => {
                    const shipmentSteps = getTrackingSteps(shipment.status, shipment);
                    const vendorGroup = order.vendorItems?.find(v => String(v.vendorId) === String(shipment.vendorId));
                    return (
                      <div key={shipment._id || index} className="bg-white rounded-3xl p-5 border border-slate-200/80 shadow-sm">
                        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
                          <div className="w-8 h-8 rounded-full bg-primary-50 text-primary-600 flex items-center justify-center">
                            <FiPackage />
                          </div>
                          <div>
                            <h2 className="text-sm font-extrabold text-gray-900">
                              {order.shipments.length > 1 ? `Package ${index + 1} of ${order.shipments.length}` : 'Order Status'}
                            </h2>
                            {vendorGroup && (
                              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                                Dispatched by {vendorGroup.vendorName}
                              </p>
                            )}
                          </div>
                          <Badge variant={shipment.status} className="ml-auto">
                            {shipment.status.toUpperCase()}
                          </Badge>
                        </div>
                        <div className="space-y-4">
                          {shipmentSteps.map((step, sIdx) => {
                            const Icon = step.icon;
                            return (
                              <div key={sIdx} className="flex items-start gap-4">
                                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all ${step.completed
                                  ? 'bg-gradient-to-r from-primary-600 to-primary-700 text-white shadow-md shadow-primary-500/20'
                                  : 'bg-slate-100 text-slate-400'
                                  }`}>
                                  <Icon className="text-sm" />
                                </div>
                                <div className="flex-1 pb-4 relative">
                                  {sIdx < shipmentSteps.length - 1 && (
                                    <div className={`absolute left-[-23px] top-8 bottom-0 w-[2px] rounded-full ${step.completed ? 'bg-primary-300' : 'bg-slate-100'}`} />
                                  )}
                                  <h3 className={`font-bold text-sm mb-0.5 transition-colors ${step.completed ? 'text-gray-900' : 'text-slate-400'
                                    }`}>
                                    {step.label}
                                  </h3>
                                  <p className="text-xs text-gray-500 font-medium">{formatDate(step.date)}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {/* Shipment OTP Validation inline */}
                        {shipment.deliveryOtpDebug && ['shipped', 'out_for_delivery'].includes(shipment.status) && (
                          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-xl">
                            <p className="text-[10px] text-green-800 font-bold uppercase tracking-widest mb-1 flex items-center gap-1">
                              🔑 Delivery OTP
                            </p>
                            <p className="text-[11px] text-green-700 leading-tight mb-2">
                              Provide this code to the delivery partner.
                            </p>
                            <p className="text-xl font-extrabold text-green-800 tracking-widest text-center py-1.5 bg-white rounded-lg border border-green-300 font-mono">
                              {shipment.deliveryOtpDebug || 'Email Sent'}
                            </p>
                          </div>
                        )}
                        {/* AWB Tracking line inline */}
                        {shipment.awbCode && (
                           <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                             <div>
                               <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-0.5">Tracking AWB</p>
                               <p className="text-sm font-mono font-bold text-gray-800">{shipment.awbCode}</p>
                             </div>
                             {shipment.trackingUrl && (
                               <a href={shipment.trackingUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-primary-600 bg-primary-50 px-3 py-1.5 rounded-lg border border-primary-100">
                                 Track Package
                               </a>
                             )}
                           </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Tracking Number */}
              {order.trackingNumber && (
                <div className="glass-card rounded-2xl p-4">
                  <h2 className="text-base font-bold text-gray-800 mb-2">Tracking Number</h2>
                  <p className="text-lg font-bold text-primary-600">{order.trackingNumber}</p>
                </div>
              )}

              {/* Shipping Address */}
              {hasShippingAddress ? (
                <div className="glass-card rounded-2xl p-4">
                  <h2 className="text-base font-bold text-gray-800 mb-3 flex items-center gap-2">
                    <FiMapPin className="text-primary-600" />
                    Shipping Address
                  </h2>
                  <div className="text-sm text-gray-600 space-y-1">
                    <p className="font-semibold text-gray-800">{shippingAddress.name || 'N/A'}</p>
                    <p>{shippingAddress.address || 'N/A'}</p>
                    <p>
                      {shippingAddress.city || 'N/A'}, {shippingAddress.state || 'N/A'}{' '}
                      {shippingAddress.zipCode || 'N/A'}
                    </p>
                  </div>
                </div>
              ) : null}

              {/* Order Items */}
              <div className="glass-card rounded-2xl p-4">
                <h2 className="text-base font-bold text-gray-800 mb-3">Order Items</h2>
                <div className="space-y-3">
                  {orderItems.map((item) => (
                    <div key={item.id} className="flex items-center gap-3">
                      <div className="w-16 h-16 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
                        <LazyImage
                          src={item.image}
                          alt={item.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-800 text-sm mb-1">{item.name}</h3>
                        <p className="text-xs text-gray-600">
                          {formatPrice(item.price)} x {item.quantity}
                        </p>
                        {formatVariantLabel(item?.variant) && (
                          <p className="text-[11px] text-gray-500">
                            {formatVariantLabel(item?.variant)}
                          </p>
                        )}
                      </div>
                      <p className="font-bold text-gray-800 text-sm">
                        {formatPrice(item.price * item.quantity)}
                      </p>
                    </div>
                  ))}
                  {orderItems.length === 0 && (
                    <p className="text-sm text-gray-600">Item details are not available for this tracking view.</p>
                  )}
                </div>
              </div>

              {/* Estimated Delivery */}
              {order.estimatedDelivery && (
                <div className="glass-card rounded-2xl p-4">
                  <h2 className="text-base font-bold text-gray-800 mb-2">Estimated Delivery</h2>
                  <p className="text-lg font-semibold text-primary-600">
                    {formatDate(order.estimatedDelivery)}
                  </p>
                </div>
              )}

              {/* Actions */}
              {user?.id ? (
                <button
                  onClick={() => navigate(`/orders/${displayOrderId}`)}
                  className="w-full py-3 gradient-green text-white rounded-xl font-semibold hover:shadow-glow-green transition-all"
                >
                  View Order Details
                </button>
              ) : (
                <button
                  onClick={() => navigate('/home')}
                  className="w-full py-3 gradient-green text-white rounded-xl font-semibold hover:shadow-glow-green transition-all"
                >
                  Continue Shopping
                </button>
              )}
            </div>
          </div>
      </MobileLayout>
    </PageTransition>
  );
};

export default MobileTrackOrder;

