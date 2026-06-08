// Org / contact editor modal for the Marketing Directory page
// (src/kol/pages/MarketingDirectoryPage.jsx).
import React, { useRef } from "react";
import { C, fmtPhoneInput } from "../../../shared/theme";
import { I } from "../../../shared/icons";
import { Btn, Inp, Modal } from "../../../shared/ui";
import PlacesAddressInput from "../../PlacesAddressInput";
import {
  MARKETING_DIRECTORY_ATTACHMENT_ACCEPT,
  MARKETING_DIRECTORY_ORG_TYPE_OPTIONS,
  getDirectoryBusinessCard,
} from "../../marketingDirectoryData";
import { Glyph } from "./Glyph";
import { LABEL_STYLE, INLINE_INPUT, ICON_BTN_SM } from "./styles";
import { AttachmentChip, StagedFilePreview } from "./attachments";

export function DirectoryEditorModal({
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
              <PlacesAddressInput
                label="Address"
                value={draft.address_line_1}
                onChange={(v) => onChange("address_line_1", v)}
                onSelect={(parts) => {
                  onChange("address_line_1", parts.address_line_1 || "");
                  onChange("address_city", parts.address_city || "");
                  onChange("address_state", parts.address_state || "");
                  onChange("address_postal_code", parts.address_postal_code || "");
                  onChange("address_country", parts.address_country || "");
                  onChange("address", parts.address || "");
                  if (parts.google_place_id) onChange("google_place_id", parts.google_place_id);
                  if (parts.phone && !draft.phone) onChange("phone", parts.phone.replace(/\D/g, "").slice(0, 10));
                  if (parts.website && !draft.website) onChange("website", parts.website);
                }}
                placeholder="Start typing an address or business"
              />
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
