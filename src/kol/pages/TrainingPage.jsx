// K9 Operations — Training Module (Wave 1)
// Implements Training Home, Templates, Active Records, Train New Employee flow,
// and Training Record Detail with section expand/collapse and item completion.

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "../../supabaseClient";
import { C, todayStr, fmtDate, fmtDateFull, fmtPhoneInput, LC_OP_LABELS } from "../../shared/theme";
import { Btn, Modal, Card, Inp, Badge, CustomSelect } from "../../shared/ui";
import { I } from "../../shared/icons";
import { hasLeanPermission } from "../../shared/permissions";
import {
  ACTIVE_TRAINING_RECORD_STATUSES,
  COMPLETED_TRAINING_RECORD_STATUSES,
  LABOR_EMPLOYEE_ATTACHMENT_ACCEPT,
  LABOR_EMPLOYEE_ATTACHMENT_BUCKET,
  LABOR_TRAINING_REQUIREMENT_PDF_ACCEPT,
  LABOR_TRAINING_REQUIREMENT_SLUGS,
  buildEmployeeHistoryTimeline,
  buildEmployeeTrainingRequirementRows,
  buildCreateLaborEmployeeRpcArgs,
  buildCreateTrainingRecordRpcArgs,
  buildEmployeeRecordMetricCards,
  buildLaborEmployeeContactCardFile,
  buildLaborEmployeeContactCardFilename,
  buildLaborEmployeeAttachmentPath,
  buildLaborEmployeeRequirementEvidencePath,
  buildLaborDashboardMetrics,
  buildUpdateLaborEmployeeRpcArgs,
  buildUpdateTrainingRecordConfigArgs,
  buildTrainingTemplateScopeClause,
  formatLaborAttachmentFileSize,
  formatTrainingTimeRange,
  formatTrainingTimestamp,
  getLaborAttachmentPreviewKind,
  groupLaborEmployeeDocumentsByNote,
  groupLaborEmployeeNotes,
  groupTrainingNotes,
  inferLaborAttachmentMimeType,
  inferLaborTrainingRequirementEvidenceMimeType,
  isLaborEmployeeNoteDeleted,
  isLaborEmployeeDocumentDeleted,
  isLaborEmployeeActive,
  normalizeOptionalUuid,
  readLaborEmployeeContactValue,
  resolveTrainingLocationId,
  summarizeEmployeeTrainingRequirementCompliance,
  validateLaborEmployeeAttachmentFiles,
  validateLaborTrainingRequirementEvidenceFile,
} from "../trainingData";
import { getAttendanceIncidentLabel } from "../attendanceData";
import AttendanceTrackerPage from "./AttendancePage";

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
  { id: "attendance", label: "Attendance" },
  { id: "notes", label: "Notes" },
];

const INLINE_ROSTER_COMPOSER_TRANSITION_MS = 240;
const TRAINING_GRACE_PERIOD_DAYS = 14;
const REVIEW_WARNING_WINDOW_DAYS = 7;
const LABOR_ROSTER_VIEWS_SETTING_KEY = "labor_roster_views";
const DEFAULT_ROSTER_FILTERS = { employment_status: { op: "is", val: "active" } };

const LABOR_ROSTER_FILTER_FIELDS = [
  { section: "Employee Info", key: "first_name", label: "First Name", type: "text", ops: ["contains", "equals", "starts", "empty", "notEmpty"] },
  { section: "Employee Info", key: "last_name", label: "Last Name", type: "text", ops: ["contains", "equals", "starts", "empty", "notEmpty"] },
  { section: "Employee Info", key: "email", label: "Email", type: "text", ops: ["contains", "equals", "starts", "empty", "notEmpty"] },
  { section: "Employee Info", key: "phone", label: "Phone", type: "text", ops: ["contains", "equals", "empty", "notEmpty"] },
  { section: "Employment", key: "position", label: "Position", type: "text", ops: ["contains", "equals", "starts", "empty", "notEmpty"] },
  { section: "Employment", key: "employment_status", label: "Employment Status", type: "select", ops: ["is", "isNot"], options: ["active", "inactive", "all"] },
  { section: "Employment", key: "start_date", label: "Start Date", type: "date", ops: ["after", "before", "inLastDays"] },
  { section: "Compliance", key: "training", label: "Training", type: "select", ops: ["is", "isNot"], options: ["Compliant", "In Progress", "Non-Compliant"] },
  { section: "Reviews", key: "review30", label: "30-Day Due", type: "date", ops: ["after", "before", "inLastDays", "hasDate", "noDate"] },
  { section: "Reviews", key: "review60", label: "60-Day Due", type: "date", ops: ["after", "before", "inLastDays", "hasDate", "noDate"] },
  { section: "Reviews", key: "review90", label: "90-Day Due", type: "date", ops: ["after", "before", "inLastDays", "hasDate", "noDate"] },
];

function normalizePositionTitle(value = "") {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function getDefaultPositionWeight(value = "") {
  const title = normalizePositionTitle(value);
  if (!title) return -1;
  if (/(director|regional)/.test(title)) return 100;
  if (/(general manager|\bgm\b)/.test(title)) return 90;
  if (/(assistant manager|\bagm\b)/.test(title)) return 80;
  if (/manager/.test(title)) return 70;
  if (/(supervisor|lead)/.test(title)) return 60;
  if (/(customer service representative|\bcsr\b)/.test(title)) return 40;
  if (/(pet care technician|\bpct\b|technician)/.test(title)) return 30;
  return 0;
}

function formatLaborDate(value) {
  return value ? fmtDateFull(value) : "—";
}

function normalizeLaborContactEmail(value) {
  const trimmed = String(value || "").trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

function normalizeLaborContactPhone(value) {
  const digitsOnly = String(value || "").replace(/\D/g, "").slice(0, 10);
  return digitsOnly || null;
}

function readLaborEmployeeContact(employee, key) {
  return readLaborEmployeeContactValue(employee, key);
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
  const p = safeTrainingProgress(percent);
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

function normalizeEmployeeName(value = "") {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function isObjectRow(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function toObjectRows(rows = []) {
  return Array.isArray(rows) ? rows.filter(isObjectRow) : [];
}

export function getLaborEmployeeRowId(row = {}) {
  if (!isObjectRow(row)) return null;
  return row.labor_employee_id || row.employee_id || row.id || null;
}

export function getTrainingRecordEmployeeId(record = {}) {
  if (!isObjectRow(record)) return null;
  return record.labor_employee_id || record.employee_id || null;
}

function downloadTextFile(filename, content, mimeType = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mimeType });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}

export function isTrainingRecordForEmployee(record = {}, employee = {}) {
  const employeeId = getLaborEmployeeRowId(employee);
  const recordEmployeeId = getTrainingRecordEmployeeId(record);
  if (employeeId && recordEmployeeId) return employeeId === recordEmployeeId;

  const employeeName = normalizeEmployeeName(employee.full_name);
  const recordName = normalizeEmployeeName(record.employee_full_name);
  return Boolean(employeeName && recordName && employeeName === recordName);
}

export function safeTrainingProgress(value) {
  const percent = Number(value);
  if (!Number.isFinite(percent)) return 0;
  return Math.min(100, Math.max(0, percent));
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

function addDaysToDateString(dateValue, days) {
  if (!dateValue || !Number.isFinite(Number(days))) return "";
  const date = new Date(`${dateValue}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() + Number(days));
  return date.toISOString().slice(0, 10);
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
    return { label: formatLaborDate(dueDate), tone: C.suc, background: C.sucLt };
  }
  if (diffDays < 0) {
    return { label: formatLaborDate(dueDate), tone: C.dan, background: C.danLt };
  }
  if (diffDays <= REVIEW_WARNING_WINDOW_DAYS) {
    return { label: formatLaborDate(dueDate), tone: C.warn, background: C.warnLt };
  }

  return { label: formatLaborDate(dueDate), tone: C.suc, background: C.sucLt };
}

export function noteMatchesSearch(note = {}, query = "") {
  const cleanQuery = String(query || "").trim().toLowerCase();
  if (!cleanQuery) return true;
  const searchableText = [
    note.noteText,
    note.note_text,
    note.noteType,
    note.note_type,
    note.employeeName,
    note.employee_name,
    note.sourceLabel,
    note.source_label,
    note.sourceModule,
    note.source_module,
    note.createdByName,
    note.created_by_name,
    note.createdAt,
    note.created_at,
  ]
    .filter((value) => value != null)
    .join(" ")
    .toLowerCase();
  return searchableText.includes(cleanQuery);
}

export function applyLaborRosterFilters(rows, filters) {
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
      const explicitStatus = String(row.employment_status || "").toLowerCase();
      const status = explicitStatus || (row.is_active === false ? "inactive" : "active");
      if (val === "all") return true;
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

export default function TrainingPage({ data, save, nav, profile, addGlobalToast, locationName }) {
  const [tab, setTab] = useState("home");
  const [loading, setLoading] = useState(true);
  const [trainingBundleLoaded, setTrainingBundleLoaded] = useState(false);
  const [trainingBundleLoading, setTrainingBundleLoading] = useState(false);
  const [supportBundleLoaded, setSupportBundleLoaded] = useState(false);
  const [supportBundleLoading, setSupportBundleLoading] = useState(false);
  const [attendanceView, setAttendanceView] = useState("input");

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
  const [laborEmployeeHistoryEvents, setLaborEmployeeHistoryEvents] = useState([]);
  const [laborAttendanceIncidents, setLaborAttendanceIncidents] = useState([]);
  const [reviewInstances, setReviewInstances] = useState([]);
  const [reviewResponses, setReviewResponses] = useState([]);
  const [employeeCertifications, setEmployeeCertifications] = useState([]);
  const [certificationRequirements, setCertificationRequirements] = useState([]);
  const [allTrainingNotes, setAllTrainingNotes] = useState([]);
  const [allTrainingEvents, setAllTrainingEvents] = useState([]);
  const [serverDashboardMetrics, setServerDashboardMetrics] = useState(null);
  const [resolvedLaborLocationId, setResolvedLaborLocationId] = useState("");
  const [positionHierarchy, setPositionHierarchy] = useState([]);
  const [hierarchyPersistenceAvailable, setHierarchyPersistenceAvailable] = useState(true);

  // UI state
  const [showNewRecord, setShowNewRecord] = useState(false);
  const [showRecordConfig, setShowRecordConfig] = useState(false);
  const [selectedRecordId, setSelectedRecordId] = useState(null);
  const [selectedLaborEmployeeId, setSelectedLaborEmployeeId] = useState(null);
  const [selectedLaborEmployeeSeed, setSelectedLaborEmployeeSeed] = useState(null);
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
  const [templateStatusFilter, setTemplateStatusFilter] = useState("active");
  const [templateManageStructure, setTemplateManageStructure] = useState(false);

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
  const [employeeRecordTab, setEmployeeRecordTab] = useState("training");
  const [employeeNoteText, setEmployeeNoteText] = useState("");
  const [employeeNoteType, setEmployeeNoteType] = useState("general");
  const [employeeNoteSearchText, setEmployeeNoteSearchText] = useState("");
  const [employeeNoteFiles, setEmployeeNoteFiles] = useState([]);
  const [employeeNoteFileErrors, setEmployeeNoteFileErrors] = useState([]);
  const [savingEmployeeNote, setSavingEmployeeNote] = useState(false);
  const employeeNoteFileInputRef = useRef(null);
  const [attachmentPreview, setAttachmentPreview] = useState(null);
  const [previewingAttachmentId, setPreviewingAttachmentId] = useState(null);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState(null);
  const [deletingEmployeeNoteId, setDeletingEmployeeNoteId] = useState(null);
  const [trainingRequirementEditor, setTrainingRequirementEditor] = useState(null);
  const [trainingRequirementCompletedOn, setTrainingRequirementCompletedOn] = useState("");
  const [trainingRequirementExpiresOn, setTrainingRequirementExpiresOn] = useState("");
  const [trainingRequirementDocumentUrl, setTrainingRequirementDocumentUrl] = useState("");
  const [trainingRequirementSourceNote, setTrainingRequirementSourceNote] = useState("");
  const [trainingRequirementEvidenceFile, setTrainingRequirementEvidenceFile] = useState(null);
  const [trainingRequirementEvidenceError, setTrainingRequirementEvidenceError] = useState("");
  const [savingTrainingRequirement, setSavingTrainingRequirement] = useState(false);
  const trainingRequirementFileInputRef = useRef(null);
  const [reviewDrafts, setReviewDrafts] = useState({});
  const [savingReviewItemId, setSavingReviewItemId] = useState(null);
  const [completingReview, setCompletingReview] = useState(false);
  const [showGlobalNoteModal, setShowGlobalNoteModal] = useState(false);
  const [globalNoteEmployeeId, setGlobalNoteEmployeeId] = useState("");
  const [globalNoteType, setGlobalNoteType] = useState("general");
  const [globalNoteText, setGlobalNoteText] = useState("");
  const [savingGlobalNote, setSavingGlobalNote] = useState(false);
  const [contactCardDownloadKey, setContactCardDownloadKey] = useState("");
  const [noteFilterEmployeeId, setNoteFilterEmployeeId] = useState("");
  const [noteFilterSource, setNoteFilterSource] = useState("all");
  const [noteFilterType, setNoteFilterType] = useState("all");
  const [noteFilterDateRange, setNoteFilterDateRange] = useState("all");
  const [noteSearchText, setNoteSearchText] = useState("");
  const [rosterSort, setRosterSort] = useState({ key: "hierarchy", direction: "asc" });
  const [showHierarchyManager, setShowHierarchyManager] = useState(false);
  const [savingHierarchy, setSavingHierarchy] = useState(false);
  const [hierarchyDraft, setHierarchyDraft] = useState([]);
  const [draggingHierarchyTitle, setDraggingHierarchyTitle] = useState("");
  const [rosterFilters, setRosterFilters] = useState(DEFAULT_ROSTER_FILTERS);
  const [rosterDraftFilters, setRosterDraftFilters] = useState(DEFAULT_ROSTER_FILTERS);
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
  const laborContactLocationName = String(locationName || data?.locationName || profile?.location_name || "K9 Operations").trim();
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

  const loadCoreData = useCallback(async () => {
    setLoading(true);
    setTrainingBundleLoaded(false);
    setTrainingBundleLoading(false);
    setSupportBundleLoaded(false);
    setSupportBundleLoading(false);
    setTemplates([]);
    setTemplateVersions([]);
    setAllTemplateVersions([]);
    setReviewTemplates([]);
    setReviewTemplateVersions([]);
    setAllReviewTemplateVersions([]);
    setSections([]);
    setItems([]);
    setReviewSections([]);
    setReviewItems([]);
    setLaborEmployeeNotes([]);
    setLaborEmployeeDocuments([]);
    setLaborAttendanceIncidents([]);
    setReviewInstances([]);
    setReviewResponses([]);
    setEmployeeCertifications([]);
    setAllTrainingNotes([]);
    try {
      const resolvedLocationId = await resolveTrainingLocationId(supabase, locationRef, actorUserId);
      if (!resolvedLocationId) {
        setResolvedLaborLocationId("");
        setRecords([]);
        setLaborEmployees([]);
        setRosterSnapshot([]);
        setServerDashboardMetrics(null);
        setPositionHierarchy([]);
        setHierarchyPersistenceAvailable(true);
        setLoading(false);
        return {
          resolvedLocationId: "",
          records: [],
          laborEmployees: [],
          rosterSnapshot: [],
          positionHierarchy: [],
        };
      }
      setResolvedLaborLocationId(resolvedLocationId);

      const [recordRes, employeeRes] = await Promise.all([
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

      if (recordRes.error) throw recordRes.error;
      if (employeeRes.error) throw employeeRes.error;

      let hierarchyRows = [];
      const hierarchyRes = await supabase
        .from("labor_position_hierarchy")
        .select("*")
        .eq("location_id", resolvedLocationId)
        .order("sort_order", { ascending: true });

      if (hierarchyRes.error) {
        const missingHierarchyTable = hierarchyRes.error.code === "PGRST205"
          || hierarchyRes.error.code === "42P01"
          || /labor_position_hierarchy/i.test(hierarchyRes.error.message || "");
        if (!missingHierarchyTable) throw hierarchyRes.error;
        setHierarchyPersistenceAvailable(false);
      } else {
        hierarchyRows = hierarchyRes.data || [];
        setHierarchyPersistenceAvailable(true);
      }

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

      const nextRecords = recordRes.data || [];
      const nextLaborEmployees = employeeRes.data || [];
      const nextHierarchy = hierarchyRows;

      setRecords(nextRecords);
      setLaborEmployees(nextLaborEmployees);
      setRosterSnapshot(rosterRows);
      setServerDashboardMetrics(metricsFromServer);
      setPositionHierarchy(nextHierarchy);
      setLoading(false);
      return {
        resolvedLocationId,
        records: nextRecords,
        laborEmployees: nextLaborEmployees,
        rosterSnapshot: rosterRows,
        positionHierarchy: nextHierarchy,
      };
    } catch (err) {
      console.error("Labor core load error:", err);
      addGlobalToast("Failed to load labor data", "error");
    }
    setLoading(false);
    return null;
  }, [actorUserId, addGlobalToast, locationRef]);

  const loadTrainingBundle = useCallback(async (force = false, locationOverride = null) => {
    const locationIdForBundle = locationOverride || resolvedLaborLocationId;
    if (!locationIdForBundle || (!force && (trainingBundleLoaded || trainingBundleLoading))) return;
    setTrainingBundleLoading(true);
    try {
      const [templateRes, reviewTemplateRes] = await Promise.all([
        supabase
          .from("training_templates")
          .select("*")
          .or(buildTrainingTemplateScopeClause(locationIdForBundle))
          .order("name"),
        supabase
          .from("review_templates")
          .select("*")
          .or(buildTrainingTemplateScopeClause(locationIdForBundle))
          .order("name"),
      ]);

      if (templateRes.error) throw templateRes.error;
      if (reviewTemplateRes.error) throw reviewTemplateRes.error;

      const templateRows = templateRes.data || [];
      const reviewTemplateRows = reviewTemplateRes.data || [];

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
      const allReviewVersionRows = reviewVersionRes.data || [];

      const [sectionRes, itemRes, reviewSectionRes, reviewItemRes] = await Promise.all([
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

      setTemplates(templateRows);
      setTemplateVersions(allVersionRows.filter((version) => version.is_current && version.status === "published"));
      setAllTemplateVersions(allVersionRows);
      setReviewTemplates(reviewTemplateRows);
      setReviewTemplateVersions(allReviewVersionRows.filter((version) => version.is_current && version.status === "published"));
      setAllReviewTemplateVersions(allReviewVersionRows);
      setSections(sectionRes.data || []);
      setItems(itemRes.data || []);
      setReviewSections(reviewSectionRes.data || []);
      setReviewItems(reviewItemRes.data || []);
      setTrainingBundleLoaded(true);
    } catch (err) {
      console.error("Labor training bundle load error:", err);
      addGlobalToast("Failed to load training data", "error");
    }
    setTrainingBundleLoading(false);
  }, [addGlobalToast, resolvedLaborLocationId, trainingBundleLoaded, trainingBundleLoading]);

  const loadSupportBundle = useCallback(async (force = false, seedData = null) => {
    const locationIdForBundle = seedData?.resolvedLocationId || resolvedLaborLocationId;
    if (!locationIdForBundle || (!force && (supportBundleLoaded || supportBundleLoading))) return;
    setSupportBundleLoading(true);
    try {
      const employeeSource = Array.isArray(seedData?.laborEmployees) ? seedData.laborEmployees : laborEmployees;
      const recordSource = Array.isArray(seedData?.records) ? seedData.records : records;
      const employeeIds = toObjectRows(employeeSource).map(getLaborEmployeeRowId).filter(Boolean);
      const recordIds = toObjectRows(recordSource).map((record) => record.id).filter(Boolean);

      const [noteRes, documentRes, historyEventRes, attendanceIncidentRes, reviewInstanceRes, certificationRes, requirementRes] = await Promise.all([
        employeeIds.length > 0
          ? supabase.from("labor_employee_notes").select("*").in("labor_employee_id", employeeIds).order("created_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        employeeIds.length > 0
          ? supabase.from("labor_employee_documents").select("*").in("labor_employee_id", employeeIds).order("uploaded_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        employeeIds.length > 0
          ? supabase.from("labor_employee_history_events").select("*").in("labor_employee_id", employeeIds).order("occurred_at", { ascending: false })
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
        supabase
          .from("certification_requirements")
          .select("*")
          .in("slug", Object.values(LABOR_TRAINING_REQUIREMENT_SLUGS))
          .order("name", { ascending: true }),
      ]);

      if (noteRes.error) throw noteRes.error;
      if (documentRes.error) throw documentRes.error;
      if (historyEventRes.error) throw historyEventRes.error;
      if (attendanceIncidentRes.error) throw attendanceIncidentRes.error;
      if (reviewInstanceRes.error) throw reviewInstanceRes.error;
      if (certificationRes.error) throw certificationRes.error;
      if (requirementRes.error) throw requirementRes.error;

      const reviewInstanceIds = (reviewInstanceRes.data || []).map((instance) => instance.id);
      const [responseRes, trainingNoteRes, trainingEventRes] = await Promise.all([
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
        recordIds.length > 0
          ? supabase
              .from("training_record_events")
              .select("*")
              .in("record_id", recordIds)
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (responseRes.error) throw responseRes.error;
      if (trainingNoteRes.error) throw trainingNoteRes.error;
      if (trainingEventRes.error) throw trainingEventRes.error;

      setLaborEmployeeNotes(noteRes.data || []);
      setLaborEmployeeDocuments(documentRes.data || []);
      setLaborEmployeeHistoryEvents(historyEventRes.data || []);
      setLaborAttendanceIncidents(attendanceIncidentRes.data || []);
      setReviewInstances(reviewInstanceRes.data || []);
      setReviewResponses(responseRes.data || []);
      setEmployeeCertifications(certificationRes.data || []);
      setCertificationRequirements(requirementRes.data || []);
      setAllTrainingNotes(trainingNoteRes.data || []);
      setAllTrainingEvents(trainingEventRes.data || []);
      setSupportBundleLoaded(true);
    } catch (err) {
      console.error("Labor support bundle load error:", err);
      addGlobalToast("Failed to load labor notes and reviews", "error");
    }
    setSupportBundleLoading(false);
  }, [addGlobalToast, laborEmployees, records, resolvedLaborLocationId, supportBundleLoaded, supportBundleLoading]);

  const refreshLaborData = useCallback(async ({ includeTraining = true, includeSupport = true } = {}) => {
    const coreData = await loadCoreData();
    if (includeTraining) {
      await loadTrainingBundle(true, coreData?.resolvedLocationId || null);
    }
    if (includeSupport) {
      await loadSupportBundle(true, coreData);
    }
  }, [loadCoreData, loadSupportBundle, loadTrainingBundle]);
  const refreshTemplateBundle = useCallback(async () => {
    await loadTrainingBundle(true, laborLocationRef || null);
  }, [laborLocationRef, loadTrainingBundle]);

  useEffect(() => { loadCoreData(); }, [loadCoreData]);

  useEffect(() => {
    if (tab === "training" || tab === "templates" || showNewRecord || !!selectedRecordId || !!previewTemplateId || !!selectedReviewInstanceId) {
      loadTrainingBundle();
    }
  }, [loadTrainingBundle, previewTemplateId, selectedRecordId, selectedReviewInstanceId, showNewRecord, tab]);

  useEffect(() => {
    if (tab === "home" || tab === "notes" || !!selectedLaborEmployeeId || !!selectedReviewInstanceId) {
      loadSupportBundle();
    }
  }, [loadSupportBundle, selectedLaborEmployeeId, selectedReviewInstanceId, tab]);

  useEffect(() => {
    setEmployeeRecordTab("training");
    setEmployeeNoteText("");
    setEmployeeNoteType("general");
    setEmployeeNoteSearchText("");
    setEmployeeNoteFiles([]);
    setEmployeeNoteFileErrors([]);
    setAttachmentPreview(null);
    if (employeeNoteFileInputRef.current) employeeNoteFileInputRef.current.value = "";
  }, [selectedLaborEmployeeId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [tab]);

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
  const activeRecords = useMemo(() => toObjectRows(records).filter((record) => ACTIVE_TRAINING_RECORD_STATUSES.includes(record.overall_status)), [records]);
  const completedRecords = useMemo(() => toObjectRows(records).filter((record) => COMPLETED_TRAINING_RECORD_STATUSES.includes(record.overall_status)), [records]);
  const activeTemplates = useMemo(() => toObjectRows(templates).filter((template) => template.is_active), [templates]);
  const activeLaborEmployees = useMemo(() => toObjectRows(rosterSnapshot).filter((row) => isLaborEmployeeActive(row)), [rosterSnapshot]);
  const laborNotesByEmployee = useMemo(() => groupLaborEmployeeNotes(toObjectRows(laborEmployeeNotes)), [laborEmployeeNotes]);
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

  const selectedRecord = useMemo(() => toObjectRows(records).find((record) => record.id === selectedRecordId) || null, [records, selectedRecordId]);
  const selectedRecordEmployeeId = useMemo(() => {
    if (!selectedRecord) return null;
    return selectedRecord.labor_employee_id || selectedRecord.employee_id || null;
  }, [selectedRecord]);
  const selectedLaborEmployee = useMemo(() => {
    const employeeRows = toObjectRows(laborEmployees);
    const employeeId = selectedLaborEmployeeId || selectedRecordEmployeeId;
    if (employeeId) {
      const directMatch = employeeRows.find((employee) => employee.id === employeeId);
      if (directMatch) return directMatch;
    }
    const recordName = normalizeEmployeeName(selectedRecord?.employee_full_name);
    if (!recordName) return null;
    return employeeRows.find((employee) => normalizeEmployeeName(employee.full_name) === recordName) || null;
  }, [laborEmployees, selectedLaborEmployeeId, selectedRecord, selectedRecordEmployeeId]);
  const selectedLaborEmployeeSnapshot = useMemo(() => {
    const snapshotRows = toObjectRows(rosterSnapshot);
    const employeeId = selectedLaborEmployeeId || selectedLaborEmployee?.id || selectedRecordEmployeeId || getLaborEmployeeRowId(selectedLaborEmployeeSeed);
    if (employeeId) {
      const directMatch = snapshotRows.find((row) => getLaborEmployeeRowId(row) === employeeId);
      if (directMatch) return directMatch;
    }
    if (isObjectRow(selectedLaborEmployeeSeed)) return selectedLaborEmployeeSeed;
    const recordName = normalizeEmployeeName(selectedRecord?.employee_full_name);
    if (!recordName) return null;
    return snapshotRows.find((row) => normalizeEmployeeName(row.full_name) === recordName) || null;
  }, [rosterSnapshot, selectedLaborEmployee?.id, selectedLaborEmployeeId, selectedLaborEmployeeSeed, selectedRecord, selectedRecordEmployeeId]);
  const selectedLaborEmployeeView = useMemo(() => {
    if (!selectedLaborEmployee && !selectedLaborEmployeeSnapshot && !selectedLaborEmployeeSeed) return null;
    const employeeId = selectedLaborEmployee?.id
      || getLaborEmployeeRowId(selectedLaborEmployeeSnapshot)
      || getLaborEmployeeRowId(selectedLaborEmployeeSeed)
      || selectedLaborEmployeeId
      || selectedRecordEmployeeId
      || null;
    const employeeMetadata = isObjectRow(selectedLaborEmployee?.metadata) ? selectedLaborEmployee.metadata : {};
    return {
      ...(selectedLaborEmployeeSeed || {}),
      ...(selectedLaborEmployeeSnapshot || {}),
      ...(selectedLaborEmployee || {}),
      id: employeeId,
      labor_employee_id: employeeId,
      full_name: selectedLaborEmployee?.full_name || selectedLaborEmployeeSnapshot?.full_name || selectedLaborEmployeeSeed?.full_name || selectedRecord?.employee_full_name || "",
      position_title: selectedLaborEmployee?.position_title || selectedLaborEmployeeSnapshot?.position_title || selectedLaborEmployeeSeed?.position_title || "",
      start_date: selectedLaborEmployee?.start_date || selectedLaborEmployeeSnapshot?.start_date || selectedLaborEmployeeSeed?.start_date || null,
      end_date: selectedLaborEmployee?.end_date || selectedLaborEmployeeSnapshot?.end_date || selectedLaborEmployeeSeed?.end_date || null,
      contact_email: selectedLaborEmployeeSnapshot?.contact_email || selectedLaborEmployeeSeed?.contact_email || "",
      contact_phone: selectedLaborEmployeeSnapshot?.contact_phone || selectedLaborEmployeeSeed?.contact_phone || "",
      metadata: employeeMetadata,
    };
  }, [selectedLaborEmployee, selectedLaborEmployeeId, selectedLaborEmployeeSeed, selectedLaborEmployeeSnapshot, selectedRecord, selectedRecordEmployeeId]);
  const hasSelectedLaborEmployee = Boolean(selectedLaborEmployeeId || selectedLaborEmployeeSeed);
  const laborEmployeeMap = useMemo(() => Object.fromEntries(toObjectRows(laborEmployees).map((employee) => [employee.id, employee])), [laborEmployees]);
  const recordMap = useMemo(() => Object.fromEntries(toObjectRows(records).map((record) => [record.id, record])), [records]);
  const trainingItemMap = useMemo(() => Object.fromEntries(toObjectRows(items).map((item) => [item.id, item])), [items]);
  const activeEmployeeDocumentsByNote = useMemo(() => groupLaborEmployeeDocumentsByNote(laborEmployeeDocuments), [laborEmployeeDocuments]);
  const selectedVersion = useMemo(() => {
    if (!selectedRecord) return null;
    return toObjectRows(templateVersions).find((version) => version.id === selectedRecord.template_version_id) || null;
  }, [selectedRecord, templateVersions]);
  const groupedNotes = useMemo(() => groupTrainingNotes(notes), [notes]);
  const selectedEmployeeAllNotes = useMemo(() => {
    if (!selectedLaborEmployeeView?.id) return [];
    return toObjectRows(laborEmployeeNotes).filter((note) => note.labor_employee_id === selectedLaborEmployeeView.id);
  }, [laborEmployeeNotes, selectedLaborEmployeeView]);
  const selectedEmployeeNotes = useMemo(() => {
    if (!selectedLaborEmployeeView?.id) return [];
    return toObjectRows(laborNotesByEmployee[selectedLaborEmployeeView.id] || []);
  }, [laborNotesByEmployee, selectedLaborEmployeeView]);
  const filteredSelectedEmployeeNotes = useMemo(() => {
    return selectedEmployeeNotes.filter((note) => noteMatchesSearch(note, employeeNoteSearchText));
  }, [employeeNoteSearchText, selectedEmployeeNotes]);
  const selectedEmployeeDocuments = useMemo(() => {
    if (!selectedLaborEmployeeView?.id) return [];
    return toObjectRows(laborEmployeeDocuments).filter((document) => document.labor_employee_id === selectedLaborEmployeeView.id);
  }, [laborEmployeeDocuments, selectedLaborEmployeeView]);
  const selectedEmployeeDocumentsByNote = useMemo(() => {
    return groupLaborEmployeeDocumentsByNote(selectedEmployeeDocuments);
  }, [selectedEmployeeDocuments]);
  const selectedEmployeeUnlinkedDocuments = useMemo(() => {
    return toObjectRows(selectedEmployeeDocumentsByNote.__unlinked__ || []);
  }, [selectedEmployeeDocumentsByNote]);
  const selectedEmployeeReviewInstances = useMemo(() => {
    if (!selectedLaborEmployeeView?.id) return [];
    return toObjectRows(reviewInstances).filter((instance) => instance.labor_employee_id === selectedLaborEmployeeView.id);
  }, [reviewInstances, selectedLaborEmployeeView]);
  const selectedEmployeeCertifications = useMemo(() => {
    if (!selectedLaborEmployeeView?.id) return [];
    return toObjectRows(employeeCertifications).filter((row) => row.labor_employee_id === selectedLaborEmployeeView.id);
  }, [employeeCertifications, selectedLaborEmployeeView]);
  const employeeCertificationsByEmployee = useMemo(() => {
    return toObjectRows(employeeCertifications).reduce((acc, certification) => {
      if (!certification?.labor_employee_id) return acc;
      if (!acc[certification.labor_employee_id]) acc[certification.labor_employee_id] = [];
      acc[certification.labor_employee_id].push(certification);
      return acc;
    }, {});
  }, [employeeCertifications]);
  const laborEmployeeDocumentsByEmployee = useMemo(() => {
    return toObjectRows(laborEmployeeDocuments).reduce((acc, document) => {
      if (!document?.labor_employee_id) return acc;
      if (!acc[document.labor_employee_id]) acc[document.labor_employee_id] = [];
      acc[document.labor_employee_id].push(document);
      return acc;
    }, {});
  }, [laborEmployeeDocuments]);
  const selectedEmployeeTrainingRequirementRows = useMemo(() => {
    if (!selectedLaborEmployeeView?.id) return [];
    return buildEmployeeTrainingRequirementRows({
      employee: selectedLaborEmployeeView,
      certifications: selectedEmployeeCertifications,
      requirements: certificationRequirements,
      documents: selectedEmployeeDocuments,
    });
  }, [certificationRequirements, selectedEmployeeCertifications, selectedEmployeeDocuments, selectedLaborEmployeeView]);
  const selectedEmployeeTrainingRequirementSummary = useMemo(() => {
    return summarizeEmployeeTrainingRequirementCompliance(selectedEmployeeTrainingRequirementRows);
  }, [selectedEmployeeTrainingRequirementRows]);
  const selectedEmployeeAttendanceIncidents30d = useMemo(() => {
    if (!selectedLaborEmployeeView?.id) return [];
    const now = Date.now();
    return toObjectRows(laborAttendanceIncidents).filter((incident) => {
      if (incident.labor_employee_id !== selectedLaborEmployeeView.id) return false;
      const incidentDate = incident?.incident_date ? new Date(`${incident.incident_date}T12:00:00`).getTime() : NaN;
      return Number.isFinite(incidentDate) && now - incidentDate <= 30 * 24 * 60 * 60 * 1000;
    });
  }, [laborAttendanceIncidents, selectedLaborEmployeeView]);
  const selectedEmployeeHistoryEvents = useMemo(() => {
    if (!selectedLaborEmployeeView?.id) return [];
    return toObjectRows(laborEmployeeHistoryEvents).filter((event) => event.labor_employee_id === selectedLaborEmployeeView.id);
  }, [laborEmployeeHistoryEvents, selectedLaborEmployeeView]);
  const selectedEmployeeTrainingRecordIds = useMemo(() => {
    if (!selectedLaborEmployeeView?.id) return new Set();
    const selectedName = normalizeEmployeeName(selectedLaborEmployeeView.full_name);
    return new Set(toObjectRows(records)
      .filter((record) => (
        record.labor_employee_id === selectedLaborEmployeeView.id
        || (selectedName && normalizeEmployeeName(record.employee_full_name) === selectedName)
      ))
      .map((record) => record.id)
      .filter(Boolean));
  }, [records, selectedLaborEmployeeView]);
  const selectedEmployeeTrainingEvents = useMemo(() => {
    if (selectedEmployeeTrainingRecordIds.size === 0) return [];
    return toObjectRows(allTrainingEvents).filter((event) => selectedEmployeeTrainingRecordIds.has(event.record_id));
  }, [allTrainingEvents, selectedEmployeeTrainingRecordIds]);
  const selectedEmployeeHistoryTimeline = useMemo(() => {
    if (!selectedLaborEmployeeView?.id) return [];
    return buildEmployeeHistoryTimeline({
      historyEvents: selectedEmployeeHistoryEvents,
      notes: selectedEmployeeAllNotes,
      documents: selectedEmployeeDocuments,
      attendanceIncidents: toObjectRows(laborAttendanceIncidents).filter((incident) => incident.labor_employee_id === selectedLaborEmployeeView.id),
      trainingEvents: selectedEmployeeTrainingEvents,
      trainingRecordMap: recordMap,
      trainingItemMap,
    });
  }, [
    laborAttendanceIncidents,
    recordMap,
    selectedEmployeeAllNotes,
    selectedEmployeeDocuments,
    selectedEmployeeHistoryEvents,
    selectedEmployeeTrainingEvents,
    selectedLaborEmployeeView,
    trainingItemMap,
  ]);
  const selectedReviewInstance = useMemo(() => {
    if (!selectedReviewInstanceId) return null;
    return toObjectRows(reviewInstances).find((instance) => instance.id === selectedReviewInstanceId) || null;
  }, [reviewInstances, selectedReviewInstanceId]);
  const selectedReviewTemplateVersion = useMemo(() => {
    if (!selectedReviewInstance?.template_version_id) return null;
    return toObjectRows(allReviewTemplateVersions).find((version) => version.id === selectedReviewInstance.template_version_id) || null;
  }, [allReviewTemplateVersions, selectedReviewInstance]);
  const selectedReviewTemplate = useMemo(() => {
    if (!selectedReviewInstance?.template_id) return null;
    return toObjectRows(reviewTemplates).find((template) => template.id === selectedReviewInstance.template_id) || null;
  }, [reviewTemplates, selectedReviewInstance]);
  const selectedReviewSections = useMemo(() => {
    if (!selectedReviewTemplateVersion?.id) return [];
    return toObjectRows(reviewSections)
      .filter((section) => section.template_version_id === selectedReviewTemplateVersion.id)
      .sort((a, b) => a.sequence_order - b.sequence_order)
      .map((section) => ({
        ...section,
        items: reviewItems
          .filter((item) => isObjectRow(item) && item.review_section_id === section.id)
          .sort((a, b) => a.sequence_order - b.sequence_order),
      }));
  }, [reviewItems, reviewSections, selectedReviewTemplateVersion]);

  const recordSections = useMemo(() => {
    if (!selectedRecord) return [];
    return toObjectRows(sections).filter((section) => section.template_version_id === selectedRecord.template_version_id && !section.parent_section_id).sort((a, b) => a.sequence_order - b.sequence_order);
  }, [selectedRecord, sections]);

  const getChildSections = useCallback((parentId) => {
    return toObjectRows(sections).filter((section) => section.parent_section_id === parentId).sort((a, b) => a.sequence_order - b.sequence_order);
  }, [sections]);

  const getSectionItems = useCallback((sectionId) => {
    return toObjectRows(items).filter((item) => item.template_section_id === sectionId).sort((a, b) => a.sequence_order - b.sequence_order);
  }, [items]);

  const getItemResult = useCallback((itemId) => {
    return toObjectRows(itemResults).find((result) => result.template_item_id === itemId) || null;
  }, [itemResults]);

  const getItemById = useCallback((itemId) => toObjectRows(items).find((item) => item.id === itemId) || null, [items]);
  const getSectionById = useCallback((sectionId) => toObjectRows(sections).find((section) => section.id === sectionId) || null, [sections]);
  const getItemNotes = useCallback((itemId) => groupedNotes.itemNotes[itemId] || [], [groupedNotes.itemNotes]);

  const laborEmployeeOptions = useMemo(() => {
    const suggestedRoster = toObjectRows(rosterSnapshot)
      .filter((row) => isLaborEmployeeActive(row) && Number(row.open_training_record_count || 0) === 0)
      .map((row) => toObjectRows(laborEmployees).find((employee) => employee.id === getLaborEmployeeRowId(row)))
      .filter(Boolean);
    const fallbackEmployees = toObjectRows(laborEmployees).filter((employee) => !suggestedRoster.some((entry) => entry.id === employee.id));
    return [...suggestedRoster, ...fallbackEmployees].map((employee) => ({
      value: employee.id,
      label: `${employee.full_name} (${employee.position_title})`,
    }));
  }, [laborEmployees, rosterSnapshot]);

  // Template stats: section and item counts per template
  const templateStats = useMemo(() => {
    const stats = {};
    toObjectRows(templates).forEach((t) => {
      const v = toObjectRows(allTemplateVersions).find((tv) => tv.template_id === t.id && tv.is_current);
      if (!v) { stats[t.id] = { sectionCount: 0, itemCount: 0 }; return; }
      const tSections = toObjectRows(sections).filter((section) => section.template_version_id === v.id && !section.parent_section_id);
      const tItems = toObjectRows(items).filter((item) => item.template_version_id === v.id);
      stats[t.id] = { sectionCount: tSections.length, itemCount: tItems.length };
    });
    return stats;
  }, [allTemplateVersions, templates, sections, items]);

  const reviewTemplateStats = useMemo(() => {
    const stats = {};
    toObjectRows(reviewTemplates).forEach((template) => {
      const version = toObjectRows(allReviewTemplateVersions).find((row) => row.template_id === template.id && row.is_current);
      if (!version) {
        stats[template.id] = { sectionCount: 0, itemCount: 0 };
        return;
      }
      stats[template.id] = {
        sectionCount: toObjectRows(reviewSections).filter((section) => section.template_version_id === version.id).length,
        itemCount: toObjectRows(reviewItems).filter((item) => item.template_version_id === version.id).length,
      };
    });
    return stats;
  }, [allReviewTemplateVersions, reviewItems, reviewSections, reviewTemplates]);

  const combinedTemplateRows = useMemo(() => {
    const trainingRows = toObjectRows(templates).map((template) => ({
      id: template.id,
      kind: "training",
      slug: template.slug,
      name: template.name,
      role_scopes: Array.isArray(template.role_scopes) ? template.role_scopes : [],
      template_class: template.template_class,
      is_active: template.is_active !== false,
      version: toObjectRows(allTemplateVersions).find((version) => version.template_id === template.id && version.is_current) || null,
      stats: templateStats[template.id] || { sectionCount: 0, itemCount: 0 },
    }));
    const reviewRows = toObjectRows(reviewTemplates).map((template) => ({
      id: template.id,
      kind: "review",
      slug: template.slug,
      name: template.name,
      role_scopes: Array.isArray(template.role_scopes) ? template.role_scopes : [],
      template_class: "performance_review",
      is_active: template.is_active !== false,
      version: toObjectRows(allReviewTemplateVersions).find((version) => version.template_id === template.id && version.is_current) || null,
      stats: reviewTemplateStats[template.id] || { sectionCount: 0, itemCount: 0 },
    }));
    return [...trainingRows, ...reviewRows];
  }, [allReviewTemplateVersions, allTemplateVersions, reviewTemplateStats, reviewTemplates, templateStats, templates]);
  const visibleTemplateRows = useMemo(() => {
    return combinedTemplateRows.filter((row) => {
      if (templateStatusFilter === "all") return true;
      if (templateStatusFilter === "inactive") return row.is_active === false;
      return row.is_active !== false;
    });
  }, [combinedTemplateRows, templateStatusFilter]);
  const templateGroups = useMemo(() => ([
    {
      key: "onboarding",
      label: "Onboarding & Training",
      rows: visibleTemplateRows.filter((row) =>
        row.kind === "training" && ["training_plan", "competency_guide", "master_dependency_checklist"].includes(row.template_class)
      ),
    },
    {
      key: "certifications",
      label: "Certifications",
      rows: visibleTemplateRows.filter((row) =>
        row.kind === "training" && !["training_plan", "competency_guide", "master_dependency_checklist"].includes(row.template_class)
      ),
    },
    {
      key: "reviews",
      label: "30/60/90 Reviews",
      rows: visibleTemplateRows.filter((row) => row.kind === "review"),
    },
  ]), [visibleTemplateRows]);

  // Template preview data
  const previewTemplateVersionHistory = useMemo(() => {
    if (!previewTemplateId) return [];
    const versionSource = previewTemplateKind === "review" ? toObjectRows(allReviewTemplateVersions) : toObjectRows(allTemplateVersions);
    return versionSource
      .filter((version) => version.template_id === previewTemplateId)
      .sort((a, b) => b.version_no - a.version_no);
  }, [allReviewTemplateVersions, allTemplateVersions, previewTemplateId, previewTemplateKind]);

  const previewTemplate = useMemo(() => {
    if (!previewTemplateId) return null;
    if (previewTemplateKind === "review") {
      const template = toObjectRows(reviewTemplates).find((row) => row.id === previewTemplateId);
      if (!template) return null;
      const version = previewTemplateVersionId
        ? toObjectRows(allReviewTemplateVersions).find((row) => row.id === previewTemplateVersionId && row.template_id === template.id)
        : toObjectRows(allReviewTemplateVersions).find((row) => row.template_id === template.id && row.is_current);
      if (!version) return { ...template, kind: "review", version: null, sections: [] };
      const sectionData = toObjectRows(reviewSections)
        .filter((section) => section.template_version_id === version.id)
        .sort((a, b) => a.sequence_order - b.sequence_order)
        .map((section) => ({
          ...section,
          items: reviewItems
            .filter((item) => isObjectRow(item) && item.review_section_id === section.id)
            .sort((a, b) => a.sequence_order - b.sequence_order),
        }));
      return { ...template, kind: "review", version, sections: sectionData };
    }

    const template = toObjectRows(templates).find((row) => row.id === previewTemplateId);
    if (!template) return null;
    const version = previewTemplateVersionId
      ? toObjectRows(allTemplateVersions).find((row) => row.id === previewTemplateVersionId && row.template_id === template.id)
      : toObjectRows(allTemplateVersions).find((row) => row.template_id === template.id && row.is_current);
    if (!version) return { ...template, kind: "training", version: null, sections: [] };
    const templateSections = toObjectRows(sections).filter((section) => section.template_version_id === version.id && !section.parent_section_id)
      .sort((a, b) => a.sequence_order - b.sequence_order);
    const sectionData = templateSections.map((section) => {
      const childSections = toObjectRows(sections).filter((row) => row.parent_section_id === section.id)
        .sort((a, b) => a.sequence_order - b.sequence_order);
      const directItems = toObjectRows(items).filter((item) => item.template_section_id === section.id)
        .sort((a, b) => a.sequence_order - b.sequence_order);
      const childData = childSections.map((childSection) => ({
        ...childSection,
        items: toObjectRows(items).filter((item) => item.template_section_id === childSection.id)
          .sort((a, b) => a.sequence_order - b.sequence_order),
      }));
      return { ...section, children: childData, directItems };
    });
    return { ...template, kind: "training", version, sections: sectionData };
  }, [allReviewTemplateVersions, allTemplateVersions, items, previewTemplateId, previewTemplateKind, previewTemplateVersionId, reviewItems, reviewSections, reviewTemplates, sections, templates]);
  const globalNotesFeed = useMemo(() => {
    const employeeNotesFeed = toObjectRows(laborEmployeeNotes)
      .filter((note) => !isLaborEmployeeNoteDeleted(note))
      .map((note) => {
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
        documents: toObjectRows(activeEmployeeDocumentsByNote[note.id] || []),
      };
    });
    const trainingNotesFeed = toObjectRows(allTrainingNotes).map((note) => {
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
  }, [activeEmployeeDocumentsByNote, allTrainingNotes, getItemById, getSectionById, laborEmployeeMap, laborEmployeeNotes, recordMap]);
  const filteredGlobalNotes = useMemo(() => {
    const now = new Date();
    return globalNotesFeed.filter((note) => {
      if (!noteMatchesSearch(note, noteSearchText)) return false;
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
  }, [globalNotesFeed, noteFilterDateRange, noteFilterEmployeeId, noteFilterSource, noteFilterType, noteSearchText]);

  // Role-filtered template options for new record
  const templateOptions = useMemo(() => {
    return activeTemplates
      .filter((t) => t.template_class === "training_plan")
      .map((t) => {
        const v = toObjectRows(templateVersions).find((tv) => tv.template_id === t.id);
        const stats = templateStats[t.id] || {};
        const roleScopes = Array.isArray(t.role_scopes) ? t.role_scopes : [];
        return { value: t.id, label: `${t.name} (${roleScopes.join(", ")})`, versionId: v?.id, roleScopes, stats };
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

  const handleEmployeeNoteFileChange = useCallback((event) => {
    const { acceptedFiles, errors } = validateLaborEmployeeAttachmentFiles(event.target.files);
    setEmployeeNoteFiles(acceptedFiles);
    setEmployeeNoteFileErrors(errors);
    if (errors.length > 0) {
      addGlobalToast(errors[0], "error");
    }
  }, [addGlobalToast]);

  const handleRemoveEmployeeNoteFile = useCallback((fileIndex) => {
    setEmployeeNoteFiles((prev) => prev.filter((_, index) => index !== fileIndex));
    setEmployeeNoteFileErrors([]);
    if (employeeNoteFileInputRef.current) employeeNoteFileInputRef.current.value = "";
  }, []);

  const uploadEmployeeNoteAttachments = useCallback(async ({ laborEmployeeId, noteId, files }) => {
    const createdDocuments = [];
    for (const file of files) {
      const mimeType = inferLaborAttachmentMimeType(file);
      const storagePath = buildLaborEmployeeAttachmentPath({
        laborEmployeeId,
        noteId,
        fileName: file.name,
      });

      const { error: uploadError } = await supabase
        .storage
        .from(LABOR_EMPLOYEE_ATTACHMENT_BUCKET)
        .upload(storagePath, file, {
          cacheControl: "3600",
          contentType: mimeType,
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: insertedDocument, error: documentError } = await supabase
        .from("labor_employee_documents")
        .insert({
          labor_employee_id: laborEmployeeId,
          labor_employee_note_id: noteId,
          document_type: "employee_note_attachment",
          file_name: file.name || "attachment",
          storage_bucket: LABOR_EMPLOYEE_ATTACHMENT_BUCKET,
          storage_path: storagePath,
          external_url: null,
          mime_type: mimeType,
          file_size_bytes: Number(file.size || 0),
          metadata: {
            source_module: "employee_notes",
            original_file_name: file.name || "attachment",
          },
          uploaded_by_user_id: actorUserId,
          uploaded_by_name: actorName,
        })
        .select("*")
        .single();

      if (documentError) throw documentError;
      if (insertedDocument) createdDocuments.push(insertedDocument);
    }
    return createdDocuments;
  }, [actorName, actorUserId]);

  const handlePreviewEmployeeDocument = useCallback(async (document) => {
    if (!document) return;
    const previewKind = getLaborAttachmentPreviewKind(document);
    if (previewKind === "unsupported") {
      addGlobalToast("This attachment type cannot be previewed in the app", "error");
      return;
    }

    setPreviewingAttachmentId(document.id);
    try {
      let previewUrl = document.external_url || "";
      if (document.storage_path) {
        const bucket = document.storage_bucket || LABOR_EMPLOYEE_ATTACHMENT_BUCKET;
        const { data: signed, error } = await supabase
          .storage
          .from(bucket)
          .createSignedUrl(document.storage_path, 300);
        if (error) throw error;
        previewUrl = signed?.signedUrl || "";
      }

      if (!previewUrl) {
        addGlobalToast("Attachment preview is unavailable", "error");
        return;
      }

      setAttachmentPreview({
        document,
        kind: previewKind,
        url: previewUrl,
      });
    } catch (error) {
      console.error("Employee attachment preview error:", error);
      addGlobalToast("Failed to open attachment preview", "error");
    } finally {
      setPreviewingAttachmentId(null);
    }
  }, [addGlobalToast]);

  const handleDeleteEmployeeDocument = useCallback(async (document) => {
    if (!document?.id || String(document.id).startsWith("requirement-url-")) return;
    const confirmed = typeof window === "undefined"
      ? true
      : window.confirm("Remove this attachment from the active employee record? The historical upload record will stay in the audit trail.");
    if (!confirmed) return;

    setDeletingAttachmentId(document.id);
    try {
      const { error } = await supabase
        .from("labor_employee_documents")
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by_user_id: actorUserId,
          deleted_by_name: actorName,
          delete_reason: "Removed from employee record",
        })
        .eq("id", document.id)
        .is("deleted_at", null);

      if (error) throw error;

      await refreshLaborData({ includeTraining: false, includeSupport: true });
      setAttachmentPreview((current) => (current?.document?.id === document.id ? null : current));
      setTrainingRequirementEditor((current) => (
        current?.evidenceDocument?.id === document.id
          ? { ...current, evidenceDocument: null, hasEvidence: false, isComplete: false, status: current.certification?.completed_on ? "needs_evidence" : current.status }
          : current
      ));
      addGlobalToast("Attachment removed from the active record; history was retained", "success");
    } catch (error) {
      console.error("Employee attachment delete error:", error);
      addGlobalToast("Failed to remove attachment", "error");
    } finally {
      setDeletingAttachmentId(null);
    }
  }, [actorName, actorUserId, addGlobalToast, refreshLaborData]);

  const handleDeleteEmployeeNote = useCallback(async (note) => {
    if (!note?.id || isLaborEmployeeNoteDeleted(note)) return;
    const confirmed = typeof window === "undefined"
      ? true
      : window.confirm("Remove this note from the active employee record? The full note and its attachments will stay in History.");
    if (!confirmed) return;

    setDeletingEmployeeNoteId(note.id);
    try {
      const { error } = await supabase
        .from("labor_employee_notes")
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by_user_id: actorUserId,
          deleted_by_name: actorName,
          delete_reason: "Removed from employee record",
        })
        .eq("id", note.id)
        .is("deleted_at", null);

      if (error) throw error;

      await refreshLaborData({ includeTraining: false, includeSupport: true });
      addGlobalToast("Note removed from active views; history was retained", "success");
    } catch (error) {
      console.error("Employee note delete error:", error);
      addGlobalToast("Failed to remove employee note", "error");
    } finally {
      setDeletingEmployeeNoteId(null);
    }
  }, [actorName, actorUserId, addGlobalToast, refreshLaborData]);

  const renderEmployeeDocumentButton = useCallback((document) => {
    const documentId = document?.id || `${document?.file_name || "attachment"}-${document?.storage_path || document?.external_url || "preview"}`;
    const previewKind = getLaborAttachmentPreviewKind(document);
    const isPreviewable = previewKind !== "unsupported";
    const isSyntheticDocument = String(document?.id || "").startsWith("requirement-url-");
    const canDeleteDocument = Boolean(document?.id && !isSyntheticDocument && !isLaborEmployeeDocumentDeleted(document));
    return (
      <span
        key={documentId}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          maxWidth: "100%",
        }}
      >
        <button
          type="button"
          onClick={() => handlePreviewEmployeeDocument(document)}
          disabled={!isPreviewable || previewingAttachmentId === document.id}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            minWidth: 0,
            maxWidth: "100%",
            padding: "7px 10px",
            borderRadius: 8,
            border: `1px solid ${C.border}`,
            background: isPreviewable ? "#fff" : C.bg,
            color: isPreviewable ? C.text : C.textMut,
            cursor: isPreviewable ? "pointer" : "not-allowed",
            fontFamily: "inherit",
            fontSize: 10.5,
            fontWeight: 900,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          <I.Eye />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{document.file_name || "Attachment"}</span>
          {document.file_size_bytes ? <span style={{ color: C.textMut, fontWeight: 600 }}>{formatLaborAttachmentFileSize(document.file_size_bytes)}</span> : null}
        </button>
        {canDeleteDocument && (
          <button
            type="button"
            title="Remove attachment"
            aria-label={`Remove ${document.file_name || "attachment"}`}
            onClick={(event) => {
              event.stopPropagation();
              handleDeleteEmployeeDocument(document);
            }}
            disabled={deletingAttachmentId === document.id}
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              border: `1px solid ${C.border}`,
              background: deletingAttachmentId === document.id ? C.bg : "#fff",
              color: C.dan,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: deletingAttachmentId === document.id ? "wait" : "pointer",
            }}
          >
            <I.Trash />
          </button>
        )}
      </span>
    );
  }, [deletingAttachmentId, handleDeleteEmployeeDocument, handlePreviewEmployeeDocument, previewingAttachmentId]);

  const openTrainingRequirementEditor = useCallback((requirementRow) => {
    if (!requirementRow) return;
    const certification = requirementRow.certification || {};
    setTrainingRequirementEditor(requirementRow);
    setTrainingRequirementCompletedOn(certification.completed_on || todayStr());
    setTrainingRequirementExpiresOn(certification.expires_on || "");
    setTrainingRequirementDocumentUrl(certification.external_document_url || "");
    setTrainingRequirementSourceNote(certification.source_note || "");
    setTrainingRequirementEvidenceFile(null);
    setTrainingRequirementEvidenceError("");
    if (trainingRequirementFileInputRef.current) trainingRequirementFileInputRef.current.value = "";
  }, []);

  const handleTrainingRequirementEvidenceFileChange = useCallback((event) => {
    const file = event.target.files?.[0] || null;
    const { acceptedFile, error } = validateLaborTrainingRequirementEvidenceFile(file);
    setTrainingRequirementEvidenceFile(acceptedFile);
    setTrainingRequirementEvidenceError(error);
    if (error) addGlobalToast(error, "error");
  }, [addGlobalToast]);

  const uploadTrainingRequirementEvidence = useCallback(async ({ laborEmployeeId, requirementRow, file }) => {
    const mimeType = inferLaborTrainingRequirementEvidenceMimeType(file);
    const storagePath = buildLaborEmployeeRequirementEvidencePath({
      laborEmployeeId,
      requirementSlug: requirementRow.slug,
      fileName: file.name,
    });

    const { error: uploadError } = await supabase
      .storage
      .from(LABOR_EMPLOYEE_ATTACHMENT_BUCKET)
      .upload(storagePath, file, {
        cacheControl: "3600",
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { data: insertedDocument, error: documentError } = await supabase
      .from("labor_employee_documents")
      .insert({
        labor_employee_id: laborEmployeeId,
        document_type: "training_requirement_evidence",
        file_name: file.name || "training-evidence.pdf",
        storage_bucket: LABOR_EMPLOYEE_ATTACHMENT_BUCKET,
        storage_path: storagePath,
        external_url: null,
        mime_type: mimeType,
        file_size_bytes: Number(file.size || 0),
        metadata: {
          source_module: "training_requirements",
          requirement_slug: requirementRow.slug,
          requirement_id: requirementRow.requirementId,
          original_file_name: file.name || "training-evidence.pdf",
        },
        uploaded_by_user_id: actorUserId,
        uploaded_by_name: actorName,
      })
      .select("*")
      .single();

    if (documentError) throw documentError;
    return insertedDocument || null;
  }, [actorName, actorUserId]);

  const handleSaveTrainingRequirement = useCallback(async () => {
    const requirementRow = trainingRequirementEditor;
    if (!selectedLaborEmployeeView?.id || !requirementRow) return;
    if (!requirementRow.requirementId) {
      addGlobalToast("Training requirement setup needs the pending Supabase migration", "error");
      return;
    }
    if (!trainingRequirementCompletedOn) {
      addGlobalToast("Completion date is required", "error");
      return;
    }

    const existingDocumentId = requirementRow.certification?.labor_employee_document_id || requirementRow.evidenceDocument?.id || null;
    const hasEvidenceFile = Boolean(trainingRequirementEvidenceFile);
    const cprUrl = String(trainingRequirementDocumentUrl || "").trim();
    const allowsUrl = requirementRow.slug === LABOR_TRAINING_REQUIREMENT_SLUGS.CPR;
    const hasAcceptedEvidence = hasEvidenceFile || existingDocumentId || (allowsUrl && cprUrl);

    if (!hasAcceptedEvidence) {
      addGlobalToast(
        allowsUrl ? "Upload a CPR PDF or paste the certificate link" : "Upload a PDF before saving this requirement",
        "error"
      );
      return;
    }

    setSavingTrainingRequirement(true);
    try {
      let evidenceDocument = null;
      if (trainingRequirementEvidenceFile) {
        evidenceDocument = await uploadTrainingRequirementEvidence({
          laborEmployeeId: selectedLaborEmployeeView.id,
          requirementRow,
          file: trainingRequirementEvidenceFile,
        });
      }

      const documentId = evidenceDocument?.id || existingDocumentId || null;
      const resolvedExpiresOn = requirementRow.slug === LABOR_TRAINING_REQUIREMENT_SLUGS.CPR
        ? (trainingRequirementExpiresOn || addDaysToDateString(trainingRequirementCompletedOn, 365) || null)
        : null;
      const payload = {
        labor_employee_id: selectedLaborEmployeeView.id,
        requirement_id: requirementRow.requirementId,
        completed_on: trainingRequirementCompletedOn,
        expires_on: resolvedExpiresOn,
        labor_employee_document_id: documentId,
        external_document_url: allowsUrl ? (cprUrl || null) : null,
        source_note: trainingRequirementSourceNote.trim() || null,
        metadata: {
          ...(requirementRow.certification?.metadata || {}),
          requirement_slug: requirementRow.slug,
        },
        updated_by_user_id: actorUserId,
      };

      const response = requirementRow.certification?.id
        ? await supabase
            .from("employee_certifications")
            .update(payload)
            .eq("id", requirementRow.certification.id)
        : await supabase
            .from("employee_certifications")
            .insert({
              ...payload,
              created_by_user_id: actorUserId,
            });

      if (response.error) throw response.error;

      await refreshLaborData();
      setTrainingRequirementEditor(null);
      setTrainingRequirementEvidenceFile(null);
      setTrainingRequirementEvidenceError("");
      if (trainingRequirementFileInputRef.current) trainingRequirementFileInputRef.current.value = "";
      addGlobalToast(`${requirementRow.label} updated`, "success");
    } catch (error) {
      console.error("Training requirement save error:", error);
      addGlobalToast("Failed to save training requirement", "error");
    } finally {
      setSavingTrainingRequirement(false);
    }
  }, [
    actorUserId,
    addGlobalToast,
    refreshLaborData,
    selectedLaborEmployeeView,
    trainingRequirementCompletedOn,
    trainingRequirementDocumentUrl,
    trainingRequirementEditor,
    trainingRequirementEvidenceFile,
    trainingRequirementExpiresOn,
    trainingRequirementSourceNote,
    uploadTrainingRequirementEvidence,
  ]);

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
      await refreshLaborData();
      setSelectedRecordId(record.id);
      setTab("training");
    } catch (err) {
      console.error("Create record error:", err);
      addGlobalToast("Failed to create record: " + (err.message || "Unknown error"), "error");
    }
    setCreating(false);
  }, [actorName, actorUserId, addGlobalToast, laborLocationRef, newEmployeeName, newHireDate, newLaborEmployeeId, newStartDate, newTargetEndDate, newTargetRole, newTemplateId, refreshLaborData]);

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
    const result = toObjectRows(itemResults).find((row) => row.template_item_id === itemId);
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
      .update({ metadata: nextMetadata, updated_by_user_id: actorUserId })
      .eq("id", employeeId);
    return { error };
  }, [actorUserId]);

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
      const employeeBeforeUpdate = toObjectRows(laborEmployees).find((employee) => employee.id === editingLaborEmployeeId) || null;
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

    await refreshLaborData();
    setSavingLaborEmployee(false);
    setShowLaborEmployeeEditor(false);
    resetLaborEmployeeEditor();
  }, [actorName, actorUserId, addGlobalToast, editingLaborEmployeeId, laborEmployeeEmail, laborEmployeeEndDate, laborEmployeeName, laborEmployeePhone, laborEmployeeRole, laborEmployeeStartDate, laborEmployees, laborLocationRef, persistLaborEmployeeContact, resetLaborEmployeeEditor, refreshLaborData]);

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
    await refreshLaborData();
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
    refreshLaborData,
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
    setTemplateManageStructure(false);
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
    await refreshTemplateBundle();
    if (draftVersion?.id) {
      setPreviewTemplateVersionId(draftVersion.id);
    }
    addGlobalToast("Template draft created", "success");
    setSavingTemplateAction("");
  }, [actorName, actorUserId, addGlobalToast, previewTemplate, previewTemplateId, previewTemplateKind, refreshTemplateBundle]);

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
      toObjectRows(createTemplateKind === "review" ? reviewTemplates : templates)
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
    await refreshTemplateBundle();
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
    refreshTemplateBundle,
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
    await refreshTemplateBundle();
    if (publishedVersion?.id) {
      setPreviewTemplateVersionId(publishedVersion.id);
    }
    addGlobalToast("Template version published", "success");
    setSavingTemplateAction("");
  }, [actorName, actorUserId, addGlobalToast, previewTemplate, previewTemplateKind, refreshTemplateBundle]);

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
    await refreshTemplateBundle();
    if (restoredVersion?.id) {
      setPreviewTemplateVersionId(restoredVersion.id);
    }
    addGlobalToast("Historical version restored into a new draft", "success");
    setSavingTemplateAction("");
  }, [actorName, actorUserId, addGlobalToast, previewTemplate, previewTemplateId, previewTemplateKind, refreshTemplateBundle]);

  const handleUpdateTemplateName = useCallback(async (value) => {
    if (!previewTemplateId) return;
    const nextName = String(value || "").trim();
    if (!nextName) return;
    const templateSource = previewTemplateKind === "review" ? reviewTemplates : templates;
    const tableName = previewTemplateKind === "review" ? "review_templates" : "training_templates";
    const currentTemplate = toObjectRows(templateSource).find((template) => template.id === previewTemplateId);
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
    await refreshTemplateBundle();
    addGlobalToast("Template name updated", "success");
  }, [actorUserId, addGlobalToast, previewTemplateId, previewTemplateKind, reviewTemplates, templates, refreshTemplateBundle]);

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
    await refreshTemplateBundle();
    return true;
  }, [addGlobalToast, previewTemplateKind, refreshTemplateBundle]);

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
    await refreshTemplateBundle();
    return true;
  }, [addGlobalToast, previewTemplateKind, refreshTemplateBundle]);

  const handleAddTemplateSection = useCallback(async (parentSectionId = null) => {
    if (!previewTemplate?.version?.id || previewTemplate.version.status !== "draft") return;
    const sectionSource = previewTemplateKind === "review" ? toObjectRows(reviewSections) : toObjectRows(sections);
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
    await refreshTemplateBundle();
    addGlobalToast(previewTemplateKind === "review" ? "Review section added" : parentSectionId ? "Module added" : "Section added", "success");
  }, [addGlobalToast, previewTemplate, previewTemplateKind, reviewSections, sections, refreshTemplateBundle]);

  const handleAddTemplateItem = useCallback(async (sectionId) => {
    if (!previewTemplate?.version?.id || previewTemplate.version.status !== "draft") return;
    const itemSource = previewTemplateKind === "review" ? toObjectRows(reviewItems) : toObjectRows(items);
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
    await refreshTemplateBundle();
    addGlobalToast(previewTemplateKind === "review" ? "Review item added" : "Task added", "success");
  }, [addGlobalToast, items, previewTemplate, previewTemplateKind, reviewItems, refreshTemplateBundle]);

  const handleDeleteTemplateItem = useCallback(async (itemId) => {
    const { error } = await supabase
      .from(previewTemplateKind === "review" ? "review_items" : "training_template_items")
      .delete()
      .eq("id", itemId);
    if (error) {
      addGlobalToast(`Failed to delete ${previewTemplateKind === "review" ? "review item" : "task"}`, "error");
      return;
    }
    await refreshTemplateBundle();
    addGlobalToast(previewTemplateKind === "review" ? "Review item deleted" : "Task deleted", "success");
  }, [addGlobalToast, previewTemplateKind, refreshTemplateBundle]);

  const handleDeleteTemplateSection = useCallback(async (sectionId) => {
    if (previewTemplateKind === "review") {
      const sectionItems = toObjectRows(reviewItems).filter((item) => item.review_section_id === sectionId);
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
      await refreshTemplateBundle();
      addGlobalToast("Review section deleted", "success");
      return;
    }

    const childSections = toObjectRows(sections).filter((section) => section.parent_section_id === sectionId);
    for (const child of childSections) {
      const childItems = toObjectRows(items).filter((item) => item.template_section_id === child.id);
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

    const directItems = toObjectRows(items).filter((item) => item.template_section_id === sectionId);
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
    await refreshTemplateBundle();
    addGlobalToast("Section deleted", "success");
  }, [addGlobalToast, items, previewTemplateKind, reviewItems, sections, refreshTemplateBundle]);

  const handleToggleTemplateActive = useCallback(async () => {
    if (!previewTemplateId || !previewTemplate) return;
    const tableName = previewTemplateKind === "review" ? "review_templates" : "training_templates";
    const nextActive = previewTemplate.is_active === false;
    setSavingTemplateAction(nextActive ? "activate" : "deactivate");
    const { error } = await supabase
      .from(tableName)
      .update({ is_active: nextActive, updated_by_user_id: actorUserId })
      .eq("id", previewTemplateId);
    if (error) {
      addGlobalToast(nextActive ? "Failed to mark template active" : "Failed to mark template inactive", "error");
      setSavingTemplateAction("");
      return;
    }
    await refreshTemplateBundle();
    addGlobalToast(nextActive ? "Template marked active" : "Template marked inactive", "success");
    setSavingTemplateAction("");
  }, [actorUserId, addGlobalToast, previewTemplate, previewTemplateId, previewTemplateKind, refreshTemplateBundle]);

  const handleDeleteTemplateDraft = useCallback(async () => {
    if (!previewTemplate?.version?.id || previewTemplate.version.status !== "draft") return;
    if (!window.confirm("Delete this draft version? Published versions will not be changed.")) return;
    setSavingTemplateAction("delete-draft");
    const versionId = previewTemplate.version.id;
    const versionSource = previewTemplateKind === "review" ? toObjectRows(allReviewTemplateVersions) : toObjectRows(allTemplateVersions);
    const currentVersion = toObjectRows(versionSource).find((version) => version.template_id === previewTemplateId && version.is_current && version.id !== versionId) || null;

    if (previewTemplateKind === "review") {
      const draftSections = toObjectRows(reviewSections).filter((section) => section.template_version_id === versionId);
      const draftItems = toObjectRows(reviewItems).filter((item) => item.template_version_id === versionId);
      if (draftItems.length > 0) {
        const { error } = await supabase.from("review_items").delete().in("id", draftItems.map((item) => item.id));
        if (error) {
          addGlobalToast("Failed to delete draft prompts", "error");
          setSavingTemplateAction("");
          return;
        }
      }
      if (draftSections.length > 0) {
        const { error } = await supabase.from("review_sections").delete().in("id", draftSections.map((section) => section.id));
        if (error) {
          addGlobalToast("Failed to delete draft sections", "error");
          setSavingTemplateAction("");
          return;
        }
      }
      const { error } = await supabase.from("review_template_versions").delete().eq("id", versionId);
      if (error) {
        addGlobalToast("Failed to delete draft", "error");
        setSavingTemplateAction("");
        return;
      }
    } else {
      const draftItems = toObjectRows(items).filter((item) => item.template_version_id === versionId);
      const draftSections = toObjectRows(sections).filter((section) => section.template_version_id === versionId);
      if (draftItems.length > 0) {
        const { error } = await supabase.from("training_template_items").delete().in("id", draftItems.map((item) => item.id));
        if (error) {
          addGlobalToast("Failed to delete draft tasks", "error");
          setSavingTemplateAction("");
          return;
        }
      }
      if (draftSections.length > 0) {
        const { error } = await supabase.from("training_template_sections").delete().in("id", draftSections.map((section) => section.id));
        if (error) {
          addGlobalToast("Failed to delete draft sections", "error");
          setSavingTemplateAction("");
          return;
        }
      }
      const { error } = await supabase.from("training_template_versions").delete().eq("id", versionId);
      if (error) {
        addGlobalToast("Failed to delete draft", "error");
        setSavingTemplateAction("");
        return;
      }
    }

    setPreviewTemplateVersionId(currentVersion?.id || null);
    await refreshTemplateBundle();
    addGlobalToast("Draft deleted", "success");
    setSavingTemplateAction("");
  }, [addGlobalToast, allReviewTemplateVersions, allTemplateVersions, items, previewTemplate, previewTemplateId, previewTemplateKind, refreshTemplateBundle, reviewItems, reviewSections, sections]);

  const resequenceRows = useCallback(async (tableName, rows) => {
    const updates = rows.map((row, index) => supabase
      .from(tableName)
      .update({ sequence_order: (index + 1) * 10 })
      .eq("id", row.id));
    const results = await Promise.all(updates);
    return results.find((result) => result.error)?.error || null;
  }, []);

  const handleMoveTemplateSection = useCallback(async (sectionId, direction) => {
    const tableName = previewTemplateKind === "review" ? "review_sections" : "training_template_sections";
    const source = previewTemplateKind === "review" ? toObjectRows(reviewSections) : toObjectRows(sections);
    const section = toObjectRows(source).find((row) => row.id === sectionId);
    if (!section) return;
    const siblings = toObjectRows(source)
      .filter((row) =>
        row.template_version_id === section.template_version_id &&
        (previewTemplateKind === "review" || (row.parent_section_id || null) === (section.parent_section_id || null))
      )
      .sort((a, b) => a.sequence_order - b.sequence_order);
    const currentIndex = siblings.findIndex((row) => row.id === sectionId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= siblings.length) return;
    const reordered = [...siblings];
    const [moved] = reordered.splice(currentIndex, 1);
    reordered.splice(nextIndex, 0, moved);
    const error = await resequenceRows(tableName, reordered);
    if (error) {
      addGlobalToast("Failed to reorder section", "error");
      return;
    }
    await refreshTemplateBundle();
  }, [addGlobalToast, previewTemplateKind, refreshTemplateBundle, resequenceRows, reviewSections, sections]);

  const handleMoveTemplateItemOrder = useCallback(async (itemId, direction) => {
    const tableName = previewTemplateKind === "review" ? "review_items" : "training_template_items";
    const source = previewTemplateKind === "review" ? toObjectRows(reviewItems) : toObjectRows(items);
    const item = toObjectRows(source).find((row) => row.id === itemId);
    if (!item) return;
    const siblings = toObjectRows(source)
      .filter((row) => previewTemplateKind === "review" ? row.review_section_id === item.review_section_id : row.template_section_id === item.template_section_id)
      .sort((a, b) => a.sequence_order - b.sequence_order);
    const currentIndex = siblings.findIndex((row) => row.id === itemId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= siblings.length) return;
    const reordered = [...siblings];
    const [moved] = reordered.splice(currentIndex, 1);
    reordered.splice(nextIndex, 0, moved);
    const error = await resequenceRows(tableName, reordered);
    if (error) {
      addGlobalToast(`Failed to reorder ${previewTemplateKind === "review" ? "prompt" : "task"}`, "error");
      return;
    }
    await refreshTemplateBundle();
  }, [addGlobalToast, items, previewTemplateKind, refreshTemplateBundle, resequenceRows, reviewItems]);

  const handleMoveTemplateItemSection = useCallback(async (itemId, sectionId) => {
    if (!sectionId) return;
    const tableName = previewTemplateKind === "review" ? "review_items" : "training_template_items";
    const source = previewTemplateKind === "review" ? toObjectRows(reviewItems) : toObjectRows(items);
    const item = toObjectRows(source).find((row) => row.id === itemId);
    if (!item) return;
    const currentSectionId = previewTemplateKind === "review" ? item.review_section_id : item.template_section_id;
    if (currentSectionId === sectionId) return;
    const targetItems = toObjectRows(source).filter((row) => previewTemplateKind === "review" ? row.review_section_id === sectionId : row.template_section_id === sectionId);
    const patch = previewTemplateKind === "review"
      ? { review_section_id: sectionId, sequence_order: (targetItems.length + 1) * 10 }
      : { template_section_id: sectionId, sequence_order: (targetItems.length + 1) * 10 };
    const { error } = await supabase.from(tableName).update(patch).eq("id", itemId);
    if (error) {
      addGlobalToast(`Failed to move ${previewTemplateKind === "review" ? "prompt" : "task"}`, "error");
      return;
    }
    await refreshTemplateBundle();
  }, [addGlobalToast, items, previewTemplateKind, refreshTemplateBundle, reviewItems]);

  const openLaborEmployeeProfile = useCallback((employeeId, seedRow = null) => {
    const resolvedEmployeeId = employeeId || getLaborEmployeeRowId(seedRow);
    if (!resolvedEmployeeId && !isObjectRow(seedRow)) {
      addGlobalToast?.("Employee record is missing an employee link", "error");
      return;
    }
    setSelectedRecordId(null);
    setSelectedLaborEmployeeId(resolvedEmployeeId);
    setSelectedLaborEmployeeSeed(isObjectRow(seedRow) ? seedRow : null);
    setSelectedReviewInstanceId(null);
    setShowNewRecord(false);
    setShowRecordConfig(false);
    setPreviewTemplateId(null);
    setPreviewTemplateVersionId(null);
  }, [addGlobalToast]);

  const handleAddEmployeeNote = useCallback(async () => {
    if (!selectedLaborEmployeeView?.id || !employeeNoteText.trim()) return;
    setSavingEmployeeNote(true);
    const { data, error } = await appendEmployeeNote({
      laborEmployeeId: selectedLaborEmployeeView.id,
      noteText: employeeNoteText,
      noteType: employeeNoteType,
    });
    if (error) {
      addGlobalToast("Failed to add employee note", "error");
      setSavingEmployeeNote(false);
      return;
    }

    const createdNote = Array.isArray(data) ? data[0] : data;
    let attachmentError = null;
    if (employeeNoteFiles.length > 0) {
      if (!createdNote?.id) {
        attachmentError = new Error("Employee note did not return an id for attachments");
      } else {
        try {
          await uploadEmployeeNoteAttachments({
            laborEmployeeId: selectedLaborEmployeeView.id,
            noteId: createdNote.id,
            files: employeeNoteFiles,
          });
        } catch (uploadError) {
          console.error("Employee note attachment upload error:", uploadError);
          attachmentError = uploadError;
        }
      }
    }

    setEmployeeNoteText("");
    setEmployeeNoteType("general");
    setEmployeeNoteFiles([]);
    setEmployeeNoteFileErrors([]);
    if (employeeNoteFileInputRef.current) employeeNoteFileInputRef.current.value = "";
    await refreshLaborData();
    setSavingEmployeeNote(false);
    addGlobalToast(
      attachmentError ? "Employee note saved, but one or more attachments failed" : "Employee note added",
      attachmentError ? "error" : "success"
    );
  }, [addGlobalToast, appendEmployeeNote, employeeNoteFiles, employeeNoteText, employeeNoteType, selectedLaborEmployeeView, refreshLaborData, uploadEmployeeNoteAttachments]);

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
    await refreshLaborData();
    setSavingGlobalNote(false);
    addGlobalToast("Employee note added", "success");
  }, [addGlobalToast, appendEmployeeNote, globalNoteEmployeeId, globalNoteText, globalNoteType, refreshLaborData]);

  const handleCreateReviewInstance = useCallback(async (reviewCycle) => {
    if (!selectedLaborEmployeeView?.id) return;
    const matchingTemplate = toObjectRows(reviewTemplates).find((template) =>
      (Array.isArray(template.role_scopes) ? template.role_scopes : []).some((scope) => scope.toUpperCase() === String(selectedLaborEmployeeView.position_title || "").toUpperCase())
    ) || toObjectRows(reviewTemplates)[0];

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
    await refreshLaborData();
    if (createdInstance?.id) setSelectedReviewInstanceId(createdInstance.id);
    addGlobalToast("Review instance created", "success");
  }, [actorName, actorUserId, addGlobalToast, reviewTemplates, selectedLaborEmployeeView, refreshLaborData]);

  const getReviewResponse = useCallback((reviewItemId) => {
    if (!selectedReviewInstanceId) return null;
    return toObjectRows(reviewResponses).find((response) => response.review_instance_id === selectedReviewInstanceId && response.review_item_id === reviewItemId) || null;
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
    await refreshLaborData();
    setSavingReviewItemId(null);
    addGlobalToast("Review response saved", "success");
  }, [actorUserId, addGlobalToast, getReviewResponse, reviewDrafts, selectedReviewInstanceId, refreshLaborData]);

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
    await refreshLaborData();
    setCompletingReview(false);
    addGlobalToast("Review completed", "success");
  }, [actorName, actorUserId, addGlobalToast, selectedReviewInstanceId, refreshLaborData]);

  const saveHierarchy = useCallback(async () => {
    if (!resolvedLaborLocationId || hierarchyDraft.length === 0) {
      setShowHierarchyManager(false);
      return;
    }
    if (!hierarchyPersistenceAvailable) {
      addGlobalToast("Hierarchy saving requires the labor hierarchy database migration", "warning");
      setShowHierarchyManager(false);
      return;
    }
    setSavingHierarchy(true);
    try {
      const existingByTitle = Object.fromEntries(
        positionHierarchy.map((row) => [normalizePositionTitle(row.position_title), row]),
      );
      const updates = hierarchyDraft.map((row, index) => ({
        existing: existingByTitle[row.normalized_title] || null,
        position_title: row.position_title,
        sort_order: (index + 1) * 10,
      }));

      const mutationResults = await Promise.all(updates.map((entry) => {
        if (entry.existing?.id) {
          return supabase
            .from("labor_position_hierarchy")
            .update({
              position_title: entry.position_title,
              sort_order: entry.sort_order,
              updated_by_user_id: actorUserId,
              updated_by_name: actorName,
            })
            .eq("id", entry.existing.id);
        }
        return supabase.from("labor_position_hierarchy").insert({
          location_id: resolvedLaborLocationId,
          position_title: entry.position_title,
          sort_order: entry.sort_order,
          created_by_user_id: actorUserId,
          created_by_name: actorName,
          updated_by_user_id: actorUserId,
          updated_by_name: actorName,
        });
      }));
      const failedMutation = mutationResults.find((result) => result.error);
      if (failedMutation?.error) throw failedMutation.error;

      const { data: hierarchyRes, error } = await supabase
        .from("labor_position_hierarchy")
        .select("*")
        .eq("location_id", resolvedLaborLocationId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      setPositionHierarchy(hierarchyRes || []);
      setRosterSort({ key: "hierarchy", direction: "asc" });
      setShowHierarchyManager(false);
      addGlobalToast("Roster hierarchy updated", "success");
    } catch (error) {
      console.error("Failed to save labor position hierarchy", error);
      addGlobalToast(error.message || "Failed to save roster hierarchy", "error");
    }
    setSavingHierarchy(false);
  }, [actorName, actorUserId, addGlobalToast, hierarchyDraft, hierarchyPersistenceAvailable, positionHierarchy, resolvedLaborLocationId]);

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
    return toObjectRows(rosterRows).map((row) => {
      const employeeId = getLaborEmployeeRowId(row);
      const contactEmployee = laborEmployeeMap[employeeId] || null;
      const contactEmail = readLaborEmployeeContact(contactEmployee, "contact_email");
      const contactPhone = readLaborEmployeeContact(contactEmployee, "contact_phone");
      const fullName = row.full_name || contactEmployee?.full_name || "";
      const { firstName, lastName } = splitEmployeeName(fullName);
      const endDate = row.end_date || contactEmployee?.end_date || null;
      const isActive = row.is_active ?? !endDate;
      const supportNoteCount = toObjectRows(laborNotesByEmployee[employeeId] || []).length;
      const snapshotNoteCount = Number(row.employee_note_count ?? row.note_count ?? row.recent_employee_note_count_7d ?? 0);
      const mergedEmployee = {
        ...row,
        ...(contactEmployee || {}),
        id: employeeId || row.id,
        labor_employee_id: employeeId,
        full_name: fullName,
        position_title: row.position_title || contactEmployee?.position_title || "",
      };
      const requirementRows = buildEmployeeTrainingRequirementRows({
        employee: mergedEmployee,
        certifications: employeeCertificationsByEmployee[employeeId] || [],
        requirements: certificationRequirements,
        documents: laborEmployeeDocumentsByEmployee[employeeId] || [],
      });
      const requirementSummary = summarizeEmployeeTrainingRequirementCompliance(requirementRows);
      let trainingCompliance = requirementRows.length > 0
        ? { label: requirementSummary.label, color: requirementSummary.color, inProgress: false }
        : getTrainingComplianceState(row);
      const daysSinceStart = getDaysSince(row?.start_date || contactEmployee?.start_date);
      if (!requirementSummary.isCompliant && daysSinceStart != null && daysSinceStart < TRAINING_GRACE_PERIOD_DAYS) {
        trainingCompliance = { label: "In Progress", color: "warning", inProgress: true };
      }
      return {
        ...row,
        id: employeeId || row.id,
        labor_employee_id: employeeId,
        full_name: fullName,
        position_title: row.position_title || contactEmployee?.position_title || "",
        start_date: row.start_date || contactEmployee?.start_date || null,
        end_date: endDate,
        is_active: isActive,
        employment_status: row.employment_status || (isActive ? "active" : "inactive"),
        first_name: firstName,
        last_name: lastName,
        contact_email: contactEmail,
        contact_phone: contactPhone,
        training_compliance: trainingCompliance,
        training_requirement_rows: requirementRows,
        training_requirement_summary: requirementSummary,
        review30: getReviewStatusPresentation(row, "review_30"),
        review60: getReviewStatusPresentation(row, "review_60"),
        review90: getReviewStatusPresentation(row, "review_90"),
        employee_note_count: supportNoteCount || snapshotNoteCount,
      };
    });
  }, [certificationRequirements, employeeCertificationsByEmployee, laborEmployeeDocumentsByEmployee, laborEmployeeMap, laborNotesByEmployee, rosterRows]);
  const displayedDashboardMetrics = useMemo(() => {
    const activeRows = preparedRosterRows.filter((row) => isLaborEmployeeActive(row));
    if (activeRows.length === 0) return dashboardMetrics;
    const hasRequirementRows = activeRows.some((row) => Array.isArray(row.training_requirement_rows) && row.training_requirement_rows.length > 0);
    if (!hasRequirementRows) return dashboardMetrics;
    const numerator = activeRows.filter((row) => row.training_requirement_summary?.isCompliant).length;
    const denominator = activeRows.length;
    return {
      ...dashboardMetrics,
      trainingComplianceNumerator: numerator,
      trainingComplianceDenominator: denominator,
      trainingComplianceScore: denominator > 0 ? Math.round((numerator / denominator) * 100) : 0,
    };
  }, [dashboardMetrics, preparedRosterRows]);
  const filteredRosterRows = useMemo(() => {
    return applyLaborRosterFilters(preparedRosterRows, rosterFilters);
  }, [preparedRosterRows, rosterFilters]);
	  const visibleRosterRows = useMemo(() => {
	    return filteredRosterRows;
	  }, [filteredRosterRows]);
  const positionHierarchyRows = useMemo(() => {
    const savedByTitle = Object.fromEntries(
      positionHierarchy.map((row) => [normalizePositionTitle(row.position_title), row]),
    );
    const merged = [];
    const seen = new Set();

    preparedRosterRows.forEach((row) => {
      const normalizedTitle = normalizePositionTitle(row.position_title);
      const title = String(row.position_title || "").trim();
      if (!normalizedTitle || seen.has(normalizedTitle)) return;
      const saved = savedByTitle[normalizedTitle] || null;
      seen.add(normalizedTitle);
      merged.push({
        id: saved?.id || null,
        position_title: saved?.position_title || title,
        normalized_title: normalizedTitle,
        sort_order: saved?.sort_order ?? null,
      });
    });

    positionHierarchy.forEach((row) => {
      const normalizedTitle = normalizePositionTitle(row.position_title);
      if (!normalizedTitle || seen.has(normalizedTitle)) return;
      seen.add(normalizedTitle);
      merged.push({
        id: row.id,
        position_title: row.position_title,
        normalized_title: normalizedTitle,
        sort_order: row.sort_order ?? null,
      });
    });

    return merged.sort((left, right) => {
      const leftRanked = Number.isFinite(left.sort_order);
      const rightRanked = Number.isFinite(right.sort_order);
      if (leftRanked && rightRanked) return left.sort_order - right.sort_order;
      if (leftRanked !== rightRanked) return leftRanked ? -1 : 1;
      const weightDelta = getDefaultPositionWeight(right.position_title) - getDefaultPositionWeight(left.position_title);
      if (weightDelta !== 0) return weightDelta;
      return left.position_title.localeCompare(right.position_title, undefined, { sensitivity: "base" });
    });
  }, [positionHierarchy, preparedRosterRows]);
  const positionHierarchyIndex = useMemo(() => {
    return Object.fromEntries(positionHierarchyRows.map((row, index) => [row.normalized_title, index]));
  }, [positionHierarchyRows]);

  useEffect(() => {
    if (showHierarchyManager) {
      setHierarchyDraft(positionHierarchyRows.map((row) => ({ ...row })));
    }
  }, [positionHierarchyRows, showHierarchyManager]);
  const sortedRosterRows = useMemo(() => {
    const direction = rosterSort.direction === "desc" ? -1 : 1;
    const getSortValue = (row) => {
      switch (rosterSort.key) {
        case "hierarchy":
          return positionHierarchyIndex[normalizePositionTitle(row.position_title)] ?? Number.MAX_SAFE_INTEGER;
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
	        case "notes":
	          return String(Number(row.employee_note_count || 0)).padStart(6, "0");
	        default:
	          return String(row.last_name || row.full_name || "");
      }
    };

    return [...visibleRosterRows].sort((a, b) => {
	      const activeDelta = Number(!!b.is_active) - Number(!!a.is_active);
	      if (activeDelta !== 0) return activeDelta;

      if (rosterSort.key === "hierarchy") {
        const leftIndex = getSortValue(a);
        const rightIndex = getSortValue(b);
        if (leftIndex !== rightIndex) return leftIndex - rightIndex;
        return String(a.last_name || a.full_name || "").localeCompare(String(b.last_name || b.full_name || ""), undefined, { numeric: true, sensitivity: "base" });
      }

      const left = getSortValue(a);
      const right = getSortValue(b);
      return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" }) * direction;
    });
	  }, [positionHierarchyIndex, rosterSort, visibleRosterRows]);
  const activeContactCardEmployees = useMemo(() => {
    const seen = new Set();
    return preparedRosterRows
      .filter((row) => isLaborEmployeeActive(row))
      .map((row) => {
        const employeeId = getLaborEmployeeRowId(row);
        const canonicalEmployee = laborEmployeeMap[employeeId] || {};
        return {
          ...canonicalEmployee,
          ...row,
          id: employeeId || row.id,
          labor_employee_id: employeeId || row.labor_employee_id,
          metadata: canonicalEmployee.metadata || row.metadata || {},
        };
      })
      .filter((employee) => {
        const key = getLaborEmployeeRowId(employee) || normalizeEmployeeName(employee.full_name);
        if (!key || seen.has(key) || !String(employee.full_name || "").trim()) return false;
        seen.add(key);
        return true;
      });
  }, [laborEmployeeMap, preparedRosterRows]);
  const recordLaborContactCardDownload = useCallback(async ({ employees = [], mode = "single" }) => {
    const employeeRows = toObjectRows(employees);
    if (!laborLocationRef || employeeRows.length === 0) {
      return { error: new Error("Missing employee or location for contact-card audit") };
    }

    const employeeNames = employeeRows
      .map((employee) => String(employee.full_name || employee.name || "").trim())
      .filter(Boolean);
    const detailRows = [
      { field: "Export Format", oldVal: "—", newVal: "VCF contact card" },
      { field: "Export Scope", oldVal: "—", newVal: mode === "bulk" ? "All active employees" : "Single employee" },
      { field: "Employee Count", oldVal: "—", newVal: String(employeeRows.length) },
      { field: "Location", oldVal: "—", newVal: laborContactLocationName || "K9 Operations" },
      { field: "Included Fields", oldVal: "—", newVal: "Name, phone, email, position, location, start date, active status" },
    ];
    if (employeeNames.length > 0) {
      detailRows.push({
        field: mode === "bulk" ? "Employees" : "Employee",
        oldVal: "—",
        newVal: mode === "bulk" && employeeNames.length > 12
          ? `${employeeNames.slice(0, 12).join(", ")} and ${employeeNames.length - 12} more`
          : employeeNames.join(", "),
      });
    }

    return supabase.from("lite_audit_log").insert({
      location_id: laborLocationRef,
      timestamp: new Date().toISOString(),
      user_id: actorUserId,
      user_name: actorName,
      action: mode === "bulk" ? "Bulk Downloaded Labor Contact Cards" : "Downloaded Labor Contact Card",
      resource_type: mode === "bulk" ? "labor_employee_bulk_export" : "labor_employee",
      resource_id: mode === "bulk" ? null : getLaborEmployeeRowId(employeeRows[0]),
      details: detailRows,
    });
  }, [actorName, actorUserId, laborContactLocationName, laborLocationRef]);
  const handleDownloadLaborContactCard = useCallback(async (employee) => {
    const employeeRow = employee || selectedLaborEmployeeView;
    if (!employeeRow || !String(employeeRow.full_name || "").trim()) {
      addGlobalToast("No employee contact card is available for this record", "error");
      return;
    }
    const employeeKey = getLaborEmployeeRowId(employeeRow) || normalizeEmployeeName(employeeRow.full_name);
    setContactCardDownloadKey(`single:${employeeKey}`);
    const { error } = await recordLaborContactCardDownload({ employees: [employeeRow], mode: "single" });
    if (error) {
      console.error("Labor contact-card audit failed:", error);
      addGlobalToast("Contact card was not downloaded because audit logging failed", "error");
      setContactCardDownloadKey("");
      return;
    }

    const content = buildLaborEmployeeContactCardFile([employeeRow], {
      locationName: laborContactLocationName,
    });
    const filename = buildLaborEmployeeContactCardFilename(employeeRow, {
      locationName: laborContactLocationName,
    });
    downloadTextFile(filename, content, "text/vcard;charset=utf-8");
    setContactCardDownloadKey("");
    addGlobalToast("Contact card downloaded", "success");
  }, [addGlobalToast, laborContactLocationName, recordLaborContactCardDownload, selectedLaborEmployeeView]);
  const handleDownloadActiveLaborContactCards = useCallback(async () => {
    if (activeContactCardEmployees.length === 0) {
      addGlobalToast("No active employees are available to export", "error");
      return;
    }
    setContactCardDownloadKey("bulk");
    const { error } = await recordLaborContactCardDownload({ employees: activeContactCardEmployees, mode: "bulk" });
    if (error) {
      console.error("Labor bulk contact-card audit failed:", error);
      addGlobalToast("Active contact cards were not downloaded because audit logging failed", "error");
      setContactCardDownloadKey("");
      return;
    }

    const content = buildLaborEmployeeContactCardFile(activeContactCardEmployees, {
      locationName: laborContactLocationName,
    });
    const filename = buildLaborEmployeeContactCardFilename({}, {
      locationName: laborContactLocationName,
      bulk: true,
    });
    downloadTextFile(filename, content, "text/vcard;charset=utf-8");
    setContactCardDownloadKey("");
    addGlobalToast(`${activeContactCardEmployees.length} active contact card${activeContactCardEmployees.length === 1 ? "" : "s"} downloaded`, "success");
  }, [activeContactCardEmployees, addGlobalToast, laborContactLocationName, recordLaborContactCardDownload]);
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
    if (!isObjectRow(item) || !item.id) return null;
    const itemLabel = String(item.label || item.prompt || "").trim() || "Untitled task";
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
                  {itemLabel}
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
    if (!isObjectRow(item) || !item.id) return null;
    const isReviewItem = previewTemplateKind === "review";
    const itemType = String(item.item_type || "").trim();
    const primaryLabel = String(isReviewItem ? item.prompt : item.label || "").trim() || "Untitled";
    const secondaryText = isReviewItem
      ? (itemType === "rating" && Array.isArray(item.options) && item.options.length > 0
          ? `Options: ${item.options.join(", ")}`
          : itemType.replace(/_/g, " "))
      : item.description;
    const linkUrl = isReviewItem ? null : item.policy_reference;
    const sectionOptions = isReviewItem
      ? (previewTemplate?.sections || []).filter(isObjectRow).map((section) => ({ value: section.id, label: section.title }))
      : (previewTemplate?.sections || []).filter(isObjectRow).flatMap((section) => [
          { value: section.id, label: section.title },
          ...(Array.isArray(section.children) ? section.children.filter(isObjectRow).map((child) => ({ value: child.id, label: `${section.title} / ${child.title}` })) : []),
        ]);
    const currentSectionId = isReviewItem ? item.review_section_id : item.template_section_id;
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
            {sectionOptions.length > 1 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, marginBottom: 6 }}>Move to section</div>
                <CustomSelect
                  value={currentSectionId || ""}
                  onChange={(value) => handleMoveTemplateItemSection(item.id, value)}
                  options={sectionOptions}
                />
              </div>
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
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <Btn variant="ghost" size="sm" onClick={() => handleMoveTemplateItemOrder(item.id, -1)}>Move Up</Btn>
                <Btn variant="ghost" size="sm" onClick={() => handleMoveTemplateItemOrder(item.id, 1)}>Move Down</Btn>
	              <Btn variant="ghost" size="sm" onClick={() => handleDeleteTemplateItem(item.id)}>Delete {isReviewItem ? "Prompt" : "Task"}</Btn>
              </div>
	          </div>
        </div>
      </Card>
    );
  }, [handleDeleteTemplateItem, handleMoveTemplateItemOrder, handleMoveTemplateItemSection, handleUpdateTemplateItem, previewTemplate, previewTemplateKind]);

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

  if (hasSelectedLaborEmployee && !selectedLaborEmployeeView) {
    return (
      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "24px 16px" }}>
        <button
	          onClick={() => {
	            setSelectedLaborEmployeeId(null);
	            setSelectedLaborEmployeeSeed(null);
	            setSelectedReviewInstanceId(null);
	          }}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: C.pri, fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 16, fontFamily: "inherit", padding: 0 }}
        >
          <I.Back /> Back to Labor
        </button>
        <Card style={{ padding: 24 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginBottom: 8 }}>
            {loading ? "Loading employee record..." : "Employee record unavailable"}
          </div>
          <div style={{ fontSize: 13, color: C.textSec, lineHeight: 1.6 }}>
            {loading
              ? "Labor is still loading the selected employee details."
              : "The selected employee record could not be assembled from the current roster and training data."}
          </div>
        </Card>
      </div>
    );
  }

  if (hasSelectedLaborEmployee && selectedLaborEmployeeView) {
    const selectedLaborEmployeeKey = getLaborEmployeeRowId(selectedLaborEmployeeView);
    const selectedLaborEmployeeIsActive = selectedLaborEmployeeSnapshot?.is_active ?? isLaborEmployeeActive(selectedLaborEmployeeView);
    const employeeTrainingRecords = toObjectRows(records)
      .filter((record) => isTrainingRecordForEmployee(record, selectedLaborEmployeeView))
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    const employeePhone = readLaborEmployeeContact(selectedLaborEmployeeView, "contact_phone");
    const employeeEmail = readLaborEmployeeContact(selectedLaborEmployeeView, "contact_email");
    const reviewCycleRows = [
      {
        id: "30_day",
        label: "30 Day Review",
        dueDate: selectedLaborEmployeeSnapshot?.review_30_due_date || null,
        status: selectedLaborEmployeeSnapshot?.review_30_status || "not_started",
        instance: selectedEmployeeReviewInstances.find((instance) => instance?.review_cycle === "30_day") || null,
      },
      {
        id: "60_day",
        label: "60 Day Review",
        dueDate: selectedLaborEmployeeSnapshot?.review_60_due_date || null,
        status: selectedLaborEmployeeSnapshot?.review_60_status || "not_started",
        instance: selectedEmployeeReviewInstances.find((instance) => instance?.review_cycle === "60_day") || null,
      },
      {
        id: "90_day",
        label: "90 Day Review",
        dueDate: selectedLaborEmployeeSnapshot?.review_90_due_date || null,
        status: selectedLaborEmployeeSnapshot?.review_90_status || "not_started",
        instance: selectedEmployeeReviewInstances.find((instance) => instance?.review_cycle === "90_day") || null,
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
      const reviewStatus = String(selectedReviewInstance.status || "not_started");
      const reviewStatusColor = reviewStatus === "completed"
        ? "success"
        : reviewStatus === "overdue"
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
              <Badge color={reviewStatusColor}>{reviewStatus.replace(/_/g, " ")}</Badge>
              {selectedReviewInstance.due_date && <Badge color="default">Due {formatLaborDate(selectedReviewInstance.due_date)}</Badge>}
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
                <div style={{ fontSize: 12, color: C.textMut, marginTop: 8 }}>Started {formatLaborDate(selectedLaborEmployeeView.start_date)}</div>
              )}
            </Card>
            <Card style={{ padding: 16 }}>
              <div style={{ fontSize: 12, color: C.textMut, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Cycle Status</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: reviewStatusColor === "success" ? C.suc : reviewStatusColor === "danger" ? C.dan : C.warn }}>
                {reviewStatus.replace(/_/g, " ")}
              </div>
              <div style={{ fontSize: 12, color: C.textMut, marginTop: 8 }}>
                {selectedReviewInstance.due_date ? `Due ${formatLaborDate(selectedReviewInstance.due_date)}` : "Due date not set"}
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

    const employeeDetailTableHeaderStyle = {
      padding: "9px 12px",
      fontSize: 11,
      fontWeight: 800,
      color: C.textMut,
      textTransform: "uppercase",
      letterSpacing: "0.04em",
      borderBottom: `1px solid ${C.border}`,
      textAlign: "left",
    };
    const employeeRecordMetricCards = buildEmployeeRecordMetricCards({
      employeeSnapshot: {
        ...(selectedLaborEmployeeSnapshot || {}),
        training_compliance_flag: selectedEmployeeTrainingRequirementSummary.isCompliant,
      },
      reviewCycleRows,
      attendanceIncidentCount30d: selectedEmployeeAttendanceIncidents30d.length,
    }).map((metric) => {
      if (metric.id !== "next_review" || !metric.helper?.startsWith("Due ")) return metric;
      return { ...metric, helper: `Due ${formatLaborDate(metric.helper.replace("Due ", ""))}` };
    });
    const metricColorByTone = { success: C.suc, warning: C.warn, danger: C.dan, default: C.text };
    const requirementStatusColor = {
      complete: "success",
      expired: "danger",
      needs_evidence: "warning",
      missing: "danger",
    };
    const trainingRequirementDocumentIds = new Set(
      selectedEmployeeTrainingRequirementRows.map((row) => row.evidenceDocument?.id).filter(Boolean)
    );
    const otherEmployeeDocuments = selectedEmployeeUnlinkedDocuments.filter((document) =>
      !trainingRequirementDocumentIds.has(document.id) && document.document_type !== "training_requirement_evidence"
    );
    const employeeRecordTabOptions = [
      { id: "training", label: "Training" },
      { id: "reviews", label: "Performance" },
      { id: "attendance", label: "Attendance" },
      { id: "notes", label: `Notes (${selectedEmployeeNotes.length})` },
      { id: "history", label: "History" },
    ];
    const selectedEmployeeAttendanceRows = toObjectRows(laborAttendanceIncidents)
      .filter((incident) => incident.labor_employee_id === selectedLaborEmployeeView.id)
      .sort((a, b) => new Date(b.incident_date || 0) - new Date(a.incident_date || 0))
      .slice(0, 10);

    return (
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "24px 16px 48px" }}>
        <button
          onClick={() => {
            setSelectedLaborEmployeeId(null);
            setSelectedLaborEmployeeSeed(null);
            setSelectedReviewInstanceId(null);
          }}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: C.pri, fontSize: 13, fontWeight: 700, cursor: "pointer", marginBottom: 16, fontFamily: "inherit", padding: 0 }}
        >
          <I.Back /> Back to Labor
        </button>

        <Card style={{ padding: 24, marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 18, flexWrap: "wrap", alignItems: "flex-start" }}>
            <div style={{ minWidth: 280, flex: "1 1 420px" }}>
              <div style={{ fontSize: 28, lineHeight: 1.1, fontWeight: 900, color: C.text, marginBottom: 6 }}>{selectedLaborEmployeeView.full_name}</div>
              <div style={{ fontSize: 15, color: C.textSec, fontWeight: 700, marginBottom: 10 }}>{selectedLaborEmployeeView.position_title || "Employee"}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
                <Badge color={selectedLaborEmployeeIsActive ? "success" : "warning"}>
                  {selectedLaborEmployeeIsActive ? "Active Employee" : "Inactive Employee"}
                </Badge>
                {selectedLaborEmployeeSnapshot?.active_training_status && (
                  <Badge color="info">Training {String(selectedLaborEmployeeSnapshot.active_training_status).replace(/_/g, " ")}</Badge>
                )}
              </div>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: C.textMut, fontWeight: 600 }}>
                {selectedLaborEmployeeView.start_date && <span>Start: {formatLaborDate(selectedLaborEmployeeView.start_date)}</span>}
                {selectedLaborEmployeeView.end_date && <span>End: {formatLaborDate(selectedLaborEmployeeView.end_date)}</span>}
                {employeePhone && <span>{fmtPhoneInput(employeePhone)}</span>}
                {employeeEmail && <span>{employeeEmail}</span>}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap", justifyContent: "flex-end" }}>
              <Btn
                variant="secondary"
                size="sm"
                icon={<I.Download />}
                onClick={() => handleDownloadLaborContactCard(selectedLaborEmployeeView)}
                disabled={contactCardDownloadKey === `single:${selectedLaborEmployeeKey || normalizeEmployeeName(selectedLaborEmployeeView.full_name)}`}
              >
                {contactCardDownloadKey === `single:${selectedLaborEmployeeKey || normalizeEmployeeName(selectedLaborEmployeeView.full_name)}` ? "Downloading..." : "Contact Card"}
              </Btn>
              <Btn variant="secondary" size="sm" onClick={() => openLaborEmployeeEditor(selectedLaborEmployeeView)}>Edit Employee</Btn>
              {selectedLaborEmployeeSnapshot?.active_training_record_id ? (
                <Btn
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setSelectedLaborEmployeeId(null);
                    setSelectedLaborEmployeeSeed(null);
                    setSelectedRecordId(selectedLaborEmployeeSnapshot.active_training_record_id);
                  }}
                >
                  Open Active Training
                </Btn>
              ) : (
                <Btn
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    setNewLaborEmployeeId(selectedLaborEmployeeKey || "");
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

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 14 }}>
          {employeeRecordMetricCards.map((metric) => (
            <Card key={metric.id} style={{ padding: 16 }}>
              <div style={{ fontSize: 11, color: C.textMut, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 7 }}>{metric.label}</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: metricColorByTone[metric.tone] || C.text }}>{metric.value}</div>
              {metric.helper && <div style={{ fontSize: 12, color: C.textMut, marginTop: 7, fontWeight: 600 }}>{metric.helper}</div>}
            </Card>
          ))}
        </div>

        <div style={{ display: "flex", gap: 4, padding: 4, borderRadius: 8, border: `1px solid ${C.border}`, background: C.surfaceHover, marginBottom: 18, overflowX: "auto" }}>
          {employeeRecordTabOptions.map((option) => {
            const selected = employeeRecordTab === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setEmployeeRecordTab(option.id)}
                style={{
                  minWidth: 132,
                  padding: "9px 12px",
                  borderRadius: 6,
                  border: "none",
                  background: selected ? "#fff" : "transparent",
                  color: selected ? C.text : C.textSec,
                  boxShadow: selected ? "0 1px 3px rgba(15,23,42,0.10)" : "none",
                  fontFamily: "inherit",
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        {employeeRecordTab === "training" && (
          <>
            <Card style={{ padding: 18, marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: C.text, marginBottom: 6 }}>Training Requirements</div>
                  <div style={{ fontSize: 12, color: C.textMut, fontWeight: 700 }}>{selectedEmployeeTrainingRequirementSummary.helper}</div>
                </div>
                <Badge color={selectedEmployeeTrainingRequirementSummary.color}>{selectedEmployeeTrainingRequirementSummary.label}</Badge>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {selectedEmployeeTrainingRequirementRows.map((requirementRow) => {
                  const externalDocument = requirementRow.externalUrl
                    ? {
                        id: `requirement-url-${requirementRow.slug}-${requirementRow.certification?.id || "external"}`,
                        file_name: `${requirementRow.label} link`,
                        external_url: requirementRow.externalUrl,
                        mime_type: "application/pdf",
                      }
                    : null;
                  const statusLabel = requirementRow.status === "needs_evidence"
                    ? "Needs Evidence"
                    : requirementRow.status === "missing"
                      ? "Missing"
                      : requirementRow.status === "expired"
                        ? "Expired"
                        : "Complete";
                  return (
                    <div
                      key={requirementRow.slug}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(190px, 1.1fr) minmax(150px, 0.8fr) minmax(220px, 1fr) auto",
                        gap: 12,
                        alignItems: "center",
                        padding: "13px 14px",
                        borderRadius: 8,
                        border: `1px solid ${C.borderLight}`,
                        background: "#fff",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 900, color: C.text }}>{requirementRow.label}</div>
                        <div style={{ fontSize: 11, color: C.textMut, fontWeight: 650, marginTop: 3 }}>{requirementRow.helper}</div>
                      </div>
                      <div>
                        <Badge color={requirementStatusColor[requirementRow.status] || "default"}>{statusLabel}</Badge>
                        <div style={{ fontSize: 11, color: C.textMut, marginTop: 5, fontWeight: 650 }}>
                          {requirementRow.certification?.completed_on ? `Completed ${formatLaborDate(requirementRow.certification.completed_on)}` : "No completion date"}
                          {requirementRow.certification?.expires_on ? ` · Expires ${formatLaborDate(requirementRow.certification.expires_on)}` : ""}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
                        {requirementRow.evidenceDocument ? renderEmployeeDocumentButton(requirementRow.evidenceDocument) : null}
                        {externalDocument ? renderEmployeeDocumentButton(externalDocument) : null}
                        {!requirementRow.evidenceDocument && !externalDocument ? (
                          <span style={{ fontSize: 11, color: C.textMut, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                            Evidence required
                          </span>
                        ) : null}
                      </div>
                      <Btn variant="secondary" size="sm" onClick={() => openTrainingRequirementEditor(requirementRow)}>
                        Update
                      </Btn>
                    </div>
                  );
                })}
              </div>
            </Card>

            <SectionHeader title="Training History" count={employeeTrainingRecords.length} />
            {employeeTrainingRecords.length === 0 ? (
              <EmptyState icon="GraduationCap" title="No training records yet" subtitle="Create a training record from the roster or training tab" />
            ) : (
              <Card style={{ padding: 0, overflow: "hidden", marginBottom: 20 }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={employeeDetailTableHeaderStyle}>Position</th>
                      <th style={employeeDetailTableHeaderStyle}>Training Plan</th>
                      <th style={employeeDetailTableHeaderStyle}>Status</th>
                      <th style={employeeDetailTableHeaderStyle}>Progress</th>
                      <th style={employeeDetailTableHeaderStyle}>Target</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employeeTrainingRecords.map((record) => (
                      <tr
                        key={record.id}
                        onClick={() => {
                          setSelectedLaborEmployeeId(null);
                          setSelectedLaborEmployeeSeed(null);
                          setSelectedRecordId(record.id);
                        }}
                        style={{ cursor: "pointer", borderBottom: `1px solid ${C.borderLight}` }}
                      >
                        <td style={{ padding: "11px 12px", fontSize: 12, color: C.text, fontWeight: 700 }}>{record.target_role}</td>
                        <td style={{ padding: "11px 12px", fontSize: 12, color: C.textSec }}>{record.template_name_snapshot}</td>
                        <td style={{ padding: "11px 12px" }}><StatusBadge status={record.overall_status} /></td>
                        <td style={{ padding: "11px 12px", fontSize: 12, color: C.textSec }}>{Math.round(safeTrainingProgress(record.progress_percent))}%</td>
                        <td style={{ padding: "11px 12px", fontSize: 12, color: C.textMut }}>{record.target_end_date ? formatLaborDate(record.target_end_date) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </>
        )}

        {employeeRecordTab === "reviews" && (
          <>
            <SectionHeader title="Performance Reviews" count={selectedEmployeeReviewInstances.length} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, marginBottom: 20 }}>
              {reviewCycleRows.map((cycle) => (
                <Card key={cycle.id} style={{ padding: 18 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 900, color: C.text, marginBottom: 5 }}>{cycle.label}</div>
                      <div style={{ fontSize: 12, color: C.textMut }}>Due {cycle.dueDate ? formatLaborDate(cycle.dueDate) : "—"}</div>
                    </div>
                    <Badge color={cycle.status === "completed" ? "success" : cycle.status === "overdue" ? "danger" : "warning"}>
                      {String(cycle.status).replace(/_/g, " ")}
                    </Badge>
                  </div>
                  {cycle.instance ? (
                    <Btn variant="primary" size="sm" onClick={() => setSelectedReviewInstanceId(cycle.instance.id)}>Open Review</Btn>
                  ) : (
                    <Btn variant="secondary" size="sm" onClick={() => handleCreateReviewInstance(cycle.id)}>Start Review</Btn>
                  )}
                </Card>
              ))}
            </div>
          </>
        )}

        {employeeRecordTab === "notes" && (
          <>
            <Card style={{ padding: 18, marginBottom: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 12 }}>
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
              <input
                ref={employeeNoteFileInputRef}
                type="file"
                multiple
                accept={LABOR_EMPLOYEE_ATTACHMENT_ACCEPT}
                onChange={handleEmployeeNoteFileChange}
                style={{ display: "none" }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <Btn variant="secondary" size="sm" icon={<I.FileText />} onClick={() => employeeNoteFileInputRef.current?.click()}>
                    Attach PDF/Image
                  </Btn>
                  {employeeNoteFiles.map((file, index) => (
                    <span key={`${file.name}-${index}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 8px", borderRadius: 8, border: `1px solid ${C.border}`, background: "#fff", fontSize: 12, color: C.textSec, fontWeight: 700 }}>
                      {file.name}
                      <button type="button" onClick={() => handleRemoveEmployeeNoteFile(index)} style={{ border: "none", background: "transparent", color: C.textMut, cursor: "pointer", padding: 0, display: "flex" }}>
                        <I.X />
                      </button>
                    </span>
                  ))}
                </div>
                <Btn variant="primary" size="sm" onClick={handleAddEmployeeNote} disabled={savingEmployeeNote || !employeeNoteText.trim()}>
                  {savingEmployeeNote ? "Saving..." : "Add Employee Note"}
                </Btn>
              </div>
              {employeeNoteFileErrors.length > 0 && (
                <div style={{ marginTop: 10, fontSize: 12, color: C.dan, fontWeight: 700 }}>
                  {employeeNoteFileErrors.join(" ")}
                </div>
              )}
	            </Card>

	            <SectionHeader title="Employee Notes" count={filteredSelectedEmployeeNotes.length} />
	            <Card style={{ padding: 14, marginBottom: 12 }}>
	              <Inp
	                label="Search Notes"
	                value={employeeNoteSearchText}
	                onChange={setEmployeeNoteSearchText}
	                placeholder="Search note text, type, author, or date"
	              />
	            </Card>
	            <Card style={{ padding: 16, marginBottom: 20 }}>
	              {filteredSelectedEmployeeNotes.length === 0 ? (
	                <div style={{ fontSize: 12, color: C.textMut, fontStyle: "italic" }}>
	                  {employeeNoteSearchText.trim() ? "No employee notes match this search" : "No employee notes yet"}
	                </div>
	              ) : (
	                filteredSelectedEmployeeNotes.map((note) => {
                  const noteDocuments = toObjectRows(selectedEmployeeDocumentsByNote[note.id] || []);
                  return (
                    <div key={note.id} style={{ padding: "13px 0", borderTop: `1px solid ${C.borderLight}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start", marginBottom: 5 }}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                          <span style={{ fontSize: 12, fontWeight: 800, color: C.text }}>{note.created_by_name || "Staff"}</span>
                          <Badge color="default">{String(note.note_type || "general").replace(/_/g, " ")}</Badge>
                          <span style={{ fontSize: 11, color: C.textMut }}>{formatTrainingTimestamp(note.created_at)}</span>
                        </div>
                        <button
                          type="button"
                          title="Remove note"
                          aria-label="Remove employee note"
                          onClick={() => handleDeleteEmployeeNote(note)}
                          disabled={deletingEmployeeNoteId === note.id}
                          style={{
                            width: 30,
                            height: 30,
                            borderRadius: 8,
                            border: `1px solid ${C.border}`,
                            background: deletingEmployeeNoteId === note.id ? C.bg : "#fff",
                            color: C.dan,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: deletingEmployeeNoteId === note.id ? "wait" : "pointer",
                          }}
                        >
                          <I.Trash />
                        </button>
                      </div>
                      <div style={{ fontSize: 13, color: C.textSec, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{note.note_text}</div>
                      {noteDocuments.length > 0 && (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                          {noteDocuments.map((document) => renderEmployeeDocumentButton(document))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              {otherEmployeeDocuments.length > 0 && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 12, fontWeight: 900, color: C.text, marginBottom: 8 }}>Other Documents</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {otherEmployeeDocuments.map((document) => renderEmployeeDocumentButton(document))}
                  </div>
                </div>
              )}
            </Card>
          </>
        )}

        {employeeRecordTab === "attendance" && (
          <>
            <SectionHeader title="Attendance Marks" count={selectedEmployeeAttendanceRows.length}>
              <Btn variant="secondary" size="sm" onClick={() => nav("attendance", { employeeId: selectedLaborEmployeeKey, tab: "history" })} disabled={!selectedLaborEmployeeKey}>Open Attendance</Btn>
            </SectionHeader>
            {selectedEmployeeAttendanceRows.length === 0 ? (
              <Card style={{ padding: 18, color: C.textMut, fontSize: 13 }}>No attendance marks recorded for this employee.</Card>
            ) : (
              <Card style={{ padding: 0, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={employeeDetailTableHeaderStyle}>Date</th>
                      <th style={employeeDetailTableHeaderStyle}>Mark</th>
                      <th style={employeeDetailTableHeaderStyle}>Detail</th>
                      <th style={employeeDetailTableHeaderStyle}>Logged By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedEmployeeAttendanceRows.map((incident) => (
                      <tr key={incident.id} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                        <td style={{ padding: "11px 12px", fontSize: 12, color: C.text, fontWeight: 700 }}>{incident.incident_date ? formatLaborDate(incident.incident_date) : "—"}</td>
                        <td style={{ padding: "11px 12px", fontSize: 12, color: C.textSec }}>{getAttendanceIncidentLabel(incident.incident_type)}</td>
                        <td style={{ padding: "11px 12px", fontSize: 12, color: C.textSec }}>{incident.detail || "—"}</td>
                        <td style={{ padding: "11px 12px", fontSize: 12, color: C.textMut }}>{incident.created_by_name || "Staff"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </>
        )}

        {employeeRecordTab === "history" && (
          <>
            <SectionHeader title="Employee History" count={selectedEmployeeHistoryTimeline.length} />
            {selectedEmployeeHistoryTimeline.length === 0 ? (
              <Card style={{ padding: 18, color: C.textMut, fontSize: 13 }}>No employee history has been recorded yet.</Card>
            ) : (
              <Card style={{ padding: 0, overflow: "hidden" }}>
                {selectedEmployeeHistoryTimeline.map((item, index) => {
                  const noteDocuments = item.note?.id
                    ? selectedEmployeeDocuments.filter((document) => document.labor_employee_note_id === item.note.id)
                    : [];
                  const itemDocuments = item.document ? [item.document] : noteDocuments;
                  const oldNewVisible = item.oldValue || item.newValue;
                  return (
                    <div
                      key={item.id}
                      style={{
                        padding: "14px 16px",
                        borderTop: index === 0 ? "none" : `1px solid ${C.borderLight}`,
                        display: "grid",
                        gridTemplateColumns: "120px minmax(0, 1fr) 170px",
                        gap: 14,
                        alignItems: "start",
                      }}
                    >
                      <div>
                        <Badge color={item.tone === "danger" ? "danger" : "default"}>{String(item.category || "history").replace(/_/g, " ")}</Badge>
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 900, color: C.text }}>{item.title}</div>
                        {item.summary ? (
                          <div style={{ fontSize: 12, color: C.textSec, marginTop: 5, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{item.summary}</div>
                        ) : null}
                        {oldNewVisible ? (
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8, fontSize: 11, color: C.textMut, fontWeight: 800 }}>
                            {item.oldValue ? <span>From: {item.oldValue}</span> : null}
                            {item.newValue ? <span>To: {item.newValue}</span> : null}
                          </div>
                        ) : null}
                        {itemDocuments.length > 0 && (
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                            {itemDocuments.map((document) => renderEmployeeDocumentButton(document))}
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign: "right", color: C.textMut, fontSize: 11, fontWeight: 700 }}>
                        <div style={{ color: C.text, fontSize: 12 }}>{item.actorName || "Staff"}</div>
                        <div style={{ marginTop: 4 }}>{formatTrainingTimestamp(item.occurredAt)}</div>
                      </div>
                    </div>
                  );
                })}
              </Card>
            )}
          </>
        )}

        {trainingRequirementEditor && (
          <Modal title={`Update ${trainingRequirementEditor.label}`} onClose={() => setTrainingRequirementEditor(null)}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <Inp label="Completed On" type="date" value={trainingRequirementCompletedOn} onChange={setTrainingRequirementCompletedOn} required />
              {trainingRequirementEditor.slug === LABOR_TRAINING_REQUIREMENT_SLUGS.CPR && (
                <>
                  <Inp label="Expires On" type="date" value={trainingRequirementExpiresOn} onChange={setTrainingRequirementExpiresOn} />
                  <Inp label="Certification URL" value={trainingRequirementDocumentUrl} onChange={setTrainingRequirementDocumentUrl} />
                </>
              )}
              <input
                ref={trainingRequirementFileInputRef}
                type="file"
                accept={LABOR_TRAINING_REQUIREMENT_PDF_ACCEPT}
                onChange={handleTrainingRequirementEvidenceFileChange}
                style={{ display: "none" }}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <Btn variant="secondary" size="sm" icon={<I.FileText />} onClick={() => trainingRequirementFileInputRef.current?.click()}>
                  Upload PDF
                </Btn>
                {trainingRequirementEvidenceFile ? (
                  <span style={{ fontSize: 12, color: C.textSec, fontWeight: 800 }}>
                    {trainingRequirementEvidenceFile.name}
                  </span>
                ) : trainingRequirementEditor.evidenceDocument ? (
                  renderEmployeeDocumentButton(trainingRequirementEditor.evidenceDocument)
                ) : null}
              </div>
              {trainingRequirementEvidenceError && (
                <div style={{ fontSize: 12, color: C.dan, fontWeight: 800 }}>{trainingRequirementEvidenceError}</div>
              )}
              <Inp label="Source Note" type="textarea" rows={3} value={trainingRequirementSourceNote} onChange={setTrainingRequirementSourceNote} />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <Btn variant="ghost" onClick={() => setTrainingRequirementEditor(null)}>Cancel</Btn>
                <Btn variant="primary" onClick={handleSaveTrainingRequirement} disabled={savingTrainingRequirement || !trainingRequirementCompletedOn}>
                  {savingTrainingRequirement ? "Saving..." : "Save Requirement"}
                </Btn>
              </div>
            </div>
          </Modal>
        )}

        {attachmentPreview && (
          <Modal
            title={attachmentPreview.document?.file_name || "Attachment Preview"}
            onClose={() => setAttachmentPreview(null)}
            fullWidth
          >
            <div style={{ height: "calc(100vh - 180px)", minHeight: 420, display: "flex", alignItems: "center", justifyContent: "center", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
              {attachmentPreview.kind === "image" ? (
                <img
                  src={attachmentPreview.url}
                  alt={attachmentPreview.document?.file_name || "Employee attachment"}
                  style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                />
              ) : (
                <iframe
                  title={attachmentPreview.document?.file_name || "Employee attachment"}
                  src={attachmentPreview.url}
                  style={{ width: "100%", height: "100%", border: "none", background: "#fff" }}
                />
              )}
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

  if (selectedRecordId && !selectedRecord) {
    return (
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px" }}>
        <button onClick={() => { setSelectedRecordId(null); setExpandedSections({}); }} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: C.pri, fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 16, fontFamily: "inherit", padding: 0 }}>
          <I.Back /> Back to Labor
        </button>
        <Card style={{ padding: 24 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginBottom: 8 }}>
            {loading ? "Loading training record..." : "Training record unavailable"}
          </div>
          <div style={{ fontSize: 13, color: C.textSec, lineHeight: 1.6 }}>
            {loading ? "Labor is still loading the selected training record." : "The selected training record is not present in the current labor data set."}
          </div>
        </Card>
      </div>
    );
  }

  if (selectedRecordId && selectedRecord) {
    const recordProgress = safeTrainingProgress(selectedRecord.progress_percent);
    const requiredCompletedCount = Number.isFinite(Number(selectedRecord.required_item_completed_count))
      ? Number(selectedRecord.required_item_completed_count)
      : 0;
    const requiredItemCount = Number.isFinite(Number(selectedRecord.required_item_count))
      ? Number(selectedRecord.required_item_count)
      : 0;
    const recordEmployeeName = selectedRecord.employee_full_name || selectedLaborEmployeeView?.full_name || "Employee";
    const recordTargetRole = selectedRecord.target_role || selectedLaborEmployeeView?.position_title || "Employee";
    const recordTemplateName = selectedRecord.template_name_snapshot || selectedVersion?.name || "Training Plan";

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
              <div style={{ fontSize: 22, fontWeight: 800, color: C.text, marginBottom: 4 }}>{recordEmployeeName}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                <Badge color="primary">Position: {recordTargetRole}</Badge>
                <Badge color="default">Training Plan: {recordTemplateName}</Badge>
                {selectedLaborEmployeeSnapshot?.employment_status && (
                  <Badge color={selectedLaborEmployeeSnapshot?.is_active ? "success" : "warning"}>
                    {String(selectedLaborEmployeeSnapshot?.employment_status || "inactive").replace(/_/g, " ")}
                  </Badge>
                )}
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12, color: C.textMut, alignItems: "center" }}>
                {selectedRecord.hire_date && <span>Hire: {formatLaborDate(selectedRecord.hire_date)}</span>}
                {selectedRecord.training_start_date && <span>Start: {formatLaborDate(selectedRecord.training_start_date)}</span>}
                {selectedRecord.target_end_date && <span>Target: {formatLaborDate(selectedRecord.target_end_date)}</span>}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <StatusBadge status={selectedRecord.overall_status} />
              <div style={{ marginTop: 8, fontSize: 24, fontWeight: 800, color: C.pri }}>{Math.round(recordProgress)}%</div>
              <div style={{ fontSize: 11, color: C.textMut }}>{requiredCompletedCount} / {requiredItemCount} items</div>
              <div style={{ marginTop: 10 }}>
                <Btn variant="secondary" size="sm" onClick={openRecordConfigModal}>Edit Configuration</Btn>
              </div>
            </div>
          </div>
          <div style={{ marginTop: 12 }}><ProgressBar percent={recordProgress} height={8} /></div>
        </Card>

        {/* Sections */}
        <SectionHeader title="Training Plan" count={recordSections.length} />
        {recordSections.length === 0 ? (
          <Card style={{ padding: 18, marginBottom: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.text, marginBottom: 6 }}>
              {trainingBundleLoading ? "Loading training plan..." : "Training plan unavailable"}
            </div>
            <div style={{ fontSize: 13, color: C.textSec, lineHeight: 1.5 }}>
              {trainingBundleLoading
                ? "The record is open while its template sections are still loading."
                : "This record references a template version that is not present in the loaded training bundle. The record details are still available above."}
            </div>
          </Card>
        ) : recordSections.map(sec => {
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
                  const employee = toObjectRows(laborEmployees).find((entry) => entry.id === value);
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
	      onClick={() => {
	        setSelectedLaborEmployeeId(null);
	        setSelectedLaborEmployeeSeed(null);
	        setSelectedRecordId(rec.id);
	      }}
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
      <td style={{ padding: "10px 12px", fontSize: 12, color: C.textMut }}>{rec.target_end_date ? formatLaborDate(rec.target_end_date) : "—"}</td>
    </tr>
  );

	  const tableHeaderStyle = { padding: "9px 10px", fontSize: 10.5, fontWeight: 900, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.08em", borderBottom: `2px solid ${C.border}`, textAlign: "left", whiteSpace: "nowrap" };
	  const rosterCellStyle = { padding: "12px 10px", fontSize: 12.5, lineHeight: 1.35, fontWeight: 700, color: C.text, verticalAlign: "middle" };
	  const rosterSecondaryCellStyle = { ...rosterCellStyle, color: C.textSec, fontWeight: 650 };
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
	    setRosterDraftFilters(DEFAULT_ROSTER_FILTERS);
	    setRosterFilters(DEFAULT_ROSTER_FILTERS);
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
  const handleHierarchyDrop = async (targetTitle) => {
    if (!draggingHierarchyTitle || draggingHierarchyTitle === targetTitle) return;
    const reordered = [...hierarchyDraft];
    const fromIndex = reordered.findIndex((row) => row.normalized_title === draggingHierarchyTitle);
    const toIndex = reordered.findIndex((row) => row.normalized_title === targetTitle);
    if (fromIndex === -1 || toIndex === -1) {
      setDraggingHierarchyTitle("");
      return;
    }
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    setHierarchyDraft(reordered);
    setDraggingHierarchyTitle("");
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
      return <Btn variant="primary" onClick={async () => { await loadTrainingBundle(); setShowNewRecord(true); }}>New Training Record</Btn>;
    }
    if (tab === "templates" && canManageTemplates) {
      if (previewTemplateId) {
        return (
          <Btn variant="primary" onClick={handleCreateTemplateDraft} disabled={savingTemplateAction === "draft"}>
            {savingTemplateAction === "draft" ? "Cloning..." : "New Draft"}
          </Btn>
        );
      }
      return <Btn variant="primary" onClick={async () => { await loadTrainingBundle(); setShowCreateTemplateModal(true); }}>Add Template</Btn>;
    }
    if (tab === "attendance") {
      return null;
    }
    if (tab === "notes") {
      return <Btn variant="primary" onClick={() => setShowGlobalNoteModal(true)}>Add Employee Note</Btn>;
    }
    return null;
  })();

  return (
    <div style={{ maxWidth: 1340, margin: "0 auto", padding: "20px 10px" }}>
	      <style>{`
        html { scrollbar-gutter: stable; }
        body { overflow-y: auto; scrollbar-width: none; -ms-overflow-style: none; }
        body::-webkit-scrollbar { width: 0; height: 0; }
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
            <MetricCard label="Active Employees" value={displayedDashboardMetrics.activeEmployeeCount} color={C.pri} />
            <MetricCard label="Notes In 30 Days" value={displayedDashboardMetrics.employeeNoteCount30d} color={C.acc} />
            <MetricCard label="New Hires In 30 Days" value={displayedDashboardMetrics.newHireCount30d} color={C.suc} />
            <MetricCard label="Terminations In 30 Days" value={displayedDashboardMetrics.terminationCount30d} color={C.dan} />
            <MetricCard label="Active Trainees" value={displayedDashboardMetrics.activeTraineeCount} color={C.warn} />
            <MetricCard label="Attendance Marks In 30 Days" value={displayedDashboardMetrics.attendanceMarkCount30d} color={C.text} />
            <MetricCard
              label="Training Compliance"
              value={`${displayedDashboardMetrics.trainingComplianceScore}%`}
              helper={`${displayedDashboardMetrics.trainingComplianceNumerator}/${displayedDashboardMetrics.trainingComplianceDenominator || 0} active employees compliant`}
              color={displayedDashboardMetrics.trainingComplianceScore === 100 ? C.suc : C.warn}
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
                    setRosterDraftFilters(DEFAULT_ROSTER_FILTERS);
                    setRosterFilters(DEFAULT_ROSTER_FILTERS);
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
                variant={rosterSort.key === "hierarchy" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setRosterSort({ key: "hierarchy", direction: "asc" })}
              >
                Hierarchy
              </Btn>
              <Btn variant="ghost" size="sm" onClick={() => setShowHierarchyManager(true)}>
                Manage Hierarchy
              </Btn>
              <Btn
                variant={showRosterFilterPanel || Object.keys(rosterFilters).length > 0 ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setShowRosterFilterPanel((current) => !current)}
              >
                Filter{Object.keys(rosterFilters).length > 0 ? ` (${Object.keys(rosterFilters).length})` : ""}
              </Btn>
              <Btn
                variant="secondary"
                size="sm"
                icon={<I.Download />}
                onClick={handleDownloadActiveLaborContactCards}
                disabled={contactCardDownloadKey === "bulk" || activeContactCardEmployees.length === 0}
              >
                {contactCardDownloadKey === "bulk" ? "Downloading..." : "Download Active Contacts"}
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
                Employees hired within the last {TRAINING_GRACE_PERIOD_DAYS} days show as <strong>In Progress</strong> while training requirements are being completed.
              </div>
            </Card>
          )}
          {sortedRosterRows.length === 0 && !showInlineLaborEmployeeComposer ? (
            <EmptyState icon="Users" title="No employees yet" subtitle="Add your first employee to start using labor management." />
          ) : (
            <Card style={{ padding: 0, overflowX: "auto", overflowY: "hidden", marginBottom: 24 }}>
              <table style={{ width: "100%", minWidth: 1460, borderCollapse: "collapse" }}>
                <thead><tr>
	                  {[
	                    { key: "first_name", label: "First Name" },
	                    { key: "last_name", label: "Last Name" },
	                    { key: "phone", label: "Phone" },
	                    { key: "email", label: "Email" },
	                    { key: "position", label: "Position" },
	                    { key: "start_date", label: "Start Date" },
	                    { key: "review30", label: "30-Day" },
	                    { key: "review60", label: "60-Day" },
	                    { key: "review90", label: "90-Day" },
	                    { key: "training", label: "Training" },
	                    { key: "notes", label: "Notes" },
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
                          <div style={{ display: "grid", gridTemplateColumns: "minmax(132px, 1fr) minmax(132px, 1fr) minmax(148px, 1fr) minmax(210px, 1.4fr) minmax(190px, 1.25fr) minmax(168px, 1fr) minmax(168px, 1fr) auto", gap: 10, alignItems: "end" }}>
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
                    const rowEmployeeId = getLaborEmployeeRowId(row);
                    return (
	                      <tr
	                        key={rowEmployeeId || row.full_name || row.position_title}
	                        role="button"
	                        tabIndex={rowEmployeeId ? 0 : -1}
	                        aria-label={`Open ${row.full_name || "employee"} record`}
	                        onClick={() => { if (rowEmployeeId) openLaborEmployeeProfile(rowEmployeeId, row); }}
	                        onKeyDown={(event) => {
	                          if (event.key === "Enter" || event.key === " ") {
	                            event.preventDefault();
	                            if (rowEmployeeId) openLaborEmployeeProfile(rowEmployeeId, row);
	                          }
	                        }}
	                        onMouseEnter={(event) => { event.currentTarget.style.background = C.surfaceHover; }}
	                        onMouseLeave={(event) => { event.currentTarget.style.background = "transparent"; }}
	                        style={{
	                          borderBottom: `1px solid ${C.borderLight}`,
	                          animation: rowEmployeeId === justCreatedLaborEmployeeId ? "laborRosterFreshRow 1.8s ease-out" : "none",
	                          cursor: rowEmployeeId ? "pointer" : "default",
	                          transition: "background 0.15s ease",
	                        }}
	                      >
	                        <td style={rosterCellStyle}>{row.first_name || "—"}</td>
	                        <td style={rosterCellStyle}>{row.last_name || "—"}</td>
	                        <td style={{ ...rosterSecondaryCellStyle, whiteSpace: "nowrap", minWidth: 118, color: row.contact_phone ? C.textSec : C.textMut }}>
	                          {row.contact_phone ? fmtPhoneInput(row.contact_phone) : "—"}
	                        </td>
                        <td
                          title={row.contact_email || ""}
                          style={{ ...rosterSecondaryCellStyle, color: row.contact_email ? C.textSec : C.textMut, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 220 }}
                        >
                          {row.contact_email || "—"}
                        </td>
	                        <td style={{ ...rosterSecondaryCellStyle, minWidth: 152 }}>{row.position_title || "—"}</td>
	                        <td style={{ ...rosterSecondaryCellStyle, whiteSpace: "nowrap" }}>
	                          {formatLaborDate(row.start_date)}
	                          {!row.is_active && row.end_date ? (
	                            <div style={{ fontSize: 11, color: C.textMut, marginTop: 4, whiteSpace: "nowrap", fontWeight: 700 }}>Inactive since {formatLaborDate(row.end_date)}</div>
	                          ) : null}
	                        </td>
	                        {["review30", "review60", "review90"].map((reviewKey) => (
	                          <td key={reviewKey} style={{ ...rosterCellStyle, paddingTop: 10, paddingBottom: 10 }}>
	                            <div
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                justifyContent: "center",
                                minWidth: 76,
                                padding: "6px 9px",
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
	                        <td style={{ ...rosterCellStyle, paddingTop: 10, paddingBottom: 10 }}>
	                          <Badge color={row.training_compliance.color}>{row.training_compliance.label}</Badge>
	                        </td>
	                        <td style={{ ...rosterCellStyle, color: C.text, textAlign: "center", fontWeight: 900 }}>
	                          {Number(row.employee_note_count || 0)}
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

      {!loading && tab === "attendance" && (
        <div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
            {[
              { id: "input", label: "Attendance Input", subtitle: "Attendance marks and policy actions" },
              { id: "summary", label: "Attendance Summary", subtitle: "Summary, history, and reference guidance" },
            ].map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setAttendanceView(option.id)}
                style={{
                  flex: "1 1 260px",
                  minWidth: 220,
                  padding: "14px 16px",
                  borderRadius: 14,
                  border: `1.5px solid ${attendanceView === option.id ? C.pri : C.border}`,
                  background: attendanceView === option.id ? C.priLt : C.surface,
                  color: attendanceView === option.id ? C.pri : C.text,
                  textAlign: "left",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 800 }}>{option.label}</div>
                <div style={{ fontSize: 12, color: C.textMut, marginTop: 4 }}>{option.subtitle}</div>
              </button>
            ))}
          </div>

          <AttendanceTrackerPage
            data={data}
            save={save}
            nav={nav}
            profile={profile}
            addGlobalToast={addGlobalToast}
            params={{ tab: attendanceView === "input" ? "log" : "summary" }}
            embedded
            tabPreset={attendanceView}
          />
        </div>
      )}

      {!loading && tab === "training" && (
        <div>
          {trainingBundleLoading && !trainingBundleLoaded ? (
            <Card style={{ padding: 24, textAlign: "center", color: C.textMut, marginBottom: 16 }}>Loading training records…</Card>
          ) : null}
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
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[
                { id: "all", label: "All" },
                { id: "active", label: "Active" },
                { id: "inactive", label: "Inactive" },
              ].map((option) => (
                <Btn
                  key={option.id}
                  variant={templateStatusFilter === option.id ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setTemplateStatusFilter(option.id)}
                >
                  {option.label}
                </Btn>
              ))}
            </div>
            {canManageTemplates && (
              <Btn variant="primary" size="sm" onClick={() => setShowCreateTemplateModal(true)}>New Template</Btn>
            )}
          </div>
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
	                            <td style={{ padding: "12px 14px", fontSize: 13, fontWeight: 700, color: C.pri }}>
                                {row.name}
                                {row.is_active === false && <span style={{ marginLeft: 8, fontSize: 11, color: C.textMut, fontWeight: 700 }}>Inactive</span>}
                              </td>
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
	                {previewTemplate.version && (
	                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12, color: C.textMut }}>
	                    <span>Version {previewTemplate.version.version_no}</span>
	                    {previewTemplate.version.published_at && <span>Published: {formatTrainingTimestamp(previewTemplate.version.published_at)}</span>}
	                  </div>
	                )}
	              </div>
	              <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
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
	                        variant="danger"
	                        size="sm"
	                        onClick={handleDeleteTemplateDraft}
	                        disabled={savingTemplateAction === "delete-draft"}
	                      >
	                        {savingTemplateAction === "delete-draft" ? "Deleting..." : "Delete Draft"}
	                      </Btn>
	                    )}
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
	                    <Btn
	                      variant="ghost"
	                      size="sm"
	                      onClick={handleToggleTemplateActive}
	                      disabled={savingTemplateAction === "activate" || savingTemplateAction === "deactivate"}
	                    >
	                      {previewTemplate.is_active === false
	                        ? (savingTemplateAction === "activate" ? "Marking Active..." : "Mark Active")
	                        : (savingTemplateAction === "deactivate" ? "Marking Inactive..." : "Mark Inactive")}
	                    </Btn>
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
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Btn variant={templateManageStructure ? "secondary" : "ghost"} size="sm" onClick={() => setTemplateManageStructure((current) => !current)}>
                    {templateManageStructure ? "Done Managing" : "Manage Structure"}
                  </Btn>
	                <Btn variant="secondary" size="sm" onClick={() => handleAddTemplateSection(null)}>Add Section</Btn>
                </div>
	            )}
	          </SectionHeader>
	          {previewTemplate.kind === "review" ? previewTemplate.sections.map((sec) => {
	            const isOpen = templateManageStructure || expandedSections[`review_${sec.id}`];
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
	                            <Btn variant="ghost" size="sm" onClick={() => handleMoveTemplateSection(sec.id, -1)}>Move Up</Btn>
	                            <Btn variant="ghost" size="sm" onClick={() => handleMoveTemplateSection(sec.id, 1)}>Move Down</Btn>
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
	            const isOpen = templateManageStructure || expandedSections[`tpl_${sec.id}`];
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
	                            <Btn variant="ghost" size="sm" onClick={() => handleMoveTemplateSection(sec.id, -1)}>Move Up</Btn>
	                            <Btn variant="ghost" size="sm" onClick={() => handleMoveTemplateSection(sec.id, 1)}>Move Down</Btn>
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
	                                <Btn variant="ghost" size="sm" onClick={() => handleMoveTemplateSection(child.id, -1)}>Move Up</Btn>
	                                <Btn variant="ghost" size="sm" onClick={() => handleMoveTemplateSection(child.id, 1)}>Move Down</Btn>
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
          {supportBundleLoading && !supportBundleLoaded ? (
            <Card style={{ padding: 24, textAlign: "center", color: C.textMut, marginBottom: 16 }}>Loading employee notes…</Card>
          ) : null}
          <SectionHeader title="Global Notes Feed" count={filteredGlobalNotes.length}>
            <Btn variant="secondary" size="sm" onClick={() => setShowGlobalNoteModal(true)}>Add Employee Note</Btn>
          </SectionHeader>
	          <Card style={{ padding: 16, marginBottom: 16 }}>
	            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
	              <Inp
	                label="Search Notes"
	                value={noteSearchText}
	                onChange={setNoteSearchText}
	                placeholder="Search note text, employee, author, source"
	              />
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
                  {toObjectRows(note.documents || []).length > 0 && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                      {toObjectRows(note.documents || []).map((document) => renderEmployeeDocumentButton(document))}
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                    <Btn variant="ghost" size="sm" onClick={() => openLaborEmployeeProfile(note.employeeId)}>Open Employee</Btn>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {showHierarchyManager && (
        <Modal title="Manage Hierarchy" onClose={() => setShowHierarchyManager(false)}>
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ fontSize: 13, color: C.textMut, lineHeight: 1.5 }}>
              Drag the current resort's position titles into seniority order. This becomes the default roster view, and the <strong>Hierarchy</strong> button restores it after any other sort.
            </div>
            {hierarchyDraft.length === 0 ? (
              <EmptyState icon="Users" title="No positions found" subtitle="Add employees to the roster before configuring hierarchy." />
            ) : (
              <div style={{ display: "grid", gap: 10, maxHeight: "56vh", overflowY: "auto", paddingRight: 4 }}>
                {hierarchyDraft.map((row, index) => (
                  <div
                    key={row.normalized_title}
                    draggable
                    onDragStart={() => setDraggingHierarchyTitle(row.normalized_title)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => handleHierarchyDrop(row.normalized_title)}
                    onDragEnd={() => setDraggingHierarchyTitle("")}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "auto auto minmax(0, 1fr)",
                      gap: 12,
                      alignItems: "center",
                      padding: "12px 14px",
                      borderRadius: 12,
                      border: `1px solid ${draggingHierarchyTitle === row.normalized_title ? C.pri : C.border}`,
                      background: draggingHierarchyTitle === row.normalized_title ? C.priLt : "#fff",
                    }}
                  >
                    <div style={{ minWidth: 24, fontSize: 11, fontWeight: 800, color: C.textMut }}>{index + 1}</div>
                    <span style={{ display: "inline-flex", color: C.textMut, cursor: "grab" }} title="Drag to reorder">
                      <I.GripVertical />
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{row.position_title}</div>
                      {!Number.isFinite(row.sort_order) ? (
                        <div style={{ fontSize: 11, color: C.textMut, marginTop: 3 }}>Unranked title. Saving this modal will pin it into the default resort hierarchy.</div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Btn variant="ghost" onClick={() => setShowHierarchyManager(false)}>Cancel</Btn>
              <Btn variant="primary" onClick={saveHierarchy} disabled={savingHierarchy}>
                {savingHierarchy ? "Saving…" : "Save Hierarchy"}
              </Btn>
            </div>
          </div>
        </Modal>
      )}

      {showNewRecord && (
        <Modal title="New Training Record" onClose={() => { setShowNewRecord(false); resetNewRecordForm(); }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <CustomSelect
              value={newLaborEmployeeId}
              onChange={(value) => {
                setNewLaborEmployeeId(value);
                const employee = toObjectRows(laborEmployees).find((entry) => entry.id === value);
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
