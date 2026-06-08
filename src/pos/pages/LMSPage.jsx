import { Badge, Btn, Card, Modal } from "../components/ui";
import { C } from "../constants/colors";
import { DEFAULT_LMS_CURRICULUM } from "../constants/lms";
import { I } from "../icons";
import { useState } from "react";

function LMSPage({ data, save, nav, profile }) {
  const [expandedModule, setExpandedModule] = useState(null);
  const [showMgmtReview, setShowMgmtReview] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);

  const curriculum = data.lmsCurriculum || DEFAULT_LMS_CURRICULUM;
  const progress = data.lmsProgress || {};
  const teamMembers = data.teamMembers || [];
  const userId = profile?.id || profile?.email || "current";

  // Compute per-module stats for a given user
  const getUserModuleStats = (uid) => {
    const userProg = progress[uid] || {};
    return curriculum.map(mod => {
      const total = mod.courses.length;
      const completed = mod.courses.filter(c => userProg[c.id]?.completed).length;
      const scores = mod.courses.map(c => userProg[c.id]?.bestScore).filter(s => typeof s === "number");
      const avgScore = scores.length > 0 ? Math.round(scores.reduce((a,b) => a+b, 0) / scores.length) : null;
      return { moduleId: mod.id, total, completed, pct: total > 0 ? Math.round((completed / total) * 100) : 0, avgScore };
    });
  };

  const myStats = getUserModuleStats(userId);
  const totalCourses = curriculum.reduce((s, m) => s + m.courses.length, 0);
  const totalCompleted = myStats.reduce((s, m) => s + m.completed, 0);
  const overallPct = totalCourses > 0 ? Math.round((totalCompleted / totalCourses) * 100) : 0;

  // Color for progress
  const pctColor = (pct) => pct === 100 ? C.suc : pct > 50 ? C.acc : pct > 0 ? C.warn : C.textMut;

  // Feature list
  const FEATURES = [
    { icon: "play", title: "Video Tracking", desc: "Track exactly who watches each video and when they complete it" },
    { icon: "lock", title: "No Skipping", desc: "Employees must watch videos in full — no fast-forwarding or skipping ahead" },
    { icon: "quiz", title: "Quizzes & Certification", desc: "Mandatory quizzes after each module with configurable minimum passing scores" },
    { icon: "retry", title: "Auto-Retry", desc: "Failed quizzes require the employee to re-watch and re-take until they pass" },
    { icon: "chart", title: "Management Dashboard", desc: "Real-time visibility into every employee's progress, scores, and completion dates" },
    { icon: "building", title: "Per-Location Control", desc: "Each location manages its own LMS curriculum, deadlines, and employee assignments" },
  ];

  const featureIcon = (type) => {
    const s = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: C.pri, strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };
    if (type === "play") return <svg {...s}><polygon points="5 3 19 12 5 21 5 3"/></svg>;
    if (type === "lock") return <svg {...s}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>;
    if (type === "quiz") return <svg {...s}><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>;
    if (type === "retry") return <svg {...s}><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>;
    if (type === "chart") return <svg {...s}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>;
    if (type === "building") return <svg {...s}><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/><line x1="9" y1="9" x2="9" y2="9.01"/><line x1="9" y1="13" x2="9" y2="13.01"/><line x1="9" y1="17" x2="9" y2="17.01"/></svg>;
    return null;
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: C.text, letterSpacing: "-0.02em" }}>Learning Management</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: C.textSec }}>K9 Operations Training Platform</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="secondary" onClick={() => setShowMgmtReview(true)} icon={<I.Users />}>Management Review</Btn>
        </div>
      </div>

      {/* Coming Soon Hero */}
      <Card style={{ padding: 0, marginBottom: 24, overflow: "hidden" }}>
        <div style={{ background: `linear-gradient(135deg, ${C.pri} 0%, #001a3a 100%)`, padding: "32px 36px", position: "relative" }}>
          <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: "40%", background: "linear-gradient(135deg, transparent 0%, rgba(132,204,22,0.08) 100%)" }} />
          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(132,204,22,0.2)", borderRadius: 20, padding: "4px 14px", marginBottom: 14 }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: C.acc, animation: "pulse 2s infinite" }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: C.acc, textTransform: "uppercase", letterSpacing: "0.08em" }}>Coming Soon</span>
            </div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#fff", marginBottom: 8 }}>Your Own Training Platform — Built Into K9 Operations</h2>
            <p style={{ margin: 0, fontSize: 14, color: "rgba(255,255,255,0.75)", lineHeight: 1.6, maxWidth: 600 }}>
              Replace INCITE and external LMS platforms with a fully integrated learning system. Video-based training with enforced completion, quizzes with minimum score requirements, and real-time employee progress tracking — all managed per location.
            </p>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0 }}>
          {FEATURES.map((f, i) => (
            <div key={i} style={{ padding: "20px 24px", borderRight: i < 2 || i === 3 || i === 4 ? `1px solid ${C.borderLight}` : "none", borderTop: i >= 3 ? `1px solid ${C.borderLight}` : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                {featureIcon(f.icon)}
                <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{f.title}</span>
              </div>
              <p style={{ margin: 0, fontSize: 12, color: C.textSec, lineHeight: 1.5 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Overall Progress */}
      <Card style={{ padding: "20px 24px", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>My Training Progress</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: pctColor(overallPct) }}>{overallPct}% Complete</div>
        </div>
        <div style={{ height: 8, borderRadius: 4, background: C.bg, overflow: "hidden" }}>
          <div style={{ height: "100%", borderRadius: 4, background: overallPct === 100 ? C.suc : `linear-gradient(90deg, ${C.pri}, ${C.acc})`, width: `${overallPct}%`, transition: "width 0.5s" }} />
        </div>
        <div style={{ display: "flex", gap: 24, marginTop: 12 }}>
          <span style={{ fontSize: 12, color: C.textSec }}><strong style={{ color: C.text }}>{totalCompleted}</strong> of {totalCourses} courses completed</span>
          <span style={{ fontSize: 12, color: C.textSec }}><strong style={{ color: C.text }}>{curriculum.filter((_, i) => myStats[i].pct === 100).length}</strong> of {curriculum.length} modules completed</span>
        </div>
      </Card>

      {/* Module Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16, marginBottom: 32 }}>
        {curriculum.map((mod, mi) => {
          const stats = myStats[mi];
          const isOpen = expandedModule === mod.id;
          const userProg = progress[userId] || {};
          return (
            <Card key={mod.id} style={{ padding: 0, overflow: "hidden" }}>
              {/* Module header */}
              <div onClick={() => setExpandedModule(isOpen ? null : mod.id)} style={{ padding: "18px 20px", cursor: "pointer", display: "flex", alignItems: "center", gap: 14, transition: "background 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.background = C.surfaceHover} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: stats.pct === 100 ? `${C.suc}18` : `${C.pri}12`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {stats.pct === 100
                    ? <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.suc} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                    : <I.GraduationCap />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{mod.title}</span>
                    {!mod.required && <span style={{ fontSize: 10, fontWeight: 600, color: C.textMut, background: C.bg, borderRadius: 4, padding: "2px 6px" }}>Optional</span>}
                  </div>
                  <div style={{ fontSize: 12, color: C.textSec, marginTop: 2 }}>{mod.courses.length} course{mod.courses.length !== 1 ? "s" : ""} · {stats.completed}/{mod.courses.length} complete</div>
                  <div style={{ height: 4, borderRadius: 2, background: C.bg, marginTop: 6 }}>
                    <div style={{ height: "100%", borderRadius: 2, background: pctColor(stats.pct), width: `${stats.pct}%`, transition: "width 0.3s" }} />
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: pctColor(stats.pct) }}>{stats.pct}%</div>
                  {stats.avgScore !== null && <div style={{ fontSize: 10, color: C.textMut }}>Avg: {stats.avgScore}%</div>}
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.textMut} strokeWidth="2.5" strokeLinecap="round" style={{ transition: "transform 0.2s", transform: isOpen ? "rotate(90deg)" : "rotate(0deg)", flexShrink: 0 }}><polyline points="9 18 15 12 9 6"/></svg>
              </div>
              {/* Expanded course list */}
              {isOpen && (
                <div style={{ borderTop: `1px solid ${C.borderLight}`, background: C.bg }}>
                  {mod.courses.map((course, ci) => {
                    const cp = userProg[course.id];
                    const done = cp?.completed;
                    const score = cp?.bestScore;
                    return (
                      <div key={course.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderBottom: ci < mod.courses.length - 1 ? `1px solid ${C.borderLight}` : "none" }}>
                        <div style={{ width: 24, height: 24, borderRadius: 12, border: `2px solid ${done ? C.suc : C.border}`, background: done ? `${C.suc}18` : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          {done && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.suc} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: done ? C.suc : C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{course.title}</div>
                          <div style={{ fontSize: 11, color: C.textMut, display: "flex", gap: 8, marginTop: 2 }}>
                            <span>{course.duration}</span>
                            {course.isQuiz && <span style={{ color: C.pri, fontWeight: 600 }}>Quiz Required</span>}
                          </div>
                        </div>
                        {score != null && <Badge color={score >= 80 ? "success" : "warning"} size="sm">{score}%</Badge>}
                        <div style={{ padding: "5px 14px", borderRadius: 6, background: done ? `${C.suc}12` : C.priLt, color: done ? C.suc : C.pri, fontSize: 11, fontWeight: 700, cursor: "default", opacity: 0.6 }}>
                          {done ? "Completed" : "Coming Soon"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Management Review Modal */}
      {showMgmtReview && (
        <Modal title="Management Review — Employee Training Progress" onClose={() => { setShowMgmtReview(false); setSelectedEmployee(null); }} width={960}>
          <div style={{ fontSize: 12, color: C.textSec, marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>Showing all active team members from <button onClick={() => nav("settings")} style={{ color: C.pri, fontWeight: 600, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12, textDecoration: "underline" }}>Team Management</button></span>
            <span>{teamMembers.length} employee{teamMembers.length !== 1 ? "s" : ""}</span>
          </div>
          {teamMembers.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: C.textMut }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>No team members found</div>
              <div style={{ fontSize: 12 }}>Add employees in <button onClick={() => nav("settings")} style={{ color: C.pri, fontWeight: 600, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12, textDecoration: "underline" }}>Settings → Team Management</button> first.</div>
            </div>
          ) : (
            <div style={{ overflow: "auto", maxHeight: "60vh" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ background: C.bg, position: "sticky", top: 0, zIndex: 2 }}>
                    <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 700, color: C.textSec, borderBottom: `2px solid ${C.border}`, position: "sticky", left: 0, background: C.bg, zIndex: 3, minWidth: 160 }}>Employee</th>
                    <th style={{ padding: "10px 8px", textAlign: "center", fontWeight: 700, color: C.textSec, borderBottom: `2px solid ${C.border}`, minWidth: 60 }}>Overall</th>
                    {curriculum.map(mod => (
                      <th key={mod.id} style={{ padding: "10px 6px", textAlign: "center", fontWeight: 600, color: C.textMut, borderBottom: `2px solid ${C.border}`, fontSize: 10, minWidth: 80, lineHeight: 1.3 }}>{mod.title}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {teamMembers.map(emp => {
                    const empId = emp.userId || emp.id || emp.email;
                    const empStats = getUserModuleStats(empId);
                    const empTotal = curriculum.reduce((s, m) => s + m.courses.length, 0);
                    const empDone = empStats.reduce((s, m) => s + m.completed, 0);
                    const empPct = empTotal > 0 ? Math.round((empDone / empTotal) * 100) : 0;
                    return (
                      <tr key={empId} style={{ borderBottom: `1px solid ${C.borderLight}` }}
                        onMouseEnter={e => e.currentTarget.style.background = C.surfaceHover} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <td style={{ padding: "10px 12px", fontWeight: 600, color: C.text, position: "sticky", left: 0, background: "inherit", zIndex: 1 }}>
                          <div>{emp.name || emp.full_name || emp.email}</div>
                          <div style={{ fontSize: 10, fontWeight: 400, color: C.textMut }}>{emp.role || "Staff"}</div>
                        </td>
                        <td style={{ padding: "10px 8px", textAlign: "center" }}>
                          <span style={{ fontSize: 13, fontWeight: 800, color: pctColor(empPct) }}>{empPct}%</span>
                        </td>
                        {empStats.map((ms, i) => (
                          <td key={curriculum[i].id} style={{ padding: "10px 6px", textAlign: "center" }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: pctColor(ms.pct) }}>{ms.pct}%</div>
                            <div style={{ fontSize: 9, color: C.textMut }}>{ms.completed}/{ms.total}</div>
                            {ms.avgScore !== null && <div style={{ fontSize: 9, color: ms.avgScore >= 80 ? C.suc : C.warn }}>{ms.avgScore}%</div>}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

export { LMSPage };
