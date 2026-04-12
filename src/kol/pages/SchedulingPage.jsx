// K9 Operations — Scheduling Page (scaffold)
// Week Plan + Day Rotation + Required Headcount + Explanation + Warnings + Assumptions

import React, { useState, useMemo } from "react";
import { C, todayStr, addDays, DAY_NAMES_SHORT } from "../../shared/theme";
import { I } from "../../shared/icons";
import { Badge, Btn } from "../../shared/ui";

// ─── Placeholder Data ─────────────────────────────────────────────────────
const PLACEHOLDER_WEEK = Array.from({ length: 7 }, (_, i) => {
  const d = addDays(todayStr(), i);
  const dt = new Date(d + "T12:00:00");
  const isWeekend = dt.getDay() === 0 || dt.getDay() === 6;
  const base = isWeekend ? 0.7 : 1;
  return {
    date: d,
    dayName: DAY_NAMES_SHORT[dt.getDay()],
    dayNum: dt.getDate(),
    isWeekend,
    metrics: {
      boardingLarge: Math.round(22 * base),
      boardingSmall: Math.round(14 * base),
      daycareLarge: Math.round(34 * base),
      daycareSmall: Math.round(19 * base),
      ppDayboarders: Math.round(5 * base),
      ppOvernightBoarders: Math.round(8 * base),
      departureBaths: Math.round(9 * base),
      evaluations: Math.round(2 * base),
      tours: Math.round(1 * base),
      feedingDogs: Math.round(26 * base),
      medicationDogs: Math.round(7 * base),
      grossDogsInBuilding: Math.round(97 * base),
    },
    required: {
      functioningPctAm: Math.round(6 * base),
      functioningPctMidday: Math.round(5 * base),
      functioningPctPm: Math.round(5 * base),
      functionalHours: Math.round(58 * base),
    },
    assigned: {
      functioningPctAm: Math.round(5 * base),
      functioningPctMidday: Math.round(5 * base),
      functioningPctPm: Math.round(4 * base),
      functionalHours: Math.round(49 * base),
    },
    status: i === 0 ? "short" : i === 3 ? "short" : "ok",
    warnings: i === 0 ? ["Opening short by 1 fPCT", "Bath target at risk"] : i === 3 ? ["PM coverage short by 1"] : [],
  };
});

const SLOT_TIMES_WEEKDAY = [];
for (let h = 6; h < 20; h++) {
  for (let m = 0; m < 60; m += 15) {
    SLOT_TIMES_WEEKDAY.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }
}

const TASK_COLORS = {
  lgdc: { bg: "#DCFCE7", text: "#166534", label: "Large Daycare" },
  smdc: { bg: "#DBEAFE", text: "#1E40AF", label: "Small Daycare" },
  pp: { bg: "#FEE2E2", text: "#991B1B", label: "Private Play" },
  break: { bg: "#FEF9C3", text: "#854D0E", label: "Break" },
  bath: { bg: "#FCE7F3", text: "#9D174D", label: "Bath" },
  transport: { bg: "#FFEDD5", text: "#9A3412", label: "Transport" },
  feed: { bg: "#FFEDD5", text: "#9A3412", label: "Feed / Meds" },
  opening: { bg: "#EDE9FE", text: "#5B21B6", label: "Opening Let-Outs" },
  room_clean: { bg: "#F1F5F9", text: "#475569", label: "Room Clean" },
  float: { bg: "#F8FAFC", text: "#64748B", label: "Float / Avail" },
  sup: { bg: "#FEF3C7", text: "#92400E", label: "Supervisor" },
};

// Generate a plausible opening-morning rotation grid for demonstration
function buildPlaceholderGrid() {
  const lanes = ["fPCT 1", "fPCT 2", "fPCT 3", "fPCT 4", "fPCT 5", "SUP"];
  const grid = {};
  const morning = SLOT_TIMES_WEEKDAY.slice(0, 16); // 06:00–09:45

  lanes.forEach((lane, li) => {
    grid[lane] = {};
    morning.forEach((t, ti) => {
      let task = "float";
      if (li < 4) {
        if (ti < 4) task = "opening";
        else if (ti < 6) task = "room_clean";
        else if (ti < 8) task = li < 2 ? "lgdc" : "smdc";
        else if (ti < 10) task = li === 0 ? "bath" : li === 1 ? "pp" : li === 2 ? "lgdc" : "smdc";
        else if (ti === 10) task = "feed";
        else if (ti < 13) task = li < 2 ? "lgdc" : "smdc";
        else if (ti === 13) task = "break";
        else task = li < 2 ? "lgdc" : "smdc";
      }
      if (li === 4) {
        if (ti < 4) task = "opening";
        else if (ti < 6) task = "transport";
        else if (ti < 8) task = "bath";
        else if (ti < 10) task = "bath";
        else task = "float";
      }
      if (li === 5) {
        task = "sup";
        if (ti === 6) task = "lgdc";
      }
      grid[lane][t] = task;
    });
  });
  return { lanes, slots: morning, grid };
}

const PLACEHOLDER_GRID = buildPlaceholderGrid();

const PLACEHOLDER_ASSUMPTIONS = {
  daycareRatioLarge: 25,
  daycareRatioSmall: 25,
  groupTransportMin: 2,
  morningRoomCleanMin: 2.5,
  ppMoveMinEachWay: 1.5,
  ppBoxDwellMin: 4,
  ppRoundsPerDay: 3,
  bathActiveMin: 15,
  bathPassiveDryMin: 30,
  dryerCapacity: 2,
  feedMinPerDog: 1.5,
  medMinPerDog: 2,
  breakMinutes: 30,
  maxBreaksSmallTeam: 1,
  maxBreaksLargeTeam: 2,
  largeTeamThreshold: 6,
  supervisorBufferMin: 120,
};

// ─── Utility Components ───────────────────────────────────────────────────

function SectionCard({ title, subtitle, icon, children, style }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "20px 24px", ...style }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: subtitle ? 4 : 16 }}>
        {icon && <span style={{ color: C.pri, display: "flex" }}>{icon}</span>}
        <h3 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: 0 }}>{title}</h3>
      </div>
      {subtitle && <p style={{ fontSize: 12, color: C.textMut, margin: "0 0 16px 0" }}>{subtitle}</p>}
      {children}
    </div>
  );
}

function MetricPill({ label, value, sub, warn }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, minWidth: 56 }}>
      <span style={{ fontSize: 20, fontWeight: 700, color: warn ? C.dan : C.text, lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: 10, fontWeight: 600, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", textAlign: "center" }}>{label}</span>
      {sub !== undefined && <span style={{ fontSize: 10, color: warn ? C.dan : C.textMut }}>{sub}</span>}
    </div>
  );
}

function StatusChip({ status }) {
  const map = {
    ok: { bg: C.sucLt, color: C.suc, label: "Covered" },
    short: { bg: C.danLt, color: C.dan, label: "Short" },
    draft: { bg: C.warnLt, color: C.warn, label: "Draft" },
  };
  const s = map[status] || map.ok;
  return <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 700, background: s.bg, color: s.color }}>{s.label}</span>;
}

// ─── Main Page ────────────────────────────────────────────────────────────

export default function SchedulingPage({ data, nav, profile, addGlobalToast }) {
  const [selectedDayIdx, setSelectedDayIdx] = useState(0);
  const [viewDensity, setViewDensity] = useState("standard"); // compact | standard | expanded
  const [showAssumptions, setShowAssumptions] = useState(false);

  const selectedDay = PLACEHOLDER_WEEK[selectedDayIdx];
  const m = selectedDay.metrics;
  const req = selectedDay.required;
  const asgn = selectedDay.assigned;
  const { lanes, slots, grid } = PLACEHOLDER_GRID;

  const fmt12 = (t) => {
    const [h, mn] = t.split(":").map(Number);
    const suffix = h >= 12 ? "PM" : "AM";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${String(mn).padStart(2, "0")} ${suffix}`;
  };

  const rowH = viewDensity === "compact" ? 26 : viewDensity === "expanded" ? 40 : 32;

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 0 48px" }}>
      {/* ── Page Header ───────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0 }}>Scheduling</h1>
          <p style={{ fontSize: 13, color: C.textMut, marginTop: 2 }}>Week plan, required headcount, and rotation rationale</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="secondary" size="sm" onClick={() => setShowAssumptions(!showAssumptions)}>
            {showAssumptions ? "Hide" : "Show"} Assumptions
          </Btn>
          <Btn variant="primary" size="sm" onClick={() => addGlobalToast && addGlobalToast("Schedule generation is not yet connected to a backend engine.", "info")}>
            Generate Schedule
          </Btn>
        </div>
      </div>

      {/* ── Section 1: 7-Day Raw Matrix ───────────────────────────────── */}
      <SectionCard title="7-Day Demand Matrix" subtitle="Raw Gingr-driven operational numbers for the upcoming week" icon={<I.Calendar />}>
        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: 12, minWidth: 680 }}>
            <thead>
              <tr style={{ background: C.priLt }}>
                {["Day", "Gross", "BDG LG", "BDG SM", "DC LG", "DC SM", "PP", "Baths", "Feed", "Meds", "Status"].map(h => (
                  <th key={h} style={{ padding: "8px 10px", fontWeight: 700, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.04em", color: C.textMut, textAlign: h === "Day" ? "left" : "center", borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PLACEHOLDER_WEEK.map((day, i) => {
                const sel = i === selectedDayIdx;
                return (
                  <tr key={day.date} onClick={() => setSelectedDayIdx(i)} style={{ cursor: "pointer", background: sel ? C.priLt : i % 2 === 0 ? C.surface : C.surfaceHover, transition: "background 0.1s" }}>
                    <td style={{ padding: "8px 10px", fontWeight: sel ? 700 : 500, color: sel ? C.pri : C.text, borderBottom: `1px solid ${C.borderLight}`, whiteSpace: "nowrap" }}>
                      <span style={{ fontWeight: 700 }}>{day.dayName}</span> <span style={{ color: C.textMut }}>{day.dayNum}</span>
                      {day.isWeekend && <span style={{ marginLeft: 6, fontSize: 9, padding: "1px 5px", borderRadius: 4, background: C.infoLt, color: C.info, fontWeight: 600 }}>WE</span>}
                    </td>
                    <td style={{ textAlign: "center", padding: "8px 6px", fontWeight: 600, color: C.text, borderBottom: `1px solid ${C.borderLight}` }}>{day.metrics.grossDogsInBuilding}</td>
                    <td style={{ textAlign: "center", padding: "8px 6px", borderBottom: `1px solid ${C.borderLight}` }}>{day.metrics.boardingLarge}</td>
                    <td style={{ textAlign: "center", padding: "8px 6px", borderBottom: `1px solid ${C.borderLight}` }}>{day.metrics.boardingSmall}</td>
                    <td style={{ textAlign: "center", padding: "8px 6px", borderBottom: `1px solid ${C.borderLight}` }}>{day.metrics.daycareLarge}</td>
                    <td style={{ textAlign: "center", padding: "8px 6px", borderBottom: `1px solid ${C.borderLight}` }}>{day.metrics.daycareSmall}</td>
                    <td style={{ textAlign: "center", padding: "8px 6px", borderBottom: `1px solid ${C.borderLight}` }}>{day.metrics.ppDayboarders + day.metrics.ppOvernightBoarders}</td>
                    <td style={{ textAlign: "center", padding: "8px 6px", borderBottom: `1px solid ${C.borderLight}` }}>{day.metrics.departureBaths}</td>
                    <td style={{ textAlign: "center", padding: "8px 6px", borderBottom: `1px solid ${C.borderLight}` }}>{day.metrics.feedingDogs}</td>
                    <td style={{ textAlign: "center", padding: "8px 6px", borderBottom: `1px solid ${C.borderLight}` }}>{day.metrics.medicationDogs}</td>
                    <td style={{ textAlign: "center", padding: "8px 6px", borderBottom: `1px solid ${C.borderLight}` }}><StatusChip status={day.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* ── Section 2: Required Headcount ──────────────────────────────── */}
      <SectionCard
        title={`Required Headcount — ${selectedDay.dayName} ${selectedDay.dayNum}`}
        subtitle="Functioning PCT requirement by daypart, driven by the demand matrix above"
        icon={<I.Users />}
        style={{ marginTop: 16 }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
          {/* Opening */}
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: C.textMut, letterSpacing: "0.04em", marginBottom: 8 }}>Opening (AM)</div>
            <div style={{ display: "flex", gap: 20 }}>
              <MetricPill label="Required" value={req.functioningPctAm} />
              <MetricPill label="Assigned" value={asgn.functioningPctAm} warn={asgn.functioningPctAm < req.functioningPctAm} />
              <MetricPill label="Gap" value={Math.max(0, req.functioningPctAm - asgn.functioningPctAm)} sub={asgn.functioningPctAm >= req.functioningPctAm ? "covered" : "short"} warn={asgn.functioningPctAm < req.functioningPctAm} />
            </div>
          </div>
          {/* Midday */}
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: C.textMut, letterSpacing: "0.04em", marginBottom: 8 }}>Midday</div>
            <div style={{ display: "flex", gap: 20 }}>
              <MetricPill label="Required" value={req.functioningPctMidday} />
              <MetricPill label="Assigned" value={asgn.functioningPctMidday} warn={asgn.functioningPctMidday < req.functioningPctMidday} />
              <MetricPill label="Gap" value={Math.max(0, req.functioningPctMidday - asgn.functioningPctMidday)} sub={asgn.functioningPctMidday >= req.functioningPctMidday ? "covered" : "short"} warn={asgn.functioningPctMidday < req.functioningPctMidday} />
            </div>
          </div>
          {/* Closing */}
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: C.textMut, letterSpacing: "0.04em", marginBottom: 8 }}>Closing (PM)</div>
            <div style={{ display: "flex", gap: 20 }}>
              <MetricPill label="Required" value={req.functioningPctPm} />
              <MetricPill label="Assigned" value={asgn.functioningPctPm} warn={asgn.functioningPctPm < req.functioningPctPm} />
              <MetricPill label="Gap" value={Math.max(0, req.functioningPctPm - asgn.functioningPctPm)} sub={asgn.functioningPctPm >= req.functioningPctPm ? "covered" : "short"} warn={asgn.functioningPctPm < req.functioningPctPm} />
            </div>
          </div>
        </div>
        {/* Total hours strip */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 14, padding: "10px 14px", borderRadius: 10, background: asgn.functionalHours < req.functionalHours ? C.danLt : C.sucLt }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: C.textSec }}>Total Functional Hours</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{asgn.functionalHours} / {req.functionalHours} hrs</span>
          {asgn.functionalHours < req.functionalHours && <Badge color="danger" size="sm">{req.functionalHours - asgn.functionalHours} hrs short</Badge>}
        </div>
      </SectionCard>

      {/* ── Section 3: 15-Minute Rotation Grid ────────────────────────── */}
      <SectionCard
        title={`AM Rotation — ${selectedDay.dayName} ${selectedDay.dayNum}`}
        subtitle="15-minute slot assignments for opening block (06:00 - 10:00). Scroll horizontally on smaller screens."
        icon={<I.Clipboard />}
        style={{ marginTop: 16 }}
      >
        {/* Density toggle */}
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {["compact", "standard", "expanded"].map(d => (
            <button key={d} onClick={() => setViewDensity(d)} style={{ padding: "4px 12px", border: `1px solid ${d === viewDensity ? C.pri : C.border}`, borderRadius: 8, background: d === viewDensity ? C.priLt : C.surface, color: d === viewDensity ? C.pri : C.textMut, fontSize: 11, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", textTransform: "capitalize" }}>{d}</button>
          ))}
        </div>
        <div style={{ overflowX: "auto", borderRadius: 10, border: `1px solid ${C.border}` }}>
          <table style={{ borderCollapse: "collapse", fontSize: viewDensity === "compact" ? 10 : 11, minWidth: 600, width: "100%" }}>
            <thead>
              <tr>
                <th style={{ position: "sticky", left: 0, zIndex: 2, background: "#F8FAFC", padding: `6px 10px`, borderBottom: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}`, fontSize: 10, fontWeight: 700, textAlign: "left", color: C.textMut }}>Time</th>
                {lanes.map(l => (
                  <th key={l} style={{ padding: `6px 8px`, borderBottom: `1px solid ${C.border}`, fontSize: 10, fontWeight: 700, textAlign: "center", color: C.textMut, whiteSpace: "nowrap", background: "#F8FAFC" }}>{l}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {slots.map((t, ti) => (
                <tr key={t}>
                  <td style={{ position: "sticky", left: 0, zIndex: 1, background: ti % 4 === 0 ? "#F1F5F9" : "#F8FAFC", padding: `${rowH / 2 - 5}px 10px`, borderBottom: `1px solid ${ti % 4 === 3 ? C.border : C.borderLight}`, borderRight: `1px solid ${C.border}`, fontWeight: ti % 4 === 0 ? 700 : 400, color: ti % 4 === 0 ? C.text : C.textMut, whiteSpace: "nowrap", fontSize: 10 }}>{fmt12(t)}</td>
                  {lanes.map(l => {
                    const taskKey = grid[l]?.[t] || "float";
                    const tc = TASK_COLORS[taskKey] || TASK_COLORS.float;
                    return (
                      <td key={l} style={{ padding: `${rowH / 2 - 5}px 6px`, textAlign: "center", borderBottom: `1px solid ${ti % 4 === 3 ? C.border : C.borderLight}`, background: tc.bg, color: tc.text, fontWeight: 600, fontSize: viewDensity === "compact" ? 9 : 10, whiteSpace: "nowrap", letterSpacing: "0.02em" }}>
                        {viewDensity !== "compact" ? tc.label : taskKey.toUpperCase()}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Legend */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          {Object.entries(TASK_COLORS).map(([k, v]) => (
            <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600, color: v.text }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: v.bg, border: `1px solid ${v.text}22` }} />
              {v.label}
            </span>
          ))}
        </div>
      </SectionCard>

      {/* ── Section 4: Rationale / Explanation Panel ───────────────────── */}
      <SectionCard
        title="Opening Rationale"
        subtitle="Why this headcount was recommended and which strategy was selected"
        icon={<I.InfoCircle />}
        style={{ marginTop: 16 }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ padding: "12px 16px", borderRadius: 10, background: C.priLt, border: `1px solid ${C.pri}22` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.pri, marginBottom: 4 }}>Strategy: Split (Group Let-Outs + PP Pod Pass)</div>
            <p style={{ fontSize: 12, color: C.textSec, margin: 0, lineHeight: 1.6 }}>
              With {m.boardingLarge + m.boardingSmall} overnight boarding dogs and {m.ppOvernightBoarders} private-play overnights,
              full pod pass would exceed the 60-minute opening window. The engine recommends a split strategy:
              group let-outs for {m.boardingLarge + m.boardingSmall} group-play dogs (staggered wave, large daycare first)
              with 1 dedicated fPCT on pod pass for {m.ppOvernightBoarders} PP dogs.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            <div style={{ padding: "10px 14px", borderRadius: 8, background: C.surfaceHover, border: `1px solid ${C.borderLight}` }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase" }}>Key Driver</span>
              <p style={{ fontSize: 12, fontWeight: 600, color: C.text, margin: "4px 0 0" }}>{m.grossDogsInBuilding} dogs in building drives {req.functioningPctAm} fPCT requirement</p>
            </div>
            <div style={{ padding: "10px 14px", borderRadius: 8, background: C.surfaceHover, border: `1px solid ${C.borderLight}` }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase" }}>First Yard</span>
              <p style={{ fontSize: 12, fontWeight: 600, color: C.text, margin: "4px 0 0" }}>Large daycare opened first ({m.boardingLarge} dogs &gt; {m.boardingSmall} small-side dogs)</p>
            </div>
            <div style={{ padding: "10px 14px", borderRadius: 8, background: C.surfaceHover, border: `1px solid ${C.borderLight}` }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase" }}>Feasibility</span>
              <p style={{ fontSize: 12, fontWeight: 600, color: selectedDay.status === "short" ? C.dan : C.suc, margin: "4px 0 0" }}>
                {selectedDay.status === "short" ? "Borderline — opening is 1 fPCT short of full coverage" : "Feasible — opening fully covered with current staffing"}
              </p>
            </div>
            <div style={{ padding: "10px 14px", borderRadius: 8, background: C.surfaceHover, border: `1px solid ${C.borderLight}` }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase" }}>Bath Target</span>
              <p style={{ fontSize: 12, fontWeight: 600, color: C.text, margin: "4px 0 0" }}>{m.departureBaths} departure baths — {m.departureBaths > 6 ? "may require dedicated bath fPCT by 07:30" : "manageable within normal rotation"}</p>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* ── Section 5: Shortage / Warnings Area ───────────────────────── */}
      <SectionCard
        title="Shortages & Warnings"
        subtitle="Issues that need manager attention for the selected day"
        icon={<I.AlertTriangle />}
        style={{ marginTop: 16 }}
      >
        {selectedDay.warnings.length === 0 ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 0" }}>
            <I.CheckCircle />
            <span style={{ fontSize: 13, fontWeight: 600, color: C.suc }}>No shortages or warnings for this day. All dayparts covered.</span>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {selectedDay.warnings.map((w, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px", borderRadius: 10, background: C.warnLt, border: `1px solid ${C.warn}22` }}>
                <I.AlertTriangle style={{ color: C.warn, flexShrink: 0, marginTop: 1 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{w}</div>
                  <div style={{ fontSize: 11, color: C.textMut, marginTop: 2 }}>
                    {w.includes("Opening") && "Consider moving a CSR to fPCT role during early AM (before public prep window) or requesting MOD backfill."}
                    {w.includes("Bath") && "Bath throughput may push departure bath completion past the 11:00 AM target. Consider starting baths at 06:30 or adding a second bath fPCT."}
                    {w.includes("PM") && "Afternoon closing coverage is 1 fPCT short. Return-to-room transport and dinner feed may run late."}
                  </div>
                </div>
              </div>
            ))}
            <div style={{ padding: "10px 14px", borderRadius: 10, background: C.danLt, border: `1px solid ${C.dan}22`, marginTop: 4 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.dan, marginBottom: 4 }}>Degraded Mode Impact</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: C.textSec, lineHeight: 1.8 }}>
                <li>Bath target may be missed by ~45 min</li>
                <li>Supervisor may need to stand in large daycare during group let-outs</li>
                <li>CSR pre-open prep window shortened to 15 min (30 min recommended)</li>
              </ul>
            </div>
          </div>
        )}
      </SectionCard>

      {/* ── Section 6: Assumptions & Density Controls ─────────────────── */}
      {showAssumptions && (
        <SectionCard
          title="Assumptions & Configuration"
          subtitle="Default values used to compute required headcount and rotation schedule. Edit these per-location in Settings."
          icon={<I.Settings />}
          style={{ marginTop: 16 }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
            {[
              { group: "Daycare Ratios", items: [{ l: "Large DC ratio", v: `${PLACEHOLDER_ASSUMPTIONS.daycareRatioLarge}:1` }, { l: "Small DC ratio", v: `${PLACEHOLDER_ASSUMPTIONS.daycareRatioSmall}:1` }] },
              { group: "Transport & Room", items: [{ l: "Group transport (each way)", v: `${PLACEHOLDER_ASSUMPTIONS.groupTransportMin} min` }, { l: "Morning room clean", v: `${PLACEHOLDER_ASSUMPTIONS.morningRoomCleanMin} min` }] },
              { group: "Private Play", items: [{ l: "PP move (each way)", v: `${PLACEHOLDER_ASSUMPTIONS.ppMoveMinEachWay} min` }, { l: "PP box dwell", v: `${PLACEHOLDER_ASSUMPTIONS.ppBoxDwellMin} min` }, { l: "PP rounds/day", v: PLACEHOLDER_ASSUMPTIONS.ppRoundsPerDay }] },
              { group: "Baths", items: [{ l: "Bath active", v: `${PLACEHOLDER_ASSUMPTIONS.bathActiveMin} min` }, { l: "Passive dry", v: `${PLACEHOLDER_ASSUMPTIONS.bathPassiveDryMin} min` }, { l: "Dryer capacity", v: PLACEHOLDER_ASSUMPTIONS.dryerCapacity }] },
              { group: "Feed & Meds", items: [{ l: "Feed per dog", v: `${PLACEHOLDER_ASSUMPTIONS.feedMinPerDog} min` }, { l: "Med per dog", v: `${PLACEHOLDER_ASSUMPTIONS.medMinPerDog} min` }] },
              { group: "Breaks & Staffing", items: [{ l: "Break length", v: `${PLACEHOLDER_ASSUMPTIONS.breakMinutes} min` }, { l: "Large team threshold", v: `${PLACEHOLDER_ASSUMPTIONS.largeTeamThreshold}+` }, { l: "SUP buffer", v: `${PLACEHOLDER_ASSUMPTIONS.supervisorBufferMin} min` }] },
            ].map(({ group, items }) => (
              <div key={group} style={{ padding: "12px 14px", borderRadius: 10, background: C.surfaceHover, border: `1px solid ${C.borderLight}` }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", color: C.textMut, letterSpacing: "0.04em", marginBottom: 8 }}>{group}</div>
                {items.map(({ l, v }) => (
                  <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 12 }}>
                    <span style={{ color: C.textSec }}>{l}</span>
                    <span style={{ fontWeight: 600, color: C.text }}>{v}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11, color: C.textMut, marginTop: 14, fontStyle: "italic" }}>
            These defaults match the implementation packet. Override per-location under Settings &rarr; Schedule Config (not yet connected).
          </p>
        </SectionCard>
      )}
    </div>
  );
}
