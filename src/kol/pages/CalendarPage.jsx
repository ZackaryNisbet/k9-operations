// CalendarPage — the aggregated calendar (C1 · Linear K9-16).
//
// One schedule across six operational sources: labor start dates, 30/60/90-day
// reviews, training due dates, marketing events + outreach follow-ups, enrichment
// events, and the recurring inventory count. All aggregation + compute happens
// server-side in the `get_calendar_events` Postgres function (one round-trip per
// window); the page just maps the normalized rows and hands them to the shared
// AggregatedCalendar. The function is SECURITY INVOKER, so each source is still
// gated by its existing per-table RLS.
//
// The "calendar" route, its "Calendar Access" permission, and the Home launcher
// card are wired in KolApp.jsx.

import React, { useCallback, useEffect, useState } from "react";
import { C, todayStr } from "../../shared/theme";
import { I } from "../../shared/icons";
import { supabase } from "../../supabaseClient";
import AggregatedCalendar from "../../shared/AggregatedCalendar";
import { viewWindow } from "../../shared/calendarGrid";
import { SOURCE_ORDER, mapCalendarRows } from "./calendarSources";

// Visual registry for the six sources: a restrained categorical palette (calm,
// distinguishable hues) with the brand green reserved for enrichment (play/brain).
const SOURCE_META = {
  labor: { label: "Labor starts", color: "#2563EB", tint: "#EFF6FF", Icon: I.Users },
  review: { label: "Reviews", color: "#7C3AED", tint: "#F5F3FF", Icon: I.ClipboardCheck },
  training: { label: "Training due", color: "#0891B2", tint: "#ECFEFF", Icon: I.GraduationCap },
  marketing: { label: "Marketing", color: "#DB2777", tint: "#FDF2F8", Icon: I.Send },
  enrichment: { label: "Enrichment", color: "#4D7C0F", tint: "#F7FEE7", Icon: I.Sparkle },
  inventory: { label: "Inventory", color: "#D97706", tint: "#FFFBEB", Icon: I.Package },
};

// Where each source deep-links when an event is clicked (only well-known routes).
const NAV_SLUG = {
  training: "training",
  enrichment: "enrichments",
  marketing: "grassroots",
  inventory: "inventory",
};

export default function CalendarPage({ profile, nav, locationId, addGlobalToast }) {
  const [today] = useState(() => todayStr());
  const [view, setView] = useState("month");
  const [cursor, setCursor] = useState(() => todayStr());
  const [activeSources, setActiveSources] = useState(() => new Set(SOURCE_ORDER));
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!locationId) {
      setEvents([]);
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    const win = viewWindow(view, cursor, today);

    supabase
      .rpc("get_calendar_events", {
        p_location_id: locationId,
        p_start: win.startKey,
        p_end: win.endKey,
        p_today: today,
      })
      .then(
        ({ data, error }) => {
          if (cancelled) return;
          if (error) {
            setEvents([]);
            setLoading(false);
            addGlobalToast?.("Could not load the calendar. Please try again.", "error");
            return;
          }
          setEvents(mapCalendarRows(data || []));
          setLoading(false);
        },
        () => {
          if (cancelled) return;
          setEvents([]);
          setLoading(false);
        },
      );

    return () => {
      cancelled = true;
    };
  }, [locationId, view, cursor, today, addGlobalToast]);

  const toggleSource = useCallback((key) => {
    setActiveSources((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
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

  const totalInRange = events.length;

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "8px 0" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 4 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: "-0.01em" }}>Calendar</h1>
          <p style={{ marginTop: 6, marginBottom: 0, fontSize: 14, color: C.textMut }}>
            One aggregated schedule across labor, reviews, training, marketing, enrichment, and inventory.
          </p>
        </div>
      </div>

      {!locationId ? (
        <div
          style={{
            marginTop: 24,
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
        <div style={{ marginTop: 18, padding: 18, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16 }}>
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
            loading={loading}
            onSelectEvent={handleSelectEvent}
          />
          {totalInRange > 0 ? (
            <div style={{ marginTop: 14, fontSize: 12, color: C.textMut }}>
              {totalInRange} scheduled {totalInRange === 1 ? "item" : "items"} in view.
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
