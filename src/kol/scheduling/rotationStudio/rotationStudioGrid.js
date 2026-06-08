import { TASK_COLORS } from "../../../shared/schedulingEngine";

export function clonePreviewGrid(grid) {
  return {
    ...grid,
    lanes: [...(grid?.lanes || [])],
    slots: [...(grid?.slots || [])],
    cells: Object.fromEntries(Object.entries(grid?.cells || {}).map(([laneId, laneCells]) => [
      laneId,
      { ...laneCells },
    ])),
  };
}

export function getCandidateId(match) {
  return match?.template?.id || match?.template?.sourceSheetName || "";
}

export function getTaskCell(taskKey, label = "") {
  const task = TASK_COLORS[taskKey] ? taskKey : "float";
  return {
    task,
    label: label || TASK_COLORS[task]?.label || "Available",
    detail: "Manual draft edit",
    source: "custom",
  };
}
