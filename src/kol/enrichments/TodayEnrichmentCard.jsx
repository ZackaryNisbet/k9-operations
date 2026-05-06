import React, { useMemo } from "react";
import { C } from "../../shared/theme";
import { I } from "../../shared/icons";
import {
  ENRICHMENT_FOCUS_LABELS,
  formatEventDate,
  getEventsForDate,
  getNextEnrichmentEvent,
  getThemeConfig,
  normalizeDate,
} from "./enrichmentData";

function priceLabel(event) {
  const cents = Number(event?.price_cents || 0);
  if (!cents) return "$15 add-on";
  return `$${Math.round(cents / 100)} add-on`;
}

export default function TodayEnrichmentCard({ events = [], date = new Date(), nav, compact = false, loading = false }) {
  const day = normalizeDate(date);
  const todaysEvents = useMemo(() => getEventsForDate(events, day, "staff"), [events, day]);
  const nextEvent = useMemo(() => getNextEnrichmentEvent(events, day, "staff"), [events, day]);
  const primary = todaysEvents[0] || nextEvent;
  const theme = getThemeConfig(primary?.visual_theme || "neutral");
  const isToday = primary?.event_date === day;

  if (loading && !primary) {
    return (
      <div style={cardStyle(compact, "#F8FAFC", "rgba(15,23,42,0.08)")}>
        <div style={{ height: 14, width: 140, borderRadius: 999, background: "#E5E7EB" }} />
        <div style={{ height: 24, width: "68%", borderRadius: 8, background: "#E5E7EB", marginTop: 12 }} />
        <div style={{ height: 10, width: "52%", borderRadius: 999, background: "#E5E7EB", marginTop: 10 }} />
      </div>
    );
  }

  if (!primary) {
    return (
      <button type="button" onClick={() => nav?.("enrichments")} style={buttonReset(cardStyle(compact, "#FFFFFF", "rgba(20,83,45,0.14)"))}>
        <CardHeader theme={theme} label="Enrichments" status="Calendar ready" />
        <div style={{ fontSize: compact ? 16 : 18, lineHeight: compact ? "24px" : "26px", fontWeight: 700, color: C.text, marginTop: 12 }}>No event loaded for today</div>
        <div style={{ fontSize: 12, lineHeight: "16px", color: C.textMut, marginTop: 5 }}>Open the calendar to create the next staff activity.</div>
      </button>
    );
  }

  const focusLabel = ENRICHMENT_FOCUS_LABELS[primary.focus_area] || primary.focus_area || "Activity";
  const remainingCount = Math.max(0, todaysEvents.length - 1);

  return (
    <button
      type="button"
      onClick={() => nav?.("enrichments", { selectedDate: primary.event_date, selectedEventId: primary.id })}
      style={buttonReset(cardStyle(compact, theme.soft, `${theme.color}42`))}
    >
      <CardHeader theme={theme} label={isToday ? "Today's Enrichment" : "Next Enrichment"} status={priceLabel(primary)} />
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, marginTop: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: compact ? 16 : 18, fontWeight: 700, color: C.text, lineHeight: compact ? "24px" : "26px" }}>
            {primary.title}
          </div>
          <div style={{ fontSize: 12, lineHeight: "16px", color: C.textMut, fontWeight: 500, marginTop: 6 }}>
            {formatEventDate(primary.event_date, { weekday: "long" })} - {focusLabel}
          </div>
        </div>
        <div style={{
          width: compact ? 38 : 48,
          height: compact ? 38 : 48,
          borderRadius: 8,
          background: "#FFFFFF",
          border: `1px solid ${theme.color}30`,
          color: theme.color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
        }}>
          <I.Sparkle />
        </div>
      </div>
      {primary.summary ? (
        <div style={{ fontSize: 14, color: C.textSec, lineHeight: "22px", marginTop: 10 }}>
          {primary.summary}
        </div>
      ) : null}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 12 }}>
        <Chip label={`${primary.products?.length || 0} products`} />
        {primary.customer_visible ? <Chip label="Customer graphic" /> : <Chip label="Staff only" />}
        {remainingCount ? <Chip label={`+${remainingCount} more today`} /> : null}
      </div>
    </button>
  );
}

function CardHeader({ theme, label, status }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: theme.color, boxShadow: `0 0 0 4px ${theme.color}18` }} />
        <span style={{ fontSize: 10, lineHeight: "14px", fontWeight: 600, color: theme.color, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>
      </div>
      <span style={{
        padding: "4px 8px",
        borderRadius: 999,
        background: "#FFFFFF",
        border: `1px solid ${theme.color}28`,
        color: theme.color,
        fontSize: 10,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}>
        {status}
      </span>
    </div>
  );
}

function Chip({ label }) {
  return (
    <span style={{
      padding: "4px 8px",
      borderRadius: 999,
      background: "rgba(255,255,255,0.76)",
      border: "1px solid rgba(15,23,42,0.07)",
      color: C.textSec,
      fontSize: 10,
      lineHeight: "14px",
      fontWeight: 600,
    }}>
      {label}
    </span>
  );
}

function cardStyle(compact, background, border) {
  return {
    width: "100%",
    minHeight: compact ? 150 : 182,
    padding: compact ? "16px 18px" : "20px 22px",
    borderRadius: 8,
    background,
    border: `1px solid ${border}`,
    boxShadow: "0 10px 30px rgba(15,23,42,0.07)",
    textAlign: "left",
  };
}

function buttonReset(style) {
  return {
    ...style,
    display: "block",
    cursor: "pointer",
    fontFamily: "inherit",
  };
}
