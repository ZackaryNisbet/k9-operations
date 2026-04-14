// K9 Operations — Scheduling Data Hook
// Fetches scheduling_matrix_daily, daily_staff_plan, and schedule_config from Supabase.
// Scheduling uses only the canonical server-computed matrix; if a day has not been
// computed yet, the UI should show it as missing rather than falling back to occupancy.

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase } from "../supabaseClient";
import {
  SCHEDULE_CONFIG_DEFAULTS,
  computeAvailableFunctioningPct,
  computeRequiredHeadcount,
  computeStaffingStatus,
  isWeekend,
  getMatrixTrust,
  getMatrixTrustState,
  getMatrixBlockers,
  canGenerateSchedule,
} from "../shared/schedulingEngine";

const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * useSchedulingData(locationId, startDate)
 *
 * Returns:
 *   weekData    — array of 7 day objects with matrix, staffPlan, required, status
 *   config      — merged schedule config (defaults + location overrides)
 *   loading     — true during initial fetch
 *   error       — error message if any
 *   refresh()   — manual refresh trigger
 *   upsertStaffPlan(plan) — save a staff plan entry
 */
export function useSchedulingData(locationId, startDate) {
  const [matrixRows, setMatrixRows] = useState([]);
  const [staffPlans, setStaffPlans] = useState([]);
  const [config, setConfig] = useState(SCHEDULE_CONFIG_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const fetchIdRef = useRef(0);
  const intervalRef = useRef(null);

  // Compute the 7-day date range
  const dates = useMemo(() => {
    if (!startDate) return [];
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(startDate + "T12:00:00");
      d.setDate(d.getDate() + i);
      return d.toISOString().slice(0, 10);
    });
  }, [startDate]);

  const endDate = dates[6] || startDate;

  const recomputeDates = useCallback(async (targetDates) => {
    const orderedDates = [...new Set((targetDates || []).filter(Boolean))].sort();
    const failures = [];

    for (const date of orderedDates) {
      const { error: computeErr } = await supabase.functions.invoke("compute-scheduling-matrix", {
        body: {
          location_id: locationId,
          date_from: date,
          date_to: date,
        },
      });

      if (computeErr) {
        failures.push({
          date,
          error: computeErr.message || String(computeErr),
        });
      }
    }

    return failures;
  }, [locationId]);

  const fetchAll = useCallback(async ({ recompute = false } = {}) => {
    if (!locationId || !startDate || dates.length === 0) return;
    const fetchId = ++fetchIdRef.current;

    try {
      if (recompute) {
        const computeFailures = await recomputeDates(dates);
        if (computeFailures.length) {
          console.warn("compute-scheduling-matrix refresh failures:", computeFailures);
        }
      }

      // Fetch all canonical data sources in parallel
      let [matrixRes, staffRes, configRes] = await Promise.all([
        supabase
          .from("scheduling_matrix_daily")
          .select("*")
          .eq("location_id", locationId)
          .gte("matrix_date", startDate)
          .lte("matrix_date", endDate)
          .order("matrix_date", { ascending: true }),

        // 2. Staff plans
        supabase
          .from("daily_staff_plan")
          .select("*")
          .eq("location_id", locationId)
          .gte("plan_date", startDate)
          .lte("plan_date", endDate)
          .order("plan_date", { ascending: true }),

        // 3. Schedule config from lite_settings
        supabase
          .from("lite_settings")
          .select("setting_value")
          .eq("location_id", locationId)
          .eq("setting_key", "schedule_config")
          .maybeSingle(),
      ]);

      const matrixCoverage = (matrixRes.data || []).length;
      if (!recompute && matrixCoverage < dates.length) {
        const existingDates = new Set((matrixRes.data || []).map((row) => row.matrix_date));
        const missingDates = dates.filter((date) => !existingDates.has(date));
        const computeFailures = await recomputeDates(missingDates);

        if (!computeFailures.length) {
          [matrixRes, staffRes, configRes] = await Promise.all([
            supabase
              .from("scheduling_matrix_daily")
              .select("*")
              .eq("location_id", locationId)
              .gte("matrix_date", startDate)
              .lte("matrix_date", endDate)
              .order("matrix_date", { ascending: true }),
            supabase
              .from("daily_staff_plan")
              .select("*")
              .eq("location_id", locationId)
              .gte("plan_date", startDate)
              .lte("plan_date", endDate)
              .order("plan_date", { ascending: true }),
            supabase
              .from("lite_settings")
              .select("setting_value")
              .eq("location_id", locationId)
              .eq("setting_key", "schedule_config")
              .maybeSingle(),
          ]);
        } else {
          console.warn("compute-scheduling-matrix missing-day refresh failures:", computeFailures);
        }
      }

      if (fetchId !== fetchIdRef.current) return; // stale

      // Handle table-not-found gracefully (tables may not be deployed yet)
      const matrix = matrixRes.error && matrixRes.error.code === "42P01" ? [] : (matrixRes.data || []);
      const plans = staffRes.error && staffRes.error.code === "42P01" ? [] : (staffRes.data || []);
      const configVal = configRes.data?.setting_value || {};

      setMatrixRows(matrix);
      setStaffPlans(plans);
      setConfig({ ...SCHEDULE_CONFIG_DEFAULTS, ...configVal });
      setError(null);
    } catch (err) {
      if (fetchId !== fetchIdRef.current) return;
      setError(err.message || "Failed to load scheduling data");
    } finally {
      if (fetchId === fetchIdRef.current) setLoading(false);
    }
  }, [locationId, startDate, endDate, dates, recomputeDates]);

  useEffect(() => {
    setLoading(true);
    fetchAll();
    intervalRef.current = setInterval(() => fetchAll(), REFRESH_INTERVAL_MS);
    return () => clearInterval(intervalRef.current);
  }, [fetchAll]);

  // Build week data by merging the canonical matrix with any saved staff plans.
  const weekData = useMemo(() => {
    return dates.map(date => {
      const matrixRow = matrixRows.find(r => r.matrix_date === date);
      const staffPlan = staffPlans.find(r => r.plan_date === date);

      const matrix = matrixRow ? normalizeMatrixRow(matrixRow) : buildEmptyMatrix(date);
      const trust = getMatrixTrust(matrix);
      const matrixTrustState = getMatrixTrustState(matrix);
      const generationBlockers = getMatrixBlockers(matrix);
      const generationAllowed = canGenerateSchedule(matrix);

      // Compute required headcount
      const required = computeRequiredHeadcount(matrix, config);

      // Compute staffing status
      const staffStatus = generationAllowed
        ? computeStaffingStatus(required, staffPlan, config)
        : {
            status: matrixTrustState === "missing" ? "missing" : "estimated",
            warnings: generationBlockers,
            assignedFunctioningPct: staffPlan ? computeAvailableFunctioningPct(staffPlan) : 0,
          };

      const dt = new Date(date + "T12:00:00");
      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

      return {
        date,
        dayName: dayNames[dt.getDay()],
        dayNum: dt.getDate(),
        isWeekend: isWeekend(date),
        matrix,
        staffPlan: staffPlan || null,
        required,
        trust,
        matrixTrustState,
        generationBlockers,
        canGenerate: generationAllowed,
        canShowHeadcount: generationAllowed,
        status: staffStatus.status,
        warnings: [...required.warnings, ...(staffStatus.warnings || []), ...generationBlockers],
        assignedFunctioningPct: staffStatus.assignedFunctioningPct || 0,
        hasLiveMatrix: !!matrixRow,
        hasDashboardFallback: false,
        hasNoData: !matrixRow,
      };
    });
  }, [dates, matrixRows, staffPlans, config]);

  // Upsert a staff plan
  const upsertStaffPlan = useCallback(async (plan) => {
    const sanitizedPlan = {
      ...plan,
      allow_csr_as_pct: false,
      allow_mod_as_pct: false,
      staff_names: Array.isArray(plan?.staff_names) ? plan.staff_names : [],
      updated_at: new Date().toISOString(),
    };
    delete sanitizedPlan.shift_entries;

    const { error: err } = await supabase
      .from("daily_staff_plan")
      .upsert(
        { location_id: locationId, ...sanitizedPlan },
        { onConflict: "location_id,plan_date,shift" }
      );
    if (err) throw err;
    await fetchAll(); // Refresh data
  }, [locationId, fetchAll]);

  // ─── Schedule Persistence ──────────────────────────────────────────────

  /**
   * Save a generated schedule as a new draft version in rotation_schedules.
   * Auto-increments version for the same date/shift.
   */
  const saveSchedule = useCallback(async (schedulePayload) => {
    // Get the next version number
    const { data: existing } = await supabase
      .from("rotation_schedules")
      .select("version")
      .eq("location_id", locationId)
      .eq("schedule_date", schedulePayload.schedule_date)
      .eq("shift", schedulePayload.shift)
      .order("version", { ascending: false })
      .limit(1);

    const nextVersion = (existing?.[0]?.version || 0) + 1;

    const row = {
      ...schedulePayload,
      location_id: locationId,
      version: nextVersion,
      status: "draft",
      generated_by: "scheduling_engine",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error: err } = await supabase
      .from("rotation_schedules")
      .insert(row)
      .select("id, version, status")
      .single();

    if (err) throw err;
    return data;
  }, [locationId]);

  /**
   * Publish a draft schedule version. Archives any currently published version for the same date/shift.
   */
  const publishSchedule = useCallback(async (scheduleId) => {
    // First, get the schedule we're publishing to find its date/shift
    const { data: schedule, error: fetchErr } = await supabase
      .from("rotation_schedules")
      .select("schedule_date, shift, version")
      .eq("id", scheduleId)
      .single();

    if (fetchErr) throw fetchErr;

    // Archive any currently published version for this date/shift
    await supabase
      .from("rotation_schedules")
      .update({ status: "archived", updated_at: new Date().toISOString() })
      .eq("location_id", locationId)
      .eq("schedule_date", schedule.schedule_date)
      .eq("shift", schedule.shift)
      .eq("status", "published");

    // Mark the target version as published
    const { error: pubErr } = await supabase
      .from("rotation_schedules")
      .update({
        status: "published",
        published_at: new Date().toISOString(),
        published_by: "manager",
        updated_at: new Date().toISOString(),
      })
      .eq("id", scheduleId);

    if (pubErr) throw pubErr;

    return { scheduleId, version: schedule.version, status: "published" };
  }, [locationId]);

  /**
   * Apply an override to a saved schedule. Updates the grid and appends to the overrides log.
   */
  const applyScheduleOverride = useCallback(async (scheduleId, lane, slot, newTask, notes) => {
    // Fetch current schedule
    const { data: schedule, error: fetchErr } = await supabase
      .from("rotation_schedules")
      .select("grid, overrides, warnings")
      .eq("id", scheduleId)
      .single();

    if (fetchErr) throw fetchErr;

    const currentGrid = schedule.grid || {};
    const currentOverrides = schedule.overrides || [];

    // Apply the override
    const previousCell = currentGrid[lane]?.[slot] || null;
    const previousTask = typeof previousCell === "string" ? previousCell : previousCell?.task || null;
    const newGrid = { ...currentGrid };
    if (newGrid[lane]) {
      const existingCell = newGrid[lane]?.[slot];
      newGrid[lane] = {
        ...newGrid[lane],
        [slot]: typeof existingCell === "object" && existingCell !== null
          ? { ...existingCell, task: newTask, notes: notes || "" }
          : { task: newTask, notes: notes || "" },
      };
    }

    const overrideEntry = {
      lane,
      slot,
      previous_task: previousTask,
      new_task: newTask,
      notes: notes || "",
      applied_at: new Date().toISOString(),
    };

    const { error: updateErr } = await supabase
      .from("rotation_schedules")
      .update({
        grid: newGrid,
        overrides: [...currentOverrides, overrideEntry],
        updated_at: new Date().toISOString(),
      })
      .eq("id", scheduleId);

    if (updateErr) throw updateErr;

    return overrideEntry;
  }, []);

  /**
   * Fetch saved schedule versions for a specific date.
   */
  const fetchScheduleVersions = useCallback(async (scheduleDate) => {
    const { data, error: err } = await supabase
      .from("rotation_schedules")
      .select("id, version, status, generated_at, published_at, warnings, overrides")
      .eq("location_id", locationId)
      .eq("schedule_date", scheduleDate)
      .order("version", { ascending: false });

    if (err && err.code !== "42P01") throw err;
    return data || [];
  }, [locationId]);

  const runAudit = useCallback(async ({ dateFrom, dateTo }) => {
    const { data, error: auditErr } = await supabase.functions.invoke("scheduling-audit", {
      body: {
        location_id: locationId,
        date_from: dateFrom,
        date_to: dateTo,
      },
    });

    if (auditErr) throw auditErr;
    return data;
  }, [locationId]);

  const computeRotationSchedule = useCallback(async ({ scheduleDate, mode = "optimal" }) => {
    const { data, error: rotationErr } = await supabase.functions.invoke("compute-rotation-schedule", {
      body: {
        location_id: locationId,
        schedule_date: scheduleDate,
        mode,
      },
    });

    if (rotationErr) throw rotationErr;
    return data;
  }, [locationId]);

  return {
    weekData,
    config,
    loading,
    error,
    refresh: () => fetchAll({ recompute: true }),
    upsertStaffPlan,
    saveSchedule,
    publishSchedule,
    applyScheduleOverride,
    fetchScheduleVersions,
    runAudit,
    computeRotationSchedule,
  };
}

function normalizeMatrixRow(matrixRow) {
  return {
    ...matrixRow,
    _source: "scheduling_matrix_daily",
    _confidence: getMatrixTrustState(matrixRow) === "trusted" ? "high" : "low",
  };
}

function buildEmptyMatrix(date) {
  return {
    matrix_date: date,
    location_id: "",
    boarding_large: 0,
    boarding_small: 0,
    boarding_unknown_size: 0,
    daycare_large: 0,
    daycare_small: 0,
    daycare_unknown_size: 0,
    pp_dayboarders: 0,
    pp_overnight_boarders: 0,
    departure_baths: 0,
    evaluations: 0,
    tours: 0,
    gross_dogs_in_building: 0,
    feeding_dogs: 0,
    medication_dogs: 0,
    dogs_arriving: 0,
    dogs_departing: 0,
    dogs_checked_out: 0,
    rooms_occupied: 0,
    rooms_available: 0,
    total_rooms: 0,
    detail_json: {
      trust: {
        state: "missing",
        source: "none",
        can_generate: false,
        blockers: ["No scheduling matrix has been computed for this day yet."],
        blocker_details: [],
        notes: [],
      },
      display: {
        opening: {
          large_boarding: null,
          small_boarding: null,
          private_play_boarding: null,
          half_and_half_boarding: null,
          evaluation_boarding: null,
          unclassified_boarding: null,
          total_boarding: null,
        },
        closing: {
          large_boarding: null,
          small_boarding: null,
          private_play_boarding: null,
          half_and_half_boarding: null,
          evaluation_boarding: null,
          unclassified_boarding: null,
          total_boarding: null,
        },
        daycare: {
          evaluations: null,
          private_play_dayboarding: null,
          half_and_half_daytime: null,
          large_daycare: null,
          small_daycare: null,
          unclassified_daycare: null,
          total_daycare: null,
        },
        support: {
          departure_baths: null,
          morning_feeding_dogs: null,
          evening_feeding_dogs: null,
          medication_dogs: null,
          tours: null,
          total_dog_volume: null,
        },
      },
      solver_inputs: {
        peak_large_daycare: 0,
        peak_small_daycare: 0,
        peak_unknown_daycare: 0,
        total_private_play_dogs: 0,
        morning_feeding_dogs: 0,
        evening_feeding_dogs: 0,
        medication_dogs: 0,
      },
    },
    computed_at: null,
    _source: "empty",
    _confidence: "none",
  };
}
