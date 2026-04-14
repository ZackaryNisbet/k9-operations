export type BathStatusContextCode =
  | "scheduled_other_day"
  | "no_bath_detected"
  | "manual_override";

export interface BathStatusContext {
  code: BathStatusContextCode;
  message: string;
  scheduledDate?: string;
}

export interface BathLikeService {
  id?: string;
  name: string;
  scheduledAt: string;
  completedAt: string;
}

const BATH_TYPE_RULES: Array<{ match: (value: string) => boolean; label: string }> = [
  {
    match: (value) =>
      value.includes("hypo") && value.includes("no spray"),
    label: "Hypoallergenic - NO SPRAY",
  },
  {
    match: (value) =>
      value.includes("hypo") && value.includes("with spray"),
    label: "Hypoallergenic - WITH SPRAY",
  },
  {
    match: (value) =>
      value.includes("hypo") || value.includes("hypoallergenic"),
    label: "Hypoallergenic",
  },
  {
    match: (value) =>
      value.includes("shampoo from home") || value.includes("from home"),
    label: "Shampoo From Home",
  },
  {
    match: (value) =>
      value.includes("fresh n clean") || value.includes("fresh & clean"),
    label: "Fresh N Clean",
  },
  {
    match: (value) => value.includes("water rinse"),
    label: "Water Rinse",
  },
  {
    match: (value) => value.includes("premium"),
    label: "Premium",
  },
  {
    match: (value) => value.includes("medicated"),
    label: "Medicated",
  },
  {
    match: (value) => value.includes("whitening"),
    label: "Whitening",
  },
  {
    match: (value) => value === "bath" || value.includes("standard"),
    label: "Standard",
  },
];

const BATH_MODIFIER_RULES: Array<{ match: (value: string) => boolean; label: string }> = [
  {
    match: (value) => value.includes("no crate dryer"),
    label: "NO CRATE DRYER",
  },
  {
    match: (value) => value.includes("no velocity dryer"),
    label: "NO VELOCITY DRYER",
  },
  {
    match: (value) =>
      value === "no dryer" || (value.includes("no dryer") && !value.includes("spray")),
    label: "NO DRYER",
  },
  {
    match: (value) => value.includes("towel dry only"),
    label: "TOWEL DRY ONLY",
  },
  {
    match: (value) => value.includes("see account notes"),
    label: "*See account notes*",
  },
];

const TYPE_ORDER = new Map<string, number>([
  ["Fresh N Clean", 0],
  ["Premium", 1],
  ["Medicated", 2],
  ["Whitening", 3],
  ["Shampoo From Home", 4],
  ["Hypoallergenic - NO SPRAY", 5],
  ["Hypoallergenic - WITH SPRAY", 6],
  ["Hypoallergenic", 7],
  ["Water Rinse", 8],
  ["Standard", 9],
]);

const MODIFIER_ORDER = new Map<string, number>([
  ["NO DRYER", 0],
  ["NO CRATE DRYER", 1],
  ["NO VELOCITY DRYER", 2],
  ["TOWEL DRY ONLY", 3],
  ["*See account notes*", 4],
]);

export const KNOWN_BATH_TYPE_LABELS = [...TYPE_ORDER.keys()];
export const KNOWN_BATH_MODIFIER_LABELS = [...MODIFIER_ORDER.keys()];

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function toKey(value: string | null | undefined): string {
  return normalizeWhitespace(String(value || "")).toLowerCase();
}

export function getDateKey(value: string | null | undefined): string | null {
  const match = String(value || "").match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] || null;
}

export function formatDateWithWeekday(dateKey: string | null | undefined): string {
  if (!dateKey) return "";
  const date = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function isBoardingReservation(typeName: string | null | undefined): boolean {
  const value = toKey(typeName);
  return value.includes("boarding") && !value.includes("day boarding");
}

export function calculateNights(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
): number {
  const startKey = getDateKey(startDate);
  const endKey = getDateKey(endDate);
  if (!startKey || !endKey) return 0;
  const startMs = new Date(`${startKey}T12:00:00`).getTime();
  const endMs = new Date(`${endKey}T12:00:00`).getTime();
  return Math.max(0, Math.round((endMs - startMs) / (24 * 60 * 60 * 1000)));
}

export function isBathOrGroomName(name: string | null | undefined): boolean {
  const value = toKey(name);
  return value.includes("bath") || value.includes("groom");
}

export function extractBathLikeServices(
  rawServices: any[] = [],
  topServices: any[] = [],
): BathLikeService[] {
  const deduped = new Map<string, BathLikeService>();

  for (const service of [...rawServices, ...topServices]) {
    const name = normalizeWhitespace(
      typeof service === "string" ? service : service?.name || service?.service_name || "",
    );
    if (!name || !isBathOrGroomName(name)) continue;

    const scheduledAt = String(
      typeof service === "object"
        ? service?.scheduled_at || service?.scheduled_date || ""
        : "",
    );
    const completedAt = String(
      typeof service === "object" ? service?.completed_at || "" : "",
    );
    const id = typeof service === "object" && service?.id != null ? String(service.id) : "";
    const dedupeKey = `${toKey(name)}|${scheduledAt}|${id}`;

    if (!deduped.has(dedupeKey)) {
      deduped.set(dedupeKey, { id, name, scheduledAt, completedAt });
    }
  }

  return [...deduped.values()].sort((a, b) => {
    const aDate = getDateKey(a.scheduledAt) || "9999-12-31";
    const bDate = getDateKey(b.scheduledAt) || "9999-12-31";
    if (aDate !== bDate) return aDate.localeCompare(bDate);
    return a.name.localeCompare(b.name);
  });
}

export function getBathSchedulingForDate(
  services: BathLikeService[],
  targetDate: string,
): {
  scheduledToday: BathLikeService | null;
  scheduledOtherDay: BathLikeService | null;
  hasBathOrGroom: boolean;
} {
  let scheduledToday: BathLikeService | null = null;
  let scheduledOtherDay: BathLikeService | null = null;

  for (const service of services) {
    const serviceDate = getDateKey(service.scheduledAt);
    if (serviceDate === targetDate) {
      if (!scheduledToday) scheduledToday = service;
      continue;
    }

    if (!scheduledOtherDay) {
      scheduledOtherDay = service;
    }
  }

  return {
    scheduledToday,
    scheduledOtherDay,
    hasBathOrGroom: services.length > 0,
  };
}

export function buildSuggestedBathStatusContext(
  targetDate: string,
  scheduledOtherDay: BathLikeService | null,
): BathStatusContext {
  const departureLabel = formatDateWithWeekday(targetDate);
  const scheduledDate = getDateKey(scheduledOtherDay?.scheduledAt);

  if (scheduledOtherDay) {
    if (scheduledDate) {
      return {
        code: "scheduled_other_day",
        scheduledDate,
        message: `Bath scheduled ${formatDateWithWeekday(scheduledDate)}; departure ${departureLabel}`,
      };
    }

    return {
      code: "scheduled_other_day",
      message: `Bath detected outside the departure day; departure ${departureLabel}`,
    };
  }

  return {
    code: "no_bath_detected",
    message: "No bath detected during this stay",
  };
}

export function buildManualBathStatusContext(
  addedByName?: string | null,
  note?: string | null,
): BathStatusContext {
  const by = normalizeWhitespace(String(addedByName || ""));
  const cleanNote = normalizeWhitespace(String(note || ""));

  if (cleanNote) {
    return {
      code: "manual_override",
      message: `Manually added: ${cleanNote}`,
    };
  }

  if (by) {
    return {
      code: "manual_override",
      message: `Manually added by ${by}`,
    };
  }

  return {
    code: "manual_override",
    message: "Manually added to this report",
  };
}

export function normalizeBathTypeLabel(label: string | null | undefined): string | null {
  const value = toKey(label);
  if (!value) return null;
  for (const rule of BATH_TYPE_RULES) {
    if (rule.match(value)) return rule.label;
  }
  return null;
}

export function normalizeBathModifierLabel(label: string | null | undefined): string | null {
  const value = toKey(label);
  if (!value) return null;
  for (const rule of BATH_MODIFIER_RULES) {
    if (rule.match(value)) return rule.label;
  }
  return null;
}

export function sanitizeBathModifierLabels(labels: Array<string | null | undefined>): string[] {
  const modifierSet = new Set<string>();
  for (const label of labels) {
    const normalized = normalizeBathModifierLabel(label);
    if (normalized) modifierSet.add(normalized);
  }
  return sortByKnownOrder([...modifierSet], MODIFIER_ORDER);
}

function sortByKnownOrder(values: string[], order: Map<string, number>): string[] {
  return [...values].sort((a, b) => {
    const aOrder = order.get(a) ?? 999;
    const bOrder = order.get(b) ?? 999;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.localeCompare(b);
  });
}

export function normalizeBathDisplay(args: {
  iconTitles?: string[] | null;
  addonType?: string | null;
  serviceName?: string | null;
  rawModifiers?: string[] | null;
  defaultType?: string | null;
}): {
  bathType: string;
  bathIcons: string[];
  bathModifiers: string[];
} {
  const typeSet = new Set<string>();
  const modifierSet = new Set<string>();

  const rawValues = [
    ...(args.iconTitles || []),
    ...(args.rawModifiers || []),
    args.addonType || "",
    args.serviceName || "",
  ].filter(Boolean);

  for (const rawValue of rawValues) {
    const modifier = normalizeBathModifierLabel(rawValue);
    if (modifier) {
      modifierSet.add(modifier);
      continue;
    }

    const type = normalizeBathTypeLabel(rawValue);
    if (type) {
      typeSet.add(type);
    }
  }

  const defaultType = normalizeBathTypeLabel(args.defaultType || "") || null;
  if (typeSet.size === 0) {
    typeSet.add(defaultType || "Standard");
  }

  const bathIcons = sortByKnownOrder([...typeSet], TYPE_ORDER);
  const bathModifiers = sortByKnownOrder([...modifierSet], MODIFIER_ORDER);

  return {
    bathType: bathIcons[0] || "Standard",
    bathIcons,
    bathModifiers,
  };
}
