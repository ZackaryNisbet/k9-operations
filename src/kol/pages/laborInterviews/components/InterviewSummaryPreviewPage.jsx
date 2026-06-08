import React from "react";

export function InterviewSummaryPreviewPage({ page, width }) {
  if (!page) return null;
  const safeWidth = Number(width) > 0 ? Number(width) : 816;
  const scale = safeWidth / 612;
  return (
    <div
      aria-label="Interview summary appendix preview"
      style={{
        width: safeWidth,
        minHeight: 792 * scale,
        background: "#fff",
        boxShadow: "0 1px 12px rgba(15,23,42,0.12)",
        boxSizing: "border-box",
        padding: `${58 * scale}px ${54 * scale}px`,
        color: "#0f172a",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div style={{ fontSize: 18 * scale, fontWeight: 800, lineHeight: 1.2 }}>{page.title || "Interview Summary"}</div>
      {page.subtitle ? (
        <div style={{ marginTop: 8 * scale, marginBottom: 22 * scale, fontSize: 9 * scale, color: "#64748b", lineHeight: 1.35 }}>{page.subtitle}</div>
      ) : (
        <div style={{ height: 18 * scale }} />
      )}
      <div style={{ display: "grid", gap: 12 * scale }}>
        {(page.sections || []).map((section, sectionIndex) => (
          <div key={`${section.heading || "section"}-${sectionIndex}`} style={{ display: "grid", gap: 6 * scale }}>
            {section.heading ? (
              <div style={{ fontSize: 11 * scale, fontWeight: 800, color: "#111827" }}>{section.heading}</div>
            ) : null}
            <div style={{ display: "grid", gap: 5 * scale }}>
              {(section.bullets || []).map((bullet, bulletIndex) => (
                <div key={bulletIndex} style={{ display: "grid", gridTemplateColumns: `${12 * scale}px minmax(0, 1fr)`, gap: 6 * scale, alignItems: "start", fontSize: 10 * scale, lineHeight: 1.35, color: "#334155" }}>
                  <span>-</span>
                  <span>{String(bullet || "").replace(/^[-*]\s*/, "")}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
