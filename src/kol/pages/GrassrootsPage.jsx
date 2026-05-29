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
  buildGrassrootsDropCategoryCounts,
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
  filterGrassrootsDropActivityRowsByCategory,
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
  padding: "8px 10px",
  borderRadius: 8,
  border: `1.5px solid ${C.border}`,
  background: "#fff",
  color: C.text,
  fontSize: 12,
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
  development_updated: "Edited Development",
  drop_updated: "Edited Drop",
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

function usesNextDateColumn(categoryConfig) {
  return categoryConfig.id !== "events" && categoryConfig.id !== "drops";
}

function getTrackerGridColumns(categoryConfig) {
  if (categoryConfig.id === "petProfessionalPartnerships") {
    return "42px minmax(210px, 1.7fr) minmax(125px, 0.75fr) minmax(130px, 0.8fr) minmax(120px, 0.7fr) 118px minmax(340px, 1.4fr)";
  }
  if (categoryConfig.id === "drops") {
    return "42px minmax(320px, 2.2fr) minmax(150px, 0.85fr) 118px minmax(370px, 1.5fr)";
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

function fmtTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString("en-US", {
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
  // Legacy Autocomplete shape
  if (place?.address_components) {
    const components = Array.isArray(place.address_components) ? place.address_components : [];
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

  // New Places Library shape (addressComponents as array of objects with longText/shortText)
  if (place?.addressComponents) {
    const components = place.addressComponents;
    const find = (type) => components.find((c) => c.types?.includes(type));

    const streetNumber = find("street_number")?.longText || "";
    const route = find("route")?.longText || "";
    const postal = find("postal_code")?.longText || "";
    const postalSuffix = find("postal_code_suffix")?.longText || "";
    const postalCode = [postal, postalSuffix].filter(Boolean).join("-");

    const city = find("locality")?.longText ||
                 find("postal_town")?.longText ||
                 find("sublocality")?.longText ||
                 find("administrative_area_level_3")?.longText || "";

    const state = find("administrative_area_level_1")?.shortText || "";
    const country = find("country")?.shortText || "";

    const line1 = [streetNumber, route].filter(Boolean).join(" ").trim();

    return {
      address: place.formattedAddress || "",
      address_line_1: line1,
      address_line_2: "",
      address_city: city,
      address_state: state,
      address_postal_code: postalCode,
      address_country: country,
      google_place_id: place.id || "",
    };
  }

  // Fallback: no structured components, but still carry the place id through if
  // one was supplied (place_id from the legacy API, id from the new Places lib).
  const fallback = parseFreeformGrassrootsAddress(place?.formattedAddress || place?.formatted_address || "");
  return { ...fallback, google_place_id: place?.place_id || place?.id || fallback.google_place_id || "" };
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

  // First try the structured comma split
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  let postalCode = "";
  let state = "";
  let city = "";
  let line1 = "";

  if (parts.length >= 3) {
    const countryRaw = parts.at(-1) || "";
    const country = /^u\.?s\.?a?\.?$/i.test(countryRaw) || /^united states/i.test(countryRaw) ? "US" : countryRaw;
    const statePostal = parts.at(-2) || "";
    const statePostalMatch = statePostal.match(/^([A-Z]{2})(?:\s+(\d{5}(?:-\d{4})?))?$/i);
    const postalOnlyMatch = statePostal.match(/(\d{5}(?:-\d{4})?)$/);
    state = statePostalMatch?.[1]?.toUpperCase() || "";
    postalCode = statePostalMatch?.[2] || postalOnlyMatch?.[1] || "";
    city = parts.at(-3) || "";
    line1 = parts.slice(0, -3).join(", ");

    if (postalCode) {
      return {
        ...blank,
        address_line_1: line1,
        address_city: city,
        address_state: state,
        address_postal_code: postalCode,
        address_country: country,
      };
    }
  }

  // Aggressive fallback: hunt for any 5-digit ZIP anywhere in the string
  const zipMatch = address.match(/\b(\d{5})(?:-\d{4})?\b/);
  if (zipMatch) {
    postalCode = zipMatch[1];
  }

  // Try to extract state if still missing
  if (!state) {
    const stateMatch = address.match(/\b([A-Z]{2})\b/);
    if (stateMatch) state = stateMatch[1];
  }

  return {
    ...blank,
    address_line_1: line1 || address,
    address_city: city,
    address_state: state,
    address_postal_code: postalCode,
    address_country: "US",
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

const ACTIVITY_HISTORY_FIELDS = [
  { key: "activity_date", label: "Activity Date", type: "date" },
  { key: "next_contact_date", label: "Follow-Up Date", type: "date" },
  { key: "metadata.person_spoken_with", label: "Spoke With" },
  { key: "metadata.materials_left", label: "Materials Left" },
  { key: "metadata.outcome", label: "Outcome" },
  { key: "metadata.follow_up_priority", label: "Follow-Up Needed", type: "boolean" },
  { key: "metadata.partnership_potential", label: "Partnership Potential", type: "boolean" },
  { key: "notes", label: "Notes" },
];

function getNestedHistoryValue(source, key) {
  return key.split(".").reduce((value, part) => {
    if (!value || typeof value !== "object") return undefined;
    return value[part];
  }, source);
}

function normalizeHistoryCompareValue(value, type) {
  if (type === "boolean") return Boolean(value);
  if (value == null) return "";
  return String(value);
}

function formatHistoryChangeValue(value, type) {
  if (type === "boolean") return value ? "Yes" : "No";
  if (type === "date") return value ? fmtDate(value) : "None";
  const text = String(value || "").trim();
  return text || "None";
}

function getActivityHistoryChanges(entry) {
  if (!["drop_updated", "development_updated"].includes(entry?.event_type)) return [];
  const before = entry.before_snapshot || {};
  const after = entry.after_snapshot || {};
  return ACTIVITY_HISTORY_FIELDS.flatMap((field) => {
    const beforeValue = getNestedHistoryValue(before, field.key);
    const afterValue = getNestedHistoryValue(after, field.key);
    if (normalizeHistoryCompareValue(beforeValue, field.type) === normalizeHistoryCompareValue(afterValue, field.type)) return [];
    return [{
      label: field.label,
      before: formatHistoryChangeValue(beforeValue, field.type),
      after: formatHistoryChangeValue(afterValue, field.type),
    }];
  });
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
  const [suggestions, setSuggestions] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const inputRef = useRef(null);
  const dropdownRef = useRef(null);
  const debounceRef = useRef(null);

  const fetchSuggestions = async (inputValue) => {
    const q = (inputValue || "").trim();
    if (!q || q.length < 3) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    try {
      const ready = await loadGooglePlacesScript();
      const hasNewAPI = !!(window.google?.maps?.places?.AutocompleteSuggestion);
      if (!ready || !hasNewAPI) {
        setSuggestions([]);
        setIsOpen(false);
        return;
      }

      const request = {
        input: q,
        locationBias: { center: { lat: 39.9, lng: -74.95 }, radius: 50000 },
        includedRegionCodes: ["us"],
      };

      const { suggestions: results = [] } = await window.google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions(request);

      setSuggestions(results);
      setIsOpen(results.length > 0);
      setActiveIndex(-1);
    } catch (err) {
      console.error("AutocompleteSuggestion fetch failed", err);
      setSuggestions([]);
      setIsOpen(false);
    }
  };

  const handleInputChange = (e) => {
    const val = e.target.value || "";
    onChange(val);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 260);
  };

  const selectSuggestion = async (suggestion) => {
    const prediction = suggestion.placePrediction;
    const placeId = prediction?.placeId;

    if (!prediction || !placeId) {
      setIsOpen(false);
      setSuggestions([]);
      return;
    }

    setIsOpen(false);
    setSuggestions([]);
    setActiveIndex(-1);

    try {
      // Modern Places API (New): resolve the prediction to a Place and fetch its
      // address components (incl. postal_code) and formatted address.
      const place = prediction.toPlace();
      await place.fetchFields({ fields: ['addressComponents', 'formattedAddress'] });

      const parsed = parseGooglePlaceAddress(place);
      const visible = getGrassrootsVisibleAddressLine(parsed) || place.formattedAddress || "";

      onChange(visible);
      onPlaceSelect?.({ ...parsed, address: visible });
    } catch (err) {
      console.error("Place.fetchFields selection failed", err);
    }
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target) &&
        inputRef.current &&
        !inputRef.current.contains(event.target)
      ) {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleKeyDown = (e) => {
    if (!isOpen || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      selectSuggestion(suggestions[activeIndex]);
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setActiveIndex(-1);
    }
  };

  return (
    <div style={{ position: "relative" }}>
      <label style={{ display: "block" }}>
        <Label>{label}</Label>
        <input
          ref={inputRef}
          value={value || ""}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => suggestions.length > 0 && setIsOpen(true)}
          placeholder={placeholder}
          autoComplete="off"
          data-1p-ignore="true"
          data-lpignore="true"
          data-form-type="other"
          style={{ ...INPUT_STYLE, background: C.bg }}
        />
      </label>

      {isOpen && suggestions.length > 0 && (
        <div
          ref={dropdownRef}
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            zIndex: 100,
            background: "#fff",
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
            marginTop: 2,
            maxHeight: 300,
            overflowY: "auto",
            fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          }}
        >
          {suggestions.map((s, index) => {
            const pred = s.placePrediction;
            const main = pred?.text?.text || "";
            const secondary = pred?.structuredFormat?.secondaryText?.text || "";

            return (
              <div
                key={index}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  selectSuggestion(s);
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  selectSuggestion(s);
                }}
                onMouseEnter={() => setActiveIndex(index)}
                style={{
                  padding: "6px 12px",
                  fontSize: 13,
                  cursor: "pointer",
                  background: index === activeIndex ? "#F3F4F6" : "transparent",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: "#111827", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {main}
                  </div>
                  {secondary && (
                    <div style={{ fontSize: 12, color: "#6B7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {secondary}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          <div style={{
            padding: "4px 12px",
            fontSize: 10,
            color: "#9CA3AF",
            background: "#F9FAFB",
            borderTop: `1px solid ${C.borderLight}`,
            textAlign: "right",
          }}>
            Suggestions powered by Google
          </div>
        </div>
      )}
    </div>
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
      <div className="grassroots-event-form-section-title">
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

  // No custom date popover state needed for quick capture — we use CalendarPicker directly.

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

  // Quick capture mode for new events (minimal, clean, fast)
  if (draft.isDraft) {
    const dates = Array.isArray(draft.event_dates) ? draft.event_dates : [];

    return (
      <div className="grassroots-event-inline-editor grassroots-event-dense">
        <div className="grassroots-event-inline-header" style={{ background: 'transparent', borderBottom: `1px solid ${C.borderLight}` }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.textSec, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              New Event
            </div>
          </div>
          <button type="button" onClick={onCancel} aria-label="Close" title="Close" className="grassroots-event-inline-close">
            <I.X />
          </button>
        </div>

        <div style={{ padding: "14px 16px 8px" }}>
          {/* Consistent 3-column grid for both rows so everything lines up */}
          <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr", gap: "12px", marginBottom: "14px" }}>
            {/* Event Name */}
            <div style={{ gridColumn: "1 / 2" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.textSec, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Event Name
              </div>
              <input
                type="text"
                value={draft.name || ""}
                onChange={(e) => onChange("name", e.target.value)}
                placeholder="Event name"
                style={{ width: "100%", padding: "9px 11px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 15, fontWeight: 500, fontFamily: "inherit", outline: "none" }}
                autoFocus
              />
            </div>

            {/* Progressive optional dates for quick capture (no multi-day toggle).
                One required date. As you fill dates, additional grayed-out optional fields appear. */}
            <div style={{ gridColumn: "2 / 4" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.textSec, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Date(s)
              </div>

              {(() => {
                let displayDates = [...(dates.length ? dates : [{ id: "d1", event_date: "" }])];
                if (displayDates.length === 0 || displayDates[displayDates.length - 1].event_date) {
                  displayDates.push({ id: `d${displayDates.length + 1}`, event_date: "" });
                }
                return displayDates.map((d, idx) => {
                  const isOptional = idx > 0;
                  return (
                    <div key={d.id || idx} style={{ marginBottom: 6 }}>
                      <input
                        type="date"
                        value={d.event_date || ""}
                        placeholder={isOptional ? "Additional date (optional)" : ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          let next = [...dates];
                          if (idx < next.length) {
                            next[idx] = { ...(next[idx] || {}), event_date: val };
                          } else {
                            next.push({ id: `d${next.length + 1}`, event_date: val });
                          }
                          while (next.length > 1 && !next[next.length - 1].event_date) {
                            next.pop();
                          }
                          onChange("event_dates", next);
                          e.target.blur();
                        }}
                        style={{
                          width: "100%",
                          padding: "8px 10px",
                          border: `1px solid ${C.border}`,
                          borderRadius: 8,
                          fontSize: 14,
                          fontFamily: "inherit",
                          opacity: isOptional && !d.event_date ? 0.55 : 1,
                          background: isOptional && !d.event_date ? "#f8fafc" : undefined,
                        }}
                      />
                    </div>
                  );
                });
              })()}
            </div>

            {/* Row 2: Organizer / Contact */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.textSec, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Organizer / Contact
              </div>
              <input
                type="text"
                value={draft.organizer || ""}
                onChange={(e) => onChange("organizer", e.target.value)}
                placeholder="Name (optional)"
                style={{ width: "100%", padding: "7px 10px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit" }}
              />
            </div>

            {/* Row 2: Phone */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.textSec, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Phone
              </div>
              <input
                type="text"
                value={draft.contact_phone || ""}
                onChange={(e) => onChange("contact_phone", e.target.value)}
                placeholder="(optional)"
                style={{ width: "100%", padding: "7px 10px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit" }}
              />
            </div>

            {/* Row 2: Email */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.textSec, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Email
              </div>
              <input
                type="email"
                value={draft.contact_email || ""}
                onChange={(e) => onChange("contact_email", e.target.value)}
                placeholder="(optional)"
                style={{ width: "100%", padding: "7px 10px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit" }}
              />
            </div>
          </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "10px 16px", borderTop: `1px solid ${C.borderLight}` }}>
          <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
          <Btn variant="primary" onClick={onSave} disabled={saving || !draft.name?.trim()}>
            {saving ? "Saving..." : "Save"}
          </Btn>
        </div>
      </div>
      </div>
    );
  }

  // Full edit mode for existing events (richer details)
  return (
    <div className="grassroots-event-inline-editor grassroots-event-dense">
        <div className="grassroots-event-inline-header">
          <div>
            <div style={{ fontSize: 9, fontWeight: 900, color: C.pri, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Edit Event
            </div>
            <div style={{ marginTop: 1, fontSize: 10, color: C.textMut }}>
              Update without leaving the tracker
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
          </FormSection>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 6, flexWrap: "wrap", paddingTop: 6, borderTop: `1px solid ${C.borderLight}` }}>
          <div>
            <Btn variant="ghost" size="sm" icon={<I.Trash />} onClick={onDelete} style={{ color: C.dan }}>
              Delete
            </Btn>
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
      {rows.map((entry) => {
        const changes = getActivityHistoryChanges(entry);
        return (
          <div key={entry.id} style={{ display: "grid", gridTemplateColumns: "132px minmax(0, 1fr) 190px", gap: 10, alignItems: "start", fontSize: 12 }}>
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
              {changes.length > 0 && (
                <div className="grassroots-history-change-list">
                  {changes.map((change) => (
                    <div key={change.label} className="grassroots-history-change-row">
                      <strong>{change.label}</strong>
                      <span>{change.before}</span>
                      <em>to</em>
                      <span>{change.after}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ color: C.textMut, fontWeight: 800, textAlign: "right" }}>
              {fmtDateTime(entry.event_at || entry.created_at)}
            </div>
          </div>
        );
      })}
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
  const showNextDateColumn = usesNextDateColumn(categoryConfig);
  return (
    <div style={{ display: "grid", gridTemplateColumns: gridColumns, alignItems: "center", gap: 10, padding: "0 14px 0", minHeight: 22, boxSizing: "border-box" }}>
      <div />
      <div style={HEADER_CELL_STYLE}>{categoryConfig.nameLabel}</div>
      {usesBusinessCategoryColumn(categoryConfig) && <div style={HEADER_CELL_STYLE}>Category</div>}
      {categoryConfig.usesStatus !== false && <div style={HEADER_CELL_STYLE}>Status</div>}
      {categoryConfig.id === "events" && <EventDateSortHeader direction={eventDateSortDirection} onToggle={onToggleEventDateSort} />}
      {showNextDateColumn && <div style={HEADER_CELL_STYLE}>Next Contact</div>}
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

// ─────────────────────────────────────────────────────────────────────────────
// DENSE GRASSROOTS TABLE — Exact tight styling the user loves from Clients lifecycle
// (Replaces the loose category card + wide tracker rows with a super-dense table)
// ─────────────────────────────────────────────────────────────────────────────
// Per-category column configuration for the shared dense table. The Events shape
// is the default; other categories map their own data into the same standard
// columns (Organizer / Event / Date / Status / Notes / Follow-Up / Updates) so the
// "All" view can stack every category in one table. `get.*` are optional getters
// (target, activities) -> value; when absent the built-in Events derivation is used.
function getGrassrootsColumnMap(categoryId, subview = null) {
  const lastActivityDate = (t, acts = []) => {
    const d = [...acts].map((a) => a.activity_date || a.created_at).filter(Boolean).sort().pop();
    return d ? fmtDate(d) : "—";
  };
  const events = {
    headers: { organizer: "Organizer", event: "Event", eventDate: "Event Date", status: "Status", notes: "Notes", followUp: "Follow-Up", updates: "Updates" },
    show: { event: true, eventDate: true, status: true, notes: true, followUp: true },
    sortable: { eventDate: true, followUp: true },
    statusVariant: "pill",
    updatesMode: "log",
    allowEventLink: true,
    emptyText: "No events match. Add one or clear filters.",
    get: {},
  };
  if (categoryId === "all") {
    // Cross-category view: each row maps itself using its own category's config.
    return {
      headers: { organizer: "Organizer / Business", event: "Event / Category", eventDate: "Date", status: "Status", notes: "Notes", followUp: "Follow-Up", updates: "Updates" },
      show: { event: true, eventDate: true, status: true, notes: true, followUp: true },
      sortable: { eventDate: false, followUp: true },
      statusVariant: "pill",
      updatesMode: "log",
      allowEventLink: true,
      emptyText: "No grassroots targets match this view.",
      get: {
        organizer: (t, acts) => {
          const m = getGrassrootsColumnMap(t.category);
          return m.get.organizer ? m.get.organizer(t, acts) : (t.organizer || [t.first_name, t.last_name].filter(Boolean).join(" ") || t.name || t.contact_source || "—");
        },
        event: (t, acts) => {
          const m = getGrassrootsColumnMap(t.category);
          const val = m.show.event ? (m.get.event ? m.get.event(t, acts) : (t.name || "")) : "";
          const typeLabel = t.category === "drops" ? "Visit" : t.category === "events" ? "Event" : null;
          if (!typeLabel) return val;
          return val ? `${typeLabel}: ${val}` : typeLabel;
        },
        eventDate: (t, acts) => {
          const m = getGrassrootsColumnMap(t.category);
          if (!m.show.eventDate) return "";
          if (m.get.eventDate) return m.get.eventDate(t, acts);
          const d = getGrassrootsPrimaryEventDate(t);
          return d ? fmtDate(d) : "";
        },
      },
    };
  }
  if (categoryId === "drops" && subview === "activity") {
    return {
      headers: { organizer: "Business", event: "Category", eventDate: "Date", status: "Outcome", notes: "Summary", followUp: "Follow-Up", updates: "Updates" },
      show: { event: true, eventDate: true, status: true, notes: true, followUp: false },
      sortable: { eventDate: false, followUp: false },
      statusVariant: "text",
      updatesMode: "edit",
      allowEventLink: false,
      emptyText: "No visit activity matches this view.",
      get: {
        organizer: (r) => r.businessName || "—",
        event: (r) => r.businessCategory || "—",
        eventDate: (r) => (r.activityDate ? fmtDate(r.activityDate) : "—"),
        statusText: (r) => r.outcome || "",
        notes: (r) => r.notes || r.personSpokenWith || "",
      },
    };
  }
  if (categoryId === "drops") {
    return {
      headers: { organizer: "Business", event: "Category", eventDate: "Last Visit", status: "Status", notes: "Notes", followUp: "Follow-Up", updates: "Updates" },
      show: { event: true, eventDate: true, status: false, notes: false, followUp: true },
      sortable: { eventDate: false, followUp: true },
      statusVariant: "pill",
      updatesMode: "log",
      allowEventLink: false,
      emptyText: "No visit businesses match this view.",
      get: {
        organizer: (t) => t.name || "—",
        event: (t) => t.business_category || "—",
        eventDate: (t, acts) => lastActivityDate(t, acts),
      },
    };
  }
  if (categoryId === "corporatePartnerships" || categoryId === "corporate_partnerships") {
    return {
      headers: { organizer: "Corporation", event: "Employees", eventDate: "", status: "Status", notes: "Notes", followUp: "Follow-Up", updates: "Updates" },
      show: { event: true, eventDate: false, status: true, notes: true, followUp: true },
      sortable: { eventDate: false, followUp: true },
      statusVariant: "pill",
      updatesMode: "log",
      allowEventLink: false,
      emptyText: "No corporate partnerships match this view.",
      get: {
        organizer: (t) => t.name || "—",
        event: (t) => {
          const loc = t.local_employees, us = t.us_employees;
          if (!loc && !us) return "—";
          return [loc ? `${loc} local` : null, us ? `${us} US` : null].filter(Boolean).join(" · ");
        },
        eventDate: () => "",
      },
    };
  }
  if (categoryId === "apartments") {
    return {
      headers: { organizer: "Apartment Complex", event: "", eventDate: "", status: "Status", notes: "Notes", followUp: "Follow-Up", updates: "Updates" },
      show: { event: false, eventDate: false, status: true, notes: true, followUp: true },
      sortable: { eventDate: false, followUp: true },
      statusVariant: "pill",
      updatesMode: "log",
      allowEventLink: false,
      emptyText: "No apartments match this view.",
      get: { organizer: (t) => t.name || "—", eventDate: () => "" },
    };
  }
  if (categoryId === "petProfessionalPartnerships" || categoryId === "pet_professional_partnerships") {
    return {
      headers: { organizer: "Business", event: "Category", eventDate: "", status: "Status", notes: "Notes", followUp: "Follow-Up", updates: "Updates" },
      show: { event: true, eventDate: false, status: true, notes: true, followUp: true },
      sortable: { eventDate: false, followUp: true },
      statusVariant: "pill",
      updatesMode: "log",
      allowEventLink: false,
      emptyText: "No pet professional partnerships match this view.",
      get: {
        organizer: (t) => t.name || "—",
        event: (t) => t.business_category || "—",
        eventDate: () => "",
      },
    };
  }
  return events;
}

function DenseGrassrootsTable({
  targets, activitiesByTarget, categoryConfig, columnMap, onLog, onEdit, onUpdateFollowUp, onToggleUpdates,
  expandedUpdates, eventDateSortDirection, onToggleEventDateSort, followUpSortDirection, onToggleFollowUpSort, onShowFollowUpInfo,
  inlineLoggingId, inlineLogNotes, inlineLogNextDate, onStartInlineLog, onInlineLogNotesChange, onInlineLogNextDateChange, onSaveInlineLog, onCancelInlineLog,
  savingLog
}) {
  const C = { bg: "#F5F6F8", surface: "#fff", border: "#DFE2E8", borderLight: "#ECEEF2", text: "#1A1D23", textSec: "#5A6170", textMut: "#959BA8", pri: "#003462", priLt: "#E6EEF6", acc: "#AF8D54", suc: "#0D7A56", dan: "#C42B2B" };

  // Column configuration — Events shape by default; other categories map their data into the same columns.
  const cm = columnMap || getGrassrootsColumnMap("events");

  // 7-col dense grid — Follow-up placed immediately left of Updates (per request).
  // Tuned widths for better visual balance and tighter overall spacing.
  const grid = "minmax(105px, 1.1fr) minmax(155px, 1.7fr) 95px 100px minmax(135px, 1.25fr) 82px minmax(118px, 1.05fr)";

  const today = new Date().toISOString().slice(0, 10);

  const [hoveredLinkId, setHoveredLinkId] = useState(null);
  const [copiedLinkId, setCopiedLinkId] = useState(null);

  const copyLink = (href, id) => {
    navigator.clipboard.writeText(href).then(() => {
      setCopiedLinkId(id);
      setTimeout(() => setCopiedLinkId(null), 1200);
    }).catch(() => {});
  };

  // Stable per-row handler (completes Round 2 perf hoisting for the count button)
  const handleCountClick = useCallback((id, e) => {
    e.stopPropagation();
    onToggleUpdates && onToggleUpdates(id);
  }, [onToggleUpdates]);

  const STATUS_STYLES = {
    identified: { bg: "#FEF3C7", fg: "#92400E" },
    corresponding: { bg: "#DBEAFE", fg: "#1E40AF" },
    booked: { bg: "#DCFCE7", fg: "#166534" },
    abandoned: { bg: "#FEE2E2", fg: "#991B1B" },
    default: { bg: "#E5E7EB", fg: "#374151" },
  };

  const formatShortDate = (d) => {
    if (!d) return "";
    try { return new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit" }); } catch { return d; }
  };

  return (
    <div style={{ background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
      {/* Exact clients-style dense header — tightened per variant 1 choice */}
      <div style={{ display: "grid", gridTemplateColumns: grid, columnGap: "8px", padding: "6px 12px", background: "rgb(255,255,255)", borderBottom: "1px solid rgb(226,232,240)", fontSize: 10, fontWeight: 700, color: "rgb(71,85,105)", textTransform: "uppercase", letterSpacing: "0.06em", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", minHeight: 18 }}>{cm.headers.organizer}</div>
        <div style={{ display: "flex", alignItems: "center", minHeight: 18 }}>{cm.show.event ? cm.headers.event : ""}</div>
        <div
          onClick={cm.sortable.eventDate ? onToggleEventDateSort : undefined}
          style={{ cursor: cm.sortable.eventDate ? "pointer" : "default", userSelect: "none", color: (cm.sortable.eventDate && eventDateSortDirection) ? "#003462" : "rgb(71,85,105)", fontWeight: (cm.sortable.eventDate && eventDateSortDirection) ? 800 : 700, display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap", minHeight: 18 }}
          title={cm.sortable.eventDate ? "Sort by event date" : undefined}
        >
          {cm.show.eventDate ? cm.headers.eventDate : ""}{cm.sortable.eventDate && eventDateSortDirection === "asc" ? " ▲" : cm.sortable.eventDate && eventDateSortDirection === "desc" ? " ▼" : ""}
        </div>
        <div style={{ display: "flex", alignItems: "center", minHeight: 18 }}>{cm.show.status ? cm.headers.status : ""}</div>
        <div style={{ display: "flex", alignItems: "center", minHeight: 18 }}>{cm.show.notes ? cm.headers.notes : ""}</div>
        <div
          onClick={cm.sortable.followUp ? onToggleFollowUpSort : undefined}
          style={{ cursor: cm.sortable.followUp ? "pointer" : "default", userSelect: "none", color: (cm.sortable.followUp && followUpSortDirection) ? "#003462" : "rgb(71,85,105)", fontWeight: (cm.sortable.followUp && followUpSortDirection) ? 800 : 700, display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap", minHeight: 18 }}
          title={cm.sortable.followUp ? "Sort by follow-up date" : undefined}
        >
          {cm.headers.followUp}{cm.sortable.followUp && followUpSortDirection === "asc" ? " ▲" : cm.sortable.followUp && followUpSortDirection === "desc" ? " ▼" : ""}
        </div>
        <div style={{ display: "flex", alignItems: "center", minHeight: 18 }}>{cm.headers.updates}</div>
      </div>

      {targets.length === 0 && (
        <div style={{ padding: "32px 14px", textAlign: "center", color: C.textSec, fontSize: 13 }}>
          {cm.emptyText}
        </div>
      )}

      {targets.map((target) => {
        const targetActivities = activitiesByTarget[target.id] || [];
        const latestActivity = [...targetActivities].sort((a, b) => String(b.activity_date || b.created_at || "").localeCompare(String(a.activity_date || a.created_at || "")))[0];
        const latestNote = latestActivity ? (latestActivity.notes || latestActivity.description || "") : "";
        const notePreview = cm.get.notes ? cm.get.notes(target, targetActivities) : (latestNote ? `${formatShortDate(latestActivity.activity_date || latestActivity.created_at)}: ${latestNote}` : (target.proposal || "—"));

        const followUp = target.next_contact_date || "";
        const isOverdue = !!followUp && followUp < todayStr();
        const isToday = !!followUp && followUp === todayStr();

        const statusKey = normalizeGrassrootsStatus(target.status);
        const st = STATUS_STYLES[statusKey] || STATUS_STYLES.default;

        const eventDate = getGrassrootsPrimaryEventDate(target);
        const eventDateStr = cm.get.eventDate ? cm.get.eventDate(target, targetActivities) : (eventDate ? fmtDate(eventDate) : "—");

        const baseOrganizer = target.organizer || [target.first_name, target.last_name].filter(Boolean).join(" ") || target.contact_source || "—";
        const organizer = cm.get.organizer ? cm.get.organizer(target, targetActivities) : baseOrganizer;
        const eventName = cm.get.event ? cm.get.event(target, targetActivities) : (target.name || categoryConfig.emptyName || "Untitled event");
        const cStatusText = cm.get.statusText ? cm.get.statusText(target, targetActivities) : null;

        const primaryLinkRaw = (Array.isArray(target.details?.links) ? target.details.links : [])
          .map((l) => l?.url || l?.href || "")
          .find((u) => String(u).trim()) || target.link || target.event_link || "";
        const primaryHref = getSafeEventLinkHref(primaryLinkRaw);

        const isExp = !!(expandedUpdates && expandedUpdates.has(target.id));

        return (
          <div key={target.id}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: grid,
                columnGap: "8px",
                padding: "4px 10px",
                borderBottom: `1px solid ${C.borderLight}`,
                fontSize: 12,
                alignItems: "start",
              }}
            >
              {/* Organizer */}
              <div style={{ fontWeight: 700, color: C.pri, wordBreak: "break-word", fontSize: 12, lineHeight: 1.25 }} title={organizer}>
                {organizer}
              </div>

              {/* Event name — hyperlink to the stored link (if any). On hover: explicit Copy + Open icons. */}
              <div 
                style={{ 
                  fontWeight: 600, 
                  color: C.text, 
                  wordBreak: "break-word",
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4
                }}
                onMouseEnter={() => primaryHref && setHoveredLinkId(target.id)}
                onMouseLeave={() => setHoveredLinkId(null)}
              >
                {(cm.allowEventLink && primaryHref) ? (
                  <a
                    href={primaryHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    style={{ color: "inherit", textDecoration: "none" }}
                    title={primaryHref}
                  >
                    {eventName}
                  </a>
                ) : (
                  eventName
                )}

                {cm.allowEventLink && primaryHref && hoveredLinkId === target.id && (
                  <span style={{ display: 'inline-flex', gap: 1, opacity: 0.75, alignItems: 'center' }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        navigator.clipboard.writeText(eventName).then(() => {
                          setCopiedLinkId(target.id);
                          setTimeout(() => setCopiedLinkId(null), 1200);
                        }).catch(() => {});
                      }}
                      style={{ 
                        padding: 1, 
                        border: 'none', 
                        background: 'transparent', 
                        cursor: 'pointer', 
                        color: C.textSec,
                        display: 'flex',
                        alignItems: 'center'
                      }}
                      title="Copy event name"
                    >
                      <span style={{ width: 12, height: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ transform: 'scale(0.65)', transformOrigin: 'center' }}>
                          {copiedLinkId === target.id ? <I.CheckCircle /> : <I.Clipboard />}
                        </span>
                      </span>
                    </button>
                    <a
                      href={primaryHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      style={{ 
                        padding: 1, 
                        color: C.textSec,
                        display: 'flex',
                        alignItems: 'center',
                        textDecoration: 'none'
                      }}
                      title="Open link"
                    >
                      <span style={{ width: 12, height: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ transform: 'scale(0.65)', transformOrigin: 'center' }}>
                          <I.Link />
                        </span>
                      </span>
                    </a>
                  </span>
                )}
              </div>

              {/* Event Date (sortable) */}
              <div style={{ fontSize: 11, fontWeight: 700, color: C.text, whiteSpace: "nowrap" }}>
                {eventDateStr}
              </div>

              {/* Status — status pill (default), plain-text chip (e.g. Drops Outcome), or hidden */}
              <div>
                {!cm.show.status ? null : cm.statusVariant === "text" ? (
                  cStatusText
                    ? <span style={{ display: "inline-block", fontSize: 10, fontWeight: 800, padding: "1px 8px", borderRadius: 999, background: "#E5E7EB", color: "#374151", whiteSpace: "nowrap", letterSpacing: "0.02em", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis" }} title={cStatusText}>{cStatusText}</span>
                    : <span style={{ color: C.textMut, fontSize: 11 }}>—</span>
                ) : (
                  <span style={{
                    display: "inline-block",
                    fontSize: 10,
                    fontWeight: 800,
                    padding: "1px 8px",
                    borderRadius: 999,
                    background: st.bg,
                    color: st.fg,
                    whiteSpace: "nowrap",
                    letterSpacing: "0.02em",
                  }}>
                    {getGrassrootsStatusLabel(target.status)}
                  </span>
                )}
              </div>

              {/* Notes — 3-line wrap */}
              <div
                style={{
                  fontSize: 11,
                  color: C.textSec,
                  lineHeight: 1.35,
                  display: "-webkit-box",
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
                title={cm.show.notes ? notePreview : undefined}
              >
                {cm.show.notes ? notePreview : null}
              </div>

              {/* Follow-Up — click shows "set/created" timestamp popover (exact reference behavior from Customer Lifecycle created field) */}
              {cm.show.followUp ? (
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onShowFollowUpInfo) onShowFollowUpInfo(target, e.clientX, e.clientY);
                  }}
                  style={{ cursor: "pointer", fontSize: 11, fontWeight: 800, color: followUp ? C.pri : C.text, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2, whiteSpace: "nowrap" }}
                  title="Click to see when this follow-up was set (edit via Log button)"
                >
                  <span>{followUp ? fmtDate(followUp) : "—"}</span>
                  {isOverdue && <span style={{ fontSize: 9, fontWeight: 800, color: C.dan, background: `${C.dan}18`, padding: "0 3px", borderRadius: 3, letterSpacing: "0.02em", alignSelf: "flex-start" }}>OVERDUE</span>}
                  {isToday && <span style={{ fontSize: 9, fontWeight: 800, color: C.suc, background: `${C.suc}18`, padding: "0 3px", borderRadius: 3, letterSpacing: "0.02em", alignSelf: "flex-start" }}>TODAY</span>}
                </div>
              ) : (
                <div style={{ color: C.textMut, fontSize: 11 }}>—</div>
              )}

              {/* Updates: Edit-only (e.g. Drops activity rows) or full count + Log + Edit */}
              {cm.updatesMode === "edit" ? (
                <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                  {onEdit && (
                    <button
                      onClick={() => onEdit(target)}
                      style={{ padding: "1px 5px", borderRadius: 4, border: `1px solid ${C.border}`, background: "#fff", color: C.textSec, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                    >
                      Edit
                    </button>
                  )}
                </div>
              ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                <button
                  onClick={(e) => handleCountClick(target.id, e)}
                  style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 18, height: 18, padding: "0 4px", borderRadius: 5, fontSize: 10, fontWeight: 800, border: "none", cursor: "pointer", fontFamily: "inherit", background: targetActivities.length > 0 ? `${C.acc}20` : C.bg, color: targetActivities.length > 0 ? C.acc : C.textMut }}
                  title={`${targetActivities.length} updates — click to expand`}
                >
                  {targetActivities.length}
                </button>

                {/* Hide Log button while the inline composer is open for this row */}
                {inlineLoggingId !== target.id && (
                  <button
                    onClick={() => onLog(target)}
                    style={{ padding: "1px 6px", borderRadius: 5, border: `1px solid ${C.pri}35`, background: `${C.pri}0A`, color: C.pri, fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
                  >
                    Log
                  </button>
                )}

                {onEdit && (
                  <button
                    onClick={() => onEdit(target)}
                    style={{ padding: "1px 5px", borderRadius: 4, border: `1px solid ${C.border}`, background: "#fff", color: C.textSec, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                  >
                    Edit
                  </button>
                )}
              </div>
              )}
            </div>

            {/* Expanded area: composer (when logging) + history */}
            {cm.updatesMode !== "edit" && (isExp || inlineLoggingId === target.id) && (
              <div style={{ background: C.bg, borderBottom: `1px solid ${C.borderLight}`, borderLeft: `3px solid ${C.pri}` }}>
                {/* Inline Log Composer — dominant textarea + date picker right underneath (no big modal) */}
                {inlineLoggingId === target.id && (
                  <div style={{ padding: "12px 14px", borderBottom: targetActivities.length > 0 ? `1px solid ${C.borderLight}` : "none" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.pri, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Log Update
                    </div>

                    <textarea
                      value={inlineLogNotes}
                      onChange={(e) => onInlineLogNotesChange(e.target.value)}
                      placeholder="Notes about this outreach / development..."
                      rows={5}
                      style={{
                        width: "100%",
                        minHeight: 110,
                        padding: "10px 12px",
                        border: `1.5px solid ${C.pri}`,
                        borderRadius: 6,
                        fontSize: 13,
                        fontFamily: "inherit",
                        resize: "vertical",
                        outline: "none",
                        boxSizing: "border-box",
                      }}
                      autoFocus
                    />

                    <div style={{ marginTop: 6 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: C.textSec, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                        Next Follow-Up Date *
                      </div>
                      <input
                        type="date"
                        value={inlineLogNextDate || ""}
                        min={today}
                        onChange={(e) => {
                          onInlineLogNextDateChange(e.target.value);
                          e.target.blur(); // auto-close native picker immediately, matching New Event creation behavior
                        }}
                        style={{
                          padding: "5px 8px",
                          border: `1px solid ${C.border}`,
                          borderRadius: 6,
                          fontSize: 12,
                          fontFamily: "inherit",
                          background: C.surface,
                          maxWidth: 158,
                        }}
                      />
                    </div>

                    <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
                      <button onClick={onCancelInlineLog}
                        style={{ padding: "6px 14px", borderRadius: 6, border: `1px solid ${C.border}`, background: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                        Cancel
                      </button>
                      <button onClick={onSaveInlineLog} disabled={savingLog}
                        style={{ padding: "6px 16px", borderRadius: 6, border: "none", background: C.pri, color: "#fff", fontSize: 12, fontWeight: 700, cursor: savingLog ? "default" : "pointer", fontFamily: "inherit", opacity: savingLog ? 0.7 : 1 }}>
                        {savingLog ? "Saving..." : "Save Log"}
                      </button>
                    </div>
                  </div>
                )}

                {/* Existing history entries */}
                {targetActivities.length > 0 && (
                  <div style={{ padding: "8px 14px 4px" }}>
                    {[...targetActivities].sort((a, b) => String(b.created_at || b.activity_date || "").localeCompare(String(a.created_at || a.activity_date || ""))).map((act, idx, arr) => (
                      <div key={act.id} style={{ marginBottom: idx === arr.length - 1 ? 0 : 6, paddingBottom: idx === arr.length - 1 ? 0 : 6, borderBottom: idx === arr.length - 1 ? "none" : `1px solid ${C.borderLight}` }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: C.pri, marginBottom: 1 }}>{activityActorName(act)} — {fmtDate(act.activity_date || act.created_at)}</div>
                        <div style={{ fontSize: 11, color: C.text, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{act.notes || "—"}</div>
                        {act.next_contact_date && <div style={{ fontSize: 9, color: C.textSec, marginTop: 1 }}>Follow-up: {fmtDate(act.next_contact_date)}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TrackerRow({ target, index, categoryConfig, activities, attachmentsByActivity = {}, isExpanded, isFresh = false, canLog, canEdit, onToggleUpdates, onLog, onMove, onEdit, onPreviewAttachment, previewingAttachmentId }) {
  const activityCount = getGrassrootsActivityCount(target, { [target.id]: activities });
  const nextDate = getGrassrootsNextDate(target, { [target.id]: activities });
  const gridColumns = getTrackerGridColumns(categoryConfig);
  const showNextDateColumn = usesNextDateColumn(categoryConfig);
  const title = target.name || categoryConfig.emptyName;
  const meta = [
    target.address,
    [target.first_name, target.last_name].filter(Boolean).join(" "),
    target.contact_source,
    getGrassrootsPrimaryEventDate(target) ? `Event ${fmtDate(getGrassrootsPrimaryEventDate(target))}` : "",
  ].filter(Boolean).slice(0, 2).join(" • ");

  return (
    <Card style={{ padding: 0, overflow: "hidden", borderRadius: 12, position: "relative", animation: isFresh ? "grassrootsFreshRow 1.8s ease-out both" : undefined }}>
      <div style={{ display: "grid", gridTemplateColumns: gridColumns, alignItems: "center", gap: 8, padding: "5px 12px", minHeight: 44, boxSizing: "border-box" }}>
        <div style={{ width: 30, height: 30, borderRadius: 10, display: "grid", placeItems: "center", background: target.is_active === false ? C.bg : C.pri, color: target.is_active === false ? C.textMut : "#fff", fontSize: 12, fontWeight: 900 }}>
          {index + 1}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
          <div style={{ marginTop: 2, fontSize: 10, color: C.textMut, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{meta || categoryConfig.singular}</div>
        </div>
        {usesBusinessCategoryColumn(categoryConfig) && <BusinessCategoryBadge value={getGrassrootsBusinessCategory(target)} />}
        {categoryConfig.usesStatus !== false && <StatusBadge status={target.status} />}
        {categoryConfig.id === "events" && <EventDateCell target={target} />}
        {showNextDateColumn && (
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
  const activeIndex = Math.max(0, options.findIndex((option) => option.value === value));
  return (
    <div
      className="grassroots-drop-subview-tabs"
      role="tablist"
      aria-label="Drop views"
      style={{
        "--grassroots-drop-view-count": options.length,
        "--grassroots-drop-view-active-index": activeIndex,
      }}
    >
      <div className="grassroots-drop-subview-indicator" aria-hidden="true" />
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

function formatDropCategoryFilterLabel(category) {
  if (category === "Rescue") return "Rescuer";
  return category;
}

function DropCategoryFilter({ counts, value, onChange }) {
  if (!counts?.length) return null;
  return (
    <div className="grassroots-drop-category-filter" aria-label="Filter drop activity by business category">
      {counts.map((item) => {
        const active = value === item.category || (!value && item.category === "All");
        const label = formatDropCategoryFilterLabel(item.category);
        return (
          <button
            key={item.category}
            type="button"
            className={active ? "is-active" : ""}
            onClick={() => onChange(item.category)}
          >
            <span>{label}</span>
            <em>{item.count}</em>
          </button>
        );
      })}
    </div>
  );
}

function DropActivityView({
  rows,
  canLog,
  canEdit,
  onLog,
  onEdit,
  onPreviewAttachment,
  previewingAttachmentId,
  freshActivityId,
  expandedIds,
  onToggleExpanded,
  totalRows,
  categoryFilter,
}) {
  if (rows.length === 0) {
    const filteredEmpty = totalRows > 0 && categoryFilter && categoryFilter !== "All";
    const categoryLabel = formatDropCategoryFilterLabel(categoryFilter);
    return (
      <Card style={{ padding: 30, textAlign: "center", color: C.textMut, borderRadius: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 900, color: C.text, marginBottom: 6 }}>{filteredEmpty ? `No ${categoryLabel.toLowerCase()} visits in this view` : "No drop activity logged yet"}</div>
        <div style={{ fontSize: 13, marginBottom: 16 }}>{filteredEmpty ? "Choose another category or log a new visit." : "Log the visit first; the business rollup updates from that activity."}</div>
        <Btn variant="primary" icon={<I.Plus />} onClick={() => onLog()} disabled={!canLog}>Log Activity</Btn>
      </Card>
    );
  }

  return (
    <Card style={{ padding: 0, overflow: "hidden", borderRadius: 14 }}>
      <div className="grassroots-drop-activity-header">
        <div>Date</div>
        <div>Business</div>
        <div>Summary</div>
        <div>Signals</div>
      </div>
      <div className="grassroots-drop-activity-list">
        {rows.map((row) => {
          const expanded = expandedIds?.has(row.id);
          const noteSummary = String(row.notes || "").trim();
          const summary = row.outcome || row.personSpokenWith || noteSummary || "Visit logged";
          const loggedTime = fmtTime(row.createdAt);
          return (
            <div
              key={row.id}
              className={`grassroots-drop-activity-row${freshActivityId === row.id ? " is-fresh" : ""}${expanded ? " is-expanded" : ""}`}
            >
              <div className="grassroots-drop-activity-date">
                <strong>{fmtDate(row.activityDate)}</strong>
                {loggedTime && <span>Logged {loggedTime}</span>}
              </div>
              <div className="grassroots-drop-activity-business">
                <strong>{row.businessName}</strong>
                <span>{[row.businessCategory, row.businessAddress].filter(Boolean).join(" · ") || "Drop business"}</span>
              </div>
              <div className="grassroots-drop-activity-summary">
                <strong>{summary}</strong>
                {noteSummary && <span>{noteSummary.length > 120 ? `${noteSummary.slice(0, 120)}...` : noteSummary}</span>}
              </div>
              <div className="grassroots-drop-activity-signals">
                <div className="grassroots-drop-activity-meta">
                  {row.followUpPriority && <span className="is-hot">Follow-up{row.nextDropDate ? ` ${fmtDate(row.nextDropDate)}` : ""}</span>}
                  {row.partnershipPotential && <span className="is-potential">Partnership</span>}
                  {row.attachments.length > 0 && <span>{row.attachments.length} file{row.attachments.length === 1 ? "" : "s"}</span>}
                </div>
                <button type="button" onClick={() => onToggleExpanded(row.id)} className="grassroots-drop-expand-button" aria-expanded={expanded}>
                  {expanded ? "Hide" : "Details"} <I.ChevronRight />
                </button>
              </div>
              {expanded && (
                <div className="grassroots-drop-activity-detail">
                  <div className="grassroots-drop-activity-detail-grid">
                    {row.personSpokenWith && <div><Label>Spoke With</Label><strong>{row.personSpokenWith}</strong></div>}
                    {row.materialsLeft && <div><Label>Materials Left</Label><strong>{row.materialsLeft}</strong></div>}
                    {row.outcome && <div><Label>Outcome</Label><strong>{row.outcome}</strong></div>}
                    {row.followUpPriority && row.nextDropDate && <div><Label>Follow-Up Date</Label><strong>{fmtDate(row.nextDropDate)}</strong></div>}
                  </div>
                  <p>{row.notes || "No notes entered."}</p>
                  <AttachmentButtons attachments={row.attachments} onPreview={onPreviewAttachment} previewingAttachmentId={previewingAttachmentId} />
                  <div className="grassroots-drop-activity-detail-footer">
                    <span>Logged by {row.loggedBy}</span>
                    <div className="grassroots-drop-activity-detail-actions">
                      <Btn variant="secondary" size="sm" icon={<I.Edit />} onClick={() => onEdit(row)} disabled={!canEdit}>Edit</Btn>
                      {row.target && <Btn variant="secondary" size="sm" onClick={() => onLog(row.target)} disabled={!canLog}>Log Again</Btn>}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
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
  const isEditingLog = Boolean(logModal?.activity?.id);
  const selectedSummary = selectedTarget
    ? [getGrassrootsBusinessCategory(selectedTarget), selectedTarget.address].filter(Boolean).join(" · ")
    : businessDraft
      ? [getGrassrootsBusinessCategory(businessDraft), businessDraft.address].filter(Boolean).join(" · ")
      : "";
  const title = isDropLog
    ? isEditingLog ? "Edit Visit" : "Log Visit"
    : getGrassrootsCategoryConfig(logModal?.target?.category).id === "events" ? "Log Event Comment" : "Log Development";
  const saveLabel = isEditingLog ? "Save Changes" : "Save Activity";

  const body = (
      <div className="grassroots-log-modal">
        {isDropLog && (
          <section className="grassroots-log-section">
            <div className="grassroots-log-section-title">Business</div>
            {logModal?.target ? (
              <div className="grassroots-log-selected-business">
                <strong>{logModal.target.name || "Visit business"}</strong>
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
            {followUpPriority && (
              <div className="grassroots-log-followup-date">
                <Label>Follow-Up Date Optional</Label>
                <MiniDatePicker
                  value={nextDate}
                  onChange={onNextDateChange}
                  recommendedDate={addDays(todayStr(), 7)}
                  recommendedHint="Set this only when there is a specific follow-up window."
                />
              </div>
            )}
          </section>
        )}

        <section className="grassroots-log-section">
          <div className="grassroots-log-section-title">{isDropLog ? "Visit Notes" : "Update / Outreach Log"}</div>

          {/* For Events (Grassroots development): larger, prominent note area + Next Follow-Up Date below it (per user request) */}
          {!isDropLog ? (
            <>
              {/* Light formatting toolbar kept for convenience */}
              <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                <button type="button" onClick={() => onNotesChange((notes || "") + "**bold**")} style={{ fontSize: 10, padding: "2px 6px", border: `1px solid ${C.border}`, borderRadius: 4, background: "#fff", cursor: "pointer", fontWeight: 700 }} title="Append bold">B</button>
                <button type="button" onClick={() => onNotesChange((notes || "") + "*italic*")} style={{ fontSize: 10, padding: "2px 6px", border: `1px solid ${C.border}`, borderRadius: 4, background: "#fff", cursor: "pointer", fontStyle: "italic" }} title="Append italic">I</button>
                <button type="button" onClick={() => onNotesChange((notes || "") + "\n- ")} style={{ fontSize: 10, padding: "2px 6px", border: `1px solid ${C.border}`, borderRadius: 4, background: "#fff", cursor: "pointer" }} title="Append bullet">•</button>
              </div>

              <textarea
                value={notes}
                onChange={(event) => onNotesChange(event.target.value)}
                placeholder="Notes about this outreach / development..."
                rows={6}
                style={{ ...INPUT_STYLE, minHeight: 140, resize: "vertical" }}
                autoFocus
              />

              <div style={{ marginTop: 14 }}>
                <Label>Next Follow-Up Date *</Label>
                <MiniDatePicker
                  value={nextDate}
                  onChange={onNextDateChange}
                  // No recommended +X hint for Grassroots per user request
                />
              </div>
            </>
          ) : (
            // Drops keep the existing more structured layout
            <>
              <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                <button type="button" onClick={() => onNotesChange((notes || "") + "**bold**")} style={{ fontSize: 10, padding: "2px 6px", border: `1px solid ${C.border}`, borderRadius: 4, background: "#fff", cursor: "pointer", fontWeight: 700 }} title="Append bold">B</button>
                <button type="button" onClick={() => onNotesChange((notes || "") + "*italic*")} style={{ fontSize: 10, padding: "2px 6px", border: `1px solid ${C.border}`, borderRadius: 4, background: "#fff", cursor: "pointer", fontStyle: "italic" }} title="Append italic">I</button>
                <button type="button" onClick={() => onNotesChange((notes || "") + "\n- ")} style={{ fontSize: 10, padding: "2px 6px", border: `1px solid ${C.border}`, borderRadius: 4, background: "#fff", cursor: "pointer" }} title="Append bullet">•</button>
              </div>
              <textarea
                value={notes}
                onChange={(event) => onNotesChange(event.target.value)}
                placeholder="What happened during this visit?"
                rows={4}
                style={{ ...INPUT_STYLE, minHeight: 108, resize: "vertical" }}
              />
            </>
          )}
        </section>

        {isDropLog && !isEditingLog && (
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

        {!isDropLog && (
          <div className="grassroots-log-actions">
            <Btn variant="ghost" onClick={onClose} disabled={saving}>Cancel</Btn>
            <Btn variant="primary" onClick={onSave} disabled={saving}>{saving ? "Saving..." : saveLabel}</Btn>
          </div>
        )}
      </div>
  );

  if (isDropLog) {
    return (
      <div className="grassroots-log-composer">
        <Card style={{ padding: 0, overflow: "visible", position: "relative", border: `1.5px solid ${C.pri}30`, boxShadow: "0 16px 40px rgba(20,83,45,0.10)", animation: "grassrootsComposerIn 0.38s cubic-bezier(0.16,1,0.3,1)" }}>
          <div className="grassroots-log-composer-header">
            <div>
              <div className="grassroots-log-composer-kicker">{title}</div>
              <div className="grassroots-log-composer-subtitle">{isEditingLog ? "Original values stay available in History." : "Save collapses this into the activity row."}</div>
            </div>
            <div className="grassroots-log-composer-actions">
              <Btn variant="ghost" size="sm" onClick={onClose} disabled={saving}>Cancel</Btn>
              <Btn variant="primary" size="sm" onClick={onSave} disabled={saving}>{saving ? "Saving..." : saveLabel}</Btn>
            </div>
          </div>
          <div className="grassroots-log-composer-body">
            {body}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <Modal title={title} onClose={saving ? () => {} : onClose} wide>
      {body}
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
  // New lifecycle-style tab system (matching the old Customer Lifecycle layout the user loves)
  const [activeLifecycleTab, setActiveLifecycleTab] = useState("events"); // events | drops | corporate | apartments | ppp | all

  // Keep the old activeCategory alive during the transition.
  // The entire content rendering below (activeConfig, DenseGrassrootsTable, Drop logic, etc.)
  // still depends on it. We sync the two states in the new tab bar.
  const [activeCategory, setActiveCategory] = useState("events");

  // Filters for the new header (Events tab uses status pills)
  const [lifecycleSearch, setLifecycleSearch] = useState("");
  const [eventsStatusFilter, setEventsStatusFilter] = useState(null); // identified | corresponding | booked | abandoned
  const [showPastEvents, setShowPastEvents] = useState(false);

  // For Drops: Activity vs Business view (controlled by pill in the new header)
  const [dropSubview, setDropSubview] = useState("activity");
  const [dropActivityCategory, setDropActivityCategory] = useState("All");
  const [eventDateSortDirection, setEventDateSortDirection] = useState("asc");
  const [followUpSortDirection, setFollowUpSortDirection] = useState(null);
  const [targets, setTargets] = useState([]);
  const [activities, setActivities] = useState([]);
  const [activityAttachments, setActivityAttachments] = useState([]);
  const [attachmentsSchemaMissing, setAttachmentsSchemaMissing] = useState(false);
  const [history, setHistory] = useState([]);
  const [newDraft, setNewDraft] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [expandedUpdates, setExpandedUpdates] = useState(new Set());
  const [expandedDropActivities, setExpandedDropActivities] = useState(new Set());
  const [logModal, setLogModal] = useState(null);
  const [movePopover, setMovePopover] = useState(null);
  const [followUpInfo, setFollowUpInfo] = useState(null); // {targetId, followUpDate, setOn, x, y} — positioned from real click coords now
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

  // Inline log composer (preferred over big full-screen modal per user feedback)
  const [inlineLoggingId, setInlineLoggingId] = useState(null);
  const [inlineLogNotes, setInlineLogNotes] = useState("");
  const [inlineLogNextDate, setInlineLogNextDate] = useState("");
  // Hold the actual target object the composer was opened for, so saving never
  // depends on re-finding it by id in a list that may be filtered/derived.
  const inlineLogTargetRef = useRef(null);

  // Stable handlers (perf nit fix for dense table + sort headers — prevents fresh arrow fns every render)
  const toggleUpdates = useCallback((id) => {
    setExpandedUpdates((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Start inline log composer inside the row's expansion area (no big modal)
  const startInlineLog = useCallback((target) => {
    inlineLogTargetRef.current = target;
    setInlineLoggingId(target.id);
    setInlineLogNotes("");
    setInlineLogNextDate(target.next_contact_date || "");
    // Make sure the updates section is open so the composer is visible
    setExpandedUpdates((prev) => {
      const next = new Set(prev);
      next.add(target.id);
      return next;
    });
  }, []);
  const toggleEventDateSort = useCallback(() => {
    setFollowUpSortDirection(null);
    setEventDateSortDirection((current) => (current === "asc" ? "desc" : "asc"));
  }, []);
  const toggleFollowUpSort = useCallback(() => {
    setEventDateSortDirection("asc");
    setFollowUpSortDirection((current) => (current === "asc" ? "desc" : current === "desc" ? null : "asc"));
  }, []);
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
  const logComposerScrollRef = useRef(null);
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
    let list = [...visibleTargets];
    if (followUpSortDirection) {
      list.sort((a, b) => {
        const da = a.next_contact_date || "";
        const db = b.next_contact_date || "";
        if (!da && !db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        const cmp = followUpSortDirection === "desc" ? db.localeCompare(da) : da.localeCompare(db);
        return cmp || (a.name || "").localeCompare(b.name || "");
      });
    } else {
      list.sort((left, right) => compareGrassrootsEventSchedule(left, right, today, eventDateSortDirection));
    }
    return list;
  }, [activeConfig.id, eventDateSortDirection, followUpSortDirection, visibleTargets]);

  // Apply the literal-port header filters (search, status pills, Past Events) on top of the category/sorted list.
  // This makes the ported Customer Lifecycle chrome actually drive the table (Events tab primary).
  const lifecycleDisplayTargets = useMemo(() => {
    let list = sortedVisibleTargets || [];
    const q = (lifecycleSearch || "").trim().toLowerCase();
    if (q) {
      list = list.filter(t =>
        String(t.organizer || t.name || t.first_name || t.last_name || "").toLowerCase().includes(q) ||
        String(t.notes || t.proposal || t.address || "").toLowerCase().includes(q)
      );
    }
    if (activeLifecycleTab === 'events' && eventsStatusFilter) {
      list = list.filter(t => normalizeGrassrootsStatus(t.status) === eventsStatusFilter);
    }
    if (showPastEvents && activeLifecycleTab === 'events') {
      const td = todayStr();
      list = list.filter(t => {
        const d = getGrassrootsPrimaryEventDate(t);
        return d && d < td;
      });
    }
    return list;
  }, [sortedVisibleTargets, lifecycleSearch, eventsStatusFilter, showPastEvents, activeLifecycleTab]);

  // "Activity" tab — what's legit/confirmed: booked Events + all Visits, in one feed.
  // Strategic/long-term categories (Corporate, Apartments, PPP) stay in their own tabs.
  const allTabTargets = useMemo(() => {
    let list = targets.filter((t) => t.category === "drops" || (t.category === "events" && normalizeGrassrootsStatus(t.status) === "booked"));
    const q = (lifecycleSearch || "").trim().toLowerCase();
    if (q) {
      list = list.filter((t) =>
        String(t.organizer || t.name || t.first_name || t.last_name || "").toLowerCase().includes(q) ||
        String(t.notes || t.proposal || t.address || "").toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => String(a.name || a.organizer || "").localeCompare(String(b.name || b.organizer || "")));
    return list;
  }, [targets, lifecycleSearch]);

  const eventMetrics = useMemo(() => buildGrassrootsEventMetrics(targets, todayStr()), [targets]);
  const dropMetrics = useMemo(() => buildGrassrootsDropMetrics(targets, activities, todayStr()), [activities, targets]);
  const dropTargets = useMemo(() => targets.filter((target) => getGrassrootsCategoryConfig(target.category).id === "drops"), [targets]);
  const dropActivityRows = useMemo(
    () => buildGrassrootsDropActivityRows(targets, activities, attachmentsByActivity),
    [activities, attachmentsByActivity, targets],
  );
  const dropCategoryCounts = useMemo(() => buildGrassrootsDropCategoryCounts(dropActivityRows), [dropActivityRows]);
  const filteredDropActivityRows = useMemo(
    () => filterGrassrootsDropActivityRowsByCategory(dropActivityRows, dropActivityCategory),
    [dropActivityCategory, dropActivityRows],
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
    const category = logModal ? (logModal.category || getGrassrootsCategoryConfig(logModal?.target?.category).id) : "";
    if (category !== "drops") return undefined;
    let frameId = 0;
    const timerId = window.setTimeout(() => {
      frameId = window.requestAnimationFrame(() => {
        scrollGrassrootsEditorIntoView(logComposerScrollRef.current);
      });
    }, 60);
    return () => {
      window.clearTimeout(timerId);
      if (frameId) window.cancelAnimationFrame(frameId);
    };
  }, [logModal?.activity?.id, logModal?.category, logModal?.target?.category, logModal?.target?.id]);

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
    const blank = makeBlankGrassrootsTarget(activeCategory);
    // Quick capture defaults
    blank.status = "corresponding";
    blank.is_active = true;
    setNewDraft(blank);
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

  const toggleDropActivityExpanded = (activityId) => {
    setExpandedDropActivities((current) => {
      const next = new Set(current);
      if (next.has(activityId)) next.delete(activityId);
      else next.add(activityId);
      return next;
    });
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
    setLogDate("");
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

  const openEditDropActivity = (row) => {
    if (!canLogActivity) {
      toast("You do not have permission to edit grassroots activity", "error");
      return;
    }
    if (!row?.activity?.id || !row?.target?.id) {
      toast("This activity cannot be edited from this view", "error");
      return;
    }
    setMovePopover(null);
    setDropSubview("activity");
    setExpandedDropActivities((current) => {
      const next = new Set(current);
      next.add(row.id);
      return next;
    });
    setLogModal({ target: row.target, category: "drops", activity: row.activity });
    setLogNotes(row.notes || "");
    setLogDate(row.nextDropDate || "");
    setLogActivityDate(row.activityDate || todayStr());
    setLogContactName(row.personSpokenWith || "");
    setLogBusinessQuery(row.businessName || row.target.name || "");
    setLogSelectedTarget(row.target);
    setLogBusinessDraft(null);
    setLogMaterialsLeft(row.materialsLeft || "");
    setLogOutcome(row.outcome || "");
    setLogFollowUpPriority(Boolean(row.followUpPriority || row.nextDropDate));
    setLogPartnershipPotential(Boolean(row.partnershipPotential));
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
    if (!canEditTargets) throw new Error("You do not have permission to create visit businesses");

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

  const updateFollowUpDate = async (target, newDate) => {
    if (!canEditTargets) {
      toast("You do not have permission to edit follow-up dates", "error");
      return;
    }
    // Stricter validation (re-review Round 2): reject not only shape but invalid calendar dates (e.g. 2026-99-99, 2026-02-30)
    if (newDate != null) {
      const s = String(newDate).trim();
      if (s) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
          toast("Follow-up date must be YYYY-MM-DD or blank", "error");
          return;
        }
        const d = new Date(s + "T12:00:00");
        const [y, m, day] = s.split("-").map(Number);
        if (d.getFullYear() !== y || d.getMonth() + 1 !== m || d.getDate() !== day) {
          toast("Invalid calendar date for follow-up", "error");
          return;
        }
      }
    }
    setSaveState("saving");
    const { error } = await supabase
      .from("grassroots_targets")
      .update({
        next_contact_date: newDate || null,
        updated_by_user_id: actor.userId,
        updated_by_name: actor.name,
      })
      .eq("id", target.id);
    if (error) {
      setSaveState("error");
      toast(error.message || "Failed to update follow-up", "error");
      window.setTimeout(() => setSaveState("idle"), 800);
      return;
    }
    setTargets((prev) => prev.map((row) => (row.id === target.id ? { ...row, next_contact_date: newDate || null } : row)));
    setSaveState("saved");
    window.setTimeout(() => setSaveState("idle"), 900);
    toast(newDate ? "Follow-up date updated" : "Follow-up cleared");
  };

  // small helper (hoisted for use in export below)
  function formatShortDateForExport(d) {
    if (!d) return "";
    try { return new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit" }); } catch { return String(d); }
  }

  const exportVisibleToCSV = () => {
    const rows = sortedVisibleTargets.length ? sortedVisibleTargets : visibleTargets;
    if (!rows.length) {
      toast("Nothing to export", "error");
      return;
    }
    const headers = ["Organizer", "Event", "Event Date", "Status", "Follow-Up", "Latest Update", "Notes / Proposal"];
    const escape = (v) => `"${String(v || "").replace(/"/g, '""')}"`;
    const csvLines = [headers.join(",")];
    rows.forEach((t) => {
      const acts = activitiesByTarget[t.id] || [];
      const latest = [...acts].sort((a, b) => String(b.activity_date || b.created_at || "").localeCompare(String(a.activity_date || a.created_at || "")))[0];
      const latestTxt = latest ? `${formatShortDateForExport(latest.activity_date || latest.created_at)}: ${latest.notes || latest.description || ""}` : "";
      const org = t.organizer || [t.first_name, t.last_name].filter(Boolean).join(" ") || t.contact_source || "";
      const ed = getGrassrootsPrimaryEventDate(t) || "";
      csvLines.push([
        escape(org),
        escape(t.name || ""),
        escape(ed ? fmtDate(ed) : ""),
        escape(getGrassrootsStatusLabel(t.status)),
        escape(t.next_contact_date || ""),
        escape(latestTxt),
        escape(t.proposal || ""),
      ].join(","));
    });
    const blob = new Blob([csvLines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `grassroots-${activeConfig.id}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast(`Exported ${rows.length} rows`);
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
    const followUpDate = activityType === "drop" && logFollowUpPriority && logDate ? logDate : null;
    if (!logNotes.trim()) {
      toast(activityType === "drop" ? "Visit notes are required" : "Comment is required", "error");
      return;
    }
    if (activityType === "drop" && attachmentsSchemaMissing && logFiles.length > 0) {
      toast("Attachment storage is not installed in this Supabase environment yet", "error");
      return;
    }
    const editingActivity = logModal?.activity || null;
    const target = isDropLog && editingActivity?.id ? logModal.target : isDropLog ? await ensureLogTarget().catch((error) => {
      toast(error.message || "Business is required", "error");
      return null;
    }) : logModal?.target;
    if (!target) return;
    const activityDate = logActivityDate || todayStr();
    const activityMetadata = activityType === "drop" ? {
      person_spoken_with: logContactName.trim(),
      materials_left: logMaterialsLeft.trim(),
      outcome: logOutcome.trim(),
      follow_up_priority: logFollowUpPriority,
      partnership_potential: logPartnershipPotential,
    } : {};
    if (editingActivity?.id) {
      setSaveState("saving");
      setSavingLog(true);
      const { data, error } = await supabase.rpc("update_grassroots_activity_with_history", {
        p_activity: {
          id: editingActivity.id,
          location_id: locationId,
          activity_date: activityDate,
          notes: logNotes.trim(),
          next_contact_date: activityType === "drop" ? followUpDate : (logDate || null),
          metadata: activityMetadata,
          updated_by_user_id: actor.userId,
          updated_by_name: actor.name,
        },
      });
      setSavingLog(false);
      const updatedActivity = data?.activity || null;
      const historyEntry = data?.history || null;
      if (error || !updatedActivity) {
        setSaveState("error");
        console.error("Failed to edit grassroots activity", error);
        toast(error?.message || "Failed to edit activity", "error");
        return;
      }
      setActivities((prev) => prev.map((row) => (row.id === updatedActivity.id ? updatedActivity : row)));
      if (historyEntry?.id) {
        setHistory((prev) => [historyEntry, ...prev.filter((entry) => entry.id !== historyEntry.id)]);
      }
      await loadGrassroots();
      markFreshActivity(updatedActivity.id);
      resetLogForm();
      if (activityType === "drop") setDropSubview("activity");
      setSaveState("saved");
      window.setTimeout(() => setSaveState("idle"), 1200);
      toast(activityType === "drop" ? "Activity updated" : "Development updated");
      return;
    }
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
            next_contact_date: followUpDate,
            metadata: {
              ...activityMetadata,
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
          next_contact_date: activityType === "drop" ? followUpDate : (logDate || null),
          metadata: activityMetadata,
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
      { label: "Visits Last 30", value: dropMetrics.dropVisitsLast30, color: C.pri },
      { label: "Businesses Visited Last 30", value: dropMetrics.businessesVisitedLast30, color: C.suc },
      { label: `Visits ${dropMetrics.year} YTD`, value: dropMetrics.dropVisitsYtd, color: C.info },
      { label: `Businesses Visited ${dropMetrics.year} YTD`, value: dropMetrics.businessesVisitedYtd, color: "#7C3AED" },
    ]
    : [
      { label: `Booked Upcoming ${eventMetrics.year}`, value: eventMetrics.bookedUpcomingThisYear, color: C.pri },
      { label: `Booked Completed ${eventMetrics.year}`, value: eventMetrics.bookedCompletedThisYear, color: C.suc },
      { label: `Identified ${eventMetrics.year}`, value: eventMetrics.identifiedThisYear, color: C.info },
      { label: `Corresponding ${eventMetrics.year}`, value: eventMetrics.correspondingThisYear, color: "#7C3AED" },
      { label: `Booked ${fmtMonthYear(eventMetrics.month)}`, value: eventMetrics.bookedThisMonth, color: C.accDk },
    ];
  const activeLogCategoryId = logModal ? (logModal.category || getGrassrootsCategoryConfig(logModal?.target?.category).id) : "";
  const isDropLogActive = activeLogCategoryId === "drops";
  const logActivityEditor = canLogActivity && logModal ? (
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
      onFollowUpPriorityChange={(value) => {
        setLogFollowUpPriority(value);
        if (!value) setLogDate("");
      }}
      onPartnershipPotentialChange={setLogPartnershipPotential}
      onFileChange={handleLogFileChange}
      onRemoveFile={removeLogFile}
      onClose={resetLogForm}
      onSave={saveLog}
    />
  ) : null;

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
        @keyframes grassrootsDropTabSweep {
          0% { transform:translateX(-140%); opacity:0; }
          18% { opacity:0.82; }
          52% { opacity:0.55; }
          100% { transform:translateX(245%); opacity:0; }
        }
        @keyframes grassrootsDropControlSettle {
          from { opacity:0; transform:translateY(8px) scale(0.99); filter:blur(2px); }
          to { opacity:1; transform:translateY(0) scale(1); filter:blur(0); }
        }
        .grassroots-event-inline-editor {
          position: relative;
          overflow: hidden;
          border-radius: 10px;
          border: 1.5px solid ${C.border};
          background: ${C.surface};
          box-shadow: 0 8px 24px rgba(15,23,42,0.10);
          animation: grassrootsComposerIn 0.38s cubic-bezier(0.16,1,0.3,1) both;
        }
        .grassroots-event-inline-header {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 8px 12px;
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
        .grassroots-category-stage {
          animation: grassrootsCategoryCycle 0.34s cubic-bezier(0.16,1,0.3,1) both;
          transform-origin: top center;
        }
        .grassroots-new-draft-anchor {
          scroll-margin-top: 96px;
        }
        .grassroots-event-inline-body { position: relative; z-index: 1; padding: 8px; background: ${C.bg}; }
        .grassroots-target-inline-body { position: relative; z-index: 1; padding: 8px; background: ${C.bg}; }
        /* density scoped to events editor only (prevents side-effect on TargetEditor for drops etc.) */
        .grassroots-target-form-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(340px, 0.85fr);
          gap: 8px;
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
          display: grid;
          grid-template-columns: minmax(320px, 440px) minmax(0, 1fr);
          align-items: center;
          gap: 16px;
          margin: 2px 0 14px;
        }
        .grassroots-drop-subview-tabs {
          --grassroots-drop-view-count: 2;
          --grassroots-drop-view-active-index: 0;
          position: relative;
          display: grid;
          grid-template-columns: repeat(var(--grassroots-drop-view-count), minmax(0, 1fr));
          align-items: center;
          min-height: 50px;
          padding: 5px;
          border: 1px solid rgba(226,232,240,0.95);
          border-radius: 16px;
          background:
            linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,250,252,0.92)),
            #fff;
          box-shadow: 0 16px 44px rgba(15,23,42,0.055);
          overflow: hidden;
          isolation: isolate;
          animation: grassrootsDropControlSettle 260ms cubic-bezier(0.22,1,0.36,1);
        }
        .grassroots-drop-subview-indicator {
          position: absolute;
          top: 5px;
          bottom: 5px;
          left: 5px;
          z-index: 0;
          width: calc((100% - 10px) / var(--grassroots-drop-view-count));
          border-radius: 12px;
          background: linear-gradient(135deg, #14532d 0%, #166534 56%, #3f6212 100%);
          box-shadow: 0 14px 34px rgba(20,83,45,0.22), inset 0 1px 0 rgba(255,255,255,0.18);
          transform: translateX(calc(var(--grassroots-drop-view-active-index) * 100%));
          transition: transform 420ms cubic-bezier(0.22,1,0.36,1), box-shadow 220ms ease;
          overflow: hidden;
        }
        .grassroots-drop-subview-indicator::after {
          content: "";
          position: absolute;
          inset: -30% auto -30% 0;
          width: 46%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.28), transparent);
          animation: grassrootsDropTabSweep 2.8s cubic-bezier(0.22,1,0.36,1) infinite;
        }
        .grassroots-drop-subview-tab {
          position: relative;
          z-index: 1;
          border: 0;
          border-radius: 12px;
          background: transparent;
          color: ${C.textSec};
          cursor: pointer;
          font-family: inherit;
          font-size: 13px;
          font-weight: 850;
          letter-spacing: 0;
          height: 40px;
          padding: 0 16px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          white-space: nowrap;
          transition: color 220ms ease, transform 220ms cubic-bezier(0.22,1,0.36,1), background 220ms ease;
        }
        .grassroots-drop-subview-tab em {
          font-style: normal;
          font-size: 11px;
          min-width: 22px;
          height: 22px;
          padding: 0 7px;
          border-radius: 999px;
          display: inline-grid;
          place-items: center;
          background: rgba(20,83,45,0.08);
          color: ${C.pri};
          font-weight: 950;
          line-height: 1;
          transition: background 220ms ease, color 220ms ease, transform 220ms cubic-bezier(0.22,1,0.36,1);
        }
        .grassroots-drop-subview-tab:hover {
          color: ${C.pri};
          background: rgba(20,83,45,0.055);
        }
        .grassroots-drop-subview-tab.is-active {
          color: #fff;
          transform: translateY(-1px);
        }
        .grassroots-drop-subview-tab.is-active em {
          background: rgba(255,255,255,0.18);
          color: #fff;
          transform: scale(1.02);
        }
        .grassroots-drop-toolbar-copy {
          display: flex;
          align-items: baseline;
          justify-content: flex-end;
          gap: 8px;
          color: ${C.textMut};
          font-size: 12px;
          min-width: 0;
        }
        .grassroots-drop-toolbar-copy strong {
          color: ${C.text};
          font-weight: 950;
        }
        .grassroots-drop-category-filter {
          display: flex;
          align-items: center;
          gap: 7px;
          flex-wrap: wrap;
          margin: -2px 0 2px;
        }
        .grassroots-drop-category-filter button {
          border: 1.5px solid ${C.borderLight};
          background: #fff;
          border-radius: 999px;
          padding: 6px 10px;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          cursor: pointer;
          color: ${C.textSec};
          font: inherit;
          font-size: 12px;
          font-weight: 900;
          transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease, transform 0.16s ease;
        }
        .grassroots-drop-category-filter button:hover {
          transform: translateY(-1px);
          border-color: ${C.pri}55;
        }
        .grassroots-drop-category-filter button.is-active {
          background: ${C.pri};
          border-color: ${C.pri};
          color: #fff;
          box-shadow: 0 7px 18px rgba(20,83,45,0.16);
        }
        .grassroots-drop-category-filter em {
          font-style: normal;
          font-size: 11px;
          opacity: 0.76;
        }
        .grassroots-drop-activity-header,
        .grassroots-drop-activity-row {
          display: grid;
          grid-template-columns: 118px minmax(220px, 0.95fr) minmax(260px, 1.45fr) 166px;
          gap: 14px;
          align-items: start;
        }
        .grassroots-drop-activity-header {
          padding: 8px 12px;
          background: rgb(255,255,255);
          border-bottom: 1px solid rgb(226,232,240);
          color: rgb(71,85,105);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        .grassroots-drop-activity-list {
          display: grid;
        }
        .grassroots-drop-activity-row {
          padding: 5px 12px;
          border-bottom: 1px solid ${C.borderLight};
          transition: background 0.16s ease, box-shadow 0.16s ease;
          font-size: 12px;
          align-items: start;
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
        .grassroots-drop-activity-summary,
        .grassroots-drop-activity-signals {
          min-width: 0;
          display: grid;
          gap: 4px;
        }
        .grassroots-drop-activity-date strong,
        .grassroots-drop-activity-business strong,
        .grassroots-drop-activity-summary strong {
          color: ${C.text};
          font-size: 12px;
          font-weight: 700;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .grassroots-drop-activity-date span,
        .grassroots-drop-activity-business span,
        .grassroots-drop-activity-summary span,
        .grassroots-drop-activity-detail-footer {
          color: ${C.textMut};
          font-size: 11px;
          font-weight: 600;
          line-height: 1.3;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .grassroots-drop-activity-signals {
          min-width: 0;
          justify-items: end;
          align-content: start;
        }
        .grassroots-drop-activity-detail {
          grid-column: 1 / -1;
          margin-top: 10px;
          padding: 14px 16px;
          border-radius: 12px;
          background: ${C.bg};
          border: 1px solid ${C.borderLight};
          display: grid;
          gap: 12px;
        }
        .grassroots-drop-activity-detail-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
        }
        .grassroots-drop-activity-detail-grid strong {
          display: block;
          color: ${C.text};
          font-size: 13px;
          font-weight: 900;
          line-height: 1.35;
        }
        .grassroots-drop-activity-detail p {
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
          justify-content: flex-end;
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
        .grassroots-drop-expand-button {
          margin-top: 4px;
          border: 1.5px solid ${C.borderLight};
          background: #fff;
          color: ${C.textSec};
          border-radius: 10px;
          padding: 6px 9px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
          font: inherit;
          font-size: 11px;
          font-weight: 900;
        }
        .grassroots-drop-activity-row.is-expanded .grassroots-drop-expand-button svg {
          transform: rotate(90deg);
        }
        .grassroots-drop-activity-detail-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          white-space: normal;
        }
        .grassroots-drop-activity-detail-actions {
          display: inline-flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
          flex-wrap: wrap;
        }
        .grassroots-history-change-list {
          display: grid;
          gap: 5px;
          margin-top: 8px;
          padding: 8px;
          border-radius: 10px;
          background: ${C.bg};
          border: 1px solid ${C.borderLight};
        }
        .grassroots-history-change-row {
          display: grid;
          grid-template-columns: 118px minmax(0, 1fr) 18px minmax(0, 1fr);
          gap: 7px;
          align-items: start;
          color: ${C.textMut};
          line-height: 1.35;
        }
        .grassroots-history-change-row strong {
          color: ${C.textSec};
          font-size: 11px;
          font-weight: 950;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .grassroots-history-change-row span {
          color: ${C.text};
          font-weight: 800;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }
        .grassroots-history-change-row em {
          color: ${C.textMut};
          font-style: normal;
          font-weight: 900;
          text-align: center;
        }
        .grassroots-log-composer-header {
          padding: 16px 18px;
          border-bottom: 1px solid ${C.borderLight};
          background: linear-gradient(135deg, ${C.priLt} 0%, #fff 70%);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
        }
        .grassroots-log-composer-kicker {
          font-size: 12px;
          font-weight: 900;
          color: ${C.pri};
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .grassroots-log-composer-subtitle {
          margin-top: 4px;
          font-size: 13px;
          color: ${C.textMut};
        }
        .grassroots-log-composer-actions {
          display: flex;
          gap: 8px;
          align-items: center;
        }
        .grassroots-log-composer-body {
          padding: 14px;
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
        .grassroots-log-followup-date {
          margin-top: 12px;
          max-width: 280px;
          animation: grassrootsSlideIn 0.2s ease-out;
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
          margin-top: 2px !important;
          padding: 0 !important;
          border-radius: 8px !important;
          border: 1px solid #E5E7EB !important;
          background: #fff !important;
          box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1) !important;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
          overflow: hidden !important;
          width: auto !important;
          max-width: 460px !important;
        }

        /* Perplexity-style tight single-line items */
        .pac-container .pac-item {
          display: flex !important;
          align-items: center !important;
          padding: 6px 12px !important;
          font-size: 13px !important;
          line-height: 1.3 !important;
          color: #374151 !important;
          white-space: nowrap !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          border-radius: 0 !important;
        }

        .pac-container .pac-item:hover,
        .pac-container .pac-item-selected {
          background: #F3F4F6 !important;
          color: #111827 !important;
        }

        /* Thin left accent bar like Perplexity on selected */
        .pac-container .pac-item-selected::before {
          content: '';
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 3px;
          background: #111827;
        }

        /* Bold main address part */
        .pac-container .pac-item-query {
          font-weight: 600 !important;
          color: #111827 !important;
          white-space: nowrap !important;
          flex-shrink: 0;
        }

        .pac-container .pac-matched {
          font-weight: 600 !important;
          color: #14532D !important; /* subtle brand green for matches */
        }

        /* Secondary location text on same line, muted */
        .pac-container .pac-item > span:not(.pac-icon):not(.pac-item-query) {
          color: #6B7280 !important;
          margin-left: 6px !important;
          font-weight: 400 !important;
          white-space: nowrap !important;
        }

        /* Smaller, properly aligned pin icon */
        .pac-container .pac-icon {
          width: 16px !important;
          height: 16px !important;
          margin-right: 8px !important;
          margin-left: 2px !important;
          opacity: 0.6 !important;
          flex-shrink: 0;
          display: inline-flex !important;
          align-items: center !important;
        }

        /* Powered by Google text */
        .pac-container .pac-logo {
          padding: 4px 12px !important;
          font-size: 10px !important;
          color: #9CA3AF !important;
          background: #F9FAFB !important;
        }
        .grassroots-event-dense .grassroots-event-form-grid { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.85fr); gap: 10px; align-items: start; }
        .grassroots-event-dense .grassroots-event-form-section { border: none; padding: 0 0 4px; background: transparent; }
        .grassroots-event-dense .grassroots-event-form-section-title { font-size: 9px; font-weight: 700; color: ${C.textMut}; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 2px; }
        .grassroots-event-dense .grassroots-event-field-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 3px; align-items: start; }
        .grassroots-event-dense .grassroots-event-wide-field { grid-column: 1 / -1; }
        .grassroots-event-date-row { display: grid; grid-template-columns: minmax(190px, 1.4fr) minmax(112px, 0.7fr) minmax(112px, 0.7fr) 36px; gap: 6px; align-items: end; }
        .grassroots-event-date-row > button { margin-bottom: 1px; }
        @media (max-width: 880px) {
          .grassroots-event-form-grid { grid-template-columns: 1fr; }
          .grassroots-target-form-grid { grid-template-columns: 1fr; }
          .grassroots-event-dense .grassroots-event-form-grid { grid-template-columns: 1fr; }
        }
        @media (max-width: 680px) {
          .grassroots-event-field-grid { grid-template-columns: 1fr; }
          .grassroots-event-dense .grassroots-event-field-grid { grid-template-columns: 1fr; }
          .grassroots-event-date-row { grid-template-columns: 1fr; padding: 12px; border: 1px solid ${C.borderLight}; border-radius: 12px; background: ${C.bg}; }
          .grassroots-event-date-row > button { margin-bottom: 0; width: 100% !important; }
          .grassroots-event-link-row { grid-template-columns: 1fr 34px; }
          .grassroots-places-panel { width: min(100%, calc(100vw - 32px)); }
          .grassroots-places-option { grid-template-columns: 30px minmax(0, 1fr); }
          .grassroots-places-category { grid-column: 2; justify-self: start; margin-top: 2px; }
          .grassroots-drop-activity-header { display: none; }
          .grassroots-drop-activity-row { grid-template-columns: 1fr; gap: 10px; }
          .grassroots-drop-activity-signals { justify-items: start; }
          .grassroots-drop-activity-meta { justify-content: flex-start; }
          .grassroots-drop-activity-detail-grid { grid-template-columns: 1fr; }
          .grassroots-drop-activity-detail-footer { align-items: flex-start; flex-direction: column; }
          .grassroots-drop-activity-detail-actions { width: 100%; justify-content: flex-start; }
          .grassroots-history-change-row { grid-template-columns: 1fr; gap: 3px; }
          .grassroots-history-change-row em { text-align: left; }
          .grassroots-log-composer-header { align-items: flex-start; flex-direction: column; }
          .grassroots-log-composer-actions { width: 100%; justify-content: flex-end; }
          .grassroots-log-grid { grid-template-columns: 1fr; }
          .grassroots-drop-toolbar { grid-template-columns: 1fr; gap: 10px; }
          .grassroots-drop-subview-tabs { width: 100%; }
          .grassroots-drop-toolbar-copy { width: 100%; justify-content: flex-start; }
        }
      `}</style>
      {/* Clean clients-style header (no green gradient, tight, exact match to what user loves) */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: "-0.01em" }}>Grassroots Tracking</h1>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {saveState !== "idle" && (
            <div style={{ minWidth: 96, padding: "5px 10px", borderRadius: 999, border: `1px solid ${C.border}`, background: "#fff", color: saveTone, fontSize: 11, fontWeight: 800, textAlign: "center" }}>
              {saveLabel}
            </div>
          )}

          {/* Nicer pill-style segmented controls for History + Filter (matching old customer lifecycle feel) */}
          <div style={{ display: "inline-flex", borderRadius: 999, border: `1px solid ${C.border}`, overflow: "hidden", background: "#fff" }}>
            <button
              onClick={() => setShowHistoryPanel((current) => !current)}
              style={{
                padding: "6px 14px",
                fontSize: 12,
                fontWeight: 700,
                border: "none",
                background: showHistoryPanel ? C.pri : "transparent",
                color: showHistoryPanel ? "#fff" : C.text,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <I.Clock /> History{categoryHistory.length > 0 ? ` (${categoryHistory.length})` : ""}
            </button>
            <div style={{ width: 1, background: C.border, alignSelf: "stretch" }} />
            <button
              onClick={() => setShowFilterPanel((current) => !current)}
              style={{
                padding: "6px 14px",
                fontSize: 12,
                fontWeight: 700,
                border: "none",
                background: showFilterPanel ? C.pri : "transparent",
                color: showFilterPanel ? "#fff" : C.text,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <FilterIcon /> Filter{filterCount > 0 ? ` (${filterCount})` : ""}
            </button>
          </div>

          <Btn variant="ghost" size="md" onClick={exportVisibleToCSV}>
            Export
          </Btn>

          {activeConfig.id === "drops" ? (
            <>
              <Btn variant="secondary" size="sm" icon={<I.Plus />} onClick={openNewDraft} disabled={!canEditTargets || !!newDraft || !!editDraft} style={{ padding: '6px 12px', fontSize: '12px', fontWeight: 600 }}>
                Add Business
              </Btn>
              <Btn variant="primary" size="sm" icon={<I.MessageSquare />} onClick={() => openLogModal()} disabled={!canLogActivity} style={{ padding: '6px 12px', fontSize: '12px', fontWeight: 600 }}>
                Log Activity
              </Btn>
            </>
          ) : (
            <Btn 
              variant="primary" 
              size="sm" 
              icon={<I.Plus />} 
              onClick={openNewDraft} 
              disabled={!canEditTargets || !!newDraft || !!editDraft}
              style={{ padding: '6px 12px', fontSize: '12px', fontWeight: 600 }}
            >
              New {activeConfig.singular}
            </Btn>
          )}
        </div>
      </div>

      {/* Metrics cards removed per feedback — they were adding too much visual weight and whitespace */}

      {/* ═══ LITERAL PORT of Customer Lifecycle header from ClientsPage — search bar + pills + connected tabs + banner (not a recreation) ═══ */}
      <div style={{ marginBottom: 8 }}>
        {/* Search Bar — exact structure, padding, SVG, input, pills placement, | separator, and pill styles copied from ClientsPage.jsx:1428 */}
        <div style={{borderBottom:`1.5px solid ${C.borderLight}`,background:C.bg,transition:"border-color 0.15s"}}
          onFocus={e=>e.currentTarget.style.borderBottomColor=C.pri} onBlur={e=>e.currentTarget.style.borderBottomColor=C.borderLight}>
          <div style={{display:"flex",alignItems:"center",padding:"0 16px"}}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={lifecycleSearch?C.pri:C.textMut} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input value={lifecycleSearch} onChange={e=>setLifecycleSearch(e.target.value)}
              placeholder="Search organizers, events, or notes…"
              className="no-focus-ring"
              style={{border:"none",outline:"none",background:"transparent",fontSize:13,fontWeight:500,color:C.text,padding:"12px 10px",width:"100%",fontFamily:"inherit"}} />
            {lifecycleSearch && <button onClick={()=>setLifecycleSearch("")} style={{border:"none",background:"none",cursor:"pointer",color:C.textMut,padding:2,display:"flex"}} title="Clear"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>}
            {/* Filter pills area — exact layout/placement from reference */}
            <div style={{display:"flex",gap:4,marginLeft:8,flexShrink:0}}>
              {activeLifecycleTab === 'events' && ['Identified','Corresponding','Booked','Abandoned'].map(label => {
                const val = label.toLowerCase();
                const on = eventsStatusFilter === val;
                const col = val==='identified'?C.acc : val==='corresponding'?'#1E40AF' : val==='booked'?C.suc : C.dan;
                return <button key={val} onClick={()=>setEventsStatusFilter(on?null:val)} style={{padding:"4px 10px",borderRadius:8,border:`1.5px solid ${on?col:C.border}`,background:on?col:"transparent",color:on?"#fff":C.textMut,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s",whiteSpace:"nowrap"}}>{label}</button>;
              })}
              {/* Drops: business category filters (All + types with counts) + | + Business toggle (user spec) */}
              {activeLifecycleTab === 'drops' && (
                <>
                  {['All', ...GRASSROOTS_BUSINESS_CATEGORY_OPTIONS].map(cat => {
                    const on = dropActivityCategory === cat || (cat === 'All' && dropActivityCategory === 'All');
                    const cnt = cat === 'All' ? (dropCategoryCounts?.total || 0) : (dropCategoryCounts?.[cat] || 0);
                    return (
                      <button
                        key={cat}
                        onClick={() => {
                          setDropActivityCategory(cat === 'All' ? 'All' : cat);
                          if (dropSubview !== 'activity') setDropSubview('activity');
                        }}
                        style={{
                          padding: '4px 9px',
                          borderRadius: 8,
                          border: `1.5px solid ${on ? C.pri : C.border}`,
                          background: on ? C.priLt : 'transparent',
                          color: on ? C.pri : C.textMut,
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {cat} {cnt}
                      </button>
                    );
                  })}
                  <div style={{width:1,height:20,background:C.border,margin:"0 4px",flexShrink:0}} />
                  <button
                    onClick={() => setDropSubview('business')}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 8,
                      border: `1.5px solid ${dropSubview === 'business' ? C.pri : C.border}`,
                      background: dropSubview === 'business' ? C.priLt : 'transparent',
                      color: dropSubview === 'business' ? C.pri : C.textMut,
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Business
                  </button>
                </>
              )}
              {/* Past Events only makes sense on Events tab (user feedback) */}
              {activeLifecycleTab === 'events' && (
                <>
                  <div style={{width:1,height:20,background:C.border,margin:"0 4px",flexShrink:0}} />
                  <button onClick={()=>setShowPastEvents(v=>!v)}
                    style={{padding:"4px 10px",borderRadius:8,border:`1.5px solid ${showPastEvents?C.dan:C.border}`,background:showPastEvents?`${C.dan}12`:"transparent",color:showPastEvents?C.dan:C.textMut,fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s",whiteSpace:"nowrap"}}>
                    Past Events
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Tab bar — reverted to the compact left-aligned underline + count pill style you liked before the strict Clients port */}
        <div style={{ display: 'flex', gap: 2, borderBottom: `1px solid ${C.borderLight}`, background: C.bg, padding: '0 4px' }}>
          {[
            { id: 'events', label: 'Events', color: C.pri },
            { id: 'drops', label: 'Visits', color: C.pri },
            { id: 'corporate', label: 'Corporate Partnerships', color: C.pri },
            { id: 'apartments', label: 'Apartments', color: C.pri },
            { id: 'ppp', label: 'Pet Professional Partnerships', color: C.pri },
            { id: 'all', label: 'Activity', color: C.pri },
          ].map(tab => {
            const active = tab.id === activeLifecycleTab;
            const count = tab.id === 'all'
              ? targets.filter(t => t.category === 'drops' || (t.category === 'events' && normalizeGrassrootsStatus(t.status) === 'booked')).length
              : targets.filter(t => {
                  if (tab.id === 'events') return t.category === 'events';
                  if (tab.id === 'drops') return t.category === 'drops';
                  if (tab.id === 'corporate') return t.category === 'corporate_partnerships';
                  if (tab.id === 'apartments') return t.category === 'apartments';
                  if (tab.id === 'ppp') return t.category === 'pet_professional_partnerships';
                  return false;
                }).length;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveLifecycleTab(tab.id);
                  const map = { events: 'events', drops: 'drops', corporate: 'corporatePartnerships', apartments: 'apartments', ppp: 'petProfessionalPartnerships', all: 'events' };
                  setActiveCategory(map[tab.id] || 'events');
                  if (tab.id !== 'events') setEventsStatusFilter(null);
                }}
                style={{
                  padding: '10px 14px',
                  fontSize: 13,
                  fontWeight: active ? 700 : 600,
                  color: active ? C.text : C.textSec,
                  background: 'transparent',
                  border: 'none',
                  borderBottom: active ? `3px solid ${C.pri}` : '3px solid transparent',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  marginBottom: -1,
                  whiteSpace: 'nowrap',
                }}
              >
                {tab.label}
                <span style={{
                  background: active ? C.pri : '#E5E7EB',
                  color: active ? '#fff' : C.textSec,
                  padding: '1px 7px',
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 800,
                  lineHeight: 1.1,
                  minWidth: 18,
                  textAlign: 'center',
                }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Explainer Banner — exact structure + gradient + padding from ClientsPage.jsx:1523 (static text for Grassroots; full editable banners not needed here) */}
        <div style={{padding:"10px 18px",borderBottom:`1px solid ${C.borderLight}`,background:`linear-gradient(135deg, ${C.priLt||C.pri+"08"}40, ${C.surface})`,fontSize:12,lineHeight:1.6,color:C.textSec}}>
          {activeLifecycleTab === 'events' && "Track daily outreach, follow-ups, and next steps for local events and activations. Use Log to record contact and set manual follow-up dates."}
          {activeLifecycleTab === 'drops' && "Logged visits by business category. Use the category pills in the header (All / Veterinarian / Groomer / ...). Switch to the Business rollup after the vertical bar."}
          {activeLifecycleTab === 'corporate' && "Corporate partnership targets. Filter by status and log follow-ups. Past events toggle shows completed outreach."}
          {activeLifecycleTab === 'apartments' && "Apartment complex outreach and partnerships. Same status + follow-up workflow as other categories."}
          {activeLifecycleTab === 'ppp' && "Pet professional and service partner pipeline. Full status filtering and manual next-contact control."}
          {activeLifecycleTab === 'all' && "What's legit — booked events and logged visits in one feed. The longer-term partnership pipelines (Corporate, Apartments, Pet Professional) live in their own tabs."}
        </div>
      </div>

      {/* Drop subview pills now live inside the literal ported search bar row when activeLifecycleTab === 'drops' (no duplicate toolbar) */}

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

              {activeConfig.id === "drops" && isDropLogActive && (
                <div ref={logComposerScrollRef} className="grassroots-new-draft-anchor">
                  {logActivityEditor}
                </div>
              )}

              {/* Category filters now live in the top header pills area for Drops (per spec). Old component suppressed to avoid duplicate UI. */}

              {activeLifecycleTab === "all" ? (
                <DenseGrassrootsTable
                  targets={allTabTargets}
                  activitiesByTarget={activitiesByTarget}
                  categoryConfig={activeConfig}
                  columnMap={getGrassrootsColumnMap("all")}
                  onLog={openLogModal}
                  onEdit={(t) => {
                    const tabMap = { events: "events", drops: "drops", corporate_partnerships: "corporate", apartments: "apartments", pet_professional_partnerships: "ppp" };
                    const cfg = getGrassrootsCategoryConfig(t.category);
                    if (t.category === "drops") setDropSubview("business");
                    setActiveLifecycleTab(tabMap[t.category] || "events");
                    setActiveCategory(cfg.id);
                    setNewDraft(null);
                    setEditDraft(buildEditorDraft(t));
                  }}
                  onToggleUpdates={toggleUpdates}
                  expandedUpdates={expandedUpdates}
                  followUpSortDirection={followUpSortDirection}
                  onToggleFollowUpSort={toggleFollowUpSort}
                  onShowFollowUpInfo={(target, clickX, clickY) => {
                    const setOn = target.created_at ? fmtDate(target.created_at) : "—";
                    setFollowUpInfo({ targetId: target.id, followUpDate: target.next_contact_date, setOn, x: (clickX ?? 420) + 12, y: (clickY ?? 260) + 8 });
                  }}
                />
              ) : activeConfig.id === "drops" && dropSubview === "activity" ? (
                <DenseGrassrootsTable
                  targets={filteredDropActivityRows}
                  activitiesByTarget={{}}
                  categoryConfig={activeConfig}
                  columnMap={getGrassrootsColumnMap("drops", "activity")}
                  onEdit={openEditDropActivity}
                  expandedUpdates={new Set()}
                />
              ) : visibleTargets.length === 0 && !newDraft ? (
                <Card style={{ padding: 30, textAlign: "center", color: C.textMut, borderRadius: 14 }}>
                  <div style={{ fontSize: 16, fontWeight: 900, color: C.text, marginBottom: 6 }}>No {activeConfig.label.toLowerCase()} match this view</div>
                  <div style={{ fontSize: 13, marginBottom: 16 }}>Add a row or adjust the filter.</div>
                  {canEditTargets && <Btn variant="primary" icon={<I.Plus />} onClick={openNewDraft}>Add {activeConfig.singular}</Btn>}
                </Card>
              ) : (
                <>
                  {activeConfig.id === "events" ? (
                    <>
                      {/* New event inline editor (kept for full functionality) */}
                      {canEditTargets && newDraft && (
                        <div ref={newDraftScrollRef} className="grassroots-new-draft-anchor" style={{ marginBottom: 8 }}>
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
                      {/* Edit event inline editor (lifted when editing via dense row) */}
                      {canEditTargets && editDraft && activeConfig.id === "events" && (
                        <div ref={newDraftScrollRef} className="grassroots-new-draft-anchor" style={{ marginBottom: 8 }}>
                          <EventTargetInlineEditor
                            key={editDraft.id}
                            draft={editDraft}
                            saving={savingDraft}
                            activities={activitiesByTarget[editDraft.id] || []}
                            attachmentsByActivity={attachmentsByActivity}
                            canLog={canLogActivity}
                            onChange={updateDraft}
                            onSave={saveDraft}
                            onCancel={closeEditor}
                            onDelete={() => deleteTarget(editDraft)}
                            onLog={() => openLogModal(editDraft)}
                            onPreviewAttachment={previewGrassrootsAttachment}
                            previewingAttachmentId={previewingAttachmentId}
                          />
                        </div>
                      )}
                      {/* THE DENSE CLIENTS-STYLE TABLE for Events — exact whitespace, columns, follow-up + log behavior */}
                      <DenseGrassrootsTable
                        targets={lifecycleDisplayTargets}
                        activitiesByTarget={activitiesByTarget}
                        categoryConfig={activeConfig}
                        onLog={startInlineLog}
                        onEdit={(t) => { setNewDraft(null); setEditDraft(buildEditorDraft(t)); }}
                        onUpdateFollowUp={updateFollowUpDate}
                        onToggleUpdates={toggleUpdates}
                        expandedUpdates={expandedUpdates}
                        eventDateSortDirection={eventDateSortDirection}
                        onToggleEventDateSort={toggleEventDateSort}
                        followUpSortDirection={followUpSortDirection}
                        onToggleFollowUpSort={toggleFollowUpSort}
                        onShowFollowUpInfo={(target, clickX, clickY) => {
                          const targetActivities = activitiesByTarget[target.id] || [];
                          const latestFollowUpActivity = [...targetActivities]
                            .filter(a => a.notes && a.notes.toLowerCase().includes('follow'))
                            .sort((a, b) => String(b.created_at || b.activity_date).localeCompare(String(a.created_at || a.activity_date)))[0];
                          const setOn = latestFollowUpActivity 
                            ? fmtDate(latestFollowUpActivity.activity_date || latestFollowUpActivity.created_at)
                            : (target.created_at ? fmtDate(target.created_at) : "—");

                          // Use real click position instead of hardcoded values.
                          // Offset a bit so the popover appears near (but not directly on top of) the clicked Follow-Up cell.
                          const x = (clickX ?? 420) + 12;
                          const y = (clickY ?? 260) + 8;

                          setFollowUpInfo({ targetId: target.id, followUpDate: target.next_contact_date, setOn, x, y });
                        }}
                        inlineLoggingId={inlineLoggingId}
                        inlineLogNotes={inlineLogNotes}
                        inlineLogNextDate={inlineLogNextDate}
                        onStartInlineLog={startInlineLog}
                        onInlineLogNotesChange={setInlineLogNotes}
                        onInlineLogNextDateChange={setInlineLogNextDate}
                        savingLog={savingLog}
                        onSaveInlineLog={async () => {
                          const target = inlineLogTargetRef.current
                            || lifecycleDisplayTargets.find(t => t.id === inlineLoggingId)
                            || targets.find(t => t.id === inlineLoggingId);
                          if (!target) {
                            toast("Could not find the row to log against", "error");
                            return;
                          }

                          const notes = (inlineLogNotes || "").trim();
                          const nextDate = inlineLogNextDate || null;

                          setSavingLog(true);
                          try {
                            const activityId = createGrassrootsClientUuid ? createGrassrootsClientUuid() : crypto.randomUUID();

                            // Insert the activity (same pattern as the big log modal for Events)
                            const { error: insertErr } = await supabase.from("grassroots_activity").insert({
                              id: activityId,
                              location_id: locationId,
                              target_id: target.id,
                              activity_type: getGrassrootsActivityType(target.category || activeConfig.id),
                              activity_date: todayStr(),
                              notes: notes || "Logged",
                              next_contact_date: nextDate,
                              created_by_user_id: actor.userId,
                              created_by_name: actor.name,
                            });

                            if (insertErr) throw insertErr;

                            // If a follow-up date was set in the composer, update the target
                            if (nextDate && nextDate !== target.next_contact_date) {
                              await updateFollowUpDate(target, nextDate);
                            }

                            // Refresh (loadGrassroots updates targets/activities state itself)
                            await loadGrassroots();

                            // Clear composer, keep the row expanded so the new log appears in history
                            setInlineLoggingId(null);
                            setInlineLogNotes("");
                            setInlineLogNextDate("");
                            toast("Log saved");
                          } catch (err) {
                            console.error("inline log save failed", err);
                            toast(err?.message || "Failed to save log", "error");
                          } finally {
                            setSavingLog(false);
                          }
                        }}
                        onCancelInlineLog={() => {
                          setInlineLoggingId(null);
                          setInlineLogNotes("");
                          setInlineLogNextDate("");
                        }}
                      />
                    </>
                  ) : (
                    <>
                      {/* Non-events edit editor — rendered above the unified table (matches the Events pattern) */}
                      {canEditTargets && editDraft && (
                        <div ref={newDraftScrollRef} className="grassroots-new-draft-anchor" style={{ marginBottom: 8 }}>
                          <TargetEditor
                            key={editDraft.id}
                            draft={editDraft}
                            categoryConfig={activeConfig}
                            saving={savingDraft}
                            activities={activitiesByTarget[editDraft.id] || []}
                            attachmentsByActivity={attachmentsByActivity}
                            canLog={canLogActivity}
                            onChange={updateDraft}
                            onSave={saveDraft}
                            onCancel={closeEditor}
                            onDelete={() => deleteTarget(editDraft)}
                            onLog={() => openLogModal(editDraft)}
                            onPreviewAttachment={previewGrassrootsAttachment}
                            previewingAttachmentId={previewingAttachmentId}
                          />
                        </div>
                      )}
                      {/* Unified dense table — same component as Events, mapped per category via columnMap */}
                      <DenseGrassrootsTable
                        targets={sortedVisibleTargets}
                        activitiesByTarget={activitiesByTarget}
                        categoryConfig={activeConfig}
                        columnMap={getGrassrootsColumnMap(activeConfig.id, activeConfig.id === "drops" ? dropSubview : null)}
                        onLog={openLogModal}
                        onEdit={(t) => { setNewDraft(null); setEditDraft(buildEditorDraft(t)); }}
                        onToggleUpdates={toggleUpdates}
                        expandedUpdates={expandedUpdates}
                        followUpSortDirection={followUpSortDirection}
                        onToggleFollowUpSort={toggleFollowUpSort}
                        onShowFollowUpInfo={(target, clickX, clickY) => {
                          const setOn = target.created_at ? fmtDate(target.created_at) : "—";
                          setFollowUpInfo({ targetId: target.id, followUpDate: target.next_contact_date, setOn, x: (clickX ?? 420) + 12, y: (clickY ?? 260) + 8 });
                        }}
                      />
                    </>
                  )}
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

      {/* Small "set/created" info popover for Follow-up column — matches Customer Lifecycle reference click behavior (no direct edit prompt) */}
      {followUpInfo && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9998 }} onClick={() => setFollowUpInfo(null)}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              // Better viewport-aware positioning so it doesn't fly off to the left or off-screen
              left: Math.max(8, Math.min(
                (followUpInfo.x || 380),
                (typeof window !== 'undefined' ? window.innerWidth : 1400) - 280
              )),
              top: Math.max(8, Math.min(
                (followUpInfo.y || 240),
                (typeof window !== 'undefined' ? window.innerHeight : 900) - 140
              )),
              zIndex: 9999,
              minWidth: 260,
              background: C.surface,
              border: `1.5px solid ${C.border}`,
              borderRadius: 10,
              boxShadow: "0 12px 40px rgba(0,0,0,0.12)",
              padding: "12px 14px",
              fontSize: 12,
            }}
          >
            <div style={{ fontWeight: 700, color: C.pri, marginBottom: 6 }}>Follow-up date</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 8 }}>{followUpInfo.followUpDate ? fmtDate(followUpInfo.followUpDate) : "—"}</div>
            <div style={{ fontSize: 11, color: C.textSec }}>Set on: <span style={{ fontWeight: 700, color: C.text }}>{followUpInfo.setOn || "—"}</span></div>
            <div style={{ marginTop: 10, fontSize: 10, color: C.textMut }}>Use the Log button on this row to change the next follow-up date.</div>
            <button onClick={() => setFollowUpInfo(null)} style={{ position: "absolute", top: 6, right: 8, border: "none", background: "transparent", color: C.textMut, fontSize: 14, cursor: "pointer" }}>×</button>
          </div>
        </div>
      )}

      {!isDropLogActive && logActivityEditor}

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
