import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../supabaseClient";
import { C } from "../../shared/theme";
import { I } from "../../shared/icons";
import { Btn, CalendarPicker, Card, MiniDatePicker, Modal } from "../../shared/ui";
import { hasLeanPermission } from "../../shared/permissions";
import {
  GRASSROOTS_CATEGORY_CONFIGS,
  GRASSROOTS_ACTIVITY_ATTACHMENT_ACCEPT,
  GRASSROOTS_ACTIVITY_ATTACHMENT_BUCKET,
  GRASSROOTS_ACTIVITY_ATTACHMENT_MAX_FILES,
  buildGrassrootsActivityAttachmentPath,
  buildGrassrootsDropActivityRows,
  GRASSROOTS_BUSINESS_CATEGORY_OPTIONS,
  GRASSROOTS_EVENT_SAVE_RPC,
  GRASSROOTS_EVENT_TYPE_OPTIONS,
  GRASSROOTS_FILTER_OP_LABELS,
  GRASSROOTS_STATUS_OPTIONS,
  applyGrassrootsFilters,
  buildGrassrootsDropMetrics,
  buildGrassrootsEventSaveRpcArgs,
  buildGrassrootsEventMetrics,
  calculateGrassrootsCpl,
  compareGrassrootsEventSchedule,
  formatGrassrootsAttachmentFileSize,
  getGrassrootsActivityCount,
  getGrassrootsAttachmentPreviewKind,
  getGrassrootsActivityType,
  getGrassrootsBusinessCategory,
  getGrassrootsCategoryConfig,
  getGrassrootsDefaultFilters,
  normalizeGrassrootsEventLinks,
  getGrassrootsSplitAddress,
  getGrassrootsNextDate,
  getGrassrootsPrimaryEventDate,
  getGrassrootsStatusLabel,
  compareGrassrootsHistoryDesc,
  groupGrassrootsActivityAttachments,
  groupGrassrootsActivities,
  inferGrassrootsActivityAttachmentMimeType,
  makeBlankGrassrootsTarget,
  normalizeGrassrootsEventDates,
  normalizeGrassrootsEventType,
  normalizeGrassrootsStatus,
  resolveGrassrootsTargetIsActive,
  searchGrassrootsDropBusinessTargets,
  validateGrassrootsActivityAttachmentFiles,
} from "../grassrootsData";
import { normalizeOptionalUuid } from "../trainingData";

const INPUT_STYLE = {
  width: "100%",
  boxSizing: "border-box",
  padding: "11px 12px",
  borderRadius: 12,
  border: `1.5px solid ${C.border}`,
  background: "#fff",
  color: C.text,
  fontSize: 14,
  fontFamily: "inherit",
  outline: "none",
};

const HISTORY_EVENT_LABELS = {
  target_created: "Created",
  target_updated: "Edited",
  target_moved: "Moved",
  target_deleted: "Deleted",
  development_logged: "Development",
  drop_logged: "Drop",
};

const GOOGLE_PLACES_API_KEY = import.meta.env?.VITE_GOOGLE_PLACES_API_KEY || "";
let googlePlacesScriptPromise = null;

function loadGooglePlacesScript() {
  if (typeof document === "undefined") return Promise.resolve(false);
  if (window.google?.maps?.places) return Promise.resolve(true);
  if (!GOOGLE_PLACES_API_KEY) return Promise.resolve(false);
  if (googlePlacesScriptPromise) return googlePlacesScriptPromise;
  googlePlacesScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector("script[data-k9-google-places]");
    if (existing) {
      existing.addEventListener("load", () => resolve(true), { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_PLACES_API_KEY)}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.dataset.k9GooglePlaces = "true";
    script.onload = () => resolve(true);
    script.onerror = reject;
    document.head.appendChild(script);
  }).catch((error) => {
    console.warn("Google Places autocomplete unavailable", error);
    return false;
  });
  return googlePlacesScriptPromise;
}

const BASE_FILTER_FIELDS = [
  { section: "Workflow", key: "is_active", label: "Tracking State", type: "select", ops: ["is", "isNot"], options: ["active", "inactive", "all"] },
  { section: "Workflow", key: "status", label: "Status", type: "select", ops: ["is", "isNot"], options: GRASSROOTS_STATUS_OPTIONS.map((option) => option.value) },
  { section: "Workflow", key: "next_contact_date", label: "Next Date", type: "date", ops: ["overdue", "today", "thisWeek", "hasDate", "noDate", "after", "before", "inLastDays"] },
  { section: "Workflow", key: "activity_count", label: "Updates", type: "number", ops: ["=", ">=", "<=", ">", "<"] },
  { section: "Record", key: "name", label: "Name", type: "text", ops: ["contains", "equals", "starts", "empty", "notEmpty"] },
  { section: "Record", key: "address", label: "Address", type: "text", ops: ["contains", "equals", "starts", "empty", "notEmpty"] },
];

const CATEGORY_FILTER_FIELDS = {
  events: [
    { section: "Event", key: "event_start_date", label: "Date", type: "date", ops: ["after", "before", "inLastDays", "hasDate", "noDate"] },
    { section: "Event", key: "event_type", label: "Type", type: "select", ops: ["is", "isNot"], options: GRASSROOTS_EVENT_TYPE_OPTIONS },
    { section: "Event", key: "leads_captured", label: "Leads Captured", type: "number", ops: ["=", ">=", "<=", ">", "<"] },
  ],
  drops: [
    { section: "Drop", key: "business_category", label: "Category", type: "select", ops: ["is", "isNot"], options: GRASSROOTS_BUSINESS_CATEGORY_OPTIONS },
    { section: "Drop", key: "address", label: "Address", type: "text", ops: ["contains", "equals", "starts", "empty", "notEmpty"] },
  ],
  corporatePartnerships: [
    { section: "Employees", key: "local_employees", label: "Local Employees", type: "number", ops: ["=", ">=", "<=", ">", "<"] },
    { section: "Employees", key: "us_employees", label: "US Employees", type: "number", ops: ["=", ">=", "<=", ">", "<"] },
    { section: "Contact", key: "contact_source", label: "Contact Source", type: "text", ops: ["contains", "equals", "starts", "empty", "notEmpty"] },
  ],
  apartments: [
    { section: "Contact", key: "contact_source", label: "Contact Source", type: "text", ops: ["contains", "equals", "starts", "empty", "notEmpty"] },
  ],
  petProfessionalPartnerships: [
    { section: "Business", key: "business_category", label: "Category", type: "select", ops: ["is", "isNot"], options: GRASSROOTS_BUSINESS_CATEGORY_OPTIONS },
    { section: "Contact", key: "contact_source", label: "Contact Source", type: "text", ops: ["contains", "equals", "starts", "empty", "notEmpty"] },
  ],
};

function usesBusinessCategoryColumn(categoryConfig) {
  return categoryConfig.id === "drops" || categoryConfig.id === "petProfessionalPartnerships";
}

function getTrackerGridColumns(categoryConfig) {
  if (categoryConfig.id === "petProfessionalPartnerships") {
    return "42px minmax(210px, 1.7fr) minmax(125px, 0.75fr) minmax(130px, 0.8fr) minmax(120px, 0.7fr) 118px minmax(340px, 1.4fr)";
  }
  if (categoryConfig.id === "drops") {
    return "42px minmax(270px, 2fr) minmax(150px, 0.9fr) minmax(130px, 0.75fr) 118px minmax(370px, 1.5fr)";
  }
  if (categoryConfig.id === "events") {
    return "42px minmax(260px, 2fr) minmax(130px, 0.7fr) minmax(180px, 0.8fr) minmax(220px, 0.85fr)";
  }
  return "42px minmax(230px, 2fr) minmax(140px, 0.85fr) minmax(130px, 0.75fr) 118px minmax(370px, 1.5fr)";
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr, days) {
  const base = new Date(`${dateStr}T12:00:00`);
  base.setDate(base.getDate() + days);
  return base.toISOString().slice(0, 10);
}

function fmtDate(value) {
  if (!value) return "—";
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtMonthYear(value) {
  if (!/^\d{4}-\d{2}$/.test(String(value || ""))) return "This Month";
  return new Date(`${value}-01T12:00:00`).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function EventDateCell({ target }) {
  const dates = normalizeGrassrootsEventDates(target);
  if (dates.length === 0) {
    return <div style={{ fontSize: 12, fontWeight: 800, color: C.textMut }}>No date</div>;
  }
  const [firstDate, ...additionalDates] = dates;
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 900, color: C.text, whiteSpace: "nowrap" }}>{fmtDate(firstDate.event_date)}</div>
      {additionalDates.length > 0 && (
        <div style={{ marginTop: 3, fontSize: 11, fontWeight: 800, color: C.textMut }}>
          +{additionalDates.length} more {additionalDates.length === 1 ? "date" : "dates"}
        </div>
      )}
    </div>
  );
}

function fmtDateTime(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function createGrassrootsClientUuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function scrollGrassrootsEditorIntoView(element) {
  if (!element || typeof window === "undefined") return;
  const findScrollParent = (node) => {
    let current = node?.parentElement || null;
    while (current && current !== document.body) {
      const style = window.getComputedStyle(current);
      if (/(auto|scroll)/.test(style.overflowY) && current.scrollHeight > current.clientHeight + 8) {
        return current;
      }
      current = current.parentElement;
    }
    return null;
  };
  const isCompact = typeof window.matchMedia === "function" && window.matchMedia("(max-width: 760px)").matches;
  const headerOffset = isCompact ? 76 : 92;
  const scrollParent = findScrollParent(element);
  const viewportHeight = scrollParent?.clientHeight || window.innerHeight || document.documentElement.clientHeight || 0;
  const rect = element.getBoundingClientRect();
  const availableHeight = Math.max(320, viewportHeight - headerOffset - 24);
  const topOffset = rect.height <= availableHeight
    ? Math.max(headerOffset, Math.floor((viewportHeight - rect.height) / 2))
    : headerOffset;
  if (scrollParent) {
    const parentRect = scrollParent.getBoundingClientRect();
    const top = Math.max(0, scrollParent.scrollTop + rect.top - parentRect.top - topOffset);
    scrollParent.scrollTo({ top, behavior: "smooth" });
    return;
  }
  const top = Math.max(0, window.scrollY + rect.top - topOffset);
  window.scrollTo({ top, behavior: "smooth" });
}

function parseNumberField(value) {
  if (value === "" || value == null) return null;
  const num = Number(value);
  return Number.isNaN(num) ? null : num;
}

export function parseGooglePlaceAddress(place) {
  const components = Array.isArray(place?.address_components) ? place.address_components : [];
  const read = (type, mode = "long_name") => components.find((component) => component.types?.includes(type))?.[mode] || "";
  const streetNumber = read("street_number");
  const route = read("route");
  const postalCode = [read("postal_code"), read("postal_code_suffix")].filter(Boolean).join("-");
  const fallback = parseFreeformGrassrootsAddress(place?.formatted_address || "");
  return {
    address: place?.formatted_address || fallback.address || "",
    address_line_1: [streetNumber, route].filter(Boolean).join(" ").trim() || fallback.address_line_1,
    address_line_2: "",
    address_city: read("locality") || read("postal_town") || read("sublocality") || read("administrative_area_level_3") || fallback.address_city,
    address_state: read("administrative_area_level_1", "short_name") || fallback.address_state,
    address_postal_code: postalCode || fallback.address_postal_code,
    address_country: read("country", "short_name") || fallback.address_country,
    google_place_id: place?.place_id || "",
  };
}

function looksLikeGoogleAddressTail(value) {
  return /(?:\b[A-Z]{2}\b|\d{5}|usa|united states|new jersey|pennsylvania|delaware|route|rte|road|rd|street|st|avenue|ave|boulevard|blvd|drive|dr|lane|ln|highway|hwy|pike|turnpike)/i.test(String(value || ""));
}

function cleanGooglePlaceBusinessLabel(value, options = {}) {
  const normalized = String(value || "").trim().replace(/\s+/g, " ");
  if (!normalized) return "";
  const segments = normalized.split(",").map((part) => part.trim()).filter(Boolean);
  if (segments.length > 1 && (!options.preserveBusinessCommas || looksLikeGoogleAddressTail(segments.slice(1).join(", ")))) {
    return segments[0];
  }
  return normalized;
}

export function extractGooglePlaceBusinessName(place, fallbackValue = "") {
  return cleanGooglePlaceBusinessLabel(place?.name, { preserveBusinessCommas: true }) || cleanGooglePlaceBusinessLabel(fallbackValue);
}

function googlePlaceTextIncludes(text, terms) {
  return terms.some((term) => text.includes(term));
}

export function inferGrassrootsBusinessCategoryFromPlace(place = {}, businessName = "") {
  const types = Array.isArray(place?.types) ? place.types.map((type) => String(type || "").toLowerCase()) : [];
  const name = String(businessName || place?.name || "").toLowerCase();
  const text = [name, ...types, place?.formatted_address].filter(Boolean).join(" ").toLowerCase();

  if (types.includes("veterinary_care") || googlePlaceTextIncludes(text, [
    "animal hospital",
    "banfield",
    "pet hospital",
    "vca ",
    "vet ",
    "veterinarian",
    "veterinary",
  ])) {
    return "Veterinarian";
  }
  if (googlePlaceTextIncludes(text, ["groom", "groomer", "grooming", "pet spa"])) return "Groomer";
  if (types.includes("pet_store") || googlePlaceTextIncludes(text, [
    "pet store",
    "pet supplies",
    "pet supermarket",
    "petco",
    "petsmart",
    "pet valu",
  ])) {
    return "Pet Retailer";
  }
  if (googlePlaceTextIncludes(text, [
    "animal rescue",
    "animal shelter",
    "humane society",
    "rescue",
    "shelter",
    "spca",
  ])) {
    return "Rescue";
  }
  if (googlePlaceTextIncludes(text, ["dog training", "obedience", "trainer", "training"])) return "Trainer";
  if (googlePlaceTextIncludes(text, [
    "boarding",
    "camp bow wow",
    "daycare",
    "dog camp",
    "dog hotel",
    "kennel",
    "pet lodge",
    "pet resort",
  ])) {
    return "Boarding/Daycare";
  }
  return "";
}

function getGooglePredictionSecondaryText(prediction) {
  const structured = prediction?.structured_formatting || {};
  const mainText = String(structured.main_text || "").trim();
  const secondaryText = String(structured.secondary_text || "").trim();
  if (secondaryText) return secondaryText;
  const description = String(prediction?.description || "").trim();
  if (!description || !mainText) return description;
  return description.replace(new RegExp(`^${mainText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*,\\s*`, "i"), "");
}

function renderGooglePredictionText(text, matchedSubstrings = []) {
  const source = String(text || "");
  if (!source) return null;
  const ranges = matchedSubstrings
    .map((range) => ({
      start: Number(range?.offset || 0),
      end: Number(range?.offset || 0) + Number(range?.length || 0),
    }))
    .filter((range) => range.end > range.start)
    .sort((left, right) => left.start - right.start);
  if (ranges.length === 0) return source;
  const parts = [];
  let cursor = 0;
  ranges.forEach((range, index) => {
    const start = Math.max(cursor, Math.min(source.length, range.start));
    const end = Math.max(start, Math.min(source.length, range.end));
    if (start > cursor) parts.push(source.slice(cursor, start));
    if (end > start) {
      parts.push(<mark key={`match-${index}`}>{source.slice(start, end)}</mark>);
    }
    cursor = end;
  });
  if (cursor < source.length) parts.push(source.slice(cursor));
  return parts;
}

export function parseFreeformGrassrootsAddress(value) {
  const address = String(value || "").trim().replace(/\s+/g, " ");
  const blank = {
    address,
    address_line_1: "",
    address_line_2: "",
    address_city: "",
    address_state: "",
    address_postal_code: "",
    address_country: "",
    google_place_id: "",
  };
  if (!address) return blank;
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 3) return blank;
  const countryRaw = parts.at(-1) || "";
  const country = /^u\.?s\.?a?\.?$/i.test(countryRaw) || /^united states/i.test(countryRaw) ? "US" : countryRaw;
  const statePostal = parts.at(-2) || "";
  const statePostalMatch = statePostal.match(/^([A-Z]{2})(?:\s+(\d{5}(?:-\d{4})?))?$/i);
  const postalOnlyMatch = statePostal.match(/(\d{5}(?:-\d{4})?)$/);
  const state = statePostalMatch?.[1]?.toUpperCase() || "";
  const postalCode = statePostalMatch?.[2] || postalOnlyMatch?.[1] || "";
  const city = parts.at(-3) || "";
  const line1 = parts.slice(0, -3).join(", ");
  return {
    ...blank,
    address_line_1: line1,
    address_city: city,
    address_state: state,
    address_postal_code: postalCode,
    address_country: country,
  };
}

export function buildGrassrootsLegacyAddressFromSplitAddress(source = {}) {
  const line1 = String(source.address_line_1 || "").trim();
  const line2 = String(source.address_line_2 || "").trim();
  const city = String(source.address_city || "").trim();
  const state = String(source.address_state || "").trim();
  const postalCode = String(source.address_postal_code || "").trim();
  const country = String(source.address_country || "").trim();
  const cityStatePostal = [
    city,
    [state, postalCode].filter(Boolean).join(" "),
  ].filter(Boolean).join(", ");
  return [line1, line2, cityStatePostal, country].filter(Boolean).join(", ");
}

export function getGrassrootsVisibleAddressLine(source = {}) {
  return String(source.address_line_1 || source.address || "").trim();
}

function hasStructuredGrassrootsAddress(source = {}) {
  return Boolean(String(source.address_line_1 || "").trim() && (
    String(source.address_city || "").trim()
    || String(source.address_state || "").trim()
    || String(source.address_postal_code || "").trim()
  ));
}

function fmtCurrencyNumber(value) {
  if (value === "" || value == null) return "";
  const num = Number(value);
  return Number.isNaN(num) ? "" : num.toFixed(2);
}

function historyEventLabel(eventType) {
  return HISTORY_EVENT_LABELS[eventType] || "History";
}

function historyActorName(entry) {
  return entry?.actor_name || "Unknown user";
}

function buildTargetPayload(draft, locationId, actor) {
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

function buildEditorDraft(target) {
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

function StatusPicker({ value, onChange }) {
  const normalizedValue = normalizeGrassrootsStatus(value);
  const colors = {
    identified: "#2563EB",
    corresponding: "#7C3AED",
    booked: C.suc,
    abandoned: C.dan,
  };
  return (
    <div>
      <Label>Status</Label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
        {GRASSROOTS_STATUS_OPTIONS.map((option) => {
          const active = normalizedValue === option.value;
          const color = colors[option.value] || C.pri;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              style={{
                padding: "8px 12px",
                borderRadius: 10,
                border: `1.5px solid ${active ? color : C.border}`,
                background: active ? color : "#fff",
                color: active ? "#fff" : C.text,
                fontSize: 12,
                fontWeight: 800,
                cursor: "pointer",
                fontFamily: "inherit",
                boxShadow: active ? `0 8px 18px ${color}24` : "0 1px 3px rgba(15,23,42,0.04)",
                transition: "all 0.18s cubic-bezier(0.2,0.8,0.2,1)",
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ActiveToggle({ value, onChange }) {
  return (
    <div>
      <Label>Tracking State</Label>
      <div style={{ display: "inline-grid", gridTemplateColumns: "1fr 1fr", gap: 4, padding: 4, borderRadius: 12, border: `1.5px solid ${C.border}`, background: C.bg }}>
        {[{ value: true, label: "Active" }, { value: false, label: "Inactive" }].map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.label}
              type="button"
              onClick={() => onChange(option.value)}
              style={{
                padding: "7px 12px",
                borderRadius: 9,
                border: "none",
                background: selected ? (option.value ? C.pri : C.warn) : "transparent",
                color: selected ? "#fff" : C.textSec,
                fontSize: 12,
                fontWeight: 800,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EventTypePicker({ value, onChange }) {
  const selected = normalizeGrassrootsEventType(value);
  return (
    <div>
      <Label>Type</Label>
      <div className="grassroots-event-type-picker" role="group" aria-label="Event type">
        {GRASSROOTS_EVENT_TYPE_OPTIONS.map((option) => {
          const active = selected === option;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option)}
              className={active ? "grassroots-event-type-option is-active" : "grassroots-event-type-option"}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export async function copyGrassrootsTextToClipboard(value, sourceInput = null, runtime = {}) {
  const text = String(value || "");
  if (!text) return { copied: false, verified: false };
  const runtimeDocument = runtime.document ?? (typeof document !== "undefined" ? document : null);
  const runtimeNavigator = runtime.navigator ?? (typeof navigator !== "undefined" ? navigator : null);
  const selectSourceInput = () => {
    if (!sourceInput) return false;
    try {
      sourceInput.focus({ preventScroll: true });
      sourceInput.select();
      sourceInput.setSelectionRange(0, text.length);
      return true;
    } catch {
      return false;
    }
  };
  const sourceSelected = selectSourceInput();

  let selectionCopied = false;
  if (sourceSelected && runtimeDocument) {
    try {
      selectionCopied = runtimeDocument.execCommand?.("copy") === true;
    } catch {
      selectionCopied = false;
    }
  } else if (runtimeDocument) {
    const textarea = runtimeDocument.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "0";
    textarea.style.left = "0";
    textarea.style.width = "1px";
    textarea.style.height = "1px";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    runtimeDocument.body.appendChild(textarea);
    textarea.focus({ preventScroll: true });
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    try {
      selectionCopied = runtimeDocument.execCommand?.("copy") === true;
    } catch {
      selectionCopied = false;
    }
    runtimeDocument.body.removeChild(textarea);
  }

  let apiCopied = false;
  let verified = false;
  if (runtimeNavigator?.clipboard?.writeText) {
    try {
      await runtimeNavigator.clipboard.writeText(text);
      apiCopied = true;
    } catch {
      apiCopied = false;
    }
  }
  if (runtimeNavigator?.clipboard?.readText) {
    try {
      verified = (await runtimeNavigator.clipboard.readText()) === text;
    } catch {
      verified = false;
    }
  }
  if (!selectionCopied) selectSourceInput();
  return { copied: selectionCopied, verified, apiCopied, selectionCopied, sourceSelected };
}

function Label({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 800, color: C.textMut, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>
      {children}
    </div>
  );
}

function FieldEditor({ field, value, onChange }) {
  if (field.type === "date") {
    return <CalendarPicker label={field.label} value={value || ""} onChange={onChange} reserveSpace />;
  }

  if (field.type === "computed") {
    return (
      <label style={{ display: "block" }}>
        <Label>{field.label}</Label>
        <input
          value={value ?? ""}
          readOnly
          placeholder={field.placeholder || field.label}
          style={{ ...INPUT_STYLE, background: C.bg, color: value ? C.text : C.textMut }}
        />
      </label>
    );
  }

  if (field.type === "select") {
    const options = field.options || [];
    const selected = String(value || "");
    return (
      <label style={{ display: "block" }}>
        <Label>{field.label}</Label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {options.map((option) => {
            const active = selected === option;
            return (
              <button
                key={option}
                type="button"
                onClick={() => onChange(option)}
                style={{
                  padding: "7px 10px",
                  borderRadius: 9,
                  border: `1.5px solid ${active ? C.pri : C.border}`,
                  background: active ? C.pri : "#fff",
                  color: active ? "#fff" : C.text,
                  fontSize: 11,
                  fontWeight: 800,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {option}
              </button>
            );
          })}
        </div>
        {field.allowCustom && (
          <input
            value={selected && !options.includes(selected) ? selected : ""}
            onChange={(event) => onChange(event.target.value)}
            placeholder="Custom category"
            style={{ ...INPUT_STYLE, marginTop: 8, padding: "8px 10px", borderRadius: 9 }}
          />
        )}
      </label>
    );
  }

  if (field.type === "textarea") {
    return (
      <label style={{ display: "block", gridColumn: "1 / -1" }}>
        <Label>{field.label}</Label>
        <textarea
          value={value || ""}
          rows={3}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          style={{ ...INPUT_STYLE, minHeight: 86, resize: "vertical", lineHeight: 1.45 }}
        />
      </label>
    );
  }

  return (
    <label style={{ display: "block" }}>
      <Label>{field.label}</Label>
      <input
        type={field.type === "number" ? "number" : field.type === "email" ? "email" : "text"}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        placeholder={field.placeholder || field.label}
        style={INPUT_STYLE}
      />
    </label>
  );
}

function looksLikeCompleteGrassrootsAddress(value) {
  return /,\s*[^,]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?(?:,\s*[^,]+)?$/i.test(String(value || "").trim());
}

function GooglePlacesAddressInput({ label = "Address", value, onChange, onPlaceSelect, placeholder = "Start typing an address" }) {
  const inputRef = useRef(null);
  const autocompleteRef = useRef(null);
  const appliedAddressRef = useRef("");
  const applyAddressValue = useCallback((rawValue, options = {}) => {
    const address = String(rawValue || "").trim();
    if (!address || appliedAddressRef.current === address) return;
    if (!options.force && !looksLikeCompleteGrassrootsAddress(address)) return;
    const parsedAddress = parseFreeformGrassrootsAddress(address);
    if (!parsedAddress.address_line_1 || !parsedAddress.address_city) return;
    appliedAddressRef.current = address;
    onPlaceSelect?.({ ...parsedAddress, address });
  }, [onPlaceSelect]);

  useEffect(() => {
    let cancelled = false;
    loadGooglePlacesScript().then((ready) => {
      if (cancelled || !ready || !inputRef.current || !window.google?.maps?.places) return;
      autocompleteRef.current = new window.google.maps.places.Autocomplete(inputRef.current, {
        fields: ["address_components", "formatted_address", "name", "place_id"],
        types: ["address"],
        componentRestrictions: { country: "us" },
      });
      autocompleteRef.current.addListener("place_changed", () => {
        const place = autocompleteRef.current?.getPlace?.();
        const address = place?.formatted_address || inputRef.current?.value || "";
        const parsedAddress = parseGooglePlaceAddress(place);
        const visibleAddressLine = getGrassrootsVisibleAddressLine(parsedAddress) || address;
        appliedAddressRef.current = address;
        onChange(visibleAddressLine);
        onPlaceSelect?.({ ...parsedAddress, address: visibleAddressLine });
      });
    });
    return () => {
      cancelled = true;
      if (autocompleteRef.current && window.google?.maps?.event) {
        window.google.maps.event.clearInstanceListeners(autocompleteRef.current);
      }
    };
  }, [onChange, onPlaceSelect]);

  return (
    <label style={{ display: "block" }}>
      <Label>{label}</Label>
      <input
        ref={inputRef}
        value={value || ""}
        onChange={(event) => {
          const nextValue = event.target.value;
          onChange(nextValue);
          applyAddressValue(nextValue);
        }}
        onBlur={(event) => applyAddressValue(event.target.value, { force: true })}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === "Tab") applyAddressValue(event.currentTarget.value, { force: true });
        }}
        placeholder={placeholder}
        autoComplete="off"
        data-1p-ignore="true"
        data-lpignore="true"
        data-form-type="other"
        style={{ ...INPUT_STYLE, background: C.bg }}
      />
    </label>
  );
}

function GooglePlacesBusinessInput({
  label,
  value,
  onChange,
  onPlaceSelect,
  placeholder = "Start typing a business",
  internalOptions = [],
  onInternalSelect,
  internalLabel = "Existing businesses",
  googleLabel = "Google Places",
}) {
  const inputRef = useRef(null);
  const wrapperRef = useRef(null);
  const autocompleteServiceRef = useRef(null);
  const detailsServiceRef = useRef(null);
  const sessionTokenRef = useRef(null);
  const requestIdRef = useRef(0);
  const selectedValueRef = useRef("");
  const [placesReady, setPlacesReady] = useState(false);
  const [predictions, setPredictions] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const resetSessionToken = useCallback(() => {
    if (window.google?.maps?.places?.AutocompleteSessionToken) {
      sessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadGooglePlacesScript().then((ready) => {
      if (cancelled || !ready || !inputRef.current || !window.google?.maps?.places) return;
      autocompleteServiceRef.current = new window.google.maps.places.AutocompleteService();
      detailsServiceRef.current = new window.google.maps.places.PlacesService(document.createElement("div"));
      resetSessionToken();
      setPlacesReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [resetSessionToken]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!wrapperRef.current?.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    const query = String(value || "").trim();
    if (!placesReady || query.length < 2 || query === selectedValueRef.current) {
      setPredictions([]);
      setIsSearching(false);
      setActiveIndex(internalOptions.length > 0 ? 0 : -1);
      return undefined;
    }
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setIsSearching(true);
    const timerId = window.setTimeout(() => {
      autocompleteServiceRef.current?.getPlacePredictions({
        input: query,
        types: ["establishment"],
        componentRestrictions: { country: "us" },
        sessionToken: sessionTokenRef.current,
      }, (results = [], status) => {
        if (requestIdRef.current !== requestId) return;
        const okStatus = window.google?.maps?.places?.PlacesServiceStatus?.OK;
        const nextPredictions = status === okStatus ? results.slice(0, 6) : [];
        setPredictions(nextPredictions);
        setActiveIndex(internalOptions.length > 0 || nextPredictions.length > 0 ? 0 : -1);
        setIsOpen(internalOptions.length > 0 || nextPredictions.length > 0 || query.length >= 2);
        setIsSearching(false);
      });
    }, 140);
    return () => window.clearTimeout(timerId);
  }, [internalOptions.length, placesReady, value]);

  useEffect(() => {
    const query = String(value || "").trim();
    if (query.length >= 2 && internalOptions.length > 0) {
      setIsOpen(true);
      setActiveIndex((current) => (current < 0 ? 0 : current));
    }
  }, [internalOptions.length, value]);

  const applyPlace = useCallback((place, fallbackName = "") => {
    const name = extractGooglePlaceBusinessName(place, fallbackName);
    const parsedAddress = parseGooglePlaceAddress(place);
    const category = inferGrassrootsBusinessCategoryFromPlace(place, name);
    selectedValueRef.current = name;
    onChange(name);
    if (inputRef.current) inputRef.current.value = name;
    onPlaceSelect?.({
      ...parsedAddress,
      address: parsedAddress.address || place?.formatted_address || "",
      name,
      business_category: category,
      drop_category: category,
      contact_phone: place?.formatted_phone_number || "",
      website: place?.website || "",
    });
    setPredictions([]);
    setIsOpen(false);
    setActiveIndex(-1);
    setIsSearching(false);
    resetSessionToken();
  }, [onChange, onPlaceSelect, resetSessionToken]);

  const selectPrediction = useCallback((prediction) => {
    if (!prediction?.place_id || !detailsServiceRef.current) return;
    const fallbackName = prediction.structured_formatting?.main_text || prediction.description || "";
    setIsSearching(true);
    detailsServiceRef.current.getDetails({
      placeId: prediction.place_id,
      fields: ["address_components", "formatted_address", "formatted_phone_number", "name", "place_id", "types", "website"],
      sessionToken: sessionTokenRef.current,
    }, (place, status) => {
      const okStatus = window.google?.maps?.places?.PlacesServiceStatus?.OK;
      if (status === okStatus && place) {
        applyPlace(place, fallbackName);
        return;
      }
      applyPlace({
        formatted_address: "",
        name: fallbackName,
        place_id: prediction.place_id,
        types: prediction.types || [],
      }, fallbackName);
    });
  }, [applyPlace]);

  const selectInternalOption = useCallback((option) => {
    if (!option?.target) return;
    const name = option.target.name || "";
    selectedValueRef.current = name;
    onChange(name);
    if (inputRef.current) inputRef.current.value = name;
    onInternalSelect?.(option.target, option);
    setPredictions([]);
    setIsOpen(false);
    setActiveIndex(-1);
    setIsSearching(false);
  }, [onChange, onInternalSelect]);

  const handleKeyDown = (event) => {
    const totalOptions = internalOptions.length + predictions.length;
    if (!isOpen || totalOptions === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % totalOptions);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current <= 0 ? totalOptions - 1 : current - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const index = Math.max(0, activeIndex);
      if (index < internalOptions.length) {
        selectInternalOption(internalOptions[index]);
      } else {
        selectPrediction(predictions[index - internalOptions.length]);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
    }
  };

  const showPanel = isOpen && (internalOptions.length > 0 || predictions.length > 0 || isSearching);

  return (
    <div className="grassroots-places-field" ref={wrapperRef}>
      <Label>{label}</Label>
      <div className="grassroots-places-anchor">
        <input
          ref={inputRef}
          value={value || ""}
          onChange={(event) => {
            selectedValueRef.current = "";
            onChange(event.target.value);
          }}
          onFocus={() => {
            if (internalOptions.length > 0 || predictions.length > 0) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={showPanel}
          data-1p-ignore="true"
          data-lpignore="true"
          data-form-type="other"
          style={INPUT_STYLE}
        />
        {showPanel && (
          <div className="grassroots-places-panel" role="listbox">
            {internalOptions.length > 0 && (
              <>
                <div className="grassroots-places-section-label">{internalLabel}</div>
                {internalOptions.map((option, index) => {
                  const active = index === activeIndex;
                  return (
                    <button
                      key={option.target?.id || option.label}
                      type="button"
                      className={`grassroots-places-option is-internal${active ? " is-active" : ""}`}
                      role="option"
                      aria-selected={active}
                      onMouseEnter={() => setActiveIndex(index)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectInternalOption(option)}
                    >
                      <span className="grassroots-places-pin is-internal" aria-hidden="true">
                        <I.CheckCircle />
                      </span>
                      <span className="grassroots-places-copy">
                        <span className="grassroots-places-main">{option.target?.name || "Existing business"}</span>
                        <span className="grassroots-places-secondary">{option.subtitle}</span>
                      </span>
                      <span className="grassroots-places-category">{option.badge}</span>
                    </button>
                  );
                })}
              </>
            )}
            {(predictions.length > 0 || isSearching) && (
              <div className="grassroots-places-section-label">{googleLabel}</div>
            )}
            {predictions.map((prediction, index) => {
              const mainText = prediction.structured_formatting?.main_text || cleanGooglePlaceBusinessLabel(prediction.description);
              const secondaryText = getGooglePredictionSecondaryText(prediction);
              const inferredCategory = inferGrassrootsBusinessCategoryFromPlace({ name: mainText, types: prediction.types || [] }, mainText);
              const combinedIndex = internalOptions.length + index;
              const active = combinedIndex === activeIndex;
              return (
                <button
                  key={prediction.place_id || prediction.description}
                  type="button"
                  className={`grassroots-places-option${active ? " is-active" : ""}`}
                  role="option"
                  aria-selected={active}
                  onMouseEnter={() => setActiveIndex(combinedIndex)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectPrediction(prediction)}
                >
                  <span className="grassroots-places-pin" aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M12 21s6-5.1 6-11a6 6 0 1 0-12 0c0 5.9 6 11 6 11z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <circle cx="12" cy="10" r="2" fill="currentColor" />
                    </svg>
                  </span>
                  <span className="grassroots-places-copy">
                    <span className="grassroots-places-main">
                      {renderGooglePredictionText(mainText, prediction.structured_formatting?.main_text_matched_substrings)}
                    </span>
                    {secondaryText && <span className="grassroots-places-secondary">{secondaryText}</span>}
                  </span>
                  {inferredCategory && <span className="grassroots-places-category">{inferredCategory}</span>}
                </button>
              );
            })}
            {predictions.length === 0 && isSearching && (
              <div className="grassroots-places-loading">Searching...</div>
            )}
            <div className="grassroots-places-footer">
              <span>powered by</span>
              <span className="grassroots-google-wordmark"><span>G</span><span>o</span><span>o</span><span>g</span><span>l</span><span>e</span></span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SplitAddressFields({ draft, onChange, onPlaceSelect, placeholder = "Address" }) {
  const [copyState, setCopyState] = useState("idle");
  const copyResetTimer = useRef(null);
  const fullAddressInputRef = useRef(null);
  const showCopiedState = useCallback((duration = 1600) => {
    if (copyResetTimer.current) window.clearTimeout(copyResetTimer.current);
    setCopyState("copied");
    copyResetTimer.current = window.setTimeout(() => setCopyState("idle"), duration);
  }, []);
  const handlePlaceSelect = useCallback((parts) => {
    const visibleAddressLine = getGrassrootsVisibleAddressLine(parts);
    onPlaceSelect?.({
      ...parts,
      address: visibleAddressLine || parts?.address || "",
    });
  }, [onPlaceSelect]);
  const fullAddress = buildGrassrootsLegacyAddressFromSplitAddress(draft) || String(draft.address || "").trim();
  const handleCopyAddress = async () => {
    if (!fullAddress) return;
    if (copyResetTimer.current) window.clearTimeout(copyResetTimer.current);
    try {
      const result = await copyGrassrootsTextToClipboard(fullAddress, fullAddressInputRef.current);
      if (!result.copied) {
        fullAddressInputRef.current?.focus({ preventScroll: true });
        fullAddressInputRef.current?.select();
      }
      if (result.copied) {
        showCopiedState();
      } else {
        setCopyState("manual");
      }
    } catch {
      fullAddressInputRef.current?.focus({ preventScroll: true });
      fullAddressInputRef.current?.select();
      setCopyState("manual");
    }
  };
  const handleFullAddressCopy = (event) => {
    const input = event.currentTarget;
    const selectedText = String(input.value || "").slice(input.selectionStart || 0, input.selectionEnd || 0);
    if (selectedText && selectedText === fullAddress) showCopiedState();
  };
  const handleFullAddressBlur = () => {
    if (copyState === "manual") setCopyState("idle");
  };

  useEffect(() => () => {
    if (copyResetTimer.current) window.clearTimeout(copyResetTimer.current);
  }, []);

  return (
    <>
      <GooglePlacesAddressInput
        label="Street"
        value={draft.address_line_1}
        onChange={(value) => {
          onChange("address_line_1", value);
          onChange("address", value);
        }}
        onPlaceSelect={handlePlaceSelect}
        placeholder={placeholder || "Street address"}
      />
      <FieldEditor field={{ key: "address_line_2", label: "Unit", placeholder: "Suite, booth, or unit" }} value={draft.address_line_2} onChange={(value) => onChange("address_line_2", value)} />
      <FieldEditor field={{ key: "address_city", label: "City", placeholder: "City" }} value={draft.address_city} onChange={(value) => onChange("address_city", value)} />
      <FieldEditor field={{ key: "address_state", label: "State", placeholder: "State" }} value={draft.address_state} onChange={(value) => onChange("address_state", value)} />
      <FieldEditor field={{ key: "address_postal_code", label: "ZIP", placeholder: "ZIP" }} value={draft.address_postal_code} onChange={(value) => onChange("address_postal_code", value)} />
      <FieldEditor field={{ key: "address_country", label: "Country", placeholder: "Country" }} value={draft.address_country} onChange={(value) => onChange("address_country", value)} />
      <div className="grassroots-address-copy-field">
        <Label>Full Address</Label>
        <div className={`grassroots-address-copy-shell is-${copyState}`}>
          <input
            ref={fullAddressInputRef}
            value={fullAddress}
            readOnly
            placeholder="Full address builds from the fields above"
            style={{ ...INPUT_STYLE, background: C.bg, paddingRight: copyState === "manual" ? 132 : 104 }}
            onCopy={handleFullAddressCopy}
            onBlur={handleFullAddressBlur}
          />
          <button
            type="button"
            onClick={handleCopyAddress}
            disabled={!fullAddress}
            className={`grassroots-address-copy-button is-${copyState}`}
            aria-label={copyState === "copied" ? "Address copied" : copyState === "manual" ? "Automatic copy unavailable. Press Command C to copy the selected address." : "Copy full address"}
            aria-live="polite"
          >
            <span className="grassroots-copy-icon-stack" aria-hidden="true">
              <span className="grassroots-copy-clipboard"><I.Clipboard /></span>
              <span className="grassroots-copy-check"><I.Check /></span>
            </span>
            <span className="grassroots-copy-label">
              {copyState === "copied" ? "Copied" : copyState === "manual" ? "Press Cmd+C" : "Copy"}
            </span>
          </button>
        </div>
      </div>
    </>
  );
}

function EventDateEditor({ draft, onChange }) {
  const initialRows = () => {
    if (Array.isArray(draft.event_dates) && draft.event_dates.length > 0) return draft.event_dates;
    const normalized = normalizeGrassrootsEventDates(draft);
    return normalized.length > 0 ? normalized : [{ id: "event_date_1", event_date: "", start_time: "", end_time: "", sequence_order: 1 }];
  };
  const rows = initialRows();
  const multiDay = Boolean(draft.is_multi_day_event || rows.length > 1);
  const emitRows = (nextRows, nextMultiDay = multiDay) => {
    const prepared = nextRows.map((row, index) => ({
      ...row,
      id: row.id || `event_date_${index + 1}`,
      sequence_order: index + 1,
    }));
    onChange("event_dates", prepared);
    onChange("is_multi_day_event", nextMultiDay);
    onChange("event_start_date", prepared[0]?.event_date || "");
    onChange("event_end_date", nextMultiDay ? (prepared.at(-1)?.event_date || "") : "");
    onChange("event_time", prepared[0]?.start_time || "");
  };
  const updateRow = (index, key, value) => {
    const nextRows = rows.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row);
    emitRows(nextRows);
  };
  const visibleRows = multiDay ? rows : rows.slice(0, 1);

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <Label>Date</Label>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, color: C.textSec, fontWeight: 800 }}>
          <input
            type="checkbox"
            checked={multiDay}
            onChange={(event) => emitRows(event.target.checked && rows.length === 1 ? [...rows, { id: `event_date_${Date.now()}`, event_date: "", start_time: "", end_time: "", sequence_order: 2 }] : rows.slice(0, 1), event.target.checked)}
            style={{ accentColor: C.pri }}
          />
          Multi-day
        </label>
      </div>
      {visibleRows.map((row, index) => (
        <div key={row.id || index} className="grassroots-event-date-row">
          <CalendarPicker label={multiDay ? `Date ${index + 1}` : "Date"} value={row.event_date || ""} onChange={(value) => updateRow(index, "event_date", value)} required />
          <label style={{ display: "block" }}>
            <Label>Start</Label>
            <input type="time" value={row.start_time || ""} onChange={(event) => updateRow(index, "start_time", event.target.value)} style={{ ...INPUT_STYLE, background: C.bg }} />
          </label>
          <label style={{ display: "block" }}>
            <Label>End</Label>
            <input type="time" value={row.end_time || ""} onChange={(event) => updateRow(index, "end_time", event.target.value)} style={{ ...INPUT_STYLE, background: C.bg }} />
          </label>
          {multiDay && (
            <button
              type="button"
              onClick={() => emitRows(rows.filter((_, rowIndex) => rowIndex !== index))}
              disabled={rows.length <= 1}
              aria-label="Remove date"
              style={{ width: 34, height: 34, borderRadius: 9, border: `1.5px solid ${C.borderLight}`, background: "#fff", color: C.textMut, cursor: rows.length > 1 ? "pointer" : "default", display: "grid", placeItems: "center" }}
            >
              <I.X />
            </button>
          )}
        </div>
      ))}
      {multiDay && (
        <button
          type="button"
          onClick={() => emitRows([...rows, { id: `event_date_${Date.now()}`, event_date: "", start_time: "", end_time: "", sequence_order: rows.length + 1 }])}
          style={{ width: "fit-content", padding: "7px 12px", borderRadius: 9, border: `1.5px dashed ${C.pri}`, background: "transparent", color: C.pri, fontSize: 12, fontWeight: 900, fontFamily: "inherit", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          <I.Plus /> Add date
        </button>
      )}
    </div>
  );
}

function eventLinkRowsForEditor(draft = {}) {
  const rawLinks = Array.isArray(draft.details?.links) ? draft.details.links : [];
  if (rawLinks.length === 0) {
    return [{ id: "event_link_blank", url: "" }];
  }
  return rawLinks.map((row, index) => ({
    id: row?.id || `event_link_${index + 1}`,
    url: row?.url || row?.href || "",
  }));
}

function getSafeEventLinkHref(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(candidate);
    return ["http:", "https:", "mailto:", "tel:"].includes(parsed.protocol) ? parsed.href : "";
  } catch {
    return "";
  }
}

function EventLinksEditor({ draft, onChange }) {
  const rows = eventLinkRowsForEditor(draft);
  const updateRows = (nextRows) => {
    const details = draft.details && typeof draft.details === "object" ? draft.details : {};
    onChange("details", { ...details, links: nextRows });
  };
  const updateRow = (index, key, value) => {
    updateRows(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row)));
  };
  const removeRow = (index) => {
    const nextRows = rows.filter((_, rowIndex) => rowIndex !== index);
    updateRows(nextRows.length > 0 ? nextRows : [{ id: "event_link_blank", url: "" }]);
  };

  return (
    <div className="grassroots-event-links">
      <div className="grassroots-event-links-header">
        <Label>Links</Label>
        <button
          type="button"
          onClick={() => updateRows([...rows, { id: `event_link_${Date.now()}`, url: "" }])}
          className="grassroots-link-add-button"
        >
          <I.Plus /> Add link
        </button>
      </div>
      <div className="grassroots-event-links-list">
        {rows.map((row, index) => {
          const safeHref = getSafeEventLinkHref(row.url);
          return (
            <div key={row.id || index} className="grassroots-event-link-row">
              <div className="grassroots-event-link-url">
                <input
                  value={row.url || ""}
                  onChange={(event) => updateRow(index, "url", event.target.value)}
                  placeholder="Paste link"
                  style={{ ...INPUT_STYLE, background: C.bg, paddingRight: safeHref ? 86 : 12 }}
                />
                {safeHref && (
                  <a href={safeHref} target="_blank" rel="noreferrer" className="grassroots-event-link-open" title="Open link" aria-label="Open link">
                    <I.Link /> Open
                  </a>
                )}
              </div>
              <button
                type="button"
                onClick={() => removeRow(index)}
                className="grassroots-link-remove-button"
                aria-label="Remove link"
                title="Remove link"
              >
                <I.X />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TargetEditor({ draft, categoryConfig, saving, activities = [], attachmentsByActivity = {}, canLog = false, onChange, onSave, onCancel, onDelete, onLog, onPreviewAttachment, previewingAttachmentId }) {
  const categoryId = categoryConfig.id;
  const changeStatus = (value) => {
    const status = normalizeGrassrootsStatus(value);
    onChange("status", status);
    if (status === "abandoned") onChange("is_active", false);
    else if (normalizeGrassrootsStatus(draft.status) === "abandoned") onChange("is_active", true);
  };
  const applyPlaceAddress = (parts) => {
    Object.entries(parts || {}).forEach(([key, value]) => onChange(key, value || ""));
  };
  const applyBusinessPlace = (parts) => {
    Object.entries(parts || {}).forEach(([key, value]) => {
      if (["name", "contact_phone", "website"].includes(key)) return;
      if (["business_category", "drop_category"].includes(key)) return;
      onChange(key, value || "");
    });
    if (parts?.name) onChange("name", parts.name);
    const inferredCategory = String(parts?.business_category || parts?.drop_category || "").trim();
    if (inferredCategory && usesBusinessCategoryColumn(categoryConfig)) {
      onChange("business_category", inferredCategory);
      onChange("drop_category", inferredCategory);
    }
    if (parts?.contact_phone && !String(draft.contact_phone || "").trim()) onChange("contact_phone", parts.contact_phone);
    if (parts?.website) {
      const existingDetails = draft.details && typeof draft.details === "object" ? draft.details : {};
      const currentLinks = normalizeGrassrootsEventLinks(draft);
      const hasWebsiteLink = currentLinks.some((link) => String(link.url || "").trim() === parts.website);
      if (!hasWebsiteLink) {
        onChange("details", {
          ...existingDetails,
          links: [
            ...currentLinks,
            { id: `business_link_${Date.now()}`, label: "Website", url: parts.website },
          ],
        });
      }
    }
  };

  return (
    <Card style={{ padding: 0, overflow: "visible", position: "relative", border: `1.5px solid ${C.pri}30`, boxShadow: "0 16px 40px rgba(20,83,45,0.10)", animation: "grassrootsComposerIn 0.38s cubic-bezier(0.16,1,0.3,1)" }}>
      <div style={{ padding: "16px 18px", borderBottom: `1px solid ${C.borderLight}`, background: `linear-gradient(135deg, ${C.priLt} 0%, #fff 70%)` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 900, color: C.pri, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {draft.isDraft ? `New ${categoryConfig.singular}` : `Edit ${categoryConfig.singular}`}
            </div>
            <div style={{ marginTop: 4, fontSize: 13, color: C.textMut }}>
              Save collapses this into the tracker row.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn variant="ghost" size="sm" onClick={onCancel}>Cancel</Btn>
            <Btn variant="primary" size="sm" onClick={onSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Btn>
          </div>
        </div>
      </div>
      <div className="grassroots-target-inline-body">
        <div className="grassroots-target-form-grid">
          <FormSection title={categoryConfig.singular}>
            <div className="grassroots-event-field-grid">
              <GooglePlacesBusinessInput
                label={categoryConfig.nameLabel}
                value={draft.name}
                onChange={(value) => onChange("name", value)}
                onPlaceSelect={applyBusinessPlace}
                placeholder={categoryId === "apartments" ? "Search apartment complex" : "Search business"}
              />
              {categoryConfig.usesStatus !== false && <StatusPicker value={draft.status || "identified"} onChange={changeStatus} />}
              {categoryId !== "events" && <ActiveToggle value={draft.is_active !== false} onChange={(value) => onChange("is_active", value)} />}
              {usesBusinessCategoryColumn(categoryConfig) && (
                <FieldEditor
                  field={{ key: "business_category", label: "Category", type: "select", options: GRASSROOTS_BUSINESS_CATEGORY_OPTIONS, allowCustom: true, placeholder: "Category" }}
                  value={draft.business_category || draft.drop_category}
                  onChange={(value) => {
                    onChange("business_category", value);
                    onChange("drop_category", value);
                  }}
                />
              )}
            </div>
          </FormSection>

          <FormSection title="Address">
            <div className="grassroots-event-field-grid">
              <SplitAddressFields
                draft={draft}
                onChange={onChange}
                onPlaceSelect={applyPlaceAddress}
                placeholder={categoryId === "apartments" ? "Apartment address" : "Business address"}
              />
            </div>
          </FormSection>

          <FormSection title="Contact">
            <div className="grassroots-event-field-grid">
              <FieldEditor field={{ key: "first_name", label: "Contact Name", placeholder: "Contact name" }} value={draft.first_name} onChange={(value) => onChange("first_name", value)} />
              <FieldEditor field={{ key: "last_name", label: "Last Name", placeholder: "Last name" }} value={draft.last_name} onChange={(value) => onChange("last_name", value)} />
              <FieldEditor field={{ key: "contact_source", label: "Contact Source", placeholder: "Contact source" }} value={draft.contact_source} onChange={(value) => onChange("contact_source", value)} />
              <FieldEditor field={{ key: "contact_email", label: "Contact Email", type: "email", placeholder: "Contact email" }} value={draft.contact_email} onChange={(value) => onChange("contact_email", value)} />
              <FieldEditor field={{ key: "contact_phone", label: "Contact Number", placeholder: "Contact number" }} value={draft.contact_phone} onChange={(value) => onChange("contact_phone", value)} />
            </div>
          </FormSection>

          <FormSection title="Notes">
            <div className="grassroots-event-field-grid">
              {categoryId === "corporatePartnerships" && (
                <>
                  <FieldEditor field={{ key: "us_employees", label: "US Employees", type: "number", placeholder: "Number of US employees" }} value={draft.us_employees} onChange={(value) => onChange("us_employees", value)} />
                  <FieldEditor field={{ key: "local_employees", label: "Local Employees", type: "number", placeholder: "Number of local employees" }} value={draft.local_employees} onChange={(value) => onChange("local_employees", value)} />
                </>
              )}
              {categoryId !== "drops" && (
                <>
                  <FieldEditor field={{ key: "initial_contact_date", label: "Initial Contact Date", type: "date" }} value={draft.initial_contact_date} onChange={(value) => onChange("initial_contact_date", value)} />
                  <FieldEditor field={{ key: "last_contact_date", label: "Last Contact Date", type: "date" }} value={draft.last_contact_date} onChange={(value) => onChange("last_contact_date", value)} />
                </>
              )}
              <FieldEditor
                field={{ key: "proposal", label: categoryId === "drops" ? "Notes" : "Proposal", type: "textarea", placeholder: categoryId === "drops" ? "Notes about this business" : "Proposal or partnership notes" }}
                value={draft.proposal}
                onChange={(value) => onChange("proposal", value)}
              />
            </div>
            <EventLinksEditor draft={draft} onChange={onChange} />
            {!draft.isDraft && (
              <div className="grassroots-event-commentary">
                <div className="grassroots-event-commentary-header">
                  <Label>{categoryId === "drops" ? "Drops" : "Developments"}</Label>
                  <button type="button" onClick={onLog} disabled={!canLog || !onLog} className="grassroots-comment-add-button">
                    <I.MessageSquare /> {categoryConfig.logLabel}
                  </button>
                </div>
                <ActivityList
                  activities={activities}
                  categoryConfig={categoryConfig}
                  attachmentsByActivity={attachmentsByActivity}
                  onPreviewAttachment={onPreviewAttachment}
                  previewingAttachmentId={previewingAttachmentId}
                />
              </div>
            )}
          </FormSection>
        </div>
      </div>
      {!draft.isDraft && (
        <div style={{ padding: "12px 18px 16px", borderTop: `1px solid ${C.borderLight}`, display: "flex", justifyContent: "flex-end" }}>
          <Btn variant="ghost" size="sm" icon={<I.Trash />} onClick={onDelete} style={{ color: C.dan }}>
            Delete
          </Btn>
        </div>
      )}
    </Card>
  );
}

function FormSection({ title, children }) {
  return (
    <section className="grassroots-event-form-section">
      <div style={{ fontSize: 12, fontWeight: 900, color: C.pri, textTransform: "uppercase", marginBottom: 12 }}>
        {title}
      </div>
      {children}
    </section>
  );
}

function EventTargetInlineEditor({ draft, saving, activities = [], attachmentsByActivity = {}, canLog = false, onChange, onSave, onCancel, onDelete, onLog, onPreviewAttachment, previewingAttachmentId }) {
  const changeStatus = (value) => {
    const status = normalizeGrassrootsStatus(value);
    onChange("status", status);
    onChange("is_active", status === "abandoned" ? false : true);
  };
  const applyPlaceAddress = (parts) => {
    Object.entries(parts || {}).forEach(([key, value]) => onChange(key, value || ""));
  };
  const cpl = fmtCurrencyNumber(calculateGrassrootsCpl(draft.cost, draft.leads_captured)) || "";

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  return (
    <div className="grassroots-event-inline-editor">
        <div className="grassroots-event-inline-header">
          <div>
            <div style={{ fontSize: 11, fontWeight: 900, color: C.pri, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {draft.isDraft ? "New Event" : "Edit Event"}
            </div>
            <div style={{ marginTop: 3, fontSize: 13, color: C.textMut }}>
              {draft.isDraft ? "Create and return to the tracker" : "Update the event without leaving the tracker"}
            </div>
          </div>
          <button type="button" onClick={onCancel} aria-label="Close event editor" title="Close" className="grassroots-event-inline-close">
            <I.X />
          </button>
        </div>
        <div className="grassroots-event-inline-body">
        <div className="grassroots-event-form-grid">
          <FormSection title="Event">
            <div className="grassroots-event-field-grid">
              <FieldEditor
                field={{ key: "name", label: "Event", placeholder: "Event name" }}
                value={draft.name}
                onChange={(value) => onChange("name", value)}
              />
              <StatusPicker value={draft.status || "identified"} onChange={changeStatus} />
              <SplitAddressFields
                draft={draft}
                onChange={onChange}
                onPlaceSelect={applyPlaceAddress}
                placeholder="Event address"
              />
              <div className="grassroots-event-wide-field">
                <EventDateEditor draft={draft} onChange={onChange} />
              </div>
              <EventTypePicker value={draft.event_type} onChange={(value) => onChange("event_type", value)} />
            </div>
          </FormSection>

          <FormSection title="Organizer">
            <div className="grassroots-event-field-grid">
              <FieldEditor field={{ key: "organizer", label: "Organizer", placeholder: "Organizer" }} value={draft.organizer} onChange={(value) => onChange("organizer", value)} />
              <FieldEditor field={{ key: "first_name", label: "Contact Name", placeholder: "Contact name" }} value={draft.first_name} onChange={(value) => onChange("first_name", value)} />
              <FieldEditor field={{ key: "contact_email", label: "Contact Email", type: "email", placeholder: "Contact email" }} value={draft.contact_email} onChange={(value) => onChange("contact_email", value)} />
              <FieldEditor field={{ key: "contact_phone", label: "Contact Number", placeholder: "Contact number" }} value={draft.contact_phone} onChange={(value) => onChange("contact_phone", value)} />
            </div>
          </FormSection>

          <FormSection title="Reporting">
            <div className="grassroots-event-field-grid">
              <FieldEditor field={{ key: "expected_audience", label: "Expected Audience", type: "number", placeholder: "Expected audience" }} value={draft.expected_audience} onChange={(value) => onChange("expected_audience", value)} />
              <FieldEditor field={{ key: "leads_captured", label: "Leads Captured", type: "number", placeholder: "Leads captured" }} value={draft.leads_captured} onChange={(value) => onChange("leads_captured", value)} />
              <FieldEditor field={{ key: "cost", label: "Cost", type: "number", placeholder: "Cost" }} value={draft.cost} onChange={(value) => onChange("cost", value)} />
              <FieldEditor field={{ key: "cpl", label: "CPL", type: "computed", placeholder: "-" }} value={cpl || "-"} onChange={() => {}} />
            </div>
          </FormSection>

          <FormSection title="Notes">
            <FieldEditor
              field={{ key: "proposal", label: "Notes", type: "textarea", placeholder: "Notes about this event" }}
              value={draft.proposal}
              onChange={(value) => onChange("proposal", value)}
            />
            <EventLinksEditor draft={draft} onChange={onChange} />
            {!draft.isDraft && (
              <div className="grassroots-event-commentary">
                <div className="grassroots-event-commentary-header">
                  <Label>Comments</Label>
                  <button type="button" onClick={onLog} disabled={!canLog} className="grassroots-comment-add-button">
                    <I.MessageSquare /> Log comment
                  </button>
                </div>
                <ActivityList
                  activities={activities}
                  categoryConfig={getGrassrootsCategoryConfig("events")}
                  attachmentsByActivity={attachmentsByActivity}
                  onPreviewAttachment={onPreviewAttachment}
                  previewingAttachmentId={previewingAttachmentId}
                />
              </div>
            )}
          </FormSection>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", paddingTop: 18, borderTop: `1px solid ${C.borderLight}` }}>
          <div>
            {!draft.isDraft && (
              <Btn variant="ghost" size="sm" icon={<I.Trash />} onClick={onDelete} style={{ color: C.dan }}>
                Delete
              </Btn>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
            <Btn variant="primary" onClick={onSave} disabled={saving}>
              {saving ? "Saving..." : "Save Event"}
            </Btn>
          </div>
        </div>
        </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const colors = {
    identified: C.info,
    corresponding: "#7C3AED",
    booked: C.suc,
    abandoned: C.dan,
  };
  const normalizedStatus = normalizeGrassrootsStatus(status);
  const color = colors[normalizedStatus] || C.textMut;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", padding: "4px 10px", borderRadius: 10, background: `${color}12`, color, border: `1px solid ${color}30`, fontSize: 11, fontWeight: 900 }}>
      {getGrassrootsStatusLabel(normalizedStatus)}
    </span>
  );
}

function BusinessCategoryBadge({ value }) {
  const label = value || "Uncategorized";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", width: "fit-content", padding: "4px 10px", borderRadius: 10, background: value ? C.priLt : C.bg, color: value ? C.pri : C.textMut, border: `1px solid ${value ? `${C.pri}30` : C.borderLight}`, fontSize: 11, fontWeight: 900 }}>
      {label}
    </span>
  );
}

function FilterIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

function HistoryList({ items, emptyText = "No history yet." }) {
  const rows = [...(items || [])].sort(compareGrassrootsHistoryDesc);
  if (rows.length === 0) {
    return <div style={{ fontSize: 12, color: C.textMut }}>{emptyText}</div>;
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      {rows.map((entry) => (
        <div key={entry.id} style={{ display: "grid", gridTemplateColumns: "112px minmax(0, 1fr) 190px", gap: 10, alignItems: "start", fontSize: 12 }}>
          <div style={{ display: "inline-flex", width: "fit-content", padding: "4px 8px", borderRadius: 8, background: C.priLt, color: C.pri, fontWeight: 900 }}>
            {historyEventLabel(entry.event_type)}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: C.text, fontWeight: 800, lineHeight: 1.4, wordBreak: "break-word" }}>
              {entry.summary || historyEventLabel(entry.event_type)}
            </div>
            <div style={{ marginTop: 3, color: C.textMut, lineHeight: 1.35 }}>
              {entry.target_name || "Untitled row"} · {historyActorName(entry)}
            </div>
          </div>
          <div style={{ color: C.textMut, fontWeight: 800, textAlign: "right" }}>
            {fmtDateTime(entry.event_at || entry.created_at)}
          </div>
        </div>
      ))}
    </div>
  );
}

function HistoryPanel({ items, categoryConfig }) {
  return (
    <Card style={{ padding: 0, borderRadius: 14, overflow: "hidden", marginBottom: 14 }}>
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.borderLight}`, background: C.bg, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 900, color: C.pri, textTransform: "uppercase", letterSpacing: "0.08em" }}>History</div>
          <div style={{ fontSize: 13, color: C.textMut, marginTop: 2 }}>{categoryConfig.label}</div>
        </div>
        <div style={{ fontSize: 12, fontWeight: 900, color: C.text }}>{items.length}</div>
      </div>
      <div style={{ padding: 16, maxHeight: 360, overflow: "auto" }}>
        <HistoryList items={items} emptyText="No history for this view yet." />
      </div>
    </Card>
  );
}

function activityActorName(activity) {
  return activity?.created_by_name || "Unknown user";
}

function AttachmentButtons({ attachments = [], onPreview, previewingAttachmentId }) {
  if (!attachments.length) return null;
  return (
    <div className="grassroots-activity-attachments">
      {attachments.map((attachment) => (
        <button
          key={attachment.id || attachment.storage_path}
          type="button"
          className="grassroots-activity-attachment-button"
          onClick={() => onPreview?.(attachment)}
          disabled={previewingAttachmentId === attachment.id}
          title={attachment.file_name || "Attachment"}
        >
          {getGrassrootsAttachmentPreviewKind(attachment) === "image" ? <I.Image /> : <I.FileText />}
          <span>{attachment.file_name || "Attachment"}</span>
          {formatGrassrootsAttachmentFileSize(attachment.file_size_bytes) && (
            <em>{formatGrassrootsAttachmentFileSize(attachment.file_size_bytes)}</em>
          )}
        </button>
      ))}
    </div>
  );
}

function ActivityList({ activities, categoryConfig, attachmentsByActivity = {}, onPreviewAttachment, previewingAttachmentId }) {
  const activityType = getGrassrootsActivityType(categoryConfig.id);
  const rows = [...(activities || [])]
    .filter((activity) => {
      const rowType = activity.activity_type || activityType;
      if (activityType === "development") {
        return ["development", "event_update", "note"].includes(rowType);
      }
      return rowType === activityType;
    })
    .sort((a, b) => String(b.created_at || b.activity_date || "").localeCompare(String(a.created_at || a.activity_date || "")));

  if (rows.length === 0) {
    return <div style={{ fontSize: 12, color: C.textMut }}>No logged {categoryConfig.id === "events" ? "comments" : categoryConfig.countLabel.toLowerCase()} yet.</div>;
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {rows.map((activity) => {
        const personSpokenWith = activity.metadata?.person_spoken_with || activity.metadata?.person_interacted_with || "";
        const materialsLeft = activity.metadata?.materials_left || "";
        const attachments = attachmentsByActivity[activity.id] || [];
        return (
          <div
            key={activity.id}
            style={{
              display: "grid",
              gridTemplateColumns: "112px minmax(0, 1fr) 190px",
              gap: 10,
              alignItems: "start",
              fontSize: 12,
            }}
          >
            <div style={{ display: "inline-flex", width: "fit-content", padding: "4px 8px", borderRadius: 8, background: C.priLt, color: C.pri, fontWeight: 900 }}>
              {categoryConfig.id === "events" ? "Comment" : activityType === "drop" ? "Drop" : "Development"}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: C.text, fontWeight: 800, lineHeight: 1.45, wordBreak: "break-word", whiteSpace: "pre-wrap" }}>
                {activity.notes || "No notes entered."}
              </div>
              <div style={{ marginTop: 5, display: "flex", flexWrap: "wrap", gap: 8, color: C.textMut, lineHeight: 1.35 }}>
                <span>{fmtDate(activity.activity_date)} · {activityActorName(activity)}</span>
                {personSpokenWith && <span>Spoke with {personSpokenWith}</span>}
                {materialsLeft && <span>Left {materialsLeft}</span>}
                {activity.next_contact_date && <span>Next: {fmtDate(activity.next_contact_date)}</span>}
              </div>
              <AttachmentButtons attachments={attachments} onPreview={onPreviewAttachment} previewingAttachmentId={previewingAttachmentId} />
            </div>
            <div style={{ color: C.textMut, fontWeight: 800, textAlign: "right" }}>
              {fmtDateTime(activity.created_at)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EventDateSortHeader({ direction, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={`Sort event dates ${direction === "asc" ? "latest first" : "next event first"}`}
      style={{
        ...HEADER_CELL_STYLE,
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        border: "none",
        background: "transparent",
        padding: 0,
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      <span>Event Date</span>
      {direction === "asc" ? <I.SortAsc /> : <I.SortDesc />}
    </button>
  );
}

function TrackerHeader({ categoryConfig, eventDateSortDirection, onToggleEventDateSort }) {
  const gridColumns = getTrackerGridColumns(categoryConfig);
  return (
    <div style={{ display: "grid", gridTemplateColumns: gridColumns, alignItems: "center", gap: 10, padding: "0 14px 0", minHeight: 22, boxSizing: "border-box" }}>
      <div />
      <div style={HEADER_CELL_STYLE}>{categoryConfig.nameLabel}</div>
      {usesBusinessCategoryColumn(categoryConfig) && <div style={HEADER_CELL_STYLE}>Category</div>}
      {categoryConfig.usesStatus !== false && <div style={HEADER_CELL_STYLE}>Status</div>}
      {categoryConfig.id === "events" && <EventDateSortHeader direction={eventDateSortDirection} onToggle={onToggleEventDateSort} />}
      {categoryConfig.id !== "events" && <div style={HEADER_CELL_STYLE}>{categoryConfig.id === "drops" ? "Next Drop" : "Next Contact"}</div>}
      {categoryConfig.id !== "events" && <div style={{ ...HEADER_CELL_STYLE, textAlign: "center" }}>{categoryConfig.countLabel}</div>}
      <div style={{ ...HEADER_CELL_STYLE, textAlign: "left" }}>Actions</div>
    </div>
  );
}

const HEADER_CELL_STYLE = {
  fontSize: 10,
  fontWeight: 900,
  color: C.textMut,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  whiteSpace: "nowrap",
};

function TrackerRow({ target, index, categoryConfig, activities, attachmentsByActivity = {}, isExpanded, isFresh = false, canLog, canEdit, onToggleUpdates, onLog, onMove, onEdit, onPreviewAttachment, previewingAttachmentId }) {
  const activityCount = getGrassrootsActivityCount(target, { [target.id]: activities });
  const nextDate = getGrassrootsNextDate(target, { [target.id]: activities });
  const gridColumns = getTrackerGridColumns(categoryConfig);
  const title = target.name || categoryConfig.emptyName;
  const meta = [
    target.address,
    [target.first_name, target.last_name].filter(Boolean).join(" "),
    target.contact_source,
    getGrassrootsPrimaryEventDate(target) ? `Event ${fmtDate(getGrassrootsPrimaryEventDate(target))}` : "",
  ].filter(Boolean).slice(0, 2).join(" • ");

  return (
    <Card style={{ padding: 0, overflow: "hidden", borderRadius: 12, position: "relative", animation: isFresh ? "grassrootsFreshRow 1.8s ease-out both" : undefined }}>
      <div style={{ display: "grid", gridTemplateColumns: gridColumns, alignItems: "center", gap: 10, padding: "10px 14px", minHeight: 58, boxSizing: "border-box" }}>
        <div style={{ width: 30, height: 30, borderRadius: 10, display: "grid", placeItems: "center", background: target.is_active === false ? C.bg : C.pri, color: target.is_active === false ? C.textMut : "#fff", fontSize: 12, fontWeight: 900 }}>
          {index + 1}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 900, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
          <div style={{ marginTop: 3, fontSize: 11, color: C.textMut, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{meta || categoryConfig.singular}</div>
        </div>
        {usesBusinessCategoryColumn(categoryConfig) && <BusinessCategoryBadge value={getGrassrootsBusinessCategory(target)} />}
        {categoryConfig.usesStatus !== false && <StatusBadge status={target.status} />}
        {categoryConfig.id === "events" && <EventDateCell target={target} />}
        {categoryConfig.id !== "events" && (
          <div style={{ fontSize: 12, fontWeight: 800, color: nextDate ? (nextDate < todayStr() ? C.dan : C.text) : C.textMut }}>
            {fmtDate(nextDate)}
          </div>
        )}
        {categoryConfig.id !== "events" && (
          <div style={{ display: "flex", justifyContent: "center" }}>
            <button
              type="button"
              onClick={onToggleUpdates}
              title={`${activityCount} ${categoryConfig.countLabel.toLowerCase()}; click for logged ${categoryConfig.countLabel.toLowerCase()}`}
              style={{ width: 32, height: 32, borderRadius: 10, border: "none", background: activityCount > 0 ? C.pri : C.bg, color: activityCount > 0 ? "#fff" : C.textMut, fontSize: 13, fontWeight: 900, cursor: "pointer", fontFamily: "inherit" }}
            >
              {activityCount}
            </button>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-start", gap: 6, flexWrap: "wrap" }}>
          {categoryConfig.id !== "events" && <Btn variant="secondary" size="sm" onClick={onLog} disabled={!canLog}>{categoryConfig.id === "drops" ? "Log Activity" : categoryConfig.logLabel}</Btn>}
          <Btn variant="ghost" size="sm" icon={<I.ChevronRight />} onClick={onMove} disabled={!canEdit}>Move</Btn>
          <Btn variant="ghost" size="sm" icon={<I.Edit />} onClick={onEdit} disabled={!canEdit}>Edit</Btn>
        </div>
      </div>
      {isExpanded && (
        <div style={{ borderTop: `1px solid ${C.borderLight}`, padding: "12px 18px", background: C.bg }}>
          <ActivityList
            activities={activities}
            categoryConfig={categoryConfig}
            attachmentsByActivity={attachmentsByActivity}
            onPreviewAttachment={onPreviewAttachment}
            previewingAttachmentId={previewingAttachmentId}
          />
        </div>
      )}
    </Card>
  );
}

function DropSubviewTabs({ value, onChange, activityCount, businessCount }) {
  const options = [
    { value: "activity", label: "Activity", count: activityCount },
    { value: "businesses", label: "Businesses", count: businessCount },
  ];
  return (
    <div className="grassroots-drop-subview-tabs" role="tablist" aria-label="Drop views">
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            className={active ? "grassroots-drop-subview-tab is-active" : "grassroots-drop-subview-tab"}
            onClick={() => onChange(option.value)}
          >
            <span>{option.label}</span>
            <em>{option.count}</em>
          </button>
        );
      })}
    </div>
  );
}

function DropActivityView({ rows, canLog, onLog, onPreviewAttachment, previewingAttachmentId, freshActivityId }) {
  if (rows.length === 0) {
    return (
      <Card style={{ padding: 30, textAlign: "center", color: C.textMut, borderRadius: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 900, color: C.text, marginBottom: 6 }}>No drop activity logged yet</div>
        <div style={{ fontSize: 13, marginBottom: 16 }}>Log the visit first; the business rollup updates from that activity.</div>
        <Btn variant="primary" icon={<I.Plus />} onClick={() => onLog()} disabled={!canLog}>Log Activity</Btn>
      </Card>
    );
  }

  return (
    <Card style={{ padding: 0, overflow: "hidden", borderRadius: 14 }}>
      <div className="grassroots-drop-activity-header">
        <div>Date</div>
        <div>Business</div>
        <div>Visit Details</div>
        <div>Next</div>
      </div>
      <div className="grassroots-drop-activity-list">
        {rows.map((row) => (
          <div
            key={row.id}
            className={`grassroots-drop-activity-row${freshActivityId === row.id ? " is-fresh" : ""}`}
          >
            <div className="grassroots-drop-activity-date">
              <strong>{fmtDate(row.activityDate)}</strong>
              <span>{fmtDateTime(row.createdAt)}</span>
            </div>
            <div className="grassroots-drop-activity-business">
              <strong>{row.businessName}</strong>
              <span>{[row.businessCategory, row.businessAddress].filter(Boolean).join(" · ") || "Drop business"}</span>
            </div>
            <div className="grassroots-drop-activity-notes">
              <div className="grassroots-drop-activity-meta">
                {row.personSpokenWith && <span>Spoke with {row.personSpokenWith}</span>}
                {row.materialsLeft && <span>Left {row.materialsLeft}</span>}
                {row.outcome && <span>{row.outcome}</span>}
                {row.followUpPriority && <span className="is-hot">Follow-up</span>}
                {row.partnershipPotential && <span className="is-potential">Partnership potential</span>}
              </div>
              <p>{row.notes || "No notes entered."}</p>
              <AttachmentButtons attachments={row.attachments} onPreview={onPreviewAttachment} previewingAttachmentId={previewingAttachmentId} />
              <div className="grassroots-drop-activity-actor">Logged by {row.loggedBy}</div>
            </div>
            <div className="grassroots-drop-activity-next">
              <strong>{fmtDate(row.nextDropDate)}</strong>
              {row.target && <Btn variant="secondary" size="sm" onClick={() => onLog(row.target)} disabled={!canLog}>Log Again</Btn>}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function LogActivityModal({
  logModal,
  businessQuery,
  selectedTarget,
  businessDraft,
  internalOptions,
  notes,
  activityDate,
  nextDate,
  contactName,
  materialsLeft,
  outcome,
  followUpPriority,
  partnershipPotential,
  files,
  fileErrors,
  saving,
  fileInputRef,
  attachmentsSchemaMissing,
  onBusinessQueryChange,
  onInternalBusinessSelect,
  onGoogleBusinessSelect,
  onActivityDateChange,
  onNextDateChange,
  onContactNameChange,
  onMaterialsLeftChange,
  onOutcomeChange,
  onNotesChange,
  onFollowUpPriorityChange,
  onPartnershipPotentialChange,
  onFileChange,
  onRemoveFile,
  onClose,
  onSave,
}) {
  const isDropLog = (logModal?.category || getGrassrootsCategoryConfig(logModal?.target?.category).id) === "drops";
  const selectedSummary = selectedTarget
    ? [getGrassrootsBusinessCategory(selectedTarget), selectedTarget.address].filter(Boolean).join(" · ")
    : businessDraft
      ? [getGrassrootsBusinessCategory(businessDraft), businessDraft.address].filter(Boolean).join(" · ")
      : "";

  return (
    <Modal title={isDropLog ? "Log Drop Activity" : getGrassrootsCategoryConfig(logModal?.target?.category).id === "events" ? "Log Event Comment" : "Log Development"} onClose={saving ? () => {} : onClose} wide>
      <div className="grassroots-log-modal">
        {isDropLog && (
          <section className="grassroots-log-section">
            <div className="grassroots-log-section-title">Business</div>
            {logModal?.target ? (
              <div className="grassroots-log-selected-business">
                <strong>{logModal.target.name || "Drop business"}</strong>
                <span>{selectedSummary || "Existing K9 business"}</span>
              </div>
            ) : (
              <GooglePlacesBusinessInput
                label="Business"
                value={businessQuery}
                onChange={onBusinessQueryChange}
                onPlaceSelect={onGoogleBusinessSelect}
                internalOptions={internalOptions}
                onInternalSelect={onInternalBusinessSelect}
                internalLabel="K9 businesses"
                googleLabel={internalOptions.length > 0 ? "Create new from Google Places" : "Google Places"}
                placeholder="Search K9 businesses first, then Google"
              />
            )}
            {!logModal?.target && selectedSummary && (
              <div className="grassroots-log-selected-business is-compact">
                <I.CheckCircle />
                <span>{selectedSummary}</span>
              </div>
            )}
          </section>
        )}

        {isDropLog && (
          <section className="grassroots-log-section">
            <div className="grassroots-log-section-title">Visit</div>
            <div className="grassroots-log-grid">
              <div>
                <Label>Activity Date</Label>
                <MiniDatePicker
                  value={activityDate}
                  onChange={onActivityDateChange}
                  recommendedDate={todayStr()}
                  recommendedHint="Use today unless you are backfilling field notes."
                />
              </div>
              <label>
                <Label>Who did you speak with?</Label>
                <input
                  value={contactName}
                  onChange={(event) => onContactNameChange(event.target.value)}
                  placeholder="Person's name"
                  style={INPUT_STYLE}
                  autoFocus={Boolean(logModal?.target)}
                />
              </label>
              <label>
                <Label>Materials Left</Label>
                <input
                  value={materialsLeft}
                  onChange={(event) => onMaterialsLeftChange(event.target.value)}
                  placeholder="Rack cards, flyers, business cards"
                  style={INPUT_STYLE}
                />
              </label>
              <label>
                <Label>Outcome</Label>
                <input
                  value={outcome}
                  onChange={(event) => onOutcomeChange(event.target.value)}
                  placeholder="Warm intro, left with front desk"
                  style={INPUT_STYLE}
                />
              </label>
            </div>
            <div className="grassroots-log-flag-row">
              <button type="button" className={followUpPriority ? "is-active" : ""} onClick={() => onFollowUpPriorityChange(!followUpPriority)}>
                <I.Clock /> Follow-up needed
              </button>
              <button type="button" className={partnershipPotential ? "is-active" : ""} onClick={() => onPartnershipPotentialChange(!partnershipPotential)}>
                <I.Sparkle /> Partnership potential
              </button>
            </div>
          </section>
        )}

        <section className="grassroots-log-section">
          <div className="grassroots-log-section-title">{isDropLog ? "Notes and Next Step" : "Update"}</div>
          <textarea
            value={notes}
            onChange={(event) => onNotesChange(event.target.value)}
            placeholder={isDropLog ? "What happened during this visit?" : "Comment or development..."}
            rows={4}
            style={{ ...INPUT_STYLE, minHeight: 108, resize: "vertical" }}
            autoFocus={!isDropLog}
          />
          <div style={{ marginTop: 12 }}>
            <Label>{isDropLog ? "Next Drop Date" : "Follow-Up Date Optional"}</Label>
            <MiniDatePicker
              value={nextDate}
              onChange={onNextDateChange}
              recommendedDate={addDays(todayStr(), isDropLog ? 28 : 2)}
              recommendedHint={isDropLog ? "Recommended: +4 weeks unless they gave a specific return date." : "Optional: set only if this needs follow-up."}
            />
          </div>
        </section>

        {isDropLog && (
          <section className="grassroots-log-section">
            <div className="grassroots-log-section-title">Photos and Attachments</div>
            {attachmentsSchemaMissing && (
              <div className="grassroots-log-warning">Attachment storage migration has not been applied in this Supabase environment yet.</div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={GRASSROOTS_ACTIVITY_ATTACHMENT_ACCEPT}
              onChange={onFileChange}
              style={{ display: "none" }}
            />
            <div className="grassroots-log-attachments-toolbar">
              <Btn
                variant="secondary"
                size="sm"
                icon={<I.Camera />}
                onClick={() => fileInputRef.current?.click()}
                disabled={files.length >= GRASSROOTS_ACTIVITY_ATTACHMENT_MAX_FILES || attachmentsSchemaMissing}
              >
                Add Photo/File
              </Btn>
              <span>{files.length === 0 ? "Attach business cards, photos, or PDFs." : `${files.length} pending attachment${files.length === 1 ? "" : "s"}`}</span>
            </div>
            {files.length > 0 && (
              <div className="grassroots-log-pending-files">
                {files.map((file, index) => (
                  <span key={`${file.name}-${index}`}>
                    {inferGrassrootsActivityAttachmentMimeType(file).startsWith("image/") ? <I.Image /> : <I.FileText />}
                    <strong>{file.name}</strong>
                    <em>{formatGrassrootsAttachmentFileSize(file.size)}</em>
                    <button type="button" onClick={() => onRemoveFile(index)} aria-label={`Remove ${file.name}`}><I.X /></button>
                  </span>
                ))}
              </div>
            )}
            {fileErrors.length > 0 && <div className="grassroots-log-errors">{fileErrors.join(" ")}</div>}
          </section>
        )}

        <div className="grassroots-log-actions">
          <Btn variant="ghost" onClick={onClose} disabled={saving}>Cancel</Btn>
          <Btn variant="primary" onClick={onSave} disabled={saving}>{saving ? "Saving..." : "Save Activity"}</Btn>
        </div>
      </div>
    </Modal>
  );
}

function MetricCard({ label, value, color }) {
  return (
    <Card style={{ padding: 16, borderRadius: 12 }}>
      <div style={{ fontSize: 11, color: C.textMut, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 900, color }}>{value}</div>
    </Card>
  );
}

function filterNeedsValue(op) {
  return !["empty", "notEmpty", "overdue", "today", "thisWeek", "hasDate", "noDate"].includes(op);
}

export default function GrassrootsPage({ profile, addGlobalToast = () => {} }) {
  const locationId = profile?.location_id || "";
  const canLogActivity = hasLeanPermission(profile, "Grassroots Log Activity");
  const canEditTargets = hasLeanPermission(profile, "Grassroots Edit Targets");
  const actor = useMemo(() => ({
    userId: normalizeOptionalUuid(profile?.user_id || profile?.id),
    name: profile?.name || profile?.full_name || profile?.email || "Staff",
  }), [profile?.email, profile?.full_name, profile?.id, profile?.name, profile?.user_id]);

  const [loading, setLoading] = useState(true);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [saveState, setSaveState] = useState("idle");
  const [activeCategory, setActiveCategory] = useState("events");
  const [dropSubview, setDropSubview] = useState("activity");
  const [eventDateSortDirection, setEventDateSortDirection] = useState("asc");
  const [targets, setTargets] = useState([]);
  const [activities, setActivities] = useState([]);
  const [activityAttachments, setActivityAttachments] = useState([]);
  const [attachmentsSchemaMissing, setAttachmentsSchemaMissing] = useState(false);
  const [history, setHistory] = useState([]);
  const [newDraft, setNewDraft] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [expandedUpdates, setExpandedUpdates] = useState(new Set());
  const [logModal, setLogModal] = useState(null);
  const [movePopover, setMovePopover] = useState(null);
  const [logNotes, setLogNotes] = useState("");
  const [logDate, setLogDate] = useState("");
  const [logActivityDate, setLogActivityDate] = useState(todayStr());
  const [logContactName, setLogContactName] = useState("");
  const [logBusinessQuery, setLogBusinessQuery] = useState("");
  const [logSelectedTarget, setLogSelectedTarget] = useState(null);
  const [logBusinessDraft, setLogBusinessDraft] = useState(null);
  const [logMaterialsLeft, setLogMaterialsLeft] = useState("");
  const [logOutcome, setLogOutcome] = useState("");
  const [logFollowUpPriority, setLogFollowUpPriority] = useState(false);
  const [logPartnershipPotential, setLogPartnershipPotential] = useState(false);
  const [logFiles, setLogFiles] = useState([]);
  const [logFileErrors, setLogFileErrors] = useState([]);
  const [savingLog, setSavingLog] = useState(false);
  const [freshActivityId, setFreshActivityId] = useState(null);
  const [attachmentPreview, setAttachmentPreview] = useState(null);
  const [previewingAttachmentId, setPreviewingAttachmentId] = useState(null);
  const [freshTargetId, setFreshTargetId] = useState(null);
  const [filters, setFilters] = useState(() => getGrassrootsDefaultFilters("events"));
  const [draftFilters, setDraftFilters] = useState(() => getGrassrootsDefaultFilters("events"));
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [showFilterPicker, setShowFilterPicker] = useState(false);
  const [configuringFilterKey, setConfiguringFilterKey] = useState(null);
  const [filterPickerReady, setFilterPickerReady] = useState(false);
  const prevFilterOpen = useRef(false);
  const freshTargetTimer = useRef(null);
  const freshActivityTimer = useRef(null);
  const newDraftScrollRef = useRef(null);
  const logFileInputRef = useRef(null);

  const activeConfig = getGrassrootsCategoryConfig(activeCategory);
  const activitiesByTarget = useMemo(() => groupGrassrootsActivities(activities), [activities]);
  const attachmentsByActivity = useMemo(() => groupGrassrootsActivityAttachments(activityAttachments), [activityAttachments]);
  const categoryTargets = useMemo(() => targets.filter((target) => target.category === activeConfig.dbValue), [activeConfig.dbValue, targets]);
  const categoryHistory = useMemo(
    () => history.filter((entry) => entry.category === activeConfig.dbValue).sort(compareGrassrootsHistoryDesc),
    [activeConfig.dbValue, history],
  );
  const visibleTargets = useMemo(
    () => applyGrassrootsFilters(categoryTargets, activitiesByTarget, filters, todayStr()),
    [activitiesByTarget, categoryTargets, filters],
  );
  const sortedVisibleTargets = useMemo(() => {
    if (activeConfig.id !== "events") return visibleTargets;
    const today = todayStr();
    return [...visibleTargets].sort((left, right) => compareGrassrootsEventSchedule(left, right, today, eventDateSortDirection));
  }, [activeConfig.id, eventDateSortDirection, visibleTargets]);
  const eventMetrics = useMemo(() => buildGrassrootsEventMetrics(targets, todayStr()), [targets]);
  const dropMetrics = useMemo(() => buildGrassrootsDropMetrics(targets, activities, todayStr()), [activities, targets]);
  const dropTargets = useMemo(() => targets.filter((target) => getGrassrootsCategoryConfig(target.category).id === "drops"), [targets]);
  const dropActivityRows = useMemo(
    () => buildGrassrootsDropActivityRows(targets, activities, attachmentsByActivity),
    [activities, attachmentsByActivity, targets],
  );
  const logBusinessOptions = useMemo(() => searchGrassrootsDropBusinessTargets({
    targets: dropTargets,
    activitiesByTarget,
    query: logBusinessQuery,
    limit: 5,
  }).map((row) => ({
    ...row,
    subtitle: [
      row.activityCount === 1 ? "1 visit" : `${row.activityCount} visits`,
      row.lastActivityDate ? `Last ${fmtDate(row.lastActivityDate)}` : "No visits yet",
      row.target.address_city || row.target.address || "",
    ].filter(Boolean).join(" · "),
    badge: getGrassrootsBusinessCategory(row.target) || "Business",
  })), [activitiesByTarget, dropTargets, logBusinessQuery]);
  const usedFilterKeys = Object.keys(draftFilters || {});
  const filterFields = useMemo(() => {
    const keyed = new Map();
    const baseFields = activeConfig.id === "drops"
      ? BASE_FILTER_FIELDS.filter((field) => field.key !== "status")
      : BASE_FILTER_FIELDS;
    [...baseFields, ...(CATEGORY_FILTER_FIELDS[activeConfig.id] || [])].forEach((field) => keyed.set(field.key, field));
    return [...keyed.values()];
  }, [activeConfig.id]);
  const availableFilterFields = filterFields.filter((field) => !usedFilterKeys.includes(field.key));
  const filterSections = [...new Set(filterFields.map((field) => field.section))];

  const toast = useCallback((message, type = "success") => {
    addGlobalToast(message, type);
  }, [addGlobalToast]);

  const loadGrassroots = useCallback(async () => {
    if (!locationId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setSchemaMissing(false);
    setAttachmentsSchemaMissing(false);
    const [targetResult, activityResult, historyResult, eventDateResult, attachmentResult] = await Promise.all([
      supabase
        .from("grassroots_targets")
        .select("*")
        .eq("location_id", locationId)
        .order("created_at", { ascending: false }),
      supabase
        .from("grassroots_activity")
        .select("*")
        .eq("location_id", locationId)
        .order("created_at", { ascending: false }),
      supabase
        .from("grassroots_history")
        .select("*")
        .eq("location_id", locationId)
        .order("event_at", { ascending: false }),
      supabase
        .from("grassroots_event_dates")
        .select("*")
        .eq("location_id", locationId)
        .order("event_date", { ascending: true }),
      supabase
        .from("grassroots_activity_attachments")
        .select("*")
        .eq("location_id", locationId)
        .is("deleted_at", null)
        .order("uploaded_at", { ascending: false }),
    ]);

    const eventDateTableMissing = eventDateResult.error?.code === "42P01" || eventDateResult.error?.code === "PGRST205";
    const attachmentTableMissing = attachmentResult.error?.code === "42P01" || attachmentResult.error?.code === "PGRST205";
    if (attachmentTableMissing) setAttachmentsSchemaMissing(true);
    if (targetResult.error || activityResult.error || historyResult.error || (eventDateResult.error && !eventDateTableMissing) || (attachmentResult.error && !attachmentTableMissing)) {
      const error = targetResult.error || activityResult.error || historyResult.error || eventDateResult.error || attachmentResult.error;
      if (error?.code === "42P01" || /grassroots_/.test(error?.message || "")) {
        setSchemaMissing(true);
      } else {
        console.error("Failed to load grassroots tracker", error);
        toast(error.message || "Failed to load grassroots tracker", "error");
      }
      setTargets([]);
      setActivities([]);
      setActivityAttachments([]);
      setHistory([]);
      setLoading(false);
      return;
    }

    const eventDatesByTarget = (eventDateTableMissing ? [] : (eventDateResult.data || [])).reduce((acc, row) => {
      if (!row.target_id) return acc;
      if (!acc[row.target_id]) acc[row.target_id] = [];
      acc[row.target_id].push(row);
      return acc;
    }, {});
    setTargets((targetResult.data || []).map((target) => {
      const status = normalizeGrassrootsStatus(target.status);
      return {
        ...target,
        status,
        is_active: resolveGrassrootsTargetIsActive(status, target.is_active),
        event_type: normalizeGrassrootsEventType(target.event_type) || target.event_type,
        event_dates: eventDatesByTarget[target.id] || normalizeGrassrootsEventDates(target),
      };
    }));
    setActivities((activityResult.data || []).map((row) => ({
      ...row,
      metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
    })));
    setActivityAttachments((attachmentTableMissing ? [] : (attachmentResult.data || [])).map((row) => ({
      ...row,
      metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
    })));
    setHistory(historyResult.data || []);
    setLoading(false);
  }, [locationId, toast]);

  useEffect(() => {
    loadGrassroots();
  }, [loadGrassroots]);

  useEffect(() => () => {
    if (freshTargetTimer.current) window.clearTimeout(freshTargetTimer.current);
    if (freshActivityTimer.current) window.clearTimeout(freshActivityTimer.current);
  }, []);

  useEffect(() => {
    if (!newDraft?.id) return undefined;
    let frameId = 0;
    const timerId = window.setTimeout(() => {
      frameId = window.requestAnimationFrame(() => {
        scrollGrassrootsEditorIntoView(newDraftScrollRef.current);
      });
    }, 60);
    return () => {
      window.clearTimeout(timerId);
      if (frameId) window.cancelAnimationFrame(frameId);
    };
  }, [newDraft?.id]);

  useEffect(() => {
    if (showFilterPanel && !prevFilterOpen.current) {
      setDraftFilters({ ...filters });
      setShowFilterPicker(false);
      setConfiguringFilterKey(null);
    }
    prevFilterOpen.current = showFilterPanel;
  }, [filters, showFilterPanel]);

  useEffect(() => {
    setNewDraft(null);
    setEditDraft(null);
    setExpandedUpdates(new Set());
    const defaults = getGrassrootsDefaultFilters(activeCategory);
    setFilters(defaults);
    setDraftFilters(defaults);
    setShowFilterPanel(false);
    setShowHistoryPanel(false);
    setMovePopover(null);
    setLogModal(null);
    if (activeCategory === "drops") setDropSubview("activity");
  }, [activeCategory]);

  const updateDraft = (key, value) => {
    if (editDraft) {
      setEditDraft((prev) => ({ ...prev, [key]: value }));
    } else {
      setNewDraft((prev) => ({ ...prev, [key]: value }));
    }
  };

  const openNewDraft = () => {
    if (!canEditTargets) {
      toast("You do not have permission to edit grassroots rows", "error");
      return;
    }
    setEditDraft(null);
    setNewDraft(makeBlankGrassrootsTarget(activeCategory));
  };

  const closeEditor = () => {
    setNewDraft(null);
    setEditDraft(null);
  };

  const markFreshTarget = (targetId) => {
    if (!targetId) return;
    if (freshTargetTimer.current) window.clearTimeout(freshTargetTimer.current);
    setFreshTargetId(targetId);
    freshTargetTimer.current = window.setTimeout(() => setFreshTargetId(null), 1800);
  };

  const markFreshActivity = (activityId) => {
    if (!activityId) return;
    if (freshActivityTimer.current) window.clearTimeout(freshActivityTimer.current);
    setFreshActivityId(activityId);
    freshActivityTimer.current = window.setTimeout(() => setFreshActivityId(null), 1800);
  };

  const resetLogForm = () => {
    setLogModal(null);
    setLogNotes("");
    setLogDate("");
    setLogActivityDate(todayStr());
    setLogContactName("");
    setLogBusinessQuery("");
    setLogSelectedTarget(null);
    setLogBusinessDraft(null);
    setLogMaterialsLeft("");
    setLogOutcome("");
    setLogFollowUpPriority(false);
    setLogPartnershipPotential(false);
    setLogFiles([]);
    setLogFileErrors([]);
    setSavingLog(false);
    if (logFileInputRef.current) logFileInputRef.current.value = "";
  };

  const openLogModal = (target = null) => {
    if (!canLogActivity) {
      toast("You do not have permission to log grassroots activity", "error");
      return;
    }
    const category = target ? getGrassrootsCategoryConfig(target.category).id : "drops";
    setMovePopover(null);
    setLogModal({ target, category });
    setLogNotes("");
    setLogDate(category === "drops" ? addDays(todayStr(), 28) : "");
    setLogActivityDate(todayStr());
    setLogContactName("");
    setLogBusinessQuery(target?.name || "");
    setLogSelectedTarget(category === "drops" ? target : null);
    setLogBusinessDraft(null);
    setLogMaterialsLeft("");
    setLogOutcome("");
    setLogFollowUpPriority(false);
    setLogPartnershipPotential(false);
    setLogFiles([]);
    setLogFileErrors([]);
    if (logFileInputRef.current) logFileInputRef.current.value = "";
  };

  const handleLogFileChange = (event) => {
    const incomingFiles = Array.from(event.target.files || []);
    const { acceptedFiles, errors } = validateGrassrootsActivityAttachmentFiles([...logFiles, ...incomingFiles]);
    setLogFiles(acceptedFiles.slice(0, GRASSROOTS_ACTIVITY_ATTACHMENT_MAX_FILES));
    setLogFileErrors(errors);
    if (errors.length > 0) toast(errors[0], "error");
    if (logFileInputRef.current) logFileInputRef.current.value = "";
  };

  const removeLogFile = (fileIndex) => {
    setLogFiles((prev) => prev.filter((_, index) => index !== fileIndex));
    setLogFileErrors([]);
    if (logFileInputRef.current) logFileInputRef.current.value = "";
  };

  const handleSelectGoogleLogBusiness = (parts = {}) => {
    const draft = {
      ...makeBlankGrassrootsTarget("drops"),
      name: parts.name || logBusinessQuery,
      category: "drops",
      address: parts.address || "",
      address_line_1: parts.address_line_1 || "",
      address_line_2: parts.address_line_2 || "",
      address_city: parts.address_city || "",
      address_state: parts.address_state || "",
      address_postal_code: parts.address_postal_code || "",
      address_country: parts.address_country || "",
      google_place_id: parts.google_place_id || "",
      contact_phone: parts.contact_phone || "",
      business_category: parts.business_category || parts.drop_category || "",
      drop_category: parts.business_category || parts.drop_category || "",
      details: parts.website ? { links: [{ id: `business_link_${Date.now()}`, label: "Website", url: parts.website }] } : {},
    };
    setLogBusinessDraft(draft);
    setLogSelectedTarget(null);
  };

  const ensureLogTarget = async () => {
    if (logSelectedTarget?.id) return logSelectedTarget;
    const name = String(logBusinessDraft?.name || logBusinessQuery || "").trim();
    if (!name) throw new Error("Business is required");
    if (!canEditTargets) throw new Error("You do not have permission to create drop businesses");

    const draft = {
      ...makeBlankGrassrootsTarget("drops"),
      ...(logBusinessDraft || {}),
      name,
      category: "drops",
      is_active: true,
    };
    const payload = buildTargetPayload(draft, locationId, actor);
    const { data, error } = await supabase
      .from("grassroots_targets")
      .insert(payload)
      .select("*")
      .single();
    if (error) throw error;
    setTargets((prev) => [data, ...prev]);
    markFreshTarget(data.id);
    return data;
  };

  const uploadGrassrootsActivityAttachments = async ({ target, activityId }) => {
    const uploadedRows = [];
    for (const file of logFiles) {
      const attachmentId = createGrassrootsClientUuid();
      const mimeType = inferGrassrootsActivityAttachmentMimeType(file);
      const storagePath = buildGrassrootsActivityAttachmentPath({
        locationId,
        targetId: target.id,
        activityId,
        attachmentId,
        fileName: file.name,
      });
      const { error: uploadError } = await supabase
        .storage
        .from(GRASSROOTS_ACTIVITY_ATTACHMENT_BUCKET)
        .upload(storagePath, file, {
          cacheControl: "3600",
          contentType: mimeType,
          upsert: false,
        });
      if (uploadError) throw uploadError;
      uploadedRows.push({
        id: attachmentId,
        location_id: locationId,
        target_id: target.id,
        activity_id: activityId,
        attachment_type: mimeType.startsWith("image/") ? "drop_photo" : "drop_attachment",
        file_name: file.name || "attachment",
        storage_bucket: GRASSROOTS_ACTIVITY_ATTACHMENT_BUCKET,
        storage_path: storagePath,
        mime_type: mimeType,
        file_size_bytes: Number(file.size || 0),
        metadata: {
          original_file_name: file.name || "attachment",
          source_module: "grassroots_drops",
        },
        uploaded_by_user_id: actor.userId,
        uploaded_by_name: actor.name,
      });
    }
    return uploadedRows;
  };

  const saveDraft = async () => {
    if (!canEditTargets) {
      toast("You do not have permission to edit grassroots rows", "error");
      return;
    }
    const draft = editDraft || newDraft;
    if (!draft || !locationId) return;
    if (!String(draft.name || "").trim()) {
      toast(`${activeConfig.nameLabel} is required`, "error");
      return;
    }
    if (getGrassrootsCategoryConfig(draft.category).id === "events" && normalizeGrassrootsEventDates(draft).length === 0) {
      toast("Event date is required", "error");
      return;
    }
    setSavingDraft(true);
    setSaveState("saving");
    const payload = buildTargetPayload(draft, locationId, actor);
    const isEventDraft = getGrassrootsCategoryConfig(draft.category).id === "events";
    let data = null;
    let savedEventDates = normalizeGrassrootsEventDates(draft);
    let error = null;

    if (isEventDraft) {
      const rpcPayload = { ...payload, id: draft.isDraft ? null : draft.id };
      const result = await supabase.rpc(
        GRASSROOTS_EVENT_SAVE_RPC,
        buildGrassrootsEventSaveRpcArgs(rpcPayload, draft),
      );
      error = result.error;
      data = result.data?.target || null;
      savedEventDates = result.data?.event_dates || savedEventDates;
    } else {
      const query = draft.isDraft
        ? supabase.from("grassroots_targets").insert(payload).select("*").single()
        : supabase.from("grassroots_targets").update(payload).eq("id", draft.id).select("*").single();
      const result = await query;
      error = result.error;
      data = result.data;
    }

    setSavingDraft(false);
    if (error || !data) {
      console.error("Failed to save grassroots target", error);
      setSaveState("error");
      toast(error?.message || "Failed to save row", "error");
      return;
    }
    const dataWithDates = { ...data, event_dates: savedEventDates };
    setTargets((prev) => draft.isDraft ? [dataWithDates, ...prev] : prev.map((target) => (target.id === data.id ? dataWithDates : target)));
    closeEditor();
    await loadGrassroots();
    if (draft.isDraft) markFreshTarget(data.id);
    setSaveState("saved");
    window.setTimeout(() => setSaveState("idle"), 1200);
    toast("Grassroots row saved");
  };

  const deleteTarget = async (target) => {
    if (!canEditTargets) {
      toast("You do not have permission to edit grassroots rows", "error");
      return;
    }
    if (!window.confirm(`Delete ${target.name || "this row"}? This also deletes its logged updates.`)) return;
    setSaveState("saving");
    const { error: stampError } = await supabase
      .from("grassroots_targets")
      .update({
        updated_by_user_id: actor.userId,
        updated_by_name: actor.name,
      })
      .eq("id", target.id);
    if (stampError) {
      setSaveState("error");
      toast(stampError.message || "Failed to prepare delete history", "error");
      return;
    }
    const { error } = await supabase.from("grassroots_targets").delete().eq("id", target.id);
    if (error) {
      setSaveState("error");
      toast(error.message || "Failed to delete row", "error");
      return;
    }
    setTargets((prev) => prev.filter((row) => row.id !== target.id));
    setActivities((prev) => prev.filter((activity) => activity.target_id !== target.id));
    closeEditor();
    resetLogForm();
    setMovePopover(null);
    await loadGrassroots();
    setSaveState("saved");
    window.setTimeout(() => setSaveState("idle"), 1200);
    toast("Grassroots row deleted");
  };

  const openMovePopover = (target, event) => {
    if (!canEditTargets) {
      toast("You do not have permission to edit grassroots rows", "error");
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    setLogModal(null);
    setMovePopover({ target, x: rect.left, y: rect.bottom + 6 });
  };

  const moveTarget = async (target, nextConfig) => {
    if (!canEditTargets) {
      toast("You do not have permission to edit grassroots rows", "error");
      return;
    }
    if (!target || !nextConfig || target.category === nextConfig.dbValue) {
      setMovePopover(null);
      return;
    }
    setSaveState("saving");
    const { data, error } = await supabase
      .from("grassroots_targets")
      .update({
        category: nextConfig.dbValue,
        updated_by_user_id: actor.userId,
        updated_by_name: actor.name,
      })
      .eq("id", target.id)
      .select("*")
      .single();
    if (error) {
      setSaveState("error");
      toast(error.message || "Failed to move row", "error");
      return;
    }
    setTargets((prev) => prev.map((row) => (row.id === data.id ? data : row)));
    setExpandedUpdates((prev) => {
      const next = new Set(prev);
      next.delete(target.id);
      return next;
    });
    setMovePopover(null);
    setActiveCategory(nextConfig.id);
    await loadGrassroots();
    setSaveState("saved");
    window.setTimeout(() => setSaveState("idle"), 1200);
    toast(`Moved to ${nextConfig.label}`);
  };

  const saveLog = async () => {
    if (!canLogActivity) {
      toast("You do not have permission to log grassroots activity", "error");
      return;
    }
    const isDropLog = (logModal?.category || getGrassrootsCategoryConfig(logModal?.target?.category).id) === "drops";
    if (isDropLog && !logSelectedTarget?.id && !String(logBusinessDraft?.name || logBusinessQuery || "").trim()) {
      toast("Business is required", "error");
      return;
    }
    const category = isDropLog ? "drops" : getGrassrootsCategoryConfig(logModal?.target?.category).id;
    const activityType = getGrassrootsActivityType(category);
    const requiresNextDate = activityType === "drop";
    if (!logNotes.trim() || (requiresNextDate && !logDate)) {
      toast(requiresNextDate ? "Notes and next date are required" : "Comment is required", "error");
      return;
    }
    if (activityType === "drop" && !logContactName.trim()) {
      toast("Who did you speak with is required", "error");
      return;
    }
    if (activityType === "drop" && attachmentsSchemaMissing && logFiles.length > 0) {
      toast("Attachment storage is not installed in this Supabase environment yet", "error");
      return;
    }
    const target = isDropLog ? await ensureLogTarget().catch((error) => {
      toast(error.message || "Business is required", "error");
      return null;
    }) : logModal?.target;
    if (!target) return;
    const activityDate = logActivityDate || todayStr();
    const activityId = createGrassrootsClientUuid();
    setSaveState("saving");
    setSavingLog(true);

    let insertedActivity = null;
    let insertedAttachments = [];
    let error = null;

    if (activityType === "drop" && !attachmentsSchemaMissing) {
      try {
        const attachmentRows = await uploadGrassrootsActivityAttachments({ target, activityId });
        const { data, error: rpcError } = await supabase.rpc("log_grassroots_drop_activity_with_attachments", {
          p_activity: {
            id: activityId,
            location_id: locationId,
            target_id: target.id,
            activity_type: activityType,
            activity_date: activityDate,
            notes: logNotes.trim(),
            next_contact_date: logDate || null,
            metadata: {
              person_spoken_with: logContactName.trim(),
              materials_left: logMaterialsLeft.trim(),
              outcome: logOutcome.trim(),
              follow_up_priority: logFollowUpPriority,
              partnership_potential: logPartnershipPotential,
              attachment_count: attachmentRows.length,
            },
            created_by_user_id: actor.userId,
            created_by_name: actor.name,
          },
          p_attachments: attachmentRows,
        });
        if (rpcError) throw rpcError;
        insertedActivity = data?.activity || null;
        insertedAttachments = data?.attachments || [];
      } catch (rpcError) {
        error = rpcError;
      }
    } else {
      const result = await supabase
        .from("grassroots_activity")
        .insert({
          id: activityId,
          location_id: locationId,
          target_id: target.id,
          activity_type: activityType,
          activity_date: activityDate,
          notes: logNotes.trim(),
          next_contact_date: logDate || null,
          metadata: activityType === "drop" ? {
            person_spoken_with: logContactName.trim(),
            materials_left: logMaterialsLeft.trim(),
            outcome: logOutcome.trim(),
            follow_up_priority: logFollowUpPriority,
            partnership_potential: logPartnershipPotential,
          } : {},
          created_by_user_id: actor.userId,
          created_by_name: actor.name,
        })
        .select("*")
        .single();
      insertedActivity = result.data;
      error = result.error;
    }

    setSavingLog(false);
    if (error || !insertedActivity) {
      setSaveState("error");
      console.error("Failed to log grassroots activity", error);
      toast(error?.message || "Failed to log update", "error");
      return;
    }

    setActivities((prev) => [insertedActivity, ...prev]);
    if (insertedAttachments.length > 0) {
      setActivityAttachments((prev) => [...insertedAttachments, ...prev]);
    }
    await loadGrassroots();
    markFreshActivity(insertedActivity.id);
    resetLogForm();
    if (activityType === "drop") setDropSubview("activity");
    setSaveState("saved");
    window.setTimeout(() => setSaveState("idle"), 1200);
    toast(activityType === "drop" ? "Activity logged" : category === "events" ? "Comment logged" : "Development logged");
  };

  const previewGrassrootsAttachment = async (attachment) => {
    if (!attachment?.storage_path) return;
    const previewKind = getGrassrootsAttachmentPreviewKind(attachment);
    if (previewKind === "unsupported") {
      toast("This attachment type cannot be previewed in the app", "error");
      return;
    }
    setPreviewingAttachmentId(attachment.id || attachment.storage_path);
    try {
      const { data, error } = await supabase
        .storage
        .from(attachment.storage_bucket || GRASSROOTS_ACTIVITY_ATTACHMENT_BUCKET)
        .createSignedUrl(attachment.storage_path, 300);
      if (error) throw error;
      if (!data?.signedUrl) throw new Error("Signed URL was not returned");
      setAttachmentPreview({
        attachment,
        kind: previewKind,
        url: data.signedUrl,
      });
    } catch (error) {
      console.error("Grassroots attachment preview error:", error);
      toast("Failed to open attachment preview", "error");
    } finally {
      setPreviewingAttachmentId(null);
    }
  };

  const removeFilter = (key) => {
    setDraftFilters((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    if (configuringFilterKey === key) setConfiguringFilterKey(null);
  };

  const updateFilter = (key, field, value) => {
    setDraftFilters((prev) => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
  };

  const selectFilterField = (key) => {
    const field = filterFields.find((candidate) => candidate.key === key);
    if (!field) return;
    setDraftFilters((prev) => ({ ...prev, [key]: { op: field.ops[0], val: "" } }));
    setConfiguringFilterKey(key);
  };

  const clearFilters = () => {
    const defaults = getGrassrootsDefaultFilters(activeCategory);
    setDraftFilters(defaults);
    setFilters(defaults);
    setConfiguringFilterKey(null);
    setShowFilterPicker(false);
  };

  const applyFilters = () => {
    setFilters(draftFilters);
    setShowFilterPanel(false);
    setShowFilterPicker(false);
    setConfiguringFilterKey(null);
  };

  const filterCount = Object.keys(filters || {}).length;
  const saveLabel = saveState === "saving" ? "Saving..." : saveState === "saved" ? "Saved" : saveState === "error" ? "Save failed" : "";
  const saveTone = saveState === "saving" ? C.info : saveState === "saved" ? C.suc : saveState === "error" ? C.dan : C.textMut;
  const metricCards = activeConfig.id === "drops"
    ? [
      { label: "Drop Visits Last 30", value: dropMetrics.dropVisitsLast30, color: C.pri },
      { label: "Businesses Visited Last 30", value: dropMetrics.businessesVisitedLast30, color: C.suc },
      { label: `Drop Visits ${dropMetrics.year} YTD`, value: dropMetrics.dropVisitsYtd, color: C.info },
      { label: `Businesses Visited ${dropMetrics.year} YTD`, value: dropMetrics.businessesVisitedYtd, color: "#7C3AED" },
    ]
    : [
      { label: `Booked Upcoming ${eventMetrics.year}`, value: eventMetrics.bookedUpcomingThisYear, color: C.pri },
      { label: `Booked Completed ${eventMetrics.year}`, value: eventMetrics.bookedCompletedThisYear, color: C.suc },
      { label: `Identified ${eventMetrics.year}`, value: eventMetrics.identifiedThisYear, color: C.info },
      { label: `Corresponding ${eventMetrics.year}`, value: eventMetrics.correspondingThisYear, color: "#7C3AED" },
      { label: `Booked ${fmtMonthYear(eventMetrics.month)}`, value: eventMetrics.bookedThisMonth, color: C.accDk },
    ];

  return (
    <div style={{ maxWidth: 1240, margin: "0 auto", paddingBottom: 32 }}>
      <style>{`
        @keyframes grassrootsSlideIn { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes grassrootsFadeIn { from { opacity:0; transform:scale(0.96); } to { opacity:1; transform:scale(1); } }
        @keyframes grassrootsChipIn { from { opacity:0; transform:translateX(-6px) scale(0.92); } to { opacity:1; transform:translateX(0) scale(1); } }
        @keyframes grassrootsComposerIn {
          0% { opacity:0; transform:translateY(-18px) scale(0.985); filter:blur(4px); }
          65% { opacity:1; transform:translateY(2px) scale(1.002); filter:blur(0); }
          100% { opacity:1; transform:translateY(0) scale(1); filter:blur(0); }
        }
        @keyframes grassrootsCategoryCycle {
          0% { opacity:0; transform:translate3d(0,10px,0) scale(0.992); filter:blur(3px); }
          62% { opacity:1; transform:translate3d(0,-1px,0) scale(1.001); filter:blur(0); }
          100% { opacity:1; transform:translate3d(0,0,0) scale(1); filter:blur(0); }
        }
        @keyframes grassrootsFreshRow {
          0% { box-shadow:0 0 0 2px rgba(20,83,45,0), 0 1px 3px rgba(0,0,0,0.04); }
          24% { box-shadow:0 0 0 2px rgba(20,83,45,0.32), 0 18px 42px rgba(20,83,45,0.16); }
          100% { box-shadow:0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02); }
        }
        @keyframes grassrootsCopySuccess {
          0% { transform:translateY(-50%) scale(0.94); box-shadow:0 0 0 rgba(22,163,74,0); }
          42% { transform:translateY(-50%) scale(1.06); box-shadow:0 0 0 8px rgba(34,197,94,0.16); }
          100% { transform:translateY(-50%) scale(1); box-shadow:0 8px 18px rgba(22,163,74,0.25); }
        }
        @keyframes grassrootsCheckPop {
          0% { transform:scale(0.62) rotate(-14deg); }
          58% { transform:scale(1.2) rotate(4deg); }
          100% { transform:scale(1.02) rotate(0deg); }
        }
        .grassroots-event-inline-editor {
          position: relative;
          overflow: hidden;
          border-radius: 14px;
          border: 1.5px solid ${C.border};
          background: ${C.surface};
          box-shadow: 0 14px 36px rgba(15,23,42,0.12);
          animation: grassrootsComposerIn 0.38s cubic-bezier(0.16,1,0.3,1) both;
        }
        .grassroots-event-inline-header {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          padding: 14px 16px;
          border-bottom: 1px solid ${C.borderLight};
          background: linear-gradient(135deg, ${C.priLt} 0%, #fff 72%);
        }
        .grassroots-event-inline-close {
          width: 32px;
          height: 32px;
          border: 1px solid ${C.borderLight};
          border-radius: 9px;
          background: #fff;
          color: ${C.textMut};
          cursor: pointer;
          display: grid;
          place-items: center;
          padding: 0;
        }
        .grassroots-event-metrics {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(185px, 1fr));
          gap: 12px;
          margin-bottom: 16px;
        }
        .grassroots-category-tabs {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-bottom: 14px;
        }
        .grassroots-category-tab {
          position: relative;
          border: 1.5px solid ${C.border};
          border-radius: 999px;
          background: #fff;
          color: ${C.text};
          padding: 8px 14px;
          font-family: inherit;
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
          transform: translateZ(0);
          transition: transform 0.22s cubic-bezier(0.16,1,0.3,1), background 0.22s cubic-bezier(0.16,1,0.3,1), border-color 0.22s cubic-bezier(0.16,1,0.3,1), color 0.22s cubic-bezier(0.16,1,0.3,1), box-shadow 0.22s cubic-bezier(0.16,1,0.3,1);
        }
        .grassroots-category-tab:hover {
          transform: translateY(-1px);
          border-color: ${C.pri}70;
          box-shadow: 0 8px 18px rgba(15,23,42,0.08);
        }
        .grassroots-category-tab.is-active {
          background: ${C.pri};
          border-color: ${C.pri};
          color: #fff;
          box-shadow: 0 12px 24px rgba(20,83,45,0.18);
        }
        .grassroots-category-stage {
          animation: grassrootsCategoryCycle 0.34s cubic-bezier(0.16,1,0.3,1) both;
          transform-origin: top center;
        }
        .grassroots-new-draft-anchor {
          scroll-margin-top: 96px;
        }
        .grassroots-event-inline-body { position: relative; z-index: 1; padding: 14px; background: ${C.bg}; }
        .grassroots-target-inline-body { position: relative; z-index: 1; padding: 14px; background: ${C.bg}; }
        .grassroots-target-form-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(340px, 0.85fr);
          gap: 14px;
          align-items: stretch;
        }
        .grassroots-event-type-picker {
          display: inline-grid;
          grid-template-columns: repeat(2, minmax(76px, 1fr));
          gap: 5px;
          width: 100%;
          max-width: 256px;
          padding: 5px;
          border-radius: 13px;
          border: 1.5px solid ${C.border};
          background: ${C.bg};
        }
        .grassroots-event-type-option {
          border: none;
          border-radius: 10px;
          padding: 9px 12px;
          background: transparent;
          color: ${C.textSec};
          font-family: inherit;
          font-size: 12px;
          font-weight: 900;
          cursor: pointer;
          transition: transform 0.16s ease, background 0.16s ease, color 0.16s ease, box-shadow 0.16s ease;
        }
        .grassroots-event-type-option:hover { transform: translateY(-1px); color: ${C.text}; }
        .grassroots-event-type-option.is-active {
          background: ${C.pri};
          color: #fff;
          box-shadow: 0 8px 18px rgba(20,83,45,0.22);
        }
        .grassroots-event-links {
          margin-top: 14px;
          padding-top: 14px;
          border-top: 1px solid ${C.borderLight};
        }
        .grassroots-event-links-header,
        .grassroots-event-commentary-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 8px;
        }
        .grassroots-link-add-button,
        .grassroots-comment-add-button {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border: 1.5px solid ${C.borderLight};
          border-radius: 10px;
          background: #fff;
          color: ${C.pri};
          padding: 7px 10px;
          font-family: inherit;
          font-size: 11px;
          font-weight: 900;
          cursor: pointer;
        }
        .grassroots-comment-add-button:disabled {
          cursor: default;
          opacity: 0.5;
        }
        .grassroots-event-links-list { display: grid; gap: 8px; }
        .grassroots-event-link-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 34px;
          gap: 8px;
          align-items: center;
        }
        .grassroots-event-link-url { position: relative; min-width: 0; }
        .grassroots-event-link-open {
          position: absolute;
          right: 8px;
          top: 50%;
          transform: translateY(-50%);
          width: auto;
          min-width: 62px;
          height: 28px;
          border-radius: 8px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          color: ${C.pri};
          background: #fff;
          border: 1px solid ${C.borderLight};
          font-size: 11px;
          font-weight: 900;
          text-decoration: none;
          padding: 0 8px;
        }
        .grassroots-address-copy-field {
          grid-column: 1 / -1;
        }
        .grassroots-address-copy-shell {
          position: relative;
        }
        .grassroots-address-copy-shell input {
          transition: border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
        }
        .grassroots-address-copy-shell.is-copied input {
          border-color: rgba(22,163,74,0.58) !important;
          background: linear-gradient(90deg, rgba(240,253,244,0.88), #fff) !important;
          box-shadow: 0 0 0 3px rgba(34,197,94,0.13);
        }
        .grassroots-address-copy-shell.is-manual input {
          border-color: rgba(180,83,9,0.42) !important;
          background: linear-gradient(90deg, rgba(255,251,235,0.86), #fff) !important;
          box-shadow: 0 0 0 3px rgba(245,158,11,0.12);
        }
        .grassroots-address-copy-button {
          position: absolute;
          right: 8px;
          top: 50%;
          transform: translateY(-50%);
          min-width: 82px;
          height: 30px;
          border-radius: 8px;
          border: 1px solid ${C.borderLight};
          background: #fff;
          color: ${C.pri};
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 0 9px;
          font-family: inherit;
          font-size: 11px;
          font-weight: 900;
          cursor: pointer;
          overflow: hidden;
          transition: min-width 0.18s ease, border-color 0.18s ease, background 0.18s ease, color 0.18s ease, box-shadow 0.18s ease, transform 0.12s ease;
        }
        .grassroots-address-copy-button:hover:not(:disabled) {
          border-color: rgba(20,83,45,0.24);
          box-shadow: 0 4px 10px rgba(15,23,42,0.08);
        }
        .grassroots-address-copy-button:active:not(:disabled) {
          transform: translateY(-50%) scale(0.97);
        }
        .grassroots-address-copy-button.is-copied {
          min-width: 92px;
          border-color: rgba(22,163,74,0.30);
          background: ${C.suc};
          color: #fff;
          box-shadow: 0 8px 18px rgba(22,163,74,0.25);
          animation: grassrootsCopySuccess 420ms cubic-bezier(0.16,1,0.3,1);
        }
        .grassroots-address-copy-button.is-manual {
          min-width: 116px;
          border-color: rgba(180,83,9,0.24);
          background: #FFFBEB;
          color: #92400E;
        }
        .grassroots-copy-icon-stack {
          position: relative;
          width: 16px;
          height: 16px;
          display: inline-grid;
          place-items: center;
          flex: 0 0 auto;
        }
        .grassroots-copy-clipboard,
        .grassroots-copy-check {
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
          transition: opacity 0.18s ease, transform 0.22s cubic-bezier(0.16,1,0.3,1);
        }
        .grassroots-copy-check {
          opacity: 0;
          transform: translateY(9px) scale(0.64);
        }
        .grassroots-address-copy-button.is-copied .grassroots-copy-clipboard {
          opacity: 0;
          transform: translateY(-9px) scale(0.72);
        }
        .grassroots-address-copy-button.is-copied .grassroots-copy-check {
          opacity: 1;
          transform: translateY(0) scale(1.08);
        }
        .grassroots-address-copy-button.is-copied .grassroots-copy-check svg {
          animation: grassrootsCheckPop 360ms cubic-bezier(0.16,1,0.3,1) both;
        }
        .grassroots-copy-label {
          display: inline-block;
          min-width: 31px;
          text-align: left;
          transition: transform 0.18s ease;
        }
        .grassroots-address-copy-button:disabled {
          color: ${C.textMut};
          cursor: default;
          opacity: 0.6;
        }
        .grassroots-link-remove-button {
          width: 34px;
          height: 34px;
          border-radius: 10px;
          border: 1.5px solid ${C.borderLight};
          background: #fff;
          color: ${C.textMut};
          display: grid;
          place-items: center;
          cursor: pointer;
        }
        .grassroots-event-commentary {
          margin-top: 14px;
          padding-top: 14px;
          border-top: 1px solid ${C.borderLight};
        }
        .grassroots-places-field {
          position: relative;
          display: block;
          min-width: 0;
        }
        .grassroots-places-anchor {
          position: relative;
          min-width: 0;
        }
        .grassroots-places-panel {
          position: absolute;
          top: calc(100% + 8px);
          left: 0;
          z-index: 10070;
          width: min(680px, calc(100vw - 56px));
          max-width: calc(100vw - 56px);
          padding: 6px;
          border: 1px solid rgba(203, 213, 225, 0.95);
          border-radius: 16px;
          background: #fff;
          box-shadow: 0 18px 34px rgba(15,23,42,0.12), 0 3px 8px rgba(15,23,42,0.07);
          overflow: hidden;
        }
        .grassroots-places-panel::before {
          content: "";
          position: absolute;
          top: 0;
          left: 14px;
          right: 14px;
          height: 2px;
          border-radius: 0 0 999px 999px;
          background: linear-gradient(90deg, rgba(20,83,45,0), rgba(20,83,45,0.52), rgba(20,83,45,0));
        }
        .grassroots-places-option {
          position: relative;
          width: 100%;
          display: grid;
          grid-template-columns: 34px minmax(0, 1fr) auto;
          align-items: center;
          gap: 12px;
          min-height: 74px;
          padding: 12px 12px 12px 9px;
          border: 0;
          border-radius: 12px;
          background: transparent;
          color: ${C.text};
          cursor: pointer;
          font: inherit;
          text-align: left;
          transition: background 0.14s ease, box-shadow 0.14s ease, transform 0.14s ease;
        }
        .grassroots-places-option + .grassroots-places-option {
          border-top: 1px solid rgba(226,232,240,0.88);
          border-radius: 0;
        }
        .grassroots-places-option:hover,
        .grassroots-places-option.is-active {
          background: linear-gradient(90deg, rgba(20,83,45,0.075), rgba(240,253,244,0.68));
          box-shadow: inset 3px 0 0 ${C.pri};
        }
        .grassroots-places-option:active {
          transform: translateY(1px);
        }
        .grassroots-places-pin {
          width: 28px;
          height: 28px;
          border-radius: 999px;
          display: grid;
          place-items: center;
          color: ${C.textMut};
          background: ${C.bg};
          border: 1px solid rgba(203,213,225,0.9);
          align-self: center;
        }
        .grassroots-places-option:hover .grassroots-places-pin,
        .grassroots-places-option.is-active .grassroots-places-pin {
          color: ${C.pri};
          background: #fff;
          border-color: rgba(20,83,45,0.24);
        }
        .grassroots-places-copy {
          min-width: 0;
          display: grid;
          gap: 4px;
        }
        .grassroots-places-main {
          display: block;
          color: ${C.text};
          font-size: 14px;
          font-weight: 900;
          line-height: 1.22;
          white-space: normal;
          overflow-wrap: anywhere;
        }
        .grassroots-places-main mark {
          padding: 0;
          color: ${C.pri};
          background: transparent;
        }
        .grassroots-places-secondary {
          display: block;
          color: ${C.textMut};
          font-size: 13px;
          font-weight: 700;
          line-height: 1.3;
          white-space: normal;
          overflow-wrap: anywhere;
        }
        .grassroots-places-category {
          justify-self: end;
          align-self: center;
          white-space: nowrap;
          border-radius: 999px;
          border: 1px solid rgba(20,83,45,0.18);
          background: rgba(20,83,45,0.07);
          color: ${C.pri};
          padding: 5px 8px;
          font-size: 10px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .grassroots-places-loading {
          padding: 14px 12px;
          color: ${C.textMut};
          font-size: 13px;
          font-weight: 800;
        }
        .grassroots-places-footer {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 5px;
          padding: 8px 8px 4px;
          border-top: 1px solid rgba(226,232,240,0.88);
          color: ${C.textMut};
          font-size: 12px;
          font-weight: 700;
        }
        .grassroots-google-wordmark {
          font-weight: 800;
          letter-spacing: 0;
        }
        .grassroots-google-wordmark span:nth-child(1) { color: #4285F4; }
        .grassroots-google-wordmark span:nth-child(2) { color: #DB4437; }
        .grassroots-google-wordmark span:nth-child(3) { color: #F4B400; }
        .grassroots-google-wordmark span:nth-child(4) { color: #4285F4; }
        .grassroots-google-wordmark span:nth-child(5) { color: #0F9D58; }
        .grassroots-google-wordmark span:nth-child(6) { color: #DB4437; }
        .grassroots-places-section-label {
          padding: 8px 10px 4px;
          color: ${C.textMut};
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .grassroots-places-option.is-internal {
          background: rgba(240,253,244,0.42);
        }
        .grassroots-places-pin.is-internal {
          color: ${C.pri};
          background: #fff;
          border-color: rgba(20,83,45,0.24);
        }
        .grassroots-drop-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin: 2px 0 10px;
          flex-wrap: wrap;
        }
        .grassroots-drop-subview-tabs {
          display: inline-flex;
          align-items: center;
          padding: 4px;
          border: 1.5px solid ${C.border};
          border-radius: 14px;
          background: #fff;
          box-shadow: 0 1px 3px rgba(15,23,42,0.05);
        }
        .grassroots-drop-subview-tab {
          border: 0;
          border-radius: 10px;
          background: transparent;
          color: ${C.textSec};
          cursor: pointer;
          font: inherit;
          font-size: 13px;
          font-weight: 900;
          padding: 8px 13px;
          display: inline-flex;
          align-items: center;
          gap: 7px;
        }
        .grassroots-drop-subview-tab em {
          font-style: normal;
          font-size: 11px;
          color: inherit;
          opacity: 0.7;
        }
        .grassroots-drop-subview-tab.is-active {
          background: ${C.pri};
          color: #fff;
          box-shadow: 0 2px 8px rgba(20,83,45,0.18);
        }
        .grassroots-drop-toolbar-copy {
          display: flex;
          align-items: baseline;
          gap: 8px;
          color: ${C.textMut};
          font-size: 12px;
        }
        .grassroots-drop-toolbar-copy strong {
          color: ${C.text};
          font-weight: 950;
        }
        .grassroots-drop-activity-header,
        .grassroots-drop-activity-row {
          display: grid;
          grid-template-columns: 138px minmax(210px, 0.9fr) minmax(260px, 1.4fr) 136px;
          gap: 14px;
          align-items: start;
        }
        .grassroots-drop-activity-header {
          padding: 11px 16px;
          background: ${C.bg};
          border-bottom: 1px solid ${C.borderLight};
          color: ${C.textMut};
          font-size: 10px;
          font-weight: 950;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .grassroots-drop-activity-list {
          display: grid;
        }
        .grassroots-drop-activity-row {
          padding: 16px;
          border-bottom: 1px solid ${C.borderLight};
          transition: background 0.16s ease, box-shadow 0.16s ease;
        }
        .grassroots-drop-activity-row:last-child {
          border-bottom: 0;
        }
        .grassroots-drop-activity-row:hover {
          background: rgba(248,250,252,0.84);
        }
        .grassroots-drop-activity-row.is-fresh {
          animation: grassrootsFreshRow 1.8s ease-out both;
        }
        .grassroots-drop-activity-date,
        .grassroots-drop-activity-business,
        .grassroots-drop-activity-next {
          min-width: 0;
          display: grid;
          gap: 4px;
        }
        .grassroots-drop-activity-date strong,
        .grassroots-drop-activity-business strong,
        .grassroots-drop-activity-next strong {
          color: ${C.text};
          font-size: 13px;
          font-weight: 950;
        }
        .grassroots-drop-activity-date span,
        .grassroots-drop-activity-business span,
        .grassroots-drop-activity-actor {
          color: ${C.textMut};
          font-size: 12px;
          font-weight: 700;
          line-height: 1.35;
        }
        .grassroots-drop-activity-notes {
          min-width: 0;
          display: grid;
          gap: 7px;
        }
        .grassroots-drop-activity-notes p {
          margin: 0;
          color: ${C.text};
          font-size: 13px;
          font-weight: 800;
          line-height: 1.45;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }
        .grassroots-drop-activity-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .grassroots-drop-activity-meta span {
          display: inline-flex;
          align-items: center;
          padding: 4px 8px;
          border-radius: 999px;
          background: ${C.bg};
          border: 1px solid ${C.borderLight};
          color: ${C.textSec};
          font-size: 11px;
          font-weight: 900;
        }
        .grassroots-drop-activity-meta span.is-hot {
          background: ${C.warnLt};
          color: ${C.warn};
          border-color: rgba(245,158,11,0.25);
        }
        .grassroots-drop-activity-meta span.is-potential {
          background: ${C.priLt};
          color: ${C.pri};
          border-color: rgba(20,83,45,0.2);
        }
        .grassroots-activity-attachments,
        .grassroots-log-pending-files {
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
        }
        .grassroots-activity-attachment-button,
        .grassroots-log-pending-files span {
          min-width: 0;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          max-width: 260px;
          padding: 7px 9px;
          border-radius: 10px;
          border: 1.5px solid ${C.borderLight};
          background: #fff;
          color: ${C.textSec};
          font: inherit;
          font-size: 12px;
          font-weight: 850;
        }
        .grassroots-activity-attachment-button {
          cursor: pointer;
        }
        .grassroots-activity-attachment-button:hover {
          border-color: rgba(20,83,45,0.28);
          color: ${C.pri};
        }
        .grassroots-activity-attachment-button span,
        .grassroots-log-pending-files strong {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .grassroots-activity-attachment-button em,
        .grassroots-log-pending-files em {
          color: ${C.textMut};
          font-size: 11px;
          font-style: normal;
          font-weight: 800;
        }
        .grassroots-log-modal {
          display: grid;
          gap: 14px;
        }
        .grassroots-log-section {
          border: 1px solid ${C.borderLight};
          border-radius: 14px;
          background: ${C.bg};
          padding: 14px;
        }
        .grassroots-log-section-title {
          margin-bottom: 10px;
          color: ${C.pri};
          font-size: 11px;
          font-weight: 950;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .grassroots-log-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }
        .grassroots-log-selected-business {
          display: grid;
          gap: 3px;
          padding: 12px;
          border-radius: 12px;
          border: 1.5px solid rgba(20,83,45,0.18);
          background: #fff;
        }
        .grassroots-log-selected-business strong {
          color: ${C.text};
          font-size: 14px;
          font-weight: 950;
        }
        .grassroots-log-selected-business span {
          color: ${C.textMut};
          font-size: 12px;
          font-weight: 750;
        }
        .grassroots-log-selected-business.is-compact {
          margin-top: 10px;
          display: flex;
          align-items: center;
          gap: 8px;
          color: ${C.pri};
        }
        .grassroots-log-flag-row {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 12px;
        }
        .grassroots-log-flag-row button {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 8px 12px;
          border-radius: 999px;
          border: 1.5px solid ${C.border};
          background: #fff;
          color: ${C.textSec};
          cursor: pointer;
          font: inherit;
          font-size: 12px;
          font-weight: 900;
        }
        .grassroots-log-flag-row button.is-active {
          border-color: rgba(20,83,45,0.3);
          background: ${C.pri};
          color: #fff;
        }
        .grassroots-log-warning,
        .grassroots-log-errors {
          margin-bottom: 10px;
          color: ${C.dan};
          font-size: 12px;
          font-weight: 850;
        }
        .grassroots-log-attachments-toolbar {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          color: ${C.textMut};
          font-size: 12px;
          font-weight: 800;
        }
        .grassroots-log-pending-files {
          margin-top: 10px;
        }
        .grassroots-log-pending-files button {
          border: 0;
          background: transparent;
          color: ${C.textMut};
          cursor: pointer;
          display: inline-flex;
          padding: 0;
        }
        .grassroots-log-actions {
          position: sticky;
          bottom: -26px;
          z-index: 2;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
          margin: 0 -26px -26px;
          padding: 14px 26px 18px;
          border-top: 1px solid rgba(226,232,240,0.92);
          background: linear-gradient(180deg, rgba(255,255,255,0.88), #fff 38%);
          backdrop-filter: blur(10px);
        }
        .pac-container {
          z-index: 10050 !important;
          margin-top: 8px;
          padding: 6px;
          border-radius: 14px;
          border: 1px solid ${C.border};
          background: #fff;
          box-shadow: 0 10px 22px rgba(15,23,42,0.10), 0 1px 2px rgba(15,23,42,0.06);
          font-family: 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif;
          overflow: visible;
          width: min(760px, calc(100vw - 32px)) !important;
          max-width: min(760px, calc(100vw - 32px));
        }
        .pac-container .pac-item {
          border-top: 0;
          border-radius: 10px;
          padding: 10px 12px 10px 8px;
          color: ${C.textMut};
          cursor: pointer;
          font-size: 12px;
          line-height: 1.4;
          overflow: visible;
          text-overflow: clip;
          white-space: normal;
        }
        .pac-container .pac-item:hover,
        .pac-container .pac-item-selected {
          background: ${C.priLt};
          color: ${C.text};
        }
        .pac-container .pac-item-query {
          display: block;
          margin-bottom: 2px;
          color: ${C.text};
          font-size: 13px;
          font-weight: 900;
          white-space: normal;
        }
        .pac-container .pac-matched {
          color: ${C.pri};
          font-weight: 900;
        }
        .pac-container .pac-icon {
          margin-top: 1px;
          margin-right: 10px;
          opacity: 0.48;
        }
        .grassroots-event-form-grid { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.85fr); gap: 14px; align-items: start; }
        .grassroots-event-form-section { border: 1px solid ${C.borderLight}; border-radius: 12px; padding: 16px; background: ${C.surface}; }
        .grassroots-event-field-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; align-items: start; }
        .grassroots-event-wide-field { grid-column: 1 / -1; }
        .grassroots-event-date-row { display: grid; grid-template-columns: minmax(190px, 1.4fr) minmax(112px, 0.7fr) minmax(112px, 0.7fr) 36px; gap: 8px; align-items: end; }
        .grassroots-event-date-row > button { margin-bottom: 1px; }
        @media (max-width: 880px) {
          .grassroots-event-form-grid { grid-template-columns: 1fr; }
          .grassroots-target-form-grid { grid-template-columns: 1fr; }
        }
        @media (max-width: 680px) {
          .grassroots-event-field-grid { grid-template-columns: 1fr; }
          .grassroots-event-date-row { grid-template-columns: 1fr; padding: 12px; border: 1px solid ${C.borderLight}; border-radius: 12px; background: ${C.bg}; }
          .grassroots-event-date-row > button { margin-bottom: 0; width: 100% !important; }
          .grassroots-event-link-row { grid-template-columns: 1fr 34px; }
          .grassroots-places-panel { width: min(100%, calc(100vw - 32px)); }
          .grassroots-places-option { grid-template-columns: 30px minmax(0, 1fr); }
          .grassroots-places-category { grid-column: 2; justify-self: start; margin-top: 2px; }
          .grassroots-drop-activity-header { display: none; }
          .grassroots-drop-activity-row { grid-template-columns: 1fr; gap: 10px; }
          .grassroots-drop-activity-next { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
          .grassroots-log-grid { grid-template-columns: 1fr; }
          .grassroots-drop-toolbar-copy { width: 100%; }
        }
      `}</style>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        marginBottom: 20,
        padding: "16px 18px",
        borderRadius: 16,
        border: `1px solid ${C.border}`,
        background: `linear-gradient(135deg, ${C.priLt} 0%, #ffffff 62%)`,
        boxShadow: "0 12px 28px rgba(15,23,42,0.06)",
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 900, color: C.pri, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
            Tracker controls
          </div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, color: C.text }}>Grassroots Tracking</h1>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {saveState !== "idle" && (
            <div style={{ minWidth: 116, padding: "7px 11px", borderRadius: 999, border: `1px solid ${C.border}`, background: "#fff", color: saveTone, fontSize: 12, fontWeight: 900, textAlign: "center" }}>
              {saveLabel}
            </div>
          )}
          <Btn
            variant={showHistoryPanel ? "secondary" : "ghost"}
            size="lg"
            icon={<I.Clock />}
            onClick={() => setShowHistoryPanel((current) => !current)}
            style={{ whiteSpace: "nowrap" }}
          >
            History{categoryHistory.length > 0 ? ` (${categoryHistory.length})` : ""}
          </Btn>
          <Btn
            variant={showFilterPanel || filterCount > 0 ? "secondary" : "ghost"}
            size="lg"
            icon={<FilterIcon />}
            onClick={() => setShowFilterPanel((current) => !current)}
            style={{ whiteSpace: "nowrap" }}
          >
            Filter{filterCount > 0 ? ` (${filterCount})` : ""}
          </Btn>
          {activeConfig.id === "drops" ? (
            <>
              <Btn variant="secondary" size="lg" icon={<I.Plus />} onClick={openNewDraft} disabled={!canEditTargets || !!newDraft || !!editDraft} style={{ whiteSpace: "nowrap" }}>
                Add Business
              </Btn>
              <Btn variant="primary" size="lg" icon={<I.MessageSquare />} onClick={() => openLogModal()} disabled={!canLogActivity} style={{ minWidth: 142, justifyContent: "center" }}>
                Log Activity
              </Btn>
            </>
          ) : (
            <Btn variant="primary" size="lg" icon={<I.Plus />} onClick={openNewDraft} disabled={!canEditTargets || !!newDraft || !!editDraft} style={{ minWidth: 142, justifyContent: "center" }}>
              Add {activeConfig.singular}
            </Btn>
          )}
        </div>
      </div>

      <div className="grassroots-event-metrics">
        {metricCards.map((metric) => (
          <MetricCard key={metric.label} label={metric.label} value={metric.value} color={metric.color} />
        ))}
      </div>

      <div className="grassroots-category-tabs">
        {GRASSROOTS_CATEGORY_CONFIGS.map((category) => {
          const active = category.id === activeCategory;
          const count = targets.filter((target) => target.category === category.dbValue).length;
          return (
            <button
              key={category.id}
              type="button"
              onClick={() => setActiveCategory(category.id)}
              className={active ? "grassroots-category-tab is-active" : "grassroots-category-tab"}
            >
              {category.label} ({count})
            </button>
          );
        })}
      </div>

      {activeConfig.id === "drops" && (
        <div className="grassroots-drop-toolbar">
          <DropSubviewTabs
            value={dropSubview}
            onChange={setDropSubview}
            activityCount={dropActivityRows.length}
            businessCount={dropTargets.length}
          />
          <div className="grassroots-drop-toolbar-copy">
            <strong>{dropSubview === "activity" ? "Raw activity" : "Business rollup"}</strong>
            <span>{dropSubview === "activity" ? "One row per logged visit." : "One row per unique business."}</span>
          </div>
        </div>
      )}

      {showHistoryPanel && <HistoryPanel items={categoryHistory} categoryConfig={activeConfig} />}

      {showFilterPanel && (
        <Card style={{ padding: 0, marginBottom: 16, borderRadius: 14, background: C.bg, boxShadow: "0 8px 40px rgba(15,23,42,0.08)", overflow: "hidden", animation: "grassrootsSlideIn 0.2s ease-out" }}>
          <div style={{ padding: "14px 18px", minHeight: 48 }}>
            {usedFilterKeys.length === 0 && !showFilterPicker && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px 0", color: C.textMut, fontSize: 13, fontWeight: 700 }}>
                <FilterIcon /> No filters active
              </div>
            )}

            {usedFilterKeys.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: showFilterPicker ? 12 : 0 }}>
                {usedFilterKeys.map((key, index) => {
                  const field = filterFields.find((candidate) => candidate.key === key);
                  const filter = draftFilters[key];
                  if (!field || !filter) return null;
                  const isConfiguring = configuringFilterKey === key;
                  return (
                    <div key={key} style={{ animation: `grassrootsChipIn 0.2s ease-out ${index * 0.04}s both` }}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 0, borderRadius: 10, border: `1.5px solid ${isConfiguring ? C.pri : C.border}`, background: isConfiguring ? `${C.pri}06` : "#fff", overflow: "hidden" }}>
                        <button type="button" onClick={() => { setConfiguringFilterKey(isConfiguring ? null : key); setShowFilterPicker(false); }} style={{ padding: "6px 10px", border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 900, color: C.pri, whiteSpace: "nowrap" }}>
                          {field.label}
                        </button>
                        <span style={{ padding: "2px 8px", borderRadius: 6, background: `${C.pri}12`, fontSize: 10, fontWeight: 900, color: C.pri, whiteSpace: "nowrap" }}>
                          {GRASSROOTS_FILTER_OP_LABELS[filter.op] || filter.op}
                        </span>
                        {filterNeedsValue(filter.op) && (
                          <span style={{ padding: "6px 8px 6px 4px", fontSize: 11, fontWeight: 700, color: filter.val === "" ? C.dan : C.text, whiteSpace: "nowrap" }}>
                            {filter.val === "" ? "set value" : String(filter.val)}
                          </span>
                        )}
                        <button type="button" onClick={() => removeFilter(key)} style={{ padding: "6px 8px 6px 2px", border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", color: C.textMut }}>
                          <I.X />
                        </button>
                      </div>

                      {isConfiguring && (
                        <div style={{ marginTop: 6, padding: "10px 14px", borderRadius: 10, background: "#fff", border: `1.5px solid ${C.pri}30`, boxShadow: "0 6px 24px rgba(20,83,45,0.1)", animation: "grassrootsFadeIn 0.2s ease-out" }}>
                          <Label>Condition</Label>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: filterNeedsValue(filter.op) ? 10 : 0 }}>
                            {field.ops.map((op, opIndex) => (
                              <button
                                key={op}
                                type="button"
                                onClick={() => {
                                  updateFilter(key, "op", op);
                                  if (!filterNeedsValue(op)) updateFilter(key, "val", "");
                                }}
                                style={{ padding: "5px 12px", borderRadius: 8, border: `1.5px solid ${filter.op === op ? C.pri : C.borderLight}`, background: filter.op === op ? C.pri : "#fff", color: filter.op === op ? "#fff" : C.text, fontSize: 11, fontWeight: filter.op === op ? 900 : 600, cursor: "pointer", fontFamily: "inherit", animation: `grassrootsFadeIn 0.18s ease-out ${opIndex * 0.02}s both` }}
                              >
                                {GRASSROOTS_FILTER_OP_LABELS[op] || op}
                              </button>
                            ))}
                          </div>
                          {filterNeedsValue(filter.op) && (
                            <>
                              <Label>Value</Label>
                              {field.type === "select" ? (
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                  {(field.options || []).map((option) => (
                                    <button
                                      key={option}
                                      type="button"
                                      onClick={() => updateFilter(key, "val", option)}
                                      style={{ padding: "5px 12px", borderRadius: 8, border: `1.5px solid ${filter.val === option ? C.pri : C.borderLight}`, background: filter.val === option ? C.pri : "#fff", color: filter.val === option ? "#fff" : C.text, fontSize: 11, fontWeight: filter.val === option ? 900 : 600, cursor: "pointer", fontFamily: "inherit" }}
                                    >
                                      {field.key === "status" ? getGrassrootsStatusLabel(option) : option}
                                    </button>
                                  ))}
                                </div>
                              ) : field.type === "date" && filter.op !== "inLastDays" ? (
                                <div style={{ maxWidth: 260 }}>
                                  <MiniDatePicker
                                    value={filter.val}
                                    onChange={(value) => updateFilter(key, "val", value)}
                                    recommendedDate={todayStr()}
                                    recommendedHint="Use today unless you are filtering around a specific follow-up date."
                                  />
                                  <div style={{ marginTop: 8 }}>
                                    <button type="button" onClick={() => setConfiguringFilterKey(null)} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: C.pri, color: "#fff", fontSize: 11, fontWeight: 900, cursor: "pointer", fontFamily: "inherit" }}>Done</button>
                                  </div>
                                </div>
                              ) : (
                                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                  <input
                                    type={field.type === "date" && filter.op !== "inLastDays" ? "date" : field.type === "number" || filter.op === "inLastDays" ? "number" : "text"}
                                    value={filter.val}
                                    onChange={(event) => updateFilter(key, "val", event.target.value)}
                                    onKeyDown={(event) => { if (event.key === "Enter") setConfiguringFilterKey(null); }}
                                    placeholder={filter.op === "inLastDays" ? "Number of days" : "Type a value..."}
                                    autoFocus
                                    style={{ ...INPUT_STYLE, maxWidth: 220, padding: "8px 12px", borderRadius: 8 }}
                                  />
                                  <button type="button" onClick={() => setConfiguringFilterKey(null)} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: C.pri, color: "#fff", fontSize: 11, fontWeight: 900, cursor: "pointer", fontFamily: "inherit" }}>Done</button>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {!showFilterPicker ? (
              <div style={{ marginTop: usedFilterKeys.length > 0 ? 8 : 0, animation: "grassrootsFadeIn 0.2s ease-out" }}>
                <button
                  type="button"
                  onClick={() => { setShowFilterPicker(true); setFilterPickerReady(false); setConfiguringFilterKey(null); setTimeout(() => setFilterPickerReady(true), 10); }}
                  disabled={availableFilterFields.length === 0}
                  style={{ padding: "8px 16px", borderRadius: 10, border: `1.5px dashed ${availableFilterFields.length > 0 ? C.pri : C.border}`, background: "transparent", color: availableFilterFields.length > 0 ? C.pri : C.textMut, fontSize: 12, fontWeight: 900, cursor: availableFilterFields.length > 0 ? "pointer" : "default", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}
                >
                  <I.Plus /> Add Filter
                </button>
              </div>
            ) : (
              <div style={{ marginTop: usedFilterKeys.length > 0 ? 8 : 0, borderRadius: 12, border: `1.5px solid ${C.borderLight}`, background: "#fff", boxShadow: "0 4px 20px rgba(0,0,0,0.06)", overflow: "hidden", animation: "grassrootsSlideIn 0.22s ease-out" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", borderBottom: `1px solid ${C.borderLight}` }}>
                  <span style={{ fontSize: 11, fontWeight: 900, color: C.text }}>Choose a filter</span>
                  <button type="button" onClick={() => setShowFilterPicker(false)} style={{ border: "none", background: "none", cursor: "pointer", color: C.textMut, padding: 2, display: "flex" }}><I.X /></button>
                </div>
                <div style={{ padding: "6px 0" }}>
                  {filterSections.map((section, sectionIndex) => {
                    const sectionFields = availableFilterFields.filter((field) => field.section === section);
                    if (sectionFields.length === 0) return null;
                    return (
                      <div key={section}>
                        <div style={{ padding: "8px 16px 4px", fontSize: 9, fontWeight: 900, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.1em", animation: filterPickerReady ? `grassrootsFadeIn 0.18s ease-out ${sectionIndex * 0.05}s both` : "none" }}>
                          {section}
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, padding: "4px 16px 8px" }}>
                          {sectionFields.map((field, fieldIndex) => (
                            <button
                              key={field.key}
                              type="button"
                              onClick={() => { selectFilterField(field.key); setShowFilterPicker(false); }}
                              style={{ padding: "6px 14px", borderRadius: 8, border: `1.5px solid ${C.borderLight}`, background: "#fff", color: C.text, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", animation: filterPickerReady ? `grassrootsChipIn 0.22s ease-out ${sectionIndex * 0.05 + fieldIndex * 0.03}s both` : "none" }}
                            >
                              {field.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "10px 18px", borderTop: `1px solid ${C.borderLight}`, background: C.surface }}>
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" onClick={applyFilters} style={{ padding: "8px 20px", borderRadius: 10, border: "none", background: C.pri, color: "#fff", fontSize: 12, fontWeight: 900, cursor: "pointer", fontFamily: "inherit" }}>
                Apply{usedFilterKeys.length > 0 ? ` (${usedFilterKeys.length})` : ""}
              </button>
              <button type="button" onClick={clearFilters} style={{ padding: "8px 14px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: "transparent", color: C.textSec, fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                Clear All
              </button>
              <button type="button" onClick={() => { setShowFilterPanel(false); setShowFilterPicker(false); setConfiguringFilterKey(null); }} style={{ padding: "8px 14px", borderRadius: 10, border: `1.5px solid ${C.borderLight}`, background: "transparent", color: C.textMut, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                Close
              </button>
            </div>
          </div>
        </Card>
      )}

      {schemaMissing ? (
        <Card style={{ padding: 28, textAlign: "center", borderRadius: 14 }}>
          <div style={{ fontSize: 17, fontWeight: 900, color: C.text, marginBottom: 6 }}>Grassroots tables are not installed yet</div>
          <div style={{ fontSize: 13, color: C.textMut, lineHeight: 1.5 }}>
            The app is ready for the Grassroots tables, but the Supabase migration has not been applied to this environment.
          </div>
        </Card>
      ) : loading ? (
        <Card style={{ padding: 36, textAlign: "center", color: C.textMut }}>Loading grassroots tracker...</Card>
      ) : (
        <div key={activeCategory} className="grassroots-category-stage" style={{ display: "grid", gap: 12 }}>
          {canEditTargets && newDraft && activeConfig.id !== "events" && (
            <div ref={newDraftScrollRef} className="grassroots-new-draft-anchor">
              <TargetEditor
                draft={newDraft}
                categoryConfig={activeConfig}
                saving={savingDraft}
                attachmentsByActivity={attachmentsByActivity}
                canLog={canLogActivity}
                onChange={updateDraft}
                onSave={saveDraft}
                onCancel={closeEditor}
                onPreviewAttachment={previewGrassrootsAttachment}
                previewingAttachmentId={previewingAttachmentId}
              />
            </div>
          )}

          {activeConfig.id === "drops" && dropSubview === "activity" ? (
            <DropActivityView
              rows={dropActivityRows}
              canLog={canLogActivity}
              onLog={openLogModal}
              onPreviewAttachment={previewGrassrootsAttachment}
              previewingAttachmentId={previewingAttachmentId}
              freshActivityId={freshActivityId}
            />
          ) : visibleTargets.length === 0 && !newDraft ? (
            <Card style={{ padding: 30, textAlign: "center", color: C.textMut, borderRadius: 14 }}>
              <div style={{ fontSize: 16, fontWeight: 900, color: C.text, marginBottom: 6 }}>No {activeConfig.label.toLowerCase()} match this view</div>
              <div style={{ fontSize: 13, marginBottom: 16 }}>Add a row or adjust the filter.</div>
              {canEditTargets && <Btn variant="primary" icon={<I.Plus />} onClick={openNewDraft}>Add {activeConfig.singular}</Btn>}
            </Card>
          ) : (
            <>
              <TrackerHeader
                categoryConfig={activeConfig}
                eventDateSortDirection={eventDateSortDirection}
                onToggleEventDateSort={() => setEventDateSortDirection((current) => (current === "asc" ? "desc" : "asc"))}
              />
              {canEditTargets && newDraft && activeConfig.id === "events" && (
                <div ref={newDraftScrollRef} className="grassroots-new-draft-anchor">
                  <EventTargetInlineEditor
                    key="new-event-draft"
                    draft={newDraft}
                    saving={savingDraft}
                    onChange={updateDraft}
                    onSave={saveDraft}
                    onCancel={closeEditor}
                  />
                </div>
              )}
              {sortedVisibleTargets.map((target, index) => {
                const rowActivities = activitiesByTarget[target.id] || [];
                if (canEditTargets && activeConfig.id === "events" && editDraft?.id === target.id) {
                  return (
                    <EventTargetInlineEditor
                      key={target.id}
                      draft={editDraft}
                      saving={savingDraft}
                      activities={rowActivities}
                      attachmentsByActivity={attachmentsByActivity}
                      canLog={canLogActivity}
                      onChange={updateDraft}
                      onSave={saveDraft}
                      onCancel={closeEditor}
                      onDelete={() => deleteTarget(editDraft)}
                      onLog={() => openLogModal(target)}
                      onPreviewAttachment={previewGrassrootsAttachment}
                      previewingAttachmentId={previewingAttachmentId}
                    />
                  );
                }
                if (canEditTargets && activeConfig.id !== "events" && editDraft?.id === target.id) {
                  return (
                    <TargetEditor
                      key={target.id}
                      draft={editDraft}
                      categoryConfig={activeConfig}
                      saving={savingDraft}
                      activities={rowActivities}
                      attachmentsByActivity={attachmentsByActivity}
                      canLog={canLogActivity}
                      onChange={updateDraft}
                      onSave={saveDraft}
                      onCancel={closeEditor}
                      onDelete={() => deleteTarget(editDraft)}
                      onLog={() => openLogModal(target)}
                      onPreviewAttachment={previewGrassrootsAttachment}
                      previewingAttachmentId={previewingAttachmentId}
                    />
                  );
                }
                return (
                  <TrackerRow
                    key={target.id}
                    target={target}
                    index={index}
                    categoryConfig={activeConfig}
                    activities={rowActivities}
                    attachmentsByActivity={attachmentsByActivity}
                    isExpanded={expandedUpdates.has(target.id)}
                    isFresh={freshTargetId === target.id}
                    canLog={canLogActivity}
                    canEdit={canEditTargets}
                    onToggleUpdates={() => setExpandedUpdates((prev) => {
                      const next = new Set(prev);
                      if (next.has(target.id)) next.delete(target.id);
                      else next.add(target.id);
                      return next;
                    })}
                    onLog={() => openLogModal(target)}
                    onMove={(event) => openMovePopover(target, event)}
                    onPreviewAttachment={previewGrassrootsAttachment}
                    previewingAttachmentId={previewingAttachmentId}
                    onEdit={() => {
                      setNewDraft(null);
                      setEditDraft(buildEditorDraft(target));
                    }}
                  />
                );
              })}
            </>
          )}
        </div>
      )}

      {canEditTargets && movePopover && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9998 }} onClick={() => setMovePopover(null)}>
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              position: "fixed",
              left: Math.min(movePopover.x || 300, window.innerWidth - 320),
              top: movePopover.y || 200,
              zIndex: 9999,
              width: 300,
              background: C.surface,
              border: `1.5px solid ${C.border}`,
              borderRadius: 14,
              boxShadow: "0 12px 40px rgba(15,23,42,0.18)",
              padding: 12,
            }}
          >
            <div style={{ padding: "4px 4px 10px", fontSize: 12, fontWeight: 900, color: C.text, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Move to
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              {GRASSROOTS_CATEGORY_CONFIGS
                .filter((category) => category.dbValue !== movePopover.target.category)
                .map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => moveTarget(movePopover.target, category)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: `1.5px solid ${C.borderLight}`,
                      background: "#fff",
                      color: C.text,
                      fontSize: 13,
                      fontWeight: 800,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      textAlign: "left",
                    }}
                  >
                    <span>{category.label}</span>
                    <I.ChevronRight />
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {canLogActivity && logModal && (
        <LogActivityModal
          logModal={logModal}
          businessQuery={logBusinessQuery}
          selectedTarget={logSelectedTarget}
          businessDraft={logBusinessDraft}
          internalOptions={logBusinessOptions}
          notes={logNotes}
          activityDate={logActivityDate}
          nextDate={logDate}
          contactName={logContactName}
          materialsLeft={logMaterialsLeft}
          outcome={logOutcome}
          followUpPriority={logFollowUpPriority}
          partnershipPotential={logPartnershipPotential}
          files={logFiles}
          fileErrors={logFileErrors}
          saving={savingLog}
          fileInputRef={logFileInputRef}
          attachmentsSchemaMissing={attachmentsSchemaMissing}
          onBusinessQueryChange={(value) => {
            setLogBusinessQuery(value);
            setLogSelectedTarget(null);
            setLogBusinessDraft(null);
          }}
          onInternalBusinessSelect={(target) => {
            setLogSelectedTarget(target);
            setLogBusinessDraft(null);
          }}
          onGoogleBusinessSelect={handleSelectGoogleLogBusiness}
          onActivityDateChange={setLogActivityDate}
          onNextDateChange={setLogDate}
          onContactNameChange={setLogContactName}
          onMaterialsLeftChange={setLogMaterialsLeft}
          onOutcomeChange={setLogOutcome}
          onNotesChange={setLogNotes}
          onFollowUpPriorityChange={setLogFollowUpPriority}
          onPartnershipPotentialChange={setLogPartnershipPotential}
          onFileChange={handleLogFileChange}
          onRemoveFile={removeLogFile}
          onClose={resetLogForm}
          onSave={saveLog}
        />
      )}

      {attachmentPreview && (
        <Modal title={attachmentPreview.attachment?.file_name || "Attachment Preview"} onClose={() => setAttachmentPreview(null)} fullWidth>
          <div style={{ height: "calc(100vh - 180px)", minHeight: 420, display: "flex", alignItems: "center", justifyContent: "center", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
            {attachmentPreview.kind === "image" ? (
              <img
                src={attachmentPreview.url}
                alt={attachmentPreview.attachment?.file_name || "Grassroots attachment"}
                style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
              />
            ) : (
              <iframe
                title={attachmentPreview.attachment?.file_name || "Grassroots attachment"}
                src={`${attachmentPreview.url}#toolbar=0&navpanes=0&scrollbar=1`}
                style={{ width: "100%", height: "100%", border: "none", background: "#fff" }}
              />
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
