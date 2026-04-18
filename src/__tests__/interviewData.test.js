import { PDFDocument } from "pdf-lib";
import {
  buildPdfResponseMap,
  buildInterviewTemplateSnapshot,
  cleanInterviewTranscriptText,
  extractPdfFieldManifest,
  fillInterviewPdfBytes,
  getInterviewAudioContentType,
  getInterviewRecommendation,
  getInterviewTranscriptTurns,
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

  it("adds candidate metadata defaults for common PDF identity fields", () => {
    const map = buildPdfResponseMap([], {
      candidate_full_name: "Lahayla Kern",
      candidate_position: "Pet Care Technician",
      interview_date: "2026-04-12",
      interviewer_name: "Skyler Brooks",
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
      interviewer_name: "Skyler Brooks",
      decision_move_forward: "X",
    });
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
});
