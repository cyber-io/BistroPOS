import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, subscribeRealtimeEvents } from '../../services/api';
import { tableTitle, tableLabel } from '../../services/tablePresentation';
import { useCart } from '../../context/CartContext';
import { useNotification } from '../../context/NotificationContext';
import CustomerHelpModal from '../../components/common/CustomerHelpModal';
import OrderReceiptModal from '../../components/common/OrderReceiptModal';
import ItemCustomizationModal from '../../components/common/ItemCustomizationModal';
import CartDrawer from '../../components/common/CartDrawer';
import DigitalReceiptAndFeedbackModal from '../../components/billing/DigitalReceiptAndFeedbackModal';
import WifiAndEntertainmentCard from '../../components/entertainment/WifiAndEntertainmentCard';
import AiRecommendationsRail from '../../components/common/AiRecommendationsRail';
import { translations, getCategoryTranslation } from '../../services/menuTranslations';
import { soundEffects } from '../../services/soundEffects';
import {
  Utensils,
  ShoppingBag,
  HelpCircle,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  ChefHat,
  Bell,
  Search,
  Flame,
  Candy,
  Check,
  ChevronRight,
  ChevronDown,
  SlidersHorizontal,
  X,
  Sparkles,
  RefreshCw,
  Wifi,
  Globe,
  Calculator,
  Receipt,
  Star,
  CreditCard,
  Languages,
  Gamepad2,
  Users,
  User,
  Phone,
  History
} from 'lucide-react';

const getCategoryIcon = (name = '') => {
  const n = String(name || '').toLowerCase();
  if (n.includes('pizza')) return '🍕';
  if (n.includes('burger')) return '🍔';
  if (n.includes('chinese') || n.includes('noodle') || n.includes('dimsum') || n.includes('asian')) return '🥢';
  if (n.includes('indian') || n.includes('curry') || n.includes('dal') || n.includes('gravy') || n.includes('thali') || n.includes('paneer')) return '🍲';
  if (n.includes('beverage') || n.includes('drink') || n.includes('coffee') || n.includes('tea') || n.includes('shake') || n.includes('juice')) return '🍹';
  if (n.includes('dessert') || n.includes('sweet') || n.includes('cake') || n.includes('ice') || n.includes('pastry')) return '🍰';
  if (n.includes('starter') || n.includes('snack') || n.includes('appetizer')) return '🥟';
  if (n.includes('bread') || n.includes('roti') || n.includes('naan') || n.includes('paratha')) return '🫓';
  if (n.includes('rice') || n.includes('biryani') || n.includes('pulao')) return '🍚';
  if (n.includes('salad') || n.includes('soup')) return '🥗';
  if (n.includes('sandwich') || n.includes('wrap') || n.includes('roll')) return '🥪';
  if (n.includes('pasta')) return '🍝';
  if (n.includes('grill') || n.includes('bbq') || n.includes('tandoor') || n.includes('tikka')) return '🍢';
  return '🍽️';
};

const ORDER_HISTORY_KEY = 'bistro_customer_order_history';

function getLocalOrderHistory() {
  try {
    const raw = localStorage.getItem(ORDER_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveOrderToLocalHistory(order, restName, tableNum) {
  if (!order || !order.orderId) return;
  try {
    const existing = getLocalOrderHistory();
    const idx = existing.findIndex(o => o.orderId === order.orderId);
    const entry = {
      orderId: order.orderId,
      orderNumber: order.orderNumber,
      restaurantId: order.restaurantId,
      restaurantName: restName || order.restaurantName || 'BistroPOS',
      tableNumber: tableNum || order.tableNumber || '',
      createdAt: order.createdAt || new Date().toISOString(),
      status: order.status || 'NEW',
      paymentStatus: order.paymentStatus || 'UNPAID',
      total: Number(order.total || 0),
      items: (order.items || []).map(i => ({
        orderItemId: i.orderItemId,
        name: i.name || i.itemName,
        quantity: Number(i.quantity || 1),
        price: Number(i.price || 0),
        lineTotal: Number(i.lineTotal || (Number(i.price || 0) * Number(i.quantity || 1)))
      }))
    };
    if (idx >= 0) {
      existing[idx] = { ...existing[idx], ...entry };
    } else {
      existing.unshift(entry);
    }
    localStorage.setItem(ORDER_HISTORY_KEY, JSON.stringify(existing.slice(0, 30)));
  } catch {}
}

function MyOrdersModal({ isOpen, onClose, orders = [], onReorder }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-3xl max-w-lg w-full max-h-[85vh] flex flex-col shadow-2xl border border-slate-100 overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center">
              <History size={18} className="text-amber-300" />
            </div>
            <div>
              <h3 className="text-base font-black tracking-tight">My Orders &amp; History</h3>
              <p className="text-[11px] text-slate-300">
                {orders.length} past order{orders.length === 1 ? '' : 's'} saved on this device
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content list */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-3.5 flex-1 bg-slate-50">
          {orders.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center">
                <ShoppingBag size={24} />
              </div>
              <h4 className="text-sm font-bold text-slate-800">No Past Orders Found</h4>
              <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
                When you place orders at this table or restaurant, they are saved here so you can easily review what you enjoyed.
              </p>
            </div>
          ) : (
            orders.map((ord, idx) => {
              const formattedDate = ord.createdAt
                ? new Date(ord.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                : 'Recent order';
              return (
                <div key={ord.orderId || idx} className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <div>
                      <span className="font-extrabold text-slate-900 text-sm">
                        #{ord.orderNumber || 'Order'}
                      </span>
                      <span className="text-[11px] text-slate-400 block mt-0.5">
                        {formattedDate} {ord.tableNumber ? `· Table ${ord.tableNumber}` : ''}
                      </span>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
                      ord.status === 'READY' ? 'bg-purple-100 text-purple-700' :
                      ord.status === 'DELIVERED' ? 'bg-emerald-100 text-emerald-700' :
                      ord.status === 'PREPARING' ? 'bg-amber-100 text-amber-700' :
                      ord.paymentStatus === 'PAID' ? 'bg-emerald-100 text-emerald-700' :
                      'bg-slate-100 text-slate-700'
                    }`}>
                      {ord.status?.replaceAll('_', ' ') || 'CONFIRMED'}
                    </span>
                  </div>

                  {/* Items list */}
                  <div className="p-2.5 rounded-xl bg-slate-50 space-y-1.5 text-xs text-slate-700">
                    {(ord.items || []).map((item, itemIdx) => (
                      <div key={item.orderItemId || itemIdx} className="flex items-center justify-between">
                        <span className="font-medium truncate pr-2">
                          <b className="text-slate-900">{item.quantity}×</b> {item.name}
                        </span>
                        <span className="font-bold text-slate-900 whitespace-nowrap">
                          ₹{Number(item.lineTotal || (item.price * item.quantity) || 0).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-xs">
                    <span className="text-slate-500 font-medium">Total Bill</span>
                    <span className="font-black text-slate-900 text-sm">
                      ₹{Number(ord.total || 0).toFixed(2)}
                    </span>
                  </div>

                  {onReorder && ord.items && ord.items.length > 0 && (
                    <button
                      type="button"
                      onClick={() => onReorder(ord)}
                      className="w-full mt-1 py-2 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors border border-emerald-200"
                    >
                      <ShoppingBag size={14} />
                      <span>Re-order dishes to cart</span>
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

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
  const [dietaryFilter, setDietaryFilter] = useState('ALL'); // ALL, VEG, NON_VEG, VEGAN, GLUTEN_FREE, SPECIAL
  const [searchQuery, setSearchQuery] = useState('');
  const [timeBudget, setTimeBudget] = useState(0); // 0 = any, 15, 25, 35 mins
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterPanelRef = useRef(null);
  const [isCategoryOpen, setIsCategoryOpen] = useState(false);
  const categoryPanelRef = useRef(null);
  const [tableSession, setTableSession] = useState(null);
  const [tableOrders, setTableOrders] = useState([]);
  const [paidOrderIds, setPaidOrderIds] = useState(new Set());
  const [activeTab, setActiveTab] = useState('MENU'); // 'MENU' | 'TABLE_ORDERS' | 'ENTERTAINMENT'
  const [lang, setLang] = useState('en'); // 'en' or 'hi'
  const [billRequested, setBillRequested] = useState(false);
  const [isCallingBill, setIsCallingBill] = useState(false);
  const [isFeedbackReceiptOpen, setIsFeedbackReceiptOpen] = useState(false);
  const [isEntertainmentOpen, setIsEntertainmentOpen] = useState(false);
  const [selectedOrderForFeedback, setSelectedOrderForFeedback] = useState(null);
  const t = translations[lang] || translations.en;

  // Modals & Drawers
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [selectedItemForModal, setSelectedItemForModal] = useState(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [receiptOrder, setReceiptOrder] = useState(null);
  const [isMyOrdersOpen, setIsMyOrdersOpen] = useState(false);
  const [myOrdersHistory, setMyOrdersHistory] = useState(() => getLocalOrderHistory());

  // Guest Identification (Customer Name & Mobile Number)
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [isGuestModalOpen, setIsGuestModalOpen] = useState(false);
  const [guestError, setGuestError] = useState('');

  // Active Placed Order & 1-Minute Cancellation Timer
  const [activeOrder, setActiveOrder] = useState(null);
  const [cancelSecondsRemaining, setCancelSecondsRemaining] = useState(0);
  const [isCancelling, setIsCancelling] = useState(false);
  const [waiterArrivingMsg, setWaiterArrivingMsg] = useState(null);
  const [foodReadyAlert, setFoodReadyAlert] = useState(null);

  useEffect(() => { activeOrderRef.current = activeOrder; }, [activeOrder]);
  const updateActiveOrder = useCallback(order => {
    // If order is paid or fully settled, table session is cleared
    const isPaid = order && (order.paymentStatus === 'PAID' || (Number(order.paidAmount) || 0) >= (Number(order.total) || 0) - 0.05);
    const validOrder = (order && !isPaid && order.status !== 'CANCELLED') ? order : null;
    setActiveOrder(validOrder);
    activeOrderRef.current = validOrder;
    if (validOrder?.status === 'PENDING_CONFIRMATION') {
      setReceiptOrder(validOrder);
      setIsReceiptModalOpen(true);
    }
  }, []);

  // Restore guest info from active order or localStorage
  useEffect(() => {
    if (!table) return;
    try {
      const saved = JSON.parse(localStorage.getItem(`bistro_table_guest_${table.tableId}`) || 'null');
      if (saved?.name) setGuestName(saved.name);
      if (saved?.phone) setGuestPhone(saved.phone);
    } catch {}
  }, [table]);

  useEffect(() => {
    if (activeOrder?.customerName && activeOrder.customerName !== 'Guest') {
      setGuestName(activeOrder.customerName);
      if (activeOrder.customerPhone) setGuestPhone(activeOrder.customerPhone);
      if (table) {
        try {
          localStorage.setItem(`bistro_table_guest_${table.tableId}`, JSON.stringify({
            name: activeOrder.customerName,
            phone: activeOrder.customerPhone || ''
          }));
        } catch {}
      }
    }
  }, [activeOrder, table]);

  // A QR link must identify this restaurant and an actual enabled table.
  const loadData = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setIsLoading(true); setLoadError(''); setTable(null); updateActiveOrder(null); setWaiterArrivingMsg(null);
    try {
      // Sanitize restaurantId and tableId if they have extra characters or malformed GUIDs
      let cleanRestaurantId = restaurantId;
      if (typeof cleanRestaurantId === 'string') {
        const match = cleanRestaurantId.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
        if (match) cleanRestaurantId = match[0];
      }
      let cleanTableId = tableId;
      if (typeof cleanTableId === 'string') {
        const match = cleanTableId.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
        if (match) cleanTableId = match[0];
      }

      let rest = null;
      try {
        rest = await api.getRestaurant(cleanRestaurantId);
      } catch {
        rest = await api.getRestaurant().catch(() => null);
      }
      if (!rest) rest = { restaurantId: cleanRestaurantId || 'a0000000-0000-0000-0000-000000000001', name: 'Bistro & Bloom' };

      let currentTable = await api.getTableById(cleanTableId, rest.restaurantId || cleanRestaurantId);
      if (!currentTable) {
        const allTables = await api.getTables(rest.restaurantId || cleanRestaurantId).catch(() => []);
        currentTable = allTables.find(t =>
          String(t.tableId).toLowerCase() === String(cleanTableId).toLowerCase() ||
          String(t.tableId).toLowerCase() === String(tableId).toLowerCase() ||
          String(t.tableNumber) === String(cleanTableId) ||
          String(t.tableNumber) === String(tableId) ||
          String(t.qrIdentifier).toLowerCase() === String(cleanTableId).toLowerCase() ||
          String(t.qrIdentifier).toLowerCase() === String(tableId).toLowerCase()
        ) || null;
      }
      if (!currentTable) throw new Error('Invalid table QR code. Please scan the active QR code located on your table.');
      if (currentTable.status === 'OUT_OF_SERVICE') throw new Error('This table is currently out of service. Please ask our team for assistance.');
      const targetResId = cleanRestaurantId || rest.restaurantId;
      const [cats, itemsList, orders, session] = await Promise.all([
        api.getCategories(targetResId),
        api.getMenuItems(targetResId),
        api.getOrders().catch(() => []),
        api.getTableSession(currentTable.tableId).catch(() => null)
      ]);
      if (sequence !== loadSequence.current) return;
      setRestaurant(rest); setTable(currentTable); setCategories(cats); setMenuItems(itemsList); setTableSession(session);

      const sessionOrders = Array.isArray(session?.orders) ? session.orders : [];
      // Only keep orders that belong to the active dining session and are not cancelled
      const activeSessionOrders = sessionOrders.filter(o => o && o.orderId && o.status !== 'CANCELLED');

      // Keep active dining session orders intact
      const curTableOrders = activeSessionOrders;

      setTableOrders(curTableOrders);
      if (curTableOrders.length > 0) {
        setTable(prev => prev ? { ...prev, status: 'OCCUPIED' } : prev);
        curTableOrders.forEach(ord => saveOrderToLocalHistory(ord, rest?.name, currentTable?.tableNumber));
      }

      const context = { tableId: currentTable.tableId, tableNumber: currentTable.tableNumber, restaurantId: rest.restaurantId };
      if (switchOrderContext) switchOrderContext('DINE_IN_QR', context);
      else { setOrderSource('DINE_IN_QR'); setTableInfo(context); }
      // Match active UNPAID order for this table
      const activeTableOrder = curTableOrders.find(order =>
        order.tableId === currentTable.tableId &&
        order.status !== 'CANCELLED' &&
        order.paymentStatus !== 'PAID' &&
        (Number(order.paidAmount) || 0) < (Number(order.total) || 0) - 0.05
      ) || curTableOrders[0] || null;
      updateActiveOrder(activeTableOrder);
      if (!activeTableOrder) {
        try { localStorage.removeItem(`bistro_table_guest_${currentTable.tableId}`); } catch {}
      } else {
        try {
          if (activeTableOrder.customerName) {
            localStorage.setItem(`bistro_table_guest_${currentTable.tableId}`, JSON.stringify({
              name: activeTableOrder.customerName,
              phone: activeTableOrder.customerPhone || ''
            }));
          }
        } catch {}
      }
    } catch (err) { if (sequence === loadSequence.current) setLoadError(err.message || 'Unable to open the table menu. Please try again.'); }
    finally { if (sequence === loadSequence.current) setIsLoading(false); }
  }, [restaurantId, tableId, switchOrderContext, updateActiveOrder]);
  useEffect(() => { loadData(); return () => { loadSequence.current += 1; }; }, [loadData]);

  useEffect(() => {
    if (!table) return;
    let active = true;

    const syncTableSession = async () => {
      try {
        const sess = await api.getTableSession(table.tableId).catch(() => null);
        if (!active) return;
        if (sess) setTableSession(sess);
        const sessOrders = Array.isArray(sess?.orders) ? sess.orders : [];
        const activeOrders = sessOrders.filter(o => o && o.orderId && o.status !== 'CANCELLED');
        const list = activeOrders;
        if (active) {
          setTableOrders(list);
          if (list.length > 0) {
            setTable(prev => prev ? { ...prev, status: 'OCCUPIED' } : prev);
            list.forEach(ord => saveOrderToLocalHistory(ord, restaurant?.name, table?.tableNumber));
          }
          const current = activeOrderRef.current;
          if (current) {
            const updated = list.find(o => o.orderId === current.orderId);
            if (updated) updateActiveOrder(updated);
          } else {
            const pending = list.find(o =>
              o.status !== 'CANCELLED' &&
              o.paymentStatus !== 'PAID' &&
              (Number(o.paidAmount) || 0) < (Number(o.total) || 0) - 0.05
            ) || list[0] || null;
            if (pending) updateActiveOrder(pending);
          }
        }
      } catch {
        // ignore
      }
    };

    const unsub = subscribeRealtimeEvents((type, payload) => {
      if (type === 'ORDER_STATUS_CHANGED' || type === 'NEW_ORDER' || type === 'TABLE_ORDER_READY' || type === 'TABLE_STATUS_UPDATED') {
        syncTableSession();
      }

      const status = payload?.newStatus || payload?.status || payload?.order?.status;
      const orderNum = payload?.orderNumber || payload?.order?.orderNumber || '';

      // Realtime Food Ready Notification for customer
      if (type === 'TABLE_ORDER_READY' || status === 'READY') {
        try { soundEffects.playOrderReady(); } catch {}
        setFoodReadyAlert({
          orderNumber: orderNum,
          orderId: payload?.orderId || payload?.order?.orderId,
          at: new Date()
        });
        addToast(
          `🎉 Food is Ready! Chef has prepared your order #${orderNum}. Floor staff is serving it to your table.`,
          'success'
        );
      }

      // Realtime Confirmation Prompt when order is delivered or needs confirmation
      if (type === 'ORDER_CONFIRMATION_PROMPT' || status === 'PENDING_CONFIRMATION') {
        const target = (tableOrders || []).find(o => o.orderId === payload?.orderId || o.orderNumber === orderNum) || activeOrder || payload?.order;
        if (target) setReceiptOrder(target);
        setIsReceiptModalOpen(true);
        addToast(`Order #${orderNum || target?.orderNumber || ''} delivered! Please confirm you have received your order.`, 'info');
      }

      if (type === 'WAITER_HELP_ACCEPTED' && payload.tableId === table.tableId) setWaiterArrivingMsg(`The waiter ${payload.waiterName || payload.assignedWaiterName || ''} is coming.`);
      if (type === 'HELP_REQUEST_RESOLVED' && payload.tableId === table.tableId) setWaiterArrivingMsg(null);
      if (type === 'FOOD_AVAILABILITY_CHANGED') setMenuItems(previous => previous.map(item => item.menuItemId === payload.menuItemId ? { ...item, availability: payload.availability } : item));
    });
    const timer = setInterval(syncTableSession, 5000);
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

  // Click-outside to close filter & category dropdowns
  useEffect(() => {
    if (!isFilterOpen && !isCategoryOpen) return;
    const handler = (e) => {
      if (isFilterOpen && filterPanelRef.current && !filterPanelRef.current.contains(e.target)) {
        setIsFilterOpen(false);
      }
      if (isCategoryOpen && categoryPanelRef.current && !categoryPanelRef.current.contains(e.target)) {
        setIsCategoryOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isFilterOpen, isCategoryOpen]);

  // Checkout and Guest Details Verification
  const handleCheckoutClick = () => {
    if (!items.length) return;
    setIsCartOpen(false);
    const cleanPh = guestPhone.replace(/\D/g, '');
    if (!guestName.trim() || cleanPh.length < 10) {
      setGuestError('');
      setIsGuestModalOpen(true);
      return;
    }
    submitOrder(guestName.trim(), cleanPh);
  };

  const handleGuestSubmit = e => {
    if (e) e.preventDefault();
    setGuestError('');
    if (!guestName.trim()) return setGuestError('Please enter your name.');
    const cleanPh = guestPhone.replace(/\D/g, '');
    if (cleanPh.length < 10) return setGuestError('Please enter a valid 10-digit mobile number.');

    try {
      if (table) {
        localStorage.setItem(`bistro_table_guest_${table.tableId}`, JSON.stringify({
          name: guestName.trim(),
          phone: cleanPh
        }));
      }
    } catch {}

    setIsGuestModalOpen(false);
    submitOrder(guestName.trim(), cleanPh);
  };

  // Place or Append Order Action
  const submitOrder = async (name, phone) => {
    if (!items.length || !table || !restaurant || placingRef.current) return;
    placingRef.current = true;
    setIsPlacing(true);
    try {
      const order = await api.createOrder({
        restaurantId: restaurant?.restaurantId,
        tableId: table?.tableId,
        tableNumber: table?.tableNumber,
        sessionId: tableSession?.sessionId || null,
        source: 'DINE_IN_QR',
        customerName: name || null,
        customerPhone: phone || null,
        items
      });
      setTable(prev => prev ? { ...prev, status: 'OCCUPIED' } : prev);
      const isExistingOrder = activeOrder && activeOrder.orderId === order.orderId;
      updateActiveOrder(order);
      setTableOrders(prev => [order, ...prev.filter(o => o.orderId !== order.orderId)]);
      saveOrderToLocalHistory(order, restaurant?.name, table?.tableNumber);
      setMyOrdersHistory(getLocalOrderHistory());
      clearCart();
      setIsCartOpen(false);
      addToast(
        isExistingOrder
          ? `Items added to your active Table order #${order.orderNumber}! Kitchen has been notified.`
          : `Order #${order.orderNumber} placed successfully! Kitchen has been notified.`,
        'success'
      );

      // Refresh table session so all diners have the full synchronized order list
      api.getTableSession(table.tableId).then(sess => {
        if (sess) {
          setTableSession(sess);
          if (Array.isArray(sess.orders)) {
            const map = new Map();
            sess.orders.forEach(o => { if (o && o.orderId && o.status !== 'CANCELLED') map.set(o.orderId, o); });
            map.set(order.orderId, order);
            setTableOrders(Array.from(map.values()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
          }
        }
      }).catch(() => {});
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      placingRef.current = false;
      setIsPlacing(false);
    }
  };

  // Re-order past order dishes
  const handleReorder = (pastOrder) => {
    if (!pastOrder || !pastOrder.items || !pastOrder.items.length) return;
    let addedCount = 0;
    pastOrder.items.forEach(it => {
      const target = menuItems.find(m =>
        (m.menuItemId && it.orderItemId && m.menuItemId === it.orderItemId) ||
        (m.name && it.name && m.name.toLowerCase() === it.name.toLowerCase())
      );
      if (target) {
        addItem(target, Number(it.quantity) || 1);
        addedCount += Number(it.quantity) || 1;
      }
    });
    if (addedCount > 0) {
      addToast(`Added ${addedCount} dish(es) from Order #${pastOrder.orderNumber} to your cart!`, 'success');
      setIsMyOrdersOpen(false);
      setIsCartOpen(true);
    } else {
      addToast('Dishes from this past order are currently not on today’s active menu.', 'warning');
    }
  };

  // Cancel Order Action (Backend strictly enforces 1-min window)
  const handleCancelOrder = async () => {
    if (!activeOrder) return;
    setIsCancelling(true);
    try {
      await api.cancelOrder(activeOrder.orderId, 'Customer cancelled within 1 min');
      addToast('Order cancelled successfully.', 'info');
      updateActiveOrder(null);
      setTableOrders(prev => prev.filter(o => o.orderId !== activeOrder.orderId));
      api.getTableSession(table.tableId).then(sess => {
        if (sess) setTableSession(sess);
      }).catch(() => {});
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setIsCancelling(false);
    }
  };

  // Filtered Menu Items
  const filteredItems = menuItems.filter(item => {
    const matchesCat = activeCategory === 'ALL' || item.categoryId === activeCategory;
    const matchesDietary =
      dietaryFilter === 'ALL' ||
      (dietaryFilter === 'VEG' && item.vegNonveg === 'VEG') ||
      (dietaryFilter === 'NON_VEG' && item.vegNonveg === 'NON_VEG') ||
      (dietaryFilter === 'VEGAN' && (item.dietaryTags || []).some(t => /vegan/i.test(t))) ||
      (dietaryFilter === 'GLUTEN_FREE' && (item.dietaryTags || []).some(t => /gluten/i.test(t))) ||
      (dietaryFilter === 'SPECIAL' && Boolean(item.isSpecial));
    const matchesSearch = !searchQuery ||
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.ingredients || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.allergens || []).some(a => a.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesTimeBudget = !timeBudget || (item.prepTimeMinutes || 15) <= timeBudget;
    return matchesCat && matchesDietary && matchesSearch && matchesTimeBudget;
  });

  // Table Orders Billing & Payment Statuses (Checked by Reception)
  const nonCancelledTableOrders = useMemo(() => {
    return tableOrders.filter(o => o.status !== 'CANCELLED');
  }, [tableOrders]);

  const unpaidTableOrders = useMemo(() => {
    return nonCancelledTableOrders.filter(o =>
      !paidOrderIds.has(o.orderId) &&
      o.paymentStatus !== 'PAID' &&
      (Number(o.paidAmount) || 0) < (Number(o.total) || 0) - 0.05
    );
  }, [nonCancelledTableOrders, paidOrderIds]);

  const isBillPaidAndConfirmed = useMemo(() => {
    return nonCancelledTableOrders.length > 0 && unpaidTableOrders.length === 0;
  }, [nonCancelledTableOrders, unpaidTableOrders]);

  const totalUnpaidAmount = useMemo(() => {
    return unpaidTableOrders.reduce((sum, o) => {
      const due = Math.max(0, Number(o.total || 0) - Number(o.paidAmount || 0));
      return sum + due;
    }, 0);
  }, [unpaidTableOrders]);

  const totalTableSpend = useMemo(() => {
    return tableOrders.reduce((sum, o) => sum + Number(o.total || 0), 0);
  }, [tableOrders]);

  useEffect(() => {
    if (isBillPaidAndConfirmed) {
      setBillRequested(false);
    }
  }, [isBillPaidAndConfirmed]);

  const handleCallForBill = async () => {
    if (billRequested || isCallingBill) return;
    if (!table) return;
    setIsCallingBill(true);
    try {
      await api.createHelpRequest(
        table.tableNumber || table.tableId,
        `Customer at ${tableTitle(table)} requested bill (Total: ₹${totalUnpaidAmount.toFixed(2)})`,
        'BILL'
      );
      setBillRequested(true);
      addToast(`Bill requested! Staff will bring the bill to ${tableTitle(table)} shortly.`, 'success');
    } catch (err) {
      addToast(err.message || 'Unable to call for bill. Please alert floor staff.', 'error');
    } finally {
      setIsCallingBill(false);
    }
  };

  if (isLoading || loadError) return <main className="min-h-screen bg-[#f7f8fb] flex items-center justify-center px-6 py-12 text-center"><div className="max-w-sm w-full bg-white border border-slate-200 rounded-2xl p-8"><div className="w-14 h-14 mx-auto mb-5 rounded-xl bg-blue-50 text-blue-500 flex items-center justify-center">{isLoading ? <RefreshCw className="animate-spin" size={24} /> : <AlertCircle size={26} />}</div><h1 className="text-xl font-semibold text-slate-900">{isLoading ? 'Opening your table menu…' : 'We couldn’t verify this table'}</h1><p className="text-sm text-slate-500 leading-6 mt-3">{isLoading ? 'Checking your table and today’s menu.' : loadError}</p>{!isLoading && <><button onClick={loadData} className="btn-3d-crimson mt-6 w-full py-3 rounded-xl text-white text-sm font-semibold">Try again</button><a href="/" className="block text-xs text-slate-500 mt-5">Visit the restaurant website</a></>}</div></main>;

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      {/* 1. Mobile-First Dedicated QR Menu Header matching screenshot */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs">
        <div className="max-w-2xl mx-auto px-3 sm:px-4 py-3 flex items-center justify-between gap-2">
          {/* Left: Restaurant Logo & Table Title */}
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
            <img
              src={restaurant.logo || '/favicon.svg'}
              alt={restaurant?.name}
              className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl object-cover shadow-sm ring-1 ring-slate-200 shrink-0"
            />
            <div className="min-w-0 flex-1">
              <h1 className="text-sm font-black text-slate-900 leading-tight truncate">
                {restaurant.name}
              </h1>
              <div className="flex items-center gap-1.5 sm:gap-2 mt-0.5 min-w-0">
                <span className="inline-flex items-center px-2 sm:px-2.5 py-0.5 rounded-full text-[11px] font-black bg-[#1a382b] text-white shadow-xs shrink-0 whitespace-nowrap">
                  {tableTitle(table)}
                </span>
                <span className="text-[11px] sm:text-xs text-slate-500 font-medium truncate">
                  Dine-In Menu
                </span>
              </div>
            </div>
          </div>

          {/* Right: 4 Pill Action Buttons (Languages, Gamepad, Help, Cart) */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* 1. Language Toggle Button */}
            <button
              type="button"
              onClick={() => setLang(l => l === 'en' ? 'hi' : 'en')}
              className="w-9 h-9 rounded-2xl bg-[#ede9fe]/80 text-[#6d28d9] hover:bg-[#ddd6fe] flex items-center justify-center transition-all shadow-2xs border border-purple-100/70 active:scale-95"
              title="Change Language / भाषा बदलें"
            >
              <Languages size={17} />
            </button>

            {/* 2. Wi-Fi & Entertainment Game Button */}
            <button
              type="button"
              onClick={() => setIsEntertainmentOpen(true)}
              className="w-9 h-9 rounded-2xl bg-[#faf5ff] text-[#7c3aed] hover:bg-[#f3e8ff] flex items-center justify-center transition-all shadow-2xs border border-purple-100/70 active:scale-95"
              title="Entertainment & Table Lounge"
            >
              <Gamepad2 size={18} />
            </button>

            {/* 3. My Orders & Cache History Button */}
            <button
              type="button"
              onClick={() => {
                setMyOrdersHistory(getLocalOrderHistory());
                setIsMyOrdersOpen(true);
              }}
              className="h-9 px-2.5 sm:px-3 rounded-2xl bg-white border border-slate-200 text-slate-800 hover:bg-slate-50 flex items-center gap-1.5 transition-all shadow-2xs active:scale-95"
              title="My Orders & Past History"
            >
              <History size={15} className="text-brand-600" />
              <span className="text-xs font-bold hidden xs:inline">My Orders</span>
              {myOrdersHistory.length > 0 && (
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              )}
            </button>

            {/* 4. Help Button */}
            <button
              type="button"
              onClick={() => setIsHelpOpen(true)}
              className="h-9 px-3.5 rounded-2xl bg-[#f59e0b] hover:bg-[#d97706] text-white text-xs font-black flex items-center gap-1.5 shadow-xs active:scale-95 transition-all"
              title="Call Waiter"
            >
              <HelpCircle size={15} />
              <span>Help</span>
            </button>

            {/* 4. Cart Trigger */}
            <button
              type="button"
              onClick={() => setIsCartOpen(true)}
              className="relative w-9 h-9 rounded-2xl bg-white border border-slate-200 text-slate-800 hover:bg-slate-50 flex items-center justify-center transition-all shadow-2xs active:scale-95"
              aria-label="View Cart"
            >
              <ShoppingBag size={17} />
              {itemCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-brand-500 text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center animate-soft-pulse">
                  {itemCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-2xl mx-auto px-4 pt-3 space-y-3">
        {/* Realtime Food Ready Notification Banner (visible across all tabs) */}
        {foodReadyAlert && (
          <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white shadow-lg shadow-emerald-600/20 border border-emerald-400/40 flex items-center justify-between gap-3 animate-pulse">
            <div className="flex items-center space-x-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0">
                <Bell className="w-5 h-5 text-white animate-bounce" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black tracking-wide">🎉 Food is Ready!</span>
                  {foodReadyAlert.orderNumber && (
                    <span className="text-[10px] bg-white/25 px-2 py-0.5 rounded-full font-bold uppercase">
                      Order #{foodReadyAlert.orderNumber}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-emerald-100 font-medium mt-0.5 leading-snug">
                  The kitchen has completed cooking your dishes! Floor staff is serving them to {table ? `Table ${table.tableNumber}` : 'your table'}.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setFoodReadyAlert(null)}
              className="p-1.5 rounded-xl bg-white/10 hover:bg-white/25 text-white transition-colors shrink-0"
              aria-label="Dismiss alert"
            >
              <X size={15} />
            </button>
          </div>
        )}

        {/* Table Orders Active Notification Strip when dining session has placed orders */}
        {tableOrders.length > 0 && activeTab === 'MENU' && (
          <div className="flex items-center justify-between gap-2 p-2.5 px-3.5 rounded-2xl bg-gradient-to-r from-slate-900 to-indigo-950 text-white shadow-xs">
            <div className="flex items-center gap-1.5 min-w-0">
              <Users size={14} className="text-purple-400 shrink-0" />
              <span className="text-xs font-bold truncate">
                Table Activity • {tableOrders.length} order{tableOrders.length > 1 ? 's' : ''} placed
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab('TABLE_ORDERS')}
                className="px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold whitespace-nowrap transition-all shadow-xs"
              >
                View Orders
              </button>
              {isBillPaidAndConfirmed && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedOrderForFeedback(tableOrders[0]);
                    setIsFeedbackReceiptOpen(true);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black whitespace-nowrap shadow-xs transition-all flex items-center gap-1"
                >
                  <CheckCircle2 size={12} /> Receipt
                </button>
              )}
            </div>
          </div>
        )}

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
              <div className={`p-1.5 rounded-lg border transition-all ${
                activeOrder.status === 'READY'
                  ? 'bg-purple-600 border-purple-500 text-white font-black shadow-sm ring-2 ring-purple-300 animate-pulse'
                  : 'border-slate-200 text-slate-500'
              }`}>
                3. Ready
              </div>
              <div className={`p-1.5 rounded-lg border ${
                activeOrder.status === 'DELIVERED' ? 'bg-emerald-50 border-emerald-300 text-emerald-700 font-bold' : 'border-slate-200 text-slate-500'
              }`}>
                4. Served
              </div>
            </div>

            {/* Dynamic Preparation Time & Delay Warning (Feature 14) */}
            {['NEW', 'ACCEPTED', 'PREPARING'].includes(activeOrder.status) && (
              <div className="p-2.5 rounded-xl bg-amber-50/80 border border-amber-200/80 text-xs space-y-1">
                <div className="flex items-center justify-between text-amber-900 font-bold">
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-600 animate-spin" />
                    Kitchen Preparation
                  </span>
                  <span>~{activeOrder.estimatedPrepTimeMinutes || 15} mins</span>
                </div>
                {activeOrder.estimatedReadyAt && new Date() > new Date(activeOrder.estimatedReadyAt) ? (
                  <p className="text-[11px] text-amber-800">
                    ⚠️ Taking a little extra time to perfect your dishes. Thank you for your patience!
                  </p>
                ) : (
                  <p className="text-[11px] text-slate-600">
                    Estimated ready by: <strong>{activeOrder.estimatedReadyAt ? new Date(activeOrder.estimatedReadyAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Soon'}</strong>
                  </p>
                )}
              </div>
            )}

            {/* Food Ready Alert Box */}
            {activeOrder.status === 'READY' && (
              <div className="p-3 rounded-xl bg-purple-50 border border-purple-200 text-xs flex items-center space-x-2.5 text-purple-950 font-semibold shadow-xs">
                <CheckCircle2 className="w-4 h-4 text-purple-600 shrink-0" />
                <span>🎉 Chef has prepared your dishes! Your food is ready and floor staff is serving it to {table ? `Table ${table.tableNumber}` : 'your table'}.</span>
              </div>
            )}

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
                onClick={() => {
                  setReceiptOrder(activeOrder);
                  setIsReceiptModalOpen(true);
                }}
                className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold text-xs flex items-center justify-center space-x-2 shadow-md animate-bounce"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirm Food Received (Tap Here)</span>
              </button>
            )}

            {/* Running Table Bill & Items List */}
            <div className="border-t border-slate-100 pt-2.5 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-800">
                  Guest: <strong>{activeOrder.customerName || guestName || 'Table Guest'}</strong>
                </span>
                <span className="font-black text-brand-600 text-sm">
                  Running Bill: ₹{Number(activeOrder.total || 0).toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>{activeOrder.items?.reduce((s, i) => s + (Number(i.quantity) || 1), 0)} items in this table tab</span>
                <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                  Running Tab · Pay at End
                </span>
              </div>
              <div className="max-h-32 overflow-y-auto space-y-1 bg-slate-50/70 p-2 rounded-xl border border-slate-100 text-[11px]">
                {activeOrder.items?.map((it, idx) => (
                  <div key={it.orderItemId || idx} className="flex justify-between items-center text-slate-700">
                    <span className="truncate pr-2">{it.quantity}× {it.name || it.itemName}</span>
                    <span className="font-bold whitespace-nowrap">₹{(Number(it.lineTotal) || (Number(it.price || 0) * (Number(it.quantity) || 1))).toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 italic">
                Add more dishes to cart anytime — they will automatically merge into this running order.
              </p>
            </div>
          </div>
        )}

        {isPlacing && <div role="status" className="p-3 rounded-xl border border-blue-100 bg-blue-50 text-blue-700 text-xs">Sending your order to the kitchen…</div>}

        {/* Tab 1: Shared Table Orders Feed (Feature 2) */}
        {activeTab === 'TABLE_ORDERS' && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setActiveTab('MENU')}
              className="px-3.5 py-2 rounded-2xl bg-white border border-slate-200 text-slate-800 text-xs font-bold flex items-center gap-1.5 shadow-2xs hover:bg-slate-50 transition-all"
            >
              <span>← Back to Food Menu</span>
            </button>
            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Table Dining Session</h2>
                  <p className="text-xs text-slate-500">
                    {tableSession ? `Active Session #${tableSession.sessionCode}` : 'Current Table Activity'}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 block uppercase font-bold">Total Table Spend</span>
                  <strong className="text-base font-black text-slate-900">
                    ₹{tableOrders.reduce((sum, o) => sum + Number(o.total || 0), 0).toFixed(2)}
                  </strong>
                </div>
              </div>

              <button
                onClick={() => setActiveTab('MENU')}
                className="w-full py-2.5 px-4 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold transition-all flex items-center justify-center space-x-1.5 shadow-sm"
              >
                <span>➕ Add More Dishes to Table</span>
              </button>

              {unpaidTableOrders.length > 0 && (
                <button
                  type="button"
                  onClick={handleCallForBill}
                  disabled={isCallingBill}
                  className={`w-full py-2.5 px-4 rounded-xl ${billRequested ? 'bg-emerald-50 text-emerald-800 border border-emerald-300' : 'bg-slate-900 hover:bg-slate-800 text-white shadow-sm'} text-xs font-bold transition-all flex items-center justify-center space-x-2`}
                >
                  <Receipt size={15} className={billRequested ? 'text-emerald-600' : 'text-amber-300'} />
                  <span>
                    {billRequested ? '✓ Bill Requested (Staff on the way)' : `Call for Bill (₹${totalUnpaidAmount.toFixed(2)})`}
                  </span>
                </button>
              )}

              {tableOrders.length > 0 && isBillPaidAndConfirmed && (
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between text-xs text-emerald-800">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                      <div>
                        <strong className="block font-bold">Bill Paid & Confirmed</strong>
                        <span className="text-[11px] text-emerald-600">Payment confirmed by reception</span>
                      </div>
                    </div>
                    <span className="font-mono font-bold text-emerald-700">
                      ₹{totalTableSpend.toFixed(2)}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedOrderForFeedback(tableOrders[0]);
                        setIsFeedbackReceiptOpen(true);
                      }}
                      className="w-full py-2.5 px-3 rounded-xl bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-95"
                    >
                      <Receipt size={14} /> Receipt & Review
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTableOrders([]);
                        updateActiveOrder(null);
                        try { localStorage.removeItem(`bistro_table_guest_${table?.tableId}`); } catch {}
                        addToast('Table session reset! You can now place fresh orders.', 'success');
                        setActiveTab('MENU');
                      }}
                      className="w-full py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition-all active:scale-95"
                    >
                      <Plus size={14} /> Start Fresh Order
                    </button>
                  </div>
                </div>
              )}
            </div>

            {tableOrders.length === 0 ? (
              <div className="p-8 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
                <p className="text-xs font-medium">No orders placed at this table yet.</p>
                <button onClick={() => setActiveTab('MENU')} className="mt-2 text-xs font-bold text-brand-600 underline">
                  Browse Menu & Place First Order
                </button>
              </div>
            ) : (
              tableOrders.map(ord => (
                <div key={ord.orderId} className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <div>
                      <strong className="text-xs text-slate-900">Order #{ord.orderNumber}</strong>
                      <p className="text-[10px] text-slate-400">
                        {new Date(ord.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                      ord.status === 'READY' ? 'bg-purple-100 text-purple-800' :
                      ord.status === 'DELIVERED' ? 'bg-emerald-100 text-emerald-800' :
                      ord.status === 'PREPARING' || ord.status === 'ACCEPTED' ? 'bg-amber-100 text-amber-800' :
                      ord.status === 'PENDING_CONFIRMATION' ? 'bg-rose-100 text-rose-800' :
                      'bg-blue-100 text-blue-800'
                    }`}>
                      {ord.status.replaceAll('_', ' ')}
                    </span>
                  </div>

                  <div className="space-y-1">
                    {(ord.items || []).map((itm, i) => (
                      <div key={itm.orderItemId || i} className="flex justify-between text-xs text-slate-700">
                        <span><strong>{itm.quantity}×</strong> {itm.name || itm.itemName}</span>
                        <span className="font-semibold text-slate-900">₹{Number(itm.lineTotal || itm.price * itm.quantity).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-xs">
                    <span className="text-slate-500">
                      {['NEW', 'ACCEPTED', 'PREPARING'].includes(ord.status) && ord.estimatedPrepTimeMinutes ? (
                        <span className="text-amber-700 font-medium">⏱️ Est. ~{ord.estimatedPrepTimeMinutes} mins</span>
                      ) : (
                        <span>Subtotal</span>
                      )}
                    </span>
                    <strong className="text-slate-900">₹{Number(ord.total).toFixed(2)}</strong>
                  </div>

                  {ord.status === 'PENDING_CONFIRMATION' && (
                    <button
                      type="button"
                      onClick={() => {
                        setReceiptOrder(ord);
                        setIsReceiptModalOpen(true);
                      }}
                      className="w-full mt-2 py-2 px-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm active:scale-95 transition-all"
                    >
                      <CheckCircle2 size={14} />
                      <span>Confirm Food Received (Tap Here)</span>
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* Tab 3: Entertainment & Wi-Fi Information (Feature 5) */}
        {activeTab === 'ENTERTAINMENT' && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setActiveTab('MENU')}
              className="px-3.5 py-2 rounded-2xl bg-white border border-slate-200 text-slate-800 text-xs font-bold flex items-center gap-1.5 shadow-2xs hover:bg-slate-50 transition-all"
            >
              <span>← Back to Food Menu</span>
            </button>
            <WifiAndEntertainmentCard 
              isOpen={true} 
              onClose={() => setActiveTab('MENU')} 
              tableNumber={tableTitle(table)} 
              lang={lang} 
            />
          </div>
        )}

        {/* Tab 2: Menu & Ordering (Feature 1 & Feature 9) */}
        {activeTab === 'MENU' && (
          <>
            {/* AI Recommendations Rail (Feature 9) */}
            <AiRecommendationsRail menuItems={menuItems} cartItems={items} lang={lang} />

            {/* Search & Filters matching screenshot */}
            <div className="space-y-2.5">
              {/* Search Bar */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
                <input
                  type="text"
                  aria-label="Search dishes, ingredients"
                  placeholder="Search dishes, ingredients (e.g. Paneer, Pizza, Dosa)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full text-xs pl-10 pr-4 py-3 rounded-2xl border border-slate-200 bg-white shadow-xs focus:outline-none focus:ring-2 focus:ring-slate-300 placeholder:text-slate-400 text-slate-800"
                />
              </div>

              {/* ── Compact Filter Row: dropdown trigger + category tabs ── */}
              {(() => {
                // Count active filters for badge
                const activeFilterCount = [
                  dietaryFilter !== 'ALL',
                  timeBudget !== 0,
                ].filter(Boolean).length;

                const timeBudgetOptions = [
                  { label: 'Any time', mins: 0 },
                  { label: '⚡ 15m', mins: 15 },
                  { label: '⏱️ 25m', mins: 25 },
                  { label: '🍲 35m', mins: 35 },
                ];

                const dietaryLabel = {
                  ALL: 'All',
                  VEG: '🟢 Pure Veg',
                  NON_VEG: '🔴 Non-Veg',
                  VEGAN: '🌱 Vegan',
                  GLUTEN_FREE: '🌾 Gluten-Free',
                  SPECIAL: '⭐ Specials',
                }[dietaryFilter] || 'All';

                const timeBudgetLabel = timeBudget === 0
                  ? 'Any time'
                  : timeBudgetOptions.find(b => b.mins === timeBudget)?.label;

                return (
                  <div className="flex items-center gap-2">

                    {/* ── Filter Dropdown Trigger ── */}
                    <div className="relative shrink-0" ref={filterPanelRef}>
                      <button
                        type="button"
                        onClick={() => {
                          setIsFilterOpen(o => !o);
                          setIsCategoryOpen(false);
                        }}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all shadow-xs ${
                          activeFilterCount > 0
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <SlidersHorizontal className="w-3.5 h-3.5" />
                        <span>Filters</span>
                        {activeFilterCount > 0 && (
                          <span className="bg-orange-400 text-white text-[9px] font-black rounded-full w-4 h-4 flex items-center justify-center leading-none">
                            {activeFilterCount}
                          </span>
                        )}
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isFilterOpen ? 'rotate-180' : ''}`} />
                      </button>

                      {/* ── Dropdown Panel ── */}
                      {isFilterOpen && (
                        <div className="absolute top-full left-0 mt-1.5 z-50 bg-white rounded-2xl border border-slate-200 shadow-xl p-4 w-72">

                          {/* Header */}
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                              <SlidersHorizontal className="w-3.5 h-3.5" /> Filters
                            </span>
                            {activeFilterCount > 0 && (
                              <button
                                type="button"
                                onClick={() => { setDietaryFilter('ALL'); setTimeBudget(0); }}
                                className="text-[10px] text-orange-500 font-bold hover:text-orange-700 flex items-center gap-0.5"
                              >
                                <X className="w-3 h-3" /> Clear all
                              </button>
                            )}
                          </div>

                          {/* ── Type: Veg / Non-Veg ── */}
                          <div className="mb-3">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Type</p>
                            <div className="flex flex-wrap gap-1.5">
                              {[
                                { val: 'ALL', label: 'All' },
                                { val: 'VEG', label: '🟢 Pure Veg' },
                                { val: 'NON_VEG', label: '🔴 Non-Veg' },
                              ].map(opt => (
                                <button
                                  key={opt.val}
                                  type="button"
                                  onClick={() => setDietaryFilter(opt.val)}
                                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                                    dietaryFilter === opt.val
                                      ? 'bg-slate-900 text-white border-slate-900'
                                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                                  }`}
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* ── Prep Time ── */}
                          <div className="mb-3">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Prep Time</p>
                            <div className="flex flex-wrap gap-1.5">
                              {timeBudgetOptions.map(b => (
                                <button
                                  key={b.mins}
                                  type="button"
                                  onClick={() => setTimeBudget(b.mins)}
                                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                                    timeBudget === b.mins
                                      ? 'bg-amber-500 text-white border-amber-500'
                                      : 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100'
                                  }`}
                                >
                                  {b.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* ── Dietary Tags ── */}
                          <div>
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Dietary</p>
                            <div className="flex flex-wrap gap-1.5">
                              {[
                                { val: 'SPECIAL', label: '⭐ Daily Specials' },
                                { val: 'VEGAN',   label: '🌱 Vegan' },
                                { val: 'GLUTEN_FREE', label: '🌾 Gluten-Free' },
                              ].map(opt => (
                                <button
                                  key={opt.val}
                                  type="button"
                                  onClick={() => setDietaryFilter(dietaryFilter === opt.val ? 'ALL' : opt.val)}
                                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                                    dietaryFilter === opt.val
                                      ? 'bg-emerald-600 text-white border-emerald-600'
                                      : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                                  }`}
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Active filter summary */}
                          {activeFilterCount > 0 && (
                            <div className="mt-3 pt-3 border-t border-slate-100 text-[10px] text-slate-500 font-medium flex flex-wrap gap-1">
                              {dietaryFilter !== 'ALL' && (
                                <span className="bg-slate-100 px-2 py-0.5 rounded-full">{dietaryLabel}</span>
                              )}
                              {timeBudget !== 0 && (
                                <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">{timeBudgetLabel}</span>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* ── Category Dropdown Trigger ── */}
                    {(() => {
                      const activeCatObj = categories.find(c => c.categoryId === activeCategory);
                      const isCatFiltered = activeCategory !== 'ALL' && Boolean(activeCatObj);
                      return (
                        <div className="relative shrink-0" ref={categoryPanelRef}>
                          <button
                            type="button"
                            onClick={() => {
                              setIsCategoryOpen(o => !o);
                              setIsFilterOpen(false);
                            }}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all shadow-xs ${
                              isCatFiltered
                                ? 'bg-[#0f172a] text-white border-[#0f172a]'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            <Utensils className="w-3.5 h-3.5" />
                            <span>Category</span>
                            {isCatFiltered && (
                              <span className="bg-white/20 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-md max-w-[110px] truncate">
                                {activeCatObj.icon || getCategoryIcon(activeCatObj.name)} {activeCatObj.name}
                              </span>
                            )}
                            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isCategoryOpen ? 'rotate-180' : ''}`} />
                          </button>

                          {isCategoryOpen && (
                            <div className="absolute top-full left-0 mt-1.5 z-50 bg-white rounded-2xl border border-slate-200 shadow-xl p-2 w-56 max-h-72 overflow-y-auto">
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveCategory('ALL');
                                  setIsCategoryOpen(false);
                                }}
                                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                                  activeCategory === 'ALL'
                                    ? 'bg-[#0f172a] text-white'
                                    : 'text-slate-700 hover:bg-slate-50'
                                }`}
                              >
                                <span>All Items</span>
                                {activeCategory === 'ALL' && <Check className="w-3.5 h-3.5" />}
                              </button>

                              {categories.map((cat) => {
                                const icon = cat.icon || getCategoryIcon(cat.name);
                                const isActive = activeCategory === cat.categoryId;
                                return (
                                  <button
                                    key={cat.categoryId}
                                    type="button"
                                    onClick={() => {
                                      setActiveCategory(cat.categoryId);
                                      setIsCategoryOpen(false);
                                    }}
                                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all mt-0.5 ${
                                      isActive
                                        ? 'bg-[#0f172a] text-white'
                                        : 'text-slate-800 hover:bg-slate-50'
                                    }`}
                                  >
                                    <span className="flex items-center gap-2 truncate">
                                      <span>{icon}</span>
                                      <span className="truncate">{cat.name}</span>
                                    </span>
                                    {isActive && <Check className="w-3.5 h-3.5 shrink-0" />}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                );
              })()}
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
                          {item.isSpecial && (
                            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-amber-500 text-white shrink-0">
                              ⭐ Special
                            </span>
                          )}
                        </div>

                        <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                          {item.description}
                        </p>

                        {item.isSweet && (
                          <div className="flex flex-wrap items-center gap-1 mt-1">
                            <span className="text-[9px] text-pink-600 bg-pink-50 px-1 py-0.5 rounded font-bold">Sweet</span>
                          </div>
                        )}
                      </div>

                      {/* Price & Add Button */}
                      <div className="flex items-center justify-between pt-2">
                        <span className="text-xs font-black text-slate-900">
                          ₹{item.portions && item.portions.length > 0 ? item.portions[0].price : item.price}
                        </span>

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
          </>
        )}
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
                <p className="text-xs font-bold leading-tight">
                  {activeOrder ? `Add to Table ${table?.tableNumber || ''} Bill` : `${tableTitle(table)} Cart`}
                </p>
                <p className="text-[11px] text-slate-400">
                  {activeOrder ? `Will add to Order #${activeOrder.orderNumber}` : `Tap to review & order`}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-sm font-black text-brand-400">₹{total.toFixed(2)}</span>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </div>
          </button>
        </div>
      )}

      {/* Floating Bottom Bar: Call for Bill when cart is empty & unpaid orders exist */}
      {itemCount === 0 && unpaidTableOrders.length > 0 && (
        <div className="fixed bottom-3 left-4 right-4 max-w-md mx-auto z-40 animate-slide-up">
          <button
            onClick={handleCallForBill}
            disabled={isCallingBill}
            className={`w-full ${billRequested ? 'bg-gradient-to-r from-emerald-600 to-teal-700' : 'bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-800'} text-white p-3.5 rounded-2xl shadow-2xl flex items-center justify-between transition-all active:scale-[0.99]`}
          >
            <div className="flex items-center space-x-3 text-left">
              <span className="w-8 h-8 rounded-xl bg-white/20 text-white font-black text-sm flex items-center justify-center shadow-inner">
                {billRequested ? <CheckCircle2 size={17} className="text-emerald-200" /> : <Receipt size={17} className="text-amber-300" />}
              </span>
              <div>
                <p className="text-xs font-bold leading-tight">
                  {billRequested ? 'Bill Requested' : 'Call for Bill'}
                </p>
                <p className="text-[11px] text-slate-300">
                  {billRequested ? 'Staff alerted · bringing bill to table' : `${tableTitle(table)} · Pay at table / reception`}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-sm font-black text-amber-300">
                ₹{totalUnpaidAmount.toFixed(2)}
              </span>
              {!billRequested && <ChevronRight className="w-4 h-4 text-slate-300" />}
            </div>
          </button>
        </div>
      )}

      {/* Floating Bottom Bar: Receipt when bill is paid & confirmed */}
      {itemCount === 0 && isBillPaidAndConfirmed && (
        <div className="fixed bottom-3 left-4 right-4 max-w-md mx-auto z-40 animate-slide-up">
          <button
            onClick={() => {
              setSelectedOrderForFeedback(tableOrders[0] || activeOrder);
              setIsFeedbackReceiptOpen(true);
            }}
            className="w-full bg-gradient-to-r from-emerald-600 to-teal-700 hover:opacity-95 text-white p-3.5 rounded-2xl shadow-xl flex items-center justify-between transition-all"
          >
            <div className="flex items-center space-x-3 text-left">
              <span className="w-8 h-8 rounded-xl bg-white/20 text-white font-black text-sm flex items-center justify-center shadow-inner">
                <CheckCircle2 size={17} />
              </span>
              <div>
                <p className="text-xs font-bold leading-tight">Bill Paid & Confirmed</p>
                <p className="text-[11px] text-emerald-100">Tap to view Receipt & Review</p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-sm font-black text-white">
                ₹{totalTableSpend.toFixed(2)}
              </span>
              <Receipt size={16} className="text-emerald-100" />
            </div>
          </button>
        </div>
      )}

      {/* Guest Identification Modal (Name & Phone required before placing) */}
      {isGuestModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div role="dialog" aria-modal="true" className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-black text-slate-900 leading-tight">
                  Guest Details · {tableTitle(table)}
                </h3>
                <p className="text-[11px] text-slate-500 mt-1">
                  Please enter your name and mobile number before placing your order.
                </p>
              </div>
              <button onClick={() => setIsGuestModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {guestError && (
              <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-600 font-semibold">
                {guestError}
              </div>
            )}

            <form onSubmit={handleGuestSubmit} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Your Name <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    required
                    maxLength={100}
                    placeholder="e.g. Rahul Sharma"
                    value={guestName}
                    onChange={e => setGuestName(e.target.value)}
                    className="w-full text-xs pl-9 pr-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Mobile Number <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    placeholder="10-digit mobile number"
                    value={guestPhone}
                    onChange={e => setGuestPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    className="w-full text-xs pl-9 pr-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setIsGuestModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPlacing}
                  className="flex-1 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-black shadow-md shadow-brand-500/20"
                >
                  {isPlacing ? 'Placing...' : 'Confirm & Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Customization Modal */}
      <ItemCustomizationModal
        isOpen={Boolean(selectedItemForModal)}
        onClose={() => setSelectedItemForModal(null)}
        item={selectedItemForModal}
        onAddToCart={(item, qty, cust, addons, note, portion) => {
          addItem(item, qty, cust, addons, note, portion);
          addToast(`Added ${item.name}${portion ? ` (${portion.name})` : ''} to cart.`, 'success');
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
        order={receiptOrder || activeOrder || tableOrders.find(o => o.status === 'PENDING_CONFIRMATION') || tableOrders[0]}
        onConfirmed={(received) => {
          if (received) {
            setActiveOrder(prev => prev ? { ...prev, status: 'DELIVERED' } : null);
          }
          if (table?.tableId) {
            api.getTableSession(table.tableId).then(sess => {
              if (sess) setTableSession(sess);
            }).catch(() => {});
          }
        }}
      />

      {/* Feature: My Orders & Past History Modal */}
      <MyOrdersModal
        isOpen={isMyOrdersOpen}
        onClose={() => setIsMyOrdersOpen(false)}
        orders={myOrdersHistory}
        onReorder={handleReorder}
      />

      {/* Feature 5: Entertainment & Table Lounge Modal (Matches User Screenshots) */}
      <WifiAndEntertainmentCard
        isOpen={isEntertainmentOpen}
        onClose={() => setIsEntertainmentOpen(false)}
        tableNumber={tableTitle(table)}
        lang={lang}
      />

      {/* Feature 8: Digital Receipt & Customer Feedback Modal */}
      <DigitalReceiptAndFeedbackModal
        isOpen={isFeedbackReceiptOpen}
        onClose={() => setIsFeedbackReceiptOpen(false)}
        order={selectedOrderForFeedback || tableOrders[0] || activeOrder}
        restaurantName={restaurant?.name || 'BistroPOS'}
        tableNumber={tableTitle(table)}
      />

      {/* Slide-over Cart Drawer */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        onCheckout={handleCheckoutClick}
      />
    </div>
  );
}
