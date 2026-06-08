import React, { useEffect, useState } from "react";
import { I } from "../../../shared/icons";
import {
  DEFAULT_ENRICHMENT_GUIDELINES,
  ENRICHMENT_CSR_GUIDE_SECTIONS,
  ENRICHMENT_TEXT_SCRIPTS,
  formatEventDate,
} from "../../enrichments/enrichmentData";
import { buildProgramConfigDraft, stripProgramConfigDraft } from "./programConfigDraft";
import { ChecklistList, DetailSection, PillList } from "./detailComponents";
import { ProductLinksInline } from "./productComponents";
import {
  ProgramSopEditor,
  ResourceLinks,
  ResourceLinksEditor,
  ScriptList,
  SopSectionList,
} from "./sopComponents";

export function SopView({ event, monthEvents, programConfigState, canEditProgramConfig, onNotify }) {
  const upcoming = monthEvents.slice(0, 8);
  const { config, loading, saving, error, saveConfig } = programConfigState;
  const [editingProgramConfig, setEditingProgramConfig] = useState(false);
  const [draft, setDraft] = useState(() => buildProgramConfigDraft(config));

  useEffect(() => {
    if (!editingProgramConfig) setDraft(buildProgramConfigDraft(config));
  }, [config, editingProgramConfig]);

  async function handleSaveProgramConfig() {
    const payload = stripProgramConfigDraft(draft);
    if (!payload.programSopSections.length) {
      onNotify?.("Program SOP needs at least one section before saving.", "warning");
      return;
    }
    try {
      await saveConfig(payload);
      setEditingProgramConfig(false);
      onNotify?.("Enrichment Program SOP updated.", "success");
    } catch (saveError) {
      console.error("[enrichment program config] save failed:", saveError);
      onNotify?.(saveError.message || "Unable to save Enrichment Program SOP.", "error");
    }
  }

  function startEditingProgramConfig() {
    setDraft(buildProgramConfigDraft(config));
    setEditingProgramConfig(true);
  }

  function cancelEditingProgramConfig() {
    setDraft(buildProgramConfigDraft(config));
    setEditingProgramConfig(false);
  }

  return (
    <div className="sop-grid">
      <div className="sop-admin-card span-two">
        <div>
          <div className="section-title">Enterprise SOP Controls</div>
          <p>
            Brand-level Enrichment SOP and linked resource controls.
          </p>
          {error ? <small>Loaded defaults because the saved Program SOP setting returned: {error.message}</small> : null}
        </div>
        {canEditProgramConfig ? (
          <div className="sop-admin-actions">
            {editingProgramConfig ? (
              <>
                <button type="button" className="secondary-btn" onClick={cancelEditingProgramConfig} disabled={saving}>Cancel</button>
                <button type="button" className="primary-btn" onClick={handleSaveProgramConfig} disabled={saving}>
                  {saving ? "Saving..." : "Save SOP"}
                </button>
              </>
            ) : (
              <button type="button" className="primary-btn" onClick={startEditingProgramConfig} disabled={loading}>
                <I.Edit /> Edit Program SOP
              </button>
            )}
          </div>
        ) : (
          <span className="enterprise-lock-pill">Enterprise admin only</span>
        )}
      </div>
      <div className="sop-card">
        <div className="section-title">Global Guidelines</div>
        <ChecklistList items={DEFAULT_ENRICHMENT_GUIDELINES} />
      </div>
      <div className="sop-card">
        <div className="section-title">Selected Event Guide</div>
        {event ? (
          <>
            <h2>{event.title}</h2>
            <p>{event.sop_details || event.summary}</p>
            <PillList items={event.setup_locations} empty="No setup locations listed." />
            <DetailSection title="Product Links">
              <ProductLinksInline products={event.products || []} />
            </DetailSection>
            <div style={{ marginTop: 16 }}><ChecklistList items={event.checklist} /></div>
          </>
        ) : <p>Select an event from the calendar to see the exact guide.</p>}
      </div>
      <div className="sop-card">
        <div className="section-title">Forward Looking Prep</div>
        <div className="prep-list">
          {upcoming.map((item) => (
            <div key={item.id}>
              <strong>{formatEventDate(item.event_date)} - {item.title}</strong>
              <ProductLinksInline products={item.products?.slice(0, 4) || []} />
            </div>
          ))}
        </div>
      </div>
      <div className="sop-card">
        <div className="section-title">Linked Resources</div>
        <p>Original SOP lesson libraries, calendar source files, and flyer references stay accessible from the operating portal.</p>
        {editingProgramConfig ? (
          <ResourceLinksEditor
            links={draft.resourceLinks}
            onChange={(resourceLinks) => setDraft((current) => ({ ...current, resourceLinks }))}
          />
        ) : (
          <ResourceLinks links={config.resourceLinks} />
        )}
      </div>
      <div className="sop-card span-two">
        <div className="section-title">Program SOP</div>
        {editingProgramConfig ? (
          <ProgramSopEditor
            sections={draft.programSopSections}
            onChange={(programSopSections) => setDraft((current) => ({ ...current, programSopSections }))}
          />
        ) : (
          <SopSectionList sections={config.programSopSections} />
        )}
      </div>
      <div className="sop-card span-two">
        <div className="section-title">CSR Guide</div>
        <SopSectionList sections={ENRICHMENT_CSR_GUIDE_SECTIONS} />
      </div>
      <div className="sop-card">
        <div className="section-title">Text Scripts</div>
        <p>Use SMS as a last resort. The SOP preference is to pitch enrichment in person whenever possible.</p>
        <ScriptList scripts={ENRICHMENT_TEXT_SCRIPTS} />
      </div>
    </div>
  );
}
