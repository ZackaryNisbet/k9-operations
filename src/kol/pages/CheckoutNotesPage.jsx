import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../supabaseClient";
import { C, fmtDate, todayStr } from "../../shared/theme";
import { Badge, Card } from "../../shared/ui";

const LIVE_POLL_MS = 20000;
const FLAG_TYPE_SUB = "gingr_note_flag";
const ALL_TAB = "__all__";
const VIEWS = [
  { key: "daily", label: "Daily Notes" },
  { key: "boarding", label: "Active Boarding" },
  { key: "flagged", label: "Flagged" },
];

function ChevronLeftIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function ChevronRightIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function CalendarIcon({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function BookmarkIcon({ filled = false, size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function ExternalLinkIcon({ size = 13 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

function CaretIcon({ open = false, size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function EmptyState({ title, subtitle }) {
  return (
    <Card style={{ padding: 36, textAlign: "center", color: C.textMut }}>
      <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: 6 }}>{title}</div>
      {subtitle ? <div style={{ fontSize: 13, lineHeight: 1.5 }}>{subtitle}</div> : null}
    </Card>
  );
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function decodeHtmlEntities(value) {
  const named = { amp: "&", apos: "'", gt: ">", lt: "<", nbsp: " ", quot: "\"" };
  return String(value || "").replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    const normalized = String(entity || "").toLowerCase();
    if (normalized.startsWith("#x")) {
      const codePoint = Number.parseInt(normalized.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    if (normalized.startsWith("#")) {
      const codePoint = Number.parseInt(normalized.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return named[normalized] ?? match;
  });
}

function cleanNoteText(value) {
  let text = String(value || "").trim();
  if (!text) return "";
  text = text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|li|ul|ol|h[1-6]|blockquote|tr)\s*>/gi, "\n")
    .replace(/<\s*li\b[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, " ");
  text = decodeHtmlEntities(decodeHtmlEntities(text)).replace(/\u00a0/g, " ");
  return text
    .split("\n")
    .map((line) => line
      .replace(/[ \t]+/g, " ")
      .replace(/^\s*(?:>\s*)+/, "")
      .replace(/\s*(?:>\s*)+$/, "")
      .replace(/\s+>\s*(?=[A-Za-z0-9])/g, " ")
      .replace(/\s+>\s*(?=[,.;:!?)]|$)/g, "")
      .trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

async function describeFunctionError(error) {
  const fallback = error?.message || "Failed to refresh Gingr notes";
  const response = error?.context;
  if (!response || typeof response.clone !== "function") return fallback;
  try {
    const body = await response.clone().json();
    const detail = body?.error || body?.message || body?.details;
    return detail ? `Live sync failed (${response.status}): ${detail}` : `Live sync failed (${response.status}): ${fallback}`;
  } catch (_jsonError) {
    try {
      const text = await response.clone().text();
      return text ? `Live sync failed (${response.status}): ${text.slice(0, 220)}` : `Live sync failed (${response.status}): ${fallback}`;
    } catch (_textError) {
      return `Live sync failed (${response.status}): ${fallback}`;
    }
  }
}

function noteTypeLabel(entry) {
  const label = String(entry?.note_type || entry?.note_title || "").trim();
  if (/^owner note$/i.test(label)) return "Owner Notes";
  if (/^dog note$/i.test(label)) return "Pet Notes";
  return label || (entry?.subject_kind === "owner" ? "Owner Notes" : "Pet Notes");
}

function formatTimestamp(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDateLong(value) {
  if (!value) return "";
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateShort(value) {
  if (!value) return "";
  const parsed = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function flagRowId(locationId, noteId) {
  return `ops_gingr_note_flag_${locationId}_${noteId}`;
}

function noteSnapshot(entry) {
  return {
    ...entry,
    note_text: cleanNoteText(entry?.note_text),
  };
}

function mergeRowsById(rows) {
  const map = new Map();
  for (const row of rows || []) {
    if (row?.id) map.set(row.id, row);
  }
  return Array.from(map.values());
}

function GingrLink({ href, children, title }) {
  if (!href) return <span>{children}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={title || "Open in Gingr"}
      style={{ display: "inline-flex", alignItems: "center", gap: 4, color: C.pri, textDecoration: "none", fontWeight: 800 }}
    >
      {children}
      <ExternalLinkIcon />
    </a>
  );
}

function IconButton({ children, onClick, disabled, title, active = false, style = {} }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 34,
        height: 34,
        borderRadius: 9,
        border: `1.5px solid ${active ? C.pri : C.border}`,
        background: active ? C.priLt : C.surface,
        color: active ? C.pri : C.textSec,
        cursor: disabled ? "default" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        opacity: disabled ? 0.45 : 1,
        fontFamily: "inherit",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function TabButton({ active, children, onClick, count }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: `1.5px solid ${active ? C.pri : C.border}`,
        background: active ? C.pri : C.surface,
        color: active ? "#fff" : C.textSec,
        borderRadius: 9,
        padding: "8px 12px",
        fontSize: 12,
        fontWeight: 800,
        cursor: "pointer",
        fontFamily: "inherit",
        display: "inline-flex",
        gap: 7,
        alignItems: "center",
        whiteSpace: "nowrap",
      }}
    >
      <span>{children}</span>
      {typeof count === "number" ? (
        <span style={{
          minWidth: 20,
          height: 20,
          padding: "0 6px",
          borderRadius: 10,
          background: active ? "rgba(255,255,255,0.18)" : C.bg,
          color: active ? "#fff" : C.textMut,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 11,
          fontWeight: 900,
        }}>{count}</span>
      ) : null}
    </button>
  );
}

function DateNavigator({ value, onChange, today }) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => new Date(`${value}T12:00:00`).getMonth());
  const [year, setYear] = useState(() => new Date(`${value}T12:00:00`).getFullYear());
  const ref = useRef(null);

  useEffect(() => {
    const parsed = new Date(`${value}T12:00:00`);
    setMonth(parsed.getMonth());
    setYear(parsed.getFullYear());
  }, [value, open]);

  useEffect(() => {
    if (!open) return undefined;
    const handler = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const days = useMemo(() => {
    const first = new Date(year, month, 1);
    const start = first.getDay();
    const count = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let index = 0; index < start; index += 1) cells.push(null);
    for (let day = 1; day <= count; day += 1) cells.push(day);
    return cells;
  }, [month, year]);

  const shiftDate = (daysToMove) => {
    const parsed = new Date(`${value}T12:00:00`);
    parsed.setDate(parsed.getDate() + daysToMove);
    const next = parsed.toISOString().slice(0, 10);
    if (next <= today) onChange(next);
  };
  const prevMonth = () => {
    if (month === 0) {
      setMonth(11);
      setYear((current) => current - 1);
    } else {
      setMonth((current) => current - 1);
    }
  };
  const nextMonth = () => {
    if (month === 11) {
      setMonth(0);
      setYear((current) => current + 1);
    } else {
      setMonth((current) => current + 1);
    }
  };
  const selectDay = (day) => {
    const next = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (next <= today) {
      onChange(next);
      setOpen(false);
    }
  };
  const monthLabel = new Date(year, month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div ref={ref} style={{ position: "relative", display: "flex", alignItems: "center", gap: 6 }}>
      <IconButton onClick={() => shiftDate(-1)} title="Previous day"><ChevronLeftIcon /></IconButton>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        style={{
          minWidth: 238,
          borderRadius: 10,
          border: `1.5px solid ${open ? C.pri : C.border}`,
          background: C.surface,
          color: C.text,
          padding: "8px 12px",
          fontSize: 13,
          fontWeight: 800,
          fontFamily: "inherit",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          cursor: "pointer",
        }}
      >
        <CalendarIcon /> {formatDateLong(value)}
      </button>
      <IconButton onClick={() => shiftDate(1)} disabled={value >= today} title="Next day"><ChevronRightIcon /></IconButton>
      {value !== today ? (
        <button
          type="button"
          onClick={() => onChange(today)}
          style={{ border: `1.5px solid ${C.pri}`, background: C.priLt, color: C.pri, borderRadius: 9, padding: "8px 12px", fontSize: 12, fontWeight: 900, cursor: "pointer", fontFamily: "inherit" }}
        >
          Today
        </button>
      ) : null}

      {open ? (
        <div style={{ position: "absolute", top: "100%", right: 0, marginTop: 8, width: 280, zIndex: 100, padding: 16, borderRadius: 14, background: C.surface, border: `1.5px solid ${C.border}`, boxShadow: "0 16px 44px rgba(15,23,42,0.14)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <IconButton onClick={prevMonth} title="Previous month" style={{ width: 30, height: 30 }}><ChevronLeftIcon size={13} /></IconButton>
            <div style={{ fontSize: 14, fontWeight: 900, color: C.text }}>{monthLabel}</div>
            <IconButton onClick={nextMonth} title="Next month" style={{ width: 30, height: 30 }}><ChevronRightIcon size={13} /></IconButton>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", textAlign: "center", marginBottom: 4 }}>
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
              <span key={day} style={{ fontSize: 10, fontWeight: 800, color: C.textMut, padding: "4px 0", textTransform: "uppercase" }}>{day}</span>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
            {days.map((day, index) => {
              if (!day) return <div key={`blank-${index}`} />;
              const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              const selected = date === value;
              const current = date === today;
              const disabled = date > today;
              return (
                <button
                  key={date}
                  type="button"
                  disabled={disabled}
                  onClick={() => selectDay(day)}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    border: selected ? `2px solid ${C.pri}` : current ? `2px solid ${C.acc}` : "2px solid transparent",
                    background: selected ? C.pri : "transparent",
                    color: disabled ? C.border : selected ? "#fff" : current ? C.acc : C.text,
                    opacity: disabled ? 0.4 : 1,
                    cursor: disabled ? "default" : "pointer",
                    fontSize: 13,
                    fontWeight: selected || current ? 900 : 600,
                    fontFamily: "inherit",
                  }}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function NoteCard({ entry, flagged, onToggleFlag }) {
  const subjectUrl = entry.subject_kind === "owner" ? entry.gingr_urls?.owner : entry.gingr_urls?.animal;
  const secondaryParts = [];
  if (entry.dog_name && entry.dog_name !== entry.subject_name) {
    secondaryParts.push(
      <GingrLink key="dog" href={entry.gingr_urls?.animal} title="Open dog in Gingr">{entry.dog_name}</GingrLink>,
    );
  }
  if (entry.owner_name && entry.owner_name !== entry.subject_name) {
    secondaryParts.push(
      <GingrLink key="owner" href={entry.gingr_urls?.owner} title="Open owner in Gingr">{entry.owner_name}</GingrLink>,
    );
  }

  return (
    <Card style={{ padding: 18 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontSize: 17, fontWeight: 900, color: C.text, minWidth: 0 }}>
              <GingrLink href={subjectUrl} title="Open profile in Gingr">{entry.subject_name || "Unknown"}</GingrLink>
            </div>
            <Badge color={entry.note_source === "owner_note" ? "warning" : "primary"}>{noteTypeLabel(entry)}</Badge>
          </div>
          {secondaryParts.length > 0 ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12, color: C.textMut, marginTop: 5 }}>
              {secondaryParts.map((part, index) => (
                <React.Fragment key={index}>
                  {index > 0 ? <span style={{ color: C.border }}>•</span> : null}
                  {part}
                </React.Fragment>
              ))}
            </div>
          ) : null}
          <div style={{ fontSize: 12, color: C.textMut, marginTop: 5 }}>
            {formatTimestamp(entry.note_created_at) || entry.note_date || "Date unavailable"}
            {entry.created_by_name ? ` - By ${entry.created_by_name}` : ""}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {entry.reservation_gingr_id ? (
            <GingrLink href={entry.gingr_urls?.reservation} title="Open reservation in Gingr">
              <span style={{ fontSize: 11 }}>Reservation #{entry.reservation_gingr_id}</span>
            </GingrLink>
          ) : null}
          <IconButton
            active={flagged}
            onClick={() => onToggleFlag(entry)}
            title={flagged ? "Unflag note" : "Flag note"}
            style={{ color: flagged ? C.warn : C.textSec }}
          >
            <BookmarkIcon filled={flagged} />
          </IconButton>
        </div>
      </div>
      <div style={{ fontSize: 13, color: C.text, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{cleanNoteText(entry.note_text)}</div>
    </Card>
  );
}

function NotesList({ entries, flagMap, onToggleFlag, emptyTitle, emptySubtitle }) {
  if (!entries.length) return <EmptyState title={emptyTitle} subtitle={emptySubtitle} />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {entries.map((entry) => (
        <NoteCard key={entry.id} entry={entry} flagged={Boolean(flagMap.get(entry.id))} onToggleFlag={onToggleFlag} />
      ))}
    </div>
  );
}

function DetailPill({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ minWidth: 120 }}>
      <div style={{ fontSize: 9, fontWeight: 900, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 12, color: C.text, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

function BoardingRow({ group, expanded, onToggle, flagMap, onToggleFlag }) {
  const notes = Array.isArray(group.notes) ? group.notes : [];
  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: 16, display: "grid", gridTemplateColumns: "minmax(180px, 1.4fr) minmax(360px, 2fr) auto", gap: 16, alignItems: "center" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <GingrLink href={group.gingr_urls?.animal} title="Open dog in Gingr">{group.dog_name || group.subject_name || "Unknown dog"}</GingrLink>
            {group.is_checkout_today ? <Badge color="warning">Checkout Today</Badge> : null}
          </div>
          {group.owner_name ? (
            <div style={{ fontSize: 12, color: C.textMut, marginTop: 5 }}>
              <GingrLink href={group.gingr_urls?.owner} title="Open owner in Gingr">{group.owner_name}</GingrLink>
            </div>
          ) : null}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(90px, 1fr))", gap: 12 }}>
          <DetailPill label="Room" value={group.room || "Unassigned"} />
          <DetailPill label="Check-in" value={[formatDateShort(group.check_in_date), group.check_in_time].filter(Boolean).join(" ")} />
          <DetailPill label="Checkout" value={[formatDateShort(group.check_out_date), group.check_out_time].filter(Boolean).join(" ")} />
          <DetailPill label="Reservation" value={group.reservation_gingr_id ? (
            <GingrLink href={group.gingr_urls?.reservation} title="Open reservation in Gingr">#{group.reservation_gingr_id}</GingrLink>
          ) : "Missing"} />
        </div>
        <button
          type="button"
          onClick={onToggle}
          style={{
            border: `1.5px solid ${expanded ? C.pri : C.border}`,
            background: expanded ? C.priLt : C.surface,
            color: expanded ? C.pri : C.text,
            borderRadius: 10,
            padding: "9px 12px",
            fontSize: 12,
            fontWeight: 900,
            cursor: "pointer",
            fontFamily: "inherit",
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            justifyContent: "center",
            whiteSpace: "nowrap",
          }}
        >
          {notes.length} note{notes.length === 1 ? "" : "s"} <CaretIcon open={expanded} />
        </button>
      </div>
      {expanded ? (
        <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          {notes.map((note) => (
            <NoteCard key={note.id} entry={note} flagged={Boolean(flagMap.get(note.id))} onToggleFlag={onToggleFlag} />
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function BoardingView({ groups, summary, expandedMap, setExpandedMap, flagMap, onToggleFlag }) {
  const checkoutGroups = groups.filter((group) => group.is_checkout_today);
  const otherGroups = groups.filter((group) => !group.is_checkout_today);
  const renderGroup = (group) => (
    <BoardingRow
      key={group.id}
      group={group}
      expanded={Boolean(expandedMap[group.id])}
      onToggle={() => setExpandedMap((current) => ({ ...current, [group.id]: !current[group.id] }))}
      flagMap={flagMap}
      onToggleFlag={onToggleFlag}
    />
  );

  if (!groups.length) {
    return (
      <EmptyState
        title="No active boarding notes found"
        subtitle="The sync found active boarding reservations, but none have owner or dog notes during the current stay."
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {checkoutGroups.length > 0 ? (
        <section>
          <div style={{ fontSize: 12, fontWeight: 900, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 8px 2px" }}>Checking Out Today</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{checkoutGroups.map(renderGroup)}</div>
        </section>
      ) : null}
      {otherGroups.length > 0 ? (
        <section>
          <div style={{ fontSize: 12, fontWeight: 900, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 8px 2px" }}>Other Active Boarding</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{otherGroups.map(renderGroup)}</div>
        </section>
      ) : null}
      {summary?.reservations_without_notes > 0 ? (
        <div style={{ padding: "12px 14px", borderRadius: 10, background: C.bg, border: `1px solid ${C.borderLight}`, color: C.textMut, fontSize: 12, lineHeight: 1.5 }}>
          {summary.reservations_without_notes} other active boarding reservation{summary.reservations_without_notes === 1 ? " has" : "s have"} no owner or dog notes created during the current stay window.
        </div>
      ) : null}
    </div>
  );
}

export default function CheckoutNotesPage({ nav, profile, addGlobalToast = () => {} }) {
  const locationRef = profile?.location_id || "";
  const [resolvedLocationId, setResolvedLocationId] = useState("");
  const locationId = resolvedLocationId || (isUuid(locationRef) ? locationRef : "");
  const today = todayStr();
  const [selectedDate, setSelectedDate] = useState(today);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [liveRefreshAvailable, setLiveRefreshAvailable] = useState(true);
  const [entries, setEntries] = useState([]);
  const [noteTypes, setNoteTypes] = useState([]);
  const [reservationGroups, setReservationGroups] = useState([]);
  const [reservationSummary, setReservationSummary] = useState({});
  const [refreshedAt, setRefreshedAt] = useState("");
  const [diagnostics, setDiagnostics] = useState({});
  const [refreshError, setRefreshError] = useState("");
  const [viewMode, setViewMode] = useState("daily");
  const [activeNoteType, setActiveNoteType] = useState(ALL_TAB);
  const [flagRows, setFlagRows] = useState([]);
  const [expandedReservations, setExpandedReservations] = useState({});
  const refreshInFlightKeyRef = useRef("");
  const activeSelectionRef = useRef("");
  const isToday = selectedDate === today;
  const notesRowId = useMemo(() => {
    if (!locationId || !selectedDate) return "";
    return `ops_gingr_notes_${locationId}_${selectedDate}`;
  }, [locationId, selectedDate]);

  useEffect(() => {
    activeSelectionRef.current = `${locationId}|${selectedDate}`;
  }, [locationId, selectedDate]);

  useEffect(() => {
    let active = true;
    if (!locationRef) {
      setResolvedLocationId("");
      return undefined;
    }
    if (isUuid(locationRef)) {
      setResolvedLocationId(locationRef);
      return undefined;
    }

    supabase
      .from("locations")
      .select("id")
      .eq("slug", locationRef)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) console.warn("Failed to resolve location slug for Gingr notes", error);
        setResolvedLocationId(data?.id || "");
      });

    return () => {
      active = false;
    };
  }, [locationRef]);

  useEffect(() => {
    setLiveRefreshAvailable(true);
    setRefreshError("");
    setActiveNoteType(ALL_TAB);
    setExpandedReservations({});
  }, [locationId, selectedDate]);

  const applyComputedItems = useCallback((computedItems = {}, expectedDate = selectedDate, expectedLocationId = locationId) => {
    if (computedItems?.date && expectedDate && computedItems.date !== expectedDate) return;
    if (computedItems?.location_id && expectedLocationId && computedItems.location_id !== expectedLocationId) return;
    const nextEntries = Array.isArray(computedItems?.entries)
      ? computedItems.entries.map((entry) => ({ ...entry, note_text: cleanNoteText(entry.note_text) }))
      : [];
    const nextGroups = Array.isArray(computedItems?.reservation_groups)
      ? computedItems.reservation_groups.map((group) => ({
          ...group,
          notes: Array.isArray(group.notes) ? group.notes.map((note) => ({ ...note, note_text: cleanNoteText(note.note_text) })) : [],
        }))
      : [];
    setEntries(nextEntries);
    setNoteTypes(Array.isArray(computedItems?.note_types) ? computedItems.note_types : []);
    setReservationGroups(nextGroups);
    setReservationSummary(computedItems?.reservation_group_summary || {});
    setDiagnostics(computedItems?.diagnostics || {});
    setRefreshedAt(computedItems?.refreshed_at || "");
  }, [locationId, selectedDate]);

  const loadCached = useCallback(async () => {
    if (!locationId) return;
    const requestKey = `${locationId}|${selectedDate}`;
    const { data } = await supabase
      .from("lite_daily_ops")
      .select("computed_items")
      .eq("location_id", locationId)
      .eq("date", selectedDate)
      .eq("type_sub", "gingr_notes")
      .maybeSingle();
    if (activeSelectionRef.current !== requestKey) return;
    applyComputedItems(data?.computed_items || {}, selectedDate, locationId);
  }, [applyComputedItems, locationId, selectedDate]);

  const refreshLive = useCallback(async () => {
    if (!locationId) {
      setLoading(false);
      return;
    }
    const requestKey = `${locationId}|${selectedDate}`;
    if (refreshInFlightKeyRef.current === requestKey) {
      setLoading(false);
      return;
    }
    refreshInFlightKeyRef.current = requestKey;
    setRefreshing(true);
    setRefreshError("");
    setLiveRefreshAvailable(true);
    try {
      const { data, error } = await supabase.functions.invoke("gingr-today-notes", {
        body: { location_id: locationId, date: selectedDate },
      });
      if (error) throw error;
      if (activeSelectionRef.current !== requestKey) return;
      applyComputedItems(data || { refreshed_at: new Date().toISOString(), date: selectedDate, location_id: locationId }, selectedDate, locationId);
    } catch (error) {
      if (activeSelectionRef.current !== requestKey) return;
      console.error("Failed to refresh Gingr notes", error);
      const message = await describeFunctionError(error);
      setRefreshError(message);
      const unavailable = error?.name === "FunctionsHttpError"
        || /Edge Function/i.test(error?.message || "")
        || /non-2xx/i.test(error?.message || "");
      if (unavailable) {
        setLiveRefreshAvailable(false);
      } else {
        addGlobalToast(message, "error");
      }
    } finally {
      const isCurrentSelection = activeSelectionRef.current === requestKey;
      if (refreshInFlightKeyRef.current === requestKey) refreshInFlightKeyRef.current = "";
      if (isCurrentSelection) {
        setRefreshing(false);
        setLoading(false);
      }
    }
  }, [addGlobalToast, applyComputedItems, liveRefreshAvailable, locationId, selectedDate]);

  const loadFlags = useCallback(async () => {
    if (!locationId) return;
    const { data, error } = await supabase
      .from("lite_daily_ops")
      .select("id, location_id, date, items, updated_at, created_at")
      .eq("location_id", locationId)
      .eq("type_sub", FLAG_TYPE_SUB)
      .order("updated_at", { ascending: false });
    if (error) {
      console.warn("Failed to load Gingr note flags", error);
      return;
    }
    setFlagRows(data || []);
  }, [locationId]);

  useEffect(() => {
    loadFlags();
  }, [loadFlags]);

  useEffect(() => {
    if (!locationId) return undefined;
    const channel = supabase
      .channel(`gingr-note-flags-${locationId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lite_daily_ops", filter: `location_id=eq.${locationId}` },
        (payload) => {
          const row = payload?.new || payload?.old;
          if (row?.type_sub !== FLAG_TYPE_SUB) return;
          setFlagRows((current) => {
            if (payload.eventType === "DELETE") return current.filter((candidate) => candidate.id !== row.id);
            return mergeRowsById([row, ...current]);
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [locationId]);

  useEffect(() => {
    if (!notesRowId) return undefined;
    const channel = supabase
      .channel(`gingr-notes-${notesRowId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lite_daily_ops", filter: `id=eq.${notesRowId}` },
        (payload) => {
          if (payload?.new?.computed_items) applyComputedItems(payload.new.computed_items, selectedDate, locationId);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [applyComputedItems, notesRowId]);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    (async () => {
      await loadCached();
      if (mounted && liveRefreshAvailable) await refreshLive();
      if (mounted && !liveRefreshAvailable) setLoading(false);
    })();
    const interval = liveRefreshAvailable && isToday
      ? window.setInterval(() => {
          refreshLive();
        }, LIVE_POLL_MS)
      : null;
    return () => {
      mounted = false;
      if (interval) window.clearInterval(interval);
    };
  }, [isToday, liveRefreshAvailable, loadCached, refreshLive]);

  const noteTypeTabs = useMemo(() => {
    const seen = new Set();
    const tabs = [];
    for (const noteType of noteTypes || []) {
      const label = String(noteType?.label || noteType?.note_type || "").trim();
      if (!label || seen.has(label)) continue;
      seen.add(label);
      tabs.push(label);
    }
    for (const entry of entries) {
      const label = noteTypeLabel(entry);
      if (!label || seen.has(label)) continue;
      seen.add(label);
      tabs.push(label);
    }
    return tabs;
  }, [entries, noteTypes]);

  const noteTypeCounts = useMemo(() => {
    const counts = new Map();
    for (const entry of entries) {
      const label = noteTypeLabel(entry);
      counts.set(label, (counts.get(label) || 0) + 1);
    }
    return counts;
  }, [entries]);

  useEffect(() => {
    if (activeNoteType === ALL_TAB) return;
    if (!noteTypeTabs.includes(activeNoteType)) setActiveNoteType(ALL_TAB);
  }, [activeNoteType, noteTypeTabs]);

  const visibleEntries = useMemo(() => {
    if (activeNoteType === ALL_TAB) return entries;
    return entries.filter((entry) => noteTypeLabel(entry) === activeNoteType);
  }, [activeNoteType, entries]);

  const activeFlagRows = useMemo(() => flagRows.filter((row) => row?.items?.active !== false && row?.items?.note_id), [flagRows]);
  const flagMap = useMemo(() => {
    const map = new Map();
    for (const row of activeFlagRows) map.set(row.items.note_id, row);
    return map;
  }, [activeFlagRows]);
  const flaggedNotes = useMemo(() => activeFlagRows
    .map((row) => ({ ...(row.items?.note || {}), flag_id: row.id, flagged_at: row.items?.flagged_at, flagged_by: row.items?.flagged_by }))
    .filter((note) => note.id)
    .sort((left, right) => String(right.flagged_at || "").localeCompare(String(left.flagged_at || ""))), [activeFlagRows]);

  const toggleFlag = useCallback(async (entry) => {
    if (!locationId || !entry?.id) return;
    const existing = flagMap.get(entry.id);
    const rowId = existing?.id || flagRowId(locationId, entry.id);
    const now = new Date().toISOString();
    const by = profile?.name || profile?.full_name || profile?.email || "K9 Operations";

    const nextItems = existing
      ? { ...(existing.items || {}), active: false, resolved_at: now, resolved_by: by }
      : {
          active: true,
          note_id: entry.id,
          note: noteSnapshot(entry),
          flagged_at: now,
          flagged_by: by,
        };

    setFlagRows((current) => {
      const optimisticRow = {
        id: rowId,
        location_id: locationId,
        date: entry.note_date || selectedDate,
        items: nextItems,
        updated_at: now,
      };
      return mergeRowsById([optimisticRow, ...current]);
    });

    const payload = existing
      ? { items: nextItems }
      : {
          id: rowId,
          location_id: locationId,
          type: "note_flag",
          type_sub: FLAG_TYPE_SUB,
          date: entry.note_date || selectedDate,
          locked: false,
          items: nextItems,
          computed_items: {},
        };

    const query = existing
      ? supabase.from("lite_daily_ops").update(payload).eq("id", rowId)
      : supabase.from("lite_daily_ops").upsert(payload, { onConflict: "id" });
    const { error } = await query;
    if (error) {
      addGlobalToast(error.message || "Failed to update note flag", "error");
      await loadFlags();
      return;
    }
    addGlobalToast(existing ? "Note unflagged" : "Note flagged", existing ? "info" : "success");
  }, [addGlobalToast, flagMap, loadFlags, locationId, profile, selectedDate]);

  const primaryCounts = {
    daily: entries.length,
    boarding: reservationGroups.length,
    flagged: activeFlagRows.length,
  };

  const activeMetric = viewMode === "boarding"
    ? `${reservationGroups.length} with notes`
    : viewMode === "flagged"
      ? `${activeFlagRows.length} flagged`
      : `${visibleEntries.length} notes`;

  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", paddingBottom: 28 }}>
      <button
        onClick={() => nav && nav("home")}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: 13,
          fontWeight: 700,
          color: C.pri,
          padding: "0 0 12px",
          fontFamily: "inherit",
        }}
      >
        Home
      </button>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: C.text }}>{isToday ? "Today's Notes" : "Gingr Notes"}</h1>
          <p style={{ margin: "5px 0 0", fontSize: 13, color: C.textMut, lineHeight: 1.45 }}>
            {viewMode === "flagged"
              ? "Flagged owner and dog notes that still need follow-up."
              : `${fmtDate(selectedDate)} - ${liveRefreshAvailable ? "syncing owner and dog note history from Gingr." : "showing cached notes while live sync needs attention."}`}
          </p>
          {refreshedAt && viewMode !== "flagged" ? (
            <div style={{ fontSize: 11, color: C.textMut, marginTop: 7 }}>Last refreshed {formatTimestamp(refreshedAt)}</div>
          ) : null}
          {refreshError && viewMode !== "flagged" ? (
            <div style={{ fontSize: 11, color: C.dan, marginTop: 7, maxWidth: 620, lineHeight: 1.45 }}>{refreshError}</div>
          ) : null}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
          {viewMode !== "flagged" ? <DateNavigator value={selectedDate} onChange={setSelectedDate} today={today} /> : null}
          {viewMode !== "flagged" ? (
            <>
              <button type="button" onClick={loadCached} style={{ border: `1.5px solid ${C.border}`, background: C.surface, color: C.textSec, borderRadius: 10, padding: "8px 12px", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>Cached</button>
              <button type="button" onClick={refreshLive} disabled={refreshing} style={{ border: "none", background: liveRefreshAvailable ? C.pri : C.warn, color: "#fff", borderRadius: 10, padding: "9px 14px", fontSize: 12, fontWeight: 900, cursor: refreshing ? "default" : "pointer", opacity: refreshing ? 0.65 : 1, fontFamily: "inherit" }}>
                {refreshing ? "Refreshing" : liveRefreshAvailable ? "Refresh Now" : "Retry Live"}
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {VIEWS.map((view) => (
            <TabButton key={view.key} active={viewMode === view.key} onClick={() => setViewMode(view.key)} count={primaryCounts[view.key]}>
              {view.label}
            </TabButton>
          ))}
        </div>
        <Card style={{ padding: "10px 14px", minWidth: 128 }}>
          <div style={{ fontSize: 10, fontWeight: 900, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.08em" }}>Total</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: C.pri, marginTop: 2 }}>{activeMetric}</div>
        </Card>
      </div>

      {viewMode === "daily" ? (
        <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "0 0 12px", marginBottom: 4 }}>
          <TabButton active={activeNoteType === ALL_TAB} onClick={() => setActiveNoteType(ALL_TAB)} count={entries.length}>All</TabButton>
          {noteTypeTabs.map((label) => (
            <TabButton key={label} active={activeNoteType === label} onClick={() => setActiveNoteType(label)} count={noteTypeCounts.get(label) || 0}>{label}</TabButton>
          ))}
        </div>
      ) : null}

      {loading && viewMode !== "flagged" ? (
        <Card style={{ padding: 32, textAlign: "center", color: C.textMut }}>Loading Gingr notes...</Card>
      ) : viewMode === "daily" ? (
        <NotesList
          entries={visibleEntries}
          flagMap={flagMap}
          onToggleFlag={toggleFlag}
          emptyTitle={entries.length === 0 ? "No notes found for this date" : "No notes in this type"}
          emptySubtitle={entries.length === 0
            ? `The sync checked ${diagnostics.active_reservation_count || 0} reservation context${diagnostics.active_reservation_count === 1 ? "" : "s"} for this date. Use ${liveRefreshAvailable ? "Refresh Now" : "Retry Live"} to re-check Gingr.`
            : "Switch to All or another note type tab."}
        />
      ) : viewMode === "boarding" ? (
        <BoardingView
          groups={reservationGroups}
          summary={reservationSummary}
          expandedMap={expandedReservations}
          setExpandedMap={setExpandedReservations}
          flagMap={flagMap}
          onToggleFlag={toggleFlag}
        />
      ) : (
        <NotesList
          entries={flaggedNotes}
          flagMap={flagMap}
          onToggleFlag={toggleFlag}
          emptyTitle="No flagged notes"
          emptySubtitle="Flag an owner or dog note when it needs follow-up. It will stay here until someone unflags it."
        />
      )}
    </div>
  );
}
