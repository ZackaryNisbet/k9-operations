import React from "react";
import { C } from "../../shared/theme";
import GingrIconsTab from "../settings/GingrIconsTab";

export default function GingrIconsPage({ locationId }) {
  return (
    <div style={{ display: "grid", gap: 22 }}>
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 18,
          alignItems: "end",
          paddingBottom: 18,
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <div>
          <div style={{ fontSize: 11, fontWeight: 900, color: C.pri, letterSpacing: 0, marginBottom: 8 }}>
            Gingr configuration
          </div>
          <h1 style={{ margin: 0, fontSize: 34, lineHeight: "40px", fontWeight: 900, color: C.text, letterSpacing: 0 }}>
            Gingr Configuration
          </h1>
          <p style={{ margin: "8px 0 0", maxWidth: 780, fontSize: 14, lineHeight: "22px", color: C.textSec }}>
            Location-scoped pairing for icons, services, add-ons, reservation types, and workflow rules.
          </p>
        </div>
        <div
          style={{
            display: "grid",
            gap: 4,
            minWidth: 0,
            padding: "12px 14px",
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            background: C.surface,
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 850, color: C.textMut, textTransform: "uppercase", letterSpacing: 0 }}>
            Configuration scope
          </span>
          <strong style={{ fontSize: 15, lineHeight: "20px", color: C.text }}>This resort only</strong>
        </div>
      </section>

      <GingrIconsTab locationId={locationId} />
    </div>
  );
}
