// Marketing Directory (Linear K9-11) — organizations + affiliated contacts for
// marketing outreach. Organizations hold many contacts; a contact with no org is a
// standalone individual (the org-vs-individual pill filter). Business cards and
// files attach to either; a History subtab shows the change log. The directory
// cross-references the grassroots marketing tracker: "Import from tracker" pulls in
// event organizers + visited/partnership businesses, and saving a linked org writes
// its contact fields back to the tracker.
//
// The list surfaces (directory + history) compose the shared THE-STANDARD chrome
// from ../../shared/listSurface (ListSurfaceTitle / ListTabBar / ListSearchRow /
// PillFilter / ListExplainer / DenseTable) — the same primitives Labor, Resort
// Upkeep, and Grassroots use. All data/UI rules live in ../marketingDirectoryData.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../supabaseClient";
import { C, fmtPhoneInput } from "../../shared/theme";
import { I } from "../../shared/icons";
import { Btn, Inp, Modal } from "../../shared/ui";
import {
  CountButton,
  DenseTable,
  IconButton,
  ListExplainer,
  ListSearchRow,
  ListSurfaceTitle,
  ListTabBar,
  RowActionButton,
  StatusPill,
} from "../../shared/listSurface";
import { hasLeanPermission } from "../../shared/permissions";
import { normalizeOptionalUuid } from "../trainingData";
import {
  MARKETING_DIRECTORY_ATTACHMENT_ACCEPT,
  MARKETING_DIRECTORY_ATTACHMENT_BUCKET,
  MARKETING_DIRECTORY_ORG_TYPE_OPTIONS,
  buildDirectoryAttachmentPath,
  buildDirectoryContactPayload,
  buildDirectoryEntries,
  buildDirectoryImportCandidates,
  buildDirectoryNotePayload,
  buildDirectoryOrgPayload,
  buildDirectoryUpdatesFeed,
  buildGrassrootsTargetWriteback,
  countDirectoryPairedTargets,
  getDirectoryLastInteractedAt,
  diffDirectoryPeople,
  makeOrgDraftFromIndividual,
  filterDirectoryEntries,
  formatDirectoryFileSize,
  getDirectoryAttachmentPreviewKind,
  getDirectoryBusinessCard,
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

function fmtDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function fmtDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

const MUTED = { color: C.textMut, fontSize: 11 };

const LABEL_STYLE = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  color: C.textSec,
  marginBottom: 4,
  letterSpacing: "0.03em",
  textTransform: "uppercase",
};

const INLINE_INPUT = {
  flex: 1,
  minWidth: 0,
  width: "100%",
  padding: "7px 10px",
  border: `1.5px solid ${C.border}`,
  borderRadius: 8,
  fontSize: 13,
  fontFamily: "inherit",
  color: C.text,
  background: C.surface,
  outline: "none",
  boxSizing: "border-box",
};

const ICON_BTN_SM = {
  border: `1px solid ${C.border}`,
  background: C.surface,
  borderRadius: 8,
  cursor: "pointer",
  color: C.textMut,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 32,
  height: 32,
  padding: 0,
  flexShrink: 0,
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
  people,
  onAddPerson,
  onChangePerson,
  onRemovePerson,
  onConvertToOrg,
}) {
  const isOrg = mode === "org";
  const cardInputRef = useRef(null);
  const filesInputRef = useRef(null);
  const existingCard = getDirectoryBusinessCard(existingAttachments);
  const existingFiles = (existingAttachments || []).filter((att) => att.attachment_type !== "business_card");
  const title = draft.isDraft ? (isOrg ? "Add organization" : "Add contact") : (isOrg ? "Edit organization" : "Edit contact");
  const canSave = isOrg ? Boolean(String(draft.name || "").trim()) : Boolean(String(draft.first_name || "").trim() || String(draft.last_name || "").trim());
  const canConvert = !isOrg && !draft.isDraft;

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

            {/* People — add as many contacts at this organization as needed */}
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={LABEL_STYLE}>People{people.length ? ` (${people.length})` : ""}</span>
                <Btn variant="secondary" size="sm" icon={<Glyph icon={I.Plus} size={13} />} onClick={onAddPerson} style={{ padding: "4px 10px" }}>Add person</Btn>
              </div>
              {people.length === 0 ? (
                <div style={{ fontSize: 12, color: C.textMut, fontStyle: "italic" }}>No people yet — add the contacts who work at this organization.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {people.map((p, i) => (
                    <div key={p._key || p.id || i} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 10, background: C.surfaceHover, display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input placeholder="First name" value={p.first_name || ""} onChange={(e) => onChangePerson(i, "first_name", e.target.value)} style={INLINE_INPUT} />
                        <input placeholder="Last name" value={p.last_name || ""} onChange={(e) => onChangePerson(i, "last_name", e.target.value)} style={INLINE_INPUT} />
                        <button type="button" onClick={() => onRemovePerson(i)} title="Remove person" style={ICON_BTN_SM}><Glyph icon={I.Trash} size={13} /></button>
                      </div>
                      <input placeholder="Title / role" value={p.title || ""} onChange={(e) => onChangePerson(i, "title", e.target.value)} style={INLINE_INPUT} />
                      <div style={{ display: "flex", gap: 8 }}>
                        <input placeholder="Email" value={p.email || ""} onChange={(e) => onChangePerson(i, "email", e.target.value)} style={INLINE_INPUT} />
                        <input placeholder="Phone" value={fmtPhoneInput(p.phone || "")} onChange={(e) => onChangePerson(i, "phone", e.target.value.replace(/\D/g, "").slice(0, 10))} maxLength={14} style={INLINE_INPUT} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
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

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, borderTop: `1px solid ${C.borderLight}`, paddingTop: 16 }}>
          <div>
            {canConvert ? <Btn variant="secondary" onClick={onConvertToOrg} disabled={saving}>Convert to organization</Btn> : null}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Btn variant="ghost" onClick={onClose} disabled={saving}>Cancel</Btn>
            <Btn variant="primary" onClick={onSave} disabled={saving || !canSave} icon={saving ? null : <Glyph icon={I.Check} size={15} />}>{saving ? "Saving…" : "Save"}</Btn>
          </div>
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
      <StatusPill tone={candidate.kind === "org" ? "primary" : "info"}>{label}</StatusPill>
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

// Affiliated-contact + attachment block shown beneath an expanded directory row.
function DirectoryExpansion({ entry, canManage, onAddContact, onEditContact, onDeleteContact, onPreviewAttachment }) {
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

// ─── per-org Updates feed (notes + activity), like the tracker's updates column ─
function UpdatesModal({ org, feed, noteDraft, onNoteDraftChange, onAddNote, onDeleteNote, savingNote, canManage, onClose }) {
  return (
    <Modal title={`Updates · ${getDirectoryOrgName(org)}`} onClose={onClose} wide>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {canManage ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <textarea
              value={noteDraft}
              onChange={(e) => onNoteDraftChange(e.target.value)}
              placeholder="Leave an update — a call, a drop, a follow-up…"
              rows={2}
              style={{ ...INLINE_INPUT, resize: "vertical", minHeight: 56, padding: "10px 12px" }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Btn variant="primary" size="sm" onClick={onAddNote} disabled={savingNote || !noteDraft.trim()}>{savingNote ? "Posting…" : "Post update"}</Btn>
            </div>
          </div>
        ) : null}
        {feed.length === 0 ? (
          <div style={{ fontSize: 13, color: C.textMut, padding: "8px 2px" }}>No updates yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "52vh", overflowY: "auto" }}>
            {feed.map((row) => (
              <div key={row.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px", border: `1px solid ${C.border}`, borderRadius: 10, background: row.kind === "note" ? C.surface : C.surfaceHover }}>
                <StatusPill tone={row.kind === "note" ? "primary" : "neutral"}>{row.kind === "note" ? "Note" : "System"}</StatusPill>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: C.text, whiteSpace: "pre-wrap", lineHeight: 1.4, wordBreak: "break-word" }}>{row.text}</div>
                  <div style={{ marginTop: 3, fontSize: 11, color: C.textMut }}>{row.by} · {fmtDateTime(row.at)}</div>
                </div>
                {canManage && row.kind === "note" ? (
                  <button type="button" onClick={() => onDeleteNote(row.noteId)} title="Remove update" style={{ border: "none", background: "transparent", cursor: "pointer", color: C.textMut, display: "flex", padding: 2, flexShrink: 0 }}><Glyph icon={I.Trash} size={13} /></button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
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
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [schemaMissing, setSchemaMissing] = useState(false);

  const [orgs, setOrgs] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [history, setHistory] = useState([]);
  const [targets, setTargets] = useState([]);
  const [notes, setNotes] = useState([]);

  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [editor, setEditor] = useState(null); // { mode, draft }
  const [stagedCard, setStagedCard] = useState(null);
  const [stagedFiles, setStagedFiles] = useState([]);
  const [editorPeople, setEditorPeople] = useState([]);
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [preview, setPreview] = useState(null); // { attachment, url, loading }
  const [updatesOrg, setUpdatesOrg] = useState(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);

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
      supabase.from("marketing_directory_notes").select("*").eq("location_id", locationId).is("deleted_at", null).order("created_at", { ascending: false }).limit(500),
    ]);

    const missing = (err) => err?.code === "42P01" || err?.code === "PGRST205" || /marketing_directory_/.test(err?.message || "");
    if (orgRes.error || contactRes.error) {
      if (missing(orgRes.error) || missing(contactRes.error)) {
        setSchemaMissing(true);
      } else {
        console.error("Failed to load marketing directory", orgRes.error || contactRes.error);
        toast((orgRes.error || contactRes.error).message || "Failed to load directory", "error");
      }
      setOrgs([]); setContacts([]); setAttachments([]); setHistory([]); setTargets([]); setNotes([]);
      setLoading(false);
      return;
    }

    setOrgs(orgRes.data || []);
    setContacts(contactRes.data || []);
    setAttachments(attRes.error ? [] : (attRes.data || []));
    setHistory(histRes.error ? [] : (histRes.data || []));
    // Tracker read is best-effort: it only powers the Import dialog.
    setTargets(targetRes.error ? [] : (targetRes.data || []));
    setNotes(notesRes.error ? [] : (notesRes.data || []));
    setLoading(false);
  }, [locationId, toast]);

  useEffect(() => { loadDirectory(); }, [loadDirectory]);

  const attachmentsByEntity = useMemo(() => groupDirectoryAttachments(attachments), [attachments]);
  const entries = useMemo(() => buildDirectoryEntries({ orgs, contacts, attachmentsByEntity }), [orgs, contacts, attachmentsByEntity]);
  const visibleEntries = useMemo(() => filterDirectoryEntries(entries, { entryType: "organizations", query }), [entries, query]);
  const counts = useMemo(() => {
    const summary = summarizeDirectory(orgs, contacts);
    return { ...summary, total: summary.organizations };
  }, [orgs, contacts]);
  // People not attached to an org — surfaced as a cleanup tray, not directory rows.
  const unassignedContacts = useMemo(() => contacts.filter((c) => !c.org_id), [contacts]);

  const importCandidates = useMemo(
    () => buildDirectoryImportCandidates({ targets, existingOrgs: orgs, existingContacts: contacts }),
    [targets, orgs, contacts],
  );
  const importCount = importCandidates.orgs.length + importCandidates.individuals.length;

  const toggleExpand = useCallback((id) => setExpandedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  }), []);

  // ── editor lifecycle ──
  const openOrgEditor = (org) => {
    setStagedCard(null); setStagedFiles([]);
    setEditorPeople(org
      ? contacts.filter((c) => c.org_id === org.id).map((c) => ({ id: c.id, first_name: c.first_name || "", last_name: c.last_name || "", title: c.title || "", email: c.email || "", phone: c.phone || "" }))
      : []);
    setEditor({ mode: "org", draft: org ? { ...org, isDraft: false } : makeBlankDirectoryOrg(locationId) });
  };
  const openContactEditor = (contact, orgId = null) => { setStagedCard(null); setStagedFiles([]); setEditorPeople([]); setEditor({ mode: "contact", draft: contact ? { ...contact, isDraft: false } : makeBlankDirectoryContact(locationId, orgId) }); };
  const closeEditor = () => { setEditor(null); setStagedCard(null); setStagedFiles([]); setEditorPeople([]); };
  const updateDraft = (key, value) => setEditor((prev) => (prev ? { ...prev, draft: { ...prev.draft, [key]: value } } : prev));
  const addPerson = () => setEditorPeople((prev) => [...prev, { _key: `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`, first_name: "", last_name: "", title: "", email: "", phone: "" }]);
  const changePerson = (index, key, value) => setEditorPeople((prev) => prev.map((p, i) => (i === index ? { ...p, [key]: value } : p)));
  const removePerson = (index) => setEditorPeople((prev) => prev.filter((_, i) => i !== index));

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
        // Persist the inline People list: insert new, update edited, delete removed.
        const originalPeople = draft.isDraft ? [] : contacts.filter((c) => c.org_id === entityId);
        const { toInsert, toUpdate, toDeleteIds } = diffDirectoryPeople(originalPeople, editorPeople);
        for (const row of toInsert) {
          const { error } = await supabase.from("marketing_directory_contacts").insert(buildDirectoryContactPayload({ ...row, org_id: entityId, isDraft: true }, locationId, actor));
          if (error) throw error;
        }
        for (const row of toUpdate) {
          const { error } = await supabase.from("marketing_directory_contacts").update(buildDirectoryContactPayload({ ...row, org_id: entityId, isDraft: false }, locationId, actor)).eq("id", row.id);
          if (error) throw error;
        }
        if (toDeleteIds.length) {
          const { error } = await supabase.from("marketing_directory_contacts").delete().in("id", toDeleteIds);
          if (error) throw error;
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

      if (mode === "org" && draft.isDraft && entityId) setExpandedIds((prev) => new Set(prev).add(entityId));
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

  // Promote a standalone individual into an organization (so it can hold people).
  const convertToOrg = async (contact) => {
    if (!contact?.id || !locationId) return;
    if (typeof window !== "undefined" && !window.confirm(`Convert “${getDirectoryContactName(contact)}” into an organization? You can then add people to it.`)) return;
    setSaving(true);
    try {
      const payload = buildDirectoryOrgPayload(makeOrgDraftFromIndividual(contact, locationId), locationId, actor);
      const { data, error } = await supabase.from("marketing_directory_orgs").insert(payload).select("*").single();
      if (error) throw error;
      const { error: delErr } = await supabase.from("marketing_directory_contacts").delete().eq("id", contact.id);
      if (delErr) throw delErr;
      await loadDirectory();
      closeEditor();
      setExpandedIds((prev) => new Set(prev).add(data.id));
      toast("Converted to organization");
    } catch (err) {
      console.error("Convert failed", err);
      toast(err?.message || "Failed to convert", "error");
    } finally {
      setSaving(false);
    }
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

  // ── per-org Updates feed (notes + activity) ──
  const openUpdates = (org) => { setNoteDraft(""); setUpdatesOrg(org); };
  const addNote = async () => {
    const body = noteDraft.trim();
    if (!body || !updatesOrg || !locationId) return;
    setSavingNote(true);
    try {
      const { error } = await supabase.from("marketing_directory_notes").insert(buildDirectoryNotePayload(body, locationId, actor, { orgId: updatesOrg.id }));
      if (error) throw error;
      setNoteDraft("");
      await loadDirectory();
      toast("Update added");
    } catch (err) {
      console.error("Add note failed", err);
      toast(err?.message || "Failed to add update", "error");
    } finally {
      setSavingNote(false);
    }
  };
  const deleteNote = async (noteId) => {
    const { error } = await supabase.from("marketing_directory_notes").update({ deleted_at: new Date().toISOString(), deleted_by_user_id: actor.userId || null, deleted_by_name: actor.name || null }).eq("id", noteId);
    if (error) { toast(error.message || "Failed to remove update", "error"); return; }
    setNotes((prev) => prev.filter((note) => note.id !== noteId));
    toast("Update removed");
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

  // Stop a row-level action from also toggling the row's expansion.
  const rowAction = (fn) => (ev) => { if (ev) ev.stopPropagation(); fn(); };

  // ── Directory table columns (shared DenseTable) — organizations only ──
  const directoryColumns = [
    {
      key: "name",
      header: "Name",
      width: "minmax(190px, 2fr)",
      sortable: true,
      sortValue: (e) => e.sortName,
      render: (e) => {
        const sub = getDirectoryOrgAddressText(e.org);
        return (
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, color: C.text, fontSize: 12, lineHeight: 1.25, wordBreak: "break-word" }}>{getDirectoryOrgName(e.org)}</div>
            {sub ? <div style={{ marginTop: 2, fontSize: 11, color: C.textMut, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div> : null}
          </div>
        );
      },
    },
    {
      key: "type",
      header: "Type",
      width: 132,
      sortable: true,
      sortValue: (e) => e.org.org_type || "~",
      render: (e) => (e.org.org_type ? <StatusPill tone="primary">{e.org.org_type}</StatusPill> : <span style={MUTED}>—</span>),
    },
    {
      key: "contact",
      header: "Contact",
      width: "minmax(150px, 1.3fr)",
      render: (e) => {
        const { phone, email } = e.org;
        if (!phone && !email) return <span style={MUTED}>—</span>;
        return (
          <div style={{ minWidth: 0, fontSize: 11, lineHeight: 1.4 }}>
            {phone ? <div style={{ color: C.text, fontWeight: 600, whiteSpace: "nowrap" }}>{fmtPhoneInput(phone)}</div> : null}
            {email ? <div style={{ color: C.textMut, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{email}</div> : null}
          </div>
        );
      },
    },
    {
      key: "contacts",
      header: "Contacts",
      width: 80,
      align: "center",
      sortable: true,
      sortValue: (e) => e.contacts.length,
      render: (e) => <span style={{ fontSize: 12, fontWeight: 700, color: e.contacts.length ? C.text : C.textMut }}>{e.contacts.length}</span>,
    },
    {
      key: "events",
      header: "Events",
      width: 76,
      align: "center",
      sortable: true,
      sortValue: (e) => countDirectoryPairedTargets(e.org, targets),
      headerTitle: "Paired marketing-tracker events / visits / partnerships",
      render: (e) => {
        const n = countDirectoryPairedTargets(e.org, targets);
        return <span style={{ fontSize: 12, fontWeight: 700, color: n ? C.text : C.textMut }}>{n}</span>;
      },
    },
    {
      key: "last",
      header: "Last interacted",
      width: "minmax(118px, 1fr)",
      sortable: true,
      sortValue: (e) => getDirectoryLastInteractedAt(e.org, { history, targets }) || "",
      render: (e) => {
        const last = getDirectoryLastInteractedAt(e.org, { history, targets });
        return <span style={{ fontSize: 11, color: C.textMut, whiteSpace: "nowrap" }}>{last ? fmtDate(last) : "—"}</span>;
      },
    },
    {
      key: "updates",
      header: "Updates",
      width: 84,
      align: "center",
      sortable: true,
      headerTitle: "Notes + activity on this organization",
      sortValue: (e) => buildDirectoryUpdatesFeed(e.org, { notes, history }).length,
      render: (e) => {
        const count = buildDirectoryUpdatesFeed(e.org, { notes, history }).length;
        return <CountButton count={count} active={false} title="View / add updates" onClick={rowAction(() => openUpdates(e.org))} />;
      },
    },
    {
      key: "actions",
      header: "",
      width: 76,
      align: "end",
      render: (e) => (canManage ? (
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
          <IconButton tone="primary" title="Edit organization" icon={<Glyph icon={I.Pencil} size={12} />} onClick={rowAction(() => openOrgEditor(e.org))} />
          <IconButton tone="danger" title="Delete organization" icon={<Glyph icon={I.Trash} size={12} />} onClick={rowAction(() => deleteOrg(e.org))} />
        </div>
      ) : null),
    },
  ];

  // ── History table columns (shared DenseTable) ──
  const historyColumns = [
    {
      key: "when",
      header: "When",
      width: 150,
      sortable: true,
      sortValue: (r) => r.event_at || "",
      render: (r) => <span style={{ fontSize: 11, fontWeight: 700, color: C.textSec, whiteSpace: "nowrap" }}>{fmtDateTime(r.event_at)}</span>,
    },
    {
      key: "action",
      header: "Action",
      width: 112,
      sortable: true,
      sortValue: (r) => r.event_type || "",
      render: (r) => <StatusPill tone={r.event_type === "created" ? "success" : r.event_type === "deleted" ? "danger" : "info"}>{getDirectoryHistoryEventLabel(r.event_type)}</StatusPill>,
    },
    {
      key: "record",
      header: "Record",
      width: "minmax(180px, 2fr)",
      sortable: true,
      sortValue: (r) => String(r.entity_name || "").toLowerCase(),
      render: (r) => (
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: C.text, fontSize: 12, wordBreak: "break-word" }}>{r.entity_name || "Untitled record"}</div>
          <div style={{ marginTop: 2, fontSize: 11, color: C.textMut }}>{r.entity_type === "org" ? "Organization" : "Contact"}</div>
        </div>
      ),
    },
    {
      key: "by",
      header: "By",
      width: "minmax(120px, 1fr)",
      sortable: true,
      sortValue: (r) => String(r.changed_by_name || "").toLowerCase(),
      render: (r) => <span style={{ fontSize: 11, color: C.textSec }}>{r.changed_by_name || "Unknown"}</span>,
    },
  ];

  const titleActions = canManage && !schemaMissing ? (
    <>
      {importCount > 0 ? <Btn variant="secondary" icon={<Glyph icon={I.Download} size={15} />} onClick={() => setImportOpen(true)}>Import from tracker ({importCount})</Btn> : null}
      <Btn variant="primary" icon={<Glyph icon={I.Plus} size={15} />} onClick={() => openOrgEditor(null)}>Add organization</Btn>
    </>
  ) : null;

  const schemaNotice = (
    <div style={{ marginTop: 12, padding: "20px 18px", border: `1px solid ${C.warn}55`, borderRadius: 12, background: C.warnLt, fontSize: 13, color: C.textSec }}>
      <strong style={{ color: C.text }}>Directory tables aren’t set up yet.</strong> Run the latest database migration to create the marketing directory, then refresh.
    </div>
  );

  // ── render ──
  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "8px 0 48px" }}>
      <style>{`.md-glyph > svg { width: 100%; height: 100%; display: block; }`}</style>

      <ListSurfaceTitle actions={titleActions}>Marketing Directory</ListSurfaceTitle>

      <ListTabBar
        tabs={[{ id: "directory", label: "Directory", count: counts.total }, { id: "history", label: "History", count: history.length }]}
        activeId={tab}
        onChange={setTab}
      />

      {schemaMissing ? (
        schemaNotice
      ) : loading ? (
        <div style={{ padding: "40px 16px", textAlign: "center", color: C.textMut, fontSize: 13 }}>Loading directory…</div>
      ) : tab === "directory" ? (
        <>
          <ListSearchRow value={query} onChange={setQuery} placeholder="Search organizations, people, type…" />
          <ListExplainer>
            Organizations and their affiliated contacts for marketing outreach. “Import from tracker” pulls in event organizers and visited businesses; saving a linked org syncs its contact info back.
          </ListExplainer>
          {unassignedContacts.length ? (
            <div style={{ marginTop: 12, padding: "10px 14px", border: `1px solid ${C.warn}55`, borderRadius: 12, background: C.warnLt }}>
              <div style={{ fontSize: 12.5, color: C.textSec, fontWeight: 600, marginBottom: 8 }}>
                {unassignedContacts.length} {unassignedContacts.length === 1 ? "person isn’t" : "people aren’t"} attached to an organization yet — every person belongs to an org.
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {unassignedContacts.map((c) => (
                  <div key={c.id} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "4px 6px 4px 12px", border: `1px solid ${C.border}`, borderRadius: 999, background: C.surface }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{getDirectoryContactName(c)}</span>
                    {canManage ? <RowActionButton tone="primary" onClick={() => convertToOrg(c)}>Make org</RowActionButton> : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          <div style={{ marginTop: 12 }}>
            <DenseTable
              columns={directoryColumns}
              rows={visibleEntries}
              getRowKey={(e) => `${e.kind}:${e.id}`}
              minWidth={1000}
              onRowClick={(e) => toggleExpand(e.id)}
              isRowExpanded={(e) => expandedIds.has(e.id)}
              renderExpansion={(e) => (
                <DirectoryExpansion
                  entry={e}
                  canManage={canManage}
                  onAddContact={(org) => openContactEditor(null, org.id)}
                  onEditContact={(contact) => openContactEditor(contact, contact.org_id)}
                  onDeleteContact={deleteContact}
                  onPreviewAttachment={previewAttachment}
                />
              )}
              defaultSort={{ key: "name", direction: "asc" }}
              emptyText={entries.length === 0
                ? "Your directory is empty — add an organization or individual, or import from the marketing tracker."
                : "No matches for the current filter."}
            />
          </div>
        </>
      ) : (
        <>
          <ListExplainer>Every change to the directory — additions, edits, and removals, with who made each change and when.</ListExplainer>
          <div style={{ marginTop: 12 }}>
            <DenseTable
              columns={historyColumns}
              rows={history}
              getRowKey={(r) => r.id}
              minWidth={560}
              defaultSort={{ key: "when", direction: "desc" }}
              emptyText="No changes recorded yet."
            />
          </div>
        </>
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
          people={editorPeople}
          onAddPerson={addPerson}
          onChangePerson={changePerson}
          onRemovePerson={removePerson}
          onConvertToOrg={() => convertToOrg(editor.draft)}
        />
      ) : null}

      {importOpen ? (
        <ImportModal candidates={importCandidates} saving={saving} onClose={() => setImportOpen(false)} onImport={importSelected} />
      ) : null}

      {preview ? (
        <AttachmentPreviewModal attachment={preview.attachment} url={preview.url} loading={preview.loading} onClose={() => setPreview(null)} />
      ) : null}

      {updatesOrg ? (
        <UpdatesModal
          org={updatesOrg}
          feed={buildDirectoryUpdatesFeed(updatesOrg, { notes, history })}
          noteDraft={noteDraft}
          onNoteDraftChange={setNoteDraft}
          onAddNote={addNote}
          onDeleteNote={deleteNote}
          savingNote={savingNote}
          canManage={canManage}
          onClose={() => setUpdatesOrg(null)}
        />
      ) : null}
    </div>
  );
}
