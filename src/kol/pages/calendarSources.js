// Normalizers that fold the six operational data sources into one flat list of
// calendar events. Each normalizer is a pure function over already-fetched rows,
// so the whole module is unit-testable with no Supabase or DOM. The page layer
// (CalendarPage) owns the reads; this layer owns the shape.
//
// Event shape:
//   { id, source, kind, date, time?, title, subtitle?, status?, tone?, meta? }
//   - source: one of SOURCE_ORDER
//   - tone:   "default" | "overdue" | "done"  (drives subtle color emphasis)
//   - date:   YYYY-MM-DD string key

import { addDaysKey, diffDaysKey, isDateKey, compareEvents } from "../../shared/calendarGrid";
import { normalizeInventorySchedule, formatInventoryCadenceLabel } from "./inventorySchedule";

export const SOURCE_ORDER = ["labor", "review", "training", "marketing", "enrichment", "inventory"];

const REVIEW_CYCLE_LABEL = { "30_day": "30-Day", "60_day": "60-Day", "90_day": "90-Day" };
const REVIEW_CYCLES = new Set(Object.keys(REVIEW_CYCLE_LABEL));

const MARKETING_CATEGORY_LABEL = {
  events: "Events",
  drops: "Drops",
  corporate_partnerships: "Corporate partnership",
  apartments: "Apartments",
  pet_professional_partnerships: "Pet professional",
};

function titleizeToken(value) {
  if (!value) return "";
  return String(value).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function inWindow(key, win) {
  return isDateKey(key) && (!win || (key >= win.startKey && key <= win.endKey));
}

function isOverdue(key, todayKey) {
  return isDateKey(key) && isDateKey(todayKey) && key < todayKey;
}

// ── Labor: start dates (and first-shift dates when they differ) ───────────────
export function normalizeLaborStarts(employees = [], { window: win, today } = {}) {
  const out = [];
  for (const e of employees) {
    if (!e) continue;
    if (isDateKey(e.start_date) && inWindow(e.start_date, win)) {
      out.push({
        id: `labor-start-${e.id}`,
        source: "labor",
        kind: "start",
        date: e.start_date,
        title: e.full_name || "New hire",
        subtitle: e.position_title ? `Starts · ${e.position_title}` : "Start date",
        tone: isOverdue(e.start_date, today) ? "done" : "default",
        meta: { employeeId: e.id },
      });
    }
    if (
      isDateKey(e.first_shift_date) &&
      e.first_shift_date !== e.start_date &&
      inWindow(e.first_shift_date, win)
    ) {
      out.push({
        id: `labor-shift-${e.id}`,
        source: "labor",
        kind: "first_shift",
        date: e.first_shift_date,
        title: e.full_name || "New hire",
        subtitle: e.position_title ? `First shift · ${e.position_title}` : "First shift",
        tone: "default",
        meta: { employeeId: e.id },
      });
    }
  }
  return out;
}

// ── Reviews: 30 / 60 / 90-day instances with a due date ──────────────────────
export function normalizeReviews(instances = [], employeeById = new Map(), { today } = {}) {
  const map = employeeById instanceof Map ? employeeById : new Map(Object.entries(employeeById || {}));
  const out = [];
  for (const r of instances) {
    if (!r || !REVIEW_CYCLES.has(r.review_cycle) || !isDateKey(r.due_date)) continue;
    const emp = map.get(r.labor_employee_id);
    const name = (emp && emp.full_name) || r.employee_name || "Employee";
    const cycle = REVIEW_CYCLE_LABEL[r.review_cycle];
    const done = r.status === "completed";
    out.push({
      id: `review-${r.id}`,
      source: "review",
      kind: r.review_cycle,
      date: r.due_date,
      title: `${name} · ${cycle} review`,
      subtitle: done ? "Completed" : isOverdue(r.due_date, today) ? "Overdue" : "Due",
      status: r.status,
      tone: done ? "done" : isOverdue(r.due_date, today) ? "overdue" : "default",
      meta: { instanceId: r.id, employeeId: r.labor_employee_id },
    });
  }
  return out;
}

// ── Training: records with a target completion date still outstanding ─────────
export function normalizeTraining(records = [], { today } = {}) {
  const out = [];
  for (const t of records) {
    if (!t || !isDateKey(t.target_end_date)) continue;
    const status = t.overall_status;
    if (status === "completed" || status === "complete") continue;
    const pct = Number(t.progress_percent);
    const pctLabel = Number.isFinite(pct) && pct > 0 ? ` · ${Math.round(pct)}%` : "";
    out.push({
      id: `training-${t.id}`,
      source: "training",
      kind: "due",
      date: t.target_end_date,
      title: `${t.employee_full_name || "Employee"} · Training due`,
      subtitle: `${t.target_role || "Training"}${pctLabel}`,
      status,
      tone: isOverdue(t.target_end_date, today) ? "overdue" : "default",
      meta: { recordId: t.id },
    });
  }
  return out;
}

// ── Marketing: scheduled events ──────────────────────────────────────────────
export function normalizeMarketingEvents(events = []) {
  const out = [];
  for (const e of events) {
    if (!e || !isDateKey(e.event_date)) continue;
    out.push({
      id: `mkt-event-${e.id}`,
      source: "marketing",
      kind: "event",
      date: e.event_date,
      title: e.title || "Marketing event",
      subtitle: e.venue_name || titleizeToken(e.event_type) || "Event",
      tone: "default",
      meta: { eventId: e.id },
    });
  }
  return out;
}

// ── Marketing: outreach follow-ups (a target's next scheduled contact) ────────
export function normalizeMarketingFollowups(targets = [], { today } = {}) {
  const out = [];
  for (const t of targets) {
    if (!t || !isDateKey(t.next_contact_date)) continue;
    const name = (t.name && t.name.trim()) || t.organizer || "Outreach target";
    out.push({
      id: `mkt-follow-${t.id}`,
      source: "marketing",
      kind: "follow_up",
      date: t.next_contact_date,
      title: `Follow up · ${name}`,
      subtitle: MARKETING_CATEGORY_LABEL[t.category] || titleizeToken(t.category) || "Outreach",
      status: t.status,
      tone: isOverdue(t.next_contact_date, today) ? "overdue" : "default",
      meta: { targetId: t.id },
    });
  }
  return out;
}

// ── Enrichment: planned enrichment events ────────────────────────────────────
export function normalizeEnrichment(events = []) {
  const out = [];
  for (const e of events) {
    if (!e || !isDateKey(e.event_date)) continue;
    out.push({
      id: `enrich-${e.id}`,
      source: "enrichment",
      kind: "enrichment",
      date: e.event_date,
      title: e.title || "Enrichment",
      subtitle: e.subtitle || e.category || "Enrichment",
      status: e.status,
      tone: "default",
      meta: { eventId: e.id },
    });
  }
  return out;
}

// ── Inventory: recurring count-due markers generated from the cadence ─────────
// Inventory "daily-due" is a scheduled recurring count (weekly by default),
// stored as a cadence rather than rows, so we materialize the occurrences that
// land inside the visible window.
export function buildInventoryDueEvents(scheduleInput, { window: win, today, cadenceLabel } = {}) {
  if (!win || !isDateKey(win.startKey) || !isDateKey(win.endKey)) return [];
  const schedule = normalizeInventorySchedule(scheduleInput, today || win.startKey);
  const cadence = Number(schedule.cadenceDays) || 7;
  const anchor = schedule.anchorDate;
  if (!isDateKey(anchor)) return [];
  const label = cadenceLabel || formatInventoryCadenceLabel(schedule);

  // Snap to the first occurrence on/after the window start, then step forward.
  const gap = diffDaysKey(anchor, win.startKey);
  let d = addDaysKey(anchor, Math.floor(gap / cadence) * cadence);
  while (d < win.startKey) d = addDaysKey(d, cadence);

  const out = [];
  let guard = 0;
  while (d <= win.endKey && guard++ < 500) {
    out.push({
      id: `inventory-${d}`,
      source: "inventory",
      kind: "count_due",
      date: d,
      time: schedule.dueTime,
      title: "Inventory count due",
      subtitle: label,
      tone: today && d < today ? "overdue" : "default",
      meta: { cadenceDays: cadence },
    });
    d = addDaysKey(d, cadence);
  }
  return out;
}

// Merge any number of event arrays into one chronologically-sorted list.
export function aggregateEvents(parts) {
  const all = [];
  for (const arr of parts) if (Array.isArray(arr)) all.push(...arr);
  all.sort(compareEvents);
  return all;
}
