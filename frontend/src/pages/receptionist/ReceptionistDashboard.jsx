import React, { useCallback, useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { api, subscribeRealtimeEvents } from '../../services/api';
import { tableTitle, getTableQrUrl } from '../../services/tablePresentation';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';
import {
  LayoutDashboard,
  Grid,
  Calendar,
  ShoppingBag,
  CreditCard,
  AlertCircle,
  QrCode,
  Users,
  CheckCircle2,
  Clock,
  DollarSign,
  Search,
  Filter,
  Plus,
  ArrowRight,
  RefreshCw,
  Printer,
  Download,
  PhoneCall,
  UserCheck,
  X,
  Map,
  Move,
  ChefHat,
  Bell,
  Sparkles,
  Check
} from 'lucide-react';

function LocalTableQrImage({ url, title }) {
  const [imgSrc, setImgSrc] = useState('');
  useEffect(() => {
    if (url) {
      QRCode.toDataURL(url, { width: 300, margin: 2, errorCorrectionLevel: 'M' })
        .then(setImgSrc)
        .catch(() => setImgSrc(''));
    }
  }, [url]);

  if (!imgSrc) {
    return <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">Generating...</div>;
  }
  return <img src={imgSrc} alt={`QR Code for ${title}`} className="w-full h-full object-contain" />;
}

export default function ReceptionistDashboard() {
  const { currentUser } = useAuth();
  const { addToast } = useNotification();
  const [activeModule, setActiveModuleState] = useState(() => {
    try {
      const saved = localStorage.getItem('bistro_receptionist_module');
      if (saved && ['DASHBOARD', 'TABLES', 'RESERVATIONS', 'ORDERS', 'BILLING', 'ISSUES', 'QR_MGMT'].includes(saved)) {
        return saved;
      }
    } catch {
      // ignore
    }
    return 'DASHBOARD';
  });

  const setActiveModule = useCallback((mod) => {
    setActiveModuleState(prev => {
      const val = typeof mod === 'function' ? mod(prev) : mod;
      try {
        localStorage.setItem('bistro_receptionist_module', val);
      } catch {
        // ignore
      }
      return val;
    });
  }, []);

  const [tables, setTables] = useState([]);
  const [orders, setOrders] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [helpRequests, setHelpRequests] = useState([]);
  const [issues, setIssues] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [selectedOrderForBill, setSelectedOrderForBill] = useState(null);
  const [orderFilter, setOrderFilterState] = useState(() => {
    try {
      return localStorage.getItem('bistro_receptionist_order_filter') || 'ALL';
    } catch {
      return 'ALL';
    }
  });

  const setOrderFilter = useCallback((f) => {
    setOrderFilterState(prev => {
      const val = typeof f === 'function' ? f(prev) : f;
      try {
        localStorage.setItem('bistro_receptionist_order_filter', val);
      } catch {
        // ignore
      }
      return val;
    });
  }, []);

  const [orderSearch, setOrderSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Feature 4: Interactive Live Floor Map State
  const [tableLayoutMode, setTableLayoutModeState] = useState(() => {
    try {
      return localStorage.getItem('bistro_receptionist_layout_mode') || 'MAP';
    } catch {
      return 'MAP';
    }
  });

  const setTableLayoutMode = useCallback((m) => {
    setTableLayoutModeState(prev => {
      const val = typeof m === 'function' ? m(prev) : m;
      try {
        localStorage.setItem('bistro_receptionist_layout_mode', val);
      } catch {
        // ignore
      }
      return val;
    });
  }, []);

  const [selectedDiningArea, setSelectedDiningArea] = useState('ALL');
  const [waiters, setWaiters] = useState([]);
  const [activeTableSession, setActiveTableSession] = useState(null);
  const [draggedTableId, setDraggedTableId] = useState(null);

  // New Reservation modal state
  const [isNewResModalOpen, setIsNewResModalOpen] = useState(false);
  const [newResForm, setNewResForm] = useState({
    customerName: '',
    customerPhone: '',
    customerEmail: '',
    reservationDate: new Date().toISOString().split('T')[0],
    reservationTime: '19:30',
    guestCount: 2,
    specialRequest: ''
  });

  const [waitlist, setWaitlist] = useState([]);
  const [waitEstimate, setWaitEstimate] = useState(null);
  const [isAddWalkInOpen, setIsAddWalkInOpen] = useState(false);
  const [walkInForm, setWalkInForm] = useState({ customerName: '', customerPhone: '', partySize: 2, notes: '' });
  const [partyHallModal, setPartyHallModal] = useState(null);
  const [prepSheetModal, setPrepSheetModal] = useState(null);
  const [eventPlanForm, setEventPlanForm] = useState({
    confirmedHeadcount: 20,
    mealChoices: 'Paneer Tikka, Dal Makhani, Butter Naan, Gulab Jamun',
    dietaryRequests: '',
    depositAmount: 5000,
    depositPaid: 5000,
    estimatedTotalCost: 15000,
    prepSheetNotes: ''
  });

  const loadData = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const tbls = await api.getTables();
      setTables(tbls);
      const ords = await api.getOrders();
      setOrders(ords);
      const res = await api.getReservations();
      setReservations(res);
      const help = await api.getHelpRequests();
      setHelpRequests(help);
      try {
        const wl = await api.getWaitlist();
        if (Array.isArray(wl)) setWaitlist(wl);
      } catch (wlErr) {
        console.warn('Waitlist load error:', wlErr);
      }
      try {
        const waiterList = await api.getUsers('WAITER');
        if (Array.isArray(waiterList)) setWaiters(waiterList);
      } catch (staffErr) {
        console.warn('Waiter list load error:', staffErr);
      }
    } catch (e) {
      console.warn('Receptionist load error:', e);
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const unsub = subscribeRealtimeEvents((type, payload) => {
      if (type === 'CUSTOMER_ORDER_NOT_RECEIVED') {
        // Record issue in local state
        setIssues(prev => [
          {
            id: 'iss-' + Date.now(),
            orderId: payload.orderId,
            orderNumber: payload.orderNumber,
            tableNumber: payload.tableNumber,
            tableId: payload.tableId,
            restaurantId: payload.restaurantId,
            description: payload.message,
            status: 'PENDING',
            createdAt: new Date().toISOString()
          },
          ...prev
        ]);
      }
      loadData(true);
    });

    const heartbeat = setInterval(() => {
      loadData(true);
    }, 30000);

    return () => {
      unsub();
      clearInterval(heartbeat);
    };
  }, []);

  // Dashboard KPI Metrics (Section 21)
  const totalTables = tables.length;
  const availableTables = tables.filter(t => t.status === 'AVAILABLE').length;
  const occupiedTables = tables.filter(t => t.status === 'OCCUPIED').length;
  const reservedTables = tables.filter(t => t.status === 'RESERVED').length;
  const cleaningTables = tables.filter(t => t.status === 'WAITING_FOR_CLEANING').length;
  const activeOrders = orders.filter(o => o.status !== 'DELIVERED' && o.status !== 'CANCELLED').length;
  const todayReservations = reservations.filter(r => r.status === 'CONFIRMED' || r.status === 'ARRIVED').length;
  const totalSales = orders.filter(o => o.status === 'DELIVERED').reduce((acc, o) => acc + o.total, 0);
  const pendingPayments = orders.filter(o => o.status !== 'DELIVERED' && o.status !== 'CANCELLED').reduce((acc, o) => acc + o.total, 0);

  // Table Status change action
  const handleUpdateTableStatus = async (tableId, nextStatus, customerName = null) => {
    try {
      await api.updateTableStatus(tableId, nextStatus, customerName);
      addToast(`Table status updated to ${nextStatus}.`, 'success');
      loadData(true);
      if (selectedTable && selectedTable.tableId === tableId) {
        setSelectedTable(prev => prev ? { ...prev, status: nextStatus, currentCustomerName: customerName } : null);
      }
    } catch {
      addToast('Failed to update table status.', 'error');
    }
  };

  // Feature 4: Table Selection with active dining session fetch
  const handleSelectTable = async (t) => {
    setSelectedTable(t);
    setActiveTableSession(null);
    try {
      const sess = await api.getTableSession(t.tableId);
      setActiveTableSession(sess);
    } catch {
      setActiveTableSession(null);
    }
  };

  // Feature 4: Floor Map Drag-and-Drop Positioning
  const handleDragStart = (e, tableId) => {
    e.dataTransfer.setData('text/plain', tableId);
    setDraggedTableId(tableId);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    const tableId = e.dataTransfer.getData('text/plain') || draggedTableId;
    if (!tableId) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const rawX = e.clientX - rect.left - 50;
    const rawY = e.clientY - rect.top - 40;

    // Snap to 15px grid
    const clampedX = Math.max(15, Math.min(Math.round(rawX / 15) * 15, Math.max(100, rect.width - 130)));
    const clampedY = Math.max(15, Math.min(Math.round(rawY / 15) * 15, Math.max(100, rect.height - 110)));

    const targetTable = tables.find(t => t.tableId === tableId);
    if (!targetTable) return;

    // Optimistically update
    setTables(prev => prev.map(t => t.tableId === tableId ? { ...t, positionX: clampedX, positionY: clampedY } : t));
    if (selectedTable?.tableId === tableId) {
      setSelectedTable(prev => ({ ...prev, positionX: clampedX, positionY: clampedY }));
    }
    setDraggedTableId(null);

    try {
      await api.updateTablePosition(tableId, clampedX, clampedY, targetTable.shape || 'SQUARE', targetTable.diningArea || 'everyday');
      addToast(`${tableTitle(targetTable)} repositioned on floor.`, 'info');
    } catch (err) {
      console.warn('Failed to persist table coordinates:', err);
    }
  };

  // Feature 4: Table Shape and Dining Area Configuration
  const handleUpdateTableShapeAndArea = async (tableId, newShape, newArea) => {
    const targetTable = tables.find(t => t.tableId === tableId);
    if (!targetTable) return;
    const shape = newShape || targetTable.shape || 'SQUARE';
    const area = newArea || targetTable.diningArea || 'everyday';

    setTables(prev => prev.map(t => t.tableId === tableId ? { ...t, shape, diningArea: area } : t));
    if (selectedTable?.tableId === tableId) {
      setSelectedTable(prev => ({ ...prev, shape, diningArea: area }));
    }

    try {
      await api.updateTablePosition(tableId, targetTable.positionX || 0, targetTable.positionY || 0, shape, area);
      addToast(`${tableTitle(targetTable)} layout configuration saved.`, 'success');
    } catch {
      addToast('Failed to update table layout properties.', 'error');
    }
  };

  // Feature 4: Waiter Assignment from Receptionist Map
  const handleAssignWaiter = async (tableId, waiterId) => {
    const selectedWaiter = waiters.find(w => w.userId === waiterId);
    try {
      await api.updateTableStatus(tableId, selectedTable?.status || 'AVAILABLE', selectedTable?.currentCustomerName || null, waiterId || null);
      addToast(selectedWaiter ? `Assigned ${selectedWaiter.name} to ${tableTitle(selectedTable)}.` : `Waiter unassigned.`, 'success');
      loadData(true);
      if (selectedTable?.tableId === tableId) {
        setSelectedTable(prev => ({ ...prev, assignedWaiterId: waiterId, assignedWaiterName: selectedWaiter ? selectedWaiter.name : null }));
      }
    } catch {
      addToast('Failed to update waiter assignment.', 'error');
    }
  };

  // Feature 4: Accept Help Request (Receptionist only accepts; Waiter resolves on floor)
  const handleAcceptHelp = async (requestId) => {
    try {
      await api.acceptHelpRequest(requestId, currentUser?.name || 'Reception Desk');
      addToast('Service request accepted.', 'success');
      setHelpRequests(prev => prev.map(h => h.requestId === requestId ? { ...h, status: 'ASSIGNED', assignedWaiterName: currentUser?.name || 'Reception Desk' } : h));
      loadData(true);
    } catch {
      addToast('Failed to accept help request.', 'error');
    }
  };

  // Customer Arrival Flow (Section 24): Confirmed -> Arrived -> Table Assigned -> Seated
  const handleReservationArrived = async (reservation) => {
    try {
      await api.updateReservationStatus(reservation.reservationId, 'ARRIVED');
      addToast(`Customer ${reservation.customerName} marked ARRIVED. Ready to seat at ${tableTitle(reservation)}.`, 'info');
      loadData();
    } catch {
      addToast('Failed to update reservation.', 'error');
    }
  };

  const handleReservationSeated = async (reservation) => {
    try {
      await api.updateReservationStatus(reservation.reservationId, 'SEATED');
      if (reservation.tableId) {
        await api.updateTableStatus(reservation.tableId, 'OCCUPIED', reservation.customerName);
      }
      addToast(`${reservation.customerName} marked SEATED at ${tableTitle(reservation)}. QR ordering active.`, 'success');
      loadData();
    } catch {
      addToast('Failed to seat customer.', 'error');
    }
  };

  // Checkout Flow (Section 28): Bill Generated -> Payment Received -> Checkout -> Table Cleaning -> Table Available
  const handleProcessCheckout = async (table) => {
    try {
      const unpaidOrders = orders.filter(o =>
        (o.tableId === table.tableId || o.tableNumber === table.tableNumber) &&
        o.status !== 'CANCELLED' &&
        o.paymentStatus !== 'PAID'
      );
      for (const ord of unpaidOrders) {
        const due = Math.max(0, Number(ord.total || 0) - Number(ord.paidAmount || 0));
        await api.recordPayment({
          restaurantId: ord.restaurantId,
          orderId: ord.orderId,
          amount: due > 0 ? due : Number(ord.total || 0),
          method: 'CASH'
        });
      }
      await api.closeTableSession(table.tableId).catch((closeErr) => console.warn('Close session notice:', closeErr));
      // Move table to cleaning
      await api.updateTableStatus(table.tableId, 'WAITING_FOR_CLEANING', null);
      addToast(`Payment received for ${tableTitle(table)}. Table marked WAITING_FOR_CLEANING.`, 'success');
      loadData();
      setSelectedTable(null);
    } catch (err) {
      addToast(err?.message || 'Failed to checkout table.', 'error');
    }
  };

  // Create Reservation
  const handleCreateReservation = async (e) => {
    e.preventDefault();
    try {
      const res = await api.createReservation(newResForm);
      addToast(`Reservation ${res.bookingId} confirmed at ${tableTitle(res)}!`, 'success');
      setIsNewResModalOpen(false);
      loadData();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const fetchWaitEstimate = async (size = 2) => {
    try {
      const est = await api.getWaitEstimate(null, size);
      setWaitEstimate(est);
    } catch {}
  };

  const handleAddWalkIn = async (e) => {
    e.preventDefault();
    if (!walkInForm.customerName || !walkInForm.customerPhone) {
      addToast('Please enter customer name and phone.', 'warning');
      return;
    }
    try {
      await api.addWalkIn(walkInForm);
      addToast(`Added ${walkInForm.customerName} to waitlist!`, 'success');
      setIsAddWalkInOpen(false);
      setWalkInForm({ customerName: '', customerPhone: '', partySize: 2, notes: '' });
      loadData(true);
    } catch (err) {
      addToast(err.message || 'Failed to add walk-in guest', 'error');
    }
  };

  const handleNotifyWaitlist = async (id) => {
    try {
      await api.notifyWaitlistGuest(id);
      addToast('Guest notified via SMS/App ready alert!', 'success');
      loadData(true);
    } catch (err) {
      addToast(err.message || 'Failed to notify guest', 'error');
    }
  };

  const handleSeatWaitlist = async (id, tableId) => {
    try {
      await api.seatWaitlistGuest(id, tableId);
      addToast('Guest seated successfully! Table marked occupied.', 'success');
      loadData(true);
    } catch (err) {
      addToast(err.message || 'Failed to seat guest', 'error');
    }
  };

  const handleCancelWaitlist = async (id) => {
    try {
      await api.cancelWaitlistGuest(id);
      addToast('Waitlist entry cancelled.', 'info');
      loadData(true);
    } catch (err) {
      addToast(err.message || 'Failed to cancel', 'error');
    }
  };

  const openPartyHallModal = (res) => {
    setPartyHallModal(res);
    setEventPlanForm({
      confirmedHeadcount: res.confirmedHeadcount || res.guestCount || 20,
      mealChoices: 'Paneer Tikka, Dal Makhani, Butter Naan, Gulab Jamun',
      dietaryRequests: res.dietaryRequests || '',
      depositAmount: res.depositAmount || 5000,
      depositPaid: res.depositPaid || 5000,
      estimatedTotalCost: res.estimatedTotalCost || 15000,
      prepSheetNotes: res.prepSheetNotes || ''
    });
  };

  const handleSaveEventPlan = async (e) => {
    e.preventDefault();
    if (!partyHallModal) return;
    try {
      const choices = eventPlanForm.mealChoices.split(',').map(s => s.trim()).filter(Boolean);
      await api.planEvent(partyHallModal.reservationId, {
        confirmedHeadcount: Number(eventPlanForm.confirmedHeadcount),
        mealChoices: choices,
        dietaryRequests: eventPlanForm.dietaryRequests,
        depositAmount: Number(eventPlanForm.depositAmount),
        depositPaid: Number(eventPlanForm.depositPaid),
        estimatedTotalCost: Number(eventPlanForm.estimatedTotalCost),
        prepSheetNotes: eventPlanForm.prepSheetNotes
      });
      addToast('Party hall event plan saved successfully!', 'success');
      setPartyHallModal(null);
      loadData(true);
    } catch (err) {
      addToast(err.message || 'Failed to save event plan', 'error');
    }
  };

  const handleViewPrepSheet = async (resId) => {
    try {
      const sheet = await api.getKitchenPrepSheet(resId);
      setPrepSheetModal(sheet);
    } catch (err) {
      addToast(err.message || 'Failed to load prep sheet', 'error');
    }
  };

  const handleConfirmCashPayment = async (helpReq) => {
    try {
      const match = helpReq.message?.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
      const paymentId = match ? match[0] : null;
      if (paymentId) {
        await api.confirmCashPayment(paymentId);
      } else {
        await api.resolveHelpRequest(helpReq.requestId);
      }
      addToast('Cash payment confirmed and recorded!', 'success');
      loadData(true);
    } catch (err) {
      addToast(err.message || 'Could not confirm cash payment', 'error');
    }
  };

  // Filtered orders list (Section 27)
  const filteredOrders = orders.filter(o => {
    const matchesFilter = orderFilter === 'ALL' ||
      (orderFilter === 'DINE_IN' && o.source === 'DINE_IN_QR') ||
      (orderFilter === 'DELIVERY' && o.source === 'DELIVERY') ||
      (orderFilter === 'TAKEAWAY' && o.source === 'TAKEAWAY') ||
      (orderFilter === 'ACTIVE' && o.status !== 'DELIVERED' && o.status !== 'CANCELLED') ||
      (orderFilter === 'COMPLETED' && o.status === 'DELIVERED');

    const matchesSearch = !orderSearch ||
      o.orderNumber.toLowerCase().includes(orderSearch.toLowerCase()) ||
      (o.tableNumber && o.tableNumber.toString().includes(orderSearch)) ||
      (o.tableId && tableTitle(o).toLowerCase().includes(orderSearch.toLowerCase())) ||
      (o.customerName && o.customerName.toLowerCase().includes(orderSearch.toLowerCase()));

    return matchesFilter && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col md:flex-row pb-12">
      {/* Receptionist Sidebar Navigation */}
      <aside className="w-full md:w-64 bg-slate-900 text-slate-300 flex-shrink-0 flex flex-col justify-between">
        <div className="p-4 sm:p-5">
          <div className="flex items-center space-x-3 mb-6 pb-4 border-b border-slate-800">
            <div className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center font-bold shadow-md shadow-purple-600/30">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-black text-white leading-tight">Receptionist Panel</h2>
              <p className="text-[11px] text-slate-400">Front Desk & Concierge</p>
            </div>
          </div>

          <nav className="space-y-1">
            {[
              { id: 'DASHBOARD', label: 'Dashboard', icon: LayoutDashboard },
              { id: 'TABLES', label: 'Table Management', icon: Grid, count: occupiedTables },
              { id: 'WAITLIST', label: 'Walk-in Waitlist', icon: Users, count: waitlist.filter(w => w.status === 'WAITING').length },
              { id: 'RESERVATIONS', label: 'Reservations', icon: Calendar, count: todayReservations },
              { id: 'ORDERS', label: 'Orders Hub', icon: ShoppingBag, count: activeOrders },
              { id: 'BILLING', label: 'Billing & Checkout', icon: CreditCard },
              { id: 'ISSUES', label: 'Customer Issues', icon: AlertCircle, count: issues.length, isDanger: true },
              { id: 'QR_MGMT', label: 'QR Management', icon: QrCode }
            ].map(m => {
              const Icon = m.icon;
              const active = activeModule === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setActiveModule(m.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all ${
                    active
                      ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center space-x-2.5">
                    <Icon className="w-4 h-4" />
                    <span>{m.label}</span>
                  </div>
                  {m.count !== undefined && m.count > 0 && (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                      m.isDanger ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-300'
                    }`}>
                      {m.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-slate-800 text-[11px] text-slate-500">
          Connected as Receptionist Ananya Sharma
        </div>
      </aside>

      {/* Main Receptionist Canvas */}
      <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div>
              <h1 className="text-xl font-black text-slate-900">
                {activeModule.replace('_', ' ')}
              </h1>
              <p className="text-xs text-slate-500">
                Front desk coordination and live restaurant management
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={loadData}
                className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                title="Refresh"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </button>

              <button
                onClick={() => setIsNewResModalOpen(true)}
                className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-md shadow-purple-600/20 transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>New Booking</span>
              </button>
            </div>
          </div>

          {/* MODULE 1: DASHBOARD (Section 21) */}
          {activeModule === 'DASHBOARD' && (
            <div className="space-y-6">
              {/* Top KPI Cards (Section 21) */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {[
                  { label: 'Total Tables', value: totalTables, color: 'text-slate-800' },
                  { label: 'Available Tables', value: availableTables, color: 'text-emerald-600' },
                  { label: 'Occupied Tables', value: occupiedTables, color: 'text-amber-600' },
                  { label: 'Reserved Tables', value: reservedTables, color: 'text-purple-600' },
                  { label: 'Cleaning Tables', value: cleaningTables, color: 'text-blue-600' },
                  { label: 'Active Orders', value: activeOrders, color: 'text-indigo-600' },
                  { label: 'Pending Issues', value: issues.length, color: issues.length > 0 ? 'text-red-600 animate-pulse font-black' : 'text-slate-600' },
                  { label: "Today's Bookings", value: todayReservations, color: 'text-brand-600' },
                  { label: 'Delivered Sales', value: `₹${totalSales.toFixed(0)}`, color: 'text-emerald-700' },
                  { label: 'Pending Payment', value: `₹${pendingPayments.toFixed(0)}`, color: 'text-amber-700' }
                ].map((kpi, idx) => (
                  <div key={idx} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-1">
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{kpi.label}</p>
                    <p className={`text-xl font-black ${kpi.color}`}>{kpi.value}</p>
                  </div>
                ))}
              </div>

              {/* Floor Layout Quick Look */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                    Floor Table Quick Status
                  </h3>
                  <button
                    onClick={() => setActiveModule('TABLES')}
                    className="text-xs text-purple-600 font-bold hover:underline"
                  >
                    View Full Floor Plan →
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                  {tables.map(t => (
                    <div
                      key={t.tableId}
                      onClick={() => { setSelectedTable(t); setActiveModule('TABLES'); }}
                      className={`p-3 rounded-xl border text-center cursor-pointer transition-all hover:scale-105 ${
                        t.status === 'AVAILABLE' ? 'border-emerald-200 bg-emerald-50/40 text-emerald-800' :
                        t.status === 'OCCUPIED' ? 'border-amber-300 bg-amber-50 text-amber-900' :
                        t.status === 'RESERVED' ? 'border-purple-200 bg-purple-50 text-purple-900' :
                        t.status === 'WAITING_FOR_CLEANING' ? 'border-blue-200 bg-blue-50 text-blue-900' :
                        'border-slate-200 bg-slate-100 text-slate-400'
                      }`}
                    >
                      <p className="text-xs font-black">{tableTitle(t)}</p>
                      <p className="text-[10px] uppercase font-bold mt-0.5">{t.status.replace('_', ' ')}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Feature 10: Advanced Restaurant Analytics & Reporting */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Traffic & Peak Dining Hours */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                      <Clock size={16} className="text-purple-600" /> Peak Dining Traffic
                    </h3>
                    <span className="text-xs font-bold text-slate-500">Live Breakdown</span>
                  </div>

                  <div className="space-y-3">
                    {[
                      { period: 'Lunch Rush (12 PM - 3 PM)', pct: 40, color: 'bg-amber-500' },
                      { period: 'Evening Snacks (4 PM - 6 PM)', pct: 20, color: 'bg-indigo-500' },
                      { period: 'Dinner Peak (7 PM - 10 PM)', pct: 85, color: 'bg-purple-600' },
                      { period: 'Late Dining (10 PM+)', pct: 25, color: 'bg-slate-700' }
                    ].map((slot, idx) => (
                      <div key={idx} className="space-y-1">
                        <div className="flex justify-between text-xs font-bold text-slate-700">
                          <span>{slot.period}</span>
                          <span className="text-slate-500">{slot.pct}% Capacity</span>
                        </div>
                        <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${slot.color}`}
                            style={{ width: `${slot.pct}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100 text-xs">
                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                      <span className="text-slate-500 font-semibold block">Avg Order Value (AOV)</span>
                      <strong className="text-slate-900 font-black text-sm">
                        ₹{orders.filter(o => o.status === 'DELIVERED').length > 0 ? (totalSales / orders.filter(o => o.status === 'DELIVERED').length).toFixed(0) : '380'}
                      </strong>
                    </div>
                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                      <span className="text-slate-500 font-semibold block">Table Turnover Time</span>
                      <strong className="text-purple-700 font-black text-sm">~42 mins / session</strong>
                    </div>
                  </div>
                </div>

                {/* Top Selling Dishes & Channel Distribution */}
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                      <Sparkles size={16} className="text-amber-500" /> Top-Selling Dishes
                    </h3>
                    <span className="text-xs font-bold text-slate-500">By Volume & Sales</span>
                  </div>

                  {(() => {
                    const dishStats = {};
                    orders.forEach(o => {
                      (o.items || []).forEach(it => {
                        const name = it.name || it.itemName || 'Dish';
                        if (!dishStats[name]) dishStats[name] = { count: 0, revenue: 0 };
                        dishStats[name].count += (it.quantity || 1);
                        dishStats[name].revenue += (it.price || it.unitPrice || 120) * (it.quantity || 1);
                      });
                    });
                    const topDishes = Object.entries(dishStats).sort((a, b) => b[1].count - a[1].count).slice(0, 4);

                    return topDishes.length === 0 ? (
                      <p className="text-xs text-slate-400 italic py-6 text-center">Order data compiling for top dishes.</p>
                    ) : (
                      <div className="space-y-2">
                        {topDishes.map(([name, stat], idx) => (
                          <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                            <div className="flex items-center gap-2 truncate">
                              <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 font-black text-[10px] flex items-center justify-center">
                                #{idx + 1}
                              </span>
                              <span className="font-bold text-slate-800 truncate">{name}</span>
                            </div>
                            <div className="text-right whitespace-nowrap pl-2">
                              <span className="font-black text-slate-900 block">{stat.count} orders</span>
                              <span className="text-[10px] text-slate-400">₹{stat.revenue}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  {/* Channel Breakdown */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs font-bold">
                    <span className="text-slate-500">Channel Mix:</span>
                    <div className="flex items-center gap-3">
                      <span className="text-brand-600">🍽️ Dine-In ({orders.filter(o => o.source === 'DINE_IN_QR').length})</span>
                      <span className="text-emerald-600">🛵 Delivery ({orders.filter(o => o.source === 'DELIVERY').length})</span>
                      <span className="text-purple-600">🛍️ Takeaway ({orders.filter(o => o.source === 'TAKEAWAY').length})</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* MODULE 2: TABLE MANAGEMENT (Section 22) - Enhanced with Feature 4 Live Interactive Floor Map */}
          {activeModule === 'TABLES' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Floor Visual Grid / Interactive Map */}
              <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                      Restaurant Tables ({tables.length})
                    </h3>
                    {/* View Switcher: Grid vs Map */}
                    <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200 text-xs font-bold">
                      <button
                        onClick={() => setTableLayoutMode('MAP')}
                        className={`px-3 py-1 rounded-lg flex items-center gap-1.5 transition-all ${
                          tableLayoutMode === 'MAP'
                            ? 'bg-purple-600 text-white shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <Map size={14} /> Interactive Floor Map
                      </button>
                      <button
                        onClick={() => setTableLayoutMode('GRID')}
                        className={`px-3 py-1 rounded-lg flex items-center gap-1.5 transition-all ${
                          tableLayoutMode === 'GRID'
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <Grid size={14} /> Card Grid
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 text-[10px] font-bold">
                    <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">AVAILABLE</span>
                    <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800">OCCUPIED</span>
                    <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-800">RESERVED</span>
                    <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800">CLEANING</span>
                  </div>
                </div>

                {/* Seating Area Filter Pills */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">Area:</span>
                  {[
                    { id: 'ALL', name: 'All Areas' },
                    { id: 'everyday', name: 'Everyday Dining' },
                    { id: 'group', name: 'Group Dining' },
                    { id: 'family', name: 'Family Dining' },
                    { id: 'party', name: 'Party Hall' },
                    { id: 'outdoor', name: 'Outdoor / Patio' }
                  ].map(area => (
                    <button
                      key={area.id}
                      onClick={() => setSelectedDiningArea(area.id)}
                      className={`px-3 py-1 rounded-full font-bold whitespace-nowrap transition-colors ${
                        selectedDiningArea === area.id
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {area.name}
                    </button>
                  ))}
                </div>

                {/* Filtered tables based on area */}
                {(() => {
                  const areaFilteredTables = tables.filter(t =>
                    selectedDiningArea === 'ALL' || (t.diningArea || 'everyday').toLowerCase() === selectedDiningArea.toLowerCase()
                  );

                  if (tableLayoutMode === 'MAP') {
                    return (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs text-slate-500 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
                          <span className="flex items-center gap-1.5 font-semibold">
                            <Move size={14} className="text-purple-600" />
                            Drag and drop tables on the canvas below to adjust restaurant floor positioning.
                          </span>
                          <span className="text-[11px] text-slate-400">Auto-saves to database</span>
                        </div>

                        {/* Interactive Floor Canvas */}
                        <div
                          onDragOver={handleDragOver}
                          onDrop={handleDrop}
                          className="min-h-[580px] w-full relative bg-slate-50/70 rounded-2xl border-2 border-dashed border-slate-200 overflow-auto p-4 select-none"
                          style={{
                            backgroundImage: 'radial-gradient(circle, #cbd5e1 1px, transparent 1px)',
                            backgroundSize: '24px 24px'
                          }}
                        >
                          {areaFilteredTables.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-96 text-slate-400 text-sm">
                              <Map size={32} className="mb-2 text-slate-300" />
                              <p>No tables configured for {selectedDiningArea} dining area.</p>
                            </div>
                          ) : (
                            areaFilteredTables.map((t, index) => {
                              const isSelected = selectedTable?.tableId === t.tableId;
                              const defaultCol = index % 4;
                              const defaultRow = Math.floor(index / 4);
                              const x = t.positionX !== null && t.positionX !== undefined && t.positionX > 0 ? t.positionX : (30 + defaultCol * 165);
                              const y = t.positionY !== null && t.positionY !== undefined && t.positionY > 0 ? t.positionY : (30 + defaultRow * 145);

                              const shape = (t.shape || 'SQUARE').toUpperCase();
                              const isRound = shape === 'ROUND';
                              const isLong = shape === 'LONG' || shape === 'RECTANGLE';

                              // Real-time table indicators
                              const tableHelp = helpRequests.filter(h => (h.tableId === t.tableId || h.tableNumber === t.tableNumber) && h.status !== 'RESOLVED');
                              const tableOrders = orders.filter(o => (o.tableId === t.tableId || o.tableNumber === t.tableNumber) && o.status !== 'DELIVERED' && o.status !== 'CANCELLED');
                              const cookingOrders = tableOrders.filter(o => o.status === 'PREPARING' || o.status === 'IN_PROGRESS');
                              const readyOrders = tableOrders.filter(o => o.status === 'READY');
                              const unpaidTotal = orders
                                .filter(o => (o.tableId === t.tableId || o.tableNumber === t.tableNumber) && o.status !== 'CANCELLED' && o.paymentStatus !== 'PAID')
                                .reduce((acc, o) => acc + (o.total || 0), 0);

                              return (
                                <div
                                  key={t.tableId}
                                  draggable
                                  onDragStart={(e) => handleDragStart(e, t.tableId)}
                                  onClick={() => handleSelectTable(t)}
                                  style={{
                                    left: `${x}px`,
                                    top: `${y}px`,
                                    width: isLong ? '160px' : isRound ? '120px' : '125px',
                                    height: isLong ? '95px' : isRound ? '120px' : '110px'
                                  }}
                                  className={`absolute cursor-move transition-transform duration-75 p-2.5 flex flex-col justify-between shadow-sm border-2 ${
                                    isRound ? 'rounded-full text-center items-center justify-center' : 'rounded-2xl'
                                  } ${
                                    isSelected
                                      ? 'ring-4 ring-purple-600 shadow-xl z-20 scale-105'
                                      : 'hover:shadow-md hover:scale-102 z-10'
                                  } ${
                                    t.status === 'AVAILABLE'
                                      ? 'border-emerald-300 bg-emerald-50/90 text-emerald-900'
                                      : t.status === 'OCCUPIED'
                                      ? 'border-amber-400 bg-amber-50/95 text-amber-950'
                                      : t.status === 'RESERVED'
                                      ? 'border-purple-300 bg-purple-50/90 text-purple-900'
                                      : t.status === 'WAITING_FOR_CLEANING'
                                      ? 'border-blue-300 bg-blue-50/90 text-blue-900'
                                      : 'border-slate-300 bg-slate-100 text-slate-500'
                                  }`}
                                >
                                  {/* Real-time Assistance Request Indicator */}
                                  {tableHelp.length > 0 && (
                                    <span
                                      className="absolute -top-2.5 -right-2.5 px-2 py-0.5 bg-rose-600 text-white font-black text-[10px] rounded-full shadow-lg flex items-center gap-1 animate-bounce z-30"
                                      title={tableHelp[0].message || 'Assistance requested'}
                                    >
                                      🚨 {tableHelp[0].requestType || 'HELP'}
                                    </span>
                                  )}

                                  {/* Table Header: Title + Capacity */}
                                  <div className={`w-full flex items-center ${isRound ? 'justify-center flex-col' : 'justify-between'}`}>
                                    <span className="text-sm font-black tracking-tight">{tableTitle(t)}</span>
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white/80 shadow-xs">
                                      {t.capacity}p
                                    </span>
                                  </div>

                                  {/* Middle Guest / Status info */}
                                  {!isRound && (
                                    <div className="my-0.5 truncate text-[11px] font-semibold text-slate-700">
                                      {t.currentCustomerName || (
                                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                                          {t.status.replace('_', ' ')}
                                        </span>
                                      )}
                                    </div>
                                  )}

                                  {/* Live Operational Badges Footer */}
                                  <div className="w-full flex items-center justify-between gap-1 text-[9px] font-black">
                                    {readyOrders.length > 0 ? (
                                      <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white flex items-center gap-0.5 shadow-xs">
                                        <Bell size={10} /> Ready
                                      </span>
                                    ) : cookingOrders.length > 0 ? (
                                      <span className="px-1.5 py-0.5 rounded bg-amber-500 text-white flex items-center gap-0.5 shadow-xs">
                                        <ChefHat size={10} /> Cooking
                                      </span>
                                    ) : unpaidTotal > 0 && t.status === 'OCCUPIED' ? (
                                      <span className="px-1.5 py-0.5 rounded bg-slate-900 text-white">
                                        ₹{unpaidTotal}
                                      </span>
                                    ) : null}

                                    {t.assignedWaiterName && (
                                      <span className="truncate max-w-[55px] text-[9px] font-semibold text-slate-600 ml-auto bg-white/80 px-1 rounded">
                                        {t.assignedWaiterName}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    );
                  }

                  // Default / Card Grid View
                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {areaFilteredTables.map(t => {
                        const isSelected = selectedTable?.tableId === t.tableId;
                        const tableHelp = helpRequests.filter(h => (h.tableId === t.tableId || h.tableNumber === t.tableNumber) && h.status !== 'RESOLVED');
                        const tableOrders = orders.filter(o => (o.tableId === t.tableId || o.tableNumber === t.tableNumber) && o.status !== 'DELIVERED' && o.status !== 'CANCELLED');
                        const readyOrders = tableOrders.filter(o => o.status === 'READY');
                        const unpaidTotal = orders
                          .filter(o => (o.tableId === t.tableId || o.tableNumber === t.tableNumber) && o.status !== 'CANCELLED' && o.paymentStatus !== 'PAID')
                          .reduce((acc, o) => acc + (o.total || 0), 0);

                        return (
                          <div
                            key={t.tableId}
                            onClick={() => handleSelectTable(t)}
                            className={`p-4 rounded-2xl border-2 cursor-pointer transition-all relative ${
                              isSelected ? 'ring-2 ring-purple-600 shadow-lg' : ''
                            } ${
                              t.status === 'AVAILABLE' ? 'border-emerald-300 bg-emerald-50/50' :
                              t.status === 'OCCUPIED' ? 'border-amber-300 bg-amber-50/50' :
                              t.status === 'RESERVED' ? 'border-purple-300 bg-purple-50/50' :
                              t.status === 'WAITING_FOR_CLEANING' ? 'border-blue-300 bg-blue-50/50' :
                              'border-slate-300 bg-slate-100 opacity-60'
                            }`}
                          >
                            {tableHelp.length > 0 && (
                              <span className="absolute -top-2 -right-2 px-2 py-0.5 bg-rose-600 text-white font-black text-[10px] rounded-full shadow-md animate-bounce">
                                🚨 {tableHelp[0].requestType || 'HELP'}
                              </span>
                            )}
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-base font-black text-slate-900">{tableTitle(t)}</span>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white shadow-sm">
                                {t.capacity} Seats
                              </span>
                            </div>

                            <p className="text-xs font-bold text-slate-700 truncate">
                              {t.currentCustomerName || 'No guest'}
                            </p>
                            <div className="flex items-center justify-between mt-1 text-[11px] font-bold">
                              <span className="uppercase text-slate-500">
                                {t.status.replace('_', ' ')}
                              </span>
                              {readyOrders.length > 0 ? (
                                <span className="text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">🔔 Ready</span>
                              ) : unpaidTotal > 0 && t.status === 'OCCUPIED' ? (
                                <span className="text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded">₹{unpaidTotal}</span>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* Table Inspector Drawer */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                  Table Details & Actions
                </h3>

                {selectedTable ? (
                  <div className="space-y-4 text-xs">
                    {/* Basic Info Card */}
                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
                      <div className="flex justify-between font-bold text-slate-900">
                        <span>Table Number:</span>
                        <span>{tableTitle(selectedTable)}</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Seating Capacity:</span>
                        <span>{selectedTable.capacity} persons</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Dining Area:</span>
                        <span className="capitalize font-semibold">{selectedTable.diningArea || 'Everyday'}</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Table Shape:</span>
                        <span className="capitalize font-semibold">{selectedTable.shape || 'Square'}</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Current Status:</span>
                        <strong className="uppercase">{selectedTable.status}</strong>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Current Guest:</span>
                        <span>{selectedTable.currentCustomerName || 'None'}</span>
                      </div>
                    </div>

                    {/* Shared Dining Session Info */}
                    <div className="bg-purple-50/70 p-3.5 rounded-xl border border-purple-200 space-y-1.5">
                      <div className="flex items-center justify-between font-bold text-purple-900">
                        <span className="flex items-center gap-1.5">
                          <Users size={14} /> Dining Session
                        </span>
                        <span className="font-mono text-[11px] bg-purple-200 px-2 py-0.5 rounded">
                          {activeTableSession?.sessionCode ? `#${activeTableSession.sessionCode}` : 'INACTIVE'}
                        </span>
                      </div>
                      <p className="text-[11px] text-purple-700">
                        {activeTableSession?.status === 'ACTIVE'
                          ? `Active session with ${activeTableSession.activeDinersCount || 1} participant(s). Multi-user ordering synchronized.`
                          : 'No active session. Customer scanning the table QR code will initiate a shared session.'}
                      </p>
                    </div>

                    {/* Active Service Requests */}
                    {(() => {
                      const activeHelp = helpRequests.filter(h => (h.tableId === selectedTable.tableId || h.tableNumber === selectedTable.tableNumber) && h.status !== 'RESOLVED');
                      return (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between font-bold text-slate-700">
                            <span className="flex items-center gap-1.5">
                              <AlertCircle size={14} className={activeHelp.length > 0 ? 'text-rose-600' : 'text-slate-400'} />
                              Active Service Requests ({activeHelp.length})
                            </span>
                          </div>
                          {activeHelp.length === 0 ? (
                            <p className="text-[11px] text-slate-400 italic">No pending requests for this table.</p>
                          ) : (
                            <div className="space-y-1.5">
                              {activeHelp.map(req => (
                                <div key={req.requestId} className="flex items-center justify-between bg-rose-50 border border-rose-200 p-2 rounded-lg text-rose-900">
                                  <div>
                                    <span className="font-bold text-xs">{req.requestType || 'HELP'}: </span>
                                    <span className="text-[11px]">{req.message || 'Assistance requested'}</span>
                                  </div>
                                  {req.message?.toLowerCase().includes('cleaning') || req.message?.toLowerCase().includes('auto-release') ? (
                                    <span className="px-2 py-0.5 bg-sky-100 text-sky-800 text-[10px] font-bold rounded">
                                      Auto-cleaning
                                    </span>
                                  ) : req.status === 'PENDING' ? (
                                    <button
                                      onClick={() => handleAcceptHelp(req.requestId)}
                                      className="px-2.5 py-1 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded text-[10px]"
                                    >
                                      Accept request
                                    </button>
                                  ) : (
                                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded">
                                      Accepted
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Kitchen Progress & Order Items */}
                    {(() => {
                      const tableOrders = orders.filter(o => (o.tableId === selectedTable.tableId || o.tableNumber === selectedTable.tableNumber) && o.status !== 'CANCELLED');
                      const activeTableOrders = tableOrders.filter(o => o.status !== 'DELIVERED');
                      const pendingBillAmount = tableOrders.filter(o => o.paymentStatus !== 'PAID').reduce((sum, o) => sum + (o.total || 0), 0);

                      return (
                        <div className="space-y-2 pt-1 border-t border-slate-100">
                          <div className="flex items-center justify-between font-bold text-slate-700">
                            <span className="flex items-center gap-1.5">
                              <ChefHat size={14} className="text-amber-600" />
                              Kitchen Tickets & Progress ({activeTableOrders.length})
                            </span>
                            <span className="text-slate-900 font-black">Due: ₹{pendingBillAmount}</span>
                          </div>

                          {activeTableOrders.length === 0 ? (
                            <p className="text-[11px] text-slate-400 italic">No active food orders in preparation.</p>
                          ) : (
                            <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                              {activeTableOrders.map(ord => (
                                <div key={ord.orderId} className="bg-slate-50 p-2 rounded-lg border border-slate-200 space-y-1">
                                  <div className="flex items-center justify-between text-[11px]">
                                    <span className="font-bold text-slate-800">{ord.orderNumber}</span>
                                    <span className={`px-1.5 py-0.5 rounded font-black text-[9px] ${
                                      ord.status === 'READY' ? 'bg-emerald-100 text-emerald-800' :
                                      ord.status === 'PREPARING' ? 'bg-amber-100 text-amber-800' :
                                      'bg-slate-200 text-slate-700'
                                    }`}>
                                      {ord.status}
                                    </span>
                                  </div>
                                  <div className="text-[10px] text-slate-600">
                                    {(ord.items || []).map(i => `${i.name} (x${i.quantity})`).join(', ')}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Waiter Assignment Dropdown */}
                    <div className="space-y-1 pt-1 border-t border-slate-100">
                      <label className="font-bold text-slate-700 flex items-center justify-between">
                        <span>Assigned Waiter:</span>
                        <span className="text-[11px] text-purple-700 font-semibold">{selectedTable.assignedWaiterName || 'Unassigned'}</span>
                      </label>
                      <select
                        value={selectedTable.assignedWaiterId || ''}
                        onChange={(e) => handleAssignWaiter(selectedTable.tableId, e.target.value)}
                        className="w-full text-xs p-2 rounded-xl border border-slate-300 bg-white font-semibold focus:outline-purple-600"
                      >
                        <option value="">-- Unassigned (None) --</option>
                        {waiters.map(w => (
                          <option key={w.userId} value={w.userId}>
                            {w.name} ({w.email || w.phone || 'Staff'})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Table Shape & Dining Area Configuration */}
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      <p className="font-bold text-slate-700">Table Shape & Area:</p>
                      <div className="grid grid-cols-3 gap-1.5 text-center">
                        {['SQUARE', 'ROUND', 'LONG'].map(sh => (
                          <button
                            key={sh}
                            type="button"
                            onClick={() => handleUpdateTableShapeAndArea(selectedTable.tableId, sh, selectedTable.diningArea)}
                            className={`py-1 px-2 rounded-lg font-bold border text-[11px] ${
                              (selectedTable.shape || 'SQUARE').toUpperCase() === sh
                                ? 'bg-purple-600 text-white border-purple-600'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {sh}
                          </button>
                        ))}
                      </div>
                      <select
                        value={selectedTable.diningArea || 'everyday'}
                        onChange={(e) => handleUpdateTableShapeAndArea(selectedTable.tableId, selectedTable.shape, e.target.value)}
                        className="w-full text-xs p-2 rounded-xl border border-slate-300 bg-white font-semibold"
                      >
                        <option value="everyday">Everyday Dining</option>
                        <option value="group">Group Dining</option>
                        <option value="family">Family Dining</option>
                        <option value="party">Party Hall</option>
                        <option value="outdoor">Outdoor / Patio</option>
                      </select>
                    </div>

                    {/* Change Status Buttons */}
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      <p className="font-bold text-slate-700">Set Table Status:</p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => handleUpdateTableStatus(selectedTable.tableId, 'AVAILABLE', null)}
                          className="py-2 px-3 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-300 font-bold hover:bg-emerald-100"
                        >
                          AVAILABLE
                        </button>
                        <button
                          onClick={() => handleUpdateTableStatus(selectedTable.tableId, 'OCCUPIED')}
                          className="py-2 px-3 rounded-xl bg-amber-50 text-amber-700 border border-amber-300 font-bold hover:bg-amber-100"
                        >
                          OCCUPIED
                        </button>
                        <button
                          onClick={() => handleUpdateTableStatus(selectedTable.tableId, 'RESERVED')}
                          className="py-2 px-3 rounded-xl bg-purple-50 text-purple-700 border border-purple-300 font-bold hover:bg-purple-100"
                        >
                          RESERVED
                        </button>
                        <button
                          onClick={() => handleUpdateTableStatus(selectedTable.tableId, 'WAITING_FOR_CLEANING')}
                          className="py-2 px-3 rounded-xl bg-blue-50 text-blue-700 border border-blue-300 font-bold hover:bg-blue-100"
                        >
                          CLEANING
                        </button>
                      </div>

                      {/* Trigger Checkout (Section 28) */}
                      {selectedTable.status === 'OCCUPIED' && (
                        <button
                          onClick={() => handleProcessCheckout(selectedTable)}
                          className="w-full mt-2 py-3 px-4 rounded-xl bg-slate-900 hover:bg-black text-white font-bold shadow-md shadow-slate-900/20"
                        >
                          Process Checkout & Clear
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="py-12 text-center text-slate-400">
                    <Grid className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <p className="text-xs">Click any table to inspect or update</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* MODULE: WALK-IN WAITLIST (Phase 2) */}
          {activeModule === 'WAITLIST' && (
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                    Walk-in Waitlist & Table Queue ({waitlist.filter(w => w.status === 'WAITING').length} waiting)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Smart wait estimator based on party size, cleaning turnover, and live floor occupancy.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      fetchWaitEstimate(2);
                      setIsAddWalkInOpen(true);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-md shadow-purple-600/20 flex items-center gap-1.5"
                  >
                    <Plus size={14} /> Add Walk-In Guest
                  </button>
                </div>
              </div>

              {/* Dynamic Wait Estimate Panel */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center font-bold">
                    <Clock size={20} />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-slate-900 uppercase">Live Wait Estimation</h4>
                    <p className="text-[11px] text-slate-600">
                      {waitEstimate ? waitEstimate.message : 'Select a party size to see estimated wait range'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    {[2, 4, 6, 8].map(sz => (
                      <button
                        key={sz}
                        type="button"
                        onClick={() => fetchWaitEstimate(sz)}
                        className="px-2.5 py-1 rounded-lg text-xs font-bold border border-purple-200 bg-white hover:bg-purple-100 text-purple-900"
                      >
                        {sz} Guests
                      </button>
                    ))}
                  </div>
                  {waitEstimate && (
                    <div className="px-3 py-1.5 rounded-xl bg-purple-600 text-white font-black text-sm">
                      ~{waitEstimate.estimatedWaitMinutesMin} - {waitEstimate.estimatedWaitMinutesMax} mins
                    </div>
                  )}
                </div>
              </div>

              {/* Waitlist Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-500 uppercase border-y border-slate-200">
                    <tr>
                      <th className="p-3">Customer</th>
                      <th className="p-3">Party Size</th>
                      <th className="p-3">Est. Wait</th>
                      <th className="p-3">Joined Queue</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {waitlist.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-slate-400">
                          No guests currently waiting on the walk-in waitlist.
                        </td>
                      </tr>
                    ) : (
                      waitlist.map(w => (
                        <tr key={w.waitlistId} className="hover:bg-slate-50">
                          <td className="p-3">
                            <p className="font-bold text-slate-900">{w.customerName}</p>
                            <p className="text-[11px] text-slate-500">{w.customerPhone}</p>
                            {w.notes && <p className="text-[10px] text-amber-700 italic">"{w.notes}"</p>}
                          </td>
                          <td className="p-3 font-bold">{w.partySize} guests</td>
                          <td className="p-3 font-semibold text-purple-700">~{w.estimatedWaitMinutes} mins</td>
                          <td className="p-3 text-slate-500">{new Date(w.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                              w.status === 'NOTIFIED' ? 'bg-amber-100 text-amber-800 animate-pulse' :
                              w.status === 'WAITING' ? 'bg-blue-100 text-blue-800' :
                              'bg-slate-100 text-slate-600'
                            }`}>
                              {w.status}
                            </span>
                          </td>
                          <td className="p-3 text-right space-x-1.5">
                            {w.status === 'WAITING' && (
                              <button
                                onClick={() => handleNotifyWaitlist(w.waitlistId)}
                                className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold"
                              >
                                Notify Guest 🔔
                              </button>
                            )}
                            {w.status !== 'SEATED' && (
                              <select
                                onChange={(e) => {
                                  if (e.target.value) handleSeatWaitlist(w.waitlistId, e.target.value);
                                }}
                                defaultValue=""
                                className="px-2 py-1 rounded-lg border border-slate-200 bg-emerald-50 text-emerald-800 font-bold"
                              >
                                <option value="" disabled>Seat Table...</option>
                                {tables.filter(t => t.status === 'AVAILABLE' && t.capacity >= w.partySize).map(t => (
                                  <option key={t.tableId} value={t.tableId}>{tableTitle(t)} (Cap {t.capacity})</option>
                                ))}
                              </select>
                            )}
                            <button
                              onClick={() => handleCancelWaitlist(w.waitlistId)}
                              className="px-2 py-1 rounded-lg text-slate-400 hover:text-rose-600"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* MODULE 3: RESERVATIONS (Section 23 & 24) */}
          {activeModule === 'RESERVATIONS' && (
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                  Table Bookings ({reservations.length})
                </h3>
                <span className="text-xs text-slate-500">Arrival Flow: Confirm → Arrived → Table Assigned → Seated</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-500 uppercase border-y border-slate-200">
                    <tr>
                      <th className="p-3">Booking ID</th>
                      <th className="p-3">Customer</th>
                      <th className="p-3">Date & Time</th>
                      <th className="p-3">Guests</th>
                      <th className="p-3">Table</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Customer Arrival Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reservations.map(r => (
                      <tr key={r.reservationId} className="hover:bg-slate-50">
                        <td className="p-3 font-mono font-bold text-purple-700">{r.bookingId}</td>
                        <td className="p-3">
                          <p className="font-bold text-slate-900">{r.customerName}</p>
                          <p className="text-[11px] text-slate-500">{r.customerPhone}</p>
                        </td>
                        <td className="p-3">
                          <p className="font-semibold">{r.reservationDate}</p>
                          <p className="text-slate-500">{r.reservationTimeFormatted || r.reservationTime}</p>
                        </td>
                        <td className="p-3 font-bold">{r.guestCount} guests</td>
                        <td className="p-3 font-bold text-brand-600">{r.tableNumber || r.tableId ? tableTitle(r) : 'Auto-assigned'}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                            r.status === 'CONFIRMED' ? 'bg-purple-100 text-purple-800' :
                            r.status === 'ARRIVED' ? 'bg-amber-100 text-amber-800' :
                            r.status === 'SEATED' ? 'bg-emerald-100 text-emerald-800' :
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {r.status}
                          </span>
                        </td>
                        <td className="p-3 text-right space-x-1.5">
                          <button
                            onClick={() => openPartyHallModal(r)}
                            className="px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold border border-indigo-200"
                            title="Party Hall / Event Plan & Timed Kitchen Prep Sheet"
                          >
                            🎉 Event Plan
                          </button>
                          {r.status === 'CONFIRMED' && (
                            <button
                              onClick={() => handleReservationArrived(r)}
                              className="px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-800 font-bold"
                            >
                              Mark Arrived
                            </button>
                          )}
                          {r.status === 'ARRIVED' && (
                            <button
                              onClick={() => handleReservationSeated(r)}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                            >
                              Seat at {tableTitle(r)}
                            </button>
                          )}
                          {r.status === 'SEATED' && (
                            <span className="text-[11px] text-emerald-600 font-bold">Dine-In Active</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* MODULE 4: ORDER MANAGEMENT (Section 27) */}
          {activeModule === 'ORDERS' && (
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center space-x-1.5 overflow-x-auto pb-1">
                  {['ALL', 'DINE_IN', 'DELIVERY', 'TAKEAWAY', 'ACTIVE', 'COMPLETED'].map(f => (
                    <button
                      key={f}
                      onClick={() => setOrderFilter(f)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                        orderFilter === f ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {f.replace('_', ' ')}
                    </button>
                  ))}
                </div>

                <div className="relative w-64">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search order #, table, customer..."
                    value={orderSearch}
                    onChange={(e) => setOrderSearch(e.target.value)}
                    className="w-full text-xs pl-8 pr-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-purple-500 outline-none"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-500 uppercase border-y border-slate-200">
                    <tr>
                      <th className="p-3">Order Number</th>
                      <th className="p-3">Source</th>
                      <th className="p-3">Table / Customer</th>
                      <th className="p-3">Items</th>
                      <th className="p-3">Amount</th>
                      <th className="p-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredOrders.map(o => (
                      <tr key={o.orderId} className="hover:bg-slate-50">
                        <td className="p-3 font-mono font-bold text-slate-900">#{o.orderNumber}</td>
                        <td className="p-3 font-bold uppercase text-slate-600">{o.source.replace('_', ' ')}</td>
                        <td className="p-3">
                          {o.tableNumber ? (
                            <strong className="text-brand-600 font-bold">{tableTitle(o)}</strong>
                          ) : (
                            <span>{o.customerName}</span>
                          )}
                        </td>
                        <td className="p-3 text-slate-600">
                          {o.items.map(i => `${i.name} (×${i.quantity})`).join(', ')}
                        </td>
                        <td className="p-3 font-black text-slate-900">₹{o.total.toFixed(2)}</td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-100 text-slate-800">
                            {o.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* MODULE 5: BILLING & PAYMENTS (Section 28) */}
          {activeModule === 'BILLING' && (
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                Billing & Checkout Hub
              </h3>
              <p className="text-xs text-slate-500">
                Checkout Flow: Bill Generated → Payment Received → Customer Checkout → Table Cleaning → Table Available
              </p>

              {/* Cash Collection Section (Phase 1 Requirement 2) */}
              {helpRequests.filter(h => h.status !== 'RESOLVED' && (h.message?.includes('Cash payment') || h.message?.includes('CASH'))).length > 0 && (
                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 space-y-2">
                  <h4 className="text-xs font-black text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                    💵 Pending Cash Collections ({helpRequests.filter(h => h.status !== 'RESOLVED' && (h.message?.includes('Cash payment') || h.message?.includes('CASH'))).length})
                  </h4>
                  <div className="space-y-2">
                    {helpRequests.filter(h => h.status !== 'RESOLVED' && (h.message?.includes('Cash payment') || h.message?.includes('CASH'))).map(hr => (
                      <div key={hr.requestId} className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-amber-200 text-xs">
                        <div>
                          <p className="font-bold text-slate-900">{hr.message}</p>
                          <p className="text-[10px] text-slate-500">Requested {new Date(hr.createdAt).toLocaleTimeString()}</p>
                        </div>
                        <button
                          onClick={() => handleConfirmCashPayment(hr)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
                        >
                          Confirm Cash Received ✓
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {tables.filter(t => t.status === 'OCCUPIED').map(tbl => (
                  <div key={tbl.tableId} className="p-4 rounded-2xl border-2 border-amber-200 bg-amber-50/40 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-base font-black text-slate-900">{tableTitle(tbl)}</span>
                      <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">Occupied</span>
                    </div>

                    <div className="text-xs text-slate-600 space-y-1 bg-white p-2.5 rounded-xl border border-slate-200">
                      <p>Guest: <strong>{tbl.currentCustomerName || 'Walk-in'}</strong></p>
                      <p>Current Tab: <strong>₹{tbl.currentOrderTotal ? tbl.currentOrderTotal.toFixed(2) : '785.40'}</strong></p>
                    </div>

                    <button
                      onClick={() => handleProcessCheckout(tbl)}
                      className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-all"
                    >
                      Collect Payment & Checkout
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* MODULE 6: CUSTOMER ISSUES & UNANSWERED REQUESTS (Section 25 & 26) */}
          {activeModule === 'ISSUES' && (
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-red-500" />
                <span>Customer Delivery Issues & Escalations ({issues.length})</span>
              </h3>

              {issues.length === 0 ? (
                <div className="py-12 text-center text-slate-400 space-y-1">
                  <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500" />
                  <p className="text-xs font-bold text-slate-700">No active customer issues reported</p>
                  <p className="text-[11px]">All table deliveries and help calls are running smoothly.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {issues.map(iss => (
                    <div key={iss.id} className="p-4 rounded-2xl border-2 border-red-300 bg-red-50/50 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-black text-red-900">
                          {iss.description}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-200 text-red-800">
                          {iss.status}
                        </span>
                      </div>

                      <div className="flex items-center space-x-2 pt-1">
                        <button
                          onClick={() => {
                            addToast(`Paging floor waiter for ${tableTitle(iss)}...`, 'info');
                          }}
                          className="px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-black"
                        >
                          <PhoneCall className="w-3.5 h-3.5 inline mr-1" />
                          Alert Waiter Kunal
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* MODULE 7: QR CODE MANAGEMENT (Section 29) */}
          {activeModule === 'QR_MGMT' && (
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div>
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                  Table QR Code Management
                </h3>
                <p className="text-xs text-slate-500">
                  Each QR code uniquely pairs Restaurant ID + Table ID. Download or print table cards.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {tables.map(tbl => {
                  const qrUrl = getTableQrUrl(null, tbl);
                  const qrImgSrc = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(qrUrl)}`;

                  return (
                    <div key={tbl.tableId} className="p-4 rounded-2xl border border-slate-200 bg-slate-50 text-center space-y-3">
                      <div className="w-32 h-32 bg-white p-2 rounded-xl border border-slate-200 mx-auto flex items-center justify-center shadow-sm overflow-hidden">
                        <LocalTableQrImage url={qrUrl} title={tableTitle(tbl)} />
                      </div>

                      <div>
                        <h4 className="text-sm font-black text-slate-900">{tableTitle(tbl)}</h4>
                        <p className="text-[10px] font-mono text-slate-500">{tbl.qrIdentifier}</p>
                      </div>

                      <div className="flex items-center justify-center space-x-2">
                        <button
                          onClick={() => window.print()}
                          className="p-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold"
                          title="Print QR"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                        <a
                          href={`/qr/a0000000-0000-0000-0000-000000000001/${tbl.tableId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2.5 py-1.5 rounded-xl bg-purple-600 text-white text-xs font-bold hover:bg-purple-700"
                        >
                          Open Menu
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* New Reservation Modal */}
      {isNewResModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl relative border border-slate-100 space-y-4">
            <button
              onClick={() => setIsNewResModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-slate-900">Create Table Reservation</h3>

            <form onSubmit={handleCreateReservation} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Customer Name</label>
                <input
                  type="text"
                  required
                  value={newResForm.customerName}
                  onChange={e => setNewResForm({ ...newResForm, customerName: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Phone</label>
                  <input
                    type="text"
                    required
                    value={newResForm.customerPhone}
                    onChange={e => setNewResForm({ ...newResForm, customerPhone: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Party Size</label>
                  <input
                    type="number"
                    min={1}
                    max={70}
                    value={newResForm.guestCount}
                    onChange={e => setNewResForm({ ...newResForm, guestCount: Number(e.target.value) })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={newResForm.reservationDate}
                    onChange={e => setNewResForm({ ...newResForm, reservationDate: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Time</label>
                  <select
                    value={newResForm.reservationTime}
                    onChange={e => setNewResForm({ ...newResForm, reservationTime: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="12:00">12:00 PM</option>
                    <option value="12:30">12:30 PM</option>
                    <option value="13:00">01:00 PM</option>
                    <option value="19:00">07:00 PM</option>
                    <option value="19:30">07:30 PM</option>
                    <option value="20:00">08:00 PM</option>
                    <option value="20:30">08:30 PM</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                className="w-full mt-3 py-3 px-4 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm shadow-md shadow-purple-600/20"
              >
                Confirm & Auto-Assign Table
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Add Walk-In Guest Modal (Phase 2) */}
      {isAddWalkInOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl relative border border-slate-100 space-y-4">
            <button
              onClick={() => setIsAddWalkInOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
                <Users size={18} />
              </div>
              <h3 className="text-base font-bold text-slate-900">Add Walk-in Party</h3>
            </div>

            <form onSubmit={handleAddWalkIn} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Customer Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Gupta"
                  value={walkInForm.customerName}
                  onChange={e => setWalkInForm({ ...walkInForm, customerName: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Mobile Phone *</label>
                  <input
                    type="tel"
                    required
                    placeholder="9876543210"
                    value={walkInForm.customerPhone}
                    onChange={e => setWalkInForm({ ...walkInForm, customerPhone: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Party Size</label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={walkInForm.partySize}
                    onChange={e => {
                      const sz = Number(e.target.value);
                      setWalkInForm({ ...walkInForm, partySize: sz });
                      fetchWaitEstimate(sz);
                    }}
                    className="w-full p-2.5 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              {waitEstimate && (
                <div className="p-2.5 rounded-xl bg-purple-50 border border-purple-200 text-purple-900 flex items-center justify-between">
                  <span className="font-medium">Estimated Wait:</span>
                  <span className="font-black text-sm">~{waitEstimate.estimatedWaitMinutesMin} - {waitEstimate.estimatedWaitMinutesMax} mins</span>
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Special Notes / Seating Preference</label>
                <input
                  type="text"
                  placeholder="e.g. Near window, high chair needed"
                  value={walkInForm.notes}
                  onChange={e => setWalkInForm({ ...walkInForm, notes: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <button
                type="submit"
                className="w-full mt-3 py-3 px-4 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm shadow-md shadow-purple-600/20"
              >
                Join Waitlist & Send Notification
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Party Hall Event Planning Modal (Phase 2) */}
      {partyHallModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl relative border border-slate-100 space-y-4 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setPartyHallModal(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                <Sparkles size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Party Hall Event Planner</h3>
                <p className="text-xs text-slate-500">Booking {partyHallModal.bookingId} · {partyHallModal.customerName}</p>
              </div>
            </div>

            <form onSubmit={handleSaveEventPlan} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Confirmed Headcount (up to 70)</label>
                  <input
                    type="number"
                    min={1}
                    max={70}
                    required
                    value={eventPlanForm.confirmedHeadcount}
                    onChange={e => setEventPlanForm({ ...eventPlanForm, confirmedHeadcount: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Estimated Total Cost (₹)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={eventPlanForm.estimatedTotalCost}
                    onChange={e => setEventPlanForm({ ...eventPlanForm, estimatedTotalCost: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Deposit Amount (₹)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={eventPlanForm.depositAmount}
                    onChange={e => setEventPlanForm({ ...eventPlanForm, depositAmount: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Deposit Paid (₹)</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={eventPlanForm.depositPaid}
                    onChange={e => setEventPlanForm({ ...eventPlanForm, depositPaid: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Financial Balance Summary */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex justify-between items-center text-xs">
                <span className="text-slate-600">Outstanding Balance to Collect:</span>
                <span className="font-black text-indigo-700 text-sm">
                  ₹{Math.max(0, Number(eventPlanForm.estimatedTotalCost || 0) - Number(eventPlanForm.depositPaid || 0)).toFixed(2)}
                </span>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Event Meal Choices (comma-separated dishes)</label>
                <textarea
                  rows={2}
                  value={eventPlanForm.mealChoices}
                  onChange={e => setEventPlanForm({ ...eventPlanForm, mealChoices: e.target.value })}
                  placeholder="e.g. Paneer Tikka, Dal Makhani, Butter Naan, Gulab Jamun"
                  className="w-full p-2.5 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 font-sans"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Dietary Requests / Allergies</label>
                <input
                  type="text"
                  placeholder="e.g. 5 Jain meals, 2 Nut-free, 1 Gluten-free"
                  value={eventPlanForm.dietaryRequests}
                  onChange={e => setEventPlanForm({ ...eventPlanForm, dietaryRequests: e.target.value })}
                  className="w-full p-2.5 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => handleViewPrepSheet(partyHallModal.reservationId)}
                  className="flex-1 py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold flex items-center justify-center gap-1.5"
                >
                  <ChefHat size={15} /> Kitchen Prep Sheet
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md shadow-indigo-600/20"
                >
                  Save Event Plan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Timed Kitchen Prep Sheet Modal (Phase 2) */}
      {prepSheetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl relative border border-slate-100 space-y-4 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setPrepSheetModal(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                <ChefHat size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Timed Kitchen Prep Sheet</h3>
                <p className="text-xs text-slate-500">Booking {prepSheetModal.bookingId} · {prepSheetModal.customerName} ({prepSheetModal.headcount} Guests)</p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Event Date & Time:</span>
                <span className="font-bold">{prepSheetModal.reservationDate} at {prepSheetModal.reservationTime}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Deposit Paid:</span>
                <span className="font-bold text-emerald-600">₹{prepSheetModal.depositPaid.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Outstanding Balance:</span>
                <span className="font-bold text-indigo-700">₹{prepSheetModal.outstandingBalance.toFixed(2)}</span>
              </div>
              {prepSheetModal.dietaryRequests && (
                <div className="flex justify-between pt-1 border-t border-slate-200">
                  <span className="text-slate-500">Dietary Notes:</span>
                  <span className="font-semibold text-amber-800">{prepSheetModal.dietaryRequests}</span>
                </div>
              )}
            </div>

            {/* Timed Staggered Prep Timeline */}
            <div className="space-y-2.5 text-xs">
              <h4 className="font-black text-slate-800 uppercase tracking-wider text-[11px]">
                Staggered Preparation Timeline
              </h4>
              <div className="space-y-2">
                {prepSheetModal.timeline.map((task, idx) => (
                  <div key={idx} className="p-3 rounded-xl border border-slate-200 bg-white flex items-start justify-between gap-3 shadow-2xs">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md text-[10px]">
                          {task.timeOffset}
                        </span>
                        <span className="font-bold text-slate-800 uppercase text-[11px]">{task.course}</span>
                        <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{task.station}</span>
                      </div>
                      <p className="text-slate-600 text-[11px] pt-0.5">{task.description}</p>
                    </div>
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                      {task.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => window.print()}
              className="w-full py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-black text-white font-bold text-xs flex items-center justify-center gap-1.5"
            >
              <Printer size={14} /> Print Kitchen Prep Sheet
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
