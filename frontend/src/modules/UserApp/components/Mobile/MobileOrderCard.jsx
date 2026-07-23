import { Link } from 'react-router-dom';
import { FiPackage, FiChevronRight, FiCalendar, FiShoppingBag } from 'react-icons/fi';
import { formatPrice } from '../../../../shared/utils/helpers';
import { motion } from 'framer-motion';
import { formatVariantLabel } from '../../../../shared/utils/variant';

const MobileOrderCard = ({ order }) => {
  const orderItems = Array.isArray(order?.items) ? order.items : [];
  const displayItems = orderItems.slice(0, 3);
  const remainingCount = orderItems.length - 3;

  const variantLabels = orderItems
    .map((item) => formatVariantLabel(item?.variant))
    .filter(Boolean);
    
  const variantSummary = variantLabels.length === 1
    ? variantLabels[0]
    : variantLabels.length > 1
      ? `${variantLabels.length} variant selections`
      : '';

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'delivered':
        return 'text-emerald-700 bg-emerald-50 border border-emerald-100';
      case 'shipped':
        return 'text-blue-700 bg-blue-50 border border-blue-100';
      case 'processing':
        return 'text-amber-700 bg-amber-50 border border-amber-100';
      case 'cancelled':
        return 'text-rose-700 bg-rose-50 border border-rose-100';
      default:
        return 'text-slate-700 bg-slate-50 border border-slate-100';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      className="bg-white border border-slate-200/80 rounded-3xl p-5 mb-4 shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-300"
    >
      <Link to={`/orders/${order.id}`} className="block">
        {/* Header: Order ID & Date */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Order ID</span>
            <span className="text-sm font-extrabold text-gray-900 font-mono">#{order.id.slice(-8).toUpperCase()}</span>
          </div>
          <span className="text-xs text-slate-400 font-semibold flex items-center gap-1">
            <FiCalendar className="text-[10px]" />
            {new Date(order.date || order.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
        </div>

        {/* Content Area: Left Thumbnails, Right Details */}
        <div className="flex gap-4 items-center justify-between">
          <div className="flex-1 min-w-0">
            {/* Vendor and Variant Badges */}
            <div className="flex flex-wrap gap-1.5 mb-2.5">
              {order.vendorItems && order.vendorItems.length > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-50 text-primary-700 rounded-md text-[10px] font-bold uppercase tracking-wider">
                  <FiShoppingBag className="text-[9px]" />
                  {order.vendorItems.length} {order.vendorItems.length === 1 ? 'Vendor' : 'Vendors'}
                </span>
              )}
              {variantSummary && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md text-[10px] font-bold uppercase tracking-wider max-w-[150px] truncate">
                  {variantSummary}
                </span>
              )}
            </div>

            {/* Product Images Row */}
            {orderItems.length > 0 ? (
              <div className="flex items-center gap-2 py-1 overflow-x-auto scrollbar-hide">
                {displayItems.map((item, idx) => (
                  <div key={idx} className="relative w-14 h-14 rounded-2xl border border-slate-100 bg-slate-50 flex-shrink-0 overflow-hidden shadow-sm p-0.5">
                    <img src={item.image} alt={item.name} className="w-full h-full object-contain" />
                    {idx === 2 && remainingCount > 0 && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white text-xs font-black">
                        +{remainingCount}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center border border-slate-100">
                <FiPackage className="text-slate-400 text-xl" />
              </div>
            )}
          </div>

          {/* Pricing Details */}
          <div className="text-right flex-shrink-0 pl-2">
            <span className="text-[10px] text-slate-400 uppercase font-black tracking-wider block">Total Price</span>
            <span className="text-lg font-black text-gray-900 font-mono block mt-0.5">
              {formatPrice(order.total || order.amount || 0)}
            </span>
            <span className="text-[11px] text-slate-500 font-semibold block mt-0.5">
              {order.items?.length || 0} item{(order.items?.length || 0) !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Footer Bar: Status & Action Link */}
        <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-100 flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${getStatusColor(order.status)}`}>
              {order.status || 'Pending'}
            </span>
            {(() => {
              if (['returned', 'refunded'].includes(order.status?.toLowerCase())) {
                return null;
              }
              const completedReturns = Array.isArray(order.returnRequests) && order.returnRequests.filter(r => r.status === 'completed');
              const pendingReturns = Array.isArray(order.returnRequests) && order.returnRequests.filter(r => ['pending', 'approved', 'pickup_pending', 'pickup_assigned', 'picked_up', 'delivered_to_vendor'].includes(r.status));
              
              if (completedReturns && completedReturns.length > 0) {
                return (
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-50 text-rose-600 border border-rose-100">
                    Partially Returned
                  </span>
                );
              }
              if (pendingReturns && pendingReturns.length > 0) {
                return (
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-50 text-amber-600 border border-amber-100">
                    Return Requested
                  </span>
                );
              }
              return null;
            })()}
          </div>
          <div className="flex items-center gap-1 text-xs text-primary-600 font-bold hover:text-primary-700 transition-colors">
            <span>View Details</span>
            <FiChevronRight className="text-base" />
          </div>
        </div>
      </Link>
    </motion.div>
  );
};

export default MobileOrderCard;
