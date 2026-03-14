// K9 Operations — Shared UI Components
// DO NOT MODIFY — stable API consumed by all page files.

import React, { useState, useRef, useEffect } from "react";
import ReactDOM from "react-dom";
import { C, K9_LOGO_SRC, K9_LOGO_PNG, DEF_CLIENT_FIELDS, DEF_DOG_FIELDS, DEFAULT_LIFECYCLE_BANNERS, LITE_ACTION_LABELS, LITE_ACTION_LEVELS, fmtPhoneInput } from "./theme";
import { I } from "./icons";

const K9Logo = ({size=38}) => <img src={K9_LOGO_SRC || K9_LOGO_PNG} alt="K9 Resorts" style={{width:size,height:"auto",objectFit:"contain",filter:"drop-shadow(0 1px 2px rgba(0,0,0,0.3))"}}/>;
const K9LogoMini = ({size=28}) => <img src={K9_LOGO_SRC || K9_LOGO_PNG} alt="K9 Resorts" style={{width:size,height:"auto",objectFit:"contain",filter:"drop-shadow(0 1px 2px rgba(0,0,0,0.3))"}}/>;

function Tip({ text, children }) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const ref = useRef(null);
  if (!text) return children;
  const handleEnter = () => {
    if (ref.current) {
      const r = ref.current.getBoundingClientRect();
      setPos({ x: r.left + r.width / 2, y: r.top });
    }
    setShow(true);
  };
  return (
    <span ref={ref} onMouseEnter={handleEnter} onMouseLeave={() => setShow(false)} style={{ display: "inline-flex", cursor: "default" }}>
      {children}
      {show && <div style={{ position: "fixed", left: pos.x, top: pos.y - 6, transform: "translate(-50%, -100%)", padding: "6px 12px", borderRadius: 8, background: "#1a1a2e", color: "#fff", fontSize: 11, fontWeight: 600, lineHeight: 1.5, whiteSpace: "pre-line", maxWidth: 340, zIndex: 9999, pointerEvents: "none", boxShadow: "0 4px 16px rgba(0,0,0,0.25)", letterSpacing: "0.01em" }}>
        {text}
        <div style={{ position: "absolute", left: "50%", bottom: -4, transform: "translateX(-50%)", width: 0, height: 0, borderLeft: "5px solid transparent", borderRight: "5px solid transparent", borderTop: "5px solid #1a1a2e" }} />
      </div>}
    </span>
  );
}


function Badge({children,color="default",size="sm",tip}) {
  const cm={default:{bg:C.surfaceHover,text:C.textSec},primary:{bg:C.priLt,text:C.pri},success:{bg:C.sucLt,text:C.suc},warning:{bg:C.warnLt,text:C.warn},danger:{bg:C.danLt,text:C.dan},info:{bg:C.infoLt,text:C.info},accent:{bg:C.accLt,text:C.accDk}};
  const s=cm[color]||cm.default;
  const el = <span style={{display:"inline-flex",alignItems:"center",padding:size==="sm"?"2px 10px":"4px 14px",borderRadius:20,fontSize:size==="sm"?11:13,fontWeight:600,background:s.bg,color:s.text,letterSpacing:"0.01em",whiteSpace:"nowrap"}}>{children}</span>;
  return tip ? <Tip text={tip}>{el}</Tip> : el;
}

function Btn({children,variant="primary",size="md",onClick,disabled,style={},icon}) {
  const base={display:"inline-flex",alignItems:"center",gap:6,border:"none",cursor:disabled?"not-allowed":"pointer",fontWeight:600,fontFamily:"inherit",borderRadius:10,transition:"all 0.15s",opacity:disabled?0.5:1,letterSpacing:"0.01em"};
  const sz={sm:{padding:"6px 14px",fontSize:13},md:{padding:"10px 20px",fontSize:14},lg:{padding:"12px 24px",fontSize:15}};
  const vr={primary:{background:C.pri,color:"#fff"},accent:{background:C.acc,color:"#fff"},secondary:{background:C.surfaceHover,color:C.text,border:`1px solid ${C.border}`},ghost:{background:"transparent",color:C.textSec},danger:{background:C.danLt,color:C.dan},success:{background:C.suc,color:"#fff"}};
  return <button onClick={onClick} disabled={disabled} style={{...base,...sz[size],...vr[variant],...style}}>{icon&&icon}{children}</button>;
}


function CustomSelect({ value, onChange, options, placeholder, disabled, style: extraStyle, small }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const listRef = useRef(null);
  useEffect(() => { if (!open) return; const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, [open]);
  // Scroll to selected item when opening
  useEffect(() => { if (open && listRef.current && value) { const el = listRef.current.querySelector(`[data-val="${CSS.escape ? CSS.escape(value) : value}"]`); if (el) el.scrollIntoView({ block: "nearest" }); } }, [open]);
  const opts = (options || []).map(o => typeof o === "string" ? { value: o, label: o } : o);
  const selected = opts.find(o => o.value === value);
  const sz = small ? { padding: "6px 10px", fontSize: 12, borderRadius: 8 } : { padding: "10px 14px", fontSize: 14, borderRadius: 10 };
  return (
    <div ref={ref} style={{ position: "relative", width: "100%", ...extraStyle }}>
      <button type="button" onClick={() => { if (!disabled) setOpen(!open); }}
        style={{ width: "100%", ...sz, border: `1.5px solid ${open ? C.pri : C.border}`, fontFamily: "inherit", color: selected ? C.text : C.textMut, background: disabled ? C.bg : C.surface, cursor: disabled ? "default" : "pointer", textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, transition: "border 0.15s", outline: "none", boxSizing: "border-box", fontWeight: selected ? 500 : 400, ...(disabled ? { opacity: 0.55, pointerEvents: "none" } : {}) }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{selected ? selected.label : (placeholder || "Select...")}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.textMut} strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0, transition: "transform 0.15s", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {open && (
        <div ref={listRef} onClick={e => e.stopPropagation()} style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, zIndex: 200, background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: 12, boxShadow: "0 8px 30px rgba(0,0,0,0.12)", maxHeight: 220, overflowY: "auto", padding: "4px 0" }}>
          {/* Empty option */}
          <button type="button" data-val="" onClick={() => { onChange(""); setOpen(false); }}
            style={{ width: "100%", padding: small ? "7px 12px" : "9px 16px", border: "none", background: value === "" ? C.priLt : "transparent", color: C.textMut, fontSize: small ? 12 : 13, fontWeight: 500, fontFamily: "inherit", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 8, transition: "background 0.1s" }}
            onMouseEnter={e => { if (value !== "") e.currentTarget.style.background = C.bg; }}
            onMouseLeave={e => { if (value !== "") e.currentTarget.style.background = "transparent"; }}>
            <span style={{ color: C.textMut, fontStyle: "italic" }}>{placeholder || "Select..."}</span>
          </button>
          {opts.filter(o => o.value !== "").map(o => {
            const isSel = o.value === value;
            return (
              <button type="button" key={o.value} data-val={o.value} onClick={() => { onChange(o.value); setOpen(false); }}
                style={{ width: "100%", padding: small ? "7px 12px" : "9px 16px", border: "none", background: isSel ? C.priLt : "transparent", color: isSel ? C.pri : C.text, fontSize: small ? 12 : 13, fontWeight: isSel ? 700 : 500, fontFamily: "inherit", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 8, transition: "background 0.1s" }}
                onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = C.bg; }}
                onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = "transparent"; }}>
                {isSel && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.pri} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="20 6 9 17 4 12"/></svg>}
                <span>{o.label}</span>
              </button>
            );
          })}
          {opts.length === 0 && <div style={{ padding: "12px 16px", fontSize: 12, color: C.textMut, fontStyle: "italic" }}>No options available</div>}
        </div>
      )}
    </div>
  );
}

// ─── Mini Date Picker — compact inline date picker with calendar popup ───

function MiniDatePicker({ value, onChange, style: extraStyle, min, max, disabled, placeholder, recommendedDate, recommendedHint }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState("days");
  const ref = useRef(null);
  const parsed = value ? new Date(value + "T12:00:00") : new Date();
  const [vMonth, setVMonth] = useState(parsed.getMonth());
  const [vYear, setVYear] = useState(parsed.getFullYear());
  const [yrPage, setYrPage] = useState(Math.floor(parsed.getFullYear() / 12) * 12);
  useEffect(() => { if (!open) return; const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, [open]);
  useEffect(() => { if (open) { setView("days"); if (value) { const d = new Date(value + "T12:00:00"); setVMonth(d.getMonth()); setVYear(d.getFullYear()); setYrPage(Math.floor(d.getFullYear() / 12) * 12); } } }, [open]);
  const days = useMemo(() => { const first = new Date(vYear, vMonth, 1); const sd = first.getDay(); const dim = new Date(vYear, vMonth + 1, 0).getDate(); const c = []; for (let i = 0; i < sd; i++) c.push(null); for (let d = 1; d <= dim; d++) c.push(d); return c; }, [vMonth, vYear]);
  const ml = new Date(vYear, vMonth).toLocaleDateString("en-US", { month: "short", year: "numeric" });
  const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const prev = () => { if (view === "years") setYrPage(p => p - 12); else if (view === "months") setVYear(y => y - 1); else { if (vMonth === 0) { setVMonth(11); setVYear(y => y - 1); } else setVMonth(m => m - 1); } };
  const next = () => { if (view === "years") setYrPage(p => p + 12); else if (view === "months") setVYear(y => y + 1); else { if (vMonth === 11) { setVMonth(0); setVYear(y => y + 1); } else setVMonth(m => m + 1); } };
  const pick = (day) => { const m = String(vMonth + 1).padStart(2, "0"); const d = String(day).padStart(2, "0"); onChange(`${vYear}-${m}-${d}`); setOpen(false); };
  const display = value ? new Date(value + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
  const td = new Date().toISOString().slice(0, 10);
  const headerLabel = view === "years" ? `${yrPage} \u2013 ${yrPage + 11}` : view === "months" ? String(vYear) : ml;
  const headerClick = () => { if (view === "days") { setYrPage(Math.floor(vYear / 12) * 12); setView("years"); } else if (view === "months") { setYrPage(Math.floor(vYear / 12) * 12); setView("years"); } };
  const navBtn = { width: 26, height: 26, borderRadius: 7, border: `1px solid ${C.border}`, background: C.bg, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.textSec, fontFamily: "inherit", padding: 0 };
  const curYr = new Date().getFullYear(); const curMo = new Date().getMonth();
  const selYr = value ? new Date(value + "T12:00:00").getFullYear() : -1;
  const selMo = value ? new Date(value + "T12:00:00").getMonth() : -1;
  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block", ...extraStyle }}>
      <button type="button" onClick={() => { if (!disabled) setOpen(!open); }}
        style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${open ? C.pri : C.border}`, fontSize: 11, fontFamily: "inherit", color: value ? C.text : C.textMut, background: disabled ? C.bg : C.surface, cursor: disabled ? "default" : "pointer", display: "inline-flex", alignItems: "center", gap: 5, transition: "border 0.15s", outline: "none", fontWeight: 600, whiteSpace: "nowrap", ...(disabled ? { opacity: 0.55, pointerEvents: "none" } : {}) }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.textMut} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        {display || (placeholder || "Pick date")}
        {value && !disabled && <span onClick={(e) => { e.stopPropagation(); onChange(""); }} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 14, height: 14, borderRadius: 7, background: C.bg, color: C.textMut, fontSize: 10, cursor: "pointer", lineHeight: 1, flexShrink: 0, marginLeft: 2 }} onMouseEnter={e => { e.currentTarget.style.background = C.danLt; e.currentTarget.style.color = C.dan; }} onMouseLeave={e => { e.currentTarget.style.background = C.bg; e.currentTarget.style.color = C.textMut; }}>×</span>}
      </button>
      {open && (
        <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, zIndex: 200, background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: 12, boxShadow: "0 8px 30px rgba(0,0,0,0.15)", padding: 14, width: 260 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <button onClick={prev} style={navBtn}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg></button>
            <span onClick={headerClick} style={{ fontSize: 12, fontWeight: 700, color: C.text, cursor: view !== "years" ? "pointer" : "default", padding: "2px 6px", borderRadius: 5, transition: "background 0.15s" }} onMouseEnter={e => { if (view !== "years") e.currentTarget.style.background = C.bg; }} onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>{headerLabel}</span>
            <button onClick={next} style={navBtn}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg></button>
          </div>
          {view === "years" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4 }}>
              {Array.from({ length: 12 }, (_, i) => yrPage + i).map(yr => { const isSel = yr === selYr; const isCur = yr === curYr; return (
                <button key={yr} onClick={() => { setVYear(yr); setView("months"); }} style={{ padding: "8px 0", borderRadius: 8, border: isSel ? `2px solid ${C.pri}` : isCur ? `1.5px solid ${C.acc}` : "1.5px solid transparent", background: isSel ? C.priLt : "transparent", color: isSel ? C.pri : isCur ? C.acc : C.text, fontSize: 11, fontWeight: isSel || isCur ? 700 : 500, cursor: "pointer", fontFamily: "inherit", transition: "all 0.1s" }} onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = C.bg; }} onMouseLeave={e => { e.currentTarget.style.background = isSel ? C.priLt : "transparent"; }}>{yr}</button>
              ); })}
            </div>
          )}
          {view === "months" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4 }}>
              {MONTHS_SHORT.map((mn, i) => { const isSel = i === selMo && vYear === selYr; const isCur = i === curMo && vYear === curYr; return (
                <button key={mn} onClick={() => { setVMonth(i); setView("days"); }} style={{ padding: "8px 0", borderRadius: 8, border: isSel ? `2px solid ${C.pri}` : isCur ? `1.5px solid ${C.acc}` : "1.5px solid transparent", background: isSel ? C.priLt : "transparent", color: isSel ? C.pri : isCur ? C.acc : C.text, fontSize: 11, fontWeight: isSel || isCur ? 700 : 500, cursor: "pointer", fontFamily: "inherit", transition: "all 0.1s" }} onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = C.bg; }} onMouseLeave={e => { e.currentTarget.style.background = isSel ? C.priLt : "transparent"; }}>{mn}</button>
              ); })}
            </div>
          )}
          {view === "days" && <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", textAlign: "center", marginBottom: 2 }}>{["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => <span key={d} style={{ fontSize: 9, fontWeight: 700, color: C.textMut, padding: "2px 0" }}>{d}</span>)}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", textAlign: "center", gap: 1 }}>
            {days.map((day, i) => { if (day === null) return <div key={`e${i}`} />; const m = String(vMonth + 1).padStart(2, "0"); const d = String(day).padStart(2, "0"); const ds = `${vYear}-${m}-${d}`; const isSel = ds === value; const isToday = ds === td; const isRec = ds === recommendedDate; const isDis = (min && ds < min) || (max && ds > max); return (
              <button key={i} onClick={() => !isDis && pick(day)} style={{ width: 30, height: 30, borderRadius: 8, border: isSel ? `2px solid ${C.pri}` : isRec ? `2px solid ${C.suc}` : isToday ? `1.5px solid ${C.acc}` : "1.5px solid transparent", background: isSel ? C.priLt : isRec ? `${C.suc}12` : "transparent", color: isDis ? C.border : isSel ? C.pri : isRec ? C.suc : isToday ? C.acc : C.text, fontSize: 12, fontWeight: isSel || isToday || isRec ? 700 : 500, cursor: isDis ? "default" : "pointer", fontFamily: "inherit", padding: 0, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto", opacity: isDis ? 0.35 : 1 }} onMouseEnter={e => { if (!isSel && !isDis) e.currentTarget.style.background = isRec ? `${C.suc}20` : C.bg; }} onMouseLeave={e => { if (!isSel && !isDis) e.currentTarget.style.background = isRec ? `${C.suc}12` : "transparent"; }}>{day}</button>
            ); })}
          </div>
          {recommendedHint && <div style={{marginTop:8,padding:"6px 10px",borderRadius:8,background:`${C.suc}10`,border:`1px solid ${C.suc}30`,fontSize:10,color:C.suc,fontWeight:600,lineHeight:1.4}}>{recommendedHint}</div>}
          </>}
        </div>
      )}
    </div>
  );
}

// Stable compliance CheckItem — defined at module level so React doesn't unmount/remount on every render
function ComplianceCheckItem({ok, warn, label, detail, expandKey, expanded, onToggle, children}) {
  return (
    <div style={{flex:"1 1 0",minWidth:0}}>
      <button onClick={()=>onToggle(expandKey)} style={{width:"100%",padding:"10px 12px",borderRadius:10,border:`1.5px solid ${ok?C.suc+"60":warn?C.acc+"60":C.dan+"60"}`,background:ok?C.suc+"12":warn?C.acc+"12":C.dan+"12",cursor:"pointer",fontFamily:"inherit",textAlign:"left"}}>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontSize:14}}>{ok?"✓":warn?"⚠":"✗"}</span>
          <span style={{fontSize:12,fontWeight:700,color:ok?C.suc:warn?C.acc:C.dan}}>{label}</span>
          <span style={{fontSize:9,color:C.textMut,marginLeft:"auto"}}>{expanded?"▲":"▼"}</span>
        </div>
        <div style={{fontSize:10,color:C.textSec,marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{detail}</div>
      </button>
      {expanded&&children&&<div style={{marginTop:6,padding:"10px 12px",borderRadius:8,border:`1px solid ${C.border}`,background:C.surface}}>{children}</div>}
    </div>
  );
}

function Inp({label,value,onChange,type="text",placeholder,required,style={},options,rows,autoFocus,disabled}) {
  const ls={display:"block",fontSize:11,fontWeight:600,color:C.textSec,marginBottom:4,letterSpacing:"0.03em",textTransform:"uppercase"};
  const dis=disabled?{opacity:0.55,pointerEvents:"none",background:C.bg}:{};
  const is={width:"100%",padding:"10px 14px",border:`1.5px solid ${C.border}`,borderRadius:10,fontSize:14,fontFamily:"inherit",color:C.text,background:C.surface,outline:"none",transition:"border 0.15s",boxSizing:"border-box",...style,...dis};
  if(type==="select") {
    const opts = (options||[]).map(o => typeof o === "string" ? { value: o, label: o } : o);
    return <label style={{display:"block"}}>{label&&<span style={ls}>{label}{required&&<span style={{color:C.dan}}> *</span>}</span>}<CustomSelect value={value||""} onChange={onChange} options={opts} placeholder={placeholder||"Select..."} disabled={disabled}/></label>;
  }
  if(type==="date") {
    return <CalendarPicker label={label} value={value||""} onChange={onChange} required={required} disabled={disabled}/>;
  }
  if(type==="checkbox") return <label style={{display:"flex",alignItems:"center",gap:10,cursor:disabled?"default":"pointer",...(disabled?{opacity:0.55,pointerEvents:"none"}:{})}}><div onClick={()=>{if(!disabled)onChange(!value);}} style={{width:22,height:22,borderRadius:6,border:`2px solid ${value?C.pri:C.border}`,background:value?C.pri:"#fff",display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.15s",cursor:disabled?"default":"pointer",flexShrink:0,color:"#fff"}}>{value&&<I.Check/>}</div><span style={{fontSize:14,color:C.text}}>{label}</span></label>;
  if(type==="textarea") return <label style={{display:"block"}}>{label&&<span style={ls}>{label}{required&&<span style={{color:C.dan}}> *</span>}</span>}<textarea value={value||""} onChange={e=>onChange(e.target.value)} placeholder={placeholder} rows={rows||3} disabled={disabled} style={{...is,resize:"vertical",minHeight:70}} onFocus={e=>e.target.style.borderColor=C.pri} onBlur={e=>e.target.style.borderColor=C.border}/></label>;
  if(type==="tel") {
    const phoneDisplay = fmtPhoneInput(value);
    const handleTelChange = (e) => { const raw = e.target.value.replace(/\D/g, '').slice(0, 10); onChange(raw); };
    return <label style={{display:"block"}}>{label&&<span style={ls}>{label}{required&&<span style={{color:C.dan}}> *</span>}</span>}<input type="tel" value={phoneDisplay} onChange={handleTelChange} placeholder={placeholder||"(555) 123-4567"} disabled={disabled} style={is} autoFocus={autoFocus} onFocus={e=>e.target.style.borderColor=C.pri} onBlur={e=>e.target.style.borderColor=C.border} maxLength={14}/></label>;
  }
  return <label style={{display:"block"}}>{label&&<span style={ls}>{label}{required&&<span style={{color:C.dan}}> *</span>}</span>}<input type={type} value={value||""} onChange={e=>onChange(e.target.value)} placeholder={placeholder} disabled={disabled} style={is} autoFocus={autoFocus} onFocus={e=>e.target.style.borderColor=C.pri} onBlur={e=>e.target.style.borderColor=C.border}/></label>;
}

function CalendarPicker({ label, value, onChange, required, disabled, min, max, extraContent }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState("days");
  const [typedVal, setTypedVal] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const ref = useRef(null);
  const inputRef = useRef(null);
  const parsed = value ? new Date(value + "T12:00:00") : new Date();
  const [vMonth, setVMonth] = useState(parsed.getMonth());
  const [vYear, setVYear] = useState(parsed.getFullYear());
  const [yrPage, setYrPage] = useState(Math.floor(parsed.getFullYear() / 12) * 12);
  useEffect(() => { if (!open) return; const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, [open]);
  useEffect(() => { if (open) { setView("days"); if (value) { const d = new Date(value + "T12:00:00"); setVMonth(d.getMonth()); setVYear(d.getFullYear()); setYrPage(Math.floor(d.getFullYear() / 12) * 12); } } }, [open]);
  const days = useMemo(() => { const first = new Date(vYear, vMonth, 1); const sd = first.getDay(); const dim = new Date(vYear, vMonth + 1, 0).getDate(); const c = []; for (let i = 0; i < sd; i++) c.push(null); for (let d = 1; d <= dim; d++) c.push(d); return c; }, [vMonth, vYear]);
  const ml = new Date(vYear, vMonth).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const prev = () => { if (view === "years") setYrPage(p => p - 12); else if (view === "months") setVYear(y => y - 1); else { if (vMonth === 0) { setVMonth(11); setVYear(y => y - 1); } else setVMonth(m => m - 1); } };
  const next = () => { if (view === "years") setYrPage(p => p + 12); else if (view === "months") setVYear(y => y + 1); else { if (vMonth === 11) { setVMonth(0); setVYear(y => y + 1); } else setVMonth(m => m + 1); } };
  const pick = (day) => { const m = String(vMonth + 1).padStart(2, "0"); const d = String(day).padStart(2, "0"); onChange(`${vYear}-${m}-${d}`); setOpen(false); setIsTyping(false); };
  const display = value ? new Date(value + "T12:00:00").toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }) : "";
  const td = new Date().toISOString().slice(0, 10);
  const headerLabel = view === "years" ? `${yrPage} – ${yrPage + 11}` : view === "months" ? String(vYear) : ml;
  const headerClick = () => { if (view === "days") { setYrPage(Math.floor(vYear / 12) * 12); setView("years"); } else if (view === "months") { setYrPage(Math.floor(vYear / 12) * 12); setView("years"); } };
  const navBtn = { width: 28, height: 28, borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.bg, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.textSec, fontFamily: "inherit", padding: 0 };
  const curYr = new Date().getFullYear(); const curMo = new Date().getMonth();
  const selYr = value ? new Date(value + "T12:00:00").getFullYear() : -1;
  const selMo = value ? new Date(value + "T12:00:00").getMonth() : -1;
  // Auto-format typed date input as MM/DD/YYYY
  const fmtTypedDate = (raw) => {
    const digits = raw.replace(/\D/g, "").slice(0, 8);
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return digits.slice(0, 2) + "/" + digits.slice(2);
    return digits.slice(0, 2) + "/" + digits.slice(2, 4) + "/" + digits.slice(4);
  };
  const parseTypedDate = (str) => {
    const parts = str.split("/");
    if (parts.length !== 3) return null;
    const [mm, dd, yyyy] = parts;
    if (!mm || !dd || !yyyy || yyyy.length !== 4) return null;
    const m = parseInt(mm, 10); const d = parseInt(dd, 10); const y = parseInt(yyyy, 10);
    if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return null;
    const dim = new Date(y, m, 0).getDate();
    if (d > dim) return null;
    return `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
  };
  const handleTypedChange = (e) => {
    const formatted = fmtTypedDate(e.target.value);
    setTypedVal(formatted);
    if (formatted.length === 10) {
      const parsed = parseTypedDate(formatted);
      if (parsed) {
        const valid = (!min || parsed >= min) && (!max || parsed <= max);
        if (valid) { onChange(parsed); const pd = new Date(parsed + "T12:00:00"); setVMonth(pd.getMonth()); setVYear(pd.getFullYear()); }
      }
    }
  };
  const handleTypedBlur = () => {
    setIsTyping(false);
    if (typedVal.length === 10) {
      const parsed = parseTypedDate(typedVal);
      if (parsed) { const valid = (!min || parsed >= min) && (!max || parsed <= max); if (valid) onChange(parsed); }
    }
    setTypedVal("");
  };
  const handleTypedKeyDown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); handleTypedBlur(); inputRef.current?.blur(); }
    if (e.key === "Escape") { setIsTyping(false); setTypedVal(""); inputRef.current?.blur(); }
  };
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: C.textSec, marginBottom: 4, letterSpacing: "0.03em", textTransform: "uppercase" }}>{label}{required && <span style={{ color: C.dan }}> *</span>}</div>
      <div style={{ width: "100%", padding: "10px 14px", border: `1.5px solid ${open || isTyping ? C.pri : C.border}`, borderRadius: 10, fontSize: 14, fontFamily: "inherit", color: value ? C.text : C.textMut, background: disabled ? C.bg : C.surface, textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between", transition: "border 0.15s", boxSizing: "border-box", ...(disabled ? { opacity: 0.55, pointerEvents: "none" } : {}) }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
          <input
            ref={inputRef}
            value={isTyping ? typedVal : display}
            placeholder="MM/DD/YYYY"
            onFocus={() => { setIsTyping(true); setTypedVal(display); }}
            onBlur={handleTypedBlur}
            onChange={handleTypedChange}
            onKeyDown={handleTypedKeyDown}
            disabled={disabled}
            style={{ border: "none", outline: "none", background: "transparent", fontSize: 14, fontFamily: "inherit", color: C.text, width: "100%", padding: 0 }}
          />
          {value && !disabled && <span onClick={(e) => { e.stopPropagation(); onChange(""); setTypedVal(""); setIsTyping(false); }} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: 9, background: C.bg, color: C.textMut, fontSize: 12, cursor: "pointer", lineHeight: 1, flexShrink: 0 }} onMouseEnter={e => { e.currentTarget.style.background = C.danLt; e.currentTarget.style.color = C.dan; }} onMouseLeave={e => { e.currentTarget.style.background = C.bg; e.currentTarget.style.color = C.textMut; }}>×</span>}
        </span>
        <button onClick={(e) => { e.preventDefault(); if (!disabled) setOpen(!open); }} style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", flexShrink: 0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.textMut} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        </button>
      </div>
      {extraContent}
      {open && (
        <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 6, zIndex: 100, background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: 14, boxShadow: "0 12px 40px rgba(0,0,0,0.15)", padding: 16, width: 280 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <button onClick={prev} style={navBtn}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button>
            <span onClick={headerClick} style={{ fontSize: 14, fontWeight: 700, color: C.text, cursor: view !== "years" ? "pointer" : "default", padding: "2px 8px", borderRadius: 6, transition: "background 0.15s" }} onMouseEnter={e => { if (view !== "years") e.currentTarget.style.background = C.bg; }} onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>{headerLabel}</span>
            <button onClick={next} style={navBtn}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button>
          </div>
          {view === "years" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
              {Array.from({ length: 12 }, (_, i) => yrPage + i).map(yr => { const isSel = yr === selYr; const isCur = yr === curYr; return (
                <button key={yr} onClick={() => { setVYear(yr); setView("months"); }} style={{ padding: "10px 0", borderRadius: 10, border: isSel ? `2px solid ${C.pri}` : isCur ? `2px solid ${C.acc}` : "2px solid transparent", background: isSel ? C.priLt : "transparent", color: isSel ? C.pri : isCur ? C.acc : C.text, fontSize: 13, fontWeight: isSel || isCur ? 700 : 500, cursor: "pointer", fontFamily: "inherit", transition: "all 0.1s" }} onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = C.bg; }} onMouseLeave={e => { e.currentTarget.style.background = isSel ? C.priLt : "transparent"; }}>{yr}</button>
              ); })}
            </div>
          )}
          {view === "months" && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
              {MONTHS_SHORT.map((mn, i) => { const isSel = i === selMo && vYear === selYr; const isCur = i === curMo && vYear === curYr; return (
                <button key={mn} onClick={() => { setVMonth(i); setView("days"); }} style={{ padding: "10px 0", borderRadius: 10, border: isSel ? `2px solid ${C.pri}` : isCur ? `2px solid ${C.acc}` : "2px solid transparent", background: isSel ? C.priLt : "transparent", color: isSel ? C.pri : isCur ? C.acc : C.text, fontSize: 13, fontWeight: isSel || isCur ? 700 : 500, cursor: "pointer", fontFamily: "inherit", transition: "all 0.1s" }} onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = C.bg; }} onMouseLeave={e => { e.currentTarget.style.background = isSel ? C.priLt : "transparent"; }}>{mn}</button>
              ); })}
            </div>
          )}
          {view === "days" && <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", textAlign: "center", marginBottom: 4 }}>{["Su","Mo","Tu","We","Th","Fr","Sa"].map(d => <span key={d} style={{ fontSize: 10, fontWeight: 700, color: C.textMut, padding: "4px 0", textTransform: "uppercase" }}>{d}</span>)}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", textAlign: "center", gap: 2 }}>
            {days.map((day, i) => { if (day === null) return <div key={`e${i}`} />; const m = String(vMonth + 1).padStart(2, "0"); const d = String(day).padStart(2, "0"); const ds = `${vYear}-${m}-${d}`; const isSel = ds === value; const isToday = ds === td; const isDis = (min && ds < min) || (max && ds > max); return (
              <button key={i} onClick={() => !isDis && pick(day)} style={{ width: 34, height: 34, borderRadius: 10, border: isSel ? `2px solid ${C.pri}` : isToday ? `2px solid ${C.acc}` : "2px solid transparent", background: isSel ? C.priLt : "transparent", color: isDis ? C.border : isSel ? C.pri : isToday ? C.acc : C.text, fontSize: 13, fontWeight: isSel || isToday ? 700 : 500, cursor: isDis ? "default" : "pointer", fontFamily: "inherit", padding: 0, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto", opacity: isDis ? 0.35 : 1, transition: "all 0.1s" }} onMouseEnter={e => { if (!isSel && !isDis) e.currentTarget.style.background = C.bg; }} onMouseLeave={e => { if (!isSel && !isDis) e.currentTarget.style.background = "transparent"; }}>{day}</button>
            ); })}
          </div>
          </>}
        </div>
      )}
    </div>
  );
}


function Modal({title,onClose,children,wide,fullWidth}) {
  useEffect(() => { const h = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }; document.addEventListener("keydown", h); return () => document.removeEventListener("keydown", h); }, [onClose]);
  const mw = fullWidth ? "calc(100vw - 60px)" : wide ? 720 : 520;
  return <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",backdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:fullWidth?16:20}} onClick={onClose}><div onClick={e=>e.stopPropagation()} style={{background:C.surface,borderRadius:18,width:"100%",maxWidth:mw,maxHeight:fullWidth?"calc(100vh - 32px)":"90vh",overflow:"auto",boxShadow:"0 24px 48px rgba(0,0,0,0.15)"}}><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"20px 24px",borderBottom:`1px solid ${C.borderLight}`}}><h3 style={{margin:0,fontSize:18,fontWeight:700,color:C.text}}>{title}</h3><button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",color:C.textMut,display:"flex",padding:4,borderRadius:8}}><I.X/></button></div><div style={{padding:24}}>{children}</div></div></div>;
}

function Card({children,style={},onClick,hoverable}) {
  const [h,setH]=useState(false);
  return <div onClick={onClick} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)} style={{background:C.surface,borderRadius:14,border:`1px solid ${h&&hoverable?C.priLt:C.border}`,padding:20,transition:"all 0.2s",cursor:onClick?"pointer":"default",transform:h&&hoverable?"translateY(-1px)":"none",boxShadow:h&&hoverable?"0 4px 12px rgba(0,0,0,0.06)":"0 1px 3px rgba(0,0,0,0.02)",...style}}>{children}</div>;
}

// ─── Permission Helper ──────────────────────────────────────────────────────
function isFieldRequired(field, action) {
  const rf = field.requiredFor || [];
  if (rf.length === 0) return false;
  return rf.includes(action) || rf.includes("create");
}

function validateClientFields(fields, values) {
  const errs = {};
  fields.forEach(f => {
    if (isFieldRequired(f, "create") && !values[f.id]) errs[f.id] = "Required";
  });
  return errs;
}


export { K9Logo, K9LogoMini, Tip, Badge, Btn, CustomSelect, MiniDatePicker, ComplianceCheckItem, Inp, CalendarPicker, Modal, Card, isFieldRequired, validateClientFields };
