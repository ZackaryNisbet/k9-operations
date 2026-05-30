// CalendarPage — the aggregated calendar (C1 · Linear K9-16).
//
// One schedule across six operational sources: labor start dates, 30/60/90-day
// reviews, training due dates, marketing events + outreach follow-ups, enrichment
// events, and the recurring inventory count. Each source is read independently
// (Promise.allSettled) and folded into a normalized event list by calendarSources,
// then handed to the shared AggregatedCalendar. A source that errors or is empty
// (e.g. RLS, sparse data) simply contributes nothing — the rest still render.
//
// The "calendar" route, its "Calendar Access" permission, and the Home launcher
// card are wired in KolApp.jsx.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { C, todayStr } from "../../shared/theme";
import { I } from "../../shared/icons";
import { supabase } from "../../supabaseClient";
import AggregatedCalendar from "../../shared/AggregatedCalendar";
import { viewWindow } from "../../shared/calendarGrid";
import {
  SOURCE_ORDER,
  aggregateEvents,
  buildInventoryDueEvents,
  normalizeEnrichment,
  normalizeLaborStarts,
  normalizeMarketingEvents,
  normalizeMarketingFollowups,
  normalizeReviews,
  normalizeTraining,
} from "./calendarSources";

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

function firstData(result) {
  return result.status === "fulfilled" && result.value && !result.value.error ? result.value.data : null;
}

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

    (async () => {
      // Employees first — they back the labor-starts source and the name lookup
      // for review instances (which carry no location_id of their own).
      let employees = [];
      try {
        const { data, error } = await supabase
          .from("labor_employees")
          .select("id, full_name, position_title, start_date, first_shift_date, employment_status, end_date")
          .eq("location_id", locationId);
        if (!error && Array.isArray(data)) employees = data;
      } catch {
        employees = [];
      }
      if (cancelled) return;

      const empMap = new Map(employees.map((e) => [e.id, e]));
      const empIds = employees.map((e) => e.id);

      const results = await Promise.allSettled([
        empIds.length
          ? supabase
              .from("employee_review_instances")
              .select("id, labor_employee_id, review_cycle, due_date, status")
              .in("labor_employee_id", empIds)
              .gte("due_date", win.startKey)
              .lte("due_date", win.endKey)
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from("training_records")
          .select("id, employee_full_name, target_role, target_end_date, overall_status, progress_percent")
          .eq("location_id", locationId)
          .gte("target_end_date", win.startKey)
          .lte("target_end_date", win.endKey),
        supabase
          .from("grassroots_events")
          .select("id, title, event_type, venue_name, event_date")
          .eq("location_id", locationId)
          .gte("event_date", win.startKey)
          .lte("event_date", win.endKey),
        supabase
          .from("grassroots_targets")
          .select("id, name, organizer, category, status, next_contact_date")
          .eq("location_id", locationId)
          .gte("next_contact_date", win.startKey)
          .lte("next_contact_date", win.endKey),
        supabase
          .from("enrichment_events")
          .select("id, title, subtitle, category, status, event_date")
          .eq("location_id", locationId)
          .gte("event_date", win.startKey)
          .lte("event_date", win.endKey),
        supabase
          .from("lite_settings")
          .select("setting_value")
          .eq("location_id", locationId)
          .eq("setting_key", "inventory_schedule")
          .maybeSingle(),
      ]);
      if (cancelled) return;

      const reviews = firstData(results[0]) || [];
      const training = firstData(results[1]) || [];
      const marketingEvents = firstData(results[2]) || [];
      const targets = firstData(results[3]) || [];
      const enrichment = firstData(results[4]) || [];
      const scheduleValue = firstData(results[5])?.setting_value || null;

      const merged = aggregateEvents([
        normalizeLaborStarts(employees, { window: win, today }),
        normalizeReviews(reviews, empMap, { today }),
        normalizeTraining(training, { today }),
        normalizeMarketingEvents(marketingEvents),
        normalizeMarketingFollowups(targets, { today }),
        normalizeEnrichment(enrichment),
        buildInventoryDueEvents(scheduleValue, { window: win, today }),
      ]);

      setEvents(merged);
      setLoading(false);
    })().catch(() => {
      if (!cancelled) {
        setLoading(false);
        addGlobalToast?.("Could not load the calendar. Please try again.", "error");
      }
    });

    return () => {
      cancelled = true;
    };
    // activeSources is intentionally excluded: filtering is client-side and needs no refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId, view, cursor, today]);

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
