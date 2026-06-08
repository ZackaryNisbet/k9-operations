import React from "react";
import {
  getPdfFieldOverlayStyle,
  getPdfFieldPageSize,
  getPdfPageOverlayBox,
  humanizePdfFieldName,
  responseKeyForPdfField,
} from "../helpers";

export function PdfFieldClickLayer({ fields, activePageNumber, activeKey, containerSize, pageSize: explicitPageSize = null, onSelectField }) {
  const pageFields = fields.filter((field) => Number(field.page_number || 1) === Number(activePageNumber || 1));
  if (!pageFields.length) return null;
  const pageSize = explicitPageSize || getPdfFieldPageSize(pageFields[0], pageFields);
  const pageBox = getPdfPageOverlayBox(containerSize, pageSize);
  if (!pageBox) return null;
  return (
    <div className="interview-pdf-click-layer" style={{ position: "absolute", inset: 0, zIndex: 3, pointerEvents: "none" }}>
      {pageFields.map((field) => {
        const style = getPdfFieldOverlayStyle(field, pageBox, pageSize);
        if (!style) return null;
        const key = responseKeyForPdfField(field);
        const isActive = key === activeKey;
        return (
          <button
            type="button"
            key={field.name}
            aria-label={`Review ${humanizePdfFieldName(field.name)}`}
            title={humanizePdfFieldName(field.name)}
            onClick={(event) => {
              event.stopPropagation();
              onSelectField?.(field);
            }}
            className="interview-pdf-field-hotspot"
            style={{
              position: "absolute",
              left: style.left,
              top: style.top,
              width: style.width,
              height: style.height,
              borderRadius: 3,
              border: `1.5px solid ${isActive ? "rgba(22, 101, 52, 0.85)" : "rgba(22, 101, 52, 0)"}`,
              background: isActive ? "rgba(22, 163, 74, 0.08)" : "rgba(255,255,255,0.001)",
              cursor: "pointer",
              padding: 0,
              pointerEvents: "auto",
            }}
          />
        );
      })}
    </div>
  );
}
