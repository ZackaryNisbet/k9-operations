import { describe, expect, it } from "vitest";
import {
  buildCreateLaborEmployeeRpcArgs,
  buildLaborEmployeeContactCard,
  buildLaborEmployeeContactCardFile,
  buildLaborEmployeeContactCardFilename,
  buildLaborEmailRecipient,
  buildLaborEmailRecipientList,
  buildLaborEmployeeShirtSizeHistoryEvent,
  buildLaborDashboardMetrics,
  buildLaborRosterStaffingSummary,
  buildCreateTrainingRecordRpcArgs,
  CSR_READINESS_TEMPLATE_SLUG,
  buildPctReadinessCellUpdateArgs,
  buildPctReadinessCategoryHotspots,
  buildPctReadinessEmployeeOptions,
  getLaborEmploymentCommitmentLabel,
  getLaborRosterPositionGroup,
  getLaborShirtSizeLabel,
  getPctReadinessStatusPresentation,
  getTeamReadinessTemplateOption,
  hasActivePctReadinessRecord,
  isTeamReadinessRecord,
  matchPctReadinessEmployeeByName,
  buildUpdateLaborEmployeeRpcArgs,
  buildTrainingTemplateScopeClause,
  classifyPctReadinessVerifierValue,
  groupLaborEmployeeNotes,
  normalizePctReadinessStatus,
  normalizePctReadinessText,
  normalizePctWorkbookStatus,
  normalizeLaborEmploymentCommitment,
  normalizeLaborShirtSize,
  PCT_READINESS_TEMPLATE_SLUG,
  readLaborEmployeeShirtSize,
  reconcilePctReadinessLegacyActorName,
  resolveTrainingLocationId,
  summarizeTrainingWorkflow,
  TEAM_READINESS_TEMPLATE_OPTIONS,
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
        employeeFullName: "  Jane Vance  ",
        targetRole: "  PCT ",
        assignedTrainerName: "  Alex  ",
        actorUserId: "mock-user",
        actorName: "  Skyler  ",
      })
    ).toEqual({
      p_template_id: "template-1",
      p_location_ref: "cherry-hill",
      p_employee_full_name: "Jane Vance",
      p_target_role: "PCT",
      p_hire_date: null,
      p_training_start_date: null,
      p_target_end_date: null,
      p_assigned_trainer_name: "Alex",
      p_assigned_manager_name: null,
      p_actor_user_id: null,
      p_actor_name: "Skyler",
      p_labor_employee_id: null,
    });
  });

  it("builds trimmed RPC args for labor employee creation", () => {
    expect(
      buildCreateLaborEmployeeRpcArgs({
        locationRef: "cherry-hill",
        fullName: "  Skylerary Brooks  ",
        positionTitle: "  Director of Resorts ",
        startDate: "2026-02-16",
        employmentCommitment: "full-time",
        actorUserId: "mock-user",
        actorName: "  Skyler  ",
      })
    ).toEqual({
      p_location_ref: "cherry-hill",
      p_full_name: "Skylerary Brooks",
      p_position_title: "Director of Resorts",
      p_start_date: "2026-02-16",
      p_end_date: null,
      p_employment_commitment: "full_time",
      p_linked_user_id: null,
      p_actor_user_id: null,
      p_actor_name: "Skyler",
    });
  });

  it("builds simplified labor employee update args with end-date clearing support", () => {
    expect(
      buildUpdateLaborEmployeeRpcArgs({
        employeeId: "employee-1",
        fullName: "  Jane Vance ",
        positionTitle: "  CSR ",
        startDate: "2026-02-16",
        endDate: null,
        employmentCommitment: "pt",
        actorUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      })
    ).toEqual({
      p_employee_id: "employee-1",
      p_full_name: "Jane Vance",
      p_position_title: "CSR",
      p_start_date: "2026-02-16",
      p_end_date: null,
      p_end_date_provided: true,
      p_employment_commitment: "part_time",
      p_employment_commitment_provided: true,
      p_linked_user_id: null,
      p_actor_user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
  });

  it("normalizes labor employment commitment labels", () => {
    expect(normalizeLaborEmploymentCommitment("Full-Time")).toBe("full_time");
    expect(normalizeLaborEmploymentCommitment("part time")).toBe("part_time");
    expect(normalizeLaborEmploymentCommitment("contractor")).toBeNull();
    expect(getLaborEmploymentCommitmentLabel("full_time")).toBe("Full-Time");
    expect(getLaborEmploymentCommitmentLabel("part_time", { short: true })).toBe("PT");
    expect(getLaborEmploymentCommitmentLabel(null)).toBe("Unassigned");
  });

  it("normalizes PCT readiness task text and status labels", () => {
    expect(normalizePctReadinessText("  Verified / Qualified!! ")).toBe("verified qualified");
    expect(normalizePctReadinessStatus("Verified / Qualified")).toBe("verified");
    expect(normalizePctReadinessStatus("needs follow up")).toBe("needs_coaching");
    expect(getPctReadinessStatusPresentation("qualified")).toMatchObject({
      value: "verified",
      label: "Verified / Qualified",
      itemStatus: "complete",
    });
  });

  it("maps workbook checkbox and verifier values into readiness statuses", () => {
    expect(
      normalizePctWorkbookStatus({
        checkboxStatus: true,
        demonstratedBy: "Angelina D",
        verifierValue: "Zach C",
      })
    ).toMatchObject({
      readinessStatus: "verified",
      itemStatus: "complete",
      demonstratedBy: "Angelina D",
      verifiedBy: "Zach C",
      noteText: "",
    });

    expect(
      normalizePctWorkbookStatus({
        checkboxStatus: true,
        demonstratedBy: "Angelina D",
        verifierValue: "",
      })
    ).toMatchObject({
      readinessStatus: "demonstrated",
      itemStatus: "in_progress",
    });

    expect(
      normalizePctWorkbookStatus({
        checkboxStatus: false,
        demonstratedBy: "Angelina D",
        verifierValue: "",
      })
    ).toMatchObject({
      readinessStatus: "demonstrated",
      itemStatus: "in_progress",
    });

    expect(
      normalizePctWorkbookStatus({
        checkboxStatus: false,
        verifierValue: "moves too fast quality is not great",
      })
    ).toMatchObject({
      readinessStatus: "needs_coaching",
      itemStatus: "needs_coaching",
      noteText: "moves too fast quality is not great",
    });
  });

  it("classifies verifier names separately from coaching notes", () => {
    expect(classifyPctReadinessVerifierValue("Allison D.")).toEqual({ kind: "person", value: "Allison D." });
    expect(classifyPctReadinessVerifierValue("not making notes via walkie")).toEqual({
      kind: "note",
      value: "not making notes via walkie",
    });
  });

  it("builds PCT readiness cell update RPC args without client-provided trainer names", () => {
    expect(
      buildPctReadinessCellUpdateArgs({
        recordId: "record-1",
        templateItemId: "item-1",
        readinessStatus: "Verified / Qualified",
        demonstratedBy: " Allison D ",
        verifiedBy: " Zach C ",
        comment: "  Great now ",
        actorUserId: "not-a-uuid",
        actorName: " Skyler ",
      })
    ).toEqual({
      p_record_id: "record-1",
      p_template_item_id: "item-1",
      p_readiness_status: "verified",
      p_demonstrated_by: null,
      p_verified_by: null,
      p_comment: "Great now",
      p_actor_user_id: null,
      p_actor_name: "Skyler",
    });
  });

  it("normalizes category gap hotspots by category size", () => {
    const sections = [
      { id: "small", title: "Daycare", items: [{ id: "s1" }] },
      { id: "large", title: "Bathing", items: [{ id: "l1" }, { id: "l2" }, { id: "l3" }, { id: "l4" }] },
    ];
    const records = [{ id: "r1" }, { id: "r2" }];
    const cells = {
      "r1:s1": { readiness_status: "needs_coaching" },
      "r2:s1": { readiness_status: "verified" },
      "r1:l1": { readiness_status: "not_started" },
      "r1:l2": { readiness_status: "not_started" },
      "r1:l3": { readiness_status: "verified" },
      "r1:l4": { readiness_status: "verified" },
      "r2:l1": { readiness_status: "verified" },
      "r2:l2": { readiness_status: "verified" },
      "r2:l3": { readiness_status: "verified" },
      "r2:l4": { readiness_status: "verified" },
    };

    expect(buildPctReadinessCategoryHotspots({ sections, records, cells })[0]).toMatchObject({
      sectionId: "small",
      category: "Daycare",
      gapCells: 1,
      totalCells: 2,
      affectedTraineeCount: 1,
      gapPercent: 50,
    });
  });

  it("reconciles legacy workbook trainer names to canonical employees and preserves notes", () => {
    const employees = [
      { id: "angelina", full_name: "Angelina DeAugestine", employment_status: "active" },
      { id: "zach", full_name: "Zach Cruz", employment_status: "active" },
      { id: "julia", full_name: "Julia Zane", employment_status: "inactive" },
    ];

    expect(reconcilePctReadinessLegacyActorName(employees, "Angelina D")).toMatchObject({
      status: "matched",
      employee: { id: "angelina" },
    });
    expect(reconcilePctReadinessLegacyActorName(employees, "Zach  C")).toMatchObject({
      status: "matched",
      employee: { id: "zach" },
    });
    expect(reconcilePctReadinessLegacyActorName(employees, "Julia Z")).toMatchObject({
      status: "matched",
      employee: { id: "julia" },
    });
    expect(reconcilePctReadinessLegacyActorName(employees, "needs to be more on top of it")).toMatchObject({
      status: "note",
      employee: null,
    });
  });

  it("matches workbook trainee names against labor employees by normalized name", () => {
    const employees = [
      { id: "e1", full_name: "Michael Duprey" },
      { id: "e2", full_name: "Emily George" },
    ];
    expect(matchPctReadinessEmployeeByName(employees, "Michael Duprey ")).toMatchObject({
      status: "matched",
      employee: { id: "e1" },
    });
    expect(matchPctReadinessEmployeeByName(employees, "Missing Person")).toMatchObject({
      status: "unmatched",
      matches: [],
    });
  });

  it("prevents duplicate active PCT readiness options and sorts by recent start date", () => {
    const employees = [
      { id: "old", full_name: "Old Employee", employment_status: "active", start_date: "2024-01-01" },
      { id: "new", full_name: "New Employee", employment_status: "active", start_date: "2026-04-01" },
      { id: "inactive", full_name: "Inactive Employee", employment_status: "inactive", start_date: "2026-05-01" },
      { id: "existing", full_name: "Existing Employee", employment_status: "active", start_date: "2026-03-01" },
    ];
    const records = [
      {
        id: "r1",
        labor_employee_id: "existing",
        template_name_snapshot: "Angelina's PCT Training Plan v1",
        overall_status: "in_progress",
      },
    ];

    expect(hasActivePctReadinessRecord(records, "existing")).toBe(false);

    const uuidExisting = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const uuidRecords = [
      {
        id: "r2",
        labor_employee_id: uuidExisting,
        template_name_snapshot: "Angelina's PCT Training Plan v1",
        overall_status: "in_progress",
      },
    ];
    expect(hasActivePctReadinessRecord(uuidRecords, uuidExisting)).toBe(true);

    const options = buildPctReadinessEmployeeOptions({
      employees: [
        employees[0],
        employees[1],
        employees[2],
        { ...employees[3], id: uuidExisting },
      ],
      records: uuidRecords,
    });
    expect(options.map((option) => option.value)).toEqual(["new", "old"]);
  });

  it("recognizes PCT and CSR team readiness templates", () => {
    expect(TEAM_READINESS_TEMPLATE_OPTIONS.map((option) => option.slug)).toEqual([
      PCT_READINESS_TEMPLATE_SLUG,
      CSR_READINESS_TEMPLATE_SLUG,
    ]);
    expect(getTeamReadinessTemplateOption(CSR_READINESS_TEMPLATE_SLUG)).toMatchObject({
      roleLabel: "CSR",
      label: "Angelina's CSR Training Plan v1",
    });
    expect(isTeamReadinessRecord({ template_slug: CSR_READINESS_TEMPLATE_SLUG })).toBe(true);
    expect(isTeamReadinessRecord({ template_name_snapshot: "Angelina's PCT Training Plan v1" })).toBe(true);
    expect(isTeamReadinessRecord({ template_name_snapshot: "Angelina's PCT Training Guide v1" })).toBe(true);
    expect(isTeamReadinessRecord({ template_name_snapshot: "PCT Team Readiness Board" })).toBe(true);
    expect(isTeamReadinessRecord({ template_name_snapshot: "Training Plan - CSR" })).toBe(false);
  });

  it("groups leadership, supervisor, CSR, PCT, and other roster positions", () => {
    expect(getLaborRosterPositionGroup("Director of Resorts")).toBe("manager");
    expect(getLaborRosterPositionGroup("General Manager")).toBe("manager");
    expect(getLaborRosterPositionGroup("Assistant Manager")).toBe("manager");
    expect(getLaborRosterPositionGroup("Supervisor")).toBe("supervisor");
    expect(getLaborRosterPositionGroup("Customer Service Representative")).toBe("csr");
    expect(getLaborRosterPositionGroup("Pet Care Technician")).toBe("pct");
    expect(getLaborRosterPositionGroup("Groomer")).toBe("other");
  });

  it("returns UUID location refs unchanged", async () => {
    const uuid = "11111111-1111-1111-1111-111111111111";
    await expect(resolveTrainingLocationId(createMockSupabase({}), uuid, null)).resolves.toBe(uuid);
  });

  it("resolves location slugs through the locations table", async () => {
    const client = createMockSupabase({
      locationRow: { id: "11111111-1111-1111-1111-111111111111" },
    });

    await expect(resolveTrainingLocationId(client, "cherry-hill", null)).resolves.toBe(
      "11111111-1111-1111-1111-111111111111"
    );
  });

  it("falls back to the actor's profile location when slug lookup misses", async () => {
    const client = createMockSupabase({
      profileLocationRow: { location_id: "11111111-1111-1111-1111-111111111111" },
    });

    await expect(resolveTrainingLocationId(client, "unknown-location", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).resolves.toBe(
      "11111111-1111-1111-1111-111111111111"
    );
  });

  it("ignores non-UUID actor ids during fallback location resolution", async () => {
    const client = createMockSupabase({
      profileLocationRow: { location_id: "11111111-1111-1111-1111-111111111111" },
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
      locationName: "Adair Forsythe",
      generatedAt: "2026-04-16T12:30:00Z",
    });

    expect(card).toContain("BEGIN:VCARD");
    expect(card).toContain("VERSION:3.0");
    expect(card).toContain("N:Teefy;Amber;;;");
    expect(card).toContain("FN:Amber Teefy");
    expect(card).toContain("TITLE:Pet Care Technician - Adair Forsythe");
    expect(card).toContain("ORG:Pet Care Technician - Adair Forsythe");
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
      { id: "e1", full_name: "Jane Vance", position_title: "CSR" },
      { id: "e2", full_name: "Pat Lee", position_title: "Manager", end_date: "2026-04-01" },
    ], {
      locationName: "Adair Forsythe",
      generatedAt: "2026-04-16T12:30:00Z",
    });

    expect((file.match(/BEGIN:VCARD/g) || []).length).toBe(2);
    expect(file).toContain("FN:Jane Vance");
    expect(file).toContain("FN:Pat Lee");
    expect(file).not.toContain("Status: Inactive");
    expect(buildLaborEmployeeContactCardFilename({}, { locationName: "Adair Forsythe", bulk: true })).toBe("cherry-hill-active-employee-contacts.vcf");
  });

  it("formats roster email recipients with display name and normalized email", () => {
    expect(
      buildLaborEmailRecipient({
        full_name: "  Jane <Manager> Vance  ",
        metadata: { contact_email: " JANE.SMITH@EXAMPLE.COM " },
      })
    ).toBe("Jane Manager Vance <jane.smith@example.com>");

    expect(buildLaborEmailRecipient({ full_name: "No Email", metadata: { contact_email: "not-an-email" } })).toBe("");
  });

  it("builds a comma-separated active associate email recipient list", () => {
    expect(
      buildLaborEmailRecipientList([
        { id: "e1", full_name: "Jane Vance", employment_status: "active", metadata: { contact_email: "jane@example.com" } },
        { id: "e2", full_name: "Alex Lee", employment_status: "active", metadata: { contact_email: "ALEX@example.com" } },
        { id: "e3", full_name: "Duplicate Jane", employment_status: "active", metadata: { contact_email: "JANE@example.com" } },
        { id: "e4", full_name: "Inactive Pat", employment_status: "inactive", metadata: { contact_email: "pat@example.com" } },
        { id: "e5", full_name: "Missing Email", employment_status: "active", metadata: { contact_email: "" } },
      ])
    ).toBe("Jane Vance <jane@example.com>, Alex Lee <alex@example.com>");
  });

  it("normalizes labor shirt size values and builds shirt-size history events", () => {
    expect(normalizeLaborShirtSize("xxl")).toBe("2XL");
    expect(normalizeLaborShirtSize(" 3 xl ")).toBe("3XL");
    expect(normalizeLaborShirtSize("unknown")).toBe("unknown");
    expect(normalizeLaborShirtSize("")).toBeNull();
    expect(readLaborEmployeeShirtSize({ metadata: { shirt_size: "xxxxl" } })).toBe("4XL");
    expect(getLaborShirtSizeLabel("unknown")).toBe("Other/Unknown");

    expect(
      buildLaborEmployeeShirtSizeHistoryEvent({
        laborEmployeeId: "employee-1",
        oldValue: "M",
        newValue: "xxl",
        actorUserId: "not-a-uuid",
        actorName: "  Skyler  ",
        occurredAt: "2026-05-12T12:00:00.000Z",
      })
    ).toEqual({
      labor_employee_id: "employee-1",
      event_category: "employee",
      event_type: "employee_field_changed",
      source_table: "labor_employees",
      source_id: "employee-1",
      field_name: "shirt_size",
      title: "Shirt size changed",
      summary: "Employee shirt size changed",
      old_value: "M",
      new_value: "2XL",
      old_values: { shirt_size: "M" },
      new_values: { shirt_size: "2XL" },
      actor_user_id: null,
      actor_name: "Skyler",
      occurred_at: "2026-05-12T12:00:00.000Z",
    });
    expect(buildLaborEmployeeShirtSizeHistoryEvent({ laborEmployeeId: "employee-1", oldValue: "XL", newValue: "xl" })).toBeNull();
  });

  it("builds labor dashboard metrics using active employee and compliance rules", () => {
    const dayMs = 24 * 60 * 60 * 1000;
    const metrics = buildLaborDashboardMetrics({
      rosterSnapshot: [
        {
          labor_employee_id: "e1",
          position_title: "General Manager",
          employment_commitment: "full_time",
          start_date: "2026-04-01",
          end_date: null,
          open_training_record_count: 0,
          completed_training_record_count: 1,
        },
        {
          labor_employee_id: "e2",
          position_title: "Pet Care Technician",
          employment_commitment: "part_time",
          start_date: "2026-03-01",
          end_date: null,
          open_training_record_count: 1,
          completed_training_record_count: 0,
        },
        {
          labor_employee_id: "e3",
          position_title: "Supervisor",
          employment_commitment: "full_time",
          start_date: "2026-01-01",
          end_date: new Date(Date.now() - 10 * dayMs).toISOString().slice(0, 10),
          open_training_record_count: 0,
          completed_training_record_count: 1,
        },
      ],
      employeeNotes: [
        { id: "n1", created_at: new Date().toISOString() },
        { id: "n2", created_at: new Date(Date.now() - 10 * dayMs).toISOString() },
      ],
      attendanceIncidents: [
        { id: "a1", labor_employee_id: "e1", incident_date: new Date().toISOString().slice(0, 10) },
        { id: "a2", labor_employee_id: "e3", incident_date: new Date().toISOString().slice(0, 10) },
        { id: "a3", labor_employee_id: "e1", incident_date: new Date(Date.now() - 45 * dayMs).toISOString().slice(0, 10) },
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
    expect(metrics.managerCount).toBe(1);
    expect(metrics.pctCount).toBe(1);
    expect(metrics.fullTimeCount).toBe(1);
    expect(metrics.partTimeCount).toBe(1);
    expect(metrics.unassignedCommitmentCount).toBe(0);
    expect(metrics.staffingMatrix.find((row) => row.key === "manager")).toMatchObject({ fullTime: 1, partTime: 0, total: 1 });
  });

  it("builds active-only staffing matrix with leadership as managers and unassigned commitments", () => {
    const summary = buildLaborRosterStaffingSummary([
      { id: "e1", position_title: "Director of Resorts", employment_commitment: "full_time", is_active: true },
      { id: "e2", position_title: "Assistant Manager", employment_commitment: "full_time", is_active: true },
      { id: "e3", position_title: "Supervisor", employment_commitment: "part_time", is_active: true },
      { id: "e4", position_title: "Customer Service Representative", employment_commitment: "part_time", is_active: true },
      { id: "e5", position_title: "Pet Care Technician", employment_commitment: null, is_active: true },
      { id: "e6", position_title: "Groomer", employment_commitment: "full_time", is_active: true },
      { id: "e7", position_title: "Pet Care Technician", employment_commitment: "part_time", is_active: false },
    ]);

    expect(summary.activeEmployeeCount).toBe(6);
    expect(summary.managerCount).toBe(2);
    expect(summary.supervisorCount).toBe(1);
    expect(summary.csrCount).toBe(1);
    expect(summary.pctCount).toBe(1);
    expect(summary.otherPositionCount).toBe(1);
    expect(summary.fullTimeCount).toBe(3);
    expect(summary.partTimeCount).toBe(2);
    expect(summary.unassignedCommitmentCount).toBe(1);
    expect(summary.staffingMatrix).toEqual([
      { key: "manager", label: "Managers", fullTime: 2, partTime: 0, unassigned: 0, total: 2 },
      { key: "supervisor", label: "Supervisors", fullTime: 0, partTime: 1, unassigned: 0, total: 1 },
      { key: "csr", label: "CSRs", fullTime: 0, partTime: 1, unassigned: 0, total: 1 },
      { key: "pct", label: "PCTs", fullTime: 0, partTime: 0, unassigned: 1, total: 1 },
      { key: "other", label: "Other", fullTime: 1, partTime: 0, unassigned: 0, total: 1 },
    ]);
  });
});
