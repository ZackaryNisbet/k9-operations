// K9 Operations - Feeding and Medication Reports
// Renders canonical Supabase-computed care workflows for web users.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabaseClient";
import { C, todayStr } from "../../shared/theme";
import { Card } from "../../shared/ui";
import K9LoadingAnimation from "../../shared/K9LoadingAnimation";

const SESSIONS = [
  { id: "am", label: "AM" },
  { id: "midday", label: "Midday" },
  { id: "pm", label: "PM" },
];

const STATUS_FILTERS = [
  { id: "all", label: "All" },
  { id: "checked_in", label: "Checked In" },
  { id: "checked_out", label: "Checked Out" },
  { id: "pending", label: "Not Checked In" },
];

const OUTCOMES = [
  { id: "all", label: "All" },
  { id: "most", label: "Most" },
  { id: "some", label: "Some" },
  { id: "none", label: "None" },
];

function typeSubFor(kind, session) {
  if (kind === "feeding-meds") return `feeding_meds_${session}`;
  if (kind === "feeding-report") return session === "am" ? "feeding_report" : `feeding_report_${session}`;
  return session === "am" ? "medication_report" : `medication_report_${session}`;
}

function entryIdFor(kind, session, date) {
  return `ops_${typeSubFor(kind, session)}_${date}`;
}

function titleFor(kind, session) {
  const sessionLabel = SESSIONS.find((item) => item.id === session)?.label || "AM";
  if (kind === "feeding-meds") return `${sessionLabel} Feeding and Meds`;
  if (kind === "feeding-report") return `${sessionLabel} Feeding Report`;
  return `${sessionLabel} Medication Report`;
}

function dateLabel(dateStr) {
  const date = new Date(`${dateStr}T12:00:00`);
  return date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" });
}

function timeLabel(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

function buildSummary(rows) {
  return rows.reduce((acc, row) => {
    acc.total += 1;
    if ((row.feedingItems || []).length) acc.feeding += 1;
    acc.meds += (row.medicationItems || []).length;
    const kinds = new Set((row.feedingItems || []).map((item) => item.foodKind));
    if (kinds.has("food_from_home")) acc.ffh += 1;
    if (kinds.has("house_food_chicken")) acc.chicken += 1;
    if (kinds.has("house_food_salmon")) acc.salmon += 1;
    return acc;
  }, { total: 0, feeding: 0, meds: 0, ffh: 0, chicken: 0, salmon: 0 });
}

function isCompleted(state) {
  return !!(state?.completedAt || state?.outcome || state?.decision || state?.checkOutAt);
}

function summarizeComputed(computedItems, items) {
  const rows = Array.isArray(computedItems?.rows) ? computedItems.rows : [];
  const completed = rows.filter((row) => isCompleted(items?.[row.id])).length;
  return {
    ...(computedItems || {}),
    rows,
    dogs: rows,
    summary: {
      ...(computedItems?.summary || {}),
      total: rows.length,
      completed,
    },
  };
}

function PillButton({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: `1.5px solid ${active ? C.pri : C.border}`,
        background: active ? C.pri : C.surface,
        color: active ? "#fff" : C.text,
        borderRadius: 999,
        padding: "7px 12px",
        fontSize: 12,
        fontWeight: 800,
        cursor: "pointer",
        transition: "all 0.16s ease",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

function InstructionBlock({ title, items, tone }) {
  if (!items?.length) return null;
  const accent = tone === "meds" ? "#7C3AED" : "#059669";
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.08em", color: C.textMut, textTransform: "uppercase" }}>{title}</div>
      {items.map((item) => (
        <div key={item.id} style={{ border: `1px solid ${C.border}`, background: C.bg, borderRadius: 10, padding: "10px 12px" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{item.summary}</div>
          <div style={{ fontSize: 12, color: C.textSec, marginTop: 2 }}>{item.detail}</div>
          {item.schedule ? <div style={{ fontSize: 11, fontWeight: 800, color: accent, marginTop: 5 }}>{item.schedule}</div> : null}
          {item.notes ? <div style={{ fontSize: 12, color: "#B45309", marginTop: 5, whiteSpace: "pre-wrap" }}>{item.notes}</div> : null}
        </div>
      ))}
    </div>
  );
}

function rowStatusLabel(row) {
  if (row.statusBucket === "checked_in") return "Checked in";
  if (row.statusBucket === "checked_out") return "Checked out";
  return "Not checked in";
}

function CareReportsPage({ kind = "feeding-report", initialSession = "am", profile, currentLocation, nav }) {
  const locationId = currentLocation || profile?.location_id;
  const actorName = profile?.name || profile?.full_name || profile?.email || "Staff";
  const [session, setSession] = useState(initialSession);
  const [viewDate, setViewDate] = useState(todayStr());
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [entry, setEntry] = useState(null);
  const [expanded, setExpanded] = useState({});
  const [notes, setNotes] = useState({});

  const typeSub = useMemo(() => typeSubFor(kind, session), [kind, session]);
  const entryId = useMemo(() => entryIdFor(kind, session, viewDate), [kind, session, viewDate]);

  const loadEntry = useCallback(async ({ forceCompute = false } = {}) => {
    if (!locationId) return;
    setLoading(true);
    setRefreshing(forceCompute);
    try {
      if (forceCompute) {
        await supabase.functions.invoke("ops-compute-ondemand", { body: { location_id: locationId, date: viewDate } });
      }
      let { data } = await supabase
        .from("lite_daily_ops")
        .select("id, items, computed_items, computed_at, updated_at")
        .eq("id", entryId)
        .eq("location_id", locationId)
        .maybeSingle();
      if (!data) {
        await supabase.functions.invoke("ops-compute-ondemand", { body: { location_id: locationId, date: viewDate } });
        const retry = await supabase
          .from("lite_daily_ops")
          .select("id, items, computed_items, computed_at, updated_at")
          .eq("id", entryId)
          .eq("location_id", locationId)
          .maybeSingle();
        data = retry.data;
      }
      const next = data || { id: entryId, items: {}, computed_items: { rows: [], summary: { total: 0 } } };
      setEntry(next);
      setNotes(Object.fromEntries(Object.entries(next.items || {}).map(([key, value]) => [key, value?.note || ""])));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [entryId, locationId, viewDate]);

  useEffect(() => {
    setLoading(true);
    loadEntry();
  }, [loadEntry]);

  useEffect(() => {
    if (!locationId) return undefined;
    const channel = supabase
      .channel(`care-report-${locationId}-${entryId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "lite_daily_ops", filter: `id=eq.${entryId}` }, () => loadEntry())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [entryId, loadEntry, locationId]);

  const items = entry?.items || {};
  const computedItems = summarizeComputed(entry?.computed_items || {}, items);
  const rows = (computedItems.rows || []).filter((row) => statusFilter === "all" || row.statusBucket === statusFilter);
  const summary = buildSummary(rows);
  const completed = rows.filter((row) => isCompleted(items[row.id])).length;
  const pct = rows.length ? Math.round((completed / rows.length) * 100) : 0;

  const persist = async (nextItems) => {
    const summarized = summarizeComputed(computedItems, nextItems);
    const { error } = await supabase.from("lite_daily_ops").upsert({
      id: entryId,
      location_id: locationId,
      type: "workflow",
      type_sub: typeSub,
      date: viewDate,
      locked: false,
      items: nextItems,
      computed_items: summarized,
    }, { onConflict: "id" });
    if (!error) setEntry((prev) => ({ ...(prev || {}), id: entryId, items: nextItems, computed_items: summarized }));
  };

  const markComplete = async (row, outcome) => {
    setSavingId(row.id);
    const now = new Date().toISOString();
    const nextItems = {
      ...items,
      [row.id]: {
        ...(items[row.id] || {}),
        ...(outcome ? { outcome } : {}),
        completedAt: now,
        completedBy: actorName,
        note: notes[row.id] || "",
      },
    };
    await persist(nextItems);
    setSavingId(null);
  };

  const clearRow = async (row) => {
    setSavingId(row.id);
    const nextItems = { ...items };
    delete nextItems[row.id];
    await persist(nextItems);
    setSavingId(null);
  };

  return (
    <div>
      <Card style={{ padding: 18, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <button type="button" onClick={() => nav?.("role-page")} style={{ border: 0, background: "transparent", color: C.textMut, cursor: "pointer", padding: 0, fontSize: 12, fontWeight: 800 }}>Back to My Work</button>
            <h2 style={{ margin: "6px 0 4px", fontSize: 24, fontWeight: 900, color: C.text, letterSpacing: "-0.02em" }}>{titleFor(kind, session)}</h2>
            <div style={{ fontSize: 13, color: C.textMut }}>{dateLabel(viewDate)} - {completed}/{rows.length} complete</div>
          </div>
          <button
            type="button"
            onClick={() => loadEntry({ forceCompute: true })}
            disabled={refreshing}
            style={{
              border: `1.5px solid ${C.border}`,
              background: C.surface,
              borderRadius: 10,
              padding: "9px 14px",
              cursor: refreshing ? "default" : "pointer",
              fontSize: 12,
              fontWeight: 900,
              color: C.text,
              opacity: refreshing ? 0.6 : 1,
            }}
          >
            {refreshing ? "Refreshing..." : "Refresh from GINGR"}
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setViewDate((prev) => {
              const next = new Date(`${prev}T12:00:00`);
              next.setDate(next.getDate() - 1);
              return next.toISOString().slice(0, 10);
            })}
            style={{ border: `1.5px solid ${C.border}`, background: C.surface, borderRadius: 10, padding: "8px 12px", cursor: "pointer", fontWeight: 900, color: C.text }}
          >
            Previous Day
          </button>
          <button
            type="button"
            onClick={() => setViewDate(todayStr())}
            style={{ border: `1.5px solid ${C.border}`, background: C.surface, borderRadius: 10, padding: "8px 12px", cursor: "pointer", fontWeight: 900, color: C.text }}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setViewDate((prev) => {
              const next = new Date(`${prev}T12:00:00`);
              next.setDate(next.getDate() + 1);
              return next.toISOString().slice(0, 10);
            })}
            style={{ border: `1.5px solid ${C.border}`, background: C.surface, borderRadius: 10, padding: "8px 12px", cursor: "pointer", fontWeight: 900, color: C.text }}
          >
            Next Day
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 16, overflowX: "auto", paddingBottom: 2 }}>
          {SESSIONS.map((item) => <PillButton key={item.id} active={session === item.id} onClick={() => setSession(item.id)}>{item.label}</PillButton>)}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10, overflowX: "auto", paddingBottom: 2 }}>
          {STATUS_FILTERS.map((item) => <PillButton key={item.id} active={statusFilter === item.id} onClick={() => setStatusFilter(item.id)}>{item.label}</PillButton>)}
        </div>

        <div style={{ marginTop: 16, height: 8, borderRadius: 999, background: C.borderLight, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: pct === 100 ? "#10B981" : "#F59E0B", transition: "width 0.25s ease" }} />
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 16 }}>
        {[
          ["Dogs", summary.total],
          ["Food From Home", summary.ffh],
          ["House Chicken", summary.chicken],
          ["House Salmon", summary.salmon],
          ["Medications", summary.meds],
        ].map(([label, value]) => (
          <Card key={label} style={{ padding: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: "0.06em", color: C.textMut, textTransform: "uppercase" }}>{label}</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: C.text, marginTop: 4 }}>{value}</div>
          </Card>
        ))}
      </div>

      {loading ? (
        <Card style={{ padding: 42, textAlign: "center" }}>
          <K9LoadingAnimation size={62} message={`Loading ${titleFor(kind, session).toLowerCase()}...`} subMessage="Reading canonical Supabase report data" />
        </Card>
      ) : rows.length === 0 ? (
        <Card style={{ padding: 34, textAlign: "center", color: C.textMut, fontWeight: 700 }}>
          No dogs match this date, meal window, and checked-status filter.
        </Card>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {rows.map((row) => {
            const state = items[row.id] || {};
            const done = isCompleted(state);
            const open = !!expanded[row.id];
            return (
              <Card key={row.id} style={{ padding: 0, overflow: "hidden", borderColor: done ? "#86EFAC" : C.border }}>
                <button
                  type="button"
                  onClick={() => setExpanded((prev) => ({ ...prev, [row.id]: !prev[row.id] }))}
                  style={{
                    width: "100%",
                    border: 0,
                    background: done ? "#F0FDF4" : C.surface,
                    padding: "14px 16px",
                    display: "grid",
                    gridTemplateColumns: "minmax(160px, 1.2fr) 100px 1fr auto",
                    gap: 12,
                    alignItems: "center",
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 15, fontWeight: 900, color: C.text }}>{row.dogName} {row.ownerInitial}</span>
                      {row.hasPrivatePlay ? <span style={{ fontSize: 10, fontWeight: 900, padding: "2px 7px", borderRadius: 999, background: "#FEE2E2", color: "#B91C1C" }}>PP</span> : null}
                    </div>
                    <div style={{ fontSize: 12, color: C.textMut, marginTop: 2 }}>{row.ownerName || "-"} - {row.reservationType || "-"}</div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 900, color: C.pri }}>{row.roomLabel || "-"}</div>
                  <div style={{ minWidth: 0, fontSize: 12, color: C.textSec, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {[...(row.feedingItems || []), ...(row.medicationItems || [])].slice(0, 2).map((item) => item.summary).join(" - ") || rowStatusLabel(row)}
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {done ? <span style={{ color: "#059669", fontSize: 12, fontWeight: 900 }}>{state.outcome ? state.outcome.toUpperCase() : "DONE"}</span> : null}
                    <span style={{ color: C.textMut, fontSize: 16 }}>{open ? "^" : "v"}</span>
                  </div>
                </button>

                {open ? (
                  <div style={{ padding: "14px 16px 16px", borderTop: `1px solid ${C.borderLight}`, display: "grid", gap: 14 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8, fontSize: 12, color: C.textSec }}>
                      <div><strong style={{ color: C.text }}>Status:</strong> {rowStatusLabel(row)}</div>
                      <div><strong style={{ color: C.text }}>Stay:</strong> {row.reservationDates}</div>
                      <div><strong style={{ color: C.text }}>Drop / Pick:</strong> {row.dropoffTime} / {row.pickupTime}</div>
                      {row.breed ? <div><strong style={{ color: C.text }}>Breed:</strong> {row.breed}</div> : null}
                    </div>
                    <InstructionBlock title="Feeding" items={row.feedingItems || []} tone="feeding" />
                    <InstructionBlock title="Medications" items={row.medicationItems || []} tone="meds" />
                    <textarea
                      value={notes[row.id] || ""}
                      onChange={(event) => setNotes((prev) => ({ ...prev, [row.id]: event.target.value }))}
                      placeholder="Optional notes"
                      rows={2}
                      style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 10, padding: 10, fontFamily: "inherit", fontSize: 13, resize: "vertical" }}
                    />
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "space-between" }}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {kind === "feeding-report" ? OUTCOMES.map((option) => (
                          <PillButton key={option.id} active={state.outcome === option.id} onClick={() => markComplete(row, option.id)}>{option.label}</PillButton>
                        )) : (
                          <PillButton active={done} onClick={() => markComplete(row)}>{done ? "Completed" : "Mark Complete"}</PillButton>
                        )}
                      </div>
                      {done ? <button type="button" onClick={() => clearRow(row)} disabled={savingId === row.id} style={{ border: 0, background: "transparent", color: C.textMut, fontWeight: 800, cursor: "pointer" }}>Clear</button> : null}
                    </div>
                    {done ? <div style={{ fontSize: 11, color: C.textMut }}>{state.completedBy || actorName} - {timeLabel(state.completedAt)}</div> : null}
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default CareReportsPage;
