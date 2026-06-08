import React, { useState } from "react";
import {
  C,
  fmtDate,
} from "../../../../shared/theme";
import {
  Btn,
  LaborIntro,
  LaborSearchBar,
} from "../../../../shared/ui";
import {
  getInterviewCandidateContactLabel,
  getInterviewCandidateDisplayLabel,
  getInterviewRecommendation,
  getInterviewRoleLabel,
} from "../../../interviewData";
import { LABOR_INTRO_DEFAULTS } from "../../../laborIntros";
import { createPortal } from "react-dom";
import { EmptyState } from "./EmptyState";
import { RecommendationBadge } from "./RecommendationBadge";

export function InterviewRoster({ records, onOpen, onAdd, canAdd, searchSlot = null, introValue = "", canEditIntro = false, onSaveIntro = null }) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const filtered = query
    ? records.filter((record) => {
        const name = getInterviewCandidateDisplayLabel(record) || "";
        const position = record.candidate_position || getInterviewRoleLabel(record.template_snapshot?.template?.role_key) || "";
        const contact = getInterviewCandidateContactLabel(record) || "";
        return `${name} ${position} ${contact}`.toLowerCase().includes(query);
      })
    : records;
  return (
    <div className="interview-roster-shell">
      {(() => { const __searchBlock = (
      <div className="interview-search-block">
        <LaborSearchBar value={q} onChange={setQ} placeholder="Search candidate, position, or contact…">
          {canAdd ? (
            <Btn variant="primary" size="sm" onClick={onAdd}>Add New Interview</Btn>
          ) : null}
        </LaborSearchBar>
        <LaborIntro
          value={introValue}
          defaultValue={LABOR_INTRO_DEFAULTS.interviews}
          canEdit={canEditIntro}
          onSave={onSaveIntro}
          prefix={<>{filtered.length} of {records.length} interview{records.length === 1 ? "" : "s"} · </>}
        />
      </div>
      ); return searchSlot ? createPortal(__searchBlock, searchSlot) : __searchBlock; })()}
      {records.length === 0 ? (
        <EmptyState title="No Interviews Yet" body="Create the first interview after a position template is published." />
      ) : (
      <div className="interview-table-shell">
      <div className="interview-roster-table" style={{ minWidth: 900 }}>
        <div className="interview-roster-header" style={{ display: "grid", gridTemplateColumns: "minmax(240px, 1.5fr) minmax(190px, 1.1fr) 170px 150px 90px", gap: 0, padding: "9px 16px", borderBottom: `1px solid ${C.border}`, color: C.textMut, fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          <div>Candidate</div>
          <div>Position</div>
          <div>Date Interviewed</div>
          <div>Next Step</div>
          <div />
        </div>
        {filtered.map((record, index) => (
          <button
            type="button"
            key={record.id}
            onClick={() => onOpen(record.id)}
            className="interview-row"
            style={{
              width: "100%",
              display: "grid",
              gridTemplateColumns: "minmax(240px, 1.5fr) minmax(190px, 1.1fr) 170px 150px 90px",
              gap: 0,
              alignItems: "center",
              padding: "8px 16px",
              border: "none",
              borderBottom: `1px solid ${C.borderLight}`,
              background: "#fff",
              textAlign: "left",
              cursor: "pointer",
              fontFamily: "inherit",
              animationDelay: `${Math.min(index, 10) * 24}ms`,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{getInterviewCandidateDisplayLabel(record)}</div>
              <div style={{ marginTop: 2, fontSize: 11, color: C.textMut, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{getInterviewCandidateContactLabel(record)}</div>
            </div>
            <div style={{ fontSize: 12, color: C.textSec, fontWeight: 700 }}>{record.candidate_position || getInterviewRoleLabel(record.template_snapshot?.template?.role_key)}</div>
            <div style={{ fontSize: 12, color: C.textSec }}>{record.interview_date ? fmtDate(record.interview_date) : "-"}</div>
            <div><RecommendationBadge value={getInterviewRecommendation(record)} /></div>
            <div style={{ color: C.pri, fontSize: 12, fontWeight: 900, textAlign: "right" }}><span className="interview-open-pill">Open</span></div>
          </button>
        ))}
        {filtered.length === 0 ? (
          <div style={{ padding: "16px", fontSize: 13, color: C.textMut }}>No interviews match “{q}”.</div>
        ) : null}
      </div>
      </div>
      )}
    </div>
  );
}
