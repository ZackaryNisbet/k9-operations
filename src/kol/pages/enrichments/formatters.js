export function formatPriceLabel(event) {
  const cents = Number(event?.price_cents || 0);
  if (!cents) return "$15 add-on";
  return `$${Math.round(cents / 100)} add-on`;
}

export function formatEnrichmentPrice(event) {
  const cents = Number(event?.price_cents || 0);
  if (!cents) return "$15 add-on";
  return `$${Math.round(cents / 100)} add-on`;
}

export function healthTone(status) {
  if (status === "healthy") return { label: "Healthy", color: "#22C55E", bg: "rgba(34,197,94,0.13)" };
  if (status === "stale") return { label: "Watch", color: "#EAB308", bg: "rgba(234,179,8,0.14)" };
  if (status === "critical") return { label: "Down", color: "#EF4444", bg: "rgba(239,68,68,0.14)" };
  return { label: "Waiting", color: "#64748B", bg: "rgba(100,116,139,0.1)" };
}

export function formatHealthDuration(ms) {
  if (ms == null) return "-";
  const value = Number(ms);
  if (!Number.isFinite(value)) return "-";
  if (value < 1000) return `${Math.round(value)}ms`;
  return `${(value / 1000).toFixed(1)}s`;
}

export function formatFileSize(bytes) {
  const value = Number(bytes || 0);
  if (!value) return "Unknown size";
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function getWorkflowExtraServiceDetail(services = []) {
  return (Array.isArray(services) ? services : [])
    .map((service) => String(service || "").trim())
    .filter((service) => service && !service.toLowerCase().includes("enrichment"))
    .join(", ");
}
