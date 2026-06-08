import React, { useEffect, useMemo, useState } from "react";
import { C } from "../../../../shared/theme";
import { Btn } from "../../../../shared/ui";
import {
  INTERVIEW_AUDIO_ACCEPT,
  INTERVIEW_TRANSCRIPT_ACCEPT,
} from "../../../interviewData";
import { INTERVIEW_WAVEFORM_BAR_COUNT } from "../constants";
import {
  buildTranscriptTimelineWaveBars,
  extractAudioWaveformBars,
  formatDuration,
  formatFileSize,
  formatPlaybackTime,
  seededWaveBars,
  shouldDecodeAudioWaveform,
  wordsFromProviderSegments,
} from "../helpers";
import { LiveTranscriptPanel } from "./LiveTranscriptPanel";

export function AudioUploadPanel({
  record,
  audioFileName,
  transcribing,
  drafting,
  onUpload,
  onTranscriptUpload,
  onTranscriptPasteOpen,
  onTranscriptClick,
  inputRef,
  transcriptInputRef,
  audioRef,
  audioUrl,
  audioPlaying,
  currentTime,
  audioDuration,
  transcriptTurns = [],
  onPlayToggle,
  onAudioSeek,
  onAudioTimeUpdate,
  onAudioLoadedMetadata,
  onAudioEnded,
  onAudioError,
  canUpload = true,
}) {
  const sourceAudio = record?.metadata?.audio_transcription?.source_audio || {};
  const transcription = record?.metadata?.audio_transcription || {};
  const fileName = audioFileName || sourceAudio.original_file_name || sourceAudio.file_name || "";
  const durationSeconds = Number(transcription.duration_seconds || audioDuration || 0);
  const duration = formatDuration(durationSeconds);
  const sourceAudioSizeBytes = Number(sourceAudio.original_size_bytes || sourceAudio.size_bytes || 0);
  const fileSize = formatFileSize(sourceAudioSizeBytes);
  const complete = !!record?.transcript_text && !transcribing && !drafting;
  const fallbackBars = useMemo(() => seededWaveBars(`${record?.id || ""}:${fileName}`, INTERVIEW_WAVEFORM_BAR_COUNT), [record?.id, fileName]);
  const [audioWaveformBars, setAudioWaveformBars] = useState([]);
  const [audioWaveformStatus, setAudioWaveformStatus] = useState("idle");
  const safeTranscriptTurns = Array.isArray(transcriptTurns) ? transcriptTurns : [];
  const transcriptTimelineBars = useMemo(
    () => buildTranscriptTimelineWaveBars(safeTranscriptTurns, durationSeconds, INTERVIEW_WAVEFORM_BAR_COUNT),
    [durationSeconds, safeTranscriptTurns]
  );
  const canDecodeWaveform = shouldDecodeAudioWaveform({ durationSeconds, fileSizeBytes: sourceAudioSizeBytes });
  const bars = audioWaveformBars.length ? audioWaveformBars : transcriptTimelineBars.length ? transcriptTimelineBars : fallbackBars;
  const hasProviderTurns = safeTranscriptTurns.length > 0;
  const segmentationSource = String(transcription.segmentation_source || "");
  const wordSegmentMode = segmentationSource === "xai_word_segments" && safeTranscriptTurns.length > 40 && !safeTranscriptTurns.some((turn) => /^(Speaker|Person)\s+\d+/i.test(turn.speaker || ""));
  const providerTurnLabel = wordSegmentMode ? "timeline row" : "speaker turn";
  const providerWords = useMemo(() => wordSegmentMode ? wordsFromProviderSegments(safeTranscriptTurns) : [], [safeTranscriptTurns, wordSegmentMode]);

  useEffect(() => {
    setAudioWaveformBars([]);
    const fallbackStatus = transcriptTimelineBars.length ? "timeline" : "fallback";
    if (!audioUrl) {
      setAudioWaveformStatus(transcriptTimelineBars.length ? "timeline" : "idle");
      return undefined;
    }
    if (!canDecodeWaveform) {
      setAudioWaveformStatus(fallbackStatus);
      return undefined;
    }

    const controller = new AbortController();
    let cancelled = false;
    let idleHandle = null;
    let timeoutHandle = null;
    setAudioWaveformStatus(transcriptTimelineBars.length ? "timeline" : "idle");

    const startWaveformAnalysis = () => {
      if (cancelled || controller.signal.aborted) return;
      setAudioWaveformStatus("loading");
      extractAudioWaveformBars(audioUrl, { count: INTERVIEW_WAVEFORM_BAR_COUNT, signal: controller.signal })
        .then((nextBars) => {
          if (cancelled || controller.signal.aborted) return;
          if (nextBars?.length) {
            setAudioWaveformBars(nextBars);
            setAudioWaveformStatus("ready");
          } else {
            setAudioWaveformStatus(fallbackStatus);
          }
        })
        .catch(() => {
          if (!cancelled && !controller.signal.aborted) setAudioWaveformStatus(fallbackStatus);
        });
    };

    if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
      idleHandle = window.requestIdleCallback(startWaveformAnalysis, { timeout: 2500 });
    } else {
      timeoutHandle = window.setTimeout(startWaveformAnalysis, 350);
    }

    return () => {
      cancelled = true;
      controller.abort();
      if (idleHandle != null && typeof window !== "undefined" && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleHandle);
      }
      if (timeoutHandle != null && typeof window !== "undefined") {
        window.clearTimeout(timeoutHandle);
      }
    };
  }, [audioUrl, canDecodeWaveform, transcriptTimelineBars.length]);

  const handleDrop = (event) => {
    event.preventDefault();
    if (!canUpload) return;
    const file = event.dataTransfer.files?.[0];
    if (file) onUpload(file);
  };

  const seekTranscript = (time) => {
    const nextTime = Number(time || 0);
    if (onAudioSeek) {
      onAudioSeek(nextTime);
      return;
    }
    if (audioRef.current) audioRef.current.currentTime = nextTime;
    onAudioTimeUpdate({ currentTarget: { currentTime: nextTime } });
  };

  return (
    <div
      className="interview-detail-card"
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
      style={{
        position: "relative",
        overflow: "hidden",
        border: `1px solid ${complete ? "#bbf7d0" : C.border}`,
        borderRadius: 8,
        background: "linear-gradient(135deg, #ffffff 0%, #f8fafc 48%, #f0fdf4 100%)",
        padding: 18,
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={INTERVIEW_AUDIO_ACCEPT}
        disabled={!canUpload}
        style={{ display: "none" }}
        onChange={(event) => {
          if (!canUpload) return;
          onUpload(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <input
        ref={transcriptInputRef}
        type="file"
        accept={INTERVIEW_TRANSCRIPT_ACCEPT}
        disabled={!canUpload}
        style={{ display: "none" }}
        onChange={(event) => {
          if (!canUpload) return;
          onTranscriptUpload?.(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 16, alignItems: "center" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 900, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.06em" }}>Upload Interview Audio</div>
          <div style={{ marginTop: 4, fontSize: 18, fontWeight: 950, color: C.text }}>{drafting ? "Populating interview notes" : transcribing ? "Reading the conversation" : complete ? "Audio processed" : "Drop an audio file here"}</div>
          <div style={{ marginTop: 8, display: "flex", gap: 10, color: C.textMut, fontSize: 12, flexWrap: "wrap" }}>
            <span>{fileName || "M4A, MP3, WAV, MP4, MKV"}</span>
            {duration && <span>{duration}</span>}
            {fileSize && <span>{fileSize}</span>}
            {audioWaveformStatus === "loading" && <span>Analyzing waveform</span>}
            {audioWaveformStatus === "ready" && <span>Audio-derived waveform</span>}
            {audioWaveformStatus === "timeline" && <span>Transcript timeline</span>}
            {record?.transcript_text && <span>{hasProviderTurns ? (wordSegmentMode ? "Timestamped transcript" : `${safeTranscriptTurns.length} ${providerTurnLabel}${safeTranscriptTurns.length === 1 ? "" : "s"}`) : "turn data required"}</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Btn variant={complete ? "success" : "primary"} onClick={() => inputRef.current?.click()} disabled={!canUpload || transcribing || drafting}>
            {transcribing || drafting ? "Processing..." : complete ? "Replace Audio" : "Choose File"}
          </Btn>
          <Btn variant="secondary" onClick={() => transcriptInputRef.current?.click()} disabled={!canUpload || transcribing || drafting}>Upload Transcript</Btn>
          <Btn variant="secondary" onClick={onTranscriptPasteOpen} disabled={!canUpload || transcribing || drafting}>Paste Transcript</Btn>
        </div>
      </div>
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="metadata"
          onTimeUpdate={onAudioTimeUpdate}
          onLoadedMetadata={onAudioLoadedMetadata}
          onEnded={onAudioEnded}
          onError={onAudioError}
          style={{ display: "none" }}
        />
      )}
      <div
        className={`interview-audio-stage${audioPlaying ? " is-playing" : ""}`}
        onClick={audioUrl ? onPlayToggle : undefined}
        style={{
          marginTop: 18,
          height: 176,
          borderRadius: 8,
          background: "linear-gradient(135deg, #07130d 0%, #0f2f20 42%, #13243f 100%)",
          border: "1px solid rgba(20,83,45,0.26)",
          overflow: "hidden",
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 20px",
          cursor: audioUrl ? "pointer" : "default",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12), 0 18px 42px rgba(15,23,42,0.08)",
        }}
      >
        <div style={{ position: "absolute", inset: 0, opacity: 0.94, background: "radial-gradient(circle at 22% 52%, rgba(132,204,22,0.24), transparent 30%), radial-gradient(circle at 78% 38%, rgba(56,189,248,0.22), transparent 32%), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(0deg, rgba(255,255,255,0.025) 1px, transparent 1px)", backgroundSize: "auto, auto, 38px 38px, 38px 38px" }} />
        <div style={{ position: "absolute", left: 16, right: 16, top: 18, height: 1, background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.34), transparent)" }} />
        <div style={{ position: "absolute", left: 16, right: 16, bottom: 18, height: 1, background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.22), transparent)" }} />
        <div
          className="interview-audio-signal"
          style={{
            position: "absolute",
            left: "-12%",
            top: 0,
            bottom: 0,
            width: "42%",
            background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.06), rgba(132,204,22,0.22), rgba(56,189,248,0.14), transparent)",
            animation: (transcribing || drafting || audioPlaying) ? "interviewSignalTravel 2.8s linear infinite" : "interviewWaveGlow 4.8s ease-in-out infinite",
            transition: "filter 180ms ease, opacity 180ms ease",
          }}
        />
        {bars.slice(0, 20).map((bar, index) => (
          <span
            key={`particle-${index}`}
            style={{
              position: "absolute",
              left: `${5 + index * 4.7}%`,
              top: `${18 + ((bar.height + index * 11) % 50)}%`,
              width: 3 + (index % 3),
              height: 3 + (index % 3),
              borderRadius: 999,
              background: index % 2 ? "rgba(132,204,22,0.72)" : "rgba(125,211,252,0.72)",
              boxShadow: index % 2 ? "0 0 18px rgba(132,204,22,0.55)" : "0 0 18px rgba(125,211,252,0.52)",
              animation: `interviewParticleFloat ${2.2 + (index % 6) * 0.24}s ease-in-out ${bar.delay}s infinite`,
            }}
          />
        ))}
        {(transcribing || drafting) && <div style={{ position: "absolute", top: 0, bottom: 0, width: "34%", background: "linear-gradient(90deg, transparent, rgba(20,83,45,0.12), transparent)", animation: "interviewScan 2.4s linear infinite" }} />}
        {complete && <div style={{ position: "absolute", right: 16, top: 16, width: 12, height: 12, borderRadius: 99, background: C.suc, animation: "interviewCompletePulse 1.8s ease-out infinite" }} />}
        <div style={{ position: "absolute", left: 24, top: 18, zIndex: 1, color: "rgba(255,255,255,0.66)", fontSize: 10, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase" }}>
          {audioWaveformStatus === "ready" ? "Audio Fingerprint" : audioWaveformStatus === "loading" ? "Analyzing Audio" : audioWaveformStatus === "timeline" ? "Transcript Timeline" : "Interview Audio"}
        </div>
        <div style={{ position: "absolute", right: 24, bottom: 18, zIndex: 1, color: "rgba(255,255,255,0.62)", fontSize: 11, fontWeight: 850 }}>
          {formatPlaybackTime(currentTime)} / {formatPlaybackTime(durationSeconds || audioDuration)}
        </div>
        <div className="interview-audio-bars" style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 3, width: "100%", height: 112, justifyContent: "center", transition: "filter 180ms ease, transform 180ms ease" }}>
          {bars.map((bar, index) => (
            <div
              key={index}
              style={{
                width: index % 7 === 0 ? 6 : 4,
                height: bar.height,
                borderRadius: 99,
                background: index % 4 === 0
                  ? "linear-gradient(180deg, #f8fafc, #84cc16)"
                  : index % 4 === 1
                    ? "linear-gradient(180deg, #bae6fd, #38bdf8)"
                    : index % 4 === 2
                      ? "linear-gradient(180deg, #d9f99d, #16a34a)"
                      : "linear-gradient(180deg, rgba(255,255,255,0.82), rgba(148,163,184,0.44))",
                opacity: Math.min(1, bar.opacity + 0.12),
                transformOrigin: "center",
                boxShadow: index % 5 === 0 ? "0 0 18px rgba(132,204,22,0.36)" : "none",
                animation: transcribing || drafting || audioPlaying ? `interviewWaveFloat ${bar.duration}s ease-in-out ${bar.delay}s infinite` : "none",
              }}
            />
          ))}
        </div>
        <div
          className="interview-audio-overlay"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 2,
            transition: "opacity 180ms ease",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(2,6,23,0.48)",
            backdropFilter: "blur(8px)",
            padding: 16,
          }}
        >
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onPlayToggle?.();
            }}
            disabled={!audioUrl}
            aria-label={audioPlaying ? "Pause interview audio" : "Play interview audio"}
            style={{
              justifySelf: "center",
              width: 58,
              height: 58,
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.58)",
              background: "rgba(255,255,255,0.96)",
              color: "#fff",
              fontSize: 22,
              fontWeight: 900,
              cursor: audioUrl ? "pointer" : "not-allowed",
              boxShadow: "0 18px 48px rgba(2,6,23,0.34)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {audioPlaying ? (
              <svg width="23" height="23" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="6" y="5" width="4" height="14" rx="1.5" fill={C.pri} />
                <rect x="14" y="5" width="4" height="14" rx="1.5" fill={C.pri} />
              </svg>
            ) : (
              <svg width="25" height="25" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ marginLeft: 2 }}>
                <path d="M8 5.8v12.4c0 .9 1 1.45 1.76.96l9.62-6.2a1.14 1.14 0 0 0 0-1.92L9.76 4.84C9 4.35 8 4.9 8 5.8Z" fill={C.pri} />
              </svg>
            )}
          </button>
        </div>
      </div>
      {audioUrl && (
        <div
          style={{
            marginTop: 10,
            display: "grid",
            gridTemplateColumns: "54px minmax(0, 1fr) 54px",
            gap: 10,
            alignItems: "center",
            color: C.textSec,
            fontSize: 12,
            fontWeight: 850,
          }}
        >
          <span>{formatPlaybackTime(currentTime)}</span>
          <input
            type="range"
            min="0"
            max={Math.max(1, durationSeconds || audioDuration || 1)}
            step="0.1"
            value={Math.min(currentTime, durationSeconds || audioDuration || currentTime || 0)}
            disabled={!audioUrl}
            onChange={(event) => {
              const nextTime = Number(event.target.value || 0);
              if (onAudioSeek) {
                onAudioSeek(nextTime);
                return;
              }
              if (audioRef.current) audioRef.current.currentTime = nextTime;
              onAudioTimeUpdate({ currentTarget: { currentTime: nextTime } });
            }}
            style={{
              width: "100%",
              accentColor: "#84cc16",
              cursor: "pointer",
            }}
          />
          <span style={{ textAlign: "right" }}>{formatPlaybackTime(durationSeconds || audioDuration)}</span>
        </div>
      )}
      {record?.transcript_text && (
        <LiveTranscriptPanel
          turns={safeTranscriptTurns}
          wordSegmentMode={wordSegmentMode}
          providerWords={providerWords}
          currentTime={currentTime}
          durationSeconds={durationSeconds}
          audioDuration={audioDuration}
          hasProviderTurns={hasProviderTurns}
          providerTurnLabel={providerTurnLabel}
          duration={duration}
          onSeek={seekTranscript}
          onOpenFull={onTranscriptClick}
        />
      )}
    </div>
  );
}
