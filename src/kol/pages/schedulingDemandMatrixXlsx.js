import JSZip from "jszip";

const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const K9_WORKBOOK_AUTHOR = "K9 Operations LLC";
const K9_WORKBOOK_TAGLINE = "The operating system for pet care facilities";
const K9_WORKBOOK_LOGO_PATH = "/k9-email-logo-green.png";

function buildContentTypesXml(includeLogo = false) {
  return `${XML_DECLARATION}
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  ${includeLogo ? '<Default Extension="png" ContentType="image/png"/>' : ""}
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
  ${includeLogo ? '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>' : ""}
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;
}
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
const SHEET_RELS_XML = `${XML_DECLARATION}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>
</Relationships>`;
const DRAWING_XML = `${XML_DECLARATION}
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <xdr:oneCellAnchor>
    <xdr:from>
      <xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff>
      <xdr:row>0</xdr:row><xdr:rowOff>0</xdr:rowOff>
    </xdr:from>
    <xdr:ext cx="685800" cy="685800"/>
    <xdr:pic>
      <xdr:nvPicPr>
        <xdr:cNvPr id="1" name="K9 Operations logo"/>
        <xdr:cNvPicPr/>
      </xdr:nvPicPr>
      <xdr:blipFill>
        <a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="rId1"/>
        <a:stretch><a:fillRect/></a:stretch>
      </xdr:blipFill>
      <xdr:spPr>
        <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
      </xdr:spPr>
    </xdr:pic>
    <xdr:clientData/>
  </xdr:oneCellAnchor>
</xdr:wsDr>`;
const DRAWING_RELS_XML = `${XML_DECLARATION}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/k9-logo.png"/>
</Relationships>`;

const STYLES_XML = `${XML_DECLARATION}
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1">
    <numFmt numFmtId="164" formatCode="ddd mmm d yyyy"/>
  </numFmts>
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
  <cellXfs count="9">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center"/></xf>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center"/></xf>
    <xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center"/></xf>
    <xf numFmtId="0" fontId="4" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center"/></xf>
    <xf numFmtId="0" fontId="1" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center"/></xf>
    <xf numFmtId="164" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="center" wrapText="1"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="center"/></xf>
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

function excelDateSerial(dateStr) {
  const [year, month, day] = String(dateStr || "").split("-").map(Number);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  const utc = Date.UTC(year, month - 1, day);
  const excelEpoch = Date.UTC(1899, 11, 30);
  return Math.round((utc - excelEpoch) / 86400000);
}

function addDateCell(cells, rowIndex, columnIndex, dateStr, style = 7) {
  const serial = excelDateSerial(dateStr);
  if (serial === null) {
    addBlankCell(cells, rowIndex, columnIndex, style);
    return;
  }
  addNumberCell(cells, rowIndex, columnIndex, serial, style);
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
  const totalColumns = 1 + model.days.length + 1;
  const maxColumn = Math.max(totalColumns - 1, 3);
  const lastColumn = columnName(maxColumn);
  const brandLastColumn = columnName(Math.min(maxColumn, 5));

  function pushRow(rowIndex, cells, height) {
    rows.push({ rowIndex, cells, height });
  }

  let rowIndex = 1;

  const brandCells = [];
  addStringCell(brandCells, rowIndex, 1, "K9 Operations", 1, sharedStrings);
  merges.push(`B${rowIndex}:${brandLastColumn}${rowIndex}`);
  pushRow(rowIndex, brandCells, 34);
  rowIndex += 1;

  const taglineCells = [];
  addStringCell(taglineCells, rowIndex, 1, K9_WORKBOOK_TAGLINE, 0, sharedStrings);
  merges.push(`B${rowIndex}:${brandLastColumn}${rowIndex}`);
  pushRow(rowIndex, taglineCells, 20);
  rowIndex += 2;

  [
    { label: "Location", value: model.locationName, type: "string" },
    { label: "Start Date", value: model.startDate, type: "date" },
    { label: "End Date", value: model.endDate, type: "date" },
    { label: "Generated At", value: model.generatedAt, type: "string" },
  ].forEach(({ label, value, type }) => {
    const cells = [];
    addStringCell(cells, rowIndex, 0, label, 1, sharedStrings);
    if (type === "date") {
      addDateCell(cells, rowIndex, 1, value, 8);
    } else {
      addStringCell(cells, rowIndex, 1, value, 0, sharedStrings);
    }
    merges.push(`B${rowIndex}:${lastColumn}${rowIndex}`);
    pushRow(rowIndex, cells);
    rowIndex += 1;
  });

  rowIndex += 1;
  const headerRow = rowIndex;
  const headerCells = [];
  addStringCell(headerCells, rowIndex, 0, "Operational Metric", 3, sharedStrings);
  model.days.forEach((day, index) => {
    addDateCell(headerCells, rowIndex, index + 1, day.date, 7);
  });
  addStringCell(headerCells, rowIndex, model.days.length + 1, model.aggregateLabel || "Range Total", 3, sharedStrings);
  pushRow(rowIndex, headerCells);
  rowIndex += 1;

  model.rows.forEach((row) => {
    const cells = [];
    if (row.type === "section") {
      addStringCell(cells, rowIndex, 0, row.label, 2, sharedStrings);
      for (let index = 1; index <= maxColumn; index += 1) {
        addBlankCell(cells, rowIndex, index, 2);
      }
      merges.push(`A${rowIndex}:${lastColumn}${rowIndex}`);
    } else {
      addStringCell(cells, rowIndex, 0, row.label, row.total ? 5 : 4, sharedStrings);
      row.cells.forEach((cell, index) => {
        if (row.format !== "percent" && !cell.missingValue && Number.isFinite(Number(cell.value))) {
          addNumberCell(cells, rowIndex, index + 1, cell.value, row.total ? 5 : 6);
        } else {
          addStringCell(cells, rowIndex, index + 1, cell.displayValue, row.total ? 5 : 6, sharedStrings);
        }
      });
      if (row.aggregate) {
        const aggregateColumn = model.days.length + 1;
        if (row.format !== "percent" && !row.aggregate.missingValue && Number.isFinite(Number(row.aggregate.value))) {
          addNumberCell(cells, rowIndex, aggregateColumn, row.aggregate.value, row.total ? 5 : 6);
        } else {
          addStringCell(cells, rowIndex, aggregateColumn, row.aggregate.displayValue, row.total ? 5 : 6, sharedStrings);
        }
      }
    }
    pushRow(rowIndex, cells);
    rowIndex += 1;
  });

  return { rows, sharedStrings, merges, headerRow, maxRow: rowIndex - 1, maxColumn };
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

function buildWorksheetXml(model, includeLogo = false) {
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
  ${includeLogo ? '<drawing r:id="rId1"/>' : ""}
</worksheet>`;
  return { sheetXml, sharedStringsXml };
}

function buildCoreXml(model) {
  const generated = escapeXml(model.generatedAt || new Date().toISOString());
  return `${XML_DECLARATION}
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>K9 Operations Scheduling Demand Matrix</dc:title>
  <dc:creator>${K9_WORKBOOK_AUTHOR}</dc:creator>
  <cp:lastModifiedBy>${K9_WORKBOOK_AUTHOR}</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${generated}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${generated}</dcterms:modified>
</cp:coreProperties>`;
}

const APP_XML = `${XML_DECLARATION}
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>K9 Operations</Application>
</Properties>`;

async function loadWorkbookLogoBytes() {
  if (typeof fetch !== "function") return null;
  try {
    const response = await fetch(K9_WORKBOOK_LOGO_PATH);
    if (!response.ok) return null;
    return await response.arrayBuffer();
  } catch {
    return null;
  }
}

export async function createDemandMatrixXlsxBlob(model) {
  const logoBytes = await loadWorkbookLogoBytes();
  const includeLogo = Boolean(logoBytes);
  const { sheetXml, sharedStringsXml } = buildWorksheetXml(model, includeLogo);
  const zip = new JSZip();
  zip.file("[Content_Types].xml", buildContentTypesXml(includeLogo));
  zip.folder("_rels").file(".rels", ROOT_RELS_XML);
  zip.folder("docProps").file("core.xml", buildCoreXml(model));
  zip.folder("docProps").file("app.xml", APP_XML);
  const xl = zip.folder("xl");
  xl.file("workbook.xml", WORKBOOK_XML);
  xl.file("styles.xml", STYLES_XML);
  xl.file("sharedStrings.xml", sharedStringsXml);
  xl.folder("_rels").file("workbook.xml.rels", WORKBOOK_RELS_XML);
  xl.folder("worksheets").file("sheet1.xml", sheetXml);
  if (includeLogo) {
    xl.folder("worksheets").folder("_rels").file("sheet1.xml.rels", SHEET_RELS_XML);
    xl.folder("drawings").file("drawing1.xml", DRAWING_XML);
    xl.folder("drawings").folder("_rels").file("drawing1.xml.rels", DRAWING_RELS_XML);
    xl.folder("media").file("k9-logo.png", logoBytes);
  }
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
  const candidate = String(model.locationName || "").trim();
  const locationName = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidate)
    ? "location"
    : candidate || "location";
  const location = locationName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "location";
  return `scheduling-demand-matrix-${location}-${model.startDate}-to-${model.endDate}.xlsx`;
}
