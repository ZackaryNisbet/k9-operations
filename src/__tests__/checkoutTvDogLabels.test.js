import { describe, expect, it } from "vitest";
import {
  getCheckoutTvScheduledDepartureDate,
  isBoardingLikeCheckoutTvReservation,
  shouldShowDepartingTodayLabel,
} from "../kol/pages/checkoutTvDogLabels";

describe("Checkout TV dog labels", () => {
  it("shows Departing Today for checked-in boarding dogs scheduled to check out today", () => {
    expect(shouldShowDepartingTodayLabel({
      type: "boarding",
      status: "checked-in",
      checkOut: "2026-04-25",
    }, "2026-04-25")).toBe(true);
  });

  it("does not show Departing Today for daycare, day boarding, or evaluation dogs", () => {
    for (const res of [
      { type: "daycare", _resTypeName: "Daycare | Full Day" },
      { type: "dayboarding", _resTypeName: "Day Boarding" },
      { type: "evaluation", _resTypeName: "Daycare Evaluation" },
    ]) {
      expect(shouldShowDepartingTodayLabel({
        ...res,
        status: "checked-in",
        checkOut: "2026-04-25",
      }, "2026-04-25")).toBe(false);
    }
  });

  it("does not show Departing Today for boarding dogs leaving another day or already checked out", () => {
    expect(shouldShowDepartingTodayLabel({
      type: "boarding",
      status: "checked-in",
      checkOut: "2026-04-26",
    }, "2026-04-25")).toBe(false);

    expect(shouldShowDepartingTodayLabel({
      type: "boarding",
      status: "checked-out",
      checkOut: "2026-04-25",
    }, "2026-04-25")).toBe(false);
  });

  it("recognizes lodging-style raw reservation names without misclassifying day boarding", () => {
    expect(isBoardingLikeCheckoutTvReservation({
      status: "checked-in",
      _resTypeName: "Luxury Suite Boarding",
    })).toBe(true);

    expect(isBoardingLikeCheckoutTvReservation({
      status: "checked-in",
      _resTypeName: "Day Boarding | Full Day",
    })).toBe(false);
  });

  it("uses canonical presence scheduled checkout dates when available", () => {
    expect(getCheckoutTvScheduledDepartureDate({
      scheduled_check_out_date: "2026-04-25T21:00:00+00:00",
    })).toBe("2026-04-25");
  });
});
