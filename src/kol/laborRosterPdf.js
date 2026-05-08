import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const PAGE_WIDTH = 792;
const PAGE_HEIGHT = 612;
const MARGIN_X = 30;
const DARK_GREEN = "#0b3d2e";
const MID_GREEN = "#14532d";
const SAGE = "#edf5eb";
const PALE_SAGE = "#f7fbf5";
const BORDER = "#d8e4d4";
const TEXT = "#142219";
const MUTED = "#637569";
const WARNING = "#9a4d13";
const GOLD = "#6b5a1d";

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

function safeText(value, fallback = "") {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  return text || fallback;
}

function truncateToWidth(value, font, size, maxWidth) {
  const text = safeText(value);
  if (!text || font.widthOfTextAtSize(text, size) <= maxWidth) return text;
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
  const fill = options.color || color(TEXT);
  const maxWidth = options.maxWidth || null;
  const value = maxWidth && font ? truncateToWidth(text, font, size, maxWidth) : safeText(text);
  if (!value) return;
  const width = font ? font.widthOfTextAtSize(value, size) : 0;
  const offset = options.align === "center" && maxWidth ? Math.max(0, (maxWidth - width) / 2) : 0;
  const rightOffset = options.align === "right" && maxWidth ? Math.max(0, maxWidth - width) : 0;
  page.drawText(value, {
    x: x + offset + rightOffset,
    y,
    size,
    font,
    color: fill,
    maxWidth: maxWidth || undefined,
  });
}

function drawRule(page, x, y, width, height = 0.8, fill = BORDER) {
  page.drawRectangle({ x, y, width, height, color: color(fill) });
}

function drawBox(page, x, y, width, height, options = {}) {
  page.drawRectangle({
    x,
    y,
    width,
    height,
    color: color(options.fill || "#ffffff"),
    borderColor: color(options.border || BORDER),
    borderWidth: options.borderWidth ?? 0.8,
  });
}

function drawCard(page, x, y, width, height, label, value, fonts, options = {}) {
  drawBox(page, x, y, width, height, {
    fill: options.fill || "#ffffff",
    border: options.border || BORDER,
    borderWidth: 0.8,
  });
  drawRule(page, x, y, 3.2, height, options.accent || DARK_GREEN);
  drawText(page, label, x + 8, y + height - 7.6, {
    font: fonts.bold,
    size: 4.8,
    color: color(MUTED),
    maxWidth: width - 16,
  });
  drawText(page, String(value ?? 0), x + 8, y + 3.7, {
    font: fonts.bold,
    size: 10.5,
    color: color(TEXT),
    maxWidth: width - 16,
  });
}

function drawMasthead(page, payload, fonts) {
  const width = PAGE_WIDTH - MARGIN_X * 2;
  const x = MARGIN_X;
  const top = PAGE_HEIGHT - 30;
  drawBox(page, x, top - 108, width, 108, { fill: "#fbfdf9", border: BORDER });
  page.drawRectangle({ x, y: top - 17, width, height: 17, color: color(DARK_GREEN) });
  page.drawRectangle({ x: x + width * 0.72, y: top - 17, width: width * 0.28, height: 17, color: color(GOLD) });
  drawText(page, "K9 OPERATIONS", x + 12, top - 12, {
    font: fonts.bold,
    size: 5.3,
    color: color("#ffffff"),
    maxWidth: 160,
  });
  drawText(page, "EMPLOYEE DIRECTORY", x + width - 116, top - 12, {
    font: fonts.bold,
    size: 5.3,
    color: color("#ffffff"),
    maxWidth: 104,
    align: "right",
  });

  drawBox(page, x + 16, top - 56, 32, 32, { fill: DARK_GREEN, border: DARK_GREEN });
  drawText(page, "K9", x + 25, top - 38.5, {
    font: fonts.bold,
    size: 11,
    color: color("#ffffff"),
  });
  drawText(page, "LABOR MANAGEMENT", x + 60, top - 32, {
    font: fonts.bold,
    size: 5.5,
    color: color(MUTED),
    maxWidth: 180,
  });
  drawText(page, payload.title, x + 60, top - 48, {
    font: fonts.bold,
    size: 18,
    color: color(TEXT),
    maxWidth: 430,
  });
  drawText(page, "Team contact roster - active employees only", x + 60, top - 61, {
    font: fonts.regular,
    size: 7,
    color: color(MUTED),
    maxWidth: 300,
  });

  drawBox(page, x + width - 116, top - 48, 98, 23, { fill: "#ffffff", border: BORDER });
  drawText(page, "PRINTED", x + width - 106, top - 34, {
    font: fonts.bold,
    size: 5.3,
    color: color(MUTED),
    maxWidth: 78,
    align: "right",
  });
  drawText(page, payload.printDate, x + width - 106, top - 44, {
    font: fonts.bold,
    size: 9,
    color: color(DARK_GREEN),
    maxWidth: 78,
    align: "right",
  });
  drawBox(page, x + width - 116, top - 76, 98, 23, { fill: "#ffffff", border: BORDER });
  drawText(page, "TOTAL ACTIVE", x + width - 106, top - 62, {
    font: fonts.bold,
    size: 5.3,
    color: color(MUTED),
    maxWidth: 78,
    align: "right",
  });
  drawText(page, String(payload.totalEmployees ?? 0), x + width - 106, top - 72, {
    font: fonts.bold,
    size: 10,
    color: color(DARK_GREEN),
    maxWidth: 78,
    align: "right",
  });

  const stats = payload.stats || [];
  const gap = 8;
  const statWidth = (width - 32 - gap * 5) / 6;
  const statY = top - 104;
  stats.slice(0, 6).forEach((stat, index) => {
    drawCard(page, x + 16 + index * (statWidth + gap), statY, statWidth, 20, stat.label, stat.value, fonts);
  });
  return top - 118;
}

function drawMatrix(page, payload, fonts, startY) {
  const width = PAGE_WIDTH - MARGIN_X * 2;
  const x = MARGIN_X;
  let y = startY;
  drawText(page, "STAFFING MATRIX", x, y, {
    font: fonts.bold,
    size: 7.8,
    color: color(TEXT),
  });
  y -= 14;
  const includeUnassigned = Boolean(payload.showUnassigned);
  const headers = ["Position Group", "Full-Time", "Part-Time", ...(includeUnassigned ? ["Unassigned"] : []), "Total"];
  const numericWidth = includeUnassigned ? 108 : 144;
  const firstWidth = width - numericWidth * (headers.length - 1);
  const rowHeight = 14.2;
  let xCursor = x;
  headers.forEach((header, index) => {
    const cellWidth = index === 0 ? firstWidth : numericWidth;
    drawBox(page, xCursor, y, cellWidth, rowHeight, { fill: SAGE, border: BORDER });
    drawText(page, header.toUpperCase(), xCursor + 7, y + 5.8, {
      font: fonts.bold,
      size: 5.1,
      color: color(MUTED),
      maxWidth: cellWidth - 14,
      align: index === 0 ? "left" : "center",
    });
    xCursor += cellWidth;
  });
  y -= rowHeight;
  (payload.matrix || []).forEach((row) => {
    const values = [
      row.label,
      Number(row.fullTime || 0),
      Number(row.partTime || 0),
      ...(includeUnassigned ? [Number(row.unassigned || 0)] : []),
      Number(row.total || 0),
    ];
    xCursor = x;
    values.forEach((value, index) => {
      const cellWidth = index === 0 ? firstWidth : numericWidth;
      drawBox(page, xCursor, y, cellWidth, rowHeight, {
        fill: index === values.length - 1 ? PALE_SAGE : "#ffffff",
        border: BORDER,
      });
      drawText(page, String(value), xCursor + 7, y + 5.7, {
        font: fonts.bold,
        size: 6.2,
        color: color(index === values.length - 1 ? DARK_GREEN : TEXT),
        maxWidth: cellWidth - 14,
        align: index === 0 ? "left" : "center",
      });
      xCursor += cellWidth;
    });
    y -= rowHeight;
  });
  if (includeUnassigned) {
    drawText(page, "Unassigned means the employee still needs a Full-Time or Part-Time classification in Labor Management.", x, y - 8, {
      font: fonts.bold,
      size: 5.8,
      color: color(WARNING),
      maxWidth: width,
    });
    y -= 17;
  }
  return y - 10;
}

function buildRosterColumns(options = {}) {
  const showCommitment = options.showCommitment !== false;
  const showPhone = options.showPhone !== false;
  const showEmail = options.showEmail !== false;
  const columns = [
    { key: "name", label: "Name", weight: 1.45, font: "bold" },
    { key: "position", label: "Position", weight: 1.45 },
    ...(showCommitment ? [{ key: "commitment", label: "Commitment", weight: 0.72, align: "center", font: "bold", color: MID_GREEN }] : []),
    ...(showPhone ? [{ key: "phone", label: "Phone", weight: 0.86 }] : []),
    ...(showEmail ? [{ key: "email", label: "Email", weight: 1.68, size: 5.6 }] : []),
  ];
  const totalWidth = PAGE_WIDTH - MARGIN_X * 2;
  const totalWeight = columns.reduce((sum, column) => sum + column.weight, 0);
  let used = 0;
  return columns.map((column, index) => {
    const width = index === columns.length - 1
      ? totalWidth - used
      : Math.floor((totalWidth * column.weight) / totalWeight);
    used += width;
    return { ...column, width };
  });
}

function drawRosterHeader(page, y, fonts, columns) {
  let x = MARGIN_X;
  columns.forEach((column) => {
    drawBox(page, x, y, column.width, 13, { fill: SAGE, border: SAGE, borderWidth: 0.2 });
    drawText(page, column.label.toUpperCase(), x + 7, y + 4.8, {
      font: fonts.bold,
      size: 5.5,
      color: color(MUTED),
      maxWidth: column.width - 14,
      align: column.align || "left",
    });
    x += column.width;
  });
  return { columns, nextY: y - 15.2 };
}

function drawRosterRow(page, row, y, index, fonts, columns, rowHeight, rowGap) {
  const fill = index % 2 === 0 ? "#ffffff" : PALE_SAGE;
  let x = MARGIN_X;
  columns.forEach((column) => {
    const value = safeText(row[column.key], column.key === "name" ? "Employee" : "Not listed");
    drawBox(page, x, y, column.width, rowHeight, { fill, border: BORDER, borderWidth: 0.5 });
    drawText(page, value, x + 7, y + 5.1, {
      font: column.font === "bold" ? fonts.bold : fonts.regular,
      size: column.size || 6,
      color: color(column.color || TEXT),
      maxWidth: column.width - 14,
      align: column.align || "left",
    });
    x += column.width;
  });
  return y - rowHeight - rowGap;
}

function addRosterPage(pdfDoc, fonts, pageNumber, payload = {}) {
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  if (pageNumber > 1) {
    drawText(page, payload.title || "Team Roster", MARGIN_X, PAGE_HEIGHT - 25, {
      font: fonts.bold,
      size: 8,
      color: color(MUTED),
      maxWidth: 360,
    });
    drawRule(page, MARGIN_X, PAGE_HEIGHT - 34, PAGE_WIDTH - MARGIN_X * 2, 0.8, BORDER);
  }
  return page;
}

function drawFooter(page, fonts, pageNumber, pageCount) {
  const width = PAGE_WIDTH - MARGIN_X * 2;
  drawRule(page, MARGIN_X, 24, width, 0.6, BORDER);
  drawText(page, "K9 Operations Labor Management", MARGIN_X, 13, {
    font: fonts.bold,
    size: 5.8,
    color: color(MUTED),
    maxWidth: 240,
  });
  drawText(page, `Page ${pageNumber} of ${pageCount}`, MARGIN_X + width - 80, 13, {
    font: fonts.bold,
    size: 5.8,
    color: color(MUTED),
    maxWidth: 80,
    align: "right",
  });
}

export async function buildLaborRosterPdfBytes(payload = {}) {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(payload.filename || payload.title || "Team Roster");
  pdfDoc.setSubject("Team roster");
  pdfDoc.setCreator("K9 Operations");
  pdfDoc.setProducer("K9 Operations");
  const fonts = {
    regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
    bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
  };

  let page = addRosterPage(pdfDoc, fonts, 1, payload);
  let cursorY = drawMasthead(page, payload, fonts);
  if (payload.options?.showStaffingMatrix !== false) {
    cursorY = drawMatrix(page, payload, fonts, cursorY);
  }
  drawText(page, "TEAM ROSTER", MARGIN_X, cursorY, {
    font: fonts.bold,
    size: 8.5,
    color: color(TEXT),
  });
  cursorY -= 16;
  const columns = buildRosterColumns(payload.options || {});
  let header = drawRosterHeader(page, cursorY, fonts, columns);
  cursorY = header.nextY;
  const bottomY = 30;
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const availableHeight = Math.max(80, cursorY - bottomY - 2);
  const candidateRowStride = rows.length > 0 ? availableHeight / rows.length : 14.5;
  const rowGap = rows.length > 24 ? 1.2 : 1.8;
  const rowHeight = Math.max(10.8, Math.min(13.2, candidateRowStride - rowGap));
  if (!rows.length) {
    drawText(page, "No active employees found.", MARGIN_X, cursorY - 4, {
      font: fonts.bold,
      size: 8,
      color: color(MUTED),
      maxWidth: PAGE_WIDTH - MARGIN_X * 2,
    });
  }
  rows.forEach((row, index) => {
    if (cursorY < bottomY + rowHeight + 2) {
      page = addRosterPage(pdfDoc, fonts, pdfDoc.getPageCount() + 1, payload);
      header = drawRosterHeader(page, PAGE_HEIGHT - 54, fonts, columns);
      cursorY = header.nextY;
    }
    cursorY = drawRosterRow(page, row, cursorY, index, fonts, header.columns, rowHeight, rowGap);
  });

  pdfDoc.getPages().forEach((pdfPage, index) => {
    drawFooter(pdfPage, fonts, index + 1, pdfDoc.getPageCount());
  });

  return pdfDoc.save();
}
