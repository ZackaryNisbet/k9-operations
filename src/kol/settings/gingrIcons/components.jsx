import { C } from "../../../shared/theme";
import { Card } from "../../../shared/ui";
import { clean, getSeverityStyle } from "./helpers";

export function CompactToggle({ active, disabled, saving, severity, onClick, title }) {
  const sev = getSeverityStyle(severity);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={active}
      style={{
        width: 32,
        height: 28,
        borderRadius: 7,
        border: `1.5px solid ${active ? sev.border : C.border}`,
        background: active ? sev.bg : C.surface,
        color: active ? sev.color : C.textMut,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 13,
        fontWeight: 900,
        fontFamily: "inherit",
        cursor: disabled ? "wait" : "pointer",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {saving ? "..." : active ? "ON" : ""}
    </button>
  );
}

export function StaticWorkflowPill({ label, tone = "neutral", title }) {
  const styles = tone === "driver"
    ? { color: "#991B1B", bg: "#FEF2F2", border: "#FCA5A5" }
    : tone === "category"
      ? { color: C.textSec, bg: C.bg, border: C.border }
      : { color: C.textMut, bg: C.surface, border: C.borderLight };
  return (
    <span
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 32,
        height: 28,
        borderRadius: 7,
        border: `1px solid ${styles.border}`,
        background: styles.bg,
        color: styles.color,
        fontSize: 9,
        fontWeight: 900,
        lineHeight: "10px",
      }}
    >
      {label}
    </span>
  );
}

export function SectionShell({ title, eyebrow, count, open, onToggle, children }) {
  return (
    <Card style={{ padding: 0, overflow: "hidden", marginBottom: 18 }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: "100%",
          border: "none",
          background: C.surface,
          padding: "16px 18px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          cursor: "pointer",
          fontFamily: "inherit",
          textAlign: "left",
        }}
      >
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 11, fontWeight: 900, color: C.textMut, textTransform: "uppercase", letterSpacing: 0, marginBottom: 3 }}>
            {eyebrow}
          </span>
          <span style={{ display: "block", fontSize: 15, fontWeight: 900, color: C.text }}>{title}</span>
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          {count != null && (
            <span style={{ fontSize: 11, fontWeight: 900, color: C.textSec, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 999, padding: "4px 9px" }}>
              {count}
            </span>
          )}
          <span style={{ color: C.textMut, fontSize: 18, lineHeight: 1 }}>{open ? "-" : "+"}</span>
        </span>
      </button>
      {open && <div style={{ borderTop: `1px solid ${C.border}`, padding: 18 }}>{children}</div>}
    </Card>
  );
}

export function SearchInput({ value, onChange }) {
  return (
    <input
      type="text"
      placeholder="Search icons by name, group, or ID..."
      value={value}
      onChange={(event) => onChange(event.target.value)}
      style={{
        width: "100%",
        padding: "10px 13px",
        borderRadius: 8,
        border: `1.5px solid ${C.border}`,
        background: C.surface,
        color: C.text,
        fontSize: 13,
        fontFamily: "inherit",
        boxSizing: "border-box",
        outline: "none",
      }}
    />
  );
}

export function SummaryTile({ label, value, tone = "default" }) {
  const color = tone === "warn" ? "#B45309" : tone === "driver" ? "#991B1B" : C.text;
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "13px 14px", background: C.surface }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: C.textMut, marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 24, lineHeight: "28px", fontWeight: 900, color }}>{value}</div>
    </div>
  );
}

export function ConfigStatusPill({ status }) {
  const labelMap = {
    covered: "Ready",
    partial: "Partial",
    gap: "Gap",
    non_gingr: "Not Gingr",
  };
  const styleMap = {
    covered: { color: "#166534", bg: "#F0FDF4", border: "#BBF7D0" },
    partial: { color: "#92400E", bg: "#FFFBEB", border: "#FCD34D" },
    gap: { color: "#991B1B", bg: "#FEF2F2", border: "#FCA5A5" },
    non_gingr: { color: C.textSec, bg: C.bg, border: C.border },
  };
  const styles = styleMap[status] || styleMap.partial;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 999, border: `1px solid ${styles.border}`, background: styles.bg, color: styles.color, fontSize: 10, fontWeight: 900, padding: "4px 8px", whiteSpace: "nowrap" }}>
      {labelMap[status] || "Partial"}
    </span>
  );
}

export function InlineTokenList({ values = [], empty = "None" }) {
  if (!values.length) return <span style={{ fontSize: 12, color: C.textMut }}>{empty}</span>;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
      {values.map((value) => (
        <span key={value} style={{ display: "inline-flex", alignItems: "center", borderRadius: 999, border: `1px solid ${C.border}`, background: C.bg, color: C.textSec, fontSize: 10.5, fontWeight: 800, lineHeight: "13px", padding: "4px 7px" }}>
          {value}
        </span>
      ))}
    </div>
  );
}

export function sourceTypeLabel(sourceType) {
  if (sourceType === "service_addon") return "Add-on";
  if (sourceType === "reservation_type") return "Reservation type";
  if (sourceType === "run") return "Run";
  if (sourceType === "room") return "Room";
  if (sourceType === "icon") return "Icon";
  if (sourceType === "service") return "Service";
  return clean(sourceType).replaceAll("_", " ") || "Source";
}

export function summarizeList(rows, emptyLabel) {
  if (!rows.length) {
    return <span style={{ fontSize: 12, color: C.textMut }}>{emptyLabel}</span>;
  }
  return rows.slice(0, 8).map((row) => (
    <span
      key={`${row.source_type || "icon"}:${row.source_identity_key || row.id}:${row.capability_key || ""}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 11,
        fontWeight: 800,
        color: C.textSec,
        background: C.bg,
        border: `1px solid ${C.border}`,
        borderRadius: 999,
        padding: "5px 8px",
      }}
    >
      <span style={{ color: C.textMut }}>{sourceTypeLabel(row.source_type)}</span>
      <span>{row.current_label || row.source_label || row.current_title || row.source_identity_key || row.capability_key}</span>
    </span>
  )).concat(rows.length > 8 ? [
    <span key="more" style={{ fontSize: 11, fontWeight: 800, color: C.textMut, alignSelf: "center" }}>+{rows.length - 8} more</span>,
  ] : []);
}
