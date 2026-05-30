import { describe, expect, it } from "vitest";
import {
  makeKey,
  parseKey,
  addDaysKey,
  diffDaysKey,
  weekdayOf,
  startOfWeekKey,
  getWeekDays,
  addMonths,
  getMonthMatrix,
  monthWindow,
  weekWindow,
  agendaWindow,
  viewWindow,
  isWithin,
  compareEvents,
  groupByDay,
  filterByActiveSources,
  countBySource,
  rangeLabel,
} from "../shared/calendarGrid";
import {
  SOURCE_ORDER,
  normalizeLaborStarts,
  normalizeReviews,
  normalizeTraining,
  normalizeMarketingEvents,
  normalizeMarketingFollowups,
  normalizeEnrichment,
  buildInventoryDueEvents,
  aggregateEvents,
} from "../kol/pages/calendarSources";

describe("calendarGrid date math", () => {
  it("builds and parses keys", () => {
    expect(makeKey(2026, 0, 1)).toBe("2026-01-01");
    expect(makeKey(2026, 11, 31)).toBe("2026-12-31");
    expect(parseKey("2026-05-30")).toEqual({ year: 2026, monthIndex: 4, day: 30 });
    expect(parseKey("nope")).toBeNull();
  });

  it("adds days across month and year boundaries", () => {
    expect(addDaysKey("2026-05-30", 1)).toBe("2026-05-31");
    expect(addDaysKey("2026-05-31", 1)).toBe("2026-06-01");
    expect(addDaysKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysKey("2026-01-01", -1)).toBe("2025-12-31");
    expect(diffDaysKey("2026-05-01", "2026-05-31")).toBe(30);
    expect(diffDaysKey("2026-12-31", "2027-01-01")).toBe(1);
  });

  it("knows weekdays (0=Sun) and week starts", () => {
    // 2026-05-30 is a Saturday; 2026-02-01 is a Sunday.
    expect(weekdayOf("2026-05-30")).toBe(6);
    expect(weekdayOf("2026-02-01")).toBe(0);
    expect(startOfWeekKey("2026-05-30")).toBe("2026-05-24"); // Sun before Sat
    expect(getWeekDays("2026-05-30")).toEqual([
      "2026-05-24", "2026-05-25", "2026-05-26", "2026-05-27",
      "2026-05-28", "2026-05-29", "2026-05-30",
    ]);
  });

  it("steps months including across the year boundary", () => {
    expect(addMonths(2026, 11, 1)).toEqual({ year: 2027, monthIndex: 0 });
    expect(addMonths(2026, 0, -1)).toEqual({ year: 2025, monthIndex: 11 });
    expect(addMonths(2026, 4, 0)).toEqual({ year: 2026, monthIndex: 4 });
  });
});

describe("getMonthMatrix", () => {
  it("returns exactly 4 aligned weeks for Feb 2026 (Sunday start, 28 days)", () => {
    const weeks = getMonthMatrix(2026, 1); // February — no leading/trailing spill
    expect(weeks).toHaveLength(4);
    expect(weeks[0][0].key).toBe("2026-02-01");
    expect(weeks[0][0].inMonth).toBe(true);
    expect(weeks[3][6].key).toBe("2026-02-28");
    expect(weeks[3][6].inMonth).toBe(true);
    expect(monthWindow(2026, 1)).toEqual({ startKey: "2026-02-01", endKey: "2026-02-28" });
    // every row is a full week
    for (const w of weeks) expect(w).toHaveLength(7);
  });

  it("returns 6 weeks for May 2026 and flags out-of-month leading/trailing days", () => {
    const weeks = getMonthMatrix(2026, 4); // May (May 1 is a Friday)
    expect(weeks).toHaveLength(6);
    expect(weeks[0][0].key).toBe("2026-04-26"); // grid starts on the prior Sunday
    expect(weeks[0][0].inMonth).toBe(false);
    expect(weeks[0][5].key).toBe("2026-05-01");
    expect(weeks[0][5].inMonth).toBe(true);
    expect(weeks[5][6].key).toBe("2026-06-06");
    const window = monthWindow(2026, 4);
    expect(window).toEqual({ startKey: "2026-04-26", endKey: "2026-06-06" });
  });
});

describe("windows", () => {
  it("computes week and agenda windows", () => {
    expect(weekWindow("2026-05-30")).toEqual({ startKey: "2026-05-24", endKey: "2026-05-30" });
    expect(agendaWindow("2026-05-30", 7)).toEqual({ startKey: "2026-05-30", endKey: "2026-06-05" });
  });

  it("viewWindow dispatches on view", () => {
    expect(viewWindow("week", "2026-05-30", "2026-05-30")).toEqual(weekWindow("2026-05-30"));
    expect(viewWindow("agenda", "2026-05-30", "2026-05-30")).toEqual(agendaWindow("2026-05-30", 42));
    expect(viewWindow("month", "2026-05-15", "2026-05-30")).toEqual(monthWindow(2026, 4));
    // falls back to today when cursor is missing
    expect(viewWindow("month", null, "2026-05-30")).toEqual(monthWindow(2026, 4));
  });

  it("isWithin respects inclusive bounds", () => {
    expect(isWithin("2026-05-10", "2026-05-01", "2026-05-31")).toBe(true);
    expect(isWithin("2026-05-01", "2026-05-01", "2026-05-31")).toBe(true);
    expect(isWithin("2026-06-01", "2026-05-01", "2026-05-31")).toBe(false);
  });
});

describe("event grouping / filtering", () => {
  const events = [
    { id: "a", source: "labor", date: "2026-05-10", title: "Bravo" },
    { id: "b", source: "review", date: "2026-05-10", title: "Alpha" },
    { id: "c", source: "inventory", date: "2026-05-09", title: "Charlie" },
  ];

  it("sorts by date, then time, then title", () => {
    const sorted = [...events].sort(compareEvents).map((e) => e.id);
    expect(sorted).toEqual(["c", "b", "a"]); // 05-09 first; on 05-10 Alpha before Bravo
  });

  it("sorts all-day (untimed) events before timed ones within the same day", () => {
    const timed = { id: "t", source: "x", date: "2026-05-10", time: "09:00", title: "A" };
    const allDay = { id: "d", source: "x", date: "2026-05-10", title: "Z" };
    expect([timed, allDay].sort(compareEvents).map((e) => e.id)).toEqual(["d", "t"]);
  });

  it("groups by day with per-day sort", () => {
    const map = groupByDay(events);
    expect([...map.keys()].sort()).toEqual(["2026-05-09", "2026-05-10"]);
    expect(map.get("2026-05-10").map((e) => e.id)).toEqual(["b", "a"]);
  });

  it("filters by active sources and counts per source", () => {
    expect(filterByActiveSources(events, new Set(["labor"])).map((e) => e.id)).toEqual(["a"]);
    expect(filterByActiveSources(events, null)).toHaveLength(3);
    expect(countBySource(events)).toEqual({ labor: 1, review: 1, inventory: 1 });
  });
});

describe("rangeLabel", () => {
  it("collapses shared month and year", () => {
    expect(rangeLabel("2026-05-03", "2026-05-09")).toBe("May 3 – 9, 2026");
    expect(rangeLabel("2026-04-26", "2026-05-02")).toBe("Apr 26 – May 2, 2026");
    expect(rangeLabel("2026-12-28", "2027-01-03")).toBe("Dec 28, 2026 – Jan 3, 2027");
  });
});

describe("source normalizers", () => {
  const today = "2026-05-30";
  const win = { startKey: "2026-05-01", endKey: "2026-05-31" };

  it("labor: emits start + distinct first-shift inside the window only", () => {
    const employees = [
      { id: "e1", full_name: "Alex Vance", position_title: "CSR", start_date: "2026-05-12", first_shift_date: "2026-05-14" },
      { id: "e2", full_name: "Same Day", position_title: "PCT", start_date: "2026-05-20", first_shift_date: "2026-05-20" },
      { id: "e3", full_name: "Out Of Range", position_title: "PCT", start_date: "2026-07-01" },
    ];
    const out = normalizeLaborStarts(employees, { window: win, today });
    const ids = out.map((e) => e.id);
    expect(ids).toContain("labor-start-e1");
    expect(ids).toContain("labor-shift-e1"); // distinct first shift
    expect(ids).toContain("labor-start-e2");
    expect(ids).not.toContain("labor-shift-e2"); // same day -> no duplicate
    expect(ids).not.toContain("labor-start-e3"); // out of window
    expect(out.every((e) => e.source === "labor")).toBe(true);
  });

  it("reviews: only 30/60/90 cycles, names from the employee map, overdue/done tone", () => {
    const empMap = new Map([["e1", { full_name: "Alex Vance" }]]);
    const instances = [
      { id: "r1", labor_employee_id: "e1", review_cycle: "30_day", due_date: "2026-05-10", status: "scheduled" },
      { id: "r2", labor_employee_id: "e1", review_cycle: "90_day", due_date: "2026-06-15", status: "completed" },
      { id: "r3", labor_employee_id: "e1", review_cycle: "ad_hoc", due_date: "2026-05-12", status: "scheduled" },
      { id: "r4", labor_employee_id: "e1", review_cycle: "60_day", due_date: null, status: "scheduled" },
    ];
    const out = normalizeReviews(instances, empMap, { today });
    expect(out.map((e) => e.id)).toEqual(["review-r1", "review-r2"]); // ad_hoc + null-due dropped
    expect(out[0].title).toBe("Alex Vance · 30-Day review");
    expect(out[0].tone).toBe("overdue"); // due 05-10 < today 05-30
    expect(out[1].tone).toBe("done"); // completed
    expect(out[1].subtitle).toBe("Completed");
  });

  it("training: excludes completed, surfaces progress and overdue tone", () => {
    const records = [
      { id: "t1", employee_full_name: "Pat Lee", target_role: "PCT", target_end_date: "2026-05-15", overall_status: "in_progress", progress_percent: 40 },
      { id: "t2", employee_full_name: "Done Deal", target_role: "CSR", target_end_date: "2026-05-20", overall_status: "completed", progress_percent: 100 },
      { id: "t3", employee_full_name: "Future", target_role: "PCT", target_end_date: "2026-06-30", overall_status: "not_started", progress_percent: 0 },
    ];
    const out = normalizeTraining(records, { today });
    expect(out.map((e) => e.id)).toEqual(["training-t1", "training-t3"]);
    expect(out[0].subtitle).toBe("PCT · 40%");
    expect(out[0].tone).toBe("overdue");
    expect(out[1].subtitle).toBe("PCT"); // 0% -> no percent suffix
    expect(out[1].tone).toBe("default");
  });

  it("marketing: events and follow-ups both map under the marketing source", () => {
    const events = [{ id: "g1", title: "Yappy Hour", event_type: "community_event", venue_name: "Dog Park", event_date: "2026-05-18" }];
    const targets = [
      { id: "tg1", name: "Acme Apartments", category: "apartments", status: "outreach", next_contact_date: "2026-05-12" },
      { id: "tg2", name: "", organizer: "Jane Doe", category: "corporate_partnerships", next_contact_date: "2026-05-25" },
    ];
    const evOut = normalizeMarketingEvents(events);
    const flOut = normalizeMarketingFollowups(targets, { today });
    expect(evOut[0]).toMatchObject({ source: "marketing", kind: "event", title: "Yappy Hour", subtitle: "Dog Park" });
    expect(flOut[0]).toMatchObject({ source: "marketing", kind: "follow_up", title: "Follow up · Acme Apartments", subtitle: "Apartments", tone: "overdue" });
    expect(flOut[1].title).toBe("Follow up · Jane Doe"); // falls back to organizer when name blank
  });

  it("enrichment: maps events with subtitle fallback to category", () => {
    const out = normalizeEnrichment([
      { id: "x1", title: "Bubble Day", subtitle: "Splash zone", category: "Weekly Theme", status: "planned", event_date: "2026-05-22" },
      { id: "x2", title: "Scent Work", category: "brainwork", event_date: "2026-05-24" },
    ]);
    expect(out[0]).toMatchObject({ source: "enrichment", title: "Bubble Day", subtitle: "Splash zone" });
    expect(out[1].subtitle).toBe("brainwork");
  });
});

describe("buildInventoryDueEvents", () => {
  it("materializes weekly occurrences inside the window from a fixed anchor", () => {
    const schedule = { cadenceDays: 7, dueWeekday: 1, dueTime: "09:00", anchorDate: "2026-05-04" };
    const out = buildInventoryDueEvents(schedule, {
      window: { startKey: "2026-05-01", endKey: "2026-05-31" },
      today: "2026-05-30",
    });
    expect(out.map((e) => e.date)).toEqual([
      "2026-05-04", "2026-05-11", "2026-05-18", "2026-05-25",
    ]);
    expect(out.every((e) => e.source === "inventory" && e.time === "09:00")).toBe(true);
    expect(out.find((e) => e.date === "2026-05-04").tone).toBe("overdue"); // before today
  });

  it("supports a biweekly cadence and snaps to the first in-window occurrence", () => {
    const schedule = { cadenceDays: 14, dueWeekday: 1, dueTime: "08:00", anchorDate: "2026-05-04" };
    const out = buildInventoryDueEvents(schedule, {
      window: { startKey: "2026-05-10", endKey: "2026-06-10" },
      today: "2026-05-30",
    });
    expect(out.map((e) => e.date)).toEqual(["2026-05-18", "2026-06-01"]);
  });

  it("returns nothing without a valid window", () => {
    expect(buildInventoryDueEvents({}, {})).toEqual([]);
  });
});

describe("aggregateEvents", () => {
  it("merges arrays and sorts chronologically; SOURCE_ORDER is stable", () => {
    const merged = aggregateEvents([
      [{ id: "a", source: "labor", date: "2026-05-20", title: "z" }],
      [{ id: "b", source: "review", date: "2026-05-05", title: "y" }],
      null,
      [{ id: "c", source: "inventory", date: "2026-05-05", title: "x" }],
    ]);
    expect(merged.map((e) => e.id)).toEqual(["c", "b", "a"]); // 05-05 by title (x<y), then 05-20
    expect(SOURCE_ORDER).toEqual(["labor", "review", "training", "marketing", "enrichment", "inventory"]);
  });
});
