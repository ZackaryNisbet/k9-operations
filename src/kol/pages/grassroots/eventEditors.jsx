import React, { useState } from "react";
import { C } from "../../../shared/theme";
import { I } from "../../../shared/icons";
import { CalendarPicker } from "../../../shared/ui";
import { normalizeGrassrootsEventDates } from "../../grassrootsData";
import { INPUT_STYLE, Label } from "./primitives";
import { eventLinkRowsForEditor, getSafeEventLinkHref } from "./eventLinks";

export function EventDateEditor({ draft, onChange }) {
  const initialRows = () => {
    if (Array.isArray(draft.event_dates) && draft.event_dates.length > 0) return draft.event_dates;
    const normalized = normalizeGrassrootsEventDates(draft);
    return normalized.length > 0 ? normalized : [{ id: "event_date_1", event_date: "", start_time: "", end_time: "", sequence_order: 1 }];
  };
  const rows = initialRows();
  const multiDay = Boolean(draft.is_multi_day_event || rows.length > 1);
  const emitRows = (nextRows, nextMultiDay = multiDay) => {
    const prepared = nextRows.map((row, index) => ({
      ...row,
      id: row.id || `event_date_${index + 1}`,
      sequence_order: index + 1,
    }));
    onChange("event_dates", prepared);
    onChange("is_multi_day_event", nextMultiDay);
    onChange("event_start_date", prepared[0]?.event_date || "");
    onChange("event_end_date", nextMultiDay ? (prepared.at(-1)?.event_date || "") : "");
    onChange("event_time", prepared[0]?.start_time || "");
  };
  const updateRow = (index, key, value) => {
    const nextRows = rows.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row);
    emitRows(nextRows);
  };
  const visibleRows = multiDay ? rows : rows.slice(0, 1);

  // Recurrence generator: build the full date series from the first date, by
  // frequency, through an end date (e.g. a farmer's market every Sunday for 3
  // months). Generated dates fill event_dates as a multi-day event.
  const [recurFreq, setRecurFreq] = useState("none"); // none | weekly | biweekly | monthly
  const [recurUntil, setRecurUntil] = useState("");
  const firstDate = rows[0]?.event_date || "";
  const canGenerate = Boolean(firstDate) && recurFreq !== "none" && Boolean(recurUntil);
  const generateRecurrence = () => {
    if (!canGenerate) return;
    const start = new Date(`${firstDate}T12:00:00`);
    const until = new Date(`${recurUntil}T12:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(until.getTime()) || until < start) return;
    const baseTimes = { start_time: rows[0]?.start_time || "", end_time: rows[0]?.end_time || "" };
    const generated = [];
    const cursor = new Date(start);
    let guard = 0;
    while (cursor <= until && guard < 520) {
      const y = cursor.getFullYear();
      const m = String(cursor.getMonth() + 1).padStart(2, "0");
      const d = String(cursor.getDate()).padStart(2, "0");
      generated.push({ id: `event_date_${generated.length + 1}`, event_date: `${y}-${m}-${d}`, ...baseTimes, sequence_order: generated.length + 1 });
      if (recurFreq === "monthly") cursor.setMonth(cursor.getMonth() + 1);
      else cursor.setDate(cursor.getDate() + (recurFreq === "biweekly" ? 14 : 7));
      guard += 1;
    }
    if (generated.length > 1) emitRows(generated, true);
  };

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <Label>Date</Label>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, color: C.textSec, fontWeight: 800 }}>
          <input
            type="checkbox"
            checked={multiDay}
            onChange={(event) => emitRows(event.target.checked && rows.length === 1 ? [...rows, { id: `event_date_${Date.now()}`, event_date: "", start_time: "", end_time: "", sequence_order: 2 }] : rows.slice(0, 1), event.target.checked)}
            style={{ accentColor: C.pri }}
          />
          Multi-day
        </label>
      </div>
      {visibleRows.map((row, index) => (
        <div key={row.id || index} className="grassroots-event-date-row">
          <CalendarPicker label={multiDay ? `Date ${index + 1}` : "Date"} value={row.event_date || ""} onChange={(value) => updateRow(index, "event_date", value)} required />
          <label style={{ display: "block" }}>
            <Label>Start</Label>
            <input type="time" value={row.start_time || ""} onChange={(event) => updateRow(index, "start_time", event.target.value)} style={{ ...INPUT_STYLE, background: C.bg }} />
          </label>
          <label style={{ display: "block" }}>
            <Label>End</Label>
            <input type="time" value={row.end_time || ""} onChange={(event) => updateRow(index, "end_time", event.target.value)} style={{ ...INPUT_STYLE, background: C.bg }} />
          </label>
          {multiDay && (
            <button
              type="button"
              onClick={() => emitRows(rows.filter((_, rowIndex) => rowIndex !== index))}
              disabled={rows.length <= 1}
              aria-label="Remove date"
              style={{ width: 34, height: 34, borderRadius: 9, border: `1.5px solid ${C.borderLight}`, background: "#fff", color: C.textMut, cursor: rows.length > 1 ? "pointer" : "default", display: "grid", placeItems: "center" }}
            >
              <I.X />
            </button>
          )}
        </div>
      ))}
      {multiDay && (
        <button
          type="button"
          onClick={() => emitRows([...rows, { id: `event_date_${Date.now()}`, event_date: "", start_time: "", end_time: "", sequence_order: rows.length + 1 }])}
          style={{ width: "fit-content", padding: "7px 12px", borderRadius: 9, border: `1.5px dashed ${C.pri}`, background: "transparent", color: C.pri, fontSize: 12, fontWeight: 900, fontFamily: "inherit", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <I.Plus /> Add date
        </button>
      )}

      <div style={{ display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap", padding: "9px 11px", borderRadius: 9, border: `1px dashed ${C.border}`, background: C.bg }}>
        <div>
          <Label>Repeat</Label>
          <div style={{ display: "flex", gap: 4 }}>
            {[{ id: "none", label: "None" }, { id: "weekly", label: "Weekly" }, { id: "biweekly", label: "Every 2 wks" }, { id: "monthly", label: "Monthly" }].map((opt) => {
              const on = recurFreq === opt.id;
              return (
                <button key={opt.id} type="button" onClick={() => setRecurFreq(opt.id)} style={{ padding: "5px 9px", borderRadius: 8, border: `1.5px solid ${on ? C.pri : C.border}`, background: on ? C.pri : "#fff", color: on ? "#fff" : C.textMut, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>{opt.label}</button>
              );
            })}
          </div>
        </div>
        {recurFreq !== "none" && (
          <div style={{ minWidth: 150 }}>
            <CalendarPicker label="Until" value={recurUntil} onChange={setRecurUntil} min={firstDate || undefined} />
          </div>
        )}
        {recurFreq !== "none" && (
          <button type="button" onClick={generateRecurrence} disabled={!canGenerate} style={{ padding: "9px 13px", borderRadius: 9, border: "none", background: canGenerate ? C.pri : C.border, color: "#fff", fontSize: 12, fontWeight: 800, cursor: canGenerate ? "pointer" : "default", fontFamily: "inherit" }}>Generate dates</button>
        )}
        {recurFreq !== "none" && (
          <div style={{ flexBasis: "100%", fontSize: 11, color: C.textMut, lineHeight: 1.4 }}>
            Builds the full series from the first date above through the chosen end date (replaces the date list).
          </div>
        )}
      </div>
    </div>
  );
}

export function EventLinksEditor({ draft, onChange }) {
  const rows = eventLinkRowsForEditor(draft);
  const updateRows = (nextRows) => {
    const details = draft.details && typeof draft.details === "object" ? draft.details : {};
    onChange("details", { ...details, links: nextRows });
  };
  const updateRow = (index, key, value) => {
    updateRows(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row)));
  };
  const removeRow = (index) => {
    const nextRows = rows.filter((_, rowIndex) => rowIndex !== index);
    updateRows(nextRows.length > 0 ? nextRows : [{ id: "event_link_blank", url: "" }]);
  };

  return (
    <div className="grassroots-event-links">
      <div className="grassroots-event-links-header">
        <Label>Links</Label>
        <button
          type="button"
          onClick={() => updateRows([...rows, { id: `event_link_${Date.now()}`, url: "" }])}
          className="grassroots-link-add-button"
        >
          <I.Plus /> Add link
        </button>
      </div>
      <div className="grassroots-event-links-list">
        {rows.map((row, index) => {
          const safeHref = getSafeEventLinkHref(row.url);
          return (
            <div key={row.id || index} className="grassroots-event-link-row">
              <div className="grassroots-event-link-url">
                <input
                  value={row.url || ""}
                  onChange={(event) => updateRow(index, "url", event.target.value)}
                  placeholder="Paste link"
                  style={{ ...INPUT_STYLE, background: C.bg, paddingRight: safeHref ? 86 : 12 }}
                />
                {safeHref && (
                  <a href={safeHref} target="_blank" rel="noreferrer" className="grassroots-event-link-open" title="Open link" aria-label="Open link">
                    <I.Link /> Open
                  </a>
                )}
              </div>
              <button
                type="button"
                onClick={() => removeRow(index)}
                className="grassroots-link-remove-button"
                aria-label="Remove link"
                title="Remove link"
              >
                <I.X />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
