import React, { useEffect, useMemo, useState } from "react";
import { C, gid, todayStr } from "../../shared/theme";
import { I } from "../../shared/icons";
import { supabase } from "../../supabaseClient";
import { useEnrichmentEvents } from "../../hooks/useEnrichmentEvents";
import { useEnrichmentWorkflow } from "../../hooks/useEnrichmentWorkflow";
import { useEnrichmentProgramConfig } from "../../hooks/useEnrichmentProgramConfig";
import {
  ENRICHMENT_FOCUS_LABELS,
  ENRICHMENT_VISUAL_THEMES,
  addMonths,
  buildBlankEnrichmentEvent,
  filterEventsForMonth,
  formatEventDate,
  getEventsForDate,
  getMonthLabel,
  getMonthStart,
  getNextEnrichmentEvent,
  getThemeConfig,
  normalizeDate,
  parseLines,
  parseProducts,
  prepareEventPayload,
  serializeLines,
  serializeProducts,
} from "../enrichments/enrichmentData";
import {
  buildGraphicStoragePath,
  getGraphicContentType,
  isAllowedGraphicFile,
} from "../enrichments/enrichmentGraphicUploads";

import {
  BRAND,
  ENTERPRISE_ADMIN_ROLES,
  GRAPHIC_AUDIENCES,
  GRAPHIC_BUCKET,
  K9_FONT_STACK,
} from "./enrichments/constants";
import { PAGE_CSS } from "./enrichments/pageStyles";

import { createDraft, draftToEvent } from "./enrichments/eventDrafts";
import { addMonthsPreserveDay } from "./enrichments/dateUtils";
import { buildMarketingBrief, buildMarketingCsv, downloadTextFile } from "./enrichments/marketingExport";
import { formatPriceLabel } from "./enrichments/formatters";
import { isMissingSupabaseResource } from "./enrichments/supabaseErrors";
import { Field, ProductEditor } from "./enrichments/formFields";
import {
  EnrichmentHealthModal,
  WorkflowHealthButton,
  WorkflowView,
} from "./enrichments/workflowView";
import { EventDetail } from "./enrichments/eventDetail";
import { CalendarBoard } from "./enrichments/calendarBoard";
import { SopView } from "./enrichments/sopView";
import { MarketingHandoff } from "./enrichments/marketingHandoff";

function EnrichmentsPage({ nav, profile, currentLocation, params, addGlobalToast }) {
  const locationId = profile?.location_id || currentLocation || "demo";
  const initialDate = normalizeDate(params?.selectedDate || todayStr());
  const [monthDate, setMonthDate] = useState(initialDate.slice(0, 8) + "01");
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [selectedEventId, setSelectedEventId] = useState(params?.selectedEventId || null);
  const [audience, setAudience] = useState("staff");
  const [activeTab, setActiveTab] = useState("workflow");
  const [draftMode, setDraftMode] = useState("existing");
  const [saving, setSaving] = useState(false);
  const [calendarGraphics, setCalendarGraphics] = useState({});
  const [graphicUrls, setGraphicUrls] = useState({});
  const [graphicsLoading, setGraphicsLoading] = useState(false);
  const [uploadingGraphic, setUploadingGraphic] = useState("");
  const [healthOpen, setHealthOpen] = useState(false);
  const [workflowFilter, setWorkflowFilter] = useState("all");
  const [workflowSort, setWorkflowSort] = useState("departure");

  const canManage = ENTERPRISE_ADMIN_ROLES.has(profile?.role);
  const { events, visibleMonthEvents, loading, error, storageMode, saveEvent, deleteEvent } = useEnrichmentEvents(locationId, monthDate);
  const actorName = profile?.full_name || profile?.name || profile?.email || "Staff";
  const workflowState = useEnrichmentWorkflow(locationId, selectedDate, { actorName });
  const programConfigState = useEnrichmentProgramConfig(locationId, actorName);
  const canEditProgramConfig = profile?.role === "enterprise_admin";

  const selectedDateEvents = useMemo(() => getEventsForDate(events, selectedDate, "staff"), [events, selectedDate]);
  const selectedEvent = useMemo(() => {
    if (selectedEventId) {
      const found = events.find((event) => String(event.id) === String(selectedEventId));
      if (found) return found;
    }
    return selectedDateEvents[0] || null;
  }, [events, selectedEventId, selectedDateEvents]);

  const [draft, setDraft] = useState(() => createDraft(selectedEvent, locationId));

  useEffect(() => {
    if (draftMode === "create") return;
    setDraft(createDraft(selectedEvent || buildBlankEnrichmentEvent({ date: selectedDate, locationId }), locationId));
  }, [draftMode, selectedEvent, selectedDate, locationId]);

  const customerEvents = useMemo(() => filterEventsForMonth(events, monthDate, "customer"), [events, monthDate]);
  const handoffEvents = audience === "customer" ? customerEvents : filterEventsForMonth(events, monthDate, audience);

  useEffect(() => {
    let cancelled = false;

    async function loadGraphics() {
      if (!locationId) return;
      setGraphicsLoading(true);
      try {
        const monthStart = getMonthStart(monthDate);
        const { data, error: loadError } = await supabase
          .from("enrichment_calendar_graphics")
          .select("*")
          .eq("location_id", locationId)
          .eq("month_start", monthStart);
        if (loadError) throw loadError;

        const graphicsByAudience = {};
        const signedByAudience = {};
        await Promise.all((data || []).map(async (graphic) => {
          graphicsByAudience[graphic.audience] = graphic;
          const { data: signed, error: signedError } = await supabase
            .storage
            .from(graphic.storage_bucket || GRAPHIC_BUCKET)
            .createSignedUrl(graphic.storage_path, 60 * 60);
          if (!signedError && signed?.signedUrl) {
            signedByAudience[graphic.audience] = signed.signedUrl;
          }
        }));

        if (!cancelled) {
          setCalendarGraphics(graphicsByAudience);
          setGraphicUrls(signedByAudience);
        }
      } catch (graphicsError) {
        if (!isMissingSupabaseResource(graphicsError)) {
          console.error("enrichment calendar graphics load failed:", graphicsError);
        }
        if (!cancelled) {
          setCalendarGraphics({});
          setGraphicUrls({});
        }
      } finally {
        if (!cancelled) setGraphicsLoading(false);
      }
    }

    loadGraphics();
    return () => {
      cancelled = true;
    };
  }, [locationId, monthDate]);

  function notify(message, type = "info") {
    addGlobalToast?.({ message, type });
  }

  function handleSelectDate(date) {
    setDraftMode("existing");
    setSelectedDate(date);
    const dayEvents = getEventsForDate(events, date, "staff");
    setSelectedEventId(dayEvents[0]?.id || null);
  }

  function handleNewEvent(date = selectedDate) {
    const blank = buildBlankEnrichmentEvent({ date, locationId });
    setDraftMode("create");
    setMonthDate(getMonthStart(blank.event_date));
    setSelectedDate(blank.event_date);
    setSelectedEventId(null);
    setDraft(createDraft(blank, locationId));
    setActiveTab("builder");
  }

  function handleEditEvent() {
    setDraftMode("existing");
    setActiveTab("builder");
  }

  function handleDuplicateEvent(event) {
    if (!event) return;
    const nextDate = addMonthsPreserveDay(event.event_date, 1);
    const duplicate = {
      ...event,
      id: null,
      legacy_source_id: null,
      event_date: nextDate,
      source_label: "Duplicated in K9 Operations",
    };
    setDraftMode("create");
    setMonthDate(getMonthStart(nextDate));
    setSelectedDate(nextDate);
    setSelectedEventId(null);
    setDraft(createDraft(duplicate, locationId));
    setActiveTab("builder");
  }

  async function handleSave() {
    if (!canManage) return;
    const event = draftToEvent(draft, locationId);
    if (!event.title.trim()) {
      notify("Add an event title before saving.", "warning");
      return;
    }
    setSaving(true);
    try {
      const saved = await saveEvent(event);
      setDraftMode("existing");
      setMonthDate(getMonthStart(saved.event_date));
      setSelectedDate(saved.event_date);
      setSelectedEventId(saved.id);
      notify(storageMode === "tables" ? "Enrichment event saved." : "Enrichment event saved to location settings fallback.", "success");
      setActiveTab("calendar");
    } catch (saveError) {
      console.error("Enrichment save failed:", saveError);
      notify(saveError.message || "Unable to save enrichment event.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!canManage || !selectedEvent) return;
    setSaving(true);
    try {
      await deleteEvent(selectedEvent);
      notify("Enrichment event removed from this calendar.", "success");
      setDraftMode("existing");
      setSelectedEventId(null);
      setDraft(createDraft(buildBlankEnrichmentEvent({ date: selectedDate, locationId }), locationId));
    } catch (deleteError) {
      console.error("Enrichment delete failed:", deleteError);
      notify(deleteError.message || "Unable to remove enrichment event.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleCopyMarketingBrief() {
    try {
      await navigator.clipboard.writeText(buildMarketingBrief({
        monthDate,
        events: handoffEvents,
        audience,
      }));
      notify("Marketing handoff copied.", "success");
    } catch (copyError) {
      console.error("Marketing handoff copy failed:", copyError);
      notify("Unable to copy marketing handoff.", "error");
    }
  }

  function handleDownloadCsv() {
    const csv = buildMarketingCsv(handoffEvents);
    downloadTextFile({
      content: csv,
      type: "text/csv;charset=utf-8",
      filename: `k9-resorts-enrichment-${getMonthLabel(monthDate).toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${audience}.csv`,
    });
  }

  async function handleGraphicUpload(graphicAudience, file) {
    if (!canManage || !file) return;
    if (!isAllowedGraphicFile(file)) {
      notify("Upload a PNG, JPG, WebP, or PDF graphic.", "warning");
      return;
    }

    const monthStart = getMonthStart(monthDate);
    const storagePath = buildGraphicStoragePath(locationId, monthStart, graphicAudience, file);
    const contentType = getGraphicContentType(file);
    setUploadingGraphic(graphicAudience);
    try {
      const { error: uploadError } = await supabase
        .storage
        .from(GRAPHIC_BUCKET)
        .upload(storagePath, file, {
          contentType,
          upsert: true,
        });
      if (uploadError) throw uploadError;

      const payload = {
        location_id: locationId,
        month_start: monthStart,
        audience: graphicAudience,
        storage_bucket: GRAPHIC_BUCKET,
        storage_path: storagePath,
        file_name: file.name,
        content_type: contentType,
        file_size_bytes: file.size,
      };
      const { data, error: saveError } = await supabase
        .from("enrichment_calendar_graphics")
        .upsert(payload, { onConflict: "location_id,month_start,audience" })
        .select("*")
        .single();
      if (saveError) throw saveError;

      const { data: signed, error: signedError } = await supabase
        .storage
        .from(GRAPHIC_BUCKET)
        .createSignedUrl(storagePath, 60 * 60);
      if (signedError) throw signedError;

      setCalendarGraphics((current) => ({ ...current, [graphicAudience]: data }));
      setGraphicUrls((current) => ({ ...current, [graphicAudience]: signed?.signedUrl || "" }));
      notify(`${GRAPHIC_AUDIENCES.find((item) => item.id === graphicAudience)?.label || "Graphic"} uploaded.`, "success");
    } catch (uploadError) {
      console.error("Enrichment graphic upload failed:", uploadError);
      notify(uploadError.message || "Unable to upload enrichment graphic.", "error");
    } finally {
      setUploadingGraphic("");
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: BRAND.slate50, padding: "24px 32px", overflow: "auto", fontFamily: K9_FONT_STACK, boxShadow: `0 0 0 100vmax ${BRAND.slate50}`, clipPath: "inset(0 -100vmax)" }}>
      <style>{PAGE_CSS}</style>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <Header
          monthDate={monthDate}
          setMonthDate={setMonthDate}
          nav={nav}
          loading={loading}
          storageMode={storageMode}
          canManage={canManage}
          onNew={() => handleNewEvent(selectedDate)}
        />

        <DailyCommandSurface
          events={events}
          nav={nav}
          loading={loading}
          date={selectedDate}
          monthDate={monthDate}
          setMonthDate={setMonthDate}
          setSelectedDate={setSelectedDate}
          selectedDateEvents={selectedDateEvents}
          workflowState={workflowState}
          onSelectCalendar={() => setActiveTab("calendar")}
          onOpenHealth={() => setHealthOpen(true)}
          canManage={canManage}
          onNew={() => handleNewEvent(selectedDate)}
        />
        {error ? <div className="inline-warning top-warning">Calendar loaded with fallback data because Supabase returned: {error.message}</div> : null}

        <div className="tab-row">
          {[
            ["workflow", "Daily Workflow"],
            ["calendar", "Calendar"],
            ["sop", "SOP Details"],
            ["builder", "Create / Edit"],
            ["handoff", "Marketing Handoff"],
          ].map(([id, label]) => (
            <button key={id} type="button" className={activeTab === id ? "tab active" : "tab"} onClick={() => setActiveTab(id)}>
              {label}
            </button>
          ))}
        </div>

        {activeTab === "workflow" ? (
          <WorkflowView
            date={selectedDate}
            monthDate={monthDate}
            setMonthDate={setMonthDate}
            setSelectedDate={setSelectedDate}
            selectedDateEvents={selectedDateEvents}
            workflowState={workflowState}
            filter={workflowFilter}
            onFilterChange={setWorkflowFilter}
            sort={workflowSort}
            onSortChange={setWorkflowSort}
            onSelectCalendar={() => setActiveTab("calendar")}
            onOpenHealth={() => setHealthOpen(true)}
          />
        ) : null}

        {activeTab === "calendar" ? (
          <div className="main-grid">
            <CalendarBoard
              monthDate={monthDate}
              events={events}
              selectedDate={selectedDate}
              selectedEventId={selectedEvent?.id}
              onSelectDate={handleSelectDate}
              onSelectEvent={(event) => {
                setDraftMode("existing");
                setSelectedDate(event.event_date);
                setSelectedEventId(event.id);
              }}
              onNew={canManage ? handleNewEvent : null}
            />
            <EventDetail event={selectedEvent} dayEvents={selectedDateEvents} onSelectEvent={setSelectedEventId} onEdit={handleEditEvent} onDuplicate={handleDuplicateEvent} canManage={canManage} />
          </div>
        ) : null}

        {activeTab === "sop" ? (
          <SopView
            event={selectedEvent}
            monthEvents={visibleMonthEvents}
            programConfigState={programConfigState}
            canEditProgramConfig={canEditProgramConfig}
            onNotify={notify}
          />
        ) : null}

        {activeTab === "builder" ? (
          <BuilderView
            draft={draft}
            setDraft={setDraft}
            canManage={canManage}
            saving={saving}
            selectedEvent={selectedEvent}
            onSave={handleSave}
            onDelete={handleDelete}
            onNew={() => handleNewEvent(selectedDate)}
          />
        ) : null}

        {activeTab === "handoff" ? (
          <MarketingHandoff
            monthDate={monthDate}
            events={handoffEvents}
            audience={audience}
            setAudience={setAudience}
            graphics={calendarGraphics}
            graphicUrls={graphicUrls}
            loading={graphicsLoading}
            uploading={uploadingGraphic}
            canManage={canManage}
            onUpload={handleGraphicUpload}
            onCopyBrief={handleCopyMarketingBrief}
            onDownloadCsv={handleDownloadCsv}
          />
        ) : null}
      </div>
      {healthOpen ? (
        <EnrichmentHealthModal
          workflowState={workflowState}
          onClose={() => setHealthOpen(false)}
        />
      ) : null}
    </div>
  );
}

function DailyCommandSurface({
  events,
  nav,
  loading,
  date,
  monthDate,
  setMonthDate,
  setSelectedDate,
  selectedDateEvents,
  workflowState,
  onSelectCalendar,
  onOpenHealth,
  canManage,
  onNew,
}) {
  const { workflow, health, refreshState } = workflowState;
  const progress = workflow.total > 0 ? Math.round((workflow.completedCount / workflow.total) * 100) : 0;
  const hasReview = workflow.needsReviewCount > 0;

  function shiftDate(delta) {
    const next = new Date(`${date}T12:00:00`);
    next.setDate(next.getDate() + delta);
    const nextDate = normalizeDate(next);
    setSelectedDate(nextDate);
    const nextMonth = getMonthStart(nextDate);
    if (nextMonth !== getMonthStart(monthDate)) setMonthDate(nextMonth);
  }

  return (
    <div className="enrichment-daily-surface">
      <EventPlanCard
        events={events}
        date={date}
        selectedDateEvents={selectedDateEvents}
        nav={nav}
        loading={loading}
      />

      <section className={hasReview ? "daily-module-card queue-card has-review" : "daily-module-card queue-card"}>
        <div className="daily-module-head">
          <div>
            <div className="section-title">Enrichment Queue</div>
            <h2>{formatEventDate(date, { weekday: "short" })}</h2>
          </div>
          <div className="workflow-date-nav">
            <button type="button" aria-label="Previous day" onClick={() => shiftDate(-1)}><I.Back /></button>
            <button type="button" aria-label="Next day" onClick={() => shiftDate(1)}><I.ChevronRight /></button>
            <button type="button" className="secondary-btn" onClick={onSelectCalendar}><I.Calendar /> Calendar</button>
          </div>
        </div>

        <div className="daily-module-main queue-main">
          <div className="daily-run-completion">
            <span>Complete</span>
            <strong>{workflow.completedCount}/{workflow.total}</strong>
          </div>
          {hasReview ? (
            <span className="daily-run-review">
              <I.AlertTriangle /> {workflow.needsReviewCount} needs review
            </span>
          ) : null}
        </div>

        <div className="daily-run-progress">
          <span style={{ width: `${progress}%` }} />
        </div>

        <div className="daily-module-foot">
          <WorkflowHealthButton health={health} refreshState={refreshState} onClick={onOpenHealth} compact />
        </div>
      </section>

      <section className="daily-module-card sop-snapshot-card">
        <div className="daily-module-head">
          <div>
            <div className="section-title">SOP Snapshot</div>
            <h3>{selectedDateEvents.length ? `${selectedDateEvents.length} event${selectedDateEvents.length === 1 ? "" : "s"} for this date` : "No event attached"}</h3>
          </div>
          {canManage ? <button type="button" className="secondary-btn" onClick={onNew}><I.Plus /> Add</button> : null}
        </div>
        <div className="daily-sop-list">
          {selectedDateEvents.length ? selectedDateEvents.slice(0, 2).map((event) => {
            const theme = getThemeConfig(event.visual_theme);
            return (
              <article key={event.id} style={{ borderColor: theme.color, background: theme.soft }}>
                <strong style={{ color: theme.color }}>{event.title}</strong>
                <span>{event.summary || event.sop_details || "No summary added."}</span>
              </article>
            );
          }) : <p>Add a calendar event when the daily enrichment needs a staff SOP, product list, or marketing handoff.</p>}
        </div>
      </section>
    </div>
  );
}

function EventPlanCard({ events, date, selectedDateEvents = [], nav, loading }) {
  const primary = selectedDateEvents[0] || getNextEnrichmentEvent(events, date, "staff");
  const theme = getThemeConfig(primary?.visual_theme || "neutral");
  const focusLabel = ENRICHMENT_FOCUS_LABELS[primary?.focus_area] || primary?.focus_area || "Activity";
  const remainingCount = primary?.event_date === normalizeDate(date)
    ? Math.max(0, selectedDateEvents.length - 1)
    : 0;

  if (loading && !primary) {
    return (
      <section className="daily-module-card event-plan-card loading">
        <div className="module-skeleton short" />
        <div className="module-skeleton title" />
        <div className="module-skeleton body" />
      </section>
    );
  }

  if (!primary) {
    return (
      <button type="button" className="daily-module-card event-plan-card empty" onClick={() => nav?.("enrichments")}>
        <div className="daily-module-head">
          <div>
            <div className="section-title">Event Plan</div>
            <h3>No event loaded</h3>
          </div>
        </div>
        <p>Open the calendar to attach the next staff activity.</p>
      </button>
    );
  }

  return (
    <button
      type="button"
      className="daily-module-card event-plan-card"
      onClick={() => nav?.("enrichments", { selectedDate: primary.event_date, selectedEventId: primary.id })}
      style={{ "--event-color": theme.color, "--event-soft": theme.soft }}
    >
      <div className="daily-module-head">
        <div>
          <div className="section-title">Event Plan</div>
          <h3>{primary.title}</h3>
        </div>
        <span className="module-price">{formatPriceLabel(primary)}</span>
      </div>
      <div className="event-plan-meta">{formatEventDate(primary.event_date, { weekday: "long" })} - {focusLabel}</div>
      {primary.summary ? <p>{primary.summary}</p> : null}
      <div className="event-plan-chip-row">
        <span>{primary.products?.length || 0} products</span>
        <span>{primary.customer_visible ? "Customer graphic" : "Staff only"}</span>
        {remainingCount ? <span>+{remainingCount} more today</span> : null}
      </div>
    </button>
  );
}

function Header({ monthDate, setMonthDate, nav, canManage, onNew }) {
  return (
    <div className="page-header">
      <div>
        <button type="button" className="back-link" onClick={() => nav?.("home")}>
          <I.Back /> <span>Home</span>
        </button>
        <div className="eyebrow">K9 Operations Enrichment Portal</div>
        <h1>Enrichment</h1>
        <p>Run today’s dog queue, check the event SOP, and keep calendar planning one click away.</p>
      </div>
      <div className="header-actions">
        <div className="month-control">
          <button type="button" onClick={() => setMonthDate(addMonths(monthDate, -1))}><I.Back /></button>
          <span>{getMonthLabel(monthDate)}</span>
          <button type="button" onClick={() => setMonthDate(addMonths(monthDate, 1))}><I.ChevronRight /></button>
        </div>
        {canManage ? <button type="button" className="primary-btn" onClick={onNew}><I.Plus /> New Event</button> : null}
      </div>
    </div>
  );
}

function BuilderView({ draft, setDraft, canManage, saving, selectedEvent, onSave, onDelete, onNew }) {
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

export default EnrichmentsPage;
