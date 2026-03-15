// K9 Operations Lite — Application Shell
// This is the thin router/sidebar wrapper. DO NOT add page logic here.

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import ReactDOM from "react-dom";
import { useAuth } from "../AuthProvider";
import { supabase } from "../supabaseClient";
import { C, LEAN_PERMISSION_AREAS, LEAN_PERMISSION_MATRIX, POS_BASE, PAGE_SLUGS, SLUG_TO_PAGE, ENT_SLUG_TO_PAGE, buildUrl, parseUrl, NAV_ITEMS, K9_LOCATIONS, gid, todayStr, addDays, LITE_DEF_PRICING, DEF_OPENING_TEMPLATE, DEF_FE_TEMPLATE, DEF_BE_TEMPLATE, DEF_CLOSING_TEMPLATE, OPERATIONS_CATALOG, OPS_TYPES, ROOM_TYPES, DEF_CLIENT_FIELDS, DEF_DOG_FIELDS, DEFAULT_LIFECYCLE_BANNERS, LC_OP_LABELS, LC_FILTER_FIELDS, LITE_ACTION_LABELS, LITE_ACTION_LEVELS, DEF_LITE_EOD_TEMPLATE, DAY_NAMES_SHORT, CHART_PTS, K9_LOGO_SRC, K9_LOGO_PNG, LEAN_ROLES, titleCase, fmtPhone, fmtDate, fmtDateFull, fmtDateShort, fmtTime, fmtInstr, formatTime12hr, countNights, countHours, formatDogNames, fmtPhoneInput, IDB_VERSION, idbGet, idbSet } from "../shared/theme";
import { I, Icons } from "../shared/icons";
import { K9Logo, K9LogoMini, Btn, Tip, Badge, CustomSelect, MiniDatePicker, ComplianceCheckItem, Inp, CalendarPicker, Modal, Card, isFieldRequired, validateClientFields } from "../shared/ui";
import { hasLeanPermission, hasPermission, _resolveRole, LEGACY_ROLE_MAP, ROLE_CODE_MAP } from "../shared/permissions";
import { classifyReservationType, classifyReservationStatus, extractRoomFromType, getRoomCleaningStats, resSvcIncludes, getPPStats, getOpsCardStatus, getOpsProgress, getOpsCountLabel } from "../shared/opsHelpers";
import K9LoadingAnimation from "../shared/K9LoadingAnimation";
import LocationSelector from "../shared/LocationSelector";
import useGingrData from "../hooks/useGingrData";
import { applyStructuredFilters } from "../hooks/useFilters";
// Page imports
import ClientsPage from "./pages/ClientsPage";
import FunnelPage from "./pages/FunnelPage";
import OperationsHub from "./pages/OperationsHub";
import LiteEODPage from "./pages/EODPage";
import DailyOpsPage from "./pages/DailyOpsPage";
import DogDetailPage from "./pages/DogDetailPage";
import ClientDetailPage from "./pages/ClientDetailPage";
import AttendanceTrackerPage from "./pages/AttendancePage";
import AuditLogPage from "./pages/AuditLogPage";
import NewClientPage from "./pages/NewClientPage";
import CheckoutTVPage from "./pages/CheckoutTVPage";
import LiteReportsPage from "./pages/ReportsPage";
import PhotosPage from "./pages/PhotosPage";
import SettingsPage from "./pages/SettingsPage";
import DashboardPage from "./pages/DashboardPage";
import RefundsPage from "./pages/RefundsPage";
import EnterpriseOpsMatrix from "./enterprise/OpsMatrix";
import EnterpriseAttendance from "./enterprise/Attendance";
import EnterpriseUserManagement from "./enterprise/UserManagement";
import InventoryPage from "./pages/InventoryPage";
import InventoryReportPage from "./pages/InventoryReportPage";
import CashTipsPage from "./pages/CashTipsPage";
import TestHealthPage from "./pages/TestHealthPage";

class LeanAppErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null, info: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("K9 Lite Error:", error, info); this.setState({ info }); }
  render() {
    if (this.state.error) {
      return <div style={{padding:40,fontFamily:"monospace"}}>
        <h2 style={{color:"red"}}>K9 Operations Lite crashed</h2>
        <pre style={{whiteSpace:"pre-wrap",fontSize:13,background:"#f5f5f5",padding:20,borderRadius:8}}>{this.state.error.toString()}{"\n\n"}{this.state.info?.componentStack}</pre>
      </div>;
    }
    return this.props.children;
  }
}

// ─── Lite URL Routing ────────────────────────────────────────────────────
// Maps page IDs to URL slugs for the Lite app (lives under /lite/)
const LITE_BASE = "/lite";
const LITE_PAGE_SLUGS = {
  "dashboard": "dashboard",
  "lifecycle": "lifecycle",
  "client-detail": "client",
  "dog-detail": "dog",
  "new-client": "new-client",
  "funnel": "funnel",
  "ops-hub": "operations",
  "daily-ops": "daily-ops",
  "ops-opening": "ops/opening",
  "ops-fe": "ops/front-end",
  "ops-be": "ops/back-end",
  "ops-rooms": "ops/rooms",
  "ops-pictures": "ops/pictures",
  "ops-pp": "ops/private-play",
  "ops-closing": "ops/closing",
  "ops-bathing": "ops/bathing",
  "ops-pamper": "ops/pamper",
  "ops-svc": "ops/service",
  "eod": "eod",
  "attendance": "attendance",
  "mgmt-attendance": "attendance",
  "mgmt-audit-log": "audit-log",
  "reports": "reports",
  "refunds": "refunds",
  "photos": "photos",
  "checkout-tv": "checkout-tv",
  "roadmap": "roadmap",
  "settings": "settings",
  "inventory": "inventory",
  "inventory-report": "inventory/report",
  "enterprise-ops": "enterprise/operations",
  "enterprise-attendance": "enterprise/attendance",
  "enterprise-users": "enterprise/users",
  "test-health": "test-health",
};
const LITE_SLUG_TO_PAGE = {};
Object.entries(LITE_PAGE_SLUGS).forEach(([k, v]) => { if (!LITE_SLUG_TO_PAGE[v]) LITE_SLUG_TO_PAGE[v] = k; });

function buildLiteUrl(locSlug, pg, prms, dataRef) {
  const slug = LITE_PAGE_SLUGS[pg] || pg;
  if (locSlug === "enterprise") return `${LITE_BASE}/enterprise/${slug.replace("enterprise/", "")}`;
  if (pg === "client-detail" && prms?.clientId && dataRef) {
    const c = (dataRef.clients || []).find(cl => cl.id === prms.clientId);
    const phone = c?.fields?.phone?.replace(/\D/g, "");
    if (phone) return `${LITE_BASE}/${locSlug}/client/${phone}`;
  }
  if (pg === "dog-detail" && prms?.clientId && prms?.dogId && dataRef) {
    const c = (dataRef.clients || []).find(cl => cl.id === prms.clientId);
    const d = (dataRef.dogs || []).find(dg => dg.id === prms.dogId);
    const phone = c?.fields?.phone?.replace(/\D/g, "");
    if (phone && d) return `${LITE_BASE}/${locSlug}/client/${phone}/${encodeURIComponent((d.fields?.name || "dog").toLowerCase())}`;
  }
  return `${LITE_BASE}/${locSlug}/${slug}`;
}

function parseLiteUrl(pathname, dataRef) {
  let cleanPath = pathname;
  if (cleanPath.startsWith(LITE_BASE)) cleanPath = cleanPath.slice(LITE_BASE.length) || "/";
  const parts = cleanPath.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  if (parts.length === 0) return { locSlug: "cherry-hill", page: "dashboard", params: {} };
  const locSlug = parts[0];
  if (locSlug === "enterprise") {
    const epSlug = parts.slice(1).join("/") || "operations";
    const pg = LITE_SLUG_TO_PAGE["enterprise/" + epSlug] || LITE_SLUG_TO_PAGE[epSlug] || "enterprise-ops";
    return { locSlug: "enterprise", page: pg, params: {} };
  }
  if (parts.length === 1) return { locSlug, page: "dashboard", params: {} };
  // Client detail: /{loc}/client/{phone}
  if (parts[1] === "client" && parts[2]) {
    const phone = parts[2];
    if (parts[3] && dataRef) {
      const c = (dataRef.clients || []).find(cl => (cl.fields?.phone || "").replace(/\D/g, "") === phone);
      if (c) {
        const dogName = decodeURIComponent(parts[3]).toLowerCase();
        const dogs = (dataRef.dogs || []).filter(d => d.fields?.owner_id === c.id || (dataRef.reservations || []).some(r => r.clientId === c.id && r.dogId === d.id));
        const dog = dogs.find(d => (d.fields?.name || "").toLowerCase() === dogName) || dogs[0];
        if (dog) return { locSlug, page: "dog-detail", params: { clientId: c.id, dogId: dog.id } };
      }
    }
    if (dataRef) {
      const c = (dataRef.clients || []).find(cl => (cl.fields?.phone || "").replace(/\D/g, "") === phone);
      if (c) return { locSlug, page: "client-detail", params: { clientId: c.id } };
    }
    return { locSlug, page: "lifecycle", params: {} };
  }
  const pgSlug = parts.slice(1).join("/");
  const pg = LITE_SLUG_TO_PAGE[pgSlug] || "dashboard";
  return { locSlug, page: pg, params: {} };
}

// ─── Navigation Config ───────────────────────────────────────────────────
const LEAN_NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: "Dashboard" },
  { id: "lifecycle", label: "Customer Lifecycle", icon: "Users" },
  { id: "ops-hub", label: "Operations", icon: "Clipboard" },
  { id: "inventory", label: "Inventory", icon: "Package" },
  { id: "cash-tips", label: "Cash Tips", icon: "DollarSign" },
  { id: "photos", label: "Photos", icon: "Image" },
  { id: "checkout-tv", label: "TV", icon: "Monitor" },
  { id: "test-health", label: "Test Health", icon: "CheckCircle" },
  { id: "settings", label: "Settings", icon: "Settings" },
];

const LEAN_ENTERPRISE_NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: "Dashboard" },
  { id: "enterprise-ops", label: "Operations Matrix", icon: "Dashboard" },
  { id: "enterprise-attendance", label: "Attendance", icon: "Calendar" },
  { id: "enterprise-users", label: "User Management", icon: "Users" },
  { id: "settings", label: "Settings", icon: "Settings" },
];

const K9_LEAN_LOCATIONS = [
  { id: "enterprise", name: "Enterprise", slug: "enterprise", isEnterprise: true },
  { id: "8ea382b0-63f7-44ac-b6f8-83243c03d946", name: "Cherry Hill", slug: "cherry-hill" },
  { id: "demo-pos", name: "Demo POS", slug: "demo", isPOS: true },
];

// ─── Main App Component ───────────────────────────────────────────────────
function LeanAppInner() {
  const { user, profile: authProfile } = useAuth();

  // Parse URL on initial load to determine starting page and location
  const initialParsed = useMemo(() => {
    const path = window.location.pathname;
    if (path.startsWith(LITE_BASE)) return parseLiteUrl(path, null);
    return { locSlug: null, page: "dashboard", params: {} };
  }, []);

  // Resolve initial location from URL slug or auth profile
  const initialLocation = useMemo(() => {
    if (initialParsed.locSlug) {
      const match = K9_LEAN_LOCATIONS.find(l => l.slug === initialParsed.locSlug);
      if (match) return match.id;
    }
    return authProfile?.location_id || "8ea382b0-63f7-44ac-b6f8-83243c03d946";
  }, [initialParsed.locSlug, authProfile?.location_id]);

  const [page, setPage] = useState(initialParsed.page);
  const [params, setParams] = useState(initialParsed.params);
  const [navStack, setNavStack] = useState([{ page: initialParsed.page, params: initialParsed.params }]);
  const [lcFilters, setLcFilters] = useState({});
  const [lcFilterOpen, setLcFilterOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sbExpanded = sidebarOpen;

  // Use the auth profile's location_id (UUID) so it matches Supabase data
  const [currentLocation, setCurrentLocation] = useState(initialLocation);
  const [accountSwitchOpen, setAccountSwitchOpen] = useState(false);
  const [switchTarget, setSwitchTarget] = useState(null);
  const [switchPassword, setSwitchPassword] = useState("");
  const [switchError, setSwitchError] = useState("");
  const [switchLoading, setSwitchLoading] = useState(false);
  const [teamAccounts, setTeamAccounts] = useState([]);

  // Sync currentLocation with auth profile when it loads
  useEffect(() => {
    if (authProfile?.location_id && authProfile.location_id !== currentLocation) {
      setCurrentLocation(authProfile.location_id);
    }
  }, [authProfile?.location_id]);

  // Gingr data from Supabase (clients, dogs, reservations, rooms, etc.)
  const mockData = useGingrData(currentLocation);

  // Live Supabase data for ops & audit (layered on top of mock data)
  const [liveDailyOps, setLiveDailyOps] = useState([]);
  const [liveAuditLog, setLiveAuditLog] = useState([]);
  const [liveEodEntries, setLiveEodEntries] = useState([]);
  const [liveResortPolicies, setLiveResortPolicies] = useState(null);

  // Load persisted resort policies (retention thresholds) from lite_settings
  useEffect(() => {
    supabase.from("lite_settings").select("setting_value").eq("location_id", currentLocation).eq("setting_key", "resort_policies").then(({ data: rows }) => {
      if (rows && rows.length > 0 && rows[0].setting_value) setLiveResortPolicies(rows[0].setting_value);
    });
  }, [currentLocation]);

  // Merged data object — mock + live Supabase
  const data = useMemo(() => ({
    ...mockData,
    dailyOps: liveDailyOps.length > 0 ? liveDailyOps : mockData.dailyOps,
    auditLog: liveAuditLog,
    eodEntries: liveEodEntries,
    ...(liveResortPolicies ? { resortPolicies: { ...mockData.resortPolicies, ...liveResortPolicies } } : {}),
  }), [mockData, liveDailyOps, liveAuditLog, liveEodEntries, liveResortPolicies]);

  // Mock profile
  const profile = {
    id: "mock-user",
    role: "owner",
    email: user?.email || "user@example.com",
    full_name: user?.user_metadata?.full_name || "Demo User",
    name: user?.user_metadata?.full_name || "Demo User",
    location_id: currentLocation,
  };

  // Load ops data from Supabase on mount & location change
  useEffect(() => {
    const loadOpsData = async () => {
      try {
        const [opsResult, auditResult] = await Promise.all([
          supabase.from("lite_daily_ops").select("*").eq("location_id", currentLocation).order("date", { ascending: false }),
          supabase.from("lite_audit_log").select("*").eq("location_id", currentLocation).order("timestamp", { ascending: false }).limit(500),
        ]);

        if (opsResult.data) {
          const allOps = opsResult.data.map(r => ({
            id: r.id,
            type: r.type_sub || r.type,
            typeSub: r.type_sub,
            date: r.date,
            locked: r.locked,
            completedBy: r.completed_by,
            items: r.items || {},
            sections: r.sections,
            mentions: r.mentions,
            history: r.history || [],
          }));
          setLiveDailyOps(allOps.filter(d => d.type !== 'eod'));
          setLiveEodEntries(allOps.filter(d => d.type === 'eod'));
        }

        if (auditResult.data) {
          setLiveAuditLog(auditResult.data.map(r => ({
            id: r.id,
            timestamp: r.timestamp,
            userId: r.user_id,
            userName: r.user_name,
            action: r.action,
            resourceType: r.resource_type,
            resourceId: r.resource_id,
            details: r.details || [],
            reservationId: r.resource_type === 'reservation' ? r.resource_id : null,
          })));
        }
      } catch (err) {
        console.log("[K9 Lite] Failed to load ops data:", err.message);
      }
    };
    loadOpsData();
  }, [currentLocation]);

  // Save function — persists dailyOps and auditLog to Supabase
  const save = useCallback(async (newData) => {
    try {
      // Save dailyOps changes
      if (newData.dailyOps) {
        const opsRows = newData.dailyOps.map(d => ({
          id: d.id,
          location_id: currentLocation,
          type: d.type === 'checklist' || ['opening','closing','fe','be','fe_checklist','be_checklist'].includes(d.typeSub || d.type) ? 'checklist' : (d.typeSub || d.type),
          type_sub: d.typeSub || d.type,
          date: d.date,
          locked: d.locked || false,
          completed_by: d.completedBy || null,
          items: d.items || {},
          history: d.history || [],
        }));

        if (opsRows.length > 0) {
          const { error } = await supabase.from("lite_daily_ops").upsert(opsRows, { onConflict: "id" });
          if (error) console.log("[K9 Lite] Ops save error:", error.message);
        }

        setLiveDailyOps(newData.dailyOps.filter(d => (d.typeSub || d.type) !== 'eod'));
      }

      // Save eodEntries changes
      if (newData.eodEntries) {
        const eodRows = newData.eodEntries.map(d => ({
          id: d.id,
          location_id: currentLocation,
          type: 'eod',
          type_sub: 'eod',
          date: d.date,
          locked: d.locked || false,
          completed_by: d.completedBy || null,
          items: d.items || {},
          sections: d.sections || null,
          mentions: d.mentions || null,
          history: d.history || [],
        }));

        if (eodRows.length > 0) {
          const { error } = await supabase.from("lite_daily_ops").upsert(eodRows, { onConflict: "id" });
          if (error) console.log("[K9 Lite] EOD save error:", error.message);
        }

        setLiveEodEntries(newData.eodEntries);
      }

      // Save audit log entries (new ones only — append)
      if (newData.auditLog && newData.auditLog.length > liveAuditLog.length) {
        const newEntries = newData.auditLog.slice(liveAuditLog.length);
        const auditRows = newEntries.map(a => ({
          location_id: currentLocation,
          timestamp: a.timestamp || new Date().toISOString(),
          user_id: user?.id || null,
          user_name: a.userName || profile.name,
          action: a.action,
          resource_type: a.resourceType || null,
          resource_id: a.resourceId || a.reservationId || null,
          details: a.details || [],
        }));

        if (auditRows.length > 0) {
          const { error } = await supabase.from("lite_audit_log").insert(auditRows);
          if (error) console.log("[K9 Lite] Audit save error:", error.message);
        }

        setLiveAuditLog(newData.auditLog);
      }

      // Save client lifecycle changes (followUp, notes, cold, etc.)
      if (newData.clients && mockData?.clients) {
        const changed = [];
        newData.clients.forEach(c => {
          if (!c.gingrId) return;
          const old = mockData.clients.find(o => o.id === c.id);
          if (c.lifecycle && JSON.stringify(c.lifecycle) !== JSON.stringify(old?.lifecycle)) {
            changed.push({ location_id: currentLocation, gingr_id: String(c.gingrId), lifecycle_data: c.lifecycle, updated_at: new Date().toISOString() });
          }
        });
        if (changed.length > 0) {
          const { error } = await supabase.from("lite_client_lifecycle").upsert(changed, { onConflict: "location_id,gingr_id" });
          if (error) console.log("[K9 Lite] Lifecycle save error:", error.message);
        }
      }
    } catch (err) {
      console.log("[K9 Lite] Save error:", err.message);
    }
    return true;
  }, [currentLocation, user?.id, liveAuditLog.length, mockData?.clients]);

  // ─── URL Routing ──────────────────────────────────────────────────────
  const skipUrlPush = useRef(false);
  const locSlug = useMemo(() => {
    const loc = K9_LEAN_LOCATIONS.find(l => l.id === currentLocation);
    return loc?.slug || "cherry-hill";
  }, [currentLocation]);

  // Sync URL when page/params change
  const initialUrlSet = useRef(false);
  useEffect(() => {
    if (skipUrlPush.current) { skipUrlPush.current = false; return; }
    const url = buildLiteUrl(locSlug, page, params, data);
    if (window.location.pathname !== url) {
      // Use replaceState for the initial redirect (e.g., / → /lite/cherry-hill/dashboard)
      // to avoid creating a back-button entry to the bare root URL
      if (!initialUrlSet.current) {
        initialUrlSet.current = true;
        window.history.replaceState({ page, params, loc: currentLocation }, "", url);
      } else {
        window.history.pushState({ page, params, loc: currentLocation }, "", url);
      }
    } else if (!initialUrlSet.current) {
      // Even if URL matches, replace state with routing data for popstate
      initialUrlSet.current = true;
      window.history.replaceState({ page, params, loc: currentLocation }, "", url);
    }
  }, [page, params, locSlug, data]);

  // Re-parse URL when data loads (resolves client/dog details from phone numbers)
  const dataLoadedRef = useRef(false);
  useEffect(() => {
    if (!data?.clients?.length || dataLoadedRef.current) return;
    dataLoadedRef.current = true;
    const path = window.location.pathname;
    if (path.startsWith(LITE_BASE)) {
      const parsed = parseLiteUrl(path, data);
      if (parsed.page !== page || JSON.stringify(parsed.params) !== JSON.stringify(params)) {
        skipUrlPush.current = true;
        setPage(parsed.page);
        setParams(parsed.params);
        setNavStack([{ page: parsed.page, params: parsed.params }]);
      }
    }
  }, [data]);

  // Handle browser back/forward buttons
  useEffect(() => {
    const handler = (e) => {
      skipUrlPush.current = true;
      let newPage, newParams;
      if (e.state?.page) {
        newPage = e.state.page;
        newParams = e.state.params || {};
        if (e.state.loc) {
          const locMatch = K9_LEAN_LOCATIONS.find(l => l.id === e.state.loc);
          if (locMatch) setCurrentLocation(locMatch.id);
        }
      } else {
        const parsed = parseLiteUrl(window.location.pathname, data);
        newPage = parsed.page;
        newParams = parsed.params;
        const locMatch = K9_LEAN_LOCATIONS.find(l => l.slug === parsed.locSlug);
        if (locMatch) setCurrentLocation(locMatch.id);
      }
      setPage(newPage);
      setParams(newParams);
      setNavStack([{ page: newPage, params: newParams }]);
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, [data]);

  // Navigation function with breadcrumb stack
  const TOP_LEVEL_PAGES = useMemo(() => new Set(["dashboard", "lifecycle", "funnel", "ops-hub", "reports", "inventory", "cash-tips", "photos", "test-health", "settings", "enterprise-ops", "enterprise-attendance", "enterprise-users"]), []);
  const nav = useCallback((newPage, newParams = {}) => {
    setPage(newPage);
    setParams(newParams);
    if (TOP_LEVEL_PAGES.has(newPage)) {
      setNavStack([{ page: newPage, params: newParams }]);
    } else {
      setNavStack(s => [...s, { page: newPage, params: newParams }]);
    }
  }, [TOP_LEVEL_PAGES]);

  // Breadcrumb label formatter
  const breadcrumbLabel = useCallback((pg, prms) => {
    switch(pg) {
      case "dashboard": return "Dashboard";
      case "lifecycle": return "Customer Lifecycle";
      case "funnel": return "Conversion Funnel";
      case "ops-hub": return "Operations";
      case "ops-opening": return "Opening Checklist";
      case "ops-fe": return "FE Checklist";
      case "ops-be": return "BE Checklist";
      case "ops-rooms": return "Room Cleaning";
      case "ops-pictures": return "Pictures";
      case "ops-pp": return "Private Play";
      case "ops-closing": return "Closing Checklist";
      case "ops-bathing": return "Bathing Report";
      case "ops-pamper": return "Pamper Package Plus";
      case "ops-svc": return params?.svcName || "Service Report";
      case "eod": return "End of Day";
      case "daily-ops": return "Daily Ops";
      case "attendance": case "mgmt-attendance": return "Attendance Tracker";
      case "mgmt-audit-log": return "Audit Log";
      case "client-detail": {
        const c = (mockData?.clients||[]).find(cl => cl.id === prms?.clientId);
        return c ? `${c.fields?.first_name||""} ${c.fields?.last_name||""}`.trim() || "Client" : "Client";
      }
      case "new-client": return "New Client";
      case "refunds": return "Refunds";
      case "photos": return "Photos";
      case "settings": return "Settings";
      case "enterprise-ops": return "Operations Matrix";
      case "enterprise-attendance": return "Attendance";
      case "enterprise-users": return "User Management";
      case "inventory": return "Inventory";
      case "inventory-report": return "Inventory Reports";
      case "cash-tips": return "Cash Tips";
      case "test-health": return "Test Health";
      default: return pg;
    }
  }, [mockData]);

  // Toast notification system
  const [toasts, setToasts] = useState([]);
  const addGlobalToast = useCallback((msg, type = "info") => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }, []);

  // Load fonts
  useEffect(() => {
    if (!document.getElementById("k9-lite-fonts")) {
      const style = document.createElement("style");
      style.id = "k9-lite-fonts";
      style.textContent = `
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:6px;} ::-webkit-scrollbar-thumb{background:#C4C8D0;border-radius:3px;} ::-webkit-scrollbar-track{background:transparent;}
        input:focus,select:focus,textarea:focus{border-color:${C.pri}!important;box-shadow:0 0 0 3px rgba(20,83,45,0.08);}
        h1,h2,h3,h4,h5,h6,.brand-headline{font-family:'Outfit', sans-serif !important;font-weight:700;}
        body { margin: 0; padding: 0; font-family: 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif; }
        @keyframes k9-toast-in { from { opacity: 0; transform: translateY(-12px); } to { opacity: 1; transform: translateY(0); } }
      `;
      document.head.appendChild(style);
    }
  }, []);

  // Handle location change
  const handleLocationChange = useCallback((locId) => {
    // Demo POS redirects to the full POS app
    const loc = K9_LEAN_LOCATIONS.find(l => l.id === locId);
    if (loc?.isPOS) {
      window.location.href = "/pos/" + (loc.slug || "demo");
      return;
    }
    setCurrentLocation(locId);
    try { localStorage.setItem("k9_lite_location", locId); } catch {}
  }, []);

  // Fetch team accounts for quick-switch
  useEffect(() => {
    if (!profile?.id) return;
    supabase.from("lite_profiles").select("id,user_id,full_name,email,role").eq("location_id", currentLocation).eq("is_active", true)
      .then(({ data: members }) => { if (members) setTeamAccounts(members.filter(m => m.id !== profile.id)); });
  }, [currentLocation, profile?.id]);

  // Handle account switch
  const handleAccountSwitch = async () => {
    if (!switchTarget || !switchPassword) return;
    setSwitchLoading(true);
    setSwitchError("");
    const { error } = await supabase.auth.signInWithPassword({ email: switchTarget.email, password: switchPassword });
    setSwitchLoading(false);
    if (error) { setSwitchError("Invalid password. Please try again."); return; }
    setSwitchTarget(null);
    setSwitchPassword("");
  };

  // Main content area
  const renderPage = () => {
    // Permission area mapping: page id → LEAN_PERMISSION_AREAS key
    const PAGE_PERM_MAP = {
      "dashboard": null, // dashboard handles its own per-section permissions via props
      "lifecycle": "Customer Lifecycle",
      "client-detail": "Customer Lifecycle",
      "dog-detail": "Customer Lifecycle",
      "ops-hub": "Operations Hub",
      "daily-ops": "Operations Hub",
      "attendance": "Attendance Tracker",
      "reports": null,
      "photos": "Photos Module",
      "settings": null, // settings handles its own per-tab permissions
      "inventory": "Inventory Management",
      "inventory-report": "Inventory Management",
      "cash-tips": null,
      "test-health": null,
      "enterprise-ops": "Enterprise View",
      "enterprise-attendance": "Enterprise View",
      "enterprise-users": "Enterprise View",
    };
    const requiredPerm = PAGE_PERM_MAP[page];
    if (requiredPerm && currentLocation !== "enterprise" && !hasLeanPermission(profile, requiredPerm)) {
      return <div style={{ padding: 40, textAlign: "center", color: C.dan }}><h2 style={{ margin: 0, color: C.dan }}>Access Denied</h2><p style={{ marginTop: 12, color: C.textSec }}>You don't have permission to access this area.</p></div>;
    }

    switch (page) {
      case "dashboard": {
        // DASH-002: Permission-based dashboard views
        const role = (profile.role || "pct").toLowerCase();
        const isOwnerOrManager = role === "owner" || role === "manager" || role === "admin" || role === "enterprise_admin" || role === "regional" || role === "developer";
        const isCSR = role === "csr" || role === "supervisor";
        const dashboardPermissions = {
          showSnapshot: true,
          showRevenue: isOwnerOrManager,
          showFunnel: isOwnerOrManager,
          showLTV: isOwnerOrManager,
          showRevenueComposition: isOwnerOrManager,
          showRevenueByCategory: isOwnerOrManager,
          showDiscountAnalysis: isOwnerOrManager,
          showTopClients: isOwnerOrManager,
          showOps: isOwnerOrManager || isCSR,
          showFunnelMetrics: isOwnerOrManager,
          showHeroKPIs: isOwnerOrManager,
        };
        return <DashboardPage data={data} save={save} nav={nav} profile={profile} addGlobalToast={addGlobalToast} {...dashboardPermissions} />;
      }
      case "lifecycle":
        return currentLocation === "enterprise" ? <div style={{ padding: 40, textAlign: "center" }}>Customer Lifecycle not available on Enterprise view</div> : (
          <ClientsPage
            data={data}
            save={save}
            nav={nav}
            profile={profile}
            addGlobalToast={addGlobalToast}
            lcFilters={lcFilters}
            setLcFilters={setLcFilters}
            lcFilterOpen={lcFilterOpen}
            setLcFilterOpen={setLcFilterOpen}
            locationSlug={currentLocation}
          />
        );
      case "funnel":
        return currentLocation === "enterprise" ? <div style={{ padding: 40, textAlign: "center" }}>Funnel not available on Enterprise view</div> : (
          <FunnelPage data={data} save={save} nav={nav} profile={profile} addGlobalToast={addGlobalToast} />
        );
      case "ops-hub":
        return currentLocation === "enterprise" ? <div style={{ padding: 40, textAlign: "center" }}>Operations Hub not available on Enterprise view</div> : (
          <OperationsHub
            data={data}
            save={save}
            nav={nav}
            profile={profile}
            addGlobalToast={addGlobalToast}
          />
        );
      case "daily-ops":
        return (
          <DailyOpsPage
            data={data}
            save={save}
            sub={params.sub || "opening"}
            nav={nav}
            profile={profile}
            addGlobalToast={addGlobalToast}
          />
        );
      case "ops-opening":
        return <DailyOpsPage data={data} save={save} sub="opening" nav={nav} profile={profile} addGlobalToast={addGlobalToast} />;
      case "ops-fe":
        return <DailyOpsPage data={data} save={save} sub="fe" nav={nav} profile={profile} addGlobalToast={addGlobalToast} />;
      case "ops-be":
        return <DailyOpsPage data={data} save={save} sub="be" nav={nav} profile={profile} addGlobalToast={addGlobalToast} />;
      case "ops-rooms":
        return <DailyOpsPage data={data} save={save} sub="room_cleaning" nav={nav} profile={profile} addGlobalToast={addGlobalToast} />;
      case "ops-pictures":
        return <DailyOpsPage data={data} save={save} sub="pictures" nav={nav} profile={profile} addGlobalToast={addGlobalToast} />;
      case "ops-pp":
        return <DailyOpsPage data={data} save={save} sub="pp" nav={nav} profile={profile} addGlobalToast={addGlobalToast} />;
      case "ops-closing":
        return <DailyOpsPage data={data} save={save} sub="closing" nav={nav} profile={profile} addGlobalToast={addGlobalToast} />;
      case "ops-bathing":
        return <DailyOpsPage data={data} save={save} sub="bathing" nav={nav} profile={profile} addGlobalToast={addGlobalToast} />;
      case "ops-pamper":
        return <DailyOpsPage data={data} save={save} sub="pamper" nav={nav} profile={profile} addGlobalToast={addGlobalToast} />;
      case "ops-svc":
        return <DailyOpsPage data={data} save={save} sub="svc" nav={nav} profile={profile} addGlobalToast={addGlobalToast} params={params} />;
      case "eod":
        return <LiteEODPage data={data} save={save} nav={nav} profile={profile} addGlobalToast={addGlobalToast} />;
      case "mgmt-audit-log":
        return <AuditLogPage data={data} save={save} nav={nav} profile={profile} />;
      case "mgmt-attendance":
        return <AttendanceTrackerPage data={data} save={save} nav={nav} profile={profile} />;
      case "attendance":
        return <AttendanceTrackerPage data={data} save={save} nav={nav} profile={profile} />;
      case "dog-detail":
        return <DogDetailPage data={data} clientId={params.clientId} dogId={params.dogId} nav={nav} />;
      case "checkout-tv":
        return <CheckoutTVPage data={data} nav={nav} />;
      case "client-detail":
        return <ClientDetailPage data={data} save={save} clientId={params.clientId} nav={nav} profile={profile} addGlobalToast={addGlobalToast} />;
      case "new-client":
        return <NewClientPage data={data} save={save} nav={nav} profile={profile} addGlobalToast={addGlobalToast} />;
      case "reports":
        return currentLocation === "enterprise" ? <div style={{ padding: 40, textAlign: "center" }}>Reports not available on Enterprise view</div> : (
          <LiteReportsPage data={data} nav={nav} />
        );
      case "refunds":
        return <RefundsPage data={data} nav={nav} profile={profile} />;
      case "photos":
        return currentLocation === "enterprise" ? <div style={{ padding: 40, textAlign: "center" }}>Photos not available on Enterprise view</div> : <PhotosPage />;
      case "enterprise-ops":
        return <EnterpriseOpsMatrix />;
      case "enterprise-attendance":
        return <EnterpriseAttendance />;
      case "enterprise-users":
        return <EnterpriseUserManagement profile={profile} />;
      case "inventory":
        return <InventoryPage data={data} save={save} nav={nav} profile={profile} addGlobalToast={addGlobalToast} />;
      case "inventory-report":
        return <InventoryReportPage data={data} save={save} nav={nav} profile={profile} addGlobalToast={addGlobalToast} />;
      case "cash-tips":
        return <CashTipsPage data={data} save={save} nav={nav} profile={profile} addGlobalToast={addGlobalToast} />;
      case "test-health":
        return <TestHealthPage />;
      case "roadmap":
        return <RoadmapPage nav={nav} />;
      case "settings":
        return <SettingsPage profile={profile} addGlobalToast={addGlobalToast} />;
      default:
        return <div>Page not found</div>;
    }
  };

  const isFullscreenPage = page === "checkout-tv";

  return (
    <div style={{ display: "flex", height: "100vh", background: C.bg, fontFamily: "'Outfit', -apple-system, BlinkMacSystemFont, sans-serif" }}>
      {/* Sidebar — hidden on fullscreen pages like Checkout TV */}
      {!isFullscreenPage && <div
        onMouseEnter={() => setSidebarOpen(true)}
        onMouseLeave={() => setSidebarOpen(false)}
        style={{
          width: sbExpanded ? 240 : 68,
          background: `linear-gradient(180deg, ${C.pri} 0%, #0D3B1E 100%)`,
          display: "flex",
          flexDirection: "column",
          transition: "width 0.15s cubic-bezier(0.4,0,0.2,1)",
          overflow: "hidden",
          flexShrink: 0,
          zIndex: 50,
        }}
      >
        {/* Logo Header */}
        <div style={{ padding: "22px 15px 18px", display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 12, height: 40, boxSizing: "content-box" }}>
          <div style={{ flexShrink: 0, width: 34, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {sbExpanded ? <K9Logo size={38} variant="white" /> : <K9LogoMini size={34} variant="white" />}
          </div>
          <div style={{ overflow: "hidden", opacity: sbExpanded ? 1 : 0, transition: "opacity 0.1s", whiteSpace: "nowrap" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.acc, fontFamily: "'Outfit', sans-serif", letterSpacing: "0.02em" }}>K9 Operations</div>
            <div style={{ fontSize: 10, color: "rgba(132,204,22,0.6)", fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase" }}>Lite · KOL</div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ margin: "0 14px 8px", height: 1, background: "rgba(132,204,22,0.12)" }} />

        {/* Location Selector */}
        <div style={{ padding: "0 10px 8px", height: 44, boxSizing: "border-box" }}>
          <LocationSelector
            currentLocation={currentLocation}
            onLocationChange={handleLocationChange}
            collapsed={!sbExpanded}
            allLocations={K9_LEAN_LOCATIONS}
            profile={profile}
          />
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: "0 10px", overflowY: "auto" }}>
          {(currentLocation === "enterprise" ? LEAN_ENTERPRISE_NAV_ITEMS : LEAN_NAV_ITEMS).map(item => {
            const act = page === item.id;
            const IconComp = I[item.icon];
            return (
              <button
                key={item.id}
                onMouseEnter={e => { if (!act) e.currentTarget.style.background = "rgba(132,204,22,0.08)"; }}
                onMouseLeave={e => { if (!act) e.currentTarget.style.background = act ? "rgba(132,204,22,0.15)" : "transparent"; }}
                onClick={() => nav(item.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  width: "100%",
                  padding: "10px 14px",
                  justifyContent: "flex-start",
                  border: "none",
                  borderRadius: 10,
                  background: act ? "rgba(132,204,22,0.15)" : "transparent",
                  color: act ? C.acc : "rgba(255,255,255,0.85)",
                  fontSize: 13,
                  fontWeight: act ? 600 : 500,
                  cursor: "pointer",
                  marginBottom: 3,
                  fontFamily: "inherit",
                  transition: "background 0.12s, color 0.12s",
                  whiteSpace: "nowrap",
                  position: "relative",
                  boxSizing: "border-box",
                }}
              >
                <div style={{ flexShrink: 0, width: 20, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {IconComp && <IconComp />}
                </div>
                <span style={{ overflow: "hidden", opacity: sbExpanded ? 1 : 0, transition: "opacity 0.1s" }}>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Bottom: Account Switcher */}
        <div style={{ padding: "14px 10px", display: "flex", flexDirection: "column", gap: 6, position: "relative" }}>
          {sbExpanded && (
            <div style={{ position: "relative" }}>
              <button onClick={() => setAccountSwitchOpen(!accountSwitchOpen)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", border: "none", borderRadius: 8, background: accountSwitchOpen ? "rgba(132,204,22,0.15)" : "transparent", color: "rgba(132,204,22,0.6)", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600, textAlign: "left", transition: "background 0.15s" }}>
                <div style={{ width: 26, height: 26, borderRadius: 13, background: "rgba(132,204,22,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: C.acc }}>{(user?.email || "U")[0].toUpperCase()}</span>
                </div>
                <div style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "rgba(132,204,22,0.55)", fontSize: 11 }}>{user?.email || "User"}</div>
                <span style={{ fontSize: 8, color: "rgba(132,204,22,0.3)", transform: accountSwitchOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>&#9650;</span>
              </button>

              {accountSwitchOpen && (
                <div style={{ position: "absolute", bottom: "100%", left: 0, right: 0, marginBottom: 6, background: "#0D3B1E", border: "1px solid rgba(132,204,22,0.2)", borderRadius: 10, boxShadow: "0 -8px 32px rgba(0,0,0,0.4)", overflow: "hidden", zIndex: 200, maxHeight: 280, overflowY: "auto" }}>
                  <div style={{ padding: "10px 12px 6px", fontSize: 9, fontWeight: 700, color: "rgba(132,204,22,0.35)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Switch Account</div>
                  {teamAccounts.length === 0 ? (
                    <div style={{ padding: "12px", fontSize: 11, color: "rgba(255,255,255,0.3)", textAlign: "center", fontStyle: "italic" }}>No other accounts at this location</div>
                  ) : teamAccounts.map(acct => (
                    <button key={acct.id} onClick={() => { setSwitchTarget(acct); setSwitchPassword(""); setSwitchError(""); setAccountSwitchOpen(false); }}
                      style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: "none", background: "transparent", color: "rgba(255,255,255,0.8)", cursor: "pointer", fontFamily: "inherit", fontSize: 12, textAlign: "left", transition: "background 0.1s" }}
                      onMouseEnter={e => e.currentTarget.style.background = "rgba(132,204,22,0.1)"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <div style={{ width: 28, height: 28, borderRadius: 14, background: "rgba(132,204,22,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <span style={{ fontSize: 12, fontWeight: 800, color: C.acc }}>{(acct.full_name || acct.email || "?")[0].toUpperCase()}</span>
                      </div>
                      <div style={{ flex: 1, overflow: "hidden" }}>
                        <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{acct.full_name || acct.email}</div>
                        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{acct.email}</div>
                      </div>
                      <div style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: "rgba(132,204,22,0.1)", color: "rgba(132,204,22,0.5)", fontWeight: 600, textTransform: "uppercase" }}>{acct.role}</div>
                    </button>
                  ))}
                  <div style={{ borderTop: "1px solid rgba(132,204,22,0.1)", padding: "6px 12px" }}>
                    <button onClick={() => supabase.auth.signOut()} style={{ width: "100%", padding: "8px", border: "none", borderRadius: 6, background: "rgba(239,68,68,0.12)", color: "rgba(255,150,150,0.8)", cursor: "pointer", fontSize: 11, fontFamily: "inherit", fontWeight: 600 }}>Sign Out</button>
                  </div>
                </div>
              )}
            </div>
          )}
          {!sbExpanded && <button onClick={() => supabase.auth.signOut()} style={{ width: "100%", padding: "7px 14px", border: "none", borderRadius: 8, background: "rgba(239,68,68,0.12)", color: "rgba(255,150,150,0.8)", cursor: "pointer", fontSize: 12, fontFamily: "inherit", fontWeight: 500, textAlign: "center", boxSizing: "border-box" }}>&#9211;</button>}
          {sbExpanded && <div style={{ textAlign: "center", fontSize: 9, color: "rgba(255,255,255,0.5)", marginTop: 4, lineHeight: 1.4 }}>&copy; 2026 K9 Operations LLC<br/>All Rights Reserved</div>}

          {switchTarget && ReactDOM.createPortal(
            /* NOTE: closing </div> for sidebar is inside the !isFullscreenPage conditional */
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }} onClick={() => { setSwitchTarget(null); setSwitchPassword(""); setSwitchError(""); }}>
              <div onClick={e => e.stopPropagation()} style={{ background: C.surface, borderRadius: 16, padding: 28, width: 380, maxWidth: "90vw", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 4 }}>Switch Account</div>
                <div style={{ fontSize: 13, color: C.textSec, marginBottom: 20 }}>Enter password for <strong>{switchTarget.full_name || switchTarget.email}</strong></div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: C.bg, borderRadius: 10, marginBottom: 16 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 16, background: C.priLt, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: C.pri }}>{(switchTarget.full_name || switchTarget.email || "?")[0].toUpperCase()}</span>
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: C.text }}>{switchTarget.full_name || "Team Member"}</div>
                    <div style={{ fontSize: 11, color: C.textMut }}>{switchTarget.email}</div>
                  </div>
                </div>
                <input type="password" value={switchPassword} onChange={e => setSwitchPassword(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAccountSwitch()} placeholder="Password" autoFocus style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: `1.5px solid ${switchError ? "#EF4444" : C.border}`, fontSize: 14, fontFamily: "inherit", background: C.bg, color: C.text, boxSizing: "border-box", marginBottom: switchError ? 8 : 16 }} />
                {switchError && <div style={{ fontSize: 12, color: "#EF4444", marginBottom: 12, fontWeight: 500 }}>{switchError}</div>}
                <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <Btn variant="secondary" onClick={() => { setSwitchTarget(null); setSwitchPassword(""); setSwitchError(""); }}>Cancel</Btn>
                  <Btn variant="primary" onClick={handleAccountSwitch} disabled={!switchPassword || switchLoading}>{switchLoading ? "Signing in..." : "Switch"}</Btn>
                </div>
              </div>
            </div>,
            document.body
          )}
        </div>
      </div>}

      {/* Toast Notifications */}
      {toasts.length > 0 && (
        <div style={{ position: "fixed", top: 24, right: 24, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8 }}>
          {toasts.map(t => (
            <div key={t.id} style={{
              padding: "12px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600, fontFamily: "inherit",
              background: t.type === "success" ? C.suc : t.type === "error" ? C.dan : t.type === "warning" ? C.warn : C.pri,
              color: "#fff", boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
              animation: "k9-toast-in 0.25s ease",
              display: "flex", alignItems: "center", gap: 8, maxWidth: 380,
            }}>
              <span>{t.type === "success" ? "\u2713" : t.type === "error" ? "\u2717" : t.type === "warning" ? "\u26A0" : "\u2139"}</span>
              {t.msg}
            </div>
          ))}
        </div>
      )}

      {/* Main Content */}
      <div style={{ flex: 1, overflow: "auto", background: isFullscreenPage ? "transparent" : C.bg, padding: isFullscreenPage ? 0 : "32px 40px" }}>
        <div style={{ maxWidth: isFullscreenPage ? "none" : 1440, margin: "0 auto" }}>
          {navStack.length > 1 && !isFullscreenPage && (
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:16,fontSize:13,flexWrap:"wrap"}}>
              {navStack.map((entry, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span style={{color:C.border,fontSize:11,userSelect:"none"}}>›</span>}
                  {i < navStack.length - 1 ? (
                    <span onClick={() => { setPage(entry.page); setParams(entry.params); setNavStack(s => s.slice(0, i + 1)); }}
                      style={{cursor:"pointer",color:C.pri,fontWeight:500,padding:"2px 6px",borderRadius:6,transition:"background 0.15s"}}
                      onMouseEnter={e=>e.currentTarget.style.background=C.priLt}
                      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      {breadcrumbLabel(entry.page, entry.params)}
                    </span>
                  ) : (
                    <span style={{fontWeight:600,color:C.text,padding:"2px 6px"}}>{breadcrumbLabel(entry.page, entry.params)}</span>
                  )}
                </React.Fragment>
              ))}
            </div>
          )}
          {renderPage()}
        </div>
      </div>
    </div>
  );
}

export default function LiteApp() {
  return <LeanAppErrorBoundary><LeanAppInner /></LeanAppErrorBoundary>;
}

