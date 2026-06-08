// K9 Operations — Scheduling projection history helpers
// Pure helpers extracted verbatim from SchedulingPage.jsx.

import { getDayCurrentDisplay, getDayProjection } from "../schedulingDemandMatrixModel";

function getProjectionMetricValue(display, fallback = null) {
  const value = Number(display?.support?.total_dog_volume);
  return Number.isFinite(value) ? value : fallback;
}

export function getProjectionHistoryPoints(day) {
  const projection = getDayProjection(day);
  const synthetic = projection ? [{
    target_date: day?.date,
    as_of_date: projection.as_of_date,
    lead_days: projection.lead_days,
    current_display: getDayCurrentDisplay(day),
    projected_display: projection.display,
    actual_display: projection.state === "actual" ? getDayCurrentDisplay(day) : null,
    projection_json: projection,
  }] : [];

  const history = Array.isArray(day?.projectionHistory) && day.projectionHistory.length
    ? day.projectionHistory
    : synthetic;

  return history
    .map((snapshot) => {
      const projected = getProjectionMetricValue(snapshot.projected_display, null);
      const demand = getProjectionMetricValue(
        snapshot.projection_json?.demand_display
        || snapshot.projection_json?.unconstrained_display
        || snapshot.projected_display,
        projected,
      );
      const booked = getProjectionMetricValue(snapshot.current_display, null);
      const actual = getProjectionMetricValue(snapshot.actual_display, null);
      const leadDays = Number(snapshot.lead_days ?? snapshot.projection_json?.lead_days);
      if (!Number.isFinite(leadDays) || projected === null) return null;
      const capacityConstrained = Boolean(snapshot.projection_json?.capacity?.has_capacity_constrained_projection)
        || (Number.isFinite(demand) && Number.isFinite(projected) && demand > projected);
      return {
        asOfDate: snapshot.as_of_date || snapshot.projection_json?.as_of_date,
        leadDays,
        projected,
        demand,
        booked,
        actual,
        delta: Number.isFinite(actual) ? actual - projected : null,
        capacityConstrained,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.leadDays - a.leadDays);
}

export function getCapacityRiskLines(day) {
  const projection = getDayProjection(day);
  const constraints = projection?.capacity?.constraints || [];
  return constraints
    .filter((constraint) => constraint?.status === "over_capacity")
    .map((constraint) => {
      const demand = Math.round(Number(constraint.demand || 0));
      const capacity = Number(constraint.capacity);
      const overflow = Math.round(Number(constraint.overflow || 0));
      return `${constraint.label}: ${demand} projected vs ${Number.isFinite(capacity) ? capacity : "—"} capacity${overflow > 0 ? ` (${overflow} over)` : ""}`;
    });
}
