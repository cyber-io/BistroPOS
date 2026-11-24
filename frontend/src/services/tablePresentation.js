const defaultRestaurantId = 'a0000000-0000-0000-0000-000000000001';

export function diningAreaForTable(table) {
  const explicit = String(table?.diningArea || '').trim().toLowerCase();
  if (['everyday', 'group', 'family', 'party'].includes(explicit)) return explicit;
  const qr = String(table?.qrIdentifier || '');
  if (qr.endsWith('_PARTY_HALL') || table?.tableId === 'c2000000-0000-0000-0000-000000000001' || Number(table?.tableNumber) === 201) return 'party';
  if (/_FAMILY_C[1-4]$/.test(qr) || /^c1000000-0000-0000-0000-00000000000[1-4]$/.test(table?.tableId || '') || (Number(table?.tableNumber) >= 101 && Number(table?.tableNumber) <= 104)) return 'family';
  const capacity = Number(table?.capacity);
  return capacity > 10 ? 'family' : capacity > 4 ? 'group' : 'everyday';
}

export function tableLabel(table) {
  if (!table) return 'Table';
  if (table.displayName) return table.displayName;
  if (table.tableDisplayName) return table.tableDisplayName;
  if (String(table.qrIdentifier || '').endsWith('_PARTY_HALL') || table.tableId === 'c2000000-0000-0000-0000-000000000001' || Number(table.tableNumber) === 201) {
    return 'Party Hall';
  }
  const num = Number(table.tableNumber);
  if (!isNaN(num) && num > 0) {
    return String(num);
  }
  return 'Table';
}

export function tableTitle(table) {
  const name = tableLabel(table);
  return name === 'Party Hall' || name === 'Party hall' || name === 'Table' ? name : `Table ${name}`;
}

export function getPublicOrigin(restaurant) {
  if (restaurant?.settings?.publicWebsiteUrl) {
    try {
      const url = new URL(restaurant.settings.publicWebsiteUrl);
      if (['http:', 'https:'].includes(url.protocol)) return url.origin;
    } catch {}
  }

  // If running in browser and accessed via a real network IP or hostname (not loopback),
  // prefer window.location.origin so QR codes automatically match the active network address.
  if (typeof window !== 'undefined' && window.location) {
    const host = window.location.hostname;
    const isLoopback = ['localhost', '127.0.0.1', '[::1]', '0.0.0.0'].includes(host);
    if (!isLoopback) {
      return window.location.origin;
    }
  }

  // Fallback to configured VITE_PUBLIC_SITE_URL (e.g. for Electron desktop or when accessed via localhost)
  const envUrl = import.meta.env?.VITE_PUBLIC_SITE_URL;
  if (envUrl) {
    try {
      const url = new URL(envUrl);
      if (['http:', 'https:'].includes(url.protocol)) return url.origin;
    } catch {}
  }

  return typeof window !== 'undefined' ? window.location.origin : '';
}

export function getTableQrUrl(restaurant, table) {
  const origin = getPublicOrigin(restaurant);
  const resId = table?.restaurantId || restaurant?.restaurantId || defaultRestaurantId;
  const tableId = table?.tableId || '';
  return origin ? `${origin}/qr/${resId}/${tableId}` : '';
}
