import { C } from "../constants/colors";
import { I } from "../icons";
import { K9_LOCATIONS } from "../constants/locations";
import { useEffect, useRef, useState } from "react";

function LocationSelector({ currentLocation, onLocationChange, collapsed, allLocations, profile }) {
  const [open, setOpen] = useState(false);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0 });
  const dropRef = useRef(null);
  const btnRef = useRef(null);
  const locs = allLocations || K9_LOCATIONS;

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

  const current = locs.find(l => l.id === currentLocation) || locs[1] || locs[0];
  const isEnterprise = current?.isEnterprise;
  const locations = locs.filter(l => !l.isEnterprise && !l.isLite);
  const liteLocations = locs.filter(l => l.isLite);

  if (collapsed) {
    return (
      <div style={{ padding: "0 4px", width: "100%" }}>
        <button onClick={() => setOpen(!open)} title={current.name}
          style={{ width: "100%", height: 40, display: "flex", alignItems: "center", justifyContent: "center", padding: "0", borderRadius: 10, border: "1.5px solid rgba(132,204,22,0.2)", background: isEnterprise ? "rgba(132,204,22,0.15)" : "rgba(255,255,255,0.06)", cursor: "pointer", color: C.acc, fontSize: 11, fontWeight: 700, fontFamily: "inherit", boxSizing: "border-box" }}>
          {isEnterprise ? "\u2605" : current.name.slice(0, 2).toUpperCase()}
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: "0 4px", position: "relative", width: "100%" }}>
      <button ref={btnRef} onClick={() => setOpen(!open)}
        style={{ width: "100%", height: 40, display: "flex", alignItems: "center", gap: 8, padding: "0 10px", borderRadius: 10, border: "1.5px solid rgba(132,204,22,0.2)", background: isEnterprise ? "rgba(132,204,22,0.12)" : "rgba(255,255,255,0.06)", cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s", boxSizing: "border-box" }}>
        <div style={{ width: 24, height: 24, borderRadius: 6, background: isEnterprise ? "rgba(132,204,22,0.25)" : "rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: C.acc, flexShrink: 0 }}>
          {isEnterprise ? "\u2605" : current.name.slice(0, 1)}
        </div>
        <div style={{ flex: 1, textAlign: "left", minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{current.name}</div>
          <div style={{ fontSize: 9, color: "rgba(132,204,22,0.6)", fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase" }}>{isEnterprise ? "All Locations" : "Location"}</div>
        </div>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(132,204,22,0.5)" strokeWidth="2.5" strokeLinecap="round"
          style={{ transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "rotate(0deg)", flexShrink: 0 }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div ref={dropRef} style={{ position: "fixed", top: dropPos.top, left: dropPos.left, width: dropPos.width || 212, zIndex: 9999, background: "#1a2940", border: "1.5px solid rgba(132,204,22,0.25)", borderRadius: 12, boxShadow: "0 16px 48px rgba(0,0,0,0.4)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "6px 6px" }}>
            {/* Enterprise — only for owner/enterprise_admin */}
            {profile?.role && (profile.role === 'owner' || profile.role === 'enterprise_admin') && (<>
            <button onClick={() => { onLocationChange("enterprise"); setOpen(false); }}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 10px", borderRadius: 8, border: "none", background: currentLocation === "enterprise" ? "rgba(132,204,22,0.2)" : "transparent", cursor: "pointer", fontFamily: "inherit", transition: "background 0.1s", marginBottom: 2 }}
              onMouseEnter={e => { if (currentLocation !== "enterprise") e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
              onMouseLeave={e => { if (currentLocation !== "enterprise") e.currentTarget.style.background = "transparent"; }}>
              <div style={{ width: 26, height: 26, borderRadius: 6, background: "rgba(132,204,22,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: C.acc }}>{"\u2605"}</span>
              </div>
              <div style={{ textAlign: "left", flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.acc }}>Enterprise</div>
                <div style={{ fontSize: 9, color: "rgba(132,204,22,0.5)", textTransform: "uppercase" }}>All Locations</div>
              </div>
              {currentLocation === "enterprise" && <span style={{ color: C.acc }}><I.Check/></span>}
            </button>

            <div style={{ margin: "4px 10px", height: 1, background: "rgba(132,204,22,0.12)" }}/>
            </>)}

            {/* Location list */}
            {locations.map(loc => (
              <button key={loc.id} onClick={() => { onLocationChange(loc.id); setOpen(false); }}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 10px", borderRadius: 8, border: "none", background: currentLocation === loc.id ? "rgba(132,204,22,0.2)" : "transparent", cursor: "pointer", fontFamily: "inherit", transition: "background 0.1s", marginTop: 2 }}
                onMouseEnter={e => { if (currentLocation !== loc.id) e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                onMouseLeave={e => { if (currentLocation !== loc.id) e.currentTarget.style.background = "transparent"; }}>
                <div style={{ width: 26, height: 26, borderRadius: 6, background: "rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                </div>
                <div style={{ textAlign: "left", flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: currentLocation === loc.id ? "#fff" : "rgba(255,255,255,0.7)" }}>{loc.name}</div>
                </div>
                {currentLocation === loc.id && <span style={{ color: C.acc }}><I.Check/></span>}
              </button>
            ))}

            {/* Lite App link */}
            {liteLocations.length > 0 && (<>
              <div style={{ margin: "4px 10px", height: 1, background: "rgba(132,204,22,0.12)" }}/>
              {liteLocations.map(loc => (
                <button key={loc.id} onClick={() => { onLocationChange(loc.id); setOpen(false); }}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 10px", borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", fontFamily: "inherit", transition: "background 0.1s", marginTop: 2 }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <div style={{ width: 26, height: 26, borderRadius: 6, background: "rgba(100,180,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="rgba(100,180,255,0.7)" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                  </div>
                  <div style={{ textAlign: "left", flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(100,180,255,0.9)" }}>{loc.name}</div>
                    <div style={{ fontSize: 9, color: "rgba(100,180,255,0.4)", textTransform: "uppercase" }}>Switch App</div>
                  </div>
                </button>
              ))}
            </>)}
          </div>
        </div>
      )}
    </div>
  );
}

export { LocationSelector };
