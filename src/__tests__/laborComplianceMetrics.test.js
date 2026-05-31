import { describe, expect, it } from "vitest";
import {
  getLaborComplianceCellState,
  getLaborComplianceMetricState,
  buildLaborComplianceMetrics,
  getComplianceGroupLabel,
  getComplianceGroupKey,
} from "../kol/performanceReviewData";

const TODAY = "2026-03-01";

describe("getLaborComplianceCellState — no bogus 'in progress'", () => {
  it("collapses a future 'scheduled' checkpoint to not_started", () => {
    const state = getLaborComplianceCellState({ status: "scheduled", due_date: "2026-04-01" }, { today: TODAY });
    expect(state.key).toBe("not_started");
    expect(state.label).toBe("Not Started");
  });

  it("collapses 'in_progress' to not_started", () => {
    const state = getLaborComplianceCellState({ status: "in_progress" }, { today: TODAY });
    expect(state.key).toBe("not_started");
  });

  it("still flags a past-due 'scheduled' checkpoint as overdue", () => {
    const state = getLaborComplianceCellState({ status: "scheduled", due_date: "2026-02-01" }, { today: TODAY });
    expect(state.key).toBe("overdue");
  });

  it("never returns an in_progress key", () => {
    for (const status of ["in_progress", "scheduled", "not_started", ""]) {
      expect(getLaborComplianceCellState({ status }, { today: TODAY }).key).not.toBe("in_progress");
    }
  });
});

describe("getLaborComplianceMetricState", () => {
  it("buckets completed / waived / overdue / due_soon / not_started", () => {
    expect(getLaborComplianceMetricState({ status: "complete", completed_on: "2026-02-01" }, { today: TODAY })).toBe("completed");
    expect(getLaborComplianceMetricState({ status: "waived", exception_kind: "waived" }, { today: TODAY })).toBe("waived");
    expect(getLaborComplianceMetricState({ status: "overdue", due_date: "2026-02-10" }, { today: TODAY })).toBe("overdue");
    expect(getLaborComplianceMetricState({ status: "scheduled", due_date: "2026-03-05" }, { today: TODAY })).toBe("due_soon");
    expect(getLaborComplianceMetricState({ status: "scheduled", due_date: "2026-05-01" }, { today: TODAY })).toBe("not_started");
    expect(getLaborComplianceMetricState({ status: "in_progress" }, { today: TODAY })).toBe("not_started");
  });
});

describe("getComplianceGroupLabel", () => {
  it("maps known groups and humanizes unknown ones", () => {
    expect(getComplianceGroupLabel("reviews")).toBe("Performance Review");
    expect(getComplianceGroupLabel("training")).toBe("Training");
    expect(getComplianceGroupLabel("custom")).toBe("Custom");
    expect(getComplianceGroupLabel("safety_onboarding")).toBe("Safety Onboarding");
    expect(getComplianceGroupKey(" Reviews ")).toBe("reviews");
  });
});

describe("buildLaborComplianceMetrics", () => {
  const requirements = [
    { id: "r-30", title: "30-Day Review", display_group: "reviews", requirement_kind: "review_checkpoint", display_order: 110 },
    { id: "r-60", title: "60-Day Review", display_group: "reviews", requirement_kind: "review_checkpoint", display_order: 120 },
    { id: "t-packet", title: "Training Packet", display_group: "training", requirement_kind: "training", display_order: 10 },
  ];
  const employees = [
    {
      id: "emp-a",
      requirements: [
        { requirement_id: "r-30", status: "complete", completed_on: "2026-02-01" },
        { requirement_id: "r-60", status: "overdue", due_date: "2026-02-20" },
        { requirement_id: "t-packet", status: "scheduled", due_date: "2026-03-05" },
      ],
    },
    {
      id: "emp-b",
      requirements: [
        { requirement_id: "r-30", status: "waived", exception_kind: "waived" },
        { requirement_id: "r-60", status: "scheduled", due_date: "2026-05-01" },
        { requirement_id: "t-packet", status: "complete", completed_on: "2026-01-15" },
      ],
    },
  ];

  it("computes roster-wide headline metrics", () => {
    const metrics = buildLaborComplianceMetrics({ employees, requirements, today: TODAY });
    expect(metrics.employeeCount).toBe(2);
    expect(metrics.applicableCount).toBe(6);
    expect(metrics.compliantCount).toBe(3); // r30 A complete, r30 B waived, packet B complete
    expect(metrics.compliantPct).toBe(50);
    expect(metrics.overdueCount).toBe(1); // r60 A
    expect(metrics.dueSoonCount).toBe(1); // packet A
    expect(metrics.needsAttentionCount).toBe(1); // only emp A has an overdue item
  });

  it("groups by display_group with per-group and per-requirement scores", () => {
    const metrics = buildLaborComplianceMetrics({ employees, requirements, today: TODAY });
    // Training (display_order 10) sorts before Performance Review (110).
    expect(metrics.groups.map((g) => g.label)).toEqual(["Training", "Performance Review"]);

    const reviews = metrics.groups.find((g) => g.key === "reviews");
    expect(reviews.applicable).toBe(4);
    expect(reviews.compliant).toBe(2);
    expect(reviews.overdue).toBe(1);
    expect(reviews.compliantPct).toBe(50);
    const r60 = reviews.requirements.find((r) => r.id === "r-60");
    expect(r60.applicable).toBe(2);
    expect(r60.overdue).toBe(1);
    expect(r60.compliantPct).toBe(0);

    const training = metrics.groups.find((g) => g.key === "training");
    const packet = training.requirements.find((r) => r.id === "t-packet");
    expect(packet.applicable).toBe(2); // both employees "have" the requirement
    expect(packet.compliant).toBe(1);
    expect(packet.dueSoon).toBe(1);
    expect(packet.compliantPct).toBe(50);
  });

  it("is dynamic: a new requirement automatically produces its own metric tile", () => {
    const withCustom = {
      requirements: [...requirements, { id: "c-1", title: "Handbook Ack", display_group: "custom", requirement_kind: "review_checkpoint", display_order: 200 }],
      employees: [
        ...employees,
        { id: "emp-c", requirements: [{ requirement_id: "c-1", status: "not_started" }] },
      ],
    };
    const metrics = buildLaborComplianceMetrics({ ...withCustom, today: TODAY });
    const custom = metrics.groups.find((g) => g.key === "custom");
    expect(custom).toBeTruthy();
    expect(custom.label).toBe("Custom");
    expect(custom.requirements.map((r) => r.label)).toContain("Handbook Ack");
    expect(custom.requirements[0].applicable).toBe(1);
    expect(custom.requirements[0].compliant).toBe(0);
  });

  it("returns empty groups when there is no policy or roster", () => {
    const metrics = buildLaborComplianceMetrics({ employees: [], requirements: [], today: TODAY });
    expect(metrics.groups).toEqual([]);
    expect(metrics.overdueCount).toBe(0);
    expect(metrics.compliantPct).toBeNull();
  });
});
