export const ENRICHMENT_WORKFLOW_REFRESH_MS = 60_000;
export const ENRICHMENT_WORKFLOW_STALE_MS = 10 * 60_000;
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

export function normalizeWorkflowDog(row = {}, photoMap = {}, playgroupMap = {}) {
  const status = String(row.status || "").toLowerCase();
  const needsReview = row.isSuggested || status === "suggested" || status === "needs_review";
  const animalId = getWorkflowDogId(row);
  const playgroupAssignment = row.playgroupAssignment || row.playgroup_assignment || playgroupMap[animalId] || null;
  return {
    id: animalId,
    animalId,
    animalName: row.animalName || row.animal_name || "Unknown",
    ownerName: row.ownerName || row.owner_name || "Unknown",
    roomLabel: row.roomLabel || row.room_label || "",
    reservationType: row.reservationType || row.reservation_type || "",
    services: Array.isArray(row.services) ? row.services : [],
    reason: formatWorkflowReviewReason(row.reason || "", row.reportDate || row.report_date),
    imageUrl: row.imageUrl || row.image_url || row.photoUrl || row.photo_url || photoMap[animalId] || "",
    playgroupAssignment,
    playgroupTags: getWorkflowPlaygroupTags(playgroupAssignment),
    status: needsReview ? "needs_review" : "scheduled",
  };
}

export function normalizeEnrichmentWorkflow(computedItems, completions = {}, photoMap = {}, playgroupMap = {}) {
  const dogs = Array.isArray(computedItems?.dogs)
    ? computedItems.dogs.map((dog) => normalizeWorkflowDog(dog, photoMap, playgroupMap)).filter((dog) => dog.id)
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
    return new Date(value).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  } catch {
    return "unknown";
  }
}

export function formatWorkflowReviewReason(reason, reportDate = "") {
  const raw = String(reason || "").trim();
  if (!raw) return "";
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

function formatWorkflowDateLabel(date) {
  const value = String(date || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
