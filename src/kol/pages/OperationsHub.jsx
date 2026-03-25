// K9 Operations — OperationsHub
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

// ─── OPS-010: Full FE/BE checklist templates imported from POS app ───────────
// These replace the condensed shared/theme defaults for Lite locations.
const POS_FE_TEMPLATE = [
  {id:"fe1",time:"6:15",label:"AM feeding and medication"},
  {id:"fe2",time:"6:45",label:"Check voicemails, document on Voicemail Log"},
  {id:"fe3",time:"7:00",label:"Confirm everyone has a radio and name tag"},
  {id:"fe4",time:"7:15",label:"Review & Start EOD"},
  {id:"fe5",time:"8:00",label:"Check tour book / evals, document on Tour Log & Eval Log"},
  {id:"fe6",time:"8:15",label:"Confirm transport of boarding dogs to daycare"},
  {id:"fe7",time:"8:45",label:"After baths check dogs leaving that day, compare w/ check-in sheet"},
  {id:"fe8",time:"9:00",label:"Check belongings for dogs leaving"},
  {id:"fe9",time:"9:15",label:"Return calls from voicemail log"},
  {id:"fe10",time:"9:30",label:"Check & return emails"},
  {id:"fe11",time:"9:45",label:"Notate any Day Boarders"},
  {id:"fe12",time:"10:00",label:"Evaluations - 10am to noon, document on Eval Log"},
  {id:"fe13",time:"10:15",label:"Clean counters"},
  {id:"fe14",time:"10:30",label:"Clean tour area with rescue wipes as needed"},
  {id:"fe15",time:"10:45",label:"Dust Lobby"},
  {id:"fe16",time:"11:00",label:"AM playtime and let outs begin (initial only when completed)"},
  {id:"fe17",time:"11:15",label:"Recheck EOD"},
  {id:"fe18",time:"11:30",label:"Check & return emails"},
  {id:"fe19",time:"11:45",label:"Open invoice check - Reports > Revenue > Open Invoices"},
  {id:"fe20",time:"12:00",label:"Noon feeding and medication (if needed), Noon feeding/med log"},
  {id:"fe21",time:"12:30",label:"Afternoon walkthrough - Compliance check"},
  {id:"fe22",time:"12:45",label:"Double check dogs that have not left yet, perform Fresh & Clean when needed"},
  {id:"fe23",time:"13:00",label:"Baths for daycare dogs"},
  {id:"fe24",time:"13:15",label:"Run day charge for any boarding dogs that have not been picked up"},
  {id:"fe25",time:"13:30",label:"Check daycare board - daycare list"},
  {id:"fe26",time:"13:45",label:"Make booklet list - 3 or less - daycare list"},
  {id:"fe27",time:"14:00",label:"Vaccinations check"},
  {id:"fe28",time:"14:15",label:"Front Lobby/Tour Area swept & mopped"},
  {id:"fe29",time:"14:30",label:"PM playtime and let outs begin"},
  {id:"fe30",time:"14:45",label:"Exterior walkthrough / perimeter inspections"},
  {id:"fe31",time:"15:00",label:"Paperwork for next day"},
  {id:"fe32",time:"15:15",label:"Check belongings for next day departures"},
  {id:"fe33",time:"15:30",label:"Check & return emails"},
  {id:"fe34",time:"16:00",label:"Scan, name & store new customer policy sheets"},
  {id:"fe35",time:"17:30",label:"PM feeding and medication - replace all food bowls (start earlier if busy)"},
  {id:"fe36",time:"18:00",label:"Clean and set food cart"},
  {id:"fe37",time:"18:30",label:"Double check / update paperwork"},
  {id:"fe38",time:"18:45",label:"Review, close & save EOD"},
  {id:"fe39",time:"19:00",label:"Closing Instructions Checklist"},
  {id:"fe40",time:"19:30",label:"Evening walkthrough / lock up"},
  {id:"fe_ad1",time:"",label:"Follow up on tour forms",dayOfWeek:3},
  {id:"fe_ad2",time:"",label:"Client follow up for minor and major issues (handle within 24hrs)",dayOfWeek:3},
  {id:"fe_ad3",time:"",label:"Send out thank you cards",dayOfWeek:3},
  {id:"fe_ad4",time:"",label:"Print any needed forms",dayOfWeek:3},
  {id:"fe_ad5",time:"",label:"Take inventory for front and back end",dayOfWeek:3},
  {id:"fe_ad6",time:"",label:"Sign check - Upcoming holidays and scheduling",dayOfWeek:3},
];

const POS_BE_TEMPLATE = [
  {id:"be1",time:"6:00",label:"(2) People - Prepare mops for spot cleaning, each daycare, disinfecting and lobby"},
  {id:"be2",time:"6:00",label:"Prepare janitor cart with cleaning supplies, trash bag, gloves and safety materials"},
  {id:"be3",time:"6:10",label:"(2) People - Perform spot cleaning of all accommodation prior to feeding - follow the standard path"},
  {id:"be4",time:"6:10",label:"(1) Person - Mop front lobby and luxury hallway with OdorPet Cherry"},
  {id:"be5",time:"6:45",label:"Clean windows in all customer facing areas"},
  {id:"be6",time:"7:00",label:"Large & Small Daycare will go into daycare to allow for transportation of boarding dogs"},
  {id:"be7",time:"7:00",label:"Daily Room Cleaning of all overnight dogs (follow standard path) - transport daycare dogs to daycare, red collar dogs 1 by 1 for elimination breaks"},
  {id:"be8",time:"7:00",label:"Bring fresh water to each daycare. Note: Mop hallways of each section as you exit"},
  {id:"be9",time:"7:30",label:"Replace water in all boarding rooms"},
  {id:"be10",time:"7:45",label:"Perform all baths (standard and waterless) - check bath list"},
  {id:"be11",time:"8:30",label:"Ensure all drying units are set to 85 or less & never leave a dog unattended"},
  {id:"be12",time:"8:45",label:"Clean bathing area once complete"},
  {id:"be13",time:"9:00",label:"Disinfect rooms - check disinfecting list"},
  {id:"be14",time:"10:00",label:"Shift Change"},
  {id:"be15",time:"10:15",label:"Disinfect bowls, dry and place in storage area"},
  {id:"be16",time:"10:30",label:"Refill water in all boarding rooms and spot clean as needed - Check happiness and health"},
  {id:"be17",time:"11:00",label:"Remove daycare water bowls & clean - leave a new one with water in it behind"},
  {id:"be18",time:"11:15",label:"Clean Kitchen/break area"},
  {id:"be19",time:"11:30",label:"Rake hair and wysiwash outdoor areas - fence/grass of Pens (after personal playtimes)"},
  {id:"be20",time:"12:00",label:"Lunch Change"},
  {id:"be21",time:"12:30",label:"Lunch Change"},
  {id:"be22",time:"13:00",label:"Lunch Change"},
  {id:"be23",time:"13:30",label:"Daycare/additional baths - check bath list"},
  {id:"be24",time:"14:15",label:"Weekly Task - See Weekly Task List"},
  {id:"be25",time:"15:00",label:"Restock any supplies needed from storage"},
  {id:"be26",time:"15:15",label:"Mop with Rescue the front lobby, tour area, and bathrooms; daily clean bathrooms"},
  {id:"be27",time:"16:00",label:"Shift Change"},
  {id:"be28",time:"16:15",label:"Rake hair and wysiwash outdoor areas - fence/grass of Large daycare"},
  {id:"be29",time:"16:45",label:"Rake hair and wysiwash outdoor areas - fence/grass of Small daycare"},
  {id:"be30",time:"17:00",label:"Disinfect outgoing red collar rooms"},
  {id:"be31",time:"17:30",label:"Replace all water bowls with similar size and fill all water bowls"},
  {id:"be32",time:"17:45",label:"Remove daycare water bowls & clean"},
  {id:"be33",time:"18:00",label:"Evening let outs for red collars"},
  {id:"be34",time:"18:30",label:"Bring boarding dogs from small and large daycare back to their rooms"},
  {id:"be35",time:"19:00",label:"Mop small daycare"},
  {id:"be36",time:"19:00",label:"Mop large daycare"},
  {id:"be37",time:"19:00",label:"Change garbages"},
  {id:"be38",time:"19:00",label:"Clean out all mop buckets"},
  {id:"be39",time:"19:15",label:"End of Day"},
  {id:"be_w1",time:"",label:"Disinfect leads, boots, and aprons",dayOfWeek:1},
  {id:"be_w2",time:"",label:"Take inventory and report to front end",dayOfWeek:1},
  {id:"be_w3",time:"",label:"Disinfect outdoor pen area w/ Rescue",dayOfWeek:2},
  {id:"be_w4",time:"",label:"Disinfect small outdoor area w/ Rescue",dayOfWeek:3},
  {id:"be_w5",time:"",label:"Disinfect large outdoor area w/ Rescue",dayOfWeek:4},
  {id:"be_w6",time:"",label:"Disinfect bathrooms",dayOfWeek:5},
  {id:"be_w7",time:"",label:"Disinfect bathing area",dayOfWeek:6},
  {id:"be_w8",time:"",label:"Vacuum and clean vents",dayOfWeek:0},
];

function OperationsHub({ data, save, nav, profile }) {
  const td = todayStr();
  const [viewDate, setViewDate] = useState(td);
  const isToday = viewDate === td;
  const shiftDate = (days) => { const d = new Date(viewDate + "T12:00:00"); d.setDate(d.getDate() + days); setViewDate(d.toISOString().split("T")[0]); };
  const dateLbl = new Date(viewDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const hp = (k) => hasPermission(profile, data, k);

  // ─── Inventory snapshot status for weekly-inventory card ────────────────────
  // Reads from inventory_snapshots + inventory_counts (consolidated source of truth)
  const [invStatus, setInvStatus] = useState(null); // { status, itemsCounted, totalItems, phase, phaseLabel }
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const locId = profile?.location_id;
        if (!locId) { setInvStatus({ status: "not_started", itemsCounted: 0, totalItems: 0, phase: "counting", phaseLabel: "" }); return; }

        // Compute Monday of the viewed week
        const d = new Date(viewDate + "T12:00:00");
        const day = d.getDay();
        const diff = day === 0 ? 6 : day - 1;
        const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - diff);
        const monday = `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, "0")}-${String(mon.getDate()).padStart(2, "0")}`;

        const [catalogRes, snapRes] = await Promise.all([
          supabase.from("inventory_catalog").select("id, par_level").eq("location_id", locId).eq("is_active", true),
          supabase.from("inventory_snapshots").select("id, status")
            .eq("location_id", locId).eq("week_start", monday).maybeSingle(),
        ]);
        if (cancelled) return;

        const catalogItems = catalogRes.data || [];
        const totalItems = catalogItems.length;
        if (snapRes.data?.id) {
          const { data: countRows } = await supabase.from("inventory_counts")
            .select("stock_count, in_transit, ordered, catalog_item_id").eq("snapshot_id", snapRes.data.id);
          if (cancelled) return;
          const rows = countRows || [];
          const counted = rows.filter(r => r.stock_count != null).length;
          const countingDone = counted >= totalItems && totalItems > 0;

          // Compute ordering progress
          const countMap = {};
          rows.forEach(r => { countMap[r.catalog_item_id] = r; });
          let needsOrder = 0, ordered = 0;
          catalogItems.forEach(item => {
            const c = countMap[item.id];
            if (!c || c.stock_count == null) return;
            const toOrder = Math.max(0, (item.par_level || 0) - (parseInt(c.stock_count, 10) || 0) - (parseInt(c.in_transit, 10) || 0));
            if (toOrder > 0) { needsOrder++; if (c.ordered) ordered++; }
          });
          const orderingDone = needsOrder === 0 || ordered >= needsOrder;
          const allDone = countingDone && orderingDone;

          let status, phase, phaseLabel;
          if (allDone) {
            status = "completed"; phase = "done"; phaseLabel = "Completed this week";
          } else if (countingDone) {
            status = "in_progress"; phase = "ordering"; phaseLabel = `${ordered}/${needsOrder} items ordered`;
          } else if (counted > 0) {
            status = "in_progress"; phase = "counting"; phaseLabel = `${counted}/${totalItems} items counted`;
          } else {
            status = "not_started"; phase = "counting"; phaseLabel = "Not started this week";
          }
          if (!cancelled) setInvStatus({ status, itemsCounted: counted, totalItems, phase, phaseLabel, needsOrder, ordered });
        } else {
          if (!cancelled) setInvStatus({ status: "not_started", itemsCounted: 0, totalItems, phase: "counting", phaseLabel: totalItems > 0 ? "Not started this week" : "" });
        }
      } catch { if (!cancelled) setInvStatus({ status: "not_started", itemsCounted: 0, totalItems: 0, phase: "counting", phaseLabel: "" }); }
    })();
    return () => { cancelled = true; };
  }, [viewDate, profile?.location_id]);

  // Calendar popup
  const [showCalendar, setShowCalendar] = useState(false);
  const [calMonth, setCalMonth] = useState(() => new Date(viewDate + "T12:00:00").getMonth());
  const [calYear, setCalYear] = useState(() => new Date(viewDate + "T12:00:00").getFullYear());
  useEffect(() => { const d = new Date(viewDate + "T12:00:00"); setCalMonth(d.getMonth()); setCalYear(d.getFullYear()); }, [showCalendar]);
  const calDays = useMemo(() => { const first = new Date(calYear, calMonth, 1); const startDay = first.getDay(); const dim = new Date(calYear, calMonth + 1, 0).getDate(); const cells = []; for (let i = 0; i < startDay; i++) cells.push(null); for (let d = 1; d <= dim; d++) cells.push(d); return cells; }, [calMonth, calYear]);
  const calMonthLabel = new Date(calYear, calMonth).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const calPrev = () => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); };
  const calNext = () => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); };
  const calSelect = (day) => { const m = String(calMonth + 1).padStart(2, "0"); const d = String(day).padStart(2, "0"); setViewDate(`${calYear}-${m}-${d}`); setShowCalendar(false); };
  const calRef = useRef(null);
  useEffect(() => { if (!showCalendar) return; const handler = (e) => { if (calRef.current && !calRef.current.contains(e.target)) setShowCalendar(false); }; document.addEventListener("mousedown", handler); return () => document.removeEventListener("mousedown", handler); }, [showCalendar]);

  // Today's Progress snapshot
  const [showTodayProgress, setShowTodayProgress] = useState(false);

  // Summary stats — lightweight: only today's completion for the progress footer
  const summaryStats = useMemo(() => {
    const activeItems = OPERATIONS_CATALOG.filter(c => c.frequency === "daily" && !c.comingSoon && c.dataKey !== "eodEntries");
    const todayCompleted = activeItems.filter(c => getOpsCardStatus(data, c, viewDate) === "completed").length;
    const todayTotal = activeItems.length;
    const todayPct = todayTotal > 0 ? Math.round((todayCompleted / todayTotal) * 100) : 0;
    return { todayCompleted, todayTotal, todayPct };
  }, [data, viewDate]);

  // ─── Inline Checklist Expansion (OPS-007, OPS-008, OPS-009) ────────────────
  const [expandedCard, setExpandedCard] = useState(null);
  const [savingCard, setSavingCard] = useState(null);

  // Resolve template items for a given checklist type
  const getTemplateForType = useCallback((typeSub) => {
    const templates = { opening: data.openingTemplate || DEF_OPENING_TEMPLATE, fe_checklist: data.feTemplate || POS_FE_TEMPLATE, be_checklist: data.beTemplate || POS_BE_TEMPLATE, closing: data.closingTemplate || DEF_CLOSING_TEMPLATE };
    const template = templates[typeSub];
    if (!template) return [];
    const dayIdx = new Date(viewDate + "T12:00:00").getDay();
    return template.filter(t => t.dayOfWeek == null || t.dayOfWeek === dayIdx);
  }, [data, viewDate]);

  // Get saved items for an ops entry
  const getOpsEntry = useCallback((typeSub) => {
    const entryId = `ops_${typeSub}_${viewDate}`;
    const allOps = data.dailyOps || [];
    return allOps.find(e => e.id === entryId);
  }, [data, viewDate]);

  // Format timestamp for display
  const fmtCompletionTime = (isoStr) => {
    if (!isoStr) return "";
    const d = new Date(isoStr);
    const h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, "0");
    const ampm = h >= 12 ? "PM" : "AM";
    const hr = h > 12 ? h - 12 : h || 12;
    return `${hr}:${m} ${ampm}`;
  };

  // Auto-save toggle handler (OPS-008: auto-save on toggle, OPS-007: records timestamp)
  const handleChecklistToggle = useCallback(async (typeSub, itemId, checked) => {
    const entryId = `ops_${typeSub}_${viewDate}`;
    const allOps = [...(data.dailyOps || [])];
    const idx = allOps.findIndex(e => e.id === entryId);
    const existingEntry = idx >= 0 ? allOps[idx] : null;
    const existingItems = existingEntry ? (existingEntry.items || {}) : {};
    const userName = profile?.full_name || profile?.name || profile?.email || "";

    const updatedItems = {
      ...existingItems,
      [itemId]: checked
        ? { checked: true, initials: userName, completedAt: new Date().toISOString() }
        : { checked: false, initials: "", completedAt: "" }
    };

    const entry = {
      id: entryId,
      type: typeSub,
      date: viewDate,
      locked: existingEntry?.locked || false,
      items: updatedItems,
      history: [...(existingEntry?.history || []), { ts: new Date().toISOString(), action: idx < 0 ? "created" : "saved" }],
    };

    if (idx >= 0) allOps[idx] = entry; else allOps.push(entry);

    setSavingCard(typeSub);
    try {
      await save({ ...data, dailyOps: allOps });
    } finally {
      setSavingCard(null);
    }
  }, [data, viewDate, profile, save]);

  // ─── Today's Progress snapshot data (LAZY: only compute when panel open) ───
  const todayProgressData = useMemo(() => {
    if (!showTodayProgress) return null;
    const reservations = data.reservations || [];
    const allOps = data.dailyOps || [];
    const dogs = data.dogs || [];

    // Dogs in house: physically checked in and not yet checked out
    const inHouseRes = reservations.filter(r => r.status === "checked-in");
    // Deduplicate by dogId to avoid counting the same dog twice for overlapping reservations
    const seenDogIds = new Set();
    const inHouse = inHouseRes.filter(r => {
      if (!r.dogId) return true;
      if (seenDogIds.has(r.dogId)) return false;
      seenDogIds.add(r.dogId);
      return true;
    });
    const inHouseBoarding = inHouse.filter(r => r.type === "boarding");
    const inHouseDaycare = inHouse.filter(r => r.type === "daycare" || r.type === "dayboarding");
    const dogsInHouse = inHouse.length;

    // Going home today (checked-in, scheduled or actual checkOut === viewDate)
    const goingHome = reservations.filter(r => r.status === "checked-in" && (r.checkOut === viewDate || r.scheduledCheckOut === viewDate));
    // Already checked out today (actual checkout date is today)
    const checkedOut = reservations.filter(r => r.checkOut === viewDate && r.status === "checked-out");

    // Room cleaning stats + awaiting checkout count
    const roomStats = getRoomCleaningStats(data, viewDate);
    const boardingCheckedOut = reservations.filter(r => r.type === "boarding" && r.checkOut === viewDate && r.status === "checked-out");
    const roomsAwaitingCheckout = inHouseBoarding.filter(r =>
      (r.checkOut === viewDate || r.scheduledCheckOut === viewDate) &&
      !boardingCheckedOut.find(co => co.room === r.room)
    ).length;

    // Baths: checked-in dogs checking out today that have a bath type (includes departure time)
    const bathRows = [];
    inHouse.forEach(res => {
      const dog = dogs.find(d => d.id === res.dogId);
      if (!dog) return;
      const bath = res.careOverrides?.bath_type || dog.fields.bath_type || "";
      if (bath && res.checkOut === viewDate) {
        const logKey = `${viewDate}|bathing`;
        const administered = !!(res.activityLog && res.activityLog[logKey] && res.activityLog[logKey].administered);
        const coTime = res.checkOutTime || "";
        // Resolve room display — keep codes like DC1, SC5 intact instead of stripping to just numbers
        const roomNum = (() => {
          if (!res.room) return "—";
          const r = res.room.trim();
          if (/^[A-Z]{1,3}\d+[A-Za-z]?$/.test(r)) return r;
          const m = r.match(/(?:Luxury Suite|Executive Room|Double Compartment|Single Compartment)\s+(.+)/i);
          if (m) return m[1].trim();
          return (r.match(/(\d+[A-Za-z]*)$/) || [])[1] || r;
        })();
        bathRows.push({ dogName: dog.fields.name, bathType: bath, done: administered, checkOutTime: coTime, room: roomNum });
      }
    });
    bathRows.sort((a, b) => (a.room || "").localeCompare(b.room || "", undefined, { numeric: true }));
    const bathsTotal = bathRows.length;
    const bathsDone = bathRows.filter(b => b.done).length;

    // Private play stats (3 required sessions per dog)
    const ppStats = getPPStats(data, viewDate);
    const ppEntryId = `ops_pp_${viewDate}`;
    const ppEntry = allOps.find(e => e.id === ppEntryId);
    const ppItems = ppEntry ? ppEntry.items || {} : {};
    let ppLastTime = null;
    Object.values(ppItems).forEach(d => {
      if (d && d.sessions) d.sessions.forEach(s => { if (s.time) ppLastTime = s.time; });
    });

    // Checklist progress for each ops type
    const checklistProgress = {};
    const activeItems = OPERATIONS_CATALOG.filter(c => c.frequency === "daily" && !c.comingSoon && c.dataKey !== "eodEntries");
    activeItems.forEach(item => {
      const progress = getOpsProgress(data, item, viewDate);
      const status = getOpsCardStatus(data, item, viewDate);
      const countLabel = getOpsCountLabel(data, item, viewDate);
      checklistProgress[item.typeSub || item.id] = { label: item.label, progress, status, countLabel };
    });

    // Closing procedures specifically
    const closingEntryId = `ops_closing_${viewDate}`;
    const closingEntry = allOps.find(e => e.id === closingEntryId);
    const closingTemplate = data.closingTemplate || DEF_CLOSING_TEMPLATE;
    const dayIdx = new Date(viewDate + "T12:00:00").getDay();
    const closingItems = closingTemplate.filter(t => t.dayOfWeek == null || t.dayOfWeek === dayIdx);
    const closingTotal = closingItems.length;
    let closingDone = 0;
    if (closingEntry && closingEntry.items) {
      const ci = closingEntry.items;
      closingDone = !Array.isArray(ci) ? Object.values(ci).filter(i => i && i.checked).length : ci.filter(i => i.checked).length;
    }

    // ─── Lifecycle stats (optimized with pre-built lookup maps) ───
    const clients = data.clients || [];
    const payments = data.payments || [];
    const allRes = data.reservations || [];
    const td = todayStr();

    // Build O(1) lookup maps to avoid O(n*m) per-client filtering
    const resByClient = {};
    const pmtsByClient = {};
    allRes.forEach(r => { (resByClient[r.clientId] || (resByClient[r.clientId] = [])).push(r); });
    payments.forEach(p => {
      if (p.status === "completed" && p.type !== "refund") {
        (pmtsByClient[p.clientId] || (pmtsByClient[p.clientId] = [])).push(p);
      }
    });

    const dcThresh = data.resortPolicies?.retentionDaycareDays ?? 90;
    const bdThresh = data.resortPolicies?.retentionBoardingDays ?? 180;
    let overdueFollowUps = 0;
    let dueTodayFollowUps = 0;
    let logsToday = 0;
    let newCustomersToday = 0;

    clients.forEach(c => {
      // Stage classification (inlined, single-pass)
      const cRes = resByClient[c.id] || [];
      const cPmts = pmtsByClient[c.id] || [];
      const hasSpent = cPmts.length > 0;
      const isCold = c.lifecycle?.cold === true;
      let hasRealBooking = false, hasUpcoming = false, daycareCount = 0, boardingCount = 0, latestCheckOut = "";
      for (let i = 0; i < cRes.length; i++) {
        const r = cRes[i];
        if (r.type !== "tour" && r.type !== "evaluation") hasRealBooking = true;
        if (r.checkIn >= td && r.status === "upcoming" && r.type !== "tour" && r.type !== "evaluation") hasUpcoming = true;
        if (r.type === "daycare") daycareCount++;
        if (r.type === "boarding") boardingCount++;
        if (r.checkOut && r.checkOut < td && r.checkOut > latestCheckOut) latestCheckOut = r.checkOut;
      }
      const totalRes = cRes.length;
      const daysSince = latestCheckOut ? Math.floor((new Date() - new Date(latestCheckOut + "T12:00:00")) / 86400000) : null;
      let isRetention = false;
      if (hasSpent && !hasUpcoming && totalRes > 0 && daysSince != null) {
        const dcPct = daycareCount / totalRes;
        const bdPct = boardingCount / totalRes;
        if (bdPct > 0.5 && daysSince >= bdThresh) isRetention = true;
        else if (dcPct >= 0.5 && daysSince >= dcThresh) isRetention = true;
        else if (dcPct < 0.5 && bdPct < 0.5 && daysSince >= dcThresh) isRetention = true;
      }
      if (isCold) isRetention = false;
      const isConversion = !hasSpent && !hasRealBooking && !isCold;

      // Follow-up check (inline with stage)
      const convFu = (isConversion && c.lifecycle?.conversion?.followUpDate) || "";
      const retFu = (isRetention && c.lifecycle?.retention?.followUpDate) || "";
      const fu = convFu || retFu;
      if (fu && fu < viewDate) overdueFollowUps++;
      if (fu && fu === viewDate) dueTodayFollowUps++;

      // Logs today
      const convUpdates = c.lifecycle?.conversion?.updates;
      const retUpdates = c.lifecycle?.retention?.updates;
      if (convUpdates) for (let i = 0; i < convUpdates.length; i++) { if (convUpdates[i].loggedAt?.startsWith(viewDate)) logsToday++; }
      if (retUpdates) for (let i = 0; i < retUpdates.length; i++) { if (retUpdates[i].loggedAt?.startsWith(viewDate)) logsToday++; }

      // New customer
      const ca = c.createdAt || "";
      if (ca.startsWith(viewDate) || ca === viewDate) newCustomersToday++;
    });

    // New PAYING customers: clients whose first-ever completed payment was on viewDate
    let newPayingToday = 0;
    Object.values(pmtsByClient).forEach(pmts => {
      pmts.sort((a, b) => (a.timestamp || "").localeCompare(b.timestamp || ""));
      const first = pmts[0];
      if (first?.timestamp?.startsWith(viewDate)) newPayingToday++;
    });

    return {
      dogsInHouse,
      boardingCount: inHouseBoarding.length,
      daycareCount: inHouseDaycare.length,
      goingHome: goingHome.length,
      checkedOut: checkedOut.length,
      roomStats,
      roomsAwaitingCheckout,
      bathsTotal,
      bathsDone,
      bathRows,
      ppTotalDogs: ppStats.totalDogs,
      ppRequiredSessions: ppStats.requiredSessions,
      ppCompletedRequired: ppStats.completedSessions,
      ppTotalLogged: ppStats.totalLogged,
      ppLastTime,
      checklistProgress,
      closingTotal,
      closingDone,
      overdueFollowUps,
      dueTodayFollowUps,
      logsToday,
      newCustomersToday,
      newPayingToday,
    };
  }, [data, viewDate, showTodayProgress]);

  const groups = [
    { key: "daily", label: "Daily Operations", items: OPERATIONS_CATALOG.filter(c => c.frequency === "daily") },
    { key: "weekly", label: "Weekly Maintenance", items: OPERATIONS_CATALOG.filter(c => c.frequency === "weekly") },
  ];

  const statusConfig = {
    not_started: { label: "Not Started", bg: C.surfaceHover, color: C.textMut, barColor: C.borderLight },
    in_progress: { label: "In Progress", bg: C.warnLt, color: C.warn, barColor: "#F59E0B" },
    completed: { label: "Completed", bg: C.sucLt, color: C.suc, barColor: "#10B981" },
    coming_soon: { label: "Coming Soon", bg: C.surfaceHover, color: C.textMut, barColor: C.borderLight },
    none: { label: "", bg: "transparent", color: "transparent", barColor: "transparent" },
  };

  const nbtn = { border: "none", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: 12 };

  if (data.loading) return (
    <div style={{ padding: 60, textAlign: "center" }}>
      <K9LoadingAnimation size={56} message="Loading operations data..." subMessage="Fetching from cache" />
    </div>
  );

  return (
    <div style={{ padding: "0 8px" }}>
      {/* Header with date nav */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: C.text, margin: 0, letterSpacing: "-0.02em" }}>Operations</h2>
          <button onClick={() => setShowTodayProgress(v => !v)} style={{ border: "none", borderRadius: 10, padding: "7px 16px", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 12, background: showTodayProgress ? C.pri : C.accLt, color: showTodayProgress ? "#fff" : C.accDk, transition: "all 0.2s", letterSpacing: "0.02em" }}>
            {showTodayProgress ? "✕ Close" : "Today's Progress"}
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, position: "relative" }}>
          <button onClick={() => shiftDate(-1)} style={{ ...nbtn, background: C.surfaceHover, color: C.text }}>‹</button>
          <button onClick={() => setShowCalendar(v => !v)} style={{ ...nbtn, background: "transparent", color: C.text, minWidth: 220, textAlign: "center", fontSize: 14, fontWeight: 700 }}>{dateLbl}</button>
          <button onClick={() => shiftDate(1)} style={{ ...nbtn, background: C.surfaceHover, color: C.text }}>›</button>
          {!isToday && <button onClick={() => setViewDate(td)} style={{ ...nbtn, background: C.pri, color: "#fff" }}>Today</button>}
          {showCalendar && (
            <div ref={calRef} style={{ position: "absolute", top: "100%", right: 0, marginTop: 8, background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: 14, padding: 16, boxShadow: "0 12px 40px rgba(0,0,0,0.12)", zIndex: 100, width: 280 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <button onClick={calPrev} style={{ ...nbtn, background: C.surfaceHover }}>‹</button>
                <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{calMonthLabel}</span>
                <button onClick={calNext} style={{ ...nbtn, background: C.surfaceHover }}>›</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
                {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => <div key={d} style={{ textAlign: "center", fontSize: 10, fontWeight: 700, color: C.textMut, padding: 4 }}>{d}</div>)}
                {calDays.map((d, i) => d ? (
                  <button key={i} onClick={() => calSelect(d)} style={{ border: "none", borderRadius: 6, padding: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", background: `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}` === viewDate ? C.pri : "transparent", color: `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}` === viewDate ? "#fff" : C.text }}>{d}</button>
                ) : <div key={i} />)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Today's Progress snapshot */}
      {showTodayProgress && todayProgressData && (() => {
        const tp = todayProgressData;
        const cp = tp.checklistProgress;
        const pctBar = (done, total, color) => {
          const pct = total > 0 ? Math.round((done / total) * 100) : 0;
          return (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
              <div style={{ flex: 1, height: 6, borderRadius: 3, background: C.borderLight, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", borderRadius: 3, background: pct === 100 ? C.suc : color || C.pri, transition: "width 0.3s" }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: pct === 100 ? C.suc : C.text, minWidth: 38, textAlign: "right" }}>{pct}%</span>
            </div>
          );
        };
        const metricCard = (label, value, sub, accent) => (
          <div style={{ background: C.surface, borderRadius: 14, padding: "18px 20px", border: `1.5px solid ${C.border}`, flex: "1 1 140px", minWidth: 140 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: accent || C.pri, lineHeight: 1 }}>{value}</div>
            {sub && <div style={{ fontSize: 12, color: C.textSec, marginTop: 4 }}>{sub}</div>}
          </div>
        );
        const progressRow = (label, done, total, color) => (
          <div style={{ padding: "10px 0", borderBottom: `1px solid ${C.borderLight}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{label}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: done >= total && total > 0 ? C.suc : C.text }}>{done}/{total}</span>
            </div>
            {pctBar(done, total, color)}
          </div>
        );
        // Parse checklist count labels like "3/7 tasks" or "2/5 rooms"
        const parseCount = (countLabel) => {
          if (!countLabel) return { done: 0, total: 0 };
          const m = countLabel.match(/^(\d+)\/(\d+)/);
          return m ? { done: parseInt(m[1]), total: parseInt(m[2]) } : { done: 0, total: 0 };
        };
        return (
          <div style={{ marginBottom: 20, background: `linear-gradient(135deg, ${C.priLt} 0%, #F8F6F0 100%)`, borderRadius: 18, border: `1.5px solid ${C.border}`, overflow: "hidden" }}>
            {/* Header bar */}
            <div style={{ background: C.pri, padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: "#fff", letterSpacing: "0.01em" }}>Today's Progress</span>
                <span style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.65)" }}>{isToday ? "Live" : dateLbl}</span>
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Read-Only Snapshot</span>
            </div>

            <div style={{ padding: "20px 24px" }}>
              {/* Top metric cards */}
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
                {metricCard("Dogs In House", tp.dogsInHouse, `${tp.boardingCount} boarding · ${tp.daycareCount} daycare`, C.pri)}
                {metricCard("Going Home", tp.goingHome, "departures today", "#D97706")}
                {metricCard("Checked Out", tp.checkedOut, "completed today", C.suc)}
              </div>

              {/* Two-column layout for progress details */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                {/* Left column: Room Cleaning & Baths */}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.pri, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 10, paddingBottom: 6, borderBottom: `2px solid ${C.pri}` }}>Cleaning & Baths</div>

                  {progressRow("Room Cleaning", tp.roomStats.totalDone, tp.roomStats.totalNeeded, C.pri)}
                  {tp.roomStats.totalSetups > 0 && progressRow("Room Setups", tp.roomStats.doneSetups || 0, tp.roomStats.totalSetups, C.pri)}
                  {tp.roomsAwaitingCheckout > 0 && (
                    <div style={{ padding: "4px 0 6px", fontSize: 11, color: C.warn, fontWeight: 600 }}>
                      {tp.roomsAwaitingCheckout} room{tp.roomsAwaitingCheckout !== 1 ? "s" : ""} awaiting checkout for disinfect
                    </div>
                  )}

                  <div style={{ padding: "10px 0", borderBottom: `1px solid ${C.borderLight}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Baths</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: tp.bathsDone >= tp.bathsTotal && tp.bathsTotal > 0 ? C.suc : C.text }}>{tp.bathsDone}/{tp.bathsTotal}</span>
                    </div>
                    {pctBar(tp.bathsDone, tp.bathsTotal, C.acc)}
                    {tp.bathRows.length > 0 && (
                      <div style={{ marginTop: 6 }}>
                        {tp.bathRows.map((b, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: C.textSec, padding: "2px 0" }}>
                            <span style={{ width: 16, height: 16, borderRadius: 4, display: "inline-flex", alignItems: "center", justifyContent: "center", border: `1.5px solid ${b.done ? C.suc : C.border}`, background: b.done ? C.suc : "transparent", flexShrink: 0 }}>{b.done ? <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2 6L5 9L10 3" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg> : null}</span>
                            <span style={{ fontWeight: 600 }}>{b.dogName}</span>
                            <span style={{ color: C.pri, fontWeight: 700, fontSize: 10 }}>Rm {b.room}</span>
                            <span style={{ color: C.textMut }}>({b.bathType})</span>
                            {b.checkOutTime && <span style={{ color: C.acc, fontWeight: 600 }}>· out {(() => { const [h,m] = b.checkOutTime.split(":"); const hr = parseInt(h); return `${hr > 12 ? hr-12 : hr || 12}:${m} ${hr >= 12 ? "PM" : "AM"}`; })()}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>

                {/* Right column: Private Play & Checklists */}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.pri, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 10, paddingBottom: 6, borderBottom: `2px solid ${C.pri}` }}>Checklists & Activities</div>

                  {/* Private Play */}
                  {progressRow("Private Play", tp.ppCompletedRequired, tp.ppRequiredSessions, C.pri)}
                  <div style={{ padding: "2px 0 8px", display: "flex", gap: 16, fontSize: 11, color: C.textSec }}>
                    <span>{tp.ppTotalDogs} dog{tp.ppTotalDogs !== 1 ? "s" : ""} · {tp.ppTotalLogged} total session{tp.ppTotalLogged !== 1 ? "s" : ""}</span>
                    {tp.ppLastTime && <span style={{ color: C.textMut }}>Last: {tp.ppLastTime}</span>}
                  </div>

                  {/* Opening Checklist */}
                  {cp.opening && (() => {
                    const oc = parseCount(cp.opening.countLabel);
                    return progressRow("Opening Checklist", oc.done, oc.total, C.pri);
                  })()}

                  {/* Front-End Checklist */}
                  {cp.fe && (() => {
                    const fc = parseCount(cp.fe.countLabel);
                    return progressRow("Front-End Checklist", fc.done, fc.total, C.acc);
                  })()}

                  {/* Back-End Checklist */}
                  {cp.be && (() => {
                    const bc = parseCount(cp.be.countLabel);
                    return progressRow("Back-End Checklist", bc.done, bc.total, C.acc);
                  })()}

                  {/* Closing Procedures */}
                  {progressRow("Closing Procedures", tp.closingDone, tp.closingTotal, C.dan)}
                </div>
              </div>

              {/* Lifecycle & Customer Stats */}
              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.pri, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 12, paddingBottom: 6, borderBottom: `2px solid ${C.pri}` }}>Customer Lifecycle</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 10 }}>
                  {/* Overdue Follow-Ups */}
                  <div style={{ background: tp.overdueFollowUps > 0 ? C.danLt : C.surface, borderRadius: 12, padding: "14px 16px", border: `1.5px solid ${tp.overdueFollowUps > 0 ? C.dan + "40" : C.border}` }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Overdue Follow-Ups</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: tp.overdueFollowUps > 0 ? C.dan : C.suc, lineHeight: 1 }}>{tp.overdueFollowUps}</div>
                    {tp.overdueFollowUps > 0 && <div style={{ fontSize: 11, color: C.dan, marginTop: 3, fontWeight: 600 }}>overdue</div>}
                  </div>
                  {/* Due Today */}
                  <div style={{ background: tp.dueTodayFollowUps > 0 ? C.warnLt : C.surface, borderRadius: 12, padding: "14px 16px", border: `1.5px solid ${tp.dueTodayFollowUps > 0 ? C.warn + "40" : C.border}` }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Due Today</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: tp.dueTodayFollowUps > 0 ? C.warn : C.textMut, lineHeight: 1 }}>{tp.dueTodayFollowUps}</div>
                    <div style={{ fontSize: 11, color: C.textSec, marginTop: 3 }}>follow-ups scheduled</div>
                  </div>
                  {/* Logs Today */}
                  <div style={{ background: C.surface, borderRadius: 12, padding: "14px 16px", border: `1.5px solid ${C.border}` }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Logs Today</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: tp.logsToday > 0 ? C.pri : C.textMut, lineHeight: 1 }}>{tp.logsToday}</div>
                    <div style={{ fontSize: 11, color: C.textSec, marginTop: 3 }}>updates recorded</div>
                  </div>
                  {/* New Customers */}
                  <div style={{ background: C.surface, borderRadius: 12, padding: "14px 16px", border: `1.5px solid ${C.border}` }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>New Customers</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: tp.newCustomersToday > 0 ? C.info : C.textMut, lineHeight: 1 }}>{tp.newCustomersToday}</div>
                    <div style={{ fontSize: 11, color: C.textSec, marginTop: 3 }}>created today</div>
                  </div>
                  {/* New Paying Customers */}
                  <div style={{ background: tp.newPayingToday > 0 ? C.sucLt : C.surface, borderRadius: 12, padding: "14px 16px", border: `1.5px solid ${tp.newPayingToday > 0 ? C.suc + "40" : C.border}` }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>First-Time Payers</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: tp.newPayingToday > 0 ? C.suc : C.textMut, lineHeight: 1 }}>{tp.newPayingToday}</div>
                    <div style={{ fontSize: 11, color: C.textSec, marginTop: 3 }}>first payment today</div>
                  </div>
                </div>
              </div>

              {/* Overall progress footer */}
              <div style={{ marginTop: 20, padding: "14px 20px", background: C.surface, borderRadius: 12, border: `1.5px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Overall Checklists</span>
                  <span style={{ fontSize: 22, fontWeight: 800, color: summaryStats.todayPct === 100 ? C.suc : C.pri }}>{summaryStats.todayPct}%</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.textSec }}>{summaryStats.todayCompleted} of {summaryStats.todayTotal} complete</span>
                  <div style={{ width: 120, height: 8, borderRadius: 4, background: C.borderLight, overflow: "hidden" }}>
                    <div style={{ width: `${summaryStats.todayPct}%`, height: "100%", borderRadius: 4, background: summaryStats.todayPct === 100 ? C.suc : C.pri, transition: "width 0.3s" }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}


      {groups.map(group => {
        const visibleItems = group.items.filter(item => item.comingSoon || !item.permission || hp(item.permission));
        if (visibleItems.length === 0) return null;
        return (
          <div key={group.key} style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
              {group.label}
              <span style={{ fontSize: 12, fontWeight: 500, color: C.textMut, marginLeft: 4 }}>
                ({visibleItems.length} {visibleItems.length === 1 ? "item" : "items"})
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
              {visibleItems.map(item => {
                // Inventory card: override status from Supabase snapshot
                const isInv = item.id === "weekly-inventory";
                const status = isInv && invStatus ? invStatus.status : getOpsCardStatus(data, item, viewDate);
                const progress = isInv && invStatus ? (
                  invStatus.status === "completed" ? 100
                  : invStatus.phase === "ordering" ? (invStatus.needsOrder > 0 ? Math.round((invStatus.ordered / invStatus.needsOrder) * 100) : 100)
                  : invStatus.totalItems > 0 ? Math.round((invStatus.itemsCounted / invStatus.totalItems) * 100) : 0
                ) : getOpsProgress(data, item, viewDate);
                const countLabel = isInv && invStatus ? invStatus.phaseLabel : getOpsCountLabel(data, item, viewDate);
                const sc = statusConfig[status];
                const isComingSoon = item.comingSoon;
                const isEod = item.dataKey === "eodEntries";
                const hasInlineChecklist = ["opening", "fe", "be", "closing"].includes(item.typeSub);
                const isExpanded = expandedCard === item.id;
                const templateItems = isExpanded && hasInlineChecklist ? getTemplateForType(item.typeSub) : [];
                const opsEntry = isExpanded && hasInlineChecklist ? getOpsEntry(item.typeSub) : null;
                const savedItems = opsEntry?.items || {};
                const isLocked = opsEntry?.locked || false;
                return (
                  <div key={item.id}
                    style={{
                      background: C.surface, borderRadius: 16,
                      border: `1.5px solid ${isEod ? C.border : status === "completed" ? C.suc : status === "in_progress" ? C.warn : C.border}`,
                      cursor: isComingSoon ? "default" : "pointer",
                      opacity: isComingSoon ? 0.55 : 1,
                      transition: "all 0.2s cubic-bezier(0.4,0,0.2,1)",
                      position: "relative",
                      gridColumn: isExpanded ? "1 / -1" : undefined,
                      boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)",
                    }}
                    onMouseEnter={e => { if (!isComingSoon && !isExpanded) { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.04)"; }}}
                    onMouseLeave={e => { if (!isExpanded) { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)"; } }}
                  >
                    {/* Card header */}
                    <div style={{ padding: "18px 20px" }} onClick={() => {
                      if (isComingSoon) return;
                      if (hasInlineChecklist) { setExpandedCard(isExpanded ? null : item.id); }
                      else { nav(item.routeTo); }
                    }}>
                      <div style={{ marginBottom: 10, display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{item.label}</div>
                          {countLabel && <div style={{ fontSize: 12, color: C.textSec, marginTop: 3 }}>{countLabel}</div>}
                        </div>
                        {!isComingSoon && hasInlineChecklist && (
                          <span style={{ fontSize: 12, color: C.textMut, fontWeight: 600, transform: isExpanded ? "rotate(90deg)" : "none", transition: "transform 0.2s", marginTop: 2 }}>›</span>
                        )}
                        {!isComingSoon && !hasInlineChecklist && (
                          <span style={{ color: C.textMut, fontSize: 16, marginTop: -2 }}>›</span>
                        )}
                      </div>
                      {!isEod && (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: sc.bg, color: sc.color, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                          {sc.label}
                        </span>
                        {!isComingSoon && <span style={{ fontSize: 12, fontWeight: 600, color: sc.color }}>{progress}%</span>}
                      </div>
                      )}
                      {!isComingSoon && !isEod && (
                        <div style={{ marginTop: 8, height: 4, borderRadius: 2, background: C.borderLight, overflow: "hidden" }}>
                          <div style={{ width: `${progress}%`, height: "100%", borderRadius: 2, background: sc.barColor, transition: "width 0.4s cubic-bezier(0.4,0,0.2,1)" }} />
                        </div>
                      )}
                    </div>

                    {/* Inline checklist expansion (OPS-007/008/009) */}
                    {isExpanded && hasInlineChecklist && (
                      <div style={{ borderTop: `1px solid ${C.borderLight}`, padding: "0 20px 16px" }}>
                        {savingCard === item.typeSub && (
                          <div style={{ padding: "6px 0", fontSize: 11, color: C.pri, fontWeight: 600, textAlign: "right" }}>Saving...</div>
                        )}
                        {isLocked && (
                          <div style={{ padding: "8px 12px", margin: "12px 0 4px", background: C.warnLt, borderRadius: 8, fontSize: 12, color: C.warn, fontWeight: 600 }}>This checklist is locked.</div>
                        )}
                        {templateItems.map(t => {
                          const it = savedItems[t.id] || {};
                          const isChecked = !!it.checked;
                          return (
                            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid ${C.borderLight}` }}>
                              {/* OPS-009: Standardized checkbox UI */}
                              <div
                                onClick={(e) => { e.stopPropagation(); if (!isLocked) handleChecklistToggle(item.typeSub, t.id, !isChecked); }}
                                style={{
                                  width: 22, height: 22, borderRadius: 6, flexShrink: 0, cursor: isLocked ? "default" : "pointer",
                                  border: `2px solid ${isChecked ? C.pri : C.border}`,
                                  background: isChecked ? C.pri : "transparent",
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                  transition: "all 0.15s ease",
                                }}
                              >
                                {isChecked && (
                                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                    <path d="M2 6L5 9L10 3" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                )}
                              </div>
                              {/* Task label + time */}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 500, color: isChecked ? C.textMut : C.text, textDecoration: isChecked ? "line-through" : "none", lineHeight: 1.4 }}>
                                  {t.time && <span style={{ color: C.pri, fontWeight: 700, fontSize: 11, marginRight: 6 }}>{t.time}</span>}
                                  {t.label}
                                </div>
                                {/* OPS-007: Timestamp logging */}
                                {isChecked && it.initials && (
                                  <div style={{ fontSize: 11, color: C.textMut, marginTop: 2 }}>
                                    Completed by {it.initials}{it.completedAt ? ` at ${fmtCompletionTime(it.completedAt)}` : ""}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        {/* Link to full view */}
                        <div style={{ marginTop: 12, textAlign: "center" }}>
                          <span
                            onClick={(e) => { e.stopPropagation(); nav(item.routeTo); }}
                            style={{ fontSize: 12, fontWeight: 600, color: C.pri, cursor: "pointer", padding: "6px 16px", borderRadius: 8, background: C.priLt, transition: "background 0.15s" }}
                            onMouseEnter={e => { e.currentTarget.style.background = C.pri + "20"; }}
                            onMouseLeave={e => { e.currentTarget.style.background = C.priLt; }}
                          >
                            Open Full View →
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}


      {/* ─── Services Section (Dynamic from Gingr) ─────────────────────────────── */}
      {(hp("view_daily_ops")) && (() => {
        // Dynamically discover all unique services from today's in-house reservations
        const EXCLUDED_SERVICES = ["food from home", "medication administration", "private play overnight rate"];
        const reservations = data.reservations || [];
        const dataLoaded = reservations.length > 0;
        const inHouseToday = reservations.filter(r =>
          (r.status === "checked-in") ||
          (r.status === "upcoming" && (r.scheduledCheckIn || r.checkIn) <= viewDate && (r.scheduledCheckOut || r.checkOut) >= viewDate)
        );
        const svcSet = new Set();
        inHouseToday.forEach(res => {
          const svcs = res._services;
          if (!svcs) return;
          const arr = Array.isArray(svcs) ? svcs : [];
          arr.forEach(s => {
            const name = typeof s === "string" ? s : (s && s.name ? s.name : null);
            if (!name) return;
            const lc = name.toLowerCase();
            if (EXCLUDED_SERVICES.some(ex => lc.includes(ex))) return;
            svcSet.add(name);
          });
        });
        // Merge Pamper Package and Pamper Package Plus into one card
        const hasPamper = svcSet.has("Pamper Package") || svcSet.has("Pamper Package Plus");
        svcSet.delete("Pamper Package");
        svcSet.delete("Pamper Package Plus");

        // Always show Bathing + Pamper as core services, even before data loads
        const orderedServices = [];
        orderedServices.push({ name: "Bath", routeKey: "bathing", desc: "Auto-pulled bath types from Gingr" });
        svcSet.delete("Bath");
        orderedServices.push({ name: "Pamper Package Plus", routeKey: "pamper", desc: "Luxury Suite + Add-On dogs" });
        // Always show Enrichment as a core service
        orderedServices.push({ name: "Enrichment", routeKey: "enrichment", desc: "Enrichment add-on activities" });
        // Remove enrichment from dynamic set to avoid duplicates
        Array.from(svcSet).forEach(n => { if (n.toLowerCase().includes("enrichment")) svcSet.delete(n); });
        // Add any additional discovered services
        Array.from(svcSet).sort().forEach(name => {
          const key = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/_+$/, "");
          orderedServices.push({ name, routeKey: `svc_${key}`, desc: "Service report" });
        });

        const dynamicCount = orderedServices.length - 3; // extra beyond bath + pamper + enrichment
        return (
          <div style={{ marginBottom: 32 }}>
            <div style={{ margin: "8px 0 18px", height: 1, background: C.borderLight }} />
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
              Services
              <span style={{ fontSize: 12, fontWeight: 500, color: C.textMut, marginLeft: 4 }}>
                {dataLoaded ? `(${orderedServices.length} active)` : ""}
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
              {orderedServices.map(item => {
                let count = 0;
                let countReady = dataLoaded;
                if (item.routeKey === "bathing") {
                  // Match DailyOpsPage bathing logic: count ALL non-cancelled dogs with bath service scheduled_at on viewDate
                  // Uses full reservations list (not just inHouseToday) to include checked-out dogs
                  count = reservations.filter(r => {
                    if (r.status === "cancelled") return false;
                    const svcs = r._services;
                    if (!svcs) return false;
                    const arr = Array.isArray(svcs) ? svcs : [];
                    return arr.some(s => {
                      const name = typeof s === "string" ? s : (s?.name || "");
                      if (!name.toLowerCase().includes("bath")) return false;
                      const schedAt = s?.scheduled_at || "";
                      return schedAt.includes(viewDate);
                    });
                  }).length;
                } else if (item.routeKey === "enrichment") {
                  // Count in-house dogs with any enrichment service
                  count = inHouseToday.filter(r => {
                    const svcs = r._services;
                    if (!svcs) return false;
                    const arr = Array.isArray(svcs) ? svcs : [];
                    return arr.some(s => (typeof s === "string" ? s : s?.name || "").toLowerCase().includes("enrichment"));
                  }).length;
                } else if (item.routeKey === "pamper") {
                  const seen = new Set();
                  inHouseToday.forEach(r => {
                    if (seen.has(r.dogId)) return;
                    const isLS = r._resTypeId == 5 || (r._resTypeName || "").toLowerCase().includes("luxury suite");
                    const svcs = r._services;
                    const arr = Array.isArray(svcs) ? svcs : [];
                    const hasPP = arr.some(s => (typeof s === "string" ? s : s?.name || "").toLowerCase().includes("pamper"));
                    if (isLS || hasPP) { seen.add(r.dogId); count++; }
                  });
                } else {
                  count = inHouseToday.filter(r => {
                    const svcs = r._services;
                    if (!svcs) return false;
                    const arr = Array.isArray(svcs) ? svcs : [];
                    return arr.some(s => (typeof s === "string" ? s : s?.name || "") === item.name);
                  }).length;
                }
                return (
                  <div key={item.routeKey}
                    onClick={() => item.routeKey === "bathing" ? nav("ops-bathing") : item.routeKey === "pamper" ? nav("ops-pamper") : nav("ops-svc", { svcName: item.name })}
                    style={{
                      background: C.surface, borderRadius: 14, padding: "18px 20px",
                      border: `1.5px solid ${C.pri}40`,
                      cursor: "pointer",
                      transition: "all 0.2s",
                      position: "relative",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)"; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; }}
                  >
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{item.name === "Bath" ? "Bathing Report" : item.name}</div>
                      <div style={{ fontSize: 12, color: C.textSec, marginTop: 3 }}>
                        {countReady ? (count > 0 ? `${count} dog${count !== 1 ? "s" : ""} today` : "No dogs today") : "Loading…"}{item.desc ? ` · ${item.desc}` : ""}
                      </div>
                    </div>
                    <span style={{ position: "absolute", top: 18, right: 16, color: C.textMut, fontSize: 16 }}>›</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Management Section */}
      {(hp("view_management") || hp("view_daily_ops")) && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ margin: "8px 0 18px", height: 1, background: C.borderLight }} />
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
            Management
            <span style={{ fontSize: 12, fontWeight: 500, color: C.textMut, marginLeft: 4 }}>
              (Administrative Tools)
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
            {[
              { id: "mgmt-attendance", label: "Attendance Tracker", desc: "Track tardies, call-outs, and no-shows", active: true },
              ...(hasPermission(profile, data, "view_audit_log") ? [{ id: "mgmt-audit-log", label: "Audit Log", desc: "Employee logins and system activity", active: true }] : []),
              { id: null, label: "Incident Reports", desc: "Log workplace incidents", active: false },
            ].map((tool, i) => (
              <div key={i}
                onClick={() => tool.id && nav(tool.id)}
                style={{
                  background: C.surface, borderRadius: 14, padding: "18px 20px",
                  border: `1.5px solid ${tool.active ? C.pri + "40" : C.border}`,
                  cursor: tool.active ? "pointer" : "default",
                  opacity: tool.active ? 1 : 0.55,
                  transition: "all 0.2s",
                  position: "relative",
                }}
                onMouseEnter={e => { if (tool.active) { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)"; }}}
                onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; }}
              >
                <div style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{tool.label}</div>
                  <div style={{ fontSize: 12, color: C.textSec, marginTop: 3 }}>{tool.desc}</div>
                </div>
                {!tool.active && <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: "#F3F4F6", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.04em" }}>Coming Soon</span>}
                {tool.active && <span style={{ position: "absolute", top: 18, right: 16, color: C.textMut, fontSize: 16 }}>›</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── END OF DAY REPORT PAGE (mirrors POS EODPage) ──────────────────────────

export default OperationsHub;
