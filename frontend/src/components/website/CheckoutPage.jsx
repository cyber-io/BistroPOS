import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, MapPin, ShoppingBag, PackageCheck, Banknote } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';
import { api, uniqueKey } from '../../services/api';
import PaymentModal from '../common/PaymentModal';

const inputClass = 'w-full rounded-lg border border-[#E8D1CE] bg-white px-3.5 py-3 text-sm text-[#11164B] outline-none focus:border-[#11164B] focus:ring-1 focus:ring-[#11164B]';
function Field({ label, id, ...props }) { return <div><label htmlFor={id} className="mb-1.5 block text-xs font-medium text-[#11164B]">{label}</label><input id={id} className={inputClass} {...props} /></div>; }
export default function CheckoutPage({ source }) {
  const delivery = source === 'DELIVERY';
  const { items, subtotal, tax, deliveryFee, total, clearCart, setOrderSource } = useCart();
  const { currentUser } = useAuth();
  const { addToast } = useNotification();
  const navigate = useNavigate();
  const [showConfirm, setShowConfirm] = useState(false);
  const idempotencyKey = useRef(uniqueKey());
  const [form, setForm] = useState({ name: currentUser?.name || '', mobile: currentUser?.phone || '', address: '', landmark: '', pincode: '', instructions: '', pickupMinutes: '30' });
  useEffect(() => { setOrderSource(source); }, [source, setOrderSource]);
  useEffect(() => {
    if (currentUser) {
      setForm(prev => ({ ...prev, name: prev.name || currentUser.name || '', mobile: prev.mobile || currentUser.phone || '' }));
    }
  }, [currentUser]);
  const redirectPath = delivery ? '/delivery' : '/takeaway';
  const change = (field) => (event) => setForm(prev => ({ ...prev, [field]: event.target.value }));
  const submit = (event) => { event.preventDefault(); if (items.length) setShowConfirm(true); };
  const placeOrder = async (paymentDetails = { method: 'CASH' }) => {
    const pickup = new Date(Date.now() + Number(form.pickupMinutes) * 60000).toISOString();
    const method = paymentDetails?.method || 'CASH';
    const order = await api.createOrder({
      source, customerId: currentUser?.userId, customerName: form.name.trim(), customerPhone: form.mobile.trim(),
      deliveryAddress: delivery ? { name: form.name.trim(), mobile: form.mobile.trim(), address: form.address.trim(), landmark: form.landmark.trim(), pincode: form.pincode, deliveryInstructions: form.instructions } : null,
      takeawayPickupTime: delivery ? null : pickup,
      specialInstructions: form.instructions, paymentMethod: method, idempotencyKey: idempotencyKey.current, items
    });
    try {
      await api.initiatePayment({ orderId: order.orderId, amount: order.total, method, idempotencyKey: `pay-${order.orderId}` });
    } catch { /* The persisted order remains valid; payment is still due. */ }
    clearCart();
    addToast(`Order ${order.orderNumber} confirmed. Payment via ${method === 'CASH' ? (delivery ? 'Cash on Delivery' : 'Counter') : method}.`, 'success');
    navigate(`/track-order?orderId=${encodeURIComponent(order.orderId)}`);
  };
  const Icon = delivery ? MapPin : PackageCheck;
  return <main className="website-subpage mx-auto max-w-6xl space-y-8 bg-[#FAF1F0] px-4 py-10 text-[#11164B] sm:px-6 sm:py-14">
    <Link to="/menu" className="inline-flex items-center gap-2 text-xs text-[#75666B] hover:text-[#11164B]"><ArrowLeft size={14} />Back to the menu</Link>
    <div className="space-y-2"><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#A61920]">Good food, wherever you are</p><h1 className="font-serif text-4xl sm:text-5xl">{delivery ? 'Delivered to your door.' : 'Freshly made. Ready to go.'}</h1><p className="text-sm text-[#75666B]">{delivery ? 'Tell us where to bring your favourites.' : 'Choose a pickup time and we’ll get cooking.'}</p></div>
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      {!currentUser ? (
        <div className="space-y-5 rounded-2xl border border-[#E8D1CE] bg-white p-6 sm:p-10 text-center">
          <h2 className="font-serif text-2xl text-[#11164B]">Sign in or Sign up to place your order</h2>
          <p className="mx-auto max-w-md text-sm text-[#75666B]">
            New to Bistro &amp; Bloom? Create an account in seconds. Returning guest? Sign in to continue to checkout.
          </p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Link to={`/login?redirect=${encodeURIComponent(redirectPath)}`} className="btn-3d-crimson rounded-xl px-6 py-3 text-sm font-semibold text-white">
              Sign in (Existing user)
            </Link>
            <Link to={`/login?mode=register&redirect=${encodeURIComponent(redirectPath)}`} className="rounded-xl border border-[#11164B] px-6 py-3 text-sm font-semibold text-[#11164B] hover:bg-[#FAF1F0]">
              Sign up (New user)
            </Link>
          </div>
        </div>
      ) : (
      <form onSubmit={submit} className="space-y-6 rounded-2xl border border-[#E8D1CE] bg-white p-5 sm:p-8">
        <div className="flex items-center gap-2 border-b border-[#E8D1CE] pb-4 text-sm font-semibold"><Icon size={19} className="text-[#A61920]" />{delivery ? 'Delivery details' : 'Pickup details'}</div>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Your name" id="checkout-name" required minLength={2} maxLength={100} autoComplete="name" value={form.name} onChange={change('name')} placeholder="Full name" /><Field label="Mobile number" id="checkout-phone" type="tel" required pattern="[+0-9 ()-]{10,20}" maxLength={20} autoComplete="tel" value={form.mobile} onChange={change('mobile')} placeholder="+91 98765 43210" /></div>
        {delivery ? <><Field label="Street address & apartment" id="checkout-address" required minLength={8} maxLength={300} autoComplete="street-address" value={form.address} onChange={change('address')} placeholder="House / flat number, building, street" /><div className="grid gap-4 sm:grid-cols-2"><Field label="Landmark (optional)" id="checkout-landmark" maxLength={150} value={form.landmark} onChange={change('landmark')} placeholder="Near…" /><Field label="Pincode" id="checkout-pincode" required inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="postal-code" value={form.pincode} onChange={change('pincode')} placeholder="122002" /></div></> : <div><label htmlFor="pickup-time" className="mb-1.5 block text-xs font-medium">Preferred pickup time</label><select id="pickup-time" className={inputClass} value={form.pickupMinutes} onChange={change('pickupMinutes')}>{[20,30,45,60].map(n=><option value={n} key={n}>In {n} minutes</option>)}</select><p className="mt-2 text-xs text-[#75666B]">We’ll update your order when it is ready to collect.</p></div>}
        <div><label htmlFor="checkout-instructions" className="mb-1.5 block text-xs font-medium">{delivery ? 'Delivery instructions (optional)' : 'Packaging notes (optional)'}</label><textarea id="checkout-instructions" rows={3} maxLength={500} value={form.instructions} onChange={change('instructions')} className={inputClass} placeholder={delivery ? 'Gate code, directions, or how to find you…' : 'Anything our kitchen should know…'} /></div>
        <p className="flex items-center gap-2 rounded-lg bg-[#FAF1F0] p-3 text-xs text-[#75666B]"><Banknote size={17} />{delivery ? 'Pay when your order arrives.' : 'Pay at the counter when you collect.'}</p>
        <button disabled={!items.length} type="submit" className="btn-3d-crimson flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-semibold text-white disabled:opacity-40">Review & place order<ArrowRight size={16} /></button>
      </form>
      )}
      <aside className="h-fit space-y-5 rounded-2xl border border-[#E8D1CE] bg-white p-6 lg:sticky lg:top-24">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><ShoppingBag size={17} />Your order</h2>
        {!items.length ? <div className="space-y-3 py-8 text-center"><p className="text-sm text-[#75666B]">Your basket is waiting for something good.</p><Link to="/menu" className="inline-block rounded-lg border border-[#a61920] text-[#a61920] hover:bg-red-50 px-4 py-2 text-xs font-semibold">Explore the menu</Link></div> : <><div className="space-y-4">{items.map(item=><div key={item.itemKey} className="flex gap-3"><img src={item.image} alt="" className="h-14 w-14 rounded-lg object-cover" /><div className="min-w-0 flex-1"><p className="text-xs font-semibold">{item.name}</p><p className="mt-1 text-[11px] text-[#75666B]">{item.quantity} × ₹{Number(item.price).toFixed(2)}</p>{item.specialInstruction && <p className="mt-1 text-[10px] text-[#75666B]">{item.specialInstruction}</p>}</div><strong className="text-xs">₹{item.lineTotal.toFixed(2)}</strong></div>)}</div><div className="space-y-2 border-t border-[#E8D1CE] pt-4 text-xs text-[#75666B]"><div className="flex justify-between"><span>Subtotal</span><span>₹{subtotal.toFixed(2)}</span></div><div className="flex justify-between"><span>GST (5%)</span><span>₹{tax.toFixed(2)}</span></div>{delivery && <div className="flex justify-between"><span>Delivery</span><span>₹{deliveryFee.toFixed(2)}</span></div>}<div className="flex justify-between border-t border-[#E8D1CE] pt-3 text-lg font-semibold text-[#11164B]"><span>Estimated total</span><span>₹{total.toFixed(2)}</span></div></div></>}
      </aside>
    </div>
    <PaymentModal isOpen={showConfirm} onClose={() => setShowConfirm(false)} amount={total} orderSource={source} onPaymentSuccess={placeOrder} />
  </main>;
}
