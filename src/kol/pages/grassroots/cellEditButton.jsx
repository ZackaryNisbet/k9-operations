import React from "react";
import { C } from "../../../shared/theme";

// Pencil affordance that opens the per-column micro-editor. When `needed` (a
// required field group is empty), the pencil is PERSISTENT and amber so the gap is
// obvious at a glance — a quiet "to-do" nudge. Otherwise it's subtle and only
// appears on cell hover (see .gr-edit-cell CSS). The label shows as a hover tooltip.
export function CellEditButton({ onClick, label, needed = false, onShowTip, onHideTip }) {
  const show = (e) => onShowTip && onShowTip(label, e.currentTarget.getBoundingClientRect());
  const hide = () => onHideTip && onHideTip();
  return (
    <button
      type="button"
      className={needed ? "gr-edit-needed" : "gr-edit-reveal"}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick(); }}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      aria-label={label}
      style={{ flexShrink: 0, marginLeft: 3, padding: 0, width: needed ? 16 : 14, height: needed ? 16 : 14, border: "none", background: "transparent", cursor: "pointer", color: needed ? C.warn : C.pri, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
    >
      <svg width={needed ? 13 : 11} height={needed ? 13 : 11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    </button>
  );
}
