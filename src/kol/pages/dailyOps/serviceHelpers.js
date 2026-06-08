// K9 Operations — DailyOps service-name helpers.
// Extracted verbatim from DailyOpsPage.jsx (pure functions, no page state).

// ─── Service Helper: extract service names from _services (handles both formats) ──
export const getSvcNames = (svcs) => {
  if (!svcs) return [];
  const arr = Array.isArray(svcs) ? svcs : [];
  return arr.map(s => typeof s === "string" ? s : (s && s.name ? s.name : "")).filter(Boolean);
};
export const hasSvc = (svcs, name) => getSvcNames(svcs).some(n => n.toLowerCase() === name.toLowerCase());
export const hasSvcIncludes = (svcs, partial) => getSvcNames(svcs).some(n => n.toLowerCase().includes(partial.toLowerCase()));
