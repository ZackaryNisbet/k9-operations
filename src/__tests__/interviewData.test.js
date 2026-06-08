import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import {
  buildPdfResponseMap,
  canAccessInterviewIdentity,
  buildInterviewSttAudioFileName,
  buildInterviewResumePath,
  buildInterviewTemplateSnapshot,
  cleanInterviewTranscriptText,
  encodePcm16Wav,
  extractPdfFieldManifest,
  fillInterviewPdfBytes,
  formatInterviewPayRateRange,
  formatInterviewPayRateSummary,
  getInterviewPdfFieldDisplayRect,
  getInterviewCandidateContactLabel,
  getInterviewCandidateDisplayLabel,
  getInterviewAudioContentType,
  getInterviewResumeContentType,
  getInterviewRecommendation,
  getInterviewTranscriptTurns,
  INTERVIEW_AUDIO_MAX_BYTES,
  INTERVIEW_RESUME_MAX_BYTES,
  INTERVIEW_STT_NORMALIZED_AUDIO_SAMPLE_RATE,
  normalizeInterviewPayRates,
  redactInterviewRecordForIdentityAccess,
  shouldNormalizeInterviewAudioForStt,
  validateAiDraftPayload,
  validateInterviewAudioFile,
  validateInterviewResumeFile,
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
      page_size: {
        width: 612,
        height: 792,
      },
    });
  });

  it("fills a PDF by field name without browser-positioned coordinates", async () => {
    const bytes = await createFillableInterviewPdf();

    const filled = await fillInterviewPdfBytes(bytes, {
      candidate_name: "Jordan Smith",
      interview_notes: "Reliable weekend availability.",
      recommend_hire: "yes",
    });

    const pdfDoc = await PDFDocument.load(filled);
    const form = pdfDoc.getForm();
    expect(form.getTextField("candidate_name").getText()).toBe("Jordan Smith");
    expect(form.getTextField("interview_notes").getText()).toBe("Reliable weekend availability.");
    expect(form.getCheckBox("recommend_hire").isChecked()).toBe(true);
  });

  it("nudges interviewer text right in PDF appearances without changing source metadata", async () => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]);
    const form = pdfDoc.getForm();
    const interviewerField = form.createTextField("interviewer_name");
    interviewerField.addToPage(page, { x: 72, y: 700, width: 240, height: 24 });
    const bytes = await pdfDoc.save();

    const filled = await fillInterviewPdfBytes(bytes, { interviewer_name: "Zack Nisbet" });
    const filledDoc = await PDFDocument.load(filled);

    expect(filledDoc.getForm().getTextField("interviewer_name").getText()).toBe("  Zack Nisbet");
  });

  it("applies scorecard field geometry overrides to manifests and filled PDFs", async () => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]);
    const form = pdfDoc.getForm();
    const overallScore = form.createTextField("overall_score");
    overallScore.addToPage(page, { x: 318, y: 320.4, width: 58, height: 13 });
    const decision = form.createTextField("decision_move_forward_with_reservations");
    decision.addToPage(page, { x: 304, y: 347.6, width: 9.5, height: 10.5 });
    const bytes = await pdfDoc.save();

    const manifest = await extractPdfFieldManifest(bytes);
    expect(getInterviewPdfFieldDisplayRect(manifest.manifest.find((field) => field.name === "overall_score"))).toMatchObject({
      x: 252,
      width: 68,
    });
    expect(manifest.manifest.find((field) => field.name === "decision_move_forward_with_reservations").rect).toMatchObject({
      x: 303,
      y: 348,
      width: 8,
      height: 8,
    });

    const filled = await fillInterviewPdfBytes(bytes, {
      overall_score: "4.5/5",
      decision_move_forward_with_reservations: "yes",
    });
    const filledDoc = await PDFDocument.load(filled);
    const filledForm = filledDoc.getForm();
    const filledOverallRect = filledForm.getTextField("overall_score").acroField.getWidgets()[0].getRectangle();
    const filledDecisionRect = filledForm.getTextField("decision_move_forward_with_reservations").acroField.getWidgets()[0].getRectangle();

    expect(filledForm.getTextField("decision_move_forward_with_reservations").getText()).toBe("X");
    expect(filledOverallRect).toMatchObject({ x: 252, width: 68 });
    expect(filledDecisionRect).toMatchObject({ x: 303, y: 348, width: 8, height: 8 });
  });

  it("does not move matching field names on unrelated PDF layouts", async () => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]);
    const form = pdfDoc.getForm();
    const overallScore = form.createTextField("overall_score");
    overallScore.addToPage(page, { x: 80, y: 120, width: 90, height: 16 });
    const bytes = await pdfDoc.save();

    const manifest = await extractPdfFieldManifest(bytes);
    expect(getInterviewPdfFieldDisplayRect(manifest.manifest[0])).toMatchObject(manifest.manifest[0].rect);
    expect(getInterviewPdfFieldDisplayRect(manifest.manifest[0])).not.toMatchObject({ x: 252, width: 68 });

    const filled = await fillInterviewPdfBytes(bytes, { overall_score: "4/5" });
    const filledDoc = await PDFDocument.load(filled);
    const filledRect = filledDoc.getForm().getTextField("overall_score").acroField.getWidgets()[0].getRectangle();
    expect(filledRect).not.toMatchObject({ x: 252, width: 68 });
    expect(filledRect).toMatchObject({ x: 79.5, y: 119.5, width: 91, height: 17 });
  });

  it("adds candidate metadata defaults for common PDF identity fields", () => {
    const map = buildPdfResponseMap([], {
      candidate_full_name: "Lahayla Kern",
      candidate_position: "Pet Care Technician",
      interview_date: "2026-04-12",
      interviewer_name: "Zack Nisbet",
      metadata: { hiring_recommendation: "proceed" },
    }, [
      { name: "candidate_name" },
      { name: "candidate_position" },
      { name: "interview_date" },
      { name: "interviewer_name" },
      { name: "decision_move_forward" },
    ]);

    expect(map).toMatchObject({
      candidate_name: "Lahayla Kern",
      candidate_position: "Pet Care Technician",
      interview_date: "2026-04-12",
      interviewer_name: "Zack Nisbet",
      decision_move_forward: "X",
    });
  });

  it("redacts interview identity fields for restricted users before render or detail fetch", () => {
    const rawRecord = {
      id: "interview-1",
      location_id: "location-1",
      template_id: "template-1",
      template_version_id: "version-1",
      candidate_full_name: "Alex Private",
      candidate_email: "alex@example.com",
      candidate_phone: "555-111-2222",
      candidate_position: "Pet Care Technician",
      interview_date: "2026-05-11",
      interview_time: "09:30:00",
      zoom_recording_url: "https://zoom.example/private",
      zoom_passcode: "123456",
      transcript_text: "private transcript",
      transcript_file_bucket: "labor-interview-documents",
      transcript_file_path: "location/interviews/interview-1/transcript.txt",
      template_snapshot: { template: { role_key: "pct" } },
      pdf_field_manifest_snapshot: [{ name: "candidate_name" }],
      question_snapshot: [{ prompt: "Private question" }],
      metadata: {
        hiring_recommendation: "proceed",
        audio_transcription: { source_audio: { bucket: "labor-interview-documents" } },
      },
      created_by_user_id: "creator-1",
      updated_by_user_id: "manager-1",
      masked_candidate_label: "Candidate 4",
      can_access_identity: false,
    };

    const redacted = redactInterviewRecordForIdentityAccess(rawRecord);

    expect(canAccessInterviewIdentity(redacted)).toBe(false);
    expect(getInterviewCandidateDisplayLabel(redacted)).toBe("Candidate 4");
    expect(getInterviewCandidateContactLabel(redacted)).toBe("Contact restricted");
    expect(redacted).toMatchObject({
      candidate_full_name: "Candidate 4",
      candidate_email: null,
      candidate_phone: null,
      zoom_recording_url: null,
      zoom_passcode: null,
      transcript_text: null,
      transcript_file_bucket: null,
      transcript_file_path: null,
      created_by_user_id: null,
      updated_by_user_id: null,
      metadata: {
        hiring_recommendation: "proceed",
        next_step: "proceed",
      },
    });
    expect(JSON.stringify(redacted)).not.toContain("Alex Private");
    expect(JSON.stringify(redacted)).not.toContain("alex@example.com");
    expect(JSON.stringify(redacted)).not.toContain("private transcript");
    expect(JSON.stringify(redacted)).not.toContain("labor-interview-documents");
  });

  it("keeps interview identity fields for authorized users", () => {
    const rawRecord = {
      candidate_full_name: "Alex Private",
      candidate_email: "alex@example.com",
      can_access_identity: true,
    };

    const visible = redactInterviewRecordForIdentityAccess(rawRecord);

    expect(canAccessInterviewIdentity(visible)).toBe(true);
    expect(getInterviewCandidateDisplayLabel(visible)).toBe("Alex Private");
    expect(getInterviewCandidateContactLabel(visible)).toBe("alex@example.com");
  });

  it("keeps restricted interview views on the redacted data path", () => {
    const source = readFileSync(new URL("../kol/pages/LaborInterviewsPage.jsx", import.meta.url), "utf8");

    expect(source).toContain('supabase.rpc("get_labor_interview_records_redacted"');
    expect(source).toContain('select("id,location_id,template_id,template_version_id,candidate_position,interview_date,interview_time,status,metadata,created_at,updated_at")');
    expect(source).toContain("!canAccessInterviewIdentity(targetRecord, canManage)");
    expect(source).toContain("enabled: selectedRecordCanAccessIdentity");
    expect(source).toContain("<RestrictedInterviewDetail record={selectedRecord} />");
  });

  it("excludes unreviewed AI drafts from final PDF maps unless explicitly requested", () => {
    const responses = [
      {
        response_type: "pdf_field",
        pdf_field_name: "interview_notes",
        ai_draft_text: "Draft only",
        response_state: "ai_draft",
      },
      {
        response_type: "pdf_field",
        pdf_field_name: "approved_notes",
        response_text: "Reviewed answer",
        response_state: "ai_approved",
      },
      {
        response_type: "pdf_field",
        pdf_field_name: "rejected_notes",
        ai_draft_text: "Rejected draft",
        response_state: "rejected",
      },
    ];

    expect(buildPdfResponseMap(responses)).toMatchObject({
      approved_notes: "Reviewed answer",
    });
    expect(buildPdfResponseMap(responses).interview_notes).toBe("");
    expect(buildPdfResponseMap(responses, null, [], { includeDrafts: true })).toMatchObject({
      interview_notes: "Draft only",
      approved_notes: "Reviewed answer",
    });
    expect(buildPdfResponseMap(responses, null, [], { includeDrafts: true }).rejected_notes).toBe("");
  });

  it("can append an interview summary page to an exported PDF", async () => {
    const bytes = await createFillableInterviewPdf();
    const filled = await fillInterviewPdfBytes(bytes, {
      candidate_name: "Alexis Turner",
    }, {
      summaryPages: [{
        title: "Interview Summary",
        subtitle: "Alexis Turner - Supervisor",
        sections: [{ heading: "Guide Responses", bullets: ["Discussed scheduling judgment and supervisor communication."] }],
      }],
    });
    const pdfDoc = await PDFDocument.load(filled);

    expect(pdfDoc.getPageCount()).toBe(2);
  });

  it("continues long interview summary bullets onto additional pages", async () => {
    const bytes = await createFillableInterviewPdf();
    const longBullet = Array.from({ length: 900 }, (_, index) => `detail ${index + 1}`).join(" ");
    const filled = await fillInterviewPdfBytes(bytes, {}, {
      summaryPages: [{
        title: "Interview Summary",
        subtitle: "Alexis Turner - Supervisor",
        sections: [{ heading: "Call Summary", bullets: [longBullet] }],
      }],
    });
    const pdfDoc = await PDFDocument.load(filled);

    expect(pdfDoc.getPageCount()).toBeGreaterThan(2);
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
      metadata: { pay_rates: { min_rate: "18", max_rate: "20", notes: "DOE" } },
    };
    const questions = [
      { id: "q1", question_key: "availability", category: "Availability", prompt: "Are you available weekends?", sequence_order: 10 },
    ];

    const snapshot = buildInterviewTemplateSnapshot({ template, version, questions });
    questions[0].prompt = "Changed later";
    version.pdf_field_manifest.push({ name: "new_field", type: "text" });

    expect(snapshot.questions[0].prompt).toBe("Are you available weekends?");
    expect(snapshot.version.pdf_field_manifest).toHaveLength(1);
    expect(snapshot.version.metadata.pay_rates).toEqual({ min_rate: "18", max_rate: "20", notes: "DOE" });
  });
});

describe("interview pay rate helpers", () => {
  it("normalizes and formats role pay ranges for active interviews", () => {
    expect(normalizeInterviewPayRates({ minimum: "18", maximum: "20", note: "DOE" })).toEqual({
      min_rate: "18",
      max_rate: "20",
      notes: "DOE",
    });
    expect(formatInterviewPayRateRange({ min_rate: "18", max_rate: "20" })).toBe("$18-$20/hr");
    expect(formatInterviewPayRateSummary({ min_rate: "18.5", notes: "training rate" })).toBe("From $18.50/hr - training rate");
  });
});

describe("interview recommendation labels", () => {
  it("normalizes legacy hiring statuses to the two current manager decisions", () => {
    expect(getInterviewRecommendation({ metadata: { hiring_recommendation: "proceed" } })).toBe("approve");
    expect(getInterviewRecommendation({ metadata: { hiring_recommendation: "pass" } })).toBe("reject");
    expect(getInterviewRecommendation({ metadata: { hiring_recommendation: "hold" } })).toBe("pending");
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
    expect(shouldNormalizeInterviewAudioForStt(file)).toBe(true);
    expect(buildInterviewSttAudioFileName(file.name)).toBe("candidate-interview-stt.mp3");
  });

  it("encodes mono PCM samples as a 16-bit WAV file for STT normalization", () => {
    const wav = encodePcm16Wav(new Float32Array([-1, 0, 1]), INTERVIEW_STT_NORMALIZED_AUDIO_SAMPLE_RATE);
    const view = new DataView(wav);
    const ascii = (offset, length) => String.fromCharCode(...new Uint8Array(wav, offset, length));

    expect(ascii(0, 4)).toBe("RIFF");
    expect(ascii(8, 4)).toBe("WAVE");
    expect(ascii(12, 4)).toBe("fmt ");
    expect(ascii(36, 4)).toBe("data");
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(INTERVIEW_STT_NORMALIZED_AUDIO_SAMPLE_RATE);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(6);
  });

  it("accepts xAI-supported MKV containers and rejects unsupported WebM containers", () => {
    expect(validateInterviewAudioFile({ name: "candidate-interview.mkv", type: "", size: 25 * 1024 * 1024 })).toMatchObject({
      ok: true,
      contentType: "video/x-matroska",
    });
    expect(validateInterviewAudioFile({ name: "candidate-interview.webm", type: "", size: 25 * 1024 * 1024 })).toMatchObject({
      ok: false,
      error: "Upload a supported audio file: AAC, FLAC, M4A, MKV, MP3, MP4, OGG, OPUS, or WAV.",
    });
  });

  it("rejects audio files over the xAI STT interview limit", () => {
    const file = { name: "candidate-interview.mp3", type: "audio/mpeg", size: INTERVIEW_AUDIO_MAX_BYTES + 1 };

    expect(validateInterviewAudioFile(file)).toMatchObject({
      ok: false,
      error: "Interview audio must be 500 MB or smaller.",
    });
  });
});

describe("interview resume helpers", () => {
  it("accepts common resume formats and builds private interview resume paths", () => {
    const file = { name: "Jane Doe Resume.docx", type: "", size: 300 * 1024 };

    expect(validateInterviewResumeFile(file)).toMatchObject({
      ok: true,
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    expect(getInterviewResumeContentType(file)).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(buildInterviewResumePath({
      locationId: "11111111-1111-1111-1111-111111111111",
      interviewId: "record-123",
      fileName: file.name,
    })).toBe("11111111-1111-1111-1111-111111111111/interviews/record-123/resume/Jane-Doe-Resume.docx");
  });

  it("rejects unsupported or oversized resume files", () => {
    expect(validateInterviewResumeFile({ name: "resume.pages", type: "", size: 1000 })).toMatchObject({
      ok: false,
      error: "Upload a PDF, DOC, or DOCX resume.",
    });
    expect(validateInterviewResumeFile({ name: "resume.pdf", type: "application/pdf", size: INTERVIEW_RESUME_MAX_BYTES + 1 })).toMatchObject({
      ok: false,
      error: "Resume must be 25 MB or smaller.",
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

describe("interview transcript display helpers", () => {
  it("removes stray CJK characters from transcript text", () => {
    const raw = `${"Candidate said they can work weekends. ".repeat(35)}漢字`;
    const cleaned = cleanInterviewTranscriptText(raw);

    expect(cleaned).not.toContain("漢");
  });

  it("renders transcript turns only from provider turn metadata in the app path", () => {
    const withoutProviderTurns = getInterviewTranscriptTurns({
      transcript_text: "Speaker 1: Hello.\n\nSpeaker 2: Hi.",
      metadata: { audio_transcription: {} },
    });
    const withProviderTurns = getInterviewTranscriptTurns({
      metadata: {
        audio_transcription: {
          transcript_turns: [
            {
              id: "turn-1",
              speaker: 0,
              start: 1,
              end: 2,
              text: "Hello there.",
              words: [{ text: "Hello", start: 1, end: 1.4, speaker: 0 }, { text: "there.", start: 1.4, end: 2, speaker: 0 }],
            },
          ],
        },
      },
    });

    expect(withoutProviderTurns).toEqual([]);
    expect(withProviderTurns).toHaveLength(1);
    expect(withProviderTurns[0]).toMatchObject({ speaker: "Person 1", timestamp: "00:01", text: "Hello there." });
  });

  it("renders uploaded transcript text when the record source is upload or paste", () => {
    const turns = getInterviewTranscriptTurns({
      transcript_source: "upload",
      transcript_text: "Zack: Tell me about your leadership style.\n\nAlexis: I try to stay calm and direct.",
      metadata: { audio_transcription: {} },
    });

    expect(turns).toHaveLength(2);
    expect(turns[0]).toMatchObject({ speaker: "Zack", text: "Tell me about your leadership style." });
    expect(turns[1]).toMatchObject({ speaker: "Alexis", text: "I try to stay calm and direct." });
  });

  it("groups provider word-level diarization into speaker turns for review", () => {
    const turns = getInterviewTranscriptTurns({
      metadata: {
        audio_transcription: {
          segmentation_source: "xai_word_segments",
          transcript_turns: [
            { id: "w1", speaker: 0, start: 0, end: 0.2, text: "Hello", words: [{ text: "Hello", start: 0, end: 0.2, speaker: 0 }] },
            { id: "w2", speaker: 0, start: 0.2, end: 0.4, text: "there", words: [{ text: "there", start: 0.2, end: 0.4, speaker: 0 }] },
            { id: "w3", speaker: 1, start: 0.5, end: 0.8, text: "Hi", words: [{ text: "Hi", start: 0.5, end: 0.8, speaker: 1 }] },
          ],
        },
      },
    });

    expect(turns).toHaveLength(2);
    expect(turns[0]).toMatchObject({ speaker: "Person 1", text: "Hello there" });
    expect(turns[1]).toMatchObject({ speaker: "Person 2", text: "Hi" });
  });

  it("renders non-diarized provider text fallback turns", () => {
    const turns = getInterviewTranscriptTurns({
      transcript_text: "The candidate can work weekends and has prior kennel experience.",
      metadata: {
        audio_transcription: {
          segmentation_source: "xai_text_fallback",
          transcript_turns: [
            {
              id: "xai-text-fallback-0",
              speaker: "Transcript",
              start: null,
              end: null,
              text: "The candidate can work weekends and has prior kennel experience.",
              words: [],
            },
          ],
        },
      },
    });

    expect(turns).toHaveLength(1);
    expect(turns[0]).toMatchObject({
      speaker: "Transcript",
      text: "The candidate can work weekends and has prior kennel experience.",
      providerSegment: true,
    });
  });
});
