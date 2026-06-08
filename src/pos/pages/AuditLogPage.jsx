import { Btn } from "../components/ui";
import { C } from "../constants/colors";
import { useMemo, useState } from "react";

function AuditLogPage({ data, nav, profile }) {
  const [filter, setFilter] = useState("all"); // all, logins, reservations, settings
  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState("7d"); // 7d, 30d, 90d, all

  const allLogs = useMemo(() => {
    const logs = (data.auditLog || []).slice().sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
    // Date filter
    const now = new Date();
    const cutoff = dateRange === "7d" ? new Date(now - 7*86400000) :
                   dateRange === "30d" ? new Date(now - 30*86400000) :
                   dateRange === "90d" ? new Date(now - 90*86400000) : null;
    const dated = cutoff ? logs.filter(l => new Date(l.timestamp) >= cutoff) : logs;
    // Action type filter
    const typed = filter === "all" ? dated :
                  filter === "logins" ? dated.filter(l => l.action === "Employee Sign-In" || l.action === "Account Switch") :
                  filter === "reservations" ? dated.filter(l => l.reservationId) :
                  filter === "settings" ? dated.filter(l => l.action?.includes("Settings") || l.action?.includes("Config")) :
                  dated;
    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      return typed.filter(l =>
        (l.userName || "").toLowerCase().includes(q) ||
        (l.action || "").toLowerCase().includes(q) ||
        JSON.stringify(l.details || []).toLowerCase().includes(q)
      );
    }
    return typed;
  }, [data.auditLog, filter, dateRange, search]);

  const actionColor = (action) => {
    if (action === "Employee Sign-In") return C.suc;
    if (action === "Account Switch") return C.warn;
    if (action === "Checked In") return "#22C55E";
    if (action === "Checked Out") return "#3B82F6";
    if (action === "Collected Payment") return "#8B5CF6";
    if (action === "Cancelled") return C.dan;
    return C.textSec;
  };

  return (
    <div style={{ padding: "0 8px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0, marginBottom: 4 }}>Audit Log</h2>
          <p style={{ fontSize: 13, color: C.textSec, margin: 0 }}>Employee logins, reservation changes, and system activity.</p>
        </div>
        <Btn variant="ghost" onClick={() => nav("management")} style={{ border: `1.5px solid ${C.border}` }}>← Back to Management</Btn>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, action, or detail..." style={{ flex: 1, minWidth: 200, padding: "8px 14px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 13, fontFamily: "inherit", background: C.bg, color: C.text, outline: "none" }} />
        {["all", "logins", "reservations", "settings"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: "6px 14px", borderRadius: 8, border: `1.5px solid ${filter === f ? C.pri : C.border}`, background: filter === f ? C.priLt : "transparent", color: filter === f ? C.pri : C.textSec, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", textTransform: "capitalize" }}>{f === "all" ? "All Activity" : f}</button>
        ))}
        <select value={dateRange} onChange={e => setDateRange(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 12, fontFamily: "inherit", background: C.bg, color: C.text }}>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
          <option value="all">All time</option>
        </select>
      </div>

      {/* Stats */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        {[
          { label: "Total Events", value: allLogs.length, color: C.pri },
          { label: "Logins", value: allLogs.filter(l => l.action === "Employee Sign-In").length, color: C.suc },
          { label: "Account Switches", value: allLogs.filter(l => l.action === "Account Switch").length, color: C.warn },
        ].map((s, i) => (
          <div key={i} style={{ padding: "12px 18px", borderRadius: 10, background: C.surface, border: `1.5px solid ${C.border}`, minWidth: 130 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: C.textSec, fontWeight: 600 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Log entries */}
      <div style={{ background: C.surface, borderRadius: 12, border: `1.5px solid ${C.border}`, overflow: "hidden" }}>
        {allLogs.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: C.textMut, fontSize: 13 }}>No audit log entries found for the selected filters.</div>
        ) : (
          <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: C.bg, position: "sticky", top: 0, zIndex: 1 }}>
                  <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700, color: C.textSec, borderBottom: `1.5px solid ${C.border}`, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>Time</th>
                  <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700, color: C.textSec, borderBottom: `1.5px solid ${C.border}`, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>User</th>
                  <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700, color: C.textSec, borderBottom: `1.5px solid ${C.border}`, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>Action</th>
                  <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700, color: C.textSec, borderBottom: `1.5px solid ${C.border}`, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {allLogs.slice(0, 200).map((log, i) => {
                  const details = Array.isArray(log.details) ? log.details : [];
                  const ts = log.timestamp ? new Date(log.timestamp) : null;
                  return (
                    <tr key={log.id || i} style={{ borderBottom: `1px solid ${C.border}20` }}
                      onMouseEnter={e => e.currentTarget.style.background = C.bg}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <td style={{ padding: "10px 14px", whiteSpace: "nowrap", color: C.textSec, fontSize: 12 }}>
                        {ts ? `${ts.toLocaleDateString("en-US", { month: "short", day: "numeric" })} ${ts.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : "—"}
                      </td>
                      <td style={{ padding: "10px 14px", fontWeight: 600, color: C.text }}>{log.userName || log.changedBy || "—"}</td>
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700, background: actionColor(log.action) + "18", color: actionColor(log.action) }}>{log.action || "—"}</span>
                      </td>
                      <td style={{ padding: "10px 14px", color: C.textSec, fontSize: 12, maxWidth: 400 }}>
                        {details.length > 0 ? details.map((d, j) => (
                          <span key={j}>
                            {j > 0 && " · "}
                            <span style={{ fontWeight: 600 }}>{d.field}:</span> {d.oldVal && d.oldVal !== "—" ? <><span style={{ textDecoration: "line-through", opacity: 0.6 }}>{d.oldVal}</span> → </> : ""}{d.newVal || "—"}
                          </span>
                        )) : log.reservationId ? `Reservation ${log.reservationId.slice(0, 8)}...` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {allLogs.length > 200 && <div style={{ padding: "12px 14px", textAlign: "center", color: C.textMut, fontSize: 12 }}>Showing first 200 of {allLogs.length} entries</div>}
          </div>
        )}
      </div>
    </div>
  );
}

export { AuditLogPage };
