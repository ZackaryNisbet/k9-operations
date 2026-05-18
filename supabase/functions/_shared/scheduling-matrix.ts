import {
  extractBathLikeServices,
  calculateNights,
  getBathSchedulingForDate,
} from "./bathing-logic.ts";
import {
  buildPlaygroupAssignmentMap,
  fetchPlaygroupAssignments,
  type PlaygroupAssignment,
} from "./playgroup-assignments.ts";

type SupabaseClient = any;

type ReservationTypeRow = {
  gingr_id?: string | null;
  name?: string | null;
  is_boarding?: boolean | null;
  is_daycare?: boolean | null;
  single_day?: boolean | null;
};

type ReservationRow = {
  gingr_id?: string | null;
  animal_gingr_id?: string | null;
  animal_name?: string | null;
  reservation_type_id?: string | null;
  reservation_type_name?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  check_in_date?: string | null;
  check_out_date?: string | null;
  cancelled_date?: string | null;
  created_date?: string | null;
  confirmed_date?: string | null;
  created_at?: string | null;
  raw_data?: any | null;
  services?: any[] | null;
};

type GingrWidgetPerTypeCount = {
  type_name: string;
  check_ins: number;
  check_outs: number;
  overnight: number;
  total: number;
  raw?: any;
};

type GingrWidgetSourceCounts = {
  date: string;
  check_ins: number;
  check_outs: number;
  overnight: number;
  total: number;
  boarding: {
    check_ins: number;
    check_outs: number;
    overnight: number;
    opening: number;
    total: number;
  };
  daytime: {
    check_ins: number;
    check_outs: number;
    overnight: number;
    total: number;
  };
  other: {
    check_ins: number;
    check_outs: number;
    overnight: number;
    total: number;
  };
  per_type: Array<GingrWidgetPerTypeCount & { cls: ReturnType<typeof classifySchedulingReservationType> }>;
  synced_at?: string | null;
};

const ANIMAL_HISTORY_BATCH_SIZE = 200;
const PROJECTION_MODEL_VERSION = "booking_curve_v3_default_volume_multiyear_history";
const PROJECTION_CALIBRATION_LOOKBACK_DAYS = 28;
const PROJECTION_CALIBRATION_MIN_SAMPLES = 3;
const PROJECTION_YOY_ADJUSTMENT_MIN = 0.75;
const PROJECTION_YOY_ADJUSTMENT_MAX = 1.25;
const PROJECTION_WEEKLY_YOY_ADJUSTMENT_MIN = 0.8;
const PROJECTION_WEEKLY_YOY_ADJUSTMENT_MAX = 1.2;
const PROJECTION_WEEKLY_LOOKBACK_WEEKS = 6;
const PROJECTION_WEEKLY_ADJUSTMENT_MIN = 0.25;
const PROJECTION_WEEKLY_ADJUSTMENT_MAX = 1.15;
const DEFAULT_BOARDING_MULTI_DOG_FACTOR = 1.25;
const OPENING_BOARDING_DISPLAY_KEYS = [
  "large_boarding",
  "small_boarding",
  "private_play_boarding",
  "half_and_half_boarding",
  "evaluation_boarding",
  "unclassified_boarding",
];
const CLOSING_BOARDING_DISPLAY_KEYS = [...OPENING_BOARDING_DISPLAY_KEYS];
const DEPARTING_BOARDING_DISPLAY_KEYS = [...OPENING_BOARDING_DISPLAY_KEYS];
const DAYCARE_DISPLAY_KEYS = [
  "evaluations",
  "private_play_dayboarding",
  "half_and_half_daytime",
  "large_daycare",
  "small_daycare",
  "unclassified_daycare",
];
const HISTORICAL_COMPARISON_MAX_YEAR_OFFSET = 10;

function getDateKey(value?: string | null): string {
  return String(value || "").slice(0, 10);
}

export function nowET(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
}

export function dateStrET(d?: Date): string {
  const dt = d || nowET();
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

export function addDaysStr(dateStr: string, days: number): string {
  const dt = new Date(`${dateStr}T12:00:00`);
  dt.setDate(dt.getDate() + days);
  return dt.toISOString().slice(0, 10);
}

function enumerateDates(dateFrom: string, dateTo: string): string[] {
  const dates: string[] = [];
  let current = dateFrom;
  while (current <= dateTo) {
    dates.push(current);
    current = addDaysStr(current, 1);
  }
  return dates;
}

function shiftYearsStr(dateStr: string, years: number): string {
  const dt = new Date(`${dateStr}T12:00:00`);
  dt.setFullYear(dt.getFullYear() + years);
  return dt.toISOString().slice(0, 10);
}

function diffDays(fromDate: string, toDate: string): number {
  const from = new Date(`${fromDate}T12:00:00`).getTime();
  const to = new Date(`${toDate}T12:00:00`).getTime();
  return Math.round((to - from) / 86400000);
}

function getWeekday(dateStr: string): number {
  return new Date(`${dateStr}T12:00:00`).getDay();
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function capacityLimit(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.max(0, Math.round(numeric));
}

function toWidgetCount(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(String(value).replaceAll(",", ""));
  return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : null;
}

function firstWidgetCount(...values: unknown[]): number | null {
  for (const value of values) {
    const numeric = toWidgetCount(value);
    if (numeric !== null) return numeric;
  }
  return null;
}

function unwrapWidgetPayload(payload: any) {
  if (payload?.response?.data && typeof payload.response.data === "object") return payload.response.data;
  if (payload?.data?.data && typeof payload.data.data === "object" && (payload.data.totals || payload.data.data.per_type)) return payload.data;
  if (payload?.data && typeof payload.data === "object" && (payload.data.totals || payload.data.per_type)) return payload.data;
  return payload || {};
}

function normalizeWidgetPerTypeEntries(payload: any): GingrWidgetPerTypeCount[] {
  const root = unwrapWidgetPayload(payload);
  const candidates = [
    root?.per_type,
    root?.data?.per_type,
    root?.reservation_types,
    root?.types,
  ];

  let perType: any = candidates.find((candidate) =>
    candidate && (Array.isArray(candidate) || typeof candidate === "object")
  );

  if (!perType && root?.data && typeof root.data === "object" && !Array.isArray(root.data)) {
    const values = Object.values(root.data);
    const looksLikePerType = values.some((value: any) =>
      value && typeof value === "object" && (
        "check_ins" in value ||
        "check_outs" in value ||
        "active" in value ||
        "overnight" in value
      )
    );
    if (looksLikePerType) perType = root.data;
  }

  const entries = Array.isArray(perType)
    ? perType.map((value, index) => [String(value?.type || value?.name || value?.label || index), value])
    : Object.entries(perType || {});

  return entries
    .map(([key, value]: [string, any]) => {
      const typeName = String(value?.type_name || value?.reservation_type || value?.type || value?.name || value?.label || key || "").trim();
      if (!typeName) return null;
      const checkIns = firstWidgetCount(
        value?.check_ins,
        value?.checkins,
        value?.check_in,
        value?.check_in_count,
        value?.check_in_total,
      ) ?? 0;
      const checkOuts = firstWidgetCount(
        value?.check_outs,
        value?.checkouts,
        value?.check_out,
        value?.check_out_count,
        value?.check_out_total,
      ) ?? 0;
      const total = firstWidgetCount(
        value?.total,
        value?.total_count,
        value?.expected,
        value?.expected_total,
        value?.active,
        value?.active_count,
        value?.active_total,
      ) ?? 0;
      const overnight = firstWidgetCount(
        value?.overnight,
        value?.overnights,
        value?.overnight_count,
        value?.overnight_total,
      ) ?? Math.max(0, total - checkOuts);

      return {
        type_name: typeName,
        check_ins: checkIns,
        check_outs: checkOuts,
        overnight,
        total,
        raw: value,
      };
    })
    .filter(Boolean) as GingrWidgetPerTypeCount[];
}

export function normalizeGingrReservationWidgetPayload({
  locationId,
  widgetDate,
  payload,
}: {
  locationId: string;
  widgetDate: string;
  payload: any;
}) {
  const root = unwrapWidgetPayload(payload);
  const totals = root?.totals || root?.data?.totals || {};
  const perType = normalizeWidgetPerTypeEntries(payload);
  const checkInTotal = firstWidgetCount(
    totals?.check_in_total,
    totals?.check_ins,
    totals?.checkins,
    root?.check_in_total,
    root?.check_ins,
  ) ?? perType.reduce((sum, row) => sum + row.check_ins, 0);
  const checkOutTotal = firstWidgetCount(
    totals?.check_out_total,
    totals?.check_outs,
    totals?.checkouts,
    root?.check_out_total,
    root?.check_outs,
  ) ?? perType.reduce((sum, row) => sum + row.check_outs, 0);
  const totalReservationVolume = firstWidgetCount(
    totals?.total,
    totals?.total_count,
    totals?.expected_total,
    totals?.active_total,
    totals?.active,
    root?.total,
    root?.total_count,
    root?.active_total,
    root?.active,
  ) ?? perType.reduce((sum, row) => sum + row.total, 0);
  const overnightTotal = firstWidgetCount(
    totals?.overnight_total,
    totals?.overnight,
    root?.overnight_total,
    root?.overnight,
  ) ?? Math.max(0, totalReservationVolume - checkOutTotal);

  return {
    location_id: locationId,
    widget_date: widgetDate,
    check_in_total: checkInTotal,
    check_out_total: checkOutTotal,
    overnight_total: overnightTotal,
    total_reservation_volume: totalReservationVolume,
    per_type: perType,
    raw_data: payload || {},
    synced_at: new Date().toISOString(),
  };
}

function weightedAverage(
  values: number[],
  weights: number[],
  fallback = 0,
): number {
  let weightedSum = 0;
  let weightSum = 0;
  for (let i = 0; i < values.length; i += 1) {
    const value = Number(values[i]);
    const weight = Number(weights[i]);
    if (!Number.isFinite(value) || !Number.isFinite(weight) || weight <= 0) continue;
    weightedSum += value * weight;
    weightSum += weight;
  }
  return weightSum > 0 ? weightedSum / weightSum : fallback;
}

type ProjectionFallbackMode =
  | "exact_prior_year"
  | "same_weekday_prior_year"
  | "exact_prior_years_2_to_4"
  | "same_weekday_prior_years_2_to_4"
  | "weighted_comparable_blend";

type ProjectionCandidate = {
  sampleDate: string;
  fallbackMode: ProjectionFallbackMode;
  dateDistance: number;
  yearOffset: number;
};

function getProjectionCandidates(targetDate: string): ProjectionCandidate[] {
  const results: ProjectionCandidate[] = [];
  const seen = new Set<string>();
  const targetWeekday = getWeekday(targetDate);

  const addCandidate = (
    sampleDate: string,
    fallbackMode: ProjectionFallbackMode,
    dateDistance: number,
    yearOffset: number,
  ) => {
    if (!sampleDate || sampleDate >= targetDate || seen.has(sampleDate)) return;
    seen.add(sampleDate);
    results.push({
      sampleDate,
      fallbackMode,
      dateDistance,
      yearOffset,
    });
  };

  const exactLastYear = shiftYearsStr(targetDate, -1);
  addCandidate(exactLastYear, "exact_prior_year", 0, 1);

  for (let delta = -21; delta <= 21; delta += 1) {
    if (delta === 0) continue;
    const candidate = addDaysStr(exactLastYear, delta);
    if (getWeekday(candidate) === targetWeekday) {
      addCandidate(candidate, "same_weekday_prior_year", Math.abs(delta), 1);
    }
  }

  for (let yearOffset = 2; yearOffset <= 4; yearOffset += 1) {
    const anchor = shiftYearsStr(targetDate, -yearOffset);
    addCandidate(anchor, "exact_prior_years_2_to_4", 0, yearOffset);
  }

  for (let yearOffset = 2; yearOffset <= 4; yearOffset += 1) {
    const anchor = shiftYearsStr(targetDate, -yearOffset);
    for (let delta = -21; delta <= 21; delta += 1) {
      if (delta === 0) continue;
      const candidate = addDaysStr(anchor, delta);
      if (getWeekday(candidate) === targetWeekday) {
        addCandidate(candidate, "same_weekday_prior_years_2_to_4", Math.abs(delta), yearOffset);
      }
    }
  }

  return results;
}

function buildHistoricalWindow(targetDates: string[]) {
  const references = new Set<string>();
  for (const date of targetDates) {
    for (const candidate of getProjectionCandidates(date)) {
      references.add(candidate.sampleDate);
    }
  }

  const ordered = Array.from(references).sort();
  if (!ordered.length) {
    return null;
  }

  return {
    referenceDates: ordered,
    windowStart: ordered[0],
    windowEnd: ordered[ordered.length - 1],
  };
}

function buildDateOverlapOrFilter(dateKeys: string[]) {
  const uniqueDates = [...new Set((dateKeys || []).filter(Boolean))].sort();
  if (!uniqueDates.length) return null;
  return uniqueDates
    .flatMap((dateKey) => [
      `and(start_date.lt.${addDaysStr(dateKey, 1)}T00:00:00,end_date.gte.${dateKey}T00:00:00)`,
      `and(check_out_date.gte.${dateKey}T00:00:00,check_out_date.lt.${addDaysStr(dateKey, 1)}T00:00:00)`,
    ])
    .join(",");
}

function buildContiguousDateRanges(dateKeys: string[]) {
  const uniqueDates = [...new Set((dateKeys || []).filter(Boolean))].sort();
  if (!uniqueDates.length) return [];

  const ranges: Array<{ from: string; to: string }> = [];
  let rangeStart = uniqueDates[0];
  let previous = uniqueDates[0];

  for (const dateKey of uniqueDates.slice(1)) {
    if (dateKey === addDaysStr(previous, 1)) {
      previous = dateKey;
      continue;
    }

    ranges.push({ from: rangeStart, to: previous });
    rangeStart = dateKey;
    previous = dateKey;
  }

  ranges.push({ from: rangeStart, to: previous });
  return ranges;
}

function buildProjectionCalibrationDates(currentDate: string): string[] {
  const dates: string[] = [];
  for (let offset = PROJECTION_CALIBRATION_LOOKBACK_DAYS; offset >= 1; offset -= 1) {
    dates.push(addDaysStr(currentDate, -offset));
  }
  return dates;
}

function buildDateRangeOverlapQuery(
  query: any,
  dateFrom: string | null,
  dateTo: string | null,
) {
  if (!dateFrom || !dateTo) return query;
  const nextDate = addDaysStr(dateTo, 1);
  return query.or([
    `and(start_date.lt.${nextDate}T00:00:00,end_date.gte.${dateFrom}T00:00:00)`,
    `and(check_out_date.gte.${dateFrom}T00:00:00,check_out_date.lt.${nextDate}T00:00:00)`,
  ].join(","));
}

function normalizePositiveNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function normalizeProjectionCapacityConfig(rawConfig: any, totalRooms: number) {
  const multiDogFactor = normalizePositiveNumber(
    rawConfig?.boarding_multi_dog_factor
    ?? rawConfig?.boardingMultiDogFactor
    ?? rawConfig?.multi_dog_factor,
  ) ?? DEFAULT_BOARDING_MULTI_DOG_FACTOR;

  const practicalBoardingDogCapacity = normalizePositiveNumber(
    rawConfig?.boarding_practical_dog_capacity
    ?? rawConfig?.boardingPracticalDogCapacity
    ?? rawConfig?.typical_boarding_capacity,
  ) ?? (totalRooms > 0 ? Number((totalRooms * multiDogFactor).toFixed(1)) : null);

  return {
    multiDogFactor,
    practicalBoardingDogCapacity,
    theoreticalBoardingDogCapacity: normalizePositiveNumber(
      rawConfig?.boarding_theoretical_dog_capacity
      ?? rawConfig?.boardingTheoreticalDogCapacity
      ?? rawConfig?.max_boarding_capacity,
    ),
    largeDaycareCapacity: normalizePositiveNumber(
      rawConfig?.large_daycare_capacity
      ?? rawConfig?.largeDaycareCapacity
      ?? rawConfig?.large_play_capacity,
    ),
    smallDaycareCapacity: normalizePositiveNumber(
      rawConfig?.small_daycare_capacity
      ?? rawConfig?.smallDaycareCapacity
      ?? rawConfig?.small_play_capacity,
    ),
    groupPlayCapacity: normalizePositiveNumber(
      rawConfig?.group_play_capacity
      ?? rawConfig?.groupPlayCapacity,
    ),
  };
}

function buildProjectionCapacityEnvelope({
  display,
  totalRooms,
  capacityConfig,
}: {
  display: any;
  totalRooms: number;
  capacityConfig?: ReturnType<typeof normalizeProjectionCapacityConfig> | null;
}) {
  const config = capacityConfig || normalizeProjectionCapacityConfig({}, totalRooms);
  const boardingDemand = Math.max(
    Number(display?.opening?.total_boarding || 0),
    Number(display?.closing?.total_boarding || 0),
  );
  const largePlayDemand = Number(display?.play_yard?.large_play_dogs || 0);
  const smallPlayDemand = Number(display?.play_yard?.small_play_dogs || 0);
  const groupPlayDemand = largePlayDemand + smallPlayDemand;
  const practicalBoardingCapacity = capacityLimit(config.practicalBoardingDogCapacity);
  const largeDaycareCapacity = capacityLimit(config.largeDaycareCapacity);
  const smallDaycareCapacity = capacityLimit(config.smallDaycareCapacity);
  const groupPlayCapacity = capacityLimit(config.groupPlayCapacity)
    ?? (
      largeDaycareCapacity !== null && smallDaycareCapacity !== null
        ? largeDaycareCapacity + smallDaycareCapacity
        : null
    );

  const constraints = [
    {
      key: "boarding_practical",
      label: "Practical boarding dog capacity",
      demand: boardingDemand,
      capacity: practicalBoardingCapacity,
    },
    {
      key: "large_play",
      label: "Large play group capacity",
      demand: largePlayDemand,
      capacity: largeDaycareCapacity,
    },
    {
      key: "small_play",
      label: "Small play group capacity",
      demand: smallPlayDemand,
      capacity: smallDaycareCapacity,
    },
    {
      key: "group_play_total",
      label: "Total group play capacity",
      demand: groupPlayDemand,
      capacity: groupPlayCapacity,
    },
  ].map((constraint) => {
    const capacity = constraint.capacity;
    const overflow = capacity === null || capacity === undefined ? null : Number((constraint.demand - capacity).toFixed(2));
    return {
      ...constraint,
      capacity,
      constrained_forecast: capacity === null || capacity === undefined ? constraint.demand : Math.min(constraint.demand, capacity),
      overflow: overflow !== null ? Math.max(0, overflow) : null,
      status: overflow !== null && overflow > 0 ? "over_capacity" : "within_capacity",
    };
  });

  return {
    model: "practical_room_factor_plus_play_yard_caps",
    overnight_rooms: {
      total_rooms: totalRooms || 0,
      multi_dog_factor: config.multiDogFactor,
      practical_dog_capacity: config.practicalBoardingDogCapacity,
      theoretical_dog_capacity: config.theoreticalBoardingDogCapacity,
      capacity_source: config.practicalBoardingDogCapacity !== null ? "schedule_config_or_total_rooms_x_factor" : "missing",
    },
    play_yards: {
      large_capacity: largeDaycareCapacity,
      small_capacity: smallDaycareCapacity,
      group_play_capacity: groupPlayCapacity,
    },
    unconstrained_forecast: {
      boarding_dogs: boardingDemand,
      large_play_dogs: largePlayDemand,
      small_play_dogs: smallPlayDemand,
      group_play_dogs: groupPlayDemand,
    },
    capacity_constrained_forecast: Object.fromEntries(
      constraints.map((constraint) => [constraint.key, constraint.constrained_forecast]),
    ),
    constraints,
    has_capacity_risk: constraints.some((constraint) => constraint.status === "over_capacity"),
  };
}

function scaleDisplaySectionToCapacity(section: Record<string, number>, keys: string[], capacity: number | null) {
  if (capacity === null) return { constrained: false, before: sumDisplaySection(section, keys), after: sumDisplaySection(section, keys) };
  const before = sumDisplaySection(section, keys);
  if (before <= capacity) return { constrained: false, before, after: before };
  if (before <= 0) return { constrained: false, before, after: before };

  const scaled = keys.map((key) => {
    const value = Number(section[key] || 0);
    const exact = (value / before) * capacity;
    return {
      key,
      floor: Math.floor(exact),
      remainder: exact - Math.floor(exact),
    };
  });
  let remaining = capacity - scaled.reduce((sum, item) => sum + item.floor, 0);
  const remainderOrder = [...scaled].sort((a, b) => b.remainder - a.remainder);
  const bumpKeys = new Set<string>();
  for (const item of remainderOrder) {
    if (remaining <= 0) break;
    if (Number(section[item.key] || 0) <= 0) continue;
    bumpKeys.add(item.key);
    remaining -= 1;
  }
  for (const item of scaled) {
    section[item.key] = item.floor + (bumpKeys.has(item.key) ? 1 : 0);
  }
  return { constrained: true, before, after: capacity };
}

function reduceDaycarePlayDemand(display: any, daycareKey: "large_daycare" | "small_daycare", capacity: number | null) {
  if (capacity === null) return false;
  const boardingKey = daycareKey === "large_daycare" ? "large_boarding" : "small_boarding";
  const boardingDemand = Math.max(
    Number(display.opening?.[boardingKey] || 0),
    Number(display.closing?.[boardingKey] || 0),
  );
  const daycareDemand = Number(display.daycare?.[daycareKey] || 0);
  const availableDaycare = Math.max(0, capacity - boardingDemand);
  if (daycareDemand <= availableDaycare) return false;
  display.daycare[daycareKey] = availableDaycare;
  return true;
}

function reduceGroupPlayDaycareDemand(display: any, groupCapacity: number | null) {
  if (groupCapacity === null) return false;
  const largeBoarding = Math.max(Number(display.opening?.large_boarding || 0), Number(display.closing?.large_boarding || 0));
  const smallBoarding = Math.max(Number(display.opening?.small_boarding || 0), Number(display.closing?.small_boarding || 0));
  const largeDaycare = Number(display.daycare?.large_daycare || 0);
  const smallDaycare = Number(display.daycare?.small_daycare || 0);
  const groupDemand = largeBoarding + smallBoarding + largeDaycare + smallDaycare;
  if (groupDemand <= groupCapacity) return false;

  const boardingDemand = largeBoarding + smallBoarding;
  const daycareCapacity = Math.max(0, groupCapacity - boardingDemand);
  return scaleDisplaySectionToCapacity(display.daycare, ["large_daycare", "small_daycare"], daycareCapacity).constrained;
}

function recomputeCapacityConstrainedDisplay(display: any) {
  display.opening.total_boarding = sumDisplaySection(display.opening, OPENING_BOARDING_DISPLAY_KEYS);
  display.closing.total_boarding = sumDisplaySection(display.closing, CLOSING_BOARDING_DISPLAY_KEYS);
  display.daycare.total_daycare = sumDisplaySection(display.daycare, DAYCARE_DISPLAY_KEYS);
  display.support.morning_feeding_dogs = display.opening.total_boarding;
  display.support.evening_feeding_dogs = display.closing.total_boarding;
  display.support.total_dog_volume = display.closing.total_boarding + display.daycare.total_daycare;
  display.support.total_daily_dog_volume = display.support.total_dog_volume + Number(display.departing?.total_boarding || 0);
  display.play_yard.large_play_dogs = Math.max(display.opening.large_boarding || 0, display.closing.large_boarding || 0) + Number(display.daycare.large_daycare || 0);
  display.play_yard.small_play_dogs = Math.max(display.opening.small_boarding || 0, display.closing.small_boarding || 0) + Number(display.daycare.small_daycare || 0);
  display.play_yard.private_play_dogs = Math.max(display.opening.private_play_boarding || 0, display.closing.private_play_boarding || 0) + Number(display.daycare.private_play_dayboarding || 0);
  display.play_yard.split_play_dogs = Math.max(display.opening.half_and_half_boarding || 0, display.closing.half_and_half_boarding || 0) + Number(display.daycare.half_and_half_daytime || 0);
}

function summarizeCapacityDisplay(display: any) {
  const largePlayDogs = Number(display?.play_yard?.large_play_dogs || 0);
  const smallPlayDogs = Number(display?.play_yard?.small_play_dogs || 0);
  return {
    boarding_dogs: Math.max(
      Number(display?.opening?.total_boarding || 0),
      Number(display?.closing?.total_boarding || 0),
    ),
    large_play_dogs: largePlayDogs,
    small_play_dogs: smallPlayDogs,
    group_play_dogs: largePlayDogs + smallPlayDogs,
    total_dog_volume: Number(display?.support?.total_dog_volume || 0),
  };
}

function buildCapacityConstrainedDisplay(demandDisplay: any, capacityEnvelope: any) {
  const display = cloneDisplay(demandDisplay);
  const practicalBoardingCapacity = capacityLimit(capacityEnvelope?.overnight_rooms?.practical_dog_capacity);
  const largePlayCapacity = capacityLimit(capacityEnvelope?.play_yards?.large_capacity);
  const smallPlayCapacity = capacityLimit(capacityEnvelope?.play_yards?.small_capacity);
  const groupPlayCapacity = capacityLimit(capacityEnvelope?.play_yards?.group_play_capacity);
  let changed = false;

  if (largePlayCapacity !== null) {
    const nextOpeningLarge = Math.min(Number(display.opening.large_boarding || 0), largePlayCapacity);
    const nextClosingLarge = Math.min(Number(display.closing.large_boarding || 0), largePlayCapacity);
    changed = changed || nextOpeningLarge !== Number(display.opening.large_boarding || 0) || nextClosingLarge !== Number(display.closing.large_boarding || 0);
    display.opening.large_boarding = nextOpeningLarge;
    display.closing.large_boarding = nextClosingLarge;
  }
  if (smallPlayCapacity !== null) {
    const nextOpeningSmall = Math.min(Number(display.opening.small_boarding || 0), smallPlayCapacity);
    const nextClosingSmall = Math.min(Number(display.closing.small_boarding || 0), smallPlayCapacity);
    changed = changed || nextOpeningSmall !== Number(display.opening.small_boarding || 0) || nextClosingSmall !== Number(display.closing.small_boarding || 0);
    display.opening.small_boarding = nextOpeningSmall;
    display.closing.small_boarding = nextClosingSmall;
  }

  const openingBoardingTotal = Number(display.opening?.total_boarding || 0);
  const closingBoardingTotal = Number(display.closing?.total_boarding || 0);
  const openingBoardingCap = practicalBoardingCapacity !== null && openingBoardingTotal > practicalBoardingCapacity ? practicalBoardingCapacity : null;
  const closingBoardingCap = practicalBoardingCapacity !== null && closingBoardingTotal > practicalBoardingCapacity ? practicalBoardingCapacity : null;
  changed = scaleDisplaySectionToCapacity(
    display.opening,
    OPENING_BOARDING_DISPLAY_KEYS,
    openingBoardingCap,
  ).constrained || changed;
  changed = scaleDisplaySectionToCapacity(
    display.closing,
    CLOSING_BOARDING_DISPLAY_KEYS,
    closingBoardingCap,
  ).constrained || changed;
  changed = openingBoardingCap !== null || closingBoardingCap !== null || changed;
  if (changed) {
    recomputeCapacityConstrainedDisplay(display);
    if (openingBoardingCap !== null) {
      display.opening.total_boarding = Math.min(Number(display.opening.total_boarding || 0), openingBoardingCap);
    }
    if (closingBoardingCap !== null) {
      display.closing.total_boarding = Math.min(Number(display.closing.total_boarding || 0), closingBoardingCap);
    }
    display.support.morning_feeding_dogs = display.opening.total_boarding;
    display.support.evening_feeding_dogs = display.closing.total_boarding;
    display.support.total_dog_volume = display.closing.total_boarding + display.daycare.total_daycare;
    display.support.total_daily_dog_volume = display.support.total_dog_volume + Number(display.departing?.total_boarding || 0);
  }

  changed = reduceDaycarePlayDemand(display, "large_daycare", largePlayCapacity) || changed;
  changed = reduceDaycarePlayDemand(display, "small_daycare", smallPlayCapacity) || changed;
  changed = reduceGroupPlayDaycareDemand(display, groupPlayCapacity) || changed;
  if (changed) {
    recomputeCapacityConstrainedDisplay(display);
  }

  return display;
}

function explainCapacityConstrainedMetrics({
  explanations,
  demandDisplay,
  achievableDisplay,
  capacity,
}: {
  explanations: Record<string, any>;
  demandDisplay: any;
  achievableDisplay: any;
  capacity: any;
}) {
  const demandFlat = flattenDisplay(demandDisplay);
  const achievableFlat = flattenDisplay(achievableDisplay);
  const overCapacity = (capacity?.constraints || [])
    .filter((constraint: any) => constraint?.status === "over_capacity")
    .map((constraint: any) => ({
      key: constraint.key,
      label: constraint.label,
      demand: constraint.demand,
      capacity: constraint.capacity,
      overflow: constraint.overflow,
    }));

  for (const [metricKey, demandValueRaw] of Object.entries(demandFlat)) {
    const demandValue = Number(demandValueRaw || 0);
    const achievableValue = Number(achievableFlat[metricKey] || 0);
    if (!Number.isFinite(demandValue) || !Number.isFinite(achievableValue) || achievableValue >= demandValue) continue;
    const explanationKey = metricKey.replaceAll(".", "_");
    const existing = explanations[explanationKey] || {};
    explanations[explanationKey] = {
      ...existing,
      projected_value: achievableValue,
      unconstrained_projected_value: demandValue,
      capacity_constrained_value: achievableValue,
      capacity_constraint: {
        constrained: true,
        demand_value: demandValue,
        achievable_value: achievableValue,
        constrained_by: overCapacity,
      },
    };
  }
}

export function classifySchedulingReservationType(
  typeName: string,
  typeRow?: ReservationTypeRow | null,
): "boarding" | "daycare" | "dayboarding" | "evaluation" | "tour" | "grooming" | "other" {
  const value = String(typeName || "").toLowerCase();
  if (value.includes("evaluation") || value.includes("eval")) return "evaluation";
  if (value.includes("tour")) return "tour";
  if (value.includes("day boarding") || value.includes("day board")) return "dayboarding";
  if (typeRow?.is_daycare || value.includes("daycare") || value.includes("day care")) return "daycare";
  if (typeRow?.is_boarding || value.includes("boarding") || value.includes("lodge") || value.includes("kennel")) return "boarding";
  if (value.includes("groom") || value.includes("bath")) return "grooming";
  return "other";
}

function emptyWidgetBucket() {
  return { check_ins: 0, check_outs: 0, overnight: 0, total: 0 };
}

function addWidgetCounts(
  bucket: ReturnType<typeof emptyWidgetBucket>,
  row: GingrWidgetPerTypeCount,
) {
  bucket.check_ins += row.check_ins;
  bucket.check_outs += row.check_outs;
  bucket.overnight += row.overnight;
  bucket.total += row.total;
}

export function buildGingrWidgetSourceCountsByDate(
  rows: any[],
  resTypeMaps: { byName: Map<string, ReservationTypeRow>; byId: Map<string, ReservationTypeRow> },
): Map<string, GingrWidgetSourceCounts> {
  const byDate = new Map<string, GingrWidgetSourceCounts>();

  for (const row of rows || []) {
    const date = getDateKey(row?.widget_date);
    if (!date) continue;
    const rawPerType = Array.isArray(row?.per_type)
      ? row.per_type
      : normalizeWidgetPerTypeEntries(row?.raw_data || {});
    const boarding = emptyWidgetBucket();
    const daytime = emptyWidgetBucket();
    const other = emptyWidgetBucket();
    const perType = rawPerType.map((entry: any) => {
      const typeName = String(entry?.type_name || entry?.type || entry?.name || "").trim();
      const typeId = String(entry?.type_id || entry?.reservation_type_id || "").trim();
      const normalized = {
        type_name: typeName,
        check_ins: Number(entry?.check_ins || 0),
        check_outs: Number(entry?.check_outs || 0),
        overnight: Number(entry?.overnight || 0),
        total: Number(entry?.total ?? (Number(entry?.check_outs || 0) + Number(entry?.overnight || 0))),
        raw: entry?.raw || entry,
      };
      const typeRow = (typeId && resTypeMaps.byId.get(typeId)) || resTypeMaps.byName.get(typeName) || null;
      const cls = classifySchedulingReservationType(typeName, typeRow);
      if (cls === "boarding") {
        addWidgetCounts(boarding, normalized);
      } else if (cls === "daycare" || cls === "dayboarding" || cls === "evaluation") {
        addWidgetCounts(daytime, normalized);
      } else {
        addWidgetCounts(other, normalized);
      }
      return { ...normalized, cls };
    });

    if (boarding.overnight === 0 && Number(row?.overnight_total || 0) > 0) {
      boarding.overnight = Number(row.overnight_total || 0);
    }

    byDate.set(date, {
      date,
      check_ins: Number(row?.check_in_total || 0),
      check_outs: Number(row?.check_out_total || 0),
      overnight: Number(row?.overnight_total || 0),
      total: Number(row?.total_reservation_volume || 0),
      boarding: {
        ...boarding,
        opening: Math.max(0, boarding.check_outs + boarding.overnight - boarding.check_ins),
      },
      daytime,
      other,
      per_type: perType,
      synced_at: row?.synced_at || null,
    });
  }

  return byDate;
}

function normalizePlaygroup(playgroup: string | null | undefined): "large" | "small" | "private_play" | "unknown" {
  const value = String(playgroup || "").toLowerCase();
  if (value === "large") return "large";
  if (value === "small") return "small";
  if (value === "private_play") return "private_play";
  return "unknown";
}

function isMedicationService(services: any[] = [], targetDate: string): boolean {
  return services.some((service) => {
    const name = String(typeof service === "string" ? service : service?.name || "").toLowerCase();
    const scheduledAt = String(typeof service === "string" ? "" : service?.scheduled_at || "");
    return name.includes("medication") && getDateKey(scheduledAt) === targetDate;
  });
}

function getBookedDateKey(row: ReservationRow): string {
  return getDateKey(row.created_date || row.confirmed_date || row.created_at);
}

export function buildReservationTypeMaps(rows: ReservationTypeRow[]) {
  const byName = new Map<string, ReservationTypeRow>();
  const byId = new Map<string, ReservationTypeRow>();

  for (const row of rows) {
    const typeName = String(row.name || "");
    const typeId = String(row.gingr_id || "");
    if (typeName) byName.set(typeName, row);
    if (typeId) byId.set(typeId, row);
  }

  return { byName, byId };
}

function isOperationalReservationClass(
  cls: ReturnType<typeof classifySchedulingReservationType>,
) {
  return cls === "boarding" || cls === "daycare" || cls === "dayboarding" || cls === "evaluation";
}

function escapeSqlLiteral(value: string) {
  return String(value || "").replaceAll("'", "''");
}

export async function fetchEarliestOperationalStartDates({
  supabase,
  locationId,
  animalIds,
  resTypeMaps,
}: {
  supabase: SupabaseClient;
  locationId: string;
  animalIds: string[];
  resTypeMaps: { byName: Map<string, ReservationTypeRow>; byId: Map<string, ReservationTypeRow> };
}) {
  const earliestByAnimal = new Map<string, string>();
  const uniqueAnimalIds = [...new Set((animalIds || []).map((value) => String(value || "").trim()).filter(Boolean))];

  for (let i = 0; i < uniqueAnimalIds.length; i += ANIMAL_HISTORY_BATCH_SIZE) {
    const chunk = uniqueAnimalIds.slice(i, i + ANIMAL_HISTORY_BATCH_SIZE);
    if (!chunk.length) continue;

    const animalIdList = chunk.map((animalId) => `'${escapeSqlLiteral(animalId)}'`).join(", ");
    const sql = [
      "SELECT",
      "  r.animal_gingr_id,",
      "  min(r.start_date)::text AS earliest_start",
      "FROM public.gingr_reservations r",
      "LEFT JOIN public.gingr_reservation_types rt",
      "  ON rt.location_id = r.location_id",
      " AND rt.gingr_id::text = r.reservation_type_id::text",
      "WHERE r.location_id = ($1)::text",
      "  AND r.cancelled_date IS NULL",
      "  AND r.start_date IS NOT NULL",
      `  AND r.animal_gingr_id IN (${animalIdList})`,
      "  AND CASE",
      "    WHEN lower(coalesce(r.reservation_type_name, '')) LIKE '%tour%' THEN false",
      "    WHEN lower(coalesce(r.reservation_type_name, '')) LIKE '%groom%' THEN false",
      "    WHEN lower(coalesce(r.reservation_type_name, '')) LIKE '%bath%' THEN false",
      "    WHEN lower(coalesce(r.reservation_type_name, '')) LIKE '%evaluation%' THEN true",
      "    WHEN lower(coalesce(r.reservation_type_name, '')) LIKE '%eval%' THEN true",
      "    WHEN lower(coalesce(r.reservation_type_name, '')) LIKE '%day boarding%' THEN true",
      "    WHEN lower(coalesce(r.reservation_type_name, '')) LIKE '%day board%' THEN true",
      "    WHEN coalesce(rt.is_daycare, false) THEN true",
      "    WHEN lower(coalesce(r.reservation_type_name, '')) LIKE '%daycare%' THEN true",
      "    WHEN lower(coalesce(r.reservation_type_name, '')) LIKE '%day care%' THEN true",
      "    WHEN coalesce(rt.is_boarding, false) THEN true",
      "    WHEN lower(coalesce(r.reservation_type_name, '')) LIKE '%boarding%' THEN true",
      "    WHEN lower(coalesce(r.reservation_type_name, '')) LIKE '%lodge%' THEN true",
      "    WHEN lower(coalesce(r.reservation_type_name, '')) LIKE '%kennel%' THEN true",
      "    ELSE false",
      "  END",
      "GROUP BY r.animal_gingr_id",
    ].join("\n");
    const { data, error } = await supabase.rpc("exec_sql", {
      query: sql,
      params: [locationId],
    });

    if (error) throw error;

    for (const row of Array.isArray(data) ? data : []) {
      const animalId = String(row?.animal_gingr_id || "").trim();
      const startKey = getDateKey(row?.earliest_start);
      if (!animalId || !startKey || earliestByAnimal.has(animalId)) continue;
      earliestByAnimal.set(animalId, startKey);
    }
  }

  return earliestByAnimal;
}

export function annotateReservationsWithOperationalHistory(
  reservations: any[],
  earliestOperationalStartByAnimal: Map<string, string>,
) {
  return reservations.map((row) => {
    const earliestOperationalStart = earliestOperationalStartByAnimal.get(row.animalId) || null;
    const isFirstEverDaycareVisit = row.cls === "daycare"
      && !!earliestOperationalStart
      && row.startKey === earliestOperationalStart;

    return {
      ...row,
      earliestOperationalStart,
      isFirstEverDaycareVisit,
    };
  });
}

export function getStayDayIndex(row: any, targetDate: string) {
  if (!row?.startKey || row.startKey > targetDate) return null;
  return diffDays(row.startKey, targetDate) + 1;
}

export function isEvaluationBoardingToday(row: any, targetDate: string) {
  return row?.cls === "boarding"
    && row?.unresolvedPlaygroupReason === "evaluation_only"
    && getStayDayIndex(row, targetDate) === 1;
}

function getEvaluationSource(row: any) {
  if (row?.cls === "evaluation") return "explicit_evaluation_reservation_type";
  if (row?.isFirstEverDaycareVisit) return "first_ever_daycare_visit";
  if (row?.unresolvedPlaygroupReason === "evaluation_only") return "evaluation_only_play_icon";
  return null;
}

function summarizeRoomOccupancy(roomSnapshots: any[] = []): Record<string, { occupied: number; available: number; total: number }> {
  const byDate: Record<string, { occupied: number; available: number; total: number }> = {};
  for (const row of roomSnapshots) {
    const dateKey = getDateKey(row.snapshot_date);
    if (!dateKey) continue;
    const occupied = Number(row.number_occupied || 0);
    const available = Number(row.number_available || 0);
    const total = Number(row.total_runs || occupied + available || 0);
    const current = byDate[dateKey];
    if (!current || total > current.total) {
      byDate[dateKey] = { occupied, available, total };
    }
  }
  return byDate;
}

function countDistinctAnimals(rows: ReservationRow[]): number {
  return new Set(rows.map((row) => String(row.animal_gingr_id || row.gingr_id || ""))).size;
}

function isCheckedOutBeforeDate(row: { check_out_date?: string | null }, targetDate: string): boolean {
  const checkedOutKey = getDateKey(row.check_out_date);
  return !!checkedOutKey && checkedOutKey < targetDate;
}

function isCheckedOutByDate(row: { check_out_date?: string | null }, targetDate: string): boolean {
  const checkedOutKey = getDateKey(row.check_out_date);
  return !!checkedOutKey && checkedOutKey <= targetDate;
}

function isCheckedOutOnDate(row: { check_out_date?: string | null }, targetDate: string): boolean {
  return getDateKey(row.check_out_date) === targetDate;
}

function wasCheckedInBeforeDate(row: { check_in_date?: string | null }, targetDate: string): boolean {
  const checkedInKey = getDateKey(row.check_in_date);
  return !!checkedInKey && checkedInKey < targetDate;
}

function isBoardingDepartureForDate(row: { cls?: string; endKey?: string | null; check_out_date?: string | null }, targetDate: string): boolean {
  if (row.cls !== "boarding") return false;
  if (isCheckedOutOnDate(row, targetDate)) return true;
  return row.endKey === targetDate && !isCheckedOutBeforeDate(row, targetDate);
}

export function buildReservationRecord(
  row: ReservationRow,
  resTypeMaps: { byName: Map<string, ReservationTypeRow>; byId: Map<string, ReservationTypeRow> },
  playgroupMap: Map<string, PlaygroupAssignment>,
) {
  const rawData = row.raw_data && typeof row.raw_data === "object" ? row.raw_data : {};
  const rawServices = Array.isArray(rawData.services) ? rawData.services : [];
  const topServices = Array.isArray(row.services) ? row.services : [];
  const services = [...rawServices, ...topServices];
  const rawReservationType = rawData.reservation_type && typeof rawData.reservation_type === "object"
    ? rawData.reservation_type
    : {};
  const typeName = String(row.reservation_type_name || rawReservationType.type || "");
  const typeId = String(row.reservation_type_id || rawReservationType.id || "");
  const typeRow = resTypeMaps.byId.get(typeId) || resTypeMaps.byName.get(typeName) || null;
  const cls = classifySchedulingReservationType(typeName, typeRow);
  const startDate = row.start_date || rawData.start_date || null;
  const endDate = row.end_date || rawData.end_date || null;
  const checkInDate = row.check_in_date || rawData.check_in_date || null;
  const checkOutDate = row.check_out_date || rawData.check_out_date || null;
  const startKey = getDateKey(startDate);
  const endKey = getDateKey(endDate);
  const animalId = String(row.animal_gingr_id || rawData.animal?.id || "");
  const playgroupAssignment = playgroupMap.get(animalId) || null;
  const playgroup = normalizePlaygroup(playgroupAssignment?.schedulingPlaygroup);
  const bookedDateKey = getBookedDateKey(row);

  return {
    ...row,
    start_date: startDate,
    end_date: endDate,
    check_in_date: checkInDate,
    check_out_date: checkOutDate,
    services,
    cls,
    typeId,
    startKey,
    endKey,
    bookedDateKey,
    playgroup,
    primaryDisplayPlaygroup: playgroupAssignment?.primaryDisplayPlaygroup || null,
    animalId,
    playgroupAssignment,
    isHalfAndHalf: !!playgroupAssignment?.isHalfAndHalf,
    unresolvedPlaygroupReason: playgroupAssignment?.unresolvedReason || (playgroup === "unknown" ? "missing_actionable_play_icon" : null),
  };
}

function splitCounts(rows: Array<{ playgroup: string; primaryDisplayPlaygroup?: string | null; isHalfAndHalf?: boolean; unresolvedPlaygroupReason?: string | null; cls?: string; startKey?: string }>, targetDate: string) {
  let large = 0;
  let small = 0;
  let privatePlay = 0;
  let halfAndHalf = 0;
  let evaluationBoarding = 0;
  let unknown = 0;

  for (const row of rows) {
    if (isEvaluationBoardingToday(row, targetDate)) {
      evaluationBoarding += 1;
      continue;
    }
    if (row.isHalfAndHalf || row.primaryDisplayPlaygroup === "both_daycares") {
      halfAndHalf += 1;
      continue;
    }
    switch (row.playgroup) {
      case "large":
        large += 1;
        break;
      case "small":
        small += 1;
        break;
      case "private_play":
        privatePlay += 1;
        break;
      default:
        unknown += 1;
        break;
    }
  }

  return { large, small, privatePlay, halfAndHalf, evaluationBoarding, unknown };
}

function countDepartureBaths(
  rows: Array<{
    services: any[];
    startKey?: string;
    endKey?: string;
    check_out_date?: string | null;
  }>,
  targetDate: string,
): number {
  let baths = 0;
  for (const row of rows) {
    const bathServices = extractBathLikeServices(row.services || [], []);
    const { scheduledToday } = getBathSchedulingForDate(bathServices, targetDate);
    if (scheduledToday) {
      baths += 1;
      continue;
    }

    if (
      row.endKey === targetDate &&
      calculateNights(row.startKey, row.endKey) === 1 &&
      bathServices.length === 0 &&
      !isCheckedOutBeforeDate(row, targetDate)
    ) {
      baths += 1;
    }
  }
  return baths;
}

function uniqueMedicationDogs(rows: Array<{ animalId: string; services: any[] }>, targetDate: string): number {
  const animalIds = new Set<string>();
  for (const row of rows) {
    if (isMedicationService(row.services || [], targetDate)) {
      animalIds.add(row.animalId);
    }
  }
  return animalIds.size;
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function isKnownDemandLimitation(detail: { kind?: string | null }) {
  return detail?.kind === "evaluation_boarding_pending_playgroup_outcome"
    || detail?.kind === "missing_actionable_play_icon";
}

export function buildBlockerDetails(
  rows: any[],
  targetDate: string,
  scope: "opening_boarding" | "closing_boarding" | "daytime",
) {
  const grouped = new Map<string, { kind: string; count: number; scope: string; dogIds: string[]; label: string }>();

  const scopeSuffix = scope === "opening_boarding"
    ? "in opening boarding"
    : scope === "closing_boarding"
      ? "in closing boarding"
      : "in daytime volume";

  for (const row of rows) {
    const stayDayIndex = getStayDayIndex(row, targetDate);
    let kind: string | null = null;
    let label = "";

    if (row?.cls === "boarding" && row?.unresolvedPlaygroupReason === "evaluation_only" && stayDayIndex && stayDayIndex > 1) {
      kind = "evaluation_boarding_pending_playgroup_outcome";
      label = `${pluralize(1, "evaluation boarder")} pending playgroup outcome ${scopeSuffix}`;
    } else if (row?.unresolvedPlaygroupReason === "conflicting_size_icons") {
      kind = "unresolved_playgroup_conflict";
      label = `${pluralize(1, "unresolved playgroup conflict")} ${scopeSuffix}`;
    } else if (row?.unresolvedPlaygroupReason === "missing_actionable_play_icon" || row?.unresolvedPlaygroupReason === "no_actionable_icon") {
      kind = "missing_actionable_play_icon";
      label = `${pluralize(1, "dog")} missing actionable play icon ${scopeSuffix}`;
    }

    if (!kind) continue;

    const key = `${scope}:${kind}`;
    const existing = grouped.get(key) || {
      kind,
      count: 0,
      scope,
      dogIds: [],
      label,
    };
    existing.count += 1;
    if (row?.animalId) existing.dogIds.push(String(row.animalId));
    grouped.set(key, existing);
  }

  return Array.from(grouped.values()).map((detail) => {
    let label = detail.label;
    if (detail.count > 1) {
      if (detail.kind === "evaluation_boarding_pending_playgroup_outcome") {
        label = `${pluralize(detail.count, "evaluation boarder")} pending playgroup outcome ${scopeSuffix}`;
      } else if (detail.kind === "unresolved_playgroup_conflict") {
        label = `${pluralize(detail.count, "unresolved playgroup conflict")} ${scopeSuffix}`;
      } else {
        label = `${pluralize(detail.count, "dog")} missing actionable play icon ${scopeSuffix}`;
      }
    }

    return {
      kind: detail.kind,
      label,
      count: detail.count,
      scope: detail.scope,
      dog_ids: [...new Set(detail.dogIds)],
      blocks_generation: !isKnownDemandLimitation(detail),
    };
  });
}

export function buildTrustPayload({
  blockerDetails,
  roomCountsEstimated,
  sourceReconciliation,
  sourceRequired = false,
}: {
  blockerDetails: Array<{ kind: string; label: string; count: number; scope: string; dog_ids: string[] }>;
  roomCountsEstimated: boolean;
  sourceReconciliation?: any;
  sourceRequired?: boolean;
}) {
  const notes: string[] = [];
  const generationBlockerDetails = blockerDetails.filter((detail) => !isKnownDemandLimitation(detail));
  const limitationDetails = blockerDetails.filter(isKnownDemandLimitation);
  const blockers = generationBlockerDetails.map((detail) => detail.label);
  const limitations = limitationDetails.map((detail) => detail.label);

  if (roomCountsEstimated) {
    notes.push("Room occupancy counts are estimated from the latest available room totals.");
  }

  if (sourceReconciliation) {
    notes.push("Gingr Calendar Details source totals imported from reservation_widget_data.");
    const deltas = sourceReconciliation.remaining_deltas || sourceReconciliation.deltas || {};
    const sourceAdjustments = sourceReconciliation.source_adjustments || {};
    const adjustmentLabels = [
      ["opening_boarding", "opening boarding"],
      ["closing_boarding", "closing boarding"],
      ["daytime_total", "daytime volume"],
      ["total_dog_volume", "total dog volume"],
    ]
      .map(([key, label]) => {
        const value = Number(sourceAdjustments[key] || 0);
        return value > 0 ? `${label} +${value}` : null;
      })
      .filter(Boolean);
    if (adjustmentLabels.length) {
      limitations.push(`Gingr source totals were carried into unclassified demand buckets: ${adjustmentLabels.join(", ")}.`);
    }
    const mismatchLabels = [
      ["opening_boarding", "opening boarding"],
      ["closing_boarding", "closing boarding"],
      ["daytime_total", "daytime volume"],
      ["total_dog_volume", "total dog volume"],
    ]
      .map(([key, label]) => {
        const delta = Number(deltas[key] || 0);
        return delta === 0 ? null : `${label} source delta ${delta > 0 ? "+" : ""}${delta}`;
      })
      .filter(Boolean);
    if (mismatchLabels.length) {
      blockers.push(`Operational splits do not reconcile to Gingr source totals: ${mismatchLabels.join(", ")}.`);
    }
  } else if (sourceRequired) {
    blockers.push("Gingr Calendar Details source totals are missing for this date.");
  }

  return {
    state: sourceReconciliation ? "trusted" : sourceRequired ? "estimated" : "trusted",
    source: sourceReconciliation
      ? "reservation_widget_data + gingr_reservations + v_dog_playgroup_assignments_current"
      : "gingr_reservations + v_dog_playgroup_assignments_current",
    can_generate: blockers.length === 0,
    blockers,
    blocker_details: generationBlockerDetails,
    limitation_details: limitationDetails,
    limitations: [...new Set(limitations)],
    notes,
    source_reconciliation: sourceReconciliation || null,
  };
}

function buildAssignmentSnapshot(row: any, targetDate: string) {
  const assignment = row.playgroupAssignment;
  const stayDayIndex = getStayDayIndex(row, targetDate);
  const isEvaluationBoarding = isEvaluationBoardingToday(row, targetDate);
  return {
    animal_gingr_id: row.animalId,
    animal_name: String(row.animal_name || ""),
    reservation_gingr_id: String(row.gingr_id || ""),
    reservation_type_name: String(row.reservation_type_name || ""),
    scheduling_playgroup: row.playgroup === "unknown" ? null : row.playgroup,
    primary_display_playgroup: assignment?.primaryDisplayPlaygroup || null,
    is_half_and_half: !!assignment?.isHalfAndHalf,
    playgroup_tags: assignment?.playgroupTags || [],
    source_icon_titles: assignment?.sourceIconTitles || [],
    source_icon_comments: assignment?.sourceIconComments || [],
    unresolved_reason: row.unresolvedPlaygroupReason || null,
    half_and_half_note: assignment?.halfAndHalfNote || null,
    classification_reason: isEvaluationBoarding
      ? "evaluation_only_boarding_day_1"
      : row.cls === "evaluation"
        ? "explicit_evaluation_reservation_type"
        : row.isFirstEverDaycareVisit
          ? "first_ever_daycare_visit"
          : row.isHalfAndHalf
            ? "half_and_half"
            : row.playgroup === "large"
              ? "large_playgroup"
              : row.playgroup === "small"
                ? "small_playgroup"
                : row.playgroup === "private_play"
                  ? "private_play"
                  : row.unresolvedPlaygroupReason || null,
    evaluation_source: getEvaluationSource(row),
    stay_day_index: stayDayIndex,
    is_evaluation_boarding_today: isEvaluationBoarding,
  };
}

function buildDisplayShape({
  openingCounts,
  closingCounts,
  departingCounts,
  daycareCounts,
  dayboardingCounts,
  evaluationsCount,
  departureBaths,
  medicationDogs,
  toursCount,
}: {
  openingCounts: ReturnType<typeof splitCounts>;
  closingCounts: ReturnType<typeof splitCounts>;
  departingCounts?: ReturnType<typeof splitCounts>;
  daycareCounts: ReturnType<typeof splitCounts>;
  dayboardingCounts: ReturnType<typeof splitCounts>;
  evaluationsCount: number;
  departureBaths: number;
  medicationDogs: number;
  toursCount: number;
}) {
  const daytimeHalfAndHalf = daycareCounts.halfAndHalf + dayboardingCounts.halfAndHalf;
  const daytimeLarge = daycareCounts.large + dayboardingCounts.large;
  const daytimeSmall = daycareCounts.small + dayboardingCounts.small;
  const daytimePrivatePlay = daycareCounts.privatePlay + dayboardingCounts.privatePlay;

  const opening = {
    large_boarding: openingCounts.large,
    small_boarding: openingCounts.small,
    private_play_boarding: openingCounts.privatePlay,
    half_and_half_boarding: openingCounts.halfAndHalf,
    evaluation_boarding: openingCounts.evaluationBoarding,
    unclassified_boarding: openingCounts.unknown,
  };
  const closing = {
    large_boarding: closingCounts.large,
    small_boarding: closingCounts.small,
    private_play_boarding: closingCounts.privatePlay,
    half_and_half_boarding: closingCounts.halfAndHalf,
    evaluation_boarding: closingCounts.evaluationBoarding,
    unclassified_boarding: closingCounts.unknown,
  };
  const departingSource = departingCounts || {
    large: 0,
    small: 0,
    privatePlay: 0,
    halfAndHalf: 0,
    evaluationBoarding: 0,
    unknown: 0,
  };
  const departing = {
    large_boarding: departingSource.large,
    small_boarding: departingSource.small,
    private_play_boarding: departingSource.privatePlay,
    half_and_half_boarding: departingSource.halfAndHalf,
    evaluation_boarding: departingSource.evaluationBoarding,
    unclassified_boarding: departingSource.unknown,
  };
  const daycare = {
    evaluations: evaluationsCount,
    private_play_dayboarding: daytimePrivatePlay,
    half_and_half_daytime: daytimeHalfAndHalf,
    large_daycare: daytimeLarge,
    small_daycare: daytimeSmall,
    unclassified_daycare: daycareCounts.unknown + dayboardingCounts.unknown,
  };

  const openingTotal =
    opening.large_boarding
    + opening.small_boarding
    + opening.private_play_boarding
    + opening.half_and_half_boarding
    + opening.evaluation_boarding
    + opening.unclassified_boarding;
  const closingTotal =
    closing.large_boarding
    + closing.small_boarding
    + closing.private_play_boarding
    + closing.half_and_half_boarding
    + closing.evaluation_boarding
    + closing.unclassified_boarding;
  const departingTotal =
    departing.large_boarding
    + departing.small_boarding
    + departing.private_play_boarding
    + departing.half_and_half_boarding
    + departing.evaluation_boarding
    + departing.unclassified_boarding;
  const daycareTotal =
    daycare.evaluations
    + daycare.private_play_dayboarding
    + daycare.half_and_half_daytime
    + daycare.large_daycare
    + daycare.small_daycare
    + daycare.unclassified_daycare;
  const playYard = {
    large_play_dogs: Math.max(opening.large_boarding, closing.large_boarding) + daycare.large_daycare,
    small_play_dogs: Math.max(opening.small_boarding, closing.small_boarding) + daycare.small_daycare,
    private_play_dogs: Math.max(opening.private_play_boarding, closing.private_play_boarding) + daycare.private_play_dayboarding,
    split_play_dogs: Math.max(opening.half_and_half_boarding, closing.half_and_half_boarding) + daycare.half_and_half_daytime,
  };

  return {
    opening: {
      ...opening,
      total_boarding: openingTotal,
    },
    closing: {
      ...closing,
      total_boarding: closingTotal,
    },
    departing: {
      ...departing,
      total_boarding: departingTotal,
    },
    daycare: {
      ...daycare,
      total_daycare: daycareTotal,
    },
    support: {
      departure_baths: departureBaths,
      morning_feeding_dogs: openingTotal,
      evening_feeding_dogs: closingTotal,
      medication_dogs: medicationDogs,
      tours: toursCount,
      total_dog_volume: closingTotal + daycareTotal,
      total_daily_dog_volume: closingTotal + daycareTotal + departingTotal,
    },
    play_yard: playYard,
  };
}

function sumDisplaySection(section: Record<string, number>, keys: string[]) {
  return keys.reduce((sum, key) => sum + Number(section?.[key] || 0), 0);
}

function cloneDisplay(display: any) {
  return {
    opening: { ...(display?.opening || {}) },
    closing: { ...(display?.closing || {}) },
    departing: { ...(display?.departing || {}) },
    daycare: { ...(display?.daycare || {}) },
    support: { ...(display?.support || {}) },
    play_yard: { ...(display?.play_yard || {}) },
    source: { ...(display?.source || {}) },
  };
}

function buildEmptyDisplayShape() {
  const emptyCounts = { large: 0, small: 0, privatePlay: 0, halfAndHalf: 0, evaluationBoarding: 0, unknown: 0 };
  return buildDisplayShape({
    openingCounts: emptyCounts,
    closingCounts: emptyCounts,
    departingCounts: emptyCounts,
    daycareCounts: emptyCounts,
    dayboardingCounts: emptyCounts,
    evaluationsCount: 0,
    departureBaths: 0,
    medicationDogs: 0,
    toursCount: 0,
  });
}

export function applyGingrWidgetSourceCountsToDisplay(
  display: any,
  sourceCounts?: GingrWidgetSourceCounts | null,
) {
  const nextDisplay = cloneDisplay(display);
  nextDisplay.departing = {
    large_boarding: Number(nextDisplay.departing?.large_boarding || 0),
    small_boarding: Number(nextDisplay.departing?.small_boarding || 0),
    private_play_boarding: Number(nextDisplay.departing?.private_play_boarding || 0),
    half_and_half_boarding: Number(nextDisplay.departing?.half_and_half_boarding || 0),
    evaluation_boarding: Number(nextDisplay.departing?.evaluation_boarding || 0),
    unclassified_boarding: Number(nextDisplay.departing?.unclassified_boarding || 0),
    total_boarding: Number(nextDisplay.departing?.total_boarding || 0),
  };
  if (!sourceCounts) {
    return {
      display: nextDisplay,
      reconciliation: null,
    };
  }

  const derived = {
    opening_boarding: sumDisplaySection(nextDisplay.opening, [
      "large_boarding",
      "small_boarding",
      "private_play_boarding",
      "half_and_half_boarding",
      "evaluation_boarding",
      "unclassified_boarding",
    ]),
    closing_boarding: sumDisplaySection(nextDisplay.closing, [
      "large_boarding",
      "small_boarding",
      "private_play_boarding",
      "half_and_half_boarding",
      "evaluation_boarding",
      "unclassified_boarding",
    ]),
    departing_boarding: sumDisplaySection(nextDisplay.departing, [
      "large_boarding",
      "small_boarding",
      "private_play_boarding",
      "half_and_half_boarding",
      "evaluation_boarding",
      "unclassified_boarding",
    ]),
    daytime_total: sumDisplaySection(nextDisplay.daycare, [
      "evaluations",
      "private_play_dayboarding",
      "half_and_half_daytime",
      "large_daycare",
      "small_daycare",
      "unclassified_daycare",
    ]),
    total_dog_volume: Number(nextDisplay.support?.total_dog_volume || 0),
  };

  const source = {
    check_ins: sourceCounts.check_ins,
    check_outs: sourceCounts.check_outs,
    overnight: sourceCounts.overnight,
    total: sourceCounts.total,
    boarding_opening: sourceCounts.boarding.opening,
    boarding_closing: sourceCounts.boarding.overnight,
    boarding_check_ins: sourceCounts.boarding.check_ins,
    boarding_check_outs: sourceCounts.boarding.check_outs,
    boarding_departing: sourceCounts.boarding.check_outs,
    daytime_total: sourceCounts.daytime.total,
    default_dog_volume: sourceCounts.boarding.overnight + sourceCounts.daytime.total,
  };

  const deltas = {
    opening_boarding: source.boarding_opening - derived.opening_boarding,
    closing_boarding: source.boarding_closing - derived.closing_boarding,
    departing_boarding: source.boarding_departing - derived.departing_boarding,
    daytime_total: source.daytime_total - derived.daytime_total,
    total_dog_volume: source.default_dog_volume - derived.total_dog_volume,
  };
  const sourceAdjustments = {
    opening_boarding: Math.max(0, deltas.opening_boarding),
    closing_boarding: Math.max(0, deltas.closing_boarding),
    departing_boarding: Math.max(0, deltas.departing_boarding),
    daytime_total: Math.max(0, deltas.daytime_total),
    total_dog_volume: Math.max(0, deltas.total_dog_volume),
  };
  const remainingDeltas = {
    opening_boarding: Math.min(0, deltas.opening_boarding),
    closing_boarding: Math.min(0, deltas.closing_boarding),
    departing_boarding: Math.min(0, deltas.departing_boarding),
    daytime_total: Math.min(0, deltas.daytime_total),
    total_dog_volume: Math.min(0, deltas.total_dog_volume),
  };

  if (deltas.opening_boarding > 0) {
    nextDisplay.opening.unclassified_boarding = Number(nextDisplay.opening.unclassified_boarding || 0) + deltas.opening_boarding;
  }
  if (deltas.closing_boarding > 0) {
    nextDisplay.closing.unclassified_boarding = Number(nextDisplay.closing.unclassified_boarding || 0) + deltas.closing_boarding;
  }
  if (deltas.departing_boarding > 0) {
    nextDisplay.departing.unclassified_boarding = Number(nextDisplay.departing.unclassified_boarding || 0) + deltas.departing_boarding;
  }
  if (deltas.daytime_total > 0) {
    nextDisplay.daycare.unclassified_daycare = Number(nextDisplay.daycare.unclassified_daycare || 0) + deltas.daytime_total;
  }

  nextDisplay.opening.total_boarding = source.boarding_opening;
  nextDisplay.closing.total_boarding = source.boarding_closing;
  nextDisplay.departing.total_boarding = source.boarding_departing;
  nextDisplay.daycare.total_daycare = source.daytime_total;
  nextDisplay.support.morning_feeding_dogs = source.boarding_opening;
  nextDisplay.support.evening_feeding_dogs = source.boarding_closing;
  nextDisplay.support.total_dog_volume = source.default_dog_volume;
  nextDisplay.support.total_daily_dog_volume = source.default_dog_volume + source.boarding_departing;
  nextDisplay.source = source;

  return {
    display: nextDisplay,
    reconciliation: {
      source,
      derived,
      deltas,
      source_adjustments: sourceAdjustments,
      remaining_deltas: remainingDeltas,
      per_type: sourceCounts.per_type,
      synced_at: sourceCounts.synced_at || null,
      is_reconciled: Object.values(remainingDeltas).every((delta) => Number(delta) === 0),
      source_endpoint: "reservation_widget_data",
    },
  };
}

function flattenDisplay(display: any) {
  return {
    opening_large_boarding: Number(display?.opening?.large_boarding || 0),
    opening_small_boarding: Number(display?.opening?.small_boarding || 0),
    opening_private_play_boarding: Number(display?.opening?.private_play_boarding || 0),
    opening_half_and_half_boarding: Number(display?.opening?.half_and_half_boarding || 0),
    opening_evaluation_boarding: Number(display?.opening?.evaluation_boarding || 0),
    opening_unclassified_boarding: Number(display?.opening?.unclassified_boarding || 0),
    opening_total_boarding: Number(display?.opening?.total_boarding || 0),
    closing_large_boarding: Number(display?.closing?.large_boarding || 0),
    closing_small_boarding: Number(display?.closing?.small_boarding || 0),
    closing_private_play_boarding: Number(display?.closing?.private_play_boarding || 0),
    closing_half_and_half_boarding: Number(display?.closing?.half_and_half_boarding || 0),
    closing_evaluation_boarding: Number(display?.closing?.evaluation_boarding || 0),
    closing_unclassified_boarding: Number(display?.closing?.unclassified_boarding || 0),
    closing_total_boarding: Number(display?.closing?.total_boarding || 0),
    departing_large_boarding: Number(display?.departing?.large_boarding || 0),
    departing_small_boarding: Number(display?.departing?.small_boarding || 0),
    departing_private_play_boarding: Number(display?.departing?.private_play_boarding || 0),
    departing_half_and_half_boarding: Number(display?.departing?.half_and_half_boarding || 0),
    departing_evaluation_boarding: Number(display?.departing?.evaluation_boarding || 0),
    departing_unclassified_boarding: Number(display?.departing?.unclassified_boarding || 0),
    departing_total_boarding: Number(display?.departing?.total_boarding || 0),
    daycare_evaluations: Number(display?.daycare?.evaluations || 0),
    daycare_private_play_dayboarding: Number(display?.daycare?.private_play_dayboarding || 0),
    daycare_half_and_half_daytime: Number(display?.daycare?.half_and_half_daytime || 0),
    daycare_large_daycare: Number(display?.daycare?.large_daycare || 0),
    daycare_small_daycare: Number(display?.daycare?.small_daycare || 0),
    daycare_unclassified_daycare: Number(display?.daycare?.unclassified_daycare || 0),
    daycare_total_daycare: Number(display?.daycare?.total_daycare || 0),
    support_departure_baths: Number(display?.support?.departure_baths || 0),
    support_morning_feeding_dogs: Number(display?.support?.morning_feeding_dogs || 0),
    support_evening_feeding_dogs: Number(display?.support?.evening_feeding_dogs || 0),
    support_medication_dogs: Number(display?.support?.medication_dogs || 0),
    support_total_dog_volume: Number(display?.support?.total_dog_volume || 0),
    support_total_daily_dog_volume: Number(display?.support?.total_daily_dog_volume || (
      Number(display?.support?.total_dog_volume || 0) + Number(display?.departing?.total_boarding || 0)
    )),
    support_tours: Number(display?.support?.tours || 0),
    play_yard_large_play_dogs: Number(display?.play_yard?.large_play_dogs || 0),
    play_yard_small_play_dogs: Number(display?.play_yard?.small_play_dogs || 0),
    play_yard_private_play_dogs: Number(display?.play_yard?.private_play_dogs || 0),
    play_yard_split_play_dogs: Number(display?.play_yard?.split_play_dogs || 0),
  };
}

function toHistoricalMetric(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : null;
}

function getCanonicalSourceMetrics(display: any) {
  const source = display?.source || null;
  const overnight = toHistoricalMetric(source?.overnight ?? display?.closing?.total_boarding);
  const daytime = toHistoricalMetric(source?.daytime_total ?? display?.daycare?.total_daycare);
  const defaultTotal = overnight !== null && daytime !== null
    ? overnight + daytime
    : toHistoricalMetric(display?.support?.total_dog_volume);
  const boardingDeparting = toHistoricalMetric(source?.boarding_departing ?? source?.boarding_check_outs ?? display?.departing?.total_boarding);
  const totalDailyVolume = toHistoricalMetric(display?.support?.total_daily_dog_volume)
    ?? (
      defaultTotal !== null && boardingDeparting !== null
        ? defaultTotal + boardingDeparting
        : null
    );
  return {
    overnight,
    daytime,
    total: defaultTotal,
    boarding_departing: boardingDeparting,
    total_daily_volume: totalDailyVolume,
    source_available: !!source || defaultTotal !== null,
    source_endpoint: source ? "gingr_reservation_widget_daily" : null,
    raw_gingr_total: toHistoricalMetric(source?.total),
  };
}

function percentageOfCurrentYear(lastYearValue: number | null, currentValue: number | null): number | null {
  if (lastYearValue === null || currentValue === null || currentValue <= 0) return null;
  return Number(((lastYearValue / currentValue) * 100).toFixed(1));
}

function getWidgetSourceForDate(
  sourceByDate: Map<string, GingrWidgetSourceCounts> | Record<string, GingrWidgetSourceCounts> | null | undefined,
  targetDate: string,
) {
  if (!sourceByDate) return null;
  if (sourceByDate instanceof Map) return sourceByDate.get(targetDate) || null;
  return sourceByDate[targetDate] || null;
}

function applyHistoricalWidgetSource(display: any, sourceCounts: GingrWidgetSourceCounts | null) {
  if (!display || !sourceCounts) return display;
  return applyGingrWidgetSourceCountsToDisplay(display, sourceCounts).display;
}

function buildHistoricalDisplayFromSourceOnly(sourceCounts: GingrWidgetSourceCounts | null) {
  if (!sourceCounts) return null;
  return applyGingrWidgetSourceCountsToDisplay(buildEmptyDisplayShape(), sourceCounts).display;
}

function buildHistoricalComparisonDisplaysByOffset({
  currentDate,
  historicalReservations,
  historicalWidgetSourceByDate,
  roomByDate,
  totalRooms,
}: {
  currentDate: string;
  historicalReservations: any[];
  historicalWidgetSourceByDate?: Map<string, GingrWidgetSourceCounts> | Record<string, GingrWidgetSourceCounts> | null;
  roomByDate: Record<string, { occupied: number; available: number; total: number }>;
  totalRooms: number;
}) {
  const displaysByOffset: Record<number, any> = {};
  for (let yearOffset = 1; yearOffset <= HISTORICAL_COMPARISON_MAX_YEAR_OFFSET; yearOffset += 1) {
    const sampleDate = shiftYearsStr(currentDate, -yearOffset);
    const source = getWidgetSourceForDate(historicalWidgetSourceByDate, sampleDate);
    const activeRows = historicalReservations.filter((row) => row.startKey <= sampleDate && row.endKey >= sampleDate);
    if (!activeRows.length && !source) continue;

    const snapshotDisplay = activeRows.length
      ? computeDemandSnapshotForDate({
        targetDate: sampleDate,
        reservations: historicalReservations,
        roomByDate,
        totalRooms,
      }).display
      : buildHistoricalDisplayFromSourceOnly(source);
    const display = applyHistoricalWidgetSource(snapshotDisplay, source);
    if (display) displaysByOffset[yearOffset] = display;
  }
  return displaysByOffset;
}

function buildHistoricalComparisonPayload({
  currentDate,
  lastYearDate,
  currentDisplay,
  lastYearDisplay,
  priorYearDisplaysByOffset = {},
}: {
  currentDate: string;
  lastYearDate: string;
  currentDisplay: any;
  lastYearDisplay: any;
  priorYearDisplaysByOffset?: Record<number, any>;
}) {
  const current = getCanonicalSourceMetrics(currentDisplay);
  const priorYearEntries = Object.entries({
    ...priorYearDisplaysByOffset,
    ...(lastYearDisplay ? { 1: lastYearDisplay } : {}),
  })
    .map(([yearOffset, display]) => {
      const offset = Number(yearOffset);
      const metrics = getCanonicalSourceMetrics(display);
      if (!Number.isFinite(offset) || metrics.total === null) return null;
      return {
        year_offset: offset,
        comparison_date: shiftYearsStr(currentDate, -offset),
        label: offset === 1 ? "YOY" : `YO${offset}Y`,
        metrics,
        total_pct_vs_current_year: percentageOfCurrentYear(metrics.total, current.total),
        total_daily_volume_pct_vs_current_year: percentageOfCurrentYear(metrics.total_daily_volume, current.total_daily_volume),
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => a.year_offset - b.year_offset) as any[];
  const lastYear = priorYearEntries.find((entry) => entry.year_offset === 1)?.metrics
    || getCanonicalSourceMetrics(lastYearDisplay);
  const legacyLastYearTotal = lastYear.total
    ?? toHistoricalMetric(lastYearDisplay?.support?.total_dog_volume);

  return {
    source: "gingr_reservation_widget_daily",
    current_year_date: currentDate,
    last_year_date: lastYearDate,
    current_year: current,
    last_year: lastYear,
    prior_years: priorYearEntries,
    yoy_overnight: lastYear.overnight,
    yoy_daytime: lastYear.daytime,
    yoy_total: lastYear.total,
    yoy_total_pct_vs_current_year: percentageOfCurrentYear(lastYear.total, current.total),
    yoy_boarding_departing: lastYear.boarding_departing,
    yoy_total_daily_volume: lastYear.total_daily_volume,
    yoy_total_daily_volume_pct_vs_current_year: percentageOfCurrentYear(lastYear.total_daily_volume, current.total_daily_volume),
    last_year_total_dog_volume: legacyLastYearTotal,
    source_available: current.source_available && lastYear.source_available,
  };
}

const DERIVED_PROJECTION_METRIC_KEYS = new Set([
  "support_morning_feeding_dogs",
  "support_evening_feeding_dogs",
  "support_total_dog_volume",
  "support_total_daily_dog_volume",
  "play_yard_large_play_dogs",
  "play_yard_small_play_dogs",
  "play_yard_private_play_dogs",
  "play_yard_split_play_dogs",
]);

function getFiniteFlatNumber(flat: Record<string, number>, key: string) {
  const value = Number(flat[key]);
  return Number.isFinite(value) ? value : null;
}

function buildDisplayFromFlat(flat: Record<string, number>) {
  const display = buildDisplayShape({
    openingCounts: {
      large: Number(flat.opening_large_boarding || 0),
      small: Number(flat.opening_small_boarding || 0),
      privatePlay: Number(flat.opening_private_play_boarding || 0),
      halfAndHalf: Number(flat.opening_half_and_half_boarding || 0),
      evaluationBoarding: Number(flat.opening_evaluation_boarding || 0),
      unknown: Number(flat.opening_unclassified_boarding || 0),
    },
    closingCounts: {
      large: Number(flat.closing_large_boarding || 0),
      small: Number(flat.closing_small_boarding || 0),
      privatePlay: Number(flat.closing_private_play_boarding || 0),
      halfAndHalf: Number(flat.closing_half_and_half_boarding || 0),
      evaluationBoarding: Number(flat.closing_evaluation_boarding || 0),
      unknown: Number(flat.closing_unclassified_boarding || 0),
    },
    departingCounts: {
      large: Number(flat.departing_large_boarding || 0),
      small: Number(flat.departing_small_boarding || 0),
      privatePlay: Number(flat.departing_private_play_boarding || 0),
      halfAndHalf: Number(flat.departing_half_and_half_boarding || 0),
      evaluationBoarding: Number(flat.departing_evaluation_boarding || 0),
      unknown: Number(flat.departing_unclassified_boarding || 0),
    },
    daycareCounts: {
      large: Number(flat.daycare_large_daycare || 0),
      small: Number(flat.daycare_small_daycare || 0),
      privatePlay: Number(flat.daycare_private_play_dayboarding || 0),
      halfAndHalf: Number(flat.daycare_half_and_half_daytime || 0),
      evaluationBoarding: 0,
      unknown: Number(flat.daycare_unclassified_daycare || 0),
    },
    dayboardingCounts: {
      large: 0,
      small: 0,
      privatePlay: 0,
      halfAndHalf: 0,
      evaluationBoarding: 0,
      unknown: 0,
    },
    evaluationsCount: Number(flat.daycare_evaluations || 0),
    departureBaths: Number(flat.support_departure_baths || 0),
    medicationDogs: Number(flat.support_medication_dogs || 0),
    toursCount: Number(flat.support_tours || 0),
  });

  const openingTotal = getFiniteFlatNumber(flat, "opening_total_boarding");
  const closingTotal = getFiniteFlatNumber(flat, "closing_total_boarding");
  const departingTotal = getFiniteFlatNumber(flat, "departing_total_boarding");
  const daycareTotal = getFiniteFlatNumber(flat, "daycare_total_daycare");

  if (openingTotal !== null) display.opening.total_boarding = openingTotal;
  if (closingTotal !== null) display.closing.total_boarding = closingTotal;
  if (departingTotal !== null) display.departing.total_boarding = departingTotal;
  if (daycareTotal !== null) display.daycare.total_daycare = daycareTotal;
  display.support.morning_feeding_dogs = display.opening.total_boarding;
  display.support.evening_feeding_dogs = display.closing.total_boarding;
  display.support.total_dog_volume = display.closing.total_boarding + display.daycare.total_daycare;
  display.support.total_daily_dog_volume = display.support.total_dog_volume + display.departing.total_boarding;

  return display;
}

export function computeDemandSnapshotForDate({
  targetDate,
  reservations,
  roomByDate,
  totalRooms,
}: {
  targetDate: string;
  reservations: any[];
  roomByDate: Record<string, { occupied: number; available: number; total: number }>;
  totalRooms: number;
}) {
  const activeToday = reservations.filter((row) =>
    row.startKey <= targetDate &&
    row.endKey >= targetDate &&
    !isCheckedOutBeforeDate(row, targetDate)
  );

  const openingBoarding = activeToday.filter((row) =>
    row.cls === "boarding" &&
    row.startKey < targetDate &&
    wasCheckedInBeforeDate(row, targetDate)
  );
  const closingBoarding = activeToday.filter((row) =>
    row.cls === "boarding" &&
    row.endKey > targetDate &&
    !isCheckedOutByDate(row, targetDate)
  );
  const departingBoarding = reservations.filter((row) =>
    isBoardingDepartureForDate(row, targetDate)
  );
  const activeBoardingForPeak = activeToday.filter((row) => row.cls === "boarding" && !isEvaluationBoardingToday(row, targetDate));
  const evaluations = activeToday.filter((row) => row.cls === "evaluation" || row.isFirstEverDaycareVisit);
  const activeDaycare = activeToday.filter((row) => row.cls === "daycare" && !row.isFirstEverDaycareVisit);
  const activeDayboarding = activeToday.filter((row) => row.cls === "dayboarding");
  const tours = activeToday.filter((row) => row.cls === "tour");

  const openingCounts = splitCounts(openingBoarding, targetDate);
  const closingCounts = splitCounts(closingBoarding, targetDate);
  const departingCounts = splitCounts(departingBoarding, targetDate);
  const daycareCounts = splitCounts(activeDaycare, targetDate);
  const dayboardingCounts = splitCounts(activeDayboarding, targetDate);
  const peakCounts = splitCounts([...activeBoardingForPeak, ...activeDaycare, ...activeDayboarding], targetDate);

  const dogsArriving = countDistinctAnimals(
    activeToday.filter((row) => row.startKey === targetDate && row.cls !== "tour" && row.cls !== "grooming"),
  );
  const dogsDeparting = countDistinctAnimals(
    reservations.filter((row) =>
      row.cls !== "tour" &&
      row.cls !== "grooming" &&
      ((row.endKey === targetDate && !isCheckedOutBeforeDate(row, targetDate)) || isCheckedOutOnDate(row, targetDate))
    ),
  );
  const departureBaths = countDepartureBaths(
    departingBoarding,
    targetDate,
  );
  const medicationDogs = uniqueMedicationDogs(activeToday, targetDate);
  const roomSummary = roomByDate[targetDate];
  const display = buildDisplayShape({
    openingCounts,
    closingCounts,
    departingCounts,
    daycareCounts,
    dayboardingCounts,
    evaluationsCount: evaluations.length,
    departureBaths,
    medicationDogs,
    toursCount: tours.length,
  });
  const roomCountsEstimated = !roomSummary && totalRooms > 0;

  return {
    openingBoarding,
    closingBoarding,
    departingBoarding,
    activeDaycare,
    activeDayboarding,
    evaluations,
    tours,
    openingCounts,
    closingCounts,
    departingCounts,
    daycareCounts,
    dayboardingCounts,
    peakCounts,
    dogsArriving,
    dogsDeparting,
    departureBaths,
    medicationDogs,
    roomSummary,
    roomCountsEstimated,
    display,
    solverInputs: {
      peak_large_daycare: peakCounts.large,
      peak_small_daycare: peakCounts.small,
      peak_unknown_daycare: peakCounts.unknown,
      play_yard_large_dogs: display.play_yard.large_play_dogs,
      play_yard_small_dogs: display.play_yard.small_play_dogs,
      play_yard_private_play_dogs: display.play_yard.private_play_dogs,
      play_yard_split_play_dogs: display.play_yard.split_play_dogs,
      total_private_play_dogs:
        openingCounts.privatePlay
        + openingCounts.halfAndHalf
        + daycareCounts.privatePlay
        + daycareCounts.halfAndHalf
        + dayboardingCounts.privatePlay
        + dayboardingCounts.halfAndHalf,
      morning_feeding_dogs: display.support.morning_feeding_dogs,
      evening_feeding_dogs: display.support.evening_feeding_dogs,
      medication_dogs: medicationDogs,
    },
    roomsOccupied: roomSummary?.occupied ?? display.closing.total_boarding,
    roomsAvailable: roomSummary?.available ?? Math.max((roomSummary?.total || totalRooms || 0) - (roomSummary?.occupied ?? display.closing.total_boarding), 0),
    resolvedTotalRooms: roomSummary?.total || totalRooms || 0,
  };
}

function projectionWeight(candidate: ProjectionCandidate, targetDate: string) {
  const recencyWeight = 1 / candidate.yearOffset;
  const distanceWeight = candidate.dateDistance === 0 ? 1 : 1 / (candidate.dateDistance + 1);
  const sameWeekdayWeight = getWeekday(candidate.sampleDate) === getWeekday(targetDate) ? 1.4 : 0.35;
  const modeWeight = candidate.fallbackMode === "same_weekday_prior_year"
    ? 1.25
    : candidate.fallbackMode === "same_weekday_prior_years_2_to_4"
      ? 0.85
      : candidate.fallbackMode === "exact_prior_years_2_to_4"
        ? 0.55
        : 0.9;
  return recencyWeight * distanceWeight * sameWeekdayWeight * modeWeight;
}

function summarizeProjectionSampleModes(samples: any[]) {
  return samples.reduce((acc: Record<string, number>, sample) => {
    const key = sample.fallbackMode || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function projectionModeForSamples(samples: any[]): ProjectionFallbackMode | null {
  if (!samples.length) return null;
  const modes = new Set(samples.map((sample) => sample.fallbackMode));
  return modes.size === 1 ? samples[0].fallbackMode : "weighted_comparable_blend";
}

export function buildProjectionForDate({
  targetDate,
  currentDate,
  currentSnapshot,
  historicalReservations,
  calibrationReservations = [],
  calibrationHistoricalReservations = [],
  weeklyPaceCalibration = null,
  roomByDate,
  totalRooms,
  capacityConfig,
  historicalWidgetSourceByDate = null,
}: {
  targetDate: string;
  currentDate: string;
  currentSnapshot: ReturnType<typeof computeDemandSnapshotForDate>;
  historicalReservations: any[];
  calibrationReservations?: any[];
  calibrationHistoricalReservations?: any[];
  weeklyPaceCalibration?: any;
  roomByDate: Record<string, { occupied: number; available: number; total: number }>;
  totalRooms: number;
  capacityConfig?: ReturnType<typeof normalizeProjectionCapacityConfig> | null;
  historicalWidgetSourceByDate?: Map<string, GingrWidgetSourceCounts> | Record<string, GingrWidgetSourceCounts> | null;
}) {
  const leadDays = Math.max(0, diffDays(currentDate, targetDate));
  const currentFlat = flattenDisplay(currentSnapshot.display);
  const exactLastYear = shiftYearsStr(targetDate, -1);
  const exactLastYearReservations = historicalReservations.filter((row) => row.startKey <= exactLastYear && row.endKey >= exactLastYear);
  const exactLastYearSource = getWidgetSourceForDate(historicalWidgetSourceByDate, exactLastYear);
  const exactLastYearSnapshot = exactLastYearReservations.length > 0 || exactLastYearSource
    ? computeDemandSnapshotForDate({
      targetDate: exactLastYear,
      reservations: historicalReservations,
      roomByDate,
      totalRooms,
    })
    : null;
  const historicalComparisonDisplaysByOffset = buildHistoricalComparisonDisplaysByOffset({
    currentDate: targetDate,
    historicalReservations,
    historicalWidgetSourceByDate,
    roomByDate,
    totalRooms,
  });
  const exactLastYearDisplay = historicalComparisonDisplaysByOffset[1]
    || applyHistoricalWidgetSource(exactLastYearSnapshot?.display || null, exactLastYearSource);

  if (leadDays <= 0) {
    const actualCapacity = buildProjectionCapacityEnvelope({
      display: currentSnapshot.display,
      totalRooms,
      capacityConfig,
    });
    return {
      as_of_date: currentDate,
      lead_days: leadDays,
      state: "actual",
      model_version: PROJECTION_MODEL_VERSION,
      display: currentSnapshot.display,
      demand_display: currentSnapshot.display,
      achievable_display: currentSnapshot.display,
      capacity: {
        ...actualCapacity,
        achievable_forecast: summarizeCapacityDisplay(currentSnapshot.display),
        has_capacity_constrained_projection: false,
      },
      exact_last_year_display: exactLastYearDisplay,
      comparisons: buildHistoricalComparisonPayload({
        currentDate: targetDate,
        lastYearDate: exactLastYear,
        currentDisplay: currentSnapshot.display,
        lastYearDisplay: exactLastYearDisplay,
        priorYearDisplaysByOffset: historicalComparisonDisplaysByOffset,
      }),
      explanations: {},
      sample_count: 0,
    };
  }

  const candidates = getProjectionCandidates(targetDate);
  const projectedFlat: Record<string, number> = { ...currentFlat };
  const explanations: Record<string, any> = {};
  let exactLastYearDisplayProjected: any = exactLastYearDisplay;
  let sampleCount = 0;

  const historicalFinalCache = new Map<string, ReturnType<typeof computeDemandSnapshotForDate>>();
  const historicalAsOfCache = new Map<string, ReturnType<typeof computeDemandSnapshotForDate>>();

  const getHistoricalSnapshot = (sampleDate: string, asOfDate?: string) => {
    const cacheKey = `${sampleDate}|${asOfDate || "final"}`;
    const existing = asOfDate ? historicalAsOfCache.get(cacheKey) : historicalFinalCache.get(cacheKey);
    if (existing) return existing;

    const snapshotReservations = asOfDate
      ? historicalReservations.filter((row) => !row.bookedDateKey || row.bookedDateKey <= asOfDate)
      : historicalReservations;

    const snapshot = computeDemandSnapshotForDate({
      targetDate: sampleDate,
      reservations: snapshotReservations,
      roomByDate,
      totalRooms,
    });

    if (asOfDate) historicalAsOfCache.set(cacheKey, snapshot);
    else historicalFinalCache.set(cacheKey, snapshot);
    return snapshot;
  };

  const samples = candidates.map((candidate) => {
    const sampleDate = candidate.sampleDate;
    const finalSnapshot = getHistoricalSnapshot(sampleDate);
    const asOfDate = addDaysStr(sampleDate, -leadDays);
    const asOfSnapshot = getHistoricalSnapshot(sampleDate, asOfDate);
    const weight = projectionWeight(candidate, targetDate);
    if (sampleDate === exactLastYear) {
      exactLastYearDisplayProjected = applyHistoricalWidgetSource(finalSnapshot.display, exactLastYearSource);
      historicalComparisonDisplaysByOffset[1] = exactLastYearDisplayProjected;
    }
    return {
      ...candidate,
      sampleDate,
      weight,
      asOfDate,
      finalFlat: flattenDisplay(finalSnapshot.display),
      asOfFlat: flattenDisplay(asOfSnapshot.display),
      finalDisplay: finalSnapshot.display,
    };
  });

  const metricKeys = Object.keys(currentFlat);
  const fallbackModes = [
    "exact_prior_year",
    "same_weekday_prior_year",
    "exact_prior_years_2_to_4",
    "same_weekday_prior_years_2_to_4",
  ] as ProjectionFallbackMode[];

  const selectSamplesForMetric = (metricKey: string, currentValue: number) => {
    const usableByMode = new Map<ProjectionFallbackMode, any[]>();
    for (const mode of fallbackModes) {
      usableByMode.set(
        mode,
        samples.filter((sample) => {
          if (sample.fallbackMode !== mode) return false;
          const finalValue = Number(sample.finalFlat[metricKey] || 0);
          const asOfValue = Number(sample.asOfFlat[metricKey] || 0);
          if (finalValue <= 0) return false;
          if (currentValue === 0) return true;
          return asOfValue > 0;
        }),
      );
    }

    const primarySamples = [
      ...(usableByMode.get("exact_prior_year") || []),
      ...(usableByMode.get("same_weekday_prior_year") || []),
    ];
    const olderSamples = [
      ...(usableByMode.get("exact_prior_years_2_to_4") || []),
      ...(usableByMode.get("same_weekday_prior_years_2_to_4") || []),
    ];
    const usableSamples = primarySamples.length ? primarySamples : olderSamples;

    return {
      chosenMode: projectionModeForSamples(usableSamples),
      usableSamples,
    };
  };

  const getCompletionRateFromSamples = (usableSamples: any[]) => {
    const weights = usableSamples.map((sample) => sample.weight);
    const finalValues = usableSamples.map((sample) => Number(sample.finalFlat.support_total_dog_volume || 0));
    const asOfValues = usableSamples.map((sample) => Number(sample.asOfFlat.support_total_dog_volume || 0));
    const weightedFinal = weightedAverage(finalValues, weights, 0);
    const weightedAsOf = weightedAverage(asOfValues, weights, 0);
    const completionRate = weightedFinal > 0 && weightedAsOf > 0
      ? clampNumber(weightedAsOf / weightedFinal, 0.01, 1)
      : 0;
    return {
      weightedFinal,
      weightedAsOf,
      completionRate,
    };
  };

  const buildYoyPickupCalibration = () => {
    if (leadDays <= 0 || !calibrationReservations.length || !calibrationHistoricalReservations.length) {
      return {
        factor: 1,
        raw_factor: 1,
        sample_count: 0,
        confidence: "none",
        lookback_days: PROJECTION_CALIBRATION_LOOKBACK_DAYS,
        min_samples: PROJECTION_CALIBRATION_MIN_SAMPLES,
        sample_dates: [],
      };
    }

    const currentCache = new Map<string, ReturnType<typeof computeDemandSnapshotForDate>>();
    const historicalCache = new Map<string, ReturnType<typeof computeDemandSnapshotForDate>>();
    const getSnapshot = (
      sampleDate: string,
      rows: any[],
      cache: Map<string, ReturnType<typeof computeDemandSnapshotForDate>>,
      asOfDate?: string,
    ) => {
      const cacheKey = `${sampleDate}|${asOfDate || "final"}`;
      const existing = cache.get(cacheKey);
      if (existing) return existing;
      const snapshotRows = asOfDate
        ? rows.filter((row) => !row.bookedDateKey || row.bookedDateKey <= asOfDate)
        : rows;
      const snapshot = computeDemandSnapshotForDate({
        targetDate: sampleDate,
        reservations: snapshotRows,
        roomByDate,
        totalRooms,
      });
      cache.set(cacheKey, snapshot);
      return snapshot;
    };

    const sampleRows = buildProjectionCalibrationDates(currentDate)
      .map((sampleDate) => {
        const currentFinal = flattenDisplay(
          getSnapshot(sampleDate, calibrationReservations, currentCache).display,
        );
        const currentAsOf = flattenDisplay(
          getSnapshot(sampleDate, calibrationReservations, currentCache, addDaysStr(sampleDate, -leadDays)).display,
        );
        const currentFinalValue = Number(currentFinal.support_total_dog_volume || 0);
        const currentAsOfValue = Number(currentAsOf.support_total_dog_volume || 0);
        if (currentFinalValue <= 0 || currentAsOfValue <= 0) return null;

        const comparableSamples = getProjectionCandidates(sampleDate)
          .filter((candidate) => candidate.yearOffset === 1)
          .map((candidate) => {
            const finalFlat = flattenDisplay(
              getSnapshot(candidate.sampleDate, calibrationHistoricalReservations, historicalCache).display,
            );
            const asOfFlat = flattenDisplay(
              getSnapshot(candidate.sampleDate, calibrationHistoricalReservations, historicalCache, addDaysStr(candidate.sampleDate, -leadDays)).display,
            );
            const finalValue = Number(finalFlat.support_total_dog_volume || 0);
            const asOfValue = Number(asOfFlat.support_total_dog_volume || 0);
            if (finalValue <= 0 || asOfValue <= 0) return null;
            return {
              ...candidate,
              weight: projectionWeight(candidate, sampleDate),
              finalValue,
              asOfValue,
            };
          })
          .filter(Boolean) as any[];

        if (!comparableSamples.length) return null;

        const priorFinal = weightedAverage(
          comparableSamples.map((sample) => sample.finalValue),
          comparableSamples.map((sample) => sample.weight),
          0,
        );
        const priorAsOf = weightedAverage(
          comparableSamples.map((sample) => sample.asOfValue),
          comparableSamples.map((sample) => sample.weight),
          0,
        );
        if (priorFinal <= 0 || priorAsOf <= 0) return null;

        const currentCompletion = clampNumber(currentAsOfValue / currentFinalValue, 0.01, 1);
        const priorCompletion = clampNumber(priorAsOf / priorFinal, 0.01, 1);
        const factor = priorCompletion / currentCompletion;
        const recencyDays = Math.max(1, diffDays(sampleDate, currentDate));
        return {
          sampleDate,
          factor,
          current_completion_rate: Number(currentCompletion.toFixed(4)),
          prior_completion_rate: Number(priorCompletion.toFixed(4)),
          current_as_of: currentAsOfValue,
          current_final: currentFinalValue,
          prior_as_of: Number(priorAsOf.toFixed(2)),
          prior_final: Number(priorFinal.toFixed(2)),
          weight: (1 / recencyDays) * Math.max(1, currentFinalValue),
        };
      })
      .filter(Boolean) as any[];

    if (sampleRows.length < PROJECTION_CALIBRATION_MIN_SAMPLES) {
      return {
        factor: 1,
        raw_factor: sampleRows.length
          ? Number(weightedAverage(sampleRows.map((row) => row.factor), sampleRows.map((row) => row.weight), 1).toFixed(4))
          : 1,
        sample_count: sampleRows.length,
        confidence: "insufficient_samples",
        lookback_days: PROJECTION_CALIBRATION_LOOKBACK_DAYS,
        min_samples: PROJECTION_CALIBRATION_MIN_SAMPLES,
        sample_dates: sampleRows.map((row) => row.sampleDate),
      };
    }

    const rawFactor = weightedAverage(
      sampleRows.map((row) => row.factor),
      sampleRows.map((row) => row.weight),
      1,
    );
    const factor = clampNumber(rawFactor, PROJECTION_YOY_ADJUSTMENT_MIN, PROJECTION_YOY_ADJUSTMENT_MAX);

    return {
      factor: Number(factor.toFixed(4)),
      raw_factor: Number(rawFactor.toFixed(4)),
      sample_count: sampleRows.length,
      confidence: sampleRows.length >= 10 ? "high" : "medium",
      lookback_days: PROJECTION_CALIBRATION_LOOKBACK_DAYS,
      min_samples: PROJECTION_CALIBRATION_MIN_SAMPLES,
      sample_dates: sampleRows.map((row) => row.sampleDate),
      samples: sampleRows.map(({ weight, ...row }) => row),
    };
  };

  const basisSelection = selectSamplesForMetric(
    "support_total_dog_volume",
    Number(currentFlat.support_total_dog_volume || 0),
  );
  const basis = getCompletionRateFromSamples(basisSelection.usableSamples);
  const yoyCalibration = buildYoyPickupCalibration();

  for (const metricKey of metricKeys) {
    const currentValue = Number(currentFlat[metricKey] || 0);
    const exactSample = samples.find((sample) => sample.fallbackMode === "exact_prior_year") || null;
    const exactLastYearFinal = exactSample ? Number(exactSample.finalFlat[metricKey] || 0) : 0;
    const exactLastYearAsOf = exactSample ? Number(exactSample.asOfFlat[metricKey] || 0) : 0;
    const explanationKey = metricKey.replaceAll(".", "_");

    const { chosenMode, usableSamples } = selectSamplesForMetric(metricKey, currentValue);
    sampleCount = Math.max(sampleCount, usableSamples.length);

    const usesTotalVolumeBasis = currentValue > 0 && basis.completionRate > 0;

    if (!usableSamples.length && !usesTotalVolumeBasis) {
      explanations[explanationKey] = {
        target_date: targetDate,
        as_of_date: currentDate,
        current_value: currentValue,
        projected_value: currentValue,
        lead_days: leadDays,
        exact_prior_year_as_of: exactLastYearAsOf || null,
        exact_prior_year_final: exactLastYearFinal || null,
        completion_rate: exactLastYearFinal > 0 && exactLastYearAsOf > 0
          ? Number((exactLastYearAsOf / exactLastYearFinal).toFixed(4))
          : null,
        fallback_mode: "carry_forward_no_history",
        sample_count: 0,
        yoy_adjustment_factor: 1,
        formula: "carry_forward_current_bookings",
      };
      continue;
    }

    const weights = usableSamples.map((sample) => sample.weight);
    const finalValues = usableSamples.map((sample) => Number(sample.finalFlat[metricKey] || 0));
    const asOfValues = usableSamples.map((sample) => Number(sample.asOfFlat[metricKey] || 0));
    const weightedFinal = weightedAverage(finalValues, weights, currentValue);
    const weightedAsOf = weightedAverage(asOfValues, weights, 0);
    const metricCompletionRate = currentValue === 0
      ? (weightedFinal > 0 ? clampNumber(weightedAsOf / weightedFinal, 0, 1) : 0)
      : (weightedFinal > 0 && weightedAsOf > 0 ? clampNumber(weightedAsOf / weightedFinal, 0.01, 1) : 0);
    const completionRate = usesTotalVolumeBasis ? basis.completionRate : metricCompletionRate;
    const projectionMode = usesTotalVolumeBasis ? basisSelection.chosenMode : chosenMode;
    const projectionSamples = usesTotalVolumeBasis ? basisSelection.usableSamples : usableSamples;

    const projectedValue = currentValue === 0
      ? Math.round(weightedFinal)
      : completionRate > 0
        ? Math.round(currentValue / completionRate)
        : currentValue;
    const yoyAdjustmentFactor = Number(yoyCalibration.factor || 1);
    const weeklyPaceAdjustmentFactor = Number(weeklyPaceCalibration?.factor || 1);
    const adjustedProjectedValue = Math.round(projectedValue * yoyAdjustmentFactor * weeklyPaceAdjustmentFactor);

    projectedFlat[metricKey] = Math.max(currentValue, adjustedProjectedValue);
    explanations[explanationKey] = {
      target_date: targetDate,
      as_of_date: currentDate,
      current_value: currentValue,
      projected_value: projectedFlat[metricKey],
      raw_projected_value: projectedValue,
      lead_days: leadDays,
      exact_prior_year_as_of: exactLastYearAsOf || null,
      exact_prior_year_final: exactLastYearFinal || null,
      completion_rate: completionRate > 0 ? Number(completionRate.toFixed(4)) : null,
      completion_basis: usesTotalVolumeBasis ? "support_total_dog_volume" : metricKey,
      fallback_mode: projectionMode,
      sample_count: projectionSamples.length,
      sample_dates: projectionSamples.map((sample) => sample.sampleDate),
      sample_modes: summarizeProjectionSampleModes(projectionSamples),
      baseline_final_average: Number(weightedFinal.toFixed(2)),
      baseline_as_of_average: Number(weightedAsOf.toFixed(2)),
      yoy_adjustment_factor: yoyAdjustmentFactor,
      yoy_adjustment: yoyCalibration,
      weekly_pace_adjustment_factor: weeklyPaceAdjustmentFactor,
      weekly_pace: weeklyPaceCalibration,
      formula: currentValue === 0
        ? "historical_final_average_x_yoy_pickup_adjustment_x_weekly_pace_adjustment"
        : "currently_booked_divided_by_historical_completion_rate_x_yoy_pickup_adjustment_x_weekly_pace_adjustment",
    };
  }

  const demandDisplay = buildDisplayFromFlat(projectedFlat);
  const derivedProjectedFlat = flattenDisplay(demandDisplay);
  for (const metricKey of DERIVED_PROJECTION_METRIC_KEYS) {
    const explanationKey = metricKey.replaceAll(".", "_");
    const existing = explanations[explanationKey] || {};
    const derivedProjectedValue = Number(derivedProjectedFlat[metricKey] || 0);
    const existingProjectedValue = Number(existing.projected_value);
    const projectedValueChanged = !Number.isFinite(existingProjectedValue) || existingProjectedValue !== derivedProjectedValue;
    explanations[explanationKey] = {
      ...existing,
      target_date: targetDate,
      as_of_date: currentDate,
      current_value: Number(currentFlat[metricKey] || 0),
      projected_value: derivedProjectedValue,
      lead_days: leadDays,
      completion_rate: existing.completion_rate ?? null,
      fallback_mode: projectedValueChanged ? "derived_from_projected_components" : existing.fallback_mode,
    };
  }

  const capacity = buildProjectionCapacityEnvelope({
    display: demandDisplay,
    totalRooms,
    capacityConfig,
  });
  const achievableDisplay = buildCapacityConstrainedDisplay(demandDisplay, capacity);
  const achievableForecast = summarizeCapacityDisplay(achievableDisplay);
  const demandForecast = summarizeCapacityDisplay(demandDisplay);
  const hasCapacityConstrainedProjection = Object.keys(demandForecast).some((key) => {
    const demandValue = Number((demandForecast as any)[key] || 0);
    const achievableValue = Number((achievableForecast as any)[key] || 0);
    return Number.isFinite(demandValue) && Number.isFinite(achievableValue) && achievableValue < demandValue;
  });
  explainCapacityConstrainedMetrics({
    explanations,
    demandDisplay,
    achievableDisplay,
    capacity,
  });

  return {
    as_of_date: currentDate,
    lead_days: leadDays,
    state: "projected",
    model_version: PROJECTION_MODEL_VERSION,
    display: achievableDisplay,
    demand_display: demandDisplay,
    achievable_display: achievableDisplay,
    capacity: {
      ...capacity,
      demand_forecast: demandForecast,
      achievable_forecast: achievableForecast,
      has_capacity_constrained_projection: hasCapacityConstrainedProjection,
    },
    exact_last_year_display: exactLastYearDisplayProjected,
    comparisons: buildHistoricalComparisonPayload({
      currentDate: targetDate,
      lastYearDate: exactLastYear,
      currentDisplay: currentSnapshot.display,
      lastYearDisplay: exactLastYearDisplayProjected,
      priorYearDisplaysByOffset: historicalComparisonDisplaysByOffset,
    }),
    explanations,
    calibration: {
      yoy_pickup: yoyCalibration,
      weekly_pace: weeklyPaceCalibration,
    },
    sample_count: sampleCount,
  };
}

function totalDogVolumeForDate({
  targetDate,
  reservations,
  roomByDate,
  totalRooms,
  asOfDate,
}: {
  targetDate: string;
  reservations: any[];
  roomByDate: Record<string, { occupied: number; available: number; total: number }>;
  totalRooms: number;
  asOfDate?: string | null;
}) {
  const rows = asOfDate
    ? reservations.filter((row) => !row.bookedDateKey || row.bookedDateKey <= asOfDate)
    : reservations;
  return Number(computeDemandSnapshotForDate({
    targetDate,
    reservations: rows,
    roomByDate,
    totalRooms,
  }).display.support.total_dog_volume || 0);
}

function totalDogVolumeForDateRange({
  dates,
  reservations,
  roomByDate,
  totalRooms,
}: {
  dates: string[];
  reservations: any[];
  roomByDate: Record<string, { occupied: number; available: number; total: number }>;
  totalRooms: number;
}) {
  return dates.reduce((sum, targetDate) => sum + totalDogVolumeForDate({
    targetDate,
    reservations,
    roomByDate,
    totalRooms,
  }), 0);
}

export function buildWeeklyPaceCalibration({
  targetDates,
  currentDate,
  currentDisplaysByDate,
  firstPassProjectionsByDate,
  historicalReservations,
  calibrationReservations = [],
  calibrationHistoricalReservations = [],
  roomByDate,
  totalRooms,
}: {
  targetDates: string[];
  currentDate: string;
  currentDisplaysByDate: Record<string, any>;
  firstPassProjectionsByDate: Record<string, any>;
  historicalReservations: any[];
  calibrationReservations?: any[];
  calibrationHistoricalReservations?: any[];
  roomByDate: Record<string, { occupied: number; available: number; total: number }>;
  totalRooms: number;
}) {
  const projectedDates = (targetDates || []).filter((dateKey) => diffDays(currentDate, dateKey) > 0);
  if (!projectedDates.length) {
    return {
      factor: 1,
      confidence: "none",
      reason: "no_future_dates",
    };
  }

  const currentWeekBooked = projectedDates.reduce((sum, dateKey) =>
    sum + Number(currentDisplaysByDate[dateKey]?.support?.total_dog_volume || 0), 0);
  const rawWeekProjected = projectedDates.reduce((sum, dateKey) =>
    sum + Number(
      firstPassProjectionsByDate[dateKey]?.demand_display?.support?.total_dog_volume
      ?? firstPassProjectionsByDate[dateKey]?.display?.support?.total_dog_volume
      ?? 0,
    ), 0);

  const priorYearWeekFinal = projectedDates.reduce((sum, dateKey) => {
    const priorDate = shiftYearsStr(dateKey, -1);
    return sum + totalDogVolumeForDate({
      targetDate: priorDate,
      reservations: historicalReservations,
      roomByDate,
      totalRooms,
    });
  }, 0);

  const priorYearWeekAsOf = projectedDates.reduce((sum, dateKey) => {
    const leadDays = Math.max(0, diffDays(currentDate, dateKey));
    const priorDate = shiftYearsStr(dateKey, -1);
    return sum + totalDogVolumeForDate({
      targetDate: priorDate,
      reservations: historicalReservations,
      roomByDate,
      totalRooms,
      asOfDate: addDaysStr(priorDate, -leadDays),
    });
  }, 0);

  const currentVsPriorAsOfFactor = priorYearWeekAsOf > 0
    ? currentWeekBooked / priorYearWeekAsOf
    : null;

  const completedWeekSamples = Array.from({ length: PROJECTION_WEEKLY_LOOKBACK_WEEKS }, (_, index) => {
    const endDate = addDaysStr(currentDate, -1 - (index * 7));
    const startDate = addDaysStr(endDate, -(projectedDates.length - 1));
    const dates = enumerateDates(startDate, endDate);
    const currentFinal = totalDogVolumeForDateRange({
      dates,
      reservations: calibrationReservations,
      roomByDate,
      totalRooms,
    });
    const priorDates = dates.map((dateKey) => shiftYearsStr(dateKey, -1));
    const priorFinal = totalDogVolumeForDateRange({
      dates: priorDates,
      reservations: calibrationHistoricalReservations,
      roomByDate,
      totalRooms,
    });
    if (currentFinal <= 0 || priorFinal <= 0) return null;
    return {
      start_date: startDate,
      end_date: endDate,
      current_final: currentFinal,
      prior_year_final: priorFinal,
      yoy_factor: currentFinal / priorFinal,
      weight: (PROJECTION_WEEKLY_LOOKBACK_WEEKS - index) * Math.max(1, currentFinal),
    };
  }).filter(Boolean) as any[];

  const recentCompletedWeekYoyFactor = completedWeekSamples.length
    ? weightedAverage(
      completedWeekSamples.map((sample) => sample.yoy_factor),
      completedWeekSamples.map((sample) => sample.weight),
      1,
    )
    : null;

  const rawBlendedFactor = recentCompletedWeekYoyFactor !== null && currentVsPriorAsOfFactor !== null
    ? (recentCompletedWeekYoyFactor * 0.7) + (currentVsPriorAsOfFactor * 0.3)
    : recentCompletedWeekYoyFactor ?? currentVsPriorAsOfFactor ?? 1;
  const blendedYoyFactor = clampNumber(
    rawBlendedFactor,
    PROJECTION_WEEKLY_YOY_ADJUSTMENT_MIN,
    PROJECTION_WEEKLY_YOY_ADJUSTMENT_MAX,
  );
  const weeklyTarget = Math.max(
    currentWeekBooked,
    priorYearWeekFinal > 0 ? Math.round(priorYearWeekFinal * blendedYoyFactor) : rawWeekProjected,
  );
  const factor = rawWeekProjected > 0
    ? clampNumber(
      weeklyTarget / rawWeekProjected,
      PROJECTION_WEEKLY_ADJUSTMENT_MIN,
      PROJECTION_WEEKLY_ADJUSTMENT_MAX,
    )
    : 1;

  return {
    factor: Number(factor.toFixed(4)),
    raw_factor: rawWeekProjected > 0 ? Number((weeklyTarget / rawWeekProjected).toFixed(4)) : 1,
    method: "visible_range_weekly_yoy_pace",
    period_start: projectedDates[0],
    period_end: projectedDates[projectedDates.length - 1],
    confidence: completedWeekSamples.length >= 3 ? "high" : completedWeekSamples.length ? "medium" : "target_week_only",
    current_week_booked: currentWeekBooked,
    prior_year_week_as_of: priorYearWeekAsOf,
    prior_year_week_final: priorYearWeekFinal,
    current_vs_prior_as_of_factor: currentVsPriorAsOfFactor !== null ? Number(currentVsPriorAsOfFactor.toFixed(4)) : null,
    recent_completed_week_yoy_factor: recentCompletedWeekYoyFactor !== null ? Number(recentCompletedWeekYoyFactor.toFixed(4)) : null,
    raw_blended_yoy_factor: Number(rawBlendedFactor.toFixed(4)),
    blended_yoy_factor: Number(blendedYoyFactor.toFixed(4)),
    raw_week_projected: rawWeekProjected,
    weekly_target: weeklyTarget,
    sample_count: completedWeekSamples.length,
    samples: completedWeekSamples.map(({ weight, ...sample }) => ({
      ...sample,
      yoy_factor: Number(sample.yoy_factor.toFixed(4)),
    })),
  };
}

export async function computeSchedulingMatrixRows({
  supabase,
  locationId,
  dateFrom,
  dateTo,
  projectionScopeDateFrom,
  projectionScopeDateTo,
}: {
  supabase: SupabaseClient;
  locationId: string;
  dateFrom: string;
  dateTo: string;
  projectionScopeDateFrom?: string | null;
  projectionScopeDateTo?: string | null;
}) {
  const targetDates = enumerateDates(dateFrom, dateTo);
  const projectionDates = enumerateDates(projectionScopeDateFrom || dateFrom, projectionScopeDateTo || dateTo);
  const contextDates = [...new Set([...targetDates, ...projectionDates])].sort();
  const contextDateFrom = contextDates[0] || dateFrom;
  const contextDateTo = contextDates[contextDates.length - 1] || dateTo;
  const currentDate = dateStrET();
  const historicalWindow = buildHistoricalWindow(contextDates);
  const exactHistoricalReferenceRanges = buildContiguousDateRanges(historicalWindow?.referenceDates || []);
  const historicalComparisonDates = [...new Set(contextDates.flatMap((dateKey) =>
    Array.from({ length: HISTORICAL_COMPARISON_MAX_YEAR_OFFSET }, (_, index) => shiftYearsStr(dateKey, -(index + 1))),
  ))].sort();
  const historicalComparisonDateFrom = historicalComparisonDates[0] || null;
  const historicalComparisonDateTo = historicalComparisonDates[historicalComparisonDates.length - 1] || null;
  const calibrationDates = buildProjectionCalibrationDates(currentDate);
  const weeklyCalibrationStart = addDaysStr(currentDate, -(PROJECTION_WEEKLY_LOOKBACK_WEEKS * 7));
  const calibrationStart = [calibrationDates[0], weeklyCalibrationStart].filter(Boolean).sort()[0] || null;
  const calibrationEnd = calibrationDates[calibrationDates.length - 1] || null;
  const calibrationHistoricalStart = calibrationStart ? addDaysStr(shiftYearsStr(calibrationStart, -1), -21) : null;
  const calibrationHistoricalEnd = calibrationEnd ? addDaysStr(shiftYearsStr(calibrationEnd, -1), 21) : null;

  const buildReservationRowsQuery = () => supabase
    .from("gingr_reservations")
    .select("gingr_id, animal_gingr_id, animal_name, reservation_type_id, reservation_type_name, start_date, end_date, check_in_date, check_out_date, cancelled_date, created_date, confirmed_date, created_at, raw_data, services")
    .eq("location_id", locationId)
    .is("cancelled_date", null);

  const exactHistoricalReservationQueries = exactHistoricalReferenceRanges.map(({ from, to }) =>
    buildDateRangeOverlapQuery(buildReservationRowsQuery(), from, to),
  );

  const [resTypesRes, roomOccRes, runsRes, widgetSourceRes, historicalWidgetSourceRes, reservationsRes, exactHistoricalReservationRangeResults, calibrationReservationsRes, calibrationHistoricalReservationsRes, scheduleConfigRes, playgroupAssignments] = await Promise.all([
    supabase
      .from("gingr_reservation_types")
      .select("gingr_id, name, is_boarding, is_daycare, single_day")
      .eq("location_id", locationId),
    supabase
      .from("gingr_occupancy_snapshot")
      .select("snapshot_date, number_occupied, number_available, total_runs")
      .eq("location_id", locationId)
      .gte("snapshot_date", contextDateFrom)
      .lte("snapshot_date", contextDateTo),
    supabase
      .from("gingr_runs")
      .select("gingr_run_id, id")
      .eq("location_id", locationId),
    supabase
      .from("gingr_reservation_widget_daily")
      .select("widget_date, check_in_total, check_out_total, overnight_total, total_reservation_volume, per_type, synced_at")
      .eq("location_id", locationId)
      .gte("widget_date", contextDateFrom)
      .lte("widget_date", contextDateTo),
    historicalComparisonDateFrom && historicalComparisonDateTo
      ? supabase
        .from("gingr_reservation_widget_daily")
        .select("widget_date, check_in_total, check_out_total, overnight_total, total_reservation_volume, per_type, synced_at")
        .eq("location_id", locationId)
        .gte("widget_date", historicalComparisonDateFrom)
        .lte("widget_date", historicalComparisonDateTo)
      : Promise.resolve({ data: [], error: null }),
    buildReservationRowsQuery()
      .lt("start_date", `${addDaysStr(contextDateTo, 1)}T00:00:00`)
      .gte("end_date", `${contextDateFrom}T00:00:00`),
    Promise.all(exactHistoricalReservationQueries),
    buildDateRangeOverlapQuery(
      buildReservationRowsQuery(),
      calibrationStart,
      calibrationEnd,
    ),
    buildDateRangeOverlapQuery(
      buildReservationRowsQuery(),
      calibrationHistoricalStart,
      calibrationHistoricalEnd,
    ),
    supabase
      .from("lite_settings")
      .select("setting_value")
      .eq("location_id", locationId)
      .eq("setting_key", "schedule_config")
      .maybeSingle(),
    fetchPlaygroupAssignments({
      supabase,
      locationId,
    }),
  ]);

  if (reservationsRes.error) throw reservationsRes.error;
  for (const result of exactHistoricalReservationRangeResults) {
    if (result.error) throw result.error;
  }
  if (resTypesRes.error) throw resTypesRes.error;
  if (roomOccRes.error) throw roomOccRes.error;
  if (runsRes.error) throw runsRes.error;
  if (widgetSourceRes.error) throw widgetSourceRes.error;
  if (historicalWidgetSourceRes.error) throw historicalWidgetSourceRes.error;
  if (calibrationReservationsRes.error) throw calibrationReservationsRes.error;
  if (calibrationHistoricalReservationsRes.error) throw calibrationHistoricalReservationsRes.error;
  if (scheduleConfigRes.error) throw scheduleConfigRes.error;

  const resTypeMaps = buildReservationTypeMaps(resTypesRes.data || []);
  const widgetSourceByDate = buildGingrWidgetSourceCountsByDate([
    ...(widgetSourceRes.data || []),
    ...(historicalWidgetSourceRes.data || []),
  ], resTypeMaps);

  const playgroupMap = buildPlaygroupAssignmentMap(playgroupAssignments || []);

  const totalRooms = new Set(
    (runsRes.data || [])
      .map((row: any) => String(row.gingr_run_id || row.id || ""))
      .filter(Boolean),
  ).size;
  const capacityConfig = normalizeProjectionCapacityConfig(scheduleConfigRes.data?.setting_value || {}, totalRooms);
  const roomByDate = summarizeRoomOccupancy(roomOccRes.data || []);
  const historicalFetchCache = new Map<string, any[]>();
  const fetchReservationRecordsForDateKeys = async (dateKeys: string[]) => {
    const normalizedDateKeys = [...new Set((dateKeys || []).filter(Boolean))].sort();
    if (!normalizedDateKeys.length) return [];

    const cacheKey = normalizedDateKeys.join("|");
    const cached = historicalFetchCache.get(cacheKey);
    if (cached) return cached;

    const overlapFilter = buildDateOverlapOrFilter(normalizedDateKeys);
    if (!overlapFilter) {
      historicalFetchCache.set(cacheKey, []);
      return [];
    }

    const { data, error } = await supabase
      .from("gingr_reservations")
      .select("gingr_id, animal_gingr_id, animal_name, reservation_type_id, reservation_type_name, start_date, end_date, check_in_date, check_out_date, cancelled_date, created_date, confirmed_date, created_at, raw_data, services")
      .eq("location_id", locationId)
      .is("cancelled_date", null)
      .or(overlapFilter);

    if (error) throw error;

    const records = (data || []).map((row: ReservationRow) =>
      buildReservationRecord(row, resTypeMaps, playgroupMap),
    );
    historicalFetchCache.set(cacheKey, records);
    return records;
  };

  const baseReservations = (reservationsRes.data || []).map((row: ReservationRow) =>
    buildReservationRecord(row, resTypeMaps, playgroupMap),
  );
  const exactHistoricalRowsByKey = new Map<string, ReservationRow>();
  for (const result of exactHistoricalReservationRangeResults) {
    for (const row of result.data || []) {
      const key = String(row.gingr_id || `${row.animal_gingr_id || ""}:${row.reservation_type_id || ""}:${row.start_date || ""}:${row.end_date || ""}`);
      exactHistoricalRowsByKey.set(key, row);
    }
  }
  const exactHistoricalReservations = Array.from(exactHistoricalRowsByKey.values()).map((row: ReservationRow) =>
    buildReservationRecord(row, resTypeMaps, playgroupMap),
  );
  const baseCalibrationReservations = (calibrationReservationsRes.data || []).map((row: ReservationRow) =>
    buildReservationRecord(row, resTypeMaps, playgroupMap),
  );
  const baseCalibrationHistoricalReservations = (calibrationHistoricalReservationsRes.data || []).map((row: ReservationRow) =>
    buildReservationRecord(row, resTypeMaps, playgroupMap),
  );
  const baseHistoricalReservations = [...exactHistoricalReservations];

  for (const targetDate of contextDates) {
    const exactSampleDate = shiftYearsStr(targetDate, -1);
    const exactActiveRows = exactHistoricalReservations.filter((row) => row.startKey <= exactSampleDate && row.endKey >= exactSampleDate);
    const hasExactOperationalRows = exactActiveRows.some((row) => row.cls !== "tour" && row.cls !== "grooming");
    if (hasExactOperationalRows) continue;

    for (const fallbackMode of [
      "same_weekday_prior_year",
      "exact_prior_years_2_to_4",
      "same_weekday_prior_years_2_to_4",
    ] as ProjectionFallbackMode[]) {
      const candidateDates = getProjectionCandidates(targetDate)
        .filter((candidate) => candidate.fallbackMode === fallbackMode)
        .map((candidate) => candidate.sampleDate);
      const fallbackRows = await fetchReservationRecordsForDateKeys(candidateDates);
      const hasFallbackOperationalRows = candidateDates.some((sampleDate) =>
        fallbackRows.some((row) => row.startKey <= sampleDate && row.endKey >= sampleDate && row.cls !== "tour" && row.cls !== "grooming"),
      );

      for (const row of fallbackRows) {
        if (!baseHistoricalReservations.some((existing) => existing.gingr_id === row.gingr_id)) {
          baseHistoricalReservations.push(row);
        }
      }

      if (hasFallbackOperationalRows) break;
    }
  }

  const earliestOperationalStartByAnimal = await fetchEarliestOperationalStartDates({
    supabase,
    locationId,
    animalIds: [
      ...baseReservations.map((row: any) => row.animalId),
      ...baseHistoricalReservations.map((row: any) => row.animalId),
      ...baseCalibrationReservations.map((row: any) => row.animalId),
      ...baseCalibrationHistoricalReservations.map((row: any) => row.animalId),
    ],
    resTypeMaps,
  });
  const reservations = annotateReservationsWithOperationalHistory(baseReservations, earliestOperationalStartByAnimal);
  const historicalReservations = annotateReservationsWithOperationalHistory(baseHistoricalReservations, earliestOperationalStartByAnimal);
  const calibrationReservations = annotateReservationsWithOperationalHistory(baseCalibrationReservations, earliestOperationalStartByAnimal);
  const calibrationHistoricalReservations = annotateReservationsWithOperationalHistory(baseCalibrationHistoricalReservations, earliestOperationalStartByAnimal);

  const preparedByDate = new Map<string, any>();
  for (const targetDate of contextDates) {
    const snapshot = computeDemandSnapshotForDate({
      targetDate,
      reservations,
      roomByDate,
      totalRooms,
    });
    const sourceAdjustment = applyGingrWidgetSourceCountsToDisplay(
      snapshot.display,
      widgetSourceByDate.get(targetDate),
    );
    preparedByDate.set(targetDate, {
      snapshot,
      display: sourceAdjustment.display,
      sourceAdjustment,
    });
  }

  const firstPassProjectionsByDate: Record<string, any> = {};
  const currentDisplaysByDate: Record<string, any> = {};
  for (const targetDate of projectionDates) {
    const prepared = preparedByDate.get(targetDate);
    if (!prepared) continue;
    currentDisplaysByDate[targetDate] = prepared.display;
    firstPassProjectionsByDate[targetDate] = buildProjectionForDate({
      targetDate,
      currentDate,
      currentSnapshot: { ...prepared.snapshot, display: prepared.display },
      historicalReservations,
      calibrationReservations,
      calibrationHistoricalReservations,
      historicalWidgetSourceByDate: widgetSourceByDate,
      roomByDate,
      totalRooms,
      capacityConfig,
    });
  }

  const weeklyPaceCalibration = buildWeeklyPaceCalibration({
    targetDates: projectionDates,
    currentDate,
    currentDisplaysByDate,
    firstPassProjectionsByDate,
    historicalReservations,
    calibrationReservations,
    calibrationHistoricalReservations,
    roomByDate,
    totalRooms,
  });

  const rows = [];
  for (const targetDate of targetDates) {
    const prepared = preparedByDate.get(targetDate);
    const snapshot = prepared.snapshot;
    const sourceAdjustment = prepared.sourceAdjustment;
    const display = prepared.display;
    const projection = buildProjectionForDate({
      targetDate,
      currentDate,
      currentSnapshot: { ...snapshot, display },
      historicalReservations,
      calibrationReservations,
      calibrationHistoricalReservations,
      weeklyPaceCalibration,
      historicalWidgetSourceByDate: widgetSourceByDate,
      roomByDate,
      totalRooms,
      capacityConfig,
    });

    const blockerDetails = [
      ...buildBlockerDetails(snapshot.openingBoarding, targetDate, "opening_boarding"),
      ...buildBlockerDetails(snapshot.closingBoarding, targetDate, "closing_boarding"),
      ...buildBlockerDetails([...snapshot.activeDaycare, ...snapshot.activeDayboarding], targetDate, "daytime"),
    ];

    const trust = buildTrustPayload({
      blockerDetails,
      roomCountsEstimated: snapshot.roomCountsEstimated,
      sourceReconciliation: sourceAdjustment.reconciliation,
      sourceRequired: targetDate >= currentDate,
    });

    rows.push({
      location_id: locationId,
      matrix_date: targetDate,
      boarding_large: display.opening.large_boarding,
      boarding_small: display.opening.small_boarding,
      boarding_unknown_size: display.opening.unclassified_boarding,
      daycare_large: display.daycare.large_daycare,
      daycare_small: display.daycare.small_daycare,
      daycare_unknown_size: display.daycare.unclassified_daycare,
      pp_dayboarders: display.daycare.private_play_dayboarding,
      pp_overnight_boarders: display.opening.private_play_boarding,
      departure_baths: snapshot.departureBaths,
      evaluations: display.daycare.evaluations,
      tours: snapshot.tours.length,
      gross_dogs_in_building: display.support.total_dog_volume,
      feeding_dogs: display.support.evening_feeding_dogs,
      medication_dogs: snapshot.medicationDogs,
      dogs_arriving: display.source?.check_ins ?? snapshot.dogsArriving,
      dogs_departing: display.source?.check_outs ?? snapshot.dogsDeparting,
      dogs_checked_out: 0,
      rooms_occupied: snapshot.roomsOccupied,
      rooms_available: snapshot.roomsAvailable,
      total_rooms: snapshot.resolvedTotalRooms,
      detail_json: {
        trust,
        display,
        projection,
        source_reconciliation: sourceAdjustment.reconciliation,
        solver_inputs: {
          ...snapshot.solverInputs,
          morning_feeding_dogs: display.support.morning_feeding_dogs,
          evening_feeding_dogs: display.support.evening_feeding_dogs,
        },
        provenance: {
          opening_boarding: snapshot.openingBoarding.map((row: any) => buildAssignmentSnapshot(row, targetDate)),
          closing_boarding: snapshot.closingBoarding.map((row: any) => buildAssignmentSnapshot(row, targetDate)),
          daytime_daycare: snapshot.activeDaycare.map((row: any) => buildAssignmentSnapshot(row, targetDate)),
          daytime_dayboarding: snapshot.activeDayboarding.map((row: any) => buildAssignmentSnapshot(row, targetDate)),
          evaluations: snapshot.evaluations.map((row: any) => buildAssignmentSnapshot(row, targetDate)),
        },
      },
      computed_at: new Date().toISOString(),
    });
  }

  return rows;
}

export async function upsertSchedulingMatrixRows(
  supabase: SupabaseClient,
  rows: any[],
) {
  if (!rows.length) return { count: 0 };
  const { error } = await supabase
    .from("scheduling_matrix_daily")
    .upsert(rows, { onConflict: "location_id,matrix_date" });

  if (error) throw error;
  await upsertSchedulingProjectionSnapshots(supabase, rows);
  return { count: rows.length };
}

function buildProjectionSnapshotRows(rows: any[]) {
  return (rows || [])
    .map((row) => {
      const projection = row?.detail_json?.projection;
      if (!projection) return null;
      const targetDate = getDateKey(row.matrix_date);
      const asOfDate = getDateKey(projection.as_of_date || row.computed_at);
      if (!row.location_id || !targetDate || !asOfDate) return null;
      const currentDisplay = row.detail_json?.display || null;
      const projectedDisplay = projection.display || currentDisplay;
      const isActual = projection.state === "actual";
      return {
        location_id: row.location_id,
        target_date: targetDate,
        as_of_date: asOfDate,
        lead_days: Number(projection.lead_days || 0),
        model_version: projection.model_version || PROJECTION_MODEL_VERSION,
        current_display: currentDisplay,
        projected_display: projectedDisplay,
        projection_json: projection,
        capacity_json: projection.capacity || null,
        actual_display: isActual ? currentDisplay : null,
        actualized_at: isActual ? new Date().toISOString() : null,
        computed_at: row.computed_at || new Date().toISOString(),
      };
    })
    .filter(Boolean);
}

export async function upsertSchedulingProjectionSnapshots(
  supabase: SupabaseClient,
  rows: any[],
) {
  const snapshots = buildProjectionSnapshotRows(rows);
  if (!snapshots.length) return { count: 0 };

  const { error } = await supabase
    .from("scheduling_projection_snapshots")
    .upsert(snapshots, { onConflict: "location_id,target_date,as_of_date,model_version" });

  if (error) {
    if (error.code === "42P01") {
      console.warn("scheduling_projection_snapshots table is missing; projection history was not stored.");
      return { count: 0, skipped: true };
    }
    throw error;
  }

  const actualRows = snapshots.filter((snapshot: any) => snapshot.actual_display);
  for (const snapshot of actualRows as any[]) {
    const { error: updateError } = await supabase
      .from("scheduling_projection_snapshots")
      .update({
        actual_display: snapshot.actual_display,
        actualized_at: snapshot.actualized_at,
      })
      .eq("location_id", snapshot.location_id)
      .eq("target_date", snapshot.target_date);

    if (updateError) throw updateError;
  }

  return { count: snapshots.length };
}
