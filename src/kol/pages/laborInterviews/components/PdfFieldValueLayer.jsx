import React from "react";
import { getInterviewPdfFieldDisplayRect } from "../../../interviewData";
import {
  fitPdfFieldValueForSlot,
  getPdfFieldPageSize,
  getPdfFieldValueOverlayStyle,
  getPdfPageOverlayBox,
  responseKeyForPdfField,
} from "../helpers";

export function PdfFieldValueLayer({ fields, activePageNumber, activeKey, containerSize, pageSize: explicitPageSize = null, fieldValues = {} }) {
  const pageFields = fields.filter((field) => Number(field.page_number || 1) === Number(activePageNumber || 1));
  if (!pageFields.length) return null;
  const pageSize = explicitPageSize || getPdfFieldPageSize(pageFields[0], pageFields);
  const pageBox = getPdfPageOverlayBox(containerSize, pageSize);
  if (!pageBox) return null;
  return (
    <div className="interview-pdf-value-layer" style={{ position: "absolute", inset: 0, zIndex: 2, pointerEvents: "none" }}>
      {pageFields.map((field) => {
        const rawValue = String(fieldValues?.[field.name] || "").trim();
        const isActive = responseKeyForPdfField(field) === activeKey;
        const value = isActive ? rawValue.replace(/\s+/g, " ").trim() : fitPdfFieldValueForSlot(rawValue, field);
        if (!value) return null;
        const style = getPdfFieldValueOverlayStyle(field, pageBox, pageSize);
        if (!style) return null;
        const rect = getInterviewPdfFieldDisplayRect(field) || {};
        const smallField = Number(rect.width || 0) <= 14 && Number(rect.height || 0) <= 14;
        const normalizedRaw = rawValue.replace(/\s+/g, " ").trim();
        const doesFit = normalizedRaw === value;
        if (!smallField && !isActive && !doesFit) {
          return (
            <div
              key={field.name}
              title={rawValue}
              aria-label={`${humanizePdfFieldName(field.name)} filled`}
              style={{
                position: "absolute",
                left: style.left,
                top: style.top + Math.max(1, style.height / 2 - 3),
                width: Math.min(26, Math.max(12, style.width * 0.08)),
                height: 5,
                borderRadius: 999,
                background: "rgba(22, 163, 74, 0.78)",
                boxShadow: "0 0 0 1px rgba(255,255,255,0.9)",
              }}
            />
          );
        }
        const activeFitSize = normalizedRaw
          ? Math.max(5.2, Math.min(10.5, style.width / Math.max(1, normalizedRaw.length * 0.48)))
          : 10.5;
        const fontSize = smallField
          ? Math.max(8, style.height * 0.74)
          : isActive
            ? Math.min(activeFitSize, Math.max(8.5, Math.min(10.5, style.height * 0.72)))
            : Math.max(7.25, Math.min(8.75, style.height * 0.72));
        const height = smallField ? style.height : Math.max(style.height, isActive ? 17 : 12);
        return (
          <div
            key={field.name}
            title={rawValue}
            style={{
              position: "absolute",
              left: style.left,
              top: style.top,
              width: style.width,
              height,
              boxSizing: "border-box",
              color: "#0f172a",
              display: smallField ? "grid" : "block",
              placeItems: smallField ? "center" : undefined,
              overflow: "hidden",
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
              fontFamily: smallField ? "Arial, sans-serif" : "\"Times New Roman\", Times, serif",
              fontSize,
              lineHeight: smallField ? 1 : `${Math.max(10, height - 3)}px`,
              fontWeight: smallField ? 800 : 500,
              padding: smallField ? 0 : "0 3px",
              background: smallField ? "transparent" : "rgba(255,255,255,0.98)",
              borderRadius: smallField ? 0 : 2,
              boxShadow: smallField ? undefined : "0 0 0 1px rgba(255,255,255,0.8)",
            }}
          >
            {smallField ? "X" : value}
          </div>
        );
      })}
    </div>
  );
}
