import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { FiPackage, FiTruck, FiChevronDown, FiChevronUp, FiShield, FiExternalLink } from 'react-icons/fi';
import { formatPrice } from '../../../../shared/utils/helpers';
import { formatVariantLabel, getVariantSignature } from '../../../../shared/utils/variant';
import LazyImage from '../../../../shared/components/LazyImage';

const PackageCard = ({ shipment, index, totalPackages, items, getItemReturnStatus, isMultiPackage, vendorGroup, onCancelPackage }) => {
  const [expanded, setExpanded] = useState(false);

  const packageStatus = vendorGroup?.status || shipment?.status || 'pending';

  // Status mappings
  const getStatusConfig = (status) => {
    switch (status?.toLowerCase()) {
      case 'delivered':
        return { label: 'Delivered', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' };
      case 'shipped':
        return { label: 'Shipped', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' };
      case 'out_for_delivery':
        return { label: 'Out for Delivery', bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' };
      case 'ready_for_pickup':
        return { label: 'Ready for Pickup', bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' };
      case 'processing':
        return { label: 'Processing', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' };
      case 'cancelled':
        return { label: 'Cancelled', bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' };
      default:
        return { label: 'Pending', bg: 'bg-slate-50', text: 'text-slate-700', border: 'border-slate-200' };
    }
  };

  const statusConfig = getStatusConfig(packageStatus);
  const deliveryBoy = shipment?.deliveryBoyId;
  const showOTP = shipment?.deliveryOtpDebug && ['shipped', 'out_for_delivery'].includes(shipment?.status);
  const isCancellable = ['pending', 'processing', 'ready_for_pickup', 'payment_pending', 'confirmed'].includes(packageStatus?.toLowerCase());

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden mb-4 transition-all duration-300">
      {/* Header */}
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center">
            <FiPackage className="text-sm" />
          </div>
          <div>
            <h3 className="font-extrabold text-gray-900 text-sm">
              {isMultiPackage ? `Package ${index + 1} of ${totalPackages}` : 'Your Package'}
            </h3>
            {(vendorGroup?.vendorName || shipment?.providerId) && (
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                {vendorGroup?.vendorName ? `Store: ${vendorGroup.vendorName}` : `Via ${shipment?.providerId === 'shiprocket' ? 'Shiprocket 3PL' : 'Local Delivery'}`}
              </p>
            )}
          </div>
        </div>
        <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wide border ${statusConfig.bg} ${statusConfig.text} ${statusConfig.border}`}>
          {statusConfig.label}
        </span>
      </div>

      {/* Items */}
      <div className="px-4 py-3 space-y-3">
        {items.map((item, itemIndex) => (
          <div key={`${item.id}-${itemIndex}-${getVariantSignature(item?.variant || {})}`} className="flex gap-3 items-center">
            <Link
              to={`/product/${item.productId || item.id}?variantSize=${encodeURIComponent(item?.variant?.size || '')}&variantColor=${encodeURIComponent(item?.variant?.color || '')}`}
              className="w-14 h-14 rounded-xl overflow-hidden bg-slate-50 border border-slate-100 flex-shrink-0 p-0.5"
            >
              <LazyImage src={item.image} alt={item.name} className="w-full h-full object-contain" />
            </Link>
            <div className="flex-1 min-w-0">
              <Link
                to={`/product/${item.productId || item.id}?variantSize=${encodeURIComponent(item?.variant?.size || '')}&variantColor=${encodeURIComponent(item?.variant?.color || '')}`}
                className="hover:underline"
              >
                <h4 className="font-bold text-gray-900 text-sm truncate">{item.name}</h4>
              </Link>
              <div className="flex justify-between items-center mt-0.5">
                <p className="text-xs text-slate-500 font-medium">Qty: {item.quantity}</p>
                <p className="text-sm font-extrabold text-gray-900">{formatPrice(item.price * item.quantity)}</p>
              </div>
              {formatVariantLabel(item?.variant) && (
                <p className="text-[10px] text-slate-400 font-medium mt-0.5">{formatVariantLabel(item?.variant)}</p>
              )}
              {/* Return Status */}
              {(() => {
                const ret = getItemReturnStatus ? getItemReturnStatus(item) : null;
                if (!ret) return null;
                if (ret.status === 'completed') {
                  return (
                    <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 text-[9px] font-extrabold uppercase tracking-wider border border-rose-100">
                      {ret.requestType === 'exchange' ? 'Exchanged' : 'Returned'}
                    </span>
                  );
                } else if (ret.status !== 'rejected') {
                  return (
                    <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[9px] font-extrabold uppercase tracking-wider border border-amber-200">
                      Return Pending
                    </span>
                  );
                }
                return null;
              })()}
            </div>
          </div>
        ))}
      </div>

      {/* Cancel Product Button for Cancellable Package Status (Only for Multi-Package Orders) */}
      {isCancellable && isMultiPackage && onCancelPackage && (
        <div className="px-4 py-2.5 bg-rose-50/40 border-t border-rose-100/60 flex justify-end">
          <button
            onClick={() => onCancelPackage(vendorGroup, shipment)}
            className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs shadow-sm transition-all duration-200 flex items-center gap-1"
          >
            Cancel Product
          </button>
        </div>
      )}

      {/* Cancelled Banner with Refund Metadata */}
      {packageStatus?.toLowerCase() === 'cancelled' && (
        <div className="px-4 py-2.5 bg-rose-50 border-t border-rose-100 flex items-center justify-between text-xs flex-wrap gap-2">
          <div className="flex items-center gap-1.5 text-rose-700 font-bold">
            <span>❌ Package Cancelled</span>
            {vendorGroup?.cancellationReason && (
              <span className="text-[10px] text-rose-500 font-normal">({vendorGroup.cancellationReason})</span>
            )}
          </div>
          {vendorGroup?.refundedAmount > 0 && (
            <span className="font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200 text-[11px]">
              ₹{vendorGroup.refundedAmount} Credited to Wallet
            </span>
          )}
        </div>
      )}

      {/* Primary Tracking Info (Always Visible if Shipped) */}
      {shipment?.status === 'shipped' && (
        <div className="px-4 pb-3 flex justify-between items-center border-t border-gray-100 pt-2">
           <div className="flex items-center gap-2 text-sm text-gray-700">
             <FiTruck className="text-primary-600" />
             <span className="font-medium">ETA: {shipment.estimatedDeliveryDate ? new Date(shipment.estimatedDeliveryDate).toLocaleDateString() : 'Pending'}</span>
           </div>
           {shipment?.trackingUrl && (
             <a href={shipment.trackingUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-primary-600 hover:text-primary-700 flex items-center gap-1">
               Track <FiExternalLink />
             </a>
           )}
        </div>
      )}

      {/* Expandable Advanced Info */}
      {(deliveryBoy || shipment?.awbCode || showOTP) && (
        <div className="border-t border-gray-100">
          <button 
            onClick={() => setExpanded(!expanded)}
            className="w-full px-4 py-2 flex items-center justify-center gap-1.5 text-xs font-bold text-gray-500 hover:text-gray-700 transition-colors bg-gray-50/50"
          >
            {expanded ? 'Hide Details' : 'View Delivery Details'}
            {expanded ? <FiChevronUp /> : <FiChevronDown />}
          </button>
          
          {expanded && (
            <div className="px-4 py-3 bg-gray-50/80 space-y-3 border-t border-gray-100 animate-fadeIn">
              
              {/* Courier & AWB */}
              {shipment?.awbCode && (
                <div>
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">Tracking AWB</p>
                  <p className="text-sm font-mono font-semibold text-gray-800 break-all">{shipment.awbCode}</p>
                </div>
              )}

              {/* Delivery Partner */}
              {deliveryBoy && (
                <div>
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-1">Delivery Partner</p>
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-400 flex-shrink-0">
                      <FiShield />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-800 truncate">{deliveryBoy.name}</p>
                      {deliveryBoy.vehicleNumber && (
                        <p className="text-[10px] text-gray-500 uppercase truncate">{deliveryBoy.vehicleType || 'Vehicle'} - {deliveryBoy.vehicleNumber}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* OTP Validation */}
              {showOTP && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-xl mt-2">
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
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PackageCard;
