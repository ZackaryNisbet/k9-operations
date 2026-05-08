import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
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

describe("labor roster PDF", () => {
  it("defaults to wall-poster output without metrics or contact columns", () => {
    expect(normalizeLaborRosterPdfOptions()).toMatchObject({
      showMetrics: false,
      showStaffingMatrix: false,
      showCommitment: false,
      showPhone: false,
      showEmail: false,
    });
  });

  it("generates a one-page K9 Resorts wall roster for the normal Cherry Hill team size", async () => {
    const bytes = await buildLaborRosterPdfBytes(basePayload);
    const pdfDoc = await PDFDocument.load(bytes);
    expect(bytes.length).toBeGreaterThan(200000);
    expect(pdfDoc.getPageCount()).toBe(1);
  });

  it("paginates gracefully when optional metrics and contact details are shown", async () => {
    const bytes = await buildLaborRosterPdfBytes({
      ...basePayload,
      options: {
        showMetrics: true,
        showStaffingMatrix: true,
        showCommitment: true,
        showPhone: true,
        showEmail: true,
      },
    });
    const pdfDoc = await PDFDocument.load(bytes);
    expect(pdfDoc.getPageCount()).toBeGreaterThanOrEqual(1);
  });
});
