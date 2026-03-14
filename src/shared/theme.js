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

// ─── Color palette (matches POS brand) ──────────────────────────────────────
const C = {
  bg: "#F5F6F8", surface: "#FFFFFF", surfaceHover: "#EEF0F4",
  border: "#DFE2E8", borderLight: "#ECEEF2",
  text: "#1A1D23", textSec: "#5A6170", textMut: "#959BA8",
  pri: "#003462", priL: "#0A4D8A", priLt: "#E6EEF6",
  acc: "#AF8D54", accLt: "#F5EDD8", accDk: "#8B6F3C",
  suc: "#0D7A56", sucLt: "#ECFDF5", warn: "#C4720C", warnLt: "#FFFBEB",
  dan: "#C42B2B", danLt: "#FEF2F2", info: "#1A5EC4", infoLt: "#EFF6FF",
};

const ROOM_TYPES = ["Luxury Suite", "Executive Room", "Double Compartment", "Single Compartment"];

// ─── K9 Lite Roles & Permissions ──────────────────────────────────────────
const LEAN_ROLES = [
  { id: "pct", name: "PCT (Pet Care Tech)", shortName: "PCT" },
  { id: "csr", name: "CSR (Customer Service)", shortName: "CSR" },
  { id: "supervisor", name: "Supervisor", shortName: "Supervisor" },
  { id: "manager", name: "Manager", shortName: "Manager" },
  { id: "location_admin", name: "Location Admin", shortName: "Location Admin" },
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
  },
};

// K9 Logo reference
const K9_LOGO_SRC = "/k9-logo.png";
const K9_LOGO_PNG = "data:image/png;base64,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";


// ─── Navigation Config ──────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: "lifecycle", label: "Customer Lifecycle", icon: "Lifecycle" },
  { id: "ops-hub", label: "Operations Hub", icon: "OpsHub" },
  { id: "photos", label: "Photos", icon: "Photos" },
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
  { id: "demo", name: "Demo", slug: "demo" },
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
  "ops-bathing":"ops/bathing", "ops-pamper":"ops/pamper", "ops-svc":"ops/service",
  management:"management", "mgmt-attendance":"management/attendance", "mgmt-audit-log":"management/audit-log",
  "checkout-tv":"checkout-tv",
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
const fmtDate = (d) => { if(!d) return ""; const dt=new Date(d+"T00:00:00"); return dt.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"}); };
const fmtDateFull = (d) => { if(!d) return ""; const dt=new Date(d+"T00:00:00"); return `${String(dt.getMonth()+1).padStart(2,"0")}/${String(dt.getDate()).padStart(2,"0")}/${dt.getFullYear()}`; };
const fmtDateShort = (d) => { if(!d) return ""; const dt=new Date(d+"T00:00:00"); return `${String(dt.getMonth()+1).padStart(2,"0")}/${String(dt.getDate()).padStart(2,"0")}/${String(dt.getFullYear()).slice(2)}`; };
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
const OPS_TYPES = {opening:{key:"openingTemplate",def:DEF_OPENING_TEMPLATE,title:"Opening Checklist"},fe:{key:"feTemplate",def:DEF_FE_TEMPLATE,title:"Front-End Checklist",showTime:true},be:{key:"beTemplate",def:DEF_BE_TEMPLATE,title:"Back-End Checklist",showTime:true},closing:{key:"closingTemplate",def:DEF_CLOSING_TEMPLATE,title:"Closing Checklist"},room_cleaning:{title:"Room Cleaning"},pp:{title:"Private Play Checklist"},bathing:{title:"Bathing Report"},pamper:{title:"Pamper Package Plus"},svc:{title:"Service Report"},eod:{title:"End-of-Day Report",isEod:true}};

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
const OPERATIONS_CATALOG = [
  // Daily items (route to existing pages)
  { id:"ops-opening", label:"Opening Checklist", frequency:"daily", dataKey:"dailyOps", typeSub:"opening", routeTo:"ops-opening", permission:"view_daily_ops" },
  { id:"ops-fe", label:"Front-End Checklist", frequency:"daily", dataKey:"dailyOps", typeSub:"fe", routeTo:"ops-fe", permission:"view_daily_ops" },
  { id:"ops-be", label:"Back-End Checklist", frequency:"daily", dataKey:"dailyOps", typeSub:"be", routeTo:"ops-be", permission:"view_daily_ops" },
  { id:"ops-rooms", label:"Room Cleaning", frequency:"daily", dataKey:"dailyOps", typeSub:"room_cleaning", routeTo:"ops-rooms", permission:"view_daily_ops" },
  { id:"ops-pp", label:"Private Play Checklist", frequency:"daily", dataKey:"dailyOps", typeSub:"pp", routeTo:"ops-pp", permission:"view_daily_ops" },
  { id:"ops-closing", label:"Closing Checklist", frequency:"daily", dataKey:"dailyOps", typeSub:"closing", routeTo:"ops-closing", permission:"view_daily_ops" },
  // Services are dynamically generated from reservation data — see OperationsHub component
  { id:"eod", label:"EOD Report", frequency:"daily", dataKey:"eodEntries", typeSub:null, routeTo:"eod", permission:"view_eod" },
  // Weekly placeholders
  { id:"weekly-inventory", label:"Weekly Inventory", frequency:"weekly", comingSoon:true },
  { id:"weekly-maintenance", label:"Weekly Maintenance", frequency:"weekly", comingSoon:true },
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
  conversion: "Leads auto-feed here after an Eval or Tour with no booking (+1 day follow-up). Log each outreach attempt, set the next follow-up date, and mark leads as Cold when they stop responding.",
  active: "Active customers have a booking history and either have an upcoming reservation or visited recently. Clients move here automatically when they book or pay for the first time.",
  retention: "Clients lapse here when they have no upcoming reservation and haven't visited within the configurable threshold (see Settings → Resort Policies). Booking a new appointment automatically moves them back to Active.",
  cold: "Leads or lapsed clients you've manually marked as Cold. Click Revive to re-engage — you'll be prompted to log a note and set a new follow-up, and the client will return to Conversion or Retention based on their history.",
  all: "Aggregate view of every client record regardless of lifecycle stage. Use the search bar or column headers to sort and find any client quickly.",
};

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
  { section:"Lifecycle", key:"stage", label:"Stage", type:"select", ops:["is","isNot"], options:["conversion","active","retention","cold"] },
  { section:"Lifecycle", key:"source", label:"Source", type:"select", ops:["is","isNot"], options:["eval","tour","manual","ignite",""] },
  { section:"Lifecycle", key:"followUp", label:"Follow-Up", type:"followUpStatus", ops:["overdue","today","thisWeek","hasDate","noDate"] },
];
const LC_OP_LABELS = {"contains":"contains","equals":"equals","starts":"starts with","empty":"is empty","notEmpty":"not empty","=":"=",">=":"≥","<=":"≤",">":">","<":"<","after":"after","before":"before","inLastDays":"in last X days","has":"has","missing":"doesn't have","is":"is","isNot":"is not","overdue":"overdue","today":"today","thisWeek":"this week","hasDate":"has date","noDate":"no date"};

// ─── Operations Stats Helpers ──────────────────────────────────────────────

export { C, LEAN_ROLES, LEAN_PERMISSION_AREAS, LEAN_PERMISSION_MATRIX, IDB_VERSION, idbGet, idbSet, LITE_DEF_PRICING, CHART_PTS, OPERATIONS_CATALOG, OPS_TYPES, LITE_ACTION_LABELS, LITE_ACTION_LEVELS, DEF_CLIENT_FIELDS, DEF_DOG_FIELDS, DEFAULT_LIFECYCLE_BANNERS, LC_OP_LABELS, LC_FILTER_FIELDS, K9_LOGO_SRC, K9_LOGO_PNG, ROOM_TYPES, NAV_ITEMS, DEF_OPENING_TEMPLATE, DEF_FE_TEMPLATE, DEF_BE_TEMPLATE, DEF_CLOSING_TEMPLATE, DEF_LITE_EOD_TEMPLATE, DAY_NAMES_SHORT, K9_LOCATIONS, POS_BASE, PAGE_SLUGS, SLUG_TO_PAGE, ENT_SLUG_TO_PAGE, buildUrl, parseUrl, gid, formatDogNames, fmtPhoneInput, titleCase, fmtPhone, fmtDate, fmtDateFull, fmtDateShort, fmtTime, fmtInstr, todayStr, addDays, formatTime12hr, countNights, countHours, IDB_NAME, IDB_STORE, idbOpen };
