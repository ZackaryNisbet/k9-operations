import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "../../supabaseClient";
import { C } from "../../shared/theme";
import { Card } from "../../shared/ui";
import K9LoadingAnimation from "../../shared/K9LoadingAnimation";
import { useAuth } from "../../AuthProvider";

const SETTING_KEY = "emergency_contact_verification";
const DEFAULTS = {
  enabled: false,
  days: 30,
};

export default function EmergencyContactsSettingsTab() {
  const { profile } = useAuth();
  const locationId = profile?.location_id || "cherry-hill";
  const [enabled, setEnabled] = useState(DEFAULTS.enabled);
  const [days, setDays] = useState(DEFAULTS.days);
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("lite_settings")
      .select("setting_value")
      .eq("location_id", locationId)
      .eq("setting_key", SETTING_KEY)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const next = data?.setting_value || DEFAULTS;
        setEnabled(!!next.enabled);
        setDays(Number(next.days) > 0 ? Number(next.days) : DEFAULTS.days);
        setLoaded(true);
      });
    return () => { cancelled = true; };
  }, [locationId]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    const { error } = await supabase.from("lite_settings").upsert({
      location_id: locationId,
      setting_key: SETTING_KEY,
      setting_value: {
        enabled,
        days: Math.max(1, Number(days) || DEFAULTS.days),
      },
      updated_by: profile?.id || null,
    }, { onConflict: "location_id,setting_key" });

    if (!error) {
      setDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  }, [days, enabled, locationId, profile?.id]);

  if (!loaded) {
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <K9LoadingAnimation size={48} message="Loading settings..." />
      </div>
    );
  }

  return (
    <div>
      <h3 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: C.text }}>Emergency Contacts</h3>
      <p style={{ margin: "0 0 24px", fontSize: 13, color: C.textSec, lineHeight: 1.5 }}>
        Control how often staff must re-verify emergency contacts for dogs that remain in house across multiple days.
      </p>

      <Card style={{ padding: "20px 24px", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 6 }}>Repeat Verification Threshold</div>
            <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.6, maxWidth: 520 }}>
              When enabled, the mobile Emergency Contacts workflow suppresses repeat prompts for dogs verified within the last configured number of days.
            </div>
          </div>
          <button
            onClick={() => {
              setEnabled((prev) => !prev);
              setDirty(true);
            }}
            style={{
              width: 48,
              height: 26,
              borderRadius: 13,
              border: "none",
              cursor: "pointer",
              background: enabled ? C.pri : C.border,
              position: "relative",
              transition: "background 0.2s",
              flexShrink: 0,
            }}
          >
            <div style={{
              width: 20,
              height: 20,
              borderRadius: 10,
              background: "#fff",
              position: "absolute",
              top: 3,
              left: enabled ? 25 : 3,
              transition: "left 0.2s",
              boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
            }} />
          </button>
        </div>
      </Card>

      <Card style={{ padding: "20px 24px", marginBottom: 24, opacity: enabled ? 1 : 0.55 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 12 }}>Verification Window</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <input
            type="number"
            min={1}
            max={365}
            disabled={!enabled}
            value={days}
            onChange={(e) => {
              setDays(Math.max(1, Number(e.target.value) || DEFAULTS.days));
              setDirty(true);
            }}
            style={{
              width: 90,
              padding: "10px 14px",
              borderRadius: 8,
              border: `1.5px solid ${C.border}`,
              background: C.bg,
              color: C.text,
              fontSize: 16,
              fontWeight: 700,
              fontFamily: "inherit",
              textAlign: "center",
            }}
          />
          <span style={{ fontSize: 14, color: C.text, fontWeight: 600 }}>days</span>
        </div>
        <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.6 }}>
          Example: with a 30-day threshold, a dog verified yesterday will not appear as due again today, but the prompt will return after 30 days without a new verification.
        </div>
        <div style={{ marginTop: 12, display: "flex", gap: 6 }}>
          {[7, 14, 30, 60].map((value) => (
            <button
              key={value}
              disabled={!enabled}
              onClick={() => {
                setDays(value);
                setDirty(true);
              }}
              style={{
                padding: "4px 10px",
                borderRadius: 6,
                border: `1px solid ${days === value ? C.pri : C.border}`,
                background: days === value ? C.priLt : "transparent",
                color: days === value ? C.pri : C.textSec,
                fontSize: 11,
                fontWeight: 600,
                cursor: enabled ? "pointer" : "not-allowed",
                fontFamily: "inherit",
              }}
            >
              {value}d
            </button>
          ))}
        </div>
      </Card>

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
          {saving ? "Saving…" : saved ? "✓ Saved" : "Save Changes"}
        </button>
        {dirty && <span style={{ fontSize: 12, color: C.acc, fontWeight: 600 }}>Unsaved changes</span>}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: C.textMut }}>Mobile respects this threshold immediately after the setting is saved.</span>
      </div>
    </div>
  );
}
