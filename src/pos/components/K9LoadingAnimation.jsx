

function K9LoadingAnimation({ size = 56 }) {
  const scale = size / 100;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "16px 0" }}>
      <style>{`
        @keyframes k9orbit { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes k9pulse { 0%, 100% { transform: scale(1); opacity: 0.8; } 50% { transform: scale(1.15); opacity: 1; } }
        @keyframes k9fade { 0%, 100% { opacity: 0.3; } 50% { opacity: 0.7; } }
        @keyframes k9fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
      <svg width={size} height={size} viewBox="0 0 100 100" style={{ overflow: "visible" }}>
        <defs>
          <linearGradient id="k9LoadGold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#C4A46A"/>
            <stop offset="100%" stopColor="#84CC16"/>
          </linearGradient>
        </defs>
        {/* Center hub with pulse */}
        <circle cx="50" cy="50" r="14" fill="url(#k9LoadGold)" style={{ animation: "k9pulse 2s ease-in-out infinite" }}/>
        <circle cx="50" cy="50" r="5" fill="#14532D" opacity="0.25"/>
        {/* Orbiting group */}
        <g style={{ transformOrigin: "50px 50px", animation: "k9orbit 3s linear infinite" }}>
          <line x1="50" y1="50" x2="28" y2="26" stroke="#84CC16" strokeWidth="1.5" opacity="0.3"/>
          <line x1="50" y1="50" x2="76" y2="34" stroke="#84CC16" strokeWidth="1.5" opacity="0.3"/>
          <line x1="50" y1="50" x2="52" y2="78" stroke="#84CC16" strokeWidth="1.5" opacity="0.3"/>
          <circle cx="28" cy="26" r="7" fill="#84CC16" opacity="0.5" style={{ animation: "k9fade 2s ease-in-out infinite" }}/>
          <circle cx="76" cy="34" r="7" fill="#84CC16" opacity="0.5" style={{ animation: "k9fade 2s ease-in-out 0.7s infinite" }}/>
          <circle cx="52" cy="78" r="7" fill="#84CC16" opacity="0.5" style={{ animation: "k9fade 2s ease-in-out 1.4s infinite" }}/>
        </g>
      </svg>
      <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 500, fontFamily: "'Outfit', -apple-system, sans-serif", letterSpacing: "0.03em" }}>Analyzing your data...</span>
    </div>
  );
}

export { K9LoadingAnimation };
