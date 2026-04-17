import { describe, expect, it } from "vitest";
import {
  buildCreateLaborEmployeeRpcArgs,
  buildLaborEmployeeContactCard,
  buildLaborEmployeeContactCardFile,
  buildLaborEmployeeContactCardFilename,
  buildLaborDashboardMetrics,
  buildCreateTrainingRecordRpcArgs,
  buildUpdateLaborEmployeeRpcArgs,
  buildTrainingTemplateScopeClause,
  groupLaborEmployeeNotes,
  resolveTrainingLocationId,
  summarizeTrainingWorkflow,
} from "../kol/trainingData";

function createMockSupabase({
  locationRow = null,
  profileLocationRow = null,
}) {
  return {
    from(table) {
      return {
        select() {
          return {
            eq(column, value) {
              return {
                limit() {
                  return {
                    maybeSingle: async () => {
                      if (table === "locations" && column === "slug") {
                        return { data: value ? locationRow : null };
                      }
                      if (table === "profile_locations" && column === "profile_id") {
                        return { data: value ? profileLocationRow : null };
                      }
                      return { data: null };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

describe("trainingData helpers", () => {
  it("builds the template scope clause with global plus location rows", () => {
    expect(buildTrainingTemplateScopeClause("1234")).toBe("location_id.is.null,location_id.eq.1234");
    expect(buildTrainingTemplateScopeClause(null)).toBe("location_id.is.null");
  });

  it("builds trimmed RPC args for training record creation", () => {
    expect(
      buildCreateTrainingRecordRpcArgs({
        templateId: "template-1",
        locationRef: "cherry-hill",
        employeeFullName: "  Jane Smith  ",
        targetRole: "  PCT ",
        assignedTrainerName: "  Alex  ",
        actorUserId: "mock-user",
        actorName: "  Zack  ",
      })
    ).toEqual({
      p_template_id: "template-1",
      p_location_ref: "cherry-hill",
      p_employee_full_name: "Jane Smith",
      p_target_role: "PCT",
      p_hire_date: null,
      p_training_start_date: null,
      p_target_end_date: null,
      p_assigned_trainer_name: "Alex",
      p_assigned_manager_name: null,
      p_actor_user_id: null,
      p_actor_name: "Zack",
      p_labor_employee_id: null,
    });
  });

  it("builds trimmed RPC args for labor employee creation", () => {
    expect(
      buildCreateLaborEmployeeRpcArgs({
        locationRef: "cherry-hill",
        fullName: "  Zackary Nisbet  ",
        positionTitle: "  Director of Resorts ",
        startDate: "2026-02-16",
        actorUserId: "mock-user",
        actorName: "  Zack  ",
      })
    ).toEqual({
      p_location_ref: "cherry-hill",
      p_full_name: "Zackary Nisbet",
      p_position_title: "Director of Resorts",
      p_start_date: "2026-02-16",
      p_end_date: null,
      p_linked_user_id: null,
      p_actor_user_id: null,
      p_actor_name: "Zack",
    });
  });

  it("builds simplified labor employee update args with end-date clearing support", () => {
    expect(
      buildUpdateLaborEmployeeRpcArgs({
        employeeId: "employee-1",
        fullName: "  Jane Smith ",
        positionTitle: "  CSR ",
        startDate: "2026-02-16",
        endDate: null,
        actorUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      })
    ).toEqual({
      p_employee_id: "employee-1",
      p_full_name: "Jane Smith",
      p_position_title: "CSR",
      p_start_date: "2026-02-16",
      p_end_date: null,
      p_end_date_provided: true,
      p_linked_user_id: null,
      p_actor_user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
  });

  it("returns UUID location refs unchanged", async () => {
    const uuid = "8ea382b0-63f7-44ac-b6f8-83243c03d946";
    await expect(resolveTrainingLocationId(createMockSupabase({}), uuid, null)).resolves.toBe(uuid);
  });

  it("resolves location slugs through the locations table", async () => {
    const client = createMockSupabase({
      locationRow: { id: "8ea382b0-63f7-44ac-b6f8-83243c03d946" },
    });

    await expect(resolveTrainingLocationId(client, "cherry-hill", null)).resolves.toBe(
      "8ea382b0-63f7-44ac-b6f8-83243c03d946"
    );
  });

  it("falls back to the actor's profile location when slug lookup misses", async () => {
    const client = createMockSupabase({
      profileLocationRow: { location_id: "8ea382b0-63f7-44ac-b6f8-83243c03d946" },
    });

    await expect(resolveTrainingLocationId(client, "unknown-location", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).resolves.toBe(
      "8ea382b0-63f7-44ac-b6f8-83243c03d946"
    );
  });

  it("ignores non-UUID actor ids during fallback location resolution", async () => {
    const client = createMockSupabase({
      profileLocationRow: { location_id: "8ea382b0-63f7-44ac-b6f8-83243c03d946" },
    });

    await expect(resolveTrainingLocationId(client, "unknown-location", "mock-user")).resolves.toBe(null);
  });

  it("summarizes active training records before template availability", () => {
    expect(
      summarizeTrainingWorkflow({
        templates: [{ id: "t1", template_class: "training_plan" }],
        versions: [{ id: "v1", template_id: "t1" }],
        records: [{ id: "r1", overall_status: "in_progress" }, { id: "r2", overall_status: "needs_follow_up" }],
      })
    ).toEqual({
      status: "in_progress",
      progress: 0,
      countLabel: "2 active records",
    });
  });

  it("reports template availability when no active records exist", () => {
    expect(
      summarizeTrainingWorkflow({
        templates: [
          { id: "t1", template_class: "training_plan" },
          { id: "t2", template_class: "written_certification" },
        ],
        versions: [{ id: "v1", template_id: "t1" }],
        records: [],
      })
    ).toEqual({
      status: "not_started",
      progress: 0,
      countLabel: "1 template available",
    });
  });

  it("groups labor employee notes by employee id", () => {
    expect(
      groupLaborEmployeeNotes([
        { id: "n1", labor_employee_id: "e1" },
        { id: "n2", labor_employee_id: "e1" },
        { id: "n2-deleted", labor_employee_id: "e1", deleted_at: "2026-04-17T12:00:00Z" },
        { id: "n3", labor_employee_id: "e2" },
      ])
    ).toEqual({
      e1: [
        { id: "n1", labor_employee_id: "e1" },
        { id: "n2", labor_employee_id: "e1" },
      ],
      e2: [{ id: "n3", labor_employee_id: "e2" }],
    });
  });

  it("builds an importable labor employee contact card with phone, email, title, and location", () => {
    const card = buildLaborEmployeeContactCard({
      id: "employee-1",
      full_name: "Amber Teefy",
      position_title: "Pet Care Technician",
      start_date: "2026-04-01",
      metadata: {
        contact_phone: "(555) 123-4567",
        contact_email: "amber@example.com",
      },
      manager_note: "discipline details should not export",
    }, {
      locationName: "Cherry Hill",
      generatedAt: "2026-04-16T12:30:00Z",
    });

    expect(card).toContain("BEGIN:VCARD");
    expect(card).toContain("VERSION:3.0");
    expect(card).toContain("N:Teefy;Amber;;;");
    expect(card).toContain("FN:Amber Teefy");
    expect(card).toContain("TITLE:Pet Care Technician - Cherry Hill");
    expect(card).toContain("ORG:Pet Care Technician - Cherry Hill");
    expect(card).toContain("TEL;TYPE=CELL,VOICE:+15551234567");
    expect(card).toContain("EMAIL;TYPE=INTERNET:amber@example.com");
    expect(card).toContain("NOTE:Start date: 2026-04-01");
    expect(card).not.toContain("K9 Operations labor contact");
    expect(card).not.toContain("Status: Active");
    expect(card).toContain("REV:20260416T123000Z");
    expect(card).not.toContain("discipline");
  });

  it("builds a bulk active employee contact-card file and a safe filename", () => {
    const file = buildLaborEmployeeContactCardFile([
      { id: "e1", full_name: "Jane Smith", position_title: "CSR" },
      { id: "e2", full_name: "Pat Lee", position_title: "Manager", end_date: "2026-04-01" },
    ], {
      locationName: "Cherry Hill",
      generatedAt: "2026-04-16T12:30:00Z",
    });

    expect((file.match(/BEGIN:VCARD/g) || []).length).toBe(2);
    expect(file).toContain("FN:Jane Smith");
    expect(file).toContain("FN:Pat Lee");
    expect(file).not.toContain("Status: Inactive");
    expect(buildLaborEmployeeContactCardFilename({}, { locationName: "Cherry Hill", bulk: true })).toBe("cherry-hill-active-employee-contacts.vcf");
  });

  it("builds labor dashboard metrics using active employee and compliance rules", () => {
    const metrics = buildLaborDashboardMetrics({
      rosterSnapshot: [
        {
          labor_employee_id: "e1",
          start_date: "2026-04-01",
          end_date: null,
          open_training_record_count: 0,
          completed_training_record_count: 1,
        },
        {
          labor_employee_id: "e2",
          start_date: "2026-03-01",
          end_date: null,
          open_training_record_count: 1,
          completed_training_record_count: 0,
        },
        {
          labor_employee_id: "e3",
          start_date: "2026-01-01",
          end_date: "2026-04-10",
          open_training_record_count: 0,
          completed_training_record_count: 1,
        },
      ],
      employeeNotes: [
        { id: "n1", created_at: new Date().toISOString() },
        { id: "n2", created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString() },
      ],
      attendanceIncidents: [
        { id: "a1", labor_employee_id: "e1", incident_date: new Date().toISOString().slice(0, 10) },
        { id: "a2", labor_employee_id: "e3", incident_date: new Date().toISOString().slice(0, 10) },
        { id: "a3", labor_employee_id: "e1", incident_date: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) },
      ],
    });

    expect(metrics.activeEmployeeCount).toBe(2);
    expect(metrics.employeeNoteCount30d).toBe(2);
    expect(metrics.attendanceMarkCount30d).toBe(1);
    expect(metrics.terminationCount30d).toBe(1);
    expect(metrics.activeTraineeCount).toBe(1);
    expect(metrics.trainingComplianceNumerator).toBe(1);
    expect(metrics.trainingComplianceDenominator).toBe(2);
    expect(metrics.trainingComplianceScore).toBe(50);
  });
});
