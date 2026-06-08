import React from "react";
import { C } from "../../../shared/theme";
import { AnimatedNumber } from "./AnimatedNumber";
import { TrendBadge } from "./TrendBadge";

/* ═══════════════════════════════════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════════════════════════════════ */

export function HeroCard({ delay, label, value, prefix = "", suffix = "", decimals = 0, trend, sub, icon, color }) {
  return (
    <div
      className="ent-card"
      style={{ gridColumn: "span 3", animationDelay: `${delay * 0.08 + 0.04}s`, position: "relative", overflow: "hidden" }}
    >
      <div style={{ position: "absolute", top: 10, right: 14, opacity: 0.08, fontSize: 36, color }}>{icon}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>{label}</div>
      <div className="ent-hero-num" style={{ fontSize: 26, fontWeight: 700, color: C.text, lineHeight: 1.1, marginBottom: 6 }}>
        <AnimatedNumber value={value} prefix={prefix} suffix={suffix} decimals={decimals} />
      </div>
      {trend != null && <TrendBadge value={trend} />}
      {sub && <div style={{ fontSize: 10, color: C.textMut, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export function MetricTile({ label, value, color, icon }) {
  return (
    <div style={{
      padding: "14px", borderRadius: 12, border: `1.5px solid ${color}20`,
      background: `${color}08`, textAlign: "center",
    }}>
      <div style={{ fontSize: 18, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color, marginBottom: 2 }}>{value}</div>
      <div style={{ fontSize: 10, fontWeight: 600, color: C.textMut }}>{label}</div>
    </div>
  );
}

export function SnapshotStat({ label, value, sub, color, delay }) {
  return (
    <div className="ent-snapshot-stat" style={{ animation: `entScaleIn 0.4s ${delay * 0.06 + 0.05}s cubic-bezier(0.22,1,0.36,1) both` }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1, marginBottom: 4 }}>{value}</div>
      <div style={{ fontSize: 10, color: C.textMut, fontWeight: 500 }}>{sub}</div>
    </div>
  );
}

export function Th({ children, align = "center" }) {
  return (
    <th style={{ padding: "10px 12px", textAlign: align, fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
      {children}
    </th>
  );
}

export function Td({ children, bold, color }) {
  return (
    <td style={{ padding: "12px 12px", textAlign: "center", fontWeight: bold ? 700 : 400, color: color || C.text, fontSize: 13 }}>
      {children}
    </td>
  );
}

export function OccupancyPill({ value }) {
  const color = value >= 80 ? C.suc : value >= 65 ? C.acc : C.dan;
  const bg = value >= 80 ? C.sucLt : value >= 65 ? C.accLt : C.danLt;
  return (
    <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 20, background: bg, color, fontWeight: 700, fontSize: 12 }}>
      {value.toFixed(1)}%
    </span>
  );
}

export function OpsCompletionPill({ value }) {
  const color = value >= 90 ? C.suc : value >= 75 ? C.warn : C.dan;
  const bg = value >= 90 ? C.sucLt : value >= 75 ? C.warnLt : C.danLt;
  return (
    <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 20, background: bg, color, fontWeight: 700, fontSize: 12 }}>
      {value}%
    </span>
  );
}
