// IgnitePipelineDiagram — the booking-form → CRM flow for the onboarding wizard.
//
// Simple 3-step row for the end user (real service marks, not generic glyphs),
// with a subtle "How it actually works" toggle that expands the true ~8-step
// architecture: zone-shaded by ownership/scope, with the reliability risk
// (Resend) called out and linked. Future-proof vector art — no screenshots.
import React, { useState } from "react";
import { C } from "../../shared/theme";

// ── Real-ish service marks (clean vector, theme-aware) ──────────────────────

// K9 Resorts booking form: themed browser-with-form (swap for the resort logo
// by dropping /k9-resorts-logo.svg in public and pointing the <img> at it).
function BookingMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
      <rect x="3.5" y="5" width="25" height="22" rx="3.5" fill="#fff" stroke={C.pri} strokeWidth="2" />
      <path d="M3.5 10.5h25" stroke={C.pri} strokeWidth="2" />
      <circle cx="7" cy="7.7" r="0.9" fill={C.pri} />
      <circle cx="9.8" cy="7.7" r="0.9" fill={C.pri} />
      <path d="M8 15h12M8 19h12M8 23h7" stroke={C.acc} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// Microsoft Outlook mark (kept in Outlook blue so it's instantly recognizable
// as the real service — used nominatively to identify the integration).
function OutlookMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
      <rect x="13" y="9.5" width="15" height="13" rx="1.6" fill="#fff" stroke="#0F6CBD" strokeWidth="1.3" />
      <path d="M13.6 11.2 20.5 16l6.9-4.8" fill="none" stroke="#0F6CBD" strokeWidth="1.5" strokeLinejoin="round" />
      <rect x="3" y="6.5" width="15.5" height="19" rx="3.2" fill="#0F6CBD" />
      <ellipse cx="10.75" cy="16" rx="4.6" ry="5.3" fill="none" stroke="#fff" strokeWidth="2.3" />
    </svg>
  );
}

function ServiceTile({ children, bg = "#fff", ring = C.border }) {
  return (
    <div style={{ width: 40, height: 40, borderRadius: 10, background: bg, border: `1px solid ${ring}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      {children}
    </div>
  );
}

function SimpleNode({ tile, label, sub }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
      {tile}
      <div style={{ textAlign: "center", minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{label}</div>
        {sub ? <div style={{ fontSize: 9.5, fontWeight: 600, color: C.textMut, whiteSpace: "nowrap" }}>{sub}</div> : null}
      </div>
    </div>
  );
}

function Arrow() {
  return (
    <svg width="20" height="12" viewBox="0 0 20 12" fill="none" style={{ flexShrink: 0, marginBottom: 18 }}>
      <path d="M1 6h16m0 0-4-4m4 4-4 4" stroke={C.textMut} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Architecture (expanded) zones ───────────────────────────────────────────

const ZONE_TONES = {
  neutral: { bg: "#F8FAFC", border: "#E2E8F0", tag: "#64748B" },
  config: { bg: `${C.pri}08`, border: `${C.pri}30`, tag: C.pri },
  risk: { bg: `${C.warn}0F`, border: `${C.warn}45`, tag: C.warn },
  brand: { bg: `${C.pri}0C`, border: `${C.pri}40`, tag: C.pri },
};

function Step({ n, children }) {
  return (
    <div style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
      <span style={{ flexShrink: 0, width: 18, height: 18, borderRadius: 99, background: "#fff", border: `1px solid ${C.border}`, fontSize: 10, fontWeight: 800, color: C.textMut, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 1 }}>{n}</span>
      <span style={{ fontSize: 12, color: C.textSec, lineHeight: 1.5 }}>{children}</span>
    </div>
  );
}

function Zone({ tone, tag, children }) {
  const t = ZONE_TONES[tone] || ZONE_TONES.neutral;
  return (
    <div style={{ border: `1.5px solid ${t.border}`, background: t.bg, borderRadius: 10, padding: "10px 12px" }}>
      <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", color: t.tag, marginBottom: 8 }}>{tag}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>{children}</div>
    </div>
  );
}

export default function IgnitePipelineDiagram({ locLabel = "this location" }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, background: C.surfaceHover, overflow: "hidden" }}>
      {/* Simple, end-user flow */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "14px 16px 12px" }}>
        <SimpleNode tile={<ServiceTile bg="#FCFBF8" ring={`${C.accDk}55`}><img src="/k9-logo.png" alt="K9 Resorts" width="28" height="28" style={{ objectFit: "contain" }} /></ServiceTile>} label="K9 Resorts" sub="booking form" />
        <Arrow />
        <SimpleNode tile={<ServiceTile ring="#0F6CBD40"><OutlookMark /></ServiceTile>} label={`${locLabel} inbox`} sub="Outlook" />
        <Arrow />
        <SimpleNode tile={<ServiceTile bg={C.pri} ring={C.pri}><img src="/favicon.svg" alt="K9 Ops" width="26" height="26" style={{ borderRadius: 6 }} /></ServiceTile>} label="K9 Ops CRM" />
      </div>

      {/* Subtle architecture toggle */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{ width: "100%", border: "none", borderTop: `1px solid ${C.border}`, background: "transparent", padding: "8px 16px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 600, color: C.textMut }}
      >
        How it actually works
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div style={{ padding: "4px 14px 14px", display: "flex", flexDirection: "column", gap: 8, background: C.surface, borderTop: `1px solid ${C.border}` }}>
          <Zone tone="neutral" tag="Before us · out of scope">
            <Step n={1}>A customer submits the booking form on k9resorts.com.</Step>
            <Step n={2}>The K9 Resorts site emails it to {locLabel}'s inbox (Outlook / Microsoft 365).</Step>
          </Zone>
          <Zone tone="config" tag="One-time setup · set & forget">
            <Step n={3}>Your Outlook rule forwards it to the K9 Ops inbound address.</Step>
          </Zone>
          <Zone tone="risk" tag="Reliability risk · Resend">
            <Step n={4}>Resend receives the email — and stores a copy even if the next step is down.</Step>
            <Step n={5}>Resend fires a webhook to our server (email.received).</Step>
            <div style={{ fontSize: 11, color: C.textSec, lineHeight: 1.6, marginTop: 2, paddingLeft: 27 }}>
              This is the only third party in the path. No public uptime SLA, so we verify it directly: we poll Resend's received-emails API to
              confirm mail is flowing (catches billing / quota / outage — not just "is the URL up").
              <div style={{ marginTop: 5, display: "flex", gap: 14, flexWrap: "wrap" }}>
                <a href="https://resend-status.com/" target="_blank" rel="noreferrer" style={{ color: C.warn, fontWeight: 700, textDecoration: "none" }}>Live status ↗</a>
                <a href="https://resend.com/emails" target="_blank" rel="noreferrer" style={{ color: C.warn, fontWeight: 700, textDecoration: "none" }}>Open Resend ↗</a>
              </div>
            </div>
          </Zone>
          <Zone tone="brand" tag="K9 Ops · we own & monitor this">
            <Step n={6}>Our edge function parses the form and routes it by website slug.</Step>
            <Step n={7}>It's saved to the CRM database.</Step>
            <Step n={8}>The CRM updates live — no refresh.</Step>
          </Zone>
        </div>
      )}
    </div>
  );
}
