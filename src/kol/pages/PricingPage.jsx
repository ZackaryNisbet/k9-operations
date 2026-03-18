// K9 Operations — Pricing Page
// Plan selection with Stripe checkout integration

import React, { useState, useCallback } from "react";
import { supabase } from "../../supabaseClient";
import { C } from "../../shared/theme";
import { Btn } from "../../shared/ui";

const PLANS = [
  {
    id: "single_location",
    name: "Starter",
    subtitle: "Single Location",
    price: 149,
    period: "mo",
    features: [
      "1 location included",
      "Full operations suite",
      "Gingr PMS integration",
      "Daily ops checklists",
      "Revenue analytics",
      "Customer lifecycle CRM",
      "Checkout TV display",
      "Unlimited team members",
    ],
    cta: "Get Started",
    popular: false,
  },
  {
    id: "multi_location_3",
    name: "Growth",
    subtitle: "Up to 3 Locations",
    price: 349,
    period: "mo",
    features: [
      "Up to 3 locations",
      "Everything in Starter",
      "Enterprise dashboard",
      "Cross-location reporting",
      "Operations matrix view",
      "Multi-location attendance",
      "Priority support",
      "Custom checklist templates",
    ],
    cta: "Get Started",
    popular: true,
  },
  {
    id: "multi_location_10",
    name: "Scale",
    subtitle: "Up to 10 Locations",
    price: 799,
    period: "mo",
    features: [
      "Up to 10 locations",
      "Everything in Growth",
      "Advanced analytics",
      "API access",
      "Dedicated account manager",
      "Custom integrations",
      "SLA guarantee",
      "Onboarding assistance",
    ],
    cta: "Get Started",
    popular: false,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    subtitle: "Unlimited Locations",
    price: null,
    period: null,
    features: [
      "Unlimited locations",
      "Everything in Scale",
      "White-label options",
      "Custom development",
      "24/7 priority support",
      "Dedicated infrastructure",
      "Volume discounts",
      "Custom billing",
    ],
    cta: "Contact Sales",
    popular: false,
  },
];

export default function PricingPage({ profile, addGlobalToast, nav, onSelectPlan }) {
  const [loadingPlan, setLoadingPlan] = useState(null);

  const handleSelectPlan = useCallback(async (planId) => {
    if (planId === "enterprise") {
      window.open("mailto:sales@k9operations.com?subject=Enterprise%20Plan%20Inquiry", "_blank");
      return;
    }

    // If onSelectPlan callback provided (from onboarding), use it
    if (onSelectPlan) {
      onSelectPlan(planId);
      return;
    }

    setLoadingPlan(planId);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-checkout", {
        body: {
          plan_type: planId,
          user_id: profile?.id,
          success_url: `${window.location.origin}/lite/onboarding?step=provision&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${window.location.origin}/lite/pricing`,
        },
      });

      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error("No checkout URL returned");
      }
    } catch (err) {
      console.log("[Pricing] Checkout error:", err.message);
      addGlobalToast?.("Failed to start checkout. Please try again.", "error");
    } finally {
      setLoadingPlan(null);
    }
  }, [profile?.id, addGlobalToast, onSelectPlan]);

  return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(180deg, ${C.pri} 0%, #0D3B1E 40%, ${C.bg} 100%)`, fontFamily: "'Outfit', sans-serif" }}>
      {/* Header */}
      <div style={{ textAlign: "center", padding: "60px 24px 40px" }}>
        <div style={{
          fontSize: 11, fontWeight: 700, color: C.acc, textTransform: "uppercase",
          letterSpacing: "0.15em", marginBottom: 12,
        }}>
          Pricing
        </div>
        <h1 style={{
          fontSize: 42, fontWeight: 800, color: "#fff", margin: "0 0 16px",
          lineHeight: 1.1, letterSpacing: "-0.02em",
        }}>
          Choose your plan
        </h1>
        <p style={{
          fontSize: 17, color: "rgba(255,255,255,0.7)", maxWidth: 520,
          margin: "0 auto", lineHeight: 1.5, fontWeight: 400,
        }}>
          The operating system for pet care facilities. Start with a single location and scale as you grow.
        </p>
      </div>

      {/* Plan Cards */}
      <div style={{
        display: "flex", gap: 20, justifyContent: "center", flexWrap: "wrap",
        padding: "0 24px 80px", maxWidth: 1200, margin: "0 auto",
      }}>
        {PLANS.map((plan) => {
          const isPopular = plan.popular;
          return (
            <div
              key={plan.id}
              style={{
                flex: "1 1 260px",
                maxWidth: 280,
                background: isPopular ? "#fff" : "rgba(255,255,255,0.95)",
                borderRadius: 20,
                padding: isPopular ? "0 0 32px" : "32px 28px",
                position: "relative",
                border: isPopular ? `2px solid ${C.acc}` : "1px solid rgba(0,0,0,0.06)",
                boxShadow: isPopular
                  ? "0 20px 60px rgba(132,204,22,0.15), 0 8px 24px rgba(0,0,0,0.08)"
                  : "0 4px 20px rgba(0,0,0,0.06)",
                transition: "transform 0.2s, box-shadow 0.2s",
                overflow: "hidden",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-4px)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
            >
              {/* Popular badge */}
              {isPopular && (
                <div style={{
                  background: `linear-gradient(135deg, ${C.acc} 0%, ${C.accDk} 100%)`,
                  color: "#fff", textAlign: "center", padding: "8px 0",
                  fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase",
                }}>
                  Most Popular
                </div>
              )}

              <div style={{ padding: isPopular ? "28px 28px 0" : 0 }}>
                {/* Plan name */}
                <div style={{ fontSize: 13, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
                  {plan.name}
                </div>
                <div style={{ fontSize: 12, color: C.textSec, marginBottom: 16, fontWeight: 500 }}>
                  {plan.subtitle}
                </div>

                {/* Price */}
                <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 24 }}>
                  {plan.price !== null ? (
                    <>
                      <span style={{ fontSize: 44, fontWeight: 800, color: C.text, lineHeight: 1, letterSpacing: "-0.03em" }}>
                        ${plan.price}
                      </span>
                      <span style={{ fontSize: 14, color: C.textMut, fontWeight: 500 }}>
                        /{plan.period}
                      </span>
                    </>
                  ) : (
                    <span style={{ fontSize: 28, fontWeight: 700, color: C.text }}>Custom</span>
                  )}
                </div>

                {/* CTA Button */}
                <button
                  onClick={() => handleSelectPlan(plan.id)}
                  disabled={loadingPlan === plan.id}
                  style={{
                    width: "100%", padding: "12px 0", borderRadius: 12,
                    border: isPopular ? "none" : `1.5px solid ${C.pri}`,
                    background: isPopular ? `linear-gradient(135deg, ${C.pri} 0%, #0D3B1E 100%)` : "transparent",
                    color: isPopular ? "#fff" : C.pri,
                    fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                    transition: "all 0.15s",
                    opacity: loadingPlan === plan.id ? 0.6 : 1,
                  }}
                >
                  {loadingPlan === plan.id ? "Loading..." : plan.cta}
                </button>

                {/* Features */}
                <div style={{ marginTop: 24 }}>
                  {plan.features.map((feature, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex", alignItems: "flex-start", gap: 10,
                        padding: "7px 0", fontSize: 13, color: C.textSec,
                        borderTop: i === 0 ? `1px solid ${C.borderLight}` : "none",
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
                        <circle cx="8" cy="8" r="8" fill={isPopular ? C.acc : C.sucLt} />
                        <path d="M5 8l2 2 4-4" stroke={isPopular ? "#fff" : C.suc} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span style={{ fontWeight: 500 }}>{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom section */}
      <div style={{ textAlign: "center", padding: "0 24px 60px" }}>
        <p style={{ fontSize: 14, color: C.textMut, maxWidth: 480, margin: "0 auto" }}>
          All plans include a 14-day free trial. No credit card required to start.
          Cancel anytime. Questions?{" "}
          <a href="mailto:support@k9operations.com" style={{ color: C.pri, fontWeight: 600, textDecoration: "none" }}>
            Contact us
          </a>
        </p>
      </div>
    </div>
  );
}
