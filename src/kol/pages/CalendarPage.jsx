// CalendarPage — SCAFFOLD STUB created by F2 (nav/route scaffolding).
//
// Owned by C1 · Aggregated Calendar (Linear K9-16). Replace the contents of this
// file with the real page: a shared AggregatedCalendar (agenda / week / month)
// backed by a get_calendar_events RPC, with per-source pill filters (labor start
// dates, 30/60/90 reviews, training due, marketing events + follow-ups,
// enrichment, inventory daily-due). The "calendar" route, its "Calendar Access"
// permission, and the Home launcher card are already wired in KolApp.jsx.
import React from "react";
import { C } from "../../shared/theme";
import { I } from "../../shared/icons";

export default function CalendarPage() {
  const Icon = I.Calendar;
  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "8px 0" }}>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: "-0.01em" }}>
        Calendar
      </h1>
      <p style={{ marginTop: 6, marginBottom: 28, fontSize: 14, color: C.textMut }}>
        One aggregated schedule across labor, reviews, training, marketing, enrichment, and inventory.
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
        <div style={{ fontSize: 17, fontWeight: 800, color: C.text }}>Calendar is coming soon</div>
        <div style={{ fontSize: 13, color: C.textMut, maxWidth: 440 }}>
          This space is reserved while the aggregated calendar view is built.
        </div>
      </div>
    </div>
  );
}
