// CalendarPage — the aggregated calendar (C1 · Linear K9-16).
//
// One schedule across six operational sources: labor start dates, compliance due
// dates, training due dates, marketing events + outreach follow-ups, enrichment
// events, and the recurring inventory count. All aggregation + compute happens
// server-side in the `get_calendar_events` Postgres function; the page just maps
// the rows. To keep navigation snappy it fetches a wide window (the cursor month
// ±1) and only refetches when you move outside it, and it subscribes to the
// source tables via Supabase realtime so changes elsewhere appear live.
//
// The "calendar" route, its "Calendar Access" permission, and the Home launcher
// card are wired in KolApp.jsx.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { C, todayStr } from "../../shared/theme";
import { supabase } from "../../supabaseClient";
import AggregatedCalendar from "../../shared/AggregatedCalendar";
import { addMonths, monthWindow, parseKey, viewWindow } from "../../shared/calendarGrid";
import { SOURCE_ORDER, mapCalendarRows } from "./calendarSources";

// Visual registry for the six sources: a restrained categorical palette (calm,
// distinguishable hues), each just a colored dot + label.
const SOURCE_META = {
  labor: { label: "Labor starts", color: "#2563EB", tint: "#EFF6FF" },
  compliance: { label: "Compliance", color: "#7C3AED", tint: "#F5F3FF" },
  training: { label: "Training due", color: "#0891B2", tint: "#ECFEFF" },
  marketing: { label: "Marketing", color: "#DB2777", tint: "#FDF2F8" },
  enrichment: { label: "Enrichment", color: "#4D7C0F", tint: "#F7FEE7" },
  inventory: { label: "Inventory", color: "#D97706", tint: "#FFFBEB" },
};

// Enrichment is the company-wide recurring program — useful but noisy, so it
// starts hidden; everything else is on by default.
const DEFAULT_SOURCES = SOURCE_ORDER.filter((key) => key !== "enrichment");

// Tables that feed the calendar — subscribed to for live updates.
const REALTIME_TABLES = [
  "labor_employees", "employee_review_instances", "training_records",
  "grassroots_event_dates", "grassroots_targets", "enrichment_events", "lite_settings",
  "labor_compliance_due_date_overrides", "labor_compliance_exceptions",
  "labor_compliance_evidence_links", "labor_compliance_requirements", "labor_compliance_role_applicability",
];

// Where each source deep-links when an event is clicked (only well-known routes).
const NAV_SLUG = {
  training: "training",
  enrichment: "enrichments",
  marketing: "grassroots",
  inventory: "inventory",
};

// A generous fetch window: the cursor's month ±1 (grid-aligned). Navigating one
// month either way stays inside it, so it serves from memory with no refetch.
function wideWindowFor(cursorKey, todayKey) {
  const p = parseKey(cursorKey) || parseKey(todayKey);
  const prev = addMonths(p.year, p.monthIndex, -1);
  const next = addMonths(p.year, p.monthIndex, 1);
  return { startKey: monthWindow(prev.year, prev.monthIndex).startKey, endKey: monthWindow(next.year, next.monthIndex).endKey };
}

function covers(range, win) {
  return !!range && !!win && range.startKey <= win.startKey && range.endKey >= win.endKey;
}

export default function CalendarPage({ profile, nav, locationId, addGlobalToast }) {
  const [today] = useState(() => todayStr());
  const [view, setView] = useState("month");
  const [cursor, setCursor] = useState(() => todayStr());
  const [activeSources, setActiveSources] = useState(() => new Set(DEFAULT_SOURCES));
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const fetchRangeRef = useRef(null);
  const reqIdRef = useRef(0);

  const loadEvents = useCallback(
    async (range, quiet) => {
      if (!locationId || !range) return;
      const reqId = ++reqIdRef.current;
      if (!quiet) setLoading(true);
      const { data, error } = await supabase.rpc("get_calendar_events", {
        p_location_id: locationId,
        p_start: range.startKey,
        p_end: range.endKey,
        p_today: today,
      });
      if (reqId !== reqIdRef.current) return; // a newer request superseded this one
      if (error) {
        setLoading(false);
        if (!quiet) addGlobalToast?.("Could not load the calendar. Please try again.", "error");
        return;
      }
      setEvents(mapCalendarRows(data || []));
      setLoading(false);
    },
    [locationId, today, addGlobalToast],
  );

  // Reset the cached range when the location changes so it refetches.
  useEffect(() => {
    fetchRangeRef.current = null;
    if (!locationId) setEvents([]);
  }, [locationId]);

  // Fetch only when the visible window isn't already covered by the loaded range.
  useEffect(() => {
    if (!locationId) return;
    const display = viewWindow(view, cursor, today);
    if (!covers(fetchRangeRef.current, display)) {
      const wide = wideWindowFor(cursor, today);
      fetchRangeRef.current = wide;
      loadEvents(wide, false);
    }
  }, [locationId, view, cursor, today, loadEvents]);

  // Live updates: quietly refetch the loaded window when any source table changes.
  useEffect(() => {
    if (!locationId) return undefined;
    let timer = null;
    const ping = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (fetchRangeRef.current) loadEvents(fetchRangeRef.current, true);
      }, 400);
    };
    let channel = supabase.channel(`calendar-${locationId}`);
    REALTIME_TABLES.forEach((table) => {
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, ping);
    });
    channel.subscribe();
    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [locationId, loadEvents]);

  const toggleSource = useCallback((key) => {
    setActiveSources((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const setAllSources = useCallback((on) => {
    setActiveSources(on ? new Set(SOURCE_ORDER) : new Set());
  }, []);

  const handleSelectEvent = useCallback(
    (event) => {
      const slug = NAV_SLUG[event?.source];
      if (slug && typeof nav === "function") {
        try {
          nav(slug);
        } catch {
          /* navigation is best-effort */
        }
      }
    },
    [nav],
  );

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "8px 0" }}>
      <h1 style={{ margin: "0 0 18px", fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: "-0.01em" }}>Calendar</h1>

      {!locationId ? (
        <div
          style={{
            marginTop: 8,
            padding: "56px 24px",
            border: `1.5px dashed ${C.border}`,
            borderRadius: 16,
            background: C.surfaceHover,
            textAlign: "center",
            color: C.textMut,
            fontSize: 14,
          }}
        >
          Select a location to view its aggregated calendar.
        </div>
      ) : (
        <div style={{ padding: 18, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16 }}>
          <AggregatedCalendar
            events={events}
            sources={SOURCE_META}
            sourceOrder={SOURCE_ORDER}
            view={view}
            onViewChange={setView}
            cursor={cursor}
            onCursorChange={setCursor}
            today={today}
            activeSources={activeSources}
            onToggleSource={toggleSource}
            onSetAllSources={setAllSources}
            loading={loading}
            onSelectEvent={handleSelectEvent}
          />
        </div>
      )}
    </div>
  );
}
