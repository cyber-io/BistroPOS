import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  User, Package, MapPin, Phone, Mail, Clock, Compass, 
  CheckCircle2, ArrowRight, RefreshCw, ShoppingBag, 
  AlertCircle, ChevronRight, Check, ShieldCheck, LogOut, ArrowLeft
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';

const statusStyles = {
  NEW: { label: 'Order Received', bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' },
  CONFIRMED: { label: 'Confirmed', bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-200' },
  ACCEPTED: { label: 'Kitchen Accepted', bg: 'bg-sky-50', text: 'text-sky-800', border: 'border-sky-200' },
  PREPARING: { label: 'In Kitchen', bg: 'bg-indigo-50', text: 'text-indigo-800', border: 'border-indigo-200' },
  READY: { label: 'Ready for Service', bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200' },
  READY_FOR_PICKUP: { label: 'Ready for Pickup', bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200' },
  OUT_FOR_DELIVERY: { label: 'Out for Delivery', bg: 'bg-purple-50', text: 'text-purple-800', border: 'border-purple-200' },
  DELIVERED: { label: 'Delivered', bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200' },
  PICKED_UP: { label: 'Collected', bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200' },
  COMPLETED: { label: 'Completed', bg: 'bg-slate-100', text: 'text-slate-800', border: 'border-slate-200' },
  CANCELLED: { label: 'Cancelled', bg: 'bg-red-50', text: 'text-red-800', border: 'border-red-200' },
};

export default function CustomerProfilePage() {
  const { currentUser, updateProfile, logout, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState('orders'); // 'orders' | 'profile' | 'address'
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Profile edit form state
  const [name, setName] = useState(currentUser?.name || '');
  const [phone, setPhone] = useState(currentUser?.phone || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState(null);

  // Address preferences state
  const [address, setAddress] = useState(() => {
    try {
      const saved = localStorage.getItem('rs_customer_delivery_pref');
      return saved ? JSON.parse(saved) : { street: '', landmark: '', pincode: '', instructions: '' };
    } catch {
      return { street: '', landmark: '', pincode: '', instructions: '' };
    }
  });
  const [addressMsg, setAddressMsg] = useState(null);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login?redirect=/profile', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    if (currentUser) {
      setName(currentUser.name || '');
      setPhone(currentUser.phone || '');
    }
  }, [currentUser]);

  const loadOrders = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoadingOrders(true);
    try {
      const data = await api.getCustomerOrders();
      setOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load orders:', err);
    } finally {
      setLoadingOrders(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadOrders();
    }
  }, [isAuthenticated]);

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      const res = await updateProfile({ name: name.trim(), phone: phone.trim() });
      if (res.success) {
        setProfileMsg({ type: 'success', text: 'Profile updated successfully.' });
      } else {
        setProfileMsg({ type: 'error', text: res.message || 'Failed to update profile.' });
      }
    } catch (err) {
      setProfileMsg({ type: 'error', text: err.message || 'An error occurred.' });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveAddress = (e) => {
    e.preventDefault();
    try {
      localStorage.setItem('rs_customer_delivery_pref', JSON.stringify(address));
      setAddressMsg({ type: 'success', text: 'Delivery address and preferences saved.' });
      setTimeout(() => setAddressMsg(null), 4000);
    } catch {
      setAddressMsg({ type: 'error', text: 'Could not save address.' });
    }
  };

  if (!currentUser) return null;

  const activeOrders = orders.filter(o => o.status !== 'DELIVERED' && o.status !== 'COMPLETED' && o.status !== 'CANCELLED' && o.status !== 'PICKED_UP');
  const pastOrders = orders.filter(o => o.status === 'DELIVERED' || o.status === 'COMPLETED' || o.status === 'CANCELLED' || o.status === 'PICKED_UP');

  return (
    <div className="website-subpage min-h-screen bg-[#FAF1F0] py-8 sm:py-12 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto space-y-8 font-sans text-[#11164B]">
      {/* Top Breadcrumb & Actions */}
      <div className="flex items-center justify-between">
        <Link to="/menu" className="inline-flex items-center gap-2 text-xs text-[#75666B] hover:text-[#11164B] font-medium transition-colors">
          <ArrowLeft size={14} /> Back to our menu
        </Link>
        <button
          onClick={() => { logout(); navigate('/login'); }}
          className="inline-flex items-center gap-1.5 text-xs text-[#A61920] hover:underline font-semibold"
        >
          <LogOut size={14} /> Sign out
        </button>
      </div>

      {/* Customer Header Card */}
      <div className="bg-white rounded-2xl border border-[#ECD3D0] p-6 sm:p-8 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#FAF1F0] to-[#ECD3D0] border border-[#ECD3D0] text-[#A61920] flex items-center justify-center font-serif text-2xl font-bold shadow-inner">
            {currentUser.name ? currentUser.name.charAt(0).toUpperCase() : 'U'}
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-[#11164B]">
                {currentUser.name}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#FAF1F0] text-[#A61920] border border-[#ECD3D0]">
                Customer
              </span>
            </div>
            <p className="text-xs text-[#75666B] mt-1 flex items-center gap-3">
              <span className="inline-flex items-center gap-1"><Mail size={13} /> {currentUser.email}</span>
              {currentUser.phone && (
                <span className="inline-flex items-center gap-1"><Phone size={13} /> {currentUser.phone}</span>
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/menu"
            className="btn-3d-crimson px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5"
          >
            <ShoppingBag size={14} />
            <span>Order Food</span>
          </Link>
          <Link
            to="/book-table"
            className="px-4 py-2 rounded-xl text-xs font-bold border border-[#ECD3D0] bg-[#FAF1F0] text-[#11164B] hover:border-[#11164B] transition-colors inline-flex items-center gap-1.5"
          >
            <span>Book Table</span>
          </Link>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="flex border-b border-[#ECD3D0] gap-4 sm:gap-8 overflow-x-auto text-sm">
        <button
          onClick={() => setActiveTab('orders')}
          className={`pb-3 px-1 font-semibold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'orders'
              ? 'border-[#A61920] text-[#A61920]'
              : 'border-transparent text-[#75666B] hover:text-[#11164B]'
          }`}
        >
          <Package size={17} />
          <span>My Orders &amp; Tracking</span>
          {activeOrders.length > 0 && (
            <span className="ml-1 px-2 py-0.5 text-[10px] rounded-full bg-[#A61920] text-white font-bold">
              {activeOrders.length} active
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('profile')}
          className={`pb-3 px-1 font-semibold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'profile'
              ? 'border-[#A61920] text-[#A61920]'
              : 'border-transparent text-[#75666B] hover:text-[#11164B]'
          }`}
        >
          <User size={17} />
          <span>Update Information</span>
        </button>

        <button
          onClick={() => setActiveTab('address')}
          className={`pb-3 px-1 font-semibold flex items-center gap-2 border-b-2 transition-all whitespace-nowrap ${
            activeTab === 'address'
              ? 'border-[#A61920] text-[#A61920]'
              : 'border-transparent text-[#75666B] hover:text-[#11164B]'
          }`}
        >
          <MapPin size={17} />
          <span>Delivery Address</span>
        </button>
      </div>

      {/* TAB 1: ORDERS & TRACKING */}
      {activeTab === 'orders' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-[#75666B]">
              Order History &amp; Status
            </h2>
            <button
              onClick={() => loadOrders(true)}
              disabled={refreshing}
              className="text-xs text-[#75666B] hover:text-[#11164B] flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
              <span>{refreshing ? 'Refreshing…' : 'Refresh'}</span>
            </button>
          </div>

          {loadingOrders ? (
            <div className="bg-white rounded-2xl border border-[#ECD3D0] p-12 text-center text-sm text-[#75666B] space-y-3">
              <RefreshCw size={24} className="animate-spin mx-auto text-[#A61920]" />
              <p>Loading your orders…</p>
            </div>
          ) : orders.length === 0 ? (
            <div className="bg-white rounded-2xl border border-[#ECD3D0] p-12 text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-full bg-[#FAF1F0] text-[#A61920] flex items-center justify-center">
                <ShoppingBag size={24} />
              </div>
              <h3 className="font-serif text-xl font-bold">No orders placed yet</h3>
              <p className="text-xs text-[#75666B] max-w-sm mx-auto">
                Discover our artisanal delicacies, seasonal drinks, and freshly baked delights.
              </p>
              <Link to="/menu" className="btn-3d-crimson inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold">
                Explore our menu <ArrowRight size={15} />
              </Link>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Active Orders Highlight */}
              {activeOrders.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-[#A61920] uppercase tracking-wider flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                    Active Orders In Progress ({activeOrders.length})
                  </h3>
                  <div className="grid gap-4">
                    {activeOrders.map(order => (
                      <OrderCard key={order.orderId} order={order} isActive />
                    ))}
                  </div>
                </div>
              )}

              {/* Past Orders */}
              {pastOrders.length > 0 && (
                <div className="space-y-3 pt-2">
                  <h3 className="text-xs font-bold text-[#75666B] uppercase tracking-wider">
                    Past Orders ({pastOrders.length})
                  </h3>
                  <div className="grid gap-4">
                    {pastOrders.map(order => (
                      <OrderCard key={order.orderId} order={order} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: UPDATE PROFILE INFORMATION */}
      {activeTab === 'profile' && (
        <div className="bg-white rounded-2xl border border-[#ECD3D0] p-6 sm:p-8 max-w-2xl shadow-sm space-y-6">
          <div>
            <h2 className="font-serif text-xl font-bold text-[#11164B]">Personal Information</h2>
            <p className="text-xs text-[#75666B] mt-1">
              Update your account name and phone number for smoother deliveries and reservations.
            </p>
          </div>

          {profileMsg && (
            <div
              className={`p-3.5 rounded-xl text-xs flex items-center gap-2.5 border ${
                profileMsg.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-red-50 text-red-800 border-red-200'
              }`}
            >
              {profileMsg.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
              <span>{profileMsg.text}</span>
            </div>
          )}

          <form onSubmit={handleUpdateProfile} className="space-y-4">
            <div>
              <label htmlFor="customer-name" className="block text-xs font-medium mb-1.5">
                Full Name
              </label>
              <input
                id="customer-name"
                type="text"
                required
                maxLength={255}
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full rounded-xl border border-[#ECD3D0] bg-white px-3.5 py-2.5 text-xs outline-none focus:border-[#11164B] focus:ring-1 focus:ring-[#11164B]"
                placeholder="Your full name"
              />
            </div>

            <div>
              <label htmlFor="customer-email" className="block text-xs font-medium mb-1.5">
                Email Address <span className="text-[10px] text-[#75666B]">(Registered)</span>
              </label>
              <div className="relative">
                <input
                  id="customer-email"
                  type="email"
                  disabled
                  value={currentUser.email}
                  className="w-full rounded-xl border border-[#ECD3D0] bg-[#FAF1F0] px-3.5 py-2.5 text-xs text-[#75666B] cursor-not-allowed outline-none"
                />
                <span className="absolute right-3 top-2.5 text-emerald-600 text-[10px] font-semibold flex items-center gap-1">
                  <ShieldCheck size={13} /> Verified
                </span>
              </div>
            </div>

            <div>
              <label htmlFor="customer-phone" className="block text-xs font-medium mb-1.5">
                Mobile Number
              </label>
              <input
                id="customer-phone"
                type="tel"
                maxLength={20}
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className="w-full rounded-xl border border-[#ECD3D0] bg-white px-3.5 py-2.5 text-xs outline-none focus:border-[#11164B] focus:ring-1 focus:ring-[#11164B]"
                placeholder="+91 98765 43210"
              />
              <p className="text-[10px] text-[#75666B] mt-1">
                Used to deliver status updates and coordinate takeaway or delivery.
              </p>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={savingProfile}
                className="btn-3d-crimson px-6 py-2.5 rounded-xl text-xs font-bold inline-flex items-center gap-2 disabled:opacity-50"
              >
                {savingProfile ? 'Saving updates…' : 'Save Information'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 3: SAVED DELIVERY ADDRESS */}
      {activeTab === 'address' && (
        <div className="bg-white rounded-2xl border border-[#ECD3D0] p-6 sm:p-8 max-w-2xl shadow-sm space-y-6">
          <div>
            <h2 className="font-serif text-xl font-bold text-[#11164B]">Delivery Address Preferences</h2>
            <p className="text-xs text-[#75666B] mt-1">
              Save your default delivery location to speed up online orders.
            </p>
          </div>

          {addressMsg && (
            <div
              className={`p-3.5 rounded-xl text-xs flex items-center gap-2.5 border ${
                addressMsg.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-red-50 text-red-800 border-red-200'
              }`}
            >
              <CheckCircle2 size={16} />
              <span>{addressMsg.text}</span>
            </div>
          )}

          <form onSubmit={handleSaveAddress} className="space-y-4">
            <div>
              <label htmlFor="addr-street" className="block text-xs font-medium mb-1.5">
                Street Address / House / Flat No.
              </label>
              <input
                id="addr-street"
                type="text"
                value={address.street}
                onChange={e => setAddress({ ...address, street: e.target.value })}
                className="w-full rounded-xl border border-[#ECD3D0] bg-white px-3.5 py-2.5 text-xs outline-none focus:border-[#11164B] focus:ring-1 focus:ring-[#11164B]"
                placeholder="e.g. Flat 402, Bloom Tower, Gourmet Street"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="addr-landmark" className="block text-xs font-medium mb-1.5">
                  Landmark (Optional)
                </label>
                <input
                  id="addr-landmark"
                  type="text"
                  value={address.landmark}
                  onChange={e => setAddress({ ...address, landmark: e.target.value })}
                  className="w-full rounded-xl border border-[#ECD3D0] bg-white px-3.5 py-2.5 text-xs outline-none focus:border-[#11164B] focus:ring-1 focus:ring-[#11164B]"
                  placeholder="Near Cyber Hub"
                />
              </div>
              <div>
                <label htmlFor="addr-pincode" className="block text-xs font-medium mb-1.5">
                  Pincode
                </label>
                <input
                  id="addr-pincode"
                  type="text"
                  maxLength={10}
                  value={address.pincode}
                  onChange={e => setAddress({ ...address, pincode: e.target.value })}
                  className="w-full rounded-xl border border-[#ECD3D0] bg-white px-3.5 py-2.5 text-xs outline-none focus:border-[#11164B] focus:ring-1 focus:ring-[#11164B]"
                  placeholder="122002"
                />
              </div>
            </div>

            <div>
              <label htmlFor="addr-notes" className="block text-xs font-medium mb-1.5">
                Delivery Notes / Instructions
              </label>
              <textarea
                id="addr-notes"
                rows={2}
                value={address.instructions}
                onChange={e => setAddress({ ...address, instructions: e.target.value })}
                className="w-full rounded-xl border border-[#ECD3D0] bg-white px-3.5 py-2.5 text-xs outline-none focus:border-[#11164B] focus:ring-1 focus:ring-[#11164B]"
                placeholder="Gate entry code, leave with guard, etc."
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                className="btn-3d-crimson px-6 py-2.5 rounded-xl text-xs font-bold inline-flex items-center gap-2"
              >
                <span>Save Address</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function OrderCard({ order, isActive }) {
  const [expanded, setExpanded] = useState(isActive);
  const statusInfo = statusStyles[order.status] || {
    label: order.status.replace(/_/g, ' '),
    bg: 'bg-slate-50',
    text: 'text-slate-700',
    border: 'border-slate-200'
  };

  const formattedDate = order.createdAt
    ? new Date(order.createdAt).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    : '';

  return (
    <div className={`bg-white rounded-2xl border transition-all ${
      isActive ? 'border-[#ECD3D0] shadow-md ring-1 ring-[#A61920]/15' : 'border-[#ECD3D0] shadow-sm'
    }`}>
      {/* Card Header */}
      <div className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-[#FAF1F0]">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs font-bold text-[#11164B] tracking-wide">
              {order.orderNumber}
            </span>
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${statusInfo.bg} ${statusInfo.text} ${statusInfo.border}`}>
              {statusInfo.label}
            </span>
            <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[#FAF1F0] text-[#75666B] border border-[#ECD3D0]">
              {order.source.replace(/_/g, ' ')}
            </span>
          </div>
          <p className="text-[11px] text-[#75666B] mt-1 flex items-center gap-1.5">
            <Clock size={12} /> Placed on {formattedDate}
          </p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
          <div className="text-left sm:text-right">
            <span className="text-[10px] text-[#75666B] uppercase font-semibold block">Total</span>
            <strong className="text-sm font-bold text-[#11164B]">₹{Number(order.total || 0).toFixed(2)}</strong>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to={`/track-order?orderId=${encodeURIComponent(order.orderNumber)}`}
              className="btn-3d-crimson px-3 py-1.5 rounded-lg text-xs font-bold inline-flex items-center gap-1 shrink-0"
              title="Track Live Order"
            >
              <Compass size={13} />
              <span>Track</span>
            </Link>

            <button
              onClick={() => setExpanded(prev => !prev)}
              className="p-1.5 rounded-lg text-[#75666B] hover:text-[#11164B] hover:bg-[#FAF1F0] transition-colors"
              aria-label={expanded ? 'Collapse items' : 'Expand items'}
            >
              <ChevronRight size={16} className={`transform transition-transform ${expanded ? 'rotate-90' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Expandable Order Details & Items */}
      {expanded && (
        <div className="p-4 sm:p-5 bg-[#FAF1F0]/40 space-y-3">
          <div className="space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#75666B]">
              Ordered Items ({(order.items || []).length})
            </p>
            <div className="space-y-1.5">
              {(order.items || []).map((item, idx) => (
                <div key={item.orderItemId || idx} className="flex justify-between items-center text-xs py-1 border-b border-[#FAF1F0] last:border-0">
                  <span className="flex items-center gap-2 text-[#11164B]">
                    <span className="w-5 h-5 rounded bg-white border border-[#ECD3D0] inline-flex items-center justify-center font-bold text-[10px] text-[#A61920]">
                      {item.quantity}×
                    </span>
                    <span>{item.itemName || item.name}</span>
                  </span>
                  <span className="font-medium text-[#75666B]">
                    ₹{Number(item.lineTotal || (item.priceSnapshot * item.quantity) || 0).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-2 border-t border-[#ECD3D0] flex flex-wrap items-center justify-between gap-2 text-xs text-[#75666B]">
            <div>
              Payment: <strong className={order.paymentStatus === 'PAID' ? 'text-emerald-700' : 'text-amber-700'}>
                {order.paymentStatus || 'UNPAID'}
              </strong>
            </div>
            {order.tableNumber && (
              <div>Table: <strong>#{order.tableNumber}</strong></div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
