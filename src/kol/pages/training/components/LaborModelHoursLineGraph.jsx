// K9 Operations — Training Module: leaf component extracted verbatim from TrainingPage.jsx (no behavior change).

import { formatHourAnalysisHours, normalizeHourAnalysisNumber } from "../helpers";
import { useState } from "react";

export function LaborModelHoursLineGraph({ days = [] }) {
  const [hoveredKey, setHoveredKey] = useState("");
  const values = days.map((day) => normalizeHourAnalysisNumber(day.totalHours, 0));
  const maxValue = Math.max(1, ...values);
  const width = 680;
  const height = 190;
  const padX = 38;
  const padY = 24;
  const points = days.map((day, index) => {
    const x = days.length <= 1 ? width / 2 : padX + ((width - padX * 2) * index) / (days.length - 1);
    const y = height - padY - ((normalizeHourAnalysisNumber(day.totalHours, 0) / maxValue) * (height - padY * 2));
    return { ...day, x, y };
  });
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const hovered = points.find((point) => point.key === hoveredKey) || points.reduce((winner, point) => (point.totalHours > (winner?.totalHours || 0) ? point : winner), points[0]);

  return (
    <div className="labor-model-graph-card">
      <div className="labor-model-graph-header">
        <div>
          <span>Weekly Shape</span>
          <strong>{hovered?.label || "Week"}: {formatHourAnalysisHours(hovered?.totalHours || 0)} hrs</strong>
        </div>
        <em>Hover a day</em>
      </div>
      <svg className="labor-model-line-graph" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Labor model hours by day">
        <defs>
          <linearGradient id="laborModelGraphFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(20,83,45,0.22)" />
            <stop offset="100%" stopColor="rgba(20,83,45,0.02)" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((ratio) => {
          const y = height - padY - ratio * (height - padY * 2);
          return <line key={ratio} x1={padX} x2={width - padX} y1={y} y2={y} className="labor-model-graph-gridline" />;
        })}
        {points.length > 0 && (
          <path
            d={`${path} L ${points[points.length - 1].x.toFixed(1)} ${height - padY} L ${points[0].x.toFixed(1)} ${height - padY} Z`}
            className="labor-model-graph-area"
          />
        )}
        <path d={path} className="labor-model-graph-line" />
	        {points.map((point) => (
	          <g key={point.key} onMouseEnter={() => setHoveredKey(point.key)} onFocus={() => setHoveredKey(point.key)} tabIndex={0}>
	            <circle cx={point.x} cy={point.y} r={hoveredKey === point.key ? 7 : 5} className="labor-model-graph-dot" />
	            <text x={point.x} y={Math.max(14, point.y - 12)} textAnchor="middle" className="labor-model-graph-value">{formatHourAnalysisHours(point.totalHours)}</text>
	            <text x={point.x} y={height - 5} textAnchor="middle" className="labor-model-graph-label">{point.shortLabel || point.label}</text>
	            <title>{point.label}: {formatHourAnalysisHours(point.totalHours)} hours</title>
	          </g>
        ))}
      </svg>
    </div>
  );
}
