import React, { useEffect, useRef } from 'react';
import { X, ClipboardList, LoaderCircle } from 'lucide-react';
export const money = n => new Intl.NumberFormat('en-IN', {style:'currency',currency:'INR',maximumFractionDigits:2}).format(Number(n || 0));
export const time = date => new Date(date).toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit'});
export const label = value => String(value || '').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, c=>c.toUpperCase());
export function Badge({ status, children }) { return <span className={`pos-badge status-${String(status).toLowerCase()}`}><i/>{children || label(status)}</span>; }
export function Empty({ icon: Icon = ClipboardList, title = 'No orders found', children }) { return <div className="pos-empty"><span><Icon size={29} strokeWidth={1.4}/></span><h3>{title}</h3><p>{children}</p></div>; }
export function Spinner() { return <div className="pos-loading" role="status"><LoaderCircle className="pos-spin" size={24}/><span>Loading your workspace…</span></div>; }
export function Modal({title, children, onClose, wide = false, className = ''}) {
  const ref = useRef();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    try {
      if (typeof dialog.showModal === 'function' && !dialog.open) {
        dialog.showModal();
      }
    } catch (e) {
      console.warn('Modal showModal error:', e);
    }
    const handler = e => {
      e.preventDefault();
      onClose();
    };
    dialog.addEventListener('cancel', handler);
    return () => {
      dialog.removeEventListener('cancel', handler);
      try {
        if (dialog.open && typeof dialog.close === 'function') {
          dialog.close();
        }
      } catch (e) {
        console.warn('Modal close error:', e);
      }
    };
  }, [onClose]);
  return (
    <dialog
      ref={ref}
      className={`pos-modal ${wide ? 'pos-modal-wide' : ''} ${className}`}
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="pos-modal-inner">
        <header>
          <h2>{title}</h2>
          <button className="pos-icon-button" onClick={onClose} aria-label="Close dialog">
            <X size={18} />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
