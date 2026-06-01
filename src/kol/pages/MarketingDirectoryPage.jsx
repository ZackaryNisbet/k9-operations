// Marketing Directory (Linear K9-11) — organizations + affiliated contacts for
// marketing outreach. Organizations hold many contacts; a contact with no org is a
// standalone individual (the org-vs-individual pill filter). Business cards and
// files attach to either; a History subtab shows the change log. The directory
// cross-references the grassroots marketing tracker: "Import from tracker" pulls in
// event organizers + visited/partnership businesses, and saving a linked org writes
// its contact fields back to the tracker.
//
// All data/UI rules live in ../marketingDirectoryData (unit-tested); this file is
// the React surface and Supabase I/O only.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../supabaseClient";
import { C } from "../../shared/theme";
import { I } from "../../shared/icons";
import { Badge, Btn, Inp, Modal } from "../../shared/ui";
import { hasLeanPermission } from "../../shared/permissions";
import { normalizeOptionalUuid } from "../trainingData";
import {
  MARKETING_DIRECTORY_ATTACHMENT_ACCEPT,
  MARKETING_DIRECTORY_ATTACHMENT_BUCKET,
  MARKETING_DIRECTORY_ENTRY_TYPES,
  MARKETING_DIRECTORY_ORG_TYPE_OPTIONS,
  buildDirectoryAttachmentPath,
  buildDirectoryContactPayload,
  buildDirectoryEntries,
  buildDirectoryImportCandidates,
  buildDirectoryOrgPayload,
  buildGrassrootsTargetWriteback,
  filterDirectoryEntries,
  formatDirectoryFileSize,
  getDirectoryAttachmentPreviewKind,
  getDirectoryBusinessCard,
  getDirectoryContactInitials,
  getDirectoryContactName,
  getDirectoryHistoryEventLabel,
  getDirectoryOrgAddressText,
  getDirectoryOrgName,
  groupDirectoryAttachments,
  inferDirectoryAttachmentMimeType,
  isHeicFile,
  makeBlankDirectoryContact,
  makeBlankDirectoryOrg,
  summarizeDirectory,
  validateDirectoryAttachmentFiles,
} from "../marketingDirectoryData";

// ─── small utilities ────────────────────────────────────────────────────────
function clientUuid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// HEIC/HEIF → JPEG (same approach as PhotosPage) so iPhone business-card photos
// upload as a web-displayable image. Other files pass through untouched.
async function normalizeUploadFile(file) {
  if (!isHeicFile(file)) return file;
  const heic2any = (await import("heic2any")).default;
  const blob = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.85 });
  const converted = Array.isArray(blob) ? blob[0] : blob;
  const newName = (file.name || "card").replace(/\.(heic|heif)$/i, ".jpg");
  return new File([converted], newName, { type: "image/jpeg", lastModified: file.lastModified || Date.now() });
}

// Compact date + time stamp for history rows (matches the grassroots history style).
function fmtDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const LABEL_STYLE = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  color: C.textSec,
  marginBottom: 4,
  letterSpacing: "0.03em",
  textTransform: "uppercase",
};

// Icons in ../../shared/icons are fixed-size, prop-less SVGs. Glyph wraps one so a
// call site can set its size + color: the `.md-glyph > svg` rule (injected once in
// the page root) lets CSS dimensions on the wrapper drive the SVG, since CSS beats
// the SVG's hardcoded width/height attributes. Color flows through `currentColor`.
function Glyph({ icon: IconCmp, size = 16, color, style }) {
  if (!IconCmp) return null;
  return (
    <span className="md-glyph" style={{ width: size, height: size, color, display: "inline-flex", flexShrink: 0, ...style }}>
      <IconCmp />
    </span>
  );
}

// Filter pill — matches the bordered "{label} {count}" pills in the grassroots /
// customer-lifecycle header (active = primary tint, not a segmented control).
function FilterPill({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "4px 9px",
        borderRadius: 8,
        border: `1.5px solid ${active ? C.pri : C.border}`,
        background: active ? C.priLt : "transparent",
        color: active ? C.pri : C.textMut,
        fontSize: 11,
        fontWeight: 700,
        cursor: "pointer",
        fontFamily: "inherit",
        whiteSpace: "nowrap",
        transition: "all 0.15s",
      }}
    >
      {children}
    </button>
  );
}

// ─── avatar (org tile or contact initials) with a business-card indicator ────
function EntryAvatar({ kind, contact, hasCard }) {
  const isOrg = kind === "org";
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <div
        style={{
          width: 42,
          height: 42,
          borderRadius: isOrg ? 11 : "50%",
          background: isOrg ? `${C.pri}12` : C.accLt,
          color: isOrg ? C.pri : C.accDk,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 800,
          fontSize: 14,
        }}
      >
        {isOrg ? <Glyph icon={I.Layers} size={20} /> : getDirectoryContactInitials(contact)}
      </div>
      {hasCard ? (
        <div
          title="Has a business card on file"
          style={{
            position: "absolute",
            right: -4,
            bottom: -4,
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: C.surface,
            border: `1px solid ${C.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: C.textMut,
          }}
        >
          <Glyph icon={I.CreditCard} size={11} />
        </div>
      ) : null}
    </div>
  );
}

function MetaLine({ icon, children }) {
  if (!children) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: C.textMut, fontSize: 12.5 }}>
      {icon}
      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{children}</span>
    </span>
  );
}

// ─── attachment chip (preview / delete) ─────────────────────────────────────
function AttachmentChip({ attachment, onPreview, onDelete, busy, canManage }) {
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
function AttachmentPreviewModal({ attachment, url, loading, onClose }) {
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

// ─── affiliated contact row inside an expanded org ──────────────────────────
function ContactRow({ contact, canManage, onEdit, onDelete }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 10, background: C.surfaceHover }}>
      <div style={{ width: 30, height: 30, borderRadius: "50%", background: C.accLt, color: C.accDk, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 11, flexShrink: 0 }}>
        {getDirectoryContactInitials(contact)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {getDirectoryContactName(contact)}
          {contact.title ? <span style={{ color: C.textMut, fontWeight: 600 }}>{` · ${contact.title}`}</span> : null}
        </div>
        <div style={{ display: "flex", gap: 14, marginTop: 1, flexWrap: "wrap" }}>
          {contact.email ? <span style={{ fontSize: 12, color: C.textMut }}>{contact.email}</span> : null}
          {contact.phone ? <span style={{ fontSize: 12, color: C.textMut }}>{contact.phone}</span> : null}
        </div>
      </div>
      {canManage ? (
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          <button type="button" onClick={() => onEdit(contact)} title="Edit contact" style={iconBtnStyle}><Glyph icon={I.Pencil} size={13} /></button>
          <button type="button" onClick={() => onDelete(contact)} title="Remove contact" style={iconBtnStyle}><Glyph icon={I.Trash} size={13} /></button>
        </div>
      ) : null}
    </div>
  );
}

const iconBtnStyle = {
  border: `1px solid ${C.border}`,
  background: C.surface,
  borderRadius: 8,
  cursor: "pointer",
  color: C.textMut,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 28,
  height: 28,
  padding: 0,
};

// ─── one directory row (org with expandable contacts, or an individual) ─────
function DirectoryRow({
  entry,
  expanded,
  onToggle,
  canManage,
  onEditOrg,
  onDeleteOrg,
  onAddContact,
  onEditContact,
  onDeleteContact,
  onPreviewAttachment,
}) {
  const isOrg = entry.kind === "org";
  const hasCard = Boolean(getDirectoryBusinessCard(entry.attachments));
  const contact = isOrg ? null : entry.contact;
  const title = isOrg ? getDirectoryOrgName(entry.org) : getDirectoryContactName(contact);
  const subtitle = isOrg ? entry.org.org_type : contact.title;
  const address = isOrg ? getDirectoryOrgAddressText(entry.org) : "";
  const phone = isOrg ? entry.org.phone : contact.phone;
  const email = isOrg ? entry.org.email : contact.email;
  const website = isOrg ? entry.org.website : "";
  const contactCount = isOrg ? entry.contacts.length : 0;

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 14, background: C.surface, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: 14 }}>
        {isOrg ? (
          <button
            type="button"
            onClick={onToggle}
            title={expanded ? "Collapse" : "Expand"}
            style={{ ...iconBtnStyle, width: 26, height: 26, marginTop: 8, border: "none", background: "transparent", color: C.textMut }}
          >
            {expanded ? <Glyph icon={I.ChevronDown} size={16} /> : <Glyph icon={I.ChevronRight} size={16} />}
          </button>
        ) : (
          <div style={{ width: 26, marginTop: 8, flexShrink: 0 }} />
        )}

        <EntryAvatar kind={entry.kind} contact={contact} hasCard={hasCard} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: C.text, letterSpacing: "-0.01em" }}>{title}</span>
            {subtitle ? <Badge color={isOrg ? "primary" : "accent"} size="sm">{subtitle}</Badge> : null}
            {!isOrg ? <Badge color="default" size="sm">Individual</Badge> : null}
            {isOrg && entry.org.grassroots_target_id ? <Badge color="info" size="sm" tip="Linked to a record in the marketing tracker">Tracker</Badge> : null}
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 6, flexWrap: "wrap" }}>
            <MetaLine icon={<Glyph icon={I.Phone} size={13} />}>{phone}</MetaLine>
            <MetaLine icon={<span style={{ fontSize: 12, fontWeight: 700 }}>@</span>}>{email}</MetaLine>
            {website ? <MetaLine icon={<Glyph icon={I.Link} size={13} />}>{website}</MetaLine> : null}
          </div>
          {address ? (
            <div style={{ marginTop: 4, color: C.textMut, fontSize: 12.5 }}>{address}</div>
          ) : null}
          {isOrg && entry.org.notes ? (
            <div style={{ marginTop: 6, color: C.textSec, fontSize: 12.5, whiteSpace: "pre-wrap", lineHeight: 1.4 }}>{entry.org.notes}</div>
          ) : null}
          {isOrg ? (
            <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10, color: C.textMut, fontSize: 12, fontWeight: 600 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Glyph icon={I.Users} size={13} />{contactCount} contact{contactCount === 1 ? "" : "s"}</span>
              {entry.attachments.length ? <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Glyph icon={I.FileText} size={13} />{entry.attachments.length} file{entry.attachments.length === 1 ? "" : "s"}</span> : null}
            </div>
          ) : null}
          {!isOrg && contact.notes ? (
            <div style={{ marginTop: 6, color: C.textSec, fontSize: 12.5, whiteSpace: "pre-wrap", lineHeight: 1.4 }}>{contact.notes}</div>
          ) : null}
          {!isOrg && entry.attachments.length ? (
            <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {entry.attachments.map((att) => (
                <AttachmentChip key={att.id} attachment={att} onPreview={onPreviewAttachment} onDelete={() => {}} busy canManage={false} />
              ))}
            </div>
          ) : null}
        </div>

        {canManage ? (
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <Btn variant="secondary" size="sm" icon={<Glyph icon={I.Pencil} size={13} />} onClick={() => (isOrg ? onEditOrg(entry.org) : onEditContact(contact))} style={{ padding: "6px 10px" }}>Edit</Btn>
            <button type="button" onClick={() => (isOrg ? onDeleteOrg(entry.org) : onDeleteContact(contact))} title="Delete" style={{ ...iconBtnStyle, width: 32, height: 32, color: C.dan }}><Glyph icon={I.Trash} size={14} /></button>
          </div>
        ) : null}
      </div>

      {isOrg && expanded ? (
        <div style={{ borderTop: `1px solid ${C.borderLight}`, padding: 14, background: "#FCFDFE", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={LABEL_STYLE}>Affiliated contacts</span>
            {canManage ? (
              <Btn variant="ghost" size="sm" icon={<Glyph icon={I.Plus} size={13} />} onClick={() => onAddContact(entry.org)} style={{ padding: "4px 8px", color: C.pri }}>Add contact</Btn>
            ) : null}
          </div>
          {entry.contacts.length === 0 ? (
            <div style={{ color: C.textMut, fontSize: 12.5, fontStyle: "italic" }}>No contacts yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {entry.contacts.map((cnt) => (
                <ContactRow key={cnt.id} contact={cnt} canManage={canManage} onEdit={onEditContact} onDelete={onDeleteContact} />
              ))}
            </div>
          )}
          {entry.attachments.length ? (
            <>
              <span style={{ ...LABEL_STYLE, marginTop: 4 }}>Business cards &amp; files</span>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {entry.attachments.map((att) => (
                  <AttachmentChip key={att.id} attachment={att} onPreview={onPreviewAttachment} onDelete={() => {}} busy canManage={false} />
                ))}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ─── staged-file preview (before save) ──────────────────────────────────────
function StagedFilePreview({ file, onRemove, isCard }) {
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

// ─── org / contact editor ───────────────────────────────────────────────────
function DirectoryEditorModal({
  mode,
  draft,
  existingAttachments,
  saving,
  onChange,
  onClose,
  onSave,
  onPreviewAttachment,
  onDeleteAttachment,
  stagedCard,
  stagedFiles,
  onPickCard,
  onClearCard,
  onPickFiles,
  onRemoveStagedFile,
}) {
  const isOrg = mode === "org";
  const cardInputRef = useRef(null);
  const filesInputRef = useRef(null);
  const existingCard = getDirectoryBusinessCard(existingAttachments);
  const existingFiles = (existingAttachments || []).filter((att) => att.attachment_type !== "business_card");
  const title = draft.isDraft ? (isOrg ? "Add organization" : "Add contact") : (isOrg ? "Edit organization" : "Edit contact");
  const canSave = isOrg ? Boolean(String(draft.name || "").trim()) : Boolean(String(draft.first_name || "").trim() || String(draft.last_name || "").trim());

  return (
    <Modal title={title} onClose={onClose} wide>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {isOrg ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
              <Inp label="Organization name" value={draft.name} onChange={(v) => onChange("name", v)} required placeholder="e.g. Lincoln Park Vet Clinic" autoFocus />
              <Inp label="Type" type="select" value={draft.org_type} onChange={(v) => onChange("org_type", v)} options={MARKETING_DIRECTORY_ORG_TYPE_OPTIONS} placeholder="Select type" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <Inp label="Phone" type="tel" value={draft.phone} onChange={(v) => onChange("phone", v)} />
              <Inp label="Email" value={draft.email} onChange={(v) => onChange("email", v)} placeholder="name@business.com" />
              <Inp label="Website" value={draft.website} onChange={(v) => onChange("website", v)} placeholder="https://" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
              <Inp label="Address" value={draft.address_line_1} onChange={(v) => onChange("address_line_1", v)} placeholder="Street address" />
              <Inp label="Suite / unit" value={draft.address_line_2} onChange={(v) => onChange("address_line_2", v)} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12 }}>
              <Inp label="City" value={draft.address_city} onChange={(v) => onChange("address_city", v)} />
              <Inp label="State" value={draft.address_state} onChange={(v) => onChange("address_state", v)} />
              <Inp label="ZIP" value={draft.address_postal_code} onChange={(v) => onChange("address_postal_code", v)} />
            </div>
          </>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Inp label="First name" value={draft.first_name} onChange={(v) => onChange("first_name", v)} autoFocus />
              <Inp label="Last name" value={draft.last_name} onChange={(v) => onChange("last_name", v)} />
            </div>
            <Inp label="Title / role" value={draft.title} onChange={(v) => onChange("title", v)} placeholder="e.g. Practice Manager" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Inp label="Phone" type="tel" value={draft.phone} onChange={(v) => onChange("phone", v)} />
              <Inp label="Email" value={draft.email} onChange={(v) => onChange("email", v)} placeholder="name@email.com" />
            </div>
          </>
        )}

        <Inp label="Notes" type="textarea" value={draft.notes} onChange={(v) => onChange("notes", v)} rows={3} placeholder="Outreach notes, preferences, history…" />

        {/* Business card */}
        <div>
          <span style={LABEL_STYLE}>Business card</span>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {stagedCard ? (
              <StagedFilePreview file={stagedCard} onRemove={onClearCard} isCard />
            ) : existingCard ? (
              <AttachmentChip attachment={existingCard} onPreview={onPreviewAttachment} onDelete={onDeleteAttachment} busy={saving} canManage />
            ) : null}
            <input ref={cardInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif,.heic,.heif" style={{ display: "none" }} onChange={(e) => { onPickCard(e.target.files?.[0] || null); if (cardInputRef.current) cardInputRef.current.value = ""; }} />
            <Btn variant="secondary" size="sm" icon={<Glyph icon={I.Camera} size={14} />} onClick={() => cardInputRef.current?.click()}>
              {existingCard || stagedCard ? "Replace card" : "Upload card"}
            </Btn>
          </div>
        </div>

        {/* Attachments */}
        <div>
          <span style={LABEL_STYLE}>Attachments</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {existingFiles.map((att) => (
              <AttachmentChip key={att.id} attachment={att} onPreview={onPreviewAttachment} onDelete={onDeleteAttachment} busy={saving} canManage />
            ))}
            {stagedFiles.map((file, index) => (
              <StagedFilePreview key={`${file.name}-${index}`} file={file} onRemove={() => onRemoveStagedFile(index)} />
            ))}
            <input ref={filesInputRef} type="file" multiple accept={MARKETING_DIRECTORY_ATTACHMENT_ACCEPT} style={{ display: "none" }} onChange={(e) => { onPickFiles(e.target.files); if (filesInputRef.current) filesInputRef.current.value = ""; }} />
            <Btn variant="secondary" size="sm" icon={<Glyph icon={I.Plus} size={14} />} onClick={() => filesInputRef.current?.click()}>Add files</Btn>
          </div>
        </div>

        {isOrg && draft.grassroots_target_id ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: C.infoLt, borderRadius: 10, color: C.info, fontSize: 12.5 }}>
            <Glyph icon={I.Link} size={14} />
            Linked to the marketing tracker — saving updates the tracker's contact info too.
          </div>
        ) : null}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, borderTop: `1px solid ${C.borderLight}`, paddingTop: 16 }}>
          <Btn variant="ghost" onClick={onClose} disabled={saving}>Cancel</Btn>
          <Btn variant="primary" onClick={onSave} disabled={saving || !canSave} icon={saving ? null : <Glyph icon={I.Check} size={15} />}>{saving ? "Saving…" : "Save"}</Btn>
        </div>
      </div>
    </Modal>
  );
}

// ─── import-from-tracker dialog ─────────────────────────────────────────────
function ImportCandidateRow({ candidate, label, checked, onToggle }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 10, background: checked ? C.priLt : C.surfaceHover, cursor: "pointer", border: `1px solid ${checked ? C.priL : "transparent"}` }}>
      <input type="checkbox" checked={checked} onChange={() => onToggle(candidate.key)} style={{ width: 16, height: 16, accentColor: C.pri }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{candidate.kind === "org" ? candidate.name : candidate.displayName}</div>
        <div style={{ fontSize: 11.5, color: C.textMut }}>{candidate.sourceLabel}{candidate.kind === "org" && candidate.contact ? ` · contact: ${candidate.contact.first_name} ${candidate.contact.last_name}` : ""}</div>
      </div>
      <Badge size="sm" color={candidate.kind === "org" ? "primary" : "accent"}>{label}</Badge>
    </label>
  );
}

function ImportModal({ candidates, saving, onClose, onImport }) {
  const [selected, setSelected] = useState(() => new Set([...candidates.orgs, ...candidates.individuals].map((c) => c.key)));
  const total = candidates.orgs.length + candidates.individuals.length;
  const toggle = (key) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  return (
    <Modal title="Import from marketing tracker" onClose={onClose} wide>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <p style={{ margin: 0, fontSize: 13, color: C.textMut, lineHeight: 1.5 }}>
          These organizers and businesses come from the marketing tracker and aren’t in the directory yet. Imported records stay linked to their tracker entry.
        </p>
        {total === 0 ? (
          <div style={{ padding: "28px 16px", textAlign: "center", color: C.textMut, fontSize: 13 }}>Nothing new to import — the directory is in sync with the tracker.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, maxHeight: "52vh", overflowY: "auto" }}>
            {candidates.orgs.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={LABEL_STYLE}>Organizations ({candidates.orgs.length})</span>
                {candidates.orgs.map((c) => <ImportCandidateRow key={c.key} candidate={c} label={c.org_type || "Business"} checked={selected.has(c.key)} onToggle={toggle} />)}
              </div>
            ) : null}
            {candidates.individuals.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={LABEL_STYLE}>Individuals ({candidates.individuals.length})</span>
                {candidates.individuals.map((c) => <ImportCandidateRow key={c.key} candidate={c} label="Individual" checked={selected.has(c.key)} onToggle={toggle} />)}
              </div>
            ) : null}
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, borderTop: `1px solid ${C.borderLight}`, paddingTop: 16 }}>
          <Btn variant="ghost" onClick={onClose} disabled={saving}>Cancel</Btn>
          <Btn variant="primary" onClick={() => onImport([...candidates.orgs, ...candidates.individuals].filter((c) => selected.has(c.key)))} disabled={saving || selected.size === 0} icon={<Glyph icon={I.Download} size={15} />}>
            {saving ? "Importing…" : `Import ${selected.size}`}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

// ─── history feed (matches the grassroots HistoryList row layout) ───────────
function HistoryFeed({ history }) {
  if (!history || history.length === 0) {
    return <div style={{ fontSize: 13, color: C.textMut, padding: "8px 2px" }}>No changes recorded yet.</div>;
  }
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {history.map((entry) => (
        <div key={entry.id} style={{ display: "grid", gridTemplateColumns: "112px minmax(0, 1fr) 150px", gap: 10, alignItems: "start", fontSize: 12 }}>
          <div style={{ display: "inline-flex", width: "fit-content", padding: "4px 8px", borderRadius: 8, background: C.priLt, color: C.pri, fontWeight: 900 }}>
            {getDirectoryHistoryEventLabel(entry.event_type)}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: C.text, fontWeight: 800, lineHeight: 1.4, wordBreak: "break-word" }}>{entry.entity_name || "Untitled record"}</div>
            <div style={{ marginTop: 3, color: C.textMut, lineHeight: 1.35 }}>
              {entry.entity_type === "org" ? "Organization" : "Contact"} · {entry.changed_by_name || "Unknown"}
            </div>
          </div>
          <div style={{ color: C.textMut, fontWeight: 800, textAlign: "right" }}>{fmtDateTime(entry.event_at)}</div>
        </div>
      ))}
    </div>
  );
}

// ─── page ───────────────────────────────────────────────────────────────────
export default function MarketingDirectoryPage({ profile, nav, locationId, addGlobalToast = () => {} }) {
  const canManage = hasLeanPermission(profile, "Marketing Directory Access");
  const actor = useMemo(() => ({
    userId: normalizeOptionalUuid(profile?.user_id || profile?.id) || "",
    name: profile?.name || profile?.full_name || profile?.email || "Staff",
  }), [profile?.email, profile?.full_name, profile?.id, profile?.name, profile?.user_id]);

  const [tab, setTab] = useState("directory");
  const [entryType, setEntryType] = useState("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [schemaMissing, setSchemaMissing] = useState(false);

  const [orgs, setOrgs] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [history, setHistory] = useState([]);
  const [targets, setTargets] = useState([]);

  const [expandedOrgIds, setExpandedOrgIds] = useState(() => new Set());
  const [editor, setEditor] = useState(null); // { mode, draft }
  const [stagedCard, setStagedCard] = useState(null);
  const [stagedFiles, setStagedFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [preview, setPreview] = useState(null); // { attachment, url, loading }

  const toast = useCallback((message, type = "success") => addGlobalToast(message, type), [addGlobalToast]);

  const loadDirectory = useCallback(async () => {
    if (!locationId) { setLoading(false); return; }
    setLoading(true);
    setSchemaMissing(false);
    const [orgRes, contactRes, attRes, histRes, targetRes] = await Promise.all([
      supabase.from("marketing_directory_orgs").select("*").eq("location_id", locationId).order("name", { ascending: true }),
      supabase.from("marketing_directory_contacts").select("*").eq("location_id", locationId),
      supabase.from("marketing_directory_attachments").select("*").eq("location_id", locationId).is("deleted_at", null).order("uploaded_at", { ascending: false }),
      supabase.from("marketing_directory_history").select("*").eq("location_id", locationId).order("event_at", { ascending: false }).limit(250),
      supabase.from("grassroots_targets").select("*").eq("location_id", locationId),
    ]);

    const missing = (err) => err?.code === "42P01" || err?.code === "PGRST205" || /marketing_directory_/.test(err?.message || "");
    if (orgRes.error || contactRes.error) {
      if (missing(orgRes.error) || missing(contactRes.error)) {
        setSchemaMissing(true);
      } else {
        console.error("Failed to load marketing directory", orgRes.error || contactRes.error);
        toast((orgRes.error || contactRes.error).message || "Failed to load directory", "error");
      }
      setOrgs([]); setContacts([]); setAttachments([]); setHistory([]); setTargets([]);
      setLoading(false);
      return;
    }

    setOrgs(orgRes.data || []);
    setContacts(contactRes.data || []);
    setAttachments(attRes.error ? [] : (attRes.data || []));
    setHistory(histRes.error ? [] : (histRes.data || []));
    // Tracker read is best-effort: it only powers the Import dialog.
    setTargets(targetRes.error ? [] : (targetRes.data || []));
    setLoading(false);
  }, [locationId, toast]);

  useEffect(() => { loadDirectory(); }, [loadDirectory]);

  const attachmentsByEntity = useMemo(() => groupDirectoryAttachments(attachments), [attachments]);
  const entries = useMemo(() => buildDirectoryEntries({ orgs, contacts, attachmentsByEntity }), [orgs, contacts, attachmentsByEntity]);
  const visibleEntries = useMemo(() => filterDirectoryEntries(entries, { entryType, query }), [entries, entryType, query]);
  const counts = useMemo(() => {
    const summary = summarizeDirectory(orgs, contacts);
    return { ...summary, total: summary.organizations + summary.individuals };
  }, [orgs, contacts]);

  const importCandidates = useMemo(
    () => buildDirectoryImportCandidates({ targets, existingOrgs: orgs, existingContacts: contacts }),
    [targets, orgs, contacts],
  );
  const importCount = importCandidates.orgs.length + importCandidates.individuals.length;

  const toggleOrg = (orgId) => setExpandedOrgIds((prev) => {
    const next = new Set(prev);
    if (next.has(orgId)) next.delete(orgId); else next.add(orgId);
    return next;
  });

  // ── editor lifecycle ──
  const openOrgEditor = (org) => { setStagedCard(null); setStagedFiles([]); setEditor({ mode: "org", draft: org ? { ...org, isDraft: false } : makeBlankDirectoryOrg(locationId) }); };
  const openContactEditor = (contact, orgId = null) => { setStagedCard(null); setStagedFiles([]); setEditor({ mode: "contact", draft: contact ? { ...contact, isDraft: false } : makeBlankDirectoryContact(locationId, orgId) }); };
  const closeEditor = () => { setEditor(null); setStagedCard(null); setStagedFiles([]); };
  const updateDraft = (key, value) => setEditor((prev) => (prev ? { ...prev, draft: { ...prev.draft, [key]: value } } : prev));

  const pickStagedFiles = (fileList) => {
    const { acceptedFiles, errors } = validateDirectoryAttachmentFiles([...stagedFiles, ...Array.from(fileList || [])]);
    setStagedFiles(acceptedFiles);
    if (errors.length) toast(errors[0], "error");
  };

  const editorAttachments = useMemo(() => {
    if (!editor || editor.draft.isDraft) return [];
    const key = editor.mode === "org" ? `org:${editor.draft.id}` : `contact:${editor.draft.id}`;
    return attachmentsByEntity[key] || [];
  }, [editor, attachmentsByEntity]);

  // Upload one file to storage + insert its attachment row (entity must already exist).
  const uploadAttachment = useCallback(async ({ entityType, entityId, file, attachmentType }) => {
    const normalized = await normalizeUploadFile(file);
    const attachmentId = clientUuid();
    const mimeType = inferDirectoryAttachmentMimeType(normalized);
    const storagePath = buildDirectoryAttachmentPath({ locationId, entityType, entityId, attachmentId, fileName: normalized.name });
    const { error: uploadError } = await supabase.storage.from(MARKETING_DIRECTORY_ATTACHMENT_BUCKET).upload(storagePath, normalized, { cacheControl: "3600", contentType: mimeType, upsert: false });
    if (uploadError) throw uploadError;
    const row = {
      id: attachmentId,
      location_id: locationId,
      org_id: entityType === "org" ? entityId : null,
      contact_id: entityType === "contact" ? entityId : null,
      attachment_type: attachmentType,
      file_name: normalized.name || "attachment",
      storage_bucket: MARKETING_DIRECTORY_ATTACHMENT_BUCKET,
      storage_path: storagePath,
      mime_type: mimeType,
      file_size_bytes: Number(normalized.size || 0),
      metadata: { source_module: "marketing_directory", original_file_name: file.name || normalized.name || "attachment" },
      uploaded_by_user_id: actor.userId || null,
      uploaded_by_name: actor.name || null,
    };
    const { error: insertError } = await supabase.from("marketing_directory_attachments").insert(row);
    if (insertError) throw insertError;
  }, [actor.name, actor.userId, locationId]);

  const saveEditor = async () => {
    if (!editor || !locationId) return;
    const { mode, draft } = editor;
    if (mode === "org" && !String(draft.name || "").trim()) { toast("Organization name is required", "error"); return; }
    if (mode === "contact" && !String(draft.first_name || "").trim() && !String(draft.last_name || "").trim()) { toast("A contact name is required", "error"); return; }

    setSaving(true);
    try {
      let entityId = draft.id;
      if (mode === "org") {
        const payload = buildDirectoryOrgPayload(draft, locationId, actor);
        if (draft.isDraft) {
          const { data, error } = await supabase.from("marketing_directory_orgs").insert(payload).select("*").single();
          if (error) throw error;
          entityId = data.id;
        } else {
          const { error } = await supabase.from("marketing_directory_orgs").update(payload).eq("id", draft.id);
          if (error) throw error;
        }
        // "Write" half of the field↔directory wiring: keep a linked tracker record's
        // contact fields in sync with the directory.
        const targetId = draft.grassroots_target_id;
        if (targetId) {
          const writeback = buildGrassrootsTargetWriteback(draft);
          if (Object.keys(writeback).length) {
            const { error: wbError } = await supabase.from("grassroots_targets").update({ ...writeback, updated_by_user_id: actor.userId || null, updated_by_name: actor.name || null }).eq("id", targetId);
            if (wbError) console.warn("Tracker write-back skipped:", wbError.message);
          }
        }
      } else {
        const payload = buildDirectoryContactPayload(draft, locationId, actor);
        if (draft.isDraft) {
          const { data, error } = await supabase.from("marketing_directory_contacts").insert(payload).select("*").single();
          if (error) throw error;
          entityId = data.id;
        } else {
          const { error } = await supabase.from("marketing_directory_contacts").update(payload).eq("id", draft.id);
          if (error) throw error;
        }
      }

      // Replace an existing card if a new one was staged.
      if (stagedCard) {
        const existingCard = getDirectoryBusinessCard(editorAttachments);
        if (existingCard) {
          await supabase.from("marketing_directory_attachments").update({ deleted_at: new Date().toISOString(), deleted_by_user_id: actor.userId || null, deleted_by_name: actor.name || null }).eq("id", existingCard.id);
        }
        await uploadAttachment({ entityType: mode, entityId, file: stagedCard, attachmentType: "business_card" });
      }
      for (const file of stagedFiles) {
        await uploadAttachment({ entityType: mode, entityId, file, attachmentType: "attachment" });
      }

      if (mode === "org" && draft.isDraft && entityId) setExpandedOrgIds((prev) => new Set(prev).add(entityId));
      await loadDirectory();
      closeEditor();
      toast(mode === "org" ? "Organization saved" : "Contact saved");
    } catch (err) {
      console.error("Failed to save directory record", err);
      toast(err?.message || "Failed to save", "error");
    } finally {
      setSaving(false);
    }
  };

  const deleteOrg = async (org) => {
    if (typeof window !== "undefined" && !window.confirm(`Delete “${getDirectoryOrgName(org)}” and its contacts? This cannot be undone.`)) return;
    const { error } = await supabase.from("marketing_directory_orgs").delete().eq("id", org.id);
    if (error) { toast(error.message || "Failed to delete organization", "error"); return; }
    await loadDirectory();
    toast("Organization deleted");
  };

  const deleteContact = async (contact) => {
    if (typeof window !== "undefined" && !window.confirm(`Delete contact “${getDirectoryContactName(contact)}”?`)) return;
    const { error } = await supabase.from("marketing_directory_contacts").delete().eq("id", contact.id);
    if (error) { toast(error.message || "Failed to delete contact", "error"); return; }
    await loadDirectory();
    toast("Contact deleted");
  };

  const deleteAttachment = async (attachment) => {
    const { error } = await supabase.from("marketing_directory_attachments").update({ deleted_at: new Date().toISOString(), deleted_by_user_id: actor.userId || null, deleted_by_name: actor.name || null }).eq("id", attachment.id);
    if (error) { toast(error.message || "Failed to remove attachment", "error"); return; }
    setAttachments((prev) => prev.filter((att) => att.id !== attachment.id));
    toast("Attachment removed");
  };

  const previewAttachment = async (attachment) => {
    if (!attachment?.storage_path) return;
    setPreview({ attachment, url: "", loading: true });
    const { data, error } = await supabase.storage.from(attachment.storage_bucket || MARKETING_DIRECTORY_ATTACHMENT_BUCKET).createSignedUrl(attachment.storage_path, 300);
    if (error) { setPreview({ attachment, url: "", loading: false }); toast("Could not load attachment", "error"); return; }
    setPreview({ attachment, url: data?.signedUrl || "", loading: false });
  };

  const importSelected = async (selected) => {
    if (!selected.length || !locationId) return;
    setSaving(true);
    try {
      for (const candidate of selected) {
        if (candidate.kind === "org") {
          const orgPayload = buildDirectoryOrgPayload({ ...makeBlankDirectoryOrg(locationId), ...candidate, isDraft: true }, locationId, actor);
          const { data, error } = await supabase.from("marketing_directory_orgs").insert(orgPayload).select("*").single();
          if (error) throw error;
          if (candidate.contact) {
            const contactPayload = buildDirectoryContactPayload({ ...makeBlankDirectoryContact(locationId, data.id), ...candidate.contact, org_id: data.id, grassroots_target_id: candidate.grassroots_target_id, isDraft: true }, locationId, actor);
            const { error: cErr } = await supabase.from("marketing_directory_contacts").insert(contactPayload);
            if (cErr) throw cErr;
          }
        } else {
          const contactPayload = buildDirectoryContactPayload({ ...makeBlankDirectoryContact(locationId, null), ...candidate, org_id: null, isDraft: true }, locationId, actor);
          const { error } = await supabase.from("marketing_directory_contacts").insert(contactPayload);
          if (error) throw error;
        }
      }
      await loadDirectory();
      setImportOpen(false);
      toast(`Imported ${selected.length} record${selected.length === 1 ? "" : "s"}`);
    } catch (err) {
      console.error("Import failed", err);
      toast(err?.message || "Import failed", "error");
    } finally {
      setSaving(false);
    }
  };

  // ── render ──
  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "8px 0 48px" }}>
      <style>{`.md-glyph > svg { width: 100%; height: 100%; display: block; }`}</style>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: "-0.01em" }}>Marketing Directory</h1>
          <p style={{ marginTop: 6, marginBottom: 0, fontSize: 14, color: C.textMut }}>Organizations and affiliated contacts for marketing outreach.</p>
        </div>
        {canManage && tab === "directory" && !schemaMissing ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {importCount > 0 ? (
              <Btn variant="secondary" icon={<Glyph icon={I.Download} size={15} />} onClick={() => setImportOpen(true)}>Import from tracker ({importCount})</Btn>
            ) : null}
            <Btn variant="secondary" icon={<Glyph icon={I.Users} size={15} />} onClick={() => openContactEditor(null, null)}>Add individual</Btn>
            <Btn variant="primary" icon={<Glyph icon={I.Plus} size={15} />} onClick={() => openOrgEditor(null)}>Add organization</Btn>
          </div>
        ) : null}
      </div>

      {/* Subtabs — standard underline tab bar with count pills */}
      <div style={{ display: "flex", gap: 2, marginTop: 20, borderBottom: `1px solid ${C.borderLight}`, background: C.bg, padding: "0 4px" }}>
        {[{ id: "directory", label: "Directory", count: counts.total }, { id: "history", label: "History", count: history.length }].map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              style={{
                padding: "10px 14px", fontSize: 13, fontWeight: active ? 700 : 600, color: active ? C.text : C.textSec,
                background: "transparent", border: "none", borderBottom: active ? `3px solid ${C.pri}` : "3px solid transparent",
                cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6, marginBottom: -1, whiteSpace: "nowrap",
              }}
            >
              {t.label}
              <span style={{ background: active ? C.pri : "#E5E7EB", color: active ? "#fff" : C.textSec, padding: "1px 7px", borderRadius: 999, fontSize: 11, fontWeight: 800, lineHeight: 1.1, minWidth: 18, textAlign: "center" }}>{t.count}</span>
            </button>
          );
        })}
      </div>

      {schemaMissing ? (
        <div style={{ marginTop: 24, padding: "40px 24px", border: `1.5px dashed ${C.warn}`, borderRadius: 16, background: C.warnLt, textAlign: "center" }}>
          <Glyph icon={I.AlertTriangle} size={30} color={C.warn} />
          <div style={{ marginTop: 10, fontSize: 16, fontWeight: 800, color: C.text }}>Directory tables aren’t set up yet</div>
          <div style={{ marginTop: 6, fontSize: 13, color: C.textMut, maxWidth: 460, margin: "6px auto 0" }}>Run the latest database migration to create the marketing directory, then refresh.</div>
        </div>
      ) : loading ? (
        <div style={{ padding: "60px 24px", textAlign: "center", color: C.textMut, fontSize: 14 }}>Loading directory…</div>
      ) : tab === "history" ? (
        <div style={{ marginTop: 24 }}><HistoryFeed history={history} /></div>
      ) : (
        <div style={{ marginTop: 16 }}>
          {/* Search bar + filter pills — standard lifecycle-header layout */}
          <div style={{ borderBottom: `1.5px solid ${C.borderLight}`, background: C.bg, marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", padding: "0 4px" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={query ? C.pri : C.textMut} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search organizations, people, type…"
                className="no-focus-ring"
                style={{ border: "none", outline: "none", background: "transparent", fontSize: 13, fontWeight: 500, color: C.text, padding: "12px 10px", width: "100%", fontFamily: "inherit" }}
              />
              {query ? (
                <button type="button" onClick={() => setQuery("")} title="Clear" style={{ border: "none", background: "none", cursor: "pointer", color: C.textMut, padding: 2, display: "flex" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              ) : null}
              <div style={{ display: "flex", gap: 4, marginLeft: 8, flexShrink: 0 }}>
                {MARKETING_DIRECTORY_ENTRY_TYPES.map((option) => {
                  const count = option.value === "all" ? counts.total : option.value === "organizations" ? counts.organizations : counts.individuals;
                  return (
                    <FilterPill key={option.value} active={entryType === option.value} onClick={() => setEntryType(option.value)}>
                      {option.label} {count}
                    </FilterPill>
                  );
                })}
              </div>
            </div>
          </div>

          {entries.length === 0 ? (
            <div style={{ padding: "60px 24px", textAlign: "center", border: `1.5px dashed ${C.border}`, borderRadius: 16, background: C.surfaceHover }}>
              <Glyph icon={I.Users} size={34} color={C.pri} style={{ opacity: 0.6 }} />
              <div style={{ marginTop: 12, fontSize: 16, fontWeight: 800, color: C.text }}>Your directory is empty</div>
              <div style={{ marginTop: 6, fontSize: 13, color: C.textMut, maxWidth: 440, margin: "6px auto 0" }}>Add an organization or individual, or import organizers and businesses you’ve already logged in the marketing tracker.</div>
              {canManage ? (
                <div style={{ marginTop: 18, display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                  {importCount > 0 ? <Btn variant="secondary" icon={<Glyph icon={I.Download} size={15} />} onClick={() => setImportOpen(true)}>Import {importCount} from tracker</Btn> : null}
                  <Btn variant="primary" icon={<Glyph icon={I.Plus} size={15} />} onClick={() => openOrgEditor(null)}>Add organization</Btn>
                </div>
              ) : null}
            </div>
          ) : visibleEntries.length === 0 ? (
            <div style={{ padding: "48px 24px", textAlign: "center", color: C.textMut, fontSize: 14 }}>No matches for the current filter.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {visibleEntries.map((entry) => (
                <DirectoryRow
                  key={`${entry.kind}:${entry.id}`}
                  entry={entry}
                  expanded={expandedOrgIds.has(entry.id)}
                  onToggle={() => toggleOrg(entry.id)}
                  canManage={canManage}
                  onEditOrg={openOrgEditor}
                  onDeleteOrg={deleteOrg}
                  onAddContact={(org) => openContactEditor(null, org.id)}
                  onEditContact={(contact) => openContactEditor(contact, contact.org_id)}
                  onDeleteContact={deleteContact}
                  onPreviewAttachment={previewAttachment}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {editor ? (
        <DirectoryEditorModal
          mode={editor.mode}
          draft={editor.draft}
          existingAttachments={editorAttachments}
          saving={saving}
          onChange={updateDraft}
          onClose={closeEditor}
          onSave={saveEditor}
          onPreviewAttachment={previewAttachment}
          onDeleteAttachment={deleteAttachment}
          stagedCard={stagedCard}
          stagedFiles={stagedFiles}
          onPickCard={setStagedCard}
          onClearCard={() => setStagedCard(null)}
          onPickFiles={pickStagedFiles}
          onRemoveStagedFile={(index) => setStagedFiles((prev) => prev.filter((_, i) => i !== index))}
        />
      ) : null}

      {importOpen ? (
        <ImportModal candidates={importCandidates} saving={saving} onClose={() => setImportOpen(false)} onImport={importSelected} />
      ) : null}

      {preview ? (
        <AttachmentPreviewModal attachment={preview.attachment} url={preview.url} loading={preview.loading} onClose={() => setPreview(null)} />
      ) : null}
    </div>
  );
}
