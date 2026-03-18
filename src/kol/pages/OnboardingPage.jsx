// K9 Operations — Onboarding Wizard
// Multi-step: Account → Resort Info → Gingr API → Plan/Payment → Auto-Provision

import React, { useState, useCallback } from "react";
import { supabase } from "../../supabaseClient";
import { C } from "../../shared/theme";

const STEPS = [
  { key: "account", label: "Account", icon: "1" },
  { key: "resort", label: "Resort Info", icon: "2" },
  { key: "gingr", label: "Gingr API", icon: "3" },
  { key: "plan", label: "Plan", icon: "4" },
  { key: "provision", label: "Go Live", icon: "5" },
];

// ── Inline PricingCards (lightweight version for onboarding step) ──────────
const PLANS = [
  { id: "single_location", name: "Starter", subtitle: "Single Location", price: 149, period: "mo", popular: false },
  { id: "multi_location_3", name: "Growth", subtitle: "Up to 3 Locations", price: 349, period: "mo", popular: true },
  { id: "multi_location_10", name: "Scale", subtitle: "Up to 10 Locations", price: 799, period: "mo", popular: false },
  { id: "enterprise", name: "Enterprise", subtitle: "Unlimited", price: null, period: null, popular: false },
];

// ── Step progress bar ─────────────────────────────────────────────────────
function StepIndicator({ currentStep }) {
  const idx = STEPS.findIndex(s => s.key === currentStep);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0, padding: "32px 24px 8px" }}>
      {STEPS.map((step, i) => {
        const done = i < idx;
        const active = i === idx;
        return (
          <React.Fragment key={step.key}>
            {i > 0 && (
              <div style={{
                width: 48, height: 2, background: done ? C.acc : "rgba(255,255,255,0.15)",
                transition: "background 0.3s",
              }} />
            )}
            <div style={{
              width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14, fontWeight: 700, flexShrink: 0, transition: "all 0.3s",
              background: done ? C.acc : active ? "#fff" : "rgba(255,255,255,0.12)",
              color: done ? "#fff" : active ? C.pri : "rgba(255,255,255,0.4)",
              border: active ? `2px solid ${C.acc}` : "2px solid transparent",
              boxShadow: active ? `0 0 0 4px rgba(132,204,22,0.2)` : "none",
            }}>
              {done ? (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M4 8l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ) : step.icon}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ── Reusable input ────────────────────────────────────────────────────────
function Field({ label, value, onChange, placeholder, type = "text", required, helpText }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 6 }}>
        {label} {required && <span style={{ color: C.dan }}>*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%", padding: "12px 16px", borderRadius: 12, border: `1.5px solid ${C.border}`,
          fontSize: 15, fontFamily: "inherit", outline: "none", background: "#fff",
          transition: "border-color 0.15s", boxSizing: "border-box",
        }}
        onFocus={e => { e.target.style.borderColor = C.pri; }}
        onBlur={e => { e.target.style.borderColor = C.border; }}
      />
      {helpText && <div style={{ fontSize: 12, color: C.textMut, marginTop: 4 }}>{helpText}</div>}
    </div>
  );
}

// ── Primary action button ─────────────────────────────────────────────────
function PrimaryBtn({ children, onClick, disabled, loading, style = {} }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        padding: "14px 32px", borderRadius: 14, border: "none", fontSize: 15, fontWeight: 700,
        fontFamily: "inherit", cursor: disabled ? "not-allowed" : "pointer",
        background: disabled ? C.border : `linear-gradient(135deg, ${C.pri} 0%, #0D3B1E 100%)`,
        color: disabled ? C.textMut : "#fff", transition: "all 0.2s",
        opacity: loading ? 0.7 : 1, minWidth: 160, ...style,
      }}
    >
      {loading ? "Processing..." : children}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 1: Account
// ═══════════════════════════════════════════════════════════════════════════
function StepAccount({ formData, setField, onNext }) {
  const valid = formData.fullName?.trim() && formData.email?.trim();
  return (
    <div>
      <h2 style={{ fontSize: 26, fontWeight: 800, color: "#fff", margin: "0 0 8px" }}>Create Your Account</h2>
      <p style={{ fontSize: 15, color: "rgba(255,255,255,0.6)", margin: "0 0 32px" }}>
        Let's get you set up with K9 Operations.
      </p>
      <div style={{ background: "#fff", borderRadius: 20, padding: "32px 28px", boxShadow: "0 8px 32px rgba(0,0,0,0.08)" }}>
        <Field label="Full Name" value={formData.fullName || ""} onChange={v => setField("fullName", v)} placeholder="Jane Smith" required />
        <Field label="Email" value={formData.email || ""} onChange={v => setField("email", v)} placeholder="jane@resort.com" type="email" required />
        <Field label="Phone" value={formData.phone || ""} onChange={v => setField("phone", v)} placeholder="(555) 123-4567" type="tel" />
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
          <PrimaryBtn onClick={onNext} disabled={!valid}>Continue</PrimaryBtn>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 2: Resort Info
// ═══════════════════════════════════════════════════════════════════════════
function StepResort({ formData, setField, onNext, onBack }) {
  const valid = formData.resortName?.trim() && formData.city?.trim() && formData.state?.trim();
  return (
    <div>
      <h2 style={{ fontSize: 26, fontWeight: 800, color: "#fff", margin: "0 0 8px" }}>Tell Us About Your Resort</h2>
      <p style={{ fontSize: 15, color: "rgba(255,255,255,0.6)", margin: "0 0 32px" }}>
        We'll use this to configure your location.
      </p>
      <div style={{ background: "#fff", borderRadius: 20, padding: "32px 28px", boxShadow: "0 8px 32px rgba(0,0,0,0.08)" }}>
        <Field label="Resort / Facility Name" value={formData.resortName || ""} onChange={v => setField("resortName", v)} placeholder="Bark Avenue Pet Resort" required />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <Field label="City" value={formData.city || ""} onChange={v => setField("city", v)} placeholder="Austin" required />
          <Field label="State" value={formData.state || ""} onChange={v => setField("state", v)} placeholder="TX" required />
        </div>
        <Field label="Address" value={formData.address || ""} onChange={v => setField("address", v)} placeholder="123 Main St" />
        <Field label="Website" value={formData.website || ""} onChange={v => setField("website", v)} placeholder="https://barkavenue.com" type="url" />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
          <button onClick={onBack} style={{ padding: "12px 24px", borderRadius: 12, border: "none", background: "transparent", color: C.textMut, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Back</button>
          <PrimaryBtn onClick={onNext} disabled={!valid}>Continue</PrimaryBtn>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 3: Gingr API Setup
// ═══════════════════════════════════════════════════════════════════════════
function StepGingr({ formData, setField, onNext, onBack }) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // { ok, message }

  const handleTest = useCallback(async () => {
    if (!formData.gingrSubdomain || !formData.gingrApiKey) return;
    setTesting(true);
    setTestResult(null);
    try {
      const url = `https://${formData.gingrSubdomain}.gingrapp.com/api/v1/back_of_house?key=${formData.gingrApiKey}&location_id=${formData.gingrLocationId || "1"}&full_day=true`;
      const resp = await fetch(url);
      if (resp.ok) {
        setTestResult({ ok: true, message: "Connection successful!" });
      } else {
        setTestResult({ ok: false, message: `API returned ${resp.status}. Check credentials.` });
      }
    } catch {
      setTestResult({ ok: false, message: "Could not reach Gingr. Check subdomain." });
    } finally {
      setTesting(false);
    }
  }, [formData.gingrSubdomain, formData.gingrApiKey, formData.gingrLocationId]);

  return (
    <div>
      <h2 style={{ fontSize: 26, fontWeight: 800, color: "#fff", margin: "0 0 8px" }}>Connect Gingr PMS</h2>
      <p style={{ fontSize: 15, color: "rgba(255,255,255,0.6)", margin: "0 0 32px" }}>
        Link your Gingr account for real-time data sync. You can skip this and configure later.
      </p>
      <div style={{ background: "#fff", borderRadius: 20, padding: "32px 28px", boxShadow: "0 8px 32px rgba(0,0,0,0.08)" }}>
        <Field
          label="Gingr Subdomain"
          value={formData.gingrSubdomain || ""}
          onChange={v => setField("gingrSubdomain", v)}
          placeholder="yourresort"
          helpText="The part before .gingrapp.com (e.g., 'yourresort' from yourresort.gingrapp.com)"
        />
        <Field
          label="API Key"
          value={formData.gingrApiKey || ""}
          onChange={v => setField("gingrApiKey", v)}
          placeholder="Your Gingr API key"
          helpText="Found in Gingr → Settings → API"
        />
        <Field
          label="Gingr Location ID"
          value={formData.gingrLocationId || ""}
          onChange={v => setField("gingrLocationId", v)}
          placeholder="1"
          helpText="Usually '1' for single-location setups"
        />

        {/* Test Connection */}
        <div style={{ marginBottom: 20 }}>
          <button
            onClick={handleTest}
            disabled={testing || !formData.gingrSubdomain || !formData.gingrApiKey}
            style={{
              padding: "10px 20px", borderRadius: 10, border: `1.5px solid ${C.pri}`,
              background: "transparent", color: C.pri, fontSize: 13, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit", opacity: testing ? 0.6 : 1,
            }}
          >
            {testing ? "Testing..." : "Test Connection"}
          </button>
          {testResult && (
            <span style={{ marginLeft: 12, fontSize: 13, fontWeight: 600, color: testResult.ok ? C.suc : C.dan }}>
              {testResult.message}
            </span>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
          <button onClick={onBack} style={{ padding: "12px 24px", borderRadius: 12, border: "none", background: "transparent", color: C.textMut, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Back</button>
          <div style={{ display: "flex", gap: 12 }}>
            <button
              onClick={onNext}
              style={{ padding: "12px 24px", borderRadius: 12, border: `1.5px solid ${C.border}`, background: "transparent", color: C.textSec, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
            >
              Skip for now
            </button>
            <PrimaryBtn onClick={onNext} disabled={!formData.gingrSubdomain || !formData.gingrApiKey}>
              Continue
            </PrimaryBtn>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 4: Plan Selection
// ═══════════════════════════════════════════════════════════════════════════
function StepPlan({ formData, setField, onNext, onBack, profile, addGlobalToast }) {
  const [loading, setLoading] = useState(null);

  const handleSelect = useCallback(async (planId) => {
    if (planId === "enterprise") {
      window.open("mailto:sales@k9operations.com?subject=Enterprise%20Plan%20Inquiry", "_blank");
      return;
    }
    setField("selectedPlan", planId);
    setLoading(planId);

    try {
      const { data, error } = await supabase.functions.invoke("stripe-checkout", {
        body: {
          plan_type: planId,
          user_id: profile?.id,
          success_url: `${window.location.origin}/lite/onboarding?step=provision&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${window.location.origin}/lite/onboarding?step=plan`,
        },
      });
      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No checkout URL");
      }
    } catch (err) {
      console.log("[Onboarding] Checkout error:", err.message);
      addGlobalToast?.("Failed to start checkout. Please try again.", "error");
    } finally {
      setLoading(null);
    }
  }, [profile?.id, addGlobalToast, setField]);

  return (
    <div>
      <h2 style={{ fontSize: 26, fontWeight: 800, color: "#fff", margin: "0 0 8px" }}>Choose Your Plan</h2>
      <p style={{ fontSize: 15, color: "rgba(255,255,255,0.6)", margin: "0 0 32px" }}>
        All plans include a 14-day free trial. No credit card required to start.
      </p>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center" }}>
        {PLANS.map(plan => {
          const pop = plan.popular;
          return (
            <div
              key={plan.id}
              style={{
                flex: "1 1 200px", maxWidth: 220, background: "#fff", borderRadius: 16,
                padding: "24px 20px", border: pop ? `2px solid ${C.acc}` : `1px solid ${C.borderLight}`,
                boxShadow: pop ? `0 12px 40px rgba(132,204,22,0.12)` : "0 4px 16px rgba(0,0,0,0.05)",
                textAlign: "center",
              }}
            >
              {pop && (
                <div style={{ fontSize: 10, fontWeight: 800, color: C.acc, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>
                  Most Popular
                </div>
              )}
              <div style={{ fontSize: 12, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.06em" }}>{plan.name}</div>
              <div style={{ fontSize: 11, color: C.textSec, marginBottom: 12 }}>{plan.subtitle}</div>
              {plan.price !== null ? (
                <div style={{ marginBottom: 16 }}>
                  <span style={{ fontSize: 36, fontWeight: 800, color: C.text }}>${plan.price}</span>
                  <span style={{ fontSize: 13, color: C.textMut }}>/{plan.period}</span>
                </div>
              ) : (
                <div style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 16 }}>Custom</div>
              )}
              <button
                onClick={() => handleSelect(plan.id)}
                disabled={loading === plan.id}
                style={{
                  width: "100%", padding: "10px 0", borderRadius: 10,
                  border: pop ? "none" : `1.5px solid ${C.pri}`,
                  background: pop ? C.pri : "transparent",
                  color: pop ? "#fff" : C.pri,
                  fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                  opacity: loading === plan.id ? 0.6 : 1,
                }}
              >
                {loading === plan.id ? "Loading..." : plan.id === "enterprise" ? "Contact Sales" : "Select"}
              </button>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "center", marginTop: 24 }}>
        <button onClick={onBack} style={{ padding: "12px 24px", borderRadius: 12, border: "none", background: "transparent", color: "rgba(255,255,255,0.5)", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Back</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 5: Auto-Provision
// ═══════════════════════════════════════════════════════════════════════════
function StepProvision({ formData, profile, addGlobalToast, nav }) {
  const [status, setStatus] = useState("provisioning"); // provisioning | done | error
  const [message, setMessage] = useState("Setting up your account...");
  const provisionedRef = React.useRef(false);

  React.useEffect(() => {
    if (provisionedRef.current) return;
    provisionedRef.current = true;

    (async () => {
      try {
        // 1. Create location record
        setMessage("Creating your location...");
        const locationId = crypto.randomUUID();
        const slug = (formData.resortName || "location")
          .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);

        const { error: locErr } = await supabase.from("lite_locations").upsert({
          id: locationId,
          name: formData.resortName || "My Resort",
          slug,
          city: formData.city || "",
          state: formData.state || "",
          address: formData.address || "",
          website: formData.website || "",
          owner_id: profile?.user_id || profile?.id,
        }, { onConflict: "id" });
        if (locErr) console.log("[Provision] location upsert:", locErr.message);

        // 2. Save Gingr config if provided
        if (formData.gingrSubdomain && formData.gingrApiKey) {
          setMessage("Configuring Gingr integration...");
          await supabase.from("lite_settings").upsert({
            location_id: locationId,
            setting_key: "gingr_config",
            setting_value: {
              subdomain: formData.gingrSubdomain,
              api_key: formData.gingrApiKey,
              gingr_location_id: formData.gingrLocationId || "1",
            },
          }, { onConflict: "location_id,setting_key" });
        }

        // 3. Link profile to location
        setMessage("Linking your profile...");
        if (profile?.id) {
          await supabase.from("lite_profiles").update({
            location_id: locationId,
            full_name: formData.fullName || profile.full_name,
          }).eq("id", profile.id);
        }

        setMessage("You're all set!");
        setStatus("done");
      } catch (err) {
        console.log("[Provision] error:", err.message);
        setMessage("Something went wrong. Please contact support.");
        setStatus("error");
        addGlobalToast?.("Provisioning failed. Please contact support.", "error");
      }
    })();
  }, [formData, profile, addGlobalToast]);

  return (
    <div style={{ textAlign: "center" }}>
      {status === "provisioning" && (
        <>
          <div style={{ margin: "0 auto 24px", width: 64, height: 64 }}>
            <svg width="64" height="64" viewBox="0 0 64 64">
              <circle cx="32" cy="32" r="28" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="4" />
              <circle cx="32" cy="32" r="28" fill="none" stroke={C.acc} strokeWidth="4" strokeLinecap="round" strokeDasharray="80 100">
                <animateTransform attributeName="transform" type="rotate" from="0 32 32" to="360 32 32" dur="1s" repeatCount="indefinite"/>
              </circle>
            </svg>
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: "#fff", margin: "0 0 12px" }}>Setting Up Your Resort</h2>
          <p style={{ fontSize: 15, color: "rgba(255,255,255,0.6)" }}>{message}</p>
        </>
      )}
      {status === "done" && (
        <>
          <div style={{ margin: "0 auto 24px", width: 80, height: 80, borderRadius: "50%", background: C.acc, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <path d="M12 20l6 6 10-10" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h2 style={{ fontSize: 28, fontWeight: 800, color: "#fff", margin: "0 0 12px" }}>Welcome to K9 Operations!</h2>
          <p style={{ fontSize: 16, color: "rgba(255,255,255,0.7)", margin: "0 0 32px", maxWidth: 400, marginLeft: "auto", marginRight: "auto" }}>
            Your resort is ready. Let's start managing your operations.
          </p>
          <PrimaryBtn
            onClick={() => { nav?.("dashboard"); }}
            style={{ background: `linear-gradient(135deg, ${C.acc} 0%, ${C.accDk} 100%)`, fontSize: 16, padding: "16px 40px" }}
          >
            Go to Dashboard
          </PrimaryBtn>
        </>
      )}
      {status === "error" && (
        <>
          <div style={{ margin: "0 auto 24px", width: 80, height: 80, borderRadius: "50%", background: C.danLt, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <path d="M14 14l12 12M26 14l-12 12" stroke={C.dan} strokeWidth="3" strokeLinecap="round"/>
            </svg>
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: "#fff", margin: "0 0 12px" }}>Setup Issue</h2>
          <p style={{ fontSize: 15, color: "rgba(255,255,255,0.6)" }}>{message}</p>
          <a href="mailto:support@k9operations.com" style={{ color: C.acc, fontWeight: 600, fontSize: 14, marginTop: 16, display: "inline-block" }}>
            Contact Support
          </a>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Main OnboardingPage
// ═══════════════════════════════════════════════════════════════════════════
export default function OnboardingPage({ profile, addGlobalToast, nav }) {
  // Parse step from URL query param if returning from Stripe
  const urlParams = new URLSearchParams(window.location.search);
  const initialStep = urlParams.get("step") || "account";

  const [step, setStep] = useState(initialStep);
  const [formData, setFormData] = useState({
    fullName: profile?.full_name || "",
    email: profile?.email || "",
    phone: "",
    resortName: "",
    city: "",
    state: "",
    address: "",
    website: "",
    gingrSubdomain: "",
    gingrApiKey: "",
    gingrLocationId: "1",
    selectedPlan: null,
  });

  const setField = useCallback((key, val) => {
    setFormData(prev => ({ ...prev, [key]: val }));
  }, []);

  const goNext = useCallback(() => {
    const idx = STEPS.findIndex(s => s.key === step);
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1].key);
  }, [step]);

  const goBack = useCallback(() => {
    const idx = STEPS.findIndex(s => s.key === step);
    if (idx > 0) setStep(STEPS[idx - 1].key);
  }, [step]);

  return (
    <div style={{
      minHeight: "100vh",
      background: `linear-gradient(180deg, ${C.pri} 0%, #0D3B1E 50%, ${C.bg} 100%)`,
      fontFamily: "'Outfit', sans-serif",
    }}>
      {/* Logo */}
      <div style={{ textAlign: "center", paddingTop: 32 }}>
        <img src="/k9-logo-full.svg" alt="K9 Operations" style={{ height: 40, filter: "brightness(0) invert(1)" }} />
      </div>

      {/* Step Indicator */}
      <StepIndicator currentStep={step} />

      {/* Step label */}
      <div style={{ textAlign: "center", padding: "8px 24px 24px", fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
        Step {STEPS.findIndex(s => s.key === step) + 1} of {STEPS.length} — {STEPS.find(s => s.key === step)?.label}
      </div>

      {/* Content */}
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "0 24px 80px" }}>
        {step === "account" && <StepAccount formData={formData} setField={setField} onNext={goNext} />}
        {step === "resort" && <StepResort formData={formData} setField={setField} onNext={goNext} onBack={goBack} />}
        {step === "gingr" && <StepGingr formData={formData} setField={setField} onNext={goNext} onBack={goBack} />}
        {step === "plan" && <StepPlan formData={formData} setField={setField} onNext={goNext} onBack={goBack} profile={profile} addGlobalToast={addGlobalToast} />}
        {step === "provision" && <StepProvision formData={formData} profile={profile} addGlobalToast={addGlobalToast} nav={nav} />}
      </div>
    </div>
  );
}
