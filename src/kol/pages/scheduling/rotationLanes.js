// K9 Operations — Rotation lane ordering helpers
// Pure helpers extracted verbatim from SchedulingPage.jsx.

function normalizeRotationLaneRole(lane) {
  const raw = String(lane?.position || lane?.role || lane?.label || lane?.id || "").toLowerCase();
  if (raw.includes("pct")) return "pct";
  if (raw.includes("supervisor") || /\bsup\b/.test(raw)) return "supervisor";
  if (raw.includes("csr")) return "csr";
  if (raw.includes("mod") || raw.includes("manager")) return "manager";
  return "other";
}

function rotationLaneSortValue(lane) {
  const order = { pct: 0, supervisor: 1, csr: 2, manager: 3, other: 4 };
  return order[normalizeRotationLaneRole(lane)] ?? order.other;
}

export function sortRotationLanes(lanes = []) {
  return [...lanes].sort((a, b) => (
    rotationLaneSortValue(a) - rotationLaneSortValue(b)
    || String(a.label || a.id || "").localeCompare(String(b.label || b.id || ""))
  ));
}
