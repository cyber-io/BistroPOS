import React, { useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';
import { tableTitle } from '../../services/tablePresentation';
import { useNotification } from '../../context/NotificationContext';
import { CheckCircle2, AlertTriangle, Clock, X } from 'lucide-react';

export default function OrderReceiptModal({ isOpen, onClose, order, onConfirmed }) {
  const { addToast } = useNotification();
  const [remaining, setRemaining] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fallbackDeadlines = useRef(new Map());
  const processingTimeout = useRef(false);
  const callbacks = useRef({ onClose, onConfirmed, addToast });
  callbacks.current = { onClose, onConfirmed, addToast };
  useEffect(() => {
    if (!isOpen || !order) return;
    setError('');
    const serverStart = Date.parse(order.confirmationRequestedAt || '');
    if (!fallbackDeadlines.current.has(order.orderId)) fallbackDeadlines.current.set(order.orderId, Date.now() + 300000);
    const deadline = Number.isFinite(serverStart) ? serverStart + 300000 : fallbackDeadlines.current.get(order.orderId);
    let active = true;
    const timeout = async () => {
      if (processingTimeout.current) return;
      processingTimeout.current = true;
      try {
        // The API checks the actual five-minute deadline. The browser countdown
        // alone never changes a persisted status or creates an issue.
        await api.updateOrderStatus(order.orderId, 'CONFIRMATION_TIMEOUT');
        if (active) {
          callbacks.current.addToast('The confirmation window has closed. Our front desk will check your order.', 'warning');
          callbacks.current.onClose();
        }
      } catch (err) { if (active) setError(err.message || 'Unable to refresh this confirmation. Please try again.'); }
      finally { processingTimeout.current = false; }
    };
    let timer;
    const tick = () => {
      const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemaining(seconds);
      if (!seconds) { clearInterval(timer); timeout(); }
    };
    timer = setInterval(tick, 1000); tick();
    const escape = event => { if (event.key === 'Escape') callbacks.current.onClose(); };
    window.addEventListener('keydown', escape);
    return () => { active = false; clearInterval(timer); window.removeEventListener('keydown', escape); };
  }, [isOpen, order?.orderId, order?.confirmationRequestedAt]);
  const confirm = async received => {
    if (!order || busy || !remaining) return;
    setBusy(true); setError('');
    try {
      await api.confirmCustomerReceipt(order.orderId, received);
      addToast(received ? 'Thank you for confirming. Enjoy your meal!' : 'Our front desk has been notified and will check your order.', received ? 'success' : 'warning');
      onConfirmed?.(received); onClose();
    } catch (err) { setError(err.message || 'Unable to save your response. Please try again.'); }
    finally { setBusy(false); }
  };
  if (!isOpen || !order) return null;
  return <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
    <section role="dialog" aria-modal="true" aria-labelledby="receipt-title" className="bg-white rounded-2xl max-w-md w-full p-6 sm:p-8 shadow-2xl relative border border-slate-100 text-center">
      <button aria-label="Close confirmation" onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-1 rounded-full"><X size={19} /></button>
      <div className="w-14 h-14 bg-blue-50 text-[#4779f5] rounded-2xl flex items-center justify-center mx-auto mb-5"><CheckCircle2 size={29} /></div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#4779f5] mb-3">A quick check before you enjoy</p>
      <h2 id="receipt-title" className="text-xl font-semibold tracking-tight text-slate-900 mb-2">Has your complete order arrived?</h2>
      <p className="text-xs text-slate-500 mb-5">{order.orderNumber} · {tableTitle(order)}</p>
      <div className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-50 text-slate-500 text-[11px] mb-6"><Clock size={13} /><span>{remaining ? `Confirmation closes in ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}` : 'Confirmation window closed'}</span></div>
      {error && <p role="alert" className="mb-5 rounded-lg bg-red-50 border border-red-100 p-3 text-xs text-red-700 leading-relaxed">{error}</p>}
      <div className="grid grid-cols-2 gap-3"><button onClick={() => confirm(false)} disabled={busy || !remaining} className="flex items-center justify-center gap-2 py-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs disabled:opacity-50"><AlertTriangle size={15} />No, not yet</button><button onClick={() => confirm(true)} disabled={busy || !remaining} autoFocus className="flex items-center justify-center gap-2 py-3 rounded-lg bg-[#4779f5] hover:bg-[#3667df] text-white font-semibold text-xs disabled:opacity-50"><CheckCircle2 size={15} />{busy ? 'Saving…' : 'Yes, everything'}</button></div>
      <p className="text-[10px] text-slate-400 mt-5 leading-relaxed">Something missing? Choose “No, not yet” and our team will help.</p>
    </section>
  </div>;
}
