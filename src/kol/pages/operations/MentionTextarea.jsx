// K9 Operations — EOD @mention helpers (extracted from EODPage)
// Self-contained leaf component + render helper.

import React, { useState, useEffect, useMemo, useRef } from "react";
import { C } from "../../../shared/theme";

// Render @mentions as blue clickable spans in read-only content
export function renderMentionContent(text, mentionEntities, nav) {
  if (!text) return null;
  const parts = [];
  const regex = /@(\w+(?:\s+\w+)*)/g;
  let lastIdx = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) parts.push(text.slice(lastIdx, match.index));
    const mentionName = match[1];
    const entity = (mentionEntities || []).find(e => {
      if (e.type === "dog") {
        const fullName = e.ownerLastName ? `${e.name} ${e.ownerLastName}` : e.name;
        return fullName === mentionName || e.name === mentionName;
      }
      return e.name === mentionName;
    });
    if (entity && entity.type === "dog") {
      parts.push(
        <span key={match.index} style={{ color: "#2563EB", fontWeight: 600, cursor: "pointer", textDecoration: "underline", textDecorationStyle: "dotted" }}
          onClick={() => nav && nav("dog-detail", { dogId: entity.id })}>@{mentionName}</span>
      );
    } else if (entity) {
      parts.push(<span key={match.index} style={{ color: "#2563EB", fontWeight: 600 }}>@{mentionName}</span>);
    } else {
      parts.push("@" + mentionName);
    }
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return parts;
}

// @ mention dog/owner suggest dropdown for EOD text sections
export function MentionTextarea({ value, onChange, onFocus, onBlur, placeholder, style, disabled, entities }) {
  const textareaRef = useRef(null);
  const dropdownRef = useRef(null);
  const [mention, setMention] = useState(null); // { startIdx, query }
  const [highlightIdx, setHighlightIdx] = useState(0);

  const filtered = useMemo(() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    return (entities || []).filter(d => {
      if (d.name.toLowerCase().includes(q)) return true;
      if (d.breed && d.breed.toLowerCase().includes(q)) return true;
      if (d.ownerName && d.ownerName.toLowerCase().includes(q)) return true;
      if (d.ownerLastName && d.ownerLastName.toLowerCase().includes(q)) return true;
      return false;
    });
  }, [mention, entities]);

  const filteredDogs = useMemo(() => filtered.filter(e => e.type === "dog").slice(0, 25), [filtered]);
  const filteredOwners = useMemo(() => filtered.filter(e => e.type === "owner").slice(0, 15), [filtered]);
  const allFiltered = useMemo(() => [...filteredDogs, ...filteredOwners], [filteredDogs, filteredOwners]);

  useEffect(() => { setHighlightIdx(0); }, [allFiltered.length, mention?.query]);

  const insertMention = (name) => {
    if (!mention || !textareaRef.current) return;
    const before = value.slice(0, mention.startIdx);
    const after = value.slice(textareaRef.current.selectionStart);
    // Keep the @ prefix so renderMentionContent can detect it
    const newValue = before + "@" + name + " " + after;
    onChange(newValue);
    setMention(null);
    const cursorPos = mention.startIdx + 1 + name.length + 1;
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(cursorPos, cursorPos);
      }
    });
  };

  const handleChange = (e) => {
    const val = e.target.value;
    const cursor = e.target.selectionStart;
    onChange(val);
    let atIdx = -1;
    for (let i = cursor - 1; i >= 0; i--) {
      if (val[i] === "@") { atIdx = i; break; }
      if (val[i] === " " || val[i] === "\n") break;
    }
    if (atIdx >= 0 && (atIdx === 0 || val[atIdx - 1] === " " || val[atIdx - 1] === "\n")) {
      setMention({ startIdx: atIdx, query: val.slice(atIdx + 1, cursor) });
    } else {
      setMention(null);
    }
  };

  const handleKeyDown = (e) => {
    if (!mention || allFiltered.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx(i => (i + 1) % allFiltered.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx(i => (i - 1 + allFiltered.length) % allFiltered.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      insertMention(allFiltered[highlightIdx].name);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setMention(null);
    }
  };

  const handleBlurWithDelay = (e) => {
    setTimeout(() => { setMention(null); if (onBlur) onBlur(e); }, 150);
  };

  // Build highlighted content for the overlay (shows @mentions in blue while editing)
  const highlightedParts = useMemo(() => {
    if (!value) return null;
    const parts = [];
    const mentionRegex = /@(\w+(?:\s+\w+)*)/g;
    let lastIdx = 0;
    let m;
    while ((m = mentionRegex.exec(value)) !== null) {
      if (m.index > lastIdx) parts.push(<span key={`t${m.index}`}>{value.slice(lastIdx, m.index)}</span>);
      const mentionName = m[1];
      const isKnown = (entities || []).some(e => {
        if (e.type === "dog") {
          const fullName = e.ownerLastName ? `${e.name} ${e.ownerLastName}` : e.name;
          return fullName === mentionName || e.name === mentionName;
        }
        return e.name === mentionName;
      });
      parts.push(<span key={`m${m.index}`} style={isKnown ? { color: "#2563EB", fontWeight: 600 } : {}}>{m[0]}</span>);
      lastIdx = m.index + m[0].length;
    }
    if (lastIdx < value.length) parts.push(<span key="end">{value.slice(lastIdx)}</span>);
    return parts;
  }, [value, entities]);

  const overlayRef = useRef(null);
  // Sync scroll between textarea and overlay
  const handleScroll = () => {
    if (overlayRef.current && textareaRef.current) {
      overlayRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  let globalIdx = 0;
  return (
    <div style={{ position: "relative" }}>
      {/* Styled overlay that shows @mentions in blue — sits behind transparent textarea */}
      <div ref={overlayRef} aria-hidden="true" style={{ ...style, position: "absolute", top: 0, left: 0, right: 0, bottom: 0, pointerEvents: "none", whiteSpace: "pre-wrap", wordBreak: "break-word", overflow: "hidden", color: style?.color || C.text, zIndex: 0 }}>
        {highlightedParts || ""}
      </div>
      <textarea
        ref={textareaRef} value={value} onChange={handleChange} onKeyDown={handleKeyDown}
        onFocus={onFocus} onBlur={handleBlurWithDelay} placeholder={placeholder}
        disabled={disabled} onScroll={handleScroll}
        style={{ ...style, color: "transparent", background: "transparent", position: "relative", zIndex: 1, caretColor: style?.color || C.text || "#111" }}
      />
      {mention && allFiltered.length > 0 && (
        <div ref={dropdownRef} style={{
          position: "absolute", left: 0, top: "100%", marginTop: 2, zIndex: 200,
          background: C.surface, border: `1.5px solid ${C.border}`, borderRadius: 10,
          boxShadow: "0 8px 24px rgba(0,0,0,0.12)", maxHeight: 260, overflowY: "auto",
          width: 280, padding: "4px 0",
        }}>
          {filteredDogs.length > 0 && <>
            <div style={{ padding: "4px 12px 4px", fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em" }}>Dogs</div>
            {filteredDogs.map((dog) => {
              const idx = globalIdx++;
              return (
                <div key={dog.id} onMouseDown={(e) => { e.preventDefault(); insertMention(dog.name); }}
                  onMouseEnter={() => setHighlightIdx(idx)}
                  style={{ padding: "6px 12px", cursor: "pointer", background: idx === highlightIdx ? C.priLt : "transparent", transition: "background 0.08s", display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 14, background: "#14532D", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                    {(dog.name || "?")[0]}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{dog.name}</span>
                      {dog.ownerLastName && <><span style={{ fontSize: 11, color: C.textMut }}>·</span><span style={{ fontSize: 12, color: C.textMut }}>{dog.ownerLastName}</span></>}
                    </div>
                    <div style={{ fontSize: 10, color: C.textMut, marginTop: 1 }}>
                      {dog.breed || "Unknown breed"}
                    </div>
                  </div>
                </div>
              );
            })}
          </>}
          {filteredOwners.length > 0 && <>
            <div style={{ padding: "4px 12px 4px", fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", ...(filteredDogs.length > 0 ? { marginTop: 4, borderTop: `1px solid ${C.borderLight || C.border}`, paddingTop: 8 } : {}) }}>Owners</div>
            {filteredOwners.map((owner) => {
              const idx = globalIdx++;
              return (
                <div key={owner.id} onMouseDown={(e) => { e.preventDefault(); insertMention(owner.name); }}
                  onMouseEnter={() => setHighlightIdx(idx)}
                  style={{ padding: "6px 12px", cursor: "pointer", background: idx === highlightIdx ? C.priLt : "transparent", transition: "background 0.08s", display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 14, background: "#2563EB", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                    {(owner.name || "??").split(" ").map(w => w[0]).join("").slice(0, 2)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{owner.name}</div>
                    <div style={{ fontSize: 10, color: C.textMut, marginTop: 1 }}>Owner</div>
                  </div>
                </div>
              );
            })}
          </>}
        </div>
      )}
    </div>
  );
}
