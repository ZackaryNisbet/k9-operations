import { describe, expect, it } from "vitest";
import {
  ENRICHMENT_CSR_GUIDE_SECTIONS,
  ENRICHMENT_RESOURCE_LINKS,
  ENRICHMENT_TEXT_SCRIPTS,
  SEED_ENRICHMENT_EVENTS,
  buildCalendarWeeks,
  filterEventsForMonth,
  getEventsForDate,
  getMonthEnd,
  getMonthStart,
  mergeEnrichmentEvents,
  normalizeEnrichmentProgramConfig,
  prepareEnrichmentProgramConfigPayload,
  normalizeDate,
  serializeProducts,
} from "../kol/enrichments/enrichmentData";

describe("enrichment calendar helpers", () => {
  it("normalizes local dates without shifting the calendar day", () => {
    expect(normalizeDate("2026-05-05")).toBe("2026-05-05");
    expect(getMonthStart("2026-05-23")).toBe("2026-05-01");
    expect(getMonthEnd("2026-05-23")).toBe("2026-05-31");
  });

  it("separates staff events from customer-visible calendar events", () => {
    const mayStaffEvents = filterEventsForMonth(SEED_ENRICHMENT_EVENTS, "2026-05-01", "staff");
    const mayCustomerEvents = filterEventsForMonth(SEED_ENRICHMENT_EVENTS, "2026-05-01", "customer");
    expect(mayStaffEvents.length).toBeGreaterThan(mayCustomerEvents.length);
    expect(mayCustomerEvents.every((event) => event.customer_visible)).toBe(true);
    expect(mayCustomerEvents.some((event) => event.title === "Cinco de Mayo Fiesta")).toBe(true);
  });

  it("allows a customer event and a brain boost event on the same date", () => {
    const mayThirteen = getEventsForDate(SEED_ENRICHMENT_EVENTS, "2026-05-13", "staff");
    expect(mayThirteen.map((event) => event.title)).toContain("Client Appreciation");
    expect(mayThirteen.map((event) => event.title)).toContain("Ball Pit Brain Work");
  });

  it("includes the May 6 Bubble Day Wednesday feature", () => {
    const maySix = getEventsForDate(SEED_ENRICHMENT_EVENTS, "2026-05-06", "customer");
    expect(maySix.map((event) => event.title)).toContain("Bubble Day");
  });

  it("builds full calendar weeks including leading blanks", () => {
    const weeks = buildCalendarWeeks("2026-05-01");
    expect(weeks[0][0].date).toBe("2026-04-26");
    expect(weeks[0][5].date).toBe("2026-05-01");
    expect(weeks.flat().some((day) => day.date === "2026-05-31")).toBe(true);
  });

  it("lets persisted rows override starter seed rows by legacy source id", () => {
    const seed = SEED_ENRICHMENT_EVENTS.find((event) => event.title === "Pup Prom");
    const merged = mergeEnrichmentEvents([
      { ...seed, title: "Pup Prom - Updated", summary: "Updated SOP" },
    ], [seed], "demo");
    expect(merged.find((event) => event.legacy_source_id === seed.legacy_source_id).title).toBe("Pup Prom - Updated");
  });

  it("preserves imported SOP product links for staff references", () => {
    const cinco = SEED_ENRICHMENT_EVENTS.find((event) => event.title === "Cinco de Mayo Fiesta");
    expect(cinco.products.some((product) => product.url?.startsWith("https://"))).toBe(true);
    expect(serializeProducts(cinco.products)).toContain("https://www.amazon.com/");
  });

  it("preserves K9 Enrichment SOP product links on brain boost lessons", () => {
    const puzzle = SEED_ENRICHMENT_EVENTS.find((event) => event.title === "Puzzle Challenge");
    const frozen = SEED_ENRICHMENT_EVENTS.find((event) => event.title === "Frozen Focus");
    expect(serializeProducts(puzzle.products)).toContain("Treat puzzles");
    expect(serializeProducts(puzzle.products)).toContain("https://www.amazon.com/Ottosson-Outward-Hound-Purple-Interactive");
    expect(serializeProducts(frozen.products)).toContain("Pupsicle-style enrichment ball");
    expect(serializeProducts(frozen.products)).toContain("https://www.amazon.com/WOOF-Pupsicle");
  });

  it("keeps SOP resource links and CSR text scripts available", () => {
    expect(ENRICHMENT_RESOURCE_LINKS.every((link) => link.url.startsWith("https://"))).toBe(true);
    expect(ENRICHMENT_RESOURCE_LINKS.map((link) => link.label)).toContain("Round 2 Enrichment Lessons");
    expect(ENRICHMENT_TEXT_SCRIPTS.some((script) => script.label === "Initial Outreach")).toBe(true);
    expect(ENRICHMENT_CSR_GUIDE_SECTIONS.some((section) => section.items.some((item) => item.includes("SMS should be the last resort")))).toBe(true);
  });

  it("normalizes editable Program SOP config with resource renames and section text", () => {
    const config = normalizeEnrichmentProgramConfig({
      resourceLinks: [
        { label: " Updated Drive ", url: "drive.google.com/file/example" },
        { label: "Missing URL", url: "" },
      ],
      programSopSections: [
        { title: " Program Rules ", items: [" Keep it enrichment only. ", "", "No training promises."] },
      ],
    });
    expect(config.resourceLinks).toEqual([{ label: "Updated Drive", url: "https://drive.google.com/file/example" }]);
    expect(config.programSopSections).toEqual([
      { title: "Program Rules", items: ["Keep it enrichment only.", "No training promises."] },
    ]);
  });

  it("prepares editable Program SOP config with audit metadata", () => {
    const payload = prepareEnrichmentProgramConfigPayload({
      resourceLinks: [{ label: "Lessons", url: "https://example.com/lessons" }],
      programSopSections: [{ title: "Rules", items: ["One lesson per service."] }],
    }, "Zack");
    expect(payload.updatedBy).toBe("Zack");
    expect(payload.updatedAt).toMatch(/T/);
    expect(payload.resourceLinks[0].label).toBe("Lessons");
  });
});
