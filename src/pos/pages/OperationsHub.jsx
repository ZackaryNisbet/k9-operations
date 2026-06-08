import { C } from "../constants/colors";
import { Card } from "../components/ui";
import { DEF_CLOSING_TEMPLATE, OPERATIONS_CATALOG } from "../constants/operations";
import { ROOM_TYPES } from "../constants/forms";
import { addDays, todayStr } from "../lib/format";
import { getOpsCardStatus, getOpsCountLabel, getOpsProgress, getPPStats, getRoomCleaningStats } from "../lib/ops";
import { hasPermission } from "../lib/roles";
import { useEffect, useMemo, useRef, useState } from "react";

function OperationsHub({ data, save, nav, profile }) {
  const td = todayStr();
  const [viewDate, setViewDate] = useState(td);
  const isToday = viewDate === td;
  const shiftDate = (days) => { const d = new Date(viewDate + "T12:00:00"); d.setDate(d.getDate() + days); setViewDate(d.toISOString().split("T")[0]); };
  const dateLbl = new Date(viewDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const hp = (k) => hasPermission(profile, data, k);

  // Calendar popup
  const [showCalendar, setShowCalendar] = useState(false);
  const [calMonth, setCalMonth] = useState(() => new Date(viewDate + "T12:00:00").getMonth());
  const [calYear, setCalYear] = useState(() => new Date(viewDate + "T12:00:00").getFullYear());
  useEffect(() => { const d = new Date(viewDate + "T12:00:00"); setCalMonth(d.getMonth()); setCalYear(d.getFullYear()); }, [showCalendar]);
  const calDays = useMemo(() => { const first = new Date(calYear, calMonth, 1); const startDay = first.getDay(); const dim = new Date(calYear, calMonth + 1, 0).getDate(); const cells = []; for (let i = 0; i < startDay; i++) cells.push(null); for (let d = 1; d <= dim; d++) cells.push(d); return cells; }, [calMonth, calYear]);
  const calMonthLabel = new Date(calYear, calMonth).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const calPrev = () => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); };
  const calNext = () => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); };
  const calSelect = (day) => { const m = String(calMonth + 1).padStart(2, "0"); const d = String(day).padStart(2, "0"); setViewDate(`${calYear}-${m}-${d}`); setShowCalendar(false); };
  const calRef = useRef(null);
  useEffect(() => { if (!showCalendar) return; const handler = (e) => { if (calRef.current && !calRef.current.contains(e.target)) setShowCalendar(false); }; document.addEventListener("mousedown", handler); return () => document.removeEventListener("mousedown", handler); }, [showCalendar]);

  // Today's Progress snapshot
  const [showTodayProgress, setShowTodayProgress] = useState(false);

  // Summary analytics
  const [expandSummary, setExpandSummary] = useState(false);
  const summaryStats = useMemo(() => {
    const activeItems = OPERATIONS_CATALOG.filter(c => c.frequency === "daily" && !c.comingSoon && c.dataKey !== "eodEntries");
    // Today stats
    const todayCompleted = activeItems.filter(c => getOpsCardStatus(data, c, viewDate) === "completed").length;
    const todayTotal = activeItems.length;
    const todayPct = todayTotal > 0 ? Math.round((todayCompleted / todayTotal) * 100) : 0;
    // Weekly averages (past 7 days)
    const weeklyByChecklist = {};
    const lastWeekByChecklist = {};
    for (let i = 0; i < 14; i++) {
      const d = addDays(viewDate, -i);
      activeItems.forEach(item => {
        const status = getOpsCardStatus(data, item, d);
        const completed = status === "completed" ? 1 : 0;
        if (i < 7) {
          if (!weeklyByChecklist[item.label]) weeklyByChecklist[item.label] = { sum: 0, count: 0 };
          weeklyByChecklist[item.label].sum += completed;
          weeklyByChecklist[item.label].count++;
        } else {
          if (!lastWeekByChecklist[item.label]) lastWeekByChecklist[item.label] = { sum: 0, count: 0 };
          lastWeekByChecklist[item.label].sum += completed;
          lastWeekByChecklist[item.label].count++;
        }
      });
    }
    // MTD averages
    const mtdByChecklist = {};
    const dObj = new Date(viewDate + "T12:00:00");
    const dayOfMonth = dObj.getDate();
    for (let i = 0; i < dayOfMonth; i++) {
      const d = addDays(viewDate, -i);
      activeItems.forEach(item => {
        const status = getOpsCardStatus(data, item, d);
        if (!mtdByChecklist[item.label]) mtdByChecklist[item.label] = { sum: 0, count: 0 };
        mtdByChecklist[item.label].sum += (status === "completed" ? 1 : 0);
        mtdByChecklist[item.label].count++;
      });
    }
    // Build per-checklist rows
    const rows = activeItems.map(item => {
      const wk = weeklyByChecklist[item.label] || { sum: 0, count: 1 };
      const lw = lastWeekByChecklist[item.label] || { sum: 0, count: 1 };
      const mt = mtdByChecklist[item.label] || { sum: 0, count: 1 };
      const weeklyAvg = Math.round((wk.sum / wk.count) * 100);
      const lastWeekAvg = Math.round((lw.sum / lw.count) * 100);
      const mtdAvg = Math.round((mt.sum / mt.count) * 100);
      const wowDiff = weeklyAvg - lastWeekAvg;
      return { label: item.label, weeklyAvg, lastWeekAvg, wowDiff, mtdAvg };
    });
    return { todayCompleted, todayTotal, todayPct, rows };
  }, [data, viewDate]);

  // ─── Today's Progress snapshot data ───
  const todayProgressData = useMemo(() => {
    const reservations = data.reservations || [];
    const allOps = data.dailyOps || [];
    const dogs = data.dogs || [];

    // Dogs in house: physically checked in and not yet checked out
    const inHouseRes = reservations.filter(r => r.status === "checked-in");
    // Deduplicate by dogId to avoid counting the same dog twice for overlapping reservations
    const seenDogIds = new Set();
    const inHouse = inHouseRes.filter(r => {
      if (!r.dogId) return true;
      if (seenDogIds.has(r.dogId)) return false;
      seenDogIds.add(r.dogId);
      return true;
    });
    const inHouseBoarding = inHouse.filter(r => r.type === "boarding");
    const inHouseDaycare = inHouse.filter(r => r.type === "daycare" || r.type === "dayboarding");
    const dogsInHouse = inHouse.length;

    // Going home today (checked-in, scheduled or actual checkOut === viewDate)
    const goingHome = reservations.filter(r => r.status === "checked-in" && (r.checkOut === viewDate || r.scheduledCheckOut === viewDate));
    // Already checked out today (actual checkout date is today)
    const checkedOut = reservations.filter(r => r.checkOut === viewDate && r.status === "checked-out");

    // Room cleaning stats + awaiting checkout count
    const roomStats = getRoomCleaningStats(data, viewDate);
    const allRooms = data.rooms || {};
    const boardingCheckedOut = reservations.filter(r => r.type === "boarding" && r.checkOut === viewDate && r.status === "checked-out");
    let roomsAwaitingCheckout = 0;
    ROOM_TYPES.forEach(rt => {
      (allRooms[rt] || []).forEach(rm => {
        const activeRes = inHouseBoarding.find(r => r.room === rm);
        const coRes = boardingCheckedOut.find(r => r.room === rm);
        // Needs disinfect (scheduled or actual checkOut === viewDate) but dog hasn't checked out yet
        if (activeRes && (activeRes.checkOut === viewDate || activeRes.scheduledCheckOut === viewDate) && !coRes) roomsAwaitingCheckout++;
      });
    });

    // Baths: checked-in dogs checking out today that have a bath type (includes departure time)
    const bathRows = [];
    inHouse.forEach(res => {
      const dog = dogs.find(d => d.id === res.dogId);
      if (!dog) return;
      const bath = res.careOverrides?.bath_type || dog.fields.bath_type || "";
      if (bath && res.checkOut === viewDate) {
        const logKey = `${viewDate}|bathing`;
        const administered = !!(res.activityLog && res.activityLog[logKey] && res.activityLog[logKey].administered);
        const coTime = res.checkOutTime || "";
        bathRows.push({ dogName: dog.fields.name, bathType: bath, done: administered, checkOutTime: coTime });
      }
    });
    const bathsTotal = bathRows.length;
    const bathsDone = bathRows.filter(b => b.done).length;

    // Pictures: boarding dogs not on first or last day (same logic as renderPictures)
    const pictureDogs = reservations.filter(r => r.type === "boarding" && r.status === "checked-in" && r.checkIn < viewDate && r.checkOut > viewDate);
    const picEntryId = `ops_pictures_${viewDate}`;
    const picEntry = allOps.find(e => e.id === picEntryId);
    const picItems = picEntry ? picEntry.items || {} : {};
    const picturesTotal = pictureDogs.length;
    const picturesDone = pictureDogs.filter(r => picItems[r.dogId]).length;

    // Private play stats (3 required sessions per dog)
    const ppStats = getPPStats(data, viewDate);
    const ppEntryId = `ops_pp_${viewDate}`;
    const ppEntry = allOps.find(e => e.id === ppEntryId);
    const ppItems = ppEntry ? ppEntry.items || {} : {};
    let ppLastTime = null;
    Object.values(ppItems).forEach(d => {
      if (d && d.sessions) d.sessions.forEach(s => { if (s.time) ppLastTime = s.time; });
    });

    // Checklist progress for each ops type
    const checklistProgress = {};
    const activeItems = OPERATIONS_CATALOG.filter(c => c.frequency === "daily" && !c.comingSoon && c.dataKey !== "eodEntries");
    activeItems.forEach(item => {
      const progress = getOpsProgress(data, item, viewDate);
      const status = getOpsCardStatus(data, item, viewDate);
      const countLabel = getOpsCountLabel(data, item, viewDate);
      checklistProgress[item.typeSub || item.id] = { label: item.label, progress, status, countLabel };
    });

    // Closing procedures specifically
    const closingEntryId = `ops_closing_${viewDate}`;
    const closingEntry = allOps.find(e => e.id === closingEntryId);
    const closingTemplate = data.closingTemplate || DEF_CLOSING_TEMPLATE;
    const dayIdx = new Date(viewDate + "T12:00:00").getDay();
    const closingItems = closingTemplate.filter(t => t.dayOfWeek == null || t.dayOfWeek === dayIdx);
    const closingTotal = closingItems.length;
    let closingDone = 0;
    if (closingEntry && closingEntry.items) {
      const ci = closingEntry.items;
      closingDone = !Array.isArray(ci) ? Object.values(ci).filter(i => i && i.checked).length : ci.filter(i => i.checked).length;
    }

    // ─── Lifecycle stats ───
    const clients = data.clients || [];
    const payments = data.payments || [];

    // Build local stage map (mirrors Customer Lifecycle page's clientTabMap logic)
    const dcThresh = data.resortPolicies?.retentionDaycareDays ?? 90;
    const bdThresh = data.resortPolicies?.retentionBoardingDays ?? 180;
    const localStageMap = {};
    clients.forEach(c => {
      const cRes = (data.reservations || []).filter(r => r.clientId === c.id);
      const cDogs = (data.dogs || []).filter(d => d.clientId === c.id);
      const cPmts = (data.payments || []).filter(p => p.clientId === c.id && p.status === "completed" && p.type !== "refund");
      const totalSpent = cPmts.reduce((s, p) => s + (p.amount || 0), 0);
      const hasSpent = totalSpent > 0;
      const hasRealBooking = cRes.some(r => r.type !== "tour" && r.type !== "evaluation");
      const hasUpcoming = cRes.some(r => r.checkIn >= todayStr() && r.status === "upcoming" && r.type !== "tour" && r.type !== "evaluation");
      const totalRes = cRes.length;
      const pastRes = cRes.filter(r => r.checkOut && r.checkOut < todayStr()).sort((a, b) => b.checkOut.localeCompare(a.checkOut));
      const daysSince = pastRes.length > 0 ? Math.floor((new Date() - new Date(pastRes[0].checkOut + "T12:00:00")) / 86400000) : null;
      const daycareCount = cRes.filter(r => r.type === "daycare").length;
      const boardingCount = cRes.filter(r => r.type === "boarding").length;
      const isCold = c.lifecycle?.cold === true;
      let isRetention = false;
      if (hasSpent && !hasUpcoming && totalRes > 0 && daysSince != null) {
        const dcPct = totalRes > 0 ? (daycareCount / totalRes) : 0;
        const bdPct = totalRes > 0 ? (boardingCount / totalRes) : 0;
        if (bdPct > 0.5 && daysSince >= bdThresh) isRetention = true;
        else if (dcPct >= 0.5 && daysSince >= dcThresh) isRetention = true;
        else if (dcPct < 0.5 && bdPct < 0.5 && daysSince >= dcThresh) isRetention = true;
      }
      const isConversion = !hasSpent && !hasRealBooking && !isCold;
      const isActive = (hasSpent || hasRealBooking) && !isRetention && !isCold;
      if (isCold) isRetention = false;
      localStageMap[c.id] = { isConversion, isActive, isRetention: isRetention && !isCold, isCold };
    });

    // Overdue follow-ups: only count clients actually in conversion or retention stages
    let overdueFollowUps = 0;
    let dueTodayFollowUps = 0;
    clients.forEach(c => {
      const tab = localStageMap[c.id];
      // Only count conversion follow-ups for clients in conversion stage
      const convFu = (tab?.isConversion && c.lifecycle?.conversion?.followUpDate) || "";
      // Only count retention follow-ups for clients in retention stage
      const retFu = (tab?.isRetention && c.lifecycle?.retention?.followUpDate) || "";
      const fu = convFu || retFu;
      if (fu && fu < viewDate) overdueFollowUps++;
      if (fu && fu === viewDate) dueTodayFollowUps++;
    });

    // Lifecycle logs/updates made today (conversion + retention updates with loggedAt on viewDate)
    let logsToday = 0;
    clients.forEach(c => {
      const convUpdates = c.lifecycle?.conversion?.updates || [];
      const retUpdates = c.lifecycle?.retention?.updates || [];
      [...convUpdates, ...retUpdates].forEach(u => {
        if (u.loggedAt && u.loggedAt.startsWith(viewDate)) logsToday++;
      });
    });

    // New customers created today
    const newCustomersToday = clients.filter(c => {
      const ca = c.createdAt || "";
      return ca.startsWith(viewDate) || ca === viewDate;
    }).length;

    // New PAYING customers: clients whose first-ever completed payment was on viewDate
    let newPayingToday = 0;
    const paymentsByClient = {};
    payments.filter(p => p.status === "completed" && p.type !== "refund").forEach(p => {
      if (!paymentsByClient[p.clientId]) paymentsByClient[p.clientId] = [];
      paymentsByClient[p.clientId].push(p);
    });
    Object.entries(paymentsByClient).forEach(([cid, pmts]) => {
      pmts.sort((a, b) => (a.timestamp || "").localeCompare(b.timestamp || ""));
      const first = pmts[0];
      if (first && first.timestamp && first.timestamp.startsWith(viewDate)) newPayingToday++;
    });

    return {
      dogsInHouse,
      boardingCount: inHouseBoarding.length,
      daycareCount: inHouseDaycare.length,
      goingHome: goingHome.length,
      checkedOut: checkedOut.length,
      roomStats,
      roomsAwaitingCheckout,
      bathsTotal,
      bathsDone,
      bathRows,
      picturesTotal,
      picturesDone,
      ppTotalDogs: ppStats.totalDogs,
      ppRequiredSessions: ppStats.requiredSessions,
      ppCompletedRequired: ppStats.completedSessions,
      ppTotalLogged: ppStats.totalLogged,
      ppLastTime,
      checklistProgress,
      closingTotal,
      closingDone,
      overdueFollowUps,
      dueTodayFollowUps,
      logsToday,
      newCustomersToday,
      newPayingToday,
    };
  }, [data, viewDate]);

  const groups = [
    { key: "daily", label: "Daily Operations", items: OPERATIONS_CATALOG.filter(c => c.frequency === "daily") },
    { key: "weekly", label: "Weekly Maintenance", items: OPERATIONS_CATALOG.filter(c => c.frequency === "weekly") },
    { key: "monthly", label: "Monthly Inspections", items: OPERATIONS_CATALOG.filter(c => c.frequency === "monthly") },
  ];

  const statusConfig = {
    not_started: { label: "Not Started", bg: "#F3F4F6", color: "#6B7280", barColor: "#E5E7EB" },
    in_progress: { label: "In Progress", bg: "#FEF3C7", color: "#D97706", barColor: "#F59E0B" },
    completed: { label: "Completed", bg: "#D1FAE5", color: "#059669", barColor: "#10B981" },
    coming_soon: { label: "Coming Soon", bg: "#F3F4F6", color: "#9CA3AF", barColor: "#E5E7EB" },
    none: { label: "", bg: "transparent", color: "transparent", barColor: "transparent" },
  };

  const nbtn = { border: "none", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: 12 };

  return (
    <div style={{ padding: "0 8px" }}>
      {/* Header with date nav */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0 }}>Operations</h2>
          <button onClick={() => setShowTodayProgress(v => !v)} style={{ border: "none", borderRadius: 10, padding: "7px 16px", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 12, background: showTodayProgress ? C.pri : C.accLt, color: showTodayProgress ? "#fff" : C.accDk, transition: "all 0.2s", letterSpacing: "0.02em" }}>
            {showTodayProgress ? "✕ Close" : "Today's Progress"}
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, position: "relative" }}>
          <button onClick={() => shiftDate(-1)} style={{ ...nbtn, background: C.surfaceHover, color: C.text }}>‹</button>
          <button onClick={() => setShowCalendar(v => !v)} style={{ ...nbtn, background: "transparent", color: C.text, minWidth: 220, textAlign: "center", fontSize: 14, fontWeight: 700 }}>{dateLbl}</button>
          <button onClick={() => shiftDate(1)} style={{ ...nbtn, background: C.surfaceHover, color: C.text }}>›</button>
          {!isToday && <button onClick={() => setViewDate(td)} style={{ ...nbtn, background: C.pri, color: "#fff" }}>Today</button>}
          {showCalendar && (
            <div ref={calRef} style={{ position: "absolute", top: "100%", right: 0, marginTop: 8, background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: 14, padding: 16, boxShadow: "0 12px 40px rgba(0,0,0,0.12)", zIndex: 100, width: 280 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <button onClick={calPrev} style={{ ...nbtn, background: C.surfaceHover }}>‹</button>
                <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{calMonthLabel}</span>
                <button onClick={calNext} style={{ ...nbtn, background: C.surfaceHover }}>›</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
                {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => <div key={d} style={{ textAlign: "center", fontSize: 10, fontWeight: 700, color: C.textMut, padding: 4 }}>{d}</div>)}
                {calDays.map((d, i) => d ? (
                  <button key={i} onClick={() => calSelect(d)} style={{ border: "none", borderRadius: 6, padding: 6, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", background: `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}` === viewDate ? C.pri : "transparent", color: `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}` === viewDate ? "#fff" : C.text }}>{d}</button>
                ) : <div key={i} />)}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Today's Progress snapshot */}
      {showTodayProgress && (() => {
        const tp = todayProgressData;
        const cp = tp.checklistProgress;
        const pctBar = (done, total, color) => {
          const pct = total > 0 ? Math.round((done / total) * 100) : 0;
          return (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
              <div style={{ flex: 1, height: 6, borderRadius: 3, background: C.borderLight, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: "100%", borderRadius: 3, background: pct === 100 ? C.suc : color || C.pri, transition: "width 0.3s" }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: pct === 100 ? C.suc : C.text, minWidth: 38, textAlign: "right" }}>{pct}%</span>
            </div>
          );
        };
        const metricCard = (label, value, sub, accent) => (
          <div style={{ background: C.surface, borderRadius: 14, padding: "18px 20px", border: `1.5px solid ${C.border}`, flex: "1 1 140px", minWidth: 140 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: accent || C.pri, lineHeight: 1 }}>{value}</div>
            {sub && <div style={{ fontSize: 12, color: C.textSec, marginTop: 4 }}>{sub}</div>}
          </div>
        );
        const progressRow = (label, done, total, color) => (
          <div style={{ padding: "10px 0", borderBottom: `1px solid ${C.borderLight}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{label}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: done >= total && total > 0 ? C.suc : C.text }}>{done}/{total}</span>
            </div>
            {pctBar(done, total, color)}
          </div>
        );
        // Parse checklist count labels like "3/7 tasks" or "2/5 rooms"
        const parseCount = (countLabel) => {
          if (!countLabel) return { done: 0, total: 0 };
          const m = countLabel.match(/^(\d+)\/(\d+)/);
          return m ? { done: parseInt(m[1]), total: parseInt(m[2]) } : { done: 0, total: 0 };
        };
        return (
          <div style={{ marginBottom: 20, background: `linear-gradient(135deg, ${C.priLt} 0%, #F8F6F0 100%)`, borderRadius: 18, border: `1.5px solid ${C.border}`, overflow: "hidden" }}>
            {/* Header bar */}
            <div style={{ background: C.pri, padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: "#fff", letterSpacing: "0.01em" }}>Today's Progress</span>
                <span style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.65)" }}>{isToday ? "Live" : dateLbl}</span>
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Read-Only Snapshot</span>
            </div>

            <div style={{ padding: "20px 24px" }}>
              {/* Top metric cards */}
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
                {metricCard("Dogs In House", tp.dogsInHouse, `${tp.boardingCount} boarding · ${tp.daycareCount} daycare`, C.pri)}
                {metricCard("Going Home", tp.goingHome, "departures today", "#D97706")}
                {metricCard("Checked Out", tp.checkedOut, "completed today", C.suc)}
              </div>

              {/* Two-column layout for progress details */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                {/* Left column: Room Cleaning & Baths */}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.pri, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 10, paddingBottom: 6, borderBottom: `2px solid ${C.pri}` }}>Cleaning & Baths</div>

                  {progressRow("Room Cleaning", tp.roomStats.totalDone, tp.roomStats.totalNeeded, C.pri)}
                  {tp.roomStats.totalSetups > 0 && progressRow("Room Setups", tp.roomStats.doneSetups || 0, tp.roomStats.totalSetups, C.pri)}
                  {tp.roomsAwaitingCheckout > 0 && (
                    <div style={{ padding: "4px 0 6px", fontSize: 11, color: C.warn, fontWeight: 600 }}>
                      {tp.roomsAwaitingCheckout} room{tp.roomsAwaitingCheckout !== 1 ? "s" : ""} awaiting checkout for disinfect
                    </div>
                  )}

                  <div style={{ padding: "10px 0", borderBottom: `1px solid ${C.borderLight}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Baths</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: tp.bathsDone >= tp.bathsTotal && tp.bathsTotal > 0 ? C.suc : C.text }}>{tp.bathsDone}/{tp.bathsTotal}</span>
                    </div>
                    {pctBar(tp.bathsDone, tp.bathsTotal, C.acc)}
                    {tp.bathRows.length > 0 && (
                      <div style={{ marginTop: 6 }}>
                        {tp.bathRows.map((b, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: C.textSec, padding: "2px 0" }}>
                            <span style={{ width: 14, height: 14, borderRadius: 7, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 9, background: b.done ? C.sucLt : C.borderLight, color: b.done ? C.suc : C.textMut }}>{b.done ? "✓" : "○"}</span>
                            <span style={{ fontWeight: 600 }}>{b.dogName}</span>
                            <span style={{ color: C.textMut }}>({b.bathType})</span>
                            {b.checkOutTime && <span style={{ color: C.acc, fontWeight: 600 }}>· out {(() => { const [h,m] = b.checkOutTime.split(":"); const hr = parseInt(h); return `${hr > 12 ? hr-12 : hr || 12}:${m} ${hr >= 12 ? "PM" : "AM"}`; })()}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Pictures */}
                  {progressRow("Pictures", tp.picturesDone, tp.picturesTotal, C.info)}
                </div>

                {/* Right column: Private Play & Checklists */}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.pri, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 10, paddingBottom: 6, borderBottom: `2px solid ${C.pri}` }}>Checklists & Activities</div>

                  {/* Private Play */}
                  {progressRow("Private Play", tp.ppCompletedRequired, tp.ppRequiredSessions, C.pri)}
                  <div style={{ padding: "2px 0 8px", display: "flex", gap: 16, fontSize: 11, color: C.textSec }}>
                    <span>{tp.ppTotalDogs} dog{tp.ppTotalDogs !== 1 ? "s" : ""} · {tp.ppTotalLogged} total session{tp.ppTotalLogged !== 1 ? "s" : ""}</span>
                    {tp.ppLastTime && <span style={{ color: C.textMut }}>Last: {tp.ppLastTime}</span>}
                  </div>

                  {/* Opening Checklist */}
                  {cp.opening && (() => {
                    const oc = parseCount(cp.opening.countLabel);
                    return progressRow("Opening Checklist", oc.done, oc.total, C.pri);
                  })()}

                  {/* Front-End Checklist */}
                  {cp.fe && (() => {
                    const fc = parseCount(cp.fe.countLabel);
                    return progressRow("Front-End Checklist", fc.done, fc.total, C.acc);
                  })()}

                  {/* Back-End Checklist */}
                  {cp.be && (() => {
                    const bc = parseCount(cp.be.countLabel);
                    return progressRow("Back-End Checklist", bc.done, bc.total, C.acc);
                  })()}

                  {/* Closing Procedures */}
                  {progressRow("Closing Procedures", tp.closingDone, tp.closingTotal, C.dan)}
                </div>
              </div>

              {/* Lifecycle & Customer Stats */}
              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.pri, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 12, paddingBottom: 6, borderBottom: `2px solid ${C.pri}` }}>Customer Lifecycle</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 10 }}>
                  {/* Overdue Follow-Ups */}
                  <div style={{ background: tp.overdueFollowUps > 0 ? C.danLt : C.surface, borderRadius: 12, padding: "14px 16px", border: `1.5px solid ${tp.overdueFollowUps > 0 ? C.dan + "40" : C.border}` }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Overdue Follow-Ups</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: tp.overdueFollowUps > 0 ? C.dan : C.suc, lineHeight: 1 }}>{tp.overdueFollowUps}</div>
                    {tp.overdueFollowUps > 0 && <div style={{ fontSize: 11, color: C.dan, marginTop: 3, fontWeight: 600 }}>overdue</div>}
                  </div>
                  {/* Due Today */}
                  <div style={{ background: tp.dueTodayFollowUps > 0 ? C.warnLt : C.surface, borderRadius: 12, padding: "14px 16px", border: `1.5px solid ${tp.dueTodayFollowUps > 0 ? C.warn + "40" : C.border}` }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Due Today</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: tp.dueTodayFollowUps > 0 ? C.warn : C.textMut, lineHeight: 1 }}>{tp.dueTodayFollowUps}</div>
                    <div style={{ fontSize: 11, color: C.textSec, marginTop: 3 }}>follow-ups scheduled</div>
                  </div>
                  {/* Logs Today */}
                  <div style={{ background: C.surface, borderRadius: 12, padding: "14px 16px", border: `1.5px solid ${C.border}` }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Logs Today</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: tp.logsToday > 0 ? C.pri : C.textMut, lineHeight: 1 }}>{tp.logsToday}</div>
                    <div style={{ fontSize: 11, color: C.textSec, marginTop: 3 }}>updates recorded</div>
                  </div>
                  {/* New Customers */}
                  <div style={{ background: C.surface, borderRadius: 12, padding: "14px 16px", border: `1.5px solid ${C.border}` }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>New Customers</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: tp.newCustomersToday > 0 ? C.info : C.textMut, lineHeight: 1 }}>{tp.newCustomersToday}</div>
                    <div style={{ fontSize: 11, color: C.textSec, marginTop: 3 }}>created today</div>
                  </div>
                  {/* New Paying Customers */}
                  <div style={{ background: tp.newPayingToday > 0 ? C.sucLt : C.surface, borderRadius: 12, padding: "14px 16px", border: `1.5px solid ${tp.newPayingToday > 0 ? C.suc + "40" : C.border}` }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>First-Time Payers</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: tp.newPayingToday > 0 ? C.suc : C.textMut, lineHeight: 1 }}>{tp.newPayingToday}</div>
                    <div style={{ fontSize: 11, color: C.textSec, marginTop: 3 }}>first payment today</div>
                  </div>
                </div>
              </div>

              {/* Overall progress footer */}
              <div style={{ marginTop: 20, padding: "14px 20px", background: C.surface, borderRadius: 12, border: `1.5px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Overall Checklists</span>
                  <span style={{ fontSize: 22, fontWeight: 800, color: summaryStats.todayPct === 100 ? C.suc : C.pri }}>{summaryStats.todayPct}%</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.textSec }}>{summaryStats.todayCompleted} of {summaryStats.todayTotal} complete</span>
                  <div style={{ width: 120, height: 8, borderRadius: 4, background: C.borderLight, overflow: "hidden" }}>
                    <div style={{ width: `${summaryStats.todayPct}%`, height: "100%", borderRadius: 4, background: summaryStats.todayPct === 100 ? C.suc : C.pri, transition: "width 0.3s" }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Summary section */}
      <Card style={{ marginBottom: 20, padding: "14px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }} onClick={() => setExpandSummary(v => !v)}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
              {isToday ? "Today" : dateLbl}: <span style={{ color: summaryStats.todayCompleted === summaryStats.todayTotal && summaryStats.todayTotal > 0 ? "#059669" : C.text }}>{summaryStats.todayCompleted}/{summaryStats.todayTotal}</span> completed ({summaryStats.todayPct}%)
            </span>
            <div style={{ width: 100, height: 6, borderRadius: 3, background: C.borderLight, overflow: "hidden" }}>
              <div style={{ width: `${summaryStats.todayPct}%`, height: "100%", borderRadius: 3, background: summaryStats.todayPct === 100 ? "#10B981" : "#F59E0B", transition: "width 0.3s" }} />
            </div>
          </div>
          <span style={{ fontSize: 12, color: C.textMut, fontWeight: 600 }}>{expandSummary ? "Hide Details" : "View Analytics"}</span>
        </div>
        {expandSummary && (
          <div style={{ marginTop: 14, borderTop: `1px solid ${C.borderLight}`, paddingTop: 14, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${C.border}` }}>
                  <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 700, color: C.textMut, fontSize: 11 }}>CHECKLIST</th>
                  <th style={{ textAlign: "center", padding: "6px 8px", fontWeight: 700, color: C.textMut, fontSize: 11 }}>7-DAY AVG</th>
                  <th style={{ textAlign: "center", padding: "6px 8px", fontWeight: 700, color: C.textMut, fontSize: 11 }}>WoW</th>
                  <th style={{ textAlign: "center", padding: "6px 8px", fontWeight: 700, color: C.textMut, fontSize: 11 }}>MTD AVG</th>
                  <th style={{ textAlign: "center", padding: "6px 8px", fontWeight: 700, color: C.textMut, fontSize: 11 }}>TREND</th>
                </tr>
              </thead>
              <tbody>
                {summaryStats.rows.map(row => (
                  <tr key={row.label} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                    <td style={{ padding: "8px 8px", fontWeight: 600, color: C.text }}>{row.label}</td>
                    <td style={{ padding: "8px 8px", textAlign: "center", fontWeight: 600, color: row.weeklyAvg >= 80 ? "#059669" : row.weeklyAvg >= 50 ? "#D97706" : "#6B7280" }}>{row.weeklyAvg}%</td>
                    <td style={{ padding: "8px 8px", textAlign: "center", fontWeight: 700, color: row.wowDiff > 0 ? "#059669" : row.wowDiff < 0 ? "#DC2626" : C.textMut }}>{row.wowDiff > 0 ? "+" : ""}{row.wowDiff}%</td>
                    <td style={{ padding: "8px 8px", textAlign: "center", fontWeight: 600, color: row.mtdAvg >= 80 ? "#059669" : row.mtdAvg >= 50 ? "#D97706" : "#6B7280" }}>{row.mtdAvg}%</td>
                    <td style={{ padding: "8px 8px", textAlign: "center", fontSize: 14 }}>{row.wowDiff > 0 ? "↑" : row.wowDiff < 0 ? "↓" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {groups.map(group => {
        const visibleItems = group.items.filter(item => item.comingSoon || !item.permission || hp(item.permission));
        if (visibleItems.length === 0) return null;
        return (
          <div key={group.key} style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
              {group.label}
              <span style={{ fontSize: 12, fontWeight: 500, color: C.textMut, marginLeft: 4 }}>
                ({visibleItems.length} {visibleItems.length === 1 ? "item" : "items"})
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
              {visibleItems.map(item => {
                const status = getOpsCardStatus(data, item, viewDate);
                const progress = getOpsProgress(data, item, viewDate);
                const countLabel = getOpsCountLabel(data, item, viewDate);
                const sc = statusConfig[status];
                const isComingSoon = item.comingSoon;
                const isEod = item.dataKey === "eodEntries";
                return (
                  <div key={item.id}
                    onClick={() => !isComingSoon && nav(item.routeTo)}
                    style={{
                      background: C.surface, borderRadius: 14, padding: "18px 20px",
                      border: `1.5px solid ${isEod ? C.border : status === "completed" ? "#10B981" : status === "in_progress" ? "#F59E0B" : C.border}`,
                      cursor: isComingSoon ? "default" : "pointer",
                      opacity: isComingSoon ? 0.55 : 1,
                      transition: "all 0.2s",
                      position: "relative",
                    }}
                    onMouseEnter={e => { if (!isComingSoon) { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)"; }}}
                    onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; }}
                  >
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{item.label}</div>
                      {countLabel && <div style={{ fontSize: 12, color: C.textSec, marginTop: 3 }}>{countLabel}</div>}
                    </div>
                    {!isEod && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: sc.bg, color: sc.color, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                        {sc.label}
                      </span>
                      {!isComingSoon && <span style={{ fontSize: 12, fontWeight: 600, color: sc.color }}>{progress}%</span>}
                    </div>
                    )}
                    {!isComingSoon && !isEod && (
                      <div style={{ marginTop: 8, height: 5, borderRadius: 3, background: C.borderLight, overflow: "hidden" }}>
                        <div style={{ width: `${progress}%`, height: "100%", borderRadius: 3, background: sc.barColor, transition: "width 0.3s" }} />
                      </div>
                    )}
                    {!isComingSoon && (
                      <div style={{ position: "absolute", top: 18, right: 16, color: C.textMut, fontSize: 16 }}>›</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Management Section */}
      {(hp("view_management") || hp("view_daily_ops")) && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ margin: "8px 0 18px", height: 1, background: C.borderLight }} />
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
            Management
            <span style={{ fontSize: 12, fontWeight: 500, color: C.textMut, marginLeft: 4 }}>
              (Administrative Tools)
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
            {[
              { id: "mgmt-attendance", label: "Attendance Tracker", desc: "Track tardies, call-outs, and no-shows", active: true },
              ...(hasPermission(profile, data, "view_audit_log") ? [{ id: "mgmt-audit-log", label: "Audit Log", desc: "Employee logins and system activity", active: true }] : []),
              { id: null, label: "Incident Reports", desc: "Log workplace incidents", active: false },
            ].map((tool, i) => (
              <div key={i}
                onClick={() => tool.id && nav(tool.id)}
                style={{
                  background: C.surface, borderRadius: 14, padding: "18px 20px",
                  border: `1.5px solid ${tool.active ? C.pri + "40" : C.border}`,
                  cursor: tool.active ? "pointer" : "default",
                  opacity: tool.active ? 1 : 0.55,
                  transition: "all 0.2s",
                  position: "relative",
                }}
                onMouseEnter={e => { if (tool.active) { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)"; }}}
                onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; }}
              >
                <div style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{tool.label}</div>
                  <div style={{ fontSize: 12, color: C.textSec, marginTop: 3 }}>{tool.desc}</div>
                </div>
                {!tool.active && <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: "#F3F4F6", color: "#9CA3AF", textTransform: "uppercase", letterSpacing: "0.04em" }}>Coming Soon</span>}
                {tool.active && <span style={{ position: "absolute", top: 18, right: 16, color: C.textMut, fontSize: 16 }}>›</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export { OperationsHub };
