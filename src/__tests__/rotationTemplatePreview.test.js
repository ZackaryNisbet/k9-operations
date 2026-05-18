import { describe, expect, it } from "vitest";
import {
  buildTemplatePreviewGrid,
  mapTemplatePreviewToServerGrid,
} from "../kol/scheduling/rotationTemplatePreview";

const pmTemplate = {
  id: "template-pm",
  sourceSheetName: "4 Person PM",
  shift: "PM",
  lanes: [
    { key: "person_1", label: "PCT 1", role: "pct" },
    { key: "supervisor_1", label: "Supervisor", role: "supervisor" },
  ],
  timeSlots: [
    { time: "01:00" },
    { time: "01:30" },
  ],
  cells: [
    { laneKey: "person_1", time: "01:00", taskKey: "lgdc", raw: "Large Dogs" },
    { laneKey: "supervisor_1", time: "01:30", taskKey: "feed", raw: "Feeding / Meds" },
  ],
};

describe("rotation template preview", () => {
  it("normalizes PM workbook times to the canonical 24-hour schedule grid", () => {
    const grid = buildTemplatePreviewGrid(pmTemplate, { shift: "closing" });

    expect(grid.sourceSheetName).toBe("4 Person PM");
    expect(grid.slots.map((slot) => slot.time)).toEqual(["13:00", "13:30"]);
    expect(grid.cells.person_1["13:00"].task).toBe("lgdc");
    expect(grid.cells.supervisor_1["13:30"].task).toBe("feed");
  });

  it("keeps the preview grid based on configured staff lanes when counts are provided", () => {
    const grid = buildTemplatePreviewGrid(pmTemplate, {
      shift: "closing",
      staffingCounts: { manager: 1, supervisor: 1, csr: 0, pct: 1 },
    });

    expect(grid.lanes.map((lane) => lane.id)).toEqual(["pct-1", "supervisor-1", "manager-1"]);
    expect(grid.cells["pct-1"]["13:00"].task).toBe("lgdc");
    expect(grid.cells["supervisor-1"]["13:30"].task).toBe("feed");
    expect(grid.cells["manager-1"]["13:30"].task).toBe("float");
    expect(grid.cells["manager-1"]["13:30"].source).toBe("template_gap");
  });

  it("overlays template cells onto the server grid without dropping existing cells", () => {
    const preview = buildTemplatePreviewGrid(pmTemplate, { shift: "closing" });
    const mapped = mapTemplatePreviewToServerGrid(preview, {
      lanes: [
        { id: "lane-supervisor", label: "Supervisor", position: "supervisor" },
        { id: "lane-pct", label: "PCT", position: "pct" },
      ],
      slots: [
        { time: "13:00" },
        { time: "13:30" },
        { time: "14:00" },
      ],
      cells: {
        "lane-supervisor": {
          "14:00": { task: "float", label: "Keep me" },
        },
        "lane-pct": {},
      },
    });

    expect(mapped["lane-pct"]["13:00"].task).toBe("lgdc");
    expect(mapped["lane-supervisor"]["13:30"].task).toBe("feed");
    expect(mapped["lane-supervisor"]["14:00"].label).toBe("Keep me");
    expect(mapped["lane-pct"]["13:00"].notes).toContain("4 Person PM");
  });
});
