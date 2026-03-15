// K9 Operations — FunnelPage
// Isolated page component. See AGENTS.md for development contract.

import React, { useState, useEffect, useMemo, useCallback, useRef, memo } from "react";
import ReactDOM from "react-dom";
import { supabase } from "../../supabaseClient";
import { C, OPERATIONS_CATALOG, OPS_TYPES, LITE_DEF_PRICING, CHART_PTS, DEF_CLIENT_FIELDS, DEF_DOG_FIELDS, DEFAULT_LIFECYCLE_BANNERS, LC_OP_LABELS, LC_FILTER_FIELDS, LITE_ACTION_LABELS, LITE_ACTION_LEVELS, DEF_LITE_EOD_TEMPLATE, DAY_NAMES_SHORT, ROOM_TYPES, K9_LOCATIONS, POS_BASE, PAGE_SLUGS, buildUrl, parseUrl, gid, titleCase, fmtPhone, fmtDate, fmtDateFull, fmtDateShort, fmtTime, fmtInstr, todayStr, addDays, formatTime12hr, countNights, countHours, DEF_OPENING_TEMPLATE, DEF_FE_TEMPLATE, DEF_BE_TEMPLATE, DEF_CLOSING_TEMPLATE, LEAN_PERMISSION_AREAS, LEAN_PERMISSION_MATRIX, LEAN_ROLES, NAV_ITEMS, K9_LOGO_SRC, K9_LOGO_PNG, SLUG_TO_PAGE, ENT_SLUG_TO_PAGE, formatDogNames, fmtPhoneInput, IDB_VERSION, idbGet, idbSet } from "../../shared/theme";
import { I, Icons } from "../../shared/icons";
import { Tip, Badge, Btn, CustomSelect, MiniDatePicker, ComplianceCheckItem, Inp, CalendarPicker, Modal, Card, K9Logo, K9LogoMini, isFieldRequired, validateClientFields } from "../../shared/ui";  // formatDogNames, fmtPhoneInput are in theme.js
import { hasPermission, hasLeanPermission, _resolveRole, LEGACY_ROLE_MAP, ROLE_CODE_MAP } from "../../shared/permissions";
import { classifyReservationType, classifyReservationStatus, extractRoomFromType, getRoomCleaningStats, resSvcIncludes, getPPStats, getOpsCardStatus, getOpsProgress, getOpsCountLabel } from "../../shared/opsHelpers";
import K9LoadingAnimation from "../../shared/K9LoadingAnimation";
import InteractiveLineChart from "../../shared/InteractiveLineChart";
import LocationSelector from "../../shared/LocationSelector";
import { applyStructuredFilters } from "../../hooks/useFilters";

function FunnelPage({ data, save, nav, profile, addGlobalToast }) {
  const [range, setRange] = useState("mtd");
  const [animReady, setAnimReady] = useState(false);
  const initialMount = useRef(true);
  useEffect(() => { if (initialMount.current) { initialMount.current = false; const t = setTimeout(() => setAnimReady(true), 50); return () => clearTimeout(t); } setAnimReady(true); }, [range]);

  const ranges = [
    { id: "wtd", label: "WTD", desc: "Week to Date" },
    { id: "past-week", label: "Past Week", desc: "Last 7 Days" },
    { id: "mtd", label: "MTD", desc: "Month to Date" },
    { id: "past-30", label: "Past 30", desc: "Last 30 Days" },
    { id: "qtd", label: "QTD", desc: "Quarter to Date" },
    { id: "ytd", label: "YTD", desc: "Year to Date" },
  ];

  // ── Date range computation ──
  const { startDate, endDate, rangeLabel } = useMemo(() => {
    const now = new Date();
    const end = todayStr();
    let start;
    switch (range) {
      case "wtd": { const d = new Date(now); d.setDate(d.getDate() - d.getDay()); start = d.toISOString().split("T")[0]; break; }
      case "past-week": { const d = new Date(now); d.setDate(d.getDate() - 7); start = d.toISOString().split("T")[0]; break; }
      case "mtd": { start = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-01`; break; }
      case "past-30": { const d = new Date(now); d.setDate(d.getDate() - 30); start = d.toISOString().split("T")[0]; break; }
      case "qtd": { const qm = Math.floor(now.getMonth() / 3) * 3; start = `${now.getFullYear()}-${String(qm+1).padStart(2,"0")}-01`; break; }
      case "ytd": { start = `${now.getFullYear()}-01-01`; break; }
      default: start = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-01`;
    }
    const rd = ranges.find(r => r.id === range);
    return { startDate: start, endDate: end, rangeLabel: rd?.desc || "" };
  }, [range]);

  // ── Funnel metrics computation (uses serverStats RPC — no reservation dependency) ──
  const metrics = useMemo(() => {
    const clients = data.clients || [];
    const ss = data.serverStats || {};
    const allClients = clients.length;

    // Build per-client stats from server RPC
    const statsMap = {};
    clients.forEach(c => {
      const gid = String(c.gingrId);
      const srv = ss[gid];
      if (srv) {
        statsMap[c.id] = {
          totalSpent: Number(srv.total_spent) || 0,
          totalRes: Number(srv.total_res) || 0,
          hasRealBooking: srv.has_real_booking || false,
          hasSpent: (Number(srv.total_spent) || 0) > 0,
          lastResDate: srv.last_res_date || "",
        };
      } else {
        // Fallback to Gingr owner-level data
        statsMap[c.id] = {
          totalSpent: 0,
          totalRes: c._numReservations || 0,
          hasRealBooking: (c._numReservations || 0) > 0,
          hasSpent: false,
          lastResDate: c._lastReservation ? c._lastReservation.split("T")[0] : "",
        };
      }
    });

    const inRange = (dateStr) => {
      if (!dateStr) return false;
      const d = dateStr.split("T")[0];
      return d >= startDate && d <= endDate;
    };

    // LEADS: Clients created in timeframe that started as leads (no prior bookings)
    const createdInRange = clients.filter(c => inRange(c.createdAt));
    const leadsInRange = createdInRange.filter(c => {
      const s = statsMap[c.id];
      // If client was created in range, they were a new lead unless they had activity
      // from before this range (unlikely for newly created, but check lastResDate)
      if (s.lastResDate && s.lastResDate < startDate && s.hasRealBooking) return false;
      return true;
    });

    // CONTACTED: Leads who have log entries in timeframe OR converted
    const contactedLeads = leadsInRange.filter(c => {
      const updates = c.lifecycle?.conversion?.updates || [];
      const retUpdates = c.lifecycle?.retention?.updates || [];
      const allUpdates = [...updates, ...retUpdates];
      const hasLog = allUpdates.some(u => {
        const logDate = u.loggedAt ? u.loggedAt.split("T")[0] : "";
        return logDate >= startDate && logDate <= endDate;
      });
      const s = statsMap[c.id];
      const becameCustomer = s.hasSpent || s.hasRealBooking;
      return hasLog || becameCustomer;
    });

    // NEW CUSTOMERS: Leads who have spent or have real bookings
    const newCustomers = leadsInRange.filter(c => {
      const s = statsMap[c.id];
      return s.hasSpent || s.hasRealBooking;
    });

    // Revenue from new customers (use their total spend since we can't date-filter without reservations)
    const newCustomerRevenue = newCustomers.reduce((sum, c) => sum + (statsMap[c.id]?.totalSpent || 0), 0);

    // LTV: Average lifetime value across all paying customers
    const spendingClients = clients.filter(c => statsMap[c.id]?.hasSpent || statsMap[c.id]?.hasRealBooking);
    const totalLTV = spendingClients.reduce((sum, c) => sum + (statsMap[c.id]?.totalSpent || 0), 0);
    const avgLTV = spendingClients.length > 0 ? totalLTV / spendingClients.length : 0;

    const conversionRate = leadsInRange.length > 0 ? (newCustomers.length / leadsInRange.length * 100) : 0;
    const forecastedUplift = newCustomers.length * avgLTV;

    return {
      leads: leadsInRange.length,
      contacted: contactedLeads.length,
      newCustomers: newCustomers.length,
      conversionRate,
      newCustomerRevenue,
      avgLTV,
      forecastedUplift,
      totalClients: allClients,
      spendingClientsCount: spendingClients.length,
    };
  }, [data.clients, data.serverStats, startDate, endDate]);

  const fmtMoney = (n) => "$" + Math.round(n).toLocaleString();

  // Fixed max scale = YTD leads count (so bar widths are proportional across timeframes)
  const ytdLeads = useMemo(() => {
    const clients = data.clients || [];
    const yearStart = `${new Date().getFullYear()}-01-01`;
    return Math.max(clients.filter(c => {
      const d = c.createdAt ? c.createdAt.split("T")[0] : "";
      return d >= yearStart;
    }).length, 1);
  }, [data.clients]);
  const maxFunnel = ytdLeads;

  return (
    <div style={{padding:"24px 28px",maxWidth:1100,margin:"0 auto"}}>
      <style>{`
        @keyframes funnelSlideIn { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        @keyframes funnelGrow { from { transform:scaleX(0); } to { transform:scaleX(1); } }
        @keyframes funnelFade { from { opacity:0; transform:scale(0.96); } to { opacity:1; transform:scale(1); } }
        @keyframes funnelCount { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes funnelPulse { 0%,100% { transform:scale(1); } 50% { transform:scale(1.02); } }
        @keyframes metricReveal { from { opacity:0; transform:translateY(16px) scale(0.97); } to { opacity:1; transform:translateY(0) scale(1); } }
        @keyframes rangePill { from { opacity:0; transform:translateX(-4px); } to { opacity:1; transform:translateX(0); } }
        @keyframes shimmer { 0% { background-position:-200% 0; } 100% { background-position:200% 0; } }
      `}</style>

      {/* ── Header ── */}
      <div style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between",marginBottom:24,animation:"funnelSlideIn 0.3s ease-out"}}>
        <div>
          <h1 style={{margin:0,fontSize:26,fontWeight:800,color:C.text,letterSpacing:"-0.03em"}}>Conversion Funnel</h1>
          <p style={{margin:"4px 0 0",fontSize:13,color:C.textSec}}>{rangeLabel} — {new Date(startDate).toLocaleDateString("en-US",{month:"short",day:"numeric"})} to {new Date(endDate).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</p>
        </div>
      </div>

      {/* ── Date Range Selector ── */}
      <div style={{display:"flex",gap:6,marginBottom:28,padding:"4px",borderRadius:14,background:C.surface,border:`1.5px solid ${C.borderLight}`,width:"fit-content",animation:"funnelSlideIn 0.3s ease-out 0.05s both"}}>
        {ranges.map((r, i) => {
          const active = range === r.id;
          return (
            <button key={r.id} onClick={() => setRange(r.id)}
              style={{padding:"8px 18px",borderRadius:10,border:"none",background:active?C.pri:"transparent",color:active?"#fff":C.textSec,fontSize:12,fontWeight:active?700:500,cursor:"pointer",fontFamily:"inherit",transition:"all 0.25s cubic-bezier(0.2,0.8,0.2,1)",boxShadow:active?"0 2px 12px rgba(20,83,45,0.25)":"none",animation:`rangePill 0.2s ease-out ${i*0.03}s both`,position:"relative",overflow:"hidden"}}
              onMouseEnter={e=>{if(!active){e.currentTarget.style.background=`${C.pri}08`;e.currentTarget.style.color=C.pri;}}}
              onMouseLeave={e=>{if(!active){e.currentTarget.style.background="transparent";e.currentTarget.style.color=C.textSec;}}}>
              {r.label}
            </button>
          );
        })}
      </div>

      {/* ── Funnel Visualization ── */}
      <div style={{background:"#fff",borderRadius:16,border:`1.5px solid ${C.borderLight}`,boxShadow:"0 4px 24px rgba(0,0,0,0.04)",padding:"32px 40px",marginBottom:24,animation:"funnelFade 0.35s ease-out 0.1s both"}}>

        {[
          { label: "Total Leads", value: metrics.leads, color: "#14532D", lightColor: "#14532D", desc: "New clients entering the funnel" },
          { label: "Leads Contacted", value: metrics.contacted, color: "#84CC16", lightColor: "#84CC16", desc: "Leads with logged outreach or converted" },
          { label: "New Customers", value: metrics.newCustomers, color: "#16A34A", lightColor: "#16A34A", desc: "Converted to active with spend/booking" },
        ].map((stage, i) => {
          const pct = maxFunnel > 0 ? stage.value / maxFunnel : 0;
          const widthPct = Math.max(20 + pct * 80, stage.value > 0 ? 25 : 15); // proportional to YTD, min 25% if has data
          const convFromPrev = i === 1 ? (metrics.leads > 0 ? (metrics.contacted / metrics.leads * 100).toFixed(0) : 0)
            : i === 2 ? (metrics.contacted > 0 ? (metrics.newCustomers / metrics.contacted * 100).toFixed(0) : 0) : null;
          return (
            <div key={stage.label} style={{marginBottom:i<2?0:0}}>
              {/* Drop-off indicator between stages */}
              {i > 0 && (
                <div style={{display:"flex",alignItems:"center",justifyContent:"center",padding:"6px 0",opacity:animReady?1:0,transition:"opacity 0.4s ease-out",transitionDelay:`${0.15+i*0.12}s`}}>
                  <div style={{height:1,flex:1,background:`linear-gradient(90deg, transparent, ${C.borderLight}, transparent)`}}/>
                  <span style={{padding:"2px 12px",fontSize:10,fontWeight:700,color:C.textMut,letterSpacing:"0.06em"}}>
                    {convFromPrev}% pass-through
                  </span>
                  <div style={{height:1,flex:1,background:`linear-gradient(90deg, transparent, ${C.borderLight}, transparent)`}}/>
                </div>
              )}
              {/* Funnel bar */}
              <div style={{display:"flex",alignItems:"center",gap:16,padding:"6px 0"}}>
                <div style={{flex:1,display:"flex",justifyContent:"center"}}>
                  <div style={{width:animReady?`${widthPct}%`:"0%",borderRadius:12,overflow:"hidden",transition:"width 0.7s cubic-bezier(0.2,0.8,0.2,1)",position:"relative"}}>
                    <div style={{
                      padding:"16px 20px",
                      background:`linear-gradient(135deg, ${stage.color}, ${stage.color}dd)`,
                      borderRadius:12,
                      display:"flex",
                      alignItems:"center",
                      justifyContent:"space-between",
                      cursor:"default",
                      position:"relative",
                      overflow:"hidden",
                    }}>
                      {/* Shimmer effect */}
                      <div style={{position:"absolute",inset:0,background:"linear-gradient(90deg,transparent 0%,rgba(255,255,255,0.08) 50%,transparent 100%)",backgroundSize:"200% 100%",animation:"shimmer 3s ease-in-out infinite",pointerEvents:"none"}}/>
                      <div style={{position:"relative",zIndex:1}}>
                        <div style={{fontSize:11,fontWeight:600,color:"rgba(255,255,255,0.75)",textTransform:"uppercase",letterSpacing:"0.08em"}}>{stage.label}</div>
                        <div style={{fontSize:10,fontWeight:400,color:"rgba(255,255,255,0.5)",marginTop:1}}>{stage.desc}</div>
                      </div>
                      <div style={{position:"relative",zIndex:1,fontSize:28,fontWeight:800,color:"#fff",letterSpacing:"-0.02em",opacity:animReady?1:0,transition:"opacity 0.3s ease-out",transitionDelay:`${0.2+i*0.12}s`}}>
                        {stage.value.toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Key Metrics Row ── */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4, 1fr)",gap:16,marginBottom:24}}>
        {[
          { label: "Conversion Rate", value: `${metrics.conversionRate.toFixed(1)}%`, sub: `${metrics.newCustomers} of ${metrics.leads} leads`, icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.pri} strokeWidth="2" strokeLinecap="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>, color: C.pri },
          { label: "New Customer Revenue", value: fmtMoney(metrics.newCustomerRevenue), sub: `From ${metrics.newCustomers} new customers`, icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>, color: "#16A34A" },
          { label: "Avg Customer LTV", value: fmtMoney(metrics.avgLTV), sub: `Across ${metrics.spendingClientsCount.toLocaleString()} customers`, icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#84CC16" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>, color: "#84CC16" },
          { label: "Forecasted Revenue Uplift", value: fmtMoney(metrics.forecastedUplift), sub: `${metrics.newCustomers} new × ${fmtMoney(metrics.avgLTV)} LTV`, icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.dan} strokeWidth="2" strokeLinecap="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>, color: C.dan },
        ].map((m, i) => (
          <div key={m.label} style={{
            background:"#fff",borderRadius:14,border:`1.5px solid ${C.borderLight}`,padding:"20px 22px",
            boxShadow:"0 2px 12px rgba(0,0,0,0.03)",
            transition:"all 0.25s cubic-bezier(0.2,0.8,0.2,1)",
            animation:`metricReveal 0.35s ease-out ${0.3+i*0.08}s both`,
            cursor:"default",
          }}
            onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 8px 24px rgba(0,0,0,0.08)";e.currentTarget.style.borderColor=m.color+"40";}}
            onMouseLeave={e=>{e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow="0 2px 12px rgba(0,0,0,0.03)";e.currentTarget.style.borderColor=C.borderLight;}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
              <div style={{width:32,height:32,borderRadius:8,background:`${m.color}10`,display:"flex",alignItems:"center",justifyContent:"center"}}>{m.icon}</div>
              <div style={{fontSize:11,fontWeight:700,color:C.textSec,textTransform:"uppercase",letterSpacing:"0.06em"}}>{m.label}</div>
            </div>
            <div style={{fontSize:26,fontWeight:800,color:C.text,letterSpacing:"-0.02em",lineHeight:1}}>{m.value}</div>
            <div style={{fontSize:11,color:C.textMut,marginTop:6,fontWeight:500}}>{m.sub}</div>
          </div>
        ))}
      </div>

      {/* ── LTV Breakdown Card ── */}
      <div style={{background:"#fff",borderRadius:14,border:`1.5px solid ${C.borderLight}`,padding:"20px 24px",boxShadow:"0 2px 12px rgba(0,0,0,0.03)",animation:"metricReveal 0.35s ease-out 0.65s both"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.pri} strokeWidth="2" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          <span style={{fontSize:12,fontWeight:700,color:C.text,textTransform:"uppercase",letterSpacing:"0.06em"}}>LTV Methodology</span>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16}}>
          <div style={{padding:"14px 16px",borderRadius:10,background:C.surface,border:`1px solid ${C.borderLight}`}}>
            <div style={{fontSize:10,fontWeight:700,color:C.textMut,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>Total Revenue Pool</div>
            <div style={{fontSize:20,fontWeight:800,color:C.text}}>{fmtMoney(metrics.spendingClientsCount > 0 ? metrics.avgLTV * metrics.spendingClientsCount : 0)}</div>
            <div style={{fontSize:10,color:C.textMut,marginTop:2}}>All-time revenue from all customers</div>
          </div>
          <div style={{padding:"14px 16px",borderRadius:10,background:C.surface,border:`1px solid ${C.borderLight}`}}>
            <div style={{fontSize:10,fontWeight:700,color:C.textMut,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>Paying Customers</div>
            <div style={{fontSize:20,fontWeight:800,color:C.text}}>{metrics.spendingClientsCount.toLocaleString()}</div>
            <div style={{fontSize:10,color:C.textMut,marginTop:2}}>Clients with at least one transaction</div>
          </div>
          <div style={{padding:"14px 16px",borderRadius:10,background:C.surface,border:`1px solid ${C.borderLight}`}}>
            <div style={{fontSize:10,fontWeight:700,color:C.textMut,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6}}>Avg LTV per Customer</div>
            <div style={{fontSize:20,fontWeight:800,color:"#84CC16"}}>{fmtMoney(metrics.avgLTV)}</div>
            <div style={{fontSize:10,color:C.textMut,marginTop:2}}>Total revenue / paying customers</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── OPERATIONS HUB (from POS App) ────────────────────────────────────────

export default FunnelPage;
