import React, { useEffect, useState } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { Cloud, LayoutDashboard, ClipboardList, Armchair, CalendarDays, History, Package, ChefHat, HandPlatter, Sun, Moon, Bell, ChevronDown, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import '../../styles/pos.css';

const frontLinks = [
  ['/pos', 'Dashboard', LayoutDashboard, true], ['/pos/orders', 'Order', ClipboardList],
  ['/pos/tables', 'Table', Armchair], ['/pos/reservations', 'Reservation', CalendarDays],
  ['/pos/history', 'History', History], ['/pos/inventory', 'Inventory', Package],
];
export default function PosShell({ children, alertCount = 0, onAlerts }) {
  const { currentUser, role, logout } = useAuth();
  const navigate = useNavigate();
  const [dark, setDark] = useState(() => localStorage.getItem('bistro_pos_theme') === 'dark');
  const [now, setNow] = useState(new Date());
  const [profile, setProfile] = useState(false);
  const frontdesk = ['SUPER_ADMIN', 'RECEPTIONIST'].includes(role);
  const links = frontdesk ? frontLinks : role === 'KITCHEN' ? [['/kitchen', 'Kitchen', ChefHat, true]] : [['/waiter', 'Floor service', HandPlatter, true]];
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  useEffect(() => { localStorage.setItem('bistro_pos_theme', dark ? 'dark' : 'light'); }, [dark]);
  return <div className={`pos-app ${dark ? 'pos-dark' : ''}`}>
    <header className="pos-topbar">
      <Link to={frontdesk ? '/pos' : role === 'KITCHEN' ? '/kitchen' : '/waiter'} className="pos-logo" aria-label="Bistro & Bloom POS"><Cloud size={27} strokeWidth={1.8}/><span>Bistro<span className="pos-logo-muted">POS</span></span></Link>
      <nav className="pos-nav" aria-label="POS navigation">{links.map(([path, title, Icon, end]) => <NavLink key={path} to={path} end={end} className={({isActive}) => isActive ? 'active' : ''}><Icon size={16}/><span>{title}</span></NavLink>)}</nav>
      <div className="pos-top-actions">
        <button className="pos-icon-button" aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => setDark(!dark)}>{dark ? <Sun size={18}/> : <Moon size={18}/>}</button>
        {onAlerts && <button className="pos-icon-button pos-alert-button" onClick={onAlerts} aria-label={`Notifications, ${alertCount} open alerts`}><Bell size={19}/>{alertCount > 0 && <i/>}</button>}
        <div className="pos-profile-wrap"><button className="pos-profile" onClick={() => setProfile(!profile)} aria-expanded={profile}><span className="pos-avatar">{currentUser?.name?.split(' ').map(s=>s[0]).slice(0,2).join('')}</span><span><b>{currentUser?.name?.split(' ')[0] || 'Staff'}</b><small>{role === 'SUPER_ADMIN' ? 'Administrator' : role === 'RECEPTIONIST' ? 'Front desk' : role === 'KITCHEN' ? 'Kitchen' : 'Waiter'}</small></span><ChevronDown size={14}/></button>
        {profile && <div className="pos-profile-menu"><div><b>{currentUser?.name}</b><small>{currentUser?.email}</small></div>{role === 'SUPER_ADMIN' && <><Link to="/kitchen"><ChefHat size={15}/> Kitchen display</Link><Link to="/waiter"><HandPlatter size={15}/> Waiter panel</Link></>}<button onClick={() => { logout(); navigate('/pos/login'); }}><LogOut size={15}/> Sign out</button></div>}</div>
      </div>
    </header>
    <main className="pos-main">{typeof children === 'function' ? children({now, dark}) : children}</main>
    <footer className="pos-statusbar">
      <div className="pos-statusbar-left" aria-hidden="true" />
      <div className="pos-statusbar-center">
        <span><span className="pos-live-dot" /> Bistro &amp; Bloom · POS Staff Portal</span>
      </div>
      <div className="pos-statusbar-right">
        <span>{now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} <span className="pos-status-time">{now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })}</span></span>
      </div>
    </footer>
  </div>;
}
