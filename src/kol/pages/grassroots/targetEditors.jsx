import React, { useEffect } from "react";
import { C } from "../../../shared/theme";
import { I } from "../../../shared/icons";
import { Btn, Card, CalendarPicker } from "../../../shared/ui";
import {
  GRASSROOTS_BUSINESS_CATEGORY_OPTIONS,
  normalizeGrassrootsStatus,
  normalizeGrassrootsEventLinks,
  calculateGrassrootsCpl,
} from "../../grassrootsData";
import { fmtCurrencyNumber } from "./dateUtils";
import { usesBusinessCategoryColumn } from "./columns";
import { FormSection } from "./formSection";
import { Label } from "./primitives";
import { StatusPicker, ActiveToggle, EventTypePicker, FieldEditor } from "./formControls";
import { GooglePlacesBusinessInput, OrganizerAutocomplete, SplitAddressFields } from "./addressInputs";
import { EventDateEditor, EventLinksEditor } from "./eventEditors";
import { ActivityList } from "./activityList";

export function TargetEditor({ draft, categoryConfig, saving, activities = [], attachmentsByActivity = {}, canLog = false, onChange, onSave, onCancel, onDelete, onLog, onPreviewAttachment, previewingAttachmentId }) {
  const categoryId = categoryConfig.id;
  const changeStatus = (value) => {
    const status = normalizeGrassrootsStatus(value);
    onChange("status", status);
    if (status === "abandoned") onChange("is_active", false);
    else if (normalizeGrassrootsStatus(draft.status) === "abandoned") onChange("is_active", true);
  };
  const applyPlaceAddress = (parts) => {
    Object.entries(parts || {}).forEach(([key, value]) => onChange(key, value || ""));
  };
  const applyBusinessPlace = (parts) => {
    Object.entries(parts || {}).forEach(([key, value]) => {
      if (["name", "contact_phone", "website"].includes(key)) return;
      if (["business_category", "drop_category"].includes(key)) return;
      onChange(key, value || "");
    });
    if (parts?.name) onChange("name", parts.name);
    const inferredCategory = String(parts?.business_category || parts?.drop_category || "").trim();
    if (inferredCategory && usesBusinessCategoryColumn(categoryConfig)) {
      onChange("business_category", inferredCategory);
      onChange("drop_category", inferredCategory);
    }
    if (parts?.contact_phone && !String(draft.contact_phone || "").trim()) onChange("contact_phone", parts.contact_phone);
    if (parts?.website) {
      const existingDetails = draft.details && typeof draft.details === "object" ? draft.details : {};
      const currentLinks = normalizeGrassrootsEventLinks(draft);
      const hasWebsiteLink = currentLinks.some((link) => String(link.url || "").trim() === parts.website);
      if (!hasWebsiteLink) {
        onChange("details", {
          ...existingDetails,
          links: [
            ...currentLinks,
            { id: `business_link_${Date.now()}`, label: "Website", url: parts.website },
          ],
        });
      }
    }
  };

  return (
    <Card style={{ padding: 0, overflow: "visible", position: "relative", border: `1.5px solid ${C.pri}30`, boxShadow: "0 16px 40px rgba(20,83,45,0.10)", animation: "grassrootsComposerIn 0.38s cubic-bezier(0.16,1,0.3,1)" }}>
      <div style={{ padding: "16px 18px", borderBottom: `1px solid ${C.borderLight}`, background: `linear-gradient(135deg, ${C.priLt} 0%, #fff 70%)` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 900, color: C.pri, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {draft.isDraft ? `New ${categoryConfig.singular}` : `Edit ${categoryConfig.singular}`}
            </div>
            <div style={{ marginTop: 4, fontSize: 13, color: C.textMut }}>
              Save collapses this into the tracker row.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn variant="ghost" size="sm" onClick={onCancel}>Cancel</Btn>
            <Btn variant="primary" size="sm" onClick={onSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Btn>
          </div>
        </div>
      </div>
      <div className="grassroots-target-inline-body">
        <div className="grassroots-target-form-grid">
          <FormSection title={categoryConfig.singular}>
            <div className="grassroots-event-field-grid">
              <GooglePlacesBusinessInput
                label={categoryConfig.nameLabel}
                value={draft.name}
                onChange={(value) => onChange("name", value)}
                onPlaceSelect={applyBusinessPlace}
                placeholder={categoryId === "apartments" ? "Search apartment complex" : "Search business"}
              />
              {categoryConfig.usesStatus !== false && <StatusPicker value={draft.status || "identified"} onChange={changeStatus} />}
              {categoryId !== "events" && <ActiveToggle value={draft.is_active !== false} onChange={(value) => onChange("is_active", value)} />}
              {usesBusinessCategoryColumn(categoryConfig) && (
                <FieldEditor
                  field={{ key: "business_category", label: "Category", type: "select", options: GRASSROOTS_BUSINESS_CATEGORY_OPTIONS, allowCustom: true, placeholder: "Category" }}
                  value={draft.business_category || draft.drop_category}
                  onChange={(value) => {
                    onChange("business_category", value);
                    onChange("drop_category", value);
                  }}
                />
              )}
            </div>
          </FormSection>

          <FormSection title="Address">
            <div className="grassroots-event-field-grid">
              <SplitAddressFields
                draft={draft}
                onChange={onChange}
                onPlaceSelect={applyPlaceAddress}
                placeholder={categoryId === "apartments" ? "Apartment address" : "Business address"}
              />
            </div>
          </FormSection>

          <FormSection title="Contact">
            <div className="grassroots-event-field-grid">
              <FieldEditor field={{ key: "first_name", label: "Contact Name", placeholder: "Contact name" }} value={draft.first_name} onChange={(value) => onChange("first_name", value)} />
              <FieldEditor field={{ key: "last_name", label: "Last Name", placeholder: "Last name" }} value={draft.last_name} onChange={(value) => onChange("last_name", value)} />
              <FieldEditor field={{ key: "contact_source", label: "Contact Source", placeholder: "Contact source" }} value={draft.contact_source} onChange={(value) => onChange("contact_source", value)} />
              <FieldEditor field={{ key: "contact_email", label: "Contact Email", type: "email", placeholder: "Contact email" }} value={draft.contact_email} onChange={(value) => onChange("contact_email", value)} />
              <FieldEditor field={{ key: "contact_phone", label: "Contact Number", placeholder: "Contact number" }} value={draft.contact_phone} onChange={(value) => onChange("contact_phone", value)} />
            </div>
          </FormSection>

          <FormSection title="Notes">
            <div className="grassroots-event-field-grid">
              {categoryId === "corporatePartnerships" && (
                <>
                  <FieldEditor field={{ key: "us_employees", label: "US Employees", type: "number", placeholder: "Number of US employees" }} value={draft.us_employees} onChange={(value) => onChange("us_employees", value)} />
                  <FieldEditor field={{ key: "local_employees", label: "Local Employees", type: "number", placeholder: "Number of local employees" }} value={draft.local_employees} onChange={(value) => onChange("local_employees", value)} />
                </>
              )}
              {categoryId !== "drops" && (
                <>
                  <FieldEditor field={{ key: "initial_contact_date", label: "Initial Contact Date", type: "date" }} value={draft.initial_contact_date} onChange={(value) => onChange("initial_contact_date", value)} />
                  <FieldEditor field={{ key: "last_contact_date", label: "Last Contact Date", type: "date" }} value={draft.last_contact_date} onChange={(value) => onChange("last_contact_date", value)} />
                </>
              )}
              <FieldEditor
                field={{ key: "proposal", label: categoryId === "drops" ? "Notes" : "Proposal", type: "textarea", placeholder: categoryId === "drops" ? "Notes about this business" : "Proposal or partnership notes" }}
                value={draft.proposal}
                onChange={(value) => onChange("proposal", value)}
              />
            </div>
            <EventLinksEditor draft={draft} onChange={onChange} />
            {!draft.isDraft && (
              <div className="grassroots-event-commentary">
                <div className="grassroots-event-commentary-header">
                  <Label>{categoryId === "drops" ? "Visits" : "Developments"}</Label>
                  <button type="button" onClick={onLog} disabled={!canLog || !onLog} className="grassroots-comment-add-button">
                    <I.MessageSquare /> {categoryConfig.logLabel}
                  </button>
                </div>
                <ActivityList
                  activities={activities}
                  categoryConfig={categoryConfig}
                  attachmentsByActivity={attachmentsByActivity}
                  onPreviewAttachment={onPreviewAttachment}
                  previewingAttachmentId={previewingAttachmentId}
                />
              </div>
            )}
          </FormSection>
        </div>
      </div>
      {!draft.isDraft && (
        <div style={{ padding: "12px 18px 16px", borderTop: `1px solid ${C.borderLight}`, display: "flex", justifyContent: "flex-end" }}>
          <Btn variant="ghost" size="sm" icon={<I.Trash />} onClick={onDelete} style={{ color: C.dan }}>
            Delete
          </Btn>
        </div>
      )}
    </Card>
  );
}

export function EventTargetInlineEditor({ draft, saving, activities = [], attachmentsByActivity = {}, canLog = false, onChange, onSave, onCancel, onDelete, onLog, onPreviewAttachment, previewingAttachmentId, organizerOptions = [], inModal = false }) {
  const changeStatus = (value) => {
    const status = normalizeGrassrootsStatus(value);
    onChange("status", status);
    onChange("is_active", status === "abandoned" ? false : true);
  };

  // No custom date popover state needed for quick capture — we use CalendarPicker directly.

  const applyPlaceAddress = (parts) => {
    Object.entries(parts || {}).forEach(([key, value]) => onChange(key, value || ""));
  };
  const cpl = fmtCurrencyNumber(calculateGrassrootsCpl(draft.cost, draft.leads_captured)) || "";

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  const rootClassName = "grassroots-event-inline-editor grassroots-event-dense";

  // Quick capture mode for new events (minimal, clean, fast)
  if (draft.isDraft) {
    const dates = Array.isArray(draft.event_dates) ? draft.event_dates : [];

    return (
      <div className={inModal ? "grassroots-event-dense" : rootClassName}>
        {!inModal && (
        <div className="grassroots-event-inline-header" style={{ background: 'transparent', borderBottom: `1px solid ${C.borderLight}` }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.textSec, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              New Event
            </div>
          </div>
          <button type="button" onClick={onCancel} aria-label="Close" title="Close" className="grassroots-event-inline-close">
            <I.X />
          </button>
        </div>
        )}

        <div style={{ padding: inModal ? "2px 0 0" : "14px 16px 8px" }}>
          {/* Consistent 3-column grid for both rows so everything lines up */}
          <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr", gap: "12px", marginBottom: "14px" }}>
            {/* Event Name */}
            <div style={{ gridColumn: "1 / 2" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.textSec, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Event Name
              </div>
              <input
                type="text"
                value={draft.name || ""}
                onChange={(e) => onChange("name", e.target.value)}
                placeholder="Event name"
                style={{ width: "100%", padding: "9px 11px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 15, fontWeight: 500, fontFamily: "inherit", outline: "none" }}
                autoFocus
              />
            </div>

            {/* Progressive optional dates for quick capture (no multi-day toggle).
                One required date. As you fill dates, additional grayed-out optional fields appear. */}
            <div style={{ gridColumn: "2 / 4" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.textSec, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Date(s)
              </div>

              {(() => {
                let displayDates = [...(dates.length ? dates : [{ id: "d1", event_date: "" }])];
                if (displayDates.length === 0 || displayDates[displayDates.length - 1].event_date) {
                  displayDates.push({ id: `d${displayDates.length + 1}`, event_date: "" });
                }
                return displayDates.map((d, idx) => {
                  const isOptional = idx > 0;
                  return (
                    <div key={d.id || idx} style={{ marginBottom: 6, opacity: isOptional && !d.event_date ? 0.6 : 1 }}>
                      <CalendarPicker
                        value={d.event_date || ""}
                        onChange={(val) => {
                          let next = [...dates];
                          if (idx < next.length) {
                            next[idx] = { ...(next[idx] || {}), event_date: val };
                          } else {
                            next.push({ id: `d${next.length + 1}`, event_date: val });
                          }
                          while (next.length > 1 && !next[next.length - 1].event_date) {
                            next.pop();
                          }
                          onChange("event_dates", next);
                        }}
                      />
                    </div>
                  );
                });
              })()}
            </div>

            {/* Row 2: Organizer / Contact */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.textSec, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Organizer / Contact
              </div>
              <OrganizerAutocomplete
                label={null}
                value={draft.organizer || ""}
                onChange={(val) => onChange("organizer", val)}
                options={organizerOptions}
                placeholder="Name (optional)"
              />
            </div>

            {/* Row 2: Phone */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.textSec, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Phone
              </div>
              <input
                type="text"
                value={draft.contact_phone || ""}
                onChange={(e) => onChange("contact_phone", e.target.value)}
                placeholder="(optional)"
                style={{ width: "100%", padding: "7px 10px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit" }}
              />
            </div>

            {/* Row 2: Email */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.textSec, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Email
              </div>
              <input
                type="email"
                value={draft.contact_email || ""}
                onChange={(e) => onChange("contact_email", e.target.value)}
                placeholder="(optional)"
                style={{ width: "100%", padding: "7px 10px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 13, fontFamily: "inherit" }}
              />
            </div>
          </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "10px 16px", borderTop: `1px solid ${C.borderLight}` }}>
          <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
          <Btn variant="primary" onClick={onSave} disabled={saving || !draft.name?.trim()}>
            {saving ? "Saving..." : "Save"}
          </Btn>
        </div>
      </div>
      </div>
    );
  }

  // Full edit mode for existing events (richer details)
  return (
    <div className={rootClassName}>
        <div className="grassroots-event-inline-header">
          <div>
            <div style={{ fontSize: 9, fontWeight: 900, color: C.pri, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Edit Event
            </div>
            <div style={{ marginTop: 1, fontSize: 10, color: C.textMut }}>
              Update without leaving the tracker
            </div>
          </div>
          <button type="button" onClick={onCancel} aria-label="Close event editor" title="Close" className="grassroots-event-inline-close">
            <I.X />
          </button>
        </div>
        <div className="grassroots-event-inline-body">
        <div className="grassroots-event-form-grid">
          <FormSection title="Event">
            <div className="grassroots-event-field-grid">
              <FieldEditor
                field={{ key: "name", label: "Event", placeholder: "Event name" }}
                value={draft.name}
                onChange={(value) => onChange("name", value)}
              />
              <StatusPicker value={draft.status || "identified"} onChange={changeStatus} />
              <SplitAddressFields
                draft={draft}
                onChange={onChange}
                onPlaceSelect={applyPlaceAddress}
                placeholder="Event address"
              />
              <div className="grassroots-event-wide-field">
                <EventDateEditor draft={draft} onChange={onChange} />
              </div>
              <EventTypePicker value={draft.event_type} onChange={(value) => onChange("event_type", value)} />
            </div>
          </FormSection>

          <FormSection title="Organizer">
            <div className="grassroots-event-field-grid">
              <OrganizerAutocomplete label="Organizer" value={draft.organizer} onChange={(value) => onChange("organizer", value)} options={organizerOptions} placeholder="Organizer" />
              <FieldEditor field={{ key: "first_name", label: "Contact Name", placeholder: "Contact name" }} value={draft.first_name} onChange={(value) => onChange("first_name", value)} />
              <FieldEditor field={{ key: "contact_email", label: "Contact Email", type: "email", placeholder: "Contact email" }} value={draft.contact_email} onChange={(value) => onChange("contact_email", value)} />
              <FieldEditor field={{ key: "contact_phone", label: "Contact Number", placeholder: "Contact number" }} value={draft.contact_phone} onChange={(value) => onChange("contact_phone", value)} />
            </div>
          </FormSection>

          <FormSection title="Reporting">
            <div className="grassroots-event-field-grid">
              <FieldEditor field={{ key: "expected_audience", label: "Expected Audience", type: "number", placeholder: "Expected audience" }} value={draft.expected_audience} onChange={(value) => onChange("expected_audience", value)} />
              <FieldEditor field={{ key: "leads_captured", label: "Leads Captured", type: "number", placeholder: "Leads captured" }} value={draft.leads_captured} onChange={(value) => onChange("leads_captured", value)} />
              <FieldEditor field={{ key: "cost", label: "Cost", type: "number", placeholder: "Cost" }} value={draft.cost} onChange={(value) => onChange("cost", value)} />
              <FieldEditor field={{ key: "cpl", label: "CPL", type: "computed", placeholder: "-" }} value={cpl || "-"} onChange={() => {}} />
            </div>
          </FormSection>

          <FormSection title="Links">
            <EventLinksEditor draft={draft} onChange={onChange} />
          </FormSection>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 6, flexWrap: "wrap", paddingTop: 6, borderTop: `1px solid ${C.borderLight}` }}>
          <div>
            <Btn variant="ghost" size="sm" icon={<I.Trash />} onClick={onDelete} style={{ color: C.dan }}>
              Delete
            </Btn>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
            <Btn variant="primary" onClick={onSave} disabled={saving}>
              {saving ? "Saving..." : "Save Event"}
            </Btn>
          </div>
        </div>
        </div>
    </div>
  );
}
