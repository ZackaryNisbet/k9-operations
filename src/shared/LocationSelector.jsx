// K9 Operations — Location Selector

import React, { useState, useRef, useEffect } from "react";
import { C, K9_LOCATIONS } from "./theme";
import { I } from "./icons";

function LocationSelector({ currentLocation, onLocationChange, collapsed, allLocations, profile, theme = "dark" }) {
  const [open, setOpen] = useState(false);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0 });
  const dropRef = useRef(null);
  const btnRef = useRef(null);
  const locs = allLocations || K9_LOCATIONS;

  // Theme palette. Default "dark" preserves the original dark-sidebar treatment for
  // every existing caller; KolApp passes theme="light" for the new light rail.
  const light = theme === "light";
  const P = {
    btnBg: light ? "oklch(0.935 0.016 152)" : "rgba(255,255,255,0.06)",
    btnBgEnt: light ? "oklch(0.915 0.05 151)" : "rgba(132,204,22,0.12)",
    btnBgEntCollapsed: light ? "oklch(0.915 0.05 151)" : "rgba(132,204,22,0.15)",
    btnBorder: light ? "oklch(0.88 0.02 152)" : "rgba(132,204,22,0.2)",
    badgeBg: light ? "oklch(0.9 0.03 151)" : "rgba(255,255,255,0.1)",
    badgeBgEnt: light ? "oklch(0.88 0.06 150)" : "rgba(132,204,22,0.25)",
    badgeText: light ? "oklch(0.37 0.085 156)" : C.acc,
    name: light ? "oklch(0.30 0.02 200)" : "#fff",
    sub: light ? "oklch(0.55 0.022 196)" : "rgba(132,204,22,0.6)",
    chevron: light ? "oklch(0.58 0.02 196)" : "rgba(132,204,22,0.5)",
    menuBg: light ? "oklch(0.99 0.005 152)" : "#0D3B1E",
    menuBorder: light ? "oklch(0.9 0.018 152)" : "rgba(132,204,22,0.25)",
    menuShadow: light ? "0 12px 40px rgba(20,40,30,0.18)" : "0 16px 48px rgba(0,0,0,0.4)",
    divider: light ? "oklch(0.92 0.014 152)" : "rgba(132,204,22,0.12)",
    rowHover: light ? "oklch(0.94 0.016 152)" : "rgba(255,255,255,0.05)",
    rowActiveBg: light ? "oklch(0.915 0.05 151)" : "rgba(132,204,22,0.2)",
    iconBg: light ? "oklch(0.92 0.014 152)" : "rgba(255,255,255,0.08)",
    iconStroke: light ? "oklch(0.5 0.02 196)" : "rgba(255,255,255,0.5)",
    accentBg: light ? "oklch(0.9 0.05 151)" : "rgba(132,204,22,0.2)",
    accentText: light ? "oklch(0.37 0.085 156)" : C.acc,
    accentSub: light ? "oklch(0.55 0.022 196)" : "rgba(132,204,22,0.5)",
    name70: light ? "oklch(0.46 0.026 196)" : "rgba(255,255,255,0.7)",
    nameActive: light ? "oklch(0.30 0.02 200)" : "#fff",
    check: light ? "oklch(0.37 0.085 156)" : C.acc,
    demoLabel: light ? "oklch(0.6 0.018 196)" : "rgba(255,255,255,0.3)",
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (dropRef.current && !dropRef.current.contains(e.target) && btnRef.current && !btnRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setDropPos({ top: r.bottom + 4, left: r.left, width: r.width });
    }
  }, [open]);

  const primaryLocations = locs.filter(l => !l.isEnterprise && !l.isPOS && !l.isDemoLink);
  const current = locs.find(l => l.id === currentLocation) || primaryLocations[0] || locs[0];
  const isEnterprise = current?.isEnterprise;
  const hasLocations = locs.length > 0 && !!current;
  const currentName = current?.name || "Loading location...";
  const locations = primaryLocations;
  const posLocations = locs.filter(l => l.isPOS);
  const demoLinks = locs.filter(l => l.isDemoLink);

  if (collapsed) {
    return (
      <div style={{ padding: "0 4px", width: "100%" }}>
        <button onClick={() => hasLocations && setOpen(!open)} title={currentName} disabled={!hasLocations}
          style={{ width: "100%", height: 40, display: "flex", alignItems: "center", justifyContent: "center", padding: "0", borderRadius: 10, border: `1.5px solid ${P.btnBorder}`, background: isEnterprise ? P.btnBgEntCollapsed : P.btnBg, cursor: hasLocations ? "pointer" : "default", color: P.badgeText, fontSize: 11, fontWeight: 700, fontFamily: "inherit", boxSizing: "border-box", opacity: hasLocations ? 1 : 0.7 }}>
          {isEnterprise ? "★" : currentName.slice(0, 2).toUpperCase()}
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: "0 4px", position: "relative", width: "100%" }}>
      <button ref={btnRef} onClick={() => hasLocations && setOpen(!open)} disabled={!hasLocations}
        style={{ width: "100%", height: 40, display: "flex", alignItems: "center", gap: 8, padding: "0 10px", borderRadius: 10, border: `1.5px solid ${P.btnBorder}`, background: isEnterprise ? P.btnBgEnt : P.btnBg, cursor: hasLocations ? "pointer" : "default", fontFamily: "inherit", transition: "all 0.15s", boxSizing: "border-box", opacity: hasLocations ? 1 : 0.7 }}>
        <div style={{ width: 24, height: 24, borderRadius: 6, background: isEnterprise ? P.badgeBgEnt : P.badgeBg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: P.badgeText, flexShrink: 0 }}>
          {isEnterprise ? "★" : currentName.slice(0, 1)}
        </div>
        <div style={{ flex: 1, textAlign: "left", minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: P.name, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{currentName}</div>
          <div style={{ fontSize: 9, color: P.sub, fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase" }}>{isEnterprise ? "All Locations" : "Location"}</div>
        </div>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={P.chevron} strokeWidth="2.5" strokeLinecap="round"
          style={{ transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "rotate(0deg)", flexShrink: 0 }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div ref={dropRef} style={{ position: "fixed", top: dropPos.top, left: dropPos.left, width: dropPos.width || 212, zIndex: 9999, background: P.menuBg, border: `1.5px solid ${P.menuBorder}`, borderRadius: 12, boxShadow: P.menuShadow, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "6px 6px" }}>
            {/* Enterprise directory/org chart are universal authenticated surfaces. */}
            {profile?.role && (<>
            <button onClick={() => { onLocationChange("enterprise"); setOpen(false); }}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 10px", borderRadius: 8, border: "none", background: currentLocation === "enterprise" ? P.rowActiveBg : "transparent", cursor: "pointer", fontFamily: "inherit", transition: "background 0.1s", marginBottom: 2 }}
              onMouseEnter={e => { if (currentLocation !== "enterprise") e.currentTarget.style.background = P.rowHover; }}
              onMouseLeave={e => { if (currentLocation !== "enterprise") e.currentTarget.style.background = "transparent"; }}>
              <div style={{ width: 26, height: 26, borderRadius: 6, background: P.accentBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: P.accentText }}>{"★"}</span>
              </div>
              <div style={{ textAlign: "left", flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: P.accentText }}>Enterprise</div>
                <div style={{ fontSize: 9, color: P.accentSub, textTransform: "uppercase" }}>All Locations</div>
              </div>
              {currentLocation === "enterprise" && <span style={{ color: P.check }}><I.Check/></span>}
            </button>

            <div style={{ margin: "4px 10px", height: 1, background: P.divider }}/>
            </>)}

            {/* Location list */}
            {locations.map(loc => (
              <button key={loc.id} onClick={() => { onLocationChange(loc.id); setOpen(false); }}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 10px", borderRadius: 8, border: "none", background: currentLocation === loc.id ? P.rowActiveBg : "transparent", cursor: "pointer", fontFamily: "inherit", transition: "background 0.1s", marginTop: 2 }}
                onMouseEnter={e => { if (currentLocation !== loc.id) e.currentTarget.style.background = P.rowHover; }}
                onMouseLeave={e => { if (currentLocation !== loc.id) e.currentTarget.style.background = "transparent"; }}>
                <div style={{ width: 26, height: 26, borderRadius: 6, background: P.iconBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={P.iconStroke} strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                </div>
                <div style={{ textAlign: "left", flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: currentLocation === loc.id ? P.nameActive : P.name70 }}>{loc.name}</div>
                </div>
                {currentLocation === loc.id && <span style={{ color: P.check }}><I.Check/></span>}
              </button>
            ))}

            {/* POS locations */}
            {posLocations.length > 0 && <>
              <div style={{ margin: "4px 10px", height: 1, background: P.divider }}/>
              {posLocations.map(loc => (
                <button key={loc.id} onClick={() => { onLocationChange(loc.id); setOpen(false); }}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 10px", borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", transition: "background 0.1s", marginTop: 2 }}
                  onMouseEnter={e => { e.currentTarget.style.background = P.rowHover; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
                  <div style={{ width: 26, height: 26, borderRadius: 6, background: "rgba(37,99,235,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={light ? "#2563EB" : "rgba(100,180,255,0.8)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                  </div>
                  <div style={{ textAlign: "left", flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: light ? "#1D4ED8" : "rgba(100,180,255,0.9)" }}>{loc.name}</div>
                    <div style={{ fontSize: 9, color: light ? "#60759E" : "rgba(100,180,255,0.5)", textTransform: "uppercase" }}>Full POS App</div>
                  </div>
                </button>
              ))}
            </>}

            {/* Demo launch links — opens in new tab */}
            {demoLinks.length > 0 && <>
              <div style={{ margin: "4px 10px", height: 1, background: P.divider }}/>
              <div style={{ padding: "4px 10px 2px", fontSize: 8, fontWeight: 700, color: P.demoLabel, textTransform: "uppercase", letterSpacing: "0.1em" }}>Demo Versions</div>
              {demoLinks.map(loc => (
                <button key={loc.id} onClick={() => { onLocationChange(loc.id); setOpen(false); }}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 10px", borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", transition: "background 0.1s", marginTop: 2 }}
                  onMouseEnter={e => { e.currentTarget.style.background = P.rowHover; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}>
                  <div style={{ width: 26, height: 26, borderRadius: 6, background: "rgba(168,85,247,0.13)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={light ? "#9333EA" : "rgba(168,85,247,0.8)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                  </div>
                  <div style={{ textAlign: "left", flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: light ? "#7E22CE" : "rgba(168,85,247,0.9)" }}>{loc.name}</div>
                    <div style={{ fontSize: 9, color: light ? "#8B6FB0" : "rgba(168,85,247,0.5)", textTransform: "uppercase" }}>Opens in New Tab</div>
                  </div>
                </button>
              ))}
            </>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helper Functions ──────────────────────────────────────────────────────

export default LocationSelector;
