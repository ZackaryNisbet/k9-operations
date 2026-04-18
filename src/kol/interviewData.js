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

export function sanitizeInterviewFileName(value = "document.pdf") {
  const cleaned = String(value || "document.pdf")
    .trim()
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
  return cleaned || "document.pdf";
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

export function buildPdfResponseMap(responses = []) {
  return (responses || []).reduce((map, response) => {
    if (response?.response_type !== "pdf_field" || !response.pdf_field_name) return map;
    const text = response.response_text ?? response.ai_draft_text ?? "";
    map[response.pdf_field_name] = text;
    return map;
  }, {});
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
