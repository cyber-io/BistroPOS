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
