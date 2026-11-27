import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle, ArrowUpRight, Building2, CheckCircle2, CircleCheck, Cloud, LayoutGrid,
  LogOut, Mail, MapPin, MessageSquare, Moon, PanelRightOpen, Pencil, Phone, Plus, RefreshCw, Search,
  Store, Sun, Trash2, UserMinus, UserPlus, Users,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api, getActiveRestaurantId, setActiveRestaurantId } from '../../services/api';
import { AddManagerModal, AddRestaurantModal, EditManagerModal, EditRestaurantModal } from './AdminForms';
import SmsNotificationsPanel from './SmsNotificationsPanel';
import '../../styles/pos.css';
import './SuperAdminDashboard.css';

function initials(name) {
  return (name || '').trim().split(/\s+/).slice(0, 2).map(word => word.charAt(0)).join('').toUpperCase();
}

function Status({ value, outlet = false }) {
  const state = String(value || '').toUpperCase();
  const label = outlet && state === 'INACTIVE' ? 'Suspended' : state.toLowerCase().replaceAll('_', ' ') || 'Unknown';
  return <span className={`admin-status ${state === 'ACTIVE' ? 'is-active' : ''}`}><i />{label}</span>;
}

function Summary({ summary, restaurants, managers }) {
  const metrics = [
    ['Restaurants', summary?.totalRestaurants ?? restaurants?.length, Building2],
    ['General managers', summary?.totalManagers ?? managers?.length, Users],
    ['Active restaurants', summary?.activeRestaurants ?? restaurants?.filter(r => r.status === 'ACTIVE').length, CircleCheck],
  ];
  return (
    <dl className="admin-summary" aria-label="Platform overview">
      {metrics.map(([label, value, Icon]) => (
        <div className="admin-metric" key={label}>
          <dt>{label}<span><Icon size={16} aria-hidden="true" /></span></dt>
          <dd>{value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

function OutletCard({ outlet, managers, featured, onInspect, onAssign, onEdit, onDelete, onRemoveManager, onOpen, onToggle, updating, headingRef }) {
  const { name, status, address, phone, email } = outlet;
  const contacts = [
    ['Address', address, MapPin],
    ['Phone', phone, Phone],
    ['Email', email, Mail],
  ].filter(([, value]) => value);

  return (
    <article className={`admin-outlet${featured ? ' admin-outlet--detail' : ''}`} aria-label={name}>
      <div className="admin-outlet-info">
        <header className="admin-outlet-heading">
          <span className="admin-avatar" aria-hidden="true">{initials(name)}</span>
          <div className="admin-outlet-title">
            <div className="admin-name-line">
              <h2 ref={headingRef} tabIndex={featured ? -1 : undefined}>{name}</h2>
              {onInspect && (
                <button type="button" className="admin-inspect" onClick={onInspect}
                  aria-label={`Show details for ${name}`} title="Show outlet details">
                  <PanelRightOpen size={15} />
                </button>
              )}
            </div>
            <Status value={status} outlet />
          </div>
          <div className="admin-head-actions">
            <button type="button" className="admin-status-action" onClick={() => onDelete(outlet)}
              disabled={updating} aria-label={`Delete ${name}`} title="Delete restaurant"
              style={{ color: '#e11d48', borderColor: 'rgba(225, 29, 72, 0.28)' }}>
              <Trash2 size={12} /> Delete
            </button>
            <button type="button" className="admin-status-action" onClick={() => onEdit(outlet)}
              aria-label={`Edit ${name}`} title="Edit restaurant">
              <Pencil size={12} /> Edit
            </button>
            <button type="button" className="admin-status-action" onClick={() => onToggle(outlet)}
              disabled={updating} aria-label={`${status === 'ACTIVE' ? 'Suspend' : 'Activate'} ${name}`}>
              {status === 'ACTIVE' ? 'Suspend' : 'Activate'}
            </button>
          </div>
        </header>
        <dl className="admin-contacts">
          {contacts.map(([label, value, Icon]) => (
            <div key={label} title={label}>
              <dt aria-label={label}><Icon size={14} aria-hidden="true" /></dt>
              <dd>{value}</dd>
            </div>
          ))}
          {!contacts.length && <div><dt className="sr-only">Contact details</dt><dd>No contact details</dd></div>}
        </dl>
      </div>
      <div className="admin-outlet-assignment">
        <div className="admin-owners">
          <h3>{managers?.length > 1 ? 'Assigned managers' : 'Assigned manager'}</h3>
          {managers?.length ? (
            <ul>{managers.map(manager => (
              <li key={manager.userId} className="admin-owner-row">
                <div><strong>{manager.name}</strong>{manager.email && <span>{manager.email}</span>}</div>
                <button
                  type="button"
                  className="admin-remove-btn"
                  disabled={updating}
                  onClick={() => onRemoveManager(manager, outlet)}
                  aria-label={`Remove ${manager.name}`}
                  title="Remove manager"
                >
                  <UserMinus size={12} /> Remove
                </button>
              </li>
            ))}</ul>
          ) : <p>{managers ? 'Unassigned' : 'Manager details unavailable'}</p>}
        </div>
      </div>
    </article>
  );
}

function ManagerDirectory({ managers, onOpen, onEdit }) {
  return (
    <div className="admin-directory">
      <table>
        <caption className="sr-only">General managers</caption>
        <thead><tr><th scope="col">Manager</th><th scope="col">Restaurant</th><th scope="col">Phone</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>{managers.map(manager => (
          <tr key={manager.userId}>
            <th scope="row"><div className="admin-person">
              <span className="admin-avatar" aria-hidden="true">{initials(manager.name)}</span>
              <div><strong>{manager.name}</strong><small>{manager.email}</small></div>
            </div></th>
            <td data-label="Restaurant">{manager.restaurantName || 'Unassigned'}</td>
            <td data-label="Phone">{manager.phone || '—'}</td>
            <td data-label="Status"><Status value={manager.status} /></td>
            <td>
              <div className="admin-head-actions">
                <button className="admin-button" type="button" onClick={() => onEdit(manager)} aria-label={`Edit ${manager.name}`}>
                  <Pencil size={13} /> Edit
                </button>
              </div>
            </td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

export default function SuperAdminDashboard() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('outlets');
  const [dark, setDark] = useState(() => localStorage.getItem('bistro_pos_theme') === 'dark');
  const [summary, setSummary] = useState(null);
  const [restaurants, setRestaurants] = useState(null);
  const [managers, setManagers] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [updating, setUpdating] = useState(false);
  const [notification, setNotification] = useState(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [selectedId, setSelectedId] = useState(null);
  const [dialog, setDialog] = useState(null);
  const loadVersion = useRef(0);
  const detailHeading = useRef(null);
  const isOutlets = tab === 'outlets';

  useEffect(() => {
    localStorage.setItem('bistro_pos_theme', dark ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.classList.toggle('pos-dark', dark);
  }, [dark]);

  const refresh = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoading(true);
    const [outlets, owners, overview] = await Promise.allSettled([
      api.getRestaurants(), api.getAllManagers(), api.getPlatformSummary(),
    ]);
    if (version !== loadVersion.current) return;
    const missing = [];
    if (outlets.status === 'fulfilled') setRestaurants(outlets.value);
    else missing.push('restaurants');
    if (owners.status === 'fulfilled') setManagers(owners.value);
    else missing.push('managers');
    setSummary(overview.status === 'fulfilled' ? overview.value : null);
    setLoadError(missing.length ? `Couldn’t refresh ${missing.join(' and ')}.` : '');
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    return () => { loadVersion.current += 1; };
  }, [refresh]);

  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(() => setNotification(null), 4000);
    return () => clearTimeout(timer);
  }, [notification]);

  useEffect(() => {
    if (selectedId) detailHeading.current?.focus({ preventScroll: true });
  }, [selectedId]);

  const managersByOutlet = useMemo(() => {
    const groups = new Map();
    for (const manager of managers || []) {
      if (!groups.has(manager.restaurantId)) groups.set(manager.restaurantId, []);
      groups.get(manager.restaurantId).push(manager);
    }
    return groups;
  }, [managers]);

  const query = search.trim().toLowerCase();
  const matchesSearch = (...values) => values.some(value => String(value ?? '').toLowerCase().includes(query));
  const visibleOutlets = (restaurants || []).filter(r =>
    (status === 'ALL' || r.status === status) && matchesSearch(r.name, r.address, r.email)
  );
  const visibleManagers = (managers || []).filter(m => matchesSearch(m.name, m.email, m.restaurantName));
  const detailOutlet = null;
  const otherOutlets = visibleOutlets;

  const changeTab = next => {
    if (next !== tab) {
      setTab(next);
      setSearch('');
    }
  };
  const closeDialog = useCallback(() => setDialog(null), []);
  const assignManager = restaurantId => setDialog({ type: 'manager', restaurantId });
  const editOutlet = outlet => setDialog({ type: 'edit-outlet', outlet });
  const removeManager = async (manager, outlet) => {
    if (!manager?.userId) return;
    if (!window.confirm(`Remove ${manager.name} (${manager.email}) from ${outlet?.name || 'this restaurant'}?`)) return;
    setUpdating(true);
    try {
      await api.deleteStaffUser(manager.userId);
      setNotification({ message: `Removed ${manager.name} from ${outlet?.name || 'restaurant'}.` });
      await refresh();
    } catch (error) {
      setNotification({ error: true, message: error.message || 'Couldn’t remove manager.' });
    } finally {
      setUpdating(false);
    }
  };
  const openWorkspace = id => {
    setActiveRestaurantId(id);
    navigate('/pos');
  };
  const toggleStatus = async outlet => {
    const next = outlet.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    setUpdating(true);
    try {
      await api.updateRestaurantStatus(outlet.restaurantId, next);
      setNotification({ message: `${outlet.name} ${next === 'ACTIVE' ? 'activated' : 'suspended'}.` });
      await refresh();
    } catch (error) {
      setNotification({ error: true, message: error.message || 'Couldn’t update the restaurant.' });
    } finally {
      setUpdating(false);
    }
  };
  const onCreated = message => {
    closeDialog();
    setNotification({ message });
    refresh();
  };
  const deleteOutlet = async outlet => {
    if (!window.confirm(`Delete "${outlet.name}"? This action cannot be undone.`)) return;
    setUpdating(true);
    try {
      await api.deleteRestaurant(outlet.restaurantId);
      if (selectedId === outlet.restaurantId) setSelectedId(null);
      setNotification({ message: `${outlet.name} deleted.` });
      await refresh();
    } catch (error) {
      setNotification({ error: true, message: error.message || 'Couldn’t delete the restaurant.' });
    } finally {
      setUpdating(false);
    }
  };
  const outletCard = (outlet, featured = false) => (
    <OutletCard key={outlet.restaurantId} outlet={outlet} featured={featured}
      managers={managers && (managersByOutlet.get(outlet.restaurantId) || [])}
      onAssign={assignManager} onEdit={editOutlet} onDelete={deleteOutlet} onRemoveManager={removeManager} onOpen={openWorkspace} onToggle={toggleStatus} updating={updating}
      onInspect={!featured && detailOutlet ? () => setSelectedId(outlet.restaurantId) : undefined}
      headingRef={featured ? detailHeading : undefined} />
  );

  const records = isOutlets ? restaurants : managers;
  const hasMatches = isOutlets ? visibleOutlets.length > 0 : visibleManagers.length > 0;
  const filtered = Boolean(query || (isOutlets && status !== 'ALL'));
  const name = currentUser?.name || 'Admin';

  return (
    <div className={`pos-app admin-app${dark ? ' pos-dark dark' : ''}`}>
      <header className="admin-topbar">
        <div className="admin-frame admin-header-inner">
          <div className="admin-brand"><Cloud size={27} strokeWidth={1.7} aria-hidden="true" /><span>Bistro<span>POS</span></span></div>
          <nav className="admin-nav" aria-label="Admin sections">
            <button type="button" aria-current={isOutlets ? 'page' : undefined} onClick={() => changeTab('outlets')}><LayoutGrid size={15} />Outlets &amp; tenants</button>
            <button type="button" aria-current={tab === 'managers' ? 'page' : undefined} onClick={() => changeTab('managers')}><Users size={15} />General managers</button>
            <button type="button" aria-current={tab === 'sms' ? 'page' : undefined} onClick={() => changeTab('sms')}><MessageSquare size={15} />SMS &amp; Notifications</button>
          </nav>
          <div className="admin-utilities">
            <button type="button" className="admin-shortcut" onClick={() => assignManager(null)}
              disabled={!restaurants?.length} aria-label="Assign manager" title="Assign manager">
              <UserPlus size={16} /><span>Assign manager</span>
            </button>
            <button type="button" className="admin-icon" onClick={() => setDark(value => !value)}
              aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} title={dark ? 'Light theme' : 'Dark theme'}>
              {dark ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <div className="admin-user" title={name}><span className="admin-avatar">{initials(name)}</span><div><strong>{name === 'Super Admin Admin' ? 'Super Admin' : name}</strong><small>Platform Admin</small></div></div>
            <button type="button" className="admin-icon" onClick={logout} aria-label="Sign out" title="Sign out"><LogOut size={16} /></button>
          </div>
        </div>
      </header>

      <main className="admin-frame admin-main">
        <div className="admin-toolbar">
          <h1>{isOutlets ? 'BistroPOS Control Plane' : tab === 'sms' ? 'SMS & Notifications' : 'General managers'}</h1>
          {tab !== 'sms' && <div className="admin-filters">
            <label className="admin-search"><Search size={16} aria-hidden="true" />
              <input type="search" aria-label={isOutlets ? 'Search restaurants' : 'Search managers'} value={search}
                placeholder={isOutlets ? 'Search by restaurant or city…' : 'Search by manager or restaurant…'} onChange={e => setSearch(e.target.value)} />
            </label>
            {isOutlets && <select aria-label="Restaurant status" className="admin-select" value={status} onChange={e => setStatus(e.target.value)}>
              <option value="ALL">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Suspended</option>
            </select>}
            <button type="button" className="admin-icon" disabled={loading} onClick={refresh} aria-label="Refresh data" title="Refresh data">
              <RefreshCw size={16} className={loading ? 'pos-spin' : undefined} />
            </button>
            {isOutlets && <button type="button" className="admin-button admin-primary admin-add" onClick={() => setDialog({ type: 'outlet' })}><Plus size={16} />Add restaurant</button>}
          </div>}
        </div>

        {loadError && <div className="admin-load-error" role="alert"><AlertCircle size={16} />{loadError}<button type="button" disabled={loading} onClick={refresh}>Retry</button></div>}

        {tab === 'sms' ? (
          <SmsNotificationsPanel restaurants={restaurants || []} onNotify={setNotification} />
        ) : (
        <div className={`admin-board${detailOutlet ? ' with-inspector' : ''}`} aria-busy={loading}>
          <Summary summary={summary} restaurants={restaurants} managers={managers} />
          {detailOutlet && outletCard(detailOutlet, true)}
          {hasMatches ? (
            isOutlets
              ? <div className="admin-outlet-grid">{otherOutlets.map(outlet => outletCard(outlet))}</div>
              : <ManagerDirectory managers={visibleManagers} onOpen={openWorkspace} onEdit={manager => setDialog({ type: 'edit-manager', manager })} />
          ) : records ? (
            <div className="admin-empty">
              {isOutlets ? <Building2 size={28} /> : <Users size={28} />}
              <h2>{filtered ? 'No matching ' : 'No '}{isOutlets ? 'restaurants' : 'managers'}{filtered ? '' : ' yet'}</h2>
              {filtered && <button className="admin-button" type="button" onClick={() => { setSearch(''); setStatus('ALL'); }}>Clear filters</button>}
            </div>
          ) : loading && <div className="admin-empty" role="status"><RefreshCw size={20} className="pos-spin" />Loading {isOutlets ? 'restaurants' : 'managers'}…</div>}
        </div>
        )}
      </main>

      {notification && <div className={`admin-toast${notification.error ? ' is-error' : ''}`} role={notification.error ? 'alert' : 'status'}>
        {notification.error ? <AlertCircle size={17} /> : <CheckCircle2 size={17} />}{notification.message}
      </div>}
      {dialog?.type === 'outlet' && <AddRestaurantModal onClose={closeDialog} onCreated={r => onCreated(`${r.name} added.`)} />}
      {dialog?.type === 'edit-outlet' && dialog.outlet && (
        <EditRestaurantModal
          restaurant={dialog.outlet}
          managers={managersByOutlet.get(dialog.outlet.restaurantId) || []}
          onClose={closeDialog}
          onRemoveManager={manager => removeManager(manager, dialog.outlet)}
          onSaved={r => onCreated(`${r?.name || dialog.outlet.name || 'Restaurant'} updated.`)}
        />
      )}
      {dialog?.type === 'manager' && <AddManagerModal restaurants={restaurants || []} restaurantId={dialog.restaurantId}
        onClose={closeDialog} onCreated={m => onCreated(`Manager account created for ${m.name}.`)} />}
      {dialog?.type === 'edit-manager' && dialog.manager && (
        <EditManagerModal
          manager={dialog.manager}
          restaurants={restaurants || []}
          onClose={closeDialog}
          onSaved={m => onCreated(`Updated ${m.name}.`)}
        />
      )}
    </div>
  );
}
