import { C } from "../constants/colors";
import { useEffect, useRef, useState } from "react";

function ManualDiscountEntry({ onApply }) {
  const [open, setOpen] = useState(false);
  const [dType, setDType] = useState("percent");
  const [dVal, setDVal] = useState("");
  const ref = useRef(null);
  useEffect(() => { if (!open) return; const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, [open]);
  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button onClick={() => setOpen(!open)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: C.surface, cursor: "pointer", color: C.pri, fontSize: 12, fontWeight: 700, fontFamily: "inherit", transition: "all 0.15s" }} onMouseEnter={e => e.currentTarget.style.borderColor = C.pri} onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>
        Add Discount
      </button>
      {open && (
        <div style={{ position: "absolute", bottom: "100%", left: 0, marginBottom: 6, zIndex: 100, background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: 14, boxShadow: "0 12px 40px rgba(0,0,0,0.15)", padding: 16, minWidth: 260 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Manual Discount</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            {["percent", "flat"].map(t => (
              <button key={t} onClick={() => setDType(t)} style={{ flex: 1, padding: "6px 0", borderRadius: 8, border: `1.5px solid ${dType === t ? C.pri : C.border}`, background: dType === t ? C.priLt : "transparent", color: dType === t ? C.pri : C.textSec, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                {t === "percent" ? "%" : "$"}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input type="number" min="0" step={dType === "percent" ? "1" : "0.01"} value={dVal} onChange={e => setDVal(e.target.value)} placeholder={dType === "percent" ? "10" : "5.00"} style={{ flex: 1, padding: "8px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, color: C.text, background: C.bg, outline: "none", fontFamily: "inherit" }}/>
            <button onClick={() => { const v = parseFloat(dVal); if (v > 0) { onApply(dType, v); setOpen(false); setDVal(""); } }} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: C.pri, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Apply</button>
          </div>
        </div>
      )}
    </div>
  );
}

export { ManualDiscountEntry };
