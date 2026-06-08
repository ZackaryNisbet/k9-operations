// K9 Operations — Training Module: leaf component extracted verbatim from TrainingPage.jsx (no behavior change).

import { C } from "../../../../shared/theme";

export function CompactLaborTabSwitcher({ options = [], value, onChange }) {
  const visibleOptions = options.filter(Boolean);
  const activeIndex = Math.max(0, visibleOptions.findIndex((option) => option.id === value));
  if (!visibleOptions.length) return null;
  return (
    <div
      style={{
        position: "relative",
        display: "grid",
        gridTemplateColumns: `repeat(${visibleOptions.length}, minmax(0, 1fr))`,
        gap: 0,
        minHeight: 50,
        padding: 4,
        marginBottom: 18,
        borderRadius: 14,
        border: `1px solid ${C.border}`,
        background: "linear-gradient(180deg, #fff 0%, #f8fafc 100%)",
        boxShadow: "0 8px 24px rgba(15, 23, 42, 0.05)",
        overflow: "hidden",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 4,
          bottom: 4,
          left: 4,
          width: `calc((100% - 8px) / ${visibleOptions.length})`,
          borderRadius: 10,
          background: "linear-gradient(135deg, rgba(220,252,231,0.78), rgba(240,253,244,0.68))",
          border: "1px solid rgba(22,101,52,0.28)",
          boxShadow: "0 6px 18px rgba(22,101,52,0.08)",
          transform: `translateX(${activeIndex * 100}%)`,
          transition: "transform 180ms ease",
        }}
      />
      {visibleOptions.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            style={{
              position: "relative",
              zIndex: 1,
              minHeight: 42,
              border: "none",
              borderRadius: 10,
              background: "transparent",
              color: active ? C.pri : C.text,
              fontFamily: "inherit",
              fontSize: 13,
              fontWeight: active ? 950 : 850,
              lineHeight: 1.15,
              textAlign: "center",
              cursor: "pointer",
              padding: "8px 10px",
              transition: "color 160ms ease",
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
