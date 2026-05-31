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

// Enrichment events (the company program + each resort's own) are managed only by
// the enterprise-admin grouping; every other role gets a read-only view.
const ENTERPRISE_ADMIN_ROLES = new Set(["enterprise_admin", "owner", "developer"]);
const BRAND = {
  forest: "#14532D",
  lime: "#84CC16",
  limeSoft: "#D9F99D",
  slate900: "#0F172A",
  slate800: "#1E293B",
  slate600: "#475569",
  slate400: "#94A3B8",
  slate200: "#E2E8F0",
  slate50: "#F8FAFC",
  blue: "#2563EB",
  amber: "#F59E0B",
  rose: "#EC4899",
};
const GRAPHIC_BUCKET = "enrichment-calendar-graphics";
const K9_FONT_STACK = "'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const GRAPHIC_AUDIENCES = [
  { id: "customer", label: "Customer Graphic", description: "Client-facing K9 Resorts calendar created by marketing." },
  { id: "employee", label: "Employee Graphic", description: "Internal staff calendar graphic created by marketing." },
];

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

const PAGE_CSS = `
@keyframes enrichmentPanelIn{from{opacity:0;transform:translateY(16px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes enrichmentFloatIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes enrichmentHealthPulse{0%,100%{transform:scale(1);box-shadow:0 0 12px currentColor}50%{transform:scale(1.32);box-shadow:0 0 24px currentColor}}
@keyframes enrichmentHealthSweep{0%{transform:translateX(-100%);opacity:.16}45%{opacity:.75}100%{transform:translateX(100%);opacity:.16}}
@keyframes enrichmentProgressSheen{0%{transform:translateX(-120%);opacity:0}25%{opacity:.62}100%{transform:translateX(140%);opacity:0}}
@keyframes enrichmentSoftGlow{0%,100%{transform:translate3d(-12%,0,0) rotate(10deg);opacity:.22}50%{transform:translate3d(18%,4%,0) rotate(10deg);opacity:.42}}
@keyframes enrichmentOrbit{to{transform:rotate(360deg)}}
.page-header{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;margin-bottom:16px;font-family:${K9_FONT_STACK}}
.back-link{display:inline-flex;align-items:center;gap:7px;border:1px solid transparent;background:transparent;color:${C.textMut};font-family:${K9_FONT_STACK};font-size:13px;line-height:18px;font-weight:800;letter-spacing:0;cursor:pointer;margin:0 0 10px;padding:7px 9px 7px 6px;border-radius:999px;transition:background .18s ease,border-color .18s ease,color .18s ease,transform .18s ease}
.back-link span{font-weight:800}
.back-link svg{width:17px;height:17px;stroke-width:2.2}
.back-link:hover{background:#fff;border-color:rgba(20,83,45,.16);color:${C.pri};transform:translateX(-1px)}
.eyebrow,.panel-eyebrow{font-size:10px;line-height:14px;font-weight:850;letter-spacing:.08em;text-transform:uppercase;color:${C.pri}}
.page-header h1{font-size:32px;line-height:38px;font-weight:850;margin:4px 0;color:${C.text};letter-spacing:0}
.page-header p{font-size:14px;line-height:22px;font-weight:400;color:${C.textSec};max-width:680px;margin:0}
.header-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.month-control{display:flex;align-items:center;gap:8px;background:#fff;border:1px solid ${C.border};border-radius:6px;padding:6px}
.month-control button{width:36px;height:36px;border-radius:6px;border:0;background:${C.surfaceHover};color:${C.text};display:flex;align-items:center;justify-content:center;cursor:pointer}
.month-control span{font-size:14px;line-height:20px;font-weight:600;color:${C.text};min-width:132px;text-align:center}
.primary-btn,.secondary-btn,.danger-btn{border-radius:6px;padding:10px 14px;font:900 14px/20px ${K9_FONT_STACK};letter-spacing:0;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease,background .18s ease}
.primary-btn:hover,.secondary-btn:hover,.danger-btn:hover{transform:translateY(-1px)}
.primary-btn{border:1px solid ${C.pri};background:${C.pri};color:#fff;box-shadow:0 10px 24px rgba(20,83,45,.18)}
.secondary-btn{background:#fff;color:${C.pri};border:1px solid rgba(20,83,45,.22);box-shadow:0 8px 18px rgba(15,23,42,.06)}
.danger-btn{background:${C.dan};color:#fff;border:1px solid ${C.dan};box-shadow:0 1px 2px rgba(0,0,0,.05)}
.wide{width:100%}
.storage-pill{font-size:10px;line-height:14px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;border-radius:999px;padding:6px 9px;background:#fff;color:${C.textMut};border:1px solid ${C.border}}
.storage-pill.settings{color:${C.warn};background:${C.warnLt}}.storage-pill.seed{color:${C.textMut};background:${C.surfaceHover}}
.enrichment-daily-surface{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:12px;align-items:stretch}
.daily-module-card,.calendar-shell,.detail-panel,.sop-card,.sop-admin-card,.builder-form,.builder-preview,.handoff-controls,.handoff-main,.graphic-upload-card,.workflow-command,.workflow-side>div{background:#fff;border:1px solid rgba(148,163,184,.24);border-radius:8px;box-shadow:0 14px 36px rgba(15,23,42,.08);animation:enrichmentPanelIn .42s cubic-bezier(.16,1,.3,1) both}
.daily-module-card{min-height:214px;padding:16px;display:flex;flex-direction:column;gap:12px;position:relative;overflow:hidden;font-family:${K9_FONT_STACK};text-align:left;color:${C.text};transition:transform .22s cubic-bezier(.16,1,.3,1),box-shadow .22s ease,border-color .22s ease}
button.daily-module-card{width:100%;cursor:pointer}
.daily-module-card:hover{transform:translateY(-2px);box-shadow:0 18px 42px rgba(15,23,42,.1)}
.daily-module-card:before{content:"";position:absolute;inset:0 0 auto;height:3px;background:linear-gradient(90deg,${C.pri},${C.acc});opacity:.9}
.daily-module-card>*{position:relative;z-index:1}
.event-plan-card{border-color:color-mix(in srgb,var(--event-color,${C.pri}) 28%,rgba(148,163,184,.24));background:linear-gradient(135deg,#fff 0%,#fff 50%,var(--event-soft,#F8FAFC) 100%)}
.event-plan-card:before{background:linear-gradient(90deg,var(--event-color,${C.pri}),${C.acc})}
.event-plan-card.empty,.event-plan-card.loading{cursor:pointer;background:linear-gradient(135deg,#fff 0%,#F8FAFC 100%)}
.queue-card{background:linear-gradient(135deg,#fff 0%,#fff 52%,rgba(247,254,231,.72) 100%)}
.queue-card.has-review:before{background:linear-gradient(90deg,${C.warn},${C.acc})}
.queue-card:after{content:"";position:absolute;inset:-42% auto auto -28%;width:58%;height:170%;background:linear-gradient(90deg,transparent,rgba(132,204,22,.16),transparent);filter:blur(8px);animation:enrichmentSoftGlow 6.4s ease-in-out infinite;pointer-events:none}
.sop-snapshot-card{background:linear-gradient(135deg,#fff 0%,#fff 56%,#F8FAFC 100%)}
.daily-module-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
.daily-module-head h2,.daily-module-head h3{font-size:22px;line-height:28px;font-weight:900;color:${C.text};letter-spacing:0;margin:0 0 3px}
.event-plan-meta{font-size:12px;line-height:16px;font-weight:800;color:${C.textMut};margin-top:-4px}
.event-plan-card p{font-size:14px;line-height:21px;font-weight:650;color:${C.textSec};margin:0;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.event-plan-chip-row{display:flex;flex-wrap:wrap;gap:7px;margin-top:auto}
.event-plan-chip-row span,.module-price{border-radius:999px;background:#fff;border:1px solid rgba(15,23,42,.07);font-size:10px;line-height:14px;font-weight:900;color:${C.textSec};padding:5px 8px;white-space:nowrap}
.module-price{color:var(--event-color,${C.pri})}
.module-skeleton{border-radius:999px;background:#E5E7EB}
.module-skeleton.short{height:13px;width:130px}
.module-skeleton.title{height:26px;width:72%}
.module-skeleton.body{height:14px;width:88%}
.queue-main{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:72px;margin-top:auto}
.daily-run-completion{display:flex;align-items:baseline;gap:10px;min-width:0}
.daily-run-completion span{font-size:12px;line-height:16px;font-weight:900;color:${C.textMut};text-transform:uppercase;letter-spacing:.05em}
.daily-run-completion strong{font-size:46px;line-height:48px;font-weight:900;color:${C.text};letter-spacing:0;font-variant-numeric:tabular-nums}
.daily-run-review{display:inline-flex;align-items:center;gap:7px;border:1px solid rgba(217,119,6,.24);background:${C.warnLt};color:${C.warn};border-radius:999px;padding:8px 10px;font:900 12px/16px ${K9_FONT_STACK};white-space:nowrap;box-shadow:0 8px 20px rgba(217,119,6,.08)}
.daily-run-review svg{width:15px;height:15px;stroke-width:2.2}
.daily-run-progress{height:7px;border-radius:999px;background:rgba(20,83,45,.1);overflow:hidden;box-shadow:inset 0 0 0 1px rgba(20,83,45,.04)}
.daily-run-progress span{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,${C.pri},${C.acc});transition:width .48s cubic-bezier(.16,1,.3,1);position:relative;overflow:hidden}
.daily-run-progress span:after{content:"";position:absolute;inset:0;width:42%;background:linear-gradient(90deg,transparent,rgba(255,255,255,.7),transparent);animation:enrichmentProgressSheen 2.1s cubic-bezier(.16,1,.3,1) infinite}
.daily-module-foot{display:flex;align-items:center;justify-content:flex-end;gap:10px;margin-top:auto}
.daily-module-foot .workflow-health-btn{min-height:44px;min-width:158px;border-radius:10px;padding:0 12px}
.daily-module-head .secondary-btn{min-height:36px;padding:7px 10px;font-size:12px;line-height:16px}
.daily-sop-list{display:grid;gap:8px;min-height:0}
.daily-sop-list article{border:1px solid;border-radius:8px;padding:10px;animation:enrichmentFloatIn .28s ease both}
.daily-sop-list article strong{display:block;font-size:13px;line-height:18px;font-weight:900}
.daily-sop-list article span,.daily-sop-list p{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:12px;line-height:18px;color:${C.textSec};margin:4px 0 0}
.pill-list span{font-size:10px;line-height:14px;font-weight:600;border-radius:999px;background:${C.priLt};color:${C.pri};padding:5px 8px}
.inline-warning{margin-top:12px;border:1px solid rgba(217,119,6,.28);background:${C.warnLt};color:#92400E;border-radius:6px;padding:10px 12px;font-size:12px;line-height:16px;font-weight:500}
.inline-warning.top-warning{margin:0 0 12px}
.tab-row{display:flex;gap:8px;margin:8px 0 12px;flex-wrap:wrap}
.tab{border:1px solid ${C.border};background:#fff;color:${C.textSec};border-radius:999px;padding:9px 14px;font:900 14px/20px ${K9_FONT_STACK};letter-spacing:0;cursor:pointer;transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease,background .18s ease}
.tab:hover{transform:translateY(-1px);box-shadow:0 8px 18px rgba(15,23,42,.07);border-color:rgba(20,83,45,.18)}
.tab.active{background:${C.pri};color:#fff;border-color:${C.pri}}
.main-grid{display:grid;grid-template-columns:minmax(0,1fr) 380px;gap:16px;align-items:start}
.calendar-shell{padding:14px}
.weekday-row{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-bottom:6px}
.weekday-row div{background:${C.pri};color:#fff;border-radius:6px;padding:9px 0;text-align:center;font-size:12px;line-height:16px;font-weight:600}
.weekday-row div:first-child,.weekday-row div:last-child{background:${C.accLt};color:${C.pri}}
.calendar-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:6px}
.calendar-day{position:relative;min-height:132px;border:1px solid ${C.border};background:#fff;border-radius:6px;padding:10px;text-align:left;font-family:inherit;cursor:pointer;transition:border-color .15s, box-shadow .15s}
.calendar-day:hover{border-color:rgba(20,83,45,.36);box-shadow:0 4px 6px rgba(0,0,0,.07)}
.calendar-day.muted{opacity:.42}.calendar-day.selected{outline:2px solid ${C.pri};outline-offset:0}
.day-number{font-size:14px;line-height:20px;font-weight:600;color:${C.text}}
.day-events{display:flex;flex-direction:column;gap:5px;margin-top:8px}
.day-event{border:1px solid;border-radius:6px;padding:5px 6px;font-size:12px;line-height:16px;font-weight:600;white-space:normal}
.day-event.active{box-shadow:inset 0 0 0 1px currentColor}
.more-events{font-size:10px;line-height:14px;font-weight:600;color:${C.textMut}}
.add-day-event{position:absolute;right:8px;top:8px;font-size:10px;line-height:14px;font-weight:600;color:${C.pri};opacity:0}
.calendar-day:hover .add-day-event{opacity:1}
.detail-panel{padding:14px;position:sticky;top:12px}
.detail-hero{border-radius:8px;border:1px solid ${C.border};padding:18px}
.detail-topline{display:flex;justify-content:space-between;gap:10px;font-size:11px;line-height:16px;font-weight:500;text-transform:uppercase;letter-spacing:.05em}
.detail-hero h2{font-size:24px;line-height:32px;font-weight:700;margin:8px 0 4px;color:${C.text}}
.detail-date{font-size:12px;line-height:16px;font-weight:500;color:${C.textMut}}
.detail-hero p,.detail-section p,.sop-card p,.handoff-controls p,.graphic-upload-head p,.handoff-event p,.graphic-empty p{font-size:14px;line-height:22px;font-weight:400;color:${C.textSec};margin:10px 0 0}
.detail-chips,.pill-list{display:flex;flex-wrap:wrap;gap:7px;margin-top:12px}
.detail-chips span{font-size:10px;line-height:14px;font-weight:600;border-radius:999px;background:#fff;color:${C.textSec};padding:5px 8px;border:1px solid ${C.border}}
.same-day-list,.detail-section{padding:14px 2px;border-bottom:1px solid ${C.border}}
.section-title{font-family:${K9_FONT_STACK};font-size:11px;line-height:16px;font-weight:900;color:${C.textMut};text-transform:uppercase;letter-spacing:.05em;margin-bottom:9px}
.same-day{border:1px solid ${C.border};background:#fff;border-radius:6px;padding:8px 10px;margin:0 6px 6px 0;font:600 12px/16px inherit;color:${C.textSec};cursor:pointer}
.same-day.active{background:${C.pri};color:#fff}
.product-list{display:flex;flex-direction:column;gap:8px}
.product-reference-card,.prep-list div{border:1px solid ${C.border};border-radius:6px;padding:10px;background:${C.surfaceHover}}
.product-reference-card{display:flex;align-items:center;justify-content:space-between;gap:12px;transition:border-color .18s ease,box-shadow .18s ease,transform .18s ease}
.product-reference-card.linked:hover{border-color:rgba(37,99,235,.24);box-shadow:0 10px 22px rgba(37,99,235,.08);transform:translateY(-1px)}
.product-reference-main{min-width:0}
.product-reference-main strong,.prep-list strong{display:block;font-size:14px;line-height:20px;font-weight:850;color:${C.text}}
.product-reference-main span,.prep-list span{display:block;font-size:12px;line-height:16px;font-weight:650;color:${C.textMut};margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.product-reference-action,.product-inline-links a,.product-link-panel a,.resource-link-list a{display:inline-flex;align-items:center;gap:6px;color:${C.info};font-size:13px;line-height:18px;font-weight:850;text-decoration:none}
.product-reference-action{flex-shrink:0;border:1px solid rgba(37,99,235,.18);background:#fff;border-radius:999px;padding:6px 9px}
.product-reference-action:hover,.product-inline-links a:hover,.product-link-panel a:hover,.resource-link-list a:hover{border-color:rgba(37,99,235,.32);background:${C.infoLt};text-decoration:none}
.product-reference-action svg,.product-inline-links svg,.product-link-panel svg,.resource-link-list svg{width:15px;height:15px;stroke-width:1.8;flex-shrink:0}
.product-inline-links{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px}
.product-inline-links a,.product-inline-links .product-text{border:1px solid ${C.border};background:#fff;border-radius:999px;padding:6px 9px}
.product-inline-links .product-text{display:inline-flex;font-size:12px;line-height:16px;font-weight:750;color:${C.textMut}}
.checklist-list{display:flex;flex-direction:column;gap:8px}
.checklist-list div{display:flex;gap:8px;align-items:flex-start;font-size:14px;line-height:22px;color:${C.textSec}}
.checklist-list svg{color:${C.pri};flex-shrink:0;margin-top:2px;stroke-width:1.5}
.empty-state{text-align:center;padding:60px 20px;color:${C.textMut}}
.empty-state.compact{padding:34px 20px}
.empty-state svg{color:${C.pri};width:38px;height:38px;stroke-width:1.5}
.empty-state h2{font-size:18px;line-height:26px;font-weight:700;color:${C.text};margin:14px 0 6px}
.detail-actions{display:flex;flex-direction:column;gap:8px;margin-top:14px}
.sop-grid{display:grid;grid-template-columns:1.1fr 1fr .9fr;gap:16px;align-items:start}
.sop-admin-card{grid-column:1/-1;padding:16px 18px;display:flex;align-items:center;justify-content:space-between;gap:16px;background:linear-gradient(135deg,#fff,${C.priLt})}
.sop-admin-card p{font-size:13px;line-height:20px;color:${C.textSec};margin:0;max-width:760px}
.sop-admin-card small{display:block;margin-top:5px;font-size:11px;line-height:15px;color:${C.warn}}
.sop-admin-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}
.enterprise-lock-pill{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;border:1px solid rgba(20,83,45,.18);background:#fff;color:${C.textMut};padding:7px 10px;font:900 10px/14px ${K9_FONT_STACK};text-transform:uppercase;letter-spacing:.05em;white-space:nowrap}
.sop-card{padding:18px}.sop-card h2{font-size:24px;line-height:32px;font-weight:700;color:${C.text};margin:0 0 8px}
.sop-card.span-two{grid-column:span 2}
.resource-link-list{display:flex;flex-direction:column;gap:9px;margin-top:14px}
.resource-link-list a{border:1px solid ${C.border};background:${C.surfaceHover};border-radius:6px;padding:10px 12px;justify-content:flex-start;transition:border-color .18s ease,background .18s ease,transform .18s ease,box-shadow .18s ease}
.resource-link-list a:hover{transform:translateY(-1px);box-shadow:0 10px 22px rgba(37,99,235,.08)}
.resource-editor{display:grid;gap:9px;margin-top:14px}
.resource-editor-row{display:grid;grid-template-columns:minmax(0,1fr) 36px;gap:8px;align-items:center}
.resource-editor-row input:first-child{grid-column:1/-1}
.resource-editor-row input,.program-sop-editor input,.program-sop-editor textarea{width:100%;border:1px solid ${C.border};border-radius:6px;background:#fff;color:${C.text};font:700 13px/20px ${K9_FONT_STACK};padding:10px 11px;transition:border-color .16s ease,box-shadow .16s ease}
.program-sop-editor textarea{resize:vertical;font-weight:600;line-height:19px;min-height:58px}
.resource-editor-row input:focus,.program-sop-editor input:focus,.program-sop-editor textarea:focus{outline:0;border-color:${C.pri};box-shadow:0 0 0 3px rgba(20,83,45,.09)}
.resource-editor-row>button,.program-sop-editor-head>button,.program-sop-editor-item>button{width:36px;height:36px;border-radius:8px;border:1px solid rgba(220,38,38,.18);background:#FEF2F2;color:${C.dan};display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
.resource-editor-row>button svg,.program-sop-editor-head>button svg,.program-sop-editor-item>button svg{width:16px;height:16px;stroke-width:1.8}
.sop-section-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.sop-section-list section{border-top:1px solid ${C.border};padding-top:12px}
.sop-section-list h3{font-size:15px;line-height:22px;font-weight:700;color:${C.text};margin:0 0 8px}
.program-sop-editor{display:grid;gap:12px}
.program-sop-editor-section{border:1px solid ${C.border};border-radius:8px;background:${C.surfaceHover};padding:12px}
.program-sop-editor-head{display:grid;grid-template-columns:minmax(0,1fr) 36px;gap:8px;align-items:center;margin-bottom:10px}
.program-sop-editor-head input{font-size:15px;line-height:22px;font-weight:900}
.program-sop-editor-items{display:grid;gap:8px}
.program-sop-editor-item{display:grid;grid-template-columns:minmax(0,1fr) 36px;gap:8px;align-items:start}
.script-list{display:flex;flex-direction:column;gap:10px;margin-top:14px}
.script-block{border:1px solid ${C.border};border-radius:6px;background:${C.surfaceHover};padding:12px}
.script-block strong{display:block;font-size:13px;line-height:18px;font-weight:700;color:${C.text};margin-bottom:4px}
.script-block p{margin:0;color:${C.textSec}}
.prep-list{display:flex;flex-direction:column;gap:9px}
.builder-grid{display:grid;grid-template-columns:minmax(0,1fr) 400px;gap:16px;align-items:start}
.builder-form,.builder-preview{padding:18px}
.builder-header{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;margin-bottom:14px}
.builder-header h2{margin:0;font-size:24px;line-height:32px;font-weight:700;color:${C.text}}
.field-grid{display:grid;gap:12px}.field-grid.two{grid-template-columns:repeat(2,minmax(0,1fr))}
.field{display:flex;flex-direction:column;gap:6px;margin-bottom:12px}
.field span{font-size:12px;line-height:16px;font-weight:500;color:${C.textSec}}
.field input,.field textarea,.field select{border:1px solid ${C.border};border-radius:6px;padding:12px;font-family:${K9_FONT_STACK};font-size:14px;line-height:22px;font-weight:700;color:${C.text};background:#fff;letter-spacing:0}
.field input:focus,.field textarea:focus,.field select:focus{outline:2px solid rgba(20,83,45,.16);border-color:${C.pri}}
.field textarea{resize:vertical}
.field-help{font-size:12px;line-height:16px;color:${C.textMut};margin-top:2px}
.product-editor{display:grid;gap:8px}
.product-editor-row{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(120px,.42fr) minmax(0,1.15fr) 38px;gap:8px;align-items:center}
.product-editor-row input{min-width:0}
.product-editor-row>button{width:38px;height:38px;border-radius:8px;border:1px solid rgba(220,38,38,.18);background:#FEF2F2;color:${C.dan};display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:transform .16s ease,opacity .16s ease}
.product-editor-row>button:disabled{opacity:.34;cursor:not-allowed}
.product-editor-row>button:not(:disabled):hover{transform:translateY(-1px)}
.product-editor-row>button svg{width:16px;height:16px;stroke-width:1.9}
.toggle-row{display:flex;align-items:center;gap:8px;font-size:14px;line-height:20px;font-weight:500;color:${C.text};margin:4px 0 14px}
.form-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}
.handoff-grid{display:grid;grid-template-columns:340px minmax(0,1fr);gap:16px;align-items:start}
.handoff-controls{padding:18px;position:sticky;top:12px}
.handoff-controls h2{font-size:24px;line-height:32px;font-weight:700;color:${C.text};margin:0 0 8px}
.audience-options{display:flex;flex-direction:column;gap:8px;margin:18px 0}
.audience{border:1px solid ${C.border};background:#fff;color:${C.text};border-radius:6px;padding:11px 12px;text-align:left;font:600 14px/20px inherit;cursor:pointer}
.audience.active{border-color:${C.pri};background:${C.priLt};color:${C.pri}}
.notes-box,.product-link-panel{margin-top:14px;border-radius:6px;background:${C.surfaceHover};border:1px solid ${C.border};padding:12px}
.notes-box p,.product-link-panel p{font-size:12px;line-height:16px;margin:0 0 8px;color:${C.textMut}}
.product-link-panel{display:flex;flex-direction:column;gap:8px}
.product-link-panel a{border:1px solid ${C.border};background:#fff;border-radius:999px;padding:7px 10px;width:max-content;max-width:100%}
.handoff-main{padding:18px}
.graphic-upload-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-bottom:16px}
.graphic-upload-card{padding:16px;box-shadow:none}
.graphic-upload-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
.graphic-status{font-size:10px;line-height:14px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;border-radius:999px;background:${C.sucLt};color:${C.suc};padding:5px 8px;white-space:nowrap}
.graphic-status.missing{background:${C.surfaceHover};color:${C.textMut}}
.graphic-viewer{margin-top:12px;border:1px solid ${C.border};border-radius:6px;background:${C.surfaceHover};min-height:220px;display:flex;align-items:center;justify-content:center;overflow:hidden}
.graphic-viewer img{display:block;width:100%;height:100%;max-height:420px;object-fit:contain;background:#fff}
.graphic-viewer a{display:inline-flex;align-items:center;gap:8px;color:${C.info};font-size:14px;line-height:20px;font-weight:700;text-decoration:none}
.graphic-empty{margin-top:12px;border:1px dashed ${C.border};border-radius:6px;background:${C.surfaceHover};min-height:220px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:20px}
.graphic-empty svg{width:32px;height:32px;color:${C.textMut};stroke-width:1.5}
.graphic-file-meta{display:flex;justify-content:space-between;gap:10px;margin:10px 0;color:${C.textMut};font-size:12px;line-height:16px}
.upload-btn{position:relative;overflow:hidden;margin-top:12px}.upload-btn input{position:absolute;inset:0;opacity:0;cursor:pointer}
.handoff-event-list{display:flex;flex-direction:column;gap:10px}
.handoff-event{display:flex;justify-content:space-between;gap:14px;border:1px solid ${C.border};border-radius:6px;background:${C.surfaceHover};padding:12px}
.handoff-event strong{display:block;font-size:14px;line-height:20px;font-weight:700;color:${C.text}}
.handoff-event p{margin-top:4px}
.handoff-event-meta{display:flex;flex-direction:column;gap:6px;align-items:flex-end;flex-shrink:0}
.handoff-event-meta span{font-size:10px;line-height:14px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;border-radius:999px;background:#fff;border:1px solid ${C.border};color:${C.textSec};padding:5px 8px;white-space:nowrap}
.workflow-health-btn{position:relative;overflow:hidden;border:2px solid;border-radius:12px;padding:0 16px;font:900 14px/15px ${K9_FONT_STACK};letter-spacing:0;display:inline-flex;align-items:center;justify-content:center;gap:10px;cursor:pointer;min-height:64px;min-width:154px;transition:filter .2s ease,transform .2s ease,box-shadow .2s ease}
.workflow-health-btn:hover{filter:brightness(1.12);transform:translateY(-1px);box-shadow:0 12px 30px rgba(15,23,42,.09)}
.workflow-health-sweep{position:absolute;inset:0;width:60%;pointer-events:none}
.workflow-health-progressbar{position:absolute;left:0;bottom:0;height:3px;transition:width .35s ease;pointer-events:none}
.workflow-health-dot{width:10px;height:10px;border-radius:999px;display:inline-block;flex-shrink:0;position:relative;z-index:1}
.workflow-health-copy{display:grid;gap:2px;min-width:0;line-height:1.05;position:relative;z-index:1;text-align:left}
.workflow-health-copy>span{white-space:nowrap}
.workflow-health-copy small{font-size:10px;line-height:12px;color:${C.textMut};font-weight:850;font-variant-numeric:tabular-nums;white-space:nowrap}
.workflow-mini-status{position:relative;margin-top:16px;border:1px solid rgba(20,83,45,.14);background:linear-gradient(135deg,#fff,${C.priLt});border-radius:8px;padding:14px;display:grid;grid-template-columns:1fr auto;gap:12px;overflow:hidden}
.workflow-mini-status strong{display:block;font-size:20px;line-height:26px;font-weight:850;color:${C.text};margin-top:3px}
.workflow-mini-status p{font-size:12px;line-height:18px;color:${C.textSec};margin:3px 0 0}
.workflow-mini-health{display:flex;align-items:center;gap:8px;font:900 12px/16px ${K9_FONT_STACK};white-space:nowrap}
.workflow-mini-health small{display:block;color:${C.textMut};font-size:10px;font-weight:700;margin-left:2px}
.workflow-mini-bar{grid-column:1/-1;height:6px;border-radius:999px;background:rgba(20,83,45,.1);overflow:hidden}
.workflow-mini-bar span{display:block;height:100%;border-radius:999px;background:linear-gradient(90deg,${C.pri},${C.acc});transition:width .45s cubic-bezier(.16,1,.3,1)}
.workflow-grid{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:16px;align-items:start}
.workflow-command{padding:20px}
.workflow-command.workflow-command-tight{padding:0;background:transparent;border:0;box-shadow:none}
.workflow-command-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:16px}
.workflow-command-head h2{font-size:28px;line-height:36px;font-weight:850;color:${C.text};margin:0 0 4px}
.workflow-command-head p,.workflow-reconcile-card p,.workflow-today-events p,.workflow-health-card p{font-size:14px;line-height:22px;color:${C.textSec};margin:0}
.workflow-date-nav{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.workflow-date-nav>button:not(.secondary-btn){width:38px;height:38px;border:1px solid ${C.border};border-radius:6px;background:#fff;color:${C.text};display:inline-flex;align-items:center;justify-content:center;cursor:pointer;font-family:${K9_FONT_STACK};font-weight:900;transition:transform .18s ease,box-shadow .18s ease}
.workflow-date-nav>button:not(.secondary-btn):hover{transform:translateY(-1px);box-shadow:0 8px 18px rgba(15,23,42,.08)}
.workflow-stat-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:14px}
.workflow-health-card{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:16px;align-items:center;border:1px solid rgba(148,163,184,.24);background:${C.surfaceHover};border-radius:8px;padding:14px;margin-bottom:14px}
.workflow-health-card strong{display:block;font-size:18px;line-height:24px;font-weight:850}
.workflow-health-facts{display:flex;flex-direction:column;gap:4px;font-size:11px;line-height:16px;font-weight:700;color:${C.textMut};white-space:nowrap}
.workflow-table-card{border:1px solid rgba(148,163,184,.24);border-radius:8px;overflow:hidden;background:#fff}
.workflow-table-wrap{overflow:auto}
.workflow-table-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-bottom:1px solid ${C.borderLight};background:#fff}
.workflow-table-toolbar p{font-size:12px;line-height:18px;color:${C.textSec};margin:2px 0 0;max-width:780px}
.workflow-table-controls{display:flex;align-items:center;justify-content:flex-end;gap:10px;flex-wrap:wrap;min-width:280px}
.workflow-filter-pills{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.workflow-filter-pills button{border:1px solid ${C.border};background:#fff;color:${C.textSec};border-radius:999px;padding:6px 9px;font:850 11px/14px ${K9_FONT_STACK};cursor:pointer;white-space:nowrap}
.workflow-filter-pills button.active{background:${C.pri};border-color:${C.pri};color:#fff;box-shadow:0 8px 18px rgba(20,83,45,.14)}
.workflow-filter-pills button span{font-variant-numeric:tabular-nums;opacity:.78}
.workflow-sort-select{display:flex;align-items:center;gap:6px;color:${C.textMut};font:850 11px/14px ${K9_FONT_STACK};text-transform:uppercase;letter-spacing:.04em;white-space:nowrap}
.workflow-sort-select select{height:32px;border:1px solid ${C.border};border-radius:6px;background:#fff;color:${C.text};font:800 12px/16px ${K9_FONT_STACK};padding:0 26px 0 9px}
.workflow-table{width:100%;border-collapse:collapse;font-size:13px}
.workflow-table th{background:${C.surfaceHover};border-bottom:1px solid ${C.border};text-align:left;padding:11px 14px;font-size:11px;line-height:16px;font-weight:850;color:${C.textMut};text-transform:uppercase;letter-spacing:.05em}
.workflow-table td{padding:13px 14px;border-bottom:1px solid ${C.borderLight};vertical-align:middle;color:${C.textSec}}
.workflow-table tr{transition:background .2s ease}
.workflow-table tr.complete{background:${C.sucLt}}
.workflow-table tr.review{background:${C.warnLt}}
.workflow-dog-cell{display:flex;align-items:flex-start;gap:10px;min-width:220px}
.workflow-dog-avatar{width:40px;height:40px;border-radius:999px;object-fit:cover;flex-shrink:0}
.workflow-dog-avatar.fallback{display:inline-flex;align-items:center;justify-content:center;background:#DCFCE7;color:#374151;font-size:16px;line-height:1;font-weight:900}
.workflow-dog-name-line{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.workflow-dog-cell strong{display:block;font-size:15px;line-height:20px;font-weight:900;color:${C.text}}
.workflow-dog-cell span,.workflow-dog-cell small,.workflow-table td:last-child small{display:block;font-size:11px;line-height:16px;color:${C.textMut};margin-top:2px}
.workflow-reservation-line{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:4px}
.workflow-reservation-kind{display:inline-flex!important;align-items:center;width:max-content;border-radius:999px;padding:3px 7px;font:900 9px/12px ${K9_FONT_STACK};letter-spacing:.02em;text-transform:uppercase;margin:0!important;border:1px solid rgba(148,163,184,.28);background:#fff;color:${C.textMut}}
.workflow-reservation-kind.boarding{background:#EEF2FF;color:#3730A3;border-color:#C7D2FE}
.workflow-reservation-kind.daycare{background:#ECFDF5;color:#166534;border-color:#BBF7D0}
.workflow-reservation-kind.day_boarding{background:#EFF6FF;color:#1D4ED8;border-color:#BFDBFE}
.workflow-reservation-kind.evaluation{background:#FEFCE8;color:#854D0E;border-color:#FEF08A}
.workflow-reservation-window{display:inline-flex!important;align-items:center;width:max-content;margin:0!important;color:${C.textSec}!important;font:800 11px/15px ${K9_FONT_STACK}!important;letter-spacing:0}
.workflow-service-line{font-weight:650}
.workflow-review-reason{max-width:560px;color:#92400E!important;font:850 11px/16px ${K9_FONT_STACK}!important;margin-top:6px!important}
.workflow-room-cell{display:grid;gap:2px;min-width:112px}
.workflow-room-cell strong{font-size:13px;line-height:18px;color:${C.text};font-weight:900}
.workflow-room-cell span{font-size:10px;line-height:13px;color:${C.textMut};font-weight:850;text-transform:uppercase;letter-spacing:.04em}
.workflow-timing-cell{display:grid;gap:4px;min-width:112px}
.workflow-timing-cell span{display:flex;align-items:center;justify-content:space-between;gap:8px;font:900 12px/15px ${K9_FONT_STACK};color:${C.text};font-variant-numeric:tabular-nums}
.workflow-timing-cell span strong{font-size:9px;line-height:12px;color:${C.textMut};text-transform:uppercase;letter-spacing:.04em}
.workflow-timing-cell small{font:800 10px/13px ${K9_FONT_STACK};color:${C.warn};white-space:nowrap}
.workflow-playgroup-badges{display:inline-flex!important;align-items:center;gap:4px;margin-top:0!important}
.workflow-playgroup-badge{display:inline-flex!important;align-items:center;justify-content:center;min-width:22px;height:18px;border-radius:999px;padding:0 6px;font:900 9px/18px ${K9_FONT_STACK};text-transform:uppercase;letter-spacing:0;box-shadow:inset 0 0 0 1px rgba(255,255,255,.42)}
.workflow-playgroup-legend{display:flex;align-items:center;justify-content:flex-end;gap:8px 10px;flex-wrap:wrap}
.workflow-playgroup-legend-item{display:inline-flex;align-items:center;gap:5px;font:850 10px/14px ${K9_FONT_STACK};color:${C.textMut};white-space:nowrap}
.workflow-playgroup-legend-item .workflow-playgroup-badge{height:17px;min-width:21px;font-size:8px;line-height:17px}
.workflow-status{display:inline-flex;border-radius:999px;padding:5px 8px;font-size:10px;line-height:14px;font-weight:850;text-transform:uppercase;letter-spacing:.04em;border:1px solid ${C.border};color:${C.pri};background:${C.priLt};white-space:nowrap}
.workflow-status.needs_review{color:${C.warn};background:${C.warnLt};border-color:rgba(217,119,6,.22)}
.workflow-check{width:32px;height:32px;border-radius:8px;border:2px solid ${C.border};background:#fff;color:transparent;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:transform .16s ease,background .16s ease,border-color .16s ease,box-shadow .16s ease}
.workflow-check:hover{transform:scale(1.06);border-color:${C.pri};box-shadow:0 0 0 3px rgba(20,83,45,.08)}
.workflow-check.complete{background:${C.suc};border-color:${C.suc};color:#fff}
.workflow-loading{min-height:260px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;color:${C.textMut};font-size:13px;font-weight:800}
.workflow-loading-orbit{width:40px;height:40px;border-radius:999px;border:3px solid ${C.border};border-top-color:${C.pri};animation:enrichmentOrbit .9s linear infinite}
.workflow-side{display:flex;flex-direction:column;gap:16px;position:sticky;top:12px}
.workflow-side>div{padding:16px}
.workflow-today-events{display:flex;flex-direction:column;gap:10px}
.workflow-today-events article{border:1px solid;border-radius:8px;padding:12px;animation:enrichmentFloatIn .28s ease both}
.workflow-today-events article strong{display:block;font-size:14px;line-height:20px;font-weight:850}
.workflow-today-events article span{display:block;font-size:12px;line-height:18px;color:${C.textSec};margin-top:5px}
.workflow-reconcile-card strong{display:block;font-size:22px;line-height:28px;font-weight:850;color:${C.text};margin-bottom:6px}
.enrichment-health-modal{position:fixed;inset:0;z-index:500;background:rgba(0,10,26,.72);backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;padding:24px}
.enrichment-health-shell{width:min(980px,100%);max-height:calc(100vh - 48px);overflow:auto;border-radius:18px;background:linear-gradient(180deg,rgba(7,27,51,.98),rgba(2,15,32,.98));border:1px solid rgba(255,255,255,.12);box-shadow:0 28px 80px rgba(0,0,0,.45);animation:enrichmentPanelIn .18s ease-out both}
.enrichment-health-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;padding:24px 26px 18px;border-bottom:1px solid rgba(255,255,255,.08)}
.enrichment-health-head h2{font-size:24px;line-height:30px;font-weight:900;color:#fff;margin:0}
.enrichment-health-head p{margin:4px 0 0;font-size:13px;line-height:19px;color:rgba(255,255,255,.5)}
.enrichment-health-head button{width:36px;height:36px;border-radius:10px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.06);color:rgba(255,255,255,.8);cursor:pointer;font:900 20px/1 ${K9_FONT_STACK}}
.enrichment-health-body{padding:26px;display:grid;gap:14px}
.enrichment-health-section{padding:18px;border-radius:14px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.045);display:grid;gap:14px}
.enrichment-health-section-title{display:flex;align-items:center;gap:10px}
.enrichment-health-section-title span{width:10px;height:10px;border-radius:99px}
.enrichment-health-section-title strong{font-size:17px;line-height:22px;font-weight:900;color:#fff}
.enrichment-health-fact-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.enrichment-health-fact{min-width:0;border-radius:10px;background:rgba(0,0,0,.18);border:1px solid rgba(255,255,255,.06);padding:9px 10px}
.enrichment-health-fact span{display:block;font-size:9px;line-height:12px;font-weight:900;letter-spacing:.06em;text-transform:uppercase;color:rgba(255,255,255,.35)}
.enrichment-health-fact strong{display:block;margin-top:3px;font-size:13px;line-height:18px;font-weight:900;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.enrichment-health-refresh{justify-self:start;border:1px solid rgba(132,204,22,.42);background:rgba(132,204,22,.14);color:#84CC16;border-radius:10px;padding:11px 14px;font:900 13px/18px ${K9_FONT_STACK};display:inline-flex;align-items:center;gap:8px;cursor:pointer}
.enrichment-health-refresh:disabled{opacity:.65;cursor:wait}
.enrichment-audit-list{display:grid;gap:8px;max-height:320px;overflow:auto}
.enrichment-audit-list>p{font-size:12px;line-height:18px;color:rgba(255,255,255,.42);margin:0}
.enrichment-audit-row{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1.8fr);gap:12px;align-items:start;padding:10px 11px;border-radius:10px;background:rgba(0,0,0,.18);border:1px solid rgba(255,255,255,.06)}
.enrichment-audit-row strong{display:block;font-size:13px;line-height:18px;font-weight:900;color:#fff}
.enrichment-audit-row span,.enrichment-audit-row small{display:block;margin-top:3px;font-size:11px;line-height:15px;color:rgba(255,255,255,.48)}
.enrichment-audit-row small{color:#FCA5A5}
.enrichment-audit-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}
@media(max-width:1100px){.page-header,.enrichment-daily-surface,.main-grid,.sop-grid,.builder-grid,.handoff-grid,.workflow-grid{grid-template-columns:1fr;display:grid}.sop-card.span-two{grid-column:auto}.sop-admin-card{align-items:flex-start;flex-direction:column}.sop-section-list,.graphic-upload-grid{grid-template-columns:1fr}.detail-panel,.handoff-controls,.workflow-side{position:static}.workflow-stat-grid{grid-template-columns:repeat(2,1fr)}.workflow-health-card{grid-template-columns:1fr}.workflow-command-head,.daily-module-head{flex-direction:column}.workflow-date-nav{justify-content:flex-start}.workflow-mini-status{grid-template-columns:1fr}.workflow-table-toolbar{align-items:flex-start;flex-direction:column}.workflow-playgroup-legend{justify-content:flex-start}.queue-main{align-items:flex-start;flex-direction:column;min-height:auto}.daily-run-completion strong{font-size:38px;line-height:40px}.daily-module-foot{align-items:flex-start;justify-content:flex-start}}
`;

export default EnrichmentsPage;
