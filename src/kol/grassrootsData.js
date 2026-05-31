export const GRASSROOTS_CATEGORY_CONFIGS = [
  {
    id: "events",
    dbValue: "events",
    label: "Events",
    singular: "Event",
    activityLabel: "Development",
    logLabel: "Log Development",
    countLabel: "Developments",
    nameLabel: "Event",
    emptyName: "Untitled event",
  },
  {
    id: "drops",
    dbValue: "drops",
    label: "Visits",
    singular: "Business",
    activityLabel: "Visit",
    logLabel: "Log Visit",
    countLabel: "Visits",
    nameLabel: "Business",
    emptyName: "Untitled business",
    usesStatus: false,
  },
  {
    id: "corporatePartnerships",
    dbValue: "corporate_partnerships",
    label: "Corporate Partnerships",
    singular: "Corporate Partnership",
    activityLabel: "Development",
    logLabel: "Log Development",
    countLabel: "Developments",
    nameLabel: "Corporation",
    emptyName: "Untitled corporation",
  },
  {
    id: "apartments",
    dbValue: "apartments",
    label: "Apartments",
    singular: "Apartment",
    activityLabel: "Development",
    logLabel: "Log Development",
    countLabel: "Developments",
    nameLabel: "Apartment Complex",
    emptyName: "Untitled apartment",
  },
  {
    id: "petProfessionalPartnerships",
    dbValue: "pet_professional_partnerships",
    label: "Pet Professional Partnerships",
    singular: "Pet Professional Partnership",
    activityLabel: "Development",
    logLabel: "Log Development",
    countLabel: "Developments",
    nameLabel: "Business",
    emptyName: "Untitled business",
  },
];

export const GRASSROOTS_CATEGORY_BY_ID = Object.fromEntries(
  GRASSROOTS_CATEGORY_CONFIGS.map((config) => [config.id, config]),
);

export const GRASSROOTS_CATEGORY_BY_DB = Object.fromEntries(
  GRASSROOTS_CATEGORY_CONFIGS.map((config) => [config.dbValue, config]),
);

export const GRASSROOTS_STATUS_OPTIONS = [
  { value: "identified", label: "Identified" },
  { value: "corresponding", label: "Corresponding" },
  { value: "booked", label: "Booked" },
  { value: "abandoned", label: "Abandoned" },
];

export const GRASSROOTS_EVENT_TYPE_OPTIONS = ["B2C", "B2B"];

export const GRASSROOTS_EVENT_SAVE_RPC = "save_grassroots_target_with_event_dates";

export const GRASSROOTS_BUSINESS_CATEGORY_OPTIONS = [
  "Veterinarian",
  "Groomer",
  "Pet Retailer",
  "Rescue",
  "Trainer",
  "Boarding/Daycare",
  "Other",
];

export const GRASSROOTS_DROP_CATEGORY_OPTIONS = GRASSROOTS_BUSINESS_CATEGORY_OPTIONS;

// Predefined visit outcomes (pick-list, no free typing) and the materials you can
// leave at a business. Stored as text on the activity, so no schema change.
export const GRASSROOTS_VISIT_OUTCOME_OPTIONS = [
  "Staff receptive — would return",
  "Staff not receptive — would not return",
  "No one available to speak with",
  "Business was closed",
  "Spoke with a decision-maker",
  "Dropped materials only",
];

export const GRASSROOTS_VISIT_MATERIALS_OPTIONS = [
  "Consumer brochure",
  "Pricing insert",
  "Business cards",
  "Coupon",
  "Pens",
  "Poop bag holders",
  "Poop bag dispensers",
  "Food scoops",
  "Dog leashes",
];

// Materials are persisted as a comma-joined string. These helpers convert to/from
// the selected-set the chip picker works with, preserving any legacy free-text.
export function parseGrassrootsMaterialsLeft(value) {
  return String(value || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function toggleGrassrootsMaterial(value, material) {
  const current = parseGrassrootsMaterialsLeft(value);
  const exists = current.some((item) => item.toLowerCase() === String(material).toLowerCase());
  const next = exists
    ? current.filter((item) => item.toLowerCase() !== String(material).toLowerCase())
    : [...current, material];
  return next.join(", ");
}

export const GRASSROOTS_ACTIVITY_ATTACHMENT_BUCKET = "grassroots-activity-attachments";
export const GRASSROOTS_ACTIVITY_ATTACHMENT_MAX_FILES = 5;
export const GRASSROOTS_ACTIVITY_ATTACHMENT_MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
export const GRASSROOTS_ACTIVITY_ATTACHMENT_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
];
export const GRASSROOTS_ACTIVITY_ATTACHMENT_ACCEPT = GRASSROOTS_ACTIVITY_ATTACHMENT_MIME_TYPES.join(",");

export function normalizeGrassrootsDropBusinessCategory(value) {
  const normalized = normalizeGrassrootsSearchText(value);
  if (!normalized) return "";
  const match = GRASSROOTS_DROP_CATEGORY_OPTIONS.find((option) => normalizeGrassrootsSearchText(option) === normalized);
  if (match) return match;
  if (normalized === "rescuer" || normalized === "rescuers" || normalized === "rescue") return "Rescue";
  if (normalized === "pet retail" || normalized === "pet retailer" || normalized === "retailer") return "Pet Retailer";
  if (normalized === "boarding daycare" || normalized === "boarding and daycare" || normalized === "daycare") return "Boarding/Daycare";
  return String(value || "").trim();
}

export function getGrassrootsDropCategoryBucket(value) {
  const category = normalizeGrassrootsDropBusinessCategory(value);
  if (!category) return "Other";
  return GRASSROOTS_DROP_CATEGORY_OPTIONS.includes(category) ? category : "Other";
}

export const GRASSROOTS_DEFAULT_FILTERS = {
  is_active: { op: "is", val: "active" },
};

export function getGrassrootsDefaultFilters(category = "events") {
  // `category` is retained for API compatibility. Events used to also hide
  // leads_captured>0 by default, but that proxy made an event vanish the moment
  // results were logged. Closed (details.closeout) and past events are now archived
  // out of the default view by the page's closeout/past-event logic instead, so the
  // default filter is just "active records" for every category.
  return { ...GRASSROOTS_DEFAULT_FILTERS };
}

export const GRASSROOTS_FILTER_OP_LABELS = {
  contains: "contains",
  equals: "equals",
  starts: "starts with",
  empty: "is empty",
  notEmpty: "not empty",
  is: "is",
  isNot: "is not",
  "=": "=",
  ">=": ">=",
  "<=": "<=",
  ">": ">",
  "<": "<",
  after: "after",
  before: "before",
  inLastDays: "in last X days",
  overdue: "overdue",
  today: "today",
  thisWeek: "this week",
  hasDate: "has date",
  noDate: "no date",
};

const ACTIVITY_TYPE_BY_CATEGORY = {
  drops: "drop",
};

function stringValue(value) {
  return String(value ?? "").trim();
}

function normalizeText(value) {
  return stringValue(value).replace(/\s+/g, " ");
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeUuid(value) {
  const trimmed = stringValue(value);
  return UUID_RE.test(trimmed) ? trimmed : "";
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function parseInteger(value) {
  const text = stringValue(value).replace(/,/g, "");
  if (!text || !/^-?\d+$/.test(text)) return null;
  return Number.parseInt(text, 10);
}

function parseDecimal(value) {
  const text = stringValue(value).replace(/[$,]/g, "");
  if (!text || !/^-?\d+(\.\d+)?$/.test(text)) return null;
  return Number.parseFloat(text);
}

function parseDate(value) {
  const text = stringValue(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

export function getGrassrootsCategoryConfig(categoryIdOrDbValue) {
  return GRASSROOTS_CATEGORY_BY_ID[categoryIdOrDbValue] || GRASSROOTS_CATEGORY_BY_DB[categoryIdOrDbValue] || GRASSROOTS_CATEGORY_CONFIGS[0];
}

export function getGrassrootsActivityType(category) {
  return ACTIVITY_TYPE_BY_CATEGORY[category] || ACTIVITY_TYPE_BY_CATEGORY[getGrassrootsCategoryConfig(category).id] || "development";
}

export function getGrassrootsStatusLabel(value) {
  const normalized = normalizeGrassrootsStatus(value);
  const found = GRASSROOTS_STATUS_OPTIONS.find((option) => option.value === normalized);
  return found?.label || "Identified";
}

export function normalizeGrassrootsStatus(value) {
  const normalized = normalizeKey(value).replace(/\s+/g, "_");
  if (["outreach", "identified", "new", "lead"].includes(normalized)) return "identified";
  if (["corresponding", "correspondence", "contacted"].includes(normalized)) return "corresponding";
  if (["closing", "active", "booked", "officially_booked"].includes(normalized)) return "booked";
  if (["abandoned", "archive", "archived", "inactive", "dead", "dropped"].includes(normalized)) return "abandoned";
  return "identified";
}

export function shouldArchiveGrassrootsTargetForStatus(value) {
  return normalizeGrassrootsStatus(value) === "abandoned";
}

export function resolveGrassrootsTargetIsActive(status, requestedIsActive = true) {
  if (shouldArchiveGrassrootsTargetForStatus(status)) return false;
  return requestedIsActive !== false;
}

export function normalizeGrassrootsEventType(value = "") {
  const normalized = String(value || "").trim().toUpperCase();
  return GRASSROOTS_EVENT_TYPE_OPTIONS.includes(normalized) ? normalized : "";
}

export function normalizeGrassrootsEventLinks(target = {}) {
  const sourceLinks = Array.isArray(target.details?.links)
    ? target.details.links
    : Array.isArray(target.links)
      ? target.links
      : [];
  return sourceLinks
    .map((row, index) => ({
      id: row?.id || `event_link_${index + 1}`,
      label: normalizeText(row?.label || row?.title),
      url: normalizeText(row?.url || row?.href),
    }))
    .filter((row) => row.url);
}

function parseTime(value) {
  const text = stringValue(value);
  const match = text.match(/^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/);
  return match ? `${match[1]}:${match[2]}` : "";
}

export function normalizeGrassrootsEventDates(target = {}) {
  const sourceDates = Array.isArray(target.event_dates)
    ? target.event_dates
    : Array.isArray(target.details?.event_dates)
      ? target.details.event_dates
      : [];
  const normalizedDates = sourceDates
    .map((row, index) => ({
      id: row?.id || `event_date_${index + 1}`,
      event_date: parseDate(row?.event_date || row?.date),
      start_time: parseTime(row?.start_time || row?.startTime),
      end_time: parseTime(row?.end_time || row?.endTime),
      sequence_order: Number.isFinite(Number(row?.sequence_order)) ? Number(row.sequence_order) : index + 1,
    }))
    .filter((row) => row.event_date);

  if (normalizedDates.length > 0) {
    return normalizedDates.sort((a, b) => a.event_date.localeCompare(b.event_date) || a.sequence_order - b.sequence_order);
  }

  const fallbackDate = parseDate(target.event_start_date || target.event_date);
  if (!fallbackDate) return [];
  return [{
    id: "event_date_1",
    event_date: fallbackDate,
    start_time: parseTime(target.event_start_time || target.event_time),
    end_time: parseTime(target.event_end_time),
    sequence_order: 1,
  }];
}

export function getGrassrootsPrimaryEventDate(target = {}) {
  return normalizeGrassrootsEventDates(target)[0]?.event_date || target.event_start_date || "";
}

export function getGrassrootsNextEventDate(target = {}, today = new Date().toISOString().slice(0, 10)) {
  const dates = normalizeGrassrootsEventDates(target);
  if (dates.length === 0) return "";
  return dates.find((row) => row.event_date >= today)?.event_date || dates[dates.length - 1]?.event_date || "";
}

// The last calendar day of the event (multi-day events end on their latest date).
export function getGrassrootsFinalEventDate(target = {}) {
  const dates = normalizeGrassrootsEventDates(target);
  if (dates.length > 0) return dates[dates.length - 1].event_date;
  return target.event_end_date || target.event_start_date || "";
}

// Two YYYY-MM-DD dates exactly one calendar day apart (b is the day after a)?
function areGrassrootsDatesConsecutive(a, b) {
  if (!a || !b) return false;
  const da = new Date(`${a}T12:00:00`);
  const db = new Date(`${b}T12:00:00`);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return false;
  return Math.round((db - da) / 86400000) === 1;
}

// Structured summary of an event's date(s) for the tracker display: how many days,
// whether it spans a single day vs multiple, and (for multi-day) whether those days
// are consecutive (a real multi-day run, shown as a range) or scattered (separate
// dates that are linked, shown with a chain indicator).
export function summarizeGrassrootsEventDates(target = {}) {
  const dates = normalizeGrassrootsEventDates(target);
  if (dates.length === 0) return { count: 0, isMultiDay: false, isConsecutive: false, first: null, last: null, dates: [] };
  let isConsecutive = true;
  for (let i = 1; i < dates.length; i += 1) {
    if (!areGrassrootsDatesConsecutive(dates[i - 1].event_date, dates[i].event_date)) { isConsecutive = false; break; }
  }
  return {
    count: dates.length,
    isMultiDay: dates.length > 1,
    isConsecutive: dates.length > 1 ? isConsecutive : false,
    first: dates[0],
    last: dates[dates.length - 1],
    dates,
  };
}

// Closeout lives in details.closeout (the save RPC already persists `details`),
// so a "Finished" event needs no DB schema/status change.
export function getGrassrootsEventCloseout(target = {}) {
  const closeout = target?.details?.closeout;
  return closeout && typeof closeout === "object" ? closeout : null;
}

export function isGrassrootsEventClosed(target = {}) {
  return Boolean(getGrassrootsEventCloseout(target)?.closed_at);
}

// An event is "past" only once the day AFTER its final day arrives — i.e. the final
// event date is strictly before today. Today's / in-progress events are NOT past.
export function isGrassrootsEventPast(target = {}, today = new Date().toISOString().slice(0, 10)) {
  const finalDate = getGrassrootsFinalEventDate(target);
  return Boolean(finalDate) && finalDate < today;
}

// The "Past Events" view shows every event whose final day has already passed —
// overdue-but-unclosed ones included — plus any that have been closed out. (The
// default view, by contrast, only hides CLOSED events: an occurred-but-unclosed
// event still appears there, pinned to the top as a needs-closeout to-do. So an
// overdue event correctly appears in BOTH the default and Past Events views.)
export function isGrassrootsEventInPastView(target = {}, today = new Date().toISOString().slice(0, 10)) {
  return isGrassrootsEventClosed(target) || isGrassrootsEventPast(target, today);
}

// You can only close out an event once you've reached (or passed) its final day.
export function canCloseGrassrootsEvent(target = {}, today = new Date().toISOString().slice(0, 10)) {
  if (isGrassrootsEventClosed(target)) return false;
  const finalDate = getGrassrootsFinalEventDate(target);
  return Boolean(finalDate) && finalDate <= today;
}

export const GRASSROOTS_FINISHED_STATUS = "finished";

// Display-only status: a closed event reads as "Finished" even though its stored DB
// status stays one of the four canonical values (the CHECK constraint forbids others).
export function getGrassrootsEventDisplayStatus(target = {}) {
  if (isGrassrootsEventClosed(target)) return GRASSROOTS_FINISHED_STATUS;
  return normalizeGrassrootsStatus(target.status);
}

export function getGrassrootsDisplayStatusLabel(target = {}) {
  const closeout = getGrassrootsEventCloseout(target);
  if (closeout?.closed_at) return closeout.disposition === "cancelled" ? "Cancelled" : "Finished";
  return getGrassrootsStatusLabel(target.status);
}

// Which required field groups on an event row are not yet filled in. Drives the
// persistent "more info needed" affordance on the tracker so missing data is
// obvious without training. Returns per-group booleans plus the missing labels
// (used to build a specific tooltip). Cost is intentionally NOT required here —
// it's prompted in context and only needed at closeout for CPL.
export function getGrassrootsEventFieldGaps(target = {}) {
  const split = getGrassrootsSplitAddress(target);
  const hasAddress = Boolean(
    String(target.address || "").trim()
    || split.address_line_1 || split.address_city || split.address_state || split.address_postal_code,
  );
  const hasType = Boolean(normalizeGrassrootsEventType(target.event_type));
  const hasOrganizer = Boolean(
    String(target.organizer || "").trim()
    || String(target.first_name || "").trim()
    || String(target.last_name || "").trim()
    || String(target.contact_source || "").trim(),
  );
  const hasDate = Boolean(getGrassrootsFinalEventDate(target));

  const eventMissing = [];
  if (!hasAddress) eventMissing.push("address");
  if (!hasType) eventMissing.push("type");
  const organizerMissing = hasOrganizer ? [] : ["organizer"];
  const dateMissing = hasDate ? [] : ["date"];

  return {
    organizer: organizerMissing.length > 0,
    event: eventMissing.length > 0,
    date: dateMissing.length > 0,
    organizerMissing,
    eventMissing,
    dateMissing,
  };
}

// Pure builder for the details.closeout payload written when an event is closed out.
// disposition: "completed" (attended → leads/CPL) or "cancelled" (couldn't attend —
// the cost is sunk, leads are 0/none). Cancelled events still leave the active view
// and keep their cost on the books as marketing spend.
export function makeGrassrootsEventCloseout({ leadsCaptured, cpl, notes, closedAt, closedByUserId, closedByName, disposition } = {}) {
  const resolvedDisposition = disposition === "cancelled" ? "cancelled" : "completed";
  return {
    closed_at: closedAt || new Date().toISOString().slice(0, 10),
    disposition: resolvedDisposition,
    leads_captured: resolvedDisposition === "cancelled" ? 0 : (parseInteger(leadsCaptured) ?? 0),
    cpl: resolvedDisposition === "cancelled" ? null : (parseDecimal(cpl) ?? null),
    notes: String(notes || "").trim(),
    closed_by_user_id: closedByUserId || null,
    closed_by_name: closedByName || null,
  };
}

export function compareGrassrootsEventSchedule(left = {}, right = {}, today = new Date().toISOString().slice(0, 10), direction = "asc") {
  const leftDate = getGrassrootsNextEventDate(left, today);
  const rightDate = getGrassrootsNextEventDate(right, today);
  if (!leftDate && !rightDate) return normalizeText(left.name).localeCompare(normalizeText(right.name));
  if (!leftDate) return 1;
  if (!rightDate) return -1;

  if (direction === "desc") {
    const dateCompare = rightDate.localeCompare(leftDate);
    return dateCompare || normalizeText(left.name).localeCompare(normalizeText(right.name));
  }

  const leftUpcoming = leftDate >= today;
  const rightUpcoming = rightDate >= today;
  if (leftUpcoming !== rightUpcoming) return leftUpcoming ? -1 : 1;
  const dateCompare = leftUpcoming ? leftDate.localeCompare(rightDate) : rightDate.localeCompare(leftDate);
  return dateCompare || normalizeText(left.name).localeCompare(normalizeText(right.name));
}

function hasGrassrootsEventDateInRange(target = {}, startDate = "", endDate = "") {
  return normalizeGrassrootsEventDates(target).some((row) => row.event_date >= startDate && row.event_date <= endDate);
}

function normalizeGrassrootsMetricDate(value) {
  const text = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  return "";
}

function hasGrassrootsEventMetricDateInRange(target = {}, startDate = "", endDate = "") {
  if (hasGrassrootsEventDateInRange(target, startDate, endDate)) return true;
  const fallbackDates = [
    target.initial_contact_date,
    target.last_contact_date,
    target.created_at,
    target.updated_at,
  ].map(normalizeGrassrootsMetricDate).filter(Boolean);
  return fallbackDates.some((date) => date >= startDate && date <= endDate);
}

function isGrassrootsEventCompletedBefore(target = {}, today = new Date().toISOString().slice(0, 10)) {
  const dates = normalizeGrassrootsEventDates(target);
  if (dates.length === 0) return false;
  return dates[dates.length - 1].event_date < today;
}

function isGrassrootsEventUpcomingOnOrAfter(target = {}, today = new Date().toISOString().slice(0, 10)) {
  return normalizeGrassrootsEventDates(target).some((row) => row.event_date >= today);
}

export function buildGrassrootsEventMetrics(targets = [], today = new Date().toISOString().slice(0, 10)) {
  const year = today.slice(0, 4);
  const month = today.slice(0, 7);
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-31`;
  const eventTargets = targets.filter((target) => getGrassrootsCategoryConfig(target.category).id === "events");
  const bookedEvents = eventTargets.filter((target) => normalizeGrassrootsStatus(target.status) === "booked");
  return {
    year,
    month,
    bookedUpcomingThisYear: bookedEvents.filter((target) => (
      hasGrassrootsEventDateInRange(target, yearStart, yearEnd)
      && isGrassrootsEventUpcomingOnOrAfter(target, today)
    )).length,
    bookedCompletedThisYear: bookedEvents.filter((target) => (
      hasGrassrootsEventDateInRange(target, yearStart, yearEnd)
      && isGrassrootsEventCompletedBefore(target, today)
    )).length,
    identifiedThisYear: eventTargets.filter((target) => (
      normalizeGrassrootsStatus(target.status) === "identified"
      && hasGrassrootsEventMetricDateInRange(target, yearStart, yearEnd)
    )).length,
    correspondingThisYear: eventTargets.filter((target) => (
      normalizeGrassrootsStatus(target.status) === "corresponding"
      && hasGrassrootsEventMetricDateInRange(target, yearStart, yearEnd)
    )).length,
    bookedThisMonth: bookedEvents.filter((target) => hasGrassrootsEventDateInRange(target, monthStart, monthEnd)).length,
  };
}

function getGrassrootsActivityMetricDate(activity = {}) {
  return normalizeGrassrootsMetricDate(activity.activity_date || activity.created_at || activity.updated_at);
}

function isGrassrootsDropActivity(activity = {}, targetById = new Map()) {
  const activityType = String(activity.activity_type || "").trim();
  if (activityType && activityType !== "drop") return false;

  const targetId = String(activity.target_id || "").trim();
  const target = targetById.get(targetId);
  if (target) return getGrassrootsCategoryConfig(target.category).id === "drops";

  const category = activity.category || activity.target_category;
  if (category) return getGrassrootsCategoryConfig(category).id === "drops";

  return activityType === "drop";
}

export function buildGrassrootsDropMetrics(targets = [], activities = [], today = new Date().toISOString().slice(0, 10)) {
  const year = today.slice(0, 4);
  const last30Start = addDays(today, -29);
  const yearStart = `${year}-01-01`;
  const targetById = new Map((targets || [])
    .filter((target) => target?.id)
    .map((target) => [String(target.id), target]));

  const dropActivities = (activities || [])
    .filter((activity) => isGrassrootsDropActivity(activity, targetById))
    .map((activity) => ({
      targetId: String(activity.target_id || "").trim(),
      date: getGrassrootsActivityMetricDate(activity),
    }))
    .filter((activity) => activity.date);

  const last30 = dropActivities.filter((activity) => activity.date >= last30Start && activity.date <= today);
  const yearToDate = dropActivities.filter((activity) => activity.date >= yearStart && activity.date <= today);
  const uniqueBusinessCount = (rows) => new Set(rows.map((activity) => activity.targetId).filter(Boolean)).size;

  return {
    year,
    last30Start,
    last30End: today,
    dropVisitsLast30: last30.length,
    businessesVisitedLast30: uniqueBusinessCount(last30),
    dropVisitsYtd: yearToDate.length,
    businessesVisitedYtd: uniqueBusinessCount(yearToDate),
  };
}

export function buildGrassrootsDropCategoryCounts(rows = []) {
  const countsByCategory = new Map(GRASSROOTS_DROP_CATEGORY_OPTIONS.map((category) => [category, 0]));
  (rows || []).forEach((row) => {
    const category = getGrassrootsDropCategoryBucket(row?.businessCategory);
    countsByCategory.set(category, (countsByCategory.get(category) || 0) + 1);
  });
  return [
    { category: "All", count: rows.length },
    ...GRASSROOTS_DROP_CATEGORY_OPTIONS.map((category) => ({ category, count: countsByCategory.get(category) || 0 })),
  ];
}

export function filterGrassrootsDropActivityRowsByCategory(rows = [], category = "All") {
  const normalizedCategory = normalizeGrassrootsDropBusinessCategory(category);
  if (!normalizedCategory || normalizedCategory === "All") return rows;
  const categoryBucket = GRASSROOTS_DROP_CATEGORY_OPTIONS.includes(normalizedCategory) ? normalizedCategory : "Other";
  return (rows || []).filter((row) => getGrassrootsDropCategoryBucket(row?.businessCategory) === categoryBucket);
}

export function makeBlankGrassrootsTarget(category = "events") {
  const config = getGrassrootsCategoryConfig(category);
  const isEvent = config.id === "events";
  return {
    id: `draft_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    category: config.dbValue,
    name: "",
    address: "",
    address_line_1: "",
    address_line_2: "",
    address_city: "",
    address_state: "",
    address_postal_code: "",
    address_country: "",
    google_place_id: "",
    first_name: "",
    last_name: "",
    contact_source: "",
    contact_email: "",
    contact_phone: "",
    status: "identified",
    is_active: true,
    business_category: "",
    drop_category: "",
    local_employees: "",
    us_employees: "",
    proposal: "",
    initial_contact_date: "",
    last_contact_date: "",
    next_contact_date: "",
    event_start_date: "",
    event_end_date: "",
    event_time: "",
    event_type: "",
    event_dates: [],
    is_multi_day_event: false,
    expected_audience: "",
    leads_captured: isEvent ? 0 : "",
    cost: "",
    cpl: "",
    organizer: "",
    details: {},
    isDraft: true,
  };
}

export function getGrassrootsAddressText(target = {}) {
  return normalizeText(target.address);
}

export function getGrassrootsSplitAddress(target = {}) {
  return {
    address_line_1: normalizeText(target.address_line_1),
    address_line_2: normalizeText(target.address_line_2),
    address_city: normalizeText(target.address_city),
    address_state: normalizeText(target.address_state),
    address_postal_code: normalizeText(target.address_postal_code),
    address_country: normalizeText(target.address_country),
    google_place_id: normalizeText(target.google_place_id),
  };
}

export function buildGrassrootsEventDateRpcRows(target = {}) {
  return normalizeGrassrootsEventDates(target).map((row, index) => ({
    event_date: row.event_date,
    start_time: row.start_time || null,
    end_time: row.end_time || null,
    sequence_order: index + 1,
  }));
}

export function buildGrassrootsEventSaveRpcArgs(targetPayload = {}, eventDateSource = {}) {
  return {
    p_target: targetPayload && typeof targetPayload === "object" ? targetPayload : {},
    p_event_dates: buildGrassrootsEventDateRpcRows(eventDateSource),
  };
}

export function normalizeLegacyGrassrootsTracker(settingValue = {}) {
  const value = settingValue && typeof settingValue === "object" ? settingValue : {};
  return {
    events: normalizeLegacyArray(value.events).map((row, index) => normalizeLegacyTarget("events", row, index)),
    drops: normalizeLegacyDropTargets(value.drops || []),
    corporatePartnerships: normalizeLegacyArray(value.corporatePartnerships).map((row, index) => normalizeLegacyTarget("corporatePartnerships", row, index)),
    apartments: normalizeLegacyArray(value.apartments).map((row, index) => normalizeLegacyTarget("apartments", row, index)),
    petProfessionalPartnerships: normalizeLegacyArray(value.petProfessionalPartnerships).map((row, index) => normalizeLegacyTarget("petProfessionalPartnerships", row, index)),
  };
}

function normalizeLegacyArray(value) {
  return Array.isArray(value) ? value.filter((row) => row && typeof row === "object") : [];
}

function normalizeLegacyTarget(category, row, index) {
  const config = getGrassrootsCategoryConfig(category);
  const base = {
    ...makeBlankGrassrootsTarget(category),
    id: row.id || `${config.dbValue}_legacy_${index}`,
    isDraft: false,
    legacy_source_id: row.id || `${config.dbValue}:${index}`,
    details: { legacy_row: row },
  };

  if (category === "events") {
    return {
      ...base,
      name: normalizeText(row.event),
      organizer: normalizeText(row.organizer),
      event_start_date: parseDate(row.startDate),
      event_end_date: parseDate(row.endDate),
      event_time: normalizeText(row.time),
      event_type: normalizeGrassrootsEventType(row.type),
      expected_audience: parseInteger(row.expectedAudience) ?? "",
      leads_captured: parseInteger(row.leadsCaptured) ?? "",
      cost: parseDecimal(row.cost) ?? "",
      cpl: parseDecimal(row.cpl) ?? "",
      contact_source: normalizeText(row.contact),
      status: normalizeText(row.officiallyBooked).toLowerCase().startsWith("y") ? "booked" : "identified",
      event_dates: normalizeGrassrootsEventDates({
        event_start_date: parseDate(row.startDate),
        event_end_date: parseDate(row.endDate),
        event_time: normalizeText(row.time),
      }),
    };
  }

  if (category === "corporatePartnerships") {
    return {
      ...base,
      name: normalizeText(row.corporation),
      first_name: normalizeText(row.firstName),
      last_name: normalizeText(row.lastName),
      us_employees: parseInteger(row.usEmployees) ?? "",
      local_employees: parseInteger(row.localEmployees ?? row.deerfieldEmployees) ?? "",
      contact_source: normalizeText(row.contactSource),
      proposal: normalizeText(row.proposal),
      initial_contact_date: parseDate(row.initialContactDate),
      last_contact_date: parseDate(row.lastContactDate),
    };
  }

  if (category === "apartments") {
    return {
      ...base,
      name: normalizeText(row.apartmentComplex),
      status: cleanStatus(row.status),
    };
  }

  return {
    ...base,
    name: normalizeText(row.business),
    first_name: normalizeText(row.firstName),
    last_name: normalizeText(row.lastName),
    proposal: normalizeText(row.proposal),
    initial_contact_date: parseDate(row.initialContactDate),
    last_contact_date: parseDate(row.lastContactDate),
  };
}

export function normalizeLegacyDropTargets(rows = []) {
  const groups = new Map();
  normalizeLegacyArray(rows).forEach((row, index) => {
    const business = normalizeText(row.business);
    const address = normalizeText(row.address);
    const key = `${normalizeKey(business)}|${normalizeKey(address)}`;
    if (!groups.has(key)) {
      groups.set(key, {
        ...makeBlankGrassrootsTarget("drops"),
        id: row.id ? `drop_group_${row.id}` : `drop_group_${index}`,
        isDraft: false,
        legacy_source_id: `drop_group:${key || index}`,
        name: business,
        address,
        business_category: normalizeText(row.dropCategory || row.category || row.type),
        drop_category: normalizeText(row.dropCategory || row.category || row.type),
        details: { legacy_drop_group_key: key },
        legacyActivities: [],
      });
    }
    groups.get(key).legacyActivities.push({
      id: row.id || `drop_activity_${index}`,
      activity_type: "drop",
      activity_date: parseDate(row.date),
      notes: normalizeText(row.notes),
      created_by_name: normalizeText(row.whoDidIt),
      metadata: {
        person_interacted_with: normalizeText(row.personInteractedWith),
        legacy_row: row,
      },
    });
  });
  return [...groups.values()];
}

function cleanStatus(value) {
  return normalizeGrassrootsStatus(value);
}

export function groupGrassrootsActivities(activities = []) {
  return activities.reduce((acc, activity) => {
    const key = activity.target_id;
    if (!key) return acc;
    if (!acc[key]) acc[key] = [];
    acc[key].push(activity);
    return acc;
  }, {});
}

export function groupGrassrootsHistory(history = []) {
  return [...history]
    .filter((entry) => entry && entry.target_id)
    .sort(compareGrassrootsHistoryDesc)
    .reduce((acc, entry) => {
      if (!acc[entry.target_id]) acc[entry.target_id] = [];
      acc[entry.target_id].push(entry);
      return acc;
    }, {});
}

export function compareGrassrootsHistoryDesc(a, b) {
  return String(b?.event_at || b?.created_at || "").localeCompare(String(a?.event_at || a?.created_at || ""));
}

export function calculateGrassrootsCpl(cost, leadsCaptured) {
  const parsedCost = Number(cost);
  const parsedLeads = Number(leadsCaptured);
  if (Number.isNaN(parsedCost) || Number.isNaN(parsedLeads) || parsedLeads <= 0) return null;
  return Math.round((parsedCost / parsedLeads) * 100) / 100;
}

export function getGrassrootsBusinessCategory(target = {}) {
  return target.business_category || target.drop_category || "";
}

export function getGrassrootsActivityCount(target, activitiesByTarget = {}) {
  const type = getGrassrootsActivityType(getGrassrootsCategoryConfig(target.category).id);
  return (activitiesByTarget[target.id] || []).filter((activity) => {
    const activityType = activity.activity_type || type;
    if (type === "development") {
      return ["development", "event_update", "note"].includes(activityType);
    }
    return activityType === type;
  }).length;
}

export function inferGrassrootsActivityAttachmentMimeType(file = {}) {
  const explicitType = stringValue(file?.type).toLowerCase();
  if (GRASSROOTS_ACTIVITY_ATTACHMENT_MIME_TYPES.includes(explicitType)) return explicitType;

  const name = stringValue(file?.name).toLowerCase();
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".heic")) return "image/heic";
  if (name.endsWith(".heif")) return "image/heif";
  return explicitType || "application/octet-stream";
}

export function sanitizeGrassrootsAttachmentFilename(value = "") {
  const rawName = String(value || "attachment")
    .split(/[\\/]/)
    .pop()
    .trim();
  const withoutControlChars = rawName.replace(/[\x00-\x1F\x7F]/g, "");
  const safe = withoutControlChars
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^\.+/, "")
    .replace(/[._-]+$/, "")
    .slice(0, 120);
  return safe || "attachment";
}

export function buildGrassrootsActivityAttachmentPath({
  locationId,
  targetId,
  activityId,
  attachmentId,
  fileName,
} = {}) {
  const cleanLocationId = normalizeUuid(locationId);
  const cleanTargetId = normalizeUuid(targetId);
  const cleanActivityId = normalizeUuid(activityId);
  const cleanAttachmentId = normalizeUuid(attachmentId);
  if (!cleanLocationId) throw new Error("Valid location id is required");
  if (!cleanTargetId) throw new Error("Valid drop business id is required");
  if (!cleanActivityId) throw new Error("Valid activity id is required");
  if (!cleanAttachmentId) throw new Error("Valid attachment id is required");

  return [
    cleanLocationId,
    "targets",
    cleanTargetId,
    "activities",
    cleanActivityId,
    `${cleanAttachmentId}-${sanitizeGrassrootsAttachmentFilename(fileName)}`,
  ].join("/");
}

export function validateGrassrootsActivityAttachmentFiles(files = []) {
  const fileList = Array.from(files || []);
  const errors = [];
  const acceptedFiles = [];

  if (fileList.length > GRASSROOTS_ACTIVITY_ATTACHMENT_MAX_FILES) {
    errors.push(`Attach up to ${GRASSROOTS_ACTIVITY_ATTACHMENT_MAX_FILES} files per activity.`);
  }

  fileList.slice(0, GRASSROOTS_ACTIVITY_ATTACHMENT_MAX_FILES).forEach((file) => {
    const mimeType = inferGrassrootsActivityAttachmentMimeType(file);
    const fileName = stringValue(file?.name) || "attachment";
    const fileSize = Number(file?.size || 0);

    if (!GRASSROOTS_ACTIVITY_ATTACHMENT_MIME_TYPES.includes(mimeType)) {
      errors.push(`${fileName} must be a PDF, PNG, JPG, WEBP, HEIC, or HEIF file.`);
      return;
    }

    if (fileSize > GRASSROOTS_ACTIVITY_ATTACHMENT_MAX_FILE_SIZE_BYTES) {
      errors.push(`${fileName} is larger than 20 MB.`);
      return;
    }

    acceptedFiles.push(file);
  });

  return { acceptedFiles, errors };
}

export function formatGrassrootsAttachmentFileSize(value) {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function getGrassrootsAttachmentPreviewKind(attachment = {}) {
  const mimeType = stringValue(attachment?.mime_type || attachment?.metadata?.mime_type).toLowerCase();
  const name = stringValue(attachment?.file_name).toLowerCase();
  if (mimeType === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (mimeType.startsWith("image/") || /\.(png|jpe?g|webp|heic|heif)$/.test(name)) return "image";
  return "unsupported";
}

export function isGrassrootsActivityAttachmentDeleted(attachment = {}) {
  return Boolean(attachment?.deleted_at);
}

export function groupGrassrootsActivityAttachments(attachments = []) {
  return attachments.reduce((acc, attachment) => {
    if (!attachment || typeof attachment !== "object") return acc;
    if (isGrassrootsActivityAttachmentDeleted(attachment)) return acc;
    const key = attachment.activity_id || "__unlinked__";
    if (!acc[key]) acc[key] = [];
    acc[key].push(attachment);
    acc[key].sort((a, b) => new Date(b.uploaded_at || 0) - new Date(a.uploaded_at || 0));
    return acc;
  }, {});
}

function normalizeGrassrootsSearchText(value = "") {
  return stringValue(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function getGrassrootsDropTargetSearchScore(target = {}, query = "") {
  const normalizedQuery = normalizeGrassrootsSearchText(query);
  if (!normalizedQuery) return 0;

  const name = normalizeGrassrootsSearchText(target.name);
  const address = normalizeGrassrootsSearchText([
    target.address_line_1,
    target.address_city,
    target.address_state,
    target.address_postal_code,
    target.address,
  ].filter(Boolean).join(" "));
  const category = normalizeGrassrootsSearchText(getGrassrootsBusinessCategory(target));
  const haystack = [name, address, category].filter(Boolean).join(" ");

  if (name === normalizedQuery) return 120;
  if (name.startsWith(normalizedQuery)) return 100;
  if (name.includes(normalizedQuery)) return 82;
  if (address.includes(normalizedQuery)) return 52;
  if (haystack.includes(normalizedQuery)) return 36;

  const queryParts = normalizedQuery.split(" ").filter((part) => part.length >= 2);
  if (queryParts.length > 0 && queryParts.every((part) => haystack.includes(part))) return 24;
  return 0;
}

export function searchGrassrootsDropBusinessTargets({
  targets = [],
  activitiesByTarget = {},
  query = "",
  limit = 6,
  includeInactive = true,
} = {}) {
  return (targets || [])
    .filter((target) => getGrassrootsCategoryConfig(target?.category).id === "drops")
    .filter((target) => includeInactive || target.is_active !== false)
    .map((target) => {
      const activityCount = getGrassrootsActivityCount(target, activitiesByTarget);
      const activities = activitiesByTarget[target.id] || [];
      const lastActivity = [...activities]
        .filter((activity) => (activity.activity_type || "drop") === "drop")
        .sort((a, b) => String(b.activity_date || b.created_at || "").localeCompare(String(a.activity_date || a.created_at || "")))[0];
      return {
        target,
        activityCount,
        lastActivityDate: lastActivity?.activity_date || lastActivity?.created_at || "",
        nextDropDate: getGrassrootsNextDate(target, activitiesByTarget),
        score: getGrassrootsDropTargetSearchScore(target, query),
      };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.activityCount !== a.activityCount) return b.activityCount - a.activityCount;
      return String(a.target.name || "").localeCompare(String(b.target.name || ""));
    })
    .slice(0, limit);
}

export function buildGrassrootsDropActivityRows(targets = [], activities = [], attachmentsByActivity = {}) {
  const targetById = new Map((targets || [])
    .filter((target) => target?.id)
    .map((target) => [String(target.id), target]));

  return (activities || [])
    .filter((activity) => isGrassrootsDropActivity(activity, targetById))
    .map((activity) => {
      const target = targetById.get(String(activity.target_id || ""));
      const metadata = activity.metadata && typeof activity.metadata === "object" ? activity.metadata : {};
      return {
        id: activity.id,
        activity,
        target,
        targetId: activity.target_id,
        businessName: target?.name || "Unknown business",
        businessAddress: target?.address || "",
        businessCategory: getGrassrootsBusinessCategory(target || {}),
        activityDate: activity.activity_date || "",
        createdAt: activity.created_at || "",
        loggedBy: activity.created_by_name || "Unknown user",
        notes: activity.notes || "",
        nextDropDate: activity.next_contact_date || "",
        personSpokenWith: metadata.person_spoken_with || metadata.person_interacted_with || "",
        materialsLeft: metadata.materials_left || "",
        outcome: metadata.outcome || "",
        followUpPriority: Boolean(metadata.follow_up_priority),
        partnershipPotential: Boolean(metadata.partnership_potential),
        attachments: attachmentsByActivity[activity.id] || [],
      };
    })
    .sort((a, b) => String(b.activityDate || b.createdAt || "").localeCompare(String(a.activityDate || a.createdAt || "")));
}

export function getGrassrootsNextDate(target, activitiesByTarget = {}) {
  if (target.next_contact_date) return target.next_contact_date;
  const latestWithNext = [...(activitiesByTarget[target.id] || [])]
    .filter((activity) => activity.next_contact_date)
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))[0];
  return latestWithNext?.next_contact_date || "";
}

export function buildGrassrootsMetrics(targets = [], activitiesByTarget = {}, today = new Date().toISOString().slice(0, 10)) {
  const visible = targets.filter(Boolean);
  return {
    total: visible.length,
    active: visible.filter((target) => target.is_active !== false).length,
    inactive: visible.filter((target) => target.is_active === false).length,
    abandoned: visible.filter((target) => normalizeGrassrootsStatus(target.status) === "abandoned").length,
    activities: visible.reduce((sum, target) => sum + getGrassrootsActivityCount(target, activitiesByTarget), 0),
    upcoming: visible.filter((target) => {
      const next = getGrassrootsNextDate(target, activitiesByTarget);
      return next && next >= today;
    }).length,
    overdue: visible.filter((target) => {
      const next = getGrassrootsNextDate(target, activitiesByTarget);
      return next && next < today;
    }).length,
  };
}

export function applyGrassrootsFilters(targets = [], activitiesByTarget = {}, filters = {}, today = new Date().toISOString().slice(0, 10)) {
  const keys = Object.keys(filters || {});
  if (keys.length === 0) return targets;
  const needsValue = (op) => !["empty", "notEmpty", "overdue", "today", "thisWeek", "hasDate", "noDate"].includes(op);

  return targets.filter((target) => keys.every((key) => {
    const filter = filters[key];
    if (!filter) return true;
    const op = filter.op;
    const val = filter.val;
    if (needsValue(op) && val === "") return true;

    if (key === "is_active") {
      const status = target.is_active === false ? "inactive" : "active";
      if (val === "all") return true;
      if (op === "is") return status === val;
      if (op === "isNot") return status !== val;
      return true;
    }

    if (key === "activity_count") {
      return matchNumber(getGrassrootsActivityCount(target, activitiesByTarget), op, val);
    }

    if (key === "next_contact_date") {
      return matchDate(getGrassrootsNextDate(target, activitiesByTarget), op, val, today);
    }

    if (["initial_contact_date", "last_contact_date", "event_start_date", "event_end_date"].includes(key)) {
      const sourceDate = key === "event_start_date" ? getGrassrootsPrimaryEventDate(target) : target[key];
      return matchDate(sourceDate, op, val, today);
    }

    if (["local_employees", "us_employees", "expected_audience", "leads_captured", "cost", "cpl"].includes(key)) {
      return matchNumber(target[key], op, val);
    }

    if (key === "status") {
      const status = normalizeGrassrootsStatus(target.status);
      const filterStatus = normalizeGrassrootsStatus(val);
      if (op === "is") return status === filterStatus;
      if (op === "isNot") return status !== filterStatus;
      return true;
    }

    if (key === "business_category" || key === "drop_category") {
      const businessCategory = getGrassrootsBusinessCategory(target);
      if (op === "is") return businessCategory === val;
      if (op === "isNot") return businessCategory !== val;
      return true;
    }

    return matchText(target[key], op, val);
  }));
}

function matchText(source, op, value) {
  const left = String(source || "").toLowerCase();
  const right = String(value || "").toLowerCase();
  if (op === "contains") return left.includes(right);
  if (op === "equals") return left === right;
  if (op === "starts") return left.startsWith(right);
  if (op === "empty") return !left;
  if (op === "notEmpty") return !!left;
  return true;
}

function matchNumber(source, op, value) {
  const left = Number(source);
  const right = Number(value);
  if (Number.isNaN(left) || Number.isNaN(right)) return false;
  if (op === "=") return left === right;
  if (op === ">=") return left >= right;
  if (op === "<=") return left <= right;
  if (op === ">") return left > right;
  if (op === "<") return left < right;
  return true;
}

function matchDate(source, op, value, today) {
  const date = String(source || "");
  if (op === "hasDate") return !!date;
  if (op === "noDate") return !date;
  if (op === "overdue") return !!date && date < today;
  if (op === "today") return date === today;
  if (op === "thisWeek") {
    if (!date) return false;
    const start = startOfWeek(today);
    const end = addDays(start, 6);
    return date >= start && date <= end;
  }
  if (!date) return false;
  if (op === "after") return date > value;
  if (op === "before") return date < value;
  if (op === "inLastDays") {
    const days = Number(value);
    if (Number.isNaN(days)) return false;
    return date >= addDays(today, -days) && date <= today;
  }
  return true;
}

function startOfWeek(dateStr) {
  const base = new Date(`${dateStr}T12:00:00`);
  const day = base.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  base.setDate(base.getDate() + diff);
  return base.toISOString().slice(0, 10);
}

function addDays(dateStr, days) {
  const base = new Date(`${dateStr}T12:00:00`);
  base.setDate(base.getDate() + days);
  return base.toISOString().slice(0, 10);
}
