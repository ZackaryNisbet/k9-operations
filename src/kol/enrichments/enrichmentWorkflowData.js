export const ENRICHMENT_WORKFLOW_REFRESH_MS = 60_000;
export const ENRICHMENT_WORKFLOW_STALE_MS = 10 * 60_000;
export const ENRICHMENT_DISPLAY_TIME_ZONE = "America/New_York";
export const WORKFLOW_PLAYGROUP_BADGE_ORDER = ["large", "small", "private_play", "evaluation"];

export function buildEnrichmentOpsRowId(date) {
  return `ops_svc_${date}`;
}

export function buildEnrichmentCompletionKey(date) {
  return `ops_svc_Enrichment_${date}`;
}

export function getWorkflowDogId(dog) {
  return String(
    dog?.id ||
    dog?.animalId ||
    dog?.animal_id ||
    dog?.resId ||
    dog?.reservationId ||
    dog?.animalName ||
    ""
  ).trim();
}

export function normalizeWorkflowDog(row = {}, photoMap = {}, playgroupMap = {}, reservationContextMap = {}) {
  const status = String(row.status || "").toLowerCase();
  const needsReview = row.isSuggested || status === "suggested" || status === "needs_review";
  const animalId = getWorkflowDogId(row);
  const playgroupAssignment = row.playgroupAssignment || row.playgroup_assignment || playgroupMap[animalId] || null;
  const reservationContext = row.reservationContext || row.reservation_context || reservationContextMap[animalId] || {};
  const reservationType = firstPresent(
    row.reservationType,
    row.reservation_type,
    reservationContext.reservationType,
    reservationContext.reservation_type,
    reservationContext.reservation_type_name,
  );
  const startDate = firstPresent(
    row.startDate,
    row.start_date,
    row.reservationStart,
    row.reservation_start,
    row.reservationDates?.start,
    reservationContext.startDate,
    reservationContext.start_date,
  );
  const endDate = firstPresent(
    row.endDate,
    row.end_date,
    row.reservationEnd,
    row.reservation_end,
    row.reservationDates?.end,
    reservationContext.endDate,
    reservationContext.end_date,
  );
  const checkInDate = firstPresent(row.checkInDate, row.check_in_date, reservationContext.checkInDate, reservationContext.check_in_date);
  const checkOutDate = firstPresent(row.checkOutDate, row.check_out_date, reservationContext.checkOutDate, reservationContext.check_out_date);
  const reservationCategory = row.reservationCategory || row.reservation_category || reservationContext.reservationCategory || reservationContext.reservation_category || classifyEnrichmentReservationContext(reservationType);
  const reservationWindow = formatEnrichmentReservationWindow(startDate, endDate);
  const serviceDates = firstServiceDates(
    row.serviceDates,
    row.service_dates,
    row.enrichmentServiceDates,
    row.enrichment_service_dates,
    reservationContext.serviceDates,
    reservationContext.service_dates,
  );
  const reportDate = firstPresent(row.reportDate, row.report_date, row.targetDate, row.target_date);
  return {
    id: animalId,
    animalId,
    animalName: row.animalName || row.animal_name || "Unknown",
    ownerName: row.ownerName || row.owner_name || "Unknown",
    roomLabel: row.roomLabel || row.room_label || "",
    reservationType,
    reservationCategory,
    reservationLabel: formatEnrichmentReservationKind(reservationType, reservationCategory),
    reservationDates: { start: startDate, end: endDate, checkIn: checkInDate, checkOut: checkOutDate },
    reservationWindow,
    services: Array.isArray(row.services) ? row.services : [],
    serviceDates,
    reason: formatWorkflowReviewReason(row.reason || "", reportDate, { serviceDates, reservationWindow }),
    imageUrl: row.imageUrl || row.image_url || row.photoUrl || row.photo_url || photoMap[animalId] || "",
    playgroupAssignment,
    playgroupTags: getWorkflowPlaygroupTags(playgroupAssignment),
    status: needsReview ? "needs_review" : "scheduled",
  };
}

export function normalizeEnrichmentWorkflow(computedItems, completions = {}, photoMap = {}, playgroupMap = {}, reservationContextMap = {}, reportDateOverride = "") {
  const reportDate = firstPresent(computedItems?.reportDate, computedItems?.report_date, reportDateOverride);
  const dogs = Array.isArray(computedItems?.dogs)
    ? computedItems.dogs
      .map((dog) => normalizeWorkflowDog({ ...dog, reportDate: dog.reportDate || dog.report_date || reportDate }, photoMap, playgroupMap, reservationContextMap))
      .filter((dog) => dog.id)
    : [];
  const scheduled = dogs.filter((dog) => dog.status === "scheduled");
  const needsReview = dogs.filter((dog) => dog.status === "needs_review");
  const completed = scheduled.filter((dog) => completions[dog.id]);

  return {
    dogs,
    scheduled,
    needsReview,
    rowCount: dogs.length,
    total: scheduled.length,
    scheduledCount: scheduled.length,
    needsReviewCount: needsReview.length,
    completedCount: completed.length,
    rawScheduledCount: Number(computedItems?.scheduledCount || 0),
    rawSuggestedCount: Number(computedItems?.suggestedCount || 0),
    summary: computedItems?.summary || null,
  };
}

export function classifyEnrichmentReservationContext(typeName = "") {
  const value = String(typeName || "").toLowerCase();
  if (!value) return "";
  if (value.includes("evaluation") || value.includes("eval") || value.includes("first stay")) return "evaluation";
  if (value.includes("day boarding")) return "day_boarding";
  if (value.includes("daycare") || value.includes("day care")) return "daycare";
  if (value.includes("boarding") || value.includes("luxury") || value.includes("executive") || value.includes("suite") || value.includes("compartment")) return "boarding";
  return "other";
}

export function formatEnrichmentReservationKind(typeName = "", category = "") {
  const cat = category || classifyEnrichmentReservationContext(typeName);
  if (cat === "boarding") return "Boarding";
  if (cat === "daycare") return "Daycare";
  if (cat === "day_boarding") return "Day boarding";
  if (cat === "evaluation") return "Evaluation";
  const raw = String(typeName || "").trim();
  return raw || "";
}

export function formatEnrichmentReservationWindow(startDate = "", endDate = "") {
  const start = formatReservationDatePart(startDate);
  const end = formatReservationDatePart(endDate);
  if (!start && !end) return "";
  if (start && !end) return start.full;
  if (!start && end) return `Ends ${end.full}`;
  if (start.dateKey === end.dateKey) {
    if (start.time && end.time) return `${start.date}, ${start.time} to ${end.time}`;
    return start.date;
  }
  return `${start.full} to ${end.full}`;
}

function firstPresent(...values) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
}

function firstServiceDates(...values) {
  for (const value of values) {
    const dates = normalizeWorkflowServiceDates(value);
    if (dates.length) return dates;
  }
  return [];
}

export function normalizeWorkflowServiceDates(value) {
  const source = Array.isArray(value)
    ? value
    : String(value || "")
      .split(/[,|]/)
      .map((part) => part.trim())
      .filter(Boolean);
  return [...new Set(source
    .map(extractWorkflowServiceDate)
    .filter(Boolean))];
}

function extractWorkflowServiceDate(value) {
  if (value && typeof value === "object") {
    return extractWorkflowServiceDate(
      value.scheduled_at ||
      value.scheduled_date ||
      value.scheduledAt ||
      value.date ||
      value.service_date ||
      value.start_date ||
      value.value ||
      ""
    );
  }
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.toLowerCase() === "missing") return "missing";
  const match = raw.match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : raw;
}

function formatReservationDatePart(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/\d{4}-\d{2}-\d{2}/);
  if (!match) return null;
  const hasClock = /T\d{2}:\d{2}/.test(raw);
  const parsed = hasClock ? new Date(raw) : new Date(`${match[0]}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  const date = parsed.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: ENRICHMENT_DISPLAY_TIME_ZONE,
  });
  const time = hasClock ? parsed.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: ENRICHMENT_DISPLAY_TIME_ZONE,
  }) : "";
  return {
    date,
    time,
    full: time ? `${date}, ${time}` : date,
    dateKey: match[0],
  };
}

export function getWorkflowPlaygroupTags(assignment) {
  if (!assignment) return [];
  const tags = new Set((Array.isArray(assignment.playgroup_tags) ? assignment.playgroup_tags : [])
    .map((tag) => String(tag || "").trim().toLowerCase())
    .filter(Boolean));
  const primary = String(assignment.primary_display_playgroup || "").trim().toLowerCase();
  const size = String(assignment.size_group || "").trim().toLowerCase();
  if (primary === "both_daycares" || tags.has("both_daycares")) {
    tags.add("large");
    tags.add("small");
  }
  if (primary === "large" || size === "large") tags.add("large");
  if (primary === "small" || size === "small") tags.add("small");
  if (primary === "private_play" || primary === "half_and_half" || assignment.has_private_play || assignment.is_half_and_half) tags.add("private_play");
  if (primary === "evaluation" || assignment.has_evaluation) tags.add("evaluation");
  return WORKFLOW_PLAYGROUP_BADGE_ORDER.filter((tag) => tags.has(tag));
}

export function getEnrichmentWorkflowStatus(workflow) {
  if (!workflow?.rowCount) return "empty";
  if (workflow.needsReviewCount > 0) return "needs_review";
  if (workflow.total > 0 && workflow.completedCount >= workflow.total) return "complete";
  if (workflow.completedCount > 0) return "in_progress";
  return "ready";
}

export function deriveWorkflowHealth({ lastSuccessAt, error, nowMs = Date.now(), staleAfterMs = ENRICHMENT_WORKFLOW_STALE_MS }) {
  if (error) {
    return {
      status: "critical",
      label: "Needs attention",
      detail: error.message || "Workflow refresh failed",
    };
  }
  if (!lastSuccessAt) {
    return {
      status: "missing",
      label: "Waiting",
      detail: "No successful workflow refresh yet",
    };
  }
  const ageMs = Math.max(0, nowMs - new Date(lastSuccessAt).getTime());
  if (ageMs > staleAfterMs) {
    return {
      status: "stale",
      label: "Stale",
      detail: `Sync age ${formatHealthAge(lastSuccessAt, nowMs)}`,
    };
  }
  return {
    status: "healthy",
    label: "Healthy",
    detail: `Sync age ${formatHealthAge(lastSuccessAt, nowMs)}`,
  };
}

export function getWorkflowRefreshState(lastSuccessAt, nowMs = Date.now(), intervalMs = ENRICHMENT_WORKFLOW_REFRESH_MS) {
  const anchor = lastSuccessAt ? new Date(lastSuccessAt).getTime() : nowMs;
  const elapsed = Math.max(0, nowMs - anchor);
  const msRemaining = Math.max(0, intervalMs - elapsed);
  const seconds = Math.ceil(msRemaining / 1000);
  return {
    progress: intervalMs > 0 ? Math.min(1, elapsed / intervalMs) : 1,
    nextRunAt: lastSuccessAt ? new Date(anchor + intervalMs).toISOString() : null,
    seconds,
    label: lastSuccessAt ? (seconds <= 0 ? "Refreshing" : `Next sync in ${seconds}`) : "Waiting",
  };
}

export function formatHealthAge(value, nowMs = Date.now()) {
  if (!value) return "never";
  const ts = new Date(value).getTime();
  if (!Number.isFinite(ts)) return "unknown";
  const diff = Math.max(0, nowMs - ts);
  if (diff < 5_000) return "just now";
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 60 * 60_000) return `${Math.round(diff / 60_000)}m ago`;
  return `${Math.round(diff / (60 * 60_000))}h ago`;
}

export function formatHealthTime(value) {
  if (!value) return "pending";
  try {
    return new Date(value).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: ENRICHMENT_DISPLAY_TIME_ZONE,
    });
  } catch {
    return "unknown";
  }
}

export function formatWorkflowReviewReason(reason, reportDate = "", context = {}) {
  const raw = String(reason || "").trim();
  if (!raw) return "";
  const parsedServiceDates = normalizeWorkflowServiceDates(
    context.serviceDates?.length ? context.serviceDates : parseServiceDatesFromReviewReason(raw)
  );
  const usesGenericReviewCopy = /Enrichment service needs review|Enrichment service needs a scheduled date|Current service dates:/i.test(raw);
  if (usesGenericReviewCopy) {
    return buildWorkflowReviewExplanation({
      reportDate,
      serviceDates: parsedServiceDates,
      reservationWindow: context.reservationWindow || "",
    });
  }
  const pretty = raw.replace(/\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[-+]\d{2}:\d{2}|Z)?)?/g, (match) => {
    const date = match.slice(0, 10);
    const label = formatWorkflowDateLabel(date);
    return label || date;
  });

  const formattedReportDate = formatWorkflowDateLabel(reportDate);
  return pretty
    .replace(/Enrichment service needs a scheduled date for ([^.]+)\./, formattedReportDate ? `Missing service date for ${formattedReportDate}.` : "Missing service date.")
    .replace(/Current service dates:/, "Service dates:")
    .replace(/\s+/g, " ")
    .trim();
}

function parseServiceDatesFromReviewReason(reason) {
  const match = String(reason || "").match(/Current service dates:\s*([^.]*)/i);
  if (!match) return [];
  return match[1].split(",").map((part) => part.trim()).filter(Boolean);
}

function buildWorkflowReviewExplanation({ reportDate = "", serviceDates = [], reservationWindow = "" }) {
  const targetLabel = formatWorkflowDateLabel(reportDate) || "this date";
  const datedLabels = serviceDates
    .filter((date) => date && date !== "missing")
    .map((date) => formatWorkflowDateLabel(date) || date)
    .filter(Boolean);
  const hasMissingDate = serviceDates.includes("missing");
  const context = reservationWindow
    ? `Dog is here ${reservationWindow}`
    : `Reservation is active ${targetLabel}`;
  const problems = [];

  if (datedLabels.length) {
    problems.push(`Enrichment is dated ${joinHuman(datedLabels)} instead of ${targetLabel}`);
  }
  if (hasMissingDate) {
    problems.push("one Enrichment service has no service date");
  }
  if (!problems.length) {
    return `${context}, but the Enrichment service needs review before staff run it today.`;
  }
  return `${context}, but ${joinHuman(problems)}. Confirm whether staff should run it today.`;
}

function joinHuman(items) {
  const list = items.filter(Boolean);
  if (list.length <= 1) return list[0] || "";
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(", ")}, and ${list[list.length - 1]}`;
}

function formatWorkflowDateLabel(date) {
  const value = String(date || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: ENRICHMENT_DISPLAY_TIME_ZONE,
  });
}
