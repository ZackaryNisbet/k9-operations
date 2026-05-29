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

const RATING_CHOICE_LABELS = {
  meets_expectations: "Meets Expectations",
  needs_improvement: "Needs Improvement",
  exceeds_expectations: "Exceeds Expectations",
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

export const PERFORMANCE_REVIEW_TEMPLATE_METADATA_KEY = "performance_review_template_role";

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

export function normalizePerformanceReviewTemplateRoleKey(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const directKey = raw.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (PERFORMANCE_REVIEW_TEMPLATES[directKey]) return directKey;
  const normalizedRole = normalizePerformanceReviewRole(raw);
  return PERFORMANCE_REVIEW_TEMPLATES[normalizedRole] ? normalizedRole : "";
}

export function getPerformanceReviewTemplateOptions() {
  return Object.values(PERFORMANCE_REVIEW_TEMPLATES).map((template) => ({
    value: template.roleKey,
    label: template.roleLabel,
  }));
}

export function getPerformanceReviewTemplateOverrideKey(employee = {}) {
  if (!employee || typeof employee !== "object") return "";
  const metadata = employee.metadata && typeof employee.metadata === "object" ? employee.metadata : {};
  return normalizePerformanceReviewTemplateRoleKey(
    metadata[PERFORMANCE_REVIEW_TEMPLATE_METADATA_KEY]
      || metadata.performance_review_pdf_template_role
      || metadata.performance_review_template_key
      || employee.performance_review_template_role
      || employee.performance_review_template_key
      || ""
  );
}

export function resolvePerformanceReviewTemplate(employeeOrPosition) {
  if (employeeOrPosition && typeof employeeOrPosition === "object") {
    const overrideKey = getPerformanceReviewTemplateOverrideKey(employeeOrPosition);
    if (overrideKey && PERFORMANCE_REVIEW_TEMPLATES[overrideKey]) {
      return PERFORMANCE_REVIEW_TEMPLATES[overrideKey];
    }
  }
  const position = typeof employeeOrPosition === "string"
    ? employeeOrPosition
    : employeeOrPosition?.position_title || employeeOrPosition?.target_role || "";
  return PERFORMANCE_REVIEW_TEMPLATES[normalizePerformanceReviewRole(position)] || null;
}

function humanizeReviewPolicySlug(value = "") {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase())
    .trim();
}

function readReviewPolicyDueRule(row = {}) {
  const dueRule = row?.due_rule || row?.dueRule || row?.metadata?.due_rule || row?.metadata?.dueRule || {};
  return dueRule && typeof dueRule === "object" ? dueRule : {};
}

function isReviewCheckpointPolicyRow(row = {}) {
  if (!row || typeof row !== "object") return false;
  return String(row.requirement_kind || row.kind || "") === "review_checkpoint"
    || Object.prototype.hasOwnProperty.call(row, "due_rule")
    || Object.prototype.hasOwnProperty.call(row, "dueRule");
}

function isDefaultReviewPolicyRow(row = {}) {
  if (!row || typeof row !== "object") return false;
  if (String(row.requirement_kind || "") !== "review_checkpoint") return false;
  const group = String(row.display_group || "").toLowerCase();
  if (group === "reviews") return true;
  if (group === "custom") return false;
  const slug = String(row.slug || row.requirement_slug || "").toLowerCase();
  if (slug.startsWith("review_")) return true;
  if (slug.startsWith("custom_")) return false;
  // Fallback: classic offset days for the 30/60/90 reviews
  const dueRule = row.due_rule || row.dueRule || row.metadata?.due_rule || {};
  const od = Number(row.offset_days ?? row.offsetDays ?? dueRule.offset_days ?? dueRule.offsetDays);
  return Number.isFinite(od) && (od === 30 || od === 60 || od === 90);
}

function getOffsetDaysForPolicyRow(row = {}) {
  const dueRule = row.due_rule || row.dueRule || row.metadata?.due_rule || row.metadata?.dueRule || {};
  const candidates = [row.offset_days, row.offsetDays, dueRule.offset_days, dueRule.offsetDays];
  for (const v of candidates) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function normalizeReviewPolicyKey(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function reviewBaseKeyForPolicyRow(row = {}, offsetDays = null, slug = "") {
  const explicitBase = row.base_key || row.baseKey || row.metadata?.base_key || row.metadata?.baseKey;
  if (explicitBase) return normalizeReviewPolicyKey(explicitBase);
  if (Number.isFinite(offsetDays)) return `review_${offsetDays}`;
  const normalizedSlug = normalizeReviewPolicyKey(slug);
  return normalizedSlug.replace(/_day$/, "");
}

export function buildPerformanceReviewCyclesFromPolicy(policyRequirements = []) {
  const inputRows = (Array.isArray(policyRequirements) ? policyRequirements : [])
    .filter((row) => row && typeof row === "object")
    .filter((row) => (row.requirement_kind ? String(row.requirement_kind) === "review_checkpoint" : isReviewCheckpointPolicyRow(row)))
    .filter((row) => row.is_active !== false && row.active !== false);

  const mapped = inputRows.map((row, index) => {
    const dueRule = readReviewPolicyDueRule(row);
    const rawOffsetDays = Number(row.offset_days ?? row.offsetDays ?? dueRule.offset_days ?? dueRule.offsetDays);
    const offsetDays = Number.isFinite(rawOffsetDays) ? rawOffsetDays : null;
    const slug = String(row.slug || row.requirement_slug || row.key || (offsetDays ? `review_${offsetDays}_day` : row.id) || "").trim();
    const id = String(row.cycle_id || row.cycleId || row.review_cycle || row.reviewCycle || slug || row.id || "").trim();
    const baseKey = reviewBaseKeyForPolicyRow(row, offsetDays, slug || id);
    const legacyCycle = offsetDays
      ? PERFORMANCE_REVIEW_CYCLES.find((cycle) => Number(cycle.shortLabel) === offsetDays)
      : null;
    const rawOrder = row.display_order ?? row.displayOrder ?? row.order ?? row.metadata?.display_order ?? row.metadata?.displayOrder;
    const order = Number.isFinite(Number(rawOrder)) ? Number(rawOrder) : (offsetDays ?? index);
    const shortLabel = String(row.short_label || row.shortLabel || row.metadata?.short_label || row.metadata?.shortLabel || offsetDays || "").trim();
    const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
    const evidencePolicy = row.evidence_policy || row.evidencePolicy || "checkbox_only";
    const legacyReviewCycle = row.legacy_review_cycle
      || row.legacyReviewCycle
      || row.review_cycle
      || row.reviewCycle
      || metadata.legacy_review_cycle
      || null;
    return {
      id,
      slug: normalizeReviewPolicyKey(slug || id),
      label: String(row.label || row.display_label || row.displayLabel || row.name || row.title || (offsetDays ? `${offsetDays} Day` : humanizeReviewPolicySlug(slug || id)) || "Review").trim(),
      shortLabel,
      baseKey,
      sectionKey: row.section_key || row.sectionKey || legacyCycle?.sectionKey || normalizeReviewPolicyKey(slug || id),
      dueDateKey: row.due_date_key || row.dueDateKey || row.metadata?.due_date_key || row.metadata?.dueDateKey || `${baseKey}_due_date`,
      statusKey: row.status_key || row.statusKey || row.metadata?.status_key || row.metadata?.statusKey || `${baseKey}_status`,
      completedDateKey: row.completed_date_key || row.completedDateKey || row.metadata?.completed_date_key || row.metadata?.completedDateKey || `${baseKey}_completed_on`,
      order: Number.isFinite(order) ? order : index,
      requirementId: row.id || row.requirement_id || null,
      policyKey: row.policy_key || row.policyKey || row.parent_requirement_id || row.id || id,
      requirement: row,
      evidencePolicy,
      requiresEvidence: ["file_required", "url_or_reference"].includes(evidencePolicy),
      legacyReviewCycle,
      isDirectComplianceRequirement: Boolean(row.id || row.requirement_id) && !legacyReviewCycle,
      dueRule,
    };
  }).filter((cycle) => cycle.id);

  // Canonical column order for the Employees grid (and any consumer of the cycles):
  // 30/60/90 default review checkpoints FIRST (sorted by offset_days asc),
  // THEN custom requirements in the order they were added (created_at asc).
  // This guarantees stable left-to-right columns: 30 → 60 → 90 → [customs oldest to newest].
  const defaultCycles = [];
  const customCycles = [];
  for (const cycle of mapped) {
    const src = cycle.requirement || {};
    if (isDefaultReviewPolicyRow(src)) {
      defaultCycles.push(cycle);
    } else {
      customCycles.push(cycle);
    }
  }

  defaultCycles.sort((a, b) => {
    const da = getOffsetDaysForPolicyRow(a.requirement || {}) ?? 9999;
    const db = getOffsetDaysForPolicyRow(b.requirement || {}) ?? 9999;
    if (da !== db) return da - db;
    return String(a.label).localeCompare(String(b.label));
  });

  customCycles.sort((a, b) => {
    const srcA = a.requirement || {};
    const srcB = b.requirement || {};
    const oa = Number(srcA.display_order ?? srcA.displayOrder ?? srcA.metadata?.display_order);
    const ob = Number(srcB.display_order ?? srcB.displayOrder ?? srcB.metadata?.display_order);
    if (Number.isFinite(oa) && Number.isFinite(ob) && oa !== ob) return oa - ob;
    const ca = srcA.created_at || srcA.createdAt || srcA.metadata?.created_at || "";
    const cb = srcB.created_at || srcB.createdAt || srcB.metadata?.created_at || "";
    if (ca && cb) {
      const c = ca.localeCompare(cb);
      if (c !== 0) return c;
    }
    return String(a.label).localeCompare(String(b.label));
  });

  return [...defaultCycles, ...customCycles];
}

export function resolvePerformanceReviewCycles(options = {}) {
  if (Array.isArray(options?.cycles)) return options.cycles;
  const hasExplicitPolicy = Array.isArray(options)
    || Object.prototype.hasOwnProperty.call(options || {}, "policyRequirements")
    || Object.prototype.hasOwnProperty.call(options || {}, "requirements");
  const policyRows = Array.isArray(options)
    ? options
    : (options?.policyRequirements || options?.requirements || []);
  const policyCycles = buildPerformanceReviewCyclesFromPolicy(policyRows);
  return hasExplicitPolicy ? policyCycles : (policyCycles.length > 0 ? policyCycles : PERFORMANCE_REVIEW_CYCLES);
}

export function getPerformanceReviewCycle(cycleId, options = {}) {
  const cycles = resolvePerformanceReviewCycles(options);
  return cycles.find((cycle) => cycle.id === cycleId || cycle.slug === cycleId) || cycles[0] || PERFORMANCE_REVIEW_CYCLES[0];
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

export function normalizePerformanceReviewStatus(value = "") {
  const raw = String(value || "not_started").trim().toLowerCase();
  if (["complete", "completed", "current", "signed"].includes(raw)) return "complete";
  if (["completed_late", "complete_late", "late_complete"].includes(raw)) return "complete";
  if (["waived", "waiver", "manager_waived"].includes(raw)) return "waived";
  return raw || "not_started";
}

function isReviewDone(status) {
  return ["complete", "waived"].includes(normalizePerformanceReviewStatus(status));
}

function isReviewLateStatus(status) {
  return ["completed_late", "complete_late", "late_complete"].includes(String(status || "").trim().toLowerCase());
}

/**
 * DEPRECATED: Old multi-signal waiver detector (dual logic that caused the
 * "waived still shows Overdue" bugs). Kept as a thin delegator during the
 * green-field simplification so external imports do not explode.
 *
 * ALL new and refactored code MUST use getLaborComplianceCellState instead.
 * This will be fully removed after Phase 3 consumers are updated.
 */
export function isWaivedLaborComplianceState(source = {}, attachedInstance = null, recentAuditEvents = []) {
  // Delegate to the single canonical (best effort for old call sites during transition)
  const canonical = getLaborComplianceCellState(source || {}, { reviewInstance: attachedInstance, recentAuditEvents });
  return canonical.key === "waived";
}

// Legacy wrapper (also deprecated)
function isWaivedPerformanceReviewRequirementStatus(requirementStatus = {}) {
  return isWaivedLaborComplianceState(requirementStatus);
}

/**
 * SINGLE SOURCE OF TRUTH for any labor compliance cell state (green-field redesign).
 *
 * Input: a requirement object exactly as returned inside
 * get_labor_compliance_board(...).employees[].requirements[]
 * (or the equivalent policyEmployee.requirements shape from the support bundle).
 *
 * Legacy review instances are attached only for *content* (the actual review form
 * data: ratings, notes, signatures). State is taken directly from the board-computed
 * fields (status + exception_kind) that the server already derived with correct
 * waived precedence.
 *
 * This is the ONLY function that may return the UI descriptor { key, label, icon, detail, isCompliant, color }.
 * Grid cells, Summary counts, enterprise rollups, filters, and everything else must go through here.
 *
 * No audits, no instance.metadata peeking for state, no 7-priority fallbacks.
 * The server (status_rows CASE + latest_exceptions/evidence joins) already solved it.
 */
export function getLaborComplianceCellState(boardReq = {}, context = {}) {
  const r = boardReq || {};
  const status = String(r.status || r.compliance_status || "").toLowerCase().trim();
  const exceptionKind = String(r.exception_kind || r.exceptionKind || "").toLowerCase().trim();
  const completedOn = r.completed_on || r.completedOn || r.completed_at;
  const dueDate = r.due_date || r.adjusted_due_date || r.original_due_date;
  const today = context.today || new Date().toISOString().slice(0, 10);

  // Waived wins (server already guarantees via CASE WHEN exception_kind = 'waived')
  if (exceptionKind === "waived" || status === "waived") {
    return {
      key: "waived",
      label: "Waived",
      icon: "W",
      detail: r.exception_reason || r.reason || r.exceptionReason || "Manager override",
      isCompliant: true,
      color: "neutral",
      source: "board",
    };
  }

  if (status === "complete" || status === "completed" || completedOn) {
    return {
      key: "completed",
      label: "Complete",
      icon: "OK",
      detail: completedOn ? `Completed ${String(completedOn).slice(0, 10)}` : "Evidence uploaded",
      isCompliant: true,
      color: "success",
      source: "board",
    };
  }

  if (status === "overdue" || (dueDate && String(dueDate).slice(0, 10) < today)) {
    return {
      key: "overdue",
      label: "Overdue",
      icon: "!",
      detail: dueDate ? `Due ${String(dueDate).slice(0, 10)}` : "Past due",
      isCompliant: false,
      color: "danger",
      source: "board",
    };
  }

  if (status === "in_progress" || status === "scheduled") {
    return {
      key: "in_progress",
      label: "In Progress",
      icon: "O",
      detail: dueDate ? `Due ${String(dueDate).slice(0, 10)}` : "Checkpoint started",
      isCompliant: false,
      color: "info",
      source: "board",
    };
  }

  return {
    key: "not_started",
    label: "Not Started",
    icon: "O",
    detail: dueDate ? `Due ${String(dueDate).slice(0, 10)}` : "No checkpoint",
    isCompliant: false,
    color: "default",
    source: "board",
  };
}

function findPerformanceReviewRequirementStatus(row = {}, cycle = {}) {
  const requirements = Array.isArray(row?.requirements) ? row.requirements : [];
  const keys = new Set([
    cycle.id,
    cycle.slug,
    cycle.requirementId,
    cycle.policyKey,
  ].filter(Boolean).map((value) => normalizeReviewPolicyKey(value)));

  return requirements.find((requirement) => {
    if (String(requirement.requirement_kind || requirement.kind || "") !== "review_checkpoint") return false;
    return [
      requirement.id,
      requirement.requirement_id,
      requirement.parent_requirement_id,
      requirement.policy_key,
      requirement.slug,
    ].some((value) => keys.has(normalizeReviewPolicyKey(value)));
  }) || null;
}

export function normalizePerformanceReviewEvidence(source = {}) {
  const rawEvidence = [
    ...(Array.isArray(source.evidence) ? source.evidence : []),
    ...(Array.isArray(source.evidence_files) ? source.evidence_files : []),
    ...(Array.isArray(source.documents) ? source.documents : []),
    ...(Array.isArray(source.attachments) ? source.attachments : []),
  ];

  if (source.labor_employee_document_id) {
    rawEvidence.push({
      id: source.labor_employee_document_id,
      labor_employee_document_id: source.labor_employee_document_id,
      file_name: source.evidence_label || source.file_name || source.document_file_name || "",
      uploaded_at: source.uploaded_at || source.evidence_uploaded_at || source.document_uploaded_at || "",
      uploaded_by_name: source.uploaded_by_name || source.evidence_uploaded_by_name || source.document_uploaded_by_name || "",
    });
  }

  return rawEvidence
    .filter((item) => item && !item.deleted_at)
    .map((item) => ({
      id: item.id || item.labor_employee_document_id || item.document_id || "",
      documentId: item.labor_employee_document_id || item.document_id || item.id || "",
      fileName: item.file_name || item.name || item.evidence_label || "",
      uploadedAt: item.uploaded_at || item.uploadedAt || "",
      uploadedByName: item.uploaded_by_name || item.uploadedByName || "",
      uploadedByUserId: item.uploaded_by_user_id || item.uploadedByUserId || "",
      storagePath: item.storage_path || item.storagePath || "",
      url: item.public_url || item.url || item.external_evidence_url || "",
    }))
    .sort((a, b) => String(b.uploadedAt || "").localeCompare(String(a.uploadedAt || "")));
}

export function getPerformanceReviewCycleStatus(row = {}, cycleId, todayValue = null, options = {}) {
  const cycle = cycleId && typeof cycleId === "object"
    ? cycleId
    : getPerformanceReviewCycle(cycleId, options);
  const requirementStatus = findPerformanceReviewRequirementStatus(row, cycle);
  // Labor policy path (board data): trust the pre-computed server status via the single canonical.
  // Legacy pure review cycles still go through the old normalize for now (gated below).
  const isLaborPolicyItem = Boolean(requirementStatus?.requirement_id || requirementStatus?.id || cycle.requirementId || cycle.isDirectComplianceRequirement);
  let rawStatus;
  if (isLaborPolicyItem) {
    // Trust the canonical board-derived state for labor policy requirements (including 90-day mapped ones).
    // This ensures overdue is respected even after "not started", and waived/completed win correctly.
    const canonical = getLaborComplianceCellState(requirementStatus, { recentAuditEvents: options?.recentAuditEvents || [] });
    rawStatus = canonical.key; // waived | overdue | completed | not_started | in_progress | ...
  } else {
    rawStatus = String(requirementStatus?.status || requirementStatus?.compliance_status || row?.[cycle.statusKey] || "not_started").toLowerCase();
  }
  const status = normalizePerformanceReviewStatus(rawStatus);
  const dueDate = parseDateOnly(requirementStatus?.due_date || requirementStatus?.dueDate || row?.[cycle.dueDateKey]);
  const completedDate = parseDateOnly(
    requirementStatus?.completed_on
      || requirementStatus?.completed_at
      || requirementStatus?.completedDate
      || row?.[cycle.completedDateKey]
      || row?.[`${cycle.baseKey || ""}_completed_at`]
  );
  const evidencePolicy = requirementStatus?.evidence_policy || requirementStatus?.evidencePolicy || cycle.evidencePolicy || "checkbox_only";
  const evidenceRequired = ["file_required", "url_or_reference"].includes(evidencePolicy);
  const evidence = normalizePerformanceReviewEvidence(requirementStatus || row);
  const requirementId = requirementStatus?.requirement_id
    || requirementStatus?.requirementId
    || cycle.requirementId
    || cycle.requirement?.id
    || "";
  const compatibility = requirementStatus?.compatibility && typeof requirementStatus.compatibility === "object"
    ? requirementStatus.compatibility
    : {};
  const requirementMetadata = cycle.requirement?.metadata && typeof cycle.requirement.metadata === "object"
    ? cycle.requirement.metadata
    : {};
  const legacyReviewCycle = cycle.legacyReviewCycle
    || requirementStatus?.legacy_review_cycle
    || requirementStatus?.legacyReviewCycle
    || compatibility.legacy_review_cycle
    || requirementMetadata.legacy_review_cycle
    || "";
  const hasReferenceEvidence = Boolean(
    requirementStatus?.external_evidence_url
      || requirementStatus?.externalEvidenceUrl
      || requirementStatus?.source_note
      || requirementStatus?.sourceNote
  );
  const hasEvidence = evidence.length > 0 || hasReferenceEvidence;
  const evidenceMissing = status === "complete" && evidenceRequired && !hasEvidence;
  const completed = isReviewDone(status) && !evidenceMissing;
  const completedLate = status === "complete" && (isReviewLateStatus(rawStatus) || Boolean(dueDate && completedDate && completedDate > dueDate));
  const overdue = !completed && (normalizePerformanceReviewStatus(rawStatus) === "overdue" || rawStatus === "overdue" || isPastDue(dueDate, todayValue));

  return {
    ...cycle,
    dueDate,
    completedDate,
    evidence,
    evidencePolicy,
    evidenceRequired,
    hasEvidence,
    evidenceMissing,
    evidenceUploadedAt: evidence[0]?.uploadedAt || "",
    evidenceUploadedByName: evidence[0]?.uploadedByName || "",
    requirementStatus,
    policyCell: requirementStatus,
    requirementId,
    evidenceLinkId: requirementStatus?.evidence_link_id || requirementStatus?.evidenceLinkId || "",
    exceptionKind: requirementStatus?.exception_kind || requirementStatus?.exceptionKind || "",
    exceptionReason: requirementStatus?.exception_reason || requirementStatus?.exceptionReason || "",
    originalDueDate: requirementStatus?.original_due_date || requirementStatus?.originalDueDate || "",
    adjustedDueDate: requirementStatus?.adjusted_due_date || requirementStatus?.adjustedDueDate || "",
    legacyReviewCycle,
    legacyReviewInstanceId: compatibility.legacy_review_instance_id || requirementStatus?.legacy_review_instance_id || requirementStatus?.legacyReviewInstanceId || "",
    isDirectComplianceRequirement: Boolean(requirementId) && !legacyReviewCycle,
    rawStatus,
    status,
    overdue,
    completed,
    completedLate,
  };
}

export function getPerformanceReviewCompliance(row = {}, todayValue = null, options = {}) {
  const cycles = resolvePerformanceReviewCycles(options);
  const cycleRows = cycles.map((cycle) => getPerformanceReviewCycleStatus(row, cycle, todayValue, { 
    cycles, 
    recentAuditEvents: options?.recentAuditEvents || [] 
  }));
  if (cycleRows.length === 0) {
    return {
      label: "No checkpoints configured",
      color: "default",
      tone: "default",
      detail: "Enterprise/location policy has no active review checkpoints",
      overdueCount: 0,
      cycleRows,
    };
  }

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

function formatRatingChoiceLabel(value = "") {
  const text = truncateText(value, 80);
  if (!text) return "";
  return RATING_CHOICE_LABELS[normalizeRatingChoice(text)] || text;
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

function sectionMatchesCycle(section = {}, cycle) {
  const haystack = normalizeTitle([
    section.section_key,
    section.item_key,
    section.title,
    section.name,
  ].filter(Boolean).join(" "));
  if (!haystack || !cycle) return false;
  const numeric = String(cycle.shortLabel || "").trim();
  return haystack.includes(`${numeric} day`) || haystack.includes(`${numeric}-day`) || haystack.includes(`${numeric}_day`);
}

function responseForItem(responseMap, reviewDrafts, itemId) {
  const response = responseMap.get(itemId) || {};
  const draft = reviewDrafts?.[itemId] || {};
  const rating = draft.rating_value ?? response.rating_value ?? "";
  const text = draft.response_text ?? response.response_text ?? "";
  return { rating, text };
}

function buildPerformanceReviewAreaResponseDetails(reviewSections = [], responses = [], reviewDrafts = {}, reviewCycle = "30_day") {
  const cycle = getPerformanceReviewCycle(reviewCycle);
  const responseRows = Array.isArray(responses) ? responses : [];
  const responseMap = new Map(responseRows.map((response) => [response.review_item_id, response]));
  const targetSection = (Array.isArray(reviewSections) ? reviewSections : []).find((section) => sectionMatchesCycle(section, cycle));
  if (!targetSection?.items?.length) return [];

  return targetSection.items
    .filter((item) => item?.item_type === "rating")
    .map((item, index) => {
      const { rating, text } = responseForItem(responseMap, reviewDrafts, item.id);
      const label = formatRatingChoiceLabel(rating || text);
      if (!label) return null;
      return {
        number: index + 1,
        prompt: truncateText(item.prompt || item.title || item.name || `Area ${index + 1}`, 500),
        status: `Addressed; ${label}`,
      };
    })
    .filter(Boolean);
}

export function buildPerformanceReviewAreaResponseSummaries(reviewSections = [], responses = [], reviewDrafts = {}, reviewCycle = "30_day") {
  return buildPerformanceReviewAreaResponseDetails(reviewSections, responses, reviewDrafts, reviewCycle)
    .map((detail) => `${detail.number}. ${detail.status}`);
}

function drawWrappedTextAt(page, text, x, y, width, font, options = {}) {
  const size = options.size || 8;
  const lineHeight = options.lineHeight || size * 1.24;
  const lines = wrapText(text, font, size, width).slice(0, options.maxLines || 100);
  let cursorY = y;
  lines.forEach((line) => {
    drawText(page, line, x, cursorY, { ...options, size, font, maxWidth: width });
    cursorY -= lineHeight;
  });
  return cursorY;
}

function drawAreaReviewAppendixHeader(page, font, boldFont, payload) {
  drawText(page, "Areas for Review Responses", 72, 724, {
    font: boldFont,
    size: 15,
    color: rgb(0.07, 0.12, 0.18),
  });
  drawText(page, `${payload.employeeName || "Employee"} - ${payload.roleLabel || "Performance Review"} - ${payload.reviewCheckpoint}`, 72, 704, {
    font,
    size: 8.4,
    color: rgb(0.28, 0.34, 0.43),
    maxWidth: 468,
  });
  page.drawLine({
    start: { x: 72, y: 688 },
    end: { x: 540, y: 688 },
    thickness: 0.7,
    color: rgb(0.86, 0.89, 0.94),
  });
}

function drawAreaReviewResponsesAppendix(pdfDoc, details, font, boldFont, payload) {
  if (!details?.length) return;
  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  drawAreaReviewAppendixHeader(page, font, boldFont, payload);
  let cursorY = 662;

  details.forEach((detail) => {
    if (cursorY < 128) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      drawAreaReviewAppendixHeader(page, font, boldFont, payload);
      cursorY = 662;
    }

    page.drawRectangle({
      x: 72,
      y: cursorY - 5,
      width: 20,
      height: 18,
      borderWidth: 0.8,
      borderColor: rgb(0.82, 0.87, 0.93),
      color: rgb(0.98, 0.99, 1),
    });
    drawText(page, String(detail.number), 79, cursorY, {
      font: boldFont,
      size: 8.2,
      color: rgb(0.07, 0.12, 0.18),
    });
    const nextPromptY = drawWrappedTextAt(page, detail.prompt, 104, cursorY + 1, 436, boldFont, {
      size: 8.4,
      lineHeight: 10.2,
      color: rgb(0.07, 0.12, 0.18),
      maxLines: 4,
    });
    cursorY = Math.min(cursorY - 18, nextPromptY - 4);
    drawText(page, detail.status, 104, cursorY, {
      font: boldFont,
      size: 8,
      color: rgb(0.12, 0.34, 0.18),
      maxWidth: 436,
    });
    cursorY -= 26;
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
  const areaResponseDetails = buildPerformanceReviewAreaResponseDetails(
    options.reviewSections || [],
    options.responses || [],
    options.reviewDrafts || {},
    cycle.id,
  );

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

  drawAreaReviewResponsesAppendix(pdfDoc, areaResponseDetails, font, boldFont, {
    employeeName: employee.full_name || employee.employee_name || "",
    roleLabel: template.roleLabel || employee.position_title || "",
    reviewCheckpoint: `${cycle.label} Review`,
  });

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
