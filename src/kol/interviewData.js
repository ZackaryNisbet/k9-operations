import {
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFSignature,
  PDFTextField,
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

export const INTERVIEW_RECOMMENDATION_OPTIONS = [
  { value: "pending", label: "Needs Review", tone: "default" },
  { value: "proceed", label: "Proceed", tone: "success" },
  { value: "hold", label: "Hold", tone: "warning" },
  { value: "pass", label: "Pass", tone: "danger" },
];

export const INTERVIEW_RECOMMENDATION_LABELS = INTERVIEW_RECOMMENDATION_OPTIONS.reduce((map, option) => {
  map[option.value] = option.label;
  return map;
}, {});

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

function cloneJson(value, fallback) {
  if (value == null) return fallback;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

export function getInterviewRoleLabel(roleKey) {
  return LABOR_INTERVIEW_ROLES.find((role) => role.value === roleKey)?.label || roleKey || "Unknown Role";
}

export function getInterviewRecommendation(record = {}) {
  return record?.metadata?.hiring_recommendation || record?.metadata?.next_step || "pending";
}

export function getInterviewRecommendationOption(value) {
  return INTERVIEW_RECOMMENDATION_OPTIONS.find((option) => option.value === value)
    || INTERVIEW_RECOMMENDATION_OPTIONS[0];
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
  return Array.isArray(fields) ? [...fields].sort(sortPdfFields) : [];
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
      return {
        name: field.getName(),
        type,
        type_label: getPdfFieldTypeLabel(type),
        page_number: getWidgetPageNumber(pdfDoc, firstWidget),
        rect,
        widget_count: widgets.length,
        options: getFieldOptions(field, type),
        required: !!field.isRequired?.(),
        read_only: !!field.isReadOnly?.(),
      };
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
    else if (/decision.*do.*not|do.*not.*move|pass/.test(normalized)) putIfValue(map, name, recommendationKey === "pass" ? checkedValue : "");
    else if (/decision.*reservation|move.*forward.*reservation|hold/.test(normalized)) putIfValue(map, name, recommendationKey === "hold" ? checkedValue : "");
    else if (/decision.*second|second.*interview/.test(normalized)) putIfValue(map, name, "");
    else if (/decision.*move.*forward|move.*forward|proceed/.test(normalized)) putIfValue(map, name, recommendationKey === "proceed" ? checkedValue : "");
    else if (/recommend|decision|next.*step|status/.test(normalized)) putIfValue(map, name, recommendation);
  });

  return map;
}

export function buildPdfResponseMap(responses = [], record = null, fields = []) {
  const initial = record ? buildInterviewMetadataPdfMap(record, fields) : {};
  return (responses || []).reduce((map, response) => {
    if (response?.response_type !== "pdf_field" || !response.pdf_field_name) return map;
    const text = response.response_text ?? response.ai_draft_text ?? "";
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

function normalizeProviderTranscriptTurns(turns = []) {
  if (!Array.isArray(turns)) return [];
  return turns.map((turn, index) => {
    const id = String(turn?.id || `provider-${index}`);
    const startSeconds = Number(turn?.startSeconds ?? turn?.start_seconds ?? turn?.start ?? turn?.start_time);
    const endSeconds = Number(turn?.endSeconds ?? turn?.end_seconds ?? turn?.end ?? turn?.end_time);
    const rawSpeaker = turn?.speaker_label ?? turn?.speaker ?? turn?.speaker_id;
    const numericSpeaker = Number(rawSpeaker);
    const speaker = rawSpeaker == null || rawSpeaker === ""
      ? "Speaker"
      : Number.isInteger(numericSpeaker) ? `Speaker ${numericSpeaker + 1}` : String(rawSpeaker);
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

export function getInterviewTranscriptTurns(record = {}) {
  const transcription = record?.metadata?.audio_transcription || {};
  return normalizeProviderTranscriptTurns(
    transcription.transcript_turns || transcription.provider_turns || transcription.segments || [],
  );
}

export async function fillInterviewPdfBytes(pdfBytes, responseMap = {}, { flatten = false } = {}) {
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const form = pdfDoc.getForm();
  const fields = form.getFields();
  fields.forEach((field) => {
    const name = field.getName();
    if (!Object.prototype.hasOwnProperty.call(responseMap, name)) return;
    const value = responseMap[name];
    const textValue = value == null ? "" : String(value);
    try {
      if (field instanceof PDFTextField) {
        field.setText(textValue);
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
  return pdfDoc.save();
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
