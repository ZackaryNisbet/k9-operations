// K9 Operations — Scheduling projection copy + formatting helpers
// Pure projection explanation/formatting helpers extracted verbatim from SchedulingPage.jsx.

import { getMatrixProjection } from "../../../shared/schedulingEngine";

function formatCompletionRate(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return `${Math.round(numeric * 100)}%`;
}

function humanizeFallbackMode(mode) {
  switch (mode) {
    case "exact_prior_year":
      return "exact prior year";
    case "same_weekday_prior_year":
      return "same weekday prior year";
    case "exact_prior_years_2_to_4":
      return "same date from 2-4 years back";
    case "same_weekday_prior_years_2_to_4":
      return "same weekday from 2-4 years back";
    case "weighted_comparable_blend":
      return "weighted same-season and same-weekday comparables";
    case "carry_forward_no_history":
      return "carry current bookings";
    case "derived_from_projected_components":
      return "derived from projected components";
    default:
      return null;
  }
}

function formatProjectionFactor(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return `${numeric.toFixed(2)}x`;
}

function formatSignedPctFromFactor(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric === 1) return null;
  const pct = Math.round((numeric - 1) * 100);
  return `${pct > 0 ? "+" : ""}${pct}%`;
}

function getProjectionContext(day) {
  const projection = day?.projection || getMatrixProjection(day?.matrix || day);
  const explanation = projection?.explanations?.support_total_dog_volume;
  const weeklyPace = explanation?.weekly_pace || projection?.calibration?.weekly_pace;
  return { projection, explanation, weeklyPace };
}

function getLeadDays(explanation, projection) {
  const value = Number(explanation?.lead_days ?? projection?.lead_days);
  return Number.isFinite(value) ? value : null;
}

function formatRounded(value, fallback = "0") {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return String(Math.round(numeric));
}

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function getProjectionHeadline(day) {
  const { projection, explanation } = getProjectionContext(day);
  const leadDays = getLeadDays(explanation, projection);
  if (!explanation || leadDays === null || leadDays <= 0) return null;

  const exactFinal = toFiniteNumber(explanation.exact_prior_year_final);
  const exactAsOf = toFiniteNumber(explanation.exact_prior_year_as_of);
  if (exactFinal !== null && exactFinal > 0 && exactAsOf !== null) {
    const completion = formatCompletionRate(exactAsOf / exactFinal);
    return `${leadDays} days out. On this same date last year, ${formatRounded(exactAsOf)} of ${formatRounded(exactFinal)} final dogs were already booked by this point${completion ? ` (${completion})` : ""}.`;
  }

  return `${leadDays} days out. The projection is based on comparable historical booking pace from Gingr created dates.`;
}

export function getProjectionFormulaLine(day) {
  const { projection, explanation, weeklyPace } = getProjectionContext(day);
  const leadDays = getLeadDays(explanation, projection);
  if (!explanation || leadDays === null || leadDays <= 0) return null;

  const current = toFiniteNumber(explanation.current_value);
  const completionRate = toFiniteNumber(explanation.completion_rate);
  const rawProjected = toFiniteNumber(explanation.raw_projected_value);
  const pickupFactor = toFiniteNumber(explanation.yoy_adjustment_factor) ?? 1;
  const weekFactor = toFiniteNumber(explanation.weekly_pace_adjustment_factor ?? weeklyPace?.factor) ?? 1;
  const unconstrainedProjected = toFiniteNumber(explanation.unconstrained_projected_value ?? explanation.projected_value);
  const shownProjected = toFiniteNumber(explanation.projected_value);

  if (current !== null && completionRate !== null && completionRate > 0 && rawProjected !== null) {
    const demandPart = unconstrainedProjected !== null
      ? ` = ${formatRounded(unconstrainedProjected)} demand`
      : "";
    const shownPart = shownProjected !== null && unconstrainedProjected !== null && shownProjected !== unconstrainedProjected
      ? `; capacity cap changes the shown value to ${formatRounded(shownProjected)}`
      : shownProjected !== null
        ? `; shown projection is ${formatRounded(shownProjected)}`
        : "";
    return `${formatRounded(current)} currently booked / ${formatCompletionRate(completionRate)} historical completion = ${formatRounded(rawProjected)} raw demand; ${formatRounded(rawProjected)} x ${formatProjectionFactor(pickupFactor)} recent pickup x ${formatProjectionFactor(weekFactor)} full-week check${demandPart}${shownPart}.`;
  }

  const baselineFinal = toFiniteNumber(explanation.baseline_final_average);
  if (baselineFinal !== null && rawProjected !== null) {
    return `No reliable current booking count was available for this row, so the model starts from the historical final average of ${formatRounded(baselineFinal)} dogs, then applies recent pickup, full-week, and capacity checks.`;
  }

  return null;
}

export function getProjectionSummaryLines(day) {
  const { projection, explanation, weeklyPace } = getProjectionContext(day);
  const leadDays = getLeadDays(explanation, projection);
  if (!explanation || leadDays === null || leadDays <= 0) return [];

  const lines = [];
  if (explanation.exact_prior_year_final !== null && explanation.exact_prior_year_final !== undefined) {
    const completion = explanation.exact_prior_year_final > 0
      ? formatCompletionRate((explanation.exact_prior_year_as_of || 0) / explanation.exact_prior_year_final)
      : null;
    lines.push(`${leadDays} days out: last year ${explanation.exact_prior_year_as_of || 0}/${explanation.exact_prior_year_final} dogs were already booked${completion ? ` (${completion})` : ""}.`);
  }
  if (explanation.fallback_mode && explanation.fallback_mode !== "exact_prior_year" && explanation.fallback_mode !== "carry_forward_no_history") {
    lines.push(`Also blends ${explanation.sample_count || 0} same-season / same-weekday sample${explanation.sample_count === 1 ? "" : "s"}.`);
  }
  if (explanation.yoy_adjustment_factor && Number(explanation.yoy_adjustment_factor) !== 1) {
    const adjustment = formatSignedPctFromFactor(explanation.yoy_adjustment_factor);
    const sampleCount = explanation.yoy_adjustment?.sample_count || 0;
    lines.push(`Recent completed days adjust the forecast ${formatProjectionFactor(explanation.yoy_adjustment_factor)}${adjustment ? ` (${adjustment})` : ""} using ${sampleCount} completed day${sampleCount === 1 ? "" : "s"}.`);
  }
  if (weeklyPace?.factor && Number(weeklyPace.factor) !== 1) {
    const recent = weeklyPace.recent_completed_week_yoy_factor
      ? ` Recent completed weeks are ${formatProjectionFactor(weeklyPace.recent_completed_week_yoy_factor)} vs last year.`
      : "";
    lines.push(`Full-week check scales ${formatRounded(weeklyPace.raw_week_projected)} raw dog-days to ${formatRounded(weeklyPace.weekly_target)}.${recent}`);
  }
  if (projection.capacity?.has_capacity_constrained_projection) {
    lines.push("Capacity cap applied: matrix shows achievable forecast; tooltip keeps unconstrained demand.");
  }
  if (!lines.length) {
    lines.push(`${leadDays} days out. Projected demand uses historical Gingr booking pace for this same date.`);
  }
  return lines;
}

function getConfiguredCapacitySummary(capacity) {
  const constraints = (capacity?.constraints || []).filter((constraint) => {
    const value = Number(constraint.capacity);
    return Number.isFinite(value) && value > 0;
  });
  if (!constraints.length) return "No explicit play-yard caps are configured; boarding still uses the practical room-based cap when rooms are available.";
  return constraints
    .map((constraint) => `${constraint.label}: demand ${formatRounded(constraint.demand)}, cap ${formatRounded(constraint.capacity)} (${constraint.status === "over_capacity" ? "binding" : "within cap"})`)
    .join("; ");
}

export function getProjectionMethodologySteps(day) {
  const { projection, explanation, weeklyPace } = getProjectionContext(day);
  const leadDays = getLeadDays(explanation, projection);
  if (!explanation || leadDays === null || leadDays <= 0) return [];

  const steps = [];
  const exactFinal = Number(explanation.exact_prior_year_final || 0);
  const exactAsOf = Number(explanation.exact_prior_year_as_of || 0);
  const exactCompletion = exactFinal > 0 ? formatCompletionRate(exactAsOf / exactFinal) : null;
  const baselineFinal = toFiniteNumber(explanation.baseline_final_average);
  const baselineAsOf = toFiniteNumber(explanation.baseline_as_of_average);
  const completionRate = toFiniteNumber(explanation.completion_rate);
  const weightedCompletion = baselineFinal !== null && baselineAsOf !== null && baselineFinal > 0
    ? `${formatRounded(baselineAsOf)} / ${formatRounded(baselineFinal)} = ${formatCompletionRate(baselineAsOf / baselineFinal)}`
    : completionRate !== null
      ? formatCompletionRate(completionRate)
      : null;
  if (exactFinal > 0) {
    steps.push({
      label: "1. Same-date anchor",
      detail: `From Gingr reservations.created_date, the app checks what was already booked at the same lead time. ${leadDays} days before last year's matching date, ${exactAsOf} of ${exactFinal} final dogs were booked${exactCompletion ? ` (${exactCompletion})` : ""}. This anchor stays visible because it is the simplest way to audit the projection.`,
    });
  }

  const comparableMode = humanizeFallbackMode(explanation.fallback_mode);
  if (comparableMode && explanation.fallback_mode !== "carry_forward_no_history") {
    steps.push({
      label: "2. Weekday and season completion rate",
      detail: `Because the same calendar date can land on a different weekday, the model also blends ${explanation.sample_count || 0} comparable date sample${explanation.sample_count === 1 ? "" : "s"} using ${comparableMode}. Same-weekday samples get extra weight, so a Wednesday is not treated like a Friday/Saturday/Sunday boarding pattern. The completion rate used by the formula is ${weightedCompletion || "the weighted as-of dogs divided by weighted final dogs"}.`,
    });
  }

  if (explanation.yoy_adjustment_factor && Number(explanation.yoy_adjustment_factor) !== 1) {
    const factor = Number(explanation.yoy_adjustment_factor);
    const adjustment = formatSignedPctFromFactor(factor);
    const lookbackDays = explanation.yoy_adjustment?.lookback_days || 28;
    const sampleCount = explanation.yoy_adjustment?.sample_count || 0;
    const direction = factor > 1
      ? "recent completed days were less complete at this lead point than last year's comparable days, so more pickup still arrived later"
      : "recent completed days were more complete at this lead point than last year's comparable days, so less pickup arrived later";
    const action = factor > 1 ? "raises" : "lowers";
    steps.push({
      label: "3. Recent pickup check",
      detail: `The app looks at the last ${lookbackDays} completed days with usable history. For each completed day, it calculates this year's completion at the same lead time, then calculates last year's comparable completion the same way. The factor is prior-year completion divided by current-year completion, weighted by recency and dog volume, then clamped to avoid outliers. Here it is ${formatProjectionFactor(factor)}${adjustment ? ` (${adjustment})` : ""} from ${sampleCount} completed day${sampleCount === 1 ? "" : "s"}, meaning ${direction}; this ${action} the daily forecast before the week check.`,
    });
  }

  if (weeklyPace?.factor && Number(weeklyPace.factor) !== 1) {
    const recentWeeks = weeklyPace.recent_completed_week_yoy_factor
      ? `${formatProjectionFactor(weeklyPace.recent_completed_week_yoy_factor)} vs last year`
      : "not enough recent completed-week samples";
    const asOfFactor = weeklyPace.current_vs_prior_as_of_factor
      ? `${formatProjectionFactor(weeklyPace.current_vs_prior_as_of_factor)} (${formatRounded(weeklyPace.current_week_booked)} currently booked / ${formatRounded(weeklyPace.prior_year_week_as_of)} booked by the same point last year)`
      : "not available";
    const blendedFactor = weeklyPace.blended_yoy_factor
      ? `${formatProjectionFactor(weeklyPace.blended_yoy_factor)}`
      : "the available weekly pace factor";
    steps.push({
      label: "4. Full-week reasonableness check",
      detail: `Before showing the final projection, the app sums the whole visible week. The daily model produced ${formatRounded(weeklyPace.raw_week_projected)} raw dog-days. The week check compares four inputs: ${formatRounded(weeklyPace.current_week_booked)} currently booked, ${formatRounded(weeklyPace.prior_year_week_as_of)} booked by the same point last year, ${formatRounded(weeklyPace.prior_year_week_final)} final dog-days last year, and recent completed weeks running ${recentWeeks}. Current as-of pace is ${asOfFactor}. The target uses a blended weekly YOY factor of ${blendedFactor}, then sets the visible-week target to ${formatRounded(weeklyPace.weekly_target)} dog-days and scales the daily rows to that target without dropping below currently booked.`,
    });
  }

  const capacity = projection?.capacity;
  if (capacity) {
    steps.push({
      label: "5. Capacity check",
      detail: `After demand is calibrated, the app checks known capacity limits from the scheduling capacity config. ${getConfiguredCapacitySummary(capacity)} If a cap binds, projected mode shows the achievable/bookable value while the tooltip keeps the unconstrained demand forecast.`,
    });
  }

  return steps;
}

export function getProjectionTooltip({ explanation, currentValue, projectedValue }) {
  if (!explanation) {
    return `${currentValue} currently booked. Projected to ${projectedValue}.`;
  }

  const lines = [
    `${currentValue} currently booked -> ${projectedValue} projected`,
    `${explanation.lead_days || 0} days out`,
  ];

  if (explanation.exact_prior_year_final !== null && explanation.exact_prior_year_final !== undefined) {
    lines.push(`Exact prior year: ${explanation.exact_prior_year_as_of || 0} booked by now, ${explanation.exact_prior_year_final} final`);
  }
  if (explanation.completion_rate !== null && explanation.completion_rate !== undefined) {
    const rate = formatCompletionRate(explanation.completion_rate);
    if (rate) {
      const basis = explanation.completion_basis === "support_total_dog_volume" ? "total dog volume" : null;
      lines.push(`Completion rate used: ${rate}${basis ? ` (${basis})` : ""}`);
    }
  }
  const fallback = humanizeFallbackMode(explanation.fallback_mode);
  if (fallback && explanation.fallback_mode !== "exact_prior_year") {
    lines.push(`Fallback mode: ${fallback}`);
  }
  if (explanation.sample_count) {
    lines.push(`Sample count: ${explanation.sample_count}`);
  }
  if (explanation.yoy_adjustment_factor && Number(explanation.yoy_adjustment_factor) !== 1) {
    lines.push(`YOY pickup calibration: ${formatProjectionFactor(explanation.yoy_adjustment_factor)} based on ${explanation.yoy_adjustment?.sample_count || 0} completed days`);
  }
  if (explanation.weekly_pace_adjustment_factor && Number(explanation.weekly_pace_adjustment_factor) !== 1) {
    const weekly = explanation.weekly_pace;
    lines.push(`Weekly pace calibration: ${formatProjectionFactor(explanation.weekly_pace_adjustment_factor)}`);
    if (weekly?.raw_week_projected && weekly?.weekly_target) {
      lines.push(`Visible range raw projection: ${Math.round(weekly.raw_week_projected)} -> ${Math.round(weekly.weekly_target)}`);
    }
    if (weekly?.prior_year_week_final) {
      lines.push(`Prior-year week final: ${Math.round(weekly.prior_year_week_final)}; current booked: ${Math.round(weekly.current_week_booked || 0)}`);
    }
  }
  const unconstrainedProjected = explanation.unconstrained_projected_value ?? explanation.projected_value;
  if (explanation.raw_projected_value !== null && explanation.raw_projected_value !== undefined && explanation.raw_projected_value !== unconstrainedProjected) {
    lines.push(`Raw projection before calibration: ${explanation.raw_projected_value}`);
  }
  if (explanation.capacity_constraint?.constrained) {
    const demand = explanation.capacity_constraint.demand_value;
    const achievable = explanation.capacity_constraint.achievable_value;
    lines.push(`Unconstrained demand forecast: ${demand}`);
    lines.push(`Capacity-constrained achievable forecast: ${achievable}`);
    const constraintLabels = (explanation.capacity_constraint.constrained_by || [])
      .map((constraint) => {
        const capacity = Number(constraint.capacity);
        const overflow = Number(constraint.overflow || 0);
        return `${constraint.label}${Number.isFinite(capacity) ? ` ${capacity}` : ""}${overflow > 0 ? ` (${Math.round(overflow)} over)` : ""}`;
      })
      .filter(Boolean);
    if (constraintLabels.length) {
      lines.push(`Capacity bound: ${constraintLabels.join("; ")}`);
    }
  }

  return lines.join("\n");
}
