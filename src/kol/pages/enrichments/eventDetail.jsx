import React from "react";
import { I } from "../../../shared/icons";
import { ENRICHMENT_FOCUS_LABELS, formatEventDate, getThemeConfig } from "../../enrichments/enrichmentData";
import { formatEnrichmentPrice } from "./formatters";
import { ChecklistList, DetailSection, PillList } from "./detailComponents";
import { ProductReferenceCard } from "./productComponents";

export function EventDetail({ event, dayEvents, onSelectEvent, onEdit, onDuplicate, canManage }) {
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
