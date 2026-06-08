import { C } from "../constants/colors";
import { DEF_EOD_TEMPLATE } from "../constants/operations";
import { I } from "../icons";
import { useEffect, useMemo, useRef, useState } from "react";

function EODSearchOverlay({ data, onClose, onSelectDate }) {
  const [q, setQ] = useState("");
  const inputRef = useRef(null);
  const [hlIdx, setHlIdx] = useState(0);

  useEffect(() => { if (inputRef.current) inputRef.current.focus(); }, []);
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const template = data.eodTemplate || DEF_EOD_TEMPLATE;

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    const entries = data.eodEntries || [];
    const matches = [];
    entries.forEach(entry => {
      (entry.sections || []).forEach(sec => {
        if (!sec.content) return;
        const lower = sec.content.toLowerCase();
        let searchFrom = 0;
        while (searchFrom < lower.length) {
          const idx = lower.indexOf(s, searchFrom);
          if (idx === -1) break;
          // Extract contextual snippet — find surrounding sentence boundaries
          const snippetStart = Math.max(0, sec.content.lastIndexOf("\n", idx - 1) + 1);
          const nextNewline = sec.content.indexOf("\n", idx + s.length);
          const snippetEnd = nextNewline === -1 ? sec.content.length : nextNewline;
          const snippet = sec.content.slice(snippetStart, snippetEnd).trim();
          // Highlight match within snippet
          const matchStart = idx - snippetStart;
          const before = snippet.slice(0, matchStart);
          const match = snippet.slice(matchStart, matchStart + s.length);
          const after = snippet.slice(matchStart + s.length);
          const sectionDef = template.find(t => t.id === sec.id);
          matches.push({
            date: entry.date,
            sectionId: sec.id,
            sectionTitle: sectionDef ? `${sectionDef.emoji} ${sectionDef.title || sectionDef.label}` : sec.id,
            snippet, before, match, after,
          });
          searchFrom = idx + s.length;
        }
      });
    });
    // Sort newest first, limit results
    matches.sort((a, b) => b.date.localeCompare(a.date));
    return matches.slice(0, 30);
  }, [q, data.eodEntries, template]);

  useEffect(() => { setHlIdx(0); }, [results.length, q]);

  const select = (r) => { onClose(); onSelectDate(r.date); };

  const handleKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setHlIdx(i => Math.min(i + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHlIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" && results.length > 0) { e.preventDefault(); select(results[hlIdx]); }
  };

  const fmtFullDate = (d) => { if (!d) return ""; return new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }); };

  // Group results by date
  const grouped = useMemo(() => {
    const map = new Map();
    results.forEach((r, i) => {
      if (!map.has(r.date)) map.set(r.date, []);
      map.get(r.date).push({ ...r, globalIdx: i });
    });
    return [...map.entries()];
  }, [results]);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2000, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "12vh" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,20,40,0.55)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }} />
      <div style={{ position: "relative", width: "100%", maxWidth: 620, borderRadius: 20, background: C.surface, boxShadow: "0 32px 80px rgba(0,0,0,0.25), 0 0 0 1px rgba(20,83,45,0.08)", overflow: "hidden", animation: "k9overlay 0.2s ease-out" }}>
        {/* Search bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "20px 24px", borderBottom: `1.5px solid ${C.borderLight}` }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={C.pri} strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} onKeyDown={handleKeyDown}
            placeholder="Search all EOD reports…"
            style={{ flex: 1, border: "none", outline: "none", background: "transparent", fontSize: 17, fontWeight: 500, color: C.text, fontFamily: "'Outfit', sans-serif", letterSpacing: "-0.01em" }} />
          <kbd style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "2px 8px", borderRadius: 6, border: `1.5px solid ${C.border}`, background: C.bg, fontSize: 11, fontWeight: 700, color: C.textMut, fontFamily: "'Outfit', monospace", whiteSpace: "nowrap" }}>Esc</kbd>
        </div>
        {/* Results */}
        <div style={{ maxHeight: 440, overflow: "auto", padding: "8px 0" }}>
          {!q.trim() && (
            <div style={{ padding: "32px 24px", textAlign: "center", color: C.textMut, fontSize: 14 }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>🔍</div>
              Search across all EOD reports by keyword, dog name, client name, notes, or anything else
            </div>
          )}
          {q.trim() && results.length === 0 && (
            <div style={{ padding: "32px 24px", textAlign: "center" }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
              <div style={{ fontSize: 14, color: C.textMut }}>No results for "<span style={{ fontWeight: 700, color: C.text }}>{q.trim()}</span>" in any EOD report</div>
            </div>
          )}
          {grouped.map(([date, items]) => (
            <div key={date}>
              <div style={{ padding: "10px 24px 4px", fontSize: 12, fontWeight: 700, color: C.pri, textTransform: "uppercase", letterSpacing: "0.04em" }}>{fmtFullDate(date)}</div>
              {items.map((r) => {
                const active = hlIdx === r.globalIdx;
                return (
                  <button key={r.globalIdx} onClick={() => select(r)} onMouseEnter={() => setHlIdx(r.globalIdx)}
                    style={{ display: "flex", alignItems: "flex-start", gap: 14, width: "100%", padding: "10px 24px", border: "none", background: active ? C.priLt : "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "background 0.1s" }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: active ? `${C.pri}18` : C.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 16 }}>
                      <I.Clipboard />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: C.textSec, marginBottom: 3 }}>{r.sectionTitle}</div>
                      <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                        <span>{r.before}</span>
                        <span style={{ background: `${C.acc}30`, color: C.text, fontWeight: 700, borderRadius: 3, padding: "0 2px" }}>{r.match}</span>
                        <span>{r.after}</span>
                      </div>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={active ? C.pri : C.textMut} strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, opacity: 0.5, marginTop: 10 }}><polyline points="9 18 15 12 9 6"/></svg>
                  </button>
                );
              })}
            </div>
          ))}
          {q.trim() && results.length > 0 && (
            <div style={{ padding: "8px 24px 12px", textAlign: "center", fontSize: 11, color: C.textMut, borderTop: `1px solid ${C.borderLight}`, marginTop: 4 }}>
              {results.length >= 30 ? "Showing first 30 results" : `${results.length} result${results.length !== 1 ? "s" : ""} found`} · ↑↓ navigate · Enter to open
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export { EODSearchOverlay };
