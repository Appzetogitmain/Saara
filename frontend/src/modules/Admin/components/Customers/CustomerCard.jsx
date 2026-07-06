import { FiMail, FiPhone, FiShoppingBag, FiDollarSign, FiChevronRight } from 'react-icons/fi';
import { formatCurrency } from '../../utils/adminHelpers';

const CustomerCard = ({ customer, onView }) => {
  const initials = (() => {
    if (!customer.name) return '?';
    const parts = customer.name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  })();

  const gradientClass = (() => {
    const gradients = [
      'from-indigo-500 to-blue-600 shadow-indigo-100/50',
      'from-emerald-500 to-teal-600 shadow-emerald-100/50',
      'from-violet-500 to-purple-600 shadow-violet-100/50',
      'from-pink-500 to-rose-600 shadow-pink-100/50',
      'from-amber-500 to-orange-600 shadow-amber-100/50',
    ];
    let sum = 0;
    const name = customer.name || '';
    for (let i = 0; i < name.length; i++) {
      sum += name.charCodeAt(i);
    }
    return gradients[sum % gradients.length];
  })();

  return (
    <div 
      onClick={() => onView(customer)}
      className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm hover:shadow-lg hover:border-gray-200 transition-all duration-300 group cursor-pointer relative overflow-hidden flex flex-col justify-between min-h-[220px]"
    >
      {/* Top Header: Avatar & Info */}
      <div className="flex items-start gap-4">
        {/* Profile Initials Avatar */}
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-sm bg-gradient-to-br ${gradientClass} shadow-md flex-shrink-0`}>
          {initials}
        </div>

        {/* User text details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <h3 className="font-bold text-slate-800 text-base truncate group-hover:text-primary-600 transition-colors">
              {customer.name}
            </h3>
            <span className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${
              customer.status === 'active' ? 'bg-emerald-500 shadow-sm shadow-emerald-200' : 'bg-rose-500 shadow-sm shadow-rose-200'
            }`} title={customer.status === 'active' ? 'Active' : 'Inactive'} />
          </div>

          <p className="text-xs text-slate-400 font-semibold truncate flex items-center gap-1.5 mb-1">
            <FiMail className="flex-shrink-0 text-slate-400 text-xs" />
            {customer.email}
          </p>

          {customer.phone && (
            <p className="text-xs text-slate-400 font-bold font-mono truncate flex items-center gap-1.5">
              <FiPhone className="flex-shrink-0 text-slate-400 text-xs" />
              {customer.phone}
            </p>
          )}
        </div>
      </div>

      {/* Stats Section */}
      <div className="grid grid-cols-2 gap-4 py-4 my-4 border-t border-b border-slate-50 bg-slate-50/50 -mx-5 px-5">
        <div className="text-center sm:text-left">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center justify-center sm:justify-start gap-1 mb-0.5">
            <FiShoppingBag className="text-slate-400 text-[10px]" />
            Orders
          </span>
          <p className="text-base font-black text-slate-800 font-mono">
            {customer.orders || 0}
          </p>
        </div>
        <div className="text-center sm:text-left border-l border-slate-100 pl-4">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center justify-center sm:justify-start gap-1 mb-0.5">
            <FiDollarSign className="text-slate-400 text-[10px]" />
            Total Spent
          </span>
          <p className="text-base font-black text-slate-800 font-mono">
            {formatCurrency(customer.totalSpent || 0)}
          </p>
        </div>
      </div>

      {/* Action panel */}
      <div className="flex items-center justify-between text-xs font-bold text-slate-600 uppercase tracking-wider group-hover:text-primary-600 transition-colors pt-1">
        <span>View Details</span>
        <FiChevronRight className="text-base transform group-hover:translate-x-1 transition-transform" />
      </div>
    </div>
  );
};

export default CustomerCard;
