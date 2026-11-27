import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2, Users, Plus, CheckCircle2, AlertCircle, RefreshCw,
  Search, ExternalLink, Shield, LogOut, Sun, Moon, ArrowRight, Store,
  Sparkles, Check, Phone, Mail, MapPin, Server, UserCheck, KeyRound,
  Eye, EyeOff, Copy
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api, setActiveRestaurantId } from '../../services/api';
import '../../styles/pos.css';

export default function SuperAdminDashboard() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('restaurants'); // 'restaurants' | 'managers' | 'platform'
  const [dark, setDark] = useState(() => localStorage.getItem('bistro_pos_theme') === 'dark');
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
  const [showSelfPassword, setShowSelfPassword] = useState(false);
  const [selectedUserForPassword, setSelectedUserForPassword] = useState(null);
  const [notification, setNotification] = useState(null);

  useEffect(() => {
    localStorage.setItem('bistro_pos_theme', dark ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.classList.toggle('pos-dark', dark);
  }, [dark]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [summaryRes, restList, managerList] = await Promise.all([
        api.getPlatformSummary().catch(() => ({})),
        api.getRestaurants().catch(() => []),
        api.getAllManagers().catch(() => [])
      ]);

      if (summaryRes && typeof summaryRes === 'object') {
        setSummary(prev => ({ ...prev, ...summaryRes }));
      }
      if (Array.isArray(restList)) {
        setRestaurants(restList);
      }
      if (Array.isArray(managerList)) {
        setManagers(managerList);
      }
    } catch (err) {
      console.error('Failed to load super admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const showToast = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const handleOpenRestaurantPortal = (restaurant) => {
    setActiveRestaurantId(restaurant.restaurantId);
    showToast(`Switched active workspace to ${restaurant.name}`, 'info');
    navigate('/pos');
  };

  const handleToggleRestaurantStatus = async (restaurant) => {
    const newStatus = restaurant.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await api.updateRestaurantStatus(restaurant.restaurantId, newStatus);
      showToast(`${restaurant.name} marked as ${newStatus}`, 'success');
      loadData();
    } catch (err) {
      showToast(err.message || 'Failed to update status', 'error');
    }
  };

  const filteredRestaurants = useMemo(() => {
    return restaurants.filter(r => {
      const matchSearch = String(r.name || '').toLowerCase().includes(search.toLowerCase()) ||
        String(r.email || '').toLowerCase().includes(search.toLowerCase()) ||
        String(r.restaurantCode || '').toLowerCase().includes(search.toLowerCase()) ||
        String(r.restaurantId || '').toLowerCase().includes(search.toLowerCase()) ||
        String(r.address || '').toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === 'ALL' || r.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [restaurants, search, statusFilter]);

  const filteredManagers = useMemo(() => {
    return managers.filter(m => {
      return String(m.name || '').toLowerCase().includes(search.toLowerCase()) ||
        String(m.email || '').toLowerCase().includes(search.toLowerCase()) ||
        String(m.restaurantName || '').toLowerCase().includes(search.toLowerCase());
    });
  }, [managers, search]);

  return (
    <div className={`saas-admin-container pos-app ${dark ? 'pos-dark dark' : ''}`} style={{
      minHeight: '100vh',
      backgroundColor: 'var(--p-bg, #f8fafc)',
      color: 'var(--p-text, #0f172a)',
      fontFamily: 'inherit',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* SaaS Admin Header */}
      <header style={{
        backgroundColor: 'var(--p-surface, #ffffff)',
        borderBottom: '1px solid var(--p-border, #e2e8f0)',
        padding: '16px 28px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        position: 'sticky',
        top: 0,
        zIndex: 50
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: 'linear-gradient(135deg, #4f46e5, #06b6d4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            boxShadow: '0 4px 14px rgba(79, 70, 229, 0.3)'
          }}>
            <Shield size={24} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h1 style={{ margin: 0, fontSize: 18, fontWeight: 750, letterSpacing: '-0.02em' }}>
                BistroPOS Control Plane
              </h1>
              <span style={{
                background: 'rgba(79, 70, 229, 0.12)',
                color: '#4f46e5',
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 20,
                letterSpacing: '0.05em',
                textTransform: 'uppercase'
              }}>
                Developer / Super Admin
              </span>
            </div>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--p-muted, #64748b)' }}>
              Central Multi-Tenant Platform & Client Delivery System
            </p>
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
            onClick={() => setShowSelfPassword(true)}
            className="pos-button"
            title="Change Super Admin password"
            style={{
              padding: '8px 14px',
              fontSize: 13,
              fontWeight: 650,
              gap: 6,
              borderRadius: 10,
              border: '1px solid var(--p-border)',
              background: 'var(--p-surface)',
              color: 'var(--p-text)'
            }}
          >
            <KeyRound size={15} style={{ color: '#6366f1' }} /> My Password
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

      {/* Notification Toast */}
      {notification && (
        <div style={{
          position: 'fixed',
          top: 80,
          right: 28,
          zIndex: 100,
          padding: '12px 18px',
          borderRadius: 10,
          background: notification.type === 'error' ? '#ef4444' : notification.type === 'info' ? '#3b82f6' : '#10b981',
          color: '#fff',
          fontWeight: 600,
          fontSize: 13,
          boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          animation: 'slideIn 0.2s ease-out'
        }}>
          {notification.type === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
          {notification.message}
        </div>
      )}

      {/* Main SaaS Administration Area */}
      <main style={{ padding: '24px 28px', maxWidth: 1400, width: '100%', margin: '0 auto', flex: 1 }}>
        {/* Metric KPI Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 16,
          marginBottom: 24
        }}>
          <div style={{
            background: 'var(--p-surface, #ffffff)',
            borderRadius: 14,
            padding: '20px 22px',
            border: '1px solid var(--p-border, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
          }}>
            <div style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: 'rgba(16, 185, 129, 0.12)',
              color: '#10b981',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Building2 size={24} />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--p-muted)', fontWeight: 600 }}>Total Restaurants (Tenants)</p>
              <h2 style={{ margin: '4px 0 0', fontSize: 24, fontWeight: 750 }}>
                {summary.totalRestaurants || restaurants.length}
              </h2>
              <span style={{ fontSize: 11, color: '#10b981', fontWeight: 600 }}>
                ● {summary.activeRestaurants || restaurants.filter(r => r.status === 'ACTIVE').length} Active
              </span>
            </div>
          </div>

          <div style={{
            background: 'var(--p-surface, #ffffff)',
            borderRadius: 14,
            padding: '20px 22px',
            border: '1px solid var(--p-border, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
          }}>
            <div style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: 'rgba(245, 158, 11, 0.12)',
              color: '#f59e0b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <UserCheck size={24} />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--p-muted)', fontWeight: 600 }}>Restaurant General Managers</p>
              <h2 style={{ margin: '4px 0 0', fontSize: 24, fontWeight: 750 }}>
                {summary.totalManagers || managers.length}
              </h2>
              <span style={{ fontSize: 11, color: 'var(--p-muted)', fontWeight: 500 }}>
                Client Owner Logins
              </span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs & Search Toolbar */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          marginBottom: 20
        }}>
          {/* Tab buttons */}
          <div className="pos-tabs" style={{ margin: 0, background: 'var(--p-surface)', border: '1px solid var(--p-border)', borderRadius: 10, padding: 3 }}>
            <button
              className={`pos-tab ${activeTab === 'restaurants' ? 'active' : ''}`}
              onClick={() => setActiveTab('restaurants')}
              style={{ borderRadius: 8, padding: '7px 16px', fontSize: 13, fontWeight: 600 }}
            >
              <Building2 size={14} style={{ display: 'inline', marginRight: 6 }} />
              Outlets & Tenants ({restaurants.length})
            </button>
            <button
              className={`pos-tab ${activeTab === 'managers' ? 'active' : ''}`}
              onClick={() => setActiveTab('managers')}
              style={{ borderRadius: 8, padding: '7px 16px', fontSize: 13, fontWeight: 600 }}
            >
              <Users size={14} style={{ display: 'inline', marginRight: 6 }} />
              Hotel General Managers ({managers.length})
            </button>
            <button
              className={`pos-tab ${activeTab === 'platform' ? 'active' : ''}`}
              onClick={() => setActiveTab('platform')}
              style={{ borderRadius: 8, padding: '7px 16px', fontSize: 13, fontWeight: 600 }}
            >
              <Sparkles size={14} style={{ display: 'inline', marginRight: 6 }} />
              Delivery Flow Guide
            </button>
          </div>

          {/* Search & Refresh */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {activeTab !== 'platform' && (
              <div style={{ position: 'relative', minWidth: 260 }}>
                <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--p-muted)' }} />
                <input
                  className="pos-input"
                  style={{ paddingLeft: 32, fontSize: 13, height: 38, borderRadius: 10 }}
                  placeholder={activeTab === 'restaurants' ? "Search restaurant by name, city…" : "Search managers…"}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
            )}

            {activeTab === 'restaurants' && (
              <select
                className="pos-select"
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                style={{ height: 38, borderRadius: 10, fontSize: 13 }}
              >
                <option value="ALL">All Status</option>
                <option value="ACTIVE">Active Outlets</option>
                <option value="INACTIVE">Suspended</option>
              </select>
            )}

            <button
              onClick={loadData}
              className="pos-icon-button"
              title="Refresh Data"
              disabled={loading}
              style={{ width: 38, height: 38, borderRadius: 10, border: '1px solid var(--p-border)', background: 'var(--p-surface)' }}
            >
              <RefreshCw size={15} className={loading ? 'pos-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Tab 1: Restaurants List */}
        {activeTab === 'restaurants' && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
            gap: 18
          }}>
            {filteredRestaurants.map(r => {
              const assignedGMs = managers.filter(m => m.restaurantId === r.restaurantId);
              return (
                <div
                  key={r.restaurantId}
                  style={{
                    backgroundColor: 'var(--p-surface, #ffffff)',
                    borderRadius: 14,
                    border: '1px solid var(--p-border, #e2e8f0)',
                    padding: 22,
                    boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    position: 'relative'
                  }}
                >
                  <div>
                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                          width: 42,
                          height: 42,
                          borderRadius: 10,
                          background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.15), rgba(6, 182, 212, 0.15))',
                          color: '#4f46e5',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: 18
                        }}>
                          {r.name?.charAt(0) || 'R'}
                        </div>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--p-text)' }}>
                              {r.name}
                            </h3>
                            {r.restaurantCode && (
                              <span style={{
                                display: 'inline-block',
                                fontSize: 10,
                                fontWeight: 700,
                                padding: '2px 7px',
                                borderRadius: 6,
                                background: '#e0e7ff',
                                color: '#4338ca',
                                letterSpacing: '0.5px'
                              }}>
                                {r.restaurantCode}
                              </span>
                            )}
                          </div>
                          <span style={{
                            display: 'inline-block',
                            marginTop: 3,
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '1px 6px',
                            borderRadius: 6,
                            background: r.status === 'ACTIVE' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                            color: r.status === 'ACTIVE' ? '#10b981' : '#ef4444'
                          }}>
                            ● {r.status}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={() => handleToggleRestaurantStatus(r)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          fontSize: 11,
                          fontWeight: 600,
                          color: r.status === 'ACTIVE' ? 'var(--p-muted)' : '#10b981',
                          cursor: 'pointer',
                          textDecoration: 'underline'
                        }}
                      >
                        {r.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                      </button>
                    </div>

                    {/* Contact Details */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--p-muted)', marginBottom: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <MapPin size={13} style={{ flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.address || 'Address not provided'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Phone size={13} style={{ flexShrink: 0 }} />
                        <span>{r.phone || 'Phone not set'}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Mail size={13} style={{ flexShrink: 0 }} />
                        <span>{r.email || 'Email not set'}</span>
                      </div>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: 10,
                        color: 'var(--p-muted)',
                        padding: '4px 8px',
                        background: 'rgba(0,0,0,0.03)',
                        borderRadius: 6,
                        fontFamily: 'monospace',
                        marginTop: 4
                      }}>
                        <span title={r.restaurantId} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 230 }}>
                          UUID: {r.restaurantId}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(r.restaurantId);
                            showToast('Restaurant UUID copied to clipboard!', 'info');
                          }}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--p-blue, #2563eb)',
                            cursor: 'pointer',
                            fontSize: 10,
                            padding: '1px 4px',
                            fontWeight: 600
                          }}
                        >
                          Copy
                        </button>
                      </div>
                    </div>

                    {/* Assigned Managers */}
                    <div style={{
                      padding: '10px 12px',
                      background: 'var(--p-bg, #f8fafc)',
                      borderRadius: 10,
                      marginBottom: 16,
                      fontSize: 12
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                        <strong style={{ fontSize: 11, color: 'var(--p-muted)', textTransform: 'uppercase' }}>
                          Assigned Owner / GM:
                        </strong>
                        {assignedGMs.length === 0 && (
                          <button
                            onClick={() => {
                              setSelectedRestaurantForManager(r);
                              setShowAddManager(true);
                            }}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: 'var(--p-blue, #2563eb)',
                              fontSize: 11,
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            + Assign GM
                          </button>
                        )}
                      </div>
                      {assignedGMs.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          {assignedGMs.map(gm => (
                            <div key={gm.userId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontWeight: 600, color: 'var(--p-text)' }}>{gm.name}</span>
                              <span style={{ color: 'var(--p-muted)', fontSize: 11 }}>{gm.email}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span style={{ color: '#f59e0b', fontSize: 11, fontWeight: 500 }}>
                          ⚠ No General Manager assigned yet
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8, paddingTop: 12, borderTop: '1px solid var(--p-border)' }}>
                    <button
                      type="button"
                      style={{
                        flex: 1,
                        padding: '9px 14px',
                        fontSize: 12,
                        fontWeight: 700,
                        justifyContent: 'center',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        borderRadius: 10,
                        background: '#1e40af',
                        color: '#ffffff',
                        border: '2px solid #3b82f6',
                        boxShadow: '0 2px 8px rgba(30, 64, 175, 0.35)',
                        cursor: 'pointer',
                        letterSpacing: '0.01em',
                        transition: 'all 0.15s ease'
                      }}
                      onClick={() => handleOpenRestaurantPortal(r)}
                    >
                      <Store size={15} style={{ color: '#ffffff', flexShrink: 0 }} />
                      <span style={{ color: '#ffffff', fontWeight: 700 }}>Open Restaurant Workspace</span>
                    </button>
                    <button
                      type="button"
                      style={{
                        padding: '9px 14px',
                        fontSize: 12,
                        fontWeight: 650,
                        borderRadius: 10,
                        border: '1.5px solid var(--p-border, #cbd5e1)',
                        background: 'var(--p-surface, #ffffff)',
                        color: 'var(--p-text, #0f172a)',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6
                      }}
                      title="Assign Hotel Manager"
                      onClick={() => {
                        setSelectedRestaurantForManager(r);
                        setShowAddManager(true);
                      }}
                    >
                      <Plus size={14} /> GM
                    </button>
                  </div>
                </div>
              );
            })}

            {filteredRestaurants.length === 0 && (
              <div style={{
                gridColumn: '1 / -1',
                padding: '48px 24px',
                textAlign: 'center',
                background: 'var(--p-surface)',
                borderRadius: 14,
                border: '1px dashed var(--p-border)'
              }}>
                <Building2 size={40} style={{ color: 'var(--p-muted)', margin: '0 auto 12px' }} />
                <h3 style={{ margin: '0 0 6px', fontWeight: 650 }}>No restaurants found</h3>
                <p style={{ margin: '0 0 16px', color: 'var(--p-muted)', fontSize: 13 }}>
                  Create your first client restaurant to get started.
                </p>
                <button
                  className="pos-button primary"
                  onClick={() => setShowAddRestaurant(true)}
                >
                  <Plus size={15} /> Add Restaurant Outlet
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Hotel General Managers */}
        {activeTab === 'managers' && (
          <div style={{
            background: 'var(--p-surface, #ffffff)',
            borderRadius: 14,
            border: '1px solid var(--p-border, #e2e8f0)',
            overflow: 'hidden',
            boxShadow: '0 2px 6px rgba(0,0,0,0.03)'
          }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--p-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Restaurant Owners & General Managers</h3>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--p-muted)' }}>
                  These client accounts have full control over their restaurant's tables, menus, and staff.
                </p>
              </div>
              <button
                className="pos-button primary"
                style={{ padding: '6px 14px', fontSize: 12 }}
                onClick={() => {
                  setSelectedRestaurantForManager(null);
                  setShowAddManager(true);
                }}
              >
                <Plus size={14} /> Assign New GM
              </button>
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
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <button
                          className="pos-button small"
                          title={`Change password for ${m.name}`}
                          onClick={() => setSelectedUserForPassword(m)}
                          style={{ gap: 4 }}
                        >
                          <KeyRound size={12} style={{ color: '#4f46e5' }} /> Password
                        </button>
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
                      </div>
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

      {/* Add Restaurant Modal */}
      {showAddRestaurant && (
        <AddRestaurantModal
          onClose={() => setShowAddRestaurant(false)}
          onCreated={(newRes) => {
            setShowAddRestaurant(false);
            showToast(`Restaurant ${newRes.name} onboarded successfully!`, 'success');
            loadData();
          }}
        />
      )}

      {/* Add Manager Modal */}
      {showAddManager && (
        <AddManagerModal
          restaurants={restaurants}
          preSelectedRestaurant={selectedRestaurantForManager}
          onClose={() => {
            setShowAddManager(false);
            setSelectedRestaurantForManager(null);
          }}
          onCreated={(newManager) => {
            setShowAddManager(false);
            setSelectedRestaurantForManager(null);
            showToast(`General Manager account created for ${newManager.name}!`, 'success');
            loadData();
          }}
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
          <div style={{
            padding: '10px 14px',
            background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.08), rgba(6, 182, 212, 0.08))',
            borderRadius: 10,
            marginBottom: 16,
            fontSize: 12,
            color: '#3730a3',
            border: '1px solid rgba(79, 70, 229, 0.15)',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
            <span>✨ <strong>Auto-Generated:</strong> Sequential Restaurant Code (starting from <strong>RST-100</strong>) & Unique Database UUID</span>
          </div>

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
          <div style={{
            padding: '10px 14px',
            background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.08), rgba(6, 182, 212, 0.08))',
            borderRadius: 10,
            marginBottom: 16,
            fontSize: 12,
            color: '#3730a3',
            border: '1px solid rgba(79, 70, 229, 0.15)',
            display: 'flex',
            alignItems: 'center',
            gap: 8
          }}>
            <span>✨ <strong>Auto-Generated:</strong> Sequential Restaurant Code (starting from <strong>RST-100</strong>) & Unique Database UUID</span>
          </div>

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
                  {r.name} {r.restaurantCode ? `[${r.restaurantCode}]` : ''} ({r.address || 'No address'})
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

function ChangePasswordModal({ user, isSelf, onClose, onSuccess }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const generateRandomPassword = () => {
    const letters = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz';
    const numbers = '23456789';
    const specials = '!@#$%&*';
    let res = '';
    for (let i = 0; i < 6; i++) res += letters[Math.floor(Math.random() * letters.length)];
    for (let i = 0; i < 3; i++) res += numbers[Math.floor(Math.random() * numbers.length)];
    for (let i = 0; i < 2; i++) res += specials[Math.floor(Math.random() * specials.length)];
    setNewPassword(res);
    setConfirmPassword(res);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (!/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setError('Password must contain both letters and numbers.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      if (isSelf) {
        await api.changeMyPassword({ currentPassword, newPassword });
        onSuccess('Your password has been changed successfully.');
      } else {
        await api.updateUserPassword(user.userId, newPassword);
        onSuccess(`Password for ${user.name} (${user.role || 'Manager'}) updated successfully.`);
      }
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to update password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.65)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: 20
    }}>
      <div style={{
        backgroundColor: 'var(--p-surface, #ffffff)',
        borderRadius: 16,
        maxWidth: 440,
        width: '100%',
        boxShadow: '0 20px 50px rgba(0,0,0,0.25)',
        border: '1px solid var(--p-border, #e2e8f0)',
        overflow: 'hidden'
      }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--p-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(99, 102, 241, 0.12)', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <KeyRound size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
                {isSelf ? 'Change My Password' : `Change Password: ${user.name}`}
              </h3>
              <p style={{ margin: 0, fontSize: 11, color: 'var(--p-muted)' }}>
                {isSelf ? 'Update your platform credentials' : `${user.role || 'Manager'} · ${user.email}`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="pos-icon-button" style={{ width: 32, height: 32, borderRadius: 8 }}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '20px 24px' }}>
          {error && (
            <div style={{ padding: '10px 14px', borderRadius: 8, background: '#fee2e2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 12, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertCircle size={15} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {isSelf && (
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Current Password (Optional for Super Admin)</label>
              <input
                type={showPassword ? 'text' : 'password'}
                className="pos-input"
                style={{ width: '100%' }}
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
              />
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 600 }}>New Password</label>
              <button
                type="button"
                onClick={generateRandomPassword}
                style={{ background: 'transparent', border: 'none', color: '#4f46e5', fontSize: 11, fontWeight: 650, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
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

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 14, borderTop: '1px solid var(--p-border)' }}>
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
      </div>
    </div>
  );
}
