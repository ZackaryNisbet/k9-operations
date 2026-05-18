import { TASK_COLORS } from "../../shared/schedulingEngine";

const DEFAULT_OPENING_TIMES = ["06:00", "06:30", "07:00", "07:30", "08:00", "08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30"];
const DEFAULT_CLOSING_TIMES = ["13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30", "18:00", "18:30", "19:00"];

function toCount(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : 0;
}

function formatTimeLabel(time) {
  const [hourRaw, minute = "00"] = String(time || "00:00").split(":");
  const hour = Number(hourRaw);
  const suffix = hour >= 12 ? "PM" : "AM";
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${hour12}:${minute} ${suffix}`;
}

function normalizeRoleLabel(role) {
  if (role === "manager" || role === "mod") return "MOD";
  if (role === "supervisor") return "Supervisor";
  if (role === "csr") return "CSR";
  return "PCT";
}

function buildGeneratedLanes(staffingCounts = {}) {
  const laneRoles = [
    ["pct", toCount(staffingCounts.pct)],
    ["supervisor", toCount(staffingCounts.supervisor)],
    ["csr", toCount(staffingCounts.csr)],
    ["manager", toCount(staffingCounts.manager)],
  ];
  const lanes = [];
  laneRoles.forEach(([role, count]) => {
    for (let index = 0; index < count; index += 1) {
      lanes.push({
        id: `${role}-${index + 1}`,
        label: `${normalizeRoleLabel(role)} ${index + 1}`,
        role,
      });
    }
  });
  return lanes.length ? lanes : [{ id: "pct-1", label: "PCT 1", role: "pct" }];
}

function hasExplicitStaffingCounts(staffingCounts = {}) {
  return ["manager", "supervisor", "csr", "pct"].some((key) => Object.prototype.hasOwnProperty.call(staffingCounts, key));
}

function normalizeLaneRole(role) {
  const normalized = String(role || "").toLowerCase();
  if (normalized === "mod") return "manager";
  if (normalized === "manager") return "manager";
  if (normalized === "supervisor") return "supervisor";
  if (normalized === "csr") return "csr";
  return "pct";
}

function roleRank(role) {
  const ranks = { pct: 0, supervisor: 1, csr: 2, manager: 3, mod: 3 };
  return ranks[role] ?? 4;
}

function alignSourceLanesToTarget(sourceLanes = [], targetLanes = []) {
  const sourceByRole = new Map();
  for (const lane of sourceLanes || []) {
    const role = normalizeLaneRole(lane.role);
    if (!sourceByRole.has(role)) sourceByRole.set(role, []);
    sourceByRole.get(role).push(lane);
  }

  const sortedTargetLanes = [...targetLanes].sort((a, b) => roleRank(normalizeLaneRole(a.role || a.position)) - roleRank(normalizeLaneRole(b.role || b.position)));
  const fallbackSourceLanes = [...(sourceLanes || [])];
  const usedSourceIds = new Set();
  const takeUnusedForRole = (role) => (sourceByRole.get(role) || []).find((lane) => !usedSourceIds.has(lane.id));

  return sortedTargetLanes.map((targetLane) => {
    const role = normalizeLaneRole(targetLane.role || targetLane.position);
    const exact = takeUnusedForRole(role);
    const pctFallback = role === "pct" ? takeUnusedForRole("pct") : null;
    const anyFallback = role === "pct" ? fallbackSourceLanes.find((lane) => !usedSourceIds.has(lane.id)) : null;
    const sourceLane = exact || pctFallback || anyFallback || null;
    if (sourceLane) usedSourceIds.add(sourceLane.id);
    return { targetLane, sourceLane };
  });
}

function buildSlots(times = []) {
  return [...new Set(times.filter(Boolean))].sort().map((time) => ({
    time,
    label: formatTimeLabel(time),
  }));
}

function normalizeTemplateTime(time, shift) {
  const raw = String(time || "").trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return raw;
  const hour = Number(match[1]);
  const minute = match[2];
  const isClosing = shift === "closing" || shift === "PM";
  const normalizedHour = isClosing && hour > 0 && hour < 12 ? hour + 12 : hour;
  return `${String(normalizedHour).padStart(2, "0")}:${minute}`;
}

export function buildBlankRotationPreviewGrid({ shift = "opening", staffingCounts = {}, template = null } = {}) {
  const templateShift = template?.shift || shift;
  const templateSlots = template?.timeSlots?.map((slot) => normalizeTemplateTime(slot.time, templateShift)).filter(Boolean) || [];
  const templateLanes = (template?.lanes || []).map((lane) => ({
    id: lane.key,
    label: lane.label,
    role: lane.role || "pct",
  }));
  const shouldUseGeneratedLanes = hasExplicitStaffingCounts(staffingCounts);
  return {
    lanes: !shouldUseGeneratedLanes && templateLanes.length ? templateLanes : buildGeneratedLanes(staffingCounts),
    slots: buildSlots(templateSlots.length ? templateSlots : shift === "closing" ? DEFAULT_CLOSING_TIMES : DEFAULT_OPENING_TIMES),
    cells: {},
  };
}

export function buildTemplatePreviewGrid(template, options = {}) {
  const blank = buildBlankRotationPreviewGrid({ ...options, template });
  if (!template) return blank;
  const cells = {};
  const templateShift = template.shift || options.shift;
  const templateLanes = (template.lanes || []).map((lane) => ({
    id: lane.key,
    label: lane.label,
    role: lane.role || "pct",
  }));
  const lanePairs = alignSourceLanesToTarget(templateLanes, blank.lanes);
  const previewLaneByTemplateLaneId = new Map(lanePairs.map((pair) => [pair.sourceLane?.id, pair.targetLane?.id]));
  for (const cell of template.cells || []) {
    const previewLaneId = previewLaneByTemplateLaneId.get(cell.laneKey) || cell.laneKey;
    if (!cells[previewLaneId]) cells[previewLaneId] = {};
    const taskKey = TASK_COLORS[cell.taskKey] ? cell.taskKey : "float";
    const time = normalizeTemplateTime(cell.time, templateShift);
    cells[previewLaneId][time] = {
      task: taskKey,
      label: cell.raw || TASK_COLORS[taskKey]?.label || "Available",
      detail: cell.raw && TASK_COLORS[taskKey]?.label && cell.raw !== TASK_COLORS[taskKey].label ? TASK_COLORS[taskKey].label : "",
      source: "template",
    };
  }
  for (const lane of blank.lanes || []) {
    if (!cells[lane.id]) cells[lane.id] = {};
    for (const slot of blank.slots || []) {
      if (!cells[lane.id][slot.time]) {
        cells[lane.id][slot.time] = {
          task: "float",
          label: TASK_COLORS.float.label,
          detail: "Available",
          source: "template_gap",
        };
      }
    }
  }
  return {
    ...blank,
    sourceSheetName: template.sourceSheetName,
    templateId: template.id || template.sourceSheetName,
    cells,
  };
}

function alignTemplateLanesToServer(templateGrid, serverLanes = []) {
  return alignSourceLanesToTarget(templateGrid.lanes || [], serverLanes).map(({ targetLane, sourceLane }) => ({
    serverLane: targetLane,
    templateLane: sourceLane,
  }));
}

export function mapTemplatePreviewToServerGrid(templateGrid, serverGridData) {
  const serverLanes = serverGridData?.lanes || [];
  const serverSlots = serverGridData?.slots || [];
  const serverCells = serverGridData?.cells || {};
  const mapped = Object.fromEntries(serverLanes.map((lane) => [lane.id, { ...(serverCells[lane.id] || {}) }]));
  const lanePairs = alignTemplateLanesToServer(templateGrid, serverLanes);
  const templateTimes = new Set((templateGrid.slots || []).map((slot) => slot.time));

  for (const { serverLane, templateLane } of lanePairs) {
    if (!serverLane || !templateLane) continue;
    for (const slot of serverSlots) {
      if (!templateTimes.has(slot.time)) continue;
      const cell = templateGrid.cells?.[templateLane.id]?.[slot.time];
      if (!cell) continue;
      mapped[serverLane.id][slot.time] = {
        task: cell.task || "float",
        label: cell.label || TASK_COLORS[cell.task || "float"]?.label || "Available",
        detail: cell.detail || "Workbook template",
        notes: `Source template: ${templateGrid.sourceSheetName || "Workbook"}`,
      };
    }
  }

  return mapped;
}

export function getTemplateMetrics(template) {
  const taskCounts = template?.taskCounts || {};
  return [
    ["Large", taskCounts.lgdc || 0],
    ["Small", taskCounts.smdc || 0],
    ["PP", taskCounts.pp || 0],
    ["Breaks", taskCounts.break || 0],
  ].filter(([, value]) => value > 0);
}
