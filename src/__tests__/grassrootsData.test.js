import { describe, expect, it } from "vitest";
import {
  applyGrassrootsFilters,
  buildGrassrootsEventDateRpcRows,
  buildGrassrootsEventMetrics,
  buildGrassrootsEventSaveRpcArgs,
  buildGrassrootsMetrics,
  calculateGrassrootsCpl,
  compareGrassrootsEventSchedule,
  getGrassrootsAddressText,
  getGrassrootsActivityCount,
  getGrassrootsDefaultFilters,
  getGrassrootsNextDate,
  getGrassrootsNextEventDate,
  getGrassrootsPrimaryEventDate,
  getGrassrootsSplitAddress,
  groupGrassrootsHistory,
  normalizeGrassrootsEventLinks,
  normalizeGrassrootsEventDates,
  normalizeGrassrootsStatus,
  normalizeLegacyGrassrootsTracker,
  resolveGrassrootsTargetIsActive,
} from "../kol/grassrootsData.js";
import { buildGrassrootsLegacyAddressFromSplitAddress, parseFreeformGrassrootsAddress, parseGooglePlaceAddress } from "../kol/pages/GrassrootsPage.jsx";

describe("grassrootsData", () => {
  it("renames legacy Remy Calloway employees to local employees", () => {
    const normalized = normalizeLegacyGrassrootsTracker({
      corporatePartnerships: [
        {
          id: "corp-1",
          corporation: "Happy Cat",
          usEmployees: "1,200",
          deerfieldEmployees: "42",
          notes: "Initial note",
        },
      ],
    });

    expect(normalized.corporatePartnerships[0]).toMatchObject({
      name: "Happy Cat",
      us_employees: 1200,
      local_employees: 42,
    });
  });

  it("groups legacy drops by business and address while preserving each drop as activity", () => {
    const normalized = normalizeLegacyGrassrootsTracker({
      drops: [
        { id: "drop-1", business: "Vet One", address: "10 Main", date: "2026-04-01", notes: "First drop" },
        { id: "drop-2", business: " vet one ", address: "10 Main", date: "2026-04-08", notes: "Second drop" },
        { id: "drop-3", business: "Vet Two", date: "2026-04-09", notes: "Other drop" },
      ],
    });

    expect(normalized.drops).toHaveLength(2);
    expect(normalized.drops.find((target) => target.name === "Vet One").legacyActivities).toHaveLength(2);
    expect(normalized.drops.find((target) => target.name === "Vet Two").legacyActivities).toHaveLength(1);
  });

  it("sets event defaults to active records with no captured leads", () => {
    const rows = [
      { id: "todo", category: "events", is_active: true, leads_captured: 0 },
      { id: "done", category: "events", is_active: true, leads_captured: 12 },
      { id: "inactive", category: "events", is_active: false, leads_captured: 0 },
    ];

    expect(applyGrassrootsFilters(rows, {}, getGrassrootsDefaultFilters("events")).map((row) => row.id)).toEqual(["todo"]);
  });

  it("defaults filtering to active records and supports inactive/all visibility", () => {
    const rows = [
      { id: "active", is_active: true, status: "outreach" },
      { id: "inactive", is_active: false, status: "outreach" },
      { id: "abandoned", is_active: false, status: "abandoned" },
    ];

    expect(applyGrassrootsFilters(rows, {}, { is_active: { op: "is", val: "active" } }).map((row) => row.id)).toEqual(["active"]);
    expect(applyGrassrootsFilters(rows, {}, { is_active: { op: "is", val: "inactive" } }).map((row) => row.id)).toEqual(["inactive", "abandoned"]);
    expect(applyGrassrootsFilters(rows, {}, { is_active: { op: "is", val: "all" } }).map((row) => row.id)).toEqual(["active", "inactive", "abandoned"]);
    expect(applyGrassrootsFilters(rows, {}, { status: { op: "is", val: "abandoned" } }).map((row) => row.id)).toEqual(["abandoned"]);
  });

  it("filters by workflow status and computed activity count", () => {
    const rows = [
      { id: "a", category: "corporate_partnerships", status: "outreach", is_active: true },
      { id: "b", category: "corporate_partnerships", status: "closing", is_active: true },
    ];
    const activities = {
      a: [{ target_id: "a", activity_type: "development" }],
      b: [
        { target_id: "b", activity_type: "development" },
        { target_id: "b", activity_type: "development" },
      ],
    };

    expect(applyGrassrootsFilters(rows, activities, { status: { op: "is", val: "booked" } }).map((row) => row.id)).toEqual(["b"]);
    expect(applyGrassrootsFilters(rows, activities, { activity_count: { op: ">=", val: "2" } }).map((row) => row.id)).toEqual(["b"]);
    expect(getGrassrootsActivityCount(rows[1], activities)).toBe(2);
  });

  it("normalizes old and new event statuses to current statuses including abandoned", () => {
    expect(normalizeGrassrootsStatus("Outreach")).toBe("identified");
    expect(normalizeGrassrootsStatus("Corresponding")).toBe("corresponding");
    expect(normalizeGrassrootsStatus("Closing")).toBe("booked");
    expect(normalizeGrassrootsStatus("Active")).toBe("booked");
    expect(normalizeGrassrootsStatus("Abandoned")).toBe("abandoned");
    expect(normalizeGrassrootsStatus("Archived")).toBe("abandoned");
    expect(resolveGrassrootsTargetIsActive("abandoned", true)).toBe(false);
    expect(resolveGrassrootsTargetIsActive("identified", true)).toBe(true);
  });

  it("normalizes non-consecutive event dates with independent times", () => {
    const target = {
      event_dates: [
        { event_date: "2026-06-12", start_time: "09:00", end_time: "12:00" },
        { event_date: "2026-06-10", start_time: "14:00:00", end_time: "16:30:00" },
      ],
    };

    expect(normalizeGrassrootsEventDates(target).map((row) => row.event_date)).toEqual(["2026-06-10", "2026-06-12"]);
    expect(normalizeGrassrootsEventDates(target).map((row) => row.start_time)).toEqual(["14:00", "09:00"]);
    expect(normalizeGrassrootsEventDates(target).map((row) => row.end_time)).toEqual(["16:30", "12:00"]);
    expect(getGrassrootsPrimaryEventDate(target)).toBe("2026-06-10");
  });

  it("sorts events by the next upcoming event date by default", () => {
    const rows = [
      { id: "past", name: "Past Event", event_dates: [{ event_date: "2026-05-01" }] },
      { id: "missing", name: "No Date" },
      { id: "later", name: "Later Event", event_dates: [{ event_date: "2026-05-20" }] },
      { id: "next", name: "Next Event", event_dates: [{ event_date: "2026-05-12" }] },
      { id: "multi", name: "Multi Event", event_dates: [{ event_date: "2026-04-20" }, { event_date: "2026-05-13" }] },
    ];

    expect(getGrassrootsNextEventDate(rows[4], "2026-05-11")).toBe("2026-05-13");
    expect(rows.slice().sort((a, b) => compareGrassrootsEventSchedule(a, b, "2026-05-11")).map((row) => row.id)).toEqual([
      "next",
      "multi",
      "later",
      "past",
      "missing",
    ]);
    expect(rows.slice().sort((a, b) => compareGrassrootsEventSchedule(a, b, "2026-05-11", "desc")).map((row) => row.id)).toEqual([
      "later",
      "multi",
      "next",
      "past",
      "missing",
    ]);
  });

  it("builds simple event metrics for the active calendar year and month", () => {
    const rows = [
      { id: "upcoming-booked", category: "events", status: "booked", event_dates: [{ event_date: "2026-06-01" }] },
      { id: "completed-booked", category: "events", status: "booked", event_dates: [{ event_date: "2026-04-10" }] },
      { id: "multi-booked", category: "events", status: "booked", event_dates: [{ event_date: "2026-05-02" }, { event_date: "2026-05-13" }] },
      { id: "identified", category: "events", status: "identified", event_dates: [{ event_date: "2026-07-15" }] },
      { id: "created-identified", category: "events", status: "identified", created_at: "2026-03-02T12:00:00Z" },
      { id: "corresponding", category: "events", status: "corresponding", event_dates: [{ event_date: "2026-08-01" }] },
      { id: "wrong-year", category: "events", status: "booked", event_dates: [{ event_date: "2027-01-01" }] },
      { id: "drop", category: "drops", status: "booked", event_dates: [{ event_date: "2026-06-01" }] },
    ];

    expect(buildGrassrootsEventMetrics(rows, "2026-05-11")).toMatchObject({
      year: "2026",
      month: "2026-05",
      bookedUpcomingThisYear: 2,
      bookedCompletedThisYear: 1,
      identifiedThisYear: 2,
      correspondingThisYear: 1,
      bookedThisMonth: 1,
    });
  });

  it("packages event-date rows for a single atomic save RPC payload", () => {
    const targetPayload = { id: "event-1", location_id: "loc-1", category: "events", name: "Market Day" };
    const eventSource = {
      event_dates: [
        { event_date: "2026-07-03", start_time: "10:15", end_time: "12:00" },
        { event_date: "2026-07-05", start_time: "14:00", end_time: "18:30" },
      ],
    };

    expect(buildGrassrootsEventDateRpcRows(eventSource)).toEqual([
      { event_date: "2026-07-03", start_time: "10:15", end_time: "12:00", sequence_order: 1 },
      { event_date: "2026-07-05", start_time: "14:00", end_time: "18:30", sequence_order: 2 },
    ]);
    expect(buildGrassrootsEventSaveRpcArgs(targetPayload, eventSource)).toEqual({
      p_target: targetPayload,
      p_event_dates: [
        { event_date: "2026-07-03", start_time: "10:15", end_time: "12:00", sequence_order: 1 },
        { event_date: "2026-07-05", start_time: "14:00", end_time: "18:30", sequence_order: 2 },
      ],
    });
  });

  it("normalizes event links from event details", () => {
    expect(normalizeGrassrootsEventLinks({
      details: {
        links: [
          { title: "Flyer", href: " k9ops.com/flyer " },
          { label: "Map", url: "https://maps.example.com" },
          { label: "", url: "" },
        ],
      },
    })).toEqual([
      { id: "event_link_1", label: "Flyer", url: "k9ops.com/flyer" },
      { id: "event_link_2", label: "Map", url: "https://maps.example.com" },
    ]);
  });

  it("preserves legacy freeform addresses while supporting nullable split address fields", () => {
    const legacyOnly = { address: "123 Main St, Adair Forsythe, NJ 08002" };
    const split = {
      address: "500 Route 70, Adair Forsythe, NJ 08002",
      address_line_1: "500 Route 70",
      address_line_2: "",
      address_city: "Adair Forsythe",
      address_state: "NJ",
      address_postal_code: "08002",
      address_country: "US",
      google_place_id: "place-123",
    };

    expect(getGrassrootsAddressText(legacyOnly)).toBe("123 Main St, Adair Forsythe, NJ 08002");
    expect(getGrassrootsSplitAddress(legacyOnly)).toEqual({
      address_line_1: "",
      address_line_2: "",
      address_city: "",
      address_state: "",
      address_postal_code: "",
      address_country: "",
      google_place_id: "",
    });
    expect(getGrassrootsAddressText(split)).toBe("500 Route 70, Adair Forsythe, NJ 08002");
    expect(getGrassrootsSplitAddress(split)).toMatchObject({
      address_line_1: "500 Route 70",
      address_city: "Adair Forsythe",
      address_state: "NJ",
      address_postal_code: "08002",
      google_place_id: "place-123",
    });
  });

  it("parses selected address suggestions into split fields while preserving freeform address", () => {
    const parsed = parseGooglePlaceAddress({
      formatted_address: "500 Route 70, Adair Forsythe, NJ 08002, USA",
      place_id: "place-500",
      address_components: [
        { long_name: "500", short_name: "500", types: ["street_number"] },
        { long_name: "Route 70", short_name: "Rte 70", types: ["route"] },
        { long_name: "Adair Forsythe", short_name: "Adair Forsythe", types: ["locality"] },
        { long_name: "New Jersey", short_name: "NJ", types: ["administrative_area_level_1"] },
        { long_name: "08002", short_name: "08002", types: ["postal_code"] },
        { long_name: "United States", short_name: "US", types: ["country"] },
      ],
    });

    expect(parsed).toEqual({
      address: "500 Route 70, Adair Forsythe, NJ 08002, USA",
      address_line_1: "500 Route 70",
      address_line_2: "",
      address_city: "Adair Forsythe",
      address_state: "NJ",
      address_postal_code: "08002",
      address_country: "US",
      google_place_id: "place-500",
    });
  });

  it("falls back to parsing a formatted address when Places does not return components", () => {
    expect(parseFreeformGrassrootsAddress("150 Greene Ln, Adair Forsythe Township, NJ 08003, USA")).toEqual({
      address: "150 Greene Ln, Adair Forsythe Township, NJ 08003, USA",
      address_line_1: "150 Greene Ln",
      address_line_2: "",
      address_city: "Adair Forsythe Township",
      address_state: "NJ",
      address_postal_code: "08003",
      address_country: "US",
      google_place_id: "",
    });

    expect(parseGooglePlaceAddress({
      formatted_address: "150 Greene Ln, Adair Forsythe Township, NJ 08003, USA",
      place_id: "place-150",
    })).toMatchObject({
      address_line_1: "150 Greene Ln",
      address_city: "Adair Forsythe Township",
      address_state: "NJ",
      address_postal_code: "08003",
      address_country: "US",
      google_place_id: "place-150",
    });
  });

  it("builds a legacy freeform address from manual split address fields", () => {
    expect(buildGrassrootsLegacyAddressFromSplitAddress({
      address_line_1: "500 Route 70",
      address_line_2: "Suite 5",
      address_city: "Adair Forsythe",
      address_state: "NJ",
      address_postal_code: "08002",
      address_country: "US",
    })).toBe("500 Route 70, Suite 5, Adair Forsythe, NJ 08002, US");
  });

  it("filters drops by business category", () => {
    const rows = [
      { id: "vet", category: "drops", business_category: "Veterinarian", is_active: true },
      { id: "groomer", category: "drops", business_category: "Groomer", is_active: true },
    ];

    expect(applyGrassrootsFilters(rows, {}, { business_category: { op: "is", val: "Veterinarian" } }).map((row) => row.id)).toEqual(["vet"]);
  });

  it("filters pet professional partnerships by business category", () => {
    const rows = [
      { id: "vet", category: "pet_professional_partnerships", business_category: "Veterinarian", is_active: true },
      { id: "retail", category: "pet_professional_partnerships", business_category: "Pet Retailer", is_active: true },
    ];

    expect(applyGrassrootsFilters(rows, {}, { business_category: { op: "is", val: "Pet Retailer" } }).map((row) => row.id)).toEqual(["retail"]);
  });

  it("calculates event CPL from cost and leads captured", () => {
    expect(calculateGrassrootsCpl("125", "5")).toBe(25);
    expect(calculateGrassrootsCpl("100", "3")).toBe(33.33);
    expect(calculateGrassrootsCpl("100", "0")).toBeNull();
  });

  it("derives next contact dates and metrics from activity when target date is empty", () => {
    const rows = [
      { id: "a", category: "corporate_partnerships", status: "identified", is_active: true, next_contact_date: "" },
      { id: "b", category: "drops", status: "abandoned", is_active: false, next_contact_date: "2026-04-10" },
    ];
    const activities = {
      a: [{ target_id: "a", activity_type: "development", next_contact_date: "2026-04-18", created_at: "2026-04-16T12:00:00Z" }],
      b: [{ target_id: "b", activity_type: "drop", next_contact_date: "2026-04-20", created_at: "2026-04-16T12:00:00Z" }],
    };

    expect(getGrassrootsNextDate(rows[0], activities)).toBe("2026-04-18");
    expect(getGrassrootsNextDate(rows[1], activities)).toBe("2026-04-10");
    expect(buildGrassrootsMetrics(rows, activities, "2026-04-16")).toMatchObject({
      total: 2,
      active: 1,
      inactive: 1,
      abandoned: 1,
      activities: 2,
      upcoming: 1,
      overdue: 1,
    });
  });

  it("groups history by target newest-first", () => {
    const grouped = groupGrassrootsHistory([
      { id: "old", target_id: "a", event_at: "2026-04-15T10:00:00Z" },
      { id: "ignored", event_at: "2026-04-16T11:00:00Z" },
      { id: "new", target_id: "a", event_at: "2026-04-16T12:00:00Z" },
      { id: "other", target_id: "b", event_at: "2026-04-16T09:00:00Z" },
    ]);

    expect(grouped.a.map((entry) => entry.id)).toEqual(["new", "old"]);
    expect(grouped.b.map((entry) => entry.id)).toEqual(["other"]);
  });
});
