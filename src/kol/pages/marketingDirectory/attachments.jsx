// Attachment leaf components for the Marketing Directory page
// (src/kol/pages/MarketingDirectoryPage.jsx): the chip, the preview lightbox,
// and the staged-file (pre-save) preview.
import React, { useEffect, useMemo } from "react";
import { C } from "../../../shared/theme";
import { I } from "../../../shared/icons";
import { Btn, Modal } from "../../../shared/ui";
import { getDirectoryAttachmentPreviewKind, formatDirectoryFileSize, isHeicFile } from "../../marketingDirectoryData";
import { Glyph } from "./Glyph";

// ─── attachment chip (preview / delete) ─────────────────────────────────────
export function AttachmentChip({ attachment, onPreview, onDelete, busy, canManage }) {
  const kind = getDirectoryAttachmentPreviewKind(attachment);
  const icon = kind === "pdf" ? <Glyph icon={I.FileText} size={14} /> : <Glyph icon={I.Image} size={14} />;
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 10px", border: `1px solid ${C.border}`, borderRadius: 10, background: C.surface, maxWidth: 260 }}>
      <span style={{ color: C.textMut, flexShrink: 0 }}>{icon}</span>
      <button
        type="button"
        onClick={() => onPreview(attachment)}
        title="Preview"
        style={{ flex: 1, minWidth: 0, textAlign: "left", border: "none", background: "transparent", cursor: "pointer", padding: 0, color: C.text, fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "inherit" }}
      >
        {attachment.file_name || "Attachment"}
      </button>
      {attachment.file_size_bytes ? (
        <span style={{ color: "#94A3B8", fontSize: 11, flexShrink: 0 }}>{formatDirectoryFileSize(attachment.file_size_bytes)}</span>
      ) : null}
      {canManage ? (
        <button type="button" onClick={() => onDelete(attachment)} disabled={busy} title="Remove" style={{ border: "none", background: "transparent", cursor: busy ? "default" : "pointer", color: C.textMut, display: "flex", padding: 2 }}>
          <Glyph icon={I.Trash} size={13} />
        </button>
      ) : null}
    </div>
  );
}

// ─── attachment preview lightbox ────────────────────────────────────────────
export function AttachmentPreviewModal({ attachment, url, loading, onClose }) {
  const kind = getDirectoryAttachmentPreviewKind(attachment);
  return (
    <Modal title={attachment.file_name || "Attachment"} onClose={onClose} wide>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, minHeight: 200, justifyContent: "center" }}>
        {loading ? (
          <div style={{ color: C.textMut, fontSize: 13 }}>Loading preview…</div>
        ) : !url ? (
          <div style={{ color: C.dan, fontSize: 13 }}>Could not load this attachment.</div>
        ) : kind === "image" ? (
          <img src={url} alt={attachment.file_name || "Attachment"} style={{ maxWidth: "100%", maxHeight: "62vh", borderRadius: 12, border: `1px solid ${C.border}` }} />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: 20 }}>
            <Glyph icon={I.FileText} size={40} color={C.textMut} />
            <Btn variant="secondary" icon={<Glyph icon={I.Download} size={15} />} onClick={() => window.open(url, "_blank", "noopener")}>Open file</Btn>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ─── staged-file preview (before save) ──────────────────────────────────────
export function StagedFilePreview({ file, onRemove, isCard }) {
  // HEIC/HEIF can't render in <img> until it's converted on upload — show the file
  // icon for those instead of a broken thumbnail.
  const previewable = Boolean(file && file.type?.startsWith("image/") && !isHeicFile(file));
  const url = useMemo(() => (previewable ? URL.createObjectURL(file) : ""), [file, previewable]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: 6, border: `1px dashed ${C.pri}`, borderRadius: 10, background: C.priLt }}>
      {url ? (
        <img src={url} alt={file.name} style={{ width: isCard ? 56 : 30, height: isCard ? 36 : 30, objectFit: "cover", borderRadius: 6 }} />
      ) : (
        <Glyph icon={I.FileText} size={18} color={C.pri} />
      )}
      <span style={{ fontSize: 12, fontWeight: 600, color: C.text, maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</span>
      <button type="button" onClick={onRemove} title="Remove" style={{ border: "none", background: "transparent", cursor: "pointer", color: C.textMut, display: "flex", padding: 2 }}><Glyph icon={I.X} size={13} /></button>
    </div>
  );
}
