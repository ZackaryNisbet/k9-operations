// K9 Operations — Scheduling Engine
// Core types, constants, and solver functions for the scheduling feature.
// Implements the opening strategy decision tree and required headcount computation.

// ─── Schedule Config Defaults ─────────────────────────────────────────────
export const SCHEDULE_CONFIG_DEFAULTS = {
  weekday_am_open_window: ["06:00", "07:00"],
  weekend_am_open_window: ["07:00", "09:00"],
  weekday_site_hours: ["06:00", "19:30"],
  weekend_site_hours: ["07:00", "18:00"],
  public_hours_weekday: ["07:00", "19:00"],
  public_hours_weekend: ["09:00", "18:00"],
  daycare_ratio_large: 25,
  daycare_ratio_small: 25,
  small_daycare_practical_ratio: 35,
  group_transport_minutes_each_way: 2,
  morning_room_clean_minutes: 2.5,
  private_play_move_minutes_each_way: 1.5,
  private_play_box_dwell_minutes: 4,
  private_play_rounds_per_day: 3,
  private_play_round_minutes: 10,
  bath_active_minutes: 15,
  bath_passive_dry_minutes: 30,
  dryer_capacity: 2,
  feeding_minutes_per_dog: 1.5,
  medication_minutes_per_dog: 2,
  break_minutes: 30,
  max_breaks_small_team: 1,
  max_breaks_large_team: 2,
  large_team_threshold: 6,
  supervisor_buffer_minutes: 120,
  allow_csr_backfill_default: true,
  allow_mod_backfill_default: false,
  room_mess_rate_default: 0.2,
  pod_pass_dogs_per_trip: 1.5,
  pod_pass_boxes: 4,
  holiday_overrides: {},
};

// ─── Task Color Palette (matches workbook semantics) ──────────────────────
export const TASK_COLORS = {
  lgdc: { bg: "#DCFCE7", text: "#166534", label: "Large Daycare" },
  smdc: { bg: "#DBEAFE", text: "#1E40AF", label: "Small Daycare" },
  pp: { bg: "#FEE2E2", text: "#991B1B", label: "Private Play" },
  break: { bg: "#FEF9C3", text: "#854D0E", label: "Break" },
  bath: { bg: "#FCE7F3", text: "#9D174D", label: "Bath" },
  transport: { bg: "#FFEDD5", text: "#9A3412", label: "Transport" },
  feed: { bg: "#FFEDD5", text: "#9A3412", label: "Feed / Meds" },
  opening: { bg: "#EDE9FE", text: "#5B21B6", label: "Opening Let-Outs" },
  room_clean: { bg: "#F1F5F9", text: "#475569", label: "Room Clean" },
  float: { bg: "#F8FAFC", text: "#64748B", label: "Float / Avail" },
  sup: { bg: "#FEF3C7", text: "#92400E", label: "Supervisor Tasks" },
  disinfect: { bg: "#F1F5F9", text: "#475569", label: "Disinfect" },
  housekeeping: { bg: "#F8FAFC", text: "#64748B", label: "Housekeeping" },
  admin: { bg: "#ECFCCB", text: "#3F6212", label: "Paperwork / Admin" },
  feeding_report: { bg: "#E0F2FE", text: "#075985", label: "Feeding Report" },
  foam: { bg: "#F1F5F9", text: "#475569", label: "Foam" },
  dailies: { bg: "#F8FAFC", text: "#64748B", label: "Dailies" },
  eod: { bg: "#F1F5F9", text: "#475569", label: "EOD / Close" },
  lobby: { bg: "#E0F2FE", text: "#075985", label: "Lobby" },
  manager_coverage: { bg: "#ECFCCB", text: "#3F6212", label: "Manager Coverage" },
  off: { bg: "#FFFFFF", text: "#CBD5E1", label: "Off Shift" },
};

export const SHIFT_POSITION_OPTIONS = [
  { value: "pct", label: "Pet Care Technician" },
  { value: "csr", label: "Customer Service Representative" },
  { value: "supervisor", label: "Supervisor" },
  { value: "mod", label: "Manager on Duty" },
];

// ─── Time Utilities ───────────────────────────────────────────────────────

export function build15MinSlots(startTime, endTime) {
  const slots = [];
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  let min = sh * 60 + sm;
  const end = eh * 60 + em;
  while (min < end) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    min += 15;
  }
  return slots;
}

export function addMinutesToTime(timeStr, minutes) {
  const [h, m] = timeStr.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const nh = Math.floor(total / 60);
  const nm = total % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}

export function minutesToTime(totalMinutes) {
  const normalized = Math.max(0, Number(totalMinutes) || 0);
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

export function isWeekend(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  return d.getDay() === 0 || d.getDay() === 6;
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function toNullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function todayLocalDateKey() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

function requiresGingrSourceCounts(matrix) {
  return Boolean(matrix?.matrix_date && String(matrix.matrix_date) >= todayLocalDateKey());
}

function hasGingrSourceCounts(matrix) {
  const source = matrix?.detail_json?.display?.source;
  return toNullableNumber(source?.total) !== null
    && toNullableNumber(source?.check_ins) !== null
    && toNullableNumber(source?.check_outs) !== null
    && toNullableNumber(source?.overnight) !== null;
}

function sumDemandValues(values) {
  return values.reduce((sum, value) => sum + toNumber(value, 0), 0);
}

function normalizeShiftPosition(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["pct", "pet care technician", "petcaretechnician", "pet_care_technician"].includes(normalized)) return "pct";
  if (["csr", "customer service representative", "customer_service_representative"].includes(normalized)) return "csr";
  if (["sup", "supervisor"].includes(normalized)) return "supervisor";
  if (["mod", "manager on duty", "manager", "assistant manager", "general manager"].includes(normalized)) return "mod";
  return "pct";
}

function normalizeShiftTime(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return "";
  return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
}

function getShiftPositionLabel(position) {
  return SHIFT_POSITION_OPTIONS.find((option) => option.value === position)?.label || "Pet Care Technician";
}

function compareShiftEntries(a, b) {
  const startDiff = timeToMinutes(a.shift_start || "00:00") - timeToMinutes(b.shift_start || "00:00");
  if (startDiff !== 0) return startDiff;
  const positionOrder = { supervisor: 0, mod: 1, pct: 2, csr: 3 };
  return (positionOrder[a.position] ?? 9) - (positionOrder[b.position] ?? 9);
}

export function getShiftEntries(staffPlan) {
  const rawEntries = Array.isArray(staffPlan?.shift_entries)
    ? staffPlan.shift_entries
    : Array.isArray(staffPlan?.staff_names)
      ? staffPlan.staff_names
      : [];

  return rawEntries
    .map((entry, index) => {
      if (!entry || typeof entry !== "object") return null;
      const position = normalizeShiftPosition(entry.position);
      const shiftStart = normalizeShiftTime(entry.shift_start);
      const shiftEnd = normalizeShiftTime(entry.shift_end);
      const name = String(entry.name || "").trim();
      if (!shiftStart || !shiftEnd) return null;
      return {
        id: entry.id || `${position}-${name || index + 1}-${shiftStart}-${shiftEnd}`,
        position,
        name,
        shift_start: shiftStart,
        shift_end: shiftEnd,
      };
    })
    .filter(Boolean)
    .sort(compareShiftEntries);
}

function isShiftEntryActive(entry, timeStr) {
  const slotMinutes = timeToMinutes(timeStr);
  const start = timeToMinutes(entry.shift_start || "00:00");
  const end = timeToMinutes(entry.shift_end || "00:00");
  return slotMinutes >= start && slotMinutes < end;
}

function countFunctioningFromEntries(entries, staffPlan, timeStr) {
  const allowCsr = !!staffPlan?.allow_csr_as_pct;
  const allowMod = !!staffPlan?.allow_mod_as_pct;

  return entries.reduce((sum, entry) => {
    if (!isShiftEntryActive(entry, timeStr)) return sum;
    if (entry.position === "pct") return sum + 1;
    if (entry.position === "csr") return sum + (allowCsr ? 1 : 0);
    if (entry.position === "mod") return sum + (allowMod ? 1 : 0);
    return sum;
  }, 0);
}

function getDaypartAnchorTimes(matrixDate, config) {
  const weekend = isWeekend(matrixDate);
  const openWindow = weekend ? config.weekend_am_open_window : config.weekday_am_open_window;
  const publicHours = weekend ? config.public_hours_weekend : config.public_hours_weekday;
  const siteHours = weekend ? config.weekend_site_hours : config.weekday_site_hours;

  return {
    am: addMinutesToTime(openWindow[0], 15),
    midday: minutesToTime(Math.round((timeToMinutes(publicHours[0]) + timeToMinutes(publicHours[1])) / 2)),
    pm: addMinutesToTime(siteHours[1], -45),
  };
}

export function computeDaypartAvailability(matrixDate, staffPlan, config) {
  if (!staffPlan) return { am: 0, midday: 0, pm: 0 };
  const entries = getShiftEntries(staffPlan);
  if (!entries.length) {
    const total = computeAvailableFunctioningPct(staffPlan);
    return { am: total, midday: total, pm: total };
  }
  const anchors = getDaypartAnchorTimes(matrixDate, config);
  return {
    am: countFunctioningFromEntries(entries, staffPlan, anchors.am),
    midday: countFunctioningFromEntries(entries, staffPlan, anchors.midday),
    pm: countFunctioningFromEntries(entries, staffPlan, anchors.pm),
  };
}

export function deriveStaffPlanFromShiftEntries({
  locationId = "",
  planDate,
  shiftEntries,
  notes = "",
}) {
  const entries = (shiftEntries || []).map((entry) => ({
    ...entry,
    position: normalizeShiftPosition(entry.position),
    shift_start: normalizeShiftTime(entry.shift_start),
    shift_end: normalizeShiftTime(entry.shift_end),
    name: String(entry.name || "").trim(),
  })).filter((entry) => entry.shift_start && entry.shift_end);

  const counts = entries.reduce((acc, entry) => {
    if (entry.position === "pct") acc.pct_count += 1;
    else if (entry.position === "csr") acc.csr_count += 1;
    else if (entry.position === "supervisor") acc.supervisor_count += 1;
    else if (entry.position === "mod") acc.mod_count += 1;
    return acc;
  }, {
    pct_count: 0,
    csr_count: 0,
    supervisor_count: 0,
    mod_count: 0,
  });

  return {
    location_id: locationId,
    plan_date: planDate,
    shift: "full",
    ...counts,
    supervisor_present: counts.supervisor_count > 0,
    allow_csr_as_pct: false,
    allow_mod_as_pct: false,
    staff_names: entries,
    notes,
  };
}

export function buildOptimalStaffPlan(matrix, required, config) {
  const weekend = isWeekend(matrix?.matrix_date);
  const siteHours = weekend ? config.weekend_site_hours : config.weekday_site_hours;
  const maxRequired = Math.max(required?.am || 0, required?.midday || 0, required?.pm || 0, 1);
  const pctCount = Math.max(maxRequired, 1);

  const shiftEntries = [
    {
      position: "supervisor",
      name: "Optimal Supervisor",
      shift_start: siteHours[0],
      shift_end: siteHours[1],
    },
    ...Array.from({ length: pctCount }, (_, index) => ({
      position: "pct",
      name: `Optimal Pet Care Technician ${index + 1}`,
      shift_start: siteHours[0],
      shift_end: siteHours[1],
    })),
  ];

  return deriveStaffPlanFromShiftEntries({
    locationId: matrix?.location_id || "",
    planDate: matrix?.matrix_date,
    shiftEntries,
    allowCsrAsPct: false,
    allowModAsPct: false,
    notes: "Auto-generated optimal staffing plan from projected Gingr demand.",
  });
}

function safeRatioCoverage(count, ratio) {
  const normalizedCount = Math.max(0, toNumber(count, 0));
  const normalizedRatio = Math.max(1, toNumber(ratio, 1));
  return normalizedCount > 0 ? Math.ceil(normalizedCount / normalizedRatio) : 0;
}

export function getMatrixTrust(matrix) {
  if (!matrix) {
    return {
      state: "missing",
      source: "none",
      can_generate: false,
      blockers: ["No scheduling matrix is available for this day."],
      notes: [],
    };
  }

  if (matrix.detail_json?.trust) {
    const trust = matrix.detail_json.trust;
    const sourceMissing = requiresGingrSourceCounts(matrix) && !hasGingrSourceCounts(matrix);
    const sourceBlocker = "GINGR Calendar Details source totals are missing for this date.";
    return {
      state: sourceMissing ? "estimated" : trust.state || "trusted",
      source: trust.source || "scheduling_matrix_daily",
      can_generate: !sourceMissing && trust.can_generate !== false,
      blockers: sourceMissing
        ? [...new Set([sourceBlocker, ...(Array.isArray(trust.blockers) ? trust.blockers : [])])]
        : Array.isArray(trust.blockers) ? trust.blockers : [],
      blocker_details: Array.isArray(trust.blocker_details) ? trust.blocker_details : [],
      notes: Array.isArray(trust.notes) ? trust.notes : [],
    };
  }

  if (matrix._source === "dashboard_fallback") {
    return {
      state: "estimated",
      source: "dashboard_fallback",
      can_generate: false,
      blockers: ["This day is still using fallback dashboard metrics instead of the verified Gingr scheduling matrix."],
      blocker_details: [],
      notes: ["Constituent opening, closing, feeding, medication, and bath counts are not fully verified."],
    };
  }

  if (matrix._source === "empty") {
    return {
      state: "missing",
      source: "none",
      can_generate: false,
      blockers: ["No scheduling data has been computed for this day yet."],
      blocker_details: [],
      notes: [],
    };
  }

  return {
    state: "trusted",
    source: matrix._source || "scheduling_matrix_daily",
    can_generate: true,
    blockers: [],
    blocker_details: [],
    notes: [],
  };
}

export function getMatrixTrustState(matrix) {
  return getMatrixTrust(matrix).state;
}

export function getMatrixBlockers(matrix) {
  const trust = getMatrixTrust(matrix);
  return Array.isArray(trust.blockers) ? trust.blockers : [];
}

export function canGenerateSchedule(matrix) {
  const trust = getMatrixTrust(matrix);
  return trust.state === "trusted";
}

function resolveDemandMode(matrix, requestedMode = "current") {
  const projection = getMatrixProjection(matrix);
  if (requestedMode === "projected" && projection?.state === "projected") {
    return "projected";
  }
  return "current";
}

function getDemandDisplay(matrix, requestedMode = "current") {
  return resolveDemandMode(matrix, requestedMode) === "projected"
    ? getMatrixProjectedDisplay(matrix)
    : getMatrixDisplay(matrix);
}

function getDemandSolverInputs(matrix, requestedMode = "current") {
  if (resolveDemandMode(matrix, requestedMode) === "current") {
    return getMatrixSolverInputs(matrix);
  }

  const projected = getMatrixProjectedDisplay(matrix);
  return {
    peak_large_daycare: toNumber(projected.daycare.large_daycare, 0),
    peak_small_daycare: toNumber(projected.daycare.small_daycare, 0),
    peak_unknown_daycare: toNumber(projected.daycare.unclassified_daycare, 0),
    total_private_play_dogs:
      toNumber(projected.opening.private_play_boarding, 0)
      + toNumber(projected.opening.half_and_half_boarding, 0)
      + toNumber(projected.daycare.private_play_dayboarding, 0)
      + toNumber(projected.daycare.half_and_half_daytime, 0),
    morning_feeding_dogs: toNumber(projected.support.morning_feeding_dogs, 0),
    evening_feeding_dogs: toNumber(projected.support.evening_feeding_dogs, 0),
    medication_dogs: toNumber(projected.support.medication_dogs, 0),
  };
}

export function getMatrixDisplay(matrix) {
  const display = matrix?.detail_json?.display || {};

  const opening = {
    large_boarding: toNullableNumber(display.opening?.large_boarding) ?? toNumber(matrix?.boarding_large, 0),
    small_boarding: toNullableNumber(display.opening?.small_boarding) ?? toNumber(matrix?.boarding_small, 0),
    private_play_boarding: toNullableNumber(display.opening?.private_play_boarding) ?? toNumber(matrix?.pp_overnight_boarders, 0),
    half_and_half_boarding: toNullableNumber(display.opening?.half_and_half_boarding) ?? 0,
    evaluation_boarding: toNullableNumber(display.opening?.evaluation_boarding) ?? 0,
    unclassified_boarding: toNullableNumber(display.opening?.unclassified_boarding) ?? toNumber(matrix?.boarding_unknown_size, 0),
  };
  opening.total_boarding = toNullableNumber(display.opening?.total_boarding)
    ?? [opening.large_boarding, opening.small_boarding, opening.private_play_boarding, opening.half_and_half_boarding, opening.evaluation_boarding, opening.unclassified_boarding]
      .reduce((sum, value) => sum + (toNumber(value, 0)), 0);

  const closing = {
    large_boarding: toNullableNumber(display.closing?.large_boarding) ?? opening.large_boarding,
    small_boarding: toNullableNumber(display.closing?.small_boarding) ?? opening.small_boarding,
    private_play_boarding: toNullableNumber(display.closing?.private_play_boarding) ?? opening.private_play_boarding,
    half_and_half_boarding: toNullableNumber(display.closing?.half_and_half_boarding) ?? opening.half_and_half_boarding,
    evaluation_boarding: toNullableNumber(display.closing?.evaluation_boarding) ?? opening.evaluation_boarding,
    unclassified_boarding: toNullableNumber(display.closing?.unclassified_boarding) ?? opening.unclassified_boarding,
  };
  closing.total_boarding = toNullableNumber(display.closing?.total_boarding)
    ?? [closing.large_boarding, closing.small_boarding, closing.private_play_boarding, closing.half_and_half_boarding, closing.evaluation_boarding, closing.unclassified_boarding]
      .reduce((sum, value) => sum + (toNumber(value, 0)), 0);

  const daycare = {
    evaluations: toNullableNumber(display.daycare?.evaluations) ?? toNumber(matrix?.evaluations, 0),
    private_play_dayboarding: toNullableNumber(display.daycare?.private_play_dayboarding) ?? toNumber(matrix?.pp_dayboarders, 0),
    half_and_half_daytime: toNullableNumber(display.daycare?.half_and_half_daytime) ?? 0,
    large_daycare: toNullableNumber(display.daycare?.large_daycare) ?? toNumber(matrix?.daycare_large, 0),
    small_daycare: toNullableNumber(display.daycare?.small_daycare) ?? toNumber(matrix?.daycare_small, 0),
    unclassified_daycare: toNullableNumber(display.daycare?.unclassified_daycare) ?? toNumber(matrix?.daycare_unknown_size, 0),
  };
  daycare.total_daycare = toNullableNumber(display.daycare?.total_daycare)
    ?? [
      daycare.evaluations,
      daycare.private_play_dayboarding,
      daycare.half_and_half_daytime,
      daycare.large_daycare,
      daycare.small_daycare,
      daycare.unclassified_daycare,
    ].reduce((sum, value) => sum + (toNumber(value, 0)), 0);

  const support = {
    departure_baths: toNullableNumber(display.support?.departure_baths) ?? toNumber(matrix?.departure_baths, 0),
    morning_feeding_dogs: toNullableNumber(display.support?.morning_feeding_dogs) ?? opening.total_boarding,
    evening_feeding_dogs: toNullableNumber(display.support?.evening_feeding_dogs) ?? toNumber(matrix?.feeding_dogs, closing.total_boarding),
    medication_dogs: toNullableNumber(display.support?.medication_dogs) ?? toNumber(matrix?.medication_dogs, 0),
    total_dog_volume: toNullableNumber(display.support?.total_dog_volume) ?? toNumber(matrix?.gross_dogs_in_building, closing.total_boarding + daycare.total_daycare),
    tours: toNullableNumber(display.support?.tours) ?? toNumber(matrix?.tours, 0),
  };
  const play_yard = {
    large_play_dogs: toNullableNumber(display.play_yard?.large_play_dogs) ?? Math.max(opening.large_boarding, closing.large_boarding) + daycare.large_daycare,
    small_play_dogs: toNullableNumber(display.play_yard?.small_play_dogs) ?? Math.max(opening.small_boarding, closing.small_boarding) + daycare.small_daycare,
    private_play_dogs: toNullableNumber(display.play_yard?.private_play_dogs) ?? Math.max(opening.private_play_boarding, closing.private_play_boarding) + daycare.private_play_dayboarding,
    split_play_dogs: toNullableNumber(display.play_yard?.split_play_dogs) ?? Math.max(opening.half_and_half_boarding, closing.half_and_half_boarding) + daycare.half_and_half_daytime,
  };
  const source = {
    check_ins: toNullableNumber(display.source?.check_ins),
    check_outs: toNullableNumber(display.source?.check_outs),
    overnight: toNullableNumber(display.source?.overnight),
    total: toNullableNumber(display.source?.total),
    boarding_opening: toNullableNumber(display.source?.boarding_opening),
    boarding_closing: toNullableNumber(display.source?.boarding_closing),
    boarding_check_ins: toNullableNumber(display.source?.boarding_check_ins),
    boarding_check_outs: toNullableNumber(display.source?.boarding_check_outs),
    daytime_total: toNullableNumber(display.source?.daytime_total),
  };

  return { opening, closing, daycare, support, play_yard, source };
}

export function getMatrixProjectedDisplay(matrix) {
  const projected = matrix?.detail_json?.projection?.display;
  if (!projected) {
    return getMatrixDisplay(matrix);
  }

  const opening = {
    large_boarding: toNullableNumber(projected.opening?.large_boarding) ?? 0,
    small_boarding: toNullableNumber(projected.opening?.small_boarding) ?? 0,
    private_play_boarding: toNullableNumber(projected.opening?.private_play_boarding) ?? 0,
    half_and_half_boarding: toNullableNumber(projected.opening?.half_and_half_boarding) ?? 0,
    evaluation_boarding: toNullableNumber(projected.opening?.evaluation_boarding) ?? 0,
    unclassified_boarding: toNullableNumber(projected.opening?.unclassified_boarding) ?? 0,
  };
  opening.total_boarding = sumDemandValues([
    opening.large_boarding,
    opening.small_boarding,
    opening.private_play_boarding,
    opening.half_and_half_boarding,
    opening.evaluation_boarding,
    opening.unclassified_boarding,
  ]);

  const closing = {
    large_boarding: toNullableNumber(projected.closing?.large_boarding) ?? 0,
    small_boarding: toNullableNumber(projected.closing?.small_boarding) ?? 0,
    private_play_boarding: toNullableNumber(projected.closing?.private_play_boarding) ?? 0,
    half_and_half_boarding: toNullableNumber(projected.closing?.half_and_half_boarding) ?? 0,
    evaluation_boarding: toNullableNumber(projected.closing?.evaluation_boarding) ?? 0,
    unclassified_boarding: toNullableNumber(projected.closing?.unclassified_boarding) ?? 0,
  };
  closing.total_boarding = sumDemandValues([
    closing.large_boarding,
    closing.small_boarding,
    closing.private_play_boarding,
    closing.half_and_half_boarding,
    closing.evaluation_boarding,
    closing.unclassified_boarding,
  ]);

  const daycare = {
    evaluations: toNullableNumber(projected.daycare?.evaluations) ?? 0,
    private_play_dayboarding: toNullableNumber(projected.daycare?.private_play_dayboarding) ?? 0,
    half_and_half_daytime: toNullableNumber(projected.daycare?.half_and_half_daytime) ?? 0,
    large_daycare: toNullableNumber(projected.daycare?.large_daycare) ?? 0,
    small_daycare: toNullableNumber(projected.daycare?.small_daycare) ?? 0,
    unclassified_daycare: toNullableNumber(projected.daycare?.unclassified_daycare) ?? 0,
  };
  daycare.total_daycare = sumDemandValues([
    daycare.evaluations,
    daycare.private_play_dayboarding,
    daycare.half_and_half_daytime,
    daycare.large_daycare,
    daycare.small_daycare,
    daycare.unclassified_daycare,
  ]);

  return {
    opening,
    closing,
    daycare,
    support: {
      departure_baths: toNullableNumber(projected.support?.departure_baths) ?? 0,
      morning_feeding_dogs: opening.total_boarding,
      evening_feeding_dogs: closing.total_boarding,
      medication_dogs: toNullableNumber(projected.support?.medication_dogs) ?? 0,
      total_dog_volume: closing.total_boarding + daycare.total_daycare,
      tours: toNullableNumber(projected.support?.tours) ?? 0,
    },
    play_yard: {
      large_play_dogs: Math.max(opening.large_boarding, closing.large_boarding) + daycare.large_daycare,
      small_play_dogs: Math.max(opening.small_boarding, closing.small_boarding) + daycare.small_daycare,
      private_play_dogs: Math.max(opening.private_play_boarding, closing.private_play_boarding) + daycare.private_play_dayboarding,
      split_play_dogs: Math.max(opening.half_and_half_boarding, closing.half_and_half_boarding) + daycare.half_and_half_daytime,
    },
  };
}

export function getMatrixProjection(matrix) {
  return matrix?.detail_json?.projection || null;
}

export function getMatrixComparison(matrix) {
  return {
    last_year_total_dog_volume: toNullableNumber(matrix?.detail_json?.projection?.comparisons?.last_year_total_dog_volume),
    exact_last_year_display: matrix?.detail_json?.projection?.exact_last_year_display || null,
  };
}

export function getMatrixSolverInputs(matrix) {
  const solver = matrix?.detail_json?.solver_inputs || {};
  const display = getMatrixDisplay(matrix);

  return {
    peak_large_daycare: toNumber(solver.peak_large_daycare, toNumber(matrix?.daycare_large, 0)),
    peak_small_daycare: toNumber(solver.peak_small_daycare, toNumber(matrix?.daycare_small, 0)),
    peak_unknown_daycare: toNumber(solver.peak_unknown_daycare, toNumber(matrix?.daycare_unknown_size, 0)),
    total_private_play_dogs: toNumber(
      solver.total_private_play_dogs,
      toNumber(display.opening.private_play_boarding, 0)
      + toNumber(display.opening.half_and_half_boarding, 0)
      + toNumber(display.daycare.private_play_dayboarding, 0)
      + toNumber(display.daycare.half_and_half_daytime, 0),
    ),
    morning_feeding_dogs: toNumber(solver.morning_feeding_dogs, toNumber(display.support.morning_feeding_dogs, 0)),
    evening_feeding_dogs: toNumber(solver.evening_feeding_dogs, toNumber(display.support.evening_feeding_dogs, 0)),
    medication_dogs: toNumber(solver.medication_dogs, toNumber(display.support.medication_dogs, 0)),
  };
}

function estimateSplitStrategyFinishMinutes(groupDogsLarge, groupDogsSmall, effectivePct, config) {
  if (effectivePct < 2) return Infinity;

  const yardOrder = groupDogsLarge >= groupDogsSmall ? "large" : "small";
  const firstYardDogs = yardOrder === "large" ? groupDogsLarge : groupDogsSmall;
  const secondYardDogs = yardOrder === "large" ? groupDogsSmall : groupDogsLarge;
  const helpers = effectivePct - 1;
  const transportMin = config.group_transport_minutes_each_way;
  const messRate = config.room_mess_rate_default;
  const cleanMin = config.morning_room_clean_minutes;

  const loadFirst = (firstYardDogs * transportMin) / Math.max(1, helpers);
  const cleanFirst = (firstYardDogs * messRate * cleanMin) / Math.max(1, helpers - 1 || 1);
  const loadSecond = (secondYardDogs * transportMin) / Math.max(1, helpers - 1 || 1);
  const unloadFirst = (firstYardDogs * transportMin) / Math.max(1, helpers - 1 || 1);
  const unloadSecond = (secondYardDogs * transportMin) / Math.max(1, helpers - 1 || 1);

  return loadFirst + Math.max(cleanFirst, loadSecond) + unloadFirst + unloadSecond;
}

function estimateOpeningRequirement(matrix, config, demandMode = "current") {
  const display = getDemandDisplay(matrix, demandMode);
  const totalOvernightDogs = toNumber(display.opening.total_boarding, 0);
  const ppDogs = toNumber(display.opening.private_play_boarding, 0) + toNumber(display.opening.half_and_half_boarding, 0);
  const groupDogsLarge = toNumber(display.opening.large_boarding, 0);
  const groupDogsSmall = toNumber(display.opening.small_boarding, 0);

  const weekend = isWeekend(matrix.matrix_date);
  const window = weekend ? config.weekend_am_open_window : config.weekday_am_open_window;
  const windowMinutes = timeToMinutes(window[1]) - timeToMinutes(window[0]);
  const fullPodPassRequired = Math.max(1, Math.ceil(estimatePodPassTotalMinutes(totalOvernightDogs, config) / Math.max(1, windowMinutes)));
  const ppReserve = ppDogs > 0 ? Math.max(1, Math.ceil(estimatePodPassTotalMinutes(ppDogs, config) / Math.max(1, windowMinutes))) : 0;

  let splitRequired = Infinity;
  for (let candidate = Math.max(2, ppReserve + 2); candidate <= 12; candidate++) {
    const effectivePct = candidate - ppReserve;
    const finishMinutes = estimateSplitStrategyFinishMinutes(groupDogsLarge, groupDogsSmall, effectivePct, config);
    if (finishMinutes <= windowMinutes) {
      splitRequired = candidate;
      break;
    }
  }

  if (totalOvernightDogs <= 24) {
    return { strategy: "full_pod_pass", requiredPct: fullPodPassRequired };
  }

  if (totalOvernightDogs <= 30) {
    const best = Math.min(fullPodPassRequired, splitRequired);
    return {
      strategy: best === splitRequired ? "split_group_pp" : "full_pod_pass",
      requiredPct: Number.isFinite(best) ? best : fullPodPassRequired,
    };
  }

  if (Number.isFinite(splitRequired)) {
    return { strategy: "split_group_pp", requiredPct: splitRequired };
  }

  return { strategy: "full_pod_pass", requiredPct: fullPodPassRequired };
}

// ─── Pod Pass Throughput Estimator ────────────────────────────────────────

export function estimatePodPassMinutesPerDog(config) {
  const moveMin = config.private_play_move_minutes_each_way;
  const messRate = config.room_mess_rate_default;
  const cleanMin = config.morning_room_clean_minutes;
  const dogsPerTrip = config.pod_pass_dogs_per_trip;

  // Each dog needs: move out + dwell + move back, averaged over trip sharing
  // Plus probabilistic room clean
  const moveMinPerDog = (moveMin * 2) / dogsPerTrip;
  const cleanMinPerDog = messRate * cleanMin;
  return moveMinPerDog + cleanMinPerDog;
}

export function estimatePodPassTotalMinutes(dogCount, config) {
  return dogCount * estimatePodPassMinutesPerDog(config);
}

// ─── Opening Strategy Evaluation ──────────────────────────────────────────

/**
 * Evaluate full pod pass strategy for all overnight dogs.
 */
export function evaluateFullPodPass(matrix, staffPlan, config, options = {}) {
  const display = getDemandDisplay(matrix, options.demandMode);
  const totalOvernightDogs = toNumber(display.opening.total_boarding, 0);
  const totalMinutes = estimatePodPassTotalMinutes(totalOvernightDogs, config);

  const weekend = isWeekend(matrix.matrix_date);
  const window = weekend ? config.weekend_am_open_window : config.weekday_am_open_window;
  const windowMinutes = timeToMinutes(window[1]) - timeToMinutes(window[0]);

  const requiredFunctioningPct = Math.max(1, Math.ceil(totalMinutes / windowMinutes));
  const availableFunctioningPct = computeAvailableFunctioningPct(staffPlan, { time: window[0] });
  const feasible = requiredFunctioningPct <= availableFunctioningPct;
  const finishMinutes = Math.ceil(totalMinutes / Math.max(1, Math.min(requiredFunctioningPct, availableFunctioningPct)));

  const explanation = [];
  explanation.push(`Full pod pass evaluated for ${totalOvernightDogs} overnight dogs`);
  explanation.push(`Estimated ${estimatePodPassMinutesPerDog(config).toFixed(1)} minutes per dog`);
  explanation.push(`Total work: ${Math.round(totalMinutes)} staff-minutes`);
  explanation.push(`Window: ${windowMinutes} minutes, requires ${requiredFunctioningPct} functioning PCT(s)`);

  const warnings = [];
  if (!feasible) {
    warnings.push(`Full pod pass requires ${requiredFunctioningPct} functioning PCTs but only ${availableFunctioningPct} available`);
  }

  return {
    strategy: "full_pod_pass",
    feasible,
    requiredFunctioningPct,
    staffMinutes: totalMinutes,
    finishTime: addMinutesToTime(window[0], finishMinutes),
    explanation,
    warnings,
  };
}

/**
 * Evaluate split strategy: group let-outs for group-play dogs + pod pass for PP dogs.
 */
export function evaluateSplitStrategy(matrix, staffPlan, config, options = {}) {
  const display = getDemandDisplay(matrix, options.demandMode);
  const ppDogs = toNumber(display.opening.private_play_boarding, 0) + toNumber(display.opening.half_and_half_boarding, 0);
  const groupDogsLarge = toNumber(display.opening.large_boarding, 0);
  const groupDogsSmall = toNumber(display.opening.small_boarding, 0);

  const weekend = isWeekend(matrix.matrix_date);
  const window = weekend ? config.weekend_am_open_window : config.weekday_am_open_window;
  const windowMinutes = timeToMinutes(window[1]) - timeToMinutes(window[0]);
  const availableFunctioningPct = computeAvailableFunctioningPct(staffPlan, { time: window[0] });

  // Reserve PP labor
  const ppMinutes = ppDogs > 0 ? estimatePodPassTotalMinutes(ppDogs, config) : 0;
  const ppFunctioningPct = ppDogs > 0 ? Math.max(1, Math.ceil(ppMinutes / windowMinutes)) : 0;

  // Yard order: larger boarding release volume first
  const yardOrder = groupDogsLarge >= groupDogsSmall ? "large" : "small";

  // Staggered wave group let-out estimate
  const effectivePct = Math.max(0, availableFunctioningPct - ppFunctioningPct);
  const transportMin = config.group_transport_minutes_each_way;
  const messRate = config.room_mess_rate_default;
  const cleanMin = config.morning_room_clean_minutes;

  let groupFeasible = true;
  let groupFinishMinutes = 0;
  let groupStaffMinutes = 0;
  const groupWarnings = [];

  if (effectivePct < 2) {
    groupFeasible = false;
    groupWarnings.push("Not enough functioning PCTs remaining for group let-outs after PP reserve");
  } else {
    // Staggered wave: first yard with max density, then second yard overlapping
    const firstYardDogs = yardOrder === "large" ? groupDogsLarge : groupDogsSmall;
    const secondYardDogs = yardOrder === "large" ? groupDogsSmall : groupDogsLarge;
    const helpers = effectivePct - 1; // 1 stays in daycare

    const loadFirst = (firstYardDogs * transportMin) / Math.max(1, helpers);
    const cleanFirst = (firstYardDogs * messRate * cleanMin) / Math.max(1, helpers - 1 || 1);
    const loadSecond = (secondYardDogs * transportMin) / Math.max(1, helpers - 1 || 1);
    const unloadFirst = (firstYardDogs * transportMin) / Math.max(1, helpers - 1 || 1);
    const unloadSecond = (secondYardDogs * transportMin) / Math.max(1, helpers - 1 || 1);

    groupFinishMinutes = loadFirst + Math.max(cleanFirst, loadSecond) + unloadFirst + unloadSecond;
    groupStaffMinutes = groupFinishMinutes * effectivePct;
    groupFeasible = groupFinishMinutes <= windowMinutes;

    if (!groupFeasible) {
      groupWarnings.push(`Staggered group let-outs exceed window by ${Math.ceil(groupFinishMinutes - windowMinutes)} minutes`);
    }
  }

  const totalRequired = ppFunctioningPct + Math.max(2, effectivePct);
  const totalFeasible = groupFeasible && totalRequired <= availableFunctioningPct;

  const explanation = [];
  explanation.push(`Split strategy: group let-outs for ${groupDogsLarge + groupDogsSmall} group-play dogs + pod pass for ${ppDogs} PP dogs`);
  explanation.push(`PP reserve: ${ppFunctioningPct} functioning PCT(s) for ${ppDogs} PP dogs`);
  explanation.push(`First yard: ${yardOrder} daycare (${yardOrder === "large" ? groupDogsLarge : groupDogsSmall} dogs)`);
  explanation.push(`Staggered wave with ${effectivePct} functioning PCTs for group let-outs`);
  if (groupFinishMinutes > 0) {
    explanation.push(`Estimated group let-out completion: ${Math.round(groupFinishMinutes)} minutes`);
  }

  return {
    strategy: "split_group_pp",
    feasible: totalFeasible,
    requiredFunctioningPct: totalRequired,
    staffMinutes: groupStaffMinutes + ppMinutes,
    finishTime: addMinutesToTime(window[0], Math.ceil(Math.max(groupFinishMinutes, ppMinutes / Math.max(1, ppFunctioningPct)))),
    yardOrder,
    explanation,
    warnings: [...groupWarnings],
  };
}

/**
 * Run the V1 opening decision tree.
 */
export function solveOpening(matrix, staffPlan, config, options = {}) {
  const podPassResult = evaluateFullPodPass(matrix, staffPlan, config, options);
  const splitResult = evaluateSplitStrategy(matrix, staffPlan, config, options);

  // Step 1: If full pod pass fits comfortably, use it
  if (podPassResult.feasible) {
    const totalOvernightDogs = toNumber(getMatrixDisplay(matrix).opening.total_boarding, 0);
    // Prefer pod pass for <= 24 dogs (pod pass default zone)
    if (totalOvernightDogs <= 24) {
      return { ...podPassResult, selectedReason: "Full pod pass is feasible and preferred for low-volume morning" };
    }
    // Gray zone 25-30: pod pass may still win on staff-minutes
    if (totalOvernightDogs <= 30 && podPassResult.staffMinutes <= splitResult.staffMinutes) {
      return { ...podPassResult, selectedReason: "Full pod pass is feasible in gray zone (25-30 dogs) and more labor-efficient" };
    }
  }

  // Step 2: Try split strategy
  if (splitResult.feasible) {
    return { ...splitResult, selectedReason: "Split strategy selected: group let-outs + PP pod pass" };
  }

  // Step 3: Neither fully feasible — choose least bad
  if (podPassResult.feasible) {
    return { ...podPassResult, selectedReason: "Full pod pass selected as fallback (split strategy infeasible)" };
  }

  // Both infeasible — pick the one with fewer required PCTs
  const leastBad = podPassResult.requiredFunctioningPct <= splitResult.requiredFunctioningPct ? podPassResult : splitResult;
  return {
    ...leastBad,
    selectedReason: `Infeasible opening — ${leastBad.strategy} chosen as least-bad option. Need ${leastBad.requiredFunctioningPct} functioning PCTs.`,
    warnings: [...leastBad.warnings, "Opening is infeasible with current staffing. Additional functioning PCTs needed."],
  };
}

// ─── Staff Availability Computation ───────────────────────────────────────

export function computeAvailableFunctioningPct(staffPlan, options = {}) {
  if (!staffPlan) return 0;
  const entries = getShiftEntries(staffPlan);
  if (entries.length && options.time) {
    return countFunctioningFromEntries(entries, staffPlan, options.time);
  }
  let total = staffPlan.pct_count || 0;
  if (staffPlan.allow_csr_as_pct) total += (staffPlan.csr_count || 0);
  if (staffPlan.allow_mod_as_pct) total += (staffPlan.mod_count || 0);
  return total;
}

// ─── Required Headcount Computation ───────────────────────────────────────

/**
 * Compute required functioning PCT counts for AM, midday, and PM from matrix + config.
 */
export function computeRequiredHeadcount(matrix, config, options = {}) {
  if (!matrix) return { am: 0, midday: 0, pm: 0, functionalHours: 0, warnings: [], explanation: [] };

  const demandMode = resolveDemandMode(matrix, options.demandMode);
  const display = getDemandDisplay(matrix, demandMode);
  const solverInputs = getDemandSolverInputs(matrix, demandMode);
  const trust = getMatrixTrust(matrix);
  const blockers = getMatrixBlockers(matrix);
  const warnings = [];
  const explanation = [];

  const totalOvernightDogs = toNumber(display.opening.total_boarding, 0);
  const openingRequirement = estimateOpeningRequirement(matrix, config, demandMode);
  const peakLargeCoverage = safeRatioCoverage(solverInputs.peak_large_daycare, config.daycare_ratio_large);
  const peakSmallCoverage = safeRatioCoverage(solverInputs.peak_small_daycare, config.daycare_ratio_small);
  const unknownCoverage = solverInputs.peak_unknown_daycare > 0 ? 1 : 0;
  const privatePlayCoverage = solverInputs.total_private_play_dogs > 0 ? 1 : 0;
  const bathCoverage = toNumber(display.support.departure_baths, 0) > 6 ? 1 : 0;
  const middayBreakRelief = (peakLargeCoverage + peakSmallCoverage + privatePlayCoverage) > 0 ? 1 : 0;

  const weekend = isWeekend(matrix.matrix_date);
  const window = weekend ? config.weekend_am_open_window : config.weekday_am_open_window;
  const windowMin = timeToMinutes(window[1]) - timeToMinutes(window[0]);
  const openingCoverageFloor = Math.max(1, peakLargeCoverage + peakSmallCoverage + unknownCoverage + privatePlayCoverage + bathCoverage);
  const amRequired = Math.max(openingRequirement.requiredPct, openingCoverageFloor);

  const middayCoreCoverage = peakLargeCoverage + peakSmallCoverage + unknownCoverage + privatePlayCoverage;
  const middayRequired = Math.max(1, middayCoreCoverage + middayBreakRelief + bathCoverage);

  const feedWork =
    (solverInputs.evening_feeding_dogs * (config.feeding_minutes_per_dog || 1.5)) +
    (solverInputs.medication_dogs * (config.medication_minutes_per_dog || 2));
  const feedPct = Math.ceil(feedWork / Math.max(1, windowMin));
  const pmRequired = Math.max(1, peakLargeCoverage + peakSmallCoverage + unknownCoverage + privatePlayCoverage + feedPct);

  // Total functional hours estimate (rough: am * opening_hours + midday * midday_hours + pm * closing_hours)
  const siteHours = weekend ? config.weekend_site_hours : config.weekday_site_hours;
  const totalSiteHours = (timeToMinutes(siteHours[1]) - timeToMinutes(siteHours[0])) / 60;
  const functionalHours = Math.round(
    amRequired * (windowMin / 60) +
    middayRequired * (totalSiteHours * 0.4) +
    pmRequired * (totalSiteHours * 0.3)
  );

  // Generate explanation
  explanation.push(`${demandMode === "projected" ? "Projected" : "Booked"} AM: ${amRequired} functioning PCTs needed — ${totalOvernightDogs} boarding dogs opening, ${solverInputs.total_private_play_dogs} private play dogs, ${toNumber(display.support.departure_baths, 0)} departure baths`);
  explanation.push(`Midday: ${middayRequired} functioning PCTs — peak daycare coverage (${peakLargeCoverage} large + ${peakSmallCoverage} small + ${unknownCoverage} flex) with break relief`);
  explanation.push(`PM: ${pmRequired} functioning PCTs — closing coverage plus feeding (${solverInputs.evening_feeding_dogs} dogs) and meds (${solverInputs.medication_dogs} dogs)`);

  if (trust.state !== "trusted") {
    warnings.push(trust.state === "estimated"
      ? "Scheduling matrix is estimated from fallback data. Automated schedule generation is blocked until the verified matrix is computed."
      : "Scheduling matrix is missing. Automated schedule generation is blocked until the verified matrix is computed.");
  }
  warnings.push(...blockers);

  // Warnings
  if (toNumber(display.support.departure_baths, 0) > 10) {
    warnings.push("Heavy bath day — bath completion may push past target window");
  }
  if (solverInputs.total_private_play_dogs > 8) {
    warnings.push(`High PP load (${solverInputs.total_private_play_dogs} dogs) — dedicated private play coverage is likely needed throughout the day`);
  }
  if (toNumber(matrix.boarding_unknown_size, 0) + toNumber(matrix.daycare_unknown_size, 0) > 0) {
    warnings.push(`${toNumber(matrix.boarding_unknown_size, 0) + toNumber(matrix.daycare_unknown_size, 0)} dogs still have unresolved playgroup classification — schedule generated using the current known mix, but verify the split before publishing`);
  }

  return {
    am: amRequired,
    midday: middayRequired,
    pm: pmRequired,
    functionalHours,
    warnings,
    explanation,
    demandMode,
  };
}

/**
 * Compute staffing status for a day given required vs assigned counts.
 */
export function computeStaffingStatus(required, staffPlan, config, matrixDate) {
  if (!staffPlan) return { status: "no_plan", warnings: ["No staff plan entered for this day"] };

  const assignedByDaypart = computeDaypartAvailability(matrixDate, staffPlan, config);
  const warnings = [];

  const amGap = required.am - assignedByDaypart.am;
  const middayGap = required.midday - assignedByDaypart.midday;
  const pmGap = required.pm - assignedByDaypart.pm;

  if (amGap > 0) warnings.push(`Opening short by ${amGap} functioning PCT(s)`);
  if (middayGap > 0) warnings.push(`Midday short by ${middayGap} functioning PCT(s)`);
  if (pmGap > 0) warnings.push(`PM coverage short by ${pmGap} functioning PCT(s)`);

  const maxGap = Math.max(amGap, middayGap, pmGap);
  let status = "ok";
  if (maxGap > 0) status = "short";
  else if (maxGap === 0) status = "borderline";

  return {
    status,
    warnings,
    assignedFunctioningPct: Math.max(assignedByDaypart.am, assignedByDaypart.midday, assignedByDaypart.pm),
    assignedByDaypart,
  };
}

// ─── Rotation Grid Generator (opening block) ─────────────────────────────

/**
 * Generate a 15-minute rotation grid for the opening block.
 * Returns { lanes, slots, grid, explanation } where grid[lane][time] = taskKey.
 */
export function generateOpeningGrid(matrix, staffPlan, openingResult, config) {
  const weekend = isWeekend(matrix.matrix_date);
  const siteHours = weekend ? config.weekend_site_hours : config.weekday_site_hours;
  const openWindow = weekend ? config.weekend_am_open_window : config.weekday_am_open_window;
  const publicHours = weekend ? config.public_hours_weekend : config.public_hours_weekday;

  const slots = build15MinSlots(siteHours[0], siteHours[1]);
  const morningSlots = slots.slice(0, 16); // First 4 hours

  // Build lanes
  const numPct = staffPlan.pct_count || 0;
  const numCsr = staffPlan.csr_count || 0;
  const hasSup = staffPlan.supervisor_present;
  const lanes = [];
  for (let i = 1; i <= numPct; i++) lanes.push(`fPCT ${i}`);
  if (staffPlan.allow_csr_as_pct && numCsr > 0) {
    for (let i = 1; i <= numCsr; i++) lanes.push(`CSR→fPCT ${i}`);
  }
  if (hasSup) lanes.push("SUP");

  // Fallback if no lanes
  if (lanes.length === 0) {
    lanes.push("fPCT 1", "fPCT 2", "fPCT 3");
  }

  const grid = {};
  lanes.forEach(lane => { grid[lane] = {}; });

  const openEndIdx = morningSlots.indexOf(openWindow[1]) || 4;
  const solverInputs = getMatrixSolverInputs(matrix);
  const display = getMatrixDisplay(matrix);
  const ppDogs = toNumber(display.opening.private_play_boarding, 0) + toNumber(display.opening.half_and_half_boarding, 0);
  const hasSmallDaycare = solverInputs.peak_small_daycare > 0;
  const strategy = openingResult?.strategy || "split_group_pp";

  // Assign tasks by phase
  morningSlots.forEach((t, ti) => {
    lanes.forEach((lane, li) => {
      const isSup = lane === "SUP";
      const isCsr = lane.startsWith("CSR");
      const isPct = !isSup && !isCsr;

      // CSR pre-open prep protection: 30 min before public hours
      const publicOpenMin = timeToMinutes(publicHours[0]);
      const slotMin = timeToMinutes(t);
      const inCsrPrepWindow = isCsr && slotMin >= (publicOpenMin - 30) && slotMin < publicOpenMin;
      if (inCsrPrepWindow) {
        grid[lane][t] = "float"; // CSR returns to front desk prep
        return;
      }

      if (isSup) {
        // Supervisor: feeding + meds in opening, then float/coverage
        if (ti < openEndIdx) {
          grid[lane][t] = "feed";
        } else if (ti < openEndIdx + 2) {
          grid[lane][t] = "lgdc";
        } else if (ti === openEndIdx + 4) {
          grid[lane][t] = "break";
        } else {
          grid[lane][t] = "float";
        }
        return;
      }

      // PCT / CSR-as-PCT assignment
      if (ti < openEndIdx) {
        // Opening phase
        if (strategy === "full_pod_pass") {
          grid[lane][t] = "opening";
        } else {
          // Split strategy: last PCT does PP pod pass, rest do group let-outs
          if (ppDogs > 0 && li === lanes.length - (hasSup ? 2 : 1)) {
            grid[lane][t] = "pp"; // PP pod pass
          } else {
            grid[lane][t] = "opening"; // Group let-outs
          }
        }
      } else if (ti < openEndIdx + 2) {
        // Room clean / transport phase
        if (li === 0) grid[lane][t] = "transport";
        else if (li === 1 && (matrix.departure_baths || 0) > 0) grid[lane][t] = "bath";
        else grid[lane][t] = "room_clean";
      } else if (ti < openEndIdx + 4) {
        // Core daycare ramp-up
        if (li % 3 === 0) grid[lane][t] = "lgdc";
        else if (li % 3 === 1) grid[lane][t] = hasSmallDaycare ? "smdc" : "lgdc";
        else grid[lane][t] = ppDogs > 0 ? "pp" : "lgdc";
      } else if (ti < openEndIdx + 8) {
        // Core rotation
        const phase = Math.floor((ti - openEndIdx - 4) / 2);
        if (li === 0) grid[lane][t] = "lgdc";
        else if (li === 1) grid[lane][t] = hasSmallDaycare && phase === 0 ? "smdc" : "lgdc";
        else if (li === 2) grid[lane][t] = phase === 0 ? "bath" : "pp";
        else grid[lane][t] = ti === openEndIdx + 6 ? "break" : "lgdc";
      } else {
        // Late morning
        if (li === 0) grid[lane][t] = "lgdc";
        else if (li === 1) grid[lane][t] = hasSmallDaycare ? "smdc" : "lgdc";
        else if (ti % 4 === 0 && li > 1) grid[lane][t] = "break";
        else grid[lane][t] = "disinfect";
      }
    });
  });

  return { lanes, slots: morningSlots, grid };
}

// ─── Full-Day Grid Generator (AM + PM) ──────────────────────────────────────

/**
 * Generate a full-day rotation grid covering opening through closing.
 * Produces AM and PM shift grids with proper phase structure matching workbook patterns.
 */
export function generateFullDayGrid(matrix, staffPlan, openingResult, config) {
  const weekend = isWeekend(matrix.matrix_date);
  const siteHours = weekend ? config.weekend_site_hours : config.weekday_site_hours;
  const publicHours = weekend ? config.public_hours_weekend : config.public_hours_weekday;
  const openWindow = weekend ? config.weekend_am_open_window : config.weekday_am_open_window;

  const allSlots = build15MinSlots(siteHours[0], siteHours[1]);

  const laneDefs = buildStaffLaneDefinitions(staffPlan);
  const lanes = laneDefs.map((lane) => lane.label);

  const grid = {};
  lanes.forEach(lane => { grid[lane] = {}; });

  const solverInputs = getMatrixSolverInputs(matrix);
  const ppDogs = solverInputs.total_private_play_dogs;
  const hasBaths = (matrix.departure_baths || 0) > 0;
  const strategy = openingResult?.strategy || "split_group_pp";
  const hasSup = staffPlan.supervisor_present;
  const publicOpenMin = timeToMinutes(publicHours[0]);
  const openEndMin = timeToMinutes(openWindow[1]);

  // Define phase boundaries (in minutes from midnight)
  const phases = buildPhases(weekend, siteHours, openWindow);

  // Track breaks for concurrency validation
  const breakTracker = [];
  const teamSize = computeAvailableFunctioningPct(staffPlan);
  const maxConcurrentBreaks = teamSize >= (config.large_team_threshold || 6)
    ? (config.max_breaks_large_team || 2)
    : (config.max_breaks_small_team || 1);

  allSlots.forEach((t, ti) => {
    const slotMin = timeToMinutes(t);
    const phase = getPhaseForSlot(slotMin, phases);
    const activeLaneDefs = laneDefs.filter((laneDef) => isLaneDefinitionActive(laneDef, t));
    const activeCrewLaneLabels = activeLaneDefs.filter((laneDef) => laneDef.kind !== "supervisor").map((laneDef) => laneDef.label);

    laneDefs.forEach((laneDef) => {
      const lane = laneDef.label;
      const activeCrewIndex = activeCrewLaneLabels.indexOf(lane);
      const isSup = laneDef.kind === "supervisor";
      const isCsr = laneDef.kind === "csr";

      if (!isLaneDefinitionActive(laneDef, t)) {
        grid[lane][t] = "off";
        return;
      }

      // CSR prep protection: 30 min before public hours
      if (isCsr && slotMin >= (publicOpenMin - 30) && slotMin < publicOpenMin) {
        grid[lane][t] = "float";
        return;
      }

      // Supervisor assignment by phase
      if (isSup) {
        grid[lane][t] = assignSupervisorTask(phase, slotMin, ti, phases, matrix, config, breakTracker, maxConcurrentBreaks, t);
        return;
      }

      // PCT / CSR-as-PCT assignment by phase
      grid[lane][t] = assignCrewTask(phase, slotMin, ti, activeCrewIndex, activeCrewLaneLabels, strategy, matrix, config, hasBaths, ppDogs, hasSup, breakTracker, maxConcurrentBreaks, t, solverInputs);
    });
  });

  return { lanes, slots: allSlots, grid, phases, laneMeta: laneDefs };
}

function buildLaneLabel(entry, indexByKind) {
  if (entry.name) return `${getShiftPositionLabel(entry.position)} — ${entry.name}`;
  return `${getShiftPositionLabel(entry.position)} ${indexByKind}`;
}

function buildStaffLaneDefinitions(staffPlan) {
  const shiftEntries = getShiftEntries(staffPlan);
  if (shiftEntries.length) {
    const counters = { pct: 0, csr: 0, supervisor: 0, mod: 0 };
    return shiftEntries.map((entry) => {
      counters[entry.position] = (counters[entry.position] || 0) + 1;
      return {
        label: buildLaneLabel(entry, counters[entry.position]),
        kind: entry.position === "supervisor" ? "supervisor" : entry.position,
        shift_start: entry.shift_start,
        shift_end: entry.shift_end,
        name: entry.name,
        position: entry.position,
      };
    });
  }

  const numPct = staffPlan?.pct_count || 0;
  const numCsr = staffPlan?.csr_count || 0;
  const hasSup = staffPlan?.supervisor_present;
  const laneDefs = [];
  for (let i = 1; i <= numPct; i++) laneDefs.push({ label: `fPCT ${i}`, kind: "pct" });
  if (staffPlan?.allow_csr_as_pct && numCsr > 0) {
    for (let i = 1; i <= numCsr; i++) laneDefs.push({ label: `CSR→fPCT ${i}`, kind: "csr" });
  }
  if (hasSup) laneDefs.push({ label: "SUP", kind: "supervisor" });
  if (laneDefs.length === 0) {
    laneDefs.push(
      { label: "fPCT 1", kind: "pct" },
      { label: "fPCT 2", kind: "pct" },
      { label: "fPCT 3", kind: "pct" },
    );
  }
  return laneDefs;
}

function isLaneDefinitionActive(laneDef, timeStr) {
  if (!laneDef.shift_start || !laneDef.shift_end) return true;
  return isShiftEntryActive(laneDef, timeStr);
}

function buildStaffLanes(staffPlan) {
  return buildStaffLaneDefinitions(staffPlan).map((lane) => lane.label);
}

function buildPhases(weekend, siteHours, openWindow) {
  const openStart = timeToMinutes(siteHours[0]);
  const openEnd = timeToMinutes(openWindow[1]);
  const siteEnd = timeToMinutes(siteHours[1]);

  if (weekend) {
    return {
      OPEN: { start: openStart, end: openEnd },             // 07:00-09:00
      PREP: { start: openEnd, end: openEnd + 60 },          // 09:00-10:00
      CORE: { start: openEnd + 60, end: openEnd + 180 },    // 10:00-12:00
      LATE_AM: { start: openEnd + 180, end: 750 },          // 12:00-12:30
      PM_CORE: { start: 780, end: 900 },                    // 13:00-15:00
      PM_MID: { start: 900, end: 990 },                     // 15:00-16:30
      WINDDOWN: { start: 990, end: 1020 },                  // 16:30-17:00
      CLOSE: { start: 1020, end: siteEnd },                 // 17:00-18:00
    };
  }
  return {
    OPEN: { start: openStart, end: openEnd },               // 06:00-07:00
    PREP: { start: openEnd, end: openEnd + 60 },            // 07:00-08:00
    CORE: { start: openEnd + 60, end: openEnd + 240 },      // 08:00-11:00
    LATE_AM: { start: openEnd + 240, end: 750 },            // 11:00-12:30
    PM_CORE: { start: 780, end: 900 },                      // 13:00-15:00
    PM_MID: { start: 900, end: 1020 },                      // 15:00-17:00
    WINDDOWN: { start: 1020, end: 1050 },                   // 17:00-17:30
    CLOSE: { start: 1050, end: siteEnd },                   // 17:30-20:00
  };
}

function getPhaseForSlot(slotMin, phases) {
  for (const [name, { start, end }] of Object.entries(phases)) {
    if (slotMin >= start && slotMin < end) return name;
  }
  return "CLOSE";
}

function assignSupervisorTask(phase, slotMin, ti, phases, matrix, config, breakTracker, maxConcurrent, t) {
  switch (phase) {
    case "OPEN": return "feed";
    case "PREP": return ti % 4 < 2 ? "lgdc" : "float";
    case "CORE": {
      // SUP break early in core
      const coreStart = phases.CORE.start;
      if (slotMin === coreStart + 30 || slotMin === coreStart + 45) {
        const breaksThisSlot = breakTracker.filter(b => b === t).length;
        if (breaksThisSlot < maxConcurrent) { breakTracker.push(t); return "break"; }
      }
      return slotMin % 60 < 30 ? "float" : "lgdc";
    }
    case "LATE_AM": return "disinfect";
    case "PM_CORE": return ti % 4 < 2 ? "float" : "lgdc";
    case "PM_MID": return "float";
    case "WINDDOWN": return "feed";
    case "CLOSE": return "eod";
    default: return "float";
  }
}

function assignCrewTask(phase, slotMin, ti, li, lanes, strategy, matrix, config, hasBaths, ppDogs, hasSup, breakTracker, maxConcurrent, t, solverInputs) {
  const crewLaneCount = lanes.filter(l => !l.startsWith("SUP")).length;
  const hasSmallDaycare = solverInputs.peak_small_daycare > 0;

  switch (phase) {
    case "OPEN": {
      if (strategy === "full_pod_pass") return "opening";
      // Split: last crew member does PP pod pass, rest do group let-outs
      if (ppDogs > 0 && li === crewLaneCount - 1) return "pp";
      return "opening";
    }
    case "PREP": {
      if (li === 0) return "transport";
      if (li === 1 && hasBaths) return "bath";
      if (li === 2) return "room_clean";
      return hasSmallDaycare ? "smdc" : "lgdc";
    }
    case "CORE": {
      // Rotating daycare coverage + PP + baths + staggered breaks
      return assignCoreTask(slotMin, ti, li, crewLaneCount, ppDogs, hasBaths, matrix, breakTracker, maxConcurrent, t);
    }
    case "LATE_AM": {
      if (li === 0) return "lgdc";
      if (li === 1) return hasSmallDaycare ? "smdc" : "lgdc";
      if (li === 2) return ppDogs > 0 ? "pp" : "foam";
      return "disinfect";
    }
    case "PM_CORE": {
      // Afternoon core: daycare + PP + float
      if (li === 0) return "lgdc";
      if (li === 1) return hasSmallDaycare ? "smdc" : "lgdc";
      if (li === 2 && ppDogs > 0) return "pp";
      return "housekeeping";
    }
    case "PM_MID": {
      // Mid-PM: housekeeping + breaks
      return assignPmMidTask(slotMin, ti, li, crewLaneCount, breakTracker, maxConcurrent, t);
    }
    case "WINDDOWN": {
      if (li === 0) return "lgdc";
      if (li <= 2) return "transport";
      return "feed";
    }
    case "CLOSE": {
      if (li === 0) return "lgdc";
      if (li === 1) return "smdc";
      return "eod";
    }
    default: return "float";
  }
}

function assignCoreTask(slotMin, ti, li, crewCount, ppDogs, hasBaths, matrix, breakTracker, maxConcurrent, t) {
  // Hour-based rotation within core (every 4 slots = 1 hour)
  const hourBlock = Math.floor(ti / 4) % 4;
  const breakSlot = (li * 4 + 2) % (crewCount * 4); // Stagger breaks across crew
  const isBreakSlot = (ti % (crewCount * 4)) === breakSlot && slotMin % 60 === 0;

  if (isBreakSlot) {
    const breaksThisSlot = breakTracker.filter(b => b === t).length;
    if (breaksThisSlot < maxConcurrent) {
      breakTracker.push(t);
      return "break";
    }
  }

  // LGDC always covered by first person
  if (li === 0) return "lgdc";

  // SMDC always covered by second person when small dogs exist
  if (li === 1 && (matrix.daycare_small || 0) > 0) return "smdc";

  // PP on designated slots
  if (ppDogs > 0 && li === Math.min(2, crewCount - 1)) {
    // PP rounds: one hour on, one hour off
    if (hourBlock % 2 === 0) return "pp";
    return hasBaths ? "bath" : "foam";
  }

  // Bath worker
  if (hasBaths && hourBlock < 2 && li === Math.min(3, crewCount - 1)) return "bath";

  // Rotation for remaining crew
  return hourBlock % 2 === 0 ? "lgdc" : "housekeeping";
}

function assignPmMidTask(slotMin, ti, li, crewCount, breakTracker, maxConcurrent, t) {
  const breakSlot = (li * 4 + 2) % (crewCount * 4);
  const isBreakSlot = (ti % (crewCount * 4)) === breakSlot;

  if (isBreakSlot) {
    const breaksThisSlot = breakTracker.filter(b => b === t).length;
    if (breaksThisSlot < maxConcurrent) {
      breakTracker.push(t);
      return "break";
    }
  }

  if (li === 0) return "lgdc";
  if (li === 1) return "smdc";
  return "housekeeping";
}

// ─── Constraint Validator ────────────────────────────────────────────────────

/**
 * Validate a generated grid against hard constraints.
 * Returns { valid, violations[] }.
 */
export function validateGrid(grid, lanes, slots, matrix, config) {
  const violations = [];
  const solverInputs = getMatrixSolverInputs(matrix);
  const weekend = isWeekend(matrix.matrix_date);
  const siteHours = weekend ? config.weekend_site_hours : config.weekday_site_hours;
  const publicHours = weekend ? config.public_hours_weekend : config.public_hours_weekday;
  const coreStartMin = timeToMinutes(weekend ? config.weekend_am_open_window[1] : config.weekday_am_open_window[1]) + 60;
  const coreEndMin = timeToMinutes(siteHours[1]) - 30;

  for (const t of slots) {
    const slotMin = timeToMinutes(t);
    const isCore = slotMin >= coreStartMin && slotMin < coreEndMin;

    // Check LGDC coverage during core hours
    if (isCore && solverInputs.peak_large_daycare > 0) {
      const lgdcCoverage = lanes.some(l => grid[l]?.[t] === "lgdc");
      if (!lgdcCoverage) {
        violations.push({ slot: t, type: "lgdc_uncovered", message: `LGDC uncovered at ${t} — hard constraint violation` });
      }
    }

    // Check SMDC coverage during core hours
    if (isCore && solverInputs.peak_small_daycare > 0) {
      const smdcCoverage = lanes.some(l => grid[l]?.[t] === "smdc");
      if (!smdcCoverage) {
        violations.push({ slot: t, type: "smdc_uncovered", message: `SMDC uncovered at ${t} — hard constraint violation` });
      }
    }

    // Check break concurrency
    const breaksInSlot = lanes.filter(l => grid[l]?.[t] === "break").length;
    const teamSize = lanes.length;
    const maxBreaks = teamSize >= (config.large_team_threshold || 6)
      ? (config.max_breaks_large_team || 2)
      : (config.max_breaks_small_team || 1);
    if (breaksInSlot > maxBreaks) {
      violations.push({ slot: t, type: "break_concurrency", message: `${breaksInSlot} people on break at ${t} exceeds max of ${maxBreaks}` });
    }

    // Check CSR prep protection
    const publicOpenMin = timeToMinutes(publicHours[0]);
    if (slotMin >= publicOpenMin - 30 && slotMin < publicOpenMin) {
      const csrLanes = lanes.filter(l => l.startsWith("CSR"));
      const csrOnBackend = csrLanes.filter(l => grid[l]?.[t] && grid[l][t] !== "float");
      if (csrOnBackend.length === csrLanes.length && csrLanes.length > 0) {
        violations.push({ slot: t, type: "csr_prep_violation", message: `All CSRs assigned backend work at ${t} — no CSR available for front-desk prep` });
      }
    }
  }

  return { valid: violations.length === 0, violations };
}

// ─── Schedule Serialization (for persistence to rotation_schedules) ──────────

/**
 * Serialize a generated schedule for storage in rotation_schedules table.
 */
export function serializeSchedule(matrix, staffPlan, daySummary, config) {
  const shiftEntries = getShiftEntries(staffPlan);
  return {
    location_id: matrix.location_id,
    schedule_date: matrix.matrix_date,
    shift: "full",
    staff_input: {
      pct_count: staffPlan.pct_count,
      csr_count: staffPlan.csr_count,
      supervisor_count: staffPlan.supervisor_count || 0,
      mod_count: staffPlan.mod_count || 0,
      supervisor_present: staffPlan.supervisor_present,
      allow_csr_as_pct: staffPlan.allow_csr_as_pct,
      allow_mod_as_pct: staffPlan.allow_mod_as_pct,
      staff_names: shiftEntries,
    },
    dog_metrics: {
      boarding_large: matrix.boarding_large,
      boarding_small: matrix.boarding_small,
      boarding_unknown_size: matrix.boarding_unknown_size,
      daycare_large: matrix.daycare_large,
      daycare_small: matrix.daycare_small,
      pp_overnight_boarders: matrix.pp_overnight_boarders,
      pp_dayboarders: matrix.pp_dayboarders,
      departure_baths: matrix.departure_baths,
      feeding_dogs: matrix.feeding_dogs,
      medication_dogs: matrix.medication_dogs,
      gross_dogs_in_building: matrix.gross_dogs_in_building,
    },
    assumptions_snapshot: { ...SCHEDULE_CONFIG_DEFAULTS, ...config },
    time_slots: daySummary.grid?.slots || [],
    persons: daySummary.grid?.lanes || [],
    grid: daySummary.grid?.grid || {},
    warnings: daySummary.warnings || [],
    violations: daySummary.violations || [],
    overrides: [],
    explanation: {
      headcount: daySummary.required,
      opening: daySummary.openingResult,
      lines: daySummary.explanation,
      demand_mode: daySummary.demandMode || "current",
      schedule_kind: daySummary.scheduleKind || "staff_adjusted",
    },
    generated_at: new Date().toISOString(),
  };
}

/**
 * Apply a single cell override to a grid. Returns a new grid (immutable).
 */
export function applyOverride(grid, lane, slot, newTask, notes) {
  const newGrid = {};
  for (const l of Object.keys(grid)) {
    newGrid[l] = { ...grid[l] };
  }
  const previousCell = newGrid[lane]?.[slot] || null;
  const previousTask = typeof previousCell === "string" ? previousCell : previousCell?.task || null;
  if (newGrid[lane]) {
    const existingCell = newGrid[lane][slot];
    newGrid[lane][slot] = typeof existingCell === "object" && existingCell !== null
      ? { ...existingCell, task: newTask, notes: notes || "" }
      : { task: newTask, notes: notes || "" };
  }
  return {
    grid: newGrid,
    override: {
      lane,
      slot,
      previous_task: previousTask,
      new_task: newTask,
      notes: notes || "",
      applied_at: new Date().toISOString(),
    },
  };
}

// ─── Build Full Day Summary ───────────────────────────────────────────────

/**
 * Build a complete day analysis from matrix + staff plan + config.
 * Returns everything the UI needs for one day.
 */
export function buildDaySummary(matrix, staffPlan, config, options = {}) {
  const mergedConfig = { ...SCHEDULE_CONFIG_DEFAULTS, ...config };
  const demandMode = resolveDemandMode(matrix, options.demandMode || "current");
  const trust = getMatrixTrust(matrix);
  const solverInputs = getDemandSolverInputs(matrix, demandMode);
  const generationBlockers = getMatrixBlockers(matrix);
  const canGenerate = canGenerateSchedule(matrix);
  const required = computeRequiredHeadcount(matrix, mergedConfig, { demandMode });
  const effectiveStaffPlan = staffPlan || (canGenerate && options.autoPlan !== false ? buildOptimalStaffPlan(matrix, required, mergedConfig) : null);
  const staffStatus = computeStaffingStatus(required, effectiveStaffPlan, mergedConfig, matrix?.matrix_date);
  const openingResult = effectiveStaffPlan && canGenerate ? solveOpening(matrix, effectiveStaffPlan, mergedConfig, { demandMode }) : null;

  // Generate full-day grid (AM + PM) instead of just opening
  const gridResult = effectiveStaffPlan && canGenerate
    ? generateFullDayGrid(matrix, effectiveStaffPlan, openingResult, mergedConfig)
    : null;

  // Validate the grid
  let violations = [];
  if (gridResult) {
    const validation = validateGrid(gridResult.grid, gridResult.lanes, gridResult.slots, matrix, mergedConfig);
    violations = validation.violations;
  }

  const allWarnings = [...required.warnings, ...(staffStatus.warnings || []), ...(openingResult?.warnings || []), ...generationBlockers];

  return {
    matrix,
    staffPlan: effectiveStaffPlan,
    inputStaffPlan: staffPlan,
    trust,
    solverInputs,
    generationBlockers,
    canGenerate,
    demandMode,
    required,
    staffStatus,
    openingResult,
    grid: gridResult,
    violations,
    scheduleKind: staffPlan ? "staff_adjusted" : "optimal",
    warnings: allWarnings,
    explanation: [
      ...(required.explanation || []),
      ...(openingResult?.explanation || []),
      openingResult?.selectedReason || "",
    ].filter(Boolean),
  };
}
