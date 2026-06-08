// K9 Operations — DailyOps room-cleaning helpers.
// Extracted verbatim from DailyOpsPage.jsx (pure functions/constants, no page state).
import { C, titleCase } from "../../../shared/theme";

export const sanitizeRoomKey = (name) => (name || '').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase();
export const roomTaskTypes = ["room_refresh", "full_disinfect", "setup", "sanitize"];
export const getRoomTaskLabel = (taskType) => {
  switch (taskType) {
    case "room_refresh": return "Room Refresh";
    case "full_disinfect": return "Full Disinfect";
    case "setup": return "Set Up";
    case "sanitize": return "Sanitize";
    default: return titleCase(String(taskType || "Task").replace(/_/g, " "));
  }
};
export const getRoomTaskAccent = (taskType) => {
  switch (taskType) {
    case "room_refresh": return "#D97706";
    case "full_disinfect": return C.dan;
    case "setup": return "#14532D";
    case "sanitize": return C.acc;
    default: return C.pri;
  }
};
export const isRoomTaskCompletedFromLegacyState = (task, state) => {
  if (!state || typeof state !== "object") return false;
  if (state.completed || state.checked || state.done) return true;
  if (task?.task_type === "room_refresh" && state.refresh) return true;
  if (task?.task_type === "full_disinfect" && state.disinfect) return true;
  if (task?.task_type === "setup" && state.setupDone) return true;
  if (task?.task_type === "sanitize" && (state.asNeededDone || state.sanitizeDone)) return true;
  return false;
};

// ─── Room Display Helper: resolve room_assignment to a clean display label ──
// Handles room names like "DC1", "SC5", "Luxury Suite 101", "Double Compartment DC1", etc.
// Returns { display: "DC1", roomType: "Double Compartment" } or { display: "101", roomType: "Luxury Suite" }
export const resolveRoomDisplay = (room) => {
  if (!room) return { display: "—", roomType: null };
  const r = room.trim();
  // If room is a short code like "DC1", "SC5", keep it as-is
  if (/^[A-Z]{1,3}\d+[A-Za-z]?$/.test(r)) return { display: r, roomType: r.startsWith("DC") ? "Double Compartment" : r.startsWith("SC") ? "Single Compartment" : null };
  // If room is a full name like "Double Compartment DC1" or "Luxury Suite 101", extract the identifier
  const match = r.match(/(?:Luxury Suite|Executive Room|Double Compartment|Single Compartment)\s+(.+)/i);
  if (match) {
    const id = match[1].trim();
    const roomType = r.toLowerCase().includes("luxury") ? "Luxury Suite"
      : r.toLowerCase().includes("executive") ? "Executive Room"
      : r.toLowerCase().includes("double") ? "Double Compartment"
      : r.toLowerCase().includes("single") ? "Single Compartment" : null;
    return { display: id, roomType };
  }
  // If room is a number-like value (e.g. "101", "5A"), return as-is
  if (/^\d+[A-Za-z]?$/.test(r)) return { display: r, roomType: null };
  // Fallback: return the whole room name
  return { display: r, roomType: null };
};
