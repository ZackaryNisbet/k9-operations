import React, { useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { C } from "../../../shared/theme";
import { I } from "../../../shared/icons";
import {
  GRASSROOTS_STATUS_OPTIONS,
  normalizeGrassrootsStatus,
  normalizeGrassrootsEventType,
  getGrassrootsPrimaryEventDate,
  getGrassrootsStatusLabel,
  getGrassrootsFinalEventDate,
  getGrassrootsEventFieldGaps,
  getGrassrootsBusinessFieldGaps,
  getGrassrootsEventCloseout,
  isGrassrootsEventClosed,
  canCloseGrassrootsEvent,
  calculateGrassrootsCpl,
} from "../../grassrootsData";
import { todayStr, fmtDate, parseNumberField, fmtCurrencyNumber } from "./dateUtils";
import { getSafeEventLinkHref } from "./eventLinks";
import { getGrassrootsColumnMap, usesBusinessCategoryColumn } from "./columns";
import { EventDateDisplay } from "./eventDateDisplay";
import { CellEditButton } from "./cellEditButton";
import { activityActorName } from "./activityList";

// ─────────────────────────────────────────────────────────────────────────────
// DENSE GRASSROOTS TABLE — Exact tight styling the user loves from Clients lifecycle
// (Replaces the loose category card + wide tracker rows with a super-dense table)
// ─────────────────────────────────────────────────────────────────────────────
// Per-category column configuration for the shared dense table. The Events shape
// is the default; other categories map their own data into the same standard
// columns (Organizer / Event / Date / Status / Notes / Follow-Up / Updates) so the
// "All" view can stack every category in one table. `get.*` are optional getters
// (target, activities) -> value; when absent the built-in Events derivation is used.
export function DenseGrassrootsTable({
  targets, activitiesByTarget, categoryConfig, columnMap, onLog, onEdit, onUpdateFollowUp, onToggleUpdates, onOpenRecord,
  expandedUpdates, eventDateSortDirection, onToggleEventDateSort, followUpSortDirection, onToggleFollowUpSort, costSortDirection, onToggleCostSort, onShowFollowUpInfo,
  inlineLoggingId, inlineLogNotes, inlineLogNextDate, onStartInlineLog, onInlineLogNotesChange, onInlineLogNextDateChange, onSaveInlineLog, onCancelInlineLog,
  savingLog, isEventsTable = false, onOpenCellEditor, onCloseEvent, onSetStatus
}) {
  // Use the shared K9 brand palette (forest green primary + lime accent, neutral
  // slate text) — no local navy/gold override.

  // Column configuration — Events shape by default; other categories map their data into the same columns.
  const cm = columnMap || getGrassrootsColumnMap("events");

  // 7-col dense grid — Follow-up placed immediately left of Updates (per request).
  // Tuned widths for better visual balance and tighter overall spacing.
  // Events swap the wide Notes column for a tighter Cost column (notes still live in
  // the Updates expansion), reallocating the freed width to Event + Updates (which now
  // carries the Close button and Overdue/Due-today label).
  // Drops "activity" feed (cm.updatesMode === "edit") only shows Business · Category ·
  // Date · Notes · Edit — Status/Follow-up are hidden, so collapse those tracks and
  // give Notes the lion's share of the width (the note should be readable in-cell).
  const isActivityFeed = cm.updatesMode === "edit";
  const grid = isEventsTable
    ? "minmax(100px, 1.05fr) minmax(150px, 1.55fr) minmax(140px, 1.35fr) 110px 74px 84px minmax(150px, 1.3fr)"
    : isActivityFeed
      ? "minmax(130px, 1fr) 116px 96px 0px minmax(260px, 3fr) 0px 64px"
      : "minmax(105px, 1.1fr) minmax(155px, 1.7fr) 95px 100px minmax(135px, 1.25fr) 82px minmax(118px, 1.05fr)";

  const today = new Date().toISOString().slice(0, 10);

  const [hoveredLinkId, setHoveredLinkId] = useState(null);
  const [copiedLinkId, setCopiedLinkId] = useState(null);
  // Edit-pencil tooltip rendered via a body portal so it is never clipped by the
  // table's overflow:hidden (positioned from the hovered pencil's viewport rect).
  const [editTip, setEditTip] = useState(null); // { text, x, y }
  const showEditTip = useCallback((text, rect) => setEditTip({ text, x: rect.left + rect.width / 2, y: rect.top }), []);
  const hideEditTip = useCallback(() => setEditTip(null), []);
  // Inline status dropdown, anchored to the clicked status pill (body portal).
  const [statusMenu, setStatusMenu] = useState(null); // { targetId, x, y }

  const copyLink = (href, id) => {
    navigator.clipboard.writeText(href).then(() => {
      setCopiedLinkId(id);
      setTimeout(() => setCopiedLinkId(null), 1200);
    }).catch(() => {});
  };

  // Stable per-row handler (completes Round 2 perf hoisting for the count button)
  const handleCountClick = useCallback((id, e) => {
    e.stopPropagation();
    onToggleUpdates && onToggleUpdates(id);
  }, [onToggleUpdates]);

  const STATUS_STYLES = {
    identified: { bg: "#FEF3C7", fg: "#92400E" },
    corresponding: { bg: "#DBEAFE", fg: "#1E40AF" },
    booked: { bg: "#DCFCE7", fg: "#166534" },
    abandoned: { bg: "#FEE2E2", fg: "#991B1B" },
    finished: { bg: "#E2E8F0", fg: "#334155" },
    cancelled: { bg: "#FEF3C7", fg: "#92400E" },
    default: { bg: "#E5E7EB", fg: "#374151" },
  };

  const formatShortDate = (d) => {
    if (!d) return "";
    try { return new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit" }); } catch { return d; }
  };

  return (
    <>
    <div style={{ background: C.surface, border: "none", borderRadius: 0, overflow: "hidden" }}>
      {/* Exact clients-style dense header — tightened per variant 1 choice */}
      <div style={{ display: "grid", gridTemplateColumns: grid, columnGap: "8px", padding: "6px 12px", background: "rgb(255,255,255)", borderBottom: "1px solid rgb(226,232,240)", fontSize: 10, fontWeight: 700, color: "rgb(71,85,105)", textTransform: "uppercase", letterSpacing: "0.06em", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", minHeight: 18 }}>{cm.headers.organizer}</div>
        <div style={{ display: "flex", alignItems: "center", minHeight: 18 }}>{cm.show.event ? cm.headers.event : ""}</div>
        <div
          onClick={cm.sortable.eventDate ? onToggleEventDateSort : undefined}
          style={{ cursor: cm.sortable.eventDate ? "pointer" : "default", userSelect: "none", color: (cm.sortable.eventDate && eventDateSortDirection) ? C.pri : "rgb(71,85,105)", fontWeight: (cm.sortable.eventDate && eventDateSortDirection) ? 800 : 700, display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap", minHeight: 18 }}
          title={cm.sortable.eventDate ? "Sort by event date" : undefined}
        >
          {cm.show.eventDate ? cm.headers.eventDate : ""}{cm.sortable.eventDate && eventDateSortDirection === "asc" ? " ▲" : cm.sortable.eventDate && eventDateSortDirection === "desc" ? " ▼" : ""}
        </div>
        <div style={{ display: "flex", alignItems: "center", minHeight: 18 }}>{cm.show.status ? cm.headers.status : ""}</div>
        {isEventsTable ? (
          <div
            onClick={onToggleCostSort}
            style={{ cursor: onToggleCostSort ? "pointer" : "default", userSelect: "none", color: costSortDirection ? C.pri : "rgb(71,85,105)", fontWeight: costSortDirection ? 800 : 700, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4, whiteSpace: "nowrap", minHeight: 18 }}
            title="Sort by cost"
          >
            Cost{costSortDirection === "asc" ? " ▲" : costSortDirection === "desc" ? " ▼" : ""}
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", minHeight: 18 }}>{cm.show.notes ? cm.headers.notes : ""}</div>
        )}
        <div
          onClick={cm.sortable.followUp ? onToggleFollowUpSort : undefined}
          style={{ cursor: cm.sortable.followUp ? "pointer" : "default", userSelect: "none", color: (cm.sortable.followUp && followUpSortDirection) ? C.pri : "rgb(71,85,105)", fontWeight: (cm.sortable.followUp && followUpSortDirection) ? 800 : 700, display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap", minHeight: 18 }}
          title={cm.sortable.followUp ? "Sort by follow-up date" : undefined}
        >
          {cm.headers.followUp}{cm.sortable.followUp && followUpSortDirection === "asc" ? " ▲" : cm.sortable.followUp && followUpSortDirection === "desc" ? " ▼" : ""}
        </div>
        <div style={{ display: "flex", alignItems: "center", minHeight: 18 }}>{cm.headers.updates}</div>
      </div>

      {targets.length === 0 && (
        <div style={{ padding: "32px 14px", textAlign: "center", color: C.textSec, fontSize: 13 }}>
          {cm.emptyText}
        </div>
      )}

      {targets.map((target) => {
        const targetActivities = activitiesByTarget[target.id] || [];
        const latestActivity = [...targetActivities].sort((a, b) => String(b.activity_date || b.created_at || "").localeCompare(String(a.activity_date || a.created_at || "")))[0];
        const latestNote = latestActivity ? (latestActivity.notes || latestActivity.description || "") : "";
        const notePreview = cm.get.notes ? cm.get.notes(target, targetActivities) : (latestNote ? `${formatShortDate(latestActivity.activity_date || latestActivity.created_at)}: ${latestNote}` : (target.proposal || "—"));

        const followUp = target.next_contact_date || "";
        const isOverdue = !!followUp && followUp < todayStr();
        const isToday = !!followUp && followUp === todayStr();

        const statusKey = normalizeGrassrootsStatus(target.status);
        const st = STATUS_STYLES[statusKey] || STATUS_STYLES.default;

        const eventDate = getGrassrootsPrimaryEventDate(target);
        const eventDateStr = cm.get.eventDate ? cm.get.eventDate(target, targetActivities) : (eventDate ? fmtDate(eventDate) : "—");

        const baseOrganizer = target.organizer || [target.first_name, target.last_name].filter(Boolean).join(" ") || target.contact_source || "—";
        const organizer = cm.get.organizer ? cm.get.organizer(target, targetActivities) : baseOrganizer;
        const eventName = cm.get.event ? cm.get.event(target, targetActivities) : (target.name || categoryConfig.emptyName || "Untitled event");
        const eventType = normalizeGrassrootsEventType(target.event_type);
        const cStatusText = cm.get.statusText ? cm.get.statusText(target, targetActivities) : null;
        // Cost column (events): budget now; cost + CPL once the event is closed out.
        const costVal = parseNumberField(target.cost);
        const costText = fmtCurrencyNumber(costVal);

        const primaryLinkRaw = (Array.isArray(target.details?.links) ? target.details.links : [])
          .map((l) => l?.url || l?.href || "")
          .find((u) => String(u).trim()) || target.link || target.event_link || "";
        const primaryHref = getSafeEventLinkHref(primaryLinkRaw);

        const isExp = !!(expandedUpdates && expandedUpdates.has(target.id));
        const canCloseEvt = isEventsTable && canCloseGrassrootsEvent(target, today);
        const isClosedEvt = isGrassrootsEventClosed(target);
        const isCancelledEvt = isClosedEvt && getGrassrootsEventCloseout(target)?.disposition === "cancelled";
        // Among events awaiting closeout, distinguish "overdue" (final day already passed)
        // from "due today" — drives the small status label beside the Close button.
        const isOverdueClose = canCloseEvt && getGrassrootsFinalEventDate(target) < today;
        // Persistent "more info needed" nudges only for live (not closed) events.
        const gaps = isEventsTable && onOpenCellEditor && !isClosedEvt ? getGrassrootsEventFieldGaps(target) : null;
        // Non-event business/partnership rows get their own needs-info gaps + a category
        // pencil where a category column is shown. Only on TARGET rows (the business
        // view) — the activity feed's rows are visits, not targets.
        const showBizPencils = !isEventsTable && onOpenCellEditor && !isActivityFeed;
        const bizGaps = showBizPencils ? getGrassrootsBusinessFieldGaps(target) : null;
        const usesCategoryCol = usesBusinessCategoryColumn(categoryConfig);

        return (
          <div key={target.id}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: grid,
                columnGap: "8px",
                padding: "4px 10px",
                borderBottom: `1px solid ${C.borderLight}`,
                fontSize: 12,
                alignItems: "start",
              }}
            >
              {/* Organizer / Business — hover reveals a pencil that opens the contact micro-editor */}
              <div className={(isEventsTable && onOpenCellEditor) || showBizPencils ? "gr-edit-cell" : undefined} style={{ display: "flex", alignItems: "flex-start", fontWeight: 700, color: C.text, fontSize: 12, lineHeight: 1.25 }} title={organizer}>
                <span style={{ wordBreak: "break-word", minWidth: 0 }}>{organizer}</span>
                {isEventsTable && onOpenCellEditor && (
                  <CellEditButton
                    onClick={() => onOpenCellEditor(target, "organizer")}
                    needed={!!gaps?.organizer}
                    label={gaps?.organizer ? "Add organizer / contact" : "Edit organizer & contact"}
                    onShowTip={showEditTip}
                    onHideTip={hideEditTip}
                  />
                )}
                {showBizPencils && (
                  <CellEditButton
                    onClick={() => onOpenCellEditor(target, "businessContact")}
                    needed={!!bizGaps?.contact}
                    label={bizGaps?.contact ? `Add ${bizGaps.contactMissing.join(" / ")}` : "Edit business & contact"}
                    onShowTip={showEditTip}
                    onHideTip={hideEditTip}
                  />
                )}
              </div>

              {/* Event name — hyperlink to the stored link (if any). On hover: type badge,
                  edit pencil (events), and explicit Copy + Open icons. */}
              <div
                className={(isEventsTable && onOpenCellEditor) || (showBizPencils && usesCategoryCol) ? "gr-edit-cell" : undefined}
                style={{
                  fontWeight: 600,
                  color: C.text,
                  wordBreak: "break-word",
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4
                }}
                onMouseEnter={() => primaryHref && setHoveredLinkId(target.id)}
                onMouseLeave={() => setHoveredLinkId(null)}
              >
                {(cm.allowEventLink && primaryHref) ? (
                  <a
                    href={primaryHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    style={{ color: "inherit", textDecoration: "none" }}
                    title={primaryHref}
                  >
                    {eventName}
                  </a>
                ) : (
                  eventName
                )}

                {cm.allowEventLink && primaryHref && hoveredLinkId === target.id && (
                  <span style={{ display: 'inline-flex', gap: 1, opacity: 0.75, alignItems: 'center' }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        navigator.clipboard.writeText(eventName).then(() => {
                          setCopiedLinkId(target.id);
                          setTimeout(() => setCopiedLinkId(null), 1200);
                        }).catch(() => {});
                      }}
                      style={{ 
                        padding: 1, 
                        border: 'none', 
                        background: 'transparent', 
                        cursor: 'pointer', 
                        color: C.textSec,
                        display: 'flex',
                        alignItems: 'center'
                      }}
                      title="Copy event name"
                    >
                      <span style={{ width: 12, height: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ transform: 'scale(0.65)', transformOrigin: 'center' }}>
                          {copiedLinkId === target.id ? <I.CheckCircle /> : <I.Clipboard />}
                        </span>
                      </span>
                    </button>
                    <a
                      href={primaryHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      style={{ 
                        padding: 1, 
                        color: C.textSec,
                        display: 'flex',
                        alignItems: 'center',
                        textDecoration: 'none'
                      }}
                      title="Open link"
                    >
                      <span style={{ width: 12, height: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ transform: 'scale(0.65)', transformOrigin: 'center' }}>
                          <I.Link />
                        </span>
                      </span>
                    </a>
                  </span>
                )}

                {isEventsTable && onOpenCellEditor && (
                  <>
                    {eventType && (
                      <span className="gr-edit-reveal" style={{ fontSize: 9, fontWeight: 800, padding: '0 5px', borderRadius: 999, background: `${C.pri}14`, color: C.pri, letterSpacing: '0.04em', whiteSpace: 'nowrap' }} title={`Event type: ${eventType}`}>
                        {eventType}
                      </span>
                    )}
                    <CellEditButton
                      onClick={() => onOpenCellEditor(target, "event")}
                      needed={!!gaps?.event}
                      label={gaps?.event ? `Add ${gaps.eventMissing.join(" & ")}` : "Edit event details (address, type, cost)"}
                      onShowTip={showEditTip}
                      onHideTip={hideEditTip}
                    />
                  </>
                )}
                {showBizPencils && usesCategoryCol && (
                  <CellEditButton
                    onClick={() => onOpenCellEditor(target, "category")}
                    needed={!!bizGaps?.category}
                    label={bizGaps?.category ? "Set category (required)" : "Edit category"}
                    onShowTip={showEditTip}
                    onHideTip={hideEditTip}
                  />
                )}
              </div>

              {/* Event Date (sortable) — events show weekday + time + multi-day shape;
                  hover pencil opens the date editor */}
              <div className={isEventsTable && onOpenCellEditor ? "gr-edit-cell" : undefined} style={{ display: "flex", alignItems: "flex-start", fontSize: 11, fontWeight: 700, color: C.text }}>
                {isEventsTable ? <EventDateDisplay target={target} /> : <span style={{ whiteSpace: "nowrap" }}>{eventDateStr}</span>}
                {isEventsTable && onOpenCellEditor && (
                  <CellEditButton
                    onClick={() => onOpenCellEditor(target, "date")}
                    needed={!!gaps?.date}
                    label={gaps?.date ? "Add event date" : "Edit event date(s)"}
                    onShowTip={showEditTip}
                    onHideTip={hideEditTip}
                  />
                )}
              </div>

              {/* Status — status pill (default), plain-text chip (e.g. Drops Outcome), or hidden */}
              <div className={onSetStatus && !isClosedEvt ? "gr-edit-cell" : undefined}>
                {!cm.show.status ? null : cm.statusVariant === "text" ? (
                  cStatusText
                    ? <span style={{ fontSize: 11, fontWeight: 700, color: C.textSec, lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }} title={cStatusText}>{cStatusText}</span>
                    : <span style={{ color: C.textMut, fontSize: 11 }}>—</span>
                ) : (onSetStatus && !isClosedEvt) ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const r = e.currentTarget.getBoundingClientRect();
                      setStatusMenu((prev) => (prev && prev.targetId === target.id) ? null : { targetId: target.id, x: r.left, y: r.bottom });
                    }}
                    title="Change status"
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 3,
                      fontSize: 10, fontWeight: 800, padding: "1px 6px 1px 8px", borderRadius: 999,
                      background: st.bg, color: st.fg, whiteSpace: "nowrap", letterSpacing: "0.02em",
                      border: "none", cursor: "pointer", fontFamily: "inherit",
                    }}
                  >
                    {getGrassrootsStatusLabel(target.status)}
                    <span className="gr-edit-reveal" style={{ display: "inline-flex", alignItems: "center" }}>
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
                    </span>
                  </button>
                ) : (
                  <span style={{
                    display: "inline-block",
                    fontSize: 10,
                    fontWeight: 800,
                    padding: "1px 8px",
                    borderRadius: 999,
                    background: (isEventsTable && isClosedEvt ? (isCancelledEvt ? STATUS_STYLES.cancelled : STATUS_STYLES.finished) : st).bg,
                    color: (isEventsTable && isClosedEvt ? (isCancelledEvt ? STATUS_STYLES.cancelled : STATUS_STYLES.finished) : st).fg,
                    whiteSpace: "nowrap",
                    letterSpacing: "0.02em",
                  }}>
                    {isEventsTable && isClosedEvt ? (isCancelledEvt ? "Cancelled" : "Finished") : getGrassrootsStatusLabel(target.status)}
                  </span>
                )}
              </div>

              {/* Events: Cost (+ CPL once closed). Other categories: Notes preview. */}
              {isEventsTable ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", justifyContent: "flex-start", whiteSpace: "nowrap", lineHeight: 1.25 }}>
                  {costText ? (
                    <>
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>${costText}</span>
                      {isClosedEvt && (() => {
                        const cplVal = parseNumberField(target.cpl) ?? calculateGrassrootsCpl(costVal, parseNumberField(target.leads_captured));
                        const cplText = fmtCurrencyNumber(cplVal);
                        return cplText ? <span style={{ fontSize: 9, fontWeight: 700, color: C.textMut }}>${cplText}/lead</span> : null;
                      })()}
                    </>
                  ) : (
                    <span style={{ fontSize: 11, color: C.textMut }}>—</span>
                  )}
                </div>
              ) : (
                <div
                  onClick={isActivityFeed && onEdit ? () => onEdit(target) : undefined}
                  style={{
                    fontSize: 11,
                    color: C.textSec,
                    lineHeight: 1.35,
                    display: "-webkit-box",
                    WebkitLineClamp: isActivityFeed ? 4 : 3,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                    cursor: isActivityFeed && onEdit ? "pointer" : undefined,
                  }}
                  title={isActivityFeed ? "Click to edit this visit" : (cm.show.notes ? notePreview : undefined)}
                >
                  {cm.show.notes ? notePreview : null}
                </div>
              )}

              {/* Follow-Up — click shows "set/created" timestamp popover (exact reference behavior from Customer Lifecycle created field) */}
              {cm.show.followUp ? (
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onShowFollowUpInfo) onShowFollowUpInfo(target, e.clientX, e.clientY);
                  }}
                  style={{ cursor: "pointer", fontSize: 11, fontWeight: 800, color: followUp ? C.pri : C.text, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2, whiteSpace: "nowrap" }}
                  title="Click to see when this follow-up was set (edit via Log button)"
                >
                  <span>{followUp ? fmtDate(followUp) : "—"}</span>
                  {isOverdue && <span style={{ fontSize: 9, fontWeight: 800, color: C.dan, background: `${C.dan}18`, padding: "0 3px", borderRadius: 3, letterSpacing: "0.02em", alignSelf: "flex-start" }}>OVERDUE</span>}
                  {isToday && <span style={{ fontSize: 9, fontWeight: 800, color: C.suc, background: `${C.suc}18`, padding: "0 3px", borderRadius: 3, letterSpacing: "0.02em", alignSelf: "flex-start" }}>TODAY</span>}
                </div>
              ) : <div />}

              {/* Updates: Edit-only (e.g. Drops activity rows) or full count + Log + Edit */}
              {cm.updatesMode === "edit" ? (
                <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                  {onEdit && (
                    <button
                      onClick={() => onEdit(target)}
                      style={{ padding: "1px 5px", borderRadius: 4, border: `1px solid ${C.border}`, background: "#fff", color: C.textSec, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                    >
                      Edit
                    </button>
                  )}
                </div>
              ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                <button
                  onClick={(e) => { e.stopPropagation(); if (onOpenRecord) { onOpenRecord(target); } else { handleCountClick(target.id, e); } }}
                  style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 18, height: 18, padding: "0 4px", borderRadius: 5, fontSize: 10, fontWeight: 800, border: isExp ? `1px solid ${C.pri}` : "none", cursor: "pointer", fontFamily: "inherit", background: isExp ? C.pri : (targetActivities.length > 0 ? `${C.pri}14` : C.bg), color: isExp ? "#fff" : (targetActivities.length > 0 ? C.pri : C.textMut) }}
                  title={onOpenRecord ? "View record & activity" : `${targetActivities.length} updates — click to ${isExp ? "collapse" : "expand"}`}
                >
                  {targetActivities.length}
                </button>

                {/* Log button stays put and flips to an active (filled) state while its
                    composer is open; clicking it again closes the composer. */}
                <button
                  onClick={() => (inlineLoggingId === target.id ? (onCancelInlineLog && onCancelInlineLog()) : onLog(target))}
                  title={inlineLoggingId === target.id ? "Close log composer" : "Log an update"}
                  style={inlineLoggingId === target.id
                    ? { padding: "1px 6px", borderRadius: 5, border: `1px solid ${C.pri}`, background: C.pri, color: "#fff", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }
                    : { padding: "1px 6px", borderRadius: 5, border: `1px solid ${C.pri}35`, background: `${C.pri}0A`, color: C.pri, fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
                >
                  Log
                </button>

                {/* Events: "Close" replaces "Edit" — greyed until the final event day is
                    reached. Editing now happens via the per-cell pencils. Other categories
                    keep the Edit button (lifted TargetEditor). */}
                {isEventsTable && onCloseEvent ? (
                  isClosedEvt ? (
                    <span style={{ padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 800, color: C.textMut, background: C.bg, border: `1px solid ${C.borderLight}`, whiteSpace: "nowrap" }} title={isCancelledEvt ? "This event was cancelled (couldn't attend)" : "This event has been closed out"}>
                      {isCancelledEvt ? "Cancelled" : "Finished"}
                    </span>
                  ) : (
                    <>
                      <button
                        onClick={() => canCloseEvt && onCloseEvent(target)}
                        disabled={!canCloseEvt}
                        title={canCloseEvt ? "Close out this event" : "Available on or after the event's final day"}
                        style={{ padding: "1px 6px", borderRadius: 4, border: `1px solid ${canCloseEvt ? C.pri : C.border}`, background: canCloseEvt ? `${C.pri}0A` : "transparent", color: canCloseEvt ? C.pri : C.textMut, fontSize: 10, fontWeight: 700, cursor: canCloseEvt ? "pointer" : "not-allowed", fontFamily: "inherit", opacity: canCloseEvt ? 1 : 0.55 }}
                      >
                        Close
                      </button>
                      {canCloseEvt && (
                        <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", whiteSpace: "nowrap", color: isOverdueClose ? C.dan : C.warn }} title={isOverdueClose ? "This event has passed and still needs closing out" : "This event is today — close it out once it wraps"}>
                          {isOverdueClose ? "Overdue" : "Due today"}
                        </span>
                      )}
                    </>
                  )
                ) : (
                  onEdit && (
                    <button
                      onClick={() => onEdit(target)}
                      style={{ padding: "1px 5px", borderRadius: 4, border: `1px solid ${C.border}`, background: "#fff", color: C.textSec, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                    >
                      Edit
                    </button>
                  )
                )}
              </div>
              )}
            </div>

            {/* Expanded area: the activity history. Logging happens in the shared LogEntryModal. */}
            {cm.updatesMode !== "edit" && isExp && (
              <div style={{ background: C.bg, borderBottom: `1px solid ${C.borderLight}` }}>

                {/* Existing history entries */}
                {targetActivities.length > 0 && (
                  <div style={{ padding: "8px 14px 4px" }}>
                    {[...targetActivities].sort((a, b) => String(b.created_at || b.activity_date || "").localeCompare(String(a.created_at || a.activity_date || ""))).map((act, idx, arr) => (
                      <div key={act.id} style={{ marginBottom: idx === arr.length - 1 ? 0 : 6, paddingBottom: idx === arr.length - 1 ? 0 : 6, borderBottom: idx === arr.length - 1 ? "none" : `1px solid ${C.borderLight}` }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: C.pri, marginBottom: 1 }}>{activityActorName(act)} — {fmtDate(act.activity_date || act.created_at)}{act.created_at ? ` · ${new Date(act.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}` : ""}</div>
                        <div style={{ fontSize: 11, color: C.text, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{act.notes || "—"}</div>
                        {act.next_contact_date && <div style={{ fontSize: 9, color: C.textSec, marginTop: 1 }}>Follow-up: {fmtDate(act.next_contact_date)}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
    {editTip && createPortal(
      <div style={{ position: "fixed", left: editTip.x, top: editTip.y - 8, transform: "translate(-50%, -100%)", background: C.text, color: "#fff", fontSize: 10, fontWeight: 700, letterSpacing: "0.01em", whiteSpace: "nowrap", padding: "3px 7px", borderRadius: 6, boxShadow: "0 4px 12px rgba(15,23,42,0.22)", pointerEvents: "none", zIndex: 10000 }}>
        {editTip.text}
      </div>,
      document.body,
    )}
    {statusMenu && onSetStatus && (() => {
      const tg = targets.find((t) => t.id === statusMenu.targetId);
      if (!tg) return null;
      return createPortal(
        <>
          <div onClick={() => setStatusMenu(null)} style={{ position: "fixed", inset: 0, zIndex: 9998 }} />
          <div style={{ position: "fixed", left: statusMenu.x, top: statusMenu.y + 4, zIndex: 9999, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: "0 12px 32px rgba(15,23,42,0.18)", padding: 4, minWidth: 156 }}>
            {GRASSROOTS_STATUS_OPTIONS.map((opt) => {
              const current = normalizeGrassrootsStatus(tg.status) === opt.value;
              const s = STATUS_STYLES[opt.value] || STATUS_STYLES.default;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { setStatusMenu(null); onSetStatus(tg, opt.value); }}
                  style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 9px", border: "none", background: current ? C.bg : "transparent", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: current ? 800 : 600, color: C.text, textAlign: "left" }}
                >
                  <span style={{ width: 9, height: 9, borderRadius: 999, background: s.bg, border: `1.5px solid ${s.fg}`, flexShrink: 0 }} />
                  {opt.label}
                </button>
              );
            })}
          </div>
        </>,
        document.body,
      );
    })()}
    </>
  );
}
