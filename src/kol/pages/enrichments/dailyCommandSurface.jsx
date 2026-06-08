import React from "react";
import { I } from "../../../shared/icons";
import {
  ENRICHMENT_FOCUS_LABELS,
  formatEventDate,
  getMonthStart,
  getNextEnrichmentEvent,
  getThemeConfig,
  normalizeDate,
} from "../../enrichments/enrichmentData";
import { formatPriceLabel } from "./formatters";
import { WorkflowHealthButton } from "./workflowView";

export function DailyCommandSurface({
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
