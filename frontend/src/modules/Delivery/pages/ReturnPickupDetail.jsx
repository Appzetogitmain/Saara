import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  FiArrowLeft,
  FiMapPin,
  FiPhone,
  FiPackage,
  FiNavigation,
  FiCheck,
  FiRefreshCw,
  FiTruck,
  FiCheckCircle,
  FiAlertCircle,
  FiImage,
} from 'react-icons/fi';
import PageTransition from '../../../shared/components/PageTransition';
import { getSocket, joinRoom, leaveRoom } from '../../../shared/utils/socket';
import { formatPrice } from '../../../shared/utils/helpers';
import toast from 'react-hot-toast';
import { useDeliveryAuthStore } from '../store/deliveryStore';

const DeliveryReturnPickupDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    fetchReturnPickupById,
    acceptReturnPickup,
    rejectReturnPickup,
    updateReturnPickupStatus,
    verifyReturnPickupOtp,
    verifyVendorHandoverOtp,
    verifyCustomerDeliveryOtp,
    isLoadingOrder,
    isUpdatingOrderStatus,
  } = useDeliveryAuthStore();

  const [returnRequest, setReturnRequest] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  // Interactive UI state
  const [arrivedAtLocation, setArrivedAtLocation] = useState(false);
  const [otpInput, setOtpInput] = useState('');
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [checklist, setChecklist] = useState({});
  const [riderPhotos, setRiderPhotos] = useState([]);

  const loadDetail = useCallback(async () => {
    try {
      setLoadFailed(false);
      setErrorMsg('');
      const data = await fetchReturnPickupById(id);
      setReturnRequest(data);
    } catch (err) {
      setLoadFailed(true);
      setReturnRequest(null);
      setErrorMsg(err?.response?.data?.message || err?.message || 'Unable to load return request details');
    }
  }, [id, fetchReturnPickupById]);

  useEffect(() => {
    let mounted = true;
    loadDetail();

    const token = localStorage.getItem('delivery-token') || localStorage.getItem('token');
    if (token && id) {
      const socket = getSocket(token);
      if (socket) {
        joinRoom(`return_${id}`);
        const handleReturnUpdate = (updated) => {
          if ((String(updated._id) === String(id) || String(updated.id) === String(id)) && mounted) {
            loadDetail();
          }
        };
        socket.on('return_updated', handleReturnUpdate);

        return () => {
          mounted = false;
          socket.off('return_updated', handleReturnUpdate);
          leaveRoom(`return_${id}`);
        };
      }
    }
    return () => {
      mounted = false;
    };
  }, [id, loadDetail]);

  const formatVendorAddress = (addr) => {
    if (!addr) return '';
    if (typeof addr === 'string') return addr;
    const parts = [addr.street, addr.city, addr.state, addr.zipCode, addr.country].filter(Boolean);
    return parts.join(', ');
  };

  const handleAccept = async () => {
    try {
      const updated = await acceptReturnPickup(id);
      setReturnRequest(updated);
      toast.success('Offer accepted successfully!');
    } catch {
      // toast error handled by api interceptor
    }
  };

  const handleReject = async () => {
    try {
      await rejectReturnPickup(id);
      toast.success('Offer rejected');
      navigate('/delivery/orders?tab=pickups');
    } catch {
      // toast error handled by api interceptor
    }
  };

  const handleVerifyOtp = async () => {
    const code = otpInput.trim();
    if (!code || code.length !== 6) {
      toast.error('Please enter a valid 6-digit OTP');
      return;
    }
    setIsVerifyingOtp(true);
    try {
      await verifyReturnPickupOtp(id, code);
      toast.success('Customer OTP verified successfully!');
      setOtpInput('');
      await loadDetail();
    } catch {
      // toast error handled by api interceptor
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const handleVerifyVendorHandover = async () => {
    const code = otpInput.trim();
    if (!code || code.length !== 6) {
      toast.error('Please enter a valid 6-digit OTP');
      return;
    }
    setIsVerifyingOtp(true);
    try {
      await verifyVendorHandoverOtp(id, code);
      toast.success('Vendor Handover OTP verified successfully!');
      setOtpInput('');
      await loadDetail();
    } catch {
      // toast error handled by api interceptor
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const handleVerifyCustomerDelivery = async () => {
    const code = otpInput.trim();
    if (!code || code.length !== 6) {
      toast.error('Please enter a valid 6-digit OTP');
      return;
    }
    setIsVerifyingOtp(true);
    try {
      await verifyCustomerDeliveryOtp(id, code);
      toast.success('Customer Delivery OTP verified successfully!');
      setOtpInput('');
      await loadDetail();
    } catch {
      // toast error handled by api interceptor
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const handleMarkPickedUp = async () => {
    const evidenceRequiredReasons = [
      "Product Damaged",
      "Wrong Product Received",
      "Missing Parts or Accessories",
      "Product Not Matching Description",
      "Defective Product"
    ];
    const isEvidenceBased = evidenceRequiredReasons.includes(returnRequest?.returnReason);
    if (isEvidenceBased && riderPhotos.length === 0) {
      toast.error(`At least one pickup photo is required for reason: ${returnRequest?.returnReason}`);
      return;
    }

    if (!window.confirm('Confirm items have been collected and verified?')) return;

    try {
      const formData = new FormData();
      riderPhotos.forEach((file) => formData.append('photos', file));
      await updateReturnPickupStatus(id, 'picked_up', formData);
      toast.success('Status updated to Picked Up!');
      await loadDetail();
    } catch {
      // toast error handled by api interceptor
    }
  };

  const openInGoogleMaps = (locationText) => {
    if (!locationText) return;
    const encoded = encodeURIComponent(locationText);
    const webUrl = `https://www.google.com/maps/search/?api=1&query=${encoded}`;
    window.open(webUrl, '_blank');
  };

  if (isLoadingOrder) {
    return (
      <PageTransition>
        <div className="px-4 py-6 max-w-2xl mx-auto space-y-4">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-slate-200 rounded w-1/3"></div>
            <div className="h-48 bg-slate-200 rounded-3xl"></div>
            <div className="h-48 bg-slate-200 rounded-3xl"></div>
          </div>
        </div>
      </PageTransition>
    );
  }

  if (!returnRequest) {
    return (
      <PageTransition>
        <div className="px-4 py-12 max-w-md mx-auto text-center space-y-4">
          <FiAlertCircle className="text-slate-400 text-5xl mx-auto" />
          <p className="text-slate-600 font-bold">{loadFailed ? (errorMsg || 'Unable to load return pickup details') : 'Return pickup request not found'}</p>
          <button
            onClick={() => navigate('/delivery/orders?tab=pickups')}
            className="px-5 py-2.5 rounded-xl bg-primary-600 text-white text-xs font-extrabold uppercase tracking-wider"
          >
            Back to Return Pickups
          </button>
        </div>
      </PageTransition>
    );
  }

  const ret = returnRequest;
  const isExchange = ret.requestType === 'exchange';
  const isReplacementLeg2 = isExchange && ['replacement_ready', 'replacement_assigned', 'out_for_delivery', 'completed'].includes(ret.status);
  const isOffer = ret.deliveryAssignmentStatus === 'assigned';

  const statusMap = {
    pickup_pending: { bar: 'bg-amber-500', badge: 'bg-amber-50 text-amber-800 border-amber-200', label: 'Awaiting Acceptance' },
    pickup_assigned: { bar: 'bg-blue-500', badge: 'bg-blue-50 text-blue-800 border-blue-200', label: 'Pickup Assigned' },
    picked_up: { bar: 'bg-indigo-600', badge: 'bg-indigo-50 text-indigo-800 border-indigo-200', label: 'Items Picked Up' },
    delivered_to_vendor: { bar: 'bg-teal-500', badge: 'bg-teal-50 text-teal-800 border-teal-200', label: 'Delivered to Shop' },
    replacement_ready: { bar: 'bg-purple-500', badge: 'bg-purple-50 text-purple-800 border-purple-200', label: 'Replacement Ready' },
    replacement_assigned: { bar: 'bg-blue-500', badge: 'bg-blue-50 text-blue-800 border-blue-200', label: 'Replacement Assigned' },
    out_for_delivery: { bar: 'bg-indigo-600', badge: 'bg-indigo-50 text-indigo-800 border-indigo-200', label: 'Out for Delivery' },
    completed: { bar: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-800 border-emerald-200', label: 'Completed' },
  };

  const currentStatus = statusMap[ret.status] || statusMap.pickup_pending;
  const customerName = ret.orderId?.shippingAddress?.name || ret.userId?.name || 'Customer';
  const customerPhone = ret.orderId?.shippingAddress?.phone || ret.userId?.phone || '';
  const customerAddress = ret.orderId?.shippingAddress?.address || 'Customer address unavailable';
  const vendorName = ret.vendorId?.storeName || ret.vendorId?.shopName || 'Vendor Shop';
  const vendorPhone = ret.vendorId?.phone || '';
  const vendorAddress = formatVendorAddress(ret.vendorId?.address) || 'Vendor address unavailable';

  const isPickupLeg = !isReplacementLeg2;
  const pickupAddress = isPickupLeg ? customerAddress : vendorAddress;
  const pickupContactName = isPickupLeg ? customerName : vendorName;
  const pickupPhone = isPickupLeg ? customerPhone : vendorPhone;

  const dropoffAddress = isPickupLeg ? vendorAddress : customerAddress;
  const dropoffContactName = isPickupLeg ? vendorName : customerName;
  const dropoffPhone = isPickupLeg ? vendorPhone : customerPhone;

  const checklistCount = Object.keys(checklist).filter((k) => checklist[k]).length;

  return (
    <PageTransition>
      <div className="px-4 py-6 space-y-5 max-w-3xl mx-auto pb-28">
        
        {/* Navigation Bar Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/delivery/orders?tab=pickups')}
            className="p-2.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-2xl shadow-sm transition-colors"
          >
            <FiArrowLeft className="text-lg" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-primary-50 text-primary-700 text-[10px] font-black uppercase tracking-wider border border-primary-150">
                {isReplacementLeg2 ? 'Replacement Delivery' : 'Return Pickup'}
              </span>
              <span className="font-mono text-xs font-bold text-slate-400 truncate">
                ID: {String(ret._id).slice(-8).toUpperCase()}
              </span>
            </div>
            <h1 className="text-xl font-black text-slate-800 tracking-tight mt-0.5 truncate">
              Order #{ret.orderId?.orderId || ret.orderId?._id || 'N/A'}
            </h1>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider border ${currentStatus.badge}`}>
            {currentStatus.label}
          </span>
        </div>

        {/* Stepper Progress Bar (Active Pickups) */}
        {ret.status === 'pickup_assigned' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white border border-slate-100 rounded-3xl p-4 shadow-sm space-y-3"
          >
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">
              Pickup Workflow Progress
            </h3>
            <div className="grid grid-cols-4 gap-1 text-center">
              <div className="flex flex-col items-center">
                <span className={`w-6 h-6 rounded-full text-xs font-black flex items-center justify-center ${arrivedAtLocation ? 'bg-emerald-500 text-white' : 'bg-indigo-600 text-white'}`}>
                  {arrivedAtLocation ? <FiCheck /> : '1'}
                </span>
                <span className="text-[10px] font-bold text-slate-700 mt-1">1. Reach</span>
              </div>
              <div className="flex flex-col items-center">
                <span className={`w-6 h-6 rounded-full text-xs font-black flex items-center justify-center ${ret.returnPickupOtpVerified ? 'bg-emerald-500 text-white' : arrivedAtLocation ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-400'}`}>
                  {ret.returnPickupOtpVerified ? <FiCheck /> : '2'}
                </span>
                <span className={`text-[10px] font-bold mt-1 ${ret.returnPickupOtpVerified ? 'text-emerald-700' : 'text-slate-400'}`}>2. OTP</span>
              </div>
              <div className="flex flex-col items-center">
                <span className={`w-6 h-6 rounded-full text-xs font-black flex items-center justify-center ${ret.returnPickupOtpVerified && checklistCount === 8 ? 'bg-emerald-500 text-white' : ret.returnPickupOtpVerified ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-400'}`}>
                  {checklistCount === 8 ? <FiCheck /> : '3'}
                </span>
                <span className={`text-[10px] font-bold mt-1 ${checklistCount === 8 ? 'text-emerald-700' : 'text-slate-400'}`}>3. Verify</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-400 text-xs font-black flex items-center justify-center">
                  4
                </span>
                <span className="text-[10px] font-bold text-slate-400 mt-1">4. Handover</span>
              </div>
            </div>
          </motion.div>
        )}

        {/* Section 1: Pickup Location Card */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm space-y-3 relative overflow-hidden"
        >
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10px] font-black text-amber-700 uppercase tracking-widest bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                STEP 1: PICKUP FROM
              </span>
              <h2 className="text-base font-black text-slate-800 mt-2">
                {pickupContactName}
              </h2>
            </div>
            {pickupPhone && (
              <a
                href={`tel:${pickupPhone}`}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-extrabold hover:bg-emerald-100 transition-colors"
              >
                <FiPhone /> Call
              </a>
            )}
          </div>

          <div className="flex items-start gap-2.5 p-3.5 bg-slate-50 border border-slate-100 rounded-2xl">
            <FiMapPin className="text-primary-600 text-base mt-0.5 flex-shrink-0" />
            <p className="text-xs font-semibold text-slate-700 leading-relaxed">
              {pickupAddress}
            </p>
          </div>

          <button
            onClick={() => openInGoogleMaps(pickupAddress)}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors"
          >
            <FiNavigation className="text-primary-600" />
            Open Pickup Location in Maps
          </button>
        </motion.div>

        {/* Section 2: Destination Dropoff Card */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm space-y-3"
        >
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10px] font-black text-indigo-700 uppercase tracking-widest bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                STEP 2: DELIVER TO
              </span>
              <h2 className="text-base font-black text-slate-800 mt-2">
                {dropoffContactName}
              </h2>
            </div>
            {dropoffPhone && (
              <a
                href={`tel:${dropoffPhone}`}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-extrabold hover:bg-indigo-100 transition-colors"
              >
                <FiPhone /> Call
              </a>
            )}
          </div>

          <div className="flex items-start gap-2.5 p-3.5 bg-slate-50 border border-slate-100 rounded-2xl">
            <FiTruck className="text-indigo-600 text-base mt-0.5 flex-shrink-0" />
            <p className="text-xs font-semibold text-slate-700 leading-relaxed">
              {dropoffAddress}
            </p>
          </div>

          <button
            onClick={() => openInGoogleMaps(dropoffAddress)}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors"
          >
            <FiNavigation className="text-indigo-600" />
            Open Dropoff Location in Maps
          </button>
        </motion.div>

        {/* Section 3: Item & Evidence Details */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm space-y-4"
        >
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">
                Target Return Items
              </h3>
              <p className="text-xs text-slate-500 font-bold mt-0.5">
                Reason: <span className="text-rose-600 font-extrabold">{ret.returnReason}</span>
              </p>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Refund Value</span>
              <span className="text-sm font-black text-slate-800 font-mono">{formatPrice(ret.refundAmount)}</span>
            </div>
          </div>

          <div className="space-y-3">
            {ret.items && ret.items.map((item, idx) => (
              <div key={idx} className="flex gap-3.5 items-center p-3 bg-slate-50 border border-slate-100 rounded-2xl">
                {item.image ? (
                  <img src={item.image} className="w-14 h-14 rounded-xl object-cover border border-slate-200 flex-shrink-0" alt="product" />
                ) : (
                  <div className="w-14 h-14 rounded-xl bg-slate-200 flex items-center justify-center text-slate-400 flex-shrink-0">
                    <FiPackage className="text-xl" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-bold text-slate-800 truncate">{item.name}</h4>
                  <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
                    Qty: {item.quantity} • Price: {formatPrice(item.price)}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Customer Uploaded Evidence */}
          {ret.evidenceImages && ret.evidenceImages.length > 0 && (
            <div className="p-3.5 bg-amber-50/40 border border-amber-200/60 rounded-2xl space-y-2">
              <h4 className="text-[11px] font-black text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                <FiImage className="text-amber-700" /> Customer Provided Evidence Photos
              </h4>
              <div className="flex gap-2 overflow-x-auto py-1">
                {ret.evidenceImages.map((img, idx) => (
                  <a
                    key={idx}
                    href={img.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-16 h-16 rounded-xl border border-amber-200 overflow-hidden flex-shrink-0 bg-black hover:opacity-85 transition-opacity"
                  >
                    <img src={img.url} className="w-full h-full object-cover" alt="customer-evidence" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </motion.div>

        {/* Section 4: Interactive Workflow Actions & Verification */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm space-y-4"
        >
          {isOffer ? (
            <div className="space-y-3">
              <div className="p-4 bg-indigo-50 border border-indigo-150 rounded-2xl text-center">
                <h4 className="text-xs font-black text-indigo-900 uppercase tracking-widest">
                  New Pickup Assignment Offer
                </h4>
                <p className="text-xs text-indigo-700 font-semibold mt-1">
                  Accept this request to navigate to the customer location and collect returned items.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleReject}
                  disabled={isUpdatingOrderStatus}
                  className="flex-1 py-3 bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-600 rounded-xl text-xs font-extrabold transition-all"
                >
                  Reject Offer
                </button>
                <button
                  onClick={handleAccept}
                  disabled={isUpdatingOrderStatus}
                  className="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white rounded-xl text-xs font-extrabold transition-all shadow-md"
                >
                  {isUpdatingOrderStatus ? 'Accepting...' : 'Accept Pickup Request'}
                </button>
              </div>
            </div>
          ) : ret.status === 'pickup_assigned' ? (
            <div className="space-y-4">
              {/* Instructions Banner */}
              <div className="p-4 bg-amber-50/50 border border-amber-200/60 rounded-2xl space-y-1.5">
                <h4 className="text-xs font-black text-amber-900 uppercase tracking-widest flex items-center gap-1.5">
                  📋 Pickup Verification Checklist & Rules
                </h4>
                <ul className="text-xs font-semibold text-amber-800 list-disc list-inside space-y-1">
                  <li>Reach customer location and ask customer for the 6-digit OTP code.</li>
                  <li>Verify all 8 item checklist rules (original tags, undamaged, correct variant).</li>
                  <li>{["Product Damaged", "Wrong Product Received", "Missing Parts or Accessories", "Product Not Matching Description", "Defective Product"].includes(ret.returnReason) ? 'Take at least 1 proof photo of package condition (Required).' : 'Take photos of package condition (Optional).'}</li>
                </ul>
              </div>

              {/* Step 1: Reach Location Toggle */}
              {!arrivedAtLocation ? (
                <button
                  onClick={() => setArrivedAtLocation(true)}
                  className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-extrabold transition-all shadow-md flex items-center justify-center gap-2"
                >
                  <FiMapPin className="text-sm" />
                  I'm at Customer Pickup Location
                </button>
              ) : (
                <div className="space-y-5 border-t border-slate-100 pt-4">
                  {/* Step 2: OTP Verification */}
                  {!ret.returnPickupOtpVerified ? (
                    <div className="space-y-3 bg-indigo-50/30 border border-indigo-150 p-4 rounded-2xl">
                      <label className="text-xs font-black text-indigo-900 uppercase tracking-wider block">
                        Enter Customer OTP Code
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          maxLength={6}
                          placeholder="6-digit OTP"
                          value={otpInput}
                          onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ''))}
                          className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-bold font-mono tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <button
                          onClick={handleVerifyOtp}
                          disabled={isVerifyingOtp}
                          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-extrabold transition-colors disabled:bg-indigo-400"
                        >
                          {isVerifyingOtp ? 'Verifying...' : 'Verify OTP'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-xs font-black text-emerald-800 bg-emerald-50 border border-emerald-200 p-3 rounded-2xl">
                        <FiCheckCircle className="text-base text-emerald-600 flex-shrink-0" />
                        <span>Customer Verification Successful (OTP Verified)</span>
                      </div>

                      {/* Step 3: Product Checklist */}
                      <div className="bg-slate-50 border border-slate-150 p-4 rounded-2xl space-y-3">
                        <div className="flex justify-between items-center">
                          <h4 className="text-xs font-black text-slate-700 uppercase tracking-widest">
                            Rider Inspection Checklist
                          </h4>
                          <span className="text-xs font-bold text-indigo-600">
                            {checklistCount} / 8 Verified
                          </span>
                        </div>
                        <div className="space-y-2.5">
                          {[
                            { id: 'match', label: 'Product matches the order description' },
                            { id: 'qty', label: 'Correct quantity received' },
                            { id: 'variant', label: 'Correct size, color & variant' },
                            { id: 'brand', label: 'Brand & serial numbers match' },
                            { id: 'tag', label: 'Original tags & labels attached' },
                            { id: 'accessories', label: 'All accessories & box included' },
                            { id: 'sealed', label: 'Package sealed properly' },
                            { id: 'condition', label: 'Condition matches return reason' },
                          ].map((check) => {
                            const isChecked = checklist[check.id] || false;
                            return (
                              <label key={check.id} className="flex items-start gap-3 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) => {
                                    const val = e.target.checked;
                                    setChecklist((prev) => ({ ...prev, [check.id]: val }));
                                  }}
                                  className="mt-0.5 w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                <span className={`text-xs font-bold ${isChecked ? 'text-slate-800' : 'text-slate-500'}`}>
                                  {check.label}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      {/* Step 4: Photo Proof Upload */}
                      <div className="bg-slate-50 border border-slate-150 p-4 rounded-2xl space-y-3">
                        <div className="flex justify-between items-center">
                          <h4 className="text-xs font-black text-slate-700 uppercase tracking-widest">
                            Capture Pickup Proof Photos
                          </h4>
                          {["Product Damaged", "Wrong Product Received", "Missing Parts or Accessories", "Product Not Matching Description", "Defective Product"].includes(ret.returnReason) && (
                            <span className="text-[9px] font-black uppercase text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                              Required
                            </span>
                          )}
                        </div>
                        <input
                          type="file"
                          multiple
                          accept="image/*"
                          id="rider-photo-upload-detail"
                          className="hidden"
                          onChange={(e) => {
                            const files = Array.from(e.target.files || []);
                            setRiderPhotos((prev) => [...prev, ...files].slice(0, 5));
                          }}
                        />
                        <div className="flex flex-wrap gap-2.5">
                          <label
                            htmlFor="rider-photo-upload-detail"
                            className="w-14 h-14 bg-white hover:bg-slate-100 border border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center cursor-pointer text-slate-400 hover:text-slate-600 transition-all shadow-sm"
                          >
                            <span className="text-xl font-black leading-none">+</span>
                            <span className="text-[8px] font-black uppercase tracking-wider mt-0.5">Photo</span>
                          </label>
                          {riderPhotos.map((file, fIdx) => (
                            <div key={fIdx} className="w-14 h-14 rounded-xl border border-slate-200 overflow-hidden relative bg-black group">
                              <img src={URL.createObjectURL(file)} className="w-full h-full object-cover" alt="rider-proof" />
                              <button
                                type="button"
                                onClick={() => setRiderPhotos((prev) => prev.filter((_, idx) => idx !== fIdx))}
                                className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/70 text-white rounded-full flex items-center justify-center text-xs font-bold hover:bg-rose-600 transition-colors"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Complete Pickup Button */}
                      <button
                        onClick={handleMarkPickedUp}
                        disabled={
                          checklistCount < 8 ||
                          (["Product Damaged", "Wrong Product Received", "Missing Parts or Accessories", "Product Not Matching Description", "Defective Product"].includes(ret.returnReason) && riderPhotos.length === 0)
                        }
                        className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Confirm & Mark Picked Up
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : ret.status === 'picked_up' ? (
            <div className="p-5 bg-indigo-50/50 border border-indigo-200 rounded-2xl space-y-3 text-center">
              <h4 className="text-xs font-black text-indigo-900 uppercase tracking-widest flex items-center justify-center gap-2">
                🔑 Vendor Handoff OTP Code
              </h4>
              <p className="text-xs text-indigo-700 font-semibold leading-relaxed">
                Provide this OTP code to the store clerk upon returning items to the shop. The vendor must verify this on their dashboard to complete handoff.
              </p>
              <div className="py-3 px-6 bg-white border border-indigo-200 rounded-2xl font-mono text-3xl font-black text-indigo-950 tracking-widest shadow-sm max-w-xs mx-auto">
                {ret.vendorHandoffOtpDebug || '123456'}
              </div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                Status: In Transit to Shop
              </p>
            </div>
          ) : ret.status === 'replacement_assigned' ? (
            <div className="space-y-3 bg-purple-50/30 border border-purple-150 p-4 rounded-2xl">
              <label className="text-xs font-black text-purple-900 uppercase tracking-wider block">
                Enter Vendor Handover OTP Code
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  maxLength={6}
                  placeholder="6-digit OTP"
                  value={otpInput}
                  onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ''))}
                  className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-bold font-mono tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <button
                  onClick={handleVerifyVendorHandover}
                  disabled={isVerifyingOtp}
                  className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-extrabold transition-colors disabled:bg-purple-400"
                >
                  {isVerifyingOtp ? 'Verifying...' : 'Verify OTP'}
                </button>
              </div>
            </div>
          ) : ret.status === 'out_for_delivery' ? (
            <div className="space-y-3 bg-indigo-50/30 border border-indigo-150 p-4 rounded-2xl">
              <label className="text-xs font-black text-indigo-900 uppercase tracking-wider block">
                Enter Customer Delivery OTP Code
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  maxLength={6}
                  placeholder="6-digit OTP"
                  value={otpInput}
                  onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ''))}
                  className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-bold font-mono tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  onClick={handleVerifyCustomerDelivery}
                  disabled={isVerifyingOtp}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-extrabold transition-colors disabled:bg-indigo-400"
                >
                  {isVerifyingOtp ? 'Verifying...' : 'Verify OTP'}
                </button>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-slate-50 border border-slate-150 rounded-2xl text-center">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Current Status: {currentStatus.label}
              </p>
            </div>
          )}
        </motion.div>
      </div>
    </PageTransition>
  );
};

export default DeliveryReturnPickupDetail;
