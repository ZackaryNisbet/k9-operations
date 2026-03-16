// K9 Operations — Dashboard Refresh Settings Tab
// Configures refresh interval and business hours for dashboard auto-polling.

import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../../supabaseClient";
import { C } from "../../shared/theme";
import { Card } from "../../shared/ui";
import K9LoadingAnimation from "../../shared/K9LoadingAnimation";
import { useAuth } from "../../AuthProvider";
import { REFRESH_DEFAULTS, REFRESH_SETTING_KEY } from "../../hooks/useRefreshSettings";

const INTERVAL_OPTIONS = [5, 10, 15, 20, 30, 60];

const HOUR_OPTIONS = [];
for (let h = 5; h <= 22; h++) {
  for (const m of ["00", "30"]) {
    const hour12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
    const ampm = h >= 12 ? "PM" : "AM";
    const val = `${String(h).padStart(2, "0")}:${m}`;
    const label = `${hour12}:${m} ${ampm}`;
    HOUR_OPTIONS.push({ value: val, label });
  }
}

function DashboardRefreshTab() {
  const { profile } = useAuth();
  const [refreshInterval, setRefreshInterval] = useState(REFRESH_DEFAULTS.refreshIntervalMinutes);
  const [businessHoursEnabled, setBusinessHoursEnabled] = useState(REFRESH_DEFAULTS.businessHoursEnabled);
  const [businessStart, setBusinessStart] = useState(REFRESH_DEFAULTS.businessHoursStart);
  const [businessEnd, setBusinessEnd] = useState(REFRESH_DEFAULTS.businessHoursEnd);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Load settings
  useEffect(() => {
    const locationId = profile?.location_id || "cherry-hill";
    supabase
      .from("lite_settings")
      .select("setting_value")
      .eq("location_id", locationId)
      .eq("setting_key", REFRESH_SETTING_KEY)
      .then(({ data: rows }) => {
        if (rows && rows.length > 0 && rows[0].setting_value) {
          const val = rows[0].setting_value;
          if (val.refreshIntervalMinutes != null) setRefreshInterval(val.refreshIntervalMinutes);
          if (val.businessHoursEnabled != null) setBusinessHoursEnabled(val.businessHoursEnabled);
          if (val.businessHoursStart != null) setBusinessStart(val.businessHoursStart);
          if (val.businessHoursEnd != null) setBusinessEnd(val.businessHoursEnd);
        }
        setLoaded(true);
      });
  }, [profile?.location_id]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    const locationId = profile?.location_id || "cherry-hill";
    const { error } = await supabase.from("lite_settings").upsert(
      {
        location_id: locationId,
        setting_key: REFRESH_SETTING_KEY,
        setting_value: {
          refreshIntervalMinutes: refreshInterval,
          businessHoursEnabled,
          businessHoursStart: businessStart,
          businessHoursEnd: businessEnd,
        },
        updated_by: profile?.id || null,
      },
      { onConflict: "location_id,setting_key" }
    );
    if (!error) {
      setDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  }, [profile, refreshInterval, businessHoursEnabled, businessStart, businessEnd]);

  if (!loaded)
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <K9LoadingAnimation size={48} message="Loading settings..." />
      </div>
    );

  return (
    <div>
      <h3 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: C.text }}>
        Dashboard Refresh
      </h3>
      <p style={{ margin: "0 0 24px", fontSize: 13, color: C.textSec, lineHeight: 1.5 }}>
        Configure how often the dashboard automatically refreshes data from Gingr, and set business
        hours to pause polling when the facility is closed.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
        {/* Refresh Interval */}
        <Card style={{ padding: "20px 24px" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 12 }}>
            Refresh Interval
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <select
              value={refreshInterval}
              onChange={(e) => {
                setRefreshInterval(Number(e.target.value));
                setDirty(true);
              }}
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                border: `1.5px solid ${C.border}`,
                background: C.bg,
                color: C.text,
                fontSize: 14,
                fontWeight: 600,
                fontFamily: "inherit",
                cursor: "pointer",
                minWidth: 120,
              }}
            >
              {INTERVAL_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m} minutes
                </option>
              ))}
            </select>
          </div>
          <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.5 }}>
            How often the dashboard polls for updated metrics. Lower values use more API calls.
          </div>
          <div style={{ marginTop: 12, display: "flex", gap: 6 }}>
            {[5, 10, 15, 30].map((d) => (
              <button
                key={d}
                onClick={() => {
                  setRefreshInterval(d);
                  setDirty(true);
                }}
                style={{
                  padding: "4px 10px",
                  borderRadius: 6,
                  border: `1px solid ${refreshInterval === d ? C.pri : C.border}`,
                  background: refreshInterval === d ? C.priLt : "transparent",
                  color: refreshInterval === d ? C.pri : C.textSec,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {d}m
              </button>
            ))}
          </div>
        </Card>

        {/* Business Hours */}
        <Card style={{ padding: "20px 24px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Business Hours</div>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
                color: businessHoursEnabled ? C.pri : C.textMut,
              }}
            >
              <div
                onClick={() => {
                  setBusinessHoursEnabled(!businessHoursEnabled);
                  setDirty(true);
                }}
                style={{
                  width: 36,
                  height: 20,
                  borderRadius: 10,
                  background: businessHoursEnabled ? C.pri : C.border,
                  position: "relative",
                  cursor: "pointer",
                  transition: "background 0.2s",
                }}
              >
                <div
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    background: "#fff",
                    position: "absolute",
                    top: 2,
                    left: businessHoursEnabled ? 18 : 2,
                    transition: "left 0.2s",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                  }}
                />
              </div>
              {businessHoursEnabled ? "On" : "Off"}
            </label>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 8,
              opacity: businessHoursEnabled ? 1 : 0.4,
              pointerEvents: businessHoursEnabled ? "auto" : "none",
            }}
          >
            <select
              value={businessStart}
              onChange={(e) => {
                setBusinessStart(e.target.value);
                setDirty(true);
              }}
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: `1.5px solid ${C.border}`,
                background: C.bg,
                color: C.text,
                fontSize: 13,
                fontWeight: 600,
                fontFamily: "inherit",
                cursor: "pointer",
              }}
            >
              {HOUR_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <span style={{ fontSize: 13, color: C.textSec, fontWeight: 600 }}>to</span>
            <select
              value={businessEnd}
              onChange={(e) => {
                setBusinessEnd(e.target.value);
                setDirty(true);
              }}
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: `1.5px solid ${C.border}`,
                background: C.bg,
                color: C.text,
                fontSize: 13,
                fontWeight: 600,
                fontFamily: "inherit",
                cursor: "pointer",
              }}
            >
              {HOUR_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.5 }}>
            When enabled, active Gingr polling pauses outside these hours to reduce API usage.
            Ignite webhooks still update passively.
          </div>
        </Card>
      </div>

      {/* How it works */}
      <Card style={{ padding: "16px 20px", marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 8 }}>
          How Dashboard Refresh Works
        </div>
        <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.7 }}>
          <div style={{ marginBottom: 6 }}>
            The dashboard automatically polls Gingr for updated data at the configured interval:
          </div>
          <div style={{ paddingLeft: 14 }}>
            <div>
              1. Every <span style={{ fontWeight: 700, color: C.pri }}>{refreshInterval} minutes</span>,
              the system triggers an incremental sync with Gingr
            </div>
            <div>2. Pre-computed metrics are refreshed and the dashboard updates automatically</div>
            <div>
              3.{" "}
              {businessHoursEnabled ? (
                <>
                  Outside business hours (
                  <span style={{ fontWeight: 700, color: C.pri }}>
                    {HOUR_OPTIONS.find((o) => o.value === businessStart)?.label || businessStart}
                  </span>
                  {" – "}
                  <span style={{ fontWeight: 700, color: C.pri }}>
                    {HOUR_OPTIONS.find((o) => o.value === businessEnd)?.label || businessEnd}
                  </span>
                  ), active Gingr polling pauses to reduce API usage
                </>
              ) : (
                "Business hours filtering is disabled — polling runs 24/7"
              )}
            </div>
            <div>4. Ignite email webhooks continue to process leads regardless of business hours</div>
          </div>
        </div>
      </Card>

      {/* Save button */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          style={{
            padding: "10px 28px",
            borderRadius: 8,
            border: "none",
            background: !dirty ? C.surfaceHover : C.pri,
            color: !dirty ? C.textMut : "#fff",
            fontSize: 13,
            fontWeight: 700,
            cursor: !dirty ? "not-allowed" : "pointer",
            fontFamily: "inherit",
          }}
        >
          {saving ? "Saving\u2026" : saved ? "\u2713 Saved" : "Save Changes"}
        </button>
        {dirty && (
          <span style={{ fontSize: 12, color: C.acc, fontWeight: 600 }}>Unsaved changes</span>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: C.textMut }}>
          Changes take effect on next refresh cycle.
        </span>
      </div>
    </div>
  );
}

export default DashboardRefreshTab;
