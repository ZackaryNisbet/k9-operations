// K9 Operations — Pricing Page
// Plan selection with Stripe checkout integration.

import React, { useState } from "react";
import { supabase } from "../../supabaseClient";
import { C } from "../../shared/theme";
import { I } from "../../shared/icons";

const PLANS = [
  {
    id: "single_location",
    name: "K9 Operations",
    subtitle: "Everything You Need",
    price: 50,
    period: "mo",
    features: [
      "Unlimited locations",
      "Unlimited team members",
      "Operations Hub + checklists",
      "Customer Lifecycle CRM",
      "Gingr integration",
      "Revenue dashboard",
      "Enterprise reporting",
      "EOD reports",
      "Priority support",
    ],
    cta: "Get Started",
    popular: true,
  },
];

export default function PricingPage({ nav, onSelectPlan }) {
  const [loadingPlan, setLoadingPlan] = useState(null);

  const handleSelect = async (planId) => {
    if (onSelectPlan) {
      onSelectPlan(planId);
      return;
    }

    setLoadingPlan(planId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        // User not logged in — self-serve signup is disabled for now.
        window.location.href = `/login`;
        return;
      }

      const { data, error } = await supabase.functions.invoke("stripe-checkout", {
        body: {
          plan_type: planId,
          success_url: `${window.location.origin}/lite/onboarding?step=provision&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${window.location.origin}/lite/pricing`,
        },
      });

      if (error) {
        // Handle "Stripe not configured" gracefully
        if (error.message?.includes("not configured") || data?.error?.includes("not configured")) {
          alert("Payment processing is being set up. Please try again shortly.");
          return;
        }
        throw error;
      }
      if (data?.error) {
        if (data.error.includes("not configured")) {
          alert("Payment processing is being set up. Please try again shortly.");
          return;
        }
        throw new Error(data.error);
      }
      if (data?.url) window.location.href = data.url;
    } catch (err) {
      console.error("Checkout error:", err);
      // Show user-friendly error
      alert("Unable to start checkout. Please try again or contact support.");
    } finally {
      setLoadingPlan(null);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: `linear-gradient(180deg, ${C.pri} 0%, #0A1F12 60%, #050D08 100%)`,
      padding: "60px 24px 80px",
      fontFamily: "'Outfit', -apple-system, sans-serif",
    }}>
      {/* Header */}
      <div style={{ textAlign: "center", maxWidth: 700, margin: "0 auto 48px" }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          background: "rgba(132,204,22,0.15)", border: "1px solid rgba(132,204,22,0.3)",
          borderRadius: 20, padding: "6px 16px", fontSize: 13, fontWeight: 600,
          color: C.acc, marginBottom: 20,
        }}>
          Simple, transparent pricing
        </div>
        <h1 style={{
          fontSize: 44, fontWeight: 900, color: "#fff",
          lineHeight: 1.1, margin: "0 0 16px", letterSpacing: "-0.02em",
        }}>
          The operating system<br />your resort deserves
        </h1>
        <p style={{
          fontSize: 18, color: "rgba(255,255,255,0.6)", lineHeight: 1.6, margin: 0,
        }}>
          One simple price. Everything included. 14-day free trial.
        </p>
      </div>

      {/* Plan Cards */}
      <div style={{
        display: "flex",
        justifyContent: "center",
        gap: 20, maxWidth: 440, margin: "0 auto",
      }}>
        {PLANS.map((plan) => (
          <div key={plan.id} style={{
            background: plan.popular
              ? "linear-gradient(135deg, rgba(132,204,22,0.12) 0%, rgba(20,83,45,0.3) 100%)"
              : "rgba(255,255,255,0.04)",
            border: plan.popular
              ? "2px solid rgba(132,204,22,0.4)"
              : "1px solid rgba(255,255,255,0.08)",
            borderRadius: 22, padding: "36px 30px",
            display: "flex", flexDirection: "column",
            position: "relative", transition: "transform 0.2s, border-color 0.2s",
          }}
            onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.borderColor = plan.popular ? "rgba(132,204,22,0.6)" : "rgba(255,255,255,0.2)"; }}
            onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.borderColor = plan.popular ? "rgba(132,204,22,0.4)" : "rgba(255,255,255,0.08)"; }}
          >
            {plan.popular && (
              <div style={{
                position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)",
                background: C.acc, color: C.pri, fontSize: 12, fontWeight: 800,
                padding: "4px 16px", borderRadius: 12, letterSpacing: "0.05em",
              }}>
                MOST POPULAR
              </div>
            )}

            <div style={{ fontSize: 13, fontWeight: 600, color: C.acc, letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: 4 }}>
              {plan.subtitle}
            </div>
            <div style={{ fontSize: 28, fontWeight: 900, color: "#fff", marginBottom: 12 }}>
              {plan.name}
            </div>

            <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 24 }}>
              {plan.price ? (
                <>
                  <span style={{ fontSize: 48, fontWeight: 900, color: "#fff", lineHeight: 1 }}>${plan.price}</span>
                  <span style={{ fontSize: 16, color: "rgba(255,255,255,0.4)", fontWeight: 500 }}>/{plan.period}</span>
                </>
              ) : (
                <span style={{ fontSize: 28, fontWeight: 700, color: "rgba(255,255,255,0.6)" }}>Custom pricing</span>
              )}
            </div>

            <div style={{ flex: 1, marginBottom: 24 }}>
              {plan.features.map((f, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "6px 0" }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: 6,
                    background: "rgba(132,204,22,0.15)", display: "flex",
                    alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1,
                  }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.acc} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <span style={{ fontSize: 14, color: "rgba(255,255,255,0.75)", lineHeight: 1.4 }}>{f}</span>
                </div>
              ))}
            </div>

            <button
              onClick={() => handleSelect(plan.id)}
              disabled={loadingPlan === plan.id}
              style={{
                width: "100%", padding: "14px 0",
                background: plan.popular
                  ? `linear-gradient(135deg, ${C.acc} 0%, ${C.accDk} 100%)`
                  : "rgba(255,255,255,0.08)",
                color: plan.popular ? C.pri : "#fff",
                border: plan.popular ? "none" : "1px solid rgba(255,255,255,0.15)",
                borderRadius: 14, fontSize: 15, fontWeight: 700,
                cursor: loadingPlan === plan.id ? "wait" : "pointer",
                opacity: loadingPlan === plan.id ? 0.7 : 1,
                transition: "opacity 0.2s, background 0.2s",
              }}
            >
              {loadingPlan === plan.id ? "Redirecting..." : plan.cta}
            </button>
          </div>
        ))}
      </div>

      {/* FAQ/Trust */}
      <div style={{ textAlign: "center", maxWidth: 500, margin: "60px auto 0", color: "rgba(255,255,255,0.4)", fontSize: 14, lineHeight: 1.6 }}>
        All plans include a 14-day free trial. No credit card required to start.
        Cancel anytime. Prices in USD.
      </div>
    </div>
  );
}
