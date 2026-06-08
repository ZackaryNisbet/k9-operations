import { TASK_COLORS } from "../../../shared/schedulingEngine";
import { formatTimeLabel } from "./rotationStudioDates";

const TASK_PICKER_KEYS = [
  "lgdc",
  "smdc",
  "pp",
  "break",
  "bath",
  "transport",
  "feed",
  "opening",
  "room_clean",
  "sup",
  "float",
  "off",
];

export function CellInspector({ cell, laneLabel, onApplyTask, onClose }) {
  if (!cell) return null;
  return (
    <div className="rotation-cell-inspector">
      <div>
        <strong>Cell edit</strong>
        <span>{formatTimeLabel(cell.slotTime)} · {laneLabel || cell.laneId}</span>
      </div>
      <div className="rotation-task-palette">
        {TASK_PICKER_KEYS.map((key) => {
          const task = TASK_COLORS[key];
          if (!task) return null;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onApplyTask(key)}
              style={{
                background: task.bg,
                color: task.text,
                borderColor: `${task.text}22`,
              }}
            >
              {task.label}
            </button>
          );
        })}
      </div>
      <button type="button" className="rotation-inspector-close" onClick={onClose}>
        Done
      </button>
    </div>
  );
}
