import React, { useCallback, useEffect, useState } from 'react';
import { Activity, Bell, CheckCircle2, MessageSquare, RefreshCw, Save, Send, Smartphone, Wifi, WifiOff } from 'lucide-react';
import { api } from '../../services/api';

const PREF_TOGGLES = [
  ['orderConfirmationEnabled', 'Order confirmation'],
  ['orderStatusEnabled', 'Order status updates (Ready / Out for delivery / Cancelled)'],
  ['digitalReceiptEnabled', 'Digital SMS receipts'],
  ['reservationEnabled', 'Reservations & walk-in waitlist alerts'],
  ['paymentConfirmationEnabled', 'Payment confirmation'],
  ['staffShiftEnabled', 'Staff shift notifications'],
  ['inventoryAlertEnabled', 'Low-stock inventory alerts'],
  ['loyaltyEnabled', 'Loyalty points earned & redeemed'],
  ['promotionalEnabled', 'Promotional SMS (requires guest opt-in)'],
];

export default function SmsNotificationsPanel({ restaurants = [], onNotify }) {
  const [selectedId, setSelectedId] = useState(restaurants[0]?.restaurantId || '');
  const [config, setConfig] = useState({ enabled: false, baseUrl: 'https://api.textbee.dev/api/v1', apiKey: '', maskedApiKey: '', deviceId: '' });
  const [prefs, setPrefs] = useState(null);
  const [logs, setLogs] = useState([]);
  const [logFilter, setLogFilter] = useState('');
  const [connectivity, setConnectivity] = useState(null);
  const [testPhone, setTestPhone] = useState('');
  const [testMsg, setTestMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!selectedId && restaurants.length) setSelectedId(restaurants[0].restaurantId);
  }, [restaurants, selectedId]);

  const loadAll = useCallback(async () => {
    if (!selectedId) return;
    setBusy(true);
    try {
      const [cfg, pr, lg] = await Promise.all([
        api.getSmsConfig(selectedId),
        api.getSmsPreferences(selectedId),
        api.getSmsLogs(selectedId, logFilter || undefined, 50),
      ]);
      setConfig({
        enabled: Boolean(cfg.enabled),
        baseUrl: cfg.baseUrl || 'https://api.textbee.dev/api/v1',
        apiKey: '',
        maskedApiKey: cfg.maskedApiKey || '',
        deviceId: cfg.deviceId || '',
      });
      setPrefs(pr);
      setLogs(Array.isArray(lg) ? lg : []);
    } catch (err) {
      onNotify?.({ error: true, message: err.message || 'Could not load SMS settings.' });
    } finally {
      setBusy(false);
    }
  }, [selectedId, logFilter, onNotify]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const saveGateway = async (e) => {
    e.preventDefault();
    if (!selectedId) return;
    setBusy(true);
    try {
      const updated = await api.updateSmsConfig(selectedId, {
        enabled: config.enabled,
        baseUrl: (config.baseUrl || '').trim() || 'https://api.textbee.dev/api/v1',
        apiKey: config.apiKey || undefined,
        deviceId: config.deviceId,
      });
      setConfig(prev => ({ ...prev, apiKey: '', maskedApiKey: updated.maskedApiKey || prev.maskedApiKey }));
      onNotify?.({ message: 'TextBee gateway settings saved.' });
    } catch (err) {
      onNotify?.({ error: true, message: err.message || 'Failed to save gateway settings.' });
    } finally {
      setBusy(false);
    }
  };

  const checkDevices = async () => {
    if (!selectedId) return;
    setBusy(true);
    try {
      const res = await api.getSmsDevices(selectedId);
      setConnectivity(res);
    } catch (err) {
      setConnectivity({ connected: false, statusMessage: err.message || 'Check failed', deviceCount: 0, devices: [] });
    } finally {
      setBusy(false);
    }
  };

  const handleTestSms = async (e) => {
    e.preventDefault();
    if (!selectedId || !testPhone.trim()) return;
    setBusy(true);
    try {
      const res = await api.sendTestSms(selectedId, { phone: testPhone.trim(), message: testMsg.trim() || undefined });
      onNotify?.({ message: res?.message || 'Test SMS dispatched.' });
      await loadAll();
    } catch (err) {
      onNotify?.({ error: true, message: err.message || 'Test SMS failed.' });
    } finally {
      setBusy(false);
    }
  };

  const savePreferences = async () => {
    if (!selectedId || !prefs) return;
    setBusy(true);
    try {
      const updated = await api.updateSmsPreferences(selectedId, {
        orderConfirmationEnabled: prefs.orderConfirmationEnabled,
        orderStatusEnabled: prefs.orderStatusEnabled,
        digitalReceiptEnabled: prefs.digitalReceiptEnabled,
        reservationEnabled: prefs.reservationEnabled,
        paymentConfirmationEnabled: prefs.paymentConfirmationEnabled,
        staffShiftEnabled: prefs.staffShiftEnabled,
        inventoryAlertEnabled: prefs.inventoryAlertEnabled,
        loyaltyEnabled: prefs.loyaltyEnabled,
        promotionalEnabled: prefs.promotionalEnabled,
        managerAlertPhone: prefs.managerAlertPhone || '',
        templates: prefs.templates,
      });
      setPrefs(updated);
      onNotify?.({ message: 'Notification preferences and templates saved.' });
    } catch (err) {
      onNotify?.({ error: true, message: err.message || 'Could not save preferences.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      {/* Outlet selector & Device connectivity */}
      <section className="admin-card" style={{ padding: 18 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Smartphone size={17} /> TextBee Gateway &amp; Device Connectivity
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, opacity: 0.72 }}>
              Supports both cloud (<code>https://api.textbee.dev/api/v1</code>) and self-hosted TextBee instances.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select
              className="admin-select"
              aria-label="Select restaurant for SMS"
              value={selectedId}
              onChange={e => setSelectedId(e.target.value)}
            >
              {restaurants.map(r => <option key={r.restaurantId} value={r.restaurantId}>{r.name}</option>)}
            </select>
            <button type="button" className="admin-button" disabled={busy} onClick={checkDevices}>
              <Activity size={14} /> Check Devices
            </button>
            <button type="button" className="admin-icon" disabled={busy} onClick={loadAll} title="Refresh SMS data">
              <RefreshCw size={15} className={busy ? 'pos-spin' : undefined} />
            </button>
          </div>
        </div>

        {connectivity && (
          <div style={{
            padding: '10px 12px',
            borderRadius: 10,
            marginBottom: 14,
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: connectivity.connected ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
            border: `1px solid ${connectivity.connected ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
          }}>
            {connectivity.connected ? <Wifi size={15} /> : <WifiOff size={15} />}
            <span><strong>{connectivity.statusMessage}</strong></span>
            {connectivity.devices?.length > 0 && (
              <span style={{ opacity: 0.8 }}>
                — {connectivity.devices.map(d => `${d.name} (${d.enabled ? 'Online' : 'Disabled'})`).join(', ')}
              </span>
            )}
          </div>
        )}

        <form onSubmit={saveGateway} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          <label className="admin-field">
            <span>API Base URL</span>
            <input value={config.baseUrl} onChange={e => setConfig(c => ({ ...c, baseUrl: e.target.value }))} placeholder="http://localhost:3001/api/v1" />
          </label>
          <label className="admin-field">
            <span>Device ID (optional)</span>
            <input value={config.deviceId} onChange={e => setConfig(c => ({ ...c, deviceId: e.target.value }))} placeholder="Android Device ID" />
          </label>
          <label className="admin-field">
            <span>API Key {config.maskedApiKey ? `(saved: ${config.maskedApiKey})` : ''}</span>
            <input type="password" value={config.apiKey} onChange={e => setConfig(c => ({ ...c, apiKey: e.target.value }))} placeholder="Leave blank to keep existing key" />
          </label>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer', height: 38 }}>
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={e => setConfig(c => ({ ...c, enabled: e.target.checked }))}
                style={{ width: 16, height: 16, accentColor: '#2563eb' }}
              />
              Gateway Enabled
            </label>
            <button type="submit" className="admin-button admin-primary" disabled={busy}>
              <Save size={14} /> Save Gateway
            </button>
          </div>
        </form>

        <form onSubmit={handleTestSms} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(148,163,184,0.2)' }}>
          <input
            type="tel"
            placeholder="Test phone (+91...)"
            value={testPhone}
            onChange={e => setTestPhone(e.target.value)}
            style={{ flex: '1 1 180px', height: 36, borderRadius: 8, border: '1px solid rgba(148,163,184,0.35)', padding: '0 10px', fontSize: 12 }}
          />
          <input
            type="text"
            placeholder="Optional custom test message..."
            value={testMsg}
            onChange={e => setTestMsg(e.target.value)}
            style={{ flex: '2 1 240px', height: 36, borderRadius: 8, border: '1px solid rgba(148,163,184,0.35)', padding: '0 10px', fontSize: 12 }}
          />
          <button type="submit" className="admin-button" disabled={busy || !testPhone.trim()}>
            <Send size={14} /> Send Test SMS
          </button>
        </form>
      </section>

      {/* Notification Preferences & Templates */}
      {prefs && (
        <section className="admin-card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Bell size={17} /> Notification Preferences &amp; SMS Templates
            </h2>
            <button type="button" className="admin-button admin-primary" disabled={busy} onClick={savePreferences}>
              <CheckCircle2 size={14} /> Save Preferences &amp; Templates
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 8, marginBottom: 14 }}>
            {PREF_TOGGLES.map(([key, label]) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={Boolean(prefs[key])}
                  onChange={e => setPrefs(p => ({ ...p, [key]: e.target.checked }))}
                  style={{ width: 15, height: 15, accentColor: '#2563eb' }}
                />
                {label}
              </label>
            ))}
          </div>

          <label className="admin-field" style={{ maxWidth: 340, marginBottom: 14 }}>
            <span>Manager Alert Phone (Inventory &amp; Shift alerts)</span>
            <input
              type="tel"
              placeholder="+919876543210"
              value={prefs.managerAlertPhone || ''}
              onChange={e => setPrefs(p => ({ ...p, managerAlertPhone: e.target.value }))}
            />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 10 }}>
            {Object.entries(prefs.templates || {}).map(([evt, tpl]) => (
              <label key={evt} className="admin-field">
                <span>{evt}</span>
                <textarea
                  rows={2}
                  value={tpl}
                  onChange={e => setPrefs(p => ({ ...p, templates: { ...p.templates, [evt]: e.target.value } }))}
                  style={{ width: '100%', borderRadius: 8, border: '1px solid rgba(148,163,184,0.35)', padding: 8, fontSize: 12 }}
                />
              </label>
            ))}
          </div>
        </section>
      )}

      {/* Message History & Delivery Status */}
      <section className="admin-card" style={{ padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <MessageSquare size={17} /> Message History &amp; Delivery Status
          </h2>
          <select className="admin-select" value={logFilter} onChange={e => setLogFilter(e.target.value)}>
            <option value="">All statuses</option>
            <option value="QUEUED">Queued</option>
            <option value="SENT">Sent</option>
            <option value="DELIVERED">Delivered</option>
            <option value="FAILED">Failed</option>
          </select>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="admin-table" style={{ width: '100%', fontSize: 12 }}>
            <thead>
              <tr>
                <th>Time</th>
                <th>Event</th>
                <th>Recipient</th>
                <th>Status</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: 18, opacity: 0.65 }}>No SMS logs recorded yet.</td></tr>
              ) : logs.map(l => (
                <tr key={l.smsLogId}>
                  <td style={{ whiteSpace: 'nowrap' }}>{new Date(l.createdAt).toLocaleString()}</td>
                  <td><code>{l.eventType}</code></td>
                  <td style={{ whiteSpace: 'nowrap' }}>{l.recipientPhone}</td>
                  <td>
                    <span className={`admin-status ${l.status === 'DELIVERED' || l.status === 'SENT' ? 'is-active' : ''}`}>
                      <i />{l.status}
                    </span>
                    {l.errorMessage && <div style={{ fontSize: 11, color: '#e11d48' }}>{l.errorMessage}</div>}
                  </td>
                  <td style={{ maxWidth: 360 }}>{l.messageBody}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
