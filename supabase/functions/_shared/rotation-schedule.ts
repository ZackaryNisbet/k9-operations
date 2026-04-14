export const ROTATION_SCHEDULE_DEFAULTS = {
  weekday_am_open_window: ["06:00", "07:00"],
  weekend_am_open_window: ["07:00", "09:00"],
  weekday_site_hours: ["06:00", "19:30"],
  weekend_site_hours: ["07:00", "18:00"],
  public_hours_weekday: ["07:00", "19:00"],
  public_hours_weekend: ["09:00", "18:00"],
  opening_shift_end_weekday: "13:00",
  opening_shift_end_weekend: "13:00",
  closing_shift_start: "13:00",
  closing_shift_end_weekday: "19:30",
  closing_shift_end_weekend: "18:00",
  daycare_ratio_large: 25,
  daycare_ratio_small: 25,
  group_transport_minutes_each_way: 2,
  morning_room_clean_minutes: 2.5,
  private_play_move_minutes_each_way: 1.5,
  bath_active_minutes: 15,
  feeding_minutes_per_dog: 1.5,
  medication_minutes_per_dog: 2,
  break_minutes: 30,
  room_mess_rate_default: 0.2,
  pod_pass_dogs_per_trip: 1.5,
};

export const ROTATION_TASK_DEFINITIONS: Record<string, { label: string }> = {
  opening: { label: "Opening Let-Outs" },
  lgdc: { label: "Large Daycare" },
  smdc: { label: "Small Daycare" },
  pp: { label: "Private Play" },
  bath: { label: "Bath" },
  transport: { label: "Transport" },
  room_clean: { label: "Room Clean" },
  housekeeping: { label: "Housekeeping" },
  disinfect: { label: "Disinfect" },
  feed: { label: "Feed / Meds" },
  break: { label: "Break" },
  float: { label: "Float / Available" },
  lobby: { label: "Lobby" },
  manager_coverage: { label: "Manager Coverage" },
  admin: { label: "Paperwork / Admin" },
  feeding_report: { label: "Feeding Report" },
  eod: { label: "Close / End of Day" },
  off: { label: "Off Shift" },
};

type ShiftEntry = {
  id: string;
  position: string;
  name: string;
  shift_start: string;
  shift_end: string;
};

type RotationLane = {
  id: string;
  label: string;
  position: string;
  name: string;
  shift_start: string;
  shift_end: string;
};

type RotationSlot = {
  time: string;
  label: string;
  interval_minutes: number;
  segment: "pre_open" | "open_day";
};

type RotationCell = {
  task: string;
  label: string;
  detail?: string;
  notes?: string;
};

type RotationWorkloadItem = {
  key: string;
  label: string;
  value: string;
  math?: string;
  note?: string;
};

type RotationShiftRecommendation = {
  label: string;
  start: string;
  end: string;
  headcount: number;
  role_label: string;
  scheduled_hours: number;
  working_hours_after_breaks: number;
  break_minutes_per_shift: number;
};

type RotationPayload = {
  schedule_kind: "optimal" | "actual_staffing";
  shift_recommendations: {
    opening_shift: RotationShiftRecommendation;
    closing_shift: RotationShiftRecommendation;
  };
  peak_active_coverage: {
    count: number;
    start: string;
    end: string;
    note: string;
  };
  workload_breakdown: RotationWorkloadItem[];
  grid: {
    lanes: RotationLane[];
    slots: RotationSlot[];
    cells: Record<string, Record<string, RotationCell>>;
  };
  warnings: string[];
  notes: string[];
  saveable_payload: Record<string, unknown>;
};

function toNumber(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toNullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function timeToMinutes(timeStr: string) {
  const [hours, minutes] = String(timeStr || "00:00").split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

export function minutesToTime(totalMinutes: number) {
  const minutes = Math.max(0, Math.round(Number(totalMinutes) || 0));
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

function addMinutes(timeStr: string, minutes: number) {
  return minutesToTime(timeToMinutes(timeStr) + minutes);
}

export function isWeekend(dateStr: string) {
  const d = new Date(`${dateStr}T12:00:00`);
  return d.getDay() === 0 || d.getDay() === 6;
}

function formatTimeLabel(timeStr: string) {
  const [hours, minutes] = timeStr.split(":").map(Number);
  const suffix = hours >= 12 ? "PM" : "AM";
  const h12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${h12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function getNestedValue(obj: any, key: string) {
  return key.split(".").reduce((acc, part) => acc?.[part], obj);
}

export function normalizeRotationConfig(config: Record<string, any> = {}) {
  return {
    ...ROTATION_SCHEDULE_DEFAULTS,
    ...config,
    weekday_site_hours: config.weekday_site_hours || ROTATION_SCHEDULE_DEFAULTS.weekday_site_hours,
    weekend_site_hours: config.weekend_site_hours || ROTATION_SCHEDULE_DEFAULTS.weekend_site_hours,
    weekday_am_open_window: config.weekday_am_open_window || ROTATION_SCHEDULE_DEFAULTS.weekday_am_open_window,
    weekend_am_open_window: config.weekend_am_open_window || ROTATION_SCHEDULE_DEFAULTS.weekend_am_open_window,
    public_hours_weekday: config.public_hours_weekday || ROTATION_SCHEDULE_DEFAULTS.public_hours_weekday,
    public_hours_weekend: config.public_hours_weekend || ROTATION_SCHEDULE_DEFAULTS.public_hours_weekend,
  };
}

function getMatrixDisplay(matrix: any) {
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
    ?? Object.values(opening).reduce((sum, value) => sum + toNumber(value, 0), 0);

  const closing = {
    large_boarding: toNullableNumber(display.closing?.large_boarding) ?? opening.large_boarding,
    small_boarding: toNullableNumber(display.closing?.small_boarding) ?? opening.small_boarding,
    private_play_boarding: toNullableNumber(display.closing?.private_play_boarding) ?? opening.private_play_boarding,
    half_and_half_boarding: toNullableNumber(display.closing?.half_and_half_boarding) ?? opening.half_and_half_boarding,
    evaluation_boarding: toNullableNumber(display.closing?.evaluation_boarding) ?? opening.evaluation_boarding,
    unclassified_boarding: toNullableNumber(display.closing?.unclassified_boarding) ?? opening.unclassified_boarding,
  };
  closing.total_boarding = toNullableNumber(display.closing?.total_boarding)
    ?? Object.values(closing).reduce((sum, value) => sum + toNumber(value, 0), 0);

  const daycare = {
    evaluations: toNullableNumber(display.daycare?.evaluations) ?? toNumber(matrix?.evaluations, 0),
    private_play_dayboarding: toNullableNumber(display.daycare?.private_play_dayboarding) ?? toNumber(matrix?.pp_dayboarders, 0),
    half_and_half_daytime: toNullableNumber(display.daycare?.half_and_half_daytime) ?? 0,
    large_daycare: toNullableNumber(display.daycare?.large_daycare) ?? toNumber(matrix?.daycare_large, 0),
    small_daycare: toNullableNumber(display.daycare?.small_daycare) ?? toNumber(matrix?.daycare_small, 0),
    unclassified_daycare: toNullableNumber(display.daycare?.unclassified_daycare) ?? toNumber(matrix?.daycare_unknown_size, 0),
  };
  daycare.total_daycare = toNullableNumber(display.daycare?.total_daycare)
    ?? Object.values(daycare).reduce((sum, value) => sum + toNumber(value, 0), 0);

  const support = {
    departure_baths: toNullableNumber(display.support?.departure_baths) ?? toNumber(matrix?.departure_baths, 0),
    morning_feeding_dogs: toNullableNumber(display.support?.morning_feeding_dogs) ?? opening.total_boarding,
    evening_feeding_dogs: toNullableNumber(display.support?.evening_feeding_dogs) ?? toNumber(matrix?.feeding_dogs, closing.total_boarding),
    medication_dogs: toNullableNumber(display.support?.medication_dogs) ?? toNumber(matrix?.medication_dogs, 0),
    total_dog_volume: toNullableNumber(display.support?.total_dog_volume) ?? (closing.total_boarding + daycare.total_daycare),
    tours: toNullableNumber(display.support?.tours) ?? toNumber(matrix?.tours, 0),
  };

  return { opening, closing, daycare, support };
}

function getMatrixProjectedDisplay(matrix: any) {
  const projected = matrix?.detail_json?.projection?.display;
  if (!projected) return getMatrixDisplay(matrix);
  return {
    opening: {
      large_boarding: toNumber(projected.opening?.large_boarding, 0),
      small_boarding: toNumber(projected.opening?.small_boarding, 0),
      private_play_boarding: toNumber(projected.opening?.private_play_boarding, 0),
      half_and_half_boarding: toNumber(projected.opening?.half_and_half_boarding, 0),
      evaluation_boarding: toNumber(projected.opening?.evaluation_boarding, 0),
      unclassified_boarding: toNumber(projected.opening?.unclassified_boarding, 0),
      total_boarding: toNumber(projected.opening?.total_boarding, 0),
    },
    closing: {
      large_boarding: toNumber(projected.closing?.large_boarding, 0),
      small_boarding: toNumber(projected.closing?.small_boarding, 0),
      private_play_boarding: toNumber(projected.closing?.private_play_boarding, 0),
      half_and_half_boarding: toNumber(projected.closing?.half_and_half_boarding, 0),
      evaluation_boarding: toNumber(projected.closing?.evaluation_boarding, 0),
      unclassified_boarding: toNumber(projected.closing?.unclassified_boarding, 0),
      total_boarding: toNumber(projected.closing?.total_boarding, 0),
    },
    daycare: {
      evaluations: toNumber(projected.daycare?.evaluations, 0),
      private_play_dayboarding: toNumber(projected.daycare?.private_play_dayboarding, 0),
      half_and_half_daytime: toNumber(projected.daycare?.half_and_half_daytime, 0),
      large_daycare: toNumber(projected.daycare?.large_daycare, 0),
      small_daycare: toNumber(projected.daycare?.small_daycare, 0),
      unclassified_daycare: toNumber(projected.daycare?.unclassified_daycare, 0),
      total_daycare: toNumber(projected.daycare?.total_daycare, 0),
    },
    support: {
      departure_baths: toNumber(projected.support?.departure_baths, 0),
      morning_feeding_dogs: toNumber(projected.support?.morning_feeding_dogs, 0),
      evening_feeding_dogs: toNumber(projected.support?.evening_feeding_dogs, 0),
      medication_dogs: toNumber(projected.support?.medication_dogs, 0),
      total_dog_volume: toNumber(projected.support?.total_dog_volume, 0),
      tours: toNumber(projected.support?.tours, 0),
    },
  };
}

function getDemandDisplay(matrix: any) {
  const projectionState = matrix?.detail_json?.projection?.state;
  return projectionState === "projected" ? getMatrixProjectedDisplay(matrix) : getMatrixDisplay(matrix);
}

function getProjectionSummary(matrix: any) {
  const explanation = matrix?.detail_json?.projection?.explanations?.support_total_dog_volume;
  if (!explanation) return null;
  const leadDays = toNumber(explanation.lead_days, 0);
  const asOf = toNumber(explanation.exact_prior_year_as_of, 0);
  const final = toNumber(explanation.exact_prior_year_final, 0);
  const completionRate = final > 0 ? Math.round((asOf / final) * 100) : null;
  return {
    lead_days: leadDays,
    sentence: final > 0
      ? `${leadDays} days out. On this same date last year, ${asOf} of ${final} final dogs were already booked by this point (${completionRate}%).`
      : `${leadDays} days out. Projected demand uses historical booking pace from prior-year Gingr reservations.`,
  };
}

export function getStructuredShiftEntries(staffPlan: any): ShiftEntry[] {
  const rawEntries = Array.isArray(staffPlan?.staff_names)
    ? staffPlan.staff_names
    : Array.isArray(staffPlan?.shift_entries)
      ? staffPlan.shift_entries
      : [];

  return rawEntries
    .map((entry: any, index: number) => {
      if (!entry || typeof entry !== "object") return null;
      const position = String(entry.position || "pct").toLowerCase().trim();
      const shiftStart = String(entry.shift_start || "").slice(0, 5);
      const shiftEnd = String(entry.shift_end || "").slice(0, 5);
      if (!shiftStart || !shiftEnd) return null;
      return {
        id: String(entry.id || `${position}-${index + 1}-${shiftStart}-${shiftEnd}`),
        position,
        name: String(entry.name || "").trim(),
        shift_start: shiftStart,
        shift_end: shiftEnd,
      };
    })
    .filter(Boolean) as ShiftEntry[];
}

function estimatePodPassMinutesPerDog(config: any) {
  const moveMinutes = toNumber(config.private_play_move_minutes_each_way, 1.5);
  const messRate = toNumber(config.room_mess_rate_default, 0.2);
  const cleanMinutes = toNumber(config.morning_room_clean_minutes, 2.5);
  const dogsPerTrip = Math.max(1, toNumber(config.pod_pass_dogs_per_trip, 1.5));
  return ((moveMinutes * 2) / dogsPerTrip) + (messRate * cleanMinutes);
}

function safeCoverage(count: number, ratio: number) {
  if (count <= 0) return 0;
  return Math.ceil(count / Math.max(1, ratio));
}

function buildWorkloadModel(matrix: any, config: any) {
  const display = getDemandDisplay(matrix);
  const weekend = isWeekend(matrix.matrix_date);
  const openWindow = weekend ? config.weekend_am_open_window : config.weekday_am_open_window;
  const publicOpen = openWindow[1];
  const openingTarget = addMinutes(publicOpen, -10);
  const availableOpenMinutes = Math.max(10, timeToMinutes(openingTarget) - timeToMinutes(openWindow[0]));

  const totalOvernight = toNumber(display.opening.total_boarding, 0);
  const privatePlayDogs = toNumber(display.opening.private_play_boarding, 0) + toNumber(display.opening.half_and_half_boarding, 0);
  const groupDogs = Math.max(
    0,
    totalOvernight
      - privatePlayDogs
      - toNumber(display.opening.evaluation_boarding, 0),
  );
  const largeDaycare = toNumber(display.daycare.large_daycare, 0);
  const smallDaycare = toNumber(display.daycare.small_daycare, 0);
  const unresolvedDogs = toNumber(display.opening.unclassified_boarding, 0) + toNumber(display.daycare.unclassified_daycare, 0);
  const departureBaths = toNumber(display.support.departure_baths, 0);
  const eveningFeedingDogs = toNumber(display.support.evening_feeding_dogs, 0);
  const medicationDogs = toNumber(display.support.medication_dogs, 0);
  const departures = toNumber(matrix?.dogs_departing, 0);

  const openingStrategy = totalOvernight > 24 ? "group let-outs + PP pod pass" : "full pod pass";
  const podPassMinutes = estimatePodPassMinutesPerDog(config);
  const openingLetoutStaffMinutes = openingStrategy === "group let-outs + PP pod pass"
    ? groupDogs * ((toNumber(config.group_transport_minutes_each_way, 2) * 2) + (toNumber(config.room_mess_rate_default, 0.2) * toNumber(config.morning_room_clean_minutes, 2.5)))
    : totalOvernight * podPassMinutes;
  const privatePlayStaffMinutes = privatePlayDogs * podPassMinutes;
  const roomCleanMinutes = totalOvernight * toNumber(config.room_mess_rate_default, 0.2) * toNumber(config.morning_room_clean_minutes, 2.5);
  const bathMinutes = departureBaths * toNumber(config.bath_active_minutes, 15);
  const peakCoverage = safeCoverage(largeDaycare, toNumber(config.daycare_ratio_large, 25))
    + safeCoverage(smallDaycare, toNumber(config.daycare_ratio_small, 25))
    + (privatePlayDogs + toNumber(display.daycare.private_play_dayboarding, 0) + toNumber(display.daycare.half_and_half_daytime, 0) > 0 ? 1 : 0)
    + (departureBaths > 6 ? 1 : 0)
    + (unresolvedDogs > 0 ? 1 : 0);
  const peakWindow = weekend ? { start: "10:00", end: "13:00" } : { start: "09:00", end: "13:00" };
  const closingOperationalMinutes =
    (departures * toNumber(config.group_transport_minutes_each_way, 2) * 2)
    + (eveningFeedingDogs * toNumber(config.feeding_minutes_per_dog, 1.5))
    + (medicationDogs * toNumber(config.medication_minutes_per_dog, 2));

  const openingBaseWorkers = Math.max(
    Math.ceil(openingLetoutStaffMinutes / availableOpenMinutes) + (privatePlayDogs > 0 && openingStrategy === "group let-outs + PP pod pass" ? Math.ceil(privatePlayStaffMinutes / availableOpenMinutes) : 0),
    Math.ceil(roomCleanMinutes / 120),
    peakCoverage,
  );

  const openingBathWorkers = departureBaths > 0 ? Math.max(1, Math.ceil(bathMinutes / 180)) : 0;
  const openingHeadcount = Math.max(1, openingBaseWorkers + openingBathWorkers);
  const closingHeadcount = Math.max(
    1,
    peakCoverage,
    Math.ceil(closingOperationalMinutes / 180),
  );

  return {
    display,
    openingStrategy,
    openingTarget,
    availableOpenMinutes,
    totalOvernight,
    privatePlayDogs,
    groupDogs,
    largeDaycare,
    smallDaycare,
    unresolvedDogs,
    departureBaths,
    eveningFeedingDogs,
    medicationDogs,
    departures,
    openingLetoutStaffMinutes,
    privatePlayStaffMinutes,
    roomCleanMinutes,
    bathMinutes,
    peakCoverage,
    peakWindow,
    closingOperationalMinutes,
    openingHeadcount,
    closingHeadcount,
  };
}

function buildWorkloadBreakdown(matrix: any, config: any, workload: ReturnType<typeof buildWorkloadModel>): RotationWorkloadItem[] {
  const projectionSummary = getProjectionSummary(matrix);
  return [
    {
      key: "overnight_opening",
      label: "Overnight opening dogs",
      value: `${workload.totalOvernight} dogs`,
    },
    {
      key: "opening_strategy",
      label: "Opening strategy",
      value: workload.openingStrategy === "full pod pass" ? "Full pod pass" : "Group let-outs + PP pod pass",
      note: projectionSummary?.sentence,
    },
    {
      key: "opening_letouts",
      label: "Opening let-out workload",
      value: `${Math.round(workload.openingLetoutStaffMinutes)} staff-minutes`,
      math: `${Math.round(workload.openingLetoutStaffMinutes)} ÷ ${workload.availableOpenMinutes} = ${(workload.openingLetoutStaffMinutes / workload.availableOpenMinutes).toFixed(2)} before baths / PP / room cleans`,
      note: `Must finish by ${formatTimeLabel(workload.openingTarget)}.`,
    },
    {
      key: "baths",
      label: "Bath workload",
      value: `${workload.departureBaths} baths`,
      math: `${Math.round(workload.bathMinutes)} active bath minutes`,
      note: workload.departureBaths > 0 ? `${Math.max(1, Math.ceil(workload.bathMinutes / 180))} opening bath lane(s) needed.` : "No dedicated opening bath lane needed.",
    },
    {
      key: "private_play",
      label: "Private-play morning workload",
      value: `${workload.privatePlayDogs} dogs`,
      math: `${Math.round(workload.privatePlayStaffMinutes)} staff-minutes`,
    },
    {
      key: "room_cleans",
      label: "Morning room-clean workload",
      value: `${Math.round(workload.roomCleanMinutes)} staff-minutes`,
      math: `${workload.totalOvernight} × ${(toNumber(config.room_mess_rate_default, 0.2) * toNumber(config.morning_room_clean_minutes, 2.5)).toFixed(1)} = ${Math.round(workload.roomCleanMinutes)}`,
    },
    {
      key: "peak_daycare",
      label: "Peak daytime daycare coverage",
      value: `${workload.peakCoverage} people`,
      math: `${workload.largeDaycare} LG ÷ ${config.daycare_ratio_large} + ${workload.smallDaycare} SM ÷ ${config.daycare_ratio_small} + PP / baths coverage`,
      note: `Peak active coverage reaches ${workload.peakCoverage} people between ${formatTimeLabel(workload.peakWindow.start)}–${formatTimeLabel(workload.peakWindow.end)}. This is already absorbed into the opening and closing shift recommendations.`,
    },
    {
      key: "closing",
      label: "Closing transport / feed / meds",
      value: `${Math.round(workload.closingOperationalMinutes)} staff-minutes`,
      math: `${workload.departures} departures + ${workload.eveningFeedingDogs} evening feeds + ${workload.medicationDogs} meds`,
    },
  ];
}

function getShiftLaborSummary(headcount: number, start: string, end: string, config: any) {
  const scheduledHours = (timeToMinutes(end) - timeToMinutes(start)) / 60;
  const breakMinutesPerShift = scheduledHours >= 6 ? toNumber(config.break_minutes, 30) : 0;
  const workingHoursPerShift = Math.max(0, scheduledHours - (breakMinutesPerShift / 60));
  return {
    role_label: "Dedicated backend PCTs",
    scheduled_hours: Number((headcount * scheduledHours).toFixed(1)),
    working_hours_after_breaks: Number((headcount * workingHoursPerShift).toFixed(1)),
    break_minutes_per_shift: breakMinutesPerShift,
  };
}

function getOpeningShiftFrame(matrixDate: string, config: any) {
  if (isWeekend(matrixDate)) {
    return {
      start: config.weekend_site_hours[0],
      end: config.opening_shift_end_weekend || ROTATION_SCHEDULE_DEFAULTS.opening_shift_end_weekend,
    };
  }
  return {
    start: config.weekday_site_hours[0],
    end: config.opening_shift_end_weekday || ROTATION_SCHEDULE_DEFAULTS.opening_shift_end_weekday,
  };
}

function getClosingShiftFrame(matrixDate: string, config: any) {
  return isWeekend(matrixDate)
    ? {
      start: config.closing_shift_start || ROTATION_SCHEDULE_DEFAULTS.closing_shift_start,
      end: config.closing_shift_end_weekend || ROTATION_SCHEDULE_DEFAULTS.closing_shift_end_weekend,
    }
    : {
      start: config.closing_shift_start || ROTATION_SCHEDULE_DEFAULTS.closing_shift_start,
      end: config.closing_shift_end_weekday || ROTATION_SCHEDULE_DEFAULTS.closing_shift_end_weekday,
    };
}

function buildOptimalShiftEntries(matrix: any, config: any, workload: ReturnType<typeof buildWorkloadModel>) {
  const openingFrame = getOpeningShiftFrame(matrix.matrix_date, config);
  const closingFrame = getClosingShiftFrame(matrix.matrix_date, config);
  const supervisorEntry: ShiftEntry = {
    id: "optimal-supervisor-support",
    position: "supervisor",
    name: "Optimal Supervisor",
    shift_start: openingFrame.start,
    shift_end: openingFrame.end,
  };
  const openingEntries: ShiftEntry[] = Array.from({ length: workload.openingHeadcount }, (_, index) => ({
    id: `optimal-opening-${index + 1}`,
    position: "pct",
    name: `Optimal Pet Care Technician ${index + 1}`,
    shift_start: openingFrame.start,
    shift_end: openingFrame.end,
  }));
  const closingEntries: ShiftEntry[] = Array.from({ length: workload.closingHeadcount }, (_, index) => ({
    id: `optimal-closing-${index + 1}`,
    position: "pct",
    name: `Optimal Closing Technician ${index + 1}`,
    shift_start: closingFrame.start,
    shift_end: closingFrame.end,
  }));
  return [supervisorEntry, ...openingEntries, ...closingEntries];
}

function getPositionLabel(position: string) {
  switch (position) {
    case "supervisor":
      return "Supervisor";
    case "csr":
      return "Customer Service Representative";
    case "mod":
      return "Manager on Duty";
    default:
      return "Pet Care Technician";
  }
}

function buildLaneFromEntry(entry: ShiftEntry, index: number): RotationLane {
  const label = entry.name
    ? `${getPositionLabel(entry.position)} — ${entry.name}`
    : `${getPositionLabel(entry.position)} ${index + 1}`;
  return {
    id: entry.id || `${entry.position}-${index + 1}`,
    label,
    position: entry.position,
    name: entry.name,
    shift_start: entry.shift_start,
    shift_end: entry.shift_end,
  };
}

function buildSlots(matrixDate: string, config: any): RotationSlot[] {
  const weekend = isWeekend(matrixDate);
  const siteHours = weekend ? config.weekend_site_hours : config.weekday_site_hours;
  const openWindow = weekend ? config.weekend_am_open_window : config.weekday_am_open_window;
  const slots: RotationSlot[] = [];
  let pointer = timeToMinutes(siteHours[0]);
  const preOpenEnd = timeToMinutes(openWindow[1]);
  while (pointer < preOpenEnd) {
    const time = minutesToTime(pointer);
    slots.push({
      time,
      label: formatTimeLabel(time),
      interval_minutes: 10,
      segment: "pre_open",
    });
    pointer += 10;
  }
  const dayEnd = timeToMinutes(weekend ? config.closing_shift_end_weekend : config.closing_shift_end_weekday);
  pointer = preOpenEnd;
  while (pointer < dayEnd) {
    const time = minutesToTime(pointer);
    slots.push({
      time,
      label: formatTimeLabel(time),
      interval_minutes: 30,
      segment: "open_day",
    });
    pointer += 30;
  }
  return slots;
}

function laneIsActive(lane: RotationLane, slotTime: string) {
  const slotMinutes = timeToMinutes(slotTime);
  return slotMinutes >= timeToMinutes(lane.shift_start) && slotMinutes < timeToMinutes(lane.shift_end);
}

function getRequiredCoverageForSlot(slotTime: string, matrixDate: string, workload: ReturnType<typeof buildWorkloadModel>, config: any) {
  const openingFrame = getOpeningShiftFrame(matrixDate, config);
  const closingFrame = getClosingShiftFrame(matrixDate, config);
  const slotMinutes = timeToMinutes(slotTime);
  if (slotMinutes < timeToMinutes(openingFrame.end)) {
    return workload.openingHeadcount;
  }
  if (slotMinutes >= timeToMinutes(closingFrame.start)) {
    return workload.closingHeadcount;
  }
  return workload.peakCoverage;
}

function getBreakAssignments(lanes: RotationLane[], matrixDate: string, config: any, slots: RotationSlot[]) {
  const assignments: Record<string, string> = {};
  const daytimeSlots = slots.filter((slot) => slot.segment === "open_day").map((slot) => slot.time);
  const openingBreakStart = isWeekend(matrixDate) ? "10:30" : "10:00";
  const closingBreakStart = isWeekend(matrixDate) ? "15:00" : "15:30";

  const assignForGroup = (groupLanes: RotationLane[], startTime: string) => {
    const baseIndex = Math.max(0, daytimeSlots.findIndex((time) => time >= startTime));
    groupLanes.forEach((lane, index) => {
      const shiftMinutes = timeToMinutes(lane.shift_end) - timeToMinutes(lane.shift_start);
      if (shiftMinutes < 360) return;
      const candidate = daytimeSlots[baseIndex + index] || daytimeSlots[daytimeSlots.length - 1];
      if (candidate && candidate >= lane.shift_start && candidate < lane.shift_end) {
        assignments[lane.id] = candidate;
      }
    });
  };

  const openingLanes = lanes.filter((lane) => lane.shift_start < "13:00");
  const closingLanes = lanes.filter((lane) => lane.shift_start >= "13:00");
  assignForGroup(openingLanes, openingBreakStart);
  assignForGroup(closingLanes, closingBreakStart);
  return assignments;
}

function createCell(task: string, detail = "", notes = ""): RotationCell {
  return {
    task,
    label: ROTATION_TASK_DEFINITIONS[task]?.label || task,
    detail: detail || undefined,
    notes: notes || undefined,
  };
}

function getPreOpenTasks(slotIndex: number, totalSlots: number, workload: ReturnType<typeof buildWorkloadModel>) {
  const firstFocus = workload.groupDogs >= workload.privatePlayDogs ? (workload.largeDaycare >= workload.smallDaycare ? "Large Daycare" : "Small Daycare") : "Private Play";
  const secondFocus = firstFocus === "Large Daycare" ? "Small Daycare" : "Large Daycare";
  const halfPoint = Math.ceil(totalSlots / 2);
  if (workload.openingStrategy === "full pod pass") {
    return {
      lead: createCell("opening", "Full Pod Pass"),
      support: createCell("opening", "Transport"),
      special: workload.departureBaths > 0 && slotIndex >= halfPoint ? createCell("bath", "Opening Bath") : createCell("opening", "Pod Pass"),
    };
  }

  const leadDetail = slotIndex < halfPoint ? firstFocus : secondFocus;
  const supportDetail = slotIndex < halfPoint ? "Transport" : "Room Clean";
  return {
    lead: createCell("opening", `${leadDetail}`),
    support: createCell("opening", supportDetail),
    special: workload.privatePlayDogs > 0
      ? createCell("pp", "Pod Pass")
      : workload.departureBaths > 0 && slotIndex >= halfPoint
        ? createCell("bath", "Opening Bath")
        : createCell("opening", "Support"),
  };
}

function getSupervisorSupportTask(slotTime: string, matrixDate: string, config: any) {
  const weekend = isWeekend(matrixDate);
  const publicOpen = weekend ? config.weekend_am_open_window[1] : config.weekday_am_open_window[1];
  const slotMinutes = timeToMinutes(slotTime);
  const publicOpenMinutes = timeToMinutes(publicOpen);
  const feedEnd = publicOpenMinutes + 60;
  const reportEnd = publicOpenMinutes + 90;

  if (slotMinutes < publicOpenMinutes) {
    return createCell("manager_coverage", "Supervision / Support");
  }
  if (slotMinutes < feedEnd) {
    return createCell("feed", "Feeding / Medications");
  }
  if (slotMinutes < reportEnd) {
    return createCell("feeding_report", "Feeding Report");
  }
  return createCell("admin", "Paperwork / Admin");
}

function buildTaskPoolForHour(hourBlock: number, slotTime: string, workload: ReturnType<typeof buildWorkloadModel>, matrixDate: string, config: any) {
  const tasks: RotationCell[] = [];
  const slotMinutes = timeToMinutes(slotTime);
  const closingFrame = getClosingShiftFrame(matrixDate, config);
  const closePush = slotMinutes >= (timeToMinutes(closingFrame.end) - 120);

  if (workload.largeDaycare > 0) tasks.push(createCell("lgdc"));
  if (workload.smallDaycare > 0) tasks.push(createCell("smdc"));
  if (workload.privatePlayDogs > 0 || toNumber(workload.display.daycare.private_play_dayboarding, 0) > 0) {
    tasks.push(createCell("pp", hourBlock % 2 === 0 ? "Round" : "Pod Pass"));
  }

  if (closePush) {
    tasks.push(createCell("transport", "Closing Transport"));
    tasks.push(createCell("feed", "Evening Feed / Meds"));
    tasks.push(createCell("eod", "Closing Reset"));
  } else if (slotMinutes < timeToMinutes("10:00")) {
    if (workload.departureBaths > 0) tasks.push(createCell("bath", "Departure Baths"));
    tasks.push(createCell("room_clean", "Morning Rooms"));
    tasks.push(createCell("transport", "Opening Reset"));
  } else if (slotMinutes < timeToMinutes("13:00")) {
    tasks.push(createCell("housekeeping", "Disinfect"));
    tasks.push(createCell("float", "Coverage"));
  } else {
    tasks.push(createCell("housekeeping", "Laundry / Housekeeping"));
    tasks.push(createCell("disinfect", "Disinfect"));
  }

  return tasks;
}

function detectConsecutiveTaskWarnings(cells: Record<string, Record<string, RotationCell>>, slots: RotationSlot[], lanes: RotationLane[]) {
  const warnings: string[] = [];
  const slotMinutesByTime = new Map(slots.map((slot) => [slot.time, slot.interval_minutes]));
  for (const lane of lanes) {
    let currentTask = "";
    let currentMinutes = 0;
    for (const slot of slots) {
      const task = cells[lane.id]?.[slot.time]?.task || "off";
      if (task === currentTask) {
        currentMinutes += slot.interval_minutes;
      } else {
        if (currentTask && currentMinutes > 120 && ["lgdc", "smdc", "pp", "bath"].includes(currentTask)) {
          warnings.push(`${lane.label} stays on ${ROTATION_TASK_DEFINITIONS[currentTask]?.label || currentTask} for ${currentMinutes} minutes. Consider rotating earlier.`);
        }
        currentTask = task;
        currentMinutes = slotMinutesByTime.get(slot.time) || slot.interval_minutes;
      }
    }
    if (currentTask && currentMinutes > 120 && ["lgdc", "smdc", "pp", "bath"].includes(currentTask)) {
      warnings.push(`${lane.label} stays on ${ROTATION_TASK_DEFINITIONS[currentTask]?.label || currentTask} for ${currentMinutes} minutes. Consider rotating earlier.`);
    }
  }
  return warnings;
}

function buildWarnings(matrix: any, workload: ReturnType<typeof buildWorkloadModel>, scheduleKind: "optimal" | "actual_staffing", shortages: string[]) {
  const warnings = [...shortages];
  if (toNumber(matrix?.boarding_unknown_size, 0) + toNumber(matrix?.daycare_unknown_size, 0) > 0) {
    warnings.push(`${toNumber(matrix?.boarding_unknown_size, 0) + toNumber(matrix?.daycare_unknown_size, 0)} dogs still need playgroup verification. This is a warning, not a hard blocker, before publish.`);
  }
  if (workload.departureBaths >= 10) {
    warnings.push("Heavy bath workload day. Verify dryer capacity and opening bath coverage before publish.");
  }
  if (scheduleKind === "actual_staffing" && shortages.length === 0) {
    warnings.push("Actual staffing schedule absorbs the currently modeled peak coverage without needing a separate midday shift.");
  }
  return warnings;
}

export function buildRotationSchedulePayload({
  matrix,
  config = {},
  staffPlan = null,
  mode = "optimal",
}: {
  matrix: any;
  config?: Record<string, any>;
  staffPlan?: any;
  mode: "optimal" | "actual_staffing";
}): RotationPayload {
  const normalizedConfig = normalizeRotationConfig(config);
  const workload = buildWorkloadModel(matrix, normalizedConfig);
  const scheduleKind = mode;
  const openingFrame = getOpeningShiftFrame(matrix.matrix_date, normalizedConfig);
  const closingFrame = getClosingShiftFrame(matrix.matrix_date, normalizedConfig);
  const openingLabor = getShiftLaborSummary(workload.openingHeadcount, openingFrame.start, openingFrame.end, normalizedConfig);
  const closingLabor = getShiftLaborSummary(workload.closingHeadcount, closingFrame.start, closingFrame.end, normalizedConfig);
  const shiftRecommendations = {
    opening_shift: {
      label: `Optimal Opening Shift (${formatTimeLabel(openingFrame.start)}–${formatTimeLabel(openingFrame.end)})`,
      start: openingFrame.start,
      end: openingFrame.end,
      headcount: workload.openingHeadcount,
      ...openingLabor,
    },
    closing_shift: {
      label: `Optimal Closing Shift (${formatTimeLabel(closingFrame.start)}–${formatTimeLabel(closingFrame.end)})`,
      start: closingFrame.start,
      end: closingFrame.end,
      headcount: workload.closingHeadcount,
      ...closingLabor,
    },
  };

  const sourceEntries = mode === "actual_staffing" ? getStructuredShiftEntries(staffPlan) : buildOptimalShiftEntries(matrix, normalizedConfig, workload);
  const lanes = sourceEntries.map((entry, index) => buildLaneFromEntry(entry, index));
  const slots = buildSlots(matrix.matrix_date, normalizedConfig);
  const breakAssignments = getBreakAssignments(lanes, matrix.matrix_date, normalizedConfig, slots);
  const cells: Record<string, Record<string, RotationCell>> = Object.fromEntries(lanes.map((lane) => [lane.id, {}]));
  const shortages = new Set<string>();
  const preOpenSlots = slots.filter((slot) => slot.segment === "pre_open");

  slots.forEach((slot) => {
    const activeLanes = lanes.filter((lane) => laneIsActive(lane, slot.time));
    const requiredCoverage = getRequiredCoverageForSlot(slot.time, matrix.matrix_date, workload, normalizedConfig);
    const alwaysBackend = activeLanes.filter((lane) => lane.position === "pct");
    const supportLanes = activeLanes
      .filter((lane) => lane.position === "csr" || lane.position === "mod")
      .sort((a, b) => (a.position === b.position ? 0 : a.position === "csr" ? -1 : 1));
    const shortageCount = Math.max(0, requiredCoverage - alwaysBackend.length);
    const backfillSupport = supportLanes.slice(0, shortageCount);
    const backendLaneIds = new Set([...alwaysBackend, ...backfillSupport].map((lane) => lane.id));

    if (alwaysBackend.length + backfillSupport.length < requiredCoverage) {
      shortages.add(`${formatTimeLabel(slot.time)} is short ${requiredCoverage - (alwaysBackend.length + backfillSupport.length)} backend person${requiredCoverage - (alwaysBackend.length + backfillSupport.length) === 1 ? "" : "s"} against the optimal coverage target.`);
    }

    const hourBlock = slot.segment === "pre_open"
      ? 0
      : Math.floor((timeToMinutes(slot.time) - timeToMinutes(isWeekend(matrix.matrix_date) ? normalizedConfig.weekend_am_open_window[1] : normalizedConfig.weekday_am_open_window[1])) / 60);

    const preOpenIndex = preOpenSlots.findIndex((preOpenSlot) => preOpenSlot.time === slot.time);
    const preOpenTasks = preOpenIndex >= 0 ? getPreOpenTasks(preOpenIndex, preOpenSlots.length, workload) : null;
    const taskPool = preOpenTasks
      ? null
      : buildTaskPoolForHour(hourBlock, slot.time, workload, matrix.matrix_date, normalizedConfig);

    const backendLanesOrdered = activeLanes.filter((lane) => backendLaneIds.has(lane.id));
    backendLanesOrdered.forEach((lane, backendIndex) => {
      if (breakAssignments[lane.id] === slot.time) {
        cells[lane.id][slot.time] = createCell("break");
        return;
      }

      if (preOpenTasks) {
        if (backendIndex === 0) cells[lane.id][slot.time] = preOpenTasks.lead;
        else if (backendIndex === backendLanesOrdered.length - 1) cells[lane.id][slot.time] = preOpenTasks.special;
        else cells[lane.id][slot.time] = preOpenTasks.support;
        return;
      }

      const rotationIndex = taskPool && taskPool.length > 0
        ? (backendIndex + Math.max(0, hourBlock)) % taskPool.length
        : 0;
      const assignedTask = taskPool?.[rotationIndex] || createCell("float");
      cells[lane.id][slot.time] = assignedTask;
    });

    activeLanes
      .filter((lane) => !backendLaneIds.has(lane.id))
      .forEach((lane) => {
        if (breakAssignments[lane.id] === slot.time) {
          cells[lane.id][slot.time] = createCell("break");
          return;
        }
        if (lane.position === "supervisor") {
          cells[lane.id][slot.time] = getSupervisorSupportTask(slot.time, matrix.matrix_date, normalizedConfig);
        } else if (lane.position === "csr") {
          cells[lane.id][slot.time] = createCell("lobby");
        } else if (lane.position === "mod") {
          cells[lane.id][slot.time] = createCell("manager_coverage");
        } else {
          cells[lane.id][slot.time] = createCell("float");
        }
      });

    lanes
      .filter((lane) => !activeLanes.some((activeLane) => activeLane.id === lane.id))
      .forEach((lane) => {
        cells[lane.id][slot.time] = createCell("off");
      });
  });

  const warnings = buildWarnings(matrix, workload, scheduleKind, [...shortages]);
  const cadenceWarnings = detectConsecutiveTaskWarnings(cells, slots, lanes);
  warnings.push(...cadenceWarnings);

  const projectionSummary = getProjectionSummary(matrix);
  const notes = projectionSummary ? [projectionSummary.sentence] : [];
  const workloadBreakdown = buildWorkloadBreakdown(matrix, normalizedConfig, workload);

  const saveablePayload = {
    location_id: matrix.location_id,
    schedule_date: matrix.matrix_date,
    shift: "full",
    staff_input: {
      mode: scheduleKind,
      staff_names: sourceEntries.map((entry) => ({
        position: entry.position,
        name: entry.name,
        shift_start: entry.shift_start,
        shift_end: entry.shift_end,
      })),
    },
    dog_metrics: {
      boarding_large: matrix.boarding_large,
      boarding_small: matrix.boarding_small,
      boarding_unknown_size: matrix.boarding_unknown_size,
      daycare_large: matrix.daycare_large,
      daycare_small: matrix.daycare_small,
      daycare_unknown_size: matrix.daycare_unknown_size,
      pp_dayboarders: matrix.pp_dayboarders,
      pp_overnight_boarders: matrix.pp_overnight_boarders,
      departure_baths: matrix.departure_baths,
      feeding_dogs: matrix.feeding_dogs,
      medication_dogs: matrix.medication_dogs,
      gross_dogs_in_building: matrix.gross_dogs_in_building,
    },
    assumptions_snapshot: normalizedConfig,
    time_slots: slots,
    persons: lanes.map((lane) => lane.label),
    grid: cells,
    warnings,
    violations: [],
    overrides: [],
    explanation: {
      schedule_kind: scheduleKind,
      shift_recommendations: shiftRecommendations,
      peak_active_coverage: {
        count: workload.peakCoverage,
        start: workload.peakWindow.start,
        end: workload.peakWindow.end,
        note: `Peak active coverage reaches ${workload.peakCoverage} people between ${formatTimeLabel(workload.peakWindow.start)}–${formatTimeLabel(workload.peakWindow.end)}; this is already absorbed into the opening and closing shift recommendations.`,
      },
      workload_breakdown: workloadBreakdown,
      notes,
    },
    generated_at: new Date().toISOString(),
  };

  return {
    schedule_kind: scheduleKind,
    shift_recommendations: shiftRecommendations,
    peak_active_coverage: {
      count: workload.peakCoverage,
      start: workload.peakWindow.start,
      end: workload.peakWindow.end,
      note: `Peak active coverage reaches ${workload.peakCoverage} people between ${formatTimeLabel(workload.peakWindow.start)}–${formatTimeLabel(workload.peakWindow.end)}; this is already absorbed into the opening and closing shift recommendations.`,
    },
    workload_breakdown: workloadBreakdown,
    grid: {
      lanes,
      slots,
      cells,
    },
    warnings,
    notes,
    saveable_payload: saveablePayload,
  };
}

export function buildRotationCacheSignature({
  matrixComputedAt,
  staffPlanUpdatedAt,
  configUpdatedAt,
}: {
  matrixComputedAt: string | null;
  staffPlanUpdatedAt?: string | null;
  configUpdatedAt?: string | null;
}) {
  return JSON.stringify({
    matrix_computed_at: matrixComputedAt || null,
    staff_plan_updated_at: staffPlanUpdatedAt || null,
    config_updated_at: configUpdatedAt || null,
  });
}
