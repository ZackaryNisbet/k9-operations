// K9 Operations — Self-Service Onboarding Wizard
// Multi-step flow: Account → Resort Info → Gingr API → Plan/Payment → Auto-Provision

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../../supabaseClient";
import { useAuth } from "../../AuthProvider";
import { C, gid } from "../../shared/theme";
import PricingPage from "./PricingPage";

const STEPS = [
  { id: "resort", label: "Resort Info", icon: "1" },
  { id: "gingr", label: "Gingr Setup", icon: "2" },
  { id: "plan", label: "Choose Plan", icon: "3" },
  { id: "provision", label: "Getting Ready", icon: "4" },
];

const US_TIMEZONES = [
  { value: "America/New_York", label: "Eastern Time (ET)" },
  { value: "America/Chicago", label: "Central Time (CT)" },
  { value: "America/Denver", label: "Mountain Time (MT)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
  { value: "America/Phoenix", label: "Arizona (no DST)" },
  { value: "Pacific/Honolulu", label: "Hawaii Time (HT)" },
  { value: "America/Anchorage", label: "Alaska Time (AKT)" },
];

// ─── Progress Indicator ─────────────────────────────────────────────────────
function StepIndicator({ steps, currentIdx }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      gap: 0, margin: "0 auto 48px", maxWidth: 560,
    }}>
      {steps.map((step, i) => {
        const isDone = i < currentIdx;
        const isActive = i === currentIdx;
        return (
          <React.Fragment key={step.id}>
            {i > 0 && (
              <div style={{
                flex: 1, height: 2, maxWidth: 60,
                background: isDone ? C.acc : "rgba(255,255,255,0.1)",
                transition: "background 0.4s",
              }} />
            )}
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
              opacity: isDone || isActive ? 1 : 0.4, transition: "opacity 0.3s",
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 12,
                background: isDone
                  ? C.acc
                  : isActive
                    ? "rgba(132,204,22,0.2)"
                    : "rgba(255,255,255,0.06)",
                border: isActive ? `2px solid ${C.acc}` : isDone ? "none" : "1px solid rgba(255,255,255,0.1)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 16, fontWeight: 800,
                color: isDone ? C.pri : isActive ? C.acc : "rgba(255,255,255,0.4)",
                transition: "all 0.3s",
              }}>
                {isDone ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.pri} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : step.icon}
              </div>
              <div style={{
                fontSize: 11, fontWeight: 600,
                color: isActive ? C.acc : "rgba(255,255,255,0.4)",
                whiteSpace: "nowrap",
              }}>
                {step.label}
              </div>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Step Card Wrapper ──────────────────────────────────────────────────────
function StepCard({ title, subtitle, children }) {
  return (
    <div style={{
      background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 24, padding: "40px 36px", maxWidth: 560, margin: "0 auto",
    }}>
      <h2 style={{ fontSize: 28, fontWeight: 900, color: "#fff", margin: "0 0 8px", lineHeight: 1.2 }}>
        {title}
      </h2>
      {subtitle && (
        <p style={{ fontSize: 15, color: "rgba(255,255,255,0.5)", margin: "0 0 32px", lineHeight: 1.5 }}>
          {subtitle}
        </p>
      )}
      {children}
    </div>
  );
}

// ─── Input Component ────────────────────────────────────────────────────────
function OnboardInput({ label, value, onChange, placeholder, type = "text", required, error }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.7)", marginBottom: 6 }}>
        {label} {required && <span style={{ color: C.acc }}>*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%", padding: "12px 16px",
          background: "rgba(255,255,255,0.06)", border: error ? `1px solid ${C.dan}` : "1px solid rgba(255,255,255,0.1)",
          borderRadius: 10, color: "#fff", fontSize: 15,
          outline: "none", transition: "border-color 0.2s",
          boxSizing: "border-box",
        }}
        onFocus={e => { e.target.style.borderColor = C.acc; }}
        onBlur={e => { e.target.style.borderColor = error ? C.dan : "rgba(255,255,255,0.1)"; }}
      />
      {error && <div style={{ fontSize: 12, color: C.dan, marginTop: 4 }}>{error}</div>}
    </div>
  );
}

function OnboardSelect({ label, value, onChange, options, required }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.7)", marginBottom: 6 }}>
        {label} {required && <span style={{ color: C.acc }}>*</span>}
      </label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: "100%", padding: "12px 16px",
          background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 10, color: "#fff", fontSize: 15,
          outline: "none", boxSizing: "border-box", appearance: "none",
        }}
      >
        <option value="">Select...</option>
        {options.map(o => (
          <option key={o.value} value={o.value} style={{ background: "#1a1a1a" }}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

// ─── Main Onboarding Component ──────────────────────────────────────────────
export default function OnboardingPage({ nav }) {
  const { user } = useAuth();
  const [step, setStep] = useState(0);

  // Check URL for step override (e.g., returning from Stripe checkout)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("step") === "provision") {
      setStep(3); // Jump to provision step
    }
  }, []);

  // Resort info
  const [resortName, setResortName] = useState("");
  const [resortAddress, setResortAddress] = useState("");
  const [resortPhone, setResortPhone] = useState("");
  const [resortTimezone, setResortTimezone] = useState("America/New_York");
  const [resortErrors, setResortErrors] = useState({});

  // Gingr
  const [gingrSubdomain, setGingrSubdomain] = useState("");
  const [gingrApiKey, setGingrApiKey] = useState("");
  const [gingrTesting, setGingrTesting] = useState(false);
  const [gingrTestResult, setGingrTestResult] = useState(null); // { success: bool, message: string }

  // Provision
  const [provisioning, setProvisioning] = useState(false);
  const [provisionDone, setProvisionDone] = useState(false);
  const [provisionError, setProvisionError] = useState(null);
  const [provisionSteps, setProvisionSteps] = useState([]);

  const currentIdx = step;

  // ─── Step 1: Resort Info ──────────────────────────────────────────────
  const validateResort = () => {
    const errors = {};
    if (!resortName.trim()) errors.name = "Resort name is required";
    if (!resortAddress.trim()) errors.address = "Address is required";
    if (!resortPhone.trim()) errors.phone = "Phone number is required";
    setResortErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleResortNext = () => {
    if (validateResort()) setStep(1);
  };

  // ─── Step 2: Gingr Setup ─────────────────────────────────────────────
  const testGingrConnection = async () => {
    setGingrTesting(true);
    setGingrTestResult(null);

    try {
      const url = `https://${gingrSubdomain.trim()}.gingrapp.com/api/v1/owners?key=${gingrApiKey.trim()}&limit=1`;
      const resp = await fetch(url);

      if (resp.ok) {
        const data = await resp.json();
        setGingrTestResult({
          success: true,
          message: `Connected! Found ${data.total || 0} owners in Gingr.`,
        });
      } else {
        const text = await resp.text();
        setGingrTestResult({
          success: false,
          message: `Connection failed (${resp.status}): ${text.slice(0, 100)}`,
        });
      }
    } catch (err) {
      setGingrTestResult({
        success: false,
        message: `Connection error: ${err.message}`,
      });
    } finally {
      setGingrTesting(false);
    }
  };

  const handleGingrNext = () => {
    if (gingrSubdomain.trim() && gingrApiKey.trim()) {
      setStep(2);
    }
  };

  // ─── Step 3: Plan selection ───────────────────────────────────────────
  const handlePlanSelected = (planId) => {
    // Store selected plan, then trigger Stripe checkout
    // The stripe-checkout function will redirect back with session_id
    handleStripeCheckout(planId);
  };

  const handleStripeCheckout = async (planId) => {
    try {
      const { data, error } = await supabase.functions.invoke("stripe-checkout", {
        body: {
          plan_type: planId,
          success_url: `${window.location.origin}/onboarding?step=provision`,
          cancel_url: `${window.location.origin}/onboarding`,
        },
      });

      if (error) throw error;
      if (data?.url) window.location.href = data.url;
    } catch (err) {
      console.error("Checkout error:", err);
    }
  };

  // ─── Step 4: Auto-Provision ───────────────────────────────────────────
  useEffect(() => {
    if (step !== 3 || provisioning || provisionDone) return;

    const provision = async () => {
      setProvisioning(true);
      setProvisionSteps([]);

      try {
        const addStep = (msg) => setProvisionSteps(prev => [...prev, msg]);

        // 1. Create location
        addStep("Creating your resort location...");
        const locationId = gid();
        const slug = resortName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "");

        const { error: locErr } = await supabase.from("locations").insert({
          id: locationId,
          name: resortName.trim(),
          slug: slug || `resort-${locationId.slice(0, 8)}`,
          address: resortAddress.trim(),
          phone: resortPhone.trim(),
          timezone: resortTimezone,
        });
        if (locErr) throw new Error(`Location: ${locErr.message}`);

        // 2. Create lite_settings defaults
        addStep("Configuring resort settings...");
        const settingsRows = [
          { location_id: locationId, setting_key: "resort_info", setting_value: { name: resortName, address: resortAddress, phone: resortPhone, timezone: resortTimezone } },
          { location_id: locationId, setting_key: "resort_policies", setting_value: { lapsedThresholdDays: 60, coldThresholdDays: 120 } },
        ];
        await supabase.from("lite_settings").upsert(settingsRows, { onConflict: "location_id,setting_key" });

        // 3. Store Gingr credentials
        if (gingrSubdomain.trim() && gingrApiKey.trim()) {
          addStep("Saving Gingr integration...");
          await supabase.from("k9_gingr_credentials").upsert({
            location_id: locationId,
            gingr_subdomain: gingrSubdomain.trim(),
            gingr_api_key: gingrApiKey.trim(),
          }, { onConflict: "location_id" });
        }

        // 4. Create location_roles entry (admin role)
        addStep("Setting up your admin access...");
        if (user?.id) {
          await supabase.from("location_roles").upsert({
            user_id: user.id,
            location_id: locationId,
            role: "enterprise_admin",
          }, { onConflict: "user_id,location_id" });

          // Update user profile with location_id
          await supabase.from("profiles").upsert({
            id: user.id,
            location_id: locationId,
          }, { onConflict: "id" });
        }

        // 5. Trigger initial Gingr sync
        if (gingrSubdomain.trim() && gingrApiKey.trim()) {
          addStep("Running initial Gingr sync...");
          try {
            await supabase.functions.invoke("gingr-sync", {
              body: { location_id: locationId, sync_type: "full" },
            });
          } catch (syncErr) {
            // Non-fatal — sync can be retried later
            console.log("Initial sync skipped:", syncErr);
          }
        }

        addStep("All set! Redirecting to your dashboard...");
        setProvisionDone(true);

        // Redirect to the app after a brief delay
        setTimeout(() => {
          window.location.href = `/lite/${slug}/dashboard`;
        }, 2000);
      } catch (err) {
        console.error("Provision error:", err);
        setProvisionError(err.message);
      } finally {
        setProvisioning(false);
      }
    };

    provision();
  }, [step, provisioning, provisionDone, resortName, resortAddress, resortPhone, resortTimezone, gingrSubdomain, gingrApiKey, user?.id]);

  // ─── Render ───────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: "100vh",
      background: `linear-gradient(180deg, ${C.pri} 0%, #0A1F12 60%, #050D08 100%)`,
      padding: "40px 24px 80px",
      fontFamily: "'Outfit', -apple-system, sans-serif",
    }}>
      {/* Logo */}
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <img src="/k9-logo-full.svg" alt="K9 Operations" style={{ height: 40, opacity: 0.9 }} />
      </div>

      <StepIndicator steps={STEPS} currentIdx={currentIdx} />

      {/* Step 1: Resort Info */}
      {step === 0 && (
        <StepCard
          title="Tell us about your resort"
          subtitle="We'll use this to set up your location in K9 Operations."
        >
          <OnboardInput
            label="Resort Name" value={resortName} onChange={setResortName}
            placeholder="K9 Resorts Cherry Hill" required error={resortErrors.name}
          />
          <OnboardInput
            label="Address" value={resortAddress} onChange={setResortAddress}
            placeholder="123 Main St, Cherry Hill, NJ 08034" required error={resortErrors.address}
          />
          <OnboardInput
            label="Phone" value={resortPhone} onChange={setResortPhone}
            placeholder="(856) 555-0123" type="tel" required error={resortErrors.phone}
          />
          <OnboardSelect
            label="Timezone" value={resortTimezone} onChange={setResortTimezone}
            options={US_TIMEZONES} required
          />

          <button
            onClick={handleResortNext}
            style={{
              width: "100%", padding: "14px 0", marginTop: 12,
              background: `linear-gradient(135deg, ${C.acc} 0%, ${C.accDk} 100%)`,
              color: C.pri, border: "none", borderRadius: 12,
              fontSize: 16, fontWeight: 700, cursor: "pointer",
            }}
          >
            Continue
          </button>
        </StepCard>
      )}

      {/* Step 2: Gingr Setup */}
      {step === 1 && (
        <StepCard
          title="Connect your Gingr account"
          subtitle="Enter your Gingr subdomain and API key. We'll verify the connection before proceeding."
        >
          <OnboardInput
            label="Gingr Subdomain" value={gingrSubdomain} onChange={setGingrSubdomain}
            placeholder="yourresort" required
          />
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: -16, marginBottom: 16 }}>
            Your Gingr URL is https://<strong>{gingrSubdomain || "yourresort"}</strong>.gingrapp.com
          </div>
          <OnboardInput
            label="API Key" value={gingrApiKey} onChange={setGingrApiKey}
            placeholder="Enter your Gingr API key" required
          />

          {/* Test Connection */}
          <button
            onClick={testGingrConnection}
            disabled={gingrTesting || !gingrSubdomain.trim() || !gingrApiKey.trim()}
            style={{
              width: "100%", padding: "12px 0", marginBottom: 12,
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)",
              color: "#fff", borderRadius: 10, fontSize: 14, fontWeight: 600,
              cursor: gingrTesting ? "wait" : "pointer", opacity: gingrTesting ? 0.7 : 1,
            }}
          >
            {gingrTesting ? "Testing..." : "Test Connection"}
          </button>

          {gingrTestResult && (
            <div style={{
              padding: "12px 16px", borderRadius: 10, marginBottom: 16,
              background: gingrTestResult.success ? "rgba(132,204,22,0.1)" : "rgba(220,38,38,0.1)",
              border: `1px solid ${gingrTestResult.success ? "rgba(132,204,22,0.3)" : "rgba(220,38,38,0.3)"}`,
              color: gingrTestResult.success ? C.acc : C.dan,
              fontSize: 14,
            }}>
              {gingrTestResult.message}
            </div>
          )}

          <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
            <button
              onClick={() => setStep(0)}
              style={{
                flex: 1, padding: "14px 0",
                background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)",
                color: "#fff", borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: "pointer",
              }}
            >
              Back
            </button>
            <button
              onClick={handleGingrNext}
              disabled={!gingrSubdomain.trim() || !gingrApiKey.trim()}
              style={{
                flex: 2, padding: "14px 0",
                background: `linear-gradient(135deg, ${C.acc} 0%, ${C.accDk} 100%)`,
                color: C.pri, border: "none", borderRadius: 12,
                fontSize: 16, fontWeight: 700, cursor: "pointer",
                opacity: (!gingrSubdomain.trim() || !gingrApiKey.trim()) ? 0.5 : 1,
              }}
            >
              Continue
            </button>
          </div>

          {/* Skip Gingr */}
          <button
            onClick={() => setStep(2)}
            style={{
              width: "100%", padding: "10px 0", marginTop: 12,
              background: "none", border: "none",
              color: "rgba(255,255,255,0.35)", fontSize: 13, fontWeight: 500,
              cursor: "pointer", textDecoration: "underline",
            }}
          >
            Skip — I'll set up Gingr later
          </button>
        </StepCard>
      )}

      {/* Step 3: Plan Selection */}
      {step === 2 && (
        <div>
          <div style={{ textAlign: "center", marginBottom: 24 }}>
            <button
              onClick={() => setStep(1)}
              style={{
                background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)",
                color: "#fff", padding: "8px 20px", borderRadius: 8,
                fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}
            >
              Back to Gingr Setup
            </button>
          </div>
          <PricingPage onSelectPlan={handlePlanSelected} />
        </div>
      )}

      {/* Step 4: Provisioning */}
      {step === 3 && (
        <StepCard
          title={provisionDone ? "You're all set!" : "Setting up your resort"}
          subtitle={provisionDone ? "Redirecting to your dashboard..." : "This will only take a moment."}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {provisionSteps.map((msg, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "10px 14px", borderRadius: 10,
                background: i === provisionSteps.length - 1 && !provisionDone
                  ? "rgba(132,204,22,0.1)"
                  : "rgba(255,255,255,0.03)",
              }}>
                <div style={{
                  width: 24, height: 24, borderRadius: 8,
                  background: i < provisionSteps.length - 1 || provisionDone ? C.acc : "rgba(132,204,22,0.3)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}>
                  {(i < provisionSteps.length - 1 || provisionDone) ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.pri} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <div style={{
                      width: 8, height: 8, borderRadius: "50%",
                      background: C.acc, animation: "pulse 1s ease-in-out infinite",
                    }} />
                  )}
                </div>
                <span style={{ fontSize: 14, color: "rgba(255,255,255,0.8)" }}>{msg}</span>
              </div>
            ))}
          </div>

          {provisionError && (
            <div style={{
              marginTop: 16, padding: "12px 16px", borderRadius: 10,
              background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.3)",
              color: C.dan, fontSize: 14,
            }}>
              Error: {provisionError}
            </div>
          )}
        </StepCard>
      )}
    </div>
  );
}
