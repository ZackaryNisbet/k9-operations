import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../supabaseClient";
import { C } from "../../shared/theme";
import { I } from "../../shared/icons";
import { Btn, CalendarPicker, Card, MiniDatePicker } from "../../shared/ui";
import { hasLeanPermission } from "../../shared/permissions";
import {
  GRASSROOTS_CATEGORY_CONFIGS,
  GRASSROOTS_BUSINESS_CATEGORY_OPTIONS,
  GRASSROOTS_EVENT_SAVE_RPC,
  GRASSROOTS_EVENT_TYPE_OPTIONS,
  GRASSROOTS_FILTER_OP_LABELS,
  GRASSROOTS_STATUS_OPTIONS,
  applyGrassrootsFilters,
  buildGrassrootsEventSaveRpcArgs,
  buildGrassrootsMetrics,
  calculateGrassrootsCpl,
  compareGrassrootsEventSchedule,
  getGrassrootsActivityCount,
  getGrassrootsActivityType,
  getGrassrootsBusinessCategory,
  getGrassrootsCategoryConfig,
  getGrassrootsDefaultFilters,
  getGrassrootsSplitAddress,
  getGrassrootsNextDate,
  getGrassrootsPrimaryEventDate,
  getGrassrootsStatusLabel,
  compareGrassrootsHistoryDesc,
  groupGrassrootsActivities,
  makeBlankGrassrootsTarget,
  normalizeGrassrootsEventDates,
  normalizeGrassrootsEventType,
  normalizeGrassrootsStatus,
  resolveGrassrootsTargetIsActive,
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

const FIELD_CONFIGS = {
  events: [
    { key: "organizer", label: "Organizer", placeholder: "Organizer" },
    { key: "address", label: "Address", placeholder: "Event address" },
    { key: "event_start_date", label: "Date", type: "date" },
    { key: "event_type", label: "Type", type: "select", options: GRASSROOTS_EVENT_TYPE_OPTIONS, placeholder: "Type" },
    { key: "expected_audience", label: "Expected Audience", type: "number", placeholder: "Expected audience" },
    { key: "leads_captured", label: "Leads Captured", type: "number", placeholder: "Leads captured" },
    { key: "cost", label: "Cost", type: "number", placeholder: "Cost" },
    { key: "cpl", label: "CPL", type: "computed", placeholder: "CPL" },
    { key: "first_name", label: "Contact Name", placeholder: "Contact name" },
    { key: "contact_email", label: "Contact Email", type: "email", placeholder: "Contact email" },
    { key: "contact_phone", label: "Contact Number", placeholder: "Contact number" },
    { key: "proposal", label: "Notes", type: "textarea", placeholder: "Notes about this event" },
  ],
  drops: [
    { key: "business_category", label: "Category", type: "select", options: GRASSROOTS_BUSINESS_CATEGORY_OPTIONS, allowCustom: true, placeholder: "Category" },
    { key: "address", label: "Address", placeholder: "Business address" },
  ],
  corporatePartnerships: [
    { key: "first_name", label: "First Name", placeholder: "First name" },
    { key: "last_name", label: "Last Name", placeholder: "Last name" },
    { key: "us_employees", label: "US Employees", type: "number", placeholder: "Number of US employees" },
    { key: "local_employees", label: "Local Employees", type: "number", placeholder: "Number of local employees" },
    { key: "contact_source", label: "Contact Source", placeholder: "Contact source" },
    { key: "contact_email", label: "Contact Email", type: "email", placeholder: "Contact email" },
    { key: "contact_phone", label: "Contact Phone", placeholder: "Contact phone" },
    { key: "initial_contact_date", label: "Initial Contact Date", type: "date" },
    { key: "last_contact_date", label: "Last Contact Date", type: "date" },
    { key: "proposal", label: "Proposal", type: "textarea", placeholder: "Proposal details" },
  ],
  apartments: [
    { key: "address", label: "Address", placeholder: "Apartment address" },
    { key: "first_name", label: "First Name", placeholder: "First name" },
    { key: "last_name", label: "Last Name", placeholder: "Last name" },
    { key: "contact_source", label: "Contact Source", placeholder: "Contact source" },
    { key: "contact_email", label: "Contact Email", type: "email", placeholder: "Contact email" },
    { key: "contact_phone", label: "Contact Phone", placeholder: "Contact phone" },
    { key: "proposal", label: "Proposal", type: "textarea", placeholder: "Proposal or partnership notes" },
  ],
  petProfessionalPartnerships: [
    { key: "business_category", label: "Category", type: "select", options: GRASSROOTS_BUSINESS_CATEGORY_OPTIONS, allowCustom: true, placeholder: "Category" },
    { key: "address", label: "Address", placeholder: "Business address" },
    { key: "first_name", label: "First Name", placeholder: "First name" },
    { key: "last_name", label: "Last Name", placeholder: "Last name" },
    { key: "contact_source", label: "Contact Source", placeholder: "Contact source" },
    { key: "contact_email", label: "Contact Email", type: "email", placeholder: "Contact email" },
    { key: "contact_phone", label: "Contact Phone", placeholder: "Contact phone" },
    { key: "initial_contact_date", label: "Initial Contact Date", type: "date" },
    { key: "last_contact_date", label: "Last Contact Date", type: "date" },
    { key: "proposal", label: "Proposal", type: "textarea", placeholder: "Proposal details" },
  ],
};

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
  return {
    address: place?.formatted_address || "",
    address_line_1: [streetNumber, route].filter(Boolean).join(" ").trim(),
    address_line_2: "",
    address_city: read("locality") || read("postal_town") || read("sublocality") || read("administrative_area_level_3"),
    address_state: read("administrative_area_level_1", "short_name"),
    address_postal_code: read("postal_code"),
    address_country: read("country", "short_name"),
    google_place_id: place?.place_id || "",
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
  const legacyAddress = String(draft.address || "").trim() || buildGrassrootsLegacyAddressFromSplitAddress(draft);

  return {
    location_id: locationId,
    category: draft.category,
    name: String(draft.name || "").trim(),
    address: legacyAddress || null,
    ...(isEvent ? {
      address_line_1: splitAddress.address_line_1 || null,
      address_line_2: splitAddress.address_line_2 || null,
      address_city: splitAddress.address_city || null,
      address_state: splitAddress.address_state || null,
      address_postal_code: splitAddress.address_postal_code || null,
      address_country: splitAddress.address_country || null,
      google_place_id: splitAddress.google_place_id || null,
    } : {}),
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
    details: isEvent
      ? { ...details, event_dates: eventDates, is_multi_day_event: Boolean(draft.is_multi_day_event || eventDates.length > 1) }
      : details,
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
    if (field.key === "event_type") {
      return (
        <label style={{ display: "block" }}>
          <Label>{field.label}</Label>
          <select
            value={selected}
            onChange={(event) => onChange(event.target.value)}
            style={{
              ...INPUT_STYLE,
              appearance: "auto",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            <option value="">{field.placeholder || "Select type"}</option>
            {options.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
      );
    }
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

function GooglePlacesAddressInput({ label = "Address", value, onChange, onPlaceSelect, placeholder = "Start typing an address" }) {
  const inputRef = useRef(null);
  const autocompleteRef = useRef(null);

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
        onChange(address);
        onPlaceSelect?.({ ...parsedAddress, address: parsedAddress.address || address });
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
        onChange={(event) => onChange(event.target.value)}
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
          <CalendarPicker label={multiDay ? `Date ${index + 1}` : "Date"} value={row.event_date || ""} onChange={(value) => updateRow(index, "event_date", value)} />
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

function TargetEditor({ draft, categoryConfig, saving, onChange, onSave, onCancel, onDelete }) {
  const categoryId = categoryConfig.id;
  const fields = FIELD_CONFIGS[categoryId] || [];
  const getFieldValue = (field) => {
    if (field.key === "cpl") return fmtCurrencyNumber(calculateGrassrootsCpl(draft.cost, draft.leads_captured));
    return draft[field.key];
  };
  const changeStatus = (value) => {
    const status = normalizeGrassrootsStatus(value);
    onChange("status", status);
    if (status === "abandoned") onChange("is_active", false);
    else if (normalizeGrassrootsStatus(draft.status) === "abandoned") onChange("is_active", true);
  };
  const applyPlaceAddress = (parts) => {
    Object.entries(parts || {}).forEach(([key, value]) => onChange(key, value || ""));
  };

  return (
    <Card style={{ padding: 0, overflow: "visible", border: `1.5px solid ${C.pri}30`, boxShadow: "0 16px 40px rgba(20,83,45,0.10)", animation: "grassrootsComposerIn 0.22s ease-out" }}>
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
      <div style={{ padding: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
        <FieldEditor
          field={{ key: "name", label: categoryConfig.nameLabel, placeholder: categoryConfig.nameLabel }}
          value={draft.name}
          onChange={(value) => onChange("name", value)}
        />
        {categoryConfig.usesStatus !== false && <StatusPicker value={draft.status || "identified"} onChange={changeStatus} />}
        {categoryId !== "events" && <ActiveToggle value={draft.is_active !== false} onChange={(value) => onChange("is_active", value)} />}
        {categoryId === "events" ? (
          <>
            <GooglePlacesAddressInput
              value={draft.address}
              onChange={(value) => onChange("address", value)}
              onPlaceSelect={applyPlaceAddress}
              placeholder="Event address"
            />
            <EventDateEditor draft={draft} onChange={onChange} />
            <FieldEditor field={{ key: "event_type", label: "Type", type: "select", options: GRASSROOTS_EVENT_TYPE_OPTIONS }} value={draft.event_type} onChange={(value) => onChange("event_type", value)} />
            <FieldEditor field={{ key: "organizer", label: "Organizer", placeholder: "Organizer" }} value={draft.organizer} onChange={(value) => onChange("organizer", value)} />
            <FieldEditor field={{ key: "expected_audience", label: "Expected Audience", type: "number", placeholder: "Expected audience" }} value={draft.expected_audience} onChange={(value) => onChange("expected_audience", value)} />
            <FieldEditor field={{ key: "leads_captured", label: "Leads Captured", type: "number", placeholder: "Leads captured" }} value={draft.leads_captured} onChange={(value) => onChange("leads_captured", value)} />
            <FieldEditor field={{ key: "cost", label: "Cost", type: "number", placeholder: "Cost" }} value={draft.cost} onChange={(value) => onChange("cost", value)} />
            <FieldEditor field={{ key: "cpl", label: "CPL", type: "computed", placeholder: "—" }} value={getFieldValue({ key: "cpl" }) || "—"} onChange={() => {}} />
            <FieldEditor field={{ key: "first_name", label: "Contact Name", placeholder: "Contact name" }} value={draft.first_name} onChange={(value) => onChange("first_name", value)} />
            <FieldEditor field={{ key: "contact_email", label: "Contact Email", type: "email", placeholder: "Contact email" }} value={draft.contact_email} onChange={(value) => onChange("contact_email", value)} />
            <FieldEditor field={{ key: "contact_phone", label: "Contact Number", placeholder: "Contact number" }} value={draft.contact_phone} onChange={(value) => onChange("contact_phone", value)} />
            <FieldEditor field={{ key: "proposal", label: "Notes", type: "textarea", placeholder: "Notes about this event" }} value={draft.proposal} onChange={(value) => onChange("proposal", value)} />
          </>
        ) : (
          fields.map((field) => {
            if (categoryId === "drops" && field.key === "address") {
              return (
                <GooglePlacesAddressInput
                  key={field.key}
                  label={field.label}
                  value={draft.address}
                  placeholder={field.placeholder || "Business address"}
                  onChange={(value) => onChange("address", value)}
                  onPlaceSelect={applyPlaceAddress}
                />
              );
            }
            return (
              <FieldEditor
                key={field.key}
                field={field}
                value={getFieldValue(field)}
                onChange={(value) => onChange(field.key, value)}
              />
            );
          })
        )}
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

function EventTargetInlineEditor({ draft, saving, onChange, onSave, onCancel, onDelete }) {
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
              <div className="grassroots-event-wide-field">
                <GooglePlacesAddressInput
                  value={draft.address}
                  onChange={(value) => onChange("address", value)}
                  onPlaceSelect={applyPlaceAddress}
                  placeholder="Event address"
                />
              </div>
              <GooglePlacesAddressInput
                label="Street"
                value={draft.address_line_1}
                onChange={(value) => onChange("address_line_1", value)}
                onPlaceSelect={applyPlaceAddress}
                placeholder="Street address"
              />
              <FieldEditor field={{ key: "address_line_2", label: "Unit", placeholder: "Suite, booth, or unit" }} value={draft.address_line_2} onChange={(value) => onChange("address_line_2", value)} />
              <FieldEditor field={{ key: "address_city", label: "City", placeholder: "City" }} value={draft.address_city} onChange={(value) => onChange("address_city", value)} />
              <FieldEditor field={{ key: "address_state", label: "State", placeholder: "State" }} value={draft.address_state} onChange={(value) => onChange("address_state", value)} />
              <FieldEditor field={{ key: "address_postal_code", label: "ZIP", placeholder: "ZIP" }} value={draft.address_postal_code} onChange={(value) => onChange("address_postal_code", value)} />
              <FieldEditor field={{ key: "address_country", label: "Country", placeholder: "Country" }} value={draft.address_country} onChange={(value) => onChange("address_country", value)} />
              <div className="grassroots-event-wide-field">
                <EventDateEditor draft={draft} onChange={onChange} />
              </div>
              <FieldEditor
                field={{ key: "event_type", label: "Type", type: "select", options: GRASSROOTS_EVENT_TYPE_OPTIONS, placeholder: "Type" }}
                value={draft.event_type}
                onChange={(value) => onChange("event_type", value)}
              />
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

function ActivityList({ activities, categoryConfig }) {
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
    return <div style={{ fontSize: 12, color: C.textMut }}>No logged {categoryConfig.countLabel.toLowerCase()} yet.</div>;
  }

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {rows.map((activity) => {
        const personSpokenWith = activity.metadata?.person_spoken_with || activity.metadata?.person_interacted_with || "";
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
              {activityType === "drop" ? "Drop" : "Development"}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: C.text, fontWeight: 800, lineHeight: 1.45, wordBreak: "break-word", whiteSpace: "pre-wrap" }}>
                {activity.notes || "No notes entered."}
              </div>
              <div style={{ marginTop: 5, display: "flex", flexWrap: "wrap", gap: 8, color: C.textMut, lineHeight: 1.35 }}>
                <span>{fmtDate(activity.activity_date)} · {activityActorName(activity)}</span>
                {personSpokenWith && <span>Spoke with {personSpokenWith}</span>}
                {activity.next_contact_date && <span>Next: {fmtDate(activity.next_contact_date)}</span>}
              </div>
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

function TrackerRow({ target, index, categoryConfig, activities, isExpanded, canLog, canEdit, onToggleUpdates, onLog, onMove, onEdit }) {
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
    <Card style={{ padding: 0, overflow: "hidden", borderRadius: 12 }}>
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
          {categoryConfig.id !== "events" && <Btn variant="secondary" size="sm" onClick={onLog} disabled={!canLog}>{categoryConfig.logLabel}</Btn>}
          <Btn variant="ghost" size="sm" icon={<I.ChevronRight />} onClick={onMove} disabled={!canEdit}>Move</Btn>
          <Btn variant="ghost" size="sm" icon={<I.Edit />} onClick={onEdit} disabled={!canEdit}>Edit</Btn>
        </div>
      </div>
      {isExpanded && (
        <div style={{ borderTop: `1px solid ${C.borderLight}`, padding: "12px 18px", background: C.bg }}>
          <ActivityList activities={activities} categoryConfig={categoryConfig} />
        </div>
      )}
    </Card>
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
  const [activeCategory, setActiveCategory] = useState("corporatePartnerships");
  const [eventDateSortDirection, setEventDateSortDirection] = useState("asc");
  const [targets, setTargets] = useState([]);
  const [activities, setActivities] = useState([]);
  const [history, setHistory] = useState([]);
  const [newDraft, setNewDraft] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [expandedUpdates, setExpandedUpdates] = useState(new Set());
  const [logPopover, setLogPopover] = useState(null);
  const [movePopover, setMovePopover] = useState(null);
  const [logNotes, setLogNotes] = useState("");
  const [logDate, setLogDate] = useState("");
  const [logContactName, setLogContactName] = useState("");
  const [filters, setFilters] = useState(() => getGrassrootsDefaultFilters("corporatePartnerships"));
  const [draftFilters, setDraftFilters] = useState(() => getGrassrootsDefaultFilters("corporatePartnerships"));
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [showFilterPicker, setShowFilterPicker] = useState(false);
  const [configuringFilterKey, setConfiguringFilterKey] = useState(null);
  const [filterPickerReady, setFilterPickerReady] = useState(false);
  const prevFilterOpen = useRef(false);

  const activeConfig = getGrassrootsCategoryConfig(activeCategory);
  const activitiesByTarget = useMemo(() => groupGrassrootsActivities(activities), [activities]);
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
  const metrics = useMemo(() => buildGrassrootsMetrics(visibleTargets, activitiesByTarget, todayStr()), [activitiesByTarget, visibleTargets]);
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
    const [targetResult, activityResult, historyResult, eventDateResult] = await Promise.all([
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
    ]);

    const eventDateTableMissing = eventDateResult.error?.code === "42P01" || eventDateResult.error?.code === "PGRST205";
    if (targetResult.error || activityResult.error || historyResult.error || (eventDateResult.error && !eventDateTableMissing)) {
      const error = targetResult.error || activityResult.error || historyResult.error || eventDateResult.error;
      if (error?.code === "42P01" || /grassroots_/.test(error?.message || "")) {
        setSchemaMissing(true);
      } else {
        console.error("Failed to load grassroots tracker", error);
        toast(error.message || "Failed to load grassroots tracker", "error");
      }
      setTargets([]);
      setActivities([]);
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
    setActivities(activityResult.data || []);
    setHistory(historyResult.data || []);
    setLoading(false);
  }, [locationId, toast]);

  useEffect(() => {
    loadGrassroots();
  }, [loadGrassroots]);

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
    setLogPopover(null);
    setMovePopover(null);
    await loadGrassroots();
    setSaveState("saved");
    window.setTimeout(() => setSaveState("idle"), 1200);
    toast("Grassroots row deleted");
  };

  const openLogPopover = (target, event) => {
    if (!canLogActivity) {
      toast("You do not have permission to log grassroots activity", "error");
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    setMovePopover(null);
    setLogPopover({ target, x: rect.left, y: rect.bottom + 6 });
    setLogNotes("");
    setLogDate("");
    setLogContactName("");
  };

  const openMovePopover = (target, event) => {
    if (!canEditTargets) {
      toast("You do not have permission to edit grassroots rows", "error");
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    setLogPopover(null);
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
    if (!logPopover?.target) return;
    if (!logNotes.trim() || !logDate) {
      toast("Notes and next date are required", "error");
      return;
    }
    const target = logPopover.target;
    const category = getGrassrootsCategoryConfig(target.category).id;
    const activityType = getGrassrootsActivityType(category);
    if (activityType === "drop" && !logContactName.trim()) {
      toast("Who did you speak with is required", "error");
      return;
    }
    const activityDate = todayStr();
    setSaveState("saving");
    const { data: insertedActivity, error } = await supabase
      .from("grassroots_activity")
      .insert({
        location_id: locationId,
        target_id: target.id,
        activity_type: activityType,
        activity_date: activityDate,
        notes: logNotes.trim(),
        next_contact_date: logDate,
        metadata: activityType === "drop" ? { person_spoken_with: logContactName.trim() } : {},
        created_by_user_id: actor.userId,
        created_by_name: actor.name,
      })
      .select("*")
      .single();
    if (error) {
      setSaveState("error");
      toast(error.message || "Failed to log update", "error");
      return;
    }

    setActivities((prev) => [insertedActivity, ...prev]);
    await loadGrassroots();
    setLogPopover(null);
    setLogNotes("");
    setLogDate("");
    setLogContactName("");
    setSaveState("saved");
    window.setTimeout(() => setSaveState("idle"), 1200);
    toast(activityType === "drop" ? "Drop logged" : "Development logged");
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

  return (
    <div style={{ maxWidth: 1240, margin: "0 auto", paddingBottom: 32 }}>
      <style>{`
        @keyframes grassrootsSlideIn { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes grassrootsFadeIn { from { opacity:0; transform:scale(0.96); } to { opacity:1; transform:scale(1); } }
        @keyframes grassrootsChipIn { from { opacity:0; transform:translateX(-6px) scale(0.92); } to { opacity:1; transform:translateX(0) scale(1); } }
        @keyframes grassrootsComposerIn { from { opacity:0; transform:translateY(-10px) scale(0.985); } to { opacity:1; transform:translateY(0) scale(1); } }
        .grassroots-event-inline-editor {
          overflow: hidden;
          border-radius: 14px;
          border: 1.5px solid ${C.border};
          background: ${C.surface};
          box-shadow: 0 14px 36px rgba(15,23,42,0.12);
          animation: grassrootsComposerIn 0.18s ease-out both;
        }
        .grassroots-event-inline-header {
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
        .grassroots-event-inline-body { padding: 14px; background: ${C.bg}; }
        .pac-container {
          z-index: 10050 !important;
          border-radius: 12px;
          border: 1px solid ${C.borderLight};
          box-shadow: 0 16px 34px rgba(15,23,42,0.18);
          font-family: 'Outfit', -apple-system, BlinkMacSystemFont, sans-serif;
          overflow: hidden;
        }
        .grassroots-event-form-grid { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.85fr); gap: 14px; align-items: start; }
        .grassroots-event-form-section { border: 1px solid ${C.borderLight}; border-radius: 12px; padding: 16px; background: ${C.surface}; }
        .grassroots-event-field-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; align-items: start; }
        .grassroots-event-wide-field { grid-column: 1 / -1; }
        .grassroots-event-date-row { display: grid; grid-template-columns: minmax(190px, 1.4fr) minmax(112px, 0.7fr) minmax(112px, 0.7fr) 36px; gap: 8px; align-items: end; }
        .grassroots-event-date-row > button { margin-bottom: 1px; }
        @media (max-width: 880px) {
          .grassroots-event-form-grid { grid-template-columns: 1fr; }
        }
        @media (max-width: 680px) {
          .grassroots-event-field-grid { grid-template-columns: 1fr; }
          .grassroots-event-date-row { grid-template-columns: 1fr; padding: 12px; border: 1px solid ${C.borderLight}; border-radius: 12px; background: ${C.bg}; }
          .grassroots-event-date-row > button { margin-bottom: 0; width: 100% !important; }
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
          <Btn variant="primary" size="lg" icon={<I.Plus />} onClick={openNewDraft} disabled={!canEditTargets || !!newDraft || !!editDraft} style={{ minWidth: 142, justifyContent: "center" }}>
            Add {activeConfig.singular}
          </Btn>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 16 }}>
        <MetricCard label="Visible" value={metrics.total} color={C.pri} />
        <MetricCard label="Active" value={metrics.active} color={C.suc} />
        <MetricCard label="Inactive" value={metrics.inactive} color={C.warn} />
        <MetricCard label="Abandoned" value={metrics.abandoned} color={C.dan} />
        {activeConfig.id !== "events" && <MetricCard label={activeConfig.countLabel} value={metrics.activities} color={C.accDk} />}
        <MetricCard label="Upcoming" value={metrics.upcoming} color={C.info} />
        <MetricCard label="Overdue" value={metrics.overdue} color={C.dan} />
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        {GRASSROOTS_CATEGORY_CONFIGS.map((category) => {
          const active = category.id === activeCategory;
          const count = targets.filter((target) => target.category === category.dbValue).length;
          return (
            <button
              key={category.id}
              type="button"
              onClick={() => setActiveCategory(category.id)}
              style={{
                padding: "8px 14px",
                borderRadius: 999,
                border: `1.5px solid ${active ? C.pri : C.border}`,
                background: active ? C.pri : "#fff",
                color: active ? "#fff" : C.text,
                fontSize: 12,
                fontWeight: 800,
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {category.label} ({count})
            </button>
          );
        })}
      </div>

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
        <div style={{ display: "grid", gap: 12 }}>
          {canEditTargets && newDraft && activeConfig.id !== "events" && (
            <TargetEditor
              draft={newDraft}
              categoryConfig={activeConfig}
              saving={savingDraft}
              onChange={updateDraft}
              onSave={saveDraft}
              onCancel={closeEditor}
            />
          )}

          {visibleTargets.length === 0 && !newDraft ? (
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
                <EventTargetInlineEditor
                  key="new-event-draft"
                  draft={newDraft}
                  saving={savingDraft}
                  onChange={updateDraft}
                  onSave={saveDraft}
                  onCancel={closeEditor}
                />
              )}
              {sortedVisibleTargets.map((target, index) => {
                if (canEditTargets && activeConfig.id === "events" && editDraft?.id === target.id) {
                  return (
                    <EventTargetInlineEditor
                      key={target.id}
                      draft={editDraft}
                      saving={savingDraft}
                      onChange={updateDraft}
                      onSave={saveDraft}
                      onCancel={closeEditor}
                      onDelete={() => deleteTarget(editDraft)}
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
                      onChange={updateDraft}
                      onSave={saveDraft}
                      onCancel={closeEditor}
                      onDelete={() => deleteTarget(editDraft)}
                    />
                  );
                }
                const rowActivities = activitiesByTarget[target.id] || [];
                return (
                  <TrackerRow
                    key={target.id}
                    target={target}
                    index={index}
                    categoryConfig={activeConfig}
                    activities={rowActivities}
                    isExpanded={expandedUpdates.has(target.id)}
                    canLog={canLogActivity}
                    canEdit={canEditTargets}
                    onToggleUpdates={() => setExpandedUpdates((prev) => {
                      const next = new Set(prev);
                      if (next.has(target.id)) next.delete(target.id);
                      else next.add(target.id);
                      return next;
                    })}
                    onLog={(event) => openLogPopover(target, event)}
                    onMove={(event) => openMovePopover(target, event)}
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

      {canLogActivity && logPopover && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9998 }} onClick={() => { setLogPopover(null); setLogNotes(""); setLogDate(""); setLogContactName(""); }}>
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              position: "fixed",
              left: Math.min(logPopover.x || 300, window.innerWidth - 360),
              top: logPopover.y || 200,
              zIndex: 9999,
              background: C.surface,
              border: `1.5px solid ${C.border}`,
              borderRadius: 14,
              padding: "16px 20px",
              width: 330,
              boxShadow: "0 12px 40px rgba(15,23,42,0.18)",
            }}
          >
            {(() => {
              const logCategoryId = getGrassrootsCategoryConfig(logPopover.target.category).id;
              const isDropLog = logCategoryId === "drops";
              return (
                <>
            <div style={{ fontSize: 14, fontWeight: 900, color: C.text, marginBottom: 10 }}>
              {isDropLog ? "Log Drop" : "Log Development"}
            </div>
            {isDropLog && (
              <label style={{ display: "block", marginBottom: 10 }}>
                <Label>Who did you speak with?</Label>
                <input
                  value={logContactName}
                  onChange={(event) => setLogContactName(event.target.value)}
                  placeholder="Person's name"
                  style={{ ...INPUT_STYLE, background: C.bg }}
                  autoFocus
                />
              </label>
            )}
            <textarea
              value={logNotes}
              onChange={(event) => setLogNotes(event.target.value)}
              placeholder={isDropLog ? "Notes about this drop..." : "Notes about this development..."}
              rows={3}
              style={{ ...INPUT_STYLE, minHeight: 88, resize: "vertical", background: C.bg, marginBottom: 10 }}
              autoFocus={!isDropLog}
            />
            <div style={{ marginBottom: 10 }}>
              <Label>{isDropLog ? "Next Drop Date" : "Next Follow-Up Date"}</Label>
              <MiniDatePicker
                value={logDate}
                onChange={setLogDate}
                recommendedDate={addDays(todayStr(), isDropLog ? 28 : 2)}
                recommendedHint={isDropLog ? "Recommended: +4 weeks unless they gave a specific return date." : "Recommended: +2 days unless the partner gave a specific callback date."}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <Btn size="sm" variant="ghost" onClick={() => { setLogPopover(null); setLogNotes(""); setLogDate(""); setLogContactName(""); }}>Cancel</Btn>
              <Btn size="sm" onClick={saveLog}>Done</Btn>
            </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
