import { addDays, todayStr } from "../../shared/theme";
import {
  getMatrixDisplay,
  getMatrixProjectedDisplay,
  getMatrixProjection,
} from "../../shared/schedulingEngine";
import {
  ATTENDANCE_INCIDENT_OPTIONS,
  summarizeAttendanceIncidents,
} from "../attendanceData";
import {
  PERFORMANCE_REVIEW_CYCLES,
  getPerformanceReviewCompliance,
  getPerformanceReviewCycleStatus,
} from "../performanceReviewData";
import {
  buildDemandMatrixRowGroups,
  formatDemandMatrixValue,
  summarizeAggregateMatrixCell,
} from "../pages/schedulingDemandMatrixModel";

export const ENTERPRISE_DATE_PRESETS = [
  { key: "today", label: "Today" },
  { key: "wtd", label: "WTD" },
  { key: "mtd", label: "MTD" },
  { key: "qtd", label: "QTD" },
  { key: "ytd", label: "YTD" },
  { key: "rolling_7", label: "7 Days" },
  { key: "rolling_30", label: "30 Days" },
  { key: "custom", label: "Custom" },
];

const COMPLETED_REVIEW_STATUSES = new Set(["complete", "completed", "current", "signed"]);

const TRADE_GROUPS = [
  { key: "handyman", label: "Handyman", terms: ["handyman", "handy man", "general repair", "maintenance"] },
  { key: "hvac", label: "HVAC", terms: ["hvac", "heating", "cooling", "air conditioning", "rtu", "dehumidifier"] },
  { key: "plumbing", label: "Plumbing", terms: ["plumb", "water heater", "drain", "sewer"] },
  { key: "electrical", label: "Electrical", terms: ["electric", "lighting", "power"] },
  { key: "pest", label: "Pest Control", terms: ["pest", "termite", "exterminator"] },
  { key: "fire_life_safety", label: "Fire / Life Safety", terms: ["fire", "sprinkler", "alarm", "suppression", "life safety"] },
  { key: "security", label: "Security", terms: ["security", "camera", "adt", "access control"] },
  { key: "landscaping", label: "Landscaping", terms: ["landscap", "lawn", "tree", "snow", "salt", "plow"] },
  { key: "trash", label: "Trash", terms: ["trash", "waste", "dumpster", "recycling"] },
  { key: "cleaning", label: "Cleaning", terms: ["clean", "janitor", "floor", "carpet"] },
];

function parseDate(date) {
  return new Date(`${date}T12:00:00`);
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function getMondayStart(dateValue) {
  const date = parseDate(dateValue);
  const day = date.getDay();
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
  return formatDate(date);
}

function getMonthStart(dateValue) {
  const date = parseDate(dateValue);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

function getQuarterStart(dateValue) {
  const date = parseDate(dateValue);
  const quarterMonth = Math.floor(date.getMonth() / 3) * 3;
  return `${date.getFullYear()}-${String(quarterMonth + 1).padStart(2, "0")}-01`;
}

function getYearStart(dateValue) {
  const date = parseDate(dateValue);
  return `${date.getFullYear()}-01-01`;
}

export function getEnterpriseDateRange(presetKey, customStart = "", customEnd = "", todayValue = todayStr()) {
  const end = todayValue;
  let start = todayValue;
  if (presetKey === "wtd") start = getMondayStart(todayValue);
  if (presetKey === "mtd") start = getMonthStart(todayValue);
  if (presetKey === "qtd") start = getQuarterStart(todayValue);
  if (presetKey === "ytd") start = getYearStart(todayValue);
  if (presetKey === "rolling_7") start = addDays(todayValue, -6);
  if (presetKey === "rolling_30") start = addDays(todayValue, -29);
  if (presetKey === "custom") {
    start = customStart || todayValue;
    return {
      startDate: start,
      endDate: customEnd || start,
    };
  }
  return { startDate: start, endDate: end };
}

export function formatEnterpriseDateRangeLabel(startDate, endDate) {
  if (!startDate || !endDate) return "";
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  const format = (date) => date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (startDate === endDate) return format(start);
  return `${format(start)} - ${format(end)}`;
}

export function normalizeLocationRows(rows = []) {
  return rows
    .filter((row) => row?.id)
    .map((row) => ({
      id: row.id,
      name: row.name || row.display_name || row.slug || "Unnamed Resort",
      slug: row.slug || "",
      region: row.region || row.data?.region || "",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function locationNameById(locations = []) {
  return new Map(normalizeLocationRows(locations).map((location) => [location.id, location.name]));
}

export function buildEnterpriseMatrixDays(matrixRows = []) {
  return matrixRows
    .filter((row) => row?.matrix_date)
    .map((row) => ({
      date: row.matrix_date,
      matrix: row,
      currentDisplay: getMatrixDisplay(row),
      projectedDisplay: getMatrixProjectedDisplay(row),
      projection: getMatrixProjection(row),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function buildEnterpriseVolumeModel({ locations = [], matrixRows = [], mode = "current" } = {}) {
  const locationList = normalizeLocationRows(locations);
  const daysByLocation = new Map(locationList.map((location) => [location.id, []]));
  buildEnterpriseMatrixDays(matrixRows).forEach((day) => {
    const locationId = day.matrix?.location_id;
    if (!daysByLocation.has(locationId)) daysByLocation.set(locationId, []);
    daysByLocation.get(locationId).push(day);
  });

  const allDays = [...daysByLocation.values()].flat();
  const rowGroups = buildDemandMatrixRowGroups(allDays).map((group) => ({
    ...group,
    rows: group.rows.map((row) => ({
      ...row,
      totalRow: Boolean(row.total),
      locations: locationList.map((location) => {
        const days = daysByLocation.get(location.id) || [];
        const aggregate = summarizeAggregateMatrixCell(days, row, mode);
        const currentAggregate = mode === "projected" && !row.comparison
          ? summarizeAggregateMatrixCell(days, row, "current")
          : null;
        return {
          locationId: location.id,
          hasValue: aggregate.hasValue,
          value: aggregate.value,
          label: aggregate.hasValue ? formatDemandMatrixValue(aggregate.value, row.format) : aggregate.unavailableLabel,
          currentLabel: currentAggregate?.hasValue ? formatDemandMatrixValue(currentAggregate.value, row.format) : "",
        };
      }),
      total: summarizeAggregateMatrixCell(allDays, row, mode),
      currentTotal: mode === "projected" && !row.comparison
        ? summarizeAggregateMatrixCell(allDays, row, "current")
        : null,
    })),
  }));

  const findMetric = (key) => {
    const row = rowGroups.flatMap((group) => group.rows).find((candidate) => candidate.key === key);
    if (!row?.total?.hasValue) return 0;
    return Number(row.total.value) || 0;
  };

  return {
    rowGroups,
    metrics: {
      totalDogVolume: findMetric("support.total_dog_volume"),
      daycare: findMetric("daycare.total_daycare"),
      boardingOpening: findMetric("opening.total_boarding"),
      boardingClosing: findMetric("closing.total_boarding"),
      departureBaths: findMetric("support.departure_baths"),
      tours: findMetric("support.tours"),
    },
  };
}

export function buildEnterpriseAttendanceRows({ locations = [], laborEmployees = [], incidents = [] } = {}) {
  const locationList = normalizeLocationRows(locations);
  const incidentsByEmployeeId = new Map();
  incidents.forEach((incident) => {
    if (!incident?.labor_employee_id) return;
    const rows = incidentsByEmployeeId.get(incident.labor_employee_id) || [];
    rows.push(incident);
    incidentsByEmployeeId.set(incident.labor_employee_id, rows);
  });

  const rows = locationList.map((location) => {
    const employees = laborEmployees.filter((employee) => employee.location_id === location.id);
    const locationIncidents = employees.flatMap((employee) => incidentsByEmployeeId.get(employee.id) || []);
    const summary = summarizeAttendanceIncidents({ laborEmployees: employees, incidents: locationIncidents });
    return {
      id: location.id,
      locationName: location.name,
      activeEmployees: summary.rows.length,
      byType: summary.totals.byType,
      total30: summary.totals.total30,
      totalAll: summary.totals.totalAll,
    };
  });

  const totals = ATTENDANCE_INCIDENT_OPTIONS.reduce((acc, option) => {
    acc[option.value] = {
      last30: rows.reduce((sum, row) => sum + (row.byType[option.value]?.last30 || 0), 0),
      allTime: rows.reduce((sum, row) => sum + (row.byType[option.value]?.allTime || 0), 0),
    };
    return acc;
  }, {});

  return {
    rows,
    totals: {
      activeEmployees: rows.reduce((sum, row) => sum + row.activeEmployees, 0),
      byType: totals,
      total30: rows.reduce((sum, row) => sum + row.total30, 0),
      totalAll: rows.reduce((sum, row) => sum + row.totalAll, 0),
    },
  };
}

function hasCompletedReview(employee) {
  return PERFORMANCE_REVIEW_CYCLES.some((cycle) => (
    COMPLETED_REVIEW_STATUSES.has(String(employee?.[cycle.statusKey] || "").toLowerCase())
  ));
}

function isEnterpriseLaborEmployeeActive(employee) {
  if (!employee || typeof employee !== "object") return false;
  const explicitStatus = String(employee.employment_status || "").trim().toLowerCase();
  if (explicitStatus === "active") return true;
  if (explicitStatus === "inactive" || explicitStatus === "terminated") return false;
  if (typeof employee.is_active === "boolean") return employee.is_active;
  return !employee.end_date && !employee.endDate;
}

export function buildPerformanceComplianceRows({ locations = [], laborEmployees = [], todayValue = todayStr() } = {}) {
  const rows = normalizeLocationRows(locations).map((location) => {
    const employees = laborEmployees.filter((employee) => employee.location_id === location.id && isEnterpriseLaborEmployeeActive(employee));
    const completedEmployees = employees.filter(hasCompletedReview);
    const complianceRows = employees.map((employee) => getPerformanceReviewCompliance(employee, todayValue));
    const cycleStatuses = employees.flatMap((employee) => (
      PERFORMANCE_REVIEW_CYCLES.map((cycle) => getPerformanceReviewCycleStatus(employee, cycle.id, todayValue))
    ));
    const compliantEmployees = complianceRows.filter((compliance) => compliance.label === "Compliant").length;
    const overdueEmployees = complianceRows.filter((compliance) => compliance.label === "Non-compliant").length;
    const needsSetupEmployees = complianceRows.filter((compliance) => compliance.label === "Needs setup").length;
    return {
      id: location.id,
      locationName: location.name,
      activeEmployees: employees.length,
      compliantEmployees,
      completedEmployees: completedEmployees.length,
      overdueEmployees,
      needsSetupEmployees,
      completedCycles: cycleStatuses.filter((cycle) => cycle.completed).length,
      overdueCycles: cycleStatuses.filter((cycle) => cycle.overdue).length,
      compliancePct: employees.length ? Math.round((compliantEmployees / employees.length) * 100) : 0,
    };
  });

  const activeEmployees = rows.reduce((sum, row) => sum + row.activeEmployees, 0);
  const completedEmployees = rows.reduce((sum, row) => sum + row.completedEmployees, 0);
  const compliantEmployees = rows.reduce((sum, row) => sum + row.compliantEmployees, 0);
  return {
    rows,
    totals: {
      activeEmployees,
      compliantEmployees,
      completedEmployees,
      overdueEmployees: rows.reduce((sum, row) => sum + row.overdueEmployees, 0),
      needsSetupEmployees: rows.reduce((sum, row) => sum + row.needsSetupEmployees, 0),
      completedCycles: rows.reduce((sum, row) => sum + row.completedCycles, 0),
      overdueCycles: rows.reduce((sum, row) => sum + row.overdueCycles, 0),
      compliancePct: activeEmployees ? Math.round((compliantEmployees / activeEmployees) * 100) : 0,
    },
  };
}

export function inferVendorTrade(vendor = {}) {
  const metadata = vendor.metadata && typeof vendor.metadata === "object" ? vendor.metadata : {};
  const direct = metadata.trade || metadata.vendor_trade || metadata.category || metadata.service_category;
  if (direct) {
    const key = String(direct).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    const known = TRADE_GROUPS.find((group) => group.key === key || group.label.toLowerCase() === String(direct).toLowerCase());
    return known || { key, label: String(direct) };
  }
  const searchable = [
    vendor.business_name,
    vendor.business_address,
    vendor.website,
    vendor.notes,
    JSON.stringify(vendor.contact_info || []),
  ].join(" ").toLowerCase();
  return TRADE_GROUPS.find((group) => group.terms.some((term) => searchable.includes(term))) || { key: "other", label: "Other" };
}

export function getEnterpriseVendorTradeOptions(vendors = []) {
  const seen = new Map();
  vendors.forEach((vendor) => {
    const trade = inferVendorTrade(vendor);
    seen.set(trade.key, trade);
  });
  return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export function buildEnterpriseVendorRows({ vendors = [], locations = [] } = {}) {
  const names = locationNameById(locations);
  return vendors.map((vendor) => {
    const trade = inferVendorTrade(vendor);
    const contact = Array.isArray(vendor.contact_info) ? vendor.contact_info[0] || {} : {};
    return {
      ...vendor,
      locationName: names.get(vendor.location_id) || "Unknown Resort",
      tradeKey: trade.key,
      tradeLabel: trade.label,
      primaryContact: contact.name || contact.full_name || contact.email || contact.phone || "",
    };
  }).sort((a, b) => a.locationName.localeCompare(b.locationName) || String(a.business_name || "").localeCompare(String(b.business_name || "")));
}

export function buildEnterpriseLicenseRows({ licenses = [], locations = [] } = {}) {
  const names = locationNameById(locations);
  return licenses.map((license) => ({
    ...license,
    locationName: names.get(license.location_id) || "Unknown Resort",
  })).sort((a, b) => a.locationName.localeCompare(b.locationName) || String(a.requirement_name || "").localeCompare(String(b.requirement_name || "")));
}

export function buildOpsCompletionRows({ locations = [], opsRows = [] } = {}) {
  return normalizeLocationRows(locations).map((location) => {
    const rows = opsRows.filter((row) => row.location_id === location.id);
    const aggregate = rows.reduce((acc, row) => {
      const items = row.computed_items || row.items || {};
      Object.values(items).forEach((value) => {
        const done = value === true
          || value === "done"
          || value === "completed"
          || (value && typeof value === "object" && (value.done || value.completed));
        acc.total += 1;
        if (done) acc.completed += 1;
      });
      return acc;
    }, { total: 0, completed: 0 });
    return {
      id: location.id,
      locationName: location.name,
      ...aggregate,
      completionPct: aggregate.total ? Math.round((aggregate.completed / aggregate.total) * 100) : 0,
    };
  });
}
