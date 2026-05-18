// K9 Operations Lite — Application Shell
// This is the thin router/sidebar wrapper. DO NOT add page logic here.

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import ReactDOM from "react-dom";
import { useAuth } from "../AuthProvider";
import { supabase } from "../supabaseClient";
import { C, LEAN_PERMISSION_AREAS, LEAN_PERMISSION_MATRIX, POS_BASE, PAGE_SLUGS, SLUG_TO_PAGE, ENT_SLUG_TO_PAGE, buildUrl, parseUrl, NAV_ITEMS, K9_LOCATIONS, gid, todayStr, addDays, LITE_DEF_PRICING, DEF_OPENING_TEMPLATE, DEF_FE_TEMPLATE, DEF_BE_TEMPLATE, DEF_CLOSING_TEMPLATE, OPERATIONS_CATALOG, OPS_TYPES, ROOM_TYPES, DEF_CLIENT_FIELDS, DEF_DOG_FIELDS, DEFAULT_LIFECYCLE_BANNERS, LC_OP_LABELS, LC_FILTER_FIELDS, LITE_ACTION_LABELS, LITE_ACTION_LEVELS, DEF_LITE_EOD_TEMPLATE, DAY_NAMES_SHORT, CHART_PTS, K9_LOGO_SRC, K9_LOGO_PNG, LEAN_ROLES, titleCase, fmtPhone, fmtDate, fmtDateFull, fmtDateShort, fmtTime, fmtInstr, formatTime12hr, countNights, countHours, formatDogNames, fmtPhoneInput, IDB_VERSION, idbGet, idbSet } from "../shared/theme";
import { I, Icons } from "../shared/icons";
import { K9Logo, K9LogoMini, Btn, Tip, Badge, CustomSelect, MiniDatePicker, ComplianceCheckItem, Inp, CalendarPicker, Modal, Card, isFieldRequired, validateClientFields } from "../shared/ui";
import { applyLeanPermissionOverrides, hasAnyLeanPermission, hasEveryLeanPermission, hasLeanPermission, hasPermission, _resolveRole, LEGACY_ROLE_MAP, ROLE_CODE_MAP, getUserLocationIds } from "../shared/permissions";
import { classifyReservationType, classifyReservationStatus, extractRoomFromType, getRoomCleaningStats, resSvcIncludes, getPPStats, getOpsCardStatus, getOpsProgress, getOpsCountLabel } from "../shared/opsHelpers";
import K9LoadingAnimation from "../shared/K9LoadingAnimation";
import LocationSelector from "../shared/LocationSelector";
import useGingrData from "../hooks/useGingrData";
import { useRefreshSettings } from "../hooks/useRefreshSettings";
import { useFacilityPresence } from "../hooks/useFacilityPresence";
import { applyStructuredFilters } from "../hooks/useFilters";
import useRealtimeOps from "../hooks/useRealtimeOps";
// Page imports
import ClientsPage from "./pages/ClientsPage";
import FunnelPage from "./pages/FunnelPage";
import OperationsHub from "./pages/OperationsHub";
import LiteEODPage from "./pages/EODPage";
import DailyOpsPage from "./pages/DailyOpsPage";
import CareReportsPage from "./pages/CareReportsPage";
import DogDetailPage from "./pages/DogDetailPage";
import ClientDetailPage from "./pages/ClientDetailPage";
import AttendanceTrackerPage from "./pages/AttendancePage";
import AuditLogPage from "./pages/AuditLogPage";
import NewClientPage from "./pages/NewClientPage";
import CheckoutTVPage from "./pages/CheckoutTVPage";
import LiteReportsPage from "./pages/ReportsPage";
import PhotosPage from "./pages/PhotosPage";
import SettingsPage from "./pages/SettingsPage";
import RefundsPage from "./pages/RefundsPage";
import EnterpriseOpsMatrix from "./enterprise/OpsMatrix";
import EnterpriseAttendance from "./enterprise/Attendance";
import EnterpriseUserManagement from "./enterprise/UserManagement";
import CompanyDirectory from "./enterprise/CompanyDirectory";
import EnterpriseLocations from "./enterprise/Locations";
import InventoryPage from "./pages/InventoryPage";
import InventoryReportPage from "./pages/InventoryReportPage";
import CashTipsPage from "./pages/CashTipsPage";
import TestHealthPage from "./pages/TestHealthPage";
import OccupancyReportPage from "./pages/OccupancyReportPage";
import WeeklyMaintenancePage from "./pages/WeeklyMaintenancePage";
import OnboardingPage from "./pages/OnboardingPage";
import PricingPage from "./pages/PricingPage";
import CheckoutNotesPage from "./pages/CheckoutNotesPage";
import DogProfilePage from "./pages/DogProfilePage";
import RolePage from "./pages/RolePage";
import RoleLayoutPage from "./pages/RoleLayoutPage";
import RollCallSessionsPage from "./pages/RollCallSessionsPage";
import HomePage from "./pages/HomePage";
import DashboardPage from "./pages/DashboardPage";
import TrainingPage from "./pages/TrainingPage";
import SchedulingPage from "./pages/SchedulingPage";
import ClientManagementPage from "./pages/ClientManagementPage";
import ResourcesPage from "./pages/ResourcesPage";
import GrassrootsPage from "./pages/GrassrootsPage";
import ResortUpkeepPage from "./pages/ResortUpkeepPage";
import EnrichmentsPage from "./pages/EnrichmentsPage";
import GingrIconsPage from "./pages/GingrIconsPage";
import SubscriptionGate from "../shared/SubscriptionGate";
import useSubscription from "../hooks/useSubscription";
import { BrandedErrorBoundary } from "../shared/AppCrashScreen";

// ─── Lite URL Routing ────────────────────────────────────────────────────
// Maps page IDs to URL slugs (root-level: /cherry-hill/home)
const LITE_BASE = "";
const LITE_PAGE_SLUGS = {
  "home": "home",
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
  "ops-belongings": "ops/belongings",
  "ops-collars": "ops/collars",
  "ops-lodging-transfers": "ops/lodging-transfers",
  "ops-pamper": "ops/pamper",
  "ops-svc": "ops/service",
  "ops-weekly-maintenance": "ops/weekly-maintenance",
  "ops-roll-call-opening": "ops/roll-call/opening",
  "ops-roll-call-closing": "ops/roll-call/closing",
  "ops-feeding-meds-am": "ops/feeding-meds/am",
  "ops-feeding-meds-midday": "ops/feeding-meds/midday",
  "ops-feeding-meds-pm": "ops/feeding-meds/pm",
  "ops-feeding-report": "ops/feeding-report",
  "ops-medication-report": "ops/medication-report",
  "role-page": "role-page",
  "role-layout": "role-layout",
  "eod": "eod",
  "attendance": "attendance",
  "mgmt-attendance": "attendance",
  "mgmt-audit-log": "audit-log",
  "reports": "reports",
  "refunds": "refunds",
  "photos": "photos",
  "checkout-notes": "checkout-notes",
  "checkout-tv": "checkout-tv",
  "settings": "settings",
  "gingr-icons": "gingr-icons",
  "inventory": "inventory",
  "inventory-report": "inventory/report",
  "enterprise-directory": "enterprise/directory",
  "enterprise-org-chart": "enterprise/org-chart",
  "enterprise-ops": "enterprise/operations",
  "enterprise-attendance": "enterprise/attendance",
  "enterprise-performance": "enterprise/performance",
  "enterprise-vendors": "enterprise/vendors",
  "enterprise-licenses": "enterprise/licenses",
  "enterprise-locations": "enterprise/locations",
  "enterprise-users": "enterprise/users",
  "test-health": "test-health",
  "occupancy-report": "occupancy-report",
  "cash-tips": "cash-tips",
  "onboarding": "onboarding",
  "pricing": "pricing",
  "training": "labor",
  "client-management": "incidents",
  "scheduling": "scheduling",
  "enrichments": "enrichments",
  "resources": "resources",
  "grassroots": "grassroots",
  "resort-upkeep": "resort-upkeep",
};
const LITE_SLUG_TO_PAGE = {};
Object.entries(LITE_PAGE_SLUGS).forEach(([k, v]) => { if (!LITE_SLUG_TO_PAGE[v]) LITE_SLUG_TO_PAGE[v] = k; });
LITE_SLUG_TO_PAGE.training = "training";
LITE_SLUG_TO_PAGE["client-management"] = "client-management";

const LITE_LABOR_TAB_SLUGS = {
  home: "roster",
  training: "training",
  "performance-reviews": "performance-reviews",
  templates: "templates",
  attendance: "attendance",
  interviews: "interviews",
  notes: "notes",
  "hour-analysis": "capacity-planning",
  "labor-model": "capacity-planning/labor-model",
};
const LITE_LABOR_SLUG_TO_TAB = {
  home: "home",
  roster: "home",
  training: "training",
  "performance-reviews": "performance-reviews",
  templates: "templates",
  attendance: "attendance",
  interviews: "interviews",
  notes: "notes",
  "hour-analysis": "hour-analysis",
  "capacity-planning": "hour-analysis",
  "labor-model": "hour-analysis",
};

function buildLiteUrl(locSlug, pg, prms, dataRef) {
  const slug = LITE_PAGE_SLUGS[pg] || pg;
  // Top-level pages (no location slug)
  if (pg === "onboarding" || pg === "pricing") return `${LITE_BASE}/${slug}`;
  if (locSlug === "enterprise") return `${LITE_BASE}/enterprise/${slug.replace("enterprise/", "")}`;
  if (pg === "training") {
    const laborTab = prms?.laborTab || "";
    const tabSlug = LITE_LABOR_TAB_SLUGS[laborTab] ?? "";
    const laborBase = `${LITE_BASE}/${locSlug}/labor`;
    if (!laborTab || !tabSlug) return laborBase;
    if (laborTab === "interviews") {
      if (prms?.interviewId) return `${laborBase}/interviews/${encodeURIComponent(prms.interviewId)}`;
      if (prms?.interviewView === "config") return `${laborBase}/interviews/config`;
      return `${laborBase}/interviews`;
    }
    if (laborTab === "training" && prms?.trainingRecordId) {
      return `${laborBase}/training/${encodeURIComponent(prms.trainingRecordId)}`;
    }
    if (laborTab === "attendance" && prms?.attendanceView === "summary") return `${laborBase}/attendance/summary`;
    if (laborTab === "hour-analysis" && prms?.capacityPlanningView === "labor-model") return `${laborBase}/capacity-planning/labor-model`;
    return `${laborBase}/${tabSlug}`;
  }
  if (pg === "client-detail" && prms?.clientId && dataRef) {
    // Lite clients: use lc_ ID directly in URL
    if (prms.clientId.startsWith("lc_")) return `${LITE_BASE}/${locSlug}/client/${prms.clientId}`;
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
  // Backward compat: strip old /lite prefix from bookmarks/links
  if (cleanPath.startsWith("/lite")) cleanPath = cleanPath.slice(5) || "/";
  if (LITE_BASE && cleanPath.startsWith(LITE_BASE)) cleanPath = cleanPath.slice(LITE_BASE.length) || "/";
  const parts = cleanPath.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  if (parts.length === 0) return { locSlug: "cherry-hill", page: "home", params: {} };
  // Top-level pages (no location slug): /lite/onboarding, /lite/pricing
  if (parts[0] === "onboarding") return { locSlug: null, page: "onboarding", params: {} };
  if (parts[0] === "pricing") return { locSlug: null, page: "pricing", params: {} };
  const locSlug = parts[0];
  if (locSlug === "enterprise") {
    const epSlug = parts.slice(1).join("/") || "operations";
    const pg = LITE_SLUG_TO_PAGE["enterprise/" + epSlug] || LITE_SLUG_TO_PAGE[epSlug] || "enterprise-ops";
    return { locSlug: "enterprise", page: pg, params: {} };
  }
  if (parts.length === 1) return { locSlug, page: "home", params: {} };
  // Client detail: /{loc}/client/{phone_or_lc_id}
  if (parts[1] === "client" && parts[2]) {
    // Lite client by ID: /client/lc_{uuid}
    if (parts[2].startsWith("lc_")) {
      const lcId = parts[2];
      if (dataRef) {
        const c = (dataRef.clients || []).find(cl => cl.id === lcId);
        if (c) return { locSlug, page: "client-detail", params: { clientId: c.id } };
      }
      return { locSlug, page: "client-detail", params: { clientId: lcId } };
    }
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
  if (parts[1] === "labor") {
    const tabSlug = parts[2] || "home";
    const laborTab = LITE_LABOR_SLUG_TO_TAB[tabSlug] || "home";
    const params = { laborTab };
    if (laborTab === "interviews") {
      if (parts[3] === "config") {
        params.interviewView = "config";
      } else if (parts[3]) {
        params.interviewView = "records";
        params.interviewId = decodeURIComponent(parts[3]);
      } else {
        params.interviewView = "records";
      }
    }
    if (laborTab === "training" && parts[3]) {
      params.trainingRecordId = decodeURIComponent(parts[3]);
    }
    if (laborTab === "attendance" && parts[3] === "summary") {
      params.attendanceView = "summary";
    }
    if (laborTab === "hour-analysis") {
      params.capacityPlanningView = parts[3] === "labor-model" || tabSlug === "labor-model" ? "labor-model" : "staffing-capacity";
    }
    return { locSlug, page: "training", params };
  }
  const pgSlug = parts.slice(1).join("/");
  const pg = LITE_SLUG_TO_PAGE[pgSlug] || "home";
  return { locSlug, page: pg, params: {} };
}

// ─── Navigation Config ───────────────────────────────────────────────────
// Role-aware navigation aligned to mobile product model.
// Home is the universal landing; My Work is the staff execution surface;
// the deprecated analytics mode preserves the old dashboard.
// Staff roles: Home, My Work, Inventory, Photos, TV, Settings
// Manager roles: Home, My Work, Inventory, Cash Tips, Photos, Settings
// Admin/owner roles: Home, Inventory, Cash Tips, Photos, Settings

const STAFF_NAV_ITEMS = [
  { id: "home", label: "Home", icon: "Home" },
  { id: "role-page", label: "My Work", icon: "Clipboard" },
  { id: "enrichments", label: "Enrichments", icon: "Sparkle" },
  { id: "inventory", label: "Inventory", icon: "Package" },
  { id: "photos", label: "Photos", icon: "Image" },
  { id: "checkout-tv", label: "TV", icon: "Monitor" },
  { id: "settings", label: "Settings", icon: "Settings" },
];

const MANAGER_NAV_ITEMS = [
  { id: "home", label: "Home", icon: "Home" },
  { id: "role-page", label: "My Work", icon: "Clipboard" },
  { id: "scheduling", label: "Scheduling", icon: "Calendar" },
  { id: "enrichments", label: "Enrichments", icon: "Sparkle" },
  { id: "training", label: "Labor", icon: "GraduationCap" },
  { id: "client-management", label: "Incidents", icon: "AlertTriangle" },
  { id: "resources", label: "Resources", icon: "Book" },
  { id: "grassroots", label: "Grassroots", icon: "TrendingUp" },
  { id: "resort-upkeep", label: "Resort Upkeep", icon: "ClipboardCheck" },
  { id: "inventory", label: "Inventory", icon: "Package" },
  { id: "cash-tips", label: "Cash Tips", icon: "DollarSign" },
  { id: "photos", label: "Photos", icon: "Image" },
  { id: "gingr-icons", label: "Gingr Icons", icon: "Layers" },
  { id: "settings", label: "Settings", icon: "Settings" },
];

const LEAN_NAV_ITEMS = [
  { id: "home", label: "Home", icon: "Home" },
  { id: "scheduling", label: "Scheduling", icon: "Calendar" },
  { id: "enrichments", label: "Enrichments", icon: "Sparkle" },
  { id: "training", label: "Labor", icon: "GraduationCap" },
  { id: "client-management", label: "Incidents", icon: "AlertTriangle" },
  { id: "resources", label: "Resources", icon: "Book" },
  { id: "grassroots", label: "Grassroots", icon: "TrendingUp" },
  { id: "resort-upkeep", label: "Resort Upkeep", icon: "ClipboardCheck" },
  { id: "inventory", label: "Inventory", icon: "Package" },
  { id: "cash-tips", label: "Cash Tips", icon: "DollarSign" },
  { id: "photos", label: "Photos", icon: "Image" },
  { id: "checkout-tv", label: "TV", icon: "Monitor" },
  { id: "gingr-icons", label: "Gingr Icons", icon: "Layers" },
  { id: "settings", label: "Settings", icon: "Settings" },
];

// Full nav when ?mode=analytics is active (K9 Operations + Analytics)
const ANALYTICS_NAV_ITEMS = [
  { id: "home", label: "Home", icon: "Home" },
  { id: "dashboard", label: "Dashboard", icon: "Dashboard" },
  { id: "lifecycle", label: "Customer Lifecycle", icon: "Users" },
  { id: "ops-hub", label: "Ops Overview", icon: "Dashboard" },
  { id: "scheduling", label: "Scheduling", icon: "Calendar" },
  { id: "enrichments", label: "Enrichments", icon: "Sparkle" },
  { id: "training", label: "Labor", icon: "GraduationCap" },
  { id: "client-management", label: "Incidents", icon: "AlertTriangle" },
  { id: "resources", label: "Resources", icon: "Book" },
  { id: "grassroots", label: "Grassroots", icon: "TrendingUp" },
  { id: "resort-upkeep", label: "Resort Upkeep", icon: "ClipboardCheck" },
  { id: "inventory", label: "Inventory", icon: "Package" },
  { id: "cash-tips", label: "Cash Tips", icon: "DollarSign" },
  { id: "photos", label: "Photos", icon: "Image" },
  { id: "checkout-tv", label: "TV", icon: "Monitor" },
  { id: "gingr-icons", label: "Gingr Icons", icon: "Layers" },
  { id: "settings", label: "Settings", icon: "Settings" },
];

// Detect analytics mode from URL query param
const IS_ANALYTICS_MODE = new URLSearchParams(window.location.search).get("mode") === "analytics";
// Payment enforcement is paused during invite-led rollout. Flip this back on
// when Stripe subscription gating is ready for production use.
const ENABLE_SUBSCRIPTION_GATE = false;

const LEAN_ENTERPRISE_NAV_ITEMS = [
  { id: "enterprise-ops", label: "Volume", icon: "BarChart" },
  { id: "enterprise-attendance", label: "Attendance", icon: "Calendar" },
  { id: "enterprise-performance", label: "Performance", icon: "ClipboardCheck" },
  { id: "enterprise-vendors", label: "Vendors", icon: "Settings" },
  { id: "enterprise-licenses", label: "Licenses", icon: "FileText" },
  { id: "enterprise-locations", label: "Locations", icon: "Home" },
  { id: "enterprise-users", label: "User Management", icon: "Users" },
  { id: "enterprise-directory", label: "Company Directory", icon: "Layers" },
];

const PAGE_PERMISSION_MAP = {
  "dashboard": null,
  "lifecycle": "Customer Lifecycle",
  "client-detail": "Customer Lifecycle",
  "dog-detail": null,
  "checkout-notes": null,
  "ops-hub": "Operations Hub",
  "daily-ops": "Operations Hub",
  "ops-opening": "Operations Hub",
  "ops-fe": "Operations Hub",
  "ops-be": "Operations Hub",
  "ops-rooms": "Operations Hub",
  "ops-pictures": "Operations Hub",
  "ops-pp": "Operations Hub",
  "ops-closing": "Operations Hub",
  "ops-bathing": "Operations Hub",
  "ops-belongings": "Operations Hub",
  "ops-collars": "Operations Hub",
  "ops-lodging-transfers": "Operations Hub",
  "ops-pamper": "Operations Hub",
  "ops-svc": "Operations Hub",
  "ops-weekly-maintenance": "Operations Hub",
  "ops-roll-call-opening": "Operations Hub",
  "ops-roll-call-closing": "Operations Hub",
  "role-page": "My Work",
  "role-layout": "Checklist Templates",
  "eod": "EOD Reports",
  "attendance": "Attendance Tracker",
  "mgmt-attendance": "Attendance Tracker",
  "mgmt-audit-log": "User Management",
  "reports": null,
  "photos": "Photos Module",
  "settings": null,
  "gingr-icons": "Gingr Integration",
  "client-management": "Customer Lifecycle",
  "enrichments": null,
  "resources": null,
  "grassroots": "Grassroots Access",
  "resort-upkeep": "Resort Upkeep Access",
  "inventory": "Inventory Management",
  "inventory-report": "Inventory Management",
  "occupancy-report": "Occupancy Reports",
  "scheduling": "Operations Hub",
  "cash-tips": "Financial Reporting",
  "test-health": null,
  "checkout-tv": "Checkout TV Access",
  "enterprise-directory": null,
  "enterprise-org-chart": null,
  "enterprise-ops": "Enterprise View",
  "enterprise-attendance": "Enterprise View",
  "enterprise-performance": "Enterprise View",
  "enterprise-vendors": "Enterprise View",
  "enterprise-licenses": "Enterprise View",
  "enterprise-locations": "Enterprise View",
  "enterprise-users": "Enterprise View",
};

const LABOR_TAB_PERMISSION_MAP = {
  home: "Labor Roster",
  training: "Labor Roster",
  "performance-reviews": "Labor Performance Reviews",
  templates: "Labor Templates",
  attendance: "Labor Attendance",
  interviews: "Labor Interviews",
  notes: "Labor Employee Notes",
  "hour-analysis": "Labor Roster",
};

const PAGE_OWNED_DATA_PAGES = new Set([
  "home",
  "training",
  "grassroots",
  "resort-upkeep",
  "resources",
  "settings",
  "gingr-icons",
  "role-layout",
  "enterprise-directory",
  "enterprise-org-chart",
  "enterprise-ops",
  "enterprise-attendance",
  "enterprise-users",
  "test-health",
  "onboarding",
  "pricing",
]);

function getPagePermissionRequirements(page, params = {}) {
  if (page === "training") {
    const laborTab = params?.laborTab || "home";
    return ["Labor Management", LABOR_TAB_PERMISSION_MAP[laborTab] || "Labor Roster"];
  }
  const required = PAGE_PERMISSION_MAP[page];
  return required ? [required] : [];
}

function canAccessLitePage(profile, page, params = {}) {
  if (page === "enterprise-directory" || page === "enterprise-org-chart") return true;
  if (page === "training" && !params?.laborTab) {
    return hasEveryLeanPermission(profile, ["Labor Management"])
      && hasAnyLeanPermission(profile, Object.values(LABOR_TAB_PERMISSION_MAP));
  }
  return hasEveryLeanPermission(profile, getPagePermissionRequirements(page, params));
}

// Location list — loaded dynamically from Supabase in production.
// Cherry Hill is the seed location; additional locations are added by the onboarding flow.
const STATIC_LOCATIONS = [
  { id: "enterprise", name: "Enterprise", slug: "enterprise", isEnterprise: true },
  { id: "demo-analytics", name: "K9 Operations + Analytics", slug: "analytics-demo", isDemoLink: true, demoUrl: "/cherry-hill/dashboard?mode=analytics" },
  { id: "demo-pos", name: "K9 Operations POS", slug: "pos-demo", isDemoLink: true, demoUrl: "/pos/demo/dashboard" },
];

function formatSyncRemaining(status) {
  const percent = Number(status?.percent || 0);
  const startedAt = status?.started_at ? new Date(status.started_at).getTime() : 0;
  if (!startedAt || percent <= 0 || percent >= 100) return "Estimating";
  const elapsedMs = Date.now() - startedAt;
  const remainingMs = Math.max(0, (elapsedMs / percent) * (100 - percent));
  const remainingMinutes = Math.ceil(remainingMs / 60000);
  if (remainingMinutes < 60) return `${remainingMinutes}m remaining`;
  const hours = Math.floor(remainingMinutes / 60);
  const minutes = remainingMinutes % 60;
  return minutes ? `${hours}h ${minutes}m remaining` : `${hours}h remaining`;
}

function InitialGingrSyncDock({ locationId }) {
  const [status, setStatus] = useState(null);

  const loadStatus = useCallback(async () => {
    if (!locationId || locationId === "enterprise") {
      setStatus(null);
      return;
    }
    const { data, error } = await supabase
      .from("v_gingr_initial_sync_status")
      .select("*")
      .eq("location_id", locationId)
      .limit(1);
    if (error) {
      setStatus(null);
      return;
    }
    const next = data?.[0] || null;
    setStatus(next && next.status !== "complete" ? next : null);
  }, [locationId]);

  useEffect(() => {
    loadStatus();
    const timer = window.setInterval(loadStatus, 12000);
    return () => window.clearInterval(timer);
  }, [loadStatus]);

  if (!status) return null;
  const percent = Math.max(0, Math.min(100, Number(status.percent || 0)));
  const isFailed = status.status === "failed";
  return (
    <div style={{
      position: "fixed",
      left: "50%",
      bottom: 18,
      transform: "translateX(-50%)",
      zIndex: 9800,
      width: "min(560px, calc(100vw - 32px))",
      borderRadius: 12,
      border: `1px solid ${isFailed ? "#EF444466" : `${C.pri}33`}`,
      background: "rgba(255,255,255,0.96)",
      boxShadow: "0 18px 44px rgba(15,23,42,0.18)",
      padding: "12px 14px",
      backdropFilter: "blur(12px)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start", marginBottom: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 900, color: isFailed ? "#991B1B" : C.text, letterSpacing: 0 }}>
            GINGR initial sync {isFailed ? "needs attention" : "running"}
          </div>
          <div style={{ fontSize: 11, color: C.textSec, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>
            {status.error_message || status.last_message || status.current_label || status.current_entity || "Pulling historical GINGR data"}
          </div>
        </div>
        <div style={{ fontSize: 11, fontWeight: 900, color: isFailed ? "#991B1B" : C.pri, whiteSpace: "nowrap" }}>
          {percent.toFixed(1)}% | {formatSyncRemaining(status)}
        </div>
      </div>
      <div style={{ height: 7, borderRadius: 999, background: isFailed ? "#FEE2E2" : `${C.pri}14`, overflow: "hidden" }}>
        <div style={{ width: `${percent}%`, height: "100%", background: isFailed ? "#EF4444" : C.pri, transition: "width 0.25s ease" }} />
      </div>
    </div>
  );
}

// ─── Main App Component ───────────────────────────────────────────────────
function LeanAppInner() {
  const { user, profile: authProfile } = useAuth();
  const { subscription, loading: subLoading, isActive: subIsActive, isPastDue: subIsPastDue } = useSubscription(user?.id, ENABLE_SUBSCRIPTION_GATE);

  // Parse URL on initial load to determine starting page and location
  const initialParsed = useMemo(() => {
    const path = window.location.pathname;
    if (path.startsWith(LITE_BASE)) return parseLiteUrl(path, null);
    return { locSlug: null, page: "home", params: {} };
  }, []);

  // Resolve initial location from URL slug or auth profile
  const initialLocation = useMemo(() => {
    if (initialParsed.locSlug) {
      const match = STATIC_LOCATIONS.find(l => l.slug === initialParsed.locSlug);
      if (match) return match.id;
    }
    // For non-static locations, use auth profile (DB locations load async)
    return authProfile?.location_id || null;
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
  const [, setPermissionVersion] = useState(0);

  const refreshPermissionMatrix = useCallback(async () => {
    const { data: rows, error } = await supabase
      .from("lite_permissions")
      .select("role_id,permission_key,granted");
    if (error) {
      console.warn("[K9 Lite] Permission override load failed:", error.message || error);
      return;
    }
    applyLeanPermissionOverrides(rows || []);
    setPermissionVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    if (!authProfile?.id && !authProfile?.user_id) return;
    refreshPermissionMatrix();
  }, [authProfile?.id, authProfile?.user_id, refreshPermissionMatrix]);

  useEffect(() => {
    const handler = () => {
      setPermissionVersion((version) => version + 1);
    };
    window.addEventListener("k9-lite-permissions-updated", handler);
    return () => window.removeEventListener("k9-lite-permissions-updated", handler);
  }, []);

  // ── Dynamic location list from Supabase ────────────────────────────────
  const [dbLocations, setDbLocations] = useState([]);
  useEffect(() => {
    supabase
      .from("locations")
      .select("id, name, slug")
      .then(({ data: rows }) => {
        if (rows && rows.length > 0) setDbLocations(rows);
      });
  }, []);
  const allLocations = useMemo(() => {
    const base = STATIC_LOCATIONS.filter(l => l.isEnterprise || l.isPOS || l.isDemoLink);
    const dbMapped = dbLocations.map(l => ({ id: l.id, name: l.name, slug: l.slug }));
    return [...base, ...dbMapped];
  }, [dbLocations]);

  // Resolve URL slug to DB location once locations load
  useEffect(() => {
    if (initialParsed.locSlug && dbLocations.length > 0 && !currentLocation) {
      const match = dbLocations.find(l => l.slug === initialParsed.locSlug);
      if (match) setCurrentLocation(match.id);
    }
  }, [dbLocations, initialParsed.locSlug, currentLocation]);

  // Sync currentLocation with auth profile when it loads
  useEffect(() => {
    if (currentLocation === "enterprise") return;
    if (authProfile?.location_id && authProfile.location_id !== currentLocation) {
      setCurrentLocation(authProfile.location_id);
    }
  }, [authProfile?.location_id, currentLocation]);

  // Dashboard refresh settings (interval + business hours) from Supabase
  const { refreshIntervalMs, isWithinBusinessHours } = useRefreshSettings(currentLocation);
  const shouldLoadGlobalData = !PAGE_OWNED_DATA_PAGES.has(page);
  const refreshOptions = useMemo(
    () => ({ refreshIntervalMs, isWithinBusinessHours, enabled: shouldLoadGlobalData }),
    [refreshIntervalMs, isWithinBusinessHours, shouldLoadGlobalData]
  );

  // Canonical facility presence — server-owned sync, browser reads Supabase only.
  const bohEnabled = page === "home" || page === "dashboard";
  const facilityPresence = useFacilityPresence(currentLocation, { enabled: bohEnabled, pollMs: 5000 });
  const bohStats = useMemo(() => ({
    total: facilityPresence.counts.inHouse,
    boardingCount: facilityPresence.counts.boarding,
    daycareCount: facilityPresence.counts.daycare,
    expectedCount: facilityPresence.counts.inHouse + facilityPresence.counts.pendingArrivals,
    pendingCount: facilityPresence.counts.pendingArrivals,
    pendingDaycare: null,
    pendingBoarding: null,
    goingHomeCount: facilityPresence.counts.goingHome,
    occupancyPct: facilityPresence.counts.occupancyPct,
    fetchCount: facilityPresence.latestSync?.id ? 1 : 0,
    canonicalPresence: facilityPresence.available,
  }), [facilityPresence.available, facilityPresence.counts, facilityPresence.latestSync?.id]);
  const bohLastFetch = facilityPresence.latestSync?.completed_at || facilityPresence.latestSync?.started_at || facilityPresence.lastFetchedAt;

  // Gingr data from Supabase (clients, dogs, reservations, rooms, etc.)
  const mockData = useGingrData(currentLocation, refreshOptions);

  // Live Supabase data for ops & audit (layered on top of mock data)
  const [liveDailyOps, setLiveDailyOps] = useState([]);
  const [liveAuditLog, setLiveAuditLog] = useState([]);
  const [liveEodEntries, setLiveEodEntries] = useState([]);
  const [liveResortPolicies, setLiveResortPolicies] = useState(null);

  // Realtime subscription for cross-device sync
  const { markLocalWrite } = useRealtimeOps(currentLocation, setLiveDailyOps, { enabled: shouldLoadGlobalData });

  // Load persisted resort policies (retention thresholds) from lite_settings
  useEffect(() => {
    if (!shouldLoadGlobalData || !currentLocation) return;
    supabase.from("lite_settings").select("setting_value").eq("location_id", currentLocation).eq("setting_key", "resort_policies").then(({ data: rows }) => {
      if (rows && rows.length > 0 && rows[0].setting_value) setLiveResortPolicies(rows[0].setting_value);
    });
  }, [currentLocation, shouldLoadGlobalData]);

  // Merged data object — mock + live Supabase
  const data = useMemo(() => ({
    ...mockData,
    dailyOps: liveDailyOps.length > 0 ? liveDailyOps : mockData.dailyOps,
    auditLog: liveAuditLog,
    eodEntries: liveEodEntries,
    ...(liveResortPolicies ? { resortPolicies: { ...mockData.resortPolicies, ...liveResortPolicies } } : {}),
  }), [mockData, liveDailyOps, liveAuditLog, liveEodEntries, liveResortPolicies]);

  const profile = useMemo(() => {
    const fullName = authProfile?.full_name || user?.user_metadata?.full_name || "Demo User";
    return {
      id: authProfile?.id || user?.id || "mock-user",
      user_id: authProfile?.user_id || user?.id || null,
      lite_profile_id: authProfile?.lite_profile_id || null,
      role: authProfile?.role || "pct",
      email: authProfile?.email || user?.email || "user@example.com",
      full_name: fullName,
      name: fullName,
      location_id: authProfile?.location_id || currentLocation || null,
    };
  }, [
    authProfile?.email,
    authProfile?.full_name,
    authProfile?.id,
    authProfile?.lite_profile_id,
    authProfile?.location_id,
    authProfile?.role,
    authProfile?.user_id,
    currentLocation,
    user?.email,
    user?.id,
    user?.user_metadata?.full_name,
  ]);

  // Fetch user's location roles for role-based filtering.
  // Production schema: profile_locations links users → locations (no role_id),
  // and location_roles defines role codes per location (no user_id).
  // We query profile_locations to discover the user's locations, then load
  // the location_roles definitions for those locations.
  const [userLocationRoles, setUserLocationRoles] = useState([]);
  useEffect(() => {
    if (!user?.id) return;
    supabase.from("profile_locations").select("profile_id, location_id").eq("profile_id", user.id)
      .then(({ data: plRows }) => {
        if (!plRows || plRows.length === 0) return;
        const locIds = [...new Set(plRows.map(r => r.location_id))];
        supabase.from("location_roles").select("*").in("location_id", locIds)
          .then(({ data: roles }) => { if (roles) setUserLocationRoles(roles); });
      });
  }, [user?.id]);

  // ── Role-based default landing ───────────────────────────────────────────
  // All roles land on the new role-aware Home page.
  // The Home component itself renders different content per role tier.
  const roleLandingApplied = useRef(false);
  useEffect(() => {
    if (roleLandingApplied.current) return;
    roleLandingApplied.current = true;
  }, [userLocationRoles, currentLocation, page]);

  // Compute accessible location IDs (null = all)
  const userLocationIds = useMemo(
    () => getUserLocationIds(profile, userLocationRoles),
    [profile.role, profile.location_id, userLocationRoles]
  );

  // Filter K9_LOCATIONS to only locations the user can access
  const filteredLocations = useMemo(() => {
    // null means "all locations" (enterprise_admin, developer, owner)
    if (userLocationIds === null) return allLocations;
    return allLocations.filter(loc => {
      // Directory and org chart are universal authenticated Enterprise surfaces.
      if (loc.isEnterprise) return true;
      // Demo/POS launchers are internal shortcuts, not part of normal staff location access.
      if (loc.isPOS || loc.isDemoLink) {
        return profile.role === "owner" || profile.role === "developer" || profile.role === "enterprise_admin";
      }
      // Filter regular locations by user's assigned location_ids
      return userLocationIds.includes(loc.id);
    });
  }, [userLocationIds, profile.role, allLocations]);

  // Load ops data from Supabase on mount & location change
  useEffect(() => {
    if (!shouldLoadGlobalData || !currentLocation) return;
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
            computed_items: r.computed_items || null,
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
  }, [currentLocation, shouldLoadGlobalData]);

  // Save function — persists dailyOps and auditLog to Supabase
  const save = useCallback(async (newData) => {
    try {
      // Mark local write so realtime subscription skips our own echo
      markLocalWrite();
      // Save dailyOps changes
      if (newData.dailyOps) {
        const opsRows = newData.dailyOps.map(d => ({
          id: d.id,
          location_id: currentLocation,
          type: d.type === 'checklist' || ['opening','closing','fe_checklist','be_checklist'].includes(d.typeSub || d.type) ? 'checklist' : (d.typeSub || d.type),
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
        const liteChanged = [];
        newData.clients.forEach(c => {
          const old = mockData.clients.find(o => o.id === c.id);
          if (c.lifecycle && JSON.stringify(c.lifecycle) !== JSON.stringify(old?.lifecycle)) {
            if (c.isLiteClient && c.liteClientId) {
              liteChanged.push({ id: c.liteClientId, lifecycle_data: c.lifecycle });
            } else if (c.gingrId) {
              changed.push({ location_id: currentLocation, gingr_id: String(c.gingrId), lifecycle_data: c.lifecycle, updated_at: new Date().toISOString() });
            }
          }
        });
        if (changed.length > 0) {
          const { error } = await supabase.from("lite_client_lifecycle").upsert(changed, { onConflict: "location_id,gingr_id" });
          if (error) console.log("[K9 Lite] Lifecycle save error:", error.message);
        }
        // Persist lite client lifecycle changes to lite_clients table
        for (const lc of liteChanged) {
          const { error } = await supabase.from("lite_clients").update({ lifecycle_data: lc.lifecycle_data }).eq("id", lc.id);
          if (error) console.log("[K9 Lite] Lite client lifecycle save error:", error.message);
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
    const loc = allLocations.find(l => l.id === currentLocation);
    return loc?.slug || "cherry-hill";
  }, [allLocations, currentLocation]);
  const currentLocationName = useMemo(() => {
    const loc = allLocations.find(l => l.id === currentLocation);
    return loc?.name || "K9 Operations";
  }, [allLocations, currentLocation]);

  // Sync URL when page/params change
  const initialUrlSet = useRef(false);
  useEffect(() => {
    if (skipUrlPush.current) { skipUrlPush.current = false; return; }
    const url = buildLiteUrl(locSlug, page, params, data);
    if (window.location.pathname !== url) {
      // Use replaceState for the initial redirect (e.g., / → /cherry-hill/home)
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
          const locMatch = allLocations.find(l => l.id === e.state.loc);
          if (locMatch) setCurrentLocation(locMatch.id);
        }
      } else {
        const parsed = parseLiteUrl(window.location.pathname, data);
        newPage = parsed.page;
        newParams = parsed.params;
        const locMatch = allLocations.find(l => l.slug === parsed.locSlug);
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
  const TOP_LEVEL_PAGES = useMemo(() => new Set(["home", "dashboard", "role-page", "lifecycle", "funnel", "ops-hub", "reports", "inventory", "cash-tips", "photos", "settings", "gingr-icons", "training", "client-management", "enrichments", "resources", "grassroots", "resort-upkeep", "enterprise-directory", "enterprise-org-chart", "enterprise-ops", "enterprise-attendance", "enterprise-performance", "enterprise-vendors", "enterprise-licenses", "enterprise-locations", "enterprise-users"]), []);
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
      case "home": return "Home";
      case "dashboard": return "Dashboard";
      case "lifecycle": return "Customer Lifecycle";
      case "client-management": return "Incidents";
      case "enrichments": return "Enrichments";
      case "resources": return "Resources";
      case "grassroots": return "Grassroots Tracking";
      case "resort-upkeep": return "Resort Upkeep";
      case "funnel": return "Lead Funnel";
      case "ops-hub": return "Ops Overview";
      case "ops-opening": return "Opening Checklist";
      case "ops-fe": return "FE Checklist";
      case "ops-be": return "BE Checklist";
      case "ops-rooms": return "Room Cleaning & Setups";
      case "ops-pictures": return "Pictures";
      case "ops-pp": return "Private Play";
      case "ops-closing": return "Closing Checklist";
      case "ops-bathing": return "Bathing Report";
      case "ops-belongings": return "Belongings";
      case "ops-collars": return "Next Day Collars";
      case "ops-lodging-transfers": return "Lodging Transfers";
      case "ops-pamper": return "Pamper Package Plus";
      case "ops-svc": return params?.svcName || "Service Report";
      case "ops-feeding-meds-am": return "AM Feeding and Meds";
      case "ops-feeding-meds-midday": return "Midday Feeding and Meds";
      case "ops-feeding-meds-pm": return "PM Feeding and Meds";
      case "ops-feeding-report": return "Feeding Report";
      case "ops-medication-report": return "Medication Report";
      case "ops-weekly-maintenance": return "Weekly Maintenance";
      case "ops-roll-call-opening": return "Opening Roll Call";
      case "ops-roll-call-closing": return "Closing Roll Call";
      case "role-page": return "My Work";
      case "eod": return "End of Day";
      case "daily-ops": return "Daily Ops";
      case "attendance": case "mgmt-attendance": return "Attendance";
      case "mgmt-audit-log": return "Audit Log";
      case "client-detail": {
        const c = (mockData?.clients||[]).find(cl => cl.id === prms?.clientId);
        return c ? `${c.fields?.first_name||""} ${c.fields?.last_name||""}`.trim() || "Client" : "Client";
      }
      case "new-client": return "New Client";
      case "refunds": return "Refunds";
      case "photos": return "Photos";
      case "settings": return "Settings";
      case "gingr-icons": return "Gingr Icons";
      case "enterprise-directory": return "Company Directory";
      case "enterprise-org-chart": return "Org Chart";
      case "enterprise-ops": return "Volume";
      case "enterprise-attendance": return "Attendance";
      case "enterprise-performance": return "Performance";
      case "enterprise-vendors": return "Vendors";
      case "enterprise-licenses": return "Licenses";
      case "enterprise-locations": return "Locations";
      case "enterprise-users": return "User Management";
      case "training": return "Labor";
      case "scheduling": return "Scheduling";
      case "inventory": return "Inventory";
      case "inventory-report": return "Inventory Reports";
      case "checkout-notes": return "Today's Notes";
      case "cash-tips": return "Cash Tips";
      case "test-health": return "Test Health";
      default: return pg;
    }
  }, [mockData]);

  // Toast notification system
  const [toasts, setToasts] = useState([]);
  const addGlobalToast = useCallback((msgOrObj, type = "info") => {
    const id = Date.now() + Math.random();
    // Support both string and object forms: addGlobalToast("msg") or addGlobalToast({ message, type, actionLabel, onAction })
    const isObj = typeof msgOrObj === "object" && msgOrObj !== null && !React.isValidElement(msgOrObj);
    const msg = isObj ? (msgOrObj.message || "") : msgOrObj;
    const resolvedType = isObj ? (msgOrObj.type || type) : type;
    const actionLabel = isObj ? msgOrObj.actionLabel : null;
    const onAction = isObj ? msgOrObj.onAction : null;
    setToasts(prev => [...prev, { id, msg, type: resolvedType, actionLabel, onAction }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), actionLabel ? 7000 : 5500);
  }, []);

  // Load fonts
  useEffect(() => {
    if (!document.getElementById("k9-lite-fonts")) {
      const style = document.createElement("style");
      style.id = "k9-lite-fonts";
      style.textContent = `
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        *{scrollbar-width:none;-ms-overflow-style:none;}
        *::-webkit-scrollbar{width:0;height:0;}
        input:focus,select:focus,textarea:focus{border-color:${C.pri}!important;box-shadow:0 0 0 3px rgba(20,83,45,0.08);}
        h1,h2,h3,h4,h5,h6,.brand-headline{font-family:'Outfit', sans-serif !important;font-weight:700;}
        body { margin: 0; padding: 0; font-family: 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif; }
        @keyframes k9-toast-in { from { opacity: 0; transform: translateY(-12px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes k9-toast-progress { from { width: 0%; } to { width: 100%; } }
        @keyframes k9-toast-glow-fade { 0%,85% { opacity: 1; } 100% { opacity: 0; } }
      `;
      document.head.appendChild(style);
    }
  }, []);

  // Handle location change
  const handleLocationChange = useCallback((locId) => {
    // Demo links open in new tab to preserve current session
    const loc = allLocations.find(l => l.id === locId);
    if (loc?.isDemoLink) {
      window.open(loc.demoUrl, "_blank");
      return;
    }
    if (loc?.isPOS) {
      window.location.href = "/pos/" + (loc.slug || "demo");
      return;
    }
    setCurrentLocation(locId);
    // Navigate to appropriate default page when switching location type
    const isEnterprise = locId === "enterprise";
    const wasEnterprise = currentLocation === "enterprise";
    if (isEnterprise && !wasEnterprise) {
      setPage("enterprise-ops");
      setParams({});
      setNavStack([{ page: "enterprise-ops", params: {} }]);
    } else if (!isEnterprise && wasEnterprise) {
      setPage("home");
      setParams({});
      setNavStack([{ page: "home", params: {} }]);
    }
    try { localStorage.setItem("k9_lite_location", locId); } catch {}
  }, [allLocations, currentLocation]);

  // Fetch team accounts for quick-switch
  useEffect(() => {
    if (!profile?.id) return;
    supabase.from("lite_profiles").select("id,user_id,full_name,email,role").eq("location_id", currentLocation).eq("is_active", true)
      .then(({ data: members }) => { if (members) setTeamAccounts(members.filter(m => m.user_id !== profile.user_id)); });
  }, [currentLocation, profile?.id, profile?.user_id]);

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
    if (!canAccessLitePage(profile, page, params)) {
      return <div style={{ padding: 40, textAlign: "center", color: C.dan }}><h2 style={{ margin: 0, color: C.dan }}>Access Denied</h2><p style={{ marginTop: 12, color: C.textSec }}>You don't have permission to access this area.</p></div>;
    }

    switch (page) {
      case "home":
        return <HomePage data={data} save={save} nav={nav} profile={profile} addGlobalToast={addGlobalToast} bohStats={bohStats} analyticsMode={IS_ANALYTICS_MODE} userLocationRoles={userLocationRoles} currentLocation={currentLocation} />;
      case "dashboard": {
        const analyticsMode = IS_ANALYTICS_MODE;
        const hasFinancial = analyticsMode || hasLeanPermission(profile, "Financial Reporting");
        const hasOpsHub = analyticsMode || hasLeanPermission(profile, "Operations Hub");
        const dashboardPermissions = {
          showSnapshot: true,
          showRevenue: hasFinancial,
          showFunnel: hasFinancial,
          showLTV: hasFinancial,
          showRevenueComposition: hasFinancial,
          showRevenueByCategory: hasFinancial,
          showDiscountAnalysis: hasFinancial,
          showTopClients: hasFinancial,
          showOps: hasOpsHub,
          showFunnelMetrics: hasFinancial,
          showHeroKPIs: hasFinancial,
        };
        return <DashboardPage data={data} save={save} nav={nav} profile={profile} addGlobalToast={addGlobalToast} locationId={currentLocation} refreshOptions={refreshOptions} bohStats={bohStats} bohLastFetch={bohLastFetch} analyticsMode={analyticsMode} {...dashboardPermissions} />;
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
        return <DailyOpsPage data={data} save={save} sub="fe_checklist" nav={nav} profile={profile} addGlobalToast={addGlobalToast} />;
      case "ops-be":
        return <DailyOpsPage data={data} save={save} sub="be_checklist" nav={nav} profile={profile} addGlobalToast={addGlobalToast} />;
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
      case "ops-belongings":
        return <DailyOpsPage data={data} save={save} sub="belongings" nav={nav} profile={profile} addGlobalToast={addGlobalToast} />;
      case "ops-collars":
        return <DailyOpsPage data={data} save={save} sub="collars" nav={nav} profile={profile} addGlobalToast={addGlobalToast} />;
      case "ops-lodging-transfers":
        return <DailyOpsPage data={data} save={save} sub="lodging_transfer" nav={nav} profile={profile} addGlobalToast={addGlobalToast} />;
      case "ops-pamper":
        return <DailyOpsPage data={data} save={save} sub="pamper" nav={nav} profile={profile} addGlobalToast={addGlobalToast} />;
      case "ops-svc":
        return <DailyOpsPage data={data} save={save} sub="svc" nav={nav} profile={profile} addGlobalToast={addGlobalToast} params={params} />;
      case "ops-feeding-meds-am":
        return <CareReportsPage kind="feeding-meds" initialSession="am" nav={nav} profile={profile} currentLocation={currentLocation} />;
      case "ops-feeding-meds-midday":
        return <CareReportsPage kind="feeding-meds" initialSession="midday" nav={nav} profile={profile} currentLocation={currentLocation} />;
      case "ops-feeding-meds-pm":
        return <CareReportsPage kind="feeding-meds" initialSession="pm" nav={nav} profile={profile} currentLocation={currentLocation} />;
      case "ops-feeding-report":
        return <CareReportsPage kind="feeding-report" initialSession="am" nav={nav} profile={profile} currentLocation={currentLocation} />;
      case "ops-medication-report":
        return <CareReportsPage kind="feeding-meds" initialSession="am" initialTaskMode="meds" nav={nav} profile={profile} currentLocation={currentLocation} />;
      case "ops-weekly-maintenance":
        return <WeeklyMaintenancePage data={data} save={save} nav={nav} profile={profile} addGlobalToast={addGlobalToast} locationId={currentLocation} />;
      case "ops-roll-call-opening":
        return <RollCallSessionsPage profile={profile} currentLocation={currentLocation} initialSession="opening" />;
      case "ops-roll-call-closing":
        return <RollCallSessionsPage profile={profile} currentLocation={currentLocation} initialSession="closing" />;
      case "role-page":
        return <RolePage data={data} save={save} nav={nav} profile={profile} addGlobalToast={addGlobalToast} userLocationRoles={userLocationRoles} currentLocation={currentLocation} />;
      case "role-layout":
        return <RoleLayoutPage profile={profile} addGlobalToast={addGlobalToast} />;
      case "eod":
        return <LiteEODPage data={data} save={save} nav={nav} profile={profile} addGlobalToast={addGlobalToast} />;
      case "mgmt-audit-log":
        return <AuditLogPage data={data} save={save} nav={nav} profile={profile} />;
      case "mgmt-attendance":
        return <AttendanceTrackerPage data={data} save={save} nav={nav} profile={profile} addGlobalToast={addGlobalToast} />;
      case "attendance":
        return <AttendanceTrackerPage data={data} save={save} nav={nav} profile={profile} addGlobalToast={addGlobalToast} params={params} />;
      case "dog-detail":
        if (params.dogId && !params.clientId) {
          return <DogProfilePage data={data} save={save} nav={nav} profile={profile} addGlobalToast={addGlobalToast} dogId={params.dogId} />;
        }
        return <DogDetailPage data={data} clientId={params.clientId} dogId={params.dogId} nav={nav} />;
      case "checkout-notes":
        return <CheckoutNotesPage data={data} save={save} nav={nav} profile={profile} addGlobalToast={addGlobalToast} />;
      case "checkout-tv":
        return <CheckoutTVPage data={data} nav={nav} profile={profile} locationId={currentLocation} />;
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
        return currentLocation === "enterprise" ? <div style={{ padding: 40, textAlign: "center" }}>Photos not available on Enterprise view</div> : <PhotosPage data={data} nav={nav} profile={profile} />;
      case "enterprise-directory":
        return <CompanyDirectory initialView="people" />;
      case "enterprise-org-chart":
        return <CompanyDirectory initialView="org" />;
      case "enterprise-ops":
        return <EnterpriseOpsMatrix profile={profile} userLocationIds={userLocationIds} addGlobalToast={addGlobalToast} view="volume" />;
      case "enterprise-attendance":
        return <EnterpriseAttendance profile={profile} userLocationIds={userLocationIds} />;
      case "enterprise-performance":
        return <EnterpriseOpsMatrix profile={profile} userLocationIds={userLocationIds} addGlobalToast={addGlobalToast} view="performance" />;
      case "enterprise-vendors":
        return <EnterpriseOpsMatrix profile={profile} userLocationIds={userLocationIds} addGlobalToast={addGlobalToast} view="vendors" />;
      case "enterprise-licenses":
        return <EnterpriseOpsMatrix profile={profile} userLocationIds={userLocationIds} addGlobalToast={addGlobalToast} view="licenses" />;
      case "enterprise-locations":
        return <EnterpriseLocations profile={profile} userLocationIds={userLocationIds} addGlobalToast={addGlobalToast} />;
      case "enterprise-users":
        return <EnterpriseUserManagement profile={profile} userLocationIds={userLocationIds} addGlobalToast={addGlobalToast} />;
      case "training":
        return <TrainingPage data={data} save={save} nav={nav} profile={profile} addGlobalToast={addGlobalToast} locationName={currentLocationName} params={params} />;
      case "client-management":
        return <ClientManagementPage data={data} nav={nav} profile={profile} addGlobalToast={addGlobalToast} />;
      case "enrichments":
        return currentLocation === "enterprise" ? <div style={{ padding: 40, textAlign: "center" }}>Enrichments not available on Enterprise view</div> : (
          <EnrichmentsPage data={data} save={save} nav={nav} profile={profile} params={params} addGlobalToast={addGlobalToast} currentLocation={currentLocation} />
        );
      case "resources":
        return <ResourcesPage profile={profile} addGlobalToast={addGlobalToast} />;
      case "grassroots":
        return <GrassrootsPage profile={profile} addGlobalToast={addGlobalToast} />;
      case "resort-upkeep":
        return <ResortUpkeepPage profile={profile} locationId={currentLocation} addGlobalToast={addGlobalToast} />;
      case "scheduling":
        return <SchedulingPage data={data} nav={nav} profile={profile} addGlobalToast={addGlobalToast} />;
      case "inventory":
        return <InventoryPage data={data} save={save} nav={nav} profile={profile} addGlobalToast={addGlobalToast} />;
      case "inventory-report":
        return <InventoryReportPage data={data} save={save} nav={nav} profile={profile} addGlobalToast={addGlobalToast} />;
      case "cash-tips":
        return <CashTipsPage data={data} save={save} nav={nav} profile={profile} addGlobalToast={addGlobalToast} locationId={currentLocation} />;
      case "occupancy-report":
        return <OccupancyReportPage nav={nav} locationId={currentLocation} refreshOptions={refreshOptions} />;
      case "test-health":
        return <TestHealthPage />;
      case "settings":
        return <SettingsPage profile={profile} addGlobalToast={addGlobalToast} analyticsMode={IS_ANALYTICS_MODE} />;
      case "gingr-icons":
        return <GingrIconsPage profile={profile} addGlobalToast={addGlobalToast} locationId={currentLocation} />;
      case "onboarding":
        return <OnboardingPage nav={nav} />;
      case "pricing":
        return <PricingPage nav={nav} onSelectPlan={(planId) => { nav("onboarding", { selectedPlan: planId }); }} />;
      default:
        return <div>Page not found</div>;
    }
  };

  const isFullscreenPage = page === "checkout-tv" || page === "onboarding" || page === "pricing";
  const isEdgeToEdgePage = isFullscreenPage || page === "dashboard";
  const isHomePage = page === "home";

  return (
    <div style={{ display: "flex", height: "100vh", background: C.bg, fontFamily: "'Outfit', -apple-system, BlinkMacSystemFont, sans-serif" }}>
      {/* Sidebar — hidden on fullscreen pages like Checkout TV */}
      {!isFullscreenPage && <div
        onMouseEnter={() => setSidebarOpen(true)}
        onMouseLeave={() => setSidebarOpen(false)}
        style={{
          width: sbExpanded ? 240 : 68,
          background: `linear-gradient(180deg, ${C.pri} 0%, #0B3018 100%)`,
          display: "flex",
          flexDirection: "column",
          transition: "width 0.18s cubic-bezier(0.4,0,0.2,1)",
          overflow: "hidden",
          flexShrink: 0,
          zIndex: 50,
          borderRight: "1px solid rgba(132,204,22,0.06)",
        }}
      >
        {/* Logo Header */}
        <div style={{ padding: "20px 15px 14px", display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 12, height: 40, boxSizing: "content-box" }}>
          <div style={{ flexShrink: 0, width: 34, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {sbExpanded ? <K9Logo size={36} variant="white" /> : <K9LogoMini size={32} variant="white" />}
          </div>
          <div style={{ overflow: "hidden", opacity: sbExpanded ? 1 : 0, transition: "opacity 0.12s", whiteSpace: "nowrap" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.acc, fontFamily: "'Outfit', sans-serif", letterSpacing: "0.01em" }}>K9 Operations</div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ margin: "0 14px 10px", height: 1, background: "rgba(132,204,22,0.08)" }} />

        {/* Location Selector */}
        <div style={{ padding: "0 10px 8px", height: 44, boxSizing: "border-box" }}>
          <LocationSelector
            currentLocation={currentLocation}
            onLocationChange={handleLocationChange}
            collapsed={!sbExpanded}
            allLocations={filteredLocations}
            profile={profile}
          />
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: "4px 10px 0", overflowY: "auto" }}>
          {(currentLocation === "enterprise" ? LEAN_ENTERPRISE_NAV_ITEMS : (() => {
            // Role-aware nav: staff get minimal nav, managers get oversight, admins get full.
            // profile.role is the source of truth; userLocationRoles are role *definitions*.
            const code = profile?.role || "pct";
            const isOwnerOrAdmin = code === "owner" || code === "admin" || code === "developer" || code === "enterprise_admin";
            const isStaff = !isOwnerOrAdmin && (code === "pct" || code === "csr");
            const isManager = !isOwnerOrAdmin && (code === "supervisor" || code === "manager" || code === "mod");
            if (IS_ANALYTICS_MODE) return ANALYTICS_NAV_ITEMS;
            if (isStaff) return STAFF_NAV_ITEMS;
            if (isManager) return MANAGER_NAV_ITEMS;
            return LEAN_NAV_ITEMS;
          })()).filter(item => canAccessLitePage(profile, item.id, {})).map(item => {
            const act = page === item.id || (item.id === "enterprise-directory" && page === "enterprise-org-chart");
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
                  color: act ? C.acc : "rgba(255,255,255,0.7)",
                  fontSize: 13,
                  fontWeight: act ? 700 : 500,
                  cursor: "pointer",
                  marginBottom: 3,
                  fontFamily: "inherit",
                  transition: "background 0.15s, color 0.15s",
                  whiteSpace: "nowrap",
                  position: "relative",
                  boxSizing: "border-box",
                  borderLeft: act ? "3px solid " + C.acc : "3px solid transparent",
                  letterSpacing: act ? "0.01em" : "0",
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

      {!isFullscreenPage && <InitialGingrSyncDock locationId={currentLocation} />}

      {/* Toast Notifications */}
      {toasts.length > 0 && (
        <div style={{ position: "fixed", top: 24, right: 24, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8 }}>
          {toasts.map(t => {
            const barColor = t.type === "success" ? "#84CC16" : t.type === "error" ? "#EF4444" : t.type === "warning" ? "#F59E0B" : "#84CC16";
            const iconColor = t.type === "success" ? "#84CC16" : t.type === "error" ? "#EF4444" : t.type === "warning" ? "#F59E0B" : "#84CC16";
            const duration = t.actionLabel ? 7 : 5.5;
            return (
              <div key={t.id} style={{
                borderRadius: 12, overflow: "hidden",
                background: "#1F2937", color: "#F9FAFB",
                boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
                animation: `k9-toast-in 0.3s ease, k9-toast-glow-fade ${duration}s ease-in forwards`,
              }}>
                <div style={{
                  padding: "12px 20px", fontSize: 13, fontWeight: 600, fontFamily: "inherit",
                  display: "flex", alignItems: "center", gap: 8, maxWidth: 400,
                }}>
                  <span style={{ color: iconColor, fontSize: 15 }}>{t.type === "success" ? "\u2713" : t.type === "error" ? "\u2717" : t.type === "warning" ? "\u26A0" : "\u2139"}</span>
                  <span style={{ flex: 1 }}>{t.msg}</span>
                  {t.actionLabel && t.onAction && (
                    <button onClick={() => { t.onAction(); setToasts(prev => prev.filter(x => x.id !== t.id)); }}
                      style={{marginLeft:8,padding:"4px 10px",borderRadius:6,border:"1.5px solid rgba(255,255,255,0.25)",background:"rgba(255,255,255,0.08)",color:"#F9FAFB",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
                      {t.actionLabel}
                    </button>
                  )}
                </div>
                {/* Progress bar tracks the same lifespan as the toast. */}
                <div style={{ height: 3, background: "rgba(255,255,255,0.06)" }}>
                  <div style={{
                    height: "100%", borderRadius: "0 3px 3px 0",
                    background: `linear-gradient(90deg, ${barColor}99, ${barColor})`,
                    boxShadow: `0 0 8px ${barColor}60`,
                    animation: `k9-toast-progress ${duration}s linear forwards`,
                  }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Main Content */}
      <div style={{ flex: 1, overflow: "auto", background: isFullscreenPage ? "transparent" : isHomePage ? "#FAFBFC" : C.bg, padding: isEdgeToEdgePage ? 0 : isHomePage ? "36px 44px" : "32px 40px" }}>
        <div style={{ maxWidth: isEdgeToEdgePage ? "none" : 1440, margin: "0 auto", height: isEdgeToEdgePage ? "100%" : "auto" }}>
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
          {page === "onboarding" || page === "pricing" || !ENABLE_SUBSCRIPTION_GATE ? (
            renderPage()
          ) : (profile.role === "owner" || profile.role === "developer") ? (
            renderPage()
          ) : (
            <SubscriptionGate
              subscription={subscription}
              loading={subLoading}
              isActive={subIsActive}
              isPastDue={subIsPastDue}
              onNavigate={nav}
            >
              {renderPage()}
            </SubscriptionGate>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LiteApp() {
  return (
    <BrandedErrorBoundary
      title="K9 Operations Lite hit an unexpected error"
      description="The Lite app caught a render error and stayed in recovery mode instead of dumping the raw JavaScript stack on screen."
      returnHref="/welcome"
    >
      <LeanAppInner />
    </BrandedErrorBoundary>
  );
}
