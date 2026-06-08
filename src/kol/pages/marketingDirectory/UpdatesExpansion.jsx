// Inline updates area beneath an org row — a verbatim copy of the marketing
// tracker's Updates expansion: every historical update (actor — date · time /
// text), newest first. The Log composer itself now lives in the shared
// LogEntryModal (opened from the row's Log button), not inline here.
import React from "react";
import { C } from "../../../shared/theme";
import { fmtDate, fmtUpdateStamp } from "./format";

export function UpdatesExpansion({ feed }) {
  return (
    <div style={{ background: C.bg, borderLeft: `3px solid ${C.pri}` }}>
      {feed.length > 0 ? (
        <div style={{ padding: "8px 14px 4px" }}>
          {feed.map((row, idx, arr) => (
            <div key={row.id} style={{ marginBottom: idx === arr.length - 1 ? 0 : 6, paddingBottom: idx === arr.length - 1 ? 0 : 6, borderBottom: idx === arr.length - 1 ? "none" : `1px solid ${C.borderLight}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.pri, marginBottom: 1 }}>{row.by} — {fmtUpdateStamp(row.at)}</div>
              <div style={{ fontSize: 11, color: C.text, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{row.text || "—"}</div>
              {row.next ? <div style={{ fontSize: 9, color: C.textSec, marginTop: 1 }}>Follow-up: {fmtDate(row.next)}</div> : null}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ padding: "10px 14px", fontSize: 11, color: C.textMut }}>No updates yet — click Log to add one.</div>
      )}
    </div>
  );
}
