import React from "react";
import { pillButton } from "./styles";

export function OptionPills({ options, value, onChange, disabled = false }) {
  return (
    <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          disabled={disabled || option.disabled}
          style={pillButton(value === option.id, disabled || option.disabled)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
