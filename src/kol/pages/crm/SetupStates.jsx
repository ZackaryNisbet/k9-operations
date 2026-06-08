// Setup states for the CRM page (src/kol/pages/CrmPage.jsx) — the inline banner
// and the full-page notice that launch the Ignite onboarding wizard.
import React from "react";
import { C } from "../../../shared/theme";
import { I } from "../../../shared/icons";
import { Btn } from "../../../shared/ui";

export function SetupBanner({ onStart }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", marginBottom: 14, borderRadius: 12, border: `1.5px solid ${C.pri}33`, background: `linear-gradient(135deg, ${C.priLt}, ${C.surface})` }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: `${C.pri}14`, display: "flex", alignItems: "center", justifyContent: "center", color: C.pri, flexShrink: 0 }}>
        <I.Sparkle />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 800, color: C.text }}>Ignite isn't connected for this location yet</div>
        <div style={{ fontSize: 12.5, color: C.textSec }}>Answer a few questions and we'll wire up booking-form capture — no developer required.</div>
      </div>
      <Btn size="sm" onClick={onStart} style={{ flexShrink: 0 }}>Set up Ignite</Btn>
    </div>
  );
}

export function SetupNotice({ onStart, canStart }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 14, padding: "64px 24px", border: `1.5px dashed ${C.border}`, borderRadius: 16, background: C.surfaceHover }}>
      <div style={{ width: 56, height: 56, borderRadius: 14, background: `${C.pri}12`, display: "flex", alignItems: "center", justifyContent: "center", color: C.pri }}>
        <I.Settings />
      </div>
      <div style={{ fontSize: 17, fontWeight: 800, color: C.text }}>Booking-form intake isn't connected yet</div>
      <div style={{ fontSize: 13, color: C.textMut, maxWidth: 460 }}>
        {canStart
          ? "Connect your website's booking/availability form for this location and submissions will start flowing in automatically. The guided setup takes about a minute — no developer needed."
          : "This location isn't connected to its booking form yet. Ask a location admin to run the one-time Ignite setup."}
      </div>
      {canStart && (
        <Btn onClick={onStart} icon={<I.Sparkle />}>Set up Ignite</Btn>
      )}
    </div>
  );
}
