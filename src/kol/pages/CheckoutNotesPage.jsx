import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../supabaseClient";
import { C, fmtDate, todayStr } from "../../shared/theme";
import { Badge, Btn, Card } from "../../shared/ui";

const LIVE_POLL_MS = 20000;

function EmptyState({ title, subtitle }) {
  return (
    <Card style={{ padding: 36, textAlign: "center", color: C.textMut }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 6 }}>{title}</div>
      {subtitle ? <div style={{ fontSize: 13 }}>{subtitle}</div> : null}
    </Card>
  );
}

function formatNoteTimestamp(entry) {
  const value = entry?.note_created_at || entry?.created_at;
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

export default function CheckoutNotesPage({ nav, profile, addGlobalToast = () => {} }) {
  const locationId = profile?.location_id || "";
  const today = todayStr();
  const [selectedDate, setSelectedDate] = useState(today);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [liveRefreshAvailable, setLiveRefreshAvailable] = useState(true);
  const [entries, setEntries] = useState([]);
  const [refreshedAt, setRefreshedAt] = useState("");
  const refreshInFlightRef = useRef(false);
  const isToday = selectedDate === today;
  const notesRowId = useMemo(() => {
    if (!locationId || !selectedDate) return "";
    return `ops_gingr_notes_${locationId}_${selectedDate}`;
  }, [locationId, selectedDate]);

  const summary = useMemo(() => {
    const ownerNotes = entries.filter((entry) => entry.note_source === "owner_note").length;
    const dogNotes = entries.filter((entry) => entry.note_source === "dog_note").length;
    return {
      total: entries.length,
      ownerNotes,
      dogNotes,
    };
  }, [entries]);

  const applyComputedItems = useCallback((computedItems = {}) => {
    const nextEntries = Array.isArray(computedItems?.entries) ? computedItems.entries : [];
    setEntries(nextEntries);
    setRefreshedAt(computedItems?.refreshed_at || "");
  }, []);

  const loadCached = useCallback(async () => {
    if (!locationId) return;
    const { data } = await supabase
      .from("lite_daily_ops")
      .select("computed_items")
      .eq("location_id", locationId)
      .eq("date", selectedDate)
      .eq("type_sub", "gingr_notes")
      .maybeSingle();
    applyComputedItems(data?.computed_items || {});
  }, [applyComputedItems, locationId, selectedDate]);

  const refreshLive = useCallback(async () => {
    if (!locationId) {
      setLoading(false);
      return;
    }
    if (!liveRefreshAvailable) {
      setLoading(false);
      return;
    }
    if (refreshInFlightRef.current) {
      setLoading(false);
      return;
    }
    refreshInFlightRef.current = true;
    setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke("gingr-today-notes", {
        body: { location_id: locationId, date: selectedDate },
      });
      if (error) throw error;
      applyComputedItems(data || { refreshed_at: new Date().toISOString() });
    } catch (error) {
      console.error("Failed to refresh Gingr notes", error);
      const unavailable = error?.name === "FunctionsHttpError"
        || /Edge Function/i.test(error?.message || "")
        || /non-2xx/i.test(error?.message || "");
      if (unavailable) {
        setLiveRefreshAvailable(false);
      } else {
        addGlobalToast(error.message || "Failed to refresh Gingr notes", "error");
      }
    } finally {
      refreshInFlightRef.current = false;
      setRefreshing(false);
      setLoading(false);
    }
  }, [addGlobalToast, applyComputedItems, liveRefreshAvailable, locationId, selectedDate]);

  useEffect(() => {
    if (!notesRowId) return undefined;
    const channel = supabase
      .channel(`gingr-notes-${notesRowId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lite_daily_ops", filter: `id=eq.${notesRowId}` },
        (payload) => {
          if (payload?.new?.computed_items) applyComputedItems(payload.new.computed_items);
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

  const shiftDate = useCallback((days) => {
    const base = new Date(`${selectedDate}T12:00:00`);
    base.setDate(base.getDate() + days);
    const nextDate = base.toISOString().slice(0, 10);
    if (nextDate <= today) setSelectedDate(nextDate);
  }, [selectedDate, today]);

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", paddingBottom: 28 }}>
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
          fontWeight: 600,
          color: C.pri,
          padding: "0 0 12px",
          fontFamily: "inherit",
        }}
      >
        {"← Home"}
      </button>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 18 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: C.text }}>{isToday ? "Today's Notes" : "Gingr Notes"}</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: C.textMut }}>
            {fmtDate(selectedDate)} · {liveRefreshAvailable ? (isToday ? "watching Gingr for owner and dog notes." : "showing the selected day's owner and dog notes from Gingr/cache.") : "showing cached notes because live sync is unavailable in this environment."}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Btn variant="ghost" onClick={() => shiftDate(-1)}>Previous Day</Btn>
          <input
            type="date"
            value={selectedDate}
            max={today}
            onChange={(event) => setSelectedDate(event.target.value || today)}
            style={{ padding: "9px 12px", borderRadius: 12, border: `1px solid ${C.border}`, fontFamily: "inherit", fontSize: 13, color: C.text }}
          />
          <Btn variant="ghost" onClick={() => shiftDate(1)} disabled={isToday}>Next Day</Btn>
          {!isToday && <Btn variant="secondary" onClick={() => setSelectedDate(today)}>Today</Btn>}
          <Btn variant="secondary" onClick={loadCached}>Load Cached</Btn>
          <Btn variant="primary" onClick={refreshLive} disabled={refreshing || !liveRefreshAvailable}>
            {liveRefreshAvailable ? (refreshing ? "Refreshing…" : "Refresh Now") : "Cached Only"}
          </Btn>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 18 }}>
        <Card style={{ padding: 18 }}>
          <div style={{ fontSize: 12, color: C.textMut, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Total Notes</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: C.pri }}>{summary.total}</div>
        </Card>
        <Card style={{ padding: 18 }}>
          <div style={{ fontSize: 12, color: C.textMut, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Dog Notes</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#2563EB" }}>{summary.dogNotes}</div>
        </Card>
        <Card style={{ padding: 18 }}>
          <div style={{ fontSize: 12, color: C.textMut, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Owner Notes</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#8B5CF6" }}>{summary.ownerNotes}</div>
        </Card>
      </div>

      {refreshedAt ? (
        <div style={{ fontSize: 11, color: C.textMut, marginBottom: 14 }}>
          Last refreshed {new Date(refreshedAt).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
            second: "2-digit",
          })}
        </div>
      ) : null}

      {loading ? (
        <Card style={{ padding: 32, textAlign: "center", color: C.textMut }}>Loading Gingr notes…</Card>
      ) : entries.length === 0 ? (
        <EmptyState title="No Gingr notes returned for this date" subtitle="The selected day returned zero owner or dog notes from the Gingr reservation sync/cache. Use Refresh Now to re-check Gingr or choose another day." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {entries.map((entry) => (
            <Card key={entry.id} style={{ padding: 18 }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 17, fontWeight: 800, color: C.text }}>{entry.subject_name || "Unknown"}</div>
                    <Badge color={entry.note_source === "owner_note" ? "warning" : "primary"}>
                      {entry.note_source === "owner_note" ? "Owner Note" : "Dog Note"}
                    </Badge>
                    {(entry.note_type || entry.note_title) ? (
                      <Badge color="neutral">{entry.note_type || entry.note_title}</Badge>
                    ) : null}
                  </div>
                  <div style={{ fontSize: 12, color: C.textMut, marginTop: 4 }}>
                    {entry.dog_name ? `Dog: ${entry.dog_name}` : null}
                    {entry.owner_name ? `${entry.dog_name ? " · " : ""}Owner: ${entry.owner_name}` : null}
                  </div>
                  <div style={{ fontSize: 12, color: C.textMut, marginTop: 4 }}>
                    {formatNoteTimestamp(entry) || entry.note_date || "Date unavailable"}
                    {entry.created_by_name ? ` · By ${entry.created_by_name}` : ""}
                    {entry.created_by_gingr_id ? ` · Gingr user #${entry.created_by_gingr_id}` : ""}
                  </div>
                </div>
                {entry.reservation_gingr_id ? (
                  <div style={{ fontSize: 11, color: C.textMut }}>Reservation #{entry.reservation_gingr_id}</div>
                ) : null}
              </div>
              <div style={{ fontSize: 13, color: C.text, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>{entry.note_text}</div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
