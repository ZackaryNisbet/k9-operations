// K9 Operations — Shared UI Components
// DO NOT MODIFY — stable API consumed by all page files.

import React, { useState, useRef, useEffect, useMemo, useCallback, useLayoutEffect } from "react";
import ReactDOM from "react-dom";
import { C, K9_LOGO_SRC, K9_LOGO_PNG, DEF_CLIENT_FIELDS, DEF_DOG_FIELDS, DEFAULT_LIFECYCLE_BANNERS, LITE_ACTION_LABELS, LITE_ACTION_LEVELS, fmtPhoneInput } from "./theme";
import { I } from "./icons";

const K9Logo = ({size=38, variant="dark"}) => <img src={variant === "white" ? "/k9_mark_white.svg" : (K9_LOGO_SRC || K9_LOGO_PNG)} alt="K9 Operations" style={{width:size,height:"auto",objectFit:"contain",filter:"drop-shadow(0 1px 2px rgba(0,0,0,0.3))"}}/>;
const K9LogoMini = ({size=28, variant="dark"}) => <img src={variant === "white" ? "/k9_mark_white.svg" : (K9_LOGO_SRC || K9_LOGO_PNG)} alt="K9 Operations" style={{width:size,height:"auto",objectFit:"contain",filter:"drop-shadow(0 1px 2px rgba(0,0,0,0.3))"}}/>;

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
  const el = <span style={{display:"inline-flex",alignItems:"center",padding:size==="sm"?"3px 10px":"5px 14px",borderRadius:20,fontSize:size==="sm"?11:13,fontWeight:700,background:s.bg,color:s.text,letterSpacing:"0.02em",whiteSpace:"nowrap",lineHeight:1.3}}>{children}</span>;
  return tip ? <Tip text={tip}>{el}</Tip> : el;
}

function Btn({children,variant="primary",size="md",onClick,disabled,style={},icon}) {
  const base={display:"inline-flex",alignItems:"center",gap:6,border:"none",cursor:disabled?"not-allowed":"pointer",fontWeight:700,fontFamily:"inherit",borderRadius:10,transition:"all 0.15s ease",opacity:disabled?0.5:1,letterSpacing:"0.01em"};
  const sz={sm:{padding:"6px 12px",fontSize:12},md:{padding:"8px 16px",fontSize:13},lg:{padding:"10px 20px",fontSize:14}};
  const vr={primary:{background:C.pri,color:"#fff"},accent:{background:C.acc,color:"#fff"},secondary:{background:C.surfaceHover,color:C.text,border:`1px solid ${C.border}`},ghost:{background:"transparent",color:C.textSec},danger:{background:C.danLt,color:C.dan},success:{background:C.suc,color:"#fff"}};
  return <button onClick={onClick} disabled={disabled} style={{...base,...sz[size],...vr[variant],...style}}>{icon&&icon}{children}</button>;
}


function CustomSelect({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  style: extraStyle,
  small,
  searchable = false,
  searchPlaceholder = "Search options",
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [menuStyle, setMenuStyle] = useState(null);
  const ref = useRef(null);
  const listRef = useRef(null);
  const searchRef = useRef(null);
  const opts = useMemo(
    () => (options || []).map(o => typeof o === "string" ? { value: o, label: o } : o),
    [options],
  );
  const selected = opts.find(o => o.value === value);
  const filteredOpts = useMemo(() => {
    if (!searchable) return opts;
    const normalizedQuery = String(query || "").trim().toLowerCase();
    if (!normalizedQuery) return opts;
    return opts.filter((option) => {
      const optionLabel = String(option?.label || "").toLowerCase();
      const optionValue = String(option?.value || "").toLowerCase();
      return optionLabel.includes(normalizedQuery) || optionValue.includes(normalizedQuery);
    });
  }, [opts, query, searchable]);
  const sz = small ? { padding: "6px 10px", fontSize: 12, borderRadius: 8 } : { padding: "10px 14px", fontSize: 14, borderRadius: 10 };
  const updateMenuPosition = useCallback(() => {
    if (!open || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const viewportPadding = 12;
    const width = Math.min(rect.width, window.innerWidth - viewportPadding * 2);
    const left = Math.max(viewportPadding, Math.min(rect.left, window.innerWidth - width - viewportPadding));
    const estimatedRowHeight = small ? 34 : 40;
    const estimatedSearchHeight = searchable ? 56 : 0;
    const estimatedHeight = Math.min(
      320,
      estimatedSearchHeight + 12 + Math.max(1, filteredOpts.length + 1) * estimatedRowHeight,
    );
    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
    const spaceAbove = rect.top - viewportPadding;
    const openUpward = spaceBelow < Math.min(estimatedHeight, 220) && spaceAbove > spaceBelow;
    const maxHeight = Math.max(120, Math.min(320, openUpward ? spaceAbove - 8 : spaceBelow - 8));
    const menuHeight = listRef.current?.offsetHeight || Math.min(estimatedHeight, maxHeight);
    const top = openUpward
      ? Math.max(viewportPadding, rect.top - menuHeight - 4)
      : rect.bottom + 4;
    setMenuStyle({
      position: "fixed",
      top,
      left,
      width,
      zIndex: 9999,
      maxHeight,
      transformOrigin: openUpward ? "bottom" : "top",
    });
  }, [filteredOpts.length, open, searchable, small]);
  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event) => {
      if (ref.current?.contains(event.target) || listRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const handleReposition = () => updateMenuPosition();
    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [open, updateMenuPosition]);
  useLayoutEffect(() => {
    if (!open) return;
    updateMenuPosition();
  }, [filteredOpts.length, open, updateMenuPosition]);
  useEffect(() => {
    if (!open) {
      setQuery("");
      return undefined;
    }
    const frame = window.requestAnimationFrame(() => {
      updateMenuPosition();
      if (searchable) searchRef.current?.focus();
      if (listRef.current && value !== undefined && value !== null) {
        const targetValue = String(value);
        const selectorValue = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(targetValue) : targetValue;
        const el = listRef.current.querySelector(`[data-val="${selectorValue}"]`);
        if (el) el.scrollIntoView({ block: "nearest" });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, searchable, updateMenuPosition, value]);
  const menu = open ? ReactDOM.createPortal(
    <div
      ref={listRef}
      onClick={e => e.stopPropagation()}
      style={{
        ...(menuStyle || {}),
        background: C.surface,
        border: `1.5px solid ${C.border}`,
        borderRadius: 12,
        boxShadow: "0 16px 40px rgba(0,0,0,0.16)",
        overflowY: "auto",
        padding: "4px 0",
      }}
    >
      {searchable && (
        <div style={{ position: "sticky", top: 0, zIndex: 1, padding: 8, background: C.surface, borderBottom: `1px solid ${C.borderLight}` }}>
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            style={{
              width: "100%",
              padding: small ? "7px 10px" : "9px 12px",
              borderRadius: 10,
              border: `1.5px solid ${C.border}`,
              background: "#fff",
              color: C.text,
              fontSize: small ? 12 : 13,
              fontFamily: "inherit",
              boxSizing: "border-box",
              outline: "none",
            }}
          />
        </div>
      )}
      <button
        type="button"
        data-val=""
        onClick={() => { onChange(""); setOpen(false); }}
        style={{ width: "100%", padding: small ? "7px 12px" : "9px 16px", border: "none", background: value === "" ? C.priLt : "transparent", color: C.textMut, fontSize: small ? 12 : 13, fontWeight: 500, fontFamily: "inherit", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 8, transition: "background 0.1s" }}
        onMouseEnter={e => { if (value !== "") e.currentTarget.style.background = C.bg; }}
        onMouseLeave={e => { if (value !== "") e.currentTarget.style.background = "transparent"; }}
      >
        <span style={{ color: C.textMut, fontStyle: "italic" }}>{placeholder || "Select..."}</span>
      </button>
      {filteredOpts.filter(o => o.value !== "").map(o => {
        const isSel = o.value === value;
        return (
          <button
            type="button"
            key={o.value}
            data-val={String(o.value)}
            onClick={() => { onChange(o.value); setOpen(false); }}
            style={{ width: "100%", padding: small ? "7px 12px" : "9px 16px", border: "none", background: isSel ? C.priLt : "transparent", color: isSel ? C.pri : C.text, fontSize: small ? 12 : 13, fontWeight: isSel ? 700 : 500, fontFamily: "inherit", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 8, transition: "background 0.1s" }}
            onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = C.bg; }}
            onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = "transparent"; }}
          >
            {isSel && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.pri} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="20 6 9 17 4 12"/></svg>}
            <span>{o.label}</span>
          </button>
        );
      })}
      {filteredOpts.filter(o => o.value !== "").length === 0 && (
        <div style={{ padding: "12px 16px", fontSize: 12, color: C.textMut, fontStyle: "italic" }}>
          {query ? "No matching options" : "No options available"}
        </div>
      )}
    </div>,
    document.body,
  ) : null;
  return (
    <div ref={ref} style={{ position: "relative", width: "100%", ...extraStyle }}>
      <button type="button" onClick={() => { if (!disabled) setOpen(!open); }}
        style={{ width: "100%", ...sz, border: `1.5px solid ${open ? C.pri : C.border}`, fontFamily: "inherit", color: selected ? C.text : C.textMut, background: disabled ? C.bg : C.surface, cursor: disabled ? "default" : "pointer", textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, transition: "border 0.15s", outline: "none", boxSizing: "border-box", fontWeight: selected ? 500 : 400, ...(disabled ? { opacity: 0.55, pointerEvents: "none" } : {}) }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{selected ? selected.label : (placeholder || "Select...")}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.textMut} strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0, transition: "transform 0.15s", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {menu}
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
  const [popLeft, setPopLeft] = useState(null);
  const [popTop, setPopTop] = useState(null);
  useEffect(() => { if (!open) return; const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, [open]);
  const reposition = useCallback(() => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const pw = 248; const pad = 8;
    let l = r.left;
    if (l + pw > window.innerWidth - pad) l = Math.max(pad, window.innerWidth - pw - pad);
    setPopLeft(l);
    setPopTop(r.bottom + 4);
  }, []);
  useEffect(() => {
    if (open) {
      setView("days");
      if (value) { const d = new Date(value + "T12:00:00"); setVMonth(d.getMonth()); setVYear(d.getFullYear()); setYrPage(Math.floor(d.getFullYear() / 12) * 12); }
      reposition();
      const onReposition = () => reposition();
      window.addEventListener("resize", onReposition);
      window.addEventListener("scroll", onReposition); // non-capture to reduce storm; still catches most container scrolls
      return () => {
        window.removeEventListener("resize", onReposition);
        window.removeEventListener("scroll", onReposition);
      };
    } else {
      setPopLeft(null);
      setPopTop(null);
    }
  }, [open, value, reposition]);
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
      {open && popTop != null && (
        <div style={{ position: "fixed", top: popTop, left: popLeft, marginTop: 0, zIndex: 2000, background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: 12, boxShadow: "0 8px 30px rgba(0,0,0,0.15)", padding: 12, width: 248 }}>
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
  const is={width:"100%",padding:"10px 14px",border:`1.5px solid ${C.border}`,borderRadius:12,fontSize:14,fontFamily:"inherit",color:C.text,background:C.surface,outline:"none",transition:"border 0.18s cubic-bezier(0.4,0,0.2,1)",boxSizing:"border-box",...style,...dis};
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

function CalendarPicker({ label, value, onChange, required, disabled, min, max, extraContent, reserveSpace = false }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState("days");
  const [typedVal, setTypedVal] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [panelStyle, setPanelStyle] = useState(null);
  const ref = useRef(null);
  const panelRef = useRef(null);
  const inputRef = useRef(null);
  const parsed = value ? new Date(value + "T12:00:00") : new Date();
  const [vMonth, setVMonth] = useState(parsed.getMonth());
  const [vYear, setVYear] = useState(parsed.getFullYear());
  const [yrPage, setYrPage] = useState(Math.floor(parsed.getFullYear() / 12) * 12);
  const updatePanelPosition = useCallback(() => {
    if (!open || !ref.current || typeof window === "undefined") return;
    const rect = ref.current.getBoundingClientRect();
    const width = 280;
    const viewportPadding = 12;
    const estimatedHeight = view === "days" ? 340 : 250;
    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
    const spaceAbove = rect.top - viewportPadding;
    const openUpward = spaceBelow < estimatedHeight && spaceAbove > spaceBelow;
    const availableHeight = Math.max(
      220,
      Math.min(estimatedHeight, openUpward ? spaceAbove - 6 : spaceBelow - 6),
    );
    setPanelStyle({
      position: "fixed",
      left: Math.max(viewportPadding, Math.min(rect.left, window.innerWidth - width - viewportPadding)),
      top: openUpward ? Math.max(viewportPadding, rect.top - availableHeight - 6) : rect.bottom + 6,
      width,
      maxHeight: availableHeight,
      zIndex: 2000,
    });
  }, [open, view]);
  useEffect(() => {
    if (!open) {
      setPanelStyle(null);
      return undefined;
    }
    const h = (e) => {
      if (ref.current?.contains(e.target) || panelRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const handleReposition = () => updatePanelPosition();
    document.addEventListener("mousedown", h);
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      document.removeEventListener("mousedown", h);
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [open, updatePanelPosition]);
  useLayoutEffect(() => {
    if (!open) return;
    updatePanelPosition();
  }, [open, updatePanelPosition]);
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
    <div ref={ref}>
      <div style={{ position: "relative" }}>
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
      {open && ReactDOM.createPortal((
        <div
          ref={panelRef}
          style={{
            ...(panelStyle || { position: "fixed", left: 12, top: 12, width: 280, maxHeight: 340, zIndex: 2000 }),
            background: C.surface,
            border: `1.5px solid ${C.border}`,
            borderRadius: 14,
            boxShadow: "0 12px 40px rgba(0,0,0,0.15)",
            padding: 16,
            overflowY: "auto",
            boxSizing: "border-box",
          }}
        >
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
      ), document.body)}
      </div>
      {open && reserveSpace && <div aria-hidden="true" style={{ height: 330 }} />}
    </div>
  );
}


function Modal({title,onClose,children,wide,fullWidth}) {
  useEffect(() => { const h = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } }; document.addEventListener("keydown", h); return () => document.removeEventListener("keydown", h); }, [onClose]);
  const mw = fullWidth ? "calc(100vw - 60px)" : wide ? 720 : 520;
  return <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",backdropFilter:"blur(6px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:fullWidth?16:20}} onClick={onClose}><div onClick={e=>e.stopPropagation()} style={{background:C.surface,borderRadius:20,width:"100%",maxWidth:mw,maxHeight:fullWidth?"calc(100vh - 32px)":"90vh",overflow:"auto",boxShadow:"0 24px 64px rgba(0,0,0,0.18), 0 8px 20px rgba(0,0,0,0.08)"}}><div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"22px 26px",borderBottom:`1px solid ${C.borderLight}`}}><h3 style={{margin:0,fontSize:18,fontWeight:700,color:C.text,letterSpacing:"-0.01em"}}>{title}</h3><button type="button" aria-label="Close modal" title="Close" onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",color:C.textMut,display:"flex",padding:4,borderRadius:8}}><I.X/></button></div><div style={{padding:26}}>{children}</div></div></div>;
}

function Card({children,style={},onClick,hoverable}) {
  const [h,setH]=useState(false);
  return <div onClick={onClick} onMouseEnter={()=>setH(true)} onMouseLeave={()=>setH(false)} style={{background:C.surface,borderRadius:16,border:`1px solid ${h&&hoverable?C.priLt:C.border}`,padding:20,transition:"all 0.2s cubic-bezier(0.4,0,0.2,1)",cursor:onClick?"pointer":"default",transform:h&&hoverable?"translateY(-2px)":"none",boxShadow:h&&hoverable?"0 8px 24px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.04)":"0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)",...style}}>{children}</div>;
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

// Standardized search bar used across the Labor module tabs (Roster, Attendance,
// Compliance, Interviews) so the input, icon, padding, and height are identical
// everywhere. `onChange` receives the new value; `children` render as the
// right-aligned pills/actions for that tab.
function LaborSearchBar({ value = "", onChange = () => {}, placeholder = "Search…", children = null }) {
  return (
    <div style={{ borderBottom: `1.5px solid ${C.borderLight}`, background: C.bg }}>
      <div style={{ display: "flex", alignItems: "center", padding: "0 16px", minHeight: 44 }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={value ? C.pri : C.textMut} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
        <input
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="no-focus-ring"
          style={{ border: "none", outline: "none", background: "transparent", fontSize: 13, fontWeight: 500, color: C.text, padding: "12px 10px", width: "100%", fontFamily: "inherit" }}
        />
        {value ? (
          <button type="button" onClick={() => onChange("")} title="Clear" style={{ border: "none", background: "none", cursor: "pointer", color: C.textMut, padding: 2, display: "flex", flexShrink: 0 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        ) : null}
        {children ? <div style={{ display: "flex", gap: 6, marginLeft: 8, flexShrink: 0, alignItems: "center" }}>{children}</div> : null}
      </div>
    </div>
  );
}


// Editable intro/header line shown under a Labor search bar. Shows `prefix`
// (e.g. a live count, not editable) + the intro text. Location admins (canEdit)
// get an inline editor; onSave(newText) persists it, onSave("") resets to default.
function LaborIntro({ value = "", defaultValue = "", prefix = null, canEdit = false, onSave = null }) {
  const override = typeof value === "string" ? value.trim() : "";
  const text = override || defaultValue;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const [saving, setSaving] = useState(false);
  const barStyle = { padding: "10px 18px", borderBottom: `1px solid ${C.borderLight}`, background: `linear-gradient(135deg, ${C.priLt || C.pri + "08"}40, ${C.surface})`, fontSize: 12, lineHeight: 1.6, color: C.textSec };

  const persist = async (next) => {
    if (!onSave) { setEditing(false); return; }
    setSaving(true);
    try { await onSave(next); } finally { setSaving(false); setEditing(false); }
  };

  if (editing) {
    return (
      <div style={{ ...barStyle, display: "flex", flexDirection: "column", gap: 8 }}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          autoFocus
          placeholder={defaultValue}
          style={{ width: "100%", boxSizing: "border-box", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 12, lineHeight: 1.5, fontFamily: "inherit", color: C.text, background: "#fff", outline: "none", resize: "vertical" }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button type="button" onClick={() => persist((draft || "").trim())} disabled={saving} style={{ padding: "5px 14px", borderRadius: 8, border: "none", background: C.pri, color: "#fff", fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>{saving ? "Saving…" : "Save"}</button>
          <button type="button" onClick={() => { setDraft(text); setEditing(false); }} disabled={saving} style={{ padding: "5px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: "transparent", color: C.textSec, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
          {override ? (
            <button type="button" onClick={() => persist("")} disabled={saving} style={{ marginLeft: "auto", padding: "5px 12px", borderRadius: 8, border: "none", background: "transparent", color: C.textMut, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Reset to default</button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...barStyle, display: "flex", alignItems: "flex-start", gap: 8 }}>
      <span style={{ flex: 1, minWidth: 0 }}>{prefix}{text}</span>
      {canEdit && onSave ? (
        <button type="button" onClick={() => { setDraft(text); setEditing(true); }} title="Edit this text" style={{ flexShrink: 0, border: "none", background: "none", cursor: "pointer", color: C.pri, padding: 2, display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 800, fontFamily: "inherit" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
          Edit
        </button>
      ) : null}
    </div>
  );
}


export { K9Logo, K9LogoMini, Tip, Badge, Btn, CustomSelect, MiniDatePicker, ComplianceCheckItem, Inp, CalendarPicker, Modal, Card, isFieldRequired, validateClientFields, LaborSearchBar, LaborIntro };
