import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, subscribeRealtimeEvents } from '../../services/api';
import { tableTitle } from '../../services/tablePresentation';
import { useCart } from '../../context/CartContext';
import { useNotification } from '../../context/NotificationContext';
import CustomerHelpModal from '../../components/common/CustomerHelpModal';
import OrderReceiptModal from '../../components/common/OrderReceiptModal';
import ItemCustomizationModal from '../../components/common/ItemCustomizationModal';
import CartDrawer from '../../components/common/CartDrawer';
import {
  Utensils,
  ShoppingBag,
  HelpCircle,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  ChefHat,
  Search,
  Flame,
  Candy,
  Check,
  ChevronRight,
  Sparkles,
  RefreshCw
} from 'lucide-react';

export default function QrDineInPage() {
  const { restaurantId, tableId } = useParams();
  const { addToast } = useNotification();
  const { items, addItem, itemCount, total, clearCart, setTableInfo, setOrderSource, switchOrderContext } = useCart();

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isPlacing, setIsPlacing] = useState(false);
  const placingRef = useRef(false);
  const loadSequence = useRef(0);
  const activeOrderRef = useRef(null);
  const promptedOrders = useRef(new Set());
  const [restaurant, setRestaurant] = useState(null);
  const [table, setTable] = useState(null);
  const [categories, setCategories] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [activeCategory, setActiveCategory] = useState('ALL');
  const [vegFilter, setVegFilter] = useState('ALL'); // ALL, VEG, NON_VEG
  const [searchQuery, setSearchQuery] = useState('');

  // Modals & Drawers
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [selectedItemForModal, setSelectedItemForModal] = useState(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);

  // Active Placed Order & 1-Minute Cancellation Timer
  const [activeOrder, setActiveOrder] = useState(null);
  const [cancelSecondsRemaining, setCancelSecondsRemaining] = useState(0);
  const [isCancelling, setIsCancelling] = useState(false);
  const [waiterArrivingMsg, setWaiterArrivingMsg] = useState(null);

  useEffect(() => { activeOrderRef.current = activeOrder; }, [activeOrder]);
  const updateActiveOrder = useCallback(order => {
    setActiveOrder(order);
    activeOrderRef.current = order;
    if (order?.status === 'PENDING_CONFIRMATION') {
      const promptKey = `${order.orderId}:${order.confirmationRequestedAt || ''}`;
      if (!promptedOrders.current.has(promptKey)) {
        promptedOrders.current.add(promptKey);
        setIsReceiptModalOpen(true);
      }
    } else setIsReceiptModalOpen(false);
  }, []);

  // A QR link must identify this restaurant and an actual enabled table.
  const loadData = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setIsLoading(true); setLoadError(''); setTable(null); updateActiveOrder(null); setWaiterArrivingMsg(null);
    try {
      const rest = await api.getRestaurant();
      if (String(rest.restaurantId).toLowerCase() !== String(restaurantId).toLowerCase()) throw new Error('This QR code does not belong to this restaurant. Please scan the code on your table.');
      const currentTable = await api.getTableById(tableId);
      if (!currentTable || String(currentTable.restaurantId).toLowerCase() !== String(rest.restaurantId).toLowerCase()) throw new Error('This table could not be verified. Please scan the QR code on your table again.');
      if (currentTable.status === 'OUT_OF_SERVICE') throw new Error('This table is currently out of service. Please ask our team for assistance.');
      const [cats, itemsList, orders] = await Promise.all([api.getCategories(), api.getMenuItems(), api.getOrders()]);
      if (sequence !== loadSequence.current) return;
      setRestaurant(rest); setTable(currentTable); setCategories(cats); setMenuItems(itemsList);
      const context = { tableId: currentTable.tableId, tableNumber: currentTable.tableNumber, restaurantId: rest.restaurantId };
      if (switchOrderContext) switchOrderContext('DINE_IN_QR', context);
      else { setOrderSource('DINE_IN_QR'); setTableInfo(context); }
      updateActiveOrder(orders.find(order => order.source === 'DINE_IN_QR' && order.tableId === currentTable.tableId && order.restaurantId === rest.restaurantId && !['DELIVERED', 'CANCELLED'].includes(order.status)) || null);
    } catch (err) { if (sequence === loadSequence.current) setLoadError(err.message || 'Unable to open the table menu. Please try again.'); }
    finally { if (sequence === loadSequence.current) setIsLoading(false); }
  }, [restaurantId, tableId, switchOrderContext, updateActiveOrder]);
  useEffect(() => { loadData(); return () => { loadSequence.current += 1; }; }, [loadData]);

  useEffect(() => {
    if (!table) return;
    let active = true;
    const refreshOrder = async () => {
      try {
        const current = activeOrderRef.current;
        if (!current) return;
        const latest = await api.getOrderById(current.orderId);
        if (active && latest) updateActiveOrder(latest);
      } catch { /* The existing ticket stays visible during a brief reconnect. */ }
    };
    const unsub = subscribeRealtimeEvents((type, payload) => {
      if (type === 'ORDER_STATUS_CHANGED' && payload.orderId === activeOrderRef.current?.orderId && payload.order) updateActiveOrder(payload.order);
      if (type === 'WAITER_HELP_ACCEPTED' && payload.tableId === table.tableId) setWaiterArrivingMsg(`The waiter ${payload.waiterName || payload.assignedWaiterName || ''} is coming.`);
      if (type === 'HELP_REQUEST_RESOLVED' && payload.tableId === table.tableId) setWaiterArrivingMsg(null);
      if (type === 'FOOD_AVAILABILITY_CHANGED') setMenuItems(previous => previous.map(item => item.menuItemId === payload.menuItemId ? { ...item, availability: payload.availability } : item));
    });
    const timer = setInterval(refreshOrder, 4000);
    return () => { active = false; unsub(); clearInterval(timer); };
  }, [table, updateActiveOrder]);

  // 1-minute cancellation timer countdown (Section 5)
  useEffect(() => {
    if (!activeOrder || activeOrder.status !== 'NEW') {
      setCancelSecondsRemaining(0);
      return;
    }

    const elapsed = (Date.now() - new Date(activeOrder.createdAt).getTime()) / 1000;
    const remaining = Math.max(0, 60 - Math.floor(elapsed));
    setCancelSecondsRemaining(remaining);

    if (remaining <= 0) return;

    const interval = setInterval(() => {
      setCancelSecondsRemaining(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [activeOrder]);

  // Place Order Action
  const handlePlaceOrder = async () => {
    if (!items.length || !table || !restaurant || placingRef.current) return;
    placingRef.current = true; setIsPlacing(true);
    try {
      const order = await api.createOrder({
        restaurantId: restaurant?.restaurantId,
        tableId: table?.tableId,
        tableNumber: table?.tableNumber,
        source: 'DINE_IN_QR',
        items
      });
      updateActiveOrder(order);
      clearCart();
      setIsCartOpen(false);
      addToast(`Order #${order.orderNumber} placed successfully! Kitchen has been notified.`, 'success');
    } catch (err) {
      addToast(err.message, 'error');
    } finally { placingRef.current = false; setIsPlacing(false); }
  };

  // Cancel Order Action (Backend strictly enforces 1-min window)
  const handleCancelOrder = async () => {
    if (!activeOrder) return;
    setIsCancelling(true);
    try {
      await api.cancelOrder(activeOrder.orderId, 'Customer cancelled within 1 min');
      addToast('Order cancelled successfully.', 'info');
      updateActiveOrder(null);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setIsCancelling(false);
    }
  };

  // Filtered Menu Items
  const filteredItems = menuItems.filter(item => {
    const matchesCat = activeCategory === 'ALL' || item.categoryId === activeCategory;
    const matchesVeg = vegFilter === 'ALL' || item.vegNonveg === vegFilter;
    const matchesSearch = !searchQuery || item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (item.description || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesVeg && matchesSearch;
  });

  if (isLoading || loadError) return <main className="min-h-screen bg-[#f7f8fb] flex items-center justify-center px-6 py-12 text-center"><div className="max-w-sm w-full bg-white border border-slate-200 rounded-2xl p-8"><div className="w-14 h-14 mx-auto mb-5 rounded-xl bg-blue-50 text-blue-500 flex items-center justify-center">{isLoading ? <RefreshCw className="animate-spin" size={24} /> : <AlertCircle size={26} />}</div><h1 className="text-xl font-semibold text-slate-900">{isLoading ? 'Opening your table menu…' : 'We couldn’t verify this table'}</h1><p className="text-sm text-slate-500 leading-6 mt-3">{isLoading ? 'Checking your table and today’s menu.' : loadError}</p>{!isLoading && <><button onClick={loadData} className="btn-3d-crimson mt-6 w-full py-3 rounded-xl text-white text-sm font-semibold">Try again</button><a href="/" className="block text-xs text-slate-500 mt-5">Visit the restaurant website</a></>}</div></main>;

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      {/* 1. Mobile-First Dedicated QR Menu Header (Section 4) */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <img
              src={restaurant.logo || '/favicon.svg'}
              alt={restaurant?.name}
              className="w-10 h-10 rounded-xl object-cover shadow-sm ring-2 ring-brand-100"
            />
            <div>
              <h1 className="text-sm font-black text-slate-900 leading-tight">
                {restaurant.name}
              </h1>
              <div className="flex items-center space-x-1.5 mt-0.5">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-black bg-brand-500 text-white shadow-sm">
                  {tableTitle(table)}
                </span>
                <span className="text-[11px] text-slate-500">Dine-In Menu</span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Help Button in Upper Right Corner (Section 7) */}
            <button
              onClick={() => setIsHelpOpen(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-md shadow-amber-500/20 active:scale-95 transition-all"
              title="Call Waiter"
            >
              <HelpCircle className="w-4 h-4" />
              <span>Help</span>
            </button>

            {/* Cart Trigger */}
            <button
              onClick={() => setIsCartOpen(true)}
              className="relative p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 transition-colors"
              aria-label="View Cart"
            >
              <ShoppingBag className="w-5 h-5" />
              {itemCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-brand-500 text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center animate-soft-pulse">
                  {itemCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Waiter Arriving Alert Banner (Section 7) */}
        {waiterArrivingMsg && (
          <div className="bg-emerald-600 text-white px-4 py-2 text-xs font-bold flex items-center justify-between shadow-inner animate-slide-in">
            <div className="flex items-center space-x-2">
              <Check className="w-4 h-4" />
              <span>{waiterArrivingMsg}</span>
            </div>
            <button aria-label="Dismiss waiter update" onClick={() => setWaiterArrivingMsg(null)} className="text-white/80 hover:text-white">
              <XCircle className="w-4 h-4" />
            </button>
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main className="max-w-2xl mx-auto px-4 pt-4 space-y-4">
        {/* Active Order Status Card with 1-Min Cancellation (Section 5 & 6) */}
        {activeOrder && (
          <div className="p-4 rounded-2xl bg-white border border-brand-200 shadow-md shadow-brand-500/5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <ChefHat className="w-5 h-5 text-brand-500 animate-bounce" />
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Live Order Status #{activeOrder.orderNumber}
                </span>
              </div>
              <span className={`text-[11px] font-black px-2.5 py-1 rounded-full ${
                activeOrder.status === 'NEW' ? 'bg-blue-100 text-blue-700' :
                activeOrder.status === 'ACCEPTED' || activeOrder.status === 'PREPARING' ? 'bg-amber-100 text-amber-800' :
                activeOrder.status === 'READY' ? 'bg-purple-100 text-purple-800' :
                activeOrder.status === 'PENDING_CONFIRMATION' ? 'bg-rose-100 text-rose-800' :
                'bg-emerald-100 text-emerald-800'
              }`}>
                {activeOrder.status.replaceAll('_', ' ')}
              </span>
            </div>

            {/* Stepper Visualization (Section 6) */}
            <div className="grid grid-cols-4 gap-1 text-center text-[10px] font-semibold text-slate-400 pt-1">
              <div className={`p-1.5 rounded-lg border ${
                activeOrder.status === 'NEW' ? 'bg-blue-50 border-blue-300 text-blue-700 font-bold' : 'border-slate-200 text-slate-500'
              }`}>
                1. Placed
              </div>
              <div className={`p-1.5 rounded-lg border ${
                activeOrder.status === 'ACCEPTED' || activeOrder.status === 'PREPARING' ? 'bg-amber-50 border-amber-300 text-amber-700 font-bold' : 'border-slate-200 text-slate-500'
              }`}>
                2. Cooking
              </div>
              <div className={`p-1.5 rounded-lg border ${
                activeOrder.status === 'READY' ? 'bg-purple-50 border-purple-300 text-purple-700 font-bold' : 'border-slate-200 text-slate-500'
              }`}>
                3. Ready
              </div>
              <div className={`p-1.5 rounded-lg border ${
                activeOrder.status === 'DELIVERED' ? 'bg-emerald-50 border-emerald-300 text-emerald-700 font-bold' : 'border-slate-200 text-slate-500'
              }`}>
                4. Served
              </div>
            </div>

            {/* 1-Minute Cancellation Countdown Window (Section 5) */}
            {activeOrder.status === 'NEW' && (
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs">
                <div className="flex items-center space-x-1.5 text-red-700">
                  <Clock className="w-4 h-4 text-red-500 animate-spin" />
                  <span>
                    Can cancel for: <strong>{cancelSecondsRemaining}s</strong>
                  </span>
                </div>
                {cancelSecondsRemaining > 0 ? (
                  <button
                    onClick={handleCancelOrder}
                    disabled={isCancelling}
                    className="px-3 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-xs transition-colors"
                  >
                    {isCancelling ? 'Cancelling...' : 'Cancel Order'}
                  </button>
                ) : (
                  <span className="text-[11px] text-slate-400 font-medium">Window closed</span>
                )}
              </div>
            )}

            {/* Prompt for Confirmation if READY or PENDING_CONFIRMATION */}
            {activeOrder.status === 'CONFIRMATION_TIMEOUT' && <p className="text-xs text-amber-700 bg-amber-50 p-3 rounded-lg">The confirmation window has closed. Our front desk is checking that your order reached you.</p>}
            {activeOrder.status === 'CANCELLED' && <p className="text-xs text-red-700 bg-red-50 p-3 rounded-lg">{activeOrder.rejectionReason || activeOrder.cancellationReason || 'This order was cancelled.'}</p>}
            {activeOrder.status === 'PENDING_CONFIRMATION' && (
              <button
                onClick={() => setIsReceiptModalOpen(true)}
                className="w-full py-2 px-3 rounded-xl bg-brand-500 text-white font-bold text-xs flex items-center justify-center space-x-1 shadow-sm"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirm Food Received (Tap Here)</span>
              </button>
            )}
          </div>
        )}

        {isPlacing && <div role="status" className="p-3 rounded-xl border border-blue-100 bg-blue-50 text-blue-700 text-xs">Sending your order to the kitchen…</div>}

        {/* Search & Filters */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              aria-label="Search table menu"
              placeholder="Search dishes (e.g. Pizza, Dosa, Burger)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs pl-9 pr-4 py-2.5 rounded-2xl border border-slate-200 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          {/* Veg / Non-Veg Filters */}
          <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1">
            <div className="flex items-center space-x-1.5 bg-slate-200/60 p-1 rounded-xl">
              <button
                onClick={() => setVegFilter('ALL')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  vegFilter === 'ALL' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setVegFilter('VEG')}
                className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center space-x-1 transition-all ${
                  vegFilter === 'VEG' ? 'bg-emerald-600 text-white shadow-sm' : 'text-emerald-700'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-emerald-300" />
                <span>Pure Veg</span>
              </button>
              <button
                onClick={() => setVegFilter('NON_VEG')}
                className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center space-x-1 transition-all ${
                  vegFilter === 'NON_VEG' ? 'bg-rose-600 text-white shadow-sm' : 'text-rose-700'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-rose-300" />
                <span>Non-Veg</span>
              </button>
            </div>
          </div>

          {/* Horizontal Category Pill Scroll */}
          <div className="flex items-center space-x-2 overflow-x-auto no-scrollbar py-1">
            <button
              onClick={() => setActiveCategory('ALL')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                activeCategory === 'ALL'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              All Items
            </button>
            {categories.map((cat) => (
              <button
                key={cat.categoryId}
                onClick={() => setActiveCategory(cat.categoryId)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center space-x-1.5 ${
                  activeCategory === cat.categoryId
                    ? 'bg-brand-500 text-white shadow-sm shadow-brand-500/20'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span>{cat.icon}</span>
                <span>{cat.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Food Item Grid (Section 4) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          {filteredItems.length === 0 ? (
            <div className="col-span-full py-12 text-center text-slate-400">
              <Utensils className="w-12 h-12 mx-auto mb-2 text-slate-300" />
              <p className="text-sm font-bold text-slate-600">No dishes found</p>
              <p className="text-xs text-slate-400">Try adjusting your filters or search keywords.</p>
            </div>
          ) : (
            filteredItems.map((item) => (
              <div
                key={item.menuItemId}
                className={`bg-white rounded-2xl border p-3 flex gap-3 shadow-sm transition-all hover:shadow-md ${
                  !item.availability ? 'opacity-60 bg-slate-50/80 border-slate-200' : 'border-slate-200/80'
                }`}
              >
                {/* Image */}
                <div className="relative w-24 h-24 rounded-xl overflow-hidden bg-slate-100 flex-shrink-0">
                  <img
                    src={item.image}
                    alt={item.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {!item.availability && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center p-1 text-center">
                      <span className="text-[10px] font-black text-white uppercase tracking-wider">Sold Out</span>
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center space-x-1.5 mb-0.5">
                      <span className={`inline-block w-3 h-3 rounded-sm border flex items-center justify-center ${
                        item.vegNonveg === 'VEG' ? 'border-emerald-600' : 'border-rose-600'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          item.vegNonveg === 'VEG' ? 'bg-emerald-600' : 'bg-rose-600'
                        }`} />
                      </span>
                      <h3 className="text-xs font-bold text-slate-900 truncate leading-tight">
                        {item.name}
                      </h3>
                    </div>

                    <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                      {item.description}
                    </p>

                    <div className="flex items-center space-x-2 mt-1">
                      {item.isSweet && (
                        <span className="text-[9px] text-pink-600 bg-pink-50 px-1 py-0.5 rounded font-bold">Sweet</span>
                      )}
                      {item.spiceLevel && item.spiceLevel !== 'NONE' && (
                        <span className="text-[9px] text-red-600 bg-red-50 px-1 py-0.5 rounded font-bold">{item.spiceLevel}</span>
                      )}
                    </div>
                  </div>

                  {/* Price & Add Button */}
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs font-black text-slate-900">₹{item.price}</span>

                    {item.availability ? (
                      <button
                        onClick={() => setSelectedItemForModal(item)}
                        className="px-3 py-1 rounded-xl bg-brand-50 hover:bg-brand-500 text-brand-700 hover:text-white text-xs font-bold border border-brand-200 transition-all active:scale-95 shadow-sm"
                      >
                        + Add
                      </button>
                    ) : (
                      <span className="text-[10px] font-bold text-slate-400">Unavailable</span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </main>

      {/* Floating Bottom Bar: Cart Summary (Section 4) */}
      {itemCount > 0 && (
        <div className="fixed bottom-3 left-4 right-4 max-w-md mx-auto z-40 animate-slide-up">
          <button
            onClick={() => setIsCartOpen(true)}
            className="w-full bg-slate-900 hover:bg-black text-white p-3.5 rounded-2xl shadow-2xl flex items-center justify-between transition-all"
          >
            <div className="flex items-center space-x-3 text-left">
              <span className="w-7 h-7 rounded-full bg-brand-500 text-white font-black text-xs flex items-center justify-center">
                {itemCount}
              </span>
              <div>
                <p className="text-xs font-bold leading-tight">{tableTitle(table)} Cart</p>
                <p className="text-[11px] text-slate-400">Tap to review & order</p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-sm font-black text-brand-400">₹{total.toFixed(2)}</span>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </div>
          </button>
        </div>
      )}

      {/* Customization Modal */}
      <ItemCustomizationModal
        isOpen={Boolean(selectedItemForModal)}
        onClose={() => setSelectedItemForModal(null)}
        item={selectedItemForModal}
        onAddToCart={(item, qty, cust, addons, note) => {
          addItem(item, qty, cust, addons, note);
          addToast(`Added ${item.name} to cart.`, 'success');
        }}
      />

      {/* Customer Help Modal (Section 7) */}
      <CustomerHelpModal
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
        tableNumber={table.tableNumber}
        table={table}
      />

      {/* Order Receipt Confirmation Modal (Section 8) */}
      <OrderReceiptModal
        isOpen={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
        order={activeOrder}
        onConfirmed={(received) => {
          if (received) {
            setActiveOrder(prev => prev ? { ...prev, status: 'DELIVERED' } : null);
          }
        }}
      />

      {/* Slide-over Cart Drawer */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        onCheckout={handlePlaceOrder}
      />
    </div>
  );
}
