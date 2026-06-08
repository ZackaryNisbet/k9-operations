// K9 Operations — CheckoutTVPage CSS keyframes
// Extracted verbatim from CheckoutTVPage.jsx. Side-effect module: injects the
// shared <style> element once on import (idempotent, guarded). No behavior change.

/* ── CSS Keyframes (injected once) ────────────────────────────────────── */
const STYLE_ID = "checkout-tv-styles";
if (typeof document !== "undefined" && !document.getElementById(STYLE_ID)) {
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes dogCardSkeleton {
      0%, 100% { opacity: 0.4; }
      50% { opacity: 1; }
    }
    @keyframes checkoutPulse {
      0%, 100% { box-shadow: 0 0 20px 4px rgba(132,204,22,0.4), 0 0 60px 8px rgba(132,204,22,0.15); }
      50% { box-shadow: 0 0 30px 8px rgba(132,204,22,0.7), 0 0 80px 16px rgba(132,204,22,0.3); }
    }
    @keyframes checkoutSlideIn {
      from { opacity: 0; transform: translateY(-30px) scale(0.92); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes checkoutFadeOut {
      from { opacity: 1; transform: scale(1); }
      to { opacity: 0; transform: scale(0.92) translateY(-10px); }
    }
    @keyframes heroEnter {
      0% { opacity: 0; transform: scale(0.7) translateY(40px); }
      60% { opacity: 1; transform: scale(1.02) translateY(-4px); }
      100% { opacity: 1; transform: scale(1) translateY(0); }
    }
    @keyframes heroFadeOut {
      from { opacity: 1; transform: scale(1); }
      to { opacity: 0; transform: scale(0.85) translateY(-20px); }
    }
    @keyframes heroPulse {
      0%, 100% { box-shadow: 0 0 40px 10px rgba(132,204,22,0.35), 0 0 120px 30px rgba(132,204,22,0.1), inset 0 1px 0 rgba(255,255,255,0.08); }
      50% { box-shadow: 0 0 60px 20px rgba(132,204,22,0.55), 0 0 160px 50px rgba(132,204,22,0.2), inset 0 1px 0 rgba(255,255,255,0.08); }
    }
    @keyframes heroCountdownPulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.06); }
    }
    @keyframes queueSlideIn {
      from { opacity: 0; transform: translateX(20px); }
      to { opacity: 1; transform: translateX(0); }
    }
    @keyframes urgentShake {
      0%, 100% { transform: translateX(0); }
      20% { transform: translateX(-2px); }
      40% { transform: translateX(2px); }
      60% { transform: translateX(-1px); }
      80% { transform: translateX(1px); }
    }
    @keyframes tvNavFadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes tvGridFadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes checkinPulse {
      0%, 100% { box-shadow: 0 0 40px 10px rgba(56,189,248,0.35), 0 0 120px 30px rgba(56,189,248,0.1), inset 0 1px 0 rgba(255,255,255,0.08); }
      50% { box-shadow: 0 0 60px 20px rgba(56,189,248,0.55), 0 0 160px 50px rgba(56,189,248,0.2), inset 0 1px 0 rgba(255,255,255,0.08); }
    }
    @keyframes spotlightEnter {
      0% { opacity: 0; transform: translateY(26px) scale(0.82); }
      62% { opacity: 1; transform: translateY(-5px) scale(1.02); }
      100% { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes spotlightExit {
      from { opacity: 1; transform: translateY(0) scale(1); }
      to { opacity: 0; transform: translateY(-18px) scale(0.86); }
    }
    @keyframes tvModalIn {
      from { opacity: 0; transform: translateY(14px) scale(0.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes tvHealthRefreshPulse {
      0%, 100% { transform: scale(1); box-shadow: 0 0 14px currentColor; }
      50% { transform: scale(1.3); box-shadow: 0 0 26px currentColor; }
    }
    @keyframes tvHealthRefreshSweep {
      0% { transform: translateX(-100%); opacity: 0.15; }
      45% { opacity: 0.75; }
      100% { transform: translateX(100%); opacity: 0.15; }
    }
  `;
  document.head.appendChild(style);
}
