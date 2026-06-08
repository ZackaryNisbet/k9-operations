import React, { useMemo, useRef, useState } from "react";
import { C } from "../../../../shared/theme";
import {
  Badge,
  Btn,
} from "../../../../shared/ui";
import { getInterviewOfficialResponseText } from "../../../interviewData";
import {
  fieldValueRows,
  normalizeTranscriptSearch,
  responseKeyForQuestion,
} from "../helpers";
import { EmptyState } from "./EmptyState";
import { IconButton } from "./IconButton";
import { InterviewWorkspaceTabs } from "./InterviewWorkspaceTabs";
import { MergeTrace } from "./MergeTrace";

export function QuestionReviewModal({
  record,
  questions,
  responsesByTarget,
  responseDrafts,
  savingKey,
  setQuestionDraft,
  approveQuestion,
  rejectQuestion,
  onAiDraftQuestions,
  workspaceTabs,
  activePane,
  onPaneChange,
  payRateSummary,
  onClose,
}) {
  const [questionSearch, setQuestionSearch] = useState("");
  const approvedCount = questions.filter((question) => responsesByTarget[responseKeyForQuestion(question)]?.metadata?.approved).length;
  const filteredRows = useMemo(() => {
    const tokens = normalizeTranscriptSearch(questionSearch).split(/\s+/).filter(Boolean);
    return questions
      .map((question, index) => ({ question, index }))
      .filter(({ question }) => {
        if (!tokens.length) return true;
        const searchable = normalizeTranscriptSearch([
          question.category,
          question.prompt,
          question.helper_text,
          question.question_key,
        ].filter(Boolean).join(" "));
        return tokens.every((token) => searchable.includes(token));
      });
  }, [questionSearch, questions]);
  const grouped = filteredRows.reduce((groups, row) => {
    const { question } = row;
    const category = question.category || "Interview";
    if (!groups[category]) groups[category] = [];
    groups[category].push(row);
    return groups;
  }, {});
  const questionRefs = useRef({});
  const scrollToQuestion = (questionKey) => {
    questionRefs.current[questionKey]?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  const approveAllQuestions = async () => {
    for (const question of questions) {
      await approveQuestion(question, responseDrafts[responseKeyForQuestion(question)] || "");
    }
  };
  const rejectAllQuestions = async () => {
    for (const question of questions) {
      await rejectQuestion?.(question);
    }
  };

  return (
    <div className="interview-modal-backdrop" onClick={onClose}>
      <div className="interview-immersive-shell" onClick={(event) => event.stopPropagation()} style={{ width: "min(1280px, 94vw)" }}>
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ minWidth: 0, display: "grid", gap: 9 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 950, color: C.text }}>Active Interview</div>
              <div style={{ marginTop: 3, fontSize: 12, color: C.textMut }}>
                {record.candidate_full_name} - Questions {approvedCount}/{questions.length} approved{payRateSummary ? ` - Pay ${payRateSummary}` : ""}
              </div>
            </div>
            <InterviewWorkspaceTabs tabs={workspaceTabs} active={activePane} onChange={onPaneChange} />
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Btn variant="primary" size="sm" onClick={onAiDraftQuestions} disabled={!questions.length}>Draft Questions</Btn>
            <Btn variant="secondary" size="sm" onClick={approveAllQuestions} disabled={!questions.length}>Approve All Drafts</Btn>
            <Btn variant="secondary" size="sm" onClick={rejectAllQuestions} disabled={!questions.length}>Reject All</Btn>
            <IconButton label="Close questions" onClick={onClose}>{"x"}</IconButton>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "230px minmax(0, 1fr)", minHeight: 0 }}>
          <div style={{ borderRight: `1px solid ${C.border}`, background: "#fff", overflowY: "auto", padding: "18px 16px", display: "grid", alignContent: "start", gap: 16 }}>
            <div style={{ display: "grid", gap: 7 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 11, color: C.textMut, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.05em" }}>Find Question</span>
                <input
                  value={questionSearch}
                  onChange={(event) => setQuestionSearch(event.target.value)}
                  placeholder="Search every question"
                  style={{ width: "100%", boxSizing: "border-box", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "10px 11px", fontFamily: "inherit", color: C.text, fontSize: 13, outline: "none" }}
                />
              </label>
              <div style={{ fontSize: 11, color: C.textMut, fontWeight: 800 }}>{filteredRows.length}/{questions.length} shown</div>
            </div>
            {Object.entries(grouped).map(([category, rows]) => (
              <div key={category}>
                <div style={{ color: C.text, fontSize: 12, fontWeight: 950, marginBottom: 8 }}>{category}</div>
                <div style={{ display: "grid", gap: 5 }}>
                  {rows.map(({ question, index }) => {
                    const key = responseKeyForQuestion(question);
                    const isApproved = !!responsesByTarget[key]?.metadata?.approved;
                    return (
                      <button
                        type="button"
                        key={question.question_key}
                        className="interview-question-rail-line"
                        onClick={() => scrollToQuestion(question.question_key)}
                        style={{
                          position: "relative",
                          height: 8,
                          width: "100%",
                          border: "none",
                          borderRadius: 99,
                          background: isApproved ? C.suc : C.border,
                          cursor: "pointer",
                          padding: 0,
                        }}
                        aria-label={`Jump to question ${index + 1}`}
                      >
                        <span
                          className="interview-question-tooltip"
                          style={{
                            position: "absolute",
                            left: "calc(100% + 10px)",
                            top: "50%",
                            transform: "translate(-6px, -50%)",
                            opacity: 0,
                            pointerEvents: "none",
                            width: 340,
                            borderRadius: 8,
                            background: "#0f172a",
                            color: "#fff",
                            padding: "8px 10px",
                            fontSize: 12,
                            fontWeight: 750,
                            lineHeight: 1.35,
                            zIndex: 5,
                            transition: "opacity 160ms ease, transform 160ms ease",
                            textAlign: "left",
                          }}
                        >
                          {question.prompt}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div style={{ padding: 20, background: C.surfaceHover, overflowY: "auto" }}>
            {questions.length === 0 ? (
              <EmptyState title="No Questions" body="Add shared custom questions in configuration." />
            ) : filteredRows.length === 0 ? (
              <EmptyState title="No Matching Questions" body="Adjust the search to bring questions back into the active interview workspace." />
            ) : (
              <div style={{ maxWidth: 880, display: "grid", gap: 20 }}>
                {Object.entries(grouped).map(([category, rows]) => (
                  <section key={category} style={{ display: "grid", gap: 12 }}>
                    <div style={{ fontSize: 18, fontWeight: 950, color: C.text }}>{category}</div>
                    {rows.map(({ question, index }) => {
                      const key = responseKeyForQuestion(question);
                      const response = responsesByTarget[key] || {};
                      const value = responseDrafts[key] || "";
                      const approved = !!response.metadata?.approved;
                      const officialValue = getInterviewOfficialResponseText(response);
                      const reviewedDirty = approved && String(value || "").trim() !== String(officialValue || "").trim();
                      const approveLabel = approved ? (reviewedDirty ? "Update Review" : "Reviewed") : "Approve";
                      return (
                        <div
                          key={question.question_key}
                          ref={(node) => { if (node) questionRefs.current[question.question_key] = node; }}
                          style={{ background: "#fff", border: `1px solid ${approved ? "#bbf7d0" : C.border}`, borderRadius: 8, padding: 16, display: "grid", gap: 12 }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 12, color: C.textMut, fontWeight: 900 }}>Question {index + 1}</div>
                              <div style={{ marginTop: 5, fontSize: 16, lineHeight: 1.4, color: C.text, fontWeight: 900 }}>{question.prompt}</div>
                            </div>
                            <Badge color={approved ? "success" : "default"}>{approved ? "Reviewed" : "Needs Review"}</Badge>
                          </div>
                          <textarea
                            value={value}
                            onChange={(event) => setQuestionDraft(question, event.target.value)}
                            rows={fieldValueRows(value)}
                            style={{ width: "100%", boxSizing: "border-box", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: 13, fontFamily: "inherit", fontSize: 14, lineHeight: 1.55, color: C.text, resize: "vertical", background: "#fff", outline: "none", minHeight: 96 }}
                          />
                          <MergeTrace responses={[response]} />
                          {Array.isArray(response.ai_evidence) && response.ai_evidence.length > 0 && (
                            <div style={{ display: "grid", gap: 6 }}>
                              {response.ai_evidence.slice(0, 2).map((entry, evidenceIndex) => (
                                <div key={evidenceIndex} style={{ borderLeft: `3px solid ${C.acc}`, paddingLeft: 10, color: C.textSec, fontSize: 12, lineHeight: 1.45 }}>{entry}</div>
                              ))}
                            </div>
                          )}
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                            <span style={{ color: C.textMut, fontSize: 12 }}>{savingKey === key ? "Saving..." : "Autosaves as you type"}</span>
                            <div style={{ display: "flex", gap: 8 }}>
                              <Btn variant="secondary" size="sm" onClick={() => rejectQuestion?.(question)}>Reject</Btn>
                              <Btn
                                variant={approved && !reviewedDirty ? "secondary" : "primary"}
                                size="sm"
                                onClick={() => approveQuestion(question, value)}
                                disabled={approved && !reviewedDirty}
                              >
                                {approveLabel}
                              </Btn>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </section>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
