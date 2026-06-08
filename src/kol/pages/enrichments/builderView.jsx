import React from "react";
import { I } from "../../../shared/icons";
import { ENRICHMENT_FOCUS_LABELS, ENRICHMENT_VISUAL_THEMES } from "../../enrichments/enrichmentData";
import { draftToEvent } from "./eventDrafts";
import { Field, ProductEditor } from "./formFields";
import { EventDetail } from "./eventDetail";

export function BuilderView({ draft, setDraft, canManage, saving, selectedEvent, onSave, onDelete, onNew }) {
  const disabled = !canManage || saving;
  function update(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  return (
    <div className="builder-grid">
      <div className="builder-form">
        <div className="builder-header">
          <div>
            <div className="section-title">{selectedEvent ? "Edit Event" : "Create Event"}</div>
            <h2>{draft.title || "New enrichment event"}</h2>
          </div>
          <button type="button" className="secondary-btn" onClick={onNew} disabled={saving}><I.Plus /> Blank</button>
        </div>
        {!canManage ? <div className="inline-warning">Enrichment events are managed by enterprise admins. Your role has a read-only view.</div> : null}
        <div className="field-grid two">
          <Field label="Date"><input disabled={disabled} type="date" value={draft.event_date} onChange={(event) => update("event_date", event.target.value)} /></Field>
          <Field label="Title"><input disabled={disabled} value={draft.title} onChange={(event) => update("title", event.target.value)} placeholder="Pup Prom" /></Field>
          <Field label="Category"><input disabled={disabled} value={draft.category} onChange={(event) => update("category", event.target.value)} /></Field>
          <Field label="Price"><input disabled={disabled} type="number" min="0" value={draft.price} onChange={(event) => update("price", event.target.value)} /></Field>
          <Field label="Focus">
            <select disabled={disabled} value={draft.focus_area} onChange={(event) => update("focus_area", event.target.value)}>
              {Object.entries(ENRICHMENT_FOCUS_LABELS).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </Field>
          <Field label="Visual Theme">
            <select disabled={disabled} value={draft.visual_theme} onChange={(event) => update("visual_theme", event.target.value)}>
              {ENRICHMENT_VISUAL_THEMES.map((theme) => <option key={theme.id} value={theme.id}>{theme.label}</option>)}
            </select>
          </Field>
        </div>
        <label className="toggle-row">
          <input disabled={disabled} type="checkbox" checked={draft.customer_visible} onChange={(event) => update("customer_visible", event.target.checked)} />
          Include in customer-facing marketing handoff
        </label>
        <Field label="Summary"><textarea disabled={disabled} rows={3} value={draft.summary} onChange={(event) => update("summary", event.target.value)} /></Field>
        <Field label="SOP Details"><textarea disabled={disabled} rows={5} value={draft.sop_details} onChange={(event) => update("sop_details", event.target.value)} /></Field>
        <div className="field-grid two">
          <Field label="Setup Locations"><textarea disabled={disabled} rows={4} value={draft.setup_locations} onChange={(event) => update("setup_locations", event.target.value)} /></Field>
          <Field label="Checklist"><textarea disabled={disabled} rows={4} value={draft.checklist} onChange={(event) => update("checklist", event.target.value)} /></Field>
        </div>
        <Field label="Products">
          <ProductEditor
            disabled={disabled}
            value={draft.products}
            onChange={(value) => update("products", value)}
          />
          <small className="field-help">Add one product per row. Links become clean staff references throughout the portal.</small>
        </Field>
        <Field label="Staff Notes"><textarea disabled={disabled} rows={3} value={draft.staff_notes} onChange={(event) => update("staff_notes", event.target.value)} /></Field>
        <div className="form-actions">
          <button type="button" className="primary-btn" onClick={onSave} disabled={disabled}>{saving ? "Saving..." : "Save Event"}</button>
          {selectedEvent && canManage ? <button type="button" className="danger-btn" onClick={onDelete} disabled={saving}><I.Trash /> Remove</button> : null}
        </div>
      </div>
      <div className="builder-preview">
        <EventDetail event={draftToEvent(draft, "preview")} dayEvents={[]} onSelectEvent={() => {}} onEdit={() => {}} canManage={false} />
      </div>
    </div>
  );
}
