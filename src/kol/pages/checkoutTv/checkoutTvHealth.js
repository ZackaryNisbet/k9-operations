// K9 Operations — CheckoutTVPage health helpers
// Extracted verbatim from CheckoutTVPage.jsx. Pure functions — no behavior change.

import { CHECKOUT_HEALTH_SPECS } from "./checkoutTvConstants";

export function formatHealthTime(value) {
  if (!value) return "Not yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

export function formatHealthDuration(ms) {
  if (!Number.isFinite(ms)) return null;
  if (ms < 1000) return `${Math.max(0, Math.round(ms))} ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} sec`;
}

export function formatHealthAge(value, nowMs = Date.now()) {
  if (!value) return "Not yet";
  const ts = new Date(value).getTime();
  if (Number.isNaN(ts)) return "Unknown";
  const seconds = Math.max(0, Math.round((nowMs - ts) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  return minutes === 1 ? "1 min ago" : `${minutes} min ago`;
}

export function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(label)), ms);
    }),
  ]);
}

export function healthTone(status) {
  if (status === "healthy") return { label: "Healthy", color: "#22C55E", bg: "rgba(34,197,94,0.13)" };
  if (status === "running") return { label: "Running", color: "#38BDF8", bg: "rgba(56,189,248,0.13)" };
  if (status === "warning") return { label: "Watch", color: "#EAB308", bg: "rgba(234,179,8,0.14)" };
  if (status === "critical") return { label: "Down", color: "#EF4444", bg: "rgba(239,68,68,0.14)" };
  return { label: "Waiting", color: "rgba(255,255,255,0.55)", bg: "rgba(255,255,255,0.08)" };
}

export function createInitialCheckoutHealth() {
  return Object.fromEntries(Object.entries(CHECKOUT_HEALTH_SPECS).map(([key, spec]) => [
    key,
    {
      key,
      title: spec.title,
      frequencyLabel: spec.frequencyLabel,
      description: spec.description,
      status: "waiting",
      lastStartedAt: null,
      lastSuccessAt: null,
      lastErrorAt: null,
      nextRunAt: null,
      durationMs: null,
      error: null,
      details: {},
    },
  ]));
}

export function deriveSectionStatus(section, spec, nowMs) {
  if (section?.status === "running") return "running";
  if (section?.status === "critical") return "critical";
  if (section?.status === "warning") return "warning";
  if (section?.error) return "critical";
  if (!section?.lastSuccessAt) return "waiting";
  const lastSuccessMs = new Date(section.lastSuccessAt).getTime();
  if (Number.isNaN(lastSuccessMs)) return "waiting";
  if (nowMs - lastSuccessMs > (section.staleAfterMs || spec.staleAfterMs)) return "warning";
  return "healthy";
}

export function deriveCheckoutHealthSummary(sections, nowMs) {
  const statuses = Object.entries(CHECKOUT_HEALTH_SPECS).map(([key, spec]) => deriveSectionStatus(sections[key], spec, nowMs));
  if (statuses.includes("critical")) return "critical";
  if (statuses.includes("warning")) return "warning";
  if (statuses.includes("running")) return "running";
  if (statuses.includes("waiting")) return "waiting";
  return "healthy";
}

export function getHealthRefreshState(section, intervalMs, nowMs) {
  if (section?.status === "running") {
    return { label: "Refreshing", seconds: 0, progress: 1, isRefreshing: true };
  }

  const nextRunMs = section?.nextRunAt ? new Date(section.nextRunAt).getTime() : Number.NaN;
  if (!Number.isFinite(nextRunMs)) {
    return { label: "Waiting", seconds: null, progress: 0, isRefreshing: false };
  }

  const msRemaining = Math.max(0, nextRunMs - nowMs);
  const seconds = Math.ceil(msRemaining / 1000);
  if (seconds <= 0) {
    return { label: "Refreshing", seconds: 0, progress: 1, isRefreshing: true };
  }

  const progress = 1 - Math.min(msRemaining, intervalMs) / intervalMs;
  return {
    label: `Next sync in ${seconds}`,
    seconds,
    progress: Math.max(0, Math.min(1, progress)),
    isRefreshing: false,
  };
}
