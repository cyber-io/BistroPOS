import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, subscribeRealtimeEvents } from '../../services/api';
import { ArrowLeft, Search, CheckCircle2, Clock, AlertCircle, RefreshCw, Banknote } from 'lucide-react';

const DELIVERY = [['NEW','Order placed'],['ACCEPTED','Accepted'],['PREPARING','Preparing'],['READY','Ready'],['OUT_FOR_DELIVERY','On the way'],['DELIVERED','Delivered']];
const TAKEAWAY = [['NEW','Order placed'],['ACCEPTED','Accepted'],['PREPARING','Preparing'],['READY_FOR_PICKUP','Ready to collect'],['PICKED_UP','Collected']];
const DINEIN = [['NEW','Order placed'],['ACCEPTED','Accepted'],['PREPARING','Preparing'],['READY','Ready'],['PENDING_CONFIRMATION','Served'],['DELIVERED','Complete']];
export default function TrackOrderPage() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get('orderId') || '');
  const [activeQuery, setActiveQuery] = useState(params.get('orderId') || '');
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fetchOrder = useCallback(async (value, silent = false) => {
    if (!value.trim()) return;
    if (!silent) { setLoading(true); setError(''); }
    try {
      const found = await api.getOrderById(value.trim());
      setOrder(found);
      setError(found ? '' : 'We couldn’t find this order. Check the order number on your confirmation.');
    } catch (err) { if (!silent) { setOrder(null); setError(err.message || 'Unable to load your order. Please try again.'); } }
    finally { if (!silent) setLoading(false); }
  }, []);
  useEffect(() => { if (activeQuery) fetchOrder(activeQuery); }, [activeQuery, fetchOrder]);
  useEffect(() => {
    if (!activeQuery) return;
    const timer = setInterval(() => fetchOrder(activeQuery, true), 30000);
    const unsub = subscribeRealtimeEvents((type, payload) => {
      if (type === 'ORDER_STATUS_CHANGED' && payload.orderId === order?.orderId) fetchOrder(activeQuery, true);
    });
    return () => { clearInterval(timer); unsub(); };
  }, [activeQuery, order?.orderId, fetchOrder]);
  const track = (event) => { event.preventDefault(); if (!query.trim()) return; setParams({ orderId: query.trim() }); if (query.trim() === activeQuery) fetchOrder(query.trim()); else setActiveQuery(query.trim()); };
  const steps = order?.source === 'TAKEAWAY' ? TAKEAWAY : order?.source === 'DINE_IN_QR' ? DINEIN : DELIVERY;
  const currentStep = steps.findIndex(([key]) => key === order?.status);
  const cancelled = order?.status === 'CANCELLED';
  return <main className="website-subpage mx-auto min-h-[80vh] max-w-4xl space-y-8 px-4 py-12 text-[#11164B] sm:px-6">
    <Link to="/menu" className="inline-flex items-center gap-2 text-xs text-[#75666B]"><ArrowLeft size={14} />Back to the menu</Link>
    <div className="space-y-3 text-center"><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#A61920]">From our kitchen to you</p><h1 className="font-serif text-4xl sm:text-5xl">A little closer to delicious.</h1><p className="text-sm text-[#75666B]">Follow your order as our team prepares it.</p></div>
    <form onSubmit={track} className="flex gap-2 rounded-xl border border-[#E8D1CE] bg-white p-2.5"><label htmlFor="track-order" className="sr-only">Order number</label><Search size={19} className="my-3 ml-2 shrink-0 text-[#75666B]" /><input id="track-order" required value={query} onChange={e => setQuery(e.target.value)} placeholder="Enter your order number" className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none" /><button disabled={loading} className="btn-3d-crimson rounded-xl px-5 text-xs font-semibold text-white disabled:opacity-50">{loading ? 'Checking…' : 'Track order'}</button></form>
    {error && <div role="alert" className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900"><AlertCircle size={19} className="shrink-0" /><p>{error}</p></div>}
    {!activeQuery && <div className="rounded-2xl border border-[#E8D1CE] bg-white p-12 text-center"><Clock size={35} className="mx-auto mb-4 text-[#A61920]" /><h2 className="font-serif text-2xl">Let’s find your order.</h2><p className="mt-2 text-sm text-[#75666B]">Use the order number from your confirmation. Sign in to track orders placed with your account.</p></div>}
    {order && <section className="space-y-7 rounded-2xl border border-[#E8D1CE] bg-white p-5 sm:p-8" aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#E8D1CE] pb-5"><div><p className="text-[10px] font-semibold uppercase tracking-wider text-[#A61920]">{order.source.replaceAll('_',' ')}</p><h2 className="mt-1 font-serif text-2xl">{order.orderNumber}</h2><p className="mt-1 text-xs text-[#75666B]">Placed {new Date(order.createdAt).toLocaleString('en-IN', { dateStyle:'medium', timeStyle:'short' })}</p></div><button onClick={() => fetchOrder(activeQuery)} className="flex items-center gap-1.5 rounded-lg border border-[#E8D1CE] px-3 py-2 text-xs"><RefreshCw size={13} />Refresh</button></div>
      {cancelled ? <div className="rounded-xl bg-red-50 p-4 text-sm text-red-800"><strong>Order cancelled</strong><p className="mt-1 text-xs">{order.rejectionReason || order.cancellationReason || 'Please contact the restaurant for help.'}</p></div> : <ol className={`grid gap-2 sm:grid-cols-${steps.length === 5 ? '5' : '6'}`} style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))' }}>{steps.map(([key,label],i)=><li key={key} className={`rounded-xl border px-2 py-4 text-center ${i === currentStep ? 'border-[#a61920] bg-[#a61920] text-white' : i < currentStep ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-[#E8D1CE] bg-[#FAF1F0] text-[#75666B]'}`}><span className="mx-auto mb-2 flex h-6 w-6 items-center justify-center text-xs">{i < currentStep ? <CheckCircle2 size={19} /> : i+1}</span><p className="text-[11px] font-medium">{label}</p></li>)}</ol>}
      <div className="space-y-3">{(order.items || []).map((item,i)=><div key={item.orderItemId || i} className="flex justify-between gap-4 text-sm"><span><strong className="mr-2 text-[#75666B]">{item.quantity}×</strong>{item.name || item.itemName}</span><span>₹{Number(item.lineTotal ?? item.price * item.quantity).toFixed(2)}</span></div>)}</div>
      <div className="flex items-end justify-between border-t border-[#E8D1CE] pt-4"><div className="flex items-center gap-1.5 text-xs text-[#75666B]"><Banknote size={15} />{cancelled ? 'Contact the restaurant for payment queries' : order.paymentStatus === 'PAID' ? 'Payment received' : order.paymentStatus === 'PARTIAL' ? `Part paid · ₹${Math.max(0, Number(order.total) - Number(order.paidAmount || 0)).toFixed(2)} due` : order.source === 'DINE_IN_QR' ? 'Payment due at the restaurant' : order.source === 'DELIVERY' ? 'Payment due on delivery' : 'Payment due at collection'}</div><strong className="text-xl">₹{Number(order.total).toFixed(2)}</strong></div>
    </section>}
  </main>;
}
