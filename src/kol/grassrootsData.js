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
    label: "Drops",
    singular: "Drop Business",
    activityLabel: "Drop",
    logLabel: "Log Drop",
    countLabel: "Drops",
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

export const GRASSROOTS_DEFAULT_FILTERS = {
  is_active: { op: "is", val: "active" },
};

export function getGrassrootsDefaultFilters(category = "events") {
  const config = getGrassrootsCategoryConfig(category);
  if (config.id === "events") {
    return {
      ...GRASSROOTS_DEFAULT_FILTERS,
      leads_captured: { op: "=", val: "0" },
    };
  }
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
