// Tests for RoleLayoutPage buildWorkflowSummary helper
// Verifies that the workflow summary section correctly computes:
// - which workflows are in use and by how many roles
// - which workflows are unused
// - which workflows are shared across multiple roles vs single-role

import { describe, it, expect } from "vitest";
import { buildWorkflowSummary } from "../kol/pages/RoleLayoutPage";

const ROLES = [
  { id: "pct", label: "PCT" },
  { id: "csr", label: "CSR" },
  { id: "supervisor", label: "MOD" },
];

const SECTIONS = [
  { id: "opening" },
  { id: "midday" },
  { id: "closing" },
  { id: "as_needed" },
];

const WORKFLOW_DEFS = [
  { id: "bathing", label: "Bathing" },
  { id: "room_cleaning", label: "Room Cleaning" },
  { id: "pp", label: "Private Play" },
  { id: "meds", label: "Medications" },
  { id: "evaluations", label: "Evaluations" },
];

function cellKey(role, section) { return `${role}::${section}`; }

function buildCellItems(entries) {
  const items = {};
  ROLES.forEach(r => SECTIONS.forEach(s => { items[cellKey(r.id, s.id)] = []; }));
  entries.forEach(({ role, section, workflows }) => {
    const key = cellKey(role, section);
    workflows.forEach(wfId => {
      items[key].push({
        task_id: `wf_${wfId}`,
        task_label: WORKFLOW_DEFS.find(w => w.id === wfId)?.label || wfId,
        item_type: "workflow",
        workflow_id: wfId,
        section,
        role,
      });
    });
  });
  return items;
}

describe("buildWorkflowSummary", () => {
  it("reports all workflows as unused when no cells have workflows", () => {
    const items = {};
    ROLES.forEach(r => SECTIONS.forEach(s => { items[cellKey(r.id, s.id)] = []; }));
    const result = buildWorkflowSummary(items, ROLES, SECTIONS, WORKFLOW_DEFS);

    expect(result.used).toHaveLength(0);
    expect(result.unused).toHaveLength(5);
    expect(result.shared).toHaveLength(0);
    expect(result.singleRole).toHaveLength(0);
  });

  it("counts a workflow used by one role as single-role", () => {
    const items = buildCellItems([
      { role: "pct", section: "opening", workflows: ["bathing"] },
    ]);
    const result = buildWorkflowSummary(items, ROLES, SECTIONS, WORKFLOW_DEFS);

    expect(result.used).toHaveLength(1);
    expect(result.used[0].id).toBe("bathing");
    expect(result.singleRole).toHaveLength(1);
    expect(result.singleRole[0].roles).toEqual(["pct"]);
    expect(result.shared).toHaveLength(0);
    expect(result.unused).toHaveLength(4);
  });

  it("counts a workflow used by multiple roles as shared", () => {
    const items = buildCellItems([
      { role: "pct", section: "opening", workflows: ["bathing"] },
      { role: "csr", section: "midday", workflows: ["bathing"] },
    ]);
    const result = buildWorkflowSummary(items, ROLES, SECTIONS, WORKFLOW_DEFS);

    expect(result.shared).toHaveLength(1);
    expect(result.shared[0].id).toBe("bathing");
    expect(result.shared[0].roleCount).toBe(2);
    expect(result.shared[0].roles).toContain("pct");
    expect(result.shared[0].roles).toContain("csr");
    expect(result.singleRole).toHaveLength(0);
  });

  it("workflow in all three roles has roleCount 3", () => {
    const items = buildCellItems([
      { role: "pct", section: "opening", workflows: ["meds"] },
      { role: "csr", section: "opening", workflows: ["meds"] },
      { role: "supervisor", section: "opening", workflows: ["meds"] },
    ]);
    const result = buildWorkflowSummary(items, ROLES, SECTIONS, WORKFLOW_DEFS);

    const medsEntry = result.shared.find(w => w.id === "meds");
    expect(medsEntry).toBeDefined();
    expect(medsEntry.roleCount).toBe(3);
    expect(medsEntry.roles).toHaveLength(3);
  });

  it("ignores non-workflow items in cells", () => {
    const items = buildCellItems([
      { role: "pct", section: "opening", workflows: ["bathing"] },
    ]);
    // Add a plain task to the same cell
    items["pct::opening"].push({
      task_id: "custom_123",
      task_label: "Check cameras",
      item_type: "task",
      section: "opening",
      role: "pct",
    });

    const result = buildWorkflowSummary(items, ROLES, SECTIONS, WORKFLOW_DEFS);
    expect(result.used).toHaveLength(1);
    expect(result.used[0].id).toBe("bathing");
  });

  it("does not double-count a workflow in multiple sections of the same role", () => {
    const items = buildCellItems([
      { role: "pct", section: "opening", workflows: ["bathing"] },
      { role: "pct", section: "closing", workflows: ["bathing"] },
    ]);
    const result = buildWorkflowSummary(items, ROLES, SECTIONS, WORKFLOW_DEFS);

    // bathing appears twice in PCT but should only count PCT once
    expect(result.used).toHaveLength(1);
    expect(result.used[0].roleCount).toBe(1);
    expect(result.singleRole).toHaveLength(1);
    expect(result.shared).toHaveLength(0);
  });

  it("correctly splits used/unused/shared/singleRole in a mixed scenario", () => {
    const items = buildCellItems([
      { role: "pct", section: "opening", workflows: ["bathing", "meds"] },
      { role: "csr", section: "midday", workflows: ["bathing", "room_cleaning"] },
      { role: "supervisor", section: "closing", workflows: ["bathing"] },
    ]);
    const result = buildWorkflowSummary(items, ROLES, SECTIONS, WORKFLOW_DEFS);

    // bathing: 3 roles (shared), meds: 1 (single), room_cleaning: 1 (single)
    // pp and evaluations: unused
    expect(result.used).toHaveLength(3);
    expect(result.unused).toHaveLength(2);
    expect(result.unused.map(w => w.id).sort()).toEqual(["evaluations", "pp"]);

    expect(result.shared).toHaveLength(1);
    expect(result.shared[0].id).toBe("bathing");
    expect(result.shared[0].roleCount).toBe(3);

    expect(result.singleRole).toHaveLength(2);
    expect(result.singleRole.map(w => w.id).sort()).toEqual(["meds", "room_cleaning"]);
  });

  it("wfRoleMap returns Sets with correct role membership", () => {
    const items = buildCellItems([
      { role: "pct", section: "opening", workflows: ["bathing"] },
      { role: "supervisor", section: "midday", workflows: ["bathing", "evaluations"] },
    ]);
    const result = buildWorkflowSummary(items, ROLES, SECTIONS, WORKFLOW_DEFS);

    expect(result.wfRoleMap.bathing.size).toBe(2);
    expect(result.wfRoleMap.bathing.has("pct")).toBe(true);
    expect(result.wfRoleMap.bathing.has("supervisor")).toBe(true);
    expect(result.wfRoleMap.evaluations.size).toBe(1);
    expect(result.wfRoleMap.evaluations.has("supervisor")).toBe(true);
    expect(result.wfRoleMap.pp.size).toBe(0);
  });
});
