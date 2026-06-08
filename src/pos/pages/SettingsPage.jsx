import { ACTION_LABELS, ACTION_LEVELS } from "../lib/fieldRules";
import { AgreementsPage } from "./AgreementsPage";
import { Badge, Btn, Card, Inp, MiniDatePicker } from "../components/ui";
import { C, TAG_COLORS } from "../constants/colors";
import { DEF_HOTKEY_BINDINGS, HOTKEY_LABELS, ROOM_TYPES } from "../constants/forms";
import { DEF_REQUIRED_VACCINES, VACCINES } from "../constants/vaccines";
import { DEMO } from "../demo/demoData";
import { DailyOpsTemplateTab } from "../components/DailyOpsTemplateTab";
import { DiscountsSection } from "../components/DiscountsSection";
import { DropdownListsTab } from "../components/DropdownListsTab";
import { EODTemplateTab } from "../components/EODTemplateTab";
import { I } from "../icons";
import { MessageTemplatesTab } from "../components/MessageTemplatesTab";
import { PackagesSection } from "../components/PackagesSection";
import { PricingTab } from "../components/PricingTab";
import { QuestionnaireSettingsTab } from "../components/QuestionnaireSettingsTab";
import { RolesPermissionsTab } from "../components/RolesPermissionsTab";
import { RunCardConfigTab } from "../components/RunCardConfigTab";
import { TeamTab } from "../components/TeamTab";
import { VetDirectoryTab } from "../components/VetDirectoryTab";
import { buildVaccineReminders } from "../lib/vaccineReminders";
import { gid, todayStr } from "../lib/format";
import { hasPermission } from "../lib/roles";
import { supabase } from "../../supabaseClient";
import { useEffect, useState } from "react";
import { uuid } from "../lib/ids";

function SettingsPage({ data, save, profile, nav, settingsTab, locationSlug, addGlobalToast }) {
  const [tab, setTab] = useState(settingsTab || null);
  useEffect(() => { setTab(settingsTab || null); }, [settingsTab]);
  const [settingsSearch, setSettingsSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newClosedDate, setNewClosedDate] = useState("");
  const [newClosedLabel, setNewClosedLabel] = useState("");
  const [newField, setNewField] = useState({ name: "", type: "text", required: false, options: "" });
  const [showAddTag, setShowAddTag] = useState(false);
  const [newTag, setNewTag] = useState({ name: "", colorIdx: 0 });
  const [editingTagColor, setEditingTagColor] = useState(null); // tag id being color-edited
  const [editingTagName, setEditingTagName] = useState(null); // tag id being name-edited
  const [editingTagNameVal, setEditingTagNameVal] = useState("");
  const [resetConfirm, setResetConfirm] = useState(false);
  const [eraseConfirm, setEraseConfirm] = useState(false);
  const [erasing, setErasing] = useState(false);
  const [scanPending, setScanPending] = useState(null); // array of pending reminders or null
  const [clearLogConfirm, setClearLogConfirm] = useState(false);
  const [removeTierConfirm, setRemoveTierConfirm] = useState(null); // tier id to remove or null
  const [resetTiersConfirm, setResetTiersConfirm] = useState(false);

  // Facility settings
  const fs = data.facilitySettings || { largeDogDaycareSF: 0, smallDogDaycareSF: 0 };
  const updateFS = async (key, val) => {
    const n = Math.max(0, parseInt(val) || 0);
    await save({ ...data, facilitySettings: { ...fs, [key]: n } });
  };
  const lgCap = Math.floor((fs.largeDogDaycareSF || 0) / 18);
  const smCap = Math.floor((fs.smallDogDaycareSF || 0) / 12);

  // Room management
  const rooms = data.rooms || {};
  const [roomBulk, setRoomBulk] = useState({});
  const addRoomsBulk = async (rt) => {
    const input = (roomBulk[rt] || "").trim();
    if (!input) return;
    const newRooms = input.split(",").map(s => s.trim()).filter(Boolean);
    const existing = rooms[rt] || [];
    const merged = [...existing, ...newRooms.filter(r => !existing.includes(r))];
    await save({ ...data, rooms: { ...rooms, [rt]: merged } });
    setRoomBulk({ ...roomBulk, [rt]: "" });
  };
  const removeRoom = async (rt, roomName) => {
    const updated = (rooms[rt] || []).filter(r => r !== roomName);
    await save({ ...data, rooms: { ...rooms, [rt]: updated } });
  };

  // Required Fields matrix helpers
  const [addFieldTarget, setAddFieldTarget] = useState("client"); // which section gets the new field
  const handleAddFieldMatrix = async (targetKey) => {
    if (!newField.name.trim()) return;
    const id = newField.name.toLowerCase().replace(/[^a-z0-9]/g,"_")+"_"+gid().slice(0,4);
    const targetFields = targetKey === "clientFields" ? data.clientFields : data.dogFields;
    const f = { id, name:newField.name.trim(), type:newField.type, requiredFor:[], locked:false, order:targetFields.length, ...(newField.type==="select"?{options:newField.options.split(",").map(o=>o.trim()).filter(Boolean)}:{}) };
    await save({...data,[targetKey]:[...targetFields,f]});
    setNewField({name:"",type:"text",required:false,options:""});setShowAdd(false);
  };
  const toggleFieldLevel = async (fieldKey, fid, level) => {
    const fieldArr = data[fieldKey];
    const updated = fieldArr.map(f => {
      if (f.id !== fid) return f;
      // Phone at create is locked
      if (f.isKey && level === "create") return f;
      const rf = f.requiredFor || [];
      const levelIdx = ACTION_LEVELS.indexOf(level);
      // Find current minimum level (the only stored value)
      const curMin = rf.length > 0 ? Math.min(...rf.map(a => ACTION_LEVELS.indexOf(a)).filter(i => i >= 0)) : -1;
      const isActiveOrInherited = curMin >= 0 && levelIdx >= curMin;
      if (isActiveOrInherited) {
        if (levelIdx === curMin) {
          // Clicking the exact minimum level — toggle it off entirely
          return { ...f, requiredFor: [] };
        } else {
          // Clicking a higher level that's inherited — raise the minimum to this level
          return { ...f, requiredFor: [level] };
        }
      } else {
        // Clicking a lower level or enabling for the first time — set as new minimum
        return { ...f, requiredFor: [level] };
      }
    });
    await save({...data, [fieldKey]: updated});
  };
  const removeFieldMatrix = async (fieldKey, fid) => {
    await save({...data, [fieldKey]: data[fieldKey].filter(f => f.id !== fid)});
  };

  // Legacy compat — keep old references working if tab is "client" or "dog"
  const fields = tab === "client" ? data.clientFields : tab === "dog" ? data.dogFields : [];
  const fieldKey = tab === "client" ? "clientFields" : "dogFields";

  const handleAddTag = async () => {
    if (!newTag.name.trim()) return;
    const t = { id: "tag_" + gid(), name: newTag.name.trim(), colorIdx: newTag.colorIdx };
    await save({ ...data, dogTags: [...data.dogTags, t] });
    setNewTag({ name: "", colorIdx: 0 }); setShowAddTag(false);
  };
  const updateTagColor = async (tid, colorIdx) => {
    await save({ ...data, dogTags: data.dogTags.map(t => t.id === tid ? { ...t, colorIdx } : t) });
    setEditingTagColor(null);
  };
  const removeTag = async (tid) => {
    const newTags = data.dogTags.filter(t => t.id !== tid);
    const newDogs = data.dogs.map(d => ({ ...d, tags: (d.tags || []).filter(t => t !== tid) }));
    await save({ ...data, dogTags: newTags, dogs: newDogs });
  };

  const handleReset = async () => {
    // Create a downloadable backup before resetting
    try {
      const backup = JSON.stringify(data, null, 2);
      const blob = new Blob([backup], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `k9-backup-${new Date().toISOString().slice(0,10)}.json`;
      a.click(); URL.revokeObjectURL(url);
    } catch (e) { console.warn("Backup download failed:", e); }
    await save(DEMO);
    setResetConfirm(false);
  };

  const handleEraseAll = async () => {
    setErasing(true);
    try {
      // Use profile.location_id (locationId from useData isn't in scope here)
      const loc = profile.location_id;
      // Delete from all entity tables in FK-safe order (children first)
      // Tier 4: deepest children (no dependents)
      await Promise.all([
        supabase.from('audit_log').delete().eq('location_id', loc),
        supabase.from('k9_messages').delete().eq('location_id', loc),
        supabase.from('k9_daily_ops').delete().eq('location_id', loc),
        supabase.from('checkout_log').delete().neq('id', '00000000-0000-0000-0000-000000000000'), // no location_id, delete via reservation
        supabase.from('invoice_line_items').delete().neq('id', '00000000-0000-0000-0000-000000000000'), // cascades from invoices
      ]);
      // Tier 3: evaluations, payments, package sales, invoices
      await Promise.all([
        supabase.from('k9_evaluations_v2').delete().eq('location_id', loc),
        supabase.from('k9_payments').delete().eq('location_id', loc),
        supabase.from('k9_package_sales_v2').delete().eq('location_id', loc),
        supabase.from('invoices').delete().eq('location_id', loc),
      ]);
      // Tier 2: reservations, dog child tables
      await supabase.from('k9_reservations').delete().eq('location_id', loc);
      await Promise.all([
        supabase.from('dog_vaccines').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
        supabase.from('weight_log').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
        supabase.from('feeding_schedules').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
        supabase.from('feeding_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
        supabase.from('medication_schedules').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
        supabase.from('medication_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
        supabase.from('dog_tag_history').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
        supabase.from('dog_incidents').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
        supabase.from('dog_media').delete().neq('id', '00000000-0000-0000-0000-000000000000'),
        supabase.from('k9_dogs').delete().eq('location_id', loc),
      ]);
      // Tier 1: clients (cascades contacts, lifecycle events)
      await Promise.all([
        supabase.from('client_contacts').delete().eq('location_id', loc),
        supabase.from('k9_clients').delete().eq('location_id', loc),
      ]);
      // Also clear booking drafts
      if (locationSlug) await supabase.from('booking_drafts_v2').delete().eq('location_id', loc);
      // Reset in-memory state to empty arrays
      const empty = { ...data, clients: [], dogs: [], reservations: [], evaluations: [], eodEntries: [], dailyOps: [], payments: [], packages: [], packageSales: [], messages: [], auditLog: [], clientContacts: [] };
      await save(empty);
    } catch (err) { console.error('Erase failed:', err); }
    setErasing(false);
    setEraseConfirm(false);
  };

  // Settings sections for grouped list view
  const settingsSections = [
    { label: "Resort Setup", items: [
      { id: "resort-info", label: "Resort Info", desc: "Resort address and timezone configuration", keywords: "resort address location timezone time zone city state zip" },
      { id: "facility", label: "Facility", desc: "Daycare square footage and capacity calculations", keywords: "facility square footage capacity daycare large small" },
      { id: "rooms", label: "Rooms", desc: "Configure room numbers for each boarding room type", keywords: "rooms boarding luxury executive double single compartment" },
      { id: "closed-dates", label: "Closed Dates", desc: "Holidays and dates closed to the public — no check-ins or check-outs", keywords: "closed dates holidays christmas thanksgiving new year memorial labor easter july 4 blackout" },
      { id: "booking-settings", label: "Online Booking", desc: "Tour scheduling, daycare capacity, and self-booking page settings", keywords: "booking online tour daycare capacity self-service concurrent scheduling" },
    ]},
    { label: "Pricing & Packages", items: [
      { id: "pricing", label: "Pricing", desc: "Room rates, daycare fees, add-ons, and payment rules", keywords: "pricing rates fees cost money payment deposit" },
      { id: "packages", label: "Packages", desc: "Create and manage service packages with built-in discounts", keywords: "packages deals discounts bundles promotions savings" },
      { id: "discounts", label: "Discounts", desc: "Create discounts linked to referral sources with usage caps", keywords: "discounts referral source lodging cap coupon promotion" },
      { id: "unpaid-deposits", label: "Unpaid Deposits", desc: "View outstanding deposit balances for upcoming boarding reservations", keywords: "unpaid deposits report payment financial outstanding balance" },
    ]},
    { label: "Client & Pet Data", items: [
      { id: "fields", label: "Required Fields", desc: "Configure which fields are required at each lifecycle stage", keywords: "required fields client dog matrix create tour eval reservation phone email name" },
      { id: "tags", label: "Dog Tags", desc: "Create color-coded tags for daycare, private play, etc.", keywords: "tags labels categories private play daycare" },
      { id: "dropdowns", label: "Dropdown Lists", desc: "Customize dropdown options for breeds, food types, etc.", keywords: "dropdowns lists options breeds food bath medication" },
      { id: "questionnaire", label: "Questionnaire", desc: "Customize the Getting to Know Your Dog questionnaire", keywords: "questionnaire form dog intake application getting to know" },
      { id: "vets", label: "Vet Directory", desc: "Manage veterinarian contacts referenced in client and dog profiles", keywords: "vet veterinarian directory clinic doctor animal hospital" },
    ]},
    { label: "Compliance", items: [
      { id: "vaccines", label: "Vaccines", desc: "Configure required vaccinations and expiration tracking", keywords: "vaccines rabies bordetella dhpp flu required" },
      { id: "agreements", label: "Agreements", desc: "Manage boarding and daycare agreement documents", keywords: "agreements contracts waivers liability boarding" },
      { id: "policies", label: "Resort Policies", desc: "Vaccine grace periods, age limits, grandfathering rules", keywords: "policies compliance vaccines grace period age limit grandfather senior" },
      { id: "compliance-rules", label: "Compliance Rules", desc: "Configure which compliance checks apply to each appointment type", keywords: "compliance spay neuter intact group play private play daycare boarding check-in rules" },
    ]},
    { label: "Operations", items: [
      { id: "eod", label: "EOD Template", desc: "End-of-day report sections and template setup", keywords: "eod end of day template report sections" },
      { id: "daily-ops", label: "Daily Ops Templates", desc: "Opening, FE, BE, and closing checklist templates", keywords: "daily ops operations checklists opening closing front back" },
      { id: "run-card", label: "Run Card", desc: "Configure which information appears on printed boarding run cards", keywords: "run card print boarding kennel card daily schedule" },
    ]},
    { label: "Communications", items: [
      { id: "message-templates", label: "Message Templates", desc: "Customize text message templates with variables", keywords: "message templates text sms texting variables dog name" },
      { id: "automations", label: "Automations", desc: "Vaccine reminder SMS automation with configurable tiers and reporting", keywords: "automations reminders vaccines text sms twilio notifications expiry expiring alerts" },
    ]},
    { label: "Team & Security", items: [
      { id: "team", label: "Team Management", desc: "View, invite, and manage team members and roles", keywords: "team users staff members invite roles owner manager admin" },
      { id: "roles", label: "Roles & Permissions", desc: "Create custom roles and configure granular permissions", keywords: "roles permissions access control rbac custom staff owner manager security" },
      { id: "session-security", label: "Session Security", desc: "Auto-sign-out timer to prevent stale sessions", keywords: "session timeout auto sign out security timer hours csr account switch" },
    ]},
    { label: "Legal", items: [
      { id: "legal", label: "Legal", desc: "Terms of Service and Privacy Policy", keywords: "legal terms of service privacy policy tos" },
    ]},
    { label: null, items: [
      { id: "hotkeys", label: "Hotkeys", desc: "Enable or disable keyboard shortcuts and shortcut hints", keywords: "hotkeys keyboard shortcuts keys bindings hints" },
      { id: "reset", label: "Demo Data", desc: "Reset all data back to the demo dataset", keywords: "reset demo data restore" },
    ]},
  ];
  // Map settings tab IDs → required permission keys
  const SETTINGS_PERM_MAP = {
    fields:"edit_fields",client:"edit_fields",dog:"edit_fields",tags:"edit_tags_config",vaccines:"edit_vaccines_config",
    agreements:"edit_agreements",pricing:"edit_pricing",packages:"edit_pricing",discounts:"edit_pricing","message-templates":"edit_facility",dropdowns:"edit_dropdowns",
    "unpaid-deposits":"view_reports",eod:"edit_eod_template","daily-ops":"edit_ops_template",
    facility:"edit_facility",rooms:"edit_rooms","closed-dates":"edit_facility",policies:"edit_vaccines_config","compliance-rules":"edit_vaccines_config","booking-settings":"edit_facility",
    team:"manage_team",roles:"manage_roles","session-security":"manage_team",automations:"manage_team",reset:"reset_data",
  };
  const hp = (k) => hasPermission(profile, data, k);
  // Filter settings items by permission
  const permFilteredSections = settingsSections.map(sec => ({
    ...sec, items: sec.items.filter(item => { const perm = SETTINGS_PERM_MAP[item.id]; return !perm || hp(perm); })
  })).filter(sec => sec.items.length > 0);

  const settingsCategories = permFilteredSections.flatMap(s => s.items);
  const sq = settingsSearch.trim().toLowerCase();
  const filteredSections = sq
    ? [{ label: null, items: settingsCategories.filter(c => c.label.toLowerCase().includes(sq) || c.desc.toLowerCase().includes(sq) || c.keywords.includes(sq)) }]
    : permFilteredSections;

  // If a tab is selected, show the content; otherwise show the list
  if (tab) {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <button onClick={() => nav ? nav("settings") : setTab(null)} style={{ display: "flex", alignItems: "center", gap: 6, border: "none", background: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, color: C.pri, padding: "6px 0" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            Settings
          </button>
          <span style={{ color: C.textMut, fontSize: 13 }}>/</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{(settingsCategories.find(c => c.id === tab) || {}).label}</span>
        </div>

        {tab === "team" ? (
          <TeamTab profile={profile} data={data} save={save} />
        ) : tab === "roles" ? (
          <RolesPermissionsTab data={data} save={save} profile={profile} />
        ) : tab === "automations" ? (() => {
          const DEF_TIERS = [
            { id: "t30", name: "Early Warning", dayStart: 28, dayEnd: 30, priority: "low", enabled: true, template: "Hi {ownerFirst}! This is a friendly reminder from {locationName} that {dogName}'s {vaccineName} vaccine expires on {expiryDate}. Please schedule an appointment with your vet to keep {dogName} up to date!" },
            { id: "t14", name: "2-Week Reminder", dayStart: 12, dayEnd: 14, priority: "medium", enabled: true, template: "Hi {ownerFirst}, just a heads up — {dogName}'s {vaccineName} vaccine expires in about 2 weeks ({expiryDate}). Please update their records so we can continue providing the best care!" },
            { id: "t3", name: "Final Warning", dayStart: 2, dayEnd: 4, priority: "high", enabled: true, template: "Important: {dogName}'s {vaccineName} vaccine expires on {expiryDate} — that's just a few days away! Please get this updated ASAP to avoid any interruption in services at {locationName}." },
            { id: "t0", name: "Expiration Day", dayStart: -1, dayEnd: 1, priority: "critical", enabled: true, template: "Urgent: {dogName}'s {vaccineName} vaccine is expiring today ({expiryDate}). {dogName} will not be able to attend services at {locationName} without a valid vaccine record. Please update us once renewed!" },
            { id: "tPost", name: "Post-Expiry Follow-Up", dayStart: -8, dayEnd: -6, priority: "critical", enabled: true, template: "Hi {ownerFirst}, {dogName}'s {vaccineName} vaccine expired on {expiryDate}. We miss seeing {dogName}! Please send us updated records so we can get {dogName} back on the schedule at {locationName}." },
          ];
          const autoCfg = data.automations || { enabled: false, dailyCap: 50, tiers: DEF_TIERS, reminderLog: [] };
          const tiers = autoCfg.tiers || DEF_TIERS;
          const log = autoCfg.reminderLog || [];
          const updateAuto = async (updates) => await save({ ...data, automations: { ...autoCfg, ...updates } });
          const updateTier = async (tierId, updates) => {
            const newTiers = tiers.map(t => t.id === tierId ? { ...t, ...updates } : t);
            await updateAuto({ tiers: newTiers });
          };
          const addTier = async () => {
            const newId = uuid();
            const newTier = { id: newId, name: "New Tier", dayStart: 0, dayEnd: 0, priority: "low", enabled: true, template: "Hi {ownerFirst}, {dogName}'s {vaccineName} vaccine expires on {expiryDate}. Please update your records with {locationName}!" };
            await updateAuto({ tiers: [...tiers, newTier] });
          };
          const removeTier = (tierId) => setRemoveTierConfirm(tierId);
          const resetTiers = () => setResetTiersConfirm(true);
          const mergeTags = ["{ownerFirst}", "{ownerLast}", "{dogName}", "{vaccineName}", "{expiryDate}", "{locationName}", "{daysUntil}"];
          const priColors = { low: { bg: "#EFF6FF", text: "#3B82F6", border: "#93C5FD" }, medium: { bg: "#FFF7ED", text: "#F97316", border: "#FDBA74" }, high: { bg: "#FEF2F2", text: "#EF4444", border: "#FCA5A5" }, critical: { bg: "#FEF2F2", text: "#DC2626", border: "#F87171" } };
          // Log stats
          const now = new Date();
          const today = now.toISOString().slice(0, 10);
          const weekAgo = new Date(now - 7 * 86400000).toISOString().slice(0, 10);
          const monthAgo = new Date(now - 30 * 86400000).toISOString().slice(0, 10);
          const sentToday = log.filter(l => l.sentAt && l.sentAt.slice(0, 10) === today).length;
          const sentWeek = log.filter(l => l.sentAt && l.sentAt.slice(0, 10) >= weekAgo).length;
          const sentMonth = log.filter(l => l.sentAt && l.sentAt.slice(0, 10) >= monthAgo).length;
          const deliveredCount = log.filter(l => l.status === "delivered" || l.status === "sent").length;
          const failedCount = log.filter(l => l.status === "failed").length;
          const deliveryRate = log.length > 0 ? Math.round((deliveredCount / log.length) * 100) : 0;
          // Recent log entries (last 50)
          const recentLog = [...log].sort((a, b) => (b.sentAt || "").localeCompare(a.sentAt || "")).slice(0, 50);
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Master Toggle */}
              <Card style={{ padding: "24px 28px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
                  <span style={{ fontSize: 22 }}>🤖</span>
                  <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Vaccine Reminder Automations</div>
                </div>
                <p style={{ fontSize: 13, color: C.textSec, margin: "0 0 24px", lineHeight: 1.5 }}>
                  Automatically send SMS reminders to pet parents when their dog's vaccines are approaching expiration. Configure reminder tiers, customize message templates, and track delivery history.
                </p>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderRadius: 12, background: autoCfg.enabled ? C.sucLt : C.bg, border: `1.5px solid ${autoCfg.enabled ? "#A7F3D0" : C.border}`, marginBottom: 16, transition: "all 0.15s" }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Enable Vaccine Reminders</div>
                    <div style={{ fontSize: 12, color: C.textSec, marginTop: 2 }}>When enabled, the system will scan daily and send reminders based on configured tiers</div>
                  </div>
                  <button onClick={() => updateAuto({ enabled: !autoCfg.enabled })} style={{ width: 48, height: 28, borderRadius: 14, border: "none", background: autoCfg.enabled ? C.suc : C.border, cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
                    <div style={{ width: 22, height: 22, borderRadius: 11, background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.2)", position: "absolute", top: 3, left: autoCfg.enabled ? 23 : 3, transition: "left 0.2s" }} />
                  </button>
                </div>

                {autoCfg.enabled && (
                  <div style={{ padding: "16px 20px", borderRadius: 12, border: `1px solid ${C.border}`, background: C.bg }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Daily Send Cap</div>
                      <input type="number" min="1" max="500" value={autoCfg.dailyCap || 50} onChange={e => updateAuto({ dailyCap: parseInt(e.target.value) || 50 })} style={{ width: 80, padding: "6px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 14, fontFamily: "inherit", background: C.surface, color: C.text, textAlign: "center" }} />
                      <span style={{ fontSize: 12, color: C.textSec }}>max reminders per day (prevents bulk-import floods)</span>
                    </div>
                  </div>
                )}
              </Card>

              {/* Reminder Tiers Table */}
              <Card style={{ padding: "24px 28px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 2 }}>Reminder Tiers</div>
                    <div style={{ fontSize: 12, color: C.textSec }}>Each tier triggers once per vaccine per dog. Negative days = after expiry.</div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={resetTiers} style={{ padding: "6px 14px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: "transparent", color: C.textSec, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Reset Defaults</button>
                    <button onClick={addTier} style={{ padding: "6px 14px", borderRadius: 8, border: `1.5px solid ${C.pri}`, background: C.priLt, color: C.pri, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>+ Add Tier</button>
                  </div>
                </div>

                <div style={{ borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden" }}>
                  {/* Table Header */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 100px 2fr 60px 50px", gap: 0, padding: "10px 16px", background: C.bg, borderBottom: `1px solid ${C.border}`, fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    <div>Tier Name</div>
                    <div>Day Range</div>
                    <div>Priority</div>
                    <div>Message Template</div>
                    <div style={{ textAlign: "center" }}>On</div>
                    <div></div>
                  </div>

                  {/* Tier Rows */}
                  {tiers.map((tier, idx) => {
                    const pc = priColors[tier.priority] || priColors.low;
                    return (
                      <div key={tier.id} style={{ display: "grid", gridTemplateColumns: "1fr 120px 100px 2fr 60px 50px", gap: 0, padding: "12px 16px", borderBottom: idx < tiers.length - 1 ? `1px solid ${C.border}` : "none", background: tier.enabled ? C.surface : `${C.bg}80`, alignItems: "start", opacity: tier.enabled ? 1 : 0.55, transition: "opacity 0.15s" }}>
                        {/* Tier Name */}
                        <div style={{ paddingRight: 8 }}>
                          <input value={tier.name} onChange={e => updateTier(tier.id, { name: e.target.value })} style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 13, fontWeight: 600, fontFamily: "inherit", background: "transparent", color: C.text }} />
                        </div>
                        {/* Day Range */}
                        <div style={{ display: "flex", alignItems: "center", gap: 4, paddingRight: 8 }}>
                          <input type="number" value={tier.dayStart} onChange={e => updateTier(tier.id, { dayStart: parseInt(e.target.value) || 0 })} style={{ width: 42, padding: "6px 4px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: "inherit", background: "transparent", color: C.text, textAlign: "center" }} />
                          <span style={{ fontSize: 12, color: C.textMut }}>to</span>
                          <input type="number" value={tier.dayEnd} onChange={e => updateTier(tier.id, { dayEnd: parseInt(e.target.value) || 0 })} style={{ width: 42, padding: "6px 4px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: "inherit", background: "transparent", color: C.text, textAlign: "center" }} />
                        </div>
                        {/* Priority */}
                        <div style={{ paddingRight: 8 }}>
                          <select value={tier.priority} onChange={e => updateTier(tier.id, { priority: e.target.value })} style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: `1px solid ${pc.border}`, fontSize: 12, fontWeight: 600, fontFamily: "inherit", background: pc.bg, color: pc.text, cursor: "pointer", appearance: "auto" }}>
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                            <option value="critical">Critical</option>
                          </select>
                        </div>
                        {/* Message Template */}
                        <div style={{ paddingRight: 8 }}>
                          <textarea value={tier.template} onChange={e => updateTier(tier.id, { template: e.target.value })} rows={2} style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: "inherit", background: "transparent", color: C.text, resize: "vertical", lineHeight: 1.4 }} />
                        </div>
                        {/* Enabled Toggle */}
                        <div style={{ display: "flex", justifyContent: "center", paddingTop: 4 }}>
                          <button onClick={() => updateTier(tier.id, { enabled: !tier.enabled })} style={{ width: 40, height: 24, borderRadius: 12, border: "none", background: tier.enabled ? C.suc : C.border, cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
                            <div style={{ width: 18, height: 18, borderRadius: 9, background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.2)", position: "absolute", top: 3, left: tier.enabled ? 19 : 3, transition: "left 0.2s" }} />
                          </button>
                        </div>
                        {/* Delete */}
                        <div style={{ display: "flex", justifyContent: "center", paddingTop: 4 }}>
                          <button onClick={() => removeTier(tier.id)} style={{ width: 28, height: 28, borderRadius: 6, border: "none", background: "transparent", color: C.textMut, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }} title="Remove tier">×</button>
                        </div>
                      </div>
                    );
                  })}

                  {tiers.length === 0 && (
                    <div style={{ padding: "32px 16px", textAlign: "center", color: C.textMut, fontSize: 13 }}>No tiers configured. Click "+ Add Tier" or "Reset Defaults" to get started.</div>
                  )}
                </div>

                {/* Merge Tags Reference */}
                <div style={{ marginTop: 16, padding: "12px 16px", borderRadius: 8, background: C.priLt, border: `1px solid ${C.pri}20` }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.pri, marginBottom: 6 }}>Available Merge Tags</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {mergeTags.map(tag => (
                      <span key={tag} style={{ padding: "3px 8px", borderRadius: 4, background: C.surface, border: `1px solid ${C.border}`, fontSize: 11, fontFamily: "monospace", color: C.text, cursor: "default" }}>{tag}</span>
                    ))}
                  </div>
                  <div style={{ fontSize: 11, color: C.textSec, marginTop: 6, lineHeight: 1.4 }}>Use these tags in message templates. They will be replaced with actual values when the reminder is sent. {"{daysUntil}"} shows "in X days" or "X days ago" depending on timing.</div>
                </div>
              </Card>

              {/* Reporting / Stats */}
              <Card style={{ padding: "24px 28px" }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 16 }}>Reminder Reports</div>

                {/* Stats Row */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 20 }}>
                  {[
                    { label: "Sent Today", value: sentToday, color: C.pri },
                    { label: "Sent This Week", value: sentWeek, color: "#8B5CF6" },
                    { label: "Sent This Month", value: sentMonth, color: "#06B6D4" },
                    { label: "Delivery Rate", value: deliveryRate + "%", color: C.suc },
                    { label: "Failed", value: failedCount, color: failedCount > 0 ? C.dan : C.textMut },
                  ].map(stat => (
                    <div key={stat.label} style={{ padding: "16px", borderRadius: 12, border: `1px solid ${C.border}`, background: C.surface, textAlign: "center" }}>
                      <div style={{ fontSize: 24, fontWeight: 800, color: stat.color, marginBottom: 4 }}>{stat.value}</div>
                      <div style={{ fontSize: 11, color: C.textMut, fontWeight: 600 }}>{stat.label}</div>
                    </div>
                  ))}
                </div>

                {/* Manual Scan + Client Filter */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Recent Activity</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={async () => {
                        const pendingReminders = buildVaccineReminders(data);
                        if (pendingReminders.length === 0) {
                          addGlobalToast?.({ type: "info", message: "No reminders to send — all vaccines are up to date, already reminded, or outside tier windows." });
                          return;
                        }
                        // Show confirmation via scanConfirm state
                        setScanPending(pendingReminders);
                      }}
                      style={{ padding: "6px 14px", borderRadius: 8, border: `1.5px solid ${C.pri}`, background: C.priLt, color: C.pri, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                    >
                      ▶ Run Scan Now
                    </button>
                    <button
                      onClick={() => setClearLogConfirm(true)}
                      style={{ padding: "6px 14px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: "transparent", color: C.textMut, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                    >
                      Clear Log
                    </button>
                  </div>
                </div>
                {recentLog.length === 0 ? (
                  <div style={{ padding: "32px 16px", textAlign: "center", color: C.textMut, fontSize: 13, borderRadius: 12, border: `1px dashed ${C.border}`, background: C.bg }}>
                    No reminders sent yet. Once automations are enabled and the daily scan runs, activity will appear here.
                  </div>
                ) : (
                  <div style={{ borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden", maxHeight: 400, overflowY: "auto" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "140px 1fr 1fr 90px 80px", padding: "8px 14px", background: C.bg, borderBottom: `1px solid ${C.border}`, fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.5px", position: "sticky", top: 0 }}>
                      <div>Date</div>
                      <div>Client</div>
                      <div>Details</div>
                      <div>Tier</div>
                      <div>Status</div>
                    </div>
                    {recentLog.map((entry, i) => {
                      const client = (data.clients || []).find(c => c.id === entry.clientId);
                      const statusColor = entry.status === "sent" || entry.status === "delivered" ? C.suc : entry.status === "failed" ? C.dan : C.textMut;
                      return (
                        <div key={entry.id || i} style={{ display: "grid", gridTemplateColumns: "140px 1fr 1fr 90px 80px", padding: "10px 14px", borderBottom: i < recentLog.length - 1 ? `1px solid ${C.border}` : "none", fontSize: 12, color: C.text, alignItems: "center" }}>
                          <div style={{ color: C.textSec, fontSize: 11 }}>{entry.sentAt ? new Date(entry.sentAt).toLocaleString() : "—"}</div>
                          <div style={{ fontWeight: 600 }}>{client ? `${client.firstName || ""} ${client.lastName || ""}`.trim() : entry.clientId?.slice(0, 8)}</div>
                          <div style={{ color: C.textSec }}>{(entry.dogNames || entry.vaccineNames || []).join(", ") || entry.type || "—"}</div>
                          <div><span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: (priColors[entry.tierPriority] || priColors.low).bg, color: (priColors[entry.tierPriority] || priColors.low).text }}>{entry.intervalKey || "—"}</span></div>
                          <div><span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: statusColor + "18", color: statusColor }}>{entry.status || "pending"}</span></div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>

              {/* How It Works */}
              <Card style={{ padding: "24px 28px" }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 12 }}>How It Works</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  {[
                    { icon: "🔍", title: "Daily Scan", desc: "Every day, the system checks all dogs' vaccine expiry dates against your configured tiers." },
                    { icon: "📋", title: "Tier Matching", desc: "If a vaccine falls within a tier's day range, a reminder is queued. Each tier fires once per vaccine per dog." },
                    { icon: "📱", title: "Smart Batching", desc: "Multiple vaccines for the same client are batched into a single message. Opt-outs and missing phone numbers are respected." },
                    { icon: "📊", title: "Tracking & Dedup", desc: "Every reminder is logged. The system checks the log before sending to prevent duplicate messages." },
                    { icon: "⚡", title: "Late Entries", desc: "If a new client record is added with a vaccine expiring soon, the system catches up to the correct tier — it won't replay past tiers." },
                    { icon: "🛡️", title: "Daily Cap", desc: "A per-day send limit prevents floods during bulk imports. Reminders are prioritized by urgency." },
                  ].map(item => (
                    <div key={item.title} style={{ padding: "14px 16px", borderRadius: 10, border: `1px solid ${C.border}`, background: C.bg }}>
                      <div style={{ fontSize: 14, marginBottom: 4 }}>{item.icon} <span style={{ fontWeight: 600, color: C.text }}>{item.title}</span></div>
                      <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.5 }}>{item.desc}</div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* ── Confirmation Overlays ── */}
              {scanPending && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }} onClick={() => setScanPending(null)}>
                  <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, padding: "28px 32px", maxWidth: 420, width: "90%", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 8 }}>Send Vaccine Reminders?</div>
                    <div style={{ fontSize: 13, color: C.textSec, lineHeight: 1.6, marginBottom: 20 }}>
                      Found <strong style={{ color: C.pri }}>{scanPending.length}</strong> reminder{scanPending.length !== 1 ? "s" : ""} to send to {[...new Set(scanPending.map(r => r.clientId))].length} client{[...new Set(scanPending.map(r => r.clientId))].length !== 1 ? "s" : ""}. Each client will receive one batched message covering all their dogs' expiring vaccines.
                    </div>
                    <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                      <button onClick={() => setScanPending(null)} style={{ padding: "8px 18px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: "transparent", color: C.textSec, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                      <button onClick={async () => {
                        const newLog = [...log, ...scanPending.map(r => ({ ...r, sentAt: new Date().toISOString(), status: "sent" }))];
                        await updateAuto({ reminderLog: newLog });
                        addGlobalToast?.({ type: "success", message: `Sent ${scanPending.length} vaccine reminder${scanPending.length !== 1 ? "s" : ""} successfully.` });
                        setScanPending(null);
                      }} style={{ padding: "8px 22px", borderRadius: 8, border: "none", background: C.pri, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                        Send {scanPending.length} Reminder{scanPending.length !== 1 ? "s" : ""}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {clearLogConfirm && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }} onClick={() => setClearLogConfirm(false)}>
                  <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, padding: "28px 32px", maxWidth: 380, width: "90%", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 8 }}>Clear Reminder Log?</div>
                    <div style={{ fontSize: 13, color: C.textSec, lineHeight: 1.6, marginBottom: 20 }}>This will erase all {log.length} log entries. Stats will reset to zero. This cannot be undone.</div>
                    <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                      <button onClick={() => setClearLogConfirm(false)} style={{ padding: "8px 18px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: "transparent", color: C.textSec, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                      <button onClick={async () => {
                        await updateAuto({ reminderLog: [] });
                        addGlobalToast?.({ type: "success", message: "Reminder log cleared." });
                        setClearLogConfirm(false);
                      }} style={{ padding: "8px 22px", borderRadius: 8, border: "none", background: C.dan, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                        Clear Log
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {removeTierConfirm && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }} onClick={() => setRemoveTierConfirm(null)}>
                  <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, padding: "28px 32px", maxWidth: 380, width: "90%", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 8 }}>Remove Tier?</div>
                    <div style={{ fontSize: 13, color: C.textSec, lineHeight: 1.6, marginBottom: 20 }}>This reminder tier will be permanently deleted. This cannot be undone.</div>
                    <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                      <button onClick={() => setRemoveTierConfirm(null)} style={{ padding: "8px 18px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: "transparent", color: C.textSec, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                      <button onClick={async () => {
                        await updateAuto({ tiers: tiers.filter(t => t.id !== removeTierConfirm) });
                        addGlobalToast?.({ type: "success", message: "Tier removed." });
                        setRemoveTierConfirm(null);
                      }} style={{ padding: "8px 22px", borderRadius: 8, border: "none", background: C.dan, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {resetTiersConfirm && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }} onClick={() => setResetTiersConfirm(false)}>
                  <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, padding: "28px 32px", maxWidth: 380, width: "90%", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 8 }}>Reset All Tiers?</div>
                    <div style={{ fontSize: 13, color: C.textSec, lineHeight: 1.6, marginBottom: 20 }}>All custom tiers will be replaced with the default configuration. This cannot be undone.</div>
                    <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                      <button onClick={() => setResetTiersConfirm(false)} style={{ padding: "8px 18px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: "transparent", color: C.textSec, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                      <button onClick={async () => {
                        await updateAuto({ tiers: DEF_TIERS });
                        addGlobalToast?.({ type: "success", message: "Tiers reset to defaults." });
                        setResetTiersConfirm(false);
                      }} style={{ padding: "8px 22px", borderRadius: 8, border: "none", background: C.dan, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                        Reset Tiers
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })() : tab === "session-security" ? (() => {
          const sessCfg = data.sessionTimeout || { enabled: false, hours: 8 };
          const updateSess = async (updates) => await save({ ...data, sessionTimeout: { ...sessCfg, ...updates } });
          return (
            <Card style={{padding:"24px 28px"}}>
              <div style={{fontSize:16,fontWeight:700,color:C.text,marginBottom:4}}>Session Security</div>
              <p style={{fontSize:13,color:C.textSec,margin:"0 0 24px",lineHeight:1.5}}>Configure automatic sign-out to prevent stale sessions. When enabled, any account signed in longer than the configured time will be automatically signed out. This ensures a closing CSR is not accidentally using the opening CSR's account.</p>

              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 20px",borderRadius:12,background:sessCfg.enabled ? C.sucLt : C.bg,border:`1.5px solid ${sessCfg.enabled ? "#A7F3D0" : C.border}`,marginBottom:16,transition:"all 0.15s"}}>
                <div>
                  <div style={{fontSize:14,fontWeight:600,color:C.text}}>Auto Sign-Out Timer</div>
                  <div style={{fontSize:12,color:C.textSec,marginTop:2}}>Automatically sign out accounts after a set period</div>
                </div>
                <button onClick={() => updateSess({ enabled: !sessCfg.enabled })} style={{width:48,height:28,borderRadius:14,border:"none",background:sessCfg.enabled ? C.suc : C.border,cursor:"pointer",position:"relative",transition:"background 0.2s",flexShrink:0}}>
                  <div style={{width:22,height:22,borderRadius:11,background:"#fff",boxShadow:"0 1px 3px rgba(0,0,0,0.2)",position:"absolute",top:3,left:sessCfg.enabled ? 23 : 3,transition:"left 0.2s"}} />
                </button>
              </div>

              {sessCfg.enabled && (
                <div style={{padding:"20px",borderRadius:12,border:`1px solid ${C.border}`,background:C.bg}}>
                  <div style={{fontSize:13,fontWeight:600,color:C.text,marginBottom:12}}>Maximum Session Duration</div>
                  <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
                    <input type="number" min="0.5" max="24" step="0.5" value={sessCfg.hours || 8} onChange={e => updateSess({ hours: parseFloat(e.target.value) || 1 })} style={{width:80,padding:"8px 12px",borderRadius:8,border:`1px solid ${C.border}`,fontSize:14,fontFamily:"inherit",background:C.surface,color:C.text,textAlign:"center"}} />
                    <span style={{fontSize:13,color:C.textSec}}>hours</span>
                  </div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                    {[1, 2, 4, 6, 8, 10, 12].map(h => (
                      <button key={h} onClick={() => updateSess({ hours: h })} style={{padding:"6px 14px",borderRadius:8,border:`1.5px solid ${sessCfg.hours === h ? C.pri : C.border}`,background:sessCfg.hours === h ? C.priLt : "transparent",color:sessCfg.hours === h ? C.pri : C.textSec,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{h}h</button>
                    ))}
                  </div>
                  <div style={{marginTop:16,padding:"12px 16px",borderRadius:8,background:C.priLt,border:`1px solid ${C.pri}20`}}>
                    <div style={{fontSize:12,color:C.pri,fontWeight:600}}>How it works</div>
                    <div style={{fontSize:11,color:C.textSec,marginTop:4,lineHeight:1.5}}>When enabled, a background timer checks every 30 seconds. If the current account has been signed in for longer than {sessCfg.hours || 8} hour{(sessCfg.hours || 8) > 1 ? "s" : ""}, it will be automatically signed out with an alert. The timer resets when switching accounts.</div>
                  </div>
                </div>
              )}
            </Card>
          );
        })() : tab === "hotkeys" ? (() => {
          const hk = data.hotkeySettings || { enabled: false, showHints: false };
          const bindings = { ...DEF_HOTKEY_BINDINGS, ...(hk.bindings || {}) };
          const toggle = async (key) => await save({ ...data, hotkeySettings: { ...hk, [key]: !hk[key] } });
          const rebind = async (action, newKey) => {
            const nb = { ...bindings, [action]: newKey.toLowerCase() };
            await save({ ...data, hotkeySettings: { ...hk, bindings: nb } });
          };
          const resetBindings = async () => await save({ ...data, hotkeySettings: { ...hk, bindings: { ...DEF_HOTKEY_BINDINGS } } });
          // Detect duplicates
          const keyUsage = {};
          Object.entries(bindings).forEach(([action, key]) => { if (!keyUsage[key]) keyUsage[key] = []; keyUsage[key].push(action); });
          const dupes = Object.entries(keyUsage).filter(([,actions]) => actions.length > 1);
          return (
            <Card style={{ padding: "24px 28px" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 4 }}>Keyboard Shortcuts</div>
              <p style={{ fontSize: 13, color: C.textSec, margin: "0 0 24px" }}>Control how keyboard shortcuts behave throughout the app. Click any key to rebind it.</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {[
                  { key: "enabled", label: "Enable Hotkeys", desc: "Use single-key shortcuts to navigate (D for Dashboard, L for Lodging Calendar, N for New, etc.)" },
                  { key: "showHints", label: "Show Hotkey Hints", desc: "Display shortcut badges on sidebar items, buttons, and the search bar" },
                ].map(opt => (
                  <div key={opt.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderRadius: 12, background: hk[opt.key] ? C.sucLt : C.bg, border: `1.5px solid ${hk[opt.key] ? "#A7F3D0" : C.border}`, transition: "all 0.15s" }}>
                    <div style={{ flex: 1, marginRight: 16 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{opt.label}</div>
                      <div style={{ fontSize: 12, color: C.textSec, marginTop: 2, lineHeight: 1.4 }}>{opt.desc}</div>
                    </div>
                    <button onClick={() => toggle(opt.key)} style={{ width: 48, height: 28, borderRadius: 14, border: "none", background: hk[opt.key] ? C.suc : C.border, cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
                      <div style={{ width: 22, height: 22, borderRadius: 11, background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.2)", position: "absolute", top: 3, left: hk[opt.key] ? 23 : 3, transition: "left 0.2s" }} />
                    </button>
                  </div>
                ))}
              </div>
              {dupes.length > 0 && (
                <div style={{ marginTop: 16, padding: "10px 14px", borderRadius: 8, background: C.danLt, border: `1.5px solid ${C.dan}40` }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.dan }}>Duplicate bindings detected:</div>
                  {dupes.map(([key, actions]) => (
                    <div key={key} style={{ fontSize: 11, color: C.dan, marginTop: 2 }}>Key "{key.toUpperCase()}" is bound to: {actions.map(a => HOTKEY_LABELS[a] || a).join(", ")}</div>
                  ))}
                </div>
              )}
              <div style={{ marginTop: 20 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.textSec, textTransform: "uppercase", letterSpacing: "0.04em" }}>Shortcut Bindings</div>
                  <button onClick={resetBindings} style={{ fontSize: 11, fontWeight: 600, color: C.pri, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>Reset to Defaults</button>
                </div>
                <div style={{ fontSize: 11, color: C.textMut, marginBottom: 12 }}>Click a key badge to change its binding. Press the new key, then press Enter to confirm or Escape to cancel.</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  {Object.entries(HOTKEY_LABELS).map(([action, label]) => {
                    const currentKey = bindings[action] || DEF_HOTKEY_BINDINGS[action];
                    const isDefault = currentKey === DEF_HOTKEY_BINDINGS[action];
                    const isDupe = keyUsage[currentKey] && keyUsage[currentKey].length > 1;
                    return (
                      <div key={action} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, background: isDupe ? C.danLt : C.bg, border: `1px solid ${isDupe ? C.dan + "40" : C.border}` }}>
                        <input
                          style={{ width: 32, textAlign: "center", padding: "3px 0", borderRadius: 5, border: `1.5px solid ${isDupe ? C.dan : C.border}`, background: C.surface, fontSize: 12, fontWeight: 700, color: C.text, fontFamily: "'Outfit', monospace", cursor: "pointer" }}
                          value={currentKey === "/" ? "/" : currentKey.toUpperCase()}
                          onFocus={e => { e.target.value = ""; e.target.style.borderColor = C.pri; }}
                          onBlur={e => { e.target.value = currentKey === "/" ? "/" : currentKey.toUpperCase(); e.target.style.borderColor = isDupe ? C.dan : C.border; }}
                          onKeyDown={e => {
                            e.preventDefault();
                            if (e.key === "Escape") { e.target.blur(); return; }
                            if (e.key === "Enter") { e.target.blur(); return; }
                            const nk = e.key.length === 1 ? e.key.toLowerCase() : e.key === "/" ? "/" : null;
                            if (nk) { rebind(action, nk); e.target.value = nk.toUpperCase(); e.target.blur(); }
                          }}
                          readOnly={false}
                        />
                        <div style={{ flex: 1, fontSize: 12, color: C.textSec }}>{label}</div>
                        {!isDefault && <span style={{ fontSize: 9, color: C.acc, fontWeight: 700 }}>custom</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>
          );
        })() : tab === "reset" ? (<>
          <Card style={{ padding: "20px 24px" }}>
            <h3 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 700, color: C.text }}>Demo Data</h3>
            <p style={{ margin: "0 0 14px", fontSize: 13, color: C.textSec }}>Reset all data back to the demo dataset.</p>
            {resetConfirm ? (<div style={{ display: "flex", gap: 10, alignItems: "center" }}><span style={{ fontSize: 13, color: C.dan, fontWeight: 600 }}>Are you sure?</span><Btn size="sm" variant="danger" onClick={handleReset}>Yes, Reset</Btn><Btn size="sm" variant="ghost" onClick={() => setResetConfirm(false)}>Cancel</Btn></div>) : (<Btn variant="secondary" size="sm" onClick={() => setResetConfirm(true)}>Reset to Demo Data</Btn>)}
          </Card>
          <Card style={{ padding: "20px 24px", marginTop: 16 }}>
            <h3 style={{ margin: "0 0 8px", fontSize: 15, fontWeight: 700, color: C.dan }}>Erase All Data</h3>
            <p style={{ margin: "0 0 14px", fontSize: 13, color: C.textSec }}>Permanently delete all clients, dogs, reservations, and operational data from the database for this location. Settings and configuration are preserved.</p>
            {eraseConfirm ? (<div style={{ display: "flex", gap: 10, alignItems: "center" }}><span style={{ fontSize: 13, color: C.dan, fontWeight: 600 }}>{erasing ? "Erasing..." : "This cannot be undone!"}</span>{!erasing && <Btn size="sm" variant="danger" onClick={handleEraseAll}>Yes, Erase Everything</Btn>}{!erasing && <Btn size="sm" variant="ghost" onClick={() => setEraseConfirm(false)}>Cancel</Btn>}</div>) : (<Btn variant="danger" size="sm" onClick={() => setEraseConfirm(true)}>Erase All Data</Btn>)}
          </Card>
        </>) : tab === "agreements" ? (
          <AgreementsPage data={data} save={save} />
        ) : tab === "questionnaire" ? (
          <QuestionnaireSettingsTab data={data} save={save} />
        ) : tab === "vets" ? (
          <VetDirectoryTab data={data} save={save} addGlobalToast={addGlobalToast} />
        ) : tab === "pricing" ? (
        <PricingTab data={data} save={save} />

      ) : tab === "packages" ? (
        <PackagesSection data={data} save={save} nav={nav} profile={profile} />

      ) : tab === "discounts" ? (
        <DiscountsSection data={data} save={save} />

      ) : tab === "message-templates" ? (
        <MessageTemplatesTab data={data} save={save} />

      ) : tab === "unpaid-deposits" ? (
        <div style={{ padding: 24 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 4 }}>Unpaid Deposits Report</div>
          <div style={{ fontSize: 12, color: C.textSec, marginBottom: 16 }}>This report has moved to the Reports page.</div>
          <Btn variant="primary" onClick={() => nav("reports")}>Go to Reports</Btn>
        </div>

      ) : tab === "eod" ? (
        <EODTemplateTab data={data} save={save} />

      ) : tab === "daily-ops" ? (
        <DailyOpsTemplateTab data={data} save={save} />

      ) : tab === "run-card" ? (
        <RunCardConfigTab data={data} save={save} />

      ) : tab === "dropdowns" ? (
        <DropdownListsTab data={data} save={save} />

      ) : tab === "resort-info" ? (() => {
        const ri = data.resortInfo || {};
        const updateRI = async (key, val) => await save({ ...data, resortInfo: { ...ri, [key]: val } });
        const TZ_MAP = {"AL":"America/Chicago","AK":"America/Anchorage","AZ":"America/Phoenix","AR":"America/Chicago","CA":"America/Los_Angeles","CO":"America/Denver","CT":"America/New_York","DE":"America/New_York","FL":"America/New_York","GA":"America/New_York","HI":"Pacific/Honolulu","ID":"America/Boise","IL":"America/Chicago","IN":"America/Indiana/Indianapolis","IA":"America/Chicago","KS":"America/Chicago","KY":"America/New_York","LA":"America/Chicago","ME":"America/New_York","MD":"America/New_York","MA":"America/New_York","MI":"America/Detroit","MN":"America/Chicago","MS":"America/Chicago","MO":"America/Chicago","MT":"America/Denver","NE":"America/Chicago","NV":"America/Los_Angeles","NH":"America/New_York","NJ":"America/New_York","NM":"America/Denver","NY":"America/New_York","NC":"America/New_York","ND":"America/Chicago","OH":"America/New_York","OK":"America/Chicago","OR":"America/Los_Angeles","PA":"America/New_York","RI":"America/New_York","SC":"America/New_York","SD":"America/Chicago","TN":"America/Chicago","TX":"America/Chicago","UT":"America/Denver","VT":"America/New_York","VA":"America/New_York","WA":"America/Los_Angeles","WV":"America/New_York","WI":"America/Chicago","WY":"America/Denver","DC":"America/New_York"};
        const detectTz = (addr) => {
          const stMatch = (addr || "").match(/\b([A-Z]{2})\b(?:\s+\d{5})?/);
          if (stMatch && TZ_MAP[stMatch[1]]) return TZ_MAP[stMatch[1]];
          return null;
        };
        const detectedTz = ri.timezone || detectTz(ri.address);
        const currentTime = detectedTz ? new Date().toLocaleTimeString("en-US", { timeZone: detectedTz, hour: "numeric", minute: "2-digit", hour12: true }) : null;
        const tzLabel = detectedTz ? detectedTz.replace(/_/g, " ").replace("America/", "") : null;
        return (
          <Card style={{ padding: "24px 28px" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 4 }}>Resort Information</div>
            <p style={{ fontSize: 13, color: C.textSec, margin: "0 0 20px" }}>Set your resort's address to automatically configure the correct timezone for the software.</p>
            <Inp label="Resort Address" value={ri.address || ""} onChange={v => {
              const tz = detectTz(v);
              const updates = { address: v };
              if (tz) updates.timezone = tz;
              save({ ...data, resortInfo: { ...ri, ...updates } });
            }} placeholder="123 Main St, City, ST 12345" />
            {detectedTz && (
              <div style={{marginTop:12,padding:"12px 16px",borderRadius:10,background:C.sucLt,border:`1.5px solid ${C.suc}30`,display:"flex",alignItems:"center",gap:10}}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.suc} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                <div>
                  <div style={{fontSize:13,fontWeight:700,color:C.suc}}>Timezone detected: {tzLabel}</div>
                  <div style={{fontSize:12,color:C.textSec}}>Current time: {currentTime}</div>
                </div>
              </div>
            )}
            {ri.address && !detectedTz && (
              <div style={{marginTop:12,padding:"12px 16px",borderRadius:10,background:C.accLt,border:`1.5px solid ${C.acc}30`}}>
                <div style={{fontSize:12,color:C.acc,fontWeight:600}}>Could not detect timezone. Please include a valid US state abbreviation in the address (e.g. "NJ", "FL").</div>
              </div>
            )}
            <div style={{marginTop:16}}>
              <Inp label="Override Timezone (optional)" type="select" value={ri.timezone || ""} onChange={v => updateRI("timezone", v)} options={["", ...Object.values(TZ_MAP).filter((v,i,a)=>a.indexOf(v)===i).sort()]} />
              <div style={{fontSize:11,color:C.textMut,marginTop:4}}>Leave blank to auto-detect from address. Override only if needed.</div>
            </div>
          </Card>
        );
      })()

      : tab === "facility" ? (
        <div>
          <Card style={{ padding: "24px 28px" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 4 }}>Daycare Square Footage</div>
            <p style={{ fontSize: 13, color: C.textSec, margin: "0 0 20px" }}>Enter the interior square footage for each daycare area. Capacity is automatically calculated based on industry-standard spacing (large dogs: 18 SF per dog, small dogs: 12 SF per dog).</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <div>
                <div style={{ marginBottom: 16 }}>
                  <Inp label="Large Dog Daycare Interior SF" type="number" value={fs.largeDogDaycareSF || ""} onChange={v => updateFS("largeDogDaycareSF", v)} placeholder="e.g. 3600" />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderRadius: 10, background: C.priLt, border: `1.5px solid ${C.pri}20` }}>
                  <I.Users />
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: C.textSec, textTransform: "uppercase", letterSpacing: "0.04em" }}>Large Dog Capacity</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: C.pri }}>{lgCap} <span style={{ fontSize: 13, fontWeight: 600, color: C.textSec }}>dogs</span></div>
                  </div>
                </div>
              </div>
              <div>
                <div style={{ marginBottom: 16 }}>
                  <Inp label="Small Dog Daycare Interior SF" type="number" value={fs.smallDogDaycareSF || ""} onChange={v => updateFS("smallDogDaycareSF", v)} placeholder="e.g. 2400" />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderRadius: 10, background: C.sucLt, border: `1.5px solid ${C.suc}20` }}>
                  <I.Users />
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: C.textSec, textTransform: "uppercase", letterSpacing: "0.04em" }}>Small Dog Capacity</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: C.suc }}>{smCap} <span style={{ fontSize: 13, fontWeight: 600, color: C.textSec }}>dogs</span></div>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>

      ) : tab === "rooms" ? (
        <div>
          <Card style={{ padding: "24px 28px" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 4 }}>Room Management</div>
            <p style={{ fontSize: 13, color: C.textSec, margin: "0 0 20px" }}>Define specific rooms for each room type. Paste a comma-separated list to add in bulk, or manage rooms individually. These rooms will be available for selection when booking boarding reservations.</p>
            {ROOM_TYPES.map(rt => {
              const rList = rooms[rt] || [];
              return (
                <div key={rt} style={{ marginBottom: 24, padding: "16px 20px", borderRadius: 12, border: `1.5px solid ${C.border}`, background: C.bg }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{rt}</div>
                      <div style={{ fontSize: 12, color: C.textSec }}>{rList.length} room{rList.length !== 1 ? "s" : ""} configured</div>
                    </div>
                  </div>
                  {rList.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
                      {rList.map(r => (
                        <span key={r} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 8, background: C.surface, border: `1px solid ${C.border}`, fontSize: 13, fontWeight: 600, color: C.text }}>
                          {r}
                          <button onClick={() => removeRoom(rt, r)} style={{ background: "none", border: "none", cursor: "pointer", color: C.textMut, padding: 0, display: "inline-flex", marginLeft: 2 }} title="Remove room"><I.X /></button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                    <div style={{ flex: 1 }}>
                      <Inp label="Add rooms (comma-separated)" value={roomBulk[rt] || ""} onChange={v => setRoomBulk({ ...roomBulk, [rt]: v })} placeholder="e.g. 101, 102, 103" />
                    </div>
                    <Btn size="sm" onClick={() => addRoomsBulk(rt)}>Add</Btn>
                  </div>
                </div>
              );
            })}
          </Card>
        </div>

      ) : tab === "closed-dates" ? (() => {
        const closedDates = data.closedDates || [];
        const addClosed = async () => {
          if (!newClosedDate) return;
          const already = closedDates.some(cd => cd.date === newClosedDate);
          if (already) return;
          const updated = [...closedDates, { date: newClosedDate, label: newClosedLabel.trim() || "Closed" }].sort((a,b) => a.date.localeCompare(b.date));
          await save({ ...data, closedDates: updated });
          setNewClosedDate(""); setNewClosedLabel("");
        };
        const removeClosed = async (date) => {
          await save({ ...data, closedDates: closedDates.filter(cd => cd.date !== date) });
        };
        const addDefaultHolidays = async (year) => {
          const holidays = [
            { date: `${year}-01-01`, label: "New Year's Day" },
            { date: `${year}-04-20`, label: "Easter Sunday" },
            { date: `${year}-05-25`, label: "Memorial Day" },
            { date: `${year}-07-04`, label: "Independence Day" },
            { date: `${year}-09-07`, label: "Labor Day" },
            { date: `${year}-11-27`, label: "Thanksgiving Day" },
            { date: `${year}-12-25`, label: "Christmas Day" },
            { date: `${year}-12-31`, label: "New Year's Eve" },
          ];
          const existing = new Set(closedDates.map(cd => cd.date));
          const merged = [...closedDates, ...holidays.filter(h => !existing.has(h.date))].sort((a,b) => a.date.localeCompare(b.date));
          await save({ ...data, closedDates: merged });
        };
        const thisYear = new Date().getFullYear();
        const nextYear = thisYear + 1;
        return (
          <div>
            <Card style={{ padding: "24px 28px", marginBottom: 16 }}>
              <div style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: C.text, margin: 0 }}>Dates Closed to the Public</h3>
                <div style={{ fontSize: 12, color: C.textSec, marginTop: 4 }}>No check-ins or check-outs will be allowed on these dates for any reservation type. Existing stays that span a closed date are unaffected.</div>
              </div>
              {/* Quick-add default holidays */}
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <button onClick={() => addDefaultHolidays(thisYear)} style={{ padding: "8px 14px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.surface, color: C.textSec, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>+ Add {thisYear} Holidays</button>
                <button onClick={() => addDefaultHolidays(nextYear)} style={{ padding: "8px 14px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.surface, color: C.textSec, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>+ Add {nextYear} Holidays</button>
              </div>
              {/* Add custom date */}
              <div style={{ display: "flex", gap: 8, marginBottom: 20, alignItems: "flex-end" }}>
                <div style={{ flex: "0 0 160px" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.textSec, marginBottom: 4 }}>Date</div>
                  <MiniDatePicker value={newClosedDate} onChange={v=>setNewClosedDate(v)}/>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.textSec, marginBottom: 4 }}>Label (optional)</div>
                  <input type="text" value={newClosedLabel} onChange={e => setNewClosedLabel(e.target.value)} placeholder="e.g. Christmas Day" style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.surface, fontSize: 13, fontWeight: 600, color: C.text, fontFamily: "inherit" }} />
                </div>
                <Btn onClick={addClosed} disabled={!newClosedDate}>Add</Btn>
              </div>
              {/* List of closed dates */}
              {closedDates.length === 0 ? (
                <div style={{ padding: 20, textAlign: "center", color: C.textMut, fontSize: 13 }}>No closed dates configured. Use the buttons above to add major holidays or custom dates.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {closedDates.map(cd => {
                    const d = new Date(cd.date + "T12:00:00");
                    const isPast = cd.date < todayStr();
                    return (
                      <div key={cd.date} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderRadius: 8, background: isPast ? C.bg : C.surface, border: `1px solid ${isPast ? C.borderLight : C.border}`, opacity: isPast ? 0.5 : 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: C.text, minWidth: 100 }}>{d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: C.textSec }}>{cd.label}</span>
                          <span style={{ fontSize: 11, color: C.textMut }}>{d.toLocaleDateString("en-US", { weekday: "long" })}</span>
                        </div>
                        <button onClick={() => removeClosed(cd.date)} style={{ border: "none", background: "none", cursor: "pointer", color: C.textMut, padding: 4, display: "flex" }} title="Remove"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
        );
      })() : tab === "policies" ? (() => {
        const pol = data.resortPolicies || {};
        const updatePol = async (key, val) => await save({ ...data, resortPolicies: { ...pol, [key]: val } });
        const graceDays = pol.vaccineGraceDays ?? 7;
        const warningDays = pol.vaccineWarningDays ?? 30;
        const maxAge = pol.maxDogAge ?? 13;
        const ageEnabled = pol.ageCheckEnabled !== false;
        const grandfatherVisits = pol.grandfatherVisitThreshold ?? 10;
        const grandfatherEnabled = pol.grandfatherEnabled !== false;
        return (
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            {/* Vaccine Grace Period */}
            <Card style={{ padding: "24px 28px" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 4 }}>Vaccine Compliance</div>
              <p style={{ fontSize: 13, color: C.textSec, margin: "0 0 20px" }}>Configure how expired and expiring vaccines are handled. Dogs within the grace period show an amber warning instead of red.</p>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
                <div>
                  <Inp label="Grace Period (days)" type="number" value={graceDays} onChange={v => updatePol("vaccineGraceDays", parseInt(v) || 0)} />
                  <div style={{fontSize:11,color:C.textMut,marginTop:4}}>Dogs with vaccines expired within this many days show an amber warning instead of being blocked. Set to 0 to disable.</div>
                </div>
                <div>
                  <Inp label="Expiring Soon Warning (days)" type="number" value={warningDays} onChange={v => updatePol("vaccineWarningDays", parseInt(v) || 30)} />
                  <div style={{fontSize:11,color:C.textMut,marginTop:4}}>Show a yellow warning badge when vaccines expire within this many days.</div>
                </div>
              </div>
              <div style={{marginTop:16,padding:"12px 16px",borderRadius:10,background:C.bg,border:`1px solid ${C.border}`}}>
                <div style={{fontSize:12,fontWeight:700,color:C.textSec,marginBottom:8}}>Legend</div>
                <div style={{display:"flex",gap:16,flexWrap:"wrap",fontSize:12}}>
                  <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:10,height:10,borderRadius:5,background:C.suc}}/> Current</span>
                  <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:10,height:10,borderRadius:5,background:C.warn}}/> Expiring Soon ({warningDays} days)</span>
                  <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:10,height:10,borderRadius:5,background:C.acc}}/> Grace Period ({graceDays} days past)</span>
                  <span style={{display:"flex",alignItems:"center",gap:4}}><span style={{width:10,height:10,borderRadius:5,background:C.dan}}/> Expired (past grace)</span>
                </div>
              </div>
            </Card>

            {/* Dog Age Policy */}
            <Card style={{ padding: "24px 28px" }}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Senior Dog Age Policy</div>
                <button onClick={()=>updatePol("ageCheckEnabled", !ageEnabled)} style={{padding:"6px 16px",borderRadius:8,border:`1.5px solid ${ageEnabled?C.suc:C.border}`,background:ageEnabled?C.suc:C.surface,color:ageEnabled?"#fff":C.textSec,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{ageEnabled?"Enabled":"Disabled"}</button>
              </div>
              <p style={{ fontSize: 13, color: C.textSec, margin: "0 0 20px" }}>Dogs above a certain age cannot be serviced unless they meet the grandfathering criteria.</p>
              {ageEnabled && (
                <div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginBottom:20}}>
                    <div>
                      <Inp label="Maximum Age (years)" type="number" value={maxAge} onChange={v => updatePol("maxDogAge", parseInt(v) || 13)} />
                      <div style={{fontSize:11,color:C.textMut,marginTop:4}}>Dogs older than this age will be flagged unless grandfathered.</div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",padding:"12px 16px",borderRadius:10,background:C.accLt,border:`1px solid ${C.acc}30`}}>
                      <div style={{fontSize:13,color:C.text}}>Dogs over <strong>{maxAge} years old</strong> will show a compliance warning.</div>
                    </div>
                  </div>

                  {/* Grandfathering */}
                  <div style={{padding:"16px 20px",borderRadius:12,border:`1.5px solid ${C.border}`,background:C.bg}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                      <div style={{fontSize:14,fontWeight:700,color:C.text}}>Grandfathering Exception</div>
                      <button onClick={()=>updatePol("grandfatherEnabled", !grandfatherEnabled)} style={{padding:"5px 14px",borderRadius:8,border:`1.5px solid ${grandfatherEnabled?C.suc:C.border}`,background:grandfatherEnabled?C.sucLt:C.surface,color:grandfatherEnabled?C.suc:C.textSec,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{grandfatherEnabled?"Active":"Inactive"}</button>
                    </div>
                    <p style={{fontSize:12,color:C.textSec,margin:"0 0 12px"}}>Existing clients whose dog has visited your resort enough times before reaching the age limit may continue receiving service.</p>
                    {grandfatherEnabled && (
                      <div style={{maxWidth:300}}>
                        <Inp label="Minimum Past Visits" type="number" value={grandfatherVisits} onChange={v => updatePol("grandfatherVisitThreshold", parseInt(v) || 1)} />
                        <div style={{fontSize:11,color:C.textMut,marginTop:4}}>Dogs with at least this many past completed visits are grandfathered in.</div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Card>

            {/* Private Play Zones */}
            <Card style={{ padding: "24px 28px" }}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Private Play Zones</div>
                <button onClick={()=>updatePol("privatePlayEnabled", !(pol.privatePlayEnabled !== false))} style={{padding:"6px 16px",borderRadius:8,border:`1.5px solid ${pol.privatePlayEnabled !== false?C.suc:C.border}`,background:pol.privatePlayEnabled !== false?C.suc:C.surface,color:pol.privatePlayEnabled !== false?"#fff":C.textSec,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{pol.privatePlayEnabled !== false?"Enabled":"Disabled"}</button>
              </div>
              <p style={{ fontSize: 13, color: C.textSec, margin: "0 0 20px" }}>Designate specific rooms or wings for dogs tagged as "Private Play." When enabled, the room recommendation algorithm will prefer these rooms for private play dogs.</p>
              {pol.privatePlayEnabled !== false && (() => {
                const ppRooms = pol.privatePlayRooms || [];
                const allRoomsMap = data.rooms || {};
                const roomTypes = Object.keys(allRoomsMap);
                const toggleRoom = (room) => {
                  const next = ppRooms.includes(room) ? ppRooms.filter(r => r !== room) : [...ppRooms, room];
                  updatePol("privatePlayRooms", next);
                };
                const toggleWing = (rooms) => {
                  const allSelected = rooms.every(r => ppRooms.includes(r));
                  const next = allSelected ? ppRooms.filter(r => !rooms.includes(r)) : [...new Set([...ppRooms, ...rooms])];
                  updatePol("privatePlayRooms", next);
                };
                return (
                  <div style={{display:"flex",flexDirection:"column",gap:16}}>
                    {roomTypes.map(rt => {
                      const rooms = allRoomsMap[rt] || [];
                      if (rooms.length === 0) return null;
                      const allSelected = rooms.every(r => ppRooms.includes(r));
                      const someSelected = rooms.some(r => ppRooms.includes(r));
                      return (
                        <div key={rt} style={{padding:"14px 18px",borderRadius:10,border:`1.5px solid ${C.border}`,background:C.bg}}>
                          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                            <div style={{fontSize:14,fontWeight:700,color:C.text}}>{rt}</div>
                            <button onClick={()=>toggleWing(rooms)} style={{padding:"4px 14px",borderRadius:6,border:`1.5px solid ${allSelected?C.pri:someSelected?C.acc:C.border}`,background:allSelected?C.priLt:someSelected?C.accLt:"transparent",color:allSelected?C.pri:someSelected?C.acc:C.textSec,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
                              {allSelected?"Deselect All":"Select All"}
                            </button>
                          </div>
                          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                            {rooms.map(room => {
                              const sel = ppRooms.includes(room);
                              return (
                                <button key={room} onClick={()=>toggleRoom(room)} style={{padding:"6px 14px",borderRadius:8,border:`1.5px solid ${sel?C.pri:C.border}`,background:sel?C.priLt:C.surface,color:sel?C.pri:C.textSec,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s"}}>
                                  {room}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                    {ppRooms.length > 0 && (
                      <div style={{padding:"10px 16px",borderRadius:8,background:C.accLt,border:`1px solid ${C.acc}30`}}>
                        <div style={{fontSize:12,color:C.text}}><strong>{ppRooms.length}</strong> room{ppRooms.length !== 1 ? "s" : ""} designated as private play zone{ppRooms.length !== 1 ? "s" : ""}. Dogs tagged "Private Play" will be preferentially assigned to these rooms.</div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </Card>

            {/* Customer Lifecycle Retention Thresholds */}
            <Card style={{ padding: "24px 28px" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 4 }}>Customer Lifecycle — Retention Thresholds</div>
              <p style={{ fontSize: 13, color: C.textSec, margin: "0 0 20px" }}>Configure how many days of inactivity trigger a client moving from Active to Retention. Separate thresholds for primarily-daycare vs primarily-boarding clients.</p>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
                <div>
                  <Inp label="Daycare Retention (days)" type="number" value={pol.retentionDaycareDays ?? 90} onChange={v => updatePol("retentionDaycareDays", parseInt(v) || 90)} />
                  <div style={{fontSize:11,color:C.textMut,marginTop:4}}>Clients whose reservations are primarily daycare will move to Retention after this many days of inactivity.</div>
                </div>
                <div>
                  <Inp label="Boarding Retention (days)" type="number" value={pol.retentionBoardingDays ?? 180} onChange={v => updatePol("retentionBoardingDays", parseInt(v) || 180)} />
                  <div style={{fontSize:11,color:C.textMut,marginTop:4}}>Clients whose reservations are primarily boarding will move to Retention after this many days of inactivity.</div>
                </div>
              </div>
            </Card>
          </div>
        );
      })() : tab === "vaccines" ? (
        <div>
          <Card style={{ padding: "20px 24px" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>Required Vaccines</div>
            <p style={{ fontSize: 13, color: C.textSec, margin: "0 0 16px" }}>Select which vaccines are required for all dogs at your resort. Dogs missing required vaccines or with expired records will show a red syringe icon.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {VACCINES.map(vax => {
                const isRequired = (data.requiredVaccines || DEF_REQUIRED_VACCINES).includes(vax.id);
                const isAlwaysRequired = vax.requiredByDefault;
                return (
                  <div key={vax.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderRadius: 10, background: isRequired ? C.sucLt : C.bg, border: `1.5px solid ${isRequired ? "#A7F3D0" : C.border}`, transition: "all 0.15s" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ color: isRequired ? C.suc : C.textMut, display: "inline-flex" }}><I.VaxOk /></span>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{vax.name}</div>
                        {isAlwaysRequired && <div style={{ fontSize: 11, color: C.textMut }}>Core vaccine — always recommended</div>}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {isAlwaysRequired && <Badge color="primary" size="sm">Required</Badge>}
                      {!isAlwaysRequired && (
                        <button onClick={async () => {
                          const rv = [...(data.requiredVaccines || DEF_REQUIRED_VACCINES)];
                          const newRv = isRequired ? rv.filter(id => id !== vax.id) : [...rv, vax.id];
                          await save({ ...data, requiredVaccines: newRv });
                        }} style={{ padding: "6px 16px", borderRadius: 8, border: `1.5px solid ${isRequired ? C.suc : C.border}`, background: isRequired ? C.suc : C.surface, color: isRequired ? "#fff" : C.textSec, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>
                          {isRequired ? "✓ Required" : "Optional"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      ) : tab === "tags" ? (
        <div>
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 80px 48px", padding: "12px 20px", background: C.bg, borderBottom: `1px solid ${C.border}`, fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              <div>Tag Name</div><div>Color</div><div>Preview</div><div/>
            </div>
            {data.dogTags.map(tag => {
              const tc = TAG_COLORS[tag.colorIdx % TAG_COLORS.length];
              const words = tag.name.split(/\s+/);
              const abbr = words.length > 1 ? words.map(w => w[0]).join("").toUpperCase().slice(0, 2) : tag.name.toUpperCase().slice(0, 4);
              const isEditingColor = editingTagColor === tag.id;
              const isEditingName = editingTagName === tag.id;
              return (
                <div key={tag.id} style={{ display: "grid", gridTemplateColumns: "1fr 100px 80px 48px", padding: "12px 20px", borderBottom: `1px solid ${C.borderLight}`, alignItems: "center" }}>
                  <div>{isEditingName ? (
                    <input value={editingTagNameVal} onChange={e => setEditingTagNameVal(e.target.value)} onBlur={() => { if (editingTagNameVal.trim() && editingTagNameVal.trim() !== tag.name) { const updated = data.dogTags.map(t => t.id === tag.id ? { ...t, name: editingTagNameVal.trim() } : t); save({ ...data, dogTags: updated }); } setEditingTagName(null); }} onKeyDown={e => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") { setEditingTagName(null); } }} autoFocus style={{ fontSize: 14, fontWeight: 600, color: C.text, border: `1.5px solid ${C.pri}`, borderRadius: 6, padding: "4px 8px", width: "100%", fontFamily: "inherit", outline: "none", background: C.surface }} />
                  ) : (
                    <span onClick={() => { setEditingTagName(tag.id); setEditingTagNameVal(tag.name); }} style={{ fontSize: 14, fontWeight: 600, color: C.text, cursor: "pointer", borderBottom: `1px dashed ${C.border}`, paddingBottom: 1 }} title="Click to edit">{tag.name}</span>
                  )}</div>
                  <div style={{ position: "relative" }}>
                    <button onClick={() => setEditingTagColor(isEditingColor ? null : tag.id)} style={{ width: 24, height: 24, borderRadius: 6, background: tc.bg, border: `2px solid ${tc.text}`, cursor: "pointer", display: "inline-block", padding: 0 }} title={`Color: ${tc.name} — click to change`} />
                    {isEditingColor && (
                      <div style={{ position: "absolute", top: 30, left: 0, zIndex: 100, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.12)", display: "flex", gap: 4, flexWrap: "wrap", width: 160 }}>
                        {TAG_COLORS.map((c, i) => (
                          <button key={i} onClick={() => updateTagColor(tag.id, i)} style={{ width: 24, height: 24, borderRadius: 6, background: c.bg, border: `2px solid ${tag.colorIdx === i ? c.text : "transparent"}`, cursor: "pointer", padding: 0 }} title={c.name} />
                        ))}
                      </div>
                    )}
                  </div>
                  <div><span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 18, height: 18, borderRadius: 4, fontSize: 10, fontWeight: 800, background: tc.text, color: "#fff", padding: "0 3px", letterSpacing: 0 }}>{abbr}</span></div>
                  <div style={{ textAlign: "center" }}><button onClick={() => removeTag(tag.id)} style={{ background: "none", border: "none", cursor: "pointer", color: C.textMut, padding: 4, borderRadius: 6 }}><I.Trash /></button></div>
                </div>
              );
            })}
            <div style={{ padding: "14px 20px" }}>
              {showAddTag ? (
                <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 160 }}><Inp label="Tag Name" value={newTag.name} onChange={v => setNewTag({...newTag,name:v})} placeholder="e.g. Private Play" /></div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: C.textSec, marginBottom: 4, textTransform: "uppercase" }}>Color</div>
                    <div style={{ display: "flex", gap: 4 }}>
                      {TAG_COLORS.map((tc, i) => (
                        <button key={i} onClick={() => setNewTag({...newTag, colorIdx: i})} style={{ width: 24, height: 24, borderRadius: 6, background: tc.bg, border: `2px solid ${newTag.colorIdx === i ? tc.text : "transparent"}`, cursor: "pointer" }} title={tc.name} />
                      ))}
                    </div>
                  </div>
                  <Btn size="sm" onClick={handleAddTag}>Add</Btn>
                  <Btn size="sm" variant="ghost" onClick={() => setShowAddTag(false)}>Cancel</Btn>
                </div>
              ) : (
                <Btn variant="ghost" size="sm" onClick={() => setShowAddTag(true)} icon={<I.Plus />}>Add Dog Tag</Btn>
              )}
            </div>
          </Card>
        </div>
      ) : tab === "compliance-rules" ? (() => {
        const compRules = data.complianceRules || {};
        // Default: all checks apply to all appointment types
        const CHECKS = [
          { id: "vaccines", label: "Vaccines", desc: "Required vaccinations must be current" },
          { id: "emergency_contact", label: "Emergency Contact", desc: "Emergency contact name and phone on file" },
          { id: "agreements", label: "Agreements", desc: "All required agreements must be signed" },
          { id: "dog_age", label: "Dog Age", desc: "Dog must meet age requirements" },
          { id: "spay_neuter", label: "Spay / Neuter", desc: "Intact dogs 10+ months must be Private Play only" },
        ];
        const APPT_TYPES = [
          { id: "group_daycare", label: "Group Daycare", desc: "Daycare in group play yards" },
          { id: "private_play", label: "Private Play", desc: "Solo or private play sessions" },
          { id: "dayboarding", label: "Day Boarding", desc: "Daytime boarding in a private room" },
          { id: "overnight", label: "Overnight Boarding", desc: "Overnight stays in boarding rooms" },
        ];
        const isRequired = (checkId, apptType) => {
          const rule = compRules[checkId];
          if (!rule) return true; // default: required for all
          if (rule.appliesTo === "all") return true;
          if (rule.appliesTo === "none") return false;
          if (rule.appliesTo === "custom") return (rule.apptTypes || []).includes(apptType);
          return true;
        };
        const updateRule = async (checkId, appliesTo, apptTypes) => {
          const updated = { ...compRules, [checkId]: { appliesTo, apptTypes: apptTypes || [] } };
          await save({ ...data, complianceRules: updated });
        };
        return (
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <Card style={{ padding: "24px 28px" }}>
              <h3 style={{margin:"0 0 4px",fontSize:17,fontWeight:700,color:C.text}}>Compliance Check Rules</h3>
              <p style={{margin:"0 0 20px",fontSize:13,color:C.textSec}}>Control which compliance checks are required for each appointment type. For example, the Spay/Neuter check may only apply to Group Daycare, not Day Boarding.</p>
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                {CHECKS.map(ck => {
                  const rule = compRules[ck.id] || { appliesTo: "all" };
                  return (
                    <div key={ck.id} style={{border:`1.5px solid ${C.border}`,borderRadius:12,padding:"16px 20px",background:C.surface}}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                        <div>
                          <div style={{fontSize:14,fontWeight:700,color:C.text}}>{ck.label}</div>
                          <div style={{fontSize:12,color:C.textSec}}>{ck.desc}</div>
                        </div>
                        <select value={rule.appliesTo || "all"} onChange={e => updateRule(ck.id, e.target.value, rule.apptTypes)}
                          style={{padding:"6px 12px",borderRadius:8,border:`1.5px solid ${C.border}`,fontSize:12,fontWeight:600,fontFamily:"inherit",color:C.text,cursor:"pointer",background:C.surface}}>
                          <option value="all">Required for All</option>
                          <option value="custom">Custom per Appointment</option>
                          <option value="none">Disabled</option>
                        </select>
                      </div>
                      {rule.appliesTo === "custom" && (
                        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginTop:10,paddingTop:12,borderTop:`1px solid ${C.borderLight}`}}>
                          {APPT_TYPES.map(at => {
                            const on = (rule.apptTypes || []).includes(at.id);
                            return (
                              <button key={at.id} onClick={() => {
                                const cur = rule.apptTypes || [];
                                const next = on ? cur.filter(t => t !== at.id) : [...cur, at.id];
                                updateRule(ck.id, "custom", next);
                              }}
                                style={{padding:"10px 12px",borderRadius:8,border:`1.5px solid ${on ? C.pri : C.border}`,background:on ? `${C.pri}10` : "transparent",color:on ? C.pri : C.textMut,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",textAlign:"center",transition:"all 0.15s"}}>
                                <div style={{fontWeight:700}}>{at.label}</div>
                                <div style={{fontSize:10,marginTop:2,opacity:0.7}}>{on ? "Required" : "Not required"}</div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
            <Card style={{ padding: "24px 28px" }}>
              <h3 style={{margin:"0 0 4px",fontSize:17,fontWeight:700,color:C.text}}>How Compliance Rules Work</h3>
              <div style={{fontSize:13,color:C.textSec,lineHeight:1.7}}>
                <p style={{margin:"0 0 8px"}}>Each compliance check can be set to "Required for All," "Custom per Appointment," or "Disabled."</p>
                <p style={{margin:"0 0 8px"}}><strong>Example:</strong> If Spay/Neuter is set to Custom and only "Group Daycare" is selected, then an intact dog over 10 months will be blocked from Group Daycare check-in but can still check in for Day Boarding or Overnight Boarding.</p>
                <p style={{margin:0}}>When a check is "Disabled," it will still display on the check-in card but won't block the check-in button.</p>
              </div>
            </Card>
          </div>
        );
      })() : tab === "booking-settings" ? (() => {
        const bkSettings = data.settings || {};
        const tourSet = bkSettings.tourSettings || { allowConcurrent: false, duration: 30 };
        const dcCap = bkSettings.daycareCapacity || { small: 15, large: 20, total: 35 };
        const updateBkSetting = async (section, key, val) => {
          const existing = bkSettings[section] || {};
          await save({ ...data, settings: { ...bkSettings, [section]: { ...existing, [key]: val } } });
        };
        return (
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <Card style={{ padding: "24px 28px" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 4 }}>Tour Scheduling</div>
              <p style={{ fontSize: 13, color: C.textSec, margin: "0 0 20px" }}>Control how facility tours are booked through the online booking page.</p>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:16,marginBottom:20}}>
                <div>
                  <Inp label="Tour Duration (minutes)" type="number" value={tourSet.duration} onChange={v => updateBkSetting("tourSettings", "duration", parseInt(v) || 30)} />
                  <div style={{fontSize:11,color:C.textMut,marginTop:4}}>How long each tour lasts.</div>
                </div>
                <div>
                  <Inp label="Start Time" type="time" value={tourSet.startTime || "09:00"} onChange={v => updateBkSetting("tourSettings", "startTime", v)} />
                  <div style={{fontSize:11,color:C.textMut,marginTop:4}}>Earliest tour slot.</div>
                </div>
                <div>
                  <Inp label="End Time" type="time" value={tourSet.endTime || "16:30"} onChange={v => updateBkSetting("tourSettings", "endTime", v)} />
                  <div style={{fontSize:11,color:C.textMut,marginTop:4}}>Latest tour slot.</div>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  <div style={{fontSize:13,fontWeight:600,color:C.text}}>Allow Concurrent Tours</div>
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <button onClick={()=>updateBkSetting("tourSettings","allowConcurrent",!tourSet.allowConcurrent)} style={{padding:"6px 16px",borderRadius:8,border:`1.5px solid ${tourSet.allowConcurrent?C.suc:C.border}`,background:tourSet.allowConcurrent?C.suc:C.surface,color:tourSet.allowConcurrent?"#fff":C.textSec,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>{tourSet.allowConcurrent?"Allowed":"Not Allowed"}</button>
                  </div>
                  <div style={{fontSize:11,color:C.textMut}}>Allow multiple tours at once.</div>
                </div>
              </div>
              <div style={{padding:"10px 16px",borderRadius:8,background:C.bg,border:`1px solid ${C.border}`}}>
                <div style={{fontSize:12,color:C.textSec}}>Tour booking hours: <strong>{(() => { const st = tourSet.startTime || "09:00"; const et = tourSet.endTime || "16:30"; const fmt = (t) => { const [h,m] = t.split(":"); const hr = parseInt(h); return `${hr > 12 ? hr - 12 : hr === 0 ? 12 : hr}:${m} ${hr >= 12 ? "PM" : "AM"}`; }; return `${fmt(st)} – ${fmt(et)}`; })()}</strong> daily in {tourSet.duration || 30}-minute intervals</div>
              </div>
            </Card>

            <Card style={{ padding: "24px 28px" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 4 }}>Daycare Capacity</div>
              <p style={{ fontSize: 13, color: C.textSec, margin: "0 0 20px" }}>Daycare capacity is automatically calculated from your facility square footage settings. This ensures the online booking page and internal dashboard always use the same capacity numbers.</p>
              <div style={{padding:"10px 16px",borderRadius:8,background:C.bg,border:`1px solid ${C.border}`}}>
                <div style={{fontSize:12,color:C.textSec,marginBottom:8}}>Current capacity calculations:</div>
                <div style={{fontSize:12,color:C.text}}>• Small Play (under 35 lbs): <strong>1 dog per 12 SF</strong> → {Math.floor((fs.smallDogDaycareSF || 0) / 12)} dogs</div>
                <div style={{fontSize:12,color:C.text,marginTop:4}}>• Large Play (35+ lbs): <strong>1 dog per 18 SF</strong> → {Math.floor((fs.largeDogDaycareSF || 0) / 18)} dogs</div>
                <div style={{fontSize:12,color:C.text,marginTop:4}}>• <strong>Total:</strong> {Math.floor((fs.smallDogDaycareSF || 0) / 12) + Math.floor((fs.largeDogDaycareSF || 0) / 18)} dogs per day</div>
              </div>
              <div style={{marginTop:12,padding:"10px 14px",borderRadius:8,background:"#e8f5e9",border:"1px solid #4caf5030",fontSize:12,color:"#2e7d32"}}>
                To adjust capacity, edit the facility square footage in the <strong>Facility</strong> settings.
              </div>
            </Card>
          </div>
        );
      })() : tab === "legal" ? (
        <div style={{display:"flex",flexDirection:"column",gap:20}}>
          <Card style={{ padding: "28px 32px" }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginBottom: 4 }}>Terms of Service</div>
            <div style={{ fontSize: 12, color: C.textMut, marginBottom: 20 }}>Effective Date: February 10, 2026 &mdash; Last Updated: February 10, 2026</div>

            <p style={{ fontSize: 13, color: C.textSec, lineHeight: 1.7, marginBottom: 16 }}>Welcome to K9 Operations. These Terms of Service govern your access to and use of the K9 Operations platform, including any related applications, features, and services. By accessing or using the Service, you agree to be bound by these Terms.</p>

            {[
              { t: "1. Definitions", b: "\"Company\" refers to K9 Operations LLC, a New Jersey limited liability company. \"Service\" refers to the K9 Operations cloud-based software platform. \"Customer\" refers to the pet care facility or business entity that subscribes. \"User\" refers to any individual who accesses the Service. \"Customer Data\" refers to all data uploaded or generated by Users through the Service." },
              { t: "2. Description of Service", b: "K9 Operations provides a cloud-based SaaS platform for pet care facility management, including pet profile management, booking and scheduling, feeding and medication tracking, report cards, employee scheduling, and invoicing." },
              { t: "3. Account Registration and Security", b: "Customers must create an account and designate at least one administrator. You are responsible for providing accurate registration information, managing user accounts and access levels, maintaining the confidentiality of login credentials, and all activities that occur under your account." },
              { t: "4. Permitted Use and Restrictions", b: "You receive a limited, non-exclusive, non-transferable right to use the Service for your pet care facility operations. You may not copy, modify, distribute, sell, reverse engineer, scrape, or attempt unauthorized access to the Service." },
              { t: "5. Intellectual Property", b: "The Service is the exclusive property of K9 Operations LLC, protected by U.S. copyright and trademark laws. Copyright Registration filed February 9, 2026. All rights not expressly granted are reserved." },
              { t: "6. Customer Data", b: "You retain ownership of your Customer Data. You grant K9 Operations a limited license to host, store, and process your data solely to provide the Service. We will not access or disclose your data except as necessary to provide the Service or as required by law." },
              { t: "7. Service Availability", b: "We target 99.9% monthly uptime, excluding scheduled maintenance. Scheduled maintenance will be communicated at least 48 hours in advance when practicable." },
              { t: "8. Fees and Payment", b: "Access requires a paid subscription. Pricing and terms are established in your SaaS License Agreement. We may modify pricing with at least 60 days written notice." },
              { t: "9. Term and Termination", b: "Upon termination, you have 30 days to request a data export (CSV or JSON). After 30 days, Customer Data may be deleted. Outstanding fees remain due." },
              { t: "10. Disclaimers and Limitation of Liability", b: "THE SERVICE IS PROVIDED \"AS IS\" WITHOUT WARRANTIES. We make no representations regarding pet health outcomes. Our total aggregate liability shall not exceed fees paid in the preceding 12 months." },
              { t: "11. Indemnification", b: "You agree to indemnify K9 Operations LLC against claims arising from your use of the Service, violation of these Terms, or your operation of a pet care facility." },
              { t: "12. Governing Law", b: "These Terms are governed by New Jersey law. Disputes shall be resolved in Burlington County, NJ courts." },
              { t: "13. Changes to Terms", b: "We will provide at least 30 days notice for material changes. Continued use constitutes acceptance of modified Terms." },
              { t: "14. Contact", b: "Questions? Contact us at support@k9operations.com" },
            ].map((s, i) => (
              <div key={i} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>{s.t}</div>
                <div style={{ fontSize: 13, color: C.textSec, lineHeight: 1.7 }}>{s.b}</div>
              </div>
            ))}
          </Card>

          <Card style={{ padding: "28px 32px" }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginBottom: 4 }}>Privacy Policy</div>
            <div style={{ fontSize: 12, color: C.textMut, marginBottom: 20 }}>Effective Date: February 10, 2026 &mdash; Last Updated: February 10, 2026</div>

            <p style={{ fontSize: 13, color: C.textSec, lineHeight: 1.7, marginBottom: 16 }}>K9 Operations LLC is committed to protecting the privacy and security of information collected through the K9 Operations platform. This Privacy Policy describes what information we collect, how we use it, how we share it, and your choices.</p>

            {[
              { t: "1. Information We Collect", b: "We collect account information (business name, contact details, employee info), pet and client data (pet profiles, vaccination records, medical notes, emergency contacts), booking and service data (reservations, feeding logs, report cards, invoices), employee data (names, roles, schedules), usage data (IP address, browser type, pages viewed), and session cookies for authentication." },
              { t: "2. How We Use Your Information", b: "We use your information to provide and operate the Service, communicate with you, improve the platform, ensure security, and comply with legal obligations. We do not use Customer Data to train machine learning models." },
              { t: "3. How We Share Your Information", b: "We do not sell, rent, or trade your personal information. We share data only with service providers (Supabase for database hosting, Vercel for application hosting, payment processors), when required by law, or in connection with a business transfer." },
              { t: "4. Data Security", b: "All data is encrypted at rest (AES-256) and in transit (TLS 1.2+). We use role-based access controls and hashed passwords. We do not store credit card numbers or sensitive payment credentials." },
              { t: "5. Data Retention", b: "We retain data while your account is active. After termination, you have 30 days to export your data. Customer Data is deleted within 90 days of the export period, unless retention is required by law." },
              { t: "6. Your Rights", b: "You may request access to, correction of, or deletion of your personal information. You may request data export in CSV or JSON format. You may opt out of marketing communications at any time. Contact support@k9operations.com to exercise these rights." },
              { t: "7. Children's Privacy", b: "The Service is not directed to children under 13. We do not knowingly collect personal information from children under 13." },
              { t: "8. Third-Party Services", b: "This Privacy Policy does not apply to third-party services accessed through the platform. We encourage you to review their privacy policies." },
              { t: "9. State-Specific Disclosures", b: "California residents may have additional rights under CCPA/CPRA, including the right to know, delete, and opt out of data sales (we do not sell data). New Jersey residents have the right to access and correct their information and receive breach notifications." },
              { t: "10. Changes to This Policy", b: "We provide at least 30 days notice for material changes. Continued use constitutes acceptance." },
              { t: "11. Contact", b: "Questions about privacy? Email support@k9operations.com with \"Privacy\" in the subject line." },
            ].map((s, i) => (
              <div key={i} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>{s.t}</div>
                <div style={{ fontSize: 13, color: C.textSec, lineHeight: 1.7 }}>{s.b}</div>
              </div>
            ))}
          </Card>

          <div style={{ textAlign: "center", fontSize: 11, color: C.textMut, padding: "8px 0" }}>&copy; 2026 K9 Operations LLC. All Rights Reserved.</div>
        </div>
      ) : (tab === "fields" || tab === "client" || tab === "dog") ? (
        /* Required Fields Matrix */
        <div>
          <div style={{padding:"12px 16px",borderRadius:10,background:C.priLt,border:`1.5px solid ${C.pri}20`,marginBottom:16}}>
            <div style={{fontSize:12,color:C.text,lineHeight:1.5}}><strong>How it works:</strong> Click the level at which a field first becomes required. Higher levels automatically inherit it. For example, a field set at "Tour" is also required for "Eval" and "Reservation" — but not for "Create Record". Phone is always required.</div>
          </div>
          {[{label:"Client Fields",key:"clientFields",fields:data.clientFields},{label:"Dog Fields",key:"dogFields",fields:data.dogFields}].map(section=>{
            const colW = "1fr 70px 58px 52px 46px 62px 42px 36px";
            return (
            <Card key={section.key} style={{padding:0,overflow:"hidden",marginBottom:16}}>
              <div style={{padding:"14px 20px",background:C.bg,borderBottom:`1px solid ${C.border}`}}>
                <div style={{fontSize:13,fontWeight:800,color:C.text,textTransform:"uppercase",letterSpacing:"0.06em"}}>{section.label}</div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:colW,padding:"10px 20px",borderBottom:`1px solid ${C.border}`,fontSize:10,fontWeight:700,color:C.textMut,textTransform:"uppercase",letterSpacing:"0.04em",alignItems:"center"}}>
                <div>Field</div><div>Type</div>
                {ACTION_LEVELS.map(lvl=>(<div key={lvl} style={{textAlign:"center"}} title={ACTION_LABELS[lvl]}>{lvl==="reservation"?"Res":lvl==="create"?"Create":lvl==="tour"?"Tour":"Eval"}</div>))}
                <div style={{textAlign:"center"}}>Key</div><div/>
              </div>
              {section.fields.map(f=>{
                const rf = f.requiredFor || [];
                return (
                <div key={f.id} style={{display:"grid",gridTemplateColumns:colW,padding:"10px 20px",borderBottom:`1px solid ${C.borderLight}`,alignItems:"center"}}>
                  <div style={{fontSize:13,fontWeight:600,color:C.text,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{f.name}</div>
                  <div><Badge>{f.type}</Badge></div>
                  {ACTION_LEVELS.map(lvl=>{
                    const isActive = rf.includes(lvl);
                    const minLevel = rf.length > 0 ? Math.min(...rf.map(a=>ACTION_LEVELS.indexOf(a)).filter(i=>i>=0)) : 999;
                    const isInherited = !isActive && ACTION_LEVELS.indexOf(lvl) > minLevel && minLevel < 999;
                    const isLocked = f.isKey && lvl === "create";
                    const filled = isActive || isInherited;
                    return (
                      <div key={lvl} style={{textAlign:"center"}}>
                        <button onClick={()=>!isLocked&&toggleFieldLevel(section.key,f.id,lvl)} title={isLocked?"Phone is always required":(isActive?`Remove requirement from ${ACTION_LABELS[lvl]}`:(isInherited?`Raise minimum to ${ACTION_LABELS[lvl]}`:`Require starting at ${ACTION_LABELS[lvl]}`))}
                          style={{width:18,height:18,borderRadius:9,border:`2px solid ${filled?C.pri:C.border}`,background:filled?(isInherited?C.priLt:C.pri):"#fff",display:"inline-flex",alignItems:"center",justifyContent:"center",cursor:isLocked?"not-allowed":"pointer",opacity:isLocked?0.6:1,padding:0,transition:"all 0.15s"}}>
                          {filled&&<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={isInherited?C.pri:"#fff"} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                        </button>
                      </div>
                    );
                  })}
                  <div style={{textAlign:"center"}}>{f.isKey&&<Badge color="accent">KEY</Badge>}</div>
                  <div style={{textAlign:"center"}}>{!f.locked&&<button onClick={()=>removeFieldMatrix(section.key,f.id)} style={{background:"none",border:"none",cursor:"pointer",color:C.textMut,padding:2,borderRadius:6}}><I.Trash/></button>}</div>
                </div>
                );
              })}
              <div style={{padding:"14px 20px"}}>
                {showAdd&&addFieldTarget===section.key?(<div style={{display:"flex",gap:10,alignItems:"flex-end",flexWrap:"wrap"}}><div style={{flex:1,minWidth:160}}><Inp label="Field Name" value={newField.name} onChange={v=>setNewField({...newField,name:v})} placeholder="e.g. Middle Name"/></div><div style={{width:130}}><Inp label="Type" type="select" value={newField.type} onChange={v=>setNewField({...newField,type:v})} options={["text","number","email","tel","date","select","checkbox","textarea"]}/></div>{newField.type==="select"&&<div style={{flex:1,minWidth:160}}><Inp label="Options (comma sep)" value={newField.options} onChange={v=>setNewField({...newField,options:v})} placeholder="A, B, C"/></div>}<Btn size="sm" onClick={()=>handleAddFieldMatrix(section.key)}>Add</Btn><Btn size="sm" variant="ghost" onClick={()=>setShowAdd(false)}>Cancel</Btn></div>):(<Btn variant="ghost" size="sm" onClick={()=>{setAddFieldTarget(section.key);setShowAdd(true);}} icon={<I.Plus/>}>Add Custom Field</Btn>)}
              </div>
            </Card>
            );
          })}
        </div>
      ) : null}

    </div>
  );
  }

  /* ── List view (no tab selected) ── */
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: "-0.02em" }}>Settings</h2>
        <p style={{ margin: 0, fontSize: 14, color: C.textSec }}>Manage your resort configuration and preferences</p>
      </div>

      {/* Search */}
      <div style={{ position: "relative", marginBottom: 24 }}>
        <div style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", color: C.textMut, display: "flex" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </div>
        <input value={settingsSearch} onChange={e => setSettingsSearch(e.target.value)} placeholder="Search settings…"
          style={{ width: "100%", padding: "14px 16px 14px 46px", borderRadius: 14, border: `1.5px solid ${C.border}`, background: C.surface, fontSize: 15, fontWeight: 500, color: C.text, fontFamily: "'Outfit', sans-serif", outline: "none", boxSizing: "border-box", transition: "border-color 0.15s" }}
          onFocus={e => { e.target.style.borderColor = C.pri; }} onBlur={e => { e.target.style.borderColor = C.border; }} />
        {settingsSearch && <button onClick={() => setSettingsSearch("")} style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", border: "none", background: "none", cursor: "pointer", color: C.textMut, display: "flex", padding: 4 }}><I.X /></button>}
      </div>

      {/* Sectioned category grid */}
      {filteredSections.map((sec, si) => {
        if (sec.items.length === 0) return null;
        return (
          <div key={sec.label || si} style={{ marginBottom: sec.label ? 28 : 16 }}>
            {sec.label && <div style={{ fontSize: 11, fontWeight: 800, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10, paddingLeft: 4 }}>{sec.label}</div>}
            {!sec.label && si > 0 && <div style={{ borderTop: `1.5px solid ${C.border}`, marginBottom: 16, marginTop: 4 }} />}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
              {sec.items.map(cat => (
                <button key={cat.id} onClick={() => { if (nav) { nav("settings-" + cat.id); } else { setTab(cat.id); } setSettingsSearch(""); }}
                  style={{ display: "flex", alignItems: "center", gap: 16, padding: "18px 20px", borderRadius: 14, border: `1.5px solid ${C.border}`, background: C.surface, cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "all 0.15s", width: "100%" }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = C.pri; e.currentTarget.style.background = C.priLt; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.surface; }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 2 }}>{cat.label}</div>
                    <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.4 }}>{cat.desc}</div>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.textMut} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, opacity: 0.4 }}><polyline points="9 18 15 12 9 6"/></svg>
                </button>
              ))}
            </div>
          </div>
        );
      })}

      {settingsCategories.length > 0 && filteredSections.every(s => s.items.length === 0) && (
        <div style={{ textAlign: "center", padding: "48px 24px", color: C.textMut }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🔍</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>No settings found</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>Try a different search term</div>
        </div>
      )}
    </div>
  );
}

export { SettingsPage };
