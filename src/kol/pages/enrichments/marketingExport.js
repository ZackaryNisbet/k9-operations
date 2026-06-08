import {
  DEFAULT_ENRICHMENT_NOTES,
  ENRICHMENT_AUDIENCES,
  ENRICHMENT_FOCUS_LABELS,
  formatEventDate,
  getMonthLabel,
} from "../../enrichments/enrichmentData";

export function buildMarketingBrief({ monthDate, events, audience }) {
  const lines = [
    `K9 Resorts Enrichment Marketing Brief - ${getMonthLabel(monthDate)}`,
    `Audience: ${ENRICHMENT_AUDIENCES.find((item) => item.id === audience)?.label || audience}`,
    "",
    "Notes:",
    ...DEFAULT_ENRICHMENT_NOTES.map((note) => `- ${note}`),
    "",
    "Events:",
  ];
  events.forEach((event) => {
    lines.push(`- ${formatEventDate(event.event_date)} | ${event.title}`);
    if (event.summary) lines.push(`  Summary: ${event.summary}`);
    if (event.calendar_note) lines.push(`  Calendar note: ${event.calendar_note}`);
    if (event.products?.length) {
      lines.push(`  Products: ${event.products.map((product) => product.name).join(", ")}`);
    }
  });
  return lines.join("\n");
}

export function buildMarketingCsv(events = []) {
  const header = ["Date", "Title", "Category", "Customer Visible", "Focus", "Summary", "Products"];
  const rows = events.map((event) => [
    event.event_date,
    event.title,
    event.category,
    event.customer_visible ? "Yes" : "No",
    ENRICHMENT_FOCUS_LABELS[event.focus_area] || event.focus_area,
    event.summary || event.sop_details || "",
    (event.products || []).map((product) => product.url ? `${product.name} (${product.url})` : product.name).join("; "),
  ]);
  return [header, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\n");
}

export function escapeCsvCell(value) {
  const text = String(value ?? "");
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

export function downloadTextFile({ content, type, filename }) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
