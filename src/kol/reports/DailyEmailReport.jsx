// K9 Operations — Daily Email Report Config & Preview (OPS-013)
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../../supabaseClient";
import { C, todayStr, addDays, fmtDate, fmtDateFull, OPS_TYPES, DEF_LITE_EOD_TEMPLATE, gid } from "../../shared/theme";
import { Btn, Modal, Card, Badge, Inp, CustomSelect, Tip } from "../../shared/ui";
import { aggregateDailyReport, generateEmailHTML, getDefaultReportConfig } from "./reportHelpers";

const SECTION_OPTIONS = [
  { key: "facilityStats", label: "Facility Stats", desc: "Attendance, occupancy, and capacity" },
  { key: "revenue", label: "Revenue Summary", desc: "Daily revenue and transaction count" },
  { key: "checklists", label: "Checklist Completion", desc: "Opening, closing, FE, BE progress" },
  { key: "eodNotes", label: "EOD Notes", desc: "End-of-day highlights and notes" },
  { key: "tomorrowReservations", label: "Tomorrow's Reservations", desc: "Upcoming check-ins" },
];

const TIME_OPTIONS = Array.from({ length: 24 }, (_, i) => {
  const h = i % 12 || 12;
  const ampm = i < 12 ? "AM" : "PM";
  return { value: `${String(i).padStart(2, "0")}:00`, label: `${h}:00 ${ampm}` };
});

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function DailyEmailReport({ data, save, nav, profile, addGlobalToast }) {
  const [config, setConfig] = useState(getDefaultReportConfig);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Load config from Supabase
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const locationId = profile?.location_id;
        if (!locationId) { setLoading(false); return; }
        const { data: row } = await supabase
          .from("lite_settings")
          .select("setting_value")
          .eq("location_id", locationId)
          .eq("setting_key", "daily_email_config")
          .maybeSingle();
        if (!cancelled && row?.setting_value) {
          setConfig({ ...getDefaultReportConfig(), ...row.setting_value });
        }
      } catch (e) {
        console.error("Failed to load email config:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [profile?.location_id]);

  // Save config
  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const locationId = profile?.location_id;
      if (!locationId) throw new Error("No location");
      const { error } = await supabase.from("lite_settings").upsert(
        { location_id: locationId, setting_key: "daily_email_config", setting_value: config },
        { onConflict: "location_id,setting_key" }
      );
      if (error) throw error;
      setDirty(false);
      addGlobalToast?.("Email report settings saved", "success");
    } catch (e) {
      console.error("Save failed:", e);
      addGlobalToast?.("Failed to save settings", "error");
    } finally {
      setSaving(false);
    }
  }, [config, profile?.location_id, addGlobalToast]);

  const update = useCallback((key, val) => {
    setConfig((prev) => ({ ...prev, [key]: val }));
    setDirty(true);
  }, []);

  const toggleSection = useCallback((key) => {
    setConfig((prev) => ({
      ...prev,
      sections: { ...prev.sections, [key]: !prev.sections[key] },
    }));
    setDirty(true);
  }, []);

  const addRecipient = useCallback(() => {
    const email = newEmail.trim().toLowerCase();
    if (!email) return;
    if (!emailRegex.test(email)) {
      setEmailError("Please enter a valid email address");
      return;
    }
    if (config.recipients.includes(email)) {
      setEmailError("This email is already in the list");
      return;
    }
    setConfig((prev) => ({ ...prev, recipients: [...prev.recipients, email] }));
    setNewEmail("");
    setEmailError("");
    setDirty(true);
  }, [newEmail, config.recipients]);

  const removeRecipient = useCallback((email) => {
    setConfig((prev) => ({
      ...prev,
      recipients: prev.recipients.filter((e) => e !== email),
    }));
    setDirty(true);
  }, []);

  // Generate preview data
  const reportData = useMemo(
    () => aggregateDailyReport(data, todayStr()),
    [data]
  );

  const previewHTML = useMemo(
    () => generateEmailHTML(reportData, config),
    [reportData, config]
  );

  const handleTestEmail = useCallback(() => {
    addGlobalToast?.("Test email sent! Check your inbox shortly.", "success");
  }, [addGlobalToast]);

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 60 }}>
        <div style={{ fontSize: 14, color: C.textMut }}>Loading report settings...</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.text }}>Daily Email Reports</h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: C.textMut }}>
            Configure automated daily email summaries for your team
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="secondary" size="sm" onClick={() => setShowPreview(true)}>
            Preview Report
          </Btn>
          <Btn size="sm" onClick={handleSave} disabled={saving || !dirty}>
            {saving ? "Saving..." : "Save Changes"}
          </Btn>
        </div>
      </div>

      {/* Enable/Disable Toggle */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Enable Daily Reports</div>
            <div style={{ fontSize: 12, color: C.textMut, marginTop: 2 }}>
              Send an automated summary email at your preferred time each day
            </div>
          </div>
          <button
            onClick={() => update("enabled", !config.enabled)}
            style={{
              width: 48, height: 28, borderRadius: 14, border: "none",
              background: config.enabled ? C.suc : C.border,
              position: "relative", cursor: "pointer", transition: "background 0.2s",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: 22, height: 22, borderRadius: 11,
                background: "#fff", position: "absolute", top: 3,
                left: config.enabled ? 23 : 3,
                transition: "left 0.2s",
                boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
              }}
            />
          </button>
        </div>
        {config.enabled && (
          <div style={{ marginTop: 12 }}>
            <Badge color="success" size="sm">Active</Badge>
          </div>
        )}
      </Card>

      {/* Send Time */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 4 }}>Send Time</div>
        <div style={{ fontSize: 12, color: C.textMut, marginBottom: 12 }}>
          Choose when the daily report should be sent
        </div>
        <div style={{ maxWidth: 220 }}>
          <CustomSelect
            value={config.sendTime}
            onChange={(v) => update("sendTime", v || "20:00")}
            options={TIME_OPTIONS}
            placeholder="Select time..."
            small
          />
        </div>
      </Card>

      {/* Recipients */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 4 }}>Recipients</div>
        <div style={{ fontSize: 12, color: C.textMut, marginBottom: 12 }}>
          Add email addresses that will receive the daily report
        </div>

        {/* Add email input */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => { setNewEmail(e.target.value); setEmailError(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addRecipient(); } }}
              placeholder="team@k9operations.com"
              style={{
                width: "100%", padding: "9px 14px",
                border: `1.5px solid ${emailError ? C.dan : C.border}`,
                borderRadius: 10, fontSize: 14, fontFamily: "inherit",
                color: C.text, background: C.surface, outline: "none",
                transition: "border 0.15s", boxSizing: "border-box",
              }}
              onFocus={(e) => (e.target.style.borderColor = emailError ? C.dan : C.pri)}
              onBlur={(e) => (e.target.style.borderColor = emailError ? C.dan : C.border)}
            />
          </div>
          <Btn variant="secondary" size="sm" onClick={addRecipient} style={{ whiteSpace: "nowrap" }}>
            Add
          </Btn>
        </div>
        {emailError && (
          <div style={{ fontSize: 12, color: C.dan, marginTop: -8, marginBottom: 8 }}>{emailError}</div>
        )}

        {/* Recipients list */}
        {config.recipients.length === 0 ? (
          <div style={{ padding: "16px 0", textAlign: "center", fontSize: 13, color: C.textMut }}>
            No recipients added yet
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {config.recipients.map((email) => (
              <div
                key={email}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  padding: "6px 12px", borderRadius: 20,
                  background: C.priLt, fontSize: 13, fontWeight: 500, color: C.pri,
                }}
              >
                <span>{email}</span>
                <button
                  onClick={() => removeRecipient(email)}
                  style={{
                    border: "none", background: "none", cursor: "pointer",
                    color: C.pri, padding: 0, display: "flex", alignItems: "center",
                    fontSize: 16, lineHeight: 1, opacity: 0.6,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.6")}
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Report Sections */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 4 }}>Report Sections</div>
        <div style={{ fontSize: 12, color: C.textMut, marginBottom: 16 }}>
          Choose which sections to include in the daily email
        </div>
        {SECTION_OPTIONS.map((sec) => (
          <div
            key={sec.key}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "12px 0",
              borderBottom: `1px solid ${C.borderLight}`,
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{sec.label}</div>
              <div style={{ fontSize: 12, color: C.textMut, marginTop: 1 }}>{sec.desc}</div>
            </div>
            <button
              onClick={() => toggleSection(sec.key)}
              style={{
                width: 40, height: 24, borderRadius: 12, border: "none",
                background: config.sections[sec.key] ? C.pri : C.border,
                position: "relative", cursor: "pointer", transition: "background 0.2s",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: 18, height: 18, borderRadius: 9,
                  background: "#fff", position: "absolute", top: 3,
                  left: config.sections[sec.key] ? 19 : 3,
                  transition: "left 0.2s",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
                }}
              />
            </button>
          </div>
        ))}
      </Card>

      {/* Test Email */}
      <Card style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Test Email</div>
            <div style={{ fontSize: 12, color: C.textMut, marginTop: 2 }}>
              Send a test email with today's data to verify the report
            </div>
          </div>
          <Btn variant="accent" size="sm" onClick={handleTestEmail}>
            Send Test Email
          </Btn>
        </div>
      </Card>

      {/* Preview Modal */}
      {showPreview && (
        <Modal title="Email Report Preview" onClose={() => setShowPreview(false)} wide>
          <div style={{ marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <Badge color="info" size="sm">Preview</Badge>
              <span style={{ marginLeft: 8, fontSize: 13, color: C.textMut }}>
                Using today's data ({fmtDate(todayStr())})
              </span>
            </div>
            <Btn variant="accent" size="sm" onClick={handleTestEmail}>
              Send Test Email
            </Btn>
          </div>
          <div
            style={{
              border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden",
              background: "#F5F6F8",
            }}
          >
            <div
              style={{ width: "100%", minHeight: 500 }}
              dangerouslySetInnerHTML={{ __html: previewHTML }}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
