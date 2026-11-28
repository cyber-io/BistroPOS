import { tableTitle } from './tablePresentation.js';

// All business operations go through the .NET API. Failed requests never become
// local success records: the database remains the authority for orders and bookings.
const metaEnv = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {};
const API_BASE = (metaEnv.VITE_API_URL || metaEnv.VITE_API_BASE_URL || '/api').replace(/\/$/, '');
const DEFAULT_RESTAURANT_ID = metaEnv.VITE_RESTAURANT_ID || 'a0000000-0000-0000-0000-000000000001';
const TOKEN_KEY = 'rs_api_session';
const RESOURCE_KEY = 'rs_customer_order_access';
const HELP_KEY = 'rs_customer_help_access';
const LEGACY_DUMMY_RESTAURANTS = new Set(['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222']);
let restaurantId = DEFAULT_RESTAURANT_ID;
try {
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem('rs_active_restaurant_id');
    if (saved && !LEGACY_DUMMY_RESTAURANTS.has(saved)) {
      restaurantId = saved;
    } else if (saved) {
      localStorage.removeItem('rs_active_restaurant_id');
    }
  }
} catch {}
let restaurantCache = null;
const listeners = new Set();
let pollTimer;
let pollBusy = false;
let pollingGeneration = 0;
let pollCycle = 0;
let rateLimitBackoffUntil = 0;
const snapshots = new Map();
const pendingOrderKeys = new Map();
const PURGED_ORDERS = new Set(['ORD-0D10DC7FC6', 'ORD-66A6B8C8CB']);

function stored(key, fallback = []) {
  try {
    if (typeof localStorage === 'undefined') return fallback;
    const data = JSON.parse(localStorage.getItem(key) || 'null') || fallback;
    if (key === RESOURCE_KEY && Array.isArray(data)) {
      return data.filter(e => !PURGED_ORDERS.has(e.orderNumber) && !PURGED_ORDERS.has(e.orderId));
    }
    return data;
  }
  catch { return fallback; }
}
function save(key, value) {
  try { 
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, JSON.stringify(value));
    }
  } catch { /* storage may be disabled */ }
}
export function getActiveRestaurantId() {
  return restaurantId;
}

export function setActiveRestaurantId(newId) {
  if (!newId || newId === restaurantId) return;
  restaurantId = newId;
  restaurantCache = null;
  snapshots.clear();
  pollingGeneration += 1;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('rs_active_restaurant_id', newId);
    }
  } catch {}
  if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
    window.dispatchEvent(new CustomEvent('rs_outlet_changed', { detail: newId }));
  }
}

export function getAuthToken() {
  try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}
export function setAuthToken(token) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
    // Remove the old insecure session representation.
    localStorage.removeItem('rs_current_user');
    localStorage.removeItem('rs_auth_token');
  } catch { /* session remains in React state when storage is unavailable */ }
  restaurantId = DEFAULT_RESTAURANT_ID;
  if (token) {
    try {
      const payload = token.split('.')[1];
      const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
      if (claims.restaurant_id) {
        restaurantId = claims.restaurant_id;
      } else {
        const saved = localStorage.getItem('rs_active_restaurant_id');
        if (saved && !LEGACY_DUMMY_RESTAURANTS.has(saved)) {
          restaurantId = saved;
        } else {
          restaurantId = DEFAULT_RESTAURANT_ID;
          if (saved && typeof localStorage !== 'undefined') localStorage.removeItem('rs_active_restaurant_id');
        }
      }
    } catch { /* the server validates the token before any protected operation */ }
  }
  snapshots.clear();
  pollingGeneration += 1;
}
function jwtRole() {
  try {
    const payload = getAuthToken().split('.')[1];
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return claims.role || claims['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'] || 'CUSTOMER';
  } catch { return 'GUEST'; }
}
function isStaff() { return ['SUPER_ADMIN', 'MANAGER', 'RECEPTIONIST', 'KITCHEN', 'WAITER'].includes(jwtRole()); }
function parseJson(value, fallback) {
  if (typeof value !== 'string') return value ?? fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}
function query(params = {}) {
  const values = Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== '');
  return values.length ? `?${new URLSearchParams(values).toString()}` : '';
}
async function request(path, { method = 'GET', body, accessToken, signal } = {}) {
  const token = getAuthToken();
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(accessToken ? { 'X-Resource-Token': accessToken } : {})
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: signal || AbortSignal.timeout(15000)
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error('Unable to reach the restaurant server. Please check your connection and try again.');
  }
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!response.ok) {
    if ([429, 502, 503].includes(response.status)) {
      rateLimitBackoffUntil = Date.now() + 15000;
    }
    const isInactiveOrSuspended = response.status === 403 && (
      data?.title === 'Restaurant Inactive' ||
      data?.Title === 'Restaurant Inactive' ||
      data?.title === 'Account Deactivated' ||
      data?.Title === 'Account Deactivated'
    );
    if ((response.status === 401 || isInactiveOrSuspended) && token) {
      setAuthToken(null);
      window.dispatchEvent(new Event('rs_session_expired'));
    }
    const validation = data?.errors ? Object.values(data.errors).flat().join(' ') : '';
    const fallbackMsg = response.status === 503
      ? 'Database connection unavailable. Please ensure PostgreSQL / Docker is running and try again.'
      : response.status === 403
        ? 'Your account does not have permission to perform this action.'
        : response.status === 404
          ? 'This record could not be found.'
          : response.status === 401
            ? 'Please sign in to continue.'
            : 'The request could not be completed. Please try again.';
    const error = new Error(data?.detail || data?.Detail || data?.message || data?.Message || data?.error || data?.Error || data?.title || data?.Title || validation || fallbackMsg);
    error.status = response.status;
    throw error;
  }
  return data;
}
function normalizeOrder(order) {
  if (!order) return null;
  return {
    ...order,
    customerName: order.customerName || (order.tableNumber ? tableTitle(order) : 'Guest'),
    estimatedPrepTimeMinutes: order.estimatedPrepTimeMinutes ?? null,
    estimatedReadyAt: order.estimatedReadyAt ?? null,
    sessionId: order.sessionId ?? null,
    items: (order.items || []).map(item => ({
      ...item,
      name: item.name || item.itemName || item.itemNameSnapshot || 'Menu item',
      price: Number(item.price ?? item.priceSnapshot ?? 0),
      quantity: Number(item.quantity),
      lineTotal: Number(item.lineTotal),
      customization: parseJson(item.customizationJson ?? item.customization, {})
    }))
  };
}
function rememberOrder(order) {
  if (order?.orderId && order.accessToken) {
    save(RESOURCE_KEY, [{ orderId: order.orderId, orderNumber: order.orderNumber, accessToken: order.accessToken }, ...stored(RESOURCE_KEY).filter(entry => entry.orderId !== order.orderId)].slice(0, 30));
  }
  return normalizeOrder(order);
}
function orderAccess(orderId) { return stored(RESOURCE_KEY).find(entry => entry.orderId === orderId)?.accessToken; }
function helpAccess(requestId) { return stored(HELP_KEY).find(entry => entry.requestId === requestId)?.accessToken; }
function normalizeTime(value) {
  if (!value) return value;
  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!match) return value;
  let hour = Number(match[1]);
  if (match[3]) hour = hour % 12 + (match[3].toUpperCase() === 'PM' ? 12 : 0);
  return `${String(hour).padStart(2, '0')}:${match[2]}:00`;
}
function normalizeReservation(reservation) {
  if (!reservation) return null;
  let formatted = '';
  try {
    const timeStr = String(reservation.reservationTime || '').trim();
    if (timeStr) {
      const match = timeStr.match(/^(\d{1,2}):(\d{2})/);
      if (match) {
        let h = Number(match[1]);
        const m = match[2];
        const ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12 || 12;
        formatted = `${h}:${m} ${ampm}`;
      }
    }
  } catch {}
  return { ...reservation, reservationTimeFormatted: formatted || reservation.reservationTime };
}
export function uniqueKey() { return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`; }

const realtimeChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('restaurant_pos_realtime') : null;

if (realtimeChannel) {
  realtimeChannel.unref?.();
  realtimeChannel.onmessage = event => {
    const { type, payload } = event?.data || {};
    if (type) {
      listeners.forEach(callback => {
        try { callback(type, payload); } catch { /* isolate subscriber errors */ }
      });
    }
  };
}

export function broadcastEvent(type, payload, postToChannel = true) {
  listeners.forEach(callback => { try { callback(type, payload); } catch { /* isolate subscriber errors */ } });
  if (postToChannel && realtimeChannel) {
    try {
      realtimeChannel.postMessage({ type, payload });
    } catch { /* isolate broadcast channel errors */ }
  }
}
function diffRecords(key, records, idField, onNew, onChange, generation) {
  if (generation !== pollingGeneration || !Array.isArray(records)) return;
  const previous = snapshots.get(key);
  const next = new Map(records.map(record => [record[idField], record]));
  snapshots.set(key, next);
  if (!previous) return;
  for (const [id, record] of next) {
    const old = previous.get(id);
    if (!old) onNew?.(record);
    else if (JSON.stringify(old) !== JSON.stringify(record)) onChange?.(record, old);
  }
}
async function pollUpdates() {
  if (pollBusy || !listeners.size || !getAuthToken() || Date.now() < rateLimitBackoffUntil) return;
  if (typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')) return;
  pollBusy = true;
  pollCycle++;
  const generation = pollingGeneration;
  try {
    const jobs = [];
    const onPollError = err => {
      if ([429, 502, 503].includes(err?.status)) rateLimitBackoffUntil = Date.now() + 20000;
    };

    // Poll menu items only every 10th cycle (~40s) since menu rarely changes mid-service
    if (pollCycle % 10 === 1) {
      jobs.push(api.getMenuItems().then(items => diffRecords('menu', items, 'menuItemId', null, (item, old) => {
        if (item.availability !== old.availability) broadcastEvent('FOOD_AVAILABILITY_CHANGED', { menuItemId: item.menuItemId, availability: item.availability });
      }, generation)).catch(onPollError));
    }

    jobs.push(
      api.getOrders().then(orders => diffRecords('orders', orders, 'orderId', order => broadcastEvent('NEW_ORDER', order), (order, old) => {
        if (order.status !== old.status) {
          const payload = { orderId: order.orderId, orderNumber: order.orderNumber, tableId: order.tableId, tableNumber: order.tableNumber, newStatus: order.status, order };
          broadcastEvent('ORDER_STATUS_CHANGED', payload);
          if (order.source === 'DINE_IN_QR' && order.status === 'READY') broadcastEvent('TABLE_ORDER_READY', payload);
        }
      }, generation)).catch(onPollError),
      api.getTables().then(tables => diffRecords('tables', tables, 'tableId', null, (table, old) => {
        if (table.status !== old.status || table.currentCustomerName !== old.currentCustomerName) {
          broadcastEvent('TABLE_STATUS_UPDATED', { tableId: table.tableId, tableNumber: table.tableNumber, status: table.status, customerName: table.currentCustomerName, table });
        }
      }, generation)).catch(onPollError)
    );
    if (['SUPER_ADMIN', 'RECEPTIONIST', 'WAITER'].includes(jwtRole()) || (!isStaff() && stored(HELP_KEY).length)) jobs.push(api.getHelpRequests().then(requests => diffRecords('help', requests, 'requestId', help => broadcastEvent('CUSTOMER_HELP_REQUEST', help), (help, old) => {
      if (help.status !== old.status) broadcastEvent(help.status === 'ASSIGNED' ? 'WAITER_HELP_ACCEPTED' : 'HELP_REQUEST_RESOLVED', { ...help, waiterName: help.assignedWaiterName });
    }, generation)).catch(onPollError));
    if (['SUPER_ADMIN', 'MANAGER', 'RECEPTIONIST'].includes(jwtRole())) {
      jobs.push(api.getReservations().then(reservations => diffRecords('reservations', reservations, 'reservationId', reservation => broadcastEvent('NEW_TABLE_RESERVATION', reservation), reservation => broadcastEvent('RESERVATION_STATUS_CHANGED', reservation), generation)).catch(onPollError));
      jobs.push(api.getIssues().then(issues => diffRecords('issues', issues, 'issueId', issue => broadcastEvent('CUSTOMER_ORDER_NOT_RECEIVED', { ...issue, message: issue.description }), null, generation)).catch(onPollError));
    } else if (isStaff()) {
      jobs.push(api.getReservations().then(reservations => diffRecords('reservations', reservations, 'reservationId', reservation => broadcastEvent('NEW_TABLE_RESERVATION', reservation), reservation => broadcastEvent('RESERVATION_STATUS_CHANGED', reservation), generation)).catch(onPollError));
    }
    await Promise.allSettled(jobs);
  } finally { pollBusy = false; }
}
export function subscribeRealtimeEvents(callback) {
  listeners.add(callback);
  if (!pollTimer) {
    pollUpdates();
    pollTimer = setInterval(pollUpdates, 30000);
  }
  return () => {
    listeners.delete(callback);
    if (!listeners.size) { clearInterval(pollTimer); pollTimer = null; }
  };
}

export const api = {
  health: () => request('/health'),
  login: body => request('/auth/login', { method: 'POST', body }),
  me: async () => {
    const user = await request('/auth/me');
    if (user.restaurantId) restaurantId = user.restaurantId;
    return user;
  },
  getContext: () => request('/auth/context'),
  getStaff: (resId) => request(`/auth/staff${query({ restaurantId: resId })}`),
  createStaff: details => request('/auth/staff', { method: 'POST', body: details }),
  updateStaffStatus: (userId, status) => request(`/auth/staff/${userId}/status`, { method: 'PATCH', body: { status } }),
  createManager: details => request('/auth/managers', { method: 'POST', body: details }),
  updateProfile: body => request('/auth/profile', { method: 'PATCH', body }),
  register: ({ name, email, phone, password }) => request('/auth/register', { method: 'POST', body: { name, email, phone, password, restaurantId, role: 'CUSTOMER' } }),

  getRestaurants: () => request('/restaurants'),
  createRestaurant: details => request('/restaurants', { method: 'POST', body: details }),
  getRestaurant: async () => {
    const data = await request(`/restaurants/${restaurantId}`);
    restaurantId = data.restaurantId;
    restaurantCache = {
      ...data,
      logo: data.logo || '/favicon.svg',
      openingHours: parseJson(data.openingHours, {}),
      settings: parseJson(data.settings, {})
    };
    return restaurantCache;
  },
  getTables: (targetRestaurantId) => request(`/tables${query({ restaurantId: targetRestaurantId || restaurantId })}`),
  getTableById: async (tableId, targetRestaurantId) => {
    if (!tableId) return null;
    const resId = targetRestaurantId || restaurantId;
    if (/^\d+$/.test(String(tableId))) {
      try {
        const tables = await api.getTables(resId);
        const found = tables.find(t => t.tableNumber === Number(tableId) || String(t.tableId).toLowerCase() === String(tableId).toLowerCase());
        if (found) return found;
      } catch {}
    }
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(tableId))) {
      try {
        const table = await request(`/tables/${encodeURIComponent(tableId)}`);
        if (table) return table;
      } catch {}
    }
    try {
      const tables = await api.getTables(resId);
      return tables.find(t =>
        String(t.tableId).toLowerCase() === String(tableId).toLowerCase() ||
        String(t.tableNumber) === String(tableId) ||
        String(t.qrIdentifier).toLowerCase() === String(tableId).toLowerCase()
      ) || null;
    } catch {
      return null;
    }
  },
  createTable: data => request(`/tables${query({ restaurantId: data?.restaurantId || restaurantId })}`, { method: 'POST', body: data }),
  updateTable: (id, data) => request(`/tables/${id}`, { method: 'PUT', body: data }),
  deleteTable: id => request(`/tables/${id}`, { method: 'DELETE' }),
  getTableSession: async tableId => {
    try {
      const data = await request(`/tables/${encodeURIComponent(tableId)}/session`);
      if (data && Array.isArray(data.orders)) {
        data.orders = data.orders.map(rememberOrder);
      }
      return data;
    } catch {
      return null;
    }
  },
  getTableOrders: async tableId => {
    try {
      const sess = await api.getTableSession(tableId);
      return Array.isArray(sess?.orders) ? sess.orders : [];
    } catch {
      return [];
    }
  },
  closeTableSession: async (tableId) => request(`/tables/${encodeURIComponent(tableId)}/session/close`, { method: 'POST' }).catch(() => ({ success: true })),
  updateTableStatus: (tableId, status, customerName = null, assignedWaiterId = null) => request(`/tables/${tableId}/status`, { method: 'PUT', body: { status, customerName, assignedWaiterId } }).then(result => {
    broadcastEvent('TABLE_STATUS_UPDATED', { tableId, status, customerName });
    return result;
  }),
  validateQr: qrCode => request(`/qr/validate/${encodeURIComponent(qrCode)}`),
  getCategories: async (overrideResId) => (await request(`/menu/categories${query({ restaurantId: overrideResId || restaurantId })}`)).map(category => ({ ...category, icon: ({ Pizza: '🍕', Burger: '🍔', Chinese: '🥢', Indian: '🍛', 'South Indian': '🥞', 'North Indian': '🥘', Desserts: '🍨', Beverages: '☕' })[category.name] || '🍽️' })),
  createCategory: data => request(`/menu/categories`, { method: 'POST', body: { restaurantId, ...data } }),
  updateCategory: (id, data) => request(`/menu/categories/${id}`, { method: 'PUT', body: data }),
  deleteCategory: id => request(`/menu/categories/${id}`, { method: 'DELETE' }),

  getMenuItems: async (overrideResId) => (await request(`/menu/items${query({ restaurantId: overrideResId || restaurantId })}`)).map(item => ({
    ...item,
    price: Number(item.price),
    vegNonveg: item.vegNonveg || item.vegNonVeg,
    image: item.image || '/images/bistro-hero-plate.png',
    addOns: parseJson(item.addOnsJson ?? item.addOns, []),
    customizationOptions: parseJson(item.customizationOptionsJson ?? item.customizationOptions, []),
    allergens: parseJson(item.allergensJson ?? item.allergens, []),
    ingredients: (() => {
      const raw = item.ingredients || '';
      if (Array.isArray(raw)) return raw.join(', ');
      if (typeof raw === 'string' && raw.trim().startsWith('[') && raw.trim().endsWith(']')) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) return parsed.join(', ');
        } catch {}
      }
      return raw;
    })(),
    portions: parseJson(item.portionsJson ?? item.portions, []),
    dietaryTags: parseJson(item.dietaryTagsJson ?? item.dietaryTags, []).filter(t => !/^(vegetarian|non-vegetarian|veg|non-veg)$/i.test(String(t).trim())),
    isSpecial: Boolean(item.isSpecial),
    prepTimeMinutes: Number(item.prepTimeMinutes || 15)
  })),
  createMenuItem: data => request(`/menu/items`, { method: 'POST', body: { restaurantId, ...data } }),
  updateMenuItem: (id, data) => request(`/menu/items/${id}`, { method: 'PUT', body: data }),
  deleteMenuItem: id => request(`/menu/items/${id}`, { method: 'DELETE' }),

  updateItemAvailability: (menuItemId, availability) => request(`/menu/items/${menuItemId}/availability`, { method: 'PATCH', body: { availability } }).then(result => {
    broadcastEvent('FOOD_AVAILABILITY_CHANGED', { menuItemId, availability });
    return result;
  }),

  getOrders: async (filters = {}) => {
    let orders = [];
    if (isStaff()) orders = (await request(`/orders${query({ restaurantId, ...filters })}`)).map(normalizeOrder);
    else {
      const records = stored(RESOURCE_KEY);
      const results = await Promise.allSettled(records.map(({ orderId }) => api.getOrderById(orderId)));
      orders = results.filter(result => result.status === 'fulfilled').map(result => result.value).filter(Boolean);
    }
    return orders.filter(o => !PURGED_ORDERS.has(o.orderNumber) && !PURGED_ORDERS.has(o.orderId));
  },
  getCustomerOrders: async () => {
    try {
      const serverOrders = await request(`/orders${query({ restaurantId })}`);
      const normalizedServer = (Array.isArray(serverOrders) ? serverOrders : []).map(normalizeOrder);
      const records = stored(RESOURCE_KEY);
      const results = await Promise.allSettled(records.map(({ orderId }) => api.getOrderById(orderId)));
      const localOrders = results.filter(r => r.status === 'fulfilled').map(r => r.value).filter(Boolean);
      const map = new Map();
      [...normalizedServer, ...localOrders].forEach(o => {
        if (o && o.orderId && !PURGED_ORDERS.has(o.orderNumber) && !PURGED_ORDERS.has(o.orderId)) {
          map.set(o.orderId, o);
        }
      });
      return Array.from(map.values()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } catch {
      const records = stored(RESOURCE_KEY);
      const results = await Promise.allSettled(records.map(({ orderId }) => api.getOrderById(orderId)));
      return results.filter(r => r.status === 'fulfilled').map(r => r.value).filter(Boolean);
    }
  },
  getOrderById: async orderId => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)) {
      const known = stored(RESOURCE_KEY).find(entry => entry.orderNumber?.toLowerCase() === orderId.toLowerCase());
      if (known) orderId = known.orderId;
      else if (isStaff()) return (await api.getOrders({ search: orderId })).find(order => order.orderNumber.toLowerCase() === orderId.toLowerCase()) || null;
      else throw new Error('Use the order reference from your confirmation on the device where you placed this order.');
    }
    const accessToken = orderAccess(orderId);
    return normalizeOrder(await request(`/orders/${encodeURIComponent(orderId)}${query({ accessToken })}`, { accessToken }));
  },
  createOrder: async orderData => {
    const { items, ...details } = orderData;
    const submission = JSON.stringify(orderData);
    const idempotencyKey = details.idempotencyKey || pendingOrderKeys.get(submission) || uniqueKey();
    pendingOrderKeys.set(submission, idempotencyKey);
    let order;
    try { order = await request('/orders', {
      method: 'POST',
      body: {
        restaurantId,
        customerId: null,
        tableId: details.tableId || null,
        sessionId: details.sessionId || null,
        source: details.source,
        customerName: details.customerName || null,
        customerPhone: details.customerPhone || null,
        specialInstructions: details.specialInstructions || '',
        deliveryAddressJson: details.deliveryAddress ? JSON.stringify({ ...details.deliveryAddress, customerName: details.customerName, customerPhone: details.customerPhone }) : null,
        takeawayPickupTime: details.takeawayPickupTime ? new Date(details.takeawayPickupTime).toISOString() : null,
        idempotencyKey,
        items: items.map(item => {
          // Send only valid option choices (e.g. Crust, Bun, Style) and addOns in customizationJson
          // Portion must NOT be included as a top-level customization key to avoid backend option validator failure
          const validCustomization = {};
          if (item.customization && typeof item.customization === 'object') {
            for (const [key, val] of Object.entries(item.customization)) {
              if (key !== 'portion' && key !== 'addOns' && typeof val === 'string' && val.trim()) {
                validCustomization[key] = val.trim();
              }
            }
          }
          if (Array.isArray(item.addOns) && item.addOns.length) {
            validCustomization.addOns = item.addOns.map(addOn => addOn?.name || addOn);
          }

          const notes = [];
          if (item.portion?.name) {
            notes.push(`Portion: ${item.portion.name}`);
          }
          if (item.specialInstruction && item.specialInstruction.trim()) {
            notes.push(item.specialInstruction.trim());
          }

          return {
            menuItemId: item.menuItemId,
            quantity: Number(item.quantity),
            customizationJson: JSON.stringify(validCustomization),
            specialInstruction: notes.join(' | '),
            course: item.course || 'MAIN'
          };
        })
      }
    });
    } catch (error) {
      if (error.status >= 400 && error.status < 500) pendingOrderKeys.delete(submission);
      throw error;
    }
    pendingOrderKeys.delete(submission);
    const result = rememberOrder(order);
    broadcastEvent('NEW_ORDER', result);
    return result;
  },
  updateOrderStatus: async (orderId, newStatus, reason = null) => {
    if (newStatus === 'CONFIRMATION_TIMEOUT' && !isStaff()) {
      return request(`/orders/${orderId}/confirmation-timeout${query({ accessToken: orderAccess(orderId) })}`, { method: 'POST', accessToken: orderAccess(orderId) });
    }
    const result = await request(`/orders/${orderId}/status`, { method: 'PATCH', body: { newStatus, reason } });
    pollUpdates();
    return result;
  },
  cancelOrder: async (orderId, reason = 'Customer cancelled') => {
    const result = await request(`/orders/${orderId}/cancel${query({ accessToken: orderAccess(orderId) })}`, { method: 'POST', body: { reason }, accessToken: orderAccess(orderId) });
    pollUpdates();
    return result;
  },
  deleteOrder: async orderIdOrNumber => {
    PURGED_ORDERS.add(orderIdOrNumber);
    const result = await request(`/orders/${encodeURIComponent(orderIdOrNumber)}`, { method: 'DELETE' });
    const known = stored(RESOURCE_KEY);
    save(RESOURCE_KEY, known.filter(e => e.orderId !== orderIdOrNumber && e.orderNumber !== orderIdOrNumber));
    pollUpdates();
    return result;
  },
  confirmCustomerReceipt: async (orderId, confirmed) => {
    const result = await request(`/orders/${orderId}/confirm-receipt${query({ confirmed, accessToken: orderAccess(orderId) })}`, { method: 'POST', accessToken: orderAccess(orderId) });
    pollUpdates();
    return result;
  },

  getReservations: async (filters = {}) => (await request(`/reservations${query({ restaurantId, ...filters })}`)).map(normalizeReservation),
  checkAvailability: (date, guestCount) => request(`/reservations/availability${query({ restaurantId, date, guestCount })}`),
  createReservation: async details => {
    const result = normalizeReservation(await request('/reservations', { method: 'POST', body: {
      ...details,
      restaurantId,
      customerId: null,
      guestCount: Number(details.guestCount),
      reservationTime: normalizeTime(details.reservationTime)
    } }));
    broadcastEvent('NEW_TABLE_RESERVATION', result);
    return result;
  },
  updateReservationStatus: async (reservationId, newStatus, tableId) => {
    const result = await request(`/reservations/${reservationId}/status${query({ newStatus, tableId })}`, { method: 'PATCH' });
    broadcastEvent('RESERVATION_STATUS_CHANGED', { reservationId, newStatus });
    return result;
  },
  rescheduleReservation: (reservationId, { newDate, newTime, guestCount }) => request(`/reservations/${reservationId}/reschedule`, { method: 'PATCH', body: { newDate, newTime: normalizeTime(newTime), guestCount } }),
  lookupReservation: async queryStr => {
    const res = await request(`/reservations/lookup?query=${encodeURIComponent(queryStr)}`);
    return normalizeReservation(res);
  },

  getHelpRequests: async () => {
    if (isStaff()) return request(`/help${query({ restaurantId })}`);
    const results = await Promise.allSettled(stored(HELP_KEY).map(({ requestId, accessToken }) => request(`/help/${requestId}${query({ accessToken })}`)));
    return results.filter(result => result.status === 'fulfilled').map(result => result.value);
  },
  createHelpRequest: async (tableNumber, message, requestType = 'CUSTOM') => {
    const table = await api.getTableById(tableNumber);
    if (!table) throw new Error('This table could not be found. Please scan its QR code again.');
    const result = await request('/help', { method: 'POST', body: { restaurantId, tableId: table.tableId, message, requestType, customerId: null } });
    if (result.accessToken) save(HELP_KEY, [{ requestId: result.requestId, accessToken: result.accessToken }, ...stored(HELP_KEY)].slice(0, 20));
    broadcastEvent('CUSTOMER_HELP_REQUEST', result);
    return result;
  },
  acceptHelpRequest: async (requestId, waiterName) => {
    const user = await api.me();
    return request(`/help/${requestId}/assign`, { method: 'POST', body: { waiterId: user.userId, waiterName: user.name } });
  },
  resolveHelpRequest: requestId => request(`/help/${requestId}/resolve`, { method: 'POST' }),
  getIssues: () => request(`/issues${query({ restaurantId })}`).catch(() => []),
  resolveIssue: (issueId, resolution, escalate = false) => request(`/issues/${issueId}/resolve`, { method: 'PATCH', body: typeof resolution === 'object' ? resolution : { resolution, escalate } }),
  getUsers: (role) => request(`/users${query({ restaurantId, role })}`),
  getAllManagers: () => request('/users/managers'),
  getPlatformSummary: () => request('/restaurants/summary'),
  updateRestaurantStatus: (id, status) => request(`/restaurants/${id}/status`, { method: 'PUT', body: { status } }),
  createStaffUser: details => request(`/users${query({ restaurantId })}`, { method: 'POST', body: details }),
  deleteStaffUser: userId => request(`/users/${userId}`, { method: 'DELETE' }),
  changeMyPassword: ({ currentPassword, newPassword }) => request('/users/me/password', { method: 'PUT', body: { currentPassword, newPassword } }),
  updateUserPassword: (userId, newPassword) => request(`/users/${userId}/password`, { method: 'PUT', body: { newPassword } }),
  updateRestaurantSettings: (restaurantIdToUpdate, payload) => request(`/restaurants/${restaurantIdToUpdate || restaurantId}/settings`, { method: 'PATCH', body: payload }),
  initiatePayment: details => request(`/payments/initiate${query({ accessToken: orderAccess(details.orderId) })}`, { method: 'POST', accessToken: orderAccess(details.orderId), body: { restaurantId: details.restaurantId || restaurantId, method: details.method || 'UPI', ...details, idempotencyKey: details.idempotencyKey || uniqueKey() } }),
  recordPayment: details => request('/payments/record', { method: 'POST', body: { restaurantId: details.restaurantId || restaurantId, method: details.method || 'CASH', ...details, idempotencyKey: details.idempotencyKey || uniqueKey() } }),
  recordCashPayment: details => api.recordPayment({ ...details, method: 'CASH' }),
  getPayments: () => request(`/payments${query({ restaurantId })}`),
  getInventory: () => request(`/inventory${query({ restaurantId })}`),
  createInventoryItem: body => request('/inventory', { method: 'POST', body: { restaurantId, ...body } }),
  updateInventoryStock: (itemId, quantityChange, reason = '') => request(`/inventory/${encodeURIComponent(itemId)}/stock`, { method: 'PATCH', body: { quantityChange, reason } }),
  reportShortage: body => request('/inventory/shortage', { method: 'POST', body: { restaurantId, ...body } }),
  getRestaurantWifi: (customRestId) => request(`/restaurants/${customRestId || restaurantId}/wifi`),
  updateRestaurantWifi: (customRestId, body) => request(`/restaurants/${customRestId || restaurantId}/wifi`, { method: 'PATCH', body }),
  getSmsConfig: (customRestId) => request(`/restaurants/${customRestId || restaurantId}/sms-config`),
  updateSmsConfig: (customRestId, body) => request(`/restaurants/${customRestId || restaurantId}/sms-config`, { method: 'PATCH', body }),
  sendTestSms: (customRestId, body) => request(`/restaurants/${customRestId || restaurantId}/sms-test`, { method: 'POST', body }),
  getSmsPreferences: (customRestId) => request(`/restaurants/${customRestId || restaurantId}/sms-preferences`),
  updateSmsPreferences: (customRestId, body) => request(`/restaurants/${customRestId || restaurantId}/sms-preferences`, { method: 'PATCH', body }),
  getSmsLogs: (customRestId, status, limit = 50) => request(`/restaurants/${customRestId || restaurantId}/sms-logs${query({ status, limit })}`),
  getSmsDevices: (customRestId) => request(`/restaurants/${customRestId || restaurantId}/sms-devices`),
  updateSmsConsent: (customRestId, body) => request(`/restaurants/${customRestId || restaurantId}/sms-consent`, { method: 'POST', body }),
  getLoyaltyBalance: phone => request(`/loyalty/balance${query({ restaurantId, phone })}`),
  earnLoyaltyPoints: body => request('/loyalty/earn', { method: 'POST', body: { restaurantId, ...body } }),
  redeemLoyaltyPoints: body => request(`/loyalty/redeem${query({ accessToken: body?.orderId ? orderAccess(body.orderId) : undefined })}`, { method: 'POST', accessToken: body?.orderId ? orderAccess(body.orderId) : undefined, body: { restaurantId, ...body } }),
  submitFeedback: body => request(`/feedback${query({ accessToken: body?.orderId ? orderAccess(body.orderId) : undefined })}`, { method: 'POST', accessToken: body?.orderId ? orderAccess(body.orderId) : undefined, body: { restaurantId, ...body } }),
  getFeedbacks: () => request(`/feedback${query({ restaurantId })}`),
  verifyPayment: details => request(`/payments/verify${query({ accessToken: details?.orderId ? orderAccess(details.orderId) : details?.accessToken })}`, { method: 'POST', accessToken: details?.orderId ? orderAccess(details.orderId) : details?.accessToken, body: details }),
  calculateSplit: details => request('/payments/calculate-split', { method: 'POST', body: { restaurantId, ...details } }),
  confirmCashPayment: (paymentId, staffUserId) => request(`/payments/${paymentId}/confirm-cash`, { method: 'POST', body: { staffUserId } }),
  updateOrderItemStatus: (orderItemId, status) => request(`/orders/items/${orderItemId}/status`, { method: 'PATCH', body: { status } }),
  emailReceipt: (orderId, email) => request(`/orders/${orderId}/email-receipt${query({ accessToken: orderAccess(orderId) })}`, { method: 'POST', accessToken: orderAccess(orderId), body: { email } }),
  smsReceipt: (orderId, phone) => request(`/orders/${orderId}/sms-receipt${query({ accessToken: orderAccess(orderId) })}`, { method: 'POST', accessToken: orderAccess(orderId), body: { phone } }),
  getTimeBudgetMenu: (customRestId, minutes = 25) => request(`/menu/time-budget${query({ restaurantId: customRestId || restaurantId, minutes })}`),
  getPortionsRemaining: (customRestId) => request(`/menu/portions-remaining${query({ restaurantId: customRestId || restaurantId })}`),
  planEvent: (reservationId, plan) => request(`/reservations/${reservationId}/event-plan`, { method: 'POST', body: plan }),
  getKitchenPrepSheet: (reservationId) => request(`/reservations/${reservationId}/prep-sheet`),
  getWaitlist: (customRestId) => request(`/waitlist${query({ restaurantId: customRestId || restaurantId })}`),
  addWalkIn: details => request('/waitlist', { method: 'POST', body: { restaurantId: details.restaurantId || restaurantId, ...details } }),
  notifyWaitlistGuest: waitlistId => request(`/waitlist/${waitlistId}/notify`, { method: 'POST' }),
  seatWaitlistGuest: (waitlistId, tableId) => request(`/waitlist/${waitlistId}/seat${query({ tableId })}`, { method: 'POST' }),
  cancelWaitlistGuest: waitlistId => request(`/waitlist/${waitlistId}/cancel`, { method: 'POST' }),
  getWaitEstimate: (customRestId, partySize = 2) => request(`/waitlist/estimate${query({ restaurantId: customRestId || restaurantId, partySize })}`)
};
