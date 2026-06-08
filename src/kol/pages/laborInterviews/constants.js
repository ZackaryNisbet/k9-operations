// Shared constants for the Labor Interviews workspace.
// Extracted verbatim from LaborInterviewsPage.jsx (pure module-level constants).

export const INTERVIEW_WAVEFORM_BAR_COUNT = 72;

export const INTERVIEW_WAVEFORM_DECODE_MAX_SECONDS = 8 * 60;

export const INTERVIEW_WAVEFORM_DECODE_MAX_BYTES = 8 * 1024 * 1024;

export const CUSTOM_SUMMARY_SECTION_PREFIX = "custom_page_";

export const SUMMARY_SECTION_KEYS = new Set([
  "call_summary",
  "scorecard",
  "reviewed_guide_responses",
  "reviewed_custom_questions",
]);

export const DOCUMENT_PDF_INSTRUCTION_KEY = "__document";

export const PDF_POINT_TO_CSS_PX = 96 / 72;

export const GUIDE_AI_WORK_STEPS = [
  "Reading the transcript",
  "Checking PDF fields",
  "Mapping evidence",
  "Saving guide updates",
];
