// K9 Operations - Weather Location Settings

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabaseClient";
import { C } from "../../shared/theme";
import { Card } from "../../shared/ui";
import K9LoadingAnimation from "../../shared/K9LoadingAnimation";
import { useAuth } from "../../AuthProvider";

const CHERRY_HILL_ALIAS = "cherry-hill";

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function formatAddress(parts) {
  const street = [parts?.address_street1, parts?.address_street2].filter(Boolean).join(" ");
  const cityStateZip = [
    parts?.address_city,
    [parts?.address_state, parts?.address_zip].filter(Boolean).join(" "),
  ].filter(Boolean).join(", ");
  return [street, cityStateZip].filter(Boolean).join(", ");
}

function formatDateTime(value) {
  if (!value) return "Not recorded";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "Not recorded";
  return dt.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function DataTile({ label, value, tone = "default" }) {
  const color = tone === "warning" ? C.warn : tone === "success" ? C.suc : C.text;
  return (
    <div style={{
      padding: "14px 16px",
      background: C.bg,
      border: `1px solid ${C.borderLight}`,
      borderRadius: 10,
      minWidth: 0,
    }}>
      <div style={{
        fontSize: 11,
        fontWeight: 800,
        color: C.textMut,
        textTransform: "uppercase",
        letterSpacing: "0.03em",
        marginBottom: 5,
      }}>
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 800, color, lineHeight: 1.35, overflowWrap: "anywhere" }}>
        {value || "Not set"}
      </div>
    </div>
  );
}

export default function WeatherLocationSettingsTab() {
  const { profile } = useAuth();
  const locationId = profile?.location_id || CHERRY_HILL_ALIAS;
  const [weatherConfig, setWeatherConfig] = useState(null);
  const [locationRecord, setLocationRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!locationId) return;
    setLoading(true);
    setError("");

    const locationQuery = supabase
      .from("locations")
      .select("id,name,slug,address_street1,address_street2,address_city,address_state,address_zip,timezone,updated_at");

    const resolvedLocationQuery = isUuid(locationId)
      ? locationQuery.eq("id", locationId)
      : locationQuery.eq("slug", locationId);

    const [weatherResult, locationResult] = await Promise.all([
      supabase
        .from("weather_location_settings")
        .select("*")
        .eq("location_id", locationId)
        .maybeSingle(),
      resolvedLocationQuery.maybeSingle(),
    ]);

    if (weatherResult.error) setError(weatherResult.error.message);
    if (!weatherResult.error) setWeatherConfig(weatherResult.data || null);
    if (!locationResult.error) setLocationRecord(locationResult.data || null);
    setLoading(false);
  }, [locationId]);

  useEffect(() => {
    load();
  }, [load]);

  const configuredAddress = weatherConfig?.metadata?.address || "";
  const canonicalAddress = useMemo(() => formatAddress(locationRecord), [locationRecord]);
  const coordinates = weatherConfig
    ? `${Number(weatherConfig.latitude).toFixed(6)}, ${Number(weatherConfig.longitude).toFixed(6)}`
    : "";
  const mapsHref = weatherConfig
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${weatherConfig.latitude},${weatherConfig.longitude}`)}`
    : "";
  const addressStatus = canonicalAddress
    ? "Canonical address set"
    : "Canonical address missing";

  if (loading) {
    return <K9LoadingAnimation size={48} message="Loading weather location..." />;
  }

  return (
    <div style={{ maxWidth: 920 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 20 }}>
        <div>
          <h3 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 800, color: C.text }}>Weather Location</h3>
          <p style={{ margin: 0, color: C.textSec, fontSize: 13, lineHeight: 1.5 }}>
            Coordinates used by dashboard weather, scheduling weather, and historical weather backfills.
          </p>
        </div>
        <button
          onClick={load}
          style={{
            border: `1.5px solid ${C.border}`,
            background: C.surface,
            color: C.text,
            borderRadius: 8,
            padding: "8px 12px",
            fontSize: 12,
            fontWeight: 800,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Refresh
        </button>
      </div>

      {error && (
        <Card style={{ padding: 16, borderColor: "#FCA5A5", background: "#FEF2F2", color: C.dan, marginBottom: 16 }}>
          {error}
        </Card>
      )}

      <Card style={{ padding: "20px 24px", marginBottom: 18 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
          <DataTile label="Weather address" value={configuredAddress} tone={configuredAddress ? "success" : "warning"} />
          <DataTile label="Coordinates" value={coordinates} tone={coordinates ? "success" : "warning"} />
          <DataTile label="Timezone" value={weatherConfig?.timezone_id || locationRecord?.timezone} />
          <DataTile label="Provider" value={weatherConfig?.provider || "Not configured"} />
          <DataTile label="Status" value={weatherConfig?.enabled ? "Enabled" : "Disabled"} tone={weatherConfig?.enabled ? "success" : "warning"} />
          <DataTile label="Source" value={weatherConfig?.metadata?.seed_source || "Not recorded"} />
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 16 }}>
          {mapsHref && (
            <a
              href={mapsHref}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                minHeight: 34,
                padding: "0 13px",
                borderRadius: 8,
                border: `1.5px solid ${C.pri}40`,
                background: C.priLt,
                color: C.pri,
                fontSize: 12,
                fontWeight: 800,
                textDecoration: "none",
              }}
            >
              Open coordinate map
            </a>
          )}
          <span style={{
            display: "inline-flex",
            alignItems: "center",
            minHeight: 34,
            padding: "0 13px",
            borderRadius: 8,
            border: `1.5px solid ${canonicalAddress ? C.suc : C.warn}40`,
            background: canonicalAddress ? C.sucLt : C.warnLt,
            color: canonicalAddress ? C.suc : C.warn,
            fontSize: 12,
            fontWeight: 800,
          }}>
            {addressStatus}
          </span>
        </div>
      </Card>

      <Card style={{ padding: "20px 24px" }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: C.text, marginBottom: 12 }}>Canonical Location Record</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
          <DataTile label="Location" value={locationRecord?.name || weatherConfig?.display_name} />
          <DataTile label="Slug" value={locationRecord?.slug || locationId} />
          <DataTile label="Canonical address" value={canonicalAddress} tone={canonicalAddress ? "success" : "warning"} />
          <DataTile label="Location table timezone" value={locationRecord?.timezone} />
          <DataTile label="Weather config updated" value={formatDateTime(weatherConfig?.updated_at)} />
          <DataTile label="Location record updated" value={formatDateTime(locationRecord?.updated_at)} />
        </div>
        {!canonicalAddress && (
          <div style={{
            marginTop: 14,
            padding: "12px 14px",
            borderRadius: 10,
            background: C.warnLt,
            border: `1px solid ${C.warn}33`,
            color: C.text,
            fontSize: 12,
            lineHeight: 1.55,
            fontWeight: 650,
          }}>
            New-location onboarding should require the operating address, timezone, and validated coordinates before weather, scheduling exports, and historical backfills are enabled.
          </div>
        )}
      </Card>
    </div>
  );
}
