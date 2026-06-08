import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../../supabaseClient";
import { C } from "../../shared/theme";
import { I } from "../../shared/icons";
import { Badge, Btn, CalendarPicker, Card, CustomSelect, Modal, LogEntryModal, RecordActivityModal } from "../../shared/ui";
import { hasLeanPermission } from "../../shared/permissions";
import {
  GRASSROOTS_CATEGORY_CONFIGS,
  GRASSROOTS_ACTIVITY_ATTACHMENT_ACCEPT,
  GRASSROOTS_ACTIVITY_ATTACHMENT_BUCKET,
  GRASSROOTS_ACTIVITY_ATTACHMENT_MAX_FILES,
  buildGrassrootsActivityAttachmentPath,
  buildGrassrootsDropCategoryCounts,
  buildGrassrootsDropActivityRows,
  GRASSROOTS_BUSINESS_CATEGORY_OPTIONS,
  GRASSROOTS_VISIT_OUTCOME_OPTIONS,
  GRASSROOTS_VISIT_MATERIALS_OPTIONS,
  parseGrassrootsMaterialsLeft,
  toggleGrassrootsMaterial,
  GRASSROOTS_EVENT_SAVE_RPC,
  GRASSROOTS_EVENT_TYPE_OPTIONS,
  GRASSROOTS_FILTER_OP_LABELS,
  GRASSROOTS_STATUS_OPTIONS,
  applyGrassrootsFilters,
  buildGrassrootsDropMetrics,
  buildGrassrootsEventSaveRpcArgs,
  buildGrassrootsEventMetrics,
  calculateGrassrootsCpl,
  compareGrassrootsEventSchedule,
  formatGrassrootsAttachmentFileSize,
  getGrassrootsActivityCount,
  getGrassrootsAttachmentPreviewKind,
  getGrassrootsActivityType,
  getGrassrootsBusinessCategory,
  getGrassrootsCategoryConfig,
  getGrassrootsDefaultFilters,
  normalizeGrassrootsEventLinks,
  getGrassrootsSplitAddress,
  getGrassrootsNextDate,
  getGrassrootsPrimaryEventDate,
  getGrassrootsFinalEventDate,
  summarizeGrassrootsEventDates,
  getGrassrootsStatusLabel,
  isGrassrootsEventClosed,
  getGrassrootsEventCloseout,
  isGrassrootsEventInPastView,
  canCloseGrassrootsEvent,
  makeGrassrootsEventCloseout,
  compareGrassrootsHistoryDesc,
  filterGrassrootsHistory,
  groupGrassrootsActivityAttachments,
  groupGrassrootsActivities,
  inferGrassrootsActivityAttachmentMimeType,
  filterGrassrootsDropActivityRowsByCategory,
  makeBlankGrassrootsTarget,
  normalizeGrassrootsEventDates,
  normalizeGrassrootsEventType,
  normalizeGrassrootsStatus,
  resolveGrassrootsTargetIsActive,
  searchGrassrootsDropBusinessTargets,
  validateGrassrootsActivityAttachmentFiles,
} from "../grassrootsData";
import {
  parseGooglePlaceAddress,
  extractGooglePlaceBusinessName,
  inferGrassrootsBusinessCategoryFromPlace,
  buildGrassrootsLegacyAddressFromSplitAddress,
  getGrassrootsVisibleAddressLine,
  copyGrassrootsTextToClipboard,
  cleanGooglePlaceBusinessLabel,
} from "../grassrootsAddress";
import { normalizeOptionalUuid } from "../trainingData";
import { ensureDirectoryOrgByName, fetchDirectoryOrgNames } from "../marketingDirectorySync";
import {
  todayStr,
  addDays,
  fmtDate,
  fmtMonthYear,
  fmtEventDayLine,
  fmtWeekdayLong,
  fmtWeekdayShort,
  fmtClock,
  fmtClockRange,
  fmtEventDateRange,
  fmtDateTime,
  fmtTime,
  parseNumberField,
  fmtCurrencyNumber,
} from "./grassroots/dateUtils";
import { MarketingHistoryView } from "./grassroots/historyView";
import {
  loadGooglePlacesScript,
  getGooglePredictionSecondaryText,
  renderGooglePredictionText,
} from "./grassroots/googlePlaces";
import {
  BASE_FILTER_FIELDS,
  CATEGORY_FILTER_FIELDS,
  filterNeedsValue,
} from "./grassroots/filterFields";
import {
  usesBusinessCategoryColumn,
  usesNextDateColumn,
  getTrackerGridColumns,
  getGrassrootsColumnMap,
} from "./grassroots/columns";
import { StatusBadge, BusinessCategoryBadge, FilterIcon } from "./grassroots/badges";
import { EventDateCell } from "./grassroots/eventDateDisplay";
import { INPUT_STYLE, Label } from "./grassroots/primitives";
import {
  EventTypePicker,
  FieldEditor,
} from "./grassroots/formControls";
import { createGrassrootsClientUuid, scrollGrassrootsEditorIntoView } from "./grassroots/editorDom";
import { buildTargetPayload, buildEditorDraft } from "./grassroots/targetPayload";
import { activityActorName, AttachmentButtons, ActivityList } from "./grassroots/activityList";
import {
  OrganizerAutocomplete,
  SplitAddressFields,
} from "./grassroots/addressInputs";
import { EventDateEditor } from "./grassroots/eventEditors";
import { TargetEditor, EventTargetInlineEditor } from "./grassroots/targetEditors";
import { DenseGrassrootsTable } from "./grassroots/denseTable";
import { LogActivityModal } from "./grassroots/logActivityModal";

function looksLikeCompleteGrassrootsAddress(value) {
  return /,\s*[^,]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?(?:,\s*[^,]+)?$/i.test(String(value || "").trim());
}

function EventDateSortHeader({ direction, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={`Sort event dates ${direction === "asc" ? "latest first" : "next event first"}`}
      style={{
        ...HEADER_CELL_STYLE,
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        border: "none",
        background: "transparent",
        padding: 0,
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      <span>Event Date</span>
      {direction === "asc" ? <I.SortAsc /> : <I.SortDesc />}
    </button>
  );
}

function TrackerHeader({ categoryConfig, eventDateSortDirection, onToggleEventDateSort }) {
  const gridColumns = getTrackerGridColumns(categoryConfig);
  const showNextDateColumn = usesNextDateColumn(categoryConfig);
  return (
    <div style={{ display: "grid", gridTemplateColumns: gridColumns, alignItems: "center", gap: 10, padding: "0 14px 0", minHeight: 22, boxSizing: "border-box" }}>
      <div />
      <div style={HEADER_CELL_STYLE}>{categoryConfig.nameLabel}</div>
      {usesBusinessCategoryColumn(categoryConfig) && <div style={HEADER_CELL_STYLE}>Category</div>}
      {categoryConfig.usesStatus !== false && <div style={HEADER_CELL_STYLE}>Status</div>}
      {categoryConfig.id === "events" && <EventDateSortHeader direction={eventDateSortDirection} onToggle={onToggleEventDateSort} />}
      {showNextDateColumn && <div style={HEADER_CELL_STYLE}>Next Contact</div>}
      {categoryConfig.id !== "events" && <div style={{ ...HEADER_CELL_STYLE, textAlign: "center" }}>{categoryConfig.countLabel}</div>}
      <div style={{ ...HEADER_CELL_STYLE, textAlign: "left" }}>Actions</div>
    </div>
  );
}

const HEADER_CELL_STYLE = {
  fontSize: 10,
  fontWeight: 900,
  color: C.textMut,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  whiteSpace: "nowrap",
};

function TrackerRow({ target, index, categoryConfig, activities, attachmentsByActivity = {}, isExpanded, isFresh = false, canLog, canEdit, onToggleUpdates, onLog, onMove, onEdit, onPreviewAttachment, previewingAttachmentId }) {
  const activityCount = getGrassrootsActivityCount(target, { [target.id]: activities });
  const nextDate = getGrassrootsNextDate(target, { [target.id]: activities });
  const gridColumns = getTrackerGridColumns(categoryConfig);
  const showNextDateColumn = usesNextDateColumn(categoryConfig);
  const title = target.name || categoryConfig.emptyName;
  const meta = [
    target.address,
    [target.first_name, target.last_name].filter(Boolean).join(" "),
    target.contact_source,
    getGrassrootsPrimaryEventDate(target) ? `Event ${fmtDate(getGrassrootsPrimaryEventDate(target))}` : "",
  ].filter(Boolean).slice(0, 2).join(" • ");

  return (
    <Card style={{ padding: 0, overflow: "hidden", borderRadius: 12, position: "relative", animation: isFresh ? "grassrootsFreshRow 1.8s ease-out both" : undefined }}>
      <div style={{ display: "grid", gridTemplateColumns: gridColumns, alignItems: "center", gap: 8, padding: "5px 12px", minHeight: 44, boxSizing: "border-box" }}>
        <div style={{ width: 30, height: 30, borderRadius: 10, display: "grid", placeItems: "center", background: target.is_active === false ? C.bg : C.pri, color: target.is_active === false ? C.textMut : "#fff", fontSize: 12, fontWeight: 900 }}>
          {index + 1}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
          <div style={{ marginTop: 2, fontSize: 10, color: C.textMut, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{meta || categoryConfig.singular}</div>
        </div>
        {usesBusinessCategoryColumn(categoryConfig) && <BusinessCategoryBadge value={getGrassrootsBusinessCategory(target)} />}
        {categoryConfig.usesStatus !== false && <StatusBadge status={target.status} />}
        {categoryConfig.id === "events" && <EventDateCell target={target} />}
        {showNextDateColumn && (
          <div style={{ fontSize: 12, fontWeight: 800, color: nextDate ? (nextDate < todayStr() ? C.dan : C.text) : C.textMut }}>
            {fmtDate(nextDate)}
          </div>
        )}
        {categoryConfig.id !== "events" && (
          <div style={{ display: "flex", justifyContent: "center" }}>
            <button
              type="button"
              onClick={onToggleUpdates}
              title={`${activityCount} ${categoryConfig.countLabel.toLowerCase()}; click for logged ${categoryConfig.countLabel.toLowerCase()}`}
              style={{ width: 32, height: 32, borderRadius: 10, border: "none", background: activityCount > 0 ? C.pri : C.bg, color: activityCount > 0 ? "#fff" : C.textMut, fontSize: 13, fontWeight: 900, cursor: "pointer", fontFamily: "inherit" }}
            >
              {activityCount}
            </button>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-start", gap: 6, flexWrap: "wrap" }}>
          {categoryConfig.id !== "events" && <Btn variant="secondary" size="sm" onClick={onLog} disabled={!canLog}>{categoryConfig.id === "drops" ? "Log Activity" : categoryConfig.logLabel}</Btn>}
          <Btn variant="ghost" size="sm" icon={<I.ChevronRight />} onClick={onMove} disabled={!canEdit}>Move</Btn>
          <Btn variant="ghost" size="sm" icon={<I.Edit />} onClick={onEdit} disabled={!canEdit}>Edit</Btn>
        </div>
      </div>
      {isExpanded && (
        <div style={{ borderTop: `1px solid ${C.borderLight}`, padding: "12px 18px", background: C.bg }}>
          <ActivityList
            activities={activities}
            categoryConfig={categoryConfig}
            attachmentsByActivity={attachmentsByActivity}
            onPreviewAttachment={onPreviewAttachment}
            previewingAttachmentId={previewingAttachmentId}
          />
        </div>
      )}
    </Card>
  );
}

function DropSubviewTabs({ value, onChange, activityCount, businessCount }) {
  const options = [
    { value: "activity", label: "Activity", count: activityCount },
    { value: "businesses", label: "Businesses", count: businessCount },
  ];
  const activeIndex = Math.max(0, options.findIndex((option) => option.value === value));
  return (
    <div
      className="grassroots-drop-subview-tabs"
      role="tablist"
      aria-label="Drop views"
      style={{
        "--grassroots-drop-view-count": options.length,
        "--grassroots-drop-view-active-index": activeIndex,
      }}
    >
      <div className="grassroots-drop-subview-indicator" aria-hidden="true" />
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            className={active ? "grassroots-drop-subview-tab is-active" : "grassroots-drop-subview-tab"}
            onClick={() => onChange(option.value)}
          >
            <span>{option.label}</span>
            <em>{option.count}</em>
          </button>
        );
      })}
    </div>
  );
}

function formatDropCategoryFilterLabel(category) {
  if (category === "Rescue") return "Rescuer";
  return category;
}

function DropCategoryFilter({ counts, value, onChange }) {
  if (!counts?.length) return null;
  return (
    <div className="grassroots-drop-category-filter" aria-label="Filter drop activity by business category">
      {counts.map((item) => {
        const active = value === item.category || (!value && item.category === "All");
        const label = formatDropCategoryFilterLabel(item.category);
        return (
          <button
            key={item.category}
            type="button"
            className={active ? "is-active" : ""}
            onClick={() => onChange(item.category)}
          >
            <span>{label}</span>
            <em>{item.count}</em>
          </button>
        );
      })}
    </div>
  );
}

function DropActivityView({
  rows,
  canLog,
  canEdit,
  onLog,
  onEdit,
  onPreviewAttachment,
  previewingAttachmentId,
  freshActivityId,
  expandedIds,
  onToggleExpanded,
  totalRows,
  categoryFilter,
}) {
  if (rows.length === 0) {
    const filteredEmpty = totalRows > 0 && categoryFilter && categoryFilter !== "All";
    const categoryLabel = formatDropCategoryFilterLabel(categoryFilter);
    return (
      <Card style={{ padding: 30, textAlign: "center", color: C.textMut, borderRadius: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 900, color: C.text, marginBottom: 6 }}>{filteredEmpty ? `No ${categoryLabel.toLowerCase()} visits in this view` : "No drop activity logged yet"}</div>
        <div style={{ fontSize: 13, marginBottom: 16 }}>{filteredEmpty ? "Choose another category or log a new visit." : "Log the visit first; the business rollup updates from that activity."}</div>
        <Btn variant="primary" size="sm" icon={<I.Plus />} onClick={() => onLog()} disabled={!canLog} style={{ padding: '6px 12px', fontSize: '12px', fontWeight: 600 }}>Log Activity</Btn>
      </Card>
    );
  }

  return (
    <Card style={{ padding: 0, overflow: "hidden", borderRadius: 14 }}>
      <div className="grassroots-drop-activity-header">
        <div>Date</div>
        <div>Business</div>
        <div>Summary</div>
        <div>Signals</div>
      </div>
      <div className="grassroots-drop-activity-list">
        {rows.map((row) => {
          const expanded = expandedIds?.has(row.id);
          const noteSummary = String(row.notes || "").trim();
          const summary = row.outcome || row.personSpokenWith || noteSummary || "Visit logged";
          const loggedTime = fmtTime(row.createdAt);
          return (
            <div
              key={row.id}
              className={`grassroots-drop-activity-row${freshActivityId === row.id ? " is-fresh" : ""}${expanded ? " is-expanded" : ""}`}
            >
              <div className="grassroots-drop-activity-date">
                <strong>{fmtDate(row.activityDate)}</strong>
                {loggedTime && <span>Logged {loggedTime}</span>}
              </div>
              <div className="grassroots-drop-activity-business">
                <strong>{row.businessName}</strong>
                <span>{[row.businessCategory, row.businessAddress].filter(Boolean).join(" · ") || "Drop business"}</span>
              </div>
              <div className="grassroots-drop-activity-summary">
                <strong>{summary}</strong>
                {noteSummary && <span>{noteSummary.length > 120 ? `${noteSummary.slice(0, 120)}...` : noteSummary}</span>}
              </div>
              <div className="grassroots-drop-activity-signals">
                <div className="grassroots-drop-activity-meta">
                  {row.followUpPriority && <span className="is-hot">Follow-up{row.nextDropDate ? ` ${fmtDate(row.nextDropDate)}` : ""}</span>}
                  {row.attachments.length > 0 && <span>{row.attachments.length} file{row.attachments.length === 1 ? "" : "s"}</span>}
                </div>
                <button type="button" onClick={() => onToggleExpanded(row.id)} className="grassroots-drop-expand-button" aria-expanded={expanded}>
                  {expanded ? "Hide" : "Details"} <I.ChevronRight />
                </button>
              </div>
              {expanded && (
                <div className="grassroots-drop-activity-detail">
                  <div className="grassroots-drop-activity-detail-grid">
                    {row.personSpokenWith && <div><Label>Spoke With</Label><strong>{row.personSpokenWith}</strong></div>}
                    {row.materialsLeft && <div><Label>Materials Left</Label><strong>{row.materialsLeft}</strong></div>}
                    {row.outcome && <div><Label>Outcome</Label><strong>{row.outcome}</strong></div>}
                    {row.followUpPriority && row.nextDropDate && <div><Label>Follow-Up Date</Label><strong>{fmtDate(row.nextDropDate)}</strong></div>}
                  </div>
                  <p>{row.notes || "No notes entered."}</p>
                  <AttachmentButtons attachments={row.attachments} onPreview={onPreviewAttachment} previewingAttachmentId={previewingAttachmentId} />
                  <div className="grassroots-drop-activity-detail-footer">
                    <span>Logged by {row.loggedBy}</span>
                    <div className="grassroots-drop-activity-detail-actions">
                      <Btn variant="secondary" size="sm" icon={<I.Edit />} onClick={() => onEdit(row)} disabled={!canEdit}>Edit</Btn>
                      {row.target && <Btn variant="secondary" size="sm" onClick={() => onLog(row.target)} disabled={!canLog}>Log Again</Btn>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function MetricCard({ label, value, color }) {
  return (
    <Card style={{ padding: 16, borderRadius: 12 }}>
      <div style={{ fontSize: 11, color: C.textMut, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 900, color }}>{value}</div>
    </Card>
  );
}

export default function GrassrootsPage({ profile, addGlobalToast = () => {} }) {
  const locationId = profile?.location_id || "";
  const canLogActivity = hasLeanPermission(profile, "Grassroots Log Activity");
  const canEditTargets = hasLeanPermission(profile, "Grassroots Edit Targets");
  const actor = useMemo(() => ({
    userId: normalizeOptionalUuid(profile?.user_id || profile?.id),
    name: profile?.name || profile?.full_name || profile?.email || "Staff",
  }), [profile?.email, profile?.full_name, profile?.id, profile?.name, profile?.user_id]);

  const [loading, setLoading] = useState(true);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [saveState, setSaveState] = useState("idle");
  // New lifecycle-style tab system (matching the old Customer Lifecycle layout the user loves)
  const [activeLifecycleTab, setActiveLifecycleTab] = useState("events"); // events | drops | corporate | apartments | ppp | all

  // Keep the old activeCategory alive during the transition.
  // The entire content rendering below (activeConfig, DenseGrassrootsTable, Drop logic, etc.)
  // still depends on it. We sync the two states in the new tab bar.
  const [activeCategory, setActiveCategory] = useState("events");

  // Filters for the new header (Events tab uses status pills)
  const [lifecycleSearch, setLifecycleSearch] = useState("");
  const [eventsStatusFilter, setEventsStatusFilter] = useState(null); // identified | corresponding | booked | abandoned
  const [showPastEvents, setShowPastEvents] = useState(false);

  // For Drops: Activity vs Business view (controlled by pill in the new header)
  const [dropSubview, setDropSubview] = useState("activity");
  const [dropActivityCategory, setDropActivityCategory] = useState("All");
  const [eventDateSortDirection, setEventDateSortDirection] = useState("asc");
  const [followUpSortDirection, setFollowUpSortDirection] = useState(null);
  const [costSortDirection, setCostSortDirection] = useState(null);
  const [targets, setTargets] = useState([]);
  // Directory org names suggested in the organizer field (tracker ↔ directory sync).
  const [directoryOrgNames, setDirectoryOrgNames] = useState([]);
  const organizerOptions = useMemo(() => {
    const set = new Set();
    targets.forEach((t) => { const o = String(t.organizer || "").trim(); if (o) set.add(o); });
    directoryOrgNames.forEach((name) => { if (name) set.add(name); });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [targets, directoryOrgNames]);
  const [activities, setActivities] = useState([]);
  const [activityAttachments, setActivityAttachments] = useState([]);
  const [attachmentsSchemaMissing, setAttachmentsSchemaMissing] = useState(false);
  const [history, setHistory] = useState([]);
  const [newDraft, setNewDraft] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const [savingDraft, setSavingDraft] = useState(false);
  // Per-column micro-editor (organizer / event / date) opened from a cell pencil.
  const [cellEditor, setCellEditor] = useState(null); // { targetId, group }
  // Event closeout modal.
  const [closeoutModal, setCloseoutModal] = useState(null); // { target }
  const [closeoutLeads, setCloseoutLeads] = useState("");
  const [closeoutNotes, setCloseoutNotes] = useState("");
  const [closeoutDisposition, setCloseoutDisposition] = useState("completed"); // completed | cancelled
  const [savingCloseout, setSavingCloseout] = useState(false);
  const [expandedUpdates, setExpandedUpdates] = useState(new Set());
  const [expandedDropActivities, setExpandedDropActivities] = useState(new Set());
  const [logModal, setLogModal] = useState(null);
  const [recordModalTarget, setRecordModalTarget] = useState(null);
  const [movePopover, setMovePopover] = useState(null);
  const [followUpInfo, setFollowUpInfo] = useState(null); // {targetId, followUpDate, setOn, x, y} — positioned from real click coords now
  const [logNotes, setLogNotes] = useState("");
  const [logDate, setLogDate] = useState("");
  const [logActivityDate, setLogActivityDate] = useState(todayStr());
  const [logContactName, setLogContactName] = useState("");
  const [logBusinessQuery, setLogBusinessQuery] = useState("");
  const [logSelectedTarget, setLogSelectedTarget] = useState(null);
  const [logBusinessDraft, setLogBusinessDraft] = useState(null);
  const [logMaterialsLeft, setLogMaterialsLeft] = useState("");
  const [logOutcome, setLogOutcome] = useState("");
  const [logFollowUpPriority, setLogFollowUpPriority] = useState(false);
  const [logPartnershipPotential, setLogPartnershipPotential] = useState(false);
  const [logFiles, setLogFiles] = useState([]);
  const [logFileErrors, setLogFileErrors] = useState([]);
  const [savingLog, setSavingLog] = useState(false);

  // Inline log composer (preferred over big full-screen modal per user feedback)
  const [inlineLoggingId, setInlineLoggingId] = useState(null);
  const [inlineLogNotes, setInlineLogNotes] = useState("");
  const [inlineLogNextDate, setInlineLogNextDate] = useState("");
  // Hold the actual target object the composer was opened for, so saving never
  // depends on re-finding it by id in a list that may be filtered/derived.
  const inlineLogTargetRef = useRef(null);

  // Stable handlers (perf nit fix for dense table + sort headers — prevents fresh arrow fns every render)
  const toggleUpdates = useCallback((id) => {
    setExpandedUpdates((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Start inline log composer inside the row's expansion area (no big modal)
  const startInlineLog = useCallback((target) => {
    inlineLogTargetRef.current = target;
    setInlineLoggingId(target.id);
    setInlineLogNotes("");
    setInlineLogNextDate(target.next_contact_date || "");
  }, []);
  // Open the shared record + activity modal (the clean white pop-up log view).
  const openRecordModal = useCallback((target) => {
    setRecordModalTarget(target);
  }, []);
  const toggleEventDateSort = useCallback(() => {
    setFollowUpSortDirection(null);
    setCostSortDirection(null);
    setEventDateSortDirection((current) => (current === "asc" ? "desc" : "asc"));
  }, []);
  const toggleFollowUpSort = useCallback(() => {
    setEventDateSortDirection("asc");
    setCostSortDirection(null);
    setFollowUpSortDirection((current) => (current === "asc" ? "desc" : current === "desc" ? null : "asc"));
  }, []);
  const toggleCostSort = useCallback(() => {
    setFollowUpSortDirection(null);
    setEventDateSortDirection("asc");
    // Default to most-expensive-first, then asc, then off.
    setCostSortDirection((current) => (current === "desc" ? "asc" : current === "asc" ? null : "desc"));
  }, []);
  const [freshActivityId, setFreshActivityId] = useState(null);
  const [attachmentPreview, setAttachmentPreview] = useState(null);
  const [previewingAttachmentId, setPreviewingAttachmentId] = useState(null);
  const [freshTargetId, setFreshTargetId] = useState(null);
  const [filters, setFilters] = useState(() => getGrassrootsDefaultFilters("events"));
  const [draftFilters, setDraftFilters] = useState(() => getGrassrootsDefaultFilters("events"));
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [historyCategoryFilter, setHistoryCategoryFilter] = useState("all");
  const [historyActorFilter, setHistoryActorFilter] = useState("all");
  const [showFilterPicker, setShowFilterPicker] = useState(false);
  const [configuringFilterKey, setConfiguringFilterKey] = useState(null);
  const [filterPickerReady, setFilterPickerReady] = useState(false);
  const prevFilterOpen = useRef(false);
  const freshTargetTimer = useRef(null);
  const freshActivityTimer = useRef(null);
  const newDraftScrollRef = useRef(null);
  const logComposerScrollRef = useRef(null);
  const logFileInputRef = useRef(null);

  const activeConfig = getGrassrootsCategoryConfig(activeCategory);
  const activitiesByTarget = useMemo(() => groupGrassrootsActivities(activities), [activities]);
  const attachmentsByActivity = useMemo(() => groupGrassrootsActivityAttachments(activityAttachments), [activityAttachments]);
  const categoryTargets = useMemo(() => targets.filter((target) => target.category === activeConfig.dbValue), [activeConfig.dbValue, targets]);
  const visibleTargets = useMemo(
    () => applyGrassrootsFilters(categoryTargets, activitiesByTarget, filters, todayStr()),
    [activitiesByTarget, categoryTargets, filters],
  );
  const sortedVisibleTargets = useMemo(() => {
    if (activeConfig.id !== "events") return visibleTargets;
    const today = todayStr();
    let list = [...visibleTargets];
    if (costSortDirection) {
      list.sort((a, b) => {
        const ca = parseNumberField(a.cost);
        const cb = parseNumberField(b.cost);
        const na = ca == null ? null : Number(ca);
        const nb = cb == null ? null : Number(cb);
        if (na == null && nb == null) return (a.name || "").localeCompare(b.name || "");
        if (na == null) return 1; // unpriced rows sink to the bottom either way
        if (nb == null) return -1;
        const cmp = costSortDirection === "desc" ? nb - na : na - nb;
        return cmp || (a.name || "").localeCompare(b.name || "");
      });
    } else if (followUpSortDirection) {
      list.sort((a, b) => {
        const da = a.next_contact_date || "";
        const db = b.next_contact_date || "";
        if (!da && !db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        const cmp = followUpSortDirection === "desc" ? db.localeCompare(da) : da.localeCompare(db);
        return cmp || (a.name || "").localeCompare(b.name || "");
      });
    } else {
      list.sort((left, right) => compareGrassrootsEventSchedule(left, right, today, eventDateSortDirection));
    }
    // Pin events awaiting closeout (already occurred — today or earlier — and not yet
    // closed) to the very top: they need action. Within that group, the MOST overdue
    // (oldest final day) sits highest; the rest keep the active sort below them.
    const needsClose = [];
    const rest = [];
    for (const t of list) {
      (canCloseGrassrootsEvent(t, today) ? needsClose : rest).push(t);
    }
    needsClose.sort((a, b) => {
      const fa = getGrassrootsFinalEventDate(a) || "";
      const fb = getGrassrootsFinalEventDate(b) || "";
      return fa.localeCompare(fb) || (a.name || "").localeCompare(b.name || "");
    });
    return [...needsClose, ...rest];
  }, [activeConfig.id, eventDateSortDirection, followUpSortDirection, costSortDirection, visibleTargets]);

  // Apply the literal-port header filters (search, status pills, Past Events) on top of the category/sorted list.
  // This makes the ported Customer Lifecycle chrome actually drive the table (Events tab primary).
  const lifecycleDisplayTargets = useMemo(() => {
    let list;
    if (activeLifecycleTab === 'events' && eventsStatusFilter) {
      // A status pill is a pure status filter across EVERY event in the category —
      // active or not, past or closed. This is what makes "Abandoned" work: abandoned
      // events are inactive and never appear in the default (active-only) view, so the
      // pill sources straight from categoryTargets instead of the active-filtered list.
      const td = todayStr();
      list = categoryTargets
        .filter(t => normalizeGrassrootsStatus(t.status) === eventsStatusFilter)
        .slice()
        .sort((a, b) => compareGrassrootsEventSchedule(a, b, td, eventDateSortDirection || "asc"));
    } else {
      list = sortedVisibleTargets || [];
      // Events: the default view shows upcoming events AND events awaiting closeout
      // (occurred but not closed — pinned to the top by the sort above); it only hides
      // CLOSED events. The Past Events view is the full "already happened" archive:
      // every event past its final day (overdue-unclosed included) plus closed ones —
      // so an overdue event shows in both places.
      if (activeLifecycleTab === 'events') {
        const td = todayStr();
        list = list.filter(t => showPastEvents
          ? isGrassrootsEventInPastView(t, td)
          : !isGrassrootsEventClosed(t));
      }
    }
    const q = (lifecycleSearch || "").trim().toLowerCase();
    if (q) {
      list = list.filter(t =>
        String(t.organizer || t.name || t.first_name || t.last_name || "").toLowerCase().includes(q) ||
        String(t.notes || t.proposal || t.address || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [sortedVisibleTargets, categoryTargets, lifecycleSearch, eventsStatusFilter, showPastEvents, activeLifecycleTab, eventDateSortDirection]);

  // "Activity" tab — what's legit/confirmed: booked Events + all Visits, in one feed.
  // Strategic/long-term categories (Corporate, Apartments, PPP) stay in their own tabs.
  const allTabTargets = useMemo(() => {
    let list = targets.filter((t) => t.category === "drops" || (t.category === "events" && normalizeGrassrootsStatus(t.status) === "booked"));
    const q = (lifecycleSearch || "").trim().toLowerCase();
    if (q) {
      list = list.filter((t) =>
        String(t.organizer || t.name || t.first_name || t.last_name || "").toLowerCase().includes(q) ||
        String(t.notes || t.proposal || t.address || "").toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => String(a.name || a.organizer || "").localeCompare(String(b.name || b.organizer || "")));
    return list;
  }, [targets, lifecycleSearch]);

  const eventMetrics = useMemo(() => buildGrassrootsEventMetrics(targets, todayStr()), [targets]);
  const dropMetrics = useMemo(() => buildGrassrootsDropMetrics(targets, activities, todayStr()), [activities, targets]);
  const dropTargets = useMemo(() => targets.filter((target) => getGrassrootsCategoryConfig(target.category).id === "drops"), [targets]);
  const dropActivityRows = useMemo(
    () => buildGrassrootsDropActivityRows(targets, activities, attachmentsByActivity),
    [activities, attachmentsByActivity, targets],
  );
  const dropCategoryCounts = useMemo(() => buildGrassrootsDropCategoryCounts(dropActivityRows), [dropActivityRows]);
  const filteredDropActivityRows = useMemo(
    () => filterGrassrootsDropActivityRowsByCategory(dropActivityRows, dropActivityCategory),
    [dropActivityCategory, dropActivityRows],
  );
  const logBusinessOptions = useMemo(() => searchGrassrootsDropBusinessTargets({
    targets: dropTargets,
    activitiesByTarget,
    query: logBusinessQuery,
    limit: 5,
  }).map((row) => ({
    ...row,
    subtitle: [
      row.activityCount === 1 ? "1 visit" : `${row.activityCount} visits`,
      row.lastActivityDate ? `Last ${fmtDate(row.lastActivityDate)}` : "No visits yet",
      row.target.address_city || row.target.address || "",
    ].filter(Boolean).join(" · "),
    badge: getGrassrootsBusinessCategory(row.target) || "Business",
  })), [activitiesByTarget, dropTargets, logBusinessQuery]);
  const usedFilterKeys = Object.keys(draftFilters || {});
  const filterFields = useMemo(() => {
    const keyed = new Map();
    const baseFields = activeConfig.id === "drops"
      ? BASE_FILTER_FIELDS.filter((field) => field.key !== "status")
      : BASE_FILTER_FIELDS;
    [...baseFields, ...(CATEGORY_FILTER_FIELDS[activeConfig.id] || [])].forEach((field) => keyed.set(field.key, field));
    return [...keyed.values()];
  }, [activeConfig.id]);
  const availableFilterFields = filterFields.filter((field) => !usedFilterKeys.includes(field.key));
  const filterSections = [...new Set(filterFields.map((field) => field.section))];

  const toast = useCallback((message, type = "success") => {
    addGlobalToast(message, type);
  }, [addGlobalToast]);

  const loadGrassroots = useCallback(async () => {
    if (!locationId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setSchemaMissing(false);
    setAttachmentsSchemaMissing(false);
    const [targetResult, activityResult, historyResult, eventDateResult, attachmentResult] = await Promise.all([
      supabase
        .from("grassroots_targets")
        .select("*")
        .eq("location_id", locationId)
        .order("created_at", { ascending: false }),
      supabase
        .from("grassroots_activity")
        .select("*")
        .eq("location_id", locationId)
        .order("created_at", { ascending: false }),
      supabase
        .from("grassroots_history")
        .select("*")
        .eq("location_id", locationId)
        .order("event_at", { ascending: false }),
      supabase
        .from("grassroots_event_dates")
        .select("*")
        .eq("location_id", locationId)
        .order("event_date", { ascending: true }),
      supabase
        .from("grassroots_activity_attachments")
        .select("*")
        .eq("location_id", locationId)
        .is("deleted_at", null)
        .order("uploaded_at", { ascending: false }),
    ]);

    const eventDateTableMissing = eventDateResult.error?.code === "42P01" || eventDateResult.error?.code === "PGRST205";
    const attachmentTableMissing = attachmentResult.error?.code === "42P01" || attachmentResult.error?.code === "PGRST205";
    if (attachmentTableMissing) setAttachmentsSchemaMissing(true);
    if (targetResult.error || activityResult.error || historyResult.error || (eventDateResult.error && !eventDateTableMissing) || (attachmentResult.error && !attachmentTableMissing)) {
      const error = targetResult.error || activityResult.error || historyResult.error || eventDateResult.error || attachmentResult.error;
      if (error?.code === "42P01" || /grassroots_/.test(error?.message || "")) {
        setSchemaMissing(true);
      } else {
        console.error("Failed to load grassroots tracker", error);
        toast(error.message || "Failed to load grassroots tracker", "error");
      }
      setTargets([]);
      setActivities([]);
      setActivityAttachments([]);
      setHistory([]);
      setLoading(false);
      return;
    }

    const eventDatesByTarget = (eventDateTableMissing ? [] : (eventDateResult.data || [])).reduce((acc, row) => {
      if (!row.target_id) return acc;
      if (!acc[row.target_id]) acc[row.target_id] = [];
      acc[row.target_id].push(row);
      return acc;
    }, {});
    setTargets((targetResult.data || []).map((target) => {
      const status = normalizeGrassrootsStatus(target.status);
      return {
        ...target,
        status,
        is_active: resolveGrassrootsTargetIsActive(status, target.is_active),
        event_type: normalizeGrassrootsEventType(target.event_type) || target.event_type,
        event_dates: eventDatesByTarget[target.id] || normalizeGrassrootsEventDates(target),
      };
    }));
    setActivities((activityResult.data || []).map((row) => ({
      ...row,
      metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
    })));
    setActivityAttachments((attachmentTableMissing ? [] : (attachmentResult.data || [])).map((row) => ({
      ...row,
      metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
    })));
    setHistory(historyResult.data || []);
    setLoading(false);
  }, [locationId, toast]);

  useEffect(() => {
    loadGrassroots();
  }, [loadGrassroots]);

  useEffect(() => { fetchDirectoryOrgNames(locationId).then(setDirectoryOrgNames); }, [locationId]);

  useEffect(() => () => {
    if (freshTargetTimer.current) window.clearTimeout(freshTargetTimer.current);
    if (freshActivityTimer.current) window.clearTimeout(freshActivityTimer.current);
  }, []);

  useEffect(() => {
    if (!newDraft?.id) return undefined;
    let frameId = 0;
    const timerId = window.setTimeout(() => {
      frameId = window.requestAnimationFrame(() => {
        scrollGrassrootsEditorIntoView(newDraftScrollRef.current);
      });
    }, 60);
    return () => {
      window.clearTimeout(timerId);
      if (frameId) window.cancelAnimationFrame(frameId);
    };
  }, [newDraft?.id]);

  useEffect(() => {
    const category = logModal ? (logModal.category || getGrassrootsCategoryConfig(logModal?.target?.category).id) : "";
    if (category !== "drops") return undefined;
    let frameId = 0;
    const timerId = window.setTimeout(() => {
      frameId = window.requestAnimationFrame(() => {
        scrollGrassrootsEditorIntoView(logComposerScrollRef.current);
      });
    }, 60);
    return () => {
      window.clearTimeout(timerId);
      if (frameId) window.cancelAnimationFrame(frameId);
    };
  }, [logModal?.activity?.id, logModal?.category, logModal?.target?.category, logModal?.target?.id]);

  useEffect(() => {
    if (showFilterPanel && !prevFilterOpen.current) {
      setDraftFilters({ ...filters });
      setShowFilterPicker(false);
      setConfiguringFilterKey(null);
    }
    prevFilterOpen.current = showFilterPanel;
  }, [filters, showFilterPanel]);

  useEffect(() => {
    setNewDraft(null);
    setEditDraft(null);
    setExpandedUpdates(new Set());
    const defaults = getGrassrootsDefaultFilters(activeCategory);
    setFilters(defaults);
    setDraftFilters(defaults);
    setShowFilterPanel(false);
    setMovePopover(null);
    setLogModal(null);
    if (activeCategory === "drops") setDropSubview("activity");
  }, [activeCategory]);

  const updateDraft = (key, value) => {
    if (editDraft) {
      setEditDraft((prev) => ({ ...prev, [key]: value }));
    } else {
      setNewDraft((prev) => ({ ...prev, [key]: value }));
    }
  };

  const openNewDraft = () => {
    if (!canEditTargets) {
      toast("You do not have permission to edit grassroots rows", "error");
      return;
    }
    setEditDraft(null);
    const blank = makeBlankGrassrootsTarget(activeCategory);
    // Quick capture defaults
    blank.status = "corresponding";
    blank.is_active = true;
    setNewDraft(blank);
  };

  const closeEditor = () => {
    setNewDraft(null);
    setEditDraft(null);
    setCellEditor(null);
  };

  // Inline status change from the status cell's dropdown — saves immediately.
  // Inline status change from the status cell's dropdown. Works for every category:
  // events go through the events RPC (preserves event dates), everything else uses a
  // plain targets update.
  const setTargetStatus = async (target, status) => {
    if (!canEditTargets) {
      toast("You do not have permission to edit grassroots rows", "error");
      return;
    }
    const normalized = normalizeGrassrootsStatus(status);
    if (!target || !locationId || normalized === normalizeGrassrootsStatus(target.status)) return;
    const isEvent = getGrassrootsCategoryConfig(target.category).id === "events";
    const isActive = normalized === "abandoned" ? false : true;
    setSaveState("saving");
    let error = null;
    if (isEvent) {
      const draft = buildEditorDraft(target);
      draft.status = normalized;
      draft.is_active = isActive;
      const payload = buildTargetPayload(draft, locationId, actor);
      ({ error } = await supabase.rpc(
        GRASSROOTS_EVENT_SAVE_RPC,
        buildGrassrootsEventSaveRpcArgs({ ...payload, id: draft.id }, draft),
      ));
    } else {
      ({ error } = await supabase
        .from("grassroots_targets")
        .update({ status: normalized, is_active: isActive, updated_by_user_id: actor.userId, updated_by_name: actor.name })
        .eq("id", target.id));
    }
    if (error) {
      setSaveState("error");
      toast(error.message || "Failed to update status", "error");
      return;
    }
    await loadGrassroots();
    setSaveState("saved");
    window.setTimeout(() => setSaveState("idle"), 1200);
    toast(`Status set to ${getGrassrootsStatusLabel(normalized)}`);
  };

  // Open the per-column micro-editor for an event cell (organizer / event / date).
  const openCellEditor = (target, group) => {
    if (!canEditTargets) {
      toast("You do not have permission to edit grassroots rows", "error");
      return;
    }
    setNewDraft(null);
    setEditDraft(buildEditorDraft(target));
    setCellEditor({ targetId: target.id, group });
  };

  // Open the closeout modal for an event (only reachable once its final day passed).
  const openCloseout = (target) => {
    if (!canEditTargets) {
      toast("You do not have permission to close grassroots events", "error");
      return;
    }
    setCloseoutModal({ target });
    setCloseoutLeads(target.leads_captured != null && target.leads_captured !== "" ? String(target.leads_captured) : "");
    setCloseoutNotes("");
    setCloseoutDisposition("completed");
  };

  const closeCloseout = () => {
    setCloseoutModal(null);
    setCloseoutLeads("");
    setCloseoutNotes("");
    setCloseoutDisposition("completed");
  };

  const saveCloseout = async () => {
    const target = closeoutModal?.target;
    if (!target || !locationId) return;
    const cancelled = closeoutDisposition === "cancelled";
    const leads = cancelled ? 0 : (parseNumberField(closeoutLeads) ?? 0);
    const cost = parseNumberField(target.cost);
    const cpl = cancelled ? null : calculateGrassrootsCpl(cost, leads);
    setSavingCloseout(true);
    setSaveState("saving");
    try {
      const draft = buildEditorDraft(target);
      draft.leads_captured = leads;
      draft.cpl = cpl ?? "";
      draft.details = {
        ...(draft.details && typeof draft.details === "object" ? draft.details : {}),
        closeout: makeGrassrootsEventCloseout({
          leadsCaptured: leads,
          cpl,
          notes: closeoutNotes,
          disposition: closeoutDisposition,
          closedByUserId: actor.userId,
          closedByName: actor.name,
        }),
      };
      const payload = buildTargetPayload(draft, locationId, actor);
      const rpcPayload = { ...payload, id: draft.id };
      const { error } = await supabase.rpc(GRASSROOTS_EVENT_SAVE_RPC, buildGrassrootsEventSaveRpcArgs(rpcPayload, draft));
      if (error) throw error;
      // Record the closeout note as an activity so it shows in the row history.
      const notes = (closeoutNotes || "").trim();
      if (notes) {
        const activityId = createGrassrootsClientUuid ? createGrassrootsClientUuid() : crypto.randomUUID();
        await supabase.from("grassroots_activity").insert({
          id: activityId,
          location_id: locationId,
          target_id: target.id,
          activity_type: getGrassrootsActivityType(target.category || "events"),
          activity_date: todayStr(),
          notes: `${cancelled ? "Event cancelled (couldn't attend)" : "Event closed"} — ${notes}`,
          created_by_user_id: actor.userId,
          created_by_name: actor.name,
        });
      }
      await loadGrassroots();
      closeCloseout();
      setSaveState("saved");
      window.setTimeout(() => setSaveState("idle"), 1200);
      toast(cancelled ? "Event marked cancelled" : "Event closed");
    } catch (err) {
      console.error("closeout save failed", err);
      setSaveState("error");
      toast(err?.message || "Failed to close event", "error");
    } finally {
      setSavingCloseout(false);
    }
  };

  const markFreshTarget = (targetId) => {
    if (!targetId) return;
    if (freshTargetTimer.current) window.clearTimeout(freshTargetTimer.current);
    setFreshTargetId(targetId);
    freshTargetTimer.current = window.setTimeout(() => setFreshTargetId(null), 1800);
  };

  const markFreshActivity = (activityId) => {
    if (!activityId) return;
    if (freshActivityTimer.current) window.clearTimeout(freshActivityTimer.current);
    setFreshActivityId(activityId);
    freshActivityTimer.current = window.setTimeout(() => setFreshActivityId(null), 1800);
  };

  const toggleDropActivityExpanded = (activityId) => {
    setExpandedDropActivities((current) => {
      const next = new Set(current);
      if (next.has(activityId)) next.delete(activityId);
      else next.add(activityId);
      return next;
    });
  };

  const resetLogForm = () => {
    setLogModal(null);
    setLogNotes("");
    setLogDate("");
    setLogActivityDate(todayStr());
    setLogContactName("");
    setLogBusinessQuery("");
    setLogSelectedTarget(null);
    setLogBusinessDraft(null);
    setLogMaterialsLeft("");
    setLogOutcome("");
    setLogFollowUpPriority(false);
    setLogPartnershipPotential(false);
    setLogFiles([]);
    setLogFileErrors([]);
    setSavingLog(false);
    if (logFileInputRef.current) logFileInputRef.current.value = "";
  };

  const openLogModal = (target = null) => {
    if (!canLogActivity) {
      toast("You do not have permission to log grassroots activity", "error");
      return;
    }
    const category = target ? getGrassrootsCategoryConfig(target.category).id : "drops";
    setMovePopover(null);
    setLogModal({ target, category });
    setLogNotes("");
    // Pre-fill the follow-up with the target's current one (non-drop) so it's visible
    // and can be cleared by blanking it; drops manage their own per-visit date.
    setLogDate(category !== "drops" ? (target?.next_contact_date || "") : "");
    setLogActivityDate(todayStr());
    setLogContactName("");
    setLogBusinessQuery(target?.name || "");
    setLogSelectedTarget(category === "drops" ? target : null);
    setLogBusinessDraft(null);
    setLogMaterialsLeft("");
    setLogOutcome("");
    setLogFollowUpPriority(false);
    setLogPartnershipPotential(false);
    setLogFiles([]);
    setLogFileErrors([]);
    if (logFileInputRef.current) logFileInputRef.current.value = "";
  };

  const openEditDropActivity = (row) => {
    if (!canLogActivity) {
      toast("You do not have permission to edit grassroots activity", "error");
      return;
    }
    if (!row?.activity?.id || !row?.target?.id) {
      toast("This activity cannot be edited from this view", "error");
      return;
    }
    setMovePopover(null);
    setDropSubview("activity");
    setExpandedDropActivities((current) => {
      const next = new Set(current);
      next.add(row.id);
      return next;
    });
    setLogModal({ target: row.target, category: "drops", activity: row.activity });
    setLogNotes(row.notes || "");
    setLogDate(row.nextDropDate || "");
    setLogActivityDate(row.activityDate || todayStr());
    setLogContactName(row.personSpokenWith || "");
    setLogBusinessQuery(row.businessName || row.target.name || "");
    setLogSelectedTarget(row.target);
    setLogBusinessDraft(null);
    setLogMaterialsLeft(row.materialsLeft || "");
    setLogOutcome(row.outcome || "");
    setLogFollowUpPriority(Boolean(row.followUpPriority || row.nextDropDate));
    setLogPartnershipPotential(Boolean(row.partnershipPotential));
    setLogFiles([]);
    setLogFileErrors([]);
    if (logFileInputRef.current) logFileInputRef.current.value = "";
  };

  const handleLogFileChange = (event) => {
    const incomingFiles = Array.from(event.target.files || []);
    const { acceptedFiles, errors } = validateGrassrootsActivityAttachmentFiles([...logFiles, ...incomingFiles]);
    setLogFiles(acceptedFiles.slice(0, GRASSROOTS_ACTIVITY_ATTACHMENT_MAX_FILES));
    setLogFileErrors(errors);
    if (errors.length > 0) toast(errors[0], "error");
    if (logFileInputRef.current) logFileInputRef.current.value = "";
  };

  const removeLogFile = (fileIndex) => {
    setLogFiles((prev) => prev.filter((_, index) => index !== fileIndex));
    setLogFileErrors([]);
    if (logFileInputRef.current) logFileInputRef.current.value = "";
  };

  const handleSelectGoogleLogBusiness = (parts = {}) => {
    const draft = {
      ...makeBlankGrassrootsTarget("drops"),
      name: parts.name || logBusinessQuery,
      category: "drops",
      address: parts.address || "",
      address_line_1: parts.address_line_1 || "",
      address_line_2: parts.address_line_2 || "",
      address_city: parts.address_city || "",
      address_state: parts.address_state || "",
      address_postal_code: parts.address_postal_code || "",
      address_country: parts.address_country || "",
      google_place_id: parts.google_place_id || "",
      contact_phone: parts.contact_phone || "",
      business_category: parts.business_category || parts.drop_category || "",
      drop_category: parts.business_category || parts.drop_category || "",
      details: parts.website ? { links: [{ id: `business_link_${Date.now()}`, label: "Website", url: parts.website }] } : {},
    };
    setLogBusinessDraft(draft);
    setLogSelectedTarget(null);
  };

  const ensureLogTarget = async () => {
    if (logSelectedTarget?.id) return logSelectedTarget;
    const name = String(logBusinessDraft?.name || logBusinessQuery || "").trim();
    if (!name) throw new Error("Business is required");
    if (!canEditTargets) throw new Error("You do not have permission to create visit businesses");

    const draft = {
      ...makeBlankGrassrootsTarget("drops"),
      ...(logBusinessDraft || {}),
      name,
      category: "drops",
      is_active: true,
    };
    const payload = buildTargetPayload(draft, locationId, actor);
    const { data, error } = await supabase
      .from("grassroots_targets")
      .insert(payload)
      .select("*")
      .single();
    if (error) throw error;
    setTargets((prev) => [data, ...prev]);
    markFreshTarget(data.id);
    // Mirror the visited business into the Marketing Directory (best-effort).
    ensureDirectoryOrgByName({ locationId, name: data.name, actor, orgType: data.business_category || data.drop_category || "Business", grassrootsTargetId: data.id, address: data.address || "", phone: data.contact_phone || "", email: data.contact_email || "" });
    fetchDirectoryOrgNames(locationId).then(setDirectoryOrgNames);
    return data;
  };

  const uploadGrassrootsActivityAttachments = async ({ target, activityId }) => {
    const uploadedRows = [];
    for (const file of logFiles) {
      const attachmentId = createGrassrootsClientUuid();
      const mimeType = inferGrassrootsActivityAttachmentMimeType(file);
      const storagePath = buildGrassrootsActivityAttachmentPath({
        locationId,
        targetId: target.id,
        activityId,
        attachmentId,
        fileName: file.name,
      });
      const { error: uploadError } = await supabase
        .storage
        .from(GRASSROOTS_ACTIVITY_ATTACHMENT_BUCKET)
        .upload(storagePath, file, {
          cacheControl: "3600",
          contentType: mimeType,
          upsert: false,
        });
      if (uploadError) throw uploadError;
      uploadedRows.push({
        id: attachmentId,
        location_id: locationId,
        target_id: target.id,
        activity_id: activityId,
        attachment_type: mimeType.startsWith("image/") ? "drop_photo" : "drop_attachment",
        file_name: file.name || "attachment",
        storage_bucket: GRASSROOTS_ACTIVITY_ATTACHMENT_BUCKET,
        storage_path: storagePath,
        mime_type: mimeType,
        file_size_bytes: Number(file.size || 0),
        metadata: {
          original_file_name: file.name || "attachment",
          source_module: "grassroots_drops",
        },
        uploaded_by_user_id: actor.userId,
        uploaded_by_name: actor.name,
      });
    }
    return uploadedRows;
  };

  const saveDraft = async () => {
    if (!canEditTargets) {
      toast("You do not have permission to edit grassroots rows", "error");
      return;
    }
    const draft = editDraft || newDraft;
    if (!draft || !locationId) return;
    if (!String(draft.name || "").trim()) {
      toast(`${activeConfig.nameLabel} is required`, "error");
      return;
    }
    if (getGrassrootsCategoryConfig(draft.category).id === "events" && normalizeGrassrootsEventDates(draft).length === 0) {
      toast("Event date is required", "error");
      return;
    }
    setSavingDraft(true);
    setSaveState("saving");
    const payload = buildTargetPayload(draft, locationId, actor);
    const isEventDraft = getGrassrootsCategoryConfig(draft.category).id === "events";
    let data = null;
    let savedEventDates = normalizeGrassrootsEventDates(draft);
    let error = null;

    if (isEventDraft) {
      const rpcPayload = { ...payload, id: draft.isDraft ? null : draft.id };
      const result = await supabase.rpc(
        GRASSROOTS_EVENT_SAVE_RPC,
        buildGrassrootsEventSaveRpcArgs(rpcPayload, draft),
      );
      error = result.error;
      data = result.data?.target || null;
      savedEventDates = result.data?.event_dates || savedEventDates;
    } else {
      const query = draft.isDraft
        ? supabase.from("grassroots_targets").insert(payload).select("*").single()
        : supabase.from("grassroots_targets").update(payload).eq("id", draft.id).select("*").single();
      const result = await query;
      error = result.error;
      data = result.data;
    }

    setSavingDraft(false);
    if (error || !data) {
      console.error("Failed to save grassroots target", error);
      setSaveState("error");
      toast(error?.message || "Failed to save row", "error");
      return;
    }
    const dataWithDates = { ...data, event_dates: savedEventDates };
    setTargets((prev) => draft.isDraft ? [dataWithDates, ...prev] : prev.map((target) => (target.id === data.id ? dataWithDates : target)));
    closeEditor();
    await loadGrassroots();
    if (draft.isDraft) markFreshTarget(data.id);
    // Mirror an event's organizer into the Marketing Directory (best-effort).
    if (isEventDraft && String(draft.organizer || "").trim()) {
      ensureDirectoryOrgByName({ locationId, name: draft.organizer, actor, orgType: "Community Org", grassrootsTargetId: data.id });
      fetchDirectoryOrgNames(locationId).then(setDirectoryOrgNames);
    }
    setSaveState("saved");
    window.setTimeout(() => setSaveState("idle"), 1200);
    toast("Grassroots row saved");
  };

  const deleteTarget = async (target) => {
    if (!canEditTargets) {
      toast("You do not have permission to edit grassroots rows", "error");
      return;
    }
    if (!window.confirm(`Delete ${target.name || "this row"}? This also deletes its logged updates.`)) return;
    setSaveState("saving");
    const { error: stampError } = await supabase
      .from("grassroots_targets")
      .update({
        updated_by_user_id: actor.userId,
        updated_by_name: actor.name,
      })
      .eq("id", target.id);
    if (stampError) {
      setSaveState("error");
      toast(stampError.message || "Failed to prepare delete history", "error");
      return;
    }
    const { error } = await supabase.from("grassroots_targets").delete().eq("id", target.id);
    if (error) {
      setSaveState("error");
      toast(error.message || "Failed to delete row", "error");
      return;
    }
    setTargets((prev) => prev.filter((row) => row.id !== target.id));
    setActivities((prev) => prev.filter((activity) => activity.target_id !== target.id));
    closeEditor();
    resetLogForm();
    setMovePopover(null);
    await loadGrassroots();
    setSaveState("saved");
    window.setTimeout(() => setSaveState("idle"), 1200);
    toast("Grassroots row deleted");
  };

  const openMovePopover = (target, event) => {
    if (!canEditTargets) {
      toast("You do not have permission to edit grassroots rows", "error");
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    setLogModal(null);
    setMovePopover({ target, x: rect.left, y: rect.bottom + 6 });
  };

  const moveTarget = async (target, nextConfig) => {
    if (!canEditTargets) {
      toast("You do not have permission to edit grassroots rows", "error");
      return;
    }
    if (!target || !nextConfig || target.category === nextConfig.dbValue) {
      setMovePopover(null);
      return;
    }
    setSaveState("saving");
    const { data, error } = await supabase
      .from("grassroots_targets")
      .update({
        category: nextConfig.dbValue,
        updated_by_user_id: actor.userId,
        updated_by_name: actor.name,
      })
      .eq("id", target.id)
      .select("*")
      .single();
    if (error) {
      setSaveState("error");
      toast(error.message || "Failed to move row", "error");
      return;
    }
    setTargets((prev) => prev.map((row) => (row.id === data.id ? data : row)));
    setExpandedUpdates((prev) => {
      const next = new Set(prev);
      next.delete(target.id);
      return next;
    });
    setMovePopover(null);
    setActiveCategory(nextConfig.id);
    await loadGrassroots();
    setSaveState("saved");
    window.setTimeout(() => setSaveState("idle"), 1200);
    toast(`Moved to ${nextConfig.label}`);
  };

  const updateFollowUpDate = async (target, newDate) => {
    if (!canEditTargets) {
      toast("You do not have permission to edit follow-up dates", "error");
      return;
    }
    // Stricter validation (re-review Round 2): reject not only shape but invalid calendar dates (e.g. 2026-99-99, 2026-02-30)
    if (newDate != null) {
      const s = String(newDate).trim();
      if (s) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
          toast("Follow-up date must be YYYY-MM-DD or blank", "error");
          return;
        }
        const d = new Date(s + "T12:00:00");
        const [y, m, day] = s.split("-").map(Number);
        if (d.getFullYear() !== y || d.getMonth() + 1 !== m || d.getDate() !== day) {
          toast("Invalid calendar date for follow-up", "error");
          return;
        }
      }
    }
    setSaveState("saving");
    const { error } = await supabase
      .from("grassroots_targets")
      .update({
        next_contact_date: newDate || null,
        updated_by_user_id: actor.userId,
        updated_by_name: actor.name,
      })
      .eq("id", target.id);
    if (error) {
      setSaveState("error");
      toast(error.message || "Failed to update follow-up", "error");
      window.setTimeout(() => setSaveState("idle"), 800);
      return;
    }
    setTargets((prev) => prev.map((row) => (row.id === target.id ? { ...row, next_contact_date: newDate || null } : row)));
    setSaveState("saved");
    window.setTimeout(() => setSaveState("idle"), 900);
    toast(newDate ? "Follow-up date updated" : "Follow-up cleared");
  };

  // small helper (hoisted for use in export below)
  function formatShortDateForExport(d) {
    if (!d) return "";
    try { return new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit" }); } catch { return String(d); }
  }

  const exportVisibleToCSV = () => {
    const rows = sortedVisibleTargets.length ? sortedVisibleTargets : visibleTargets;
    if (!rows.length) {
      toast("Nothing to export", "error");
      return;
    }
    const headers = ["Organizer", "Event", "Event Date", "Status", "Follow-Up", "Latest Update", "Notes / Proposal"];
    const escape = (v) => `"${String(v || "").replace(/"/g, '""')}"`;
    const csvLines = [headers.join(",")];
    rows.forEach((t) => {
      const acts = activitiesByTarget[t.id] || [];
      const latest = [...acts].sort((a, b) => String(b.activity_date || b.created_at || "").localeCompare(String(a.activity_date || a.created_at || "")))[0];
      const latestTxt = latest ? `${formatShortDateForExport(latest.activity_date || latest.created_at)}: ${latest.notes || latest.description || ""}` : "";
      const org = t.organizer || [t.first_name, t.last_name].filter(Boolean).join(" ") || t.contact_source || "";
      const ed = getGrassrootsPrimaryEventDate(t) || "";
      csvLines.push([
        escape(org),
        escape(t.name || ""),
        escape(ed ? fmtDate(ed) : ""),
        escape(getGrassrootsStatusLabel(t.status)),
        escape(t.next_contact_date || ""),
        escape(latestTxt),
        escape(t.proposal || ""),
      ].join(","));
    });
    const blob = new Blob([csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `grassroots-${activeConfig.id}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast(`Exported ${rows.length} rows`);
  };

  const saveLog = async () => {
    if (!canLogActivity) {
      toast("You do not have permission to log grassroots activity", "error");
      return;
    }
    const isDropLog = (logModal?.category || getGrassrootsCategoryConfig(logModal?.target?.category).id) === "drops";
    if (isDropLog && !logSelectedTarget?.id && !String(logBusinessDraft?.name || logBusinessQuery || "").trim()) {
      toast("Business is required", "error");
      return;
    }
    const category = isDropLog ? "drops" : getGrassrootsCategoryConfig(logModal?.target?.category).id;
    const activityType = getGrassrootsActivityType(category);
    // The follow-up is simply the date entered in the log form (the "Follow-up needed"
    // toggle was removed). Blank = no follow-up.
    const followUpDate = logDate || null;
    if (!logNotes.trim()) {
      toast(activityType === "drop" ? "Visit notes are required" : "Comment is required", "error");
      return;
    }
    if (activityType === "drop" && attachmentsSchemaMissing && logFiles.length > 0) {
      toast("Attachment storage is not installed in this Supabase environment yet", "error");
      return;
    }
    const editingActivity = logModal?.activity || null;
    const target = isDropLog && editingActivity?.id ? logModal.target : isDropLog ? await ensureLogTarget().catch((error) => {
      toast(error.message || "Business is required", "error");
      return null;
    }) : logModal?.target;
    if (!target) return;
    const activityDate = logActivityDate || todayStr();
    const activityMetadata = activityType === "drop" ? {
      person_spoken_with: logContactName.trim(),
      materials_left: logMaterialsLeft.trim(),
      outcome: logOutcome.trim(),
      // "Follow-up needed" toggle was removed — a visit needs follow-up simply when
      // a follow-up date is set.
      follow_up_priority: Boolean((logDate || "").trim()),
      partnership_potential: logPartnershipPotential,
    } : {};
    if (editingActivity?.id) {
      setSaveState("saving");
      setSavingLog(true);
      const { data, error } = await supabase.rpc("update_grassroots_activity_with_history", {
        p_activity: {
          id: editingActivity.id,
          location_id: locationId,
          activity_date: activityDate,
          notes: logNotes.trim(),
          next_contact_date: activityType === "drop" ? followUpDate : (logDate || null),
          metadata: activityMetadata,
          updated_by_user_id: actor.userId,
          updated_by_name: actor.name,
        },
      });
      setSavingLog(false);
      const updatedActivity = data?.activity || null;
      const historyEntry = data?.history || null;
      if (error || !updatedActivity) {
        setSaveState("error");
        console.error("Failed to edit grassroots activity", error);
        toast(error?.message || "Failed to edit activity", "error");
        return;
      }
      setActivities((prev) => prev.map((row) => (row.id === updatedActivity.id ? updatedActivity : row)));
      if (historyEntry?.id) {
        setHistory((prev) => [historyEntry, ...prev.filter((entry) => entry.id !== historyEntry.id)]);
      }
      await loadGrassroots();
      markFreshActivity(updatedActivity.id);
      resetLogForm();
      if (activityType === "drop") setDropSubview("activity");
      setSaveState("saved");
      window.setTimeout(() => setSaveState("idle"), 1200);
      toast(activityType === "drop" ? "Activity updated" : "Development updated");
      return;
    }
    const activityId = createGrassrootsClientUuid();
    setSaveState("saving");
    setSavingLog(true);

    let insertedActivity = null;
    let insertedAttachments = [];
    let error = null;

    if (activityType === "drop" && !attachmentsSchemaMissing) {
      try {
        const attachmentRows = await uploadGrassrootsActivityAttachments({ target, activityId });
        const { data, error: rpcError } = await supabase.rpc("log_grassroots_drop_activity_with_attachments", {
          p_activity: {
            id: activityId,
            location_id: locationId,
            target_id: target.id,
            activity_type: activityType,
            activity_date: activityDate,
            notes: logNotes.trim(),
            next_contact_date: followUpDate,
            metadata: {
              ...activityMetadata,
              attachment_count: attachmentRows.length,
            },
            created_by_user_id: actor.userId,
            created_by_name: actor.name,
          },
          p_attachments: attachmentRows,
        });
        if (rpcError) throw rpcError;
        insertedActivity = data?.activity || null;
        insertedAttachments = data?.attachments || [];
      } catch (rpcError) {
        error = rpcError;
      }
    } else {
      const result = await supabase
        .from("grassroots_activity")
        .insert({
          id: activityId,
          location_id: locationId,
          target_id: target.id,
          activity_type: activityType,
          activity_date: activityDate,
          notes: logNotes.trim(),
          next_contact_date: activityType === "drop" ? followUpDate : (logDate || null),
          metadata: activityMetadata,
          created_by_user_id: actor.userId,
          created_by_name: actor.name,
        })
        .select("*")
        .single();
      insertedActivity = result.data;
      error = result.error;
    }

    setSavingLog(false);
    if (error || !insertedActivity) {
      setSaveState("error");
      console.error("Failed to log grassroots activity", error);
      toast(error?.message || "Failed to log update", "error");
      return;
    }

    setActivities((prev) => [insertedActivity, ...prev]);
    if (insertedAttachments.length > 0) {
      setActivityAttachments((prev) => [...insertedAttachments, ...prev]);
    }
    // The row's follow-up is the target's next_contact_date (shown once per business
    // in the Business view, not per visit). Sync it to the log's date for every
    // category, so logging with the date left blank CLEARS an existing follow-up.
    {
      const desiredFollowUp = logDate || null;
      if (desiredFollowUp !== (target.next_contact_date || null)) {
        await supabase
          .from("grassroots_targets")
          .update({ next_contact_date: desiredFollowUp, updated_by_user_id: actor.userId, updated_by_name: actor.name })
          .eq("id", target.id);
      }
    }
    await loadGrassroots();
    markFreshActivity(insertedActivity.id);
    resetLogForm();
    if (activityType === "drop") setDropSubview("activity");
    setSaveState("saved");
    window.setTimeout(() => setSaveState("idle"), 1200);
    toast(activityType === "drop" ? "Activity logged" : category === "events" ? "Comment logged" : "Development logged");
  };

  const previewGrassrootsAttachment = async (attachment) => {
    if (!attachment?.storage_path) return;
    const previewKind = getGrassrootsAttachmentPreviewKind(attachment);
    if (previewKind === "unsupported") {
      toast("This attachment type cannot be previewed in the app", "error");
      return;
    }
    setPreviewingAttachmentId(attachment.id || attachment.storage_path);
    try {
      const { data, error } = await supabase
        .storage
        .from(attachment.storage_bucket || GRASSROOTS_ACTIVITY_ATTACHMENT_BUCKET)
        .createSignedUrl(attachment.storage_path, 300);
      if (error) throw error;
      if (!data?.signedUrl) throw new Error("Signed URL was not returned");
      setAttachmentPreview({
        attachment,
        kind: previewKind,
        url: data.signedUrl,
      });
    } catch (error) {
      console.error("Grassroots attachment preview error:", error);
      toast("Failed to open attachment preview", "error");
    } finally {
      setPreviewingAttachmentId(null);
    }
  };

  const removeFilter = (key) => {
    setDraftFilters((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    if (configuringFilterKey === key) setConfiguringFilterKey(null);
  };

  const updateFilter = (key, field, value) => {
    setDraftFilters((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  };

  const selectFilterField = (key) => {
    const field = filterFields.find((candidate) => candidate.key === key);
    if (!field) return;
    setDraftFilters((prev) => ({ ...prev, [key]: { op: field.ops[0], val: "" } }));
    setConfiguringFilterKey(key);
  };

  const clearFilters = () => {
    const defaults = getGrassrootsDefaultFilters(activeCategory);
    setDraftFilters(defaults);
    setFilters(defaults);
    setConfiguringFilterKey(null);
    setShowFilterPicker(false);
  };

  const applyFilters = () => {
    setFilters(draftFilters);
    setShowFilterPanel(false);
    setShowFilterPicker(false);
    setConfiguringFilterKey(null);
  };

  const filterCount = Object.keys(filters || {}).length;
  const saveLabel = saveState === "saving" ? "Saving..." : saveState === "saved" ? "Saved" : saveState === "error" ? "Save failed" : "";
  const saveTone = saveState === "saving" ? C.info : saveState === "saved" ? C.suc : saveState === "error" ? C.dan : C.textMut;
  const metricCards = activeConfig.id === "drops"
    ? [
      { label: "Visits Last 30", value: dropMetrics.dropVisitsLast30, color: C.pri },
      { label: "Businesses Visited Last 30", value: dropMetrics.businessesVisitedLast30, color: C.suc },
      { label: `Visits ${dropMetrics.year} YTD`, value: dropMetrics.dropVisitsYtd, color: C.info },
      { label: `Businesses Visited ${dropMetrics.year} YTD`, value: dropMetrics.businessesVisitedYtd, color: "#7C3AED" },
    ]
    : [
      { label: `Booked Upcoming ${eventMetrics.year}`, value: eventMetrics.bookedUpcomingThisYear, color: C.pri },
      { label: `Booked Completed ${eventMetrics.year}`, value: eventMetrics.bookedCompletedThisYear, color: C.suc },
      { label: `Identified ${eventMetrics.year}`, value: eventMetrics.identifiedThisYear, color: C.info },
      { label: `Corresponding ${eventMetrics.year}`, value: eventMetrics.correspondingThisYear, color: "#7C3AED" },
      { label: `Booked ${fmtMonthYear(eventMetrics.month)}`, value: eventMetrics.bookedThisMonth, color: C.accDk },
    ];
  const activeLogCategoryId = logModal ? (logModal.category || getGrassrootsCategoryConfig(logModal?.target?.category).id) : "";
  const isDropLogActive = activeLogCategoryId === "drops";
  const logActivityEditor = canLogActivity && logModal ? (
    <LogActivityModal
      logModal={logModal}
      businessQuery={logBusinessQuery}
      selectedTarget={logSelectedTarget}
      businessDraft={logBusinessDraft}
      internalOptions={logBusinessOptions}
      notes={logNotes}
      activityDate={logActivityDate}
      nextDate={logDate}
      contactName={logContactName}
      materialsLeft={logMaterialsLeft}
      outcome={logOutcome}
      followUpPriority={logFollowUpPriority}
      partnershipPotential={logPartnershipPotential}
      files={logFiles}
      fileErrors={logFileErrors}
      saving={savingLog}
      fileInputRef={logFileInputRef}
      attachmentsSchemaMissing={attachmentsSchemaMissing}
      onBusinessQueryChange={(value) => {
        setLogBusinessQuery(value);
        setLogSelectedTarget(null);
        setLogBusinessDraft(null);
      }}
      onInternalBusinessSelect={(target) => {
        setLogSelectedTarget(target);
        setLogBusinessDraft(null);
      }}
      onGoogleBusinessSelect={handleSelectGoogleLogBusiness}
      onActivityDateChange={setLogActivityDate}
      onNextDateChange={setLogDate}
      onContactNameChange={setLogContactName}
      onMaterialsLeftChange={setLogMaterialsLeft}
      onOutcomeChange={setLogOutcome}
      onNotesChange={setLogNotes}
      onFollowUpPriorityChange={(value) => {
        setLogFollowUpPriority(value);
        if (!value) setLogDate("");
      }}
      onPartnershipPotentialChange={setLogPartnershipPotential}
      onFileChange={handleLogFileChange}
      onRemoveFile={removeLogFile}
      onClose={resetLogForm}
      onSave={saveLog}
    />
  ) : null;

  return (
    <div style={{ maxWidth: 1240, margin: "0 auto", paddingBottom: 32 }}>
      <style>{`
        @keyframes grassrootsSlideIn { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes grassrootsFadeIn { from { opacity:0; transform:scale(0.96); } to { opacity:1; transform:scale(1); } }
        @keyframes grassrootsChipIn { from { opacity:0; transform:translateX(-6px) scale(0.92); } to { opacity:1; transform:translateX(0) scale(1); } }
        @keyframes grassrootsComposerIn {
          0% { opacity:0; transform:translateY(-18px) scale(0.985); filter:blur(4px); }
          65% { opacity:1; transform:translateY(2px) scale(1.002); filter:blur(0); }
          100% { opacity:1; transform:translateY(0) scale(1); filter:blur(0); }
        }
        @keyframes grassrootsCategoryCycle {
          0% { opacity:0; transform:translate3d(0,10px,0) scale(0.992); filter:blur(3px); }
          62% { opacity:1; transform:translate3d(0,-1px,0) scale(1.001); filter:blur(0); }
          100% { opacity:1; transform:translate3d(0,0,0) scale(1); filter:blur(0); }
        }
        @keyframes grassrootsFreshRow {
          0% { box-shadow:0 0 0 2px rgba(20,83,45,0), 0 1px 3px rgba(0,0,0,0.04); }
          24% { box-shadow:0 0 0 2px rgba(20,83,45,0.32), 0 18px 42px rgba(20,83,45,0.16); }
          100% { box-shadow:0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02); }
        }
        @keyframes grassrootsCopySuccess {
          0% { transform:translateY(-50%) scale(0.94); box-shadow:0 0 0 rgba(22,163,74,0); }
          42% { transform:translateY(-50%) scale(1.06); box-shadow:0 0 0 8px rgba(34,197,94,0.16); }
          100% { transform:translateY(-50%) scale(1); box-shadow:0 8px 18px rgba(22,163,74,0.25); }
        }
        @keyframes grassrootsCheckPop {
          0% { transform:scale(0.62) rotate(-14deg); }
          58% { transform:scale(1.2) rotate(4deg); }
          100% { transform:scale(1.02) rotate(0deg); }
        }
        @keyframes grassrootsDropTabSweep {
          0% { transform:translateX(-140%); opacity:0; }
          18% { opacity:0.82; }
          52% { opacity:0.55; }
          100% { transform:translateX(245%); opacity:0; }
        }
        @keyframes grassrootsDropControlSettle {
          from { opacity:0; transform:translateY(8px) scale(0.99); filter:blur(2px); }
          to { opacity:1; transform:translateY(0) scale(1); filter:blur(0); }
        }
        .grassroots-event-inline-editor {
          position: relative;
          overflow: hidden;
          border-radius: 10px;
          border: 1.5px solid ${C.border};
          background: ${C.surface};
          box-shadow: 0 8px 24px rgba(15,23,42,0.10);
          animation: grassrootsComposerIn 0.38s cubic-bezier(0.16,1,0.3,1) both;
        }
        /* Per-column edit affordances: a pencil (and the event-type badge) that fade in
           when the cell is hovered/focused, so the dense table stays clean at rest. */
        .gr-edit-cell .gr-edit-reveal { opacity: 0; transition: opacity 0.12s ease; }
        .gr-edit-cell:hover .gr-edit-reveal,
        .gr-edit-cell:focus-within .gr-edit-reveal { opacity: 0.8; }
        .gr-edit-cell .gr-edit-reveal:hover { opacity: 1; }
        /* Persistent amber pencil = a required field group is empty (a quiet to-do). It
           stays visible until the info is filled in, so missing data is obvious at rest.
           Its tooltip is rendered via a body portal (see editTip) so it is never clipped
           by the table's overflow:hidden. */
        .gr-edit-needed { opacity: 1; }
        .grassroots-event-inline-header {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 8px 12px;
          border-bottom: 1px solid ${C.borderLight};
          background: linear-gradient(135deg, ${C.priLt} 0%, #fff 72%);
        }
        .grassroots-event-inline-close {
          width: 32px;
          height: 32px;
          border: 1px solid ${C.borderLight};
          border-radius: 9px;
          background: #fff;
          color: ${C.textMut};
          cursor: pointer;
          display: grid;
          place-items: center;
          padding: 0;
        }
        .grassroots-event-metrics {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(185px, 1fr));
          gap: 12px;
          margin-bottom: 16px;
        }
        .grassroots-category-stage {
          animation: grassrootsCategoryCycle 0.34s cubic-bezier(0.16,1,0.3,1) both;
          transform-origin: top center;
        }
        .grassroots-new-draft-anchor {
          scroll-margin-top: 96px;
        }
        .grassroots-event-inline-body { position: relative; z-index: 1; padding: 8px; background: ${C.bg}; }
        .grassroots-target-inline-body { position: relative; z-index: 1; padding: 8px; background: ${C.bg}; }
        /* density scoped to events editor only (prevents side-effect on TargetEditor for drops etc.) */
        .grassroots-target-form-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(340px, 0.85fr);
          gap: 8px;
          align-items: stretch;
        }
        .grassroots-event-type-picker {
          display: inline-grid;
          grid-template-columns: repeat(2, minmax(76px, 1fr));
          gap: 5px;
          width: 100%;
          max-width: 256px;
          padding: 5px;
          border-radius: 13px;
          border: 1.5px solid ${C.border};
          background: ${C.bg};
        }
        .grassroots-event-type-option {
          border: none;
          border-radius: 10px;
          padding: 9px 12px;
          background: transparent;
          color: ${C.textSec};
          font-family: inherit;
          font-size: 12px;
          font-weight: 900;
          cursor: pointer;
          transition: transform 0.16s ease, background 0.16s ease, color 0.16s ease, box-shadow 0.16s ease;
        }
        .grassroots-event-type-option:hover { transform: translateY(-1px); color: ${C.text}; }
        .grassroots-event-type-option.is-active {
          background: ${C.pri};
          color: #fff;
          box-shadow: 0 8px 18px rgba(20,83,45,0.22);
        }
        .grassroots-event-links {
          margin-top: 14px;
          padding-top: 14px;
          border-top: 1px solid ${C.borderLight};
        }
        .grassroots-event-links-header,
        .grassroots-event-commentary-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 8px;
        }
        .grassroots-link-add-button,
        .grassroots-comment-add-button {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border: 1.5px solid ${C.borderLight};
          border-radius: 10px;
          background: #fff;
          color: ${C.pri};
          padding: 7px 10px;
          font-family: inherit;
          font-size: 11px;
          font-weight: 900;
          cursor: pointer;
        }
        .grassroots-comment-add-button:disabled {
          cursor: default;
          opacity: 0.5;
        }
        .grassroots-event-links-list { display: grid; gap: 8px; }
        .grassroots-event-link-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 34px;
          gap: 8px;
          align-items: center;
        }
        .grassroots-event-link-url { position: relative; min-width: 0; }
        .grassroots-event-link-open {
          position: absolute;
          right: 8px;
          top: 50%;
          transform: translateY(-50%);
          width: auto;
          min-width: 62px;
          height: 28px;
          border-radius: 8px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          color: ${C.pri};
          background: #fff;
          border: 1px solid ${C.borderLight};
          font-size: 11px;
          font-weight: 900;
          text-decoration: none;
          padding: 0 8px;
        }
        .grassroots-address-copy-field {
          grid-column: 1 / -1;
        }
        .grassroots-address-copy-shell {
          position: relative;
        }
        .grassroots-address-copy-shell input {
          transition: border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
        }
        .grassroots-address-copy-shell.is-copied input {
          border-color: rgba(22,163,74,0.58) !important;
          background: linear-gradient(90deg, rgba(240,253,244,0.88), #fff) !important;
          box-shadow: 0 0 0 3px rgba(34,197,94,0.13);
        }
        .grassroots-address-copy-shell.is-manual input {
          border-color: rgba(180,83,9,0.42) !important;
          background: linear-gradient(90deg, rgba(255,251,235,0.86), #fff) !important;
          box-shadow: 0 0 0 3px rgba(245,158,11,0.12);
        }
        .grassroots-address-copy-button {
          position: absolute;
          right: 8px;
          top: 50%;
          transform: translateY(-50%);
          min-width: 82px;
          height: 30px;
          border-radius: 8px;
          border: 1px solid ${C.borderLight};
          background: #fff;
          color: ${C.pri};
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 0 9px;
          font-family: inherit;
          font-size: 11px;
          font-weight: 900;
          cursor: pointer;
          overflow: hidden;
          transition: min-width 0.18s ease, border-color 0.18s ease, background 0.18s ease, color 0.18s ease, box-shadow 0.18s ease, transform 0.12s ease;
        }
        .grassroots-address-copy-button:hover:not(:disabled) {
          border-color: rgba(20,83,45,0.24);
          box-shadow: 0 4px 10px rgba(15,23,42,0.08);
        }
        .grassroots-address-copy-button:active:not(:disabled) {
          transform: translateY(-50%) scale(0.97);
        }
        .grassroots-address-copy-button.is-copied {
          min-width: 92px;
          border-color: rgba(22,163,74,0.30);
          background: ${C.suc};
          color: #fff;
          box-shadow: 0 8px 18px rgba(22,163,74,0.25);
          animation: grassrootsCopySuccess 420ms cubic-bezier(0.16,1,0.3,1);
        }
        .grassroots-address-copy-button.is-manual {
          min-width: 116px;
          border-color: rgba(180,83,9,0.24);
          background: #FFFBEB;
          color: #92400E;
        }
        .grassroots-copy-icon-stack {
          position: relative;
          width: 16px;
          height: 16px;
          display: inline-grid;
          place-items: center;
          flex: 0 0 auto;
        }
        .grassroots-copy-clipboard,
        .grassroots-copy-check {
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
          transition: opacity 0.18s ease, transform 0.22s cubic-bezier(0.16,1,0.3,1);
        }
        .grassroots-copy-check {
          opacity: 0;
          transform: translateY(9px) scale(0.64);
        }
        .grassroots-address-copy-button.is-copied .grassroots-copy-clipboard {
          opacity: 0;
          transform: translateY(-9px) scale(0.72);
        }
        .grassroots-address-copy-button.is-copied .grassroots-copy-check {
          opacity: 1;
          transform: translateY(0) scale(1.08);
        }
        .grassroots-address-copy-button.is-copied .grassroots-copy-check svg {
          animation: grassrootsCheckPop 360ms cubic-bezier(0.16,1,0.3,1) both;
        }
        .grassroots-copy-label {
          display: inline-block;
          min-width: 31px;
          text-align: left;
          transition: transform 0.18s ease;
        }
        .grassroots-address-copy-button:disabled {
          color: ${C.textMut};
          cursor: default;
          opacity: 0.6;
        }
        .grassroots-link-remove-button {
          width: 34px;
          height: 34px;
          border-radius: 10px;
          border: 1.5px solid ${C.borderLight};
          background: #fff;
          color: ${C.textMut};
          display: grid;
          place-items: center;
          cursor: pointer;
        }
        .grassroots-event-commentary {
          margin-top: 14px;
          padding-top: 14px;
          border-top: 1px solid ${C.borderLight};
        }
        .grassroots-places-field {
          position: relative;
          display: block;
          min-width: 0;
        }
        .grassroots-places-anchor {
          position: relative;
          min-width: 0;
        }
        .grassroots-places-panel {
          position: absolute;
          top: calc(100% + 8px);
          left: 0;
          z-index: 10070;
          width: min(680px, calc(100vw - 56px));
          max-width: calc(100vw - 56px);
          padding: 6px;
          border: 1px solid rgba(203, 213, 225, 0.95);
          border-radius: 16px;
          background: #fff;
          box-shadow: 0 18px 34px rgba(15,23,42,0.12), 0 3px 8px rgba(15,23,42,0.07);
          overflow: hidden;
        }
        .grassroots-places-panel::before {
          content: "";
          position: absolute;
          top: 0;
          left: 14px;
          right: 14px;
          height: 2px;
          border-radius: 0 0 999px 999px;
          background: linear-gradient(90deg, rgba(20,83,45,0), rgba(20,83,45,0.52), rgba(20,83,45,0));
        }
        .grassroots-places-option {
          position: relative;
          width: 100%;
          display: grid;
          grid-template-columns: 34px minmax(0, 1fr) auto;
          align-items: center;
          gap: 12px;
          min-height: 74px;
          padding: 12px 12px 12px 9px;
          border: 0;
          border-radius: 12px;
          background: transparent;
          color: ${C.text};
          cursor: pointer;
          font: inherit;
          text-align: left;
          transition: background 0.14s ease, box-shadow 0.14s ease, transform 0.14s ease;
        }
        .grassroots-places-option + .grassroots-places-option {
          border-top: 1px solid rgba(226,232,240,0.88);
          border-radius: 0;
        }
        .grassroots-places-option:hover,
        .grassroots-places-option.is-active {
          background: linear-gradient(90deg, rgba(20,83,45,0.075), rgba(240,253,244,0.68));
          box-shadow: inset 3px 0 0 ${C.pri};
        }
        .grassroots-places-option:active {
          transform: translateY(1px);
        }
        .grassroots-places-pin {
          width: 28px;
          height: 28px;
          border-radius: 999px;
          display: grid;
          place-items: center;
          color: ${C.textMut};
          background: ${C.bg};
          border: 1px solid rgba(203,213,225,0.9);
          align-self: center;
        }
        .grassroots-places-option:hover .grassroots-places-pin,
        .grassroots-places-option.is-active .grassroots-places-pin {
          color: ${C.pri};
          background: #fff;
          border-color: rgba(20,83,45,0.24);
        }
        .grassroots-places-copy {
          min-width: 0;
          display: grid;
          gap: 4px;
        }
        .grassroots-places-main {
          display: block;
          color: ${C.text};
          font-size: 14px;
          font-weight: 900;
          line-height: 1.22;
          white-space: normal;
          overflow-wrap: anywhere;
        }
        .grassroots-places-main mark {
          padding: 0;
          color: ${C.pri};
          background: transparent;
        }
        .grassroots-places-secondary {
          display: block;
          color: ${C.textMut};
          font-size: 13px;
          font-weight: 700;
          line-height: 1.3;
          white-space: normal;
          overflow-wrap: anywhere;
        }
        .grassroots-places-category {
          justify-self: end;
          align-self: center;
          white-space: nowrap;
          border-radius: 999px;
          border: 1px solid rgba(20,83,45,0.18);
          background: rgba(20,83,45,0.07);
          color: ${C.pri};
          padding: 5px 8px;
          font-size: 10px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .grassroots-places-loading {
          padding: 14px 12px;
          color: ${C.textMut};
          font-size: 13px;
          font-weight: 800;
        }
        .grassroots-places-footer {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 5px;
          padding: 8px 8px 4px;
          border-top: 1px solid rgba(226,232,240,0.88);
          color: ${C.textMut};
          font-size: 12px;
          font-weight: 700;
        }
        .grassroots-google-wordmark {
          font-weight: 800;
          letter-spacing: 0;
        }
        .grassroots-google-wordmark span:nth-child(1) { color: #4285F4; }
        .grassroots-google-wordmark span:nth-child(2) { color: #DB4437; }
        .grassroots-google-wordmark span:nth-child(3) { color: #F4B400; }
        .grassroots-google-wordmark span:nth-child(4) { color: #4285F4; }
        .grassroots-google-wordmark span:nth-child(5) { color: #0F9D58; }
        .grassroots-google-wordmark span:nth-child(6) { color: #DB4437; }
        .grassroots-places-section-label {
          padding: 8px 10px 4px;
          color: ${C.textMut};
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .grassroots-places-option.is-internal {
          background: rgba(240,253,244,0.42);
        }
        .grassroots-places-pin.is-internal {
          color: ${C.pri};
          background: #fff;
          border-color: rgba(20,83,45,0.24);
        }
        .grassroots-drop-toolbar {
          display: grid;
          grid-template-columns: minmax(320px, 440px) minmax(0, 1fr);
          align-items: center;
          gap: 16px;
          margin: 2px 0 14px;
        }
        .grassroots-drop-subview-tabs {
          --grassroots-drop-view-count: 2;
          --grassroots-drop-view-active-index: 0;
          position: relative;
          display: grid;
          grid-template-columns: repeat(var(--grassroots-drop-view-count), minmax(0, 1fr));
          align-items: center;
          min-height: 50px;
          padding: 5px;
          border: 1px solid rgba(226,232,240,0.95);
          border-radius: 16px;
          background:
            linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,250,252,0.92)),
            #fff;
          box-shadow: 0 16px 44px rgba(15,23,42,0.055);
          overflow: hidden;
          isolation: isolate;
          animation: grassrootsDropControlSettle 260ms cubic-bezier(0.22,1,0.36,1);
        }
        .grassroots-drop-subview-indicator {
          position: absolute;
          top: 5px;
          bottom: 5px;
          left: 5px;
          z-index: 0;
          width: calc((100% - 10px) / var(--grassroots-drop-view-count));
          border-radius: 12px;
          background: linear-gradient(135deg, #14532d 0%, #166534 56%, #3f6212 100%);
          box-shadow: 0 14px 34px rgba(20,83,45,0.22), inset 0 1px 0 rgba(255,255,255,0.18);
          transform: translateX(calc(var(--grassroots-drop-view-active-index) * 100%));
          transition: transform 420ms cubic-bezier(0.22,1,0.36,1), box-shadow 220ms ease;
          overflow: hidden;
        }
        .grassroots-drop-subview-indicator::after {
          content: "";
          position: absolute;
          inset: -30% auto -30% 0;
          width: 46%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.28), transparent);
          animation: grassrootsDropTabSweep 2.8s cubic-bezier(0.22,1,0.36,1) infinite;
        }
        .grassroots-drop-subview-tab {
          position: relative;
          z-index: 1;
          border: 0;
          border-radius: 12px;
          background: transparent;
          color: ${C.textSec};
          cursor: pointer;
          font-family: inherit;
          font-size: 13px;
          font-weight: 850;
          letter-spacing: 0;
          height: 40px;
          padding: 0 16px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          white-space: nowrap;
          transition: color 220ms ease, transform 220ms cubic-bezier(0.22,1,0.36,1), background 220ms ease;
        }
        .grassroots-drop-subview-tab em {
          font-style: normal;
          font-size: 11px;
          min-width: 22px;
          height: 22px;
          padding: 0 7px;
          border-radius: 999px;
          display: inline-grid;
          place-items: center;
          background: rgba(20,83,45,0.08);
          color: ${C.pri};
          font-weight: 950;
          line-height: 1;
          transition: background 220ms ease, color 220ms ease, transform 220ms cubic-bezier(0.22,1,0.36,1);
        }
        .grassroots-drop-subview-tab:hover {
          color: ${C.pri};
          background: rgba(20,83,45,0.055);
        }
        .grassroots-drop-subview-tab.is-active {
          color: #fff;
          transform: translateY(-1px);
        }
        .grassroots-drop-subview-tab.is-active em {
          background: rgba(255,255,255,0.18);
          color: #fff;
          transform: scale(1.02);
        }
        .grassroots-drop-toolbar-copy {
          display: flex;
          align-items: baseline;
          justify-content: flex-end;
          gap: 8px;
          color: ${C.textMut};
          font-size: 12px;
          min-width: 0;
        }
        .grassroots-drop-toolbar-copy strong {
          color: ${C.text};
          font-weight: 950;
        }
        .grassroots-drop-category-filter {
          display: flex;
          align-items: center;
          gap: 7px;
          flex-wrap: wrap;
          margin: -2px 0 2px;
        }
        .grassroots-drop-category-filter button {
          border: 1.5px solid ${C.borderLight};
          background: #fff;
          border-radius: 999px;
          padding: 6px 10px;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          cursor: pointer;
          color: ${C.textSec};
          font: inherit;
          font-size: 12px;
          font-weight: 900;
          transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease, transform 0.16s ease;
        }
        .grassroots-drop-category-filter button:hover {
          transform: translateY(-1px);
          border-color: ${C.pri}55;
        }
        .grassroots-drop-category-filter button.is-active {
          background: ${C.pri};
          border-color: ${C.pri};
          color: #fff;
          box-shadow: 0 7px 18px rgba(20,83,45,0.16);
        }
        .grassroots-drop-category-filter em {
          font-style: normal;
          font-size: 11px;
          opacity: 0.76;
        }
        .grassroots-drop-activity-header,
        .grassroots-drop-activity-row {
          display: grid;
          grid-template-columns: 118px minmax(220px, 0.95fr) minmax(260px, 1.45fr) 166px;
          gap: 14px;
          align-items: start;
        }
        .grassroots-drop-activity-header {
          padding: 8px 12px;
          background: rgb(255,255,255);
          border-bottom: 1px solid rgb(226,232,240);
          color: rgb(71,85,105);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        .grassroots-drop-activity-list {
          display: grid;
        }
        .grassroots-drop-activity-row {
          padding: 5px 12px;
          border-bottom: 1px solid ${C.borderLight};
          transition: background 0.16s ease, box-shadow 0.16s ease;
          font-size: 12px;
          align-items: start;
        }
        .grassroots-drop-activity-row:last-child {
          border-bottom: 0;
        }
        .grassroots-drop-activity-row:hover {
          background: rgba(248,250,252,0.84);
        }
        .grassroots-drop-activity-row.is-fresh {
          animation: grassrootsFreshRow 1.8s ease-out both;
        }
        .grassroots-drop-activity-date,
        .grassroots-drop-activity-business,
        .grassroots-drop-activity-summary,
        .grassroots-drop-activity-signals {
          min-width: 0;
          display: grid;
          gap: 4px;
        }
        .grassroots-drop-activity-date strong,
        .grassroots-drop-activity-business strong,
        .grassroots-drop-activity-summary strong {
          color: ${C.text};
          font-size: 12px;
          font-weight: 700;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .grassroots-drop-activity-date span,
        .grassroots-drop-activity-business span,
        .grassroots-drop-activity-summary span,
        .grassroots-drop-activity-detail-footer {
          color: ${C.textMut};
          font-size: 11px;
          font-weight: 600;
          line-height: 1.3;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .grassroots-drop-activity-signals {
          min-width: 0;
          justify-items: end;
          align-content: start;
        }
        .grassroots-drop-activity-detail {
          grid-column: 1 / -1;
          margin-top: 10px;
          padding: 14px 16px;
          border-radius: 12px;
          background: ${C.bg};
          border: 1px solid ${C.borderLight};
          display: grid;
          gap: 12px;
        }
        .grassroots-drop-activity-detail-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
        }
        .grassroots-drop-activity-detail-grid strong {
          display: block;
          color: ${C.text};
          font-size: 13px;
          font-weight: 900;
          line-height: 1.35;
        }
        .grassroots-drop-activity-detail p {
          margin: 0;
          color: ${C.text};
          font-size: 13px;
          font-weight: 800;
          line-height: 1.45;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }
        .grassroots-drop-activity-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          justify-content: flex-end;
        }
        .grassroots-drop-activity-meta span {
          display: inline-flex;
          align-items: center;
          padding: 4px 8px;
          border-radius: 999px;
          background: ${C.bg};
          border: 1px solid ${C.borderLight};
          color: ${C.textSec};
          font-size: 11px;
          font-weight: 900;
        }
        .grassroots-drop-activity-meta span.is-hot {
          background: ${C.warnLt};
          color: ${C.warn};
          border-color: rgba(245,158,11,0.25);
        }
        .grassroots-drop-activity-meta span.is-potential {
          background: ${C.priLt};
          color: ${C.pri};
          border-color: rgba(20,83,45,0.2);
        }
        .grassroots-drop-expand-button {
          margin-top: 4px;
          border: 1.5px solid ${C.borderLight};
          background: #fff;
          color: ${C.textSec};
          border-radius: 10px;
          padding: 6px 9px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
          font: inherit;
          font-size: 11px;
          font-weight: 900;
        }
        .grassroots-drop-activity-row.is-expanded .grassroots-drop-expand-button svg {
          transform: rotate(90deg);
        }
        .grassroots-drop-activity-detail-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          white-space: normal;
        }
        .grassroots-drop-activity-detail-actions {
          display: inline-flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
          flex-wrap: wrap;
        }
        .grassroots-history-change-list {
          display: grid;
          gap: 5px;
          margin-top: 8px;
          padding: 8px;
          border-radius: 10px;
          background: ${C.bg};
          border: 1px solid ${C.borderLight};
        }
        .grassroots-history-change-row {
          display: grid;
          grid-template-columns: 118px minmax(0, 1fr) 18px minmax(0, 1fr);
          gap: 7px;
          align-items: start;
          color: ${C.textMut};
          line-height: 1.35;
        }
        .grassroots-history-change-row strong {
          color: ${C.textSec};
          font-size: 11px;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .grassroots-history-change-row span {
          color: ${C.text};
          font-weight: 800;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }
        .grassroots-history-change-row em {
          color: ${C.textMut};
          font-style: normal;
          font-weight: 900;
          text-align: center;
        }
        .grassroots-log-composer-header {
          padding: 16px 18px;
          border-bottom: 1px solid ${C.borderLight};
          background: linear-gradient(135deg, ${C.priLt} 0%, #fff 70%);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
        }
        .grassroots-log-composer-kicker {
          font-size: 12px;
          font-weight: 900;
          color: ${C.pri};
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .grassroots-log-composer-subtitle {
          margin-top: 4px;
          font-size: 13px;
          color: ${C.textMut};
        }
        .grassroots-log-composer-actions {
          display: flex;
          gap: 8px;
          align-items: center;
        }
        .grassroots-log-composer-body {
          padding: 14px;
        }
        .grassroots-activity-attachments,
        .grassroots-log-pending-files {
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
        }
        .grassroots-activity-attachment-button,
        .grassroots-log-pending-files span {
          min-width: 0;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          max-width: 260px;
          padding: 7px 9px;
          border-radius: 10px;
          border: 1.5px solid ${C.borderLight};
          background: #fff;
          color: ${C.textSec};
          font: inherit;
          font-size: 12px;
          font-weight: 850;
        }
        .grassroots-activity-attachment-button {
          cursor: pointer;
        }
        .grassroots-activity-attachment-button:hover {
          border-color: rgba(20,83,45,0.28);
          color: ${C.pri};
        }
        .grassroots-activity-attachment-button span,
        .grassroots-log-pending-files strong {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .grassroots-activity-attachment-button em,
        .grassroots-log-pending-files em {
          color: ${C.textMut};
          font-size: 11px;
          font-style: normal;
          font-weight: 800;
        }
        .grassroots-log-modal {
          display: grid;
          gap: 14px;
        }
        .grassroots-log-section {
          border: 1px solid ${C.borderLight};
          border-radius: 14px;
          background: ${C.bg};
          padding: 14px;
        }
        .grassroots-log-section-title {
          margin-bottom: 10px;
          color: ${C.pri};
          font-size: 11px;
          font-weight: 950;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .grassroots-log-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }
        .grassroots-log-selected-business {
          display: grid;
          gap: 3px;
          padding: 12px;
          border-radius: 12px;
          border: 1.5px solid rgba(20,83,45,0.18);
          background: #fff;
        }
        .grassroots-log-selected-business strong {
          color: ${C.text};
          font-size: 14px;
          font-weight: 950;
        }
        .grassroots-log-selected-business span {
          color: ${C.textMut};
          font-size: 12px;
          font-weight: 750;
        }
        .grassroots-log-selected-business.is-compact {
          margin-top: 10px;
          display: flex;
          align-items: center;
          gap: 8px;
          color: ${C.pri};
        }
        .grassroots-log-flag-row {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 12px;
        }
        .grassroots-log-flag-row button {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 8px 12px;
          border-radius: 999px;
          border: 1.5px solid ${C.border};
          background: #fff;
          color: ${C.textSec};
          cursor: pointer;
          font: inherit;
          font-size: 12px;
          font-weight: 900;
        }
        .grassroots-log-flag-row button.is-active {
          border-color: rgba(20,83,45,0.3);
          background: ${C.pri};
          color: #fff;
        }
        .grassroots-log-followup-date {
          margin-top: 12px;
          max-width: 280px;
          animation: grassrootsSlideIn 0.2s ease-out;
        }
        .grassroots-log-warning,
        .grassroots-log-errors {
          margin-bottom: 10px;
          color: ${C.dan};
          font-size: 12px;
          font-weight: 850;
        }
        .grassroots-log-attachments-toolbar {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          color: ${C.textMut};
          font-size: 12px;
          font-weight: 800;
        }
        .grassroots-log-pending-files {
          margin-top: 10px;
        }
        .grassroots-log-pending-files button {
          border: 0;
          background: transparent;
          color: ${C.textMut};
          cursor: pointer;
          display: inline-flex;
          padding: 0;
        }
        .grassroots-log-actions {
          position: sticky;
          bottom: -26px;
          z-index: 2;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
          margin: 0 -26px -26px;
          padding: 14px 26px 18px;
          border-top: 1px solid rgba(226,232,240,0.92);
          background: linear-gradient(180deg, rgba(255,255,255,0.88), #fff 38%);
          backdrop-filter: blur(10px);
        }
        .pac-container {
          z-index: 10050 !important;
          margin-top: 2px !important;
          padding: 0 !important;
          border-radius: 8px !important;
          border: 1px solid #E5E7EB !important;
          background: #fff !important;
          box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1) !important;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
          overflow: hidden !important;
          width: auto !important;
          max-width: 460px !important;
        }

        /* Perplexity-style tight single-line items */
        .pac-container .pac-item {
          display: flex !important;
          align-items: center !important;
          padding: 6px 12px !important;
          font-size: 13px !important;
          line-height: 1.3 !important;
          color: #374151 !important;
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          border-radius: 0 !important;
        }

        .pac-container .pac-item:hover,
        .pac-container .pac-item-selected {
          background: #F3F4F6 !important;
          color: #111827 !important;
        }

        /* Thin left accent bar like Perplexity on selected */
        .pac-container .pac-item-selected::before {
          content: '';
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 3px;
          background: #111827;
        }

        /* Bold main address part */
        .pac-container .pac-item-query {
          font-weight: 600 !important;
          color: #111827 !important;
          white-space: nowrap !important;
          flex-shrink: 0;
        }

        .pac-container .pac-matched {
          font-weight: 600 !important;
          color: #14532D !important; /* subtle brand green for matches */
        }

        /* Secondary location text on same line, muted */
        .pac-container .pac-item > span:not(.pac-icon):not(.pac-item-query) {
          color: #6B7280 !important;
          margin-left: 6px !important;
          font-weight: 400 !important;
          white-space: nowrap !important;
        }

        /* Smaller, properly aligned pin icon */
        .pac-container .pac-icon {
          width: 16px !important;
          height: 16px !important;
          margin-right: 8px !important;
          margin-left: 2px !important;
          opacity: 0.6 !important;
          flex-shrink: 0;
          display: inline-flex !important;
          align-items: center !important;
        }

        /* Powered by Google text */
        .pac-container .pac-logo {
          padding: 4px 12px !important;
          font-size: 10px !important;
          color: #9CA3AF !important;
          background: #F9FAFB !important;
        }
        .grassroots-event-dense .grassroots-event-form-grid { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.85fr); gap: 10px; align-items: start; }
        .grassroots-event-dense .grassroots-event-form-section { border: none; padding: 0 0 4px; background: transparent; }
        .grassroots-event-dense .grassroots-event-form-section-title { font-size: 9px; font-weight: 700; color: ${C.textMut}; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 2px; }
        .grassroots-event-dense .grassroots-event-field-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 3px; align-items: start; }
        .grassroots-event-dense .grassroots-event-wide-field { grid-column: 1 / -1; }
        .grassroots-event-date-row { display: grid; grid-template-columns: minmax(190px, 1.4fr) minmax(112px, 0.7fr) minmax(112px, 0.7fr) 36px; gap: 6px; align-items: end; }
        .grassroots-event-date-row > button { margin-bottom: 1px; }
        @media (max-width: 880px) {
          .grassroots-event-form-grid { grid-template-columns: 1fr; }
          .grassroots-target-form-grid { grid-template-columns: 1fr; }
          .grassroots-event-dense .grassroots-event-form-grid { grid-template-columns: 1fr; }
        }
        @media (max-width: 680px) {
          .grassroots-event-field-grid { grid-template-columns: 1fr; }
          .grassroots-event-dense .grassroots-event-field-grid { grid-template-columns: 1fr; }
          .grassroots-event-date-row { grid-template-columns: 1fr; padding: 12px; border: 1px solid ${C.borderLight}; border-radius: 12px; background: ${C.bg}; }
          .grassroots-event-date-row > button { margin-bottom: 0; width: 100% !important; }
          .grassroots-event-link-row { grid-template-columns: 1fr 34px; }
          .grassroots-places-panel { width: min(100%, calc(100vw - 32px)); }
          .grassroots-places-option { grid-template-columns: 30px minmax(0, 1fr); }
          .grassroots-places-category { grid-column: 2; justify-self: start; margin-top: 2px; }
          .grassroots-drop-activity-header { display: none; }
          .grassroots-drop-activity-row { grid-template-columns: 1fr; gap: 10px; }
          .grassroots-drop-activity-signals { justify-items: start; }
          .grassroots-drop-activity-meta { justify-content: flex-start; }
          .grassroots-drop-activity-detail-grid { grid-template-columns: 1fr; }
          .grassroots-drop-activity-detail-footer { align-items: flex-start; flex-direction: column; }
          .grassroots-drop-activity-detail-actions { width: 100%; justify-content: flex-start; }
          .grassroots-history-change-row { grid-template-columns: 1fr; gap: 3px; }
          .grassroots-history-change-row em { text-align: left; }
          .grassroots-log-composer-header { align-items: flex-start; flex-direction: column; }
          .grassroots-log-composer-actions { width: 100%; justify-content: flex-end; }
          .grassroots-log-grid { grid-template-columns: 1fr; }
          .grassroots-drop-toolbar { grid-template-columns: 1fr; gap: 10px; }
          .grassroots-drop-subview-tabs { width: 100%; }
          .grassroots-drop-toolbar-copy { width: 100%; justify-content: flex-start; }
        }
      `}</style>
      {/* Clean clients-style header (no green gradient, tight, exact match to what user loves) */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: "-0.01em" }}>Marketing</h1>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {saveState !== "idle" && (
            <div style={{ minWidth: 96, padding: "5px 10px", borderRadius: 999, border: `1px solid ${C.border}`, background: "#fff", color: saveTone, fontSize: 11, fontWeight: 800, textAlign: "center" }}>
              {saveLabel}
            </div>
          )}

          {/* Category-scoped actions (filter / export / create). The History tab is a
              read-only cross-category feed, so these are hidden there. */}
          {activeLifecycleTab !== "history" && (
            <>
              <button
                onClick={() => setShowFilterPanel((current) => !current)}
                style={{
                  padding: "6px 14px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 700,
                  border: `1px solid ${C.border}`,
                  background: showFilterPanel ? C.pri : "#fff",
                  color: showFilterPanel ? "#fff" : C.text,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <FilterIcon /> Filter{filterCount > 0 ? ` (${filterCount})` : ""}
              </button>

              <Btn variant="ghost" size="md" onClick={exportVisibleToCSV}>
                Export
              </Btn>

              {activeConfig.id === "drops" ? (
                <>
                  <Btn variant="secondary" size="sm" icon={<I.Plus />} onClick={openNewDraft} disabled={!canEditTargets || !!newDraft || !!editDraft} style={{ padding: '6px 12px', fontSize: '12px', fontWeight: 600 }}>
                    Add Business
                  </Btn>
                  <Btn variant="primary" size="sm" icon={<I.Plus />} onClick={() => openLogModal()} disabled={!canLogActivity} style={{ padding: '6px 12px', fontSize: '12px', fontWeight: 600 }}>
                    Log Visit
                  </Btn>
                </>
              ) : (
                <Btn
                  variant="primary"
                  size="sm"
                  icon={<I.Plus />}
                  onClick={openNewDraft}
                  disabled={!canEditTargets || !!newDraft || !!editDraft}
                  style={{ padding: '6px 12px', fontSize: '12px', fontWeight: 600 }}
                >
                  New {activeConfig.singular}
                </Btn>
              )}
            </>
          )}
        </div>
      </div>

      {/* Metrics cards removed per feedback — they were adding too much visual weight and whitespace */}

      {/* Standardized list-surface frame — one perimeter border around search + tabs + table (matches CRM). */}
      <div style={{ border: `1.5px solid ${C.border}`, borderRadius: 10, overflow: "hidden", background: C.surface, marginBottom: 16 }}>
      {/* ═══ LITERAL PORT of Customer Lifecycle header from ClientsPage — search bar + pills + connected tabs + banner (not a recreation) ═══ */}
      <div style={{ marginBottom: 0 }}>
        {/* Search Bar — exact structure, padding, SVG, input, pills placement, | separator, and pill styles copied from ClientsPage.jsx:1428 */}
        <div style={{borderBottom:`1.5px solid ${C.borderLight}`,background:C.bg,transition:"border-color 0.15s"}}
          onFocus={e=>e.currentTarget.style.borderBottomColor=C.pri} onBlur={e=>e.currentTarget.style.borderBottomColor=C.borderLight}>
          <div style={{display:"flex",alignItems:"center",padding:"0 16px"}}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={lifecycleSearch?C.pri:C.textMut} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input value={lifecycleSearch} onChange={e=>setLifecycleSearch(e.target.value)}
              placeholder={activeLifecycleTab === 'history' ? "Search history by row, change, or person…" : "Search organizers, events, or notes…"}
              className="no-focus-ring"
              style={{border:"none",outline:"none",background:"transparent",fontSize:13,fontWeight:500,color:C.text,padding:"9px 10px",width:"100%",fontFamily:"inherit"}} />
            {lifecycleSearch && <button onClick={()=>setLifecycleSearch("")} style={{border:"none",background:"none",cursor:"pointer",color:C.textMut,padding:2,display:"flex"}} title="Clear"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>}
            {/* Filter pills area — exact layout/placement from reference */}
            <div style={{display:"flex",gap:4,marginLeft:8,flexShrink:0}}>
              {activeLifecycleTab === 'events' && ['Identified','Corresponding','Booked','Abandoned'].map(label => {
                const val = label.toLowerCase();
                const on = eventsStatusFilter === val;
                const col = val==='identified'?C.acc : val==='corresponding'?'#1E40AF' : val==='booked'?C.suc : C.dan;
                const cnt = categoryTargets.filter(t => normalizeGrassrootsStatus(t.status) === val && (showPastEvents || !isGrassrootsEventInPastView(t, todayStr()))).length;
                return <button key={val} onClick={()=>setEventsStatusFilter(on?null:val)} style={{padding:"4px 10px",borderRadius:8,border:`1.5px solid ${on?col:C.border}`,background:on?col:"transparent",color:on?"#fff":C.textMut,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s",whiteSpace:"nowrap"}}>{label} {cnt}</button>;
              })}
              {/* Drops: business category filters (All + types with counts) + | + Business toggle (user spec) */}
              {activeLifecycleTab === 'drops' && (
                <>
                  {['All', ...GRASSROOTS_BUSINESS_CATEGORY_OPTIONS].map(cat => {
                    const on = dropActivityCategory === cat || (cat === 'All' && dropActivityCategory === 'All');
                    // buildGrassrootsDropCategoryCounts returns an array of {category,count};
                    // read it by category (it was previously read like an object → always 0).
                    const cnt = (dropCategoryCounts.find(c => c.category === cat)?.count) || 0;
                    return (
                      <button
                        key={cat}
                        onClick={() => {
                          setDropActivityCategory(cat === 'All' ? 'All' : cat);
                          if (dropSubview !== 'activity') setDropSubview('activity');
                        }}
                        style={{
                          padding: '4px 9px',
                          borderRadius: 8,
                          border: `1.5px solid ${on ? C.pri : C.border}`,
                          background: on ? C.priLt : 'transparent',
                          color: on ? C.pri : C.textMut,
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {cat} {cnt}
                      </button>
                    );
                  })}
                  <div style={{width:1,height:20,background:C.border,margin:"0 4px",flexShrink:0}} />
                  <button
                    onClick={() => setDropSubview('business')}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 8,
                      border: `1.5px solid ${dropSubview === 'business' ? C.pri : C.border}`,
                      background: dropSubview === 'business' ? C.priLt : 'transparent',
                      color: dropSubview === 'business' ? C.pri : C.textMut,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Business
                  </button>
                </>
              )}
              {/* Past Events only makes sense on Events tab (user feedback) */}
              {activeLifecycleTab === 'events' && (
                <>
                  <div style={{width:1,height:20,background:C.border,margin:"0 4px",flexShrink:0}} />
                  <button onClick={()=>setShowPastEvents(v=>!v)}
                    title={showPastEvents ? "Showing closed events" : "Show closed (finished) events"}
                    style={{padding:"4px 10px",borderRadius:8,border:`1.5px solid ${showPastEvents?C.textMut:C.border}`,background:showPastEvents?C.textMut:"transparent",color:showPastEvents?"#fff":C.textMut,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s",whiteSpace:"nowrap"}}>
                    Past Events
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Tab bar — reverted to the compact left-aligned underline + count pill style you liked before the strict Clients port */}
        <div style={{ display: 'flex', gap: 2, borderBottom: `1px solid ${C.borderLight}`, background: C.bg, padding: '0 4px' }}>
          {[
            { id: 'events', label: 'Events', color: C.pri },
            { id: 'drops', label: 'Visits', color: C.pri },
            { id: 'corporate', label: 'Corporate Partnerships', color: C.pri },
            { id: 'localBusiness', label: 'Local Business Partnerships', color: C.pri },
            { id: 'ppp', label: 'Pet Professional Partnerships', color: C.pri },
            { id: 'apartments', label: 'Apartments', color: C.pri },
            { id: 'schools', label: 'Schools', color: C.pri },
            { id: 'history', label: 'History', color: C.pri },
          ].map(tab => {
            const active = tab.id === activeLifecycleTab;
            const count = tab.id === 'history'
              ? history.length
              : tab.id === 'all'
              ? targets.filter(t => t.category === 'drops' || (t.category === 'events' && normalizeGrassrootsStatus(t.status) === 'booked')).length
              : targets.filter(t => {
                  // Events badge = current events only: not past its final day, not closed,
                  // not abandoned. Past/closed events live behind the Past Events pill.
                  if (tab.id === 'events') return t.category === 'events' && t.is_active !== false && !isGrassrootsEventInPastView(t, todayStr());
                  if (tab.id === 'drops') return t.category === 'drops';
                  if (tab.id === 'corporate') return t.category === 'corporate_partnerships';
                  if (tab.id === 'apartments') return t.category === 'apartments';
                  if (tab.id === 'ppp') return t.category === 'pet_professional_partnerships';
                  if (tab.id === 'localBusiness') return t.category === 'local_business_partnerships';
                  if (tab.id === 'schools') return t.category === 'schools';
                  return false;
                }).length;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveLifecycleTab(tab.id);
                  // History is a cross-category view — keep the current category context
                  // so returning to another tab lands where you left off.
                  if (tab.id === 'history') return;
                  const map = { events: 'events', drops: 'drops', corporate: 'corporatePartnerships', apartments: 'apartments', ppp: 'petProfessionalPartnerships', localBusiness: 'localBusinessPartnerships', schools: 'schools', all: 'events' };
                  setActiveCategory(map[tab.id] || 'events');
                  if (tab.id !== 'events') setEventsStatusFilter(null);
                }}
                style={{
                  padding: '10px 14px',
                  fontSize: 13,
                  fontWeight: active ? 700 : 600,
                  color: active ? C.text : C.textSec,
                  background: 'transparent',
                  border: 'none',
                  borderBottom: active ? `3px solid ${C.pri}` : '3px solid transparent',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  marginBottom: -1,
                  whiteSpace: 'nowrap',
                }}
              >
                {tab.label}
                <span style={{
                  background: active ? C.pri : '#E5E7EB',
                  color: active ? '#fff' : C.textSec,
                  padding: '1px 7px',
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 800,
                  lineHeight: 1.1,
                  minWidth: 18,
                  textAlign: 'center',
                }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Explainer Banner — exact structure + gradient + padding from ClientsPage.jsx:1523 (static text for Grassroots; full editable banners not needed here) */}
        <div style={{padding:"10px 18px",borderBottom:`1px solid ${C.borderLight}`,background:`linear-gradient(135deg, ${C.priLt||C.pri+"08"}40, ${C.surface})`,fontSize:12,lineHeight:1.6,color:C.textSec}}>
          {activeLifecycleTab === 'events' && "Track daily outreach, follow-ups, and next steps for local events and activations. Use Log to record contact and set manual follow-up dates."}
          {activeLifecycleTab === 'drops' && "Logged visits by business category. Use the category pills in the header (All / Veterinarian / Groomer / ...). Switch to the Business rollup after the vertical bar."}
          {activeLifecycleTab === 'corporate' && "Corporate partnership targets. Filter by status and log follow-ups. Past events toggle shows completed outreach."}
          {activeLifecycleTab === 'apartments' && "Apartment complex outreach and partnerships. Same status + follow-up workflow as other categories."}
          {activeLifecycleTab === 'ppp' && "Pet professional and service partner pipeline. Full status filtering and manual next-contact control."}
          {activeLifecycleTab === 'localBusiness' && "Local businesses — coffee shops, retailers, and other neighborhood partners. Same status + follow-up workflow as the other pipelines."}
          {activeLifecycleTab === 'schools' && "Schools and education partners. Track outreach status and manual follow-ups."}
          {activeLifecycleTab === 'history' && "A complete audit trail of every change across all marketing categories — who did what, and when. Filter by category or use the search box to find a specific row or person."}
        </div>
      </div>

      {/* Drop subview pills now live inside the literal ported search bar row when activeLifecycleTab === 'drops' (no duplicate toolbar) */}


      {showFilterPanel && activeLifecycleTab !== "history" && (
        <Card style={{ padding: 0, marginBottom: 16, borderRadius: 14, background: C.bg, boxShadow: "0 8px 40px rgba(15,23,42,0.08)", overflow: "hidden", animation: "grassrootsSlideIn 0.2s ease-out" }}>
          <div style={{ padding: "14px 18px", minHeight: 48 }}>
            {usedFilterKeys.length === 0 && !showFilterPicker && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px 0", color: C.textMut, fontSize: 13, fontWeight: 700 }}>
                <FilterIcon /> No filters active
              </div>
            )}

            {usedFilterKeys.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: showFilterPicker ? 12 : 0 }}>
                {usedFilterKeys.map((key, index) => {
                  const field = filterFields.find((candidate) => candidate.key === key);
                  const filter = draftFilters[key];
                  if (!field || !filter) return null;
                  const isConfiguring = configuringFilterKey === key;
                  return (
                    <div key={key} style={{ animation: `grassrootsChipIn 0.2s ease-out ${index * 0.04}s both` }}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 0, borderRadius: 10, border: `1.5px solid ${isConfiguring ? C.pri : C.border}`, background: isConfiguring ? `${C.pri}06` : "#fff", overflow: "hidden" }}>
                        <button type="button" onClick={() => { setConfiguringFilterKey(isConfiguring ? null : key); setShowFilterPicker(false); }} style={{ padding: "6px 10px", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 900, color: C.pri, whiteSpace: "nowrap" }}>
                          {field.label}
                        </button>
                        <span style={{ padding: "2px 8px", borderRadius: 6, background: `${C.pri}12`, fontSize: 10, fontWeight: 900, color: C.pri, whiteSpace: "nowrap" }}>
                          {GRASSROOTS_FILTER_OP_LABELS[filter.op] || filter.op}
                        </span>
                        {filterNeedsValue(filter.op) && (
                          <span style={{ padding: "6px 8px 6px 4px", fontSize: 11, fontWeight: 700, color: filter.val === "" ? C.dan : C.text, whiteSpace: "nowrap" }}>
                            {filter.val === "" ? "set value" : String(filter.val)}
                          </span>
                        )}
                        <button type="button" onClick={() => removeFilter(key)} style={{ padding: "6px 8px 6px 2px", border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", color: C.textMut }}>
                          <I.X />
                        </button>
                      </div>

                      {isConfiguring && (
                        <div style={{ marginTop: 6, padding: "10px 14px", borderRadius: 10, background: "#fff", border: `1.5px solid ${C.pri}30`, boxShadow: "0 6px 24px rgba(20,83,45,0.1)", animation: "grassrootsFadeIn 0.2s ease-out" }}>
                          <Label>Condition</Label>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: filterNeedsValue(filter.op) ? 10 : 0 }}>
                            {field.ops.map((op, opIndex) => (
                              <button
                                key={op}
                                type="button"
                                onClick={() => {
                                  updateFilter(key, "op", op);
                                  if (!filterNeedsValue(op)) updateFilter(key, "val", "");
                                }}
                                style={{ padding: "5px 12px", borderRadius: 8, border: `1.5px solid ${filter.op === op ? C.pri : C.borderLight}`, background: filter.op === op ? C.pri : "#fff", color: filter.op === op ? "#fff" : C.text, fontSize: 11, fontWeight: filter.op === op ? 900 : 600, cursor: "pointer", fontFamily: "inherit", animation: `grassrootsFadeIn 0.18s ease-out ${opIndex * 0.02}s both` }}
                              >
                                {GRASSROOTS_FILTER_OP_LABELS[op] || op}
                              </button>
                            ))}
                          </div>
                          {filterNeedsValue(filter.op) && (
                            <>
                              <Label>Value</Label>
                              {field.type === "select" ? (
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                  {(field.options || []).map((option) => (
                                    <button
                                      key={option}
                                      type="button"
                                      onClick={() => updateFilter(key, "val", option)}
                                      style={{ padding: "5px 12px", borderRadius: 8, border: `1.5px solid ${filter.val === option ? C.pri : C.borderLight}`, background: filter.val === option ? C.pri : "#fff", color: filter.val === option ? "#fff" : C.text, fontSize: 11, fontWeight: filter.val === option ? 900 : 600, cursor: "pointer", fontFamily: "inherit" }}
                                    >
                                      {field.key === "status" ? getGrassrootsStatusLabel(option) : option}
                                    </button>
                                  ))}
                                </div>
                              ) : field.type === "date" && filter.op !== "inLastDays" ? (
                                <div style={{ maxWidth: 260 }}>
                                  <CalendarPicker
                                    value={filter.val}
                                    onChange={(value) => updateFilter(key, "val", value)}
                                    extraContent={<div style={{ fontSize: 11, color: C.textMut, lineHeight: 1.4 }}>Use today unless you are filtering around a specific follow-up date.</div>}
                                  />
                                  <div style={{ marginTop: 8 }}>
                                    <button type="button" onClick={() => setConfiguringFilterKey(null)} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: C.pri, color: "#fff", fontSize: 11, fontWeight: 900, cursor: "pointer", fontFamily: "inherit" }}>Done</button>
                                  </div>
                                </div>
                              ) : (
                                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                  <input
                                    type={field.type === "date" && filter.op !== "inLastDays" ? "date" : field.type === "number" || filter.op === "inLastDays" ? "number" : "text"}
                                    value={filter.val}
                                    onChange={(event) => updateFilter(key, "val", event.target.value)}
                                    onKeyDown={(event) => { if (event.key === "Enter") setConfiguringFilterKey(null); }}
                                    placeholder={filter.op === "inLastDays" ? "Number of days" : "Type a value..."}
                                    autoFocus
                                    style={{ ...INPUT_STYLE, maxWidth: 220, padding: "8px 12px", borderRadius: 8 }}
                                  />
                                  <button type="button" onClick={() => setConfiguringFilterKey(null)} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: C.pri, color: "#fff", fontSize: 11, fontWeight: 900, cursor: "pointer", fontFamily: "inherit" }}>Done</button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {!showFilterPicker ? (
              <div style={{ marginTop: usedFilterKeys.length > 0 ? 8 : 0, animation: "grassrootsFadeIn 0.2s ease-out" }}>
                <button
                  type="button"
                  onClick={() => { setShowFilterPicker(true); setFilterPickerReady(false); setConfiguringFilterKey(null); setTimeout(() => setFilterPickerReady(true), 10); }}
                  disabled={availableFilterFields.length === 0}
                  style={{ padding: "8px 16px", borderRadius: 10, border: `1.5px dashed ${availableFilterFields.length > 0 ? C.pri : C.border}`, background: "transparent", color: availableFilterFields.length > 0 ? C.pri : C.textMut, fontSize: 12, fontWeight: 900, cursor: availableFilterFields.length > 0 ? "pointer" : "default", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}
                >
                  <I.Plus /> Add Filter
                </button>
              </div>
            ) : (
              <div style={{ marginTop: usedFilterKeys.length > 0 ? 8 : 0, borderRadius: 12, border: `1.5px solid ${C.borderLight}`, background: "#fff", boxShadow: "0 4px 20px rgba(0,0,0,0.06)", overflow: "hidden", animation: "grassrootsSlideIn 0.22s ease-out" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", borderBottom: `1px solid ${C.borderLight}` }}>
                  <span style={{ fontSize: 11, fontWeight: 900, color: C.text }}>Choose a filter</span>
                  <button type="button" onClick={() => setShowFilterPicker(false)} style={{ border: "none", background: "none", cursor: "pointer", color: C.textMut, padding: 2, display: "flex" }}><I.X /></button>
                </div>
                <div style={{ padding: "6px 0" }}>
                  {filterSections.map((section, sectionIndex) => {
                    const sectionFields = availableFilterFields.filter((field) => field.section === section);
                    if (sectionFields.length === 0) return null;
                    return (
                      <div key={section}>
                        <div style={{ padding: "8px 16px 4px", fontSize: 9, fontWeight: 900, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.1em", animation: filterPickerReady ? `grassrootsFadeIn 0.18s ease-out ${sectionIndex * 0.05}s both` : "none" }}>
                          {section}
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, padding: "4px 16px 8px" }}>
                          {sectionFields.map((field, fieldIndex) => (
                            <button
                              key={field.key}
                              type="button"
                              onClick={() => { selectFilterField(field.key); setShowFilterPicker(false); }}
                              style={{ padding: "6px 14px", borderRadius: 8, border: `1.5px solid ${C.borderLight}`, background: "#fff", color: C.text, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", animation: filterPickerReady ? `grassrootsChipIn 0.22s ease-out ${sectionIndex * 0.05 + fieldIndex * 0.03}s both` : "none" }}
                            >
                              {field.label}
                            </button>
                          ))}
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
              <button type="button" onClick={applyFilters} style={{ padding: "8px 20px", borderRadius: 10, border: "none", background: C.pri, color: "#fff", fontSize: 12, fontWeight: 900, cursor: "pointer", fontFamily: "inherit" }}>
                Apply{usedFilterKeys.length > 0 ? ` (${usedFilterKeys.length})` : ""}
              </button>
              <button type="button" onClick={clearFilters} style={{ padding: "8px 14px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: "transparent", color: C.textSec, fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                Clear All
              </button>
              <button type="button" onClick={() => { setShowFilterPanel(false); setShowFilterPicker(false); setConfiguringFilterKey(null); }} style={{ padding: "8px 14px", borderRadius: 10, border: `1.5px solid ${C.borderLight}`, background: "transparent", color: C.textMut, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                Close
              </button>
            </div>
          </div>
        </Card>
      )}

      {schemaMissing ? (
        <Card style={{ padding: 28, textAlign: "center", borderRadius: 14 }}>
          <div style={{ fontSize: 17, fontWeight: 900, color: C.text, marginBottom: 6 }}>Grassroots tables are not installed yet</div>
          <div style={{ fontSize: 13, color: C.textMut, lineHeight: 1.5 }}>
            The app is ready for the Grassroots tables, but the Supabase migration has not been applied to this environment.
          </div>
        </Card>
      ) : loading ? (
        <Card style={{ padding: 36, textAlign: "center", color: C.textMut }}>Loading grassroots tracker...</Card>
      ) : activeLifecycleTab === "history" ? (
        <MarketingHistoryView
          history={history}
          search={lifecycleSearch}
          categoryFilter={historyCategoryFilter}
          onCategoryFilter={setHistoryCategoryFilter}
          actorFilter={historyActorFilter}
          onActorFilter={setHistoryActorFilter}
          onClearFilters={() => { setHistoryCategoryFilter("all"); setHistoryActorFilter("all"); }}
        />
      ) : (
        <div key={activeCategory} className="grassroots-category-stage" style={{ display: "grid", gap: 12 }}>
              {canEditTargets && newDraft && activeConfig.id !== "events" && (
                <div onClick={(e) => { if (e.target === e.currentTarget) closeEditor(); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 1000, padding: "40px 20px", overflowY: "auto" }}>
                  <div style={{ width: "100%", maxWidth: 640 }}>
                    <TargetEditor
                      draft={newDraft}
                      categoryConfig={activeConfig}
                      saving={savingDraft}
                      attachmentsByActivity={attachmentsByActivity}
                      canLog={canLogActivity}
                      onChange={updateDraft}
                      onSave={saveDraft}
                      onCancel={closeEditor}
                      onPreviewAttachment={previewGrassrootsAttachment}
                      previewingAttachmentId={previewingAttachmentId}
                    />
                  </div>
                </div>
              )}

              {activeConfig.id === "drops" && isDropLogActive && (
                <div ref={logComposerScrollRef} className="grassroots-new-draft-anchor">
                  {logActivityEditor}
                </div>
              )}

              {/* Category filters now live in the top header pills area for Drops (per spec). Old component suppressed to avoid duplicate UI. */}

              {activeLifecycleTab === "all" ? (
                <DenseGrassrootsTable
                  targets={allTabTargets}
                  activitiesByTarget={activitiesByTarget}
                  categoryConfig={activeConfig}
                  columnMap={getGrassrootsColumnMap("all")}
                  onLog={openLogModal}
                  onEdit={(t) => {
                    const tabMap = { events: "events", drops: "drops", corporate_partnerships: "corporate", apartments: "apartments", pet_professional_partnerships: "ppp" };
                    const cfg = getGrassrootsCategoryConfig(t.category);
                    if (t.category === "drops") setDropSubview("business");
                    setActiveLifecycleTab(tabMap[t.category] || "events");
                    setActiveCategory(cfg.id);
                    setNewDraft(null);
                    setEditDraft(buildEditorDraft(t));
                  }}
                  onToggleUpdates={toggleUpdates}
                  expandedUpdates={expandedUpdates}
                  followUpSortDirection={followUpSortDirection}
                  onToggleFollowUpSort={toggleFollowUpSort}
                  onShowFollowUpInfo={(target, clickX, clickY) => {
                    const setOn = target.created_at ? fmtDate(target.created_at) : "—";
                    setFollowUpInfo({ targetId: target.id, followUpDate: target.next_contact_date, setOn, x: (clickX ?? 420) + 12, y: (clickY ?? 260) + 8 });
                  }}
                />
              ) : activeConfig.id === "drops" && dropSubview === "activity" ? (
                <DenseGrassrootsTable
                  targets={filteredDropActivityRows}
                  activitiesByTarget={{}}
                  categoryConfig={activeConfig}
                  columnMap={getGrassrootsColumnMap("drops", "activity")}
                  onEdit={openEditDropActivity}
                  expandedUpdates={new Set()}
                />
              ) : visibleTargets.length === 0 && !newDraft ? (
                <Card style={{ padding: 30, textAlign: "center", color: C.textMut, borderRadius: 14 }}>
                  <div style={{ fontSize: 16, fontWeight: 900, color: C.text, marginBottom: 6 }}>No {activeConfig.label.toLowerCase()} match this view</div>
                  <div style={{ fontSize: 13, marginBottom: 16 }}>Add a row or adjust the filter.</div>
                  {canEditTargets && <Btn variant="primary" size="sm" icon={<I.Plus />} onClick={openNewDraft} style={{ padding: '6px 12px', fontSize: '12px', fontWeight: 600 }}>Add {activeConfig.singular}</Btn>}
                </Card>
              ) : (
                <>
                  {activeConfig.id === "events" ? (
                    <>
                      {/* New event — quick-capture in a shared modal (not an inline row). */}
                      {canEditTargets && newDraft && (
                        <Modal title="New Event" onClose={closeEditor} wide>
                          <EventTargetInlineEditor
                            inModal
                            key="new-event-draft"
                            draft={newDraft}
                            saving={savingDraft}
                            onChange={updateDraft}
                            onSave={saveDraft}
                            onCancel={closeEditor}
                            organizerOptions={organizerOptions}
                          />
                        </Modal>
                      )}
                      {/* Editing an existing event happens via the per-column cell pencils
                          (organizer / event / date), and closing via the Close button — both
                          driven through onOpenCellEditor / onCloseEvent below. */}
                      {/* THE DENSE CLIENTS-STYLE TABLE for Events — exact whitespace, columns, follow-up + log behavior */}
                      <DenseGrassrootsTable
                        targets={lifecycleDisplayTargets}
                        activitiesByTarget={activitiesByTarget}
                        categoryConfig={activeConfig}
                        isEventsTable
                        onLog={startInlineLog}
                        onOpenCellEditor={openCellEditor}
                        onCloseEvent={openCloseout}
                        onSetStatus={setTargetStatus}
                        onOpenRecord={openRecordModal}
                        onUpdateFollowUp={updateFollowUpDate}
                        onToggleUpdates={toggleUpdates}
                        expandedUpdates={expandedUpdates}
                        eventDateSortDirection={eventDateSortDirection}
                        onToggleEventDateSort={toggleEventDateSort}
                        followUpSortDirection={followUpSortDirection}
                        onToggleFollowUpSort={toggleFollowUpSort}
                        costSortDirection={costSortDirection}
                        onToggleCostSort={toggleCostSort}
                        onShowFollowUpInfo={(target, clickX, clickY) => {
                          const targetActivities = activitiesByTarget[target.id] || [];
                          const latestFollowUpActivity = [...targetActivities]
                            .filter(a => a.notes && a.notes.toLowerCase().includes('follow'))
                            .sort((a, b) => String(b.created_at || b.activity_date).localeCompare(String(a.created_at || a.activity_date)))[0];
                          const setOn = latestFollowUpActivity 
                            ? fmtDate(latestFollowUpActivity.activity_date || latestFollowUpActivity.created_at)
                            : (target.created_at ? fmtDate(target.created_at) : "—");

                          // Use real click position instead of hardcoded values.
                          // Offset a bit so the popover appears near (but not directly on top of) the clicked Follow-Up cell.
                          const x = (clickX ?? 420) + 12;
                          const y = (clickY ?? 260) + 8;

                          setFollowUpInfo({ targetId: target.id, followUpDate: target.next_contact_date, setOn, x, y });
                        }}
                        inlineLoggingId={inlineLoggingId}
                        inlineLogNotes={inlineLogNotes}
                        inlineLogNextDate={inlineLogNextDate}
                        onStartInlineLog={startInlineLog}
                        onInlineLogNotesChange={setInlineLogNotes}
                        onInlineLogNextDateChange={setInlineLogNextDate}
                        savingLog={savingLog}
                        onSaveInlineLog={async () => {
                          const target = inlineLogTargetRef.current
                            || lifecycleDisplayTargets.find(t => t.id === inlineLoggingId)
                            || targets.find(t => t.id === inlineLoggingId);
                          if (!target) {
                            toast("Could not find the row to log against", "error");
                            return;
                          }

                          const notes = (inlineLogNotes || "").trim();
                          const nextDate = inlineLogNextDate || null;

                          setSavingLog(true);
                          try {
                            const activityId = createGrassrootsClientUuid ? createGrassrootsClientUuid() : crypto.randomUUID();

                            // Insert the activity (same pattern as the big log modal for Events)
                            const { error: insertErr } = await supabase.from("grassroots_activity").insert({
                              id: activityId,
                              location_id: locationId,
                              target_id: target.id,
                              activity_type: getGrassrootsActivityType(target.category || activeConfig.id),
                              activity_date: todayStr(),
                              notes: notes || "Logged",
                              next_contact_date: nextDate,
                              created_by_user_id: actor.userId,
                              created_by_name: actor.name,
                            });

                            if (insertErr) throw insertErr;

                            // Sync the follow-up to the composer's date. Logging with the
                            // date field left blank CLEARS an existing follow-up (you've
                            // followed up, nothing more scheduled).
                            if ((nextDate || null) !== (target.next_contact_date || null)) {
                              await updateFollowUpDate(target, nextDate || null);
                            }

                            // Refresh (loadGrassroots updates targets/activities state itself)
                            await loadGrassroots();

                            // Clear composer, keep the row expanded so the new log appears in history
                            setInlineLoggingId(null);
                            setInlineLogNotes("");
                            setInlineLogNextDate("");
                            toast("Log saved");
                          } catch (err) {
                            console.error("inline log save failed", err);
                            toast(err?.message || "Failed to save log", "error");
                          } finally {
                            setSavingLog(false);
                          }
                        }}
                        onCancelInlineLog={() => {
                          // Opening Log auto-expands the updates history; closing it should
                          // also collapse that history, so the row returns to its prior state.
                          setExpandedUpdates((prev) => {
                            if (!inlineLoggingId || !prev.has(inlineLoggingId)) return prev;
                            const next = new Set(prev);
                            next.delete(inlineLoggingId);
                            return next;
                          });
                          setInlineLoggingId(null);
                          setInlineLogNotes("");
                          setInlineLogNextDate("");
                        }}
                      />
                      {inlineLoggingId && (() => {
                        const logTarget = inlineLogTargetRef.current
                          || lifecycleDisplayTargets.find((t) => t.id === inlineLoggingId)
                          || targets.find((t) => t.id === inlineLoggingId);
                        const logTargetName = logTarget?.name || logTarget?.organizer || "event";
                        const closeInlineLog = () => {
                          setExpandedUpdates((prev) => {
                            if (!inlineLoggingId || !prev.has(inlineLoggingId)) return prev;
                            const next = new Set(prev);
                            next.delete(inlineLoggingId);
                            return next;
                          });
                          setInlineLoggingId(null);
                        };
                        return (
                          <LogEntryModal
                            title={`Log update — ${logTargetName}`}
                            notesLabel="Notes"
                            notesPlaceholder="Notes about this outreach / development…"
                            followUpLabel="Next follow-up date"
                            followUpOptional
                            today={todayStr()}
                            initialDate={logTarget?.next_contact_date || ""}
                            saveLabel="Save log"
                            saving={savingLog}
                            onClose={closeInlineLog}
                            onSave={async ({ notes, date }) => {
                              if (!logTarget) { toast("Could not find the row to log against", "error"); return; }
                              const trimmed = (notes || "").trim();
                              const nextDate = date || null;
                              setSavingLog(true);
                              try {
                                const activityId = createGrassrootsClientUuid ? createGrassrootsClientUuid() : crypto.randomUUID();
                                const { error: insertErr } = await supabase.from("grassroots_activity").insert({
                                  id: activityId,
                                  location_id: locationId,
                                  target_id: logTarget.id,
                                  activity_type: getGrassrootsActivityType(logTarget.category || activeConfig.id),
                                  activity_date: todayStr(),
                                  notes: trimmed || "Logged",
                                  next_contact_date: nextDate,
                                  created_by_user_id: actor.userId,
                                  created_by_name: actor.name,
                                });
                                if (insertErr) throw insertErr;
                                if ((nextDate || null) !== (logTarget.next_contact_date || null)) {
                                  await updateFollowUpDate(logTarget, nextDate || null);
                                }
                                await loadGrassroots();
                                setInlineLoggingId(null);
                                toast("Log saved");
                              } catch (err) {
                                console.error("inline log save failed", err);
                                toast(err?.message || "Failed to save log", "error");
                              } finally {
                                setSavingLog(false);
                              }
                            }}
                          />
                        );
                      })()}
                    </>
                  ) : (
                    <>
                      {/* Non-events full edit (via the Edit button) — in a shared modal. The
                          per-cell pencils open the smaller cellEditor modal instead, so this
                          only renders when NOT doing a scoped cell edit. */}
                      {canEditTargets && editDraft && !cellEditor && (
                        <div onClick={(e) => { if (e.target === e.currentTarget) closeEditor(); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)", display: "flex", alignItems: "flex-start", justifyContent: "center", zIndex: 1000, padding: "40px 20px", overflowY: "auto" }}>
                          <div style={{ width: "100%", maxWidth: 640 }}>
                            <TargetEditor
                              key={editDraft.id}
                              draft={editDraft}
                              categoryConfig={activeConfig}
                              saving={savingDraft}
                              activities={activitiesByTarget[editDraft.id] || []}
                              attachmentsByActivity={attachmentsByActivity}
                              canLog={canLogActivity}
                              onChange={updateDraft}
                              onSave={saveDraft}
                              onCancel={closeEditor}
                              onDelete={() => deleteTarget(editDraft)}
                              onLog={() => openLogModal(editDraft)}
                              onPreviewAttachment={previewGrassrootsAttachment}
                              previewingAttachmentId={previewingAttachmentId}
                              organizerOptions={organizerOptions}
                            />
                          </div>
                        </div>
                      )}
                      {/* Unified dense table — same component as Events, mapped per category via columnMap */}
                      <DenseGrassrootsTable
                        targets={sortedVisibleTargets}
                        activitiesByTarget={activitiesByTarget}
                        categoryConfig={activeConfig}
                        columnMap={getGrassrootsColumnMap(activeConfig.id, activeConfig.id === "drops" ? dropSubview : null)}
                        onLog={openLogModal}
                        onEdit={(t) => { setNewDraft(null); setEditDraft(buildEditorDraft(t)); }}
                        onSetStatus={activeConfig.id === "drops" ? undefined : setTargetStatus}
                        onOpenCellEditor={openCellEditor}
                        onToggleUpdates={toggleUpdates}
                        expandedUpdates={expandedUpdates}
                        followUpSortDirection={followUpSortDirection}
                        onToggleFollowUpSort={toggleFollowUpSort}
                        onShowFollowUpInfo={(target, clickX, clickY) => {
                          const setOn = target.created_at ? fmtDate(target.created_at) : "—";
                          setFollowUpInfo({ targetId: target.id, followUpDate: target.next_contact_date, setOn, x: (clickX ?? 420) + 12, y: (clickY ?? 260) + 8 });
                        }}
                      />
                    </>
                  )}
                </>
              )}
            </div>
      )}

      {canEditTargets && movePopover && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9998 }} onClick={() => setMovePopover(null)}>
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              position: "fixed",
              left: Math.min(movePopover.x || 300, window.innerWidth - 320),
              top: movePopover.y || 200,
              zIndex: 9999,
              width: 300,
              background: C.surface,
              border: `1.5px solid ${C.border}`,
              borderRadius: 14,
              boxShadow: "0 12px 40px rgba(15,23,42,0.18)",
              padding: 12,
            }}
          >
            <div style={{ padding: "4px 4px 10px", fontSize: 12, fontWeight: 900, color: C.text, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Move to
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              {GRASSROOTS_CATEGORY_CONFIGS
                .filter((category) => category.dbValue !== movePopover.target.category)
                .map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => moveTarget(movePopover.target, category)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: `1.5px solid ${C.borderLight}`,
                      background: "#fff",
                      color: C.text,
                      fontSize: 13,
                      fontWeight: 800,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      textAlign: "left",
                    }}
                  >
                    <span>{category.label}</span>
                    <I.ChevronRight />
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
      </div>

      {/* Small "set/created" info popover for Follow-up column — matches Customer Lifecycle reference click behavior (no direct edit prompt) */}
      {followUpInfo && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9998 }} onClick={() => setFollowUpInfo(null)}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              // Better viewport-aware positioning so it doesn't fly off to the left or off-screen
              left: Math.max(8, Math.min(
                (followUpInfo.x || 380),
                (typeof window !== 'undefined' ? window.innerWidth : 1400) - 280
              )),
              top: Math.max(8, Math.min(
                (followUpInfo.y || 240),
                (typeof window !== 'undefined' ? window.innerHeight : 900) - 140
              )),
              zIndex: 9999,
              minWidth: 260,
              background: C.surface,
              border: `1.5px solid ${C.border}`,
              borderRadius: 10,
              boxShadow: "0 12px 40px rgba(0,0,0,0.12)",
              padding: "12px 14px",
              fontSize: 12,
            }}
          >
            <div style={{ fontWeight: 700, color: C.pri, marginBottom: 6 }}>Follow-up date</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 8 }}>{followUpInfo.followUpDate ? fmtDate(followUpInfo.followUpDate) : "—"}</div>
            <div style={{ fontSize: 11, color: C.textSec }}>Set on: <span style={{ fontWeight: 700, color: C.text }}>{followUpInfo.setOn || "—"}</span></div>
            <div style={{ marginTop: 10, fontSize: 10, color: C.textMut }}>Use the Log button on this row to change the next follow-up date.</div>
            <button onClick={() => setFollowUpInfo(null)} style={{ position: "absolute", top: 6, right: 8, border: "none", background: "transparent", color: C.textMut, fontSize: 14, cursor: "pointer" }}>×</button>
          </div>
        </div>
      )}

      {!isDropLogActive && logActivityEditor}

      {/* Shared record + activity modal — the clean white pop-up log view (the
          standard focused record/history surface, shared with the CRM). */}
      {recordModalTarget && (() => {
        const t = recordModalTarget;
        const acts = [...(activitiesByTarget[t.id] || [])]
          .sort((a, b) => String(b.created_at || b.activity_date || "").localeCompare(String(a.created_at || a.activity_date || "")))
          .map((act) => ({
            id: act.id,
            actor: activityActorName(act),
            timestamp: `${fmtDate(act.activity_date || act.created_at)}${act.created_at ? ` · ${new Date(act.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}` : ""}`,
            body: act.notes,
            meta: act.next_contact_date ? <span>Follow-up: {fmtDate(act.next_contact_date)}</span> : null,
          }));
        const eventDates = normalizeGrassrootsEventDates(t);
        const dateStr = eventDates.length
          ? eventDates.map((d) => fmtDate(d.event_date || d)).filter(Boolean).join(" · ")
          : (t.event_date ? fmtDate(t.event_date) : "—");
        const closed = isGrassrootsEventClosed(t);
        const closeout = closed ? getGrassrootsEventCloseout(t) : null;
        const statusText = closed ? (closeout?.disposition === "cancelled" ? "Cancelled" : "Finished") : getGrassrootsStatusLabel(t.status);
        const statusKey = closed ? (closeout?.disposition === "cancelled" ? "cancelled" : "finished") : t.status;
        const sty = { identified: { bg: "#FEF3C7", fg: "#92400E" }, corresponding: { bg: "#DBEAFE", fg: "#1E40AF" }, booked: { bg: "#DCFCE7", fg: "#166534" }, finished: { bg: "#DCFCE7", fg: "#166534" }, abandoned: { bg: "#FEE2E2", fg: "#991B1B" }, cancelled: { bg: "#F1F5F9", fg: "#475569" } }[statusKey] || { bg: C.priLt, fg: C.pri };
        const costStr = (t.cost !== null && t.cost !== undefined && t.cost !== "") ? fmtCurrencyNumber(t.cost) : null;
        const contact = [t.contact_phone, t.contact_email].filter(Boolean).join(" · ");
        const Field = ({ label, value }) => (
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: C.textMut, marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: 13.5, color: C.text, fontWeight: 600 }}>{value || "—"}</div>
          </div>
        );
        const ctx = (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: "14px 24px" }}>
            <Field label="Organizer" value={t.organizer} />
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: C.textMut, marginBottom: 4 }}>Status</div>
              <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 10px", borderRadius: 999, fontSize: 11, fontWeight: 800, background: sty.bg, color: sty.fg }}>{statusText}</span>
            </div>
            <Field label="Date" value={dateStr} />
            <Field label="Follow-up" value={t.next_contact_date ? fmtDate(t.next_contact_date) : "—"} />
            {costStr && <Field label="Cost" value={costStr} />}
            {contact && <Field label="Contact" value={contact} />}
          </div>
        );
        return (
          <RecordActivityModal
            title={t.name || t.organizer || "Record"}
            context={ctx}
            activities={acts}
            emptyText="No activity logged yet."
            onLog={() => { setRecordModalTarget(null); startInlineLog(t); }}
            onClose={() => setRecordModalTarget(null)}
          />
        );
      })()}

      {/* Per-column micro-editor — a small modal scoped to the cell's field group. */}
      {cellEditor && editDraft && (
        <Modal
          title={{
            organizer: "Edit organizer & contact",
            event: "Edit event details",
            date: "Edit event date(s)",
            businessContact: "Edit business & contact",
            category: "Edit category",
          }[cellEditor.group] || "Edit"}
          onClose={savingDraft ? () => {} : closeEditor}
        >
          <div style={{ display: "grid", gap: 12, width: "100%" }}>
            {cellEditor.group === "businessContact" && (
              <>
                <FieldEditor field={{ key: "name", label: "Business Name", placeholder: "Business name" }} value={editDraft.name} onChange={(v) => updateDraft("name", v)} />
                <FieldEditor field={{ key: "first_name", label: "Contact Name", placeholder: "Who you speak with" }} value={editDraft.first_name} onChange={(v) => updateDraft("first_name", v)} />
                <FieldEditor field={{ key: "contact_phone", label: "Phone", placeholder: "Phone number" }} value={editDraft.contact_phone} onChange={(v) => updateDraft("contact_phone", v)} />
                <FieldEditor field={{ key: "contact_email", label: "Email", type: "email", placeholder: "Email" }} value={editDraft.contact_email} onChange={(v) => updateDraft("contact_email", v)} />
                <div style={{ fontSize: 11, color: C.textMut, lineHeight: 1.4 }}>Contacts will link to the Marketing Directory once it's available.</div>
              </>
            )}
            {cellEditor.group === "category" && (
              <FieldEditor field={{ key: "business_category", label: "Category", type: "select", options: GRASSROOTS_BUSINESS_CATEGORY_OPTIONS, allowCustom: true, placeholder: "Select a category" }} value={editDraft.business_category} onChange={(v) => { updateDraft("business_category", v); updateDraft("drop_category", v); }} />
            )}
            {cellEditor.group === "organizer" && (
              <>
                <OrganizerAutocomplete label="Organizer" value={editDraft.organizer} onChange={(v) => updateDraft("organizer", v)} options={organizerOptions} placeholder="Organizer" />
                <FieldEditor field={{ key: "first_name", label: "Contact Name", placeholder: "Contact name" }} value={editDraft.first_name} onChange={(v) => updateDraft("first_name", v)} />
                <FieldEditor field={{ key: "contact_email", label: "Contact Email", type: "email", placeholder: "Contact email" }} value={editDraft.contact_email} onChange={(v) => updateDraft("contact_email", v)} />
                <FieldEditor field={{ key: "contact_phone", label: "Contact Number", placeholder: "Contact number" }} value={editDraft.contact_phone} onChange={(v) => updateDraft("contact_phone", v)} />
                <div style={{ fontSize: 11, color: C.textMut, lineHeight: 1.4 }}>Organizer &amp; contact will link to the Marketing Directory once it's available.</div>
              </>
            )}
            {cellEditor.group === "event" && (
              <>
                <FieldEditor field={{ key: "name", label: "Event Name", placeholder: "Event name" }} value={editDraft.name} onChange={(v) => updateDraft("name", v)} />
                <SplitAddressFields draft={editDraft} onChange={updateDraft} onPlaceSelect={(parts) => Object.entries(parts || {}).forEach(([k, v]) => updateDraft(k, v || ""))} placeholder="Event address" />
                <EventTypePicker value={editDraft.event_type} onChange={(v) => updateDraft("event_type", v)} />
                <FieldEditor field={{ key: "cost", label: "Cost", type: "number", placeholder: "Cost" }} value={editDraft.cost} onChange={(v) => updateDraft("cost", v)} />
              </>
            )}
            {cellEditor.group === "date" && (
              <EventDateEditor draft={editDraft} onChange={updateDraft} />
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 2, paddingTop: 10, borderTop: `1px solid ${C.borderLight}` }}>
              <Btn variant="ghost" onClick={closeEditor} disabled={savingDraft}>Cancel</Btn>
              <Btn variant="primary" onClick={saveDraft} disabled={savingDraft}>{savingDraft ? "Saving…" : "Save"}</Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* Event closeout — asks for leads, shows computed CPL (read-only), captures lessons learned. */}
      {closeoutModal && (() => {
        const t = closeoutModal.target;
        const leadsNum = parseNumberField(closeoutLeads) ?? 0;
        const costNum = parseNumberField(t.cost);
        const cplText = fmtCurrencyNumber(calculateGrassrootsCpl(costNum, leadsNum));
        const finalDate = getGrassrootsFinalEventDate(t);
        const costText = fmtCurrencyNumber(costNum);
        return (
          <Modal title="Close out event" onClose={savingCloseout ? () => {} : closeCloseout}>
            <div style={{ display: "grid", gap: 14, width: "100%" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{t.name || "Event"}</div>
                <div style={{ fontSize: 11, color: C.textMut, marginTop: 2 }}>
                  {finalDate ? `Final day ${fmtDate(finalDate)}` : ""}{finalDate && costText ? " · " : ""}{costText ? `Cost $${costText}` : ""}
                </div>
              </div>
              {/* Disposition: did the event happen for us, or did we pay but not attend? */}
              <div>
                <Label>How did it end?</Label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 4 }}>
                  {[
                    { id: "completed", label: "Completed", sub: "We attended" },
                    { id: "cancelled", label: "Couldn't attend", sub: "Paid, didn't go" },
                  ].map((opt) => {
                    const on = closeoutDisposition === opt.id;
                    const tone = opt.id === "cancelled" ? C.warn : C.pri;
                    return (
                      <button key={opt.id} type="button" onClick={() => setCloseoutDisposition(opt.id)}
                        style={{ textAlign: "left", padding: "8px 11px", borderRadius: 10, border: `1.5px solid ${on ? tone : C.border}`, background: on ? `${tone}12` : "transparent", cursor: "pointer", fontFamily: "inherit" }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: on ? tone : C.text }}>{opt.label}</div>
                        <div style={{ fontSize: 10, fontWeight: 600, color: C.textMut, marginTop: 1 }}>{opt.sub}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
              {closeoutDisposition === "cancelled" ? (
                <div style={{ fontSize: 11, color: C.textMut, lineHeight: 1.45, background: `${C.warn}10`, border: `1px solid ${C.warn}30`, borderRadius: 8, padding: "8px 10px" }}>
                  {costText ? `The $${costText} you already paid stays recorded as marketing spend.` : "The cost you already paid stays recorded as marketing spend."} No leads are counted and CPL is not applicable.
                </div>
              ) : (
                <>
                  <div>
                    <Label>Leads Captured</Label>
                    <input type="number" min="0" value={closeoutLeads} onChange={(e) => setCloseoutLeads(e.target.value)} placeholder="0" autoFocus style={{ ...INPUT_STYLE, width: "100%" }} />
                  </div>
                  <div>
                    <Label>CPL — Cost per Lead (auto)</Label>
                    <input type="text" value={cplText ? `$${cplText}` : "—"} readOnly tabIndex={-1} title="Calculated from cost ÷ leads captured — not directly editable" style={{ ...INPUT_STYLE, width: "100%", background: C.bg, color: C.textMut, cursor: "not-allowed" }} />
                  </div>
                </>
              )}
              <div>
                <Label>{closeoutDisposition === "cancelled" ? "Notes — why couldn't you attend?" : "Notes — Lessons Learned"}</Label>
                <textarea
                  value={closeoutNotes}
                  onChange={(e) => setCloseoutNotes(e.target.value)}
                  rows={4}
                  placeholder={closeoutDisposition === "cancelled"
                    ? "What happened? (e.g. short-notice conflict). Would you book this event again?"
                    : "Use this opportunity to reflect on lessons learned. What went well? Would you do this event again? What would you do differently?"}
                  style={{ width: "100%", padding: "9px 11px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }}
                />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 4 }}>
                <Btn variant="ghost" onClick={closeCloseout} disabled={savingCloseout}>Cancel</Btn>
                <Btn variant="primary" onClick={saveCloseout} disabled={savingCloseout}>{savingCloseout ? "Saving…" : (closeoutDisposition === "cancelled" ? "Mark Cancelled" : "Close Event")}</Btn>
              </div>
            </div>
          </Modal>
        );
      })()}

      {attachmentPreview && (
        <Modal title={attachmentPreview.attachment?.file_name || "Attachment Preview"} onClose={() => setAttachmentPreview(null)} fullWidth>
          <div style={{ height: "calc(100vh - 180px)", minHeight: 420, display: "flex", alignItems: "center", justifyContent: "center", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
            {attachmentPreview.kind === "image" ? (
              <img
                src={attachmentPreview.url}
                alt={attachmentPreview.attachment?.file_name || "Grassroots attachment"}
                style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
              />
            ) : (
              <iframe
                title={attachmentPreview.attachment?.file_name || "Grassroots attachment"}
                src={`${attachmentPreview.url}#toolbar=0&navpanes=0&scrollbar=1`}
                style={{ width: "100%", height: "100%", border: "none", background: "#fff" }}
              />
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
