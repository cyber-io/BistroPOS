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
  const [summary, setSummary] = useState({
    totalRestaurants: 0,
    activeRestaurants: 0,
    totalTables: 0,
    totalManagers: 0,
    totalOrders: 0
  });
  const [restaurants, setRestaurants] = useState([]);
  const [managers, setManagers] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Modals
  const [showAddRestaurant, setShowAddRestaurant] = useState(false);
  const [showAddManager, setShowAddManager] = useState(false);
  const [selectedRestaurantForManager, setSelectedRestaurantForManager] = useState(null);
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

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            type="button"
            onClick={() => setDark(d => !d)}
            className="pos-icon-button"
            title={dark ? 'Switch to light theme' : 'Switch to dark theme'}
            aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
            style={{ width: 38, height: 38, borderRadius: 10, border: '1px solid var(--p-border)' }}
          >
            {dark ? <Sun size={17} /> : <Moon size={17} />}
          </button>

          <button
            onClick={() => setShowAddRestaurant(true)}
            className="pos-button primary"
            style={{
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 650,
              gap: 8,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #10b981, #059669)',
              borderColor: '#059669'
            }}
          >
            <Plus size={16} /> Add Restaurant (Tenant)
          </button>

          <button
            onClick={() => {
              setSelectedRestaurantForManager(null);
              setShowAddManager(true);
            }}
            className="pos-button"
            style={{
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 650,
              gap: 8,
              borderRadius: 10,
              border: '1px solid var(--p-border)',
              background: 'var(--p-surface)'
            }}
          >
            <Users size={16} /> Assign Hotel GM
          </button>

          <button
            onClick={() => navigate('/pos')}
            className="pos-button"
            title="Enter POS workspace for active restaurant"
            style={{
              padding: '8px 14px',
              fontSize: 13,
              fontWeight: 600,
              gap: 6,
              borderRadius: 10,
              border: '1px solid var(--p-border)',
              background: 'var(--p-surface)',
              color: 'var(--p-blue, #2563eb)'
            }}
          >
            <Store size={15} /> Store Workspace <ArrowRight size={13} />
          </button>

          <div style={{ height: 24, width: 1, backgroundColor: 'var(--p-border, #cbd5e1)', margin: '0 4px' }} />

          <button
            onClick={logout}
            className="pos-icon-button"
            title="Sign out of developer control plane"
            style={{ width: 38, height: 38, borderRadius: 10, color: 'var(--p-red, #ef4444)' }}
          >
            <LogOut size={17} />
          </button>
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

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--p-bg, #f8fafc)', borderBottom: '1px solid var(--p-border)', textAlign: 'left', color: 'var(--p-muted)' }}>
                  <th style={{ padding: '12px 20px', fontWeight: 600 }}>Manager Name</th>
                  <th style={{ padding: '12px 20px', fontWeight: 600 }}>Assigned Property</th>
                  <th style={{ padding: '12px 20px', fontWeight: 600 }}>Email Address</th>
                  <th style={{ padding: '12px 20px', fontWeight: 600 }}>Mobile Number</th>
                  <th style={{ padding: '12px 20px', fontWeight: 600 }}>Status</th>
                  <th style={{ padding: '12px 20px', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredManagers.map(m => (
                  <tr key={m.userId} style={{ borderBottom: '1px solid var(--p-border)' }}>
                    <td style={{ padding: '14px 20px', fontWeight: 650 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          background: 'rgba(59, 130, 246, 0.12)',
                          color: '#3b82f6',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: 13
                        }}>
                          {m.name?.charAt(0) || 'M'}
                        </div>
                        {m.name}
                      </div>
                    </td>
                    <td style={{ padding: '14px 20px', color: 'var(--p-text)' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '3px 8px',
                        borderRadius: 6,
                        background: 'var(--p-bg, #f1f5f9)',
                        fontWeight: 600,
                        fontSize: 12
                      }}>
                        <Building2 size={12} /> {m.restaurantName || 'Unassigned'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 20px', color: 'var(--p-muted)' }}>{m.email}</td>
                    <td style={{ padding: '14px 20px', color: 'var(--p-muted)' }}>{m.phone || '—'}</td>
                    <td style={{ padding: '14px 20px' }}>
                      <span style={{
                        fontSize: 11,
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 12,
                        background: 'rgba(16, 185, 129, 0.12)',
                        color: '#10b981'
                      }}>
                        ● ACTIVE
                      </span>
                    </td>
                    <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                      <button
                        className="pos-button small"
                        onClick={() => {
                          if (m.restaurantId) {
                            setActiveRestaurantId(m.restaurantId);
                            navigate('/pos');
                          }
                        }}
                      >
                        View Outlet <ArrowRight size={11} />
                      </button>
                    </td>
                  </tr>
                ))}

                {filteredManagers.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--p-muted)' }}>
                      No managers registered yet. Click "+ Assign New GM" to create credentials for a restaurant owner.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 3: Client Delivery Workflow */}
        {activeTab === 'platform' && (
          <div style={{ maxWidth: 840, margin: '0 auto' }}>
            {/* Delivery Workflow Guide */}
            <div style={{
              background: 'var(--p-surface, #ffffff)',
              borderRadius: 14,
              border: '1px solid var(--p-border, #e2e8f0)',
              padding: 28,
              boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
            }}>
              <h3 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Sparkles size={18} color="#4f46e5" />
                Step-by-Step Delivery Flow (Developer to Client)
              </h3>
              <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--p-muted)', lineHeight: 1.5 }}>
                Follow this 4-step delivery pipeline whenever you onboard a new restaurant client:
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', gap: 14 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#4f46e5', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 750, fontSize: 13, flexShrink: 0 }}>
                    1
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: 14, fontWeight: 650 }}>Create Restaurant Tenant</h4>
                    <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--p-muted)', lineHeight: 1.4 }}>
                      Register the restaurant name, address, and GST rate. The system provisions an isolated tenant space.
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 14 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#4f46e5', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 750, fontSize: 13, flexShrink: 0 }}>
                    2
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: 14, fontWeight: 650 }}>Handover Manager Login</h4>
                    <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--p-muted)', lineHeight: 1.4 }}>
                      Create the restaurant owner's credentials with the <code>MANAGER</code> role and send them their Welcome Portal kit (URL, login email, password).
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 14 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#4f46e5', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 750, fontSize: 13, flexShrink: 0 }}>
                    3
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: 14, fontWeight: 650 }}>Owner Sets Tables & Menu</h4>
                    <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--p-muted)', lineHeight: 1.4 }}>
                      The restaurant owner logs in, configures their 2-seater, 4-seater, or VIP tables with custom seating capacities, prints the Table QR codes, and uploads their food menu.
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 14 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#10b981', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 750, fontSize: 13, flexShrink: 0 }}>
                    ✓
                  </div>
                  <div>
                    <h4 style={{ margin: 0, fontSize: 14, fontWeight: 650, color: '#10b981' }}>Go-Live Operations</h4>
                    <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--p-muted)', lineHeight: 1.4 }}>
                      Waiters log into <code>/waiter</code>, chefs log into <code>/kitchen</code>, and counter cashiers log into <code>/pos</code>. Customer scans table QR to place instant orders.
                    </p>
                  </div>
                </div>
              </div>
            </div>
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
      {/* Change Password Modal (For Self or Manager) */}
      {(showSelfPassword || selectedUserForPassword) && (
        <ChangePasswordModal
          user={selectedUserForPassword || currentUser}
          isSelf={showSelfPassword}
          onClose={() => {
            setShowSelfPassword(false);
            setSelectedUserForPassword(null);
          }}
          onSuccess={(msg) => {
            showToast(msg, 'success');
          }}
        />
      )}
    </div>
  );
}

// Standalone AddRestaurantModal with >= 24px padding
function AddRestaurantModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    name: '',
    address: '',
    phone: '',
    email: '',
    logo: '',
    taxRate: '5'
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.phone.trim() || !form.address.trim()) {
      setError('Please fill in all mandatory restaurant details.');
      return;
    }

    try {
      setBusy(true);
      setError(null);
      const res = await api.createRestaurant({
        name: form.name.trim(),
        address: form.address.trim(),
        phone: form.phone.trim(),
        email: form.email.trim().toLowerCase(),
        logo: form.logo.trim() || null,
        taxRate: Number(form.taxRate) ? Number(form.taxRate) / 100 : 0.05,
        initialTableCount: 0
      });
      onCreated(res);
    } catch (err) {
      setError(err.message || 'Failed to create restaurant.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pos-modal-backdrop" style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0,0,0,0.6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      padding: 16
    }}>
      <div className="pos-modal-inner" style={{
        backgroundColor: 'var(--p-surface, #ffffff)',
        borderRadius: 16,
        maxWidth: 580,
        width: '100%',
        boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
        overflow: 'hidden'
      }}>
        {/* Header with 24px padding */}
        <header style={{
          padding: '24px 24px 18px',
          borderBottom: '1px solid var(--p-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Onboard New Restaurant</h2>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--p-muted)' }}>
              Step 1: Create isolated tenant property for new client
            </p>
          </div>
          <button className="pos-icon-button" onClick={onClose}>✕</button>
        </header>

        {/* Form Body with 24px padding */}
        <form onSubmit={handleSubmit} style={{ padding: 24 }}>
          {error && (
            <div className="pos-error" style={{ marginBottom: 16, padding: '10px 14px' }}>
              <AlertCircle size={15} /> {error}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14, marginBottom: 14 }}>
            <label className="pos-field">
              <span>Restaurant / Hotel Name *</span>
              <input
                className="pos-input"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Royal Orchid Fine Dining"
                required
                autoFocus
              />
            </label>
            <label className="pos-field">
              <span>Contact Email *</span>
              <input
                type="email"
                className="pos-input"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                placeholder="contact@royalorchid.com"
                required
              />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <label className="pos-field">
              <span>Contact Phone / Mobile *</span>
              <input
                type="tel"
                className="pos-input"
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
                placeholder="+91 98765 43210"
                required
              />
            </label>
            <label className="pos-field">
              <span>Street Address & City *</span>
              <input
                className="pos-input"
                value={form.address}
                onChange={e => setForm({ ...form, address: e.target.value })}
                placeholder="e.g. 45, MG Road, Bengaluru"
                required
              />
            </label>
          </div>

          <div style={{ marginBottom: 24 }}>
            <label className="pos-field">
              <span>Default Tax Rate (GST %)</span>
              <input
                type="number"
                min={0}
                max={28}
                step={0.5}
                className="pos-input"
                value={form.taxRate}
                onChange={e => setForm({ ...form, taxRate: e.target.value })}
              />
              <small style={{ color: 'var(--p-muted)', marginTop: 4 }}>Standard GST applied to restaurant orders (default: 5%)</small>
            </label>
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', paddingTop: 16, borderTop: '1px solid var(--p-border)' }}>
            <button type="button" className="pos-button" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="pos-button primary" disabled={busy}>
              {busy ? <RefreshCw size={14} className="pos-spin" /> : <Plus size={14} />}
              {busy ? 'Registering Tenant…' : 'Create Restaurant'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Standalone AddManagerModal with >= 24px padding & Client Handover Toolkit
function AddManagerModal({ restaurants, preSelectedRestaurant, onClose, onCreated }) {
  const [selectedRestId, setSelectedRestId] = useState(() => preSelectedRestaurant?.restaurantId || restaurants[0]?.restaurantId || '');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('Bistro@123');
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const targetRest = restaurants.find(r => r.restaurantId === selectedRestId) || preSelectedRestaurant;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedRestId) {
      setError('Please select a target restaurant.');
      return;
    }
    if (!name.trim() || !email.trim()) {
      setError('Manager name and login email are required.');
      return;
    }

    try {
      setBusy(true);
      setError(null);
      const user = await api.createStaffUser({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim() || null,
        password: password || 'Bistro@123',
        role: 'MANAGER',
        restaurantId: selectedRestId
      });
      onCreated(user);
    } catch (err) {
      setError(err.message || 'Failed to create manager account.');
    } finally {
      setBusy(false);
    }
  };

  const handoverMessage = `Welcome to BistroPOS!
Aapke restaurant "${targetRest?.name || 'Hotel'}" ka POS Portal ready hai.
🔗 Portal URL: ${window.location.origin}/pos/login
📧 Login Email: ${email || 'owner@hotel.com'}
🔑 Password: ${password}

Is login se aap apna Menu, Staff aur Table QR codes manage kar sakte hain.`;

  const copyHandover = () => {
    navigator.clipboard.writeText(handoverMessage);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="pos-modal-backdrop" style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0,0,0,0.6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      padding: 16
    }}>
      <div className="pos-modal-inner" style={{
        backgroundColor: 'var(--p-surface, #ffffff)',
        borderRadius: 16,
        maxWidth: 580,
        width: '100%',
        boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
        overflow: 'hidden'
      }}>
        {/* Header with 24px padding */}
        <header style={{
          padding: '24px 24px 18px',
          borderBottom: '1px solid var(--p-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Step 2: Assign Hotel General Manager</h2>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--p-muted)' }}>
              Create owner credentials with full restaurant administrative rights
            </p>
          </div>
          <button className="pos-icon-button" onClick={onClose}>✕</button>
        </header>

        {/* Form Body with 24px padding */}
        <form onSubmit={handleSubmit} style={{ padding: 24 }}>
          {error && (
            <div className="pos-error" style={{ marginBottom: 16, padding: '10px 14px' }}>
              <AlertCircle size={15} /> {error}
            </div>
          )}

          <label className="pos-field" style={{ marginBottom: 14 }}>
            <span>Target Restaurant Property *</span>
            <select
              className="pos-select"
              style={{ width: '100%', fontWeight: 600 }}
              value={selectedRestId}
              onChange={e => setSelectedRestId(e.target.value)}
              required
            >
              {restaurants.map(r => (
                <option key={r.restaurantId} value={r.restaurantId}>
                  {r.name} ({r.address || 'No address'})
                </option>
              ))}
            </select>
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 14, marginBottom: 14 }}>
            <label className="pos-field">
              <span>Owner / Manager Full Name *</span>
              <input
                className="pos-input"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Ramesh Sharma"
                required
              />
            </label>
            <label className="pos-field">
              <span>Login Email Address *</span>
              <input
                type="email"
                className="pos-input"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="owner@royalorchid.com"
                required
              />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
            <label className="pos-field">
              <span>Contact Mobile Phone</span>
              <input
                type="tel"
                className="pos-input"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
              />
            </label>

            <label className="pos-field">
              <span>Initial Password *</span>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPass ? "text" : "password"}
                  className="pos-input"
                  style={{ width: '100%', paddingRight: 36 }}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  style={{
                    position: 'absolute',
                    right: 8,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--p-muted)',
                    cursor: 'pointer'
                  }}
                >
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </label>
          </div>

          {/* Quick Copy Handover message */}
          <div style={{
            padding: '12px 14px',
            background: 'var(--p-bg, #f8fafc)',
            borderRadius: 10,
            border: '1px dashed var(--p-border)',
            marginBottom: 20
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <strong style={{ fontSize: 11, color: 'var(--p-muted)' }}>CLIENT WELCOME MESSAGE:</strong>
              <button
                type="button"
                onClick={copyHandover}
                style={{
                  background: 'none',
                  border: 'none',
                  color: copied ? '#10b981' : 'var(--p-blue)',
                  fontSize: 11,
                  fontWeight: 650,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4
                }}
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? 'Copied to Clipboard!' : 'Copy Onboarding Message'}
              </button>
            </div>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--p-muted)', fontFamily: 'monospace', lineHeight: 1.4 }}>
              Portal: {window.location.origin}/pos/login · Email: {email || 'owner@...'} · Password: {password}
            </p>
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', paddingTop: 16, borderTop: '1px solid var(--p-border)' }}>
            <button type="button" className="pos-button" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="pos-button primary" disabled={busy}>
              {busy ? <RefreshCw size={14} className="pos-spin" /> : <UserCheck size={14} />}
              {busy ? 'Creating Manager…' : 'Create Manager Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
