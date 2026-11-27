import React, { useEffect, useRef, useState } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { Cloud, LayoutDashboard, ClipboardList, Armchair, CalendarDays, History, Package, ChefHat, HandPlatter, Sun, Moon, Bell, ChevronDown, LogOut, Building2, Check, Store, Users, UserPlus, Plus, Shield } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api, getActiveRestaurantId, setActiveRestaurantId } from '../../services/api';
import '../../styles/pos.css';

const frontLinks = [
  ['/pos', 'Dashboard', LayoutDashboard, true],
  ['/pos/orders', 'Order', ClipboardList],
  ['/pos/tables', 'Table', Armchair],
  ['/pos/reservations', 'Reservation', CalendarDays],
  ['/pos/history', 'History', History],
  ['/pos/inventory', 'Menu', Package],
];

export default function PosShell({ children, alertCount = 0, onAlerts, menuDots = {} }) {
  const { currentUser, role, logout } = useAuth();
  const navigate = useNavigate();
  const [dark, setDark] = useState(() => localStorage.getItem('bistro_pos_theme') === 'dark');
  const [now, setNow] = useState(new Date());
  const [profile, setProfile] = useState(false);
  const [outletOpen, setOutletOpen] = useState(false);
  const [restaurants, setRestaurants] = useState([]);
  const [currentRestaurant, setCurrentRestaurant] = useState(null);
  const outletRef = useRef(null);

  // Managers, Receptionists, and SuperAdmins have full access to the frontdesk POS workspace
  const frontdesk = ['SUPER_ADMIN', 'MANAGER', 'RECEPTIONIST'].includes(role);
  const staffLink = ['SUPER_ADMIN', 'MANAGER'].includes(role)
    ? [['/pos/staff', 'Staff', Users]]
    : [];
  const links = frontdesk
    ? [...frontLinks, ...staffLink]
    : role === 'KITCHEN'
    ? [['/kitchen', 'Kitchen', ChefHat, true]]
    : [['/waiter', 'Floor service', HandPlatter, true]];

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    localStorage.setItem('bistro_pos_theme', dark ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.classList.toggle('pos-dark', dark);
  }, [dark]);

  // Load current restaurant details and full outlet list for Super Admin
  useEffect(() => {
    let active = true;
    const loadOutletData = async () => {
      try {
        const restaurant = await api.getRestaurant();
        if (active) setCurrentRestaurant(restaurant);

        if (role === 'SUPER_ADMIN') {
          const list = await api.getRestaurants();
          if (active && Array.isArray(list) && list.length > 0) {
            setRestaurants(list);
          }
        }
      } catch (err) {
        console.error('Failed to load restaurant/outlet data:', err);
      }
    };

    loadOutletData();

    const handleOutletChanged = async () => {
      try {
        const restaurant = await api.getRestaurant();
        if (active) setCurrentRestaurant(restaurant);
      } catch {}
    };

    window.addEventListener('rs_outlet_changed', handleOutletChanged);
    return () => {
      active = false;
      window.removeEventListener('rs_outlet_changed', handleOutletChanged);
    };
  }, [role]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (outletRef.current && !outletRef.current.contains(e.target)) {
        setOutletOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSwitchOutlet = (outlet) => {
    if (!outlet || outlet.restaurantId === currentRestaurant?.restaurantId) {
      setOutletOpen(false);
      return;
    }
    setActiveRestaurantId(outlet.restaurantId);
    setCurrentRestaurant(outlet);
    setOutletOpen(false);
  };

  const roleTitle = role === 'SUPER_ADMIN'
    ? 'Platform Owner'
    : role === 'MANAGER'
    ? 'Restaurant Manager'
    : role === 'RECEPTIONIST'
    ? 'Front desk'
    : role === 'KITCHEN'
    ? 'Kitchen'
    : 'Waiter';

  return (
    <div className={`pos-app ${dark ? 'pos-dark' : ''}`}>
      <header className="pos-topbar">
        <Link
          to={frontdesk ? '/pos' : role === 'KITCHEN' ? '/kitchen' : '/waiter'}
          className="pos-logo"
          aria-label="BistroPOS"
        >
          <Cloud size={27} strokeWidth={1.8} />
          <span>Bistro<span className="pos-logo-muted">POS</span></span>
        </Link>

        {/* Multi-Tenant Admin Outlet Switcher (SUPER_ADMIN) / Locked Tenant Badge (MANAGER/STAFF) */}
        {role === 'SUPER_ADMIN' ? (
          <div className="flex items-center gap-2" style={{ zIndex: 30 }}>
            <div className="relative inline-block" ref={outletRef}>
              <button
                type="button"
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-900 text-xs font-semibold shadow-sm transition-all cursor-pointer"
                onClick={() => setOutletOpen(prev => !prev)}
                aria-expanded={outletOpen}
                title="Switch Restaurant Outlet"
              >
                <Building2 size={15} className="text-blue-600" />
                <span className="font-bold truncate max-w-[140px] text-slate-900">
                  {currentRestaurant?.name || 'Select Outlet'}
                </span>
                <span className="text-[9px] bg-blue-600 text-white font-extrabold px-1.5 py-0.5 rounded tracking-wide uppercase">
                  Outlet
                </span>
                <ChevronDown size={13} className="text-blue-600" />
              </button>

              {outletOpen && (
                <div
                  className="absolute left-0 mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-slate-200 p-2 z-50 animate-fade-in text-slate-800"
                  style={{ top: '100%', minWidth: '260px' }}
                >
                  <div className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 mb-1 flex items-center justify-between">
                    <span>Switch Tenant Outlet</span>
                    <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[9px]">{restaurants.length} Outlets</span>
                  </div>
                  <div className="space-y-1 max-h-64 overflow-y-auto">
                    {restaurants.map(r => {
                      const isActive = (currentRestaurant?.restaurantId || getActiveRestaurantId()) === r.restaurantId;
                      return (
                        <button
                          key={r.restaurantId}
                          type="button"
                          onClick={() => handleSwitchOutlet(r)}
                          className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between transition-colors cursor-pointer ${
                            isActive
                              ? 'bg-blue-600 text-white font-bold shadow-sm'
                              : 'hover:bg-slate-100 text-slate-700'
                          }`}
                        >
                          <div className="truncate pr-2">
                            <div className="font-medium text-xs truncate">{r.name}</div>
                            <div className={`text-[10px] truncate ${isActive ? 'text-blue-100' : 'text-slate-400'}`}>
                              {r.address ? r.address.split(',')[0] : r.slug}
                            </div>
                          </div>
                          {isActive && <Check size={14} className="shrink-0 text-white" />}
                        </button>
                      );
                    })}
                  </div>
                  <div className="pt-2 mt-2 border-t border-slate-100">
                    <Link
                      to="/admin"
                      onClick={() => setOutletOpen(false)}
                      className="w-full py-2 px-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Shield size={14} />
                      <span>Manage Tenants in SaaS Admin</span>
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* Super Admin: SaaS Admin Control Plane Link */}
            <Link
              to="/admin"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-xs font-bold shadow-sm transition-all"
              title="Return to Super Admin SaaS Control Plane"
            >
              <Shield size={14} />
              <span>SaaS Admin</span>
            </Link>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100/90 border border-slate-200 text-slate-700 text-xs font-semibold shadow-xs">
            <Store size={14} className="text-slate-500" />
            <span className="truncate max-w-[150px] font-bold text-slate-800">
              {currentRestaurant?.name || 'Bistro & Bloom'}
            </span>
          </div>
        )}

        <nav className="pos-nav" aria-label="POS navigation">
          {links.map(([path, title, Icon, end]) => {
            const hasDot = Boolean(menuDots[path]);
            return (
              <NavLink key={path} to={path} end={end} className={({ isActive }) => (isActive ? 'active' : '')}>
                <Icon size={16} />
                <span>{title}</span>
                {hasDot && <i className="pos-nav-dot" title="New activity" />}
              </NavLink>
            );
          })}
        </nav>

        <div className="pos-top-actions">
          <button
            type="button"
            className="pos-icon-button"
            aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
            onClick={() => setDark(d => !d)}
          >
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {onAlerts && (
            <button
              className="pos-icon-button pos-alert-button"
              onClick={onAlerts}
              aria-label={`Notifications, ${alertCount} open alerts`}
            >
              <Bell size={19} />
              {alertCount > 0 && <i />}
            </button>
          )}

          <div className="pos-profile-wrap">
            <button
              className="pos-profile"
              onClick={() => setProfile(!profile)}
              aria-expanded={profile}
            >
              <span className="pos-avatar">
                {currentUser?.name?.split(' ').map(s => s[0]).slice(0, 2).join('') || 'ST'}
              </span>
              <span>
                <b>{currentUser?.name?.split(' ')[0] || 'Staff'}</b>
                <small>{roleTitle}</small>
              </span>
              <ChevronDown size={14} />
            </button>

            {profile && (
              <div className="pos-profile-menu">
                <div>
                  <b>{currentUser?.name}</b>
                  <small>{currentUser?.email}</small>
                </div>
                {['SUPER_ADMIN', 'MANAGER'].includes(role) && (
                  <>
                    <Link to="/kitchen"><ChefHat size={15} /> Kitchen display</Link>
                    <Link to="/waiter"><HandPlatter size={15} /> Waiter panel</Link>
                  </>
                )}
                <button
                  onClick={() => {
                    logout();
                    navigate('/pos/login');
                  }}
                >
                  <LogOut size={15} /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="pos-main">
        {typeof children === 'function' ? children({ now, dark }) : children}
      </main>

      <footer className="pos-statusbar">
        <div className="pos-statusbar-left" aria-hidden="true" />
        <div className="pos-statusbar-center">
          <span>
            <span className="pos-live-dot" /> {currentRestaurant?.name || 'BistroPOS'} · POS Workspace
          </span>
        </div>
        <div className="pos-statusbar-right">
          <span>
            {now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}{' '}
            <span className="pos-status-time">
              {now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })}
            </span>
          </span>
        </div>
      </footer>
    </div>
  );
}
