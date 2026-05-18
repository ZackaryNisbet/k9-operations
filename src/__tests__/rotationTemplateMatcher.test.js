import { describe, expect, it } from "vitest";
import {
  buildRotationTemplateMatches,
  findRotationTemplateCandidates,
  findRotationTemplateMatch,
  getRotationTemplateCatalogSummary,
} from "../kol/scheduling/rotationTemplateMatcher";
import rotationTemplateCatalog from "../kol/scheduling/rotationTemplateCatalog.json";

describe("rotation template matcher", () => {
  it("extracts the manual workbook as a traceable template catalog", () => {
    const summary = getRotationTemplateCatalogSummary();
    expect(summary.templateCount).toBe(122);
    expect(summary.shiftCounts.AM).toBeGreaterThan(50);
    expect(summary.shiftCounts.PM).toBeGreaterThan(40);
    expect(summary.dayTypeCounts.weekday).toBeGreaterThan(50);
    expect(summary.dayTypeCounts.weekend).toBeGreaterThan(40);
  });

  it("matches a weekday opening request by shift, day type, and PCT count", () => {
    const match = findRotationTemplateMatch({
      date: "2026-05-18",
      shift: "opening",
      counts: { manager: 1, supervisor: 1, csr: 1, pct: 4 },
    });

    expect(match.template).toBeTruthy();
    expect(match.template.shift).toBe("AM");
    expect(match.template.dayType).toBe("weekday");
    expect(match.template.sourceSheetName).toMatch(/4.*Person.*AM/i);
    expect(["high", "medium"]).toContain(match.confidence);
  });

  it("matches opening and closing rows independently", () => {
    const matches = buildRotationTemplateMatches({
      date: "2026-05-23",
      staffingMatrix: {
        opening: { manager: 1, supervisor: 1, csr: 0, pct: 5 },
        closing: { manager: 1, supervisor: 1, csr: 0, pct: 4 },
      },
    });

    expect(matches.opening.template.shift).toBe("AM");
    expect(matches.closing.template.shift).toBe("PM");
    expect(matches.opening.template.dayType).toBe("weekend");
    expect(matches.closing.template.dayType).toBe("weekend");
  });

  it("does not explain MOD coverage as supervisor coverage", () => {
    const match = findRotationTemplateMatch({
      date: "2026-05-17",
      shift: "opening",
      counts: { manager: 1, supervisor: 1, csr: 2, pct: 4 },
    });

    expect(match.explanation).not.toMatch(/represented by supervisor/i);
  });

  it("prioritizes exact PCT headcount templates before half-person near matches", () => {
    const [first] = findRotationTemplateCandidates({
      date: "2026-05-17",
      shift: "opening",
      counts: { manager: 1, supervisor: 1, csr: 0, pct: 4 },
    }, 3);

    expect(first.template.personCount).toBe(4);
  });

  it("expands merged workbook cells across every occupied template slot", () => {
    const template = rotationTemplateCatalog.templates.find((item) => item.sourceSheetName === "7 person (weekend) AM");

    expect(template).toBeTruthy();
    expect(template.cells.length).toBeGreaterThan(80);
    expect(template.cells).toEqual(expect.arrayContaining([
      expect.objectContaining({
        laneKey: "person_1_3",
        raw: "Private Play (Help w/ Transport) (Use Boxes)",
        taskKey: "pp",
        time: "07:30",
      }),
      expect.objectContaining({
        laneKey: "person_4_6",
        raw: "Large Dog Daycare",
        taskKey: "lgdc",
        time: "08:00",
      }),
    ]));
  });

  it("normalizes workbook Day Care spelling into daycare task lanes", () => {
    const template = rotationTemplateCatalog.templates.find((item) => item.sourceSheetName === "PP 4 Person(Weekend) AM");

    expect(template?.cells).toEqual(expect.arrayContaining([
      expect.objectContaining({
        raw: "Large Dog Day Care",
        taskKey: "lgdc",
        time: "07:30",
      }),
    ]));
  });
});
