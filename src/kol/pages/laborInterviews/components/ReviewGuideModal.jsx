import React, { useMemo, useState } from "react";
import { C } from "../../../../shared/theme";
import {
  Badge,
  Btn,
} from "../../../../shared/ui";
import { isInterviewResponseReviewed } from "../../../interviewData";
import { GUIDE_AI_WORK_STEPS } from "../constants";
import {
  buildGuideAiCompletionBullets,
  buildPdfReviewItems,
  composePdfReviewItemValue,
  fieldValueRows,
  humanizePdfFieldName,
  questionPartLabel,
  questionPartShortLabel,
  responseKeyForPdfField,
  splitPdfReviewItemValue,
  summaryBulletsToText,
  summarySectionKey,
} from "../helpers";
import { EmptyState } from "./EmptyState";
import { GuideAiAssistantPanel } from "./GuideAiAssistantPanel";
import { IconButton } from "./IconButton";
import { InterviewWorkspaceTabs } from "./InterviewWorkspaceTabs";
import { MergeTrace } from "./MergeTrace";
import { PdfGuidePreview } from "./PdfGuidePreview";

export function ReviewGuideModal({
  record,
  fields,
  artifacts,
  pdfUrl,
  loadingPdf,
  responsesByTarget,
  responseDrafts,
  pdfFieldValues,
  summaryPages,
  summaryDraftTextByKey,
  summarySavingKey,
  customSummaryPages = [],
  savingKey,
  exporting,
  activeIndex,
  setActiveIndex,
  getFieldValue,
  setFieldDraft,
  onSummarySectionChange,
  onAddCustomSummaryPage,
  onCustomSummaryPageTitleChange,
  onRemoveCustomSummaryPage,
  approveField,
  rejectField,
  aiDrafting,
  onAiFillDocument,
  exportFinalPdf,
  downloadArtifact,
  workspaceTabs,
  activePane,
  onPaneChange,
  payRateSummary,
  onClose,
}) {
  const reviewFields = fields;
  const reviewItems = useMemo(() => buildPdfReviewItems(reviewFields), [reviewFields]);
  const summarySections = useMemo(() => {
    const renderedSections = (summaryPages || []).flatMap((page) => page?.sections || []);
    const customKeys = new Set((customSummaryPages || []).map((page) => page.sectionKey).filter(Boolean));
    const customSections = (customSummaryPages || []).map((page) => {
      const existing = renderedSections.find((section) => (section.key || summarySectionKey(section.heading)) === page.sectionKey);
      return existing || { key: page.sectionKey, heading: "Notes", bullets: [] };
    });
    const standardSections = renderedSections.filter((section) => !customKeys.has(section.key || summarySectionKey(section.heading)));
    return [...customSections, ...standardSections];
  }, [customSummaryPages, summaryPages]);
  const customSummaryPageBySectionKey = useMemo(() => {
    return new Map((customSummaryPages || []).map((page) => [page.sectionKey, page]));
  }, [customSummaryPages]);
  const summaryAvailable = summarySections.length > 0 || customSummaryPages.length > 0;
  const summaryActive = summaryAvailable && activeIndex >= reviewItems.length;
  const boundedIndex = summaryActive ? -1 : Math.min(activeIndex, Math.max(0, reviewItems.length - 1));
  const activeItem = summaryActive ? null : (reviewItems[boundedIndex] || reviewItems[0] || null);
  const activeField = activeItem?.field || activeItem?.fields?.[0] || null;
  const activeKey = activeField ? responseKeyForPdfField(activeField) : "";
  const itemApproved = (item) => !!item?.fields?.length && item.fields.every((field) => isInterviewResponseReviewed(responsesByTarget[responseKeyForPdfField(field)] || {}));
  const approved = !summaryActive && itemApproved(activeItem);
  const approvedCount = reviewItems.filter(itemApproved).length;
  const getItemDraftValue = (item) => {
    if (!item) return "";
    if (item.type === "question_part" && Object.prototype.hasOwnProperty.call(responseDrafts || {}, item.key)) {
      return responseDrafts[item.key] || "";
    }
    return composePdfReviewItemValue(item, getFieldValue);
  };
  const activeValue = activeItem ? getItemDraftValue(activeItem) : "";
  const activeResponses = activeItem?.fields?.map((field) => responsesByTarget[responseKeyForPdfField(field)] || {}).filter(Boolean) || [];
  const activeEvidence = activeResponses.flatMap((response) => Array.isArray(response.ai_evidence) ? response.ai_evidence : []).filter(Boolean);
  const [guideAiOpen, setGuideAiOpen] = useState(false);
  const [guideAiWorking, setGuideAiWorking] = useState(false);
  const [guideAiStepIndex, setGuideAiStepIndex] = useState(0);
  const [guideAiMessages, setGuideAiMessages] = useState(() => [
    {
      id: "guide-ai-ready",
      role: "assistant",
      body: "I can update the whole PDF guide from the transcript, candidate metadata, and any extra instruction you give me.",
    },
  ]);

  const selectField = (field) => {
    const index = reviewItems.findIndex((item) => item.fields?.some((row) => row.name === field?.name));
    if (index >= 0) setActiveIndex(index);
  };

  const goNext = () => {
    if (!reviewItems.length) return;
    const nextUnapproved = reviewItems.findIndex((item, index) => index > boundedIndex && !itemApproved(item));
    if (nextUnapproved >= 0) setActiveIndex(nextUnapproved);
    else setActiveIndex(Math.min(reviewItems.length - 1, boundedIndex + 1));
  };

  const setItemDraft = (item, value) => {
    splitPdfReviewItemValue(item, value).forEach(({ field, value: fieldValue }) => {
      setFieldDraft(field, fieldValue, item?.type === "question_part" ? { aggregateKey: item.key, aggregateValue: value } : null);
    });
  };

  const approveAndNext = async () => {
    if (!activeItem) return;
    const parts = splitPdfReviewItemValue(activeItem, activeValue);
    for (const part of parts) {
      await approveField(part.field, part.value);
    }
    goNext();
  };

  const approveReviewItems = async (items) => {
    for (const item of items) {
      const itemValue = composePdfReviewItemValue(item, getFieldValue);
      const parts = splitPdfReviewItemValue(item, itemValue);
      for (const part of parts) {
        await approveField(part.field, part.value);
      }
    }
  };

  const rejectReviewItems = async (items) => {
    for (const item of items) {
      for (const field of item.fields || []) {
        await rejectField?.(field);
      }
    }
  };

  const activePageItems = reviewItems.filter((item) => item.fields?.some((field) => field.page_number === activeField?.page_number));

  const submitGuideAiInstruction = async (instruction) => {
    const trimmed = String(instruction || "").trim();
    if (!trimmed || guideAiWorking) return false;
    const messageId = Date.now();
    setGuideAiOpen(true);
    setGuideAiStepIndex(0);
    setGuideAiWorking(true);
    setGuideAiMessages((prev) => [
      ...prev,
      { id: `guide-ai-user-${messageId}`, role: "user", body: trimmed },
    ]);
    let stepTimer = null;
    try {
      stepTimer = window.setInterval(() => {
        setGuideAiStepIndex((index) => Math.min(GUIDE_AI_WORK_STEPS.length - 1, index + 1));
      }, 2400);
      const result = await onAiFillDocument?.(trimmed);
      setGuideAiStepIndex(GUIDE_AI_WORK_STEPS.length - 1);
      if (result) {
        setGuideAiMessages((prev) => [
          ...prev,
          {
            id: `guide-ai-assistant-${messageId}`,
            role: "assistant",
            body: "Guide update ready for review.",
            bullets: buildGuideAiCompletionBullets(result, reviewFields.length),
          },
        ]);
        return true;
      }
      setGuideAiMessages((prev) => [
        ...prev,
        {
          id: `guide-ai-error-${messageId}`,
          role: "assistant",
          body: "I could not apply that update. Check the transcript and try a more specific instruction.",
        },
      ]);
      return false;
    } finally {
      if (stepTimer) window.clearInterval(stepTimer);
      setGuideAiWorking(false);
    }
  };

  return (
    <div className="interview-modal-backdrop" onClick={onClose}>
      <div className="interview-immersive-shell" onClick={(event) => event.stopPropagation()}>
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ minWidth: 0, display: "grid", gap: 9 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 950, color: C.text }}>Active Interview</div>
              <div style={{ marginTop: 3, fontSize: 12, color: C.textMut }}>
                {record.candidate_full_name} - Guide {approvedCount}/{reviewItems.length} reviewed{payRateSummary ? ` - Pay ${payRateSummary}` : ""}
              </div>
            </div>
            <InterviewWorkspaceTabs tabs={workspaceTabs} active={activePane} onChange={onPaneChange} />
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <IconButton
              label="AI instructions for this guide"
              onClick={() => setGuideAiOpen((open) => !open)}
              variant={guideAiOpen ? "primary" : "default"}
            >
              AI
            </IconButton>
            <Btn
              variant="primary"
              size="sm"
              onClick={() => submitGuideAiInstruction("Fill this guide from the transcript using the selected strictness mode.")}
              disabled={guideAiWorking || aiDrafting}
            >
              Draft Guide
            </Btn>
            <Btn variant="secondary" size="sm" onClick={onAddCustomSummaryPage}>Add Custom Page</Btn>
            <Btn variant="secondary" size="sm" onClick={() => approveReviewItems(activePageItems)} disabled={!activePageItems.length}>Approve Page</Btn>
            <Btn variant="secondary" size="sm" onClick={() => approveReviewItems(reviewItems)} disabled={!reviewItems.length}>Approve All Drafts</Btn>
            <Btn variant="secondary" size="sm" onClick={() => rejectReviewItems(reviewItems)} disabled={!reviewItems.length}>Reject All</Btn>
            <Btn variant="success" size="sm" onClick={exportFinalPdf} disabled={exporting || !pdfUrl}>{exporting ? "Exporting..." : "Export Final PDF"}</Btn>
            <IconButton label="Close guide" onClick={onClose}>{"x"}</IconButton>
          </div>
        </div>
        <GuideAiAssistantPanel
          open={guideAiOpen}
          messages={guideAiMessages}
          working={guideAiWorking || aiDrafting}
          workStepIndex={guideAiStepIndex}
          fieldCount={reviewItems.length}
          reviewedCount={approvedCount}
          onClose={() => setGuideAiOpen(false)}
          onSubmit={submitGuideAiInstruction}
        />
        <div className="interview-guide-grid" style={{ display: "grid", gridTemplateColumns: "74px minmax(0, 1fr) 390px", minHeight: 0 }}>
          <div style={{ borderRight: `1px solid ${C.border}`, overflowY: "auto", background: "#fbfdff", padding: "12px 10px", display: "grid", alignContent: "start", gap: 7 }}>
            {reviewItems.length === 0 ? (
              <div style={{ color: C.textMut, fontSize: 12 }}>No fields</div>
            ) : reviewItems.map((item, index) => {
              const isActive = index === boundedIndex;
              const isApproved = itemApproved(item);
              return (
                <button
                  type="button"
                  key={item.key}
                  onClick={() => setActiveIndex(index)}
                  title={item.type === "question_part" ? questionPartLabel(item) : humanizePdfFieldName(item.field.name)}
                  style={{
                    width: "100%",
                    height: 24,
                    borderRadius: 999,
                    border: `1px solid ${isActive ? C.pri : isApproved ? C.suc : C.border}`,
                    background: isActive ? C.pri : isApproved ? "#dcfce7" : "#fff",
                    color: isActive ? "#fff" : isApproved ? C.suc : C.textMut,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: 11,
                    fontWeight: 900,
                  }}
                >
                  {item.type === "question_part" ? questionPartShortLabel(item) : index + 1}
                </button>
              );
            })}
            {summaryAvailable && (
              <>
                <div style={{ height: 1, background: C.borderLight, margin: "4px 0" }} />
                <button
                  type="button"
                  onClick={() => setActiveIndex(reviewItems.length)}
                  title="Interview Summary"
                  style={{
                    width: "100%",
                    height: 28,
                    borderRadius: 999,
                    border: `1px solid ${summaryActive ? C.pri : "#86efac"}`,
                    background: summaryActive ? C.pri : "#ecfdf5",
                    color: summaryActive ? "#fff" : C.suc,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: 10,
                    fontWeight: 950,
                  }}
                >
                  SUM
                </button>
              </>
            )}
          </div>
          <div className="interview-guide-pdf" style={{ background: "#e5e7eb", padding: 14, minHeight: 0 }}>
            {pdfUrl ? (
              <PdfGuidePreview
                pdfUrl={pdfUrl}
                loadingPdf={loadingPdf}
                fields={reviewFields}
                fieldValues={pdfFieldValues}
                summaryPages={summaryPages}
                activePageNumber={activeField?.page_number || 1}
                activeKey={activeKey}
                activeSummary={summaryActive}
                onSelectField={selectField}
                onSelectSummary={() => setActiveIndex(reviewItems.length)}
              />
            ) : loadingPdf ? (
              <div style={{ height: "100%", minHeight: 540, display: "flex", alignItems: "center", justifyContent: "center", color: C.textMut, fontWeight: 800 }}>Rendering guide...</div>
            ) : (
              <EmptyState title="No PDF" body="This interview does not have a source guide PDF." />
            )}
          </div>
          <div style={{ borderLeft: `1px solid ${C.border}`, background: "#fff", padding: 16, overflowY: "auto" }}>
            {summaryActive ? (
              <div style={{ display: "grid", gap: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: C.textMut, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.05em" }}>Summary Appendix</div>
                    <div style={{ marginTop: 5, fontSize: 16, color: C.text, fontWeight: 950 }}>Interview Summary</div>
                    <div style={{ marginTop: 4, fontSize: 12, color: C.textMut }}>Edits save into this interview and export with the final PDF.</div>
                  </div>
                  <Btn variant="secondary" size="sm" onClick={onAddCustomSummaryPage} style={{ flexShrink: 0 }}>Add Page</Btn>
                </div>
                {summarySections.map((section) => {
                  const sectionKey = section.key || summarySectionKey(section.heading);
                  const customPage = customSummaryPageBySectionKey.get(sectionKey);
                  const textValue = Object.prototype.hasOwnProperty.call(summaryDraftTextByKey || {}, sectionKey)
                    ? summaryDraftTextByKey[sectionKey] || ""
                    : summaryBulletsToText(section.bullets);
                  return (
                    <div key={sectionKey} style={{ display: "grid", gap: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: customPage ? "flex-end" : "center" }}>
                        {customPage ? (
                          <label style={{ display: "grid", gap: 5, flex: 1, minWidth: 0 }}>
                            <span style={{ fontSize: 11, color: C.textMut, fontWeight: 900 }}>Custom page title</span>
                            <input
                              type="text"
                              value={customPage.title || ""}
                              onChange={(event) => onCustomSummaryPageTitleChange?.(customPage.id, event.target.value)}
                              placeholder="Intended Role For Krystina"
                              style={{ width: "100%", boxSizing: "border-box", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "9px 10px", fontFamily: "inherit", fontSize: 13, fontWeight: 800, color: C.text, outline: "none" }}
                            />
                          </label>
                        ) : (
                          <div style={{ fontSize: 12, color: C.text, fontWeight: 950 }}>{section.heading || "Summary"}</div>
                        )}
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                          <span style={{ color: C.textMut, fontSize: 11 }}>{summarySavingKey === sectionKey ? "Saving..." : "Autosaves"}</span>
                          {customPage && (
                            <Btn variant="danger" size="sm" onClick={() => onRemoveCustomSummaryPage?.(customPage.id)} style={{ padding: "6px 9px", borderRadius: 8 }}>Remove</Btn>
                          )}
                        </div>
                      </div>
                      <textarea
                        value={textValue}
                        onChange={(event) => onSummarySectionChange?.(sectionKey, event.target.value)}
                        placeholder={customPage ? "Add HR handoff notes, intended responsibilities, role expectations, risks, or follow-up context for this applicant." : ""}
                        rows={Math.max(5, Math.min(14, textValue.split("\n").length + 2))}
                        style={{ width: "100%", boxSizing: "border-box", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: 12, fontFamily: "inherit", fontSize: 13, lineHeight: 1.5, color: C.text, resize: "vertical", outline: "none", background: "#fff", minHeight: 138, whiteSpace: "pre-wrap" }}
                      />
                    </div>
                  );
                })}
              </div>
            ) : activeField ? (
              <div style={{ display: "grid", gap: 14 }}>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 11, color: C.textMut, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.05em" }}>Review Field</div>
                      <div style={{ marginTop: 5, fontSize: 16, color: C.text, fontWeight: 950, overflowWrap: "anywhere" }}>{activeItem?.type === "question_part" ? questionPartLabel(activeItem) : humanizePdfFieldName(activeField.name)}</div>
                      <div style={{ marginTop: 4, fontSize: 12, color: C.textMut }}>Page {activeField.page_number || "-"}</div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                      <Badge color={approved ? "success" : "default"}>{approved ? "Reviewed" : "Needs Review"}</Badge>
                    </div>
                  </div>
                </div>
                <textarea
                  value={activeValue}
                  onChange={(event) => setItemDraft(activeItem, event.target.value)}
                  rows={fieldValueRows(activeValue)}
                  placeholder={activeItem?.type === "question_part" ? `${activeItem.partLabel} response` : ""}
                  style={{ width: "100%", boxSizing: "border-box", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: 12, fontFamily: "inherit", fontSize: 14, lineHeight: 1.5, color: C.text, resize: "vertical", outline: "none", background: "#fff", minHeight: 132, whiteSpace: "pre-wrap" }}
                />
                <MergeTrace responses={activeResponses} />
                {activeEvidence.length > 0 && (
                  <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ fontSize: 11, color: C.textMut, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.05em" }}>Evidence</div>
                    {activeEvidence.slice(0, 4).map((entry, index) => (
                      <div key={index} style={{ borderLeft: `3px solid ${C.acc}`, paddingLeft: 10, color: C.textSec, fontSize: 12, lineHeight: 1.45 }}>{entry}</div>
                    ))}
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ color: C.textMut, fontSize: 12 }}>{savingKey === activeKey ? "Saving..." : "Autosaves as you type"}</span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Btn variant="secondary" size="sm" onClick={() => rejectReviewItems(activeItem ? [activeItem] : [])}>Reject</Btn>
                    <Btn variant="primary" size="sm" onClick={approveAndNext}>Approve & Next</Btn>
                  </div>
                </div>
                {artifacts.length > 0 && (
                  <div style={{ borderTop: `1px solid ${C.borderLight}`, paddingTop: 12, display: "grid", gap: 8 }}>
                    <div style={{ fontSize: 11, color: C.textMut, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.05em" }}>Exports</div>
                    {artifacts.slice(0, 3).map((artifact) => (
                      <div key={artifact.id} style={{ fontSize: 12, color: C.textSec, display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{artifact.file_name}</span>
                        <span style={{ flexShrink: 0 }}>{artifact.created_at ? new Date(artifact.created_at).toLocaleDateString() : ""}</span>
                        <button
                          type="button"
                          onClick={() => downloadArtifact?.(artifact)}
                          style={{ border: "none", background: "none", color: C.pri, fontFamily: "inherit", fontSize: 12, fontWeight: 900, cursor: "pointer", padding: 0 }}
                        >
                          Download
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <EmptyState title="No Fields" body="Publish a fillable PDF template before reviewing the guide." />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
