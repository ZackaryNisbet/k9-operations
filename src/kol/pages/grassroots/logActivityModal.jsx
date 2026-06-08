import React from "react";
import { C } from "../../../shared/theme";
import { I } from "../../../shared/icons";
import { Btn, Card, Modal, CalendarPicker } from "../../../shared/ui";
import {
  GRASSROOTS_VISIT_MATERIALS_OPTIONS,
  GRASSROOTS_ACTIVITY_ATTACHMENT_ACCEPT,
  GRASSROOTS_ACTIVITY_ATTACHMENT_MAX_FILES,
  getGrassrootsCategoryConfig,
  getGrassrootsBusinessCategory,
  parseGrassrootsMaterialsLeft,
  toggleGrassrootsMaterial,
  inferGrassrootsActivityAttachmentMimeType,
  formatGrassrootsAttachmentFileSize,
} from "../../grassrootsData";
import { INPUT_STYLE, Label } from "./primitives";
import { GooglePlacesBusinessInput } from "./addressInputs";

export function LogActivityModal({
  logModal,
  businessQuery,
  selectedTarget,
  businessDraft,
  internalOptions,
  notes,
  activityDate,
  nextDate,
  contactName,
  materialsLeft,
  outcome,
  followUpPriority,
  partnershipPotential,
  files,
  fileErrors,
  saving,
  fileInputRef,
  attachmentsSchemaMissing,
  onBusinessQueryChange,
  onInternalBusinessSelect,
  onGoogleBusinessSelect,
  onActivityDateChange,
  onNextDateChange,
  onContactNameChange,
  onMaterialsLeftChange,
  onOutcomeChange,
  onNotesChange,
  onFollowUpPriorityChange,
  onPartnershipPotentialChange,
  onFileChange,
  onRemoveFile,
  onClose,
  onSave,
}) {
  const isDropLog = (logModal?.category || getGrassrootsCategoryConfig(logModal?.target?.category).id) === "drops";
  const isEditingLog = Boolean(logModal?.activity?.id);
  const selectedSummary = selectedTarget
    ? [getGrassrootsBusinessCategory(selectedTarget), selectedTarget.address].filter(Boolean).join(" · ")
    : businessDraft
      ? [getGrassrootsBusinessCategory(businessDraft), businessDraft.address].filter(Boolean).join(" · ")
      : "";
  const title = isDropLog
    ? isEditingLog ? "Edit Visit" : "Log Visit"
    : getGrassrootsCategoryConfig(logModal?.target?.category).id === "events" ? "Log Event Comment" : "Log Development";
  const saveLabel = isEditingLog ? "Save Changes" : "Save Activity";

  const body = (
      <div className="grassroots-log-modal">
        {isDropLog && (
          <section className="grassroots-log-section">
            <div className="grassroots-log-section-title">Business</div>
            {logModal?.target ? (
              <div className="grassroots-log-selected-business">
                <strong>{logModal.target.name || "Visit business"}</strong>
                <span>{selectedSummary || "Existing K9 business"}</span>
              </div>
            ) : (
              <GooglePlacesBusinessInput
                label="Business"
                value={businessQuery}
                onChange={onBusinessQueryChange}
                onPlaceSelect={onGoogleBusinessSelect}
                internalOptions={internalOptions}
                onInternalSelect={onInternalBusinessSelect}
                internalLabel="K9 businesses"
                googleLabel={internalOptions.length > 0 ? "Create new from Google Places" : "Google Places"}
                placeholder="Search K9 businesses first, then Google"
              />
            )}
            {!logModal?.target && selectedSummary && (
              <div className="grassroots-log-selected-business is-compact">
                <I.CheckCircle />
                <span>{selectedSummary}</span>
              </div>
            )}
          </section>
        )}

        {isDropLog && (
          <section className="grassroots-log-section">
            <div className="grassroots-log-section-title">Visit</div>
            <div className="grassroots-log-grid">
              <div>
                <Label>Activity Date</Label>
                <CalendarPicker
                  value={activityDate}
                  onChange={onActivityDateChange}
                  extraContent={<div style={{ fontSize: 11, color: C.textMut, lineHeight: 1.4 }}>Use today unless you are backfilling field notes.</div>}
                />
              </div>
              <label>
                <Label>Who did you speak with?</Label>
                <input
                  value={contactName}
                  onChange={(event) => onContactNameChange(event.target.value)}
                  placeholder="Person's name"
                  style={INPUT_STYLE}
                  autoFocus={Boolean(logModal?.target)}
                />
              </label>
            </div>
            <div style={{ marginTop: 12 }}>
              <Label>Materials Left</Label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 5 }}>
                {(() => {
                  const selected = parseGrassrootsMaterialsLeft(materialsLeft);
                  const selectedLower = new Set(selected.map((s) => s.toLowerCase()));
                  const extras = selected.filter((s) => !GRASSROOTS_VISIT_MATERIALS_OPTIONS.some((o) => o.toLowerCase() === s.toLowerCase()));
                  return [...GRASSROOTS_VISIT_MATERIALS_OPTIONS, ...extras].map((opt) => {
                    const on = selectedLower.has(opt.toLowerCase());
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => onMaterialsLeftChange(toggleGrassrootsMaterial(materialsLeft, opt))}
                        style={{ padding: "4px 10px", borderRadius: 999, border: `1.5px solid ${on ? C.pri : C.border}`, background: on ? C.priLt : "transparent", color: on ? C.pri : C.textSec, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
                      >
                        {opt}
                      </button>
                    );
                  });
                })()}
              </div>
            </div>
            <div className="grassroots-log-followup-date" style={{ marginTop: 12 }}>
              <Label>Follow-Up Date (optional)</Label>
              <CalendarPicker
                value={nextDate}
                onChange={onNextDateChange}
                extraContent={<div style={{ fontSize: 11, color: C.textMut, lineHeight: 1.4 }}>Set a date if this visit needs a follow-up.</div>}
              />
            </div>
          </section>
        )}

        <section className="grassroots-log-section">
          <div className="grassroots-log-section-title">{isDropLog ? "Visit Notes" : "Update / Outreach Log"}</div>

          {/* For Events (Grassroots development): larger, prominent note area + Next Follow-Up Date below it (per user request) */}
          {!isDropLog ? (
            <>
              <textarea
                value={notes}
                onChange={(event) => onNotesChange(event.target.value)}
                placeholder="Notes about this outreach / development..."
                rows={6}
                style={{ ...INPUT_STYLE, minHeight: 140, resize: "vertical" }}
                autoFocus
              />

              <div style={{ marginTop: 14 }}>
                <Label>Next Follow-Up Date (optional)</Label>
                <CalendarPicker
                  value={nextDate}
                  onChange={onNextDateChange}
                />
              </div>
            </>
          ) : (
            // Drops: outcome + notes are one field. Quick-fill chips seed the common
            // visit archetypes; everything stays editable, and you can write a longer
            // note when a visit actually matters (a follow-up, event, or partnership lead).
            <>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
                {[
                  { label: "Routine drop-off", text: "Routine drop-off — left materials, friendly chat." },
                  { label: "Went well", text: "Went well — " },
                  { label: "Went poorly", text: "Went poorly — " },
                ].map((q) => (
                  <button
                    key={q.label}
                    type="button"
                    onClick={() => onNotesChange(notes && notes.trim() ? `${notes.trim()} ${q.text}` : q.text)}
                    style={{ padding: "3px 9px", borderRadius: 999, border: `1.5px solid ${C.border}`, background: "transparent", color: C.textSec, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
              <textarea
                value={notes}
                onChange={(event) => onNotesChange(event.target.value)}
                placeholder="What happened? A quick outcome, or a longer note if you need to follow up."
                rows={4}
                style={{ ...INPUT_STYLE, minHeight: 108, resize: "vertical" }}
              />
            </>
          )}
        </section>

        {isDropLog && !isEditingLog && (
          <section className="grassroots-log-section">
            <div className="grassroots-log-section-title">Photos and Attachments</div>
            {attachmentsSchemaMissing && (
              <div className="grassroots-log-warning">Attachment storage migration has not been applied in this Supabase environment yet.</div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={GRASSROOTS_ACTIVITY_ATTACHMENT_ACCEPT}
              onChange={onFileChange}
              style={{ display: "none" }}
            />
            <div className="grassroots-log-attachments-toolbar">
              <Btn
                variant="secondary"
                size="sm"
                icon={<I.Camera />}
                onClick={() => fileInputRef.current?.click()}
                disabled={files.length >= GRASSROOTS_ACTIVITY_ATTACHMENT_MAX_FILES || attachmentsSchemaMissing}
              >
                Add Photo/File
              </Btn>
              <span>{files.length === 0 ? "Attach business cards, photos, or PDFs." : `${files.length} pending attachment${files.length === 1 ? "" : "s"}`}</span>
            </div>
            {files.length > 0 && (
              <div className="grassroots-log-pending-files">
                {files.map((file, index) => (
                  <span key={`${file.name}-${index}`}>
                    {inferGrassrootsActivityAttachmentMimeType(file).startsWith("image/") ? <I.Image /> : <I.FileText />}
                    <strong>{file.name}</strong>
                    <em>{formatGrassrootsAttachmentFileSize(file.size)}</em>
                    <button type="button" onClick={() => onRemoveFile(index)} aria-label={`Remove ${file.name}`}><I.X /></button>
                  </span>
                ))}
              </div>
            )}
            {fileErrors.length > 0 && <div className="grassroots-log-errors">{fileErrors.join(" ")}</div>}
          </section>
        )}

        {!isDropLog && (
          <div className="grassroots-log-actions">
            <Btn variant="ghost" onClick={onClose} disabled={saving}>Cancel</Btn>
            <Btn variant="primary" onClick={onSave} disabled={saving}>{saving ? "Saving..." : saveLabel}</Btn>
          </div>
        )}
      </div>
  );

  if (isDropLog) {
    return (
      <div className="grassroots-log-composer">
        <Card style={{ padding: 0, overflow: "visible", position: "relative", border: `1.5px solid ${C.pri}30`, boxShadow: "0 16px 40px rgba(20,83,45,0.10)", animation: "grassrootsComposerIn 0.38s cubic-bezier(0.16,1,0.3,1)" }}>
          <div className="grassroots-log-composer-header">
            <div>
              <div className="grassroots-log-composer-kicker">{title}</div>
              <div className="grassroots-log-composer-subtitle">{isEditingLog ? "Original values stay available in History." : "Save collapses this into the activity row."}</div>
            </div>
            <div className="grassroots-log-composer-actions">
              <Btn variant="ghost" size="sm" onClick={onClose} disabled={saving}>Cancel</Btn>
              <Btn variant="primary" size="sm" onClick={onSave} disabled={saving}>{saving ? "Saving..." : saveLabel}</Btn>
            </div>
          </div>
          <div className="grassroots-log-composer-body">
            {body}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <Modal title={title} onClose={saving ? () => {} : onClose} wide>
      {body}
    </Modal>
  );
}
