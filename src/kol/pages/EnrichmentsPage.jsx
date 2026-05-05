import React, { useEffect, useMemo, useState } from "react";
import { C, todayStr } from "../../shared/theme";
import { I } from "../../shared/icons";
import { supabase } from "../../supabaseClient";
import { useEnrichmentEvents } from "../../hooks/useEnrichmentEvents";
import TodayEnrichmentCard from "../enrichments/TodayEnrichmentCard";
import {
  DEFAULT_ENRICHMENT_GUIDELINES,
  DEFAULT_ENRICHMENT_NOTES,
  ENRICHMENT_AUDIENCES,
  ENRICHMENT_CSR_GUIDE_SECTIONS,
  ENRICHMENT_FOCUS_LABELS,
  ENRICHMENT_PROGRAM_SOP_SECTIONS,
  ENRICHMENT_RESOURCE_LINKS,
  ENRICHMENT_TEXT_SCRIPTS,
  ENRICHMENT_VISUAL_THEMES,
  addMonths,
  buildBlankEnrichmentEvent,
  buildCalendarWeeks,
  filterEventsForMonth,
  formatEventDate,
  getEventsForDate,
  getMonthLabel,
  getThemeConfig,
  normalizeDate,
  parseLines,
  parseProducts,
  prepareEventPayload,
  serializeLines,
  serializeProducts,
} from "../enrichments/enrichmentData";

const MANAGE_ROLES = new Set(["manager", "mod", "supervisor", "location_admin", "multi_location_admin", "enterprise_admin", "owner", "developer"]);
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
  const [activeTab, setActiveTab] = useState("calendar");
  const [draftMode, setDraftMode] = useState("existing");
  const [saving, setSaving] = useState(false);
  const [calendarGraphics, setCalendarGraphics] = useState({});
  const [graphicUrls, setGraphicUrls] = useState({});
  const [graphicsLoading, setGraphicsLoading] = useState(false);
  const [uploadingGraphic, setUploadingGraphic] = useState("");

  const canManage = MANAGE_ROLES.has(profile?.role);
  const { events, visibleMonthEvents, loading, error, storageMode, saveEvent, deleteEvent } = useEnrichmentEvents(locationId, monthDate);

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
  const focusCounts = useMemo(() => {
    return visibleMonthEvents.reduce((acc, event) => {
      const key = event.focus_area || "brainwork";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }, [visibleMonthEvents]);

  const todayEvents = useMemo(() => getEventsForDate(events, todayStr(), "staff"), [events]);
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
    setUploadingGraphic(graphicAudience);
    try {
      const { error: uploadError } = await supabase
        .storage
        .from(GRAPHIC_BUCKET)
        .upload(storagePath, file, {
          contentType: file.type || "application/octet-stream",
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
        content_type: file.type || "application/octet-stream",
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
    <div style={{ minHeight: "100%", background: BRAND.slate50, padding: "24px 32px", overflow: "auto" }}>
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

        <div className="enrichment-hero-grid">
          <TodayEnrichmentCard events={events} nav={nav} loading={loading} />
          <div className="enrichment-command-panel">
            <div className="panel-eyebrow">Month Command Center</div>
            <div className="panel-title">{getMonthLabel(monthDate)}</div>
            <div className="metric-grid">
              <Metric label="Staff Events" value={visibleMonthEvents.length} />
              <Metric label="Customer Events" value={customerEvents.length} />
              <Metric label="Products" value={countProducts(visibleMonthEvents)} />
              <Metric label="Setup Steps" value={countChecklist(visibleMonthEvents)} />
            </div>
            <div className="focus-row">
              {Object.entries(focusCounts).slice(0, 5).map(([key, value]) => (
                <span key={key}>{ENRICHMENT_FOCUS_LABELS[key] || key}: {value}</span>
              ))}
            </div>
            {error ? <div className="inline-warning">Calendar loaded with fallback data because Supabase returned: {error.message}</div> : null}
          </div>
        </div>

        <div className="tab-row">
          {[
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
          <SopView event={selectedEvent} monthEvents={visibleMonthEvents} />
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
    </div>
  );
}

function Header({ monthDate, setMonthDate, nav, loading, storageMode, canManage, onNew }) {
  return (
    <div className="page-header">
      <div>
        <button type="button" className="back-link" onClick={() => nav?.("home")}>
          <I.Back /> Home
        </button>
        <div className="eyebrow">K9 Operations Enrichment Portal</div>
        <h1>Enrichment Calendar</h1>
        <p>Plan events, prep products, run the staff SOP, and attach the customer or employee calendar graphics created by marketing.</p>
      </div>
      <div className="header-actions">
        <div className="month-control">
          <button type="button" onClick={() => setMonthDate(addMonths(monthDate, -1))}><I.Back /></button>
          <span>{getMonthLabel(monthDate)}</span>
          <button type="button" onClick={() => setMonthDate(addMonths(monthDate, 1))}><I.ChevronRight /></button>
        </div>
        {canManage ? <button type="button" className="primary-btn" onClick={onNew}><I.Plus /> New Event</button> : null}
        <span className={`storage-pill ${storageMode}`}>{loading ? "Loading" : storageMode === "tables" ? "Supabase Tables" : storageMode === "settings" ? "Settings Fallback" : "Seed Preview"}</span>
      </div>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="metric-tile">
      <div>{label}</div>
      <strong>{value}</strong>
    </div>
  );
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
          <p>Select a calendar day to inspect the event SOP, products, and setup checklist.</p>
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
          <strong>{event.price_cents ? `$${Math.round(event.price_cents / 100)}` : "Free"}</strong>
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
              <div key={`${product.name}_${index}`}>
                <ProductLabel product={product} />
                <span>{product.quantity || (getProductHref(product) ? "Linked reference" : "No link added")}</span>
              </div>
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

function ProductLabel({ product }) {
  const href = getProductHref(product);
  if (!href) return <strong>{product.name}</strong>;
  return (
    <a className="product-link" href={href} target="_blank" rel="noreferrer">
      <I.Link /> {product.name}
    </a>
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
            <I.Link /> {product.name}
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

function SopView({ event, monthEvents }) {
  const upcoming = monthEvents.slice(0, 8);
  return (
    <div className="sop-grid">
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
        <ResourceLinks links={ENRICHMENT_RESOURCE_LINKS} />
      </div>
      <div className="sop-card span-two">
        <div className="section-title">Program SOP</div>
        <SopSectionList sections={ENRICHMENT_PROGRAM_SOP_SECTIONS} />
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
        {!canManage ? <div className="inline-warning">Your role can view enrichment SOPs, but event creation is manager/admin only.</div> : null}
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
          <textarea
            disabled={disabled}
            rows={6}
            value={draft.products}
            onChange={(event) => update("products", event.target.value)}
            placeholder={"Backdrop kit | 1 set | https://example.com/backdrop\nTreat puzzles | 6 | https://example.com/puzzle"}
          />
          <small className="field-help">One product per line: name | quantity | URL. Product URLs become clickable staff references throughout the portal.</small>
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
            <p>Add URLs in Create / Edit using name | quantity | URL.</p>
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
              onUpload(audience.id, file);
            }}
          />
        </label>
      ) : null}
    </section>
  );
}

function countProducts(events) {
  return events.reduce((sum, event) => sum + (event.products?.length || 0), 0);
}

function countChecklist(events) {
  return events.reduce((sum, event) => sum + (event.checklist?.length || 0), 0);
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

function isAllowedGraphicFile(file) {
  return ["image/png", "image/jpeg", "image/webp", "application/pdf"].includes(file?.type);
}

function buildGraphicStoragePath(locationId, monthStart, audience, file) {
  const safeLocationId = String(locationId || "unknown").replace(/\//g, "_");
  const extension = getGraphicExtension(file);
  return `${safeLocationId}/${monthStart}/${audience}.${extension}`;
}

function getGraphicExtension(file) {
  const fromName = String(file?.name || "").split(".").pop()?.toLowerCase();
  if (["png", "jpg", "jpeg", "webp", "pdf"].includes(fromName)) return fromName === "jpeg" ? "jpg" : fromName;
  if (file?.type === "image/png") return "png";
  if (file?.type === "image/jpeg") return "jpg";
  if (file?.type === "image/webp") return "webp";
  if (file?.type === "application/pdf") return "pdf";
  return "bin";
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
.page-header{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;margin-bottom:24px}
.back-link{display:inline-flex;align-items:center;gap:6px;border:0;background:transparent;color:${C.textMut};font:600 14px/20px inherit;cursor:pointer;margin-bottom:12px}
.eyebrow,.panel-eyebrow{font-size:10px;line-height:14px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:${C.pri}}
.page-header h1{font-size:32px;line-height:40px;font-weight:800;margin:4px 0;color:${C.text};letter-spacing:0}
.page-header p{font-size:14px;line-height:22px;font-weight:400;color:${C.textSec};max-width:680px;margin:0}
.header-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.month-control{display:flex;align-items:center;gap:8px;background:#fff;border:1px solid ${C.border};border-radius:6px;padding:6px}
.month-control button{width:36px;height:36px;border-radius:6px;border:0;background:${C.surfaceHover};color:${C.text};display:flex;align-items:center;justify-content:center;cursor:pointer}
.month-control span{font-size:14px;line-height:20px;font-weight:600;color:${C.text};min-width:132px;text-align:center}
.primary-btn,.secondary-btn,.danger-btn{border-radius:6px;padding:10px 14px;font:600 14px/20px inherit;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px}
.primary-btn{border:1px solid ${C.pri};background:${C.pri};color:#fff;box-shadow:0 1px 2px rgba(0,0,0,.05)}
.secondary-btn{background:#fff;color:${C.pri};border:1px solid ${C.pri};box-shadow:0 1px 2px rgba(0,0,0,.05)}
.danger-btn{background:${C.dan};color:#fff;border:1px solid ${C.dan};box-shadow:0 1px 2px rgba(0,0,0,.05)}
.wide{width:100%}
.storage-pill{font-size:10px;line-height:14px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;border-radius:999px;padding:6px 9px;background:#fff;color:${C.textMut};border:1px solid ${C.border}}
.storage-pill.settings{color:${C.warn};background:${C.warnLt}}.storage-pill.seed{color:${C.textMut};background:${C.surfaceHover}}
.enrichment-hero-grid{display:grid;grid-template-columns:minmax(320px,420px) 1fr;gap:16px;margin-bottom:16px}
.enrichment-command-panel,.calendar-shell,.detail-panel,.sop-card,.builder-form,.builder-preview,.handoff-controls,.handoff-main,.graphic-upload-card{background:#fff;border:1px solid ${C.border};border-radius:8px;box-shadow:0 1px 2px rgba(0,0,0,.05)}
.enrichment-command-panel{padding:20px}
.panel-title{font-size:24px;line-height:32px;font-weight:700;color:${C.text};margin-top:4px}
.metric-grid{display:grid;grid-template-columns:repeat(4,minmax(110px,1fr));gap:12px;margin-top:16px}
.metric-tile{border:1px solid ${C.border};background:${C.surfaceHover};border-radius:6px;padding:12px}
.metric-tile div{font-size:11px;line-height:16px;font-weight:500;color:${C.textMut};text-transform:uppercase;letter-spacing:.05em}
.metric-tile strong{display:block;font-size:24px;line-height:32px;font-weight:700;color:${C.text};margin-top:4px}
.focus-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
.focus-row span,.pill-list span{font-size:10px;line-height:14px;font-weight:600;border-radius:999px;background:${C.priLt};color:${C.pri};padding:5px 8px}
.inline-warning{margin-top:12px;border:1px solid rgba(217,119,6,.28);background:${C.warnLt};color:#92400E;border-radius:6px;padding:10px 12px;font-size:12px;line-height:16px;font-weight:500}
.tab-row{display:flex;gap:8px;margin:8px 0 16px;flex-wrap:wrap}
.tab{border:1px solid ${C.border};background:#fff;color:${C.textSec};border-radius:999px;padding:9px 14px;font:600 14px/20px inherit;cursor:pointer}
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
.section-title{font-size:11px;line-height:16px;font-weight:500;color:${C.textMut};text-transform:uppercase;letter-spacing:.05em;margin-bottom:9px}
.same-day{border:1px solid ${C.border};background:#fff;border-radius:6px;padding:8px 10px;margin:0 6px 6px 0;font:600 12px/16px inherit;color:${C.textSec};cursor:pointer}
.same-day.active{background:${C.pri};color:#fff}
.product-list{display:flex;flex-direction:column;gap:8px}
.product-list div,.prep-list div{border:1px solid ${C.border};border-radius:6px;padding:9px;background:${C.surfaceHover}}
.product-list strong,.prep-list strong{display:block;font-size:14px;line-height:20px;font-weight:600;color:${C.text}}
.product-list span,.prep-list span{display:block;font-size:12px;line-height:16px;font-weight:400;color:${C.textMut};margin-top:3px}
.product-link,.product-inline-links a,.product-link-panel a,.resource-link-list a{display:inline-flex;align-items:center;gap:6px;color:${C.info};font-size:14px;line-height:20px;font-weight:600;text-decoration:none}
.product-link:hover,.product-inline-links a:hover,.product-link-panel a:hover,.resource-link-list a:hover{text-decoration:underline}
.product-link svg,.product-inline-links svg,.product-link-panel svg,.resource-link-list svg{width:16px;height:16px;stroke-width:1.5;flex-shrink:0}
.product-inline-links{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px}
.product-inline-links .product-text{display:inline-flex;font-size:12px;line-height:16px;font-weight:400;color:${C.textMut}}
.checklist-list{display:flex;flex-direction:column;gap:8px}
.checklist-list div{display:flex;gap:8px;align-items:flex-start;font-size:14px;line-height:22px;color:${C.textSec}}
.checklist-list svg{color:${C.pri};flex-shrink:0;margin-top:2px;stroke-width:1.5}
.empty-state{text-align:center;padding:60px 20px;color:${C.textMut}}
.empty-state.compact{padding:34px 20px}
.empty-state svg{color:${C.pri};width:38px;height:38px;stroke-width:1.5}
.empty-state h2{font-size:18px;line-height:26px;font-weight:700;color:${C.text};margin:14px 0 6px}
.detail-actions{display:flex;flex-direction:column;gap:8px;margin-top:14px}
.sop-grid{display:grid;grid-template-columns:1.1fr 1fr .9fr;gap:16px;align-items:start}
.sop-card{padding:18px}.sop-card h2{font-size:24px;line-height:32px;font-weight:700;color:${C.text};margin:0 0 8px}
.sop-card.span-two{grid-column:span 2}
.resource-link-list{display:flex;flex-direction:column;gap:9px;margin-top:14px}
.resource-link-list a{border:1px solid ${C.border};background:${C.surfaceHover};border-radius:6px;padding:10px 12px}
.sop-section-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.sop-section-list section{border-top:1px solid ${C.border};padding-top:12px}
.sop-section-list h3{font-size:15px;line-height:22px;font-weight:700;color:${C.text};margin:0 0 8px}
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
.field input,.field textarea,.field select{border:1px solid ${C.border};border-radius:6px;padding:12px;font:400 14px/22px inherit;color:${C.text};background:#fff}
.field input:focus,.field textarea:focus,.field select:focus{outline:2px solid rgba(20,83,45,.16);border-color:${C.pri}}
.field textarea{resize:vertical}
.field-help{font-size:12px;line-height:16px;color:${C.textMut};margin-top:2px}
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
@media(max-width:1100px){.page-header,.enrichment-hero-grid,.main-grid,.sop-grid,.builder-grid,.handoff-grid{grid-template-columns:1fr;display:grid}.sop-card.span-two{grid-column:auto}.sop-section-list,.graphic-upload-grid{grid-template-columns:1fr}.detail-panel,.handoff-controls{position:static}.metric-grid{grid-template-columns:repeat(2,1fr)}}
`;

export default EnrichmentsPage;
