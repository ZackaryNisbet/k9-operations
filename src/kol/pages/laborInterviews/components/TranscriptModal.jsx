import React from "react";
import { C } from "../../../../shared/theme";
import {
  chunkProviderWords,
  isTurnActive,
  wordsFromProviderSegments,
} from "../helpers";
import { EmptyState } from "./EmptyState";
import { IconButton } from "./IconButton";
import { TranscriptWords } from "./TranscriptWords";

export function TranscriptModal({ turns, currentTime, segmentationSource = "", onClose }) {
  const safeTurns = Array.isArray(turns) ? turns : [];
  const wordSegmentMode = segmentationSource === "xai_word_segments" && safeTurns.length > 40 && !safeTurns.some((turn) => /^(Speaker|Person)\s+\d+/i.test(turn.speaker || ""));
  const providerWords = wordSegmentMode ? wordsFromProviderSegments(safeTurns) : [];
  const providerWordChunks = wordSegmentMode ? chunkProviderWords(providerWords) : [];
  const hasSpeakers = safeTurns.some((turn) => turn.speaker !== "Transcript");
  return (
    <div className="interview-modal-backdrop" onClick={onClose}>
      <div onClick={(event) => event.stopPropagation()} style={{ width: "min(960px, 92vw)", maxHeight: "86vh", background: "#fff", borderRadius: 8, overflow: "hidden", boxShadow: "0 24px 70px rgba(2,6,23,0.24)", display: "grid", gridTemplateRows: "auto minmax(0, 1fr)", animation: "interviewModalEnter 260ms cubic-bezier(0.22, 1, 0.36, 1)" }}>
        <div style={{ padding: "16px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div>
            <div style={{ fontSize: 19, fontWeight: 950, color: C.text }}>Transcript</div>
            <div style={{ marginTop: 3, fontSize: 12, color: C.textMut }}>{wordSegmentMode ? providerWordChunks.length : safeTurns.length} {hasSpeakers && !wordSegmentMode ? "speaker turn" : "timeline row"}{(wordSegmentMode ? providerWordChunks.length : safeTurns.length) === 1 ? "" : "s"}</div>
          </div>
          <IconButton label="Close transcript" onClick={onClose}>{"x"}</IconButton>
        </div>
        <div style={{ padding: 18, overflowY: "auto", background: C.surfaceHover }}>
          {safeTurns.length === 0 ? (
            <EmptyState title="No Transcript" body="Replace the audio to regenerate this record with structured transcript turns." />
          ) : wordSegmentMode ? (
            <div style={{ display: "grid", gap: 10 }}>
              {providerWordChunks.map((turn) => (
                <div key={turn.id} className="interview-transcript-line" style={{ display: "grid", gridTemplateColumns: "86px minmax(0, 1fr)", gap: 12, alignItems: "start", background: isTurnActive(turn, currentTime) ? "#f0fdf4" : "#fff", border: `1px solid ${isTurnActive(turn, currentTime) ? "#bbf7d0" : C.borderLight}`, borderRadius: 8, padding: "11px 12px" }}>
                  <div style={{ fontSize: 12, color: C.textMut, fontWeight: 850 }}>{turn.timestamp || "--:--"}</div>
                  <div style={{ fontSize: 13, color: C.textSec, lineHeight: 1.55 }}><TranscriptWords turn={turn} currentTime={currentTime} /></div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {safeTurns.map((turn) => (
                <div key={turn.id} className="interview-transcript-line" style={{ display: "grid", gridTemplateColumns: "86px 120px minmax(0, 1fr)", gap: 12, alignItems: "start", background: isTurnActive(turn, currentTime) ? "#f0fdf4" : "#fff", border: `1px solid ${isTurnActive(turn, currentTime) ? "#bbf7d0" : C.borderLight}`, borderRadius: 8, padding: "11px 12px" }}>
                  <div style={{ fontSize: 12, color: C.textMut, fontWeight: 850 }}>{turn.timestamp || "--:--"}</div>
                  <div style={{ fontSize: 12, color: C.pri, fontWeight: 900 }}>{turn.speaker}</div>
                  <div style={{ fontSize: 13, color: C.textSec, lineHeight: 1.55 }}><TranscriptWords turn={turn} currentTime={currentTime} /></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
