// At-a-glance pipeline health pill: green check + "Verified Xm ago · next 4:15".
// Click to open the full detail panel. Detail/cadence live in the tooltip too.
import React from "react";
import { C } from "../../../shared/theme";
import { HEALTH_COLORS } from "./constants";

export function HealthBadge({ model, onOpen }) {
  const c = HEALTH_COLORS[model.tone] || C.textMut;
  const primary = model.ok && model.verifiedAgo ? `Verified ${model.verifiedAgo}` : model.label;
  const title = [model.detail, model.nextClock ? `Next run ${model.nextClock} (every 15 min)` : null].filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      onClick={onOpen}
      title={title || model.detail}
      style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 34, padding: "0 12px", borderRadius: 9, border: `1px solid ${c}40`, background: `${c}0F`, fontSize: 12.5, fontWeight: 700, color: c, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" }}
    >
      {model.ok ? (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" fill={c} /><path d="M5 8.2l2 2 4-4.6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      ) : (
        <span style={{ width: 8, height: 8, borderRadius: 99, background: c, boxShadow: `0 0 6px ${c}80` }} />
      )}
      {primary}
      {model.nextClock ? <span style={{ color: C.textMut, fontWeight: 600 }}>· next {model.nextClock}</span> : null}
    </button>
  );
}
