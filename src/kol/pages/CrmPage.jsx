// CrmPage — SCAFFOLD STUB created by F2 (nav/route scaffolding).
//
// Owned by R1 · CRM (Ignite booking + employment) (Linear K9-15). Replace the
// contents of this file with the real CRM page: a DenseTable of submissions with
// subtabs (+ coming-soon tabs), a Submission Details expander, log-outreach with
// a MiniDatePicker, and fmtPhone formatting — fed by the revived Ignite ingestion
// pipeline. The "crm" route, its "CRM Access" permission, and the Home launcher
// card are already wired in KolApp.jsx.
import React from "react";
import { C } from "../../shared/theme";
import { I } from "../../shared/icons";

export default function CrmPage() {
  const Icon = I.MessageSquare;
  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "8px 0" }}>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: "-0.01em" }}>
        CRM
      </h1>
      <p style={{ marginTop: 6, marginBottom: 28, fontSize: 14, color: C.textMut }}>
        Booking and employment inquiries captured from Ignite, ready for outreach.
      </p>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          gap: 14,
          padding: "72px 24px",
          border: `1.5px dashed ${C.border}`,
          borderRadius: 16,
          background: C.surfaceHover,
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            background: `${C.pri}12`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {Icon ? <Icon style={{ width: 28, height: 28, color: C.pri }} /> : null}
        </div>
        <div style={{ fontSize: 17, fontWeight: 800, color: C.text }}>CRM is coming soon</div>
        <div style={{ fontSize: 13, color: C.textMut, maxWidth: 440 }}>
          This space is reserved while the Ignite-fed inquiry pipeline is built.
        </div>
      </div>
    </div>
  );
}
