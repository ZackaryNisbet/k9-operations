import { describe, expect, it } from "vitest";
import {
  buildClientIncidentMetrics,
  buildIncidentCaseCode,
  computeDogDaysLast30,
  RED_BINDER_FORM_LIBRARY,
} from "../kol/clientManagementData";

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
        { id: "c1", status: "open", severity: "critical", incident_date: "2026-04-10" },
        { id: "c2", status: "closed", severity: "standard", incident_date: "2026-03-20" },
        { id: "c3", status: "closed", severity: "standard", incident_date: "2026-02-01" },
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
