import React from "react";
import { C } from "../../../shared/theme";
import {
  formatDemandMatrixValue as formatMatrixValue,
  getDayMatrixValue,
  getDayProjection,
  summarizeAggregateMatrixCell,
} from "../schedulingDemandMatrixModel";
import { getProjectionTooltip } from "./projectionCopy";

export function renderMatrixCellValue({ row, day, mode }) {
  const currentValue = getDayMatrixValue(day, row, "current");
  const projectedValue = getDayMatrixValue(day, row, "projected");
  const comparisonValue = row.comparison ? currentValue : null;
  const projection = getDayProjection(day);
  const missingValue = (mode === "projected" ? projectedValue : currentValue) === null || (mode === "projected" ? projectedValue : currentValue) === undefined;

  if (row.weather) {
    const displayValue = missingValue ? "No data" : formatMatrixValue(currentValue, row.format);
    const compactTextCell = typeof displayValue === "string" && displayValue.length > 42;
    return {
      title: missingValue ? "No cached weather is available for this date yet." : `${row.label}: ${displayValue}`,
      content: compactTextCell ? (
        <span style={{
          display: "-webkit-box",
          WebkitBoxOrient: "vertical",
          WebkitLineClamp: row.key === "weather.provider_raw" ? 3 : 4,
          overflow: "hidden",
          whiteSpace: "normal",
          lineHeight: 1.35,
          maxWidth: 176,
          margin: "0 auto",
        }}>
          {displayValue}
        </span>
      ) : displayValue,
      missingValue,
    };
  }

  if (row.comparison) {
    const unavailableLabel = "Not populated";
    return {
      title: comparisonValue === null || comparisonValue === undefined ? "No populated prior-year source count is available for this row." : `${row.label}: ${formatMatrixValue(comparisonValue, row.format)}`,
      content: comparisonValue === null || comparisonValue === undefined ? unavailableLabel : formatMatrixValue(comparisonValue, row.format),
      missingValue: comparisonValue === null || comparisonValue === undefined,
    };
  }

  if (mode === "projected" && projection?.lead_days > 0) {
    const explanation = projection?.explanations?.[row.key.replaceAll(".", "_")] || null;
    const capacityConstrained = !!explanation?.capacity_constraint?.constrained;
    const currentText = currentValue ?? "—";
    const projectedText = projectedValue ?? currentValue ?? "—";
    const title = getProjectionTooltip({
      explanation,
      currentValue: currentText,
      projectedValue: projectedText,
    });

    return {
      title,
      content: (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, whiteSpace: "nowrap" }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: C.textMut }}>{currentText}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.pri }}>→</span>
          <span style={{ fontSize: 16, fontWeight: row.total ? 800 : 700, color: capacityConstrained ? C.dan : C.text }}>{projectedText}</span>
          {capacityConstrained && <span style={{ fontSize: 9, fontWeight: 800, color: C.dan, textTransform: "uppercase" }}>cap</span>}
        </div>
      ),
      missingValue,
    };
  }

  return {
    title: missingValue ? "No canonical source count is available for this row." : `${currentValue}`,
    content: missingValue ? "No data" : formatMatrixValue(currentValue, row.format),
    missingValue,
  };
}

export function renderAggregateMatrixCellValue({ row, days, mode }) {
  const summary = summarizeAggregateMatrixCell(days, row, mode);
  if (!summary.hasValue) {
    return {
      title: summary.unavailableTitle,
      content: summary.unavailableLabel,
      missingValue: true,
    };
  }
  return {
    title: `${row.label}: ${formatMatrixValue(summary.value, row.format)} across ${days.length} day${days.length === 1 ? "" : "s"}`,
    content: formatMatrixValue(summary.value, row.format),
    missingValue: false,
  };
}
