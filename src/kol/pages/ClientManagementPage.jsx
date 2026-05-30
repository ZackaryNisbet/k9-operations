import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../supabaseClient";
import { C, fmtDate, todayStr } from "../../shared/theme";
import { Btn, Card, Inp, Modal } from "../../shared/ui";
import { I } from "../../shared/icons";
import { hasLeanPermission } from "../../shared/permissions";
import { normalizeOptionalUuid, resolveTrainingLocationId } from "../trainingData";
import {
  CLIENT_CASE_TYPE_OPTIONS,
  countIncidentsInRange,
  countOpenFollowUps,
  getClientCaseTypeLabel,
  getClientCaseStatusLabel,
  getIncidentFollowUpState,
  getIncidentReportingPeriodRange,
  INCIDENT_REPORTING_PERIODS,
} from "../clientManagementData";

function formatRangeLabel(start, end) {
  if (!start && !end) return "All recorded incidents";
  const fmt = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  if (start && end) return `${fmt(start)} – ${fmt(end)}`;
  return end ? `Through ${fmt(end)}` : `Since ${fmt(start)}`;
}

const INCIDENT_DOC_BUCKET = "incident-documents";

// Each incident type gets the same colored-pill treatment Grassroots uses for
// Status (a colored dot + label). One color per type so the table reads at a glance.
const TYPE_META = {
  animal_incident: { color: "#B45309", bg: "#FEF3C7", short: "Animal Incident" },
  vet_visit: { color: "#1D4ED8", bg: "#DBEAFE", short: "Vet Visit" },
  serious_animal_event: { color: "#B91C1C", bg: "#FEE2E2", short: "Serious Event" },
  employee_injury: { color: "#7C3AED", bg: "#EDE9FE", short: "Employee Injury" },
  gm_accident_investigation: { color: "#0F766E", bg: "#CCFBF1", short: "GM Investigation" },
  incident_investigation: { color: "#475569", bg: "#E2E8F0", short: "Investigation" },
};
const typeMeta = (value) => TYPE_META[value] || { color: C.textMut, bg: "#E5E7EB", short: "Incident" };

const STATUS_META = {
  open: { color: "#B45309", bg: "#FEF3C7" },
  under_review: { color: "#1D4ED8", bg: "#DBEAFE" },
  closed: { color: "#166534", bg: "#DCFCE7" },
};
const statusMeta = (value) => STATUS_META[value] || { color: C.textMut, bg: "#E5E7EB" };

function Pill({ color, bg, children, dot = true, onClick, title }) {
  return (
    <span
      onClick={onClick}
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "3px 10px",
        borderRadius: 999,
        background: bg,
        color,
        border: `1px solid ${color}33`,
        fontSize: 11,
        fontWeight: 800,
        whiteSpace: "nowrap",
        cursor: onClick ? "pointer" : "default",
      }}
    >
      {dot && <span style={{ width: 7, height: 7, borderRadius: 999, background: color, flexShrink: 0 }} />}
      {children}
    </span>
  );
}

// Follow-up badge — stacks UNDER the incident date per the DESIGN.md dense-table
// standard. Tone is semantic; color stays calm (overdue earns red, today amber,
// upcoming stays neutral slate, done recedes to muted) so the "one accent" rule
// holds and only genuinely urgent rows pull the eye.
const FOLLOW_UP_TONE = {
  overdue: { color: C.dan, bg: C.danLt, border: `${C.dan}33` },
  today: { color: C.warn, bg: C.warnLt, border: `${C.warn}33` },
  upcoming: { color: C.textMut, bg: C.borderLight, border: C.border },
  done: { color: C.textMut, bg: "transparent", border: "transparent" },
};

function FollowUpBadge({ state, canManage, onToggle }) {
  if (!state?.has) return null;
  const tone = FOLLOW_UP_TONE[state.tone] || FOLLOW_UP_TONE.upcoming;
  const dueText = fmtDate(state.dueKey);
  const label = state.tone === "overdue" ? "Overdue"
    : state.tone === "today" ? "Due today"
    : state.tone === "done" ? "Followed up"
    : `Due ${dueText}`;
  const title = state.completed
    ? `Follow-up done${canManage ? ". Click to reopen." : ""}`
    : `Follow-up due ${dueText}${canManage ? ". Click to mark done." : ""}`;
  return (
    <button
      type="button"
      onClick={canManage && onToggle ? onToggle : undefined}
      title={title}
      style={{
        display: "inline-flex", alignItems: "center", gap: 4, marginTop: 3,
        padding: state.tone === "done" ? "1px 2px" : "1px 7px",
        borderRadius: 999, background: tone.bg, color: tone.color,
        border: state.tone === "done" ? "none" : `1px solid ${tone.border}`,
        fontSize: 10, fontWeight: 800, letterSpacing: "0.01em", whiteSpace: "nowrap",
        cursor: canManage && onToggle ? "pointer" : "default", fontFamily: "inherit",
      }}
    >
      {state.completed && <I.Check style={{ width: 10, height: 10 }} />}
      {label}
    </button>
  );
}

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function EmptyState({ title, subtitle }) {
  return (
    <div style={{ padding: "40px 16px", textAlign: "center", color: C.textMut }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 6 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 13 }}>{subtitle}</div>}
    </div>
  );
}

const TABLE_GRID = "176px 124px minmax(160px, 1fr) 122px 128px 110px 40px";

export default function ClientManagementPage({ data, profile, addGlobalToast = () => {} }) {
  const [loading, setLoading] = useState(true);
  const [resolvedLocationId, setResolvedLocationId] = useState("");
  const [incidentCases, setIncidentCases] = useState([]);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [period, setPeriod] = useState("ytd");
  const [followUpOnly, setFollowUpOnly] = useState(false);
  const [activeDogCounts, setActiveDogCounts] = useState(null);

  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newType, setNewType] = useState("animal_incident");
  const [newDate, setNewDate] = useState(todayStr());
  const [newSubject, setNewSubject] = useState("");
  const [newNote, setNewNote] = useState("");
  const [newFollowUp, setNewFollowUp] = useState("");
  const [newFollowUpNote, setNewFollowUpNote] = useState("");
  const [newFile, setNewFile] = useState(null);
  const fileInputRef = useRef(null);

  const locationRef = profile?.location_id || data?.locationId || "";
  const actorUserId = normalizeOptionalUuid(profile?.user_id || profile?.id);
  const actorName = profile?.name || profile?.full_name || profile?.email || "System";
  const canManage = hasLeanPermission(profile, "Customer Lifecycle");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const locationId = await resolveTrainingLocationId(supabase, locationRef, actorUserId);
      setResolvedLocationId(locationId || "");
      if (!locationId) {
        setIncidentCases([]);
        setLoading(false);
        return;
      }
      const [casesRes, dogCountsRes] = await Promise.all([
        supabase
          .from("client_incident_cases")
          .select("*")
          .eq("location_id", locationId)
          .order("incident_date", { ascending: false })
          .order("created_at", { ascending: false }),
        supabase.rpc("incident_active_dog_counts", { p_location_id: locationId, p_as_of: todayStr() }),
      ]);
      if (casesRes.error) throw casesRes.error;
      setIncidentCases(casesRes.data || []);
      if (dogCountsRes.error) {
        console.warn("incident_active_dog_counts RPC failed:", dogCountsRes.error.message);
        setActiveDogCounts({});
      } else {
        const counts = {};
        (dogCountsRes.data || []).forEach((row) => { counts[row.period_id] = Number(row.active_dogs) || 0; });
        setActiveDogCounts(counts);
      }
    } catch (error) {
      console.error("Incidents load error:", error);
      addGlobalToast(`Failed to load incidents: ${error.message || "Unknown error"}`, "error");
    }
    setLoading(false);
  }, [actorUserId, addGlobalToast, locationRef]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ─── Incident rate by reporting period ─────────────────────────────────────
  // Rate = incidents in the window ÷ ACTIVE dogs in the window (unique dogs with
  // a countable stay overlapping it — the population at risk), normalized per
  // 1,000 dogs. Incident counts come from the cases loaded here; the active-dog
  // denominators come from the incident_active_dog_counts RPC, which aggregates
  // the full reservation history server-side (the browser only holds a recent
  // slice, so historical windows can't be counted client-side).
  const asOf = useMemo(() => new Date(), []);
  const totalIncidents = incidentCases.length;
  const dogCountsReady = activeDogCounts !== null;

  const periodRates = useMemo(() => {
    const counts = activeDogCounts || {};
    return INCIDENT_REPORTING_PERIODS.map((option) => {
      const { start, end } = getIncidentReportingPeriodRange(option.id, asOf);
      const incidents = countIncidentsInRange(incidentCases, start, end);
      const activeDogs = counts[option.id] ?? 0;
      const ratePerDog = activeDogs > 0 ? incidents / activeDogs : null;
      return {
        ...option,
        start,
        end,
        incidents,
        activeDogs,
        ratePerDog,
        ratePer1000: ratePerDog === null ? null : ratePerDog * 1000,
        ratePercent: ratePerDog === null ? null : ratePerDog * 100,
      };
    });
  }, [incidentCases, activeDogCounts, asOf]);
  const selectedRate = useMemo(
    () => periodRates.find((entry) => entry.id === period) || periodRates[0],
    [periodRates, period],
  );

  const openCount = useMemo(() => incidentCases.filter((row) => row.status !== "closed").length, [incidentCases]);
  const openFollowUpCount = useMemo(() => countOpenFollowUps(incidentCases, asOf), [incidentCases, asOf]);

  const filteredCases = useMemo(() => {
    const query = search.trim().toLowerCase();
    const { start, end } = getIncidentReportingPeriodRange(period, asOf);
    return incidentCases.filter((row) => {
      const incidentDate = row.incident_date ? new Date(`${row.incident_date}T12:00:00`) : null;
      if (start && (!incidentDate || incidentDate < start)) return false;
      if (end && (!incidentDate || incidentDate > end)) return false;
      if (typeFilter && row.case_type !== typeFilter) return false;
      if (followUpOnly) {
        const fu = getIncidentFollowUpState(row, asOf);
        if (!fu.overdue && !fu.dueToday) return false;
      }
      if (!query) return true;
      return [row.subject_name, row.summary, getClientCaseTypeLabel(row.case_type)]
        .some((value) => String(value || "").toLowerCase().includes(query));
    });
  }, [incidentCases, search, typeFilter, period, followUpOnly, asOf]);

  const resetModal = useCallback(() => {
    setNewType("animal_incident");
    setNewDate(todayStr());
    setNewSubject("");
    setNewNote("");
    setNewFollowUp("");
    setNewFollowUpNote("");
    setNewFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleCreate = useCallback(async () => {
    if (!resolvedLocationId) {
      addGlobalToast("No location resolved yet — try again in a moment", "error");
      return;
    }
    if (!newType) {
      addGlobalToast("Pick an incident type", "error");
      return;
    }
    if (!newSubject.trim()) {
      addGlobalToast("Add who/what the incident involves", "error");
      return;
    }
    setSaving(true);
    const severity = newType === "serious_animal_event"
      ? "critical"
      : newType === "employee_injury"
        ? "elevated"
        : "standard";
    const summary = newNote.trim() || `${getClientCaseTypeLabel(newType)} — ${newSubject.trim()}`;

    const { data: inserted, error } = await supabase
      .from("client_incident_cases")
      .insert({
        location_id: resolvedLocationId,
        case_type: newType,
        status: "open",
        severity,
        incident_date: newDate || todayStr(),
        subject_name: newSubject.trim(),
        summary,
        follow_up_at: newFollowUp || null,
        follow_up_note: newFollowUp ? (newFollowUpNote.trim() || null) : null,
        metadata: { source: "incident_upload" },
        created_by_user_id: actorUserId,
        created_by_name: actorName,
        updated_by_user_id: actorUserId,
        updated_by_name: actorName,
      })
      .select("*")
      .single();

    if (error || !inserted?.id) {
      addGlobalToast(`Failed to log incident: ${error?.message || "Unknown error"}`, "error");
      setSaving(false);
      return;
    }

    const caseId = inserted.id;

    if (newFile) {
      const safeName = (newFile.name || "incident.pdf").replace(/[^\w.\-]+/g, "_");
      const path = `${resolvedLocationId}/${caseId}/${Date.now()}_${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from(INCIDENT_DOC_BUCKET)
        .upload(path, newFile, { upsert: false, contentType: newFile.type || "application/pdf" });
      if (uploadError) {
        addGlobalToast(`Incident logged, but the file upload failed: ${uploadError.message || "Unknown error"}`, "error");
      } else {
        const document = {
          bucket: INCIDENT_DOC_BUCKET,
          path,
          file_name: newFile.name,
          size: newFile.size,
          content_type: newFile.type || "application/pdf",
          uploaded_at: new Date().toISOString(),
        };
        await supabase
          .from("client_incident_cases")
          .update({ metadata: { ...(inserted.metadata || {}), source: "incident_upload", document } })
          .eq("id", caseId);
      }
    }

    await loadData();
    setSaving(false);
    setShowModal(false);
    resetModal();
    addGlobalToast("Incident logged", "success");
  }, [actorName, actorUserId, addGlobalToast, loadData, newDate, newFile, newFollowUp, newFollowUpNote, newNote, newSubject, newType, resetModal, resolvedLocationId]);

  const openDocument = useCallback(async (caseRow) => {
    const document = caseRow?.metadata?.document;
    if (!document?.path) return;
    const { data: signed, error } = await supabase.storage
      .from(document.bucket || INCIDENT_DOC_BUCKET)
      .createSignedUrl(document.path, 300);
    if (error || !signed?.signedUrl) {
      addGlobalToast(`Could not open document: ${error?.message || "Unknown error"}`, "error");
      return;
    }
    window.open(signed.signedUrl, "_blank", "noopener");
  }, [addGlobalToast]);

  const toggleStatus = useCallback(async (caseRow) => {
    if (!canManage || !caseRow?.id) return;
    const nextStatus = caseRow.status === "closed" ? "open" : "closed";
    const { error } = await supabase
      .from("client_incident_cases")
      .update({
        status: nextStatus,
        closed_at: nextStatus === "closed" ? new Date().toISOString() : null,
        updated_by_user_id: actorUserId,
        updated_by_name: actorName,
      })
      .eq("id", caseRow.id);
    if (error) {
      addGlobalToast(`Failed to update status: ${error.message || "Unknown error"}`, "error");
      return;
    }
    await loadData();
  }, [actorName, actorUserId, addGlobalToast, canManage, loadData]);

  const toggleFollowUp = useCallback(async (caseRow) => {
    if (!canManage || !caseRow?.id || !caseRow?.follow_up_at) return;
    const completing = !caseRow.follow_up_completed_at;
    const { error } = await supabase
      .from("client_incident_cases")
      .update({
        follow_up_completed_at: completing ? new Date().toISOString() : null,
        follow_up_completed_by_user_id: completing ? actorUserId : null,
        follow_up_completed_by_name: completing ? actorName : null,
        updated_by_user_id: actorUserId,
        updated_by_name: actorName,
      })
      .eq("id", caseRow.id);
    if (error) {
      addGlobalToast(`Failed to update follow-up: ${error.message || "Unknown error"}`, "error");
      return;
    }
    await loadData();
  }, [actorName, actorUserId, addGlobalToast, canManage, loadData]);

  const deleteIncident = useCallback(async (caseRow) => {
    if (!canManage || !caseRow?.id) return;
    if (!window.confirm("Delete this incident record? This cannot be undone.")) return;
    const document = caseRow?.metadata?.document;
    if (document?.path) {
      await supabase.storage.from(document.bucket || INCIDENT_DOC_BUCKET).remove([document.path]);
    }
    const { error } = await supabase.from("client_incident_cases").delete().eq("id", caseRow.id);
    if (error) {
      addGlobalToast(`Failed to delete incident: ${error.message || "Unknown error"}`, "error");
      return;
    }
    await loadData();
    addGlobalToast("Incident deleted", "success");
  }, [addGlobalToast, canManage, loadData]);

  const rateBig = !dogCountsReady
    ? "…"
    : (selectedRate && selectedRate.ratePer1000 !== null ? selectedRate.ratePer1000.toFixed(1) : "—");

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "24px 16px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <I.AlertTriangle style={{ width: 22, height: 22 }} />
          <span style={{ fontSize: 22, fontWeight: 800, color: C.text }}>Incidents</span>
        </div>
        <Btn variant="primary" icon={<I.Plus />} onClick={() => { resetModal(); setShowModal(true); }} disabled={!canManage}>
          New Incident
        </Btn>
      </div>

      {/* Reporting-period selector (industry-standard windows) */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {periodRates.map((entry) => {
          const on = entry.id === period;
          return (
            <button
              key={entry.id}
              onClick={() => setPeriod(entry.id)}
              title={entry.description}
              style={{ padding: "6px 13px", borderRadius: 9, border: `1.5px solid ${on ? C.pri : C.border}`, background: on ? C.pri : "transparent", color: on ? "#fff" : C.textSec, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
            >
              {entry.label}
            </button>
          );
        })}
      </div>

      {/* ─── Incident Rate hero — selected period, math shown in full ─── */}
      <Card style={{ padding: 0, marginBottom: 14, overflow: "hidden", border: `1.5px solid ${C.pri}33` }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "stretch" }}>
          <div style={{ padding: "20px 24px", background: `linear-gradient(135deg, ${C.pri}, ${C.pri}cc)`, color: "#fff", minWidth: 240, flex: "1 1 240px" }}>
            <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", opacity: 0.9 }}>Incident Rate · {selectedRate?.label}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 8 }}>
              <span style={{ fontSize: 46, fontWeight: 900, lineHeight: 1 }}>{rateBig}</span>
              <span style={{ fontSize: 14, fontWeight: 700, opacity: 0.95 }}>per 1,000 dogs</span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 8, opacity: 0.95 }}>
              {!dogCountsReady
                ? "Calculating active dogs…"
                : (selectedRate && selectedRate.ratePercent !== null ? `${selectedRate.ratePercent.toFixed(2)}% of active dogs` : "No active dogs in this window yet")}
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, marginTop: 6, opacity: 0.85 }}>
              {selectedRate?.description} · {formatRangeLabel(selectedRate?.start, selectedRate?.end)}
            </div>
          </div>

          <div style={{ padding: "20px 24px", flex: "2 1 360px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.06em" }}>How this is calculated</div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", fontSize: 14, color: C.text }}>
              <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", padding: "8px 14px", borderRadius: 12, background: `${C.dan}12`, border: `1px solid ${C.dan}33`, minWidth: 92 }}>
                <span style={{ fontSize: 22, fontWeight: 900, color: C.dan }}>{(selectedRate?.incidents ?? 0).toLocaleString()}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: C.textMut }}>incidents</span>
              </span>
              <span style={{ fontSize: 24, fontWeight: 800, color: C.textMut }}>÷</span>
              <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", padding: "8px 14px", borderRadius: 12, background: `${C.pri}10`, border: `1px solid ${C.pri}33`, minWidth: 92 }}>
                <span style={{ fontSize: 22, fontWeight: 900, color: C.pri }}>{!dogCountsReady ? "…" : (selectedRate?.activeDogs ?? 0).toLocaleString()}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: C.textMut }}>active dogs</span>
              </span>
              <span style={{ fontSize: 24, fontWeight: 800, color: C.textMut }}>=</span>
              <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", padding: "8px 14px", borderRadius: 12, background: C.bg, border: `1px solid ${C.border}`, minWidth: 110 }}>
                <span style={{ fontSize: 20, fontWeight: 900, color: C.text }}>{!dogCountsReady ? "…" : (selectedRate && selectedRate.ratePerDog !== null ? selectedRate.ratePerDog.toFixed(4) : "—")}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: C.textMut }}>per dog</span>
              </span>
            </div>
            <div style={{ fontSize: 13, color: C.textSec, lineHeight: 1.5 }}>
              {!dogCountsReady ? (
                "Counting unique dogs with a stay in this window across the full reservation history…"
              ) : selectedRate && selectedRate.ratePerDog !== null ? (
                <>
                  {selectedRate.ratePerDog.toFixed(4)} × 1,000 = <strong style={{ color: C.text }}>{selectedRate.ratePer1000.toFixed(1)} incidents per 1,000 dogs</strong>
                  {" "}({selectedRate.incidents.toLocaleString()} incident{selectedRate.incidents === 1 ? "" : "s"} across {selectedRate.activeDogs.toLocaleString()} active dog{selectedRate.activeDogs === 1 ? "" : "s"} in {selectedRate.label}).
                </>
              ) : (
                "No dogs had a stay in this window yet, so the rate can’t be computed."
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* All reporting periods at a glance — click a row to select it */}
      <Card style={{ padding: 0, marginBottom: 18, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr 0.9fr", padding: "8px 14px", background: "#fff", borderBottom: `1px solid ${C.border}`, fontSize: 10, fontWeight: 700, color: "rgb(71,85,105)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          <div>Period</div>
          <div style={{ textAlign: "right" }}>Incidents</div>
          <div style={{ textAlign: "right" }}>Active Dogs</div>
          <div style={{ textAlign: "right" }}>Rate /1k</div>
          <div style={{ textAlign: "right" }}>%</div>
        </div>
        {periodRates.map((entry) => {
          const on = entry.id === period;
          return (
            <button
              key={entry.id}
              onClick={() => setPeriod(entry.id)}
              style={{ width: "100%", display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr 0.9fr", padding: "9px 14px", border: "none", borderBottom: `1px solid ${C.borderLight}`, background: on ? `${C.pri}0c` : "transparent", cursor: "pointer", fontFamily: "inherit", alignItems: "center" }}
            >
              <div style={{ textAlign: "left", fontSize: 12, color: on ? C.pri : C.text }}>
                <span style={{ fontWeight: on ? 800 : 700 }}>{entry.label}</span>
                <span style={{ fontSize: 10, color: C.textMut, fontWeight: 500 }}> · {entry.description}</span>
              </div>
              <div style={{ textAlign: "right", fontSize: 13, fontWeight: 700, color: C.text }}>{entry.incidents.toLocaleString()}</div>
              <div style={{ textAlign: "right", fontSize: 13, color: C.textSec }}>{!dogCountsReady ? "…" : entry.activeDogs.toLocaleString()}</div>
              <div style={{ textAlign: "right", fontSize: 13, fontWeight: 800, color: C.pri }}>{!dogCountsReady ? "…" : (entry.ratePer1000 !== null ? entry.ratePer1000.toFixed(1) : "—")}</div>
              <div style={{ textAlign: "right", fontSize: 12, color: C.textMut }}>{!dogCountsReady ? "…" : (entry.ratePercent !== null ? `${entry.ratePercent.toFixed(2)}%` : "—")}</div>
            </button>
          );
        })}
      </Card>

      {/* Search + type filter pills (above the table, Grassroots-style) */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ borderBottom: `1.5px solid ${C.borderLight}`, background: C.bg }}>
          <div style={{ display: "flex", alignItems: "center", padding: "0 16px" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={search ? C.pri : C.textMut} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search incidents by subject, note, or type…"
              style={{ border: "none", outline: "none", background: "transparent", fontSize: 13, fontWeight: 500, color: C.text, padding: "12px 10px", width: "100%", fontFamily: "inherit" }}
            />
            {search && (
              <button onClick={() => setSearch("")} style={{ border: "none", background: "none", cursor: "pointer", color: C.textMut, padding: 2, display: "flex" }} title="Clear">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: "10px 4px 0" }}>
          <button
            onClick={() => setTypeFilter("")}
            style={{ padding: "4px 11px", borderRadius: 8, border: `1.5px solid ${!typeFilter ? C.pri : C.border}`, background: !typeFilter ? C.pri : "transparent", color: !typeFilter ? "#fff" : C.textMut, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
          >
            All {incidentCases.length}
          </button>
          {CLIENT_CASE_TYPE_OPTIONS.map((option) => {
            const meta = typeMeta(option.value);
            const on = typeFilter === option.value;
            const count = incidentCases.filter((row) => row.case_type === option.value).length;
            return (
              <button
                key={option.value}
                onClick={() => setTypeFilter(on ? "" : option.value)}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 11px", borderRadius: 8, border: `1.5px solid ${on ? meta.color : C.border}`, background: on ? meta.color : "transparent", color: on ? "#fff" : C.textMut, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
              >
                <span style={{ width: 7, height: 7, borderRadius: 999, background: on ? "#fff" : meta.color }} />
                {meta.short} {count}
              </button>
            );
          })}
          {(openFollowUpCount > 0 || followUpOnly) && (
            <>
              <span aria-hidden style={{ width: 1, alignSelf: "stretch", background: C.border, margin: "2px 3px" }} />
              <button
                onClick={() => setFollowUpOnly((v) => !v)}
                title="Show only incidents with a follow-up due today or overdue"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 11px", borderRadius: 8, border: `1.5px solid ${followUpOnly ? C.warn : C.border}`, background: followUpOnly ? C.warn : "transparent", color: followUpOnly ? "#fff" : C.textMut, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
              >
                <I.Clock style={{ width: 12, height: 12 }} />
                Needs follow-up {openFollowUpCount}
              </button>
            </>
          )}
        </div>
      </div>

      {/* ─── Incident table (Grassroots Events style) ─── */}
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 14px", borderBottom: `1px solid ${C.borderLight}`, background: C.bg }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>
            Incident log <span style={{ color: C.textMut, fontWeight: 600 }}>· {selectedRate?.label}</span>
          </div>
          <div style={{ fontSize: 11, color: C.textMut }}>
            Showing {filteredCases.length.toLocaleString()} of {totalIncidents.toLocaleString()} total incident{totalIncidents === 1 ? "" : "s"}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: TABLE_GRID, columnGap: 8, padding: "8px 14px", background: "#fff", borderBottom: `1px solid ${C.border}`, fontSize: 10, fontWeight: 700, color: "rgb(71,85,105)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          <div>Type</div>
          <div>Date</div>
          <div>Subject</div>
          <div>Status</div>
          <div>Document</div>
          <div>Logged</div>
          <div />
        </div>

        {loading ? (
          <EmptyState title="Loading incidents…" />
        ) : filteredCases.length === 0 ? (
          <EmptyState
            title={incidentCases.length === 0 ? "No incidents logged yet" : "No incidents match your filters"}
            subtitle={incidentCases.length === 0 ? "Click “New Incident” to upload your first report PDF." : "Clear the search or type filter to see everything."}
          />
        ) : (
          filteredCases.map((row) => {
            const meta = typeMeta(row.case_type);
            const sMeta = statusMeta(row.status);
            const document = row?.metadata?.document;
            const followUp = getIncidentFollowUpState(row, asOf);
            return (
              <div
                key={row.id}
                style={{ display: "grid", gridTemplateColumns: TABLE_GRID, columnGap: 8, padding: "10px 14px", borderBottom: `1px solid ${C.borderLight}`, fontSize: 12, alignItems: "center" }}
              >
                <div>
                  <Pill color={meta.color} bg={meta.bg}>{meta.short}</Pill>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                  <span style={{ color: C.textSec, fontWeight: 600 }}>{row.incident_date ? fmtDate(row.incident_date) : "—"}</span>
                  <FollowUpBadge state={followUp} canManage={canManage} onToggle={() => toggleFollowUp(row)} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={row.subject_name}>{row.subject_name || "—"}</div>
                  <div style={{ color: C.textMut, fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={row.summary}>{row.summary || ""}</div>
                </div>
                <div>
                  <Pill
                    color={sMeta.color}
                    bg={sMeta.bg}
                    onClick={canManage ? () => toggleStatus(row) : undefined}
                    title={canManage ? "Click to toggle open / closed" : undefined}
                  >
                    {getClientCaseStatusLabel(row.status)}
                  </Pill>
                </div>
                <div>
                  {document?.path ? (
                    <button
                      onClick={() => openDocument(row)}
                      style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 9px", borderRadius: 8, border: `1px solid ${C.pri}44`, background: `${C.pri}10`, color: C.pri, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", maxWidth: "100%" }}
                      title={`${document.file_name || "Document"} · ${formatBytes(document.size)}`}
                    >
                      <I.FileText style={{ width: 12, height: 12 }} />
                      View PDF
                    </button>
                  ) : (
                    <span style={{ color: C.textMut, fontSize: 11 }}>No file</span>
                  )}
                </div>
                <div style={{ color: C.textMut, fontSize: 11 }}>{row.created_at ? fmtDate(row.created_at) : "—"}</div>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  {canManage && (
                    <button
                      onClick={() => deleteIncident(row)}
                      style={{ border: "none", background: "none", cursor: "pointer", color: C.textMut, padding: 4, display: "flex" }}
                      title="Delete incident"
                    >
                      <I.Trash style={{ width: 14, height: 14 }} />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </Card>

      {/* ─── New incident modal ─── */}
      {showModal && (
        <Modal title="Log New Incident" onClose={() => { if (!saving) { setShowModal(false); resetModal(); } }}>
          <div style={{ display: "grid", gap: 16 }}>
            {/* Type picker — colored pills, Grassroots Status style */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textSec, marginBottom: 8, letterSpacing: "0.03em", textTransform: "uppercase" }}>
                Incident Type <span style={{ color: C.dan }}>*</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {CLIENT_CASE_TYPE_OPTIONS.map((option) => {
                  const meta = typeMeta(option.value);
                  const active = newType === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setNewType(option.value)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 7,
                        padding: "8px 13px",
                        borderRadius: 10,
                        border: `1.5px solid ${active ? meta.color : C.border}`,
                        background: active ? meta.color : "#fff",
                        color: active ? "#fff" : C.text,
                        fontSize: 12,
                        fontWeight: 800,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        boxShadow: active ? `0 6px 16px ${meta.color}33` : "none",
                        transition: "all 0.16s",
                      }}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: 999, background: active ? "#fff" : meta.color }} />
                      {getClientCaseTypeLabel(option.value)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Inp label="Incident Date" type="date" value={newDate} onChange={setNewDate} required />
              <Inp label="Subject (dog, person, or area)" value={newSubject} onChange={setNewSubject} placeholder="e.g. Bella / John D. / Yard 2" required />
            </div>

            <Inp label="Short Note (optional)" type="textarea" rows={2} value={newNote} onChange={setNewNote} placeholder="One line of context. Leave blank to auto-fill from the type and subject." />

            {/* Follow-up — first-class, so it can be tracked, filtered, and flagged overdue */}
            <div style={{ display: "grid", gridTemplateColumns: "190px 1fr", gap: 12, alignItems: "start" }}>
              <Inp label="Follow-up Date (optional)" type="date" value={newFollowUp} onChange={setNewFollowUp} />
              <Inp label="Follow-up Note" value={newFollowUpNote} onChange={setNewFollowUpNote} placeholder={newFollowUp ? "e.g. Call owner re: vet recheck" : "Set a date to add a follow-up"} disabled={!newFollowUp} />
            </div>

            {/* PDF upload */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textSec, marginBottom: 8, letterSpacing: "0.03em", textTransform: "uppercase" }}>Report PDF</div>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,image/png,image/jpeg,image/webp,image/heic"
                onChange={(e) => setNewFile(e.target.files?.[0] || null)}
                style={{ display: "none" }}
              />
              {newFile ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 12, border: `1.5px solid ${C.pri}44`, background: `${C.pri}08` }}>
                  <I.FileText style={{ width: 18, height: 18, color: C.pri }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{newFile.name}</div>
                    <div style={{ fontSize: 11, color: C.textMut }}>{formatBytes(newFile.size)}</div>
                  </div>
                  <button onClick={() => { setNewFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }} style={{ border: "none", background: "none", cursor: "pointer", color: C.textMut, padding: 4, display: "flex" }} title="Remove file">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "18px 14px", borderRadius: 12, border: `1.5px dashed ${C.border}`, background: C.bg, color: C.textSec, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                >
                  <I.Download style={{ width: 16, height: 16 }} />
                  Choose a PDF or image to upload
                </button>
              )}
              <div style={{ fontSize: 11, color: C.textMut, marginTop: 6 }}>Optional — you can log the incident now and the rate still counts it. PDF/PNG/JPG up to 25&nbsp;MB.</div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
              <Btn variant="ghost" onClick={() => { if (!saving) { setShowModal(false); resetModal(); } }} disabled={saving}>Cancel</Btn>
              <Btn variant="primary" onClick={handleCreate} disabled={saving}>{saving ? "Saving…" : "Log Incident"}</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
