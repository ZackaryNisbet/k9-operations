import { describe, expect, it } from "vitest";
import {
  buildEnrichmentCompletionKey,
  buildEnrichmentOpsRowId,
  deriveWorkflowHealth,
  formatWorkflowReviewReason,
  getEnrichmentWorkflowStatus,
  getWorkflowPlaygroupTags,
  getWorkflowRefreshState,
  normalizeEnrichmentWorkflow,
} from "../kol/enrichments/enrichmentWorkflowData";

describe("enrichment workflow helpers", () => {
  it("uses the canonical daily ops row and completion keys", () => {
    expect(buildEnrichmentOpsRowId("2026-05-05")).toBe("ops_svc_2026-05-05");
    expect(buildEnrichmentCompletionKey("2026-05-05")).toBe("ops_svc_Enrichment_2026-05-05");
  });

  it("counts scheduled dogs separately from needs-review rows", () => {
    const workflow = normalizeEnrichmentWorkflow({
      dogs: [
        { animalId: "8071", animalName: "Buddy", status: "scheduled" },
        { animalId: "5833", animalName: "Crazy Daisy", status: "scheduled" },
        { animalId: "7575", animalName: "Tomato", status: "needs_review", reason: "Missing service date" },
      ],
    }, {
      8071: { by: "Staff", at: "2026-05-05T15:00:00.000Z" },
    });

    expect(workflow.rowCount).toBe(3);
    expect(workflow.total).toBe(2);
    expect(workflow.scheduledCount).toBe(2);
    expect(workflow.needsReviewCount).toBe(1);
    expect(workflow.completedCount).toBe(1);
    expect(getEnrichmentWorkflowStatus(workflow)).toBe("needs_review");
  });

  it("hydrates workflow dog avatars from the animal photo map", () => {
    const workflow = normalizeEnrichmentWorkflow({
      dogs: [{ animalId: "8071", animalName: "Buddy", status: "scheduled" }],
    }, {}, {
      8071: "https://example.test/buddy.jpg",
    });

    expect(workflow.dogs[0].imageUrl).toBe("https://example.test/buddy.jpg");
  });

  it("hydrates workflow playgroup tags from the assignment map", () => {
    const workflow = normalizeEnrichmentWorkflow({
      dogs: [{ animalId: "8071", animalName: "Buddy", status: "scheduled" }],
    }, {}, {}, {
      8071: {
        animal_gingr_id: "8071",
        size_group: "large",
        has_private_play: true,
        has_evaluation: true,
        is_half_and_half: true,
        primary_display_playgroup: "half_and_half",
        playgroup_tags: ["large", "private_play", "evaluation", "half_and_half"],
      },
    });

    expect(workflow.dogs[0].playgroupTags).toEqual(["large", "private_play", "evaluation"]);
    expect(workflow.dogs[0].playgroupAssignment.has_private_play).toBe(true);
  });

  it("expands both-daycare assignment into large and small badges", () => {
    expect(getWorkflowPlaygroupTags({
      animal_gingr_id: "8071",
      primary_display_playgroup: "both_daycares",
      playgroup_tags: ["both_daycares"],
    })).toEqual(["large", "small"]);
  });

  it("marks stale workflow pulls as stale", () => {
    const nowMs = new Date("2026-05-05T16:30:00.000Z").getTime();
    const health = deriveWorkflowHealth({
      lastSuccessAt: "2026-05-05T16:00:00.000Z",
      nowMs,
      staleAfterMs: 10 * 60_000,
    });

    expect(health.status).toBe("stale");
  });

  it("formats workflow health refresh state like the Checkout TV sync button", () => {
    const lastSuccessAt = "2026-05-05T16:00:00.000Z";
    const nowMs = new Date("2026-05-05T16:00:42.000Z").getTime();
    const state = getWorkflowRefreshState(lastSuccessAt, nowMs, 60_000);

    expect(state.label).toBe("Next sync in 18");
    expect(state.seconds).toBe(18);
  });

  it("formats needs-review service dates without raw ISO timestamps", () => {
    const reason = formatWorkflowReviewReason(
      "Enrichment service needs a scheduled date for 2026-05-06. Current service dates: 2026-05-05T09:00:00-04:00, missing",
      "2026-05-06"
    );

    expect(reason).toBe("Missing service date for Wed, May 6. Service dates: Tue, May 5, missing");
  });
});
