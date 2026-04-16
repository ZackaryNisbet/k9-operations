import { describe, it, expect } from "vitest";
import { moveRoleLayoutItem, sanitizeLayoutState } from "../kol/pages/RoleLayoutPage.jsx";

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

describe("moveRoleLayoutItem", () => {
  it("moves Next Day Collars from CSR opening to CSR closing atomically", () => {
    const input = {
      "csr::opening": [
        {
          task_id: "wf_collars",
          task_label: "Next Day Collars",
          item_type: "workflow",
          workflow_id: "collars",
          role: "csr",
          section: "opening",
          sort_order: 0,
        },
        {
          task_id: "custom_opening",
          task_label: "Opening Desk Check",
          role: "csr",
          section: "opening",
          sort_order: 1,
        },
      ],
      "csr::closing": [
        {
          task_id: "custom_closing",
          task_label: "Closing Desk Check",
          role: "csr",
          section: "closing",
          sort_order: 0,
        },
      ],
    };

    const result = moveRoleLayoutItem(
      input,
      { role: "csr", section: "opening", index: 0, item: input["csr::opening"][0] },
      "csr",
      "closing",
      1
    );

    expect(result.moved).toBe(true);
    expect(result.items["csr::opening"].map((item) => item.task_id)).toEqual(["custom_opening"]);
    expect(result.items["csr::closing"].map((item) => item.task_id)).toEqual(["custom_closing", "wf_collars"]);
    expect(result.items["csr::closing"][1]).toMatchObject({
      task_id: "wf_collars",
      role: "csr",
      section: "closing",
      sort_order: 1,
    });
    expect(input["csr::opening"].map((item) => item.task_id)).toEqual(["wf_collars", "custom_opening"]);
  });
});
