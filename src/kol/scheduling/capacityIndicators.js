import { getDayCurrentDisplay, getDayProjectedDisplay } from "../pages/schedulingDemandMatrixModel";

const DEFAULT_NEAR_THRESHOLD = 0.85;

function toNumber(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function firstFinite(...values) {
  for (const value of values) {
    const numeric = toNumber(value);
    if (numeric !== null) return numeric;
  }
  return null;
}

function getNestedValue(obj, path) {
  return String(path || "").split(".").reduce((acc, part) => acc?.[part], obj);
}

export function getSchedulingCapacityDefinitions(config = {}) {
  const iconCapacities = config.icon_capacity_constraints && typeof config.icon_capacity_constraints === "object"
    ? Object.entries(config.icon_capacity_constraints)
        .map(([key, entry]) => {
          const cap = typeof entry === "object" ? entry.cap ?? entry.capacity : entry;
          const metricKey = typeof entry === "object" ? entry.metric_key || entry.metricKey : null;
          const label = typeof entry === "object" ? entry.label || entry.title || key : key;
          return {
            key: `icon:${key}`,
            label,
            source: "icon",
            metricKey,
            cap: toNumber(cap),
          };
        })
        .filter((entry) => entry.cap !== null && entry.cap > 0 && entry.metricKey)
    : [];

  return [
    {
      key: "large_play",
      label: "Large Play",
      metricKey: "play_yard.large_play_dogs",
      cap: firstFinite(config.large_daycare_capacity, config.large_play_capacity),
      source: "schedule_config",
    },
    {
      key: "small_play",
      label: "Small Play",
      metricKey: "play_yard.small_play_dogs",
      cap: firstFinite(config.small_daycare_capacity, config.small_play_capacity),
      source: "schedule_config",
    },
    {
      key: "private_play",
      label: "Private Play",
      metricKey: "play_yard.private_play_dogs",
      cap: firstFinite(config.private_play_capacity, config.private_play_dog_capacity),
      source: "schedule_config",
    },
    {
      key: "split_play",
      label: "Half & Half",
      metricKey: "play_yard.split_play_dogs",
      cap: firstFinite(config.split_play_capacity, config.half_and_half_capacity),
      source: "schedule_config",
    },
    {
      key: "group_play",
      label: "Group Play",
      metricKey: "play_yard.group_play_dogs",
      cap: firstFinite(config.group_play_capacity),
      source: "schedule_config",
      derive: (display) => (
        toNumber(display?.play_yard?.large_play_dogs, 0)
        + toNumber(display?.play_yard?.small_play_dogs, 0)
      ),
    },
    ...iconCapacities,
  ].filter((entry) => entry.cap !== null && entry.cap > 0);
}

export function getCapacityStatus(value, cap, nearThreshold = DEFAULT_NEAR_THRESHOLD) {
  const count = toNumber(value, 0);
  const capacity = toNumber(cap);
  if (capacity === null || capacity <= 0) return "unset";
  if (count >= capacity) return "over";
  if (count >= capacity * nearThreshold) return "near";
  return "ok";
}

export function buildDayCapacityIndicators(day, config = {}, mode = "current") {
  const display = mode === "projected" ? getDayProjectedDisplay(day) : getDayCurrentDisplay(day);
  const threshold = firstFinite(config.capacity_warning_threshold, config.capacity_near_threshold) || DEFAULT_NEAR_THRESHOLD;
  return getSchedulingCapacityDefinitions(config).map((definition) => {
    const value = definition.derive
      ? definition.derive(display)
      : getNestedValue(display, definition.metricKey);
    const count = toNumber(value, 0);
    const status = getCapacityStatus(count, definition.cap, threshold);
    return {
      ...definition,
      count,
      cap: Number(definition.cap),
      status,
      percent: definition.cap > 0 ? count / definition.cap : null,
      text: `${Math.round(count)} / ${Math.round(definition.cap)}`,
    };
  });
}

export function getHighestCapacityStatus(indicators = []) {
  if (indicators.some((indicator) => indicator.status === "over")) return "over";
  if (indicators.some((indicator) => indicator.status === "near")) return "near";
  if (indicators.some((indicator) => indicator.status === "ok")) return "ok";
  return "unset";
}

export function getVisibleCapacityIndicators(indicators = [], limit = 3) {
  const priority = { over: 0, near: 1, ok: 2, unset: 3 };
  return [...indicators]
    .sort((a, b) => (priority[a.status] ?? 9) - (priority[b.status] ?? 9) || (b.percent || 0) - (a.percent || 0))
    .slice(0, limit);
}
