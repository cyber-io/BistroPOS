import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, Copy, Eye, EyeOff, MessageSquare, RefreshCw, Send, UserMinus } from 'lucide-react';
import { Modal } from '../../components/pos/PosUI';
import { api } from '../../services/api';

function AdminForm({ title, submitLabel, onClose, save, onCreated, children }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const close = useCallback(() => {
    if (!pending.current) onClose();
  }, [onClose]);

  const submit = async event => {
    event.preventDefault();
    if (pending.current) return;
    const data = new FormData(event.currentTarget);
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      onCreated(await save(data));
    } catch (err) {
      setError(err.message || 'Couldn’t save your changes.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  return (
    <Modal title={title} className="admin-dialog" onClose={close}>
      <form onSubmit={submit}>
        {error && <p role="alert" className="admin-form-error"><AlertCircle size={16} />{error}</p>}
        <fieldset className="admin-form-fields" disabled={busy}>{children}</fieldset>
        <div className="admin-form-footer">
          <button type="button" className="admin-button" disabled={busy} onClick={close}>Cancel</button>
          <button type="submit" className="admin-button admin-primary" disabled={busy}>
            {busy && <RefreshCw size={15} className="pos-spin" />}{busy ? 'Saving…' : submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function AddRestaurantModal({ onClose, onCreated }) {
  const save = data => {
    const name = data.get('name').trim();
    const email = data.get('email').trim().toLowerCase();
    const address = data.get('address').trim();
    const phone = data.get('phone').trim();
    if (!name || !email || !address || !phone) throw new Error('Enter the restaurant name, email, phone and address.');
    return api.createRestaurant({
      name, email, phone, address, logo: null, taxRate: Number(data.get('taxRate') || 5) / 100, initialTableCount: 0,
    });
  };

  return (
    <AdminForm title="Add restaurant" submitLabel="Create restaurant" save={save} onCreated={onCreated} onClose={onClose}>
      <label className="admin-field"><span>Restaurant name</span><input name="name" autoComplete="organization" required autoFocus /></label>
      <label className="admin-field"><span>Contact email</span><input name="email" type="email" autoComplete="email" required /></label>
      <label className="admin-field"><span>Contact phone</span><input name="phone" type="tel" autoComplete="tel" required /></label>
      <label className="admin-field"><span>GST rate (%)</span><input name="taxRate" type="number" min="0" max="28" step="0.5" defaultValue="5" /></label>
      <label className="admin-field full"><span>Street address and city</span><input name="address" autoComplete="street-address" required /></label>
    </AdminForm>
  );
}

export function EditRestaurantModal({ restaurant, managers = [], onClose, onSaved, onRemoveManager }) {
  const parsedTaxRate = (() => {
    try {
      const raw = typeof restaurant?.settings === 'string'
        ? JSON.parse(restaurant.settings || '{}')
        : (restaurant?.settings || {});
      const val = Number(raw?.taxRate);
      return Number.isFinite(val) ? String(val <= 1 ? val * 100 : val) : '5';
    } catch {
      return '5';
    }
  })();

  const [removingId, setRemovingId] = useState(null);
  const [smsCfg, setSmsCfg] = useState({ enabled: false, baseUrl: '', apiKey: '', maskedApiKey: '', deviceId: '', loaded: false });
  const [testPhone, setTestPhone] = useState('');
  const [testStatus, setTestStatus] = useState('');
  const [testingSms, setTestingSms] = useState(false);

  useEffect(() => {
    let active = true;
    if (!restaurant?.restaurantId) return;
    api.getSmsConfig(restaurant.restaurantId).then(cfg => {
      if (!active || !cfg) return;
      setSmsCfg({
        enabled: Boolean(cfg.enabled),
        baseUrl: cfg.baseUrl || '',
        apiKey: '',
        maskedApiKey: cfg.maskedApiKey || '',
        deviceId: cfg.deviceId || '',
        loaded: true,
      });
    }).catch(() => {});
    return () => { active = false; };
  }, [restaurant?.restaurantId]);

  const handleTestSms = async () => {
    if (!testPhone.trim() || testingSms) return;
    setTestingSms(true);
    setTestStatus('');
    try {
      await api.updateSmsConfig(restaurant.restaurantId, {
        enabled: smsCfg.enabled,
        baseUrl: (smsCfg.baseUrl || '').trim() || 'https://api.textbee.dev/api/v1',
        apiKey: smsCfg.apiKey || undefined,
        deviceId: smsCfg.deviceId,
      });
      const res = await api.sendTestSms(restaurant.restaurantId, { phone: testPhone.trim() });
      setTestStatus(res?.message || 'Test SMS sent!');
    } catch (err) {
      setTestStatus(err.message || 'Failed to send test SMS.');
    } finally {
      setTestingSms(false);
    }
  };

  const save = async data => {
    const name = data.get('name').trim();
    const email = data.get('email').trim().toLowerCase();
    const address = data.get('address').trim();
    const phone = data.get('phone').trim();
    if (!name || !email || !address || !phone) throw new Error('Enter the restaurant name, email, phone and address.');

    let existingSettings = {};
    try {
      existingSettings = typeof restaurant?.settings === 'string'
        ? JSON.parse(restaurant.settings || '{}')
        : (restaurant?.settings || {});
    } catch {}
    const taxRate = Number(data.get('taxRate') || 5) / 100;

    const updated = await api.updateRestaurantSettings(restaurant.restaurantId, {
      name,
      email,
      phone,
      address,
      settings: JSON.stringify({ ...existingSettings, taxRate }),
    });

    if (smsCfg.loaded) {
      await api.updateSmsConfig(restaurant.restaurantId, {
        enabled: smsCfg.enabled,
        baseUrl: (smsCfg.baseUrl || '').trim() || 'https://api.textbee.dev/api/v1',
        apiKey: smsCfg.apiKey || undefined,
        deviceId: smsCfg.deviceId,
      });
    }

    return updated;
  };

  const handleRemove = async (manager) => {
    if (!onRemoveManager || removingId) return;
    setRemovingId(manager.userId);
    try {
      await onRemoveManager(manager);
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <AdminForm title={`Edit ${restaurant?.name || 'restaurant'}`} submitLabel="Save changes" save={save} onCreated={onSaved} onClose={onClose}>
      <label className="admin-field"><span>Restaurant name</span><input name="name" defaultValue={restaurant?.name || ''} required autoFocus /></label>
      <label className="admin-field"><span>Contact email</span><input name="email" type="email" defaultValue={restaurant?.email || ''} required /></label>
      <label className="admin-field"><span>Contact phone</span><input name="phone" type="tel" defaultValue={restaurant?.phone || ''} required /></label>
      <label className="admin-field"><span>GST rate (%)</span><input name="taxRate" type="number" min="0" max="28" step="0.5" defaultValue={parsedTaxRate} /></label>
      <label className="admin-field full"><span>Street address and city</span><input name="address" defaultValue={restaurant?.address || ''} required /></label>

      <div className="admin-field full">
        <span>Assigned Managers / Assistant Managers</span>
        {managers.length ? (
          <div className="admin-modal-managers">
            {managers.map(m => (
              <div key={m.userId} className="admin-modal-manager-row">
                <div>
                  <strong>{m.name}</strong>
                  <small>{m.email}</small>
                </div>
                <button
                  type="button"
                  className="admin-remove-btn"
                  disabled={removingId === m.userId}
                  onClick={() => handleRemove(m)}
                >
                  <UserMinus size={13} />
                  {removingId === m.userId ? 'Removing…' : 'Remove'}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="admin-modal-empty-note">No manager assigned to this restaurant yet.</p>
        )}
      </div>

      <div className="admin-field full" style={{ borderTop: '1px solid #e6ebf4', paddingTop: 14, marginTop: 4, gap: 10 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <MessageSquare size={14} /> TextBee SMS Gateway (Self-Hosted)
        </span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: '#334155', cursor: 'pointer', lineHeight: 1.4 }}>
          <input
            type="checkbox"
            checked={smsCfg.enabled}
            onChange={e => setSmsCfg(prev => ({ ...prev, enabled: e.target.checked }))}
            style={{ width: 16, height: 16, minHeight: 16, padding: 0, margin: 0, flexShrink: 0, accentColor: '#2563eb', cursor: 'pointer' }}
          />
          <span>Enable automated SMS (order updates, reservations, waitlist &amp; receipts)</span>
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <label className="admin-field">
            <span>TextBee API Base URL</span>
            <input
              placeholder="http://localhost:3001/api/v1"
              value={smsCfg.baseUrl}
              onChange={e => setSmsCfg(prev => ({ ...prev, baseUrl: e.target.value }))}
            />
          </label>
          <label className="admin-field">
            <span>Device ID (optional)</span>
            <input
              placeholder="Android Device ID"
              value={smsCfg.deviceId}
              onChange={e => setSmsCfg(prev => ({ ...prev, deviceId: e.target.value }))}
            />
          </label>
          <label className="admin-field full">
            <span>API Key {smsCfg.maskedApiKey ? `(saved: ${smsCfg.maskedApiKey})` : ''}</span>
            <input
              type="password"
              placeholder={smsCfg.maskedApiKey ? 'Leave blank to keep existing key' : 'Enter x-api-key from TextBee'}
              value={smsCfg.apiKey}
              onChange={e => setSmsCfg(prev => ({ ...prev, apiKey: e.target.value }))}
            />
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="tel"
            placeholder="Test phone (+91...)"
            value={testPhone}
            onChange={e => setTestPhone(e.target.value)}
            style={{ flex: 1, height: 38 }}
          />
          <button
            type="button"
            disabled={testingSms || !testPhone.trim()}
            onClick={handleTestSms}
            style={{
              height: 38,
              padding: '0 14px',
              borderRadius: 8,
              border: '1px solid #dbe2ef',
              background: '#f8fafc',
              color: '#1e293b',
              fontSize: 12,
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              whiteSpace: 'nowrap',
              cursor: testingSms || !testPhone.trim() ? 'not-allowed' : 'pointer',
              opacity: testingSms || !testPhone.trim() ? 0.55 : 1,
            }}
          >
            <Send size={13} />
            {testingSms ? 'Sending…' : 'Send Test SMS'}
          </button>
        </div>
        {testStatus && <p className="admin-modal-empty-note" style={{ marginTop: 2 }}>{testStatus}</p>}
      </div>
    </AdminForm>
  );
}

export function AddManagerModal({ restaurants, restaurantId, onClose, onCreated }) {
  const [outletId, setOutletId] = useState(restaurantId || restaurants[0]?.restaurantId || '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('Bistro@123');
  const [visible, setVisible] = useState(false);
  const [copyState, setCopyState] = useState('');
  const save = data => {
    const name = data.get('name').trim();
    if (!outletId || !name || !email.trim()) throw new Error('Select a restaurant and enter the manager’s name and email.');
    return api.createStaffUser({
      restaurantId: outletId, name, email: email.trim().toLowerCase(), phone: data.get('phone').trim() || null, password, role: 'MANAGER',
    });
  };

  const copyWelcome = async () => {
    const outlet = restaurants.find(r => r.restaurantId === outletId);
    const message = `Welcome to BistroPOS!
Aapke restaurant "${outlet?.name || 'Hotel'}" ka POS Portal ready hai.
🔗 Portal URL: ${window.location.origin}/pos/login
📧 Login Email: ${email.trim().toLowerCase()}
🔑 Password: ${password}

Is login se aap apna Menu, Staff aur Table QR codes manage kar sakte hain.`;
    try {
      await navigator.clipboard.writeText(message);
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
  };

  return (
    <AdminForm title="Assign general manager" submitLabel="Create manager account" save={save} onCreated={onCreated} onClose={onClose}>
      <label className="admin-field full"><span>Restaurant</span>
        <select value={outletId} onChange={e => { setOutletId(e.target.value); setCopyState(''); }} required autoFocus>
          {restaurants.map(r => <option value={r.restaurantId} key={r.restaurantId}>{r.name}{r.address ? ` · ${r.address}` : ''}</option>)}
        </select>
      </label>
      <label className="admin-field"><span>Full name</span><input name="name" autoComplete="name" required /></label>
      <label className="admin-field"><span>Login email</span><input type="email" autoComplete="off" value={email} required
        onChange={e => { setEmail(e.target.value); setCopyState(''); }} /></label>
      <label className="admin-field"><span>Phone (optional)</span><input name="phone" type="tel" autoComplete="tel" /></label>
      <div className="admin-field"><label htmlFor="admin-manager-password">Initial password</label>
        <div className="admin-password">
          <input id="admin-manager-password" type={visible ? 'text' : 'password'} autoComplete="new-password" value={password}
            onChange={e => { setPassword(e.target.value); setCopyState(''); }} required />
          <button type="button" onClick={() => setVisible(v => !v)} aria-label={visible ? 'Hide password' : 'Show password'}>
            {visible ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>
      <div className="admin-copy full">
        <button type="button" onClick={copyWelcome} disabled={!email.trim() || !password || !outletId}>
          {copyState === 'copied' ? <Check size={15} /> : <Copy size={15} />}
          {copyState === 'copied' ? 'Welcome message copied' : 'Copy welcome message'}
        </button>
        {copyState === 'error' && <p role="alert">Clipboard access is unavailable.</p>}
      </div>
    </AdminForm>
  );
}

export function EditManagerModal({ manager, restaurants, onClose, onSaved }) {
  const [outletId, setOutletId] = useState(manager?.restaurantId || restaurants[0]?.restaurantId || '');
  const [status, setStatus] = useState((manager?.status || 'ACTIVE').toUpperCase());
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);

  const save = data => {
    const name = data.get('name').trim();
    const email = data.get('email').trim().toLowerCase();
    if (!outletId || !name || !email) {
      throw new Error('Select a restaurant and enter the manager’s name and email.');
    }
    return api.updateStaffUser(manager.userId, {
      restaurantId: outletId,
      name,
      email,
      phone: data.get('phone').trim() || null,
      status,
      password: password.trim() || null,
    });
  };

  return (
    <AdminForm title={`Edit ${manager?.name || 'manager'}`} submitLabel="Save changes" save={save} onCreated={onSaved} onClose={onClose}>
      <label className="admin-field full"><span>Assigned restaurant</span>
        <select value={outletId} onChange={e => setOutletId(e.target.value)} required autoFocus>
          {restaurants.map(r => <option value={r.restaurantId} key={r.restaurantId}>{r.name}{r.address ? ` · ${r.address}` : ''}</option>)}
        </select>
      </label>
      <label className="admin-field"><span>Full name</span><input name="name" defaultValue={manager?.name || ''} required /></label>
      <label className="admin-field"><span>Login email</span><input name="email" type="email" defaultValue={manager?.email || ''} required /></label>
      <label className="admin-field"><span>Phone (optional)</span><input name="phone" type="tel" defaultValue={manager?.phone || ''} /></label>
      <label className="admin-field"><span>Status</span>
        <select value={status} onChange={e => setStatus(e.target.value)}>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Suspended / Inactive</option>
        </select>
      </label>
      <div className="admin-field full"><label htmlFor="admin-edit-manager-password">Reset password (optional)</label>
        <div className="admin-password">
          <input
            id="admin-edit-manager-password"
            type={visible ? 'text' : 'password'}
            autoComplete="new-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Leave blank to keep current password"
          />
          <button type="button" onClick={() => setVisible(v => !v)} aria-label={visible ? 'Hide password' : 'Show password'}>
            {visible ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>
    </AdminForm>
  );
}
