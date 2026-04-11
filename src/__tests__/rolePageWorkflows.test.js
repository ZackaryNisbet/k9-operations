// Tests for RolePage workflowsBySection derivation logic
// Verifies that workflow cards are derived from role_page_config rows (DB authority)
// rather than unconditionally from WORKFLOW_SECTION_MAP (static defaults).

import { describe, it, expect } from 'vitest';

// ─── Extracted logic matching RolePage.jsx workflowsBySection ───────────────
const FIXED_SECTIONS = [
  { id: "opening" }, { id: "midday" }, { id: "closing" }, { id: "as_needed" },
];

const WORKFLOW_CARDS = [
  { id: "bathing", label: "Bathing" },
  { id: "room_cleaning", label: "Room Cleaning" },
  { id: "pp", label: "Private Play" },
  { id: "pamper", label: "Pamper Package" },
  { id: "lodging_transfer", label: "Lodging Transfers" },
  { id: "collars", label: "Next Day Collars" },
  { id: "belongings", label: "Belongings" },
  { id: "weekly_maintenance", label: "Weekly Maintenance" },
];

const WORKFLOW_SECTION_MAP = {
  pct: {
    bathing: "opening", room_cleaning: "midday", pp: "midday",
    pamper: "midday", lodging_transfer: "midday", collars: "opening",
    belongings: "closing", weekly_maintenance: "as_needed",
  },
};

function buildWorkflowsBySection(role, configTasks) {
  const grouped = {};
  FIXED_SECTIONS.forEach(s => { grouped[s.id] = []; });

  const hasConfig = configTasks.length > 0;
  if (hasConfig) {
    configTasks.forEach(row => {
      if (!row.task_id?.startsWith("wf_")) return;
      const wfId = row.task_id.replace("wf_", "");
      const wfDef = WORKFLOW_CARDS.find(w => w.id === wfId);
      if (wfDef && grouped[row.section]) {
        grouped[row.section].push(wfDef);
      }
    });
  } else {
    const roleMap = WORKFLOW_SECTION_MAP[role] || WORKFLOW_SECTION_MAP.pct || {};
    WORKFLOW_CARDS.forEach(wf => {
      const sectionId = roleMap[wf.id] || "as_needed";
      if (grouped[sectionId]) grouped[sectionId].push(wf);
    });
  }

  return grouped;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("RolePage workflowsBySection", () => {
  it("shows only DB-configured workflows when role_page_config has rows", () => {
    // Cherry Hill PCT: only wf_bathing in opening
    const configTasks = [
      { task_id: "wf_bathing", section: "opening", sort_order: 0 },
    ];
    const result = buildWorkflowsBySection("pct", configTasks);

    expect(result.opening).toHaveLength(1);
    expect(result.opening[0].id).toBe("bathing");
    expect(result.midday).toHaveLength(0);
    expect(result.closing).toHaveLength(0);
    expect(result.as_needed).toHaveLength(0);
  });

  it("ignores non-workflow rows from role_page_config", () => {
    const configTasks = [
      { task_id: "wf_bathing", section: "opening", sort_order: 0 },
      { task_id: "legacy_opening_o1", section: "opening", sort_order: 1 },
      { task_id: "custom_123", section: "midday", sort_order: 2 },
    ];
    const result = buildWorkflowsBySection("pct", configTasks);

    // Only the wf_ row should produce a workflow card
    expect(result.opening).toHaveLength(1);
    expect(result.opening[0].id).toBe("bathing");
    expect(result.midday).toHaveLength(0);
  });

  it("falls back to WORKFLOW_SECTION_MAP when role has no config rows", () => {
    const result = buildWorkflowsBySection("pct", []);

    // All 8 workflows from the static map should appear
    const allWorkflows = [
      ...result.opening, ...result.midday, ...result.closing, ...result.as_needed,
    ];
    expect(allWorkflows).toHaveLength(8);
    expect(result.opening.map(w => w.id)).toContain("bathing");
    expect(result.midday.map(w => w.id)).toContain("room_cleaning");
    expect(result.closing.map(w => w.id)).toContain("belongings");
    expect(result.as_needed.map(w => w.id)).toContain("weekly_maintenance");
  });

  it("respects section placement from role_page_config, not static map", () => {
    // Admin moved bathing from opening → closing in role_page_config
    const configTasks = [
      { task_id: "wf_bathing", section: "closing", sort_order: 0 },
    ];
    const result = buildWorkflowsBySection("pct", configTasks);

    expect(result.opening).toHaveLength(0);
    expect(result.closing).toHaveLength(1);
    expect(result.closing[0].id).toBe("bathing");
  });

  it("does not show workflows that admin deleted from role_page_config", () => {
    // Role has config rows but NO workflow rows at all — admin deleted them
    const configTasks = [
      { task_id: "custom_abc", section: "opening", sort_order: 0 },
    ];
    const result = buildWorkflowsBySection("pct", configTasks);

    const allWorkflows = [
      ...result.opening, ...result.midday, ...result.closing, ...result.as_needed,
    ];
    expect(allWorkflows).toHaveLength(0);
  });

  it("handles multiple workflows in different sections", () => {
    const configTasks = [
      { task_id: "wf_bathing", section: "opening", sort_order: 0 },
      { task_id: "wf_room_cleaning", section: "midday", sort_order: 1 },
      { task_id: "wf_belongings", section: "closing", sort_order: 2 },
    ];
    const result = buildWorkflowsBySection("pct", configTasks);

    expect(result.opening).toHaveLength(1);
    expect(result.midday).toHaveLength(1);
    expect(result.closing).toHaveLength(1);
    expect(result.as_needed).toHaveLength(0);
  });
});
