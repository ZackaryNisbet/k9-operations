// K9 Operations -- API Dashboard Settings Tab
// Server-owned control plane for Gingr API usage and presence sync cadence.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabaseClient";
import { C } from "../../shared/theme";
import { Card } from "../../shared/ui";
import K9LoadingAnimation from "../../shared/K9LoadingAnimation";
import { useAuth } from "../../AuthProvider";
import { REFRESH_DEFAULTS, REFRESH_SETTING_KEY } from "../../hooks/useRefreshSettings";
import {
  PRESENCE_ALLOWED_INTERVAL_SECONDS,
  PRESENCE_SYNC_DEFAULTS,
  PRESENCE_SYNC_SETTING_KEY,
  computePresenceDailyCalls,
  getEffectivePresenceCadence,
  sanitizePresenceSyncConfig,
} from "../../hooks/presenceSyncConfig";

const ENDPOINTS = [
  {
    id: "presence_worker",
    label: "Server Presence Worker",
    method: "POST",
    path: "Supabase cron -> gingr-sync presence-worker",
    params: "location_id, sync_type=presence-worker",
    purpose: "Runs the bounded server loop that reconciles current checked-in state every few seconds and writes canonical presence rows/events.",
    consumer: "Checkout TV, Home, Dashboard",
    category: "live",
    responseSize: "Canonical Supabase snapshot",
  },
  {
    id: "back_of_house",
    label: "Back of House",
    method: "GET",
    path: "/api/v1/back_of_house",
    params: "key, location_id, full_day=true",
    purpose: "Read only by the server presence worker to preserve room/area labels and reconcile live check-in/check-out state.",
    consumer: "Server Presence Sync",
    category: "live",
    responseSize: "~25 KB",
  },
  {
    id: "reservations_checked_in",
    label: "Reservations (Checked In)",
    method: "POST",
    path: "/api/v1/reservations",
    params: "key, checked_in=true",
    purpose: "Read only by the server presence worker to identify the current in-house population and departure transitions.",
    consumer: "Server Presence Sync",
    category: "live",
    responseSize: "~20-50 KB",
  },
  {
    id: "owners",
    label: "Owners",
    method: "GET",
    path: "/api/v1/owners",
    params: "key",
    purpose: "Full client roster with contact info, balance, reservation history, and marketing opt-outs. Paginated in 500-record batches.",
    consumer: "Dashboard Sync",
    category: "sync",
    responseSize: "~200-500 KB",
  },
  {
    id: "animals",
    label: "Animals",
    method: "GET",
    path: "/api/v1/animals",
    params: "key",
    purpose: "Dog profiles linked to owners, including breed, weight, birthday, vaccines, VIP status, grooming notes, and image URLs.",
    consumer: "Dashboard Sync",
    category: "sync",
    responseSize: "~150-400 KB",
  },
  {
    id: "get_breeds",
    label: "Breeds",
    method: "GET",
    path: "/api/v1/get_breeds",
    params: "key",
    purpose: "Breed ID to name lookup table. Fetched alongside animals to resolve breed IDs.",
    consumer: "Dashboard Sync",
    category: "sync",
    responseSize: "~10 KB",
  },
  {
    id: "reservations",
    label: "Reservations (History)",
    method: "POST",
    path: "/api/v1/reservations",
    params: "key, checked_in=false, start_date, end_date",
    purpose: "Historical and upcoming reservations in 30-day chunks for dashboard and operational reporting.",
    consumer: "Dashboard Sync",
    category: "sync",
    responseSize: "~100-800 KB per chunk",
  },
  {
    id: "reservation_types",
    label: "Reservation Types",
    method: "GET",
    path: "/api/v1/reservation_types",
    params: "key",
    purpose: "Service type definitions for boarding, daycare, grooming, and related classification.",
    consumer: "Full Sync",
    category: "reference",
    responseSize: "~5 KB",
  },
  {
    id: "get_immunization_types",
    label: "Immunization Types",
    method: "GET",
    path: "/api/v1/get_immunization_types",
    params: "key, species_id=1",
    purpose: "Required vaccine definitions used for compliance tracking and expiration alerts.",
    consumer: "Full Sync",
    category: "reference",
    responseSize: "~2 KB",
  },
  {
    id: "get_locations",
    label: "Locations (Connection Test)",
    method: "GET",
    path: "/api/v1/get_locations",
    params: "key",
    purpose: "Validates API credentials. Only called when testing the Gingr connection in Settings.",
    consumer: "Settings",
    category: "onDemand",
    responseSize: "~1 KB",
  },
  {
    id: "existing_reservation_estimate",
    label: "Reservation Estimate",
    method: "GET",
    path: "/api/v1/existing_reservation_estimate",
    params: "key, id={reservation_gingr_id}",
    purpose: "Fetches available add-on services for a specific reservation on demand.",
    consumer: "Operations Hub",
    category: "onDemand",
    responseSize: "~5-15 KB",
  },
];

const CATEGORY_LABELS = {
  live: { label: "Server Presence", color: "#22C55E", desc: "Server-owned live reconciliation into canonical Supabase tables" },
  sync: { label: "Dashboard Sync", color: "#2563EB", desc: "Server-side Edge Function sync to Supabase" },
  reference: { label: "Reference Data", color: "#8B5CF6", desc: "Static lookup tables during full syncs" },
  onDemand: { label: "On Demand", color: "#F59E0B", desc: "Called only when a user action triggers it" },
};

function computeDashboardCalls(settings) {
  const start = settings.businessHoursStart || "07:00";
  const end = settings.businessHoursEnd || "19:00";
  const [startH, startM] = start.split(":").map(Number);
  const [endH, endM] = end.split(":").map(Number);
  const minutes = settings.businessHoursEnabled ? Math.max(0, (endH * 60 + endM) - (startH * 60 + startM)) : 24 * 60;
  const intervalMinutes = Math.max(1, Number(settings.refreshIntervalMinutes || 15));
  const syncsPerDay = Math.floor(minutes / intervalMinutes);
  const callsPerSync = 5;
  return { syncsPerDay, callsPerSync, totalCalls: syncsPerDay * callsPerSync };
}

function IntervalPicker({ value, onChange, label }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 800, color: C.textMut, marginBottom: 7, textTransform: "uppercase" }}>{label}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {PRESENCE_ALLOWED_INTERVAL_SECONDS.map((seconds) => (
          <button
            key={seconds}
            type="button"
            onClick={() => onChange(seconds)}
            style={{
              padding: "7px 10px",
              borderRadius: 8,
              border: `1.5px solid ${value === seconds ? C.pri : C.border}`,
              background: value === seconds ? C.priLt : C.bg,
              color: value === seconds ? C.pri : C.textSec,
              fontSize: 12,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            {seconds}s
          </button>
        ))}
      </div>
    </div>
  );
}

function NumberStepper({ value, onChange, min = 1, max = 3600, suffix = "s", step = 1 }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <button type="button" onClick={() => onChange(Math.max(min, value - step))} style={stepperButtonStyle}>-</button>
      <div style={{
        padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.border}`,
        background: C.bg, fontSize: 13, fontWeight: 800, color: C.text,
        minWidth: 54, textAlign: "center", fontVariantNumeric: "tabular-nums",
      }}>
        {value}{suffix}
      </div>
      <button type="button" onClick={() => onChange(Math.min(max, value + step))} style={stepperButtonStyle}>+</button>
    </div>
  );
}

const stepperButtonStyle = {
  width: 28,
  height: 28,
  borderRadius: 6,
  border: `1px solid ${C.border}`,
  background: C.surface,
  color: C.text,
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 800,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

function Toggle({ checked, onChange }) {
  return (
    <label style={{ position: "relative", width: 38, height: 22, cursor: "pointer", display: "inline-block" }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
      <span style={{
        position: "absolute",
        inset: 0,
        borderRadius: 99,
        background: checked ? C.pri : C.border,
        transition: "background 0.2s",
      }}>
        <span style={{
          position: "absolute",
          top: 3,
          left: checked ? 19 : 3,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "#fff",
          transition: "left 0.2s",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        }} />
      </span>
    </label>
  );
}

function TimeInput({ value, onChange, label }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 11, color: C.textMut, fontWeight: 700, minWidth: 36 }}>{label}</span>
      <input
        type="time"
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          padding: "5px 8px",
          borderRadius: 7,
          border: `1px solid ${C.border}`,
          background: C.bg,
          fontSize: 12,
          color: C.text,
          fontFamily: "inherit",
        }}
      />
    </label>
  );
}

function ApiDashboardTab() {
  const { profile } = useAuth();
  const locationId = profile?.location_id || "cherry-hill";
  const [dashRefresh, setDashRefresh] = useState(REFRESH_DEFAULTS);
  const [presenceSync, setPresenceSync] = useState(PRESENCE_SYNC_DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [expandedEndpoint, setExpandedEndpoint] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      supabase.from("lite_settings").select("setting_value").eq("location_id", locationId).eq("setting_key", REFRESH_SETTING_KEY).maybeSingle(),
      supabase.from("lite_settings").select("setting_value").eq("location_id", locationId).eq("setting_key", PRESENCE_SYNC_SETTING_KEY).maybeSingle(),
    ]).then(([dashRes, presenceRes]) => {
      if (cancelled) return;
      if (dashRes.data?.setting_value) setDashRefresh(prev => ({ ...prev, ...dashRes.data.setting_value }));
      setPresenceSync(sanitizePresenceSyncConfig(presenceRes.data?.setting_value));
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [locationId]);

  const save = useCallback(async () => {
    setSaving(true);
    const sanitizedPresence = sanitizePresenceSyncConfig(presenceSync);
    await Promise.all([
      supabase.from("lite_settings").upsert(
        { location_id: locationId, setting_key: REFRESH_SETTING_KEY, setting_value: dashRefresh },
        { onConflict: "location_id,setting_key" },
      ),
      supabase.from("lite_settings").upsert(
        { location_id: locationId, setting_key: PRESENCE_SYNC_SETTING_KEY, setting_value: sanitizedPresence },
        { onConflict: "location_id,setting_key" },
      ),
    ]);
    setPresenceSync(sanitizedPresence);
    setSaving(false);
    setDirty(false);
  }, [locationId, dashRefresh, presenceSync]);

  const updateDash = (key, val) => {
    setDashRefresh(prev => ({ ...prev, [key]: val }));
    setDirty(true);
  };

  const updatePresence = (patch) => {
    setPresenceSync(prev => sanitizePresenceSyncConfig({ ...prev, ...patch }));
    setDirty(true);
  };

  const updatePeakWindow = (index, key, value) => {
    setPresenceSync(prev => {
      const windows = [...(prev.peakWindows || [])];
      windows[index] = { ...(windows[index] || { start: "07:00", end: "09:00" }), [key]: value };
      return sanitizePresenceSyncConfig({ ...prev, peakWindows: windows });
    });
    setDirty(true);
  };

  const projections = useMemo(() => {
    const presence = computePresenceDailyCalls(presenceSync);
    const dash = computeDashboardCalls(dashRefresh);
    return {
      presence,
      dash,
      grandTotal: presence.totalCalls + dash.totalCalls,
    };
  }, [presenceSync, dashRefresh]);
  const effectiveCadence = useMemo(() => getEffectivePresenceCadence(presenceSync), [presenceSync]);

  if (!loaded) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <K9LoadingAnimation size={48} message="Loading API dashboard..." />
      </div>
    );
  }

  return (
    <div>
      <h3 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 800, color: C.text }}>
        API Dashboard
      </h3>
      <p style={{ margin: "0 0 24px", fontSize: 13, color: C.textSec, lineHeight: 1.5 }}>
        Server-side Gingr usage, cadence controls, and projected daily calls. Checkout TV reads canonical Supabase presence; browsers do not initiate live Gingr polling.
      </p>

      {dirty && (
        <div style={{
          position: "sticky", top: 0, zIndex: 10, padding: "10px 16px", marginBottom: 16,
          background: C.priLt, borderRadius: 10, border: `1px solid ${C.pri}30`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.pri }}>Unsaved changes</span>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            style={{
              padding: "6px 18px", borderRadius: 8, border: "none",
              background: C.pri, color: "#fff", fontSize: 13, fontWeight: 800,
              cursor: "pointer", opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      )}

      <Card style={{ padding: "20px 24px", marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: C.text, marginBottom: 16 }}>
          Projected Daily Gingr API Usage
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))", gap: 12 }}>
          {[
            { label: "Presence Calls", value: projections.presence.totalCalls.toLocaleString(), sub: `${effectiveCadence.intervalSeconds}s now, ${effectiveCadence.mode}`, color: "#22C55E" },
            { label: "Peak Calls", value: projections.presence.peakCalls.toLocaleString(), sub: presenceSync.peakEnabled ? `${projections.presence.peakMinutes} peak min/day` : "Peak disabled", color: "#0EA5E9" },
            { label: "Off-Hours Calls", value: projections.presence.offHoursCalls.toLocaleString(), sub: `${presenceSync.offHoursIntervalSeconds}s cadence`, color: "#64748B" },
            { label: "Dashboard Calls", value: projections.dash.totalCalls.toLocaleString(), sub: `${projections.dash.syncsPerDay} syncs x ${projections.dash.callsPerSync}`, color: "#2563EB" },
            { label: "Total / Day", value: projections.grandTotal.toLocaleString(), sub: "Server-side calls", color: C.pri, accent: true },
          ].map(item => (
            <div key={item.label} style={{
              padding: "14px 16px", borderRadius: 10,
              background: item.accent ? C.priLt : C.bg,
              border: `1px solid ${item.accent ? C.pri + "30" : C.borderLight}`,
            }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: C.textMut, marginBottom: 4, textTransform: "uppercase" }}>
                {item.label}
              </div>
              <div style={{ fontSize: 22, fontWeight: 900, color: item.color || C.text, fontVariantNumeric: "tabular-nums" }}>
                {item.value}
              </div>
              <div style={{ fontSize: 10, color: C.textMut, marginTop: 2 }}>{item.sub}</div>
            </div>
          ))}
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)", gap: 16, marginBottom: 24 }}>
        <Card style={{ padding: "18px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22C55E" }} />
              <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>Server Presence Sync</div>
            </div>
            <Toggle checked={presenceSync.enabled} onChange={enabled => updatePresence({ enabled })} />
          </div>
          <div style={{ display: "grid", gap: 16 }}>
            <IntervalPicker label="Normal cadence" value={presenceSync.normalIntervalSeconds} onChange={seconds => updatePresence({ normalIntervalSeconds: seconds })} />
            <IntervalPicker label="Off-hours cadence" value={presenceSync.offHoursIntervalSeconds} onChange={seconds => updatePresence({ offHoursIntervalSeconds: seconds })} />
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: C.textMut, textTransform: "uppercase" }}>Business hours window</div>
                <Toggle checked={presenceSync.businessHoursEnabled} onChange={businessHoursEnabled => updatePresence({ businessHoursEnabled })} />
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <TimeInput label="From" value={presenceSync.businessHoursStart} onChange={businessHoursStart => updatePresence({ businessHoursStart })} />
                <TimeInput label="To" value={presenceSync.businessHoursEnd} onChange={businessHoursEnd => updatePresence({ businessHoursEnd })} />
              </div>
            </div>
            <div style={{ padding: 12, borderRadius: 10, border: `1px solid ${C.borderLight}`, background: C.bg }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: C.text }}>Approved Peak Mode</div>
                  <div style={{ fontSize: 11, color: C.textMut, marginTop: 2 }}>Allows 3s cadence only inside explicit windows.</div>
                </div>
                <Toggle checked={presenceSync.peakEnabled} onChange={peakEnabled => updatePresence({ peakEnabled })} />
              </div>
              <IntervalPicker label="Peak cadence" value={presenceSync.peakIntervalSeconds} onChange={seconds => updatePresence({ peakIntervalSeconds: seconds })} />
              <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                {(presenceSync.peakWindows || []).slice(0, 2).map((window, index) => (
                  <div key={index} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: C.textMut, minWidth: 64 }}>Window {index + 1}</span>
                    <TimeInput label="From" value={window.start} onChange={start => updatePeakWindow(index, "start", start)} />
                    <TimeInput label="To" value={window.end} onChange={end => updatePeakWindow(index, "end", end)} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <Card style={{ padding: "18px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#2563EB" }} />
            <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>Dashboard Sync</div>
          </div>
          <div style={{ display: "grid", gap: 14 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: C.textMut, marginBottom: 6, textTransform: "uppercase" }}>Sync interval</div>
              <NumberStepper
                value={dashRefresh.refreshIntervalMinutes}
                onChange={v => updateDash("refreshIntervalMinutes", v)}
                min={5}
                max={120}
                suffix="m"
                step={5}
              />
              <div style={{ fontSize: 10, color: C.textMut, marginTop: 5 }}>
                {projections.dash.syncsPerDay} syncs/day x {projections.dash.callsPerSync} calls each.
              </div>
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: C.textMut, textTransform: "uppercase" }}>Business hours only</div>
                <Toggle checked={dashRefresh.businessHoursEnabled} onChange={businessHoursEnabled => updateDash("businessHoursEnabled", businessHoursEnabled)} />
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <TimeInput label="From" value={dashRefresh.businessHoursStart} onChange={v => updateDash("businessHoursStart", v)} />
                <TimeInput label="To" value={dashRefresh.businessHoursEnd} onChange={v => updateDash("businessHoursEnd", v)} />
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Card style={{ padding: "20px 24px", marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: C.text, marginBottom: 4 }}>
          Endpoint Catalog
        </div>
        <div style={{ fontSize: 12, color: C.textSec, marginBottom: 16, lineHeight: 1.5 }}>
          Gingr endpoints are called from server functions. Checkout TV, Home, and Dashboard read Supabase results.
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
          {Object.entries(CATEGORY_LABELS).map(([key, cat]) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: C.textSec }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: cat.color }} />
              <span style={{ fontWeight: 700 }}>{cat.label}</span>
              <span style={{ color: C.textMut }}>{cat.desc}</span>
            </div>
          ))}
        </div>
        <div style={{
          display: "grid", gridTemplateColumns: "minmax(200px, 2fr) 64px minmax(140px, 1fr) 130px 105px",
          padding: "8px 14px", borderBottom: `2px solid ${C.borderLight}`,
          fontSize: 10, fontWeight: 800, color: C.textMut, textTransform: "uppercase",
        }}>
          <div>Endpoint</div>
          <div>Method</div>
          <div>Consumer</div>
          <div>Frequency</div>
          <div style={{ textAlign: "right" }}>Calls/Day</div>
        </div>
        {ENDPOINTS.map(ep => {
          const isExpanded = expandedEndpoint === ep.id;
          const cat = CATEGORY_LABELS[ep.category];
          const liveCalls = ep.id === "presence_worker" ? 0 : projections.presence.totalCalls;
          const syncCalls = projections.dash.syncsPerDay;
          const freqLabel = ep.category === "live"
            ? (ep.id === "presence_worker" ? `Loop ${effectiveCadence.intervalSeconds}s` : "By server worker")
            : ep.category === "sync"
              ? `Every ${dashRefresh.refreshIntervalMinutes}m`
              : ep.category === "reference"
                ? "Full sync only"
                : "On demand";
          const callsPerDay = ep.category === "live" ? liveCalls : ep.category === "sync" ? syncCalls : 0;
          return (
            <div key={ep.id}>
              <div
                onClick={() => setExpandedEndpoint(isExpanded ? null : ep.id)}
                style={{
                  display: "grid", gridTemplateColumns: "minmax(200px, 2fr) 64px minmax(140px, 1fr) 130px 105px",
                  padding: "12px 14px", borderBottom: `1px solid ${C.borderLight}`,
                  cursor: "pointer", background: isExpanded ? C.priLt : "transparent",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: cat.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.text, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ep.label}</span>
                </div>
                <div>
                  <span style={{
                    fontSize: 10, fontWeight: 800, padding: "2px 6px", borderRadius: 4,
                    background: ep.method === "POST" ? C.warnLt : C.infoLt,
                    color: ep.method === "POST" ? C.warn : C.info,
                  }}>
                    {ep.method}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: C.textSec, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ep.consumer}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{freqLabel}</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: callsPerDay > 0 ? C.pri : C.textMut, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {callsPerDay > 0 ? callsPerDay.toLocaleString() : "-"}
                </div>
              </div>
              {isExpanded && (
                <div style={{ padding: "14px 20px 16px", background: C.priLt, borderBottom: `1px solid ${C.borderLight}` }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 800, color: C.textMut, textTransform: "uppercase", marginBottom: 4 }}>Purpose</div>
                      <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.5 }}>{ep.purpose}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 800, color: C.textMut, textTransform: "uppercase", marginBottom: 4 }}>Technical</div>
                      <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.6 }}>
                        <div><span style={{ fontWeight: 700, color: C.text }}>Path:</span> <code style={{ fontSize: 11, color: C.pri }}>{ep.path}</code></div>
                        <div><span style={{ fontWeight: 700, color: C.text }}>Params:</span> {ep.params}</div>
                        <div><span style={{ fontWeight: 700, color: C.text }}>Response:</span> {ep.responseSize}</div>
                        <div><span style={{ fontWeight: 700, color: C.text }}>Category:</span> {cat.label}</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </Card>

      <Card style={{ padding: "18px 22px" }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 10 }}>
          Architecture
        </div>
        <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.7 }}>
          <div>1. Supabase cron starts the server presence worker once per minute; the worker loops for the minute with a bounded cadence.</div>
          <div style={{ marginTop: 4 }}>2. The worker claims a per-location lock, reads Gingr, and reconciles `facility_presence_current`, `facility_presence_events`, and `facility_presence_sync_runs`.</div>
          <div style={{ marginTop: 4 }}>3. Checkout TV, Home, and Dashboard read the canonical Supabase snapshot and realtime event ledger only.</div>
          <div style={{ marginTop: 4 }}>4. Cadence settings live under `presence_sync_config_v1`; `tv_poll_config` is no longer the active control plane.</div>
        </div>
      </Card>
    </div>
  );
}

export default ApiDashboardTab;
