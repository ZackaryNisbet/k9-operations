// K9 Operations — API Dashboard Settings Tab
// Comprehensive view of every Gingr API endpoint we call, its purpose,
// frequency (configurable), projected daily calls, and per-endpoint
// business hours scheduling.

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../../supabaseClient";
import { C } from "../../shared/theme";
import { Card } from "../../shared/ui";
import K9LoadingAnimation from "../../shared/K9LoadingAnimation";
import { useAuth } from "../../AuthProvider";
import { REFRESH_DEFAULTS, REFRESH_SETTING_KEY } from "../../hooks/useRefreshSettings";
import { TV_POLL_DEFAULTS, TV_POLL_SETTING_KEY } from "../../hooks/useBackOfHouse";

// ── All Gingr API endpoints we use ──────────────────────────────────────────
const ENDPOINTS = [
  {
    id: "back_of_house",
    label: "Back of House (Digital Whiteboard)",
    method: "GET",
    path: "/api/v1/back_of_house",
    params: "key, location_id, full_day=true",
    purpose: "Checkout TV live display. Returns all dogs checking in/out today with real room assignments, breed, owner name, and check-in status.",
    consumer: "Checkout TV",
    category: "live",
    configKey: "tvPoll",
    responseSize: "~25 KB",
  },
  {
    id: "owners",
    label: "Owners",
    method: "GET",
    path: "/api/v1/owners",
    params: "key",
    purpose: "Full client roster. All pet parents with contact info, balance, reservation history, and marketing opt-outs. Paginated in 500-record batches.",
    consumer: "Dashboard Sync",
    category: "sync",
    configKey: "dashboardSync",
    responseSize: "~200-500 KB",
  },
  {
    id: "animals",
    label: "Animals",
    method: "GET",
    path: "/api/v1/animals",
    params: "key",
    purpose: "All dog profiles linked to owners. Includes breed, weight, birthday, vaccines, VIP status, grooming notes, and image URLs.",
    consumer: "Dashboard Sync",
    category: "sync",
    configKey: "dashboardSync",
    responseSize: "~150-400 KB",
  },
  {
    id: "get_breeds",
    label: "Breeds (Reference)",
    method: "GET",
    path: "/api/v1/get_breeds",
    params: "key",
    purpose: "Breed ID → name lookup table. Fetched alongside animals to resolve breed_id to human-readable breed names.",
    consumer: "Dashboard Sync (with Animals)",
    category: "sync",
    configKey: "dashboardSync",
    responseSize: "~10 KB",
  },
  {
    id: "reservations",
    label: "Reservations (History)",
    method: "POST",
    path: "/api/v1/reservations",
    params: "key, checked_in=false, start_date, end_date",
    purpose: "Historical and upcoming reservations in 30-day chunks. Boarding, daycare, and grooming with services, transactions, notes, and owner/animal details.",
    consumer: "Dashboard Sync",
    category: "sync",
    configKey: "dashboardSync",
    responseSize: "~100-800 KB per chunk",
  },
  {
    id: "reservations_checked_in",
    label: "Reservations (Checked In)",
    method: "POST",
    path: "/api/v1/reservations",
    params: "key, checked_in=true",
    purpose: "Currently checked-in dogs only. Used to reconcile checkout events — dogs that disappear from this list have been checked out in Gingr.",
    consumer: "Dashboard Sync + TV Poll (Edge Function)",
    category: "sync",
    configKey: "dashboardSync",
    responseSize: "~20-50 KB",
  },
  {
    id: "reservation_types",
    label: "Reservation Types",
    method: "GET",
    path: "/api/v1/reservation_types",
    params: "key",
    purpose: "Service type definitions (boarding categories, daycare, grooming). Maps type_id to labels and classifies services as boarding/daycare/grooming.",
    consumer: "Full Sync only",
    category: "reference",
    configKey: "fullSync",
    responseSize: "~5 KB",
  },
  {
    id: "get_immunization_types",
    label: "Immunization Types",
    method: "GET",
    path: "/api/v1/get_immunization_types",
    params: "key, species_id=1",
    purpose: "Required vaccine definitions (Rabies, Bordetella, DHPP, etc.). Used for compliance tracking and expiration alerts.",
    consumer: "Full Sync only",
    category: "reference",
    configKey: "fullSync",
    responseSize: "~2 KB",
  },
  {
    id: "get_locations",
    label: "Locations (Connection Test)",
    method: "GET",
    path: "/api/v1/get_locations",
    params: "key",
    purpose: "Validates API credentials. Returns list of locations tied to the API key. Only called when testing the Gingr connection in Settings.",
    consumer: "Settings → Gingr Integration",
    category: "onDemand",
    configKey: null,
    responseSize: "~1 KB",
  },
  {
    id: "existing_reservation_estimate",
    label: "Reservation Estimate (Services)",
    method: "GET",
    path: "/api/v1/existing_reservation_estimate",
    params: "key, id={reservation_gingr_id}",
    purpose: "Fetches available add-on services for a specific reservation. Used in Operations Hub when team needs to see bath/groom options for a checked-in dog.",
    consumer: "Operations Hub (on demand)",
    category: "onDemand",
    configKey: null,
    responseSize: "~5-15 KB",
  },
];

const CATEGORY_LABELS = {
  live: { label: "Live Polling", color: "#22C55E", desc: "Client-side direct polling for real-time displays" },
  sync: { label: "Dashboard Sync", color: "#2563EB", desc: "Server-side Edge Function sync to Supabase" },
  reference: { label: "Reference Data", color: "#8B5CF6", desc: "Static lookup tables — only during full syncs" },
  onDemand: { label: "On Demand", color: "#F59E0B", desc: "Called only when a user action triggers it" },
};

// ── Helper: compute daily calls ─────────────────────────────────────────────
function computeDailyCalls(intervalSeconds, bhEnabled, bhStart, bhEnd) {
  const [startH, startM] = (bhStart || "07:00").split(":").map(Number);
  const [endH, endM] = (bhEnd || "19:00").split(":").map(Number);
  const activeMinutes = bhEnabled ? (endH * 60 + endM) - (startH * 60 + startM) : 24 * 60;
  if (activeMinutes <= 0 || intervalSeconds <= 0) return 0;
  return Math.floor((activeMinutes * 60) / intervalSeconds);
}

// ── Number input with stepper ───────────────────────────────────────────────
function NumberStepper({ value, onChange, min = 1, max = 3600, suffix = "s", step = 1 }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <button
        onClick={() => onChange(Math.max(min, value - step))}
        style={{
          width: 28, height: 28, borderRadius: 6, border: `1px solid ${C.border}`,
          background: C.surface, color: C.text, cursor: "pointer", fontSize: 14, fontWeight: 600,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >−</button>
      <div style={{
        padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.border}`,
        background: C.bg, fontSize: 13, fontWeight: 700, color: C.text,
        minWidth: 50, textAlign: "center", fontVariantNumeric: "tabular-nums",
      }}>
        {value}{suffix}
      </div>
      <button
        onClick={() => onChange(Math.min(max, value + step))}
        style={{
          width: 28, height: 28, borderRadius: 6, border: `1px solid ${C.border}`,
          background: C.surface, color: C.text, cursor: "pointer", fontSize: 14, fontWeight: 600,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >+</button>
    </div>
  );
}

// ── Time input ──────────────────────────────────────────────────────────────
function TimeInput({ value, onChange, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 11, color: C.textMut, fontWeight: 500, minWidth: 36 }}>{label}</span>
      <input
        type="time"
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.border}`,
          background: C.bg, fontSize: 12, color: C.text, fontFamily: "inherit",
        }}
      />
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────
function ApiDashboardTab() {
  const { profile } = useAuth();
  const locationId = profile?.location_id || "cherry-hill";

  const [dashRefresh, setDashRefresh] = useState(REFRESH_DEFAULTS);
  const [tvPoll, setTvPoll] = useState(TV_POLL_DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [expandedEndpoint, setExpandedEndpoint] = useState(null);

  // Load settings
  useEffect(() => {
    Promise.all([
      supabase.from("lite_settings").select("setting_value").eq("location_id", locationId).eq("setting_key", REFRESH_SETTING_KEY).maybeSingle(),
      supabase.from("lite_settings").select("setting_value").eq("location_id", locationId).eq("setting_key", TV_POLL_SETTING_KEY).maybeSingle(),
    ]).then(([dashRes, tvRes]) => {
      if (dashRes.data?.setting_value) setDashRefresh(prev => ({ ...prev, ...dashRes.data.setting_value }));
      if (tvRes.data?.setting_value) setTvPoll(prev => ({ ...prev, ...tvRes.data.setting_value }));
      setLoaded(true);
    });
  }, [locationId]);

  // Save
  const save = useCallback(async () => {
    setSaving(true);
    await Promise.all([
      supabase.from("lite_settings").upsert(
        { location_id: locationId, setting_key: REFRESH_SETTING_KEY, setting_value: dashRefresh },
        { onConflict: "location_id,setting_key" }
      ),
      supabase.from("lite_settings").upsert(
        { location_id: locationId, setting_key: TV_POLL_SETTING_KEY, setting_value: tvPoll },
        { onConflict: "location_id,setting_key" }
      ),
    ]);
    setSaving(false);
    setDirty(false);
  }, [locationId, dashRefresh, tvPoll]);

  // Update helpers
  const updateDash = (key, val) => { setDashRefresh(prev => ({ ...prev, [key]: val })); setDirty(true); };
  const updateTv = (key, val) => { setTvPoll(prev => ({ ...prev, [key]: val })); setDirty(true); };

  // ── Projections ─────────────────────────────────────────────────────────
  const projections = useMemo(() => {
    // TV Poll: back_of_house
    const tvCallsPerDay = computeDailyCalls(
      tvPoll.pollIntervalSeconds,
      tvPoll.businessHoursEnabled,
      tvPoll.businessHoursStart,
      tvPoll.businessHoursEnd
    );

    // Dashboard sync: each sync = owners + animals + get_breeds + reservations (history) + reservations (checked_in) = 5 API calls
    const dashSyncIntervalSec = (dashRefresh.refreshIntervalMinutes || 15) * 60;
    const dashSyncsPerDay = computeDailyCalls(
      dashSyncIntervalSec,
      dashRefresh.businessHoursEnabled,
      dashRefresh.businessHoursStart,
      dashRefresh.businessHoursEnd
    );
    const dashApiCallsPerSync = 5; // owners, animals, get_breeds, reservations(history), reservations(checked_in)
    const dashTotalCalls = dashSyncsPerDay * dashApiCallsPerSync;

    // Grand total
    const grandTotal = tvCallsPerDay + dashTotalCalls;

    return { tvCallsPerDay, dashSyncsPerDay, dashApiCallsPerSync, dashTotalCalls, grandTotal };
  }, [tvPoll, dashRefresh]);

  if (!loaded) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <K9LoadingAnimation size={48} message="Loading API dashboard..." />
      </div>
    );
  }

  return (
    <div>
      <h3 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: C.text }}>
        API Dashboard
      </h3>
      <p style={{ margin: "0 0 24px", fontSize: 13, color: C.textSec, lineHeight: 1.5 }}>
        Every Gingr API endpoint K9 Operations calls, what it does, how often, and total projected daily usage.
      </p>

      {/* ── Save Bar ── */}
      {dirty && (
        <div style={{
          position: "sticky", top: 0, zIndex: 10, padding: "10px 16px", marginBottom: 16,
          background: C.priLt, borderRadius: 10, border: `1px solid ${C.pri}30`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.pri }}>Unsaved changes</span>
          <button
            onClick={save}
            disabled={saving}
            style={{
              padding: "6px 18px", borderRadius: 8, border: "none",
              background: C.pri, color: "#fff", fontSize: 13, fontWeight: 700,
              cursor: "pointer", opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      )}

      {/* ── Daily Usage Summary ── */}
      <Card style={{ padding: "20px 24px", marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 16 }}>
          Projected Daily API Usage
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
          {[
            { label: "TV Poll Calls", value: projections.tvCallsPerDay.toLocaleString(), sub: `Every ${tvPoll.pollIntervalSeconds}s`, color: "#22C55E" },
            { label: "Sync Calls", value: projections.dashTotalCalls.toLocaleString(), sub: `${projections.dashSyncsPerDay} syncs × ${projections.dashApiCallsPerSync}`, color: "#2563EB" },
            { label: "Total / Day", value: projections.grandTotal.toLocaleString(), sub: "All endpoints", color: C.pri, accent: true },
          ].map(item => (
            <div key={item.label} style={{
              padding: "14px 16px", borderRadius: 10,
              background: item.accent ? C.priLt : C.bg,
              border: `1px solid ${item.accent ? C.pri + "30" : C.borderLight}`,
            }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: C.textMut, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {item.label}
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: item.color || C.text, fontVariantNumeric: "tabular-nums" }}>
                {item.value}
              </div>
              <div style={{ fontSize: 10, color: C.textMut, marginTop: 2 }}>{item.sub}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* ── Polling Configuration Cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        {/* TV Poll Config */}
        <Card style={{ padding: "18px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22C55E" }} />
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Checkout TV Polling</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.textMut, marginBottom: 6 }}>POLL INTERVAL</div>
              <NumberStepper value={tvPoll.pollIntervalSeconds} onChange={v => updateTv("pollIntervalSeconds", v)} min={5} max={120} suffix="s" step={5} />
              <div style={{ fontSize: 10, color: C.textMut, marginTop: 4 }}>{projections.tvCallsPerDay.toLocaleString()} calls/day at this rate</div>
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.textMut }}>BUSINESS HOURS ONLY</div>
                <label style={{ position: "relative", width: 36, height: 20, cursor: "pointer" }}>
                  <input type="checkbox" checked={tvPoll.businessHoursEnabled} onChange={e => updateTv("businessHoursEnabled", e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
                  <span style={{
                    position: "absolute", inset: 0, borderRadius: 10,
                    background: tvPoll.businessHoursEnabled ? C.pri : C.border,
                    transition: "background 0.2s",
                  }}>
                    <span style={{
                      position: "absolute", top: 2, left: tvPoll.businessHoursEnabled ? 18 : 2,
                      width: 16, height: 16, borderRadius: "50%", background: "#fff",
                      transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                    }} />
                  </span>
                </label>
              </div>
              {tvPoll.businessHoursEnabled && (
                <div style={{ display: "flex", gap: 10 }}>
                  <TimeInput label="From" value={tvPoll.businessHoursStart} onChange={v => updateTv("businessHoursStart", v)} />
                  <TimeInput label="To" value={tvPoll.businessHoursEnd} onChange={v => updateTv("businessHoursEnd", v)} />
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* Dashboard Sync Config */}
        <Card style={{ padding: "18px 20px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#2563EB" }} />
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Dashboard Sync</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.textMut, marginBottom: 6 }}>SYNC INTERVAL</div>
              <NumberStepper
                value={dashRefresh.refreshIntervalMinutes}
                onChange={v => updateDash("refreshIntervalMinutes", v)}
                min={5} max={120} suffix="m" step={5}
              />
              <div style={{ fontSize: 10, color: C.textMut, marginTop: 4 }}>{projections.dashSyncsPerDay} syncs/day × {projections.dashApiCallsPerSync} calls each = {projections.dashTotalCalls.toLocaleString()} calls/day</div>
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.textMut }}>BUSINESS HOURS ONLY</div>
                <label style={{ position: "relative", width: 36, height: 20, cursor: "pointer" }}>
                  <input type="checkbox" checked={dashRefresh.businessHoursEnabled} onChange={e => updateDash("businessHoursEnabled", e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
                  <span style={{
                    position: "absolute", inset: 0, borderRadius: 10,
                    background: dashRefresh.businessHoursEnabled ? C.pri : C.border,
                    transition: "background 0.2s",
                  }}>
                    <span style={{
                      position: "absolute", top: 2, left: dashRefresh.businessHoursEnabled ? 18 : 2,
                      width: 16, height: 16, borderRadius: "50%", background: "#fff",
                      transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                    }} />
                  </span>
                </label>
              </div>
              {dashRefresh.businessHoursEnabled && (
                <div style={{ display: "flex", gap: 10 }}>
                  <TimeInput label="From" value={dashRefresh.businessHoursStart} onChange={v => updateDash("businessHoursStart", v)} />
                  <TimeInput label="To" value={dashRefresh.businessHoursEnd} onChange={v => updateDash("businessHoursEnd", v)} />
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* ── Endpoint Catalog ── */}
      <Card style={{ padding: "20px 24px", marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>
          Endpoint Catalog
        </div>
        <div style={{ fontSize: 12, color: C.textSec, marginBottom: 16, lineHeight: 1.5 }}>
          Every Gingr API endpoint K9 Operations calls. Click any row for full details.
        </div>

        {/* Category legend */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
          {Object.entries(CATEGORY_LABELS).map(([key, cat]) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: C.textSec }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: cat.color }} />
              <span style={{ fontWeight: 600 }}>{cat.label}</span>
              <span style={{ color: C.textMut }}>— {cat.desc}</span>
            </div>
          ))}
        </div>

        {/* Table header */}
        <div style={{
          display: "grid", gridTemplateColumns: "minmax(200px, 2fr) 60px 1fr 120px 100px",
          padding: "8px 14px", borderBottom: `2px solid ${C.borderLight}`,
          fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em",
        }}>
          <div>Endpoint</div>
          <div>Method</div>
          <div>Consumer</div>
          <div>Frequency</div>
          <div style={{ textAlign: "right" }}>Calls/Day</div>
        </div>

        {/* Rows */}
        {ENDPOINTS.map(ep => {
          const isExpanded = expandedEndpoint === ep.id;
          const cat = CATEGORY_LABELS[ep.category];

          // Compute frequency label and calls/day
          let freqLabel = "";
          let callsPerDay = 0;

          if (ep.category === "live") {
            freqLabel = `Every ${tvPoll.pollIntervalSeconds}s`;
            callsPerDay = projections.tvCallsPerDay;
          } else if (ep.category === "sync") {
            freqLabel = `Every ${dashRefresh.refreshIntervalMinutes}m`;
            callsPerDay = projections.dashSyncsPerDay;
          } else if (ep.category === "reference") {
            freqLabel = "Full sync only";
            callsPerDay = 0; // Manual only
          } else {
            freqLabel = "On demand";
            callsPerDay = 0;
          }

          return (
            <div key={ep.id}>
              <div
                onClick={() => setExpandedEndpoint(isExpanded ? null : ep.id)}
                style={{
                  display: "grid", gridTemplateColumns: "minmax(200px, 2fr) 60px 1fr 120px 100px",
                  padding: "12px 14px", borderBottom: `1px solid ${C.borderLight}`,
                  cursor: "pointer", transition: "background 0.15s",
                  background: isExpanded ? C.priLt : "transparent",
                }}
                onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = C.surfaceHover; }}
                onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = "transparent"; }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: cat.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{ep.label}</span>
                </div>
                <div>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                    background: ep.method === "POST" ? C.warnLt : C.infoLt,
                    color: ep.method === "POST" ? C.warn : C.info,
                  }}>
                    {ep.method}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: C.textSec }}>{ep.consumer}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{freqLabel}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: callsPerDay > 0 ? C.pri : C.textMut, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {callsPerDay > 0 ? callsPerDay.toLocaleString() : "—"}
                </div>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div style={{
                  padding: "14px 20px 16px", background: C.priLt,
                  borderBottom: `1px solid ${C.borderLight}`,
                }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", marginBottom: 4 }}>Purpose</div>
                      <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.5 }}>{ep.purpose}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", marginBottom: 4 }}>Technical</div>
                      <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.6 }}>
                        <div><span style={{ fontWeight: 600, color: C.text }}>Path:</span> <code style={{ fontSize: 11, color: C.pri }}>{ep.path}</code></div>
                        <div><span style={{ fontWeight: 600, color: C.text }}>Params:</span> {ep.params}</div>
                        <div><span style={{ fontWeight: 600, color: C.text }}>Response:</span> {ep.responseSize}</div>
                        <div><span style={{ fontWeight: 600, color: C.text }}>Category:</span> {cat.label}</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </Card>

      {/* ── How It All Fits Together ── */}
      <Card style={{ padding: "18px 22px" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 10 }}>
          How It All Fits Together
        </div>
        <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.7 }}>
          <div style={{ paddingLeft: 14 }}>
            <div>1. <span style={{ fontWeight: 600 }}>Checkout TV</span> polls the <code style={{ fontSize: 11, color: C.pri }}>back_of_house</code> endpoint directly from the browser every <span style={{ fontWeight: 700, color: C.pri }}>{tvPoll.pollIntervalSeconds}s</span> — no server roundtrip. This gives instant check-in/out detection with real room assignments.</div>
            <div style={{ marginTop: 4 }}>2. <span style={{ fontWeight: 600 }}>Dashboard sync</span> runs a Supabase Edge Function every <span style={{ fontWeight: 700, color: C.pri }}>{dashRefresh.refreshIntervalMinutes} min</span> pulling owners, animals, and reservations into Supabase for all dashboard views.</div>
            <div style={{ marginTop: 4 }}>3. <span style={{ fontWeight: 600 }}>Reference data</span> (reservation types, immunization types) only syncs during a manual full sync — these definitions rarely change.</div>
            <div style={{ marginTop: 4 }}>4. <span style={{ fontWeight: 600 }}>On-demand calls</span> (reservation estimates, connection test) only fire when explicitly triggered by a user action.</div>
            <div style={{ marginTop: 4 }}>5. Both the TV poll and dashboard sync respect <span style={{ fontWeight: 600 }}>business hours</span> — outside those windows, no API calls are made.</div>
          </div>
        </div>
      </Card>
    </div>
  );
}

export default ApiDashboardTab;
