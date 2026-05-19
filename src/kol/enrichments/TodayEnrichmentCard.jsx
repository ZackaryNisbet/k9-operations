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

function dogCountLabel(count) {
  const parsed = Number(count);
  if (!Number.isFinite(parsed)) return "0 dogs";
  const rounded = Math.max(0, Math.round(parsed));
  return `${rounded} ${rounded === 1 ? "dog" : "dogs"}`;
}

function buildSignupState(workflow, workflowLoading) {
  const signedUp = Number(workflow?.scheduledCount ?? workflow?.total ?? 0);
  const needsReview = Number(workflow?.needsReviewCount || 0);
  const rows = Number(workflow?.rowCount || 0);
  return {
    signedUp: Number.isFinite(signedUp) ? signedUp : 0,
    needsReview: Number.isFinite(needsReview) ? needsReview : 0,
    rows: Number.isFinite(rows) ? rows : 0,
    loading: workflowLoading,
  };
}

export default function TodayEnrichmentCard({
  events = [],
  date = new Date(),
  nav,
  compact = false,
  loading = false,
  labelOverride = "",
  enrichmentWorkflow = null,
  workflowLoading = false,
  dashboardPreview = false,
}) {
  const day = normalizeDate(date);
  const todaysEvents = useMemo(() => getEventsForDate(events, day, "staff"), [events, day]);
  const nextEvent = useMemo(() => getNextEnrichmentEvent(events, day, "staff"), [events, day]);
  const primary = todaysEvents[0] || nextEvent;
  const theme = getThemeConfig(primary?.visual_theme || "neutral");
  const isToday = primary?.event_date === day;
  const signup = buildSignupState(enrichmentWorkflow, workflowLoading);
  const signupStatus = signup.loading && !signup.rows
    ? "Checking dogs"
    : `${dogCountLabel(signup.signedUp)} signed up`;

  if (dashboardPreview) {
    return (
      <DashboardEnrichmentPreview
        primary={primary}
        day={day}
        nav={nav}
        loading={loading}
        labelOverride={labelOverride}
        signupStatus={signupStatus}
      />
    );
  }

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
        <CardHeader theme={theme} label="Enrichments" status={signupStatus} />
        <div style={{ fontSize: compact ? 16 : 18, lineHeight: compact ? "24px" : "26px", fontWeight: 700, color: C.text, marginTop: 12 }}>No event loaded for today</div>
        <div style={{ fontSize: 12, lineHeight: "16px", color: C.textMut, marginTop: 5 }}>
          {signup.signedUp > 0 ? "Dogs are booked into enrichment, but no calendar activity is attached." : "Open the calendar to create the next staff activity."}
        </div>
        <SignupRail signup={signup} compact={compact} />
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
      <CardHeader theme={theme} label={labelOverride || (isToday ? "Today's Enrichment" : "Next Enrichment")} status={signupStatus} />
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
      <SignupRail signup={signup} compact={compact} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 12 }}>
        <Chip label={priceLabel(primary)} />
        <Chip label={`${primary.products?.length || 0} products`} />
        {primary.customer_visible ? <Chip label="Customer graphic" /> : <Chip label="Staff only" />}
        {remainingCount ? <Chip label={`+${remainingCount} more today`} /> : null}
      </div>
    </button>
  );
}

function DashboardEnrichmentPreview({
  primary,
  day,
  nav,
  loading,
  labelOverride,
  signupStatus,
}) {
  const dashboardTheme = {
    color: C.pri,
    soft: "#F0FDF4",
    border: "rgba(20,83,45,0.18)",
  };
  const isToday = primary?.event_date === day;
  const label = labelOverride || (primary ? (isToday ? "Today's Enrichment" : "Next Enrichment") : "Enrichments");
  const title = loading && !primary ? "Checking enrichment" : primary?.title || "No event loaded for today";
  const onClick = () => {
    if (primary) {
      nav?.("enrichments", { selectedDate: primary.event_date, selectedEventId: primary.id });
      return;
    }
    nav?.("enrichments");
  };

  return (
    <button type="button" onClick={onClick} style={buttonReset(dashboardCardStyle(dashboardTheme))}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, minHeight: 106, padding: "13px 20px", minWidth: 0 }}>
        <div style={{
          width: 44,
          height: 44,
          borderRadius: 10,
          background: "#FFFFFF",
          border: `1px solid ${dashboardTheme.border}`,
          color: dashboardTheme.color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          boxShadow: "0 1px 2px rgba(15,23,42,0.05)",
        }}>
          <I.Sparkle />
        </div>
        <div style={{ minWidth: 0, display: "grid", gap: 7, flex: 1 }}>
          <CardHeader theme={dashboardTheme} label={label} />
          <div style={{ fontSize: 16, lineHeight: "21px", color: C.text, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {title}
          </div>
        </div>
        <span style={{
          alignSelf: "center",
          padding: "4px 8px",
          borderRadius: 999,
          background: "#FFFFFF",
          border: `1px solid ${dashboardTheme.color}28`,
          color: dashboardTheme.color,
          fontSize: 10,
          fontWeight: 600,
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}>
          {signupStatus}
        </span>
      </div>
    </button>
  );
}

function SignupRail({ signup, compact }) {
  const facts = [
    { label: "Signed up", value: signup.loading && !signup.rows ? "Checking" : dogCountLabel(signup.signedUp), color: C.pri },
    { label: "Needs review", value: signup.needsReview ? dogCountLabel(signup.needsReview) : "Clear", color: signup.needsReview ? C.warn : C.suc },
    { label: "Service rows", value: signup.rows || signup.signedUp || 0, color: C.text },
  ];
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: compact ? "repeat(3, minmax(0, 1fr))" : "repeat(auto-fit, minmax(118px, 1fr))",
      gap: 10,
      marginTop: 14,
      paddingTop: 12,
      borderTop: "1px solid rgba(15,23,42,0.08)",
    }}>
      {facts.map((fact) => (
        <div key={fact.label} style={{ minWidth: 0 }}>
          <div style={{ fontSize: 9, lineHeight: "12px", color: C.textMut, fontWeight: 750, textTransform: "uppercase", letterSpacing: 0 }}>{fact.label}</div>
          <div style={{ marginTop: 3, fontSize: compact ? 13 : 15, lineHeight: "18px", color: fact.color, fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {fact.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function CardHeader({ theme, label, status }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: theme.color, boxShadow: `0 0 0 4px ${theme.color}18` }} />
        <span style={{ fontSize: 10, lineHeight: "14px", fontWeight: 600, color: theme.color, textTransform: "uppercase", letterSpacing: 0 }}>{label}</span>
      </div>
      {status ? (
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
      ) : null}
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

function dashboardCardStyle(theme) {
  return {
    width: "100%",
    minHeight: 106,
    borderRadius: 16,
    background: `linear-gradient(135deg, ${theme.soft} 0%, #FFFFFF 56%, #ECFDF5 100%)`,
    border: `1.5px solid ${theme.border}`,
    boxShadow: "0 12px 28px rgba(15,23,42,0.07)",
    overflow: "hidden",
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
