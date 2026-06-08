import { C } from "../constants/colors";
import { useEffect, useMemo, useRef, useState } from "react";

function BreedSearch({ value, onChange, breeds, autoFocus }) {
  const [q, setQ] = useState(value || "");
  const [open, setOpen] = useState(false);
  const [hlIdx, setHlIdx] = useState(0);
  const ref = useRef(null);
  const inputRef = useRef(null);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return breeds.slice(0, 20);
    return breeds.filter(b => b.toLowerCase().includes(s)).slice(0, 20);
  }, [q, breeds]);

  useEffect(() => { setHlIdx(0); }, [q]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const select = (b) => { setQ(b); onChange(b); setOpen(false); };

  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setHlIdx(i => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHlIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" && open && filtered.length > 0) { e.preventDefault(); select(filtered[hlIdx]); }
    else if (e.key === "Escape") { setOpen(false); }
  };

  const ls = { display: "block", fontSize: 11, fontWeight: 600, color: C.textSec, marginBottom: 4, letterSpacing: "0.03em", textTransform: "uppercase" };
  const is = { width: "100%", padding: "10px 14px", border: `1.5px solid ${open ? C.pri : C.border}`, borderRadius: 10, fontSize: 14, fontFamily: "inherit", color: C.text, background: C.surface, outline: "none", transition: "border 0.15s", boxSizing: "border-box" };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <span style={ls}>Breed <span style={{ color: C.dan }}>*</span></span>
      <input ref={inputRef} autoFocus={autoFocus} value={q} onChange={e => { setQ(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)} onKeyDown={handleKeyDown} placeholder="Search breeds…" style={is} />
      {open && filtered.length > 0 && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: 12, boxShadow: "0 12px 40px rgba(0,0,0,0.12)", zIndex: 50, maxHeight: 220, overflow: "auto" }}>
          {filtered.map((b, i) => (
            <button key={b} onClick={() => select(b)} onMouseEnter={() => setHlIdx(i)}
              style={{ display: "block", width: "100%", padding: "8px 14px", border: "none", background: hlIdx === i ? C.priLt : "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left", fontSize: 13, fontWeight: b === "Unknown / Not Sure" || b === "Mixed Breed" ? 700 : 500, color: hlIdx === i ? C.pri : C.text, transition: "background 0.1s" }}>
              {b === "Unknown / Not Sure" && <span style={{ color: C.textMut, fontSize: 11 }}>⚡ </span>}{b}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export { BreedSearch };
