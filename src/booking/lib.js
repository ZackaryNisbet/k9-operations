// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════
export function gid() { return crypto.randomUUID(); }

export function getMinDate(days = 1) {
  const d = new Date(); d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export function countNights(a, b) {
  if (!a || !b) return 0;
  return Math.max(0, Math.ceil((new Date(b) - new Date(a)) / 864e5));
}

export function fmtDate(d) {
  if (!d) return '';
  try { return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return d; }
}

export function fmtCurrency(n) { return '$' + (n || 0).toFixed(2); }

export function getAvailableCount(roomType, rooms, checkIn, checkOut, reservations) {
  // rooms is { "Luxury Suite": ["101","102",...], ... } — index by roomType key
  const roomList = Array.isArray(rooms?.[roomType]) ? rooms[roomType] : [];
  const total = roomList.length;
  if (!checkIn || !checkOut) return total;
  const resArr = Array.isArray(reservations) ? reservations : [];
  const booked = resArr.filter(r => {
    if (r.type !== 'boarding' || r.roomType !== roomType) return false;
    if (r.status === 'cancelled' || r.status === 'checked-out') return false;
    // Save-without-reserving does NOT hold rooms — skip these
    if (r.noDeposit) return false;
    return r.checkIn <= checkOut && r.checkOut >= checkIn;
  }).length;
  return Math.max(0, total - booked);
}
