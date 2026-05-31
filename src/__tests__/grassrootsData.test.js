import { describe, expect, it, vi } from "vitest";
import {
  applyGrassrootsFilters,
  buildGrassrootsActivityAttachmentPath,
  buildGrassrootsDropActivityRows,
  buildGrassrootsDropCategoryCounts,
  buildGrassrootsDropMetrics,
  buildGrassrootsEventDateRpcRows,
  buildGrassrootsEventMetrics,
  buildGrassrootsEventSaveRpcArgs,
  buildGrassrootsMetrics,
  calculateGrassrootsCpl,
  canCloseGrassrootsEvent,
  parseGrassrootsMaterialsLeft,
  toggleGrassrootsMaterial,
  compareGrassrootsEventSchedule,
  getGrassrootsDisplayStatusLabel,
  getGrassrootsEventCloseout,
  getGrassrootsEventDisplayStatus,
  getGrassrootsEventFieldGaps,
  getGrassrootsBusinessFieldGaps,
  getGrassrootsFinalEventDate,
  summarizeGrassrootsEventDates,
  isGrassrootsEventInPastView,
  isGrassrootsEventClosed,
  isGrassrootsEventPast,
  makeGrassrootsEventCloseout,
  getGrassrootsAddressText,
  getGrassrootsActivityCount,
  getGrassrootsAttachmentPreviewKind,
  getGrassrootsDefaultFilters,
  getGrassrootsNextDate,
  getGrassrootsNextEventDate,
  getGrassrootsPrimaryEventDate,
  getGrassrootsSplitAddress,
  groupGrassrootsActivityAttachments,
  groupGrassrootsHistory,
  inferGrassrootsActivityAttachmentMimeType,
  filterGrassrootsDropActivityRowsByCategory,
  normalizeGrassrootsEventLinks,
  normalizeGrassrootsEventDates,
  normalizeGrassrootsStatus,
  normalizeLegacyGrassrootsTracker,
  resolveGrassrootsTargetIsActive,
  sanitizeGrassrootsAttachmentFilename,
  searchGrassrootsDropBusinessTargets,
  validateGrassrootsActivityAttachmentFiles,
} from "../kol/grassrootsData.js";
import {
  buildGrassrootsLegacyAddressFromSplitAddress,
  copyGrassrootsTextToClipboard,
  extractGooglePlaceBusinessName,
  getGrassrootsVisibleAddressLine,
  inferGrassrootsBusinessCategoryFromPlace,
  parseFreeformGrassrootsAddress,
  parseGooglePlaceAddress,
} from "../kol/grassrootsAddress.js";

describe("grassrootsData", () => {
  it("renames legacy Deerfield employees to local employees", () => {
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

  it("defaults events to active records regardless of captured leads (closeout/past archiving handles 'done')", () => {
    const rows = [
      { id: "todo", category: "events", is_active: true, leads_captured: 0 },
      { id: "done", category: "events", is_active: true, leads_captured: 12 },
      { id: "inactive", category: "events", is_active: false, leads_captured: 0 },
    ];

    // leads_captured>0 no longer hides an event; only is_active=false is filtered out.
    expect(applyGrassrootsFilters(rows, {}, getGrassrootsDefaultFilters("events")).map((row) => row.id)).toEqual(["todo", "done"]);
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

  it("builds drop visit and unique business metrics from drop activity", () => {
    const targets = [
      { id: "drop-a", category: "drops", name: "Vet One" },
      { id: "drop-b", category: "drops", name: "Groomer Two" },
      { id: "event-a", category: "events", name: "Event" },
    ];
    const activities = [
      { target_id: "drop-a", activity_type: "drop", activity_date: "2026-05-16" },
      { target_id: "drop-a", activity_type: "drop", activity_date: "2026-05-02" },
      { target_id: "drop-b", activity_type: "drop", activity_date: "2026-04-17" },
      { target_id: "drop-b", activity_type: "drop", activity_date: "2026-02-10" },
      { target_id: "drop-b", activity_type: "drop", created_at: "2026-03-01T14:00:00Z" },
      { target_id: "drop-a", activity_type: "development", activity_date: "2026-05-16" },
      { target_id: "event-a", activity_type: "drop", activity_date: "2026-05-16" },
      { target_id: "drop-a", activity_type: "drop", activity_date: "2025-12-30" },
    ];

    expect(buildGrassrootsDropMetrics(targets, activities, "2026-05-16")).toMatchObject({
      year: "2026",
      last30Start: "2026-04-17",
      last30End: "2026-05-16",
      dropVisitsLast30: 3,
      businessesVisitedLast30: 2,
      dropVisitsYtd: 5,
      businessesVisitedYtd: 2,
    });
  });

  it("builds chronological drop activity rows while preserving repeated visits to the same business", () => {
    const targets = [
      { id: "drop-a", category: "drops", name: "Vet One", address: "10 Main", business_category: "Veterinarian" },
      { id: "drop-b", category: "drops", name: "Groomer Two", address: "20 Main", business_category: "Groomer" },
    ];
    const activities = [
      {
        id: "old",
        target_id: "drop-a",
        activity_type: "drop",
        activity_date: "2026-05-01",
        notes: "First visit",
        metadata: { person_spoken_with: "Sam" },
      },
      {
        id: "new",
        target_id: "drop-a",
        activity_type: "drop",
        activity_date: "2026-05-03",
        notes: "Second visit",
        metadata: { person_spoken_with: "Lee", materials_left: "Rack cards", partnership_potential: true },
      },
      {
        id: "other",
        target_id: "drop-b",
        activity_type: "drop",
        activity_date: "2026-05-02",
        notes: "Groomer drop",
      },
    ];
    const rows = buildGrassrootsDropActivityRows(targets, activities, {
      new: [{ id: "attachment-1", activity_id: "new", file_name: "business-card.jpg" }],
    });

    expect(rows.map((row) => row.id)).toEqual(["new", "other", "old"]);
    expect(rows.filter((row) => row.targetId === "drop-a")).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      businessName: "Vet One",
      businessCategory: "Veterinarian",
      personSpokenWith: "Lee",
      materialsLeft: "Rack cards",
      partnershipPotential: true,
      attachments: [{ id: "attachment-1", activity_id: "new", file_name: "business-card.jpg" }],
    });
  });

  it("ranks internal drop business suggestions before Google fallback is needed", () => {
    const targets = [
      { id: "vet-a", category: "drops", name: "Banfield Pet Hospital", address_line_1: "101 New Jersey 73", address_city: "Evesham", business_category: "Veterinarian" },
      { id: "vet-b", category: "drops", name: "Cherry Hill Animal Hospital", address_line_1: "22 Kings Hwy", business_category: "Veterinarian" },
      { id: "groomer", category: "drops", name: "Happy Grooming", address_line_1: "5 Main", business_category: "Groomer" },
      { id: "event", category: "events", name: "Banfield Adoption Day" },
    ];
    const results = searchGrassrootsDropBusinessTargets({
      targets,
      activitiesByTarget: {
        "vet-a": [
          { target_id: "vet-a", activity_type: "drop", activity_date: "2026-05-01" },
          { target_id: "vet-a", activity_type: "drop", activity_date: "2026-05-15" },
        ],
      },
      query: "banfield",
    });

    expect(results.map((row) => row.target.id)).toEqual(["vet-a"]);
    expect(results[0]).toMatchObject({
      activityCount: 2,
      lastActivityDate: "2026-05-15",
    });
  });

  it("counts and filters drop activity by target business category", () => {
    const rows = [
      { id: "vet-1", businessCategory: "Veterinarian" },
      { id: "vet-2", businessCategory: "Veterinarian" },
      { id: "trainer-1", businessCategory: "Trainer" },
      { id: "unknown", businessCategory: "" },
      { id: "custom", businessCategory: "Animal Sanctuary" },
    ];

    const counts = buildGrassrootsDropCategoryCounts(rows);

    expect(counts.find((row) => row.category === "All")).toMatchObject({ count: 5 });
    expect(counts.find((row) => row.category === "Veterinarian")).toMatchObject({ count: 2 });
    expect(counts.find((row) => row.category === "Trainer")).toMatchObject({ count: 1 });
    expect(counts.find((row) => row.category === "Other")).toMatchObject({ count: 2 });
    expect(filterGrassrootsDropActivityRowsByCategory(rows, "Veterinarian").map((row) => row.id)).toEqual(["vet-1", "vet-2"]);
    expect(filterGrassrootsDropActivityRowsByCategory(rows, "Other").map((row) => row.id)).toEqual(["unknown", "custom"]);
    expect(filterGrassrootsDropActivityRowsByCategory(rows, "All").map((row) => row.id)).toEqual(["vet-1", "vet-2", "trainer-1", "unknown", "custom"]);
  });

  it("validates and paths grassroots drop attachments in private storage", () => {
    const locationId = "11111111-1111-4111-8111-111111111111";
    const targetId = "22222222-2222-4222-8222-222222222222";
    const activityId = "33333333-3333-4333-8333-333333333333";
    const attachmentId = "44444444-4444-4444-8444-444444444444";

    expect(sanitizeGrassrootsAttachmentFilename("../Business card + front.HEIC")).toBe("Business-card-front.HEIC");
    expect(inferGrassrootsActivityAttachmentMimeType({ name: "card.HEIC", type: "" })).toBe("image/heic");
    expect(buildGrassrootsActivityAttachmentPath({
      locationId,
      targetId,
      activityId,
      attachmentId,
      fileName: "../Business card + front.HEIC",
    })).toBe(`${locationId}/targets/${targetId}/activities/${activityId}/${attachmentId}-Business-card-front.HEIC`);

    const { acceptedFiles, errors } = validateGrassrootsActivityAttachmentFiles([
      { name: "card.heic", type: "", size: 1024 },
      { name: "flyer.pdf", type: "application/pdf", size: 4096 },
      { name: "notes.docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 2048 },
      { name: "huge.jpg", type: "image/jpeg", size: 21 * 1024 * 1024 },
    ]);

    expect(acceptedFiles.map((file) => file.name)).toEqual(["card.heic", "flyer.pdf"]);
    expect(errors).toEqual([
      "notes.docx must be a PDF, PNG, JPG, WEBP, HEIC, or HEIF file.",
      "huge.jpg is larger than 20 MB.",
    ]);
    expect(getGrassrootsAttachmentPreviewKind({ file_name: "flyer.pdf" })).toBe("pdf");
    expect(getGrassrootsAttachmentPreviewKind({ mime_type: "image/heic", file_name: "card.heic" })).toBe("image");
  });

  it("groups active grassroots activity attachments by activity", () => {
    const grouped = groupGrassrootsActivityAttachments([
      { id: "older", activity_id: "activity-1", uploaded_at: "2026-05-01T10:00:00Z" },
      { id: "newer", activity_id: "activity-1", uploaded_at: "2026-05-02T10:00:00Z" },
      { id: "deleted", activity_id: "activity-1", uploaded_at: "2026-05-03T10:00:00Z", deleted_at: "2026-05-03T11:00:00Z" },
      { id: "loose", uploaded_at: "2026-05-01T12:00:00Z" },
    ]);

    expect(grouped["activity-1"].map((attachment) => attachment.id)).toEqual(["newer", "older"]);
    expect(grouped.__unlinked__.map((attachment) => attachment.id)).toEqual(["loose"]);
  });

  it("copies the full address from the visible source input before showing copied", async () => {
    const sourceInput = {
      focus: vi.fn(),
      select: vi.fn(),
      setSelectionRange: vi.fn(),
    };
    const runtimeDocument = {
      execCommand: vi.fn(() => true),
    };
    const addressText = "101 New Jersey 73, Evesham, NJ 08053, US";
    const result = await copyGrassrootsTextToClipboard(addressText, sourceInput, {
      document: runtimeDocument,
      navigator: { clipboard: { writeText: vi.fn(), readText: vi.fn(async () => "") } },
    });

    expect(result.copied).toBe(true);
    expect(result.selectionCopied).toBe(true);
    expect(sourceInput.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(sourceInput.select).toHaveBeenCalled();
    expect(sourceInput.setSelectionRange).toHaveBeenCalledWith(0, addressText.length);
    expect(runtimeDocument.execCommand).toHaveBeenCalledWith("copy");
  });

  it("does not report copied when only async clipboard verification succeeds", async () => {
    const sourceInput = {
      focus: vi.fn(),
      select: vi.fn(),
      setSelectionRange: vi.fn(),
    };
    const runtimeDocument = {
      execCommand: vi.fn(() => false),
    };
    const writeText = vi.fn(async () => undefined);
    const readText = vi.fn(async () => "101 New Jersey 73, Evesham, NJ 08053, US");

    const result = await copyGrassrootsTextToClipboard("101 New Jersey 73, Evesham, NJ 08053, US", sourceInput, {
      document: runtimeDocument,
      navigator: { clipboard: { writeText, readText } },
    });

    expect(result.selectionCopied).toBe(false);
    expect(result.apiCopied).toBe(true);
    expect(result.verified).toBe(true);
    expect(result.copied).toBe(false);
  });

  it("keeps the full address selected when automatic copy is blocked", async () => {
    const sourceInput = {
      focus: vi.fn(),
      select: vi.fn(),
      setSelectionRange: vi.fn(),
    };
    const runtimeDocument = {
      execCommand: vi.fn(() => false),
    };
    const addressText = "101 New Jersey 73, Evesham, NJ 08053, US";

    const result = await copyGrassrootsTextToClipboard(addressText, sourceInput, {
      document: runtimeDocument,
      navigator: { clipboard: { writeText: vi.fn(async () => undefined), readText: vi.fn(async () => "") } },
    });

    expect(result.copied).toBe(false);
    expect(result.sourceSelected).toBe(true);
    expect(sourceInput.focus).toHaveBeenCalledTimes(2);
    expect(sourceInput.select).toHaveBeenCalledTimes(2);
    expect(sourceInput.setSelectionRange).toHaveBeenLastCalledWith(0, addressText.length);
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
    const legacyOnly = { address: "123 Main St, Cherry Hill, NJ 08002" };
    const split = {
      address: "500 Route 70, Cherry Hill, NJ 08002",
      address_line_1: "500 Route 70",
      address_line_2: "",
      address_city: "Cherry Hill",
      address_state: "NJ",
      address_postal_code: "08002",
      address_country: "US",
      google_place_id: "place-123",
    };

    expect(getGrassrootsAddressText(legacyOnly)).toBe("123 Main St, Cherry Hill, NJ 08002");
    expect(getGrassrootsSplitAddress(legacyOnly)).toEqual({
      address_line_1: "",
      address_line_2: "",
      address_city: "",
      address_state: "",
      address_postal_code: "",
      address_country: "",
      google_place_id: "",
    });
    expect(getGrassrootsAddressText(split)).toBe("500 Route 70, Cherry Hill, NJ 08002");
    expect(getGrassrootsSplitAddress(split)).toMatchObject({
      address_line_1: "500 Route 70",
      address_city: "Cherry Hill",
      address_state: "NJ",
      address_postal_code: "08002",
      google_place_id: "place-123",
    });
  });

  it("parses selected address suggestions into split fields while preserving freeform address", () => {
    const parsed = parseGooglePlaceAddress({
      formatted_address: "500 Route 70, Cherry Hill, NJ 08002, USA",
      place_id: "place-500",
      address_components: [
        { long_name: "500", short_name: "500", types: ["street_number"] },
        { long_name: "Route 70", short_name: "Rte 70", types: ["route"] },
        { long_name: "Cherry Hill", short_name: "Cherry Hill", types: ["locality"] },
        { long_name: "New Jersey", short_name: "NJ", types: ["administrative_area_level_1"] },
        { long_name: "08002", short_name: "08002", types: ["postal_code"] },
        { long_name: "United States", short_name: "US", types: ["country"] },
      ],
    });

    expect(parsed).toEqual({
      address: "500 Route 70, Cherry Hill, NJ 08002, USA",
      address_line_1: "500 Route 70",
      address_line_2: "",
      address_city: "Cherry Hill",
      address_state: "NJ",
      address_postal_code: "08002",
      address_country: "US",
      google_place_id: "place-500",
    });
    expect(getGrassrootsVisibleAddressLine(parsed)).toBe("500 Route 70");
  });

  it("cleans selected business suggestions and infers drop business categories", () => {
    expect(extractGooglePlaceBusinessName(
      { name: "Banfield Pet Hospital" },
      "Banfield Pet Hospital, New Jersey 73, Marlton, NJ, USA",
    )).toBe("Banfield Pet Hospital");
    expect(extractGooglePlaceBusinessName(
      {},
      "Banfield Pet Hospital, New Jersey 73, Marlton, NJ, USA",
    )).toBe("Banfield Pet Hospital");
    expect(extractGooglePlaceBusinessName(
      { name: "Animal Hospital, Inc." },
      "Animal Hospital, Inc., Main Street, Cherry Hill, NJ, USA",
    )).toBe("Animal Hospital, Inc.");
    expect(inferGrassrootsBusinessCategoryFromPlace(
      { name: "Banfield Pet Hospital", types: ["veterinary_care", "point_of_interest"] },
      "Banfield Pet Hospital",
    )).toBe("Veterinarian");
    expect(inferGrassrootsBusinessCategoryFromPlace({ name: "PetSmart", types: ["pet_store"] }, "PetSmart")).toBe("Pet Retailer");
    expect(inferGrassrootsBusinessCategoryFromPlace({ name: "Camp Bow Wow Cherry Hill", types: ["point_of_interest"] })).toBe("Boarding/Daycare");
  });

  it("falls back to parsing a formatted address when Places does not return components", () => {
    expect(parseFreeformGrassrootsAddress("150 Greene Ln, Cherry Hill Township, NJ 08003, USA")).toEqual({
      address: "150 Greene Ln, Cherry Hill Township, NJ 08003, USA",
      address_line_1: "150 Greene Ln",
      address_line_2: "",
      address_city: "Cherry Hill Township",
      address_state: "NJ",
      address_postal_code: "08003",
      address_country: "US",
      google_place_id: "",
    });

    expect(parseGooglePlaceAddress({
      formatted_address: "150 Greene Ln, Cherry Hill Township, NJ 08003, USA",
      place_id: "place-150",
    })).toMatchObject({
      address_line_1: "150 Greene Ln",
      address_city: "Cherry Hill Township",
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
      address_city: "Cherry Hill",
      address_state: "NJ",
      address_postal_code: "08002",
      address_country: "US",
    })).toBe("500 Route 70, Suite 5, Cherry Hill, NJ 08002, US");
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

  describe("event closeout + past-event semantics", () => {
    const today = "2026-05-11";
    const singleDay = (date) => ({ id: "e", name: "Event", event_dates: [{ event_date: date }] });

    it("getGrassrootsFinalEventDate returns the last day of a multi-day event", () => {
      expect(getGrassrootsFinalEventDate(singleDay("2026-05-01"))).toBe("2026-05-01");
      expect(getGrassrootsFinalEventDate({ event_dates: [{ event_date: "2026-05-05" }, { event_date: "2026-05-10" }] })).toBe("2026-05-10");
      expect(getGrassrootsFinalEventDate({ event_end_date: "2026-05-09" })).toBe("2026-05-09");
      expect(getGrassrootsFinalEventDate({})).toBe("");
    });

    it("treats an event as past only the day AFTER its final day", () => {
      expect(isGrassrootsEventPast(singleDay("2026-05-01"), today)).toBe(true);
      expect(isGrassrootsEventPast(singleDay("2026-05-11"), today)).toBe(false); // today is still the event day
      expect(isGrassrootsEventPast(singleDay("2026-05-20"), today)).toBe(false);
      // multi-day uses the final day: still running today → not past
      expect(isGrassrootsEventPast({ event_dates: [{ event_date: "2026-05-10" }, { event_date: "2026-05-12" }] }, today)).toBe(false);
      expect(isGrassrootsEventPast({ event_dates: [{ event_date: "2026-05-05" }, { event_date: "2026-05-10" }] }, today)).toBe(true);
    });

    it("allows close only on or after the final day, and not once already closed", () => {
      expect(canCloseGrassrootsEvent(singleDay("2026-05-20"), today)).toBe(false); // before the event
      expect(canCloseGrassrootsEvent(singleDay("2026-05-11"), today)).toBe(true); // on the day
      expect(canCloseGrassrootsEvent(singleDay("2026-05-01"), today)).toBe(true); // after
      // multi-day: can't close until the last day is reached
      expect(canCloseGrassrootsEvent({ event_dates: [{ event_date: "2026-05-10" }, { event_date: "2026-05-12" }] }, today)).toBe(false);
      const closed = { event_dates: [{ event_date: "2026-05-01" }], details: { closeout: { closed_at: "2026-05-02" } } };
      expect(canCloseGrassrootsEvent(closed, today)).toBe(false);
    });

    it("reads closeout state out of details.closeout", () => {
      expect(isGrassrootsEventClosed(singleDay("2026-05-01"))).toBe(false);
      expect(getGrassrootsEventCloseout(singleDay("2026-05-01"))).toBeNull();
      const closed = { details: { closeout: { closed_at: "2026-05-02", leads_captured: 7 } } };
      expect(isGrassrootsEventClosed(closed)).toBe(true);
      expect(getGrassrootsEventCloseout(closed).leads_captured).toBe(7);
    });

    it("Past Events view shows past-by-date (incl. overdue-unclosed) AND closed events", () => {
      expect(isGrassrootsEventInPastView(singleDay("2026-05-20"), today)).toBe(false); // upcoming → not past
      expect(isGrassrootsEventInPastView(singleDay("2026-05-11"), today)).toBe(false); // today → not past yet
      expect(isGrassrootsEventInPastView(singleDay("2026-05-01"), today)).toBe(true); // overdue & unclosed → shown
      const closedFuture = { event_dates: [{ event_date: "2026-05-20" }], details: { closeout: { closed_at: "2026-05-11" } } };
      expect(isGrassrootsEventInPastView(closedFuture, today)).toBe(true); // closed → shown
    });

    it("renders a closed event's status as Finished without changing the stored status", () => {
      const closed = { status: "booked", details: { closeout: { closed_at: "2026-05-11" } } };
      expect(getGrassrootsEventDisplayStatus(closed)).toBe("finished");
      expect(getGrassrootsDisplayStatusLabel(closed)).toBe("Finished");
      const booked = { status: "booked" };
      expect(getGrassrootsEventDisplayStatus(booked)).toBe("booked");
      expect(getGrassrootsDisplayStatusLabel(booked)).toBe("Booked");
    });

    it("flags missing required field groups (address/type/organizer/date)", () => {
      const complete = {
        organizer: "H.I.P. Inc.",
        event_type: "B2C",
        address_city: "Cherry Hill",
        event_dates: [{ event_date: "2026-06-01" }],
      };
      expect(getGrassrootsEventFieldGaps(complete)).toMatchObject({ organizer: false, event: false, date: false });

      const soccerFest = { name: "Soccer Fest", organizer: "Rec League", event_dates: [{ event_date: "2026-06-10" }] };
      const gaps = getGrassrootsEventFieldGaps(soccerFest);
      expect(gaps.event).toBe(true);
      expect(gaps.eventMissing).toEqual(["address", "type"]);
      expect(gaps.organizer).toBe(false); // organizer present
      expect(gaps.date).toBe(false);

      const blank = { event_dates: [{ event_date: "2026-06-10" }] };
      expect(getGrassrootsEventFieldGaps(blank).organizer).toBe(true);
      // legacy single-field address still counts as filled
      expect(getGrassrootsEventFieldGaps({ ...soccerFest, address: "123 Main St", event_type: "B2B" }).event).toBe(false);
    });

    it("summarizes single, consecutive multi-day, and scattered event dates", () => {
      expect(summarizeGrassrootsEventDates(singleDay("2026-05-31"))).toMatchObject({ count: 1, isMultiDay: false, isConsecutive: false });
      const run = summarizeGrassrootsEventDates({ event_dates: [{ event_date: "2026-05-31" }, { event_date: "2026-06-01" }, { event_date: "2026-06-02" }] });
      expect(run).toMatchObject({ count: 3, isMultiDay: true, isConsecutive: true });
      expect(run.first.event_date).toBe("2026-05-31");
      expect(run.last.event_date).toBe("2026-06-02");
      const scattered = summarizeGrassrootsEventDates({ event_dates: [{ event_date: "2026-05-31" }, { event_date: "2026-06-14" }] });
      expect(scattered).toMatchObject({ count: 2, isMultiDay: true, isConsecutive: false });
      expect(summarizeGrassrootsEventDates({})).toMatchObject({ count: 0, isMultiDay: false });
    });

    it("parses and toggles visit materials (comma-joined, legacy-safe)", () => {
      expect(parseGrassrootsMaterialsLeft("Consumer brochure, Pens")).toEqual(["Consumer brochure", "Pens"]);
      expect(parseGrassrootsMaterialsLeft("")).toEqual([]);
      expect(toggleGrassrootsMaterial("", "Coupon")).toBe("Coupon");
      expect(toggleGrassrootsMaterial("Coupon, Pens", "Pens")).toBe("Coupon");
      expect(toggleGrassrootsMaterial("Coupon", "coupon")).toBe(""); // case-insensitive remove
    });

    it("flags missing business contact + category", () => {
      expect(getGrassrootsBusinessFieldGaps({ name: "Vet Co", contact_phone: "555", contact_email: "a@b.com", business_category: "Veterinarian" })).toMatchObject({ contact: false, category: false });
      const partial = getGrassrootsBusinessFieldGaps({ name: "Vet Co", business_category: "Veterinarian" });
      expect(partial.contact).toBe(true);
      expect(partial.contactMissing).toEqual(["phone", "email"]);
      expect(getGrassrootsBusinessFieldGaps({ name: "Vet Co", contact_phone: "5", contact_email: "a@b.com" }).category).toBe(true);
    });

    it("makeGrassrootsEventCloseout normalizes the persisted payload", () => {
      const closeout = makeGrassrootsEventCloseout({ leadsCaptured: "12", cpl: "4.50", notes: "  great turnout  ", closedAt: "2026-05-11", closedByName: "Zack" });
      expect(closeout).toMatchObject({ closed_at: "2026-05-11", leads_captured: 12, cpl: 4.5, notes: "great turnout", closed_by_name: "Zack" });
      expect(makeGrassrootsEventCloseout({}).leads_captured).toBe(0);
    });
  });
});
