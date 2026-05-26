// K9 Operations - Weather Display Settings

import React, { useState } from "react";
import { C } from "../../shared/theme";
import { Card } from "../../shared/ui";
import K9LoadingAnimation from "../../shared/K9LoadingAnimation";
import { useAuth } from "../../AuthProvider";
import { useWeatherDisplaySettings } from "../../hooks/useWeatherDisplaySettings";

function WeatherDisplayToggle({ label, description, checked, disabled, onChange }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 18,
      padding: "16px 0",
      borderTop: `1px solid ${C.borderLight}`,
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 850, color: C.text, marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: 12, fontWeight: 650, color: C.textSec, lineHeight: 1.5 }}>{description}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        style={{
          width: 48,
          height: 28,
          borderRadius: 999,
          border: `1.5px solid ${checked ? C.pri : C.border}`,
          background: checked ? C.pri : C.surface,
          cursor: disabled ? "default" : "pointer",
          flex: "0 0 auto",
          opacity: disabled ? 0.58 : 1,
          position: "relative",
          transition: "background 160ms ease, border-color 160ms ease",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 3,
            left: checked ? 23 : 3,
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: checked ? C.surface : C.textMut,
            boxShadow: "0 1px 3px rgba(15, 23, 42, 0.2)",
            transition: "left 160ms ease, background 160ms ease",
          }}
        />
      </button>
    </div>
  );
}

export default function WeatherDisplaySettingsTab({ addGlobalToast }) {
  const { profile } = useAuth();
  const locationId = profile?.location_id || "cherry-hill";
  const {
    settings,
    loading,
    error,
    saveSettings,
  } = useWeatherDisplaySettings(locationId);
  const [savingKey, setSavingKey] = useState("");

  const updateSetting = async (key, value) => {
    setSavingKey(key);
    try {
      await saveSettings({ ...settings, [key]: value });
      addGlobalToast?.("Weather display settings saved.", "success");
    } catch (saveError) {
      addGlobalToast?.(`Weather display save failed: ${saveError?.message || "unknown error"}`, "error");
    } finally {
      setSavingKey("");
    }
  };

  if (loading) {
    return <K9LoadingAnimation size={48} message="Loading weather display settings..." />;
  }

  return (
    <div style={{ maxWidth: 820 }}>
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 850, color: C.text }}>Weather Display</h3>
        <p style={{ margin: 0, color: C.textSec, fontSize: 13, lineHeight: 1.5 }}>
          Control where cached weather appears in the front-end app. Weather is hidden by default.
        </p>
      </div>

      {error && (
        <Card style={{ padding: 16, borderColor: "#FCA5A5", background: "#FEF2F2", color: C.dan, marginBottom: 16 }}>
          {error}
        </Card>
      )}

      <Card style={{ padding: "4px 24px 6px" }}>
        <WeatherDisplayToggle
          label="Dashboard weather"
          description="Show the dashboard weather pill, strip, and details modal on Home and Dashboard."
          checked={settings.showDashboardWeather}
          disabled={savingKey === "showDashboardWeather"}
          onChange={(value) => updateSetting("showDashboardWeather", value)}
        />
        <WeatherDisplayToggle
          label="Scheduling weather"
          description="Show the Weather Data group in the scheduling demand matrix."
          checked={settings.showSchedulingWeather}
          disabled={savingKey === "showSchedulingWeather"}
          onChange={(value) => updateSetting("showSchedulingWeather", value)}
        />
      </Card>
    </div>
  );
}
