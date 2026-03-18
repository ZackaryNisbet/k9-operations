// K9 Operations — Location Picker Component
// Shows current location in sidebar. Dropdown for multi-location users.
// On switch: updates context (which triggers cache clears and refetches via hooks).

import React, { useState, useRef, useEffect } from "react";
import { C } from "../shared/theme";
import { useLocation } from "../contexts/LocationContext";

export default function LocationPicker({ collapsed }) {
  const { locationId, locationName, setLocation, availableLocations, isLoading } = useLocation();
  const [open, setOpen] = useState(false);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0 });
  const dropRef = useRef(null);
  const btnRef = useRef(null);
  const hasMultiple = availableLocations.length > 1;

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target) && btnRef.current && !btnRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setDropPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 200) });
    }
  }, [open]);

  if (isLoading) return null;

  const initial = locationName ? locationName.charAt(0).toUpperCase() : "?";

  if (collapsed) {
    return (
      <div style={{ padding: "0 4px", width: "100%" }}>
        <button
          ref={btnRef}
          onClick={() => hasMultiple && setOpen(!open)}
          title={locationName}
          style={{
            width: "100%", height: 40, display: "flex", alignItems: "center", justifyContent: "center",
            padding: 0, borderRadius: 10, border: "1.5px solid rgba(132,204,22,0.2)",
            background: "rgba(255,255,255,0.06)", cursor: hasMultiple ? "pointer" : "default",
            color: C.acc, fontSize: 11, fontWeight: 700, fontFamily: "inherit", boxSizing: "border-box",
          }}
        >
          {initial}
        </button>
        {open && hasMultiple && renderDropdown()}
      </div>
    );
  }

  return (
    <div style={{ padding: "0 4px", position: "relative", width: "100%" }}>
      <button
        ref={btnRef}
        onClick={() => hasMultiple && setOpen(!open)}
        style={{
          width: "100%", height: 40, display: "flex", alignItems: "center", gap: 8, padding: "0 10px",
          borderRadius: 10, border: "1.5px solid rgba(132,204,22,0.2)",
          background: "rgba(255,255,255,0.06)", cursor: hasMultiple ? "pointer" : "default",
          fontFamily: "inherit", transition: "all 0.15s", boxSizing: "border-box",
        }}
      >
        <div style={{
          width: 24, height: 24, borderRadius: 6, background: "rgba(255,255,255,0.1)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, fontWeight: 800, color: C.acc, flexShrink: 0,
        }}>
          {initial}
        </div>
        <div style={{ flex: 1, textAlign: "left", minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {locationName}
          </div>
          <div style={{ fontSize: 9, color: "rgba(132,204,22,0.6)", fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase" }}>
            Location
          </div>
        </div>
        {hasMultiple && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(132,204,22,0.5)" strokeWidth="2.5" strokeLinecap="round"
            style={{ transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "rotate(0deg)", flexShrink: 0 }}>
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        )}
      </button>
      {open && hasMultiple && renderDropdown()}
    </div>
  );

  function renderDropdown() {
    return (
      <div ref={dropRef} style={{
        position: "fixed", top: dropPos.top, left: dropPos.left, width: dropPos.width || 212,
        zIndex: 9999, background: "#0D3B1E", border: "1.5px solid rgba(132,204,22,0.25)",
        borderRadius: 12, boxShadow: "0 16px 48px rgba(0,0,0,0.4)", overflow: "hidden",
        display: "flex", flexDirection: "column",
      }}>
        <div style={{ padding: "6px 6px" }}>
          {availableLocations.map(loc => (
            <button
              key={loc.id}
              onClick={() => { setLocation(loc.id); setOpen(false); }}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 10px",
                borderRadius: 8, border: "none",
                background: locationId === loc.id ? "rgba(132,204,22,0.2)" : "transparent",
                cursor: "pointer", fontFamily: "inherit", transition: "background 0.1s", marginTop: 2,
              }}
              onMouseEnter={e => { if (locationId !== loc.id) e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
              onMouseLeave={e => { if (locationId !== loc.id) e.currentTarget.style.background = "transparent"; }}
            >
              <div style={{
                width: 26, height: 26, borderRadius: 6, background: "rgba(255,255,255,0.08)",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                </svg>
              </div>
              <div style={{ textAlign: "left", flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: locationId === loc.id ? "#fff" : "rgba(255,255,255,0.7)" }}>
                  {loc.name}
                </div>
              </div>
              {locationId === loc.id && (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.acc} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              )}
            </button>
          ))}
        </div>
      </div>
    );
  }
}
