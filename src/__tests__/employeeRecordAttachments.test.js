import { describe, expect, it } from "vitest";
import {
  buildEmployeeRecordMetricCards,
  buildEmployeeHistoryTimeline,
  buildEmployeeTrainingRequirementRows,
  buildLaborEmployeeAttachmentPath,
  buildLaborEmployeeRequirementEvidencePath,
  formatLaborAttachmentFileSize,
  getLaborAttachmentPreviewKind,
  getNextEmployeeReviewCycle,
  isLaborEmployeeNoteDeleted,
  isLaborEmployeeDocumentDeleted,
  LABOR_TRAINING_REQUIREMENT_SLUGS,
  groupLaborEmployeeDocumentsByNote,
  requiresPpbcTrainingForPosition,
  sanitizeLaborAttachmentFilename,
  summarizeEmployeeTrainingRequirementCompliance,
  validateLaborEmployeeAttachmentFiles,
  validateLaborTrainingRequirementEvidenceFile,
} from "../kol/trainingData.js";

const EMPLOYEE_ID = "11111111-1111-4111-8111-111111111111";
const NOTE_ID = "22222222-2222-4222-8222-222222222222";

describe("employee record attachment helpers", () => {
  it("builds safe private attachment paths under employee and note folders", () => {
    expect(sanitizeLaborAttachmentFilename("Email from HR + doctor's note.pdf")).toBe("Email-from-HR-doctor-s-note.pdf");
    expect(
      buildLaborEmployeeAttachmentPath({
        laborEmployeeId: EMPLOYEE_ID,
        noteId: NOTE_ID,
        randomId: "abc-123",
        fileName: "../email proof.pdf",
      })
    ).toBe(`${EMPLOYEE_ID}/${NOTE_ID}/abc-123-email-proof.pdf`);
  });

  it("accepts PDFs and common images while rejecting unsupported or oversized files", () => {
    const { acceptedFiles, errors } = validateLaborEmployeeAttachmentFiles([
      { name: "email.pdf", type: "application/pdf", size: 128 },
      { name: "embedded.png", type: "image/png", size: 2048 },
      { name: "notes.docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 4096 },
      { name: "huge.jpg", type: "image/jpeg", size: 21 * 1024 * 1024 },
    ]);

    expect(acceptedFiles.map((file) => file.name)).toEqual(["email.pdf", "embedded.png"]);
    expect(errors).toEqual([
      "notes.docx must be a PDF, PNG, JPG, or WEBP file.",
      "huge.jpg is larger than 20 MB.",
    ]);
  });

  it("groups active uploaded documents by the note they support", () => {
    const grouped = groupLaborEmployeeDocumentsByNote([
      { id: "older", labor_employee_note_id: "note-1", uploaded_at: "2026-04-15T10:00:00Z" },
      { id: "newer", labor_employee_note_id: "note-1", uploaded_at: "2026-04-16T10:00:00Z" },
      { id: "deleted", labor_employee_note_id: "note-1", uploaded_at: "2026-04-17T10:00:00Z", deleted_at: "2026-04-17T12:00:00Z" },
      { id: "loose", uploaded_at: "2026-04-16T11:00:00Z" },
    ]);

    expect(grouped["note-1"].map((document) => document.id)).toEqual(["newer", "older"]);
    expect(grouped.__unlinked__.map((document) => document.id)).toEqual(["loose"]);
    expect(isLaborEmployeeDocumentDeleted({ deleted_at: "2026-04-17T12:00:00Z" })).toBe(true);
  });

  it("keeps deleted notes out of active grouping while preserving them for history", () => {
    expect(isLaborEmployeeNoteDeleted({ deleted_at: "2026-04-17T12:00:00Z" })).toBe(true);

    const timeline = buildEmployeeHistoryTimeline({
      notes: [
        {
          id: "note-1",
          labor_employee_id: EMPLOYEE_ID,
          note_text: "Original note text",
          created_at: "2026-04-17T10:00:00Z",
          created_by_name: "Zack Nisbet",
          deleted_at: "2026-04-17T12:00:00Z",
          deleted_by_name: "Zack Nisbet",
        },
      ],
      documents: [
        {
          id: "doc-1",
          labor_employee_id: EMPLOYEE_ID,
          labor_employee_note_id: "note-1",
          file_name: "email.pdf",
          uploaded_at: "2026-04-17T10:05:00Z",
          uploaded_by_name: "Zack Nisbet",
          deleted_at: "2026-04-17T12:01:00Z",
          deleted_by_name: "Zack Nisbet",
        },
      ],
    });

    expect(timeline.map((item) => item.type)).toEqual([
      "employee_document_deleted",
      "employee_note_deleted",
      "employee_document_uploaded",
      "employee_note_created",
    ]);
    expect(timeline[1]).toMatchObject({
      title: "Employee note removed",
      summary: "Original note text",
    });
  });

  it("identifies in-app preview kinds for supported evidence files", () => {
    expect(getLaborAttachmentPreviewKind({ mime_type: "application/pdf" })).toBe("pdf");
    expect(getLaborAttachmentPreviewKind({ mime_type: "image/jpeg" })).toBe("image");
    expect(getLaborAttachmentPreviewKind({ file_name: "email.webp" })).toBe("image");
    expect(getLaborAttachmentPreviewKind({ file_name: "archive.zip" })).toBe("unsupported");
    expect(formatLaborAttachmentFileSize(1536)).toBe("2 KB");
  });
});

describe("employee training requirement helpers", () => {
  const requirements = [
    { id: "req-incite", slug: LABOR_TRAINING_REQUIREMENT_SLUGS.INCITE },
    { id: "req-cpr", slug: LABOR_TRAINING_REQUIREMENT_SLUGS.CPR },
    { id: "req-ppbc-1", slug: LABOR_TRAINING_REQUIREMENT_SLUGS.PPBC_LEVEL_1 },
    { id: "req-ppbc-2", slug: LABOR_TRAINING_REQUIREMENT_SLUGS.PPBC_LEVEL_2 },
  ];

  it("requires PPBC only outside PCT and CSR positions", () => {
    expect(requiresPpbcTrainingForPosition("Pet Care Technician")).toBe(false);
    expect(requiresPpbcTrainingForPosition("CSR")).toBe(false);
    expect(requiresPpbcTrainingForPosition("Assistant Manager")).toBe(true);
  });

  it("builds PDF-only training evidence paths and validation", () => {
    expect(
      buildLaborEmployeeRequirementEvidencePath({
        laborEmployeeId: EMPLOYEE_ID,
        requirementSlug: "PPBC Level 1",
        randomId: "evidence-1",
        fileName: "Level 1 certificate.pdf",
      })
    ).toBe(`${EMPLOYEE_ID}/requirements/ppbc-level-1/evidence-1-Level-1-certificate.pdf`);

    expect(validateLaborTrainingRequirementEvidenceFile({ name: "proof.pdf", type: "application/pdf", size: 128 }).error).toBe("");
    expect(validateLaborTrainingRequirementEvidenceFile({ name: "proof.png", type: "image/png", size: 128 }).error).toBe("proof.png must be a PDF file.");
  });

  it("orders Incite, CPR, and role-specific PPBC requirements", () => {
    const rows = buildEmployeeTrainingRequirementRows({
      employee: { position_title: "Supervisor" },
      requirements,
      certifications: [],
      documents: [],
      today: "2026-04-17",
    });

    expect(rows.map((row) => row.slug)).toEqual([
      LABOR_TRAINING_REQUIREMENT_SLUGS.INCITE,
      LABOR_TRAINING_REQUIREMENT_SLUGS.CPR,
      LABOR_TRAINING_REQUIREMENT_SLUGS.PPBC_LEVEL_1,
      LABOR_TRAINING_REQUIREMENT_SLUGS.PPBC_LEVEL_2,
    ]);

    const pctRows = buildEmployeeTrainingRequirementRows({
      employee: { position_title: "Pet Care Technician" },
      requirements,
      certifications: [],
      documents: [],
      today: "2026-04-17",
    });
    expect(pctRows.map((row) => row.slug)).toEqual([
      LABOR_TRAINING_REQUIREMENT_SLUGS.INCITE,
      LABOR_TRAINING_REQUIREMENT_SLUGS.CPR,
    ]);
  });

  it("summarizes compliance from completed requirements and evidence", () => {
    const documents = [
      { id: "doc-incite", document_type: "training_requirement_evidence", metadata: { requirement_slug: LABOR_TRAINING_REQUIREMENT_SLUGS.INCITE }, uploaded_at: "2026-04-17T10:00:00Z" },
      { id: "doc-ppbc-1", document_type: "training_requirement_evidence", metadata: { requirement_slug: LABOR_TRAINING_REQUIREMENT_SLUGS.PPBC_LEVEL_1 }, uploaded_at: "2026-04-17T10:00:00Z" },
      { id: "doc-ppbc-2", document_type: "training_requirement_evidence", metadata: { requirement_slug: LABOR_TRAINING_REQUIREMENT_SLUGS.PPBC_LEVEL_2 }, uploaded_at: "2026-04-17T10:00:00Z" },
    ];
    const certifications = [
      { requirement_id: "req-incite", completed_on: "2026-04-01", labor_employee_document_id: "doc-incite" },
      { requirement_id: "req-cpr", completed_on: "2026-04-01", expires_on: "2027-04-01", external_document_url: "https://example.com/cpr.pdf" },
      { requirement_id: "req-ppbc-1", completed_on: "2026-04-01", labor_employee_document_id: "doc-ppbc-1" },
      { requirement_id: "req-ppbc-2", completed_on: "2026-04-01", labor_employee_document_id: "doc-ppbc-2" },
    ];

    const rows = buildEmployeeTrainingRequirementRows({
      employee: { position_title: "Supervisor" },
      requirements,
      certifications,
      documents,
      today: "2026-04-17",
    });
    expect(summarizeEmployeeTrainingRequirementCompliance(rows)).toMatchObject({
      isCompliant: true,
      label: "Compliant",
    });

    const missingEvidenceRows = buildEmployeeTrainingRequirementRows({
      employee: { position_title: "Supervisor" },
      requirements,
      certifications: certifications.map((certification) => ({ ...certification, labor_employee_document_id: null, external_document_url: "" })),
      documents: [],
      today: "2026-04-17",
    });
    expect(summarizeEmployeeTrainingRequirementCompliance(missingEvidenceRows)).toMatchObject({
      isCompliant: false,
      label: "Non-Compliant",
    });

    const deletedEvidenceRows = buildEmployeeTrainingRequirementRows({
      employee: { position_title: "Supervisor" },
      requirements,
      certifications,
      documents: documents.map((document) => ({ ...document, deleted_at: "2026-04-17T12:00:00Z" })),
      today: "2026-04-17",
    });
    expect(summarizeEmployeeTrainingRequirementCompliance(deletedEvidenceRows)).toMatchObject({
      isCompliant: false,
      label: "Non-Compliant",
    });
  });
});

describe("employee record metric helpers", () => {
  it("keeps top employee metrics focused and non-duplicative", () => {
    const metrics = buildEmployeeRecordMetricCards({
      employeeSnapshot: { training_compliance_flag: true, cpr_status: "not_started" },
      attendanceIncidentCount30d: 2,
      reviewCycleRows: [
        { id: "30_day", label: "30 Day Review", dueDate: "2026-04-20", status: "scheduled" },
      ],
    });

    expect(metrics.map((metric) => metric.id)).toEqual([
      "training_compliance",
      "next_review",
      "attendance_marks",
    ]);
    expect(metrics.some((metric) => /cpr|note/i.test(metric.label))).toBe(false);
    expect(metrics[1].value).toBe("30 Day Review");
  });

  it("selects the earliest incomplete review with a due date", () => {
    expect(
      getNextEmployeeReviewCycle([
        { id: "90_day", label: "90 Day Review", dueDate: "2026-07-01", status: "scheduled" },
        { id: "30_day", label: "30 Day Review", dueDate: "2026-05-01", status: "completed" },
        { id: "60_day", label: "60 Day Review", dueDate: "2026-06-01", status: "in_progress" },
      ])
    ).toMatchObject({ id: "60_day", label: "60 Day Review" });
  });
});
