import { C } from "../constants/colors";
import { Card } from "./ui";
import React, { useState } from "react";
import { fmtDate, todayStr } from "../lib/format";

function PackageReportsTab({ data }) {
  const sales = data.packageSales || [];
  const pkgs = data.packages || [];
  const clients = data.clients || [];
  const [viewMode, setViewMode] = useState("by-client");

  // Calculate outstanding for each sale
  const outstanding = sales.map(sale => {
    const pkg = pkgs.find(p => p.id === sale.packageId);
    const remaining = (sale.quantity || 0) - (sale.used || 0);
    if (remaining <= 0) return null;
    const retailUnitRate = ((sale.retailValue || pkg?.retailValue || 0) / (pkg?.quantity || 1));
    const value = remaining * retailUnitRate;
    // Calculate expiration
    let expiresAt = null;
    if (pkg?.expirationType === "relative" && sale.purchaseDate) {
      const d = new Date(sale.purchaseDate + "T00:00:00");
      d.setDate(d.getDate() + (pkg.expirationDays || 90));
      expiresAt = d.toISOString().slice(0, 10);
    }
    const client = clients.find(c => c.id === sale.clientId);
    return { saleId: sale.id, clientId: sale.clientId, clientName: client ? `${client.fields.first_name || ""} ${client.fields.last_name || ""}`.trim() : "Unknown", pkgName: pkg?.name || sale.packageName || "Package", remaining, total: sale.quantity, value, expiresAt, purchaseDate: sale.purchaseDate };
  }).filter(Boolean);

  const totalOutstandingValue = outstanding.reduce((s, o) => s + o.value, 0);
  const totalRemaining = outstanding.reduce((s, o) => s + o.remaining, 0);

  // Build value decay curve
  const buildDecayCurve = () => {
    const points = [];
    const today = new Date();
    let runningValue = totalOutstandingValue;
    points.push({ date: todayStr(), value: runningValue });
    const expirations = outstanding.filter(o => o.expiresAt).sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
    expirations.forEach(o => {
      points.push({ date: o.expiresAt, value: runningValue });
      runningValue -= o.value;
      points.push({ date: o.expiresAt, value: Math.max(0, runningValue) });
    });
    const lastDate = expirations.length > 0 ? expirations[expirations.length - 1].expiresAt : todayStr();
    const endDate = new Date(lastDate + "T00:00:00");
    endDate.setDate(endDate.getDate() + 30);
    if (runningValue > 0) points.push({ date: endDate.toISOString().slice(0, 10), value: runningValue });
    else points.push({ date: endDate.toISOString().slice(0, 10), value: 0 });
    return points;
  };
  const decayCurve = buildDecayCurve();

  // SVG chart
  const chartW = 600, chartH = 200, padL = 60, padR = 20, padT = 20, padB = 40;
  const innerW = chartW - padL - padR, innerH = chartH - padT - padB;
  const maxVal = Math.max(...decayCurve.map(p => p.value), 1);
  const minDate = new Date(decayCurve[0]?.date + "T00:00:00").getTime();
  const maxDate = new Date(decayCurve[decayCurve.length - 1]?.date + "T00:00:00").getTime();
  const dateRange = maxDate - minDate || 1;
  const toX = (d) => padL + ((new Date(d + "T00:00:00").getTime() - minDate) / dateRange) * innerW;
  const toY = (v) => padT + innerH - (v / maxVal) * innerH;
  const pathD = decayCurve.map((p, i) => `${i === 0 ? "M" : "L"}${toX(p.date).toFixed(1)},${toY(p.value).toFixed(1)}`).join(" ");
  const areaD = pathD + ` L${toX(decayCurve[decayCurve.length - 1].date).toFixed(1)},${(padT + innerH).toFixed(1)} L${toX(decayCurve[0].date).toFixed(1)},${(padT + innerH).toFixed(1)} Z`;

  // Group by client
  const byClient = {};
  outstanding.forEach(o => {
    if (!byClient[o.clientId]) byClient[o.clientId] = { name: o.clientName, items: [], totalValue: 0 };
    byClient[o.clientId].items.push(o);
    byClient[o.clientId].totalValue += o.value;
  });
  const clientEntries = Object.entries(byClient).sort((a, b) => b[1].totalValue - a[1].totalValue);

  return (
    <div>
      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
        <Card style={{ padding: "20px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", marginBottom: 4 }}>Outstanding Value</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: C.pri }}>${totalOutstandingValue.toFixed(2)}</div>
        </Card>
        <Card style={{ padding: "20px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", marginBottom: 4 }}>Outstanding Units</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: C.acc }}>{totalRemaining}</div>
        </Card>
        <Card style={{ padding: "20px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", marginBottom: 4 }}>Active Clients</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: C.suc }}>{clientEntries.length}</div>
        </Card>
      </div>

      {/* Decay Chart */}
      <Card style={{ padding: "20px 24px", marginBottom: 24 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 4 }}>Outstanding Package Value Over Time</div>
        <div style={{ fontSize: 12, color: C.textSec, marginBottom: 16 }}>Shows how outstanding package value decreases as packages expire</div>
        <svg width={chartW} height={chartH} style={{ width: "100%", height: "auto" }} viewBox={`0 0 ${chartW} ${chartH}`}>
          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map(pct => {
            const y = padT + innerH - pct * innerH;
            return <g key={pct}><line x1={padL} y1={y} x2={chartW - padR} y2={y} stroke={C.borderLight} strokeWidth={1} /><text x={padL - 8} y={y + 4} textAnchor="end" fontSize={10} fill={C.textMut}>${(maxVal * pct).toFixed(0)}</text></g>;
          })}
          {/* Area fill */}
          <path d={areaD} fill={C.pri + "15"} />
          {/* Line */}
          <path d={pathD} fill="none" stroke={C.pri} strokeWidth={2.5} />
          {/* Today marker */}
          <line x1={toX(todayStr())} y1={padT} x2={toX(todayStr())} y2={padT + innerH} stroke={C.acc} strokeWidth={1} strokeDasharray="4 4" />
          <text x={toX(todayStr())} y={padT + innerH + 14} textAnchor="middle" fontSize={10} fill={C.acc} fontWeight={600}>Today</text>
          {/* X-axis dates */}
          {decayCurve.filter((_, i) => i === 0 || i === decayCurve.length - 1).map((p, i) => (
            <text key={i} x={toX(p.date)} y={padT + innerH + 28} textAnchor="middle" fontSize={10} fill={C.textMut}>{fmtDate(p.date)}</text>
          ))}
        </svg>
      </Card>

      {/* View toggle */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {[["by-client", "By Client"], ["overall", "All Outstanding"]].map(([mode, label]) => (
          <button key={mode} onClick={() => setViewMode(mode)} style={{ padding: "6px 16px", borderRadius: 20, border: `1.5px solid ${viewMode === mode ? C.pri : C.border}`, background: viewMode === mode ? C.priLt : "transparent", color: viewMode === mode ? C.pri : C.text, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{label}</button>
        ))}
      </div>

      {viewMode === "by-client" ? (
        clientEntries.length === 0 ? <div style={{ textAlign: "center", padding: 40, color: C.textMut }}>No outstanding packages</div> : (
          clientEntries.map(([cid, group]) => (
            <Card key={cid} style={{ marginBottom: 12, padding: "16px 20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{group.name}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: C.pri }}>${group.totalValue.toFixed(2)}</span>
              </div>
              {group.items.map(item => (
                <div key={item.saleId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderTop: `1px solid ${C.borderLight}`, fontSize: 13 }}>
                  <div style={{ color: C.text }}>{item.pkgName} <span style={{ color: C.textMut }}>({item.remaining}/{item.total} remaining)</span></div>
                  <div style={{ display: "flex", gap: 12 }}>
                    <span style={{ color: C.text, fontWeight: 600 }}>${item.value.toFixed(2)}</span>
                    {item.expiresAt && <span style={{ color: item.expiresAt < todayStr() ? C.dan : C.textMut, fontSize: 11 }}>Exp: {fmtDate(item.expiresAt)}</span>}
                  </div>
                </div>
              ))}
            </Card>
          ))
        )
      ) : (
        <Card>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1.2fr 0.6fr 0.6fr 0.9fr 0.8fr", gap: 0 }}>
            {["Client", "Package", "Used", "Left", "Value", "Expires"].map(h => (
              <div key={h} style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", padding: "10px 12px", background: C.bg, borderBottom: `1px solid ${C.border}` }}>{h}</div>
            ))}
            {outstanding.sort((a, b) => b.value - a.value).map(o => (
              <React.Fragment key={o.saleId}>
                <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.borderLight}`, fontSize: 13, color: C.text }}>{o.clientName}</div>
                <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.borderLight}`, fontSize: 13, color: C.text }}>{o.pkgName}</div>
                <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.borderLight}`, fontSize: 13, color: C.textMut }}>{o.total - o.remaining}</div>
                <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.borderLight}`, fontSize: 13, color: C.pri, fontWeight: 600 }}>{o.remaining}</div>
                <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.borderLight}`, fontSize: 13, color: C.text, fontWeight: 600 }}>${o.value.toFixed(2)}</div>
                <div style={{ padding: "10px 12px", borderBottom: `1px solid ${C.borderLight}`, fontSize: 12, color: o.expiresAt && o.expiresAt < todayStr() ? C.dan : C.textMut }}>{o.expiresAt ? fmtDate(o.expiresAt) : "—"}</div>
              </React.Fragment>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

export { PackageReportsTab };
