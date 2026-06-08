import { C } from "../constants/colors";
import { I } from "../icons";
import { hasPermission } from "../lib/roles";

function ManagementHub({ data, save, nav, profile }) {
  const hp = (k) => hasPermission(profile, data, k);
  const mgmtTools = [
    { id: "mgmt-attendance", label: "Attendance Tracker", desc: "Track tardies, call-outs, and no-shows with automatic summaries", icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M9 14l2 2 4-4"/></svg>, status: "active" },
    ...(hp("view_audit_log") ? [{ id: "mgmt-audit-log", label: "Audit Log", desc: "View employee logins, account switches, and all system activity", icon: <I.Search />, status: "active" }] : []),
    { id: null, label: "Incident Reports", desc: "Log and track workplace incidents and investigations", icon: <I.AlertTriangle />, status: "coming_soon" },
  ];
  return (
    <div style={{ padding: "0 8px" }}>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0, marginBottom: 4 }}>Management</h2>
        <p style={{ fontSize: 13, color: C.textSec, margin: 0 }}>Administrative tools for team oversight and documentation.</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
        {mgmtTools.map((tool, i) => (
          <div key={i} onClick={() => tool.id && nav(tool.id)}
            style={{ background: C.surface, borderRadius: 14, padding: "22px 24px", border: `1.5px solid ${tool.status === "active" ? C.pri + "40" : C.border}`, cursor: tool.id ? "pointer" : "default", opacity: tool.status === "coming_soon" ? 0.55 : 1, transition: "all 0.2s", position: "relative" }}
            onMouseEnter={e => { if (tool.id) { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)"; }}}
            onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: tool.status === "active" ? C.priLt : C.bg, display: "flex", alignItems: "center", justifyContent: "center", color: tool.status === "active" ? C.pri : C.textMut, flexShrink: 0 }}>{tool.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 4 }}>{tool.label}</div>
                <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.5 }}>{tool.desc}</div>
                {tool.status === "coming_soon" && <span style={{ display: "inline-block", marginTop: 8, fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: "#F3F4F6", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.04em" }}>Coming Soon</span>}
              </div>
              {tool.id && <span style={{ color: C.textMut, fontSize: 18, marginTop: 2 }}>›</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export { ManagementHub };
