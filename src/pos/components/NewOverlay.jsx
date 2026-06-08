import { C } from "../constants/colors";
import { fmtPhone } from "../lib/format";
import { useEffect, useMemo, useRef, useState } from "react";

function NewOverlay({ data, nav, onClose }) {
  const [q, setQ] = useState("");
  const inputRef = useRef(null);
  const [hlIdx, setHlIdx] = useState(0);

  useEffect(() => { if (inputRef.current) inputRef.current.focus(); }, []);

  // Escape to close
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return data.clients.slice(0, 6);
    const sDigits = s.replace(/\D/g, "");
    return data.clients.filter(c => {
      const name = `${c.fields.first_name || ""} ${c.fields.last_name || ""}`.toLowerCase();
      const phone = (c.fields.phone || "").replace(/\D/g, "");
      const email = (c.fields.email || "").toLowerCase();
      const dogNames = data.dogs.filter(d => d.clientId === c.id).map(d => (d.fields.name || "").toLowerCase()).join(" ");
      return name.includes(s) || email.includes(s) || dogNames.includes(s) || (sDigits.length >= 3 && phone.includes(sDigits));
    }).slice(0, 6);
  }, [q, data.clients, data.dogs]);

  // Reset highlight when results change
  useEffect(() => { setHlIdx(0); }, [results.length, q]);

  const selectClient = (c) => {
    onClose();
    nav("new-reservation", { clientId: c.id });
  };

  const createNew = () => {
    onClose();
    nav("unified-new", { prefill: q.trim() });
  };

  const handleKeyDown = (e) => {
    const totalItems = results.length + 1; // +1 for "create new" at index 0
    if (e.key === "ArrowDown") { e.preventDefault(); setHlIdx(i => (i + 1) % Math.max(totalItems, 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHlIdx(i => (i - 1 + Math.max(totalItems, 1)) % Math.max(totalItems, 1)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (hlIdx === 0) { createNew(); }
      else if (hlIdx - 1 < results.length) { selectClient(results[hlIdx - 1]); }
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2000, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "15vh" }}>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,20,40,0.55)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }} />
      {/* Panel */}
      <div style={{ position: "relative", width: "100%", maxWidth: 560, borderRadius: 20, background: C.surface, boxShadow: "0 32px 80px rgba(0,0,0,0.25), 0 0 0 1px rgba(20,83,45,0.08)", overflow: "hidden", animation: "k9overlay 0.2s ease-out" }}>
        {/* Search bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "20px 24px", borderBottom: `1.5px solid ${C.borderLight}` }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.pri} strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input ref={inputRef} className="no-focus-ring" value={q} onChange={e => setQ(e.target.value)} onKeyDown={handleKeyDown}
            placeholder="Search clients by name, phone, email, or dog…"
            style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 17, fontWeight: 500, color: C.text, fontFamily: "'Outfit', sans-serif", letterSpacing: "-0.01em" }} />
          <kbd onClick={onClose} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "2px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, background: C.bg, fontSize: 11, fontWeight: 700, color: C.textMut, fontFamily: "'Outfit', monospace", whiteSpace: "nowrap", cursor: "pointer" }}>Esc</kbd>
        </div>
        {/* Results */}
        <div style={{ maxHeight: 380, overflow: "auto", padding: "8px 0" }}>
          {/* Create new option — always first */}
          {(() => {
            const createIdx = 0;
            const active = hlIdx === createIdx;
            return (
              <button onClick={createNew} onMouseEnter={() => setHlIdx(createIdx)}
                style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", padding: "14px 24px", border: "none", borderBottom: results.length > 0 ? `1px solid ${C.borderLight}` : "none", background: active ? `${C.suc}12` : "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "background 0.1s" }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, border: `2.5px dashed ${active ? C.suc : C.pri}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: active ? C.suc : C.pri, transition: "all 0.15s" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: active ? C.suc : C.pri }}>Create New Client</div>
                  <div style={{ fontSize: 12, color: C.textMut }}>{q.trim() ? `Set up "${q.trim()}" with their dogs & first reservation` : "Set up a new client with their dogs & first reservation"}</div>
                </div>
                <kbd style={{ display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, background: C.bg, fontSize: 10, fontWeight: 700, color: C.textMut, fontFamily: "'Outfit', monospace" }}>↵</kbd>
              </button>
            );
          })()}
          {results.map((c, i) => {
            const dogs = data.dogs.filter(d => d.clientId === c.id);
            const adjIdx = i + 1;
            const active = hlIdx === adjIdx;
            return (
              <button key={c.id} onClick={() => selectClient(c)} onMouseEnter={() => setHlIdx(adjIdx)}
                style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", padding: "12px 24px", border: "none", background: active ? C.priLt : "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "background 0.1s" }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: `linear-gradient(135deg, ${C.pri}, ${C.priL})`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, color: "#fff", flexShrink: 0, letterSpacing: "-0.02em" }}>
                  {(c.fields.first_name || "?")[0]}{(c.fields.last_name || "?")[0]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: active ? C.pri : C.text }}>{c.fields.first_name} {c.fields.last_name}</div>
                  <div style={{ fontSize: 12, color: C.textSec, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {fmtPhone(c.fields.phone)}{c.fields.email ? ` · ${c.fields.email}` : ""}
                    {dogs.length > 0 && <span style={{ color: C.textMut }}> · {dogs.map(d => d.fields.name).join(", ")}</span>}
                  </div>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={active ? C.pri : C.textMut} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, opacity: 0.5 }}><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            );
          })}
          {q.trim() && results.length === 0 && (
            <div style={{ padding: "0 24px 16px", textAlign: "center" }}>
              <div style={{ fontSize: 12, color: C.textMut }}>No existing clients match "<span style={{ fontWeight: 600 }}>{q.trim()}</span>"</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export { NewOverlay };
