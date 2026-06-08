import { useMemo } from "react";
import { TASK_COLORS } from "../../../shared/schedulingEngine";
import { buildTemplatePreviewGrid } from "../rotationTemplatePreview";

export function TemplateThumbnail({ match }) {
  const template = match?.template;
  const preview = useMemo(() => buildTemplatePreviewGrid(template, { shift: template?.shift }), [template]);
  const lanes = preview.lanes.slice(0, 3);
  const slots = preview.slots.slice(0, 6);
  return (
    <div className="rotation-template-thumb" aria-hidden="true">
      {lanes.map((lane) => (
        <div key={lane.id} className="rotation-template-thumb-lane">
          {slots.map((slot) => {
            const task = preview.cells?.[lane.id]?.[slot.time]?.task || "off";
            const color = TASK_COLORS[task] || TASK_COLORS.float;
            return (
              <span
                key={`${lane.id}-${slot.time}`}
                style={{
                  background: task === "off" ? "#F8FAFC" : color.bg,
                  borderColor: task === "off" ? "#E5E7EB" : `${color.text}22`,
                }}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
