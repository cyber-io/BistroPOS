import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { ShoppingBag, Plus, Minus, Trash2, X, ArrowRight, Tag } from 'lucide-react';

export default function CartDrawer({ isOpen, onClose, onCheckout }) {
  const { items, updateQuantity, removeItem, clearCart, subtotal, tax, deliveryFee, total, orderSource, setOrderSource } = useCart();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-fade-in">
      <div role="dialog" aria-modal="true" aria-label="Shopping cart" className="bg-white w-full max-w-md h-full flex flex-col shadow-2xl animate-slide-left">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center space-x-2">
            <ShoppingBag className="w-5 h-5 text-brand-600" />
            <h3 className="font-bold text-slate-900">Your Cart ({items.reduce((sum, item) => sum + item.quantity, 0)})</h3>
          </div>
          <div className="flex items-center space-x-2">
            {items.length > 0 && (
              <button
                onClick={clearCart}
                className="text-xs text-red-600 hover:text-red-700 font-semibold px-2 py-1 rounded"
              >
                Clear
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Close cart"
              className="p-1 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-200"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Items List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
              <ShoppingBag className="w-16 h-16 text-slate-300 mb-3 stroke-[1.5]" />
              <h4 className="text-base font-bold text-slate-700 mb-1">Your cart is empty</h4>
              <p className="text-xs text-slate-500 max-w-xs">
                Explore our mouth-watering woodfired pizzas, juicy burgers, and authentic curries!
              </p>
            </div>
          ) : (
            items.map((item) => (
              <div
                key={item.itemKey}
                className="p-3 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col space-y-2 hover:border-slate-300 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-2.5">
                    <span className={`inline-block w-3.5 h-3.5 rounded-sm border mt-1 flex-shrink-0 flex items-center justify-center ${
                      item.vegNonveg === 'VEG' ? 'border-emerald-600' : 'border-rose-600'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        item.vegNonveg === 'VEG' ? 'bg-emerald-600' : 'bg-rose-600'
                      }`} />
                    </span>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 leading-tight">{item.name}</h4>
                      <p className="text-xs font-bold text-brand-600 mt-0.5">₹{item.price}</p>
                    </div>
                  </div>

                  <button
                    onClick={() => removeItem(item.itemKey)}
                    className="text-slate-400 hover:text-red-500 p-1"
                    title="Remove item"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Customization Details */}
                {(item.customization && Object.keys(item.customization).length > 0) || (item.addOns && item.addOns.length > 0) || item.specialInstruction ? (
                  <div className="text-[11px] bg-white p-2 rounded-lg border border-slate-100 text-slate-500 space-y-0.5">
                    {item.customization && Object.entries(item.customization).map(([k, v]) => (
                      <p key={k}><strong className="text-slate-700">{k}:</strong> {v}</p>
                    ))}
                    {item.addOns && item.addOns.length > 0 && (
                      <p><strong className="text-slate-700">Add-ons:</strong> {item.addOns.map(a => a.name).join(', ')}</p>
                    )}
                    {item.specialInstruction && (
                      <p className="italic text-slate-600">"{item.specialInstruction}"</p>
                    )}
                  </div>
                ) : null}

                {/* Quantity Controls & Line Total */}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center border border-slate-300 rounded-lg bg-white overflow-hidden">
                    <button
                      aria-label={`Decrease quantity of ${item.name}`}
                      onClick={() => updateQuantity(item.itemKey, -1)}
                      className="px-2 py-1 text-slate-600 hover:bg-slate-100"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="px-3 text-xs font-bold text-slate-800">{item.quantity}</span>
                    <button
                      aria-label={`Increase quantity of ${item.name}`}
                      onClick={() => updateQuantity(item.itemKey, 1)}
                      className="px-2 py-1 text-slate-600 hover:bg-slate-100"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  <span className="text-xs font-black text-slate-900">
                    ₹{item.lineTotal.toFixed(2)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer Summary */}
        {items.length > 0 && (
          <div className="p-4 border-t border-slate-200 bg-slate-50 space-y-3">
            {orderSource !== 'DINE_IN_QR' && <div className="grid grid-cols-2 gap-2" aria-label="Choose order type">
              {[['DELIVERY','Delivery'],['TAKEAWAY','Takeaway']].map(([value,label]) => <button key={value} onClick={() => setOrderSource(value)} className={`rounded-lg border px-3 py-2.5 text-xs font-semibold ${orderSource === value ? 'border-[#162821] bg-[#162821] text-white' : 'border-slate-200 bg-white text-slate-600'}`}>{label}</button>)}
            </div>}

            {/* Price Breakdown */}
            <div className="text-xs space-y-1 text-slate-600 pt-1">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>₹{subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>GST (5%)</span>
                <span>₹{tax.toFixed(2)}</span>
              </div>
              {orderSource === 'DELIVERY' && (
                <div className="flex justify-between">
                  <span>Delivery Fee</span>
                  <span>₹{deliveryFee.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-black text-slate-900 pt-2 border-t border-slate-200">
                <span>Total Amount</span>
                <span>₹{total.toFixed(2)}</span>
              </div>
            </div>

            {/* Checkout Action */}
            <button
              onClick={() => {
                onClose();
                if (onCheckout) {
                  onCheckout();
                } else if (orderSource === 'DELIVERY') {
                  navigate('/delivery');
                } else if (orderSource === 'TAKEAWAY') {
                  navigate('/takeaway');
                } else {
                  navigate('/dine-in');
                }
              }}
              className="website-cart-cta w-full py-3.5 px-4 rounded-xl text-white font-extrabold text-sm flex items-center justify-center space-x-2"
            >
              <span>Proceed to Place Order</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
