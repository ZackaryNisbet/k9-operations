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
import { SOURCE_ORDER, mapCalendarRows } from "../kol/pages/calendarSources";

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
    { id: "b", source: "compliance", date: "2026-05-10", title: "Alpha" },
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
    expect(countBySource(events)).toEqual({ labor: 1, compliance: 1, inventory: 1 });
  });
});

describe("rangeLabel", () => {
  it("collapses shared month and year", () => {
    expect(rangeLabel("2026-05-03", "2026-05-09")).toBe("May 3 – 9, 2026");
    expect(rangeLabel("2026-04-26", "2026-05-02")).toBe("Apr 26 – May 2, 2026");
    expect(rangeLabel("2026-12-28", "2027-01-03")).toBe("Dec 28, 2026 – Jan 3, 2027");
  });
});

describe("mapCalendarRows (get_calendar_events adapter)", () => {
  it("maps RPC rows into the event shape and normalizes the time", () => {
    const rows = [
      {
        source: "inventory",
        event_id: "inventory-2026-05-10",
        kind: "count_due",
        event_date: "2026-05-10",
        event_time: "19:00:00",
        title: "Inventory count due",
        subtitle: "Weekly count",
        status: null,
        tone: "overdue",
        ref_id: null,
      },
    ];
    expect(mapCalendarRows(rows)).toEqual([
      {
        id: "inventory-2026-05-10",
        source: "inventory",
        kind: "count_due",
        date: "2026-05-10",
        time: "19:00", // "19:00:00" -> "HH:MM"
        title: "Inventory count due",
        subtitle: "Weekly count",
        status: null,
        tone: "overdue",
        meta: { refId: null },
      },
    ]);
  });

  it("treats a null event_time as all-day and synthesizes an id when absent", () => {
    const [ev] = mapCalendarRows([
      { source: "labor", kind: "start", event_date: "2026-05-04", event_time: null, title: "Alex", subtitle: "Starts", ref_id: "emp-1" },
    ]);
    expect(ev.time).toBeUndefined();
    expect(ev.id).toBe("labor-emp-1"); // `${source}-${ref_id}` fallback
    expect(ev.tone).toBe("default"); // default tone when missing
    expect(ev.meta).toEqual({ refId: "emp-1" });
  });

  it("drops rows with an unknown source or an invalid date, and sorts the rest", () => {
    const out = mapCalendarRows([
      { source: "labor", event_id: "l1", event_date: "2026-05-20", title: "later" },
      { source: "bogus", event_id: "x", event_date: "2026-05-01", title: "drop me" },
      { source: "compliance", event_id: "r1", event_date: "not-a-date", title: "drop me too" },
      { source: "compliance", event_id: "r2", event_date: "2026-05-05", title: "earlier" },
      null,
    ]);
    expect(out.map((e) => e.id)).toEqual(["r2", "l1"]); // invalid rows removed; sorted by date
  });

  it("keeps SOURCE_ORDER stable for the filter pills", () => {
    expect(SOURCE_ORDER).toEqual(["labor", "compliance", "training", "marketing", "enrichment", "inventory"]);
  });
});
