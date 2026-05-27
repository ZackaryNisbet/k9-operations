import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  buildPerformanceReviewAreaResponseSummaries,
  buildDocuSealPerformanceReviewFields,
  buildPerformanceReviewCyclesFromPolicy,
  buildPerformanceReviewPdfFileName,
  fillPerformanceReviewPdfBytes,
  getPerformanceReviewCycleStatus,
  getPerformanceReviewTemplateOverrideKey,
  getPerformanceReviewCompliance,
  PERFORMANCE_REVIEW_TEMPLATES,
  resolvePerformanceReviewTemplate,
} from "../kol/performanceReviewData";

async function createBlankReviewPdf(pageCount = 3) {
  const pdfDoc = await PDFDocument.create();
  for (let index = 0; index < pageCount; index += 1) {
    pdfDoc.addPage([612, 792]);
  }
  return pdfDoc.save();
}

describe("performance review compliance", () => {
  it("marks the roster rollup non-compliant when any checkpoint is overdue", () => {
    const result = getPerformanceReviewCompliance({
      review_30_due_date: "2026-01-01",
      review_30_status: "completed",
      review_60_due_date: "2026-02-01",
      review_60_status: "overdue",
      review_90_due_date: "2026-03-01",
      review_90_status: "scheduled",
    }, "2026-02-10");

    expect(result.label).toBe("Non-compliant");
    expect(result.overdueCount).toBe(1);
    expect(result.detail).toContain("60 Day");
  });

  it("derives compliance columns from arbitrary resolved review checkpoint policy", () => {
    const policyRequirements = [
      {
        id: "policy-review-90",
        slug: "review_90_day",
        requirement_kind: "review_checkpoint",
        label: "90 Day",
        due_rule: { offset_days: 90 },
        display_order: 90,
      },
      {
        id: "policy-review-45",
        slug: "review_45_day",
        requirement_kind: "review_checkpoint",
        label: "45 Day",
        due_rule: { offset_days: 45 },
        display_order: 45,
      },
    ];

    expect(buildPerformanceReviewCyclesFromPolicy(policyRequirements)).toEqual([
      expect.objectContaining({
        id: "review_45_day",
        label: "45 Day",
        shortLabel: "45",
        dueDateKey: "review_45_due_date",
        statusKey: "review_45_status",
      }),
      expect.objectContaining({
        id: "review_90_day",
        label: "90 Day",
        shortLabel: "90",
        dueDateKey: "review_90_due_date",
        statusKey: "review_90_status",
      }),
    ]);

    const result = getPerformanceReviewCompliance({
      review_45_due_date: "2026-02-14",
      review_45_status: "scheduled",
      review_90_due_date: "2026-04-01",
      review_90_status: "scheduled",
    }, "2026-02-15", { policyRequirements });

    expect(result.label).toBe("Non-compliant");
    expect(result.detail).toContain("45 Day");
    expect(result.cycleRows.map((cycle) => cycle.id)).toEqual(["review_45_day", "review_90_day"]);
    expect(result.cycleRows.some((cycle) => cycle.id === "30_day" || cycle.id === "60_day")).toBe(false);
  });

  it("does not fall back to legacy review columns when resolved policy has no checkpoints", () => {
    const result = getPerformanceReviewCompliance({}, "2026-02-15", { policyRequirements: [] });

    expect(result.cycleRows).toEqual([]);
    expect(result.label).toBe("No checkpoints configured");
    expect(result.overdueCount).toBe(0);
  });

  it("treats completed-late review cells as complete with lateness metadata", () => {
    const cycle = buildPerformanceReviewCyclesFromPolicy([
      {
        id: "req-review-45",
        slug: "review_45_day",
        requirement_kind: "review_checkpoint",
        title: "45 Day",
        evidence_policy: "file_required",
        due_rule: { offset_days: 45 },
      },
    ])[0];

    const status = getPerformanceReviewCycleStatus({
      requirements: [
        {
          requirement_id: "req-review-45",
          slug: "review_45_day",
          requirement_kind: "review_checkpoint",
          status: "completed_late",
          due_date: "2026-02-14",
          completed_on: "2026-02-16",
          evidence_policy: "file_required",
          evidence: [{ id: "doc-1", uploaded_at: "2026-02-20T10:00:00Z", uploaded_by_name: "Ari Manager" }],
        },
      ],
    }, cycle, "2026-02-21");

    expect(status.status).toBe("complete");
    // New canonical + labor fast-path normalizes completed_late (with evidence) to the simple completed state.
    // Lateness metadata is still computed downstream; rawStatus is now the canonical projection.
    expect(status.rawStatus).toBe("completed");
    expect(status.completed).toBe(true);
    expect(status.overdue).toBe(false);
    expect(status.completedLate).toBe(true);
    expect(status.completedDate).toBe("2026-02-16");
    expect(status.evidenceUploadedAt).toBe("2026-02-20T10:00:00Z");
  });

  it("blocks file-required completed reviews that are missing evidence", () => {
    const cycle = buildPerformanceReviewCyclesFromPolicy([
      {
        id: "req-review-45",
        slug: "review_45_day",
        requirement_kind: "review_checkpoint",
        title: "45 Day",
        evidence_policy: "file_required",
        due_rule: { offset_days: 45 },
      },
    ])[0];

    const status = getPerformanceReviewCycleStatus({
      requirements: [
        {
          requirement_id: "req-review-45",
          slug: "review_45_day",
          requirement_kind: "review_checkpoint",
          status: "complete",
          due_date: "2026-02-14",
          completed_on: "2026-02-10",
          evidence_policy: "file_required",
        },
      ],
    }, cycle, "2026-02-21");

    expect(status.evidenceRequired).toBe(true);
    expect(status.hasEvidence).toBe(false);
    expect(status.evidenceMissing).toBe(true);
    expect(status.completed).toBe(false);
  });

  it("treats custom yes/no compliance columns as direct policy requirements", () => {
    const cycle = buildPerformanceReviewCyclesFromPolicy([
      {
        id: "req-custom-test",
        slug: "custom_test",
        requirement_kind: "review_checkpoint",
        title: "Test",
        evidence_policy: "checkbox_only",
        display_group: "custom",
        metadata: { ui_kind: "custom_yes_no" },
      },
    ])[0];

    expect(cycle).toMatchObject({
      requirementId: "req-custom-test",
      isDirectComplianceRequirement: true,
      legacyReviewCycle: null,
    });

    const status = getPerformanceReviewCycleStatus({
      requirements: [
        {
          requirement_id: "req-custom-test",
          slug: "custom_test",
          requirement_kind: "review_checkpoint",
          status: "complete",
          completed_on: "2026-05-26",
          evidence_policy: "checkbox_only",
          evidence_link_id: "link-custom-test",
        },
      ],
    }, cycle, "2026-05-26");

    expect(status.completed).toBe(true);
    expect(status.evidenceRequired).toBe(false);
    expect(status.evidenceLinkId).toBe("link-custom-test");
    expect(status.isDirectComplianceRequirement).toBe(true);
    expect(status.legacyReviewCycle).toBe("");
  });

  it("lets explicit Compliance waiver markers override completed evidence status", () => {
    const cycle = buildPerformanceReviewCyclesFromPolicy([
      {
        id: "req-training-packet",
        slug: "training_packet",
        requirement_kind: "review_checkpoint",
        title: "Training Packet",
        evidence_policy: "file_required",
        display_group: "custom",
        metadata: { ui_kind: "custom_yes_no" },
      },
    ])[0];

    // Modern board shape (what get_labor_compliance_board actually returns after a waive via the RPC).
    // exception_kind or status="waived" on the requirement is the canonical signal (server already computed it).
    const status = getPerformanceReviewCycleStatus({
      requirements: [
        {
          requirement_id: "req-training-packet",
          slug: "training_packet",
          requirement_kind: "review_checkpoint",
          status: "waived",
          exception_kind: "waived",
          exception_reason: "Manager override for training packet",
          completed_on: "2026-05-26",
          evidence_policy: "file_required",
          evidence_link_id: "link-training-packet",
        },
      ],
    }, cycle, "2026-05-26");

    expect(status.rawStatus).toBe("waived");
    expect(status.status).toBe("waived");
    expect(status.completed).toBe(true); // waived is treated as compliant (isCompliant true)
    expect(status.overdue).toBe(false);
    expect(status.evidenceMissing).toBe(false);
    expect(status.evidenceLinkId).toBe("link-training-packet");
  });

  it("keeps employees compliant when no review checkpoint is overdue", () => {
    const result = getPerformanceReviewCompliance({
      review_30_due_date: "2026-01-01",
      review_30_status: "completed",
      review_60_due_date: "2026-04-01",
      review_60_status: "scheduled",
      review_90_due_date: "2026-05-01",
      review_90_status: "scheduled",
    }, "2026-02-10");

    expect(result.label).toBe("Compliant");
    expect(result.overdueCount).toBe(0);
  });
});

describe("performance review PDF helpers", () => {
  it("resolves the correct HR PDF template from roster position titles", () => {
    expect(resolvePerformanceReviewTemplate({ position_title: "PCT" })?.roleKey).toBe("pet_care_technician");
    expect(resolvePerformanceReviewTemplate({ position_title: "Customer Service Representative" })?.roleKey).toBe("customer_service_representative");
    expect(resolvePerformanceReviewTemplate({ position_title: "General Manager" })?.roleKey).toBe("general_manager");
  });

  it("uses an employee-level PDF template override when the position title does not match", () => {
    const employee = {
      position_title: "Director of Resorts",
      metadata: { performance_review_template_role: "general_manager" },
    };

    expect(getPerformanceReviewTemplateOverrideKey(employee)).toBe("general_manager");
    expect(resolvePerformanceReviewTemplate(employee)?.roleKey).toBe("general_manager");
  });

  it("creates DocuSeal fields for employee initials, signature, and date", () => {
    const fields = buildDocuSealPerformanceReviewFields(PERFORMANCE_REVIEW_TEMPLATES.pet_care_technician, "30_day");

    expect(fields.map((field) => field.name)).toEqual([
      "30_day_employee_initials",
      "employee_signature",
      "employee_signature_date",
    ]);
    expect(fields.find((field) => field.name === "employee_signature")).toMatchObject({
      type: "signature",
      role: "Employee",
      format: "drawn_or_typed",
    });
    expect(fields.find((field) => field.name === "employee_signature").areas[0]).toMatchObject({
      page: 3,
      x: 132,
      y: 519,
      w: 128,
      h: 20,
    });
  });

  it("summarizes answered area ratings for the active review cycle", () => {
    const reviewSections = [
      {
        section_key: "pct_30_day",
        title: "30-Day Review",
        items: [
          { id: "item-1", item_type: "rating", prompt: "First area" },
          { id: "item-2", item_type: "rating", prompt: "Second area" },
          { id: "item-3", item_type: "long_text", prompt: "Manager Notes" },
        ],
      },
      {
        section_key: "pct_60_day",
        title: "60-Day Review",
        items: [
          { id: "item-4", item_type: "rating", prompt: "Later area" },
        ],
      },
    ];
    const responses = [
      { review_item_id: "item-1", rating_value: "Meets Expectations" },
      { review_item_id: "item-4", rating_value: "Needs Improvement" },
    ];

    expect(buildPerformanceReviewAreaResponseSummaries(reviewSections, responses, {}, "30_day")).toEqual([
      "1. Addressed; Meets Expectations",
    ]);
  });

  it("overlays identity and manager notes into a non-fillable PDF", async () => {
    const sourcePdf = await createBlankReviewPdf(3);
    const filled = await fillPerformanceReviewPdfBytes(sourcePdf, {
      template: PERFORMANCE_REVIEW_TEMPLATES.pet_care_technician,
      employee: {
        full_name: "Jordan Vance",
        position_title: "Pet Care Technician",
        start_date: "2026-01-01",
      },
      reviewInstance: { review_cycle: "30_day", metadata: {} },
      reviewSections: [
        {
          section_key: "pct_30_day",
          title: "30-Day Review",
          items: [
            { id: "item-1", item_type: "rating", prompt: "Has the employee completed onboarding?" },
          ],
        },
      ],
      responses: [{ review_item_id: "item-1", rating_value: "Meets Expectations" }],
      locationName: "Adair Forsythe",
      reviewDate: "2026-02-01",
      draft: {
        rating: "Meets Expectations",
        managerNotes: "Strong progress on kennel flow.",
        actionPlan: "Continue shadowing medication checks.",
      },
    });

    const pdfDoc = await PDFDocument.load(filled);
    expect(pdfDoc.getPageCount()).toBe(4);
  });

  it("generates stable review filenames", () => {
    expect(buildPerformanceReviewPdfFileName({ full_name: "Jordan Vance" }, "60_day")).toBe("jordan-smith-60-day-performance-review.pdf");
  });
});
