import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { subscribeRealtimeEvents } from '../services/api';
import { soundEffects } from '../services/soundEffects';
import { useAuth } from './AuthContext';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const { role } = useAuth();
  const [toasts, setToasts] = useState([]);
  const [unreadAlerts, setUnreadAlerts] = useState([]);

  const addToast = useCallback((message, type = 'info', title = null) => {
    const id = Date.now() + Math.random();
    const newToast = { id, message, type, title };
    setToasts(prev => [newToast, ...prev].slice(0, 5));

    // Auto dismiss after 6 seconds
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 6000);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeRealtimeEvents((type, payload) => {
      // 1. Kitchen Alert: New incoming order
      if (type === 'NEW_ORDER') {
        if (role === 'KITCHEN' || role === 'SUPER_ADMIN') {
          soundEffects.playNewOrder();
          addToast(
            `New ${payload.source} Order #${payload.orderNumber} (₹${payload.total}) received!`,
            'alert',
            '👨‍🍳 Kitchen Alert'
          );
        }
      }

      // 2. Waiter Alert: Table order is ready for pickup
      if (type === 'TABLE_ORDER_READY') {
        if (role === 'WAITER' || role === 'SUPER_ADMIN') {
          soundEffects.playOrderReady();
          addToast(
            `TABLE NO ${payload.tableNumber} ORDER IS READY (Order #${payload.orderNumber})`,
            'success',
            '🛎️ Waiter Pickup Notice'
          );
        }
      }

      // 3. Waiter Alert: Customer Help call
      if (type === 'CUSTOMER_HELP_REQUEST') {
        if (role === 'WAITER' || role === 'RECEPTIONIST' || role === 'SUPER_ADMIN') {
          soundEffects.playHelpRequest();
          addToast(
            `TABLE ${payload.tableNumber} IS CALLING FOR HELP: "${payload.message}"`,
            'warning',
            '🆘 Table Assistance Call'
          );
        }
      }

      // 4. Receptionist Alert: Customer has not received order (Section 8 & 25)
      if (type === 'CUSTOMER_ORDER_NOT_RECEIVED') {
        if (role === 'RECEPTIONIST' || role === 'SUPER_ADMIN') {
          soundEffects.playHelpRequest();
          addToast(
            `TABLE ${payload.tableNumber} CUSTOMER HAS NOT RECEIVED ORDER #${payload.orderNumber}`,
            'error',
            '⚠️ Order Delivery Dispute'
          );
        }
      }

      // 5. Receptionist Alert: New table reservation
      if (type === 'NEW_TABLE_RESERVATION') {
        if (role === 'RECEPTIONIST' || role === 'SUPER_ADMIN') {
          soundEffects.playSuccess();
          addToast(
            `New Reservation ${payload.bookingId} for ${payload.customerName} (${payload.guestCount} guests)`,
            'info',
            '📅 Reservation Alert'
          );
        }
      }

      // 6. Customer Alert: Waiter is coming (Section 7)
      if (type === 'WAITER_HELP_ACCEPTED') {
        soundEffects.playSuccess();
        addToast(
          `The Waiter ${payload.waiterName} Is Coming to Table ${payload.tableNumber}.`,
          'success',
          'Assistance Assigned'
        );
      }

      // 7. Food availability changed (Section 15)
      if (type === 'FOOD_AVAILABILITY_CHANGED') {
        addToast(
          `Menu item availability updated across all panels.`,
          'info',
          'Menu Sync'
        );
      }

      // 8. Auto-reserve 10 mins before arrival alert
      if (type === 'TABLE_STATUS_UPDATED' && payload?.status === 'RESERVED') {
        if (['RECEPTIONIST', 'SUPER_ADMIN', 'WAITER'].includes(role)) {
          soundEffects.playSuccess();
          const tableNum = payload.tableNumber || payload.table?.tableNumber || '';
          addToast(
            `Table ${tableNum ? `A${tableNum}` : ''} is now RESERVED for ${payload.customerName || 'upcoming guest'} (arriving in 10 mins)`,
            'warning',
            '🔒 Table Auto-Reserved'
          );
        }
      }
    });

    return () => unsubscribe();
  }, [role, addToast]);

  return (
    <NotificationContext.Provider value={{
      toasts,
      addToast,
      removeToast,
      unreadAlerts,
      setUnreadAlerts
    }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotification must be used within a NotificationProvider');
  return context;
}
