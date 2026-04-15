import { describe, expect, it } from "vitest";
import {
  buildAttendanceActivityFeed,
  planLegacyAttendanceImport,
  summarizeAttendanceIncidents,
} from "../kol/attendanceData";

describe("attendanceData helpers", () => {
  it("summarizes active-employee attendance counts for all time and last 30 days", () => {
    const laborEmployees = [
      { id: "emp-1", full_name: "Alex Smith", position_title: "CSR", start_date: "2026-01-01", end_date: null },
      { id: "emp-2", full_name: "Taylor Reed", position_title: "PCT", start_date: "2026-01-15", end_date: null },
      { id: "emp-3", full_name: "Former Employee", position_title: "CSR", start_date: "2025-01-01", end_date: "2026-01-20" },
    ];
    const incidents = [
      { id: "i-1", labor_employee_id: "emp-1", incident_type: "tardy", incident_date: "2026-04-10" },
      { id: "i-2", labor_employee_id: "emp-1", incident_type: "tardy", incident_date: "2026-02-01" },
      { id: "i-3", labor_employee_id: "emp-2", incident_type: "no_call_no_show", incident_date: "2026-04-05" },
      { id: "i-4", labor_employee_id: "emp-3", incident_type: "early_release", incident_date: "2026-04-08" },
    ];

    const summary = summarizeAttendanceIncidents({
      laborEmployees,
      incidents,
      asOf: new Date("2026-04-14T12:00:00Z"),
    });

    expect(summary.rows).toHaveLength(2);
    expect(summary.rows[0].full_name).toBe("Alex Smith");
    expect(summary.rows[0].byType.tardy).toEqual({ label: "Tardy", allTime: 2, last30: 1 });
    expect(summary.rows[1].byType.no_call_no_show).toEqual({
      label: "No Call / No Show",
      allTime: 1,
      last30: 1,
    });
    expect(summary.totals.totalAll).toBe(3);
    expect(summary.totals.total30).toBe(2);
    expect(summary.totals.byType.tardy).toEqual({ allTime: 2, last30: 1 });
  });

  it("builds a combined activity feed sorted newest-first", () => {
    const feed = buildAttendanceActivityFeed({
      incidents: [
        {
          id: "incident-1",
          labor_employee_id: "emp-1",
          incident_type: "tardy",
          incident_date: "2026-04-10",
          created_at: "2026-04-10T09:00:00Z",
          created_by_name: "Manager One",
        },
      ],
      policyActions: [
        {
          id: "action-1",
          labor_employee_id: "emp-1",
          action_type: "written_warning",
          action_date: "2026-04-12",
          created_at: "2026-04-12T12:00:00Z",
          created_by_name: "Manager Two",
        },
      ],
      employeeMap: {
        "emp-1": { full_name: "Alex Smith" },
      },
    });

    expect(feed.map((entry) => entry.id)).toEqual(["action:action-1", "mark:incident-1"]);
    expect(feed[0].typeLabel).toBe("Written Warning");
    expect(feed[1].kind).toBe("mark");
    expect(feed[1].typeLabel).toBe("Tardy");
  });

  it("plans legacy attendance import with name matching, creates, skips, and unmatched rows", () => {
    const plan = planLegacyAttendanceImport({
      legacyRoster: [
        { id: "r-1", name: "Alex Smith", title: "CSR", startDate: "2026-02-01" },
        { id: "r-2", name: "Jordan Lee", title: "PCT", startDate: "2026-03-10" },
      ],
      legacyEntries: [
        { id: "e-1", name: "Alex Smith", type: "Tardy", date: "2026-04-10", coverage: "No", notes: "Late by 12 minutes" },
        { id: "e-2", name: "Jordan Lee", type: "Call Out (2+ hrs)", date: "2026-04-11", coverage: "Yes", notes: "" },
        { id: "e-3", name: "Unknown Person", type: "Tardy", date: "2026-04-11" },
        { id: "e-4", name: "Alex Smith", type: "Unknown Type", date: "2026-04-11" },
        { id: "e-5", name: "Alex Smith", type: "Tardy", date: "2026-04-12" },
      ],
      laborEmployees: [
        { id: "emp-1", full_name: "Alex Smith" },
      ],
      importedLegacyEntryIds: ["e-5"],
      fallbackStartDate: "2026-04-14",
    });

    expect(plan.employeeCreates).toEqual([
      {
        tempKey: "legacy-create-1",
        fullName: "Jordan Lee",
        positionTitle: "PCT",
        startDate: "2026-03-10",
        endDate: null,
      },
    ]);
    expect(plan.incidentCreates).toHaveLength(2);
    expect(plan.incidentCreates[0]).toMatchObject({
      legacyId: "e-1",
      laborEmployeeId: "emp-1",
      laborEmployeeTempKey: null,
      incidentType: "tardy",
      coverageSecured: false,
    });
    expect(plan.incidentCreates[1]).toMatchObject({
      legacyId: "e-2",
      laborEmployeeId: null,
      laborEmployeeTempKey: "legacy-create-1",
      incidentType: "call_out_2_plus_hours",
      coverageSecured: true,
    });
    expect(plan.unmatchedEntries).toEqual([
      { id: "e-3", name: "Unknown Person", type: "Tardy", reason: "employee_not_found" },
      { id: "e-4", name: "Alex Smith", type: "Unknown Type", reason: "incident_type_not_mapped" },
    ]);
    expect(plan.skippedEntries).toEqual(["e-5"]);
  });
});
