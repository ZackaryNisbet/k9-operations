import React from "react";
import { C } from "../../../shared/theme";
import { CalendarPicker } from "../../../shared/ui";
import {
  GRASSROOTS_STATUS_OPTIONS,
  GRASSROOTS_EVENT_TYPE_OPTIONS,
  normalizeGrassrootsStatus,
  normalizeGrassrootsEventType,
} from "../../grassrootsData";
import { INPUT_STYLE, Label } from "./primitives";

export function StatusPicker({ value, onChange }) {
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

export function ActiveToggle({ value, onChange }) {
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

export function EventTypePicker({ value, onChange }) {
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

export function FieldEditor({ field, value, onChange }) {
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

  const isNumber = field.type === "number";
  return (
    <label style={{ display: "block" }}>
      <Label>{field.label}</Label>
      <input
        type={field.type === "email" ? "email" : "text"}
        inputMode={isNumber ? "decimal" : undefined}
        value={value ?? ""}
        onChange={(event) => onChange(isNumber ? event.target.value.replace(/[^0-9.]/g, "") : event.target.value)}
        placeholder={field.placeholder || field.label}
        style={INPUT_STYLE}
      />
    </label>
  );
}
