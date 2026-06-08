import React, { useEffect, useMemo, useState } from "react";
import { C, gid, todayStr } from "../../shared/theme";
import { I } from "../../shared/icons";
import { supabase } from "../../supabaseClient";
import { useEnrichmentEvents } from "../../hooks/useEnrichmentEvents";
import { useEnrichmentWorkflow } from "../../hooks/useEnrichmentWorkflow";
import { useEnrichmentProgramConfig } from "../../hooks/useEnrichmentProgramConfig";
import {
  addMonths,
  buildBlankEnrichmentEvent,
  filterEventsForMonth,
  getEventsForDate,
  getMonthLabel,
  getMonthStart,
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
import { isMissingSupabaseResource } from "./enrichments/supabaseErrors";
import { EnrichmentHealthModal, WorkflowView } from "./enrichments/workflowView";
import { DailyCommandSurface } from "./enrichments/dailyCommandSurface";
import { EventDetail } from "./enrichments/eventDetail";
import { CalendarBoard } from "./enrichments/calendarBoard";
import { SopView } from "./enrichments/sopView";
import { MarketingHandoff } from "./enrichments/marketingHandoff";
import { BuilderView } from "./enrichments/builderView";

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

export default EnrichmentsPage;
