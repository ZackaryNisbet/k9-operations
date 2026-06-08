import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  buildLiveTranscriptLines,
  findActiveTranscriptLineIndex,
  formatPlaybackTime,
  getTranscriptLineProgress,
  getTranscriptSearchResults,
} from "../helpers";
import { TranscriptWords } from "./TranscriptWords";

export function LiveTranscriptPanel({
  turns,
  wordSegmentMode,
  providerWords,
  currentTime,
  durationSeconds,
  audioDuration,
  hasProviderTurns,
  providerTurnLabel,
  duration,
  onSeek,
  onOpenFull,
}) {
  const [search, setSearch] = useState("");
  const [activeResult, setActiveResult] = useState(0);
  const lineRefs = useRef({});
  const lines = useMemo(() => buildLiveTranscriptLines({ turns, wordSegmentMode, providerWords }), [providerWords, turns, wordSegmentMode]);
  const activeLineIndex = useMemo(() => findActiveTranscriptLineIndex(lines, currentTime), [currentTime, lines]);
  const searchResults = useMemo(() => getTranscriptSearchResults(lines, search), [lines, search]);
  const focusedLineIndex = search ? searchResults[Math.min(activeResult, Math.max(0, searchResults.length - 1))]?.lineIndex : activeLineIndex;

  useEffect(() => {
    setActiveResult(0);
  }, [search]);

  useEffect(() => {
    if (activeResult > Math.max(0, searchResults.length - 1)) setActiveResult(Math.max(0, searchResults.length - 1));
  }, [activeResult, searchResults.length]);

  useEffect(() => {
    const node = lineRefs.current[focusedLineIndex];
    if (node) node.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focusedLineIndex]);

  const seekLine = (line) => {
    const time = Number(line?.startSeconds);
    if (Number.isFinite(time)) onSeek?.(Math.max(0, time));
  };

  const jumpSearch = (direction = 1) => {
    if (!searchResults.length) return;
    const next = (activeResult + direction + searchResults.length) % searchResults.length;
    setActiveResult(next);
    seekLine(searchResults[next]?.line);
  };

  const submitSearch = (event) => {
    event.preventDefault();
    if (searchResults.length) seekLine(searchResults[Math.min(activeResult, searchResults.length - 1)]?.line);
  };

  return (
    <div className="interview-live-transcript" style={{ marginTop: 14, borderRadius: 10, overflow: "hidden", border: "1px solid rgba(15,23,42,0.12)", background: "#07130d", boxShadow: "0 18px 44px rgba(15,23,42,0.12)" }}>
      <div style={{ padding: "13px 14px", display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(220px, 360px)", gap: 14, alignItems: "center", background: "linear-gradient(135deg, #07130d 0%, #10251a 44%, #13243f 100%)", borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontSize: 11, color: "rgba(226,232,240,0.72)", fontWeight: 950, textTransform: "uppercase", letterSpacing: "0.08em" }}>Transcript</div>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: "#84cc16", boxShadow: "0 0 18px rgba(132,204,22,0.72)" }} />
          </div>
          <div style={{ marginTop: 5, color: "rgba(248,250,252,0.9)", fontSize: 13, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {wordSegmentMode ? `Timestamped transcript${duration ? ` across ${duration}` : ""}` : `${turns.length} ${providerTurnLabel}${turns.length === 1 ? "" : "s"}${duration ? ` across ${duration}` : ""}`}
          </div>
        </div>
        <form onSubmit={submitSearch} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto auto", gap: 7, alignItems: "center" }}>
          <div style={{ position: "relative" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "rgba(226,232,240,0.62)" }}>
              <path d="M10.8 18.1a7.3 7.3 0 1 1 0-14.6 7.3 7.3 0 0 1 0 14.6ZM16.1 16.1 21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search transcript"
              aria-label="Search transcript"
              style={{
                width: "100%",
                boxSizing: "border-box",
                border: "1px solid rgba(226,232,240,0.18)",
                background: "rgba(255,255,255,0.1)",
                color: "#f8fafc",
                outline: "none",
                borderRadius: 999,
                padding: "9px 36px 9px 34px",
                fontFamily: "inherit",
                fontSize: 12,
                fontWeight: 800,
              }}
            />
            {search && (
              <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "rgba(226,232,240,0.68)", fontSize: 11, fontWeight: 900 }}>
                {searchResults.length ? `${Math.min(activeResult + 1, searchResults.length)}/${searchResults.length}` : "0"}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => jumpSearch(-1)}
            disabled={!searchResults.length}
            aria-label="Previous transcript search result"
            style={{ width: 32, height: 32, borderRadius: 999, border: "1px solid rgba(226,232,240,0.2)", background: "rgba(255,255,255,0.08)", color: "#f8fafc", cursor: searchResults.length ? "pointer" : "not-allowed", fontWeight: 950 }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 14 12 8l6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => jumpSearch(1)}
            disabled={!searchResults.length}
            aria-label="Next transcript search result"
            style={{ width: 32, height: 32, borderRadius: 999, border: "1px solid rgba(226,232,240,0.2)", background: "rgba(255,255,255,0.08)", color: "#f8fafc", cursor: searchResults.length ? "pointer" : "not-allowed", fontWeight: 950 }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="m6 10 6 6 6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </form>
      </div>
      {!hasProviderTurns ? (
        <div style={{ padding: 18, color: "rgba(226,232,240,0.72)", fontSize: 13 }}>
          This record was transcribed before structured turn data was stored. Replace the audio to regenerate the transcript with provider timestamps and diarization.
        </div>
      ) : (
        <>
          <div className="interview-live-transcript-scroll" style={{ position: "relative", height: 238, overflowY: "auto", padding: "22px 18px", background: "radial-gradient(circle at 14% 20%, rgba(132,204,22,0.14), transparent 28%), radial-gradient(circle at 82% 30%, rgba(56,189,248,0.12), transparent 32%), #08130f" }}>
            <div style={{ display: "grid", gap: 8 }}>
              {lines.map((line, index) => {
                const active = index === activeLineIndex;
                const focused = index === focusedLineIndex;
                const progress = active ? getTranscriptLineProgress(line, currentTime) : 0;
                return (
                  <button
                    type="button"
                    key={line.id}
                    ref={(node) => { if (node) lineRefs.current[index] = node; }}
                    onClick={() => seekLine(line)}
                    className="interview-live-transcript-line"
                    style={{
                      position: "relative",
                      border: `1px solid ${active ? "rgba(190,242,100,0.45)" : focused ? "rgba(250,204,21,0.42)" : "rgba(148,163,184,0.1)"}`,
                      background: active ? "rgba(15, 118, 58, 0.22)" : focused ? "rgba(250,204,21,0.08)" : "rgba(255,255,255,0.035)",
                      color: active ? "#f8fafc" : "rgba(226,232,240,0.78)",
                      borderRadius: 8,
                      padding: "9px 12px",
                      display: "grid",
                      gridTemplateColumns: wordSegmentMode ? "54px minmax(0, 1fr)" : "54px 88px minmax(0, 1fr)",
                      gap: 10,
                      alignItems: "start",
                      fontFamily: "inherit",
                      textAlign: "left",
                      cursor: "pointer",
                      opacity: Math.max(0.52, 1 - Math.abs(index - activeLineIndex) * 0.08),
                      transform: active ? "scale(1.012)" : "scale(1)",
                      boxShadow: active ? "0 14px 36px rgba(5, 46, 22, 0.32)" : "none",
                      transition: "border 160ms ease, background 160ms ease, color 160ms ease, transform 160ms ease, opacity 160ms ease",
                    }}
                  >
                    <span style={{ color: active ? "#bef264" : "rgba(203,213,225,0.64)", fontSize: 12, fontWeight: 950 }}>{line.timestamp || ""}</span>
                    {!wordSegmentMode && <span style={{ color: active ? "#dcfce7" : "rgba(203,213,225,0.68)", fontSize: 12, fontWeight: 950, minHeight: 18 }}>{line.speaker}</span>}
                    <span style={{ fontSize: active ? 15 : 14, lineHeight: 1.55, fontWeight: active ? 850 : 720 }}>
                      <TranscriptWords turn={line} currentTime={currentTime} searchQuery={search} tone="dark" />
                    </span>
                    {active && (
                      <span style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 2, overflow: "hidden", borderRadius: "0 0 8px 8px", background: "rgba(255,255,255,0.08)" }}>
                        <span style={{ display: "block", width: `${Math.round(progress * 100)}%`, height: "100%", background: "linear-gradient(90deg, #84cc16, #38bdf8)", transition: "width 120ms linear" }} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ padding: "9px 14px", borderTop: "1px solid rgba(255,255,255,0.1)", display: "flex", justifyContent: "space-between", alignItems: "center", color: "rgba(226,232,240,0.7)", fontSize: 12, fontWeight: 850, background: "rgba(2,6,23,0.42)" }}>
            <button type="button" onClick={onOpenFull} style={{ border: "none", background: "transparent", color: "#bef264", fontFamily: "inherit", fontSize: 12, fontWeight: 950, cursor: "pointer", padding: 0 }}>
              Open full transcript
            </button>
            <span>{formatPlaybackTime(currentTime)} / {formatPlaybackTime(durationSeconds || audioDuration)}</span>
          </div>
        </>
      )}
    </div>
  );
}
