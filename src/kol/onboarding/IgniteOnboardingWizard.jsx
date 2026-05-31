// IgniteOnboardingWizard — self-serve Ignite setup for a location.
//
// Answers a few questions, then *actually wires the backend*: it writes the real
// `ignite_config` row (location_id + ignite_profile_id + inbound_email +
// is_active) that the ignite-webhook edge function reads to route leads, mirrors
// the legacy lite_settings blob, and runs a live end-to-end test through the
// deployed webhook. No developer / SQL required.
//
// Used from the CRM page (setup banner) and Settings → Ignite. Pure logic +
// payloads live in ./igniteOnboarding (unit-tested).
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabaseClient";
import { C } from "../../shared/theme";
import { I } from "../../shared/icons";
import { Btn, Modal } from "../../shared/ui";
import { BOOKING_FORM_SENDER_EMAIL } from "../../ignite/constants.js";
import {
  WIZARD_STEPS,
  stepIndex,
  canAdvance,
  validateProfileId,
  validateInboundEmail,
  buildIgniteConfigPayload,
  buildLiteSettingsValue,
  deriveConfigStatus,
  buildTestEmail,
  interpretTestResult,
  igniteWebhookUrl,
  TEST_SAMPLES,
} from "./igniteOnboarding";

const WORKING_STEPS = ["profile", "forwarding", "activate"];

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "11px 14px",
  borderRadius: 9,
  border: `1.5px solid ${C.border}`,
  background: C.bg,
  color: C.text,
  fontSize: 14,
  fontWeight: 600,
  fontFamily: "inherit",
  outline: "none",
};

const labelStyle = { fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 6 };
const helpStyle = { fontSize: 12.5, color: C.textSec, lineHeight: 1.6, marginBottom: 12 };

function CopyField({ value }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 8, background: C.surfaceHover, border: `1px solid ${C.border}` }}>
      <code style={{ flex: 1, fontSize: 12, color: C.text, fontFamily: "monospace", wordBreak: "break-all", userSelect: "all" }}>{value}</code>
      <button
        type="button"
        onClick={() => {
          try {
            navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* clipboard unavailable */
          }
        }}
        style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, color: copied ? C.pri : C.textSec, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function ResultBanner({ tone, children }) {
  const map = {
    success: { bg: C.sucLt, fg: C.suc, bd: `${C.suc}33` },
    error: { bg: C.danLt, fg: C.dan, bd: `${C.dan}33` },
    info: { bg: C.priLt, fg: C.pri, bd: `${C.pri}22` },
  };
  const s = map[tone] || map.info;
  return (
    <div style={{ padding: "10px 14px", borderRadius: 9, fontSize: 12.5, lineHeight: 1.5, background: s.bg, color: s.fg, border: `1px solid ${s.bd}`, fontWeight: 600 }}>
      {children}
    </div>
  );
}

export default function IgniteOnboardingWizard({ locationId, profile, onClose, onComplete }) {
  const [stepId, setStepId] = useState("intro");
  const [profileId, setProfileId] = useState("");
  const [inboundEmail, setInboundEmail] = useState("");
  const [gmailConfirmed, setGmailConfirmed] = useState(false);
  const [testSample, setTestSample] = useState("web_form");

  const [locationName, setLocationName] = useState("");
  const [existingStatus, setExistingStatus] = useState("not_configured");
  const [loaded, setLoaded] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [activated, setActivated] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const webhookUrl = useMemo(() => igniteWebhookUrl(import.meta.env.VITE_SUPABASE_URL || ""), []);

  // Prefill from any existing config + the location name.
  useEffect(() => {
    let cancelled = false;
    if (!locationId) {
      setLoaded(true);
      return undefined;
    }
    (async () => {
      const [{ data: cfg }, { data: loc }] = await Promise.all([
        supabase.from("ignite_config").select("*").eq("location_id", locationId).limit(1),
        supabase.from("locations").select("name").eq("id", locationId).limit(1),
      ]);
      if (cancelled) return;
      const row = cfg && cfg[0];
      if (row) {
        if (row.ignite_profile_id) setProfileId(row.ignite_profile_id);
        if (row.inbound_email) setInboundEmail(row.inbound_email);
        setExistingStatus(deriveConfigStatus(row));
      }
      if (loc && loc[0] && loc[0].name) setLocationName(loc[0].name);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [locationId]);

  const idx = stepIndex(stepId);
  const goNext = useCallback(() => {
    const next = WIZARD_STEPS[Math.min(idx + 1, WIZARD_STEPS.length - 1)];
    if (next) setStepId(next.id);
  }, [idx]);
  const goBack = useCallback(() => {
    const prev = WIZARD_STEPS[Math.max(idx - 1, 0)];
    if (prev) setStepId(prev.id);
  }, [idx]);

  const draft = { profileId, inboundEmail };
  const advanceOk = canAdvance(stepId, draft);

  const saveConfig = useCallback(async () => {
    const payload = buildIgniteConfigPayload({ locationId, profileId, inboundEmail, isActive: true });
    const { data: existing } = await supabase.from("ignite_config").select("id").eq("location_id", locationId).limit(1);
    const res =
      existing && existing.length
        ? await supabase.from("ignite_config").update(payload).eq("id", existing[0].id)
        : await supabase.from("ignite_config").insert(payload);
    if (res.error) throw res.error;
    // Best-effort mirror so the legacy Ignite settings tab reflects the same state.
    await supabase
      .from("lite_settings")
      .upsert(
        {
          location_id: locationId,
          setting_key: "ignite_config",
          setting_value: buildLiteSettingsValue({ profileId, inboundEmail, connected: true }),
          updated_by: (profile && profile.id) || null,
        },
        { onConflict: "location_id,setting_key" }
      );
  }, [locationId, profileId, inboundEmail, profile]);

  const runTest = useCallback(async () => {
    const body = buildTestEmail(TEST_SAMPLES[testSample], profileId);
    const resp = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    let data = {};
    try {
      data = await resp.json();
    } catch {
      /* non-JSON response */
    }
    return interpretTestResult({ ok: resp.ok, status: resp.status, data });
  }, [webhookUrl, testSample, profileId]);

  const activateAndTest = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    setSaveError("");
    setTestResult(null);
    try {
      await saveConfig();
      setActivated(true);
    } catch (e) {
      setSaveError(e.message || "Couldn't save the configuration.");
      setSaving(false);
      return;
    }
    try {
      setTestResult(await runTest());
    } catch (e) {
      setTestResult({ success: false, message: e.message || "Network error during the test." });
    }
    setSaving(false);
  }, [saving, saveConfig, runTest]);

  const finish = useCallback(() => {
    if (typeof onComplete === "function") onComplete({ profileId, status: "active" });
    else if (typeof onClose === "function") onClose();
  }, [onComplete, onClose, profileId]);

  const locLabel = locationName || "this location";

  // ── Step bodies ────────────────────────────────────────────────────────────
  let bodyEl = null;
  if (!loaded) {
    bodyEl = <div style={{ padding: "40px 0", textAlign: "center", color: C.textMut, fontSize: 13 }}>Loading…</div>;
  } else if (!locationId) {
    bodyEl = (
      <ResultBanner tone="error">
        No location is selected for your profile, so there's nowhere to connect Ignite. Pick a location first, then reopen this wizard.
      </ResultBanner>
    );
  } else if (stepId === "intro") {
    bodyEl = (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 11, background: `${C.pri}12`, display: "flex", alignItems: "center", justifyContent: "center", color: C.pri }}>
            <I.Sparkle />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>Connect Ignite for {locLabel}</div>
            <div style={{ fontSize: 12.5, color: C.textSec }}>Answer a couple of questions and we'll wire it up — no developer needed.</div>
          </div>
        </div>
        {existingStatus === "active" && (
          <ResultBanner tone="success">This location is already connected. You can update the Profile ID or forwarding address below.</ResultBanner>
        )}
        <div style={{ fontSize: 12.5, color: C.textSec, lineHeight: 1.7 }}>
          We'll:
          <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
            <li>Save this location's Ignite Profile ID so leads route to {locLabel}</li>
            <li>Show you the one-time email-forwarding setup</li>
            <li>Send a live test lead through the real pipeline to confirm it works</li>
          </ul>
        </div>
      </div>
    );
  } else if (stepId === "profile") {
    const v = validateProfileId(profileId);
    bodyEl = (
      <div>
        <div style={labelStyle}>What's {locLabel}'s Ignite Profile ID?</div>
        <div style={helpStyle}>
          The unique ID for this location in your iDigital Strategies (Ignite) account, used to route phone-lead emails.
        </div>
        <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.7, marginBottom: 12, padding: "10px 12px", background: C.surfaceHover, border: `1px solid ${C.border}`, borderRadius: 9 }}>
          <strong style={{ color: C.text }}>Where to find it:</strong>
          <ol style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            <li>Sign in to your iDigital Strategies / Ignite dashboard.</li>
            <li>Open this location's profile (Settings → Account).</li>
            <li>Copy the <em>Profile ID / Account ID</em> — it's the number shown on lead notification emails.</li>
          </ol>
          <div style={{ marginTop: 4, color: C.textMut }}>Booking-form-only locations can leave the prefilled value or a placeholder.</div>
        </div>
        <input value={profileId} onChange={(e) => setProfileId(e.target.value)} placeholder="e.g. 156865" style={inputStyle} autoFocus />
        {!v.ok && profileId.length > 0 && <div style={{ fontSize: 12, color: C.dan, marginTop: 6 }}>{v.error}</div>}
      </div>
    );
  } else if (stepId === "forwarding") {
    const v = validateInboundEmail(inboundEmail);
    bodyEl = (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <div style={labelStyle}>What's {locLabel}'s customer-facing email address?</div>
          <div style={helpStyle}>
            The inbox your website's booking / availability form submissions arrive in — the address on your Contact &amp; Booking page. We pull new
            submissions from here into the CRM.
          </div>
          <input value={inboundEmail} onChange={(e) => setInboundEmail(e.target.value)} placeholder="cherryhill@k9resorts.com" style={inputStyle} />
          {!v.ok && <div style={{ fontSize: 12, color: C.dan, marginTop: 6 }}>{v.error}</div>}
        </div>

        <div>
          <div style={{ ...labelStyle, marginBottom: 8 }}>One-time forwarding (Outlook)</div>
          <div style={{ fontSize: 12.5, color: C.textSec, lineHeight: 1.75 }}>
            Add a rule in that inbox to forward booking-form emails straight into K9 Ops — no personal inbox in between, forward directly.
            <ol style={{ margin: "8px 0 0", paddingLeft: 18 }}>
              <li>Sign in to Outlook / Microsoft 365 for <strong style={{ color: C.text }}>{inboundEmail || "this inbox"}</strong>.</li>
              <li>Settings (gear) → <strong style={{ color: C.text }}>Mail → Rules → Add new rule</strong>.</li>
              <li>Condition: <strong style={{ color: C.text }}>From</strong> includes <span style={{ fontWeight: 700, color: C.pri }}>{BOOKING_FORM_SENDER_EMAIL}</span> (or <strong style={{ color: C.text }}>Subject</strong> includes “Form Submission”).</li>
              <li>Action: <strong style={{ color: C.text }}>Forward to</strong> your K9 Ops inbound address.</li>
              <li>Save — new submissions now flow straight into this CRM.</li>
            </ol>
          </div>
          <div style={{ marginTop: 8, fontSize: 11.5, color: C.textMut }}>Advanced (Resend side): the inbound address delivers to this webhook —</div>
          <div style={{ marginTop: 6 }}>
            <CopyField value={webhookUrl} />
          </div>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 12.5, color: C.textSec, cursor: "pointer" }}>
          <input type="checkbox" checked={gmailConfirmed} onChange={(e) => setGmailConfirmed(e.target.checked)} style={{ width: 16, height: 16, accentColor: C.pri }} />
          I've set up the Outlook forwarding rule (or I'll handle it later)
        </label>
      </div>
    );
  } else if (stepId === "activate") {
    bodyEl = (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: 12.5, color: C.textSec, lineHeight: 1.7 }}>
          We'll save Ignite config for <strong style={{ color: C.text }}>{locLabel}</strong> (Profile{" "}
          <strong style={{ color: C.text }}>{profileId || "—"}</strong>), mark it active, and push a sample lead through the live pipeline to prove it
          works end-to-end.
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <select
            value={testSample}
            onChange={(e) => setTestSample(e.target.value)}
            style={{ padding: "9px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13, fontFamily: "inherit" }}
          >
            <option value="web_form">Sample: Web form lead</option>
            <option value="phone_call">Sample: Phone call lead</option>
            <option value="ad_click">Sample: Ad click lead</option>
          </select>
          <Btn onClick={activateAndTest} disabled={saving} icon={<I.Send />}>
            {saving ? "Working…" : activated ? "Re-run live test" : "Save & run live test"}
          </Btn>
        </div>
        {saveError && <ResultBanner tone="error">{saveError}</ResultBanner>}
        {activated && !saveError && <ResultBanner tone="info">Config saved — Ignite is active for {locLabel}.</ResultBanner>}
        {testResult && <ResultBanner tone={testResult.success ? "success" : "error"}>{testResult.message}</ResultBanner>}
      </div>
    );
  } else if (stepId === "done") {
    bodyEl = (
      <div style={{ display: "flex", flexDirection: "column", gap: 16, textAlign: "center", alignItems: "center", padding: "8px 0" }}>
        <div style={{ width: 56, height: 56, borderRadius: 28, background: C.sucLt, display: "flex", alignItems: "center", justifyContent: "center", color: C.suc }}>
          <I.CheckCircle />
        </div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>Ignite is live for {locLabel}</div>
          <div style={{ fontSize: 13, color: C.textSec, marginTop: 4 }}>
            New booking & employment inquiries will now flow into your CRM automatically.
          </div>
        </div>
        <div style={{ width: "100%", textAlign: "left", display: "flex", flexDirection: "column", gap: 8, background: C.surfaceHover, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px" }}>
          <Row k="Profile ID" v={profileId || "—"} />
          <Row k="Status" v="Active" />
          {testResult && <Row k="Live test" v={testResult.success ? "Passed" : "Not confirmed"} />}
          <Row k="Customer email" v={inboundEmail || "Add your customer-facing inbox when ready"} />
        </div>
        {!testResult?.success && (
          <ResultBanner tone="info">
            Reminder: live submissions arrive once {inboundEmail || "your customer-facing inbox"} forwards booking-form emails into K9 Ops (the Outlook
            rule above). Everything on the K9 Ops side is set.
          </ResultBanner>
        )}
      </div>
    );
  }

  // ── Footer ───────────────────────────────────────────────────────────────
  const isWorking = WORKING_STEPS.includes(stepId);
  const workingPos = WORKING_STEPS.indexOf(stepId);

  let footer = null;
  if (loaded && locationId) {
    if (stepId === "intro") {
      footer = (
        <>
          <Btn variant="ghost" size="sm" onClick={onClose}>Cancel</Btn>
          <Btn size="sm" onClick={goNext} icon={<I.ChevronRight />}>Get started</Btn>
        </>
      );
    } else if (stepId === "done") {
      footer = (
        <>
          <Btn variant="ghost" size="sm" onClick={onClose}>Close</Btn>
          <Btn size="sm" onClick={finish}>Go to CRM</Btn>
        </>
      );
    } else {
      footer = (
        <>
          <Btn variant="ghost" size="sm" onClick={goBack}>Back</Btn>
          <div style={{ flex: 1 }} />
          {stepId === "activate" ? (
            <Btn size="sm" onClick={goNext} disabled={!activated}>Finish</Btn>
          ) : (
            <Btn size="sm" onClick={goNext} disabled={!advanceOk} icon={<I.ChevronRight />}>Continue</Btn>
          )}
        </>
      );
    }
  } else {
    footer = <Btn variant="ghost" size="sm" onClick={onClose}>Close</Btn>;
  }

  return (
    <Modal title="Ignite setup" onClose={onClose} wide>
      {isWorking && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
          {WORKING_STEPS.map((s, i) => (
            <React.Fragment key={s}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 800,
                    background: i <= workingPos ? C.pri : C.surfaceHover,
                    color: i <= workingPos ? "#fff" : C.textMut,
                    border: i <= workingPos ? "none" : `1px solid ${C.border}`,
                  }}
                >
                  {i + 1}
                </div>
                <span style={{ fontSize: 12, fontWeight: i === workingPos ? 800 : 600, color: i === workingPos ? C.text : C.textMut }}>
                  {WIZARD_STEPS[stepIndex(s)].title}
                </span>
              </div>
              {i < WORKING_STEPS.length - 1 && <div style={{ flex: 1, height: 1, background: C.border }} />}
            </React.Fragment>
          ))}
        </div>
      )}

      <div style={{ minHeight: 180 }}>{bodyEl}</div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 22, paddingTop: 16, borderTop: `1px solid ${C.borderLight}` }}>
        {footer}
      </div>
    </Modal>
  );
}

function Row({ k, v }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12.5 }}>
      <span style={{ color: C.textMut }}>{k}</span>
      <span style={{ color: C.text, fontWeight: 600, textAlign: "right", minWidth: 0 }}>{v}</span>
    </div>
  );
}
