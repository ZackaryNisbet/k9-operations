import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import {
  buildLaborRosterPdfBytes,
  normalizeLaborRosterPdfOptions,
  resolveLaborRosterPageSize,
  LABOR_ROSTER_PAGE_SIZES,
} from "../kol/laborRosterPdf";

function readPublicAsset(path) {
  return readFileSync(new URL(`../../public/${path}`, import.meta.url));
}

const assets = {
  logoPngBytes: readPublicAsset("labor/roster-brand-assets/K9Resorts_Horizontal_Logo_BlueGold_RGB.png"),
  fonts: {
    canelaBold: readPublicAsset("fonts/Canela-Bold.otf"),
    gtEestiTextMedium: readPublicAsset("fonts/GT-Eesti-Text-Medium.otf"),
    gtEestiTextBold: readPublicAsset("fonts/GT-Eesti-Text-Bold.otf"),
    gtEestiTextLight: readPublicAsset("fonts/GT-Eesti-Text-Light.otf"),
  },
};

const rosterRows = [
  ["Skylerary Brooks", "Director of Resorts", "Full-Time"],
  ["Zach E. Cruz", "Assistant Manager", "Full-Time"],
  ["Angelina DeAugustine", "Assistant Manager", "Full-Time"],
  ["Alvaro (AJ) Bonilla", "Supervisor", "Full-Time"],
  ["Allison Davenport", "Supervisor", "Full-Time"],
  ["Alexis E. Turner", "Supervisor", "Full-Time"],
  ["Krystina Ungarino", "Supervisor", "Full-Time"],
  ["Julia C. Zawisza", "Supervisor", "Full-Time"],
  ["Sophia Meikle", "Customer Service Representative", "Full-Time"],
  ["Emily Chadwick", "Pet Care Technician", "Part-Time"],
  ["Chrystanna G. Decker", "Pet Care Technician", "Full-Time"],
  ["Anthony Duca", "Pet Care Technician", "Full-Time"],
  ["Michael Duprey", "Pet Care Technician", "Part-Time"],
  ["Ashlyn Dye", "Pet Care Technician", "Part-Time"],
  ["Addison Earnst", "Pet Care Technician", "Part-Time"],
  ["Evelyn Guevara Flores", "Pet Care Technician", "Part-Time"],
  ["Michelle Fuges", "Pet Care Technician", "Full-Time"],
  ["Lahayla Kern", "Pet Care Technician", "Part-Time"],
  ["Lindsay Norton", "Pet Care Technician", "Part-Time"],
  ["Samara B. Quinones", "Pet Care Technician", "Full-Time"],
  ["Gianna M. Rutigliano", "Pet Care Technician", "Full-Time"],
].map(([name, position, commitment], index) => ({
  name,
  position,
  commitment,
  phone: `(856) 555-01${String(index).padStart(2, "0")}`,
  email: `${name.toLowerCase().replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "")}@example.com`,
}));

const basePayload = {
  title: "K9 Resorts of Adair Forsythe - Team Roster",
  filename: "K9 Resorts of Adair Forsythe Roster - 05/08/26.pdf",
  printDate: "May 8, 2026",
  totalEmployees: 21,
  showUnassigned: false,
  assets,
  stats: [
    { label: "Managers", value: 3 },
    { label: "SUP", value: 5 },
    { label: "CSR", value: 1 },
    { label: "PCT", value: 12 },
    { label: "Full-Time", value: 14 },
    { label: "Part-Time", value: 7 },
  ],
  matrix: [
    { label: "Managers", fullTime: 3, partTime: 0, total: 3 },
    { label: "Supervisors", fullTime: 5, partTime: 0, total: 5 },
    { label: "CSR", fullTime: 1, partTime: 0, total: 1 },
    { label: "PCT", fullTime: 5, partTime: 7, total: 12 },
  ],
  rows: rosterRows,
};

async function extractPdfText(bytes) {
  const loadingTask = getDocument({ data: new Uint8Array(bytes), disableWorker: true });
  const pdf = await loadingTask.promise;
  const pages = [];
  for (let index = 1; index <= pdf.numPages; index += 1) {
    const page = await pdf.getPage(index);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => item.str).join(" "));
  }
  await pdf.destroy();
  return pages.join("\n");
}

describe("labor roster PDF", () => {
  it("defaults to contact roster output without report metrics", () => {
    expect(normalizeLaborRosterPdfOptions()).toMatchObject({
      showMetrics: false,
      showStaffingMatrix: false,
      showCommitment: false,
      showPhone: true,
      showEmail: true,
    });
  });

  it("generates a one-page K9 Resorts contact roster for the normal Adair Forsythe team size", async () => {
    const bytes = await buildLaborRosterPdfBytes(basePayload);
    const pdfDoc = await PDFDocument.load(bytes);
    const text = await extractPdfText(bytes);
    expect(bytes.length).toBeGreaterThan(200000);
    expect(pdfDoc.getPageCount()).toBe(1);
    expect(text).toContain("Adair Forsythe Team Roster");
    expect(text).toContain("K9 Resorts Luxury Pet Hotel");
    expect(text).toContain("(856) 555-0100");
    expect(text).toContain("zackary.nisbet@example.com");
    expect(text).not.toContain("K9 Operations");
  });

  it("keeps the normal phone and email roster on one page", async () => {
    const bytes = await buildLaborRosterPdfBytes({
      ...basePayload,
      options: {
        showPhone: true,
        showEmail: true,
      },
    });
    const pdfDoc = await PDFDocument.load(bytes);
    expect(pdfDoc.getPageCount()).toBe(1);
  });

  it("omits PDF contact fields cleanly when phone and email are disabled", async () => {
    const bytes = await buildLaborRosterPdfBytes({
      ...basePayload,
      options: {
        showPhone: false,
        showEmail: false,
      },
    });
    const pdfDoc = await PDFDocument.load(bytes);
    const text = await extractPdfText(bytes);

    expect(pdfDoc.getPageCount()).toBe(1);
    expect(text).toContain("Adair Forsythe Team Roster");
    expect(text).not.toContain("(856) 555-0100");
    expect(text).not.toContain("zackary.nisbet@example.com");
    expect(text).not.toContain("Phone Email");
  });

  it("can print only phone or only email contact fields", async () => {
    const phoneOnlyText = await extractPdfText(await buildLaborRosterPdfBytes({
      ...basePayload,
      options: {
        showPhone: true,
        showEmail: false,
      },
    }));
    const emailOnlyText = await extractPdfText(await buildLaborRosterPdfBytes({
      ...basePayload,
      options: {
        showPhone: false,
        showEmail: true,
      },
    }));

    expect(phoneOnlyText).toContain("(856) 555-0100");
    expect(phoneOnlyText).not.toContain("zackary.nisbet@example.com");
    expect(emailOnlyText).not.toContain("(856) 555-0100");
    expect(emailOnlyText).toContain("zackary.nisbet@example.com");
  });

  it("keeps commitment, phone, and email on one page without report metrics", async () => {
    const bytes = await buildLaborRosterPdfBytes({
      ...basePayload,
      options: {
        showCommitment: true,
        showPhone: true,
        showEmail: true,
      },
    });
    const pdfDoc = await PDFDocument.load(bytes);
    expect(pdfDoc.getPageCount()).toBe(1);
  });

  it("compresses an oversized contact roster onto a single page", async () => {
    const positions = [
      ["Director of Resorts", 1],
      ["General Manager", 1],
      ["Assistant Manager", 2],
      ["Supervisor", 6],
      ["Customer Service Representative", 4],
      ["Pet Care Technician", 31],
    ];
    const bigRoster = [];
    positions.forEach(([position, count]) => {
      for (let index = 0; index < count; index += 1) {
        const sequence = bigRoster.length;
        bigRoster.push({
          name: `Associate ${String(sequence + 1).padStart(2, "0")} ${position.split(" ")[0]}`,
          position,
          commitment: sequence % 3 === 0 ? "Part-Time" : "Full-Time",
          phone: `(856) 555-${String(1000 + sequence).slice(-4)}`,
          email: `associate.${sequence + 1}@example.com`,
        });
      }
    });

    const bytes = await buildLaborRosterPdfBytes({
      ...basePayload,
      totalEmployees: bigRoster.length,
      rows: bigRoster,
      options: {
        showPhone: true,
        showEmail: true,
      },
    });
    const pdfDoc = await PDFDocument.load(bytes);
    const text = await extractPdfText(bytes);

    expect(bigRoster.length).toBe(45);
    expect(pdfDoc.getPageCount()).toBe(1);
    // Every contact still makes it onto the single page after compression.
    expect(text).toContain("associate.1@example.com");
    expect(text).toContain("associate.45@example.com");
    expect(text).toContain("Pet Care Technician");
  });

  it("defaults to Letter landscape dimensions", async () => {
    const bytes = await buildLaborRosterPdfBytes(basePayload);
    const pdfDoc = await PDFDocument.load(bytes);
    const { width, height } = pdfDoc.getPage(0).getSize();
    expect([Math.round(width), Math.round(height)]).toEqual([792, 612]);
    expect(resolveLaborRosterPageSize(undefined)).toEqual({ width: 792, height: 612 });
  });

  it("renders born at the requested poster size without losing content", async () => {
    const poster = LABOR_ROSTER_PAGE_SIZES.find((size) => size.id === "poster-18x24");
    const letterText = await extractPdfText(await buildLaborRosterPdfBytes(basePayload));
    const bytes = await buildLaborRosterPdfBytes({ ...basePayload, pageSize: "poster-18x24" });
    const pdfDoc = await PDFDocument.load(bytes);
    const { width, height } = pdfDoc.getPage(0).getSize();
    const posterText = await extractPdfText(bytes);

    // Exact 24 × 18 in sheet (1 in = 72 pt), still a single page.
    expect([Math.round(width), Math.round(height)]).toEqual([poster.width, poster.height]);
    expect([Math.round(width), Math.round(height)]).toEqual([1728, 1296]);
    expect(pdfDoc.getPageCount()).toBe(1);
    // Scaling the page up must not drop or clip any roster text.
    expect(posterText).toBe(letterText);
    expect(posterText).toContain("zackary.nisbet@example.com");
  });

  it("accepts an explicit { width, height } page size", () => {
    expect(resolveLaborRosterPageSize({ width: 1000, height: 800 })).toEqual({ width: 1000, height: 800 });
    expect(resolveLaborRosterPageSize("nonexistent-id")).toEqual({ width: 792, height: 612 });
  });

  it("keeps a single large role as one continuous list, not repeated cards", async () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({
      name: `Pet Care Tech ${i + 1}`,
      position: "Pet Care Technician",
      phone: `(856) 555-${String(2000 + i).slice(-4)}`,
      email: `pct.${i + 1}@example.com`,
    }));
    const bytes = await buildLaborRosterPdfBytes({
      ...basePayload,
      totalEmployees: 30,
      rows,
      options: { showPhone: true, showEmail: true },
    });
    const pdfDoc = await PDFDocument.load(bytes);
    const text = await extractPdfText(bytes);

    expect(pdfDoc.getPageCount()).toBe(1);
    // A role that spans columns reads as a continuation, never as independent cards.
    expect(text).toContain("(cont.)");
    // Every technician appears exactly once — the column flow drops and duplicates nobody.
    for (let i = 1; i <= 30; i += 1) {
      expect(text.split(`pct.${i}@example.com`).length - 1).toBe(1);
    }
  });

  it("orders role groups by the configured hierarchy, slotting in new roles", async () => {
    // A brand-new role ("Barn Concierge") placed between Supervisor and PCT in
    // the hierarchy must appear there — not dumped at the bottom by default weight.
    const positionOrder = ["Supervisor", "Barn Concierge", "Pet Care Technician"];
    const rows = [
      { name: "Pat Tech", position: "Pet Care Technician", phone: "(856) 555-0001", email: "pct@example.com" },
      { name: "Sam Super", position: "Supervisor", phone: "(856) 555-0002", email: "sup@example.com" },
      { name: "Bo Barn", position: "Barn Concierge", phone: "(856) 555-0003", email: "barn@example.com" },
    ];
    const text = await extractPdfText(await buildLaborRosterPdfBytes({
      ...basePayload,
      rows,
      positionOrder,
      options: { showPhone: true, showEmail: true },
    }));

    const iSup = text.indexOf("Supervisor");
    const iBarn = text.indexOf("Barn Concierge");
    const iPct = text.indexOf("Pet Care Technician");
    expect(iSup).toBeGreaterThanOrEqual(0);
    expect(iBarn).toBeGreaterThan(iSup);
    expect(iPct).toBeGreaterThan(iBarn);
  });
});
