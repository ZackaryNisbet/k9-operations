import { describe, expect, it } from "vitest";
import {
  buildClientIncidentMetrics,
  buildIncidentCaseCode,
  buildIncidentRateForPeriod,
  computeDogDaysLast30,
  countActiveDogsInRange,
  countIncidentsInRange,
  countOpenFollowUps,
  getIncidentFollowUpState,
  getIncidentReportingPeriodRange,
  RED_BINDER_FORM_LIBRARY,
} from "../kol/clientManagementData";

function dateKey(value) {
  if (!value) return null;
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

describe("clientManagementData", () => {
  it("computes dog-days across boarding and daycare reservations in the last 30 days", () => {
    const asOf = new Date("2026-04-14T12:00:00");
    const dogDays = computeDogDaysLast30([
      { type: "boarding", status: "checked-out", checkIn: "2026-04-10", checkOut: "2026-04-12" },
      { type: "daycare", status: "checked-out", checkIn: "2026-04-14", checkOut: "2026-04-14" },
      { type: "grooming", status: "checked-out", checkIn: "2026-04-14", checkOut: "2026-04-14" },
    ], asOf);

    expect(dogDays).toBe(4);
  });

  it("builds incident metrics against recent cases and dog-day exposure", () => {
    const asOf = new Date("2026-04-14T12:00:00");
    const metrics = buildClientIncidentMetrics({
      asOf,
      cases: [
        {
          id: "c1",
          status: "open",
          case_type: "serious_animal_event",
          metadata: { incident_category: "dog_death" },
          incident_date: "2026-04-10",
        },
        { id: "c2", status: "closed", case_type: "animal_incident", metadata: { incident_category: "dog_laceration" }, incident_date: "2026-03-20" },
        { id: "c3", status: "closed", case_type: "animal_incident", metadata: { incident_category: "loose_stool" }, incident_date: "2026-02-01" },
      ],
      documents: [{ id: "d1" }, { id: "d2" }],
      reservations: [
        { type: "boarding", status: "checked-out", checkIn: "2026-04-10", checkOut: "2026-04-12" },
        { type: "daycare", status: "checked-out", checkIn: "2026-04-14", checkOut: "2026-04-14" },
      ],
    });

    expect(metrics.totalCases).toBe(3);
    expect(metrics.openCaseCount).toBe(1);
    expect(metrics.caseCount30d).toBe(2);
    expect(metrics.criticalCaseCount30d).toBe(1);
    expect(metrics.documentationCount).toBe(2);
    expect(metrics.dogDays30).toBe(4);
    expect(metrics.incidentRatePer100DogDays).toBe(50);
  });

  it("builds stable Red Binder case codes and exposes all appendix forms", () => {
    expect(buildIncidentCaseCode({ id: "12345678-1234-1234-1234-1234567890ab", incident_date: "2026-04-14" })).toBe("RB-20260414-123456");
    expect(RED_BINDER_FORM_LIBRARY.map((template) => template.id)).toEqual([
      "vet_visit_form",
      "animal_incident_report",
      "serious_animal_event_report",
      "employee_injury_report",
      "gm_accident_investigation",
      "incident_investigation_report",
    ]);
  });
});

describe("incident rate by reporting period", () => {
  const asOf = new Date("2026-05-29T12:00:00"); // a Friday in Q2

  it("derives standard period boundaries (MTD/QTD/YTD/TTM/Last Full Year/All Time)", () => {
    const range = (id) => {
      const r = getIncidentReportingPeriodRange(id, asOf);
      return [dateKey(r.start), dateKey(r.end)];
    };
    expect(range("mtd")).toEqual(["2026-05-01", "2026-05-29"]);
    expect(range("qtd")).toEqual(["2026-04-01", "2026-05-29"]);
    expect(range("ytd")).toEqual(["2026-01-01", "2026-05-29"]);
    expect(range("ttm")).toEqual(["2025-05-29", "2026-05-29"]);
    expect(range("last_year")).toEqual(["2025-01-01", "2025-12-31"]);
    expect(range("all")).toEqual([null, null]);
  });

  it("counts unique active dogs whose stay overlaps a window, ignoring tours/grooming/cancelled", () => {
    const reservations = [
      { dogId: "A", type: "boarding", status: "checked-out", checkIn: "2026-05-10", checkOut: "2026-05-12" },
      { dogId: "A", type: "daycare", status: "checked-out", checkIn: "2026-05-20", checkOut: "2026-05-20" }, // same dog → dedup
      { dogId: "B", type: "daycare", status: "checked-out", checkIn: "2026-04-15", checkOut: "2026-04-15" },
      { dogId: "C", type: "grooming", status: "checked-out", checkIn: "2026-05-15", checkOut: "2026-05-15" }, // excluded type
      { dogId: "D", type: "boarding", status: "cancelled", checkIn: "2026-05-15", checkOut: "2026-05-16" }, // excluded status
      { dogId: "E", type: "daycare", status: "checked-out", checkIn: "2025-08-01", checkOut: "2025-08-01" },
    ];
    const active = (id) => {
      const r = getIncidentReportingPeriodRange(id, asOf);
      return countActiveDogsInRange(reservations, r.start, r.end);
    };
    expect(active("mtd")).toBe(1); // A only
    expect(active("qtd")).toBe(2); // A, B
    expect(active("ytd")).toBe(2); // A, B
    expect(active("ttm")).toBe(3); // A, B, E
    expect(active("last_year")).toBe(1); // E (Aug 2025)
    expect(active("all")).toBe(3); // A, B, E (C, D excluded)
  });

  it("counts incidents whose incident_date falls inside the window", () => {
    const cases = [
      { incident_date: "2026-05-15" },
      { incident_date: "2026-04-20" },
      { incident_date: "2026-02-01" },
      { incident_date: "2025-08-01" },
      { incident_date: "2024-06-01" },
    ];
    const within = (id) => {
      const r = getIncidentReportingPeriodRange(id, asOf);
      return countIncidentsInRange(cases, r.start, r.end);
    };
    expect(within("mtd")).toBe(1);
    expect(within("qtd")).toBe(2);
    expect(within("ytd")).toBe(3);
    expect(within("ttm")).toBe(4);
    expect(within("last_year")).toBe(1);
    expect(within("all")).toBe(5);
  });

  it("computes incidents ÷ active dogs and normalizes per 1,000", () => {
    const cases = [{ incident_date: "2026-03-01" }, { incident_date: "2026-04-01" }];
    const reservations = [
      { dogId: "1", type: "daycare", status: "checked-out", checkIn: "2026-02-10", checkOut: "2026-02-10" },
      { dogId: "2", type: "daycare", status: "checked-out", checkIn: "2026-02-11", checkOut: "2026-02-11" },
      { dogId: "3", type: "boarding", status: "checked-out", checkIn: "2026-03-01", checkOut: "2026-03-03" },
      { dogId: "4", type: "daycare", status: "checked-out", checkIn: "2026-04-02", checkOut: "2026-04-02" },
    ];
    const rate = buildIncidentRateForPeriod({ cases, reservations, periodId: "ytd", asOf });
    expect(rate.incidents).toBe(2);
    expect(rate.activeDogs).toBe(4);
    expect(rate.ratePerDog).toBeCloseTo(0.5, 10);
    expect(rate.ratePer1000).toBeCloseTo(500, 10);
    expect(rate.ratePercent).toBeCloseTo(50, 10);
  });

  it("returns a null rate (not divide-by-zero) when no dogs were active", () => {
    const rate = buildIncidentRateForPeriod({ cases: [{ incident_date: "2026-03-01" }], reservations: [], periodId: "ytd", asOf });
    expect(rate.activeDogs).toBe(0);
    expect(rate.incidents).toBe(1);
    expect(rate.ratePerDog).toBeNull();
    expect(rate.ratePer1000).toBeNull();
  });
});

describe("incident follow-ups", () => {
  const asOf = new Date("2026-05-29T09:00:00"); // a Friday

  it("reports no follow-up when follow_up_at is absent or blank", () => {
    expect(getIncidentFollowUpState({}, asOf)).toMatchObject({ has: false, tone: "none" });
    expect(getIncidentFollowUpState({ follow_up_at: "" }, asOf).has).toBe(false);
    expect(getIncidentFollowUpState({ follow_up_at: null }, asOf).has).toBe(false);
  });

  it("classifies overdue, due-today, and upcoming follow-ups by date only", () => {
    expect(getIncidentFollowUpState({ follow_up_at: "2026-05-28" }, asOf))
      .toMatchObject({ has: true, tone: "overdue", overdue: true, dueToday: false, upcoming: false });
    expect(getIncidentFollowUpState({ follow_up_at: "2026-05-29" }, asOf))
      .toMatchObject({ has: true, tone: "today", overdue: false, dueToday: true, upcoming: false });
    expect(getIncidentFollowUpState({ follow_up_at: "2026-06-05" }, asOf))
      .toMatchObject({ has: true, tone: "upcoming", overdue: false, dueToday: false, upcoming: true });
  });

  it("treats a completed follow-up as done regardless of its due date", () => {
    const state = getIncidentFollowUpState(
      { follow_up_at: "2026-05-20", follow_up_completed_at: "2026-05-21T14:00:00Z" },
      asOf,
    );
    expect(state).toMatchObject({ has: true, tone: "done", completed: true, overdue: false, dueToday: false });
  });

  it("counts only actionable (incomplete, due today or earlier) follow-ups", () => {
    const cases = [
      { follow_up_at: "2026-05-28" }, // overdue → counts
      { follow_up_at: "2026-05-29" }, // due today → counts
      { follow_up_at: "2026-06-10" }, // upcoming → excluded
      { follow_up_at: "2026-05-01", follow_up_completed_at: "2026-05-02T00:00:00Z" }, // done → excluded
      {}, // no follow-up → excluded
    ];
    expect(countOpenFollowUps(cases, asOf)).toBe(2);
  });
});
