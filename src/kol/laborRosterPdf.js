import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const PAGE_WIDTH = 792;
const PAGE_HEIGHT = 612;
const MARGIN_X = 42;
const FOOTER_Y = 32;
const CONTENT_BOTTOM = 58;

const BRAND = {
  gold: "#AF8D54",
  blue: "#003462",
  black: "#000000",
  white: "#FFFFFF",
  bronze: "#59504B",
  paper: "#FFFEFC",
  ivory: "#F8F5EF",
  line: "#D9C9AC",
};

export const LABOR_ROSTER_BRAND_ASSETS = {
  logoPng: "/labor/roster-brand-assets/K9Resorts_Horizontal_Logo_BlueGold_RGB.png",
  logoSvg: "/labor/roster-brand-assets/K9Resorts_Horizontal_Logo_BlueGold_RGB.svg",
  fonts: {
    canelaBold: "/fonts/Canela-Bold.otf",
    gtEestiTextMedium: "/fonts/GT-Eesti-Text-Medium.otf",
    gtEestiTextBold: "/fonts/GT-Eesti-Text-Bold.otf",
    gtEestiTextLight: "/fonts/GT-Eesti-Text-Light.otf",
  },
};

export const DEFAULT_LABOR_ROSTER_PDF_OPTIONS = {
  showMetrics: false,
  showStaffingMatrix: false,
  showCommitment: false,
  showPhone: false,
  showEmail: false,
};

export function normalizeLaborRosterPdfOptions(options = {}) {
  return {
    ...DEFAULT_LABOR_ROSTER_PDF_OPTIONS,
    ...Object.fromEntries(
      Object.keys(DEFAULT_LABOR_ROSTER_PDF_OPTIONS).map((key) => [key, Boolean(options[key])]),
    ),
  };
}

async function fetchBytes(path, fetcher = globalThis.fetch) {
  if (typeof fetcher !== "function") {
    throw new Error("PDF asset loading requires fetch.");
  }
  const response = await fetcher(path);
  if (!response?.ok) {
    throw new Error(`Unable to load PDF asset: ${path}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

export async function loadLaborRosterPdfAssets(fetcher) {
  const [logoPngBytes, canelaBold, gtEestiTextMedium, gtEestiTextBold, gtEestiTextLight] = await Promise.all([
    fetchBytes(LABOR_ROSTER_BRAND_ASSETS.logoPng, fetcher),
    fetchBytes(LABOR_ROSTER_BRAND_ASSETS.fonts.canelaBold, fetcher),
    fetchBytes(LABOR_ROSTER_BRAND_ASSETS.fonts.gtEestiTextMedium, fetcher),
    fetchBytes(LABOR_ROSTER_BRAND_ASSETS.fonts.gtEestiTextBold, fetcher),
    fetchBytes(LABOR_ROSTER_BRAND_ASSETS.fonts.gtEestiTextLight, fetcher),
  ]);
  return {
    logoPngBytes,
    fonts: {
      canelaBold,
      gtEestiTextMedium,
      gtEestiTextBold,
      gtEestiTextLight,
    },
  };
}

function color(hex) {
  const clean = String(hex || "").replace("#", "");
  const value = clean.length === 3
    ? clean.split("").map((char) => `${char}${char}`).join("")
    : clean.padEnd(6, "0").slice(0, 6);
  return rgb(
    parseInt(value.slice(0, 2), 16) / 255,
    parseInt(value.slice(2, 4), 16) / 255,
    parseInt(value.slice(4, 6), 16) / 255,
  );
}

function toBytes(value) {
  if (!value) return null;
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  return null;
}

function safeText(value, fallback = "") {
  const text = String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text || fallback;
}

function truncateToWidth(value, font, size, maxWidth) {
  const text = safeText(value);
  if (!text || !font || font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  const ellipsis = "...";
  let next = text;
  while (next.length > 0 && font.widthOfTextAtSize(`${next}${ellipsis}`, size) > maxWidth) {
    next = next.slice(0, -1);
  }
  return `${next.trimEnd()}${ellipsis}`;
}

function drawText(page, text, x, y, options = {}) {
  const font = options.font;
  const size = options.size || 8;
  const maxWidth = options.maxWidth || null;
  const value = maxWidth && font ? truncateToWidth(text, font, size, maxWidth) : safeText(text);
  if (!value) return;
  const width = font ? font.widthOfTextAtSize(value, size) : 0;
  const xOffset = options.align === "center" && maxWidth
    ? Math.max(0, (maxWidth - width) / 2)
    : options.align === "right" && maxWidth
      ? Math.max(0, maxWidth - width)
      : 0;
  page.drawText(value, {
    x: x + xOffset,
    y,
    size,
    font,
    color: options.color || color(BRAND.black),
    maxWidth: maxWidth || undefined,
  });
}

function baselineForBox(font, size, boxY, boxHeight) {
  if (!font?.heightAtSize) return boxY + Math.max(0, (boxHeight - size) / 2);
  const fullHeight = font.heightAtSize(size);
  const ascenderHeight = font.heightAtSize(size, { descender: false });
  const descenderHeight = Math.max(0, fullHeight - ascenderHeight);
  return boxY + Math.max(0, (boxHeight - fullHeight) / 2) + descenderHeight;
}

function drawTextInBox(page, text, x, boxY, boxHeight, options = {}) {
  drawText(page, text, x, baselineForBox(options.font, options.size || 8, boxY, boxHeight), options);
}

function wrapText(value, font, size, maxWidth, maxLines = 3) {
  const words = safeText(value).split(" ").filter(Boolean);
  const lines = [];
  let current = "";
  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;
    if (!current || font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
      return;
    }
    lines.push(current);
    current = word;
  });
  if (current) lines.push(current);
  const visible = lines.slice(0, maxLines);
  if (lines.length > maxLines && visible.length > 0) {
    visible[visible.length - 1] = truncateToWidth(visible[visible.length - 1], font, size, maxWidth);
  }
  return visible;
}

function drawRule(page, x, y, width, height = 0.75, fill = BRAND.line) {
  page.drawRectangle({ x, y, width, height, color: color(fill) });
}

function drawBox(page, x, y, width, height, options = {}) {
  page.drawRectangle({
    x,
    y,
    width,
    height,
    color: color(options.fill || BRAND.white),
    borderColor: color(options.border || BRAND.line),
    borderWidth: options.borderWidth ?? 0.6,
  });
}

async function embedBrandFonts(pdfDoc, assets = {}) {
  const standard = {
    headline: await pdfDoc.embedFont(StandardFonts.TimesRomanBold),
    body: await pdfDoc.embedFont(StandardFonts.Helvetica),
    bodyLight: await pdfDoc.embedFont(StandardFonts.Helvetica),
    bodyBold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
  };

  const fontBytes = assets.fonts || {};
  try {
    pdfDoc.registerFontkit(fontkit);
    const [headline, body, bodyBold, bodyLight] = await Promise.all([
      toBytes(fontBytes.canelaBold) ? pdfDoc.embedFont(toBytes(fontBytes.canelaBold), { subset: false }) : null,
      toBytes(fontBytes.gtEestiTextMedium) ? pdfDoc.embedFont(toBytes(fontBytes.gtEestiTextMedium), { subset: false }) : null,
      toBytes(fontBytes.gtEestiTextBold) ? pdfDoc.embedFont(toBytes(fontBytes.gtEestiTextBold), { subset: false }) : null,
      toBytes(fontBytes.gtEestiTextLight) ? pdfDoc.embedFont(toBytes(fontBytes.gtEestiTextLight), { subset: false }) : null,
    ]);
    return {
      headline: headline || standard.headline,
      body: body || standard.body,
      bodyLight: bodyLight || body || standard.bodyLight,
      bodyBold: bodyBold || body || standard.bodyBold,
    };
  } catch {
    return standard;
  }
}

function formatPosterTitle(value = "") {
  const clean = safeText(value, "Team Roster")
    .replace(/^K9 Resorts of\s+/i, "")
    .replace(/^K9 Resorts\s+/i, "")
    .replace(/\s*-\s*Team Roster$/i, "")
    .replace(/\s+Roster$/i, "")
    .trim();
  return clean ? `${clean} Team Roster` : "Team Roster";
}

function formatUpdatedLabel(value = "") {
  const clean = safeText(value);
  return clean ? `Updated ${clean}` : "";
}

function getPositionWeight(value = "") {
  const title = safeText(value).toLowerCase();
  if (/(director|regional)/.test(title)) return 100;
  if (/(general manager|\bgm\b)/.test(title)) return 90;
  if (/(assistant manager|\bagm\b)/.test(title)) return 80;
  if (/manager/.test(title)) return 70;
  if (/(supervisor|lead)/.test(title)) return 60;
  if (/(customer service representative|\bcsr\b)/.test(title)) return 40;
  if (/(pet care technician|\bpct\b|technician)/.test(title)) return 30;
  return 0;
}

function getSortName(row = {}) {
  const name = safeText(row.name, "Employee");
  const parts = name.split(" ");
  const last = parts.length > 1 ? parts[parts.length - 1] : name;
  return `${last} ${name}`.toLowerCase();
}

function buildRosterGroups(rows = []) {
  const groupMap = new Map();
  rows.forEach((row) => {
    const position = safeText(row.position, "Team Member");
    if (!groupMap.has(position)) {
      groupMap.set(position, { label: position, rows: [], weight: getPositionWeight(position) });
    }
    groupMap.get(position).rows.push(row);
  });
  return Array.from(groupMap.values())
    .map((group) => ({
      ...group,
      rows: group.rows.slice().sort((a, b) => getSortName(a).localeCompare(getSortName(b), undefined, { sensitivity: "base", numeric: true })),
    }))
    .sort((a, b) => {
      if (a.weight !== b.weight) return b.weight - a.weight;
      return a.label.localeCompare(b.label, undefined, { sensitivity: "base", numeric: true });
    });
}

function splitLargeGroups(groups, options) {
  const detailMode = options.showCommitment || options.showPhone || options.showEmail;
  const maxRowsPerGroup = detailMode ? 6 : 8;
  return groups.flatMap((group) => {
    if (group.rows.length <= maxRowsPerGroup) return [group];
    const chunkSize = detailMode ? maxRowsPerGroup : Math.ceil(group.rows.length / 2);
    const chunks = [];
    for (let index = 0; index < group.rows.length; index += chunkSize) {
      chunks.push({
        ...group,
        rows: group.rows.slice(index, index + chunkSize),
      });
    }
    return chunks;
  });
}

function getDetailLines(row, options) {
  const lines = [];
  const topLine = [];
  if (options.showCommitment) topLine.push(safeText(row.commitment, "Commitment not listed"));
  if (options.showPhone) topLine.push(safeText(row.phone, "Phone not listed"));
  if (topLine.length) {
    lines.push(topLine.join("  |  "));
  }
  if (options.showEmail) {
    lines.push(safeText(row.email, "Email not listed"));
  }
  return lines.slice(0, 2);
}

function measureRosterRowHeight(row, options) {
  const detailMode = options.showCommitment || options.showPhone || options.showEmail;
  if (!detailMode) return 16;
  const lineCount = Math.max(1, getDetailLines(row, options).length);
  return Math.max(20.4, 14.6 + lineCount * 5.7);
}

function measureGroupHeight(group, options, fonts, width) {
  const detailMode = options.showCommitment || options.showPhone || options.showEmail;
  if (!detailMode) return 31 + group.rows.length * 16 + 6;
  const rowHeight = group.rows.reduce((total, row) => total + measureRosterRowHeight(row, options), 0);
  return 31 + rowHeight + 8;
}

function drawLogo(page, logoImage, x, y, width) {
  if (!logoImage) return 0;
  const height = width * (logoImage.height / logoImage.width);
  page.drawImage(logoImage, { x, y, width, height });
  return height;
}

function drawMasthead(page, payload, fonts, logoImage, options, pageNumber = 1) {
  const pageInnerWidth = PAGE_WIDTH - MARGIN_X * 2;
  drawRule(page, MARGIN_X, PAGE_HEIGHT - 38, pageInnerWidth, 2.1, BRAND.gold);

  if (pageNumber > 1) {
    drawLogo(page, logoImage, MARGIN_X, PAGE_HEIGHT - 70, 118);
    drawText(page, formatPosterTitle(payload.title), MARGIN_X + 142, PAGE_HEIGHT - 62, {
      font: fonts.headline,
      size: 17,
      color: color(BRAND.blue),
      maxWidth: 360,
    });
    drawText(page, formatUpdatedLabel(payload.printDate), MARGIN_X + pageInnerWidth - 180, PAGE_HEIGHT - 58, {
      font: fonts.body,
      size: 7.2,
      color: color(BRAND.bronze),
      maxWidth: 180,
      align: "right",
    });
    drawRule(page, MARGIN_X, PAGE_HEIGHT - 82, pageInnerWidth, 0.75, BRAND.line);
    return PAGE_HEIGHT - 104;
  }

  drawLogo(page, logoImage, MARGIN_X, PAGE_HEIGHT - 101, 168);
  drawText(page, formatUpdatedLabel(payload.printDate), MARGIN_X + pageInnerWidth - 180, PAGE_HEIGHT - 67, {
    font: fonts.body,
    size: 7.4,
    color: color(BRAND.bronze),
    maxWidth: 180,
    align: "right",
  });
  drawText(page, formatPosterTitle(payload.title), MARGIN_X, PAGE_HEIGHT - 151, {
    font: fonts.headline,
    size: 31,
    color: color(BRAND.black),
    maxWidth: 460,
  });
  drawText(page, "Active team members grouped by role", MARGIN_X + 2, PAGE_HEIGHT - 170, {
    font: fonts.bodyLight,
    size: 9.4,
    color: color(BRAND.bronze),
    maxWidth: 320,
  });
  page.drawRectangle({
    x: MARGIN_X + pageInnerWidth - 154,
    y: PAGE_HEIGHT - 159,
    width: 154,
    height: 1.4,
    color: color(BRAND.gold),
  });

  let nextY = PAGE_HEIGHT - 203;
  if (options.showMetrics) {
    nextY = drawMetricsStrip(page, payload, fonts, nextY);
  }
  if (options.showStaffingMatrix) {
    nextY = drawMatrix(page, payload, fonts, nextY);
  }
  return nextY - 4;
}

function drawMetricsStrip(page, payload, fonts, startY) {
  const stats = [
    { label: "Total Active", value: payload.totalEmployees ?? 0 },
    ...(payload.stats || []),
  ].filter((item) => safeText(item.label));
  const width = PAGE_WIDTH - MARGIN_X * 2;
  const labelY = startY - 14;
  drawRule(page, MARGIN_X, startY, width, 0.8, BRAND.line);
  let x = MARGIN_X;
  stats.slice(0, 7).forEach((item, index) => {
    const chipWidth = index === 0 ? 118 : 88;
    drawText(page, safeText(item.label).toUpperCase(), x, labelY + 8.5, {
      font: fonts.bodyBold,
      size: 5.4,
      color: color(BRAND.gold),
      maxWidth: chipWidth,
    });
    drawText(page, String(item.value ?? 0), x, labelY - 1.5, {
      font: fonts.bodyBold,
      size: 10.5,
      color: color(BRAND.bronze),
      maxWidth: chipWidth,
    });
    x += chipWidth;
    if (index < stats.length - 1) {
      page.drawRectangle({ x: x - 15, y: labelY + 1, width: 0.7, height: 17, color: color(BRAND.line) });
    }
  });
  return startY - 35;
}

function drawMatrix(page, payload, fonts, startY) {
  const matrix = Array.isArray(payload.matrix) ? payload.matrix : [];
  if (!matrix.length) return startY;
  const includeUnassigned = Boolean(payload.showUnassigned);
  const headers = ["Role", "FT", "PT", ...(includeUnassigned ? ["Open"] : []), "Total"];
  const x = MARGIN_X;
  const width = PAGE_WIDTH - MARGIN_X * 2;
  const rowHeight = 11.5;
  const columnWidths = includeUnassigned
    ? [width - 210, 52, 52, 52, 54]
    : [width - 158, 52, 52, 54];
  let y = startY - 10;
  drawText(page, "Role Balance", x, y, {
    font: fonts.bodyBold,
    size: 8.5,
    color: color(BRAND.blue),
    maxWidth: 150,
  });
  y -= 15;
  let xCursor = x;
  headers.forEach((header, index) => {
    drawBox(page, xCursor, y, columnWidths[index], rowHeight, {
      fill: BRAND.ivory,
      border: BRAND.line,
      borderWidth: 0.35,
    });
    drawTextInBox(page, header.toUpperCase(), xCursor + 5, y, rowHeight, {
      font: fonts.bodyBold,
      size: 5.2,
      color: color(BRAND.bronze),
      maxWidth: columnWidths[index] - 10,
      align: index === 0 ? "left" : "center",
    });
    xCursor += columnWidths[index];
  });
  y -= rowHeight;
  matrix.forEach((row) => {
    const values = [
      row.label,
      Number(row.fullTime || 0),
      Number(row.partTime || 0),
      ...(includeUnassigned ? [Number(row.unassigned || 0)] : []),
      Number(row.total || 0),
    ];
    xCursor = x;
    values.forEach((value, index) => {
      drawBox(page, xCursor, y, columnWidths[index], rowHeight, {
        fill: BRAND.white,
        border: BRAND.line,
        borderWidth: 0.35,
      });
      drawTextInBox(page, String(value), xCursor + 5, y, rowHeight, {
        font: index === values.length - 1 ? fonts.bodyBold : fonts.body,
        size: 5.7,
        color: color(index === values.length - 1 ? BRAND.blue : BRAND.bronze),
        maxWidth: columnWidths[index] - 10,
        align: index === 0 ? "left" : "center",
      });
      xCursor += columnWidths[index];
    });
    y -= rowHeight;
  });
  return y - 12;
}

function drawGroup(page, group, x, topY, width, fonts, options) {
  const detailMode = options.showCommitment || options.showPhone || options.showEmail;
  const groupHeight = measureGroupHeight(group, options, fonts, width);
  const bottomY = topY - groupHeight;

  drawBox(page, x, bottomY, width, groupHeight, {
    fill: BRAND.white,
    border: BRAND.line,
    borderWidth: 0.55,
  });
  page.drawRectangle({ x, y: bottomY, width: 3, height: groupHeight, color: color(BRAND.gold) });
  drawBox(page, x + 3, topY - 25, width - 3, 25, {
    fill: BRAND.ivory,
    border: BRAND.ivory,
    borderWidth: 0.2,
  });
  drawTextInBox(page, group.label, x + 13, topY - 25, 25, {
    font: fonts.bodyBold,
    size: 8.6,
    color: color(BRAND.blue),
    maxWidth: width - 62,
  });
  drawTextInBox(page, `${group.rows.length}`, x + width - 37, topY - 25, 25, {
    font: fonts.bodyBold,
    size: 8.8,
    color: color(BRAND.gold),
    maxWidth: 22,
    align: "right",
  });

  let y = detailMode ? topY - 25 : topY - 39;
  group.rows.forEach((row, index) => {
    const rowHeight = measureRosterRowHeight(row, options);
    if (detailMode) y -= rowHeight;
    if (index > 0) drawRule(page, x + 13, y + rowHeight - 0.85, width - 26, 0.38, "#ECE2D2");
    const nameY = detailMode
      ? y + rowHeight - 10.5
      : baselineForBox(fonts.bodyBold, 7.9, y, rowHeight);
    drawText(page, safeText(row.name, "Employee"), x + 13, nameY, {
      font: fonts.bodyBold,
      size: detailMode ? 7.3 : 7.9,
      color: color(BRAND.black),
      maxWidth: width - 26,
    });
    if (detailMode) {
      const lines = getDetailLines(row, options);
      lines.forEach((line, lineIndex) => {
        drawText(page, line, x + 13, y + rowHeight - 15.8 - lineIndex * 5.7, {
          font: fonts.bodyLight,
          size: 4.8,
          color: color(BRAND.bronze),
          maxWidth: width - 26,
        });
      });
    }
    if (!detailMode) y -= rowHeight;
  });

  return bottomY;
}

function addPage(pdfDoc) {
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  page.drawRectangle({ x: 0, y: 0, width: PAGE_WIDTH, height: PAGE_HEIGHT, color: color(BRAND.paper) });
  return page;
}

function drawFooter(page, fonts, pageNumber, pageCount) {
  const width = PAGE_WIDTH - MARGIN_X * 2;
  drawRule(page, MARGIN_X, FOOTER_Y + 10, width, 0.65, BRAND.line);
  drawText(page, "K9 Resorts Luxury Pet Hotel", MARGIN_X, FOOTER_Y - 3, {
    font: fonts.body,
    size: 6.3,
    color: color(BRAND.bronze),
    maxWidth: 180,
  });
  drawText(page, `Page ${pageNumber} of ${pageCount}`, MARGIN_X + width - 88, FOOTER_Y - 3, {
    font: fonts.body,
    size: 6.3,
    color: color(BRAND.bronze),
    maxWidth: 88,
    align: "right",
  });
}

async function embedLogo(pdfDoc, assets = {}) {
  const logoBytes = toBytes(assets.logoPngBytes);
  if (!logoBytes) return null;
  try {
    return await pdfDoc.embedPng(logoBytes);
  } catch {
    return null;
  }
}

function drawRosterGroups(pdfDoc, firstPage, payload, fonts, logoImage, options, groups) {
  const detailMode = options.showCommitment || options.showPhone || options.showEmail;
  const columnCount = 3;
  const gap = detailMode ? 18 : 16;
  const columnWidth = (PAGE_WIDTH - MARGIN_X * 2 - gap * (columnCount - 1)) / columnCount;
  const pages = [firstPage];
  let page = firstPage;
  let contentTop = drawMasthead(page, payload, fonts, logoImage, options, 1);
  let columns = Array.from({ length: columnCount }, () => contentTop);

  if (!groups.length) {
    drawText(page, "No active employees found.", MARGIN_X, contentTop - 18, {
      font: fonts.bodyBold,
      size: 10,
      color: color(BRAND.bronze),
      maxWidth: PAGE_WIDTH - MARGIN_X * 2,
    });
    return pages;
  }

  groups.forEach((group) => {
    const groupHeight = measureGroupHeight(group, options, fonts, columnWidth);
    let fittingColumns = columns
      .map((y, index) => ({ y, index }))
      .filter((column) => column.y - groupHeight >= CONTENT_BOTTOM)
      .sort((left, right) => right.y - left.y);
    let columnIndex = fittingColumns[0]?.index ?? -1;
    if (columnIndex < 0) {
      page = addPage(pdfDoc);
      pages.push(page);
      contentTop = drawMasthead(page, payload, fonts, logoImage, options, pages.length);
      columns = Array.from({ length: columnCount }, () => contentTop);
      fittingColumns = columns
        .map((y, index) => ({ y, index }))
        .filter((column) => column.y - groupHeight >= CONTENT_BOTTOM)
        .sort((left, right) => right.y - left.y);
      columnIndex = fittingColumns[0]?.index ?? 0;
    }
    const x = MARGIN_X + columnIndex * (columnWidth + gap);
    const topY = columns[columnIndex];
    columns[columnIndex] = drawGroup(page, group, x, topY, columnWidth, fonts, options) - 10;
  });
  return pages;
}

export async function buildLaborRosterPdfBytes(payload = {}) {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(payload.filename || payload.title || "K9 Resorts Team Roster");
  pdfDoc.setSubject("K9 Resorts team roster");
  pdfDoc.setCreator("K9 Resorts");
  pdfDoc.setProducer("K9 Resorts");

  const assets = payload.assets || {};
  const options = normalizeLaborRosterPdfOptions(payload.options || {});
  const [fonts, logoImage] = await Promise.all([
    embedBrandFonts(pdfDoc, assets),
    embedLogo(pdfDoc, assets),
  ]);

  const page = addPage(pdfDoc);
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const groups = splitLargeGroups(buildRosterGroups(rows), options);
  const pages = drawRosterGroups(pdfDoc, page, payload, fonts, logoImage, options, groups);

  pages.forEach((pdfPage, index) => {
    drawFooter(pdfPage, fonts, index + 1, pages.length);
  });

  return pdfDoc.save();
}
