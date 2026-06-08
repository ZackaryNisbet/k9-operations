import { C } from "../constants/colors";
import { useEffect, useRef, useState } from "react";

function DiscountPicker({ discounts, onSelect, clientId, data }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => { if (!open) return; const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, [open]);
  // Filter out one-time discounts already used by this client
  const client = clientId && data ? data.clients.find(c => c.id === clientId) : null;
  const usedDiscountIds = new Set((client?.discountUsage || []).map(u => u.discountId));
  const available = discounts.filter(d => {
    if (d.discountKind === "one-time" && usedDiscountIds.has(d.id)) return false;
    return true;
  });
  if (available.length === 0) return null;
  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button onClick={() => setOpen(!open)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: C.surface, cursor: "pointer", color: C.pri, fontSize: 12, fontWeight: 700, fontFamily: "inherit", transition: "all 0.15s" }} onMouseEnter={e => e.currentTarget.style.borderColor = C.pri} onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>
        Add Discount
      </button>
      {open && (
        <div style={{ position: "absolute", bottom: "100%", left: 0, marginBottom: 6, zIndex: 100, background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: 14, boxShadow: "0 12px 40px rgba(0,0,0,0.15)", padding: 8, minWidth: 260, maxHeight: 240, overflowY: "auto" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.06em", padding: "6px 10px" }}>Available Discounts</div>
          {available.map(d => (
            <button key={d.id} onClick={() => { onSelect(d); setOpen(false); }} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 12px", borderRadius: 10, border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "background 0.1s" }} onMouseEnter={e => e.currentTarget.style.background = C.bg} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{d.name}</div>
                <div style={{ fontSize: 10, color: C.textMut, marginTop: 1 }}>
                  {d.discountKind === "recurring" ? "Recurring" : "One-time"}
                  {d.lodgingTypes && d.lodgingTypes.length > 0 ? ` · ${d.lodgingTypes.join(", ")}` : ""}
                </div>
              </div>
              <span style={{ fontSize: 14, fontWeight: 800, color: C.suc, whiteSpace: "nowrap" }}>{d.type === "percentage" ? `${d.value}%` : `$${d.value}`}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export { DiscountPicker };
