import React from "react";
import { C } from "../../../shared/theme";

export function SchedulingSubtabs({ activeTab, onChange }) {
  const tabs = [
    { id: "volume", label: "Volume", subtitle: "Demand matrix and capacity pressure" },
    { id: "rotation", label: "Rotation Schedule", subtitle: "Create, preview, and tune the backend grid" },
  ];
  const activeIndex = Math.max(0, tabs.findIndex((tab) => tab.id === activeTab));
  return (
    <div
      className="scheduling-view-switcher"
      style={{
        "--scheduling-view-count": tabs.length,
        "--scheduling-view-active-index": activeIndex,
      }}
    >
      <style>{`
        .scheduling-view-switcher {
          position: relative;
          display: grid;
          grid-template-columns: repeat(var(--scheduling-view-count), minmax(0, 1fr));
          min-height: 82px;
          margin-bottom: 18px;
          padding: 6px;
          border: 1px solid rgba(148, 163, 184, 0.32);
          border-radius: 16px;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.95));
          box-shadow: 0 14px 34px rgba(15, 23, 42, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.9);
          overflow: hidden;
        }
        .scheduling-view-switcher-indicator {
          position: absolute;
          top: 6px;
          bottom: 6px;
          left: 6px;
          z-index: 0;
          width: calc((100% - 12px) / var(--scheduling-view-count));
          border: 1px solid rgba(20, 83, 45, 0.20);
          border-radius: 12px;
          background:
            radial-gradient(circle at 18% 0%, rgba(34, 197, 94, 0.18), transparent 34%),
            linear-gradient(180deg, #F0FDF4, #FFFFFF);
          box-shadow: 0 12px 28px rgba(20, 83, 45, 0.12);
          transform: translateX(calc(var(--scheduling-view-active-index) * 100%));
          transition: transform 420ms cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        .scheduling-view-option {
          position: relative;
          z-index: 1;
          display: grid;
          align-content: center;
          gap: 4px;
          min-width: 0;
          border: 0;
          border-radius: 12px;
          background: transparent;
          color: ${C.textSec};
          cursor: pointer;
          font: inherit;
          padding: 14px 16px;
          text-align: left;
          transition: background 160ms ease, color 160ms ease, transform 160ms ease;
        }
        .scheduling-view-option:hover {
          background: rgba(20, 83, 45, 0.045);
          transform: translateY(-1px);
        }
        .scheduling-view-option.is-active {
          color: ${C.pri};
        }
        .scheduling-view-option strong {
          color: inherit;
          font-size: 14px;
          font-weight: 950;
          line-height: 1.15;
        }
        .scheduling-view-option span {
          color: ${C.textMut};
          font-size: 11px;
          font-weight: 800;
          line-height: 1.35;
        }
        .scheduling-view-option.is-active span {
          color: ${C.pri};
        }
        @media (max-width: 700px) {
          .scheduling-view-switcher {
            grid-template-columns: 1fr;
            min-height: auto;
          }
          .scheduling-view-switcher-indicator {
            display: none;
          }
          .scheduling-view-option.is-active {
            background: #F0FDF4;
            box-shadow: inset 0 0 0 1px rgba(20, 83, 45, 0.18);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .scheduling-view-switcher * {
            transition: none !important;
          }
        }
      `}</style>
      <div className="scheduling-view-switcher-indicator" />
      {tabs.map((tab) => {
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`scheduling-view-option${active ? " is-active" : ""}`}
          >
            <strong>{tab.label}</strong>
            <span>{tab.subtitle}</span>
          </button>
        );
      })}
    </div>
  );
}

export function getInitialSchedulingTab() {
  if (typeof window === "undefined") return "volume";
  const tab = new URLSearchParams(window.location.search).get("tab");
  return tab === "rotation" ? "rotation" : "volume";
}
