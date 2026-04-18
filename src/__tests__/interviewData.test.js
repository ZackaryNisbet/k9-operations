import { PDFDocument } from "pdf-lib";
import {
  buildInterviewTemplateSnapshot,
  extractPdfFieldManifest,
  fillInterviewPdfBytes,
  getInterviewAudioContentType,
  INTERVIEW_AUDIO_MAX_BYTES,
  validateAiDraftPayload,
  validateInterviewAudioFile,
} from "../kol/interviewData";

async function createFillableInterviewPdf() {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  const form = pdfDoc.getForm();

  const nameField = form.createTextField("candidate_name");
  nameField.addToPage(page, { x: 72, y: 700, width: 240, height: 24 });

  const notesField = form.createTextField("interview_notes");
  notesField.enableMultiline();
  notesField.addToPage(page, { x: 72, y: 620, width: 360, height: 60 });

  const recommendField = form.createCheckBox("recommend_hire");
  recommendField.addToPage(page, { x: 72, y: 580, width: 18, height: 18 });

  return pdfDoc.save();
}

describe("interview PDF form utilities", () => {
  it("extracts stable AcroForm field names and page metadata", async () => {
    const bytes = await createFillableInterviewPdf();

    const result = await extractPdfFieldManifest(bytes);

    expect(result.ok).toBe(true);
    expect(result.status).toBe("verified_fields");
    expect(result.pageCount).toBe(1);
    expect(result.manifest.map((field) => field.name).sort()).toEqual([
      "candidate_name",
      "interview_notes",
      "recommend_hire",
    ]);
    expect(result.manifest.find((field) => field.name === "candidate_name")).toMatchObject({
      type: "text",
      page_number: 1,
    });
  });

  it("fills a PDF by field name without browser-positioned coordinates", async () => {
    const bytes = await createFillableInterviewPdf();

    const filled = await fillInterviewPdfBytes(bytes, {
      candidate_name: "Jordan Vance",
      interview_notes: "Reliable weekend availability.",
      recommend_hire: "yes",
    });

    const pdfDoc = await PDFDocument.load(filled);
    const form = pdfDoc.getForm();
    expect(form.getTextField("candidate_name").getText()).toBe("Jordan Vance");
    expect(form.getTextField("interview_notes").getText()).toBe("Reliable weekend availability.");
    expect(form.getCheckBox("recommend_hire").isChecked()).toBe(true);
  });
});

describe("interview template snapshots", () => {
  it("keeps interview questions immutable after draft questions change", () => {
    const template = { id: "template-1", location_id: "loc-1", role_key: "csr", role_label: "CSR" };
    const version = {
      id: "version-1",
      version_no: 1,
      status: "published",
      pdf_verification_status: "verified_fields",
      pdf_field_manifest: [{ name: "candidate_name", type: "text" }],
    };
    const questions = [
      { id: "q1", question_key: "availability", category: "Availability", prompt: "Are you available weekends?", sequence_order: 10 },
    ];

    const snapshot = buildInterviewTemplateSnapshot({ template, version, questions });
    questions[0].prompt = "Changed later";
    version.pdf_field_manifest.push({ name: "new_field", type: "text" });

    expect(snapshot.questions[0].prompt).toBe("Are you available weekends?");
    expect(snapshot.version.pdf_field_manifest).toHaveLength(1);
  });
});

describe("interview audio helpers", () => {
  it("accepts Zoom-sized m4a audio and infers a storage-safe content type", () => {
    const file = { name: "candidate-interview.m4a", type: "", size: 25 * 1024 * 1024 };

    expect(validateInterviewAudioFile(file)).toMatchObject({
      ok: true,
      contentType: "audio/mp4",
    });
    expect(getInterviewAudioContentType(file)).toBe("audio/mp4");
  });

  it("rejects audio files over the xAI STT interview limit", () => {
    const file = { name: "candidate-interview.mp3", type: "audio/mpeg", size: INTERVIEW_AUDIO_MAX_BYTES + 1 };

    expect(validateInterviewAudioFile(file)).toMatchObject({
      ok: false,
      error: "Interview audio must be 500 MB or smaller.",
    });
  });
});

describe("AI draft response validation", () => {
  it("rejects unknown targets and constrains overlong draft text", () => {
    const targetMap = new Map([
      ["custom_question:q1", { prompt: "What did they say?" }],
      ["pdf_field:notes", { name: "notes" }],
    ]);

    const result = validateAiDraftPayload({
      responses: [
        { target_type: "custom_question", question_key: "q1", draft_text: "abcdef", confidence: 1.2, evidence: ["candidate said abcdef"] },
        { target_type: "pdf_field", pdf_field_name: "missing", draft_text: "unsupported", confidence: 0.4 },
      ],
    }, targetMap, 5);

    expect(result.ok).toBe(false);
    expect(result.responses).toHaveLength(1);
    expect(result.responses[0]).toMatchObject({
      question_key: "q1",
      draft_text: "abcde",
      confidence: 1,
    });
    expect(result.errors[0]).toContain("Unknown target");
  });
});
