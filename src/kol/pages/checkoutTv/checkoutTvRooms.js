// K9 Operations — CheckoutTVPage room parsing helpers
// Extracted verbatim from CheckoutTVPage.jsx. Pure functions — no behavior change.

/* ── Room parser (TV-004) ─────────────────────────────────────────────── */
export function parseRoom(room) {
  if (!room) return { label: "", number: "" };
  const dashMatch = room.match(/^(.+?)\s*-\s*(\d{1,3}\w*)/);
  if (dashMatch) {
    const typeShort = dashMatch[1].trim().replace(/\s*(Suite|Room|Compartment)/i, "");
    return { label: typeShort, number: dashMatch[2] };
  }
  const fallbackMatch = room.match(/^(.+?)\s+(\d{1,2})$/);
  if (fallbackMatch) {
    return { label: fallbackMatch[1], number: "" };
  }
  return { label: room, number: "" };
}

export function formatRoomDisplay(room) {
  const roomInfo = parseRoom(room);
  if (roomInfo.number) return `${roomInfo.label} ${roomInfo.number}`.trim();
  if (roomInfo.label) return roomInfo.label;
  return "";
}

export function formatAuditRoomDisplay(room, area) {
  return formatRoomDisplay(room) || area || "";
}
