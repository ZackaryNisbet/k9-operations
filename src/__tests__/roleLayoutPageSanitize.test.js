import { describe, it, expect } from "vitest";
import { sanitizeLayoutState } from "../kol/pages/RoleLayoutPage.jsx";

describe("sanitizeLayoutState", () => {
  it("removes duplicate task ids within the same cell and renumbers sort order", () => {
    const input = {
      "supervisor::opening": [
        { task_id: "wf_roll_call_opening", task_label: "Opening Roll Call", sort_order: 0 },
        { task_id: "wf_roll_call_opening", task_label: "Opening Roll Call", sort_order: 1 },
        { task_id: "custom_abc", task_label: "AM feeding and medications", sort_order: 2 },
      ],
    };

    const result = sanitizeLayoutState(input);

    expect(result.duplicateCount).toBe(1);
    expect(result.items["supervisor::opening"]).toEqual([
      {
        task_id: "wf_roll_call_opening",
        task_label: "Opening Roll Call",
        role: "supervisor",
        section: "opening",
        sort_order: 0,
      },
      {
        task_id: "custom_abc",
        task_label: "AM feeding and medications",
        role: "supervisor",
        section: "opening",
        sort_order: 1,
      },
    ]);
  });
});
