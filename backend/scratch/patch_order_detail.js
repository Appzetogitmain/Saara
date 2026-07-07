import fs from 'fs';

const filePath = 'frontend/src/modules/UserApp/pages/OrderDetail.jsx';
let content = fs.readFileSync(filePath, 'utf8');

// Normalize newlines to LF for safe replacement
let normalized = content.replace(/\r\n/g, '\n');

// 1. Insert helper function after allOrderItems useMemo block
const searchMemo = `  const shippingAddress = order?.shippingAddress || {};
  const orderItems = Array.isArray(order?.items) ? order.items : [];`;

const replaceMemo = `  const getItemReturnStatus = (item) => {
    if (!Array.isArray(order?.returnRequests)) return null;
    for (const ret of order.returnRequests) {
      if (Array.isArray(ret.items)) {
        const match = ret.items.find(retItem => {
          const itemProdId = String(item.productId || item.id || '');
          const retProdId = String(retItem.productId || retItem.id || '');
          if (itemProdId !== retProdId) return false;
          if (item.variant && retItem.variant) {
            return getVariantSignature(item.variant) === getVariantSignature(retItem.variant);
          }
          return true;
        });
        if (match) {
          return {
            status: ret.status,
            requestType: ret.requestType
          };
        }
      }
    }
    return null;
  };

  const shippingAddress = order?.shippingAddress || {};
  const orderItems = Array.isArray(order?.items) ? order.items : [];`;

if (!normalized.includes(searchMemo)) {
    console.error("Target searchMemo block not found in OrderDetail.jsx!");
    process.exit(1);
}
normalized = normalized.replace(searchMemo, replaceMemo);

// 2. Insert item return status badge in Loop 1 (vendor items group)
const searchLoop1 = `                              <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-gray-800 text-sm mb-1">{item.name}</h3>
                                <p className="text-xs text-gray-600">
                                  {formatPrice(item.price)} x {item.quantity}
                                </p>
                                {formatVariantLabel(item?.variant) && (
                                  <p className="text-[11px] text-gray-500">
                                    {formatVariantLabel(item?.variant)}
                                  </p>
                                )}
                              </div>`;

const replaceLoop1 = `                              <div className="flex-1 min-w-0">
                                <h3 className="font-semibold text-gray-800 text-sm mb-1">{item.name}</h3>
                                <p className="text-xs text-gray-600">
                                  {formatPrice(item.price)} x {item.quantity}
                                </p>
                                {formatVariantLabel(item?.variant) && (
                                  <p className="text-[11px] text-gray-500">
                                    {formatVariantLabel(item?.variant)}
                                  </p>
                                )}
                                {(() => {
                                  const ret = getItemReturnStatus(item);
                                  if (!ret) return null;
                                  if (ret.status === 'completed') {
                                    return (
                                      <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 text-[9px] font-bold uppercase tracking-wider border border-rose-100">
                                        {ret.requestType === 'exchange' ? 'Exchanged' : 'Returned'}
                                      </span>
                                    );
                                  } else if (ret.status !== 'rejected') {
                                    return (
                                      <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-amber-55/10 text-amber-600 text-[9px] font-bold uppercase tracking-wider border border-amber-100 font-semibold">
                                        Return Pending
                                      </span>
                                    );
                                  }
                                  return null;
                                })()}
                              </div>`;

if (!normalized.includes(searchLoop1)) {
    console.error("Target searchLoop1 block not found in OrderDetail.jsx!");
    process.exit(1);
}
normalized = normalized.replace(searchLoop1, replaceLoop1);

// 3. Insert item return status badge in Loop 2 (non-grouped items list)
const searchLoop2 = `                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-800 text-sm mb-1">{item.name}</h3>
                          <p className="text-xs text-gray-600">
                            {formatPrice(item.price)} x {item.quantity}
                          </p>
                          {formatVariantLabel(item?.variant) && (
                                  <p className="text-[11px] text-gray-500">
                                    {formatVariantLabel(item?.variant)}
                                  </p>
                                )}
                        </div>`;

const replaceLoop2 = `                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-800 text-sm mb-1">{item.name}</h3>
                          <p className="text-xs text-gray-600">
                            {formatPrice(item.price)} x {item.quantity}
                          </p>
                          {formatVariantLabel(item?.variant) && (
                                  <p className="text-[11px] text-gray-500">
                                    {formatVariantLabel(item?.variant)}
                                  </p>
                                )}
                          {(() => {
                            const ret = getItemReturnStatus(item);
                            if (!ret) return null;
                            if (ret.status === 'completed') {
                              return (
                                <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 text-[9px] font-bold uppercase tracking-wider border border-rose-100">
                                  {ret.requestType === 'exchange' ? 'Exchanged' : 'Returned'}
                                </span>
                              );
                            } else if (ret.status !== 'rejected') {
                              return (
                                <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-amber-55/10 text-amber-600 text-[9px] font-bold uppercase tracking-wider border border-amber-100 font-semibold">
                                  Return Pending
                                </span>
                              );
                            }
                            return null;
                          })()}
                        </div>`;

if (!normalized.includes(searchLoop2)) {
    console.error("Target searchLoop2 block not found in OrderDetail.jsx!");
    process.exit(1);
}
normalized = normalized.replace(searchLoop2, replaceLoop2);

// Restore CRLF line endings
const finalContent = normalized.replace(/\n/g, '\r\n');
fs.writeFileSync(filePath, finalContent, 'utf8');
console.log("Successfully patched OrderDetail.jsx!");
