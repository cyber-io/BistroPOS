const defaultRestaurantId = 'a0000000-0000-0000-0000-000000000001';

export function diningAreaForTable(table) {
  if (table?.diningArea) return table.diningArea;
  const qr = String(table?.qrIdentifier || '');
  if (qr.endsWith('_PARTY_HALL') || table?.tableId === 'c2000000-0000-0000-0000-000000000001') return 'party';
  if (/_FAMILY_C[1-4]$/.test(qr) || /^c1000000-0000-0000-0000-00000000000[1-4]$/.test(table?.tableId || '')) return 'family';
  const capacity = Number(table?.capacity);
  return capacity > 10 ? 'family' : capacity > 4 ? 'group' : 'everyday';
}

export function tableLabel(table) {
  if (!table) return 'Table';
  if (table.displayName) return table.displayName;
  if (table.tableDisplayName) return table.tableDisplayName;
  const family = String(table.qrIdentifier || '').match(/_FAMILY_(C[1-4])$/)
    || String(table.tableId || '').match(/^c1000000-0000-0000-0000-00000000000([1-4])$/);
  if (family) return family[1].startsWith('C') ? family[1] : `C${family[1]}`;
  if (String(table.qrIdentifier || '').endsWith('_PARTY_HALL') || table.tableId === 'c2000000-0000-0000-0000-000000000001') return 'Party hall';
  if (table.restaurantId === defaultRestaurantId) {
    if (Number(table.tableNumber) >= 101 && Number(table.tableNumber) <= 104) return `C${Number(table.tableNumber) - 100}`;
    if (Number(table.tableNumber) === 201) return 'Party hall';
  }
  return table.tableNumber ? `A${table.tableNumber}` : 'Table';
}

export function tableTitle(table) {
  const name = tableLabel(table);
  return name === 'Party hall' || name === 'Table' ? name : `Table ${name}`;
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
