import { tableTitle } from './tablePresentation';

export function cleanPhone(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 10) return '91' + digits;
  return digits;
}

export function getRescheduleNotificationText(reservation, restaurantName = 'Bistro & Bloom') {
  if (!reservation) return '';
  const guest = reservation.customerName || 'Valued Guest';
  const bookingId = reservation.bookingId || '';
  const date = reservation.reservationDate || '';
  const time = reservation.reservationTimeFormatted || reservation.reservationTime?.slice(0, 5) || '';
  const table = reservation.tableNumber || reservation.tableId ? tableTitle(reservation) : 'your reserved table';
  
  return `Dear ${guest}, your table reservation (${bookingId}) at ${restaurantName} has been rescheduled to ${date} at ${time} at ${table}. If you need any assistance, feel free to reply here. Thank you!`;
}

export function getWhatsAppUrl(reservation, restaurantName = 'Bistro & Bloom') {
  const phone = cleanPhone(reservation?.customerPhone);
  const text = encodeURIComponent(getRescheduleNotificationText(reservation, restaurantName));
  if (!phone) return `https://wa.me/?text=${text}`;
  return `https://wa.me/${phone}?text=${text}`;
}

export function getSmsUrl(reservation, restaurantName = 'Bistro & Bloom') {
  const phone = cleanPhone(reservation?.customerPhone);
  const text = encodeURIComponent(getRescheduleNotificationText(reservation, restaurantName));
  return `sms:${phone}?body=${text}`;
}

export function getCancellationNotificationText(reservation, reason = '', restaurantName = 'Bistro & Bloom') {
  if (!reservation) return '';
  const guest = reservation.customerName || 'Valued Guest';
  const bookingId = reservation.bookingId || '';
  const reasonText = reason ? ` due to ${reason}` : ' due to an unforeseen operational inconvenience';
  
  return `Dear ${guest}, we regret to inform you that your table reservation (${bookingId}) at ${restaurantName} has been cancelled${reasonText}. We sincerely apologize for any inconvenience caused. Please reply to this message or call our reception if you would like to book an alternate slot. Thank you!`;
}

export function getCancelWhatsAppUrl(reservation, reason = '', restaurantName = 'Bistro & Bloom') {
  const phone = cleanPhone(reservation?.customerPhone);
  const text = encodeURIComponent(getCancellationNotificationText(reservation, reason, restaurantName));
  if (!phone) return `https://wa.me/?text=${text}`;
  return `https://wa.me/${phone}?text=${text}`;
}

export function getCancelSmsUrl(reservation, reason = '', restaurantName = 'Bistro & Bloom') {
  const phone = cleanPhone(reservation?.customerPhone);
  const text = encodeURIComponent(getCancellationNotificationText(reservation, reason, restaurantName));
  return `sms:${phone}?body=${text}`;
}

export function getBillMessageText(order, restaurantName = 'Bistro & Bloom', paid = false) {
  if (!order) return '';
  const items = order.items || [];
  const subtotal = Number(order.subtotal) || items.reduce((s, i) => s + (Number(i.lineTotal) || (Number(i.price || 0) * Number(i.quantity || 1))), 0);
  const tax = Number(order.tax) || 0;
  const discount = Number(order.discountAmount || order.loyaltyDiscount || 0);
  const total = Number(order.grandTotal || order.total) || Math.max(0, subtotal + tax - discount);
  const ref = order.orderNumber || order.sessionId || 'Order';
  const tableText = order.tableName || (order.tableNumber ? tableTitle(order) : '');
  const statusText = paid || order.paymentStatus === 'PAID' ? 'PAID' : 'PAYMENT DUE';

  const lines = [
    `*${restaurantName}* — Digital Bill`,
    `Ref: ${ref}${tableText ? ` (${tableText})` : ''}`,
    order.customerName && !String(order.customerName).startsWith('Table ') ? `Guest: ${order.customerName}` : null,
    `Date: ${new Date(order.startedAt || order.createdAt || Date.now()).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}`,
    '--------------------',
    ...items.map(i => {
      const qty = Number(i.quantity) || 1;
      const lineTotal = Number(i.lineTotal) || (Number(i.price || 0) * qty);
      return `${qty}x ${i.name || i.itemName} - ₹${lineTotal.toFixed(2)}`;
    }),
    '--------------------',
    `Subtotal: ₹${subtotal.toFixed(2)}`,
    tax > 0 ? `Tax: ₹${tax.toFixed(2)}` : null,
    discount > 0 ? `Discount: -₹${discount.toFixed(2)}` : null,
    `*Total (${statusText}): ₹${total.toFixed(2)}*`,
    '',
    'Thank you for dining with us!'
  ].filter(Boolean);

  return lines.join('\n');
}

export function getBillWhatsAppUrl(order, phoneOverride = '', restaurantName = 'Bistro & Bloom', paid = false) {
  const phone = cleanPhone(phoneOverride || order?.customerPhone);
  const text = encodeURIComponent(getBillMessageText(order, restaurantName, paid));
  if (!phone) return `https://wa.me/?text=${text}`;
  return `https://wa.me/${phone}?text=${text}`;
}

export function getBillSmsUrl(order, phoneOverride = '', restaurantName = 'Bistro & Bloom', paid = false) {
  const phone = cleanPhone(phoneOverride || order?.customerPhone);
  const text = encodeURIComponent(getBillMessageText(order, restaurantName, paid));
  return `sms:${phone}?body=${text}`;
}
