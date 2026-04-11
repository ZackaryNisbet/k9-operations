// Tests for RolePage workflowsBySection and tasksBySection derivation logic
// Verifies that workflow cards are derived from role_page_config rows (DB authority)
// rather than unconditionally from WORKFLOW_SECTION_MAP (static defaults).
// Also verifies that checklist tasks exclude wf_ workflow references.

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
  { id: "enrichment", label: "Enrichment" },
  { id: "ice_cream", label: "Gourmet Ice Cream" },
  { id: "roll_call", label: "Roll Call" },
  { id: "emergency_contacts", label: "Emergency Contacts" },
  { id: "attendance", label: "Attendance" },
  { id: "meds", label: "Medications" },
  { id: "evaluations", label: "Evaluations" },
];

const WORKFLOW_SECTION_MAP = {
  pct: {
    bathing: "opening", room_cleaning: "midday", pp: "midday",
    pamper: "midday", lodging_transfer: "midday", collars: "opening",
    belongings: "closing", weekly_maintenance: "as_needed",
    enrichment: "midday", ice_cream: "midday", roll_call: "opening",
    emergency_contacts: "as_needed", attendance: "opening", meds: "opening",
    evaluations: "midday",
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

// ─── Extracted logic matching RolePage.jsx tasksBySection ─────────────────
// Mirrors the filtering that excludes wf_ items from checklist rendering.
function buildTasksBySection(activeTasks) {
  const grouped = {};
  FIXED_SECTIONS.forEach(s => { grouped[s.id] = []; });
  activeTasks.forEach(t => {
    if (t.task_id?.startsWith("wf_")) return;
    if (grouped[t.section]) grouped[t.section].push(t);
  });
  return grouped;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("RolePage workflowsBySection", () => {
  it("shows only DB-configured workflows when role_page_config has rows", () => {
    // Adair Forsythe PCT: only wf_bathing in opening
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

    // All 15 workflows from the static map should appear
    const allWorkflows = [
      ...result.opening, ...result.midday, ...result.closing, ...result.as_needed,
    ];
    expect(allWorkflows).toHaveLength(15);
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

describe("RolePage tasksBySection (checklist filtering)", () => {
  it("excludes wf_ rows from checklist tasks", () => {
    const activeTasks = [
      { task_id: "wf_bathing", section: "opening", task_label: "Bathing" },
      { task_id: "legacy_opening_o1", section: "opening", task_label: "Check security cameras" },
      { task_id: "custom_123", section: "midday", task_label: "Complete feeding report" },
      { task_id: "wf_room_cleaning", section: "midday", task_label: "Room Cleaning" },
    ];
    const result = buildTasksBySection(activeTasks);

    expect(result.opening).toHaveLength(1);
    expect(result.opening[0].task_id).toBe("legacy_opening_o1");
    expect(result.midday).toHaveLength(1);
    expect(result.midday[0].task_id).toBe("custom_123");
  });

  it("returns all non-wf tasks when no workflow refs exist", () => {
    const activeTasks = [
      { task_id: "legacy_opening_o1", section: "opening", task_label: "Check cameras" },
      { task_id: "legacy_be_be1", section: "midday", task_label: "Morning feeding" },
      { task_id: "custom_abc", section: "closing", task_label: "Lock up" },
    ];
    const result = buildTasksBySection(activeTasks);

    expect(result.opening).toHaveLength(1);
    expect(result.midday).toHaveLength(1);
    expect(result.closing).toHaveLength(1);
  });

  it("returns empty sections when only wf_ rows exist", () => {
    const activeTasks = [
      { task_id: "wf_bathing", section: "opening", task_label: "Bathing" },
      { task_id: "wf_meds", section: "midday", task_label: "Medications" },
    ];
    const result = buildTasksBySection(activeTasks);

    expect(result.opening).toHaveLength(0);
    expect(result.midday).toHaveLength(0);
    expect(result.closing).toHaveLength(0);
    expect(result.as_needed).toHaveLength(0);
  });

  it("correctly handles mixed MOD-style checklist + workflows", () => {
    // Simulates MOD role with custom checklist items and workflow refs
    const activeTasks = [
      { task_id: "custom_rot", section: "opening", task_label: "Create back-end rotation schedule" },
      { task_id: "custom_feed", section: "opening", task_label: "Complete feeding report for previous night PM and today AM" },
      { task_id: "custom_med", section: "opening", task_label: "Complete medication report for today AM" },
      { task_id: "wf_bathing", section: "opening", task_label: "Bathing" },
      { task_id: "custom_bath_chk", section: "midday", task_label: "Verify departing body check forms from bathing" },
      { task_id: "custom_eval", section: "midday", task_label: "Input eval notes to Gingr and EOD" },
      { task_id: "custom_mid_feed", section: "midday", task_label: "Midday feeding/meds/services" },
      { task_id: "wf_meds", section: "midday", task_label: "Medications" },
      { task_id: "wf_evaluations", section: "midday", task_label: "Evaluations" },
    ];
    const result = buildTasksBySection(activeTasks);

    // Only non-wf_ items should appear as checklist tasks
    expect(result.opening).toHaveLength(3);
    expect(result.opening.map(t => t.task_id)).toEqual([
      "custom_rot", "custom_feed", "custom_med",
    ]);
    expect(result.midday).toHaveLength(3);
    expect(result.midday.map(t => t.task_id)).toEqual([
      "custom_bath_chk", "custom_eval", "custom_mid_feed",
    ]);
  });
});

// ─── Role derivation logic matching RolePage.jsx ────────────────────────────
// Mirrors the role resolution that determines which role_page_config rows
// to query. The profile mock has role="owner" which never matches DB rows;
// the actual role comes from location_roles.
// The location_roles table may store the role under `role_code` or `role`
// depending on how the row was created, so read both defensively.
// The mock profile role "owner" is skipped in the fallback chain.
function deriveRole(roleProp, userLocationRoles, currentLocation, profileRole) {
  const locationRole = (userLocationRoles || []).find(r => r.location_id === currentLocation);
  const locationRoleCode = locationRole?.role_code || locationRole?.role;
  const fallbackRole = profileRole !== "owner" ? profileRole : undefined;
  const rawRole = roleProp || locationRoleCode || fallbackRole || "pct";
  return rawRole === "mod" ? "supervisor" : rawRole;
}

describe("RolePage role derivation", () => {
  it("uses role_code from location_roles when available", () => {
    const roles = [{ location_id: "loc-1", role_code: "mod" }];
    const result = deriveRole(undefined, roles, "loc-1", "owner");
    // "mod" should resolve to "supervisor"
    expect(result).toBe("supervisor");
  });

  it("reads role column when role_code is missing", () => {
    // location_roles rows created via onboarding have `role` not `role_code`
    const roles = [{ location_id: "loc-1", role: "mod" }];
    const result = deriveRole(undefined, roles, "loc-1", "owner");
    expect(result).toBe("supervisor");
  });

  it("prefers role_code over role when both exist", () => {
    const roles = [{ location_id: "loc-1", role_code: "supervisor", role: "pct" }];
    const result = deriveRole(undefined, roles, "loc-1", "owner");
    expect(result).toBe("supervisor");
  });

  it("prefers roleProp over location_roles", () => {
    const roles = [{ location_id: "loc-1", role_code: "pct" }];
    const result = deriveRole("supervisor", roles, "loc-1", "owner");
    expect(result).toBe("supervisor");
  });

  it("falls back to profile.role when location_roles has no match", () => {
    const roles = [{ location_id: "loc-other", role_code: "pct" }];
    const result = deriveRole(undefined, roles, "loc-1", "manager");
    expect(result).toBe("manager");
  });

  it("falls back to pct when nothing is available", () => {
    const result = deriveRole(undefined, [], "loc-1", undefined);
    expect(result).toBe("pct");
  });

  it("skips mock owner role and falls back to pct", () => {
    // When location_roles is empty and profile.role is the mock "owner",
    // the derivation should skip "owner" and fall through to "pct"
    // instead of querying role_page_config with role='owner' (which has no rows).
    const result = deriveRole(undefined, [], "loc-1", "owner");
    expect(result).toBe("pct");
  });

  it("does not use mock owner role when location_roles provides real role", () => {
    // This is the exact production bug: profile.role is always "owner"
    // but the user's actual role at Adair Forsythe is "mod" (→ "supervisor")
    const roles = [
      { location_id: "11111111-1111-1111-1111-111111111111", role_code: "mod" },
    ];
    const result = deriveRole(undefined, roles, "11111111-1111-1111-1111-111111111111", "owner");
    expect(result).toBe("supervisor");
  });

  it("reads role column for Adair Forsythe production scenario", () => {
    // Same production scenario but location_roles stores `role` not `role_code`
    const roles = [
      { location_id: "11111111-1111-1111-1111-111111111111", role: "mod" },
    ];
    const result = deriveRole(undefined, roles, "11111111-1111-1111-1111-111111111111", "owner");
    expect(result).toBe("supervisor");
  });
});
