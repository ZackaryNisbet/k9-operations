import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabaseClient";
import { C, fmtDate, todayStr } from "../../shared/theme";
import { Badge, Btn, Card } from "../../shared/ui";

function EmptyState({ title, subtitle }) {
  return (
    <Card style={{ padding: 36, textAlign: "center", color: C.textMut }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 6 }}>{title}</div>
      {subtitle ? <div style={{ fontSize: 13 }}>{subtitle}</div> : null}
    </Card>
  );
}

export default function CheckoutNotesPage({ nav, profile, addGlobalToast = () => {} }) {
  const locationId = profile?.location_id || "";
  const today = todayStr();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [entries, setEntries] = useState([]);
  const [refreshedAt, setRefreshedAt] = useState("");

  const summary = useMemo(() => {
    const ownerNotes = entries.filter((entry) => entry.note_source === "owner_note").length;
    const dogNotes = entries.filter((entry) => entry.note_source === "dog_note").length;
    return {
      total: entries.length,
      ownerNotes,
      dogNotes,
    };
  }, [entries]);

  const loadCached = useCallback(async () => {
    if (!locationId) return;
    const { data } = await supabase
      .from("lite_daily_ops")
      .select("computed_items")
      .eq("id", `ops_gingr_notes_${today}`)
      .maybeSingle();
    const cachedEntries = Array.isArray(data?.computed_items?.entries) ? data.computed_items.entries : [];
    setEntries(cachedEntries);
    setRefreshedAt(data?.computed_items?.refreshed_at || "");
  }, [locationId, today]);

  const refreshLive = useCallback(async () => {
    if (!locationId) {
      setLoading(false);
      return;
    }
    setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke("gingr-today-notes", {
        body: { location_id: locationId, date: today },
      });
      if (error) throw error;
      const nextEntries = Array.isArray(data?.entries) ? data.entries : [];
      setEntries(nextEntries);
      setRefreshedAt(data?.refreshed_at || new Date().toISOString());
    } catch (error) {
      console.error("Failed to refresh Gingr notes", error);
      addGlobalToast(error.message || "Failed to refresh Gingr notes", "error");
    }
    setRefreshing(false);
    setLoading(false);
  }, [addGlobalToast, locationId, today]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      await loadCached();
      if (mounted) await refreshLive();
    })();
    const interval = window.setInterval(() => {
      refreshLive();
    }, 60000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [loadCached, refreshLive]);

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
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: C.text }}>Today's Gingr Notes</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: C.textMut }}>
            {fmtDate(today)} · polling Gingr every 60 seconds for owner and dog notes.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="secondary" onClick={loadCached}>Load Cached</Btn>
          <Btn variant="primary" onClick={refreshLive} disabled={refreshing}>{refreshing ? "Refreshing…" : "Refresh Now"}</Btn>
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
        <EmptyState title="No Gingr notes detected today" subtitle="This page only surfaces owner and dog notes returned by Gingr for today's live reservation set." />
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
                  </div>
                  <div style={{ fontSize: 12, color: C.textMut, marginTop: 4 }}>
                    {entry.dog_name ? `Dog: ${entry.dog_name}` : null}
                    {entry.owner_name ? `${entry.dog_name ? " · " : ""}Owner: ${entry.owner_name}` : null}
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
