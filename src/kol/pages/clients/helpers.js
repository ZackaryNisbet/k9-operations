// K9 Operations — shared pure helpers for the client lifecycle pages.
// Logic-free moves extracted verbatim from ClientDetailPage; domain logic continues
// to live in src/kol/clientManagementData.js. See AGENTS.md for the dev contract.

import { C, titleCase } from "../../../shared/theme";
import { EVENT_TYPE_STYLES } from "./constants";

export function confidenceColor(c) {
  if (c >= 0.9) return C.suc;
  if (c >= 0.7) return C.info;
  if (c >= 0.5) return "#D97706";
  return C.dan;
}

export function confidenceLabel(c) {
  if (c >= 0.9) return "High";
  if (c >= 0.7) return "Good";
  if (c >= 0.5) return "Review";
  return "Low";
}

export function getEventStyle(eventType) {
  return EVENT_TYPE_STYLES[eventType] || { color: C.textMut, bg: C.bg, icon: "note", label: titleCase(eventType || "Event") };
}

// ─── CLM-008: Lifecycle stage detection helper ─────────────────────────────
export function detectClientStage(client, serverStats) {
  if (client.isLiteClient) {
    if (client.lifecycle?.reclassifiedReason) return "Reclassified";
    return client.lifecycle?.cold === true ? "Reclassified" : "Leads";
  }
  const gingrId = String(client.gingrId);
  const srv = serverStats && serverStats[gingrId];
  if (!srv) return "Leads";

  const isCold = client.lifecycle?.cold === true;
  if (client.lifecycle?.reclassifiedReason) return "Reclassified";
  if (isCold) return "Reclassified";

  const hasSpent = Number(srv.total_spent) > 0;
  const hasRealBooking = !!srv.has_real_booking;
  const totalRes = Number(srv.total_res) || 0;

  if (!hasSpent && !hasRealBooking) return "Leads";

  const hasUpcoming = !!srv.has_upcoming;
  const daysSince = srv.last_res_date ? Math.floor((Date.now() - new Date(srv.last_res_date).getTime()) / 86400000) : 999;
  const bdPct = totalRes > 0 ? (Number(srv.boarding_count) || 0) / totalRes : 0;
  const dcThresh = 90, bdThresh = 180;

  let isRetention = false;
  if (!hasUpcoming && totalRes > 0) {
    if (bdPct > 0.5 && daysSince >= bdThresh) isRetention = true;
    else if (daysSince >= dcThresh) isRetention = true;
  }

  if (isRetention) return "Lapsed";
  if (hasSpent || hasRealBooking) return "Active";
  return "Leads";
}
