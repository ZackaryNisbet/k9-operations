// Default intro / header lines shown under the search bar on each Labor module
// tab. Location admins can override these per-location; overrides are stored in
// lite_settings under LABOR_INTRO_SETTING_KEY as { [tabKey]: text }. An empty or
// missing override falls back to the default below.

export const LABOR_INTRO_SETTING_KEY = "labor_module_intros";

export const LABOR_INTRO_DEFAULTS = {
  home: "Your team roster. Filter by status or search; use the gear (top right) to manage positions, Filter for advanced filters & saved views, or open a row for the full employee record.",
  attendance: "Tap a mark type to filter, search by employee or note, use Filter for advanced conditions, or open Attendance Summary above for trends.",
  "performance-reviews": "Every active employee and their review cadence. Search by name or position, use Filter for advanced views & saved filters, or open a row for the full record. Each column maps to a required review or packet.",
  training: "Team Readiness Board — every trainee's demonstrated & verified tasks. Search tasks or categories, switch the view above, or open a trainee for the full record.",
  interviews: "Search to filter, or open a row to review the transcript, scorecard, and recommendation.",
  "hour-analysis": "Staffing capacity by person — expected hours, coverage splits, and what-if scenarios. Search by name or position, or switch to the Labor Model above.",
};

export function resolveLaborIntro(intros, tabKey) {
  const override = intros && typeof intros[tabKey] === "string" ? intros[tabKey].trim() : "";
  return override || LABOR_INTRO_DEFAULTS[tabKey] || "";
}
