import React from "react";
import { C, todayStr } from "../../../shared/theme";
import { I } from "../../../shared/icons";
import { formatMatrixDate } from "./schedulingDates";
import {
  getProjectionFormulaLine,
  getProjectionHeadline,
  getProjectionMethodologySteps,
} from "./projectionCopy";
import { getCapacityRiskLines, getProjectionHistoryPoints } from "./projectionHistory";
import { ProjectionHistoryChart } from "./projectionHistoryChart";

function ProjectionMethodologyPanel({ day }) {
  const steps = getProjectionMethodologySteps(day);
  const headline = getProjectionHeadline(day);
  const formulaLine = getProjectionFormulaLine(day);
  if (!steps.length) {
    return (
      <div style={{ fontSize: 11, color: C.textMut, borderTop: `1px solid ${C.borderLight}`, paddingTop: 12, marginTop: 14 }}>
        Selected day: <span style={{ fontWeight: 700, color: C.text }}>{day?.dayName} {formatMatrixDate(day?.date || todayStr())}</span>. Projected mode uses prior-year booking pace from Gingr created dates.
      </div>
    );
  }

  return (
    <div style={{ borderTop: `1px solid ${C.borderLight}`, paddingTop: 12, marginTop: 14 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "4px 10px", marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: C.textMut }}>
          Selected day: <span style={{ fontWeight: 800, color: C.text }}>{day?.dayName} {formatMatrixDate(day?.date || todayStr())}</span>
        </span>
        <span style={{ fontSize: 11, fontWeight: 800, color: C.text }}>Projection Method</span>
      </div>
      {headline && (
        <div style={{ fontSize: 11, color: C.text, fontWeight: 700, lineHeight: 1.45, marginBottom: 6 }}>
          {headline}
        </div>
      )}
      {formulaLine && (
        <div style={{ fontSize: 11, color: C.textMut, lineHeight: 1.5, borderLeft: `3px solid ${C.pri}`, paddingLeft: 9, marginBottom: 9 }}>
          <span style={{ fontWeight: 800, color: C.text }}>Formula: </span>
          {formulaLine}
        </div>
      )}
      <ol style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "grid", gap: 10, maxWidth: 1060 }}>
        {steps.map((step, index) => (
          <li key={step.label} style={{ display: "grid", gridTemplateColumns: "22px minmax(0, 1fr)", gap: 8, color: C.textMut, fontSize: 12, lineHeight: 1.5 }}>
            <span style={{ width: 20, height: 20, borderRadius: 999, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "#EEF4FF", color: C.pri, fontSize: 11, fontWeight: 800 }}>
              {index + 1}
            </span>
            <span>
              <span style={{ display: "block", fontWeight: 800, color: C.text, marginBottom: 1 }}>{step.label.replace(/^\d+\.\s*/, "")}</span>
              <span>{step.detail}</span>
            </span>
          </li>
        ))}
      </ol>
      <div style={{ fontSize: 11, color: C.textMut, marginTop: 9 }}>
        Weekly totals shown in the workbook are dog-days, not unique reservations.
      </div>
    </div>
  );
}

export function ForecastDetailsPanel({ day, matrixMode, expanded, onToggle }) {
  return (
    <div style={{ marginTop: 14, borderTop: `1px solid ${C.borderLight}`, paddingTop: 12 }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "10px 12px",
          borderRadius: 10,
          border: `1px solid ${C.border}`,
          background: expanded ? "#F8FAFC" : C.surface,
          color: C.text,
          cursor: "pointer",
          fontFamily: "inherit",
          textAlign: "left",
        }}
      >
        <span>
          <span style={{ display: "block", fontSize: 12, fontWeight: 900 }}>Demand Forecast Details</span>
          <span style={{ display: "block", marginTop: 2, fontSize: 11, color: C.textMut }}>
            Projection math, historical accuracy, and capacity risk for {day?.dayName} {formatMatrixDate(day?.date || todayStr())}
          </span>
        </span>
        <span style={{ display: "flex", transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.15s", color: C.textMut }}>
          <I.ChevronDown />
        </span>
      </button>
      {expanded && (
        <>
          {matrixMode === "projected" ? (
            <ProjectionMethodologyPanel day={day} />
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
              <span style={{ fontSize: 11, color: C.textMut }}>
                Selected day: <span style={{ fontWeight: 700, color: C.text }}>{day?.dayName} {formatMatrixDate(day?.date || todayStr())}</span>
              </span>
              <span style={{ fontSize: 11, color: C.textMut }}>
                Weekly totals shown in the workbook are dog-days, not unique reservations.
              </span>
            </div>
          )}
          <ProjectionAccuracyPanel day={day} />
        </>
      )}
    </div>
  );
}

function ProjectionAccuracyPanel({ day }) {
  if (!day) return null;
  const points = getProjectionHistoryPoints(day);
  const capacityLines = getCapacityRiskLines(day);

  return (
    <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${C.borderLight}`, display: "grid", gridTemplateColumns: "minmax(0, 1.5fr) minmax(240px, 0.8fr)", gap: 18 }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.text }}>Projection Accuracy</div>
            <div style={{ fontSize: 11, color: C.textMut, marginTop: 2 }}>Achievable total dog volume by days out for {day.dayName} {formatMatrixDate(day.date)}</div>
          </div>
          <div style={{ display: "flex", gap: 10, fontSize: 10, fontWeight: 700, color: C.textMut, flexWrap: "wrap" }}>
            <span><span style={{ color: C.pri }}>●</span> Achievable</span>
            <span><span style={{ color: "#7C3AED" }}>●</span> Unconstrained</span>
            <span><span style={{ color: C.textMut }}>●</span> Booked</span>
            <span><span style={{ color: C.suc }}>●</span> Actual</span>
          </div>
        </div>
        {points.length ? (
          <ProjectionHistoryChart points={points} />
        ) : (
          <div style={{ padding: "20px 0", fontSize: 12, color: C.textMut }}>Projection history will appear after the next daily compute snapshot.</div>
        )}
      </div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 800, color: C.text, marginBottom: 8 }}>Capacity Check</div>
        {capacityLines.length ? (
          <div style={{ display: "grid", gap: 6 }}>
            {capacityLines.map((line) => (
              <div key={line} style={{ fontSize: 11, color: C.dan, lineHeight: 1.45, fontWeight: 700 }}>{line}</div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 11, color: C.textMut, lineHeight: 1.5 }}>
            No projected capacity breach for configured boarding or play-yard limits.
          </div>
        )}
      </div>
    </div>
  );
}
