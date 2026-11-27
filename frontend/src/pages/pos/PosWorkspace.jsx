import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Plus, Search, RefreshCw, ArrowUpRight, CreditCard, Banknote, Timer, Check, ClipboardCheck, ClipboardList, Package, Armchair, CalendarDays, History, LayoutGrid, Info, AlertCircle, Bell, SlidersHorizontal, UtensilsCrossed, ShoppingBag, Truck, Minus, Trash2, Printer, QrCode, ArrowLeft, CheckCircle2, X, Users, HandPlatter, Coffee, MapPin, Download, Upload, Sparkles, ChevronLeft, ChevronRight, Calendar, ChevronDown, ChevronUp, Clock, Phone, User, UserPlus, ShieldCheck, FolderPlus, Pencil, Building2, Lock, Mail, Eye, EyeOff, ChefHat, UserCheck, Flame, KeyRound } from 'lucide-react';
import QRCode from 'qrcode';
import { api, subscribeRealtimeEvents, uniqueKey, getActiveRestaurantId, setActiveRestaurantId } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';
import PosShell from '../../components/pos/PosShell';
import TableFloorPlan, { FloorPlanTable, getDiningAreaTables } from '../../components/pos/TableFloorPlan';
import { Badge, Empty, Spinner, Modal, money, time, label } from '../../components/pos/PosUI';
import ErrorBoundary from '../../components/common/ErrorBoundary';
import { getPublicOrigin, getTableQrUrl, tableLabel, tableTitle } from '../../services/tablePresentation';
import { cleanPhone, getRescheduleNotificationText, getWhatsAppUrl, getSmsUrl, getCancelWhatsAppUrl, getCancelSmsUrl } from '../../services/notificationHelpers';

const DONE = ['DELIVERED', 'PICKED_UP', 'CANCELLED', 'CONFIRMATION_TIMEOUT'];
const SOURCES = { DINE_IN_QR: 'Dine in', TAKEAWAY: 'Takeaway', DELIVERY: 'Delivery' };
const today = () => new Date().toLocaleDateString('en-CA');
const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toLocaleDateString('en-CA'); };
const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toLocaleDateString('en-CA'); };
const shiftDate = (dateStr, days) => {
  const base = dateStr ? new Date(`${dateStr}T12:00:00`) : new Date();
  base.setDate(base.getDate() + days);
  return base.toLocaleDateString('en-CA');
};
const toLocalDate = (dateVal) => {
  if (!dateVal) return '';
  if (typeof dateVal === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateVal)) return dateVal;
  try {
    return new Date(dateVal).toLocaleDateString('en-CA');
  } catch {
    return String(dateVal).slice(0, 10);
  }
};
const clockValue = value => { const match = String(value || '').match(/^(\d{1,2}):(\d{2})(?:\:\d{2})?\s*(AM|PM)?$/i); if (!match) return ''; let hour = Number(match[1]); if (match[3]) hour = hour % 12 + (match[3].toUpperCase() === 'PM' ? 12 : 0); return `${String(hour).padStart(2, '0')}:${match[2]}`; };
const shortDate = d => new Date(`${String(d).slice(0, 10)}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

const isBookingDueIn10Min = (booking, now = new Date()) => {
  if (!booking || !booking.reservationDate || !booking.reservationTime) return false;
  if (['CANCELLED', 'NO_SHOW', 'COMPLETED'].includes(booking.status)) return false;

  try {
    const dateStr = String(booking.reservationDate).slice(0, 10);
    const timeMatch = String(booking.reservationTime).match(/^(\d{1,2}):(\d{2})/);
    if (!timeMatch) return false;

    const bookingDate = new Date(`${dateStr}T${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}:00`);
    const diffMs = bookingDate.getTime() - now.getTime();
    const diffMin = diffMs / 60000;

    // Only within 10 minutes before arrival up to the grace period (15 minutes after scheduled time)
    return diffMin <= 10 && diffMin >= -15;
  } catch {
    return false;
  }
};

function PosDateFilter({
  value,
  onChange,
  labelText = 'Select date',
  allLabel = 'All history',
  showAllOption = false,
  count = null
}) {
  return (
    <div className="pos-date-picker-wrap" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {showAllOption && (
        <button
          type="button"
          className={`pos-button small ${value === '' ? 'primary' : ''}`}
          style={{
            height: 32,
            padding: '0 10px',
            fontSize: 11,
            fontWeight: 600,
            borderRadius: 7,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5
          }}
          onClick={() => onChange('')}
          title={allLabel}
        >
          <History size={13} />
          {allLabel}
        </button>
      )}

      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2, background: 'var(--p-card)', border: '1px solid var(--p-border)', borderRadius: 7, padding: '2px 4px', height: 32 }}>
        <button
          type="button"
          className="pos-icon-button"
          style={{ width: 24, height: 24, border: 0, padding: 0 }}
          title="Previous day"
          onClick={() => onChange(shiftDate(value || today(), -1))}
        >
          <ChevronLeft size={13} />
        </button>

        <label style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: 'pointer', margin: 0, gap: 5, padding: '0 4px' }}>
          <Calendar size={13} style={{ color: 'var(--p-muted)', flexShrink: 0 }} />
          <input
            className="pos-input"
            type="date"
            aria-label={labelText}
            value={value}
            onChange={e => onChange(e.target.value)}
            style={{
              width: 125,
              height: 26,
              fontSize: 11,
              padding: '2px 4px',
              border: 0,
              background: 'transparent',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          />
        </label>

        <button
          type="button"
          className="pos-icon-button"
          style={{ width: 24, height: 24, border: 0, padding: 0 }}
          title="Next day"
          onClick={() => onChange(shiftDate(value || today(), 1))}
        >
          <ChevronRight size={13} />
        </button>
      </div>

      {typeof count === 'number' && (
        <span style={{ fontSize: 10, color: 'var(--p-muted)' }}>
          ({count})
        </span>
      )}
    </div>
  );
}

function FoodImage({ item, className = '' }) { return <img src={item.image || '/images/bistro-hero-plate.png'} alt={item.name || ''} className={className} loading="lazy" onError={e => { e.currentTarget.onerror = null; e.currentTarget.src = '/images/bistro-hero-plate.png'; }} />; }
function SearchField({ value, onChange, placeholder = 'Search order or customer…' }) { return <div className="pos-search"><Search /><input className="pos-input" aria-label={placeholder} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} /></div>; }
function Totals({ order }) { return <div className="pos-detail-totals"><div><span>Subtotal</span><span>{money(order?.subtotal)}</span></div><div><span>Tax</span><span>{money(order?.tax)}</span></div>{Number(order?.discount) > 0 && <div><span>Discount</span><span>−{money(order.discount)}</span></div>}{Number(order?.deliveryFee) > 0 && <div><span>Delivery fee</span><span>{money(order.deliveryFee)}</span></div>}<div className="total"><span>Total payment</span><span>{money(order?.grandTotal || order?.total)}</span></div></div>; }

function OrderCard({ order, onDetails, onPay, paid = false }) {
  const items = order?.items || [];
  return (
    <article className="pos-order-card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="pos-order-card-top">
        <div style={{ width: '100%' }}>
          <div className="pos-order-number">
            <span>{order?.orderNumber}</span>
            <span>{time(order?.createdAt)}</span>
          </div>
          <div className="pos-order-title">
            <span className="pos-table-chip">
              {order?.tableNumber ? (tableLabel(order) === 'Party hall' ? 'Hall' : tableLabel(order)) : order?.source === 'DELIVERY' ? <Truck size={14} /> : <ShoppingBag size={14} />}
            </span>
            <div>
              <strong>{order?.customerName || (order?.tableNumber ? tableTitle(order) : 'Guest')}</strong>
              <small>{SOURCES[order?.source] || 'Order'} · {items.reduce((n, i) => n + (Number(i.quantity) || 0), 0)} items</small>
            </div>
            <span style={{ marginLeft: 'auto' }}><Badge status={order?.status} /></span>
          </div>
        </div>
      </div>
      <div className="pos-order-items" style={{ flex: 1 }}>
        {items.slice(0, 3).map((i, idx) => (
          <div key={idx}>
            <span>{i.quantity}×</span>
            <span style={{ flex: 1 }}>{i.name || i.itemName || 'Item'}</span>
            <span>{money(i.lineTotal)}</span>
          </div>
        ))}
        {items.length > 3 && <div><span>+{items.length - 3} more items</span></div>}
      </div>
      <div className="pos-order-total" style={{ marginTop: 'auto' }}>
        <span>Total</span>
        <strong>{money(order?.total)}</strong>
      </div>
      <div className="pos-order-card-actions">
        <button className="pos-button small" onClick={() => onDetails(order)}>
          See details <ArrowUpRight size={11} />
        </button>
        {!['CANCELLED', 'CONFIRMATION_TIMEOUT'].includes(order?.status) && (
          <button className={`pos-button small ${paid ? '' : 'primary'}`} disabled={paid} onClick={() => onPay(order)}>
            {paid ? <><Check size={12} /> Paid</> : 'Pay bill'}
          </button>
        )}
      </div>
    </article>
  );
}

const SECTION_FILTERS = {
  orders: ['ALL', 'ACTIVE', 'READY', 'COMPLETED', 'CANCELLED', 'DINE_IN_QR', 'DELIVERY', 'TAKEAWAY'],
  history: ['ALL', 'COMPLETED', 'CANCELLED', 'DINE_IN_QR', 'DELIVERY', 'TAKEAWAY'],
  tables: ['ALL', 'AVAILABLE', 'OCCUPIED', 'RESERVED', 'WAITING_FOR_CLEANING'],
  reservations: ['ALL', 'CONFIRMED', 'ARRIVED', 'SEATED', 'COMPLETED', 'CANCELLED'],
  inventory: ['ALL', 'AVAILABLE', 'SOLD_OUT']
};

const getSavedFilter = (sec) => {
  try {
    const saved = localStorage.getItem(`bistro_pos_filter_${sec}`);
    if (saved && SECTION_FILTERS[sec]?.includes(saved)) {
      return saved;
    }
  } catch {
    // ignore
  }
  return 'ALL';
};

const saveFilter = (sec, value) => {
  try {
    if (value) {
      localStorage.setItem(`bistro_pos_filter_${sec}`, value);
    }
  } catch {
    // ignore
  }
};

const getSavedTableArea = () => {
  try {
    const saved = localStorage.getItem('bistro_pos_table_area');
    if (saved && ['everyday', 'family', 'banquet', 'rooftop', 'bar'].includes(saved)) {
      return saved;
    }
  } catch {
    // ignore
  }
  return 'everyday';
};

const saveTableArea = (area) => {
  try {
    localStorage.setItem('bistro_pos_table_area', area);
  } catch {
    // ignore
  }
};

function createSessionObj(type, orders, tableInfo, paidIds) {
  const firstOrder = orders[0];
  const lastOrder = orders[orders.length - 1];
  const isDineIn = type === 'TABLE_SESSION' || Boolean(tableInfo) || Boolean(firstOrder?.tableId);

  const items = [];
  for (const order of orders) {
    for (const item of (order.items || [])) {
      items.push({
        ...item,
        orderId: order.orderId,
        orderNumber: order.orderNumber,
        orderCreatedAt: order.createdAt,
        orderStatus: order.status,
        itemStatus: item.status || order.status
      });
    }
  }

  const subtotal = orders.reduce((sum, o) => sum + Number(o.subtotal || 0), 0);
  const tax = orders.reduce((sum, o) => sum + Number(o.tax || 0), 0);
  const discount = orders.reduce((sum, o) => sum + Number(o.discount || 0), 0);
  const deliveryFee = orders.reduce((sum, o) => sum + Number(o.deliveryFee || 0), 0);
  const grandTotal = orders.reduce((sum, o) => sum + Number(o.total || 0), 0);
  const paidAmount = orders.reduce((sum, o) => sum + Number(o.paidAmount || 0), 0);

  const isPaid = orders.every(o => paidIds.has(o.orderId) || o.paymentStatus === 'PAID');
  const isCancelled = orders.every(o => ['CANCELLED', 'CONFIRMATION_TIMEOUT'].includes(o.status));
  const isClosed = isPaid || isCancelled;

  const customerName = orders.find(o => o.customerName && o.customerName !== 'Guest' && !o.customerName.startsWith('Table '))?.customerName 
    || tableInfo?.currentCustomerName 
    || firstOrder?.customerName 
    || (isDineIn ? 'Guest' : 'Customer');
    
  const customerPhone = orders.find(o => o.customerPhone)?.customerPhone 
    || tableInfo?.currentCustomerPhone 
    || firstOrder?.customerPhone 
    || '';

  let overallStatus = 'NEW';
  if (isPaid) {
    overallStatus = 'PAID';
  } else if (isCancelled) {
    overallStatus = 'CANCELLED';
  } else if (items.some(i => i.itemStatus === 'NEW' || i.orderStatus === 'NEW')) {
    overallStatus = 'NEW';
  } else if (items.some(i => ['PREPARING', 'ACCEPTED'].includes(i.itemStatus || i.orderStatus))) {
    overallStatus = 'PREPARING';
  } else if (items.some(i => ['READY', 'READY_FOR_PICKUP'].includes(i.itemStatus || i.orderStatus))) {
    overallStatus = 'READY';
  } else if (items.length > 0 && items.every(i => ['DELIVERED', 'PICKED_UP'].includes(i.itemStatus || i.orderStatus))) {
    overallStatus = 'DELIVERED';
  } else {
    overallStatus = lastOrder?.status || 'ACTIVE';
  }

  const tableNumber = tableInfo?.tableNumber || firstOrder?.tableNumber;
  const tableTitleText = tableInfo ? tableTitle(tableInfo) : (firstOrder?.tableNumber ? tableTitle(firstOrder) : (SOURCES[firstOrder?.source] || 'Order'));

  const shortId = firstOrder?.orderNumber ? firstOrder.orderNumber.replace(/^ORD-/, '').slice(0, 8) : firstOrder?.orderId?.slice(0, 8);
  const sessionId = isDineIn ? `SES-T${tableNumber || 'X'}-${shortId}` : (firstOrder?.orderNumber || 'SES-ORDER');

  const newOrders = orders.filter(o => !['DELIVERED', 'PICKED_UP', 'CANCELLED', 'CONFIRMATION_TIMEOUT'].includes(o.status));
  const deliveredOrders = orders.filter(o => ['DELIVERED', 'PICKED_UP'].includes(o.status));
  const newItems = items.filter(i => !['DELIVERED', 'PICKED_UP', 'CANCELLED', 'CONFIRMATION_TIMEOUT'].includes(i.itemStatus || i.orderStatus));
  const deliveredItems = items.filter(i => ['DELIVERED', 'PICKED_UP'].includes(i.itemStatus || i.orderStatus));

  return {
    type,
    sessionId,
    tableId: tableInfo?.tableId || firstOrder?.tableId,
    tableNumber,
    tableName: tableTitleText,
    tableInfo,
    customerName,
    customerPhone,
    startedAt: firstOrder?.createdAt,
    latestAt: lastOrder?.createdAt,
    source: firstOrder?.source || 'DINE_IN_QR',
    orders,
    newOrders,
    deliveredOrders,
    items,
    newItems,
    deliveredItems,
    totalItemCount: items.reduce((sum, i) => sum + (Number(i.quantity) || 1), 0),
    subtotal: Math.round(subtotal * 100) / 100,
    tax: Math.round(tax * 100) / 100,
    discount: Math.round(discount * 100) / 100,
    deliveryFee: Math.round(deliveryFee * 100) / 100,
    grandTotal: Math.round(grandTotal * 100) / 100,
    paidAmount: Math.round(paidAmount * 100) / 100,
    balanceDue: Math.max(0, Math.round((grandTotal - paidAmount) * 100) / 100),
    isPaid,
    isCancelled,
    isClosed,
    status: overallStatus,
    hasNewItems: newItems.length > 0,
    hasPreparingItems: items.some(i => ['PREPARING', 'ACCEPTED'].includes(i.itemStatus || i.orderStatus)),
    hasReadyItems: items.some(i => ['READY', 'READY_FOR_PICKUP'].includes(i.itemStatus || i.orderStatus)),
    hasDeliveredItems: deliveredItems.length > 0,
  };
}

function groupOrdersIntoSessions(orders, tables, paidIds, orderDate, payments = []) {
  const ordersOnDate = orders.filter(o => !orderDate || toLocalDate(o.createdAt) === orderDate);
  const tableOrdersMap = new Map();
  const nonTableOrders = [];

  // Map each orderId to its earliest paid payment timestamp
  const orderPaymentTimeMap = new Map();
  if (Array.isArray(payments)) {
    for (const p of payments) {
      if (p.orderId && p.status === 'PAID') {
        const pTime = new Date(p.createdAt).getTime();
        const existing = orderPaymentTimeMap.get(p.orderId);
        if (!existing || pTime < existing) {
          orderPaymentTimeMap.set(p.orderId, pTime);
        }
      }
    }
  }

  for (const order of ordersOnDate) {
    if (order.tableId) {
      if (!tableOrdersMap.has(order.tableId)) {
        tableOrdersMap.set(order.tableId, []);
      }
      tableOrdersMap.get(order.tableId).push(order);
    } else {
      nonTableOrders.push(order);
    }
  }

  const sessions = [];

  for (const [tableId, tOrders] of tableOrdersMap.entries()) {
    const sorted = [...tOrders].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const tableInfo = tables.find(t => t.tableId === tableId) || { tableId, tableNumber: sorted[0]?.tableNumber };

    // Group orders for this table into customer dining sessions
    let currentSessionOrders = [];

    for (let i = 0; i < sorted.length; i++) {
      const order = sorted[i];

      if (currentSessionOrders.length === 0) {
        currentSessionOrders.push(order);
        continue;
      }

      const prevOrder = currentSessionOrders[currentSessionOrders.length - 1];
      const isPrevPaid = paidIds.has(prevOrder.orderId) || prevOrder.paymentStatus === 'PAID';
      const isCurrPaid = paidIds.has(order.orderId) || order.paymentStatus === 'PAID';

      const prevCust = (prevOrder.customerName || '').trim().toLowerCase();
      const currCust = (order.customerName || '').trim().toLowerCase();
      const prevPhone = (prevOrder.customerPhone || '').replace(/\D/g, '');
      const currPhone = (order.customerPhone || '').replace(/\D/g, '');

      const prevTime = new Date(prevOrder.createdAt).getTime();
      const currTime = new Date(order.createdAt).getTime();
      const timeDiffMinutes = (currTime - prevTime) / 60000;

      const prevPaymentTime = orderPaymentTimeMap.get(prevOrder.orderId);

      // Check if this order marks a new dining session / different customer on this table:
      let isNewSession = false;

      // 1. Different explicit customer names (e.g. Rahul vs Priya)
      if (prevCust && currCust && prevCust !== 'guest' && currCust !== 'guest' && prevCust !== currCust) {
        isNewSession = true;
      }
      // 2. Different explicit phone numbers
      else if (prevPhone && currPhone && prevPhone !== currPhone) {
        isNewSession = true;
      }
      // 3. Previous order was paid before this order was placed
      else if (prevPaymentTime && currTime > prevPaymentTime) {
        isNewSession = true;
      }
      // 4. One order is paid and the next is unpaid (past vs active)
      else if (isPrevPaid && !isCurrPaid) {
        isNewSession = true;
      }
      // 5. Both orders are paid, but placed with a significant gap (> 45 min)
      else if (isPrevPaid && isCurrPaid && timeDiffMinutes > 45) {
        isNewSession = true;
      }
      // 6. Large gap between orders (> 90 min)
      else if (timeDiffMinutes > 90) {
        isNewSession = true;
      }

      if (isNewSession) {
        sessions.push(createSessionObj('TABLE_SESSION', currentSessionOrders, tableInfo, paidIds));
        currentSessionOrders = [order];
      } else {
        currentSessionOrders.push(order);
      }
    }

    if (currentSessionOrders.length > 0) {
      sessions.push(createSessionObj('TABLE_SESSION', currentSessionOrders, tableInfo, paidIds));
    }
  }

  for (const order of nonTableOrders) {
    sessions.push(createSessionObj(order.source || 'TAKEAWAY', [order], null, paidIds));
  }

  return sessions.sort((a, b) => {
    if (a.isClosed !== b.isClosed) return a.isClosed ? 1 : -1;
    return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime();
  });
}

function TableSessionCard({ session, onDetails, onPay, onAddItems, onMarkDelivered }) {
  const [expanded, setExpanded] = useState(false);
  const [itemTab, setItemTab] = useState(() => (session.hasNewItems ? 'NEW' : (session.hasDeliveredItems ? 'DELIVERED' : 'NEW')));

  useEffect(() => {
    if (session.hasNewItems && itemTab === 'DELIVERED' && !session.hasDeliveredItems) {
      setItemTab('NEW');
    }
  }, [session.hasNewItems, session.hasDeliveredItems, itemTab]);

  const isDineIn = session.type === 'TABLE_SESSION' || session.source === 'DINE_IN_QR';
  const tableChipText = isDineIn ? (session.tableNumber ? `A${session.tableNumber}` : 'T') : (session.source === 'DELIVERY' ? <Truck size={14} /> : <ShoppingBag size={14} />);
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - new Date(session.startedAt).getTime()) / 60000));
  const timeElapsedStr = elapsedMinutes < 1 ? 'Just now' : `${elapsedMinutes}m ago`;

  return (
    <article className={`pos-session-card ${session.isPaid ? 'is-paid' : ''} ${session.hasNewItems ? 'has-new' : ''}`}>
      <div className="pos-session-header">
        <div className="pos-session-title-group">
          <span className={`pos-table-chip ${isDineIn ? '' : 'pos-chip-non-dine'}`}>
            {tableChipText}
          </span>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <strong className="pos-session-name">{session.tableName}</strong>
              {session.tableNumber && (
                <span className="pos-table-id-pill" title={`Table ID: ${session.tableId}`}>
                  ID #{session.tableNumber}
                </span>
              )}
            </div>
            <div className="pos-session-ids">
              <span className="pos-session-id" title="Session ID">{session.sessionId}</span>
              {session.orders.length > 1 && (
                <span className="pos-orders-count-badge">
                  {session.orders.length} orders
                </span>
              )}
            </div>
          </div>
        </div>
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <Badge status={session.status} />
          <small className="pos-session-time">
            <Clock size={10} style={{ display: 'inline', marginRight: 3 }} />
            {time(session.startedAt)} · {timeElapsedStr}
          </small>
        </div>
      </div>

      <div className="pos-session-customer-row">
        <div className="pos-session-cust-info">
          <div className="pos-cust-field">
            <span className="pos-field-label">Customer:</span>
            <strong className="pos-cust-val">{session.customerName || 'Guest'}</strong>
          </div>
          {session.customerPhone && (
            <div className="pos-cust-field">
              <span className="pos-field-label">Phone:</span>
              <span className="pos-cust-val">{session.customerPhone}</span>
            </div>
          )}
        </div>
        <div className="pos-session-item-badge">
          <span>{session.totalItemCount} {session.totalItemCount === 1 ? 'item' : 'items'}</span>
        </div>
      </div>

      <div className="pos-session-item-tabs">
        <button
          type="button"
          className={`pos-session-tab ${itemTab === 'NEW' ? 'active' : ''}`}
          onClick={() => setItemTab('NEW')}
        >
          <span className="pos-tab-dot pos-dot-new" />
          New items
          {session.newItems?.length > 0 && (
            <span className="pos-badge-new">{session.newItems.length}</span>
          )}
        </button>
        <button
          type="button"
          className={`pos-session-tab ${itemTab === 'DELIVERED' ? 'active' : ''}`}
          onClick={() => setItemTab('DELIVERED')}
        >
          <span className="pos-tab-dot pos-dot-delivered" />
          Delivered
          {session.deliveredItems?.length > 0 && (
            <span className="pos-badge-delivered">{session.deliveredItems.length}</span>
          )}
        </button>
      </div>

      <div className="pos-session-items-preview">
        {itemTab === 'NEW' ? (
          (!session.newOrders || session.newOrders.length === 0) ? (
            <div className="pos-session-empty-tab">
              <span>All items have been delivered to customer.</span>
            </div>
          ) : (
            <div className="pos-session-orders-list">
              {session.newOrders.map((ord, ordIdx) => (
                <div key={ord.orderId || ordIdx} className="pos-ticket-entry">
                  <div className="pos-ticket-entry-header">
                    <div className="pos-ticket-entry-meta">
                      <span className="pos-ticket-entry-tag">
                        {session.orders.length > 1 ? `Order #${session.orders.findIndex(o => o.orderId === ord.orderId) + 1}` : 'Order'}
                      </span>
                      <b className="pos-ticket-entry-code">{ord.orderNumber}</b>
                      <span className="pos-ticket-entry-time">{time(ord.createdAt)}</span>
                    </div>
                    <div className="pos-ticket-entry-actions">
                      <Badge status={ord.status} />
                      <button
                        type="button"
                        className="pos-mark-delivered-btn"
                        title="Mark this order as delivered"
                        onClick={(e) => {
                          e.stopPropagation();
                          onMarkDelivered && onMarkDelivered(ord.orderId);
                        }}
                      >
                        <Check size={11} /> Mark delivered
                      </button>
                    </div>
                  </div>
                  <div className="pos-ticket-entry-items">
                    {(ord.items || []).map((it, itIdx) => (
                      <div key={it.orderItemId || itIdx} className="pos-session-preview-row">
                        <span className="pos-item-qty">{it.quantity}×</span>
                        <span className="pos-item-name">{it.name || it.itemName}</span>
                        <span className={`pos-item-mini-badge status-${(it.status || ord.status || 'new').toLowerCase()}`}>
                          {label(it.status || ord.status || 'NEW')}
                        </span>
                        <span className="pos-item-price">{money(it.lineTotal)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          (!session.deliveredOrders || session.deliveredOrders.length === 0) ? (
            <div className="pos-session-empty-tab">
              <span>No delivered orders yet. Delivered orders will appear here.</span>
            </div>
          ) : (
            <div className="pos-session-orders-list">
              {session.deliveredOrders.map((ord, ordIdx) => (
                <div key={ord.orderId || ordIdx} className="pos-ticket-entry is-delivered">
                  <div className="pos-ticket-entry-header">
                    <div className="pos-ticket-entry-meta">
                      <span className="pos-ticket-entry-tag tag-delivered">Delivered</span>
                      <b className="pos-ticket-entry-code">{ord.orderNumber}</b>
                      <span className="pos-ticket-entry-time">{time(ord.createdAt)}</span>
                    </div>
                    <Badge status="DELIVERED" />
                  </div>
                  <div className="pos-ticket-entry-items">
                    {(ord.items || []).map((it, itIdx) => (
                      <div key={it.orderItemId || itIdx} className="pos-session-preview-row">
                        <span className="pos-item-qty">{it.quantity}×</span>
                        <span className="pos-item-name">{it.name || it.itemName}</span>
                        <span className="pos-item-mini-badge status-delivered">Delivered</span>
                        <span className="pos-item-price">{money(it.lineTotal)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      <div className="pos-session-financials">
        <div className="pos-fin-row">
          <span>Subtotal</span>
          <span>{money(session.subtotal)}</span>
        </div>
        <div className="pos-fin-row">
          <span>Tax</span>
          <span>{money(session.tax)}</span>
        </div>
        {Number(session.discount) > 0 && (
          <div className="pos-fin-row discount">
            <span>Discount</span>
            <span>−{money(session.discount)}</span>
          </div>
        )}
        <div className="pos-fin-row grand-total">
          <strong>Grand Total</strong>
          <strong className="pos-total-amount">{money(session.grandTotal)}</strong>
        </div>
      </div>

      {expanded && (
        <div className="pos-session-expanded-details">
          <div className="pos-expanded-header">
            <strong>Session Orders Breakdown ({session.orders.length})</strong>
            <small>Kitchen & preparation status</small>
          </div>
          {session.orders.map((ord, ordIdx) => (
            <div key={ord.orderId || ordIdx} className="pos-order-ticket-block">
              <div className="pos-ticket-title-bar">
                <div>
                  <b className="pos-ticket-num">{ord.orderNumber}</b>
                  <span className="pos-ticket-time">at {time(ord.createdAt)}</span>
                </div>
                <Badge status={ord.status} />
              </div>
              <div className="pos-ticket-items-list">
                {(ord.items || []).map((it, itIdx) => (
                  <div key={it.orderItemId || itIdx} className="pos-ticket-item-row">
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <b>{it.quantity}× {it.name || it.itemName}</b>
                        <span className={`pos-item-mini-badge status-${(it.status || ord.status).toLowerCase()}`}>
                          {label(it.status || ord.status)}
                        </span>
                      </div>
                      {it.customization && Object.keys(it.customization).length > 0 && (
                        <small className="pos-item-cust-text">
                          {Object.entries(it.customization).map(([k, v]) => `${label(k)}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' · ')}
                        </small>
                      )}
                      {it.specialInstruction && (
                        <small className="pos-item-note-text">Note: {it.specialInstruction}</small>
                      )}
                    </div>
                    <b>{money(it.lineTotal)}</b>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="pos-session-card-actions">
        <button
          type="button"
          className="pos-button small"
          onClick={() => setExpanded(!expanded)}
          title="Toggle kitchen and item details"
        >
          {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          {expanded ? 'Collapse' : 'View details'}
        </button>

        {isDineIn && !session.isPaid && !session.isCancelled && (
          <button
            type="button"
            className="pos-button small"
            onClick={() => onAddItems && onAddItems(session)}
            title="Add more items to this running table session"
          >
            <Plus size={11} /> Add items
          </button>
        )}

        <button
          type="button"
          className="pos-button small"
          onClick={() => onDetails && onDetails(session)}
          title="Full order details modal"
        >
          <ArrowUpRight size={11} /> Details
        </button>

        {!['CANCELLED', 'CONFIRMATION_TIMEOUT'].includes(session.status) && (
          <button
            type="button"
            className={`pos-button small ${session.isPaid ? '' : 'primary'}`}
            disabled={session.isPaid}
            onClick={() => onPay && onPay(session)}
          >
            {session.isPaid ? <><Check size={11} /> Paid</> : <><CreditCard size={11} /> Pay bill</>}
          </button>
        )}
      </div>
    </article>
  );
}

export default function PosWorkspace() {
  const { currentUser } = useAuth();
  const { addToast } = useNotification();
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const section = pathname.split('/')[2] || 'dashboard';
  const canManageStaff = ['SUPER_ADMIN', 'MANAGER'].includes(currentUser?.role);
  const [data, setData] = useState({ restaurant: null, tables: [], orders: [], reservations: [], menu: [], categories: [], payments: [], issues: [], help: [], staff: [], allRestaurants: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [orderSource, setOrderSource] = useState('ALL');
  const [tableArea, setTableArea] = useState('everyday');
  const [category, setCategory] = useState('ALL');
  const [dashboardDate, setDashboardDate] = useState(today());
  const [orderDate, setOrderDate] = useState(today());
  const [reservationDate, setReservationDate] = useState('');
  const [historyDate, setHistoryDate] = useState(today());
  const [dialog, setDialog] = useState(null);
  const [selected, setSelected] = useState(null);
  const [editingCategory, setEditingCategory] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [reservationEdit, setReservationEdit] = useState(null);
  const [staffRoleFilter, setStaffRoleFilter] = useState('ALL');
  const [passwordTargetUser, setPasswordTargetUser] = useState(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const canManageStaff = ['SUPER_ADMIN', 'MANAGER'].includes(currentUser?.role);
      const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';
      const [restaurant, tables, orders, reservations, menu, categories, payments, issues, help, staff, allRestaurants] = await Promise.all([
        api.getRestaurant(),
        api.getTables(),
        api.getOrders(),
        api.getReservations(),
        api.getMenuItems(),
        api.getCategories(),
        api.getPayments(),
        api.getIssues(),
        api.getHelpRequests(),
        canManageStaff ? api.getStaff(getActiveRestaurantId()).catch(() => []) : Promise.resolve([]),
        isSuperAdmin ? api.getRestaurants().catch(() => []) : Promise.resolve([])
      ]);
      setData({
        restaurant,
        tables,
        orders,
        reservations,
        menu,
        categories,
        payments,
        issues,
        help,
        staff: Array.isArray(staff) ? staff : [],
        allRestaurants: Array.isArray(allRestaurants) ? allRestaurants : []
      });
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [currentUser?.role]);

  useEffect(() => {
    load();
    const unsub = subscribeRealtimeEvents((type, payload) => {
      if (type === 'NEW_TABLE_RESERVATION') {
        addToast(`New booking: ${payload?.bookingId || ''} (${payload?.customerName || 'Guest'}, ${tableTitle(payload)})`, 'info');
      } else if (type === 'TABLE_STATUS_UPDATED' && payload?.status === 'RESERVED') {
        addToast(`${tableTitle(payload?.table || payload)} is now RESERVED for ${payload?.customerName || 'guest'} (10m before arrival)`, 'warning');
      }
      load(true);
    });
    const id = setInterval(() => load(true), 10000);
    const handleOutletChanged = () => {
      load();
    };
    window.addEventListener('rs_outlet_changed', handleOutletChanged);
    return () => {
      unsub();
      clearInterval(id);
      window.removeEventListener('rs_outlet_changed', handleOutletChanged);
    };
  }, [load, addToast, section]);

  useEffect(() => { setFilter('ALL'); setQuery(''); setCategory('ALL'); }, [section]);

  const paidIds = useMemo(() => new Set(data.orders.filter(o => o.paymentStatus === 'PAID' || data.payments.filter(p => p.orderId === o.orderId && p.status === 'PAID').reduce((n, p) => n + Number(p.amount), 0) >= Number(o.total)).map(o => o.orderId)), [data.orders, data.payments]);
  const active = data.orders.filter(o => !DONE.includes(o.status));
  const unpaid = data.orders.filter(o => !['CANCELLED', 'CONFIRMATION_TIMEOUT'].includes(o.status) && !paidIds.has(o.orderId));
  const available = data.tables.filter(t => t.status === 'AVAILABLE');
  const diningAreaTables = getDiningAreaTables(data.tables, tableArea);
  const openIssues = data.issues.filter(i => !['RESOLVED', 'CLOSED'].includes(i.status));
  const openHelp = data.help.filter(i => i.status !== 'RESOLVED');

  const dashboardOrders = useMemo(() => {
    if (!dashboardDate) return data.orders;
    return data.orders.filter(o => toLocalDate(o.createdAt) === dashboardDate);
  }, [data.orders, dashboardDate]);

  const dashboardPayments = useMemo(() => {
    if (!dashboardDate) return data.payments;
    return data.payments.filter(p => toLocalDate(p.createdAt) === dashboardDate);
  }, [data.payments, dashboardDate]);

  const dashboardReservations = useMemo(() => {
    if (!dashboardDate) return data.reservations;
    return data.reservations.filter(r => r.reservationDate?.slice(0, 10) === dashboardDate);
  }, [data.reservations, dashboardDate]);

  const visibleReservations = useMemo(() => {
    return data.reservations
      .filter(r => (!reservationDate || r.reservationDate?.slice(0, 10) === reservationDate))
      .filter(r => filter === 'ALL' || (filter === 'CONFIRMED' ? ['CONFIRMED', 'RESCHEDULED', 'PENDING'].includes(r.status) : r.status === filter))
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }, [data.reservations, reservationDate, filter]);

  const resDateCounts = useMemo(() => {
    const todayStr = today();
    const tomorrowStr = tomorrow();
    const todayCount = data.reservations.filter(r => r.reservationDate?.slice(0, 10) === todayStr).length;
    const tomorrowCount = data.reservations.filter(r => r.reservationDate?.slice(0, 10) === tomorrowStr).length;
    const totalCount = data.reservations.length;
    return { todayCount, tomorrowCount, totalCount };
  }, [data.reservations]);

  const resStatusCounts = useMemo(() => {
    const base = reservationDate
      ? data.reservations.filter(r => r.reservationDate?.slice(0, 10) === reservationDate)
      : data.reservations;
    return {
      ALL: base.length,
      CONFIRMED: base.filter(r => ['CONFIRMED', 'RESCHEDULED', 'PENDING'].includes(r.status)).length,
      ARRIVED: base.filter(r => r.status === 'ARRIVED').length,
      SEATED: base.filter(r => r.status === 'SEATED').length,
      COMPLETED: base.filter(r => r.status === 'COMPLETED').length,
      CANCELLED: base.filter(r => r.status === 'CANCELLED').length,
    };
  }, [data.reservations, reservationDate]);

  const earning = dashboardPayments
    .filter(p => p.status === 'PAID')
    .reduce((n, p) => n + Number(p.amount), 0);

  const dashboardActive = dashboardOrders.filter(o => !DONE.includes(o.status));
  const dashboardCompleted = dashboardOrders.filter(o => ['DELIVERED', 'PICKED_UP'].includes(o.status));
  const dashboardPrep = dashboardActive.filter(o => !['READY', 'READY_FOR_PICKUP', 'PENDING_CONFIRMATION'].includes(o.status));
  const dashboardReady = dashboardActive.filter(o => ['READY', 'READY_FOR_PICKUP'].includes(o.status));

  const run = async (fn, success) => {
    setBusy(true);
    try {
      await fn();
      if (success) addToast(success, 'success');
      await load(true);
      return true;
    } catch (e) {
      addToast(e.message, 'error');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const close = () => { setDialog(null); setSelected(null); setReservationEdit(null); };
  const openOrder = order => { setSelected(order); setDialog('order'); };
  const pay = order => { setSelected(order); setDialog('payment'); };
  const newOrder = table => { setSelected(table?.tableId ? table : null); setDialog('new-order'); };
  const handleAddItems = session => {
    newOrder(session.tableInfo || { tableId: session.tableId, tableNumber: session.tableNumber });
  };
  const handleMarkDelivered = async (orderId) => {
    await run(
      () => api.updateOrderStatus(orderId, 'DELIVERED'),
      'Order marked as delivered to customer.'
    );
  };
  const handleToggleStaffStatus = async (member) => {
    const nextStatus = member.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      setBusy(true);
      await api.updateStaffStatus(member.userId, nextStatus);
      addToast(`${member.name} marked as ${nextStatus.toLowerCase()}`, 'success');
      await load(true);
    } catch (err) {
      addToast(err.message || 'Failed to update staff status', 'error');
    } finally {
      setBusy(false);
    }
  };
  const newReservation = () => { setReservationEdit(null); setDialog('reservation'); };
  const tableOrders = t => data.orders.filter(o => o.tableId === t.tableId && !['CANCELLED', 'CONFIRMATION_TIMEOUT'].includes(o.status) && (!DONE.includes(o.status) || !paidIds.has(o.orderId)));
  const getTableInfo = t => {
    // Booking time and guest name only appear 10 minutes before arrival
    const booking = data.reservations.find(r => r.tableId === t.tableId && isBookingDueIn10Min(r));
    const effectiveStatus = (t.status === 'RESERVED' && !booking) ? 'AVAILABLE' : t.status;
    const orders = tableOrders(t);
    return {
      guestName: effectiveStatus === 'RESERVED' ? (t.currentCustomerName || booking?.customerName) : (booking ? booking.customerName : null),
      bookingLabel: (effectiveStatus === 'AVAILABLE' && booking) ? `Booked ${booking.reservationTime?.slice(0, 5)}` : null,
      billTotal: orders.length ? money(orders.reduce((sum, order) => sum + order.total, 0)) : null,
    };
  };

  const orderSessions = useMemo(() => {
    return groupOrdersIntoSessions(data.orders, data.tables, paidIds, orderDate, data.payments);
  }, [data.orders, data.tables, paidIds, orderDate, data.payments]);

  const ORDER_TABS = useMemo(() => [
    { id: 'ALL', name: 'All orders' },
    { id: 'NEW', name: 'New items' },
    { id: 'DELIVERED', name: 'Delivered' },
    { id: 'IN_PROGRESS', name: 'In progress' },
    { id: 'READY', name: 'Ready to serve' },
    { id: 'COMPLETED', name: 'Completed' },
    { id: 'CANCELLED', name: 'Cancelled' },
  ], []);

  const tabCounts = useMemo(() => {
    const activeSessions = orderSessions.filter(s => !s.isClosed);
    return {
      ALL: activeSessions.length > 0 ? activeSessions.length : orderSessions.length,
      NEW: activeSessions.filter(s => s.hasNewItems).length,
      DELIVERED: orderSessions.filter(s => s.hasDeliveredItems).length,
      IN_PROGRESS: activeSessions.filter(s => s.hasPreparingItems).length,
      READY: activeSessions.filter(s => s.hasReadyItems).length,
      COMPLETED: orderSessions.filter(s => s.isPaid || (s.isClosed && !s.isCancelled)).length,
      CANCELLED: orderSessions.filter(s => s.isCancelled).length,
      DINE_IN: activeSessions.filter(s => s.type === 'TABLE_SESSION' || s.source === 'DINE_IN_QR').length,
      DELIVERY: activeSessions.filter(s => s.source === 'DELIVERY').length,
      TAKEAWAY: activeSessions.filter(s => s.source === 'TAKEAWAY').length,
    };
  }, [orderSessions]);

  const filteredSessions = useMemo(() => {
    let list = orderSessions;

    if (filter === 'ALL') {
      const hasActive = list.some(s => !s.isClosed);
      if (hasActive) {
        list = list.filter(s => !s.isClosed);
      }
    } else if (filter === 'NEW') {
      list = list.filter(s => !s.isClosed && s.hasNewItems);
    } else if (filter === 'DELIVERED') {
      list = list.filter(s => s.hasDeliveredItems);
    } else if (filter === 'IN_PROGRESS') {
      list = list.filter(s => !s.isClosed && s.hasPreparingItems);
    } else if (filter === 'READY') {
      list = list.filter(s => !s.isClosed && s.hasReadyItems);
    } else if (filter === 'COMPLETED') {
      list = list.filter(s => s.isPaid || (s.isClosed && !s.isCancelled));
    } else if (filter === 'CANCELLED') {
      list = list.filter(s => s.isCancelled);
    }

    if (orderSource === 'DINE_IN_QR') {
      list = list.filter(s => s.type === 'TABLE_SESSION' || s.source === 'DINE_IN_QR');
    } else if (orderSource === 'DELIVERY') {
      list = list.filter(s => s.source === 'DELIVERY');
    } else if (orderSource === 'TAKEAWAY') {
      list = list.filter(s => s.source === 'TAKEAWAY');
    }

    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(session => {
        const matchTable = (session.tableName || '').toLowerCase().includes(q) ||
                           String(session.tableNumber || '').includes(q) ||
                           String(session.tableId || '').toLowerCase().includes(q);
        const matchCustomer = (session.customerName || '').toLowerCase().includes(q);
        const matchPhone = (session.customerPhone || '').toLowerCase().includes(q);
        const matchSession = (session.sessionId || '').toLowerCase().includes(q);
        const matchOrders = session.orders.some(o => (o.orderNumber || '').toLowerCase().includes(q));
        const matchItems = session.items.some(i => (i.name || i.itemName || '').toLowerCase().includes(q));
        return matchTable || matchCustomer || matchPhone || matchSession || matchOrders || matchItems;
      });
    }

    return list;
  }, [orderSessions, filter, orderSource, query]);

  const historySessions = useMemo(() => {
    const closedOrders = data.orders.filter(o => 
      paidIds.has(o.orderId) || o.paymentStatus === 'PAID' || DONE.includes(o.status)
    );
    return groupOrdersIntoSessions(closedOrders, data.tables, paidIds, historyDate, data.payments);
  }, [data.orders, data.tables, paidIds, historyDate, data.payments]);

  const HISTORY_TABS = useMemo(() => [
    { id: 'ALL', name: 'All history' },
    { id: 'COMPLETED', name: 'Completed' },
    { id: 'CANCELLED', name: 'Cancelled' },
    { id: 'DINE_IN', name: 'Dine in' },
    { id: 'DELIVERY', name: 'Delivery' },
    { id: 'TAKEAWAY', name: 'Takeaway' },
  ], []);

  const historyTabCounts = useMemo(() => {
    return {
      ALL: historySessions.length,
      COMPLETED: historySessions.filter(s => s.isPaid || !s.isCancelled).length,
      CANCELLED: historySessions.filter(s => s.isCancelled).length,
      DINE_IN: historySessions.filter(s => s.type === 'TABLE_SESSION' || s.source === 'DINE_IN_QR').length,
      DELIVERY: historySessions.filter(s => s.source === 'DELIVERY').length,
      TAKEAWAY: historySessions.filter(s => s.source === 'TAKEAWAY').length,
    };
  }, [historySessions]);

  const filteredHistorySessions = useMemo(() => {
    let list = historySessions;

    if (filter === 'COMPLETED') {
      list = list.filter(s => s.isPaid || !s.isCancelled);
    } else if (filter === 'CANCELLED') {
      list = list.filter(s => s.isCancelled);
    } else if (filter === 'DINE_IN' || filter === 'DINE_IN_QR') {
      list = list.filter(s => s.type === 'TABLE_SESSION' || s.source === 'DINE_IN_QR');
    } else if (filter === 'DELIVERY') {
      list = list.filter(s => s.source === 'DELIVERY');
    } else if (filter === 'TAKEAWAY') {
      list = list.filter(s => s.source === 'TAKEAWAY');
    }

    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(session => {
        const matchTable = (session.tableName || '').toLowerCase().includes(q) ||
                           String(session.tableNumber || '').includes(q) ||
                           String(session.tableId || '').toLowerCase().includes(q);
        const matchCustomer = (session.customerName || '').toLowerCase().includes(q);
        const matchPhone = (session.customerPhone || '').toLowerCase().includes(q);
        const matchSession = (session.sessionId || '').toLowerCase().includes(q);
        const matchOrders = session.orders.some(o => (o.orderNumber || '').toLowerCase().includes(q));
        const matchItems = session.items.some(i => (i.name || i.itemName || '').toLowerCase().includes(q));
        return matchTable || matchCustomer || matchPhone || matchSession || matchOrders || matchItems;
      });
    }

    return list;
  }, [historySessions, filter, query]);

  const totalHistoryRevenue = useMemo(() => {
    return filteredHistorySessions
      .filter(s => !s.isCancelled)
      .reduce((sum, s) => sum + Number(s.grandTotal || 0), 0);
  }, [filteredHistorySessions]);

  const filteredOrders = data.orders
    .filter(o => section !== 'history' || DONE.includes(o.status))
    .filter(o => {
      if (section === 'orders' && orderDate) {
        return toLocalDate(o.createdAt) === orderDate;
      }
      if (section === 'history' && historyDate) {
        return toLocalDate(o.createdAt) === historyDate;
      }
      return true;
    })
    .filter(o => filter === 'ALL' || (filter === 'ACTIVE' ? !DONE.includes(o.status) : filter === 'COMPLETED' ? ['DELIVERED', 'PICKED_UP'].includes(o.status) : filter === 'CANCELLED' ? ['CANCELLED', 'CONFIRMATION_TIMEOUT'].includes(o.status) : o.source === filter || o.status === filter))
    .filter(o => `${o.orderNumber} ${o.customerName} ${o.customerPhone || ''} ${o.tableNumber ? `${tableLabel(o)} Table ${o.tableNumber}` : ''}`.toLowerCase().includes(query.toLowerCase()));

  const filteredStaff = useMemo(() => {
    let list = Array.isArray(data.staff) ? data.staff : [];
    if (staffRoleFilter !== 'ALL') {
      list = list.filter(s => s.role === staffRoleFilter);
    }
    if (query?.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(s =>
        (s.name || '').toLowerCase().includes(q) ||
        (s.email || '').toLowerCase().includes(q) ||
        (s.employeeCode || '').toLowerCase().includes(q) ||
        (s.phone || '').toLowerCase().includes(q) ||
        (s.role || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [data.staff, staffRoleFilter, query]);

  const menuDots = useMemo(() => ({
    '/pos/orders': section !== 'orders' && data.orders.some(o => o.status === 'NEW'),
    '/pos/reservations': section !== 'reservations' && data.reservations.some(r => r.status === 'PENDING'),
    '/pos/tables': section !== 'tables' && (
      data.tables.some(t => t.status === 'WAITING_FOR_CLEANING') ||
      data.help.some(h => h.status === 'PENDING')
    ),
  }), [section, data.orders, data.reservations, data.tables, data.help]);

  return (
    <PosShell alertCount={openIssues.length + openHelp.length} onAlerts={() => navigate('/pos/notifications')} menuDots={menuDots}>
      {({ now }) => <>
        {error && <div className="pos-error" role="alert"><AlertCircle size={16} /><span>{error}</span><button onClick={() => load()}>Try again</button></div>}
        {section === 'dashboard' ? (
          <>
            <div className="pos-heading">
              <div>
                <h1>Good {now.getHours() < 12 ? 'morning' : now.getHours() < 17 ? 'afternoon' : 'evening'}, {currentUser?.name?.split(' ')[0]} <span style={{ fontSize: 19 }}>☀</span></h1>
                <p>Everything you need for a smooth service, all in one place.</p>
              </div>
              <div className="pos-heading-actions">
                <div className="pos-clock">
                  <strong>{now.toLocaleTimeString('en-GB')}</strong>
                  <span>{now.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}</span>
                </div>
                <PosDateFilter
                  value={dashboardDate}
                  onChange={setDashboardDate}
                  labelText="Filter dashboard date"
                  showAllOption={false}
                />
                <button className="pos-icon-button" onClick={() => load()} aria-label="Refresh workspace"><RefreshCw size={16} className={loading ? 'pos-spin' : ''} /></button>
                <button className="pos-button primary" onClick={() => newOrder()}><Plus /> Create new order</button>
              </div>
            </div>

            {loading ? <Spinner /> : (
              <>
                <div className="pos-dashboard">
                  <div>
                    <div className="pos-metrics">
                      {[
                        [dashboardDate === today() ? "Today's earnings" : dashboardDate === yesterday() ? "Yesterday's earnings" : dashboardDate ? `Earnings (${shortDate(dashboardDate)})` : "All-time earnings", money(earning), CreditCard, dashboardDate === today() ? "Recorded payments today" : dashboardDate ? `Recorded on ${shortDate(dashboardDate)}` : "All recorded payments"],
                        ['In progress', dashboardPrep.length, Timer, dashboardDate ? `Preparing (${shortDate(dashboardDate)})` : 'Orders being prepared'],
                        ['Ready to serve', dashboardReady.length, Check, 'Fresh from the kitchen'],
                        [dashboardDate === today() ? "Completed today" : dashboardDate === yesterday() ? "Completed yesterday" : dashboardDate ? `Completed (${shortDate(dashboardDate)})` : "All completed", dashboardCompleted.length, ClipboardCheck, dashboardDate ? `Orders served on ${shortDate(dashboardDate)}` : 'Orders served']
                      ].map(([title, value, Icon, sub]) => (
                        <article className="pos-metric" key={title}>
                          <div className="pos-metric-top">{title}<span><Icon size={15} /></span></div>
                          <strong>{value}</strong>
                          <small>{sub}</small>
                        </article>
                      ))}
                    </div>

                    <div className="pos-panels">
                      <section className="pos-panel">
                        <div className="pos-panel-header">
                          <h2>In progress {dashboardActive.length > 0 && <span className="pos-count">{dashboardActive.length}</span>}</h2>
                          <Link className="pos-text-link" to="/pos/orders">View all <ArrowUpRight size={11} /></Link>
                        </div>
                        <div className="pos-panel-content">
                          {dashboardActive.length ? dashboardActive.slice(0, 3).map(o => (
                            <OrderCard key={o.orderId} order={o} paid={paidIds.has(o.orderId)} onDetails={openOrder} onPay={pay} />
                          )) : (
                            <Empty title="No orders in progress">
                              New orders will appear here as soon as they are placed.<br />
                              <button className="pos-text-link" style={{ marginTop: 12 }} onClick={() => newOrder()}>Create your first order <Plus size={11} /></button>
                            </Empty>
                          )}
                        </div>
                      </section>

                      <section className="pos-panel">
                        <div className="pos-panel-header">
                          <h2>Waiting for payment {unpaid.length > 0 && <span className="pos-count">{unpaid.length}</span>}</h2>
                          <span style={{ fontSize: 10, color: 'var(--p-muted)' }}>{money(unpaid.reduce((n, o) => n + Number(o.total), 0))}</span>
                        </div>
                        <div className="pos-panel-content">
                          {unpaid.length ? unpaid.slice(0, 3).map(o => (
                            <OrderCard key={o.orderId} order={o} onDetails={openOrder} onPay={pay} />
                          )) : (
                            <Empty icon={CreditCard} title="All caught up">Unpaid orders will appear here so you can take care of the bill.</Empty>
                          )}
                        </div>
                      </section>
                    </div>

                    <section className="pos-panel" style={{ marginTop: 20 }}>
                      <div className="pos-panel-header">
                        <h2><CalendarDays size={16} style={{ display: 'inline', marginRight: 7, color: 'var(--p-blue)' }} /> Table reservations from website {dashboardReservations.filter(r => !['CANCELLED', 'NO_SHOW', 'COMPLETED'].includes(r.status)).length > 0 && <span className="pos-count">{dashboardReservations.filter(r => !['CANCELLED', 'NO_SHOW', 'COMPLETED'].includes(r.status)).length}</span>}</h2>
                        <Link className="pos-text-link" to="/pos/reservations">View &amp; manage all <ArrowUpRight size={11} /></Link>
                      </div>
                      <div className="pos-panel-content">
                        {dashboardReservations.filter(r => !['CANCELLED', 'NO_SHOW', 'COMPLETED'].includes(r.status)).length ? (
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, padding: '4px 0' }}>
                            {dashboardReservations.filter(r => !['CANCELLED', 'NO_SHOW', 'COMPLETED'].includes(r.status)).slice(0, 4).map(r => (
                              <div key={r.reservationId} style={{ background: 'var(--p-card)', border: '1px solid var(--p-border)', borderRadius: 8, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                  <span className="pos-table-chip">{tableLabel(r) === 'Party hall' ? 'Hall' : tableLabel(r)}</span>
                                  <Badge status={r.status} />
                                </div>
                                <div>
                                  <strong style={{ fontSize: 12 }}>{r.customerName}</strong>
                                  <small style={{ display: 'block', color: 'var(--p-muted)', fontSize: 10, marginTop: 2 }}>{r.guestCount} guests · {r.customerPhone || ''}</small>
                                </div>
                                <div style={{ fontSize: 11, color: 'var(--p-blue)', fontWeight: 600 }}>📅 {shortDate(r.reservationDate)} at {r.reservationTime?.slice(0, 5)}</div>
                                {r.specialRequest && <small style={{ fontSize: 9, color: 'var(--p-muted)', fontStyle: 'italic' }}>"{r.specialRequest}"</small>}
                                <div style={{ display: 'flex', gap: 6, marginTop: 'auto', paddingTop: 6 }}>
                                  {['PENDING', 'CONFIRMED', 'RESCHEDULED'].includes(r.status) && (
                                    <button className="pos-button primary small" style={{ flex: 1 }} disabled={busy} onClick={() => run(() => api.updateReservationStatus(r.reservationId, 'ARRIVED'), 'Guest marked arrived')}>Mark arrived</button>
                                  )}
                                  {r.status === 'ARRIVED' && (
                                    <button className="pos-button primary small" style={{ flex: 1 }} disabled={busy} onClick={() => run(() => api.updateReservationStatus(r.reservationId, 'SEATED', r.tableId), 'Guest seated')}>Seat guest</button>
                                  )}
                                  <button className="pos-button small" onClick={() => { setReservationEdit(r); setDialog('reservation'); }}>Details</button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <Empty icon={CalendarDays} title="No active table bookings">Bookings made on the website will automatically appear here in real time.</Empty>
                        )}
                      </div>
                    </section>
                  </div>

                  <aside className="pos-side-stack">
                    <section className="pos-panel">
                      <div className="pos-panel-header">
                        <h2>Available tables</h2>
                        <span className="pos-count">{available.length} / {data.tables.length}</span>
                      </div>
                      {available.length ? (
                        <>
                          <table className="pos-table-list">
                            <thead><tr><th>Table number</th><th>Capacity</th></tr></thead>
                            <tbody>
                              {available.slice(0, 7).map(t => (
                                <tr key={t.tableId}>
                                  <td><button onClick={() => { setSelected(t); setDialog('table'); }}>{tableTitle(t)}</button></td>
                                  <td style={{ color: 'var(--p-muted)' }}>{t.capacity} people</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <div className="pos-availability-footer">
                            <span className="pos-live-dot" /> Updated from the restaurant floor
                            <Link to="/pos/tables" style={{ marginLeft: 'auto', color: 'var(--p-blue)' }}><ArrowUpRight size={12} /></Link>
                          </div>
                        </>
                      ) : (
                        <Empty icon={Armchair} title="All tables are in use">Check the floor plan for table details.</Empty>
                      )}
                    </section>

                    <section className="pos-panel">
                      <div className="pos-panel-header">
                        <h2>Out of stock</h2>
                        <Package size={15} style={{ color: 'var(--p-muted)' }} />
                      </div>
                      {data.menu.some(m => !m.availability) ? (
                        data.menu.filter(m => !m.availability).slice(0, 5).map(m => (
                          <div className="pos-stock-item" key={m.menuItemId}>
                            <FoodImage item={m} />
                            <div><b>{m.name}</b><small>{m.categoryName}</small></div>
                            <Badge status="UNAVAILABLE">Sold out</Badge>
                          </div>
                        ))
                      ) : (
                        <Empty icon={Package} title="The kitchen is ready">All menu items are available to order.</Empty>
                      )}
                    </section>
                  </aside>
                </div>

                <div className="pos-overview-strip">
                  <CalendarDays size={17} />
                  <span><b>{dashboardReservations.filter(r => !['CANCELLED', 'NO_SHOW', 'COMPLETED'].includes(r.status)).length} reservations</b> {dashboardDate === today() ? 'scheduled for today' : dashboardDate ? `scheduled for ${shortDate(dashboardDate)}` : 'scheduled across all dates'}</span>
                  {dashboardOrders.length > 0 && <><span>·</span><span><b>{dashboardOrders.length} orders</b> recorded</span></>}
                  <span>·</span>
                  <span><b>{openIssues.length + openHelp.length} requests</b> need your attention</span>
                  <Link to="/pos/reservations">Manage reservations <span>↗</span></Link>
                </div>
              </>
            )}
          </>
        ) : (
          <>
            <div className="pos-toolbar">
              <h1 className="pos-page-title">
                {section === 'orders' ? <ClipboardList /> : section === 'tables' ? <Armchair /> : section === 'reservations' ? <CalendarDays /> : section === 'history' ? <History /> : section === 'inventory' ? <Package /> : section === 'staff' ? <Users /> : <Bell />}
                {({ orders: 'Orders', tables: 'Table overview', reservations: 'Reservations', history: 'Order history', inventory: 'Menu', staff: currentUser?.role === 'SUPER_ADMIN' ? 'Hotel Staff & Managers' : 'Restaurant Staff Roster', notifications: 'Notifications & assistance' })[section] || 'Workspace'}
              </h1>
              <div className="pos-toolbar-actions">
                {section === 'orders' && <PosDateFilter value={orderDate} onChange={setOrderDate} labelText="Filter orders by date" showAllOption={false} />}
                {section === 'history' && <PosDateFilter value={historyDate} onChange={setHistoryDate} labelText="Filter history by date" showAllOption={false} />}
                {section === 'reservations' && <PosDateFilter value={reservationDate} onChange={setReservationDate} labelText="Filter reservations by date" allLabel="All history" showAllOption={true} />}
                {['orders', 'history', 'inventory', 'staff'].includes(section) && <SearchField value={query} onChange={setQuery} placeholder={section === 'inventory' ? 'Search menu items…' : section === 'staff' ? 'Search staff by name, email, phone…' : 'Search order or customer…'} />}
                <button className="pos-icon-button" onClick={() => load()} aria-label="Refresh"><RefreshCw size={15} className={loading ? 'pos-spin' : ''} /></button>
                {section === 'reservations' && <button className="pos-button primary" onClick={newReservation}><Plus /> Add new reservation</button>}
                {section === 'inventory' && canManageStaff && (
                  <>
                    <button
                      className="pos-button"
                      onClick={() => setDialog('report-shortage')}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      <Package size={14} /> Report Stock Shortage
                    </button>
                    <button
                      className="pos-button"
                      onClick={() => setDialog('add-category')}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      <FolderPlus size={14} /> Add Category
                    </button>
                    <button
                      className="pos-button primary"
                      onClick={() => setDialog('add-menu-item')}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      <Plus size={14} /> Add Dish / Item
                    </button>
                  </>
                )}
                {section === 'staff' && (
                  <>
                    <button
                      className="pos-button"
                      onClick={() => setPasswordTargetUser(currentUser)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      title="Change my account password"
                    >
                      <KeyRound size={14} /> My Password
                    </button>
                    {currentUser?.role === 'SUPER_ADMIN' && (
                      <button
                        className="pos-button primary"
                        onClick={() => setDialog('add-manager')}
                        style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)', color: '#fff', border: 0, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      >
                        <UserPlus size={14} /> Add Hotel Manager
                      </button>
                    )}
                    <button className="pos-button" onClick={() => setDialog('add-staff')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <Plus size={14} /> Add Staff Member
                    </button>
                  </>
                )}
                {!['history', 'notifications', 'inventory', 'reservations', 'staff'].includes(section) && <button className="pos-button primary" onClick={() => newOrder()}><Plus /> Create new order</button>}
              </div>
            </div>

            {loading ? <Spinner /> : (
              <>

                {section === 'orders' && (
                  <>
                    {orderDate && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--p-card)', border: '1px solid var(--p-border)', borderRadius: 8, marginBottom: 16 }}>
                        <span style={{ fontSize: 11, fontWeight: 600 }}>
                          📋 Showing orders for: <strong style={{ color: 'var(--p-blue)' }}>{orderDate === today() ? 'Today' : orderDate === yesterday() ? 'Yesterday' : orderDate === tomorrow() ? 'Tomorrow' : shortDate(orderDate)}</strong>{filteredSessions.length > 0 && ` (${filteredSessions.length} ${filteredSessions.length === 1 ? 'table / order session' : 'table / order sessions'})`}
                        </span>
                        {orderDate !== today() && (
                          <button className="pos-button small" onClick={() => setOrderDate(today())}>Jump to today</button>
                        )}
                      </div>
                    )}
                    <div className="pos-toolbar" style={{ gap: 12, marginBottom: 16 }}>
                      <div className="pos-tabs" style={{ marginBottom: 0 }}>
                        {ORDER_TABS.map(({ id, name }) => (
                          <button
                            key={id}
                            className={`pos-tab ${filter === id ? 'active' : ''}`}
                            onClick={() => setFilter(id)}
                          >
                            {name}
                            {typeof tabCounts[id] === 'number' && tabCounts[id] > 0 && (
                              <span className="pos-count">{tabCounts[id]}</span>
                            )}
                          </button>
                        ))}
                      </div>
                      <div className="pos-toolbar-actions" style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, width: 130 }}>
                        <select
                          aria-label="Order source"
                          value={orderSource}
                          onChange={event => setOrderSource(event.target.value)}
                          className="pos-select"
                          style={{ height: 37, minHeight: 37, minWidth: 125 }}
                        >
                          <option value="ALL">All sources</option>
                          <option value="DINE_IN_QR">Dine in</option>
                          <option value="DELIVERY">Delivery</option>
                          <option value="TAKEAWAY">Takeaway</option>
                        </select>
                      </div>
                    </div>
                    {filteredSessions.length ? (
                      <div className="pos-orders-grid">
                        {filteredSessions.map(session => (
                          <TableSessionCard
                            key={session.sessionId}
                            session={session}
                            onDetails={openOrder}
                            onPay={pay}
                            onAddItems={handleAddItems}
                            onMarkDelivered={handleMarkDelivered}
                          />
                        ))}
                      </div>
                    ) : (
                      <section className="pos-panel">
                        <Empty title={query || orderDate ? 'No matching orders' : 'No active orders'}>
                          {orderDate ? `No orders found for ${orderDate === today() ? 'today' : shortDate(orderDate)}. Use the calendar to select another date.` : query ? 'Try another table, customer name, phone number, or order ID.' : 'Orders and active table sessions will appear here in real time.'}
                        </Empty>
                      </section>
                    )}
                  </>
                )}

                {section === 'history' && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--p-card)', border: '1px solid var(--p-border)', borderRadius: 8, marginBottom: 16 }}>
                      <div>
                        <span style={{ fontSize: 11, fontWeight: 650 }}>
                          📜 {historyDate ? (historyDate === today() ? 'Today’s closed sessions' : historyDate === yesterday() ? 'Yesterday’s closed sessions' : `Closed sessions for ${shortDate(historyDate)}`) : 'All historical dining sessions'}{filteredHistorySessions.length > 0 && ` (${filteredHistorySessions.length} ${filteredHistorySessions.length === 1 ? 'session' : 'sessions'})`}
                        </span>
                        <span style={{ display: 'block', fontSize: 10, color: 'var(--p-muted)', marginTop: 2 }}>
                          Total closed revenue: <b style={{ color: 'var(--p-text)' }}>{money(totalHistoryRevenue)}</b>
                        </span>
                      </div>
                      {historyDate && <button className="pos-button small" onClick={() => setHistoryDate('')}>View all history</button>}
                    </div>
                    <div className="pos-tabs">
                      {HISTORY_TABS.map(({ id, name }) => (
                        <button
                          key={id}
                          className={`pos-tab ${filter === id || (id === 'DINE_IN' && filter === 'DINE_IN_QR') ? 'active' : ''}`}
                          onClick={() => setFilter(id)}
                        >
                          {name}
                          {typeof historyTabCounts[id] === 'number' && historyTabCounts[id] > 0 && (
                            <span className="pos-count">{historyTabCounts[id]}</span>
                          )}
                        </button>
                      ))}
                    </div>
                    {filteredHistorySessions.length ? (
                      <div className="pos-orders-grid">
                        {filteredHistorySessions.map(session => (
                          <TableSessionCard
                            key={session.sessionId}
                            session={session}
                            onDetails={openOrder}
                            onPay={pay}
                            onAddItems={handleAddItems}
                            onMarkDelivered={handleMarkDelivered}
                          />
                        ))}
                      </div>
                    ) : (
                      <section className="pos-panel">
                        <Empty title={historyDate ? `No history for ${shortDate(historyDate)}` : 'No historical sessions'}>
                          {historyDate ? 'No completed or cancelled dining sessions recorded on this date. Select another date with the calendar.' : 'Past closed dining sessions will appear here for audit and reporting.'}
                        </Empty>
                      </section>
                    )}
                  </>
                )}

                {section === 'tables' && (
                  <>
                    <div className="pos-toolbar pos-table-status-toolbar">
                      <div className="pos-table-status-controls">
                        <span className="pos-table-status-label">Live table status</span>
                        <div className="pos-tabs" style={{ margin: 0 }}>
                          {[['ALL', 'All tables'], ['AVAILABLE', 'Available'], ['OCCUPIED', 'Occupied'], ['RESERVED', 'Reserved'], ['WAITING_FOR_CLEANING', 'Cleaning']].map(([id, name]) => {
                            const count = id === 'ALL' ? diningAreaTables.length : id === 'WAITING_FOR_CLEANING' ? diningAreaTables.filter(t => ['WAITING_FOR_CLEANING', 'CLEANING'].includes(t.status)).length : diningAreaTables.filter(t => t.status === id).length;
                            return (
                              <button type="button" className={`pos-tab ${filter === id ? 'active' : ''}`} aria-pressed={filter === id} onClick={() => setFilter(id)} key={id}>
                                {name}
                                {count > 0 && <span>{count}</span>}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div className="pos-floor-header" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div className="pos-legend">
                          <span><i /> Available</span>
                          <span><i className="occupied" /> Occupied</span>
                          <span><i className="reserved" /> Reserved</span>
                          <span><i className="cleaning" /> Cleaning</span>
                        </div>
                        {['SUPER_ADMIN', 'MANAGER'].includes(currentUser?.role) && (
                          <button
                            type="button"
                            className="pos-button primary small"
                            onClick={() => setDialog('add-table')}
                            style={{ gap: 6, padding: '6px 14px', fontSize: 12, borderRadius: 8, whiteSpace: 'nowrap' }}
                          >
                            <Plus size={13} /> Add Table
                          </button>
                        )}
                      </div>
                    </div>
                    <TableFloorPlan
                      tables={data.tables.filter(t => filter === 'ALL' || (filter === 'WAITING_FOR_CLEANING' ? ['WAITING_FOR_CLEANING', 'CLEANING'].includes(t.status) : t.status === filter))}
                      allTables={data.tables}
                      selectedArea={tableArea}
                      onAreaChange={area => { setTableArea(area); setFilter('ALL'); }}
                      onSelectTable={t => { setSelected(t); setDialog('table'); }}
                      getTableInfo={getTableInfo}
                      empty={<Empty icon={Armchair} title="No tables in this view">Select another table status.</Empty>}
                      renderTable={(t, layout) => {
                          // Booking only appears 10 minutes before scheduled reservation time
                          const activeBooking = data.reservations.find(r => r.tableId === t.tableId && isBookingDueIn10Min(r));
                          const effectiveStatus = (t.status === 'RESERVED' && !activeBooking) ? 'AVAILABLE' : t.status;
                          const guestName = effectiveStatus === 'RESERVED' ? (t.currentCustomerName || activeBooking?.customerName) : null;
                          return (
                            <FloorPlanTable
                              key={t.tableId}
                              table={{ ...t, status: effectiveStatus }}
                              layout={layout}
                              onClick={() => { setSelected(t); setDialog('table'); }}
                              aria-label={`${tableTitle(t)}, ${t.capacity} seats, ${label(effectiveStatus)}`}
                            >
                              {effectiveStatus !== 'AVAILABLE' && (
                                <span className="pos-table-status" title={guestName ? `Reserved · ${guestName}` : label(effectiveStatus)}>
                                  {guestName ? `Reserved · ${guestName}` : label(effectiveStatus)}
                                </span>
                              )}
                              {effectiveStatus === 'AVAILABLE' && activeBooking && (
                                <span className="pos-table-status pos-plan-booking">
                                  Booked {activeBooking.reservationTime?.slice(0, 5)}
                                  {activeBooking.customerName ? ` · ${activeBooking.customerName.split(' ')[0]}` : ''}
                                </span>
                              )}
                              {tableOrders(t).length > 0 && <small>{money(tableOrders(t).reduce((s, o) => s + o.total, 0))}</small>}
                            </FloorPlanTable>
                          );
                      }}
                    />
                    <div className="pos-floor-footer"><Info size={13} /> Select a table or hall to view its orders, take payment or update its status.</div>
                  </>
                )}

                {section === 'reservations' && (
                  <>
                    <p className="pos-section-note">Table availability is calculated for your selected date, time and party size. Tables are assigned automatically to prevent booking conflicts.</p>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--p-card)', border: '1px solid var(--p-border)', borderRadius: 8, marginBottom: 16 }}>
                      <span style={{ fontSize: 11, fontWeight: 600 }}>
                        📅 Showing: <strong style={{ color: 'var(--p-blue)' }}>{reservationDate ? (reservationDate === today() ? 'Today’s reservations' : reservationDate === yesterday() ? 'Yesterday’s reservations' : reservationDate === tomorrow() ? 'Tomorrow’s reservations' : `Reservations for ${shortDate(reservationDate)}`) : 'All reservation history'}</strong>
                        {visibleReservations.length > 0 ? ` (${visibleReservations.length} bookings)` : ''}
                      </span>
                      {reservationDate ? (
                        <button className="pos-button small" onClick={() => setReservationDate('')}>View all history</button>
                      ) : (
                        <button className="pos-button small" onClick={() => setReservationDate(today())}>Show today only</button>
                      )}
                    </div>
                    <div className="pos-tabs">{['ALL', 'CONFIRMED', 'ARRIVED', 'SEATED', 'COMPLETED', 'CANCELLED'].map(id => <button key={id} className={`pos-tab ${filter === id ? 'active' : ''}`} onClick={() => setFilter(id)}>{id === 'ALL' ? 'All reservations' : label(id)}</button>)}</div>
                    {data.reservations.filter(r => (!reservationDate || r.reservationDate?.slice(0, 10) === reservationDate) && (filter === 'ALL' || r.status === filter)).length ? (
                      <div className="pos-data-wrap">
                        <table className="pos-data-table">
                          <thead><tr><th>Reservation</th><th>Guest</th><th>Date & time</th><th>Table / party</th><th>Status</th><th>Actions</th></tr></thead>
                          <tbody>
                            {visibleReservations.map(r => (
                              <tr key={r.reservationId}>
                                <td>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <b>{r.bookingId}</b>
                                    {r.createdAt && (Date.now() - new Date(r.createdAt).getTime()) < 1000 * 60 * 30 && (
                                      <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0' }}>NEW</span>
                                    )}
                                  </div>
                                  <small>{r.specialRequest || 'No special requests'}</small>
                                </td>
                                <td>{r.customerName}<small>{r.customerPhone}</small></td>
                                <td>{shortDate(r.reservationDate)}<small>{r.reservationTime?.slice(0, 5)}</small></td>
                                <td>{tableTitle(r)}<small>{r.guestCount} guests</small></td>
                                <td><Badge status={r.status} /></td>
                                <td>
                                  {['PENDING', 'CONFIRMED', 'RESCHEDULED'].includes(r.status) && (
                                    <>
                                      <button className="pos-button primary small" disabled={busy} onClick={() => run(() => api.updateReservationStatus(r.reservationId, 'ARRIVED'), 'Guest marked arrived')}>Mark arrived</button>
                                      <button className="pos-button small" onClick={() => { setReservationEdit(r); setDialog('reservation'); }}>Reschedule</button>
                                    </>
                                  )}
                                  {r.status === 'ARRIVED' && <button className="pos-button primary small" disabled={busy} onClick={() => run(() => api.updateReservationStatus(r.reservationId, 'SEATED', r.tableId), 'Guest seated')}>Seat guest</button>}
                                  {r.status === 'SEATED' && (
                                    <>
                                      <button className="pos-button small" disabled={busy} onClick={() => run(() => api.updateReservationStatus(r.reservationId, 'COMPLETED'), 'Reservation completed')}>Complete</button>
                                      <small style={{ display: 'block', color: 'var(--p-muted)', fontSize: 8, marginTop: 3 }}>Auto-completes on bill payment</small>
                                    </>
                                  )}
                                  {!['CANCELLED', 'COMPLETED', 'NO_SHOW', 'EXPIRED'].includes(r.status) && <button className="pos-button danger small" disabled={busy} onClick={() => { setSelected(r); setDialog('cancel-reservation'); }}>Cancel</button>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <section className="pos-panel">
                        <Empty icon={CalendarDays} title={reservationDate ? `No reservations for ${reservationDate === today() ? 'today' : reservationDate === yesterday() ? 'yesterday' : reservationDate === tomorrow() ? 'tomorrow' : reservationDate}` : 'No reservations found'}>
                          {reservationDate ? 'Click "All history" to view all customer bookings, or pick another date from the calendar.' : 'New website bookings and staff reservations will appear here in real-time.'}
                        </Empty>
                      </section>
                    )}
                  </>
                )}

                {section === 'inventory' && (
                  <div className="pos-inventory-layout">
                    <aside className="pos-filter-card">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                        <h3 style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>Menu categories</h3>
                      </div>
                      <div className="pos-category-list">
                        {[{ categoryId: 'ALL', name: 'All items' }, ...data.categories].map(c => {
                          const count = data.menu.filter(m => c.categoryId === 'ALL' || m.categoryId === c.categoryId).length;
                          return (
                            <div key={c.categoryId} style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%' }}>
                              <button
                                style={{ flex: 1, textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                                className={category === c.categoryId ? 'active' : ''}
                                onClick={() => setCategory(c.categoryId)}
                              >
                                <span>{c.name}</span>
                                {count > 0 && <span>{count}</span>}
                              </button>
                              {canManageStaff && c.categoryId !== 'ALL' && (
                                <button
                                  type="button"
                                  className="pos-icon-button"
                                  style={{ width: 24, height: 24, border: 0, opacity: 0.6, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'transparent' }}
                                  title={`Edit category ${c.name}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingCategory(c);
                                    setDialog('edit-category');
                                  }}
                                >
                                  <Pencil size={12} />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <hr style={{ border: 0, borderTop: '1px solid var(--p-border)', margin: '15px 0' }} />
                      <label className="pos-field">
                        <span>Availability</span>
                        <select className="pos-select" value={filter} onChange={e => setFilter(e.target.value)}>
                          <option value="ALL">All items</option>
                          <option value="AVAILABLE">Available</option>
                          <option value="SOLD_OUT">Sold out</option>
                        </select>
                      </label>
                    </aside>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                        <p className="pos-section-note" style={{ margin: 0 }}>Availability changes appear live on customer QR, website, and kitchen panels.</p>
                      </div>
                      {(() => {
                        const visibleItems = data.menu.filter(m => (category === 'ALL' || m.categoryId === category) && (filter === 'ALL' || (filter === 'AVAILABLE' ? m.availability : !m.availability)) && m.name.toLowerCase().includes(query.toLowerCase()));
                        if (!visibleItems.length) {
                          return (
                            <div className="pos-panel" style={{ padding: '40px 20px', textAlign: 'center' }}>
                              <Empty icon={Package} title="No dishes found">
                                {query ? 'Try a different search keyword.' : 'No dishes found in this category.'}
                              </Empty>
                              {canManageStaff && !query && (
                                <button
                                  type="button"
                                  className="pos-button primary"
                                  style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                                  onClick={() => setDialog('add-menu-item')}
                                >
                                  <Plus size={14} /> Add First Dish to this Category
                                </button>
                              )}
                            </div>
                          );
                        }
                        return (
                          <div className="pos-menu-grid">
                            {visibleItems.map(m => (
                              <article className="pos-menu-card" key={m.menuItemId}>
                                <div className="pos-menu-image">
                                  <FoodImage item={m} />
                                  <Badge status={m.availability ? 'AVAILABLE' : 'UNAVAILABLE'}>{m.availability ? 'Available' : 'Sold out'}</Badge>
                                </div>
                                <h3><span className={`pos-food-type ${m.vegNonveg === 'VEG' ? '' : 'nonveg'}`} />{m.name}</h3>
                                <p>{m.description}</p>
                                <div className="pos-menu-card-bottom" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                  <strong>{money(m.price)}</strong>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    {canManageStaff && (
                                      <button
                                        type="button"
                                        className="pos-icon-button"
                                        style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid var(--p-border)', background: 'var(--p-card)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                        title={`Edit ${m.name}`}
                                        onClick={() => {
                                          setEditingItem(m);
                                          setDialog('edit-menu-item');
                                        }}
                                      >
                                        <Pencil size={12} />
                                      </button>
                                    )}
                                    <button
                                      className={`pos-toggle ${m.availability ? 'on' : ''}`}
                                      disabled={busy}
                                      aria-label={`${m.availability ? 'Mark unavailable' : 'Mark available'}: ${m.name}`}
                                      aria-pressed={m.availability}
                                      onClick={() => run(() => api.updateItemAvailability(m.menuItemId, !m.availability), `${m.name} is ${m.availability ? 'sold out' : 'available'}`)}
                                    >
                                      <i />
                                    </button>
                                  </div>
                                </div>
                              </article>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {section === 'notifications' && (
                  <>
                    {openIssues.map(i => (
                      <article className="pos-issue-card" key={i.issueId}>
                        <div><b><AlertCircle size={14} style={{ display: 'inline', marginRight: 6, color: '#df626b' }} /> Customer order issue</b><Badge status={i.status} /></div>
                        <p>{i.description}</p>
                        <footer>
                          <span>{time(i.createdAt)} · {i.orderNumber || i.orderId?.slice(0, 8)}</span>
                          {currentUser?.role !== 'RECEPTIONIST' && (
                            <button className="pos-button small" onClick={() => { setSelected(i); setDialog('resolve-issue'); }}>Resolve issue</button>
                          )}
                        </footer>
                      </article>
                    ))}
                    {openHelp.map(h => (
                      <article className="pos-issue-card" key={h.requestId}>
                        <div><b>{tableTitle(h)} needs assistance</b><Badge status={h.status} /></div>
                        <p>{h.message}</p>
                        <footer>
                          <span>{h.assignedWaiterName ? `Assigned to ${h.assignedWaiterName}` : `Requested at ${time(h.createdAt)}`}</span>
                          {h.status === 'PENDING' && (
                            <button className="pos-button small primary" disabled={busy} onClick={() => run(() => api.acceptHelpRequest(h.requestId, currentUser.name), 'Assistance assigned')}>Accept request</button>
                          )}
                        </footer>
                      </article>
                    ))}
                    {!openIssues.length && !openHelp.length && (
                      <section className="pos-panel"><Empty icon={Bell} title="You're all caught up">Customer requests and order issues will appear here.</Empty></section>
                    )}
                  </>
                )}

                {section === 'staff' && (
                  <div className="pos-staff-management">
                    {/* Active outlet context banner */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 12,
                      padding: '12px 16px',
                      background: 'var(--p-card)',
                      border: '1px solid var(--p-border)',
                      borderRadius: 10,
                      marginBottom: 16
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 38,
                          height: 38,
                          borderRadius: 8,
                          background: 'rgba(79, 70, 229, 0.1)',
                          color: '#4f46e5',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 18
                        }}>
                          🏨
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--p-text)' }}>
                            Outlet: {data.restaurant?.name || 'Active Hotel'}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--p-muted)' }}>
                            {data.restaurant?.address || 'Hotel Branch'} · {filteredStaff.length} staff member{filteredStaff.length === 1 ? '' : 's'} assigned
                          </div>
                        </div>
                      </div>
                      {currentUser?.role === 'SUPER_ADMIN' && (
                        <div style={{ fontSize: 11, color: '#4f46e5', fontWeight: 600, background: '#eff6ff', padding: '6px 12px', borderRadius: 8 }}>
                          💡 Tip: To view/add managers for another hotel, switch outlets from the topbar dropdown.
                        </div>
                      )}
                    </div>

                    {/* Role Filter tabs */}
                    <div className="pos-tabs" style={{ marginBottom: 16 }}>
                      {[
                        { id: 'ALL', name: 'All Staff' },
                        { id: 'MANAGER', name: 'Managers (👔)' },
                        { id: 'RECEPTIONIST', name: 'Receptionists (👩‍💼)' },
                        { id: 'KITCHEN', name: 'Kitchen Staff (👨‍🍳)' },
                        { id: 'WAITER', name: 'Waiters (🤵)' },
                      ].map(tab => (
                        <button
                          key={tab.id}
                          className={`pos-tab ${staffRoleFilter === tab.id ? 'active' : ''}`}
                          onClick={() => setStaffRoleFilter(tab.id)}
                        >
                          {tab.name}
                        </button>
                      ))}
                    </div>

                    {/* Staff List Cards / Grid */}
                    {filteredStaff.length === 0 ? (
                      <section className="pos-panel">
                        <Empty icon={Users} title="No staff members found">
                          {query ? 'No staff matched your search query.' : 'No staff profiles created for this hotel yet. Use the buttons above to add managers or staff.'}
                        </Empty>
                      </section>
                    ) : (
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                        gap: 16
                      }}>
                        {filteredStaff.map(member => {
                          const isSelf = member.userId === currentUser?.userId;
                          const roleBadgeConfig = {
                            SUPER_ADMIN: { bg: '#fef3c7', text: '#92400e', emoji: '🛡️', label: 'Super Admin' },
                            MANAGER: { bg: '#ede9fe', text: '#5b21b6', emoji: '👔', label: 'Hotel Manager' },
                            RECEPTIONIST: { bg: '#e0f2fe', text: '#0369a1', emoji: '👩‍💼', label: 'Receptionist' },
                            KITCHEN: { bg: '#fef2f2', text: '#b91c1c', emoji: '👨‍🍳', label: 'Kitchen Chef' },
                            WAITER: { bg: '#ecfdf5', text: '#047857', emoji: '🤵', label: 'Floor Waiter' },
                          }[member.role] || { bg: '#f1f5f9', text: '#475569', emoji: '👤', label: member.role };

                          const isActive = member.status === 'ACTIVE';

                          return (
                            <div
                              key={member.userId}
                              style={{
                                background: 'var(--p-card)',
                                border: '1px solid var(--p-border)',
                                borderRadius: 12,
                                padding: 18,
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'space-between',
                                transition: 'all 0.15s ease',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                              }}
                            >
                              <div>
                                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <div style={{
                                      width: 44,
                                      height: 44,
                                      borderRadius: 12,
                                      background: roleBadgeConfig.bg,
                                      color: roleBadgeConfig.text,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontSize: 20,
                                      fontWeight: 700
                                    }}>
                                      {roleBadgeConfig.emoji}
                                    </div>
                                    <div>
                                      <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--p-text)' }}>
                                        {member.name} {isSelf && <span style={{ fontSize: 10, color: 'var(--p-muted)', fontWeight: 500 }}>(You)</span>}
                                      </h3>
                                      <p style={{ fontSize: 11, color: 'var(--p-muted)', margin: '2px 0 0 0' }}>
                                        {member.email}
                                      </p>
                                    </div>
                                  </div>
                                  <span style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    padding: '3px 8px',
                                    borderRadius: 6,
                                    background: isActive ? '#dcfce7' : '#fee2e2',
                                    color: isActive ? '#15803d' : '#b91c1c',
                                    textTransform: 'uppercase'
                                  }}>
                                    {member.status || 'ACTIVE'}
                                  </span>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0', flexWrap: 'wrap' }}>
                                  {member.employeeCode && (
                                    <span style={{
                                      fontSize: 11,
                                      fontWeight: 800,
                                      padding: '3px 8px',
                                      borderRadius: 6,
                                      background: '#0f172a',
                                      color: '#38bdf8',
                                      fontFamily: 'monospace',
                                      letterSpacing: '0.5px'
                                    }}>
                                      {member.employeeCode}
                                    </span>
                                  )}
                                  <span style={{
                                    fontSize: 11,
                                    fontWeight: 700,
                                    padding: '3px 8px',
                                    borderRadius: 6,
                                    background: roleBadgeConfig.bg,
                                    color: roleBadgeConfig.text,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4
                                  }}>
                                    {roleBadgeConfig.emoji} {roleBadgeConfig.label}
                                  </span>
                                  {member.phone && (
                                    <span style={{ fontSize: 11, color: 'var(--p-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                      <Phone size={12} /> {member.phone}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div style={{
                                borderTop: '1px solid var(--p-border)',
                                paddingTop: 12,
                                marginTop: 6,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between'
                              }}>
                                <span style={{ fontSize: 10, color: 'var(--p-muted)' }}>
                                  Joined {member.createdAt ? new Date(member.createdAt).toLocaleDateString() : 'N/A'}
                                </span>

                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  {(isSelf || currentUser?.role === 'SUPER_ADMIN' || (currentUser?.role === 'MANAGER' && !['SUPER_ADMIN', 'MANAGER'].includes(member.role))) && (
                                    <button
                                      type="button"
                                      className="pos-button small"
                                      onClick={() => setPasswordTargetUser(member)}
                                      title={`Change password for ${member.name}`}
                                      style={{ height: 26, fontSize: 10, padding: '0 8px', gap: 4 }}
                                    >
                                      <KeyRound size={11} /> Password
                                    </button>
                                  )}
                                  {!isSelf && (currentUser?.role === 'SUPER_ADMIN' || (currentUser?.role === 'MANAGER' && !['SUPER_ADMIN', 'MANAGER'].includes(member.role))) && (
                                    <button
                                      type="button"
                                      className={`pos-button small ${isActive ? 'danger' : 'primary'}`}
                                      disabled={busy}
                                      onClick={() => handleToggleStaffStatus(member)}
                                      style={{ height: 26, fontSize: 10, padding: '0 10px' }}
                                    >
                                      {isActive ? 'Deactivate' : 'Activate'}
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {dialog === 'new-order' && (
          <ErrorBoundary onReset={close}>
            <NewOrder menu={data.menu} categories={data.categories} tables={data.tables} orders={data.orders} paidIds={paidIds} table={selected} restaurant={data.restaurant} onClose={close} onCreated={async order => { close(); addToast(`${order.orderNumber} sent to the kitchen`, 'success'); await load(true); setSelected(order); setDialog('order'); }} />
          </ErrorBoundary>
        )}
        {dialog === 'order' && selected && (
          <ErrorBoundary onReset={close}>
            <OrderDetails order={selected.sessionId ? selected : (data.orders.find(o => o.orderId === selected.orderId) || selected)} paid={selected.isPaid ?? paidIds.has(selected.orderId)} payments={data.payments} restaurant={data.restaurant} onClose={close} onPay={() => pay(selected)} onUpdated={() => load(true)} busy={busy} run={run} />
          </ErrorBoundary>
        )}
        {dialog === 'payment' && selected && (
          <ErrorBoundary onReset={close}>
            <PaymentDialog order={selected.sessionId ? selected : (data.orders.find(o => o.orderId === selected.orderId) || selected)} restaurant={data.restaurant} onClose={close} onPaid={() => load(true)} />
          </ErrorBoundary>
        )}
        {dialog === 'table' && selected && (
          <ErrorBoundary onReset={close}>
            <TableDialog
              restaurant={data.restaurant}
              table={data.tables.find(t => t.tableId === selected.tableId) || selected}
              orders={tableOrders(selected)}
              reservations={data.reservations.filter(r => r.tableId === selected.tableId && ['CONFIRMED', 'ARRIVED', 'SEATED'].includes(r.status))}
              onClose={close}
              busy={busy}
              run={run}
              onOrder={openOrder}
              onNew={() => newOrder(selected)}
              onPay={pay}
              paidIds={paidIds}
              canManage={['SUPER_ADMIN', 'MANAGER'].includes(currentUser?.role)}
              onDeleted={async () => {
                close();
                addToast('Table removed successfully', 'success');
                await load(true);
              }}
            />
          </ErrorBoundary>
        )}
        {dialog === 'add-table' && (
          <ErrorBoundary onReset={close}>
            <AddTableModal
              tables={data.tables}
              onClose={close}
              onCreated={async (newTable) => {
                close();
                addToast(`Table ${newTable.tableNumber} (${newTable.capacity} seats) added`, 'success');
                await load(true);
              }}
            />
          </ErrorBoundary>
        )}
        {dialog === 'reservation' && (
          <ErrorBoundary onReset={close}>
            <ReservationDialog
              reservation={reservationEdit}
              onClose={close}
              onSaved={async (isRescheduled) => {
                addToast(isRescheduled ? 'Reservation rescheduled' : 'Reservation confirmed', 'success');
                await load(true);
                if (!isRescheduled) close();
              }}
            />
          </ErrorBoundary>
        )}
        {dialog === 'cancel-reservation' && selected && (
          <ErrorBoundary onReset={close}>
            <CancelReservationDialog
              reservation={selected}
              onClose={close}
              onCancelled={async () => {
                await load(true);
              }}
            />
          </ErrorBoundary>
        )}
        {dialog === 'resolve-issue' && (
          <ResolveIssue issue={selected} onClose={close} onResolved={async () => { close(); await load(true); }} />
        )}
        {dialog === 'add-manager' && (
          <ErrorBoundary onReset={close}>
            <AddManagerModal
              restaurants={data.allRestaurants.length ? data.allRestaurants : (data.restaurant ? [data.restaurant] : [])}
              defaultRestaurantId={getActiveRestaurantId()}
              onClose={close}
              onSuccess={async (msg) => {
                addToast(msg, 'success');
                await load(true);
              }}
            />
          </ErrorBoundary>
        )}
        {dialog === 'add-staff' && (
          <ErrorBoundary onReset={close}>
            <AddStaffModal
              currentRestaurant={data.restaurant}
              currentUserRole={currentUser?.role}
              restaurants={data.allRestaurants.length ? data.allRestaurants : (data.restaurant ? [data.restaurant] : [])}
              onClose={close}
              onSuccess={async (msg) => {
                addToast(msg, 'success');
                await load(true);
              }}
            />
          </ErrorBoundary>
        )}
        {dialog === 'add-category' && (
          <ErrorBoundary onReset={close}>
            <AddCategoryModal
              onClose={close}
              onSuccess={async () => {
                close();
                await load(true);
              }}
            />
          </ErrorBoundary>
        )}
        {dialog === 'edit-category' && editingCategory && (
          <ErrorBoundary onReset={() => { setEditingCategory(null); close(); }}>
            <EditCategoryModal
              category={editingCategory}
              onClose={() => { setEditingCategory(null); close(); }}
              onSuccess={async () => {
                setEditingCategory(null);
                close();
                await load(true);
              }}
            />
          </ErrorBoundary>
        )}
        {dialog === 'add-menu-item' && (
          <ErrorBoundary onReset={close}>
            <AddMenuItemModal
              categories={data.categories}
              defaultCategoryId={category !== 'ALL' ? category : (data.categories[0]?.categoryId || '')}
              onClose={close}
              onSuccess={async () => {
                close();
                await load(true);
              }}
            />
          </ErrorBoundary>
        )}
        {dialog === 'edit-menu-item' && editingItem && (
          <ErrorBoundary onReset={() => { setEditingItem(null); close(); }}>
            <EditMenuItemModal
              item={editingItem}
              categories={data.categories}
              onClose={() => { setEditingItem(null); close(); }}
              onSuccess={async () => {
                setEditingItem(null);
                close();
                await load(true);
              }}
            />
          </ErrorBoundary>
        )}
        {dialog === 'report-shortage' && (
          <ErrorBoundary onReset={close}>
            <ReportStockShortageModal
              menu={data.menu}
              onClose={close}
              onSuccess={async (msg) => {
                addToast(msg, 'success');
                close();
                await load(true);
              }}
            />
          </ErrorBoundary>
        )}

        {passwordTargetUser && (
          <StaffPasswordModal
            user={passwordTargetUser}
            isSelf={passwordTargetUser.userId === currentUser?.userId}
            currentUser={currentUser}
            onClose={() => setPasswordTargetUser(null)}
            onSuccess={(msg) => {
              setPasswordTargetUser(null);
              addToast(msg, 'success');
            }}
          />
        )}
      </>}
    </PosShell>
  );
}

function AddManagerModal({ restaurants = [], defaultRestaurantId, onClose, onSuccess }) {
  const [form, setForm] = useState({
    restaurantId: defaultRestaurantId || (restaurants[0]?.restaurantId || ''),
    name: '',
    email: '',
    phone: '',
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.restaurantId) {
      setError('Please select a hotel/restaurant.');
      return;
    }
    if (!form.name.trim() || !form.email.trim() || !form.password) {
      setError('Name, email, and password are required.');
      return;
    }
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      await api.createManager({
        restaurantId: form.restaurantId,
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        password: form.password
      });
      const hotel = restaurants.find(r => r.restaurantId === form.restaurantId);
      onSuccess(`Hotel Manager "${form.name}" successfully assigned to ${hotel?.name || 'hotel'}!`);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create hotel manager.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Assign Hotel General Manager" wide={true} onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 16, borderBottom: '1px solid var(--p-border)', marginBottom: 18 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <ShieldCheck size={22} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Hotel Executive Assignment</h3>
            <p style={{ margin: '3px 0 0', fontSize: 11, color: 'var(--p-muted)', lineHeight: 1.4 }}>
              Assign a dedicated General Manager with full operational authority over menus, orders, tables, and staff.
            </p>
          </div>
        </div>

        {error && (
          <div className="pos-error" style={{ marginBottom: 16 }} role="alert">
            <AlertCircle size={15} /> {error}
          </div>
        )}

        <label className="pos-field" style={{ marginBottom: 16 }}>
          <span>Target Hotel / Restaurant Outlet *</span>
          <div style={{ position: 'relative' }}>
            <Building2 size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--p-muted)', pointerEvents: 'none' }} />
            <select
              className="pos-select"
              value={form.restaurantId}
              onChange={e => setForm({ ...form, restaurantId: e.target.value })}
              style={{ width: '100%', height: 40, paddingLeft: 34, fontWeight: 600 }}
              required
            >
              <option value="">Select Hotel Outlet...</option>
              {restaurants.map(r => (
                <option key={r.restaurantId} value={r.restaurantId}>
                  🏨 {r.name} [{r.restaurantCode || 'RST-100'}] {r.address ? `— ${r.address.split(',')[0]}` : ''}
                </option>
              ))}
            </select>
          </div>
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 14 }}>
          <label className="pos-field">
            <span>Manager Full Name *</span>
            <div style={{ position: 'relative' }}>
              <User size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--p-muted)', pointerEvents: 'none' }} />
              <input
                className="pos-input"
                style={{ paddingLeft: 34 }}
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Rohit Mehta"
                required
                maxLength={150}
              />
            </div>
          </label>

          <label className="pos-field">
            <span>Login Email Address *</span>
            <div style={{ position: 'relative' }}>
              <Mail size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--p-muted)', pointerEvents: 'none' }} />
              <input
                type="email"
                className="pos-input"
                style={{ paddingLeft: 34 }}
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                placeholder="e.g. manager@hotel.com"
                required
                maxLength={255}
              />
            </div>
          </label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 18 }}>
          <label className="pos-field">
            <span>Mobile Phone Number <small style={{ color: 'var(--p-muted)' }}>(Optional)</small></span>
            <div style={{ position: 'relative' }}>
              <Phone size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--p-muted)', pointerEvents: 'none' }} />
              <input
                type="tel"
                className="pos-input"
                style={{ paddingLeft: 34 }}
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
                placeholder="+91 98765 43210"
                maxLength={30}
              />
            </div>
          </label>

          <label className="pos-field">
            <span>Initial Password (Min 6 chars) *</span>
            <div style={{ position: 'relative' }}>
              <Lock size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--p-muted)', pointerEvents: 'none' }} />
              <input
                type={showPassword ? 'text' : 'password'}
                className="pos-input"
                style={{ paddingLeft: 34, paddingRight: 36 }}
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                placeholder="Create secure password"
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPassword(p => !p)}
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 0, padding: 4, cursor: 'pointer', color: 'var(--p-muted)', display: 'flex' }}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </label>
        </div>

        <div className="pos-info-box" style={{ marginBottom: 18 }}>
          <Info size={15} />
          <span>The manager will use this email and password to log in. Their access is automatically scoped to this hotel.</span>
        </div>

        <div className="pos-modal-footer" style={{ padding: '16px 0 0', display: 'flex', gap: 10, justifyContent: 'flex-end', borderTop: '1px solid var(--p-border)', marginTop: 20 }}>
          <button type="button" className="pos-button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="submit"
            className="pos-button primary"
            disabled={busy || !form.name.trim() || !form.email.trim() || !form.password}
            style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%)', color: '#fff', border: 0, minWidth: 170, display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            {busy ? <RefreshCw className="pos-spin" size={14} /> : <UserPlus size={15} />}
            {busy ? 'Assigning Manager…' : 'Assign General Manager'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function AddTableModal({ tables = [], onClose, onCreated }) {
  const nextNumber = useMemo(() => {
    return tables.reduce((max, t) => Math.max(max, Number(t.tableNumber) || 0), 0) + 1;
  }, [tables]);

  const [tableNumber, setTableNumber] = useState(nextNumber);
  const [capacity, setCapacity] = useState(4);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const capacityPresets = [2, 4, 6, 8, 10, 12];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!tableNumber || Number(tableNumber) <= 0) {
      setError('Please enter a valid table number.');
      return;
    }
    if (!capacity || Number(capacity) <= 0) {
      setError('Please enter seating capacity.');
      return;
    }

    try {
      setBusy(true);
      setError(null);
      const res = await api.createTable({
        tableNumber: Number(tableNumber),
        capacity: Number(capacity)
      });
      onCreated(res);
    } catch (err) {
      setError(err.message || 'Failed to create table.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Add New Dining Table" onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ padding: '24px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 16px',
          background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.12), rgba(37, 99, 235, 0.06))',
          borderRadius: 12,
          border: '1px solid rgba(59, 130, 246, 0.25)',
          marginBottom: 20
        }}>
          <div style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
            flexShrink: 0
          }}>
            <Armchair size={22} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--p-text)' }}>
              Configure Custom Dining Table
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--p-muted)', lineHeight: 1.4 }}>
              Set custom seating capacity (2-seater, 4-seater, VIP) and table number. A unique QR ordering code will be auto-generated.
            </p>
          </div>
        </div>

        {error && (
          <div className="pos-error" style={{ marginBottom: 16 }} role="alert">
            <AlertCircle size={15} /> {error}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 }}>
          <label className="pos-field">
            <span>Table Number / Identifier *</span>
            <input
              type="number"
              min={1}
              max={999}
              className="pos-input"
              value={tableNumber}
              onChange={e => setTableNumber(e.target.value)}
              placeholder="e.g. 1"
              required
              autoFocus
            />
            <small style={{ fontSize: 11, color: 'var(--p-muted)', marginTop: 4 }}>
              Suggested: Table {nextNumber}
            </small>
          </label>

          <label className="pos-field">
            <span>Custom Seating Capacity (Seats) *</span>
            <input
              type="number"
              min={1}
              max={100}
              className="pos-input"
              value={capacity}
              onChange={e => setCapacity(e.target.value)}
              placeholder="e.g. 4"
              required
            />
            <small style={{ fontSize: 11, color: 'var(--p-muted)', marginTop: 4 }}>
              Number of guests accommodated
            </small>
          </label>
        </div>

        {/* Quick Capacity Presets */}
        <div style={{ marginBottom: 20 }}>
          <span style={{ display: 'block', fontSize: 11, fontWeight: 650, color: 'var(--p-muted)', textTransform: 'uppercase', marginBottom: 8 }}>
            Quick Seating Presets
          </span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {capacityPresets.map(preset => (
              <button
                key={preset}
                type="button"
                className={`pos-button small ${Number(capacity) === preset ? 'primary' : ''}`}
                style={{ borderRadius: 8, padding: '6px 14px', fontSize: 12 }}
                onClick={() => setCapacity(preset)}
              >
                {preset} Seats {preset === 2 ? '👫' : preset === 4 ? '👨‍👩‍👧‍👦' : preset >= 8 ? '🎉' : '🍽️'}
              </button>
            ))}
          </div>
        </div>

        <div className="pos-modal-footer" style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', paddingTop: 16, borderTop: '1px solid var(--p-border)' }}>
          <button type="button" className="pos-button" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="pos-button primary" disabled={busy}>
            {busy ? <RefreshCw size={14} className="pos-spin" /> : <Plus size={14} />}
            {busy ? 'Creating Table…' : 'Add Table & Generate QR'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function AddStaffModal({ currentRestaurant, currentUserRole, restaurants = [], onClose, onSuccess }) {
  const isSuperAdmin = currentUserRole === 'SUPER_ADMIN';
  const [form, setForm] = useState({
    restaurantId: currentRestaurant?.restaurantId || (restaurants[0]?.restaurantId || ''),
    name: '',
    email: '',
    phone: '',
    role: 'WAITER',
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const roleDefinitions = [
    {
      id: 'RECEPTIONIST',
      title: 'Receptionist',
      desc: 'Front desk, table assignment, reservations & customer billing',
      icon: <UserCheck size={18} />
    },
    {
      id: 'KITCHEN',
      title: 'Kitchen Staff',
      desc: 'Live KDS ticket display, order prep & menu availability pass',
      icon: <ChefHat size={18} />
    },
    {
      id: 'WAITER',
      title: 'Floor Waiter',
      desc: 'Dine-in table orders, ready food alerts & customer assistance',
      icon: <HandPlatter size={18} />
    },
    ...(isSuperAdmin ? [{
      id: 'MANAGER',
      title: 'Hotel Manager',
      desc: 'Full operational control over menus, orders, tables & staffing',
      icon: <ShieldCheck size={18} />
    }] : [])
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    const targetRestId = isSuperAdmin ? (form.restaurantId || currentRestaurant?.restaurantId) : currentRestaurant?.restaurantId;

    if (!targetRestId) {
      setError('Restaurant outlet ID is required.');
      return;
    }
    if (!form.name.trim() || !form.email.trim() || !form.password) {
      setError('Name, email, and password are required.');
      return;
    }
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      if (form.role === 'MANAGER' && isSuperAdmin) {
        await api.createManager({
          restaurantId: targetRestId,
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || null,
          password: form.password
        });
        onSuccess(`Manager "${form.name}" successfully created!`);
      } else {
        await api.createStaff({
          restaurantId: targetRestId,
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || null,
          role: form.role,
          password: form.password
        });
        onSuccess(`${form.role.replace('_', ' ')} "${form.name}" successfully created!`);
      }
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create staff member.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Add Team Member" wide={true} onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 16, borderBottom: '1px solid var(--p-border)', marginBottom: 18 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <UserPlus size={22} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>New Staff Credential Setup</h3>
            <p style={{ margin: '3px 0 0', fontSize: 11, color: 'var(--p-muted)', lineHeight: 1.4 }}>
              Create verified station access credentials for front desk, kitchen line, or floor waitstaff.
            </p>
          </div>
        </div>

        {error && (
          <div className="pos-error" style={{ marginBottom: 16 }} role="alert">
            <AlertCircle size={15} /> {error}
          </div>
        )}

        {isSuperAdmin && restaurants.length > 0 ? (
          <label className="pos-field" style={{ marginBottom: 16 }}>
            <span>Target Hotel Outlet *</span>
            <div style={{ position: 'relative' }}>
              <Building2 size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--p-muted)', pointerEvents: 'none' }} />
              <select
                className="pos-select"
                value={form.restaurantId}
                onChange={e => setForm({ ...form, restaurantId: e.target.value })}
                style={{ width: '100%', height: 40, paddingLeft: 34, fontWeight: 600 }}
                required
              >
                {restaurants.map(r => (
                  <option key={r.restaurantId} value={r.restaurantId}>
                    🏨 {r.name} [{r.restaurantCode || 'RST-100'}] {r.address ? `— ${r.address.split(',')[0]}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </label>
        ) : (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 14px',
            background: 'var(--p-elevated)',
            border: '1px solid var(--p-border)',
            borderRadius: 10,
            marginBottom: 16,
            fontSize: 12
          }}>
            <Building2 size={16} style={{ color: 'var(--p-blue)' }} />
            <div>
              <span style={{ color: 'var(--p-muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block' }}>Assigned Hotel Outlet</span>
              <strong>{currentRestaurant?.name || 'Current Restaurant'}</strong>
            </div>
          </div>
        )}

        {/* Interactive Role Cards */}
        <div style={{ marginBottom: 18 }}>
          <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--p-text)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
            Operational Role & Station *
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            {roleDefinitions.map(r => {
              const isSelected = form.role === r.id;
              return (
                <div
                  key={r.id}
                  onClick={() => setForm({ ...form, role: r.id })}
                  style={{
                    border: isSelected ? '2px solid #3b82f6' : '1px solid var(--p-border)',
                    background: isSelected ? 'var(--p-blue-soft)' : 'var(--p-card)',
                    borderRadius: 10,
                    padding: '12px 14px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: isSelected ? '#3b82f6' : 'var(--p-elevated)',
                        color: isSelected ? '#ffffff' : 'var(--p-text)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.15s ease'
                      }}>
                        {r.icon}
                      </div>
                      <strong style={{ fontSize: 13, fontWeight: 700 }}>{r.title}</strong>
                    </div>
                    {isSelected && <CheckCircle2 size={16} style={{ color: '#3b82f6' }} />}
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--p-muted)', lineHeight: 1.4 }}>
                    {r.desc}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Credentials Form */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 14 }}>
          <label className="pos-field">
            <span>Staff Member Name *</span>
            <div style={{ position: 'relative' }}>
              <User size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--p-muted)', pointerEvents: 'none' }} />
              <input
                className="pos-input"
                style={{ paddingLeft: 34 }}
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Kunal Sharma"
                required
                maxLength={150}
              />
            </div>
          </label>

          <label className="pos-field">
            <span>Login Email Address *</span>
            <div style={{ position: 'relative' }}>
              <Mail size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--p-muted)', pointerEvents: 'none' }} />
              <input
                type="email"
                className="pos-input"
                style={{ paddingLeft: 34 }}
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                placeholder="e.g. waiter.kunal@hotel.com"
                required
                maxLength={255}
              />
            </div>
          </label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 18 }}>
          <label className="pos-field">
            <span>Phone Number <small style={{ color: 'var(--p-muted)' }}>(Optional)</small></span>
            <div style={{ position: 'relative' }}>
              <Phone size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--p-muted)', pointerEvents: 'none' }} />
              <input
                type="tel"
                className="pos-input"
                style={{ paddingLeft: 34 }}
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
                placeholder="+91 98765 43210"
                maxLength={30}
              />
            </div>
          </label>

          <label className="pos-field">
            <span>Station Password (Min 6 chars) *</span>
            <div style={{ position: 'relative' }}>
              <Lock size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--p-muted)', pointerEvents: 'none' }} />
              <input
                type={showPassword ? 'text' : 'password'}
                className="pos-input"
                style={{ paddingLeft: 34, paddingRight: 36 }}
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                placeholder="Create station password"
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPassword(p => !p)}
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 0, padding: 4, cursor: 'pointer', color: 'var(--p-muted)', display: 'flex' }}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </label>
        </div>

        <div className="pos-info-box" style={{ marginBottom: 18 }}>
          <Info size={15} />
          <span>Staff members sign in at <b>/login</b> using their email and password. Portal routes are automatically guarded by role.</span>
        </div>

        <div className="pos-modal-footer" style={{ padding: '16px 0 0', display: 'flex', gap: 10, justifyContent: 'flex-end', borderTop: '1px solid var(--p-border)', marginTop: 20 }}>
          <button type="button" className="pos-button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="submit"
            className="pos-button primary"
            disabled={busy || !form.name.trim() || !form.email.trim() || !form.password}
            style={{ minWidth: 160, display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            {busy ? <RefreshCw className="pos-spin" size={14} /> : <Plus size={15} />}
            {busy ? 'Creating Staff…' : 'Create Staff Member'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function AddCategoryModal({ onClose, onSuccess }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { addToast } = useNotification();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Category name is required.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.createCategory({
        name: name.trim(),
        description: description.trim() || null
      });
      addToast(`Category "${name.trim()}" created successfully.`, 'success');
      if (onSuccess) await onSuccess();
    } catch (err) {
      setError(err.message || 'Failed to create category.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Add Menu Category" onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ padding: '24px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 14px',
          background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(16, 185, 129, 0.05))',
          borderRadius: 10,
          border: '1px solid rgba(59, 130, 246, 0.2)',
          marginBottom: 16
        }}>
          <div style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: 'linear-gradient(135deg, #3b82f6, #0d9488)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            flexShrink: 0
          }}>
            <FolderPlus size={18} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--p-text)' }}>New Menu Classification</div>
            <div style={{ fontSize: 11, color: 'var(--p-muted)', marginTop: 1 }}>
              Organize dishes into sections (e.g. Starters, Main Course, Biryani, Desserts).
            </div>
          </div>
        </div>

        {error && (
          <div className="pos-error" style={{ marginBottom: 16 }}>
            <AlertCircle size={15} /> {error}
          </div>
        )}

        <label className="pos-field" style={{ marginBottom: 14 }}>
          <span>Category Name *</span>
          <input
            className="pos-input"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Starters & Small Bites"
            required
            maxLength={100}
            autoFocus
            style={{ fontWeight: 600 }}
          />
        </label>

        <label className="pos-field" style={{ marginBottom: 14 }}>
          <span>Category Description <small style={{ color: 'var(--p-muted)' }}>(Optional)</small></span>
          <textarea
            className="pos-textarea"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Short highlight for guest digital menu..."
            rows={2}
            maxLength={300}
          />
        </label>

        <div className="pos-modal-footer" style={{ padding: '16px 0 0 0', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" className="pos-button" onClick={onClose} disabled={busy}>Cancel</button>
          <button
            type="submit"
            className="pos-button primary"
            disabled={busy || !name.trim()}
            style={{
              padding: '8px 20px',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)'
            }}
          >
            {busy ? 'Creating…' : <><FolderPlus size={15} /> Create Category</>}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditCategoryModal({ category, onClose, onSuccess }) {
  const [name, setName] = useState(category?.name || '');
  const [description, setDescription] = useState(category?.description || '');
  const [sortOrder, setSortOrder] = useState(category?.sortOrder ?? 0);
  const [status, setStatus] = useState(category?.status || 'ACTIVE');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { addToast } = useNotification();

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Category name is required.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.updateCategory(category.categoryId, {
        name: name.trim(),
        description: description.trim() || null,
        sortOrder: Number(sortOrder) || 0,
        status
      });
      addToast(`Category "${name.trim()}" updated successfully.`, 'success');
      if (onSuccess) await onSuccess();
    } catch (err) {
      setError(err.message || 'Failed to update category.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Are you sure you want to remove the category "${category.name}"? If items exist, it will be deactivated.`)) return;
    setBusy(true);
    setError('');
    try {
      await api.deleteCategory(category.categoryId);
      addToast(`Category "${category.name}" removed.`, 'success');
      if (onSuccess) await onSuccess();
    } catch (err) {
      setError(err.message || 'Failed to delete category.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Edit Category: ${category?.name}`} onClose={onClose}>
      <form onSubmit={handleUpdate} style={{ padding: '24px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 14px',
          background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(147, 51, 234, 0.05))',
          borderRadius: 10,
          border: '1px solid rgba(59, 130, 246, 0.2)',
          marginBottom: 16
        }}>
          <div style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            flexShrink: 0
          }}>
            <Pencil size={17} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--p-text)' }}>Update Category</div>
            <div style={{ fontSize: 11, color: 'var(--p-muted)', marginTop: 1 }}>
              Configure category label, sequence ordering, and visibility.
            </div>
          </div>
        </div>

        {error && (
          <div className="pos-error" style={{ marginBottom: 16 }}>
            <AlertCircle size={15} /> {error}
          </div>
        )}

        <label className="pos-field" style={{ marginBottom: 14 }}>
          <span>Category Name *</span>
          <input
            className="pos-input"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            maxLength={100}
            style={{ fontWeight: 600 }}
          />
        </label>

        <label className="pos-field" style={{ marginBottom: 14 }}>
          <span>Description</span>
          <textarea
            className="pos-textarea"
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
            maxLength={300}
          />
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <label className="pos-field">
            <span>Sort Order</span>
            <input
              type="number"
              className="pos-input"
              value={sortOrder}
              onChange={e => setSortOrder(e.target.value)}
              min={0}
            />
          </label>
          <label className="pos-field">
            <span>Status</span>
            <select
              className="pos-select"
              value={status}
              onChange={e => setStatus(e.target.value)}
            >
              <option value="ACTIVE">Active (Visible)</option>
              <option value="INACTIVE">Inactive (Hidden)</option>
            </select>
          </label>
        </div>

        <div className="pos-modal-footer" style={{ padding: '16px 0 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            type="button"
            className="pos-button danger"
            onClick={handleDelete}
            disabled={busy}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Trash2 size={15} /> Delete Category
          </button>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="pos-button" onClick={onClose} disabled={busy}>Cancel</button>
            <button
              type="submit"
              className="pos-button primary"
              disabled={busy || !name.trim()}
              style={{
                padding: '8px 20px',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)'
              }}
            >
              {busy ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function AddMenuItemModal({ categories = [], defaultCategoryId = '', onClose, onSuccess }) {
  const [form, setForm] = useState({
    categoryId: defaultCategoryId || (categories[0]?.categoryId || ''),
    name: '',
    description: '',
    price: '',
    vegNonveg: 'VEG',
    spiceLevel: 'NONE',
    image: '',
    availability: true,
    isSweet: false
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { addToast } = useNotification();

  const imagePresets = [
    { label: '🍕 Pizza', url: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=400&q=80' },
    { label: '🍔 Burger', url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=400&q=80' },
    { label: '🍛 Curry', url: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=400&q=80' },
    { label: '🍜 Chinese', url: 'https://images.unsplash.com/photo-1585032226651-759b368d7246?auto=format&fit=crop&w=400&q=80' },
    { label: '🥞 Dosa / South', url: 'https://images.unsplash.com/photo-1668236543090-82eba5ee5976?auto=format&fit=crop&w=400&q=80' },
    { label: '🍰 Dessert', url: 'https://images.unsplash.com/photo-1593798603546-b302636a0d0d?auto=format&fit=crop&w=400&q=80' },
    { label: '🍹 Drink', url: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=400&q=80' },
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Dish name is required.');
      return;
    }
    if (!form.categoryId) {
      setError('Please select a menu category.');
      return;
    }
    if (isNaN(Number(form.price)) || Number(form.price) < 0) {
      setError('Please enter a valid price.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      await api.createMenuItem({
        categoryId: form.categoryId,
        name: form.name.trim(),
        description: form.description.trim() || null,
        price: Number(form.price),
        vegNonVeg: form.vegNonveg,
        spiceLevel: form.spiceLevel,
        image: form.image.trim() || null,
        availability: form.availability,
        isSweet: form.isSweet
      });
      addToast(`"${form.name.trim()}" added to the menu!`, 'success');
      if (onSuccess) await onSuccess();
    } catch (err) {
      setError(err.message || 'Failed to add menu item.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Add Dish / Menu Item" wide={true} onClose={onClose}>
      <form onSubmit={handleSubmit} style={{ padding: '24px' }}>
        {/* Executive Header Banner */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(239, 68, 68, 0.06))',
          borderRadius: 12,
          border: '1px solid rgba(245, 158, 11, 0.25)',
          marginBottom: 16
        }}>
          <div style={{
            width: 42,
            height: 42,
            borderRadius: 10,
            background: 'linear-gradient(135deg, #f59e0b, #ea580c)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)',
            flexShrink: 0
          }}>
            <UtensilsCrossed size={22} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--p-text)' }}>New Dish Creation</h3>
            <p style={{ margin: '2px 0 0 0', fontSize: 12, color: 'var(--p-muted)' }}>
              Configure culinary details, pricing, food preferences, and visual assets.
            </p>
          </div>
        </div>

        {error && (
          <div className="pos-error" style={{ marginBottom: 16 }}>
            <AlertCircle size={15} /> {error}
          </div>
        )}

        {/* Dietary Classification Cards */}
        <div style={{ marginBottom: 16 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--p-muted)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Dietary Classification *
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div
              onClick={() => setForm(f => ({ ...f, vegNonveg: 'VEG' }))}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 14px',
                borderRadius: 10,
                cursor: 'pointer',
                border: form.vegNonveg === 'VEG' ? '2px solid #16a34a' : '1px solid var(--p-border)',
                background: form.vegNonveg === 'VEG' ? 'rgba(22, 163, 74, 0.08)' : 'var(--p-card)',
                transition: 'all 0.2s ease',
                boxShadow: form.vegNonveg === 'VEG' ? '0 0 0 1px #16a34a' : 'none'
              }}
            >
              <div style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                border: '2px solid #16a34a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#fff',
                flexShrink: 0
              }}>
                <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#16a34a' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: form.vegNonveg === 'VEG' ? '#16a34a' : 'var(--p-text)' }}>
                  100% Pure Vegetarian
                </div>
                <div style={{ fontSize: 11, color: 'var(--p-muted)', marginTop: 1 }}>
                  Plant, dairy & green label ingredients
                </div>
              </div>
              {form.vegNonveg === 'VEG' && <CheckCircle2 size={18} color="#16a34a" />}
            </div>

            <div
              onClick={() => setForm(f => ({ ...f, vegNonveg: 'NON_VEG' }))}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 14px',
                borderRadius: 10,
                cursor: 'pointer',
                border: form.vegNonveg === 'NON_VEG' ? '2px solid #dc2626' : '1px solid var(--p-border)',
                background: form.vegNonveg === 'NON_VEG' ? 'rgba(220, 38, 38, 0.08)' : 'var(--p-card)',
                transition: 'all 0.2s ease',
                boxShadow: form.vegNonveg === 'NON_VEG' ? '0 0 0 1px #dc2626' : 'none'
              }}
            >
              <div style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                border: '2px solid #dc2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#fff',
                flexShrink: 0
              }}>
                <div style={{
                  width: 0,
                  height: 0,
                  borderLeft: '7px solid transparent',
                  borderRight: '7px solid transparent',
                  borderBottom: '12px solid #dc2626'
                }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: form.vegNonveg === 'NON_VEG' ? '#dc2626' : 'var(--p-text)' }}>
                  Non-Vegetarian
                </div>
                <div style={{ fontSize: 11, color: 'var(--p-muted)', marginTop: 1 }}>
                  Poultry, meat, fish or egg recipes
                </div>
              </div>
              {form.vegNonveg === 'NON_VEG' && <CheckCircle2 size={18} color="#dc2626" />}
            </div>
          </div>
        </div>

        {/* Dish Name & Category Row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14, marginBottom: 14 }}>
          <label className="pos-field">
            <span>Dish Name *</span>
            <input
              className="pos-input"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Paneer Butter Masala / Truffle Pasta"
              required
              maxLength={255}
              style={{ fontWeight: 600 }}
            />
          </label>
          <label className="pos-field">
            <span>Menu Category *</span>
            <select
              className="pos-select"
              value={form.categoryId}
              onChange={e => setForm({ ...form, categoryId: e.target.value })}
              required
              style={{ fontWeight: 600 }}
            >
              <option value="">Select Category...</option>
              {categories.map(c => (
                <option key={c.categoryId} value={c.categoryId}>{c.name}</option>
              ))}
            </select>
          </label>
        </div>

        {/* Price & Spice Profile */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <label className="pos-field">
            <span>Selling Price (₹) *</span>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <span style={{
                position: 'absolute',
                left: 12,
                fontWeight: 700,
                fontSize: 15,
                color: 'var(--p-muted)',
                pointerEvents: 'none'
              }}>₹</span>
              <input
                type="number"
                step="0.01"
                min="0"
                className="pos-input"
                style={{ paddingLeft: 28, fontSize: 15, fontWeight: 700 }}
                value={form.price}
                onChange={e => setForm({ ...form, price: e.target.value })}
                placeholder="299.00"
                required
              />
            </div>
          </label>

          <label className="pos-field">
            <span>Spice Profile</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 2 }}>
              {[
                { id: 'NONE', label: 'None', icon: '🌱' },
                { id: 'MILD', label: 'Mild', icon: '🌶️' },
                { id: 'MEDIUM', label: 'Medium', icon: '🌶️🌶️' },
                { id: 'SPICY', label: 'Hot', icon: '🔥' }
              ].map(sp => {
                const isSelected = form.spiceLevel === sp.id;
                return (
                  <button
                    key={sp.id}
                    type="button"
                    onClick={() => setForm({ ...form, spiceLevel: sp.id })}
                    style={{
                      padding: '8px 4px',
                      borderRadius: 8,
                      border: isSelected ? '1.5px solid var(--p-blue)' : '1px solid var(--p-border)',
                      background: isSelected ? 'rgba(59, 130, 246, 0.12)' : 'var(--p-elevated)',
                      color: isSelected ? 'var(--p-blue)' : 'var(--p-text)',
                      fontWeight: isSelected ? 700 : 500,
                      fontSize: 11,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 2,
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <span style={{ fontSize: 13 }}>{sp.icon}</span>
                    <span>{sp.label}</span>
                  </button>
                );
              })}
            </div>
          </label>
        </div>

        {/* Description */}
        <label className="pos-field" style={{ marginBottom: 14 }}>
          <span>Dish Description <small style={{ color: 'var(--p-muted)' }}>(Ingredients, portion size, flavors)</small></span>
          <textarea
            className="pos-textarea"
            value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
            placeholder="e.g. Tender cottage cheese cubes simmered in a velvety tomato and cashew gravy, garnished with rich butter cream."
            rows={2}
            maxLength={500}
          />
        </label>

        {/* Photo Asset with Live Preview, Upload & Quick Presets */}
        <MenuImageField
          value={form.image}
          onChange={image => setForm({ ...form, image })}
          presets={imagePresets}
        />

        {/* Operational Availability Toggles */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 14px',
            borderRadius: 8,
            border: '1px solid var(--p-border)',
            background: form.availability ? 'rgba(22, 163, 74, 0.08)' : 'var(--p-card)',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}>
            <input
              type="checkbox"
              checked={form.availability}
              onChange={e => setForm({ ...form, availability: e.target.checked })}
              style={{ width: 16, height: 16, accentColor: '#16a34a' }}
            />
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: form.availability ? '#16a34a' : 'var(--p-text)' }}>
                Available Immediately
              </div>
              <div style={{ fontSize: 10, color: 'var(--p-muted)' }}>Visible across POS and Guest QR Menus</div>
            </div>
          </label>

          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 14px',
            borderRadius: 8,
            border: '1px solid var(--p-border)',
            background: form.isSweet ? 'rgba(236, 72, 153, 0.08)' : 'var(--p-card)',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}>
            <input
              type="checkbox"
              checked={form.isSweet}
              onChange={e => setForm({ ...form, isSweet: e.target.checked })}
              style={{ width: 16, height: 16, accentColor: '#ec4899' }}
            />
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: form.isSweet ? '#ec4899' : 'var(--p-text)' }}>
                Sweet / Dessert Course
              </div>
              <div style={{ fontSize: 10, color: 'var(--p-muted)' }}>Classified under sweets & confectionery</div>
            </div>
          </label>
        </div>

        {/* Modal Action Footer */}
        <div className="pos-modal-footer" style={{ padding: '16px 0 0 0', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" className="pos-button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="submit"
            className="pos-button primary"
            disabled={busy || !form.name.trim() || !form.price || !form.categoryId}
            style={{
              padding: '9px 22px',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.35)'
            }}
          >
            {busy ? (
              <>Creating Dish…</>
            ) : (
              <>
                <Plus size={16} /> Add Dish to Menu
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EditMenuItemModal({ item, categories = [], onClose, onSuccess }) {
  const [form, setForm] = useState({
    categoryId: item.categoryId || (categories[0]?.categoryId || ''),
    name: item.name || '',
    description: item.description || '',
    price: item.price ?? '',
    vegNonveg: item.vegNonveg || item.vegNonVeg || 'VEG',
    spiceLevel: item.spiceLevel || 'NONE',
    image: item.image || '',
    availability: item.availability ?? true,
    isSweet: item.isSweet ?? false
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { addToast } = useNotification();

  const imagePresets = [
    { label: '🍕 Pizza', url: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=400&q=80' },
    { label: '🍔 Burger', url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=400&q=80' },
    { label: '🍛 Curry', url: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=400&q=80' },
    { label: '🍜 Chinese', url: 'https://images.unsplash.com/photo-1585032226651-759b368d7246?auto=format&fit=crop&w=400&q=80' },
    { label: '🥞 Dosa / South', url: 'https://images.unsplash.com/photo-1668236543090-82eba5ee5976?auto=format&fit=crop&w=400&q=80' },
    { label: '🍰 Dessert', url: 'https://images.unsplash.com/photo-1593798603546-b302636a0d0d?auto=format&fit=crop&w=400&q=80' },
    { label: '🍹 Drink', url: 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=400&q=80' },
  ];

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Dish name is required.');
      return;
    }
    if (isNaN(Number(form.price)) || Number(form.price) < 0) {
      setError('Please enter a valid price.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      await api.updateMenuItem(item.menuItemId, {
        categoryId: form.categoryId,
        name: form.name.trim(),
        description: form.description.trim() || null,
        price: Number(form.price),
        vegNonVeg: form.vegNonveg,
        spiceLevel: form.spiceLevel,
        image: form.image.trim() || null,
        availability: form.availability,
        isSweet: form.isSweet
      });
      addToast(`"${form.name.trim()}" updated successfully!`, 'success');
      if (onSuccess) await onSuccess();
    } catch (err) {
      setError(err.message || 'Failed to update menu item.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete "${item.name}" from the menu?`)) return;
    setBusy(true);
    setError('');
    try {
      await api.deleteMenuItem(item.menuItemId);
      addToast(`"${item.name}" removed from the menu.`, 'success');
      if (onSuccess) await onSuccess();
    } catch (err) {
      setError(err.message || 'Failed to delete menu item.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Edit Dish: ${item.name}`} wide={true} onClose={onClose}>
      <form onSubmit={handleUpdate} style={{ padding: '24px' }}>
        {/* Executive Header Banner */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.12), rgba(147, 51, 234, 0.06))',
          borderRadius: 12,
          border: '1px solid rgba(59, 130, 246, 0.25)',
          marginBottom: 16
        }}>
          <div style={{
            width: 42,
            height: 42,
            borderRadius: 10,
            background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
            flexShrink: 0
          }}>
            <Pencil size={20} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--p-text)' }}>Update Dish Details</h3>
            <p style={{ margin: '2px 0 0 0', fontSize: 12, color: 'var(--p-muted)' }}>
              Edit menu information, category placement, pricing, and guest visibility.
            </p>
          </div>
        </div>

        {error && (
          <div className="pos-error" style={{ marginBottom: 16 }}>
            <AlertCircle size={15} /> {error}
          </div>
        )}

        {/* Dietary Classification Cards */}
        <div style={{ marginBottom: 16 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--p-muted)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Dietary Classification *
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div
              onClick={() => setForm(f => ({ ...f, vegNonveg: 'VEG' }))}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 14px',
                borderRadius: 10,
                cursor: 'pointer',
                border: form.vegNonveg === 'VEG' ? '2px solid #16a34a' : '1px solid var(--p-border)',
                background: form.vegNonveg === 'VEG' ? 'rgba(220, 252, 231, 0.4)' : 'var(--p-card)',
                transition: 'all 0.2s ease',
                boxShadow: form.vegNonveg === 'VEG' ? '0 0 0 1px #16a34a' : 'none'
              }}
            >
              <div style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                border: '2px solid #16a34a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#fff',
                flexShrink: 0
              }}>
                <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#16a34a' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: form.vegNonveg === 'VEG' ? '#16a34a' : 'var(--p-text)' }}>
                  100% Pure Vegetarian
                </div>
                <div style={{ fontSize: 11, color: 'var(--p-muted)', marginTop: 1 }}>
                  Plant, dairy & green label ingredients
                </div>
              </div>
              {form.vegNonveg === 'VEG' && <CheckCircle2 size={18} color="#16a34a" />}
            </div>

            <div
              onClick={() => setForm(f => ({ ...f, vegNonveg: 'NON_VEG' }))}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 14px',
                borderRadius: 10,
                cursor: 'pointer',
                border: form.vegNonveg === 'NON_VEG' ? '2px solid #dc2626' : '1px solid var(--p-border)',
                background: form.vegNonveg === 'NON_VEG' ? 'rgba(254, 226, 226, 0.4)' : 'var(--p-card)',
                transition: 'all 0.2s ease',
                boxShadow: form.vegNonveg === 'NON_VEG' ? '0 0 0 1px #dc2626' : 'none'
              }}
            >
              <div style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                border: '2px solid #dc2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#fff',
                flexShrink: 0
              }}>
                <div style={{
                  width: 0,
                  height: 0,
                  borderLeft: '7px solid transparent',
                  borderRight: '7px solid transparent',
                  borderBottom: '12px solid #dc2626'
                }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: form.vegNonveg === 'NON_VEG' ? '#dc2626' : 'var(--p-text)' }}>
                  Non-Vegetarian
                </div>
                <div style={{ fontSize: 11, color: 'var(--p-muted)', marginTop: 1 }}>
                  Poultry, meat, fish or egg recipes
                </div>
              </div>
              {form.vegNonveg === 'NON_VEG' && <CheckCircle2 size={18} color="#dc2626" />}
            </div>
          </div>
        </div>

        {/* Dish Name & Category Row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14, marginBottom: 14 }}>
          <label className="pos-field">
            <span>Dish Name *</span>
            <input
              className="pos-input"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              required
              maxLength={255}
              style={{ fontWeight: 600 }}
            />
          </label>
          <label className="pos-field">
            <span>Menu Category *</span>
            <select
              className="pos-select"
              value={form.categoryId}
              onChange={e => setForm({ ...form, categoryId: e.target.value })}
              required
              style={{ fontWeight: 600 }}
            >
              {categories.map(c => (
                <option key={c.categoryId} value={c.categoryId}>{c.name}</option>
              ))}
            </select>
          </label>
        </div>

        {/* Price & Spice Profile */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <label className="pos-field">
            <span>Selling Price (₹) *</span>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <span style={{
                position: 'absolute',
                left: 12,
                fontWeight: 700,
                fontSize: 15,
                color: 'var(--p-muted)',
                pointerEvents: 'none'
              }}>₹</span>
              <input
                type="number"
                step="0.01"
                min="0"
                className="pos-input"
                style={{ paddingLeft: 28, fontSize: 15, fontWeight: 700 }}
                value={form.price}
                onChange={e => setForm({ ...form, price: e.target.value })}
                required
              />
            </div>
          </label>

          <label className="pos-field">
            <span>Spice Profile</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 2 }}>
              {[
                { id: 'NONE', label: 'None', icon: '🌱' },
                { id: 'MILD', label: 'Mild', icon: '🌶️' },
                { id: 'MEDIUM', label: 'Medium', icon: '🌶️🌶️' },
                { id: 'SPICY', label: 'Hot', icon: '🔥' }
              ].map(sp => {
                const isSelected = form.spiceLevel === sp.id;
                return (
                  <button
                    key={sp.id}
                    type="button"
                    onClick={() => setForm({ ...form, spiceLevel: sp.id })}
                    style={{
                      padding: '8px 4px',
                      borderRadius: 8,
                      border: isSelected ? '1.5px solid var(--p-blue)' : '1px solid var(--p-border)',
                      background: isSelected ? 'rgba(59, 130, 246, 0.12)' : 'var(--p-elevated)',
                      color: isSelected ? 'var(--p-blue)' : 'var(--p-text)',
                      fontWeight: isSelected ? 700 : 500,
                      fontSize: 11,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 2,
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <span style={{ fontSize: 13 }}>{sp.icon}</span>
                    <span>{sp.label}</span>
                  </button>
                );
              })}
            </div>
          </label>
        </div>

        {/* Description */}
        <label className="pos-field" style={{ marginBottom: 14 }}>
          <span>Dish Description <small style={{ color: 'var(--p-muted)' }}>(Ingredients, portion size, flavors)</small></span>
          <textarea
            className="pos-textarea"
            value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
            rows={2}
            maxLength={500}
          />
        </label>

        {/* Photo Asset with Live Preview, Upload & Quick Presets */}
        <MenuImageField
          value={form.image}
          onChange={image => setForm({ ...form, image })}
          presets={imagePresets}
        />

        {/* Operational Availability Toggles */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 14px',
            borderRadius: 8,
            border: '1px solid var(--p-border)',
            background: form.availability ? 'rgba(22, 163, 74, 0.08)' : 'var(--p-card)',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}>
            <input
              type="checkbox"
              checked={form.availability}
              onChange={e => setForm({ ...form, availability: e.target.checked })}
              style={{ width: 16, height: 16, accentColor: '#16a34a' }}
            />
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: form.availability ? '#16a34a' : 'var(--p-text)' }}>
                Available for Ordering
              </div>
              <div style={{ fontSize: 10, color: 'var(--p-muted)' }}>Visible across POS and Guest QR Menus</div>
            </div>
          </label>

          <label style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '10px 14px',
            borderRadius: 8,
            border: '1px solid var(--p-border)',
            background: form.isSweet ? 'rgba(236, 72, 153, 0.08)' : 'var(--p-card)',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}>
            <input
              type="checkbox"
              checked={form.isSweet}
              onChange={e => setForm({ ...form, isSweet: e.target.checked })}
              style={{ width: 16, height: 16, accentColor: '#ec4899' }}
            />
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: form.isSweet ? '#ec4899' : 'var(--p-text)' }}>
                Sweet / Dessert Course
              </div>
              <div style={{ fontSize: 10, color: 'var(--p-muted)' }}>Classified under sweets & confectionery</div>
            </div>
          </label>
        </div>

        {/* Modal Action Footer */}
        <div className="pos-modal-footer" style={{ padding: '16px 0 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            type="button"
            className="pos-button danger"
            onClick={handleDelete}
            disabled={busy}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Trash2 size={15} /> Delete Dish
          </button>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="pos-button" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button
              type="submit"
              className="pos-button primary"
              disabled={busy || !form.name.trim() || !form.price}
              style={{
                padding: '9px 22px',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.35)'
              }}
            >
              {busy ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function NewOrder({ menu = [], categories = [], tables = [], orders = [], paidIds = new Set(), table, restaurant, onClose, onCreated }) {
  const safeMenu = Array.isArray(menu) ? menu : [];
  const safeCategories = Array.isArray(categories) ? categories : [];
  const safeTables = Array.isArray(tables) ? tables : [];
  const [source, setSource] = useState('DINE_IN_QR');
  const [tableId, setTableId] = useState(table?.tableId || '');
  const [name, setName] = useState(''); const [phone, setPhone] = useState('');
  const [items, setItems] = useState([]); const [category, setCategory] = useState('ALL');
  const [search, setSearch] = useState(''); const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [custom, setCustom] = useState(null); const [options, setOptions] = useState({}); const [addOns, setAddOns] = useState([]); const [itemNote, setItemNote] = useState('');
  const [key] = useState(() => uniqueKey());
  const taxRate = restaurant?.settings?.taxRate ?? .05;
  const subtotal = items.reduce((n, i) => n + (Number(i.price) || 0) * (Number(i.quantity) || 1), 0); const tax = Math.round(subtotal * taxRate * 100) / 100;

  const activeTableOrder = useMemo(() => {
    if (source !== 'DINE_IN_QR' || !tableId) return null;
    return (orders || []).find(o =>
      o.tableId === tableId &&
      !['CANCELLED', 'CONFIRMATION_TIMEOUT'].includes(o.status) &&
      !paidIds?.has(o.orderId)
    );
  }, [source, tableId, orders, paidIds]);

  useEffect(() => {
    if (activeTableOrder) {
      if (activeTableOrder.customerName && activeTableOrder.customerName !== 'Guest') {
        setName(activeTableOrder.customerName);
      }
      if (activeTableOrder.customerPhone) {
        setPhone(activeTableOrder.customerPhone);
      }
    }
  }, [activeTableOrder]);

  const pick = m => { if (m?.customizationOptions?.length || m?.addOns?.length) { setCustom(m); setOptions(Object.fromEntries((m.customizationOptions || []).map(o => [o.name, o.choices?.[0] || '']))); setAddOns([]); setItemNote(''); } else add(m); };
  const add = (m, customization = {}, extra = [], specialInstruction = '') => { if (!m) return; const cost = (Number(m.price) || 0) + (Array.isArray(extra) ? extra : []).reduce((s, a) => s + (Number(a.price) || 0), 0) + Object.values(customization || {}).reduce((s, v) => s + (Number(String(v).match(/\(\+₹(\d+)\)/)?.[1]) || 0), 0); const itemKey = JSON.stringify([m.menuItemId, customization, (extra || []).map(a => a.name), specialInstruction]); setItems(prev => { const found = prev.find(i => i.itemKey === itemKey); return found ? prev.map(i => i.itemKey === itemKey ? { ...i, quantity: i.quantity + 1 } : i) : [...prev, { ...m, itemKey, quantity: 1, price: cost, customization, addOns: extra, specialInstruction }]; }); setCustom(null); };
  const qty = (id, n) => setItems(prev => prev.map(i => i.itemKey === id ? { ...i, quantity: i.quantity + n } : i).filter(i => i.quantity > 0));
  const submit = async () => {
    setError('');
    if (source === 'DINE_IN_QR' && !tableId) return setError('Select a table for this order.');
    if (!items.length) return setError('Add at least one menu item.');
    if (source === 'DINE_IN_QR' && !activeTableOrder) {
      if (!name.trim()) return setError('Please enter customer name to seat this table.');
      const cleanPhone = phone.replace(/\D/g, '');
      if (cleanPhone.length < 10) return setError('Please enter a valid 10-digit mobile number for this table.');
    }
    setBusy(true);
    try {
      const result = await api.createOrder({
        source,
        tableId: source === 'DINE_IN_QR' ? tableId : null,
        customerName: name.trim() || null,
        customerPhone: phone.replace(/\D/g, '') || null,
        items,
        specialInstructions: note,
        idempotencyKey: key
      });
      await onCreated(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return <Modal wide title="Create new order" onClose={onClose}><div className="pos-new-order-bar"><div className="pos-segment">{[['DINE_IN_QR', 'Dine in'], ['TAKEAWAY', 'Takeaway']].map(([s, title]) => <button key={s} className={source === s ? 'active' : ''} onClick={() => setSource(s)}>{s === 'DINE_IN_QR' ? <UtensilsCrossed size={12} style={{ display: 'inline', marginRight: 5 }} /> : <ShoppingBag size={12} style={{ display: 'inline', marginRight: 5 }} />}{title}</button>)}</div><span className="pos-step-label">01 Select items <span style={{ margin: '0 10px' }}>→</span> 02 Send to kitchen</span></div>{error && <div className="pos-error" style={{ margin: '12px 15px 0' }} role="alert"><AlertCircle size={15} />{error}</div>}{activeTableOrder && <div className="pos-info-box" style={{ margin: '12px 15px 0', background: 'var(--p-blue-soft)', borderColor: 'var(--p-blue)' }}><Info size={15} /><span><strong>Table is currently seated with {activeTableOrder.customerName || 'Guest'}.</strong> Additional items will be added to running Order #{activeTableOrder.orderNumber} (Running Bill: {money(activeTableOrder.total)}).</span></div>}<div className="pos-new-order-layout"><div className="pos-new-menu"><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}><strong style={{ fontSize: 12 }}>Menu list</strong><SearchField value={search} onChange={setSearch} placeholder="Search menu…" /></div><div className="pos-tabs">{[{ categoryId: 'ALL', name: 'All items' }, ...safeCategories].map(c => <button key={c.categoryId} className={`pos-tab ${category === c.categoryId ? 'active' : ''}`} onClick={() => setCategory(c.categoryId)}>{c.name}</button>)}</div><div className="pos-menu-grid">{safeMenu.filter(m => (category === 'ALL' || m.categoryId === category) && String(m.name || '').toLowerCase().includes(String(search || '').toLowerCase())).map(m => <article className="pos-menu-card" key={m.menuItemId}><div className="pos-menu-image"><FoodImage item={m} /><Badge status={m.availability ? 'AVAILABLE' : 'UNAVAILABLE'}>{m.availability ? (m.categoryName || 'Available') : 'Sold out'}</Badge></div><h3><span className={`pos-food-type ${m.vegNonveg === 'VEG' ? '' : 'nonveg'}`} />{m.name}</h3><p>{m.description}</p><div className="pos-menu-card-bottom"><strong>{money(m.price)}</strong><button className="pos-button small" disabled={!m.availability} onClick={() => pick(m)}>Add to cart <Plus size={10} /></button></div></article>)}</div></div><div className="pos-new-cart"><div className="pos-new-cart-header"><strong>{custom ? 'Customize item' : 'Order details'}</strong>{custom ? <button className="pos-icon-button" onClick={() => setCustom(null)} aria-label="Back to order"><ArrowLeft size={15} /></button> : <span className="pos-count">{items.reduce((n, i) => n + (Number(i.quantity) || 0), 0)} items</span>}</div>{custom ? <><div className="pos-new-cart-items"><FoodImage item={custom} className="pos-custom-photo" /><h3 style={{ fontWeight: 650, margin: '12px 0' }}>{custom.name}</h3>{custom.customizationOptions?.map(o => <label key={o.name} className="pos-field" style={{ marginBottom: 15 }}><span>{o.name}</span><select className="pos-select" style={{ width: '100%' }} value={options[o.name]} onChange={e => setOptions({ ...options, [o.name]: e.target.value })}>{(o.choices || []).map(c => <option key={c}>{c}</option>)}</select></label>)}{!!custom.addOns?.length && <div className="pos-field" style={{ marginBottom: 15 }}><span>Add something extra</span>{custom.addOns.map(a => <label key={a.name} style={{ display: 'flex', gap: 7, fontSize: 10, padding: '6px 0' }}><input type="checkbox" checked={addOns.some(x => x.name === a.name)} onChange={e => setAddOns(e.target.checked ? [...addOns, a] : addOns.filter(x => x.name !== a.name))} />{a.name}<span style={{ marginLeft: 'auto' }}>{money(a.price)}</span></label>)}</div>}<label className="pos-field"><span>Special instructions</span><textarea className="pos-textarea" value={itemNote} maxLength={500} onChange={e => setItemNote(e.target.value)} placeholder="Less spicy, sauce on the side…" /></label></div><div className="pos-cart-totals"><button className="pos-button primary full" onClick={() => add(custom, options, addOns, itemNote)}><Plus /> Add to order</button></div></> : <><div className="pos-new-cart-info">{source === 'DINE_IN_QR' && <label className="pos-field"><span>Table</span><select className="pos-select" value={tableId} onChange={e => setTableId(e.target.value)} style={{ width: '100%' }}><option value="">Select table</option>{safeTables.filter(t => !['OUT_OF_SERVICE', 'WAITING_FOR_CLEANING', 'CLEANING'].includes(t.status)).map(t => <option key={t.tableId} value={t.tableId}>{tableLabel(t)} · {t.capacity} people · {label(t.status)}</option>)}</select></label>}<input className="pos-input" value={name} maxLength={255} onChange={e => setName(e.target.value)} placeholder={source === 'DINE_IN_QR' ? (activeTableOrder ? `Customer: ${activeTableOrder.customerName || 'Guest'}` : 'Customer name (Required to seat table)') : 'Customer name (optional)'} aria-label="Customer name" required={source === 'DINE_IN_QR' && !activeTableOrder} /><input className="pos-input" value={phone} maxLength={30} onChange={e => setPhone(e.target.value)} placeholder={source === 'DINE_IN_QR' ? (activeTableOrder ? `Mobile: ${activeTableOrder.customerPhone || 'N/A'}` : '10-digit mobile number (Required)') : 'Phone (optional)'} type="tel" aria-label="Customer phone" required={source === 'DINE_IN_QR' && !activeTableOrder} /></div><div className="pos-new-cart-items">{items.length ? items.map(i => <div className="pos-new-cart-item" key={i.itemKey}><FoodImage item={i} /><div><b>{i.name}</b>{Object.keys(i.customization || {}).length > 0 && <small style={{ display: 'block', color: 'var(--p-muted)', fontSize: 8, marginBottom: 4 }}>{Object.values(i.customization).join(', ')}</small>}<small>{money(i.price * i.quantity)}</small></div><div className="pos-qty"><button aria-label={`Remove one ${i.name}`} onClick={() => qty(i.itemKey, -1)}><Minus size={11} /></button><span>{i.quantity}</span><button aria-label={`Add one ${i.name}`} onClick={() => qty(i.itemKey, 1)}><Plus size={11} /></button></div></div>) : <Empty icon={ShoppingBag} title="Start with something delicious">Select items from the menu to build this order.</Empty>}<textarea className="pos-textarea" value={note} onChange={e => setNote(e.target.value)} placeholder="Order notes for the kitchen…" aria-label="Order notes" maxLength={1000} style={{ minHeight: 55, marginTop: 12 }} /></div><div className="pos-cart-totals"><div><span>Subtotal</span><span>{money(subtotal)}</span></div><div><span>Tax ({taxRate * 100}%)</span><span>{money(tax)}</span></div><div className="total"><b>Total payment</b><strong>{money(subtotal + tax)}</strong></div><button className="pos-button primary full" disabled={busy || !items.length} onClick={submit}>{busy ? <RefreshCw className="pos-spin" /> : <ClipboardCheck />}{busy ? 'Sending order…' : activeTableOrder ? 'Add items to running bill & send to kitchen' : 'Create order & send to kitchen'}</button><p style={{ fontSize: 8, color: 'var(--p-muted)', textAlign: 'center', marginTop: 9 }}>Final prices are confirmed by the restaurant.</p></div></>}</div></div></Modal>;
}

function OrderDetails({ order, paid, payments, restaurant, onClose, onPay, onUpdated, run, busy }) {
  const isSession = Boolean(order?.orders && order.orders.length > 0);
  const transition = async status => {
    const targetOrderId = order.orderId || order.orders?.[0]?.orderId;
    if (targetOrderId && await run(() => api.updateOrderStatus(targetOrderId, status), `Order ${label(status).toLowerCase()}`)) {
      onUpdated();
    }
  };

  const handleDeleteOrder = async () => {
    const targetId = order.orderId || order.orderNumber || order.orders?.[0]?.orderId;
    if (!window.confirm(`Permanently remove order ${order.orderNumber || order.sessionId}?`)) return;
    const ok = await run(() => api.deleteOrder(targetId), `Order removed`);
    if (ok) {
      onClose();
      onUpdated();
    }
  };
  const items = order?.items || [];
  return (
    <Modal title={isSession ? `Session Details – ${order.tableName || 'Table'}` : "Order details"} onClose={onClose}>
      <div className="pos-modal-body">
        <div className="pos-detail-heading">
          <strong>{order?.sessionId || order?.orderNumber}</strong>
          <Badge status={order?.status} />
        </div>
        <div className="pos-detail-meta">
          <div>
            <span>Order type</span>
            <b>{SOURCES[order?.source] || (order?.tableId ? 'Dine in' : 'Order')}{order?.tableName ? ` · ${order.tableName}` : order?.tableNumber ? ` · ${tableTitle(order)}` : ''}</b>
          </div>
          <div>
            <span>Placed at</span>
            <b>{time(order?.startedAt || order?.createdAt)} · {new Date(order?.startedAt || order?.createdAt || Date.now()).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</b>
          </div>
          <div>
            <span>Customer</span>
            <b>{order?.customerName || 'Guest'}{order?.customerPhone ? ` (${order.customerPhone})` : ''}</b>
          </div>
          <div>
            <span>Payment</span>
            <Badge status={paid ? 'PAID' : 'PENDING'} />
          </div>
        </div>

        {isSession && order.orders.length > 1 ? (
          <div style={{ marginTop: 14 }}>
            <strong style={{ fontSize: 11, display: 'block', marginBottom: 8 }}>Session Orders Breakdown ({order.orders.length} tickets):</strong>
            {order.orders.map((ord, oIdx) => (
              <div key={ord.orderId || oIdx} style={{ background: 'var(--p-card)', border: '1px solid var(--p-border)', borderRadius: 7, padding: '8px 10px', marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, borderBottom: '1px dashed var(--p-border)', paddingBottom: 4 }}>
                  <b style={{ fontSize: 10 }}>{ord.orderNumber} <span style={{ color: 'var(--p-muted)', fontWeight: 400 }}>· {time(ord.createdAt)}</span></b>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Badge status={ord.status} />
                    {!['DELIVERED', 'PICKED_UP', 'CANCELLED', 'CONFIRMATION_TIMEOUT'].includes(ord.status) && (
                      <button
                        type="button"
                        className="pos-mark-delivered-btn"
                        disabled={busy}
                        onClick={async () => {
                          await run(() => api.updateOrderStatus(ord.orderId, 'DELIVERED'), `Order #${ord.orderNumber} delivered`);
                          onUpdated && onUpdated();
                        }}
                      >
                        <Check size={10} /> Mark delivered
                      </button>
                    )}
                  </div>
                </div>
                {(ord.items || []).map((i, idx) => {
                  const cust = typeof i.customization === 'object' && i.customization !== null ? i.customization : {};
                  return (
                    <div className="pos-line-item" key={idx} style={{ padding: '4px 0' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <b>{i.quantity}× {i.name || i.itemName || 'Item'}</b>
                          <span className={`pos-item-mini-badge status-${(i.status || ord.status).toLowerCase()}`}>
                            {label(i.status || ord.status)}
                          </span>
                        </div>
                        {Object.keys(cust).length > 0 && (
                          <small>{Object.entries(cust).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' · ')}</small>
                        )}
                        {i.specialInstruction && <small style={{ color: '#d97706' }}>{i.specialInstruction}</small>}
                      </div>
                      <b>{money(i.lineTotal)}</b>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        ) : (
          items.map((i, index) => {
            const cust = typeof i.customization === 'object' && i.customization !== null ? i.customization : {};
            return (
              <div className="pos-line-item" key={index}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <b>{i.quantity}× {i.name || i.itemName || 'Item'}</b>
                    <span className={`pos-item-mini-badge status-${(i.itemStatus || i.status || order?.status || 'new').toLowerCase()}`}>
                      {label(i.itemStatus || i.status || order?.status || 'NEW')}
                    </span>
                  </div>
                  {Object.keys(cust).length > 0 && (
                    <small>{Object.entries(cust).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' · ')}</small>
                  )}
                  {i.specialInstruction && <small style={{ color: '#d97706' }}>{i.specialInstruction}</small>}
                </div>
                <b>{money(i.lineTotal)}</b>
              </div>
            );
          })
        )}

        {order?.specialInstructions && (
          <div className="pos-info-box">
            <Info size={14} />
            {order.specialInstructions}
          </div>
        )}
        {order?.cancellationReason && (
          <div className="pos-info-box">
            <AlertCircle size={14} />
            {order.cancellationReason}
          </div>
        )}
        <Totals order={order} />
        {order?.status === 'NEW' && (
          <div className="pos-info-box" style={{ marginTop: 16 }}>
            <Info size={14} />
            <span>This order is sent directly to the kitchen. Kitchen staff will accept and prepare this ticket.</span>
          </div>
        )}
        {order?.source === 'DELIVERY' && order?.status === 'READY' && (
          <button className="pos-button primary full" disabled={busy} onClick={() => transition('OUT_FOR_DELIVERY')}>
            <Truck /> Dispatch delivery
          </button>
        )}
        {order?.source === 'DELIVERY' && order?.status === 'OUT_FOR_DELIVERY' && (
          <button className="pos-button primary full" disabled={busy} onClick={() => transition('DELIVERED')}>
            Mark delivered
          </button>
        )}
        {order?.source === 'TAKEAWAY' && ['READY', 'READY_FOR_PICKUP'].includes(order?.status) && (
          <button className="pos-button primary full" disabled={busy} onClick={() => transition('PICKED_UP')}>
            Mark collected
          </button>
        )}
        {order?.source === 'DINE_IN_QR' && !['DELIVERED', 'PICKED_UP', 'CANCELLED', 'CONFIRMATION_TIMEOUT'].includes(order?.status) && (!isSession || order.orders.length <= 1) && (
          <button
            className="pos-button primary full"
            style={{ marginTop: 10 }}
            disabled={busy}
            onClick={async () => {
              const targetId = order.orderId || order.orders?.[0]?.orderId;
              await run(() => api.updateOrderStatus(targetId, 'DELIVERED'), 'Order marked as delivered');
              onUpdated && onUpdated();
            }}
          >
            <Check size={13} style={{ display: 'inline', marginRight: 4 }} /> Mark delivered
          </button>
        )}
      </div>
      <div className="pos-modal-footer">
        {!isSession && (
          <button className="pos-button danger" disabled={busy} onClick={handleDeleteOrder}>
            <Trash2 size={13} /> Remove order
          </button>
        )}
        <button className="pos-button" onClick={() => window.print()}>
          <Printer /> Print receipt
        </button>
        {!paid && !['CANCELLED', 'CONFIRMATION_TIMEOUT'].includes(order?.status) && (
          <button className="pos-button primary" onClick={onPay}>
            <CreditCard /> Take payment
          </button>
        )}
      </div>
      <Receipt order={order} restaurant={restaurant} paid={paid} />
    </Modal>
  );
}

function Receipt({ order, restaurant, paid }) {
  const items = order?.items || [];
  const subtotal = Number(order?.subtotal) || items.reduce((s, i) => s + (Number(i.lineTotal) || (Number(i.price || 0) * Number(i.quantity || 1))), 0);
  const tax = Number(order?.tax) || 0;
  const total = Number(order?.grandTotal || order?.total) || (subtotal + tax);
  return (
    <div className="pos-receipt-only">
      <div className="pos-receipt-header">
        <h2>{restaurant?.name || 'Bistro & Bloom'}</h2>
        <p>{restaurant?.address || 'Plot 42, Gourmet Boulevard, Cyber Hub, Gurugram, HR – 122002'}<br />{restaurant?.phone || '+91 98765 43210'}</p>
      </div>
      <div className="pos-receipt-dash" />
      <div className="pos-receipt-row">
        <b>{order?.sessionId || order?.orderNumber}</b>
        <span>{SOURCES[order?.source] || (order?.tableId ? 'Dine in' : 'Order')}</span>
      </div>
      <div className="pos-receipt-row">
        <span>{new Date(order?.startedAt || order?.createdAt || Date.now()).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'medium' })}</span>
      </div>
      {(order?.tableName || order?.tableNumber) && (
        <div className="pos-receipt-row">
          <span>{order?.tableName || tableTitle(order)}</span>
        </div>
      )}
      {order?.customerName && !order.customerName.startsWith('Table ') && (
        <div className="pos-receipt-row">
          <span>Guest: {order.customerName}</span>
        </div>
      )}
      <div className="pos-receipt-dash" />
      <div className="pos-receipt-items">
        {items.map((i, n) => (
          <div key={n} className="pos-receipt-item-row">
            <span className="pos-receipt-item-name">{i.quantity} × {i.name || i.itemName || 'Item'}</span>
            <b className="pos-receipt-item-price">{money(i.lineTotal ?? (Number(i.price || 0) * Number(i.quantity || 1)))}</b>
          </div>
        ))}
      </div>
      <div className="pos-receipt-dash" />
      <div className="pos-receipt-summary">
        <div className="pos-receipt-row">
          <span>Subtotal</span>
          <span>{money(subtotal)}</span>
        </div>
        <div className="pos-receipt-row">
          <span>Tax</span>
          <span>{money(tax)}</span>
        </div>
        {Number(order?.discount) > 0 && (
          <div className="pos-receipt-row">
            <span>Discount</span>
            <span>−{money(order.discount)}</span>
          </div>
        )}
        {Number(order?.deliveryFee) > 0 && (
          <div className="pos-receipt-row">
            <span>Delivery fee</span>
            <span>{money(order.deliveryFee)}</span>
          </div>
        )}
        <div className="pos-receipt-dash" />
        <div className="pos-receipt-row pos-receipt-total">
          <strong>Total payment</strong>
          <strong>{money(total)}</strong>
        </div>
      </div>
      <div className="pos-receipt-dash" />
      <div className="pos-receipt-footer">
        <p><b>{paid ? 'PAID · Thank you for dining with us!' : 'PAYMENT PENDING'}</b><br />See you again soon.</p>
      </div>
    </div>
  );
}

function PaymentDialog({ order, restaurant, onClose, onPaid }) {
  const isSession = Boolean(order?.orders && order.orders.length > 0);
  const ordersList = isSession ? order.orders : [order];
  const unpaidOrders = ordersList.filter(o => Math.max(0, Number(o.total || 0) - Number(o.paidAmount || 0)) > 0.01);
  const rawDue = isSession 
    ? (order.balanceDue ?? unpaidOrders.reduce((s, o) => s + Math.max(0, Number(o.total || 0) - Number(o.paidAmount || 0)), 0))
    : Math.max(0, Number(order?.total || 0) - Number(order?.paidAmount || 0));
  const due = Math.round(rawDue * 100) / 100;
  const isAlreadyPaid = due <= 0;
  const [method, setMethod] = useState('UPI'); // 'UPI' | 'CARD' | 'CASH' | 'NET_BANKING'
  const [received, setReceived] = useState(due.toFixed(2));
  const [qrUrl, setQrUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [card, setCard] = useState({ number: '', name: '', expiry: '', cvv: '' });
  const [bank, setBank] = useState('HDFC Bank');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(isAlreadyPaid ? 'This order is already fully paid.' : '');
  const [paid, setPaid] = useState(false);
  const [paidMethod, setPaidMethod] = useState('UPI');
  const [key, setKey] = useState(() => uniqueKey());

  const upiId = 'bistroandbloom@okaxis';
  const billRef = order?.sessionId || order?.orderNumber || (order?.tableNumber ? `Table ${order.tableNumber}` : 'Order');
  const upiUri = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(restaurant?.name || 'Bistro & Bloom')}&am=${due.toFixed(2)}&cu=INR&tn=${encodeURIComponent(`Bill ${billRef}`)}`;

  useEffect(() => {
    QRCode.toDataURL(upiUri, { width: 190, margin: 1, color: { dark: '#11164b', light: '#ffffff' } })
      .then(url => setQrUrl(url))
      .catch(() => { });
  }, [upiUri]);

  const copyUpi = () => {
    navigator.clipboard?.writeText(upiId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const submit = async e => {
    if (e) e.preventDefault();
    setError('');
    if (due <= 0) return setError('This order has already been paid in full.');
    if (method === 'CASH' && Number(received) < due) return setError('Cash received cannot be less than amount due.');
    if (method === 'CARD' && card.number && card.number.replace(/\s/g, '').length < 15) return setError('Please enter a valid card number.');
    setBusy(true);
    const txnKey = key || uniqueKey();
    try {
      if (unpaidOrders.length > 0) {
        for (const ord of unpaidOrders) {
          const ordDue = Math.round(Math.max(0, Number(ord.total || 0) - Number(ord.paidAmount || 0)) * 100) / 100;
          if (ordDue > 0) {
            await api.recordPayment({
              restaurantId: ord?.restaurantId || order?.restaurantId || restaurant?.restaurantId,
              orderId: ord.orderId,
              amount: ordDue,
              method,
              transactionId: `TXN-${Date.now().toString(36).toUpperCase()}-${ord.orderNumber?.slice(-4) || '1'}`,
              idempotencyKey: uniqueKey()
            });
          }
        }
      } else {
        await api.recordPayment({
          restaurantId: order?.restaurantId || restaurant?.restaurantId,
          orderId: order.orderId,
          amount: due,
          method,
          transactionId: `TXN-${Date.now().toString(36).toUpperCase()}`,
          idempotencyKey: txnKey
        });
      }
      if (order?.tableId) {
        try { await api.updateTableStatus(order.tableId, 'CLEANING'); } catch { }
      }
      setPaidMethod(method);
      setPaid(true);
      if (onPaid) await onPaid();
    } catch (err) {
      setKey(uniqueKey());
      setError(err.message || 'Payment recording failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Collect payment" onClose={onClose}>
      {paid ? (
        <>
          <div className="pos-modal-body">
            <div className="pos-payment-success">
              <span><Check size={29} /></span>
              <h3>Payment recorded</h3>
              <p>Payment of {money(due)} via {paidMethod === 'UPI' ? 'UPI / QR Code' : paidMethod === 'CARD' ? 'Card' : paidMethod === 'NET_BANKING' ? 'Net Banking' : 'Cash'} was successfully processed.</p>
            </div>
            {order?.tableNumber && (
              <div className="pos-info-box" style={{ background: 'rgba(56, 189, 248, 0.1)', color: '#0284c7', borderColor: 'rgba(56, 189, 248, 0.3)' }}>
                <Sparkles size={16} />
                <span>
                  <strong>Floor staff notified:</strong> {order.tableName || tableTitle(order)} is marked for <strong>CLEANING</strong>. It will be automatically marked available in <strong>2 minutes</strong>.
                </span>
              </div>
            )}
            <div className="pos-detail-meta">
              <div><span>{order?.tableName ? 'Table' : 'Order'}</span><b>{order?.tableName || order?.orderNumber}</b></div>
              <div><span>Payment method</span><b>{paidMethod === 'UPI' ? 'UPI / QR Code' : paidMethod === 'CARD' ? 'Card' : paidMethod === 'NET_BANKING' ? 'Net Banking' : 'Cash'}</b></div>
              <div><span>Amount received</span><b>{money(due)}</b></div>
              {order?.sessionId && <div><span>Session</span><b>{order.sessionId}</b></div>}
            </div>
          </div>
          <div className="pos-modal-footer">
            <button className="pos-button" onClick={() => window.print()}><Printer /> Print customer bill</button>
            <button className="pos-button primary" onClick={onClose}>Done</button>
          </div>
          <Receipt order={order} restaurant={restaurant} paid={true} />
        </>
      ) : (
        <form onSubmit={submit}>
          <div className="pos-modal-body">
            {error && <div className="pos-error" role="alert"><AlertCircle size={15} />{error}</div>}

            <div className="pos-payment-amount-box">
              <span className="label">Amount due</span>
              <strong className="amount">{money(due)}</strong>
              <span className="subtitle">
                {order?.orderNumber} {order?.tableNumber ? `· ${tableTitle(order)}` : ''}
              </span>
            </div>

            {/* Payment method selector */}
            <div className="pos-segment" style={{ width: '100%', marginBottom: 16 }}>
              {[
                ['UPI', 'UPI / QR'],
                ['CARD', 'Card'],
                ['CASH', 'Cash'],
                ['NET_BANKING', 'Net Banking']
              ].map(([m, name]) => (
                <button
                  key={m}
                  type="button"
                  className={method === m ? 'active' : ''}
                  onClick={() => setMethod(m)}
                  style={{ flex: 1 }}
                >
                  {name}
                </button>
              ))}
            </div>

            {/* Tab 1: UPI / Dynamic QR */}
            {method === 'UPI' && (
              <div style={{ textAlign: 'center', padding: '6px 0 10px' }}>
                <p style={{ fontSize: 11, color: 'var(--p-muted)', marginBottom: 12 }}>
                  Customer scans with Google Pay, PhonePe, Paytm, or any UPI app.
                </p>
                {qrUrl ? (
                  <div style={{ display: 'inline-block', padding: 12, background: '#fff', borderRadius: 10, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
                    <img src={qrUrl} alt="UPI QR Code" width="190" height="190" style={{ display: 'block' }} />
                  </div>
                ) : (
                  <div style={{ height: 190, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Spinner />
                  </div>
                )}
                <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--p-text)', fontFamily: 'monospace' }}>{upiId}</span>
                  <button type="button" className="pos-button small" onClick={copyUpi}>
                    {copied ? 'Copied!' : 'Copy UPI ID'}
                  </button>
                </div>
              </div>
            )}

            {/* Tab 2: Credit / Debit Card */}
            {method === 'CARD' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="pos-info-box" style={{ marginBottom: 4 }}>
                  <Info size={14} />
                  <span>Card terminal swipe or manual entry for delivery / phone orders.</span>
                </div>
                <label className="pos-field">
                  <span>Card number</span>
                  <input
                    className="pos-input"
                    placeholder="4532 •••• •••• 8892"
                    value={card.number}
                    maxLength={19}
                    onChange={e => {
                      const v = e.target.value.replace(/\D/g, '').slice(0, 16);
                      const formatted = v.match(/.{1,4}/g)?.join(' ') || v;
                      setCard({ ...card, number: formatted });
                    }}
                  />
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <label className="pos-field">
                    <span>Expiry date</span>
                    <input
                      className="pos-input"
                      placeholder="MM/YY"
                      value={card.expiry}
                      maxLength={5}
                      onChange={e => {
                        let v = e.target.value.replace(/\D/g, '').slice(0, 4);
                        if (v.length > 2) v = v.slice(0, 2) + '/' + v.slice(2);
                        setCard({ ...card, expiry: v });
                      }}
                    />
                  </label>
                  <label className="pos-field">
                    <span>CVV</span>
                    <input
                      className="pos-input"
                      type="password"
                      placeholder="•••"
                      maxLength={4}
                      value={card.cvv}
                      onChange={e => setCard({ ...card, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                    />
                  </label>
                </div>
                <label className="pos-field">
                  <span>Cardholder name (optional)</span>
                  <input
                    className="pos-input"
                    placeholder="Name as printed on card"
                    value={card.name}
                    onChange={e => setCard({ ...card, name: e.target.value })}
                  />
                </label>
              </div>
            )}

            {/* Tab 3: Cash Payment & Change Calculator */}
            {method === 'CASH' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <label className="pos-field">
                  <span>Cash received from customer</span>
                  <input
                    className="pos-input"
                    type="number"
                    step="0.01"
                    min={due}
                    style={{ fontSize: 22, fontWeight: 700, padding: '10px 14px', textAlign: 'center' }}
                    value={received}
                    onChange={e => setReceived(e.target.value)}
                  />
                </label>

                {/* Quick amount suggestion chips */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {[due, Math.ceil(due / 50) * 50, Math.ceil(due / 100) * 100, Math.ceil(due / 500) * 500].filter((v, i, a) => v >= due && a.indexOf(v) === i).slice(0, 4).map(val => (
                    <button
                      key={val}
                      type="button"
                      className="pos-button small"
                      style={{ flex: 1, minWidth: 70 }}
                      onClick={() => setReceived(val.toFixed(2))}
                    >
                      Exact {money(val)}
                    </button>
                  ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: 'var(--p-card)', borderRadius: 8, border: '1px solid var(--p-border)' }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>Change to return</span>
                  <strong style={{ fontSize: 16, color: Number(received) >= due ? '#16a34a' : '#df626b' }}>
                    {Number(received) >= due ? money(Number(received) - due) : 'Insufficient cash'}
                  </strong>
                </div>
              </div>
            )}

            {/* Tab 4: Net Banking / Wallet */}
            {method === 'NET_BANKING' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <label className="pos-field">
                  <span>Select Bank or Wallet</span>
                  <select className="pos-select" style={{ width: '100%' }} value={bank} onChange={e => setBank(e.target.value)}>
                    <option>HDFC Bank</option>
                    <option>State Bank of India (SBI)</option>
                    <option>ICICI Bank</option>
                    <option>Axis Bank</option>
                    <option>Kotak Mahindra Bank</option>
                    <option>Paytm Wallet</option>
                    <option>PhonePe Wallet</option>
                    <option>Amazon Pay</option>
                  </select>
                </label>
                <p style={{ fontSize: 10, color: 'var(--p-muted)', lineHeight: 1.6 }}>Record authorization reference received from customer's mobile or corporate bank terminal.</p>
              </div>
            )}
          </div>

          <div className="pos-modal-footer">
            <button className="pos-button" type="button" onClick={onClose}>Cancel</button>
            <button className="pos-button primary" disabled={busy || due <= 0 || (method === 'CASH' && Number(received) < due)} type="submit">
              {busy ? 'Recording…' : due <= 0 ? 'Order Fully Paid' : method === 'UPI' ? `Confirm UPI Payment ${money(due)}` : method === 'CARD' ? `Authorize Card ${money(due)}` : method === 'NET_BANKING' ? `Confirm ${bank} ${money(due)}` : `Record Cash Payment ${money(due)}`}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function TableDialog({ restaurant, table, orders, reservations, onClose, busy, run, onOrder, onNew, onPay, paidIds, canManage, onDeleted }) {
  const [qr, setQr] = useState(false);
  const [qrImage, setQrImage] = useState('');
  const publicOrigin = getPublicOrigin(restaurant);
  const isLocalHost = Boolean(publicOrigin && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(publicOrigin).hostname));
  const qrUrl = getTableQrUrl(restaurant, table);

  useEffect(() => {
    if (qrUrl) {
      QRCode.toDataURL(qrUrl, { width: 600, margin: 2, errorCorrectionLevel: 'M' })
        .then(setQrImage)
        .catch(() => setQrImage(''));
    }
  }, [qrUrl]);

  return (
    <Modal title={tableTitle(table)} onClose={onClose}>
      <div className="pos-modal-body">
        <div className="pos-detail-heading">
          <strong>{tableLabel(table)} <small style={{ fontSize: 11, color: 'var(--p-muted)', fontWeight: 500 }}>· {table.capacity} people</small></strong>
          <Badge status={table.status} />
        </div>
        {table.currentCustomerName && <p className="pos-section-note">Guest: {table.currentCustomerName}</p>}
        {['WAITING_FOR_CLEANING', 'CLEANING'].includes(table.status) && (
          <button
            className="pos-button primary"
            style={{ background: '#16a34a', borderColor: '#16a34a', color: '#fff', width: '100%', margin: '12px 0 6px' }}
            disabled={busy}
            onClick={async () => {
              await run(() => api.updateTableStatus(table.tableId, 'AVAILABLE'), tableTitle(table) + ' marked available');
            }}
          >
            <Check size={14} /> Mark table available
          </button>
        )}
        {orders.length > 1 && orders.some(o => !paidIds?.has(o.orderId) && o.status !== 'CANCELLED') && (
          <div style={{ margin: '8px 0 12px', padding: '10px 12px', background: 'var(--p-blue-soft)', border: '1px solid var(--p-border)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <strong style={{ fontSize: 11, color: 'var(--p-blue)' }}>Running Session Total: {money(orders.filter(o => !paidIds?.has(o.orderId) && o.status !== 'CANCELLED').reduce((s, o) => s + Number(o.total || 0), 0))}</strong>
              <small style={{ display: 'block', fontSize: 9, color: 'var(--p-muted)' }}>{orders.filter(o => !paidIds?.has(o.orderId)).length} unpaid orders on this table</small>
            </div>
            <button
              className="pos-button small primary"
              onClick={() => onPay({
                type: 'TABLE_SESSION',
                sessionId: `SES-T${table.tableNumber}`,
                tableId: table.tableId,
                tableNumber: table.tableNumber,
                tableName: tableTitle(table),
                customerName: table.currentCustomerName || orders[0]?.customerName,
                orders: orders.filter(o => !paidIds?.has(o.orderId) && o.status !== 'CANCELLED'),
                items: orders.flatMap(o => o.items || []),
                subtotal: orders.reduce((s, o) => s + Number(o.subtotal || 0), 0),
                tax: orders.reduce((s, o) => s + Number(o.tax || 0), 0),
                total: orders.reduce((s, o) => s + Number(o.total || 0), 0),
              })}
            >
              Pay full table bill
            </button>
          </div>
        )}
        {orders.length ? (
          orders.map(o => {
            const isPaid = paidIds?.has(o.orderId);
            return (
              <div key={o.orderId} className="pos-line-item" style={{ alignItems: 'center' }}>
                <div>
                  <b>{o.orderNumber}</b>
                  <small>{label(o.status)} · {o.items.length} items {isPaid ? '· Paid' : '· Payment pending'}</small>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {!isPaid && o.status !== 'CANCELLED' && onPay && (
                    <button className="pos-button small primary" onClick={() => onPay(o)}>
                      Pay bill
                    </button>
                  )}
                  <button className="pos-button small" onClick={() => onOrder(o)}>
                    {money(o.total)} <ArrowUpRight size={11} />
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <Empty icon={Armchair} title="No open bill">New orders for this table will appear here.</Empty>
        )}
        {reservations.slice(0, 2).map(r => (
          <div className="pos-info-box" key={r.reservationId}>
            <CalendarDays size={15} />
            <span>
              <b>{r.customerName}</b> · {r.guestCount} guests<br />
              {shortDate(r.reservationDate)} at {r.reservationTime?.slice(0, 5)} · {label(r.status)}
            </span>
          </div>
        ))}
        <div className="pos-table-detail-actions" style={{ marginTop: 18 }}>
          <button className="pos-button primary" disabled={['WAITING_FOR_CLEANING', 'CLEANING', 'OUT_OF_SERVICE'].includes(table.status)} onClick={onNew}>
            <Plus /> New order
          </button>
          <button className="pos-button" onClick={() => setQr(!qr)}>
            <QrCode /> {qr ? 'Hide QR' : 'View QR code'}
          </button>
        </div>
        {qr && (
          qrUrl ? (
            <div style={{ textAlign: 'center', padding: 20 }}>
              {qrImage && <img src={qrImage} alt={`QR code for ${tableTitle(table)}`} width="190" height="190" style={{ margin: '0 auto 12px', borderRadius: 8, display: 'block' }} />}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <a className="pos-button small" href={qrImage} download={`Bistro-Bloom-${tableLabel(table).replaceAll(" ", "-")}.png`}>
                  <Download size={12} /> Download QR
                </a>
                <button className="pos-button small" onClick={() => window.print()}>
                  <Printer /> Print QR
                </button>
              </div>
              <a
                className="pos-text-link"
                style={{
                  marginTop: 12,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  whiteSpace: 'nowrap'
                }}
                href={`/qr/${table.restaurantId || restaurant?.restaurantId || 'a0000000-0000-0000-0000-000000000001'}/${table.tableId}`}
                target="_blank"
                rel="noreferrer"
              >
                <span>Open table menu</span>
                <ArrowUpRight size={12} style={{ flexShrink: 0 }} />
              </a>
              {isLocalHost && (
                <p style={{ fontSize: 10, color: 'var(--p-muted)', marginTop: 8 }}>
                  Tip: For phones on Wi-Fi to scan this QR code, ensure your phone connects to {publicOrigin}.
                </p>
              )}
              <div className="pos-receipt-only">
                <h2>{restaurant?.name || 'Bistro & Bloom'}</h2>
                <p>{tableTitle(table)} · Scan to order</p>
                <img src={qrImage} alt="Table menu QR" style={{ width: '65mm', height: '65mm' }} />
                <p>{qrUrl}</p>
              </div>
            </div>
          ) : (
            <div className="pos-info-box">
              <Info size={15} />
              <span>Generating QR code...</span>
            </div>
          )
        )}
        <label className="pos-field" style={{ marginTop: 20 }}>
          <span>Update table status</span>
          <select
            aria-label="Table status"
            className="pos-select"
            value={table.status}
            disabled={busy}
            onChange={async e => {
              await run(() => api.updateTableStatus(table.tableId, e.target.value), 'Table status updated');
            }}
          >
            {['AVAILABLE', 'RESERVED', 'OCCUPIED', 'WAITING_FOR_CLEANING', 'CLEANING', 'OUT_OF_SERVICE'].map(s => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <small>After checkout, the table is automatically sent for cleaning. Make it available once it is sanitized and ready for the next guest.</small>
        </label>
        {canManage && orders.length === 0 && (
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--p-border)', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              className="pos-button small"
              style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)', background: 'rgba(239, 68, 68, 0.05)', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              disabled={busy}
              onClick={async () => {
                if (window.confirm(`Are you sure you want to delete Table ${table.tableNumber}?`)) {
                  try {
                    await api.deleteTable(table.tableId);
                    if (onDeleted) onDeleted();
                  } catch (err) {
                    alert(err.message || 'Failed to delete table');
                  }
                }
              }}
            >
              <Trash2 size={13} /> Delete Table
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

function ReservationDialog({ reservation, onClose, onSaved }) {
  const [form, setForm] = useState({ customerName: reservation?.customerName || '', customerPhone: reservation?.customerPhone || '', customerEmail: reservation?.customerEmail || '', reservationDate: reservation?.reservationDate?.slice(0, 10) || today(), reservationTime: reservation?.reservationTime?.slice(0, 5) || '', guestCount: reservation?.guestCount || 2, specialRequest: reservation?.specialRequest || '' });
  const [slots, setSlots] = useState([]); const [slotsLoading, setSlotsLoading] = useState(true); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [rescheduledRes, setRescheduledRes] = useState(null);
  useEffect(() => { let active = true; setSlotsLoading(true); setError(''); api.checkAvailability(form.reservationDate, form.guestCount).then(result => { if (active) { setSlots(Array.isArray(result) ? result : result.slots || []); } }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setSlotsLoading(false); }); return () => { active = false; }; }, [form.reservationDate, form.guestCount]);
  const field = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const submit = async e => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      if (reservation) {
        const res = await api.rescheduleReservation(reservation.reservationId, { newDate: form.reservationDate, newTime: form.reservationTime, guestCount: form.guestCount });
        const updated = res?.reservation || {
          ...reservation,
          reservationDate: form.reservationDate,
          reservationTime: form.reservationTime,
          guestCount: form.guestCount,
        };
        setRescheduledRes(updated);
        if (onSaved) await onSaved(true);
      } else {
        await api.createReservation(form);
        if (onSaved) await onSaved(false);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return <Modal title={rescheduledRes ? 'Reservation rescheduled' : reservation ? 'Reschedule reservation' : 'Add new reservation'} onClose={onClose}>
    {rescheduledRes ? (
      <div className="pos-modal-body">
        <div style={{ textAlign: 'center', padding: '12px 0 20px' }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#22c55e20', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
            <CheckCircle2 size={28} />
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Reservation Rescheduled!</h3>
          <p style={{ fontSize: 11, color: 'var(--p-muted)', marginTop: 4 }}>Booking reference: <b>{rescheduledRes.bookingId}</b></p>
        </div>
        <div className="pos-detail-meta" style={{ marginTop: 8 }}>
          <div><span>Guest</span><b>{rescheduledRes.customerName}</b></div>
          <div><span>Customer phone</span><b style={{ color: 'var(--p-blue)' }}>{rescheduledRes.customerPhone}</b></div>
          <div><span>New date & time</span><b>{shortDate(rescheduledRes.reservationDate)} at {rescheduledRes.reservationTime?.slice(0, 5)}</b></div>
          <div><span>Assigned table</span><b>{tableTitle(rescheduledRes)}</b></div>
        </div>
        <div className="pos-info-box" style={{ marginTop: 14, backgroundColor: '#f0fdf4', borderColor: '#bbf7d0', color: '#166534' }}>
          <Info size={15} />
          <span>Notify customer directly on their mobile number:</span>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <a className="pos-button primary full" href={getWhatsAppUrl(rescheduledRes)} target="_blank" rel="noreferrer" style={{ backgroundColor: '#25D366', borderColor: '#25D366' }}>
            📱 Send WhatsApp update
          </a>
          <a className="pos-button full" href={getSmsUrl(rescheduledRes)}>
            💬 Send SMS
          </a>
        </div>
        <div className="pos-modal-footer" style={{ padding: 0, marginTop: 20 }}>
          <button className="pos-button primary full" onClick={onClose}>Done</button>
        </div>
      </div>
    ) : (
      <form onSubmit={submit}>
        <div className="pos-modal-body">
          {error && <div className="pos-error" role="alert">{error}</div>}
          <div className="pos-form-grid">
            {!reservation && (
              <>
                <label className="pos-field full"><span>Guest name</span><input className="pos-input" required maxLength={255} value={form.customerName} onChange={e => field('customerName', e.target.value)} placeholder="Full name" /></label>
                <label className="pos-field"><span>Mobile number</span><input className="pos-input" type="tel" required pattern="[+0-9 ()-]{7,30}" value={form.customerPhone} onChange={e => field('customerPhone', e.target.value)} placeholder="+91" /></label>
                <label className="pos-field"><span>Email</span><input className="pos-input" type="email" required value={form.customerEmail} onChange={e => field('customerEmail', e.target.value)} placeholder="guest@example.com" /></label>
              </>
            )}
            <label className="pos-field"><span>Date</span><input className="pos-input" type="date" min={today()} required value={form.reservationDate} onChange={e => { field('reservationDate', e.target.value); field('reservationTime', ''); }} /></label>
            <label className="pos-field"><span>Number of guests</span><input className="pos-input" type="number" min="1" max="70" required value={form.guestCount} onChange={e => { field('guestCount', Number(e.target.value)); field('reservationTime', ''); }} /></label>
            <label className="pos-field full">
              <span>Time <small>{slotsLoading ? 'Checking availability…' : 'Live availability'}</small></span>
              <select className="pos-select" style={{ width: '100%' }} required value={form.reservationTime} disabled={slotsLoading} onChange={e => field('reservationTime', e.target.value)}>
                <option value="">Select an available time</option>
                {slots.map(s => {
                  const value = clockValue(s.timeSlot || s.time);
                  return <option key={value} value={value} disabled={!s.isAvailable}>{s.timeSlot || value} {s.isAvailable ? '· Available' : '· Fully booked'}</option>;
                })}
              </select>
            </label>
            {!reservation && (
              <label className="pos-field full"><span>Special request <small>Optional</small></span><textarea className="pos-textarea" maxLength={1000} value={form.specialRequest} onChange={e => field('specialRequest', e.target.value)} placeholder="A high chair, a special occasion…" /></label>
            )}
          </div>
          <div className="pos-info-box">
            <Info size={14} />
            <span>A suitable table is assigned automatically. Ask guests to arrive 5 minutes before their reservation.</span>
          </div>
        </div>
        <div className="pos-modal-footer">
          <button type="button" className="pos-button" onClick={onClose}>Cancel</button>
          <button className="pos-button primary" type="submit" disabled={busy || slotsLoading || !form.reservationTime}>
            {busy ? 'Saving…' : reservation ? 'Save new time' : 'Confirm reservation'}
          </button>
        </div>
      </form>
    )}
  </Modal>;
}

function CancelReservationDialog({ reservation, onClose, onCancelled }) {
  const [reason, setReason] = useState('Operational / Table maintenance');
  const [customReason, setCustomReason] = useState('');
  const [cancelled, setCancelled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const finalReason = reason === 'Other' ? (customReason.trim() || 'Operational inconvenience') : reason;

  const handleCancel = async () => {
    setBusy(true);
    setError('');
    try {
      await api.updateReservationStatus(reservation.reservationId, 'CANCELLED');
      setCancelled(true);
      if (onCancelled) await onCancelled();
    } catch (e) {
      setError(e.message || 'Failed to cancel reservation');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={cancelled ? "Reservation Cancelled" : "Cancel Reservation"} onClose={onClose}>
      {cancelled ? (
        <div className="pos-modal-body">
          <div style={{ textAlign: 'center', padding: '12px 0 16px' }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#fee2e2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
              <AlertCircle size={28} />
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: '#991b1b' }}>Reservation Cancelled</h3>
            <p style={{ fontSize: 11, color: 'var(--p-muted)', marginTop: 4 }}>Booking reference: <b>{reservation.bookingId}</b></p>
          </div>

          <div className="pos-detail-meta" style={{ marginTop: 8 }}>
            <div><span>Guest</span><b>{reservation.customerName}</b></div>
            <div><span>Customer phone</span><b style={{ color: 'var(--p-blue)' }}>{reservation.customerPhone}</b></div>
            <div><span>Originally booked for</span><b>{shortDate(reservation.reservationDate)} at {reservation.reservationTime?.slice(0, 5)}</b></div>
            <div><span>Reason cited</span><b>{finalReason}</b></div>
          </div>

          <div className="pos-info-box" style={{ marginTop: 14, backgroundColor: '#fef2f2', borderColor: '#fecaca', color: '#991b1b' }}>
            <Info size={15} />
            <span>Notify customer immediately on their mobile number so they are aware of the cancellation:</span>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <a 
              className="pos-button primary full" 
              href={getCancelWhatsAppUrl(reservation, finalReason)} 
              target="_blank" 
              rel="noreferrer" 
              style={{ backgroundColor: '#25D366', borderColor: '#25D366' }}
            >
              📱 Send WhatsApp notification
            </a>
            <a 
              className="pos-button full" 
              href={getCancelSmsUrl(reservation, finalReason)}
            >
              💬 Send SMS
            </a>
          </div>

          <div className="pos-modal-footer" style={{ padding: 0, marginTop: 20 }}>
            <button className="pos-button primary full" onClick={onClose}>Done</button>
          </div>
        </div>
      ) : (
        <div className="pos-modal-body">
          {error && <div className="pos-error" role="alert">{error}</div>}
          <p style={{ fontSize: 13, lineHeight: 1.6 }}>
            Are you sure you want to cancel booking <b>{reservation.bookingId}</b> for <b>{reservation.customerName}</b>? The assigned table will be released.
          </p>
          <div className="pos-detail-meta" style={{ margin: '12px 0' }}>
            <div><span>Guest</span><b>{reservation.customerName}</b></div>
            <div><span>Phone</span><b>{reservation.customerPhone}</b></div>
            <div><span>Time</span><b>{shortDate(reservation.reservationDate)} at {reservation.reservationTime?.slice(0, 5)}</b></div>
            <div><span>Party</span><b>{reservation.guestCount} guests</b></div>
          </div>

          <label className="pos-field full" style={{ marginTop: 12 }}>
            <span>Reason for cancellation:</span>
            <select className="pos-select" style={{ width: '100%' }} value={reason} onChange={e => setReason(e.target.value)}>
              <option value="Operational / Table maintenance">Operational / Table maintenance</option>
              <option value="Unforeseen private event / hall booking">Unforeseen private event / hall booking</option>
              <option value="Overcapacity / Safety limitation">Overcapacity / Safety limitation</option>
              <option value="Customer requested cancellation via call">Customer requested cancellation via call</option>
              <option value="Severe weather / Emergency closure">Severe weather / Emergency closure</option>
              <option value="Other">Other / Custom reason</option>
            </select>
          </label>

          {reason === 'Other' && (
            <label className="pos-field full" style={{ marginTop: 8 }}>
              <span>Specify reason:</span>
              <input 
                className="pos-input" 
                maxLength={200}
                placeholder="e.g. Power maintenance between 2 PM - 4 PM" 
                value={customReason} 
                onChange={e => setCustomReason(e.target.value)} 
              />
            </label>
          )}

          <div className="pos-info-box" style={{ marginTop: 12 }}>
            <Info size={14} />
            <span>After confirming, you can send an instant WhatsApp or SMS notification with polite apologies and explanation to the customer.</span>
          </div>

          <div className="pos-modal-footer" style={{ padding: 0, marginTop: 16 }}>
            <button type="button" className="pos-button" onClick={onClose}>Keep reservation</button>
            <button type="button" className="pos-button danger" disabled={busy} onClick={handleCancel}>
              {busy ? 'Cancelling…' : 'Confirm cancellation'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function ResolveIssue({ issue, onClose, onResolved }) {
  const [resolution, setResolution] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const submit = async e => { e.preventDefault(); setBusy(true); try { await api.resolveIssue(issue.issueId, resolution); onResolved(); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  return <Modal title="Resolve customer issue" onClose={onClose}><form onSubmit={submit}><div className="pos-modal-body"><p className="pos-section-note">{issue.description}</p>{error && <div className="pos-error">{error}</div>}<label className="pos-field"><span>Resolution notes</span><textarea className="pos-textarea" required minLength={3} maxLength={2000} value={resolution} onChange={e => setResolution(e.target.value)} placeholder="Describe how the issue was resolved…" /></label></div><div className="pos-modal-footer"><button className="pos-button" type="button" onClick={onClose}>Cancel</button><button className="pos-button primary" disabled={busy || !resolution.trim()} type="submit">{busy ? 'Saving…' : 'Mark resolved'}</button></div></form></Modal>;
}

function MenuImageField({ value, onChange, presets }) {
  const fileInputRef = React.useRef(null);
  const [uploadError, setUploadError] = useState('');
  const [uploading, setUploading] = useState(false);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setUploadError('Please select a valid image file (PNG, JPG, WEBP).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('Image must be smaller than 5 MB.');
      return;
    }
    setUploadError('');
    setUploading(true);

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const img = new Image();
      img.onload = () => {
        const maxSide = 800;
        let { width, height } = img;
        if (width > maxSide || height > maxSide) {
          const ratio = Math.min(maxSide / width, maxSide / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL('image/jpeg', 0.82);
        onChange(compressed);
        setUploading(false);
      };
      img.onerror = () => {
        onChange(String(dataUrl));
        setUploading(false);
      };
      img.src = String(dataUrl);
    };
    reader.onerror = () => {
      setUploadError('Could not read the selected image.');
      setUploading(false);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div style={{
      padding: 12,
      borderRadius: 10,
      border: '1px solid var(--p-border)',
      background: 'rgba(255,255,255,0.02)',
      marginBottom: 16
    }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <div style={{
          width: 60,
          height: 60,
          borderRadius: 10,
          border: '1px solid var(--p-border)',
          background: 'var(--p-surface)',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}>
          {value ? (
            <img
              src={value}
              alt="Preview"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          ) : (
            <UtensilsCrossed size={22} style={{ color: 'var(--p-muted)', opacity: 0.5 }} />
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <label className="pos-field" style={{ margin: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 700 }}>Item Image URL or Upload</span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="text"
                className="pos-input"
                value={value.startsWith('data:image/') ? '' : value}
                onChange={e => { setUploadError(''); onChange(e.target.value); }}
                placeholder={value.startsWith('data:image/') ? 'Uploaded image attached (paste URL to replace)' : 'https://images.unsplash.com/... or paste image link'}
                style={{ fontSize: 12, padding: '6px 10px', flex: 1, minWidth: 0 }}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                className="pos-button small"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', flexShrink: 0 }}
              >
                <Upload size={13} />
                {uploading ? 'Uploading…' : 'Upload Image'}
              </button>
              {value && (
                <button
                  type="button"
                  className="pos-button small"
                  onClick={() => { setUploadError(''); onChange(''); }}
                  title="Remove image"
                  aria-label="Remove image"
                  style={{ padding: '6px 8px', flexShrink: 0 }}
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </label>
          {uploadError && (
            <div style={{ fontSize: 10, color: 'var(--p-red)', marginTop: 4 }}>{uploadError}</div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--p-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <Sparkles size={12} color="var(--p-blue)" /> Quick Gallery:
        </span>
        {presets.map(p => (
          <button
            key={p.label}
            type="button"
            onClick={() => { setUploadError(''); onChange(p.url); }}
            style={{
              fontSize: 11,
              padding: '3px 10px',
              borderRadius: 6,
              border: value === p.url ? '1px solid var(--p-blue)' : '1px solid var(--p-border)',
              background: value === p.url ? 'rgba(59, 130, 246, 0.15)' : 'var(--p-card)',
              color: value === p.url ? 'var(--p-blue)' : 'var(--p-text)',
              fontWeight: value === p.url ? 700 : 500,
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ReportStockShortageModal({ menu, onClose, onSuccess }) {
  const [submitting, setSubmitting] = useState(false);
  const [itemType, setItemType] = useState('DISH');
  const [selectedMenuItemId, setSelectedMenuItemId] = useState('');
  const [customItemName, setCustomItemName] = useState('');
  const [shortageReason, setShortageReason] = useState('Out of stock');
  const [urgency, setUrgency] = useState('HIGH');
  const [markSoldOut, setMarkSoldOut] = useState(true);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const selectedDish = itemType === 'DISH' ? menu.find(m => m.menuItemId === selectedMenuItemId) : null;
      const itemName = itemType === 'DISH'
        ? selectedDish?.name || 'Dish'
        : customItemName.trim();

      await api.reportShortage({
        itemType,
        menuItemId: itemType === 'DISH' && selectedMenuItemId ? selectedMenuItemId : null,
        ingredientName: itemType === 'INGREDIENT' ? customItemName.trim() : itemName,
        shortageStatus: shortageReason === 'Out of stock' ? 'OUT_OF_STOCK' : 'LOW_STOCK',
        urgencyLevel: urgency,
        markDishSoldOut: itemType === 'DISH' && markSoldOut && Boolean(selectedMenuItemId)
      });

      onSuccess(`Reported shortage for "${itemName}" (${shortageReason})`);
    } catch (err) {
      setError(err.message || 'Failed to report shortage');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal title="Report Stock Shortage" onClose={() => { if (!submitting) onClose(); }}>
      <form onSubmit={handleSubmit} style={{ margin: 0, width: '100%', boxSizing: 'border-box' }}>
        <div className="pos-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ color: 'var(--p-muted)', fontSize: 11, margin: 0, lineHeight: 1.6 }}>
            Report an unavailable dish or depleted ingredient to notify staff and update live menus.
          </p>
          {error && <div className="pos-error">{error}</div>}

          <div className="pos-field">
            <span>Item type</span>
            <div className="pos-segment" style={{ display: 'flex', width: '100%', boxSizing: 'border-box' }}>
              <button
                type="button"
                className={itemType === 'DISH' ? 'active' : ''}
                onClick={() => setItemType('DISH')}
                style={{ flex: 1 }}
              >
                Menu dish
              </button>
              <button
                type="button"
                className={itemType === 'INGREDIENT' ? 'active' : ''}
                onClick={() => setItemType('INGREDIENT')}
                style={{ flex: 1 }}
              >
                Raw ingredient / Supply
              </button>
            </div>
          </div>

          {itemType === 'DISH' ? (
            <div className="pos-field">
              <span>Select menu dish *</span>
              <select
                className="pos-select"
                value={selectedMenuItemId}
                onChange={e => setSelectedMenuItemId(e.target.value)}
                required
              >
                <option value="">-- Choose a dish --</option>
                {menu.map(item => (
                  <option key={item.menuItemId} value={item.menuItemId}>
                    {item.name} ({item.categoryName || 'General'}) {item.availability ? '' : '[Already Sold Out]'}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="pos-field">
              <span>Ingredient / Supply name *</span>
              <input
                className="pos-input"
                value={customItemName}
                onChange={e => setCustomItemName(e.target.value)}
                placeholder="e.g. Cooking oil, Mozzarella cheese, Burger buns, Paneer"
                required
              />
            </div>
          )}

          <div className="pos-form-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 12, width: '100%', boxSizing: 'border-box' }}>
            <div className="pos-field" style={{ minWidth: 0, width: '100%', boxSizing: 'border-box' }}>
              <span>Shortage status</span>
              <select
                className="pos-select"
                style={{ width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box' }}
                value={shortageReason}
                onChange={e => setShortageReason(e.target.value)}
              >
                <option value="Out of stock">Out of stock (0 left)</option>
                <option value="Running low">Running low (few left)</option>
                <option value="Spoiled or damaged">Spoiled / Damaged</option>
                <option value="Supplier delivery delayed">Delivery delayed</option>
              </select>
            </div>

            <div className="pos-field" style={{ minWidth: 0, width: '100%', boxSizing: 'border-box' }}>
              <span>Urgency level</span>
              <select
                className="pos-select"
                style={{ width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box' }}
                value={urgency}
                onChange={e => setUrgency(e.target.value)}
              >
                <option value="HIGH">High (Immediate)</option>
                <option value="MEDIUM">Medium (Next shift)</option>
                <option value="LOW">Low (Reorder)</option>
              </select>
            </div>
          </div>

          {itemType === 'DISH' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 11, cursor: 'pointer', lineHeight: 1.5, userSelect: 'none', marginTop: 2 }}>
              <input
                type="checkbox"
                style={{ width: 15, height: 15, accentColor: 'var(--p-blue)', cursor: 'pointer', margin: 0, flexShrink: 0 }}
                checked={markSoldOut}
                onChange={e => setMarkSoldOut(e.target.checked)}
              />
              <span>Automatically mark this dish as <strong>Sold out</strong> on QR code &amp; POS menus immediately</span>
            </label>
          )}
        </div>

        <div className="pos-modal-footer">
          <button
            type="button"
            className="pos-button"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="pos-button primary"
            disabled={submitting || (itemType === 'DISH' ? !selectedMenuItemId : !customItemName.trim())}
          >
            <Package size={14} />
            {submitting ? 'Reporting…' : 'Report shortage'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function StaffPasswordModal({ user, isSelf, currentUser, onClose, onSuccess }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';

  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
    let res = '';
    for (let i = 0; i < 12; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewPassword(res);
    setConfirmPassword(res);
    setShowPassword(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }

    try {
      setBusy(true);
      if (isSelf && !isSuperAdmin) {
        if (!currentPassword) {
          setError('Please provide your current password.');
          setBusy(false);
          return;
        }
        await api.changeMyPassword({ currentPassword, newPassword });
        onSuccess('Your password has been changed successfully.');
      } else {
        await api.updateUserPassword(user.userId, newPassword);
        onSuccess(`Password for ${user.name} (${user.role}) updated successfully.`);
      }
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to update password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} title={isSelf ? 'Change My Password' : `Change Password: ${user.name}`}>
      <form onSubmit={handleSubmit} style={{ padding: '0 4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--p-surface-subtle, #f8fafc)', borderRadius: 10, marginBottom: 16, border: '1px solid var(--p-border)' }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#e0e7ff', color: '#4338ca', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <KeyRound size={16} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{user.name}</div>
            <div style={{ fontSize: 11, color: 'var(--p-muted)' }}>{user.role} · {user.email}</div>
          </div>
        </div>

        {error && (
          <div style={{ padding: '10px 14px', borderRadius: 8, background: '#fee2e2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 12, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertCircle size={15} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {isSelf && !isSuperAdmin && (
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Current Password</label>
            <input
              type={showPassword ? 'text' : 'password'}
              required
              className="pos-input"
              style={{ width: '100%' }}
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              placeholder="Enter your current password"
            />
          </div>
        )}

        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600 }}>New Password</label>
            <button
              type="button"
              onClick={generateRandomPassword}
              style={{ background: 'transparent', border: 'none', color: '#4f46e5', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <Sparkles size={11} /> Generate
            </button>
          </div>
          <div style={{ position: 'relative' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              required
              className="pos-input"
              style={{ width: '100%', paddingRight: 40 }}
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="Min 8 characters with letters & numbers"
            />
            <button
              type="button"
              onClick={() => setShowPassword(s => !s)}
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'var(--p-muted)', cursor: 'pointer' }}
            >
              {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Confirm New Password</label>
          <input
            type={showPassword ? 'text' : 'password'}
            required
            className="pos-input"
            style={{ width: '100%' }}
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            placeholder="Re-enter new password"
          />
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 10, borderTop: '1px solid var(--p-border)' }}>
          <button type="button" onClick={onClose} className="pos-button" disabled={busy}>
            Cancel
          </button>
          <button
            type="submit"
            className="pos-button primary"
            disabled={busy}
            style={{ background: 'linear-gradient(135deg, #4f46e5, #3b82f6)', borderColor: '#4f46e5', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            {busy ? <RefreshCw size={14} className="pos-spin" /> : <KeyRound size={14} />}
            <span>Save Password</span>
          </button>
        </div>
      </form>
    </Modal>
  );
}
