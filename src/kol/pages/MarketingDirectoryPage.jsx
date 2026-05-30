// MarketingDirectoryPage — SCAFFOLD STUB created by F2 (nav/route scaffolding).
//
// Owned by M3 · Marketing Directory (Linear K9-11). Replace the contents of this
// file with the real page: an organizations + affiliated contacts directory with
// business-card photo upload (heic2any), manual contact entry, attachments and
// notes, Directory + History subtabs, and an org-vs-individual pill filter — wired
// so marketing organizer + visit fields read and write the directory. The
// "marketing-directory" route, its "Marketing Directory Access" permission, and
// the Home launcher card are already wired in KolApp.jsx.
import React from "react";
import { C } from "../../shared/theme";
import { I } from "../../shared/icons";

export default function MarketingDirectoryPage() {
  const Icon = I.Users;
  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "8px 0" }}>
      <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: "-0.01em" }}>
        Marketing Directory
      </h1>
      <p style={{ marginTop: 6, marginBottom: 28, fontSize: 14, color: C.textMut }}>
        Organizations and affiliated contacts for marketing outreach.
      </p>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          gap: 14,
          padding: "72px 24px",
          border: `1.5px dashed ${C.border}`,
          borderRadius: 16,
          background: C.surfaceHover,
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            background: `${C.pri}12`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {Icon ? <Icon style={{ width: 28, height: 28, color: C.pri }} /> : null}
        </div>
        <div style={{ fontSize: 17, fontWeight: 800, color: C.text }}>Marketing Directory is coming soon</div>
        <div style={{ fontSize: 13, color: C.textMut, maxWidth: 440 }}>
          This space is reserved while the organizations and contacts directory is built.
        </div>
      </div>
    </div>
  );
}
