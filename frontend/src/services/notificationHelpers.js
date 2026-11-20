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
