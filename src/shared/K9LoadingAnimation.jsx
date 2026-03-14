// K9 Operations — Loading Animation

import React from "react";
import { C } from "./theme";

function K9LoadingAnimation({ size = 56, message = "Loading...", subMessage }) {
  const scale = size / 100;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "16px 0" }}>
      <style>{`
        @keyframes k9orbit { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes k9pulse { 0%, 100% { transform: scale(1); opacity: 0.8; } 50% { transform: scale(1.15); opacity: 1; } }
        @keyframes k9fade { 0%, 100% { opacity: 0.3; } 50% { opacity: 0.7; } }
      `}</style>
      <svg width={size} height={size} viewBox="0 0 100 100" style={{ overflow: "visible" }}>
        <defs>
          <linearGradient id="k9LoadGold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#C4A46A"/>
            <stop offset="100%" stopColor="#AF8D54"/>
          </linearGradient>
        </defs>
        {/* Head hub */}
        <circle cx="50" cy="46" r="14" fill="url(#k9LoadGold)" style={{ animation: "k9pulse 2s ease-in-out infinite" }}/>
        <circle cx="50" cy="46" r="5" fill="#003462" opacity="0.18"/>
        {/* Orbiting ears + collar tag */}
        <g style={{ transformOrigin: "50px 46px", animation: "k9orbit 3s linear infinite" }}>
          <line x1="50" y1="46" x2="26" y2="22" stroke="#AF8D54" strokeWidth="1.5" opacity="0.3"/>
          <line x1="50" y1="46" x2="74" y2="22" stroke="#AF8D54" strokeWidth="1.5" opacity="0.3"/>
          <line x1="50" y1="46" x2="50" y2="74" stroke="#AF8D54" strokeWidth="1.5" opacity="0.3"/>
          {/* Left ear — angled ellipse */}
          <ellipse cx="26" cy="22" rx="6" ry="8.5" fill="#AF8D54" opacity="0.5" transform="rotate(-20 26 22)" style={{ animation: "k9fade 2s ease-in-out infinite" }}/>
          {/* Right ear — angled ellipse */}
          <ellipse cx="74" cy="22" rx="6" ry="8.5" fill="#AF8D54" opacity="0.5" transform="rotate(20 74 22)" style={{ animation: "k9fade 2s ease-in-out 0.7s infinite" }}/>
          {/* Collar tag */}
          <circle cx="50" cy="74" r="6" fill="#AF8D54" opacity="0.45" style={{ animation: "k9fade 2s ease-in-out 1.4s infinite" }}/>
        </g>
      </svg>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: C.textSec, fontFamily: "'GT Eesti', -apple-system, sans-serif" }}>{message}</div>
        {subMessage && <div style={{ fontSize: 12, color: C.textMut, marginTop: 4, fontFamily: "'GT Eesti', -apple-system, sans-serif" }}>{subMessage}</div>}
      </div>
    </div>
  );
}

export default K9LoadingAnimation;
