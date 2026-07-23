import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
    FiArrowLeft,
    FiPackage,
    FiMapPin,
    FiUser,
    FiDollarSign,
} from 'react-icons/fi';
import { motion } from 'framer-motion';
import { useVendorAuthStore } from '../../store/vendorAuthStore';
import { getVendorOrderById, updateVendorOrderStatus, verifyVendorPickup } from '../../services/vendorService';
import { getSocket, joinRoom, leaveRoom } from '../../../../shared/utils/socket';
import { formatPrice } from '../../../../shared/utils/helpers';
import Badge from '../../../../shared/components/Badge';
import AnimatedSelect from '../../../Admin/components/AnimatedSelect';
import toast from 'react-hot-toast';

const OrderDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { vendor } = useVendorAuthStore();

    const [order, setOrder] = useState(null);
    const [loading, setLoading] = useState(true);
    const [updatingStatus, setUpdatingStatus] = useState(false);
    const [pickupOtp, setPickupOtp] = useState('');
    const [verifyingOtp, setVerifyingOtp] = useState(false);

    const handleVerifyPickup = async (e, shipmentIdOrOrderId) => {
        e.preventDefault();
        const normalized = String(pickupOtp || '').trim();
        if (!/^\d{6}$/.test(normalized)) {
            toast.error('Please enter a valid 6-digit OTP code');
            return;
        }

        setVerifyingOtp(true);
        try {
            await verifyVendorPickup(shipmentIdOrOrderId || order.orderId || order._id, normalized);
            toast.success('Handoff verified successfully!');
            const res = await getVendorOrderById(id);
            const data = res?.data ?? res;
            setOrder(data ?? null);
            setPickupOtp('');
        } catch (error) {
            toast.error(error?.response?.data?.message || error?.message || 'Verification failed');
        } finally {
            setVerifyingOtp(false);
        }
    };

    const vendorId = vendor?.id;
    const shippingAddress = order?.shippingAddress ?? order?.address ?? null;
    const customerName =
        order?.customer?.name ??
        order?.userId?.name ??
        order?.guestInfo?.name ??
        'Guest';
    const customerEmail =
        order?.customer?.email ??
        order?.userId?.email ??
        order?.guestInfo?.email ??
        'N/A';

    useEffect(() => {
        if (!id || !vendorId) return;

        let mounted = true;

        const fetchOrder = async (isInitial = false) => {
            if (isInitial) setLoading(true);
            try {
                const res = await getVendorOrderById(id);
                const data = res?.data ?? res;
                if (mounted) setOrder(data ?? null);
            } catch {
                if (isInitial && mounted) setOrder(null);
            } finally {
                if (isInitial && mounted) setLoading(false);
            }
        };

        if (!order) {
            fetchOrder(true);
        }

        const token = localStorage.getItem('vendor-token') || localStorage.getItem('token');
        if (token) {
            const socket = getSocket(token);
            if (socket) {
                joinRoom(`order_${id}`);

                const handleOrderUpdate = (updatedOrder) => {
                    const updatedId = updatedOrder.orderId || updatedOrder._id;
                    if (String(updatedId) === String(id) && mounted) {
                        fetchOrder(false);
                    }
                };

                const handleReturnUpdate = (updatedReturn) => {
                    if (String(updatedReturn.orderId) === String(id) && mounted) {
                        fetchOrder(false);
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
    }, [id, vendorId]);

    const handleStatusChange = async (newStatus) => {
        if (!order) return;
        setUpdatingStatus(true);
        try {
            await updateVendorOrderStatus(order.orderId ?? order._id, newStatus);
            // Optimistically update local state
            setOrder((prev) => ({
                ...prev,
                vendorItems: prev.vendorItems?.map((vi) =>
                    vi.vendorId?.toString() === vendorId?.toString()
                        ? { ...vi, status: newStatus }
                        : vi
                ),
                status: newStatus,
            }));
            toast.success(`Order status updated to ${newStatus}`);
        } catch {
            // api.js shows toast
        } finally {
            setUpdatingStatus(false);
        }
    };

    const statusOptions = [
        { value: 'pending', label: 'Pending', color: 'yellow' },
        { value: 'processing', label: 'Processing', color: 'blue' },
        { value: 'ready_for_pickup', label: 'Ready for Pickup', color: 'purple' },
        { value: 'shipped', label: 'Shipped', color: 'green' },
        { value: 'cancelled', label: 'Cancelled', color: 'red' },
    ];

    const transitionMap = {
        pending: ['pending', 'processing', 'cancelled'],
        processing: ['processing', 'ready_for_pickup', 'cancelled'],
        ready_for_pickup: ['ready_for_pickup'],
        shipped: ['shipped'],
        cancelled: ['cancelled'],
    };

    // Derive per-vendor status from vendorItems
    const vendorItem = order?.vendorItems?.find(
        (vi) => vi.vendorId?.toString() === vendorId?.toString()
    );
    const currentStatus = String(vendorItem?.status ?? order?.status ?? 'pending').toLowerCase();
    const allowedStatuses = transitionMap[currentStatus] || [currentStatus];
    const visibleStatusOptions = statusOptions.filter((option) =>
        allowedStatuses.includes(option.value)
    );

    // Items this vendor sold in this order
    const vendorItems = vendorItem?.items ?? [];
    const vendorSubtotal = vendorItem?.subtotal ?? 0;

    if (loading) {
        return (
            <div className="p-6 text-center">
                <p className="text-gray-500">Loading order details...</p>
            </div>
        );
    }

    if (!order) {
        return (
            <div className="p-6 text-center space-y-3">
                <p className="text-gray-700 font-semibold">Order not found</p>
                <p className="text-sm text-gray-500">
                    Order #{id} may not belong to your store.
                </p>
                <Link
                    to="/vendor/orders"
                    className="inline-block text-blue-600 hover:underline text-sm"
                >
                    ← Back to Orders
                </Link>
            </div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
        >
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Link
                        to="/vendor/orders"
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <FiArrowLeft className="text-gray-600" />
                    </Link>
                    <div className="lg:hidden">
                        <h1 className="text-2xl font-bold text-gray-800">
                            Order #{order.orderId ?? order._id}
                        </h1>
                        <p className="text-sm text-gray-500">
                            Placed on{' '}
                            {order.createdAt
                                ? new Date(order.createdAt).toLocaleDateString()
                                : '—'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3 lg:ml-auto">
                    <AnimatedSelect
                        options={visibleStatusOptions}
                        value={currentStatus}
                        onChange={(e) => handleStatusChange(e.target.value)}
                        disabled={updatingStatus}
                        color={
                            visibleStatusOptions.find((opt) => opt.value === currentStatus)
                                ?.color || 'gray'
                        }
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Content */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Order Items */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <div className="p-4 border-b border-gray-200">
                            <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                                <FiPackage />
                                Your Items in this Order
                            </h2>
                        </div>
                        <div className="divide-y divide-gray-200">
                            {vendorItems.length > 0 ? (
                                vendorItems.map((item, index) => (
                                    <div key={index} className="p-4 flex gap-4">
                                        <div className="w-16 h-16 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                                            <img
                                                src={item.image}
                                                alt={item.name}
                                                className="w-full h-full object-cover"
                                                onError={(e) => {
                                                    e.target.src =
                                                        'https://via.placeholder.com/64?text=P';
                                                }}
                                            />
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <h3 className="font-medium text-gray-800">
                                                        {item.name}
                                                    </h3>
                                                    <p className="text-sm text-gray-500">
                                                        Qty: {item.quantity}
                                                    </p>
                                                </div>
                                                <p className="font-semibold text-gray-800">
                                                    {formatPrice(
                                                        (item.price ?? 0) * (item.quantity ?? 1)
                                                    )}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="p-6 text-center text-gray-500 text-sm">
                                    No item details available for this order.
                                </div>
                            )}
                        </div>
                        {vendorSubtotal > 0 && (
                            <div className="p-4 border-t border-gray-200 flex justify-end">
                                <div className="text-right space-y-1.5 min-w-[220px]">
                                    <div className="flex justify-between gap-4 text-sm text-gray-500">
                                        <span>Original Subtotal:</span>
                                        <span className="font-medium text-gray-700">{formatPrice(vendorSubtotal)}</span>
                                    </div>
                                    <div className="flex justify-between gap-4 text-sm text-gray-500">
                                        <span>Discounted Subtotal:</span>
                                        <span className="font-semibold text-gray-800">
                                            {formatPrice(
                                                order.commissionDetails?.effectiveSubtotal !== undefined
                                                    ? order.commissionDetails.effectiveSubtotal
                                                    : (vendorSubtotal - (vendorItem?.discount || 0))
                                            )}
                                        </span>
                                    </div>
                                    <div className="flex justify-between gap-4 text-sm text-gray-500">
                                        <span>Tax:</span>
                                        <span className="font-medium text-gray-700">
                                            {formatPrice(order.vendorFinancials?.tax ?? vendorItem?.tax ?? 0)}
                                        </span>
                                    </div>
                                    <div className="flex justify-between gap-4 text-sm text-gray-500">
                                        <span>Commission:</span>
                                        <span className="font-medium text-red-600">
                                            -{formatPrice(
                                                order.commissionDetails?.commission !== undefined
                                                    ? order.commissionDetails.commission
                                                    : parseFloat(((vendorSubtotal - (vendorItem?.discount || 0)) * (vendorItem?.commissionRate || 10) / 100).toFixed(2))
                                            )}
                                        </span>
                                    </div>
                                    <div className="flex justify-between gap-4 pt-2 border-t border-gray-150 text-sm">
                                        <span className="font-semibold text-gray-700">Vendor Earnings:</span>
                                        <span className="font-bold text-primary-600">
                                            {formatPrice(
                                                order.commissionDetails?.vendorEarnings !== undefined
                                                    ? order.commissionDetails.vendorEarnings
                                                    : parseFloat(((vendorSubtotal - (vendorItem?.discount || 0)) * (1 - (vendorItem?.commissionRate || 10) / 100)).toFixed(2))
                                            )}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Order Status */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                        <h2 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                            <FiDollarSign />
                            Order Summary
                        </h2>
                        <div className="flex items-center justify-between">
                            <span className="text-gray-600">Your items status</span>
                            <Badge
                                variant={
                                    currentStatus === 'delivered'
                                        ? 'success'
                                        : currentStatus === 'pending'
                                            ? 'warning'
                                            : currentStatus === 'cancelled'
                                                ? 'error'
                                                : 'info'
                                }
                            >
                                {currentStatus.toUpperCase()}
                            </Badge>
                        </div>
                        {currentStatus === 'delivered' && (
                            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                                <span className="text-gray-600 text-sm">Delivered On</span>
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
                    </div>

                    {/* Shipments & Fulfillment */}
                    {order.shipments && order.shipments.length > 0 && (
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                            <div className="p-4 border-b border-gray-200 bg-gray-50/50 flex items-center justify-between">
                                <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                                    <span className="inline-block p-1.5 bg-primary-50 text-primary-600 rounded-lg">🚚</span>
                                    Fulfillment & Shipments
                                </h2>
                                <Badge variant="info">{order.shipments.length} Package{order.shipments.length > 1 ? 's' : ''}</Badge>
                            </div>
                            <div className="divide-y divide-gray-100">
                                {order.shipments.map((shipment, index) => {
                                    const deliveryBoy = shipment.deliveryBoyId;
                                    const assignmentStatus = shipment.deliveryAssignmentStatus;
                                    return (
                                        <div key={shipment._id || index} className="p-4 hover:bg-gray-50/30 transition-colors">
                                            <div className="flex flex-col sm:flex-row justify-between gap-4">
                                                {/* Meta Info */}
                                                <div>
                                                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                                        Package {index + 1}
                                                        <Badge variant={shipment.status} className="text-[10px] py-0.5 px-2">
                                                            {shipment.status}
                                                        </Badge>
                                                    </h3>
                                                    <p className="text-[11px] text-gray-500 font-mono mt-1 mb-2">ID: {shipment.shipmentNumber || shipment._id}</p>
                                                    
                                                    {shipment.providerId && (
                                                        <p className="text-xs text-gray-600 font-medium capitalize">
                                                            Provider: <span className="font-bold text-gray-800">{shipment.providerId.replace('_', ' ')}</span>
                                                        </p>
                                                    )}
                                                    {shipment.awbCode && (
                                                        <p className="text-xs text-gray-600 font-medium">
                                                            AWB: <span className="font-bold text-gray-800 font-mono">{shipment.awbCode}</span>
                                                        </p>
                                                    )}
                                                </div>

                                                {/* Delivery Partner */}
                                                {deliveryBoy && (
                                                    <div className="sm:text-right">
                                                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Assigned Partner</p>
                                                        <p className="text-sm font-bold text-gray-800">{deliveryBoy.name}</p>
                                                        {deliveryBoy.phone && (
                                                            <a href={`tel:${deliveryBoy.phone}`} className="text-xs text-primary-600 hover:underline">
                                                                {deliveryBoy.phone}
                                                            </a>
                                                        )}
                                                        <div className="mt-1">
                                                            {assignmentStatus === 'accepted' ? (
                                                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                                                                    Rider Accepted
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-50 text-yellow-700">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-500"></span>
                                                                    Pending Accept
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Pickup OTP */}
                                            {currentStatus === 'ready_for_pickup' && assignmentStatus === 'accepted' && (
                                                <div className="mt-4 p-4 bg-primary-50/50 border border-primary-100 rounded-xl">
                                                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                                                        <div>
                                                            <h3 className="font-bold text-primary-800 text-sm flex items-center gap-1.5 mb-1">
                                                                🔐 Verify Pickup
                                                            </h3>
                                                            <p className="text-xs text-primary-700">
                                                                Ask the rider for their 6-digit OTP code to verify hand over.
                                                            </p>
                                                        </div>
                                                        <form onSubmit={(e) => { e.preventDefault(); handleVerifyPickup(e, order.orderId || order._id); }} className="flex gap-2 w-full sm:w-auto">
                                                            <input
                                                                type="text"
                                                                inputMode="numeric"
                                                                maxLength={6}
                                                                value={pickupOtp}
                                                                onChange={(e) => setPickupOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                                                placeholder="6-digit OTP"
                                                                className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm text-center font-mono font-bold tracking-widest focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
                                                            />
                                                            <button
                                                                type="submit"
                                                                disabled={verifyingOtp || pickupOtp.length !== 6}
                                                                className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-bold hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                                                            >
                                                                {verifyingOtp ? 'Verifying...' : 'Verify'}
                                                            </button>
                                                        </form>
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
                <div className="space-y-6">
                    {/* Customer Info */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                        <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                            <FiUser />
                            Customer Details
                        </h2>
                        <div className="space-y-3">
                            <div>
                                <p className="text-sm text-gray-500">Name</p>
                                <p className="font-medium">{customerName}</p>
                            </div>
                            <div>
                                <p className="text-sm text-gray-500">Email</p>
                                <p className="font-medium">{customerEmail}</p>
                            </div>
                        </div>
                    </div>

                    {/* Legacy Delivery Partner Details - Hidden since it moved to main content */}

                    {/* Shipping Address */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                        <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                            <FiMapPin />
                            Shipping Address
                        </h2>
                        {shippingAddress ? (
                            <p className="text-gray-600 text-sm leading-relaxed">
                                {shippingAddress.address ?? shippingAddress.street ?? 'N/A'}
                                <br />
                                {shippingAddress.city}, {shippingAddress.state}{' '}
                                {shippingAddress.zipCode}
                                <br />
                                {shippingAddress.country}
                            </p>
                        ) : (
                            <p className="text-sm text-gray-400">
                                No address available
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </motion.div>
    );
};

export default OrderDetail;
