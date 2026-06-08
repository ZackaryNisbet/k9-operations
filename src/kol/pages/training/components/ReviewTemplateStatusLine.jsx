// K9 Operations — Training Module: leaf component extracted verbatim from TrainingPage.jsx (no behavior change).

import { C } from "../../../../shared/theme";
import { formatReviewWorkflowLabel } from "../helpers";

export function ReviewTemplateStatusLine({ reviewTemplateName, pdfTemplateName, mismatch }) {
  const visibleReviewTemplateName = formatReviewWorkflowLabel(reviewTemplateName);
  const visiblePdfTemplateName = formatReviewWorkflowLabel(pdfTemplateName);
  return (
    <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12 }}>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 9px",
          borderRadius: 999,
          background: mismatch ? "#FFF7ED" : C.sucLt,
          color: mismatch ? C.warn : C.suc,
          border: `1px solid ${mismatch ? "rgba(217,119,6,0.22)" : "rgba(22,163,74,0.18)"}`,
          fontWeight: 900,
          lineHeight: 1.2,
        }}
      >
        <span
          className={mismatch ? "performance-review-sync-dot" : ""}
          style={{
            width: 6,
            height: 6,
            borderRadius: 99,
            background: mismatch ? C.warn : C.suc,
            flexShrink: 0,
          }}
        />
        {mismatch ? "Template sync needed" : "Templates aligned"}
      </span>
      <span style={{ color: C.textMut, fontWeight: 700 }}>
        Form: {visibleReviewTemplateName || "Not loaded"} · PDF: {visiblePdfTemplateName || "Not set"}
      </span>
    </div>
  );
}
