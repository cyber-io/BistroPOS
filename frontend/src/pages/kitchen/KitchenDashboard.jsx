import React, { useCallback, useEffect, useState } from 'react';
import { api, subscribeRealtimeEvents } from '../../services/api';
import { tableTitle } from '../../services/tablePresentation';
import { useNotification } from '../../context/NotificationContext';
import { soundEffects } from '../../services/soundEffects';
import { Badge, Empty, Modal, Spinner, label, money, time } from '../../components/pos/PosUI';
import { ChefHat, Clock, Bell, RefreshCw, Search, Check, Ban, AlertCircle, Package } from 'lucide-react';

const tabs = [
  ['NEW', 'New orders', ['NEW', 'ACCEPTED']],
  ['PREPARING', 'Preparing', ['PREPARING']],
  ['READY', 'Ready', ['READY', 'READY_FOR_PICKUP']],
  ['SERVICE', 'In service', ['PENDING_CONFIRMATION', 'CONFIRMATION_TIMEOUT', 'OUT_FOR_DELIVERY']],
  ['DELIVERED', 'Completed', ['DELIVERED', 'PICKED_UP']], ['CANCELLED', 'Cancelled', ['CANCELLED']]
];
function getItemStation(item) {
  const name = (item.name || item.itemName || '').toLowerCase();
  const cat = (item.categoryName || '').toLowerCase();
  if (cat.includes('beverage') || /coffee|mojito|shake|tea|drink|juice|soda/i.test(name)) return 'BEVERAGES';
  if (cat.includes('dessert') || /ice cream|brownie|jamun|cake|dessert/i.test(name)) return 'DESSERTS';
  if (/grill|tikka|bbq|tandoor|roast|kebab/i.test(name)) return 'GRILL';
  return 'MAIN';
}

export default function KitchenDashboard() {
  const { addToast } = useNotification();
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
      if (saved && (tabs.some(([k]) => k === saved) || saved === 'AVAILABILITY' || saved === 'INVENTORY')) {
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
  const [stockModal, setStockModal] = useState(false);
  const [stockItemType, setStockItemType] = useState('DISH');
  const [selectedMenuItemId, setSelectedMenuItemId] = useState('');
  const [customItemName, setCustomItemName] = useState('');
  const [shortageReason, setShortageReason] = useState('Out of stock');
  const [urgency, setUrgency] = useState('HIGH');
  const [markSoldOut, setMarkSoldOut] = useState(true);
  const [stockSubmitting, setStockSubmitting] = useState(false);

  const handleReportShortage = async (e) => {
    e.preventDefault();
    if (stockSubmitting) return;

    const itemName = stockItemType === 'DISH'
      ? menu.find(m => m.menuItemId === selectedMenuItemId)?.name || 'Dish'
      : customItemName.trim();

    if (!itemName) return;

    setStockSubmitting(true);
    try {
      if (stockItemType === 'DISH' && markSoldOut && selectedMenuItemId) {
        const item = menu.find(m => m.menuItemId === selectedMenuItemId);
        if (item && item.availability) {
          await api.updateItemAvailability(item.menuItemId, false);
          setMenu(previous => previous.map(entry => entry.menuItemId === item.menuItemId ? { ...entry, availability: false } : entry));
        }
      }

      addToast(`Stock shortage reported: ${itemName} (${shortageReason}). Management alerted.`, 'warning');
      setStockModal(false);
      setSelectedMenuItemId('');
      setCustomItemName('');
    } catch (err) {
      addToast(err.message || 'Failed to report stock shortage.', 'error');
    } finally {
      setStockSubmitting(false);
    }
  };
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
  const tickets = filtered.filter(order => statuses.includes(order.status));
  const visibleMenu = menu.filter(item => !term || `${item.name} ${item.categoryName}`.toLowerCase().includes(term));
  return <section>
    <div className="pos-heading">
      <div>
        <h1>Kitchen display</h1>
        <p>Keep every ticket moving, from the first order to the last plate.</p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button className="pos-button" onClick={() => setStockModal(true)}>
          <Package size={15} /> Report Stock Shortage
        </button>
        <button className="pos-button" onClick={() => load()} disabled={loading}>
          <RefreshCw size={15} className={loading ? 'pos-spin' : ''} />Refresh
        </button>
      </div>
    </div>

    <div className="pos-toolbar" style={{ gap: 12, marginBottom: 19 }}>
      <div className="pos-segment" style={{ flexWrap: 'wrap' }}>
        {tabs.map(([key, title, states]) => {
          const count = filtered.filter(order => states.includes(order.status)).length;
          return (
            <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
              {title}
              {count > 0 && <span className="pos-count" style={{ marginLeft: 7 }}>{count}</span>}
            </button>
          );
        })}
        {(() => {
          const soldOutCount = menu.filter(item => !item.availability).length;
          return (
            <button className={tab === 'AVAILABILITY' ? 'active' : ''} onClick={() => setTab('AVAILABILITY')}>
              Dish availability
              {soldOutCount > 0 && <span className="pos-count" style={{ marginLeft: 7 }}>{soldOutCount}</span>}
            </button>
          );
        })()}
        <button className={tab === 'INVENTORY' ? 'active' : ''} onClick={() => setTab('INVENTORY')}>
          Raw inventory
          {inventory.filter(i => i.status !== 'IN_STOCK').length > 0 && (
            <span className="pos-count" style={{ marginLeft: 7 }}>
              {inventory.filter(i => i.status !== 'IN_STOCK').length}
            </span>
          )}
        </button>
      </div>
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
    {error && <div className="pos-info-box" role="alert" style={{ color: '#ce626a', marginBottom: 18 }}><AlertCircle size={16} /><span>{error}</span><button className="pos-button small" style={{ marginLeft: 'auto' }} onClick={() => load()}>Try again</button></div>}
    {loading ? <Spinner /> : tab === 'INVENTORY' ? (
      <div className="pos-panel">
        <div className="pos-panel-header">
          <div>
            <h2>Raw Ingredient Inventory</h2>
            <p style={{ color: 'var(--p-muted)', fontSize: 11 }}>Track and restock pantry supplies, produce, dairy, and spices.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="pos-button small" onClick={() => setStockModal(true)}>
              <Package size={13} /> Report Shortage
            </button>
            <span className="pos-count">{inventory.length} ingredients</span>
          </div>
        </div>

        <div style={{ padding: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            {inventory.filter(i => !term || `${i.name} ${i.category}`.toLowerCase().includes(term)).map(item => {
              const isLow = Number(item.currentStock) <= Number(item.minThreshold);
              const isOut = Number(item.currentStock) <= 0;
              return (
                <div key={item.itemId} className="pos-panel" style={{ padding: 14, borderColor: isOut ? '#fca5a5' : isLow ? '#fde047' : undefined }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div>
                      <strong style={{ fontSize: 13, display: 'block' }}>{item.name}</strong>
                      <small style={{ color: 'var(--p-muted)', fontSize: 10, textTransform: 'uppercase', fontWeight: 700 }}>{item.category}</small>
                    </div>
                    <span style={{
                      fontSize: 10,
                      fontWeight: 800,
                      padding: '2px 7px',
                      borderRadius: 6,
                      background: isOut ? '#fee2e2' : isLow ? '#fef9c3' : '#dcfce7',
                      color: isOut ? '#b91c1c' : isLow ? '#854d0e' : '#15803d'
                    }}>
                      {isOut ? 'OUT OF STOCK' : isLow ? 'LOW STOCK' : 'IN STOCK'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div>
                      <span style={{ fontSize: 20, fontWeight: 900 }}>{Number(item.currentStock).toFixed(1)}</span>
                      <span style={{ fontSize: 11, color: 'var(--p-muted)', marginLeft: 4 }}>{item.unit}</span>
                    </div>
                    <span style={{ fontSize: 10, color: 'var(--p-muted)' }}>Min: {item.minThreshold} {item.unit}</span>
                  </div>

                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <button
                      className="pos-button small"
                      style={{ flex: 1 }}
                      disabled={Boolean(busy) || Number(item.currentStock) <= 0}
                      onClick={() => handleAdjustStock(item, -1)}
                    >
                      -1 {item.unit}
                    </button>
                    <button
                      className="pos-button small"
                      style={{ flex: 1 }}
                      disabled={Boolean(busy)}
                      onClick={() => handleAdjustStock(item, 1)}
                    >
                      +1 {item.unit}
                    </button>
                    <button
                      className="pos-button small primary"
                      style={{ flex: 1 }}
                      disabled={Boolean(busy)}
                      onClick={() => handleAdjustStock(item, 5)}
                    >
                      +5 {item.unit}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    ) : tab === 'AVAILABILITY' ? <div className="pos-panel"><div className="pos-panel-header"><h2>Menu availability</h2><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><button className="pos-button small" onClick={() => setStockModal(true)}><Package size={13} /> Report Stock Shortage</button><span className="pos-count">{menu.filter(item => !item.availability).length} sold out</span></div></div>{!visibleMenu.length ? <Empty icon={ChefHat} title="No dishes found">Try a different dish name.</Empty> : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(270px,1fr))' }}>{visibleMenu.map(item => <div className="pos-stock-item" key={item.menuItemId} style={{ padding: 16 }}><img src={item.image} alt="" /><div style={{ minWidth: 0 }}><b>{item.name}</b><small>{item.categoryName}</small></div><button className={`pos-button small ${item.availability ? '' : 'danger'}`} disabled={Boolean(busy)} aria-label={`${item.availability ? 'Mark sold out' : 'Mark available'}: ${item.name}`} onClick={() => toggle(item)} style={{ marginLeft: 'auto' }}>{item.availability ? <Check size={13} /> : <Ban size={13} />}{busy === item.menuItemId ? 'Saving…' : item.availability ? 'Available' : 'Sold out'}</button></div>)}</div>}</div> : !tickets.length ? <div className="pos-panel"><Empty icon={ChefHat} title={error ? 'Orders could not be loaded' : 'The pass is clear'}>{error ? 'Retry when your connection is restored.' : search || source !== 'ALL' || stationFilter !== 'ALL' ? 'No orders match these filters.' : `No ${tabs.find(([key]) => key === tab)?.[1].toLowerCase()} orders right now.`}</Empty></div> : <div className="pos-orders-grid">
      {tickets.map(order => <article className="pos-panel" key={order.orderId} style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <header className="pos-panel-header" style={{ alignItems: 'flex-start' }}>
          <div>
            <strong style={{ fontSize: 12 }}>{order.orderNumber}</strong>
            <p style={{ color: 'var(--p-muted)', fontSize: 9, marginTop: 7 }}>{order.source === 'DINE_IN_QR' ? tableTitle(order) : label(order.source)} · {time(order.createdAt)}</p>
          </div>
          <Badge status={order.status} />
        </header>
        <div style={{ padding: 15, flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--p-muted)', fontSize: 9, marginBottom: 13 }}>
            <Clock size={12} />
            {Math.max(0, Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60000))} min ago
            {order.customerName && !order.customerName.startsWith('Table ') && <span style={{ marginLeft: 'auto' }}>{order.customerName}</span>}
          </div>

          <div style={{ flex: 1 }}>
            {order.items.map((item, index) => {
              const station = item.station || getItemStation(item);
              return (
                <div key={item.orderItemId || index} className="pos-line-item" style={{ padding: '10px 0', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <b>{item.name || item.itemName}</b>
                      {station && (
                        <span style={{
                          fontSize: 9,
                          fontWeight: 700,
                          padding: '1px 4px',
                          borderRadius: 4,
                          background: station === 'GRILL' ? '#ffedd5' : station === 'BEVERAGES' ? '#e0f2fe' : station === 'DESSERTS' ? '#fce7f3' : '#f1f5f9',
                          color: station === 'GRILL' ? '#c2410c' : station === 'BEVERAGES' ? '#0369a1' : station === 'DESSERTS' ? '#be185d' : '#475569'
                        }}>
                          {station}
                        </span>
                      )}
                    </div>
                    {item.customization && Object.keys(item.customization).length > 0 && (
                      <small style={{ display: 'block', color: '#64748b' }}>
                        {Object.entries(item.customization).map(([key, value]) => `${label(key)}: ${Array.isArray(value) ? value.join(', ') : value}`).join(' · ')}
                      </small>
                    )}
                    {item.specialInstruction && <small style={{ color: '#d59b37', display: 'block' }}>Note: {item.specialInstruction}</small>}
                  </div>
                  <b style={{ color: 'var(--p-blue)' }}>×{item.quantity}</b>
                </div>
              );
            })}
            {order.specialInstructions && <div className="pos-info-box" style={{ color: '#b58b3e' }}>{order.specialInstructions}</div>}
            {(order.rejectionReason || order.cancellationReason) && <div className="pos-info-box" style={{ color: '#ce626a' }}>{order.rejectionReason || order.cancellationReason}</div>}
          </div>
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
    {stockModal && (
      <Modal title="Report Stock Shortage" onClose={() => { if (!stockSubmitting) setStockModal(false); }}>
        <form onSubmit={handleReportShortage} style={{ margin: 0, width: '100%', boxSizing: 'border-box' }}>
          <div className="pos-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ color: 'var(--p-muted)', fontSize: 11, margin: 0, lineHeight: 1.6 }}>
              Report an unavailable dish or depleted ingredient to notify staff and update live menus.
            </p>

            <div className="pos-field">
              <span>Item type</span>
              <div className="pos-segment" style={{ display: 'flex', width: '100%', boxSizing: 'border-box' }}>
                <button
                  type="button"
                  className={stockItemType === 'DISH' ? 'active' : ''}
                  onClick={() => setStockItemType('DISH')}
                  style={{ flex: 1 }}
                >
                  Menu dish
                </button>
                <button
                  type="button"
                  className={stockItemType === 'INGREDIENT' ? 'active' : ''}
                  onClick={() => setStockItemType('INGREDIENT')}
                  style={{ flex: 1 }}
                >
                  Raw ingredient / Supply
                </button>
              </div>
            </div>

            {stockItemType === 'DISH' ? (
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

            {stockItemType === 'DISH' && (
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
              onClick={() => setStockModal(false)}
              disabled={stockSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="pos-button primary"
              disabled={stockSubmitting || (stockItemType === 'DISH' ? !selectedMenuItemId : !customItemName.trim())}
            >
              <Package size={14} />
              {stockSubmitting ? 'Reporting…' : 'Report shortage'}
            </button>
          </div>
        </form>
      </Modal>
    )}
  </section>;
}
