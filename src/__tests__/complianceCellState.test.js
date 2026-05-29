import { describe, expect, it } from "vitest";
import { getCycleState } from "../kol/components/PerformanceReviewComplianceGrid";

// Regression: a role-restricted review checkpoint (e.g. review_30_day, applicable only to
// AM/GM/Supervisor) is omitted from a non-matching employee's board row. The grid still renders
// the global column, so the cell has no board requirement attached. It must NOT fabricate an
// "Overdue" from the start-date-derived due date — it should be Not Applicable.
describe("getCycleState — role-non-applicable checkpoints", () => {
  it("does NOT fabricate Overdue when no board requirement is attached", () => {
    const cycle = {
      id: "review_30_day",
      slug: "review_30_day",
      requirementId: "fa806d3a-91f9-413d-8fab-256f226c2ec5", // labor signal → labor path
      dueDate: "2020-01-01", // far past → previously fabricated as Overdue
    };
    const state = getCycleState(cycle, []);
    expect(state.key).toBe("not-applicable");
    expect(state.label).toBe("Not Applicable");
  });

  it("still surfaces Waived from an attached board requirement", () => {
    const cycle = {
      id: "review_30_day",
      requirementId: "fa806d3a",
      boardRequirement: { status: "waived", exception_kind: "waived", due_date: "2020-01-01" },
    };
    expect(getCycleState(cycle, []).key).toBe("waived");
  });

  it("still surfaces Overdue when the board requirement itself is overdue", () => {
    const cycle = {
      id: "review_30_day",
      requirementId: "fa806d3a",
      boardRequirement: { status: "overdue", due_date: "2020-01-01" },
    };
    expect(getCycleState(cycle, []).key).toBe("overdue");
  });
});
