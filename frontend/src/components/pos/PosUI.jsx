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
        <header style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 24px',
          background: 'var(--p-card)',
          borderBottom: '1px solid var(--p-border)',
          position: 'sticky',
          top: 0,
          zIndex: 10
        }}>
          <h2 style={{ fontSize: '15px', fontWeight: 700, margin: 0, lineHeight: 1, color: 'var(--p-text)' }}>{title}</h2>
          <button
            type="button"
            className="pos-icon-button"
            onClick={onClose}
            aria-label="Close dialog"
            style={{
              width: 32,
              height: 32,
              padding: 0,
              margin: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 8,
              border: '1px solid var(--p-border)',
              background: 'var(--p-card)',
              color: 'var(--p-text)',
              cursor: 'pointer',
              flexShrink: 0
            }}
          >
            <X size={16} />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
