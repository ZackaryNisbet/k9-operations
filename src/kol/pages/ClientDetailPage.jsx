// K9 Operations — ClientDetailPage
// Isolated page component. See AGENTS.md for development contract.
// CLM-005: Push to Gingr   |   IGN-003: Ignite Lead Section   |   CLM-008: Lifecycle Event Logging

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
import { updateLiteClient } from "../../hooks/useGingrData";

// ─── CLM-004 Gingr field definitions (used by Push to Gingr) ──────────────
const GINGR_CLIENT_FIELDS = [
  { id: "g_first_name", gingrField: "first_name", label: "First Name", required: true },
  { id: "g_last_name", gingrField: "last_name", label: "Last Name", required: true },
  { id: "g_email", gingrField: "email", label: "Email", required: true },
  { id: "g_phone", gingrField: "phone", label: "Phone", required: true },
  { id: "g_address", gingrField: "address_line_1", label: "Street Address" },
  { id: "g_city", gingrField: "city", label: "City" },
  { id: "g_state", gingrField: "state", label: "State" },
  { id: "g_zip", gingrField: "zip_code", label: "Zip Code" },
  { id: "g_emergency_name", gingrField: "emergency_contact_name", label: "Emergency Contact" },
  { id: "g_emergency_phone", gingrField: "emergency_contact_phone", label: "Emergency Phone" },
  { id: "g_referral", gingrField: "referral_source", label: "Referral Source" },
];

const GINGR_DOG_FIELDS = [
  { id: "g_dog_name", gingrField: "name", label: "Pet Name", required: true },
  { id: "g_breed", gingrField: "breed", label: "Breed", required: true },
  { id: "g_weight", gingrField: "weight", label: "Weight" },
  { id: "g_dob", gingrField: "date_of_birth", label: "Date of Birth" },
  { id: "g_sex", gingrField: "sex", label: "Sex", required: true },
  { id: "g_altered", gingrField: "spayed_neutered", label: "Spayed/Neutered", required: true },
  { id: "g_color", gingrField: "color", label: "Color/Markings" },
  { id: "g_vax_rabies", gingrField: "vaccination_rabies", label: "Rabies Vaccination", required: true },
  { id: "g_vax_dhpp", gingrField: "vaccination_dhpp", label: "DHPP Vaccination", required: true },
  { id: "g_vax_bordetella", gingrField: "vaccination_bordetella", label: "Bordetella Vaccination", required: true },
  { id: "g_vet_name", gingrField: "vet_name", label: "Vet Name" },
  { id: "g_vet_phone", gingrField: "vet_phone", label: "Vet Phone" },
];

// ─── IGN-003 constants ─────────────────────────────────────────────────────
const MATCH_TYPE_LABELS = { email: "Email", phone: "Phone", name: "Name", phone_name: "Phone + Name" };
const LEAD_TYPE_LABELS = { web_form: "Web Form", phone_call: "Phone Call", ad_click: "Ad Click" };
const LEAD_TYPE_COLORS = { web_form: C.info, phone_call: C.suc, ad_click: C.acc };

function confidenceColor(c) {
  if (c >= 0.9) return C.suc;
  if (c >= 0.7) return C.info;
  if (c >= 0.5) return "#D97706";
  return C.dan;
}

function confidenceLabel(c) {
  if (c >= 0.9) return "High";
  if (c >= 0.7) return "Good";
  if (c >= 0.5) return "Review";
  return "Low";
}

// ─── CLM-008: Lifecycle Event Type Styling ─────────────────────────────────
const EVENT_TYPE_STYLES = {
  stage_change: { color: C.info, bg: C.infoLt, icon: "stage", label: "Stage Change" },
  note:         { color: "#6B7280", bg: "#F3F4F6", icon: "note", label: "Note" },
  follow_up:    { color: C.acc, bg: C.accLt, icon: "followup", label: "Follow-up" },
  initial_sync: { color: C.pri, bg: C.priLt, icon: "sync", label: "Initial Sync" },
  milestone:    { color: "#8B5CF6", bg: "#EDE9FE", icon: "milestone", label: "Milestone" },
};

function getEventStyle(eventType) {
  return EVENT_TYPE_STYLES[eventType] || { color: C.textMut, bg: C.bg, icon: "note", label: titleCase(eventType || "Event") };
}

// ─── CLM-008: Timeline Event Icon ──────────────────────────────────────────
function TimelineIcon({ type, color }) {
  if (type === "stage") return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
  );
  if (type === "followup") return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
  );
  if (type === "sync") return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
  );
  // Default: note icon
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
  );
}

// ─── CLM-008: Lifecycle stage detection helper ─────────────────────────────
function detectClientStage(client, serverStats) {
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


function ClientDetailPage({ data, save, clientId, nav, profile, openReservationId, addGlobalToast }) {
  const client = data.clients.find(c=>c.id===clientId);
  const isLite = !!(client && client.isLiteClient);
  const dogs = isLite ? [] : data.dogs.filter(d=>d.clientId===clientId);
  const reservations = isLite ? [] : (data.reservations || []).filter(r=>r.clientId===clientId).sort((a,b)=>b.checkIn.localeCompare(a.checkIn));
  const [editing, setEditing] = useState(false);
  const [editFields, setEditFields] = useState({});
  const [editRecurringDiscountId, setEditRecurringDiscountId] = useState(null);
  const [inlineFields, setInlineFields] = useState(() => ({...(client ? client.fields : {})}));
  const [inlineRecurringDiscountId, setInlineRecurringDiscountId] = useState(client ? (client.recurringDiscountId || null) : null);
  const [inlineDirty, setInlineDirty] = useState(false);
  const [inlineSaving, setInlineSaving] = useState(false);
  useEffect(() => {
    if (!inlineDirty && client) {
      setInlineFields({...client.fields});
      setInlineRecurringDiscountId(client.recurringDiscountId || null);
    }
  }, [client && client.fields, client && client.recurringDiscountId]);
  const updateInlineField = (fid, val) => { setInlineFields(prev => ({...prev, [fid]: val})); setInlineDirty(true); };
  const saveInlineEdit = async () => {
    setInlineSaving(true);
    if (isLite && client.liteClientId) {
      // Persist directly to lite_clients table
      try {
        await updateLiteClient(client.liteClientId, {
          first_name: inlineFields.first_name || null,
          last_name: inlineFields.last_name || null,
          phone: inlineFields.phone || null,
          email: inlineFields.email || null,
          notes: inlineFields.notes || null,
        });
        await save({
          ...data,
          clients: data.clients.map(c => c.id === clientId ? { ...c, fields: { ...c.fields, ...inlineFields } } : c),
        });
        if (addGlobalToast) addGlobalToast({ message: "Client updated", type: "success" });
      } catch (e) {
        if (addGlobalToast) addGlobalToast({ message: `Save failed: ${e.message}`, type: "error" });
      }
      setInlineDirty(false);
      setInlineSaving(false);
      return;
    }
    const diffs = [];
    (data.clientFields||[]).forEach(f => {
      const oldVal = client.fields[f.id] || "";
      const newVal = inlineFields[f.id] || "";
      if (oldVal !== newVal) diffs.push({ field: f.name, oldVal: oldVal || "(empty)", newVal: newVal || "(empty)" });
    });
    if ((client.recurringDiscountId || null) !== (inlineRecurringDiscountId || null)) {
      const oldDisc = (data.discounts || []).find(d => d.id === client.recurringDiscountId);
      const newDisc = (data.discounts || []).find(d => d.id === inlineRecurringDiscountId);
      diffs.push({ field: "Recurring Discount", oldVal: oldDisc ? oldDisc.name : "None", newVal: newDisc ? newDisc.name : "None" });
    }
    const auditEntries = diffs.length > 0 ? [{
      id: gid(), tableName: 'k9_clients', recordId: clientId, reservationId: clientId,
      timestamp: new Date().toISOString(),
      userName: profile ? (profile.full_name || profile.email || "Staff") : "System",
      changedBy: profile ? (profile.full_name || profile.email || "Staff") : "System",
      action: "Updated Client Profile", details: diffs,
    }] : [];
    await save({
      ...data,
      clients: data.clients.map(c => c.id === clientId ? { ...c, fields: inlineFields, recurringDiscountId: inlineRecurringDiscountId || null } : c),
      auditLog: [...(data.auditLog || []), ...auditEntries],
    });
    setInlineDirty(false);
    setInlineSaving(false);
  };
  const cancelInlineEdit = () => { setInlineFields({...client.fields}); setInlineRecurringDiscountId(client.recurringDiscountId || null); setInlineDirty(false); };
  const [activeTab, setActiveTab] = useState("dogs");
  const [resSubTab, setResSubTab] = useState("upcoming");
  const [newNote, setNewNote] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [textNotify, setTextNotify] = useState(null);
  const [vetSearch, setVetSearch] = useState("");
  const [vetDropOpen, setVetDropOpen] = useState(false);
  const vetDropRef = useRef(null);
  useEffect(() => {
    if (!vetDropOpen) return;
    const handler = (e) => { if (vetDropRef.current && !vetDropRef.current.contains(e.target)) setVetDropOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [vetDropOpen]);

  // ─── CLM-005: Push to Gingr state ──────────────────────────────────────────
  const [gingrModal, setGingrModal] = useState(false);
  const [gingrSyncing, setGingrSyncing] = useState(false);
  const [gingrResult, setGingrResult] = useState(null); // { success, message, timestamp }
  const [lastSyncedAt, setLastSyncedAt] = useState(client.gingrLastSyncedAt || null);

  // ─── IGN-003: Ignite leads state ───────────────────────────────────────────
  const [igniteLeads, setIgniteLeads] = useState([]);
  const [igniteLoading, setIgniteLoading] = useState(false);
  const [igniteError, setIgniteError] = useState(null);
  const [igniteLinkModal, setIgniteLinkModal] = useState(null); // { leadId, action: 'unlink' }
  const [igniteLinking, setIgniteLinking] = useState(false);
  const [igniteExpandedId, setIgniteExpandedId] = useState(null);

  // ─── CLM-008: Lifecycle events state ───────────────────────────────────────
  const [lifecycleEvents, setLifecycleEvents] = useState([]);
  const [lcEventsLoading, setLcEventsLoading] = useState(false);
  const [lcNoteText, setLcNoteText] = useState("");
  const [lcFollowUpDate, setLcFollowUpDate] = useState("");
  const [lcSubmitting, setLcSubmitting] = useState(false);
  const [lcSeedDone, setLcSeedDone] = useState(false);
  const lcSeedRef = useRef(false);

  // Fetch Ignite leads on mount — works for both Gingr clients (matched_client_id) and lite clients (ignite_lead_id link)
  useEffect(() => {
    let cancelled = false;
    async function loadIgniteLeads() {
      setIgniteLoading(true);
      try {
        const selectCols = 'id, lead_type, first_name, last_name, email, phone, source_detail, call_recording_url, form_data, match_confidence, match_type, match_status, raw_email_subject, created_at, ignite_profile_id';
        let allLeads = [];
        // Query 1: Standard match via matched_client_id (Gingr clients)
        const { data: matchedLeads, error: err1 } = await supabase
          .from('ignite_leads')
          .select(selectCols)
          .eq('matched_client_id', clientId)
          .eq('match_status', 'matched')
          .order('created_at', { ascending: false });
        if (err1) throw err1;
        if (matchedLeads) allLeads.push(...matchedLeads);
        // Query 2: Lite client linked via ignite_lead_id
        if (isLite && client?.sourceData?.igniteLeadId) {
          const { data: linkedLead, error: err2 } = await supabase
            .from('ignite_leads')
            .select(selectCols)
            .eq('id', client.sourceData.igniteLeadId);
          if (err2) throw err2;
          if (linkedLead) {
            // Deduplicate — don't add if already in matched set
            const existingIds = new Set(allLeads.map(l => l.id));
            for (const l of linkedLead) {
              if (!existingIds.has(l.id)) allLeads.push(l);
            }
          }
        }
        if (!cancelled) {
          setIgniteLeads(allLeads);
          setIgniteError(null);
        }
      } catch (e) {
        if (!cancelled) { setIgniteError(e.message); setIgniteLeads([]); }
      }
      if (!cancelled) setIgniteLoading(false);
    }
    loadIgniteLeads();
    return () => { cancelled = true; };
  }, [clientId, isLite, client?.sourceData?.igniteLeadId]);

  // ─── CLM-008: Fetch lifecycle events from Supabase ─────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function loadLifecycleEvents() {
      setLcEventsLoading(true);
      try {
        const { data: events, error } = await supabase
          .from('lifecycle_events')
          .select('*')
          .eq('client_id', clientId)
          .order('created_at', { ascending: false });
        if (!cancelled) {
          if (error) {
            console.log("[CLM-008] lifecycle_events query error:", error.message);
            setLifecycleEvents([]);
          } else {
            setLifecycleEvents(events || []);
          }
        }
      } catch (e) {
        if (!cancelled) {
          console.log("[CLM-008] lifecycle_events fetch error:", e.message);
          setLifecycleEvents([]);
        }
      }
      if (!cancelled) setLcEventsLoading(false);
    }
    loadLifecycleEvents();
    return () => { cancelled = true; };
  }, [clientId]);

  // ─── CLM-008: Auto-seed initial lifecycle event if none exist ──────────────
  useEffect(() => {
    if (lcEventsLoading || lcSeedRef.current || lcSeedDone) return;
    if (lifecycleEvents.length > 0) { setLcSeedDone(true); return; }
    // Also check in-memory events from client object
    const inMemoryEvents = client.lifecycleEvents || [];
    const convUpdates = client.lifecycle?.conversion?.updates || [];
    const retUpdates = client.lifecycle?.retention?.updates || [];
    if (inMemoryEvents.length > 0 || convUpdates.length > 0 || retUpdates.length > 0) {
      setLcSeedDone(true);
      return;
    }

    lcSeedRef.current = true;
    const stage = detectClientStage(client, data.serverStats);
    const syncDate = client.createdAt ? new Date(client.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

    // Build a more descriptive seed event based on stage
    const gingrId = String(client.gingrId);
    const srv = data.serverStats && data.serverStats[gingrId];
    let description = `Identified as ${stage} client during initial sync on ${syncDate}`;
    const seedDetails = { description };

    if (stage === "Lapsed" && srv) {
      const daysSince = srv.last_res_date ? Math.floor((Date.now() - new Date(srv.last_res_date).getTime()) / 86400000) : null;
      const totalRes = Number(srv.total_res) || 0;
      const bdCount = Number(srv.boarding_count) || 0;
      const bdPct = totalRes > 0 ? bdCount / totalRes : 0;
      const threshUsed = bdPct > 0.5 ? "180 days (boarding)" : "90 days (daycare)";
      description = `System classified as Lapsed \u2014 no upcoming reservations and last visit was ${daysSince || "N/A"} days ago (threshold: ${threshUsed})`;
      seedDetails.description = description;
      seedDetails.threshold_used = bdPct > 0.5 ? "boarding_180" : "daycare_90";
      seedDetails.days_since_last = daysSince;
      seedDetails.total_reservations = totalRes;
      seedDetails.total_spent = srv.total_spent;
    } else if (stage === "Active" && srv) {
      description = `Active client \u2014 ${Number(srv.total_res) || 0} reservations, $${Number(srv.total_spent || 0).toFixed(2)} total spent`;
      seedDetails.description = description;
    } else if (stage === "Leads") {
      description = `New lead identified during initial sync on ${syncDate}`;
      seedDetails.description = description;
    }

    const seedEvent = {
      client_id: clientId,
      event_type: stage === "Lapsed" ? "stage_change" : "initial_sync",
      from_stage: stage === "Lapsed" ? "active" : null,
      to_stage: stage.toLowerCase(),
      details: seedDetails,
      created_by: null,
    };

    supabase.from('lifecycle_events').insert(seedEvent).select().then(({ data: inserted, error }) => {
      if (error) {
        console.log("[CLM-008] Seed event insert error:", error.message);
      } else if (inserted && inserted.length > 0) {
        setLifecycleEvents(prev => [...inserted, ...prev]);
      }
      setLcSeedDone(true);
    });
  }, [lcEventsLoading, lifecycleEvents, client, data.serverStats, clientId, lcSeedDone]);

  // ─── CLM-008: Add manual lifecycle note ────────────────────────────────────
  const handleAddLifecycleNote = async () => {
    if (!lcNoteText.trim() && !lcFollowUpDate) return;
    setLcSubmitting(true);

    const eventType = lcFollowUpDate ? "follow_up" : "note";
    const details = {};
    if (lcNoteText.trim()) details.description = lcNoteText.trim();
    if (lcFollowUpDate) details.follow_up_date = lcFollowUpDate;

    const newEvent = {
      client_id: clientId,
      event_type: eventType,
      from_stage: null,
      to_stage: null,
      details,
      created_by: profile?.id || null,
    };

    try {
      const { data: inserted, error } = await supabase
        .from('lifecycle_events')
        .insert(newEvent)
        .select();
      if (error) {
        console.log("[CLM-008] Note insert error:", error.message);
        if (addGlobalToast) addGlobalToast({ message: `Failed to add note: ${error.message}`, type: "error" });
      } else if (inserted && inserted.length > 0) {
        setLifecycleEvents(prev => [...inserted, ...prev]);
        setLcNoteText("");
        setLcFollowUpDate("");
        if (addGlobalToast) addGlobalToast({ message: eventType === "follow_up" ? "Follow-up scheduled" : "Note added", type: "success" });
      }
    } catch (e) {
      console.log("[CLM-008] Note insert exception:", e.message);
      if (addGlobalToast) addGlobalToast({ message: `Failed to add note`, type: "error" });
    }
    setLcSubmitting(false);
  };

  // ─── CLM-008: Combined lifecycle event count (DB + in-memory + milestones) ──
  const lifecycleEventCount = useMemo(() => {
    const dbCount = lifecycleEvents.length;
    const inMemory = (client.lifecycleEvents || []).length;
    const convUpdates = (client.lifecycle?.conversion?.updates || []).length;
    const retUpdates = (client.lifecycle?.retention?.updates || []).length;
    // Count computed milestones (first visit, last visit, first boarding)
    let milestones = 0;
    if (reservations.length > 0) {
      milestones += 1; // first visit
      const sorted = [...reservations].sort((a, b) => a.checkIn.localeCompare(b.checkIn));
      if (sorted.length > 1) milestones += 1; // last visit
      if (sorted.some(r => r.type === "boarding" && r.id !== sorted[0].id)) milestones += 1; // first boarding
    }
    return dbCount + inMemory + convUpdates + retUpdates + milestones;
  }, [lifecycleEvents, client.lifecycleEvents, client.lifecycle, reservations]);

  const dn=(did)=>{const d=data.dogs.find(x=>x.id===did);return d?d.fields.name:"Unknown";};
  const tl=(t)=>t==="boarding"?"Boarding":t==="dayboarding"?"Day Board":t==="daycare"?"Daycare":t==="evaluation"?"Evaluation":"Tour";
  const sc=(s)=>s==="checked-in"?"success":s==="upcoming"?"info":"default";

  // ─── CLM-008: Merge all events for timeline display ────────────────────────
  const allTimelineEvents = useMemo(() => {
    const events = [];

    // DB lifecycle_events
    lifecycleEvents.forEach(evt => {
      events.push({
        id: evt.id,
        date: evt.created_at,
        eventType: evt.event_type,
        fromStage: evt.from_stage,
        toStage: evt.to_stage,
        description: evt.details?.description || "",
        followUpDate: evt.details?.follow_up_date || null,
        triggeredBy: evt.created_by ? "Staff" : "System",
        source: "db",
      });
    });

    // In-memory lifecycle events (client.lifecycleEvents)
    (client.lifecycleEvents || []).forEach(evt => {
      events.push({
        id: evt.id || `mem-${evt.event}-${evt.date}`,
        date: evt.date ? new Date(evt.date + "T12:00:00").toISOString() : new Date().toISOString(),
        eventType: evt.event === "moved_to_active" || evt.event === "moved_to_retention" || evt.event === "marked_cold" || evt.event === "reclassified" ? "stage_change" : "note",
        fromStage: null,
        toStage: evt.event === "moved_to_active" ? "active" : evt.event === "moved_to_retention" ? "lapsed" : (evt.event === "marked_cold" || evt.event === "reclassified") ? "reclassified" : null,
        description: evt.details || titleCase(evt.event || "Event"),
        followUpDate: null,
        triggeredBy: "System",
        source: "memory",
      });
    });

    // Conversion updates
    (client.lifecycle?.conversion?.updates || []).forEach((u, i) => {
      events.push({
        id: `conv-${i}`,
        date: u.date ? new Date(u.date + "T12:00:00").toISOString() : new Date().toISOString(),
        eventType: "note",
        fromStage: null,
        toStage: null,
        description: u.notes || u.text || "Conversion update",
        followUpDate: null,
        triggeredBy: u.by || "Staff",
        source: "memory",
      });
    });

    // Retention updates
    (client.lifecycle?.retention?.updates || []).forEach((u, i) => {
      events.push({
        id: `ret-${i}`,
        date: u.date ? new Date(u.date + "T12:00:00").toISOString() : new Date().toISOString(),
        eventType: "note",
        fromStage: null,
        toStage: null,
        description: u.notes || u.text || "Retention update",
        followUpDate: null,
        triggeredBy: u.by || "Staff",
        source: "memory",
      });
    });

    // Computed reservation milestones (ensures timeline is never empty for real clients)
    if (reservations.length > 0) {
      const sorted = [...reservations].sort((a, b) => a.checkIn.localeCompare(b.checkIn));
      // First visit
      const first = sorted[0];
      if (first) {
        events.push({
          id: "milestone-first-visit",
          date: new Date(first.checkIn + "T12:00:00").toISOString(),
          eventType: "milestone",
          fromStage: null, toStage: "active",
          description: `First visit \u2014 ${tl(first.type)}${first.dogId ? ` with ${dn(first.dogId)}` : ""}`,
          triggeredBy: "System", source: "computed",
        });
      }
      // Last visit (if different from first)
      const last = sorted[sorted.length - 1];
      if (last && last.id !== first.id) {
        events.push({
          id: "milestone-last-visit",
          date: new Date(last.checkIn + "T12:00:00").toISOString(),
          eventType: "milestone",
          fromStage: null, toStage: null,
          description: `Most recent visit \u2014 ${tl(last.type)}${last.dogId ? ` with ${dn(last.dogId)}` : ""}`,
          triggeredBy: "System", source: "computed",
        });
      }
      // Milestone: first boarding
      const firstBoarding = sorted.find(r => r.type === "boarding");
      if (firstBoarding && firstBoarding.id !== first.id) {
        events.push({
          id: "milestone-first-boarding",
          date: new Date(firstBoarding.checkIn + "T12:00:00").toISOString(),
          eventType: "milestone",
          fromStage: null, toStage: null,
          description: `First boarding stay${firstBoarding.dogId ? ` with ${dn(firstBoarding.dogId)}` : ""}`,
          triggeredBy: "System", source: "computed",
        });
      }
    }

    // Sort newest first
    events.sort((a, b) => new Date(b.date) - new Date(a.date));
    return events;
  }, [lifecycleEvents, client.lifecycleEvents, client.lifecycle, reservations]);

  // ─── CLM-005: Build Gingr payload from field mappings ──────────────────────
  const gingrPayload = useMemo(() => {
    const mappings = data.fieldMappings || {};
    const clientPayload = {};
    const missingRequired = [];

    GINGR_CLIENT_FIELDS.forEach(gf => {
      const mapped = mappings[gf.id];
      const k9FieldId = mapped || gf.gingrField;
      const val = client.fields[k9FieldId] || client.fields[gf.gingrField] || "";
      if (val) clientPayload[gf.gingrField] = val;
      else if (gf.required) missingRequired.push(gf.label);
    });

    const dogPayloads = dogs.map(dog => {
      const dp = {};
      const dogMissing = [];
      GINGR_DOG_FIELDS.forEach(gf => {
        const mapped = mappings[gf.id];
        const k9FieldId = mapped || gf.gingrField;
        const val = dog.fields?.[k9FieldId] || dog.fields?.[gf.gingrField] || "";
        if (val) dp[gf.gingrField] = val;
        else if (gf.required) dogMissing.push(gf.label);
      });
      return { dogId: dog.id, dogName: dog.fields?.name || "Unknown", payload: dp, missing: dogMissing };
    });

    return { client: clientPayload, dogs: dogPayloads, missingRequired };
  }, [client.fields, dogs, data.fieldMappings]);

  const handlePushToGingr = async () => {
    setGingrSyncing(true);
    setGingrResult(null);
    try {
      const isUpdate = !!client.gingrId;
      const now = new Date().toISOString();

      // Push client data to gingr_owners
      if (isUpdate) {
        const { error } = await supabase
          .from('gingr_owners')
          .update(gingrPayload.client)
          .eq('id', client.gingrId);
        if (error) throw new Error(`Client update failed: ${error.message}`);
      } else {
        const { data: newOwner, error } = await supabase
          .from('gingr_owners')
          .insert({ ...gingrPayload.client, id: gid() })
          .select('id')
          .single();
        if (error) throw new Error(`Client create failed: ${error.message}`);
        // Save the new gingrId back
        await save({
          ...data,
          clients: data.clients.map(c => c.id === clientId ? { ...c, gingrId: newOwner.id } : c),
        });
        // Link lite_client to the new Gingr record
        if (isLite && client.liteClientId) {
          await updateLiteClient(client.liteClientId, { gingr_owner_id: newOwner.id });
        }
      }

      // Push each dog
      for (const dp of gingrPayload.dogs) {
        const dog = dogs.find(d => d.id === dp.dogId);
        if (dog?.gingrAnimalId) {
          await supabase.from('gingr_animals').update(dp.payload).eq('id', dog.gingrAnimalId);
        }
      }

      // Audit log
      const auditEntry = {
        id: gid(), tableName: 'k9_clients', recordId: clientId,
        timestamp: now,
        userName: profile ? (profile.full_name || profile.email || "Staff") : "System",
        changedBy: profile ? (profile.full_name || profile.email || "Staff") : "System",
        action: isUpdate ? "Pushed Update to Gingr" : "Created Client in Gingr",
        details: [{ field: "Gingr Sync", oldVal: lastSyncedAt ? `Last synced ${fmtDate(lastSyncedAt)}` : "Never synced", newVal: `Synced ${fmtDate(now)}` }],
      };
      await save({
        ...data,
        clients: data.clients.map(c => c.id === clientId ? { ...c, gingrLastSyncedAt: now } : c),
        auditLog: [...(data.auditLog || []), auditEntry],
      });

      setLastSyncedAt(now);
      setGingrResult({ success: true, message: isUpdate ? "Client updated in Gingr successfully" : "Client created in Gingr successfully", timestamp: now });
      if (addGlobalToast) addGlobalToast({ message: isUpdate ? "Pushed to Gingr — client updated" : "Pushed to Gingr — client created", type: "success" });
    } catch (e) {
      setGingrResult({ success: false, message: e.message, timestamp: new Date().toISOString() });
      if (addGlobalToast) addGlobalToast({ message: `Gingr sync failed: ${e.message}`, type: "error" });
    }
    setGingrSyncing(false);
  };

  // ─── IGN-003: Unlink lead from client ──────────────────────────────────────
  const handleUnlinkLead = async (leadId) => {
    setIgniteLinking(true);
    try {
      const { error } = await supabase
        .from('ignite_leads')
        .update({ matched_client_id: null, match_status: 'no_match', updated_at: new Date().toISOString() })
        .eq('id', leadId);
      if (error) throw error;
      setIgniteLeads(prev => prev.filter(l => l.id !== leadId));
      if (addGlobalToast) addGlobalToast({ message: "Ignite lead unlinked", type: "info" });
      // Audit
      const auditEntry = {
        id: gid(), tableName: 'k9_clients', recordId: clientId, timestamp: new Date().toISOString(),
        userName: profile ? (profile.full_name || profile.email || "Staff") : "System",
        changedBy: profile ? (profile.full_name || profile.email || "Staff") : "System",
        action: "Unlinked Ignite Lead", details: [{ field: "Lead", oldVal: leadId, newVal: "Unlinked" }],
      };
      await save({ ...data, auditLog: [...(data.auditLog || []), auditEntry] });
    } catch (e) {
      if (addGlobalToast) addGlobalToast({ message: `Failed to unlink: ${e.message}`, type: "error" });
    }
    setIgniteLinking(false);
    setIgniteLinkModal(null);
  };

  if (!client) return <div style={{padding:40,textAlign:"center",color:C.textSec}}>Client not found</div>;

  const startEdit = () => { setEditFields({...client.fields}); setEditRecurringDiscountId(client.recurringDiscountId || null); setEditing(true); };
  const saveEdit = async () => { await save({...data,clients:data.clients.map(c=>c.id===clientId?{...c,fields:editFields,recurringDiscountId:editRecurringDiscountId||null}:c)}); setEditing(false); };

  const showTextNotifyToast = (client, dog, diffs) => {
    const clientName = `${client?.fields?.first_name || ""} ${client?.fields?.last_name || ""}`.trim() || "Client";
    const dogName = dog?.fields?.name || "your dog";
    const phone = client?.fields?.phone || "";
    const changeLines = diffs.map(d => `${d.field}: ${d.oldVal} → ${d.newVal}`).join("\n");
    const msg = `Hi ${clientName.split(" ")[0]}, this is K9 Operations! We've updated ${dogName}'s reservation:\n${changeLines}\nPlease let us know if you have any questions!`;
    setTextNotify({ clientName, clientPhone: phone, dogName, diffs, message: msg, showPreview: false, sending: false });
  };
  const sendTextNotify = async () => {
    if (!textNotify) return;
    setTextNotify(prev => ({ ...prev, sending: true }));
    const newMsg = { id: gid(), type: "outbound", channel: "sms", to: textNotify.clientPhone, toName: textNotify.clientName, body: textNotify.message, sentAt: new Date().toISOString(), sentBy: profile ? (profile.full_name || profile.email || "Staff") : "Staff", status: "sent" };
    await save({ ...data, messages: [...(data.messages || []), newMsg] });
    setTextNotify(null);
  };

  const sendAgreementLink = async (agrId) => {
    console.log("sendAgreementLink (no-op):", agrId);
  };

  const markAgreementSigned = async (agrId) => {
    const agrs = { ...(client.agreements || {}) };
    agrs[agrId] = { signed: true, date: todayStr(), status: 'signed' };
    await save({...data, clients: data.clients.map(c => c.id === clientId ? { ...c, agreements: agrs } : c)});
  };

  const [boardingPreviewId, setBoardingPreviewId] = useState(openReservationId || null);
  const [earlyCheckInModal, setEarlyCheckInModal] = useState(null);

  const handleCheckIn = async (rid) => {
    console.log("handleCheckIn (no-op):", rid);
  };
  const handleCheckOut = async (rid) => {
    console.log("handleCheckOut (no-op):", rid);
  };

  const reactivateReservation = async (rid) => {
    console.log("reactivateReservation (no-op):", rid);
  };

  const isFieldReq = () => false;

  // Stats calculations — use serverStats (same source as ClientsPage/Lifecycle module)
  const stats = useMemo(() => {
    const gingrId = String(client.gingrId);
    const srv = data.serverStats && data.serverStats[gingrId];
    const totalSpent = srv ? Number(srv.total_spent) || 0 : 0;
    const sorted = [...reservations].sort((a, b) => b.checkIn.localeCompare(a.checkIn));
    const lastRes = sorted.find(r => r.checkIn <= todayStr());
    let daysSince = null;
    if (lastRes) {
      const lastDate = new Date(lastRes.checkIn + "T00:00:00");
      const now = new Date(); now.setHours(0,0,0,0);
      daysSince = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));
    }
    return { totalSpent, totalRes: reservations.length, daysSince };
  }, [reservations, data.serverStats, client.gingrId]);

  // Notes data
  const handleSaveNote = async () => {
    if (!newNote.trim()) return;
    setNoteSaving(true);
    const entry = { id: gid(), text: newNote.trim(), timestamp: new Date().toISOString(), addedBy: profile?.full_name || profile?.email || "Staff" };
    const updated = { ...client, clientNotes: [...(client.clientNotes || []), entry] };
    await save({ ...data, clients: data.clients.map(c => c.id === clientId ? updated : c) });
    setNewNote("");
    setNoteSaving(false);
  };
  const handleDeleteNote = async (noteId) => {
    const updated = { ...client, clientNotes: (client.clientNotes || []).filter(n => n.id !== noteId) };
    await save({ ...data, clients: data.clients.map(c => c.id === clientId ? updated : c) });
  };

  // EOD mentions
  const dogIds = dogs.map(d => d.id);
  const eodMentions = useMemo(() => (data.eodEntries || []).flatMap(e => (e.mentions || []).filter(m => (m.entityType === "client" && m.entityId === clientId) || (m.entityType === "dog" && dogIds.includes(m.entityId))).map(m => ({ ...m, date: e.date, eodId: e.id, sections: e.sections }))).sort((a, b) => b.date.localeCompare(a.date)), [data.eodEntries, clientId, dogIds.join(",")]);

  // Payments — merge actual data.payments with reservation-derived entries
  const pmts = useMemo(() => {
    const directPmts = (data.payments || []).filter(p => p.clientId === clientId);
    // Build payment-like entries from checked-out reservations when no direct payments exist
    const resDerived = directPmts.length === 0 ? reservations.filter(r => r.status === "checked-out" && r.checkIn).map(r => ({
      id: `res-pmt-${r.id}`,
      clientId,
      amount: r.cost || r.totalCost || r.price || 0,
      type: "reservation",
      method: "Gingr",
      status: "completed",
      timestamp: r.checkOut || r.checkIn,
      description: `${tl(r.type)} · ${dn(r.dogId)} · ${fmtDate(r.checkIn)}${r.checkIn !== r.checkOut ? ` → ${fmtDate(r.checkOut)}` : ""}`,
      reservationId: r.id,
    })).filter(p => p.amount > 0) : [];
    return [...directPmts, ...resDerived].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [data.payments, clientId, reservations]);
  const statusClr = { completed: C.suc, pending: "#f59e0b", refunded: C.dan, failed: C.dan };
  const typeClr = { payment: C.pri, deposit: "#0ea5e9", tip: "#ec4899", refund: C.dan, reservation: "#0ea5e9" };

  // Reservation subtabs
  const upcomingRes = reservations.filter(r => r.status === "upcoming");
  const currentRes = reservations.filter(r => r.status === "checked-in");
  const pastRes = reservations.filter(r => r.status === "checked-out");
  const cancelledRes = reservations.filter(r => r.status === "cancelled");

  // Tab config — CLM-008: Use real lifecycle event count
  const clientNotes = client.clientNotes || [];
  const notesCount = clientNotes.length + eodMentions.length;
  const clientSalesForCount = (data.packageSales || []).filter(s => s.clientId === clientId);
  const activePkgCount = clientSalesForCount.filter(s => (s.quantity || 0) - (s.used || 0) > 0).length;
  // P5: Unified tabs — ALL tabs shown for ALL clients regardless of source
  const tabs = [
    { id: "dogs", label: "Dogs", count: dogs.length, color: C.pri },
    { id: "reservations", label: "Reservations", count: reservations.length, color: C.acc },
    { id: "payments", label: "Payments", count: pmts.length, color: C.info },
    { id: "packages", label: "Packages", count: activePkgCount, color: "#EC4899" },
    { id: "ignite", label: "Ignite", count: igniteLeads.length, color: "#F97316" },
    { id: "lifecycle", label: "Lifecycle", count: lifecycleEventCount, color: "#8B5CF6" },
    { id: "notes", label: "Notes", count: notesCount, color: "#F59E0B" },
    { id: "history", label: "History", count: ((data.auditLog || []).filter(e => e.tableName === 'k9_clients' && e.recordId === clientId)).length, color: "#6B7280" },
  ];

  // Reset tab for lite clients if current tab doesn't exist
  useEffect(() => {
    if (isLite && tabs.length > 0 && !tabs.find(t => t.id === activeTab)) {
      setActiveTab(tabs[0].id);
    }
  }, [isLite, clientId]);

  // Reservation card renderer
  const renderResCard = (res) => (
    <Card key={res.id} style={{padding:"12px 18px",cursor:(res.type==="boarding"||res.type==="dayboarding")?"pointer":"default"}} onClick={()=>{if(res.type==="boarding"||res.type==="dayboarding")setBoardingPreviewId(res.id);}}>
      <div style={{display:"flex",alignItems:"center",gap:14}}>
        <div style={{flex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
            <span style={{fontSize:14,fontWeight:700,color:C.pri}}>{dn(res.dogId)}</span>
            <Badge color={tl(res.type)==="Tour"?"accent":tl(res.type)==="Daycare"?"success":tl(res.type)==="Evaluation"?"warning":"primary"} size="sm">{tl(res.type)}</Badge>
            {res.roomType && <Badge color="default" size="sm">{res.roomType}</Badge>}
            {res.type==="evaluation" && res.evalResult && res.evalResult !== "pending" && <Badge color={res.evalResult==="passed_group"?"success":"info"} size="sm">{res.evalResult==="passed_group"?"Passed Group":"Passed Private"}</Badge>}
          </div>
          <div style={{fontSize:13,color:C.textSec,marginTop:4}}>{fmtDate(res.checkIn)}{res.type!=="tour"&&res.type!=="evaluation"&&res.checkIn!==res.checkOut?` \u2192 ${fmtDate(res.checkOut)}`:""}{res.notes?` \u00B7 ${res.notes}`:""}</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:2,flexShrink:0,minWidth:90}}>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:3}}><I.Clock/><span style={{fontSize:10,fontWeight:600,color:C.textMut}}>IN</span><span style={{fontSize:12,fontWeight:700,color:C.text,fontVariantNumeric:"tabular-nums"}}>{fmtTime(res.checkInTime)}</span></div>
            {res.actualCheckInTime && <div style={{fontSize:9,color:C.textMut,fontStyle:"italic",textAlign:"right"}}>actual: {new Date(res.actualCheckInTime).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}</div>}
          </div>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:3}}><I.Clock/><span style={{fontSize:10,fontWeight:600,color:C.textMut}}>OUT</span><span style={{fontSize:12,fontWeight:700,color:C.text,fontVariantNumeric:"tabular-nums"}}>{fmtTime(res.checkOutTime)}</span></div>
            {res.actualCheckOutTime && <div style={{fontSize:9,color:C.textMut,fontStyle:"italic",textAlign:"right"}}>actual: {new Date(res.actualCheckOutTime).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}</div>}
          </div>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          {res.status==="upcoming"&&<Btn size="sm" variant="success" onClick={e=>{e.stopPropagation();handleCheckIn(res.id);}} icon={<I.LogIn/>}>Check In</Btn>}
          {res.status==="checked-in"&&<Btn size="sm" variant="accent" onClick={e=>{e.stopPropagation();handleCheckOut(res.id);}} icon={<I.LogOut/>}>Check Out</Btn>}
          {res.status==="cancelled"&&<Btn size="sm" variant="primary" onClick={e=>{e.stopPropagation();reactivateReservation(res.id);}} icon={<I.RefreshCw/>}>Re-activate</Btn>}
        </div>
      </div>
      {res.status==="cancelled"&&<div style={{marginTop:8,padding:"8px 12px",borderRadius:8,background:C.dan+"08",border:`1px solid ${C.dan}20`}}>
        <div style={{fontSize:11,color:C.dan,fontWeight:700}}>Cancelled {res.cancelledAt ? new Date(res.cancelledAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}) : ""}</div>
        <div style={{fontSize:11,color:C.textSec,marginTop:2}}>{res.cancelledBy==="System (Auto)"?"Auto-cancelled — check-in date lapsed":`Cancelled by ${res.cancelledBy||"Unknown"}`}{res.cancelReason&&res.cancelledBy!=="System (Auto)"?` · ${res.cancelReason}`:""}</div>
      </div>}
    </Card>
  );

  // Detect if client was created from an Ignite lead
  const isIgniteSource = client.source === 'ignite' || client._liteSource === 'ignite' || igniteLeads.length > 0;
  const liteSourceLabel = isLite ? (client.source === "ignite" ? "Ignite" : client.source === "eval" ? "Eval" : client.source === "tour" ? "Tour" : titleCase(client.source || "Manual")) : null;
  const liteSourceColor = isLite ? (client.source === "ignite" ? "#F97316" : client.source === "eval" ? C.acc : client.source === "tour" ? C.info : C.pri) : null;

  return (
    <div>
      {/* Header */}
      <Card style={{marginBottom:16,padding:"24px 28px"}}>
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:16}}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h2 style={{margin:0,fontSize:22,fontWeight:800,color:C.text}}>{client.fields.first_name} {client.fields.last_name}</h2>
              {isLite && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 6, background: `${liteSourceColor}14`, border: `1.5px solid ${liteSourceColor}30`, fontSize: 11, fontWeight: 700, color: liteSourceColor, letterSpacing: "0.02em" }}>
                  {client.source === "ignite" && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#F97316" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>}
                  Source: {liteSourceLabel}
                </span>
              )}
              {!isLite && isIgniteSource && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 6, background: "#FFF7ED", border: "1.5px solid #FDBA7440", fontSize: 11, fontWeight: 700, color: "#C2410C", letterSpacing: "0.02em" }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#F97316" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                  Source: Ignite
                </span>
              )}
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8,marginTop:4,fontSize:14,color:C.textSec}}><I.Phone/><span>{fmtPhone(client.fields.phone)}</span>{client.fields.email&&<span>&middot; {client.fields.email}</span>}</div>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            {/* CLM-005: Push to Gingr Button — shown for all clients */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
              <button onClick={() => { setGingrResult(null); setGingrModal(true); }}
                style={{ padding: "8px 16px", borderRadius: 8, border: `1.5px solid ${C.acc}`, background: C.accLt, color: C.accDk, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6, transition: "all 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.background = C.acc + "30"; }}
                onMouseLeave={e => { e.currentTarget.style.background = C.accLt; }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17l9.2-9.2M17 17V7H7"/></svg>
                Push to Gingr
              </button>
              {lastSyncedAt && !isLite && (
                <span style={{ fontSize: 10, color: C.textMut, fontWeight: 600, display: "flex", alignItems: "center", gap: 3 }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={C.suc} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  Synced {new Date(lastSyncedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} at {new Date(lastSyncedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                </span>
              )}
            </div>
            <Btn variant="primary" onClick={()=>nav("new-reservation",{clientId})} icon={<I.Plus/>} size="sm">New</Btn>
          </div>
        </div>

        {/* Inline Editable Client Fields */}
        <div style={{ padding: "14px 18px", background: C.bg, borderRadius: 12, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em" }}>Client Information</div>
            {inlineDirty && (
              <div style={{ display: "flex", gap: 8 }}>
                <Btn variant="secondary" size="sm" onClick={cancelInlineEdit}>Cancel</Btn>
                <Btn variant="primary" size="sm" onClick={saveInlineEdit} disabled={inlineSaving}>{inlineSaving ? "Saving..." : "Save Changes"}</Btn>
              </div>
            )}
          </div>
          {isLite ? (
            <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Inp label="First Name" value={inlineFields.first_name || ""} onChange={v => updateInlineField("first_name", v)} />
              <Inp label="Last Name" value={inlineFields.last_name || ""} onChange={v => updateInlineField("last_name", v)} />
              <Inp label="Phone" value={inlineFields.phone || ""} onChange={v => updateInlineField("phone", v)} />
              <Inp label="Email" value={inlineFields.email || ""} onChange={v => updateInlineField("email", v)} />
              {client.sourceData?.sourceDate && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 3 }}>Source Date</div>
                  <div style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{fmtDate(client.sourceData.sourceDate)}</div>
                </div>
              )}
              {client.createdAt && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 3 }}>Created</div>
                  <div style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{fmtDate(client.createdAt)}</div>
                </div>
              )}
            </div>
            <div style={{ marginTop: 12 }}>
              <Inp label="Notes" type="textarea" value={inlineFields.notes || ""} onChange={v => updateInlineField("notes", v)} />
            </div>

            </>
          ) : (
          <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {(data.clientFields||[]).filter(f => f.type !== "textarea").map(f => (
              <div key={f.id} style={f.type === "checkbox" ? { display: "flex", alignItems: "end" } : {}}>
                <Inp label={f.name} type={f.type} value={inlineFields[f.id] || ""} onChange={v => updateInlineField(f.id, v)} required={isFieldReq(f, "create")} options={f.options} />
              </div>
            ))}
            {(() => {
              const recurringDiscounts = (data.discounts || []).filter(d => d.discountKind === "recurring" && d.active !== false);
              return recurringDiscounts.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: 6 }}>Recurring Discount</label>
                  <select value={inlineRecurringDiscountId || ""} onChange={e => { setInlineRecurringDiscountId(e.target.value || null); setInlineDirty(true); }} style={{ width: "100%", padding: "6px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: "inherit", background: C.surface, color: C.text, cursor: "pointer" }}>
                    <option value="">None</option>
                    {recurringDiscounts.map(d => <option key={d.id} value={d.id}>{d.name} ({d.type === "percentage" ? `${d.value}%` : `$${d.value}`} off)</option>)}
                  </select>
                </div>
              ) : null;
            })()}
          </div>
          {(data.clientFields||[]).filter(f => f.type === "textarea").map(f => (
            <div key={f.id} style={{ marginTop: 12 }}>
              <Inp label={f.name} type="textarea" value={inlineFields[f.id] || ""} onChange={v => updateInlineField(f.id, v)} />
            </div>
          ))}
          </>
          )}
        </div>

        {/* Agreement Status Section */}
        <div style={{ marginBottom: 16, padding: "14px 18px", background: C.bg, borderRadius: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 10 }}>Agreement Status</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {(data.agreements || []).map(agr => {
              const raw = client.agreements && client.agreements[agr.id];
              const isSigned = raw && (raw === true || raw.signed === true);
              const isPending = raw && !isSigned && (raw.status === 'sent' || raw.status === 'pending');
              const dateFmt = raw && raw.date ? new Date(raw.date + "T00:00:00").toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" }) : null;
              const sentFmt = raw && raw.sentAt ? new Date(raw.sentAt).toLocaleString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit", hour: "numeric", minute: "2-digit" }) : null;
              const sentByName = raw?.sentBy || null;

              if (isSigned) {
                return (
                  <div key={agr.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 10, background: C.sucLt, border: `1.5px solid #A7F3D0` }}>
                    <span style={{ color: C.suc }}><I.CheckCircle /></span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.suc }}>{agr.name}</span>
                    {dateFmt && <span style={{ fontSize: 11, color: C.textMut }}>Signed {dateFmt}</span>}
                  </div>
                );
              } else if (isPending) {
                return (
                  <div key={agr.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 10, background: "#FEF3C7", border: "1.5px solid #F59E0B40", cursor: "pointer" }}
                    onClick={() => sendAgreementLink(agr.id)} title="Click to resend">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#92400E" }}>{agr.name}</span>
                    <span style={{ fontSize: 11, color: "#78350F" }}>Pending</span>
                    {sentFmt && <span style={{ fontSize: 10, color: "#B45309" }}>sent {sentFmt}{sentByName ? ` by ${sentByName}` : ''}</span>}
                  </div>
                );
              } else {
                return (
                  <button key={agr.id} onClick={() => sendAgreementLink(agr.id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 10, background: "#FEE2E2", border: "1.5px solid #EF444440", cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}
                    onMouseEnter={e => { e.currentTarget.style.background = "#FECACA"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "#FEE2E2"; }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <circle cx="12" cy="12" r="10" />
                      <line x1="15" y1="9" x2="9" y2="15" />
                      <line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#DC2626" }}>Send {agr.name}</span>
                  </button>
                );
              }
            })}
            {(data.agreements || []).length === 0 && (
              <div style={{ fontSize: 12, color: C.textMut, fontStyle: "italic" }}>No agreements configured</div>
            )}
          </div>
        </div>

        {/* Preferred Veterinarian Section */}
        <div style={{ marginBottom: 16, padding: "14px 18px", background: C.bg, borderRadius: 12, position: "relative" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 10 }}>Preferred Veterinarian</div>
          <div ref={vetDropRef} style={{ position: "relative" }}>
            <input
              type="text"
              value={vetSearch}
              onChange={(e) => setVetSearch(e.target.value)}
              onFocus={() => setVetDropOpen(true)}
              placeholder="Search veterinarians..."
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.surface, color: C.text, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
            />
            {vetDropOpen && (
              <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: 8, zIndex: 10, maxHeight: 300, overflowY: "auto", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
                {(() => {
                  const filtered = (data.vets || []).filter(v => v.isActive !== false && (v.vetName || '').toLowerCase().includes(vetSearch.toLowerCase()));
                  return (
                    <div>
                      {filtered.map(vet => (
                        <div
                          key={vet.id}
                          onClick={async () => {
                            await save({ ...data, clients: data.clients.map(c => c.id === clientId ? { ...c, preferredVetId: vet.id } : c) });
                            setVetSearch("");
                            setVetDropOpen(false);
                          }}
                          style={{ padding: "10px 12px", cursor: "pointer", borderBottom: `1px solid ${C.borderLight}`, transition: "background 0.1s" }}
                          onMouseEnter={(e) => e.currentTarget.style.background = C.priLt}
                          onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                        >
                          <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{vet.vetName}</div>
                          {vet.clinicName && <div style={{ fontSize: 12, color: C.textSec }}>{vet.clinicName}</div>}
                          {vet.phone && <div style={{ fontSize: 11, color: C.textMut }}>{vet.phone}</div>}
                        </div>
                      ))}
                      {filtered.length === 0 && <div style={{ padding: "10px 12px", color: C.textMut, fontSize: 13 }}>No vets found</div>}
                      <div
                        onClick={async () => {
                          const name = vetSearch.trim();
                          if (!name) return;
                          const newVet = { id: crypto.randomUUID(), vetName: name, clinicName: '', phone: '', email: '', notes: '', isActive: true };
                          await save({ ...data, vets: [...(data.vets || []), newVet], clients: data.clients.map(c => c.id === clientId ? { ...c, preferredVetId: newVet.id } : c) });
                          setVetSearch("");
                          setVetDropOpen(false);
                        }}
                        style={{ padding: "10px 12px", cursor: "pointer", borderTop: `1.5px solid ${C.border}`, background: C.priLt, transition: "background 0.1s", display: "flex", alignItems: "center", gap: 6 }}
                        onMouseEnter={(e) => e.currentTarget.style.background = C.pri + "20"}
                        onMouseLeave={(e) => e.currentTarget.style.background = C.priLt}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.pri} strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        <span style={{ fontSize: 13, fontWeight: 600, color: C.pri }}>{vetSearch.trim() ? `Add "${vetSearch.trim()}" as new vet` : "Add New Vet"}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
          {client.preferredVetId && (() => {
            const vet = (data.vets || []).find(v => v.id === client.preferredVetId);
            return vet ? (
              <div style={{ marginTop: 8, padding: "8px 12px", background: C.priLt, borderRadius: 6, border: `1px solid ${C.pri}20` }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.pri }}>{vet.vetName}</div>
                {vet.clinicName && <div style={{ fontSize: 11, color: C.text }}>{vet.clinicName}</div>}
              </div>
            ) : null;
          })()}
        </div>
      </Card>

      {/* Stats Bar — unified for all clients */}
      <Card style={{marginBottom:16,padding:"16px 24px"}}>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {[
            { label: "Source", value: isLite ? liteSourceLabel : (client.fields.referral_source || "Gingr"), color: isLite ? liteSourceColor : (client.fields.referral_source ? C.text : C.pri) },
            { label: "Client Since", value: (() => { if (isLite) return client.createdAt ? fmtDate(client.createdAt) : "N/A"; const firstRes = reservations.length > 0 ? reservations[reservations.length - 1] : null; return firstRes ? fmtDate(firstRes.checkIn) : "N/A"; })(), color: C.text },
            { label: "Total Spent", value: `$${(stats.totalSpent || 0).toFixed(2)}`, color: C.suc },
            { label: "Total Reservations", value: String(stats.totalRes || 0), color: C.pri },
            { label: "Days Since Last Visit", value: stats.daysSince === null ? "N/A" : stats.daysSince === 0 ? "Today" : `${stats.daysSince} days`, color: stats.daysSince !== null && stats.daysSince <= 7 ? C.suc : stats.daysSince !== null && stats.daysSince <= 30 ? C.warn : C.textSec },
          ].map(st => (
            <div key={st.label} style={{flex:"1 1 140px",padding:"10px 14px",background:C.bg,borderRadius:10,textAlign:"center",minWidth:120}}>
              <div style={{fontSize:10,fontWeight:700,color:C.textMut,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:4}}>{st.label}</div>
              <div style={{fontSize:16,fontWeight:800,color:st.color}}>{st.value}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Tab Bar */}
      <div style={{ display: "flex", borderBottom: `2px solid ${C.borderLight}`, background: C.bg, borderRadius: "12px 12px 0 0", marginBottom: 0, overflowX: "auto" }}>
        {tabs.map(tab => {
          const active = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              style={{ flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "14px 14px", border: "none", borderBottom: `3px solid ${active ? tab.color : "transparent"}`, background: active ? C.surface : "transparent", cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s", marginBottom: -2, whiteSpace: "nowrap" }}>
              <span style={{ fontSize: 13, fontWeight: active ? 700 : 600, color: active ? C.text : C.textSec }}>{tab.label}</span>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 22, height: 22, padding: "0 6px", borderRadius: 11, fontSize: 12, fontWeight: 800, background: active ? tab.color : C.surfaceHover, color: active ? "#fff" : C.textSec, transition: "all 0.15s" }}>{tab.count}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div style={{marginTop:16}}>

        {/* ──── DOGS TAB ──── */}
        {activeTab === "dogs" && (
        <div>
          {dogs.length === 0 ? (
            <Card style={{ textAlign: "center", padding: 32 }}>
              <div style={{ fontSize: 14, color: C.textSec }}>No dogs yet</div>
            </Card>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {dogs.map(dog => (
                <Card key={dog.id} style={{ padding: "16px 20px", cursor: "pointer", transition: "box-shadow 0.15s" }}
                  onClick={() => nav("dog-detail", { clientId, dogId: dog.id })}
                  onMouseEnter={e => e.currentTarget.style.boxShadow = `0 0 0 2px ${C.pri}30`}
                  onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1 }}>
                      {dog._image ? (
                        <img src={dog._image} alt={dog.fields?.name} style={{ width: 44, height: 44, borderRadius: 12, objectFit: "cover", border: `2px solid ${C.border}`, flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 44, height: 44, borderRadius: 12, background: C.priLt, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, color: C.pri, flexShrink: 0 }}>
                          {(dog.fields?.name || "?")[0]}
                        </div>
                      )}
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{dog.fields?.name || "Unknown Dog"}</div>
                        <div style={{ fontSize: 12, color: C.textMut, marginTop: 2 }}>{dog.fields?.breed || "Breed unknown"} {dog.fields?.weight ? `• ${dog.fields.weight} lbs` : ""}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: C.pri, fontWeight: 600, flexShrink: 0 }}>
                      View <I.ChevronRight />
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Reservations Tab */}
      {activeTab === "reservations" && (
        <div>
          {reservations.length === 0 ? (
            <Card style={{ textAlign: "center", padding: 32 }}>
              <div style={{ fontSize: 14, color: C.textSec }}>No reservations yet</div>
            </Card>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {reservations.map(res => (
                <Card key={res.id} style={{ padding: "12px 18px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{res.roomType || tl(res.type)}</div>
                      <div style={{ fontSize: 12, color: C.textMut, marginTop: 2 }}>{fmtDateFull(res.checkIn)} to {fmtDateFull(res.checkOut)}</div>
                    </div>
                    <Badge color={res.status === "checked-in" ? "success" : res.status === "upcoming" ? "info" : "default"}>{titleCase(res.status || "upcoming")}</Badge>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Payments Tab */}
      {activeTab === "payments" && (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: C.text }}>Payment History</h3>
            <span style={{ fontSize: 14, fontWeight: 700, color: C.pri }}>Total: ${stats.totalSpent.toFixed(2)}</span>
          </div>
          {pmts.some(p => p.type === "reservation") && (
            <div style={{ padding: "8px 14px", marginBottom: 12, borderRadius: 8, background: `${C.info}08`, border: `1px solid ${C.info}20`, fontSize: 12, color: C.textSec }}>
              Payment history derived from Gingr reservation records. Individual transaction details are not available through the Gingr API.
            </div>
          )}
          {pmts.length === 0 ? (
            <Card style={{ textAlign: "center", padding: 32 }}>
              <div style={{ fontSize: 14, color: C.textSec }}>No payment records found</div>
              {stats.totalSpent > 0 && <div style={{ fontSize: 12, color: C.textMut, marginTop: 4 }}>Total spent (${stats.totalSpent.toFixed(2)}) is calculated from Gingr reservation data</div>}
            </Card>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {pmts.map(p => (
                <Card key={p.id} style={{ padding: "10px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <span style={{ padding: "2px 7px", borderRadius: 4, fontSize: 11, fontWeight: 600, background: (typeClr[p.type] || C.info) + "18", color: typeClr[p.type] || C.info, textTransform: "capitalize" }}>{p.type}</span>
                    <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>${p.amount?.toFixed(2) || "0.00"}</span>
                    {p.description && <span style={{ fontSize: 12, color: C.textSec, flex: 1, minWidth: 120 }}>{p.description}</span>}
                    {!p.description && p.method && <span style={{ fontSize: 12, color: C.textMut }}>{p.method}</span>}
                    <span style={{ fontSize: 12, color: C.textMut, marginLeft: "auto", flexShrink: 0 }}>{fmtDate(p.timestamp)}</span>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Packages Tab */}
      {activeTab === "packages" && (() => {
        const clientPkgSales = (data.packageSales || []).filter(s => s.clientId === clientId);
        const pkgDefs = data.packages || [];
        return (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: C.text }}>Packages</h3>
              <span style={{ fontSize: 12, color: C.textMut }}>{clientPkgSales.length} package{clientPkgSales.length !== 1 ? "s" : ""}</span>
            </div>
            {clientPkgSales.length === 0 ? (
              <Card style={{ textAlign: "center", padding: 32 }}>
                <div style={{ fontSize: 14, color: C.textSec }}>No packages purchased</div>
                <div style={{ fontSize: 12, color: C.textMut, marginTop: 4 }}>Daycare and boarding packages will appear here when purchased</div>
              </Card>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {clientPkgSales.map(sale => {
                  const pkg = pkgDefs.find(p => p.id === sale.packageId);
                  const total = sale.quantity || 0;
                  const used = sale.used || 0;
                  const remaining = Math.max(0, total - used);
                  const pctUsed = total > 0 ? (used / total) * 100 : 0;
                  const isActive = remaining > 0;
                  const isExpired = sale.expiresAt && new Date(sale.expiresAt) < new Date();
                  return (
                    <Card key={sale.id} style={{ padding: "14px 18px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{pkg?.name || sale.packageName || "Package"}</span>
                        <Badge color={isExpired ? "danger" : isActive ? "success" : "default"} size="sm">
                          {isExpired ? "Expired" : isActive ? "Active" : "Used"}
                        </Badge>
                        {sale.purchaseDate && <span style={{ fontSize: 12, color: C.textMut, marginLeft: "auto" }}>Purchased {fmtDate(sale.purchaseDate)}</span>}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 13 }}>
                        <span style={{ color: C.textSec }}>{used} of {total} sessions used</span>
                        <span style={{ fontWeight: 700, color: isActive ? C.suc : C.textMut }}>{remaining} remaining</span>
                        {sale.expiresAt && <span style={{ fontSize: 11, color: isExpired ? C.dan : C.textMut }}>Expires {fmtDate(sale.expiresAt)}</span>}
                      </div>
                      {/* Progress bar */}
                      <div style={{ marginTop: 8, height: 6, borderRadius: 3, background: C.bg, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${Math.min(100, pctUsed)}%`, borderRadius: 3, background: isActive ? C.suc : C.textMut, transition: "width 0.3s" }} />
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* ──── IGNITE TAB (IGN-003) ──── */}
      {activeTab === "ignite" && (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: C.text }}>Ignite Leads</h3>
              <span style={{ fontSize: 12, color: C.textMut }}>{igniteLeads.length} matched lead{igniteLeads.length !== 1 ? "s" : ""}</span>
            </div>
          </div>

          {igniteLoading ? (
            <Card style={{ textAlign: "center", padding: 40 }}>
              <div style={{ fontSize: 14, color: C.textSec }}>Loading Ignite leads...</div>
            </Card>
          ) : igniteError ? (
            <Card style={{ textAlign: "center", padding: 32, background: C.danLt, border: `1.5px solid ${C.dan}20` }}>
              <div style={{ fontSize: 14, color: C.dan, fontWeight: 600 }}>Failed to load leads: {igniteError}</div>
            </Card>
          ) : igniteLeads.length === 0 ? (
            <Card style={{ textAlign: "center", padding: 40 }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={C.textMut} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 8 }}><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
              <div style={{ fontSize: 14, color: C.textSec, marginBottom: 4 }}>No Ignite leads linked to this client</div>
              <div style={{ fontSize: 12, color: C.textMut }}>Leads from Ignite marketing will appear here when matched</div>
            </Card>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Timeline */}
              {igniteLeads.map((lead, idx) => {
                const isExpanded = igniteExpandedId === lead.id;
                const leadColor = LEAD_TYPE_COLORS[lead.lead_type] || C.info;
                const conf = lead.match_confidence || 0;
                const confClr = confidenceColor(conf);
                const createdDate = new Date(lead.created_at);

                return (
                  <Card key={lead.id} style={{ padding: 0, overflow: "hidden", border: isExpanded ? `1.5px solid ${leadColor}30` : undefined, transition: "border 0.15s" }}>
                    {/* Lead header */}
                    <div
                      onClick={() => setIgniteExpandedId(isExpanded ? null : lead.id)}
                      style={{ padding: "14px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 14, transition: "background 0.1s" }}
                      onMouseEnter={e => e.currentTarget.style.background = C.bg}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                    >
                      {/* Timeline dot */}
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, gap: 4 }}>
                        <div style={{ width: 10, height: 10, borderRadius: "50%", background: leadColor, boxShadow: `0 0 0 3px ${leadColor}20` }} />
                        {idx < igniteLeads.length - 1 && <div style={{ width: 2, height: 20, background: C.border }} />}
                      </div>

                      {/* Lead info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                            {lead.first_name || ""} {lead.last_name || ""}
                          </span>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: leadColor + "15", color: leadColor, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                            {LEAD_TYPE_LABELS[lead.lead_type] || lead.lead_type}
                          </span>
                          {lead.match_type && (
                            <span style={{ fontSize: 10, fontWeight: 600, color: C.textMut, background: C.bg, padding: "2px 6px", borderRadius: 4 }}>
                              Matched by: {MATCH_TYPE_LABELS[lead.match_type] || lead.match_type}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: C.textMut, marginTop: 3, display: "flex", alignItems: "center", gap: 8 }}>
                          <span>{createdDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                          <span style={{ color: C.border }}>|</span>
                          <span>{createdDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                          {lead.source_detail && (
                            <>
                              <span style={{ color: C.border }}>|</span>
                              <span style={{ fontSize: 11 }}>{lead.source_detail}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Confidence badge */}
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{ width: 48, height: 6, borderRadius: 3, background: C.bg, overflow: "hidden" }}>
                            <div style={{ width: `${Math.round(conf * 100)}%`, height: "100%", borderRadius: 3, background: confClr, transition: "width 0.3s" }} />
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 800, color: confClr, fontVariantNumeric: "tabular-nums", minWidth: 36, textAlign: "right" }}>
                            {Math.round(conf * 100)}%
                          </span>
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 600, color: confClr }}>{confidenceLabel(conf)}</span>
                      </div>

                      {/* Expand chevron */}
                      <div style={{ flexShrink: 0, color: C.textMut, transition: "transform 0.2s", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}>
                        <I.ChevronDown />
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div style={{ borderTop: `1px solid ${C.borderLight}`, padding: "16px 18px", background: C.bg + "80" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                          {lead.email && (
                            <div>
                              <div style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 3 }}>Email</div>
                              <div style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{lead.email}</div>
                            </div>
                          )}
                          {lead.phone && (
                            <div>
                              <div style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 3 }}>Phone</div>
                              <div style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{fmtPhone(lead.phone)}</div>
                            </div>
                          )}
                          {lead.raw_email_subject && (
                            <div style={{ gridColumn: "1 / -1" }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 3 }}>Email Subject</div>
                              <div style={{ fontSize: 13, color: C.text }}>{lead.raw_email_subject}</div>
                            </div>
                          )}
                        </div>

                        {/* Form data fields (excluding call_transcription — rendered separately below) */}
                        {lead.form_data && Object.keys(lead.form_data).filter(k => k !== 'call_transcription').length > 0 && (
                          <div style={{ marginBottom: 16 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Captured Fields</div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "12px 14px", background: C.surface, borderRadius: 8, border: `1px solid ${C.borderLight}` }}>
                              {Object.entries(lead.form_data).filter(([key]) => key !== 'call_transcription').map(([key, val]) => (
                                <div key={key}>
                                  <div style={{ fontSize: 10, fontWeight: 600, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.03em" }}>{titleCase(key.replace(/_/g, " "))}</div>
                                  <div style={{ fontSize: 13, color: C.text, marginTop: 1 }}>{String(val)}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Call transcript with speaker separation */}
                        {lead.form_data?.call_transcription && (() => {
                          const raw = lead.form_data.call_transcription;
                          // Parse transcript: handles both newline-separated and inline formats
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
                          // If newline parsing produced no usable blocks, try inline splitting
                          let parsed = blocks.filter(b => b.text);
                          if (parsed.length <= 1 && raw.length > 50) {
                            const inlineBlocks = [];
                            const parts = raw.split(/\b(Recipient|Caller)\b/);
                            let spk = null;
                            for (const part of parts) {
                              const t = part.trim();
                              if (t === "Recipient" || t === "Caller") {
                                spk = t;
                              } else if (spk && t) {
                                inlineBlocks.push({ speaker: spk, text: t });
                                spk = null;
                              }
                            }
                            if (inlineBlocks.length > 1) parsed = inlineBlocks;
                          }
                          if (parsed.length === 0) return null;
                          return (
                            <div style={{ marginBottom: 16 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Call Transcript</div>
                              <div style={{ maxHeight: 400, overflowY: "auto", padding: "14px 16px", background: C.surface, borderRadius: 8, border: `1px solid ${C.borderLight}` }}>
                                {parsed.map((block, bi) => (
                                  <div key={bi} style={{ display: "flex", gap: 10, marginBottom: 8 }}>
                                    <span style={{ fontWeight: 700, color: block.speaker === "Caller" ? "#F97316" : C.pri, minWidth: 44, flexShrink: 0, fontSize: 11, paddingTop: 5, textAlign: "right" }}>
                                      {block.speaker === "Caller" ? "Caller" : "Staff"}
                                    </span>
                                    <span style={{ color: C.text, fontSize: 13, lineHeight: 1.6, wordBreak: "break-word", flex: 1, background: block.speaker === "Caller" ? "#FFF7ED" : `${C.pri}06`, padding: "6px 10px", borderRadius: 8 }}>
                                      {block.text}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })()}

                        {/* Call recording link */}
                        {lead.call_recording_url && (
                          <div style={{ marginBottom: 16 }}>
                            <a href={lead.call_recording_url} target="_blank" rel="noopener noreferrer"
                              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, background: C.priLt, color: C.pri, fontSize: 13, fontWeight: 600, textDecoration: "none", border: `1px solid ${C.pri}20`, transition: "background 0.15s" }}
                              onMouseEnter={e => e.currentTarget.style.background = C.pri + "20"}
                              onMouseLeave={e => e.currentTarget.style.background = C.priLt}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                              Listen to Call Recording
                            </a>
                          </div>
                        )}

                        {/* Actions */}
                        <div style={{ display: "flex", gap: 8, alignItems: "center", paddingTop: 8, borderTop: `1px solid ${C.borderLight}` }}>
                          <button
                            onClick={(e) => { e.stopPropagation(); setIgniteLinkModal({ leadId: lead.id, action: 'unlink' }); }}
                            style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 6, border: `1px solid ${C.dan}30`, background: C.danLt, color: C.dan, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}
                            onMouseEnter={e => e.currentTarget.style.background = C.dan + "18"}
                            onMouseLeave={e => e.currentTarget.style.background = C.danLt}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                            Unlink Lead
                          </button>
                          <span style={{ fontSize: 11, color: C.textMut, marginLeft: "auto" }}>Lead ID: {lead.id.slice(0, 8)}...</span>
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ──── LIFECYCLE TAB (CLM-008) ──── */}
      {activeTab === "lifecycle" && (
        <div>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: C.text }}>Activity Log</h3>
              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 24, height: 24, padding: "0 7px", borderRadius: 12, fontSize: 12, fontWeight: 800, background: "#8B5CF6", color: "#fff" }}>{allTimelineEvents.length}</span>
            </div>
            {/* Current stage badge */}
            {(() => {
              const stage = detectClientStage(client, data.serverStats);
              const stageColors = { Active: C.suc, Leads: C.acc, Lapsed: C.dan, Reclassified: C.textMut };
              const stageBgs = { Active: C.sucLt, Leads: C.accLt, Lapsed: C.danLt, Reclassified: C.bg };
              return (
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 8, background: stageBgs[stage] || C.bg, border: `1.5px solid ${(stageColors[stage] || C.textMut)}25` }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: stageColors[stage] || C.textMut }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: stageColors[stage] || C.textMut }}>Current: {stage}</span>
                </div>
              );
            })()}
          </div>

          {/* ── Manual Note/Follow-Up Entry Form ── */}
          <Card style={{ padding: "16px 20px", marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 12 }}>Add Log Entry</div>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
              <div style={{ flex: 1 }}>
                <textarea
                  value={lcNoteText}
                  onChange={e => setLcNoteText(e.target.value)}
                  placeholder="Add a note or observation..."
                  rows={2}
                  style={{
                    width: "100%", padding: "10px 14px", borderRadius: 10, border: `1.5px solid ${C.border}`,
                    fontSize: 13, fontFamily: "inherit", background: C.surface, color: C.text,
                    resize: "vertical", outline: "none", boxSizing: "border-box", lineHeight: 1.5,
                    transition: "border-color 0.15s",
                  }}
                  onFocus={e => e.currentTarget.style.borderColor = C.pri}
                  onBlur={e => e.currentTarget.style.borderColor = C.border}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
                <label style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em" }}>Follow-up</label>
                <input
                  type="date"
                  value={lcFollowUpDate}
                  onChange={e => setLcFollowUpDate(e.target.value)}
                  style={{
                    padding: "8px 10px", borderRadius: 8, border: `1.5px solid ${C.border}`,
                    fontSize: 12, fontFamily: "inherit", background: C.surface, color: C.text,
                    outline: "none", width: 140,
                  }}
                />
              </div>
              <button
                onClick={handleAddLifecycleNote}
                disabled={lcSubmitting || (!lcNoteText.trim() && !lcFollowUpDate)}
                style={{
                  padding: "10px 20px", borderRadius: 10, border: "none",
                  background: (!lcNoteText.trim() && !lcFollowUpDate) ? C.surfaceHover : C.pri,
                  color: (!lcNoteText.trim() && !lcFollowUpDate) ? C.textMut : "#fff",
                  fontSize: 13, fontWeight: 700, cursor: (!lcNoteText.trim() && !lcFollowUpDate) ? "not-allowed" : "pointer",
                  fontFamily: "inherit", transition: "all 0.15s", flexShrink: 0,
                  opacity: lcSubmitting ? 0.6 : 1,
                }}
                onMouseEnter={e => { if (lcNoteText.trim() || lcFollowUpDate) e.currentTarget.style.background = C.priL; }}
                onMouseLeave={e => { if (lcNoteText.trim() || lcFollowUpDate) e.currentTarget.style.background = C.pri; }}
              >
                {lcSubmitting ? "Adding..." : lcFollowUpDate ? "Schedule" : "Add Note"}
              </button>
            </div>
          </Card>

          {/* ── Timeline ── */}
          {lcEventsLoading ? (
            <Card style={{ textAlign: "center", padding: 48 }}>
              <div style={{ fontSize: 14, color: C.textSec }}>Loading activity log...</div>
            </Card>
          ) : allTimelineEvents.length === 0 ? (
            <Card style={{ textAlign: "center", padding: 48 }}>
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={C.textMut} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12 }}>
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              <div style={{ fontSize: 14, color: C.textSec, marginBottom: 4 }}>No activity yet</div>
              <div style={{ fontSize: 12, color: C.textMut }}>Lifecycle events will appear here as they occur</div>
            </Card>
          ) : (
            <div style={{ position: "relative" }}>
              {/* Vertical timeline line */}
              <div style={{
                position: "absolute", left: 23, top: 24, bottom: 24,
                width: 2, background: `linear-gradient(to bottom, ${C.border}, ${C.borderLight})`,
                borderRadius: 1, zIndex: 0,
              }} />

              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {allTimelineEvents.map((evt, idx) => {
                  const style = getEventStyle(evt.eventType);
                  const evtDate = new Date(evt.date);
                  const isFirst = idx === 0;
                  const isLast = idx === allTimelineEvents.length - 1;

                  return (
                    <div key={evt.id} style={{
                      display: "flex", gap: 16, position: "relative", zIndex: 1,
                      padding: isFirst ? "0 0 4px 0" : isLast ? "4px 0 0 0" : "4px 0",
                    }}>
                      {/* Timeline dot */}
                      <div style={{
                        display: "flex", flexDirection: "column", alignItems: "center",
                        flexShrink: 0, width: 48, paddingTop: 2,
                      }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: "50%",
                          background: style.bg, border: `2.5px solid ${style.color}`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          boxShadow: `0 0 0 4px ${C.surface}`,
                          transition: "transform 0.15s",
                        }}>
                          <TimelineIcon type={style.icon} color={style.color} />
                        </div>
                      </div>

                      {/* Event content card */}
                      <div style={{
                        flex: 1, minWidth: 0, padding: "14px 18px",
                        background: C.surface, borderRadius: 12,
                        border: `1px solid ${C.borderLight}`,
                        marginBottom: 8,
                        transition: "box-shadow 0.15s, border-color 0.15s",
                      }}
                        onMouseEnter={e => { e.currentTarget.style.boxShadow = `0 2px 8px ${style.color}10`; e.currentTarget.style.borderColor = style.color + "30"; }}
                        onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.borderColor = C.borderLight; }}
                      >
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {/* Event type badge */}
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                              <span style={{
                                display: "inline-flex", alignItems: "center", gap: 4,
                                padding: "2px 10px", borderRadius: 6,
                                fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em",
                                background: style.bg, color: style.color, border: `1px solid ${style.color}20`,
                              }}>
                                {style.label}
                              </span>
                              {/* Stage change badges */}
                              {evt.eventType === "stage_change" && evt.fromStage && evt.toStage && (
                                <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}>
                                  <span style={{ fontWeight: 600, color: C.textMut }}>{titleCase(evt.fromStage)}</span>
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.textMut} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                                  <span style={{ fontWeight: 700, color: style.color }}>{titleCase(evt.toStage)}</span>
                                </div>
                              )}
                            </div>

                            {/* Description */}
                            {evt.description && (
                              <div style={{ fontSize: 13, color: C.text, lineHeight: 1.55, fontWeight: 500 }}>
                                {evt.description}
                              </div>
                            )}

                            {/* Follow-up date */}
                            {evt.followUpDate && (
                              <div style={{
                                display: "inline-flex", alignItems: "center", gap: 6,
                                marginTop: 8, padding: "5px 12px", borderRadius: 6,
                                background: C.accLt, border: `1px solid ${C.acc}20`,
                              }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.acc} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                                </svg>
                                <span style={{ fontSize: 11, fontWeight: 700, color: C.accDk }}>
                                  Follow-up: {new Date(evt.followUpDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Timestamp + triggered by */}
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, flexShrink: 0 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: C.text, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                              {evtDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </span>
                            <span style={{ fontSize: 10, color: C.textMut, whiteSpace: "nowrap" }}>
                              {evtDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                            </span>
                            <span style={{
                              fontSize: 10, fontWeight: 600, color: C.textMut, marginTop: 2,
                              padding: "1px 6px", borderRadius: 4, background: C.bg,
                            }}>
                              {evt.triggeredBy}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Notes Tab */}
      {activeTab === "notes" && (
        <div>
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input type="text" value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="Add a note..." style={{ flex: 1, padding: "10px 14px", borderRadius: 10, border: `1.5px solid ${C.border}`, fontSize: 14, fontFamily: "inherit", background: C.surface, color: C.text }} onKeyDown={(e) => e.key === "Enter" && handleSaveNote()} />
              <Btn variant="primary" onClick={handleSaveNote} disabled={!newNote.trim() || noteSaving}>{noteSaving ? "Saving..." : "Add"}</Btn>
            </div>
          </div>
          {(client.clientNotes || []).length === 0 ? (
            <Card style={{ textAlign: "center", padding: 32 }}>
              <div style={{ fontSize: 14, color: C.textSec }}>No notes yet</div>
            </Card>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(client.clientNotes || []).map(note => (
                <Card key={note.id} style={{ padding: "12px 16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, color: C.text }}>{note.text}</div>
                      <div style={{ fontSize: 11, color: C.textMut, marginTop: 6 }}>{note.addedBy} • {fmtDate(note.timestamp)}</div>
                    </div>
                    <button onClick={() => handleDeleteNote(note.id)} style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: C.danLt, color: C.dan, cursor: "pointer", fontFamily: "inherit", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* History Tab */}
      {activeTab === "history" && (
        <div>
          {((data.auditLog || []).filter(e => e.tableName === 'k9_clients' && e.recordId === clientId) || []).length === 0 ? (
            <Card style={{ textAlign: "center", padding: 32 }}>
              <div style={{ fontSize: 14, color: C.textSec }}>No history yet</div>
            </Card>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {(data.auditLog || []).filter(e => e.tableName === 'k9_clients' && e.recordId === clientId).map(entry => (
                <Card key={entry.id} style={{ padding: "14px 18px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{entry.action}</div>
                      <div style={{ fontSize: 12, color: C.textMut, marginTop: 4 }}>by {entry.changedBy}</div>
                      {Array.isArray(entry.details) && entry.details.length > 0 && (
                        <div style={{ fontSize: 12, color: C.textMut, marginTop: 6, paddingLeft: 12, borderLeft: `2px solid ${C.border}` }}>
                          {entry.details.map((d, i) => (
                            <div key={i}>{d.field}: {d.oldVal} → {d.newVal}</div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: C.textMut, whiteSpace: "nowrap" }}>{fmtDate(entry.timestamp)}</div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      </div>

      {/* ──── CLM-005: Push to Gingr Confirmation Modal ──── */}
      {gingrModal && (
        <Modal title="Push to Gingr" onClose={() => { if (!gingrSyncing) setGingrModal(false); }}>
          {gingrResult ? (
            <div style={{ textAlign: "center", padding: "16px 0" }}>
              {gingrResult.success ? (
                <>
                  <div style={{ width: 48, height: 48, borderRadius: "50%", background: C.sucLt, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.suc} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: C.suc, marginBottom: 8 }}>{gingrResult.message}</div>
                  <div style={{ fontSize: 12, color: C.textMut }}>Synced at {new Date(gingrResult.timestamp).toLocaleString()}</div>
                </>
              ) : (
                <>
                  <div style={{ width: 48, height: 48, borderRadius: "50%", background: C.danLt, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.dan} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: C.dan, marginBottom: 8 }}>Sync Failed</div>
                  <div style={{ fontSize: 13, color: C.textSec, maxWidth: 400, margin: "0 auto" }}>{gingrResult.message}</div>
                </>
              )}
              <div style={{ marginTop: 20 }}>
                <Btn variant="primary" onClick={() => setGingrModal(false)}>Close</Btn>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 14, color: C.textSec, marginBottom: 16 }}>
                {client.gingrId ? "This will update the existing Gingr record with current K9 Ops data." : "This will create a new client record in Gingr."}
              </div>

              {/* Missing required fields warning */}
              {gingrPayload.missingRequired.length > 0 && (
                <div style={{ padding: "10px 14px", borderRadius: 8, background: C.warnLt, border: `1.5px solid ${C.warn}25`, marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.warn, marginBottom: 4 }}>Missing Required Fields</div>
                  <div style={{ fontSize: 12, color: "#92400E" }}>{gingrPayload.missingRequired.join(", ")}</div>
                </div>
              )}

              {/* Client fields preview */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Client Data</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, padding: "12px 14px", background: C.bg, borderRadius: 8 }}>
                  {GINGR_CLIENT_FIELDS.filter(gf => gingrPayload.client[gf.gingrField]).map(gf => (
                    <div key={gf.id}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: C.textMut, textTransform: "uppercase" }}>{gf.label}</div>
                      <div style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{gf.gingrField === "phone" ? fmtPhone(gingrPayload.client[gf.gingrField]) : gingrPayload.client[gf.gingrField]}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Dogs preview */}
              {gingrPayload.dogs.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Dogs ({gingrPayload.dogs.length})</div>
                  {gingrPayload.dogs.map(dp => (
                    <div key={dp.dogId} style={{ padding: "10px 14px", background: C.bg, borderRadius: 8, marginBottom: 6 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 4 }}>{dp.dogName}</div>
                      {dp.missing.length > 0 && (
                        <div style={{ fontSize: 11, color: C.warn }}>Missing: {dp.missing.join(", ")}</div>
                      )}
                      <div style={{ fontSize: 11, color: C.textMut }}>{Object.keys(dp.payload).length} fields mapped</div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <Btn variant="secondary" onClick={() => setGingrModal(false)} disabled={gingrSyncing}>Cancel</Btn>
                <Btn variant="primary" onClick={handlePushToGingr} disabled={gingrSyncing}>
                  {gingrSyncing ? "Syncing..." : client.gingrId ? "Update in Gingr" : "Create in Gingr"}
                </Btn>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* ──── IGN-003: Unlink Confirmation Modal ──── */}
      {igniteLinkModal && (
        <Modal title="Unlink Ignite Lead" onClose={() => { if (!igniteLinking) setIgniteLinkModal(null); }}>
          <div style={{ fontSize: 14, color: C.textSec, marginBottom: 20 }}>
            Are you sure you want to unlink this Ignite lead from {client.fields.first_name} {client.fields.last_name}? The lead will be moved back to the unmatched queue.
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn variant="secondary" onClick={() => setIgniteLinkModal(null)} disabled={igniteLinking}>Cancel</Btn>
            <Btn variant="danger" onClick={() => handleUnlinkLead(igniteLinkModal.leadId)} disabled={igniteLinking}>
              {igniteLinking ? "Unlinking..." : "Unlink Lead"}
            </Btn>
          </div>
        </Modal>
      )}

    </div>
  );
}

// ─── Settings Page ────────────────────────────────────────────────────────
// ─── Gingr Integration Tab (extracted from old SettingsPage) ────────────────

export default ClientDetailPage;
