import {
  getGrassrootsCategoryConfig,
  getGrassrootsBusinessCategory,
  getGrassrootsSplitAddress,
  normalizeGrassrootsEventDates,
  normalizeGrassrootsEventType,
  normalizeGrassrootsStatus,
  normalizeGrassrootsEventLinks,
  calculateGrassrootsCpl,
  resolveGrassrootsTargetIsActive,
  makeBlankGrassrootsTarget,
} from "../../grassrootsData";
import { buildGrassrootsLegacyAddressFromSplitAddress } from "../../grassrootsAddress";
import { parseNumberField } from "./dateUtils";

function hasStructuredGrassrootsAddress(source = {}) {
  return Boolean(String(source.address_line_1 || "").trim() && (
    String(source.address_city || "").trim()
    || String(source.address_state || "").trim()
    || String(source.address_postal_code || "").trim()
  ));
}

export function buildTargetPayload(draft, locationId, actor) {
  const expectedAudience = parseNumberField(draft.expected_audience);
  const leadsCaptured = parseNumberField(draft.leads_captured);
  const cost = parseNumberField(draft.cost);
  const businessCategory = String(draft.business_category || draft.drop_category || "").trim();
  const categoryConfig = getGrassrootsCategoryConfig(draft.category);
  const isEvent = categoryConfig.id === "events";
  const eventDates = isEvent ? normalizeGrassrootsEventDates(draft) : [];
  const firstEventDate = eventDates[0] || null;
  const lastEventDate = eventDates[eventDates.length - 1] || null;
  const cpl = isEvent
    ? calculateGrassrootsCpl(cost, leadsCaptured)
    : parseNumberField(draft.cpl);
  const details = draft.details && typeof draft.details === "object" ? draft.details : {};
  const status = normalizeGrassrootsStatus(draft.status);
  const splitAddress = getGrassrootsSplitAddress(draft);
  const structuredLegacyAddress = buildGrassrootsLegacyAddressFromSplitAddress(draft);
  const legacyAddress = hasStructuredGrassrootsAddress(splitAddress)
    ? structuredLegacyAddress
    : String(draft.address || "").trim();
  const targetDetails = isEvent
    ? {
      ...details,
      event_dates: eventDates,
      is_multi_day_event: Boolean(draft.is_multi_day_event || eventDates.length > 1),
    }
    : { ...details };
  const targetLinks = normalizeGrassrootsEventLinks(draft);
  if (targetLinks.length > 0) targetDetails.links = targetLinks;
  else delete targetDetails.links;

  return {
    location_id: locationId,
    category: draft.category,
    name: String(draft.name || "").trim(),
    address: legacyAddress || null,
    address_line_1: splitAddress.address_line_1 || null,
    address_line_2: splitAddress.address_line_2 || null,
    address_city: splitAddress.address_city || null,
    address_state: splitAddress.address_state || null,
    address_postal_code: splitAddress.address_postal_code || null,
    address_country: splitAddress.address_country || null,
    google_place_id: splitAddress.google_place_id || null,
    organizer: String(draft.organizer || "").trim() || null,
    first_name: String(draft.first_name || "").trim() || null,
    last_name: String(draft.last_name || "").trim() || null,
    contact_source: String(draft.contact_source || draft.first_name || "").trim() || null,
    contact_email: String(draft.contact_email || "").trim() || null,
    contact_phone: String(draft.contact_phone || "").trim() || null,
    status,
    is_active: resolveGrassrootsTargetIsActive(status, draft.is_active),
    business_category: businessCategory || null,
    drop_category: businessCategory || null,
    local_employees: parseNumberField(draft.local_employees),
    us_employees: parseNumberField(draft.us_employees),
    proposal: String(draft.proposal || "").trim() || null,
    initial_contact_date: draft.initial_contact_date || null,
    last_contact_date: draft.last_contact_date || null,
    next_contact_date: draft.next_contact_date || null,
    event_start_date: firstEventDate?.event_date || draft.event_start_date || null,
    event_end_date: (draft.is_multi_day_event || eventDates.length > 1) ? (lastEventDate?.event_date || null) : null,
    event_time: firstEventDate?.start_time && firstEventDate?.end_time
      ? `${firstEventDate.start_time}-${firstEventDate.end_time}`
      : firstEventDate?.start_time || String(draft.event_time || "").trim() || null,
    event_type: normalizeGrassrootsEventType(draft.event_type) || null,
    expected_audience: expectedAudience,
    leads_captured: leadsCaptured,
    cost,
    cpl,
    details: targetDetails,
    updated_by_user_id: actor.userId,
    updated_by_name: actor.name,
    ...(draft.isDraft ? { created_by_user_id: actor.userId, created_by_name: actor.name } : {}),
  };
}

export function buildEditorDraft(target) {
  const eventDates = normalizeGrassrootsEventDates(target);
  return {
    ...makeBlankGrassrootsTarget(getGrassrootsCategoryConfig(target.category).id),
    ...target,
    ...getGrassrootsSplitAddress(target),
    business_category: getGrassrootsBusinessCategory(target),
    drop_category: getGrassrootsBusinessCategory(target),
    local_employees: target.local_employees ?? "",
    us_employees: target.us_employees ?? "",
    expected_audience: target.expected_audience ?? "",
    leads_captured: target.leads_captured ?? "",
    cost: target.cost ?? "",
    cpl: target.cpl ?? "",
    event_type: normalizeGrassrootsEventType(target.event_type) || target.event_type || "",
    event_dates: eventDates,
    is_multi_day_event: Boolean(target.details?.is_multi_day_event || eventDates.length > 1),
    isDraft: false,
  };
}
