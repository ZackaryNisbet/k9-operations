import { todayStr } from "../../../shared/theme";
import {
  buildBlankEnrichmentEvent,
  normalizeDate,
  parseLines,
  parseProducts,
  serializeLines,
  serializeProducts,
} from "../../enrichments/enrichmentData";

export function createDraft(event, locationId) {
  const source = event || buildBlankEnrichmentEvent({ date: todayStr(), locationId });
  return {
    id: source.id || null,
    legacy_source_id: source.legacy_source_id || null,
    event_date: normalizeDate(source.event_date),
    title: source.title || "",
    subtitle: source.subtitle || "",
    category: source.category || "Weekly Theme",
    focus_area: source.focus_area || "brainwork",
    visual_theme: source.visual_theme || "neutral",
    customer_visible: !!source.customer_visible,
    price: String(Math.round(Number(source.price_cents || 0) / 100)),
    status: source.status || "planned",
    summary: source.summary || "",
    sop_details: source.sop_details || "",
    staff_notes: source.staff_notes || "",
    setup_locations: serializeLines(source.setup_locations || []),
    products: serializeProducts(source.products || []),
    checklist: serializeLines(source.checklist || []),
    calendar_note: source.calendar_note || "",
    source_label: source.source_label || "K9 Operations",
  };
}

export function draftToEvent(draft, locationId) {
  return {
    id: draft.id,
    legacy_source_id: draft.legacy_source_id,
    location_id: locationId,
    event_date: normalizeDate(draft.event_date),
    title: draft.title,
    subtitle: draft.subtitle,
    category: draft.category,
    focus_area: draft.focus_area,
    visual_theme: draft.visual_theme,
    customer_visible: draft.customer_visible,
    price_cents: Math.max(0, Math.round(Number(draft.price || 0) * 100)),
    status: draft.status,
    summary: draft.summary,
    sop_details: draft.sop_details,
    staff_notes: draft.staff_notes,
    setup_locations: parseLines(draft.setup_locations),
    products: parseProducts(draft.products),
    checklist: parseLines(draft.checklist),
    calendar_note: draft.calendar_note,
    source_label: draft.source_label,
  };
}
