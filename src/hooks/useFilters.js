// K9 Operations — Structured Filter Logic

import { todayStr, addDays } from "../shared/theme";

function applyStructuredFilters(clients, stats, tabMap, filters) {
  const keys = Object.keys(filters);
  if (keys.length === 0) return clients;
  const today = todayStr();
  const weekAhead = (() => { const d = new Date(); d.setDate(d.getDate() + 7); return d.toISOString().split("T")[0]; })();
  return clients.filter(c => {
    const s = stats[c.id] || {};
    const tm = tabMap[c.id] || {};
    return keys.every(k => {
      const f = filters[k];
      if (!f || (f.val === "" && f.op !== "empty" && f.op !== "notEmpty" && f.op !== "has" && f.op !== "missing" && f.op !== "overdue" && f.op !== "today" && f.op !== "thisWeek" && f.op !== "hasDate" && f.op !== "noDate")) return true;
      const op = f.op, val = f.val;
      if (k === "firstName") { const v = (c.fields.first_name || "").toLowerCase(); const q = (val||"").toLowerCase(); if (op==="contains") return v.includes(q); if (op==="equals") return v===q; if (op==="starts") return v.startsWith(q); if (op==="empty") return !v; if (op==="notEmpty") return !!v; }
      if (k === "lastName") { const v = (c.fields.last_name || "").toLowerCase(); const q = (val||"").toLowerCase(); if (op==="contains") return v.includes(q); if (op==="equals") return v===q; if (op==="starts") return v.startsWith(q); if (op==="empty") return !v; if (op==="notEmpty") return !!v; }
      if (k === "phone") { const v = (c.fields.phone || "").replace(/\D/g,""); const q = (val||"").replace(/\D/g,""); if (op==="contains") return v.includes(q); if (op==="equals") return v===q; if (op==="empty") return !v; if (op==="notEmpty") return !!v; }
      const numMap = {dogCount:s.dogCount||0,totalRes:s.totalRes||0,daysSince:s.daysSinceLast,totalSpent:s.totalSpent||0,daycare:s.daycareCount||0,boarding:s.boardingCount||0,eval:s.evalCount||0,postEval:s.postEvalAppts||0,tours:s.tourCount||0,postTour:s.postTourAppts||0};
      if (k in numMap) {
        let nv = numMap[k]; const nq = parseFloat(val);
        if (nv === null || nv === undefined) nv = k === "daysSince" ? null : 0;
        if (k === "daysSince" && nv === null) return op === "<" || op === "<=" ? false : op === ">" || op === ">=" ? true : false;
        if (isNaN(nq)) return true;
        if (op==="=") return nv===nq; if (op===">=") return nv>=nq; if (op==="<=") return nv<=nq; if (op===">") return nv>nq; if (op==="<") return nv<nq;
      }
      if (k === "createdAt") {
        const d = c.createdAt ? c.createdAt.split("T")[0] : "";
        if (op==="after") return d && d > val; if (op==="before") return d && d < val;
        if (op==="inLastDays") { if (!d) return false; const diff = Math.floor((new Date(today+"T12:00:00") - new Date(d+"T12:00:00"))/(86400000)); return diff <= parseInt(val); }
      }
      if (k === "lastRes") {
        const d = s.lastRes?.checkIn || "";
        if (op==="after") return d && d > val; if (op==="before") return d && d < val;
        if (op==="inLastDays") { if (!d) return false; const diff = Math.floor((new Date(today+"T12:00:00") - new Date(d+"T12:00:00"))/(86400000)); return diff <= parseInt(val); }
      }
      if (k === "nextRes") { if (op==="has") return !!s.nextRes; if (op==="missing") return !s.nextRes; }
      if (k === "stage") {
        const stg = tm.isCold ? "cold" : tm.isRetention ? "lapsed" : tm.isActive ? "active" : tm.isConversion ? "leads" : "unknown";
        if (op==="is") return stg === val; if (op==="isNot") return stg !== val;
      }
      if (k === "source") {
        const src = c.source || "";
        if (op==="is") return src === val; if (op==="isNot") return src !== val;
      }
      if (k === "followUp") {
        const fu = c.lifecycle?.conversion?.followUpDate || c.lifecycle?.retention?.followUpDate || "";
        if (op==="overdue") return fu && fu < today;
        if (op==="today") return fu === today;
        if (op==="thisWeek") return fu && fu >= today && fu <= weekAhead;
        if (op==="hasDate") return !!fu;
        if (op==="noDate") return !fu;
      }
      return true;
    });
  });
}

// ─── CLIENTS PAGE (from POS App) ───────────────────────────────────────────

export { applyStructuredFilters };
