import { describe, expect, it } from "vitest";
import {
  buildEnterpriseAttendanceRows,
  buildPerformanceComplianceRows,
  getEnterpriseDateRange,
  inferVendorTrade,
} from "../kol/enterprise/enterpriseAggregation";

describe("enterpriseAggregation", () => {
  it("builds week/month/quarter/year date ranges for enterprise selectors", () => {
    expect(getEnterpriseDateRange("today", "", "", "2026-05-17")).toEqual({ startDate: "2026-05-17", endDate: "2026-05-17" });
    expect(getEnterpriseDateRange("wtd", "", "", "2026-05-17")).toEqual({ startDate: "2026-05-11", endDate: "2026-05-17" });
    expect(getEnterpriseDateRange("mtd", "", "", "2026-05-17")).toEqual({ startDate: "2026-05-01", endDate: "2026-05-17" });
    expect(getEnterpriseDateRange("qtd", "", "", "2026-05-17")).toEqual({ startDate: "2026-04-01", endDate: "2026-05-17" });
    expect(getEnterpriseDateRange("ytd", "", "", "2026-05-17")).toEqual({ startDate: "2026-01-01", endDate: "2026-05-17" });
  });

  it("rolls attendance summary rows up by resort instead of employee", () => {
    const locations = [{ id: "loc-1", name: "Adair Forsythe" }, { id: "loc-2", name: "Jordan Ramsey" }];
    const laborEmployees = [
      { id: "emp-1", location_id: "loc-1", full_name: "Alex Vance" },
      { id: "emp-2", location_id: "loc-1", full_name: "Jordan Lee", end_date: "2026-01-01" },
      { id: "emp-3", location_id: "loc-2", full_name: "Taylor Chen" },
    ];
    const incidents = [
      { id: "inc-1", labor_employee_id: "emp-1", incident_type: "tardy", incident_date: "2026-05-17" },
      { id: "inc-2", labor_employee_id: "emp-2", incident_type: "no_call_no_show", incident_date: "2026-05-17" },
      { id: "inc-3", labor_employee_id: "emp-3", incident_type: "call_out_2_plus_hours", incident_date: "2026-05-17" },
    ];

    const summary = buildEnterpriseAttendanceRows({ locations, laborEmployees, incidents });

    expect(summary.rows).toHaveLength(2);
    expect(summary.rows[0]).toMatchObject({
      locationName: "Adair Forsythe",
      activeEmployees: 1,
      totalAll: 1,
    });
    expect(summary.rows[0].byType.tardy.allTime).toBe(1);
    expect(summary.rows[0].byType.no_call_no_show.allTime).toBe(0);
    expect(summary.totals.totalAll).toBe(2);
  });

  it("treats no performance reviews as zero completed over active employees", () => {
    const result = buildPerformanceComplianceRows({
      locations: [{ id: "loc-1", name: "Adair Forsythe" }],
      laborEmployees: [
        { id: "emp-1", location_id: "loc-1", full_name: "Alex Vance" },
        { id: "emp-2", location_id: "loc-1", full_name: "Taylor Chen" },
      ],
      todayValue: "2026-05-17",
    });

    expect(result.rows[0]).toMatchObject({
      activeEmployees: 2,
      compliantEmployees: 0,
      completedEmployees: 0,
      compliancePct: 0,
      needsSetupEmployees: 2,
    });
    expect(result.totals.compliancePct).toBe(0);
  });

  it("uses roster snapshot review statuses when counting overdue employees", () => {
    const result = buildPerformanceComplianceRows({
      locations: [{ id: "loc-1", name: "Adair Forsythe" }],
      laborEmployees: [
        {
          id: "emp-1",
          location_id: "loc-1",
          full_name: "Alex Vance",
          employment_status: "active",
          review_30_due_date: "2026-04-01",
          review_30_status: "overdue",
        },
        {
          id: "emp-2",
          location_id: "loc-1",
          full_name: "Taylor Chen",
          employment_status: "active",
          review_30_due_date: "2026-06-01",
          review_30_status: "scheduled",
        },
      ],
      todayValue: "2026-05-17",
    });

    expect(result.rows[0]).toMatchObject({
      activeEmployees: 2,
      compliantEmployees: 1,
      overdueEmployees: 1,
      compliancePct: 50,
    });
    expect(result.totals.overdueEmployees).toBe(1);
  });

  it("infers vendor trade filters from metadata or searchable vendor text", () => {
    expect(inferVendorTrade({ metadata: { trade: "Handyman" } })).toMatchObject({ key: "handyman", label: "Handyman" });
    expect(inferVendorTrade({ business_name: "ABC Heating and Cooling" })).toMatchObject({ key: "hvac", label: "HVAC" });
  });
});
