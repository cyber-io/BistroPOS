import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const CartContext = createContext(null);
const validSources = ['DINE_IN_QR', 'DELIVERY', 'TAKEAWAY'];
function readContext() {
  try { const value = JSON.parse(localStorage.getItem('rs_cart_context') || 'null'); return value && validSources.includes(value.source) ? value : { source: 'DELIVERY', tableInfo: null }; }
  catch { return { source: 'DELIVERY', tableInfo: null }; }
}
export function customizationCharge(customization = {}) {
  return Object.values(customization).reduce((sum, value) => {
    const match = String(value).match(/\(\+₹?(\d+(?:\.\d+)?)\)/);
    return sum + (match ? Number(match[1]) : 0);
  }, 0);
}
export function CartProvider({ children }) {
  const [items, setItems] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('rs_cart_items') || '[]');
      if (!Array.isArray(saved)) return [];
      return saved.filter(item => item?.menuItemId && Number(item.quantity) > 0 && Number.isFinite(Number(item.price))).map(item => {
        const quantity = Math.min(99, Number(item.quantity));
        const addonCost = (item.addOns || []).reduce((sum, addon) => sum + Number(addon.price || 0), 0);
        const price = item.basePrice !== undefined ? Number(item.basePrice) + addonCost + customizationCharge(item.customization) : Number(item.price);
        return { ...item, price, quantity, lineTotal: price * quantity };
      });
    } catch { return []; }
  });
  const [tableInfo, setTableInfoState] = useState(() => readContext().tableInfo);
  const [orderSource, setOrderSourceState] = useState(() => readContext().source);
  const contextRef = useRef({ source: orderSource, tableInfo });
  const switchOrderContext = useCallback((source, nextTable = null) => {
    if (!validSources.includes(source)) return;
    const previous = contextRef.current;
    const wasDineIn = previous.source === 'DINE_IN_QR';
    const isDineIn = source === 'DINE_IN_QR';
    const table = isDineIn ? nextTable : null;
    const changedTable = wasDineIn && isDineIn && previous.tableInfo?.tableId && table?.tableId && previous.tableInfo.tableId !== table.tableId;
    if (wasDineIn !== isDineIn || changedTable) setItems([]);
    contextRef.current = { source, tableInfo: table };
    setOrderSourceState(source);
    setTableInfoState(table);
  }, []);
  const setOrderSource = useCallback(source => switchOrderContext(source, source === 'DINE_IN_QR' ? contextRef.current.tableInfo : null), [switchOrderContext]);
  const setTableInfo = useCallback(table => switchOrderContext(contextRef.current.source, table), [switchOrderContext]);
  useEffect(() => {
    try {
      localStorage.setItem('rs_cart_items', JSON.stringify(items));
      localStorage.setItem('rs_cart_context', JSON.stringify({ source: orderSource, tableInfo }));
    } catch { /* Browsing remains available when local storage is disabled. */ }
  }, [items, orderSource, tableInfo]);
  const addItem = useCallback((menuItem, quantity = 1, customization = {}, addOns = [], specialInstruction = '', portion = null) => {
    if (menuItem.availability === false) return;
    const count = Math.min(99, Math.max(1, Number(quantity) || 1));
    const extras = (addOns || []).reduce((sum, addon) => sum + Number(addon.price || 0), 0);
    const effectiveBasePrice = portion?.price !== undefined ? Number(portion.price) : Number(menuItem.price);
    const price = effectiveBasePrice + extras + customizationCharge(customization);
    const portionKey = portion ? `-${portion.name || portion.label}` : '';
    const itemKey = `${menuItem.menuItemId}${portionKey}-${JSON.stringify(customization)}-${(addOns || []).map(a=>a.name).sort().join(',')}-${specialInstruction.trim()}`;
    setItems(previous => {
      const existing = previous.find(item=>item.itemKey === itemKey);
      if (existing) return previous.map(item=>item.itemKey === itemKey ? { ...item, quantity:Math.min(99,item.quantity + count), lineTotal:Math.min(99,item.quantity + count)*price } : item);
      const cat = (menuItem.categoryName || '').toLowerCase();
      let defaultCourse = 'MAIN';
      if (/starter|appetizer|soup|salad|chaat/i.test(cat) || /tikka|kebab|fries|nachos/i.test(menuItem.name)) defaultCourse = 'STARTERS';
      else if (/dessert|ice cream|sweet/i.test(cat) || /brownie|jamun|halwa|kulfi/i.test(menuItem.name)) defaultCourse = 'DESSERTS';
      return [...previous, { itemKey, menuItemId:menuItem.menuItemId, name:menuItem.name + (portion ? ` (${portion.name || portion.label})` : ''), image:menuItem.image, vegNonveg:menuItem.vegNonveg, basePrice:effectiveBasePrice, price, quantity:count, customization, portion, addOns, specialInstruction, course: defaultCourse, lineTotal:count*price }];
    });
  }, []);
  const updateQuantity = useCallback((itemKey, delta) => setItems(previous=>previous.map(item=>item.itemKey === itemKey ? { ...item, quantity:Math.min(99,item.quantity+delta), lineTotal:Math.min(99,item.quantity+delta)*item.price } : item).filter(item=>item.quantity>0)), []);
  const updateItemCourse = useCallback((itemKey, course) => setItems(previous => previous.map(item => item.itemKey === itemKey ? { ...item, course } : item)), []);
  const removeItem = useCallback(itemKey => setItems(previous=>previous.filter(item=>item.itemKey!==itemKey)), []);
  const clearCart = useCallback(() => setItems([]), []);
  const subtotal = items.reduce((sum,item)=>sum+item.lineTotal,0);
  const tax = Math.round(subtotal*0.05*100)/100;
  const deliveryFee = orderSource==='DELIVERY' && items.length ? 40 : 0;
  const total = subtotal + tax + deliveryFee;
  const itemCount = items.reduce((sum,item)=>sum+item.quantity,0);
  return <CartContext.Provider value={{ items, itemCount, subtotal, tax, deliveryFee, total, tableInfo, setTableInfo, orderSource, setOrderSource, switchOrderContext, addItem, updateQuantity, updateItemCourse, removeItem, clearCart }}>{children}</CartContext.Provider>;
}
export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used within a CartProvider');
  return context;
}
