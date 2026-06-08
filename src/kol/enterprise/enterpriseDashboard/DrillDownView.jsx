import React from "react";
import { C } from "../../../shared/theme";
import { Card } from "../../../shared/ui";
import { LOC_COLORS } from "./entConfig";
import { fmt$k } from "./entFormat";
import { TrendBadge } from "./TrendBadge";

/* ═══════════════════════════════════════════════════════════════════════════
   Drill-Down View (displayed in Modal)
   ═══════════════════════════════════════════════════════════════════════════ */
export function DrillDownView({ location: loc, allLocations }) {
  const idx = allLocations.findIndex(l => l.id === loc.id);
  const color = LOC_COLORS[idx % LOC_COLORS.length];
  const allAvg = {
    occupancyRate: allLocations.reduce((s, l) => s + l.occupancyRate, 0) / allLocations.length,
    revenueTotal: allLocations.reduce((s, l) => s + l.revenueTotal, 0) / allLocations.length,
    conversionRate: allLocations.reduce((s, l) => s + l.conversionRate, 0) / allLocations.length,
    opsCompletion: Math.round(allLocations.reduce((s, l) => s + l.opsCompletion, 0) / allLocations.length),
    churnRate: allLocations.reduce((s, l) => s + l.churnRate, 0) / allLocations.length,
  };

  const compareVal = (val, avg, suffix = "", higherIsBetter = true) => {
    const diff = val - avg;
    const isBetter = higherIsBetter ? diff > 0 : diff < 0;
    return (
      <span style={{ fontSize: 11, fontWeight: 600, color: isBetter ? C.suc : C.dan }}>
        {diff > 0 ? "+" : ""}{diff.toFixed(1)}{suffix} vs avg
      </span>
    );
  };

  return (
    <div style={{ padding: "0 4px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <div style={{ width: 42, height: 42, borderRadius: "50%", background: `${color}15`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 18, fontWeight: 700, color }}>📍</span>
        </div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>{loc.name}</div>
          <div style={{ fontSize: 12, color: C.textSec }}>{loc.region} · {loc.staffCount} staff · {loc.totalRooms} rooms</div>
        </div>
      </div>

      {/* KPI Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
        <DrillKPI label="Revenue" value={`$${fmt$k(loc.revenueTotal)}`} color={color} compare={compareVal(loc.revenueTotal, allAvg.revenueTotal, "", true)} />
        <DrillKPI label="Occupancy" value={`${loc.occupancyRate.toFixed(1)}%`} color={loc.occupancyRate >= 80 ? C.suc : C.acc} compare={compareVal(loc.occupancyRate, allAvg.occupancyRate, "%", true)} />
        <DrillKPI label="Conversion Rate" value={`${loc.conversionRate.toFixed(1)}%`} color={loc.conversionRate >= 40 ? C.suc : C.acc} compare={compareVal(loc.conversionRate, allAvg.conversionRate, "%", true)} />
        <DrillKPI label="Ops Completion" value={`${loc.opsCompletion}%`} color={loc.opsCompletion >= 90 ? C.suc : C.warn} compare={compareVal(loc.opsCompletion, allAvg.opsCompletion, "%", true)} />
      </div>

      {/* Detailed metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Left — Revenue breakdown */}
        <Card style={{ padding: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 12 }}>Revenue Breakdown</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <DrillRow label="Boarding Revenue" value={`$${fmt$k(loc.boardingRevenue)}`} />
            <DrillRow label="Daycare Revenue" value={`$${fmt$k(loc.daycareRevenue)}`} />
            <DrillRow label="Avg Transaction" value={`$${loc.avgTransaction}`} />
            <DrillRow label="RevPAR" value={`$${loc.revPAR.toFixed(2)}`} />
            <DrillRow label="Avg LTV" value={`$${loc.avgLTV.toLocaleString()}`} />
            <DrillRow label="Revenue Trend" value={<TrendBadge value={loc.revenueTrend} />} />
          </div>
        </Card>

        {/* Right — Operational stats */}
        <Card style={{ padding: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 12 }}>Operations & Funnel</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <DrillRow label="Dogs In House" value={loc.totalDogs} />
            <DrillRow label="Boarding / Daycare" value={`${loc.boardingDogs} / ${loc.daycareDogs}`} />
            <DrillRow label="Total Bookings" value={loc.bookings} />
            <DrillRow label="New Leads" value={loc.newLeads} />
            <DrillRow label="Contacted" value={loc.contacted} />
            <DrillRow label="New Customers" value={loc.newCustomers} />
            <DrillRow label="Churn Rate" value={<span style={{ color: loc.churnRate > 6 ? C.dan : C.suc, fontWeight: 600 }}>{loc.churnRate.toFixed(1)}%</span>} compare={compareVal(loc.churnRate, allAvg.churnRate, "%", false)} />
          </div>
        </Card>
      </div>
    </div>
  );
}

export function DrillKPI({ label, value, color, compare }) {
  return (
    <div style={{ padding: "16px", borderRadius: 12, background: `${color}08`, border: `1.5px solid ${color}20`, textAlign: "center" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color, marginBottom: 4 }}>{value}</div>
      {compare}
    </div>
  );
}

export function DrillRow({ label, value, compare }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${C.borderLight}` }}>
      <span style={{ fontSize: 12, color: C.textSec }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{value}</span>
        {compare}
      </div>
    </div>
  );
}
