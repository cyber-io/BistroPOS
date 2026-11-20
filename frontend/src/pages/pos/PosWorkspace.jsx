import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Plus, Search, RefreshCw, ArrowUpRight, CreditCard, Banknote, Timer, Check, ClipboardCheck, ClipboardList, Package, Armchair, CalendarDays, History, LayoutGrid, Info, AlertCircle, Bell, SlidersHorizontal, UtensilsCrossed, ShoppingBag, Truck, Minus, Trash2, Printer, QrCode, ArrowLeft, CheckCircle2, X, Users, HandPlatter, Coffee, MapPin, Download, Sparkles, ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import QRCode from 'qrcode';
import { api, subscribeRealtimeEvents, uniqueKey } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';
import PosShell from '../../components/pos/PosShell';
import TableFloorPlan, { FloorPlanTable, getDiningAreaTables } from '../../components/pos/TableFloorPlan';
import { Badge, Empty, Spinner, Modal, money, time, label } from '../../components/pos/PosUI';
import ErrorBoundary from '../../components/common/ErrorBoundary';
import { tableLabel, tableTitle, getPublicOrigin, getTableQrUrl } from '../../services/tablePresentation';
import { cleanPhone, getRescheduleNotificationText, getWhatsAppUrl, getSmsUrl } from '../../services/notificationHelpers';

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

function PosDateFilter({
  value,
  onChange,
  labelText = 'Select date',
  allLabel = 'All dates',
  showAllOption = true,
  count = null
}) {
  const isCurrentToday = value === today();
  const isCurrentYesterday = value === yesterday();
  const isCurrentTomorrow = value === tomorrow();

  return (
    <div className="pos-date-picker-wrap" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <div className="pos-segment" style={{ margin: 0 }}>
        {showAllOption && (
          <button
            type="button"
            className={value === '' ? 'active' : ''}
            onClick={() => onChange('')}
            title={allLabel}
          >
            {allLabel}
          </button>
        )}
        <button
          type="button"
          className={isCurrentYesterday ? 'active' : ''}
          onClick={() => onChange(yesterday())}
          title="Yesterday"
        >
          Yesterday
        </button>
        <button
          type="button"
          className={isCurrentToday ? 'active' : ''}
          onClick={() => onChange(today())}
          title="Today"
        >
          Today
        </button>
        <button
          type="button"
          className={isCurrentTomorrow ? 'active' : ''}
          onClick={() => onChange(tomorrow())}
          title="Tomorrow"
        >
          Tomorrow
        </button>
      </div>

      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2, background: 'var(--p-card)', border: '1px solid var(--p-border)', borderRadius: 7, padding: '2px 4px' }}>
        <button
          type="button"
          className="pos-icon-button"
          style={{ width: 24, height: 24, border: 0, padding: 0 }}
          title="Previous day"
          onClick={() => onChange(shiftDate(value || today(), -1))}
        >
          <ChevronLeft size={13} />
        </button>

        <label style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: 'pointer', margin: 0 }}>
          <input
            className="pos-input"
            type="date"
            aria-label={labelText}
            value={value}
            onChange={e => onChange(e.target.value)}
            style={{
              width: 130,
              height: 26,
              fontSize: 11,
              padding: '2px 6px',
              border: 0,
              background: 'transparent',
              fontWeight: 500
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

      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="pos-icon-button"
          title="Clear date (Show all)"
          style={{ width: 22, height: 22, border: 0, padding: 0, color: 'var(--p-muted)' }}
        >
          <X size={11} />
        </button>
      )}

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
function Totals({ order }) { return <div className="pos-detail-totals"><div><span>Subtotal</span><span>{money(order.subtotal)}</span></div><div><span>Tax</span><span>{money(order.tax)}</span></div>{order.discount > 0 && <div><span>Discount</span><span>−{money(order.discount)}</span></div>}{order.deliveryFee > 0 && <div><span>Delivery fee</span><span>{money(order.deliveryFee)}</span></div>}<div className="total"><span>Total payment</span><span>{money(order.total)}</span></div></div>; }

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
    if (value && value !== 'ALL') {
      localStorage.setItem(`bistro_pos_filter_${sec}`, value);
    } else {
      localStorage.removeItem(`bistro_pos_filter_${sec}`);
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

export default function PosWorkspace() {
  const { currentUser } = useAuth();
  const { addToast } = useNotification();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const section = pathname.split('/')[2] || 'dashboard';
  const [data, setData] = useState({ restaurant: null, tables: [], orders: [], reservations: [], menu: [], categories: [], payments: [], issues: [], help: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilterState] = useState(() => getSavedFilter(section));
  const [tableArea, setTableAreaState] = useState(getSavedTableArea);
  const [category, setCategory] = useState('ALL');
  const [dashboardDate, setDashboardDate] = useState(today());
  const [orderDate, setOrderDate] = useState('');
  const [reservationDate, setReservationDate] = useState('');
  const [historyDate, setHistoryDate] = useState('');
  const [dialog, setDialog] = useState(null);
  const [selected, setSelected] = useState(null);
  const [reservationEdit, setReservationEdit] = useState(null);

  const setFilter = useCallback((nextFilter) => {
    setFilterState(prev => {
      const val = typeof nextFilter === 'function' ? nextFilter(prev) : nextFilter;
      saveFilter(section, val);
      return val;
    });
  }, [section]);

  const setTableArea = useCallback((nextArea) => {
    setTableAreaState(prev => {
      const val = typeof nextArea === 'function' ? nextArea(prev) : nextArea;
      saveTableArea(val);
      return val;
    });
  }, []);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [restaurant, tables, orders, reservations, menu, categories, payments, issues, help] = await Promise.all([
        api.getRestaurant(),
        api.getTables(),
        api.getOrders(),
        api.getReservations(),
        api.getMenuItems(),
        api.getCategories(),
        api.getPayments(),
        api.getIssues(),
        api.getHelpRequests()
      ]);
      setData({ restaurant, tables, orders, reservations, menu, categories, payments, issues, help });
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

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
    return () => { unsub(); clearInterval(id); };
  }, [load, addToast]);

  useEffect(() => {
    setFilterState(getSavedFilter(section));
    setQuery('');
    setCategory('ALL');
  }, [section]);

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
  const newReservation = () => { setReservationEdit(null); setDialog('reservation'); };
  const tableOrders = t => data.orders.filter(o => o.tableId === t.tableId && !['CANCELLED', 'CONFIRMATION_TIMEOUT'].includes(o.status) && (!DONE.includes(o.status) || !paidIds.has(o.orderId)));
  const getTableInfo = t => {
    const booking = data.reservations.find(r => r.tableId === t.tableId && !['CANCELLED', 'NO_SHOW', 'COMPLETED'].includes(r.status) && (r.reservationDate?.slice(0, 10) === today() || r.reservationDate?.slice(0, 10) === tomorrow()));
    const orders = tableOrders(t);
    return {
      guestName: t.status === 'RESERVED' ? t.currentCustomerName : null,
      bookingLabel: t.status === 'AVAILABLE' && booking ? `Booked ${booking.reservationTime?.slice(0, 5)}` : null,
      billTotal: orders.length ? money(orders.reduce((sum, order) => sum + order.total, 0)) : null,
    };
  };

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

  const getOrderTabCount = useCallback((id) => {
    const list = orderDate ? data.orders.filter(o => toLocalDate(o.createdAt) === orderDate) : data.orders;
    if (id === 'ALL') return list.length;
    if (id === 'ACTIVE') return list.filter(o => !DONE.includes(o.status)).length;
    if (id === 'READY') return list.filter(o => o.status === 'READY').length;
    if (id === 'COMPLETED') return list.filter(o => ['DELIVERED', 'PICKED_UP'].includes(o.status)).length;
    if (id === 'CANCELLED') return list.filter(o => ['CANCELLED', 'CONFIRMATION_TIMEOUT'].includes(o.status)).length;
    return list.filter(o => o.source === id).length;
  }, [data.orders, orderDate]);

  const getHistoryTabCount = useCallback((id) => {
    const list = data.orders.filter(o => DONE.includes(o.status) && (!historyDate || toLocalDate(o.createdAt) === historyDate));
    if (id === 'ALL') return list.length;
    if (id === 'COMPLETED') return list.filter(o => ['DELIVERED', 'PICKED_UP'].includes(o.status)).length;
    if (id === 'CANCELLED') return list.filter(o => ['CANCELLED', 'CONFIRMATION_TIMEOUT'].includes(o.status)).length;
    return list.filter(o => o.source === id).length;
  }, [data.orders, historyDate]);

  const getReservationTabCount = useCallback((id) => {
    return data.reservations.filter(r => (!reservationDate || r.reservationDate?.slice(0, 10) === reservationDate) && (id === 'ALL' || r.status === id)).length;
  }, [data.reservations, reservationDate]);

  return (
    <PosShell alertCount={openIssues.length + openHelp.length} onAlerts={() => navigate('/pos/notifications')}>
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
                <button className="pos-icon-button" onClick={() => load()} aria-label="Refresh workspace"><RefreshCw size={16} className={loading ? 'pos-spin' : ''} /></button>
                <button className="pos-button primary" onClick={() => newOrder()}><Plus /> Create new order</button>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18, flexWrap: 'wrap', background: 'var(--p-card)', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--p-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CalendarDays size={16} style={{ color: 'var(--p-blue)' }} />
                <span style={{ fontSize: 12, fontWeight: 700 }}>
                  {dashboardDate === today() ? "Today's Service Overview" : dashboardDate === yesterday() ? "Yesterday's Service Summary" : dashboardDate === tomorrow() ? "Tomorrow's Schedule & Bookings" : dashboardDate ? `Service Overview for ${shortDate(dashboardDate)}` : "All-Time Overview"}
                </span>
                {dashboardDate && (
                  <span className="pos-badge" style={{ fontSize: 9 }}>
                    {dashboardDate === today() ? 'Current Date' : dashboardDate < today() ? 'Past Date' : 'Future Date'}
                  </span>
                )}
              </div>
              <PosDateFilter
                value={dashboardDate}
                onChange={setDashboardDate}
                labelText="Filter dashboard date"
                allLabel="All time"
                showAllOption={true}
              />
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
                          <h2>In progress <span className="pos-count">{dashboardActive.length}</span></h2>
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
                          <h2>Waiting for payment <span className="pos-count">{unpaid.length}</span></h2>
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
                        <h2><CalendarDays size={16} style={{ display: 'inline', marginRight: 7, color: 'var(--p-blue)' }} /> Table reservations from website <span className="pos-count">{dashboardReservations.filter(r => !['CANCELLED', 'NO_SHOW', 'COMPLETED'].includes(r.status)).length}</span></h2>
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
                {section === 'orders' ? <ClipboardList /> : section === 'tables' ? <Armchair /> : section === 'reservations' ? <CalendarDays /> : section === 'history' ? <History /> : section === 'inventory' ? <Package /> : <Bell />}
                {({ orders: 'Orders', tables: 'Table overview', reservations: 'Reservations', history: 'Order history', inventory: 'Inventory', notifications: 'Notifications & assistance' })[section] || 'Workspace'}
              </h1>
              <div className="pos-toolbar-actions">
                {section === 'orders' && <PosDateFilter value={orderDate} onChange={setOrderDate} labelText="Filter orders by date" allLabel="All dates" showAllOption={true} />}
                {section === 'history' && <PosDateFilter value={historyDate} onChange={setHistoryDate} labelText="Filter history by date" allLabel="All history" showAllOption={true} />}
                {section === 'reservations' && <PosDateFilter value={reservationDate} onChange={setReservationDate} labelText="Filter reservations by date" allLabel="All dates" showAllOption={true} />}
                {['orders', 'history', 'inventory'].includes(section) && <SearchField value={query} onChange={setQuery} placeholder={section === 'inventory' ? 'Search menu items…' : 'Search order or customer…'} />}
                <button className="pos-icon-button" onClick={() => load()} aria-label="Refresh"><RefreshCw size={15} className={loading ? 'pos-spin' : ''} /></button>
                {section === 'reservations' && <button className="pos-button primary" onClick={newReservation}><Plus /> Add new reservation</button>}
                {!['history', 'notifications', 'inventory', 'reservations'].includes(section) && <button className="pos-button primary" onClick={() => newOrder()}><Plus /> Create new order</button>}
              </div>
            </div>

            {loading ? <Spinner /> : (
              <>

                {section === 'orders' && (
                  <>
                    {orderDate && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--p-card)', border: '1px solid var(--p-border)', borderRadius: 8, marginBottom: 16 }}>
                        <span style={{ fontSize: 11, fontWeight: 600 }}>
                          📋 Showing orders for: <strong style={{ color: 'var(--p-blue)' }}>{orderDate === today() ? 'Today' : orderDate === yesterday() ? 'Yesterday' : orderDate === tomorrow() ? 'Tomorrow' : shortDate(orderDate)}</strong> ({filteredOrders.length} {filteredOrders.length === 1 ? 'order' : 'orders'})
                        </span>
                        <button className="pos-button small" onClick={() => setOrderDate('')}>Show all dates</button>
                      </div>
                    )}
                    <div className="pos-tabs">{[['ALL', 'All orders'], ['ACTIVE', 'In progress'], ['READY', 'Ready to serve'], ['COMPLETED', 'Completed'], ['CANCELLED', 'Cancelled'], ['DINE_IN_QR', 'Dine in'], ['DELIVERY', 'Delivery'], ['TAKEAWAY', 'Takeaway']].map(([id, name]) => { const count = getOrderTabCount(id); return <button className={`pos-tab ${filter === id ? 'active' : ''}`} onClick={() => setFilter(id)} key={id}>{name}{count > 0 && <span>{count}</span>}</button>; })}</div>
                    {filteredOrders.length ? <div className="pos-orders-grid">{filteredOrders.map(o => <OrderCard key={o.orderId} order={o} paid={paidIds.has(o.orderId)} onDetails={openOrder} onPay={pay} />)}</div> : <section className="pos-panel"><Empty title={query || orderDate ? 'No matching orders' : 'No orders found'}>{orderDate ? `No orders found for ${orderDate === today() ? 'today' : shortDate(orderDate)}. Use the calendar to select another date or click "Show all dates".` : query ? 'Try another order number, table or customer name.' : 'Orders will appear here when customers place them.'}</Empty></section>}
                  </>
                )}

                {section === 'history' && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--p-card)', border: '1px solid var(--p-border)', borderRadius: 8, marginBottom: 16 }}>
                      <div>
                        <span style={{ fontSize: 11, fontWeight: 650 }}>
                          📜 {historyDate ? (historyDate === today() ? 'Today’s closed orders' : historyDate === yesterday() ? 'Yesterday’s closed orders' : `Closed orders for ${shortDate(historyDate)}`) : 'All historical orders'} ({filteredOrders.length} {filteredOrders.length === 1 ? 'order' : 'orders'})
                        </span>
                        <span style={{ display: 'block', fontSize: 10, color: 'var(--p-muted)', marginTop: 2 }}>
                          Total closed revenue: <b style={{ color: 'var(--p-text)' }}>{money(filteredOrders.filter(o => ['DELIVERED', 'PICKED_UP'].includes(o.status)).reduce((s, o) => s + Number(o.total || 0), 0))}</b>
                        </span>
                      </div>
                      {historyDate && <button className="pos-button small" onClick={() => setHistoryDate('')}>View all history</button>}
                    </div>
                    <div className="pos-tabs">{[['ALL', 'All history'], ['COMPLETED', 'Completed'], ['CANCELLED', 'Cancelled'], ['DINE_IN_QR', 'Dine in'], ['DELIVERY', 'Delivery'], ['TAKEAWAY', 'Takeaway']].map(([id, name]) => { const count = getHistoryTabCount(id); return <button className={`pos-tab ${filter === id ? 'active' : ''}`} onClick={() => setFilter(id)} key={id}>{name}{count > 0 && <span>{count}</span>}</button>; })}</div>
                    {filteredOrders.length ? <div className="pos-orders-grid">{filteredOrders.map(o => <OrderCard key={o.orderId} order={o} paid={paidIds.has(o.orderId)} onDetails={openOrder} onPay={pay} />)}</div> : <section className="pos-panel"><Empty title={historyDate ? `No history for ${shortDate(historyDate)}` : 'No historical orders'}>{historyDate ? 'No completed or cancelled orders recorded on this date. Select another date with the calendar.' : 'Past closed orders will appear here for audit and reporting.'}</Empty></section>}
                  </>
                )}

                {section === 'tables' && (
                  <>
                    <div className="pos-toolbar pos-table-status-toolbar">
                      <div className="pos-table-status-controls">
                        <span className="pos-table-status-label">Live table status</span>
                        <div className="pos-tabs" style={{ margin: 0 }}>
                          {[['ALL', 'All tables'], ['AVAILABLE', 'Available'], ['OCCUPIED', 'Occupied'], ['RESERVED', 'Reserved'], ['WAITING_FOR_CLEANING', 'Cleaning']].map(([id, name]) => (
                            <button type="button" className={`pos-tab ${filter === id ? 'active' : ''}`} aria-pressed={filter === id} onClick={() => setFilter(id)} key={id}>
                              {name}<span>{id === 'ALL' ? diningAreaTables.length : id === 'WAITING_FOR_CLEANING' ? diningAreaTables.filter(t => ['WAITING_FOR_CLEANING', 'CLEANING'].includes(t.status)).length : diningAreaTables.filter(t => t.status === id).length}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="pos-floor-header">
                        <div className="pos-legend">
                          <span><i /> Available</span>
                          <span><i className="occupied" /> Occupied</span>
                          <span><i className="reserved" /> Reserved</span>
                          <span><i className="cleaning" /> Cleaning</span>
                        </div>
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
                          const activeBooking = data.reservations.find(r => r.tableId === t.tableId && !['CANCELLED', 'NO_SHOW', 'COMPLETED'].includes(r.status) && (r.reservationDate?.slice(0, 10) === today() || r.reservationDate?.slice(0, 10) === tomorrow()));
                          return (
                            <FloorPlanTable
                              key={t.tableId}
                              table={t}
                              layout={layout}
                              onClick={() => { setSelected(t); setDialog('table'); }}
                              aria-label={`${tableTitle(t)}, ${t.capacity} seats, ${label(t.status)}`}
                            >
                              {t.status !== 'AVAILABLE' && <span className="pos-table-status" title={t.status === 'RESERVED' && t.currentCustomerName ? `Reserved · ${t.currentCustomerName}` : label(t.status)}>{t.status === 'RESERVED' && t.currentCustomerName ? `Reserved · ${t.currentCustomerName}` : label(t.status)}</span>}
                              {t.status === 'AVAILABLE' && activeBooking && <span className="pos-table-status pos-plan-booking">Booked {activeBooking.reservationTime?.slice(0, 5)}</span>}
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
                    {reservationDate && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--p-card)', border: '1px solid var(--p-border)', borderRadius: 8, marginBottom: 16 }}>
                        <span style={{ fontSize: 11, fontWeight: 600 }}>
                          📅 Showing reservations for: <strong style={{ color: 'var(--p-blue)' }}>{reservationDate === today() ? 'Today' : reservationDate === yesterday() ? 'Yesterday' : reservationDate === tomorrow() ? 'Tomorrow' : shortDate(reservationDate)}</strong> ({data.reservations.filter(r => (!reservationDate || r.reservationDate?.slice(0, 10) === reservationDate) && (filter === 'ALL' || r.status === filter)).length} bookings)
                        </span>
                        <button className="pos-button small" onClick={() => setReservationDate('')}>Show all dates</button>
                      </div>
                    )}
                    <div className="pos-tabs">{['ALL', 'CONFIRMED', 'ARRIVED', 'SEATED', 'COMPLETED', 'CANCELLED'].map(id => { const count = getReservationTabCount(id); return <button key={id} className={`pos-tab ${filter === id ? 'active' : ''}`} onClick={() => setFilter(id)}>{id === 'ALL' ? 'All reservations' : label(id)}{count > 0 && <span>{count}</span>}</button>; })}</div>
                    {data.reservations.filter(r => (!reservationDate || r.reservationDate?.slice(0, 10) === reservationDate) && (filter === 'ALL' || r.status === filter)).length ? (
                      <div className="pos-data-wrap">
                        <table className="pos-data-table">
                          <thead><tr><th>Reservation</th><th>Guest</th><th>Date & time</th><th>Table / party</th><th>Status</th><th>Actions</th></tr></thead>
                          <tbody>
                            {data.reservations.filter(r => (!reservationDate || r.reservationDate?.slice(0, 10) === reservationDate) && (filter === 'ALL' || r.status === filter)).map(r => (
                              <tr key={r.reservationId}>
                                <td><b>{r.bookingId}</b><small>{r.specialRequest || 'No special requests'}</small></td>
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
                          {reservationDate ? 'Click "All dates" to view all upcoming customer bookings, or pick another date from the calendar.' : 'New website bookings and staff reservations will appear here in real-time.'}
                        </Empty>
                      </section>
                    )}
                  </>
                )}

                {section === 'inventory' && (
                  <div className="pos-inventory-layout">
                    <aside className="pos-filter-card">
                      <h3>Menu categories</h3>
                      <div className="pos-category-list">
                        {[{ categoryId: 'ALL', name: 'All items' }, ...data.categories].map(c => (
                          <button key={c.categoryId} className={category === c.categoryId ? 'active' : ''} onClick={() => setCategory(c.categoryId)}>
                            {c.name}<span>{data.menu.filter(m => c.categoryId === 'ALL' || m.categoryId === c.categoryId).length}</span>
                          </button>
                        ))}
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
                      <p className="pos-section-note">Availability changes appear on the website, QR menu and every ordering channel.</p>
                      <div className="pos-menu-grid">
                        {data.menu.filter(m => (category === 'ALL' || m.categoryId === category) && (filter === 'ALL' || (filter === 'AVAILABLE' ? m.availability : !m.availability)) && m.name.toLowerCase().includes(query.toLowerCase())).map(m => (
                          <article className="pos-menu-card" key={m.menuItemId}>
                            <div className="pos-menu-image">
                              <FoodImage item={m} />
                              <Badge status={m.availability ? 'AVAILABLE' : 'UNAVAILABLE'}>{m.availability ? 'Available' : 'Sold out'}</Badge>
                            </div>
                            <h3><span className={`pos-food-type ${m.vegNonveg === 'VEG' ? '' : 'nonveg'}`} />{m.name}</h3>
                            <p>{m.description}</p>
                            <div className="pos-menu-card-bottom">
                              <strong>{money(m.price)}</strong>
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
                          </article>
                        ))}
                      </div>
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
                          <button className="pos-button small" onClick={() => { setSelected(i); setDialog('resolve-issue'); }}>Resolve issue</button>
                        </footer>
                      </article>
                    ))}
                    {openHelp.map(h => (
                      <article className="pos-issue-card" key={h.requestId}>
                        <div><b>{tableTitle(h)} needs assistance</b><Badge status={h.status} /></div>
                        <p>{h.message}</p>
                        <footer>
                          <span>{h.assignedWaiterName ? `Assigned to ${h.assignedWaiterName}` : `Requested at ${time(h.createdAt)}`}</span>
                          {h.status === 'PENDING' ? (
                            <button className="pos-button small primary" disabled={busy} onClick={() => run(() => api.acceptHelpRequest(h.requestId, currentUser.name), 'Assistance assigned')}>Accept request</button>
                          ) : (
                            <button className="pos-button small" disabled={busy} onClick={() => run(() => api.resolveHelpRequest(h.requestId), 'Help request resolved')}>Mark resolved</button>
                          )}
                        </footer>
                      </article>
                    ))}
                    {!openIssues.length && !openHelp.length && (
                      <section className="pos-panel"><Empty icon={Bell} title="You're all caught up">Customer requests and order issues will appear here.</Empty></section>
                    )}
                  </>
                )}
              </>
            )}
          </>
        )}

        {dialog === 'new-order' && (
          <ErrorBoundary onReset={close}>
            <NewOrder menu={data.menu} categories={data.categories} tables={data.tables} table={selected} restaurant={data.restaurant} onClose={close} onCreated={async order => { close(); addToast(`${order.orderNumber} sent to the kitchen`, 'success'); await load(true); setSelected(order); setDialog('order'); }} />
          </ErrorBoundary>
        )}
        {dialog === 'order' && selected && (
          <ErrorBoundary onReset={close}>
            <OrderDetails order={data.orders.find(o => o.orderId === selected.orderId) || selected} paid={paidIds.has(selected.orderId)} payments={data.payments} restaurant={data.restaurant} onClose={close} onPay={() => pay(selected)} onUpdated={() => load(true)} busy={busy} run={run} />
          </ErrorBoundary>
        )}
        {dialog === 'payment' && selected && (
          <ErrorBoundary onReset={close}>
            <PaymentDialog order={data.orders.find(o => o.orderId === selected.orderId) || selected} restaurant={data.restaurant} onClose={close} onPaid={() => load(true)} />
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
            />
          </ErrorBoundary>
        )}
        {dialog === 'reservation' && (
          <ErrorBoundary onReset={close}>
            <ReservationDialog reservation={reservationEdit} onClose={close} onSaved={async () => { close(); addToast(reservationEdit ? 'Reservation rescheduled' : 'Reservation confirmed', 'success'); await load(true); }} />
          </ErrorBoundary>
        )}
        {dialog === 'cancel-reservation' && (
          <Modal title="Cancel reservation" onClose={close}>
            <div className="pos-modal-body">
              <p style={{ lineHeight: 1.9 }}>Cancel <b>{selected.bookingId}</b> for {selected.customerName}? The assigned table will be released for this time.</p>
            </div>
            <div className="pos-modal-footer">
              <button className="pos-button" onClick={close}>Keep reservation</button>
              <button className="pos-button danger" disabled={busy} onClick={async () => { if (await run(() => api.updateReservationStatus(selected.reservationId, 'CANCELLED'), 'Reservation cancelled')) close(); }}>Cancel reservation</button>
            </div>
          </Modal>
        )}
        {dialog === 'resolve-issue' && (
          <ResolveIssue issue={selected} onClose={close} onResolved={async () => { close(); await load(true); }} />
        )}
      </>}
    </PosShell>
  );
}

function NewOrder({ menu = [], categories = [], tables = [], table, restaurant, onClose, onCreated }) {
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
  const pick = m => { if (m?.customizationOptions?.length || m?.addOns?.length) { setCustom(m); setOptions(Object.fromEntries((m.customizationOptions || []).map(o => [o.name, o.choices?.[0] || '']))); setAddOns([]); setItemNote(''); } else add(m); };
  const add = (m, customization = {}, extra = [], specialInstruction = '') => { if (!m) return; const cost = (Number(m.price) || 0) + (Array.isArray(extra) ? extra : []).reduce((s, a) => s + (Number(a.price) || 0), 0) + Object.values(customization || {}).reduce((s, v) => s + (Number(String(v).match(/\(\+₹(\d+)\)/)?.[1]) || 0), 0); const itemKey = JSON.stringify([m.menuItemId, customization, (extra || []).map(a => a.name), specialInstruction]); setItems(prev => { const found = prev.find(i => i.itemKey === itemKey); return found ? prev.map(i => i.itemKey === itemKey ? { ...i, quantity: i.quantity + 1 } : i) : [...prev, { ...m, itemKey, quantity: 1, price: cost, customization, addOns: extra, specialInstruction }]; }); setCustom(null); };
  const qty = (id, n) => setItems(prev => prev.map(i => i.itemKey === id ? { ...i, quantity: i.quantity + n } : i).filter(i => i.quantity > 0));
  const submit = async () => { setError(''); if (source === 'DINE_IN_QR' && !tableId) return setError('Select a table for this order.'); if (!items.length) return setError('Add at least one menu item.'); setBusy(true); try { const result = await api.createOrder({ source, tableId: source === 'DINE_IN_QR' ? tableId : null, customerName: name || null, customerPhone: phone || null, items, specialInstructions: note, idempotencyKey: key }); await onCreated(result); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  return <Modal wide title="Create new order" onClose={onClose}><div className="pos-new-order-bar"><div className="pos-segment">{[['DINE_IN_QR', 'Dine in'], ['TAKEAWAY', 'Takeaway']].map(([s, title]) => <button key={s} className={source === s ? 'active' : ''} onClick={() => setSource(s)}>{s === 'DINE_IN_QR' ? <UtensilsCrossed size={12} style={{ display: 'inline', marginRight: 5 }} /> : <ShoppingBag size={12} style={{ display: 'inline', marginRight: 5 }} />}{title}</button>)}</div><span className="pos-step-label">01 Select items <span style={{ margin: '0 10px' }}>→</span> 02 Send to kitchen</span></div>{error && <div className="pos-error" style={{ margin: '12px 15px 0' }} role="alert"><AlertCircle size={15} />{error}</div>}<div className="pos-new-order-layout"><div className="pos-new-menu"><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}><strong style={{ fontSize: 12 }}>Menu list</strong><SearchField value={search} onChange={setSearch} placeholder="Search menu…" /></div><div className="pos-tabs">{[{ categoryId: 'ALL', name: 'All items' }, ...safeCategories].map(c => <button key={c.categoryId} className={`pos-tab ${category === c.categoryId ? 'active' : ''}`} onClick={() => setCategory(c.categoryId)}>{c.name}</button>)}</div><div className="pos-menu-grid">{safeMenu.filter(m => (category === 'ALL' || m.categoryId === category) && String(m.name || '').toLowerCase().includes(String(search || '').toLowerCase())).map(m => <article className="pos-menu-card" key={m.menuItemId}><div className="pos-menu-image"><FoodImage item={m} /><Badge status={m.availability ? 'AVAILABLE' : 'UNAVAILABLE'}>{m.availability ? (m.categoryName || 'Available') : 'Sold out'}</Badge></div><h3><span className={`pos-food-type ${m.vegNonveg === 'VEG' ? '' : 'nonveg'}`} />{m.name}</h3><p>{m.description}</p><div className="pos-menu-card-bottom"><strong>{money(m.price)}</strong><button className="pos-button small" disabled={!m.availability} onClick={() => pick(m)}>Add to cart <Plus size={10} /></button></div></article>)}</div></div><div className="pos-new-cart"><div className="pos-new-cart-header"><strong>{custom ? 'Customize item' : 'Order details'}</strong>{custom ? <button className="pos-icon-button" onClick={() => setCustom(null)} aria-label="Back to order"><ArrowLeft size={15} /></button> : <span className="pos-count">{items.reduce((n, i) => n + (Number(i.quantity) || 0), 0)} items</span>}</div>{custom ? <><div className="pos-new-cart-items"><FoodImage item={custom} className="pos-custom-photo" /><h3 style={{ fontWeight: 650, margin: '12px 0' }}>{custom.name}</h3>{custom.customizationOptions?.map(o => <label key={o.name} className="pos-field" style={{ marginBottom: 15 }}><span>{o.name}</span><select className="pos-select" style={{ width: '100%' }} value={options[o.name]} onChange={e => setOptions({ ...options, [o.name]: e.target.value })}>{(o.choices || []).map(c => <option key={c}>{c}</option>)}</select></label>)}{!!custom.addOns?.length && <div className="pos-field" style={{ marginBottom: 15 }}><span>Add something extra</span>{custom.addOns.map(a => <label key={a.name} style={{ display: 'flex', gap: 7, fontSize: 10, padding: '6px 0' }}><input type="checkbox" checked={addOns.some(x => x.name === a.name)} onChange={e => setAddOns(e.target.checked ? [...addOns, a] : addOns.filter(x => x.name !== a.name))} />{a.name}<span style={{ marginLeft: 'auto' }}>{money(a.price)}</span></label>)}</div>}<label className="pos-field"><span>Special instructions</span><textarea className="pos-textarea" value={itemNote} maxLength={500} onChange={e => setItemNote(e.target.value)} placeholder="Less spicy, sauce on the side…" /></label></div><div className="pos-cart-totals"><button className="pos-button primary full" onClick={() => add(custom, options, addOns, itemNote)}><Plus /> Add to order</button></div></> : <><div className="pos-new-cart-info">{source === 'DINE_IN_QR' && <label className="pos-field"><span>Table</span><select className="pos-select" value={tableId} onChange={e => setTableId(e.target.value)} style={{ width: '100%' }}><option value="">Select table</option>{safeTables.filter(t => !['OUT_OF_SERVICE', 'WAITING_FOR_CLEANING', 'CLEANING'].includes(t.status)).map(t => <option key={t.tableId} value={t.tableId}>{tableLabel(t)} · {t.capacity} people · {label(t.status)}</option>)}</select></label>}<input className="pos-input" value={name} maxLength={255} onChange={e => setName(e.target.value)} placeholder="Customer name (optional)" aria-label="Customer name" /><input className="pos-input" value={phone} maxLength={30} onChange={e => setPhone(e.target.value)} placeholder="Phone (optional)" type="tel" aria-label="Customer phone" /></div><div className="pos-new-cart-items">{items.length ? items.map(i => <div className="pos-new-cart-item" key={i.itemKey}><FoodImage item={i} /><div><b>{i.name}</b>{Object.keys(i.customization || {}).length > 0 && <small style={{ display: 'block', color: 'var(--p-muted)', fontSize: 8, marginBottom: 4 }}>{Object.values(i.customization).join(', ')}</small>}<small>{money(i.price * i.quantity)}</small></div><div className="pos-qty"><button aria-label={`Remove one ${i.name}`} onClick={() => qty(i.itemKey, -1)}><Minus size={11} /></button><span>{i.quantity}</span><button aria-label={`Add one ${i.name}`} onClick={() => qty(i.itemKey, 1)}><Plus size={11} /></button></div></div>) : <Empty icon={ShoppingBag} title="Start with something delicious">Select items from the menu to build this order.</Empty>}<textarea className="pos-textarea" value={note} onChange={e => setNote(e.target.value)} placeholder="Order notes for the kitchen…" aria-label="Order notes" maxLength={1000} style={{ minHeight: 55, marginTop: 12 }} /></div><div className="pos-cart-totals"><div><span>Subtotal</span><span>{money(subtotal)}</span></div><div><span>Tax ({taxRate * 100}%)</span><span>{money(tax)}</span></div><div className="total"><b>Total payment</b><strong>{money(subtotal + tax)}</strong></div><button className="pos-button primary full" disabled={busy || !items.length} onClick={submit}>{busy ? <RefreshCw className="pos-spin" /> : <ClipboardCheck />}{busy ? 'Sending order…' : 'Create order & send to kitchen'}</button><p style={{ fontSize: 8, color: 'var(--p-muted)', textAlign: 'center', marginTop: 9 }}>Final prices are confirmed by the restaurant.</p></div></>}</div></div></Modal>;
}

function OrderDetails({ order, paid, payments, restaurant, onClose, onPay, onUpdated, run, busy }) {
  const transition = async status => {
    if (await run(() => api.updateOrderStatus(order.orderId, status), `Order ${label(status).toLowerCase()}`)) {
      onUpdated();
    }
  };

  const items = order?.items || [];
  return (
    <Modal title="Order details" onClose={onClose}>
      <div className="pos-modal-body">
        <div className="pos-detail-heading">
          <strong>{order?.orderNumber}</strong>
          <Badge status={order?.status} />
        </div>
        <div className="pos-detail-meta">
          <div>
            <span>Order type</span>
            <b>{SOURCES[order?.source] || 'Order'}{order?.tableNumber ? ` · ${tableTitle(order)}` : ''}</b>
          </div>
          <div>
            <span>Placed at</span>
            <b>{time(order?.createdAt)} · {new Date(order?.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</b>
          </div>
          <div>
            <span>Customer</span>
            <b>{order?.customerName || 'Guest'}</b>
          </div>
          <div>
            <span>Payment</span>
            <Badge status={paid ? 'PAID' : 'PENDING'} />
          </div>
        </div>
        {items.map((i, index) => {
          const cust = typeof i.customization === 'object' && i.customization !== null ? i.customization : {};
          return (
            <div className="pos-line-item" key={index}>
              <div>
                <b>{i.quantity}× {i.name || i.itemName || 'Item'}</b>
                {Object.keys(cust).length > 0 && (
                  <small>{Object.entries(cust).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join(' · ')}</small>
                )}
                {i.specialInstruction && <small>{i.specialInstruction}</small>}
              </div>
              <b>{money(i.lineTotal)}</b>
            </div>
          );
        })}
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
      </div>
      <div className="pos-modal-footer">
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
  const total = Number(order?.total) || (subtotal + tax);
  return (
    <div className="pos-receipt-only">
      <div className="pos-receipt-header">
        <h2>{restaurant?.name || 'Bistro & Bloom'}</h2>
        <p>{restaurant?.address || 'Plot 42, Gourmet Boulevard, Cyber Hub, Gurugram, HR – 122002'}<br />{restaurant?.phone || '+91 98765 43210'}</p>
      </div>
      <div className="pos-receipt-dash" />
      <div className="pos-receipt-row">
        <b>{order?.orderNumber}</b>
        <span>{SOURCES[order?.source] || 'Dine in'}</span>
      </div>
      <div className="pos-receipt-row">
        <span>{new Date(order?.createdAt || Date.now()).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'medium' })}</span>
      </div>
      {order?.tableNumber && (
        <div className="pos-receipt-row">
          <span>{tableTitle(order)}</span>
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
  const rawDue = Math.max(0, Number(order?.total || 0) - Number(order?.paidAmount || 0));
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
  const upiUri = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(restaurant?.name || 'Bistro & Bloom')}&am=${due.toFixed(2)}&cu=INR&tn=${encodeURIComponent(`Order ${order?.orderNumber || ''}`)}`;

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
      await api.recordPayment({
        restaurantId: order?.restaurantId || restaurant?.restaurantId,
        orderId: order.orderId,
        amount: due,
        method,
        transactionId: `TXN-${Date.now().toString(36).toUpperCase()}`,
        idempotencyKey: txnKey
      });
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
                  <strong>Floor staff notified:</strong> {tableTitle(order)} is marked for <strong>CLEANING</strong>. It will be automatically marked available in <strong>2 minutes</strong>.
                </span>
              </div>
            )}
            <div className="pos-detail-meta">
              <div><span>Order</span><b>{order?.orderNumber}</b></div>
              <div><span>Payment method</span><b>{paidMethod === 'UPI' ? 'UPI / QR Code' : paidMethod === 'CARD' ? 'Card' : paidMethod === 'NET_BANKING' ? 'Net Banking' : 'Cash'}</b></div>
              <div><span>Amount received</span><b>{money(due)}</b></div>
              {order?.tableNumber && <div><span>Table</span><b>{tableTitle(order)}</b></div>}
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

function TableDialog({ restaurant, table, orders, reservations, onClose, busy, run, onOrder, onNew, onPay, paidIds }) {
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
              <a className="pos-text-link" style={{ marginTop: 12, display: 'inline-block' }} href={qrUrl} target="_blank" rel="noreferrer">
                Open table menu <ArrowUpRight size={11} />
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
        const updated = res.reservation || res;
        setRescheduledRes(updated);
        await onSaved();
      } else {
        await api.createReservation(form);
        await onSaved();
        onClose();
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

function ResolveIssue({ issue, onClose, onResolved }) {
  const [resolution, setResolution] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const submit = async e => { e.preventDefault(); setBusy(true); try { await api.resolveIssue(issue.issueId, resolution); onResolved(); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  return <Modal title="Resolve customer issue" onClose={onClose}><form onSubmit={submit}><div className="pos-modal-body"><p className="pos-section-note">{issue.description}</p>{error && <div className="pos-error">{error}</div>}<label className="pos-field"><span>Resolution notes</span><textarea className="pos-textarea" required minLength={3} maxLength={2000} value={resolution} onChange={e => setResolution(e.target.value)} placeholder="Describe how the issue was resolved…" /></label></div><div className="pos-modal-footer"><button className="pos-button" type="button" onClick={onClose}>Cancel</button><button className="pos-button primary" disabled={busy || !resolution.trim()} type="submit">{busy ? 'Saving…' : 'Mark resolved'}</button></div></form></Modal>;
}
