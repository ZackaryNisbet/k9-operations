import { C } from "../constants/colors";
import { LC_OP_LABELS } from "../lib/filters";
import { useState } from "react";

function GenericFilterPanel({ fields, filters, onChange, onClose, presets = [] }) {
  const [debounceTimers] = useState({});
  const activeCount = Object.keys(filters).length;

  const setFilter = (key, op, val) => {
    const n = { ...filters };
    if (val === "" && op !== "empty" && op !== "notEmpty" && op !== "has" && op !== "missing") {
      delete n[key];
    } else {
      n[key] = { op, val };
    }
    onChange(n);
  };

  const setFilterDebounced = (key, op, val) => {
    if (debounceTimers[key]) clearTimeout(debounceTimers[key]);
    debounceTimers[key] = setTimeout(() => setFilter(key, op, val), 300);
  };

  const clearFilter = (key) => { const n = { ...filters }; delete n[key]; onChange(n); };
  const clearAll = () => onChange({});

  const applyPreset = (preset) => {
    const keys = Object.keys(preset.filters);
    const isActive = keys.every(k => filters[k] && filters[k].op === preset.filters[k].op);
    if (isActive) {
      const n = { ...filters };
      keys.forEach(k => delete n[k]);
      onChange(n);
    } else {
      onChange({ ...filters, ...preset.filters });
    }
  };

  const sections = fields.reduce((acc, f) => {
    if (!acc[f.section]) acc[f.section] = [];
    acc[f.section].push(f);
    return acc;
  }, {});

  const renderField = (field) => {
    const f = filters[field.key];
    const hasVal = !!f;
    const curOp = f?.op || field.ops[0];
    const curVal = f?.val ?? "";
    const noValueOps = ["empty","notEmpty","has","missing"];
    const needsValue = !["presence"].includes(field.type) && !noValueOps.includes(curOp);

    return (
      <div key={field.key} style={{padding:"6px 8px",borderRadius:6,borderLeft:hasVal?`3px solid ${C.suc}`:"3px solid transparent",background:hasVal?`${C.suc}06`:"transparent",transition:"all 0.15s"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
          <span style={{fontSize:11,fontWeight:600,color:hasVal?C.text:C.textSec}}>{field.label}</span>
          {hasVal && <button onClick={()=>clearFilter(field.key)} style={{border:"none",background:"none",cursor:"pointer",color:C.textMut,padding:0,display:"flex",lineHeight:1}} title="Clear"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>}
        </div>
        <div style={{display:"flex",gap:4}}>
          <select value={curOp} onChange={e => {
            const newOp = e.target.value;
            if (!needsValue || noValueOps.includes(newOp)) { setFilter(field.key, newOp, ""); }
            else if (hasVal) { setFilter(field.key, newOp, curVal); }
          }} style={{width:needsValue?72:"100%",padding:"4px 2px",border:`1px solid ${hasVal?C.suc+"50":C.borderLight}`,borderRadius:4,fontSize:10,fontFamily:"inherit",background:C.surface,color:C.text,cursor:"pointer",flexShrink:0}}>
            {field.ops.map(op => <option key={op} value={op}>{LC_OP_LABELS[op]||op}</option>)}
          </select>
          {needsValue && (
            field.type === "select" ? (
              <select value={curVal} onChange={e => setFilter(field.key, curOp, e.target.value)} style={{flex:1,padding:"4px 4px",border:`1px solid ${hasVal?C.suc+"50":C.borderLight}`,borderRadius:4,fontSize:10,fontFamily:"inherit",background:C.surface,color:C.text,cursor:"pointer"}}>
                <option value="">Select…</option>
                {(field.options||[]).map(o => <option key={o} value={o}>{o || "(none)"}</option>)}
              </select>
            ) : field.type === "date" ? (
              <input type="date" defaultValue={curVal} onChange={e => setFilter(field.key, curOp, e.target.value)} style={{flex:1,padding:"4px 4px",border:`1px solid ${hasVal?C.suc+"50":C.borderLight}`,borderRadius:4,fontSize:10,fontFamily:"inherit",background:C.surface,color:C.text}} />
            ) : (
              <input type={field.type==="text"?"text":"number"} defaultValue={curVal}
                placeholder={field.type==="currency"?"$0":"0"}
                onChange={e => { const v=e.target.value; if(field.type==="text"){setFilterDebounced(field.key,curOp,v);}else{setFilter(field.key,curOp,v);} }}
                style={{flex:1,padding:"4px 6px",border:`1px solid ${hasVal?C.suc+"50":C.borderLight}`,borderRadius:4,fontSize:10,fontFamily:"inherit",background:C.surface,color:C.text,minWidth:0}} />
            )
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%",overflow:"hidden"}}>
      <div style={{padding:"16px 14px 12px",borderBottom:`1px solid ${C.borderLight}`,flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.pri} strokeWidth="2.5" strokeLinecap="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
            <span style={{fontSize:14,fontWeight:800,color:C.text}}>Filters</span>
            {activeCount > 0 && <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",minWidth:20,height:20,padding:"0 6px",borderRadius:10,fontSize:11,fontWeight:800,background:C.pri,color:"#fff"}}>{activeCount}</span>}
          </div>
          <button onClick={onClose} style={{border:"none",background:"none",cursor:"pointer",color:C.textMut,padding:4,display:"flex",borderRadius:4}}
            onMouseEnter={e=>e.currentTarget.style.background=C.surfaceHover} onMouseLeave={e=>e.currentTarget.style.background="none"}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        {activeCount > 0 && <button onClick={clearAll} style={{width:"100%",padding:"5px 8px",border:`1px solid ${C.border}`,borderRadius:6,background:C.surface,fontSize:10,fontWeight:600,color:C.textSec,cursor:"pointer",fontFamily:"inherit"}}>Clear All Filters</button>}
      </div>
      {presets.length > 0 && (
        <div style={{padding:"10px 14px 6px",borderBottom:`1px solid ${C.borderLight}`,flexShrink:0}}>
          <div style={{fontSize:9,fontWeight:700,color:C.textMut,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>Quick Filters</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
            {presets.map(p => {
              const keys = Object.keys(p.filters);
              const isOn = keys.every(k => filters[k] && filters[k].op === p.filters[k].op);
              return <button key={p.label} onClick={()=>applyPreset(p)} style={{padding:"4px 8px",borderRadius:6,border:`1.5px solid ${isOn?C.pri:C.border}`,background:isOn?C.priLt:"transparent",color:isOn?C.pri:C.textSec,fontSize:10,fontWeight:600,cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s",whiteSpace:"nowrap"}}>{p.icon} {p.label}</button>;
            })}
          </div>
        </div>
      )}
      <div style={{flex:1,overflowY:"auto",padding:"8px 10px"}}>
        {Object.entries(sections).map(([section, flds]) => (
          <div key={section} style={{marginBottom:12}}>
            <div style={{fontSize:9,fontWeight:700,color:C.textMut,textTransform:"uppercase",letterSpacing:"0.06em",padding:"4px 4px 6px"}}>{section}</div>
            <div style={{display:"flex",flexDirection:"column",gap:2}}>{flds.map(renderField)}</div>
          </div>
        ))}
      </div>
      <div style={{padding:"10px 14px",borderTop:`1px solid ${C.borderLight}`,flexShrink:0,textAlign:"center"}}>
        <button onClick={onClose} style={{width:"100%",padding:"8px 12px",border:"none",borderRadius:6,background:C.pri,color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>Done</button>
      </div>
    </div>
  );
}

export { GenericFilterPanel };
