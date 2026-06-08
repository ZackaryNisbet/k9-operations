import React from "react";
import { C } from "../../../../shared/theme";

export function InterviewStyles() {
  return (
    <style>{`
      @keyframes interviewWaveFloat {
        0%, 100% { transform: scaleY(0.42); opacity: 0.52; }
        50% { transform: scaleY(1); opacity: 1; }
      }
      @keyframes interviewWaveGlow {
        0%, 100% { transform: translateX(-8%) scaleX(0.9); opacity: 0.28; }
        50% { transform: translateX(8%) scaleX(1.06); opacity: 0.72; }
      }
      @keyframes interviewSignalTravel {
        0% { transform: translateX(-18%); opacity: 0; }
        12% { opacity: 0.92; }
        88% { opacity: 0.92; }
        100% { transform: translateX(118%); opacity: 0; }
      }
      @keyframes interviewParticleFloat {
        0%, 100% { transform: translate3d(0, 0, 0) scale(0.82); opacity: 0.22; }
        50% { transform: translate3d(0, -10px, 0) scale(1); opacity: 0.82; }
      }
      @keyframes interviewScan {
        0% { transform: translateX(-26%); opacity: 0; }
        18% { opacity: 0.95; }
        82% { opacity: 0.95; }
        100% { transform: translateX(126%); opacity: 0; }
      }
      @keyframes interviewCompletePulse {
        0% { transform: scale(0.98); box-shadow: 0 0 0 0 rgba(22, 163, 74, 0.24); }
        70% { transform: scale(1); box-shadow: 0 0 0 18px rgba(22, 163, 74, 0); }
        100% { transform: scale(0.98); box-shadow: 0 0 0 0 rgba(22, 163, 74, 0); }
      }
      @keyframes interviewPanelEnter {
        0% { opacity: 0; transform: translateY(14px) scale(0.992); filter: blur(3px); }
        100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
      }
      @keyframes interviewDetailEnter {
        0% { opacity: 0; transform: translate3d(0, 18px, 0) scale(0.988); filter: blur(7px); }
        64% { opacity: 1; transform: translate3d(0, -1px, 0) scale(1.001); filter: blur(0); }
        100% { opacity: 1; transform: translate3d(0, 0, 0) scale(1); filter: blur(0); }
      }
      @keyframes interviewRowEnter {
        0% { opacity: 0; transform: translate3d(0, 10px, 0); }
        100% { opacity: 1; transform: translate3d(0, 0, 0); }
      }
      @keyframes interviewCardSheen {
        0% { transform: translateX(-120%) skewX(-18deg); opacity: 0; }
        26% { opacity: 0.48; }
        60% { opacity: 0.16; }
        100% { transform: translateX(140%) skewX(-18deg); opacity: 0; }
      }
      @keyframes interviewModalEnter {
        0% { opacity: 0; transform: translateY(18px) scale(0.985); filter: blur(5px); }
        100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
      }
      @keyframes interviewAiAssistantEnter {
        0% { opacity: 0; transform: translateY(-10px) scale(0.97); filter: blur(6px); }
        100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
      }
      @keyframes interviewAiHalo {
        0%, 100% { opacity: 0.44; transform: scale(0.96); }
        50% { opacity: 0.88; transform: scale(1.04); }
      }
      @keyframes interviewAiSweep {
        0% { transform: translateX(-120%); opacity: 0; }
        15% { opacity: 0.75; }
        85% { opacity: 0.75; }
        100% { transform: translateX(120%); opacity: 0; }
      }
      @keyframes interviewAiDot {
        0%, 100% { transform: translateY(0); opacity: 0.4; }
        50% { transform: translateY(-3px); opacity: 1; }
      }
      @keyframes interviewBackdropIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      .interview-roster-shell {
        display: grid;
        gap: 14px;
        animation: interviewPanelEnter 300ms cubic-bezier(0.22, 1, 0.36, 1);
      }
      .interview-roster-toolbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 14px;
        flex-wrap: wrap;
      }
      .interview-search-block {
        display: flex;
        flex-direction: column;
      }
      .interview-search-bar {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 0 14px;
        background: ${C.bg};
        border-bottom: 1.5px solid ${C.borderLight};
      }
      .interview-search-field {
        flex: 1 1 auto;
        min-width: 0;
        border: none;
        outline: none;
        background: transparent;
        font-family: inherit;
        font-size: 13px;
        font-weight: 500;
        color: ${C.text};
        padding: 12px 4px;
      }
      .interview-search-field::placeholder {
        color: #94a3b8;
        font-weight: 500;
        opacity: 1;
      }
      .interview-search-clear {
        border: none;
        background: transparent;
        color: #94a3b8;
        cursor: pointer;
        font-size: 18px;
        line-height: 1;
        padding: 0 4px;
        flex-shrink: 0;
      }
      .interview-search-clear:hover {
        color: ${C.textSec};
      }
      .interview-explainer {
        padding: 10px 16px;
        background: linear-gradient(135deg, rgba(20, 83, 45, 0.06), #ffffff);
        font-size: 12px;
        line-height: 1.6;
        color: ${C.textSec};
      }
      .interview-table-shell {
        border: 1px solid rgba(226, 232, 240, 0.98);
        border-radius: 8px;
        overflow-x: auto;
        background: #fff;
        box-shadow: 0 18px 48px rgba(15, 23, 42, 0.055);
      }
      .interview-roster-header {
        background: linear-gradient(180deg, #f8fafc, #f1f5f9);
      }
      .interview-row {
        position: relative;
        overflow: hidden;
        transition: transform 230ms cubic-bezier(0.22, 1, 0.36, 1), background 180ms ease, box-shadow 230ms ease;
        animation: interviewRowEnter 260ms cubic-bezier(0.22, 1, 0.36, 1) both;
      }
      .interview-row::before {
        content: "";
        position: absolute;
        inset: 0 auto 0 0;
        width: 3px;
        background: linear-gradient(180deg, #84cc16, #14532d);
        opacity: 0;
        transition: opacity 200ms ease;
      }
      .interview-row:hover {
        background: linear-gradient(90deg, rgba(240,253,244,0.94), #ffffff 46%);
        transform: translateY(-1px);
        box-shadow: 0 14px 32px rgba(15, 23, 42, 0.06);
      }
      .interview-row:hover::before { opacity: 1; }
      .interview-open-pill {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 58px;
        height: 30px;
        border-radius: 999px;
        color: #14532d;
        background: rgba(220, 252, 231, 0.72);
        transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1), background 220ms ease, color 220ms ease;
      }
      .interview-row:hover .interview-open-pill {
        transform: translateX(3px);
        color: #fff;
        background: #14532d;
      }
      .interview-detail-shell {
        display: grid;
        gap: 16px;
        animation: interviewDetailEnter 360ms cubic-bezier(0.22, 1, 0.36, 1);
      }
      .interview-detail-card {
        position: relative;
        overflow: hidden;
        box-shadow: 0 18px 48px rgba(15, 23, 42, 0.055);
        transition: transform 240ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 240ms ease, border-color 240ms ease;
      }
      .interview-detail-card::after {
        content: "";
        position: absolute;
        top: 0;
        bottom: 0;
        left: 0;
        width: 34%;
        pointer-events: none;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,0.42), transparent);
        transform: translateX(-140%) skewX(-18deg);
        opacity: 0;
      }
      .interview-detail-card:hover {
        transform: translateY(-1px);
        box-shadow: 0 24px 60px rgba(15, 23, 42, 0.075);
        border-color: rgba(20, 83, 45, 0.22) !important;
      }
      .interview-detail-card:hover::after { animation: interviewCardSheen 900ms cubic-bezier(0.22, 1, 0.36, 1); }
      .interview-action-card:hover { transform: translateY(-1px); box-shadow: 0 14px 34px rgba(15, 23, 42, 0.08); }
      .interview-audio-stage:hover .interview-audio-overlay {
        opacity: 1;
        pointer-events: auto;
      }
      .interview-audio-overlay {
        opacity: 0;
        pointer-events: none;
      }
      .interview-audio-stage:hover .interview-audio-bars {
        filter: blur(2.5px) saturate(1.12);
        transform: scale(0.99);
      }
      .interview-audio-stage:hover .interview-audio-signal {
        filter: blur(1.5px);
        opacity: 0.42;
      }
      .interview-modal-backdrop {
        position: fixed;
        top: 0;
        right: 0;
        bottom: 0;
        left: 86px;
        z-index: 30000;
        background: rgba(15, 23, 42, 0.54);
        backdrop-filter: blur(14px);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 26px;
        animation: interviewBackdropIn 180ms ease-out;
      }
      .interview-immersive-shell {
        position: relative;
        width: min(1480px, 94vw);
        height: min(900px, 92vh);
        background: #ffffff;
        border: 1px solid rgba(226, 232, 240, 0.9);
        border-radius: 8px;
        overflow: hidden;
        box-shadow: 0 26px 80px rgba(2, 6, 23, 0.28);
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
        animation: interviewModalEnter 260ms cubic-bezier(0.22, 1, 0.36, 1);
      }
      .interview-transcript-line:hover { border-color: #cbd5e1; background: #ffffff; }
      .interview-question-rail-line:hover .interview-question-tooltip {
        opacity: 1;
        transform: translate(0, -50%);
      }
      .interview-pdf-field-hotspot:hover {
        border-color: rgba(22, 101, 52, 0.72) !important;
        background: rgba(22, 163, 74, 0.1) !important;
      }
      .interview-live-transcript-line:hover {
        border-color: rgba(190, 242, 100, 0.34) !important;
        background: rgba(255,255,255,0.075) !important;
      }
      .interview-live-transcript-scroll {
        scrollbar-width: thin;
        scrollbar-color: rgba(190, 242, 100, 0.34) rgba(255,255,255,0.04);
      }
      .interview-new-dialog {
        width: min(1120px, 94vw);
        height: min(540px, calc(100vh - 64px));
        max-height: calc(100vh - 64px);
        background: #ffffff;
        border: 1px solid rgba(226, 232, 240, 0.92);
        border-radius: 8px;
        overflow: hidden;
        box-shadow: 0 26px 80px rgba(2, 6, 23, 0.28);
        display: grid;
        grid-template-rows: auto minmax(0, 1fr) auto;
        animation: interviewModalEnter 260ms cubic-bezier(0.22, 1, 0.36, 1);
      }
      .interview-new-body {
        min-height: 0;
        overflow: auto;
        padding: 18px;
        background: linear-gradient(180deg, #f8fafc 0%, #ffffff 46%);
      }
      .interview-new-grid {
        display: grid;
        grid-template-columns: minmax(260px, 340px) minmax(0, 1fr);
        gap: 16px;
        align-items: start;
      }
      .interview-field-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }
      .interview-template-option:hover,
      .interview-workspace-tile:hover {
        transform: translateY(-1px);
        box-shadow: 0 14px 34px rgba(15, 23, 42, 0.08);
      }
      .interview-resume-frame {
        width: 100%;
        height: min(62vh, 720px);
        border: 0;
        background: #ffffff;
      }
      .interview-resume-shell {
        min-height: 0;
        display: grid;
        grid-template-columns: minmax(0, 1fr) 280px;
        gap: 16px;
        padding: 18px;
        background: #f8fafc;
        overflow: auto;
      }
      .interview-config-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 12px;
      }
      .interview-config-row {
        min-width: 0;
        display: grid;
        grid-template-columns: minmax(280px, 0.95fr) minmax(380px, 1.35fr) auto;
        gap: 16px;
        align-items: center;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        background: #fff;
        padding: 14px;
      }
      .interview-config-role,
      .interview-pay-editor {
        min-width: 0;
      }
      .interview-pay-editor {
        display: grid;
        gap: 8px;
      }
      .interview-pay-fields {
        min-width: 0;
        display: grid;
        grid-template-columns: minmax(84px, 120px) minmax(84px, 120px) minmax(180px, 1fr);
        gap: 10px;
        align-items: end;
      }
      .interview-config-actions {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
        flex-wrap: wrap;
      }
      .interview-guide-ai-panel {
        animation: interviewAiAssistantEnter 220ms cubic-bezier(0.22, 1, 0.36, 1);
      }
      .interview-guide-ai-panel::before {
        content: "";
        position: absolute;
        inset: 0;
        border-radius: 10px;
        pointer-events: none;
        background: linear-gradient(110deg, transparent 0%, rgba(132, 204, 22, 0.16) 42%, rgba(56, 189, 248, 0.12) 52%, transparent 64%);
        opacity: 0;
      }
      .interview-guide-ai-panel.is-working::before {
        animation: interviewAiSweep 1.9s ease-in-out infinite;
      }
      .interview-ai-dot {
        animation: interviewAiDot 1s ease-in-out infinite;
      }
      .interview-ai-dot:nth-child(2) { animation-delay: 140ms; }
      .interview-ai-dot:nth-child(3) { animation-delay: 280ms; }
      @media (prefers-reduced-motion: reduce) {
        .interview-row,
        .interview-roster-shell,
        .interview-detail-shell,
        .interview-detail-card:hover::after,
        .interview-new-dialog,
        .interview-immersive-shell,
        .interview-modal-backdrop { animation: none !important; }
        .interview-row,
        .interview-detail-card,
        .interview-open-pill { transition: none !important; }
      }
      @media (max-width: 920px) {
        .interview-modal-backdrop { left: 0; }
        .interview-immersive-shell { width: 96vw; height: 94vh; }
        .interview-new-dialog { width: 96vw; max-height: 94vh; }
        .interview-new-grid,
        .interview-resume-shell { grid-template-columns: 1fr; }
        .interview-config-row { grid-template-columns: 1fr; align-items: stretch; }
        .interview-pay-fields { grid-template-columns: 1fr 1fr; }
        .interview-pay-fields > label:last-child { grid-column: 1 / -1; }
        .interview-config-actions { justify-content: flex-start; }
        .interview-field-grid { grid-template-columns: 1fr; }
        .interview-resume-frame { height: 62vh; }
        .interview-guide-grid { grid-template-columns: 1fr !important; overflow-y: auto; }
        .interview-guide-pdf { min-height: 520px; }
        .interview-roster-table { min-width: 780px; }
        .interview-guide-ai-panel { left: 14px !important; right: 14px !important; width: auto !important; }
      }
    `}</style>
  );
}
