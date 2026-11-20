import React, { useState, useEffect } from 'react';
import { api, subscribeRealtimeEvents } from '../../services/api';
import { tableTitle } from '../../services/tablePresentation';
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
  X
} from 'lucide-react';

export default function ReceptionistDashboard() {
  const { addToast } = useNotification();
  const [activeModule, setActiveModule] = useState('DASHBOARD'); // DASHBOARD, TABLES, RESERVATIONS, ORDERS, BILLING, ISSUES, QR_MGMT
  const [tables, setTables] = useState([]);
  const [orders, setOrders] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [helpRequests, setHelpRequests] = useState([]);
  const [issues, setIssues] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [selectedOrderForBill, setSelectedOrderForBill] = useState(null);
  const [orderFilter, setOrderFilter] = useState('ALL');
  const [orderSearch, setOrderSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);

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
    }, 4000);

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
      loadData();
      if (selectedTable && selectedTable.tableId === tableId) {
        setSelectedTable(prev => prev ? { ...prev, status: nextStatus, currentCustomerName: customerName } : null);
      }
    } catch {
      addToast('Failed to update table status.', 'error');
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
      // Move table to cleaning
      await api.updateTableStatus(table.tableId, 'WAITING_FOR_CLEANING', null);
      addToast(`Payment received for ${tableTitle(table)}. Table marked WAITING_FOR_CLEANING.`, 'success');
      loadData();
      setSelectedTable(null);
    } catch {
      addToast('Failed to checkout table.', 'error');
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
            </div>
          )}

          {/* MODULE 2: TABLE MANAGEMENT (Section 22) */}
          {activeModule === 'TABLES' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Floor Visual Grid */}
              <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                    Restaurant Tables ({tables.length})
                  </h3>
                  <div className="flex flex-wrap gap-2 text-[10px] font-bold">
                    <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">AVAILABLE</span>
                    <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800">OCCUPIED</span>
                    <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-800">RESERVED</span>
                    <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800">CLEANING</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {tables.map(t => {
                    const isSelected = selectedTable?.tableId === t.tableId;
                    return (
                      <div
                        key={t.tableId}
                        onClick={() => setSelectedTable(t)}
                        className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                          isSelected ? 'ring-2 ring-purple-600 shadow-lg' : ''
                        } ${
                          t.status === 'AVAILABLE' ? 'border-emerald-300 bg-emerald-50/50' :
                          t.status === 'OCCUPIED' ? 'border-amber-300 bg-amber-50/50' :
                          t.status === 'RESERVED' ? 'border-purple-300 bg-purple-50/50' :
                          t.status === 'WAITING_FOR_CLEANING' ? 'border-blue-300 bg-blue-50/50' :
                          'border-slate-300 bg-slate-100 opacity-60'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-base font-black text-slate-900">{tableTitle(t)}</span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white shadow-sm">
                            {t.capacity} Seats
                          </span>
                        </div>

                        <p className="text-xs font-bold text-slate-700 truncate">
                          {t.currentCustomerName || 'No guest'}
                        </p>
                        <p className="text-[11px] font-bold uppercase mt-1 text-slate-500">
                          {t.status.replace('_', ' ')}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Table Inspector Drawer */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                  Table Details & Actions
                </h3>

                {selectedTable ? (
                  <div className="space-y-4 text-xs">
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
                        <span>Current Status:</span>
                        <strong className="uppercase">{selectedTable.status}</strong>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Current Guest:</span>
                        <span>{selectedTable.currentCustomerName || 'None'}</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>Assigned Waiter:</span>
                        <span>{selectedTable.assignedWaiterName || 'Unassigned'}</span>
                      </div>
                    </div>

                    {/* Change Status Buttons */}
                    <div className="space-y-2 pt-2">
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
                        <button
                          onClick={() => {
                            setIssues(prev => prev.filter(i => i.id !== iss.id));
                            addToast('Issue resolved and marked completed.', 'success');
                          }}
                          className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700"
                        >
                          Resolve Issue
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
                  const qrUrl = typeof window !== 'undefined'
                    ? `${window.location.origin}/qr/a0000000-0000-0000-0000-000000000001/${tbl.tableId}`
                    : `/qr/a0000000-0000-0000-0000-000000000001/${tbl.tableId}`;
                  const qrImgSrc = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(qrUrl)}`;

                  return (
                    <div key={tbl.tableId} className="p-4 rounded-2xl border border-slate-200 bg-slate-50 text-center space-y-3">
                      <div className="w-32 h-32 bg-white p-2 rounded-xl border border-slate-200 mx-auto flex items-center justify-center shadow-sm overflow-hidden">
                        <img
                          src={qrImgSrc}
                          alt={`QR Code for ${tableTitle(tbl)}`}
                          className="w-full h-full object-contain"
                          loading="lazy"
                        />
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
    </div>
  );
}
