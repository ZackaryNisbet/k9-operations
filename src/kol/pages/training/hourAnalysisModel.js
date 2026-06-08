// Hour Analysis & Labor Capacity Model — pure data builders extracted verbatim
// from TrainingPage.jsx (Wave 2). Behavior is byte-identical; these are
// module-scope helpers relocated here with imports re-pointed to the colocated
// training/ modules. No React/JSX or component state is involved.

import { getLaborEmploymentCommitmentLabel, isLaborEmployeeActive, readLaborEmploymentCommitment } from "../../trainingData";
import {
  DEFAULT_HOUR_ANALYSIS_EXPECTATIONS,
  HOUR_ANALYSIS_FULL_TIME_HIRE_EQUIVALENT_HOURS,
  HOUR_ANALYSIS_GROUPS,
  HOUR_ANALYSIS_GROUP_LABELS,
  LABOR_CAPACITY_MODEL_DEFAULT_NAME,
  LABOR_MODEL_DAY_KEYS,
  LABOR_MODEL_DAY_LABELS,
  LABOR_MODEL_DAY_SHORT_LABELS,
} from "./constants";
import {
  addHourAnalysisRange,
  addHourAnalysisRangeDelta,
  buildHourAnalysisCapacityStandard,
  buildHourAnalysisCapacityStatus,
  buildHourAnalysisRangeFromHours,
  calculateLaborModelRowHourBuckets,
  combineHourAnalysisCapacityStandards,
  formatHourAnalysisHours,
  formatLaborPositionTitle,
  getHourAnalysisEmployeeKey,
  getHourAnalysisGroupKey,
  getHourAnalysisGroupLabel,
  getHourAnalysisGroupShortLabel,
  getLaborModelCoverageMarketingWeight,
  getLaborModelCoverageOperatingGroupKey,
  getLaborModelCoverageOperatingWeight,
  getStaffingCapacityRoleSettings,
  isObjectRow,
  makeHourAnalysisRangeTotals,
  makeLaborCapacityModelTempId,
  makeLaborModelRoleHoursBucket,
  mergeHourAnalysisRange,
  normalizeHourAnalysisAuditLog,
  normalizeHourAnalysisDelta,
  normalizeHourAnalysisExpectationMap,
  normalizeHourAnalysisLaborModelDay,
  normalizeHourAnalysisNotes,
  normalizeHourAnalysisNumber,
  normalizeHourAnalysisOverrideRange,
  normalizeHourAnalysisOverrides,
  normalizeHourAnalysisPositionMovement,
  normalizeHourAnalysisPositionMovements,
  normalizeHourAnalysisSplits,
  normalizeHourAnalysisThresholds,
  normalizeHourAnalysisWhatIfRows,
  normalizeLaborCapacityModelName,
  normalizeLaborModelBreakerSettings,
  normalizeLaborModelGroupKey,
  normalizeLaborModelRolePalette,
  normalizePositionTitle,
  resolveHourAnalysisCoverageSplit,
  sumHourAnalysisRanges,
  toObjectRows,
  validateLaborModelColumns,
} from "./helpers";
import { DEFAULT_HOUR_ANALYSIS_LABOR_MODEL, cloneDefaultHourAnalysisLaborModel } from "./laborModelDefaults";

export function normalizeHourAnalysisLaborModel(value = {}) {
  const defaults = cloneDefaultHourAnalysisLaborModel();
  const source = isObjectRow(value) ? value : {};
  const rawDays = isObjectRow(source.days) ? source.days : source;
  return {
    version: Number(source.version || defaults.version || 1),
    source: String(source.source || defaults.source || "").trim(),
    breakers: normalizeLaborModelBreakerSettings(source.breakers || source.greyBars || source.grayBars || source.breakerSettings || source.breaker_settings),
    days: Object.fromEntries(LABOR_MODEL_DAY_KEYS.map((dayKey) => [
      dayKey,
      normalizeHourAnalysisLaborModelDay(dayKey, rawDays[dayKey], defaults.days[dayKey]),
    ])),
  };
}





function buildHourAnalysisLaborModelSummary(model = DEFAULT_HOUR_ANALYSIS_LABOR_MODEL) {
  const normalizedModel = normalizeHourAnalysisLaborModel(model);
  const roleWeekly = makeLaborModelRoleHoursBucket();
  const dayRows = LABOR_MODEL_DAY_KEYS.map((dayKey) => {
    const day = normalizedModel.days[dayKey];
    const columnValidation = validateLaborModelColumns(day.columns);
    const roleHours = makeLaborModelRoleHoursBucket();
    let totalHours = 0;
    let marketingHours = 0;
    let peakCoverage = 0;
    const baseRowSummaries = day.rows.map((row) => {
      const rowBuckets = calculateLaborModelRowHourBuckets(row, day.columns);
      const rowHours = rowBuckets.operatingHours;
      const groupKey = normalizeLaborModelGroupKey(row.group_key, row);
      Object.entries(rowBuckets.roleHours || {}).forEach(([roleKey, roleHourValue]) => {
        if (!HOUR_ANALYSIS_GROUP_LABELS[roleKey] || roleHourValue <= 0) return;
        roleHours[roleKey] = normalizeHourAnalysisDelta((roleHours[roleKey] || 0) + roleHourValue);
        roleWeekly[roleKey] = normalizeHourAnalysisDelta((roleWeekly[roleKey] || 0) + roleHourValue);
      });
      totalHours = normalizeHourAnalysisDelta(totalHours + rowHours);
      marketingHours = normalizeHourAnalysisDelta(marketingHours + rowBuckets.marketingHours);
      return {
        ...row,
        group_key: groupKey,
        hours: rowHours,
        roleHours: rowBuckets.roleHours,
        marketingHours: rowBuckets.marketingHours,
        totalHours: rowBuckets.totalHours,
        breakHours: rowBuckets.breakHours,
      };
    });
    const rowSummaries = baseRowSummaries.map((row, index, rows) => {
      const runKey = `${row.group_key}:${row.shift_type}`;
      let startIndex = index;
      while (startIndex > 0 && `${rows[startIndex - 1].group_key}:${rows[startIndex - 1].shift_type}` === runKey) startIndex -= 1;
      let endIndex = index;
      while (endIndex + 1 < rows.length && `${rows[endIndex + 1].group_key}:${rows[endIndex + 1].shift_type}` === runKey) endIndex += 1;
      const runLength = endIndex - startIndex + 1;
      return {
        ...row,
        runIndex: index - startIndex + 1,
        runLength,
      };
    });
    const columnTotals = day.columns.map((column, index) => {
      const operatingCoverage = rowSummaries.reduce((sum, row) => sum + getLaborModelCoverageOperatingWeight(row.coverage[index]), 0);
      const marketingCoverage = rowSummaries.reduce((sum, row) => sum + getLaborModelCoverageMarketingWeight(row.coverage[index]), 0);
      const slotHours = normalizeHourAnalysisNumber(column.hours, 0);
      peakCoverage = Math.max(peakCoverage, operatingCoverage);
      return {
        index,
        label: column.label,
        operatingCoverage: normalizeHourAnalysisNumber(operatingCoverage, 0),
        marketingCoverage: normalizeHourAnalysisNumber(marketingCoverage, 0),
        operatingHours: normalizeHourAnalysisNumber(operatingCoverage * slotHours, 0),
        marketingHours: normalizeHourAnalysisNumber(marketingCoverage * slotHours, 0),
      };
    });
    return {
      key: dayKey,
      label: LABOR_MODEL_DAY_LABELS[dayKey] || dayKey,
      shortLabel: LABOR_MODEL_DAY_SHORT_LABELS[dayKey] || dayKey,
      coverageWindow: day.coverage_window,
      columns: day.columns,
      rows: rowSummaries,
      roleHours,
      totalHours,
      marketingHours,
      columnTotals,
      peakCoverage,
      columnValidation,
    };
  });
  const totalWeekly = normalizeHourAnalysisNumber(dayRows.reduce((sum, row) => sum + row.totalHours, 0), 0);
  const totalMarketingWeekly = normalizeHourAnalysisNumber(dayRows.reduce((sum, row) => sum + row.marketingHours, 0), 0);
  const highestDay = dayRows.reduce((winner, row) => (row.totalHours > (winner?.totalHours || 0) ? row : winner), dayRows[0] || null);
  return {
    model: normalizedModel,
    dayRows,
    roleWeekly: Object.fromEntries(Object.entries(roleWeekly).map(([key, value]) => [key, normalizeHourAnalysisNumber(value, 0)])),
    totalWeekly,
    totalMarketingWeekly,
    averageDaily: normalizeHourAnalysisNumber(totalWeekly / 7, 0),
    highestDay,
    hasRows: dayRows.some((day) => day.rows.length > 0 && day.columns.length > 0),
  };
}

export function buildLaborModelCrossRoleCoverageSummary(settings = {}) {
  const normalizedSettings = normalizeHourAnalysisSettings(settings);
  const rows = [];
  LABOR_MODEL_DAY_KEYS.forEach((dayKey) => {
    const day = normalizedSettings.laborModel.days[dayKey];
    if (!day) return;
    day.rows.forEach((row) => {
      const homeGroupKey = normalizeLaborModelGroupKey(row.group_key, row);
      const rawOperatingHours = row.coverage.reduce((sum, cell, index) => {
        const weight = getLaborModelCoverageOperatingWeight(cell);
        return sum + (weight * normalizeHourAnalysisNumber(day.columns[index]?.hours, 0));
      }, 0);
      const rowBuckets = calculateLaborModelRowHourBuckets(row, day.columns);
      const operatingScale = rawOperatingHours > 0 ? rowBuckets.operatingHours / rawOperatingHours : 0;
      row.coverage.forEach((cell, index) => {
        const workedGroupKey = getLaborModelCoverageOperatingGroupKey(cell, row);
        const weight = getLaborModelCoverageOperatingWeight(cell);
        if (!homeGroupKey || !workedGroupKey || homeGroupKey === workedGroupKey || weight <= 0) return;
        const hours = normalizeHourAnalysisNumber(weight * normalizeHourAnalysisNumber(day.columns[index]?.hours, 0) * operatingScale, 0);
        if (hours <= 0) return;
        const key = `${homeGroupKey}->${workedGroupKey}`;
        const existing = rows.find((item) => item.key === key);
        if (existing) {
          existing.hours = normalizeHourAnalysisNumber(existing.hours + hours, 0);
          existing.slots += 1;
          if (!existing.days.includes(dayKey)) existing.days.push(dayKey);
          return;
        }
        rows.push({
          key,
          from_group_key: homeGroupKey,
          from_label: getHourAnalysisGroupShortLabel(homeGroupKey),
          to_group_key: workedGroupKey,
          to_label: getHourAnalysisGroupShortLabel(workedGroupKey),
          hours,
          slots: 1,
          days: [dayKey],
        });
      });
    });
  });
  return rows
    .sort((left, right) => (right.hours - left.hours) || left.key.localeCompare(right.key))
    .map((row) => ({
      ...row,
      day_labels: row.days.map((dayKey) => LABOR_MODEL_DAY_SHORT_LABELS[dayKey] || dayKey),
    }));
}


export function normalizeLaborCapacityModelVersionRow(row = {}) {
  const source = isObjectRow(row) ? row : {};
  const createdAt = source.created_at || source.createdAt || null;
  return {
    id: String(source.id || makeLaborCapacityModelTempId("labor-model-version")).trim(),
    model_id: String(source.model_id || source.modelId || "").trim(),
    location_id: String(source.location_id || source.locationId || "").trim(),
    version_no: Math.max(0, Math.round(Number(source.version_no ?? source.versionNo ?? 0) || 0)),
    model_name: normalizeLaborCapacityModelName(source.model_name || source.modelName || source.name, LABOR_CAPACITY_MODEL_DEFAULT_NAME),
    model_settings_snapshot: normalizeHourAnalysisSettings(source.model_settings_snapshot || source.modelSettingsSnapshot || source.settings || source.model_settings),
    change_type: String(source.change_type || source.changeType || "update").trim() || "update",
    change_summary: String(source.change_summary || source.changeSummary || "").trim(),
    changed_by_user_id: source.changed_by_user_id || source.changedByUserId || null,
    changed_by_name: String(source.changed_by_name || source.changedByName || "").trim(),
    created_at: createdAt,
  };
}

export function normalizeLaborCapacityModelVersions(rows = []) {
  return toObjectRows(rows)
    .map((row) => normalizeLaborCapacityModelVersionRow(row))
    .sort((left, right) => {
      if (right.version_no !== left.version_no) return right.version_no - left.version_no;
      return String(right.created_at || "").localeCompare(String(left.created_at || ""));
    });
}

export function summarizeLaborCapacityModelSnapshotDiff(currentSettings = {}, snapshotSettings = {}) {
  const current = normalizeHourAnalysisSettings(currentSettings);
  const snapshot = normalizeHourAnalysisSettings(snapshotSettings);
  const currentSummary = buildHourAnalysisLaborModelSummary(current.laborModel);
  const snapshotSummary = buildHourAnalysisLaborModelSummary(snapshot.laborModel);
  const changes = [];
  const pushHoursDiff = (label, before, after) => {
    const normalizedBefore = normalizeHourAnalysisNumber(before, 0);
    const normalizedAfter = normalizeHourAnalysisNumber(after, 0);
    if (normalizedBefore === normalizedAfter) return;
    const delta = normalizeHourAnalysisDelta(normalizedAfter - normalizedBefore);
    changes.push(`${label}: ${formatHourAnalysisHours(normalizedBefore)} -> ${formatHourAnalysisHours(normalizedAfter)} hrs (${delta > 0 ? "+" : "-"}${formatHourAnalysisHours(Math.abs(delta))})`);
  };

  pushHoursDiff("Weekly floor", snapshotSummary.totalWeekly, currentSummary.totalWeekly);
  pushHoursDiff("Marketing", snapshotSummary.totalMarketingWeekly, currentSummary.totalMarketingWeekly);
  HOUR_ANALYSIS_GROUPS.forEach((group) => {
    if (group.key === "other") return;
    pushHoursDiff(`${getHourAnalysisGroupShortLabel(group.key)} floor`, snapshotSummary.roleWeekly[group.key], currentSummary.roleWeekly[group.key]);
    ["full_time", "part_time"].forEach((commitment) => {
      const before = snapshot.expectations[group.key]?.[commitment]?.expected;
      const after = current.expectations[group.key]?.[commitment]?.expected;
      if (normalizeHourAnalysisNumber(before, 0) !== normalizeHourAnalysisNumber(after, 0)) {
        changes.push(`${getHourAnalysisGroupShortLabel(group.key)} ${getLaborEmploymentCommitmentLabel(commitment)} expected: ${formatHourAnalysisHours(before)} -> ${formatHourAnalysisHours(after)} hrs`);
      }
    });
  });
  if (snapshot.whatIfRows.length !== current.whatIfRows.length) {
    changes.push(`What-if rows: ${snapshot.whatIfRows.length} -> ${current.whatIfRows.length}`);
  }
  return changes.slice(0, 12);
}























export function normalizeHourAnalysisSettings(value = {}) {
  const source = isObjectRow(value) ? value : {};
  const laborModelSource = source.laborModel || source.labor_model || source.laborModelSettings || source.labor_model_settings;
  const thresholdSource = isObjectRow(source.thresholds || source.coverage || source.capacity)
    ? (source.thresholds || source.coverage || source.capacity)
    : {};
  const topLevelStaffingCapacity = source.staffing_capacity || source.staffingCapacity || source.staffingCapacitySettings;
  return {
    expectations: normalizeHourAnalysisExpectationMap(source.expectations),
    overrides: normalizeHourAnalysisOverrides(source.overrides),
    notes: normalizeHourAnalysisNotes(source.notes || source.justifications),
    splits: normalizeHourAnalysisSplits(source.splits || source.coverage_splits || source.coverageSplits),
    positionMovements: normalizeHourAnalysisPositionMovements(source.positionMovements || source.position_movements || source.movements || source.roleMovements || source.role_movements),
    whatIfRows: normalizeHourAnalysisWhatIfRows(source.whatIfRows || source.what_if_rows),
    thresholds: normalizeHourAnalysisThresholds(topLevelStaffingCapacity
      ? { ...thresholdSource, staffing_capacity: topLevelStaffingCapacity }
      : thresholdSource),
    laborModel: normalizeHourAnalysisLaborModel(laborModelSource),
    laborModelRoleColors: normalizeLaborModelRolePalette(
      source.laborModelRoleColors
        || source.labor_model_role_colors
        || source.roleColors
        || source.role_colors
        || laborModelSource?.roleColors
        || laborModelSource?.role_colors
    ),
    auditLog: normalizeHourAnalysisAuditLog(source.auditLog || source.audit_log),
  };
}

export function clearHourAnalysisPlanningState(value = {}) {
  const normalized = normalizeHourAnalysisSettings(value);
  const whatIfIds = new Set(
    normalized.whatIfRows
      .map((row) => String(row?.id || row?.employeeKey || "").trim())
      .filter(Boolean)
  );
  const nextNotes = { ...normalized.notes };
  const nextSplits = { ...normalized.splits };
  let removedWhatIfNotes = 0;
  let removedWhatIfSplits = 0;
  whatIfIds.forEach((id) => {
    if (Object.prototype.hasOwnProperty.call(nextNotes, id)) {
      delete nextNotes[id];
      removedWhatIfNotes += 1;
    }
    if (Object.prototype.hasOwnProperty.call(nextSplits, id)) {
      delete nextSplits[id];
      removedWhatIfSplits += 1;
    }
  });
  const removedWhatIfRows = normalized.whatIfRows.length;
  const removedPositionMovements = Object.keys(normalized.positionMovements || {}).length;
  const changed = Boolean(removedWhatIfRows || removedPositionMovements || removedWhatIfNotes || removedWhatIfSplits);
  return {
    settings: {
      ...normalized,
      notes: nextNotes,
      splits: nextSplits,
      positionMovements: {},
      whatIfRows: [],
    },
    summary: {
      changed,
      removedWhatIfRows,
      removedPositionMovements,
      removedWhatIfNotes,
      removedWhatIfSplits,
    },
  };
}



export function normalizeLaborCapacityModelRow(row = {}, fallbackSettings = {}) {
  const source = isObjectRow(row) ? row : {};
  const modelSettings = source.model_settings || source.modelSettings || source.settings || fallbackSettings;
  const createdAt = source.created_at || source.createdAt || null;
  const updatedAt = source.updated_at || source.updatedAt || createdAt || null;
  return {
    id: String(source.id || makeLaborCapacityModelTempId()).trim(),
    location_id: String(source.location_id || source.locationId || "").trim(),
    name: normalizeLaborCapacityModelName(source.name, LABOR_CAPACITY_MODEL_DEFAULT_NAME),
    description: String(source.description || "").trim(),
    model_settings: normalizeHourAnalysisSettings(modelSettings),
    is_active: Boolean(source.is_active ?? source.isActive),
    archived_at: source.archived_at || source.archivedAt || null,
    activated_at: source.activated_at || source.activatedAt || null,
    created_by_user_id: source.created_by_user_id || source.createdByUserId || null,
    created_by_name: source.created_by_name || source.createdByName || "",
    updated_by_user_id: source.updated_by_user_id || source.updatedByUserId || null,
    updated_by_name: source.updated_by_name || source.updatedByName || "",
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

export function normalizeLaborCapacityModels(rows = [], fallbackSettings = {}) {
  return toObjectRows(rows)
    .map((row) => normalizeLaborCapacityModelRow(row, fallbackSettings))
    .sort((left, right) => {
      if (left.archived_at && !right.archived_at) return 1;
      if (!left.archived_at && right.archived_at) return -1;
      if (left.is_active && !right.is_active) return -1;
      if (!left.is_active && right.is_active) return 1;
      return String(right.updated_at || "").localeCompare(String(left.updated_at || ""));
    });
}

export function getActiveLaborCapacityModel(models = []) {
  return normalizeLaborCapacityModels(models).find((model) => model.is_active && !model.archived_at) || null;
}

export function applyLaborCapacityModelActivation(models = [], activeModelId = "") {
  const targetId = String(activeModelId || "").trim();
  return normalizeLaborCapacityModels(models).map((model) => ({
    ...model,
    is_active: Boolean(targetId && model.id === targetId && !model.archived_at),
    activated_at: targetId && model.id === targetId && !model.archived_at ? model.activated_at || new Date().toISOString() : model.activated_at,
  }));
}

export function buildDefaultLaborCapacityModelPayload({
  locationId = "",
  name = LABOR_CAPACITY_MODEL_DEFAULT_NAME,
  settings = {},
  actorUserId = null,
  actorName = "",
  isActive = true,
} = {}) {
  return {
    location_id: String(locationId || "").trim(),
    name: normalizeLaborCapacityModelName(name, LABOR_CAPACITY_MODEL_DEFAULT_NAME),
    model_settings: normalizeHourAnalysisSettings(settings),
    is_active: Boolean(isActive),
    activated_at: isActive ? new Date().toISOString() : null,
    created_by_user_id: actorUserId || null,
    created_by_name: actorName || "",
    updated_by_user_id: actorUserId || null,
    updated_by_name: actorName || "",
  };
}

export function selectStaffingCapacitySettings({
  models = [],
  editingModelId = "",
  editingSettings = {},
  legacySettings = {},
} = {}) {
  const normalizedModels = normalizeLaborCapacityModels(models);
  const activeModel = getActiveLaborCapacityModel(normalizedModels);
  if (!activeModel) return normalizeHourAnalysisSettings(legacySettings || editingSettings);
  if (String(activeModel.id) === String(editingModelId || "")) {
    return normalizeHourAnalysisSettings(editingSettings);
  }
  return normalizeHourAnalysisSettings(activeModel.model_settings);
}

export function buildHourAnalysisModel({ rosterRows = [], settings = {} } = {}) {
  const normalizedSettings = normalizeHourAnalysisSettings(settings);
  const laborModelSummary = buildHourAnalysisLaborModelSummary(normalizedSettings.laborModel);
  const activeRows = toObjectRows(rosterRows).filter((row) => isLaborEmployeeActive(row));
  const makeEmptyBucket = () => ({ fullTime: 0, partTime: 0, unassigned: 0, total: 0, whatIfFullTime: 0, whatIfPartTime: 0, whatIfTotal: 0 });
  const headcountByGroup = Object.fromEntries(HOUR_ANALYSIS_GROUPS.map((group) => [group.key, makeEmptyBucket()]));
  const makeWeeklyBucket = () => ({
    fullTime: makeHourAnalysisRangeTotals(),
    partTime: makeHourAnalysisRangeTotals(),
    total: makeHourAnalysisRangeTotals(),
    whatIfFullTime: makeHourAnalysisRangeTotals(),
    whatIfPartTime: makeHourAnalysisRangeTotals(),
    whatIfTotal: makeHourAnalysisRangeTotals(),
  });
  const weeklyHoursByGroup = Object.fromEntries(HOUR_ANALYSIS_GROUPS.map((group) => [group.key, makeWeeklyBucket()]));
  const activeRowsByEmployeeKey = new Map();
  activeRows.forEach((row) => {
    const employeeKey = getHourAnalysisEmployeeKey(row);
    if (employeeKey && !activeRowsByEmployeeKey.has(employeeKey)) activeRowsByEmployeeKey.set(employeeKey, row);
  });

  const addHeadcount = ({ groupKey, commitment, isWhatIf = false, delta = 1 }) => {
    const target = headcountByGroup[groupKey] || headcountByGroup.other;
    const amount = normalizeHourAnalysisDelta(Number(delta));
    if (commitment === "full_time") target[isWhatIf ? "whatIfFullTime" : "fullTime"] += amount;
    else if (commitment === "part_time") target[isWhatIf ? "whatIfPartTime" : "partTime"] += amount;
    else if (!isWhatIf) target.unassigned += amount;
    if (isWhatIf) target.whatIfTotal += amount;
    else target.total += amount;
  };

  const addWeeklyHours = ({ groupKey, commitment, range, isWhatIf = false, delta = 1 }) => {
    const target = weeklyHoursByGroup[groupKey] || weeklyHoursByGroup.other;
    if (commitment === "full_time") {
      addHourAnalysisRangeDelta(isWhatIf ? target.whatIfFullTime : target.fullTime, range, delta);
    } else if (commitment === "part_time") {
      addHourAnalysisRangeDelta(isWhatIf ? target.whatIfPartTime : target.partTime, range, delta);
    }
    addHourAnalysisRangeDelta(isWhatIf ? target.whatIfTotal : target.total, range, delta);
  };

  const employeeRows = activeRows.map((row) => {
    const employeeKey = getHourAnalysisEmployeeKey(row);
    const sourcePositionTitle = formatLaborPositionTitle(row.position_title || row.position || "");
    const sourceGroupKey = getHourAnalysisGroupKey(row);
    const commitment = readLaborEmploymentCommitment(row);
    const overrideRange = employeeKey ? normalizeHourAnalysisOverrideRange(normalizedSettings.overrides[employeeKey]) : {};
    const sourceInheritedRange = commitment ? normalizedSettings.expectations[sourceGroupKey]?.[commitment] ?? makeHourAnalysisRangeTotals() : makeHourAnalysisRangeTotals();
    const sourcePreferredRange = mergeHourAnalysisRange(sourceInheritedRange, overrideRange);
    const movement = employeeKey ? normalizeHourAnalysisPositionMovement(normalizedSettings.positionMovements[employeeKey]) : {};
    const targetPositionTitle = movement.position_title || sourcePositionTitle;
    const isMovement = Boolean(movement.position_title && normalizePositionTitle(movement.position_title) !== normalizePositionTitle(sourcePositionTitle));
    const groupKey = isMovement ? movement.group_key || getHourAnalysisGroupKey({ position_title: targetPositionTitle }) : sourceGroupKey;
    const effectiveRow = { ...row, position_title: targetPositionTitle, position: targetPositionTitle };
    const inheritedRange = commitment ? normalizedSettings.expectations[groupKey]?.[commitment] ?? makeHourAnalysisRangeTotals() : makeHourAnalysisRangeTotals();
    const preferredRange = mergeHourAnalysisRange(inheritedRange, overrideRange);
    const note = employeeKey ? String(normalizedSettings.notes[employeeKey] || "").trim() : "";
    const sourceSplit = resolveHourAnalysisCoverageSplit({
      row,
      groupKey: sourceGroupKey,
      preferredHours: sourcePreferredRange.expected,
      split: employeeKey ? normalizedSettings.splits[employeeKey] : {},
    });
    addHeadcount({ groupKey: sourceGroupKey, commitment });
    addWeeklyHours({ groupKey: sourceGroupKey, commitment, range: buildHourAnalysisRangeFromHours(sourceSplit.primary_hours) });
    if (sourceSplit.floor_group && sourceSplit.floor_hours > 0) {
      addWeeklyHours({ groupKey: sourceSplit.floor_group, commitment, range: buildHourAnalysisRangeFromHours(sourceSplit.floor_hours) });
    }
    const split = resolveHourAnalysisCoverageSplit({
      row: effectiveRow,
      groupKey,
      preferredHours: preferredRange.expected,
      split: employeeKey ? normalizedSettings.splits[employeeKey] : {},
    });
    if (isMovement) {
      addHeadcount({ groupKey: sourceGroupKey, commitment, isWhatIf: true, delta: -1 });
      addWeeklyHours({ groupKey: sourceGroupKey, commitment, range: buildHourAnalysisRangeFromHours(sourceSplit.primary_hours), isWhatIf: true, delta: -1 });
      if (sourceSplit.floor_group && sourceSplit.floor_hours > 0) {
        addWeeklyHours({ groupKey: sourceSplit.floor_group, commitment, range: buildHourAnalysisRangeFromHours(sourceSplit.floor_hours), isWhatIf: true, delta: -1 });
      }
      addHeadcount({ groupKey, commitment, isWhatIf: true });
      addWeeklyHours({ groupKey, commitment, range: buildHourAnalysisRangeFromHours(split.primary_hours), isWhatIf: true });
      if (split.floor_group && split.floor_hours > 0) {
        addWeeklyHours({ groupKey: split.floor_group, commitment, range: buildHourAnalysisRangeFromHours(split.floor_hours), isWhatIf: true });
      }
    }
    return {
      ...row,
      employeeKey,
      sourcePositionTitle,
      sourceGroupKey,
      sourceGroupLabel: getHourAnalysisGroupLabel(sourceGroupKey),
      position_title: targetPositionTitle,
      groupKey,
      groupLabel: getHourAnalysisGroupLabel(groupKey),
      commitment,
      inheritedRange,
      overrideRange,
      preferredRange,
      inheritedHours: inheritedRange.expected,
      overrideHours: Object.prototype.hasOwnProperty.call(overrideRange, "expected") ? overrideRange.expected : null,
      preferredHours: preferredRange.expected,
      note,
      split,
      isOverride: Object.keys(overrideRange).length > 0,
      isSplit: Boolean(split.floor_group && split.floor_hours > 0),
      isMovement,
      isWhatIf: false,
    };
  });

  const whatIfRows = normalizedSettings.whatIfRows.map((row) => {
    const isMovement = row.scenario_type === "move";
    const sourceEmployeeKey = String(row.source_employee_key || "").trim();
    const sourceRow = isMovement && sourceEmployeeKey ? activeRowsByEmployeeKey.get(sourceEmployeeKey) : null;
    let sourcePlan = null;
    if (sourceRow) {
      const sourceGroupKey = getHourAnalysisGroupKey(sourceRow);
      const sourceCommitment = readLaborEmploymentCommitment(sourceRow) || row.source_employment_commitment || "full_time";
      const sourceInheritedRange = sourceCommitment ? normalizedSettings.expectations[sourceGroupKey]?.[sourceCommitment] ?? makeHourAnalysisRangeTotals() : makeHourAnalysisRangeTotals();
      const sourceOverrideRange = normalizeHourAnalysisOverrideRange(normalizedSettings.overrides[sourceEmployeeKey]);
      const sourcePreferredRange = mergeHourAnalysisRange(sourceInheritedRange, sourceOverrideRange);
      const sourceSplit = resolveHourAnalysisCoverageSplit({
        row: sourceRow,
        groupKey: sourceGroupKey,
        preferredHours: sourcePreferredRange.expected,
        split: normalizedSettings.splits[sourceEmployeeKey] || {},
      });
      sourcePlan = {
        employeeKey: sourceEmployeeKey,
        full_name: sourceRow.full_name || [sourceRow.first_name, sourceRow.last_name].filter(Boolean).join(" ") || row.source_full_name || "Moved employee",
        position_title: formatLaborPositionTitle(sourceRow.position_title || sourceRow.position || row.source_position_title || ""),
        groupKey: sourceGroupKey,
        groupLabel: getHourAnalysisGroupLabel(sourceGroupKey),
        commitment: sourceCommitment,
        preferredHours: sourcePreferredRange.expected,
        split: sourceSplit,
      };
      addHeadcount({ groupKey: sourceGroupKey, commitment: sourceCommitment, isWhatIf: true, delta: -1 });
      addWeeklyHours({ groupKey: sourceGroupKey, commitment: sourceCommitment, range: buildHourAnalysisRangeFromHours(sourceSplit.primary_hours), isWhatIf: true, delta: -1 });
      if (sourceSplit.floor_group && sourceSplit.floor_hours > 0) {
        addWeeklyHours({ groupKey: sourceSplit.floor_group, commitment: sourceCommitment, range: buildHourAnalysisRangeFromHours(sourceSplit.floor_hours), isWhatIf: true, delta: -1 });
      }
    }
    const groupKey = row.group_key || getHourAnalysisGroupKey(row);
    const commitment = readLaborEmploymentCommitment(row) || "full_time";
    const inheritedRange = normalizedSettings.expectations[groupKey]?.[commitment] ?? makeHourAnalysisRangeTotals();
    const overrideRange = normalizeHourAnalysisOverrideRange(row.hour_overrides);
    const preferredRange = mergeHourAnalysisRange(inheritedRange, overrideRange);
    const split = resolveHourAnalysisCoverageSplit({
      row,
      groupKey,
      preferredHours: preferredRange.expected,
      split: normalizedSettings.splits[row.id] || row.split,
    });
    addHeadcount({ groupKey, commitment, isWhatIf: true });
    addWeeklyHours({ groupKey, commitment, range: buildHourAnalysisRangeFromHours(split.primary_hours), isWhatIf: true });
    if (split.floor_group && split.floor_hours > 0) {
      addWeeklyHours({ groupKey: split.floor_group, commitment, range: buildHourAnalysisRangeFromHours(split.floor_hours), isWhatIf: true });
    }
    return {
      id: row.id,
      employeeKey: row.id,
      scenarioType: row.scenario_type,
      isMovement,
      sourceEmployeeKey,
      sourcePlan,
      sourceFullName: sourcePlan?.full_name || row.source_full_name || "",
      sourcePositionTitle: formatLaborPositionTitle(sourcePlan?.position_title || row.source_position_title || ""),
      sourceGroupKey: sourcePlan?.groupKey || row.source_group_key || "",
      sourceGroupLabel: sourcePlan?.groupLabel || getHourAnalysisGroupLabel(row.source_group_key || "other"),
      sourceCommitment: sourcePlan?.commitment || row.source_employment_commitment || "",
      sourcePreferredHours: sourcePlan?.preferredHours ?? null,
      sourceMissing: isMovement && !sourcePlan,
      full_name: row.full_name,
      position_title: formatLaborPositionTitle(row.position_title),
      groupKey,
      groupLabel: getHourAnalysisGroupLabel(groupKey),
      commitment,
      employment_commitment: commitment,
      inheritedRange,
      overrideRange,
      preferredRange,
      inheritedHours: inheritedRange.expected,
      overrideHours: Object.prototype.hasOwnProperty.call(overrideRange, "expected") ? overrideRange.expected : null,
      preferredHours: preferredRange.expected,
      note: normalizedSettings.notes[row.id] || row.note || "",
      split,
      isOverride: Object.keys(overrideRange).length > 0,
      isSplit: Boolean(split.floor_group && split.floor_hours > 0),
      isWhatIf: true,
    };
  });

  const headcountRows = HOUR_ANALYSIS_GROUPS
    .map((group) => {
      const counts = headcountByGroup[group.key] || makeEmptyBucket();
      return {
        key: group.key,
        label: group.label,
        ...counts,
        projectedFullTime: counts.fullTime + counts.whatIfFullTime,
        projectedPartTime: counts.partTime + counts.whatIfPartTime,
        projectedTotal: counts.total + counts.whatIfTotal,
      };
    })
    .filter((row) => row.key !== "other" || row.total || row.whatIfTotal || row.unassigned);

  const weeklyRows = HOUR_ANALYSIS_GROUPS
    .map((group) => {
      const hours = weeklyHoursByGroup[group.key] || makeWeeklyBucket();
      const projected = sumHourAnalysisRanges(hours.total, hours.whatIfTotal);
      const legacyDailySkeleton = normalizeHourAnalysisNumber(normalizedSettings.thresholds.daily_skeleton[group.key], 0);
      const requiredWeekly = laborModelSummary.hasRows
        ? normalizeHourAnalysisNumber(laborModelSummary.roleWeekly[group.key] || 0, 0)
        : normalizeHourAnalysisNumber(legacyDailySkeleton * 7, 0);
      const requiredDaily = normalizeHourAnalysisNumber(requiredWeekly / 7, 0);
      const roleCapacitySettings = getStaffingCapacityRoleSettings(normalizedSettings.thresholds.staffing_capacity, group.key);
      const reliefPercent = roleCapacitySettings.targetBufferPercent;
      const capacityStandard = buildHourAnalysisCapacityStandard(requiredWeekly, reliefPercent, roleCapacitySettings);
      const isFrontline = reliefPercent > 0;
      const targetWeekly = capacityStandard.targetWeekly;
      const expectedHireHours = normalizeHourAnalysisNumber(
        normalizedSettings.expectations[group.key]?.full_time?.expected,
        DEFAULT_HOUR_ANALYSIS_EXPECTATIONS[group.key]?.full_time?.expected || HOUR_ANALYSIS_FULL_TIME_HIRE_EQUIVALENT_HOURS,
      );
      const expectedGapToTarget = normalizeHourAnalysisDelta(projected.expected - targetWeekly);
      const hireDeficitHours = Math.max(0, normalizeHourAnalysisDelta(targetWeekly - projected.expected));
      const recommendedFullTimeHires = hireDeficitHours > 0 && expectedHireHours > 0 ? Math.ceil(hireDeficitHours / expectedHireHours) : 0;
      const recommendedFullTimeEquivalent = hireDeficitHours > 0 && expectedHireHours > 0 ? normalizeHourAnalysisNumber(hireDeficitHours / expectedHireHours, 0) : 0;
      return {
        key: group.key,
        label: group.label,
        ...hours,
        projected,
        min: projected.min,
        expected: projected.expected,
        max: projected.max,
        requiredDaily,
        requiredWeekly,
        reliefPercent,
        targetWeekly,
        capacityStandard,
        expectedGapToTarget,
        hireDeficitHours,
        expectedHireHours,
        isFrontline,
        recommendedFullTimeHires,
        recommendedFullTimeEquivalent,
        recommendedHireHours: normalizeHourAnalysisNumber(recommendedFullTimeHires * expectedHireHours, 0),
        capacityStatus: buildHourAnalysisCapacityStatus({ requiredWeekly, targetWeekly, capacity: projected, standard: capacityStandard }),
      };
    })
    .filter((row) => row.key !== "other" || row.total.expected || row.whatIfTotal.expected || row.requiredWeekly);

  const totals = weeklyRows.reduce((acc, row) => {
    addHourAnalysisRange(acc.fullTime, row.fullTime);
    addHourAnalysisRange(acc.partTime, row.partTime);
    addHourAnalysisRange(acc.total, row.total);
    addHourAnalysisRange(acc.whatIfFullTime, row.whatIfFullTime);
    addHourAnalysisRange(acc.whatIfPartTime, row.whatIfPartTime);
    addHourAnalysisRange(acc.whatIfTotal, row.whatIfTotal);
    return acc;
  }, {
    fullTime: makeHourAnalysisRangeTotals(),
    partTime: makeHourAnalysisRangeTotals(),
    total: makeHourAnalysisRangeTotals(),
    whatIfFullTime: makeHourAnalysisRangeTotals(),
    whatIfPartTime: makeHourAnalysisRangeTotals(),
    whatIfTotal: makeHourAnalysisRangeTotals(),
  });
  const projectedFullTime = sumHourAnalysisRanges(totals.fullTime, totals.whatIfFullTime);
  const projectedPartTime = sumHourAnalysisRanges(totals.partTime, totals.whatIfPartTime);
  const projectedTotal = sumHourAnalysisRanges(totals.total, totals.whatIfTotal);
  const legacyRequiredDaily = HOUR_ANALYSIS_GROUPS.reduce((sum, group) => sum + normalizeHourAnalysisNumber(normalizedSettings.thresholds.daily_skeleton[group.key], 0), 0);
  const requiredWeekly = laborModelSummary.hasRows
    ? normalizeHourAnalysisNumber(laborModelSummary.totalWeekly, 0)
    : normalizeHourAnalysisNumber(legacyRequiredDaily * 7, 0);
  const requiredDaily = normalizeHourAnalysisNumber(requiredWeekly / 7, 0);
  const capacityStandard = combineHourAnalysisCapacityStandards(weeklyRows);
  const targetWeekly = capacityStandard.targetWeekly;
  const expectedGapToTarget = normalizeHourAnalysisDelta(projectedTotal.expected - targetWeekly);
  const hireDeficitHours = Math.max(0, normalizeHourAnalysisDelta(targetWeekly - projectedTotal.expected));
  const fullTimeEquivalentHires = hireDeficitHours > 0 ? normalizeHourAnalysisNumber(hireDeficitHours / HOUR_ANALYSIS_FULL_TIME_HIRE_EQUIVALENT_HOURS, 0) : 0;
  const fullTimeHireCount = hireDeficitHours > 0 ? Math.max(1, Math.round(hireDeficitHours / HOUR_ANALYSIS_FULL_TIME_HIRE_EQUIVALENT_HOURS)) : 0;
  const hiringRecommendations = weeklyRows
    .filter((row) => row.recommendedFullTimeHires > 0)
    .map((row) => ({
      key: row.key,
      label: row.label,
      shortHours: row.hireDeficitHours,
      hireCount: row.recommendedFullTimeHires,
      hireEquivalent: row.recommendedFullTimeEquivalent,
      hireHours: row.recommendedHireHours,
      expectedHireHours: row.expectedHireHours,
      isFrontline: row.isFrontline,
    }));
  const roleDeficitHours = normalizeHourAnalysisNumber(hiringRecommendations.reduce((sum, row) => sum + row.shortHours, 0), 0);
  const roleSurplusRows = weeklyRows
    .filter((row) => row.expectedGapToTarget > 0)
    .map((row) => ({
      key: row.key,
      label: row.label,
      surplusHours: row.expectedGapToTarget,
    }));
  const roleSurplusHours = normalizeHourAnalysisNumber(roleSurplusRows.reduce((sum, row) => sum + row.surplusHours, 0), 0);
  const recommendedPlanHours = hireDeficitHours;
  const recommendedPlanHeadcount = fullTimeHireCount;
  const expectedAfterRecommendedPlan = normalizeHourAnalysisNumber(projectedTotal.expected + recommendedPlanHours, 0);
  const wholeRolePlanHours = normalizeHourAnalysisNumber(hiringRecommendations.reduce((sum, row) => sum + row.hireHours, 0), 0);
  const wholeRolePlanHeadcount = hiringRecommendations.reduce((sum, row) => sum + row.hireCount, 0);
  const expectedAfterWholeRolePlan = normalizeHourAnalysisNumber(projectedTotal.expected + wholeRolePlanHours, 0);
  const headcountTotals = headcountRows.reduce((acc, row) => ({
    fullTime: acc.fullTime + row.fullTime,
    partTime: acc.partTime + row.partTime,
    unassigned: acc.unassigned + row.unassigned,
    total: acc.total + row.total,
    whatIfFullTime: acc.whatIfFullTime + row.whatIfFullTime,
    whatIfPartTime: acc.whatIfPartTime + row.whatIfPartTime,
    whatIfTotal: acc.whatIfTotal + row.whatIfTotal,
  }), { fullTime: 0, partTime: 0, unassigned: 0, total: 0, whatIfFullTime: 0, whatIfPartTime: 0, whatIfTotal: 0 });

  return {
    settings: normalizedSettings,
    rows: [...employeeRows, ...whatIfRows],
    employeeRows,
    whatIfRows,
    headcountRows,
    headcountTotals,
    weeklyRows,
    laborModelSummary,
    totals: {
      ...totals,
      rosterRange: totals.total,
      whatIfRange: totals.whatIfTotal,
      projectedFullTimeRange: projectedFullTime,
      projectedPartTimeRange: projectedPartTime,
      projectedRange: projectedTotal,
      projectedFullTime: projectedFullTime.expected,
      projectedPartTime: projectedPartTime.expected,
      projectedTotal: projectedTotal.expected,
      requiredDaily,
      requiredWeekly,
      targetWeekly,
      healthyLowWeekly: capacityStandard.healthyLowWeekly,
      healthyHighWeekly: capacityStandard.healthyHighWeekly,
      overRosteredWeekly: capacityStandard.overRosteredWeekly,
      capacityStandard,
      expectedGapToTarget,
      hireDeficitHours,
      fullTimeEquivalentHires,
      fullTimeHireCount,
      hiringRecommendations,
      roleDeficitHours,
      roleSurplusRows,
      roleSurplusHours,
      recommendedPlanHours,
      recommendedPlanHeadcount,
      expectedAfterRecommendedPlan,
      wholeRolePlanHours,
      wholeRolePlanHeadcount,
      expectedAfterWholeRolePlan,
      reservePercent: normalizedSettings.thresholds.reserve_percent,
      capacityStatus: buildHourAnalysisCapacityStatus({ requiredWeekly, targetWeekly, capacity: projectedTotal, standard: capacityStandard }),
      min: totals.total.min,
      expected: totals.total.expected,
      max: totals.total.max,
      whatIfMin: totals.whatIfTotal.min,
      whatIfExpected: totals.whatIfTotal.expected,
      whatIfMax: totals.whatIfTotal.max,
      projectedMin: projectedTotal.min,
      projectedExpected: projectedTotal.expected,
      projectedMax: projectedTotal.max,
      total: totals.total.expected,
      whatIfTotal: totals.whatIfTotal.expected,
      projectedHeadcount: headcountTotals.total + headcountTotals.whatIfTotal,
      projectedFullTimeHeadcount: headcountTotals.fullTime + headcountTotals.whatIfFullTime,
      projectedPartTimeHeadcount: headcountTotals.partTime + headcountTotals.whatIfPartTime,
    },
  };
}
