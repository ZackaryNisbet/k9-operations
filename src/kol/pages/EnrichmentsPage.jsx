import React, { useEffect, useMemo, useState } from "react";
import { C, gid, todayStr } from "../../shared/theme";
import { I } from "../../shared/icons";
import { supabase } from "../../supabaseClient";
import { useEnrichmentEvents } from "../../hooks/useEnrichmentEvents";
import { useEnrichmentWorkflow } from "../../hooks/useEnrichmentWorkflow";
import { useEnrichmentProgramConfig } from "../../hooks/useEnrichmentProgramConfig";
import {
  DEFAULT_ENRICHMENT_GUIDELINES,
  DEFAULT_ENRICHMENT_NOTES,
  ENRICHMENT_AUDIENCES,
  ENRICHMENT_CSR_GUIDE_SECTIONS,
  ENRICHMENT_FOCUS_LABELS,
  ENRICHMENT_TEXT_SCRIPTS,
  ENRICHMENT_VISUAL_THEMES,
  addMonths,
  buildBlankEnrichmentEvent,
  buildCalendarWeeks,
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
  ENRICHMENT_WORKFLOW_FILTERS,
  ENRICHMENT_WORKFLOW_REFRESH_MS,
  ENRICHMENT_WORKFLOW_SORTS,
  applyEnrichmentWorkflowView,
  countEnrichmentWorkflowFilter,
  formatHealthAge,
} from "../enrichments/enrichmentWorkflowData";
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

function createDraft(event, locationId) {
  const source = event || buildBlankEnrichmentEvent({ date: todayStr(), locationId });
  return {
    id: source.id || null,
    legacy_source_id: source.legacy_source_id || null,
    event_date: normalizeDate(source.event_date),
    title: source.title || "",
    subtitle: source.subtitle || "",
    category: source.category || "Weekly Theme",
    focus_area: source.focus_area || "brainwork",
    visual_theme: source.visual_theme || "neutral",
    customer_visible: !!source.customer_visible,
    price: String(Math.round(Number(source.price_cents || 0) / 100)),
    status: source.status || "planned",
    summary: source.summary || "",
    sop_details: source.sop_details || "",
    staff_notes: source.staff_notes || "",
    setup_locations: serializeLines(source.setup_locations || []),
    products: serializeProducts(source.products || []),
    checklist: serializeLines(source.checklist || []),
    calendar_note: source.calendar_note || "",
    source_label: source.source_label || "K9 Operations",
  };
}

function draftToEvent(draft, locationId) {
  return {
    id: draft.id,
    legacy_source_id: draft.legacy_source_id,
    location_id: locationId,
    event_date: normalizeDate(draft.event_date),
    title: draft.title,
    subtitle: draft.subtitle,
    category: draft.category,
    focus_area: draft.focus_area,
    visual_theme: draft.visual_theme,
    customer_visible: draft.customer_visible,
    price_cents: Math.max(0, Math.round(Number(draft.price || 0) * 100)),
    status: draft.status,
    summary: draft.summary,
    sop_details: draft.sop_details,
    staff_notes: draft.staff_notes,
    setup_locations: parseLines(draft.setup_locations),
    products: parseProducts(draft.products),
    checklist: parseLines(draft.checklist),
    calendar_note: draft.calendar_note,
    source_label: draft.source_label,
  };
}

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

function formatPriceLabel(event) {
  const cents = Number(event?.price_cents || 0);
  if (!cents) return "$15 add-on";
  return `$${Math.round(cents / 100)} add-on`;
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

function healthTone(status) {
  if (status === "healthy") return { label: "Healthy", color: "#22C55E", bg: "rgba(34,197,94,0.13)" };
  if (status === "stale") return { label: "Watch", color: "#EAB308", bg: "rgba(234,179,8,0.14)" };
  if (status === "critical") return { label: "Down", color: "#EF4444", bg: "rgba(239,68,68,0.14)" };
  return { label: "Waiting", color: "#64748B", bg: "rgba(100,116,139,0.1)" };
}

function WorkflowHealthButton({ health, refreshState, onClick, compact = false }) {
  const tone = healthTone(health?.status);
  const progressPct = `${Math.round((refreshState?.progress || 0) * 100)}%`;
  return (
    <button
      type="button"
      className="workflow-health-btn"
      title="Open Enrichment health"
      onClick={onClick}
      style={{ borderColor: tone.color, color: tone.color, background: tone.bg }}
    >
      <span className="workflow-health-sweep" style={{ background: `linear-gradient(90deg, transparent, ${tone.color}22, transparent)`, animation: refreshState?.isRefreshing ? "enrichmentHealthSweep 1.1s ease-in-out infinite" : "none" }} />
      <span className="workflow-health-progressbar" style={{ width: progressPct, background: tone.color, opacity: refreshState?.isRefreshing ? 0.95 : 0.65 }} />
      <span className="workflow-health-dot" style={{ background: tone.color, boxShadow: `0 0 18px ${tone.color}99`, animation: refreshState?.isRefreshing ? "enrichmentHealthPulse .9s ease-in-out infinite" : "none" }} />
      <span className={compact ? "workflow-health-copy compact" : "workflow-health-copy"}>
        <span>{tone.label}</span>
        <small>{refreshState?.label || "Waiting"}</small>
      </span>
    </button>
  );
}

function WorkflowView({ workflowState, filter, onFilterChange, sort, onSortChange }) {
  const { workflow, completions, loading, toggleDog } = workflowState;
  const visibleDogs = useMemo(
    () => applyEnrichmentWorkflowView(workflow.dogs, { filter, sort }),
    [workflow.dogs, filter, sort]
  );
  return (
    <section className="workflow-command workflow-command-tight">
      <div className="workflow-table-card">
        <div className="workflow-table-toolbar">
          <div>
            <span className="section-title">Dogs for This Date</span>
            <p>{visibleDogs.length} of {workflow.rowCount} rows shown. Default order is earliest scheduled departure first.</p>
          </div>
          <div className="workflow-table-controls">
            <div className="workflow-filter-pills" aria-label="Filter enrichment workflow dogs">
              {ENRICHMENT_WORKFLOW_FILTERS.map((option) => {
                const count = countEnrichmentWorkflowFilter(workflow.dogs, option.id);
                if (option.id !== "all" && count === 0) return null;
                return (
                  <button
                    key={option.id}
                    type="button"
                    className={filter === option.id ? "active" : ""}
                    onClick={() => onFilterChange(option.id)}
                  >
                    {option.label} <span>{count}</span>
                  </button>
                );
              })}
            </div>
            <label className="workflow-sort-select">
              <span>Sort</span>
              <select value={sort} onChange={(event) => onSortChange(event.target.value)}>
                {ENRICHMENT_WORKFLOW_SORTS.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </label>
            <WorkflowPlaygroupLegend />
          </div>
        </div>
        {renderWorkflowTable({ loading, workflow, visibleDogs, completions, toggleDog })}
      </div>
    </section>
  );
}

function renderWorkflowTable({ loading, workflow, visibleDogs, completions, toggleDog }) {
  if (loading && !workflow.rowCount) {
    return (
      <div className="workflow-loading">
        <div className="workflow-loading-orbit" />
        <span>Loading Enrichment workflow...</span>
      </div>
    );
  }
  if (workflow.rowCount === 0) {
    return (
      <div className="empty-state compact">
        <I.Sparkle />
        <h2>No scheduled enrichments</h2>
        <p>No Gingr Enrichment services are scheduled for this date.</p>
      </div>
    );
  }
  return (
    <div className="workflow-table-wrap">
      <table className="workflow-table">
        <thead>
          <tr>
            <th>Dog</th>
            <th>Room / Wing</th>
            <th>Timing</th>
            <th>Owner</th>
            <th>Status</th>
            <th>Completed</th>
          </tr>
        </thead>
        <tbody>
          {visibleDogs.map((dog) => {
            const completion = completions[dog.id];
            const serviceDetail = getWorkflowExtraServiceDetail(dog.services);
            return (
              <tr key={dog.id} className={completion ? "complete" : dog.status === "needs_review" ? "review" : ""}>
                <td>
                  <div className="workflow-dog-cell">
                    <WorkflowDogAvatar dog={dog} />
                    <div>
                      <div className="workflow-dog-name-line">
                        <strong>{dog.animalName}</strong>
                        <WorkflowPlaygroupBadges tags={dog.playgroupTags} />
                      </div>
                      <WorkflowReservationLine dog={dog} />
                      {serviceDetail ? <span className="workflow-service-line">{serviceDetail}</span> : null}
                      {dog.reason ? <small className="workflow-review-reason">{dog.reason}</small> : null}
                    </div>
                  </div>
                </td>
                <td>
                  <div className="workflow-room-cell">
                    <strong>{dog.roomLabel || "-"}</strong>
                    <span>{dog.roomWing || "Unassigned"}</span>
                  </div>
                </td>
                <td>
                  <WorkflowTimingCell dog={dog} />
                </td>
                <td>{dog.ownerName}</td>
                <td><span className={`workflow-status ${dog.status}`}>{dog.status === "needs_review" ? "Needs review" : "Scheduled"}</span></td>
                <td>
                  <button
                    type="button"
                    className={completion ? "workflow-check complete" : "workflow-check"}
                    onClick={() => {
                      Promise.resolve(toggleDog(dog)).catch((err) => console.error("[enrichment workflow] completion save failed:", err));
                    }}
                  >
                    {completion ? <I.Check /> : null}
                  </button>
                  {completion ? <small>{completion.by || "Staff"} · {formatHealthAge(completion.at)}</small> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function getWorkflowExtraServiceDetail(services = []) {
  return (Array.isArray(services) ? services : [])
    .map((service) => String(service || "").trim())
    .filter((service) => service && !service.toLowerCase().includes("enrichment"))
    .join(", ");
}

function WorkflowTimingCell({ dog }) {
  const isCheckedOut = dog?.timing?.isCheckedOut;
  return (
    <div className="workflow-timing-cell">
      <span><strong>In</strong>{dog.arrivalLabel || "-"}</span>
      <span><strong>Out</strong>{dog.departureLabel || "-"}</span>
      {isCheckedOut ? <small>Checked out {dog.actualDepartureLabel || ""}</small> : null}
    </div>
  );
}

function WorkflowReservationLine({ dog }) {
  if (!dog?.reservationLabel && !dog?.reservationWindow) return null;
  return (
    <div className="workflow-reservation-line">
      {dog.reservationLabel ? <span className={`workflow-reservation-kind ${dog.reservationCategory || "other"}`}>{dog.reservationLabel}</span> : null}
      {dog.reservationWindow ? <span className="workflow-reservation-window">{dog.reservationWindow}</span> : null}
    </div>
  );
}

function WorkflowDogAvatar({ dog }) {
  const [failed, setFailed] = useState(false);
  const initial = (dog?.animalName || "?").trim().charAt(0).toUpperCase() || "?";
  if (dog?.imageUrl && !failed) {
    return (
      <img
        className="workflow-dog-avatar"
        src={dog.imageUrl}
        alt={dog.animalName}
        loading="eager"
        decoding="async"
        onError={() => setFailed(true)}
      />
    );
  }
  return <span className="workflow-dog-avatar fallback">{initial}</span>;
}

const WORKFLOW_PLAYGROUP_BADGE_META = {
  large: { label: "LG", title: "Large daycare", bg: "#DCFCE7", color: "#166534" },
  small: { label: "SM", title: "Small daycare", bg: "#DBEAFE", color: "#1D4ED8" },
  private_play: { label: "PP", title: "Private play", bg: "#FEE2E2", color: "#DC2626" },
  evaluation: { label: "EV", title: "Evaluation", bg: "#FEF9C3", color: "#CA8A04" },
};
const WORKFLOW_PLAYGROUP_LEGEND_ORDER = ["large", "small", "private_play", "evaluation"];

function WorkflowPlaygroupBadges({ tags = [] }) {
  const visibleTags = Array.isArray(tags) ? tags.filter((tag) => WORKFLOW_PLAYGROUP_BADGE_META[tag]) : [];
  if (!visibleTags.length) return null;
  return (
    <span className="workflow-playgroup-badges" aria-label={visibleTags.map((tag) => WORKFLOW_PLAYGROUP_BADGE_META[tag].title).join(", ")}>
      {visibleTags.map((tag) => <WorkflowPlaygroupBadge key={tag} tag={tag} />)}
    </span>
  );
}

function WorkflowPlaygroupLegend() {
  return (
    <div className="workflow-playgroup-legend" aria-label="Playgroup key">
      {WORKFLOW_PLAYGROUP_LEGEND_ORDER.map((tag) => {
        const badge = WORKFLOW_PLAYGROUP_BADGE_META[tag];
        return (
          <span key={tag} className="workflow-playgroup-legend-item" title={badge.title}>
            <WorkflowPlaygroupBadge tag={tag} />
            <span>{badge.title}</span>
          </span>
        );
      })}
    </div>
  );
}

function WorkflowPlaygroupBadge({ tag }) {
  const badge = WORKFLOW_PLAYGROUP_BADGE_META[tag];
  if (!badge) return null;
  return (
    <span
      className="workflow-playgroup-badge"
      title={badge.title}
      style={{ background: badge.bg, color: badge.color }}
    >
      {badge.label}
    </span>
  );
}

function EnrichmentHealthModal({ workflowState, onClose }) {
  const { workflow, health, refreshState, lastSuccessAt, lastStartedAt, refreshing, auditLog, refresh } = workflowState;
  const tone = healthTone(health?.status);
  return (
    <div className="enrichment-health-modal" role="dialog" aria-modal="true" aria-label={`Enrichment Health: ${tone.label}`}>
      <div className="enrichment-health-shell">
        <div className="enrichment-health-head">
          <div>
            <h2>Enrichment Health: {tone.label}</h2>
            <p>Gingr Enrichment service-date pull, workflow counts, manual refresh history, and recent run evidence.</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose}>x</button>
        </div>
        <div className="enrichment-health-body">
          <div className="enrichment-health-section">
            <div className="enrichment-health-section-title">
              <span style={{ background: tone.color, boxShadow: `0 0 14px ${tone.color}88` }} />
              <strong>Gingr Enrichment Pull</strong>
            </div>
            <div className="enrichment-health-fact-grid">
              <HealthFact label="Status" value={tone.label} color={tone.color} />
              <HealthFact label="Frequency" value={`Every ${Math.round(ENRICHMENT_WORKFLOW_REFRESH_MS / 1000)}s`} />
              <HealthFact label="Last Sync" value={formatHealthAge(lastSuccessAt)} />
              <HealthFact label="Next Sync" value={refreshState?.label || "Waiting"} />
              <HealthFact label="Scheduled" value={workflow.scheduledCount} />
              <HealthFact label="Needs Review" value={workflow.needsReviewCount} />
              <HealthFact label="Rows" value={workflow.rowCount} />
              <HealthFact label="Started" value={lastStartedAt ? formatHealthAge(lastStartedAt) : "None"} />
            </div>
            <button
              type="button"
              className="enrichment-health-refresh"
              disabled={refreshing}
              onClick={() => {
                Promise.resolve(refresh()).catch((err) => console.error("[enrichment workflow] modal refresh failed:", err));
              }}
            >
              <I.RefreshCw /> {refreshing ? "Refreshing..." : "Force Refresh Gingr Pull"}
            </button>
          </div>
          <div className="enrichment-health-section">
            <div className="enrichment-health-section-title">
              <span style={{ background: "#38BDF8", boxShadow: "0 0 14px rgba(56,189,248,.55)" }} />
              <strong>Recent Runs</strong>
            </div>
            <div className="enrichment-audit-list">
              {auditLog?.length ? auditLog.map((run) => (
                <div key={run.id} className="enrichment-audit-row">
                  <div>
                    <strong>{run.status === "error" ? "Error" : "Success"}</strong>
                    <span>{run.source || "refresh"} · {run.completedAt ? formatHealthAge(run.completedAt) : "running"}</span>
                    {run.error ? <small>{run.error}</small> : null}
                  </div>
                  <div className="enrichment-audit-metrics">
                    <HealthFact label="Scheduled" value={run.scheduledCount ?? "-"} />
                    <HealthFact label="Review" value={run.needsReviewCount ?? "-"} />
                    <HealthFact label="Rows" value={run.rowCount ?? "-"} />
                    <HealthFact label="Duration" value={formatHealthDuration(run.durationMs)} />
                  </div>
                </div>
              )) : <p>No refresh runs in this session yet. Force refresh to write the first audit entry.</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function HealthFact({ label, value, color }) {
  return (
    <div className="enrichment-health-fact">
      <span>{label}</span>
      <strong style={{ color }}>{value == null || value === "" ? "-" : value}</strong>
    </div>
  );
}

function formatHealthDuration(ms) {
  if (ms == null) return "-";
  const value = Number(ms);
  if (!Number.isFinite(value)) return "-";
  if (value < 1000) return `${Math.round(value)}ms`;
  return `${(value / 1000).toFixed(1)}s`;
}

function CalendarBoard({ monthDate, events, selectedDate, selectedEventId, onSelectDate, onSelectEvent, onNew }) {
  const weeks = buildCalendarWeeks(monthDate);
  return (
    <div className="calendar-shell">
      <div className="weekday-row">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <div key={day}>{day}</div>)}
      </div>
      <div className="calendar-grid">
        {weeks.flat().map((day) => {
          const dayEvents = getEventsForDate(events, day.date, "staff");
          const selected = day.date === selectedDate;
          return (
            <button
              type="button"
              key={day.date}
              className={`calendar-day ${day.inMonth ? "" : "muted"} ${selected ? "selected" : ""}`}
              onClick={() => onSelectDate(day.date)}
            >
              <span className="day-number">{day.dayNumber}</span>
              <div className="day-events">
                {dayEvents.slice(0, 3).map((event) => {
                  const theme = getThemeConfig(event.visual_theme);
                  return (
                    <span
                      key={event.id}
                      className={String(event.id) === String(selectedEventId) ? "day-event active" : "day-event"}
                      style={{ borderColor: theme.color, background: theme.soft, color: theme.color }}
                      onClick={(clickEvent) => {
                        clickEvent.stopPropagation();
                        onSelectEvent(event);
                      }}
                    >
                      {event.title}
                    </span>
                  );
                })}
                {dayEvents.length > 3 ? <span className="more-events">+{dayEvents.length - 3} more</span> : null}
              </div>
              {onNew ? (
                <span
                  className="add-day-event"
                  onClick={(clickEvent) => {
                    clickEvent.stopPropagation();
                    onNew(day.date);
                  }}
                >
                  Add
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EventDetail({ event, dayEvents, onSelectEvent, onEdit, onDuplicate, canManage }) {
  if (!event) {
    return (
      <aside className="detail-panel">
        <div className="empty-state">
          <I.Calendar />
          <h2>No enrichment selected</h2>
          <p>Select a calendar day to inspect the event SOP, products, and prep notes.</p>
        </div>
      </aside>
    );
  }

  const theme = getThemeConfig(event.visual_theme);
  return (
    <aside className="detail-panel">
      <div className="detail-hero" style={{ background: `linear-gradient(135deg, ${theme.soft}, #FFFFFF)` }}>
        <div className="detail-topline">
          <span style={{ color: theme.color }}>{event.category}</span>
          <strong>{formatEnrichmentPrice(event)}</strong>
        </div>
        <h2>{event.title}</h2>
        <div className="detail-date">{formatEventDate(event.event_date, { weekday: "long", year: true })}</div>
        {event.summary ? <p>{event.summary}</p> : null}
        <div className="detail-chips">
          <span>{ENRICHMENT_FOCUS_LABELS[event.focus_area] || event.focus_area}</span>
          <span>{event.customer_visible ? "Customer graphic" : "Staff only"}</span>
          <span>{event.status}</span>
        </div>
      </div>

      {dayEvents.length > 1 ? (
        <div className="same-day-list">
          <div className="section-title">Same Day Events</div>
          {dayEvents.map((item) => (
            <button key={item.id} type="button" className={item.id === event.id ? "same-day active" : "same-day"} onClick={() => onSelectEvent(item.id)}>
              {item.title}
            </button>
          ))}
        </div>
      ) : null}

      <DetailSection title="SOP">
        <p>{event.sop_details || event.summary || "No SOP details added yet."}</p>
      </DetailSection>
      <DetailSection title="Setup Locations">
        <PillList items={event.setup_locations} empty="No setup locations listed." />
      </DetailSection>
      <DetailSection title="Products">
        {event.products?.length ? (
          <div className="product-list">
            {event.products.map((product, index) => (
              <ProductReferenceCard key={`${product.name}_${index}`} product={product} />
            ))}
          </div>
        ) : <p>No products listed.</p>}
      </DetailSection>
      <DetailSection title="Run Checklist">
        <ChecklistList items={event.checklist} />
      </DetailSection>
      {event.staff_notes ? (
        <DetailSection title="Staff Notes">
          <p>{event.staff_notes}</p>
        </DetailSection>
      ) : null}
      {canManage ? (
        <div className="detail-actions">
          <button type="button" className="primary-btn wide" onClick={onEdit}><I.Edit /> Edit Event</button>
          <button type="button" className="secondary-btn wide" onClick={() => onDuplicate?.(event)}><I.Plus /> Duplicate Next Month</button>
        </div>
      ) : null}
    </aside>
  );
}

function DetailSection({ title, children }) {
  return (
    <section className="detail-section">
      <div className="section-title">{title}</div>
      {children}
    </section>
  );
}

function PillList({ items, empty }) {
  if (!items?.length) return <p>{empty}</p>;
  return <div className="pill-list">{items.map((item) => <span key={item}>{item}</span>)}</div>;
}

function ChecklistList({ items }) {
  if (!items?.length) return <p>No checklist steps listed.</p>;
  return (
    <div className="checklist-list">
      {items.map((item, index) => (
        <div key={`${item}_${index}`}><I.CheckCircle /> <span>{item}</span></div>
      ))}
    </div>
  );
}

function getProductHref(product) {
  const url = String(product?.url || "").trim();
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (/^(www\.)?[\w.-]+\.[a-z]{2,}([/?#].*)?$/i.test(url)) return `https://${url}`;
  return "";
}

function getLinkHost(href) {
  try {
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return "External link";
  }
}

function ProductReferenceCard({ product }) {
  const href = getProductHref(product);
  return (
    <article className={href ? "product-reference-card linked" : "product-reference-card"}>
      <div className="product-reference-main">
        <strong>{product.name}</strong>
        <span>{product.quantity || (href ? getLinkHost(href) : "No link added")}</span>
      </div>
      {href ? (
        <a className="product-reference-action" href={href} target="_blank" rel="noreferrer" aria-label={`Open ${product.name}`}>
          <I.Link />
          <span>Open</span>
        </a>
      ) : null}
    </article>
  );
}

function ProductLinksInline({ products = [] }) {
  if (!products.length) return <span>No products listed</span>;
  return (
    <div className="product-inline-links">
      {products.map((product, index) => {
        const href = getProductHref(product);
        if (!href) return <span key={`${product.name}_${index}`} className="product-text">{product.name}</span>;
        return (
          <a key={`${product.name}_${index}`} href={href} target="_blank" rel="noreferrer">
            <I.Link />
            <span>{product.name}</span>
          </a>
        );
      })}
    </div>
  );
}

function ResourceLinks({ links = [] }) {
  if (!links.length) return <p>No linked resources added.</p>;
  return (
    <div className="resource-link-list">
      {links.map((link) => (
        <a key={link.url} href={link.url} target="_blank" rel="noreferrer">
          <I.Link />
          <span>{link.label}</span>
        </a>
      ))}
    </div>
  );
}

function SopSectionList({ sections = [] }) {
  return (
    <div className="sop-section-list">
      {sections.map((section) => (
        <section key={section.title}>
          <h3>{section.title}</h3>
          <ChecklistList items={section.items || []} />
        </section>
      ))}
    </div>
  );
}

function ResourceLinksEditor({ links = [], onChange }) {
  function updateLink(id, field, value) {
    onChange(links.map((link) => (link.id === id ? { ...link, [field]: value } : link)));
  }

  function removeLink(id) {
    onChange(links.filter((link) => link.id !== id));
  }

  return (
    <div className="resource-editor">
      {links.map((link, index) => (
        <div key={link.id} className="resource-editor-row">
          <input
            aria-label={`Resource ${index + 1} label`}
            value={link.label}
            onChange={(event) => updateLink(link.id, "label", event.target.value)}
            placeholder="Resource name"
          />
          <input
            aria-label={`Resource ${index + 1} URL`}
            value={link.url}
            onChange={(event) => updateLink(link.id, "url", event.target.value)}
            placeholder="https://..."
          />
          <button type="button" aria-label={`Remove ${link.label || "resource"}`} onClick={() => removeLink(link.id)}>
            <I.Trash />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="secondary-btn wide"
        onClick={() => onChange([...links, { id: gid("resource"), label: "", url: "" }])}
      >
        <I.Plus /> Add Resource
      </button>
    </div>
  );
}

function ProgramSopEditor({ sections = [], onChange }) {
  function updateSection(id, patch) {
    onChange(sections.map((section) => (section.id === id ? { ...section, ...patch } : section)));
  }

  function removeSection(id) {
    onChange(sections.filter((section) => section.id !== id));
  }

  function updateItem(sectionId, itemId, text) {
    onChange(sections.map((section) => {
      if (section.id !== sectionId) return section;
      return {
        ...section,
        items: section.items.map((item) => (item.id === itemId ? { ...item, text } : item)),
      };
    }));
  }

  function addItem(sectionId) {
    onChange(sections.map((section) => (
      section.id === sectionId
        ? { ...section, items: [...section.items, { id: gid("item"), text: "" }] }
        : section
    )));
  }

  function removeItem(sectionId, itemId) {
    onChange(sections.map((section) => (
      section.id === sectionId
        ? { ...section, items: section.items.filter((item) => item.id !== itemId) }
        : section
    )));
  }

  return (
    <div className="program-sop-editor">
      {sections.map((section, sectionIndex) => (
        <section key={section.id} className="program-sop-editor-section">
          <div className="program-sop-editor-head">
            <input
              aria-label={`SOP section ${sectionIndex + 1} title`}
              value={section.title}
              onChange={(event) => updateSection(section.id, { title: event.target.value })}
              placeholder="Section title"
            />
            <button type="button" aria-label={`Remove ${section.title || "section"}`} onClick={() => removeSection(section.id)}>
              <I.Trash />
            </button>
          </div>
          <div className="program-sop-editor-items">
            {section.items.map((item, itemIndex) => (
              <div key={item.id} className="program-sop-editor-item">
                <textarea
                  aria-label={`${section.title || "SOP section"} item ${itemIndex + 1}`}
                  value={item.text}
                  onChange={(event) => updateItem(section.id, item.id, event.target.value)}
                  placeholder="SOP bullet"
                  rows={2}
                />
                <button type="button" aria-label="Remove SOP bullet" onClick={() => removeItem(section.id, item.id)}>
                  <I.Trash />
                </button>
              </div>
            ))}
            <button type="button" className="secondary-btn" onClick={() => addItem(section.id)}>
              <I.Plus /> Add SOP Line
            </button>
          </div>
        </section>
      ))}
      <button
        type="button"
        className="secondary-btn wide"
        onClick={() => onChange([...sections, { id: gid("section"), title: "", items: [{ id: gid("item"), text: "" }] }])}
      >
        <I.Plus /> Add SOP Section
      </button>
    </div>
  );
}

function ScriptList({ scripts = [] }) {
  return (
    <div className="script-list">
      {scripts.map((script) => (
        <div key={script.label} className="script-block">
          <strong>{script.label}</strong>
          <p>{script.text}</p>
        </div>
      ))}
    </div>
  );
}

function getLinkedProducts(events = []) {
  const seen = new Set();
  return events.flatMap((event) => (event.products || []).map((product) => ({ ...product, eventTitle: event.title })))
    .filter((product) => {
      const href = getProductHref(product);
      const key = `${href}|${String(product.name || "").toLowerCase()}`;
      if (!href || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function buildProgramConfigDraft(config = {}) {
  return {
    resourceLinks: (config.resourceLinks || []).map((link) => ({
      id: link.id || gid("resource"),
      label: link.label || "",
      url: link.url || "",
    })),
    programSopSections: (config.programSopSections || []).map((section) => ({
      id: section.id || gid("section"),
      title: section.title || "",
      items: (section.items || []).map((item) => ({ id: gid("item"), text: item || "" })),
    })),
  };
}

function stripProgramConfigDraft(draft = {}) {
  return {
    resourceLinks: (draft.resourceLinks || [])
      .map((link) => ({ label: String(link.label || "").trim(), url: String(link.url || "").trim() }))
      .filter((link) => link.label || link.url),
    programSopSections: (draft.programSopSections || [])
      .map((section) => ({
        title: String(section.title || "").trim(),
        items: (section.items || []).map((item) => String(item.text || "").trim()).filter(Boolean),
      }))
      .filter((section) => section.title || section.items.length),
  };
}

function SopView({ event, monthEvents, programConfigState, canEditProgramConfig, onNotify }) {
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

function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function ProductEditor({ value, onChange, disabled }) {
  const products = useMemo(() => parseProducts(value), [value]);
  const rows = [...products, { name: "", quantity: "", url: "" }];

  function commit(nextRows) {
    onChange(serializeProducts(nextRows));
  }

  function updateRow(index, field, nextValue) {
    const nextRows = rows.map((row) => ({ ...row }));
    nextRows[index] = { ...nextRows[index], [field]: nextValue };
    commit(nextRows);
  }

  function removeRow(index) {
    commit(rows.filter((_, rowIndex) => rowIndex !== index));
  }

  return (
    <div className="product-editor">
      {rows.map((product, index) => (
        <div key={`product-row-${index}`} className="product-editor-row">
          <input
            disabled={disabled}
            value={product.name}
            onChange={(event) => updateRow(index, "name", event.target.value)}
            placeholder="Product name"
          />
          <input
            disabled={disabled}
            value={product.quantity}
            onChange={(event) => updateRow(index, "quantity", event.target.value)}
            placeholder="Qty / note"
          />
          <input
            disabled={disabled}
            value={product.url}
            onChange={(event) => updateRow(index, "url", event.target.value)}
            placeholder="Link"
          />
          <button type="button" disabled={disabled || (!product.name && !product.quantity && !product.url)} aria-label={`Remove product ${index + 1}`} onClick={() => removeRow(index)}>
            <I.Trash />
          </button>
        </div>
      ))}
    </div>
  );
}

function MarketingHandoff({ monthDate, events, audience, setAudience, graphics, graphicUrls, loading, uploading, canManage, onUpload, onCopyBrief, onDownloadCsv }) {
  const linkedProducts = useMemo(() => getLinkedProducts(events), [events]);
  return (
    <div className="handoff-grid">
      <div className="handoff-controls">
        <div className="section-title">Marketing Handoff</div>
        <h2>{getMonthLabel(monthDate)}</h2>
        <p>Use K9 Operations for event entry, SOP/product prep, and final graphic storage. Marketing can build the polished K9 Resorts graphic separately, then upload the employee and customer versions here.</p>
        <div className="audience-options">
          {ENRICHMENT_AUDIENCES.map((item) => (
            <button key={item.id} type="button" className={audience === item.id ? "audience active" : "audience"} onClick={() => setAudience(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
        <button type="button" className="primary-btn wide" onClick={onCopyBrief}><I.Clipboard /> Copy Event Brief</button>
        <button type="button" className="secondary-btn wide" onClick={onDownloadCsv}><I.Download /> Download CSV</button>
        <div className="notes-box">
          {DEFAULT_ENRICHMENT_NOTES.map((note) => <p key={note}>{note}</p>)}
        </div>
        <div className="product-link-panel">
          <div className="section-title">Product Links</div>
          {linkedProducts.length ? (
            linkedProducts.slice(0, 8).map((product, index) => (
              <a key={`${product.name}_${index}`} href={getProductHref(product)} target="_blank" rel="noreferrer">
                <I.Link />
                <span>{product.name}</span>
              </a>
            ))
          ) : (
            <p>Add product links in Create / Edit.</p>
          )}
        </div>
      </div>
      <div className="handoff-main">
        <div className="graphic-upload-grid">
          {GRAPHIC_AUDIENCES.map((item) => (
            <GraphicUploadCard
              key={item.id}
              audience={item}
              graphic={graphics[item.id]}
              signedUrl={graphicUrls[item.id]}
              loading={loading}
              uploading={uploading === item.id}
              canManage={canManage}
              onUpload={onUpload}
            />
          ))}
        </div>
        <div className="handoff-event-list">
          <div className="section-title">Events for Marketing</div>
          {events.length ? events.map((event) => (
            <article key={event.id} className="handoff-event">
              <div>
                <strong>{formatEventDate(event.event_date)} - {event.title}</strong>
                <p>{event.summary || event.sop_details || "No summary added."}</p>
              </div>
              <div className="handoff-event-meta">
                <span>{event.customer_visible ? "Customer" : "Staff only"}</span>
                <span>{ENRICHMENT_FOCUS_LABELS[event.focus_area] || event.focus_area}</span>
              </div>
            </article>
          )) : (
            <div className="empty-state compact">
              <I.Calendar />
              <h2>No events this month</h2>
              <p>Add events in Create / Edit, then hand the list to marketing.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GraphicUploadCard({ audience, graphic, signedUrl, loading, uploading, canManage, onUpload }) {
  const isImage = (graphic?.content_type || "").startsWith("image/");
  return (
    <section className="graphic-upload-card">
      <div className="graphic-upload-head">
        <div>
          <div className="section-title">{audience.label}</div>
          <p>{audience.description}</p>
        </div>
        {graphic ? <span className="graphic-status">Uploaded</span> : <span className="graphic-status missing">Missing</span>}
      </div>
      {signedUrl ? (
        <div className="graphic-viewer">
          {isImage ? (
            <img src={signedUrl} alt={`${audience.label} preview`} />
          ) : (
            <a href={signedUrl} target="_blank" rel="noreferrer"><I.FileText /> View uploaded file</a>
          )}
        </div>
      ) : (
        <div className="graphic-empty">
          <I.FileText />
          <p>{loading ? "Checking uploaded graphics..." : "No uploaded graphic for this month yet."}</p>
        </div>
      )}
      {graphic ? (
        <div className="graphic-file-meta">
          <span>{graphic.file_name}</span>
          <span>{formatFileSize(graphic.file_size_bytes)}</span>
        </div>
      ) : null}
      {canManage ? (
        <label className="secondary-btn wide upload-btn">
          <I.Download /> {uploading ? "Uploading..." : graphic ? "Replace Graphic" : "Upload Graphic"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,application/pdf"
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0] || null;
              event.target.value = "";
              Promise.resolve(onUpload(audience.id, file)).catch((uploadError) => {
                console.error("Enrichment graphic upload action failed:", uploadError);
              });
            }}
          />
        </label>
      ) : null}
    </section>
  );
}

function formatEnrichmentPrice(event) {
  const cents = Number(event?.price_cents || 0);
  if (!cents) return "$15 add-on";
  return `$${Math.round(cents / 100)} add-on`;
}

function addMonthsPreserveDay(date, delta) {
  const parsed = parseDateParts(date);
  const target = new Date(parsed.year, parsed.month - 1 + delta, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(parsed.day, lastDay));
  return normalizeDate(target);
}

function parseDateParts(date) {
  const [year, month, day] = normalizeDate(date).split("-").map(Number);
  return { year, month, day };
}

function buildMarketingBrief({ monthDate, events, audience }) {
  const lines = [
    `K9 Resorts Enrichment Marketing Brief - ${getMonthLabel(monthDate)}`,
    `Audience: ${ENRICHMENT_AUDIENCES.find((item) => item.id === audience)?.label || audience}`,
    "",
    "Notes:",
    ...DEFAULT_ENRICHMENT_NOTES.map((note) => `- ${note}`),
    "",
    "Events:",
  ];
  events.forEach((event) => {
    lines.push(`- ${formatEventDate(event.event_date)} | ${event.title}`);
    if (event.summary) lines.push(`  Summary: ${event.summary}`);
    if (event.calendar_note) lines.push(`  Calendar note: ${event.calendar_note}`);
    if (event.products?.length) {
      lines.push(`  Products: ${event.products.map((product) => product.name).join(", ")}`);
    }
  });
  return lines.join("\n");
}

function buildMarketingCsv(events = []) {
  const header = ["Date", "Title", "Category", "Customer Visible", "Focus", "Summary", "Products"];
  const rows = events.map((event) => [
    event.event_date,
    event.title,
    event.category,
    event.customer_visible ? "Yes" : "No",
    ENRICHMENT_FOCUS_LABELS[event.focus_area] || event.focus_area,
    event.summary || event.sop_details || "",
    (event.products || []).map((product) => product.url ? `${product.name} (${product.url})` : product.name).join("; "),
  ]);
  return [header, ...rows].map((row) => row.map(escapeCsvCell).join(",")).join("\n");
}

function escapeCsvCell(value) {
  const text = String(value ?? "");
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadTextFile({ content, type, filename }) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function formatFileSize(bytes) {
  const value = Number(bytes || 0);
  if (!value) return "Unknown size";
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function isMissingSupabaseResource(error) {
  const message = `${error?.code || ""} ${error?.message || ""}`.toLowerCase();
  return message.includes("42p01") || message.includes("does not exist") || message.includes("schema cache") || message.includes("bucket not found");
}

export default EnrichmentsPage;
