import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { C } from "../../shared/theme";
import { hasLeanPermission } from "../../shared/permissions";
import {
  addLicenseLog,
  addVendorLog,
  archiveVendor,
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
  { id: "maintenance", label: "Building Maintenance" },
  { id: "vendors", label: "Local Vendors" },
  { id: "licenses", label: "Licenses" },
  { id: "guide", label: "Troubleshooting" },
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

export default function ResortUpkeepPage({ profile, locationId: selectedLocationId, addGlobalToast = () => {} }) {
  const locationId = selectedLocationId || profile?.location_id || "";
  const actor = useMemo(() => actorName(profile), [profile]);
  const canComplete = hasLeanPermission(profile, "Resort Upkeep Complete");
  const canManage = hasLeanPermission(profile, "Resort Upkeep Manage");
  const [tab, setTab] = useState("maintenance");
  const [dashboard, setDashboard] = useState(EMPTY_DASHBOARD);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    if (!locationId) return;
    const seq = loadSeq.current + 1;
    loadSeq.current = seq;
    setLoading(true);
    setError("");
    try {
      const nextDashboard = await loadResortUpkeepDashboard(locationId);
      if (seq !== loadSeq.current) return;
      setDashboard(nextDashboard);
    } catch (nextError) {
      if (seq !== loadSeq.current) return;
      console.warn("Failed to load Resort Upkeep", nextError);
      setError(nextError?.message || "Resort Upkeep could not be loaded.");
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

  if (!locationId) {
    return <Shell><EmptyCard title="No location selected" text="Choose a location before opening Resort Upkeep." /></Shell>;
  }

  return (
    <Shell>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 18, marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 900, color: C.pri, letterSpacing: ".08em", textTransform: "uppercase" }}>Admin</div>
          <h1 style={{ margin: "5px 0 4px", fontSize: 30, letterSpacing: 0 }}>Resort Upkeep</h1>
          <div style={{ color: C.textMut, fontSize: 14 }}>Building maintenance, local vendors, license compliance, and field troubleshooting.</div>
        </div>
      </div>

      {error && <div style={{ marginBottom: 14, padding: 12, borderRadius: 12, background: C.warnLt, color: "#92400E", fontWeight: 800, fontSize: 13 }}>{error}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(118px, 1fr))", gap: 10, marginBottom: 16 }}>
        <Metric label="Maintenance" value={loading ? "…" : dashboard.maintenanceSummary?.active || 0} />
        <Metric label="Overdue" value={loading ? "…" : dashboard.maintenanceSummary?.overdue || 0} tone="danger" />
        <Metric label="Vendors" value={loading ? "…" : dashboard.vendors?.active || 0} />
        <Metric label="Non-compliant" value={loading ? "…" : dashboard.licenses?.non_compliant || 0} tone="danger" />
      </div>

      <div style={{ display: "flex", gap: 8, borderBottom: `1px solid ${C.border}`, marginBottom: 16, overflowX: "auto" }}>
        {TABS.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            style={{
              appearance: "none",
              border: 0,
              borderBottom: `3px solid ${tab === item.id ? C.pri : "transparent"}`,
              background: "transparent",
              color: tab === item.id ? C.pri : C.textMut,
              padding: "10px 8px 12px",
              fontWeight: 900,
              fontSize: 13,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "maintenance" && <MaintenancePanel locationId={locationId} actor={actor} dashboard={dashboard} canComplete={canComplete} canManage={canManage} onRefresh={load} toast={toast} />}
      {tab === "vendors" && <VendorsPanel locationId={locationId} actor={actor} canManage={canManage} toast={toast} />}
      {tab === "licenses" && <LicensesPanel locationId={locationId} actor={actor} canManage={canManage} toast={toast} />}
      {tab === "guide" && <TroubleshootingPanel articles={dashboard.troubleshooting || []} />}
    </Shell>
  );
}

function MaintenancePanel({ locationId, actor, dashboard, canComplete, canManage, onRefresh, toast }) {
  const [selectedId, setSelectedId] = useState("");
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [templates, setTemplates] = useState([]);
  const [periods, setPeriods] = useState([]);
  const detailSeq = useRef(0);
  const readySubmitPromptedRef = useRef(new Set());
  const selectedPeriod = periods.find((row) => row.id === selectedId) || dashboard.maintenance.find((row) => row.id === selectedId) || dashboard.maintenance[0] || null;
  const currentIds = new Set((dashboard.maintenance || []).map((row) => row.id));
  const historyPeriods = periods.filter((row) => !currentIds.has(row.id));

  const loadDetail = useCallback(async (periodId) => {
    if (!periodId) return;
    const seq = detailSeq.current + 1;
    detailSeq.current = seq;
    setLoading(true);
    setDetailError("");
    try {
      const nextSnapshot = await loadMaintenancePeriodSnapshot(periodId);
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
    loadMaintenanceTemplates(locationId).then(setTemplates).catch((error) => console.warn("Template load failed", error));
  }, [locationId]);

  const loadPeriods = useCallback(() => {
    if (!locationId) return Promise.resolve();
    return loadMaintenancePeriods(locationId, { limit: 96 }).then(setPeriods).catch((error) => console.warn("Maintenance history load failed", error));
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
    await submitMaintenancePeriod(period.id, actor);
    toast("Checklist submitted");
    await Promise.all([loadDetail(period.id), onRefresh(), loadPeriods()]);
  };

  const reopen = async () => {
    await reopenMaintenancePeriod(period.id, "Web edits after submission", actor);
    toast("Checklist reopened for edits");
    await Promise.all([loadDetail(period.id), onRefresh(), loadPeriods()]);
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
        toast("Checklist could not be submitted");
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [actor, canComplete, computedStatus, loadDetail, loadPeriods, onRefresh, period?.id, serverAllowsEdit, submitted, toast]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))", gap: 16, alignItems: "start" }}>
      <div style={{ display: "grid", gap: 10 }}>
        {(dashboard.maintenance || []).map((row) => (
          <button key={row.id} onClick={() => setSelectedId(row.id)} style={{ ...cardButton, borderColor: row.id === period?.id ? C.pri : C.border }}>
            <div style={{ fontWeight: 900, fontSize: 14 }}>{row.template_name || row.template_slug}</div>
            <div style={{ marginTop: 4, fontSize: 12, color: C.textMut }}>Due {fmtUpkeepDate(row.due_date)}</div>
            <Progress row={row} />
          </button>
        ))}
        {historyPeriods.length > 0 && (
          <div style={{ ...panel, padding: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 900, color: C.textMut, textTransform: "uppercase", letterSpacing: ".08em" }}>Checklist history</div>
            <div style={{ display: "grid", gap: 8, marginTop: 10, maxHeight: 300, overflowY: "auto", paddingRight: 4 }}>
              {historyPeriods.map((row) => (
                <button key={row.id} onClick={() => setSelectedId(row.id)} style={{ ...cardButton, padding: 10, borderColor: row.id === period?.id ? C.pri : C.border }}>
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
        {canManage && <TemplateEditor templates={templates} locationId={locationId} actor={actor} onPublished={() => loadMaintenanceTemplates(locationId).then(setTemplates)} toast={toast} />}
      </div>

      <div style={{ ...panel, minHeight: 460, minWidth: 0 }}>
        {!period && <EmptyCard title="No active checklist periods" text="The current monthly, quarterly, semi-annual, and annual periods will appear here once the backend creates them." />}
        {period && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 900, color: C.pri, textTransform: "uppercase", letterSpacing: ".08em" }}>Due {fmtUpkeepDate(period.due_date)}</div>
                <h2 style={{ margin: "4px 0 2px", fontSize: 22, overflowWrap: "anywhere" }}>{period.template_name || period.template_slug}</h2>
                <div style={{ color: C.textMut, fontSize: 13 }}>{fmtUpkeepDate(period.period_start)} - {fmtUpkeepDate(period.period_end)}</div>
              </div>
              <StatusPill status={computedStatus} />
            </div>
            <Progress row={{ ...period, progress: snapshot?.progress || period.progress }} />
            {loading && <div style={{ marginTop: 16, color: C.textMut, fontWeight: 800 }}>Loading checklist…</div>}
            {detailError && <div style={{ marginTop: 16, padding: 12, borderRadius: 12, background: C.warnLt, color: "#92400E", fontWeight: 800, fontSize: 13 }}>{detailError}</div>}
            <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
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
        await onSavedRef.current();
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
      await onSaved();
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
    } finally {
      setSaving(false);
    }
  };

  const openAttachment = async (attachment) => {
    const url = await createResortUpkeepSignedUrl(attachment);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div style={{ border: `1px solid ${checked ? "#BBF7D0" : C.border}`, background: checked ? "#F0FDF4" : "#fff", borderRadius: 14, padding: 12 }}>
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
  };

  if (!selected) return null;
  return (
    <div style={{ ...panel, padding: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 900, color: C.pri, marginBottom: 8 }}>Template editor</div>
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
      <button onClick={publish} style={{ ...primaryBtn, width: "100%", marginTop: 8 }}>Publish new version</button>
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
  const load = useCallback(() => loadVendors(locationId, includeArchived).then(setVendors), [includeArchived, locationId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => subscribeToResortUpkeep(locationId, () => load()), [load, locationId]);
  const filtered = vendors.filter((vendor) => [vendor.business_name, vendor.business_address, vendor.website, vendor.notes].some((value) => String(value || "").toLowerCase().includes(query.toLowerCase())));
  return (
    <EntityLayout
      title="Local Vendors"
      canManage={canManage}
      query={query}
      setQuery={setQuery}
      includeLabel="Show archived"
      include={includeArchived}
      setInclude={setIncludeArchived}
      onNew={() => canManage && setSelected(blankVendor(locationId))}
      list={filtered}
      renderRow={(vendor) => (
        <button key={vendor.id} onClick={() => setSelected(vendor)} style={{ ...cardButton, opacity: vendor.is_archived ? 0.62 : 1 }}>
          <div style={{ fontWeight: 900 }}>{vendor.business_name || "Untitled vendor"}</div>
          <div style={{ marginTop: 4, fontSize: 12, color: C.textMut }}>{vendor.business_address || vendor.address_line_1 || "No address"}</div>
          <div style={{ marginTop: 8, display: "flex", gap: 6 }}>{vendor.has_contract && <SmallPill>Contract</SmallPill>}{vendor.is_archived && <SmallPill>Archived</SmallPill>}</div>
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
  useEffect(() => { if (draft.id) loadVendorLogs(draft.location_id, draft.id).then(setLogs); }, [draft.id, draft.location_id]);
  useEffect(() => { if (draft.id) loadResortUpkeepAttachments(draft.location_id, { vendor_id: draft.id }).then(setAttachments); }, [draft.id, draft.location_id]);
  useEffect(() => { if (draft.id) loadResortUpkeepAuditEvents(draft.location_id, { entity_type: "resort_upkeep_vendors", entity_id: draft.id }).then(setAuditEvents); }, [draft.id, draft.location_id]);
  useEffect(() => {
    if (draft.id || draft.business_name.trim().length < 3) {
      setSuggestions([]);
      return undefined;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const rows = await searchGoogleVendors(draft.business_name.trim());
      if (!cancelled) setSuggestions(rows);
    }, 260);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [draft.business_name, draft.id]);
  const choosePlace = async (prediction) => {
    const place = await getGoogleVendorDetails(prediction.place_id);
    if (!place) return;
    setSuggestions([]);
    setDraft((current) => ({
      ...current,
      business_name: place.name || prediction.structured_formatting?.main_text || current.business_name,
      website: place.website || current.website || "",
      ...parsePlaceAddress(place),
    }));
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
    const saved = await saveVendor(needsContractBeforeFlag ? { ...nextVendor, has_contract: false } : nextVendor, actor);
    let finalSaved = saved;
    if (needsContractBeforeFlag) {
      const uploaded = await uploadResortUpkeepAttachment({ locationId: saved.location_id, file: contractFile, pathParts: ["vendors", saved.id, "contracts"] });
      await recordResortUpkeepAttachment({ locationId: saved.location_id, attachmentScope: "vendor_contract", vendorId: saved.id, file: contractFile, fileName: contractFile.name || uploaded.safeName, storagePath: uploaded.path, actorName: actor });
      finalSaved = await saveVendor({ ...nextVendor, id: saved.id, location_id: saved.location_id, has_contract: true }, actor);
    }
    if (summary || notes) await addVendorLog({ location_id: finalSaved.location_id, vendor_id: finalSaved.id, summary: summary || "Vendor update", notes }, actor);
    await onSaved();
  };
  const archive = async () => {
    if (!canManage) {
      setError("Only managers can archive vendors.");
      return;
    }
    if (!draft.id) return;
    await archiveVendor(draft.id, "Archived from web", actor);
    await onSaved();
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
        {draft.id && !draft.is_archived && canManage && <button onClick={archive} style={secondaryBtn}>Archive</button>}
        <button onClick={save} disabled={!canManage} style={primaryBtn}>Save Vendor</button>
      </div>
    </EditorShell>
  );
}

function LicensesPanel({ locationId, actor, canManage, toast }) {
  const [licenses, setLicenses] = useState([]);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const load = useCallback(() => loadLicenses(locationId, includeInactive).then(setLicenses), [includeInactive, locationId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => subscribeToResortUpkeep(locationId, () => load()), [load, locationId]);
  const filtered = licenses.filter((row) => [row.requirement_name, row.issuing_organization, row.notes].some((value) => String(value || "").toLowerCase().includes(query.toLowerCase())));
  return (
    <EntityLayout
      title="Licenses"
      canManage={canManage}
      query={query}
      setQuery={setQuery}
      includeLabel="Show inactive"
      include={includeInactive}
      setInclude={setIncludeInactive}
      onNew={() => canManage && setSelected(blankLicense(locationId))}
      list={filtered}
      renderRow={(license) => (
        <button key={license.id} onClick={() => setSelected(license)} style={{ ...cardButton, opacity: license.is_active === false ? 0.62 : 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <div style={{ fontWeight: 900 }}>{license.requirement_name || "Untitled requirement"}</div>
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
  useEffect(() => { if (draft.id) loadLicenseLogs(draft.location_id, draft.id).then(setLogs); }, [draft.id, draft.location_id]);
  useEffect(() => { if (draft.id) loadResortUpkeepAttachments(draft.location_id, { license_id: draft.id }).then(setAttachments); }, [draft.id, draft.location_id]);
  useEffect(() => { if (draft.id) loadResortUpkeepAuditEvents(draft.location_id, { entity_type: "resort_upkeep_licenses", entity_id: draft.id }).then(setAuditEvents); }, [draft.id, draft.location_id]);
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
    const saved = await saveLicense(needsEvidenceBeforeCompliance ? { ...nextLicense, status: "non_compliant" } : nextLicense, actor);
    let finalSaved = saved;
    if (needsEvidenceBeforeCompliance) {
      const uploaded = await uploadResortUpkeepAttachment({ locationId: saved.location_id, file: evidenceFile, pathParts: ["licenses", saved.id, "evidence"] });
      await recordResortUpkeepAttachment({ locationId: saved.location_id, attachmentScope: "license_evidence", licenseId: saved.id, file: evidenceFile, fileName: evidenceFile.name || uploaded.safeName, storagePath: uploaded.path, actorName: actor });
      finalSaved = await saveLicense({ ...nextLicense, id: saved.id, location_id: saved.location_id, status: "compliant" }, actor);
    }
    if (summary || notes) await addLicenseLog({ location_id: finalSaved.location_id, license_id: finalSaved.id, summary: summary || "License update", notes, status_snapshot: finalSaved.status }, actor);
    await onSaved();
  };
  const deactivate = async () => {
    if (!canManage) {
      setError("Only managers can deactivate licenses.");
      return;
    }
    if (!draft.id) return;
    await deactivateLicense(draft.id, "Deactivated from web", actor);
    await onSaved();
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
        {draft.id && draft.is_active !== false && canManage && <button onClick={deactivate} style={secondaryBtn}>Deactivate</button>}
        <button onClick={save} disabled={!canManage} style={primaryBtn}>Save License</button>
      </div>
    </EditorShell>
  );
}

function TroubleshootingPanel({ articles }) {
  const [query, setQuery] = useState("");
  const rows = articles.filter((article) => [article.title, article.category, article.body].some((value) => String(value || "").toLowerCase().includes(query.toLowerCase())));
  return (
    <div style={panel}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20 }}>Troubleshooting Guide</h2>
          <div style={{ marginTop: 4, color: C.textMut, fontSize: 13 }}>Read-only reference from the facilities troubleshooting document.</div>
        </div>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search guide" style={{ ...input, width: 240 }} />
      </div>
      <div style={{ padding: 12, borderRadius: 12, background: C.warnLt, color: "#92400E", fontWeight: 800, fontSize: 13, marginBottom: 12 }}>
        Emergency or same-day service: call Facilities Vendor at 623-261-3294. Non-emergency: facilities@example.com.
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {rows.map((article) => (
          <details key={article.id} open={article.sort_order === 1} style={{ border: `1px solid ${C.border}`, borderRadius: 14, padding: 12 }}>
            <summary style={{ cursor: "pointer", fontWeight: 900 }}>{article.title} <span style={{ color: C.textMut, fontSize: 12 }}>· {article.category}</span></summary>
            <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, fontSize: 13, color: C.textSec }}>{article.body}</p>
          </details>
        ))}
      </div>
    </div>
  );
}

function EntityLayout({ title, canManage, query, setQuery, includeLabel, include, setInclude, onNew, list, renderRow, editor }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 16, alignItems: "start" }}>
      <div style={{ display: "grid", gap: 10, alignContent: "start" }}>
        <div style={{ ...panel, padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <div style={{ fontWeight: 900 }}>{title}</div>
            <button onClick={onNew} disabled={!canManage} style={{ ...primaryBtn, opacity: canManage ? 1 : 0.45 }}>New</button>
          </div>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${title.toLowerCase()}`} style={{ ...input, marginTop: 10 }} />
          <label style={{ ...checkRow, marginTop: 10 }}><input type="checkbox" checked={include} onChange={(event) => setInclude(event.target.checked)} /> {includeLabel}</label>
        </div>
        <div style={{ display: "grid", gap: 10 }}>{list.map(renderRow)}</div>
      </div>
      <div style={{ minWidth: 0 }}>{editor || <EmptyCard title={`Select ${title.slice(0, -1).toLowerCase()}`} text="Choose a row on the left or create a new one." />}</div>
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
  const openAttachment = async (attachment) => {
    const url = await createResortUpkeepSignedUrl(attachment);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
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

function Metric({ label, value, tone }) {
  return (
    <div style={{ ...panel, minWidth: 0 }}>
      <div style={{ fontSize: 11, lineHeight: 1.15, fontWeight: 900, color: C.textMut, textTransform: "uppercase", letterSpacing: ".07em", overflowWrap: "anywhere" }}>{label}</div>
      <div style={{ marginTop: 8, fontSize: 26, fontWeight: 950, color: tone === "danger" ? C.dan : C.pri }}>{value}</div>
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

function EmptyCard({ title, text }) {
  return <div style={{ ...panel, textAlign: "center", padding: 36 }}><div style={{ fontWeight: 900 }}>{title}</div><div style={{ marginTop: 6, color: C.textMut, fontSize: 13 }}>{text}</div></div>;
}

const panel = {
  border: `1px solid ${C.border}`,
  borderRadius: 16,
  background: "#fff",
  padding: 16,
  boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
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
};

const chipButton = {
  ...secondaryBtn,
  borderRadius: 999,
  padding: "6px 9px",
  background: C.surfaceHover,
};

const dangerBtn = { ...primaryBtn, background: C.dan };
const checkRow = { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.text, fontWeight: 800 };
