// K9 Operations — RoleLayoutPage WorkflowSummary
// Presentational leaf component extracted verbatim from RoleLayoutPage.jsx.
// Receives cellItems as a prop; no parent-state closure.

import React, { useMemo } from "react";
import { C } from "../../../shared/theme";
import { ROLES, SECTIONS, WORKFLOW_DEFS } from "./constants";
import { buildWorkflowSummary } from "./helpers";

function WorkflowSummary({ cellItems }) {
  const summary = useMemo(
    () => buildWorkflowSummary(cellItems, ROLES, SECTIONS, WORKFLOW_DEFS),
    [cellItems],
  );

  const roleLabel = (id) => ROLES.find(r => r.id === id)?.label || id;

  return (
    <div style={{
      marginTop: 16, padding: "14px 18px", borderRadius: 12,
      border: `1.5px solid ${C.border}`, background: C.surface,
    }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: C.text, marginBottom: 10 }}>
        Workflow Summary
      </div>

      {/* Counts row */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <span style={{
          padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700,
          background: `${C.suc}14`, color: C.suc,
        }}>
          {summary.used.length} in use
        </span>
        <span style={{
          padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700,
          background: summary.unused.length > 0 ? `${C.warn}14` : `${C.suc}14`,
          color: summary.unused.length > 0 ? C.warn : C.suc,
        }}>
          {summary.unused.length} unused
        </span>
        <span style={{
          padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700,
          background: `${C.pri}10`, color: C.pri,
        }}>
          {summary.shared.length} shared across roles
        </span>
        <span style={{
          padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700,
          background: `${C.textMut}14`, color: C.textSec,
        }}>
          {summary.singleRole.length} single-role
        </span>
      </div>

      {/* Per-workflow breakdown */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
        gap: 6,
      }}>
        {WORKFLOW_DEFS.map(wf => {
          const roleSet = summary.wfRoleMap[wf.id];
          const count = roleSet.size;
          const isUnused = count === 0;
          const isShared = count > 1;

          return (
            <div key={wf.id} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "5px 10px", borderRadius: 8,
              background: isUnused ? `${C.warn}06` : C.bg,
              border: `1px solid ${isUnused ? `${C.warn}30` : C.borderLight}`,
              opacity: isUnused ? 0.7 : 1,
            }}>
              <span style={{
                fontSize: 11, fontWeight: 600, color: isUnused ? C.warn : C.text,
                flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {wf.label}
              </span>
              {isUnused ? (
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                  background: `${C.warn}18`, color: C.warn,
                }}>UNUSED</span>
              ) : (
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                  background: isShared ? `${C.pri}12` : `${C.textMut}12`,
                  color: isShared ? C.pri : C.textSec,
                }}>
                  {[...roleSet].map(roleLabel).join(" · ")}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default WorkflowSummary;
