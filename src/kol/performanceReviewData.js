import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export const PERFORMANCE_REVIEW_CYCLES = [
  { id: "30_day", label: "30 Day", shortLabel: "30", sectionKey: "thirty_day", dueDateKey: "review_30_due_date", statusKey: "review_30_status" },
  { id: "60_day", label: "60 Day", shortLabel: "60", sectionKey: "sixty_day", dueDateKey: "review_60_due_date", statusKey: "review_60_status" },
  { id: "90_day", label: "90 Day", shortLabel: "90", sectionKey: "ninety_day", dueDateKey: "review_90_due_date", statusKey: "review_90_status" },
];

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;

const COMMON_IDENTITY_HEADER = {
  page: 1,
  fontSize: 8.5,
  fields: {
    employee_name: { label: "Employee", x: 72, y: 643, width: 155, height: 11 },
    position_title: { label: "Position", x: 250, y: 643, width: 155, height: 11 },
    review_checkpoint: { label: "Review", x: 430, y: 643, width: 110, height: 11 },
    start_date: { label: "Start Date", x: 72, y: 629, width: 155, height: 11 },
    review_date: { label: "Review Date", x: 250, y: 629, width: 155, height: 11 },
    location_name: { label: "Location", x: 430, y: 629, width: 110, height: 11 },
  },
};

const RATING_CHOICES = {
  meets_expectations: { checkboxX: 72 },
  needs_improvement: { checkboxX: 208.8 },
  exceeds_expectations: { checkboxX: 349.6 },
  checkboxSize: 9,
};

export const PERFORMANCE_REVIEW_TEMPLATES = {
  assistant_manager: {
    roleKey: "assistant_manager",
    roleLabel: "Assistant Manager",
    pdfUrl: "/labor/performance-review-templates/am-30-60-90-review.pdf",
    sourcePdfName: "AM 30 60 90 Day Review Template.pdf",
    sections: {
      thirty_day: {
        page: 1,
        ratingCheckboxY: 306.9,
        notesRect: { x: 72, y: 152, width: 468, height: 98 },
        initials: { employee: { x: 264, y: 130, width: 62, height: 14 } },
      },
      sixty_day: {
        page: 2,
        ratingCheckboxY: 483.6,
        notesRect: { x: 72, y: 354, width: 468, height: 74 },
        initials: { employee: { x: 264, y: 332, width: 62, height: 14 } },
      },
      ninety_day: {
        rating: { page: 2, checkboxY: 102.5 },
        notesRect: { page: 3, x: 72, y: 618, width: 468, height: 70 },
        initials: { page: 3, employee: { x: 264, y: 597, width: 62, height: 14 } },
      },
      overall_summary: {
        page: 3,
        ratingCheckboxY: 477.1,
        commentsRect: { x: 72, y: 374, width: 468, height: 66 },
      },
      final_signatures: {
        page: 3,
        employee: { signatureRect: { x: 132, y: 321, width: 128, height: 20 }, dateRect: { x: 300, y: 321, width: 75, height: 20 } },
      },
    },
  },
  customer_service_representative: {
    roleKey: "customer_service_representative",
    roleLabel: "Customer Service Representative",
    pdfUrl: "/labor/performance-review-templates/csr-30-60-90-review.pdf",
    sourcePdfName: "CSR 30 60 90 Day Review Template.pdf",
    sections: {
      thirty_day: {
        page: 1,
        ratingCheckboxY: 306.9,
        notesRect: { x: 72, y: 152, width: 468, height: 98 },
        initials: { employee: { x: 264, y: 130, width: 62, height: 14 } },
      },
      sixty_day: {
        page: 2,
        ratingCheckboxY: 483.6,
        notesRect: { x: 72, y: 354, width: 468, height: 74 },
        initials: { employee: { x: 264, y: 332, width: 62, height: 14 } },
      },
      ninety_day: {
        rating: { page: 2, checkboxY: 85.5 },
        notesRect: { page: 3, x: 72, y: 592, width: 468, height: 70 },
        initials: { page: 3, employee: { x: 264, y: 572, width: 62, height: 14 } },
      },
      overall_summary: {
        page: 3,
        ratingCheckboxY: 452.1,
        commentsRect: { x: 72, y: 349, width: 468, height: 66 },
      },
      final_signatures: {
        page: 3,
        employee: { signatureRect: { x: 132, y: 296, width: 128, height: 20 }, dateRect: { x: 300, y: 296, width: 75, height: 20 } },
      },
    },
  },
  general_manager: {
    roleKey: "general_manager",
    roleLabel: "General Manager",
    pdfUrl: "/labor/performance-review-templates/gm-30-60-90-review.pdf",
    sourcePdfName: "GM 30 60 90 Day Review Template.pdf",
    sections: {
      thirty_day: {
        page: 1,
        ratingCheckboxY: 154.1,
        notesRect: { x: 72, y: 72, width: 468, height: 34 },
        initials: { page: 2, employee: { x: 347, y: 619, width: 62, height: 14 } },
      },
      sixty_day: {
        page: 2,
        ratingCheckboxY: 248.8,
        notesRect: { x: 72, y: 119, width: 468, height: 70 },
        initials: { employee: { x: 347, y: 98, width: 62, height: 14 } },
      },
      ninety_day: {
        page: 3,
        ratingCheckboxY: 421.4,
        notesRect: { x: 72, y: 292, width: 468, height: 70 },
        initials: { employee: { x: 347, y: 272, width: 62, height: 14 } },
      },
      overall_summary: {
        page: 3,
        ratingCheckboxY: 152.1,
        commentsRect: { x: 72, y: 72, width: 468, height: 42 },
      },
      final_signatures: {
        page: 4,
        employee: { signatureRect: { x: 171, y: 639, width: 128, height: 20 }, dateRect: { x: 335, y: 639, width: 75, height: 20 } },
      },
    },
  },
  pet_care_technician: {
    roleKey: "pet_care_technician",
    roleLabel: "Pet Care Technician",
    pdfUrl: "/labor/performance-review-templates/pct-30-60-90-review.pdf",
    sourcePdfName: "PCT 30 60 90 Day Review Template.pdf",
    sections: {
      thirty_day: {
        page: 1,
        ratingCheckboxY: 289.9,
        notesRect: { x: 72, y: 137, width: 468, height: 98 },
        initials: { employee: { x: 264, y: 113, width: 62, height: 14 } },
      },
      sixty_day: {
        page: 2,
        ratingCheckboxY: 441.6,
        notesRect: { x: 72, y: 312, width: 468, height: 70 },
        initials: { employee: { x: 264, y: 290, width: 62, height: 14 } },
      },
      ninety_day: {
        page: 3,
        ratingCheckboxY: 679.7,
        notesRect: { x: 72, y: 552, width: 468, height: 70 },
        initials: { employee: { x: 264, y: 530, width: 62, height: 14 } },
      },
      overall_summary: {
        page: 3,
        ratingCheckboxY: 410.4,
        commentsRect: { x: 72, y: 307, width: 468, height: 66 },
      },
      final_signatures: {
        page: 3,
        employee: { signatureRect: { x: 132, y: 253, width: 128, height: 20 }, dateRect: { x: 300, y: 253, width: 75, height: 20 } },
      },
    },
  },
  supervisor: {
    roleKey: "supervisor",
    roleLabel: "Supervisor",
    pdfUrl: "/labor/performance-review-templates/supervisor-30-60-90-review.pdf",
    sourcePdfName: "Supervisor 30 60 90 Day Review Template.pdf",
    sections: {
      thirty_day: {
        page: 1,
        ratingCheckboxY: 306.9,
        notesRect: { x: 72, y: 152, width: 468, height: 98 },
        initials: { employee: { x: 264, y: 130, width: 62, height: 14 } },
      },
      sixty_day: {
        page: 2,
        ratingCheckboxY: 466.6,
        notesRect: { x: 72, y: 337, width: 468, height: 70 },
        initials: { employee: { x: 264, y: 315, width: 62, height: 14 } },
      },
      ninety_day: {
        rating: { page: 2, checkboxY: 85.5 },
        notesRect: { page: 3, x: 72, y: 592, width: 468, height: 70 },
        initials: { page: 3, employee: { x: 264, y: 572, width: 62, height: 14 } },
      },
      overall_summary: {
        page: 3,
        ratingCheckboxY: 452.1,
        commentsRect: { x: 72, y: 349, width: 468, height: 66 },
      },
      final_signatures: {
        page: 3,
        employee: { signatureRect: { x: 132, y: 296, width: 128, height: 20 }, dateRect: { x: 300, y: 296, width: 75, height: 20 } },
      },
    },
  },
};

function normalizeTitle(value = "") {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizePerformanceReviewRole(value = "") {
  const title = normalizeTitle(value);
  if (!title) return "";
  if (/(general manager|\bgm\b)/.test(title)) return "general_manager";
  if (/(assistant manager|\bagm\b|\bam\b)/.test(title)) return "assistant_manager";
  if (/(customer service representative|\bcsr\b|front desk|guest service)/.test(title)) return "customer_service_representative";
  if (/(supervisor|shift lead|\blead\b)/.test(title)) return "supervisor";
  if (/(pet care technician|\bpct\b|technician|kennel)/.test(title)) return "pet_care_technician";
  return "";
}

export function resolvePerformanceReviewTemplate(employeeOrPosition) {
  const position = typeof employeeOrPosition === "string"
    ? employeeOrPosition
    : employeeOrPosition?.position_title || employeeOrPosition?.target_role || "";
  return PERFORMANCE_REVIEW_TEMPLATES[normalizePerformanceReviewRole(position)] || null;
}

export function getPerformanceReviewCycle(cycleId) {
  return PERFORMANCE_REVIEW_CYCLES.find((cycle) => cycle.id === cycleId) || PERFORMANCE_REVIEW_CYCLES[0];
}

function parseDateOnly(value) {
  const text = String(value || "");
  if (!text) return "";
  return text.includes("T") ? text.split("T")[0] : text;
}

function isPastDue(dateValue, todayValue = null) {
  const date = parseDateOnly(dateValue);
  if (!date) return false;
  const today = todayValue || new Date().toISOString().slice(0, 10);
  return date < today;
}

function isReviewDone(status) {
  return ["complete", "completed", "current", "signed"].includes(String(status || "").toLowerCase());
}

export function getPerformanceReviewCycleStatus(row = {}, cycleId, todayValue = null) {
  const cycle = getPerformanceReviewCycle(cycleId);
  const dueDate = parseDateOnly(row?.[cycle.dueDateKey]);
  const status = String(row?.[cycle.statusKey] || "not_started").toLowerCase();
  const overdue = !isReviewDone(status) && (status === "overdue" || isPastDue(dueDate, todayValue));
  return {
    ...cycle,
    dueDate,
    status,
    overdue,
    completed: isReviewDone(status),
  };
}

export function getPerformanceReviewCompliance(row = {}, todayValue = null) {
  const cycleRows = PERFORMANCE_REVIEW_CYCLES.map((cycle) => getPerformanceReviewCycleStatus(row, cycle.id, todayValue));
  const overdueRows = cycleRows.filter((cycle) => cycle.overdue);
  const hasAnyDueDate = cycleRows.some((cycle) => cycle.dueDate);

  if (overdueRows.length > 0) {
    return {
      label: "Non-compliant",
      color: "danger",
      tone: "danger",
      detail: `${overdueRows.map((cycle) => cycle.label).join(", ")} overdue`,
      overdueCount: overdueRows.length,
      cycleRows,
    };
  }

  if (!hasAnyDueDate) {
    return {
      label: "Needs setup",
      color: "warning",
      tone: "warning",
      detail: "Missing review schedule",
      overdueCount: 0,
      cycleRows,
    };
  }

  return {
    label: "Compliant",
    color: "success",
    tone: "success",
    detail: "No overdue reviews",
    overdueCount: 0,
    cycleRows,
  };
}

function normalizeRatingChoice(value = "") {
  const text = normalizeTitle(value).replace(/[^a-z0-9]+/g, "_");
  if (/needs.*improvement|improvement/.test(text)) return "needs_improvement";
  if (/exceeds|excellent|above/.test(text)) return "exceeds_expectations";
  return "meets_expectations";
}

function truncateText(value = "", maxLength = 2000) {
  return String(value || "").trim().slice(0, maxLength);
}

function formatDateForPdf(value) {
  const date = parseDateOnly(value);
  if (!date) return "";
  const [year, month, day] = date.split("-");
  if (!year || !month || !day) return date;
  return `${month}/${day}/${year}`;
}

function getReviewMetadata(reviewInstance = {}) {
  return reviewInstance?.metadata && typeof reviewInstance.metadata === "object" ? reviewInstance.metadata : {};
}

export function buildPerformanceReviewDraftFromInstance(reviewInstance = {}, responses = []) {
  const metadata = getReviewMetadata(reviewInstance);
  const responseText = (responses || [])
    .map((response) => truncateText(response.response_text || response.rating_value || "", 400))
    .filter(Boolean)
    .join("\n");

  return {
    rating: metadata.performance_review_rating || metadata.review_rating || "",
    managerNotes: metadata.manager_notes || responseText,
    actionPlan: metadata.action_plan || "",
    overallRating: metadata.overall_rating || metadata.performance_review_rating || metadata.review_rating || "",
    overallComments: metadata.overall_comments || metadata.summary_comments || "",
  };
}

function pageForRect(section, rect) {
  return rect.page || section.page || 1;
}

function pdfPage(pdfDoc, pageNumber) {
  return pdfDoc.getPage(Math.max(0, Number(pageNumber || 1) - 1));
}

function drawText(page, text, x, y, options = {}) {
  if (!text) return;
  page.drawText(String(text), {
    x,
    y,
    size: options.size || 8.5,
    font: options.font,
    color: options.color || rgb(0.07, 0.12, 0.18),
    maxWidth: options.maxWidth,
  });
}

function wrapText(text, font, size, maxWidth) {
  const words = String(text || "").replace(/\r\n/g, "\n").split(/\s+/);
  const lines = [];
  let current = "";
  words.forEach((word) => {
    if (!word) return;
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      return;
    }
    if (current) lines.push(current);
    current = word;
  });
  if (current) lines.push(current);
  return lines;
}

function drawWrappedText(page, text, rect, font, options = {}) {
  const size = options.size || 8;
  const lineHeight = options.lineHeight || size * 1.24;
  const maxLines = Math.max(1, Math.floor(rect.height / lineHeight));
  const lines = String(text || "")
    .split(/\n+/)
    .flatMap((paragraph) => wrapText(paragraph, font, size, rect.width))
    .slice(0, maxLines);
  let cursorY = rect.y + rect.height - size;
  lines.forEach((line) => {
    drawText(page, line, rect.x, cursorY, { ...options, size, font, maxWidth: rect.width });
    cursorY -= lineHeight;
  });
}

function drawIdentityHeader(pdfDoc, font, payload) {
  const page = pdfPage(pdfDoc, COMMON_IDENTITY_HEADER.page);
  const fieldValues = {
    employee_name: payload.employeeName,
    position_title: payload.positionTitle,
    review_checkpoint: payload.reviewCheckpoint,
    start_date: formatDateForPdf(payload.startDate),
    review_date: formatDateForPdf(payload.reviewDate),
    location_name: payload.locationName,
  };
  Object.entries(COMMON_IDENTITY_HEADER.fields).forEach(([key, field]) => {
    drawText(page, `${field.label}:`, field.x, field.y, { font, size: 6.8, color: rgb(0.39, 0.45, 0.55) });
    drawText(page, truncateText(fieldValues[key], 44), field.x + 42, field.y, {
      font,
      size: COMMON_IDENTITY_HEADER.fontSize,
      maxWidth: field.width - 44,
    });
  });
}

function drawRatingCheck(pdfDoc, section, ratingChoice, font) {
  const rating = section.rating || { page: section.page, checkboxY: section.ratingCheckboxY };
  if (!rating?.page || !rating?.checkboxY) return;
  const choice = RATING_CHOICES[normalizeRatingChoice(ratingChoice)] || RATING_CHOICES.meets_expectations;
  const size = RATING_CHOICES.checkboxSize;
  const page = pdfPage(pdfDoc, rating.page);
  page.drawText("X", {
    x: choice.checkboxX + 1.6,
    y: rating.checkboxY + 0.2,
    size: size,
    font,
    color: rgb(0.07, 0.12, 0.18),
  });
}

export async function fillPerformanceReviewPdfBytes(sourcePdfBytes, options = {}) {
  const template = options.template || resolvePerformanceReviewTemplate(options.employee) || PERFORMANCE_REVIEW_TEMPLATES.pet_care_technician;
  const cycle = getPerformanceReviewCycle(options.reviewCycle || options.reviewInstance?.review_cycle || "30_day");
  const section = template.sections[cycle.sectionKey];
  const draft = {
    ...buildPerformanceReviewDraftFromInstance(options.reviewInstance, options.responses || []),
    ...(options.draft || {}),
  };

  const pdfDoc = await PDFDocument.load(sourcePdfBytes, { ignoreEncryption: true });
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const employee = options.employee || {};
  const reviewDate = options.reviewDate || new Date().toISOString().slice(0, 10);

  drawIdentityHeader(pdfDoc, font, {
    employeeName: employee.full_name || employee.employee_name || "",
    positionTitle: employee.position_title || template.roleLabel || "",
    reviewCheckpoint: `${cycle.label} Review`,
    startDate: employee.start_date || "",
    reviewDate,
    locationName: options.locationName || "",
  });

  if (section) {
    drawRatingCheck(pdfDoc, section, draft.rating, boldFont);
    const notesRect = section.notesRect;
    if (notesRect) {
      const page = pdfPage(pdfDoc, pageForRect(section, notesRect));
      const content = [
        draft.managerNotes ? `Manager Notes: ${draft.managerNotes}` : "",
        draft.actionPlan ? `Action Plan: ${draft.actionPlan}` : "",
      ].filter(Boolean).join("\n");
      drawWrappedText(page, content, notesRect, font, { size: 7.6, lineHeight: 9.4 });
    }
  }

  const overall = template.sections.overall_summary;
  if (overall && (draft.overallRating || draft.overallComments)) {
    if (draft.overallRating) drawRatingCheck(pdfDoc, { page: overall.page, ratingCheckboxY: overall.ratingCheckboxY }, draft.overallRating, boldFont);
    if (draft.overallComments && overall.commentsRect) {
      drawWrappedText(pdfPage(pdfDoc, overall.page), draft.overallComments, overall.commentsRect, font, { size: 7.6, lineHeight: 9.4 });
    }
  }

  return pdfDoc.save();
}

function toDocuSealArea(rect, page) {
  return {
    x: Number(rect.x),
    y: Number(PAGE_HEIGHT - rect.y - rect.height),
    w: Number(rect.width),
    h: Number(rect.height),
    page: Number(page || rect.page || 1),
  };
}

export function buildDocuSealPerformanceReviewFields(template, reviewCycle = "30_day") {
  const resolvedTemplate = template || PERFORMANCE_REVIEW_TEMPLATES.pet_care_technician;
  const cycle = getPerformanceReviewCycle(reviewCycle);
  const cycleSection = resolvedTemplate.sections[cycle.sectionKey] || {};
  const final = resolvedTemplate.sections.final_signatures?.employee;
  const finalPage = resolvedTemplate.sections.final_signatures?.page || 1;
  const fields = [];

  if (cycleSection.initials?.employee) {
    fields.push({
      name: `${cycle.id}_employee_initials`,
      type: "initials",
      role: "Employee",
      required: true,
      title: `${cycle.label} employee initials`,
      areas: [toDocuSealArea(cycleSection.initials.employee, cycleSection.initials.page || cycleSection.page || 1)],
    });
  }

  if (final?.signatureRect) {
    fields.push({
      name: "employee_signature",
      type: "signature",
      role: "Employee",
      required: true,
      title: "Employee signature",
      format: "drawn_or_typed",
      areas: [toDocuSealArea(final.signatureRect, finalPage)],
    });
  }

  if (final?.dateRect) {
    fields.push({
      name: "employee_signature_date",
      type: "date",
      role: "Employee",
      required: true,
      title: "Employee signature date",
      format: "MM/DD/YYYY",
      areas: [toDocuSealArea(final.dateRect, finalPage)],
    });
  }

  return fields;
}

export function buildPerformanceReviewPdfFileName(employee = {}, reviewCycle = "30_day") {
  const cycle = getPerformanceReviewCycle(reviewCycle);
  const name = String(employee.full_name || "employee").trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "employee";
  return `${name}-${cycle.shortLabel}-day-performance-review.pdf`;
}
