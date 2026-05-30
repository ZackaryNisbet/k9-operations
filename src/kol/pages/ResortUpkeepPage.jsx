import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { C, todayStr } from "../../shared/theme";
import { hasLeanPermission } from "../../shared/permissions";
import {
  addLicenseLog,
  addVendorLog,
  archiveVendor,
  buildUpkeepDueItems,
  deactivateLicense,
  fmtUpkeepDate,
  fmtUpkeepStatus,
  createResortUpkeepSignedUrl,
  loadLicenses,
  loadLicenseLogs,
  loadMaintenancePeriodSnapshot,
  loadMaintenancePeriods,
  loadMaintenanceTemplates,
  loadResortUpkeepDashboard,
  loadResortUpkeepAttachments,
  loadResortUpkeepAuditEvents,
  loadVendorLogs,
  loadVendors,
  publishMaintenanceTemplateVersion,
  recordResortUpkeepAttachment,
  reopenMaintenancePeriod,
  saveLicense,
  saveMaintenanceItemState,
  saveVendor,
  submitMaintenancePeriod,
  subscribeToResortUpkeep,
  uploadResortUpkeepAttachment,
} from "../resortUpkeepData";

const TABS = [
  { id: "due", label: "Due", desc: "What's overdue and coming up across upkeep" },
  { id: "maintenance", label: "Building Maintenance", desc: "Recurring facility checklists" },
  { id: "vendors", label: "Local Vendors", desc: "Contracts, contacts, and service history" },
  { id: "licenses", label: "Licenses", desc: "Compliance proof and renewal dates" },
  { id: "guide", label: "Troubleshooting", desc: "Field reference and escalation paths" },
];

const EMPTY_DASHBOARD = {
  maintenance: [],
  maintenanceSummary: { active: 0, overdue: 0, ready_to_submit: 0, submitted: 0, open: 0 },
  vendors: { active: 0, archived: 0 },
  licenses: { active: 0, non_compliant: 0, expiring_soon: 0 },
  troubleshooting: [],
};

const GOOGLE_PLACES_API_KEY = import.meta.env?.VITE_GOOGLE_PLACES_API_KEY || "";
let googlePlacesScriptPromise = null;

function loadGooglePlacesScript() {
  if (typeof document === "undefined") return Promise.resolve(false);
  if (window.google?.maps?.places) return Promise.resolve(true);
  if (!GOOGLE_PLACES_API_KEY) return Promise.resolve(false);
  if (googlePlacesScriptPromise) return googlePlacesScriptPromise;
  googlePlacesScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector("script[data-k9-resort-upkeep-google-places]");
    if (existing) {
      existing.addEventListener("load", () => resolve(true), { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_PLACES_API_KEY)}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.dataset.k9ResortUpkeepGooglePlaces = "true";
    script.onload = () => resolve(true);
    script.onerror = reject;
    document.head.appendChild(script);
  }).catch(() => false);
  return googlePlacesScriptPromise;
}

async function searchGoogleVendors(query) {
  const ready = await loadGooglePlacesScript();
  if (!ready || !window.google?.maps?.places?.AutocompleteService) return [];
  const service = new window.google.maps.places.AutocompleteService();
  return new Promise((resolve) => {
    service.getPlacePredictions({ input: query, types: ["establishment"] }, (predictions, status) => {
      if (status !== window.google.maps.places.PlacesServiceStatus.OK || !predictions) {
        resolve([]);
        return;
      }
      resolve(predictions.slice(0, 5));
    });
  });
}

async function getGoogleVendorDetails(placeId) {
  const ready = await loadGooglePlacesScript();
  if (!ready || !window.google?.maps?.places?.PlacesService || !placeId) return null;
  const div = document.createElement("div");
  const service = new window.google.maps.places.PlacesService(div);
  return new Promise((resolve) => {
    service.getDetails(
      { placeId, fields: ["place_id", "name", "formatted_address", "address_components", "website"] },
      (place, status) => resolve(status === window.google.maps.places.PlacesServiceStatus.OK ? place : null),
    );
  });
}

function parsePlaceAddress(place) {
  const components = place?.address_components || [];
  const byType = (type) => components.find((item) => item.types?.includes(type));
  const streetNumber = byType("street_number")?.long_name || "";
  const route = byType("route")?.long_name || "";
  const city = byType("locality")?.long_name || byType("postal_town")?.long_name || byType("sublocality")?.long_name || "";
  const state = byType("administrative_area_level_1")?.short_name || "";
  const zip = byType("postal_code")?.long_name || "";
  const country = byType("country")?.short_name || "US";
  const line1 = [streetNumber, route].filter(Boolean).join(" ").trim();
  return {
    business_address: place?.formatted_address || line1,
    address_line_1: line1,
    address_city: city,
    address_state: state,
    address_postal_code: zip,
    address_country: country,
    google_place_id: place?.place_id || "",
  };
}

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

function metricValue(value, loading) {
  if (loading) return "...";
  return value ?? 0;
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
  const [dashboard, setDashboard] = useState(EMPTY_DASHBOARD);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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
  const hasLoadedLocation = loadedLocationRef.current === locationId;
  const metricsLoading = loading && !hasLoadedLocation;
  const tabStats = useMemo(() => ({
    due: (dashboard.maintenanceSummary?.overdue || 0) + (dashboard.licenses?.non_compliant || 0) + (dashboard.licenses?.expiring_soon || 0),
    maintenance: dashboard.maintenanceSummary?.active || 0,
    vendors: dashboard.vendors?.active || 0,
    licenses: dashboard.licenses?.non_compliant || 0,
    guide: dashboard.troubleshooting?.length || 0,
  }), [dashboard]);

  if (!locationId) {
    return <Shell><EmptyCard title="No location selected" text="Choose a location before opening Resort Upkeep." /></Shell>;
  }

  return (
    <Shell>
      <div style={moduleHeader}>
        <div style={{ minWidth: 0 }}>
          <div style={eyebrow}>Admin Workspace</div>
          <h1 style={{ margin: "6px 0 5px", fontSize: 32, letterSpacing: 0, lineHeight: 1.05 }}>Resort Upkeep</h1>
          <div style={{ color: C.textMut, fontSize: 14, maxWidth: 720, lineHeight: 1.55 }}>
            Facility maintenance, vendor accountability, license compliance, and field troubleshooting in one operating surface.
          </div>
        </div>
        <div style={headerActionGroup}>
          <SmallPill>Live Supabase</SmallPill>
          {canManage ? <SmallPill>Manager controls</SmallPill> : canComplete ? <SmallPill>Checklist access</SmallPill> : <SmallPill>Read only</SmallPill>}
        </div>
      </div>

      {error && <InlineAlert tone="warning">{error}</InlineAlert>}

      <div style={metricGrid}>
        <Metric label="Maintenance" value={metricValue(dashboard.maintenanceSummary?.active, metricsLoading)} detail="Active periods" />
        <Metric label="Overdue" value={metricValue(dashboard.maintenanceSummary?.overdue, metricsLoading)} detail="Needs attention" tone="danger" />
        <Metric label="Vendors" value={metricValue(dashboard.vendors?.active, metricsLoading)} detail="Active records" />
        <Metric label="Non-compliant" value={metricValue(dashboard.licenses?.non_compliant, metricsLoading)} detail="License issues" tone="danger" />
      </div>

      <div style={tabRail}>
        {TABS.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            style={tab === item.id ? activeTabButton : tabButton}
          >
            <span style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <span>{item.label}</span>
              <span style={tabBadge}>{metricValue(tabStats[item.id], metricsLoading)}</span>
            </span>
            <span style={tabDesc}>{item.desc}</span>
          </button>
        ))}
      </div>

      {tab === "due" && <DuePanel locationId={locationId} dashboard={dashboard} onOpenTab={setTab} />}
      {tab === "maintenance" && <MaintenancePanel locationId={locationId} actor={actor} dashboard={dashboard} canComplete={canComplete} canManage={canManage} onRefresh={load} toast={toast} />}
      {tab === "vendors" && <VendorsPanel locationId={locationId} actor={actor} canManage={canManage} toast={toast} />}
      {tab === "licenses" && <LicensesPanel locationId={locationId} actor={actor} canManage={canManage} toast={toast} />}
      {tab === "guide" && <TroubleshootingPanel articles={dashboard.troubleshooting || []} />}
    </Shell>
  );
}

const DUE_FILTERS = [
  { id: "all", label: "All" },
  { id: "maintenance", label: "Maintenance" },
  { id: "license", label: "Licenses" },
  { id: "vendor", label: "Vendors" },
];
const DUE_WINDOWS = [
  { id: 30, label: "30 days" },
  { id: 60, label: "60 days" },
  { id: 90, label: "90 days" },
  { id: Infinity, label: "All" },
];
const DUE_KIND_PILL = {
  maintenance: { bg: C.priLt, fg: C.pri },
  license: { bg: C.infoLt, fg: C.info },
  vendor: { bg: C.accLt, fg: C.accDk },
};

function toneBadgeStyle(tone) {
  if (tone === "danger") return { background: C.danLt, color: C.dan };
  if (tone === "warn") return { background: C.warnLt, color: "#B45309" };
  if (tone === "good") return { background: C.sucLt, color: C.suc };
  return { background: C.borderLight, color: C.textMut };
}

function KindPill({ kind, label }) {
  const c = DUE_KIND_PILL[kind] || { bg: C.borderLight, fg: C.textMut };
  return <span style={{ display: "inline-block", fontSize: 10, fontWeight: 800, letterSpacing: ".04em", textTransform: "uppercase", borderRadius: 999, padding: "3px 8px", background: c.bg, color: c.fg, whiteSpace: "nowrap" }}>{label}</span>;
}

// A read-only rollup of everything overdue or coming due across the three
// upkeep domains. It reuses data the page already loads (active maintenance
// periods from the dashboard, plus licenses and vendor contracts) and renders
// it as the DESIGN.md dense table. No writes, no new RPC, no migration.
function DuePanel({ locationId, dashboard, onOpenTab }) {
  const [licenses, setLicenses] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [windowDays, setWindowDays] = useState(60);

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
    maintenance: windowItems.filter((item) => item.kind === "maintenance").length,
    license: windowItems.filter((item) => item.kind === "license").length,
    vendor: windowItems.filter((item) => item.kind === "vendor").length,
  }), [windowItems]);
  const overdueCount = useMemo(() => windowItems.filter((item) => item.tone === "danger").length, [windowItems]);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return windowItems.filter((item) =>
      (kind === "all" || item.kind === kind)
      && (!needle || `${item.title} ${item.subtitle}`.toLowerCase().includes(needle))
    );
  }, [windowItems, kind, query]);

  return (
    <div style={detailPanel}>
      <style>{`.k9-due-row:hover{background:${C.surfaceHover}}.k9-due-row:last-child{border-bottom:none}.k9-due-row:focus-visible{outline:2px solid ${C.pri};outline-offset:-2px}`}</style>
      <div style={dueControls}>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search what's due" style={{ ...input, maxWidth: 260 }} />
        <div style={pillRow}>
          {DUE_FILTERS.map((filter) => (
            <button key={filter.id} type="button" onClick={() => setKind(filter.id)} style={kind === filter.id ? activeFilterPill : filterPill}>
              {filter.label}<span style={pillCount}>{counts[filter.id] ?? 0}</span>
            </button>
          ))}
          <span style={vSep} />
          {DUE_WINDOWS.map((option) => (
            <button key={String(option.id)} type="button" onClick={() => setWindowDays(option.id)} style={windowDays === option.id ? activeWindowToggle : windowToggle}>{option.label}</button>
          ))}
        </div>
      </div>
      <div style={dueExplainer}>Everything overdue or coming due across maintenance, licenses, and vendor contracts. Read only; open a row to act in its tab.</div>
      {error && <div style={{ marginTop: 12 }}><InlineAlert tone="warning">{error} <button type="button" onClick={() => load()} style={inlineLinkButton}>Retry</button></InlineAlert></div>}

      {loading ? (
        <div style={{ marginTop: 14, display: "grid", gap: 10 }}><LoadingRows /></div>
      ) : visible.length === 0 ? (
        <div style={{ marginTop: 14 }}>
          <EmptyCard title="Nothing due in this window" text={overdueCount ? "Adjust the filters to see the rest." : "You're current. Widen the window to look further ahead."} compact />
        </div>
      ) : (
        <div style={dueTableWrap}>
          <div style={dueScroll}>
            <div style={dueTableInner}>
              <div style={dueHeadRow}>
                <div style={dueHeadCell}>Type</div>
                <div style={dueHeadCell}>Item</div>
                <div style={dueHeadCell}>Due</div>
                <div style={dueHeadCell}>Status</div>
                <div style={dueHeadCell} />
              </div>
              {visible.map((item) => (
                <button key={item.id} type="button" className="k9-due-row" onClick={() => onOpenTab(item.targetTab)} style={dueRow} title={`Open in ${item.kindLabel} tab`}>
                  <div><KindPill kind={item.kind} label={item.kindLabel} /></div>
                  <div style={{ minWidth: 0 }}>
                    <div style={dueTitle}>{item.title}</div>
                    {item.subtitle && <div style={dueSub}>{item.subtitle}</div>}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={dueDateText}>{fmtUpkeepDate(item.dueDate)}</div>
                    <div style={{ ...dueBadgeStyle, ...toneBadgeStyle(item.tone) }}>{item.dueBadge}</div>
                  </div>
                  <div><span style={{ ...dueStatusStyle, ...toneBadgeStyle(item.tone) }}>{item.statusLabel}</span></div>
                  <div style={dueChevron}>›</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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

function VendorsPanel({ locationId, actor, canManage, toast }) {
  const [vendors, setVendors] = useState([]);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async ({ silent = false } = {}) => {
    if (!locationId) return;
    if (!silent) setLoading(true);
    try {
      const rows = await withUpkeepTimeout(
        loadVendors(locationId, includeArchived),
        "Local vendors took too long to load."
      );
      setVendors(rows);
      setError("");
    } catch (nextError) {
      console.warn("Vendor load failed", nextError);
      setError(friendlyErrorMessage(nextError, "Local vendors could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, [includeArchived, locationId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!locationId) return undefined;
    return subscribeToResortUpkeep(locationId, () => load({ silent: true }));
  }, [load, locationId]);
  const filtered = useMemo(() => vendors.filter((vendor) => [vendor.business_name, vendor.business_address, vendor.website, vendor.notes].some((value) => String(value || "").toLowerCase().includes(query.toLowerCase()))), [query, vendors]);
  return (
    <EntityLayout
      title="Local Vendors"
      subtitle="Track contractors, service partners, contract proof, and development notes."
      canManage={canManage}
      query={query}
      setQuery={setQuery}
      includeLabel="Show archived"
      include={includeArchived}
      setInclude={setIncludeArchived}
      onNew={() => canManage && setSelected(blankVendor(locationId))}
      newLabel="New vendor"
      list={filtered}
      loading={loading}
      error={error}
      onRetry={() => load()}
      emptyTitle="No vendors found"
      emptyText="Create vendor records for HVAC, plumbing, electrical, pest control, fire systems, and other local service providers."
      renderRow={(vendor) => (
        <button key={vendor.id} onClick={() => setSelected(vendor)} style={{ ...(selected?.id === vendor.id ? selectedRowButton : rowButton), opacity: vendor.is_archived ? 0.62 : 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
            <div style={{ fontWeight: 950, minWidth: 0 }}>{vendor.business_name || "Untitled vendor"}</div>
            {vendor.has_contract ? <SmallPill>Contract</SmallPill> : null}
          </div>
          <div style={{ marginTop: 4, fontSize: 12, color: C.textMut }}>{vendor.business_address || vendor.address_line_1 || "No address"}</div>
          <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>{vendor.website && <SmallPill>Website</SmallPill>}{vendor.is_archived && <SmallPill>Archived</SmallPill>}</div>
        </button>
      )}
      editor={selected && <VendorEditor vendor={selected} actor={actor} canManage={canManage} onClose={() => setSelected(null)} onSaved={async () => { toast("Vendor saved"); setSelected(null); await load(); }} />}
    />
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

function LicensesPanel({ locationId, actor, canManage, toast }) {
  const [licenses, setLicenses] = useState([]);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async ({ silent = false } = {}) => {
    if (!locationId) return;
    if (!silent) setLoading(true);
    try {
      const rows = await withUpkeepTimeout(
        loadLicenses(locationId, includeInactive),
        "Licenses took too long to load."
      );
      setLicenses(rows);
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
  const filtered = useMemo(() => licenses.filter((row) => [row.requirement_name, row.issuing_organization, row.notes].some((value) => String(value || "").toLowerCase().includes(query.toLowerCase()))), [licenses, query]);
  return (
    <EntityLayout
      title="Licenses"
      subtitle="Keep permits, compliance requirements, proof files, and renewal timing in one view."
      canManage={canManage}
      query={query}
      setQuery={setQuery}
      includeLabel="Show inactive"
      include={includeInactive}
      setInclude={setIncludeInactive}
      onNew={() => canManage && setSelected(blankLicense(locationId))}
      newLabel="New license"
      list={filtered}
      loading={loading}
      error={error}
      onRetry={() => load()}
      emptyTitle="No licenses found"
      emptyText="Create license and compliance records for local requirements that need proof, renewal dates, or audit history."
      renderRow={(license) => (
        <button key={license.id} onClick={() => setSelected(license)} style={{ ...(selected?.id === license.id ? selectedRowButton : rowButton), opacity: license.is_active === false ? 0.62 : 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <div style={{ fontWeight: 950 }}>{license.requirement_name || "Untitled requirement"}</div>
            <StatusPill status={license.is_active === false ? "inactive" : license.status} />
          </div>
          <div style={{ marginTop: 4, fontSize: 12, color: C.textMut }}>{license.issuing_organization || "No organization"} · {license.expiration_date ? `Expires ${fmtUpkeepDate(license.expiration_date)}` : "No expiration"}</div>
        </button>
      )}
      editor={selected && <LicenseEditor license={selected} actor={actor} canManage={canManage} onClose={() => setSelected(null)} onSaved={async () => { toast("License saved"); setSelected(null); await load(); }} />}
    />
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

function TroubleshootingPanel({ articles }) {
  const [query, setQuery] = useState("");
  const rows = articles.filter((article) => [article.title, article.category, article.body].some((value) => String(value || "").toLowerCase().includes(query.toLowerCase())));
  return (
    <div style={detailPanel}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ minWidth: 260 }}>
          <div style={eyebrow}>Field reference</div>
          <h2 style={{ margin: "4px 0 4px", fontSize: 24, lineHeight: 1.1 }}>Troubleshooting Guide</h2>
          <div style={{ color: C.textMut, fontSize: 13 }}>Search the facilities reference without leaving the upkeep workflow.</div>
        </div>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search guide" style={{ ...input, width: "min(100%, 320px)" }} />
      </div>
      <div style={{ padding: 12, borderRadius: 12, background: C.warnLt, color: "#92400E", fontWeight: 800, fontSize: 13, marginBottom: 12, border: `1px solid #FDE68A` }}>
        Emergency or same-day service: call Mike Williams at 623-261-3294. Non-emergency: mike.williams@k9resorts.com.
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {rows.length ? rows.map((article) => (
          <details key={article.id} open={article.sort_order === 1} style={articleCard}>
            <summary style={{ cursor: "pointer", fontWeight: 900 }}>{article.title} <span style={{ color: C.textMut, fontSize: 12 }}>· {article.category}</span></summary>
            <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, fontSize: 13, color: C.textSec }}>{article.body}</p>
          </details>
        )) : <EmptyCard title="No guide matches" text="Try a broader facilities term or clear the search." compact />}
      </div>
    </div>
  );
}

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

function Metric({ label, value, tone, detail }) {
  return (
    <div style={{ ...metricCard, borderColor: tone === "danger" ? "#FECACA" : C.border }}>
      <div style={{ fontSize: 11, lineHeight: 1.15, fontWeight: 950, color: C.textMut, textTransform: "uppercase", letterSpacing: ".07em", overflowWrap: "anywhere" }}>{label}</div>
      <div style={{ marginTop: 9, fontSize: 28, lineHeight: 1, fontWeight: 950, color: tone === "danger" ? C.dan : C.pri }}>{value}</div>
      {detail && <div style={{ marginTop: 7, color: C.textMut, fontSize: 12, fontWeight: 800 }}>{detail}</div>}
    </div>
  );
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

const moduleHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 18,
  marginBottom: 18,
  paddingBottom: 2,
};

const headerActionGroup = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  justifyContent: "flex-end",
  flexWrap: "wrap",
};

const eyebrow = {
  fontSize: 11,
  fontWeight: 950,
  color: C.pri,
  letterSpacing: ".08em",
  textTransform: "uppercase",
};

const metricGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 12,
  marginBottom: 16,
};

const metricCard = {
  ...panel,
  minWidth: 0,
  padding: 16,
};

const tabRail = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 210px), 1fr))",
  gap: 10,
  marginBottom: 16,
};

const tabButton = {
  appearance: "none",
  border: `1px solid ${C.border}`,
  borderRadius: 12,
  background: "#fff",
  color: C.textMut,
  padding: 12,
  fontWeight: 950,
  fontSize: 13,
  cursor: "pointer",
  textAlign: "left",
  fontFamily: "inherit",
  minWidth: 0,
  outline: "none",
};

const activeTabButton = {
  ...tabButton,
  borderColor: C.pri,
  color: C.text,
  background: "#F8FAFC",
  boxShadow: "inset 0 -3px 0 #14532D",
};

const tabBadge = {
  borderRadius: 999,
  padding: "2px 7px",
  background: C.borderLight,
  color: C.textMut,
  fontSize: 11,
  fontWeight: 950,
  flexShrink: 0,
};

const tabDesc = {
  display: "block",
  marginTop: 5,
  color: C.textMut,
  fontSize: 11,
  lineHeight: 1.35,
  fontWeight: 800,
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

// ─── "Due" rollup (dense table per DESIGN.md THE STANDARD) ───────────────────
const DUE_GRID = "104px minmax(160px, 1fr) 128px 132px 22px";

const dueControls = { display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 4 };
const pillRow = { display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" };
const filterPill = {
  appearance: "none",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  border: `1px solid ${C.border}`,
  borderRadius: 999,
  background: "#fff",
  color: C.textMut,
  padding: "5px 11px",
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer",
  fontFamily: "inherit",
  outline: "none",
};
const activeFilterPill = { ...filterPill, borderColor: C.pri, background: C.priLt, color: C.pri };
const pillCount = { fontSize: 10, fontWeight: 900, background: C.borderLight, color: C.textMut, borderRadius: 999, padding: "1px 6px" };
const vSep = { width: 1, alignSelf: "stretch", minHeight: 20, background: C.border, margin: "0 2px" };
const windowToggle = {
  appearance: "none",
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  background: "#fff",
  color: C.textMut,
  padding: "5px 9px",
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer",
  fontFamily: "inherit",
  outline: "none",
};
const activeWindowToggle = { ...windowToggle, background: C.pri, color: "#fff", borderColor: C.pri };
const dueExplainer = {
  marginTop: 10,
  padding: "7px 12px",
  borderRadius: 8,
  fontSize: 12,
  lineHeight: 1.4,
  color: C.textMut,
  background: C.priLt,
  border: `1px solid ${C.borderLight}`,
};
const dueTableWrap = { marginTop: 12, border: `1.5px solid ${C.border}`, borderRadius: 10, overflow: "hidden", background: C.surface };
const dueScroll = { overflowX: "auto" };
const dueTableInner = { minWidth: 620 };
const dueHeadRow = {
  display: "grid",
  gridTemplateColumns: DUE_GRID,
  gap: 10,
  alignItems: "center",
  padding: "8px 12px",
  background: "#fff",
  borderBottom: `1px solid ${C.border}`,
};
const dueHeadCell = { fontSize: 10, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: C.textMut };
const dueRow = {
  appearance: "none",
  display: "grid",
  gridTemplateColumns: DUE_GRID,
  gap: 10,
  alignItems: "start",
  width: "100%",
  textAlign: "left",
  border: 0,
  borderBottom: `1px solid ${C.borderLight}`,
  background: "#fff",
  color: C.text,
  padding: "7px 12px",
  cursor: "pointer",
  fontFamily: "inherit",
};
const dueTitle = { fontSize: 13, fontWeight: 700, color: C.pri, lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const dueSub = { marginTop: 2, fontSize: 11, color: C.textMut, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const dueDateText = { fontSize: 12, fontWeight: 700, color: C.text, whiteSpace: "nowrap" };
const dueBadgeStyle = { marginTop: 3, display: "inline-block", fontSize: 10, fontWeight: 800, borderRadius: 999, padding: "2px 7px", whiteSpace: "nowrap" };
const dueStatusStyle = { display: "inline-block", fontSize: 10, fontWeight: 800, borderRadius: 999, padding: "3px 8px", whiteSpace: "nowrap" };
const dueChevron = { color: C.textMut, fontSize: 16, fontWeight: 900, alignSelf: "center", textAlign: "right" };
