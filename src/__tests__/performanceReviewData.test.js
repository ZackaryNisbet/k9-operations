import { PDFDocument } from "pdf-lib";
import {
  buildPerformanceReviewAreaResponseSummaries,
  buildDocuSealPerformanceReviewFields,
  buildPerformanceReviewPdfFileName,
  fillPerformanceReviewPdfBytes,
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
