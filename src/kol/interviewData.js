import {
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFSignature,
  StandardFonts,
  PDFTextField,
  TextAlignment,
  rgb,
} from "pdf-lib";

export const LABOR_INTERVIEW_DOCUMENT_BUCKET = "labor-interview-documents";

export const LABOR_INTERVIEW_ROLES = [
  { value: "assistant_manager", label: "Assistant Manager" },
  { value: "customer_service_representative", label: "Customer Service Representative", shortLabel: "CSR" },
  { value: "supervisor", label: "Supervisor" },
  { value: "pet_care_technician", label: "Pet Care Technician", shortLabel: "PCT" },
];

export const LABOR_INTERVIEW_STATUS_LABELS = {
  draft: "Draft",
  in_progress: "In Progress",
  ai_drafted: "AI Drafted",
  reviewed: "Reviewed",
  completed: "Completed",
  archived: "Archived",
};

export const INTERVIEW_AI_REVIEW_MODES = [
  {
    value: "literal",
    label: "Literal",
    description: "Only direct answers or very clear rephrases of the guide question.",
  },
  {
    value: "inferred",
    label: "Inferred",
    description: "Use demonstrated behavior from the transcript when the exact question was not asked.",
  },
  {
    value: "speculative",
    label: "Speculative",
    description: "Looser trait matching, still grounded in transcript evidence.",
  },
];

export const INTERVIEW_AI_REVIEW_MODE_LABELS = INTERVIEW_AI_REVIEW_MODES.reduce((map, mode) => {
  map[mode.value] = mode.label;
  return map;
}, {});

export const INTERVIEW_RESPONSE_STATES = {
  blank: "Blank",
  manual: "Manual",
  ai_draft: "AI Draft",
  ai_approved: "Approved",
  merged_draft: "Merged Draft",
  rejected: "Rejected",
};

export const INTERVIEW_RECOMMENDATION_OPTIONS = [
  { value: "approve", label: "Approve", tone: "success" },
  { value: "reject", label: "Reject", tone: "danger" },
];

export const INTERVIEW_RECOMMENDATION_LABELS = {
  pending: "Unreviewed",
  approve: "Approve",
  reject: "Reject",
  proceed: "Approve",
  pass: "Reject",
  hold: "Unreviewed",
};

export const LABOR_INTERVIEW_TEMPLATE_STATUS_LABELS = {
  draft: "Draft",
  published: "Published",
  archived: "Archived",
};

export const PDF_VERIFICATION_LABELS = {
  missing_pdf: "Missing PDF",
  pending_verification: "Pending Verification",
  verified_fields: "Verified Fields",
  failed_no_fields: "No Fields Found",
  failed_invalid_pdf: "Invalid PDF",
};

export const INTERVIEW_PDF_ACCEPT = "application/pdf";
export const INTERVIEW_TRANSCRIPT_ACCEPT = ".txt,.vtt,text/plain,text/vtt";
export const INTERVIEW_AUDIO_ACCEPT = ".aac,.flac,.m4a,.mkv,.mp3,.mp4,.ogg,.opus,.wav,audio/*,video/mp4,video/x-matroska";
export const INTERVIEW_AUDIO_MAX_BYTES = 500 * 1024 * 1024;
export const INTERVIEW_AUDIO_MAX_LABEL = "500 MB";
export const INTERVIEW_STT_NORMALIZED_AUDIO_SAMPLE_RATE = 16000;
export const INTERVIEW_STT_NORMALIZED_AUDIO_MIME_TYPE = "audio/mpeg";

const INTERVIEW_AUDIO_EXTENSIONS = new Set(["aac", "flac", "m4a", "mkv", "mp3", "mp4", "ogg", "opus", "wav"]);
const INTERVIEW_AUDIO_CONTENT_TYPES = {
  aac: "audio/aac",
  flac: "audio/flac",
  m4a: "audio/mp4",
  mkv: "video/x-matroska",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  ogg: "audio/ogg",
  opus: "audio/opus",
  wav: "audio/wav",
};

export const INTERVIEW_AUDIO_ALLOWED_MIME_TYPES = [
  "audio/aac",
  "audio/flac",
  "audio/m4a",
  "audio/mp4",
  "audio/mpeg",
  "audio/mp3",
  "audio/ogg",
  "audio/opus",
  "audio/wav",
  "audio/x-matroska",
  "audio/x-m4a",
  "audio/x-wav",
  "video/mp4",
  "video/x-matroska",
  "application/x-matroska",
];

const PDF_FIELD_TYPE_LABELS = {
  text: "Text",
  checkbox: "Checkbox",
  radio: "Radio",
  dropdown: "Dropdown",
  option_list: "Option List",
  signature: "Signature",
  unknown: "Unknown",
};

const INTERVIEW_PDF_FIELD_GEOMETRY_OVERRIDES = {
  decision_move_forward: {
    matchRect: { x: 64, y: 347.6, width: 9.5, height: 10.5 },
    rect: { x: 62.5, y: 348, width: 8, height: 8 },
    align: TextAlignment.Center,
    fontSize: 7,
  },
  decision_request_second_interview: {
    matchRect: { x: 157, y: 347.6, width: 9.5, height: 10.5 },
    rect: { x: 156, y: 348, width: 8, height: 8 },
    align: TextAlignment.Center,
    fontSize: 7,
  },
  decision_move_forward_with_reservations: {
    matchRect: { x: 304, y: 347.6, width: 9.5, height: 10.5 },
    rect: { x: 303, y: 348, width: 8, height: 8 },
    align: TextAlignment.Center,
    fontSize: 7,
  },
  decision_do_not_move_forward: {
    matchRect: { x: 469, y: 347.6, width: 9.5, height: 10.5 },
    rect: { x: 468, y: 348, width: 8, height: 8 },
    align: TextAlignment.Center,
    fontSize: 7,
  },
  overall_score: {
    matchRect: { x: 318, y: 320.4, width: 58, height: 13 },
    rect: { x: 252, y: 320.4, width: 68, height: 13 },
    align: TextAlignment.Center,
    fontSize: 8.5,
  },
};

function cloneJson(value, fallback) {
  if (value == null) return fallback;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function isPdfRectNear(rect = {}, expected = {}, tolerance = 2) {
  return ["x", "y", "width", "height"].every((key) => {
    const actualValue = Number(rect[key]);
    const expectedValue = Number(expected[key]);
    return Number.isFinite(actualValue) && Number.isFinite(expectedValue) && Math.abs(actualValue - expectedValue) <= tolerance;
  });
}

function getInterviewPdfFieldGeometryOverride(fieldOrName, rect = null) {
  const fieldName = typeof fieldOrName === "string" ? fieldOrName : fieldOrName?.name;
  const override = INTERVIEW_PDF_FIELD_GEOMETRY_OVERRIDES[normalizeFieldName(fieldName)];
  if (!override) return null;
  const sourceRect = rect || fieldOrName?.rect;
  if (override.matchRect && !isPdfRectNear(sourceRect, override.matchRect)) return null;
  return override;
}

export function getInterviewPdfFieldDisplayRect(field = {}) {
  const override = getInterviewPdfFieldGeometryOverride(field);
  if (!override?.rect) return field.rect || null;
  return {
    ...(field.rect || {}),
    ...override.rect,
  };
}

function withInterviewPdfFieldGeometry(field = {}) {
  const rect = getInterviewPdfFieldDisplayRect(field);
  return rect && rect !== field.rect ? { ...field, rect } : field;
}

export function getInterviewRoleLabel(roleKey) {
  return LABOR_INTERVIEW_ROLES.find((role) => role.value === roleKey)?.label || roleKey || "Unknown Role";
}

export function getInterviewRecommendation(record = {}) {
  const raw = record?.metadata?.hiring_recommendation || record?.metadata?.next_step || "pending";
  if (raw === "proceed") return "approve";
  if (raw === "pass") return "reject";
  if (raw === "hold") return "pending";
  return raw;
}

export function getInterviewRecommendationOption(value) {
  return INTERVIEW_RECOMMENDATION_OPTIONS.find((option) => option.value === value)
    || { value: "pending", label: INTERVIEW_RECOMMENDATION_LABELS[value] || "Unreviewed", tone: "default" };
}

export function sanitizeInterviewFileName(value = "document.pdf") {
  const cleaned = String(value || "document.pdf")
    .trim()
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
  return cleaned || "document.pdf";
}

function getFileExtension(fileName = "") {
  const match = String(fileName || "").toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] || "";
}

export function getInterviewAudioContentType(file = {}) {
  const explicitType = String(file.type || "").trim().toLowerCase();
  if (explicitType && explicitType !== "application/octet-stream") return explicitType;
  return INTERVIEW_AUDIO_CONTENT_TYPES[getFileExtension(file.name)] || "";
}

export function shouldNormalizeInterviewAudioForStt(file = {}) {
  const extension = getFileExtension(file.name);
  const contentType = getInterviewAudioContentType(file);
  return extension === "m4a" || ["audio/m4a", "audio/mp4", "audio/x-m4a"].includes(contentType);
}

export function buildInterviewSttAudioFileName(fileName = "interview-audio") {
  const sanitized = sanitizeInterviewFileName(fileName || "interview-audio");
  const withoutExtension = sanitized.replace(/\.[^.]+$/, "");
  return `${withoutExtension || "interview-audio"}-stt.mp3`;
}

export function encodePcm16Wav(samples, sampleRate = INTERVIEW_STT_NORMALIZED_AUDIO_SAMPLE_RATE) {
  const safeSamples = samples instanceof Float32Array ? samples : new Float32Array(samples || []);
  const safeSampleRate = Math.max(1, Number(sampleRate) || INTERVIEW_STT_NORMALIZED_AUDIO_SAMPLE_RATE);
  const bytesPerSample = 2;
  const channelCount = 1;
  const dataSize = safeSamples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeAscii = (offset, value) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, safeSampleRate, true);
  view.setUint32(28, safeSampleRate * channelCount * bytesPerSample, true);
  view.setUint16(32, channelCount * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let index = 0; index < safeSamples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, Number(safeSamples[index]) || 0));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += bytesPerSample;
  }

  return buffer;
}

export function validateInterviewAudioFile(file) {
  if (!file) return { ok: false, error: "Choose an interview audio file first." };
  const extension = getFileExtension(file.name);
  const contentType = getInterviewAudioContentType(file);
  const isSupported = INTERVIEW_AUDIO_EXTENSIONS.has(extension)
    || INTERVIEW_AUDIO_ALLOWED_MIME_TYPES.includes(contentType);

  if (!isSupported) {
    return { ok: false, error: "Upload a supported audio file: AAC, FLAC, M4A, MKV, MP3, MP4, OGG, OPUS, or WAV." };
  }

  if (Number(file.size || 0) > INTERVIEW_AUDIO_MAX_BYTES) {
    return { ok: false, error: `Interview audio must be ${INTERVIEW_AUDIO_MAX_LABEL} or smaller.` };
  }

  return { ok: true, contentType };
}

export function buildInterviewTemplatePdfPath({ locationId, templateId, versionNo, fileName }) {
  return [
    locationId,
    "templates",
    templateId,
    `v${versionNo || 1}`,
    sanitizeInterviewFileName(fileName || "template.pdf"),
  ].filter(Boolean).join("/");
}

export function buildInterviewTranscriptPath({ locationId, interviewId, fileName }) {
  return [
    locationId,
    "interviews",
    interviewId,
    "transcripts",
    sanitizeInterviewFileName(fileName || "transcript.txt"),
  ].filter(Boolean).join("/");
}

export function buildInterviewAudioPath({ locationId, interviewId, fileName }) {
  return [
    locationId,
    "interviews",
    interviewId,
    "audio",
    sanitizeInterviewFileName(fileName || "interview-audio.m4a"),
  ].filter(Boolean).join("/");
}

export function buildInterviewArtifactPath({ locationId, interviewId, fileName }) {
  return [
    locationId,
    "interviews",
    interviewId,
    "artifacts",
    sanitizeInterviewFileName(fileName || "interview.pdf"),
  ].filter(Boolean).join("/");
}

export function normalizeInterviewCandidateDraft(draft = {}) {
  return {
    candidate_full_name: String(draft.candidate_full_name || "").trim(),
    candidate_email: String(draft.candidate_email || "").trim().toLowerCase() || null,
    candidate_phone: String(draft.candidate_phone || "").trim() || null,
    candidate_position: String(draft.candidate_position || "").trim(),
    interview_date: draft.interview_date || null,
    interview_time: draft.interview_time || null,
    interviewer_name: String(draft.interviewer_name || "").trim() || null,
    zoom_recording_url: String(draft.zoom_recording_url || "").trim() || null,
    zoom_passcode: String(draft.zoom_passcode || "").trim() || null,
  };
}

export function buildInterviewTemplateSnapshot({ template, version, questions }) {
  return {
    template: {
      id: template?.id || null,
      location_id: template?.location_id || null,
      role_key: template?.role_key || null,
      role_label: template?.role_label || null,
      description: template?.description || null,
    },
    version: {
      id: version?.id || null,
      version_no: version?.version_no || null,
      status: version?.status || null,
      pdf_verification_status: version?.pdf_verification_status || null,
      source_pdf_bucket: version?.source_pdf_bucket || null,
      source_pdf_path: version?.source_pdf_path || null,
      source_pdf_file_name: version?.source_pdf_file_name || null,
      pdf_page_count: version?.pdf_page_count || null,
      pdf_field_manifest: Array.isArray(version?.pdf_field_manifest) ? cloneJson(version.pdf_field_manifest, []) : [],
      metadata: cloneJson(version?.metadata, {}),
      published_at: version?.published_at || null,
    },
    questions: [...(questions || [])]
      .sort((a, b) => (a.sequence_order || 0) - (b.sequence_order || 0))
      .map((question) => ({
        id: question.id || null,
        question_key: question.question_key || null,
        category: question.category || "Interview",
        prompt: question.prompt || "",
        helper_text: question.helper_text || null,
        sequence_order: question.sequence_order || 0,
        required: !!question.required,
        answer_format: question.answer_format || "long_text",
        mapped_pdf_field_name: question.mapped_pdf_field_name || null,
        metadata: cloneJson(question.metadata, {}),
      })),
  };
}

export function questionRowsFromSnapshot(snapshot = {}) {
  const questions = Array.isArray(snapshot?.questions) ? snapshot.questions : [];
  return [...questions].sort((a, b) => (a.sequence_order || 0) - (b.sequence_order || 0));
}

export function pdfFieldsFromSnapshot(snapshot = {}) {
  const fields = snapshot?.version?.pdf_field_manifest || snapshot?.pdf_field_manifest || [];
  return Array.isArray(fields) ? fields.map(withInterviewPdfFieldGeometry).sort(sortPdfFields) : [];
}

export function groupQuestionsByCategory(questions = []) {
  return questions.reduce((groups, question) => {
    const category = question.category || "Interview";
    if (!groups[category]) groups[category] = [];
    groups[category].push(question);
    return groups;
  }, {});
}

export function normalizeQuestionKey(prompt = "", fallbackIndex = 0) {
  const base = String(prompt || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return base || `question_${fallbackIndex + 1}`;
}

export function getPdfFieldType(field) {
  if (field instanceof PDFTextField) return "text";
  if (field instanceof PDFCheckBox) return "checkbox";
  if (field instanceof PDFRadioGroup) return "radio";
  if (field instanceof PDFDropdown) return "dropdown";
  if (field instanceof PDFOptionList) return "option_list";
  if (field instanceof PDFSignature) return "signature";
  return "unknown";
}

export function getPdfFieldTypeLabel(type) {
  return PDF_FIELD_TYPE_LABELS[type] || PDF_FIELD_TYPE_LABELS.unknown;
}

function sortPdfFields(a, b) {
  const pageA = Number(a.page_number || 9999);
  const pageB = Number(b.page_number || 9999);
  if (pageA !== pageB) return pageA - pageB;
  const yA = Number(a.rect?.y || 0);
  const yB = Number(b.rect?.y || 0);
  if (yA !== yB) return yB - yA;
  return String(a.name || "").localeCompare(String(b.name || ""));
}

function getWidgetPageNumber(pdfDoc, widget) {
  try {
    const widgetRef = widget?.ref;
    const pageRef = typeof widget?.P === "function" ? widget.P() : null;
    const pages = pdfDoc.getPages();
    for (let index = 0; index < pages.length; index += 1) {
      const page = pages[index];
      if (pageRef && page.ref === pageRef) return index + 1;
      const annots = page.node.Annots();
      const annotRefs = annots?.asArray?.() || [];
      if (widgetRef && annotRefs.some((ref) => ref === widgetRef)) return index + 1;
    }
  } catch {
    return null;
  }
  return null;
}

function getWidgetRect(widget) {
  try {
    const rect = widget?.getRectangle?.();
    if (!rect) return null;
    return {
      x: Number(rect.x || 0),
      y: Number(rect.y || 0),
      width: Number(rect.width || 0),
      height: Number(rect.height || 0),
    };
  } catch {
    return null;
  }
}

function getPageSizeByNumber(pdfDoc, pageNumber) {
  try {
    const page = pdfDoc.getPage(Number(pageNumber || 1) - 1);
    const size = page?.getSize?.();
    if (!size) return null;
    return {
      width: Number(size.width || 0),
      height: Number(size.height || 0),
    };
  } catch {
    return null;
  }
}

function getFieldOptions(field, type) {
  try {
    if (type === "dropdown" || type === "option_list" || type === "radio") {
      return typeof field.getOptions === "function" ? field.getOptions() : [];
    }
  } catch {
    return [];
  }
  return [];
}

export async function extractPdfFieldManifest(pdfBytes) {
  try {
    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const form = pdfDoc.getForm();
    const fields = form.getFields();
    const manifest = fields.map((field) => {
      const widgets = field.acroField?.getWidgets?.() || [];
      const firstWidget = widgets[0] || null;
      const type = getPdfFieldType(field);
      const rect = getWidgetRect(firstWidget);
      const page_number = getWidgetPageNumber(pdfDoc, firstWidget);
      return withInterviewPdfFieldGeometry({
        name: field.getName(),
        type,
        type_label: getPdfFieldTypeLabel(type),
        page_number,
        page_size: getPageSizeByNumber(pdfDoc, page_number),
        rect,
        widget_count: widgets.length,
        options: getFieldOptions(field, type),
        required: !!field.isRequired?.(),
        read_only: !!field.isReadOnly?.(),
      });
    });
    return {
      ok: manifest.length > 0,
      status: manifest.length > 0 ? "verified_fields" : "failed_no_fields",
      pageCount: pdfDoc.getPageCount(),
      manifest: manifest.sort(sortPdfFields),
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      status: "failed_invalid_pdf",
      pageCount: null,
      manifest: [],
      error: error?.message || "Unable to read PDF form fields.",
    };
  }
}

function normalizeFieldName(value = "") {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function putIfValue(map, fieldName, value) {
  if (!fieldName || value == null || value === "") return;
  map[fieldName] = value;
}

export function buildInterviewMetadataPdfMap(record = {}, fields = []) {
  const map = {};
  const fullName = record.candidate_full_name || "";
  const position = record.candidate_position || record.template_snapshot?.template?.role_label || "";
  const interviewDate = record.interview_date || "";
  const interviewTime = record.interview_time || "";
  const interviewer = record.interviewer_name || "";
  const recommendationKey = getInterviewRecommendation(record);
  const recommendation = INTERVIEW_RECOMMENDATION_LABELS[recommendationKey] || "";
  const location = record.location_name || record.metadata?.location_name || record.metadata?.candidate_location || "";

  const aliases = {
    candidate_name: fullName,
    candidate_full_name: fullName,
    applicant_name: fullName,
    name: fullName,
    position,
    role: position,
    candidate_position: position,
    interview_date: interviewDate,
    date: interviewDate,
    interview_time: interviewTime,
    time: interviewTime,
    interviewer,
    interviewer_name: interviewer,
    scorecard_interviewer: interviewer,
    location,
    candidate_location: location,
    scorecard_date: interviewDate,
    recommendation,
    next_step: recommendation,
  };

  Object.entries(aliases).forEach(([name, value]) => putIfValue(map, name, value));

  (fields || []).forEach((field) => {
    const name = field?.name;
    const normalized = normalizeFieldName(name);
    if (!name || map[name]) return;
    const checkedValue = field?.type === "checkbox" ? "yes" : "X";
    if (/candidate.*name|applicant.*name|full.*name/.test(normalized)) putIfValue(map, name, fullName);
    else if (/position|role/.test(normalized)) putIfValue(map, name, position);
    else if (/scorecard.*date|interview.*date|date/.test(normalized)) putIfValue(map, name, interviewDate);
    else if (/interview.*time|time/.test(normalized)) putIfValue(map, name, interviewTime);
    else if (/interviewer|manager/.test(normalized)) putIfValue(map, name, interviewer);
    else if (/location/.test(normalized)) putIfValue(map, name, location);
    else if (/decision.*do.*not|do.*not.*move|pass|reject/.test(normalized)) putIfValue(map, name, ["pass", "reject"].includes(recommendationKey) ? checkedValue : "");
    else if (/decision.*reservation|move.*forward.*reservation|hold/.test(normalized)) putIfValue(map, name, "");
    else if (/decision.*second|second.*interview/.test(normalized)) putIfValue(map, name, "");
    else if (/decision.*move.*forward|move.*forward|proceed|approve/.test(normalized)) putIfValue(map, name, ["proceed", "approve"].includes(recommendationKey) ? checkedValue : "");
    else if (/recommend|decision|next.*step|status/.test(normalized)) putIfValue(map, name, recommendation);
  });

  return map;
}

export function getInterviewResponseState(response = {}) {
  const state = response?.response_state || "";
  if (INTERVIEW_RESPONSE_STATES[state]) return state;
  if (response?.metadata?.approved && String(response?.response_text || "").trim()) return "ai_approved";
  if (String(response?.response_text || "").trim()) return "manual";
  if (String(response?.ai_merged_text || "").trim()) return "merged_draft";
  if (String(response?.ai_draft_text || "").trim()) return "ai_draft";
  return "blank";
}

export function isInterviewResponseReviewed(response = {}) {
  const state = getInterviewResponseState(response);
  return state === "manual" || state === "ai_approved" || !!response?.metadata?.approved;
}

export function getInterviewOfficialResponseText(response = {}) {
  if (!response) return "";
  const responseText = String(response.response_text || "").trim();
  if (responseText && isInterviewResponseReviewed(response)) return responseText;
  return "";
}

export function getInterviewDraftResponseText(response = {}) {
  if (!response) return "";
  if (getInterviewResponseState(response) === "rejected") return "";
  if (getInterviewResponseState(response) === "merged_draft") {
    return response.ai_merged_text ?? response.response_text ?? response.ai_draft_text ?? "";
  }
  return response.response_text ?? response.ai_merged_text ?? response.ai_draft_text ?? "";
}

export function buildPdfResponseMap(responses = [], record = null, fields = [], options = {}) {
  const includeDrafts = !!options.includeDrafts;
  const initial = record ? buildInterviewMetadataPdfMap(record, fields) : {};
  return (responses || []).reduce((map, response) => {
    if (response?.response_type !== "pdf_field" || !response.pdf_field_name) return map;
    const text = includeDrafts ? getInterviewDraftResponseText(response) : getInterviewOfficialResponseText(response);
    if (text === "" && map[response.pdf_field_name]) return map;
    map[response.pdf_field_name] = text;
    return map;
  }, initial);
}

export function cleanInterviewTranscriptText(value = "") {
  return String(value || "")
    .replace(/[\u3400-\u9fff\u3040-\u30ff]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function secondsToTranscriptTimestamp(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) return "";
  const rounded = Math.floor(seconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remainder = rounded % 60;
  if (hours > 0) return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function normalizeProviderWord(word, index, turnId) {
  const text = cleanInterviewTranscriptText(word?.text || word?.word || word?.value || "");
  if (!text) return null;
  const startSeconds = Number(word?.start ?? word?.start_seconds ?? word?.start_time);
  const endSeconds = Number(word?.end ?? word?.end_seconds ?? word?.end_time);
  return {
    id: `${turnId}-w${index}`,
    text,
    startSeconds: Number.isFinite(startSeconds) ? startSeconds : null,
    endSeconds: Number.isFinite(endSeconds) ? endSeconds : null,
    speaker: word?.speaker ?? word?.speaker_id ?? null,
  };
}

function providerSpeakerLabel(value) {
  const raw = value == null || value === "" ? null : value;
  if (raw == null) return "Person";
  const numeric = Number(raw);
  if (Number.isInteger(numeric)) return `Person ${numeric + 1}`;
  const text = String(raw).trim();
  const speakerMatch = text.match(/speaker[_\s-]*(\d+)/i);
  if (speakerMatch) return `Person ${Number(speakerMatch[1]) + (speakerMatch[1] === "0" ? 1 : 0)}`;
  const personMatch = text.match(/person[_\s-]*(\d+)/i);
  if (personMatch) return `Person ${personMatch[1]}`;
  return text;
}

function normalizeProviderTranscriptTurns(turns = []) {
  if (!Array.isArray(turns)) return [];
  return turns.map((turn, index) => {
    const id = String(turn?.id || `provider-${index}`);
    const startSeconds = Number(turn?.startSeconds ?? turn?.start_seconds ?? turn?.start ?? turn?.start_time);
    const endSeconds = Number(turn?.endSeconds ?? turn?.end_seconds ?? turn?.end ?? turn?.end_time);
    const rawSpeaker = turn?.speaker_label ?? turn?.speaker ?? turn?.speaker_id;
    const speaker = providerSpeakerLabel(rawSpeaker);
    const words = (Array.isArray(turn?.words) ? turn.words : [])
      .map((word, wordIndex) => normalizeProviderWord(word, wordIndex, id))
      .filter(Boolean);
    const text = cleanInterviewTranscriptText(turn?.text || words.map((word) => word.text).join(" ") || "");
    if (!text) return null;
    const safeStart = Number.isFinite(startSeconds) ? startSeconds : (words[0]?.startSeconds ?? null);
    const safeEnd = Number.isFinite(endSeconds) ? endSeconds : (words[words.length - 1]?.endSeconds ?? null);
    return {
      id,
      timestamp: secondsToTranscriptTimestamp(safeStart),
      startSeconds: safeStart,
      endSeconds: safeEnd,
      speaker,
      text,
      words,
      estimatedTiming: false,
      providerSegment: true,
    };
  }).filter(Boolean);
}

function combineProviderWordTurns(turns = []) {
  const normalizedTurns = normalizeProviderTranscriptTurns(turns);
  const wordTurns = normalizedTurns.filter((turn) => Array.isArray(turn.words) && turn.words.length === 1);
  if (wordTurns.length !== normalizedTurns.length || wordTurns.length === 0) return normalizedTurns;
  const hasProviderSpeakers = wordTurns.some((turn) => turn.words[0]?.speaker != null || /^(Speaker|Person) \d+$/i.test(turn.speaker || ""));
  if (!hasProviderSpeakers) return normalizedTurns;
  const grouped = [];
  wordTurns.forEach((turn) => {
    const word = turn.words[0];
    const speaker = turn.speaker || "Person";
    const previous = grouped[grouped.length - 1];
    const gap = previous?.endSeconds != null && turn.startSeconds != null
      ? Number(turn.startSeconds) - Number(previous.endSeconds)
      : 0;
    if (previous && previous.speaker === speaker && gap <= 2.4) {
      previous.words.push(word);
      previous.text = cleanInterviewTranscriptText(`${previous.text} ${word.text}`);
      previous.endSeconds = turn.endSeconds ?? previous.endSeconds;
      previous.timestamp = secondsToTranscriptTimestamp(previous.startSeconds);
    } else {
      grouped.push({
        ...turn,
        id: `provider-speaker-turn-${grouped.length}`,
        words: [word],
      });
    }
  });
  return grouped;
}

function transcriptTextToTurns(text = "") {
  const cleaned = cleanInterviewTranscriptText(text);
  if (!cleaned) return [];
  return cleaned
    .split(/\n{2,}/)
    .map((paragraph, index) => {
      const speakerMatch = paragraph.match(/^([^:\n]{1,40}):\s*(.+)$/s);
      return {
        id: `uploaded-transcript-${index}`,
        timestamp: "",
        startSeconds: null,
        endSeconds: null,
        speaker: speakerMatch ? speakerMatch[1].trim() : "Transcript",
        text: speakerMatch ? cleanInterviewTranscriptText(speakerMatch[2]) : paragraph,
        words: [],
        estimatedTiming: true,
        providerSegment: false,
      };
    })
    .filter((turn) => turn.text);
}

export function getInterviewTranscriptTurns(record = {}) {
  const transcription = record?.metadata?.audio_transcription || {};
  const turns = transcription.transcript_turns || transcription.provider_turns || transcription.segments || [];
  if (transcription.segmentation_source === "xai_word_segments") return combineProviderWordTurns(turns);
  const providerTurns = normalizeProviderTranscriptTurns(turns);
  if (providerTurns.length) return providerTurns;
  if (["upload", "paste"].includes(record?.transcript_source) || record?.metadata?.transcript_upload) {
    return transcriptTextToTurns(record?.transcript_text || "");
  }
  return [];
}

function getPdfTextAppearanceValue(fieldName, value) {
  const textValue = value == null ? "" : String(value);
  const normalized = normalizeFieldName(fieldName);
  if (/^decision_/.test(normalized) && ["true", "yes", "checked", "1", "x"].includes(textValue.trim().toLowerCase())) {
    return "X";
  }
  if (textValue && /interviewer|manager/.test(normalized)) {
    return `  ${textValue}`;
  }
  return textValue;
}

function prepareInterviewTextField(field, fieldName, value) {
  const textValue = String(value || "");
  const normalized = normalizeFieldName(fieldName);
  if (/candidate.*name|applicant.*name|interviewer|manager|date|time|location|scorecard.*interviewer|scorecard.*date/.test(normalized)) {
    return;
  }
  try {
    if (textValue.includes("\n") || textValue.length > 70) field.enableMultiline();
  } catch {
    // Some imported fields may not allow changing multiline flags.
  }
  try {
    if (/^score_/.test(normalized) && !/^score_notes_/.test(normalized)) field.setFontSize(8.5);
    else if (textValue.length > 120 || textValue.includes("\n")) field.setFontSize(7.4);
    else field.setFontSize(8.2);
  } catch {
    // Keep filling even if one field rejects appearance changes.
  }
}

function applyInterviewPdfFieldGeometry(field) {
  const name = field?.getName?.();
  try {
    const widgets = field.acroField?.getWidgets?.() || [];
    widgets.forEach((widget) => {
      const current = widget.getRectangle?.() || {};
      const override = getInterviewPdfFieldGeometryOverride(name, current);
      if (!override) return;
      widget.setRectangle?.({
        x: Number(override.rect?.x ?? current.x ?? 0),
        y: Number(override.rect?.y ?? current.y ?? 0),
        width: Number(override.rect?.width ?? current.width ?? 0),
        height: Number(override.rect?.height ?? current.height ?? 0),
      });
      if (field instanceof PDFTextField) {
        if (override.align != null) field.setAlignment(override.align);
        if (override.fontSize) field.setFontSize(override.fontSize);
      }
    });
  } catch {
    // A malformed widget should not block the rest of the PDF from filling.
  }
}

function wrapPdfLine(text, maxChars) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  });
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

async function appendInterviewSummaryPages(pdfDoc, summaryPages = []) {
  const pages = Array.isArray(summaryPages) ? summaryPages.filter(Boolean) : [];
  if (!pages.length) return;
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const titleColor = rgb(0.09, 0.14, 0.23);
  const bodyColor = rgb(0.19, 0.24, 0.33);
  const mutedColor = rgb(0.44, 0.5, 0.58);
  const marginX = 54;
  const marginTop = 58;
  const marginBottom = 58;
  const lineHeight = 14;
  const maxChars = 88;

  const addPage = () => {
    const page = pdfDoc.addPage([612, 792]);
    return { page, y: 792 - marginTop };
  };

  let context = addPage();
  const ensureSpace = (needed = lineHeight) => {
    if (context.y - needed < marginBottom) context = addPage();
  };

  pages.forEach((summary, pageIndex) => {
    if (pageIndex > 0) context = addPage();
    const title = String(summary.title || "Interview Summary");
    context.page.drawText(title, {
      x: marginX,
      y: context.y,
      size: 18,
      font: boldFont,
      color: titleColor,
    });
    context.y -= 22;

    if (summary.subtitle) {
      context.page.drawText(String(summary.subtitle), {
        x: marginX,
        y: context.y,
        size: 9,
        font,
        color: mutedColor,
      });
      context.y -= 22;
    } else {
      context.y -= 8;
    }

    (summary.sections || []).forEach((section) => {
      const heading = String(section.heading || "").trim();
      const bullets = (Array.isArray(section.bullets) ? section.bullets : [])
        .map((item) => String(item || "").trim())
        .filter(Boolean);
      if (!heading && !bullets.length) return;
      ensureSpace(28);
      if (heading) {
        context.page.drawText(heading, {
          x: marginX,
          y: context.y,
          size: 11,
          font: boldFont,
          color: titleColor,
        });
        context.y -= 16;
      }
      bullets.forEach((bullet) => {
        const lines = wrapPdfLine(bullet.replace(/^[-*]\s*/, ""), maxChars);
        ensureSpace(lines.length * lineHeight + 4);
        context.page.drawText("-", {
          x: marginX + 4,
          y: context.y,
          size: 10,
          font,
          color: bodyColor,
        });
        lines.forEach((line, index) => {
          context.page.drawText(line, {
            x: marginX + 18,
            y: context.y - (index * lineHeight),
            size: 10,
            font,
            color: bodyColor,
          });
        });
        context.y -= (lines.length * lineHeight) + 4;
      });
      context.y -= 6;
    });
  });
}

export async function fillInterviewPdfBytes(pdfBytes, responseMap = {}, { flatten = false, summaryPages = [] } = {}) {
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const form = pdfDoc.getForm();
  const fields = form.getFields();
  fields.forEach((field) => {
    const name = field.getName();
    applyInterviewPdfFieldGeometry(field);
    if (!Object.prototype.hasOwnProperty.call(responseMap, name)) return;
    const value = responseMap[name];
    const textValue = value == null ? "" : String(value);
    try {
      if (field instanceof PDFTextField) {
        prepareInterviewTextField(field, name, textValue);
        field.setText(getPdfTextAppearanceValue(name, textValue));
      } else if (field instanceof PDFCheckBox) {
        if (["true", "yes", "checked", "1", "x"].includes(textValue.trim().toLowerCase())) field.check();
        else field.uncheck();
      } else if (field instanceof PDFRadioGroup || field instanceof PDFDropdown || field instanceof PDFOptionList) {
        if (textValue) field.select(textValue);
      }
    } catch {
      // Keep the rest of the form fillable if a single field value is invalid.
    }
  });
  form.updateFieldAppearances();
  if (flatten) form.flatten();
  await appendInterviewSummaryPages(pdfDoc, summaryPages);
  return pdfDoc.save();
}

export async function countInterviewPdfPages(pdfBytes) {
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  return pdfDoc.getPageCount();
}

export function validateAiDraftPayload(payload, targetMap, maxLength = 1400) {
  if (!payload || !Array.isArray(payload.responses)) {
    return { ok: false, responses: [], errors: ["AI response was not a responses array."] };
  }
  const errors = [];
  const responses = [];
  payload.responses.forEach((item, index) => {
    const targetType = item?.target_type;
    const key = targetType === "pdf_field" ? item?.pdf_field_name : item?.question_key;
    const target = targetMap.get(`${targetType}:${key}`);
    if (!target) {
      errors.push(`Unknown target at response ${index + 1}.`);
      return;
    }
    const draftText = String(item?.draft_text || "").trim().slice(0, maxLength);
    const confidence = Number(item?.confidence);
    responses.push({
      target_type: targetType,
      question_key: targetType === "custom_question" ? key : null,
      pdf_field_name: targetType === "pdf_field" ? key : null,
      draft_text: draftText,
      confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : null,
      evidence: Array.isArray(item?.evidence)
        ? item.evidence.map((entry) => String(entry || "").slice(0, 240)).filter(Boolean).slice(0, 3)
        : [],
      prompt_snapshot: target.prompt || target.name || key,
    });
  });
  return { ok: errors.length === 0, responses, errors };
}
