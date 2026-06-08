import {
  getGrassrootsStatusLabel,
  parseGrassrootsMaterialsLeft,
  getGrassrootsCategoryConfig,
} from "../../grassrootsData";
import { fmtDate } from "./dateUtils";

export const HISTORY_EVENT_LABELS = {
  target_created: "Created",
  target_updated: "Edited",
  target_moved: "Moved",
  target_deleted: "Deleted",
  development_logged: "Logged update",
  drop_logged: "Logged visit",
  development_updated: "Edited update",
  drop_updated: "Edited visit",
};

export function historyEventLabel(eventType) {
  return HISTORY_EVENT_LABELS[eventType] || "History";
}

export function historyActorName(entry) {
  return entry?.actor_name || "Unknown user";
}

export const ACTIVITY_HISTORY_FIELDS = [
  { key: "activity_date", label: "Activity Date", type: "date" },
  { key: "next_contact_date", label: "Follow-Up Date", type: "date" },
  { key: "metadata.person_spoken_with", label: "Spoke With" },
  { key: "metadata.materials_left", label: "Materials Left" },
  { key: "metadata.outcome", label: "Outcome" },
  { key: "metadata.follow_up_priority", label: "Follow-Up Needed", type: "boolean" },
  { key: "metadata.partnership_potential", label: "Partnership Potential", type: "boolean" },
  { key: "notes", label: "Notes" },
];

export function getNestedHistoryValue(source, key) {
  return key.split(".").reduce((value, part) => {
    if (!value || typeof value !== "object") return undefined;
    return value[part];
  }, source);
}

export function normalizeHistoryCompareValue(value, type) {
  if (type === "boolean") return Boolean(value);
  if (value == null) return "";
  return String(value);
}

export function formatHistoryChangeValue(value, type) {
  if (type === "boolean") return value ? "Yes" : "No";
  if (type === "date") return value ? fmtDate(value) : "None";
  const text = String(value || "").trim();
  return text || "None";
}

export function getActivityHistoryChanges(entry) {
  if (!["drop_updated", "development_updated"].includes(entry?.event_type)) return [];
  const before = entry.before_snapshot || {};
  const after = entry.after_snapshot || {};
  return ACTIVITY_HISTORY_FIELDS.flatMap((field) => {
    const beforeValue = getNestedHistoryValue(before, field.key);
    const afterValue = getNestedHistoryValue(after, field.key);
    if (normalizeHistoryCompareValue(beforeValue, field.type) === normalizeHistoryCompareValue(afterValue, field.type)) return [];
    return [{
      label: field.label,
      before: formatHistoryChangeValue(beforeValue, field.type),
      after: formatHistoryChangeValue(afterValue, field.type),
    }];
  });
}

// Human-meaningful target columns to diff for target_updated / target_moved rows,
// so the History tab can show "Status: Identified → Booked" instead of just "Edited row".
export const TARGET_HISTORY_FIELDS = [
  { key: "name", label: "Name" },
  { key: "status", label: "Status", format: (value) => getGrassrootsStatusLabel(value) },
  { key: "organizer", label: "Organizer" },
  { key: "contact_email", label: "Email" },
  { key: "contact_phone", label: "Phone" },
  { key: "address", label: "Address" },
  { key: "business_category", label: "Business Type" },
  { key: "expected_audience", label: "Expected Audience" },
  { key: "cost", label: "Cost", type: "money" },
  { key: "leads_captured", label: "Leads" },
  { key: "event_start_date", label: "Event Start", type: "date" },
  { key: "event_end_date", label: "Event End", type: "date" },
  { key: "next_contact_date", label: "Follow-Up Date", type: "date" },
];

export function formatTargetHistoryValue(value, field) {
  if (field.type === "money") {
    const num = Number(value);
    return value == null || value === "" || Number.isNaN(num) ? "None" : `$${num.toLocaleString()}`;
  }
  if (field.type === "date") return value ? fmtDate(value) : "None";
  if (field.format) return String(field.format(value) || "").trim() || "None";
  return String(value == null ? "" : value).trim() || "None";
}

export function getTargetHistoryChanges(entry) {
  if (!["target_updated", "target_moved"].includes(entry?.event_type)) return [];
  const before = entry.before_snapshot || {};
  const after = entry.after_snapshot || {};
  return TARGET_HISTORY_FIELDS.flatMap((field) => {
    const beforeRaw = before[field.key];
    const afterRaw = after[field.key];
    if (String(beforeRaw ?? "") === String(afterRaw ?? "")) return [];
    return [{
      label: field.label,
      before: formatTargetHistoryValue(beforeRaw, field),
      after: formatTargetHistoryValue(afterRaw, field),
    }];
  });
}

// One entry point for both flavors of edit: activity (visit/development) edits and
// target field edits each carry their own before/after snapshots.
export function getHistoryChanges(entry) {
  const activityChanges = getActivityHistoryChanges(entry);
  return activityChanges.length > 0 ? activityChanges : getTargetHistoryChanges(entry);
}

export function fmtHistoryTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// event_at is a full timestamptz (not a date-only string), so format it from a real
// Date — using the date-only fmtDate() here would produce "Invalid Date".
export function fmtHistoryDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Notes can carry leftover rich-text markup — show clean readable text.
export function historyPlainText(value) {
  return String(value == null ? "" : value)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

// The heart of the page: for every row, exactly WHAT changed and WHAT it became.
// Edits -> field diffs (old -> new); logged visits/developments -> the note + what
// was captured; moves -> from -> to category.
export function getHistoryDetailLines(entry) {
  const changes = getHistoryChanges(entry);
  if (changes.length > 0) {
    return changes.map((change) => ({ label: change.label, before: change.before, after: change.after }));
  }

  const type = entry?.event_type;
  const after = entry?.after_snapshot && typeof entry.after_snapshot === "object" ? entry.after_snapshot : {};
  const meta = entry?.metadata && typeof entry.metadata === "object" ? entry.metadata : {};

  if (type === "development_logged" || type === "drop_logged") {
    const lines = [];
    const note = historyPlainText(after.notes);
    if (note) lines.push({ label: type === "drop_logged" ? "Visit note" : "Note", value: note, multiline: true });
    const md = after.metadata && typeof after.metadata === "object" ? after.metadata : {};
    if (md.outcome) lines.push({ label: "Outcome", value: historyPlainText(md.outcome) });
    if (md.person_spoken_with) lines.push({ label: "Spoke with", value: historyPlainText(md.person_spoken_with) });
    const materials = parseGrassrootsMaterialsLeft(md.materials_left);
    if (materials.length) lines.push({ label: "Materials", value: materials.join(", ") });
    const followUp = after.next_contact_date || meta.next_contact_date;
    if (followUp) lines.push({ label: "Follow-up", value: fmtDate(followUp) });
    return lines;
  }

  if (type === "target_moved" && meta.from_category && meta.to_category) {
    return [{
      label: "Category",
      before: getGrassrootsCategoryConfig(meta.from_category).label,
      after: getGrassrootsCategoryConfig(meta.to_category).label,
    }];
  }

  return [];
}
