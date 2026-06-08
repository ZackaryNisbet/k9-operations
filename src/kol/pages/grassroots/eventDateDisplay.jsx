import React from "react";
import { C } from "../../../shared/theme";
import { normalizeGrassrootsEventDates, summarizeGrassrootsEventDates } from "../../grassrootsData";
import {
  fmtDate,
  fmtClockRange,
  fmtEventDayLine,
  fmtWeekdayLong,
  fmtWeekdayShort,
  fmtEventDateRange,
} from "./dateUtils";

export function EventDateCell({ target }) {
  const dates = normalizeGrassrootsEventDates(target);
  if (dates.length === 0) {
    return <div style={{ fontSize: 12, fontWeight: 800, color: C.textMut }}>No date</div>;
  }
  const [firstDate, ...additionalDates] = dates;
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 900, color: C.text, whiteSpace: "nowrap" }}>{fmtDate(firstDate.event_date)}</div>
      {additionalDates.length > 0 && (
        <div style={{ marginTop: 3, fontSize: 11, fontWeight: 800, color: C.textMut }}>
          +{additionalDates.length} more {additionalDates.length === 1 ? "date" : "dates"}
        </div>
      )}
    </div>
  );
}

// The events table's date cell: one date shows weekday + time; a consecutive run
// shows a date range + day count; scattered dates show the first + a chain. Whether
// it's single vs multi-day is conveyed by the shape, never a literal label.
export function EventDateDisplay({ target }) {
  const sum = summarizeGrassrootsEventDates(target);
  if (sum.count === 0) return <span style={{ fontSize: 11, fontWeight: 700, color: C.textMut }}>No date</span>;
  const wrap = { display: "flex", flexDirection: "column", gap: 1, lineHeight: 1.2, minWidth: 0 };
  const dateLine = { fontSize: 12, fontWeight: 800, color: C.text };
  const subLine = { fontSize: 10, fontWeight: 600, color: C.textMut };

  if (!sum.isMultiDay) {
    const timeStr = fmtClockRange(sum.first.start_time, sum.first.end_time);
    return (
      <div style={wrap}>
        <span style={dateLine}>{fmtEventDayLine(sum.first.event_date)}</span>
        <span style={subLine}>{fmtWeekdayLong(sum.first.event_date)}{timeStr ? ` · ${timeStr}` : ""}</span>
      </div>
    );
  }
  if (sum.isConsecutive) {
    return (
      <div style={wrap}>
        <span style={dateLine}>{fmtEventDateRange(sum.first.event_date, sum.last.event_date)}</span>
        <span style={subLine}>{fmtWeekdayShort(sum.first.event_date)}–{fmtWeekdayShort(sum.last.event_date)} · {sum.count} days</span>
      </div>
    );
  }
  // Scattered (non-consecutive) linked dates.
  return (
    <div style={wrap}>
      <span style={dateLine}>{fmtEventDayLine(sum.first.event_date)}</span>
      <span style={{ ...subLine, color: C.pri, display: "inline-flex", alignItems: "center", gap: 3 }} title={`${sum.count} separate dates linked to this event`}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></svg>
        {sum.count} linked dates
      </span>
    </div>
  );
}
