import { useCallback, useEffect, useMemo, useState } from "react";
import { I } from "../../../shared/icons";
import {
  addScheduleDays,
  dateToIso,
  getCalendarMonthLabel,
  getCompactScheduleDateLabel,
  getDateScheduleState,
  getFullScheduleDateLabel,
  getNextSaturday,
  getRelativeScheduleDateLabel,
  getScheduleCalendarDates,
  getScheduleWeekStart,
  parseScheduleDate,
  shiftScheduleMonth,
} from "./rotationStudioDates";

const CALENDAR_WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function RotationDateSelector({
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
