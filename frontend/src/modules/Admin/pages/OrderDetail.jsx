import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  FiArrowLeft,
  FiEdit,
  FiCheck,
  FiX,
  FiPhone,
  FiMapPin,
  FiCreditCard,
  FiTruck,
  FiCalendar,
  FiTag,
  FiPackage,
  FiClock,
  FiMail
} from 'react-icons/fi';
import { motion } from 'framer-motion';
import Badge from '../../../shared/components/Badge';
import AnimatedSelect from '../components/AnimatedSelect';
import { formatCurrency, formatDateTime } from '../utils/adminHelpers';
import { getPlaceholderImage } from '../../../shared/utils/helpers';
import { getOrderById, updateOrderStatus } from '../services/adminService';
import { getSocket, joinRoom, leaveRoom } from '../../../shared/utils/socket';
import toast from 'react-hot-toast';

const ORDER_PRODUCT_PLACEHOLDER = getPlaceholderImage(100, 100, 'Product');

const OrderDetail = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [status, setStatus] = useState('');

  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const fetchOrderData = async (showLoading = true) => {
      if (showLoading) setIsLoading(true);
      try {
        const response = await getOrderById(id);
        const o = response.data;

        // Normalize data to match UI structure
        const normalizedOrder = {
          ...o,
          id: o.orderId || o._id,
          customer: {
            name: o.userId?.name || 'Unknown',
            email: o.userId?.email || '',
            phone: o.userId?.phone || ''
          },
          date: o.createdAt
        };

        if (mounted) {
          setOrder(normalizedOrder);
          setStatus(o.status);
        }
      } catch (error) {
        console.error("Fetch order detail error:", error);
        if (showLoading) {
          toast.error('Order not found');
          navigate('/admin/orders/all-orders');
        }
      } finally {
        if (showLoading && mounted) setIsLoading(false);
      }
    };

    fetchOrderData(true);

    const token = localStorage.getItem('admin-token') || localStorage.getItem('token');
    if (token && id) {
      const socket = getSocket(token);
      if (socket) {
        joinRoom(`order_${id}`);

        const handleOrderUpdate = (updatedOrder) => {
          const updatedId = updatedOrder.orderId || updatedOrder._id;
          if (String(updatedId) === String(id) && mounted) {
            fetchOrderData(false);
          }
        };

        const handleReturnUpdate = (updatedReturn) => {
          if (String(updatedReturn.orderId) === String(id) && mounted) {
            fetchOrderData(false);
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
  }, [id, navigate]);

  const handleStatusUpdate = async () => {
    try {
      await updateOrderStatus(id, status);
      setOrder({ ...order, status });
      setIsEditing(false);
      toast.success('Order status updated successfully');
    } catch (error) {
      console.error("Status update error:", error);
    }
  };

  if (isLoading || !order) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  const statusOptions = ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'returned'];

  // Handle items - could be a number or an array
  const itemsCount = Array.isArray(order.items) ? order.items.length : (typeof order.items === 'number' ? order.items : 0);
  const itemsArray = Array.isArray(order.items) ? order.items : [];

  // Calculate order breakdown
  const subtotal = order.subtotal ?? (order.total * 0.95);
  const shipping = order.shipping ?? (order.total * 0.05);
  const tax = order.tax ?? 0;
  const discount = order.discount ?? 0;

  // Get payment method display name
  const getPaymentMethodName = (method) => {
    if (!method) return 'N/A';
    const methods = {
      card: 'Credit/Debit Card',
      cash: 'Cash on Delivery',
      upi: 'UPI',
      wallet: 'Digital Wallet',
      bank: 'Bank Transfer'
    };
    return methods[method.toLowerCase()] || method;
  };

  // Resolve product image safely from the order payload
  const getProductImage = (item) => {
    if (item.image) {
      return item.image;
    }
    if (item.productId?.images?.[0]) {
      return item.productId.images[0];
    }

    // Return placeholder
    return ORDER_PRODUCT_PLACEHOLDER;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* Compact Header */}
      <div className="flex items-center justify-between bg-white rounded-lg p-4 shadow-sm border border-gray-200">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <FiArrowLeft className="text-lg text-gray-600" />
          </button>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-800">{order.id}</h1>
            <p className="text-xs text-gray-500">{formatDateTime(order.date)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={order.status}>{order.status}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-4">
          {/* Order Overview Card */}
          <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Total</p>
                <p className="font-bold text-gray-800 text-lg">{formatCurrency(order.total)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Items</p>
                <p className="font-semibold text-gray-800">{itemsCount}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Payment</p>
                <p className="text-xs font-semibold text-gray-800 capitalize">
                  {getPaymentMethodName(order.paymentMethod)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Payment Status</p>
                <Badge variant={order.paymentStatus === 'paid' ? 'delivered' : order.paymentStatus === 'pending' ? 'pending' : 'cancelled'} className="text-xs">
                  {order.paymentStatus || (order.paymentMethod === 'cash' ? 'Pending' : 'Paid')}
                </Badge>
              </div>
            </div>
          </div>

          {/* Order Items */}
          {itemsArray.length > 0 && (
            <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
              <h2 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
                <FiPackage className="text-primary-600 text-base" />
                Order Items ({itemsCount})
              </h2>
              <div className="space-y-2">
                {itemsArray.map((item) => (
                  <div key={item.id || item.name} className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-lg">
                    <img
                      src={getProductImage(item)}
                      alt={item.name || 'Product'}
                      className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                      onError={(e) => {
                        e.currentTarget.onerror = null;
                        e.currentTarget.src = ORDER_PRODUCT_PLACEHOLDER;
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-gray-800 truncate">{item.name || 'Unknown Product'}</p>
                      <p className="text-xs text-gray-600">
                        {formatCurrency(item.price || 0)} x {item.quantity || 1}
                      </p>
                    </div>
                    <p className="font-bold text-sm text-gray-800">
                      {formatCurrency((item.price || 0) * (item.quantity || 1))}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Customer & Shipping Combined Card */}
          <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
            <div className={`grid grid-cols-1 md:grid-cols-2 gap-4`}>
              {/* Customer Info */}
              <div>
                <h2 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-1.5">
                  <FiMail className="text-primary-600 text-base" />
                  Customer
                </h2>
                <div className="space-y-2">
                  <div>
                    <p className="text-xs text-gray-500">Name</p>
                    <p className="font-semibold text-sm text-gray-800">{order.customer?.name || order.shippingAddress?.name || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">Email</p>
                    <p className="font-semibold text-xs text-gray-800 break-all">{order.customer?.email || order.shippingAddress?.email || 'N/A'}</p>
                  </div>
                  {(order.customer?.phone || order.shippingAddress?.phone) && (
                    <div>
                      <p className="text-xs text-gray-500 flex items-center gap-1">
                        <FiPhone className="text-xs" />
                        Phone
                      </p>
                      <p className="font-semibold text-sm text-gray-800">{order.customer?.phone || order.shippingAddress?.phone}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Shipping Details */}
              {order.shippingAddress && (
                <div className="border-t md:border-t-0 md:border-l border-gray-100 md:pl-4">
                  <h2 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-1.5">
                    <FiMapPin className="text-primary-600 text-base" />
                    Shipping Address
                  </h2>
                  <div className="space-y-1.5 text-xs">
                    <p className="font-semibold text-gray-800">{order.shippingAddress.name || 'N/A'}</p>
                    {order.shippingAddress.address && (
                      <p className="text-gray-700">{order.shippingAddress.address}</p>
                    )}
                    {(order.shippingAddress.city || order.shippingAddress.state || order.shippingAddress.zipCode) && (
                      <p className="text-gray-700">
                        {[
                          order.shippingAddress.city,
                          order.shippingAddress.state,
                          order.shippingAddress.zipCode
                        ].filter(Boolean).join(', ')}
                      </p>
                    )}
                    {order.shippingAddress.country && (
                      <p className="text-gray-700">{order.shippingAddress.country}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
          {/* Shipments Overview (Multi-Vendor/Multi-Shipment) */}
          {order.shipments && order.shipments.length > 0 && (
            <div className="bg-white rounded-lg p-0 shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200 bg-gray-50/50 flex justify-between items-center">
                <h2 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
                  <FiPackage className="text-primary-600 text-base" />
                  Shipments Overview ({order.shipments.length})
                </h2>
              </div>
              <div className="divide-y divide-gray-100">
                {order.shipments.map((shipment, index) => {
                  const deliveryBoy = shipment.deliveryBoyId;
                  const vendorGroup = order.vendorItems?.find(v => String(v.vendorId) === String(shipment.vendorId));
                  return (
                    <div key={shipment._id || index} className="p-4 hover:bg-gray-50/50 transition-colors">
                      <div className="flex flex-col md:flex-row gap-4 md:items-start justify-between">
                        {/* Shipment Info */}
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-gray-800">Package {index + 1}</span>
                            <Badge variant={shipment.status} className="text-[10px] uppercase py-0.5 px-1.5">
                              {shipment.status}
                            </Badge>
                          </div>
                          {vendorGroup && (
                            <p className="text-xs text-gray-500 font-medium">
                              Vendor: <span className="text-gray-800">{vendorGroup.vendorName}</span>
                            </p>
                          )}
                          <p className="text-[11px] text-gray-400 font-mono mt-1">
                            {shipment.shipmentNumber || shipment._id}
                          </p>

                          {vendorGroup?.status === 'cancelled' && (
                            <div className="mt-2 p-2 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 space-y-0.5">
                              <p className="font-bold flex items-center gap-1">❌ Package Cancelled ({vendorGroup.cancelledBy || 'customer'})</p>
                              {vendorGroup.cancellationReason && <p><span className="font-semibold">Reason:</span> {vendorGroup.cancellationReason}</p>}
                              {vendorGroup.refundedAmount > 0 && <p className="font-bold text-emerald-700">Refunded: ₹{vendorGroup.refundedAmount}</p>}
                            </div>
                          )}
                        </div>

                        {/* Tracking / Provider */}
                        <div className="space-y-1 md:text-right">
                           <p className="text-xs text-gray-500">Provider: <span className="font-semibold text-gray-700 capitalize">{shipment.providerId?.replace('_', ' ') || 'Unknown'}</span></p>
                           {shipment.awbCode && (
                             <p className="text-xs text-gray-500">AWB: <span className="font-mono text-gray-800 font-bold">{shipment.awbCode}</span></p>
                           )}
                           {shipment.trackingUrl && (
                             <a href={shipment.trackingUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] font-bold text-primary-600 hover:underline">
                               Track Shipment &rarr;
                             </a>
                           )}
                        </div>
                      </div>

                      {/* Delivery Partner Inline Details */}
                      {deliveryBoy && (
                        <div className="mt-4 p-3 bg-blue-50/50 border border-blue-100 rounded-lg flex flex-wrap gap-4 items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                              <span className="text-xs">🚚</span>
                            </div>
                            <div>
                              <p className="text-xs font-bold text-gray-800">{deliveryBoy.name}</p>
                              {deliveryBoy.phone && <p className="text-[10px] text-gray-500">{deliveryBoy.phone}</p>}
                            </div>
                          </div>
                          <div className="text-right">
                             <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-0.5">Assignment</p>
                             {shipment.deliveryAssignmentStatus === 'accepted' ? (
                               <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700">
                                 <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                                 Accepted
                               </span>
                             ) : (
                               <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-yellow-100 text-yellow-700">
                                 <span className="w-1.5 h-1.5 rounded-full bg-yellow-500"></span>
                                 {shipment.deliveryAssignmentStatus || 'Pending'}
                               </span>
                             )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Order Summary */}
          <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
            <h2 className="text-sm font-bold text-gray-800 mb-3">Order Summary</h2>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Subtotal</span>
                <span className="font-semibold">{formatCurrency(subtotal)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-sm text-green-600">
                  <span className="flex items-center gap-1">
                    <FiTag className="text-xs" />
                    Discount
                    {order.couponCode && (
                      <span className="text-xs bg-green-100 px-1.5 py-0.5 rounded">({order.couponCode})</span>
                    )}
                  </span>
                  <span className="font-semibold">-{formatCurrency(discount)}</span>
                </div>
              )}
              {tax > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Tax</span>
                  <span className="font-semibold">{formatCurrency(tax)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Shipping</span>
                <span className="font-semibold">{formatCurrency(shipping)}</span>
              </div>
              <div className="border-t border-gray-200 pt-2 mt-2 flex justify-between">
                <span className="font-bold text-gray-800">Total</span>
                <span className="font-bold text-lg text-gray-800">{formatCurrency(order.total)}</span>
              </div>
            </div>
          </div>

          {/* Vendor Splits */}
          {Array.isArray(order.commissions) && order.commissions.length > 0 && (
            <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
              <h2 className="text-sm font-bold text-gray-800 mb-3">Vendor Splits</h2>
              <div className="divide-y divide-gray-150 space-y-3">
                {order.commissions.map((comm, idx) => {
                  const vendorSub = comm.vendorSubtotal || comm.subtotal || 0;
                  const vendorDisc = comm.vendorCouponDiscount !== undefined ? comm.vendorCouponDiscount : comm.discountShare || 0;
                  const vendorTax = comm.vendorTax || 0;
                  const commission = comm.commissionAmount !== undefined ? comm.commissionAmount : comm.commission || 0;
                  const earnings = comm.vendorNetEarnings !== undefined ? comm.vendorNetEarnings : comm.vendorEarnings || 0;
                  const escrowStatus = comm.escrowStatus || 'held';
                  const releaseDate = comm.escrowReleaseDate ? new Date(comm.escrowReleaseDate).toLocaleDateString() : 'N/A';

                  return (
                    <div key={idx} className={idx > 0 ? "pt-3 text-xs space-y-1.5" : "text-xs space-y-1.5"}>
                      <div className="flex justify-between font-bold text-gray-700">
                        <span>{comm.vendorName || `Vendor ${comm.vendorId}`}</span>
                        <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded ${escrowStatus === 'released' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{escrowStatus}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Subtotal:</span>
                        <span>{formatCurrency(vendorSub)}</span>
                      </div>
                      {vendorDisc > 0 && (
                        <div className="flex justify-between text-green-600">
                          <span>Coupon Share:</span>
                          <span>-{formatCurrency(vendorDisc)}</span>
                        </div>
                      )}
                      {vendorTax > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-500">Tax:</span>
                          <span>{formatCurrency(vendorTax)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-red-500">
                        <span>Commission:</span>
                        <span>-{formatCurrency(commission)}</span>
                      </div>
                      <div className="flex justify-between font-semibold text-primary-700">
                        <span>Net Earnings:</span>
                        <span>{formatCurrency(earnings)}</span>
                      </div>
                      {escrowStatus === 'held' && comm.escrowReleaseDate && (
                        <div className="flex justify-between text-[10px] text-gray-400">
                          <span>Est. Release:</span>
                          <span>{releaseDate}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Order Timeline */}
          <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
            <h2 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-1.5">
              <FiCalendar className="text-primary-600 text-base" />
              Timeline
            </h2>
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 mt-1.5 flex-shrink-0"></div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-800">Order Placed</p>
                  <p className="text-xs text-gray-500">{formatDateTime(order.date)}</p>
                </div>
              </div>
              {order.status === 'processing' && (
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0"></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-800">Processing</p>
                    <p className="text-xs text-gray-500">Being prepared</p>
                  </div>
                </div>
              )}
              {order.status === 'shipped' && (
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 mt-1.5 flex-shrink-0"></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-800">Shipped</p>
                    {order.shippedDate && (
                      <p className="text-xs text-gray-500">{formatDateTime(order.shippedDate)}</p>
                    )}
                  </div>
                </div>
              )}
              {order.status === 'delivered' && (
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 mt-1.5 flex-shrink-0"></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-800">Delivered</p>
                    {(order.deliveredDate || order.deliveredAt) && (
                      <p className="text-xs text-gray-500">{formatDateTime(order.deliveredDate || order.deliveredAt)}</p>
                    )}
                  </div>
                </div>
              )}
              {order.status === 'cancelled' && (
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 flex-shrink-0"></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-gray-800">Cancelled</p>
                    {(order.cancelledDate || order.cancelledAt) && (
                      <p className="text-xs text-gray-500">{formatDateTime(order.cancelledDate || order.cancelledAt)}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-200">
            <h2 className="text-sm font-bold text-gray-800 mb-3">Quick Actions</h2>
            <div className="space-y-1.5">
              {order.trackingNumber && (
                <button
                  onClick={() => window.open(`/track-order/${order.id}`, '_blank')}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors text-xs font-semibold"
                >
                  <FiTruck className="text-sm" />
                  Track Order
                </button>
              )}
              {order.customer?.email && (
                <button
                  onClick={() => window.location.href = `mailto:${order.customer.email}`}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors text-xs font-semibold"
                >
                  <FiMail className="text-sm" />
                  Email Customer
                </button>
              )}
              {(order.customer?.phone || order.shippingAddress?.phone) && (
                <button
                  onClick={() => window.location.href = `tel:${order.customer?.phone || order.shippingAddress?.phone}`}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors text-xs font-semibold"
                >
                  <FiPhone className="text-sm" />
                  Call Customer
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default OrderDetail;

