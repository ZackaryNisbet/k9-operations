// K9 Operations — Shared Theme & Constants
// DO NOT MODIFY — stable API consumed by all page files.

import { supabase } from "../supabaseClient";

const IDB_NAME = "k9_cache";
const IDB_STORE = "data";
const IDB_VERSION = 1;
const idbOpen = () => new Promise((resolve, reject) => {
  const req = indexedDB.open(IDB_NAME, IDB_VERSION);
  req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});
const idbGet = async (key) => {
  try {
    const db = await idbOpen();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
};
const idbSet = async (key, val) => {
  try {
    const db = await idbOpen();
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(val, key);
  } catch {}
};

// ─── Color palette (Forest Green + Electric Lime brand) ─────────────────────
const C = {
  bg: "#FFFFFF", surface: "#FFFFFF", surfaceHover: "#F8FAFC",
  border: "#E2E8F0", borderLight: "#F1F5F9",
  text: "#0F172A", textSec: "#1E293B", textMut: "#475569",
  pri: "#14532D", priL: "#166534", priLt: "#F7FEE7",
  acc: "#84CC16", accLt: "#D9F99D", accDk: "#4D7C0F",
  suc: "#16A34A", sucLt: "#ECFDF5", warn: "#D97706", warnLt: "#FFFBEB",
  dan: "#DC2626", danLt: "#FEF2F2", info: "#2563EB", infoLt: "#EFF6FF",
  canopyCream: "#F7FEE7", limeWash: "#D9F99D",
};

const ROOM_TYPES = ["Luxury Suite", "Executive Room", "Double Compartment", "Single Compartment"];

// ─── K9 Lite Roles & Permissions ──────────────────────────────────────────
const LEAN_ROLES = [
  { id: "pct", name: "PCT (Pet Care Tech)", shortName: "PCT" },
  { id: "csr", name: "CSR (Customer Service)", shortName: "CSR" },
  { id: "supervisor", name: "Supervisor", shortName: "Supervisor" },
  { id: "manager", name: "Manager", shortName: "Manager" },
  { id: "location_admin", name: "Location Admin", shortName: "Location Admin" },
  { id: "multi_location_admin", name: "Multi-Location Admin", shortName: "Multi-Loc Admin" },
  { id: "enterprise_admin", name: "Enterprise Admin", shortName: "Enterprise Admin" },
];

const LEAN_PERMISSION_AREAS = [
  "Operations Hub",
  "EOD Reports",
  "Customer Lifecycle",
  "Photos Module",
  "Attendance Tracker",
  "User Management",
  "Permissions Management",
  "Gingr Integration",
  "Checklist Templates",
  "Enterprise View",
  "Inventory Management",
  "Dashboard",
  "Financial Reporting",
  "Occupancy Reports",
  "Services Management",
  "Training Management",
];

const LEAN_PERMISSION_MATRIX = {
  pct: {
    "Operations Hub": true,
    "EOD Reports": false,
    "Customer Lifecycle": false,
    "Photos Module": false,
    "Attendance Tracker": false,
    "User Management": false,
    "Permissions Management": false,
    "Gingr Integration": false,
    "Checklist Templates": false,
    "Enterprise View": false,
    "Inventory Management": false,
    "Dashboard": true,
    "Financial Reporting": false,
    "Occupancy Reports": false,
    "Services Management": false,
    "Training Management": false,
  },
  csr: {
    "Operations Hub": true,
    "EOD Reports": false,
    "Customer Lifecycle": true,
    "Photos Module": true,
    "Attendance Tracker": false,
    "User Management": false,
    "Permissions Management": false,
    "Gingr Integration": false,
    "Checklist Templates": false,
    "Enterprise View": false,
    "Inventory Management": false,
    "Dashboard": true,
    "Financial Reporting": false,
    "Occupancy Reports": false,
    "Services Management": true,
    "Training Management": false,
  },
  supervisor: {
    "Operations Hub": true,
    "EOD Reports": false,
    "Customer Lifecycle": true,
    "Photos Module": true,
    "Attendance Tracker": true,
    "User Management": false,
    "Permissions Management": false,
    "Gingr Integration": false,
    "Checklist Templates": false,
    "Enterprise View": false,
    "Inventory Management": true,
    "Dashboard": true,
    "Financial Reporting": false,
    "Occupancy Reports": false,
    "Services Management": true,
    "Training Management": true,
  },
  manager: {
    "Operations Hub": true,
    "EOD Reports": false,
    "Customer Lifecycle": true,
    "Photos Module": true,
    "Attendance Tracker": true,
    "User Management": true,
    "Permissions Management": true,
    "Gingr Integration": false,
    "Checklist Templates": true,
    "Enterprise View": false,
    "Inventory Management": true,
    "Dashboard": true,
    "Financial Reporting": true,
    "Occupancy Reports": true,
    "Services Management": true,
    "Training Management": true,
  },
  location_admin: {
    "Operations Hub": true,
    "EOD Reports": true,
    "Customer Lifecycle": true,
    "Photos Module": true,
    "Attendance Tracker": true,
    "User Management": true,
    "Permissions Management": true,
    "Gingr Integration": true,
    "Checklist Templates": true,
    "Enterprise View": false,
    "Inventory Management": true,
    "Dashboard": true,
    "Financial Reporting": true,
    "Occupancy Reports": true,
    "Services Management": true,
    "Training Management": true,
  },
  multi_location_admin: {
    "Operations Hub": true,
    "EOD Reports": true,
    "Customer Lifecycle": true,
    "Photos Module": true,
    "Attendance Tracker": true,
    "User Management": true,
    "Permissions Management": true,
    "Gingr Integration": true,
    "Checklist Templates": true,
    "Enterprise View": true,
    "Inventory Management": true,
    "Dashboard": true,
    "Financial Reporting": true,
    "Occupancy Reports": true,
    "Services Management": true,
    "Training Management": true,
  },
  enterprise_admin: {
    "Operations Hub": true,
    "EOD Reports": true,
    "Customer Lifecycle": true,
    "Photos Module": true,
    "Attendance Tracker": true,
    "User Management": true,
    "Permissions Management": true,
    "Gingr Integration": true,
    "Checklist Templates": true,
    "Enterprise View": true,
    "Inventory Management": true,
    "Dashboard": true,
    "Financial Reporting": true,
    "Occupancy Reports": true,
    "Services Management": true,
    "Training Management": true,
  },
};

// K9 Logo reference
const K9_LOGO_SRC = "/k9-logo-full.svg";
const K9_LOGO_PNG = "/k9-logo-full.svg"; // was base64 PNG, now uses SVG path
// old base64 removed during brand rebrand - see git history if needed


// ─── Navigation Config ──────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: "lifecycle", label: "Customer Lifecycle", icon: "Lifecycle" },
  { id: "ops-hub", label: "Operations Hub", icon: "OpsHub" },
  { id: "photos", label: "Photos", icon: "Photos" },
  { id: "inventory", label: "Inventory", icon: "Package" },
  { id: "settings", label: "Settings", icon: "Settings" },
];

// ─── Default Checklist Templates ────────────────────────────────────────────
const DEF_OPENING_TEMPLATE = [
  { id: "o1", label: "Check security cameras", time: "06:00" },
  { id: "o2", label: "Unlock front doors", time: "06:00" },
  { id: "o3", label: "Turn on all lights", time: "06:15" },
  { id: "o4", label: "Check HVAC systems", time: "06:15" },
  { id: "o5", label: "Review overnight camera footage", time: "06:30" },
  { id: "o6", label: "Check on all boarding dogs - water, food, bedding", time: "06:30" },
  { id: "o7", label: "Prepare daycare play areas", time: "06:45" },
  { id: "o8", label: "Review today's reservations and schedule", time: "07:00" },
  { id: "o9", label: "Prepare check-in packets", time: "07:00" },
  { id: "o10", label: "Open register / POS", time: "07:00" },
];

const DEF_FE_TEMPLATE = [
  { id: "fe1", label: "Wipe down front desk and lobby surfaces", time: "08:00" },
  { id: "fe2", label: "Restock retail display", time: "08:30" },
  { id: "fe3", label: "Check bathroom supplies", time: "09:00" },
  { id: "fe4", label: "Process morning check-ins", time: "09:00" },
  { id: "fe5", label: "Confirm afternoon appointments", time: "10:00" },
  { id: "fe6", label: "Process package sales and payments", time: "11:00" },
  { id: "fe7", label: "Lunch coverage handoff", time: "12:00" },
  { id: "fe8", label: "Wednesday: Update social media", dayOfWeek: 3 },
  { id: "fe9", label: "Friday: Print weekend schedules", dayOfWeek: 5 },
];

const DEF_BE_TEMPLATE = [
  { id: "be1", label: "Morning feeding - breakfast", time: "07:00" },
  { id: "be2", label: "Administer morning medications", time: "07:30" },
  { id: "be3", label: "Move daycare dogs to play areas", time: "08:00" },
  { id: "be4", label: "First private play sessions", time: "09:00" },
  { id: "be5", label: "Mid-morning enrichment activities", time: "10:00" },
  { id: "be6", label: "Noon feeding", time: "12:00" },
  { id: "be7", label: "Afternoon medications", time: "12:30" },
  { id: "be8", label: "Afternoon private play sessions", time: "14:00" },
  { id: "be9", label: "Evening feeding - dinner", time: "17:00" },
  { id: "be10", label: "Final medications check", time: "17:30" },
];

const DEF_CLOSING_TEMPLATE = [
  { id: "ct1", label: "Complete all pending check-outs" },
  { id: "ct2", label: "Run end-of-day financial report" },
  { id: "ct3", label: "Ensure all dogs have fresh water" },
  { id: "ct4", label: "Final room inspection - all dogs settled" },
  { id: "ct5", label: "Clean and sanitize all play areas" },
  { id: "ct6", label: "Restock supplies for tomorrow" },
  { id: "ct7", label: "Lock all medication cabinets" },
  { id: "ct8", label: "Set up overnight camera monitoring" },
  { id: "ct9", label: "Process any pending payments" },
  { id: "ct10", label: "Lock appropriate exterior doors" },
  { id: "ct11", label: "Set alarm and lock front doors" },
];


// ─── Icons Object (from POS App) ────────────────────────────────────────────
const K9_LOCATIONS = [
  { id: "enterprise", name: "Enterprise", slug: "enterprise", isEnterprise: true },
  { id: "demo", name: "Adair Forsythe", slug: "cherry-hill" },
];

// ─── POS Base Path ──────────────────────────────────────────────────────────
// All POS routes live under /pos. This constant is prepended by buildUrl()
// and stripped by parseUrl() so the rest of the app is unaware of the prefix.
const POS_BASE = "/pos";

// ─── URL Routing ────────────────────────────────────────────────────────────
const PAGE_SLUGS = {
  dashboard:"dashboard", reservations:"lodging", clients:"lifecycle", "client-detail":"client", "dog-detail":"dog",
  "new-client":"new-client", "new-dog":"new-dog", "new-reservation":"new-reservation", "unified-new":"new",
  messages:"messages", payments:"payments", operations:"operations",
  "ops-opening":"ops/opening", "ops-fe":"ops/front-end", "ops-be":"ops/back-end", "ops-rooms":"ops/rooms",
  "ops-pp":"ops/private-play", "ops-closing":"ops/closing",
  "ops-bathing":"ops/bathing", "ops-belongings":"ops/belongings", "ops-collars":"ops/collars", "ops-lodging-transfers":"ops/lodging-transfers", "ops-pamper":"ops/pamper", "ops-svc":"ops/service",
  management:"management", "mgmt-attendance":"management/attendance", "mgmt-audit-log":"management/audit-log",
  "checkout-tv":"checkout-tv",
  "checkout-notes":"checkout-notes",
  eod:"eod", ai:"ai", settings:"settings", "evaluation-form":"evaluation", "online-bookings":"bookings",
  "settings-team":"settings/team-management", "settings-roles":"settings/roles",
  "settings-fields":"settings/fields", "settings-tags":"settings/tags", "settings-vaccines":"settings/vaccines",
  "settings-agreements":"settings/agreements", "settings-questionnaire":"settings/questionnaire",
  "settings-pricing":"settings/pricing", "settings-packages":"settings/packages", "settings-discounts":"settings/discounts", "settings-dropdowns":"settings/dropdowns",
  "settings-eod":"settings/eod", "settings-daily-ops":"settings/daily-ops", "settings-run-card":"settings/run-card",
  "settings-resort-info":"settings/resort-info", "settings-facility":"settings/facility", "settings-rooms":"settings/rooms",
  "settings-closed-dates":"settings/closed-dates", "settings-policies":"settings/policies", "settings-compliance-rules":"settings/compliance-rules",
  "settings-booking-settings":"settings/booking-settings", "settings-vets":"settings/vets",
  "settings-legal":"settings/legal", "settings-hotkeys":"settings/hotkeys", "settings-reset":"settings/reset",
  "inventory":"inventory", "inventory-report":"inventory/report",
  "enterprise-locations":"locations", "enterprise-operations":"oversight", "enterprise-packages":"packages", "enterprise-users":"users", "enterprise-management":"management",
};
const SLUG_TO_PAGE = {};
Object.entries(PAGE_SLUGS).forEach(([k,v]) => { if (!k.startsWith("enterprise-")) SLUG_TO_PAGE[v] = k; });
const ENT_SLUG_TO_PAGE = { locations:"enterprise-locations", oversight:"enterprise-operations", packages:"enterprise-packages", users:"enterprise-users", management:"enterprise-management" };

function buildUrl(locSlug, pg, prms, dataRef) {
  const slug = PAGE_SLUGS[pg] || pg;
  if (locSlug === "enterprise") return `${POS_BASE}/enterprise/${slug}`;
  if (pg === "client-detail" && prms?.clientId && dataRef) {
    const c = (dataRef.clients||[]).find(cl => cl.id === prms.clientId);
    const phone = c?.fields?.phone?.replace(/\D/g,"");
    if (phone) return `${POS_BASE}/${locSlug}/client/${phone}`;
  }
  if (pg === "dog-detail" && prms?.clientId && prms?.dogId && dataRef) {
    const c = (dataRef.clients||[]).find(cl => cl.id === prms.clientId);
    const d = (dataRef.dogs||[]).find(dg => dg.id === prms.dogId);
    const phone = c?.fields?.phone?.replace(/\D/g,"");
    if (phone && d) return `${POS_BASE}/${locSlug}/client/${phone}/${encodeURIComponent((d.fields?.name||"dog").toLowerCase())}`;
  }
  return `${POS_BASE}/${locSlug}/${slug}`;
}

function parseUrl(pathname, dataRef) {
  // Strip the POS base prefix before parsing
  let cleanPath = pathname;
  if (cleanPath.startsWith(POS_BASE)) cleanPath = cleanPath.slice(POS_BASE.length) || "/";
  const parts = cleanPath.replace(/^\/+|\/+$/g,"").split("/").filter(Boolean);
  if (parts.length === 0) return { locSlug: "demo", page: "dashboard", params: {} };
  const locSlug = parts[0];
  if (locSlug === "enterprise") {
    const epSlug = parts.slice(1).join("/") || "locations";
    const pg = ENT_SLUG_TO_PAGE[epSlug] || "enterprise-locations";
    return { locSlug: "enterprise", page: pg, params: {} };
  }
  if (parts.length === 1) return { locSlug, page: "dashboard", params: {} };
  // Client detail: /demo/client/5551234567
  if (parts[1] === "client" && parts[2]) {
    const phone = parts[2];
    if (parts[3] && dataRef) {
      // Dog detail: /demo/client/5551234567/duke
      const c = (dataRef.clients||[]).find(cl => (cl.fields?.phone||"").replace(/\D/g,"") === phone);
      if (c) {
        const dogName = decodeURIComponent(parts[3]).toLowerCase();
        const dogs = (dataRef.dogs||[]).filter(d => d.fields?.owner_id === c.id || (dataRef.reservations||[]).some(r => r.clientId === c.id && r.dogId === d.id));
        const dog = dogs.find(d => (d.fields?.name||"").toLowerCase() === dogName) || dogs[0];
        if (dog) return { locSlug, page: "dog-detail", params: { clientId: c.id, dogId: dog.id } };
      }
    }
    if (dataRef) {
      const c = (dataRef.clients||[]).find(cl => (cl.fields?.phone||"").replace(/\D/g,"") === phone);
      if (c) return { locSlug, page: "client-detail", params: { clientId: c.id } };
    }
    return { locSlug, page: "clients", params: {} };
  }
  const pgSlug = parts.slice(1).join("/");
  const pg = SLUG_TO_PAGE[pgSlug] || "dashboard";
  return { locSlug, page: pg, params: {} };
}

const gid = () => crypto.randomUUID();
function formatDogNames(dogs) {
  const names = dogs.map(d => d.fields?.name || "your dog").filter(Boolean);
  if (names.length === 0) return "your dog";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return names.slice(0, -1).join(", ") + ", and " + names[names.length - 1];
}
const titleCase = (s) => (s || "").replace(/\b\w/g, c => c.toUpperCase());
const fmtPhone = (p) => { const d = (p||"").replace(/\D/g,""); return d.length===10?`(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`:p||""; };
const _toDateStr = (d) => { if(!d) return null; if(d instanceof Date) { const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}`; } const s=String(d); if(s.length===10 && /^\d{4}-\d{2}-\d{2}$/.test(s)) return s; const m=s.match(/^(\d{4}-\d{2}-\d{2})/); return m?m[1]:null; };
const fmtDate = (d) => { const ds=_toDateStr(d); if(!ds) return ""; const dt=new Date(ds+"T00:00:00"); return isNaN(dt.getTime())?"":dt.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"}); };
const fmtDateFull = (d) => { const ds=_toDateStr(d); if(!ds) return ""; const dt=new Date(ds+"T00:00:00"); return isNaN(dt.getTime())?"":`${String(dt.getMonth()+1).padStart(2,"0")}/${String(dt.getDate()).padStart(2,"0")}/${dt.getFullYear()}`; };
const fmtDateShort = (d) => { const ds=_toDateStr(d); if(!ds) return ""; const dt=new Date(ds+"T00:00:00"); return isNaN(dt.getTime())?"":`${String(dt.getMonth()+1).padStart(2,"0")}/${String(dt.getDate()).padStart(2,"0")}/${String(dt.getFullYear()).slice(2)}`; };
function fmtPhoneInput(val) { const d = (val || '').replace(/\D/g, '').slice(0, 10); if (d.length === 0) return ''; if (d.length <= 3) return `(${d}`; if (d.length <= 6) return `(${d.slice(0,3)}) ${d.slice(3)}`; return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`; }
const fmtTime = (t) => { if(!t) return ""; const s = typeof t === "string" ? t : (t instanceof Date ? t.toTimeString().slice(0,5) : String(t)); const [h,m] = s.split(":").map(Number); const ampm = h >= 12 ? "PM" : "AM"; const h12 = h % 12 || 12; return `${h12}:${String(m).padStart(2,"0")} ${ampm}`; };
const fmtInstr = (v) => Array.isArray(v) ? v.join(", ") : (v || "");

const todayStr = () => { const d = (window.__K9_TIME_TRAVEL__ ? new Date(window.__K9_TIME_TRAVEL__ + "T12:00:00") : new Date()); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const addDays = (d, n) => { const dt = new Date(d + "T12:00:00"); dt.setDate(dt.getDate() + n); return dt.toISOString().split("T")[0]; };
const formatTime12hr = (t) => { if (!t) return ""; const s = typeof t === "string" ? t : (t instanceof Date ? t.toTimeString().slice(0,5) : String(t)); const [h, m] = s.split(":").map(Number); if (isNaN(h)) return s; const suffix = h >= 12 ? "PM" : "AM"; const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h; return `${h12}:${String(m || 0).padStart(2, "0")} ${suffix}`; };

// ── Revenue Intelligence Helpers ────────────────────────────────────────
const countNights = (ci, co) => {
  const a = new Date(ci + "T12:00:00"), b = new Date(co + "T12:00:00");
  return Math.max(0, Math.round((b - a) / 86400000));
};
const countHours = (tIn, tOut) => {
  if (!tIn || !tOut) return 8;
  const [h1,m1] = tIn.split(":").map(Number);
  const [h2,m2] = tOut.split(":").map(Number);
  return Math.max(0, (h2 * 60 + m2 - h1 * 60 - m1) / 60);
};
const LITE_DEF_PRICING = {
  boardingRates: { "Luxury Suite": 95, "Executive Room": 75, "Double Compartment": 65, "Single Compartment": 55 },
  daycareRates: { fullDay: 45, halfDay: 30 },
  halfDayThreshold: 5,
  multiDogDiscount: 20,
};
const CHART_PTS = 30;

// ── K9 Loading Animation (orbiting nodes — matches POS Ask AI) ──
const OPS_TYPES = {opening:{key:"openingTemplate",def:DEF_OPENING_TEMPLATE,title:"Opening Checklist"},fe_checklist:{key:"feTemplate",def:DEF_FE_TEMPLATE,title:"Front-End Checklist",showTime:true},be_checklist:{key:"beTemplate",def:DEF_BE_TEMPLATE,title:"Back-End Checklist",showTime:true},closing:{key:"closingTemplate",def:DEF_CLOSING_TEMPLATE,title:"Closing Checklist"},room_cleaning:{title:"Room Cleaning & Setups"},pp:{title:"Private Play Checklist"},bathing:{title:"Bathing Report"},belongings:{title:"Belongings"},collars:{title:"Next Day Collars"},lodging_transfer:{title:"Lodging Transfers"},pamper:{title:"Pamper Package Plus"},svc:{title:"Service Report"},eod:{title:"End-of-Day Report",isEod:true}};

const DEF_LITE_EOD_TEMPLATE = [
  { id:"sales", title:"Sales", emoji:"💵", type:"text", defaultContent:"Today's Goal:\nWTD:\nMTD:\nYTD:" },
  { id:"csr_checklist", title:"CSR Checklist", emoji:"📋", type:"checklist", defaultContent:"Turn on Luxury TV's\nTurn on music\nCreate Private Play log\nVacuum and Cherry front lobby before 7:00 am\nUnlock latches on front door\nCheck incoming Tours\nDo body checks on dogs leaving today and fill out form" },
  { id:"alerts", title:"Alerts", emoji:"📢", type:"text", defaultContent:"- Goal for Each CSR to book at least 1 Eval/Tour and Sell 1 Package/book reservation w/paid deposit daily" },
  { id:"team_notes", title:"Team Notes / Communications", emoji:"💬", type:"text", defaultContent:"" },
  { id:"leads", title:"Leads to Target Today", emoji:"🎯", type:"text", defaultContent:"" },
  { id:"tours", title:"Tours", emoji:"🏠", type:"text", defaultContent:"" },
  { id:"meds", title:"Meds", emoji:"💊", type:"text", defaultContent:"Boarding:\nAM:\n-\nNOON:\n-\nPM:\n-\n\nDaycare:\n-" },
  { id:"birthdays", title:"Birthdays", emoji:"🎉", type:"text", defaultContent:"" },
  { id:"ice_cream", title:"Doggie Ice Cream", emoji:"🍦", type:"text", defaultContent:"" },
  { id:"extra_play", title:"Extra Play Sessions", emoji:"⚽", type:"text", defaultContent:"" },
  { id:"baths", title:"Baths", emoji:"🛁", type:"checklist", defaultContent:"" },
  { id:"day_boarders", title:"Day Boarders / PP", emoji:"🚩", type:"text", defaultContent:"" },
  { id:"evaluations", title:"Evaluations", emoji:"📊", type:"text", defaultContent:"Name, L/S daycare, Room # - Pass/fail, if parents have been contacted\n-" },
  { id:"small_daycare_notes", title:"Small Daycare Notes", emoji:"🐕", type:"text", defaultContent:"(Dogs name, last initial, date/time and details of incident)\n-" },
  { id:"large_daycare_notes", title:"Large Daycare Notes", emoji:"🐕", type:"text", defaultContent:"(Dogs name, last initial, date/time and details of incident)\n-" },
  { id:"boarding_notes", title:"Boarding Notes", emoji:"🏨", type:"text", defaultContent:"" },
  { id:"social_media", title:"Social Media Photos", emoji:"📸", type:"checklist", defaultContent:"Instagram Stories\nInstagram Post" },
  { id:"picture_requests", title:"Picture Requests", emoji:"📷", type:"checklist", defaultContent:"" },
  { id:"building_supplies", title:"Building / Supplies", emoji:"🔧", type:"text", defaultContent:"" },
  { id:"other", title:"Other", emoji:"📝", type:"text", defaultContent:"" },
];
const DAY_NAMES_SHORT=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

// ─── Workflow → Section mapping per role ──────────────────────────────────────
// Maps each workflow card into the appropriate time-of-day section on role pages.
// This aligns the web with the corrected mobile IA: workflows inside Opening/Midday/Closing/As Needed.
const WORKFLOW_SECTION_MAP = {
  pct: {
    bathing: "opening",
    room_cleaning: "midday",
    pp: "midday",
    pamper: "midday",
    lodging_transfer: "midday",
    collars: "opening",
    belongings: "closing",
    weekly_maintenance: "as_needed",
    weekly_inventory: "as_needed",
    training: "as_needed",
    enrichment: "midday",
    ice_cream: "midday",
    roll_call: "opening",
    emergency_contacts: "as_needed",
    attendance: "opening",
    meds: "opening",
    evaluations: "midday",
  },
  csr: {
    pamper: "closing",
    pp: "midday",
    collars: "opening",
    lodging_transfer: "midday",
    bathing: "opening",
    room_cleaning: "midday",
    belongings: "closing",
    weekly_maintenance: "as_needed",
    weekly_inventory: "as_needed",
    training: "as_needed",
    enrichment: "midday",
    ice_cream: "midday",
    roll_call: "opening",
    emergency_contacts: "as_needed",
    attendance: "opening",
    meds: "opening",
    evaluations: "midday",
  },
  supervisor: {
    bathing: "opening",
    room_cleaning: "midday",
    pp: "midday",
    pamper: "midday",
    lodging_transfer: "midday",
    collars: "opening",
    belongings: "closing",
    weekly_maintenance: "as_needed",
    weekly_inventory: "as_needed",
    training: "as_needed",
    enrichment: "midday",
    ice_cream: "midday",
    roll_call: "opening",
    emergency_contacts: "as_needed",
    attendance: "opening",
    meds: "opening",
    evaluations: "midday",
  },
  manager: {
    bathing: "opening",
    room_cleaning: "midday",
    pp: "midday",
    pamper: "midday",
    lodging_transfer: "closing",
    collars: "opening",
    belongings: "closing",
    weekly_maintenance: "as_needed",
    weekly_inventory: "as_needed",
    training: "as_needed",
    enrichment: "midday",
    ice_cream: "midday",
    roll_call: "opening",
    emergency_contacts: "as_needed",
    attendance: "opening",
    meds: "opening",
    evaluations: "midday",
  },
  location_admin: {
    bathing: "opening",
    room_cleaning: "midday",
    pp: "midday",
    pamper: "midday",
    lodging_transfer: "midday",
    collars: "opening",
    belongings: "closing",
    weekly_maintenance: "as_needed",
    weekly_inventory: "as_needed",
    training: "as_needed",
    enrichment: "midday",
    ice_cream: "midday",
    roll_call: "opening",
    emergency_contacts: "as_needed",
    attendance: "opening",
    meds: "opening",
    evaluations: "midday",
  },
};
const OPERATIONS_CATALOG = [
  // Daily items (route to existing pages)
  { id:"ops-opening", label:"Opening Checklist", frequency:"daily", dataKey:"dailyOps", typeSub:"opening", routeTo:"ops-opening", permission:"view_daily_ops" },
  { id:"ops-fe", label:"Front-End Checklist", frequency:"daily", dataKey:"dailyOps", typeSub:"fe_checklist", routeTo:"ops-fe", permission:"view_daily_ops" },
  { id:"ops-be", label:"Back-End Checklist", frequency:"daily", dataKey:"dailyOps", typeSub:"be_checklist", routeTo:"ops-be", permission:"view_daily_ops" },
  { id:"ops-rooms", label:"Room Cleaning & Setups", frequency:"daily", dataKey:"dailyOps", typeSub:"room_cleaning", routeTo:"ops-rooms", permission:"view_daily_ops" },
  { id:"ops-pp", label:"Private Play Checklist", frequency:"daily", dataKey:"dailyOps", typeSub:"pp", routeTo:"ops-pp", permission:"view_daily_ops" },
  { id:"ops-closing", label:"Closing Checklist", frequency:"daily", dataKey:"dailyOps", typeSub:"closing", routeTo:"ops-closing", permission:"view_daily_ops" },
  { id:"ops-collars", label:"Next Day Collars", frequency:"daily", dataKey:"dailyOps", typeSub:"collars", routeTo:"ops-collars", permission:"view_daily_ops" },
  { id:"ops-lodging-transfers", label:"Lodging Transfers", frequency:"daily", dataKey:"dailyOps", typeSub:"lodging_transfer", routeTo:"ops-lodging-transfers", permission:"view_daily_ops" },
  // Services are dynamically generated from reservation data — see OperationsHub component
  { id:"eod", label:"EOD Report", frequency:"daily", dataKey:"eodEntries", typeSub:null, routeTo:"eod", permission:"view_eod" },
  // Weekly placeholders
  { id:"weekly-inventory", label:"Weekly Inventory", frequency:"weekly", routeTo:"inventory", permission:"view_inventory" },
  { id:"weekly-maintenance", label:"Weekly Maintenance", frequency:"weekly", dataKey:"dailyOps", typeSub:"weekly_maintenance", routeTo:"ops-weekly-maintenance", permission:"view_daily_ops" },
];

// ─── Client & Dog Field Definitions ───────────────────────────────────────
const DEF_CLIENT_FIELDS = [
  { id:"phone",name:"Phone Number",type:"tel",requiredFor:["create"],isKey:true,locked:true,order:0 },
  { id:"first_name",name:"First Name",type:"text",requiredFor:["tour"],locked:false,order:1 },
  { id:"last_name",name:"Last Name",type:"text",requiredFor:["tour"],locked:false,order:2 },
  { id:"email",name:"Email",type:"email",requiredFor:["eval"],locked:false,order:3 },
  { id:"street",name:"Street Address",type:"text",requiredFor:[],locked:false,order:4 },
  { id:"city",name:"City",type:"text",requiredFor:[],locked:false,order:5 },
  { id:"state",name:"State",type:"text",requiredFor:[],locked:false,order:6 },
  { id:"zip",name:"Zip Code",type:"text",requiredFor:[],locked:false,order:7 },
  { id:"emergency_contact",name:"Emergency Contact",type:"text",requiredFor:[],locked:false,order:8 },
  { id:"emergency_phone",name:"Emergency Phone",type:"tel",requiredFor:[],locked:false,order:9 },
  { id:"notes",name:"Notes",type:"textarea",requiredFor:[],locked:false,order:10 },
  { id:"referral_source",name:"Referral Source",type:"select",requiredFor:[],locked:false,order:11,options:["Friend/Family","Google","Social Media","Website","Walk-In","Vet Referral","Other"] },
];

const DEF_DOG_FIELDS = [
  { id:"name",name:"Dog Name",type:"text",requiredFor:["tour"],locked:true,order:0 },
  { id:"breed",name:"Breed",type:"text",requiredFor:["eval"],locked:true,order:1 },
  { id:"weight",name:"Weight (lbs)",type:"number",requiredFor:["reservation"],locked:false,order:2 },
  { id:"dob",name:"Date of Birth",type:"date",requiredFor:[],locked:false,order:3 },
  { id:"sex",name:"Sex",type:"select",options:["Male","Female"],requiredFor:["reservation"],locked:true,order:4 },
  { id:"spayed_neutered",name:"Spayed/Neutered",type:"select",options:["Neutered","Spayed","Intact"],requiredFor:["reservation"],locked:true,order:5 },
  { id:"color",name:"Color/Markings",type:"text",requiredFor:[],locked:false,order:6 },
  { id:"temperament",name:"Temperament Notes",type:"textarea",requiredFor:[],locked:false,order:8 },
];

const LITE_ACTION_LEVELS = ["create"];
const LITE_ACTION_LABELS = { create: "Create Record" };

const DEFAULT_LIFECYCLE_BANNERS = {
  leads: "Leads auto-feed here after an Eval or Tour with no booking (+1 day follow-up). Log each outreach attempt, set the next follow-up date, and mark leads as Cold when they stop responding.",
  active: "Active customers have a booking history and either have an upcoming reservation or visited recently. Clients move here automatically when they book or pay for the first time.",
  lapsed: "Clients lapse here when they have no upcoming reservation and haven't visited within the configurable threshold (see Settings → Resort Policies). Booking a new appointment automatically moves them back to Active.",
  cold: "Leads or lapsed clients you've manually marked as Cold. Click Revive to re-engage — you'll be prompted to log a note and set a new follow-up, and the client will return to Leads or Lapsed based on their history.",
  all: "Aggregate view of every client record regardless of lifecycle stage. Use the search bar or column headers to sort and find any client quickly.",
};

// Maps old Firestore stage keys → new internal names (backward compat for persisted data)
const LIFECYCLE_STAGE_MAP = { conversion: "leads", retention: "lapsed", leads: "leads", lapsed: "lapsed", active: "active", cold: "cold" };
// Maps new internal stage names → old Firestore lifecycle data keys
const LIFECYCLE_STORAGE_KEY = { leads: "conversion", lapsed: "retention" };

// ═══════════════════════════════════════════════════════════════════════════
const LC_FILTER_FIELDS = [
  { section:"Client Info", key:"firstName", label:"First Name", type:"text", ops:["contains","equals","starts","empty","notEmpty"] },
  { section:"Client Info", key:"lastName", label:"Last Name", type:"text", ops:["contains","equals","starts","empty","notEmpty"] },
  { section:"Client Info", key:"phone", label:"Phone", type:"text", ops:["contains","equals","empty","notEmpty"] },
  { section:"Client Info", key:"dogCount", label:"Dogs", type:"number", ops:["=",">=","<=",">","<"] },
  { section:"Client Info", key:"createdAt", label:"Created Date", type:"date", ops:["after","before","inLastDays"] },
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

// ─── Operations Stats Helpers ──────────────────────────────────────────────

export { C, LEAN_ROLES, LEAN_PERMISSION_AREAS, LEAN_PERMISSION_MATRIX, IDB_VERSION, idbGet, idbSet, LITE_DEF_PRICING, CHART_PTS, OPERATIONS_CATALOG, OPS_TYPES, LITE_ACTION_LABELS, LITE_ACTION_LEVELS, DEF_CLIENT_FIELDS, DEF_DOG_FIELDS, DEFAULT_LIFECYCLE_BANNERS, LIFECYCLE_STAGE_MAP, LIFECYCLE_STORAGE_KEY, LC_OP_LABELS, LC_FILTER_FIELDS, K9_LOGO_SRC, K9_LOGO_PNG, ROOM_TYPES, NAV_ITEMS, DEF_OPENING_TEMPLATE, DEF_FE_TEMPLATE, DEF_BE_TEMPLATE, DEF_CLOSING_TEMPLATE, DEF_LITE_EOD_TEMPLATE, DAY_NAMES_SHORT, K9_LOCATIONS, POS_BASE, PAGE_SLUGS, SLUG_TO_PAGE, ENT_SLUG_TO_PAGE, buildUrl, parseUrl, gid, formatDogNames, fmtPhoneInput, titleCase, fmtPhone, fmtDate, fmtDateFull, fmtDateShort, fmtTime, fmtInstr, todayStr, addDays, formatTime12hr, countNights, countHours, IDB_NAME, IDB_STORE, idbOpen, WORKFLOW_SECTION_MAP };
