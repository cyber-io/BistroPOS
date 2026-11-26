import React, { useCallback, useEffect, useState } from 'react';
import { api, subscribeRealtimeEvents } from '../../services/api';
import { tableTitle } from '../../services/tablePresentation';
import { useNotification } from '../../context/NotificationContext';
import { soundEffects } from '../../services/soundEffects';
import { Badge, Empty, Modal, Spinner, label, money, time } from '../../components/pos/PosUI';
import { ChefHat, Clock, Bell, RefreshCw, Search, Check, Ban, AlertCircle, Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

const tabs = [
  ['NEW', 'New orders', ['NEW', 'ACCEPTED']],
  ['PREPARING', 'Preparing', ['PREPARING']],
];

function getLocalDateString(value = new Date()) {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value).slice(0, 10) : parsed.toLocaleDateString('en-CA');
}

function getShiftedDate(dateStr, days) {
  const base = dateStr ? new Date(`${dateStr}T12:00:00`) : new Date();
  base.setDate(base.getDate() + days);
  return base.toLocaleDateString('en-CA');
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return '';
  const parsed = new Date(`${String(dateStr).slice(0, 10)}T12:00:00`);
  return Number.isNaN(parsed.getTime())
    ? String(dateStr)
    : parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getItemStation(item) {
  const explicit = String(item?.station || '').trim().toUpperCase();
  if (['MAIN', 'GRILL', 'BEVERAGES', 'DESSERTS'].includes(explicit)) return explicit;
  const labelText = `${item?.categoryName || ''} ${item?.name || ''}`.toLowerCase();
  if (/coffee|tea|latte|shake|juice|mocktail|mojito|soda|lemonade|drink|beverage/.test(labelText)) return 'BEVERAGES';
  if (/cake|brownie|tiramisu|ice cream|pastry|gulab|jamun|halwa|cheesecake|dessert|sweet/.test(labelText)) return 'DESSERTS';
  if (/grill|tikka|kebab|tandoor|steak|burger|bbq|skewers|roast/.test(labelText)) return 'GRILL';
  return 'MAIN';
}

export default function KitchenDashboard() {
  const { addToast } = useNotification();
  const todayStr = getLocalDateString(new Date());
  const yesterdayStr = getShiftedDate(todayStr, -1);
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [dateFilterMode, setDateFilterMode] = useState('DATE');
  const [orders, setOrders] = useState([]);
  const [menu, setMenu] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [stationFilter, setStationFilterState] = useState(() => {
    try {
      const saved = localStorage.getItem('bistro_kitchen_station');
      if (saved && ['ALL', 'MAIN', 'GRILL', 'BEVERAGES', 'DESSERTS'].includes(saved)) {
        return saved;
      }
    } catch {
      // ignore
    }
    return 'ALL';
  });

  const setStationFilter = useCallback((st) => {
    setStationFilterState(prev => {
      const val = typeof st === 'function' ? st(prev) : st;
      try {
        localStorage.setItem('bistro_kitchen_station', val);
      } catch {
        // ignore
      }
      return val;
    });
  }, []);
  const [tab, setTabState] = useState(() => {
    try {
      const saved = localStorage.getItem('bistro_kitchen_tab');
      if (saved && (tabs.some(([k]) => k === saved) || saved === 'INVENTORY')) {
        return saved;
      }
    } catch {
      // ignore
    }
    return 'NEW';
  });

  const setTab = useCallback((nextTab) => {
    setTabState(prev => {
      const val = typeof nextTab === 'function' ? nextTab(prev) : nextTab;
      try {
        localStorage.setItem('bistro_kitchen_tab', val);
      } catch {
        // ignore
      }
      return val;
    });
  }, []);
  const [source, setSource] = useState('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);
  const [rejectOrder, setRejectOrder] = useState(null);
  const [reason, setReason] = useState('Ingredients out of stock');
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [nextOrders, items, inv] = await Promise.all([
        api.getOrders(),
        api.getMenuItems(),
        api.getInventory().catch(() => [])
      ]);
      setOrders(nextOrders); setMenu(items); setInventory(inv); setError('');
    } catch (err) { setError(err.message || 'Unable to load kitchen orders. Please try again.'); }
    finally { if (!silent) setLoading(false); }
  }, []);

  const handleAdjustStock = async (item, delta) => {
    if (busy) return;
    setBusy(item.itemId);
    try {
      await api.updateInventoryStock(item.itemId, delta, 'Quick adjustment from kitchen panel');
      setInventory(prev => prev.map(i => i.itemId === item.itemId ? { ...i, currentStock: Math.max(0, Number(i.currentStock) + delta) } : i));
      addToast(`Updated stock for ${item.name}`, 'success');
    } catch (err) {
      addToast(err.message || 'Failed to update stock', 'error');
    } finally {
      setBusy(null);
    }
  };

  const handleItemStatusToggle = async (orderId, orderItemId, currentStatus) => {
    const nextStatus = currentStatus === 'PENDING' ? 'PREPARING' : currentStatus === 'PREPARING' ? 'READY' : 'READY';
    try {
      await api.updateOrderItemStatus(orderItemId, nextStatus);
      setOrders(prev => prev.map(o => {
        if (o.orderId !== orderId) return o;
        return {
          ...o,
          items: o.items.map(i => i.orderItemId === orderItemId ? { ...i, preparationStatus: nextStatus } : i)
        };
      }));
      addToast(`Dish marked as ${nextStatus}`, 'success');
    } catch (err) {
      addToast(err.message || 'Could not update dish status', 'error');
    }
  };
  useEffect(() => {
    load();
    const unsubscribe = subscribeRealtimeEvents((type, payload) => {
      if (['NEW_ORDER', 'ORDER_STATUS_CHANGED', 'FOOD_AVAILABILITY_CHANGED'].includes(type)) {
        if (type === 'NEW_ORDER') {
          try { soundEffects.playNewOrder(); } catch {}
        }
        load(true);
      }
    });
    const heartbeat = setInterval(() => load(true), 3000);
    return () => { unsubscribe(); clearInterval(heartbeat); };
  }, [load]);
  const transition = async (order, status, rejectionReason) => {
    if (busy) return;
    setBusy(order.orderId);
    try {
      await api.updateOrderStatus(order.orderId, status, rejectionReason);
      addToast(status === 'CANCELLED' ? 'Order rejected. The customer can see the reason.' : status === 'PREPARING' ? 'Order accepted by kitchen & moved to preparation.' : order.source === 'TAKEAWAY' ? 'Order is ready for customer collection.' : order.source === 'DELIVERY' ? 'Order is ready for delivery dispatch.' : 'Order is ready. Floor staff have been notified.', status === 'CANCELLED' ? 'warning' : 'success');
      setRejectOrder(null); await load(true);
    } catch (err) { addToast(err.message, 'error'); }
    finally { setBusy(null); }
  };
  const toggle = async item => {
    if (busy) return;
    setBusy(item.menuItemId);
    try {
      await api.updateItemAvailability(item.menuItemId, !item.availability);
      setMenu(previous => previous.map(entry => entry.menuItemId === item.menuItemId ? { ...entry, availability: !item.availability } : entry));
      addToast(`${item.name} is ${item.availability ? 'sold out' : 'available'}.`, 'success');
    } catch (err) { addToast(err.message, 'error'); }
    finally { setBusy(null); }
  };
  const term = search.trim().toLowerCase();
  const matches = order =>
    (source === 'ALL' || order.source === source) &&
    (stationFilter === 'ALL' || order.items.some(i => getItemStation(i) === stationFilter)) &&
    (!term || [order.orderNumber, order.tableNumber ? `${tableTitle(order)} table ${order.tableNumber}` : '', order.customerName, ...order.items.map(item => item.name)].join(' ').toLowerCase().includes(term));
  const filtered = orders.filter(matches);
  const statuses = tabs.find(([key]) => key === tab)?.[2] || [];

  const isDateFilterTab = tab === 'DELIVERED';
  const tickets = filtered.filter(order => {
    if (!statuses.includes(order.status)) return false;
    if (isDateFilterTab && dateFilterMode === 'DATE') {
      return getLocalDateString(order.createdAt) === selectedDate;
    }
    return true;
  });

  const getTabCount = (key, states) => {
    return filtered.filter(order => {
      if (!states.includes(order.status)) return false;
      if (key === 'DELIVERED' && dateFilterMode === 'DATE') {
        return getLocalDateString(order.createdAt) === selectedDate;
      }
      return true;
    }).length;
  };

  const visibleMenu = menu.filter(item => !term || `${item.name} ${item.categoryName}`.toLowerCase().includes(term));
  return <section>
    <div className="pos-heading">
      <div>
        <h1>Kitchen display</h1>
        <p>Keep every ticket moving, from the first order to the last plate.</p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button className="pos-button" onClick={() => load()} disabled={loading}>
          <RefreshCw size={15} className={loading ? 'pos-spin' : ''} />Refresh
        </button>
      </div>
    </div>

    <div className="pos-toolbar" style={{ gap: 12, marginBottom: 19 }}>
      <div className="pos-segment" style={{ flexWrap: 'wrap' }}>{tabs.map(([key, title, states]) => { const count = getTabCount(key, states); return <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{title}{count > 0 && <span className="pos-count" style={{ marginLeft: 7 }}>{count}</span>}</button>; })}</div>
      <div className="pos-toolbar-actions" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div className="pos-search" style={{ minWidth: 260 }}>
          <Search size={15} />
          <input
            className="pos-input"
            aria-label="Search kitchen tickets or dishes"
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder={tab === 'AVAILABILITY' ? 'Search dishes…' : tab === 'INVENTORY' ? 'Search raw supplies…' : 'Search order, table or dish…'}
          />
        </div>
        {tab !== 'AVAILABILITY' && tab !== 'INVENTORY' && (
          <>
            <select
              aria-label="Kitchen station"
              value={stationFilter}
              onChange={event => setStationFilter(event.target.value)}
              className="pos-select"
              style={{ height: 37, minHeight: 37, minWidth: 125 }}
            >
              <option value="ALL">All stations</option>
              <option value="MAIN">Main Kitchen</option>
              <option value="GRILL">Grill Station</option>
              <option value="BEVERAGES">Beverages</option>
              <option value="DESSERTS">Desserts</option>
            </select>
            <select
              aria-label="Order source"
              value={source}
              onChange={event => setSource(event.target.value)}
              className="pos-select"
              style={{ height: 37, minHeight: 37, minWidth: 125 }}
            >
              <option value="ALL">All sources</option>
              <option value="DINE_IN_QR">Dine in</option>
              <option value="DELIVERY">Delivery</option>
              <option value="TAKEAWAY">Takeaway</option>
            </select>
          </>
        )}
      </div>
    </div>

    {tab === 'DELIVERED' && (
      <div
        className="pos-panel"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          padding: '10px 16px',
          marginBottom: 19,
          background: 'var(--p-card)',
          borderRadius: 10,
          border: '1px solid var(--p-border)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, fontSize: 11, color: 'var(--p-muted)', letterSpacing: '0.4px' }}>
            <Calendar size={15} style={{ color: 'var(--p-blue)' }} />
            <span>COMPLETED DATE:</span>
          </div>

          <div className="pos-segment" style={{ padding: 2, background: 'var(--p-elevated)', borderRadius: 8 }}>
            <button
              type="button"
              className={dateFilterMode === 'DATE' && selectedDate === todayStr ? 'active' : ''}
              style={{ padding: '5px 12px', fontSize: 11, borderRadius: 6 }}
              onClick={() => { setSelectedDate(todayStr); setDateFilterMode('DATE'); }}
            >
              Today
            </button>
            <button
              type="button"
              className={dateFilterMode === 'DATE' && selectedDate === yesterdayStr ? 'active' : ''}
              style={{ padding: '5px 12px', fontSize: 11, borderRadius: 6 }}
              onClick={() => { setSelectedDate(yesterdayStr); setDateFilterMode('DATE'); }}
            >
              Yesterday
            </button>
            <button
              type="button"
              className={dateFilterMode === 'ALL' ? 'active' : ''}
              style={{ padding: '5px 12px', fontSize: 11, borderRadius: 6 }}
              onClick={() => setDateFilterMode('ALL')}
            >
              All Dates
            </button>
          </div>

          {dateFilterMode === 'DATE' && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--p-elevated)', padding: '2px 6px', borderRadius: 8, border: '1px solid var(--p-border)' }}>
              <button
                type="button"
                className="pos-icon-button"
                style={{ width: 26, height: 26, border: 0, padding: 0, background: 'transparent' }}
                title="Previous day"
                onClick={() => setSelectedDate(prev => getShiftedDate(prev, -1))}
              >
                <ChevronLeft size={14} />
              </button>

              <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', margin: 0, gap: 5, padding: '0 4px' }}>
                <input
                  type="date"
                  aria-label="Filter completed orders by date"
                  value={selectedDate}
                  max={todayStr}
                  onChange={e => {
                    if (e.target.value) {
                      setSelectedDate(e.target.value);
                      setDateFilterMode('DATE');
                    }
                  }}
                  style={{
                    height: 26,
                    fontSize: 11,
                    padding: '2px 8px',
                    border: '1px solid var(--p-border)',
                    borderRadius: 6,
                    background: 'var(--p-card)',
                    color: 'var(--p-text)',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                />
              </label>

              <button
                type="button"
                className="pos-icon-button"
                style={{ width: 26, height: 26, border: 0, padding: 0, background: 'transparent' }}
                title="Next day"
                disabled={selectedDate >= todayStr}
                onClick={() => setSelectedDate(prev => getShiftedDate(prev, 1))}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: 'var(--p-muted)' }}>
          <span>
            Orders for:{' '}
            <strong style={{ color: 'var(--p-text)' }}>
              {dateFilterMode === 'ALL' ? 'All historical records' : `${formatDisplayDate(selectedDate)} (${selectedDate})`}
            </strong>
          </span>
          <span className="pos-count" style={{ background: 'var(--p-blue-soft)', color: 'var(--p-blue)', fontWeight: 700, padding: '3px 8px', borderRadius: 6 }}>
            {tickets.length} {tickets.length === 1 ? 'ticket' : 'tickets'}
          </span>
        </div>
      </div>
    )}

    {error && <div className="pos-info-box" role="alert" style={{ color: '#ce626a', marginBottom: 18 }}><AlertCircle size={16} /><span>{error}</span><button className="pos-button small" style={{ marginLeft: 'auto' }} onClick={() => load()}>Try again</button></div>}
    {loading ? <Spinner /> : tab === 'AVAILABILITY' ? <div className="pos-panel"><div className="pos-panel-header"><h2>Menu availability</h2><span className="pos-count">{menu.filter(item => !item.availability).length} sold out</span></div>{!visibleMenu.length ? <Empty icon={ChefHat} title="No dishes found">Try a different dish name.</Empty> : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(270px,1fr))' }}>{visibleMenu.map(item => <div className="pos-stock-item" key={item.menuItemId} style={{ padding: 16 }}><img src={item.image} alt="" /><div style={{ minWidth: 0 }}><b>{item.name}</b><small>{item.categoryName}</small></div><button className={`pos-button small ${item.availability ? '' : 'danger'}`} disabled={Boolean(busy)} aria-label={`${item.availability ? 'Mark sold out' : 'Mark available'}: ${item.name}`} onClick={() => toggle(item)} style={{ marginLeft: 'auto' }}>{item.availability ? <Check size={13} /> : <Ban size={13} />}{busy === item.menuItemId ? 'Saving…' : item.availability ? 'Available' : 'Sold out'}</button></div>)}</div>}</div> : !tickets.length ? <div className="pos-panel"><Empty icon={ChefHat} title={error ? 'Orders could not be loaded' : 'The pass is clear'}>{error ? 'Retry when your connection is restored.' : search || source !== 'ALL' ? 'No orders match these filters.' : `No ${tabs.find(([key]) => key === tab)?.[1].toLowerCase()} orders right now.`}</Empty></div> : <div className="pos-orders-grid">
      {tickets.map(order => <article className="pos-panel" key={order.orderId} style={{ display: 'flex', flexDirection: 'column' }}>
        <header className="pos-panel-header" style={{ alignItems: 'flex-start' }}><div><strong style={{ fontSize: 12 }}>{order.orderNumber}</strong><p style={{ color: 'var(--p-muted)', fontSize: 9, marginTop: 7 }}>{order.source === 'DINE_IN_QR' ? tableTitle(order) : label(order.source)} · {time(order.createdAt)}</p></div><Badge status={order.status} /></header>
        <div style={{ padding: 15, flex: 1 }}><div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--p-muted)', fontSize: 9, marginBottom: 13 }}><Clock size={12} />{Math.max(0, Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60000))} min ago{order.customerName && !order.customerName.startsWith('Table ') && <span style={{ marginLeft: 'auto' }}>{order.customerName}</span>}</div>
          {order.items.map((item, index) => <div key={item.orderItemId || index} className="pos-line-item" style={{ padding: '10px 0', alignItems: 'flex-start' }}><div><b>{item.name}</b>{item.customization && Object.keys(item.customization).length > 0 && <small>{Object.entries(item.customization).map(([key, value]) => `${label(key)}: ${Array.isArray(value) ? value.join(', ') : value}`).join(' · ')}</small>}{item.specialInstruction && <small style={{ color: '#d59b37' }}>Note: {item.specialInstruction}</small>}</div><b style={{ color: 'var(--p-blue)' }}>×{item.quantity}</b></div>)}
          {order.specialInstructions && <div className="pos-info-box" style={{ color: '#b58b3e' }}>{order.specialInstructions}</div>}{(order.rejectionReason || order.cancellationReason) && <div className="pos-info-box" style={{ color: '#ce626a' }}>{order.rejectionReason || order.cancellationReason}</div>}
        </div>
        <footer style={{ borderTop: '1px solid var(--p-border)', padding: 12, marginTop: 'auto' }}>
          {order.status === 'NEW' || order.status === 'ACCEPTED' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
              <button className="pos-button danger small" disabled={Boolean(busy)} onClick={() => { setRejectOrder(order); setReason('Ingredients out of stock'); }}>Reject</button>
              <button className="pos-button primary small" disabled={Boolean(busy)} onClick={() => transition(order, 'PREPARING')}><Check size={13} style={{ display: 'inline', marginRight: 4 }} />{busy === order.orderId ? 'Accepting…' : 'Accept order'}</button>
            </div>
          ) : order.status === 'PREPARING' ? (
            <button className="pos-button primary full" disabled={Boolean(busy)} onClick={() => transition(order, order.source === 'TAKEAWAY' ? 'READY_FOR_PICKUP' : 'READY')}><Bell size={14} />{busy === order.orderId ? 'Saving…' : 'Mark ready'}</button>
          ) : (
            <p style={{ textAlign: 'center', color: 'var(--p-muted)', fontSize: 9 }}>
              {order.status === 'READY_FOR_PICKUP' ? 'Waiting for customer collection' : order.status === 'READY' ? order.source === 'DINE_IN_QR' ? 'Waiting for floor staff' : 'Waiting for delivery dispatch' : order.status === 'CONFIRMATION_TIMEOUT' ? 'Front desk is checking delivery' : label(order.status)} · {money(order.total)}
            </p>
          )}
        </footer>
      </article>)}
    </div>}
    {rejectOrder && <Modal title={`Reject ${rejectOrder.orderNumber}`} onClose={() => { if (!busy) setRejectOrder(null); }}><div className="pos-modal-body"><p style={{ color: 'var(--p-muted)', fontSize: 11, lineHeight: 1.8, marginBottom: 18 }}>Let the customer know why their order cannot be prepared.</p><label className="pos-field"><span>Reason</span><select className="pos-select" style={{ width: '100%' }} value={reason} onChange={event => setReason(event.target.value)}><option>Ingredients out of stock</option><option>Kitchen at maximum capacity</option><option>Special request cannot be fulfilled</option><option>Kitchen closing shortly</option></select></label><button className="pos-button danger full" style={{ marginTop: 20 }} disabled={Boolean(busy)} onClick={() => transition(rejectOrder, 'CANCELLED', reason)}>{busy ? 'Saving…' : 'Confirm rejection'}</button></div></Modal>}
  </section>;
}
