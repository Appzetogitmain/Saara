import fs from 'fs';

const filePath = 'frontend/src/modules/UserApp/components/Mobile/MobileOrderCard.jsx';
let content = fs.readFileSync(filePath, 'utf8');

// Normalize newlines to LF for safe replacement
let normalized = content.replace(/\r\n/g, '\n');

const searchBlock = `        {/* Footer Bar: Status & Action Link */}
        <div className="flex items-center justify-between pt-4 mt-4 border-t border-gray-50">
          <span className={\`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider \${getStatusColor(order.status)}\`}>
            {order.status || 'Pending'}
          </span>
          <div className="flex items-center gap-1 text-xs text-slate-600 font-bold hover:text-slate-900 transition-colors">
            <span>View Details</span>
            <FiChevronRight className="text-base" />
          </div>
        </div>`;

const replaceBlock = `        {/* Footer Bar: Status & Action Link */}
        <div className="flex items-center justify-between pt-4 mt-4 border-t border-gray-50 flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={\`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider \${getStatusColor(order.status)}\`}>
              {order.status || 'Pending'}
            </span>
            {(() => {
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
          <div className="flex items-center gap-1 text-xs text-slate-600 font-bold hover:text-slate-900 transition-colors">
            <span>View Details</span>
            <FiChevronRight className="text-base" />
          </div>
        </div>`;

if (!normalized.includes(searchBlock)) {
    console.error("Target search block not found in MobileOrderCard.jsx!");
    process.exit(1);
}

normalized = normalized.replace(searchBlock, replaceBlock);

// Restore CRLF line endings
const finalContent = normalized.replace(/\n/g, '\r\n');
fs.writeFileSync(filePath, finalContent, 'utf8');
console.log("Successfully patched MobileOrderCard.jsx!");
