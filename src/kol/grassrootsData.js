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
  { value: "outreach", label: "Outreach" },
  { value: "corresponding", label: "Corresponding" },
  { value: "closing", label: "Closing" },
  { value: "active", label: "Active" },
];

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
  const found = GRASSROOTS_STATUS_OPTIONS.find((option) => option.value === value);
  return found?.label || "Outreach";
}

export function makeBlankGrassrootsTarget(category = "events") {
  const config = getGrassrootsCategoryConfig(category);
  const isEvent = config.id === "events";
  return {
    id: `draft_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    category: config.dbValue,
    name: "",
    address: "",
    first_name: "",
    last_name: "",
    contact_source: "",
    contact_email: "",
    contact_phone: "",
    status: "outreach",
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
    expected_audience: "",
    leads_captured: isEvent ? 0 : "",
    cost: "",
    cpl: "",
    organizer: "",
    details: {},
    isDraft: true,
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
      event_type: normalizeText(row.type),
      expected_audience: parseInteger(row.expectedAudience) ?? "",
      leads_captured: parseInteger(row.leadsCaptured) ?? "",
      cost: parseDecimal(row.cost) ?? "",
      cpl: parseDecimal(row.cpl) ?? "",
      contact_source: normalizeText(row.contact),
      status: normalizeText(row.officiallyBooked).toLowerCase().startsWith("y") ? "active" : "outreach",
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
  const normalized = normalizeKey(value).replace(/\s+/g, "_");
  return GRASSROOTS_STATUS_OPTIONS.some((option) => option.value === normalized) ? normalized : "outreach";
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
      return matchDate(target[key], op, val, today);
    }

    if (["local_employees", "us_employees", "expected_audience", "leads_captured", "cost", "cpl"].includes(key)) {
      return matchNumber(target[key], op, val);
    }

    if (key === "status") {
      if (op === "is") return target.status === val;
      if (op === "isNot") return target.status !== val;
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
