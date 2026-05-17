import JSZip from "jszip";

const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const CONTENT_TYPES_XML = `${XML_DECLARATION}
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;
const ROOT_RELS_XML = `${XML_DECLARATION}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
const WORKBOOK_XML = `${XML_DECLARATION}
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Demand Matrix" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;
const WORKBOOK_RELS_XML = `${XML_DECLARATION}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`;

const STYLES_XML = `${XML_DECLARATION}
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="5">
    <font><sz val="11"/><color rgb="FF1F2937"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><color rgb="FF1F2937"/><name val="Calibri"/></font>
    <font><b/><sz val="12"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><color rgb="FF0F172A"/><name val="Calibri"/></font>
  </fonts>
  <fills count="6">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFEFF6FF"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF0F3D20"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF8FAFC"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE2E8F0"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"><color rgb="FFE2E8F0"/></left><right style="thin"><color rgb="FFE2E8F0"/></right><top style="thin"><color rgb="FFE2E8F0"/></top><bottom style="thin"><color rgb="FFE2E8F0"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="7">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1"/>
    <xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1"/>
    <xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center"/></xf>
    <xf numFmtId="0" fontId="4" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1"/>
    <xf numFmtId="0" fontId="1" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1"/>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function columnName(index) {
  let value = index + 1;
  let name = "";
  while (value > 0) {
    const mod = (value - 1) % 26;
    name = String.fromCharCode(65 + mod) + name;
    value = Math.floor((value - mod) / 26);
  }
  return name;
}

function buildSharedStrings(strings) {
  const unique = [];
  const indexByValue = new Map();
  for (const value of strings) {
    const text = String(value ?? "");
    if (!indexByValue.has(text)) {
      indexByValue.set(text, unique.length);
      unique.push(text);
    }
  }
  const xml = `${XML_DECLARATION}
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${unique.length}">
${unique.map((value) => `  <si><t>${escapeXml(value)}</t></si>`).join("\n")}
</sst>`;
  return { xml, indexByValue };
}

function addStringCell(cells, rowIndex, columnIndex, value, style = 0, sharedStrings) {
  sharedStrings.push(value);
  cells.push({
    ref: `${columnName(columnIndex)}${rowIndex}`,
    type: "s",
    style,
    value,
  });
}

function addNumberCell(cells, rowIndex, columnIndex, value, style = 0) {
  cells.push({
    ref: `${columnName(columnIndex)}${rowIndex}`,
    type: "n",
    style,
    value: Number(value),
  });
}

function addBlankCell(cells, rowIndex, columnIndex, style = 0) {
  cells.push({
    ref: `${columnName(columnIndex)}${rowIndex}`,
    type: "blank",
    style,
  });
}

function buildRows(model) {
  const rows = [];
  const sharedStrings = [];
  const merges = [];
  const totalColumns = 1 + model.days.length;
  const lastColumn = columnName(totalColumns - 1);

  function pushRow(rowIndex, cells, height) {
    rows.push({ rowIndex, cells, height });
  }

  let rowIndex = 1;
  [
    ["Location", model.locationName],
    ["Location ID", model.locationId],
    ["Date Range", `${model.startDate} to ${model.endDate}`],
    ["Generated At", model.generatedAt],
    ["Mode", model.modeLabel],
    ["Readiness", model.readiness?.status || "unknown"],
    ["Readiness Detail", model.readiness?.reason || ""],
  ].forEach(([label, value]) => {
    const cells = [];
    addStringCell(cells, rowIndex, 0, label, 1, sharedStrings);
    addStringCell(cells, rowIndex, 1, value, 0, sharedStrings);
    merges.push(`B${rowIndex}:${lastColumn}${rowIndex}`);
    pushRow(rowIndex, cells);
    rowIndex += 1;
  });

  rowIndex += 1;
  const headerRow = rowIndex;
  const headerCells = [];
  addStringCell(headerCells, rowIndex, 0, "Operational Metric", 3, sharedStrings);
  model.days.forEach((day, index) => {
    addStringCell(headerCells, rowIndex, index + 1, `${day.dayName} ${day.date}`, 3, sharedStrings);
  });
  pushRow(rowIndex, headerCells);
  rowIndex += 1;

  model.rows.forEach((row) => {
    const cells = [];
    if (row.type === "section") {
      addStringCell(cells, rowIndex, 0, row.label, 2, sharedStrings);
      for (let index = 1; index < totalColumns; index += 1) {
        addBlankCell(cells, rowIndex, index, 2);
      }
      merges.push(`A${rowIndex}:${lastColumn}${rowIndex}`);
    } else {
      addStringCell(cells, rowIndex, 0, row.label, row.total ? 5 : 4, sharedStrings);
      row.cells.forEach((cell, index) => {
        if (!cell.missingValue && Number.isFinite(Number(cell.value))) {
          addNumberCell(cells, rowIndex, index + 1, cell.value, row.total ? 5 : 6);
        } else {
          addStringCell(cells, rowIndex, index + 1, cell.displayValue, row.total ? 5 : 6, sharedStrings);
        }
      });
    }
    pushRow(rowIndex, cells);
    rowIndex += 1;
  });

  return { rows, sharedStrings, merges, headerRow, maxRow: rowIndex - 1, maxColumn: totalColumns - 1 };
}

function cellXml(cell, sharedStringIndexByValue) {
  const style = cell.style ? ` s="${cell.style}"` : "";
  if (cell.type === "blank") {
    return `<c r="${cell.ref}"${style}/>`;
  }
  if (cell.type === "n") {
    return `<c r="${cell.ref}"${style}><v>${cell.value}</v></c>`;
  }
  const sharedIndex = sharedStringIndexByValue.get(String(cell.value ?? ""));
  return `<c r="${cell.ref}" t="s"${style}><v>${sharedIndex}</v></c>`;
}

function buildWorksheetXml(model) {
  const { rows, sharedStrings, merges, headerRow, maxRow, maxColumn } = buildRows(model);
  const { xml: sharedStringsXml, indexByValue } = buildSharedStrings(sharedStrings);
  const dimensions = `A1:${columnName(maxColumn)}${maxRow}`;
  const columnDefs = [
    '<col min="1" max="1" width="34" customWidth="1"/>',
    `<col min="2" max="${maxColumn + 1}" width="14" customWidth="1"/>`,
  ].join("");
  const sheetXml = `${XML_DECLARATION}
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <dimension ref="${dimensions}"/>
  <sheetViews>
    <sheetView workbookViewId="0">
      <pane xSplit="1" ySplit="${headerRow}" topLeftCell="B${headerRow + 1}" activePane="bottomRight" state="frozen"/>
      <selection pane="bottomRight" activeCell="B${headerRow + 1}" sqref="B${headerRow + 1}"/>
    </sheetView>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  <cols>${columnDefs}</cols>
  <sheetData>
${rows.map((row) => `    <row r="${row.rowIndex}"${row.height ? ` ht="${row.height}" customHeight="1"` : ""}>${row.cells.map((cell) => cellXml(cell, indexByValue)).join("")}</row>`).join("\n")}
  </sheetData>
  ${merges.length ? `<mergeCells count="${merges.length}">${merges.map((ref) => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells>` : ""}
</worksheet>`;
  return { sheetXml, sharedStringsXml };
}

function buildCoreXml(model) {
  const generated = escapeXml(model.generatedAt || new Date().toISOString());
  return `${XML_DECLARATION}
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>K9 Operations Scheduling Demand Matrix</dc:title>
  <dc:creator>K9 Operations</dc:creator>
  <cp:lastModifiedBy>K9 Operations</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${generated}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${generated}</dcterms:modified>
</cp:coreProperties>`;
}

const APP_XML = `${XML_DECLARATION}
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>K9 Operations</Application>
</Properties>`;

export async function createDemandMatrixXlsxBlob(model) {
  const { sheetXml, sharedStringsXml } = buildWorksheetXml(model);
  const zip = new JSZip();
  zip.file("[Content_Types].xml", CONTENT_TYPES_XML);
  zip.folder("_rels").file(".rels", ROOT_RELS_XML);
  zip.folder("docProps").file("core.xml", buildCoreXml(model));
  zip.folder("docProps").file("app.xml", APP_XML);
  const xl = zip.folder("xl");
  xl.file("workbook.xml", WORKBOOK_XML);
  xl.file("styles.xml", STYLES_XML);
  xl.file("sharedStrings.xml", sharedStringsXml);
  xl.folder("_rels").file("workbook.xml.rels", WORKBOOK_RELS_XML);
  xl.folder("worksheets").file("sheet1.xml", sheetXml);
  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function buildDemandMatrixExportFilename(model) {
  const location = String(model.locationName || model.locationId || "location")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "location";
  return `scheduling-demand-matrix-${location}-${model.startDate}-to-${model.endDate}.xlsx`;
}
