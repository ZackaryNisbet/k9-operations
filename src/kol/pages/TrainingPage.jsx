// K9 Operations — Training Module (Wave 1)
// Implements Training Home, Templates, Active Records, Train New Employee flow,
// and Training Record Detail with section expand/collapse and item completion.

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "../../supabaseClient";
import { C, todayStr, fmtDate, fmtPhoneInput, LC_OP_LABELS } from "../../shared/theme";
import { Btn, Modal, Card, Inp, Badge, CustomSelect } from "../../shared/ui";
import { I } from "../../shared/icons";
import { hasLeanPermission } from "../../shared/permissions";
import {
  ACTIVE_TRAINING_RECORD_STATUSES,
  COMPLETED_TRAINING_RECORD_STATUSES,
  buildCreateLaborEmployeeRpcArgs,
  buildCreateTrainingRecordRpcArgs,
  buildLaborDashboardMetrics,
  buildUpdateLaborEmployeeRpcArgs,
  buildUpdateTrainingRecordConfigArgs,
  buildTrainingTemplateScopeClause,
  formatTrainingTimeRange,
  formatTrainingTimestamp,
  groupLaborEmployeeNotes,
  groupTrainingNotes,
  isLaborEmployeeActive,
  normalizeOptionalUuid,
  resolveTrainingLocationId,
} from "../trainingData";

// ─── Constants ──────────────────────────────────────────────────────────────

const STATUS_COLORS = {
  not_started: { bg: "#F1F5F9", text: "#64748B", label: "Not Started" },
  in_progress: { bg: "#DBEAFE", text: "#1D4ED8", label: "In Progress" },
  complete: { bg: "#DCFCE7", text: "#15803D", label: "Complete" },
  passed: { bg: "#DCFCE7", text: "#15803D", label: "Passed" },
  failed: { bg: "#FEE2E2", text: "#DC2626", label: "Failed" },
  needs_follow_up: { bg: "#FEF3C7", text: "#D97706", label: "Needs Follow-Up" },
  retest_required: { bg: "#FEF3C7", text: "#D97706", label: "Retest Required" },
  archived: { bg: "#F1F5F9", text: "#94A3B8", label: "Archived" },
};

const ITEM_STATUS_COLORS = {
  not_started: { bg: "#F1F5F9", text: "#94A3B8" },
  in_progress: { bg: "#DBEAFE", text: "#1D4ED8" },
  complete: { bg: "#DCFCE7", text: "#15803D" },
  passed: { bg: "#DCFCE7", text: "#15803D" },
  failed: { bg: "#FEE2E2", text: "#DC2626" },
  needs_coaching: { bg: "#FEF3C7", text: "#D97706" },
  blocked: { bg: "#F1F5F9", text: "#94A3B8" },
  waived: { bg: "#F1F5F9", text: "#94A3B8" },
};

const TABS = [
  { id: "home", label: "Home" },
  { id: "training", label: "Training" },
  { id: "templates", label: "Templates" },
  { id: "notes", label: "Notes" },
];

const INLINE_ROSTER_COMPOSER_TRANSITION_MS = 240;
const TRAINING_GRACE_PERIOD_DAYS = 14;
const REVIEW_WARNING_WINDOW_DAYS = 7;
const LABOR_ROSTER_VIEWS_SETTING_KEY = "labor_roster_views";

const LABOR_ROSTER_FILTER_FIELDS = [
  { section: "Employee Info", key: "first_name", label: "First Name", type: "text", ops: ["contains", "equals", "starts", "empty", "notEmpty"] },
  { section: "Employee Info", key: "last_name", label: "Last Name", type: "text", ops: ["contains", "equals", "starts", "empty", "notEmpty"] },
  { section: "Employee Info", key: "email", label: "Email", type: "text", ops: ["contains", "equals", "starts", "empty", "notEmpty"] },
  { section: "Employee Info", key: "phone", label: "Phone", type: "text", ops: ["contains", "equals", "empty", "notEmpty"] },
  { section: "Employment", key: "position", label: "Position", type: "text", ops: ["contains", "equals", "starts", "empty", "notEmpty"] },
  { section: "Employment", key: "employment_status", label: "Employment Status", type: "select", ops: ["is", "isNot"], options: ["active", "inactive"] },
  { section: "Employment", key: "start_date", label: "Start Date", type: "date", ops: ["after", "before", "inLastDays"] },
  { section: "Compliance", key: "training", label: "Training", type: "select", ops: ["is", "isNot"], options: ["Compliant", "In Progress", "Non-Compliant"] },
  { section: "Reviews", key: "review30", label: "30-Day Due", type: "date", ops: ["after", "before", "inLastDays", "hasDate", "noDate"] },
  { section: "Reviews", key: "review60", label: "60-Day Due", type: "date", ops: ["after", "before", "inLastDays", "hasDate", "noDate"] },
  { section: "Reviews", key: "review90", label: "90-Day Due", type: "date", ops: ["after", "before", "inLastDays", "hasDate", "noDate"] },
];

function normalizeLaborContactEmail(value) {
  const trimmed = String(value || "").trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

function normalizeLaborContactPhone(value) {
  const digitsOnly = String(value || "").replace(/\D/g, "").slice(0, 10);
  return digitsOnly || null;
}

function readLaborEmployeeContact(employee, key) {
  return String(employee?.metadata?.[key] || "").trim();
}

function buildUpdatedLaborMetadata(existingMetadata = {}, { email, phone }) {
  const nextMetadata = { ...(existingMetadata || {}) };
  const normalizedEmail = normalizeLaborContactEmail(email);
  const normalizedPhone = normalizeLaborContactPhone(phone);

  if (normalizedEmail) nextMetadata.contact_email = normalizedEmail;
  else delete nextMetadata.contact_email;

  if (normalizedPhone) nextMetadata.contact_phone = normalizedPhone;
  else delete nextMetadata.contact_phone;

  return nextMetadata;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const s = STATUS_COLORS[status] || STATUS_COLORS.not_started;
  return <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: s.bg, color: s.text }}>{s.label}</span>;
}

function ProgressBar({ percent, height = 6 }) {
  const p = Math.min(100, Math.max(0, percent || 0));
  const color = p >= 100 ? C.suc : p > 50 ? C.acc : C.info;
  return (
    <div style={{ width: "100%", height, borderRadius: height / 2, background: C.borderLight, overflow: "hidden" }}>
      <div style={{ width: `${p}%`, height: "100%", borderRadius: height / 2, background: color, transition: "width 0.3s" }} />
    </div>
  );
}

function EmptyState({ icon, title, subtitle }) {
  const IconComp = I[icon];
  return (
    <div style={{ textAlign: "center", padding: "60px 20px", color: C.textMut }}>
      {IconComp && <div style={{ marginBottom: 12, opacity: 0.4 }}><IconComp /></div>}
      <div style={{ fontSize: 16, fontWeight: 600, color: C.textSec, marginBottom: 4 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 13 }}>{subtitle}</div>}
    </div>
  );
}

function SectionHeader({ title, count, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{title}</span>
        {count != null && <Badge color="default">{count}</Badge>}
      </div>
      {children}
    </div>
  );
}

function splitEmployeeName(fullName = "") {
  const tokens = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { firstName: "", lastName: "" };
  if (tokens.length === 1) return { firstName: tokens[0], lastName: "" };
  return {
    firstName: tokens.slice(0, -1).join(" "),
    lastName: tokens[tokens.length - 1],
  };
}

function slugifyTemplateName(value = "") {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 72);
}

function getDaysSince(dateValue) {
  if (!dateValue) return null;
  const start = new Date(`${dateValue}T12:00:00`);
  if (Number.isNaN(start.getTime())) return null;
  const today = new Date(`${todayStr()}T12:00:00`);
  return Math.floor((today.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
}

function getTrainingComplianceState(row) {
  const cprCompliant = ["current", "due_soon"].includes(String(row?.cpr_status || ""));
  const completedTraining = Number(row?.completed_training_record_count || 0) > 0
    || ["complete", "completed", "passed"].includes(String(row?.active_training_status || "").toLowerCase());
  const inTraining = Boolean(row?.active_training_record_id)
    || ["in_progress", "not_started"].includes(String(row?.active_training_status || "").toLowerCase());
  const daysSinceStart = getDaysSince(row?.start_date);
  const withinGraceWindow = daysSinceStart != null && daysSinceStart < TRAINING_GRACE_PERIOD_DAYS;

  if (completedTraining && cprCompliant) {
    return { label: "Compliant", color: "success", inProgress: false };
  }

  if (withinGraceWindow && (inTraining || !cprCompliant || !completedTraining)) {
    return { label: "In Progress", color: "warning", inProgress: true };
  }

  return { label: "Non-Compliant", color: "danger", inProgress: false };
}

function getReviewStatusPresentation(row, reviewKey) {
  const dueDate = row?.[`${reviewKey}_due_date`] || null;
  const status = String(row?.[`${reviewKey}_status`] || "not_started");
  if (!dueDate) {
    return { label: "—", tone: C.textMut, background: "transparent" };
  }

  const due = new Date(`${dueDate}T12:00:00`);
  const today = new Date(`${todayStr()}T12:00:00`);
  const diffDays = Math.ceil((due.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  const doneStatuses = new Set(["completed", "complete", "current"]);

  if (doneStatuses.has(status)) {
    return { label: fmtDate(dueDate), tone: C.suc, background: C.sucLt };
  }
  if (diffDays < 0) {
    return { label: fmtDate(dueDate), tone: C.dan, background: C.danLt };
  }
  if (diffDays <= REVIEW_WARNING_WINDOW_DAYS) {
    return { label: fmtDate(dueDate), tone: C.warn, background: C.warnLt };
  }

  return { label: fmtDate(dueDate), tone: C.suc, background: C.sucLt };
}

function getDueSoonLabel(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "current") return "Current";
  if (normalized === "due_soon") return "Due Soon";
  if (normalized === "expired") return "Expired";
  if (normalized === "not_started") return "Not Started";
  return normalized ? normalized.replace(/_/g, " ") : "Unknown";
}

function applyLaborRosterFilters(rows, filters) {
  const keys = Object.keys(filters || {});
  if (keys.length === 0) return rows;
  const today = todayStr();
  const needsValue = (op) => !["empty", "notEmpty", "has", "missing", "overdue", "today", "thisWeek", "hasDate", "noDate"].includes(op);
  const parseDate = (value) => {
    const text = String(value || "");
    if (!text) return "";
    return text.includes("T") ? text.split("T")[0] : text;
  };
  const matchText = (source, op, value, { digitsOnly = false } = {}) => {
    const left = digitsOnly ? String(source || "").replace(/\D/g, "") : String(source || "").toLowerCase();
    const right = digitsOnly ? String(value || "").replace(/\D/g, "") : String(value || "").toLowerCase();
    if (op === "contains") return left.includes(right);
    if (op === "equals") return left === right;
    if (op === "starts") return left.startsWith(right);
    if (op === "empty") return !left;
    if (op === "notEmpty") return !!left;
    return true;
  };

  return rows.filter((row) => keys.every((key) => {
    const filter = filters[key];
    if (!filter) return true;
    const op = filter.op;
    const val = filter.val;
    if (needsValue(op) && val === "") return true;

    if (key === "first_name") return matchText(row.first_name, op, val);
    if (key === "last_name") return matchText(row.last_name, op, val);
    if (key === "email") return matchText(row.contact_email, op, val);
    if (key === "phone") return matchText(row.contact_phone, op, val, { digitsOnly: true });
    if (key === "position") return matchText(row.position_title, op, val);
    if (key === "employment_status") {
      const status = row.is_active ? "active" : "inactive";
      if (op === "is") return status === val;
      if (op === "isNot") return status !== val;
      return true;
    }
    if (key === "training") {
      const status = String(row.training_compliance?.label || "");
      if (op === "is") return status === val;
      if (op === "isNot") return status !== val;
      return true;
    }

    const dateValue = (() => {
      if (key === "start_date") return parseDate(row.start_date);
      if (key === "review30") return parseDate(row.review_30_due_date);
      if (key === "review60") return parseDate(row.review_60_due_date);
      if (key === "review90") return parseDate(row.review_90_due_date);
      return "";
    })();

    if (key === "start_date" || key === "review30" || key === "review60" || key === "review90") {
      if (op === "hasDate") return !!dateValue;
      if (op === "noDate") return !dateValue;
      if (!dateValue) return false;
      if (op === "after") return dateValue > val;
      if (op === "before") return dateValue < val;
      if (op === "inLastDays") {
        const diff = Math.floor((new Date(`${today}T12:00:00`) - new Date(`${dateValue}T12:00:00`)) / 86400000);
        return diff <= parseInt(val, 10);
      }
    }

    return true;
  }));
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function TrainingPage({ data, save, nav, profile, addGlobalToast }) {
  const [tab, setTab] = useState("home");
  const [loading, setLoading] = useState(true);

  // Data state
  const [templates, setTemplates] = useState([]);
  const [templateVersions, setTemplateVersions] = useState([]);
  const [allTemplateVersions, setAllTemplateVersions] = useState([]);
  const [reviewTemplates, setReviewTemplates] = useState([]);
  const [reviewTemplateVersions, setReviewTemplateVersions] = useState([]);
  const [allReviewTemplateVersions, setAllReviewTemplateVersions] = useState([]);
  const [records, setRecords] = useState([]);
  const [laborEmployees, setLaborEmployees] = useState([]);
  const [rosterSnapshot, setRosterSnapshot] = useState([]);
  const [sections, setSections] = useState([]);
  const [items, setItems] = useState([]);
  const [reviewSections, setReviewSections] = useState([]);
  const [reviewItems, setReviewItems] = useState([]);
  const [itemResults, setItemResults] = useState([]);
  const [notes, setNotes] = useState([]);
  const [recordEvents, setRecordEvents] = useState([]);
  const [laborEmployeeNotes, setLaborEmployeeNotes] = useState([]);
  const [laborEmployeeDocuments, setLaborEmployeeDocuments] = useState([]);
  const [laborAttendanceIncidents, setLaborAttendanceIncidents] = useState([]);
  const [reviewInstances, setReviewInstances] = useState([]);
  const [reviewResponses, setReviewResponses] = useState([]);
  const [employeeCertifications, setEmployeeCertifications] = useState([]);
  const [allTrainingNotes, setAllTrainingNotes] = useState([]);
  const [serverDashboardMetrics, setServerDashboardMetrics] = useState(null);
  const [resolvedLaborLocationId, setResolvedLaborLocationId] = useState("");

  // UI state
  const [showNewRecord, setShowNewRecord] = useState(false);
  const [showRecordConfig, setShowRecordConfig] = useState(false);
  const [selectedRecordId, setSelectedRecordId] = useState(null);
  const [selectedLaborEmployeeId, setSelectedLaborEmployeeId] = useState(null);
  const [selectedReviewInstanceId, setSelectedReviewInstanceId] = useState(null);
  const [previewTemplateKind, setPreviewTemplateKind] = useState("training");
  const [expandedSections, setExpandedSections] = useState({});
  const [expandedItemNotes, setExpandedItemNotes] = useState({});
  const [previewTemplateId, setPreviewTemplateId] = useState(null);
  const [previewTemplateVersionId, setPreviewTemplateVersionId] = useState(null);
  const [savingTemplateAction, setSavingTemplateAction] = useState("");
  const [showCreateTemplateModal, setShowCreateTemplateModal] = useState(false);
  const [createTemplateKind, setCreateTemplateKind] = useState("training");
  const [createTemplateName, setCreateTemplateName] = useState("");
  const [createTemplateClass, setCreateTemplateClass] = useState("training_plan");
  const [createTemplateRoleScopesText, setCreateTemplateRoleScopesText] = useState("");
  const [creatingTemplate, setCreatingTemplate] = useState(false);

  // New record form
  const [newLaborEmployeeId, setNewLaborEmployeeId] = useState("");
  const [newEmployeeName, setNewEmployeeName] = useState("");
  const [newTargetRole, setNewTargetRole] = useState("");
  const [newTemplateId, setNewTemplateId] = useState("");
  const [newHireDate, setNewHireDate] = useState("");
  const [newStartDate, setNewStartDate] = useState(todayStr());
  const [newTargetEndDate, setNewTargetEndDate] = useState("");
  const [creating, setCreating] = useState(false);

  // Record config
  const [configEmployeeName, setConfigEmployeeName] = useState("");
  const [configTargetRole, setConfigTargetRole] = useState("");
  const [configHireDate, setConfigHireDate] = useState("");
  const [configStartDate, setConfigStartDate] = useState("");
  const [configTargetEndDate, setConfigTargetEndDate] = useState("");
  const [configLaborEmployeeId, setConfigLaborEmployeeId] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);

  // Labor employee editor
  const [showLaborEmployeeEditor, setShowLaborEmployeeEditor] = useState(false);
  const [editingLaborEmployeeId, setEditingLaborEmployeeId] = useState(null);
  const [laborEmployeeName, setLaborEmployeeName] = useState("");
  const [laborEmployeePhone, setLaborEmployeePhone] = useState("");
  const [laborEmployeeEmail, setLaborEmployeeEmail] = useState("");
  const [laborEmployeeRole, setLaborEmployeeRole] = useState("");
  const [laborEmployeeStartDate, setLaborEmployeeStartDate] = useState("");
  const [laborEmployeeEndDate, setLaborEmployeeEndDate] = useState("");
  const [savingLaborEmployee, setSavingLaborEmployee] = useState(false);
  const [showInlineLaborEmployeeComposer, setShowInlineLaborEmployeeComposer] = useState(false);
  const [inlineLaborEmployeeComposerEntered, setInlineLaborEmployeeComposerEntered] = useState(false);
  const [newRosterEmployeeFirstName, setNewRosterEmployeeFirstName] = useState("");
  const [newRosterEmployeeLastName, setNewRosterEmployeeLastName] = useState("");
  const [newRosterEmployeePhone, setNewRosterEmployeePhone] = useState("");
  const [newRosterEmployeeEmail, setNewRosterEmployeeEmail] = useState("");
  const [newRosterEmployeeRole, setNewRosterEmployeeRole] = useState("");
  const [newRosterEmployeeStartDate, setNewRosterEmployeeStartDate] = useState(todayStr());
  const [newRosterEmployeeEndDate, setNewRosterEmployeeEndDate] = useState("");
  const [savingInlineLaborEmployee, setSavingInlineLaborEmployee] = useState(false);
  const [justCreatedLaborEmployeeId, setJustCreatedLaborEmployeeId] = useState(null);
  const [employeeNoteText, setEmployeeNoteText] = useState("");
  const [employeeNoteType, setEmployeeNoteType] = useState("general");
  const [savingEmployeeNote, setSavingEmployeeNote] = useState(false);
  const [showCprEditor, setShowCprEditor] = useState(false);
  const [cprCompletedOn, setCprCompletedOn] = useState("");
  const [cprExpiresOn, setCprExpiresOn] = useState("");
  const [cprDocumentUrl, setCprDocumentUrl] = useState("");
  const [cprSourceNote, setCprSourceNote] = useState("");
  const [savingCpr, setSavingCpr] = useState(false);
  const [reviewDrafts, setReviewDrafts] = useState({});
  const [savingReviewItemId, setSavingReviewItemId] = useState(null);
  const [completingReview, setCompletingReview] = useState(false);
  const [showGlobalNoteModal, setShowGlobalNoteModal] = useState(false);
  const [globalNoteEmployeeId, setGlobalNoteEmployeeId] = useState("");
  const [globalNoteType, setGlobalNoteType] = useState("general");
  const [globalNoteText, setGlobalNoteText] = useState("");
  const [savingGlobalNote, setSavingGlobalNote] = useState(false);
  const [noteFilterEmployeeId, setNoteFilterEmployeeId] = useState("");
  const [noteFilterSource, setNoteFilterSource] = useState("all");
  const [noteFilterType, setNoteFilterType] = useState("all");
  const [noteFilterDateRange, setNoteFilterDateRange] = useState("all");
  const [showInactiveRoster, setShowInactiveRoster] = useState(false);
  const [rosterSort, setRosterSort] = useState({ key: "last_name", direction: "asc" });
  const [rosterFilters, setRosterFilters] = useState({});
  const [rosterDraftFilters, setRosterDraftFilters] = useState({});
  const [savedRosterViews, setSavedRosterViews] = useState([]);
  const [activeRosterViewId, setActiveRosterViewId] = useState(null);
  const [showRosterFilterPanel, setShowRosterFilterPanel] = useState(false);
  const [showRosterFilterPicker, setShowRosterFilterPicker] = useState(false);
  const [rosterFilterPickerReady, setRosterFilterPickerReady] = useState(false);
  const [configuringRosterKey, setConfiguringRosterKey] = useState(null);
  const [showSaveRosterView, setShowSaveRosterView] = useState(false);
  const [rosterViewName, setRosterViewName] = useState("");
  const firstRosterNameInputRef = useRef(null);
  const prevRosterFilterOpen = useRef(false);

  // Notes
  const [generalNoteText, setGeneralNoteText] = useState("");
  const [itemNoteDrafts, setItemNoteDrafts] = useState({});
  const [savingItemNoteId, setSavingItemNoteId] = useState(null);
  const [savingGeneralNote, setSavingGeneralNote] = useState(false);

  const locationRef = profile?.location_id || data?.locationId || "";
  const laborLocationRef = resolvedLaborLocationId || locationRef || "";
  const actorUserId = normalizeOptionalUuid(profile?.user_id || profile?.id);
  const actorName = profile?.name || profile?.full_name || profile?.email || "System";
  const canManageTemplates = hasLeanPermission(profile, "Checklist Templates");

  useEffect(() => {
    if (!laborLocationRef) return;
    supabase
      .from("lite_settings")
      .select("setting_value")
      .eq("location_id", laborLocationRef)
      .eq("setting_key", LABOR_ROSTER_VIEWS_SETTING_KEY)
      .maybeSingle()
      .then(({ data: row }) => {
        if (Array.isArray(row?.setting_value)) setSavedRosterViews(row.setting_value);
      });
  }, [laborLocationRef]);

  const persistRosterViews = useCallback(async (views) => {
    if (!laborLocationRef) return;
    setSavedRosterViews(views);
    await supabase
      .from("lite_settings")
      .upsert(
        {
          location_id: laborLocationRef,
          setting_key: LABOR_ROSTER_VIEWS_SETTING_KEY,
          setting_value: views,
        },
        { onConflict: "location_id,setting_key" },
      );
  }, [laborLocationRef]);

  useEffect(() => {
    if (showRosterFilterPanel && !prevRosterFilterOpen.current) {
      setRosterDraftFilters({ ...rosterFilters });
      setShowRosterFilterPicker(false);
      setConfiguringRosterKey(null);
    }
    prevRosterFilterOpen.current = showRosterFilterPanel;
  }, [rosterFilters, showRosterFilterPanel]);

  // ── Load data ──
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const resolvedLocationId = await resolveTrainingLocationId(supabase, locationRef, actorUserId);
      if (!resolvedLocationId) {
        setResolvedLaborLocationId("");
        setTemplates([]);
        setTemplateVersions([]);
        setAllTemplateVersions([]);
        setReviewTemplates([]);
        setReviewTemplateVersions([]);
        setAllReviewTemplateVersions([]);
        setRecords([]);
        setLaborEmployees([]);
        setRosterSnapshot([]);
        setSections([]);
        setItems([]);
        setReviewSections([]);
        setReviewItems([]);
        setLaborEmployeeNotes([]);
        setLaborEmployeeDocuments([]);
        setReviewInstances([]);
        setReviewResponses([]);
        setEmployeeCertifications([]);
        setAllTrainingNotes([]);
        setServerDashboardMetrics(null);
        setLoading(false);
        return;
      }
      setResolvedLaborLocationId(resolvedLocationId);

      const [
        templateRes,
        reviewTemplateRes,
        recordRes,
        employeeRes,
      ] = await Promise.all([
        supabase
          .from("training_templates")
          .select("*")
          .or(buildTrainingTemplateScopeClause(resolvedLocationId))
          .order("name"),
        supabase
          .from("review_templates")
          .select("*")
          .or(buildTrainingTemplateScopeClause(resolvedLocationId))
          .order("name"),
        supabase
          .from("training_records")
          .select("*")
          .eq("location_id", resolvedLocationId)
          .order("created_at", { ascending: false }),
        supabase
          .from("labor_employees")
          .select("*")
          .eq("location_id", resolvedLocationId)
          .order("full_name"),
      ]);

      if (templateRes.error) throw templateRes.error;
      if (reviewTemplateRes.error) throw reviewTemplateRes.error;
      if (recordRes.error) throw recordRes.error;
      if (employeeRes.error) throw employeeRes.error;

      const templateRows = templateRes.data || [];
      const reviewTemplateRows = reviewTemplateRes.data || [];
      const recordRows = recordRes.data || [];
      const employeeRows = employeeRes.data || [];
      const recordIds = recordRows.map((record) => record.id);

      const [trainingVersionRes, reviewVersionRes] = await Promise.all([
        templateRows.length > 0
          ? supabase
              .from("training_template_versions")
              .select("*")
              .in("template_id", templateRows.map((template) => template.id))
              .order("template_id")
              .order("version_no", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        reviewTemplateRows.length > 0
          ? supabase
              .from("review_template_versions")
              .select("*")
              .in("template_id", reviewTemplateRows.map((template) => template.id))
              .order("template_id")
              .order("version_no", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (trainingVersionRes.error) throw trainingVersionRes.error;
      if (reviewVersionRes.error) throw reviewVersionRes.error;

      const allVersionRows = trainingVersionRes.data || [];
      const currentVersionRows = allVersionRows.filter((version) => version.is_current && version.status === "published");
      const allReviewVersionRows = reviewVersionRes.data || [];
      const currentReviewVersionRows = allReviewVersionRows.filter((version) => version.is_current && version.status === "published");

      const [
        sectionRes,
        itemRes,
        reviewSectionRes,
        reviewItemRes,
      ] = await Promise.all([
        allVersionRows.length > 0
          ? supabase.from("training_template_sections").select("*").in("template_version_id", allVersionRows.map((version) => version.id)).order("sequence_order")
          : Promise.resolve({ data: [], error: null }),
        allVersionRows.length > 0
          ? supabase.from("training_template_items").select("*").in("template_version_id", allVersionRows.map((version) => version.id)).order("sequence_order")
          : Promise.resolve({ data: [], error: null }),
        allReviewVersionRows.length > 0
          ? supabase.from("review_sections").select("*").in("template_version_id", allReviewVersionRows.map((version) => version.id)).order("sequence_order")
          : Promise.resolve({ data: [], error: null }),
        allReviewVersionRows.length > 0
          ? supabase.from("review_items").select("*").in("template_version_id", allReviewVersionRows.map((version) => version.id)).order("sequence_order")
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (sectionRes.error) throw sectionRes.error;
      if (itemRes.error) throw itemRes.error;
      if (reviewSectionRes.error) throw reviewSectionRes.error;
      if (reviewItemRes.error) throw reviewItemRes.error;

      let rosterRows = [];
      let metricsFromServer = null;
      try {
        const { data: dashboardData, error: dashboardError } = await supabase.rpc("get_labor_dashboard_snapshot", {
          p_location_ref: resolvedLocationId,
          p_actor_user_id: actorUserId,
        });
        if (dashboardError) throw dashboardError;
        rosterRows = Array.isArray(dashboardData?.roster) ? dashboardData.roster : [];
        metricsFromServer = dashboardData?.metrics || null;
      } catch (dashboardError) {
        try {
          const { data: legacyRosterData, error: legacyRosterError } = await supabase.rpc("get_labor_roster_snapshot", {
            p_location_ref: resolvedLocationId,
            p_actor_user_id: actorUserId,
          });
          if (legacyRosterError) throw legacyRosterError;
          rosterRows = Array.isArray(legacyRosterData) ? legacyRosterData : legacyRosterData || [];
        } catch (rosterError) {
          console.warn("Labor roster snapshot load skipped:", dashboardError, rosterError);
        }
      }

      const employeeIds = employeeRows.map((employee) => employee.id);
      const [noteRes, documentRes, attendanceIncidentRes, reviewInstanceRes, certificationRes] = await Promise.all([
        employeeIds.length > 0
          ? supabase.from("labor_employee_notes").select("*").in("labor_employee_id", employeeIds).order("created_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        employeeIds.length > 0
          ? supabase.from("labor_employee_documents").select("*").in("labor_employee_id", employeeIds).order("uploaded_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        employeeIds.length > 0
          ? supabase.from("attendance_incidents").select("*").in("labor_employee_id", employeeIds).order("incident_date", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        employeeIds.length > 0
          ? supabase.from("employee_review_instances").select("*").in("labor_employee_id", employeeIds).order("created_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        employeeIds.length > 0
          ? supabase.from("employee_certifications").select("*").in("labor_employee_id", employeeIds).order("completed_on", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (noteRes.error) throw noteRes.error;
      if (documentRes.error) throw documentRes.error;
      if (attendanceIncidentRes.error) throw attendanceIncidentRes.error;
      if (reviewInstanceRes.error) throw reviewInstanceRes.error;
      if (certificationRes.error) throw certificationRes.error;

      const reviewInstanceIds = (reviewInstanceRes.data || []).map((instance) => instance.id);
      const [responseRes, trainingNoteRes] = await Promise.all([
        reviewInstanceIds.length > 0
          ? supabase
              .from("employee_review_responses")
              .select("*")
              .in("review_instance_id", reviewInstanceIds)
              .order("created_at", { ascending: true })
          : Promise.resolve({ data: [], error: null }),
        recordIds.length > 0
          ? supabase
              .from("training_record_notes")
              .select("*")
              .in("record_id", recordIds)
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (responseRes.error) throw responseRes.error;
      if (trainingNoteRes.error) throw trainingNoteRes.error;

      setTemplates(templateRows);
      setTemplateVersions(currentVersionRows);
      setAllTemplateVersions(allVersionRows);
      setReviewTemplates(reviewTemplateRows);
      setReviewTemplateVersions(currentReviewVersionRows);
      setAllReviewTemplateVersions(allReviewVersionRows);
      setRecords(recordRows);
      setLaborEmployees(employeeRows);
      setRosterSnapshot(rosterRows);
      setSections(sectionRes.data || []);
      setItems(itemRes.data || []);
      setReviewSections(reviewSectionRes.data || []);
      setReviewItems(reviewItemRes.data || []);
      setLaborEmployeeNotes(noteRes.data || []);
      setLaborEmployeeDocuments(documentRes.data || []);
      setLaborAttendanceIncidents(attendanceIncidentRes.data || []);
      setReviewInstances(reviewInstanceRes.data || []);
      setReviewResponses(responseRes.data || []);
      setEmployeeCertifications(certificationRes.data || []);
      setAllTrainingNotes(trainingNoteRes.data || []);
      setServerDashboardMetrics(metricsFromServer);
    } catch (err) {
      console.error("Labor data load error:", err);
      addGlobalToast("Failed to load labor data", "error");
    }
    setLoading(false);
  }, [actorUserId, addGlobalToast, locationRef]);

  useEffect(() => { loadData(); }, [loadData]);

  // Load record detail data when a record is selected
  useEffect(() => {
    if (!selectedRecordId) return;
    (async () => {
      const [irRes, nRes, eRes] = await Promise.all([
        supabase.from("training_record_item_results").select("*").eq("record_id", selectedRecordId),
        supabase.from("training_record_notes").select("*").eq("record_id", selectedRecordId).order("created_at", { ascending: false }),
        supabase.from("training_record_events").select("*").eq("record_id", selectedRecordId).order("created_at", { ascending: false }),
      ]);
      setItemResults(irRes.data || []);
      setNotes(nRes.data || []);
      setRecordEvents(eRes.data || []);
    })();
  }, [selectedRecordId]);

  // ── Derived data ──
  const activeRecords = useMemo(() => records.filter(r => ACTIVE_TRAINING_RECORD_STATUSES.includes(r.overall_status)), [records]);
  const completedRecords = useMemo(() => records.filter(r => COMPLETED_TRAINING_RECORD_STATUSES.includes(r.overall_status)), [records]);
  const activeTemplates = useMemo(() => templates.filter(t => t.is_active), [templates]);
  const activeLaborEmployees = useMemo(() => rosterSnapshot.filter((row) => isLaborEmployeeActive(row)), [rosterSnapshot]);
  const laborNotesByEmployee = useMemo(() => groupLaborEmployeeNotes(laborEmployeeNotes), [laborEmployeeNotes]);
  const fallbackDashboardMetrics = useMemo(() => {
    return buildLaborDashboardMetrics({
      rosterSnapshot,
      employeeNotes: laborEmployeeNotes,
      attendanceIncidents: laborAttendanceIncidents,
    });
  }, [laborAttendanceIncidents, laborEmployeeNotes, rosterSnapshot]);
  const dashboardMetrics = useMemo(() => {
    if (serverDashboardMetrics) {
      return {
        activeEmployeeCount: Number(serverDashboardMetrics.active_employee_count ?? fallbackDashboardMetrics.activeEmployeeCount),
        employeeNoteCount30d: Number(
          serverDashboardMetrics.employee_note_count_30d
            ?? serverDashboardMetrics.employee_note_count_7d
            ?? fallbackDashboardMetrics.employeeNoteCount30d
        ),
        attendanceMarkCount30d: Number(
          serverDashboardMetrics.attendance_mark_count_30d
            ?? fallbackDashboardMetrics.attendanceMarkCount30d
        ),
        newHireCount30d: Number(serverDashboardMetrics.new_hire_count_30d ?? fallbackDashboardMetrics.newHireCount30d),
        terminationCount30d: Number(serverDashboardMetrics.termination_count_30d ?? fallbackDashboardMetrics.terminationCount30d),
        activeTraineeCount: Number(serverDashboardMetrics.active_trainee_count ?? fallbackDashboardMetrics.activeTraineeCount),
        trainingComplianceNumerator: Number(
          serverDashboardMetrics.training_compliance_numerator ?? fallbackDashboardMetrics.trainingComplianceNumerator
        ),
        trainingComplianceDenominator: Number(
          serverDashboardMetrics.training_compliance_denominator ?? fallbackDashboardMetrics.trainingComplianceDenominator
        ),
        trainingComplianceScore: Number(
          serverDashboardMetrics.training_compliance_score ?? fallbackDashboardMetrics.trainingComplianceScore
        ),
      };
    }
    return fallbackDashboardMetrics;
  }, [fallbackDashboardMetrics, serverDashboardMetrics]);

  const selectedRecord = useMemo(() => records.find(r => r.id === selectedRecordId), [records, selectedRecordId]);
  const selectedLaborEmployee = useMemo(() => {
    const employeeId = selectedLaborEmployeeId || selectedRecord?.labor_employee_id;
    if (!employeeId) return null;
    return laborEmployees.find((employee) => employee.id === employeeId) || null;
  }, [laborEmployees, selectedLaborEmployeeId, selectedRecord]);
  const selectedLaborEmployeeSnapshot = useMemo(() => {
    const employeeId = selectedLaborEmployeeId || selectedRecord?.labor_employee_id;
    if (!employeeId) return null;
    return rosterSnapshot.find((row) => row.labor_employee_id === employeeId) || null;
  }, [rosterSnapshot, selectedLaborEmployeeId, selectedRecord]);
  const selectedLaborEmployeeView = useMemo(() => {
    if (!selectedLaborEmployee && !selectedLaborEmployeeSnapshot) return null;
    const employeeId = selectedLaborEmployee?.id || selectedLaborEmployeeSnapshot?.labor_employee_id || null;
    return {
      ...(selectedLaborEmployeeSnapshot || {}),
      ...(selectedLaborEmployee || {}),
      id: employeeId,
      labor_employee_id: employeeId,
      full_name: selectedLaborEmployee?.full_name || selectedLaborEmployeeSnapshot?.full_name || "",
      position_title: selectedLaborEmployee?.position_title || selectedLaborEmployeeSnapshot?.position_title || "",
      start_date: selectedLaborEmployee?.start_date || selectedLaborEmployeeSnapshot?.start_date || null,
      end_date: selectedLaborEmployee?.end_date || selectedLaborEmployeeSnapshot?.end_date || null,
      metadata: selectedLaborEmployee?.metadata || {},
    };
  }, [selectedLaborEmployee, selectedLaborEmployeeSnapshot]);
  const laborEmployeeMap = useMemo(() => Object.fromEntries(laborEmployees.map((employee) => [employee.id, employee])), [laborEmployees]);
  const recordMap = useMemo(() => Object.fromEntries(records.map((record) => [record.id, record])), [records]);
  const selectedVersion = useMemo(() => {
    if (!selectedRecord) return null;
    return templateVersions.find(v => v.id === selectedRecord.template_version_id);
  }, [selectedRecord, templateVersions]);
  const groupedNotes = useMemo(() => groupTrainingNotes(notes), [notes]);
  const selectedEmployeeNotes = useMemo(() => {
    if (!selectedLaborEmployeeView?.id) return [];
    return laborNotesByEmployee[selectedLaborEmployeeView.id] || [];
  }, [laborNotesByEmployee, selectedLaborEmployeeView]);
  const selectedEmployeeDocuments = useMemo(() => {
    if (!selectedLaborEmployeeView?.id) return [];
    return laborEmployeeDocuments.filter((document) => document.labor_employee_id === selectedLaborEmployeeView.id);
  }, [laborEmployeeDocuments, selectedLaborEmployeeView]);
  const selectedEmployeeReviewInstances = useMemo(() => {
    if (!selectedLaborEmployeeView?.id) return [];
    return reviewInstances.filter((instance) => instance.labor_employee_id === selectedLaborEmployeeView.id);
  }, [reviewInstances, selectedLaborEmployeeView]);
  const selectedEmployeeCertifications = useMemo(() => {
    if (!selectedLaborEmployeeView?.id) return [];
    return employeeCertifications.filter((row) => row.labor_employee_id === selectedLaborEmployeeView.id);
  }, [employeeCertifications, selectedLaborEmployeeView]);
  const selectedEmployeeNotes30d = useMemo(() => {
    const now = Date.now();
    return selectedEmployeeNotes.filter((note) => {
      const createdAt = note?.created_at ? new Date(note.created_at).getTime() : NaN;
      return Number.isFinite(createdAt) && now - createdAt <= 30 * 24 * 60 * 60 * 1000;
    });
  }, [selectedEmployeeNotes]);
  const selectedEmployeeAttendanceIncidents30d = useMemo(() => {
    if (!selectedLaborEmployeeView?.id) return [];
    const now = Date.now();
    return laborAttendanceIncidents.filter((incident) => {
      if (incident.labor_employee_id !== selectedLaborEmployeeView.id) return false;
      const incidentDate = incident?.incident_date ? new Date(`${incident.incident_date}T12:00:00`).getTime() : NaN;
      return Number.isFinite(incidentDate) && now - incidentDate <= 30 * 24 * 60 * 60 * 1000;
    });
  }, [laborAttendanceIncidents, selectedLaborEmployeeView]);
  const selectedReviewInstance = useMemo(() => {
    if (!selectedReviewInstanceId) return null;
    return reviewInstances.find((instance) => instance.id === selectedReviewInstanceId) || null;
  }, [reviewInstances, selectedReviewInstanceId]);
  const selectedReviewTemplateVersion = useMemo(() => {
    if (!selectedReviewInstance?.template_version_id) return null;
    return allReviewTemplateVersions.find((version) => version.id === selectedReviewInstance.template_version_id) || null;
  }, [allReviewTemplateVersions, selectedReviewInstance]);
  const selectedReviewTemplate = useMemo(() => {
    if (!selectedReviewInstance?.template_id) return null;
    return reviewTemplates.find((template) => template.id === selectedReviewInstance.template_id) || null;
  }, [reviewTemplates, selectedReviewInstance]);
  const selectedReviewSections = useMemo(() => {
    if (!selectedReviewTemplateVersion?.id) return [];
    return reviewSections
      .filter((section) => section.template_version_id === selectedReviewTemplateVersion.id)
      .sort((a, b) => a.sequence_order - b.sequence_order)
      .map((section) => ({
        ...section,
        items: reviewItems
          .filter((item) => item.review_section_id === section.id)
          .sort((a, b) => a.sequence_order - b.sequence_order),
      }));
  }, [reviewItems, reviewSections, selectedReviewTemplateVersion]);

  const recordSections = useMemo(() => {
    if (!selectedRecord) return [];
    return sections.filter(s => s.template_version_id === selectedRecord.template_version_id && !s.parent_section_id).sort((a, b) => a.sequence_order - b.sequence_order);
  }, [selectedRecord, sections]);

  const getChildSections = useCallback((parentId) => {
    return sections.filter(s => s.parent_section_id === parentId).sort((a, b) => a.sequence_order - b.sequence_order);
  }, [sections]);

  const getSectionItems = useCallback((sectionId) => {
    return items.filter(i => i.template_section_id === sectionId).sort((a, b) => a.sequence_order - b.sequence_order);
  }, [items]);

  const getItemResult = useCallback((itemId) => {
    return itemResults.find(r => r.template_item_id === itemId);
  }, [itemResults]);

  const getItemById = useCallback((itemId) => items.find((item) => item.id === itemId), [items]);
  const getSectionById = useCallback((sectionId) => sections.find((section) => section.id === sectionId), [sections]);
  const getItemNotes = useCallback((itemId) => groupedNotes.itemNotes[itemId] || [], [groupedNotes.itemNotes]);

  const laborEmployeeOptions = useMemo(() => {
    const suggestedRoster = rosterSnapshot
      .filter((row) => isLaborEmployeeActive(row) && Number(row.open_training_record_count || 0) === 0)
      .map((row) => laborEmployees.find((employee) => employee.id === row.labor_employee_id))
      .filter(Boolean);
    const fallbackEmployees = laborEmployees.filter((employee) => !suggestedRoster.some((entry) => entry.id === employee.id));
    return [...suggestedRoster, ...fallbackEmployees].map((employee) => ({
      value: employee.id,
      label: `${employee.full_name} (${employee.position_title})`,
    }));
  }, [laborEmployees, rosterSnapshot]);

  // Template stats: section and item counts per template
  const templateStats = useMemo(() => {
    const stats = {};
    templates.forEach(t => {
      const v = allTemplateVersions.find(tv => tv.template_id === t.id && tv.is_current);
      if (!v) { stats[t.id] = { sectionCount: 0, itemCount: 0 }; return; }
      const tSections = sections.filter(s => s.template_version_id === v.id && !s.parent_section_id);
      const tItems = items.filter(i => i.template_version_id === v.id);
      stats[t.id] = { sectionCount: tSections.length, itemCount: tItems.length };
    });
    return stats;
  }, [allTemplateVersions, templates, sections, items]);

  const reviewTemplateStats = useMemo(() => {
    const stats = {};
    reviewTemplates.forEach((template) => {
      const version = allReviewTemplateVersions.find((row) => row.template_id === template.id && row.is_current);
      if (!version) {
        stats[template.id] = { sectionCount: 0, itemCount: 0 };
        return;
      }
      stats[template.id] = {
        sectionCount: reviewSections.filter((section) => section.template_version_id === version.id).length,
        itemCount: reviewItems.filter((item) => item.template_version_id === version.id).length,
      };
    });
    return stats;
  }, [allReviewTemplateVersions, reviewItems, reviewSections, reviewTemplates]);

  const combinedTemplateRows = useMemo(() => {
    const trainingRows = templates.map((template) => ({
      id: template.id,
      kind: "training",
      slug: template.slug,
      name: template.name,
      role_scopes: template.role_scopes || [],
      template_class: template.template_class,
      version: allTemplateVersions.find((version) => version.template_id === template.id && version.is_current) || null,
      stats: templateStats[template.id] || { sectionCount: 0, itemCount: 0 },
    }));
    const reviewRows = reviewTemplates.map((template) => ({
      id: template.id,
      kind: "review",
      slug: template.slug,
      name: template.name,
      role_scopes: template.role_scopes || [],
      template_class: "performance_review",
      version: allReviewTemplateVersions.find((version) => version.template_id === template.id && version.is_current) || null,
      stats: reviewTemplateStats[template.id] || { sectionCount: 0, itemCount: 0 },
    }));
    return [...trainingRows, ...reviewRows];
  }, [allReviewTemplateVersions, allTemplateVersions, reviewTemplateStats, reviewTemplates, templateStats, templates]);
  const templateGroups = useMemo(() => ([
    {
      key: "onboarding",
      label: "Onboarding & Training",
      rows: combinedTemplateRows.filter((row) =>
        row.kind === "training" && ["training_plan", "competency_guide", "master_dependency_checklist"].includes(row.template_class)
      ),
    },
    {
      key: "certifications",
      label: "Certifications",
      rows: combinedTemplateRows.filter((row) =>
        row.kind === "training" && !["training_plan", "competency_guide", "master_dependency_checklist"].includes(row.template_class)
      ),
    },
    {
      key: "reviews",
      label: "30/60/90 Reviews",
      rows: combinedTemplateRows.filter((row) => row.kind === "review"),
    },
  ]), [combinedTemplateRows]);

  // Template preview data
  const previewTemplateVersionHistory = useMemo(() => {
    if (!previewTemplateId) return [];
    const versionSource = previewTemplateKind === "review" ? allReviewTemplateVersions : allTemplateVersions;
    return versionSource
      .filter((version) => version.template_id === previewTemplateId)
      .sort((a, b) => b.version_no - a.version_no);
  }, [allReviewTemplateVersions, allTemplateVersions, previewTemplateId, previewTemplateKind]);

  const previewTemplate = useMemo(() => {
    if (!previewTemplateId) return null;
    if (previewTemplateKind === "review") {
      const template = reviewTemplates.find((row) => row.id === previewTemplateId);
      if (!template) return null;
      const version = previewTemplateVersionId
        ? allReviewTemplateVersions.find((row) => row.id === previewTemplateVersionId && row.template_id === template.id)
        : allReviewTemplateVersions.find((row) => row.template_id === template.id && row.is_current);
      if (!version) return { ...template, kind: "review", version: null, sections: [] };
      const sectionData = reviewSections
        .filter((section) => section.template_version_id === version.id)
        .sort((a, b) => a.sequence_order - b.sequence_order)
        .map((section) => ({
          ...section,
          items: reviewItems
            .filter((item) => item.review_section_id === section.id)
            .sort((a, b) => a.sequence_order - b.sequence_order),
        }));
      return { ...template, kind: "review", version, sections: sectionData };
    }

    const template = templates.find((row) => row.id === previewTemplateId);
    if (!template) return null;
    const version = previewTemplateVersionId
      ? allTemplateVersions.find((row) => row.id === previewTemplateVersionId && row.template_id === template.id)
      : allTemplateVersions.find((row) => row.template_id === template.id && row.is_current);
    if (!version) return { ...template, kind: "training", version: null, sections: [] };
    const templateSections = sections.filter((section) => section.template_version_id === version.id && !section.parent_section_id)
      .sort((a, b) => a.sequence_order - b.sequence_order);
    const sectionData = templateSections.map((section) => {
      const childSections = sections.filter((row) => row.parent_section_id === section.id)
        .sort((a, b) => a.sequence_order - b.sequence_order);
      const directItems = items.filter((item) => item.template_section_id === section.id)
        .sort((a, b) => a.sequence_order - b.sequence_order);
      const childData = childSections.map((childSection) => ({
        ...childSection,
        items: items.filter((item) => item.template_section_id === childSection.id)
          .sort((a, b) => a.sequence_order - b.sequence_order),
      }));
      return { ...section, children: childData, directItems };
    });
    return { ...template, kind: "training", version, sections: sectionData };
  }, [allReviewTemplateVersions, allTemplateVersions, items, previewTemplateId, previewTemplateKind, previewTemplateVersionId, reviewItems, reviewSections, reviewTemplates, sections, templates]);
  const globalNotesFeed = useMemo(() => {
    const employeeNotesFeed = laborEmployeeNotes.map((note) => {
      const employee = laborEmployeeMap[note.labor_employee_id];
      return {
        id: `employee_${note.id}`,
        entityId: note.id,
        employeeId: note.labor_employee_id,
        employeeName: employee?.full_name || "Unknown Employee",
        sourceModule: note.source_module || "labor",
        sourceLabel: "Employee Note",
        noteType: note.note_type || "general",
        createdAt: note.created_at,
        createdByName: note.created_by_name || "Staff",
        noteText: note.note_text,
      };
    });
    const trainingNotesFeed = allTrainingNotes.map((note) => {
      const record = recordMap[note.record_id];
      const employee = laborEmployeeMap[record?.labor_employee_id];
      const item = note.template_item_id ? getItemById(note.template_item_id) : null;
      const section = note.template_section_id ? getSectionById(note.template_section_id) : null;
      return {
        id: `training_${note.id}`,
        entityId: note.id,
        employeeId: record?.labor_employee_id || null,
        employeeName: employee?.full_name || record?.employee_full_name || "Unknown Employee",
        sourceModule: "training",
        sourceLabel: item?.label || section?.title || record?.template_name_snapshot || "Training Record",
        noteType: note.template_item_id ? "task_observation" : "record_note",
        createdAt: note.created_at,
        createdByName: note.created_by_name || note.initials || "Staff",
        noteText: note.note_text,
      };
    });
    return [...employeeNotesFeed, ...trainingNotesFeed]
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }, [allTrainingNotes, getItemById, getSectionById, laborEmployeeMap, laborEmployeeNotes, recordMap]);
  const filteredGlobalNotes = useMemo(() => {
    const now = new Date();
    return globalNotesFeed.filter((note) => {
      if (noteFilterEmployeeId && note.employeeId !== noteFilterEmployeeId) return false;
      if (noteFilterSource !== "all" && note.sourceModule !== noteFilterSource) return false;
      if (noteFilterType !== "all" && note.noteType !== noteFilterType) return false;
      if (noteFilterDateRange !== "all") {
        const createdAt = note.createdAt ? new Date(note.createdAt) : null;
        if (!createdAt || Number.isNaN(createdAt.getTime())) return false;
        const diffDays = (now.getTime() - createdAt.getTime()) / (24 * 60 * 60 * 1000);
        if (noteFilterDateRange === "7d" && diffDays > 7) return false;
        if (noteFilterDateRange === "30d" && diffDays > 30) return false;
        if (noteFilterDateRange === "90d" && diffDays > 90) return false;
      }
      return true;
    });
  }, [globalNotesFeed, noteFilterDateRange, noteFilterEmployeeId, noteFilterSource, noteFilterType]);

  // Role-filtered template options for new record
  const templateOptions = useMemo(() => {
    return activeTemplates
      .filter(t => t.template_class === "training_plan")
      .map(t => {
        const v = templateVersions.find(tv => tv.template_id === t.id);
        const stats = templateStats[t.id] || {};
        return { value: t.id, label: `${t.name} (${t.role_scopes.join(", ")})`, versionId: v?.id, roleScopes: t.role_scopes, stats };
      });
  }, [activeTemplates, templateVersions, templateStats]);

  const appendEmployeeNote = useCallback(async ({ laborEmployeeId, noteText, noteType }) => {
    return supabase.rpc("append_labor_employee_note", {
      p_labor_employee_id: laborEmployeeId,
      p_note_text: noteText.trim(),
      p_note_type: noteType,
      p_visibility_scope: "manager_only",
      p_source_module: "labor",
      p_actor_user_id: actorUserId,
      p_actor_name: actorName,
    });
  }, [actorName, actorUserId]);

  // ── Create record ──
  const handleCreateRecord = useCallback(async () => {
    if (!newEmployeeName.trim() || !newTemplateId || !newTargetRole.trim()) {
      addGlobalToast("Please fill in required fields", "error");
      return;
    }
    setCreating(true);
    try {
      const { data: createdRecord, error } = await supabase.rpc(
        "create_training_record",
        buildCreateTrainingRecordRpcArgs({
          templateId: newTemplateId,
          locationRef: laborLocationRef,
          employeeFullName: newEmployeeName,
          targetRole: newTargetRole,
          hireDate: newHireDate,
          trainingStartDate: newStartDate,
          targetEndDate: newTargetEndDate,
          actorUserId,
          actorName,
          laborEmployeeId: newLaborEmployeeId,
        })
      );
      if (error) throw error;
      const record = Array.isArray(createdRecord) ? createdRecord[0] : createdRecord;
      if (!record?.id) throw new Error("Training record was not returned by the server");

      addGlobalToast(`Training record created for ${newEmployeeName.trim()}`, "success");
      setShowNewRecord(false);
      resetNewRecordForm();
      await loadData();
      setSelectedRecordId(record.id);
      setTab("training");
    } catch (err) {
      console.error("Create record error:", err);
      addGlobalToast("Failed to create record: " + (err.message || "Unknown error"), "error");
    }
    setCreating(false);
  }, [actorName, actorUserId, addGlobalToast, laborLocationRef, loadData, newEmployeeName, newHireDate, newLaborEmployeeId, newStartDate, newTargetEndDate, newTargetRole, newTemplateId]);

  const resetNewRecordForm = () => {
    setNewLaborEmployeeId("");
    setNewEmployeeName("");
    setNewTargetRole("");
    setNewTemplateId("");
    setNewHireDate("");
    setNewStartDate(todayStr());
    setNewTargetEndDate("");
  };

  // ── Toggle item completion ──
  const handleToggleItem = useCallback(async (itemId) => {
    const result = itemResults.find(r => r.template_item_id === itemId);
    if (!result) return;
    const newStatus = result.status === "complete" ? "not_started" : "complete";
    const { data, error } = await supabase.rpc("set_training_item_status", {
      p_record_id: selectedRecordId,
      p_template_item_id: itemId,
      p_status: newStatus,
      p_actor_user_id: actorUserId,
      p_actor_name: actorName,
    });

    if (error || !data?.result || !data?.record) {
      addGlobalToast("Failed to update item", "error");
      return;
    }

    setItemResults(prev => prev.map(r => r.id === data.result.id ? data.result : r));
    setRecords(prev => prev.map(r => r.id === data.record.id ? data.record : r));
  }, [actorName, actorUserId, addGlobalToast, itemResults, selectedRecordId]);

  const reloadRecordNotesAndEvents = useCallback(async () => {
    if (!selectedRecordId) return;
    const [nRes, eRes] = await Promise.all([
      supabase.from("training_record_notes").select("*").eq("record_id", selectedRecordId).order("created_at", { ascending: false }),
      supabase.from("training_record_events").select("*").eq("record_id", selectedRecordId).order("created_at", { ascending: false }),
    ]);
    setNotes(nRes.data || []);
    setRecordEvents(eRes.data || []);
  }, [selectedRecordId]);

  const handleAddItemNote = useCallback(async (itemId) => {
    if (!selectedRecordId) return;
    const draft = (itemNoteDrafts[itemId] || "").trim();
    if (!draft) return;
    setSavingItemNoteId(itemId);
    const { error } = await supabase.rpc("append_training_item_note", {
      p_record_id: selectedRecordId,
      p_template_item_id: itemId,
      p_note_text: draft,
      p_actor_user_id: actorUserId,
      p_actor_name: actorName,
    });
    if (error) {
      addGlobalToast("Failed to add observation", "error");
      setSavingItemNoteId(null);
      return;
    }
    setItemNoteDrafts((prev) => ({ ...prev, [itemId]: "" }));
    await reloadRecordNotesAndEvents();
    setSavingItemNoteId(null);
    addGlobalToast("Observation added", "success");
  }, [actorName, actorUserId, addGlobalToast, itemNoteDrafts, reloadRecordNotesAndEvents, selectedRecordId]);

  const handleAddGeneralNote = useCallback(async () => {
    if (!selectedRecordId || !generalNoteText.trim()) return;
    setSavingGeneralNote(true);
    const { error } = await supabase.rpc("append_training_record_note", {
      p_record_id: selectedRecordId,
      p_note_text: generalNoteText.trim(),
      p_actor_user_id: actorUserId,
      p_actor_name: actorName,
    });
    if (error) {
      addGlobalToast("Failed to add note", "error");
      setSavingGeneralNote(false);
      return;
    }
    setGeneralNoteText("");
    await reloadRecordNotesAndEvents();
    setSavingGeneralNote(false);
    addGlobalToast("Record note added", "success");
  }, [actorName, actorUserId, addGlobalToast, generalNoteText, reloadRecordNotesAndEvents, selectedRecordId]);

  const openRecordConfigModal = useCallback(() => {
    if (!selectedRecord) return;
    setConfigLaborEmployeeId(selectedRecord.labor_employee_id || "");
    setConfigEmployeeName(selectedRecord.employee_full_name || "");
    setConfigTargetRole(selectedRecord.target_role || "");
    setConfigHireDate(selectedRecord.hire_date || "");
    setConfigStartDate(selectedRecord.training_start_date || "");
    setConfigTargetEndDate(selectedRecord.target_end_date || "");
    setShowRecordConfig(true);
  }, [selectedRecord]);

  const handleSaveRecordConfig = useCallback(async () => {
    if (!selectedRecordId) return;
    setSavingConfig(true);
    const { data, error } = await supabase.rpc("update_training_record_config", buildUpdateTrainingRecordConfigArgs({
      recordId: selectedRecordId,
      laborEmployeeId: configLaborEmployeeId,
      employeeFullName: configEmployeeName,
      targetRole: configTargetRole,
      hireDate: configHireDate,
      trainingStartDate: configStartDate,
      targetEndDate: configTargetEndDate,
      actorUserId,
      actorName,
    }));
    if (error) {
      addGlobalToast("Failed to update trainee configuration", "error");
      setSavingConfig(false);
      return;
    }
    const updatedRecord = Array.isArray(data) ? data[0] : data;
    if (updatedRecord?.id) {
      setRecords((prev) => prev.map((record) => (record.id === updatedRecord.id ? updatedRecord : record)));
      setShowRecordConfig(false);
      await reloadRecordNotesAndEvents();
      addGlobalToast("Trainee configuration updated", "success");
    }
    setSavingConfig(false);
  }, [actorName, actorUserId, addGlobalToast, configEmployeeName, configHireDate, configLaborEmployeeId, configStartDate, configTargetEndDate, configTargetRole, reloadRecordNotesAndEvents, selectedRecordId]);

  const resetLaborEmployeeEditor = useCallback(() => {
    setEditingLaborEmployeeId(null);
    setLaborEmployeeName("");
    setLaborEmployeePhone("");
    setLaborEmployeeEmail("");
    setLaborEmployeeRole("");
    setLaborEmployeeStartDate("");
    setLaborEmployeeEndDate("");
  }, []);

  const resetInlineLaborEmployeeComposer = useCallback(() => {
    setNewRosterEmployeeFirstName("");
    setNewRosterEmployeeLastName("");
    setNewRosterEmployeePhone("");
    setNewRosterEmployeeEmail("");
    setNewRosterEmployeeRole("");
    setNewRosterEmployeeStartDate(todayStr());
    setNewRosterEmployeeEndDate("");
  }, []);

  const closeInlineLaborEmployeeComposer = useCallback(({ immediate = false } = {}) => {
    setInlineLaborEmployeeComposerEntered(false);
    if (immediate) {
      setShowInlineLaborEmployeeComposer(false);
      resetInlineLaborEmployeeComposer();
      return;
    }
    window.setTimeout(() => {
      setShowInlineLaborEmployeeComposer(false);
      resetInlineLaborEmployeeComposer();
    }, INLINE_ROSTER_COMPOSER_TRANSITION_MS);
  }, [resetInlineLaborEmployeeComposer]);

  const openInlineLaborEmployeeComposer = useCallback(() => {
    setShowLaborEmployeeEditor(false);
    resetLaborEmployeeEditor();
    resetInlineLaborEmployeeComposer();
    setShowInlineLaborEmployeeComposer(true);
  }, [resetInlineLaborEmployeeComposer, resetLaborEmployeeEditor]);

  const openLaborEmployeeEditor = useCallback((employee = null) => {
    if (!employee) {
      openInlineLaborEmployeeComposer();
      return;
    }

    closeInlineLaborEmployeeComposer({ immediate: true });
    setEditingLaborEmployeeId(employee.id);
    setLaborEmployeeName(employee.full_name || "");
    setLaborEmployeePhone(readLaborEmployeeContact(employee, "contact_phone"));
    setLaborEmployeeEmail(readLaborEmployeeContact(employee, "contact_email"));
    setLaborEmployeeRole(employee.position_title || "");
    setLaborEmployeeStartDate(employee.start_date || "");
    setLaborEmployeeEndDate(employee.end_date || "");
    setShowLaborEmployeeEditor(true);
  }, [closeInlineLaborEmployeeComposer, openInlineLaborEmployeeComposer]);

  const persistLaborEmployeeContact = useCallback(async (employeeId, existingMetadata = {}, { email, phone }) => {
    const nextMetadata = buildUpdatedLaborMetadata(existingMetadata, { email, phone });
    const { error } = await supabase
      .from("labor_employees")
      .update({ metadata: nextMetadata })
      .eq("id", employeeId);
    return { error };
  }, []);

  useEffect(() => {
    if (!showInlineLaborEmployeeComposer) return undefined;

    setInlineLaborEmployeeComposerEntered(false);

    const frameId = window.requestAnimationFrame(() => {
      setInlineLaborEmployeeComposerEntered(true);
    });
    const focusTimer = window.setTimeout(() => {
      firstRosterNameInputRef.current?.focus();
      firstRosterNameInputRef.current?.select?.();
    }, 120);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(focusTimer);
    };
  }, [showInlineLaborEmployeeComposer]);

  useEffect(() => {
    if (!justCreatedLaborEmployeeId) return undefined;
    const timer = window.setTimeout(() => setJustCreatedLaborEmployeeId(null), 2200);
    return () => window.clearTimeout(timer);
  }, [justCreatedLaborEmployeeId]);

  const handleSaveLaborEmployee = useCallback(async () => {
    if (!laborEmployeeName.trim() || !laborEmployeeRole.trim() || !laborEmployeeStartDate) {
      addGlobalToast("Employee name, position title, and start date are required", "error");
      return;
    }

    setSavingLaborEmployee(true);

    if (editingLaborEmployeeId) {
      const employeeBeforeUpdate = laborEmployees.find((employee) => employee.id === editingLaborEmployeeId) || null;
      const { error } = await supabase.rpc("update_labor_employee", buildUpdateLaborEmployeeRpcArgs({
        employeeId: editingLaborEmployeeId,
        fullName: laborEmployeeName,
        positionTitle: laborEmployeeRole,
        startDate: laborEmployeeStartDate,
        endDate: laborEmployeeEndDate,
        actorUserId,
      }));
      if (error) {
        addGlobalToast("Failed to update employee: " + (error.message || "Unknown error"), "error");
        setSavingLaborEmployee(false);
        return;
      }
      const { error: contactError } = await persistLaborEmployeeContact(editingLaborEmployeeId, employeeBeforeUpdate?.metadata, {
        email: laborEmployeeEmail,
        phone: laborEmployeePhone,
      });
      if (contactError) {
        addGlobalToast("Employee updated, but contact info did not save", "error");
        setSavingLaborEmployee(false);
        return;
      }
      addGlobalToast("Employee updated", "success");
    } else {
      const { data, error } = await supabase.rpc("create_labor_employee", buildCreateLaborEmployeeRpcArgs({
        locationRef: laborLocationRef,
        fullName: laborEmployeeName,
        positionTitle: laborEmployeeRole,
        startDate: laborEmployeeStartDate,
        endDate: laborEmployeeEndDate,
        actorUserId,
        actorName,
      }));
      if (error) {
        addGlobalToast("Failed to create employee: " + (error.message || "Unknown error"), "error");
        setSavingLaborEmployee(false);
        return;
      }
      const createdEmployee = Array.isArray(data) ? data[0] : data;
      if (createdEmployee?.id) {
        const { error: contactError } = await persistLaborEmployeeContact(createdEmployee.id, createdEmployee.metadata, {
          email: laborEmployeeEmail,
          phone: laborEmployeePhone,
        });
        if (contactError) {
          addGlobalToast("Employee added, but contact info did not save", "error");
          setSavingLaborEmployee(false);
          return;
        }
      }
      addGlobalToast("Employee added to labor roster", "success");
    }

    await loadData();
    setSavingLaborEmployee(false);
    setShowLaborEmployeeEditor(false);
    resetLaborEmployeeEditor();
  }, [actorName, actorUserId, addGlobalToast, editingLaborEmployeeId, laborEmployeeEmail, laborEmployeeEndDate, laborEmployeeName, laborEmployeePhone, laborEmployeeRole, laborEmployeeStartDate, laborEmployees, laborLocationRef, loadData, persistLaborEmployeeContact, resetLaborEmployeeEditor]);

  const handleCreateLaborEmployeeInline = useCallback(async () => {
    const fullName = `${newRosterEmployeeFirstName} ${newRosterEmployeeLastName}`.replace(/\s+/g, " ").trim();
    if (!newRosterEmployeeFirstName.trim() || !newRosterEmployeeLastName.trim() || !newRosterEmployeeRole.trim() || !newRosterEmployeeStartDate) {
      addGlobalToast("First name, last name, position title, and start date are required", "error");
      return;
    }

    setSavingInlineLaborEmployee(true);

    const { data, error } = await supabase.rpc("create_labor_employee", buildCreateLaborEmployeeRpcArgs({
      locationRef: laborLocationRef,
      fullName,
      positionTitle: newRosterEmployeeRole,
      startDate: newRosterEmployeeStartDate,
      endDate: newRosterEmployeeEndDate,
      actorUserId,
      actorName,
    }));

    if (error) {
      addGlobalToast("Failed to create employee: " + (error.message || "Unknown error"), "error");
      setSavingInlineLaborEmployee(false);
      return;
    }

    const createdEmployee = Array.isArray(data) ? data[0] : data;
    if (createdEmployee?.id) {
      const { error: contactError } = await persistLaborEmployeeContact(createdEmployee.id, createdEmployee.metadata, {
        email: newRosterEmployeeEmail,
        phone: newRosterEmployeePhone,
      });
      if (contactError) {
        addGlobalToast("Employee added, but contact info did not save", "error");
        setSavingInlineLaborEmployee(false);
        return;
      }
    }
    await loadData();
    setSavingInlineLaborEmployee(false);
    setJustCreatedLaborEmployeeId(createdEmployee?.id || null);
    closeInlineLaborEmployeeComposer();
    addGlobalToast("Employee added to labor roster", "success");
  }, [
    actorName,
    actorUserId,
    addGlobalToast,
    closeInlineLaborEmployeeComposer,
    laborLocationRef,
    loadData,
    newRosterEmployeeEndDate,
    newRosterEmployeeEmail,
    newRosterEmployeeFirstName,
    newRosterEmployeeLastName,
    newRosterEmployeePhone,
    newRosterEmployeeRole,
    newRosterEmployeeStartDate,
    persistLaborEmployeeContact,
  ]);

  const openTemplatePreview = useCallback((templateId, versionId = null, kind = "training") => {
    setPreviewTemplateKind(kind);
    setPreviewTemplateId(templateId);
    setPreviewTemplateVersionId(versionId);
    setExpandedSections({});
  }, []);

  const handleCreateTemplateDraft = useCallback(async () => {
    if (!previewTemplateId) return;
    setSavingTemplateAction("draft");
    const sourceVersionId = previewTemplate?.version?.id || null;
    const rpcName = previewTemplateKind === "review" ? "create_review_template_draft" : "create_training_template_draft";
    const { data, error } = await supabase.rpc(rpcName, {
      p_template_id: previewTemplateId,
      p_from_version_id: sourceVersionId,
      p_actor_user_id: actorUserId,
      p_actor_name: actorName,
      p_changelog: sourceVersionId ? `Draft cloned from version ${previewTemplate.version.version_no}` : "New draft",
    });
    if (error) {
      addGlobalToast("Failed to create template draft", "error");
      setSavingTemplateAction("");
      return;
    }
    const draftVersion = Array.isArray(data) ? data[0] : data;
    await loadData();
    if (draftVersion?.id) {
      setPreviewTemplateVersionId(draftVersion.id);
    }
    addGlobalToast("Template draft created", "success");
    setSavingTemplateAction("");
  }, [actorName, actorUserId, addGlobalToast, loadData, previewTemplate, previewTemplateId, previewTemplateKind]);

  const resetCreateTemplateModal = useCallback(() => {
    setShowCreateTemplateModal(false);
    setCreateTemplateKind("training");
    setCreateTemplateName("");
    setCreateTemplateClass("training_plan");
    setCreateTemplateRoleScopesText("");
    setCreatingTemplate(false);
  }, []);

  const handleCreateTemplateShell = useCallback(async () => {
    const nextName = String(createTemplateName || "").trim();
    if (!nextName) {
      addGlobalToast("Template name is required", "error");
      return;
    }

    const requestedSlug = slugifyTemplateName(nextName);
    if (!requestedSlug) {
      addGlobalToast("Template name must contain letters or numbers", "error");
      return;
    }

    const scopeList = Array.from(new Set(
      String(createTemplateRoleScopesText || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    ));
    const existingSlugs = new Set(
      (createTemplateKind === "review" ? reviewTemplates : templates)
        .map((template) => String(template.slug || "").trim())
        .filter(Boolean)
    );
    const nextSlug = existingSlugs.has(requestedSlug)
      ? `${requestedSlug}_${String(Date.now()).slice(-6)}`
      : requestedSlug;

    setCreatingTemplate(true);
    const isReview = createTemplateKind === "review";
    const tableName = isReview ? "review_templates" : "training_templates";
    const rpcName = isReview ? "create_review_template_draft" : "create_training_template_draft";
    const insertPayload = isReview
      ? {
          slug: nextSlug,
          name: nextName,
          role_scopes: scopeList,
          location_id: laborLocationRef || null,
          is_active: true,
          created_by_user_id: actorUserId,
          updated_by_user_id: actorUserId,
        }
      : {
          slug: nextSlug,
          name: nextName,
          template_class: createTemplateClass,
          role_scopes: scopeList,
          location_id: laborLocationRef || null,
          is_active: true,
          created_by_user_id: actorUserId,
          updated_by_user_id: actorUserId,
        };

    const { data: insertedTemplate, error: insertError } = await supabase
      .from(tableName)
      .insert(insertPayload)
      .select("id")
      .single();

    if (insertError || !insertedTemplate?.id) {
      addGlobalToast(insertError?.message || "Failed to create template shell", "error");
      setCreatingTemplate(false);
      return;
    }

    const { data: draftData, error: draftError } = await supabase.rpc(rpcName, {
      p_template_id: insertedTemplate.id,
      p_from_version_id: null,
      p_actor_user_id: actorUserId,
      p_actor_name: actorName,
      p_changelog: "Initial draft",
    });

    if (draftError) {
      addGlobalToast(draftError.message || "Failed to create template draft", "error");
      setCreatingTemplate(false);
      return;
    }

    const createdDraft = Array.isArray(draftData) ? draftData[0] : draftData;
    await loadData();
    setPreviewTemplateKind(isReview ? "review" : "training");
    setPreviewTemplateId(insertedTemplate.id);
    setPreviewTemplateVersionId(createdDraft?.id || null);
    setExpandedSections({});
    resetCreateTemplateModal();
    addGlobalToast("Template created", "success");
  }, [
    actorName,
    actorUserId,
    addGlobalToast,
    createTemplateClass,
    createTemplateKind,
    createTemplateName,
    createTemplateRoleScopesText,
    laborLocationRef,
    loadData,
    resetCreateTemplateModal,
    reviewTemplates,
    templates,
  ]);

  const handlePublishTemplateVersion = useCallback(async () => {
    if (!previewTemplate?.version?.id) return;
    setSavingTemplateAction("publish");
    const rpcName = previewTemplateKind === "review" ? "publish_review_template_version" : "publish_training_template_version";
    const { data, error } = await supabase.rpc(rpcName, {
      p_template_version_id: previewTemplate.version.id,
      p_actor_user_id: actorUserId,
      p_actor_name: actorName,
      p_changelog: previewTemplate.version.changelog || null,
    });
    if (error) {
      addGlobalToast("Failed to publish template version", "error");
      setSavingTemplateAction("");
      return;
    }
    const publishedVersion = Array.isArray(data) ? data[0] : data;
    await loadData();
    if (publishedVersion?.id) {
      setPreviewTemplateVersionId(publishedVersion.id);
    }
    addGlobalToast("Template version published", "success");
    setSavingTemplateAction("");
  }, [actorName, actorUserId, addGlobalToast, loadData, previewTemplate, previewTemplateKind]);

  const handleRestoreTemplateVersion = useCallback(async () => {
    if (!previewTemplateId || !previewTemplate?.version?.id) return;
    setSavingTemplateAction("restore");
    const rpcName = previewTemplateKind === "review" ? "restore_review_template_version" : "restore_training_template_version";
    const { data, error } = await supabase.rpc(rpcName, {
      p_template_id: previewTemplateId,
      p_restore_version_id: previewTemplate.version.id,
      p_actor_user_id: actorUserId,
      p_actor_name: actorName,
    });
    if (error) {
      addGlobalToast("Failed to restore template version", "error");
      setSavingTemplateAction("");
      return;
    }
    const restoredVersion = Array.isArray(data) ? data[0] : data;
    await loadData();
    if (restoredVersion?.id) {
      setPreviewTemplateVersionId(restoredVersion.id);
    }
    addGlobalToast("Historical version restored into a new draft", "success");
    setSavingTemplateAction("");
  }, [actorName, actorUserId, addGlobalToast, loadData, previewTemplate, previewTemplateId, previewTemplateKind]);

  const handleUpdateTemplateName = useCallback(async (value) => {
    if (!previewTemplateId) return;
    const nextName = String(value || "").trim();
    if (!nextName) return;
    const templateSource = previewTemplateKind === "review" ? reviewTemplates : templates;
    const tableName = previewTemplateKind === "review" ? "review_templates" : "training_templates";
    const currentTemplate = templateSource.find((template) => template.id === previewTemplateId);
    if (!currentTemplate || currentTemplate.name === nextName) return;
    const { error } = await supabase
      .from(tableName)
      .update({
        name: nextName,
        updated_by_user_id: actorUserId,
      })
      .eq("id", previewTemplateId);
    if (error) {
      addGlobalToast("Failed to update template name", "error");
      return;
    }
    await loadData();
    addGlobalToast("Template name updated", "success");
  }, [actorUserId, addGlobalToast, loadData, previewTemplateId, previewTemplateKind, reviewTemplates, templates]);

  const handleUpdateTemplateSection = useCallback(async (sectionId, patch) => {
    const tableName = previewTemplateKind === "review" ? "review_sections" : "training_template_sections";
    const { error } = await supabase
      .from(tableName)
      .update(patch)
      .eq("id", sectionId);
    if (error) {
      addGlobalToast("Failed to update section", "error");
      return false;
    }
    await loadData();
    return true;
  }, [addGlobalToast, loadData, previewTemplateKind]);

  const handleUpdateTemplateItem = useCallback(async (itemId, patch) => {
    const tableName = previewTemplateKind === "review" ? "review_items" : "training_template_items";
    const { error } = await supabase
      .from(tableName)
      .update(patch)
      .eq("id", itemId);
    if (error) {
      addGlobalToast(`Failed to update ${previewTemplateKind === "review" ? "review item" : "task"}`, "error");
      return false;
    }
    await loadData();
    return true;
  }, [addGlobalToast, loadData, previewTemplateKind]);

  const handleAddTemplateSection = useCallback(async (parentSectionId = null) => {
    if (!previewTemplate?.version?.id || previewTemplate.version.status !== "draft") return;
    const sectionSource = previewTemplateKind === "review" ? reviewSections : sections;
    const siblingSections = sectionSource
      .filter((section) =>
        section.template_version_id === previewTemplate.version.id &&
        (previewTemplateKind === "review" || (section.parent_section_id || null) === (parentSectionId || null))
      )
      .sort((a, b) => a.sequence_order - b.sequence_order);
    const nextOrder = (siblingSections[siblingSections.length - 1]?.sequence_order || 0) + 10;
    const insertPayload = previewTemplateKind === "review"
      ? {
          template_version_id: previewTemplate.version.id,
          section_key: `draft_review_section_${Date.now()}`,
          title: "New Review Section",
          sequence_order: nextOrder,
          instructions: null,
          metadata: {},
        }
      : {
          template_version_id: previewTemplate.version.id,
          parent_section_id: parentSectionId,
          section_key: `draft_section_${Date.now()}`,
          title: parentSectionId ? "New Module" : "New Section",
          section_type: parentSectionId ? "module" : "phase",
          sequence_order: nextOrder,
          instructions: null,
          completion_mode: "complete_only",
        };
    const { error } = await supabase
      .from(previewTemplateKind === "review" ? "review_sections" : "training_template_sections")
      .insert(insertPayload);
    if (error) {
      addGlobalToast("Failed to add section", "error");
      return;
    }
    await loadData();
    addGlobalToast(previewTemplateKind === "review" ? "Review section added" : parentSectionId ? "Module added" : "Section added", "success");
  }, [addGlobalToast, loadData, previewTemplate, previewTemplateKind, reviewSections, sections]);

  const handleAddTemplateItem = useCallback(async (sectionId) => {
    if (!previewTemplate?.version?.id || previewTemplate.version.status !== "draft") return;
    const itemSource = previewTemplateKind === "review" ? reviewItems : items;
    const sectionItems = itemSource
      .filter((item) => (previewTemplateKind === "review" ? item.review_section_id === sectionId : item.template_section_id === sectionId))
      .sort((a, b) => a.sequence_order - b.sequence_order);
    const nextOrder = (sectionItems[sectionItems.length - 1]?.sequence_order || 0) + 10;
    const insertPayload = previewTemplateKind === "review"
      ? {
          template_version_id: previewTemplate.version.id,
          review_section_id: sectionId,
          item_key: `draft_review_item_${Date.now()}`,
          prompt: "New Review Prompt",
          item_type: "long_text",
          sequence_order: nextOrder,
          options: null,
          metadata: {},
        }
      : {
          template_version_id: previewTemplate.version.id,
          template_section_id: sectionId,
          item_key: `draft_item_${Date.now()}`,
          label: "New Task",
          item_type: "task",
          sequence_order: nextOrder,
          required: true,
          completion_mode: "complete_only",
        };
    const { error } = await supabase
      .from(previewTemplateKind === "review" ? "review_items" : "training_template_items")
      .insert(insertPayload);
    if (error) {
      addGlobalToast(`Failed to add ${previewTemplateKind === "review" ? "review item" : "task"}`, "error");
      return;
    }
    await loadData();
    addGlobalToast(previewTemplateKind === "review" ? "Review item added" : "Task added", "success");
  }, [addGlobalToast, items, loadData, previewTemplate, previewTemplateKind, reviewItems]);

  const handleDeleteTemplateItem = useCallback(async (itemId) => {
    const { error } = await supabase
      .from(previewTemplateKind === "review" ? "review_items" : "training_template_items")
      .delete()
      .eq("id", itemId);
    if (error) {
      addGlobalToast(`Failed to delete ${previewTemplateKind === "review" ? "review item" : "task"}`, "error");
      return;
    }
    await loadData();
    addGlobalToast(previewTemplateKind === "review" ? "Review item deleted" : "Task deleted", "success");
  }, [addGlobalToast, loadData, previewTemplateKind]);

  const handleDeleteTemplateSection = useCallback(async (sectionId) => {
    if (previewTemplateKind === "review") {
      const sectionItems = reviewItems.filter((item) => item.review_section_id === sectionId);
      if (sectionItems.length > 0) {
        const { error: deleteItemsError } = await supabase
          .from("review_items")
          .delete()
          .in("id", sectionItems.map((item) => item.id));
        if (deleteItemsError) {
          addGlobalToast("Failed to delete review items", "error");
          return;
        }
      }
      const { error } = await supabase
        .from("review_sections")
        .delete()
        .eq("id", sectionId);
      if (error) {
        addGlobalToast("Failed to delete review section", "error");
        return;
      }
      await loadData();
      addGlobalToast("Review section deleted", "success");
      return;
    }

    const childSections = sections.filter((section) => section.parent_section_id === sectionId);
    for (const child of childSections) {
      const childItems = items.filter((item) => item.template_section_id === child.id);
      if (childItems.length > 0) {
        const { error: deleteChildItemsError } = await supabase
          .from("training_template_items")
          .delete()
          .in("id", childItems.map((item) => item.id));
        if (deleteChildItemsError) {
          addGlobalToast("Failed to delete child tasks", "error");
          return;
        }
      }
      const { error: deleteChildSectionError } = await supabase
        .from("training_template_sections")
        .delete()
        .eq("id", child.id);
      if (deleteChildSectionError) {
        addGlobalToast("Failed to delete child section", "error");
        return;
      }
    }

    const directItems = items.filter((item) => item.template_section_id === sectionId);
    if (directItems.length > 0) {
      const { error: deleteItemsError } = await supabase
        .from("training_template_items")
        .delete()
        .in("id", directItems.map((item) => item.id));
      if (deleteItemsError) {
        addGlobalToast("Failed to delete section tasks", "error");
        return;
      }
    }

    const { error } = await supabase
      .from("training_template_sections")
      .delete()
      .eq("id", sectionId);
    if (error) {
      addGlobalToast("Failed to delete section", "error");
      return;
    }
    await loadData();
    addGlobalToast("Section deleted", "success");
  }, [addGlobalToast, items, loadData, previewTemplateKind, reviewItems, sections]);

  const openLaborEmployeeProfile = useCallback((employeeId) => {
    setSelectedLaborEmployeeId(employeeId);
    setSelectedReviewInstanceId(null);
  }, []);

  const handleAddEmployeeNote = useCallback(async () => {
    if (!selectedLaborEmployeeView?.id || !employeeNoteText.trim()) return;
    setSavingEmployeeNote(true);
    const { error } = await appendEmployeeNote({
      laborEmployeeId: selectedLaborEmployeeView.id,
      noteText: employeeNoteText,
      noteType: employeeNoteType,
    });
    if (error) {
      addGlobalToast("Failed to add employee note", "error");
      setSavingEmployeeNote(false);
      return;
    }
    setEmployeeNoteText("");
    setEmployeeNoteType("general");
    await loadData();
    setSavingEmployeeNote(false);
    addGlobalToast("Employee note added", "success");
  }, [addGlobalToast, appendEmployeeNote, employeeNoteText, employeeNoteType, loadData, selectedLaborEmployeeView]);

  const handleAddGlobalEmployeeNote = useCallback(async () => {
    if (!globalNoteEmployeeId || !globalNoteText.trim()) {
      addGlobalToast("Choose an employee and add note text", "error");
      return;
    }
    setSavingGlobalNote(true);
    const { error } = await appendEmployeeNote({
      laborEmployeeId: globalNoteEmployeeId,
      noteText: globalNoteText,
      noteType: globalNoteType,
    });
    if (error) {
      addGlobalToast("Failed to add employee note", "error");
      setSavingGlobalNote(false);
      return;
    }
    setGlobalNoteEmployeeId("");
    setGlobalNoteType("general");
    setGlobalNoteText("");
    setShowGlobalNoteModal(false);
    await loadData();
    setSavingGlobalNote(false);
    addGlobalToast("Employee note added", "success");
  }, [addGlobalToast, appendEmployeeNote, globalNoteEmployeeId, globalNoteText, globalNoteType, loadData]);

  const openCprEditor = useCallback(() => {
    const currentCertification = selectedEmployeeCertifications[0];
    setCprCompletedOn(currentCertification?.completed_on || "");
    setCprExpiresOn(currentCertification?.expires_on || "");
    setCprDocumentUrl(currentCertification?.external_document_url || "");
    setCprSourceNote(currentCertification?.source_note || "");
    setShowCprEditor(true);
  }, [selectedEmployeeCertifications]);

  const handleSaveCprCertification = useCallback(async () => {
    if (!selectedLaborEmployeeView?.id || !cprCompletedOn) {
      addGlobalToast("CPR completion date is required", "error");
      return;
    }
    setSavingCpr(true);
    const { data: requirement, error: requirementError } = await supabase
      .from("certification_requirements")
      .select("id")
      .eq("slug", "dog_cpr_annual")
      .limit(1)
      .maybeSingle();
    if (requirementError || !requirement?.id) {
      addGlobalToast("Failed to load CPR requirement", "error");
      setSavingCpr(false);
      return;
    }
    const currentCertification = selectedEmployeeCertifications[0];
    const { error } = await supabase.rpc("upsert_employee_certification", {
      p_certification_id: currentCertification?.id || null,
      p_labor_employee_id: selectedLaborEmployeeView.id,
      p_requirement_id: requirement.id,
      p_completed_on: cprCompletedOn,
      p_expires_on: cprExpiresOn || null,
      p_external_document_url: cprDocumentUrl.trim() || null,
      p_source_note: cprSourceNote.trim() || null,
      p_actor_user_id: actorUserId,
    });
    if (error) {
      addGlobalToast("Failed to save CPR status", "error");
      setSavingCpr(false);
      return;
    }
    await loadData();
    setSavingCpr(false);
    setShowCprEditor(false);
    addGlobalToast("CPR certification updated", "success");
  }, [actorUserId, addGlobalToast, cprCompletedOn, cprDocumentUrl, cprExpiresOn, cprSourceNote, loadData, selectedEmployeeCertifications, selectedLaborEmployeeView]);

  const handleCreateReviewInstance = useCallback(async (reviewCycle) => {
    if (!selectedLaborEmployeeView?.id) return;
    const matchingTemplate = reviewTemplates.find((template) =>
      (template.role_scopes || []).some((scope) => scope.toUpperCase() === String(selectedLaborEmployeeView.position_title || "").toUpperCase())
    ) || reviewTemplates[0];

    if (!matchingTemplate?.id) {
      addGlobalToast("No review template is available for this role", "error");
      return;
    }

    const { data, error } = await supabase.rpc("create_review_instance", {
      p_labor_employee_id: selectedLaborEmployeeView.id,
      p_template_id: matchingTemplate.id,
      p_review_cycle: reviewCycle,
      p_due_date: null,
      p_actor_user_id: actorUserId,
      p_actor_name: actorName,
    });
    if (error) {
      addGlobalToast("Failed to create review instance", "error");
      return;
    }
    const createdInstance = Array.isArray(data) ? data[0] : data;
    await loadData();
    if (createdInstance?.id) setSelectedReviewInstanceId(createdInstance.id);
    addGlobalToast("Review instance created", "success");
  }, [actorName, actorUserId, addGlobalToast, loadData, reviewTemplates, selectedLaborEmployeeView]);

  const getReviewResponse = useCallback((reviewItemId) => {
    if (!selectedReviewInstanceId) return null;
    return reviewResponses.find((response) => response.review_instance_id === selectedReviewInstanceId && response.review_item_id === reviewItemId) || null;
  }, [reviewResponses, selectedReviewInstanceId]);

  const handleReviewDraftChange = useCallback((reviewItemId, field, value) => {
    setReviewDrafts((prev) => ({
      ...prev,
      [reviewItemId]: {
        ...prev[reviewItemId],
        [field]: value,
      },
    }));
  }, []);

  const handleSaveReviewResponse = useCallback(async (reviewItem) => {
    if (!selectedReviewInstanceId) return;
    const draft = reviewDrafts[reviewItem.id] || {};
    const existing = getReviewResponse(reviewItem.id);
    const ratingValue = draft.rating_value ?? existing?.rating_value ?? null;
    const responseText = draft.response_text ?? existing?.response_text ?? null;
    setSavingReviewItemId(reviewItem.id);
    const { error } = await supabase.rpc("save_employee_review_response", {
      p_review_instance_id: selectedReviewInstanceId,
      p_review_item_id: reviewItem.id,
      p_rating_value: ratingValue,
      p_response_text: responseText,
      p_actor_user_id: actorUserId,
    });
    if (error) {
      addGlobalToast("Failed to save review response", "error");
      setSavingReviewItemId(null);
      return;
    }
    await loadData();
    setSavingReviewItemId(null);
    addGlobalToast("Review response saved", "success");
  }, [actorUserId, addGlobalToast, getReviewResponse, loadData, reviewDrafts, selectedReviewInstanceId]);

  const handleCompleteReviewInstance = useCallback(async () => {
    if (!selectedReviewInstanceId) return;
    setCompletingReview(true);
    const { error } = await supabase.rpc("complete_employee_review_instance", {
      p_review_instance_id: selectedReviewInstanceId,
      p_actor_user_id: actorUserId,
      p_actor_name: actorName,
    });
    if (error) {
      addGlobalToast("Failed to complete review", "error");
      setCompletingReview(false);
      return;
    }
    await loadData();
    setCompletingReview(false);
    addGlobalToast("Review completed", "success");
  }, [actorName, actorUserId, addGlobalToast, loadData, selectedReviewInstanceId]);

  // ── Section toggle ──
  const toggleSection = useCallback((sectionId) => {
    setExpandedSections(prev => ({ ...prev, [sectionId]: !prev[sectionId] }));
  }, []);

  const toggleItemNotes = useCallback((itemId) => {
    setExpandedItemNotes((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  }, []);

  // ── Due soon records ──
  const dueSoonRecords = useMemo(() => {
    const today = todayStr();
    const sevenDays = new Date();
    sevenDays.setDate(sevenDays.getDate() + 7);
    const sevenStr = sevenDays.toISOString().split("T")[0];
    return activeRecords.filter(r => r.target_end_date && r.target_end_date <= sevenStr && r.target_end_date >= today);
  }, [activeRecords]);

  const overdueRecords = useMemo(() => {
    const today = todayStr();
    return activeRecords.filter(r => r.target_end_date && r.target_end_date < today);
  }, [activeRecords]);

  const activeEmployees = useMemo(() => {
    const source = rosterSnapshot.length > 0 ? rosterSnapshot : laborEmployees;
    return source.filter((employee) => isLaborEmployeeActive(employee));
  }, [laborEmployees, rosterSnapshot]);

  const inactiveEmployees = useMemo(() => {
    const source = rosterSnapshot.length > 0 ? rosterSnapshot : laborEmployees;
    return source.filter((employee) => !isLaborEmployeeActive(employee));
  }, [laborEmployees, rosterSnapshot]);

  const rosterRows = useMemo(() => {
    if (rosterSnapshot.length > 0) return rosterSnapshot;
    return laborEmployees.map((employee) => ({
      labor_employee_id: employee.id,
      full_name: employee.full_name,
      position_title: employee.position_title,
      employment_status: employee.end_date ? "inactive" : "active",
      is_active: !employee.end_date,
      start_date: employee.start_date,
      end_date: employee.end_date,
      cpr_status: "not_started",
      review_30_status: "not_started",
      review_60_status: "not_started",
      review_90_status: "not_started",
      open_training_record_count: 0,
      completed_training_record_count: 0,
      active_training_record_id: null,
      active_training_status: null,
      active_training_progress_percent: 0,
    }));
  }, [laborEmployees, rosterSnapshot]);
  const preparedRosterRows = useMemo(() => {
    return rosterRows.map((row) => {
      const contactEmployee = laborEmployeeMap[row.labor_employee_id] || null;
      const contactEmail = readLaborEmployeeContact(contactEmployee, "contact_email");
      const contactPhone = readLaborEmployeeContact(contactEmployee, "contact_phone");
      const { firstName, lastName } = splitEmployeeName(row.full_name);
      return {
        ...row,
        first_name: firstName,
        last_name: lastName,
        contact_email: contactEmail,
        contact_phone: contactPhone,
        training_compliance: getTrainingComplianceState(row),
        review30: getReviewStatusPresentation(row, "review_30"),
        review60: getReviewStatusPresentation(row, "review_60"),
        review90: getReviewStatusPresentation(row, "review_90"),
      };
    });
  }, [laborEmployeeMap, rosterRows]);
  const filteredRosterRows = useMemo(() => {
    return applyLaborRosterFilters(preparedRosterRows, rosterFilters);
  }, [preparedRosterRows, rosterFilters]);
  const visibleRosterRows = useMemo(() => {
    return filteredRosterRows.filter((row) => showInactiveRoster || row.is_active);
  }, [filteredRosterRows, showInactiveRoster]);
  const sortedRosterRows = useMemo(() => {
    const direction = rosterSort.direction === "desc" ? -1 : 1;
    const getSortValue = (row) => {
      switch (rosterSort.key) {
        case "first_name":
          return String(row.first_name || "");
        case "last_name":
          return String(row.last_name || row.full_name || "");
        case "start_date":
          return String(row.start_date || "");
        case "email":
          return String(row.contact_email || "");
        case "phone":
          return String(row.contact_phone || "");
        case "position":
          return String(row.position_title || "");
        case "training":
          return String(row.training_compliance?.label || "");
        case "review30":
          return String(row.review_30_due_date || "");
        case "review60":
          return String(row.review_60_due_date || "");
        case "review90":
          return String(row.review_90_due_date || "");
        default:
          return String(row.last_name || row.full_name || "");
      }
    };

    return [...visibleRosterRows].sort((a, b) => {
      const activeDelta = Number(!!b.is_active) - Number(!!a.is_active);
      if (!showInactiveRoster && activeDelta !== 0) return activeDelta;

      const left = getSortValue(a);
      const right = getSortValue(b);
      return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" }) * direction;
    });
  }, [rosterSort, showInactiveRoster, visibleRosterRows]);
  const hasRosterEmployeesInGraceWindow = useMemo(() => {
    return visibleRosterRows.some((row) => row.training_compliance?.inProgress);
  }, [visibleRosterRows]);
  const globalNoteEmployeeOptions = useMemo(() => laborEmployees.map((employee) => ({
    value: employee.id,
    label: `${employee.full_name} (${employee.position_title})`,
  })), [laborEmployees]);

  const sectionCompletionMap = useMemo(() => {
    const map = {};
    if (!selectedRecord) return map;

    recordSections.forEach(sec => {
      const childSecs = getChildSections(sec.id);
      let total = 0;
      let done = 0;

      const collectItems = (sectionIds) => {
        sectionIds.forEach((sid) => {
          const sItems = getSectionItems(sid);
          sItems.forEach((item) => {
            if (!item.required) return;
            total += 1;
            const res = getItemResult(item.id);
            if (res && (res.status === "complete" || res.status === "passed")) {
              done += 1;
            }
          });
        });
      };

      if (childSecs.length > 0) {
        collectItems(childSecs.map((child) => child.id));
      } else {
        collectItems([sec.id]);
      }

      map[sec.id] = { total, done };
    });

    return map;
  }, [getChildSections, getItemResult, getSectionItems, recordSections, selectedRecord]);

  const aggregatedNoteFeed = useMemo(() => {
    return [...notes]
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
      .map((note) => {
        const item = note.template_item_id ? getItemById(note.template_item_id) : null;
        const section = note.template_section_id ? getSectionById(note.template_section_id) : null;
        return {
          ...note,
          sourceLabel: item?.label || section?.title || "Record",
          sourceType: item ? "Task" : section ? "Section" : "Record",
        };
      });
  }, [getItemById, getSectionById, notes]);

  const renderRecordItem = useCallback((item) => {
    const result = getItemResult(item.id);
    const isDone = result && (result.status === "complete" || result.status === "passed");
    const itemNotes = getItemNotes(item.id);
    const showNotes = !!expandedItemNotes[item.id];

    return (
      <div key={item.id} style={{ padding: "10px 0", borderBottom: `1px solid ${C.borderLight}` }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <input
            type="checkbox"
            checked={!!isDone}
            onChange={() => handleToggleItem(item.id)}
            style={{ width: 18, height: 18, accentColor: C.pri, cursor: "pointer", flexShrink: 0, marginTop: 2 }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: isDone ? C.textMut : C.text, textDecoration: isDone ? "line-through" : "none" }}>
                  {item.label}
                </div>
                {(item.description || item.policy_reference) && (
                  <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 4 }}>
                    {item.description && (
                      <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.45 }}>
                        {item.description}
                      </div>
                    )}
                    {item.policy_reference && (
                      <a
                        href={item.policy_reference}
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontSize: 12, color: C.pri, fontWeight: 600, textDecoration: "none" }}
                      >
                        Open linked resource
                      </a>
                    )}
                  </div>
                )}
                {result?.completed_at && (
                  <div style={{ marginTop: 4, fontSize: 11, color: C.textMut }}>
                    {result.completed_by_name || "Completed"} on {formatTrainingTimestamp(result.completed_at)}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {!item.required && <span style={{ fontSize: 10, color: C.textMut, fontStyle: "italic" }}>optional</span>}
                <Btn variant="ghost" size="sm" onClick={() => toggleItemNotes(item.id)}>
                  {showNotes ? "Hide Notes" : `Notes${itemNotes.length ? ` (${itemNotes.length})` : ""}`}
                </Btn>
              </div>
            </div>

            {showNotes && (
              <div style={{ marginTop: 10, padding: 12, borderRadius: 10, background: C.bg, border: `1px solid ${C.borderLight}` }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {itemNotes.length === 0 ? (
                    <div style={{ fontSize: 12, color: C.textMut, fontStyle: "italic" }}>No observations yet</div>
                  ) : (
                    itemNotes.map((note) => (
                      <div key={note.id} style={{ paddingBottom: 10, borderBottom: `1px solid ${C.borderLight}` }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>
                          {note.created_by_name || note.initials || "Staff"}
                        </div>
                        <div style={{ fontSize: 11, color: C.textMut, marginTop: 2 }}>
                          {formatTrainingTimestamp(note.created_at)}
                        </div>
                        <div style={{ fontSize: 12, color: C.textSec, marginTop: 4, lineHeight: 1.45 }}>
                          {note.note_text}
                        </div>
                      </div>
                    ))
                  )}
                  <Inp
                    label="New Observation"
                    type="textarea"
                    rows={3}
                    value={itemNoteDrafts[item.id] || ""}
                    onChange={(value) => setItemNoteDrafts((prev) => ({ ...prev, [item.id]: value }))}
                    placeholder="Add a time-stamped observation for this task"
                  />
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <Btn
                      variant="primary"
                      size="sm"
                      onClick={() => handleAddItemNote(item.id)}
                      disabled={savingItemNoteId === item.id}
                    >
                      {savingItemNoteId === item.id ? "Saving..." : "Add Observation"}
                    </Btn>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }, [expandedItemNotes, formatTrainingTimestamp, getItemNotes, getItemResult, handleAddItemNote, handleToggleItem, itemNoteDrafts, savingItemNoteId, toggleItemNotes]);

  const renderTemplatePreviewItem = useCallback((item, editable = false) => {
    const isReviewItem = previewTemplateKind === "review";
    const primaryLabel = isReviewItem ? item.prompt : item.label;
    const secondaryText = isReviewItem
      ? (item.item_type === "rating" && Array.isArray(item.options) && item.options.length > 0
          ? `Options: ${item.options.join(", ")}`
          : item.item_type.replace(/_/g, " "))
      : item.description;
    const linkUrl = isReviewItem ? null : item.policy_reference;
    if (!editable) {
      return (
        <div key={item.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.borderLight}` }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.border, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: C.text }}>{primaryLabel}</div>
            {(secondaryText || linkUrl) && (
              <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 4 }}>
                {secondaryText && <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.45 }}>{secondaryText}</div>}
                {linkUrl && (
                  <a href={linkUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: C.pri, fontWeight: 600, textDecoration: "none" }}>
                    Open linked resource
                  </a>
                )}
              </div>
            )}
          </div>
          <span style={{ fontSize: 10, color: C.textMut }}>{item.item_type}</span>
          {!isReviewItem && !item.required && <span style={{ fontSize: 10, color: C.textMut, fontStyle: "italic" }}>optional</span>}
        </div>
      );
    }

    return (
      <Card key={item.id} style={{ padding: 12, marginTop: 8, background: C.bg, border: `1px solid ${C.borderLight}` }}>
        <div style={{ display: "grid", gap: 10 }}>
          <input
            defaultValue={primaryLabel}
            onBlur={(event) => {
              const value = event.target.value.trim();
              if (value && value !== primaryLabel) {
                handleUpdateTemplateItem(item.id, isReviewItem ? { prompt: value } : { label: value });
              }
            }}
            placeholder={isReviewItem ? "Review prompt" : "Task label"}
            style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: "inherit" }}
          />
          {isReviewItem ? (
            <>
              <CustomSelect
                value={item.item_type}
                onChange={(value) => handleUpdateTemplateItem(item.id, { item_type: value })}
                options={[
                  { value: "long_text", label: "Long Text" },
                  { value: "short_text", label: "Short Text" },
                  { value: "rating", label: "Rating" },
                ]}
              />
              {item.item_type === "rating" && (
                <Inp
                  label="Rating Options"
                  value={Array.isArray(item.options) ? item.options.join(", ") : ""}
                  onChange={(value) => {
                    const nextOptions = String(value || "")
                      .split(",")
                      .map((entry) => entry.trim())
                      .filter(Boolean);
                    handleUpdateTemplateItem(item.id, { options: nextOptions.length ? nextOptions : null });
                  }}
                  placeholder="Meets Expectations, Needs Improvement, Exceeds Expectations"
                />
              )}
            </>
          ) : (
            <>
              <textarea
                defaultValue={item.description || ""}
                onBlur={(event) => {
                  const value = event.target.value.trim();
                  if (value !== (item.description || "")) {
                    handleUpdateTemplateItem(item.id, { description: value || null });
                  }
                }}
                placeholder="Task description"
                rows={2}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }}
              />
              <input
                defaultValue={item.policy_reference || ""}
                onBlur={(event) => {
                  const value = event.target.value.trim();
                  if (value !== (item.policy_reference || "")) {
                    handleUpdateTemplateItem(item.id, { policy_reference: value || null });
                  }
                }}
                placeholder="Optional resource link"
                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: "inherit" }}
              />
            </>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            {!isReviewItem ? (
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.textSec }}>
                <input
                  type="checkbox"
                  defaultChecked={item.required}
                  onChange={(event) => handleUpdateTemplateItem(item.id, { required: event.target.checked })}
                />
                Required task
              </label>
            ) : <span />}
            <Btn variant="ghost" size="sm" onClick={() => handleDeleteTemplateItem(item.id)}>Delete Task</Btn>
          </div>
        </div>
      </Card>
    );
  }, [handleDeleteTemplateItem, handleUpdateTemplateItem, previewTemplateKind]);

  const laborEmployeeEditorModal = showLaborEmployeeEditor && editingLaborEmployeeId ? (
    <Modal
      title="Edit Employee"
      onClose={() => {
        setShowLaborEmployeeEditor(false);
        resetLaborEmployeeEditor();
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Inp label="Employee Full Name" value={laborEmployeeName} onChange={setLaborEmployeeName} required />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Inp
            label="Phone Number"
            type="tel"
            value={fmtPhoneInput(laborEmployeePhone)}
            onChange={(value) => setLaborEmployeePhone(String(value || "").replace(/\D/g, "").slice(0, 10))}
          />
          <Inp
            label="Email Address"
            type="email"
            value={laborEmployeeEmail}
            onChange={setLaborEmployeeEmail}
          />
        </div>
        <Inp label="Position Title" value={laborEmployeeRole} onChange={setLaborEmployeeRole} required />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Inp label="Start Date" type="date" value={laborEmployeeStartDate} onChange={setLaborEmployeeStartDate} required />
          <Inp label="End Date" type="date" value={laborEmployeeEndDate} onChange={setLaborEmployeeEndDate} />
        </div>
        <div style={{ fontSize: 12, color: C.textMut, lineHeight: 1.5 }}>
          Active status is derived automatically. Leave End Date blank for active employees; add an End Date when they leave.
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
          <Btn
            variant="ghost"
            onClick={() => {
              setShowLaborEmployeeEditor(false);
              resetLaborEmployeeEditor();
            }}
          >
            Cancel
          </Btn>
          <Btn variant="primary" onClick={handleSaveLaborEmployee} disabled={savingLaborEmployee}>
            {savingLaborEmployee ? "Saving..." : "Save Employee"}
          </Btn>
        </div>
      </div>
    </Modal>
  ) : null;

  // ═══════════════════════════════════════════════════════════════════════════
  // EMPLOYEE DETAIL VIEW
  // ═══════════════════════════════════════════════════════════════════════════

  if (selectedLaborEmployeeId && selectedLaborEmployeeView) {
    const employeeTrainingRecords = records
      .filter((record) => record.labor_employee_id === selectedLaborEmployeeView.id)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const currentCprCertification = selectedEmployeeCertifications[0] || null;
    const employeePhone = readLaborEmployeeContact(selectedLaborEmployeeView, "contact_phone");
    const employeeEmail = readLaborEmployeeContact(selectedLaborEmployeeView, "contact_email");
    const reviewCycleRows = [
      {
        id: "30_day",
        label: "30 Day Review",
        dueDate: selectedLaborEmployeeSnapshot?.review_30_due_date || null,
        status: selectedLaborEmployeeSnapshot?.review_30_status || "not_started",
        instance: selectedEmployeeReviewInstances.find((instance) => instance.review_cycle === "30_day") || null,
      },
      {
        id: "60_day",
        label: "60 Day Review",
        dueDate: selectedLaborEmployeeSnapshot?.review_60_due_date || null,
        status: selectedLaborEmployeeSnapshot?.review_60_status || "not_started",
        instance: selectedEmployeeReviewInstances.find((instance) => instance.review_cycle === "60_day") || null,
      },
      {
        id: "90_day",
        label: "90 Day Review",
        dueDate: selectedLaborEmployeeSnapshot?.review_90_due_date || null,
        status: selectedLaborEmployeeSnapshot?.review_90_status || "not_started",
        instance: selectedEmployeeReviewInstances.find((instance) => instance.review_cycle === "90_day") || null,
      },
    ];

    if (selectedReviewInstance) {
      const reviewItemTotal = selectedReviewSections.reduce((sum, section) => sum + section.items.length, 0);
      const answeredReviewItems = selectedReviewSections.reduce((sum, section) => (
        sum + section.items.filter((item) => {
          const response = getReviewResponse(item.id);
          const draft = reviewDrafts[item.id] || {};
          const ratingValue = draft.rating_value ?? response?.rating_value ?? "";
          const responseText = draft.response_text ?? response?.response_text ?? "";
          return Boolean(String(ratingValue || "").trim() || String(responseText || "").trim());
        }).length
      ), 0);
      const reviewPercent = reviewItemTotal > 0 ? Math.round((answeredReviewItems / reviewItemTotal) * 100) : 0;
      const reviewCycleLabel = String(selectedReviewInstance.review_cycle || "").replace(/_/g, " ");
      const reviewStatusColor = selectedReviewInstance.status === "completed"
        ? "success"
        : selectedReviewInstance.status === "overdue"
          ? "danger"
          : "warning";

      return (
        <div style={{ maxWidth: 1320, margin: "0 auto", padding: "24px 16px 40px" }}>
          <button
            onClick={() => setSelectedReviewInstanceId(null)}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: C.pri, fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 18, fontFamily: "inherit", padding: 0 }}
          >
            <I.Back /> Back to Employee
          </button>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 18, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 800, color: C.text, letterSpacing: "-0.02em", marginBottom: 4 }}>
                {selectedReviewTemplate?.name || "Performance Review"}
              </div>
              <div style={{ fontSize: 14, color: C.textSec, lineHeight: 1.5 }}>
                {selectedLaborEmployeeView.full_name} · {selectedLaborEmployeeView.position_title || "Employee"} · {reviewCycleLabel}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <Badge color={reviewStatusColor}>{String(selectedReviewInstance.status).replace(/_/g, " ")}</Badge>
              {selectedReviewInstance.due_date && <Badge color="default">Due {fmtDate(selectedReviewInstance.due_date)}</Badge>}
              {selectedReviewInstance.completed_at && <Badge color="success">Completed {formatTrainingTimestamp(selectedReviewInstance.completed_at)}</Badge>}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 20 }}>
            <Card style={{ padding: 16 }}>
              <div style={{ fontSize: 12, color: C.textMut, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Progress</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: C.text }}>{reviewPercent}%</div>
                <div style={{ fontSize: 12, color: C.textMut }}>{answeredReviewItems}/{reviewItemTotal} prompts answered</div>
              </div>
              <ProgressBar percent={reviewPercent} height={8} />
            </Card>
            <Card style={{ padding: 16 }}>
              <div style={{ fontSize: 12, color: C.textMut, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Employee</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 6 }}>{selectedLaborEmployeeView.full_name}</div>
              <div style={{ fontSize: 12, color: C.textSec }}>{selectedLaborEmployeeView.position_title || "—"}</div>
              {selectedLaborEmployeeView.start_date && (
                <div style={{ fontSize: 12, color: C.textMut, marginTop: 8 }}>Started {fmtDate(selectedLaborEmployeeView.start_date)}</div>
              )}
            </Card>
            <Card style={{ padding: 16 }}>
              <div style={{ fontSize: 12, color: C.textMut, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Cycle Status</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: reviewStatusColor === "success" ? C.suc : reviewStatusColor === "danger" ? C.dan : C.warn }}>
                {String(selectedReviewInstance.status).replace(/_/g, " ")}
              </div>
              <div style={{ fontSize: 12, color: C.textMut, marginTop: 8 }}>
                {selectedReviewInstance.due_date ? `Due ${fmtDate(selectedReviewInstance.due_date)}` : "Due date not set"}
              </div>
            </Card>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 300px", gap: 20, alignItems: "start" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {selectedReviewSections.map((section) => {
                const sectionAnswered = section.items.filter((item) => {
                  const response = getReviewResponse(item.id);
                  const draft = reviewDrafts[item.id] || {};
                  const ratingValue = draft.rating_value ?? response?.rating_value ?? "";
                  const responseText = draft.response_text ?? response?.response_text ?? "";
                  return Boolean(String(ratingValue || "").trim() || String(responseText || "").trim());
                }).length;

                return (
                  <Card key={section.id} style={{ padding: 20 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: C.text, marginBottom: 6 }}>{section.title}</div>
                        {section.instructions && (
                          <div style={{ fontSize: 13, color: C.textSec, lineHeight: 1.6, maxWidth: 900 }}>{section.instructions}</div>
                        )}
                      </div>
                      <Badge color={sectionAnswered === section.items.length && section.items.length > 0 ? "success" : "warning"}>
                        {sectionAnswered}/{section.items.length} answered
                      </Badge>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      {section.items.map((item) => {
                        const response = getReviewResponse(item.id);
                        const draft = reviewDrafts[item.id] || {};
                        const ratingOptions = Array.isArray(item.options)
                          ? item.options.map((option) => ({ value: option, label: option }))
                          : [
                              { value: "Meets Expectations", label: "Meets Expectations" },
                              { value: "Needs Improvement", label: "Needs Improvement" },
                              { value: "Exceeds Expectations", label: "Exceeds Expectations" },
                            ];

                        return (
                          <div key={item.id} style={{ border: `1px solid ${C.border}`, borderRadius: 16, padding: 18, background: "#fff" }}>
                            <div style={{ fontSize: 15, fontWeight: 700, color: C.text, lineHeight: 1.5, marginBottom: 12 }}>{item.prompt}</div>
                            {item.item_type === "rating" ? (
                              <CustomSelect
                                value={draft.rating_value ?? response?.rating_value ?? ""}
                                onChange={(value) => handleReviewDraftChange(item.id, "rating_value", value)}
                                options={ratingOptions}
                                placeholder="Select rating"
                              />
                            ) : (
                              <Inp
                                type={item.item_type === "short_text" ? "text" : "textarea"}
                                rows={item.item_type === "short_text" ? 1 : 4}
                                value={draft.response_text ?? response?.response_text ?? ""}
                                onChange={(value) => handleReviewDraftChange(item.id, "response_text", value)}
                                placeholder="Enter response"
                              />
                            )}

                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
                              <div style={{ fontSize: 11, color: C.textMut }}>
                                {response?.created_at ? `Last saved ${formatTrainingTimestamp(response.created_at)}` : "Unsaved changes stay on this review page until you save"}
                              </div>
                              <Btn variant="secondary" size="sm" onClick={() => handleSaveReviewResponse(item)} disabled={savingReviewItemId === item.id}>
                                {savingReviewItemId === item.id ? "Saving..." : "Save Response"}
                              </Btn>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                );
              })}
            </div>

            <div style={{ position: "sticky", top: 24, display: "flex", flexDirection: "column", gap: 12 }}>
              <Card style={{ padding: 18 }}>
                <div style={{ fontSize: 12, color: C.textMut, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 10 }}>Review Actions</div>
                <div style={{ fontSize: 13, color: C.textSec, lineHeight: 1.6, marginBottom: 14 }}>
                  Use this page to complete the full {reviewCycleLabel} review without the cramped modal layout.
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <Btn variant="primary" onClick={handleCompleteReviewInstance} disabled={completingReview}>
                    {completingReview ? "Completing..." : "Complete Review"}
                  </Btn>
                  <Btn variant="ghost" onClick={() => setSelectedReviewInstanceId(null)}>Back to Employee</Btn>
                </div>
              </Card>

              <Card style={{ padding: 18 }}>
                <div style={{ fontSize: 12, color: C.textMut, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 10 }}>Sections</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {selectedReviewSections.map((section) => {
                    const answered = section.items.filter((item) => {
                      const response = getReviewResponse(item.id);
                      const draft = reviewDrafts[item.id] || {};
                      const ratingValue = draft.rating_value ?? response?.rating_value ?? "";
                      const responseText = draft.response_text ?? response?.response_text ?? "";
                      return Boolean(String(ratingValue || "").trim() || String(responseText || "").trim());
                    }).length;
                    return (
                      <div key={section.id} style={{ padding: "10px 12px", borderRadius: 12, border: `1px solid ${C.borderLight}`, background: C.bg }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{section.title}</div>
                        <div style={{ fontSize: 11, color: C.textMut, marginTop: 2 }}>{answered}/{section.items.length} answered</div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>
          </div>

          {laborEmployeeEditorModal}
        </div>
      );
    }

    return (
      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "24px 16px" }}>
        <button
          onClick={() => {
            setSelectedLaborEmployeeId(null);
            setSelectedReviewInstanceId(null);
          }}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: C.pri, fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 16, fontFamily: "inherit", padding: 0 }}
        >
          <I.Back /> Back to Labor
        </button>

        <Card style={{ padding: 24, marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, color: C.text, marginBottom: 4 }}>{selectedLaborEmployeeView.full_name}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                <Badge color="primary">{selectedLaborEmployeeView.position_title}</Badge>
                <Badge color={selectedLaborEmployeeSnapshot?.is_active ? "success" : "warning"}>
                  {selectedLaborEmployeeSnapshot?.is_active ? "Active Employee" : "Inactive Employee"}
                </Badge>
                {selectedLaborEmployeeSnapshot?.active_training_status && (
                  <Badge color="info">Training: {String(selectedLaborEmployeeSnapshot.active_training_status).replace(/_/g, " ")}</Badge>
                )}
                <Badge color={selectedLaborEmployeeSnapshot?.cpr_status === "current" ? "success" : selectedLaborEmployeeSnapshot?.cpr_status === "due_soon" ? "warning" : "danger"}>
                  CPR: {String(selectedLaborEmployeeSnapshot?.cpr_status || "not_started").replace(/_/g, " ")}
                </Badge>
              </div>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: C.textMut }}>
                {selectedLaborEmployeeView.start_date && <span>Start: {fmtDate(selectedLaborEmployeeView.start_date)}</span>}
                {selectedLaborEmployeeView.end_date && <span>End: {fmtDate(selectedLaborEmployeeView.end_date)}</span>}
                {employeePhone && <span>{fmtPhoneInput(employeePhone)}</span>}
                {employeeEmail && <span>{employeeEmail}</span>}
                <span>{selectedEmployeeNotes.length} employee note{selectedEmployeeNotes.length !== 1 ? "s" : ""}</span>
                <span>{employeeTrainingRecords.length} training record{employeeTrainingRecords.length !== 1 ? "s" : ""}</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
              <Btn variant="secondary" size="sm" onClick={() => openLaborEmployeeEditor(selectedLaborEmployeeView)}>Edit Employee</Btn>
              <Btn variant="ghost" size="sm" onClick={() => nav("attendance", { employeeId: selectedLaborEmployeeView.id, tab: "history" })}>Attendance</Btn>
              {selectedLaborEmployeeSnapshot?.active_training_record_id ? (
                <Btn variant="primary" size="sm" onClick={() => setSelectedRecordId(selectedLaborEmployeeSnapshot.active_training_record_id)}>Open Active Training</Btn>
              ) : (
                <Btn
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setNewLaborEmployeeId(selectedLaborEmployeeView.id);
                    setNewEmployeeName(selectedLaborEmployeeView.full_name || "");
                    setNewTargetRole(selectedLaborEmployeeView.position_title || "");
                    setNewHireDate(selectedLaborEmployeeView.start_date || "");
                    const match = templateOptions.find((template) =>
                      template.roleScopes.some((scope) => scope.toUpperCase() === String(selectedLaborEmployeeView.position_title || "").toUpperCase())
                    );
                    if (match) setNewTemplateId(match.value);
                    setShowNewRecord(true);
                  }}
                >
                  New Training Record
                </Btn>
              )}
            </div>
          </div>
        </Card>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
          <Card style={{ padding: 16 }}>
            <div style={{ fontSize: 12, color: C.textMut, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Training Compliance</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: selectedLaborEmployeeSnapshot?.training_compliance_flag ? C.suc : C.warn }}>
              {selectedLaborEmployeeSnapshot?.training_compliance_flag ? "Compliant" : "Not Complete"}
            </div>
          </Card>
          <Card style={{ padding: 16 }}>
            <div style={{ fontSize: 12, color: C.textMut, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>CPR Status</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: selectedLaborEmployeeSnapshot?.cpr_status === "current" ? C.suc : selectedLaborEmployeeSnapshot?.cpr_status === "due_soon" ? C.warn : C.dan }}>
              {String(selectedLaborEmployeeSnapshot?.cpr_status || "not_started").replace(/_/g, " ")}
            </div>
            {currentCprCertification?.expires_on && (
              <div style={{ fontSize: 12, color: C.textMut, marginTop: 6 }}>Expires {fmtDate(currentCprCertification.expires_on)}</div>
            )}
          </Card>
          <Card style={{ padding: 16 }}>
            <div style={{ fontSize: 12, color: C.textMut, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Notes In 30 Days</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: C.pri }}>{selectedEmployeeNotes30d.length}</div>
          </Card>
          <Card style={{ padding: 16 }}>
            <div style={{ fontSize: 12, color: C.textMut, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Attendance Marks</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: C.text }}>{selectedEmployeeAttendanceIncidents30d.length}</div>
            <div style={{ fontSize: 12, color: C.textMut, marginTop: 6 }}>Last 30 days</div>
          </Card>
        </div>

        <SectionHeader title="Employee Notes" count={selectedEmployeeNotes.length} />
        <Card style={{ padding: 16, marginBottom: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 12, marginBottom: 12 }}>
            <Inp
              label="Note Type"
              type="select"
              value={employeeNoteType}
              onChange={setEmployeeNoteType}
              options={[
                { value: "general", label: "General" },
                { value: "personal", label: "Personal" },
                { value: "performance", label: "Performance" },
                { value: "attendance", label: "Attendance" },
                { value: "training", label: "Training" },
                { value: "hr", label: "HR" },
              ]}
            />
            <Inp
              label="New Employee Note"
              type="textarea"
              rows={3}
              value={employeeNoteText}
              onChange={setEmployeeNoteText}
              placeholder="Add a manager-facing note for this employee"
            />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
            <Btn variant="primary" size="sm" onClick={handleAddEmployeeNote} disabled={savingEmployeeNote}>
              {savingEmployeeNote ? "Saving..." : "Add Employee Note"}
            </Btn>
          </div>
          {selectedEmployeeNotes.length === 0 ? (
            <div style={{ fontSize: 12, color: C.textMut, fontStyle: "italic" }}>No employee notes yet</div>
          ) : (
            selectedEmployeeNotes.map((note) => (
              <div key={note.id} style={{ padding: "10px 0", borderTop: `1px solid ${C.borderLight}` }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{note.created_by_name || "Staff"}</span>
                  <Badge color="default">{String(note.note_type || "general").replace(/_/g, " ")}</Badge>
                  <span style={{ fontSize: 11, color: C.textMut }}>{formatTrainingTimestamp(note.created_at)}</span>
                </div>
                <div style={{ fontSize: 13, color: C.textSec, lineHeight: 1.5 }}>{note.note_text}</div>
              </div>
            ))
          )}
        </Card>

        <SectionHeader title="CPR Certification" count={selectedEmployeeCertifications.length}>
          <Btn variant="secondary" size="sm" onClick={openCprEditor}>Update CPR</Btn>
        </SectionHeader>
        <Card style={{ padding: 16, marginBottom: 20 }}>
          {currentCprCertification ? (
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 6 }}>
                Completed {fmtDate(currentCprCertification.completed_on)}
              </div>
              {currentCprCertification.expires_on && (
                <div style={{ fontSize: 12, color: C.textMut, marginBottom: 6 }}>Expires {fmtDate(currentCprCertification.expires_on)}</div>
              )}
              {currentCprCertification.external_document_url && (
                <a href={currentCprCertification.external_document_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: C.pri, fontWeight: 600 }}>
                  Open diploma / document
                </a>
              )}
              {currentCprCertification.source_note && (
                <div style={{ fontSize: 12, color: C.textSec, marginTop: 8 }}>{currentCprCertification.source_note}</div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: C.textMut, fontStyle: "italic" }}>No CPR certification recorded yet</div>
          )}
        </Card>

        <SectionHeader title="Performance Reviews" count={selectedEmployeeReviewInstances.length} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 20 }}>
          {reviewCycleRows.map((cycle) => (
            <Card key={cycle.id} style={{ padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 6 }}>{cycle.label}</div>
              <div style={{ fontSize: 12, color: C.textMut, marginBottom: 8 }}>
                Due {cycle.dueDate ? fmtDate(cycle.dueDate) : "—"}
              </div>
              <Badge color={cycle.status === "completed" ? "success" : cycle.status === "overdue" ? "danger" : "warning"}>
                {String(cycle.status).replace(/_/g, " ")}
              </Badge>
              <div style={{ marginTop: 12 }}>
                {cycle.instance ? (
                  <Btn variant="ghost" size="sm" onClick={() => setSelectedReviewInstanceId(cycle.instance.id)}>Open Review</Btn>
                ) : (
                  <Btn variant="secondary" size="sm" onClick={() => handleCreateReviewInstance(cycle.id)}>Start Review</Btn>
                )}
              </div>
            </Card>
          ))}
        </div>

        <SectionHeader title="Training History" count={employeeTrainingRecords.length} />
        {employeeTrainingRecords.length === 0 ? (
          <EmptyState icon="GraduationCap" title="No training records yet" subtitle="Create a training record from the roster or training tab" />
        ) : (
          <Card style={{ padding: 0, overflow: "hidden", marginBottom: 20 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={tableHeaderStyle}>Position</th>
                  <th style={tableHeaderStyle}>Training Plan</th>
                  <th style={tableHeaderStyle}>Status</th>
                  <th style={tableHeaderStyle}>Progress</th>
                  <th style={tableHeaderStyle}>Target</th>
                </tr>
              </thead>
              <tbody>
                {employeeTrainingRecords.map((record) => (
                  <tr key={record.id} onClick={() => setSelectedRecordId(record.id)} style={{ cursor: "pointer", borderBottom: `1px solid ${C.borderLight}` }}>
                    <td style={{ padding: "10px 12px", fontSize: 12, color: C.text }}>{record.target_role}</td>
                    <td style={{ padding: "10px 12px", fontSize: 12, color: C.textSec }}>{record.template_name_snapshot}</td>
                    <td style={{ padding: "10px 12px" }}><StatusBadge status={record.overall_status} /></td>
                    <td style={{ padding: "10px 12px", fontSize: 12, color: C.textSec }}>{Math.round(record.progress_percent || 0)}%</td>
                    <td style={{ padding: "10px 12px", fontSize: 12, color: C.textMut }}>{record.target_end_date ? fmtDate(record.target_end_date) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        {selectedEmployeeDocuments.length > 0 && (
          <>
            <SectionHeader title="Documents" count={selectedEmployeeDocuments.length} />
            <Card style={{ padding: 16 }}>
              {selectedEmployeeDocuments.map((document) => (
                <div key={document.id} style={{ padding: "8px 0", borderBottom: `1px solid ${C.borderLight}` }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{document.file_name}</div>
                  <div style={{ fontSize: 11, color: C.textMut }}>{document.document_type}</div>
                  {document.external_url && (
                    <a href={document.external_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: C.pri, fontWeight: 600 }}>
                      Open document
                    </a>
                  )}
                </div>
              ))}
            </Card>
          </>
        )}

        {showCprEditor && (
          <Modal title="Update CPR Certification" onClose={() => setShowCprEditor(false)}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <Inp label="Completed On" type="date" value={cprCompletedOn} onChange={setCprCompletedOn} required />
              <Inp label="Expires On" type="date" value={cprExpiresOn} onChange={setCprExpiresOn} />
              <Inp label="Diploma / Document URL" value={cprDocumentUrl} onChange={setCprDocumentUrl} />
              <Inp label="Source Note" type="textarea" rows={3} value={cprSourceNote} onChange={setCprSourceNote} />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <Btn variant="ghost" onClick={() => setShowCprEditor(false)}>Cancel</Btn>
                <Btn variant="primary" onClick={handleSaveCprCertification} disabled={savingCpr}>
                  {savingCpr ? "Saving..." : "Save CPR"}
                </Btn>
              </div>
            </div>
          </Modal>
        )}

        {laborEmployeeEditorModal}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RECORD DETAIL VIEW
  // ═══════════════════════════════════════════════════════════════════════════

  if (selectedRecordId && selectedRecord) {
    return (
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px" }}>
        {/* Back button */}
        <button onClick={() => { setSelectedRecordId(null); setExpandedSections({}); }} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: C.pri, fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 16, fontFamily: "inherit", padding: 0 }}>
          <I.Back /> Back to Labor
        </button>

        {/* Record Header */}
        <Card style={{ padding: 24, marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: C.text, marginBottom: 4 }}>{selectedRecord.employee_full_name}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                <Badge color="primary">Position: {selectedRecord.target_role}</Badge>
                <Badge color="default">Training Plan: {selectedRecord.template_name_snapshot}</Badge>
                {selectedLaborEmployeeSnapshot?.employment_status && (
                  <Badge color={selectedLaborEmployeeSnapshot.is_active ? "success" : "warning"}>
                    {selectedLaborEmployeeSnapshot.employment_status.replace(/_/g, " ")}
                  </Badge>
                )}
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12, color: C.textMut, alignItems: "center" }}>
                {selectedRecord.hire_date && <span>Hire: {fmtDate(selectedRecord.hire_date)}</span>}
                {selectedRecord.training_start_date && <span>Start: {fmtDate(selectedRecord.training_start_date)}</span>}
                {selectedRecord.target_end_date && <span>Target: {fmtDate(selectedRecord.target_end_date)}</span>}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <StatusBadge status={selectedRecord.overall_status} />
              <div style={{ marginTop: 8, fontSize: 24, fontWeight: 800, color: C.pri }}>{Math.round(selectedRecord.progress_percent)}%</div>
              <div style={{ fontSize: 11, color: C.textMut }}>{selectedRecord.required_item_completed_count} / {selectedRecord.required_item_count} items</div>
              <div style={{ marginTop: 10 }}>
                <Btn variant="secondary" size="sm" onClick={openRecordConfigModal}>Edit Configuration</Btn>
              </div>
            </div>
          </div>
          <div style={{ marginTop: 12 }}><ProgressBar percent={selectedRecord.progress_percent} height={8} /></div>
        </Card>

        {/* Sections */}
        <SectionHeader title="Training Plan" count={recordSections.length} />
        {recordSections.map(sec => {
          const isOpen = expandedSections[sec.id];
          const comp = sectionCompletionMap[sec.id] || { total: 0, done: 0 };
          const childSecs = getChildSections(sec.id);
          const directItems = getSectionItems(sec.id);
          const secPercent = comp.total > 0 ? Math.round((comp.done / comp.total) * 100) : 0;

          return (
            <Card key={sec.id} style={{ marginBottom: 8, padding: 0, overflow: "hidden" }}>
              <button onClick={() => toggleSection(sec.id)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: isOpen ? C.priLt : "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "background 0.15s" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                  <span style={{ transform: isOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s", flexShrink: 0 }}><I.ChevronRight /></span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sec.title}</div>
                    {(sec.day_number || sec.time_block_start || sec.instructions) && (
                      <div style={{ fontSize: 11, color: C.textMut }}>
                        {formatTrainingTimeRange(sec.time_block_start, sec.time_block_end) || (sec.day_number ? `Day ${sec.day_number}` : "")}
                        {sec.time_block_note && <span style={{ color: C.warn, marginLeft: 6 }}>{sec.time_block_note}</span>}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                  <span style={{ fontSize: 11, color: C.textMut, fontWeight: 600 }}>{comp.done}/{comp.total}</span>
                  <div style={{ width: 60 }}><ProgressBar percent={secPercent} /></div>
                </div>
              </button>

              {isOpen && (
                <div style={{ padding: "0 16px 14px" }}>
                  {sec.instructions && (
                    <div style={{ marginTop: 12, marginBottom: 8, fontSize: 12, color: C.textSec, lineHeight: 1.5 }}>
                      {sec.instructions}
                    </div>
                  )}
                  {/* Render child module sections */}
                  {childSecs.map(child => {
                    const childItems = getSectionItems(child.id);
                    return (
                      <div key={child.id} style={{ marginTop: 12 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: C.pri, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>{child.title}</div>
                        {child.instructions && (
                          <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.45, marginBottom: 6 }}>
                            {child.instructions}
                          </div>
                        )}
                        {childItems.map((item) => renderRecordItem(item))}
                      </div>
                    );
                  })}
                  {/* Direct items (no child modules) */}
                  {childSecs.length === 0 && directItems.map((item) => renderRecordItem(item))}
                </div>
              )}
            </Card>
          );
        })}

        {/* Aggregate Notes */}
        <div style={{ marginTop: 28 }}>
          <SectionHeader title="All Notes & Observations" count={aggregatedNoteFeed.length} />
          <Card style={{ padding: 16 }}>
            <div style={{ marginBottom: 16 }}>
              <Inp
                label="General Trainee Note"
                type="textarea"
                rows={3}
                value={generalNoteText}
                onChange={setGeneralNoteText}
                placeholder="Add a general note that is not tied to a specific task"
              />
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                <Btn variant="primary" size="sm" onClick={handleAddGeneralNote} disabled={savingGeneralNote}>
                  {savingGeneralNote ? "Saving..." : "Add Record Note"}
                </Btn>
              </div>
            </div>
            {aggregatedNoteFeed.length === 0 && <div style={{ fontSize: 12, color: C.textMut, fontStyle: "italic" }}>No notes yet</div>}
            {aggregatedNoteFeed.map((note) => (
              <div key={note.id} style={{ padding: "10px 0", borderBottom: `1px solid ${C.borderLight}`, fontSize: 13 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, color: C.text }}>{note.created_by_name || note.initials || "Staff"}</span>
                  <Badge color="default">{note.sourceType}: {note.sourceLabel}</Badge>
                  <span style={{ fontSize: 11, color: C.textMut }}>{formatTrainingTimestamp(note.created_at)}</span>
                </div>
                <div style={{ color: C.textSec, lineHeight: 1.5 }}>{note.note_text}</div>
              </div>
            ))}
          </Card>
        </div>

        {showRecordConfig && (
          <Modal title="Edit Trainee Configuration" onClose={() => setShowRecordConfig(false)}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <CustomSelect
                value={configLaborEmployeeId}
                onChange={(value) => {
                  setConfigLaborEmployeeId(value);
                  const employee = laborEmployees.find((entry) => entry.id === value);
                  if (!employee) return;
                  setConfigEmployeeName(employee.full_name || "");
                  setConfigTargetRole(employee.position_title || "");
                  setConfigHireDate(employee.start_date || "");
                }}
                options={laborEmployeeOptions}
                placeholder="Link to roster employee"
              />
              <Inp label="Employee Full Name" value={configEmployeeName} onChange={setConfigEmployeeName} required />
              <Inp label="Position Title" value={configTargetRole} onChange={setConfigTargetRole} required />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Inp label="Hire Date" type="date" value={configHireDate} onChange={setConfigHireDate} />
                <Inp label="Training Start Date" type="date" value={configStartDate} onChange={setConfigStartDate} />
              </div>
              <Inp label="Target End Date" type="date" value={configTargetEndDate} onChange={setConfigTargetEndDate} />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
                <Btn variant="ghost" onClick={() => setShowRecordConfig(false)}>Cancel</Btn>
                <Btn variant="primary" onClick={handleSaveRecordConfig} disabled={savingConfig}>
                  {savingConfig ? "Saving..." : "Save Changes"}
                </Btn>
              </div>
            </div>
          </Modal>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LIST VIEWS
  // ═══════════════════════════════════════════════════════════════════════════

  const MetricCard = ({ label, value, helper, color = C.pri }) => (
    <Card style={{ padding: 16 }}>
      <div style={{ fontSize: 12, color: C.textMut, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color }}>{value}</div>
      {helper ? <div style={{ fontSize: 12, color: C.textMut, marginTop: 6 }}>{helper}</div> : null}
    </Card>
  );

  const RecordRow = ({ rec }) => (
    <tr
      onClick={() => setSelectedRecordId(rec.id)}
      style={{ cursor: "pointer", borderBottom: `1px solid ${C.borderLight}` }}
      onMouseEnter={(e) => { e.currentTarget.style.background = C.surfaceHover; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      <td style={{ padding: "10px 12px", fontSize: 13, fontWeight: 600, color: C.text }}>{rec.employee_full_name}</td>
      <td style={{ padding: "10px 12px", fontSize: 12, color: C.textSec }}>{rec.target_role}</td>
      <td style={{ padding: "10px 12px", fontSize: 12, color: C.textSec }}>{rec.template_name_snapshot}</td>
      <td style={{ padding: "10px 12px" }}>
        <div style={{ minWidth: 110 }}>
          <ProgressBar percent={rec.progress_percent} />
          <div style={{ fontSize: 10, color: C.textMut, marginTop: 4 }}>{Math.round(rec.progress_percent || 0)}%</div>
        </div>
      </td>
      <td style={{ padding: "10px 12px" }}><StatusBadge status={rec.overall_status} /></td>
      <td style={{ padding: "10px 12px", fontSize: 12, color: C.textMut }}>{rec.target_end_date ? fmtDate(rec.target_end_date) : "—"}</td>
    </tr>
  );

  const tableHeaderStyle = { padding: "8px 12px", fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: `2px solid ${C.border}`, textAlign: "left" };
  const rosterUsedKeys = Object.keys(rosterDraftFilters);
  const rosterAvailableFields = LABOR_ROSTER_FILTER_FIELDS.filter((field) => !rosterUsedKeys.includes(field.key));
  const rosterFilterSections = [...new Set(LABOR_ROSTER_FILTER_FIELDS.map((field) => field.section))];
  const isRosterFilterAdmin = profile?.role === "owner" || profile?.role === "enterprise_admin";
  const rosterNeedsValue = (op) => !["empty", "notEmpty", "has", "missing", "overdue", "today", "thisWeek", "hasDate", "noDate"].includes(op);
  const removeRosterFilter = (key) => {
    setRosterDraftFilters((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    if (configuringRosterKey === key) setConfiguringRosterKey(null);
  };
  const updateRosterFilter = (key, field, value) => {
    setRosterDraftFilters((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  };
  const applyRosterFilters = () => {
    setRosterFilters(rosterDraftFilters);
    setShowRosterFilterPanel(false);
    setShowRosterFilterPicker(false);
    setConfiguringRosterKey(null);
  };
  const clearRosterFilters = () => {
    setRosterDraftFilters({});
    setRosterFilters({});
    setActiveRosterViewId(null);
    setConfiguringRosterKey(null);
    setShowRosterFilterPicker(false);
  };
  const saveRosterView = async () => {
    if (!rosterViewName.trim()) return;
    const newView = {
      id: Date.now().toString(36),
      name: rosterViewName.trim(),
      filters: { ...rosterDraftFilters },
      createdBy: profile?.id || "unknown",
      createdAt: new Date().toISOString(),
    };
    await persistRosterViews([...(savedRosterViews || []), newView]);
    setActiveRosterViewId(newView.id);
    setRosterViewName("");
    setShowSaveRosterView(false);
    addGlobalToast?.(`View "${newView.name}" saved`, "success");
  };
  const deleteRosterView = async (viewId) => {
    await persistRosterViews((savedRosterViews || []).filter((view) => view.id !== viewId));
    if (activeRosterViewId === viewId) setActiveRosterViewId(null);
    addGlobalToast?.("View deleted");
  };
  const loadRosterView = (view) => {
    setRosterDraftFilters({ ...view.filters });
    setRosterFilters({ ...view.filters });
    setActiveRosterViewId(view.id);
    setShowRosterFilterPicker(false);
    setConfiguringRosterKey(null);
  };
  const selectRosterField = (key) => {
    const field = LABOR_ROSTER_FILTER_FIELDS.find((candidate) => candidate.key === key);
    if (!field) return;
    if (field.ops.length === 1 && !rosterNeedsValue(field.ops[0])) {
      setRosterDraftFilters((prev) => ({ ...prev, [key]: { op: field.ops[0], val: "" } }));
      setShowRosterFilterPicker(false);
      setConfiguringRosterKey(null);
      return;
    }
    setRosterDraftFilters((prev) => ({ ...prev, [key]: { op: field.ops[0], val: "" } }));
    setConfiguringRosterKey(key);
  };
  const confirmRosterConfig = () => {
    setConfiguringRosterKey(null);
    setShowRosterFilterPicker(false);
  };
  const rosterSectionIcons = {
    "Employee Info": <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
    Employment: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M16 20V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v16"/><rect x="6" y="6" width="4" height="4"/><path d="M18 7h4v13h-4"/><path d="M6 14h4"/><path d="M6 18h4"/></svg>,
    Compliance: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m9 12 2 2 4-4"/><path d="M12 3l8 4v5c0 5-3.5 9-8 10-4.5-1-8-5-8-10V7l8-4z"/></svg>,
    Reviews: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 2v4"/><path d="M16 2v4"/><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18"/></svg>,
  };
  const configuringRosterField = configuringRosterKey ? LABOR_ROSTER_FILTER_FIELDS.find((field) => field.key === configuringRosterKey) : null;
  const configuringRosterValue = configuringRosterKey ? rosterDraftFilters[configuringRosterKey] : null;
  const headerAction = (() => {
    if (tab === "home") {
      return showInlineLaborEmployeeComposer ? (
        <Btn variant="secondary" onClick={() => closeInlineLaborEmployeeComposer()}>Cancel Add</Btn>
      ) : (
        <Btn variant="primary" onClick={openInlineLaborEmployeeComposer}>Add Employee</Btn>
      );
    }
    if (tab === "training") {
      return <Btn variant="primary" onClick={() => setShowNewRecord(true)}>New Training Record</Btn>;
    }
    if (tab === "templates" && canManageTemplates) {
      if (previewTemplateId) {
        return (
          <Btn variant="primary" onClick={handleCreateTemplateDraft} disabled={savingTemplateAction === "draft"}>
            {savingTemplateAction === "draft" ? "Cloning..." : "New Draft"}
          </Btn>
        );
      }
      return <Btn variant="primary" onClick={() => setShowCreateTemplateModal(true)}>Add Template</Btn>;
    }
    if (tab === "notes") {
      return <Btn variant="primary" onClick={() => setShowGlobalNoteModal(true)}>Add Employee Note</Btn>;
    }
    return null;
  })();

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px" }}>
      <style>{`
        @keyframes laborRosterComposerIn {
          0% { opacity: 0; transform: translateY(-18px) scale(0.985); filter: blur(4px); }
          65% { opacity: 1; transform: translateY(2px) scale(1.002); filter: blur(0); }
          100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
        @keyframes laborRosterComposerSweep {
          0% { transform: translate3d(-200%, 0, 0) skewX(-18deg); opacity: 0; }
          12% { opacity: 0; }
          24% { opacity: 0.38; }
          48% { opacity: 0.86; }
          72% { opacity: 0.26; }
          100% { transform: translate3d(420%, 0, 0) skewX(-18deg); opacity: 0; }
        }
        @keyframes laborRosterFreshRow {
          0% { background: rgba(132, 204, 22, 0.22); }
          100% { background: transparent; }
        }
        @keyframes filterSlideIn { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes filterFadeIn { from { opacity:0; transform:scale(0.95); } to { opacity:1; transform:scale(1); } }
        @keyframes filterChipIn { from { opacity:0; transform:translateX(-6px) scale(0.9); } to { opacity:1; transform:translateX(0) scale(1); } }
        @keyframes configSlide { from { opacity:0; max-height:0; transform:translateY(-4px); } to { opacity:1; max-height:200px; transform:translateY(0); } }
      `}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <I.GraduationCap />
          <span style={{ fontSize: 22, fontWeight: 800, color: C.text }}>Labor Management</span>
        </div>
        {headerAction}
      </div>

      <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: `2px solid ${C.borderLight}` }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "10px 18px", fontSize: 13, fontWeight: tab === t.id ? 700 : 500,
            color: tab === t.id ? C.pri : C.textMut, background: "none", border: "none",
            borderBottom: tab === t.id ? `2px solid ${C.pri}` : "2px solid transparent",
            cursor: "pointer", fontFamily: "inherit", marginBottom: -2, transition: "color 0.15s",
          }}>{t.label}</button>
        ))}
      </div>

      {loading && <div style={{ textAlign: "center", padding: 60, color: C.textMut }}>Loading labor data...</div>}

      {!loading && tab === "home" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 24 }}>
            <MetricCard label="Active Employees" value={dashboardMetrics.activeEmployeeCount} color={C.pri} />
            <MetricCard label="Notes In 30 Days" value={dashboardMetrics.employeeNoteCount30d} color={C.acc} />
            <MetricCard label="New Hires In 30 Days" value={dashboardMetrics.newHireCount30d} color={C.suc} />
            <MetricCard label="Terminations In 30 Days" value={dashboardMetrics.terminationCount30d} color={C.dan} />
            <MetricCard label="Active Trainees" value={dashboardMetrics.activeTraineeCount} color={C.warn} />
            <MetricCard label="Attendance Marks In 30 Days" value={dashboardMetrics.attendanceMarkCount30d} color={C.text} />
            <MetricCard
              label="Training Compliance"
              value={`${dashboardMetrics.trainingComplianceScore}%`}
              helper={`${dashboardMetrics.trainingComplianceNumerator}/${dashboardMetrics.trainingComplianceDenominator || 0} active employees compliant`}
              color={dashboardMetrics.trainingComplianceScore === 100 ? C.suc : C.warn}
            />
          </div>

          {savedRosterViews.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 16px", borderRadius: 14, border: `1.5px solid ${C.border}`, background: C.surface, marginBottom: 12, flexWrap: "wrap", animation: "filterSlideIn 0.2s ease-out" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.textMut} strokeWidth="2" strokeLinecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
              <span style={{ fontSize: 10, fontWeight: 800, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.08em" }}>Saved Views</span>
              <div style={{ width: 1, height: 16, background: C.border, margin: "0 2px" }} />
              {savedRosterViews.map((view, index) => (
                <div key={view.id} style={{ display: "inline-flex", alignItems: "center", gap: 2, animation: `filterChipIn 0.25s ease-out ${index * 0.05}s both` }}>
                  <button
                    onClick={() => loadRosterView(view)}
                    style={{
                      padding: "5px 12px",
                      borderRadius: 8,
                      border: `1.5px solid ${activeRosterViewId === view.id ? C.pri : C.borderLight}`,
                      background: activeRosterViewId === view.id ? C.pri : "#fff",
                      color: activeRosterViewId === view.id ? "#fff" : C.text,
                      fontSize: 11,
                      fontWeight: activeRosterViewId === view.id ? 700 : 500,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      transition: "all 0.2s cubic-bezier(0.2,0.8,0.2,1)",
                      boxShadow: activeRosterViewId === view.id ? "0 2px 8px rgba(20,83,45,0.2)" : "0 1px 3px rgba(0,0,0,0.04)",
                    }}
                  >
                    {view.name}
                    {activeRosterViewId === view.id && <span style={{ marginLeft: 4, fontSize: 9 }}>({Object.keys(view.filters || {}).length})</span>}
                  </button>
                  {isRosterFilterAdmin && (
                    <button onClick={() => deleteRosterView(view.id)} style={{ border: "none", background: "none", cursor: "pointer", color: C.textMut, padding: "2px", display: "flex" }} title="Delete view">
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  )}
                </div>
              ))}
              {activeRosterViewId && (
                <button
                  onClick={() => {
                    setActiveRosterViewId(null);
                    setRosterDraftFilters({});
                    setRosterFilters({});
                  }}
                  style={{ fontSize: 10, fontWeight: 600, color: C.dan, border: "none", background: "none", cursor: "pointer", fontFamily: "inherit", marginLeft: 4, opacity: 0.7 }}
                >
                  Clear
                </button>
              )}
            </div>
          )}

          {showRosterFilterPanel && (
            <div style={{ marginBottom: 16, borderRadius: 14, border: `1.5px solid ${C.border}`, background: C.bg, boxShadow: "0 8px 40px rgba(0,0,0,0.08)", overflow: "hidden" }}>
              <div style={{ padding: "14px 18px", minHeight: 48 }}>
                {rosterUsedKeys.length === 0 && !showRosterFilterPicker && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px 0", animation: "filterFadeIn 0.2s ease-out" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.textMut} strokeWidth="1.5" strokeLinecap="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
                    <span style={{ fontSize: 13, color: C.textMut, fontWeight: 500 }}>No filters active</span>
                  </div>
                )}

                {rosterUsedKeys.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: showRosterFilterPicker ? 12 : 0 }}>
                    {rosterUsedKeys.map((key, index) => {
                      const field = LABOR_ROSTER_FILTER_FIELDS.find((candidate) => candidate.key === key);
                      if (!field) return null;
                      const filter = rosterDraftFilters[key];
                      const isConfiguring = configuringRosterKey === key;
                      return (
                        <div key={key} style={{ animation: `filterChipIn 0.2s ease-out ${index * 0.04}s both` }}>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 0, borderRadius: 10, border: `1.5px solid ${isConfiguring ? C.pri : C.border}`, background: isConfiguring ? `${C.pri}06` : "#fff", boxShadow: isConfiguring ? "0 0 0 3px rgba(20,83,45,0.06)" : "0 1px 3px rgba(0,0,0,0.04)", transition: "all 0.25s cubic-bezier(0.2,0.8,0.2,1)", overflow: "hidden" }}>
                            <button
                              onClick={() => {
                                setConfiguringRosterKey(isConfiguring ? null : key);
                                setShowRosterFilterPicker(false);
                              }}
                              style={{ padding: "6px 10px", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 700, color: C.pri, whiteSpace: "nowrap" }}
                            >
                              {field.label}
                            </button>
                            <div style={{ padding: "6px 0", display: "flex", alignItems: "center" }}>
                              <span style={{ padding: "2px 8px", borderRadius: 6, background: `${C.pri}12`, fontSize: 10, fontWeight: 700, color: C.pri, whiteSpace: "nowrap" }}>
                                {LC_OP_LABELS[filter.op] || filter.op}
                              </span>
                            </div>
                            {rosterNeedsValue(filter.op) && filter.val !== "" && (
                              <span style={{ padding: "6px 8px 6px 4px", fontSize: 11, fontWeight: 600, color: C.text, whiteSpace: "nowrap" }}>{filter.val}</span>
                            )}
                            {rosterNeedsValue(filter.op) && filter.val === "" && (
                              <span style={{ padding: "6px 8px 6px 4px", fontSize: 11, fontWeight: 500, color: C.dan, fontStyle: "italic", whiteSpace: "nowrap" }}>set value</span>
                            )}
                            <button onClick={() => removeRosterFilter(key)} style={{ padding: "6px 8px 6px 2px", border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", color: C.textMut }}>
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                            </button>
                          </div>

                          {isConfiguring && (
                            <div style={{ marginTop: 6, padding: "10px 14px", borderRadius: 10, background: "#fff", border: `1.5px solid ${C.pri}30`, boxShadow: "0 6px 24px rgba(20,83,45,0.1)", animation: "configSlide 0.25s ease-out", overflow: "hidden" }}>
                              <div style={{ marginBottom: rosterNeedsValue(filter.op) ? 10 : 0 }}>
                                <div style={{ fontSize: 9, fontWeight: 800, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Condition</div>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                  {field.ops.map((op, opIndex) => (
                                    <button
                                      key={op}
                                      onClick={() => {
                                        updateRosterFilter(key, "op", op);
                                        if (!rosterNeedsValue(op)) updateRosterFilter(key, "val", "");
                                      }}
                                      style={{
                                        padding: "5px 12px",
                                        borderRadius: 8,
                                        border: `1.5px solid ${filter.op === op ? C.pri : C.borderLight}`,
                                        background: filter.op === op ? C.pri : "#fff",
                                        color: filter.op === op ? "#fff" : C.text,
                                        fontSize: 11,
                                        fontWeight: filter.op === op ? 700 : 500,
                                        cursor: "pointer",
                                        fontFamily: "inherit",
                                        transition: "all 0.2s cubic-bezier(0.2,0.8,0.2,1)",
                                        animation: `filterFadeIn 0.2s ease-out ${opIndex * 0.03}s both`,
                                      }}
                                    >
                                      {LC_OP_LABELS[op] || op}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              {rosterNeedsValue(filter.op) && (
                                <div style={{ animation: "filterFadeIn 0.2s ease-out 0.1s both" }}>
                                  <div style={{ fontSize: 9, fontWeight: 800, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Value</div>
                                  {field.type === "select" ? (
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                      {(field.options || []).map((option, optionIndex) => (
                                        <button
                                          key={option}
                                          onClick={() => updateRosterFilter(key, "val", option)}
                                          style={{
                                            padding: "5px 12px",
                                            borderRadius: 8,
                                            border: `1.5px solid ${filter.val === option ? C.pri : C.borderLight}`,
                                            background: filter.val === option ? C.pri : "#fff",
                                            color: filter.val === option ? "#fff" : C.text,
                                            fontSize: 11,
                                            fontWeight: filter.val === option ? 700 : 500,
                                            cursor: "pointer",
                                            fontFamily: "inherit",
                                            animation: `filterFadeIn 0.15s ease-out ${optionIndex * 0.03}s both`,
                                          }}
                                        >
                                          {option || "(none)"}
                                        </button>
                                      ))}
                                    </div>
                                  ) : (
                                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                      <input
                                        type={field.type === "date" ? (filter.op === "inLastDays" ? "number" : "date") : "text"}
                                        value={filter.val}
                                        onChange={(event) => updateRosterFilter(key, "val", event.target.value)}
                                        onKeyDown={(event) => { if (event.key === "Enter") confirmRosterConfig(); }}
                                        placeholder={filter.op === "inLastDays" ? "Number of days" : field.type === "date" ? "YYYY-MM-DD" : "Type a value..."}
                                        autoFocus
                                        style={{ padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 13, fontFamily: "inherit", background: "#fff", color: C.text, width: "100%", maxWidth: 220, outline: "none" }}
                                      />
                                      <button onClick={confirmRosterConfig} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: C.pri, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>Done</button>
                                    </div>
                                  )}
                                </div>
                              )}
                              {!rosterNeedsValue(filter.op) && (
                                <button onClick={confirmRosterConfig} style={{ marginTop: 8, padding: "6px 14px", borderRadius: 8, border: "none", background: C.pri, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", animation: "filterFadeIn 0.2s ease-out" }}>Done</button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {!showRosterFilterPicker ? (
                  <div style={{ marginTop: rosterUsedKeys.length > 0 ? 8 : 0, animation: "filterFadeIn 0.2s ease-out" }}>
                    <button
                      onClick={() => {
                        setShowRosterFilterPicker(true);
                        setRosterFilterPickerReady(false);
                        setConfiguringRosterKey(null);
                        setTimeout(() => setRosterFilterPickerReady(true), 10);
                      }}
                      disabled={rosterAvailableFields.length === 0}
                      style={{ padding: "8px 16px", borderRadius: 10, border: `1.5px dashed ${rosterAvailableFields.length > 0 ? C.pri : C.border}`, background: "transparent", color: rosterAvailableFields.length > 0 ? C.pri : C.textMut, fontSize: 12, fontWeight: 700, cursor: rosterAvailableFields.length > 0 ? "pointer" : "default", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      Add Filter
                    </button>
                  </div>
                ) : (
                  <div style={{ marginTop: rosterUsedKeys.length > 0 ? 8 : 0, borderRadius: 12, border: `1.5px solid ${C.borderLight}`, background: "#fff", boxShadow: "0 4px 20px rgba(0,0,0,0.06)", overflow: "hidden", animation: "filterSlideIn 0.25s ease-out" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", borderBottom: `1px solid ${C.borderLight}`, background: C.surface }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: C.text }}>Choose a filter</span>
                      <button onClick={() => setShowRosterFilterPicker(false)} style={{ border: "none", background: "none", cursor: "pointer", color: C.textMut, padding: 2, display: "flex" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                    <div style={{ padding: "6px 0" }}>
                      {rosterFilterSections.map((section, sectionIndex) => {
                        const sectionFields = rosterAvailableFields.filter((field) => field.section === section);
                        if (sectionFields.length === 0) return null;
                        return (
                          <div key={section}>
                            <div style={{ padding: "8px 16px 4px", fontSize: 9, fontWeight: 800, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.1em", display: "flex", alignItems: "center", gap: 6, animation: rosterFilterPickerReady ? `filterFadeIn 0.2s ease-out ${sectionIndex * 0.06}s both` : "none" }}>
                              {rosterSectionIcons[section] || null} {section}
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, padding: "4px 16px 8px" }}>
                              {sectionFields.map((field, fieldIndex) => {
                                const delay = sectionIndex * 0.06 + fieldIndex * 0.03 + 0.05;
                                return (
                                  <button
                                    key={field.key}
                                    onClick={() => {
                                      selectRosterField(field.key);
                                      setShowRosterFilterPicker(false);
                                    }}
                                    style={{ padding: "6px 14px", borderRadius: 8, border: `1.5px solid ${C.borderLight}`, background: "#fff", color: C.text, fontSize: 11, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s cubic-bezier(0.2,0.8,0.2,1)", boxShadow: "0 1px 3px rgba(0,0,0,0.03)", animation: rosterFilterPickerReady ? `filterChipIn 0.25s ease-out ${delay}s both` : "none" }}
                                  >
                                    {field.label}
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

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "10px 18px", borderTop: `1px solid ${C.borderLight}`, background: C.surface }}>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={applyRosterFilters} style={{ padding: "8px 20px", borderRadius: 10, border: "none", background: C.pri, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 2px 12px rgba(20,83,45,0.2)" }}>
                    Apply{rosterUsedKeys.length > 0 ? ` (${rosterUsedKeys.length})` : ""}
                  </button>
                  {rosterUsedKeys.length > 0 && (
                    <button onClick={clearRosterFilters} style={{ padding: "8px 14px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: "transparent", color: C.textSec, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                      Clear All
                    </button>
                  )}
                  <button onClick={() => { setShowRosterFilterPanel(false); setShowRosterFilterPicker(false); setConfiguringRosterKey(null); }} style={{ padding: "8px 14px", borderRadius: 10, border: `1.5px solid ${C.borderLight}`, background: "transparent", color: C.textMut, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
                    Close
                  </button>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {isRosterFilterAdmin && !showSaveRosterView && rosterUsedKeys.length > 0 && (
                    <button onClick={() => setShowSaveRosterView(true)} style={{ padding: "7px 14px", borderRadius: 10, border: `1.5px solid ${C.borderLight}`, background: "#fff", color: C.text, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5, boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                      Save as View
                    </button>
                  )}
                  {showSaveRosterView && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, animation: "filterFadeIn 0.2s ease-out" }}>
                      <input
                        value={rosterViewName}
                        onChange={(event) => setRosterViewName(event.target.value)}
                        placeholder="View name..."
                        autoFocus
                        onKeyDown={(event) => {
                          if (event.key === "Enter") saveRosterView();
                          if (event.key === "Escape") setShowSaveRosterView(false);
                        }}
                        style={{ padding: "7px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 12, fontFamily: "inherit", width: 160, background: "#fff", color: C.text, outline: "none" }}
                      />
                      <button onClick={saveRosterView} disabled={!rosterViewName.trim()} style={{ padding: "7px 16px", borderRadius: 8, border: "none", background: rosterViewName.trim() ? C.suc : C.textMut, color: "#fff", fontSize: 11, fontWeight: 700, cursor: rosterViewName.trim() ? "pointer" : "default", fontFamily: "inherit" }}>
                        Save
                      </button>
                      <button onClick={() => setShowSaveRosterView(false)} style={{ border: "none", background: "none", cursor: "pointer", color: C.textMut, padding: 2, display: "flex" }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <SectionHeader title="Roster" count={sortedRosterRows.length}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Btn
                variant={showRosterFilterPanel || Object.keys(rosterFilters).length > 0 ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setShowRosterFilterPanel((current) => !current)}
              >
                Filter{Object.keys(rosterFilters).length > 0 ? ` (${Object.keys(rosterFilters).length})` : ""}
              </Btn>
              <Btn
                variant={showInactiveRoster ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setShowInactiveRoster((current) => !current)}
              >
                {showInactiveRoster ? "Hide Inactive" : "Show Inactive"}
              </Btn>
              {showInlineLaborEmployeeComposer ? (
                <Btn variant="ghost" size="sm" onClick={() => closeInlineLaborEmployeeComposer()}>Cancel Add</Btn>
              ) : (
                <Btn variant="secondary" size="sm" onClick={openInlineLaborEmployeeComposer}>Add Employee</Btn>
              )}
            </div>
          </SectionHeader>
          {hasRosterEmployeesInGraceWindow && (
            <Card style={{ padding: "12px 14px", marginBottom: 12, background: C.warnLt, border: `1px solid ${C.warn}33` }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.warn, marginBottom: 4 }}>Training grace period active</div>
              <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.55 }}>
                Employees hired within the last {TRAINING_GRACE_PERIOD_DAYS} days show as <strong>In Progress</strong> while training and CPR requirements are being completed.
              </div>
            </Card>
          )}
          {sortedRosterRows.length === 0 && !showInlineLaborEmployeeComposer ? (
            <EmptyState icon="Users" title="No employees yet" subtitle="Add your first employee to start using labor management." />
          ) : (
            <Card style={{ padding: 0, overflow: "hidden", marginBottom: 24 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>
                  {[
                    { key: "first_name", label: "First Name" },
                    { key: "last_name", label: "Last Name" },
                    { key: "start_date", label: "Start Date" },
                    { key: "email", label: "Email" },
                    { key: "phone", label: "Phone" },
                    { key: "position", label: "Position" },
                    { key: "training", label: "Training" },
                    { key: "review30", label: "30-Day" },
                    { key: "review60", label: "60-Day" },
                    { key: "review90", label: "90-Day" },
                  ].map((column) => (
                    <th key={column.key} style={tableHeaderStyle}>
                      <button
                        type="button"
                        onClick={() => setRosterSort((current) => ({
                          key: column.key,
                          direction: current.key === column.key && current.direction === "asc" ? "desc" : "asc",
                        }))}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          background: "none",
                          border: "none",
                          padding: 0,
                          fontFamily: "inherit",
                          fontSize: 12,
                          fontWeight: 700,
                          color: C.textMut,
                          cursor: "pointer",
                        }}
                      >
                        <span>{column.label}</span>
                        <span style={{ color: rosterSort.key === column.key ? C.pri : C.textMut }}>
                          {rosterSort.key === column.key ? (rosterSort.direction === "asc" ? "↑" : "↓") : "↕"}
                        </span>
                      </button>
                    </th>
                  ))}
                  <th style={tableHeaderStyle}>Record</th>
                </tr></thead>
                <tbody>
                  {showInlineLaborEmployeeComposer && (
                    <tr>
                      <td colSpan={11} style={{ padding: 12, borderBottom: `1px solid ${C.borderLight}`, background: `${C.priLt}66` }}>
                        <form
                          onSubmit={(event) => {
                            event.preventDefault();
                            handleCreateLaborEmployeeInline();
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") {
                              event.preventDefault();
                              closeInlineLaborEmployeeComposer();
                            }
                          }}
                          style={{
                            position: "relative",
                            overflow: "hidden",
                            borderRadius: 20,
                            border: `1px solid ${C.acc}55`,
                            background: "linear-gradient(135deg, rgba(132,204,22,0.14), rgba(20,83,45,0.08) 55%, rgba(255,255,255,0.92))",
                            boxShadow: "0 24px 50px rgba(20, 83, 45, 0.12)",
                            padding: "16px 16px 14px",
                            opacity: inlineLaborEmployeeComposerEntered ? 1 : 0,
                            transform: inlineLaborEmployeeComposerEntered ? "translateY(0) scale(1)" : "translateY(-18px) scale(0.985)",
                            filter: inlineLaborEmployeeComposerEntered ? "blur(0)" : "blur(4px)",
                            transition: `opacity ${INLINE_ROSTER_COMPOSER_TRANSITION_MS}ms ease, transform ${INLINE_ROSTER_COMPOSER_TRANSITION_MS}ms cubic-bezier(0.22, 1, 0.36, 1), filter ${INLINE_ROSTER_COMPOSER_TRANSITION_MS}ms ease`,
                            animation: inlineLaborEmployeeComposerEntered ? "laborRosterComposerIn 380ms cubic-bezier(0.22, 1, 0.36, 1)" : "none",
                          }}
                        >
                          <div
                            aria-hidden="true"
                            style={{
                              position: "absolute",
                              inset: "-24% auto -24% -16%",
                              width: "34%",
                              background: "linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.26), rgba(190,242,100,0.28), rgba(255,255,255,0.88), rgba(255,255,255,0))",
                              transform: "translate3d(-200%, 0, 0) skewX(-18deg)",
                              opacity: 0,
                              animation: inlineLaborEmployeeComposerEntered ? "laborRosterComposerSweep 1850ms cubic-bezier(0.22, 1, 0.36, 1) infinite" : "none",
                              willChange: "transform, opacity",
                              mixBlendMode: "screen",
                              filter: "blur(2px)",
                              pointerEvents: "none",
                            }}
                          />
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
                            <div>
                              <div style={{ fontSize: 15, fontWeight: 800, color: C.pri }}>New roster row</div>
                              <div style={{ fontSize: 12, color: C.textMut }}>Start typing immediately. Tab moves left-to-right across the row.</div>
                            </div>
                            <div style={{ fontSize: 11, color: C.textMut, fontWeight: 700 }}>Esc to cancel · Enter to save</div>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(112px, 1fr)) auto", gap: 10, alignItems: "end" }}>
                            <label style={{ display: "grid", gap: 6 }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase" }}>First Name</span>
                              <input
                                ref={firstRosterNameInputRef}
                                value={newRosterEmployeeFirstName}
                                onChange={(event) => setNewRosterEmployeeFirstName(event.target.value)}
                                placeholder="First name"
                                style={{ width: "100%", padding: "12px 14px", borderRadius: 14, border: `1.5px solid ${C.border}`, fontSize: 14, fontFamily: "inherit", color: C.text, background: "rgba(255,255,255,0.92)", outline: "none", boxSizing: "border-box" }}
                                onFocus={(event) => { event.target.style.borderColor = C.acc; event.target.style.boxShadow = "0 0 0 4px rgba(132,204,22,0.16)"; }}
                                onBlur={(event) => { event.target.style.borderColor = C.border; event.target.style.boxShadow = "none"; }}
                              />
                            </label>
                            <label style={{ display: "grid", gap: 6 }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase" }}>Last Name</span>
                              <input
                                value={newRosterEmployeeLastName}
                                onChange={(event) => setNewRosterEmployeeLastName(event.target.value)}
                                placeholder="Last name"
                                style={{ width: "100%", padding: "12px 14px", borderRadius: 14, border: `1.5px solid ${C.border}`, fontSize: 14, fontFamily: "inherit", color: C.text, background: "rgba(255,255,255,0.92)", outline: "none", boxSizing: "border-box" }}
                                onFocus={(event) => { event.target.style.borderColor = C.acc; event.target.style.boxShadow = "0 0 0 4px rgba(132,204,22,0.16)"; }}
                                onBlur={(event) => { event.target.style.borderColor = C.border; event.target.style.boxShadow = "none"; }}
                              />
                            </label>
                            <label style={{ display: "grid", gap: 6 }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase" }}>Phone</span>
                              <input
                                type="tel"
                                value={fmtPhoneInput(newRosterEmployeePhone)}
                                onChange={(event) => setNewRosterEmployeePhone(event.target.value.replace(/\D/g, "").slice(0, 10))}
                                placeholder="(555) 123-4567"
                                style={{ width: "100%", padding: "12px 14px", borderRadius: 14, border: `1.5px solid ${C.border}`, fontSize: 14, fontFamily: "inherit", color: C.text, background: "rgba(255,255,255,0.92)", outline: "none", boxSizing: "border-box" }}
                                onFocus={(event) => { event.target.style.borderColor = C.acc; event.target.style.boxShadow = "0 0 0 4px rgba(132,204,22,0.16)"; }}
                                onBlur={(event) => { event.target.style.borderColor = C.border; event.target.style.boxShadow = "none"; }}
                              />
                            </label>
                            <label style={{ display: "grid", gap: 6 }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase" }}>Email</span>
                              <input
                                type="email"
                                value={newRosterEmployeeEmail}
                                onChange={(event) => setNewRosterEmployeeEmail(event.target.value)}
                                placeholder="name@k9resorts.com"
                                style={{ width: "100%", padding: "12px 14px", borderRadius: 14, border: `1.5px solid ${C.border}`, fontSize: 14, fontFamily: "inherit", color: C.text, background: "rgba(255,255,255,0.92)", outline: "none", boxSizing: "border-box" }}
                                onFocus={(event) => { event.target.style.borderColor = C.acc; event.target.style.boxShadow = "0 0 0 4px rgba(132,204,22,0.16)"; }}
                                onBlur={(event) => { event.target.style.borderColor = C.border; event.target.style.boxShadow = "none"; }}
                              />
                            </label>
                            <label style={{ display: "grid", gap: 6 }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase" }}>Position Title</span>
                              <input
                                value={newRosterEmployeeRole}
                                onChange={(event) => setNewRosterEmployeeRole(event.target.value)}
                                placeholder="Position title"
                                style={{ width: "100%", padding: "12px 14px", borderRadius: 14, border: `1.5px solid ${C.border}`, fontSize: 14, fontFamily: "inherit", color: C.text, background: "rgba(255,255,255,0.92)", outline: "none", boxSizing: "border-box" }}
                                onFocus={(event) => { event.target.style.borderColor = C.acc; event.target.style.boxShadow = "0 0 0 4px rgba(132,204,22,0.16)"; }}
                                onBlur={(event) => { event.target.style.borderColor = C.border; event.target.style.boxShadow = "none"; }}
                              />
                            </label>
                            <label style={{ display: "grid", gap: 6 }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase" }}>Start Date</span>
                              <input
                                type="date"
                                value={newRosterEmployeeStartDate}
                                onChange={(event) => setNewRosterEmployeeStartDate(event.target.value)}
                                style={{ width: "100%", padding: "12px 14px", borderRadius: 14, border: `1.5px solid ${C.border}`, fontSize: 14, fontFamily: "inherit", color: C.text, background: "rgba(255,255,255,0.92)", outline: "none", boxSizing: "border-box" }}
                                onFocus={(event) => { event.target.style.borderColor = C.acc; event.target.style.boxShadow = "0 0 0 4px rgba(132,204,22,0.16)"; }}
                                onBlur={(event) => { event.target.style.borderColor = C.border; event.target.style.boxShadow = "none"; }}
                              />
                            </label>
                            <label style={{ display: "grid", gap: 6 }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase" }}>End Date</span>
                              <input
                                type="date"
                                value={newRosterEmployeeEndDate}
                                onChange={(event) => setNewRosterEmployeeEndDate(event.target.value)}
                                style={{ width: "100%", padding: "12px 14px", borderRadius: 14, border: `1.5px solid ${C.border}`, fontSize: 14, fontFamily: "inherit", color: C.text, background: "rgba(255,255,255,0.92)", outline: "none", boxSizing: "border-box" }}
                                onFocus={(event) => { event.target.style.borderColor = C.acc; event.target.style.boxShadow = "0 0 0 4px rgba(132,204,22,0.16)"; }}
                                onBlur={(event) => { event.target.style.borderColor = C.border; event.target.style.boxShadow = "none"; }}
                              />
                            </label>
                            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                              <button
                                type="button"
                                onClick={() => closeInlineLaborEmployeeComposer()}
                                disabled={savingInlineLaborEmployee}
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  padding: "10px 16px",
                                  borderRadius: 12,
                                  border: "none",
                                  background: "transparent",
                                  color: C.textSec,
                                  fontSize: 14,
                                  fontWeight: 700,
                                  fontFamily: "inherit",
                                  cursor: savingInlineLaborEmployee ? "not-allowed" : "pointer",
                                  opacity: savingInlineLaborEmployee ? 0.5 : 1,
                                }}
                              >
                                Cancel
                              </button>
                              <button
                                type="submit"
                                disabled={savingInlineLaborEmployee}
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  padding: "10px 18px",
                                  borderRadius: 14,
                                  border: "none",
                                  background: C.pri,
                                  color: "#fff",
                                  fontSize: 14,
                                  fontWeight: 700,
                                  fontFamily: "inherit",
                                  cursor: savingInlineLaborEmployee ? "not-allowed" : "pointer",
                                  opacity: savingInlineLaborEmployee ? 0.55 : 1,
                                  boxShadow: "0 14px 28px rgba(20, 83, 45, 0.18)",
                                }}
                              >
                                {savingInlineLaborEmployee ? "Saving..." : "Create Employee"}
                              </button>
                            </div>
                          </div>
                          <div style={{ marginTop: 10, fontSize: 12, color: C.textMut }}>
                            Active status is automatic. Leave End Date blank until the employee leaves. Phone and email appear directly in the roster.
                          </div>
                        </form>
                      </td>
                    </tr>
                  )}
                  {sortedRosterRows.map((row) => {
                    return (
                      <tr
                        key={row.labor_employee_id}
                        style={{
                          borderBottom: `1px solid ${C.borderLight}`,
                          animation: row.labor_employee_id === justCreatedLaborEmployeeId ? "laborRosterFreshRow 1.8s ease-out" : "none",
                        }}
                      >
                        <td style={{ padding: "10px 12px", fontSize: 12, color: C.textSec, fontWeight: 600 }}>{row.first_name || "—"}</td>
                        <td style={{ padding: "10px 12px", fontSize: 12, color: C.text }}>{row.last_name || "—"}</td>
                        <td style={{ padding: "10px 12px", fontSize: 12, color: C.textSec }}>
                          {row.start_date ? fmtDate(row.start_date) : "—"}
                          {!row.is_active && row.end_date ? (
                            <div style={{ fontSize: 11, color: C.textMut, marginTop: 4 }}>Inactive since {fmtDate(row.end_date)}</div>
                          ) : null}
                        </td>
                        <td style={{ padding: "10px 12px", fontSize: 12, color: row.contact_email ? C.textSec : C.textMut }}>
                          {row.contact_email || "—"}
                        </td>
                        <td style={{ padding: "10px 12px", fontSize: 12, color: row.contact_phone ? C.textSec : C.textMut }}>
                          {row.contact_phone ? fmtPhoneInput(row.contact_phone) : "—"}
                        </td>
                        <td style={{ padding: "10px 12px", fontSize: 12, color: C.textSec }}>{row.position_title || "—"}</td>
                        <td style={{ padding: "10px 12px" }}>
                          <div style={{ display: "grid", gap: 4 }}>
                            <Badge color={row.training_compliance.color}>{row.training_compliance.label}</Badge>
                            <div style={{ fontSize: 11, color: C.textMut }}>
                              CPR: {getDueSoonLabel(row.cpr_status)}
                            </div>
                          </div>
                        </td>
                        {["review30", "review60", "review90"].map((reviewKey) => (
                          <td key={reviewKey} style={{ padding: "10px 12px" }}>
                            <div
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                minWidth: 88,
                                padding: "6px 10px",
                                borderRadius: 999,
                                background: row[reviewKey].background,
                                color: row[reviewKey].tone,
                                fontSize: 11,
                                fontWeight: 700,
                              }}
                            >
                              {row[reviewKey].label}
                            </div>
                          </td>
                        ))}
                        <td style={{ padding: "10px 12px" }}>
                          <Btn variant="ghost" size="sm" onClick={() => openLaborEmployeeProfile(row.labor_employee_id)}>View Record</Btn>
                        </td>
                      </tr>
                    );
                  })}
                  {sortedRosterRows.length === 0 && showInlineLaborEmployeeComposer && (
                    <tr>
                      <td colSpan={11} style={{ padding: "14px 16px", fontSize: 12, color: C.textMut }}>
                        Your first employee will land directly in the roster the moment you save this row.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      )}

      {!loading && tab === "training" && (
        <div>
          <SectionHeader title="Active Training Records" count={activeRecords.length} />
          {activeRecords.length === 0 ? (
            <EmptyState icon="GraduationCap" title="No active records" subtitle="Create a new training record to get started" />
          ) : (
            <Card style={{ padding: 0, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>
                  <th style={tableHeaderStyle}>Employee</th>
                  <th style={tableHeaderStyle}>Position</th>
                  <th style={tableHeaderStyle}>Training Plan</th>
                  <th style={tableHeaderStyle}>Progress</th>
                  <th style={tableHeaderStyle}>Status</th>
                  <th style={tableHeaderStyle}>Target</th>
                </tr></thead>
                <tbody>{activeRecords.map(r => <RecordRow key={r.id} rec={r} />)}</tbody>
              </table>
            </Card>
          )}
          <div style={{ height: 20 }} />
          <SectionHeader title="Completed Training Records" count={completedRecords.length} />
          {completedRecords.length === 0 ? (
            <EmptyState icon="CheckCircle" title="No completed records" subtitle="Completed training records will appear here" />
          ) : (
            <Card style={{ padding: 0, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>
                  <th style={tableHeaderStyle}>Employee</th>
                  <th style={tableHeaderStyle}>Position</th>
                  <th style={tableHeaderStyle}>Training Plan</th>
                  <th style={tableHeaderStyle}>Progress</th>
                  <th style={tableHeaderStyle}>Status</th>
                  <th style={tableHeaderStyle}>Target</th>
                </tr></thead>
                <tbody>{completedRecords.map((record) => <RecordRow key={record.id} rec={record} />)}</tbody>
              </table>
            </Card>
          )}
        </div>
      )}

      {!loading && tab === "templates" && !previewTemplateId && (
        <div>
          {templateGroups.map((group) => (
            <div key={group.key} style={{ marginBottom: 24 }}>
              <SectionHeader title={group.label} count={group.rows.length} />
              {group.rows.length === 0 ? (
                <EmptyState icon="FileText" title={`No ${group.label.toLowerCase()} yet`} subtitle="Templates will appear here." />
              ) : (
                <Card style={{ padding: 0, overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead><tr>
                      <th style={tableHeaderStyle}>Name</th>
                      <th style={tableHeaderStyle}>Class</th>
                      <th style={tableHeaderStyle}>Roles</th>
                      <th style={tableHeaderStyle}>Sections</th>
                      <th style={tableHeaderStyle}>Items</th>
                      <th style={tableHeaderStyle}>Version</th>
                    </tr></thead>
                    <tbody>
                      {group.rows.map((row) => {
                        return (
                          <tr
                            key={`${row.kind}_${row.id}`}
                            onClick={() => openTemplatePreview(row.id, row.version?.id || null, row.kind)}
                            style={{ cursor: "pointer", borderBottom: `1px solid ${C.borderLight}` }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = C.surfaceHover; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                          >
                            <td style={{ padding: "10px 12px", fontSize: 13, fontWeight: 700, color: C.pri }}>{row.name}</td>
                            <td style={{ padding: "10px 12px", fontSize: 12, color: C.textSec }}>{row.template_class.replace(/_/g, " ")}</td>
                            <td style={{ padding: "10px 12px", fontSize: 12, color: C.textSec }}>{row.role_scopes.join(", ") || "All"}</td>
                            <td style={{ padding: "10px 12px", fontSize: 12, color: C.textSec, textAlign: "center" }}>{row.stats.sectionCount || 0}</td>
                            <td style={{ padding: "10px 12px", fontSize: 12, color: C.textSec, textAlign: "center" }}>{row.stats.itemCount || 0}</td>
                            <td style={{ padding: "10px 12px", fontSize: 12, color: C.textSec }}>{row.version ? `v${row.version.version_no}` : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </Card>
              )}
            </div>
          ))}
        </div>
      )}

      {!loading && tab === "templates" && previewTemplateId && previewTemplate && (
        <div>
          <button onClick={() => { setPreviewTemplateId(null); setPreviewTemplateVersionId(null); }} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: C.pri, fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 16, fontFamily: "inherit", padding: 0 }}>
            <I.Back /> Back to Templates
          </button>

          <Card style={{ padding: 24, marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
              <div>
                {canManageTemplates && previewTemplate.version?.status === "draft" ? (
                  <input
                    defaultValue={previewTemplate.name}
                    onBlur={(event) => handleUpdateTemplateName(event.target.value)}
                    style={{ width: "100%", maxWidth: 420, padding: "10px 12px", borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 22, fontWeight: 800, color: C.text, fontFamily: "inherit", marginBottom: 8 }}
                  />
                ) : (
                  <div style={{ fontSize: 22, fontWeight: 800, color: C.text, marginBottom: 4 }}>{previewTemplate.name}</div>
                )}
                <div style={{ fontSize: 14, color: C.textSec, marginBottom: 8 }}>
                  {(previewTemplate.kind === "review" ? "performance_review" : previewTemplate.template_class).replace(/_/g, " ")} — {previewTemplate.role_scopes.join(", ") || "All Roles"}
                </div>
                {previewTemplate.version && (
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12, color: C.textMut }}>
                    <span>Version {previewTemplate.version.version_no}</span>
                    <span>Status: {previewTemplate.version.status}</span>
                    {previewTemplate.version.is_current && <span>Current live version</span>}
                    {previewTemplate.version.published_at && <span>Published: {formatTrainingTimestamp(previewTemplate.version.published_at)}</span>}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
                {previewTemplate.is_active ? <Badge color="green">Active</Badge> : <Badge color="default">Inactive</Badge>}
                <div style={{ marginTop: 8, fontSize: 12, color: C.textMut }}>{(templateStats[previewTemplate.id] || {}).sectionCount || 0} sections — {(templateStats[previewTemplate.id] || {}).itemCount || 0} items</div>
                {canManageTemplates && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <Btn
                      variant="secondary"
                      size="sm"
                      onClick={handleCreateTemplateDraft}
                      disabled={savingTemplateAction === "draft"}
                    >
                      {savingTemplateAction === "draft" ? "Cloning..." : "New Draft"}
                    </Btn>
                    {previewTemplate.version?.status === "draft" && (
                      <Btn
                        variant="primary"
                        size="sm"
                        onClick={handlePublishTemplateVersion}
                        disabled={savingTemplateAction === "publish"}
                      >
                        {savingTemplateAction === "publish" ? "Publishing..." : "Publish Draft"}
                      </Btn>
                    )}
                    {previewTemplate.version && previewTemplate.version.status !== "draft" && (
                      <Btn
                        variant="ghost"
                        size="sm"
                        onClick={handleRestoreTemplateVersion}
                        disabled={savingTemplateAction === "restore"}
                      >
                        {savingTemplateAction === "restore" ? "Restoring..." : "Restore To Draft"}
                      </Btn>
                    )}
                  </div>
                )}
              </div>
            </div>
          </Card>

          <Card style={{ padding: 16, marginBottom: 16 }}>
            <SectionHeader title="Version History" count={previewTemplateVersionHistory.length} />
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {previewTemplateVersionHistory.map((version) => {
                const selected = previewTemplate.version?.id === version.id;
                return (
                  <button
                    key={version.id}
                    onClick={() => setPreviewTemplateVersionId(version.id)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      borderRadius: 12,
                      border: selected ? `1.5px solid ${C.pri}` : `1px solid ${C.borderLight}`,
                      background: selected ? C.priLt : C.surface,
                      padding: "12px 14px",
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                          v{version.version_no} {version.is_current ? "· Current" : ""}
                        </div>
                        <div style={{ fontSize: 11, color: C.textMut, marginTop: 2 }}>
                          {version.published_at
                            ? `Published ${formatTrainingTimestamp(version.published_at)}`
                            : `Created ${formatTrainingTimestamp(version.created_at)}`}
                        </div>
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: version.status === "published" ? C.suc : version.status === "draft" ? C.warn : C.textMut }}>
                        {version.status}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>

          <SectionHeader title={previewTemplate.kind === "review" ? "Review Structure" : "Template Structure"} count={previewTemplate.sections.length}>
            {canManageTemplates && previewTemplate.version?.status === "draft" && (
              <Btn variant="secondary" size="sm" onClick={() => handleAddTemplateSection(null)}>Add Section</Btn>
            )}
          </SectionHeader>
          {previewTemplate.kind === "review" ? previewTemplate.sections.map((sec) => {
            const isOpen = expandedSections[`review_${sec.id}`];
            const isDraft = canManageTemplates && previewTemplate.version?.status === "draft";
            return (
              <Card key={sec.id} style={{ marginBottom: 8, padding: 0, overflow: "hidden" }}>
                <button
                  onClick={() => toggleSection(`review_${sec.id}`)}
                  style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: isOpen ? C.priLt : "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ transform: isOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s" }}><I.ChevronRight /></span>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{sec.title}</div>
                      {sec.instructions && <div style={{ fontSize: 11, color: C.textMut, marginTop: 4 }}>{sec.instructions}</div>}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, color: C.textMut }}>{sec.items.length} prompt{sec.items.length !== 1 ? "s" : ""}</span>
                </button>

                {isOpen && (
                  <div style={{ padding: "0 16px 14px" }}>
                    {isDraft && (
                      <Card style={{ padding: 12, marginTop: 12, background: C.bg, border: `1px solid ${C.borderLight}` }}>
                        <div style={{ display: "grid", gap: 10 }}>
                          <input
                            defaultValue={sec.title}
                            onBlur={(event) => {
                              const value = event.target.value.trim();
                              if (value && value !== sec.title) {
                                handleUpdateTemplateSection(sec.id, { title: value });
                              }
                            }}
                            placeholder="Section title"
                            style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontWeight: 700, fontFamily: "inherit" }}
                          />
                          <textarea
                            defaultValue={sec.instructions || ""}
                            onBlur={(event) => {
                              const value = event.target.value.trim();
                              if (value !== (sec.instructions || "")) {
                                handleUpdateTemplateSection(sec.id, { instructions: value || null });
                              }
                            }}
                            placeholder="Section description"
                            rows={2}
                            style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }}
                          />
                          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                            <Btn variant="secondary" size="sm" onClick={() => handleAddTemplateItem(sec.id)}>Add Prompt</Btn>
                            <Btn variant="ghost" size="sm" onClick={() => handleDeleteTemplateSection(sec.id)}>Delete Section</Btn>
                          </div>
                        </div>
                      </Card>
                    )}
                    <div style={{ marginTop: 12 }}>
                      {sec.items.map((item) => renderTemplatePreviewItem(item, isDraft))}
                    </div>
                  </div>
                )}
              </Card>
            );
          }) : previewTemplate.sections.map(sec => {
            const isOpen = expandedSections[`tpl_${sec.id}`];
            const totalItems = sec.children.reduce((sum, c) => sum + c.items.length, 0) + sec.directItems.length;
            const isDraft = canManageTemplates && previewTemplate.version?.status === "draft";
            return (
              <Card key={sec.id} style={{ marginBottom: 8, padding: 0, overflow: "hidden" }}>
                <button onClick={() => toggleSection(`tpl_${sec.id}`)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: isOpen ? C.priLt : "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "background 0.15s" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                    <span style={{ transform: isOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s", flexShrink: 0 }}><I.ChevronRight /></span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sec.title}</div>
                      {(sec.day_number || sec.time_block_start) && <div style={{ fontSize: 11, color: C.textMut }}>
                        {formatTrainingTimeRange(sec.time_block_start, sec.time_block_end) || `Day ${sec.day_number}`}
                      </div>}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, color: C.textMut, fontWeight: 600, flexShrink: 0 }}>
                    {sec.children.length > 0 ? `${sec.children.length} module${sec.children.length !== 1 ? "s" : ""}` : ""}{sec.children.length > 0 && totalItems > 0 ? " — " : ""}{totalItems > 0 ? `${totalItems} item${totalItems !== 1 ? "s" : ""}` : ""}
                  </span>
                </button>

                {isOpen && (
                  <div style={{ padding: "0 16px 14px" }}>
                    {isDraft && (
                      <Card style={{ padding: 12, marginTop: 12, background: C.bg, border: `1px solid ${C.borderLight}` }}>
                        <div style={{ display: "grid", gap: 10 }}>
                          <input
                            defaultValue={sec.title}
                            onBlur={(event) => {
                              const value = event.target.value.trim();
                              if (value && value !== sec.title) {
                                handleUpdateTemplateSection(sec.id, { title: value });
                              }
                            }}
                            placeholder="Section title"
                            style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontWeight: 700, fontFamily: "inherit" }}
                          />
                          <textarea
                            defaultValue={sec.instructions || ""}
                            onBlur={(event) => {
                              const value = event.target.value.trim();
                              if (value !== (sec.instructions || "")) {
                                handleUpdateTemplateSection(sec.id, { instructions: value || null });
                              }
                            }}
                            placeholder="Section description"
                            rows={2}
                            style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }}
                          />
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                            <Btn variant="secondary" size="sm" onClick={() => handleAddTemplateSection(sec.id)}>Add Module</Btn>
                            <Btn variant="secondary" size="sm" onClick={() => handleAddTemplateItem(sec.id)}>Add Task</Btn>
                            <Btn variant="ghost" size="sm" onClick={() => handleDeleteTemplateSection(sec.id)}>Delete Section</Btn>
                          </div>
                        </div>
                      </Card>
                    )}
                    {sec.children.map(child => (
                      <div key={child.id} style={{ marginTop: 12 }}>
                        {isDraft ? (
                          <Card style={{ padding: 12, background: C.surface, border: `1px solid ${C.borderLight}` }}>
                            <div style={{ display: "grid", gap: 10 }}>
                              <input
                                defaultValue={child.title}
                                onBlur={(event) => {
                                  const value = event.target.value.trim();
                                  if (value && value !== child.title) {
                                    handleUpdateTemplateSection(child.id, { title: value });
                                  }
                                }}
                                placeholder="Module title"
                                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, fontWeight: 700, fontFamily: "inherit", color: C.pri }}
                              />
                              <textarea
                                defaultValue={child.instructions || ""}
                                onBlur={(event) => {
                                  const value = event.target.value.trim();
                                  if (value !== (child.instructions || "")) {
                                    handleUpdateTemplateSection(child.id, { instructions: value || null });
                                  }
                                }}
                                placeholder="Module description"
                                rows={2}
                                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }}
                              />
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                                <Btn variant="secondary" size="sm" onClick={() => handleAddTemplateItem(child.id)}>Add Task</Btn>
                                <Btn variant="ghost" size="sm" onClick={() => handleDeleteTemplateSection(child.id)}>Delete Module</Btn>
                              </div>
                              {child.items.map((item) => renderTemplatePreviewItem(item, true))}
                            </div>
                          </Card>
                        ) : (
                          <>
                            <div style={{ fontSize: 12, fontWeight: 700, color: C.pri, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>{child.title}</div>
                            {child.items.map((item) => renderTemplatePreviewItem(item))}
                          </>
                        )}
                      </div>
                    ))}
                    {sec.directItems.map(item => renderTemplatePreviewItem(item, isDraft))}
                    {!isDraft && sec.instructions && <div style={{ marginTop: 8, fontSize: 11, color: C.textMut, fontStyle: "italic" }}>{sec.instructions}</div>}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {!loading && tab === "notes" && (
        <div>
          <SectionHeader title="Global Notes Feed" count={filteredGlobalNotes.length}>
            <Btn variant="secondary" size="sm" onClick={() => setShowGlobalNoteModal(true)}>Add Employee Note</Btn>
          </SectionHeader>
          <Card style={{ padding: 16, marginBottom: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
              <Inp
                label="Employee"
                type="select"
                value={noteFilterEmployeeId}
                onChange={setNoteFilterEmployeeId}
                options={[{ value: "", label: "All employees" }, ...globalNoteEmployeeOptions]}
              />
              <Inp
                label="Source"
                type="select"
                value={noteFilterSource}
                onChange={setNoteFilterSource}
                options={[
                  { value: "all", label: "All sources" },
                  { value: "labor", label: "Employee Notes" },
                  { value: "training", label: "Training Notes" },
                ]}
              />
              <Inp
                label="Note Type"
                type="select"
                value={noteFilterType}
                onChange={setNoteFilterType}
                options={[
                  { value: "all", label: "All note types" },
                  { value: "general", label: "General" },
                  { value: "personal", label: "Personal" },
                  { value: "performance", label: "Performance" },
                  { value: "attendance", label: "Attendance" },
                  { value: "training", label: "Training" },
                  { value: "hr", label: "HR" },
                  { value: "record_note", label: "Record Notes" },
                  { value: "task_observation", label: "Task Observations" },
                ]}
              />
              <Inp
                label="Date Range"
                type="select"
                value={noteFilterDateRange}
                onChange={setNoteFilterDateRange}
                options={[
                  { value: "all", label: "All time" },
                  { value: "7d", label: "Last 7 days" },
                  { value: "30d", label: "Last 30 days" },
                  { value: "90d", label: "Last 90 days" },
                ]}
              />
            </div>
          </Card>

          {filteredGlobalNotes.length === 0 ? (
            <EmptyState icon="FileText" title="No notes match these filters" subtitle="Employee notes and task observations will appear here." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {filteredGlobalNotes.map((note) => (
                <Card key={note.id} style={{ padding: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{note.employeeName}</div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
                        <Badge color="default">{note.sourceModule}</Badge>
                        <Badge color="default">{String(note.noteType).replace(/_/g, " ")}</Badge>
                        <span style={{ fontSize: 11, color: C.textMut }}>{note.sourceLabel}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{note.createdByName}</div>
                      <div style={{ fontSize: 11, color: C.textMut }}>{formatTrainingTimestamp(note.createdAt)}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: C.textSec, lineHeight: 1.5 }}>{note.noteText}</div>
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                    <Btn variant="ghost" size="sm" onClick={() => openLaborEmployeeProfile(note.employeeId)}>Open Employee</Btn>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {showNewRecord && (
        <Modal title="New Training Record" onClose={() => { setShowNewRecord(false); resetNewRecordForm(); }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <CustomSelect
              value={newLaborEmployeeId}
              onChange={(value) => {
                setNewLaborEmployeeId(value);
                const employee = laborEmployees.find((entry) => entry.id === value);
                if (!employee) return;
                setNewEmployeeName(employee.full_name || "");
                setNewTargetRole(employee.position_title || "");
                setNewHireDate(employee.start_date || "");
                const match = templateOptions.find((template) =>
                  template.roleScopes.some((scope) => scope.toUpperCase() === String(employee.position_title || "").toUpperCase())
                );
                if (match) setNewTemplateId(match.value);
              }}
              options={laborEmployeeOptions}
              placeholder="Select from roster (recommended)"
            />
            <Inp label="Employee Full Name" value={newEmployeeName} onChange={setNewEmployeeName} required />
            <CustomSelect label="Target Role" value={newTargetRole} onChange={v => {
              setNewTargetRole(v);
              // Auto-select first template whose role_scopes includes the selected role
              const match = templateOptions.find(t =>
                t.roleScopes.some(rs => rs.toUpperCase() === v.toUpperCase())
              );
              if (match) setNewTemplateId(match.value);
            }} options={[
              { value: "PCT", label: "PCT (Pet Care Tech)" },
              { value: "CSR", label: "CSR (Customer Service)" },
              { value: "Supervisor", label: "Supervisor" },
            ]} />
            <CustomSelect label="Training Template" value={newTemplateId} onChange={v => setNewTemplateId(v)} options={templateOptions} />
            {newTemplateId && (() => {
              const opt = templateOptions.find(o => o.value === newTemplateId);
              const st = opt?.stats || {};
              return st.sectionCount > 0 ? (
                <div style={{ padding: "8px 12px", borderRadius: 8, background: C.priLt, fontSize: 12, color: C.pri, fontWeight: 600 }}>
                  {st.sectionCount} section{st.sectionCount !== 1 ? "s" : ""} — {st.itemCount} checklist item{st.itemCount !== 1 ? "s" : ""}
                </div>
              ) : null;
            })()}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Inp label="Start Date" type="date" value={newHireDate} onChange={setNewHireDate} />
              <Inp label="Training Start Date" type="date" value={newStartDate} onChange={setNewStartDate} />
            </div>
            <Inp label="Target End Date" type="date" value={newTargetEndDate} onChange={setNewTargetEndDate} />

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
              <Btn variant="ghost" onClick={() => { setShowNewRecord(false); resetNewRecordForm(); }}>Cancel</Btn>
              <Btn variant="primary" onClick={handleCreateRecord} disabled={creating}>{creating ? "Creating..." : "Create Record"}</Btn>
            </div>
          </div>
        </Modal>
      )}

      {laborEmployeeEditorModal}

      {showGlobalNoteModal && (
        <Modal title="Add Employee Note" onClose={() => setShowGlobalNoteModal(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <CustomSelect
              value={globalNoteEmployeeId}
              onChange={setGlobalNoteEmployeeId}
              options={globalNoteEmployeeOptions}
              placeholder="Choose employee"
            />
            <Inp
              label="Note Type"
              type="select"
              value={globalNoteType}
              onChange={setGlobalNoteType}
              options={[
                { value: "general", label: "General" },
                { value: "personal", label: "Personal" },
                { value: "performance", label: "Performance" },
                { value: "attendance", label: "Attendance" },
                { value: "training", label: "Training" },
                { value: "hr", label: "HR" },
              ]}
            />
            <Inp
              label="Note"
              type="textarea"
              rows={4}
              value={globalNoteText}
              onChange={setGlobalNoteText}
              placeholder="Add a manager-facing note for this employee"
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Btn variant="ghost" onClick={() => setShowGlobalNoteModal(false)}>Cancel</Btn>
              <Btn variant="primary" onClick={handleAddGlobalEmployeeNote} disabled={savingGlobalNote}>
                {savingGlobalNote ? "Saving..." : "Add Note"}
              </Btn>
            </div>
          </div>
        </Modal>
      )}

      {showCreateTemplateModal && (
        <Modal title="Create Template" onClose={resetCreateTemplateModal}>
          <div style={{ display: "grid", gap: 14, minWidth: 560, maxWidth: 620 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.textSec, marginBottom: 6 }}>Template Type</div>
                <CustomSelect
                  value={createTemplateKind}
                  onChange={(value) => setCreateTemplateKind(value || "training")}
                  options={[
                    { value: "training", label: "Training Template" },
                    { value: "review", label: "30 / 60 / 90 Review Template" },
                  ]}
                />
              </div>
              {createTemplateKind === "training" ? (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.textSec, marginBottom: 6 }}>Template Class</div>
                  <CustomSelect
                    value={createTemplateClass}
                    onChange={(value) => setCreateTemplateClass(value || "training_plan")}
                    options={[
                      { value: "training_plan", label: "Training Plan" },
                      { value: "written_certification", label: "Written Certification" },
                      { value: "live_evaluation", label: "Live Evaluation" },
                      { value: "competency_guide", label: "Competency Guide" },
                      { value: "master_dependency_checklist", label: "Master Dependency Checklist" },
                    ]}
                  />
                </div>
              ) : (
                <div style={{ paddingTop: 24, fontSize: 12, color: C.textMut }}>
                  Review templates open directly into the full-page 30 / 60 / 90 workflow.
                </div>
              )}
            </div>
            <Inp label="Template Name" value={createTemplateName} onChange={setCreateTemplateName} placeholder={createTemplateKind === "review" ? "Assistant Manager 30 / 60 / 90 Day Review" : "Bathing Certification"} />
            <Inp
              label="Role Scopes"
              value={createTemplateRoleScopesText}
              onChange={setCreateTemplateRoleScopesText}
              placeholder="PCT, CSR, Supervisor"
              help="Comma-separated roles. Leave blank to make the template available to all roles."
            />
            <div style={{ fontSize: 12, color: C.textMut, lineHeight: 1.5 }}>
              The template will open as a draft immediately so you can rename sections, add modules, and publish when it is ready.
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <Btn variant="ghost" onClick={resetCreateTemplateModal}>Cancel</Btn>
              <Btn variant="primary" onClick={handleCreateTemplateShell} disabled={creatingTemplate}>
                {creatingTemplate ? "Creating..." : "Create Template"}
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
