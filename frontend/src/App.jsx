import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, Link } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { NotificationProvider } from './context/NotificationContext';

// Common Components
import Navbar from './components/common/Navbar';
import ToastContainer from './components/common/ToastContainer';
import CartDrawer from './components/common/CartDrawer';

// Pages
import HomePage from './pages/public/HomePage';
import PublicMenuPage from './pages/public/PublicMenuPage';
import DeliveryPage from './pages/public/DeliveryPage';
import TakeawayPage from './pages/public/TakeawayPage';
import BookTablePage from './pages/public/BookTablePage';
import TrackOrderPage from './pages/public/TrackOrderPage';
import CustomerProfilePage from './pages/public/CustomerProfilePage';
import QrDineInPage from './pages/dineIn/QrDineInPage';
import KitchenDashboard from './pages/kitchen/KitchenDashboard';
import WaiterDashboard from './pages/waiter/WaiterDashboard';
import ReceptionistDashboard from './pages/receptionist/ReceptionistDashboard';
import LoginPage from './pages/auth/LoginPage';
import CustomerLoginPage from './pages/auth/CustomerLoginPage';
import PosWorkspace from './pages/pos/PosWorkspace';
import SuperAdminDashboard from './pages/admin/SuperAdminDashboard';
import PosShell from './components/pos/PosShell';
import { Spinner } from './components/pos/PosUI';
import './styles/website.css';

// Protected Route Component (Section 76)
function RoleRoute({ allowedRoles, children }) {
  const { isAuthenticated, isLoading, role, currentUser, logout } = useAuth();
  const location = useLocation();

  if (isLoading) return <Spinner />;

  if (!isAuthenticated || !currentUser) {
    return <Navigate to={`/pos/login?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  }

  if (role === 'SUPER_ADMIN') return children;

  if (currentUser?.status === 'INACTIVE' || currentUser?.status === 'DISABLED') {
    return (
      <div className="min-h-[75vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 shadow-xl border border-red-100 flex flex-col items-center animate-fade-in">
          <div className="w-16 h-16 rounded-2xl bg-red-50 border border-red-200 text-red-600 flex items-center justify-center font-bold text-3xl mb-4 shadow-sm">
            🚫
          </div>
          <h2 className="text-2xl font-black text-slate-900 mb-2">Access Suspended</h2>
          <p className="text-sm text-slate-600 mb-6 leading-relaxed">
            Your restaurant account has been deactivated or suspended by platform administration. Staff access to POS, kitchen, waiter, and receptionist workspaces is currently disabled.
          </p>
          <button
            onClick={logout}
            className="w-full inline-flex items-center justify-center py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs transition-colors shadow-sm"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  if (!allowedRoles.includes(role)) {
    const getRoleDestination = (userRole) => {
      switch (userRole) {
        case 'SUPER_ADMIN': return { name: 'SaaS Admin Console', path: '/admin', badge: '👑 SUPER ADMIN' };
        case 'MANAGER': return { name: 'Manager Portal / POS', path: '/pos', badge: '👔 MANAGER' };
        case 'WAITER': return { name: 'Waiter Dashboard', path: '/waiter', badge: '🤵 WAITER' };
        case 'KITCHEN': return { name: 'Kitchen KDS Display', path: '/kitchen', badge: '👨‍🍳 KITCHEN' };
        case 'RECEPTIONIST': return { name: 'Receptionist Panel', path: '/receptionist', badge: '👩‍💼 RECEPTIONIST' };
        case 'CUSTOMER': return { name: 'Food Menu', path: '/menu', badge: '👤 CUSTOMER' };
        default: return { name: 'Home', path: '/', badge: 'GUEST' };
      }
    };
    const userPortal = getRoleDestination(role);

    return (
      <div className="min-h-[75vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 shadow-xl border border-slate-100 flex flex-col items-center animate-fade-in">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center font-bold text-3xl mb-4 shadow-sm">
            🛡️
          </div>
          <h2 className="text-2xl font-black text-slate-900 mb-2">Access Restricted</h2>
          <p className="text-sm text-slate-600 mb-6 leading-relaxed">
            You are signed in as <strong>{currentUser.name}</strong> with role{' '}
            <span className="inline-block px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 font-extrabold text-xs uppercase tracking-wide">
              {role}
            </span>
            .<br />
            This page (<code className="text-xs bg-slate-100 px-1.5 py-0.5 rounded text-slate-800 font-mono">{location.pathname}</code>) is restricted to{' '}
            <strong>{allowedRoles.join(' / ')}</strong> staff.
          </p>

          <div className="w-full space-y-3">
            <Link
              to={userPortal.path}
              className="w-full inline-flex items-center justify-center gap-2 py-3 px-5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-black text-sm shadow-lg shadow-brand-500/25 transition-all transform active:scale-[0.99]"
            >
              <span>Go to Your {userPortal.name}</span>
              <span>&rarr;</span>
            </Link>

            <Link
              to="/pos/login"
              onClick={logout}
              className="w-full inline-flex items-center justify-center py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors border border-slate-200"
            >
              Sign Out & Switch Staff Account
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return children;
}

// Smart Portal Redirector for /portal and /dashboard
function SmartPortalRedirect() {
  const { isAuthenticated, isLoading, role } = useAuth();
  if (isLoading) return <Spinner />;
  if (!isAuthenticated) {
    return <Navigate to="/pos/login" replace />;
  }
  switch (role) {
    case 'SUPER_ADMIN':
      return <Navigate to="/admin" replace />;
    case 'WAITER':
      return <Navigate to="/waiter" replace />;
    case 'KITCHEN':
      return <Navigate to="/kitchen" replace />;
    case 'RECEPTIONIST':
    case 'MANAGER':
      return <Navigate to="/pos" replace />;
    case 'CUSTOMER':
      return <Navigate to="/menu" replace />;
    default:
      return <Navigate to="/" replace />;
  }
}

function MainApp() {
  const [isCartOpen, setIsCartOpen] = useState(false);
  const location = useLocation();
  const isStaffLogin = location.pathname === '/pos/login' || location.pathname === '/staff/login';
  const isWorkspace = /^\/(pos|kitchen|waiter|receptionist|admin)(\/|$)/.test(location.pathname);
  const isQrMenu = location.pathname.startsWith('/qr/');
  const isPublicWebsite = !isStaffLogin && !isWorkspace && !isQrMenu;

  return (
    <div className={`min-h-screen flex flex-col font-sans ${isPublicWebsite ? 'bg-slate-50 website-shell' : 'bg-[#f4f7fb] pos-portal-shell'}`}>
      {/* 1. Global Website Navbar (Public Website Only) */}
      {isPublicWebsite && <Navbar onOpenCart={() => setIsCartOpen(true)} />}

      {/* 2. Global Toast Notifications */}
      <ToastContainer />

      {/* 3. Global Cart Drawer (Public Website Only) */}
      {isPublicWebsite && <CartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />}

      {/* 4. Main Route View */}
      <div className="flex-1">
        <Routes>
          {/* Customer & Staff Authentication Routes */}
          <Route path="/login" element={<CustomerLoginPage />} />
          <Route path="/pos/login" element={<LoginPage />} />
          <Route path="/staff/login" element={<Navigate to="/pos/login" replace />} />

          {/* Public Website Routes (Part 5) */}
          <Route path="/" element={<HomePage onOpenCart={() => setIsCartOpen(true)} />} />
          <Route path="/menu" element={<PublicMenuPage onOpenCart={() => setIsCartOpen(true)} />} />
          <Route path="/delivery" element={<DeliveryPage />} />
          <Route path="/takeaway" element={<TakeawayPage />} />
          <Route path="/book-table" element={<BookTablePage />} />
          <Route path="/track-order" element={<TrackOrderPage />} />
          <Route path="/profile" element={<CustomerProfilePage />} />

          {/* Module 1: Customer Table QR Dine-In Ordering (Part 1) */}
          <Route path="/qr/:restaurantId/:tableId" element={<QrDineInPage />} />
          <Route
            path="/dine-in"
            element={
              <Navigate
                to="/qr/a0000000-0000-0000-0000-000000000001/c0000000-0000-0000-0000-000000000001"
                replace
              />
            }
          />

          {/* Module 2: Kitchen Display System (Part 2) */}
          <Route
            path="/kitchen"
            element={
              <RoleRoute allowedRoles={['KITCHEN', 'MANAGER', 'SUPER_ADMIN']}>
                <PosShell><div className="pos-staff-content"><KitchenDashboard /></div></PosShell>
              </RoleRoute>
            }
          />

          {/* Module 3: Waiter Panel (Part 3) */}
          <Route
            path="/waiter"
            element={
              <RoleRoute allowedRoles={['WAITER', 'MANAGER', 'SUPER_ADMIN']}>
                <PosShell><div className="pos-staff-content"><WaiterDashboard /></div></PosShell>
              </RoleRoute>
            }
          />

          {/* Module 4: Receptionist Panel (Part 4) */}
          <Route
            path="/receptionist"
            element={
              <RoleRoute allowedRoles={['RECEPTIONIST', 'MANAGER', 'SUPER_ADMIN']}>
                <Navigate to="/pos" replace />
              </RoleRoute>
            }
          />

          <Route path="/pos/*" element={<RoleRoute allowedRoles={['RECEPTIONIST', 'MANAGER', 'SUPER_ADMIN']}><PosWorkspace /></RoleRoute>} />

          {/* Super Admin SaaS Platform Control Plane */}
          <Route
            path="/admin/*"
            element={
              <RoleRoute allowedRoles={['SUPER_ADMIN']}>
                <SuperAdminDashboard />
              </RoleRoute>
            }
          />
          <Route path="/admin-panel" element={<Navigate to="/admin" replace />} />
          <Route path="/admin-dashboard" element={<Navigate to="/admin" replace />} />
          <Route path="/adminpanel" element={<Navigate to="/admin" replace />} />

          {/* Smart Portal & Dashboard Route Redirectors */}
          <Route path="/portal" element={<SmartPortalRedirect />} />
          <Route path="/dashboard" element={<SmartPortalRedirect />} />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}

// Scroll to top on every route change (unless navigating to a hash anchor)
function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (!hash) {
      window.scrollTo(0, 0);
    }
  }, [pathname, hash]);

  return null;
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <CartProvider>
          <NotificationProvider>
            <ScrollToTop />
            <MainApp />
          </NotificationProvider>
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
