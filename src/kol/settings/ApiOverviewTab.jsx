// K9 Operations — API Overview Settings Tab
// Shows all Gingr API call types, frequencies, projected daily calls, time windows, and thresholds.

import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../../supabaseClient";
import { C } from "../../shared/theme";
import { Card } from "../../shared/ui";
import K9LoadingAnimation from "../../shared/K9LoadingAnimation";
import { useAuth } from "../../AuthProvider";
import { REFRESH_DEFAULTS, REFRESH_SETTING_KEY } from "../../hooks/useRefreshSettings";
import { TV_POLL_DEFAULTS, TV_POLL_SETTING_KEY } from "../../hooks/useBackOfHouse";

// ── Gingr entity definitions ──
const ENTITY_TYPES = [
  { key: "owners",            label: "Owners",            batchSize: 500, desc: "Client / pet-parent records" },
  { key: "animals",           label: "Animals",           batchSize: 500, desc: "Dog profiles linked to owners" },
  { key: "reservations",      label: "Reservations",      batchSize: null, desc: "Boarding, daycare, and grooming bookings (30-day chunks)" },
  { key: "reservation_types", label: "Reservation Types", batchSize: null, desc: "Service type definitions (boarding, daycare, etc.)" },
  { key: "immunization_types",label: "Immunization Types", batchSize: null, desc: "Vaccine / health requirement definitions" },
];

// ── Sync type definitions ──
const SYNC_TYPES = [
  {
    key: "incremental",
    label: "Incremental Sync",
    entities: ["owners", "animals", "reservations"],
    desc: "Pulls recent changes (last 90 days for reservations). Triggered by dashboard refresh interval.",
    frequency: "configurable",
  },
  {
    key: "full",
    label: "Full Sync",
    entities: ["owners", "animals", "reservations", "reservation_types", "immunization_types"],
    desc: "Complete data pull across all entities. Reservations use resumable 30-day backfill chunks.",
    frequency: "manual",
  },
  {
    key: "tv-poll",
    label: "TV Live Poll (back_of_house)",
    entities: ["back_of_house"],
    desc: "Client-side direct poll to Gingr's Digital Whiteboard API. Returns checking_in/checking_out with real room assignments. Used by the Checkout TV.",
    frequency: "configurable",
  },
  {
    key: "test",
    label: "Connection Test",
    entities: ["locations"],
    desc: "Validates API credentials by fetching location list. No data is stored.",
    frequency: "on demand",
  },
];

// ── Post-sync RPCs ──
const POST_SYNC_RPCS = [
  { name: "get_client_stats", desc: "Recomputes per-client metrics (reservations, spend, dogs)" },
  { name: "compute_dashboard_metrics", desc: "Refreshes pre-aggregated dashboard KPIs" },
];

function ApiOverviewTab() {
  const { profile } = useAuth();
  const [syncState, setSyncState] = useState([]);
  const [refreshSettings, setRefreshSettings] = useState(REFRESH_DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const locationId = profile?.location_id || "cherry-hill";
    Promise.all([
      supabase.from("gingr_sync_state").select("*").eq("location_id", locationId),
      supabase.from("lite_settings").select("setting_value").eq("location_id", locationId).eq("setting_key", REFRESH_SETTING_KEY),
    ]).then(([syncRes, settingsRes]) => {
      if (syncRes.data) setSyncState(syncRes.data);
      if (settingsRes.data?.[0]?.setting_value) {
        setRefreshSettings(prev => ({ ...prev, ...settingsRes.data[0].setting_value }));
      }
      setLoaded(true);
    });
  }, [profile?.location_id]);

  // ── Projected daily calls calculation ──
  const interval = refreshSettings.refreshIntervalMinutes || 15;
  const bhEnabled = refreshSettings.businessHoursEnabled;
  const bhStart = refreshSettings.businessHoursStart || "07:00";
  const bhEnd = refreshSettings.businessHoursEnd || "19:00";

  const [startH, startM] = bhStart.split(":").map(Number);
  const [endH, endM] = bhEnd.split(":").map(Number);
  const bhMinutes = bhEnabled ? (endH * 60 + endM) - (startH * 60 + startM) : 24 * 60;
  const pollsPerDay = Math.floor(bhMinutes / interval);

  // Each incremental sync = 3 entity calls (owners, animals, reservations) + 2 RPCs
  const apiCallsPerSync = 3;
  const rpcsPerSync = 2;
  const totalGingrCallsPerDay = pollsPerDay * apiCallsPerSync;
  const totalRpcsPerDay = pollsPerDay * rpcsPerSync;

  // TV poll: configurable interval (default 10s), during business hours
  const [tvConfig, setTvConfig] = useState(TV_POLL_DEFAULTS);
  useEffect(() => {
    const locationId = profile?.location_id || "cherry-hill";
    supabase.from("lite_settings").select("setting_value").eq("location_id", locationId).eq("setting_key", TV_POLL_SETTING_KEY).maybeSingle()
      .then(({ data: row }) => { if (row?.setting_value) setTvConfig(prev => ({ ...prev, ...row.setting_value })); });
  }, [profile?.location_id]);
  const tvInterval = tvConfig.pollIntervalSeconds || 10;
  const tvBhEnabled = tvConfig.businessHoursEnabled;
  const [tvStartH, tvStartM] = (tvConfig.businessHoursStart || "06:30").split(":").map(Number);
  const [tvEndH, tvEndM] = (tvConfig.businessHoursEnd || "19:30").split(":").map(Number);
  const tvBhMinutes = tvBhEnabled ? (tvEndH * 60 + tvEndM) - (tvStartH * 60 + tvStartM) : 24 * 60;
  const tvPollsPerDay = Math.floor(tvBhMinutes * 60 / tvInterval);

  if (!loaded) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <K9LoadingAnimation size={48} message="Loading API overview..." />
      </div>
    );
  }

  const syncMap = {};
  syncState.forEach(s => { syncMap[s.entity_type] = s; });

  const fmtTime = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  };

  const statusColor = (status) => {
    if (status === "synced") return C.suc;
    if (status === "error") return C.dan;
    if (status === "syncing") return C.info;
    return C.textMut;
  };

  return (
    <div>
      <h3 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: C.text }}>
        API Overview
      </h3>
      <p style={{ margin: "0 0 24px", fontSize: 13, color: C.textSec, lineHeight: 1.5 }}>
        All Gingr API call types, their frequencies, and projected daily usage based on your current refresh settings.
      </p>

      {/* ── Projected Daily Usage ── */}
      <Card style={{ padding: "20px 24px", marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 16 }}>
          Projected Daily Usage
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 14 }}>
          {[
            { label: "Refresh Interval", value: `${interval} min` },
            { label: "Business Hours", value: bhEnabled ? `${bhStart} – ${bhEnd}` : "24/7 (off)" },
            { label: "Syncs / Day", value: pollsPerDay.toLocaleString() },
            { label: "Gingr API Calls / Day", value: totalGingrCallsPerDay.toLocaleString(), accent: true },
            { label: "Post-Sync RPCs / Day", value: totalRpcsPerDay.toLocaleString() },
            { label: "TV Poll Calls / Day", value: tvPollsPerDay.toLocaleString() },
          ].map(item => (
            <div key={item.label} style={{ padding: "14px 16px", background: C.bg, borderRadius: 10, border: `1px solid ${C.borderLight}` }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.textMut, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.03em" }}>
                {item.label}
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: item.accent ? C.pri : C.text }}>
                {item.value}
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12, fontSize: 11, color: C.textMut, lineHeight: 1.5 }}>
          Projections based on current refresh interval ({interval}m) and business hours settings.
          Adjust these in <span style={{ fontWeight: 600 }}>Dashboard Refresh</span> settings.
        </div>
      </Card>

      {/* ── Sync Types ── */}
      <Card style={{ padding: "20px 24px", marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 16 }}>
          Sync Types
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {SYNC_TYPES.map(st => (
            <div key={st.key} style={{ padding: "14px 18px", background: C.bg, borderRadius: 10, border: `1px solid ${C.borderLight}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{st.label}</div>
                <div style={{
                  fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 6,
                  background: st.key === "incremental" ? C.priLt : st.key === "tv-poll" ? C.infoLt : C.bg,
                  color: st.key === "incremental" ? C.pri : st.key === "tv-poll" ? C.info : C.textSec,
                  border: `1px solid ${st.key === "incremental" ? C.pri + "30" : st.key === "tv-poll" ? C.info + "30" : C.borderLight}`,
                }}>
                  {st.key === "incremental" ? `Every ${interval} min` : st.key === "tv-poll" ? `Every ${tvInterval}s` : st.frequency}
                </div>
              </div>
              <div style={{ fontSize: 12, color: C.textSec, marginBottom: 8, lineHeight: 1.5 }}>{st.desc}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {st.entities.map(e => (
                  <span key={e} style={{
                    fontSize: 11, padding: "2px 8px", borderRadius: 5,
                    background: C.surface, border: `1px solid ${C.borderLight}`,
                    color: C.textSec, fontWeight: 500,
                  }}>
                    {e}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* ── Entity Types & Sync State ── */}
      <Card style={{ padding: "20px 24px", marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 16 }}>
          Entity Types
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${C.borderLight}` }}>
                {["Entity", "Description", "Batch Size", "Records", "Status", "Last Sync"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "8px 12px", fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.03em" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ENTITY_TYPES.map(et => {
                const s = syncMap[et.key];
                return (
                  <tr key={et.key} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                    <td style={{ padding: "10px 12px", fontWeight: 600, color: C.text }}>{et.label}</td>
                    <td style={{ padding: "10px 12px", color: C.textSec }}>{et.desc}</td>
                    <td style={{ padding: "10px 12px", color: C.textSec }}>{et.batchSize ? `${et.batchSize}/batch` : "—"}</td>
                    <td style={{ padding: "10px 12px", fontWeight: 600, color: C.text }}>
                      {s?.records_synced != null ? s.records_synced.toLocaleString() : "—"}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      {s ? (
                        <span style={{
                          fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 5,
                          background: s.status === "synced" ? C.sucLt : s.status === "error" ? C.danLt : C.infoLt,
                          color: statusColor(s.status),
                        }}>
                          {s.status || "—"}
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, color: C.textMut }}>not synced</span>
                      )}
                    </td>
                    <td style={{ padding: "10px 12px", fontSize: 12, color: C.textSec }}>
                      {fmtTime(s?.last_sync_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {syncState.some(s => s.status === "error") && (
          <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 8, background: C.danLt, fontSize: 12, color: C.dan }}>
            {syncState.filter(s => s.status === "error").map(s => (
              <div key={s.entity_type}>
                <span style={{ fontWeight: 600 }}>{s.entity_type}:</span> {s.error_message}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── Post-Sync Processing ── */}
      <Card style={{ padding: "20px 24px", marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 12 }}>
          Post-Sync Processing
        </div>
        <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.5, marginBottom: 12 }}>
          After each Gingr sync completes, two server-side RPCs run to recompute metrics:
        </div>
        {POST_SYNC_RPCS.map(rpc => (
          <div key={rpc.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0" }}>
            <code style={{
              fontSize: 12, padding: "3px 8px", borderRadius: 5,
              background: C.bg, border: `1px solid ${C.borderLight}`,
              color: C.pri, fontWeight: 600, fontFamily: "monospace",
            }}>
              {rpc.name}
            </code>
            <span style={{ fontSize: 12, color: C.textSec }}>{rpc.desc}</span>
          </div>
        ))}
      </Card>

      {/* ── How It Works ── */}
      <Card style={{ padding: "16px 20px" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 8 }}>
          How Gingr Syncing Works
        </div>
        <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.7 }}>
          <div style={{ paddingLeft: 14 }}>
            <div>1. <span style={{ fontWeight: 600 }}>Incremental sync</span> runs every <span style={{ fontWeight: 700, color: C.pri }}>{interval} minutes</span> during {bhEnabled ? `business hours (${bhStart} – ${bhEnd})` : "all hours (24/7)"}</div>
            <div>2. Pulls owners (500/batch), animals (500/batch), and reservations (last 90 days)</div>
            <div>3. Full sync pulls all historical data using resumable 30-day reservation chunks</div>
            <div>4. Checkout TV polls Gingr's <code style={{ fontSize: 11, color: C.pri }}>back_of_house</code> API directly from the browser every <span style={{ fontWeight: 700, color: C.pri }}>{tvInterval}s</span> — configurable in API Dashboard settings</div>
            <div>5. Post-sync RPCs recompute client stats and dashboard metrics</div>
            <div>6. Ignite email webhooks process leads independently — not affected by business hours</div>
          </div>
        </div>
      </Card>
    </div>
  );
}

export default ApiOverviewTab;
