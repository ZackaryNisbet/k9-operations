// AggregatedCalendar — a generic, presentational calendar surface.
//
// It knows nothing about K9's data sources; the caller supplies a flat list of
// normalized events plus a `sources` visual registry, and owns the view/cursor/
// filter state. Three views (agenda / week / month), per-source filter pills, and
// prev/today/next navigation. Styling follows DESIGN.md: calm, dense, scannable.

import React, { useMemo, useState } from "react";
import { C } from "./theme";
import { I } from "./icons";
import {
  WEEKDAYS_SHORT,
  MONTHS_SHORT,
  parseKey,
  makeKey,
  addDaysKey,
  addMonths,
  getMonthMatrix,
  getWeekDays,
  monthLabel,
  rangeLabel,
  viewWindow,
  groupByDay,
  filterByActiveSources,
  countBySource,
} from "./calendarGrid";

const VIEWS = [
  { id: "agenda", label: "Agenda" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
];

const MONTH_CELL_MIN_HEIGHT = 104;
const MONTH_MAX_CHIPS = 3;

function isSourceActive(activeSources, key) {
  if (!activeSources) return true;
  return activeSources instanceof Set ? activeSources.has(key) : activeSources.includes(key);
}

// ── Small interactive button with a subtle hover, used for nav + view switch ──
function HoverButton({ children, active, onClick, title, style }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        height: 32,
        padding: "0 12px",
        border: `1px solid ${active ? C.pri : C.border}`,
        background: active ? C.pri : hover ? C.surfaceHover : C.surface,
        color: active ? "#FFFFFF" : C.textSec,
        borderRadius: 9,
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        transition: "background 120ms, border-color 120ms, color 120ms",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function ViewSwitch({ view, onViewChange }) {
  return (
    <div style={{ display: "inline-flex", gap: 4, padding: 3, background: C.surfaceHover, borderRadius: 11, border: `1px solid ${C.borderLight}` }}>
      {VIEWS.map((v) => {
        const active = view === v.id;
        return (
          <button
            key={v.id}
            type="button"
            onClick={() => onViewChange(v.id)}
            style={{
              height: 28,
              padding: "0 14px",
              border: "none",
              background: active ? C.surface : "transparent",
              color: active ? C.pri : C.textMut,
              borderRadius: 8,
              fontSize: 12.5,
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: active ? "0 1px 2px rgba(15,23,42,0.08)" : "none",
              transition: "color 120ms, background 120ms",
            }}
          >
            {v.label}
          </button>
        );
      })}
    </div>
  );
}

function SourcePill({ meta, count, active, onToggle }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onToggle}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={active ? `Hide ${meta.label}` : `Show ${meta.label}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        height: 30,
        padding: "0 11px",
        borderRadius: 999,
        border: `1px solid ${active ? meta.color : C.border}`,
        background: active ? meta.tint : hover ? C.surfaceHover : C.surface,
        color: active ? C.text : C.textMut,
        fontSize: 12.5,
        fontWeight: 600,
        cursor: "pointer",
        opacity: active ? 1 : 0.62,
        transition: "background 120ms, border-color 120ms, opacity 120ms",
      }}
    >
      <span style={{ width: 9, height: 9, borderRadius: 3, background: active ? meta.color : C.textMut, flexShrink: 0 }} />
      <span>{meta.label}</span>
      <span
        style={{
          minWidth: 18,
          textAlign: "center",
          padding: "0 5px",
          borderRadius: 999,
          background: active ? meta.color : C.borderLight,
          color: active ? "#FFFFFF" : C.textMut,
          fontSize: 11,
          fontWeight: 700,
          lineHeight: "16px",
        }}
      >
        {count}
      </span>
    </button>
  );
}

// ── A single event presented as a compact chip (month) or row (week/agenda) ───
function EventChip({ event, meta, onSelect, dense }) {
  const [hover, setHover] = useState(false);
  const color = meta ? meta.color : C.textMut;
  const tint = meta ? meta.tint : C.surfaceHover;
  const clickable = typeof onSelect === "function";
  const overdue = event.tone === "overdue";
  const done = event.tone === "done";
  return (
    <button
      type="button"
      onClick={clickable ? () => onSelect(event) : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={[event.title, event.subtitle].filter(Boolean).join(" — ")}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        width: "100%",
        textAlign: "left",
        padding: dense ? "2px 6px" : "5px 8px",
        border: "none",
        borderLeft: `3px solid ${overdue ? C.dan : color}`,
        background: hover && clickable ? color + "1F" : tint,
        borderRadius: 5,
        cursor: clickable ? "pointer" : "default",
        opacity: done ? 0.7 : 1,
        transition: "background 120ms",
        minWidth: 0,
      }}
    >
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
        <span
          style={{
            display: "block",
            fontSize: dense ? 11 : 12.5,
            fontWeight: 600,
            color: C.text,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            textDecoration: done ? "line-through" : "none",
          }}
        >
          {event.title}
        </span>
        {!dense && event.subtitle ? (
          <span
            style={{
              display: "block",
              fontSize: 11,
              color: overdue ? C.dan : C.textMut,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              marginTop: 1,
            }}
          >
            {event.subtitle}
          </span>
        ) : null}
      </span>
    </button>
  );
}

function MonthView({ cursor, today, eventsByDay, sources, onSelectEvent, onPickDay, weekStartsOn }) {
  const p = parseKey(cursor) || parseKey(today);
  const weeks = useMemo(() => getMonthMatrix(p.year, p.monthIndex, weekStartsOn), [p.year, p.monthIndex, weekStartsOn]);

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", background: C.border }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 1, background: C.border }}>
        {WEEKDAYS_SHORT.map((d) => (
          <div key={d} style={{ background: C.surfaceHover, padding: "7px 8px", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: C.textMut }}>
            {d}
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 1, background: C.border }}>
        {weeks.flat().map((cell) => {
          const dayEvents = eventsByDay.get(cell.key) || [];
          const isToday = cell.key === today;
          const overflow = dayEvents.length - MONTH_MAX_CHIPS;
          return (
            <div
              key={cell.key}
              style={{
                background: cell.inMonth ? C.surface : C.surfaceHover,
                minHeight: MONTH_CELL_MIN_HEIGHT,
                padding: 5,
                display: "flex",
                flexDirection: "column",
                gap: 3,
              }}
            >
              <button
                type="button"
                onClick={() => onPickDay(cell.key)}
                title="View this day"
                style={{
                  alignSelf: "flex-start",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minWidth: 22,
                  height: 22,
                  padding: "0 6px",
                  borderRadius: 999,
                  border: "none",
                  background: isToday ? C.pri : "transparent",
                  color: isToday ? "#FFFFFF" : cell.inMonth ? C.textSec : C.textMut,
                  fontSize: 12,
                  fontWeight: isToday ? 800 : 600,
                  cursor: "pointer",
                }}
              >
                {cell.day}
              </button>
              <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                {dayEvents.slice(0, MONTH_MAX_CHIPS).map((ev) => (
                  <EventChip key={ev.id} event={ev} meta={sources[ev.source]} onSelect={onSelectEvent} dense />
                ))}
                {overflow > 0 ? (
                  <button
                    type="button"
                    onClick={() => onPickDay(cell.key)}
                    style={{ border: "none", background: "transparent", color: C.textMut, fontSize: 11, fontWeight: 700, textAlign: "left", cursor: "pointer", padding: "0 2px" }}
                  >
                    +{overflow} more
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekView({ cursor, today, eventsByDay, sources, onSelectEvent, weekStartsOn }) {
  const days = useMemo(() => getWeekDays(cursor, weekStartsOn), [cursor, weekStartsOn]);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 1, background: C.border, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
      {days.map((key) => {
        const p = parseKey(key);
        const isToday = key === today;
        const dayEvents = eventsByDay.get(key) || [];
        return (
          <div key={key} style={{ background: C.surface, display: "flex", flexDirection: "column", minHeight: 320 }}>
            <div style={{ padding: "8px 8px 6px", borderBottom: `1px solid ${C.borderLight}`, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: C.textMut }}>
                {WEEKDAYS_SHORT[(p ? new Date(key + "T12:00:00").getDay() : 0)]}
              </span>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minWidth: 20,
                  height: 20,
                  borderRadius: 999,
                  background: isToday ? C.pri : "transparent",
                  color: isToday ? "#FFFFFF" : C.textSec,
                  fontSize: 12,
                  fontWeight: isToday ? 800 : 700,
                }}
              >
                {p ? p.day : ""}
              </span>
            </div>
            <div style={{ padding: 6, display: "flex", flexDirection: "column", gap: 5, overflowY: "auto" }}>
              {dayEvents.length === 0 ? (
                <span style={{ fontSize: 11, color: C.textMut, padding: "4px 2px" }}>—</span>
              ) : (
                dayEvents.map((ev) => (
                  <EventChip key={ev.id} event={ev} meta={sources[ev.source]} onSelect={onSelectEvent} />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AgendaView({ window: win, today, eventsByDay, sources, onSelectEvent }) {
  // Walk the window day-by-day, keeping only days that actually have events.
  const days = useMemo(() => {
    const out = [];
    let key = win.startKey;
    let guard = 0;
    while (key <= win.endKey && guard++ < 400) {
      const evs = eventsByDay.get(key);
      if (evs && evs.length) out.push({ key, events: evs });
      key = addDaysKey(key, 1);
    }
    return out;
  }, [win.startKey, win.endKey, eventsByDay]);

  if (days.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {days.map(({ key, events }) => {
        const p = parseKey(key);
        const d = new Date(key + "T12:00:00");
        const isToday = key === today;
        return (
          <div key={key} style={{ display: "flex", gap: 16, padding: "12px 4px", borderBottom: `1px solid ${C.borderLight}` }}>
            <div style={{ width: 72, flexShrink: 0, textAlign: "right" }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: isToday ? C.pri : C.textMut }}>
                {WEEKDAYS_SHORT[d.getDay()]}
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: isToday ? C.pri : C.text, lineHeight: 1.1 }}>{p ? p.day : ""}</div>
              <div style={{ fontSize: 11, color: C.textMut }}>{isToday ? "Today" : MONTHS_SHORT[d.getMonth()]}</div>
            </div>
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
              {events.map((ev) => (
                <EventChip key={ev.id} event={ev} meta={sources[ev.source]} onSelect={onSelectEvent} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EmptyState({ loading }) {
  const Icon = I.Calendar;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        gap: 10,
        padding: "64px 24px",
        border: `1.5px dashed ${C.border}`,
        borderRadius: 14,
        background: C.surfaceHover,
      }}
    >
      <div style={{ width: 48, height: 48, borderRadius: 13, background: `${C.pri}12`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {Icon ? <Icon style={{ width: 24, height: 24, color: C.pri }} /> : null}
      </div>
      <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{loading ? "Loading schedule…" : "Nothing scheduled in this range"}</div>
      <div style={{ fontSize: 13, color: C.textMut, maxWidth: 380 }}>
        {loading ? "Pulling labor, reviews, training, marketing, enrichment, and inventory." : "Adjust the date range or turn a source filter back on to see more."}
      </div>
    </div>
  );
}

export default function AggregatedCalendar({
  events = [],
  sources = {},
  sourceOrder = [],
  view = "month",
  onViewChange,
  cursor,
  onCursorChange,
  today,
  activeSources,
  onToggleSource,
  onSetAllSources,
  loading = false,
  onSelectEvent,
  weekStartsOn = 0,
}) {
  const win = useMemo(() => viewWindow(view, cursor, today, weekStartsOn), [view, cursor, today, weekStartsOn]);
  const counts = useMemo(() => countBySource(events), [events]);
  const allActive = sourceOrder.length > 0 && sourceOrder.every((key) => isSourceActive(activeSources, key));
  const shown = useMemo(() => filterByActiveSources(events, activeSources), [events, activeSources]);
  const eventsByDay = useMemo(() => groupByDay(shown), [shown]);

  const title =
    view === "month"
      ? monthLabel((parseKey(cursor) || parseKey(today)).year, (parseKey(cursor) || parseKey(today)).monthIndex)
      : rangeLabel(win.startKey, win.endKey);

  const handleStep = (dir) => {
    if (!onCursorChange) return;
    if (view === "month") {
      const p = parseKey(cursor) || parseKey(today);
      const next = addMonths(p.year, p.monthIndex, dir);
      onCursorChange(makeKey(next.year, next.monthIndex, 1));
    } else if (view === "week") {
      onCursorChange(addDaysKey(cursor || today, dir * 7));
    } else {
      onCursorChange(addDaysKey(cursor || today, dir * 14));
    }
  };

  const handlePickDay = (key) => {
    if (onCursorChange) onCursorChange(key);
    if (onViewChange) onViewChange("agenda");
  };

  const hasShown = shown.length > 0;

  return (
    <div>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <HoverButton onClick={() => handleStep(-1)} title="Previous" style={{ width: 32, padding: 0 }}>
            {I.ChevronRight ? <I.ChevronRight style={{ width: 16, height: 16, transform: "rotate(180deg)" }} /> : "‹"}
          </HoverButton>
          <HoverButton onClick={() => onCursorChange && onCursorChange(today)} title="Jump to today">
            Today
          </HoverButton>
          <HoverButton onClick={() => handleStep(1)} title="Next" style={{ width: 32, padding: 0 }}>
            {I.ChevronRight ? <I.ChevronRight style={{ width: 16, height: 16 }} /> : "›"}
          </HoverButton>
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, color: C.text, letterSpacing: "-0.01em", marginRight: "auto" }}>
          {title}
          {loading ? <span style={{ marginLeft: 10, fontSize: 12, fontWeight: 600, color: C.textMut }}>updating…</span> : null}
        </div>
        <ViewSwitch view={view} onViewChange={onViewChange} />
      </div>

      {/* Source filter pills */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 16 }}>
        {sourceOrder.map((key) => {
          const meta = sources[key];
          if (!meta) return null;
          const active = isSourceActive(activeSources, key);
          return (
            <SourcePill key={key} meta={meta} count={counts[key] || 0} active={active} onToggle={() => onToggleSource && onToggleSource(key)} />
          );
        })}
        {onSetAllSources ? (
          <button
            type="button"
            onClick={() => onSetAllSources(!allActive)}
            style={{
              height: 30,
              padding: "0 10px",
              marginLeft: 2,
              border: "none",
              background: "transparent",
              color: C.textMut,
              fontSize: 12.5,
              fontWeight: 700,
              cursor: "pointer",
              textDecoration: "underline",
              textUnderlineOffset: 3,
            }}
          >
            {allActive ? "Deselect all" : "Select all"}
          </button>
        ) : null}
      </div>

      {/* Body */}
      {view === "month" ? (
        <MonthView
          cursor={cursor || today}
          today={today}
          eventsByDay={eventsByDay}
          sources={sources}
          onSelectEvent={onSelectEvent}
          onPickDay={handlePickDay}
          weekStartsOn={weekStartsOn}
        />
      ) : view === "week" ? (
        <WeekView cursor={cursor || today} today={today} eventsByDay={eventsByDay} sources={sources} onSelectEvent={onSelectEvent} weekStartsOn={weekStartsOn} />
      ) : hasShown ? (
        <AgendaView window={win} today={today} eventsByDay={eventsByDay} sources={sources} onSelectEvent={onSelectEvent} />
      ) : (
        <EmptyState loading={loading} />
      )}
    </div>
  );
}
