// K9 Operations — ClientsPage
// Isolated page component. See AGENTS.md for development contract.

import React, { useState, useEffect, useMemo, useCallback, useRef, memo } from "react";
import ReactDOM from "react-dom";
import { supabase } from "../../supabaseClient";
import { C, OPERATIONS_CATALOG, OPS_TYPES, LITE_DEF_PRICING, CHART_PTS, DEF_CLIENT_FIELDS, DEF_DOG_FIELDS, DEFAULT_LIFECYCLE_BANNERS, LC_OP_LABELS, LC_FILTER_FIELDS, LITE_ACTION_LABELS, LITE_ACTION_LEVELS, DEF_LITE_EOD_TEMPLATE, DAY_NAMES_SHORT, ROOM_TYPES, K9_LOCATIONS, POS_BASE, PAGE_SLUGS, buildUrl, parseUrl, gid, titleCase, fmtPhone, fmtDate, fmtDateFull, fmtDateShort, fmtTime, fmtInstr, todayStr, addDays, formatTime12hr, countNights, countHours, DEF_OPENING_TEMPLATE, DEF_FE_TEMPLATE, DEF_BE_TEMPLATE, DEF_CLOSING_TEMPLATE, LEAN_PERMISSION_AREAS, LEAN_PERMISSION_MATRIX, LEAN_ROLES, NAV_ITEMS, K9_LOGO_SRC, K9_LOGO_PNG, SLUG_TO_PAGE, ENT_SLUG_TO_PAGE, formatDogNames, fmtPhoneInput, IDB_VERSION, idbGet, idbSet } from "../../shared/theme";
import { I, Icons } from "../../shared/icons";
import { Tip, Badge, Btn, CustomSelect, MiniDatePicker, ComplianceCheckItem, Inp, CalendarPicker, Modal, Card, K9Logo, K9LogoMini, isFieldRequired, validateClientFields } from "../../shared/ui";  // formatDogNames, fmtPhoneInput are in theme.js
import { hasPermission, hasLeanPermission, _resolveRole, LEGACY_ROLE_MAP, ROLE_CODE_MAP } from "../../shared/permissions";
import { classifyReservationType, classifyReservationStatus, extractRoomFromType, getRoomCleaningStats, resSvcIncludes, getPPStats, getOpsCardStatus, getOpsProgress, getOpsCountLabel } from "../../shared/opsHelpers";
import K9LoadingAnimation from "../../shared/K9LoadingAnimation";
import InteractiveLineChart from "../../shared/InteractiveLineChart";
import LocationSelector from "../../shared/LocationSelector";
import { applyStructuredFilters } from "../../hooks/useFilters";

function ClientsPage({ data, save, nav, profile, addGlobalToast, lcFilters, setLcFilters, lcFilterOpen, setLcFilterOpen, locationSlug }) {
  const [activeTab, setActiveTab] = useState("leads");
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [showOverdueOnly, setShowOverdueOnly] = useState(false);
  const [showOldGingrData, setShowOldGingrData] = useState(false);
  const [sourceFilter, setSourceFilter] = useState(new Set());
  const [logPopover, setLogPopover] = useState(null);
  const [logNotes, setLogNotes] = useState("");
  const [logDate, setLogDate] = useState("");
  const [expandedUpdates, setExpandedUpdates] = useState(new Set());
  const [visibleColumns, setVisibleColumns] = useState(new Set(["totalRes","lastRes","daysSince","totalSpent","nextRes"]));
  const [showColumnToggle, setShowColumnToggle] = useState(false);
  const [hoveredSource, setHoveredSource] = useState(null);
  const [hoveredDogCount, setHoveredDogCount] = useState(null);
  const [expandedDogs, setExpandedDogs] = useState(new Set());
  const [expandedIgnite, setExpandedIgnite] = useState(new Set());
  const [showExtraCols, setShowExtraCols] = useState(false);
  const [editingBanner, setEditingBanner] = useState(null); // which tab's banner is being edited
  const [bannerDraft, setBannerDraft] = useState("");
  const [defaultBanners, setDefaultBanners] = useState(null); // custom defaults from lite_settings (overrides hardcoded)
  const [displayLimit, setDisplayLimit] = useState(100);
  const [showBulkUpdate, setShowBulkUpdate] = useState(false);
  const [bulkReason, setBulkReason] = useState("");
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [activeViewId, setActiveViewId] = useState(null);
  const [showSaveView, setShowSaveView] = useState(false);
  const [viewName, setViewName] = useState("");
  const [savedViews, setSavedViews] = useState([]);

  // Load saved views from lite_settings on mount
  useEffect(() => {
    if (!locationSlug) return;
    supabase.from("lite_settings").select("setting_value").eq("location_id", locationSlug).eq("setting_key", "lifecycle_views").maybeSingle().then(({ data: row }) => {
      if (row?.setting_value) setSavedViews(row.setting_value);
    });
  }, [locationSlug]);

  // Persist views helper
  const persistViews = async (views) => {
    setSavedViews(views);
    await supabase.from("lite_settings").upsert({ location_id: locationSlug, setting_key: "lifecycle_views", setting_value: views }, { onConflict: "location_id,setting_key" });
  };

  // Load custom default banners from lite_settings
  useEffect(() => {
    if (!locationSlug) return;
    supabase.from("lite_settings").select("setting_value").eq("location_id", locationSlug).eq("setting_key", "default_lifecycle_banners").maybeSingle().then(({ data: row }) => {
      if (row?.setting_value) setDefaultBanners(row.setting_value);
    });
  }, [locationSlug]);
  const [draftFilters, setDraftFilters] = useState({});
  const [showFilterPicker, setShowFilterPicker] = useState(false);
  const [filterPickerReady, setFilterPickerReady] = useState(false);
  const [configuringKey, setConfiguringKey] = useState(null);
  const [configStep, setConfigStep] = useState(0); // 0=pick op, 1=enter value
  const prevFilterOpen = useRef(false);
  useEffect(() => { if (lcFilterOpen && !prevFilterOpen.current) { setDraftFilters({...lcFilters}); setShowFilterPicker(false); setConfiguringKey(null); } prevFilterOpen.current = lcFilterOpen; }, [lcFilterOpen, lcFilters]);
  const logBtnRef = useRef({});
  const colToggleRef = useRef(null);

  // ── Pre-built lookup maps (O(n) instead of O(n×m) filtering) ──
  const resByClient = useMemo(() => {
    const m = {};
    (data.reservations || []).forEach(r => { (m[r.clientId] || (m[r.clientId] = [])).push(r); });
    return m;
  }, [data.reservations]);

  const dogsByClient = useMemo(() => {
    const m = {};
    (data.dogs || []).forEach(d => { (m[d.clientId] || (m[d.clientId] = [])).push(d); });
    return m;
  }, [data.dogs]);

  const pmtByClient = useMemo(() => {
    const m = {};
    (data.payments || []).forEach(p => { if (p.status === "completed" && p.type !== "refund") (m[p.clientId] || (m[p.clientId] = [])).push(p); });
    return m;
  }, [data.payments]);

  // ── Client stats (uses server-computed RPC when available, falls back to JS) ──
  const clientStats = useMemo(() => {
    const map = {};
    const td = todayStr();
    const tdNoon = new Date(td + "T12:00:00");
    const ss = data.serverStats; // RPC results keyed by owner_gingr_id
    data.clients.forEach(c => {
      const dogs = dogsByClient[c.id] || [];
      const dogNames = dogs.map(d => d.fields.name || "Unknown");
      const gingrId = String(c.gingrId);

      // Use server-computed stats if available (instant), otherwise fall back to JS computation
      if (ss && ss[gingrId]) {
        const s = ss[gingrId];
        const lastResDate = s.last_res_date || "";
        const nextResDate = s.next_res_date || "";
        const lastRes = lastResDate ? { checkIn: lastResDate } : (c._lastReservation ? { checkIn: c._lastReservation.split("T")[0], _fromGingrOwner: true } : null);
        const nextRes = (nextResDate && nextResDate >= td) ? { checkIn: nextResDate } : null;
        const daysSinceLast = lastRes ? Math.round((tdNoon - new Date(lastRes.checkIn + "T12:00:00")) / 86400000) : null;
        const totalRes = Number(s.total_res) || (c._numReservations || 0);
        const totalSpent = Number(s.total_spent) || 0;
        const hasGingrUpcoming = !nextRes && c._nextReservation && c._nextReservation.split("T")[0] >= td;
        const finalNextRes = nextRes || (hasGingrUpcoming ? { checkIn: c._nextReservation.split("T")[0], _fromGingrOwner: true } : null);
        map[c.id] = {
          dogCount: dogs.length, dogNames,
          daycareCount: Number(s.daycare_count) || 0,
          boardingCount: Number(s.boarding_count) || 0,
          evalCount: Number(s.eval_count) || 0,
          tourCount: Number(s.tour_count) || 0,
          lastRes, nextRes: finalNextRes, totalSpent, totalRes,
          daysSinceLast,
          postEvalAppts: Number(s.post_eval_appts) || 0,
          postTourAppts: Number(s.post_tour_appts) || 0,
          hasEverBooked: totalRes > 0,
          hasGingrUpcoming: !!hasGingrUpcoming,
        };
      } else {
        // Fallback: compute from client-side reservation data
        const cRes = resByClient[c.id] || [];
        const daycareCount = cRes.filter(r => r.type === "daycare").length;
        const boardingCount = cRes.filter(r => r.type === "boarding").length;
        const evalCount = cRes.filter(r => r.type === "evaluation").length;
        const tourCount = cRes.filter(r => r.type === "tour").length;
        const sorted = [...cRes].sort((a, b) => b.checkIn.localeCompare(a.checkIn));
        const lastResSynced = sorted.find(r => r.checkIn <= td);
        const nextResSynced = sorted.filter(r => r.checkIn >= td && r.status === "upcoming").sort((a, b) => a.checkIn.localeCompare(b.checkIn))[0];
        const resSpent = cRes.reduce((s, r) => s + ((r.pricing && r.pricing.total) || 0), 0);
        const pmtSpent = (pmtByClient[c.id] || []).reduce((s, p) => s + (p.amount || 0), 0);
        const totalSpent = resSpent + pmtSpent;
        let lastRes = lastResSynced || null;
        let daysSinceLast = lastRes ? Math.round((tdNoon - new Date(lastRes.checkIn + "T12:00:00")) / 86400000) : null;
        if (daysSinceLast == null && c._lastReservation) {
          const lrDate = c._lastReservation.split("T")[0];
          daysSinceLast = Math.round((tdNoon - new Date(lrDate + "T12:00:00")) / 86400000);
          lastRes = { checkIn: lrDate, _fromGingrOwner: true };
        }
        const totalRes = cRes.length || (c._numReservations || 0);
        let nextRes = nextResSynced || null;
        const hasGingrUpcoming = !nextRes && c._nextReservation && c._nextReservation.split("T")[0] >= td;
        if (hasGingrUpcoming) { nextRes = { checkIn: c._nextReservation.split("T")[0], _fromGingrOwner: true }; }
        const hasEverBooked = totalRes > 0;
        let postEvalAppts = 0;
        const evalsSorted = cRes.filter(r => r.type === "evaluation").sort((a, b) => a.checkIn.localeCompare(b.checkIn));
        if (evalsSorted.length > 0) { postEvalAppts = cRes.filter(r => r.checkIn > evalsSorted[0].checkIn).length; }
        let postTourAppts = 0;
        const toursSorted = cRes.filter(r => r.type === "tour").sort((a, b) => a.checkIn.localeCompare(b.checkIn));
        if (toursSorted.length > 0) { postTourAppts = cRes.filter(r => r.checkIn > toursSorted[0].checkIn).length; }
        map[c.id] = { dogCount: dogs.length, dogNames, daycareCount, boardingCount, evalCount, tourCount, lastRes, nextRes, totalSpent, totalRes, daysSinceLast, postEvalAppts, postTourAppts, hasEverBooked, hasGingrUpcoming: !!hasGingrUpcoming };
      }
    });
    return map;
  }, [data.clients, data.serverStats, resByClient, dogsByClient, pmtByClient]);

  // ── Tab membership (uses server stats or Gingr owner-level data for classification) ──
  const clientTabMap = useMemo(() => {
    const map = {};
    const dcThresh = data.resortPolicies?.retentionDaycareDays ?? 90;
    const bdThresh = data.resortPolicies?.retentionBoardingDays ?? 180;
    const td = todayStr();
    const ss = data.serverStats;
    data.clients.forEach(c => {
      // Lite clients: place in leads tab (they have no Gingr bookings/spend)
      if (c.isLiteClient) {
        const isCold = c.lifecycle?.cold === true;
        map[c.id] = { isConversion: !isCold, isOldGingrSync: false, isActive: false, isRetention: false, isCold, isAll: true };
        return;
      }
      const s = clientStats[c.id] || {};
      const hasSpent = (s.totalSpent || 0) > 0;
      const gingrId = String(c.gingrId);
      const srv = ss && ss[gingrId];

      // Use server stats for has_real_booking/has_upcoming when available
      const hasRealBookingSynced = srv ? (srv.has_real_booking || false) : (resByClient[c.id] || []).some(r => r.type !== "tour" && r.type !== "evaluation");
      const hasUpcomingSynced = srv ? (srv.has_upcoming || false) : (resByClient[c.id] || []).some(r => r.checkIn >= td && r.status === "upcoming" && r.type !== "tour" && r.type !== "evaluation");

      const hasEverBooked = s.hasEverBooked || false;
      const hasRealBooking = hasRealBookingSynced || hasEverBooked;
      const hasUpcoming = hasUpcomingSynced || s.hasGingrUpcoming;

      const totalRes = s.totalRes || 0;
      const daysSince = s.daysSinceLast;
      const isCold = c.lifecycle?.cold === true;
      let isRetention = false;

      if (hasRealBooking && !hasUpcoming && totalRes > 0 && daysSince != null) {
        const resCount = srv ? Number(srv.total_res) : (resByClient[c.id] || []).length;
        if (resCount > 0) {
          const dcPct = (s.daycareCount || 0) / resCount;
          const bdPct = (s.boardingCount || 0) / resCount;
          if (bdPct > 0.5 && daysSince >= bdThresh) isRetention = true;
          else if (dcPct >= 0.5 && daysSince >= dcThresh) isRetention = true;
          else if (dcPct < 0.5 && bdPct < 0.5 && daysSince >= dcThresh) isRetention = true;
        } else {
          if (daysSince >= dcThresh) isRetention = true;
        }
      }

      const isConversion = !hasSpent && !hasRealBooking && !isCold;
      // CLM-001: Gingr-sourced clients created >14 days ago go to "Old From Gingr Sync"
      const fourteenDaysAgo = addDays(td, -14);
      const isOldGingrSync = isConversion && !!c.gingrId && c.createdAt && c.createdAt.split("T")[0] < fourteenDaysAgo;
      // Old Gingr lapsed: same threshold — old Gingr-synced lapsed clients are historical noise
      const isOldGingrLapsed = isRetention && !isCold && !!c.gingrId && c.createdAt && c.createdAt.split("T")[0] < fourteenDaysAgo;
      const isActive = (hasSpent || hasRealBooking) && !isRetention && !isCold;
      if (isCold) isRetention = false;
      map[c.id] = { isConversion: isConversion && !isOldGingrSync, isOldGingrSync: isOldGingrSync || isOldGingrLapsed, isActive, isRetention: isRetention && !isCold && !isOldGingrLapsed, isCold, isAll: true };
    });
    return map;
  }, [data.clients, data.serverStats, clientStats, resByClient, data.resortPolicies?.retentionDaycareDays, data.resortPolicies?.retentionBoardingDays]);

  // ── TEMP DIAGNOSTIC: why are clients in conversion? ──
  // ── Lifecycle event tracking ──
  const prevTabMapRef = useRef(null);
  useEffect(() => {
    if (!prevTabMapRef.current || !save) { prevTabMapRef.current = clientTabMap; return; }
    const prev = prevTabMapRef.current;
    let changed = false;
    const updatedClients = data.clients.map(c => {
      const oldM = prev[c.id]; const newM = clientTabMap[c.id];
      if (!oldM || !newM) return c;
      let event = null;
      if (oldM.isConversion && newM.isActive) event = { event: "moved_to_active", date: todayStr(), details: "Moved to Active Customers (first booking/payment)" };
      else if (oldM.isActive && newM.isRetention) event = { event: "moved_to_retention", date: todayStr(), details: "Moved to Retention (lapsed client)" };
      else if (oldM.isRetention && newM.isActive) event = { event: "moved_to_active", date: todayStr(), details: "Returned to Active Customers (re-engaged)" };
      if (event) {
        changed = true;
        let updated = { ...c, lifecycleEvents: [...(c.lifecycleEvents || []), event] };
        // When moving to retention, set follow-up date to lapse date (today = day they crossed threshold)
        if (event.event === "moved_to_retention") {
          const lc = updated.lifecycle || { conversion: { notes:"",followUpDate:"",updates:[],source:"",sourceDate:"",sourceReservationId:"" }, retention: { notes:"",followUpDate:"",updates:[] }, cold:false, coldDate:"", coldFrom:"" };
          updated = { ...updated, lifecycle: { ...lc, retention: { ...lc.retention, followUpDate: todayStr() } } };
        }
        return updated;
      }
      return c;
    });
    prevTabMapRef.current = clientTabMap;
    if (changed) save({ ...data, clients: updatedClients });
  }, [clientTabMap]);

  // ── One-time retrospective fix: clear stale follow-up dates on old Gingr sync leads ──
  const retroFixDoneRef = useRef(false);
  useEffect(() => {
    if (retroFixDoneRef.current || !save || !clientTabMap) return;
    retroFixDoneRef.current = true;
    const today = todayStr();
    let changed = false;
    const updatedClients = data.clients.map(c => {
      const tm = clientTabMap[c.id];
      if (!tm || !tm.isOldGingrSync) return c;
      // Clear conversion follow-up for old Gingr leads with no outreach history
      const convLc = c.lifecycle?.conversion;
      if (convLc?.followUpDate && convLc.followUpDate < today && (!convLc.updates || convLc.updates.length === 0)) {
        changed = true;
        return { ...c, lifecycle: { ...c.lifecycle, conversion: { ...convLc, followUpDate: "" } } };
      }
      return c;
    });
    if (changed) save({ ...data, clients: updatedClients });
  }, [clientTabMap]);

  // ── One-time backfill: add "Pulled lead from Ignite" system log for Ignite leads with 0 entries ──
  const igniteBackfillDoneRef = useRef(false);
  useEffect(() => {
    if (igniteBackfillDoneRef.current || !save) return;
    igniteBackfillDoneRef.current = true;
    let changed = false;
    const updatedClients = data.clients.map(c => {
      // Only apply to Ignite-sourced lite clients with 0 updates
      if (!c.isLiteClient) return c;
      if (c.lifecycle?.conversion?.source !== "ignite") return c;
      const updates = c.lifecycle?.conversion?.updates || [];
      if (updates.length > 0) return c;
      // Add system log entry
      const leadType = c.igniteData?.leadType;
      const src = c.igniteData?.source || "";
      const typeLabel = leadType === "phone_call" ? "Phone Call" : leadType === "web_form" ? "Web Form" : leadType === "ad_click" ? "Ad Click" : "Lead";
      changed = true;
      return {
        ...c,
        lifecycle: {
          ...c.lifecycle,
          conversion: {
            ...c.lifecycle.conversion,
            updates: [{
              id: gid(),
              notes: `Pulled lead from Ignite \u2014 ${typeLabel}${src ? " (" + src + ")" : ""}`,
              previousFollowUp: "",
              newFollowUp: c.lifecycle.conversion.followUpDate || "",
              loggedBy: "System",
              loggedAt: c.createdAt || new Date().toISOString(),
            }],
          },
        },
      };
    });
    if (changed) save({ ...data, clients: updatedClients });
  }, [data.clients]);

  // ── Source lookup helpers ──
  const getClientSource = useCallback((client) => {
    const base = client.fields?.referral_source || "";
    const hasEval = (data.evaluations || []).some(e => e.clientId === client.id && e.locked);
    const cRes = resByClient[client.id] || [];
    const evalRes = hasEval ? cRes.find(r => r.type === "evaluation" && (data.evaluations || []).some(e => e.reservationId === r.id && e.locked)) : null;
    const tourRes = cRes.filter(r => r.type === "tour" && r.status === "checked-out").sort((a,b) => b.checkIn.localeCompare(a.checkIn))[0] || null;
    return { base, hasEval, evalRes, hasTour: !!tourRes, tourRes };
  }, [data.evaluations, resByClient]);

  // ── Filtered & sorted client lists ──
  const tabLists = useMemo(() => {
    const sq = search.toLowerCase().trim();
    const sqDigits = sq.replace(/\D/g, "");
    let all = data.clients;
    if (sq) {
      all = all.filter(c => {
        const fn = `${c.fields.first_name || ""} ${c.fields.last_name || ""}`.toLowerCase();
        const ph = (c.fields.phone || "").replace(/\D/g, "");
        const dogNames = (clientStats[c.id]?.dogNames || []).join(" ").toLowerCase();
        return fn.includes(sq) || dogNames.includes(sq) || (sqDigits.length >= 3 && ph.includes(sqDigits));
      });
    }
    const conv = all.filter(c => clientTabMap[c.id]?.isConversion);
    const oldGingrSync = all.filter(c => clientTabMap[c.id]?.isOldGingrSync);
    const active = all.filter(c => clientTabMap[c.id]?.isActive);
    const ret = all.filter(c => clientTabMap[c.id]?.isRetention);
    const cold = all.filter(c => clientTabMap[c.id]?.isCold);
    return { leads: conv, oldGingrSync, active, lapsed: ret, cold, all };
  }, [data.clients, search, clientTabMap, clientStats, activeTab]);

  // ── Apply sub-filters (structured filters, source filter, overdue toggle) ──
  const activeFilterCount = Object.keys(lcFilters).length;
  const activeList = useMemo(() => {
    let list = tabLists[activeTab] || [];
    // Structured filters
    if (activeFilterCount > 0) {
      list = applyStructuredFilters(list, clientStats, clientTabMap, lcFilters);
    }
    // Source filter (Conversion + Old From Gingr Sync tabs)
    if ((activeTab === "leads" || activeTab === "oldGingrSync") && sourceFilter.size > 0) {
      list = list.filter(c => {
        const src = getClientSource(c);
        if (sourceFilter.has("eval") && src.hasEval) return true;
        if (sourceFilter.has("tour") && src.hasTour) return true;
        if (sourceFilter.has("ignite") && c.lifecycle?.conversion?.source === "ignite") return true;
        return false;
      });
    }
    // Overdue toggle
    if (showOverdueOnly) {
      const today = todayStr();
      list = list.filter(c => {
        const tab = (activeTab === "leads" || activeTab === "oldGingrSync") ? "conversion" : activeTab === "lapsed" ? "retention" : null;
        if (!tab) return false;
        const fu = c.lifecycle?.[tab]?.followUpDate;
        return fu && fu < today;
      });
    }
    // Sort
    if (sortCol) {
      const dir = sortDir === "asc" ? 1 : -1;
      list = [...list].sort((a, b) => {
        const sa = clientStats[a.id] || {};
        const sb = clientStats[b.id] || {};
        let va, vb;
        switch (sortCol) {
          case "name": case "last_name": va = (a.fields.last_name||"").toLowerCase(); vb = (b.fields.last_name||"").toLowerCase(); break;
          case "first_name": va = (a.fields.first_name||"").toLowerCase(); vb = (b.fields.first_name||"").toLowerCase(); break;
          case "phone": va = a.fields.phone||""; vb = b.fields.phone||""; break;
          case "dogCount": va = sa.dogCount||0; vb = sb.dogCount||0; break;
          case "createdAt": va = a.createdAt||""; vb = b.createdAt||""; break;
          case "totalRes": va = sa.totalRes||0; vb = sb.totalRes||0; break;
          case "lastRes": va = sa.lastRes?.checkIn||""; vb = sb.lastRes?.checkIn||""; break;
          case "daysSince": va = sa.daysSinceLast??9999; vb = sb.daysSinceLast??9999; break;
          case "totalSpent": va = sa.totalSpent||0; vb = sb.totalSpent||0; break;
          case "nextRes": va = sa.nextRes?.checkIn||"zzz"; vb = sb.nextRes?.checkIn||"zzz"; break;
          case "followUp": { const t = activeTab==="lapsed"?"retention":"conversion"; va = a.lifecycle?.[t]?.followUpDate||"zzz"; vb = b.lifecycle?.[t]?.followUpDate||"zzz"; break; }
          case "coldDate": va = a.lifecycle?.coldDate||""; vb = b.lifecycle?.coldDate||""; break;
          case "totalPaid": va = sa.totalSpent||0; vb = sb.totalSpent||0; break;
          case "totalAppts": va = sa.totalRes||0; vb = sb.totalRes||0; break;
          default: va = ""; vb = "";
        }
        if (typeof va === "number") return (va - vb) * dir;
        return va < vb ? -dir : va > vb ? dir : 0;
      });
    }
    return list;
  }, [tabLists, activeTab, sourceFilter, showOverdueOnly, sortCol, sortDir, clientStats, getClientSource, lcFilters, activeFilterCount, clientTabMap]);

  // ── Reset display limit when tab/search/filters change ──
  useEffect(() => { setDisplayLimit(100); }, [activeTab, search, sourceFilter, showOverdueOnly, sortCol, sortDir, lcFilters]);
  const displayedList = activeList.slice(0, displayLimit);
  const hasMore = activeList.length > displayLimit;

  // ── Handlers ──
  const handleSort = (col) => { if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortCol(col); setSortDir("asc"); } };
  const SortIcon = ({ col }) => { if (sortCol !== col) return null; return <span style={{fontSize:10,marginLeft:2}}>{sortDir==="asc"?"▲":"▼"}</span>; };
  const colHeaderStyle = (col) => ({ display:"flex",alignItems:"center",gap:2,cursor:"pointer",userSelect:"none",color:sortCol===col?C.pri:C.textMut,fontWeight:sortCol===col?800:700 });
  const toggleSourceFilter = (type) => setSourceFilter(prev => { const n=new Set(prev); if(n.has(type))n.delete(type);else n.add(type); return n; });

  const today = todayStr();
  const dcThresh = data.resortPolicies?.retentionDaycareDays ?? 90;
  const bdThresh = data.resortPolicies?.retentionBoardingDays ?? 180;

  // ── Log/Revive handler ──
  const handleSaveLog = async () => {
    if (!logPopover) return;
    if (!logNotes.trim() || !logDate) { addGlobalToast?.({ type: "error", message: "Notes and follow-up date are required" }); return; }
    const { clientId, tab: lcTab, isRevive } = logPopover;
    const newClients = data.clients.map(c => {
      if (c.id !== clientId) return c;
      const lc = c.lifecycle || { conversion: { notes:"",followUpDate:"",updates:[],source:"",sourceDate:"",sourceReservationId:"" }, retention: { notes:"",followUpDate:"",updates:[] }, cold:false, coldDate:"", coldFrom:"" };
      const rawColdFrom = lc.coldFrom || "leads";
      const tabKey = isRevive ? (rawColdFrom === "lapsed" || rawColdFrom === "retention" ? "retention" : "conversion") : lcTab;
      const oldDate = lc[tabKey]?.followUpDate || "";
      const entry = { id: gid(), notes: logNotes, previousFollowUp: oldDate, newFollowUp: logDate, loggedBy: profile?.full_name || profile?.email || "Staff", loggedAt: new Date().toISOString() };
      const updatedTab = { ...(lc[tabKey]||{}), notes: "", followUpDate: logDate, updates: [entry, ...(lc[tabKey]?.updates||[])] };
      const evt = { event: isRevive ? "revived_from_cold" : "logged_outreach", date: today, details: isRevive ? `Revived back to ${tabKey}` : `Logged in ${tabKey}: "${logNotes.substring(0,50)}"` };
      return {
        ...c,
        lifecycle: { ...lc, [tabKey]: updatedTab, ...(isRevive ? { cold: false } : {}) },
        lifecycleEvents: [...(c.lifecycleEvents || []), evt]
      };
    });
    await save({ ...data, clients: newClients });
    setLogPopover(null); setLogNotes(""); setLogDate("");
    addGlobalToast?.({ message: isRevive ? "Client revived" : "Log saved" });
  };

  const markCold = async (clientId) => {
    const prevClient = data.clients.find(c => c.id === clientId);
    const prevLifecycle = prevClient ? JSON.parse(JSON.stringify(prevClient.lifecycle || {})) : {};
    const prevEvents = prevClient ? [...(prevClient.lifecycleEvents || [])] : [];
    const newClients = data.clients.map(c => {
      if (c.id !== clientId) return c;
      return {
        ...c,
        lifecycle: { ...(c.lifecycle||{}), cold: true, coldDate: today, coldFrom: activeTab === "lapsed" ? "lapsed" : "leads" },
        lifecycleEvents: [...(c.lifecycleEvents||[]), { event: "marked_cold", date: today, details: `Marked as cold from ${activeTab}` }]
      };
    });
    await save({ ...data, clients: newClients });
    addGlobalToast?.({
      message: "Client marked as cold",
      actionLabel: "Undo",
      onAction: async () => {
        const undoClients = data.clients.map(c => {
          if (c.id !== clientId) return c;
          return { ...c, lifecycle: prevLifecycle, lifecycleEvents: prevEvents };
        });
        await save({ ...data, clients: undoClients });
        addGlobalToast?.({ message: "Undo successful — client restored" });
      }
    });
  };

  // ── Tab config ──
  const filteredTabCounts = useMemo(() => {
    if (activeFilterCount === 0) return null;
    const out = {};
    for (const key of ["leads","oldGingrSync","active","lapsed","cold","all"]) {
      out[key] = applyStructuredFilters(tabLists[key] || [], clientStats, clientTabMap, lcFilters).length;
    }
    return out;
  }, [activeFilterCount, tabLists, clientStats, clientTabMap, lcFilters]);

  const tabDefs = [
    { id: "leads", label: "Leads", count: filteredTabCounts ? filteredTabCounts.leads : tabLists.leads.length, color: C.acc },
    { id: "active", label: "Active Customers", count: filteredTabCounts ? filteredTabCounts.active : tabLists.active.length, color: C.pri },
    { id: "lapsed", label: "Lapsed", count: filteredTabCounts ? filteredTabCounts.lapsed : tabLists.lapsed.length, color: C.dan },
    { id: "cold", label: "Cold", count: filteredTabCounts ? filteredTabCounts.cold : tabLists.cold.length, color: C.textSec },
    { id: "all", label: "All", count: filteredTabCounts ? filteredTabCounts.all : tabLists.all.length, color: C.info },
    // Old Gingr Data tab — far right, hidden by default behind toggle
    { id: "oldGingrSync", label: "Old Gingr Data", count: filteredTabCounts ? filteredTabCounts.oldGingrSync : tabLists.oldGingrSync.length, color: C.textMut, hidden: true },
  ];

  // ── Toggleable columns for Active/All tabs ──
  // CLM-012: Kept for Lite — DC/BD/Eval/Tour breakdowns help operators understand per-service engagement patterns across active clients.
  const toggleCols = [
    { key: "daycare", label: "DC" }, { key: "boarding", label: "BD" },
    { key: "eval", label: "Eval" }, { key: "postEval", label: "P-Eval" },
    { key: "tours", label: "Tours" }, { key: "postTour", label: "P-Tour" },
  ];
  const baseCols = ["nextRes","lastRes","daysSince","totalRes","totalSpent"];
  const extraCols = ["daycare","boarding","eval","postEval","tours","postTour"];
  const shownDataCols = showExtraCols ? [...baseCols.slice(0,3), ...extraCols, ...baseCols.slice(3)] : baseCols;

  // ── Source cell renderer ──
  // Booking drafts state (for Online Booking source accordion)
  const [bookingDrafts, setBookingDrafts] = useState([]);
  const [draftsLoaded, setDraftsLoaded] = useState(false);
  const [expandedDraft, setExpandedDraft] = useState(null);

  // Load booking drafts when conversion tab is shown — refresh each time tab is opened
  useEffect(() => {
    if (activeTab === "leads" && locationSlug) {
      setDraftsLoaded(false);
      supabase.rpc("get_booking_drafts", { p_location_slug: locationSlug }).then(
        ({ data: d, error: e }) => {
          if (e) { console.log("get_booking_drafts error:", e.message); setDraftsLoaded(true); return; }
          if (d) setBookingDrafts(Array.isArray(d) ? d : []);
          setDraftsLoaded(true);
        },
        () => setDraftsLoaded(true) // network error
      );
    }
  }, [activeTab, locationSlug]);

  const renderSource = (client) => {
    // Lite client source badges
    if (client.isLiteClient) {
      const src = client.source || "manual";
      const srcLabel = src === "ignite" ? "Ignite" : src === "eval" ? "Eval" : src === "tour" ? "Tour" : titleCase(src);
      const srcColor = src === "ignite" ? "#F97316" : src === "eval" ? C.acc : src === "tour" ? C.info : C.pri;
      return (
        <div style={{display:"flex",alignItems:"center",gap:4,fontSize:11}}>
          <span style={{display:"inline-flex",alignItems:"center",gap:3,background:`${srcColor}14`,border:`1px solid ${srcColor}30`,borderRadius:6,padding:"2px 7px",fontWeight:700,color:srcColor,fontSize:10}}>{srcLabel}</span>
        </div>
      );
    }
    // Gingr clients that were matched from a lite client — show original source
    if (client._liteSource) {
      const src = client._liteSource;
      const srcLabel = src === "ignite" ? "Ignite" : titleCase(src);
      const srcColor = src === "ignite" ? "#F97316" : C.pri;
      // Fall through to normal source rendering but prepend lite source
    }
    const src = getClientSource(client);
    const isIgnite = client.lifecycle?.conversion?.source === "ignite" || client._liteSource === "ignite";
    const isOnline = client.fields?.referral_source === "Online Booking" || client.lifecycle?.conversion?.source === "online_booking";
    const parts = [];
    if (isIgnite) parts.push({ label: "Ignite", type: "ignite" });
    if (isOnline) parts.push({ label: "Online Booking", type: "online" });
    if (src.base && (!isIgnite || src.base !== "Ignite") && src.base !== "Online Booking") parts.push({ label: src.base, type: "base" });
    if (src.hasEval) parts.push({ label: "Eval", type: "eval", res: src.evalRes });
    if (src.hasTour) parts.push({ label: "Tour", type: "tour", res: src.tourRes });
    if (parts.length === 0 && client.gingrId) parts.push({ label: "Gingr", type: "gingr" });
    if (parts.length === 0) return <span style={{color:C.textMut}}>—</span>;
    const igniteExpanded = expandedIgnite.has(client.id);
    return (
      <div style={{display:"flex",alignItems:"center",gap:0,flexWrap:"wrap",fontSize:11}}>
        {parts.map((p, i) => (
          <span key={i} style={{display:"inline-flex",alignItems:"center"}}>
            {i > 0 && <span style={{margin:"0 3px",color:C.textMut,fontSize:9}}>→</span>}
            {p.type === "ignite" ? (
              <span style={{display:"inline-flex",alignItems:"center",gap:1,background:igniteExpanded?`#F9731610`:"transparent",border:`1px solid ${igniteExpanded?"#F9731640":"transparent"}`,borderRadius:6,padding:"2px 4px 2px 7px",transition:"all 0.15s"}}>
                {client.igniteData?.igniteProfileId && client.igniteData?.leadId ? (
                  <a href={`https://leads.idigitalstrategies.com/profile/${client.igniteData.igniteProfileId}/leads?lid=${client.igniteData.leadId}`} target="_blank" rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    style={{fontWeight:700,color:"#F97316",textDecoration:"none",fontSize:11}}
                    onMouseEnter={e=>e.currentTarget.style.textDecoration="underline"}
                    onMouseLeave={e=>e.currentTarget.style.textDecoration="none"}>
                    Ignite ↗
                  </a>
                ) : (
                  <span style={{fontWeight:700,color:"#F97316",fontSize:11}}>Ignite</span>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); setExpandedIgnite(prev => { const n=new Set(prev); if(n.has(client.id))n.delete(client.id);else n.add(client.id); return n; }); }}
                  style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:16,height:16,background:"transparent",border:"none",cursor:"pointer",padding:0,color:"#F97316",fontFamily:"inherit"}}>
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" style={{transform:igniteExpanded?"rotate(180deg)":"rotate(0deg)",transition:"transform 0.2s"}}><polyline points="6 9 12 15 18 9"/></svg>
                </button>
              </span>
            ) : p.type === "online" ? (
              <span style={{display:"inline-flex",alignItems:"center",gap:1,background:expandedDraft===client.id?`${C.pri}10`:"transparent",border:`1px solid ${expandedDraft===client.id?C.pri+"40":"transparent"}`,borderRadius:6,padding:"2px 4px 2px 7px",transition:"all 0.15s"}}>
                <span style={{fontWeight:700,color:C.pri,fontSize:11}}>Online</span>
                <button
                  onClick={(e) => { e.stopPropagation(); setExpandedDraft(prev => prev === client.id ? null : client.id); }}
                  style={{display:"inline-flex",alignItems:"center",justifyContent:"center",width:16,height:16,background:"transparent",border:"none",cursor:"pointer",padding:0,color:C.pri,fontFamily:"inherit"}}>
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" style={{transform:expandedDraft===client.id?"rotate(180deg)":"rotate(0deg)",transition:"transform 0.2s"}}><polyline points="6 9 12 15 18 9"/></svg>
                </button>
              </span>
            ) : p.type === "eval" || p.type === "tour" ? (
              <span
                style={{fontWeight:700,color:p.type==="eval"?C.acc:C.info,cursor:"pointer",position:"relative"}}
                onMouseEnter={() => setHoveredSource(`${client.id}_${p.type}`)}
                onMouseLeave={() => setHoveredSource(null)}
              >
                {p.label}
                {hoveredSource === `${client.id}_${p.type}` && (
                  <div style={{position:"absolute",top:"100%",left:0,zIndex:999,background:C.surface,border:`1.5px solid ${C.border}`,borderRadius:10,padding:"10px 14px",minWidth:180,boxShadow:"0 4px 16px rgba(0,0,0,0.10)",whiteSpace:"nowrap"}}>
                    {p.res && <div style={{fontSize:11,color:C.text,marginBottom:4}}>{fmtDate(p.res.checkIn)}</div>}
                    {p.type === "eval" && p.res && (() => {
                      const ev = (data.evaluations||[]).find(e => e.reservationId === p.res.id && e.locked);
                      if (!ev) return null;
                      const rc = ev.result === "green" ? C.suc : ev.result === "yellow" ? C.acc : C.dan;
                      return (
                        <>
                          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
                            <span style={{fontSize:10,fontWeight:700}}>Outcome:</span>
                            <span style={{fontSize:10,fontWeight:800,color:rc,textTransform:"uppercase"}}>{ev.result}</span>
                          </div>
                          <span onClick={(e) => { e.stopPropagation(); nav("evaluation-form", { reservationId: p.res.id }); }} style={{fontSize:10,fontWeight:700,color:C.pri,cursor:"pointer",textDecoration:"underline"}}>View Form</span>
                        </>
                      );
                    })()}
                    {p.type === "tour" && <div style={{fontSize:10,color:C.suc,fontWeight:600}}>Completed</div>}
                  </div>
                )}
              </span>
            ) : (
              <span style={{color:C.text,fontWeight:600}}>{p.label}</span>
            )}
          </span>
        ))}
      </div>
    );
  };

  // ── Dog count cell (clickable accordion trigger) ──
  const renderDogCount = (client) => {
    const s = clientStats[client.id] || {};
    const dogs = data.dogs.filter(d => d.clientId === client.id);
    const isExp = expandedDogs.has(client.id);
    return (
      <button onClick={(e) => { e.stopPropagation(); setExpandedDogs(prev => { const n=new Set(prev); if(n.has(client.id))n.delete(client.id);else n.add(client.id); return n; }); }}
        style={{display:"inline-flex",alignItems:"center",gap:4,background:isExp?`${C.pri}10`:"transparent",border:`1px solid ${isExp?C.pri+"40":"transparent"}`,borderRadius:6,padding:"2px 8px",cursor:dogs.length>0?"pointer":"default",fontFamily:"inherit",fontSize:12,fontWeight:700,color:isExp?C.pri:C.text,transition:"all 0.15s"}}>
        {s.dogCount || 0}
        {dogs.length > 0 && <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" style={{transform:isExp?"rotate(180deg)":"rotate(0deg)",transition:"transform 0.2s"}}><polyline points="6 9 12 15 18 9"/></svg>}
      </button>
    );
  };

  // ── Dog detail row (accordion expansion) ──
  const renderDogDetails = (client) => {
    if (!expandedDogs.has(client.id)) return null;
    const dogs = data.dogs.filter(d => d.clientId === client.id);
    if (dogs.length === 0) return null;
    const calcAge = (dob) => { if (!dob) return "—"; const b=new Date(dob+"T00:00:00"),now=new Date(); let y=now.getFullYear()-b.getFullYear(),m=now.getMonth()-b.getMonth(); if(m<0){y--;m+=12;} return y>0?`${y}y ${m}m`:`${m}m`; };
    return (
      <div style={{padding:"10px 20px 10px 28px",background:C.bg,borderBottom:`1px solid ${C.borderLight}`,borderLeft:`3px solid ${C.pri}`}}>
        {dogs.map(dog => {
          const f = dog.fields || {};
          const sn = f.spayed_neutered || "Unknown";
          return (
            <div key={dog.id} style={{display:"grid",gridTemplateColumns:"1.5fr 1.2fr 0.8fr 0.8fr 1fr",gap:10,padding:"6px 0",borderBottom:`1px solid ${C.borderLight}`,fontSize:11,alignItems:"center"}}>
              <div><span onClick={(e) => { e.stopPropagation(); nav("dog-detail", { clientId: client.id, dogId: dog.id }); }} style={{fontWeight:700,color:C.pri,cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.textDecoration="underline"} onMouseLeave={e=>e.currentTarget.style.textDecoration="none"}>{f.name || "Unknown"}</span></div>
              <div style={{color:C.textSec}}>{f.breed || "—"}</div>
              <div style={{color:C.textSec}}>{calcAge(f.dob)}</div>
              <div style={{color:C.textSec}}>{f.weight ? `${f.weight} lbs` : "—"}</div>
              <div><span style={{fontSize:10,fontWeight:600,padding:"2px 6px",borderRadius:4,background:sn==="Neutered"||sn==="Spayed"?`${C.suc}15`:`${C.acc}15`,color:sn==="Neutered"||sn==="Spayed"?C.suc:C.acc}}>{sn}</span></div>
            </div>
          );
        })}
        <div style={{display:"grid",gridTemplateColumns:"1.5fr 1.2fr 0.8fr 0.8fr 1fr",gap:10,padding:"4px 0 0",fontSize:9,fontWeight:700,color:C.textMut,textTransform:"uppercase",letterSpacing:"0.05em"}}>
          <div>Name</div><div>Breed</div><div>Age</div><div>Weight</div><div>S/N</div>
        </div>
      </div>
    );
  };

  // ── Follow-up cell renderer ──
  const [expandedFollowUp, setExpandedFollowUp] = useState(new Set());
  const renderFollowUp = (client, tab) => {
    const fu = client.lifecycle?.[tab]?.followUpDate;
    if (!fu) return <span style={{color:C.textMut,fontSize:11}}>—</span>;
    const isOverdue = fu < today;
    const isToday = fu === today;
    const d = new Date(fu + "T12:00:00");
    const mmddyy = `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}/${String(d.getFullYear()).slice(-2)}`;
    const dow = d.toLocaleDateString("en-US",{weekday:"long"});
    const isExpFu = expandedFollowUp.has(client.id);
    const toggleFu = (e) => { e.stopPropagation(); setExpandedFollowUp(prev => { const n = new Set(prev); if (n.has(client.id)) n.delete(client.id); else n.add(client.id); return n; }); };
    return (
      <div>
        <div onClick={toggleFu} style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer"}}>
          <div style={{lineHeight:1.3}}>
            <div style={{fontSize:12,fontWeight:600,color:isOverdue?C.dan:isToday?C.suc:C.text}}>{mmddyy}</div>
            <div style={{fontSize:10,color:isOverdue?C.dan:isToday?C.suc:C.textSec,fontWeight:500}}>{dow}</div>
          </div>
          {isOverdue && <span style={{fontSize:9,fontWeight:800,color:C.dan,background:`${C.dan}15`,padding:"1px 5px",borderRadius:4}}>OVERDUE</span>}
          {isToday && <span style={{fontSize:9,fontWeight:800,color:C.suc,background:`${C.suc}15`,padding:"1px 5px",borderRadius:4}}>TODAY</span>}
        </div>
        {isExpFu && client.createdAt && (
          <div style={{marginTop:4,padding:"3px 6px",borderRadius:4,background:C.bg,border:`1px solid ${C.borderLight}`,fontSize:10,color:C.textSec}}>
            <span style={{fontWeight:600}}>Created:</span> {fmtDate(client.createdAt.split("T")[0] || client.createdAt)}
          </div>
        )}
      </div>
    );
  };

  // ── Notes cell (shows last log note with date prefix) ──
  const renderNotes = (client, tab) => {
    const updates = client.lifecycle?.[tab]?.updates || [];
    if (updates.length === 0) {
      // For Ignite leads with no updates yet, show the received date from notes field
      if (client.lifecycle?.conversion?.source === "ignite" && client.fields?.notes) {
        return <span style={{fontSize:11,color:"#F97316",fontWeight:600,whiteSpace:"pre-wrap",wordBreak:"break-word",lineHeight:1.4}}>{client.fields.notes}</span>;
      }
      return <span style={{color:C.textMut,fontSize:11}}>—</span>;
    }
    const last = updates[0]; // most recent
    const dateStr = last.loggedAt ? new Date(last.loggedAt).toLocaleDateString("en-US",{month:"numeric",day:"numeric",year:"2-digit"}) : "";
    return <span style={{fontSize:11,color:C.text,whiteSpace:"pre-wrap",wordBreak:"break-word",lineHeight:1.4}}>{dateStr ? `${dateStr}: ` : ""}{last.notes}</span>;
  };

  // ── Updates/Log cell ──
  const renderUpdatesLog = (client, tab) => {
    const updates = client.lifecycle?.[tab]?.updates || [];
    const isExpanded = expandedUpdates.has(client.id);
    return (
      <div style={{display:"flex",alignItems:"center",gap:6}}>
        <button onClick={(e) => { e.stopPropagation(); setExpandedUpdates(prev => { const n=new Set(prev); if(n.has(client.id))n.delete(client.id);else n.add(client.id); return n; }); }}
          style={{display:"inline-flex",alignItems:"center",justifyContent:"center",minWidth:22,height:22,padding:"0 6px",borderRadius:8,fontSize:11,fontWeight:800,border:"none",cursor:"pointer",fontFamily:"inherit",
            background:updates.length>0?`${C.acc}20`:C.bg,color:updates.length>0?C.acc:C.textMut}}>
          {updates.length}
        </button>
        <button ref={el => { if(el) logBtnRef.current[client.id] = el; }}
          onClick={(e) => { e.stopPropagation(); const rect=e.currentTarget.getBoundingClientRect(); setLogPopover({ clientId:client.id, tab, x:rect.left, y:rect.bottom+4 }); setLogNotes(client.lifecycle?.[tab]?.notes||""); setLogDate(""); }}
          style={{padding:"3px 8px",borderRadius:6,border:`1px solid ${C.pri}30`,background:`${C.pri}08`,color:C.pri,fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
          Log
        </button>
      </div>
    );
  };

  // ── Cold button cell ──
  const renderColdBtn = (client) => (
    <button onClick={(e) => { e.stopPropagation(); markCold(client.id); }}
      style={{padding:"3px 8px",borderRadius:6,border:`1px solid ${C.dan}30`,background:`${C.dan}08`,color:C.dan,fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
      Cold
    </button>
  );

  // ── Revive button cell ──
  const renderReviveBtn = (client) => (
    <button onClick={(e) => { e.stopPropagation(); const rect=e.currentTarget.getBoundingClientRect(); const cf=client.lifecycle?.coldFrom||"leads"; setLogPopover({ clientId:client.id, tab:(cf==="lapsed"||cf==="retention")?"retention":"conversion", isRevive:true, x:rect.left, y:rect.bottom+4 }); setLogNotes(""); setLogDate(""); }}
      style={{padding:"3px 8px",borderRadius:6,border:`1px solid ${C.suc}30`,background:`${C.suc}08`,color:C.suc,fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
      Revive
    </button>
  );

  // ── Client name cell (clickable) ──
  const renderName = (client) => {
    const fn = client.fields.first_name || "";
    const ln = client.fields.last_name || "";
    return (
      <span style={{display:"inline-flex",alignItems:"center",gap:4}}>
        <span onClick={(e) => { e.stopPropagation(); nav("client-detail",{clientId:client.id}); }}
          style={{fontWeight:700,color:C.pri,cursor:"pointer",fontSize:12}}
          onMouseEnter={e=>e.currentTarget.style.textDecoration="underline"}
          onMouseLeave={e=>e.currentTarget.style.textDecoration="none"}>
          {fn} {ln}
        </span>
        {client.isLiteClient && <span style={{fontSize:8,fontWeight:700,color:C.textMut,background:C.bg,border:`1px solid ${C.border}`,borderRadius:4,padding:"1px 4px",letterSpacing:"0.04em",textTransform:"uppercase",lineHeight:1}}>NEW</span>}
      </span>
    );
  };

  // ── Grid templates per tab ──
  const getGrid = () => {
    // Consistent base: Client(1.4fr), Phone(1fr), Dogs(45px), Created(75px) — then tab-specific data columns
    if (activeTab === "leads" || activeTab === "oldGingrSync") return "minmax(110px,1.4fr) minmax(75px,1fr) 45px 75px minmax(55px,0.7fr) minmax(60px,0.7fr) minmax(70px,0.8fr) minmax(80px,1fr) minmax(80px,1fr) minmax(70px,0.8fr) 50px";
    if (activeTab === "lapsed") return "minmax(100px,1.3fr) minmax(75px,1fr) 45px 75px minmax(70px,0.8fr) minmax(70px,0.8fr) minmax(80px,1fr) minmax(70px,0.8fr) minmax(60px,0.7fr) minmax(55px,0.6fr) 50px 50px";
    if (activeTab === "cold") return "minmax(110px,1.4fr) minmax(75px,1fr) 45px 75px minmax(80px,1fr) minmax(80px,1fr) minmax(100px,1.2fr) 60px";
    // Active / All — Client, Phone, Dogs, Created
    const base = "minmax(120px,1.4fr) minmax(80px,1fr) 45px 75px";
    const dataCols = shownDataCols.map(k => {
      if (k==="lastRes"||k==="nextRes") return "minmax(70px,0.8fr)";
      return "minmax(50px,0.6fr)";
    }).join(" ");
    return `${base} ${dataCols}`;
  };

  // ── Render ──
  if (data.loading) return (
    <div style={{padding:"60px 28px",textAlign:"center"}}>
      <K9LoadingAnimation size={56} message="Loading client data..." subMessage="Fetching from cache" />
    </div>
  );

  return (
    <div style={{padding:"24px 28px",maxWidth:1400,margin:"0 auto"}}>
      {/* Page Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
        <div>
          <h1 style={{margin:0,fontSize:24,fontWeight:800,color:C.text,letterSpacing:"-0.02em"}}>Customer Lifecycle</h1>
          <p style={{margin:"4px 0 0",fontSize:13,color:C.textSec}}>{data.clients.length} total clients{search?` — ${activeList.length} shown`:""}</p>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <button onClick={() => setLcFilterOpen(v => !v)}
            style={{display:"flex",alignItems:"center",gap:6,padding:"8px 14px",borderRadius:8,border:`1.5px solid ${activeFilterCount>0?C.pri:C.border}`,background:activeFilterCount>0?C.priLt:"transparent",color:activeFilterCount>0?C.pri:C.textSec,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s"}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
            Filter{activeFilterCount>0 && <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",minWidth:18,height:18,padding:"0 5px",borderRadius:9,fontSize:10,fontWeight:800,background:C.pri,color:"#fff"}}>{activeFilterCount}</span>}
          </button>
          {activeFilterCount > 0 && (
            <button onClick={() => { setShowBulkUpdate(true); setBulkReason(""); }}
              style={{display:"flex",alignItems:"center",gap:6,padding:"8px 14px",borderRadius:8,border:`1.5px solid ${C.dan}40`,background:`${C.dan}08`,color:C.dan,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s"}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M2 12h20"/></svg>
              Bulk Update ({activeList.length})
            </button>
          )}
          <Btn variant="ghost" onClick={() => {
            // Export current lifecycle tab to CSV
            const headers = (activeTab === "leads" || activeTab === "oldGingrSync")
              ? ["First Name","Last Name","Phone","Email","Dogs","Source","Follow-Up Date","Notes"]
              : activeTab === "active"
              ? ["First Name","Last Name","Phone","Email","Dogs","Reservations","Last Visit","Days Since","Total Spent"]
              : activeTab === "cold"
              ? ["First Name","Last Name","Phone","Email","Dogs","Cold Date","Previous Stage"]
              : ["First Name","Last Name","Phone","Email","Dogs"];
            const rows = activeList.map(c => {
              const f = c.fields || {};
              const dogs = (data.dogs || []).filter(d => d.clientId === c.id).map(d => d.fields?.name).join(", ");
              const base = [f.first_name||"", f.last_name||"", f.phone||"", f.email||"", dogs];
              if (activeTab === "leads" || activeTab === "oldGingrSync") {
                const lc = c.lifecycle?.conversion || {};
                return [...base, c.referralSource || "", lc.followUpDate || "", lc.notes || ""];
              } else if (activeTab === "active") {
                const resCount = (data.reservations || []).filter(r => r.clientId === c.id).length;
                const lastRes = (data.reservations || []).filter(r => r.clientId === c.id).sort((a,b) => (b.checkIn||"").localeCompare(a.checkIn||""))[0];
                const daysSince = lastRes ? Math.floor((new Date(todayStr()+"T12:00:00") - new Date(lastRes.checkIn+"T12:00:00")) / 86400000) : "";
                const totalSpent = (data.payments || []).filter(p => p.clientId === c.id).reduce((s,p) => s + (p.amount||0), 0);
                return [...base, resCount, lastRes?.checkIn || "", daysSince, "$" + totalSpent.toFixed(2)];
              } else if (activeTab === "cold") {
                return [...base, c.lifecycle?.coldDate || "", c.lifecycle?.coldFrom || ""];
              }
              return base;
            });
            const csvContent = [headers.join(","), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(","))].join("\n");
            const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a"); a.href = url; a.download = `lifecycle-${activeTab}-${todayStr()}.csv`; a.click();
            URL.revokeObjectURL(url);
            addGlobalToast?.({ message: `Exported ${rows.length} clients to CSV`, type: "success" });
          }}>
            <I.Download /> Export CSV
          </Btn>
          <Btn onClick={() => nav("new-client")}>+ New Client</Btn>
        </div>
      </div>

      {/* ═══ BULK UPDATE MODAL ═══ */}
      {showBulkUpdate && (() => {
        const isAdmin = profile?.role === "owner" || profile?.role === "enterprise_admin";
        if (!isAdmin) return <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>setShowBulkUpdate(false)}>
          <div style={{background:"#fff",borderRadius:16,padding:32,maxWidth:400}} onClick={e=>e.stopPropagation()}>
            <p style={{margin:0,color:C.text,fontWeight:600}}>Only admins can perform bulk updates.</p>
            <button onClick={()=>setShowBulkUpdate(false)} style={{marginTop:16,padding:"8px 20px",borderRadius:8,border:"none",background:C.pri,color:"#fff",fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>OK</button>
          </div>
        </div>;

        const handleBulkCold = async () => {
          if (!bulkReason.trim()) return;
          setBulkProcessing(true);
          const today = todayStr();
          const ids = activeList.map(c => c.id);
          const newClients = data.clients.map(c => {
            if (!ids.includes(c.id)) return c;
            return {
              ...c,
              lifecycle: { ...(c.lifecycle || {}), cold: true, coldDate: today, coldFrom: activeTab === "lapsed" ? "lapsed" : "leads", coldReason: bulkReason.trim() },
              lifecycleEvents: [...(c.lifecycleEvents || []), { event: "bulk_marked_cold", date: today, details: `Bulk marked as cold: ${bulkReason.trim()}` }],
            };
          });
          await save({ ...data, clients: newClients });
          setShowBulkUpdate(false);
          setBulkProcessing(false);
          addGlobalToast?.({ message: `${ids.length} clients marked as cold`, type: "success" });
        };

        return (
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(4px)"}} onClick={()=>setShowBulkUpdate(false)}>
            <div style={{background:"#fff",borderRadius:16,padding:32,maxWidth:480,width:"90%",boxShadow:"0 20px 60px rgba(0,0,0,0.2)",animation:"filterFadeIn 0.2s ease-out"}} onClick={e=>e.stopPropagation()}>
              <h3 style={{margin:"0 0 4px",fontSize:18,fontWeight:800,color:C.text}}>Bulk Update</h3>
              <p style={{margin:"0 0 20px",fontSize:13,color:C.textSec}}>
                This will mark <strong style={{color:C.dan}}>{activeList.length} filtered clients</strong> as Cold.
              </p>

              <label style={{display:"block",fontSize:12,fontWeight:700,color:C.text,marginBottom:6}}>Reason <span style={{color:C.dan}}>*</span></label>
              <textarea
                value={bulkReason} onChange={e => setBulkReason(e.target.value)}
                placeholder="e.g. Legacy clients older than 6 months with no activity — likely lost"
                rows={3}
                style={{width:"100%",padding:"10px 12px",borderRadius:8,border:`1.5px solid ${C.border}`,fontSize:13,fontFamily:"inherit",resize:"vertical",outline:"none",boxSizing:"border-box",transition:"border-color 0.15s"}}
                onFocus={e=>e.target.style.borderColor=C.pri}
                onBlur={e=>e.target.style.borderColor=C.border}
              />
              <p style={{margin:"8px 0 20px",fontSize:11,color:C.textMut}}>This reason will be stored on each client record for audit purposes.</p>

              <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
                <button onClick={()=>setShowBulkUpdate(false)}
                  style={{padding:"10px 20px",borderRadius:8,border:`1.5px solid ${C.border}`,background:"transparent",color:C.textSec,fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                  Cancel
                </button>
                <button onClick={handleBulkCold} disabled={!bulkReason.trim() || bulkProcessing}
                  style={{padding:"10px 20px",borderRadius:8,border:"none",background:bulkReason.trim()?C.dan:"#ccc",color:"#fff",fontSize:13,fontWeight:700,cursor:bulkReason.trim()?"pointer":"not-allowed",fontFamily:"inherit",opacity:bulkProcessing?0.6:1,transition:"all 0.15s"}}>
                  {bulkProcessing ? "Processing..." : `Mark ${activeList.length} as Cold`}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ═══ FILTER PANEL ═══ */}
      {lcFilterOpen && (() => {
        const isAdmin = profile?.role === "owner" || profile?.role === "enterprise_admin";
        const views = savedViews;
        const usedKeys = Object.keys(draftFilters);
        const availableFields = LC_FILTER_FIELDS.filter(f => !usedKeys.includes(f.key));
        const sections = [...new Set(LC_FILTER_FIELDS.map(f => f.section))];
        const removeFilter = (key) => { setDraftFilters(prev => { const n = { ...prev }; delete n[key]; return n; }); if (configuringKey === key) setConfiguringKey(null); };
        const updateFilter = (key, field, val) => { setDraftFilters(prev => ({ ...prev, [key]: { ...prev[key], [field]: val } })); };
        const applyFilters = () => { setLcFilters(draftFilters); setLcFilterOpen(false); setShowFilterPicker(false); setConfiguringKey(null); };
        const clearAll = () => { setDraftFilters({}); setLcFilters({}); setConfiguringKey(null); setShowFilterPicker(false); };
        const needsValue = (op) => !["empty","notEmpty","has","missing","overdue","today","thisWeek","hasDate","noDate"].includes(op);
        const saveView = async () => {
          if (!viewName.trim()) return;
          const newView = { id: Date.now().toString(36), name: viewName.trim(), filters: { ...draftFilters }, tab: activeTab, createdBy: profile?.id || "unknown", createdAt: new Date().toISOString() };
          await persistViews([...savedViews, newView]);
          setActiveViewId(newView.id); setViewName(""); setShowSaveView(false);
          addGlobalToast?.({ message: `View "${newView.name}" saved`, type: "success" });
        };
        const deleteView = async (viewId) => {
          await persistViews(savedViews.filter(v => v.id !== viewId));
          if (activeViewId === viewId) setActiveViewId(null);
          addGlobalToast?.({ message: "View deleted" });
        };
        const loadView = (view) => {
          setDraftFilters({ ...view.filters }); setLcFilters({ ...view.filters }); setActiveViewId(view.id);
          if (view.tab) setActiveTab(view.tab);
          setShowFilterPicker(false); setConfiguringKey(null);
        };
        const selectField = (key) => {
          const fd = LC_FILTER_FIELDS.find(f => f.key === key);
          if (!fd) return;
          // If only one op and it doesn't need a value, just add it directly
          if (fd.ops.length === 1 && !needsValue(fd.ops[0])) {
            setDraftFilters(prev => ({ ...prev, [key]: { op: fd.ops[0], val: "" } }));
            setShowFilterPicker(false); setConfiguringKey(null);
            return;
          }
          setDraftFilters(prev => ({ ...prev, [key]: { op: fd.ops[0], val: "" } }));
          setConfiguringKey(key); setConfigStep(0);
        };
        const confirmConfig = () => { setConfiguringKey(null); setShowFilterPicker(false); };
        const sectionIcons = {
          "Client Info": <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
          "Activity": <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
          "Services": <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
          "Lifecycle": <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
        };
        const cfgFd = configuringKey ? LC_FILTER_FIELDS.find(f => f.key === configuringKey) : null;
        const cfgVal = configuringKey ? draftFilters[configuringKey] : null;
        let fieldIdx = 0;
        return (
          <div style={{marginBottom:16,borderRadius:14,border:`1.5px solid ${C.border}`,background:C.bg,boxShadow:"0 8px 40px rgba(0,0,0,0.08)",overflow:"hidden"}}>
            <style>{`
              @keyframes filterSlideIn { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }
              @keyframes filterFadeIn { from { opacity:0; transform:scale(0.95); } to { opacity:1; transform:scale(1); } }
              @keyframes filterChipIn { from { opacity:0; transform:translateX(-6px) scale(0.9); } to { opacity:1; transform:translateX(0) scale(1); } }
              @keyframes filterPulse { 0%,100% { box-shadow:0 0 0 0 rgba(20,83,45,0.15); } 50% { box-shadow:0 0 0 4px rgba(20,83,45,0.08); } }
              @keyframes configSlide { from { opacity:0; max-height:0; transform:translateY(-4px); } to { opacity:1; max-height:200px; transform:translateY(0); } }
            `}</style>

            {/* ── Saved Views Bar ── */}
            {views.length > 0 && (
              <div style={{display:"flex",alignItems:"center",gap:6,padding:"10px 16px",borderBottom:`1px solid ${C.borderLight}`,background:C.surface,flexWrap:"wrap",animation:"filterSlideIn 0.2s ease-out"}}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.textMut} strokeWidth="2" strokeLinecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                <span style={{fontSize:10,fontWeight:800,color:C.textMut,textTransform:"uppercase",letterSpacing:"0.08em"}}>Saved Views</span>
                <div style={{width:1,height:16,background:C.border,margin:"0 2px"}}/>
                {views.map((v,vi) => (
                  <div key={v.id} style={{display:"inline-flex",alignItems:"center",gap:2,animation:`filterChipIn 0.25s ease-out ${vi*0.05}s both`}}>
                    <button onClick={() => loadView(v)}
                      style={{padding:"5px 12px",borderRadius:8,border:`1.5px solid ${activeViewId===v.id?C.pri:C.borderLight}`,background:activeViewId===v.id?C.pri:"#fff",color:activeViewId===v.id?"#fff":C.text,fontSize:11,fontWeight:activeViewId===v.id?700:500,cursor:"pointer",fontFamily:"inherit",transition:"all 0.2s cubic-bezier(0.2,0.8,0.2,1)",boxShadow:activeViewId===v.id?"0 2px 8px rgba(20,83,45,0.2)":"0 1px 3px rgba(0,0,0,0.04)"}}
                      onMouseEnter={e=>{if(activeViewId!==v.id){e.currentTarget.style.borderColor=C.pri;e.currentTarget.style.color=C.pri;}}}
                      onMouseLeave={e=>{if(activeViewId!==v.id){e.currentTarget.style.borderColor=C.borderLight;e.currentTarget.style.color=C.text;}}}>
                      {v.name}
                      {activeViewId===v.id && <span style={{marginLeft:4,fontSize:9}}>({Object.keys(v.filters).length})</span>}
                    </button>
                    {isAdmin && <button onClick={() => deleteView(v.id)} style={{border:"none",background:"none",cursor:"pointer",color:C.textMut,padding:"2px",display:"flex",opacity:0,transition:"opacity 0.15s"}}
                      onMouseEnter={e=>e.currentTarget.style.opacity="1"} onMouseLeave={e=>e.currentTarget.style.opacity="0"} title="Delete view">
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>}
                  </div>
                ))}
                {activeViewId && <button onClick={() => { setActiveViewId(null); setDraftFilters({}); setLcFilters({}); }}
                  style={{fontSize:10,fontWeight:600,color:C.dan,border:"none",background:"none",cursor:"pointer",fontFamily:"inherit",marginLeft:4,opacity:0.7,transition:"opacity 0.15s"}}
                  onMouseEnter={e=>e.currentTarget.style.opacity="1"} onMouseLeave={e=>e.currentTarget.style.opacity="0.7"}>Clear</button>}
              </div>
            )}

            {/* ── Active Filter Chips ── */}
            <div style={{padding:"14px 18px",minHeight:48}}>
              {usedKeys.length === 0 && !showFilterPicker && (
                <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:"12px 0",animation:"filterFadeIn 0.2s ease-out"}}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.textMut} strokeWidth="1.5" strokeLinecap="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
                  <span style={{fontSize:13,color:C.textMut,fontWeight:500}}>No filters active</span>
                </div>
              )}

              {usedKeys.length > 0 && (
                <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:showFilterPicker?12:0}}>
                  {usedKeys.map((key, i) => {
                    const fd = LC_FILTER_FIELDS.find(f => f.key === key);
                    if (!fd) return null;
                    const f = draftFilters[key];
                    const isConfiguring = configuringKey === key;
                    return (
                      <div key={key} style={{animation:`filterChipIn 0.2s ease-out ${i*0.04}s both`}}>
                        <div style={{display:"inline-flex",alignItems:"center",gap:0,borderRadius:10,border:`1.5px solid ${isConfiguring?C.pri:C.border}`,background:isConfiguring?`${C.pri}06`:"#fff",boxShadow:isConfiguring?"0 0 0 3px rgba(20,83,45,0.06)":"0 1px 3px rgba(0,0,0,0.04)",transition:"all 0.25s cubic-bezier(0.2,0.8,0.2,1)",overflow:"hidden"}}>
                          {/* Field name */}
                          <button onClick={() => { setConfiguringKey(isConfiguring?null:key); setConfigStep(0); setShowFilterPicker(false); }}
                            style={{padding:"6px 10px",border:"none",background:"transparent",cursor:"pointer",fontFamily:"inherit",fontSize:11,fontWeight:700,color:C.pri,whiteSpace:"nowrap",transition:"background 0.15s"}}
                            onMouseEnter={e=>e.currentTarget.style.background=`${C.pri}08`} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                            {fd.label}
                          </button>
                          {/* Operator pill */}
                          <div style={{padding:"6px 0",display:"flex",alignItems:"center"}}>
                            <span style={{padding:"2px 8px",borderRadius:6,background:`${C.pri}12`,fontSize:10,fontWeight:700,color:C.pri,whiteSpace:"nowrap"}}>{LC_OP_LABELS[f.op]||f.op}</span>
                          </div>
                          {/* Value */}
                          {needsValue(f.op) && f.val !== "" && (
                            <span style={{padding:"6px 8px 6px 4px",fontSize:11,fontWeight:600,color:C.text,whiteSpace:"nowrap"}}>{fd.type==="currency"?"$":""}{f.val}</span>
                          )}
                          {needsValue(f.op) && f.val === "" && (
                            <span style={{padding:"6px 8px 6px 4px",fontSize:11,fontWeight:500,color:C.dan,fontStyle:"italic",whiteSpace:"nowrap"}}>set value</span>
                          )}
                          {/* Remove X */}
                          <button onClick={(e) => { e.stopPropagation(); removeFilter(key); }}
                            style={{padding:"6px 8px 6px 2px",border:"none",background:"transparent",cursor:"pointer",display:"flex",alignItems:"center",color:C.textMut,transition:"color 0.15s"}}
                            onMouseEnter={e=>e.currentTarget.style.color=C.dan} onMouseLeave={e=>e.currentTarget.style.color=C.textMut}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                          </button>
                        </div>

                        {/* ── Inline Config Popover ── */}
                        {isConfiguring && (
                          <div style={{marginTop:6,padding:"10px 14px",borderRadius:10,background:"#fff",border:`1.5px solid ${C.pri}30`,boxShadow:"0 6px 24px rgba(20,83,45,0.1)",animation:"configSlide 0.25s ease-out",overflow:"hidden"}}>
                            {/* Operator pills */}
                            <div style={{marginBottom:needsValue(f.op)?10:0}}>
                              <div style={{fontSize:9,fontWeight:800,color:C.textMut,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:6}}>Condition</div>
                              <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                                {fd.ops.map((op,oi) => (
                                  <button key={op} onClick={() => { updateFilter(key,"op",op); if(!needsValue(op)) updateFilter(key,"val",""); }}
                                    style={{padding:"5px 12px",borderRadius:8,border:`1.5px solid ${f.op===op?C.pri:C.borderLight}`,background:f.op===op?C.pri:"#fff",color:f.op===op?"#fff":C.text,fontSize:11,fontWeight:f.op===op?700:500,cursor:"pointer",fontFamily:"inherit",transition:"all 0.2s cubic-bezier(0.2,0.8,0.2,1)",boxShadow:f.op===op?"0 2px 8px rgba(20,83,45,0.15)":"none",animation:`filterFadeIn 0.2s ease-out ${oi*0.03}s both`}}
                                    onMouseEnter={e=>{if(f.op!==op){e.currentTarget.style.borderColor=C.pri;e.currentTarget.style.background=`${C.pri}06`;}}}
                                    onMouseLeave={e=>{if(f.op!==op){e.currentTarget.style.borderColor=C.borderLight;e.currentTarget.style.background="#fff";}}}>
                                    {LC_OP_LABELS[op]||op}
                                  </button>
                                ))}
                              </div>
                            </div>
                            {/* Value input */}
                            {needsValue(f.op) && (
                              <div style={{animation:"filterFadeIn 0.2s ease-out 0.1s both"}}>
                                <div style={{fontSize:9,fontWeight:800,color:C.textMut,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:6}}>Value</div>
                                {fd.type === "select" ? (
                                  <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                                    {(fd.options||[]).map((o,oi) => (
                                      <button key={o} onClick={() => updateFilter(key,"val",o)}
                                        style={{padding:"5px 12px",borderRadius:8,border:`1.5px solid ${f.val===o?C.pri:C.borderLight}`,background:f.val===o?C.pri:"#fff",color:f.val===o?"#fff":C.text,fontSize:11,fontWeight:f.val===o?700:500,cursor:"pointer",fontFamily:"inherit",transition:"all 0.2s cubic-bezier(0.2,0.8,0.2,1)",animation:`filterFadeIn 0.15s ease-out ${oi*0.03}s both`}}
                                        onMouseEnter={e=>{if(f.val!==o){e.currentTarget.style.borderColor=C.pri;}}}
                                        onMouseLeave={e=>{if(f.val!==o){e.currentTarget.style.borderColor=C.borderLight;}}}>
                                        {o || "(none)"}
                                      </button>
                                    ))}
                                  </div>
                                ) : (
                                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                                    {fd.type==="currency" && <span style={{fontSize:13,fontWeight:700,color:C.textMut}}>$</span>}
                                    <input
                                      type={fd.type==="date"?(f.op==="inLastDays"?"number":"date"):fd.type==="number"||fd.type==="currency"?"number":"text"}
                                      value={f.val}
                                      onChange={e => updateFilter(key,"val",e.target.value)}
                                      onKeyDown={e => { if (e.key==="Enter") confirmConfig(); }}
                                      placeholder={f.op==="inLastDays"?"Number of days":fd.type==="date"?"YYYY-MM-DD":fd.type==="currency"?"Amount":"Type a value..."}
                                      autoFocus
                                      style={{padding:"8px 12px",borderRadius:8,border:`1.5px solid ${C.border}`,fontSize:13,fontFamily:"inherit",background:"#fff",color:C.text,width:"100%",maxWidth:220,transition:"border-color 0.2s",outline:"none"}}
                                      onFocus={e=>e.currentTarget.style.borderColor=C.pri}
                                      onBlur={e=>e.currentTarget.style.borderColor=C.border}
                                    />
                                    <button onClick={confirmConfig}
                                      style={{padding:"8px 14px",borderRadius:8,border:"none",background:C.pri,color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",transition:"all 0.15s",boxShadow:"0 2px 8px rgba(20,83,45,0.15)"}}>
                                      Done
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                            {!needsValue(f.op) && (
                              <button onClick={confirmConfig}
                                style={{marginTop:8,padding:"6px 14px",borderRadius:8,border:"none",background:C.pri,color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",animation:"filterFadeIn 0.2s ease-out",boxShadow:"0 2px 8px rgba(20,83,45,0.15)"}}>
                                Done
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── Add Filter Button / Cascading Field Picker ── */}
              {!showFilterPicker ? (
                <div style={{marginTop:usedKeys.length>0?8:0,animation:"filterFadeIn 0.2s ease-out"}}>
                  <button onClick={() => { setShowFilterPicker(true); setFilterPickerReady(false); setConfiguringKey(null); setTimeout(()=>setFilterPickerReady(true),10); }}
                    disabled={availableFields.length===0}
                    style={{padding:"8px 16px",borderRadius:10,border:`1.5px dashed ${availableFields.length>0?C.pri:C.border}`,background:"transparent",color:availableFields.length>0?C.pri:C.textMut,fontSize:12,fontWeight:700,cursor:availableFields.length>0?"pointer":"default",fontFamily:"inherit",transition:"all 0.2s",display:"flex",alignItems:"center",gap:6}}
                    onMouseEnter={e=>{if(availableFields.length>0){e.currentTarget.style.background=`${C.pri}06`;e.currentTarget.style.borderColor=C.pri;}}}
                    onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.borderColor=availableFields.length>0?C.pri:C.border;}}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Add Filter
                  </button>
                </div>
              ) : (
                <div style={{marginTop:usedKeys.length>0?8:0,borderRadius:12,border:`1.5px solid ${C.borderLight}`,background:"#fff",boxShadow:"0 4px 20px rgba(0,0,0,0.06)",overflow:"hidden",animation:"filterSlideIn 0.25s ease-out"}}>
                  {/* Close picker bar */}
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 14px",borderBottom:`1px solid ${C.borderLight}`,background:C.surface}}>
                    <span style={{fontSize:11,fontWeight:700,color:C.text}}>Choose a filter</span>
                    <button onClick={()=>setShowFilterPicker(false)} style={{border:"none",background:"none",cursor:"pointer",color:C.textMut,padding:2,display:"flex",transition:"color 0.15s"}}
                      onMouseEnter={e=>e.currentTarget.style.color=C.text} onMouseLeave={e=>e.currentTarget.style.color=C.textMut}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                  {/* Sections with cascading fields */}
                  <div style={{padding:"6px 0"}}>
                    {sections.map((sec, si) => {
                      const secFields = availableFields.filter(f => f.section === sec);
                      if (secFields.length === 0) return null;
                      return (
                        <div key={sec}>
                          <div style={{padding:"8px 16px 4px",fontSize:9,fontWeight:800,color:C.textMut,textTransform:"uppercase",letterSpacing:"0.1em",display:"flex",alignItems:"center",gap:6,animation:filterPickerReady?`filterFadeIn 0.2s ease-out ${si*0.06}s both`:"none"}}>
                            {sectionIcons[sec]||null} {sec}
                          </div>
                          <div style={{display:"flex",flexWrap:"wrap",gap:5,padding:"4px 16px 8px"}}>
                            {secFields.map((f,fi) => {
                              const delay = si * 0.06 + fi * 0.03 + 0.05;
                              fieldIdx++;
                              return (
                                <button key={f.key} onClick={() => { selectField(f.key); setShowFilterPicker(false); }}
                                  style={{padding:"6px 14px",borderRadius:8,border:`1.5px solid ${C.borderLight}`,background:"#fff",color:C.text,fontSize:11,fontWeight:500,cursor:"pointer",fontFamily:"inherit",transition:"all 0.2s cubic-bezier(0.2,0.8,0.2,1)",boxShadow:"0 1px 3px rgba(0,0,0,0.03)",animation:filterPickerReady?`filterChipIn 0.25s ease-out ${delay}s both`:"none"}}
                                  onMouseEnter={e=>{e.currentTarget.style.borderColor=C.pri;e.currentTarget.style.background=`${C.pri}06`;e.currentTarget.style.color=C.pri;e.currentTarget.style.transform="translateY(-1px)";e.currentTarget.style.boxShadow="0 3px 12px rgba(20,83,45,0.1)";}}
                                  onMouseLeave={e=>{e.currentTarget.style.borderColor=C.borderLight;e.currentTarget.style.background="#fff";e.currentTarget.style.color=C.text;e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow="0 1px 3px rgba(0,0,0,0.03)";}}>
                                  {f.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* ── Bottom Action Bar ── */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,padding:"10px 18px",borderTop:`1px solid ${C.borderLight}`,background:C.surface}}>
              <div style={{display:"flex",gap:6}}>
                <button onClick={applyFilters}
                  style={{padding:"8px 20px",borderRadius:10,border:"none",background:C.pri,color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",transition:"all 0.2s cubic-bezier(0.2,0.8,0.2,1)",boxShadow:"0 2px 12px rgba(20,83,45,0.2)"}}
                  onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-1px)";e.currentTarget.style.boxShadow="0 4px 16px rgba(20,83,45,0.25)";}}
                  onMouseLeave={e=>{e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow="0 2px 12px rgba(20,83,45,0.2)";}}>
                  Apply{usedKeys.length>0?` (${usedKeys.length})`:""}
                </button>
                {usedKeys.length > 0 && (
                  <button onClick={clearAll}
                    style={{padding:"8px 14px",borderRadius:10,border:`1.5px solid ${C.border}`,background:"transparent",color:C.textSec,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s"}}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor=C.dan;e.currentTarget.style.color=C.dan;}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.color=C.textSec;}}>
                    Clear All
                  </button>
                )}
                <button onClick={() => { setLcFilterOpen(false); setShowFilterPicker(false); setConfiguringKey(null); }}
                  style={{padding:"8px 14px",borderRadius:10,border:`1.5px solid ${C.borderLight}`,background:"transparent",color:C.textMut,fontSize:12,fontWeight:500,cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s"}}
                  onMouseEnter={e=>e.currentTarget.style.color=C.text} onMouseLeave={e=>e.currentTarget.style.color=C.textMut}>
                  Close
                </button>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                {isAdmin && !showSaveView && usedKeys.length > 0 && (
                  <button onClick={() => setShowSaveView(true)}
                    style={{padding:"7px 14px",borderRadius:10,border:`1.5px solid ${C.borderLight}`,background:"#fff",color:C.text,fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:5,transition:"all 0.2s",boxShadow:"0 1px 4px rgba(0,0,0,0.04)"}}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor=C.pri;e.currentTarget.style.color=C.pri;e.currentTarget.style.transform="translateY(-1px)";}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor=C.borderLight;e.currentTarget.style.color=C.text;e.currentTarget.style.transform="translateY(0)";}}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                    Save as View
                  </button>
                )}
                {showSaveView && (
                  <div style={{display:"flex",alignItems:"center",gap:6,animation:"filterFadeIn 0.2s ease-out"}}>
                    <input value={viewName} onChange={e => setViewName(e.target.value)} placeholder="View name..."
                      autoFocus onKeyDown={e => { if (e.key === "Enter") saveView(); if (e.key === "Escape") setShowSaveView(false); }}
                      style={{padding:"7px 12px",borderRadius:8,border:`1.5px solid ${C.border}`,fontSize:12,fontFamily:"inherit",width:160,background:"#fff",color:C.text,transition:"border-color 0.2s",outline:"none"}}
                      onFocus={e=>e.currentTarget.style.borderColor=C.pri} onBlur={e=>e.currentTarget.style.borderColor=C.border} />
                    <button onClick={saveView} disabled={!viewName.trim()}
                      style={{padding:"7px 16px",borderRadius:8,border:"none",background:viewName.trim()?C.suc:C.textMut,color:"#fff",fontSize:11,fontWeight:700,cursor:viewName.trim()?"pointer":"default",fontFamily:"inherit",transition:"all 0.2s",boxShadow:viewName.trim()?"0 2px 8px rgba(22,163,74,0.2)":"none"}}>
                      Save
                    </button>
                    <button onClick={() => setShowSaveView(false)} style={{border:"none",background:"none",cursor:"pointer",color:C.textMut,padding:2,display:"flex"}}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Main Card */}
      <Card style={{padding:0,overflow:"hidden"}}>
        {/* Search Bar */}
        <div style={{borderBottom:`1.5px solid ${C.borderLight}`,background:C.bg,transition:"border-color 0.15s"}}
          onFocus={e=>e.currentTarget.style.borderBottomColor=C.pri} onBlur={e=>e.currentTarget.style.borderBottomColor=C.borderLight}>
          <div style={{display:"flex",alignItems:"center",padding:"0 16px"}}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={search?C.pri:C.textMut} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Search by client name, dog name, or phone…"
              className="no-focus-ring"
              style={{border:"none",outline:"none",background:"transparent",fontSize:13,fontWeight:500,color:C.text,padding:"12px 10px",width:"100%",fontFamily:"inherit"}} />
            {search && <button onClick={()=>setSearch("")} style={{border:"none",background:"none",cursor:"pointer",color:C.textMut,padding:2,display:"flex"}} title="Clear"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>}
            {/* Filter pills area */}
            <div style={{display:"flex",gap:4,marginLeft:8,flexShrink:0}}>
              {(activeTab === "leads" || activeTab === "oldGingrSync") && <>
                {[{id:"eval",label:"Eval",color:C.acc},{id:"tour",label:"Tour",color:C.info},{id:"ignite",label:"Ignite",color:"#F97316"}].map(f => {
                  const on = sourceFilter.has(f.id);
                  return <button key={f.id} onClick={()=>toggleSourceFilter(f.id)} style={{padding:"4px 10px",borderRadius:8,border:`1.5px solid ${on?f.color:C.border}`,background:on?f.color:"transparent",color:on?"#fff":C.textMut,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s",whiteSpace:"nowrap"}}>{f.label}</button>;
                })}
                {sourceFilter.size > 0 && <button onClick={()=>setSourceFilter(new Set())} style={{border:"none",background:"none",cursor:"pointer",color:C.textMut,padding:"0 2px",display:"flex",alignItems:"center"}} title="Clear"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>}
                <div style={{width:1,height:20,background:C.border,margin:"0 4px",flexShrink:0}} />
              </>}
              {(activeTab === "leads" || activeTab === "lapsed") && (
                <button onClick={()=>setShowOverdueOnly(v=>!v)}
                  style={{padding:"4px 10px",borderRadius:8,border:`1.5px solid ${showOverdueOnly?C.dan:C.border}`,background:showOverdueOnly?`${C.dan}12`:"transparent",color:showOverdueOnly?C.dan:C.textMut,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s",whiteSpace:"nowrap"}}>
                  Overdue
                </button>
              )}
              {(activeTab === "active" || activeTab === "all") && (
                <button onClick={(e) => { e.stopPropagation(); setShowExtraCols(v=>!v); }}
                  style={{padding:"4px 10px",borderRadius:8,border:`1.5px solid ${showExtraCols?C.pri:C.border}`,background:showExtraCols?C.priLt:"transparent",color:showExtraCols?C.pri:C.textMut,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",transition:"all 0.2s",textTransform:"uppercase",letterSpacing:"0.04em"}}>
                  {showExtraCols ? "Less Columns" : "More Columns"}
                </button>
              )}
            </div>
          </div>
          {/* Active structured filter summary */}
          {activeFilterCount > 0 && (
            <div style={{display:"flex",alignItems:"center",gap:6,padding:"6px 16px 8px",borderTop:`1px solid ${C.borderLight}`,flexWrap:"wrap"}}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.pri} strokeWidth="2.5" strokeLinecap="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
              <span style={{fontSize:11,fontWeight:600,color:C.pri}}>{activeFilterCount} filter{activeFilterCount!==1?"s":""}:</span>
              {Object.entries(lcFilters).map(([k, f]) => {
                const fd = LC_FILTER_FIELDS.find(x => x.key === k);
                return (
                  <span key={k} style={{fontSize:11,fontWeight:600,color:C.text,background:`${C.pri}10`,border:`1px solid ${C.pri}25`,padding:"2px 8px",borderRadius:6,display:"inline-flex",alignItems:"center",gap:4}}>
                    {fd?.label} {LC_OP_LABELS[f.op]||f.op} {f.val !== "" ? (fd?.type==="currency"?"$":"")+f.val : ""}
                    <button onClick={()=>{ const n={...lcFilters}; delete n[k]; setLcFilters(n); }} style={{border:"none",background:"none",cursor:"pointer",color:C.pri,padding:0,display:"flex",lineHeight:1}}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                  </span>
                );
              })}
              <button onClick={()=>setLcFilters({})} style={{fontSize:10,fontWeight:600,color:C.textMut,border:"none",background:"none",cursor:"pointer",fontFamily:"inherit",textDecoration:"underline",marginLeft:4}}>Clear all</button>
              <span style={{fontSize:11,color:C.textMut,marginLeft:"auto"}}>{activeList.length} result{activeList.length !== 1 ? "s" : ""}</span>
            </div>
          )}
        </div>

        {/* Tab Pills */}
        <div style={{display:"flex",borderBottom:`2px solid ${C.borderLight}`,background:C.bg}}>
          {tabDefs.filter(tab => !tab.hidden || showOldGingrData).map(tab => {
            const active = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => { setActiveTab(tab.id); setSortCol(null); setShowOverdueOnly(false); setSourceFilter(new Set()); setExpandedUpdates(new Set()); }}
                style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:"14px 16px",border:"none",borderBottom:`3px solid ${active?tab.color:"transparent"}`,background:active?C.surface:"transparent",cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s",marginBottom:-2}}>
                <span style={{fontSize:14,fontWeight:active?700:600,color:active?C.text:C.textSec}}>{tab.label}</span>
                <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",minWidth:24,height:24,padding:"0 8px",borderRadius:12,fontSize:13,fontWeight:800,background:active?tab.color:C.surfaceHover,color:active?"#fff":C.textSec,transition:"all 0.15s"}}>{tab.count}</span>
              </button>
            );
          })}
          <button
            onClick={() => { setShowOldGingrData(v => { if (v && activeTab === "oldGingrSync") setActiveTab("leads"); return !v; }); }}
            style={{padding:"10px 14px",border:"none",borderBottom:`3px solid transparent`,background:"transparent",cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:6,marginLeft:"auto",flexShrink:0}}
            title={showOldGingrData ? "Hide Old Gingr Data" : "View Old Gingr Data"}>
            <span style={{fontSize:12,fontWeight:600,color:showOldGingrData?C.text:C.textMut,whiteSpace:"nowrap"}}>View Old Gingr Data</span>
            <div style={{width:32,height:18,borderRadius:9,background:showOldGingrData?C.pri:C.border,position:"relative",transition:"background 0.2s",flexShrink:0}}>
              <div style={{width:14,height:14,borderRadius:7,background:"#fff",position:"absolute",top:2,left:showOldGingrData?16:2,transition:"left 0.2s",boxShadow:"0 1px 3px rgba(0,0,0,0.15)"}} />
            </div>
          </button>
        </div>

        {/* Explainer Banner — per-tab, editable, with Save as Default */}
        {(() => {
          const banners = data.lifecycleExplainers || {};
          const effectiveDefault = (defaultBanners && defaultBanners[activeTab]) || DEFAULT_LIFECYCLE_BANNERS[activeTab] || "";
          const txt = banners[activeTab] || effectiveDefault;
          const canEdit = hasPermission(profile, data, "edit_lifecycle_banners");
          const isEditing = editingBanner === activeTab;
          const isUsingCustomDefault = !!(defaultBanners && defaultBanners[activeTab]);
          return (
            <div style={{padding:"10px 18px",borderBottom:`1px solid ${C.borderLight}`,background:`linear-gradient(135deg, ${C.priLt||C.pri+"08"}40, ${C.surface})`,fontSize:12,lineHeight:1.6,color:C.textSec,position:"relative"}}>
              {isEditing ? (
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  <textarea value={bannerDraft} onChange={e => setBannerDraft(e.target.value)} autoFocus
                    style={{width:"100%",minHeight:72,padding:"8px 10px",border:`1.5px solid ${C.pri}`,borderRadius:6,fontSize:12,lineHeight:1.6,fontFamily:"inherit",color:C.text,background:"#fff",resize:"vertical",outline:"none",boxSizing:"border-box"}}
                    placeholder="Enter banner text for this tab…" />
                  <div style={{display:"flex",gap:8,justifyContent:"flex-end",flexWrap:"wrap"}}>
                    <button onClick={() => setEditingBanner(null)} style={{padding:"5px 14px",border:`1px solid ${C.border}`,borderRadius:6,background:C.surface,fontSize:11,fontWeight:600,color:C.textSec,cursor:"pointer",fontFamily:"inherit"}}>Cancel</button>
                    <button onClick={async () => {
                      const updated = { ...(data.lifecycleExplainers || {}), [activeTab]: bannerDraft.trim() || effectiveDefault };
                      await save({ ...data, lifecycleExplainers: updated });
                      setEditingBanner(null);
                      addGlobalToast?.({ message: "Banner updated" });
                    }} style={{padding:"5px 14px",border:"none",borderRadius:6,background:C.pri,fontSize:11,fontWeight:600,color:"#fff",cursor:"pointer",fontFamily:"inherit"}}>Save</button>
                    {canEdit && (
                      <button
                        title="Save this text as the default template for all locations"
                        onClick={async () => {
                          const val = bannerDraft.trim();
                          if (!val) return;
                          const merged = { ...(defaultBanners || {}), [activeTab]: val };
                          await supabase.from("lite_settings").upsert({ location_id: locationSlug, setting_key: "default_lifecycle_banners", setting_value: merged }, { onConflict: "location_id,setting_key" });
                          setDefaultBanners(merged);
                          // Also save as the location's current banner
                          const updated = { ...(data.lifecycleExplainers || {}), [activeTab]: val };
                          await save({ ...data, lifecycleExplainers: updated });
                          setEditingBanner(null);
                          addGlobalToast?.({ message: "Saved as default template" });
                        }}
                        style={{padding:"5px 14px",border:`1px solid ${C.acc}50`,borderRadius:6,background:`${C.acc}10`,fontSize:11,fontWeight:600,color:C.accDk||C.pri,cursor:"pointer",fontFamily:"inherit"}}
                      >Save as Default</button>
                    )}
                    {banners[activeTab] && (
                      <button onClick={async () => {
                        const updated = { ...(data.lifecycleExplainers || {}) };
                        delete updated[activeTab];
                        await save({ ...data, lifecycleExplainers: updated });
                        setEditingBanner(null);
                        setBannerDraft("");
                        addGlobalToast?.({ message: `Banner reset to ${isUsingCustomDefault ? "custom" : "system"} default` });
                      }} style={{padding:"5px 14px",border:`1px solid ${C.dan}30`,borderRadius:6,background:`${C.dan}08`,fontSize:11,fontWeight:600,color:C.dan,cursor:"pointer",fontFamily:"inherit"}}>Reset Default</button>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
                  <div style={{flex:1,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>{txt}</div>
                  {canEdit && (
                    <button onClick={() => { setEditingBanner(activeTab); setBannerDraft(txt); }}
                      title="Edit banner text"
                      style={{flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",width:26,height:26,border:`1px solid ${C.border}`,borderRadius:6,background:C.surface,cursor:"pointer",color:C.textSec,transition:"all 0.15s",marginTop:-1}}
                      onMouseEnter={e => { e.currentTarget.style.background = C.surfaceHover; e.currentTarget.style.color = C.pri; }}
                      onMouseLeave={e => { e.currentTarget.style.background = C.surface; e.currentTarget.style.color = C.textSec; }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* ═══ TABLE HEADER + ROWS ═══ */}
        {activeTab === "leads" && (() => {
          const grid = getGrid();
          return <>
            <div style={{display:"grid",gridTemplateColumns:grid,padding:"10px 14px",background:C.bg,borderBottom:`1px solid ${C.border}`,fontSize:10,fontWeight:700,color:C.textMut,textTransform:"uppercase",letterSpacing:"0.06em",alignItems:"center"}}>
              <div style={colHeaderStyle("name")} onClick={()=>handleSort("name")}>Client <SortIcon col="name"/></div>
              <div style={colHeaderStyle("phone")} onClick={()=>handleSort("phone")}>Phone <SortIcon col="phone"/></div>
              <div style={colHeaderStyle("dogCount")} onClick={()=>handleSort("dogCount")}>Dogs <SortIcon col="dogCount"/></div>
              <div style={colHeaderStyle("createdAt")} onClick={()=>handleSort("createdAt")}>Created <SortIcon col="createdAt"/></div>
              <div style={colHeaderStyle("totalRes")} onClick={()=>handleSort("totalRes")}>Total Res <SortIcon col="totalRes"/></div>
              <div style={colHeaderStyle("totalSpent")} onClick={()=>handleSort("totalSpent")}>Total Spent <SortIcon col="totalSpent"/></div>
              <div>Source</div>
              <div style={colHeaderStyle("followUp")} onClick={()=>handleSort("followUp")}>Follow-Up <SortIcon col="followUp"/></div>
              <div>Notes</div>
              <div>Updates</div>
              <div></div>
            </div>
            {displayedList.length === 0 ? (
              <div style={{padding:"48px 12px",textAlign:"center"}}><div style={{fontSize:15,fontWeight:600,color:C.textSec}}>No leads{search?" matching search":""}</div></div>
            ) : displayedList.map(c => {
              const isExp = expandedUpdates.has(c.id);
              const updates = c.lifecycle?.conversion?.updates || [];
              const cStats = clientStats[c.id] || {};
              return (
                <div key={c.id}>
                  <div style={{display:"grid",gridTemplateColumns:grid,padding:"10px 14px",borderBottom:`1px solid ${C.borderLight}`,alignItems:"center",fontSize:12,transition:"background 0.1s"}}
                    onMouseEnter={e=>e.currentTarget.style.background=C.surfaceHover} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <div>{renderName(c)}</div>
                    <div style={{fontSize:11}}>{fmtPhone(c.fields.phone)}</div>
                    <div>{renderDogCount(c)}</div>
                    <div style={{fontSize:11,color:C.textSec}}>{c.createdAt ? new Date(c.createdAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"2-digit"}) : "—"}</div>
                    <div style={{fontSize:11,color:C.textSec}}>{cStats.totalRes || 0}</div>
                    <div style={{fontSize:11,color:C.textSec}}>{cStats.totalSpent ? `$${cStats.totalSpent.toLocaleString("en-US",{minimumFractionDigits:0,maximumFractionDigits:0})}` : "$0"}</div>
                    <div>{renderSource(c)}</div>
                    <div>{renderFollowUp(c, "conversion")}</div>
                    <div>{renderNotes(c, "conversion")}</div>
                    <div>{renderUpdatesLog(c, "conversion")}</div>
                    <div>{renderColdBtn(c)}</div>
                  </div>
                  {renderDogDetails(c)}
                  {expandedIgnite.has(c.id) && c.igniteData && (() => {
                    const igd = c.igniteData;
                    const isPhoneCall = igd.leadType === "phone_call";
                    const isWebForm = igd.leadType === "web_form";
                    const fields = [
                      { label: "Source", val: igd.source },
                      { label: "Lead Type", val: isPhoneCall ? "Phone Call" : isWebForm ? "Web Form" : igd.leadType },
                      { label: "First Name", val: igd.firstName },
                      { label: "Last Name", val: igd.lastName },
                      isPhoneCall && { label: "Caller Name", val: igd.callerName },
                      { label: "Email", val: igd.email },
                      { label: "Phone", val: igd.phone ? fmtPhone(igd.phone) : null },
                      isPhoneCall && { label: "Tracking Number", val: igd.trackingNumber },
                      isPhoneCall && { label: "Call Duration", val: igd.callDuration },
                      isPhoneCall && { label: "Call Status", val: igd.callStatus },
                      { label: "Zip Code", val: igd.zip },
                      { label: "City", val: igd.city },
                      { label: "State", val: igd.state },
                      isWebForm && { label: "Form Name", val: igd.formName },
                      isWebForm && { label: "Desired Service", val: igd.desiredService },
                      isWebForm && { label: "Desired Date", val: igd.desiredDate },
                      isWebForm && { label: "Booking", val: igd.bookingTitle },
                      isWebForm && { label: "Pet Name", val: igd.petName },
                      isWebForm && igd.salesValue != null && { label: "Est. Value", val: `$${Number(igd.salesValue).toLocaleString("en-US",{minimumFractionDigits:2})}` },
                      isWebForm && { label: "Details", val: igd.details },
                    ].filter(f => f && f.val);
                    // Parse transcript into speaker blocks
                    const parseTranscript = (raw) => {
                      if (!raw) return null;
                      const blocks = [];
                      const lines = raw.split("\n");
                      let currentSpeaker = null;
                      let currentText = [];
                      for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed) {
                          if (currentText.length > 0 && currentSpeaker) {
                            blocks.push({ speaker: currentSpeaker, text: currentText.join(" ").trim() });
                            currentText = [];
                            currentSpeaker = null;
                          }
                          continue;
                        }
                        if ((trimmed === "Caller" || trimmed === "Recipient") && currentText.length === 0) {
                          currentSpeaker = trimmed;
                        } else if (currentSpeaker) {
                          currentText.push(trimmed);
                        } else {
                          if (blocks.length > 0) {
                            blocks[blocks.length - 1].text += " " + trimmed;
                          } else {
                            blocks.push({ speaker: "Unknown", text: trimmed });
                          }
                        }
                      }
                      if (currentSpeaker && currentText.length > 0) {
                        blocks.push({ speaker: currentSpeaker, text: currentText.join(" ").trim() });
                      }
                      return blocks.filter(b => b.text);
                    };
                    const transcriptBlocks = parseTranscript(igd.callTranscription);
                    return (
                      <div style={{padding:"12px 20px 12px 28px",background:`#FFF7ED`,borderBottom:`1px solid ${C.borderLight}`,borderLeft:"3px solid #F97316"}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                          {isPhoneCall ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F97316" strokeWidth="2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                          ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#F97316" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                          )}
                          <span style={{fontSize:12,fontWeight:700,color:"#F97316"}}>Ignite {isPhoneCall ? "Phone Call" : isWebForm ? "Web Form" : "Lead"}</span>
                          <span style={{fontSize:10,color:C.textSec,fontWeight:500}}>Received {igd.createdAt ? new Date(igd.createdAt).toLocaleDateString("en-US",{month:"numeric",day:"numeric",year:"2-digit"}) : c.createdAt ? new Date(c.createdAt + "T12:00:00").toLocaleDateString("en-US",{month:"numeric",day:"numeric",year:"2-digit"}) : "\u2014"}</span>
                        </div>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"6px 24px"}}>
                          {fields.map((f, i) => (
                            <div key={i} style={{display:"flex",gap:6,fontSize:11,lineHeight:1.5,...(f.label==="Details"?{gridColumn:"1 / -1"}:{})}}>
                              <span style={{fontWeight:700,color:C.textSec,minWidth:110,flexShrink:0}}>{f.label}:</span>
                              <span style={{color:C.text,wordBreak:"break-word"}}>{f.val}</span>
                            </div>
                          ))}
                        </div>
                        {/* Transcript with speaker separation */}
                        {transcriptBlocks && transcriptBlocks.length > 0 && (
                          <div style={{marginTop:10,paddingTop:8,borderTop:"1px solid #F9731620"}}>
                            <div style={{fontSize:10,fontWeight:700,color:C.textMut,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Call Transcript</div>
                            <div style={{maxHeight:200,overflowY:"auto",paddingRight:8}}>
                              {transcriptBlocks.map((block, bi) => (
                                <div key={bi} style={{display:"flex",gap:8,marginBottom:6,fontSize:11,lineHeight:1.5}}>
                                  <span style={{fontWeight:700,color:block.speaker==="Caller"?"#F97316":C.pri,minWidth:60,flexShrink:0,fontSize:10,paddingTop:1}}>
                                    {block.speaker === "Caller" ? "Caller" : "Staff"}
                                  </span>
                                  <span style={{color:C.text,wordBreak:"break-word",flex:1,background:block.speaker==="Caller"?"#FFF7ED":`${C.pri}06`,padding:"4px 8px",borderRadius:6}}>
                                    {block.text}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {(igd.igniteProfileId && (igd.igniteLeadId || igd.leadId) || igd.callRecordingUrl || igd.leadPage) && (
                          <div style={{marginTop:10,paddingTop:8,borderTop:"1px solid #F9731630",display:"flex",gap:8,flexWrap:"wrap"}}>
                            {igd.igniteProfileId && (igd.igniteLeadId || igd.leadId) && (
                              <a href={`https://leads.idigitalstrategies.com/profile/${igd.igniteProfileId}/leads?lid=${igd.igniteLeadId || igd.leadId}`} target="_blank" rel="noopener noreferrer"
                                style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:11,fontWeight:700,color:"#F97316",textDecoration:"none",padding:"4px 10px",borderRadius:6,border:"1px solid #F9731640",background:"white"}}
                                onMouseEnter={e=>e.currentTarget.style.background="#FFF7ED"}
                                onMouseLeave={e=>e.currentTarget.style.background="white"}>
                                View in Ignite ↗
                              </a>
                            )}
                            {igd.callRecordingUrl && (
                              <a href={igd.callRecordingUrl} target="_blank" rel="noopener noreferrer"
                                style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:11,fontWeight:700,color:C.pri,textDecoration:"none",padding:"4px 10px",borderRadius:6,border:`1px solid ${C.pri}40`,background:"white"}}
                                onMouseEnter={e=>e.currentTarget.style.background=`${C.pri}08`}
                                onMouseLeave={e=>e.currentTarget.style.background="white"}>
                                🎧 Listen to Recording ↗
                              </a>
                            )}
                            {igd.leadPage && (
                              <a href={igd.leadPage} target="_blank" rel="noopener noreferrer"
                                style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:11,fontWeight:700,color:C.textSec,textDecoration:"none",padding:"4px 10px",borderRadius:6,border:`1px solid ${C.border}`,background:"white"}}
                                onMouseEnter={e=>e.currentTarget.style.background=C.bg}
                                onMouseLeave={e=>e.currentTarget.style.background="white"}>
                                Lead Page ↗
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  {expandedDraft === c.id && (() => {
                    const draft = bookingDrafts.find(d => {
                      const cd = d.client_data || {};
                      return (cd.phone && cd.phone === c.fields?.phone) || (cd.email && cd.email === c.fields?.email);
                    });
                    if (!draft) return (
                      <div style={{padding:"12px 20px 12px 28px",background:`${C.pri}06`,borderBottom:`1px solid ${C.borderLight}`,borderLeft:`3px solid ${C.pri}`}}>
                        <span style={{fontSize:12,color:C.textMut}}>No booking draft data found for this customer.</span>
                      </div>
                    );
                    const timeline = Array.isArray(draft.step_timeline) ? draft.step_timeline : [];
                    const stepNames = { splash:"Landing Page", avail_step_0:"Service Selection", avail_step_1:"Date Selection", avail_step_2:"Room / Time Selection", avail_step_3:"Room Recommendation", reg_step_0:"Client Info", reg_step_1:"Dog Info", reg_step_2:"Vaccine Records", reg_step_3:"Feeding & Care", reg_step_4:"Stay Details", reg_step_5:"Review & Book", confirmation:"Confirmed" };
                    return (
                      <div style={{padding:"12px 20px 12px 28px",background:`${C.pri}06`,borderBottom:`1px solid ${C.borderLight}`,borderLeft:`3px solid ${C.pri}`}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.pri} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                          <span style={{fontSize:12,fontWeight:700,color:C.pri}}>Online Booking Journey</span>
                          <span style={{fontSize:11,fontWeight:700,color:C.pri,background:`${C.pri}15`,padding:"2px 8px",borderRadius:8}}>{draft.completion_pct || 0}% complete</span>
                          <span style={{fontSize:10,color:C.textSec,fontWeight:500}}>Last activity {new Date(draft.updated_at).toLocaleDateString("en-US",{month:"numeric",day:"numeric",year:"2-digit"})} {new Date(draft.updated_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span>
                        </div>
                        <div style={{display:"flex",flexWrap:"wrap",gap:4,alignItems:"center"}}>
                          {timeline.filter(s => s.step !== "splash").map((s, i) => {
                            const name = stepNames[s.step] || s.step;
                            const dur = s.duration || 0;
                            const durLabel = dur < 60 ? `${dur}s` : `${Math.floor(dur/60)}m ${dur%60}s`;
                            const filtered = timeline.filter(st => st.step !== "splash");
                            const isLast = i === filtered.length - 1;
                            return (
                              <React.Fragment key={i}>
                                <span style={{fontSize:11,fontWeight:600,color:C.text,background:C.surface,border:`1px solid ${C.borderLight}`,borderRadius:8,padding:"4px 10px",display:"inline-flex",alignItems:"center",gap:4}}>
                                  {name}
                                  <span style={{fontSize:10,color:C.textMut,fontWeight:500}}>({durLabel})</span>
                                </span>
                                {!isLast && <span style={{color:C.textMut,fontSize:10}}>→</span>}
                                {isLast && !s.exitedAt && <span style={{fontSize:10,color:C.dan,fontWeight:600,marginLeft:4}}>stopped / closed tab</span>}
                              </React.Fragment>
                            );
                          })}
                        </div>
                        {draft.booking_data && (draft.booking_data.checkIn || draft.booking_data.tourDate) && (
                          <div style={{marginTop:8,fontSize:11,color:C.textSec}}>
                            {draft.service_type === "tour" ? `Tour: ${draft.booking_data.tourDate} at ${draft.booking_data.tourTime || "—"}`
                              : `Dates: ${draft.booking_data.checkIn || "—"} – ${draft.booking_data.checkOut || "—"}${draft.booking_data.selectedRoom ? ` · Room: ${draft.booking_data.selectedRoom}` : ""}`}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  {isExp && updates.length > 0 && (
                    <div style={{padding:"12px 20px",background:C.bg,borderBottom:`1px solid ${C.borderLight}`,borderLeft:`3px solid ${C.acc}`}}>
                      {updates.map(u => (
                        <div key={u.id} style={{marginBottom:10,paddingBottom:10,borderBottom:`1px solid ${C.borderLight}`}}>
                          <div style={{fontSize:11,fontWeight:700,color:C.pri,marginBottom:3}}>{u.loggedBy} — {new Date(u.loggedAt).toLocaleDateString()} {new Date(u.loggedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</div>
                          <div style={{fontSize:12,color:C.text,marginBottom:3,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>{u.notes}</div>
                          <div style={{fontSize:10,color:C.textSec}}>Target: {u.previousFollowUp ? fmtDate(u.previousFollowUp) : "—"} → Next: {fmtDate(u.newFollowUp)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {/* ── Standalone booking draft entries (visitors not yet in system) ── */}
            {bookingDrafts.length > 0 && (() => {
              // Find drafts that don't match any existing client
              const clientPhones = new Set(data.clients.map(c => (c.fields?.phone || "").replace(/\D/g, "")).filter(Boolean));
              const clientEmails = new Set(data.clients.map(c => (c.fields?.email || "").toLowerCase()).filter(Boolean));
              const unmatchedDrafts = bookingDrafts.filter(d => {
                const cd = d.client_data || {};
                const dPhone = (cd.phone || "").replace(/\D/g, "");
                const dEmail = (cd.email || "").toLowerCase();
                const matchesClient = (dPhone && clientPhones.has(dPhone)) || (dEmail && clientEmails.has(dEmail));
                return !matchesClient;
              });
              // Hide unmatched drafts when source filters are active
              if (sourceFilter.size > 0) return null;
              if (unmatchedDrafts.length === 0) return null;
              const stepNames = { splash:"Landing Page", avail_step_0:"Service Selection", avail_step_1:"Date Selection", avail_step_2:"Room / Time Selection", avail_step_3:"Room Recommendation", reg_step_0:"Client Info", reg_step_1:"Dog Info", reg_step_2:"Vaccine Records", reg_step_3:"Feeding & Care", reg_step_4:"Stay Details", reg_step_5:"Review & Book", confirmation:"Confirmed" };
              return unmatchedDrafts.map(draft => {
                const cd = draft.client_data || {};
                const dd = draft.dog_data || {};
                const draftName = [cd.firstName, cd.lastName].filter(Boolean).join(" ") || "Anonymous Visitor";
                const draftPhone = cd.phone || "";
                const draftDogName = dd.name || "";
                const timeline = Array.isArray(draft.step_timeline) ? draft.step_timeline : [];
                const isExpanded = expandedDraft === draft.id;
                return (
                  <div key={`draft-${draft.id}`}>
                    <div style={{display:"grid",gridTemplateColumns:grid,padding:"10px 14px",borderBottom:`1px solid ${C.borderLight}`,alignItems:"center",fontSize:12,transition:"background 0.1s",background:`${C.pri}04`}}
                      onMouseEnter={e=>e.currentTarget.style.background=`${C.pri}08`} onMouseLeave={e=>e.currentTarget.style.background=`${C.pri}04`}>
                      <div style={{fontWeight:600,color:C.text,display:"flex",alignItems:"center",gap:6}}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.pri} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                        {draftName}
                      </div>
                      <div style={{fontSize:11}}>{draftPhone ? fmtPhone(draftPhone) : <span style={{color:C.textMut}}>—</span>}</div>
                      <div style={{fontSize:11}}>{draftDogName || <span style={{color:C.textMut}}>—</span>}</div>
                      <div>
                        <span style={{display:"inline-flex",alignItems:"center",gap:4,background:`${C.pri}10`,border:`1px solid ${C.pri}30`,borderRadius:6,padding:"2px 8px",cursor:"pointer"}} onClick={() => setExpandedDraft(prev => prev === draft.id ? null : draft.id)}>
                          <span style={{fontWeight:700,color:C.pri,fontSize:11}}>Online</span>
                          <span style={{fontSize:10,color:C.pri,fontWeight:600}}>{draft.completion_pct||0}%</span>
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke={C.pri} strokeWidth="3" strokeLinecap="round" style={{transform:isExpanded?"rotate(180deg)":"rotate(0deg)",transition:"transform 0.2s"}}><polyline points="6 9 12 15 18 9"/></svg>
                        </span>
                      </div>
                      <div style={{fontSize:10,color:C.textSec}}>{draft.updated_at ? new Date(draft.updated_at).toLocaleDateString("en-US",{month:"numeric",day:"numeric"}) + " " + new Date(draft.updated_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}) : "—"}</div>
                      <div style={{fontSize:10,color:C.textMut,fontStyle:"italic"}}>In-progress booking</div>
                      <div><span style={{color:C.textMut,fontSize:10}}>—</span></div>
                      <div></div>
                    </div>
                    {isExpanded && (
                      <div style={{padding:"12px 20px 12px 28px",background:`${C.pri}06`,borderBottom:`1px solid ${C.borderLight}`,borderLeft:`3px solid ${C.pri}`}}>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.pri} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                          <span style={{fontSize:12,fontWeight:700,color:C.pri}}>Online Booking Journey</span>
                          <span style={{fontSize:11,fontWeight:700,color:C.pri,background:`${C.pri}15`,padding:"2px 8px",borderRadius:8}}>{draft.completion_pct || 0}% complete</span>
                          <span style={{fontSize:10,color:C.textSec,fontWeight:500}}>Last activity {new Date(draft.updated_at).toLocaleDateString("en-US",{month:"numeric",day:"numeric",year:"2-digit"})} {new Date(draft.updated_at).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span>
                        </div>
                        <div style={{display:"flex",flexWrap:"wrap",gap:4,alignItems:"center"}}>
                          {timeline.filter(s => s.step !== "splash").map((s, i) => {
                            const name = stepNames[s.step] || s.step;
                            const dur = s.duration || 0;
                            const durLabel = dur < 60 ? `${dur}s` : `${Math.floor(dur/60)}m ${dur%60}s`;
                            const filtered = timeline.filter(st => st.step !== "splash");
                            const isLast = i === filtered.length - 1;
                            return (
                              <React.Fragment key={i}>
                                <span style={{fontSize:11,fontWeight:600,color:C.text,background:C.surface,border:`1px solid ${C.borderLight}`,borderRadius:8,padding:"4px 10px",display:"inline-flex",alignItems:"center",gap:4}}>
                                  {name}
                                  <span style={{fontSize:10,color:C.textMut,fontWeight:500}}>({durLabel})</span>
                                </span>
                                {!isLast && <span style={{color:C.textMut,fontSize:10}}>→</span>}
                                {isLast && !s.exitedAt && <span style={{fontSize:10,color:C.dan,fontWeight:600,marginLeft:4}}>stopped / closed tab</span>}
                              </React.Fragment>
                            );
                          })}
                        </div>
                        {draft.booking_data && (draft.booking_data.checkIn || draft.booking_data.tourDate) && (
                          <div style={{marginTop:8,fontSize:11,color:C.textSec}}>
                            {draft.service_type === "tour" ? `Tour: ${draft.booking_data.tourDate} at ${draft.booking_data.tourTime || "—"}`
                              : `Dates: ${draft.booking_data.checkIn || "—"} – ${draft.booking_data.checkOut || "—"}${draft.booking_data.selectedRoom ? ` · Room: ${draft.booking_data.selectedRoom}` : ""}`}
                          </div>
                        )}
                        {(cd.firstName || cd.email || cd.phone) && (
                          <div style={{marginTop:10,paddingTop:8,borderTop:`1px solid ${C.pri}20`,display:"grid",gridTemplateColumns:"1fr 1fr",gap:"4px 20px"}}>
                            {cd.firstName && <div style={{fontSize:11}}><span style={{fontWeight:700,color:C.textSec}}>Name:</span> <span style={{color:C.text}}>{cd.firstName} {cd.lastName||""}</span></div>}
                            {cd.email && <div style={{fontSize:11}}><span style={{fontWeight:700,color:C.textSec}}>Email:</span> <span style={{color:C.text}}>{cd.email}</span></div>}
                            {cd.phone && <div style={{fontSize:11}}><span style={{fontWeight:700,color:C.textSec}}>Phone:</span> <span style={{color:C.text}}>{cd.phone}</span></div>}
                            {dd.name && <div style={{fontSize:11}}><span style={{fontWeight:700,color:C.textSec}}>Dog:</span> <span style={{color:C.text}}>{dd.name}{dd.breed ? ` (${dd.breed})` : ""}</span></div>}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </>;
        })()}

        {activeTab === "oldGingrSync" && (() => {
          const grid = getGrid();
          return <>
            <div style={{display:"grid",gridTemplateColumns:grid,padding:"10px 14px",background:C.bg,borderBottom:`1px solid ${C.border}`,fontSize:10,fontWeight:700,color:C.textMut,textTransform:"uppercase",letterSpacing:"0.06em",alignItems:"center"}}>
              <div style={colHeaderStyle("name")} onClick={()=>handleSort("name")}>Client <SortIcon col="name"/></div>
              <div style={colHeaderStyle("phone")} onClick={()=>handleSort("phone")}>Phone <SortIcon col="phone"/></div>
              <div style={colHeaderStyle("dogCount")} onClick={()=>handleSort("dogCount")}>Dogs <SortIcon col="dogCount"/></div>
              <div style={colHeaderStyle("createdAt")} onClick={()=>handleSort("createdAt")}>Created <SortIcon col="createdAt"/></div>
              <div style={colHeaderStyle("totalRes")} onClick={()=>handleSort("totalRes")}>Total Res <SortIcon col="totalRes"/></div>
              <div style={colHeaderStyle("totalSpent")} onClick={()=>handleSort("totalSpent")}>Total Spent <SortIcon col="totalSpent"/></div>
              <div>Source</div>
              <div style={colHeaderStyle("followUp")} onClick={()=>handleSort("followUp")}>Follow-Up <SortIcon col="followUp"/></div>
              <div>Notes</div>
              <div>Updates</div>
              <div></div>
            </div>
            {displayedList.length === 0 ? (
              <div style={{padding:"48px 12px",textAlign:"center"}}><div style={{fontSize:15,fontWeight:600,color:C.textSec}}>No old Gingr sync records{search?" matching search":""}</div></div>
            ) : displayedList.map(c => {
              const isExp = expandedUpdates.has(c.id);
              const updates = c.lifecycle?.conversion?.updates || [];
              const cStats = clientStats[c.id] || {};
              return (
                <div key={c.id}>
                  <div style={{display:"grid",gridTemplateColumns:grid,padding:"10px 14px",borderBottom:`1px solid ${C.borderLight}`,alignItems:"center",fontSize:12,transition:"background 0.1s"}}
                    onMouseEnter={e=>e.currentTarget.style.background=C.surfaceHover} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <div>{renderName(c)}</div>
                    <div style={{fontSize:11}}>{fmtPhone(c.fields.phone)}</div>
                    <div>{renderDogCount(c)}</div>
                    <div style={{fontSize:11,color:C.textSec}}>{c.createdAt ? new Date(c.createdAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"2-digit"}) : "—"}</div>
                    <div style={{fontSize:11,color:C.textSec}}>{cStats.totalRes || 0}</div>
                    <div style={{fontSize:11,color:C.textSec}}>{cStats.totalSpent ? `$${cStats.totalSpent.toLocaleString("en-US",{minimumFractionDigits:0,maximumFractionDigits:0})}` : "$0"}</div>
                    <div>{renderSource(c)}</div>
                    <div>{renderFollowUp(c, "conversion")}</div>
                    <div>{renderNotes(c, "conversion")}</div>
                    <div>{renderUpdatesLog(c, "conversion")}</div>
                    <div>{renderColdBtn(c)}</div>
                  </div>
                  {renderDogDetails(c)}
                  {isExp && updates.length > 0 && (
                    <div style={{padding:"12px 20px",background:C.bg,borderBottom:`1px solid ${C.borderLight}`,borderLeft:`3px solid ${C.acc}`}}>
                      {updates.map(u => (
                        <div key={u.id} style={{marginBottom:10,paddingBottom:10,borderBottom:`1px solid ${C.borderLight}`}}>
                          <div style={{fontSize:11,fontWeight:700,color:C.pri,marginBottom:3}}>{u.loggedBy} — {new Date(u.loggedAt).toLocaleDateString()} {new Date(u.loggedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</div>
                          <div style={{fontSize:12,color:C.text,marginBottom:3,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>{u.notes}</div>
                          <div style={{fontSize:10,color:C.textSec}}>Target: {u.previousFollowUp ? fmtDate(u.previousFollowUp) : "—"} → Next: {fmtDate(u.newFollowUp)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </>;
        })()}

        {activeTab === "lapsed" && (() => {
          const grid = getGrid();
          return <>
            <div style={{display:"grid",gridTemplateColumns:grid,padding:"10px 14px",background:C.bg,borderBottom:`1px solid ${C.border}`,fontSize:10,fontWeight:700,color:C.textMut,textTransform:"uppercase",letterSpacing:"0.06em",alignItems:"center"}}>
              <div style={colHeaderStyle("name")} onClick={()=>handleSort("name")}>Client <SortIcon col="name"/></div>
              <div style={colHeaderStyle("phone")} onClick={()=>handleSort("phone")}>Phone <SortIcon col="phone"/></div>
              <div style={colHeaderStyle("dogCount")} onClick={()=>handleSort("dogCount")}>Dogs <SortIcon col="dogCount"/></div>
              <div style={colHeaderStyle("createdAt")} onClick={()=>handleSort("createdAt")}>Created <SortIcon col="createdAt"/></div>
              <div>Source</div>
              <div style={colHeaderStyle("followUp")} onClick={()=>handleSort("followUp")}>Follow-Up <SortIcon col="followUp"/></div>
              <div>Notes</div>
              <div>Updates</div>
              <div style={colHeaderStyle("lastRes")} onClick={()=>handleSort("lastRes")}>Last Res <SortIcon col="lastRes"/></div>
              <div style={colHeaderStyle("totalPaid")} onClick={()=>handleSort("totalPaid")}>Total Spent <SortIcon col="totalPaid"/></div>
              <div style={colHeaderStyle("totalAppts")} onClick={()=>handleSort("totalAppts")}>Total Res <SortIcon col="totalAppts"/></div>
              <div></div>
            </div>
            {displayedList.length === 0 ? (
              <div style={{padding:"48px 12px",textAlign:"center"}}><div style={{fontSize:15,fontWeight:600,color:C.textSec}}>No lapsed clients{search?" matching search":""}</div></div>
            ) : displayedList.map(c => {
              const s = clientStats[c.id] || {};
              const isExp = expandedUpdates.has(c.id);
              const updates = c.lifecycle?.retention?.updates || [];
              return (
                <div key={c.id}>
                  <div style={{display:"grid",gridTemplateColumns:grid,padding:"10px 14px",borderBottom:`1px solid ${C.borderLight}`,alignItems:"center",fontSize:12,transition:"background 0.1s"}}
                    onMouseEnter={e=>e.currentTarget.style.background=C.surfaceHover} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <div>{renderName(c)}</div>
                    <div style={{fontSize:11}}>{fmtPhone(c.fields.phone)}</div>
                    <div>{renderDogCount(c)}</div>
                    <div style={{fontSize:11,color:C.textSec}}>{c.createdAt ? new Date(c.createdAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"2-digit"}) : "—"}</div>
                    <div>{renderSource(c)}</div>
                    <div>{renderFollowUp(c, "retention")}</div>
                    <div>{renderNotes(c, "retention")}</div>
                    <div>{renderUpdatesLog(c, "retention")}</div>
                    <div style={{fontSize:11}}>{s.lastRes ? <><span>{fmtDate(s.lastRes.checkIn)}</span></> : <span style={{color:C.textMut}}>—</span>}</div>
                    <div style={{fontSize:11,fontWeight:600}}>${(s.totalSpent||0).toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:0})}</div>
                    <div style={{fontSize:11,fontWeight:600}}>{s.totalRes||0}</div>
                    <div>{renderColdBtn(c)}</div>
                  </div>
                  {renderDogDetails(c)}
                  {isExp && updates.length > 0 && (
                    <div style={{padding:"12px 20px",background:C.bg,borderBottom:`1px solid ${C.borderLight}`,borderLeft:`3px solid ${C.acc}`}}>
                      {updates.map(u => (
                        <div key={u.id} style={{marginBottom:10,paddingBottom:10,borderBottom:`1px solid ${C.borderLight}`}}>
                          <div style={{fontSize:11,fontWeight:700,color:C.pri,marginBottom:3}}>{u.loggedBy} — {new Date(u.loggedAt).toLocaleDateString()} {new Date(u.loggedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</div>
                          <div style={{fontSize:12,color:C.text,marginBottom:3,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>{u.notes}</div>
                          <div style={{fontSize:10,color:C.textSec}}>Target: {u.previousFollowUp ? fmtDate(u.previousFollowUp) : "—"} → Next: {fmtDate(u.newFollowUp)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </>;
        })()}

        {activeTab === "cold" && (() => {
          const grid = getGrid();
          return <>
            <div style={{display:"grid",gridTemplateColumns:grid,padding:"10px 14px",background:C.bg,borderBottom:`1px solid ${C.border}`,fontSize:10,fontWeight:700,color:C.textMut,textTransform:"uppercase",letterSpacing:"0.06em",alignItems:"center"}}>
              <div style={colHeaderStyle("name")} onClick={()=>handleSort("name")}>Client <SortIcon col="name"/></div>
              <div style={colHeaderStyle("phone")} onClick={()=>handleSort("phone")}>Phone <SortIcon col="phone"/></div>
              <div style={colHeaderStyle("dogCount")} onClick={()=>handleSort("dogCount")}>Dogs <SortIcon col="dogCount"/></div>
              <div style={colHeaderStyle("createdAt")} onClick={()=>handleSort("createdAt")}>Created <SortIcon col="createdAt"/></div>
              <div>Source</div>
              <div style={colHeaderStyle("coldDate")} onClick={()=>handleSort("coldDate")}>Date Cold <SortIcon col="coldDate"/></div>
              <div>Last Notes</div>
              <div></div>
            </div>
            {displayedList.length === 0 ? (
              <div style={{padding:"48px 12px",textAlign:"center"}}><div style={{fontSize:15,fontWeight:600,color:C.textSec}}>No cold clients{search?" matching search":""}</div></div>
            ) : displayedList.map(c => {
              const rawFrom = c.lifecycle?.coldFrom || "leads";
              const fromTab = (rawFrom === "lapsed" || rawFrom === "retention") ? "retention" : "conversion";
              const lastUpdate = c.lifecycle?.[fromTab]?.updates?.[0];
              return (
                <div key={c.id}>
                  <div style={{display:"grid",gridTemplateColumns:grid,padding:"10px 14px",borderBottom:`1px solid ${C.borderLight}`,alignItems:"center",fontSize:12,transition:"background 0.1s"}}
                    onMouseEnter={e=>e.currentTarget.style.background=C.surfaceHover} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <div>{renderName(c)}</div>
                    <div style={{fontSize:11}}>{fmtPhone(c.fields.phone)}</div>
                    <div>{renderDogCount(c)}</div>
                    <div style={{fontSize:11,color:C.textSec}}>{c.createdAt ? new Date(c.createdAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"2-digit"}) : "—"}</div>
                    <div>{renderSource(c)}</div>
                    <div style={{fontSize:11}}>{c.lifecycle?.coldDate ? fmtDate(c.lifecycle.coldDate) : "—"}</div>
                    <div style={{fontSize:11,color:C.text,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>{lastUpdate?.notes || <span style={{color:C.textMut}}>—</span>}</div>
                    <div>{renderReviveBtn(c)}</div>
                  </div>
                  {renderDogDetails(c)}
                </div>
              );
            })}
          </>;
        })()}

        {(activeTab === "active" || activeTab === "all") && (() => {
          const grid = getGrid();
          return <>
            <div style={{display:"grid",gridTemplateColumns:grid,padding:"10px 14px",background:C.bg,borderBottom:`1px solid ${C.border}`,fontSize:10,fontWeight:700,color:C.textMut,textTransform:"uppercase",letterSpacing:"0.06em",alignItems:"center"}}>
              <div style={colHeaderStyle("name")} onClick={()=>handleSort("name")}>Client <SortIcon col="name"/></div>
              <div style={colHeaderStyle("phone")} onClick={()=>handleSort("phone")}>Phone <SortIcon col="phone"/></div>
              <div style={colHeaderStyle("dogCount")} onClick={()=>handleSort("dogCount")}>Dogs <SortIcon col="dogCount"/></div>
              <div style={colHeaderStyle("createdAt")} onClick={()=>handleSort("createdAt")}>Created <SortIcon col="createdAt"/></div>
              {shownDataCols.map(k => {
                const labels = {nextRes:"Next Res",lastRes:"Last Res",daysSince:"Days Since",totalRes:"Total Res",daycare:"DC",boarding:"BD",eval:"Eval",postEval:"P-Eval",tours:"Tours",postTour:"P-Tour",totalSpent:"Total Spent"};
                return <div key={k} style={colHeaderStyle(k)} onClick={()=>handleSort(k)}>{labels[k]||k} <SortIcon col={k}/></div>;
              })}
              {/* Column toggle moved to search bar */}
            </div>
            {displayedList.length === 0 ? (
              <div style={{padding:"48px 12px",textAlign:"center"}}><div style={{fontSize:15,fontWeight:600,color:C.textSec}}>No clients{search?" matching search":""}</div></div>
            ) : displayedList.map(c => {
              const s = clientStats[c.id] || {};
              return (
                <div key={c.id}>
                  <div style={{display:"grid",gridTemplateColumns:grid,padding:"10px 14px",borderBottom:`1px solid ${C.borderLight}`,alignItems:"center",fontSize:12,transition:"background 0.1s"}}
                    onMouseEnter={e=>e.currentTarget.style.background=C.surfaceHover} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    <div>{renderName(c)}</div>
                    <div style={{fontSize:11,color:C.textSec}}>{fmtPhone?.(c.fields.phone)||c.fields.phone||""}</div>
                    <div>{renderDogCount(c)}</div>
                    <div style={{fontSize:11,color:C.textSec}}>{c.createdAt ? new Date(c.createdAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"2-digit"}) : "—"}</div>
                    {shownDataCols.map(k => {
                      switch(k) {
                        case "totalRes": return <div key={k} style={{fontSize:11,fontWeight:600}}>{s.totalRes||0}</div>;
                        case "lastRes": return <div key={k} style={{fontSize:11}}>{s.lastRes ? fmtDate(s.lastRes.checkIn) : <span style={{color:C.textMut}}>—</span>}</div>;
                        case "daysSince": {
                          const d = s.daysSinceLast;
                          const col = d==null?C.textMut:d>180?C.dan:d>90?C.acc:d>60?C.text:C.suc;
                          return <div key={k} style={{fontSize:11,fontWeight:700,color:col}}>{d!=null?d:"—"}</div>;
                        }
                        case "daycare": return <div key={k} style={{fontSize:11}}>{s.daycareCount||0}</div>;
                        case "boarding": return <div key={k} style={{fontSize:11}}>{s.boardingCount||0}</div>;
                        case "eval": return <div key={k} style={{fontSize:11}}>{s.evalCount||0}</div>;
                        case "postEval": return <div key={k} style={{fontSize:11}}>{s.postEvalAppts||0}</div>;
                        case "tours": return <div key={k} style={{fontSize:11}}>{s.tourCount||0}</div>;
                        case "postTour": return <div key={k} style={{fontSize:11}}>{s.postTourAppts||0}</div>;
                        case "totalSpent": return <div key={k} style={{fontSize:11,fontWeight:600}}>${(s.totalSpent||0).toLocaleString(undefined,{minimumFractionDigits:0,maximumFractionDigits:0})}</div>;
                        case "nextRes": return <div key={k} style={{fontSize:11}}>{s.nextRes ? fmtDate(s.nextRes.checkIn) : <span style={{color:C.textMut}}>—</span>}</div>;
                        default: return <div key={k}></div>;
                      }
                    })}
                    <div></div>
                  </div>
                  {renderDogDetails(c)}
                </div>
              );
            })}
          </>;
        })()}

        {/* Show More / pagination */}
        {hasMore && (
          <div style={{padding:"16px",textAlign:"center",borderTop:`1px solid ${C.borderLight}`}}>
            <button onClick={() => setDisplayLimit(l => l + 100)}
              style={{padding:"8px 24px",borderRadius:8,border:`1.5px solid ${C.pri}`,background:"transparent",color:C.pri,fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
              Show More ({displayedList.length} of {activeList.length})
            </button>
          </div>
        )}
        {!hasMore && activeList.length > 100 && (
          <div style={{padding:"8px",textAlign:"center",fontSize:11,color:C.textMut}}>
            Showing all {activeList.length} clients
          </div>
        )}
      </Card>

      {/* Log Popover */}
      {logPopover && (
        <div style={{position:"fixed",top:0,left:0,width:"100%",height:"100%",zIndex:9998}} onClick={()=>{setLogPopover(null);setLogNotes("");setLogDate("");}}>
          <div onClick={e=>e.stopPropagation()} style={{position:"fixed",left:Math.min(logPopover.x||300,window.innerWidth-340),top:logPopover.y||200,zIndex:9999,background:C.surface,border:`1.5px solid ${C.border}`,borderRadius:12,padding:"16px 20px",width:310,boxShadow:"0 8px 32px rgba(0,0,0,0.15)"}}>
            <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:10}}>{logPopover.isRevive ? "Revive Client" : "Log Outreach"}</div>
            <textarea value={logNotes} onChange={e=>setLogNotes(e.target.value)} placeholder="Notes about this outreach..." rows={3}
              style={{width:"100%",padding:"10px 12px",borderRadius:8,border:`1.5px solid ${C.border}`,fontSize:12,fontFamily:"inherit",resize:"vertical",outline:"none",background:C.bg,boxSizing:"border-box",marginBottom:10}}
              onFocus={e=>e.target.style.borderColor=C.pri} onBlur={e=>e.target.style.borderColor=C.border} autoFocus />
            <div style={{marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:700,color:C.textSec,marginBottom:4}}>Next Follow-Up Date *</div>
              {(() => {
                const c = data.clients.find(cl => cl.id === logPopover.clientId);
                const src = c?.lifecycle?.conversion?.source;
                const isHighIntent = src === "eval" || src === "tour" || src === "ignite";
                const addD = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0,10); };
                const recDate = isHighIntent ? addD(1) : addD(2);
                const recHint = isHighIntent ? "Recommended: +1 day (high-intent lead). Use a further date if the client gave a specific callback date." : "Recommended: +2 days (standard follow-up). Use +1 day for high-intent leads or a further date if the client gave a specific callback date.";
                return <MiniDatePicker value={logDate} onChange={setLogDate} recommendedDate={recDate} recommendedHint={recHint} />;
              })()}
            </div>
            <div style={{display:"flex",justifyContent:"flex-end",gap:8}}>
              <Btn size="sm" variant="ghost" onClick={()=>{setLogPopover(null);setLogNotes("");setLogDate("");}}>Cancel</Btn>
              <Btn size="sm" onClick={handleSaveLog}>{logPopover.isRevive ? "Revive" : "Save Log"}</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── FUNNEL REPORT ───────────────────────────────────────────────────────

export default ClientsPage;
