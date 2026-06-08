import { Btn, Card, MiniDatePicker } from "../components/ui";
import { C } from "../constants/colors";
import { K9_LOCATIONS } from "../constants/locations";
import { OPERATIONS_CATALOG, OPS_TYPES } from "../constants/operations";
import { addDays, todayStr } from "../lib/format";
import { getRoomCleaningStats } from "../lib/ops";
import { supabase } from "../../supabaseClient";
import { useEffect, useState } from "react";

function EnterpriseOperationsPage({ data, save, nav, profile, handleLocationChange, allLocations }) {
  const [viewDate, setViewDate] = useState(todayStr());
  const [viewMode, setViewMode] = useState("day"); // "day" or "week"
  const [locationDataMap, setLocationDataMap] = useState({});
  const [opsLoading, setOpsLoading] = useState(true);
  const locations = (allLocations || K9_LOCATIONS).filter(l => !l.isEnterprise);
  const dailyOps = OPERATIONS_CATALOG.filter(op => op.frequency === "daily");
  const weeklyOps = OPERATIONS_CATALOG.filter(op => op.frequency === "weekly");
  const monthlyOps = OPERATIONS_CATALOG.filter(op => op.frequency === "monthly");

  // Compute week days for weekly view
  const getWeekDays = (dateStr) => {
    const d = new Date(dateStr + "T12:00:00");
    const dow = d.getDay();
    const mon = new Date(d); mon.setDate(d.getDate() - ((dow + 6) % 7));
    return Array.from({length:7}, (_,i) => {
      const dd = new Date(mon); dd.setDate(mon.getDate() + i);
      return dd.toISOString().slice(0,10);
    });
  };
  const weekDays = getWeekDays(viewDate);
  const shortDay = (d) => new Date(d+"T12:00:00").toLocaleDateString("en-US",{weekday:"short"});
  const dayNum = (d) => new Date(d+"T12:00:00").getDate();

  // Fetch ops data for ALL locations via RPC
  useEffect(() => {
    setOpsLoading(true);
    supabase.rpc('get_locations_ops_data').then(({ data: result, error }) => {
      if (error) { console.error('get_locations_ops_data error:', error); setOpsLoading(false); return; }
      const map = {};
      (result || []).forEach(loc => { map[loc.id] = loc; });
      setLocationDataMap(map);
      setOpsLoading(false);
    });
  }, []);

  const getOpsStatusForDate = (op, locId, dateKey) => {
    const locData = locationDataMap[locId];
    if (!locData) return { done: 0, total: 0, pct: 0, status: "none" };

    if (op.id === "eod") {
      const eodArr = locData.eodEntries || [];
      const dayEntry = eodArr.find(e => e.date === dateKey);
      if (!dayEntry) return { done: 0, total: 20, pct: 0, status: "none" };
      const fields = (dayEntry.sections || []).filter(s => s.content && s.content.trim());
      return { done: fields.length, total: 20, pct: Math.round((fields.length / 20) * 100), status: fields.length === 0 ? "none" : fields.length >= 18 ? "complete" : "progress" };
    }
    if (op.typeSub === "room_cleaning") {
      const rc = getRoomCleaningStats(locData, dateKey);
      return { done: rc.cleaned, total: rc.total, pct: rc.total > 0 ? Math.round((rc.cleaned / rc.total) * 100) : 0, status: rc.total === 0 ? "none" : rc.cleaned >= rc.total ? "complete" : rc.cleaned > 0 ? "progress" : "none" };
    }
    if (op.typeSub === "pictures") {
      const entryId = "ops_pictures_" + dateKey;
      const entry = (locData.dailyOps || []).find(e => e.id === entryId);
      const picItems = entry?.items || {};
      const done = Object.values(picItems).filter(v => v === true).length;
      const total = (locData.reservations || []).filter(r => r.type === "boarding" && r.checkIn <= dateKey && r.checkOut >= dateKey && (r.status === "checked-in" || r.status === "upcoming")).length;
      return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0, status: total === 0 ? "none" : done >= total ? "complete" : done > 0 ? "progress" : "none" };
    }
    if (op.typeSub === "pp") {
      const entryId = "ops_pp_" + dateKey;
      const entry = (locData.dailyOps || []).find(e => e.id === entryId);
      const ppItems = entry?.items || {};
      const done = Object.values(ppItems).filter(v => v === true).length;
      return { done, total: 0, pct: done > 0 ? 100 : 0, status: done > 0 ? "complete" : "none" };
    }
    const opsType = OPS_TYPES[op.typeSub];
    if (opsType && opsType.key) {
      const template = locData[opsType.key] || opsType.def || [];
      const items = template.filter(t => !t.isWeekly);
      const entryId = "ops_" + op.typeSub + "_" + dateKey;
      const entry = (locData.dailyOps || []).find(e => e.id === entryId);
      const log = entry?.items || {};
      const done = items.filter(t => log[t.id]?.checked).length;
      return { done, total: items.length, pct: items.length > 0 ? Math.round((done / items.length) * 100) : 0, status: done === 0 ? "none" : done >= items.length ? "complete" : "progress" };
    }
    return { done: 0, total: 0, pct: 0, status: "none" };
  };

  const getOpsStatus = (op, locId) => getOpsStatusForDate(op, locId, viewDate);

  // Weekly: for a given op + location, count how many of 7 days are "complete"
  const getWeekSummary = (op, locId) => {
    let daysComplete = 0;
    weekDays.forEach(d => { if (getOpsStatusForDate(op, locId, d).status === "complete") daysComplete++; });
    return { daysComplete, total: 7 };
  };

  const isToday = viewDate === todayStr();
  const weekLabel = (() => {
    const ms = new Date(weekDays[0]+"T12:00:00");
    const me = new Date(weekDays[6]+"T12:00:00");
    return `${ms.toLocaleDateString("en-US",{month:"short",day:"numeric"})} – ${me.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}`;
  })();

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:28}}>
        <div>
          <h2 style={{fontSize:24,fontWeight:700,color:C.text,margin:0}}>Operations Oversight</h2>
          <div style={{fontSize:13,color:C.textSec,marginTop:4}}>Cross-location operations status at a glance</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {/* Day / Week toggle */}
          <div style={{display:"flex",borderRadius:8,border:`1px solid ${C.border}`,overflow:"hidden"}}>
            {[{id:"day",label:"Day"},{id:"week",label:"Week"}].map(m => (
              <button key={m.id} onClick={()=>setViewMode(m.id)} style={{padding:"5px 14px",border:"none",background:viewMode===m.id?C.pri:"transparent",color:viewMode===m.id?"#fff":C.textSec,fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>{m.label}</button>
            ))}
          </div>
          <button onClick={()=>setViewDate(addDays(viewDate,viewMode==="week"?-7:-1))} style={{width:32,height:32,borderRadius:8,border:`1px solid ${C.border}`,background:C.surface,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:C.textSec,fontFamily:"inherit",fontSize:16}}>&lsaquo;</button>
          <MiniDatePicker value={viewDate} onChange={v=>setViewDate(v)}/>
          <button onClick={()=>setViewDate(addDays(viewDate,viewMode==="week"?7:1))} style={{width:32,height:32,borderRadius:8,border:`1px solid ${C.border}`,background:C.surface,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:C.textSec,fontFamily:"inherit",fontSize:16}}>&rsaquo;</button>
          {!isToday && <Btn size="sm" onClick={()=>setViewDate(todayStr())}>Today</Btn>}
        </div>
      </div>

      <div style={{fontSize:13,fontWeight:600,color:C.textSec,marginBottom:12}}>
        {viewMode === "week" ? weekLabel : new Date(viewDate+"T12:00:00").toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"})}
        {isToday && viewMode === "day" && <span style={{marginLeft:8,padding:"2px 8px",borderRadius:6,background:C.priLt,color:C.pri,fontSize:11,fontWeight:700}}>Today</span>}
      </div>

      {opsLoading ? (
        <Card style={{padding:40,textAlign:"center"}}>
          <div style={{fontSize:14,color:C.textSec}}>Loading operations data...</div>
        </Card>
      ) : viewMode === "day" ? (
      /* ═══ DAY VIEW ═══ */
      <>
      {/* Helper to render a section table */}
      {[
        { title: "Daily Operations", ops: dailyOps, comingSoon: false },
        { title: "Weekly Maintenance", ops: weeklyOps, comingSoon: true },
        { title: "Monthly Inspections", ops: monthlyOps, comingSoon: true },
      ].map(section => (
        <div key={section.title} style={{marginBottom:24}}>
          <div style={{fontSize:16,fontWeight:800,color:C.text,marginBottom:10,display:"flex",alignItems:"center",gap:8}}>
            {section.title}
            <span style={{fontSize:12,fontWeight:500,color:C.textMut}}>({section.ops.length} items)</span>
          </div>
          <Card style={{padding:0,overflow:"hidden"}}>
            <div style={{display:"grid",gridTemplateColumns:`260px repeat(${locations.length},1fr)`,borderBottom:`2px solid ${C.border}`}}>
              <div style={{padding:"14px 20px",background:C.bg}}>
                <div style={{fontSize:11,fontWeight:700,color:C.textSec,textTransform:"uppercase",letterSpacing:"0.05em"}}>Checklist</div>
              </div>
              {locations.map(loc => (
                <div key={loc.id} style={{padding:"14px 20px",background:C.bg,textAlign:"center",borderLeft:`1px solid ${C.borderLight}`}}>
                  <div style={{fontSize:13,fontWeight:700,color:C.text}}>{loc.name}</div>
                </div>
              ))}
            </div>
            {section.ops.map(op => (
              <div key={op.id} style={{display:"grid",gridTemplateColumns:`260px repeat(${locations.length},1fr)`,borderBottom:`1px solid ${C.borderLight}`,transition:"background 0.1s"}}
                onMouseEnter={e=>e.currentTarget.style.background=C.surfaceHover} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <div style={{padding:"14px 20px",display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:6,height:6,borderRadius:3,background:section.comingSoon?C.textMut:C.pri,flexShrink:0}}/>
                  <div style={{fontSize:13,fontWeight:600,color:C.text}}>{op.label}</div>
                </div>
                {locations.map(loc => {
                  if (section.comingSoon) {
                    return (
                      <div key={loc.id} style={{padding:"12px 20px",borderLeft:`1px solid ${C.borderLight}`,display:"flex",alignItems:"center",justifyContent:"center"}}>
                        <span style={{fontSize:11,fontWeight:700,color:C.textMut,background:C.bg,borderRadius:12,padding:"3px 10px",textTransform:"uppercase",letterSpacing:"0.05em"}}>Coming Soon</span>
                      </div>
                    );
                  }
                  const st = getOpsStatus(op, loc.id);
                  const bg = st.status === "complete" ? C.suc+"14" : st.status === "progress" ? C.acc+"14" : "transparent";
                  const color = st.status === "complete" ? C.suc : st.status === "progress" ? C.acc : C.textMut;
                  const label = st.status === "complete" ? "Complete" : st.status === "progress" ? "In Progress" : "Not Started";
                  return (
                    <div key={loc.id} style={{padding:"12px 20px",borderLeft:`1px solid ${C.borderLight}`,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4,cursor:"pointer"}}
                      onClick={()=>{ handleLocationChange(loc.id); setTimeout(()=>{ if (op.routeTo) nav(op.routeTo); }, 50); }}>
                      <div style={{padding:"4px 12px",borderRadius:20,background:bg,fontSize:11,fontWeight:700,color,whiteSpace:"nowrap"}}>{label}</div>
                      {st.total > 0 && (
                        <div style={{display:"flex",alignItems:"center",gap:6,width:"100%",maxWidth:120}}>
                          <div style={{flex:1,height:4,borderRadius:2,background:C.border}}>
                            <div style={{height:4,borderRadius:2,background:color,width:`${st.pct}%`,transition:"width 0.3s"}}/>
                          </div>
                          <span style={{fontSize:10,fontWeight:600,color:C.textMut,whiteSpace:"nowrap"}}>{st.done}/{st.total}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </Card>
        </div>
      ))}
      </>
      ) : (
      /* ═══ WEEK VIEW ═══ */
      <>
      {locations.map(loc => (
        <Card key={loc.id} style={{padding:0,overflow:"hidden",marginBottom:20}}>
          <div style={{padding:"14px 20px",background:C.priLt,borderBottom:`2px solid ${C.border}`,display:"flex",alignItems:"center",gap:10}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.pri} strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            <span style={{fontSize:15,fontWeight:700,color:C.pri}}>{loc.name}</span>
          </div>
          {/* Column headers */}
          <div style={{display:"grid",gridTemplateColumns:`220px repeat(7,1fr) 80px`,borderBottom:`1px solid ${C.border}`,background:C.bg}}>
            <div style={{padding:"10px 16px",fontSize:11,fontWeight:700,color:C.textSec,textTransform:"uppercase"}}>Checklist</div>
            {weekDays.map(d => {
              const isTd = d === todayStr();
              return <div key={d} style={{padding:"8px 0",textAlign:"center",borderLeft:`1px solid ${C.borderLight}`,background:isTd?C.priLt:"transparent"}}>
                <div style={{fontSize:10,fontWeight:700,color:isTd?C.pri:C.textMut,textTransform:"uppercase"}}>{shortDay(d)}</div>
                <div style={{fontSize:14,fontWeight:800,color:isTd?C.pri:C.text}}>{dayNum(d)}</div>
              </div>;
            })}
            <div style={{padding:"10px 8px",textAlign:"center",fontSize:11,fontWeight:700,color:C.textSec,textTransform:"uppercase",borderLeft:`1px solid ${C.border}`}}>Week</div>
          </div>
          {/* Rows */}
          {dailyOps.map(op => {
            const ws = getWeekSummary(op, loc.id);
            const weekColor = ws.daysComplete === 7 ? C.suc : ws.daysComplete > 0 ? C.acc : C.textMut;
            return (
              <div key={op.id} style={{display:"grid",gridTemplateColumns:`220px repeat(7,1fr) 80px`,borderBottom:`1px solid ${C.borderLight}`,transition:"background 0.1s"}}
                onMouseEnter={e=>e.currentTarget.style.background=C.surfaceHover} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <div style={{padding:"12px 16px",display:"flex",alignItems:"center",gap:8}}>
                  <div style={{width:5,height:5,borderRadius:3,background:C.pri,flexShrink:0}}/>
                  <div style={{fontSize:12,fontWeight:600,color:C.text}}>{op.label}</div>
                </div>
                {weekDays.map(d => {
                  const st = getOpsStatusForDate(op, loc.id, d);
                  const isTd = d === todayStr();
                  return <div key={d} style={{borderLeft:`1px solid ${C.borderLight}`,display:"flex",alignItems:"center",justifyContent:"center",background:isTd?`${C.priLt}40`:"transparent",cursor:"pointer",padding:"8px 4px"}}
                    onClick={()=>{ setViewDate(d); setViewMode("day"); }}>
                    {st.status === "complete" ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.suc} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                    ) : st.status === "progress" ? (
                      <div style={{width:20,height:20,borderRadius:10,border:`2.5px solid ${C.acc}`,display:"flex",alignItems:"center",justifyContent:"center"}}>
                        <div style={{width:8,height:8,borderRadius:4,background:C.acc}}/>
                      </div>
                    ) : (
                      <div style={{width:20,height:20,borderRadius:10,border:`2px solid ${C.border}`}}/>
                    )}
                  </div>;
                })}
                <div style={{borderLeft:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"center",gap:2}}>
                  <span style={{fontSize:13,fontWeight:800,color:weekColor}}>{ws.daysComplete}</span>
                  <span style={{fontSize:11,fontWeight:500,color:C.textMut}}>/7</span>
                </div>
              </div>
            );
          })}
        </Card>
      ))}
      </>
      )}

    </div>
  );
}

export { EnterpriseOperationsPage };
