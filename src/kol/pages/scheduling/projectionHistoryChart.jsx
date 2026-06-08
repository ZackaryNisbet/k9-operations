import React, { useState } from "react";
import { C } from "../../../shared/theme";
import { formatDemandMatrixValue as formatMatrixValue } from "../schedulingDemandMatrixModel";

export function ProjectionHistoryChart({ points }) {
  const [hoverIndex, setHoverIndex] = useState(null);
  const width = 640;
  const height = 220;
  const pad = { left: 44, right: 20, top: 22, bottom: 42 };
  const values = points.flatMap((point) => [point.projected, point.booked, point.actual, point.demand]).filter((value) => Number.isFinite(value));
  const maxValue = Math.max(10, ...values) + 4;
  const minLead = Math.min(...points.map((point) => point.leadDays), 0);
  const maxLead = Math.max(...points.map((point) => point.leadDays), 1);
  const xFor = (leadDays) => {
    if (maxLead === minLead) return width / 2;
    return pad.left + ((maxLead - leadDays) / (maxLead - minLead)) * (width - pad.left - pad.right);
  };
  const yFor = (value) => pad.top + (1 - (Number(value || 0) / maxValue)) * (height - pad.top - pad.bottom);
  const pathFor = (key) => points
    .filter((point) => Number.isFinite(point[key]))
    .map((point, index) => `${index === 0 ? "M" : "L"} ${xFor(point.leadDays).toFixed(1)} ${yFor(point[key]).toFixed(1)}`)
    .join(" ");
  const hoverPoint = hoverIndex === null ? null : points[hoverIndex];

  return (
    <div style={{ position: "relative" }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Projection history by days out"
        style={{ width: "100%", height: 240, display: "block" }}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const svgX = ((event.clientX - rect.left) / rect.width) * width;
          const nearest = points.reduce((best, point, index) => {
            const distance = Math.abs(xFor(point.leadDays) - svgX);
            return distance < best.distance ? { index, distance } : best;
          }, { index: 0, distance: Infinity });
          setHoverIndex(nearest.index);
        }}
        onMouseLeave={() => setHoverIndex(null)}
      >
        <line x1={pad.left} y1={height - pad.bottom} x2={width - pad.right} y2={height - pad.bottom} stroke={C.border} />
        <line x1={pad.left} y1={pad.top} x2={pad.left} y2={height - pad.bottom} stroke={C.border} />
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const value = maxValue * ratio;
          const y = yFor(value);
          return (
            <g key={ratio}>
              <line x1={pad.left} y1={y} x2={width - pad.right} y2={y} stroke={C.borderLight} strokeDasharray="4 4" />
              <text x={pad.left - 8} y={y + 4} textAnchor="end" fontSize="10" fill={C.textMut}>{Math.round(value)}</text>
            </g>
          );
        })}
        <text x={pad.left} y={height - 13} fontSize="10" fill={C.textMut}>{maxLead} days out</text>
        <text x={width - pad.right} y={height - 13} textAnchor="end" fontSize="10" fill={C.textMut}>{minLead} days out</text>
        <text x={width / 2} y={height - 13} textAnchor="middle" fontSize="10" fill={C.textMut}>As-of snapshots move left to right toward actual day</text>
        {pathFor("demand") && <path d={pathFor("demand")} fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="6 4" opacity="0.7" />}
        {pathFor("booked") && <path d={pathFor("booked")} fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="5 5" />}
        {pathFor("projected") && <path d={pathFor("projected")} fill="none" stroke={C.pri} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
        {pathFor("actual") && <path d={pathFor("actual")} fill="none" stroke={C.suc} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
        {points.map((point, index) => (
          <g key={`${point.asOfDate}-${point.leadDays}`}>
            {Number.isFinite(point.demand) && point.demand !== point.projected && <circle cx={xFor(point.leadDays)} cy={yFor(point.demand)} r="3" fill="#7C3AED" opacity="0.75" />}
            {Number.isFinite(point.booked) && <circle cx={xFor(point.leadDays)} cy={yFor(point.booked)} r="3" fill="#94A3B8" />}
            <circle cx={xFor(point.leadDays)} cy={yFor(point.projected)} r={point.capacityConstrained ? 5 : 4} fill={C.pri} stroke={point.capacityConstrained ? C.dan : C.pri} strokeWidth={point.capacityConstrained ? 2 : 0} />
            {Number.isFinite(point.actual) && <circle cx={xFor(point.leadDays)} cy={yFor(point.actual)} r="4" fill={C.suc} />}
            {hoverIndex === index && (
              <g>
                <line x1={xFor(point.leadDays)} y1={pad.top} x2={xFor(point.leadDays)} y2={height - pad.bottom} stroke={C.text} strokeWidth="1" strokeDasharray="3 3" opacity="0.35" />
                <circle cx={xFor(point.leadDays)} cy={yFor(point.projected)} r="7" fill="none" stroke={C.pri} strokeWidth="2" />
              </g>
            )}
          </g>
        ))}
      </svg>
      {hoverPoint && (
        <div style={{ position: "absolute", top: 8, right: 8, minWidth: 190, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: "0 10px 24px rgba(15, 23, 42, 0.12)", padding: "8px 10px", fontSize: 11, color: C.text, pointerEvents: "none" }}>
          <div style={{ fontWeight: 800, marginBottom: 4 }}>As of {hoverPoint.asOfDate || "—"} · {hoverPoint.leadDays} days out</div>
          <div style={{ color: C.textMut }}>Booked/current: <span style={{ color: C.text, fontWeight: 800 }}>{formatMatrixValue(hoverPoint.booked)}</span></div>
          <div style={{ color: C.textMut }}>Achievable projected: <span style={{ color: C.pri, fontWeight: 800 }}>{formatMatrixValue(hoverPoint.projected)}</span></div>
          {Number.isFinite(hoverPoint.demand) && hoverPoint.demand !== hoverPoint.projected && (
            <div style={{ color: C.textMut }}>Unconstrained demand: <span style={{ color: "#7C3AED", fontWeight: 800 }}>{formatMatrixValue(hoverPoint.demand)}</span></div>
          )}
          {Number.isFinite(hoverPoint.actual) && (
            <div style={{ color: C.textMut }}>Actual: <span style={{ color: C.suc, fontWeight: 800 }}>{formatMatrixValue(hoverPoint.actual)}</span>{Number.isFinite(hoverPoint.delta) ? ` (${hoverPoint.delta > 0 ? "+" : ""}${formatMatrixValue(hoverPoint.delta)} vs projected)` : ""}</div>
          )}
          {hoverPoint.capacityConstrained && <div style={{ color: C.dan, fontWeight: 800, marginTop: 4 }}>Capacity-constrained view</div>}
        </div>
      )}
    </div>
  );
}
