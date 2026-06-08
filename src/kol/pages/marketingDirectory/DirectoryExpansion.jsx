// Affiliated-contact + attachment block shown beneath an expanded directory row
// of the Marketing Directory page (src/kol/pages/MarketingDirectoryPage.jsx).
import React from "react";
import { C } from "../../../shared/theme";
import { I } from "../../../shared/icons";
import { IconButton, RowActionButton } from "../../../shared/listSurface";
import { getDirectoryContactName } from "../../marketingDirectoryData";
import { Glyph } from "./Glyph";
import { LABEL_STYLE } from "./styles";
import { AttachmentChip } from "./attachments";

export function DirectoryExpansion({ entry, canManage, onAddContact, onEditContact, onDeleteContact, onPreviewAttachment }) {
  const stop = (fn) => (ev) => { ev.stopPropagation(); fn(); };
  if (entry.kind === "org") {
    return (
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={LABEL_STYLE}>Affiliated contacts</span>
          {canManage ? <RowActionButton tone="primary" onClick={stop(() => onAddContact(entry.org))}>Add contact</RowActionButton> : null}
        </div>
        {entry.contacts.length === 0 ? (
          <div style={{ fontSize: 12, color: C.textMut, fontStyle: "italic" }}>No contacts yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 0 }}>
            {entry.contacts.map((cnt) => (
              <div key={cnt.id} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.6fr) minmax(0, 1.2fr) minmax(0, 0.9fr) auto", gap: 10, alignItems: "center", fontSize: 12, padding: "8px 0", borderTop: `1px solid ${C.borderLight}` }}>
                <div style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <span style={{ fontWeight: 700, color: C.text }}>{getDirectoryContactName(cnt)}</span>
                  {cnt.title ? <span style={{ color: C.textMut }}>{` · ${cnt.title}`}</span> : null}
                </div>
                <div style={{ color: C.textMut, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cnt.email || ""}</div>
                <div style={{ color: C.textMut, whiteSpace: "nowrap" }}>{cnt.phone || ""}</div>
                {canManage ? (
                  <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    <RowActionButton onClick={stop(() => onEditContact(cnt))}>Edit</RowActionButton>
                    <IconButton tone="danger" title="Remove contact" icon={<Glyph icon={I.Trash} size={12} />} onClick={stop(() => onDeleteContact(cnt))} />
                  </div>
                ) : <div />}
              </div>
            ))}
          </div>
        )}
        {entry.org.notes ? <div style={{ fontSize: 12, color: C.textSec, whiteSpace: "pre-wrap", lineHeight: 1.45 }}>{entry.org.notes}</div> : null}
        {entry.attachments.length ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {entry.attachments.map((att) => <AttachmentChip key={att.id} attachment={att} onPreview={onPreviewAttachment} onDelete={() => {}} busy canManage={false} />)}
          </div>
        ) : null}
      </div>
    );
  }
  return (
    <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
      {entry.contact.notes
        ? <div style={{ fontSize: 12, color: C.textSec, whiteSpace: "pre-wrap", lineHeight: 1.45 }}>{entry.contact.notes}</div>
        : <div style={{ fontSize: 12, color: C.textMut, fontStyle: "italic" }}>No notes.</div>}
      {entry.attachments.length ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {entry.attachments.map((att) => <AttachmentChip key={att.id} attachment={att} onPreview={onPreviewAttachment} onDelete={() => {}} busy canManage={false} />)}
        </div>
      ) : null}
    </div>
  );
}
