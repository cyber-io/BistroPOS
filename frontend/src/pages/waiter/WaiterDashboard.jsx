import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, subscribeRealtimeEvents } from '../../services/api';
import { tableTitle } from '../../services/tablePresentation';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';
import { soundEffects } from '../../services/soundEffects';
import { Badge, Empty, Spinner, time } from '../../components/pos/PosUI';
import { Bell, HelpCircle, CheckCircle2, Clock, UserCheck, RefreshCw, AlertCircle, HandPlatter, Sparkles } from 'lucide-react';

function CleaningCountdown({ acceptedAt, onMarkAvailable, busy }) {
  const [secondsLeft, setSecondsLeft] = useState(() => {
    const elapsed = Math.floor((Date.now() - new Date(acceptedAt || Date.now()).getTime()) / 1000);
    return Math.max(0, 120 - elapsed);
  });
  const autoTriggered = useRef(false);

  useEffect(() => {
    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - new Date(acceptedAt || Date.now()).getTime()) / 1000);
      const remaining = Math.max(0, 120 - elapsed);
      setSecondsLeft(remaining);
      if (remaining === 0 && !autoTriggered.current) {
        autoTriggered.current = true;
        onMarkAvailable?.();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [acceptedAt, onMarkAvailable]);

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const isCompleted = secondsLeft === 0;

  return (
    <div style={{
      marginTop: 12,
      padding: '12px 14px',
      borderRadius: 9,
      background: isCompleted ? 'rgba(34, 197, 94, 0.08)' : 'rgba(217, 168, 75, 0.09)',
      border: `1px solid ${isCompleted ? 'rgba(34, 197, 94, 0.35)' : 'rgba(217, 168, 75, 0.35)'}`
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, color: isCompleted ? '#16a34a' : '#d9a84b' }}>
          <Clock size={13} />
          {isCompleted ? 'Cleaning time completed (2 mins)' : 'Cleaning countdown (2 mins)'}
        </span>
        <strong style={{ fontSize: 13, fontFamily: 'monospace', fontWeight: 700, color: isCompleted ? '#16a34a' : 'inherit' }}>
          {isCompleted ? 'Ready!' : `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`}
        </strong>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: 'rgba(0,0,0,0.06)', overflow: 'hidden', marginBottom: 10 }}>
        <div style={{
          height: '100%',
          width: `${Math.min(100, Math.max(4, ((120 - secondsLeft) / 120) * 100))}%`,
          background: isCompleted ? '#22c55e' : '#d9a84b',
          transition: 'width 1s linear'
        }} />
      </div>
      <p style={{ fontSize: 10, color: 'var(--p-muted)', lineHeight: 1.6, marginBottom: 12 }}>
        {isCompleted
          ? 'Table sanitization complete. Mark the table available for your next dining guests.'
          : 'Cleaning in progress. The recommended sanitization duration is 2 minutes.'}
      </p>
      <button
        type="button"
        className={`pos-button full ${isCompleted ? 'primary' : ''}`}
        disabled={Boolean(busy)}
        onClick={onMarkAvailable}
        style={{
          background: isCompleted ? '#16a34a' : undefined,
          borderColor: isCompleted ? '#16a34a' : undefined,
          color: isCompleted ? '#fff' : undefined,
          fontWeight: 650
        }}
      >
        <CheckCircle2 size={15} />
        {busy ? 'Updating table…' : 'Mark Table Available'}
      </button>
    </div>
  );
}

export default function WaiterDashboard() {
  const { currentUser } = useAuth();
  const { addToast } = useNotification();
  const [orders, setOrders] = useState([]);
  const [requests, setRequests] = useState([]);
  const [filter, setFilterState] = useState(() => {
    try {
      const saved = localStorage.getItem('bistro_waiter_filter');
      if (saved && ['ALL', 'PENDING', 'MINE'].includes(saved)) {
        return saved;
      }
    } catch {
      // ignore
    }
    return 'ALL';
  });

  const setFilter = useCallback((nextFilter) => {
    setFilterState(prev => {
      const val = typeof nextFilter === 'function' ? nextFilter(prev) : nextFilter;
      try {
        localStorage.setItem('bistro_waiter_filter', val);
      } catch {
        // ignore
      }
      return val;
    });
  }, []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [nextOrders, help] = await Promise.all([api.getOrders(), api.getHelpRequests()]);
      setOrders(nextOrders.filter(order => order.source === 'DINE_IN_QR' && order.status === 'READY'));
      setRequests(help.filter(request => request.status !== 'RESOLVED'));
      setError('');
    } catch (err) { setError(err.message || 'Unable to load floor service. Please try again.'); }
    finally { if (!silent) setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    const unsubscribe = subscribeRealtimeEvents((type, payload) => {
      if (['TABLE_ORDER_READY', 'ORDER_STATUS_CHANGED', 'CUSTOMER_HELP_REQUEST', 'WAITER_HELP_ACCEPTED', 'HELP_REQUEST_RESOLVED', 'TABLE_STATUS_CHANGED', 'TABLE_STATUS_UPDATED'].includes(type)) {
        if (type === 'TABLE_ORDER_READY' || (type === 'ORDER_STATUS_CHANGED' && payload?.newStatus === 'READY' && payload?.order?.source === 'DINE_IN_QR')) {
          try { soundEffects.playOrderReady(); } catch {}
        } else if (type === 'CUSTOMER_HELP_REQUEST') {
          try { soundEffects.playHelpRequest(); } catch {}
        }
        load(true);
      }
    });
    const heartbeat = setInterval(() => load(true), 5000);
    return () => { unsubscribe(); clearInterval(heartbeat); };
  }, [load]);

  const isMine = request => request.assignedWaiterId === currentUser?.userId;
  const isCleaning = request => /clean|sanitiz/i.test(request.message || '');
  const pending = requests.filter(request => request.status === 'PENDING');
  const assigned = requests.filter(request => request.status === 'ASSIGNED' && isMine(request));
  const visibleRequests = filter === 'MINE' ? assigned : filter === 'PENDING' ? pending : requests;

  const act = async (id, action, success) => {
    if (busy) return;
    setBusy(id);
    try {
      await action();
      addToast(success, 'success');
      await load(true);
    } catch (err) {
      addToast(err.message, 'error');
      await load(true);
    } finally {
      setBusy(null);
    }
  };

  return <section>
    <div className="pos-heading">
      <div>
        <h1>Floor service</h1>
        <p>A clear view of ready plates, table cleaning workflows, and guests who need assistance.</p>
      </div>
      <div className="pos-heading-actions">
        <button className="pos-button" onClick={() => load()} disabled={loading}><RefreshCw size={15} className={loading ? 'pos-spin' : ''} />Refresh</button>
      </div>
    </div>

    <div className="pos-metrics" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))', marginBottom: 22 }}>
      {[['Ready to serve', orders.length, HandPlatter], ['Waiting for help / cleaning', pending.length, HelpCircle], ['Assigned to you', assigned.length, UserCheck]].map(([title, count, Icon]) => (
        <div className="pos-metric" key={title}>
          <div className="pos-metric-top">{title}<span><Icon size={15} /></span></div>
          <strong>{count}</strong>
        </div>
      ))}
    </div>

    {error && <div className="pos-info-box" role="alert" style={{ color: '#ce626a', marginBottom: 20 }}><AlertCircle size={16} /><span>{error}</span><button className="pos-button small" style={{ marginLeft: 'auto' }} onClick={() => load()}>Try again</button></div>}

    {loading ? <Spinner /> : <div className="pos-panels" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,350px),1fr))', gap: 20, alignItems: 'stretch' }}>
      {/* Ready plates */}
      <section className="pos-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 460 }}>
        <header className="pos-panel-header">
          <h2><Bell size={15} />Ready on the pass</h2>
          {orders.length > 0 && <span className="pos-count">{orders.length} dine-in orders</span>}
        </header>
        <div className="pos-panel-content" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: orders.length ? 'flex-start' : 'center' }}>
          {!orders.length ? (
            <Empty icon={HandPlatter} title={error ? 'Orders could not be loaded' : 'The pass is clear'}>
              {error ? 'Retry when your connection is restored.' : 'Ready dine-in orders will appear here.'}
            </Empty>
          ) : orders.map(order => (
            <article key={order.orderId} className="pos-panel" style={{ borderColor: '#4779f54a' }}>
              <header className="pos-panel-header">
                <div>
                  <strong style={{ fontSize: 17 }}>{tableTitle(order)}</strong>
                  <p style={{ color: 'var(--p-muted)', fontSize: 9, marginTop: 5 }}>{order.orderNumber} · {time(order.createdAt)}</p>
                </div>
                <Badge status="READY" />
              </header>
              <div style={{ padding: '3px 15px 8px' }}>
                {order.items.map((item, index) => (
                  <div className="pos-line-item" key={item.orderItemId || index}>
                    <span>{item.name}</span>
                    <b>×{item.quantity}</b>
                  </div>
                ))}
                {order.specialInstructions && <div className="pos-info-box" style={{ marginBottom: 0 }}>{order.specialInstructions}</div>}
              </div>
              <div style={{ padding: 12 }}>
                <button
                  className="pos-button primary full"
                  disabled={Boolean(busy)}
                  onClick={() => act(order.orderId, () => api.updateOrderStatus(order.orderId, 'PENDING_CONFIRMATION'), `Order served to ${tableTitle(order)}. The guest can now confirm receipt.`)}
                >
                  <CheckCircle2 size={15} />
                  {busy === order.orderId ? 'Saving…' : 'Collected & served'}
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Guest assistance & Table cleaning */}
      <section className="pos-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 460 }}>
        <header className="pos-panel-header">
          <h2><HelpCircle size={15} />Floor assistance &amp; Cleaning</h2>
          {pending.length > 0 && <span className="pos-count">{pending.length} waiting</span>}
        </header>
        <div style={{ padding: '12px 12px 0' }}>
          <div className="pos-segment" style={{ display: 'flex', width: '100%' }}>
            {[
              ['ALL', 'All calls', requests.length],
              ['PENDING', 'Unassigned', pending.length],
              ['MINE', 'Assigned to me', assigned.length]
            ].map(([key, title, count]) => (
              <button key={key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)} style={{ flex: 1 }}>
                {title}
                {count > 0 && <span className="pos-count" style={{ marginLeft: 7 }}>{count}</span>}
              </button>
            ))}
          </div>
        </div>
        <div className="pos-panel-content" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: visibleRequests.length ? 'flex-start' : 'center' }}>
          {!visibleRequests.length ? (
            <Empty icon={UserCheck} title={error ? 'Calls could not be loaded' : filter === 'MINE' ? 'No calls assigned to you' : 'Every table is looked after'}>
              {error ? 'Retry when your connection is restored.' : filter === 'MINE' ? 'Accept a table cleaning or help request when a guest needs assistance.' : 'New table requests and cleaning alerts will appear here.'}
            </Empty>
          ) : visibleRequests.map(request => {
            const cleaning = isCleaning(request);
            return (
              <article
                className="pos-panel"
                key={request.requestId}
                style={{
                  borderColor: cleaning ? (request.status === 'PENDING' ? '#d9a84b' : '#38bdf8') : (request.status === 'PENDING' ? '#d9a84b66' : 'var(--p-border)')
                }}
              >
                <header className="pos-panel-header">
                  <div>
                    <strong style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {cleaning && <Sparkles size={14} style={{ color: '#d9a84b' }} />}
                      {tableTitle(request)}
                    </strong>
                    {cleaning && <small style={{ fontSize: 9, color: 'var(--p-muted)', display: 'block', marginTop: 2 }}>Table Sanitization</small>}
                  </div>
                  <Badge status={cleaning ? (request.status === 'PENDING' ? 'WAITING_FOR_CLEANING' : 'CLEANING') : request.status} />
                </header>
                <div style={{ padding: 15 }}>
                  {request.requestType && request.requestType !== 'CUSTOM' && (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      marginBottom: 8,
                      fontSize: 11,
                      fontWeight: 700,
                      background: request.requestType === 'WATER' ? '#e0f2fe' :
                                  request.requestType === 'TISSUES' ? '#f3e8ff' :
                                  request.requestType === 'BILL' ? '#dcfce7' :
                                  request.requestType === 'TABLE_CLEANING' ? '#fef3c7' : '#f1f5f9',
                      color: request.requestType === 'WATER' ? '#0369a1' :
                             request.requestType === 'TISSUES' ? '#7e22ce' :
                             request.requestType === 'BILL' ? '#15803d' :
                             request.requestType === 'TABLE_CLEANING' ? '#b45309' : '#475569',
                      padding: '2px 8px',
                      borderRadius: 6
                    }}>
                      {request.requestType === 'WATER' && '💧 Water Request'}
                      {request.requestType === 'TISSUES' && '🧻 Tissues Request'}
                      {request.requestType === 'BILL' && '🧾 Bill Request'}
                      {request.requestType === 'TABLE_CLEANING' && '🧹 Table Cleaning'}
                    </span>
                  )}
                  <p style={{ fontSize: 12, lineHeight: 1.8, marginBottom: 10 }}>{request.message}</p>
                  <p style={{ color: 'var(--p-muted)', fontSize: 9, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Clock size={12} />
                    {Math.max(0, Math.floor((Date.now() - new Date(request.createdAt).getTime()) / 60000))} min ago
                  </p>

                  {request.status === 'PENDING' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 15 }}>
                      <button
                        className="pos-button primary full"
                        disabled={Boolean(busy)}
                        onClick={() => act(
                          request.requestId,
                          () => api.acceptHelpRequest(request.requestId),
                          cleaning
                            ? `${tableTitle(request)} assigned to you. Status changed to CLEANING.`
                            : `You are on your way to ${tableTitle(request)}.`
                        )}
                      >
                        <UserCheck size={14} />
                        {busy === request.requestId ? 'Assigning…' : (cleaning ? 'Accept & Start Cleaning' : 'Accept & attend table')}
                      </button>
                      {cleaning && (
                        <button
                          className="pos-button full"
                          disabled={Boolean(busy)}
                          onClick={() => act(
                            request.requestId,
                            () => api.resolveHelpRequest(request.requestId),
                            `${tableTitle(request)} marked AVAILABLE!`
                          )}
                          style={{ background: '#16a34a', borderColor: '#16a34a', color: '#fff', fontWeight: 600 }}
                        >
                          <CheckCircle2 size={14} />
                          Mark Table Available
                        </button>
                      )}
                    </div>
                  ) : cleaning ? (
                    <>
                      {!isMine(request) && (
                        <p style={{ padding: '8px 0 0', fontSize: 10, color: 'var(--p-muted)' }}>
                          Being attended by {request.assignedWaiterName || 'another staff member'}.
                        </p>
                      )}
                      <CleaningCountdown
                        acceptedAt={request.acceptedAt || request.createdAt}
                        busy={busy === request.requestId}
                        onMarkAvailable={() => act(
                          request.requestId,
                          () => api.resolveHelpRequest(request.requestId),
                          `${tableTitle(request)} sanitized and marked AVAILABLE for next guests!`
                        )}
                      />
                    </>
                  ) : isMine(request) ? (
                    <>
                      <div className="pos-info-box" style={{ margin: '13px 0' }}>
                        Assigned to you. Your guest knows you are on the way.
                      </div>
                      <button
                        className="pos-button full"
                        disabled={Boolean(busy)}
                        onClick={() => act(request.requestId, () => api.resolveHelpRequest(request.requestId), 'Guest assistance completed.')}
                      >
                        <CheckCircle2 size={14} />
                        {busy === request.requestId ? 'Saving…' : 'Mark resolved'}
                      </button>
                    </>
                  ) : (
                    <div style={{ marginTop: 12 }}>
                      <p style={{ padding: '0 0 10px', fontSize: 10, color: 'var(--p-muted)' }}>
                        Being attended by {request.assignedWaiterName || 'another staff member'}.
                      </p>
                      <button
                        className="pos-button full primary"
                        disabled={Boolean(busy)}
                        onClick={() => act(
                          request.requestId,
                          () => api.resolveHelpRequest(request.requestId),
                          `${tableTitle(request)} sanitized and marked AVAILABLE!`
                        )}
                        style={{ background: '#16a34a', borderColor: '#16a34a', color: '#fff', fontWeight: 650 }}
                      >
                        <CheckCircle2 size={14} />
                        Mark Table Available
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>}
  </section>;
}
