import React from "react";
import { C } from "../../../shared/theme";
import { I } from "../../../shared/icons";
import { getWorkflowNavTarget } from "./workflowRoutes";

export function HomeHeader({ greeting, subtitle, rightSlot }) {
  return (
    <div style={{ marginBottom: 28, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
      <div style={{ minWidth: 0 }}>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 800,
            color: C.text,
            margin: 0,
            letterSpacing: "-0.03em",
            lineHeight: 1.2,
          }}
        >
          {greeting}
        </h1>
        {subtitle ? (
          <p style={{ fontSize: 14, color: C.textMut, marginTop: 6, fontWeight: 500 }}>
            {subtitle}
          </p>
        ) : null}
      </div>
      {rightSlot ? <div style={{ flexShrink: 0 }}>{rightSlot}</div> : null}
    </div>
  );
}

export function QuickCard({ label, desc, icon, onClick, accent, badge }) {
  const IconComp = I[icon];
  return (
    <div
      onClick={onClick}
      style={{
        padding: "20px 22px",
        borderRadius: 14,
        cursor: "pointer",
        background: C.surface,
        border: `1.5px solid ${C.border}`,
        transition: "all 0.2s",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        minHeight: 110,
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.borderColor = `${accent || C.pri}50`;
        event.currentTarget.style.boxShadow = "0 6px 20px rgba(0,0,0,0.06)";
        event.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.borderColor = C.border;
        event.currentTarget.style.boxShadow = "none";
        event.currentTarget.style.transform = "none";
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: `${accent || C.pri}12`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {IconComp ? <IconComp style={{ width: 18, height: 18, color: accent || C.pri }} /> : null}
        </div>
        {badge ? (
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: "3px 10px",
              borderRadius: 20,
              background: badge.bg || C.warnLt,
              color: badge.color || C.warn,
            }}
          >
            {badge.label}
          </span>
        ) : null}
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{label}</div>
        {desc ? <div style={{ fontSize: 12, color: C.textSec, marginTop: 2 }}>{desc}</div> : null}
      </div>
    </div>
  );
}

export function MetricCard({ label, value, subtext, color, live }) {
  return (
    <div
      style={{
        padding: "16px 20px",
        borderRadius: 12,
        background: C.surface,
        border: `1.5px solid ${C.border}`,
        position: "relative",
      }}
    >
      {live ? (
        <span style={{ position: "absolute", top: 14, right: 14, width: 8, height: 8, borderRadius: "50%", background: C.suc }} />
      ) : null}
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: C.textMut,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: color || C.text, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      {subtext ? <div style={{ fontSize: 11, color: C.textSec, marginTop: 2 }}>{subtext}</div> : null}
    </div>
  );
}

export function WorkflowProgressPanel({ rows, nav }) {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  return (
    <div
      style={{
        padding: "18px 22px",
        borderRadius: 14,
        background: C.surface,
        border: `1.5px solid ${C.border}`,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 14 }}>Workflow Progress</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {rows.map((row) => {
          const pct = row.total > 0 ? Math.round((row.completed / row.total) * 100) : 0;
          const isComplete = row.total > 0 && row.completed >= row.total;
          const navTarget = getWorkflowNavTarget(row.id, row.title);
          return (
            <button
              key={row.id}
              type="button"
              disabled={!navTarget}
              onClick={() => {
                if (!navTarget) return;
                nav(navTarget.page, navTarget.params || {});
              }}
              style={{
                cursor: navTarget ? "pointer" : "default",
                display: "flex",
                alignItems: "center",
                gap: 12,
                background: "none",
                border: "none",
                padding: 0,
                fontFamily: "inherit",
                textAlign: "left",
                opacity: navTarget ? 1 : 0.7,
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{row.title}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: isComplete ? C.suc : C.textMut }}>
                    {row.completed}/{row.total}
                  </span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: C.borderLight, overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${pct}%`,
                      height: "100%",
                      borderRadius: 3,
                      background: isComplete ? C.suc : `linear-gradient(90deg, ${C.pri}, ${C.acc})`,
                      transition: "width 0.3s",
                    }}
                  />
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
