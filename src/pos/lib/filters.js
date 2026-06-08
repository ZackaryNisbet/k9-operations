import { todayStr } from "./format";

const LC_FILTER_FIELDS = [
  { section:"Client Info", key:"firstName", label:"First Name", type:"text", ops:["contains","equals","starts","empty","notEmpty"] },
  { section:"Client Info", key:"lastName", label:"Last Name", type:"text", ops:["contains","equals","starts","empty","notEmpty"] },
  { section:"Client Info", key:"phone", label:"Phone", type:"text", ops:["contains","equals","empty","notEmpty"] },
  { section:"Client Info", key:"dogCount", label:"Dogs", type:"number", ops:["=",">=","<=",">","<"] },
  { section:"Activity", key:"totalRes", label:"Total Reservations", type:"number", ops:["=",">=","<=",">","<"] },
  { section:"Activity", key:"lastRes", label:"Last Visit", type:"date", ops:["after","before","inLastDays"] },
  { section:"Activity", key:"daysSince", label:"Days Since Visit", type:"number", ops:[">=","<=",">","<","="] },
  { section:"Activity", key:"totalSpent", label:"Total Spent ($)", type:"currency", ops:[">=","<=",">","<","="] },
  { section:"Activity", key:"nextRes", label:"Next Reservation", type:"presence", ops:["has","missing"] },
  { section:"Services", key:"daycare", label:"Daycare Visits", type:"number", ops:["=",">=","<=",">","<"] },
  { section:"Services", key:"boarding", label:"Boarding Visits", type:"number", ops:["=",">=","<=",">","<"] },
  { section:"Services", key:"eval", label:"Evaluations", type:"number", ops:["=",">=","<=",">","<"] },
  { section:"Services", key:"postEval", label:"Post-Eval Appts", type:"number", ops:["=",">=","<=",">","<"] },
  { section:"Services", key:"tours", label:"Tours", type:"number", ops:["=",">=","<=",">","<"] },
  { section:"Services", key:"postTour", label:"Post-Tour Appts", type:"number", ops:["=",">=","<=",">","<"] },
  { section:"Lifecycle", key:"stage", label:"Stage", type:"select", ops:["is","isNot"], options:["leads","active","lapsed","cold"] },
  { section:"Lifecycle", key:"source", label:"Source", type:"select", ops:["is","isNot"], options:["eval","tour","manual","ignite",""] },
  { section:"Lifecycle", key:"followUp", label:"Follow-Up", type:"followUpStatus", ops:["overdue","today","thisWeek","hasDate","noDate"] },
];
const LC_OP_LABELS = {"contains":"contains","equals":"equals","starts":"starts with","empty":"is empty","notEmpty":"not empty","=":"=",">=":"≥","<=":"≤",">":">","<":"<","after":"after","before":"before","inLastDays":"in last X days","has":"has","missing":"doesn't have","is":"is","isNot":"is not","overdue":"overdue","today":"today","thisWeek":"this week","hasDate":"has date","noDate":"no date"};

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
      // Text fields
      if (k === "firstName") { const v = (c.fields.first_name || "").toLowerCase(); const q = (val||"").toLowerCase(); if (op==="contains") return v.includes(q); if (op==="equals") return v===q; if (op==="starts") return v.startsWith(q); if (op==="empty") return !v; if (op==="notEmpty") return !!v; }
      if (k === "lastName") { const v = (c.fields.last_name || "").toLowerCase(); const q = (val||"").toLowerCase(); if (op==="contains") return v.includes(q); if (op==="equals") return v===q; if (op==="starts") return v.startsWith(q); if (op==="empty") return !v; if (op==="notEmpty") return !!v; }
      if (k === "phone") { const v = (c.fields.phone || "").replace(/\D/g,""); const q = (val||"").replace(/\D/g,""); if (op==="contains") return v.includes(q); if (op==="equals") return v===q; if (op==="empty") return !v; if (op==="notEmpty") return !!v; }
      // Number fields
      const numMap = {dogCount:s.dogCount||0,totalRes:s.totalRes||0,daysSince:s.daysSinceLast,totalSpent:s.totalSpent||0,daycare:s.daycareCount||0,boarding:s.boardingCount||0,eval:s.evalCount||0,postEval:s.postEvalAppts||0,tours:s.tourCount||0,postTour:s.postTourAppts||0};
      if (k in numMap) {
        let nv = numMap[k]; const nq = parseFloat(val);
        if (nv === null || nv === undefined) nv = k === "daysSince" ? null : 0;
        if (k === "daysSince" && nv === null) return op === "<" || op === "<=" ? false : op === ">" || op === ">=" ? true : false;
        if (isNaN(nq)) return true;
        if (op==="=") return nv===nq; if (op===">=") return nv>=nq; if (op==="<=") return nv<=nq; if (op===">") return nv>nq; if (op==="<") return nv<nq;
      }
      // Date field (last visit)
      if (k === "lastRes") {
        const d = s.lastRes?.checkIn || "";
        if (op==="after") return d && d > val; if (op==="before") return d && d < val;
        if (op==="inLastDays") { if (!d) return false; const diff = Math.floor((new Date(today+"T12:00:00") - new Date(d+"T12:00:00"))/(86400000)); return diff <= parseInt(val); }
      }
      // Presence (next reservation)
      if (k === "nextRes") { if (op==="has") return !!s.nextRes; if (op==="missing") return !s.nextRes; }
      // Select (stage)
      if (k === "stage") {
        const stg = tm.isCold ? "cold" : tm.isRetention ? "lapsed" : tm.isActive ? "active" : tm.isConversion ? "leads" : "unknown";
        if (op==="is") return stg === val; if (op==="isNot") return stg !== val;
      }
      // Select (source)
      if (k === "source") {
        const src = c.lifecycle?.conversion?.source || "";
        if (op==="is") return src === val; if (op==="isNot") return src !== val;
      }
      // Follow-up status
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

// ── Quick Filter Presets ──
const LC_QUICK_PRESETS = [
  { label: "Overdue", icon: "⏰", filters: { followUp: { op: "overdue", val: "" } } },
  { label: "No Upcoming", icon: "📭", filters: { nextRes: { op: "missing", val: "" } } },
  { label: "High Spend", icon: "💰", filters: { totalSpent: { op: ">=", val: "1000" } } },
  { label: "Never Visited", icon: "🆕", filters: { totalRes: { op: "=", val: "0" } } },
];

const RPT_FILTER_FIELDS = {
  overnight: [
    { section: "Booking Info", key: "dogName", label: "Dog Name", type: "text", ops: ["contains","equals","starts","empty","notEmpty"] },
    { section: "Booking Info", key: "clientFirst", label: "First Name", type: "text", ops: ["contains","equals","starts","empty","notEmpty"] },
    { section: "Booking Info", key: "clientLast", label: "Last Name", type: "text", ops: ["contains","equals","starts","empty","notEmpty"] },
    { section: "Booking Info", key: "phone", label: "Phone", type: "text", ops: ["contains","equals","empty","notEmpty"] },
    { section: "Room", key: "roomType", label: "Room Type", type: "select", ops: ["is","isNot"], options: ["LS","ER","DC","SC"] },
    { section: "Room", key: "room", label: "Room #", type: "text", ops: ["contains","equals","starts","empty","notEmpty"] },
    { section: "Stay", key: "checkInDate", label: "Check-In", type: "date", ops: ["after","before"] },
    { section: "Stay", key: "checkOutDate", label: "Check-Out", type: "date", ops: ["after","before"] },
    { section: "Stay", key: "nights", label: "Nights", type: "number", ops: ["=",">=","<=",">","<"] },
    { section: "Stay", key: "status", label: "Status", type: "select", ops: ["is","isNot"], options: ["upcoming","checked-in","checked-out","cancelled"] },
    { section: "Stay", key: "bookingSource", label: "Source", type: "select", ops: ["is","isNot"], options: ["phone","online","walk-in"] },
    { section: "Financial", key: "total", label: "Total ($)", type: "currency", ops: ["=",">=","<=",">","<"] },
  ],
  daycare: [
    { section: "Booking Info", key: "dogName", label: "Dog Name", type: "text", ops: ["contains","equals","starts","empty","notEmpty"] },
    { section: "Booking Info", key: "clientFirst", label: "First Name", type: "text", ops: ["contains","equals","starts","empty","notEmpty"] },
    { section: "Booking Info", key: "phone", label: "Phone", type: "text", ops: ["contains","equals","empty","notEmpty"] },
    { section: "Visit", key: "visitDate", label: "Visit Date", type: "date", ops: ["after","before"] },
    { section: "Visit", key: "dayType", label: "Day Type", type: "select", ops: ["is","isNot"], options: ["Full","Half"] },
    { section: "Visit", key: "size", label: "Size", type: "select", ops: ["is","isNot"], options: ["Small","Medium","Large"] },
    { section: "Status", key: "status", label: "Status", type: "select", ops: ["is","isNot"], options: ["upcoming","checked-in","checked-out","cancelled"] },
    { section: "Status", key: "bookingSource", label: "Source", type: "select", ops: ["is","isNot"], options: ["phone","online","walk-in"] },
    { section: "Financial", key: "total", label: "Total ($)", type: "currency", ops: ["=",">=","<=",">","<"] },
  ],
  evaluations: [
    { section: "Dog Info", key: "dogName", label: "Dog Name", type: "text", ops: ["contains","equals","starts","empty","notEmpty"] },
    { section: "Dog Info", key: "breed", label: "Breed", type: "text", ops: ["contains","equals","starts","empty","notEmpty"] },
    { section: "Dog Info", key: "clientFirst", label: "Client", type: "text", ops: ["contains","equals","starts","empty","notEmpty"] },
    { section: "Evaluation", key: "evalDate", label: "Eval Date", type: "date", ops: ["after","before"] },
    { section: "Evaluation", key: "evaluator", label: "Evaluator", type: "text", ops: ["contains","equals","starts","empty","notEmpty"] },
    { section: "Evaluation", key: "result", label: "Result", type: "select", ops: ["is","isNot"], options: ["green","yellow","red"] },
    { section: "Evaluation", key: "scorePercent", label: "Score %", type: "number", ops: ["=",">=","<=",">","<"] },
    { section: "Status", key: "status", label: "Status", type: "select", ops: ["is","isNot"], options: ["upcoming","completed","cancelled"] },
  ],
  tours: [
    { section: "Client Info", key: "clientFirst", label: "First Name", type: "text", ops: ["contains","equals","starts","empty","notEmpty"] },
    { section: "Client Info", key: "clientLast", label: "Last Name", type: "text", ops: ["contains","equals","starts","empty","notEmpty"] },
    { section: "Client Info", key: "phone", label: "Phone", type: "text", ops: ["contains","equals","empty","notEmpty"] },
    { section: "Tour", key: "tourDate", label: "Tour Date", type: "date", ops: ["after","before"] },
    { section: "Tour", key: "status", label: "Status", type: "select", ops: ["is","isNot"], options: ["upcoming","completed","cancelled","no-show"] },
    { section: "Tour", key: "bookingSource", label: "Source", type: "select", ops: ["is","isNot"], options: ["phone","online","walk-in"] },
  ],
  dayboarding: [
    { section: "Booking Info", key: "dogName", label: "Dog Name", type: "text", ops: ["contains","equals","starts","empty","notEmpty"] },
    { section: "Booking Info", key: "clientFirst", label: "First Name", type: "text", ops: ["contains","equals","starts","empty","notEmpty"] },
    { section: "Booking Info", key: "phone", label: "Phone", type: "text", ops: ["contains","equals","empty","notEmpty"] },
    { section: "Visit", key: "visitDate", label: "Visit Date", type: "date", ops: ["after","before"] },
    { section: "Visit", key: "status", label: "Status", type: "select", ops: ["is","isNot"], options: ["upcoming","checked-in","checked-out","cancelled"] },
    { section: "Visit", key: "bookingSource", label: "Source", type: "select", ops: ["is","isNot"], options: ["phone","online","walk-in"] },
    { section: "Financial", key: "total", label: "Total ($)", type: "currency", ops: ["=",">=","<=",">","<"] },
  ],
  cancellations: [
    { section: "Service", key: "serviceType", label: "Service Type", type: "select", ops: ["is","isNot"], options: ["boarding","daycare","eval","tour","dayboarding"] },
    { section: "Service", key: "dogName", label: "Dog Name", type: "text", ops: ["contains","equals","starts","empty","notEmpty"] },
    { section: "Service", key: "clientName", label: "Client Name", type: "text", ops: ["contains","equals","starts","empty","notEmpty"] },
    { section: "Timing", key: "originalCheckIn", label: "Original Check-In", type: "date", ops: ["after","before"] },
    { section: "Timing", key: "cancelledAt", label: "Cancelled At", type: "date", ops: ["after","before"] },
    { section: "Timing", key: "daysBeforeService", label: "Days Before Service", type: "number", ops: ["=",">=","<=",">","<"] },
    { section: "Details", key: "cancellationReason", label: "Reason", type: "text", ops: ["contains","equals","starts","empty","notEmpty"] },
  ],
  clients: [
    { section: "Client Info", key: "firstName", label: "First Name", type: "text", ops: ["contains","equals","starts","empty","notEmpty"] },
    { section: "Client Info", key: "lastName", label: "Last Name", type: "text", ops: ["contains","equals","starts","empty","notEmpty"] },
    { section: "Client Info", key: "phone", label: "Phone", type: "text", ops: ["contains","equals","empty","notEmpty"] },
    { section: "Client Info", key: "email", label: "Email", type: "text", ops: ["contains","equals","starts","empty","notEmpty"] },
    { section: "Activity", key: "totalVisits", label: "Total Visits", type: "number", ops: ["=",">=","<=",">","<"] },
    { section: "Activity", key: "totalBoardingNights", label: "Boarding Nights", type: "number", ops: ["=",">=","<=",">","<"] },
    { section: "Activity", key: "totalSpent", label: "Total Spent ($)", type: "currency", ops: ["=",">=","<=",">","<"] },
    { section: "Activity", key: "daysSinceLastVisit", label: "Days Since Visit", type: "number", ops: ["=",">=","<=",">","<"] },
    { section: "Status", key: "isActive", label: "Active", type: "select", ops: ["is","isNot"], options: ["Yes","No"] },
    { section: "Status", key: "referralSource", label: "Referral Source", type: "text", ops: ["contains","equals","starts","empty","notEmpty"] },
  ],
  "hourly-volume": [
    { section: "Filter Data", key: "serviceType", label: "Service Type", type: "select", ops: ["is","isNot"], options: ["boarding","daycare","eval","tour"] },
    { section: "Filter Data", key: "bookingSource", label: "Source", type: "select", ops: ["is","isNot"], options: ["phone","online","walk-in"] },
  ],
  occupancy: [
    { section: "Filter Data", key: "roomType", label: "Room Type", type: "select", ops: ["is","isNot"], options: ["LS","ER","DC","SC"] },
    { section: "Filter Data", key: "bookingSource", label: "Source", type: "select", ops: ["is","isNot"], options: ["phone","online","walk-in"] },
  ],
  revenue: [
    { section: "Filter Data", key: "serviceType", label: "Service Type", type: "select", ops: ["is","isNot"], options: ["boarding","daycare","eval","tour"] },
    { section: "Filter Data", key: "bookingSource", label: "Source", type: "select", ops: ["is","isNot"], options: ["phone","online","walk-in"] },
    { section: "Filter Data", key: "roomType", label: "Room Type", type: "select", ops: ["is","isNot"], options: ["LS","ER","DC","SC"] },
  ],
  "booking-pace": [
    { section: "Filter Data", key: "serviceType", label: "Service Type", type: "select", ops: ["is","isNot"], options: ["boarding","daycare","eval","tour"] },
    { section: "Filter Data", key: "bookingSource", label: "Source", type: "select", ops: ["is","isNot"], options: ["phone","online","walk-in"] },
  ],
  "client-intel": [
    { section: "Filter Data", key: "isActive", label: "Active", type: "select", ops: ["is","isNot"], options: ["Yes","No"] },
    { section: "Filter Data", key: "referralSource", label: "Referral Source", type: "text", ops: ["contains","equals","starts","empty","notEmpty"] },
  ],
  "eval-funnel": [
    { section: "Filter Data", key: "evaluator", label: "Evaluator", type: "text", ops: ["contains","equals","starts","empty","notEmpty"] },
    { section: "Filter Data", key: "result", label: "Result", type: "select", ops: ["is","isNot"], options: ["green","yellow","red"] },
  ],
};

function getFilterFieldsForReport(reportId) { return RPT_FILTER_FIELDS[reportId] || []; }
function getPresetsForReport(reportId) { return []; }

// ═══════════════════════════════════════════════════════════════════════════
// GENERIC REPORT FILTER FUNCTION
// ═══════════════════════════════════════════════════════════════════════════
function applyReportFilters(rows, filters, fields) {
  if (!rows || rows.length === 0) return rows;
  const keys = Object.keys(filters);
  if (keys.length === 0) return rows;
  return rows.filter(row => {
    return keys.every(k => {
      const f = filters[k];
      if (!f) return true;
      const { op, val } = f;
      if (val === "" && op !== "empty" && op !== "notEmpty" && op !== "has" && op !== "missing") return true;
      const field = fields.find(fd => fd.key === k);
      if (!field) return true;
      const rv = row[field.key];
      if (field.type === "text") {
        const s = String(rv || "").toLowerCase(), q = String(val || "").toLowerCase();
        if (op === "contains") return s.includes(q);
        if (op === "equals") return s === q;
        if (op === "starts") return s.startsWith(q);
        if (op === "empty") return !rv || rv === "—";
        if (op === "notEmpty") return !!rv && rv !== "—";
      }
      if (field.type === "number" || field.type === "currency") {
        const nv = parseFloat(rv), nq = parseFloat(val);
        if (isNaN(nv) || isNaN(nq)) return true;
        if (op === "=") return nv === nq;
        if (op === ">=") return nv >= nq;
        if (op === "<=") return nv <= nq;
        if (op === ">") return nv > nq;
        if (op === "<") return nv < nq;
      }
      if (field.type === "date") {
        const d = String(rv || "");
        if (!d || d === "—") return op === "before";
        if (op === "after") return d > val;
        if (op === "before") return d < val;
      }
      if (field.type === "select") {
        const s = String(rv || "");
        if (op === "is") return s === val;
        if (op === "isNot") return s !== val;
      }
      if (field.type === "presence") {
        if (op === "has") return !!rv && rv !== "—";
        if (op === "missing") return !rv || rv === "—";
      }
      return true;
    });
  });
}

const DEFAULT_LIFECYCLE_BANNERS = {
  leads: "Leads auto-feed here after an Eval or Tour with no booking (+1 day follow-up). Log each outreach attempt, set the next follow-up date, and mark leads as Cold when they stop responding.",
  active: "Active customers have a booking history and either have an upcoming reservation or visited recently. Clients move here automatically when they book or pay for the first time.",
  lapsed: "Clients lapse here when they have no upcoming reservation and haven't visited within the configurable threshold (see Settings → Resort Policies). Booking a new appointment automatically moves them back to Active.",
  cold: "Leads or lapsed clients you've manually marked as Cold. Click Revive to re-engage — you'll be prompted to log a note and set a new follow-up, and the client will return to Leads or Lapsed based on their history.",
  all: "Aggregate view of every client record regardless of lifecycle stage. Use the search bar or column headers to sort and find any client quickly.",
};

export { LC_FILTER_FIELDS, LC_OP_LABELS, applyStructuredFilters, LC_QUICK_PRESETS, RPT_FILTER_FIELDS, getFilterFieldsForReport, getPresetsForReport, applyReportFilters, DEFAULT_LIFECYCLE_BANNERS };
