// K9 Operations — Subscription Gate
// Wraps the app and redirects users without active subscriptions to pricing/onboarding.

import React from "react";
import { C } from "./theme";

export default function SubscriptionGate({ subscription, loading, isActive, isPastDue, children, onNavigate }) {
  if (loading) return null; // parent handles loading UI

  // Past due — show warning banner but allow access
  if (isPastDue) {
    return (
      <>
        <div style={{
          background: `linear-gradient(90deg, ${C.warn} 0%, #B45309 100%)`,
          color: "#fff", padding: "10px 20px", textAlign: "center",
          fontSize: 14, fontWeight: 600, zIndex: 9999, position: "relative",
        }}>
          Your payment is past due. Please update your billing information to avoid service interruption.
          <button
            onClick={() => onNavigate?.("settings")}
            style={{
              marginLeft: 12, background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.3)",
              color: "#fff", padding: "4px 12px", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}
          >
            Manage Billing
          </button>
        </div>
        {children}
      </>
    );
  }

  // Active subscription — render app normally
  if (isActive) return children;

  // No active subscription — show gate
  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      background: `linear-gradient(180deg, ${C.pri} 0%, #0A1F12 100%)`,
      fontFamily: "'Outfit', -apple-system, sans-serif",
      padding: 40, textAlign: "center",
    }}>
      <div style={{
        width: 72, height: 72, borderRadius: 20,
        background: "rgba(132,204,22,0.15)", border: "2px solid rgba(132,204,22,0.3)",
        display: "flex", alignItems: "center", justifyContent: "center",
        marginBottom: 24,
      }}>
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={C.acc} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </div>
      <h1 style={{ fontSize: 32, fontWeight: 900, color: "#fff", margin: "0 0 12px" }}>
        Subscription Required
      </h1>
      <p style={{ fontSize: 16, color: "rgba(255,255,255,0.6)", maxWidth: 400, lineHeight: 1.6, margin: "0 0 32px" }}>
        Choose a plan to unlock K9 Operations for your resort. Start with a 14-day free trial.
      </p>
      <button
        onClick={() => onNavigate?.("pricing")}
        style={{
          background: `linear-gradient(135deg, ${C.acc} 0%, ${C.accDk} 100%)`,
          color: C.pri, border: "none", padding: "14px 40px",
          borderRadius: 12, fontSize: 16, fontWeight: 700, cursor: "pointer",
        }}
      >
        View Plans
      </button>
    </div>
  );
}
