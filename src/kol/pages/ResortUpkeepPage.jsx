import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { C, todayStr, fmtPhone } from "../../shared/theme";
import { hasLeanPermission } from "../../shared/permissions";
import {
  addLicenseLog,
  addVendorLog,
  archiveVendor,
  buildUpkeepDueItems,
  UPKEEP_SERVICE_FREQUENCIES,
  upkeepVendorMeta,
  upkeepLicenseMeta,
  parseSpreadsheetGrids,
  detectVendorTables,
  buildVendorRows,
  buildVendorTemplateBlob,
  VENDOR_IMPORT_FIELDS,
  VENDOR_IMPORT_FIELD_LABELS,
  loadUpkeepIntros,
  saveUpkeepIntros,
  deactivateLicense,
  fmtUpkeepDate,
  fmtUpkeepStatus,
  createResortUpkeepSignedUrl,
  loadLicenses,
  loadLicenseLogs,
  loadLicenseLogCounts,
  loadMaintenancePeriodSnapshot,
  loadMaintenancePeriodAttachments,
  recordResortUpkeepPeriodAttachment,
  deleteResortUpkeepPeriodAttachment,
  loadMaintenancePeriods,
  loadMaintenanceTemplates,
  loadResortUpkeepDashboard,
  loadResortUpkeepAttachments,
  loadResortUpkeepAuditEvents,
  loadVendorLogs,
  loadVendors,
  publishMaintenanceTemplateVersion,
  loadTemplateVersions,
  saveTemplateDraft,
  deleteTemplateDraft,
  recordResortUpkeepAttachment,
  reopenMaintenancePeriod,
  saveLicense,
  saveMaintenanceItemState,
  saveVendor,
  submitMaintenancePeriod,
  subscribeToResortUpkeep,
  uploadResortUpkeepAttachment,
} from "../resortUpkeepData";
import {
  DenseTable,
  ListSurface,
  ListSurfaceTitle,
  ListSearchRow,
  PillFilter,
  PillSeparator,
  ListTabBar,
  ListExplainer,
  StatusPill as SharedStatusPill,
  StackBadge,
} from "../../shared/listSurface";
import { CustomSelect, LaborIntro } from "../../shared/ui";
import { searchGoogleVendors, getGoogleVendorDetails, parsePlaceAddress } from "./resortUpkeep/googlePlaces";

const TABS = [
  { id: "due", label: "Due" },
  { id: "vendors", label: "Vendors" },
  { id: "licenses", label: "Licenses" },
  { id: "guide", label: "Guide" },
];

const EMPTY_DASHBOARD = {
  maintenance: [],
  maintenanceSummary: { active: 0, overdue: 0, ready_to_submit: 0, submitted: 0, open: 0 },
  vendors: { active: 0, archived: 0 },
  licenses: { active: 0, non_compliant: 0, expiring_soon: 0 },
  troubleshooting: [],
};

const input = {
  width: "100%",
  boxSizing: "border-box",
  border: `1px solid ${C.border}`,
  borderRadius: 10,
  background: "#fff",
  color: C.text,
  padding: "10px 12px",
  fontSize: 13,
  fontFamily: "inherit",
};

function actorName(profile) {
  return profile?.full_name || profile?.name || profile?.email || "K9 Operations";
}

function blankVendor(locationId) {
  return {
    location_id: locationId,
    business_name: "",
    business_address: "",
    website: "",
    has_contract: false,
    contract_effective_start: "",
    contract_effective_end: "",
    contact_info: [],
    notes: "",
    is_archived: false,
  };
}

function blankLicense(locationId) {
  return {
    location_id: locationId,
    requirement_name: "",
    issuing_organization: "",
    status: "non_compliant",
    expiration_date: "",
    next_expected_date: "",
    cadence_months: "",
    contact_info: [],
    website_links: [],
    notes: "",
    is_active: true,
  };
}

function primaryContact(contacts = []) {
  const contact = Array.isArray(contacts) ? contacts[0] || {} : {};
  return {
    name: String(contact.name || contact.contact_name || ""),
    role: String(contact.role || contact.title || ""),
    phone: String(contact.phone || contact.phone_number || ""),
    email: String(contact.email || ""),
    notes: String(contact.notes || contact.note || ""),
  };
}

function primaryLink(links = []) {
  const link = Array.isArray(links) ? links[0] || {} : {};
  return {
    label: String(link.label || link.title || ""),
    url: String(link.url || link.href || link.website || ""),
  };
}

function mergePrimaryContact(existing = [], contact) {
  const cleaned = {
    name: contact.name.trim(),
    role: contact.role.trim(),
    phone: contact.phone.trim(),
    email: contact.email.trim(),
    notes: contact.notes.trim(),
  };
  const rest = Array.isArray(existing) ? existing.slice(1) : [];
  return Object.values(cleaned).some(Boolean) ? [cleaned, ...rest] : rest;
}

function mergePrimaryLink(existing = [], link) {
  const cleaned = {
    label: link.label.trim() || "Requirement link",
    url: link.url.trim(),
  };
  const rest = Array.isArray(existing) ? existing.slice(1) : [];
  return cleaned.url ? [cleaned, ...rest] : rest;
}

function friendlyErrorMessage(error, fallback = "This Resort Upkeep section could not be loaded.") {
  const message = error?.message || String(error || "");
  if (/failed to fetch/i.test(message)) return `${fallback} Network access failed. Retry when the connection settles.`;
  return message || fallback;
}

function withUpkeepTimeout(promise, message = "This Resort Upkeep request took too long to load.", ms = 12000) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

function plural(value, single, many = `${single}s`) {
  return `${value} ${value === 1 ? single : many}`;
}

export default function ResortUpkeepPage({ profile, locationId: selectedLocationId, addGlobalToast = () => {} }) {
  const locationId = selectedLocationId || profile?.location_id || "";
  const actor = useMemo(() => actorName(profile), [profile]);
  const canComplete = hasLeanPermission(profile, "Resort Upkeep Complete");
  const canManage = hasLeanPermission(profile, "Resort Upkeep Manage");
  const [tab, setTab] = useState("due");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dashboard, setDashboard] = useState(EMPTY_DASHBOARD);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [intros, setIntros] = useState({});
  const loadSeq = useRef(0);
  const loadedLocationRef = useRef("");

  const load = useCallback(async () => {
    if (!locationId) return;
    const seq = loadSeq.current + 1;
    loadSeq.current = seq;
    const isInitialLocationLoad = loadedLocationRef.current !== locationId;
    if (isInitialLocationLoad) {
      setLoading(true);
      setError("");
    }
    try {
      const nextDashboard = await withUpkeepTimeout(
        loadResortUpkeepDashboard(locationId),
        "Resort Upkeep dashboard took too long to load."
      );
      if (seq !== loadSeq.current) return;
      setDashboard(nextDashboard);
      loadedLocationRef.current = locationId;
      setError("");
    } catch (nextError) {
      if (seq !== loadSeq.current) return;
      console.warn("Failed to load Resort Upkeep", nextError);
      if (isInitialLocationLoad) {
        setError(friendlyErrorMessage(nextError, "Resort Upkeep could not be loaded."));
      }
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [locationId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!locationId) return undefined;
    return subscribeToResortUpkeep(locationId, () => load());
  }, [load, locationId]);

  const toast = useCallback((message) => addGlobalToast({ type: "success", message }), [addGlobalToast]);

  // Per-location editable tab intros (location admins and up), persisted in lite_settings.
  const canEditIntro = ["owner", "role_owner", "enterprise_admin", "multi_location_admin", "multi_loc_admin", "location_admin"].includes(profile?.role);
  useEffect(() => {
    if (!locationId) return undefined;
    let cancelled = false;
    loadUpkeepIntros(locationId).then((data) => { if (!cancelled) setIntros(data || {}); }).catch(() => {});
    return () => { cancelled = true; };
  }, [locationId]);
  const saveIntro = useCallback(async (key, text) => {
    const next = { ...intros };
    if (text && text.trim()) next[key] = text.trim(); else delete next[key];
    setIntros(next);
    try { await saveUpkeepIntros(locationId, next, profile?.user_id || profile?.id || null); }
    catch { addGlobalToast({ type: "error", message: "Couldn't save text" }); }
  }, [intros, locationId, profile, addGlobalToast]);

  const tabStats = useMemo(() => ({
    due: (dashboard.maintenanceSummary?.overdue || 0) + (dashboard.licenses?.non_compliant || 0) + (dashboard.licenses?.expiring_soon || 0),
    vendors: dashboard.vendors?.active || 0,
    licenses: dashboard.licenses?.non_compliant || 0,
    guide: dashboard.troubleshooting?.length || 0,
  }), [dashboard]);

  if (!locationId) {
    return <Shell><EmptyCard title="No location selected" text="Choose a location before opening Resort Upkeep." /></Shell>;
  }

  const tabsBar = (
    <ListTabBar
      tabs={TABS.map((item) => ({ id: item.id, label: item.label, count: tabStats[item.id] }))}
      activeId={tab}
      onChange={setTab}
    />
  );

  const explainer = (
    <LaborIntro
      value={intros[tab]}
      defaultValue={INTRO_DEFAULTS[tab] || ""}
      canEdit={canEditIntro}
      onSave={(text) => saveIntro(tab, text)}
    />
  );

  return (
    <Shell>
      <ListSurfaceTitle
        actions={canManage ? (
          <button
            type="button"
            onClick={() => setSettingsOpen((v) => !v)}
            title="Resort Upkeep settings"
            aria-label="Resort Upkeep settings"
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: 9, border: `1px solid ${settingsOpen ? C.pri : C.border}`, background: settingsOpen ? C.priLt : "#fff", color: settingsOpen ? C.pri : C.textMut, cursor: "pointer" }}
          >
            <GearIcon />
          </button>
        ) : null}
      >
        Resort Upkeep
      </ListSurfaceTitle>

      {error && <div style={{ marginBottom: 12 }}><InlineAlert tone="warning">{error}</InlineAlert></div>}

      {settingsOpen ? (
        <SettingsPanel locationId={locationId} actor={actor} canManage={canManage} onClose={() => setSettingsOpen(false)} toast={toast} />
      ) : (
        <>
          {tab === "due" && <DuePanel tabsBar={tabsBar} explainer={explainer} locationId={locationId} actor={actor} dashboard={dashboard} canComplete={canComplete} canManage={canManage} onOpenTab={setTab} onRefresh={load} toast={toast} />}
          {tab === "vendors" && <VendorsPanel tabsBar={tabsBar} explainer={explainer} locationId={locationId} actor={actor} canManage={canManage} toast={toast} />}
          {tab === "licenses" && <LicensesPanel tabsBar={tabsBar} explainer={explainer} locationId={locationId} actor={actor} canManage={canManage} toast={toast} />}
          {tab === "guide" && <TroubleshootingPanel tabsBar={tabsBar} explainer={explainer} articles={dashboard.troubleshooting || []} />}
        </>
      )}
    </Shell>
  );
}

function GearIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

const INTRO_DEFAULTS = {
  due: "Everything overdue or coming due across building maintenance, licenses, and vendor contracts. Open a maintenance row to complete its checklist.",
  vendors: "The facility vendor and utility call list: trade, company, contact, contract, service frequency and cost. A full company directory (multiple contacts and documents per company) is planned; for now this is the call list.",
  licenses: "Permits and compliance requirements with renewal frequency, due dates, compliance status, proof documents, and an update log.",
  guide: "Field reference and escalation paths for common facility issues. Expanded for fast scanning under operational pressure.",
};

const DUE_WINDOWS = [
  { id: 30, label: "30d" },
  { id: 60, label: "60d" },
  { id: 90, label: "90d" },
  { id: Infinity, label: "All" },
];

// Map a due item's kind / urgency onto the shared StatusPill + StackBadge tones.
const KIND_TONE = { maintenance: "primary", license: "info", vendor: "accent" };
const dueToneToStatus = (tone) => (tone === "danger" ? "danger" : tone === "warn" ? "warning" : "neutral");
const dueToneToBadge = (tone) => (tone === "danger" ? "danger" : tone === "warn" ? "warning" : "primary");

function fmtDueCompact(value) {
  if (!value) return "—";
  try {
    return new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit" });
  } catch {
    return String(value);
  }
}

function formatDueRange(item) {
  if (item.dueStart && item.dueEnd && item.dueStart !== item.dueEnd) {
    return `${fmtDueCompact(item.dueStart)} – ${fmtDueCompact(item.dueEnd)}`;
  }
  return fmtDueCompact(item.dueDate || item.dueEnd || item.dueStart);
}

// The unified "what's due" rollup, composed from the shared list-surface
// standard (src/shared/listSurface.jsx). It reuses data the page already loads
// (active maintenance periods from the dashboard, plus licenses and vendor
// contracts). Maintenance rows open a completion modal; license/vendor rows
// jump to their own tab. No new RPC, no migration.
function DuePanel({ tabsBar, explainer, locationId, actor, dashboard, canComplete, onOpenTab, onRefresh, toast }) {
  const [licenses, setLicenses] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [windowDays, setWindowDays] = useState(60);
  const [openPeriodId, setOpenPeriodId] = useState("");

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!locationId) return;
    if (!silent) setLoading(true);
    try {
      const [nextLicenses, nextVendors] = await withUpkeepTimeout(
        Promise.all([loadLicenses(locationId, false), loadVendors(locationId, false)]),
        "What's due took too long to load."
      );
      setLicenses(nextLicenses);
      setVendors(nextVendors);
      setError("");
    } catch (nextError) {
      console.warn("Due rollup load failed", nextError);
      setError(friendlyErrorMessage(nextError, "What's due could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, [locationId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!locationId) return undefined;
    return subscribeToResortUpkeep(locationId, () => load({ silent: true }));
  }, [load, locationId]);

  const today = todayStr();
  const windowItems = useMemo(
    () => buildUpkeepDueItems({ maintenance: dashboard.maintenance || [], licenses, vendors, today, windowDays }),
    [dashboard.maintenance, licenses, vendors, today, windowDays]
  );
  const counts = useMemo(() => ({
    all: windowItems.length,
    overdue: windowItems.filter((item) => item.tone === "danger").length,
    maintenance: windowItems.filter((item) => item.kind === "maintenance").length,
    license: windowItems.filter((item) => item.kind === "license").length,
    vendor: windowItems.filter((item) => item.kind === "vendor").length,
  }), [windowItems]);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return windowItems.filter((item) => {
      const matchesKind = kind === "all" ? true : kind === "overdue" ? item.tone === "danger" : item.kind === kind;
      const matchesText = !needle || `${item.title} ${item.subtitle} ${item.frequency}`.toLowerCase().includes(needle);
      return matchesKind && matchesText;
    });
  }, [windowItems, kind, query]);

  const activePeriods = dashboard.maintenance || [];
  const openPeriod = useMemo(
    () => activePeriods.find((p) => String(p.id) === openPeriodId) || null,
    [activePeriods, openPeriodId]
  );

  const handleRow = (item) => {
    if (item.kind === "maintenance") setOpenPeriodId(String(item.id).replace(/^maintenance:/, ""));
    else onOpenTab(item.targetTab);
  };

  const columns = useMemo(() => ([
    {
      key: "item",
      header: "Item",
      width: "minmax(150px, 1.7fr)",
      sortable: true,
      sortValue: (r) => String(r.title).toLowerCase(),
      render: (r) => (
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: C.text, fontSize: 12, lineHeight: 1.25, wordBreak: "break-word" }}>{r.title}</div>
          {r.subtitle ? <div style={{ marginTop: 2, fontSize: 11, color: C.textMut, lineHeight: 1.3 }}>{r.subtitle}</div> : null}
        </div>
      ),
    },
    {
      key: "type",
      header: "Type",
      width: 96,
      sortable: true,
      sortValue: (r) => r.kindLabel,
      render: (r) => <SharedStatusPill tone={KIND_TONE[r.kind] || "neutral"}>{r.kindLabel}</SharedStatusPill>,
    },
    {
      key: "frequency",
      header: "Frequency",
      width: "minmax(92px, 0.9fr)",
      sortable: true,
      sortValue: (r) => r.frequency || "",
      render: (r) => <span style={{ fontSize: 11, fontWeight: 700, color: C.textSec, whiteSpace: "nowrap" }}>{r.frequency || "—"}</span>,
    },
    {
      key: "due",
      header: "Due",
      width: "minmax(118px, 1.1fr)",
      sortable: true,
      sortValue: (r) => (r.attention && r.daysLeft == null ? Number.NEGATIVE_INFINITY : r.daysLeft == null ? Number.POSITIVE_INFINITY : r.daysLeft),
      render: (r) => (
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.text, whiteSpace: "nowrap" }}>{formatDueRange(r)}</span>
          {r.dueBadge ? <StackBadge tone={dueToneToBadge(r.tone)}>{r.dueBadge}</StackBadge> : null}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: 112,
      sortable: true,
      sortValue: (r) => r.statusLabel,
      render: (r) => <SharedStatusPill tone={r.statusTone || dueToneToStatus(r.tone)}>{r.statusLabel}</SharedStatusPill>,
    },
  ]), []);

  return (
    <div>
      <ListSurface>
      <ListSearchRow value={query} onChange={setQuery} placeholder="Search what's due">
        <PillFilter active={kind === "all"} count={counts.all} onClick={() => setKind("all")}>All</PillFilter>
        <PillFilter active={kind === "overdue"} count={counts.overdue} variant="solid" color={C.dan} onClick={() => setKind(kind === "overdue" ? "all" : "overdue")}>Overdue</PillFilter>
        <PillFilter active={kind === "maintenance"} count={counts.maintenance} onClick={() => setKind("maintenance")}>Maintenance</PillFilter>
        <PillFilter active={kind === "license"} count={counts.license} onClick={() => setKind("license")}>Licenses</PillFilter>
        <PillFilter active={kind === "vendor"} count={counts.vendor} onClick={() => setKind("vendor")}>Vendors</PillFilter>
        <PillSeparator />
        {DUE_WINDOWS.map((opt) => (
          <PillFilter key={String(opt.id)} active={windowDays === opt.id} onClick={() => setWindowDays(opt.id)} title={`Due within ${opt.label}`}>{opt.label}</PillFilter>
        ))}
      </ListSearchRow>
      {tabsBar}
      {explainer}

      {error ? (
        <div style={{ marginTop: 12 }}>
          <InlineAlert tone="warning">{error} <button type="button" onClick={() => load()} style={inlineLinkButton}>Retry</button></InlineAlert>
        </div>
      ) : null}

      <div style={{ marginTop: 12 }}>
        {loading ? (
          <div style={{ display: "grid", gap: 10 }}><LoadingRows /></div>
        ) : (
          <DenseTable
            columns={columns}
            rows={visible}
            getRowKey={(r) => r.id}
            minWidth={660}
            style={{ border: "none", borderRadius: 0 }}
            onRowClick={handleRow}
            defaultSort={{ key: "due", direction: "asc" }}
            emptyText={counts.overdue ? "Nothing matches these filters." : "You're current. Widen the window to look further ahead."}
          />
        )}
      </div>
      </ListSurface>

      {openPeriod ? (
        <MaintenanceCompletionModal
          period={openPeriod}
          locationId={locationId}
          actor={actor}
          canComplete={canComplete}
          onClose={() => setOpenPeriodId("")}
          onChanged={() => { if (onRefresh) onRefresh(); }}
          toast={toast}
        />
      ) : null}
    </div>
  );
}

// Checklist completion, reimagined on the Bathing Report model: a clean,
// tap-to-complete item list with a progress bar (who/when attribution), plus a
// PDF upload as an alternate "record of completion" path. Replaces the old
// notes-per-item + autosave + auto-submit-timer flow.
function MaintenanceCompletionModal({ period, locationId, actor, canComplete, onClose, onChanged, toast }) {
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const reload = useCallback(async () => {
    try {
      const [snap, atts] = await withUpkeepTimeout(
        Promise.all([
          loadMaintenancePeriodSnapshot(period.id),
          loadMaintenancePeriodAttachments(locationId, period.id).catch(() => []),
        ]),
        "Checklist took too long to load."
      );
      setSnapshot(snap);
      setFiles(atts);
      setError("");
    } catch (e) {
      setError(friendlyErrorMessage(e, "This checklist could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, [period.id, locationId]);

  useEffect(() => { setLoading(true); reload(); }, [reload]);

  const items = snapshot?.items || [];
  const progress = snapshot?.progress || {};
  const requiredItems = items.filter((it) => it.is_required !== false);
  const total = progress.totalRequired ?? (requiredItems.length || items.length);
  const done = progress.completedRequired ?? requiredItems.filter((it) => it.state?.checked).length;
  const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const allComplete = total > 0 && done >= total;
  const computedStatus = snapshot?.computedStatus || period.computed_status || period.status;
  const submitted = ["submitted", "submitted_late", "late_submitted"].includes(computedStatus);
  const pastDue = !!period.due_date && todayStr() > String(period.due_date).slice(0, 10);
  const editable = canComplete && (snapshot?.canEdit ?? true) && !submitted;
  const canEdit = editable && editMode;

  const pickFiles = async (fileList) => {
    const chosen = Array.from(fileList || []);
    if (!chosen.length) return;
    setUploading(true);
    setError("");
    try {
      for (const file of chosen) {
        const uploaded = await uploadResortUpkeepAttachment({ locationId, file, pathParts: ["maintenance", period.id, "completion"] });
        await recordResortUpkeepPeriodAttachment({ locationId, periodId: period.id, file, storagePath: uploaded.path, fileName: file.name || uploaded.safeName, actorName: actor });
      }
      await reload();
      if (toast) toast(chosen.length > 1 ? "Attachments uploaded" : "Attachment uploaded");
    } catch (e) {
      setError(friendlyErrorMessage(e, "That attachment could not be uploaded."));
    } finally {
      setUploading(false);
    }
  };
  const removeFile = async (id) => {
    setError("");
    try { await deleteResortUpkeepPeriodAttachment(id, actor); await reload(); }
    catch (e) { setError(friendlyErrorMessage(e, "That attachment could not be removed.")); }
  };
  const openAttachment = async (a) => { try { const url = await createResortUpkeepSignedUrl(a); if (url) window.open(url, "_blank", "noopener,noreferrer"); } catch { /* non-blocking */ } };

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      if (!allComplete && files.length) {
        // Uploaded attachments are the record of completion: mark each item done.
        for (const item of items) {
          if (!item.state?.checked) {
            await saveMaintenanceItemState({ periodId: period.id, itemKey: item.key, checked: true, notes: item.state?.notes || "Completed via uploaded attachment", actorName: actor });
          }
        }
      }
      await submitMaintenancePeriod(period.id, actor, files.length ? `Completed with ${files.length} uploaded attachment(s)` : "");
      if (toast) toast("Checklist submitted");
      if (onChanged) onChanged();
      onClose();
    } catch (e) {
      setError(friendlyErrorMessage(e, "This checklist could not be submitted."));
      setSubmitting(false);
    }
  };

  const title = period.template_name || period.template_slug || "Maintenance checklist";
  const range = [period.period_start, period.period_end].filter(Boolean).map(fmtUpkeepDate).join(" – ");
  const submitDisabled = submitting || submitted || !canComplete || (!allComplete && files.length === 0);

  return (
    <div style={muOverlay} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={muCard} role="dialog" aria-modal="true">
        <div style={muHead}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.text, lineHeight: 1.2, wordBreak: "break-word" }}>{title}</div>
            <div style={{ marginTop: 3, fontSize: 12, color: C.textMut }}>
              {range || "Current period"}{computedStatus ? ` · ${fmtUpkeepStatus(computedStatus)}` : ""}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {!submitted ? (
              <button
                type="button"
                onClick={() => editable && setEditMode((v) => !v)}
                disabled={!editable}
                title={editMode ? "Done editing" : "Edit checklist"}
                style={{ ...secondaryBtn, opacity: editable ? 1 : 0.5, cursor: editable ? "pointer" : "default", ...(editMode && editable ? { borderColor: C.pri, color: C.pri, background: C.priLt } : null) }}
              >
                {editMode && editable ? "Done" : "Edit"}
              </button>
            ) : null}
            <button type="button" onClick={onClose} style={secondaryBtn}>Close</button>
          </div>
        </div>

        <div style={muBody}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{done}/{total} items complete</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.textMut }}>{pct}%</div>
          </div>
          <div style={muProgressTrack}>
            <div style={{ width: `${pct}%`, height: "100%", borderRadius: 999, background: allComplete ? C.suc : C.pri, transition: "width 0.3s" }} />
          </div>

          {pastDue && !submitted ? (
            <div style={{ marginTop: 10, fontSize: 12, fontWeight: 700, color: "#92400E", background: C.warnLt, border: "1px solid #FDE68A", borderRadius: 8, padding: "7px 10px" }}>
              Past due — completing now will be recorded as a late submission.
            </div>
          ) : null}
          {!loading && (submitted || !canComplete) ? (
            <div style={{ marginTop: 10, fontSize: 12, fontWeight: 600, color: C.textMut }}>
              {submitted ? "Submitted — read-only." : "Read-only access."}
            </div>
          ) : !loading && editable && !editMode ? (
            <div style={{ marginTop: 10, fontSize: 12, fontWeight: 600, color: C.textMut }}>Click Edit to make changes.</div>
          ) : null}

          <div style={{ marginTop: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <div style={sectionLabel}>Attachments</div>
              {canEdit ? (
                <label style={{ ...muSmallBtn, opacity: uploading ? 0.6 : 1, cursor: uploading ? "default" : "pointer" }} title="Upload one or more files as the record of completion">
                  {uploading ? "Uploading…" : "Upload attachment"}
                  <input type="file" multiple style={{ display: "none" }} disabled={uploading} onChange={(e) => pickFiles(e.target.files)} />
                </label>
              ) : null}
            </div>
            {files.length ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {files.map((f) => (
                  <span key={f.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 6px 4px 10px", borderRadius: 999, background: C.surfaceHover, border: `1px solid ${C.border}`, fontSize: 11, fontWeight: 700, color: C.text }}>
                    <button type="button" onClick={() => openAttachment(f)} title={f.file_name || "Attachment"} style={{ border: "none", background: "none", padding: 0, cursor: "pointer", color: C.text, fontWeight: 700, fontSize: 11, fontFamily: "inherit" }}>{String(f.file_name || "Attachment").slice(0, 28)}</button>
                    {canEdit ? <button type="button" onClick={() => removeFile(f.id)} title="Remove attachment" style={{ border: "none", background: "none", cursor: "pointer", color: C.textMut, fontWeight: 900, fontSize: 14, lineHeight: 1, padding: 0 }}>×</button> : null}
                  </span>
                ))}
              </div>
            ) : <div style={{ marginTop: 6, fontSize: 12, color: C.textMut }}>No attachments yet.</div>}
          </div>

          <div style={{ marginTop: 16 }}>
            {loading ? (
              <div style={{ display: "grid", gap: 8 }}><LoadingRows /></div>
            ) : items.length === 0 ? (
              <div style={{ color: C.textMut, fontSize: 13 }}>This checklist has no items yet. Add items in Settings.</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {items.map((item) => (
                  <ChecklistItemRow
                    key={item.key}
                    item={item}
                    period={period}
                    locationId={locationId}
                    actor={actor}
                    canEdit={canEdit}
                    onSaved={reload}
                  />
                ))}
              </div>
            )}
          </div>

          {error ? <div style={{ marginTop: 12 }}><InlineAlert tone="danger">{error}</InlineAlert></div> : null}
        </div>

        <div style={muFoot}>
          <div style={{ fontSize: 12, color: C.textMut, flex: 1, minWidth: 0 }}>
            {submitted ? "This checklist has already been submitted." : !canComplete ? "You have read-only access." : files.length ? "Ready to submit with the uploaded attachment(s)." : allComplete ? (pastDue ? "All items complete — submitting will be recorded as late." : "All items complete.") : "Progress is saved as you go. Finish the items or upload an attachment to submit."}
          </div>
          <button type="button" onClick={submit} disabled={submitDisabled} style={{ ...primaryBtn, opacity: submitDisabled ? 0.5 : 1 }}>
            {submitting ? "Submitting…" : "Submit checklist"}
          </button>
        </div>
      </div>
    </div>
  );
}

// One checklist line: tap to complete (with who/when attribution that persists
// as a draft), an optional note, and photo capture. If the template marks the
// item photo-required, the checkbox stays locked until a photo is attached.
function ChecklistItemRow({ item, period, locationId, actor, canEdit, onSaved }) {
  const checked = !!item.state?.checked;
  const requiresPhoto = !!item.requires_photo;
  const attachments = item.attachments || [];
  const hasPhoto = attachments.length > 0;
  const completedBy = item.state?.completed_by_name || item.state?.checked_by_name || "";
  const completedAt = item.state?.completed_at || item.state?.checked_at || "";
  const [note, setNote] = useState(item.state?.notes || "");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { setNote(item.state?.notes || ""); }, [item.key, item.state?.notes]);

  const persist = async (overrides) => {
    await saveMaintenanceItemState({ periodId: period.id, itemKey: item.key, checked, notes: note, actorName: actor, ...overrides });
    if (onSaved) await onSaved();
  };

  const blocked = !checked && requiresPhoto && !hasPhoto;

  const toggle = async () => {
    if (!canEdit || busy || blocked) return;
    setBusy("toggle");
    setError("");
    try { await persist({ checked: !checked }); }
    catch (e) { setError(friendlyErrorMessage(e, "Could not update this item.")); }
    finally { setBusy(""); }
  };

  const saveNote = async () => {
    if (!canEdit || busy || note === (item.state?.notes || "")) return;
    setBusy("note");
    setError("");
    try { await persist({ notes: note }); }
    catch (e) { setError(friendlyErrorMessage(e, "Could not save the note.")); }
    finally { setBusy(""); }
  };

  const addPhoto = async (file) => {
    if (!file || !canEdit) return;
    setBusy("photo");
    setError("");
    try {
      const saved = await saveMaintenanceItemState({ periodId: period.id, itemKey: item.key, checked, notes: note, actorName: actor });
      const itemStateId = saved?.itemState?.id || item.state?.id;
      const uploaded = await uploadResortUpkeepAttachment({ locationId, file, pathParts: ["maintenance", period.id, itemStateId] });
      await recordResortUpkeepAttachment({
        locationId,
        attachmentScope: file.type?.startsWith("image/") ? "maintenance_item_photo" : "maintenance_item_attachment",
        periodId: period.id,
        itemStateId,
        file,
        fileName: file.name || uploaded.safeName,
        storagePath: uploaded.path,
        actorName: actor,
      });
      if (onSaved) await onSaved();
    } catch (e) {
      setError(friendlyErrorMessage(e, "That photo could not be uploaded."));
    } finally {
      setBusy("");
    }
  };

  const openAttachment = async (attachment) => {
    try {
      const url = await createResortUpkeepSignedUrl(attachment);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    } catch { /* non-blocking */ }
  };

  return (
    <div style={checked ? muItemDone : muItem}>
      <button type="button" onClick={toggle} disabled={!canEdit || busy === "toggle" || blocked} aria-pressed={checked} title={blocked ? "Attach a photo first" : checked ? "Mark not done" : "Mark done"} style={checked ? muToggleOn : muToggle}>
        {checked ? "✓" : ""}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.text, lineHeight: 1.35 }}>{item.label}</span>
          {requiresPhoto ? (
            <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.02em", color: hasPhoto ? C.suc : C.warn, background: hasPhoto ? C.sucLt : C.warnLt, padding: "1px 6px", borderRadius: 999 }}>
              {hasPhoto ? "PHOTO ✓" : "PHOTO REQUIRED"}
            </span>
          ) : null}
        </div>
        {checked && (completedBy || completedAt) ? (
          <div style={{ marginTop: 2, fontSize: 11, color: C.textMut }}>
            Done{completedBy ? ` by ${completedBy}` : ""}{completedAt ? ` · ${fmtAuditDate(completedAt)}` : ""}
          </div>
        ) : null}
        {canEdit ? (
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={saveNote}
            placeholder="Add a note (needs cleaning, looks good, repair needed…)"
            rows={1}
            style={{ ...input, marginTop: 8, minHeight: 34, fontSize: 12, padding: "7px 10px" }}
          />
        ) : note ? (
          <div style={{ marginTop: 6, fontSize: 12, color: C.textSec, whiteSpace: "pre-wrap" }}>{note}</div>
        ) : null}
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
          {canEdit ? (
            <label style={{ ...muSmallBtn, cursor: busy === "photo" ? "default" : "pointer", opacity: busy === "photo" ? 0.6 : 1 }}>
              {busy === "photo" ? "Uploading…" : "Add photo"}
              <input type="file" accept="image/*,application/pdf" style={{ display: "none" }} onChange={(e) => addPhoto(e.target.files?.[0])} />
            </label>
          ) : null}
          {attachments.map((attachment) => (
            <button key={attachment.id} type="button" onClick={() => openAttachment(attachment)} style={muSmallBtn} title={attachment.file_name || "Attachment"}>
              {attachment.file_name ? String(attachment.file_name).slice(0, 22) : "Photo"}
            </button>
          ))}
          {busy === "note" ? <span style={{ fontSize: 11, color: C.textMut }}>Saving…</span> : null}
        </div>
        {error ? <div style={{ marginTop: 6, fontSize: 11, color: C.dan, fontWeight: 700 }}>{error}</div> : null}
      </div>
    </div>
  );
}

const muOverlay = { position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "6vh 16px", zIndex: 1000, overflowY: "auto" };
const muCard = { background: "#fff", borderRadius: 14, width: "100%", maxWidth: 720, maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 60px rgba(15,23,42,0.28)" };
const muHead = { padding: "16px 20px", borderBottom: `1px solid ${C.borderLight}`, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 };
const muBody = { padding: "16px 20px", overflowY: "auto" };
const muFoot = { padding: "12px 20px", borderTop: `1px solid ${C.borderLight}`, display: "flex", alignItems: "center", gap: 12 };
const muProgressTrack = { marginTop: 10, height: 6, borderRadius: 999, background: C.borderLight, overflow: "hidden" };
const muSmallBtn = { display: "inline-flex", alignItems: "center", justifyContent: "center", border: `1px solid ${C.border}`, borderRadius: 8, background: "#fff", color: C.text, padding: "5px 10px", fontSize: 12, fontWeight: 700, fontFamily: "inherit", whiteSpace: "nowrap" };
const muSmallPrimary = { border: 0, borderRadius: 8, background: C.pri, color: "#fff", padding: "5px 11px", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" };
const muItem = { display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 12px", borderRadius: 10, border: `1px solid ${C.border}`, background: "#fff" };
const muItemDone = { ...muItem, borderColor: "#BBF7D0", background: "#F0FDF4" };
const muToggle = { width: 26, height: 26, flexShrink: 0, borderRadius: 8, border: `1.5px solid ${C.border}`, background: "#fff", color: "transparent", cursor: "pointer", fontWeight: 900, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" };
const muToggleOn = { ...muToggle, border: `1.5px solid ${C.suc}`, background: C.suc, color: "#fff" };
const impTh = { textAlign: "left", padding: "7px 9px", fontSize: 10, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: C.textMut, whiteSpace: "nowrap" };
const impTd = { padding: "4px 6px", color: C.text, verticalAlign: "middle" };
const impCellInput = { width: "100%", minWidth: 70, boxSizing: "border-box", border: `1px solid ${C.borderLight}`, borderRadius: 6, background: "transparent", padding: "4px 6px", fontSize: 11.5, fontFamily: "inherit", color: C.text };
const impCellFocus = (e) => { e.currentTarget.style.borderColor = C.pri; e.currentTarget.style.background = "#fff"; };
const impCellBlur = (e) => { e.currentTarget.style.borderColor = C.borderLight; e.currentTarget.style.background = "transparent"; };

// Reusable modal shell + labelled field for the Vendors/Licenses/Settings editors.
function UpkeepModal({ title, subtitle, onClose, children, footer, maxWidth = 640 }) {
  return (
    <div style={muOverlay} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ ...muCard, maxWidth }} role="dialog" aria-modal="true">
        <div style={muHead}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.text, lineHeight: 1.2, wordBreak: "break-word" }}>{title}</div>
            {subtitle ? <div style={{ marginTop: 3, fontSize: 12, color: C.textMut }}>{subtitle}</div> : null}
          </div>
          <button type="button" onClick={onClose} style={secondaryBtn}>Close</button>
        </div>
        <div style={muBody}>{children}</div>
        {footer ? <div style={muFoot}>{footer}</div> : null}
      </div>
    </div>
  );
}

function MField({ label, children, hint }) {
  return (
    <label style={{ display: "grid", gap: 5, fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: C.textMut, marginBottom: 12 }}>
      {label}
      {children}
      {hint ? <span style={{ fontSize: 11, fontWeight: 500, textTransform: "none", letterSpacing: 0, color: C.textMut }}>{hint}</span> : null}
    </label>
  );
}

const mSelect = { ...({ width: "100%", boxSizing: "border-box", border: `1px solid ${C.border}`, borderRadius: 10, background: "#fff", color: C.text, padding: "9px 11px", fontSize: 13, fontFamily: "inherit", fontWeight: 600 }) };

function MaintenancePanel({ locationId, actor, dashboard, canComplete, canManage, onRefresh, toast }) {
  const [selectedId, setSelectedId] = useState("");
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [templates, setTemplates] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [templateError, setTemplateError] = useState("");
  const detailSeq = useRef(0);
  const readySubmitPromptedRef = useRef(new Set());
  const activePeriods = dashboard.maintenance || [];
  const selectedPeriod = periods.find((row) => row.id === selectedId) || activePeriods.find((row) => row.id === selectedId) || activePeriods[0] || null;
  const currentIds = new Set(activePeriods.map((row) => row.id));
  const historyPeriods = periods.filter((row) => !currentIds.has(row.id));

  const loadDetail = useCallback(async (periodId) => {
    if (!periodId) return;
    const seq = detailSeq.current + 1;
    detailSeq.current = seq;
    setLoading(true);
    setDetailError("");
    try {
      const nextSnapshot = await withUpkeepTimeout(
        loadMaintenancePeriodSnapshot(periodId),
        "Checklist details took too long to load."
      );
      if (seq !== detailSeq.current) return;
      setSnapshot(nextSnapshot);
    } catch (error) {
      if (seq !== detailSeq.current) return;
      console.warn("Maintenance period detail load failed", error);
      setSnapshot(null);
      setDetailError(error?.message || "Checklist details could not be loaded.");
    } finally {
      if (seq === detailSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const nextId = selectedId || selectedPeriod?.id || "";
    if (nextId) {
      setSelectedId(nextId);
      loadDetail(nextId);
    }
  }, [loadDetail, selectedId, selectedPeriod?.id]);

  useEffect(() => {
    let cancelled = false;
    withUpkeepTimeout(
      loadMaintenanceTemplates(locationId),
      "Maintenance templates took too long to load."
    )
      .then((rows) => {
        if (!cancelled) {
          setTemplates(rows);
          setTemplateError("");
        }
      })
      .catch((error) => {
        console.warn("Template load failed", error);
        if (!cancelled) setTemplateError(friendlyErrorMessage(error, "Maintenance templates could not be loaded."));
      });
    return () => { cancelled = true; };
  }, [locationId]);

  const loadPeriods = useCallback(() => {
    if (!locationId) return Promise.resolve();
    return withUpkeepTimeout(
      loadMaintenancePeriods(locationId, { limit: 96 }),
      "Maintenance history took too long to load."
    ).then(setPeriods).catch((error) => console.warn("Maintenance history load failed", error));
  }, [locationId]);

  useEffect(() => {
    loadPeriods();
  }, [loadPeriods, dashboard.maintenance]);

  const period = snapshot?.period || selectedPeriod;
  const computedStatus = snapshot?.computedStatus || period?.computed_status || period?.status;
  const submitted = computedStatus === "submitted" || computedStatus === "submitted_late";
  const serverAllowsEdit = snapshot?.canEdit ?? period?.can_edit ?? false;
  const canReopenSubmitted = snapshot?.canReopen ?? period?.can_reopen ?? false;
  const canEditItems = canComplete && serverAllowsEdit;

  const submit = async () => {
    const confirmed = window.confirm("Submit this checklist? The fields will lock after submission unless a manager reopens it during this checklist period.");
    if (!confirmed) return;
    try {
      await submitMaintenancePeriod(period.id, actor);
      toast("Checklist submitted");
      await Promise.all([loadDetail(period.id), onRefresh(), loadPeriods()]);
    } catch (error) {
      console.warn("Maintenance submit failed", error);
      setDetailError(friendlyErrorMessage(error, "Checklist could not be submitted."));
    }
  };

  const reopen = async () => {
    try {
      await reopenMaintenancePeriod(period.id, "Web edits after submission", actor);
      toast("Checklist reopened for edits");
      await Promise.all([loadDetail(period.id), onRefresh(), loadPeriods()]);
    } catch (error) {
      console.warn("Maintenance reopen failed", error);
      setDetailError(friendlyErrorMessage(error, "Checklist could not be reopened."));
    }
  };

  useEffect(() => {
    if (!period?.id || !canComplete || submitted || !serverAllowsEdit || computedStatus !== "ready_to_submit") return undefined;
    if (readySubmitPromptedRef.current.has(period.id)) return undefined;
    readySubmitPromptedRef.current.add(period.id);

    const timer = window.setTimeout(async () => {
      const confirmed = window.confirm("This checklist is complete. Submit it now? The fields will lock unless a manager reopens it during this checklist period.");
      if (!confirmed) return;
      try {
        await submitMaintenancePeriod(period.id, actor);
        toast("Checklist submitted");
        await Promise.all([loadDetail(period.id), onRefresh(), loadPeriods()]);
      } catch (error) {
        console.warn("Maintenance submit failed", error);
        setDetailError(friendlyErrorMessage(error, "Checklist could not be submitted."));
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [actor, canComplete, computedStatus, loadDetail, loadPeriods, onRefresh, period?.id, serverAllowsEdit, submitted, toast]);

  return (
    <div style={workspaceGrid}>
      <div style={leftRail}>
        <PanelHeader
          title="Checklist command center"
          kicker={`${plural(activePeriods.length, "active period")} · ${plural(historyPeriods.length, "history row")}`}
        />
        {activePeriods.length ? activePeriods.map((row) => (
          <button key={row.id} onClick={() => setSelectedId(row.id)} style={row.id === period?.id ? selectedRowButton : rowButton}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 950, fontSize: 14, lineHeight: 1.25 }}>{row.template_name || row.template_slug}</div>
                <div style={{ marginTop: 4, fontSize: 12, color: C.textMut }}>Due {fmtUpkeepDate(row.due_date)}</div>
              </div>
              <StatusPill status={row.computed_status || row.status} />
            </div>
            <Progress row={row} />
          </button>
        )) : <EmptyCard title="No active periods" text="Current checklist periods will appear here once the backend creates them." compact />}
        {historyPeriods.length > 0 && (
          <div style={subPanel}>
            <div style={sectionLabel}>Checklist history</div>
            <div style={{ display: "grid", gap: 8, marginTop: 10, maxHeight: 300, overflowY: "auto", paddingRight: 4 }}>
              {historyPeriods.map((row) => (
                <button key={row.id} onClick={() => setSelectedId(row.id)} style={row.id === period?.id ? selectedCompactRowButton : compactRowButton}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 900, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.template_name || row.template_slug}</div>
                      <div style={{ marginTop: 3, fontSize: 11, color: C.textMut }}>{fmtUpkeepDate(row.period_start)} - {fmtUpkeepDate(row.period_end)}</div>
                    </div>
                    <StatusPill status={row.computed_status || row.status} />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
        {templateError && <InlineAlert tone="warning">{templateError}</InlineAlert>}
        {canManage && <TemplateEditor templates={templates} locationId={locationId} actor={actor} onPublished={() => loadMaintenanceTemplates(locationId).then(setTemplates).catch((error) => setTemplateError(friendlyErrorMessage(error, "Maintenance templates could not be refreshed.")))} toast={toast} />}
      </div>

      <div style={detailPanel}>
        {!period && <EmptyCard title="No active checklist periods" text="The current monthly, quarterly, semi-annual, and annual periods will appear here once the backend creates them." />}
        {period && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 14, alignItems: "flex-start" }}>
              <div>
                <div style={eyebrow}>Due {fmtUpkeepDate(period.due_date)}</div>
                <h2 style={{ margin: "4px 0 2px", fontSize: 24, overflowWrap: "anywhere", lineHeight: 1.1 }}>{period.template_name || period.template_slug}</h2>
                <div style={{ color: C.textMut, fontSize: 13 }}>{fmtUpkeepDate(period.period_start)} - {fmtUpkeepDate(period.period_end)}</div>
              </div>
              <StatusPill status={computedStatus} />
            </div>
            <Progress row={{ ...period, progress: snapshot?.progress || period.progress }} />
            {loading && <div style={{ marginTop: 16, color: C.textMut, fontWeight: 800 }}>Loading checklist…</div>}
            {detailError && <div style={{ marginTop: 16, padding: 12, borderRadius: 12, background: C.warnLt, color: "#92400E", fontWeight: 800, fontSize: 13 }}>{detailError}</div>}
            <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
              {(snapshot?.items || []).map((item) => (
                <MaintenanceItem key={item.key} item={item} period={period} actor={actor} canEdit={canEditItems} onSaved={() => loadDetail(period.id)} />
              ))}
            </div>
            {canComplete ? (
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
                {submitted ? (
                  canManage && canReopenSubmitted ? (
                    <button onClick={reopen} style={secondaryBtn}>Make edits</button>
                  ) : (
                    <span style={{ alignSelf: "center", color: C.textMut, fontSize: 12, fontWeight: 900 }}>{canReopenSubmitted ? "Submitted. A manager can reopen it." : "Locked after period close"}</span>
                  )
                ) : (
                  <button onClick={submit} disabled={!snapshot?.progress?.isComplete} style={{ ...primaryBtn, opacity: snapshot?.progress?.isComplete ? 1 : 0.45 }}>Submit checklist</button>
                )}
              </div>
            ) : (
              <div style={{ marginTop: 16, color: C.textMut, fontSize: 12, fontWeight: 800 }}>Read-only access. A checklist completer can update and submit this checklist.</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function MaintenanceItem({ item, period, actor, canEdit, onSaved }) {
  const [checked, setChecked] = useState(Boolean(item.state?.checked));
  const [notes, setNotes] = useState(item.state?.notes || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const skipNextAutosave = useRef(true);
  const onSavedRef = useRef(onSaved);
  const localValueRef = useRef({ checked: Boolean(item.state?.checked), notes: item.state?.notes || "" });
  const serverValueRef = useRef({ checked: Boolean(item.state?.checked), notes: item.state?.notes || "" });
  const itemKeyRef = useRef(item.key);

  useEffect(() => {
    onSavedRef.current = onSaved;
  }, [onSaved]);

  useEffect(() => {
    localValueRef.current = { checked, notes };
  }, [checked, notes]);

  useEffect(() => {
    const nextServerValue = { checked: Boolean(item.state?.checked), notes: item.state?.notes || "" };
    const isDifferentItem = itemKeyRef.current !== item.key;
    const localValue = localValueRef.current;
    const priorServerValue = serverValueRef.current;
    const hasUnsavedLocalValue = localValue.checked !== priorServerValue.checked || localValue.notes !== priorServerValue.notes;

    itemKeyRef.current = item.key;
    serverValueRef.current = nextServerValue;

    if (!isDifferentItem && hasUnsavedLocalValue && (localValue.checked !== nextServerValue.checked || localValue.notes !== nextServerValue.notes)) {
      return;
    }

    skipNextAutosave.current = true;
    setChecked(nextServerValue.checked);
    setNotes(nextServerValue.notes);
  }, [item.key, item.state?.checked, item.state?.notes]);

  useEffect(() => {
    if (!canEdit) return undefined;
    if (skipNextAutosave.current) {
      skipNextAutosave.current = false;
      return undefined;
    }

    const timer = window.setTimeout(async () => {
      setSaving(true);
      try {
        await saveMaintenanceItemState({ periodId: period.id, itemKey: item.key, checked, notes, actorName: actor });
        setError("");
        await onSavedRef.current();
      } catch (nextError) {
        console.warn("Maintenance autosave failed", nextError);
        setError(friendlyErrorMessage(nextError, "This checklist item could not be autosaved."));
      } finally {
        setSaving(false);
      }
    }, 650);

    return () => window.clearTimeout(timer);
  }, [actor, canEdit, checked, item.key, notes, period.id]);

  const save = async () => {
    setSaving(true);
    try {
      await saveMaintenanceItemState({ periodId: period.id, itemKey: item.key, checked, notes, actorName: actor });
      setError("");
      await onSaved();
    } catch (nextError) {
      console.warn("Maintenance item save failed", nextError);
      setError(friendlyErrorMessage(nextError, "This checklist item could not be saved."));
    } finally {
      setSaving(false);
    }
  };

  const attach = async (file) => {
    if (!file) return;
    setSaving(true);
    try {
      const saved = await saveMaintenanceItemState({ periodId: period.id, itemKey: item.key, checked, notes, actorName: actor });
      const itemStateId = saved?.itemState?.id || item.state?.id;
      const uploaded = await uploadResortUpkeepAttachment({ locationId: period.location_id, file, pathParts: ["maintenance", period.id, itemStateId] });
      await recordResortUpkeepAttachment({
        locationId: period.location_id,
        attachmentScope: file.type?.startsWith("image/") ? "maintenance_item_photo" : "maintenance_item_attachment",
        periodId: period.id,
        itemStateId,
        file,
        fileName: file.name || uploaded.safeName,
        storagePath: uploaded.path,
        actorName: actor,
      });
      await onSaved();
      setError("");
    } catch (nextError) {
      console.warn("Maintenance attachment failed", nextError);
      setError(friendlyErrorMessage(nextError, "This attachment could not be uploaded."));
    } finally {
      setSaving(false);
    }
  };

  const openAttachment = async (attachment) => {
    try {
      const url = await createResortUpkeepSignedUrl(attachment);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    } catch (nextError) {
      console.warn("Attachment open failed", nextError);
      setError(friendlyErrorMessage(nextError, "This attachment could not be opened."));
    }
  };

  return (
    <div style={checked ? checkedMaintenanceItem : maintenanceItem}>
      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
        <input type="checkbox" checked={checked} disabled={!canEdit} onChange={(event) => setChecked(event.target.checked)} style={{ marginTop: 3 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 900, fontSize: 13, lineHeight: 1.4 }}>{item.label}</div>
          <textarea value={notes} disabled={!canEdit} onChange={(event) => setNotes(event.target.value)} placeholder="Notes, repair needed, condition…" style={{ ...input, minHeight: 68, marginTop: 8 }} />
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
            {canEdit && <button onClick={save} disabled={saving} style={secondaryBtn}>{saving ? "Saving…" : "Save"}</button>}
            {canEdit && <label style={secondaryBtn}>
              Add photo/file
              <input type="file" accept="image/*,application/pdf" style={{ display: "none" }} onChange={(event) => attach(event.target.files?.[0])} />
            </label>}
            {canEdit && <span style={{ fontSize: 12, color: C.textMut, fontWeight: 800 }}>{saving ? "Saving…" : "Autosaves"}</span>}
            {item.attachments?.length ? <span style={{ fontSize: 12, color: C.textMut, fontWeight: 800 }}>{item.attachments.length} attachments</span> : null}
          </div>
          {error && <div style={{ marginTop: 8 }}><InlineAlert tone="danger">{error}</InlineAlert></div>}
          {item.attachments?.length ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {item.attachments.map((attachment) => (
                <button key={attachment.id} type="button" onClick={() => openAttachment(attachment)} style={{ ...chipButton, fontSize: 11 }}>
                  {attachment.file_name || "Attachment"}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </label>
    </div>
  );
}

function TemplateEditor({ templates, locationId, actor, onPublished, toast }) {
  const [templateId, setTemplateId] = useState("");
  const selected = templates.find((row) => row.id === templateId) || templates[0];
  const [text, setText] = useState("");
  const [changelog, setChangelog] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [startMonth, setStartMonth] = useState(1);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!selected) return;
    setTemplateId(selected.id);
    setText((selected.latest_version?.items || []).map((item) => item.label).join("\n"));
    setTemplateName(selected.name || "");
    setStartMonth(selected.start_month || 1);
    setDescription(selected.description || "");
  }, [selected?.id]);

  const publish = async () => {
    const previousItems = selected.latest_version?.items || [];
    const previousByLabel = new Map(previousItems.map((item) => [normalizeTemplateLabel(item.label), item]));
    const usedKeys = new Set();
    const items = text.split("\n").map((line) => line.trim()).filter(Boolean).map((label, index) => {
      const previous = previousByLabel.get(normalizeTemplateLabel(label));
      const key = previous?.key && !usedKeys.has(previous.key)
        ? previous.key
        : buildTemplateItemKey(selected.slug, label, usedKeys);
      usedKeys.add(key);
      return {
        key,
        label,
        sort_order: index + 1,
        is_required: previous?.is_required ?? true,
      };
    });
    setSaving(true);
    setError("");
    try {
      await publishMaintenanceTemplateVersion({
        templateId: selected.id,
        locationId,
        items,
        changelog: changelog || "Template edited from web",
        actorName: actor,
        templateName,
        startMonth: Number(startMonth) || 1,
        description,
      });
      toast("Template version published");
      setChangelog("");
      await onPublished();
    } catch (nextError) {
      console.warn("Template publish failed", nextError);
      setError(friendlyErrorMessage(nextError, "Template version could not be published."));
    } finally {
      setSaving(false);
    }
  };

  if (!selected) return null;
  return (
    <div style={subPanel}>
      <div style={sectionLabel}>Template editor</div>
      <select value={templateId} onChange={(event) => setTemplateId(event.target.value)} style={input}>
        {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
      </select>
      <input value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="Template name" style={{ ...input, marginTop: 8 }} />
      <label style={{ display: "grid", gap: 6, marginTop: 8, fontSize: 12, fontWeight: 900, color: C.textMut }}>
        Start month
        <select value={startMonth} onChange={(event) => setStartMonth(Number(event.target.value))} style={input}>
          {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
            <option key={month} value={month}>{new Date(2026, month - 1, 1).toLocaleDateString("en-US", { month: "long" })}</option>
          ))}
        </select>
      </label>
      <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Description" style={{ ...input, marginTop: 8 }} />
      <textarea value={text} onChange={(event) => setText(event.target.value)} style={{ ...input, minHeight: 160, marginTop: 8, fontFamily: "inherit" }} />
      <input value={changelog} onChange={(event) => setChangelog(event.target.value)} placeholder="Change note" style={{ ...input, marginTop: 8 }} />
      {error && <div style={{ marginTop: 8 }}><InlineAlert tone="danger">{error}</InlineAlert></div>}
      <button onClick={publish} disabled={saving} style={{ ...primaryBtn, width: "100%", marginTop: 8, opacity: saving ? 0.65 : 1 }}>{saving ? "Publishing..." : "Publish new version"}</button>
      <div style={{ marginTop: 8, fontSize: 11, color: C.textMut, lineHeight: 1.4 }}>Published versions update future periods and current open periods only. Submitted history keeps its original snapshot.</div>
    </div>
  );
}

function normalizeTemplateLabel(label = "") {
  return String(label).trim().replace(/\s+/g, " ").toLowerCase();
}

function buildTemplateItemKey(slug, label, usedKeys) {
  const base = `${slug}-${String(label).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "item"}`;
  let candidate = base;
  let suffix = 2;
  while (usedKeys.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function VendorsPanel({ tabsBar, explainer, locationId, actor, canManage, toast }) {
  const [vendors, setVendors] = useState([]);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!locationId) return;
    if (!silent) setLoading(true);
    try {
      const data = await withUpkeepTimeout(loadVendors(locationId, includeArchived), "Vendors took too long to load.");
      setVendors(data);
      setError("");
    } catch (nextError) {
      console.warn("Vendor load failed", nextError);
      setError(friendlyErrorMessage(nextError, "Vendors could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, [includeArchived, locationId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!locationId) return undefined;
    return subscribeToResortUpkeep(locationId, () => load({ silent: true }));
  }, [load, locationId]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return vendors
      .map((vendor) => ({ vendor, meta: upkeepVendorMeta(vendor), contact: primaryContact(vendor.contact_info) }))
      .filter(({ vendor, meta, contact }) => !needle || [meta.trade, vendor.business_name, contact.name, contact.phone, contact.email, meta.frequency].some((value) => String(value || "").toLowerCase().includes(needle)));
  }, [vendors, query]);

  const columns = useMemo(() => ([
    { key: "trade", header: "Trade", width: "minmax(110px, 1.1fr)", sortable: true, sortValue: (r) => r.meta.trade.toLowerCase(), render: (r) => <span style={{ fontWeight: 700, color: C.text, fontSize: 12, wordBreak: "break-word" }}>{r.meta.trade || "—"}</span> },
    { key: "company", header: "Company", width: "minmax(140px, 1.5fr)", sortable: true, sortValue: (r) => String(r.vendor.business_name).toLowerCase(), render: (r) => <span style={{ fontWeight: 700, color: C.pri, fontSize: 12, wordBreak: "break-word" }}>{r.vendor.business_name || "Untitled"}</span> },
    { key: "contact", header: "Contact", width: "minmax(96px, 1fr)", render: (r) => <span style={{ fontSize: 12, color: C.text }}>{r.contact.name || "—"}</span> },
    { key: "phone", header: "Phone", width: 122, render: (r) => <span style={{ fontSize: 12, color: C.text, whiteSpace: "nowrap" }}>{r.contact.phone ? fmtPhone(r.contact.phone) : "—"}</span> },
    { key: "email", header: "Email", width: "minmax(120px, 1.2fr)", render: (r) => <span style={{ fontSize: 11, color: C.textSec, wordBreak: "break-all" }}>{r.contact.email || "—"}</span> },
    { key: "contract", header: "Contract", width: 84, align: "center", sortable: true, sortValue: (r) => (r.vendor.has_contract ? 1 : 0), render: (r) => <SharedStatusPill tone={r.vendor.has_contract ? "success" : "neutral"}>{r.vendor.has_contract ? "Yes" : "No"}</SharedStatusPill> },
    { key: "frequency", header: "Frequency", width: 100, sortable: true, sortValue: (r) => r.meta.frequency, render: (r) => <span style={{ fontSize: 11, fontWeight: 700, color: C.textSec }}>{r.meta.frequency || "—"}</span> },
    { key: "cost", header: "Cost", width: 80, align: "end", sortable: true, sortValue: (r) => Number(r.meta.cost) || 0, render: (r) => <span style={{ fontSize: 12, fontWeight: 700, color: C.text, whiteSpace: "nowrap" }}>{r.meta.cost !== "" && r.meta.cost != null ? `$${r.meta.cost}` : "—"}</span> },
  ]), []);

  return (
    <div>
      <ListSurface>
      <ListSearchRow value={query} onChange={setQuery} placeholder="Search trade, company, contact…">
        <PillFilter active={includeArchived} onClick={() => setIncludeArchived((v) => !v)}>Archived</PillFilter>
        {canManage ? <button type="button" onClick={() => setImporting(true)} style={muSmallBtn}>Import</button> : null}
        {canManage ? <button type="button" onClick={() => setSelected(blankVendorRecord(locationId))} style={muSmallPrimary}>+ New</button> : null}
      </ListSearchRow>
      {tabsBar}
      {explainer}

      {error ? <div style={{ marginTop: 12 }}><InlineAlert tone="warning">{error} <button type="button" onClick={() => load()} style={inlineLinkButton}>Retry</button></InlineAlert></div> : null}

      <div style={{ marginTop: 12 }}>
        {loading ? <div style={{ display: "grid", gap: 10 }}><LoadingRows /></div> : (
          <DenseTable
            columns={columns}
            rows={rows}
            getRowKey={(r) => r.vendor.id}
            minWidth={820}
            style={{ border: "none", borderRadius: 0 }}
            onRowClick={canManage ? (r) => setSelected(r.vendor) : undefined}
            rowStyle={(r) => (r.vendor.is_archived ? { opacity: 0.55 } : null)}
            emptyText="No vendors yet. Add HVAC, plumbing, electrical, fire, pest, and utility contacts."
          />
        )}
      </div>
      </ListSurface>

      {selected ? (
        <VendorEditorModal
          vendor={selected}
          locationId={locationId}
          actor={actor}
          canManage={canManage}
          onClose={() => setSelected(null)}
          onSaved={async () => { if (toast) toast("Vendor saved"); setSelected(null); await load(); }}
        />
      ) : null}

      {importing ? (
        <VendorImportModal
          locationId={locationId}
          actor={actor}
          onClose={() => setImporting(false)}
          onDone={async (n) => { if (toast && n) toast(`Imported ${n} vendor${n === 1 ? "" : "s"}`); await load({ silent: true }); }}
        />
      ) : null}
    </div>
  );
}

function blankVendorRecord(locationId) {
  return { location_id: locationId, business_name: "", has_contract: false, contact_info: [], is_archived: false, metadata: { trade: "", frequency: "", cost: "" } };
}

// Upload any spreadsheet, auto-pair its columns, review/approve rows, then bulk
// insert. Built around the pure helpers in resortUpkeepData (no external API).
function VendorImportModal({ locationId, actor, onClose, onDone }) {
  const [step, setStep] = useState("upload"); // upload | review | importing | done
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const [tables, setTables] = useState([]); // [{ grid, headerRowIndex, columns, dataEnd, count }]
  const [tableIdx, setTableIdx] = useState(0);
  const [draftRows, setDraftRows] = useState([]); // editable vendor rows for the active table
  const [progress, setProgress] = useState(0);
  const [importedCount, setImportedCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);

  const cur = tables[tableIdx] || null;
  const fieldOptions = useMemo(() => [{ value: "", label: "Ignore" }, ...VENDOR_IMPORT_FIELDS.map((f) => ({ value: f, label: VENDOR_IMPORT_FIELD_LABELS[f] }))], []);
  const reseed = (table) => setDraftRows(table ? buildVendorRows(table.grid, table.headerRowIndex, table.columns, table.dataEnd) : []);

  const onFile = async (file) => {
    if (!file) return;
    setBusy(true); setError(""); setFileName(file.name || "");
    try {
      const sheets = await parseSpreadsheetGrids(file);
      const found = [];
      sheets.forEach(({ grid, merges }) => {
        detectVendorTables(grid, merges).forEach((t) => {
          if (!t.columns.length) return;
          const count = buildVendorRows(grid, t.headerRowIndex, t.columns, t.dataEnd).length;
          if (count) found.push({ grid, headerRowIndex: t.headerRowIndex, columns: t.columns, dataEnd: t.dataEnd, count });
        });
      });
      if (!found.length) {
        setError("We couldn't recognise a vendor table in that file. Download the standard template below, fill it in, then re-upload.");
        setBusy(false);
        return;
      }
      // Default to the richest table (rows x mapped columns), so a fuller main
      // table wins over a longer but sparser one.
      const score = (t) => t.count * Math.max(1, t.columns.filter((c) => c.field).length);
      let best = 0;
      found.forEach((t, i) => { if (score(t) > score(found[best])) best = i; });
      setTables(found); setTableIdx(best); reseed(found[best]); setStep("review");
    } catch {
      setError("That file could not be read. Upload an .xlsx or .csv file.");
    } finally {
      setBusy(false);
    }
  };

  const pickTable = (i) => { setTableIdx(i); reseed(tables[i]); };
  const setColField = (colArrayIndex, field) => {
    if (!cur) return;
    const updated = { ...cur, columns: cur.columns.map((c, ci) => (ci !== colArrayIndex ? c : { ...c, field: field || null })) };
    setTables((prev) => prev.map((t, i) => (i === tableIdx ? updated : t)));
    reseed(updated);
  };
  const updateRow = (i, key, value) => setDraftRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));
  const removeRow = (i) => setDraftRows((prev) => prev.filter((_r, idx) => idx !== i));

  const downloadTemplate = async () => {
    try {
      const blob = await buildVendorTemplateBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "vendor-import-template.xlsx";
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch {
      setError("The template could not be generated.");
    }
  };

  const runImport = async () => {
    const toImport = draftRows.filter((r) => r.company || r.trade);
    if (!toImport.length) return;
    setStep("importing"); setProgress(0); setImportedCount(0); setFailedCount(0);
    let done = 0; let fail = 0;
    for (let i = 0; i < toImport.length; i += 4) {
      const chunk = toImport.slice(i, i + 4);
      // eslint-disable-next-line no-await-in-loop
      await Promise.all(chunk.map((r) => saveVendor({
        location_id: locationId,
        business_name: r.company || r.trade,
        has_contract: !!r.contract,
        contact_info: mergePrimaryContact([], { name: r.contact, role: "", phone: r.phone, email: r.email, notes: "" }),
        is_archived: false,
        metadata: { trade: r.trade, frequency: r.frequency, cost: r.cost === "" ? "" : Number(r.cost) },
      }, actor).then(() => { done += 1; }).catch(() => { fail += 1; }).finally(() => setProgress(done + fail))));
    }
    setImportedCount(done); setFailedCount(fail); setStep("done");
    await onDone(done);
  };

  if (step === "importing") {
    const total = draftRows.length || progress;
    return (
      <UpkeepModal title="Importing vendors" onClose={() => {}} maxWidth={520}>
        <div style={{ fontSize: 13, color: C.textSec }}>Adding vendors to this location…</div>
        <div style={muProgressTrack}><div style={{ height: "100%", width: `${total ? Math.round((progress / total) * 100) : 0}%`, background: C.pri, transition: "width 0.2s" }} /></div>
        <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: C.textMut }}>{progress} of {total}</div>
      </UpkeepModal>
    );
  }

  if (step === "done") {
    return (
      <UpkeepModal title="Import complete" onClose={onClose} maxWidth={520} footer={<><div style={{ flex: 1 }} /><button type="button" onClick={onClose} style={primaryBtn}>Done</button></>}>
        <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>Imported {importedCount} vendor{importedCount === 1 ? "" : "s"}.</div>
        {failedCount ? <div style={{ marginTop: 6, fontSize: 12, fontWeight: 600, color: C.warn }}>{failedCount} row{failedCount === 1 ? "" : "s"} could not be saved and were skipped.</div> : null}
        <div style={{ marginTop: 8, fontSize: 12, color: C.textMut }}>Open any vendor by clicking its row to review or edit the details.</div>
      </UpkeepModal>
    );
  }

  if (step === "upload") {
    return (
      <UpkeepModal title="Import vendors" subtitle="Upload an Excel or CSV file. Columns are detected automatically, so messy non-standard sheets still work." onClose={onClose} maxWidth={560}>
        <label style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, padding: "30px 16px", border: `1.5px dashed ${C.border}`, borderRadius: 12, background: C.surfaceHover, cursor: busy ? "default" : "pointer", textAlign: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{busy ? "Reading file…" : "Choose a file"}</div>
          <div style={{ fontSize: 12, color: C.textMut }}>.xlsx or .csv</div>
          <input type="file" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" style={{ display: "none" }} disabled={busy} onChange={(e) => onFile(e.target.files?.[0] || null)} />
        </label>
        {error ? <div style={{ marginTop: 12 }}><InlineAlert tone="warning">{error}</InlineAlert></div> : null}
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.borderLight}`, fontSize: 12, color: C.textMut }}>
          Prefer a clean start? <button type="button" onClick={downloadTemplate} style={inlineLinkButton}>Download the standard template</button> (Excel with Frequency and Contract dropdowns built in), fill it in, and upload it here.
        </div>
      </UpkeepModal>
    );
  }

  const yesNo = ["Yes", "No"];
  const textCell = (i, key, ph) => (
    <input value={draftRows[i][key]} onChange={(e) => updateRow(i, key, e.target.value)} placeholder={ph} style={impCellInput} onFocus={impCellFocus} onBlur={impCellBlur} />
  );
  return (
    <UpkeepModal
      title="Review import"
      subtitle={fileName ? `From ${fileName}` : undefined}
      onClose={onClose}
      maxWidth={920}
      footer={(
        <>
          <button type="button" onClick={() => { setStep("upload"); setTables([]); setDraftRows([]); setError(""); }} style={secondaryBtn}>Choose another file</button>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: C.textMut }}>{draftRows.length} vendor{draftRows.length === 1 ? "" : "s"}</span>
          <button type="button" onClick={runImport} disabled={!draftRows.length} style={{ ...primaryBtn, opacity: draftRows.length ? 1 : 0.6 }}>Import {draftRows.length} vendor{draftRows.length === 1 ? "" : "s"}</button>
        </>
      )}
    >
      {tables.length > 1 ? (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: C.textMut, marginBottom: 6 }}>Tables found in this file</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {tables.map((t, i) => <button key={i} type="button" onClick={() => pickTable(i)} title={t.columns.map((c) => c.header).filter(Boolean).slice(0, 5).join(", ")} style={i === tableIdx ? muSmallPrimary : muSmallBtn}>Table {i + 1} · {t.count}</button>)}
          </div>
        </div>
      ) : null}

      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: C.textMut, marginBottom: 8 }}>Column mapping</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 8, marginBottom: 18 }}>
        {(cur?.columns || []).map((c, ci) => {
          const period = c.servicePeriod || c.feePeriod;
          return (
            <div key={ci} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 10px", background: "#fff" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textSec, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={c.header}>{c.header || `Column ${c.index + 1}`}</div>
              {period ? (
                <div style={{ marginTop: 5, fontSize: 12, fontWeight: 700, color: C.pri }}>{c.servicePeriod ? `Frequency · ${c.servicePeriod} service` : `Cost · ${c.feePeriod} fee`}</div>
              ) : (
                <div style={{ marginTop: 5 }}><CustomSelect small value={c.field || ""} onChange={(v) => setColField(ci, v)} options={fieldOptions} placeholder="Ignore" /></div>
              )}
            </div>
          );
        })}
      </div>

      {draftRows.length ? (
        <>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: C.textMut, marginBottom: 8 }}>Preview · edit any cell, remove rows you don't want</div>
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
            <div style={{ maxHeight: 340, overflow: "auto" }}>
              <table style={{ borderCollapse: "collapse", fontSize: 11.5, minWidth: 860, width: "100%" }}>
                <thead>
                  <tr>
                    {["Trade", "Company", "Contact", "Phone", "Email", "Frequency", "Cost", "Contract", ""].map((h, hi) => (
                      <th key={hi} style={{ ...impTh, position: "sticky", top: 0, zIndex: 1, background: C.surfaceHover, borderBottom: `1px solid ${C.border}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {draftRows.map((r, i) => (
                    <tr key={i} style={{ borderTop: `1px solid ${C.borderLight}` }}>
                      <td style={impTd}>{textCell(i, "trade", "Add trade")}</td>
                      <td style={{ ...impTd, minWidth: 140 }}>{textCell(i, "company", "Add company")}</td>
                      <td style={impTd}>{textCell(i, "contact", "Add contact")}</td>
                      <td style={impTd}>{textCell(i, "phone", "Add phone")}</td>
                      <td style={{ ...impTd, minWidth: 150 }}>{textCell(i, "email", "Add email")}</td>
                      <td style={{ ...impTd, minWidth: 116 }}><CustomSelect small value={r.frequency} onChange={(v) => updateRow(i, "frequency", v)} options={UPKEEP_SERVICE_FREQUENCIES} placeholder="Set" /></td>
                      <td style={{ ...impTd, minWidth: 84 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                          <span style={{ fontSize: 11, color: C.textMut }}>$</span>
                          <input value={r.cost} onChange={(e) => updateRow(i, "cost", e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" onWheel={(e) => e.currentTarget.blur()} placeholder="0" style={impCellInput} onFocus={impCellFocus} onBlur={impCellBlur} />
                        </div>
                      </td>
                      <td style={{ ...impTd, minWidth: 88 }}><CustomSelect small value={r.contract ? "Yes" : "No"} onChange={(v) => updateRow(i, "contract", v === "Yes")} options={yesNo} placeholder="No" /></td>
                      <td style={{ ...impTd, textAlign: "center" }}>
                        <button type="button" onClick={() => removeRow(i)} title="Remove row" style={{ border: "none", background: "transparent", color: C.textMut, cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "2px 6px", fontFamily: "inherit" }}>×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <InlineAlert tone="warning">No vendor rows detected on this table. Set a Trade or Company column in the mapping above, switch tables, or <button type="button" onClick={downloadTemplate} style={inlineLinkButton}>download the standard template</button>.</InlineAlert>
      )}
    </UpkeepModal>
  );
}

function VendorEditorModal({ vendor, locationId, actor, canManage, onClose, onSaved }) {
  const meta0 = upkeepVendorMeta(vendor);
  const contact0 = primaryContact(vendor.contact_info);
  const [trade, setTrade] = useState(meta0.trade);
  const [company, setCompany] = useState(vendor.business_name || "");
  const [contactName, setContactName] = useState(contact0.name);
  const [phone, setPhone] = useState(contact0.phone);
  const [email, setEmail] = useState(contact0.email);
  const [hasContract, setHasContract] = useState(!!vendor.has_contract);
  const [frequency, setFrequency] = useState(meta0.frequency);
  const [cost, setCost] = useState(meta0.cost === "" || meta0.cost == null ? "" : String(meta0.cost));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [contractFile, setContractFile] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [logs, setLogs] = useState([]);
  const [audit, setAudit] = useState([]);
  const [logSummary, setLogSummary] = useState("");
  const [logNote, setLogNote] = useState("");

  useEffect(() => {
    if (!vendor.id) return undefined;
    let cancelled = false;
    Promise.all([
      loadResortUpkeepAttachments(locationId, { vendor_id: vendor.id }).catch(() => []),
      loadVendorLogs(locationId, vendor.id).catch(() => []),
      loadResortUpkeepAuditEvents(locationId, { entity_type: "resort_upkeep_vendors", entity_id: vendor.id }).catch(() => []),
    ]).then(([att, lg, ev]) => { if (!cancelled) { setAttachments(att); setLogs(lg); setAudit(ev); } });
    return () => { cancelled = true; };
  }, [vendor.id, locationId]);

  const contractFiles = attachments.filter((a) => a.attachment_scope === "vendor_contract" && !a.deleted_at);

  const save = async () => {
    if (!canManage) { setError("Only managers can save vendors."); return; }
    if (!company.trim() && !trade.trim()) { setError("Add a trade or company name."); return; }
    if (hasContract && !contractFile && contractFiles.length === 0) { setError("Upload the contract document, or turn off Contract on file."); return; }
    setSaving(true);
    setError("");
    try {
      const payload = {
        ...(vendor.id ? { id: vendor.id } : {}),
        location_id: vendor.location_id || locationId,
        business_name: company.trim() || trade.trim(),
        has_contract: hasContract,
        contact_info: mergePrimaryContact(vendor.contact_info, { name: contactName, role: "", phone, email, notes: "" }),
        is_archived: !!vendor.is_archived,
        metadata: { ...(vendor.metadata || {}), trade: trade.trim(), frequency, cost: cost === "" ? "" : Number(cost) },
      };
      const saved = await saveVendor(payload, actor);
      if (hasContract && contractFile) {
        const uploaded = await uploadResortUpkeepAttachment({ locationId: saved.location_id, file: contractFile, pathParts: ["vendors", saved.id, "contracts"] });
        await recordResortUpkeepAttachment({ locationId: saved.location_id, attachmentScope: "vendor_contract", vendorId: saved.id, file: contractFile, fileName: contractFile.name || uploaded.safeName, storagePath: uploaded.path, actorName: actor });
      }
      if (logSummary || logNote) await addVendorLog({ location_id: saved.location_id, vendor_id: saved.id, summary: logSummary || "Vendor update", notes: logNote }, actor);
      await onSaved();
    } catch (e) {
      setError(friendlyErrorMessage(e, "Vendor could not be saved."));
      setSaving(false);
    }
  };

  const archive = async () => {
    if (!vendor.id) return;
    setSaving(true);
    try { await archiveVendor(vendor.id, "Archived from web", actor); await onSaved(); }
    catch (e) { setError(friendlyErrorMessage(e, "Vendor could not be archived.")); setSaving(false); }
  };

  const openAttachment = async (a) => { try { const url = await createResortUpkeepSignedUrl(a); if (url) window.open(url, "_blank", "noopener,noreferrer"); } catch { /* non-blocking */ } };

  return (
    <UpkeepModal
      title={vendor.id ? "Edit vendor" : "New vendor"}
      onClose={onClose}
      footer={(
        <>
          <div style={{ flex: 1 }}>{vendor.id && !vendor.is_archived ? <button type="button" onClick={archive} disabled={saving} style={secondaryBtn}>Archive</button> : null}</div>
          <button type="button" onClick={save} disabled={saving || !canManage} style={{ ...primaryBtn, opacity: saving || !canManage ? 0.6 : 1 }}>{saving ? "Saving…" : "Save vendor"}</button>
        </>
      )}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>
        <MField label="Trade"><input value={trade} onChange={(e) => setTrade(e.target.value)} placeholder="Electrical, HVAC, Fire…" style={input} /></MField>
        <MField label="Company name"><input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company" style={input} /></MField>
        <MField label="Contact"><input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Contact person" style={input} /></MField>
        <MField label="Phone"><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 555-5555" style={input} /></MField>
        <MField label="Email"><input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" style={input} /></MField>
        <MField label="Frequency">
          <CustomSelect value={frequency} onChange={setFrequency} options={UPKEEP_SERVICE_FREQUENCIES} placeholder="Select frequency" />
        </MField>
        <MField label="Cost" hint="$ per the selected frequency.">
          <input value={cost} onChange={(e) => setCost(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" onWheel={(e) => e.currentTarget.blur()} placeholder="0" style={input} />
        </MField>
      </div>

      <div style={{ marginTop: 2, marginBottom: 14, padding: 12, border: `1px solid ${C.border}`, borderRadius: 12, background: C.surfaceHover }}>
        <ToggleSwitch checked={hasContract} onChange={setHasContract} label={hasContract ? "Contract on file" : "No contract"} />
        {hasContract ? (
          <div style={{ marginTop: 10 }}>
            <label style={{ ...secondaryBtn, display: "inline-flex", justifyContent: "center" }}>
              {contractFile ? contractFile.name : "Upload contract (PDF)"}
              <input type="file" accept="image/*,application/pdf" style={{ display: "none" }} onChange={(e) => setContractFile(e.target.files?.[0] || null)} />
            </label>
            {contractFiles.length ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {contractFiles.map((a) => <button key={a.id} type="button" onClick={() => openAttachment(a)} style={muSmallBtn}>{a.file_name ? String(a.file_name).slice(0, 24) : "Contract"}</button>)}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {vendor.id ? (
        <>
          <MField label="Add update / log">
            <input value={logSummary} onChange={(e) => setLogSummary(e.target.value)} placeholder="Summary (e.g. Renegotiated rate)" style={{ ...input, marginBottom: 6 }} />
            <input value={logNote} onChange={(e) => setLogNote(e.target.value)} placeholder="Note (optional)" style={input} />
          </MField>
          {(logs.length || audit.length) ? (
            <div style={{ marginBottom: 4 }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: C.textMut, marginBottom: 8 }}>History</div>
              <div style={{ display: "grid", gap: 6 }}>
                {logs.slice(0, 4).map((lg) => (
                  <div key={`lg-${lg.id}`} style={{ padding: 9, borderRadius: 8, background: C.surfaceHover }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{lg.summary}</div>
                    {lg.notes ? <div style={{ marginTop: 2, fontSize: 11, color: C.textMut }}>{lg.notes}</div> : null}
                    <div style={{ marginTop: 2, fontSize: 10, color: C.textMut }}>{lg.created_by_name || ""}{lg.created_at ? ` · ${fmtAuditDate(lg.created_at)}` : ""}</div>
                  </div>
                ))}
                {audit.slice(0, 5).map((ev) => (
                  <div key={`ev-${ev.id}`} style={{ padding: "7px 9px", borderRadius: 8, background: "#fff", border: `1px solid ${C.borderLight}` }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.textSec }}>{ev.summary || fmtUpkeepStatus(ev.event_type)}</div>
                    <div style={{ marginTop: 1, fontSize: 10, color: C.textMut }}>{ev.actor_name || "System"}{ev.event_at ? ` · ${fmtAuditDate(ev.event_at)}` : ""}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {error ? <div style={{ marginTop: 4 }}><InlineAlert tone="danger">{error}</InlineAlert></div> : null}
    </UpkeepModal>
  );
}

function ToggleSwitch({ checked, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} style={{ display: "inline-flex", alignItems: "center", gap: 10, border: "none", background: "none", cursor: "pointer", fontFamily: "inherit", padding: 0 }}>
      <span style={{ width: 40, height: 23, borderRadius: 999, background: checked ? C.pri : C.border, position: "relative", transition: "background 0.15s", flexShrink: 0 }}>
        <span style={{ position: "absolute", top: 2, left: checked ? 19 : 2, width: 19, height: 19, borderRadius: "50%", background: "#fff", transition: "left 0.15s", boxShadow: "0 1px 2px rgba(0,0,0,0.25)" }} />
      </span>
      <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{label}</span>
    </button>
  );
}

function VendorEditor({ vendor, actor, canManage, onClose, onSaved }) {
  const [draft, setDraft] = useState({ ...vendor, contact_info: vendor.contact_info || [] });
  const [contactDraft, setContactDraft] = useState(primaryContact(vendor.contact_info));
  const [logs, setLogs] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [auditEvents, setAuditEvents] = useState([]);
  const [summary, setSummary] = useState("");
  const [notes, setNotes] = useState("");
  const [contractFile, setContractFile] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!draft.id) return undefined;
    let cancelled = false;
    withUpkeepTimeout(
      Promise.all([
        loadVendorLogs(draft.location_id, draft.id),
        loadResortUpkeepAttachments(draft.location_id, { vendor_id: draft.id }),
        loadResortUpkeepAuditEvents(draft.location_id, { entity_type: "resort_upkeep_vendors", entity_id: draft.id }),
      ]),
      "Vendor detail history took too long to load."
    )
      .then(([nextLogs, nextAttachments, nextAuditEvents]) => {
        if (cancelled) return;
        setLogs(nextLogs);
        setAttachments(nextAttachments);
        setAuditEvents(nextAuditEvents);
      })
      .catch((nextError) => {
        console.warn("Vendor detail load failed", nextError);
        if (!cancelled) setError(friendlyErrorMessage(nextError, "Vendor detail history could not be loaded."));
      });
    return () => { cancelled = true; };
  }, [draft.id, draft.location_id]);
  useEffect(() => {
    if (draft.id || draft.business_name.trim().length < 3) {
      setSuggestions([]);
      return undefined;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const rows = await withUpkeepTimeout(
          searchGoogleVendors(draft.business_name.trim()),
          "Vendor search took too long to load.",
          8000
        );
        if (!cancelled) setSuggestions(rows);
      } catch (nextError) {
        console.warn("Vendor search failed", nextError);
        if (!cancelled) setSuggestions([]);
      }
    }, 260);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [draft.business_name, draft.id]);
  const choosePlace = async (prediction) => {
    try {
      const place = await withUpkeepTimeout(
        getGoogleVendorDetails(prediction.place_id),
        "Vendor place details took too long to load.",
        8000
      );
      if (!place) return;
      setSuggestions([]);
      setDraft((current) => ({
        ...current,
        business_name: place.name || prediction.structured_formatting?.main_text || current.business_name,
        website: place.website || current.website || "",
        ...parsePlaceAddress(place),
      }));
    } catch (nextError) {
      console.warn("Vendor place selection failed", nextError);
      setError(friendlyErrorMessage(nextError, "Vendor details could not be imported."));
    }
  };
  const save = async () => {
    if (!canManage) {
      setError("Only managers can save vendors.");
      return;
    }
    if (!draft.business_name.trim()) {
      setError("Business name is required.");
      return;
    }
    setError("");
    const hasContractAttachment = attachments.some((attachment) => attachment.attachment_scope === "vendor_contract" && !attachment.deleted_at);
    if (draft.has_contract && !contractFile && !hasContractAttachment) {
      setError("Upload the contract before marking this vendor contract on file.");
      return;
    }
    const needsContractBeforeFlag = draft.has_contract && contractFile;
    const nextVendor = { ...draft, contact_info: mergePrimaryContact(draft.contact_info, contactDraft) };
    setSaving(true);
    try {
      const saved = await saveVendor(needsContractBeforeFlag ? { ...nextVendor, has_contract: false } : nextVendor, actor);
      let finalSaved = saved;
      if (needsContractBeforeFlag) {
        const uploaded = await uploadResortUpkeepAttachment({ locationId: saved.location_id, file: contractFile, pathParts: ["vendors", saved.id, "contracts"] });
        await recordResortUpkeepAttachment({ locationId: saved.location_id, attachmentScope: "vendor_contract", vendorId: saved.id, file: contractFile, fileName: contractFile.name || uploaded.safeName, storagePath: uploaded.path, actorName: actor });
        finalSaved = await saveVendor({ ...nextVendor, id: saved.id, location_id: saved.location_id, has_contract: true }, actor);
      }
      if (summary || notes) await addVendorLog({ location_id: finalSaved.location_id, vendor_id: finalSaved.id, summary: summary || "Vendor update", notes }, actor);
      await onSaved();
    } catch (nextError) {
      console.warn("Vendor save failed", nextError);
      setError(friendlyErrorMessage(nextError, "Vendor could not be saved."));
    } finally {
      setSaving(false);
    }
  };
  const archive = async () => {
    if (!canManage) {
      setError("Only managers can archive vendors.");
      return;
    }
    if (!draft.id) return;
    setSaving(true);
    try {
      await archiveVendor(draft.id, "Archived from web", actor);
      await onSaved();
    } catch (nextError) {
      console.warn("Vendor archive failed", nextError);
      setError(friendlyErrorMessage(nextError, "Vendor could not be archived."));
    } finally {
      setSaving(false);
    }
  };
  return (
    <EditorShell title={draft.id ? "Edit vendor" : "New vendor"} onClose={onClose}>
      <Field label="Business name" value={draft.business_name} onChange={(business_name) => setDraft((d) => ({ ...d, business_name }))} />
      {suggestions.length > 0 && (
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
          {suggestions.map((prediction) => (
            <button key={prediction.place_id} type="button" onClick={() => choosePlace(prediction)} style={{ ...cardButton, border: 0, borderBottom: `1px solid ${C.borderLight}`, borderRadius: 0 }}>
              <div style={{ fontWeight: 900 }}>{prediction.structured_formatting?.main_text || prediction.description}</div>
              <div style={{ marginTop: 3, color: C.textMut, fontSize: 12 }}>{prediction.structured_formatting?.secondary_text || "Google Places"}</div>
            </button>
          ))}
        </div>
      )}
      <Field label="Address" value={draft.business_address || ""} onChange={(business_address) => setDraft((d) => ({ ...d, business_address }))} />
      <Field label="Website" value={draft.website || ""} onChange={(website) => setDraft((d) => ({ ...d, website }))} />
      <label style={checkRow}><input type="checkbox" checked={!!draft.has_contract} onChange={(event) => setDraft((d) => ({ ...d, has_contract: event.target.checked }))} /> Contract on file</label>
      {draft.has_contract && <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}><Field label="Effective start" type="date" value={draft.contract_effective_start || ""} onChange={(contract_effective_start) => setDraft((d) => ({ ...d, contract_effective_start }))} /><Field label="Effective end" type="date" value={draft.contract_effective_end || ""} onChange={(contract_effective_end) => setDraft((d) => ({ ...d, contract_effective_end }))} /></div>}
      {draft.has_contract && <FileField label="Contract upload" file={contractFile} onFile={setContractFile} />}
      <AttachmentList title="Vendor files" attachments={attachments} />
      <ContactEditor title="Primary contact" contact={contactDraft} setContact={setContactDraft} />
      <Field label="Notes" value={draft.notes || ""} onChange={(notesText) => setDraft((d) => ({ ...d, notes: notesText }))} multiline />
      <LogComposer summary={summary} setSummary={setSummary} notes={notes} setNotes={setNotes} logs={logs} />
      <AuditTrail title="Vendor activity log" events={auditEvents} />
      {error && <div style={{ padding: 10, borderRadius: 12, background: "#FEF2F2", color: "#991B1B", fontSize: 12, fontWeight: 900 }}>{error}</div>}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        {draft.id && !draft.is_archived && canManage && <button onClick={archive} disabled={saving} style={secondaryBtn}>Archive</button>}
        <button onClick={save} disabled={!canManage || saving} style={{ ...primaryBtn, opacity: saving || !canManage ? 0.65 : 1 }}>{saving ? "Saving..." : "Save Vendor"}</button>
      </div>
    </EditorShell>
  );
}

function LicensesPanel({ tabsBar, explainer, locationId, actor, canManage, toast }) {
  const [licenses, setLicenses] = useState([]);
  const [logCounts, setLogCounts] = useState({});
  const [includeInactive, setIncludeInactive] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!locationId) return;
    if (!silent) setLoading(true);
    try {
      const [data, lc] = await withUpkeepTimeout(
        Promise.all([loadLicenses(locationId, includeInactive), loadLicenseLogCounts(locationId).catch(() => ({}))]),
        "Licenses took too long to load."
      );
      setLicenses(data);
      setLogCounts(lc || {});
      setError("");
    } catch (nextError) {
      console.warn("License load failed", nextError);
      setError(friendlyErrorMessage(nextError, "Licenses could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, [includeInactive, locationId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!locationId) return undefined;
    return subscribeToResortUpkeep(locationId, () => load({ silent: true }));
  }, [load, locationId]);

  const counts = useMemo(() => ({
    all: licenses.length,
    compliant: licenses.filter((l) => l.status === "compliant").length,
    non_compliant: licenses.filter((l) => l.status === "non_compliant").length,
  }), [licenses]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return licenses
      .filter((l) => (statusFilter === "all" ? true : l.status === statusFilter))
      .filter((l) => !needle || [l.requirement_name, l.issuing_organization, upkeepLicenseMeta(l).frequency].some((v) => String(v || "").toLowerCase().includes(needle)));
  }, [licenses, statusFilter, query]);

  const today = todayStr();
  const columns = useMemo(() => ([
    { key: "license", header: "License", width: "minmax(150px, 1.8fr)", sortable: true, sortValue: (l) => String(l.requirement_name).toLowerCase(),
      render: (l) => (
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: C.pri, fontSize: 12, wordBreak: "break-word" }}>{l.requirement_name || "Untitled"}</div>
          {l.issuing_organization ? <div style={{ marginTop: 2, fontSize: 11, color: C.textMut }}>{l.issuing_organization}</div> : null}
        </div>
      ) },
    { key: "frequency", header: "Frequency", width: 104, sortable: true, sortValue: (l) => upkeepLicenseMeta(l).frequency, render: (l) => <span style={{ fontSize: 11, fontWeight: 700, color: C.textSec }}>{upkeepLicenseMeta(l).frequency || "—"}</span> },
    { key: "due", header: "Due date", width: "minmax(110px, 1fr)", sortable: true, sortValue: (l) => l.expiration_date || l.next_expected_date || "9999",
      render: (l) => {
        const d = l.expiration_date || l.next_expected_date;
        if (!d) return <span style={{ fontSize: 11, color: C.textMut }}>—</span>;
        const days = Math.round((new Date(`${String(d).slice(0, 10)}T12:00:00`) - new Date(`${today}T12:00:00`)) / 86400000);
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.text, whiteSpace: "nowrap" }}>{fmtUpkeepDate(d)}</span>
            {days < 0 ? <StackBadge tone="danger">{`Overdue ${Math.abs(days)}d`}</StackBadge> : days <= 30 ? <StackBadge tone="warning">{`Due in ${days}d`}</StackBadge> : null}
          </div>
        );
      } },
    { key: "status", header: "Status", width: 118, render: (l) => <SharedStatusPill tone={l.is_active === false ? "neutral" : l.status === "compliant" ? "success" : "danger"}>{l.is_active === false ? "Inactive" : l.status === "compliant" ? "Compliant" : "Non-compliant"}</SharedStatusPill> },
    { key: "update", header: "Update", width: 96, align: "center", render: (l) => (
      <button type="button" onClick={(e) => { e.stopPropagation(); setSelected(l); }} style={{ ...muSmallBtn, padding: "3px 8px", fontSize: 11 }} title="View / add log entries">
        Log{logCounts[l.id] ? ` · ${logCounts[l.id]}` : ""}
      </button>
    ) },
  ]), [logCounts, today]);

  return (
    <div>
      <ListSearchRow value={query} onChange={setQuery} placeholder="Search licenses…">
        <PillFilter active={statusFilter === "all"} count={counts.all} onClick={() => setStatusFilter("all")}>All</PillFilter>
        <PillFilter active={statusFilter === "non_compliant"} count={counts.non_compliant} variant="solid" color={C.dan} onClick={() => setStatusFilter(statusFilter === "non_compliant" ? "all" : "non_compliant")}>Non-compliant</PillFilter>
        <PillFilter active={statusFilter === "compliant"} count={counts.compliant} onClick={() => setStatusFilter(statusFilter === "compliant" ? "all" : "compliant")}>Compliant</PillFilter>
        <PillSeparator />
        <PillFilter active={includeInactive} onClick={() => setIncludeInactive((v) => !v)}>Inactive</PillFilter>
        {canManage ? <button type="button" onClick={() => setSelected(blankLicenseRecord(locationId))} style={muSmallPrimary}>+ New</button> : null}
      </ListSearchRow>
      {tabsBar}
      {explainer}

      {error ? <div style={{ marginTop: 12 }}><InlineAlert tone="warning">{error} <button type="button" onClick={() => load()} style={inlineLinkButton}>Retry</button></InlineAlert></div> : null}

      <div style={{ marginTop: 12 }}>
        {loading ? <div style={{ display: "grid", gap: 10 }}><LoadingRows /></div> : (
          <DenseTable
            columns={columns}
            rows={rows}
            getRowKey={(l) => l.id}
            minWidth={720}
            onRowClick={canManage ? (l) => setSelected(l) : undefined}
            rowStyle={(l) => (l.is_active === false ? { opacity: 0.55 } : null)}
            emptyText="No licenses yet. Add permits and compliance requirements that need renewal tracking."
          />
        )}
      </div>

      {selected ? (
        <LicenseEditorModal
          license={selected}
          locationId={locationId}
          actor={actor}
          canManage={canManage}
          onClose={() => setSelected(null)}
          onSaved={async () => { if (toast) toast("License saved"); setSelected(null); await load(); }}
        />
      ) : null}
    </div>
  );
}

function blankLicenseRecord(locationId) {
  return { location_id: locationId, requirement_name: "", issuing_organization: "", status: "non_compliant", expiration_date: "", next_expected_date: "", contact_info: [], website_links: [], is_active: true, metadata: { frequency: "" } };
}

function LicenseEditorModal({ license, locationId, actor, canManage, onClose, onSaved }) {
  const meta0 = upkeepLicenseMeta(license);
  const [name, setName] = useState(license.requirement_name || "");
  const [org, setOrg] = useState(license.issuing_organization || "");
  const [frequency, setFrequency] = useState(meta0.frequency);
  const [due, setDue] = useState(license.expiration_date || "");
  const [status, setStatus] = useState(license.status === "compliant" ? "compliant" : "non_compliant");
  const [attachments, setAttachments] = useState([]);
  const [logs, setLogs] = useState([]);
  const [logSummary, setLogSummary] = useState("");
  const [logNote, setLogNote] = useState("");
  const [evidenceFile, setEvidenceFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!license.id) return undefined;
    let cancelled = false;
    Promise.all([
      loadResortUpkeepAttachments(locationId, { license_id: license.id }).catch(() => []),
      loadLicenseLogs(locationId, license.id).catch(() => []),
    ]).then(([att, lg]) => { if (!cancelled) { setAttachments(att); setLogs(lg); } });
    return () => { cancelled = true; };
  }, [license.id, locationId]);

  const hasEvidence = attachments.some((a) => a.attachment_scope === "license_evidence" && !a.deleted_at) || !!evidenceFile;

  const save = async () => {
    if (!canManage) { setError("Only managers can save licenses."); return; }
    if (!name.trim()) { setError("License name is required."); return; }
    if (status === "compliant" && !hasEvidence) { setError("Attach a compliance document before marking compliant."); return; }
    setSaving(true);
    setError("");
    try {
      const base = {
        ...(license.id ? { id: license.id } : {}),
        location_id: license.location_id || locationId,
        requirement_name: name.trim(),
        issuing_organization: org.trim(),
        expiration_date: due || null,
        is_active: license.is_active !== false,
        metadata: { ...(license.metadata || {}), frequency },
      };
      const needsEvidenceFirst = status === "compliant" && evidenceFile;
      const saved = await saveLicense({ ...base, status: needsEvidenceFirst ? "non_compliant" : status }, actor);
      let final = saved;
      if (needsEvidenceFirst) {
        const uploaded = await uploadResortUpkeepAttachment({ locationId: saved.location_id, file: evidenceFile, pathParts: ["licenses", saved.id, "evidence"] });
        await recordResortUpkeepAttachment({ locationId: saved.location_id, attachmentScope: "license_evidence", licenseId: saved.id, file: evidenceFile, fileName: evidenceFile.name || uploaded.safeName, storagePath: uploaded.path, actorName: actor });
        final = await saveLicense({ ...base, id: saved.id, status: "compliant" }, actor);
      }
      if (logSummary || logNote) await addLicenseLog({ location_id: final.location_id, license_id: final.id, summary: logSummary || "License update", notes: logNote, status_snapshot: final.status }, actor);
      await onSaved();
    } catch (e) {
      setError(friendlyErrorMessage(e, "License could not be saved."));
      setSaving(false);
    }
  };

  const deactivate = async () => {
    if (!license.id) return;
    setSaving(true);
    try { await deactivateLicense(license.id, "Deactivated from web", actor); await onSaved(); }
    catch (e) { setError(friendlyErrorMessage(e, "License could not be deactivated.")); setSaving(false); }
  };

  const openAttachment = async (a) => { try { const url = await createResortUpkeepSignedUrl(a); if (url) window.open(url, "_blank", "noopener,noreferrer"); } catch { /* non-blocking */ } };

  return (
    <UpkeepModal
      title={license.id ? "Edit license" : "New license"}
      onClose={onClose}
      footer={(
        <>
          <div style={{ flex: 1 }}>{license.id && license.is_active !== false ? <button type="button" onClick={deactivate} disabled={saving} style={secondaryBtn}>Deactivate</button> : null}</div>
          <button type="button" onClick={save} disabled={saving || !canManage} style={{ ...primaryBtn, opacity: saving || !canManage ? 0.6 : 1 }}>{saving ? "Saving…" : "Save license"}</button>
        </>
      )}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" }}>
        <MField label="License"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Fire inspection, Kennel permit…" style={input} /></MField>
        <MField label="Issuing organization"><input value={org} onChange={(e) => setOrg(e.target.value)} placeholder="City, State, vendor…" style={input} /></MField>
        <MField label="Frequency">
          <CustomSelect value={frequency} onChange={setFrequency} options={UPKEEP_SERVICE_FREQUENCIES} placeholder="Select frequency" />
        </MField>
        <MField label="Due date"><input value={due} onChange={(e) => setDue(e.target.value)} type="date" style={input} /></MField>
      </div>
      <MField label="Compliance">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, textTransform: "none", letterSpacing: 0 }}>
          <button type="button" onClick={() => setStatus("compliant")} style={status === "compliant" ? primaryBtn : secondaryBtn}>Compliant</button>
          <button type="button" onClick={() => setStatus("non_compliant")} style={status === "non_compliant" ? dangerBtn : secondaryBtn}>Non-compliant</button>
        </div>
      </MField>
      <MField label="Compliance document" hint="Required to mark compliant.">
        <label style={{ ...secondaryBtn, display: "inline-flex", justifyContent: "center", textTransform: "none", letterSpacing: 0 }}>
          {evidenceFile ? evidenceFile.name : "Upload PDF or photo"}
          <input type="file" accept="image/*,application/pdf" style={{ display: "none" }} onChange={(e) => setEvidenceFile(e.target.files?.[0] || null)} />
        </label>
      </MField>
      {attachments.length ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
          {attachments.map((a) => <button key={a.id} type="button" onClick={() => openAttachment(a)} style={muSmallBtn}>{a.file_name ? String(a.file_name).slice(0, 24) : "Document"}</button>)}
        </div>
      ) : null}
      <MField label="Add update / log">
        <input value={logSummary} onChange={(e) => setLogSummary(e.target.value)} placeholder="Summary (e.g. Renewal filed)" style={{ ...input, marginBottom: 6 }} />
        <input value={logNote} onChange={(e) => setLogNote(e.target.value)} placeholder="Note (optional)" style={input} />
      </MField>
      {logs.length ? (
        <div style={{ display: "grid", gap: 6, marginBottom: 4 }}>
          {logs.slice(0, 5).map((lg) => (
            <div key={lg.id} style={{ padding: 9, borderRadius: 8, background: C.surfaceHover }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{lg.summary}</div>
              {lg.notes ? <div style={{ marginTop: 2, fontSize: 11, color: C.textMut }}>{lg.notes}</div> : null}
              <div style={{ marginTop: 2, fontSize: 10, color: C.textMut }}>{lg.created_by_name || ""}{lg.created_at ? ` · ${fmtAuditDate(lg.created_at)}` : ""}</div>
            </div>
          ))}
        </div>
      ) : null}
      {error ? <div><InlineAlert tone="danger">{error}</InlineAlert></div> : null}
    </UpkeepModal>
  );
}

function LicenseEditor({ license, actor, canManage, onClose, onSaved }) {
  const [draft, setDraft] = useState({ ...license, contact_info: license.contact_info || [], website_links: license.website_links || [] });
  const [contactDraft, setContactDraft] = useState(primaryContact(license.contact_info));
  const [linkDraft, setLinkDraft] = useState(primaryLink(license.website_links));
  const [logs, setLogs] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [auditEvents, setAuditEvents] = useState([]);
  const [summary, setSummary] = useState("");
  const [notes, setNotes] = useState("");
  const [evidenceFile, setEvidenceFile] = useState(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!draft.id) return undefined;
    let cancelled = false;
    withUpkeepTimeout(
      Promise.all([
        loadLicenseLogs(draft.location_id, draft.id),
        loadResortUpkeepAttachments(draft.location_id, { license_id: draft.id }),
        loadResortUpkeepAuditEvents(draft.location_id, { entity_type: "resort_upkeep_licenses", entity_id: draft.id }),
      ]),
      "License detail history took too long to load."
    )
      .then(([nextLogs, nextAttachments, nextAuditEvents]) => {
        if (cancelled) return;
        setLogs(nextLogs);
        setAttachments(nextAttachments);
        setAuditEvents(nextAuditEvents);
      })
      .catch((nextError) => {
        console.warn("License detail load failed", nextError);
        if (!cancelled) setError(friendlyErrorMessage(nextError, "License detail history could not be loaded."));
      });
    return () => { cancelled = true; };
  }, [draft.id, draft.location_id]);
  const save = async () => {
    if (!canManage) {
      setError("Only managers can save licenses.");
      return;
    }
    if (!draft.requirement_name.trim()) {
      setError("Requirement name is required.");
      return;
    }
    setError("");
    const nextLicense = { ...draft, contact_info: mergePrimaryContact(draft.contact_info, contactDraft), website_links: mergePrimaryLink(draft.website_links, linkDraft), expiration_date: draft.expiration_date || null, next_expected_date: draft.next_expected_date || null, cadence_months: draft.cadence_months ? Number(draft.cadence_months) : null };
    const hasEvidenceAttachment = attachments.some((attachment) => attachment.attachment_scope === "license_evidence" && !attachment.deleted_at);
    if (nextLicense.status === "compliant" && !evidenceFile && !hasEvidenceAttachment) {
      setError("Upload proof of compliance before marking this license compliant.");
      return;
    }
    const needsEvidenceBeforeCompliance = nextLicense.status === "compliant" && evidenceFile;
    setSaving(true);
    try {
      const saved = await saveLicense(needsEvidenceBeforeCompliance ? { ...nextLicense, status: "non_compliant" } : nextLicense, actor);
      let finalSaved = saved;
      if (needsEvidenceBeforeCompliance) {
        const uploaded = await uploadResortUpkeepAttachment({ locationId: saved.location_id, file: evidenceFile, pathParts: ["licenses", saved.id, "evidence"] });
        await recordResortUpkeepAttachment({ locationId: saved.location_id, attachmentScope: "license_evidence", licenseId: saved.id, file: evidenceFile, fileName: evidenceFile.name || uploaded.safeName, storagePath: uploaded.path, actorName: actor });
        finalSaved = await saveLicense({ ...nextLicense, id: saved.id, location_id: saved.location_id, status: "compliant" }, actor);
      }
      if (summary || notes) await addLicenseLog({ location_id: finalSaved.location_id, license_id: finalSaved.id, summary: summary || "License update", notes, status_snapshot: finalSaved.status }, actor);
      await onSaved();
    } catch (nextError) {
      console.warn("License save failed", nextError);
      setError(friendlyErrorMessage(nextError, "License could not be saved."));
    } finally {
      setSaving(false);
    }
  };
  const deactivate = async () => {
    if (!canManage) {
      setError("Only managers can deactivate licenses.");
      return;
    }
    if (!draft.id) return;
    setSaving(true);
    try {
      await deactivateLicense(draft.id, "Deactivated from web", actor);
      await onSaved();
    } catch (nextError) {
      console.warn("License deactivate failed", nextError);
      setError(friendlyErrorMessage(nextError, "License could not be deactivated."));
    } finally {
      setSaving(false);
    }
  };
  return (
    <EditorShell title={draft.id ? "Edit license" : "New license"} onClose={onClose}>
      <Field label="Requirement" value={draft.requirement_name} onChange={(requirement_name) => setDraft((d) => ({ ...d, requirement_name }))} />
      <Field label="Issuing organization" value={draft.issuing_organization || ""} onChange={(issuing_organization) => setDraft((d) => ({ ...d, issuing_organization }))} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <button onClick={() => setDraft((d) => ({ ...d, status: "compliant" }))} style={draft.status === "compliant" ? primaryBtn : secondaryBtn}>Compliant</button>
        <button onClick={() => setDraft((d) => ({ ...d, status: "non_compliant" }))} style={draft.status === "non_compliant" ? dangerBtn : secondaryBtn}>Non-compliant</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}><Field label="Expiration" type="date" value={draft.expiration_date || ""} onChange={(expiration_date) => setDraft((d) => ({ ...d, expiration_date }))} /><Field label="Expected next" type="date" value={draft.next_expected_date || ""} onChange={(next_expected_date) => setDraft((d) => ({ ...d, next_expected_date }))} /></div>
      <Field label="Cadence months" type="number" value={draft.cadence_months ? String(draft.cadence_months) : ""} onChange={(cadence_months) => setDraft((d) => ({ ...d, cadence_months }))} />
      {draft.status === "compliant" && <FileField label="Proof of compliance" file={evidenceFile} onFile={setEvidenceFile} />}
      <AttachmentList title="License files" attachments={attachments} />
      <ContactEditor title="Contact information" contact={contactDraft} setContact={setContactDraft} />
      <LinkEditor link={linkDraft} setLink={setLinkDraft} />
      <Field label="Notes" value={draft.notes || ""} onChange={(notesText) => setDraft((d) => ({ ...d, notes: notesText }))} multiline />
      <LogComposer summary={summary} setSummary={setSummary} notes={notes} setNotes={setNotes} logs={logs} />
      <AuditTrail title="License activity log" events={auditEvents} />
      {error && <div style={{ padding: 10, borderRadius: 12, background: "#FEF2F2", color: "#991B1B", fontSize: 12, fontWeight: 900 }}>{error}</div>}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        {draft.id && draft.is_active !== false && canManage && <button onClick={deactivate} disabled={saving} style={secondaryBtn}>Deactivate</button>}
        <button onClick={save} disabled={!canManage || saving} style={{ ...primaryBtn, opacity: saving || !canManage ? 0.65 : 1 }}>{saving ? "Saving..." : "Save License"}</button>
      </div>
    </EditorShell>
  );
}

function TroubleshootingPanel({ tabsBar, explainer, articles }) {
  const [query, setQuery] = useState("");
  const list = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (articles || []).filter((a) => !needle || [a.title, a.category, a.body].some((v) => String(v || "").toLowerCase().includes(needle)));
  }, [articles, query]);
  const groups = useMemo(() => {
    const map = new Map();
    [...list].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).forEach((a) => {
      const key = a.category || "General";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(a);
    });
    return Array.from(map.entries());
  }, [list]);

  return (
    <div>
      <ListSearchRow value={query} onChange={setQuery} placeholder="Search the field reference…" />
      {tabsBar}
      {explainer}

      <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 10, background: C.warnLt, border: "1px solid #FDE68A", color: "#92400E", fontSize: 12, fontWeight: 700, lineHeight: 1.45 }}>
        Emergency or same-day service: call Mike Williams at (623) 261-3294. Non-emergency: mike.williams@k9resorts.com.
      </div>

      <div style={{ marginTop: 14, display: "grid", gap: 18 }}>
        {groups.length === 0 ? (
          <EmptyCard title="No guide matches" text="Try a broader facilities term or clear the search." compact />
        ) : groups.map(([category, items]) => (
          <div key={category}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: C.textMut, marginBottom: 8 }}>{category}</div>
            <div style={{ display: "grid", gap: 10 }}>
              {items.map((article) => (
                <div key={article.id} style={{ border: `1px solid ${C.border}`, borderRadius: 12, background: "#fff", padding: "14px 16px", boxShadow: "0 1px 2px rgba(15,23,42,0.04)" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 6, lineHeight: 1.3 }}>{article.title}</div>
                  <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.65, fontSize: 13, color: C.textSec }}>{article.body}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Settings surface (gear): configure building-maintenance checklist templates,
// including a per-item "photo required" flag. Reached via the gear in the title.
function normalizeEditItem(it) {
  return { key: it.key || "", label: it.label || "", is_required: it.is_required !== false, requires_photo: !!it.requires_photo };
}
function blankEditItem() {
  return { key: "", label: "", is_required: true, requires_photo: false };
}
function autoGrowTextarea(el) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${Math.max(38, el.scrollHeight)}px`;
}

function SettingsPanel({ locationId, actor, canManage, onClose, toast }) {
  const [templates, setTemplates] = useState([]);
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editItems, setEditItems] = useState([]);
  const [editName, setEditName] = useState("");
  const [changelog, setChangelog] = useState("");
  const [busy, setBusy] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const tmpls = await withUpkeepTimeout(loadMaintenanceTemplates(locationId), "Templates took too long to load.");
      setTemplates(tmpls);
      setVersions(await loadTemplateVersions(locationId).catch(() => []));
      setError("");
    } catch (e) {
      setError(friendlyErrorMessage(e, "Templates could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, [locationId]);
  useEffect(() => { reload(); }, [reload]);

  const versionsByTemplate = useMemo(() => {
    const map = {};
    versions.forEach((v) => { (map[v.template_id] = map[v.template_id] || []).push(v); });
    return map;
  }, [versions]);
  const draftByTemplate = useMemo(() => {
    const map = {};
    versions.forEach((v) => { if (v.status === "draft" && !map[v.template_id]) map[v.template_id] = v; });
    return map;
  }, [versions]);

  const editingTemplate = templates.find((t) => t.id === editingId) || null;

  const openEditor = (template) => {
    const draft = draftByTemplate[template.id];
    const base = (draft?.items || template.latest_version?.items || []).map(normalizeEditItem);
    setEditItems(base.length ? base : [blankEditItem()]);
    setEditName(template.name || "");
    setChangelog("");
    setError("");
    setEditingId(template.id);
  };
  const closeEditor = () => { setEditingId(""); setEditItems([]); setError(""); };

  const updateItem = (i, patch) => setEditItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const addItem = () => setEditItems((arr) => [...arr, blankEditItem()]);
  const removeItem = (i) => setEditItems((arr) => arr.filter((_, idx) => idx !== i));
  const moveItem = (i, dir) => setEditItems((arr) => {
    const next = [...arr];
    const j = i + dir;
    if (j < 0 || j >= next.length) return arr;
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
  const onLabelKeyDown = (e, i) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (e.metaKey || e.ctrlKey) {
      const el = e.currentTarget;
      const s = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? s;
      const val = el.value;
      updateItem(i, { label: `${val.slice(0, s)}\n${val.slice(end)}` });
      requestAnimationFrame(() => { try { el.selectionStart = el.selectionEnd = s + 1; autoGrowTextarea(el); } catch { /* noop */ } });
    }
  };

  const buildItems = (template) => {
    const usedKeys = new Set();
    return editItems
      .filter((it) => it.label.trim())
      .map((it, index) => {
        const key = it.key && !usedKeys.has(it.key) ? it.key : buildTemplateItemKey(template.slug, it.label, usedKeys);
        usedKeys.add(key);
        return { key, label: it.label.trim(), sort_order: index + 1, is_required: it.is_required !== false, requires_photo: !!it.requires_photo };
      });
  };

  const saveDraft = async () => {
    if (!editingTemplate) return;
    const built = buildItems(editingTemplate);
    if (!built.length) { setError("Add at least one item."); return; }
    setBusy("draft");
    setError("");
    try {
      await saveTemplateDraft({ templateId: editingTemplate.id, locationId, items: built, changelog, actorName: actor });
      if (toast) toast("Draft saved");
      await reload();
    } catch (e) {
      setError(friendlyErrorMessage(e, "Draft could not be saved."));
    } finally {
      setBusy("");
    }
  };

  const publish = async () => {
    if (!editingTemplate) return;
    const built = buildItems(editingTemplate);
    if (!built.length) { setError("Add at least one item."); return; }
    setBusy("publish");
    setError("");
    try {
      await publishMaintenanceTemplateVersion({ templateId: editingTemplate.id, locationId, items: built, changelog: changelog || "Published from web", actorName: actor, templateName: editName });
      await deleteTemplateDraft({ templateId: editingTemplate.id, locationId, actorName: actor }).catch(() => {});
      if (toast) toast("Template published");
      await reload();
      closeEditor();
    } catch (e) {
      setError(friendlyErrorMessage(e, "Template could not be published."));
    } finally {
      setBusy("");
    }
  };

  const discardDraft = async (template) => {
    setBusy("discard");
    try { await deleteTemplateDraft({ templateId: template.id, locationId, actorName: actor }); if (toast) toast("Draft discarded"); await reload(); }
    catch (e) { setError(friendlyErrorMessage(e, "Draft could not be discarded.")); }
    finally { setBusy(""); }
  };

  if (editingId && editingTemplate) {
    const draft = draftByTemplate[editingTemplate.id];
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
          <button type="button" onClick={closeEditor} style={muSmallBtn}>← All templates</button>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button type="button" onClick={saveDraft} disabled={!canManage || !!busy} style={{ ...secondaryBtn, opacity: !canManage || busy ? 0.6 : 1 }}>{busy === "draft" ? "Saving…" : "Save draft"}</button>
            <button type="button" onClick={publish} disabled={!canManage || !!busy} style={{ ...primaryBtn, opacity: !canManage || busy ? 0.6 : 1 }}>{busy === "publish" ? "Publishing…" : "Publish version"}</button>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 12, maxWidth: 620 }}>
          <MField label="Template name"><input value={editName} onChange={(e) => setEditName(e.target.value)} style={input} /></MField>
          <MField label="Change note"><input value={changelog} onChange={(e) => setChangelog(e.target.value)} placeholder="What changed (optional)" style={input} /></MField>
        </div>
        {draft ? (
          <div style={{ marginBottom: 12, fontSize: 12, color: "#92400E", background: C.warnLt, border: "1px solid #FDE68A", borderRadius: 8, padding: "7px 10px", fontWeight: 700 }}>
            Editing a draft last touched by {draft.created_by_name || "—"}{draft.created_at ? ` on ${fmtAuditDate(draft.created_at)}` : ""}. Save keeps it a draft; Publish makes it live.
          </div>
        ) : null}

        <div style={mxTableWrap}>
          <div style={mxHeadRow}>
            <div style={mxHeadCell}>Item</div>
            <div style={{ ...mxHeadCell, justifyContent: "center" }}>Response Required</div>
            <div style={{ ...mxHeadCell, justifyContent: "center" }}>Photo Required</div>
            <div style={mxHeadCell} />
          </div>
          {editItems.map((it, i) => (
            <div key={i} style={mxRow}>
              <textarea
                value={it.label}
                onChange={(e) => { updateItem(i, { label: e.target.value }); autoGrowTextarea(e.target); }}
                onKeyDown={(e) => onLabelKeyDown(e, i)}
                ref={autoGrowTextarea}
                placeholder="Inspection item… (Cmd/Ctrl+Enter for a new line)"
                rows={1}
                style={mxText}
              />
              <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-start", paddingTop: 8 }}>
                <input type="checkbox" checked={it.is_required} onChange={(e) => updateItem(i, { is_required: e.target.checked })} style={{ width: 17, height: 17 }} aria-label="Response required" />
              </div>
              <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-start", paddingTop: 8 }}>
                <input type="checkbox" checked={it.requires_photo} onChange={(e) => updateItem(i, { requires_photo: e.target.checked })} style={{ width: 17, height: 17 }} aria-label="Photo required" />
              </div>
              <div style={{ display: "flex", gap: 4, alignItems: "flex-start", justifyContent: "flex-end", paddingTop: 5 }}>
                <button type="button" onClick={() => moveItem(i, -1)} disabled={i === 0} style={{ ...mxArrow, opacity: i === 0 ? 0.4 : 1 }} title="Move up">▲</button>
                <button type="button" onClick={() => moveItem(i, 1)} disabled={i === editItems.length - 1} style={{ ...mxArrow, opacity: i === editItems.length - 1 ? 0.4 : 1 }} title="Move down">▼</button>
                <button type="button" onClick={() => removeItem(i)} style={{ ...mxArrow, color: C.dan, borderColor: "#FECACA" }} title="Remove">×</button>
              </div>
            </div>
          ))}
        </div>
        <button type="button" onClick={addItem} style={{ ...muSmallBtn, marginTop: 10 }}>+ Add item</button>
        {error ? <div style={{ marginTop: 12 }}><InlineAlert tone="danger">{error}</InlineAlert></div> : null}
      </div>
    );
  }

  const columns = [
    {
      key: "name", header: "Template", width: "minmax(180px, 2fr)", sortable: true, sortValue: (t) => String(t.name).toLowerCase(),
      render: (t) => (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700, color: C.pri, fontSize: 12 }}>{t.name}</span>
          {draftByTemplate[t.id] ? <SharedStatusPill tone="warning">Draft</SharedStatusPill> : null}
        </div>
      ),
    },
    { key: "frequency", header: "Frequency", width: 110, sortable: true, sortValue: (t) => t.frequency || upkeepFrequencyFromSlug(t.slug), render: (t) => <span style={{ fontSize: 11, fontWeight: 700, color: C.textSec }}>{t.frequency || upkeepFrequencyFromSlug(t.slug) || "—"}</span> },
    { key: "created", header: "Created", width: 120, sortable: true, sortValue: (t) => t.created_at || "", render: (t) => <span style={{ fontSize: 11, fontWeight: 700, color: C.text, whiteSpace: "nowrap" }}>{t.created_at ? fmtUpkeepDate(t.created_at) : "—"}</span> },
    {
      key: "versions", header: "Versions", width: 96, align: "center",
      render: (t) => (
        <button type="button" onClick={(e) => { e.stopPropagation(); setExpandedId(expandedId === t.id ? "" : t.id); }} style={{ ...muSmallBtn, padding: "3px 9px", fontSize: 11 }} title="View version history">
          {(versionsByTemplate[t.id] || []).length} {expandedId === t.id ? "▴" : "▾"}
        </button>
      ),
    },
    {
      key: "action", header: "", width: 130, align: "end",
      render: (t) => (canManage ? (
        <button type="button" onClick={(e) => { e.stopPropagation(); openEditor(t); }} style={{ ...muSmallPrimary, padding: "4px 10px" }}>{draftByTemplate[t.id] ? "Resume draft" : "Edit"}</button>
      ) : null),
    },
  ];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>Checklist templates</div>
        <button type="button" onClick={onClose} style={muSmallBtn}>← Back</button>
      </div>
      <ListExplainer>
        Building-maintenance checklist templates. Edit or start a draft, lay items out in the matrix, then publish a version. Open periods pick up published changes; submitted history keeps its snapshot.
      </ListExplainer>

      <div style={{ marginTop: 12 }}>
        {loading ? <div style={{ display: "grid", gap: 10 }}><LoadingRows /></div> : (
          <DenseTable
            columns={columns}
            rows={templates}
            getRowKey={(t) => t.id}
            minWidth={680}
            isRowExpanded={(t) => expandedId === t.id}
            renderExpansion={(t) => <TemplateVersionHistory versions={versionsByTemplate[t.id] || []} draft={draftByTemplate[t.id]} canManage={canManage} busy={busy} onDiscardDraft={() => discardDraft(t)} />}
            emptyText="No templates yet. Maintenance templates appear once the backend seeds them."
          />
        )}
      </div>
      {error ? <div style={{ marginTop: 12 }}><InlineAlert tone="danger">{error}</InlineAlert></div> : null}
    </div>
  );
}

function TemplateVersionHistory({ versions, draft, canManage, busy, onDiscardDraft }) {
  if (!versions.length) return <div style={{ padding: "12px 14px", fontSize: 12, color: C.textMut }}>No versions yet.</div>;
  return (
    <div style={{ padding: "12px 14px", display: "grid", gap: 8 }}>
      {versions.map((v) => {
        const isDraft = v.status === "draft";
        const when = v.published_at || v.created_at;
        return (
          <div key={v.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 10px", borderRadius: 8, background: isDraft ? C.warnLt : C.surfaceHover, border: `1px solid ${isDraft ? "#FDE68A" : C.borderLight}` }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: C.text }}>v{v.version_number}</span>
                <SharedStatusPill tone={v.status === "published" ? "success" : v.status === "draft" ? "warning" : "neutral"}>{v.status === "published" ? "Published" : v.status === "draft" ? "Draft" : v.status}</SharedStatusPill>
                {Array.isArray(v.items) ? <span style={{ fontSize: 11, color: C.textMut }}>{v.items.length} items</span> : null}
              </div>
              {v.changelog ? <div style={{ marginTop: 2, fontSize: 11, color: C.textSec }}>{v.changelog}</div> : null}
              <div style={{ marginTop: 2, fontSize: 10, color: C.textMut }}>{v.created_by_name || "—"}{when ? ` · ${fmtAuditDate(when)}` : ""}</div>
            </div>
            {isDraft && canManage ? <button type="button" onClick={onDiscardDraft} disabled={!!busy} style={{ ...muSmallBtn, color: C.dan, borderColor: "#FECACA", padding: "3px 9px", fontSize: 11 }}>Discard</button> : null}
          </div>
        );
      })}
    </div>
  );
}

const MX_GRID = "minmax(0, 1fr) 150px 140px 92px";
const mxTableWrap = { border: `1.5px solid ${C.border}`, borderRadius: 10, overflow: "hidden", background: C.surface };
const mxHeadRow = { display: "grid", gridTemplateColumns: MX_GRID, gap: 8, padding: "8px 12px", background: "#fff", borderBottom: `1px solid ${C.border}`, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: C.textMut };
const mxHeadCell = { display: "flex", alignItems: "center", minHeight: 16 };
const mxRow = { display: "grid", gridTemplateColumns: MX_GRID, gap: 8, padding: "8px 12px", borderBottom: `1px solid ${C.borderLight}`, alignItems: "start" };
const mxText = { width: "100%", boxSizing: "border-box", border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 13, lineHeight: 1.4, fontFamily: "inherit", color: C.text, background: "#fff", outline: "none", resize: "none", overflow: "hidden", minHeight: 38, whiteSpace: "pre-wrap", wordBreak: "break-word" };
const mxArrow = { width: 24, height: 24, display: "inline-flex", alignItems: "center", justifyContent: "center", border: `1px solid ${C.border}`, borderRadius: 6, background: "#fff", color: C.textSec, cursor: "pointer", fontSize: 12, fontWeight: 800, fontFamily: "inherit", padding: 0 };

function EntityLayout({
  title,
  subtitle,
  canManage,
  query,
  setQuery,
  includeLabel,
  include,
  setInclude,
  onNew,
  newLabel = "New",
  list,
  renderRow,
  editor,
  loading = false,
  error = "",
  onRetry,
  emptyTitle = "No records found",
  emptyText = "Create a record or adjust the search filters.",
}) {
  return (
    <div style={workspaceGrid}>
      <div style={leftRail}>
        <div style={subPanel}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 950 }}>{title}</div>
              {subtitle && <div style={{ marginTop: 4, color: C.textMut, fontSize: 12, lineHeight: 1.45 }}>{subtitle}</div>}
            </div>
            <button onClick={onNew} disabled={!canManage} style={{ ...primaryBtn, opacity: canManage ? 1 : 0.45, whiteSpace: "nowrap" }}>{newLabel}</button>
          </div>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${title.toLowerCase()}`} style={{ ...input, marginTop: 10 }} />
          <label style={{ ...checkRow, marginTop: 10 }}><input type="checkbox" checked={include} onChange={(event) => setInclude(event.target.checked)} /> {includeLabel}</label>
        </div>
        {error && <InlineAlert tone="warning">{error} {onRetry && <button type="button" onClick={onRetry} style={inlineLinkButton}>Retry</button>}</InlineAlert>}
        <div style={{ display: "grid", gap: 10 }}>
          {loading ? <LoadingRows /> : list.length ? list.map(renderRow) : <EmptyCard title={emptyTitle} text={emptyText} compact />}
        </div>
      </div>
      <div style={{ minWidth: 0 }}>
        {editor || <EmptyCard title={`Select ${title.slice(0, -1).toLowerCase()}`} text="Choose a row on the left or create a new one." />}
      </div>
    </div>
  );
}

function EditorShell({ title, onClose, children }) {
  return (
    <div style={panel}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>{title}</h2>
        <button onClick={onClose} style={secondaryBtn}>Close</button>
      </div>
      <div style={{ display: "grid", gap: 12 }}>{children}</div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", multiline = false }) {
  return (
    <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 900, color: C.textMut }}>
      {label}
      {multiline ? <textarea value={value} onChange={(event) => onChange(event.target.value)} style={{ ...input, minHeight: 90 }} /> : <input type={type} value={value} onChange={(event) => onChange(event.target.value)} style={input} />}
    </label>
  );
}

function FileField({ label, file, onFile }) {
  return (
    <label style={{ ...secondaryBtn, display: "inline-flex", justifyContent: "center" }}>
      {file ? file.name : label}
      <input type="file" accept="image/*,application/pdf" style={{ display: "none" }} onChange={(event) => onFile(event.target.files?.[0] || null)} />
    </label>
  );
}

function AttachmentList({ title, attachments }) {
  const [error, setError] = useState("");
  const openAttachment = async (attachment) => {
    try {
      const url = await createResortUpkeepSignedUrl(attachment);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    } catch (nextError) {
      console.warn("Attachment open failed", nextError);
      setError(friendlyErrorMessage(nextError, "This attachment could not be opened."));
    }
  };
  if (!attachments?.length) return null;
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 900, color: C.textMut, marginBottom: 8 }}>{title}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {attachments.map((attachment) => (
          <button key={attachment.id} type="button" onClick={() => openAttachment(attachment)} style={chipButton}>
            {attachment.file_name || "Attachment"}
          </button>
        ))}
      </div>
      {error && <div style={{ marginTop: 8 }}><InlineAlert tone="danger">{error}</InlineAlert></div>}
    </div>
  );
}

function ContactEditor({ title, contact, setContact }) {
  const update = (key, value) => setContact((current) => ({ ...current, [key]: value }));
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 14, padding: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 900, color: C.textMut, marginBottom: 8 }}>{title}</div>
      <div style={{ display: "grid", gap: 10 }}>
        <Field label="Name" value={contact.name} onChange={(value) => update("name", value)} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Phone" value={contact.phone} onChange={(value) => update("phone", value)} />
          <Field label="Email" value={contact.email} onChange={(value) => update("email", value)} />
        </div>
        <Field label="Role" value={contact.role} onChange={(value) => update("role", value)} />
        <Field label="Contact notes" value={contact.notes} onChange={(value) => update("notes", value)} multiline />
      </div>
    </div>
  );
}

function LinkEditor({ link, setLink }) {
  const update = (key, value) => setLink((current) => ({ ...current, [key]: value }));
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 14, padding: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 900, color: C.textMut, marginBottom: 8 }}>Requirement link</div>
      <div style={{ display: "grid", gridTemplateColumns: "0.8fr 1.4fr", gap: 10 }}>
        <Field label="Label" value={link.label} onChange={(value) => update("label", value)} />
        <Field label="URL" value={link.url} onChange={(value) => update("url", value)} />
      </div>
    </div>
  );
}

function AuditTrail({ title, events }) {
  if (!events?.length) return null;
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 14, padding: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 900, color: C.textMut, marginBottom: 8 }}>{title}</div>
      <div style={{ display: "grid", gap: 8 }}>
        {events.slice(0, 8).map((event) => (
          <div key={event.id} style={{ padding: 10, borderRadius: 10, background: C.surfaceHover }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 900 }}>{event.summary || fmtUpkeepStatus(event.event_type)}</div>
              <div style={{ flexShrink: 0, fontSize: 11, color: C.textMut }}>{fmtAuditDate(event.event_at || event.created_at)}</div>
            </div>
            <div style={{ marginTop: 3, fontSize: 11, color: C.textMut }}>{event.actor_name || "K9 Operations"} · {fmtUpkeepStatus(event.event_type)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function fmtAuditDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function JsonField({ label, value, onChange }) {
  const [text, setText] = useState(JSON.stringify(value || [], null, 2));
  const [error, setError] = useState("");
  return (
    <label style={{ display: "grid", gap: 6, fontSize: 12, fontWeight: 900, color: C.textMut }}>
      {label}
      <textarea
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          try {
            onChange(JSON.parse(event.target.value || "[]"));
            setError("");
          } catch {
            setError("Invalid JSON. Fix this before saving or the last valid value will be kept.");
          }
        }}
        style={{ ...input, minHeight: 80, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12, borderColor: error ? C.dan : input.borderColor }}
      />
      {error && <span style={{ color: C.dan, fontSize: 11 }}>{error}</span>}
    </label>
  );
}

function LogComposer({ summary, setSummary, notes, setNotes, logs }) {
  const [open, setOpen] = useState(false);
  const count = logs?.length || 0;
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 14, padding: 12 }}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        style={{ ...cardButton, padding: 0, border: 0, display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}
      >
        <span style={{ fontSize: 12, fontWeight: 900, color: C.textMut }}>Development log</span>
        <span style={{ ...SmallPillStyle, background: open ? C.pri : C.borderLight, color: open ? "#fff" : C.textMut }}>{count}</span>
      </button>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 10 }}>
        <input value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="Summary" style={input} />
        <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Comment" style={input} />
      </div>
      {open && logs?.length ? (
        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          {logs.slice(0, 5).map((log) => (
            <div key={log.id} style={{ padding: 10, borderRadius: 10, background: C.surfaceHover }}>
              <div style={{ fontSize: 12, fontWeight: 900 }}>{log.summary}</div>
              <div style={{ marginTop: 3, fontSize: 12, color: C.textMut }}>{log.notes || log.created_by_name}</div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Shell({ children }) {
  return <div style={{ padding: 24, maxWidth: 1320, margin: "0 auto" }}>{children}</div>;
}

function Progress({ row }) {
  const percent = row?.progress?.percentComplete || 0;
  return <div style={{ marginTop: 10 }}><div style={{ height: 7, borderRadius: 999, background: C.borderLight, overflow: "hidden" }}><div style={{ height: "100%", width: `${percent}%`, background: C.pri }} /></div><div style={{ marginTop: 5, fontSize: 11, fontWeight: 800, color: C.textMut }}>{row?.progress?.completedRequired || 0}/{row?.progress?.totalRequired || 0} complete</div></div>;
}

function StatusPill({ status }) {
  const danger = status === "overdue" || status === "submitted_late" || status === "non_compliant";
  const good = status === "submitted" || status === "ready_to_submit" || status === "compliant";
  return <span style={{ alignSelf: "flex-start", borderRadius: 999, padding: "5px 9px", fontSize: 11, fontWeight: 900, background: danger ? C.danLt : good ? C.sucLt : C.borderLight, color: danger ? C.dan : good ? C.suc : C.textMut }}>{fmtUpkeepStatus(status)}</span>;
}

function SmallPill({ children }) {
  return <span style={SmallPillStyle}>{children}</span>;
}

const SmallPillStyle = { borderRadius: 999, padding: "4px 8px", background: C.borderLight, color: C.textMut, fontSize: 11, fontWeight: 900 };

function InlineAlert({ children, tone = "warning" }) {
  const danger = tone === "danger";
  return (
    <div style={{
      padding: "10px 12px",
      borderRadius: 12,
      background: danger ? C.danLt : C.warnLt,
      border: `1px solid ${danger ? "#FECACA" : "#FDE68A"}`,
      color: danger ? "#991B1B" : "#92400E",
      fontWeight: 850,
      fontSize: 12,
      lineHeight: 1.45,
    }}>
      {children}
    </div>
  );
}

function PanelHeader({ title, kicker }) {
  return (
    <div style={{ ...subPanel, padding: 14 }}>
      <div style={sectionLabel}>{kicker}</div>
      <div style={{ marginTop: 4, fontWeight: 950, fontSize: 15 }}>{title}</div>
    </div>
  );
}

function LoadingRows() {
  return (
    <>
      {[0, 1, 2].map((index) => (
        <div key={index} style={rowButton}>
          <div style={{ width: "70%", height: 13, borderRadius: 999, background: C.borderLight }} />
          <div style={{ marginTop: 10, width: "48%", height: 11, borderRadius: 999, background: C.borderLight }} />
        </div>
      ))}
    </>
  );
}

function EmptyCard({ title, text, compact = false }) {
  return (
    <div style={{ ...panel, textAlign: "center", padding: compact ? 18 : 36 }}>
      <div style={{ fontWeight: 950 }}>{title}</div>
      <div style={{ marginTop: 6, color: C.textMut, fontSize: 13, lineHeight: 1.45 }}>{text}</div>
    </div>
  );
}

const panel = {
  border: `1px solid ${C.border}`,
  borderRadius: 14,
  background: "#fff",
  padding: 16,
  boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
};

const eyebrow = {
  fontSize: 11,
  fontWeight: 950,
  color: C.pri,
  letterSpacing: ".08em",
  textTransform: "uppercase",
};

const workspaceGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))",
  gap: 16,
  alignItems: "start",
};

const leftRail = {
  display: "grid",
  gap: 10,
  alignContent: "start",
  minWidth: 0,
};

const detailPanel = {
  ...panel,
  minHeight: 460,
  minWidth: 0,
};

const subPanel = {
  ...panel,
  padding: 12,
};

const sectionLabel = {
  fontSize: 11,
  fontWeight: 950,
  color: C.textMut,
  textTransform: "uppercase",
  letterSpacing: ".08em",
};

const cardButton = {
  appearance: "none",
  width: "100%",
  textAlign: "left",
  border: `1px solid ${C.border}`,
  borderRadius: 14,
  background: "#fff",
  color: C.text,
  padding: 14,
  cursor: "pointer",
  fontFamily: "inherit",
  outline: "none",
};

const rowButton = {
  ...cardButton,
  borderRadius: 12,
  padding: 13,
};

const selectedRowButton = {
  ...rowButton,
  borderColor: C.pri,
  background: "#F8FAFC",
  boxShadow: "inset 3px 0 0 #14532D",
};

const compactRowButton = {
  ...cardButton,
  padding: 10,
  borderRadius: 10,
};

const selectedCompactRowButton = {
  ...compactRowButton,
  borderColor: C.pri,
  background: "#F8FAFC",
};

const maintenanceItem = {
  border: `1px solid ${C.border}`,
  background: "#fff",
  borderRadius: 12,
  padding: 12,
};

const checkedMaintenanceItem = {
  ...maintenanceItem,
  borderColor: "#BBF7D0",
  background: "#F0FDF4",
};

const articleCard = {
  border: `1px solid ${C.border}`,
  borderRadius: 12,
  padding: 13,
  background: "#fff",
};

const primaryBtn = {
  appearance: "none",
  border: 0,
  borderRadius: 10,
  background: C.pri,
  color: "#fff",
  padding: "10px 14px",
  fontWeight: 900,
  cursor: "pointer",
  fontFamily: "inherit",
  outline: "none",
};

const secondaryBtn = {
  appearance: "none",
  border: `1px solid ${C.border}`,
  borderRadius: 10,
  background: "#fff",
  color: C.text,
  padding: "10px 14px",
  fontWeight: 900,
  cursor: "pointer",
  fontFamily: "inherit",
  outline: "none",
};

const chipButton = {
  ...secondaryBtn,
  borderRadius: 999,
  padding: "6px 9px",
  background: C.surfaceHover,
};

const dangerBtn = { ...primaryBtn, background: C.dan };
const checkRow = { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.text, fontWeight: 800 };
const inlineLinkButton = {
  appearance: "none",
  border: 0,
  background: "transparent",
  color: "inherit",
  fontWeight: 950,
  cursor: "pointer",
  padding: 0,
  textDecoration: "underline",
  fontFamily: "inherit",
};
