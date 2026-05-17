import { describe, expect, it } from "vitest";
import {
  applyEnrichmentWorkflowView,
  buildEnrichmentCompletionKey,
  buildEnrichmentOpsRowId,
  countEnrichmentWorkflowFilter,
  deriveWorkflowHealth,
  formatWorkflowTimeLabel,
  formatEnrichmentReservationKind,
  formatEnrichmentReservationWindow,
  formatWorkflowReviewReason,
  getEnrichmentWorkflowStatus,
  getWorkflowPlaygroupTags,
  getWorkflowRefreshState,
  normalizeEnrichmentWorkflow,
  normalizeWorkflowServiceDates,
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

  it("hydrates reservation context for enrichment dog rows", () => {
    const workflow = normalizeEnrichmentWorkflow({
      dogs: [{ animalId: "8071", animalName: "Buddy", status: "scheduled" }],
    }, {}, {}, {}, {
      8071: {
        reservationType: "Boarding | Luxury Suite",
        startDate: "2026-05-06T08:00:00-04:00",
        endDate: "2026-05-08T12:00:00-04:00",
      },
    });

    expect(workflow.dogs[0].reservationLabel).toBe("Boarding");
    expect(workflow.dogs[0].reservationCategory).toBe("boarding");
    expect(workflow.dogs[0].reservationWindow).toBe("May 6, 8:00 AM to May 8, 12:00 PM");
  });

  it("normalizes arrival and scheduled departure times for daycare rows", () => {
    const workflow = normalizeEnrichmentWorkflow({
      dogs: [{
        animalId: "8071",
        animalName: "Buddy",
        status: "scheduled",
        reservationType: "Full Day Daycare",
        checkInDate: "2026-05-06T07:14:00-04:00",
        endDate: "2026-05-06T18:00:00-04:00",
      }],
    });

    expect(workflow.dogs[0].reservationCategory).toBe("daycare");
    expect(workflow.dogs[0].arrivalLabel).toBe("7:14 AM");
    expect(workflow.dogs[0].departureLabel).toBe("6:00 PM");
  });

  it("filters and sorts workflow rows by the selected operational view", () => {
    const workflow = normalizeEnrichmentWorkflow({
      dogs: [
        { animalId: "1", animalName: "Zulu", status: "scheduled", reservationType: "Boarding", endDate: "2026-05-06T17:30:00-04:00", roomLabel: "Executive 302" },
        { animalId: "2", animalName: "Alpha", status: "scheduled", reservationType: "Full Day Daycare", endDate: "2026-05-06T12:00:00-04:00", roomLabel: "Daycare" },
        { animalId: "3", animalName: "Mango", status: "needs_review", reservationType: "Boarding", endDate: "2026-05-06T10:00:00-04:00", roomLabel: "Luxury 1" },
      ],
    });

    expect(applyEnrichmentWorkflowView(workflow.dogs, { filter: "all", sort: "departure" }).map((dog) => dog.animalName)).toEqual(["Mango", "Alpha", "Zulu"]);
    expect(applyEnrichmentWorkflowView(workflow.dogs, { filter: "daycare", sort: "dog" }).map((dog) => dog.animalName)).toEqual(["Alpha"]);
    expect(countEnrichmentWorkflowFilter(workflow.dogs, "boarding")).toBe(2);
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

  it("formats concise reservation kind and same-day windows", () => {
    expect(formatEnrichmentReservationKind("Full Day Daycare")).toBe("Daycare");
    expect(formatEnrichmentReservationWindow("2026-05-06T07:00:00-04:00", "2026-05-06T18:00:00-04:00")).toBe("May 6, 7:00 AM to 6:00 PM");
    expect(formatWorkflowTimeLabel("2026-05-06T18:00:00-04:00")).toBe("6:00 PM");
  });

  it("formats needs-review service dates without raw ISO timestamps", () => {
    const reason = formatWorkflowReviewReason(
      "Enrichment service needs a scheduled date for 2026-05-06. Current service dates: 2026-05-05T09:00:00-04:00, missing",
      "2026-05-06"
    );

    expect(reason).toBe("Reservation is active Wed, May 6, but Enrichment is dated Tue, May 5 instead of Wed, May 6 and one Enrichment service has no service date. Confirm whether staff should run it today.");
  });

  it("builds needs-review context from hydrated service dates", () => {
    const workflow = normalizeEnrichmentWorkflow({
      dogs: [{
        animalId: "8071",
        animalName: "Buddy",
        status: "needs_review",
        reason: "Enrichment service needs review for 2026-05-06.",
        reportDate: "2026-05-06",
      }],
    }, {}, {}, {}, {
      8071: {
        reservationType: "Boarding",
        startDate: "2026-05-03T09:00:00-04:00",
        endDate: "2026-05-10T11:00:00-04:00",
        serviceDates: ["2026-05-05T09:00:00-04:00"],
      },
    });

    expect(workflow.dogs[0].reason).toBe("Dog is here May 3, 9:00 AM to May 10, 11:00 AM, but Enrichment is dated Tue, May 5 instead of Wed, May 6. Confirm whether staff should run it today.");
  });

  it("normalizes mixed enrichment service date values", () => {
    expect(normalizeWorkflowServiceDates([
      { scheduled_at: "2026-05-05T09:00:00-04:00" },
      "missing",
      "2026-05-05",
    ])).toEqual(["2026-05-05", "missing"]);
  });
});
