import { FiShoppingBag, FiTrash2 } from "react-icons/fi";
import { formatPrice } from "../../../../shared/utils/helpers";
import { formatVariantLabel, getVariantSignature } from "../../../../shared/utils/variant";
import { useCartStore } from "../../../../shared/store/useStore";

const OrderSummary = ({ itemsByVendor, total, discount, shipping, tax, finalTotal, walletAmountUsed = 0, remainingPayable = finalTotal }) => {
  const removeItem = useCartStore((state) => state.removeItem);

  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm">
      <h3 className="text-base font-extrabold text-gray-900 mb-4">Order Summary</h3>
      <div className="space-y-3 mb-4">
        {itemsByVendor.map((vendorGroup) => (
          <div key={vendorGroup.vendorId} className="space-y-2 mb-4">
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-xl border border-slate-200/60 shadow-sm">
              <div className="w-5 h-5 rounded-full bg-primary-600 flex items-center justify-center flex-shrink-0">
                <FiShoppingBag className="text-white text-[10px]" />
              </div>
              <span className="text-sm font-bold text-gray-900 flex-1">{vendorGroup.vendorName}</span>
              <span className="text-xs font-extrabold text-primary-700 bg-white px-2 py-0.5 rounded-md border border-slate-100">
                {formatPrice(vendorGroup.subtotal)}
              </span>
            </div>
            <div className="space-y-2 pl-2">
              {vendorGroup.items.map((item, itemIndex) => (
                <div
                  key={`${item.id}-${itemIndex}-${getVariantSignature(item?.variant || {})}`}
                  className="flex items-center gap-2.5 text-xs py-1"
                >
                  <img src={item.image} alt={item.name} className="w-10 h-10 rounded-lg object-contain bg-slate-50 border border-slate-100 p-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 truncate text-xs">{item.name}</p>
                    <p className="text-slate-500 font-medium text-xs">
                      {formatPrice(item.price)} × {item.quantity}
                    </p>
                    {formatVariantLabel(item?.variant) && (
                      <p className="text-[11px] text-slate-400 font-medium">{formatVariantLabel(item?.variant)}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(item.id, item.variant)}
                    className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors flex-shrink-0"
                    title="Remove item"
                  >
                    <FiTrash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-2 text-sm pt-2 border-t border-slate-100">
        <div className="flex justify-between text-slate-600 font-medium">
          <span>Subtotal</span>
          <span className="font-bold text-gray-900">{formatPrice(total)}</span>
        </div>
        {discount > 0 && (
          <div className="flex justify-between text-emerald-600 font-bold">
            <span>Discount</span>
            <span>-{formatPrice(discount)}</span>
          </div>
        )}
        <div className="flex justify-between text-slate-600 font-medium">
          <span>Shipping</span>
          <span>
            {shipping === 0 ? <span className="text-emerald-600 bg-emerald-50 border border-emerald-200/60 font-extrabold px-2 py-0.5 rounded text-xs">FREE</span> : formatPrice(shipping)}
          </span>
        </div>
        <div className="flex justify-between text-slate-600 font-medium">
          <span>Tax</span>
          <span className="font-bold text-gray-900">{formatPrice(tax)}</span>
        </div>
        <div className="flex justify-between text-xl font-black text-gray-900 pt-3 border-t border-slate-200">
          <span>Total</span>
          <span className="text-primary-700">{formatPrice(finalTotal)}</span>
        </div>
        {walletAmountUsed > 0 && (
          <>
            <div className="flex justify-between text-primary-600 font-bold">
              <span>Wallet Applied</span>
              <span>-{formatPrice(walletAmountUsed)}</span>
            </div>
            <div className="flex justify-between text-xl font-black text-gray-900 pt-2 border-t border-dashed border-slate-200">
              <span>Payable Amount</span>
              <span className="text-primary-700">{formatPrice(remainingPayable)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default OrderSummary;

