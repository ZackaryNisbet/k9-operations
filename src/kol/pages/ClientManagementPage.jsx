import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabaseClient";
import { C, fmtDate, fmtPhoneInput, todayStr } from "../../shared/theme";
import { Badge, Btn, Card, Inp, Modal } from "../../shared/ui";
import { I } from "../../shared/icons";
import { hasLeanPermission } from "../../shared/permissions";
import { normalizeOptionalUuid, resolveTrainingLocationId } from "../trainingData";
import {
  buildClientIncidentMetrics,
  buildDefaultIncidentPayload,
  buildIncidentCaseCode,
  CLIENT_CASE_STATUS_OPTIONS,
  CLIENT_CASE_TYPE_OPTIONS,
  getClientCaseStatusLabel,
  getIncidentCategoryLabel,
  getClientCaseTypeLabel,
  INCIDENT_CATEGORY_OPTIONS,
  getIncidentTemplateById,
  RED_BINDER_FORM_LIBRARY,
} from "../clientManagementData";

function formatTimestamp(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function EmptyState({ title, subtitle }) {
  return (
    <Card style={{ padding: 36, textAlign: "center", color: C.textMut }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 6 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 13 }}>{subtitle}</div>}
    </Card>
  );
}

function MetricCard({ label, value, helper, color = C.pri }) {
  return (
    <Card style={{ padding: 18 }}>
      <div style={{ fontSize: 12, color: C.textMut, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color }}>{value}</div>
      {helper && <div style={{ fontSize: 12, color: C.textMut, marginTop: 8, lineHeight: 1.45 }}>{helper}</div>}
    </Card>
  );
}

function getStatusBadgeColor(status) {
  if (status === "closed") return "success";
  if (status === "under_review") return "warning";
  return "default";
}

function buildDocumentHighlights(document) {
  const payload = document?.form_payload || {};
  const entries = Object.entries(payload).filter(([, value]) => String(value || "").trim());
  return entries.slice(0, 3).map(([key, value]) => ({
    key,
    label: key.replace(/_/g, " "),
    value: String(value),
  }));
}

function parseTemplatePageRange(pageRange) {
  const raw = String(pageRange || "").trim();
  if (!raw) return { start: null, end: null };
  const [left, right] = raw.split("-").map((part) => Number(part));
  if (Number.isFinite(left) && Number.isFinite(right)) return { start: left, end: right };
  if (Number.isFinite(left)) return { start: left, end: left };
  return { start: null, end: null };
}

export default function ClientManagementPage({ data, nav, profile, addGlobalToast = () => {} }) {
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("dashboard");
  const [resolvedLocationId, setResolvedLocationId] = useState("");
  const [incidentCases, setIncidentCases] = useState([]);
  const [incidentDocuments, setIncidentDocuments] = useState([]);
  const [incidentActivity, setIncidentActivity] = useState([]);
  const [selectedCaseId, setSelectedCaseId] = useState(null);

  const [caseSearch, setCaseSearch] = useState("");
  const [caseFilterType, setCaseFilterType] = useState("");
  const [caseFilterStatus, setCaseFilterStatus] = useState("");

  const [showCaseModal, setShowCaseModal] = useState(false);
  const [editingCaseId, setEditingCaseId] = useState(null);
  const [pendingTemplateId, setPendingTemplateId] = useState("");
  const [caseType, setCaseType] = useState("animal_incident");
  const [caseStatus, setCaseStatus] = useState("open");
  const [caseIncidentCategory, setCaseIncidentCategory] = useState("other");
  const [caseIncidentDate, setCaseIncidentDate] = useState(todayStr());
  const [caseIncidentTime, setCaseIncidentTime] = useState("");
  const [caseIncidentArea, setCaseIncidentArea] = useState("");
  const [caseSubjectName, setCaseSubjectName] = useState("");
  const [caseSecondarySubjectName, setCaseSecondarySubjectName] = useState("");
  const [caseClientName, setCaseClientName] = useState("");
  const [caseOwnerPhone, setCaseOwnerPhone] = useState("");
  const [caseReporterEmail, setCaseReporterEmail] = useState("");
  const [caseSummary, setCaseSummary] = useState("");
  const [caseNarrative, setCaseNarrative] = useState("");
  const [savingCase, setSavingCase] = useState(false);

  const [showFormModal, setShowFormModal] = useState(false);
  const [editingDocumentId, setEditingDocumentId] = useState(null);
  const [documentTemplateId, setDocumentTemplateId] = useState("");
  const [documentStatus, setDocumentStatus] = useState("draft");
  const [documentPayload, setDocumentPayload] = useState({});
  const [savingDocument, setSavingDocument] = useState(false);

  const [showNoteModal, setShowNoteModal] = useState(false);
  const [activityNoteText, setActivityNoteText] = useState("");
  const [savingActivity, setSavingActivity] = useState(false);

  const locationRef = profile?.location_id || data?.locationId || "";
  const actorUserId = normalizeOptionalUuid(profile?.user_id || profile?.id);
  const actorName = profile?.name || profile?.full_name || profile?.email || "System";
  const canManageClientDocs = hasLeanPermission(profile, "Customer Lifecycle");
  const caseDraftStorageKey = useMemo(() => `incident_case_draft_${resolvedLocationId || locationRef || "global"}`, [locationRef, resolvedLocationId]);

  const resetCaseModal = useCallback(() => {
    setEditingCaseId(null);
    setPendingTemplateId("");
    setCaseType("animal_incident");
    setCaseStatus("open");
    setCaseIncidentCategory("other");
    setCaseIncidentDate(todayStr());
    setCaseIncidentTime("");
    setCaseIncidentArea("");
    setCaseSubjectName("");
    setCaseSecondarySubjectName("");
    setCaseClientName("");
    setCaseOwnerPhone("");
    setCaseReporterEmail("");
    setCaseSummary("");
    setCaseNarrative("");
  }, []);

  const resetDocumentModal = useCallback(() => {
    setEditingDocumentId(null);
    setDocumentTemplateId("");
    setDocumentStatus("draft");
    setDocumentPayload({});
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const locationId = await resolveTrainingLocationId(supabase, locationRef, actorUserId);
      setResolvedLocationId(locationId || "");
      if (!locationId) {
        setIncidentCases([]);
        setIncidentDocuments([]);
        setIncidentActivity([]);
        setLoading(false);
        return;
      }

      const [caseRes, documentRes, activityRes] = await Promise.all([
        supabase.from("client_incident_cases").select("*").eq("location_id", locationId).order("incident_date", { ascending: false }).order("created_at", { ascending: false }),
        supabase.from("client_incident_documents").select("*").eq("location_id", locationId).order("created_at", { ascending: false }),
        supabase.from("client_incident_activity").select("*").eq("location_id", locationId).order("created_at", { ascending: false }),
      ]);

      if (caseRes.error) throw caseRes.error;
      if (documentRes.error) throw documentRes.error;
      if (activityRes.error) throw activityRes.error;

      const nextCases = caseRes.data || [];
      setIncidentCases(nextCases);
      setIncidentDocuments(documentRes.data || []);
      setIncidentActivity(activityRes.data || []);
      if (!selectedCaseId && nextCases[0]?.id) setSelectedCaseId(nextCases[0].id);
    } catch (error) {
      console.error("Client management load error:", error);
      addGlobalToast(`Failed to load client management: ${error.message || "Unknown error"}`, "error");
    }
    setLoading(false);
  }, [actorUserId, addGlobalToast, locationRef, selectedCaseId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!showCaseModal || editingCaseId) return;
    try {
      const rawDraft = window.localStorage.getItem(caseDraftStorageKey);
      if (!rawDraft) return;
      const draft = JSON.parse(rawDraft);
      setCaseType(draft.caseType || "animal_incident");
      setCaseStatus(draft.caseStatus || "open");
      setCaseIncidentCategory(draft.caseIncidentCategory || "other");
      setCaseIncidentDate(draft.caseIncidentDate || todayStr());
      setCaseIncidentTime(draft.caseIncidentTime || "");
      setCaseIncidentArea(draft.caseIncidentArea || "");
      setCaseSubjectName(draft.caseSubjectName || "");
      setCaseSecondarySubjectName(draft.caseSecondarySubjectName || "");
      setCaseClientName(draft.caseClientName || "");
      setCaseOwnerPhone(draft.caseOwnerPhone || "");
      setCaseReporterEmail(draft.caseReporterEmail || "");
      setCaseSummary(draft.caseSummary || "");
      setCaseNarrative(draft.caseNarrative || "");
    } catch (error) {
      console.warn("Unable to restore incident case draft", error);
    }
  }, [caseDraftStorageKey, editingCaseId, showCaseModal]);

  useEffect(() => {
    if (!showCaseModal || editingCaseId) return;
    try {
      window.localStorage.setItem(caseDraftStorageKey, JSON.stringify({
        caseType,
        caseStatus,
        caseIncidentCategory,
        caseIncidentDate,
        caseIncidentTime,
        caseIncidentArea,
        caseSubjectName,
        caseSecondarySubjectName,
        caseClientName,
        caseOwnerPhone,
        caseReporterEmail,
        caseSummary,
        caseNarrative,
      }));
    } catch (error) {
      console.warn("Unable to persist incident case draft", error);
    }
  }, [
    caseClientName,
    caseDraftStorageKey,
    caseIncidentArea,
    caseIncidentCategory,
    caseIncidentDate,
    caseIncidentTime,
    caseNarrative,
    caseOwnerPhone,
    caseReporterEmail,
    caseSecondarySubjectName,
    caseStatus,
    caseSubjectName,
    caseSummary,
    caseType,
    editingCaseId,
    showCaseModal,
  ]);

  const metrics = useMemo(() => {
    return buildClientIncidentMetrics({
      cases: incidentCases,
      documents: incidentDocuments,
      reservations: data?.reservations || [],
    });
  }, [data?.reservations, incidentCases, incidentDocuments]);

  const filteredCases = useMemo(() => {
    const search = caseSearch.trim().toLowerCase();
    return incidentCases.filter((caseRow) => {
      if (caseFilterType && caseRow.case_type !== caseFilterType) return false;
      if (caseFilterStatus && caseRow.status !== caseFilterStatus) return false;
      if (!search) return true;
      return [
        caseRow.subject_name,
        caseRow.secondary_subject_name,
        caseRow.client_name,
        caseRow.summary,
        caseRow.narrative,
      ].some((value) => String(value || "").toLowerCase().includes(search));
    });
  }, [caseFilterStatus, caseFilterType, caseSearch, incidentCases]);

  const selectedCase = useMemo(() => {
    return incidentCases.find((caseRow) => caseRow.id === selectedCaseId) || null;
  }, [incidentCases, selectedCaseId]);

  const selectedCaseDocuments = useMemo(() => {
    if (!selectedCase?.id) return [];
    return incidentDocuments.filter((document) => document.case_id === selectedCase.id);
  }, [incidentDocuments, selectedCase]);

  const selectedCaseActivity = useMemo(() => {
    if (!selectedCase?.id) return [];
    return incidentActivity.filter((event) => event.case_id === selectedCase.id);
  }, [incidentActivity, selectedCase]);

  const startCaseFromTemplate = useCallback((template) => {
    resetCaseModal();
    setCaseType(template.caseType);
    setCaseSeverity(template.caseType === "serious_animal_event" ? "critical" : "standard");
    setPendingTemplateId(template.id);
    setShowCaseModal(true);
  }, [resetCaseModal]);

  const logCaseActivity = useCallback(async (caseId, activityType, content, metadata = {}) => {
    if (!resolvedLocationId || !caseId) return { error: null };
    return supabase.from("client_incident_activity").insert({
      location_id: resolvedLocationId,
      case_id: caseId,
      activity_type: activityType,
      content: content || null,
      metadata,
      created_by_user_id: actorUserId,
      created_by_name: actorName,
    });
  }, [actorName, actorUserId, resolvedLocationId]);

  const openCaseEditor = useCallback((caseRow = null) => {
    if (!caseRow) {
      resetCaseModal();
      setShowCaseModal(true);
      return;
    }
    setEditingCaseId(caseRow.id);
    setPendingTemplateId("");
    setCaseType(caseRow.case_type || "animal_incident");
    setCaseStatus(caseRow.status || "open");
    setCaseIncidentCategory(caseRow.metadata?.incident_category || "other");
    setCaseIncidentDate(caseRow.incident_date || todayStr());
    setCaseIncidentTime(caseRow.incident_time || "");
    setCaseIncidentArea(caseRow.incident_area || "");
    setCaseSubjectName(caseRow.subject_name || "");
    setCaseSecondarySubjectName(caseRow.secondary_subject_name || "");
    setCaseClientName(caseRow.client_name || "");
    setCaseOwnerPhone(String(caseRow.owner_phone || "").replace(/\D/g, "").slice(0, 10));
    setCaseReporterEmail(caseRow.metadata?.reporter_email || "");
    setCaseSummary(caseRow.summary || "");
    setCaseNarrative(caseRow.narrative || "");
    setShowCaseModal(true);
  }, [resetCaseModal]);

  const handleSaveCase = useCallback(async () => {
    if (!resolvedLocationId || !caseSubjectName.trim() || !caseIncidentDate || !caseSummary.trim()) {
      addGlobalToast("Subject, incident date, and summary are required", "error");
      return;
    }
    setSavingCase(true);
    const derivedSeverity = caseType === "serious_animal_event" || caseIncidentCategory === "dog_death"
      ? "critical"
      : caseIncidentCategory === "employee_injury"
        ? "elevated"
        : "standard";
    const payload = {
      location_id: resolvedLocationId,
      case_type: caseType,
      status: caseStatus,
      severity: derivedSeverity,
      incident_date: caseIncidentDate,
      incident_time: caseIncidentTime || null,
      incident_area: caseIncidentArea.trim() || null,
      subject_name: caseSubjectName.trim(),
      secondary_subject_name: caseSecondarySubjectName.trim() || null,
      client_name: caseClientName.trim() || null,
      owner_phone: String(caseOwnerPhone || "").replace(/\D/g, "").slice(0, 10) || null,
      summary: caseSummary.trim(),
      narrative: caseNarrative.trim() || null,
      updated_by_user_id: actorUserId,
      updated_by_name: actorName,
      metadata: {
        source_manual: "Section 10 - Red Binder",
        incident_category: caseIncidentCategory,
        reporter_email: caseReporterEmail.trim() || null,
      },
    };

    let savedCaseId = editingCaseId;

    if (editingCaseId) {
      const { error } = await supabase.from("client_incident_cases").update(payload).eq("id", editingCaseId);
      if (error) {
        addGlobalToast(`Failed to save case: ${error.message || "Unknown error"}`, "error");
        setSavingCase(false);
        return;
      }
      await logCaseActivity(editingCaseId, "case_updated", "Case updated", {
        status: caseStatus,
        incident_category: caseIncidentCategory,
      });
    } else {
      const { data: inserted, error } = await supabase
        .from("client_incident_cases")
        .insert({
          ...payload,
          created_by_user_id: actorUserId,
          created_by_name: actorName,
        })
        .select("*")
        .single();
      if (error) {
        addGlobalToast(`Failed to create case: ${error.message || "Unknown error"}`, "error");
        setSavingCase(false);
        return;
      }
      savedCaseId = inserted?.id || null;
      if (savedCaseId) {
        await logCaseActivity(savedCaseId, "case_created", "Case created", {
          case_type: caseType,
          incident_category: caseIncidentCategory,
        });
      }
    }

    await loadData();
    setSavingCase(false);
    setShowCaseModal(false);
    resetCaseModal();
    try {
      window.localStorage.removeItem(caseDraftStorageKey);
    } catch (error) {
      console.warn("Unable to clear incident draft", error);
    }
    if (savedCaseId) {
      setSelectedCaseId(savedCaseId);
      if (pendingTemplateId) {
        const template = getIncidentTemplateById(pendingTemplateId);
        if (template) {
          setDocumentTemplateId(template.id);
          setDocumentStatus("draft");
          setDocumentPayload(buildDefaultIncidentPayload(template));
          setShowFormModal(true);
        }
      }
    }
    addGlobalToast(editingCaseId ? "Incident case updated" : "Incident case created", "success");
  }, [
    actorName,
    actorUserId,
    addGlobalToast,
    caseClientName,
    caseIncidentArea,
    caseIncidentDate,
    caseIncidentTime,
    caseNarrative,
    caseOwnerPhone,
    caseSecondarySubjectName,
    caseIncidentCategory,
    caseStatus,
    caseSubjectName,
    caseSummary,
    caseType,
    caseDraftStorageKey,
    caseReporterEmail,
    editingCaseId,
    loadData,
    logCaseActivity,
    pendingTemplateId,
    resetCaseModal,
    resolvedLocationId,
  ]);

  const openDocumentEditor = useCallback((templateId = "", document = null) => {
    if (!selectedCase?.id) {
      addGlobalToast("Choose an incident case first", "error");
      return;
    }
    if (document) {
      setEditingDocumentId(document.id);
      setDocumentTemplateId(document.form_code || "");
      setDocumentStatus(document.status || "draft");
      setDocumentPayload(document.form_payload || {});
      setShowFormModal(true);
      return;
    }
    const template = getIncidentTemplateById(templateId || RED_BINDER_FORM_LIBRARY[0]?.id);
    if (!template) {
      addGlobalToast("Choose a valid Red Binder form", "error");
      return;
    }
    setEditingDocumentId(null);
    setDocumentTemplateId(template.id);
    setDocumentStatus("draft");
    setDocumentPayload(buildDefaultIncidentPayload(template));
    setShowFormModal(true);
  }, [addGlobalToast, selectedCase]);

  const handleDocumentPayloadChange = useCallback((key, value) => {
    setDocumentPayload((current) => ({ ...current, [key]: value }));
  }, []);

  const handleSaveDocument = useCallback(async () => {
    if (!selectedCase?.id || !documentTemplateId) {
      addGlobalToast("Choose a case and a Red Binder form", "error");
      return;
    }
    const template = getIncidentTemplateById(documentTemplateId);
    if (!template) {
      addGlobalToast("Unknown Red Binder form", "error");
      return;
    }
    setSavingDocument(true);
    const pageRange = parseTemplatePageRange(template.pageRange);
    const payload = {
      location_id: resolvedLocationId,
      case_id: selectedCase.id,
      form_code: template.id,
      form_name: template.title,
      source_page_start: pageRange.start,
      source_page_end: pageRange.end,
      status: documentStatus,
      form_payload: documentPayload,
      updated_by_user_id: actorUserId,
      updated_by_name: actorName,
    };

    if (editingDocumentId) {
      const { error } = await supabase.from("client_incident_documents").update(payload).eq("id", editingDocumentId);
      if (error) {
        addGlobalToast(`Failed to save form: ${error.message || "Unknown error"}`, "error");
        setSavingDocument(false);
        return;
      }
      await logCaseActivity(selectedCase.id, "form_updated", `Updated ${template.title}`, { form_code: template.id });
    } else {
      const { error } = await supabase.from("client_incident_documents").insert({
        ...payload,
        created_by_user_id: actorUserId,
        created_by_name: actorName,
      });
      if (error) {
        addGlobalToast(`Failed to add form: ${error.message || "Unknown error"}`, "error");
        setSavingDocument(false);
        return;
      }
      await logCaseActivity(selectedCase.id, "form_added", `Added ${template.title}`, { form_code: template.id });
    }

    await loadData();
    setSavingDocument(false);
    setShowFormModal(false);
    resetDocumentModal();
    addGlobalToast(editingDocumentId ? "Incident form updated" : "Incident form added", "success");
  }, [
    actorName,
    actorUserId,
    addGlobalToast,
    documentPayload,
    documentStatus,
    documentTemplateId,
    editingDocumentId,
    loadData,
    logCaseActivity,
    resetDocumentModal,
    resolvedLocationId,
    selectedCase,
  ]);

  const handleAddActivityNote = useCallback(async () => {
    if (!selectedCase?.id || !activityNoteText.trim()) {
      addGlobalToast("Add note text first", "error");
      return;
    }
    setSavingActivity(true);
    const { error } = await logCaseActivity(selectedCase.id, "note", activityNoteText.trim(), {});
    if (error) {
      addGlobalToast(`Failed to save note: ${error.message || "Unknown error"}`, "error");
      setSavingActivity(false);
      return;
    }
    await loadData();
    setSavingActivity(false);
    setActivityNoteText("");
    setShowNoteModal(false);
    addGlobalToast("Case note added", "success");
  }, [activityNoteText, addGlobalToast, loadData, logCaseActivity, selectedCase]);

  const handleToggleCaseClosed = useCallback(async () => {
    if (!selectedCase?.id) return;
    const nextStatus = selectedCase.status === "closed" ? "under_review" : "closed";
    const { error } = await supabase
      .from("client_incident_cases")
      .update({
        status: nextStatus,
        closed_at: nextStatus === "closed" ? new Date().toISOString() : null,
        updated_by_user_id: actorUserId,
        updated_by_name: actorName,
      })
      .eq("id", selectedCase.id);
    if (error) {
      addGlobalToast(`Failed to update case: ${error.message || "Unknown error"}`, "error");
      return;
    }
    await logCaseActivity(selectedCase.id, "status_change", `Case marked ${getClientCaseStatusLabel(nextStatus)}`, { status: nextStatus });
    await loadData();
    addGlobalToast(nextStatus === "closed" ? "Case closed" : "Case reopened for review", "success");
  }, [actorName, actorUserId, addGlobalToast, loadData, logCaseActivity, selectedCase]);

  const selectedTemplate = getIncidentTemplateById(documentTemplateId);

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "24px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <I.AlertTriangle style={{ width: 22, height: 22 }} />
          <span style={{ fontSize: 22, fontWeight: 800, color: C.text }}>Incidents</span>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Btn variant="secondary" onClick={() => setTab("library")}>Red Binder Library</Btn>
          <Btn variant="primary" onClick={() => openCaseEditor()} disabled={!canManageClientDocs}>New Incident Case</Btn>
        </div>
      </div>

      <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: `2px solid ${C.borderLight}` }}>
        {[
          { id: "dashboard", label: "Home" },
          { id: "cases", label: "Incident Cases" },
          { id: "library", label: "Required Forms" },
        ].map((tabOption) => (
          <button
            key={tabOption.id}
            onClick={() => setTab(tabOption.id)}
            style={{
              padding: "10px 18px",
              fontSize: 13,
              fontWeight: tab === tabOption.id ? 700 : 500,
              color: tab === tabOption.id ? C.pri : C.textMut,
              background: "none",
              border: "none",
              borderBottom: tab === tabOption.id ? `2px solid ${C.pri}` : "2px solid transparent",
              cursor: "pointer",
              fontFamily: "inherit",
              marginBottom: -2,
            }}
          >
            {tabOption.label}
          </button>
        ))}
      </div>

      {loading ? (
        <Card style={{ padding: 28, textAlign: "center", color: C.textMut }}>Loading incidents…</Card>
      ) : (
        <>
          {tab === "dashboard" && (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginBottom: 20 }}>
                <MetricCard label="Open Cases" value={metrics.openCaseCount} color={C.pri} />
                <MetricCard label="Incidents In 30 Days" value={metrics.caseCount30d} color={C.dan} />
                <MetricCard label="Serious Events In 30 Days" value={metrics.seriousCaseCount30d || metrics.criticalCaseCount30d} color={C.dan} />
                <MetricCard label="Dog-Days In 30 Days" value={metrics.dogDays30} color={C.text} />
                <MetricCard
                  label="Incident Rate"
                  value={metrics.dogDays30 ? `${metrics.incidentRatePer100DogDays}` : "—"}
                  helper={metrics.dogDays30 ? "Incidents per 100 dog-days" : "Waiting for reservation history"}
                  color={C.warn}
                />
                <MetricCard label="Saved Red Binder Docs" value={metrics.documentationCount} color={C.acc} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 16, alignItems: "start" }}>
                <Card style={{ padding: 18 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>Recent Incident Cases</div>
                      <div style={{ fontSize: 12, color: C.textMut }}>New incident documentation should start here.</div>
                    </div>
                    <Btn variant="secondary" size="sm" onClick={() => setTab("cases")}>Open Cases</Btn>
                  </div>
                  {incidentCases.length === 0 ? (
                    <EmptyState title="No incident cases yet" subtitle="Start the first Red Binder case so incident documentation is no longer paper-only." />
                  ) : (
                    incidentCases.slice(0, 5).map((caseRow) => (
                      <button
                        key={caseRow.id}
                        onClick={() => {
                          setSelectedCaseId(caseRow.id);
                          setTab("cases");
                        }}
                        style={{
                          width: "100%",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          gap: 12,
                          padding: "12px 0",
                          border: "none",
                          borderTop: `1px solid ${C.borderLight}`,
                          background: "none",
                          textAlign: "left",
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{buildIncidentCaseCode(caseRow)} · {caseRow.subject_name}</div>
                          <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.5 }}>{caseRow.summary}</div>
                        </div>
                        <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
                          <Badge color={getStatusBadgeColor(caseRow.status)}>{getClientCaseStatusLabel(caseRow.status)}</Badge>
                          <span style={{ fontSize: 11, color: C.textMut }}>{caseRow.incident_date ? fmtDate(caseRow.incident_date) : "—"}</span>
                        </div>
                      </button>
                    ))
                  )}
                </Card>

                <Card style={{ padding: 18 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: 10 }}>Required Red Binder Forms</div>
                  <div style={{ display: "grid", gap: 10 }}>
                    {RED_BINDER_FORM_LIBRARY.map((template) => (
                      <div key={template.id} style={{ padding: 12, borderRadius: 14, border: `1px solid ${C.borderLight}`, background: C.bg }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{template.title}</div>
                          <span style={{ fontSize: 11, color: C.textMut }}>Pg. {template.pageRange}</span>
                        </div>
                        <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.5, marginBottom: 8 }}>{template.description}</div>
                        <Btn variant="ghost" size="sm" onClick={() => startCaseFromTemplate(template)}>Start Case</Btn>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            </div>
          )}

          {tab === "cases" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.05fr", gap: 16, alignItems: "start" }}>
              <Card style={{ padding: 18 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.9fr 0.9fr auto", gap: 10, marginBottom: 14 }}>
                  <Inp label="Search Cases" value={caseSearch} onChange={setCaseSearch} placeholder="Dog, client, summary..." />
                  <Inp label="Type" type="select" value={caseFilterType} onChange={setCaseFilterType} options={[{ value: "", label: "All types" }, ...CLIENT_CASE_TYPE_OPTIONS]} />
                  <Inp label="Status" type="select" value={caseFilterStatus} onChange={setCaseFilterStatus} options={[{ value: "", label: "All statuses" }, ...CLIENT_CASE_STATUS_OPTIONS]} />
                  <div style={{ display: "flex", alignItems: "flex-end" }}>
                    <Btn variant="primary" size="sm" onClick={() => openCaseEditor()}>New Case</Btn>
                  </div>
                </div>

                {filteredCases.length === 0 ? (
                  <EmptyState title="No incident cases match the current filters" subtitle="Clear the filters or create a new Red Binder case." />
                ) : (
                  filteredCases.map((caseRow) => (
                    <button
                      key={caseRow.id}
                      onClick={() => setSelectedCaseId(caseRow.id)}
                      style={{
                        width: "100%",
                        padding: "14px 0",
                        border: "none",
                        borderTop: `1px solid ${C.borderLight}`,
                        background: "none",
                        textAlign: "left",
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 800, color: caseRow.id === selectedCaseId ? C.pri : C.text }}>
                            {buildIncidentCaseCode(caseRow)} · {caseRow.subject_name}
                          </div>
                          <div style={{ fontSize: 12, color: C.textSec, marginTop: 4 }}>
                            {getClientCaseTypeLabel(caseRow.case_type)}
                            {caseRow.metadata?.incident_category ? ` · ${getIncidentCategoryLabel(caseRow.metadata.incident_category)}` : ""}
                            {caseRow.client_name ? ` · ${caseRow.client_name}` : ""}
                          </div>
                          <div style={{ fontSize: 12, color: C.textMut, lineHeight: 1.45, marginTop: 4 }}>{caseRow.summary}</div>
                        </div>
                        <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
                          <Badge color={getStatusBadgeColor(caseRow.status)}>{getClientCaseStatusLabel(caseRow.status)}</Badge>
                          <span style={{ fontSize: 11, color: C.textMut }}>{caseRow.incident_date ? fmtDate(caseRow.incident_date) : "—"}</span>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </Card>

              <div style={{ display: "grid", gap: 16 }}>
                {!selectedCase ? (
                  <EmptyState title="Choose an incident case" subtitle="Select a case from the list to review documentation, notes, and Red Binder forms." />
                ) : (
                  <>
                    <Card style={{ padding: 18 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
                        <div>
                          <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>{buildIncidentCaseCode(selectedCase)}</div>
                          <div style={{ fontSize: 13, color: C.textSec, marginTop: 4 }}>
                            {getClientCaseTypeLabel(selectedCase.case_type)} · {selectedCase.subject_name}
                            {selectedCase.secondary_subject_name ? ` / ${selectedCase.secondary_subject_name}` : ""}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <Btn variant="secondary" size="sm" onClick={() => openCaseEditor(selectedCase)}>Edit Case</Btn>
                          <Btn variant="ghost" size="sm" onClick={() => openDocumentEditor()}>Add Form</Btn>
                          <Btn variant="ghost" size="sm" onClick={() => setShowNoteModal(true)}>Add Note</Btn>
                          <Btn variant="ghost" size="sm" onClick={handleToggleCaseClosed}>
                            {selectedCase.status === "closed" ? "Reopen" : "Close Case"}
                          </Btn>
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                        <Badge color={getStatusBadgeColor(selectedCase.status)}>{getClientCaseStatusLabel(selectedCase.status)}</Badge>
                        {selectedCase.metadata?.incident_category && (
                          <Badge color="warning">{getIncidentCategoryLabel(selectedCase.metadata.incident_category)}</Badge>
                        )}
                        {selectedCase.client_name && <Badge color="default">{selectedCase.client_name}</Badge>}
                        {selectedCase.owner_phone && <Badge color="default">{fmtPhoneInput(selectedCase.owner_phone)}</Badge>}
                        {selectedCase.metadata?.reporter_email && <Badge color="default">{selectedCase.metadata.reporter_email}</Badge>}
                      </div>

                      <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.55, marginBottom: 8 }}>{selectedCase.summary}</div>
                      {selectedCase.narrative && (
                        <div style={{ fontSize: 12, color: C.textMut, lineHeight: 1.55 }}>{selectedCase.narrative}</div>
                      )}
                      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 11, color: C.textMut, marginTop: 10 }}>
                        {selectedCase.incident_date && <span>Date: {fmtDate(selectedCase.incident_date)}</span>}
                        {selectedCase.incident_time && <span>Time: {selectedCase.incident_time}</span>}
                        {selectedCase.incident_area && <span>Area: {selectedCase.incident_area}</span>}
                      </div>
                    </Card>

                    <Card style={{ padding: 18 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
                        <div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>Red Binder Documentation</div>
                          <div style={{ fontSize: 12, color: C.textMut }}>Store every required form with the incident, not in a paper binder.</div>
                        </div>
                        <Btn variant="secondary" size="sm" onClick={() => openDocumentEditor()}>Add Red Binder Form</Btn>
                      </div>
                      {selectedCaseDocuments.length === 0 ? (
                        <EmptyState title="No forms attached yet" subtitle="Attach the required Red Binder form pack for this case." />
                      ) : (
                        selectedCaseDocuments.map((document) => {
                          const highlights = buildDocumentHighlights(document);
                          const template = getIncidentTemplateById(document.form_code);
                          return (
                            <div key={document.id} style={{ padding: "12px 0", borderTop: `1px solid ${C.borderLight}` }}>
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                                <div>
                                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{document.form_name}</div>
                                  <div style={{ fontSize: 11, color: C.textMut }}>Source pages {document.source_page_start || template?.pageRange || "—"}</div>
                                </div>
                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                                  <Badge color={document.status === "final" ? "success" : "warning"}>{document.status || "draft"}</Badge>
                                  <Btn variant="ghost" size="sm" onClick={() => openDocumentEditor(document.form_code, document)}>Edit Form</Btn>
                                </div>
                              </div>
                              {highlights.length > 0 && (
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8, marginTop: 10 }}>
                                  {highlights.map((entry) => (
                                    <div key={entry.key} style={{ padding: 10, borderRadius: 12, background: C.bg, border: `1px solid ${C.borderLight}` }}>
                                      <div style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase" }}>{entry.label}</div>
                                      <div style={{ fontSize: 12, color: C.textSec, marginTop: 4, lineHeight: 1.4 }}>{entry.value}</div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </Card>

                    <Card style={{ padding: 18 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
                        <div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>Case Activity</div>
                          <div style={{ fontSize: 12, color: C.textMut }}>Notes, status changes, and documentation updates stay with the case.</div>
                        </div>
                        <Btn variant="secondary" size="sm" onClick={() => setShowNoteModal(true)}>Add Note</Btn>
                      </div>
                      {selectedCaseActivity.length === 0 ? (
                        <EmptyState title="No activity logged yet" subtitle="Add the first case note or attach the first form." />
                      ) : (
                        selectedCaseActivity.map((event) => (
                          <div key={event.id} style={{ padding: "12px 0", borderTop: `1px solid ${C.borderLight}` }}>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 4 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{event.created_by_name || "Staff"}</span>
                              <Badge color="default">{String(event.activity_type || "note").replace(/_/g, " ")}</Badge>
                              <span style={{ fontSize: 11, color: C.textMut }}>{formatTimestamp(event.created_at)}</span>
                            </div>
                            {event.content && <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.5 }}>{event.content}</div>}
                          </div>
                        ))
                      )}
                    </Card>
                  </>
                )}
              </div>
            </div>
          )}

          {tab === "library" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
              {RED_BINDER_FORM_LIBRARY.map((template) => (
                <Card key={template.id} style={{ padding: 18 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>{template.title}</div>
                      <div style={{ fontSize: 12, color: C.textMut, marginTop: 2 }}>Section 10 Red Binder · pages {template.pageRange}</div>
                    </div>
                    <Badge color="info">{getClientCaseTypeLabel(template.caseType)}</Badge>
                  </div>
                  <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.55, marginBottom: 12 }}>{template.description}</div>
                  <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
                    {template.sections.map((section) => (
                      <div key={section.title} style={{ padding: 10, borderRadius: 12, background: C.bg, border: `1px solid ${C.borderLight}` }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: C.pri, textTransform: "uppercase", marginBottom: 6 }}>{section.title}</div>
                        <div style={{ fontSize: 12, color: C.textMut, lineHeight: 1.45 }}>
                          {(section.fields || []).slice(0, 4).map((field) => field.label).join(" · ")}
                          {section.fields.length > 4 ? " …" : ""}
                        </div>
                      </div>
                    ))}
                  </div>
                  <Btn variant="primary" onClick={() => startCaseFromTemplate(template)}>Start Case With This Form</Btn>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {showCaseModal && (
        <Modal
          title={editingCaseId ? "Edit Incident Case" : "New Incident Case"}
          onClose={() => {
            setShowCaseModal(false);
            resetCaseModal();
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 14, maxHeight: "72vh", overflowY: "auto", paddingRight: 4 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <Inp label="Case Type" type="select" value={caseType} onChange={setCaseType} options={CLIENT_CASE_TYPE_OPTIONS} required />
              <Inp label="Status" type="select" value={caseStatus} onChange={setCaseStatus} options={CLIENT_CASE_STATUS_OPTIONS} />
              <Inp label="Incident Category" type="select" value={caseIncidentCategory} onChange={setCaseIncidentCategory} options={INCIDENT_CATEGORY_OPTIONS} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <Inp label="Incident Date" type="date" value={caseIncidentDate} onChange={setCaseIncidentDate} required />
              <Inp label="Incident Time" type="time" value={caseIncidentTime} onChange={setCaseIncidentTime} />
              <Inp label="Area / Room" value={caseIncidentArea} onChange={setCaseIncidentArea} placeholder="Large daycare, lobby, run 12…" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Inp label="Primary Subject" value={caseSubjectName} onChange={setCaseSubjectName} placeholder="Dog name or employee name" required />
              <Inp label="Secondary Subject" value={caseSecondarySubjectName} onChange={setCaseSecondarySubjectName} placeholder="Second dog, witness, etc." />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Inp label="Client / Owner Name" value={caseClientName} onChange={setCaseClientName} placeholder="Owner or client name" />
              <Inp
                label="Owner Phone"
                type="tel"
                value={fmtPhoneInput(caseOwnerPhone)}
                onChange={(value) => setCaseOwnerPhone(String(value || "").replace(/\D/g, "").slice(0, 10))}
              />
            </div>
            <Inp label="Reporter Email" type="email" value={caseReporterEmail} onChange={setCaseReporterEmail} placeholder="Reporter email for follow-up replies" />
            <Inp label="Summary" value={caseSummary} onChange={setCaseSummary} placeholder="Short operational summary of what happened" required />
            <Inp label="Narrative" type="textarea" rows={5} value={caseNarrative} onChange={setCaseNarrative} placeholder="What happened, what led up to it, what happened next, and what follow-up is needed." />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Btn variant="ghost" onClick={() => { setShowCaseModal(false); resetCaseModal(); }}>Cancel</Btn>
              <Btn variant="primary" onClick={handleSaveCase} disabled={savingCase}>
                {savingCase ? "Saving..." : editingCaseId ? "Save Case" : "Create Case"}
              </Btn>
            </div>
          </div>
        </Modal>
      )}

      {showFormModal && (
        <Modal
          title={editingDocumentId ? "Edit Red Binder Form" : "Add Red Binder Form"}
          onClose={() => {
            setShowFormModal(false);
            resetDocumentModal();
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 14, maxHeight: "72vh", overflowY: "auto", paddingRight: 4 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 220px", gap: 12 }}>
              <Inp
                label="Form Template"
                type="select"
                value={documentTemplateId}
                onChange={(value) => {
                  const template = getIncidentTemplateById(value);
                  setDocumentTemplateId(value);
                  setDocumentPayload((current) => Object.keys(current || {}).length > 0 && editingDocumentId ? current : buildDefaultIncidentPayload(template));
                }}
                options={RED_BINDER_FORM_LIBRARY.map((template) => ({ value: template.id, label: `${template.title} (p. ${template.pageRange})` }))}
                required
              />
              <Inp
                label="Document Status"
                type="select"
                value={documentStatus}
                onChange={setDocumentStatus}
                options={[
                  { value: "draft", label: "Draft" },
                  { value: "final", label: "Final" },
                ]}
              />
            </div>

            {selectedTemplate && (
              <div style={{ display: "grid", gap: 12 }}>
                {selectedTemplate.sections.map((section) => (
                  <Card key={section.title} style={{ padding: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 10 }}>{section.title}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                      {section.fields.map((field) => (
                        <Inp
                          key={field.key}
                          label={field.label}
                          type={field.type}
                          rows={field.rows}
                          value={field.type === "tel" ? fmtPhoneInput(documentPayload[field.key] || "") : (documentPayload[field.key] || "")}
                          onChange={(value) => {
                            const nextValue = field.type === "tel"
                              ? String(value || "").replace(/\D/g, "").slice(0, 10)
                              : value;
                            handleDocumentPayloadChange(field.key, nextValue);
                          }}
                          options={field.options}
                          required={field.required}
                        />
                      ))}
                    </div>
                  </Card>
                ))}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Btn variant="ghost" onClick={() => { setShowFormModal(false); resetDocumentModal(); }}>Cancel</Btn>
              <Btn variant="primary" onClick={handleSaveDocument} disabled={savingDocument}>
                {savingDocument ? "Saving..." : editingDocumentId ? "Save Form" : "Add Form"}
              </Btn>
            </div>
          </div>
        </Modal>
      )}

      {showNoteModal && (
        <Modal title="Add Case Note" onClose={() => setShowNoteModal(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Inp
              label="Note"
              type="textarea"
              rows={4}
              value={activityNoteText}
              onChange={setActivityNoteText}
              placeholder="Add management context, follow-up actions, or communication notes."
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Btn variant="ghost" onClick={() => setShowNoteModal(false)}>Cancel</Btn>
              <Btn variant="primary" onClick={handleAddActivityNote} disabled={savingActivity}>
                {savingActivity ? "Saving..." : "Add Note"}
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
