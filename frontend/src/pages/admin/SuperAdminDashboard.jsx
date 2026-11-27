
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  LayoutGrid,
  LogOut,
  Mail,
  MapPin,
  MessageSquare,
  Moon,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Store,
  Sun,
  Trash2,
  Users,
} from 'lucide-react';

import { useAuth } from '../../context/AuthContext';
import {
  api,
  setActiveRestaurantId,
} from '../../services/api';

import {
  AddManagerModal,
  AddRestaurantModal,
  EditManagerModal,
  EditRestaurantModal,
} from './AdminForms';

import SmsNotificationsPanel from './SmsNotificationsPanel';
import '../../styles/pos.css';

export default function SuperAdminDashboard() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('restaurants');
  const [dark, setDark] = useState(
    () => localStorage.getItem('bistro_pos_theme') === 'dark'
  );

  const [loading, setLoading] = useState(true);
  const [restaurants, setRestaurants] = useState([]);
  const [managers, setManagers] = useState([]);

  const [summary, setSummary] = useState({
    totalRestaurants: 0,
    activeRestaurants: 0,
    totalTables: 0,
    totalManagers: 0,
    totalOrders: 0,
  });

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [notification, setNotification] = useState(null);

  const [showAddRestaurant, setShowAddRestaurant] = useState(false);
  const [showAddManager, setShowAddManager] = useState(false);
  const [selectedRestaurantForManager, setSelectedRestaurantForManager] =
    useState(null);

  const [editingRestaurant, setEditingRestaurant] = useState(null);
  const [editingManager, setEditingManager] = useState(null);

  const [updatingId, setUpdatingId] = useState(null);

  const showToast = useCallback((message, type = 'success') => {
    setNotification({ message, type });
    window.setTimeout(() => setNotification(null), 4000);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);

    try {
      const [summaryResult, restaurantResult, managerResult] =
        await Promise.all([
          api.getPlatformSummary().catch(() => ({})),
          api.getRestaurants().catch(() => []),
          api.getAllManagers().catch(() => []),
        ]);

      if (summaryResult && typeof summaryResult === 'object') {
        setSummary((previous) => ({
          ...previous,
          ...summaryResult,
        }));
      }

      setRestaurants(
        Array.isArray(restaurantResult) ? restaurantResult : []
      );

      setManagers(
        Array.isArray(managerResult) ? managerResult : []
      );
    } catch (error) {
      console.error('Failed to load super admin data:', error);
      showToast('Unable to load dashboard data.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    localStorage.setItem('bistro_pos_theme', dark ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.classList.toggle('pos-dark', dark);
  }, [dark]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredRestaurants = useMemo(() => {
    const query = search.toLowerCase().trim();

    return restaurants.filter((restaurant) => {
      const matchesSearch =
        !query ||
        [
          restaurant.name,
          restaurant.email,
          restaurant.address,
          restaurant.phone,
        ].some((value) =>
          String(value || '').toLowerCase().includes(query)
        );

      const matchesStatus =
        statusFilter === 'ALL' ||
        restaurant.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [restaurants, search, statusFilter]);

  const filteredManagers = useMemo(() => {
    const query = search.toLowerCase().trim();

    return managers.filter((manager) =>
      [
        manager.name,
        manager.email,
        manager.restaurantName,
      ].some((value) =>
        String(value || '').toLowerCase().includes(query)
      )
    );
  }, [managers, search]);

  const handleToggleStatus = async (restaurant) => {
    const newStatus =
      restaurant.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';

    try {
      setUpdatingId(restaurant.restaurantId);

      await api.updateRestaurantStatus(
        restaurant.restaurantId,
        newStatus
      );

      showToast(
        `${restaurant.name} marked as ${newStatus}.`
      );

      await loadData();
    } catch (error) {
      showToast(
        error.message || 'Failed to update restaurant status.',
        'error'
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDeleteRestaurant = async (restaurant) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete ${restaurant.name}? This action may permanently remove its data.`
    );

    if (!confirmed) return;

    try {
      setUpdatingId(restaurant.restaurantId);

      await api.deleteRestaurant(restaurant.restaurantId);

      showToast('Restaurant deleted successfully.');
      await loadData();
    } catch (error) {
      showToast(
        error.message || 'Failed to delete restaurant.',
        'error'
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const handleOpenRestaurant = (restaurant) => {
    setActiveRestaurantId(restaurant.restaurantId);
    navigate('/pos');
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const tabs = [
    { id: 'restaurants', label: 'Restaurants', icon: Building2 },
    { id: 'managers', label: 'Managers', icon: Users },
    { id: 'platform', label: 'Platform', icon: LayoutGrid },
    { id: 'sms', label: 'SMS & Notifications', icon: MessageSquare },
  ];

  return (
    <div className="pos-app admin-dashboard">
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          padding: '18px 24px',
          borderBottom: '1px solid var(--p-border)',
          background: 'var(--p-surface)',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>
            BistroPOS
          </h1>
          <p style={{ margin: '4px 0 0', color: 'var(--p-muted)', fontSize: 12 }}>
            Super Admin Dashboard
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>
            {currentUser?.name || 'Super Admin'}
          </span>

          <button
            type="button"
            className="pos-icon-button"
            title="Toggle theme"
            onClick={() => setDark((value) => !value)}
          >
            {dark ? <Sun size={17} /> : <Moon size={17} />}
          </button>

          <button
            type="button"
            className="pos-icon-button"
            title="Logout"
            onClick={handleLogout}
          >
            <LogOut size={17} />
          </button>
        </div>
      </header>

      <main style={{ padding: 24 }}>
        {notification && (
          <div
            role="status"
            style={{
              padding: '12px 16px',
              marginBottom: 18,
              borderRadius: 10,
              background:
                notification.type === 'error'
                  ? '#fee2e2'
                  : '#dcfce7',
              color:
                notification.type === 'error'
                  ? '#991b1b'
                  : '#166534',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            {notification.type === 'error' ? (
              <AlertCircle size={17} />
            ) : (
              <CheckCircle2 size={17} />
            )}
            {notification.message}
          </div>
        )}

        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 14,
            marginBottom: 24,
          }}
        >
          {[
            ['Total Restaurants', summary.totalRestaurants],
            ['Active Restaurants', summary.activeRestaurants],
            ['Total Tables', summary.totalTables],
            ['Total Managers', summary.totalManagers],
            ['Total Orders', summary.totalOrders],
          ].map(([label, value]) => (
            <div
              key={label}
              style={{
                padding: 18,
                border: '1px solid var(--p-border)',
                borderRadius: 12,
                background: 'var(--p-surface)',
              }}
            >
              <p style={{ margin: 0, fontSize: 12, color: 'var(--p-muted)' }}>
                {label}
              </p>
              <h2 style={{ margin: '8px 0 0', fontSize: 25 }}>
                {value ?? 0}
              </h2>
            </div>
          ))}
        </section>

        <nav
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            marginBottom: 22,
          }}
        >
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`pos-button ${activeTab === id ? 'primary' : ''}`}
              onClick={() => {
                setActiveTab(id);
                setSearch('');
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
              }}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </nav>

        {activeTab === 'restaurants' && (
          <section>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 12,
                marginBottom: 18,
              }}
            >
              <h2 style={{ margin: 0 }}>Restaurant Outlets</h2>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input
                  className="pos-input"
                  placeholder="Search restaurants..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  style={{ minWidth: 210 }}
                />

                <select
                  className="pos-select"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                >
                  <option value="ALL">All Status</option>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </select>

                <button
                  type="button"
                  className="pos-button"
                  onClick={loadData}
                  disabled={loading}
                >
                  <RefreshCw size={15} />
                </button>

                <button
                  type="button"
                  className="pos-button primary"
                  onClick={() => setShowAddRestaurant(true)}
                >
                  <Plus size={15} /> Add Restaurant
                </button>
              </div>
            </div>

            {loading ? (
              <p>Loading restaurants...</p>
            ) : filteredRestaurants.length === 0 ? (
              <p>No restaurants found.</p>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))',
                  gap: 16,
                }}
              >
                {filteredRestaurants.map((restaurant) => {
                  const assignedManagers = managers.filter(
                    (manager) =>
                      manager.restaurantId === restaurant.restaurantId
                  );

                  const updating =
                    updatingId === restaurant.restaurantId;

                  return (
                    <article
                      key={restaurant.restaurantId}
                      style={{
                        padding: 20,
                        border: '1px solid var(--p-border)',
                        borderRadius: 14,
                        background: 'var(--p-surface)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          gap: 10,
                        }}
                      >
                        <h3 style={{ margin: 0 }}>
                          {restaurant.name}
                        </h3>

                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color:
                              restaurant.status === 'ACTIVE'
                                ? '#059669'
                                : '#dc2626',
                          }}
                        >
                          {restaurant.status || 'UNKNOWN'}
                        </span>
                      </div>

                      <div
                        style={{
                          display: 'grid',
                          gap: 9,
                          margin: '16px 0',
                          color: 'var(--p-muted)',
                          fontSize: 13,
                        }}
                      >
                        <div style={{ display: 'flex', gap: 8 }}>
                          <MapPin size={15} />
                          {restaurant.address || 'Address not provided'}
                        </div>

                        <div style={{ display: 'flex', gap: 8 }}>
                          <Phone size={15} />
                          {restaurant.phone || 'Phone not provided'}
                        </div>

                        <div style={{ display: 'flex', gap: 8 }}>
                          <Mail size={15} />
                          {restaurant.email || 'Email not provided'}
                        </div>
                      </div>

                      <div
                        style={{
                          padding: 12,
                          borderRadius: 9,
                          background: 'var(--p-bg)',
                          marginBottom: 14,
                          fontSize: 12,
                        }}
                      >
                        <strong>Assigned Managers</strong>

                        {assignedManagers.length ? (
                          assignedManagers.map((manager) => (
                            <div key={manager.userId} style={{ marginTop: 7 }}>
                              {manager.name} — {manager.email}
                            </div>
                          ))
                        ) : (
                          <p style={{ margin: '7px 0 0' }}>
                            No manager assigned.
                          </p>
                        )}

                        <button
                          type="button"
                          className="pos-button small"
                          style={{ marginTop: 10 }}
                          onClick={() => {
                            setSelectedRestaurantForManager(restaurant);
                            setShowAddManager(true);
                          }}
                        >
                          <Plus size={13} /> Assign Manager
                        </button>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 7,
                        }}
                      >
                        <button
                          type="button"
                          className="pos-button primary small"
                          onClick={() => handleOpenRestaurant(restaurant)}
                        >
                          <Store size={13} /> Open Workspace
                        </button>

                        <button
                          type="button"
                          className="pos-button small"
                          onClick={() => setEditingRestaurant(restaurant)}
                        >
                          <Pencil size={13} /> Edit
                        </button>

                        <button
                          type="button"
                          className="pos-button small"
                          disabled={updating}
                          onClick={() => handleToggleStatus(restaurant)}
                        >
                          {restaurant.status === 'ACTIVE' ? 'Suspend' : 'Activate'}
                        </button>

                        <button
                          type="button"
                          className="pos-button small"
                          disabled={updating}
                          onClick={() => handleDeleteRestaurant(restaurant)}
                          style={{ color: '#e11d48' }}
                        >
                          <Trash2 size={13} /> Delete
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {activeTab === 'managers' && (
          <section>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 12,
                marginBottom: 18,
              }}
            >
              <h2 style={{ margin: 0 }}>General Managers</h2>

              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="pos-input"
                  placeholder="Search managers..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />

                <button
                  type="button"
                  className="pos-button primary"
                  onClick={() => {
                    setSelectedRestaurantForManager(null);
                    setShowAddManager(true);
                  }}
                >
                  <Plus size={15} /> Add Manager
                </button>
              </div>
            </div>

            <div
              style={{
                overflowX: 'auto',
                border: '1px solid var(--p-border)',
                borderRadius: 12,
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Name', 'Email', 'Phone', 'Restaurant', 'Actions'].map(
                      (heading) => (
                        <th
                          key={heading}
                          style={{
                            textAlign: 'left',
                            padding: 14,
                            borderBottom: '1px solid var(--p-border)',
                          }}
                        >
                          {heading}
                        </th>
                      )
                    )}
                  </tr>
                </thead>

                <tbody>
                  {filteredManagers.map((manager) => (
                    <tr key={manager.userId}>
                      <td style={{ padding: 14 }}>{manager.name}</td>
                      <td style={{ padding: 14 }}>{manager.email}</td>
                      <td style={{ padding: 14 }}>{manager.phone || '—'}</td>
                      <td style={{ padding: 14 }}>
                        {manager.restaurantName || '—'}
                      </td>
                      <td style={{ padding: 14 }}>
                        <button
                          type="button"
                          className="pos-button small"
                          onClick={() => setEditingManager(manager)}
                        >
                          <Pencil size={13} /> Edit
                        </button>
                      </td>
                    </tr>
                  ))}

                  {filteredManagers.length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ padding: 20, textAlign: 'center' }}>
                        No managers found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeTab === 'platform' && (
          <section style={{ maxWidth: 850 }}>
            <h2>Platform Delivery Workflow</h2>

            <div
              style={{
                padding: 22,
                border: '1px solid var(--p-border)',
                borderRadius: 14,
                background: 'var(--p-surface)',
              }}
            >
              <ol style={{ lineHeight: 2 }}>
                <li>
                  <strong>Create Restaurant:</strong> Register the restaurant
                  and provision its tenant.
                </li>
                <li>
                  <strong>Assign Manager:</strong> Create the manager account
                  and provide login credentials.
                </li>
                <li>
                  <strong>Configure Restaurant:</strong> The manager configures
                  tables, menu items, and restaurant settings.
                </li>
                <li>
                  <strong>Go Live:</strong> Staff use their respective portals
                  to manage orders and restaurant operations.
                </li>
              </ol>
            </div>
          </section>
        )}

        {activeTab === 'sms' && (
          <section>
            <SmsNotificationsPanel />
          </section>
        )}
      </main>

      {showAddRestaurant && (
        <AddRestaurantModal
          onClose={() => setShowAddRestaurant(false)}
          onCreated={async (restaurant) => {
            setShowAddRestaurant(false);
            showToast(
              `${restaurant.name} created successfully.`
            );
            await loadData();
          }}
        />
      )}

      {showAddManager && (
        <AddManagerModal
          restaurants={restaurants}
          preSelectedRestaurant={selectedRestaurantForManager}
          onClose={() => {
            setShowAddManager(false);
            setSelectedRestaurantForManager(null);
          }}
          onCreated={async (manager) => {
            setShowAddManager(false);
            setSelectedRestaurantForManager(null);
            showToast(
              `Manager ${manager.name} created successfully.`
            );
            await loadData();
          }}
        />
      )}

      {editingRestaurant && (
        <EditRestaurantModal
          restaurant={editingRestaurant}
          onClose={() => setEditingRestaurant(null)}
          onUpdated={async () => {
            setEditingRestaurant(null);
            showToast('Restaurant updated successfully.');
            await loadData();
          }}
        />
      )}

      {editingManager && (
        <EditManagerModal
          manager={editingManager}
          onClose={() => setEditingManager(null)}
          onUpdated={async () => {
            setEditingManager(null);
            showToast('Manager updated successfully.');
            await loadData();
          }}
        />
      )}
    </div>
  );
}
