import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { FiCheckCircle, FiTruck, FiEye } from 'react-icons/fi';
import { motion } from 'framer-motion';
import MobileLayout from "../components/Layout/MobileLayout";
import { useOrderStore } from '../../../shared/store/orderStore';
import { formatPrice } from '../../../shared/utils/helpers';
import { formatVariantLabel } from '../../../shared/utils/variant';
import PageTransition from '../../../shared/components/PageTransition';
import LazyImage from '../../../shared/components/LazyImage';

const MobileOrderConfirmation = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { getOrder, fetchOrderById, lastError } = useOrderStore();
  const [isResolving, setIsResolving] = useState(true);
  const order = getOrder(orderId);
  const orderItems = Array.isArray(order?.items) ? order.items : [];
  const displayOrderId = order?.id || order?.orderId || orderId;

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!order && orderId) {
        await fetchOrderById(orderId);
      }
      if (mounted) setIsResolving(false);
    })();
    return () => {
      mounted = false;
    };
  }, [order, orderId, fetchOrderById]);

  useEffect(() => {
    if (!isResolving && !order) {
      navigate('/home');
    }
  }, [isResolving, order, navigate]);

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
                onClick={() => navigate('/home')}
                className="gradient-green text-white px-6 py-3 rounded-xl font-semibold"
              >
                Go Home
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
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <PageTransition>
      <MobileLayout showBottomNav={false} showCartBar={false}>
        <div className="w-full min-h-screen flex items-center justify-center px-4 py-8 bg-gray-50">
          <div className="w-full max-w-md lg:max-w-lg">
            {/* Success Animation */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15 }}
              className="flex flex-col items-center justify-center mb-8"
            >
              <div className="w-24 h-24 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-full flex items-center justify-center mb-4 shadow-sm">
                <FiCheckCircle className="text-emerald-500 text-5xl" />
              </div>
              <h1 className="text-2xl font-black text-gray-900 mb-2">Order Confirmed!</h1>
              <p className="text-slate-600 text-center text-sm font-medium">
                Thank you for your purchase. Your order has been received and is being processed.
              </p>
            </motion.div>

            {/* Order Details */}
            <div className="bg-white rounded-3xl p-6 mb-4 border border-slate-200/80 shadow-xl">
              <div className="text-center mb-6">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Order Number</p>
                <p className="text-xl font-black text-gray-900">{displayOrderId}</p>
                {order.trackingNumber && (
                  <>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-3 mb-1">Tracking Number</p>
                    <p className="text-lg font-bold text-primary-600">{order.trackingNumber}</p>
                  </>
                )}
              </div>

              <div className="border-t border-slate-100 pt-4 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500 font-medium">Order Date</span>
                  <span className="font-bold text-gray-900">{formatDate(order.date || order.createdAt)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500 font-medium">Total Amount</span>
                  <span className="font-extrabold text-primary-700 text-lg">{formatPrice(order.total)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500 font-medium">Payment Method</span>
                  <span className="font-bold text-gray-900 capitalize">{order.paymentMethod || 'N/A'}</span>
                </div>
              </div>
            </div>

            {/* Order Items Summary */}
            <div className="bg-white rounded-3xl p-6 mb-4 border border-slate-200/80 shadow-xl">
              <h2 className="text-base font-extrabold text-gray-900 mb-4">Order Items</h2>
              <div className="space-y-3">
                {orderItems.slice(0, 3).map((item) => (
                  <div key={item.id} className="flex items-center gap-3">
                    <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-50 border border-slate-100 p-1 flex-shrink-0">
                      <LazyImage
                        src={item.image}
                        alt={item.name}
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-gray-900 text-sm mb-1">{item.name}</h3>
                      <p className="text-xs text-slate-500 font-medium">
                        {formatPrice(item.price)} × {item.quantity}
                      </p>
                      {formatVariantLabel(item?.variant) && (
                        <p className="text-[11px] text-slate-400 font-medium">
                          {formatVariantLabel(item?.variant)}
                        </p>
                      )}
                    </div>
                    <p className="font-extrabold text-gray-900 text-sm">
                      {formatPrice(item.price * item.quantity)}
                    </p>
                  </div>
                ))}
                {orderItems.length > 3 && (
                  <p className="text-xs font-bold text-slate-500 text-center pt-2">
                    +{orderItems.length - 3} more item{orderItems.length - 3 !== 1 ? 's' : ''}
                  </p>
                )}
                {orderItems.length === 0 && (
                  <p className="text-xs text-slate-400 text-center pt-2">No item details available for this order.</p>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-3">
              <Link
                to={`/orders/${displayOrderId}`}
                className="block w-full py-3.5 bg-gradient-to-r from-primary-600 to-primary-700 hover:from-primary-700 hover:to-primary-800 text-white rounded-2xl font-bold text-center shadow-lg shadow-primary-500/20 active:scale-95 transition-all"
              >
                <div className="flex items-center justify-center gap-2">
                  <FiEye className="text-lg" />
                  View Order Details
                </div>
              </Link>
              <Link
                to={`/track-order/${displayOrderId}`}
                className="block w-full py-3.5 bg-slate-900 hover:bg-slate-950 text-white rounded-2xl font-bold text-center shadow-md active:scale-95 transition-all"
              >
                <div className="flex items-center justify-center gap-2">
                  <FiTruck className="text-lg" />
                  Track Order
                </div>
              </Link>
              <button
                onClick={() => navigate('/home')}
                className="w-full py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-2xl font-bold transition-colors"
              >
                Continue Shopping
              </button>
            </div>
          </div>
        </div>
      </MobileLayout>
    </PageTransition>
  );
};

export default MobileOrderConfirmation;
