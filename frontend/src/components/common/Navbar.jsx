import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ShoppingBag, User, ArrowUpRight, Menu, X, Truck, PackageCheck, Compass, LogOut } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';

export default function Navbar({ onOpenCart }) {
  const { itemCount } = useCart();
  const { currentUser, role, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const userMenuRef = useRef(null);
  const accountButtonRef = useRef(null);
  const mobileButtonRef = useRef(null);
  const isHome = location.pathname === '/';

  useEffect(() => {
    setMobileMenuOpen(false);
    setUserDropdownOpen(false);
  }, [location.pathname, location.hash]);

  useEffect(() => {
    const closeOutside = event => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) setUserDropdownOpen(false);
    };
    document.addEventListener('mousedown', closeOutside);
    return () => document.removeEventListener('mousedown', closeOutside);
  }, []);

  useEffect(() => {
    const closeOnEscape = event => {
      if (event.key !== 'Escape') return;
      if (userDropdownOpen) accountButtonRef.current?.focus();
      else if (mobileMenuOpen) mobileButtonRef.current?.focus();
      setUserDropdownOpen(false);
      setMobileMenuOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [mobileMenuOpen, userDropdownOpen]);

  if (location.pathname.startsWith('/qr/')) return null;

  const closeNavigation = () => setMobileMenuOpen(false);
  const signOut = () => {
    logout();
    setUserDropdownOpen(false);
    setMobileMenuOpen(false);
    navigate('/login');
  };

  const handleSectionScroll = (e, sectionId) => {
    e.preventDefault();
    closeNavigation();
    if (isHome) {
      const el = document.getElementById(sectionId);
      if (el) {
        el.scrollIntoView({ behavior: 'auto' });
      }
      navigate(`/#${sectionId}`, { replace: true });
    } else {
      navigate(`/#${sectionId}`);
    }
  };

  const handleHomeClick = (e) => {
    closeNavigation();
    if (isHome) {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'auto' });
      if (location.hash) {
        navigate('/');
      }
    }
  };

  const handleMenuClick = () => {
    closeNavigation();
    if (location.pathname === '/menu') {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  };

  const navClass = active => `website-nav-link${active ? ' website-nav-link--active' : ''}`;
  const homeActive = isHome && !location.hash;
  const menuActive = location.pathname.startsWith('/menu') || location.pathname === '/delivery' || location.pathname === '/takeaway';
  const storyActive = isHome && location.hash === '#our-story';
  const visitActive = isHome && location.hash === '#visit';

  const navigation = (
    <>
      <Link
        to="/"
        className={navClass(homeActive)}
        aria-current={homeActive ? 'page' : undefined}
        onClick={handleHomeClick}
      >
        Home
      </Link>
      <Link
        to="/menu"
        className={navClass(menuActive)}
        aria-current={menuActive ? 'page' : undefined}
        onClick={handleMenuClick}
      >
        Our menu
      </Link>
      <a
        href="/#our-story"
        className={navClass(storyActive)}
        aria-current={storyActive ? 'location' : undefined}
        onClick={(e) => handleSectionScroll(e, 'our-story')}
      >
        Our story
      </a>
      <a
        href="/#visit"
        className={navClass(visitActive)}
        aria-current={visitActive ? 'location' : undefined}
        onClick={(e) => handleSectionScroll(e, 'visit')}
      >
        Visit
      </a>
    </>
  );

  return (
    <header className="website-header">
      <div className="website-header-inner">
        <Link
          to="/"
          className="website-brand"
          aria-label="Bistro and Bloom home"
          onClick={handleHomeClick}
        >
          <svg className="website-brand-mark" width="40" height="40" viewBox="0 0 44 44" fill="none" aria-hidden="true">
            <circle cx="22" cy="14" r="5.5" stroke="#AF905C" strokeWidth="1.6" />
            <circle cx="22" cy="30" r="5.5" stroke="#AF905C" strokeWidth="1.6" />
            <circle cx="14" cy="22" r="5.5" stroke="#AF905C" strokeWidth="1.6" />
            <circle cx="30" cy="22" r="5.5" stroke="#AF905C" strokeWidth="1.6" />
            <circle cx="22" cy="22" r="2.2" fill="#AF905C" />
          </svg>
          <span className="website-brand-name">Bistro &amp; Bloom</span>
        </Link>

        <nav aria-label="Main navigation" className="website-nav">{navigation}</nav>

        <div className="website-header-actions">
          <button type="button" onClick={onOpenCart} className="website-icon-button" aria-label={`View cart${itemCount ? `, ${itemCount} ${itemCount === 1 ? 'item' : 'items'}` : ''}`}>
            <ShoppingBag size={19} aria-hidden="true" />
            {itemCount > 0 && <span className="website-cart-count">{itemCount}</span>}
          </button>

          <div className="website-account" ref={userMenuRef}>
            {currentUser ? (
              <button
                ref={accountButtonRef}
                type="button"
                onClick={() => { setUserDropdownOpen(open => !open); setMobileMenuOpen(false); }}
                className="website-icon-button"
                aria-label="User account"
                aria-expanded={userDropdownOpen}
                aria-controls="website-account-dropdown"
                title={currentUser.name}
              >
                <User size={19} aria-hidden="true" />
              </button>
            ) : (
              <Link to="/login" className="website-icon-button" aria-label="Sign in" title="Sign in"><User size={19} aria-hidden="true" /></Link>
            )}
            {userDropdownOpen && currentUser && (
              <div className="website-account-dropdown" id="website-account-dropdown">
                <div className="website-account-details">
                  <p className="website-account-name">{currentUser.name}</p>
                  <p className="website-account-email">{currentUser.email}</p>
                  <span className="website-account-role">{role.replaceAll('_', ' ')}</span>
                </div>
                <Link
                  to="/profile"
                  className="website-account-link"
                  onClick={() => setUserDropdownOpen(false)}
                >
                  <User size={15} aria-hidden="true" />
                  <span>My Profile &amp; Orders</span>
                  <ArrowUpRight size={13} className="ml-auto opacity-60" aria-hidden="true" />
                </Link>
                <Link
                  to="/track-order"
                  className="website-account-link"
                  onClick={() => setUserDropdownOpen(false)}
                >
                  <Compass size={15} aria-hidden="true" />
                  <span>Track Live Order</span>
                </Link>
                {['SUPER_ADMIN', 'MANAGER', 'RECEPTIONIST'].includes(role) && (
                  <Link
                    to="/pos"
                    className="website-account-link"
                    onClick={() => setUserDropdownOpen(false)}
                  >
                    <PackageCheck size={15} aria-hidden="true" />
                    <span>{role === 'MANAGER' ? 'Manager POS Portal' : role === 'SUPER_ADMIN' ? 'Platform POS Workspace' : 'Front Desk POS'}</span>
                    <ArrowUpRight size={13} className="ml-auto opacity-60" aria-hidden="true" />
                  </Link>
                )}
                <button type="button" onClick={signOut} className="website-signout"><LogOut size={15} aria-hidden="true" />Sign out</button>
              </div>
            )}
          </div>

          <button
            ref={mobileButtonRef}
            type="button"
            onClick={() => { setMobileMenuOpen(open => !open); setUserDropdownOpen(false); }}
            className="website-icon-button website-mobile-toggle"
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileMenuOpen}
            aria-controls="website-mobile-navigation"
          >
            {mobileMenuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <nav className="website-mobile-nav" id="website-mobile-navigation" aria-label="Mobile navigation">
          <div className="website-mobile-links">{navigation}</div>
          <div className="website-mobile-services">
            <Link to="/delivery" onClick={closeNavigation}><Truck size={16} aria-hidden="true" />Delivery</Link>
            <Link to="/takeaway" onClick={closeNavigation}><PackageCheck size={16} aria-hidden="true" />Takeaway pickup</Link>
            <Link to="/track-order" onClick={closeNavigation}><Compass size={16} aria-hidden="true" />Track your order</Link>
          </div>
          <div className="website-mobile-account">
            {currentUser ? (
              <>
                <p className="website-account-name">{currentUser.name}</p>
                <span className="website-account-role">{role.replaceAll('_', ' ')}</span>
                <Link to="/profile" className="website-account-link" onClick={closeNavigation}>
                  <User size={15} aria-hidden="true" />My Profile &amp; Orders<ArrowUpRight size={14} className="ml-auto" aria-hidden="true" />
                </Link>
                {['SUPER_ADMIN', 'MANAGER', 'RECEPTIONIST'].includes(role) && (
                  <Link
                    to="/pos"
                    className="website-account-link"
                    onClick={() => setUserDropdownOpen(false)}
                  >
                    <PackageCheck size={15} aria-hidden="true" />
                    <span>{role === 'MANAGER' ? 'Manager POS Portal' : role === 'SUPER_ADMIN' ? 'Platform POS Workspace' : 'Front Desk POS'}</span>
                    <ArrowUpRight size={13} className="ml-auto opacity-60" aria-hidden="true" />
                  </Link>
                )}
                <button type="button" onClick={signOut} className="website-signout"><LogOut size={15} aria-hidden="true" />Sign out</button>
              </>
            ) : <Link to="/login" className="website-account-link" onClick={closeNavigation}>Sign in to your account<ArrowUpRight size={15} aria-hidden="true" /></Link>}
          </div>
        </nav>
      )}
    </header>
  );
}
