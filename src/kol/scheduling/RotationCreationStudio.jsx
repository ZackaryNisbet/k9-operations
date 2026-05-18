import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { C } from "../../shared/theme";
import { I } from "../../shared/icons";
import { Btn } from "../../shared/ui";
import {
  TASK_COLORS,
  deriveStaffPlanFromShiftEntries,
} from "../../shared/schedulingEngine";
import {
  findRotationTemplateCandidates,
  getTemplateDisplayName,
} from "./rotationTemplateMatcher";
import {
  buildBlankRotationPreviewGrid,
  buildTemplatePreviewGrid,
  mapTemplatePreviewToServerGrid,
} from "./rotationTemplatePreview";

const ROLE_CONFIG = [
  { key: "pct", label: "PCT", short: "PCT", position: "pct" },
  { key: "supervisor", label: "Supervisor", short: "SUP", position: "supervisor" },
  { key: "csr", label: "CSR", short: "CSR", position: "csr" },
  { key: "manager", label: "MOD", short: "MOD", position: "mod" },
];

const SHIFT_CONFIG = [
  { key: "opening", label: "Opening", short: "AM" },
  { key: "closing", label: "Closing", short: "PM" },
];

const TASK_PICKER_KEYS = [
  "lgdc",
  "smdc",
  "pp",
  "break",
  "bath",
  "transport",
  "feed",
  "opening",
  "room_clean",
  "sup",
  "float",
  "off",
];

function toCount(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(24, Math.round(number))) : 0;
}

function isWeekendDate(date) {
  const parsed = new Date(`${date || ""}T12:00:00`);
  return Number.isFinite(parsed.getTime()) && [0, 6].includes(parsed.getDay());
}

function formatDayLabel(day) {
  if (!day?.date) return "Fresh schedule";
  const parsed = new Date(`${day.date}T12:00:00`);
  if (!Number.isFinite(parsed.getTime())) return day.date;
  return parsed.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function parseScheduleDate(date) {
  const parsed = new Date(`${date || ""}T12:00:00`);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function dateToIso(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function addScheduleDays(date, offset) {
  const parsed = parseScheduleDate(date);
  if (!parsed) return date;
  parsed.setDate(parsed.getDate() + offset);
  return dateToIso(parsed);
}

function getScheduleMonthStart(date) {
  const parsed = parseScheduleDate(date) || new Date();
  parsed.setDate(1);
  return dateToIso(parsed);
}

function shiftScheduleMonth(date, offset) {
  const parsed = parseScheduleDate(getScheduleMonthStart(date)) || new Date();
  parsed.setMonth(parsed.getMonth() + offset);
  parsed.setDate(1);
  return dateToIso(parsed);
}

function getScheduleWeekStart(date) {
  const parsed = parseScheduleDate(date);
  if (!parsed) return date;
  const day = parsed.getDay();
  parsed.setDate(parsed.getDate() + (day === 0 ? -6 : 1 - day));
  return dateToIso(parsed);
}

function getScheduleCalendarDates(monthDate) {
  const start = getScheduleWeekStart(getScheduleMonthStart(monthDate));
  return Array.from({ length: 42 }, (_, index) => addScheduleDays(start, index));
}

function getCalendarMonthLabel(date) {
  const parsed = parseScheduleDate(date);
  if (!parsed) return "Calendar";
  return parsed.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function getFullScheduleDateLabel(date) {
  const parsed = parseScheduleDate(date);
  if (!parsed) return "Select a date";
  return parsed.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function getCompactScheduleDateLabel(date) {
  const parsed = parseScheduleDate(date);
  if (!parsed) return date || "";
  return parsed.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function getRelativeScheduleDateLabel(date, today) {
  if (!date || !today) return "";
  const selected = parseScheduleDate(date);
  const current = parseScheduleDate(today);
  if (!selected || !current) return "";
  const diff = Math.round((selected.getTime() - current.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return selected.toLocaleDateString("en-US", { weekday: "short" });
}

function getNextSaturday(today) {
  const parsed = parseScheduleDate(today);
  if (!parsed) return today;
  const day = parsed.getDay();
  const offset = ((6 - day + 7) % 7) || 7;
  return addScheduleDays(today, offset);
}

function getDateScheduleState({ date, today, visibleDay, summary }) {
  if (summary?.published > 0) {
    return {
      tone: "published",
      label: "Published",
      detail: `${summary.published} published schedule${summary.published === 1 ? "" : "s"}${summary.draft ? `, ${summary.draft} draft${summary.draft === 1 ? "" : "s"}` : ""}`,
    };
  }
  if (summary?.draft > 0) {
    return {
      tone: "draft",
      label: "Draft",
      detail: `${summary.draft} draft version${summary.draft === 1 ? "" : "s"} ready to review`,
    };
  }
  if (visibleDay?.staffPlan) {
    return {
      tone: "staffed",
      label: "Staffed",
      detail: "Actual staffing has been saved for this day",
    };
  }
  if (visibleDay?.canGenerate) {
    return {
      tone: "ready",
      label: "Ready",
      detail: "Demand matrix is ready for schedule generation",
    };
  }
  if (visibleDay?.hasNoData || visibleDay?.matrixTrustState === "missing") {
    return {
      tone: "missing",
      label: date < today ? "No matrix" : "Pending",
      detail: date < today ? "No computed Demand Matrix row for this historical day" : "Demand Matrix compute has not returned for this day yet",
    };
  }
  return {
    tone: date < today ? "past" : "open",
    label: date < today ? "No submission" : "Open",
    detail: date < today ? "No saved rotation schedule found for this day" : "Future rotation schedule can be started here",
  };
}

function formatTimeLabel(time) {
  const [hourRaw, minute = "00"] = String(time || "00:00").split(":");
  const hour = Number(hourRaw);
  const suffix = hour >= 12 ? "PM" : "AM";
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${hour12}:${minute} ${suffix}`;
}

function getShiftWindows(day, config = {}) {
  const weekend = Boolean(day?.isWeekend ?? isWeekendDate(day?.date));
  const siteHours = weekend
    ? config.weekend_site_hours || ["07:00", "18:00"]
    : config.weekday_site_hours || ["06:00", "19:30"];
  return {
    opening: { start: siteHours[0] || (weekend ? "07:00" : "06:00"), end: "13:00" },
    closing: { start: "13:00", end: siteHours[1] || (weekend ? "18:00" : "19:30") },
  };
}

function buildDefaultStaffingMatrix(day, rotation) {
  return {
    opening: {
      manager: 1,
      supervisor: 1,
      csr: 0,
      pct: 4,
    },
    closing: {
      manager: 1,
      supervisor: 1,
      csr: 0,
      pct: 4,
    },
  };
}

function countShiftTotal(counts = {}) {
  return ROLE_CONFIG.reduce((sum, role) => sum + toCount(counts[role.key]), 0);
}

function buildRowsForShift({ shiftKey, counts, day, config, previousRows = [] }) {
  const windows = getShiftWindows(day, config);
  const rows = [];
  for (const role of ROLE_CONFIG) {
    const count = toCount(counts?.[role.key]);
    const prior = previousRows.filter((row) => row.roleKey === role.key);
    for (let index = 0; index < count; index += 1) {
      const existing = prior[index] || {};
      rows.push({
        id: `${shiftKey}-${role.position}-${index + 1}`,
        shiftKey,
        roleKey: role.key,
        position: role.position,
        label: `${role.short} ${index + 1}`,
        name: existing.name || "",
        shift_start: existing.shift_start || windows[shiftKey].start,
        shift_end: existing.shift_end || windows[shiftKey].end,
      });
    }
  }
  return rows;
}

function reconcileShiftDetails(current, matrix, day, config) {
  return Object.fromEntries(SHIFT_CONFIG.map((shift) => [
    shift.key,
    buildRowsForShift({
      shiftKey: shift.key,
      counts: matrix?.[shift.key] || {},
      day,
      config,
      previousRows: current?.[shift.key] || [],
    }),
  ]));
}

function clonePreviewGrid(grid) {
  return {
    ...grid,
    lanes: [...(grid?.lanes || [])],
    slots: [...(grid?.slots || [])],
    cells: Object.fromEntries(Object.entries(grid?.cells || {}).map(([laneId, laneCells]) => [
      laneId,
      { ...laneCells },
    ])),
  };
}

function getCandidateId(match) {
  return match?.template?.id || match?.template?.sourceSheetName || "";
}

function getTaskCell(taskKey, label = "") {
  const task = TASK_COLORS[taskKey] ? taskKey : "float";
  return {
    task,
    label: label || TASK_COLORS[task]?.label || "Available",
    detail: "Manual draft edit",
    source: "custom",
  };
}

function CountStepper({ label, value, onChange, disabled }) {
  const count = toCount(value);
  return (
    <div className="rotation-count-stepper">
      <div>
        <span className="rotation-count-label">{label}</span>
        <span className="rotation-count-value">{count}</span>
      </div>
      <div className="rotation-count-controls">
        <button type="button" onClick={() => onChange(count - 1)} disabled={disabled || count <= 0} aria-label={`Decrease ${label}`}>
          -
        </button>
        <button type="button" onClick={() => onChange(count + 1)} disabled={disabled || count >= 24} aria-label={`Increase ${label}`}>
          +
        </button>
      </div>
    </div>
  );
}

function TemplateThumbnail({ match }) {
  const template = match?.template;
  const preview = useMemo(() => buildTemplatePreviewGrid(template, { shift: template?.shift }), [template]);
  const lanes = preview.lanes.slice(0, 3);
  const slots = preview.slots.slice(0, 6);
  return (
    <div className="rotation-template-thumb" aria-hidden="true">
      {lanes.map((lane) => (
        <div key={lane.id} className="rotation-template-thumb-lane">
          {slots.map((slot) => {
            const task = preview.cells?.[lane.id]?.[slot.time]?.task || "off";
            const color = TASK_COLORS[task] || TASK_COLORS.float;
            return (
              <span
                key={`${lane.id}-${slot.time}`}
                style={{
                  background: task === "off" ? "#F8FAFC" : color.bg,
                  borderColor: task === "off" ? "#E5E7EB" : `${color.text}22`,
                }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

function TemplateCard({
  match,
  applied,
  previewing,
  onPreview,
  onPreviewEnd,
  onApply,
}) {
  const displayName = getTemplateDisplayName(match);
  const confidence = match?.confidence || "fallback";
  const fit = Math.round(match?.score || 0);
  const explanation = match?.explanation || "Closest workbook match";
  return (
    <button
      type="button"
      className={`rotation-template-card${applied ? " is-applied" : ""}${previewing ? " is-previewing" : ""}`}
      aria-label={`${displayName}. ${confidence} confidence, ${fit} fit. ${explanation}`}
      title={`${displayName}\n${explanation}`}
      onMouseEnter={onPreview}
      onMouseLeave={onPreviewEnd}
      onFocus={onPreview}
      onBlur={onPreviewEnd}
      onClick={onApply}
    >
      <TemplateThumbnail match={match} />
      <span className="rotation-template-card-name">{displayName}</span>
    </button>
  );
}

function RosterEditor({ rows, onChange, disabled }) {
  if (!rows.length) {
    return (
      <div className="rotation-roster-empty">
        Add at least one employee to this shift to enable name and time adjustments.
      </div>
    );
  }
  return (
    <div className="rotation-roster-grid">
      {rows.map((row) => (
        <div key={row.id} className="rotation-roster-row">
          <div className="rotation-roster-role">
            <strong>{row.label}</strong>
            <span>{ROLE_CONFIG.find((role) => role.key === row.roleKey)?.label}</span>
          </div>
          <input
            type="text"
            value={row.name}
            placeholder="Name optional"
            disabled={disabled}
            onChange={(event) => onChange(row.id, { name: event.target.value })}
          />
          <input
            type="time"
            value={row.shift_start}
            disabled={disabled}
            onChange={(event) => onChange(row.id, { shift_start: event.target.value })}
          />
          <input
            type="time"
            value={row.shift_end}
            disabled={disabled}
            onChange={(event) => onChange(row.id, { shift_end: event.target.value })}
          />
        </div>
      ))}
    </div>
  );
}

function PreviewCanvas({
  grid,
  hoverGrid,
  applied,
  customizeMode,
  selectedCell,
  onSelectCell,
}) {
  const lanes = grid.lanes || [];
  const slots = grid.slots || [];
  const isHoveringDifferentTemplate = Boolean(hoverGrid);
  const canEditCells = Boolean(customizeMode && applied);

  return (
    <div className="rotation-preview-canvas">
      <div className="rotation-preview-header">
        <div>
          <span className="rotation-preview-eyebrow">Schedule canvas</span>
          <h4>{applied ? "Template draft" : "Blank grid"}</h4>
        </div>
        <span className={`rotation-preview-status${isHoveringDifferentTemplate ? " is-preview" : applied ? " is-applied" : ""}`}>
          {isHoveringDifferentTemplate ? "Preview only" : applied ? "Cell edits active" : "Choose a template"}
        </span>
      </div>
      <div className="rotation-preview-scroll">
        <div
          className="rotation-preview-grid"
          style={{
            gridTemplateColumns: `92px repeat(${Math.max(lanes.length, 1)}, minmax(128px, 1fr))`,
          }}
        >
          <div className="rotation-preview-axis is-corner">Time</div>
          {lanes.map((lane) => (
            <div key={lane.id} className="rotation-preview-lane">
              <span>{lane.label}</span>
              <small>{lane.role || "pct"}</small>
            </div>
          ))}
          {slots.map((slot) => (
            <React.Fragment key={slot.time}>
              <div className="rotation-preview-time">{slot.label || formatTimeLabel(slot.time)}</div>
              {lanes.map((lane) => {
                const committed = grid.cells?.[lane.id]?.[slot.time] || null;
                const ghost = hoverGrid?.cells?.[lane.id]?.[slot.time] || null;
                const cell = ghost || committed;
                const taskKey = cell?.task || "off";
                const color = TASK_COLORS[taskKey] || TASK_COLORS.float;
                const isSelected = selectedCell?.laneId === lane.id && selectedCell?.slotTime === slot.time;
                return (
                  <button
                    key={`${lane.id}-${slot.time}`}
                    type="button"
                    className={`rotation-preview-cell${ghost ? " is-ghost" : committed ? " is-filled" : " is-empty"}${isSelected ? " is-selected" : ""}${canEditCells ? " is-editable" : ""}`}
                    onClick={() => {
                      if (canEditCells) onSelectCell({ laneId: lane.id, slotTime: slot.time });
                    }}
                    disabled={!canEditCells}
                    style={{
                      "--cell-bg": taskKey === "off" ? "#FFFFFF" : color.bg,
                      "--cell-text": taskKey === "off" ? "#94A3B8" : color.text,
                      "--cell-border": taskKey === "off" ? "#E5E7EB" : `${color.text}24`,
                    }}
                    title={canEditCells ? `Edit ${lane.label} at ${slot.label || formatTimeLabel(slot.time)}` : "Apply a template before editing cells"}
                    aria-label={`${canEditCells ? "Edit" : "Preview"} ${lane.label} at ${slot.label || formatTimeLabel(slot.time)}`}
                  >
                    {cell ? (
                      <>
                        <span>{cell.label || color.label}</span>
                        {cell.detail && <small>{cell.detail}</small>}
                      </>
                    ) : (
                      <span className="rotation-preview-empty-copy">Open</span>
                    )}
                  </button>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

function CellInspector({ cell, laneLabel, onApplyTask, onClose }) {
  if (!cell) return null;
  return (
    <div className="rotation-cell-inspector">
      <div>
        <strong>Cell edit</strong>
        <span>{formatTimeLabel(cell.slotTime)} · {laneLabel || cell.laneId}</span>
      </div>
      <div className="rotation-task-palette">
        {TASK_PICKER_KEYS.map((key) => {
          const task = TASK_COLORS[key];
          if (!task) return null;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onApplyTask(key)}
              style={{
                background: task.bg,
                color: task.text,
                borderColor: `${task.text}22`,
              }}
            >
              {task.label}
            </button>
          );
        })}
      </div>
      <button type="button" className="rotation-inspector-close" onClick={onClose}>
        Done
      </button>
    </div>
  );
}

const CALENDAR_WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function RotationDateSelector({
  selectedDay,
  today,
  visibleDays,
  monthDate,
  onMonthChange,
  onSelectDate,
  onClose,
  onFetchScheduleSummaries,
}) {
  const selectedDate = selectedDay?.date || today || dateToIso(new Date());
  const calendarDates = useMemo(() => getScheduleCalendarDates(monthDate || selectedDate), [monthDate, selectedDate]);
  const [versionSummaries, setVersionSummaries] = useState({});
  const [summaryLoading, setSummaryLoading] = useState(false);
  const visibleByDate = useMemo(() => (
    new Map((visibleDays || []).filter((entry) => entry?.date).map((entry) => [entry.date, entry]))
  ), [visibleDays]);
  const selectedVisibleDay = visibleByDate.get(selectedDate) || selectedDay;
  const selectedSummary = versionSummaries[selectedDate] || null;
  const selectedState = getDateScheduleState({
    date: selectedDate,
    today,
    visibleDay: selectedVisibleDay,
    summary: selectedSummary,
  });
  const quickDates = useMemo(() => {
    const weekStart = getScheduleWeekStart(today || selectedDate);
    return [
      { label: "Today", date: today || selectedDate },
      { label: "Tomorrow", date: addScheduleDays(today || selectedDate, 1) },
      { label: "Next weekend", date: getNextSaturday(today || selectedDate) },
      { label: "Next week", date: addScheduleDays(weekStart, 7) },
      { label: "Last week", date: addScheduleDays(weekStart, -7) },
    ];
  }, [selectedDate, today]);
  const submittedDates = useMemo(() => (
    Object.entries(versionSummaries)
      .filter(([date, summary]) => date.slice(0, 7) === (monthDate || selectedDate).slice(0, 7) && summary?.total > 0)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 7)
  ), [monthDate, selectedDate, versionSummaries]);

  useEffect(() => {
    if (!onFetchScheduleSummaries || calendarDates.length === 0) return undefined;
    let cancelled = false;
    setSummaryLoading(true);
    onFetchScheduleSummaries({
      startDate: calendarDates[0],
      endDate: calendarDates[calendarDates.length - 1],
    })
      .then((summaries) => {
        if (!cancelled) setVersionSummaries(summaries || {});
      })
      .catch(() => {
        if (!cancelled) setVersionSummaries({});
      })
      .finally(() => {
        if (!cancelled) setSummaryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [calendarDates, onFetchScheduleSummaries]);

  const chooseDate = useCallback((date) => {
    onSelectDate?.(date);
    onClose?.();
  }, [onClose, onSelectDate]);

  return (
    <div className="rotation-date-panel" role="dialog" aria-label="Select rotation schedule date">
      <div className="rotation-date-panel-header">
        <div className="rotation-date-heading">
          <span className="rotation-date-kicker">Schedule date</span>
          <strong>{getFullScheduleDateLabel(selectedDate)}</strong>
          <span>{selectedState.detail}</span>
        </div>
        <div className="rotation-date-month-controls">
          <button type="button" onClick={() => onMonthChange(shiftScheduleMonth(monthDate, -1))} aria-label="Previous month">
            <I.Back />
          </button>
          <span>{getCalendarMonthLabel(monthDate || selectedDate)}</span>
          <button type="button" onClick={() => onMonthChange(shiftScheduleMonth(monthDate, 1))} aria-label="Next month">
            <I.ChevronRight />
          </button>
          <button type="button" className="rotation-date-close" onClick={onClose} aria-label="Close date selector">
            <I.X />
          </button>
        </div>
      </div>

      <div className="rotation-date-layout">
        <div className="rotation-calendar-pane">
          <div className="rotation-date-quick-row">
            {quickDates.map((quick) => (
              <button
                key={quick.label}
                type="button"
                className={quick.date === selectedDate ? "is-active" : ""}
                onClick={() => chooseDate(quick.date)}
              >
                {quick.label}
              </button>
            ))}
          </div>
          <div className="rotation-calendar-weekdays">
            {CALENDAR_WEEKDAYS.map((label) => <span key={label}>{label}</span>)}
          </div>
          <div className="rotation-calendar-grid">
            {calendarDates.map((date) => {
              const parsed = parseScheduleDate(date);
              const visibleDay = visibleByDate.get(date);
              const summary = versionSummaries[date] || null;
              const state = getDateScheduleState({ date, today, visibleDay, summary });
              const inMonth = date.slice(0, 7) === (monthDate || selectedDate).slice(0, 7);
              const selected = date === selectedDate;
              const current = date === today;
              return (
                <button
                  key={date}
                  type="button"
                  className={`rotation-calendar-day is-${state.tone}${inMonth ? "" : " is-outside"}${selected ? " is-selected" : ""}${current ? " is-today" : ""}`}
                  onClick={() => chooseDate(date)}
                  aria-label={`${getFullScheduleDateLabel(date)}. ${state.label}`}
                  title={`${getFullScheduleDateLabel(date)}\n${state.detail}`}
                >
                  <span className="rotation-calendar-day-top">
                    <span>{parsed ? parsed.getDate() : ""}</span>
                    {current && <small>Today</small>}
                  </span>
                  <span className="rotation-calendar-day-status">{state.label}</span>
                  <span className="rotation-calendar-day-dots" aria-hidden="true">
                    {summary?.published > 0 && <i className="is-published" />}
                    {summary?.draft > 0 && <i className="is-draft" />}
                    {visibleDay?.staffPlan && <i className="is-staffed" />}
                    {visibleDay?.canGenerate && <i className="is-ready" />}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <aside className="rotation-date-summary-panel">
          <div className={`rotation-date-selected-card is-${selectedState.tone}`}>
            <span className="rotation-date-selected-icon"><I.Calendar /></span>
            <div>
              <span>{getRelativeScheduleDateLabel(selectedDate, today) || "Selected"}</span>
              <strong>{getCompactScheduleDateLabel(selectedDate)}</strong>
            </div>
            <span className="rotation-date-state-pill">{selectedState.label}</span>
          </div>

          <div className="rotation-date-signal-grid">
            <div>
              <span>Versions</span>
              <strong>{selectedSummary?.total || 0}</strong>
            </div>
            <div>
              <span>Matrix</span>
              <strong>{selectedVisibleDay?.canGenerate ? "Ready" : selectedVisibleDay?.hasNoData ? "Missing" : "Open"}</strong>
            </div>
            <div>
              <span>Staff</span>
              <strong>{selectedVisibleDay?.staffPlan ? "Saved" : "None"}</strong>
            </div>
          </div>

          <div className="rotation-date-submissions">
            <div className="rotation-date-submissions-title">
              <span>Submitted schedules</span>
              {summaryLoading && <small>Loading</small>}
            </div>
            {submittedDates.length ? (
              submittedDates.map(([date, summary]) => {
                const state = getDateScheduleState({
                  date,
                  today,
                  visibleDay: visibleByDate.get(date),
                  summary,
                });
                return (
                  <button key={date} type="button" onClick={() => chooseDate(date)}>
                    <span>{getCompactScheduleDateLabel(date)}</span>
                    <strong>{state.label}</strong>
                    <small>v{summary.latestVersion || 1}</small>
                  </button>
                );
              })
            ) : (
              <div className="rotation-date-empty-state">
                No saved rotations in {getCalendarMonthLabel(monthDate || selectedDate)}.
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function RotationCreationStudio({
  day,
  rotation,
  config,
  matrixMode,
  serverGridData,
  onSaveStaffPlan,
  onGenerated,
  onApplyTemplateGrid,
  onSaveDay,
  canSaveDay,
  saveDisabledReason,
  disabled = false,
  templateCatalogSummary,
  visibleDays = [],
  today,
  onSelectDate,
  onFetchScheduleSummaries,
}) {
  const defaultMatrix = useMemo(() => buildDefaultStaffingMatrix(day, rotation), [day?.date, rotation?.shift_recommendations]);
  const [staffingMatrix, setStaffingMatrix] = useState(defaultMatrix);
  const [activeShift, setActiveShift] = useState("opening");
  const [shiftDetails, setShiftDetails] = useState(() => reconcileShiftDetails(null, defaultMatrix, day, config));
  const [rosterOpen, setRosterOpen] = useState(false);
  const [hoveredTemplateId, setHoveredTemplateId] = useState("");
  const [draftGrids, setDraftGrids] = useState({ opening: null, closing: null });
  const [appliedTemplateIds, setAppliedTemplateIds] = useState({ opening: "", closing: "" });
  const [selectedCell, setSelectedCell] = useState(null);
  const [customizeMode, setCustomizeMode] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(getScheduleMonthStart(day?.date || today));
  const datePickerRef = useRef(null);

  useEffect(() => {
    setStaffingMatrix(defaultMatrix);
    setShiftDetails(reconcileShiftDetails(null, defaultMatrix, day, config));
    setHoveredTemplateId("");
    setDraftGrids({ opening: null, closing: null });
    setAppliedTemplateIds({ opening: "", closing: "" });
    setSelectedCell(null);
    setCustomizeMode(false);
    setCalendarMonth(getScheduleMonthStart(day?.date || today));
  }, [day?.date, defaultMatrix, config, today]);

  useEffect(() => {
    if (!datePickerOpen) return undefined;
    const handlePointerDown = (event) => {
      if (datePickerRef.current?.contains(event.target)) return;
      setDatePickerOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setDatePickerOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [datePickerOpen]);

  const demandDisplay = matrixMode === "projected" ? day?.projectedDisplay : day?.currentDisplay;
  const candidates = useMemo(() => ({
    opening: findRotationTemplateCandidates({
      date: day?.date,
      shift: "opening",
      counts: staffingMatrix.opening,
      demandDisplay,
    }, 7),
    closing: findRotationTemplateCandidates({
      date: day?.date,
      shift: "closing",
      counts: staffingMatrix.closing,
      demandDisplay,
    }, 7),
  }), [day?.date, demandDisplay, staffingMatrix]);

  const activeCandidates = candidates[activeShift] || [];
  const activeCounts = staffingMatrix[activeShift] || {};
  const activeTemplate = activeCandidates.find((match) => getCandidateId(match) === hoveredTemplateId);
  const activeDraftGrid = draftGrids[activeShift];
  const blankGrid = useMemo(
    () => buildBlankRotationPreviewGrid({ shift: activeShift, staffingCounts: activeCounts }),
    [activeShift, activeCounts],
  );
  const hoverGrid = useMemo(() => {
    if (!activeTemplate?.template) return null;
    return buildTemplatePreviewGrid(activeTemplate.template, { shift: activeShift, staffingCounts: activeCounts });
  }, [activeTemplate, activeCounts, activeShift]);
  const displayedGrid = activeDraftGrid || blankGrid;
  const selectedLaneLabel = displayedGrid?.lanes?.find((lane) => lane.id === selectedCell?.laneId)?.label || "";
  const visibleHoverGrid = hoveredTemplateId && hoveredTemplateId !== appliedTemplateIds[activeShift] ? hoverGrid : null;
  const serverGridReady = Boolean(serverGridData?.lanes?.length && serverGridData?.slots?.length);
  const hasAnyDraft = Boolean(draftGrids.opening || draftGrids.closing);
  const appliedMatch = activeCandidates.find((match) => getCandidateId(match) === appliedTemplateIds[activeShift]);

  const syncDraftsToParent = useCallback((nextDrafts) => {
    const activeDrafts = Object.values(nextDrafts || {}).filter(Boolean);
    if (!activeDrafts.length) {
      onApplyTemplateGrid?.(null);
      return;
    }
    if (!serverGridReady) return;
    let combined = serverGridData?.cells || {};
    for (const grid of activeDrafts) {
      combined = mapTemplatePreviewToServerGrid(grid, {
        ...serverGridData,
        cells: combined,
      });
    }
    onApplyTemplateGrid?.(combined);
  }, [onApplyTemplateGrid, serverGridData, serverGridReady]);

  const updateCount = useCallback((shiftKey, roleKey, value) => {
    setStaffingMatrix((current) => {
      const next = {
        ...current,
        [shiftKey]: {
          ...current[shiftKey],
          [roleKey]: toCount(value),
        },
      };
      setShiftDetails((details) => reconcileShiftDetails(details, next, day, config));
      return next;
    });
    setHoveredTemplateId("");
    setDraftGrids((current) => {
      const next = { ...current, [shiftKey]: null };
      syncDraftsToParent(next);
      return next;
    });
    setAppliedTemplateIds((current) => ({ ...current, [shiftKey]: "" }));
    setSelectedCell(null);
  }, [config, day, syncDraftsToParent]);

  const updateRosterRow = useCallback((rowId, patch) => {
    setShiftDetails((current) => ({
      ...current,
      [activeShift]: (current?.[activeShift] || []).map((row) => (
        row.id === rowId ? { ...row, ...patch } : row
      )),
    }));
  }, [activeShift]);

  const applyTemplate = useCallback((match) => {
    if (!match?.template) return;
    const preview = buildTemplatePreviewGrid(match.template, {
      shift: activeShift,
      staffingCounts: staffingMatrix[activeShift],
    });
    const templateId = getCandidateId(match);
    const nextDrafts = { ...draftGrids, [activeShift]: preview };
    setDraftGrids(nextDrafts);
    setAppliedTemplateIds((current) => ({ ...current, [activeShift]: templateId }));
    setCustomizeMode(true);
    setSelectedCell(null);
    syncDraftsToParent(nextDrafts);
  }, [activeShift, draftGrids, staffingMatrix, syncDraftsToParent]);

  const clearActiveTemplate = useCallback(() => {
    const nextDrafts = { ...draftGrids, [activeShift]: null };
    setDraftGrids(nextDrafts);
    setAppliedTemplateIds((current) => ({ ...current, [activeShift]: "" }));
    setSelectedCell(null);
    syncDraftsToParent(nextDrafts);
  }, [activeShift, draftGrids, syncDraftsToParent]);

  const applyTaskToSelectedCell = useCallback((taskKey) => {
    if (!selectedCell || !activeDraftGrid) return;
    const nextGrid = clonePreviewGrid(activeDraftGrid);
    if (!nextGrid.cells[selectedCell.laneId]) nextGrid.cells[selectedCell.laneId] = {};
    nextGrid.cells[selectedCell.laneId][selectedCell.slotTime] = getTaskCell(taskKey);
    const nextDrafts = { ...draftGrids, [activeShift]: nextGrid };
    setDraftGrids(nextDrafts);
    syncDraftsToParent(nextDrafts);
  }, [activeDraftGrid, activeShift, draftGrids, selectedCell, syncDraftsToParent]);

  const saveStaffPlan = useCallback(() => {
    const entries = SHIFT_CONFIG.flatMap((shift) => shiftDetails?.[shift.key] || []);
    const plan = deriveStaffPlanFromShiftEntries({
      locationId: day?.matrix?.location_id,
      planDate: day?.date,
      shiftEntries: entries,
      notes: hasAnyDraft
        ? `Template draft prepared for ${Object.entries(appliedTemplateIds).filter(([, value]) => value).map(([shift]) => shift).join(" and ")}.`
        : "Generated from Scheduling Rotation Studio staffing counts.",
    });
    onSaveStaffPlan?.(plan);
    onGenerated?.();
  }, [appliedTemplateIds, day?.date, day?.matrix?.location_id, hasAnyDraft, onGenerated, onSaveStaffPlan, shiftDetails]);

  const activeShiftRows = shiftDetails?.[activeShift] || [];
  const appliedSummary = appliedMatch?.template
    ? `Matched: ${getTemplateDisplayName(appliedMatch)}`
    : hasAnyDraft
      ? "One shift has an applied template"
      : "Hover a template to preview it in the grid";

  return (
    <div className="rotation-studio-shell">
      <style>{`
        .rotation-studio-shell {
          --studio-ink: ${C.text};
          --studio-muted: ${C.textMut};
          --studio-border: ${C.border};
          --studio-border-light: ${C.borderLight};
          --studio-primary: ${C.pri};
          --studio-primary-soft: ${C.priLt};
          display: grid;
          gap: 12px;
        }
        .rotation-date-picker-frame {
          position: relative;
          display: grid;
          gap: 10px;
        }
        .rotation-config-bar {
          display: grid;
          grid-template-columns: minmax(160px, 0.9fr) minmax(190px, 1.1fr) repeat(4, minmax(116px, 1fr)) minmax(132px, 0.75fr);
          align-items: stretch;
          gap: 0;
          min-height: 86px;
          border: 1px solid rgba(148, 163, 184, 0.34);
          border-radius: 999px;
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.96)),
            radial-gradient(circle at 12% 0%, rgba(34, 197, 94, 0.12), transparent 34%);
          box-shadow: 0 24px 52px rgba(15, 23, 42, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.9);
          overflow: hidden;
          animation: rotationStudioSettle 360ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
        }
        .rotation-config-segment {
          position: relative;
          display: grid;
          align-content: center;
          gap: 6px;
          min-width: 0;
          padding: 15px 18px;
        }
        .rotation-config-segment.rotation-date-trigger {
          border: 0;
          background:
            linear-gradient(135deg, rgba(219, 234, 254, 0.94), rgba(240, 253, 244, 0.96));
          cursor: pointer;
          color: inherit;
          font: inherit;
          text-align: left;
          transition: background 160ms ease, box-shadow 160ms ease, transform 160ms ease;
        }
        .rotation-config-segment.rotation-date-trigger:hover,
        .rotation-config-segment.rotation-date-trigger:focus-visible,
        .rotation-config-segment.rotation-date-trigger.is-open {
          outline: none;
          box-shadow: inset 0 0 0 2px rgba(37, 99, 235, 0.35), inset 0 0 0 999px rgba(255, 255, 255, 0.18);
        }
        .rotation-config-segment.rotation-date-trigger:hover {
          transform: translateY(-1px);
        }
        .rotation-date-trigger-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          min-width: 0;
        }
        .rotation-date-trigger-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.80);
          color: #1D4ED8;
          box-shadow: 0 8px 18px rgba(29, 78, 216, 0.13);
          flex: 0 0 auto;
        }
        .rotation-date-panel {
          position: absolute;
          top: calc(100% + 10px);
          left: 0;
          right: 0;
          z-index: 18;
          display: grid;
          gap: 14px;
          padding: 16px;
          border: 1px solid rgba(148, 163, 184, 0.34);
          border-radius: 24px;
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.99), rgba(248, 250, 252, 0.98));
          box-shadow: 0 28px 70px rgba(15, 23, 42, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.92);
          animation: rotationStudioSettle 180ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
        }
        .rotation-date-panel-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 14px;
        }
        .rotation-date-heading {
          display: grid;
          gap: 4px;
          min-width: 0;
        }
        .rotation-date-kicker {
          color: #1D4ED8;
          font-size: 10px;
          font-weight: 950;
          text-transform: uppercase;
        }
        .rotation-date-heading strong {
          color: var(--studio-ink);
          font-size: 20px;
          font-weight: 950;
          line-height: 1.1;
        }
        .rotation-date-heading span:last-child {
          color: var(--studio-muted);
          font-size: 11px;
          font-weight: 800;
          line-height: 1.35;
        }
        .rotation-date-month-controls {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 5px;
          border: 1px solid rgba(148, 163, 184, 0.28);
          border-radius: 999px;
          background: #F8FAFC;
          flex: 0 0 auto;
        }
        .rotation-date-month-controls span {
          min-width: 128px;
          color: var(--studio-ink);
          font-size: 12px;
          font-weight: 950;
          text-align: center;
          white-space: nowrap;
        }
        .rotation-date-month-controls button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 30px;
          height: 30px;
          border: 0;
          border-radius: 999px;
          background: #FFFFFF;
          color: var(--studio-ink);
          cursor: pointer;
          box-shadow: 0 6px 14px rgba(15, 23, 42, 0.08);
          transition: transform 140ms ease, box-shadow 140ms ease;
        }
        .rotation-date-month-controls button:hover {
          transform: translateY(-1px);
          box-shadow: 0 10px 20px rgba(15, 23, 42, 0.12);
        }
        .rotation-date-month-controls .rotation-date-close {
          color: var(--studio-muted);
          box-shadow: none;
        }
        .rotation-date-layout {
          display: grid;
          grid-template-columns: minmax(0, 1.5fr) minmax(290px, 0.7fr);
          gap: 14px;
          align-items: stretch;
        }
        .rotation-calendar-pane {
          display: grid;
          gap: 10px;
          min-width: 0;
        }
        .rotation-date-quick-row {
          display: flex;
          gap: 7px;
          flex-wrap: wrap;
        }
        .rotation-date-quick-row button {
          min-height: 30px;
          padding: 0 11px;
          border: 1px solid rgba(148, 163, 184, 0.30);
          border-radius: 999px;
          background: #FFFFFF;
          color: var(--studio-muted);
          cursor: pointer;
          font: inherit;
          font-size: 11px;
          font-weight: 900;
          transition: background 140ms ease, color 140ms ease, border-color 140ms ease, transform 140ms ease;
        }
        .rotation-date-quick-row button:hover,
        .rotation-date-quick-row button.is-active {
          transform: translateY(-1px);
          border-color: rgba(29, 78, 216, 0.30);
          background: #EFF6FF;
          color: #1D4ED8;
        }
        .rotation-calendar-weekdays,
        .rotation-calendar-grid {
          display: grid;
          grid-template-columns: repeat(7, minmax(0, 1fr));
          gap: 6px;
        }
        .rotation-calendar-weekdays span {
          color: var(--studio-muted);
          font-size: 10px;
          font-weight: 950;
          text-align: center;
          text-transform: uppercase;
        }
        .rotation-calendar-day {
          position: relative;
          display: grid;
          grid-template-rows: auto 1fr auto;
          gap: 5px;
          min-height: 74px;
          padding: 8px;
          border: 1px solid rgba(226, 232, 240, 0.92);
          border-radius: 14px;
          background: #FFFFFF;
          color: var(--studio-ink);
          cursor: pointer;
          font: inherit;
          text-align: left;
          overflow: hidden;
          transition: transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease, background 140ms ease;
        }
        .rotation-calendar-day:hover,
        .rotation-calendar-day:focus-visible {
          outline: none;
          transform: translateY(-2px);
          border-color: rgba(29, 78, 216, 0.34);
          box-shadow: 0 14px 24px rgba(15, 23, 42, 0.12);
        }
        .rotation-calendar-day.is-outside {
          opacity: 0.44;
          background: #F8FAFC;
        }
        .rotation-calendar-day.is-selected {
          border-color: #1D4ED8;
          background: linear-gradient(180deg, #EFF6FF, #FFFFFF);
          box-shadow: inset 0 0 0 2px rgba(29, 78, 216, 0.18), 0 16px 30px rgba(29, 78, 216, 0.12);
        }
        .rotation-calendar-day.is-today:not(.is-selected) {
          border-color: rgba(132, 204, 22, 0.60);
          background: #F7FEE7;
        }
        .rotation-calendar-day.is-published {
          border-color: rgba(22, 163, 74, 0.42);
        }
        .rotation-calendar-day.is-draft {
          border-color: rgba(245, 158, 11, 0.42);
        }
        .rotation-calendar-day-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 4px;
        }
        .rotation-calendar-day-top > span {
          color: var(--studio-ink);
          font-size: 15px;
          font-weight: 950;
          line-height: 1;
        }
        .rotation-calendar-day-top small {
          color: #65A30D;
          font-size: 8.5px;
          font-weight: 950;
          text-transform: uppercase;
        }
        .rotation-calendar-day-status {
          align-self: end;
          color: var(--studio-muted);
          font-size: 10px;
          font-weight: 900;
          line-height: 1.15;
          overflow-wrap: anywhere;
        }
        .rotation-calendar-day.is-published .rotation-calendar-day-status,
        .rotation-calendar-day.is-ready .rotation-calendar-day-status {
          color: #15803D;
        }
        .rotation-calendar-day.is-draft .rotation-calendar-day-status {
          color: #B45309;
        }
        .rotation-calendar-day.is-missing .rotation-calendar-day-status {
          color: #991B1B;
        }
        .rotation-calendar-day-dots {
          display: flex;
          align-items: center;
          gap: 4px;
          min-height: 7px;
        }
        .rotation-calendar-day-dots i {
          width: 7px;
          height: 7px;
          border-radius: 999px;
          display: inline-block;
        }
        .rotation-calendar-day-dots .is-published { background: #16A34A; }
        .rotation-calendar-day-dots .is-draft { background: #F59E0B; }
        .rotation-calendar-day-dots .is-staffed { background: #2563EB; }
        .rotation-calendar-day-dots .is-ready { background: #84CC16; }
        .rotation-date-summary-panel {
          display: grid;
          gap: 10px;
          min-width: 0;
        }
        .rotation-date-selected-card {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr) auto;
          align-items: center;
          gap: 10px;
          padding: 12px;
          border: 1px solid rgba(148, 163, 184, 0.30);
          border-radius: 16px;
          background: #FFFFFF;
        }
        .rotation-date-selected-card.is-published {
          border-color: rgba(22, 163, 74, 0.38);
          background: #F0FDF4;
        }
        .rotation-date-selected-card.is-draft {
          border-color: rgba(245, 158, 11, 0.38);
          background: #FFFBEB;
        }
        .rotation-date-selected-icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 38px;
          height: 38px;
          border-radius: 12px;
          background: #111827;
          color: #FFFFFF;
          box-shadow: 0 12px 24px rgba(17, 24, 39, 0.18);
        }
        .rotation-date-selected-card div {
          display: grid;
          gap: 2px;
          min-width: 0;
        }
        .rotation-date-selected-card div span {
          color: var(--studio-muted);
          font-size: 10px;
          font-weight: 900;
          text-transform: uppercase;
        }
        .rotation-date-selected-card div strong {
          color: var(--studio-ink);
          font-size: 14px;
          font-weight: 950;
          line-height: 1.2;
        }
        .rotation-date-state-pill {
          justify-self: end;
          padding: 5px 9px;
          border-radius: 999px;
          background: #F1F5F9;
          color: var(--studio-muted);
          font-size: 10px;
          font-weight: 950;
          white-space: nowrap;
        }
        .rotation-date-selected-card.is-published .rotation-date-state-pill {
          background: #DCFCE7;
          color: #15803D;
        }
        .rotation-date-selected-card.is-draft .rotation-date-state-pill {
          background: #FEF3C7;
          color: #B45309;
        }
        .rotation-date-signal-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
        }
        .rotation-date-signal-grid div {
          display: grid;
          gap: 4px;
          padding: 10px;
          border: 1px solid rgba(226, 232, 240, 0.92);
          border-radius: 14px;
          background: #FFFFFF;
        }
        .rotation-date-signal-grid span,
        .rotation-date-submissions-title span {
          color: var(--studio-muted);
          font-size: 9.5px;
          font-weight: 950;
          text-transform: uppercase;
        }
        .rotation-date-signal-grid strong {
          color: var(--studio-ink);
          font-size: 13px;
          font-weight: 950;
          line-height: 1.1;
          overflow-wrap: anywhere;
        }
        .rotation-date-submissions {
          display: grid;
          gap: 7px;
          padding: 12px;
          border: 1px solid rgba(226, 232, 240, 0.92);
          border-radius: 16px;
          background: #F8FAFC;
        }
        .rotation-date-submissions-title {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .rotation-date-submissions-title small {
          color: #1D4ED8;
          font-size: 10px;
          font-weight: 900;
        }
        .rotation-date-submissions button {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto auto;
          align-items: center;
          gap: 8px;
          padding: 8px 9px;
          border: 1px solid rgba(148, 163, 184, 0.24);
          border-radius: 12px;
          background: #FFFFFF;
          color: var(--studio-ink);
          cursor: pointer;
          font: inherit;
          text-align: left;
          transition: transform 130ms ease, box-shadow 130ms ease;
        }
        .rotation-date-submissions button:hover {
          transform: translateY(-1px);
          box-shadow: 0 10px 18px rgba(15, 23, 42, 0.10);
        }
        .rotation-date-submissions button span {
          font-size: 11px;
          font-weight: 950;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .rotation-date-submissions button strong {
          color: var(--studio-muted);
          font-size: 10px;
          font-weight: 950;
        }
        .rotation-date-submissions button small {
          color: #1D4ED8;
          font-size: 10px;
          font-weight: 950;
        }
        .rotation-date-empty-state {
          padding: 12px;
          border: 1px dashed rgba(148, 163, 184, 0.42);
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.72);
          color: var(--studio-muted);
          font-size: 11px;
          font-weight: 800;
          line-height: 1.4;
        }
        .rotation-config-segment + .rotation-config-segment {
          border-left: 1px solid rgba(148, 163, 184, 0.22);
        }
        .rotation-config-kicker,
        .rotation-count-label,
        .rotation-preview-eyebrow {
          color: var(--studio-muted);
          font-size: 10px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .rotation-config-title {
          color: var(--studio-ink);
          font-size: 15px;
          font-weight: 900;
          line-height: 1.1;
        }
        .rotation-shift-toggle {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px;
          padding: 4px;
          border-radius: 999px;
          border: 1px solid rgba(148, 163, 184, 0.26);
          background: rgba(241, 245, 249, 0.78);
        }
        .rotation-shift-toggle button {
          border: 0;
          border-radius: 999px;
          padding: 9px 10px;
          background: transparent;
          color: var(--studio-muted);
          cursor: pointer;
          font: inherit;
          font-size: 12px;
          font-weight: 900;
          transition: background 160ms ease, color 160ms ease, transform 160ms ease, box-shadow 160ms ease;
        }
        .rotation-shift-toggle button.is-active {
          background: #FFFFFF;
          color: var(--studio-primary);
          box-shadow: 0 8px 18px rgba(15, 23, 42, 0.12);
        }
        .rotation-shift-toggle button:hover {
          transform: translateY(-1px);
        }
        .rotation-count-stepper {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          min-width: 0;
        }
        .rotation-count-stepper > div:first-child {
          display: grid;
          gap: 3px;
          min-width: 0;
        }
        .rotation-count-value {
          color: var(--studio-ink);
          font-size: 24px;
          font-weight: 950;
          line-height: 1;
        }
        .rotation-count-controls {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px;
          border-radius: 999px;
          background: rgba(241, 245, 249, 0.86);
          border: 1px solid rgba(148, 163, 184, 0.22);
        }
        .rotation-count-controls button {
          width: 28px;
          height: 28px;
          border: 0;
          border-radius: 999px;
          background: #FFFFFF;
          color: var(--studio-ink);
          cursor: pointer;
          font: inherit;
          font-size: 17px;
          font-weight: 900;
          line-height: 1;
          box-shadow: 0 4px 10px rgba(15, 23, 42, 0.08);
          transition: transform 140ms ease, box-shadow 140ms ease, opacity 140ms ease;
        }
        .rotation-count-controls button:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 8px 16px rgba(15, 23, 42, 0.12);
        }
        .rotation-count-controls button:disabled {
          cursor: default;
          opacity: 0.42;
        }
        .rotation-total-pill {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          min-height: 44px;
          border-radius: 999px;
          background: #111827;
          color: #FFFFFF;
          font-size: 12px;
          font-weight: 900;
          box-shadow: 0 14px 26px rgba(15, 23, 42, 0.22);
        }
        .rotation-studio-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .rotation-studio-caption {
          display: grid;
          gap: 4px;
          color: var(--studio-muted);
          font-size: 11px;
          font-weight: 700;
          line-height: 1.45;
        }
        .rotation-studio-caption strong {
          color: var(--studio-ink);
          font-size: 13px;
          font-weight: 900;
        }
        .rotation-roster-panel {
          display: grid;
          gap: 10px;
          padding: 12px;
          border: 1px solid rgba(148, 163, 184, 0.28);
          border-radius: 14px;
          background: rgba(248, 250, 252, 0.72);
        }
        .rotation-roster-grid {
          display: grid;
          gap: 7px;
        }
        .rotation-roster-row {
          display: grid;
          grid-template-columns: minmax(128px, 0.9fr) minmax(180px, 1fr) 120px 120px;
          align-items: center;
          gap: 8px;
        }
        .rotation-roster-role {
          display: grid;
          gap: 2px;
          min-width: 0;
          color: var(--studio-ink);
          font-size: 12px;
        }
        .rotation-roster-role span,
        .rotation-roster-empty {
          color: var(--studio-muted);
          font-size: 11px;
          font-weight: 700;
        }
        .rotation-roster-row input {
          min-width: 0;
          border: 1px solid var(--studio-border);
          border-radius: 10px;
          padding: 8px 10px;
          background: #FFFFFF;
          color: var(--studio-ink);
          font: inherit;
          font-size: 12px;
        }
        .rotation-template-section {
          display: grid;
          gap: 7px;
        }
        .rotation-template-section-header {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .rotation-template-section-header h3 {
          margin: 0;
          color: var(--studio-ink);
          font-size: 13px;
          font-weight: 950;
        }
        .rotation-template-section-header p {
          margin: 2px 0 0;
          color: var(--studio-muted);
          font-size: 10px;
          font-weight: 700;
          line-height: 1.35;
        }
        .rotation-template-rail {
          display: grid;
          grid-auto-flow: column;
          grid-auto-columns: minmax(142px, 158px);
          gap: 7px;
          overflow-x: auto;
          padding: 2px 2px 7px;
          scroll-snap-type: x proximity;
        }
        .rotation-template-card {
          position: relative;
          display: grid;
          grid-template-rows: 30px minmax(0, 1fr);
          gap: 5px;
          height: 78px;
          padding: 7px;
          border: 1px solid rgba(148, 163, 184, 0.30);
          border-radius: 10px;
          background: linear-gradient(180deg, #FFFFFF, #F8FAFC);
          color: var(--studio-ink);
          text-align: left;
          font: inherit;
          cursor: pointer;
          scroll-snap-align: start;
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06);
          transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
          overflow: hidden;
        }
        .rotation-template-card::after {
          content: "";
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 18% 0%, rgba(20, 83, 45, 0.11), transparent 34%);
          opacity: 0;
          pointer-events: none;
          transition: opacity 180ms ease;
        }
        .rotation-template-card:hover,
        .rotation-template-card:focus-visible,
        .rotation-template-card.is-previewing {
          transform: translateY(-1px);
          border-color: rgba(20, 83, 45, 0.34);
          box-shadow: 0 12px 22px rgba(15, 23, 42, 0.12);
          outline: none;
        }
        .rotation-template-card:hover::after,
        .rotation-template-card.is-previewing::after {
          opacity: 1;
        }
        .rotation-template-card.is-applied {
          border-color: rgba(20, 83, 45, 0.55);
          background: linear-gradient(180deg, #F0FDF4, #FFFFFF);
          box-shadow: 0 12px 24px rgba(20, 83, 45, 0.13);
        }
        .rotation-template-thumb {
          display: grid;
          gap: 2px;
          padding: 4px;
          border-radius: 8px;
          background: rgba(241, 245, 249, 0.8);
          border: 1px solid rgba(148, 163, 184, 0.22);
          overflow: hidden;
        }
        .rotation-template-thumb-lane {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          gap: 2px;
        }
        .rotation-template-thumb-lane span {
          height: 5px;
          border: 1px solid;
          border-radius: 999px;
        }
        .rotation-template-card-name {
          color: var(--studio-ink);
          font-size: 10.5px;
          font-weight: 950;
          line-height: 1.16;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .rotation-preview-canvas {
          display: grid;
          gap: 12px;
          padding: 14px;
          border: 1px solid rgba(148, 163, 184, 0.32);
          border-radius: 18px;
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.92)),
            radial-gradient(circle at 85% 8%, rgba(59, 130, 246, 0.10), transparent 28%);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.85);
        }
        .rotation-preview-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .rotation-preview-header h4 {
          margin: 2px 0 0;
          color: var(--studio-ink);
          font-size: 15px;
          font-weight: 950;
        }
        .rotation-preview-status {
          display: inline-flex;
          align-items: center;
          min-height: 30px;
          padding: 0 10px;
          border-radius: 999px;
          background: rgba(241, 245, 249, 0.92);
          color: var(--studio-muted);
          font-size: 11px;
          font-weight: 900;
        }
        .rotation-preview-status.is-preview {
          background: ${C.warnLt};
          color: ${C.warn};
        }
        .rotation-preview-status.is-applied {
          background: ${C.sucLt};
          color: ${C.suc};
        }
        .rotation-preview-scroll {
          overflow: auto;
          border: 1px solid rgba(148, 163, 184, 0.24);
          border-radius: 14px;
          background: #FFFFFF;
        }
        .rotation-preview-grid {
          display: grid;
          min-width: 900px;
          font-size: 11px;
        }
        .rotation-preview-axis,
        .rotation-preview-lane,
        .rotation-preview-time {
          position: sticky;
          z-index: 2;
          background: #F8FAFC;
          border-bottom: 1px solid var(--studio-border-light);
        }
        .rotation-preview-axis,
        .rotation-preview-time {
          left: 0;
          z-index: 3;
          border-right: 1px solid var(--studio-border);
        }
        .rotation-preview-axis,
        .rotation-preview-lane {
          top: 0;
        }
        .rotation-preview-axis {
          padding: 12px 10px;
          color: var(--studio-muted);
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .rotation-preview-lane {
          display: grid;
          gap: 2px;
          padding: 10px 8px;
          text-align: center;
          border-right: 1px solid rgba(226, 232, 240, 0.68);
          color: var(--studio-ink);
          font-weight: 950;
        }
        .rotation-preview-lane small {
          color: var(--studio-muted);
          font-size: 9px;
          font-weight: 900;
          text-transform: uppercase;
        }
        .rotation-preview-time {
          display: flex;
          align-items: center;
          padding: 10px;
          color: var(--studio-muted);
          font-size: 10px;
          font-weight: 900;
          white-space: nowrap;
        }
        .rotation-preview-cell {
          position: relative;
          min-height: 54px;
          border: 0;
          border-right: 1px solid rgba(226, 232, 240, 0.70);
          border-bottom: 1px solid rgba(226, 232, 240, 0.70);
          background: var(--cell-bg);
          color: var(--cell-text);
          cursor: pointer;
          font: inherit;
          font-size: 10px;
          font-weight: 900;
          text-align: center;
          transition: background 130ms ease, color 130ms ease, opacity 130ms ease, box-shadow 130ms ease, transform 130ms ease;
        }
        .rotation-preview-cell:disabled {
          cursor: default;
        }
        .rotation-preview-cell > span {
          display: block;
          padding: 0 7px;
          line-height: 1.25;
        }
        .rotation-preview-cell small {
          display: block;
          margin-top: 2px;
          padding: 0 7px;
          opacity: 0.78;
          font-size: 9px;
          font-weight: 800;
          line-height: 1.25;
        }
        .rotation-preview-cell.is-empty {
          background: linear-gradient(180deg, #FFFFFF, #FBFCFE);
          color: #CBD5E1;
        }
        .rotation-preview-cell.is-filled {
          box-shadow: inset 0 0 0 1px var(--cell-border);
        }
        .rotation-preview-cell.is-ghost {
          opacity: 0.48;
          box-shadow: inset 0 0 0 1px var(--cell-border), inset 0 0 0 999px rgba(255, 255, 255, 0.20);
          animation: rotationGhostIn 140ms ease-out both;
        }
        .rotation-preview-cell.is-selected {
          z-index: 1;
          box-shadow: inset 0 0 0 2px #111827, 0 0 0 3px rgba(17, 24, 39, 0.12);
        }
        .rotation-preview-cell:not(:disabled):hover {
          transform: translateY(-1px);
          box-shadow: inset 0 0 0 2px rgba(17, 24, 39, 0.38), 0 10px 18px rgba(15, 23, 42, 0.10);
          z-index: 2;
        }
        .rotation-preview-cell.is-editable::after {
          content: "Edit";
          position: absolute;
          right: 5px;
          bottom: 4px;
          padding: 2px 5px;
          border-radius: 999px;
          background: rgba(17, 24, 39, 0.82);
          color: #FFFFFF;
          font-size: 8px;
          font-weight: 950;
          opacity: 0;
          transform: translateY(2px);
          transition: opacity 130ms ease, transform 130ms ease;
          pointer-events: none;
        }
        .rotation-preview-cell.is-editable:hover::after,
        .rotation-preview-cell.is-selected::after {
          opacity: 1;
          transform: translateY(0);
        }
        .rotation-preview-empty-copy {
          opacity: 0;
        }
        .rotation-cell-inspector {
          position: sticky;
          top: 10px;
          z-index: 8;
          display: grid;
          grid-template-columns: minmax(126px, 0.3fr) minmax(0, 1fr) auto;
          align-items: center;
          gap: 10px;
          padding: 10px;
          border: 1px solid rgba(17, 24, 39, 0.12);
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.98);
          box-shadow: 0 18px 40px rgba(15, 23, 42, 0.12);
          animation: rotationStudioSettle 180ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
          backdrop-filter: blur(12px);
        }
        .rotation-cell-inspector > div:first-child {
          display: grid;
          gap: 2px;
        }
        .rotation-cell-inspector strong {
          color: var(--studio-ink);
          font-size: 13px;
          font-weight: 950;
        }
        .rotation-cell-inspector span {
          color: var(--studio-muted);
          font-size: 11px;
          font-weight: 800;
        }
        .rotation-task-palette {
          display: flex;
          gap: 5px;
          flex-wrap: wrap;
        }
        .rotation-task-palette button,
        .rotation-inspector-close {
          border: 1px solid;
          border-radius: 999px;
          padding: 5px 8px;
          cursor: pointer;
          font: inherit;
          font-size: 9.5px;
          font-weight: 900;
          transition: transform 130ms ease, box-shadow 130ms ease;
        }
        .rotation-task-palette button:hover,
        .rotation-inspector-close:hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 14px rgba(15, 23, 42, 0.10);
        }
        .rotation-inspector-close {
          width: fit-content;
          border-color: var(--studio-border);
          background: #FFFFFF;
          color: var(--studio-muted);
        }
        .rotation-action-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .rotation-action-note {
          color: var(--studio-muted);
          font-size: 11px;
          font-weight: 700;
          line-height: 1.45;
        }
        .rotation-action-buttons {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .rotation-muted-button {
          border: 1px solid var(--studio-border);
          border-radius: 10px;
          background: #FFFFFF;
          color: var(--studio-ink);
          cursor: pointer;
          font: inherit;
          font-size: 11px;
          font-weight: 900;
          padding: 7px 10px;
        }
        @keyframes rotationStudioSettle {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes rotationGhostIn {
          from { opacity: 0; transform: scale(0.985); }
          to { opacity: 0.48; transform: scale(1); }
        }
        @media (max-width: 1120px) {
          .rotation-config-bar {
            grid-template-columns: minmax(180px, 1fr) minmax(220px, 1fr);
            border-radius: 24px;
          }
          .rotation-config-segment:nth-child(odd) {
            border-left: 0;
          }
          .rotation-config-segment {
            border-bottom: 1px solid rgba(148, 163, 184, 0.18);
          }
          .rotation-date-layout {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 720px) {
          .rotation-date-panel {
            position: absolute;
            top: 86px;
            left: -60px;
            right: auto;
            width: min(330px, calc(100vw - 86px));
            box-sizing: border-box;
            border-radius: 18px;
            padding: 12px;
            max-height: calc(100vh - 130px);
            overflow-y: auto;
          }
          .rotation-date-panel-header,
          .rotation-date-month-controls {
            align-items: stretch;
          }
          .rotation-date-panel-header {
            display: grid;
          }
          .rotation-date-month-controls {
            justify-content: space-between;
            width: 100%;
            box-sizing: border-box;
          }
          .rotation-date-month-controls span {
            min-width: 0;
            flex: 1;
          }
          .rotation-calendar-weekdays,
          .rotation-calendar-grid {
            gap: 4px;
          }
          .rotation-calendar-day {
            min-height: 46px;
            border-radius: 11px;
            padding: 6px;
            grid-template-rows: auto auto;
          }
          .rotation-calendar-day-status {
            display: none;
          }
          .rotation-calendar-day-top small {
            display: none;
          }
          .rotation-date-signal-grid {
            grid-template-columns: 1fr;
          }
          .rotation-date-selected-card {
            grid-template-columns: auto minmax(0, 1fr);
          }
          .rotation-date-state-pill {
            grid-column: 1 / -1;
            justify-self: start;
          }
          .rotation-config-bar {
            grid-template-columns: 1fr;
            border-radius: 22px;
          }
          .rotation-config-segment + .rotation-config-segment {
            border-left: 0;
          }
          .rotation-roster-row {
            grid-template-columns: 1fr;
          }
          .rotation-template-rail {
            grid-auto-columns: minmax(148px, 48vw);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .rotation-studio-shell *,
          .rotation-studio-shell *::before,
          .rotation-studio-shell *::after {
            animation: none !important;
            transition: none !important;
          }
        }
      `}</style>

      <div className="rotation-date-picker-frame" ref={datePickerRef}>
        <div className="rotation-config-bar" aria-label="Rotation staffing configuration">
          <button
            type="button"
            className={`rotation-config-segment rotation-date-trigger${datePickerOpen ? " is-open" : ""}`}
            onClick={() => {
              setCalendarMonth(getScheduleMonthStart(day?.date || today));
              setDatePickerOpen((value) => !value);
            }}
            aria-expanded={datePickerOpen}
            aria-haspopup="dialog"
          >
            <span className="rotation-config-kicker">Day</span>
            <span className="rotation-date-trigger-row">
              <span className="rotation-config-title">{formatDayLabel(day)}</span>
              <span className="rotation-date-trigger-icon" aria-hidden="true">
                <I.ChevronDown />
              </span>
            </span>
          </button>
          <div className="rotation-config-segment">
            <span className="rotation-config-kicker">Shift</span>
            <div className="rotation-shift-toggle">
              {SHIFT_CONFIG.map((shift) => (
                <button
                  key={shift.key}
                  type="button"
                  className={activeShift === shift.key ? "is-active" : ""}
                  onClick={() => {
                    setActiveShift(shift.key);
                    setHoveredTemplateId("");
                    setSelectedCell(null);
                  }}
                >
                  {shift.label}
                </button>
              ))}
            </div>
          </div>
          {ROLE_CONFIG.map((role) => (
            <div key={role.key} className="rotation-config-segment">
              <CountStepper
                label={role.label}
                value={activeCounts[role.key]}
                disabled={disabled}
                onChange={(value) => updateCount(activeShift, role.key, value)}
              />
            </div>
          ))}
          <div className="rotation-config-segment">
            <span className="rotation-total-pill">
              <I.Users />
              {countShiftTotal(activeCounts)} total
            </span>
          </div>
        </div>

        {datePickerOpen && (
          <RotationDateSelector
            selectedDay={day}
            today={today}
            visibleDays={visibleDays}
            monthDate={calendarMonth}
            onMonthChange={setCalendarMonth}
            onSelectDate={onSelectDate}
            onClose={() => setDatePickerOpen(false)}
            onFetchScheduleSummaries={onFetchScheduleSummaries}
          />
        )}
      </div>

      <div className="rotation-studio-toolbar">
        <div className="rotation-studio-caption">
          <strong>{appliedSummary}</strong>
          <span>
            {serverGridReady
              ? "Hover previews stay temporary. Click applies a template to the local draft grid."
              : "Server grid is still loading, so template previews are local until rotation compute returns."}
          </span>
        </div>
        <div className="rotation-action-buttons">
          <button type="button" className="rotation-muted-button" onClick={() => setRosterOpen((value) => !value)}>
            {rosterOpen ? "Hide names and times" : "Names and time edits"}
          </button>
          {activeDraftGrid && (
            <button type="button" className="rotation-muted-button" onClick={clearActiveTemplate}>
              Clear {SHIFT_CONFIG.find((shift) => shift.key === activeShift)?.short} template
            </button>
          )}
        </div>
      </div>

      {rosterOpen && (
        <div className="rotation-roster-panel">
          <div className="rotation-studio-caption">
            <strong>{SHIFT_CONFIG.find((shift) => shift.key === activeShift)?.label} people</strong>
            <span>Names are optional. Start and end times are saved with the staff plan when you generate actual staffing.</span>
          </div>
          <RosterEditor rows={activeShiftRows} onChange={updateRosterRow} disabled={disabled} />
        </div>
      )}

      <div className="rotation-template-section">
        <div className="rotation-template-section-header">
          <div>
            <h3>Matching templates</h3>
            <p>
              {templateCatalogSummary?.templateCount || 0} templates indexed. Best {activeShift === "opening" ? "AM" : "PM"} matches for active headcount.
            </p>
          </div>
          <span className="rotation-preview-status">
            {activeCandidates.length} candidates
          </span>
        </div>
        <div className="rotation-template-rail" role="listbox" aria-label="Rotation template matches">
          {activeCandidates.map((match) => {
            const id = getCandidateId(match);
            return (
              <TemplateCard
                key={id}
                match={match}
                applied={appliedTemplateIds[activeShift] === id}
                previewing={hoveredTemplateId === id}
                onPreview={() => setHoveredTemplateId(id)}
                onPreviewEnd={() => setHoveredTemplateId("")}
                onApply={() => applyTemplate(match)}
              />
            );
          })}
        </div>
      </div>

      <CellInspector
        cell={selectedCell}
        laneLabel={selectedLaneLabel}
        onApplyTask={applyTaskToSelectedCell}
        onClose={() => setSelectedCell(null)}
      />

      <PreviewCanvas
        grid={displayedGrid}
        hoverGrid={visibleHoverGrid}
        applied={Boolean(activeDraftGrid)}
        customizeMode={customizeMode}
        selectedCell={selectedCell}
        onSelectCell={setSelectedCell}
      />

      <div className="rotation-action-row">
        <div className="rotation-action-note">
          Applying a template creates a local draft overlay only. Saving staff plan and saving the day remain explicit actions.
        </div>
        <div className="rotation-action-buttons">
          <Btn variant="secondary" size="sm" onClick={saveStaffPlan} disabled={disabled || !day?.date}>
            Generate Actual Staffing
          </Btn>
          <Btn variant="primary" size="sm" onClick={onSaveDay} disabled={!canSaveDay} title={saveDisabledReason}>
            Save Day Draft
          </Btn>
        </div>
      </div>
    </div>
  );
}
