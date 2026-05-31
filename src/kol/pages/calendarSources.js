// Adapter for the aggregated-calendar feed.
//
// Aggregation + per-source compute live server-side in the `get_calendar_events`
// Postgres function (see supabase/migrations/*_aggregated_calendar_events_rpc.sql).
// This module only declares the source ordering and maps the RPC's normalized
// rows into the event shape the AggregatedCalendar component renders:
//
//   { id, source, kind, date, time?, title, subtitle?, status?, tone?, meta? }

import { isDateKey, compareEvents } from "../../shared/calendarGrid";

export const SOURCE_ORDER = ["labor", "compliance", "training", "marketing", "enrichment", "inventory", "holiday"];

const SOURCE_SET = new Set(SOURCE_ORDER);

// "19:00:00" -> "19:00"; anything falsy/odd -> undefined (treated as all-day).
function toHm(value) {
  if (!value || typeof value !== "string") return undefined;
  const m = value.match(/^(\d{2}:\d{2})/);
  return m ? m[1] : undefined;
}

// Map rows returned by public.get_calendar_events into sorted calendar events.
export function mapCalendarRows(rows = []) {
  const out = [];
  for (const r of rows) {
    if (!r || !SOURCE_SET.has(r.source) || !isDateKey(r.event_date)) continue;
    out.push({
      id: r.event_id || `${r.source}-${r.ref_id || r.event_date}`,
      source: r.source,
      kind: r.kind || null,
      date: r.event_date,
      time: toHm(r.event_time),
      title: r.title || "",
      subtitle: r.subtitle || "",
      status: r.status || null,
      tone: r.tone || "default",
      meta: { refId: r.ref_id || null },
    });
  }
  out.sort(compareEvents);
  return out;
}
