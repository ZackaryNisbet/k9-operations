// K9 Operations — Training Module: leaf component extracted verbatim from TrainingPage.jsx (no behavior change).

const STATUS_COLORS = {
  not_started: { bg: "#F1F5F9", text: "#64748B", label: "Not Started" },
  in_progress: { bg: "#DBEAFE", text: "#1D4ED8", label: "In Progress" },
  complete: { bg: "#DCFCE7", text: "#15803D", label: "Complete" },
  passed: { bg: "#DCFCE7", text: "#15803D", label: "Passed" },
  failed: { bg: "#FEE2E2", text: "#DC2626", label: "Failed" },
  needs_follow_up: { bg: "#FEF3C7", text: "#D97706", label: "Needs Follow-Up" },
  retest_required: { bg: "#FEF3C7", text: "#D97706", label: "Retest Required" },
  archived: { bg: "#F1F5F9", text: "#94A3B8", label: "Archived" },
};

export function StatusBadge({ status }) {
  const s = STATUS_COLORS[status] || STATUS_COLORS.not_started;
  return <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: s.bg, color: s.text }}>{s.label}</span>;
}
