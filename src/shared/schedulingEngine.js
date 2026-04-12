// K9 Operations — Scheduling Engine
// Core types, constants, and solver functions for the scheduling feature.
// Implements the opening strategy decision tree and required headcount computation.

// ─── Schedule Config Defaults ─────────────────────────────────────────────
export const SCHEDULE_CONFIG_DEFAULTS = {
  weekday_am_open_window: ["06:00", "07:00"],
  weekend_am_open_window: ["07:00", "09:00"],
  weekday_site_hours: ["06:00", "20:00"],
  weekend_site_hours: ["07:00", "18:00"],
  public_hours_weekday: ["07:00", "19:00"],
  public_hours_weekend: ["08:00", "18:00"],
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
  foam: { bg: "#F1F5F9", text: "#475569", label: "Foam" },
  dailies: { bg: "#F8FAFC", text: "#64748B", label: "Dailies" },
  eod: { bg: "#F1F5F9", text: "#475569", label: "EOD / Close" },
};

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

export function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

export function isWeekend(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  return d.getDay() === 0 || d.getDay() === 6;
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
export function evaluateFullPodPass(matrix, staffPlan, config) {
  const totalOvernightDogs = matrix.boarding_large + matrix.boarding_small + matrix.pp_overnight_boarders;
  const totalMinutes = estimatePodPassTotalMinutes(totalOvernightDogs, config);

  const weekend = isWeekend(matrix.matrix_date);
  const window = weekend ? config.weekend_am_open_window : config.weekday_am_open_window;
  const windowMinutes = timeToMinutes(window[1]) - timeToMinutes(window[0]);

  const requiredFunctioningPct = Math.max(1, Math.ceil(totalMinutes / windowMinutes));
  const availableFunctioningPct = computeAvailableFunctioningPct(staffPlan);
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
export function evaluateSplitStrategy(matrix, staffPlan, config) {
  const ppDogs = matrix.pp_overnight_boarders;
  const groupDogsLarge = matrix.boarding_large;
  const groupDogsSmall = matrix.boarding_small;

  const weekend = isWeekend(matrix.matrix_date);
  const window = weekend ? config.weekend_am_open_window : config.weekday_am_open_window;
  const windowMinutes = timeToMinutes(window[1]) - timeToMinutes(window[0]);
  const availableFunctioningPct = computeAvailableFunctioningPct(staffPlan);

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
export function solveOpening(matrix, staffPlan, config) {
  const podPassResult = evaluateFullPodPass(matrix, staffPlan, config);
  const splitResult = evaluateSplitStrategy(matrix, staffPlan, config);

  // Step 1: If full pod pass fits comfortably, use it
  if (podPassResult.feasible) {
    const totalOvernightDogs = matrix.boarding_large + matrix.boarding_small + matrix.pp_overnight_boarders;
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

export function computeAvailableFunctioningPct(staffPlan) {
  if (!staffPlan) return 0;
  let total = staffPlan.pct_count || 0;
  if (staffPlan.allow_csr_as_pct) total += (staffPlan.csr_count || 0);
  if (staffPlan.supervisor_present) total += (staffPlan.supervisor_count || 0);
  if (staffPlan.allow_mod_as_pct) total += (staffPlan.mod_count || 0);
  return total;
}

// ─── Required Headcount Computation ───────────────────────────────────────

/**
 * Compute required functioning PCT counts for AM, midday, and PM from matrix + config.
 */
export function computeRequiredHeadcount(matrix, config) {
  if (!matrix) return { am: 0, midday: 0, pm: 0, functionalHours: 0, warnings: [], explanation: [] };

  const warnings = [];
  const explanation = [];

  // AM: Opening headcount driven by overnight dogs + baths + daycare coverage
  const totalOvernightDogs = (matrix.boarding_large || 0) + (matrix.boarding_small || 0) + (matrix.pp_overnight_boarders || 0);
  const ppDogs = matrix.pp_overnight_boarders || 0;

  // Daycare coverage minimum: 1 for LGDC + 1 for SMDC when dogs present
  const lgdcCoverage = (matrix.daycare_large || 0) > 0 ? 1 : 0;
  const smdcCoverage = (matrix.daycare_small || 0) > 0 ? 1 : 0;
  const dayCovBase = lgdcCoverage + smdcCoverage;

  // Opening staff: transport + daycare standing + PP
  const transportWork = totalOvernightDogs * (config.group_transport_minutes_each_way || 2);
  const weekend = isWeekend(matrix.matrix_date);
  const window = weekend ? config.weekend_am_open_window : config.weekday_am_open_window;
  const windowMin = timeToMinutes(window[1]) - timeToMinutes(window[0]);
  const transportPct = Math.ceil(transportWork / Math.max(1, windowMin));
  const ppPct = ppDogs > 0 ? 1 : 0;

  // Bath workers (if > 6 baths, need dedicated bath PCT)
  const bathPct = (matrix.departure_baths || 0) > 6 ? 1 : 0;

  const amRequired = Math.max(dayCovBase + 1, transportPct + dayCovBase + ppPct + bathPct);

  // Midday: daycare coverage + PP round + break relief
  const middayPP = ppDogs > 0 ? 1 : 0;
  const breakRelief = 1; // at least 1 for break coverage
  const middayRequired = Math.max(dayCovBase + 1, dayCovBase + middayPP + breakRelief);

  // PM/Closing: transport back + feeding + daycare coverage + PP round
  const feedWork = ((matrix.feeding_dogs || 0) * (config.feeding_minutes_per_dog || 1.5)) +
    ((matrix.medication_dogs || 0) * (config.medication_minutes_per_dog || 2));
  const feedPct = feedWork > 30 ? 1 : 0;
  const pmRequired = Math.max(dayCovBase + 1, dayCovBase + ppPct + feedPct + 1);

  // Total functional hours estimate (rough: am * opening_hours + midday * midday_hours + pm * closing_hours)
  const siteHours = weekend ? config.weekend_site_hours : config.weekday_site_hours;
  const totalSiteHours = (timeToMinutes(siteHours[1]) - timeToMinutes(siteHours[0])) / 60;
  const functionalHours = Math.round(
    amRequired * (windowMin / 60) +
    middayRequired * (totalSiteHours * 0.4) +
    pmRequired * (totalSiteHours * 0.3)
  );

  // Generate explanation
  explanation.push(`AM: ${amRequired} functioning PCTs needed — ${totalOvernightDogs} overnight dogs, ${ppDogs} PP dogs, ${matrix.departure_baths || 0} baths`);
  explanation.push(`Midday: ${middayRequired} functioning PCTs — daycare coverage (${lgdcCoverage} LGDC + ${smdcCoverage} SMDC) + PP + break relief`);
  explanation.push(`PM: ${pmRequired} functioning PCTs — transport back, feeding (${matrix.feeding_dogs || 0} dogs), meds (${matrix.medication_dogs || 0} dogs)`);

  // Warnings
  if ((matrix.departure_baths || 0) > 10) {
    warnings.push("Heavy bath day — bath completion may push past target window");
  }
  if (ppDogs > 8) {
    warnings.push(`High PP load (${ppDogs} dogs) — dedicated PP functioning PCT needed throughout day`);
  }
  if ((matrix.boarding_unknown_size || 0) + (matrix.daycare_unknown_size || 0) > 5) {
    warnings.push(`${(matrix.boarding_unknown_size || 0) + (matrix.daycare_unknown_size || 0)} dogs have unknown size classification — headcount may shift after check-in`);
  }

  return {
    am: amRequired,
    midday: middayRequired,
    pm: pmRequired,
    functionalHours,
    warnings,
    explanation,
  };
}

/**
 * Compute staffing status for a day given required vs assigned counts.
 */
export function computeStaffingStatus(required, staffPlan, config) {
  if (!staffPlan) return { status: "no_plan", warnings: ["No staff plan entered for this day"] };

  const available = computeAvailableFunctioningPct(staffPlan);
  const warnings = [];

  const amGap = required.am - available;
  const middayGap = required.midday - available;
  const pmGap = required.pm - available;

  if (amGap > 0) warnings.push(`Opening short by ${amGap} functioning PCT(s)`);
  if (middayGap > 0) warnings.push(`Midday short by ${middayGap} functioning PCT(s)`);
  if (pmGap > 0) warnings.push(`PM coverage short by ${pmGap} functioning PCT(s)`);

  const maxGap = Math.max(amGap, middayGap, pmGap);
  let status = "ok";
  if (maxGap > 0) status = "short";
  else if (maxGap === 0) status = "borderline";

  return { status, warnings, assignedFunctioningPct: available };
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
  const ppDogs = matrix.pp_overnight_boarders || 0;
  const totalBoardingDogs = (matrix.boarding_large || 0) + (matrix.boarding_small || 0);
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
        else if (li % 3 === 1) grid[lane][t] = "smdc";
        else grid[lane][t] = ppDogs > 0 ? "pp" : "lgdc";
      } else if (ti < openEndIdx + 8) {
        // Core rotation
        const phase = Math.floor((ti - openEndIdx - 4) / 2);
        if (li === 0) grid[lane][t] = "lgdc";
        else if (li === 1) grid[lane][t] = phase === 0 ? "smdc" : "lgdc";
        else if (li === 2) grid[lane][t] = phase === 0 ? "bath" : "pp";
        else grid[lane][t] = ti === openEndIdx + 6 ? "break" : "lgdc";
      } else {
        // Late morning
        if (li === 0) grid[lane][t] = "lgdc";
        else if (li === 1) grid[lane][t] = "smdc";
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

  // Build lanes
  const lanes = buildStaffLanes(staffPlan);

  const grid = {};
  lanes.forEach(lane => { grid[lane] = {}; });

  const ppDogs = (matrix.pp_overnight_boarders || 0) + (matrix.pp_dayboarders || 0);
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

    lanes.forEach((lane, li) => {
      const isSup = lane === "SUP";
      const isCsr = lane.startsWith("CSR");

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
      grid[lane][t] = assignCrewTask(phase, slotMin, ti, li, lanes, strategy, matrix, config, hasBaths, ppDogs, hasSup, breakTracker, maxConcurrentBreaks, t);
    });
  });

  return { lanes, slots: allSlots, grid, phases };
}

function buildStaffLanes(staffPlan) {
  const numPct = staffPlan.pct_count || 0;
  const numCsr = staffPlan.csr_count || 0;
  const hasSup = staffPlan.supervisor_present;
  const lanes = [];
  for (let i = 1; i <= numPct; i++) lanes.push(`fPCT ${i}`);
  if (staffPlan.allow_csr_as_pct && numCsr > 0) {
    for (let i = 1; i <= numCsr; i++) lanes.push(`CSR→fPCT ${i}`);
  }
  if (hasSup) lanes.push("SUP");
  if (lanes.length === 0) lanes.push("fPCT 1", "fPCT 2", "fPCT 3");
  return lanes;
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

function assignCrewTask(phase, slotMin, ti, li, lanes, strategy, matrix, config, hasBaths, ppDogs, hasSup, breakTracker, maxConcurrent, t) {
  const crewLaneCount = lanes.filter(l => !l.startsWith("SUP")).length;

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
      return (matrix.daycare_small || 0) > 0 ? "smdc" : "lgdc";
    }
    case "CORE": {
      // Rotating daycare coverage + PP + baths + staggered breaks
      return assignCoreTask(slotMin, ti, li, crewLaneCount, ppDogs, hasBaths, matrix, breakTracker, maxConcurrent, t);
    }
    case "LATE_AM": {
      if (li === 0) return "lgdc";
      if (li === 1) return "smdc";
      if (li === 2) return ppDogs > 0 ? "pp" : "foam";
      return "disinfect";
    }
    case "PM_CORE": {
      // Afternoon core: daycare + PP + float
      if (li === 0) return "lgdc";
      if (li === 1) return (matrix.daycare_small || 0) > 0 ? "smdc" : "lgdc";
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
  const weekend = isWeekend(matrix.matrix_date);
  const siteHours = weekend ? config.weekend_site_hours : config.weekday_site_hours;
  const publicHours = weekend ? config.public_hours_weekend : config.public_hours_weekday;
  const coreStartMin = timeToMinutes(weekend ? config.weekend_am_open_window[1] : config.weekday_am_open_window[1]) + 60;
  const coreEndMin = timeToMinutes(siteHours[1]) - 30;

  for (const t of slots) {
    const slotMin = timeToMinutes(t);
    const isCore = slotMin >= coreStartMin && slotMin < coreEndMin;

    // Check LGDC coverage during core hours
    if (isCore && (matrix.daycare_large || 0) > 0) {
      const lgdcCoverage = lanes.some(l => grid[l]?.[t] === "lgdc");
      if (!lgdcCoverage) {
        violations.push({ slot: t, type: "lgdc_uncovered", message: `LGDC uncovered at ${t} — hard constraint violation` });
      }
    }

    // Check SMDC coverage during core hours
    if (isCore && (matrix.daycare_small || 0) > 0) {
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
    },
    generated_at: new Date().toISOString(),
  };
}

/**
 * Apply a single cell override to a grid. Returns a new grid (immutable).
 */
export function applyOverride(grid, lane, slot, newTask, reason) {
  const newGrid = {};
  for (const l of Object.keys(grid)) {
    newGrid[l] = { ...grid[l] };
  }
  const previousTask = newGrid[lane]?.[slot] || null;
  if (newGrid[lane]) {
    newGrid[lane][slot] = newTask;
  }
  return {
    grid: newGrid,
    override: {
      lane,
      slot,
      previous_task: previousTask,
      new_task: newTask,
      reason: reason || "",
      applied_at: new Date().toISOString(),
    },
  };
}

// ─── Build Full Day Summary ───────────────────────────────────────────────

/**
 * Build a complete day analysis from matrix + staff plan + config.
 * Returns everything the UI needs for one day.
 */
export function buildDaySummary(matrix, staffPlan, config) {
  const mergedConfig = { ...SCHEDULE_CONFIG_DEFAULTS, ...config };

  const required = computeRequiredHeadcount(matrix, mergedConfig);
  const staffStatus = computeStaffingStatus(required, staffPlan, mergedConfig);
  const openingResult = staffPlan ? solveOpening(matrix, staffPlan, mergedConfig) : null;

  // Generate full-day grid (AM + PM) instead of just opening
  const gridResult = staffPlan
    ? generateFullDayGrid(matrix, staffPlan, openingResult, mergedConfig)
    : null;

  // Validate the grid
  let violations = [];
  if (gridResult) {
    const validation = validateGrid(gridResult.grid, gridResult.lanes, gridResult.slots, matrix, mergedConfig);
    violations = validation.violations;
  }

  const allWarnings = [...required.warnings, ...(staffStatus.warnings || []), ...(openingResult?.warnings || [])];

  return {
    matrix,
    staffPlan,
    required,
    staffStatus,
    openingResult,
    grid: gridResult,
    violations,
    warnings: allWarnings,
    explanation: [
      ...(required.explanation || []),
      ...(openingResult?.explanation || []),
      openingResult?.selectedReason || "",
    ].filter(Boolean),
  };
}
