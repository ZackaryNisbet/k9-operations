import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import {
  buildLaborRosterPdfBytes,
  normalizeLaborRosterPdfOptions,
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
  ["Zackary Nisbet", "Director of Resorts", "Full-Time"],
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
  title: "K9 Resorts of Cherry Hill - Team Roster",
  filename: "K9 Resorts of Cherry Hill Roster - 05/08/26.pdf",
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

  it("generates a one-page K9 Resorts contact roster for the normal Cherry Hill team size", async () => {
    const bytes = await buildLaborRosterPdfBytes(basePayload);
    const pdfDoc = await PDFDocument.load(bytes);
    const text = await extractPdfText(bytes);
    expect(bytes.length).toBeGreaterThan(200000);
    expect(pdfDoc.getPageCount()).toBe(1);
    expect(text).toContain("Cherry Hill Team Roster");
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
    expect(text).toContain("Cherry Hill Team Roster");
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
});
