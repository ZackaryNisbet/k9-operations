// IgnitePipelineDiagram — Booking Form → CRM pipeline.
//
// Two tabs:
//   • Architecture — one box per PLATFORM (K9 Resorts site → Microsoft 365 →
//     Resend → Supabase), connected by arrows that name the action + mechanism.
//     Components/tables live as sub-boxes inside their platform. The user's own
//     action (the Outlook forward rule) is the one coloured edge.
//   • Health check — the synthetic round-trip as a UML sequence with timings +
//     a runs log.
// Plain and clean — no trust-boundary colour-coding, no gradients/animation.
import React, { useState } from "react";
import { C } from "../../shared/theme";

const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const USER_ACTION = "#0F6CBD"; // Outlook blue — the one coloured (user-configured) edge

// ── Platform marks ──────────────────────────────────────────────────────────
function OutlookMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 32 32" fill="none">
      <rect x="13" y="9.5" width="15" height="13" rx="1.6" fill="#fff" stroke="#0F6CBD" strokeWidth="1.3" />
      <path d="M13.6 11.2 20.5 16l6.9-4.8" fill="none" stroke="#0F6CBD" strokeWidth="1.5" strokeLinejoin="round" />
      <rect x="3" y="6.5" width="15.5" height="19" rx="3.2" fill="#0F6CBD" />
      <ellipse cx="10.75" cy="16" rx="4.6" ry="5.3" fill="none" stroke="#fff" strokeWidth="2.3" />
    </svg>
  );
}
function ResendMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 32 32" fill="none">
      <rect x="3" y="3" width="26" height="26" rx="6" fill="#0A0A0A" />
      <path d="M11 23V9h6.4a4.3 4.3 0 0 1 .5 8.57L22 23h-3.4l-3.3-5.1H14V23h-3Zm3-7.8h3.1a1.9 1.9 0 0 0 0-3.8H14v3.8Z" fill="#fff" />
    </svg>
  );
}
function SupabaseMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M12.5 2.3 4.6 12.4c-.5.6 0 1.5.8 1.5H11v7.6c0 .9 1.2 1.3 1.7.5l7.7-10.1c.5-.6 0-1.5-.8-1.5H13.5V2.8c0-.9-1.1-1.2-1.6-.5Z" fill="#3ECF8E" />
    </svg>
  );
}
const K9Img = <img src="/k9-logo.png" alt="" width="18" height="18" style={{ objectFit: "contain" }} />;

// ── Architecture building blocks ────────────────────────────────────────────
function Platform({ mark, name, children }) {
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 9, background: C.surface, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 11px", background: C.surfaceHover, borderBottom: `1px solid ${C.border}` }}>
        {mark}
        <span style={{ fontSize: 12.5, fontWeight: 800, color: C.text }}>{name}</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "stretch", gap: 7, padding: "10px 11px" }}>{children}</div>
    </div>
  );
}
function SubBox({ title, children, full }) {
  return (
    <div style={{ flex: full ? "1 1 100%" : "1 1 auto", minWidth: 0, border: `1px solid ${C.border}`, borderRadius: 6, background: "#fff", padding: "6px 9px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.text, fontFamily: MONO }}>{title}</div>
      {children ? <div style={{ fontSize: 9.5, color: C.textMut, marginTop: 2, fontFamily: MONO, lineHeight: 1.4 }}>{children}</div> : null}
    </div>
  );
}
function SubArrow() {
  return <div style={{ alignSelf: "center", color: C.textMut, fontSize: 14, fontWeight: 700 }}>→</div>;
}
// One arrow "cut in half" by the action label: a plain line drops from the
// platform INTO the label, then an arrow leaves the label INTO the next platform.
function Hop({ action, note, accent }) {
  const col = accent ? USER_ACTION : C.textMut;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "1px 0" }}>
      <span style={{ width: 1.5, height: 12, background: C.border }} />
      <span style={{ fontSize: 10, fontWeight: 700, color: accent ? col : C.textSec, fontFamily: MONO, background: accent ? `${USER_ACTION}10` : C.surfaceHover, border: `1px solid ${accent ? `${USER_ACTION}55` : C.border}`, borderRadius: 20, padding: "2px 11px" }}>{action}</span>
      {note ? <span style={{ fontSize: 9.5, color: C.textMut, textAlign: "center" }}>{note}</span> : null}
      <svg width="13" height="15" viewBox="0 0 14 16" fill="none" style={{ marginTop: 1 }}><path d="M7 0v11m0 0-4-4m4 4 4-4" stroke={col} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </div>
  );
}

function ArchitectureView({ email }) {
  const e = email || "your booking inbox";
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <Platform mark={K9Img} name="K9 Resorts Website">
        <SubBox title="Booking Form">k9resorts.com/cherry-hill</SubBox>
      </Platform>
      <Hop action="emails submission · SMTP" note="sent by no-reply@cloudbackend.net (Mailgun)" />

      <Platform mark={<OutlookMark />} name="Microsoft 365">
        <SubBox title="Mailbox">{e}</SubBox>
      </Platform>
      <Hop accent action="Outlook rule: forward + archive · SMTP" note="your one-time setup — forwards out, hides from inbox" />

      <Platform mark={<ResendMark />} name="Resend">
        <SubBox title="Inbound (MX)">receives the forwarded email</SubBox>
        <SubArrow />
        <SubBox title="Parse → JSON">email as structured payload</SubBox>
      </Platform>
      <Hop action="POST email.received · HTTPS · JSON" note="webhook to our Edge Function" />

      <Platform mark={<SupabaseMark />} name="Supabase">
        <SubBox title="ignite-webhook">Edge Function · parses fields, routes by slug</SubBox>
        <SubArrow />
        <SubBox title="ignite_leads">INSERT · table (web_form lead)</SubBox>
        <SubBox full title="ignite-health-check">synthetic monitor · pg_cron every 15 min — see the Health check tab</SubBox>
      </Platform>
    </div>
  );
}

// ── Health check — UML sequence diagram (SVG) ───────────────────────────────
const PARTS = [
  { name: "Monitor", risk: false },
  { name: "Resend", risk: true },
  { name: "ignite-webhook", risk: false },
  { name: "Postgres", risk: false },
];
const PX = [60, 188, 330, 452];
const MSGS = [
  { f: 0, t: 1, n: "1", l: "send probe", s: "POST api.resend.com/emails", tm: "t0 · sent_at" },
  { f: 1, t: 2, n: "2", l: "email.received", s: "POST · HTTPS · JSON", tm: "t1 · received_at" },
  { f: 2, t: 3, n: "3", l: "INSERT ignite_leads", s: "is_synthetic = true", tm: "t2 · inserted_at" },
  { f: 3, t: 0, n: "4", l: "detect (SELECT by token)", s: "matched by token", tm: "latency = t2 − t0", dashed: true },
];
function SequenceDiagram() {
  const TOP = 16, LLT = 46, BOT = 246, TX = 604;
  const MY = [86, 132, 178, 224];
  return (
    <svg viewBox="0 0 616 260" width="100%" style={{ display: "block" }}>
      <defs>
        <marker id="ah" markerWidth="10" markerHeight="10" refX="7.5" refY="4" orient="auto">
          <path d="M0 0L8 4L0 8z" fill={C.textSec} />
        </marker>
      </defs>
      {PARTS.map((p, i) => {
        const w = Math.max(56, p.name.length * 7 + 16), x = PX[i];
        return (
          <g key={p.name}>
            <line x1={x} y1={LLT} x2={x} y2={BOT} stroke={C.border} strokeWidth="1.1" strokeDasharray="4 4" />
            <rect x={x - w / 2} y={TOP} width={w} height={24} rx="5" fill={C.surface} stroke={p.risk ? C.warn : C.border} strokeWidth="1.4" />
            <text x={x} y={TOP + 16} textAnchor="middle" fontFamily={MONO} fontSize="11" fontWeight="700" fill={C.text}>{p.name}</text>
          </g>
        );
      })}
      {MSGS.map((m, i) => {
        const x1 = PX[m.f], x2 = PX[m.t], y = MY[i], mid = (x1 + x2) / 2;
        return (
          <g key={i}>
            <text x={mid} y={y - 8} textAnchor="middle" fontFamily={MONO} fontSize="10.5" fontWeight="700" fill={C.text}>{m.n} · {m.l}</text>
            <line x1={x1} y1={y} x2={x2} y2={y} stroke={C.textSec} strokeWidth="1.4" markerEnd="url(#ah)" strokeDasharray={m.dashed ? "5 4" : "0"} />
            <text x={mid} y={y + 12} textAnchor="middle" fontFamily={MONO} fontSize="9" fill={C.textMut}>{m.s}</text>
            <text x={TX} y={y + 3} textAnchor="end" fontFamily={MONO} fontSize="9.5" fontWeight="700" fill={C.pri}>{m.tm}</text>
          </g>
        );
      })}
    </svg>
  );
}
function HealthCheckView() {
  const checks = [
    ["Resend reachable", "GET api.resend.com/domains → 200"],
    ["Database write", "INSERT ok + SELECT latency"],
    ["Real-lead freshness", "newest non-synthetic web_form age"],
  ];
  const cols = ["run", "sent_at", "received_at", "inserted_at", "latency", "ok"];
  return (
    <div>
      <div style={{ fontSize: 11, color: C.textSec, fontFamily: MONO, marginBottom: 6 }}>
        Proves the real pipeline by sending a tagged email through it every 15 min:
      </div>
      <SequenceDiagram />
      <div style={{ fontSize: 10.5, color: C.textMut, fontFamily: MONO, textAlign: "center", margin: "2px 0 14px" }}>
        t2 − t1 (parse + insert) is sub-second → inserted_at ≈ post time — measured, not assumed.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 14 }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: C.textMut, fontFamily: MONO }}>Validated each run</div>
        {checks.map(([k, v]) => (
          <div key={k} style={{ fontSize: 11.5, color: C.textSec, display: "flex", gap: 8, fontFamily: MONO }}>
            <span style={{ color: C.suc, fontWeight: 800 }}>✓</span>
            <span><span style={{ color: C.text, fontWeight: 700 }}>{k}</span> — {v}</span>
          </div>
        ))}
      </div>
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 7, overflow: "hidden", fontFamily: MONO }}>
        <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 11px", borderBottom: `1px solid ${C.border}` }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: C.text }}>HEALTH RUNS</span>
          <span style={{ fontSize: 10, color: C.textMut }}>newest first</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr 1fr 1fr 0.8fr 0.5fr", fontSize: 9.5, fontWeight: 700, color: C.textMut, padding: "6px 11px", borderBottom: `1px solid ${C.border}` }}>
          {cols.map((c) => <span key={c}>{c}</span>)}
        </div>
        <div style={{ padding: "14px 11px", fontSize: 11, color: C.textMut, textAlign: "center", lineHeight: 1.5 }}>
          awaiting first run — activates once IGNITE_INBOUND_ADDRESS + RESEND_API_KEY are set
        </div>
      </div>
    </div>
  );
}

export default function IgnitePipelineDiagram({ locLabel = "this location", inboundEmail = "" }) {
  const [tab, setTab] = useState("arch");
  const email = (inboundEmail || "").trim();
  const TabBtn = ({ id, children }) => {
    const active = tab === id;
    return (
      <button type="button" onClick={() => setTab(id)}
        style={{ border: "none", background: "transparent", padding: "0 0 7px", cursor: "pointer", fontFamily: MONO, fontSize: 12, fontWeight: active ? 800 : 600, color: active ? C.text : C.textMut, borderBottom: active ? `2px solid ${C.text}` : "2px solid transparent" }}>
        {children}
      </button>
    );
  };
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: C.surface, overflow: "hidden" }}>
      <div style={{ display: "flex", gap: 18, padding: "10px 14px 0", borderBottom: `1px solid ${C.border}`, marginBottom: 14 }}>
        <TabBtn id="arch">Architecture</TabBtn>
        <TabBtn id="health">Health check</TabBtn>
      </div>
      <div style={{ padding: "0 14px 16px" }}>
        {tab === "arch" ? <ArchitectureView email={email} /> : <HealthCheckView />}
      </div>
    </div>
  );
}
