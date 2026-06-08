import React, { useEffect, useRef, useState } from "react";
import { C } from "../../../../shared/theme";
import { Btn } from "../../../../shared/ui";
import { GUIDE_AI_WORK_STEPS } from "../constants";
import { IconButton } from "./IconButton";

export function GuideAiAssistantPanel({
  open,
  messages,
  working,
  workStepIndex,
  fieldCount,
  reviewedCount,
  onClose,
  onSubmit,
}) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    window.setTimeout(() => inputRef.current?.focus(), 80);
  }, [open]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "42px";
    input.style.height = `${Math.min(150, Math.max(42, input.scrollHeight))}px`;
  }, [draft, open]);

  if (!open) return null;

  const submit = async () => {
    const instruction = draft.trim();
    if (!instruction || working) return;
    const ok = await onSubmit?.(instruction);
    if (ok) setDraft("");
  };

  return (
    <div
      className={`interview-guide-ai-panel${working ? " is-working" : ""}`}
      style={{
        position: "absolute",
        top: 64,
        right: 18,
        zIndex: 8,
        width: "min(430px, calc(100vw - 56px))",
        maxHeight: "min(620px, calc(92vh - 104px))",
        borderRadius: 10,
        border: "1px solid rgba(148, 163, 184, 0.24)",
        background: "rgba(255,255,255,0.96)",
        boxShadow: "0 30px 90px rgba(2,6,23,0.26)",
        backdropFilter: "blur(18px)",
        display: "grid",
        gridTemplateRows: "auto minmax(0, 1fr) auto",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: 14, borderBottom: `1px solid ${C.borderLight}`, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", background: "linear-gradient(135deg, #ffffff 0%, #f8fafc 54%, #f0fdf4 100%)" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
          <div style={{ position: "relative", width: 34, height: 34, borderRadius: 9, display: "grid", placeItems: "center", background: "#052e16", color: "#bef264", fontWeight: 950, boxShadow: "0 10px 28px rgba(5,46,22,0.22)" }}>
            <span style={{ position: "absolute", inset: -4, borderRadius: 13, background: "rgba(132,204,22,0.22)", animation: working ? "interviewAiHalo 1.7s ease-in-out infinite" : "none" }} />
            <span style={{ position: "relative" }}>AI</span>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: C.text, fontWeight: 950, fontSize: 14 }}>Guide Assistant</div>
            <div style={{ marginTop: 2, color: C.textMut, fontSize: 11, fontWeight: 850 }}>{reviewedCount}/{fieldCount} responses reviewed</div>
          </div>
        </div>
        <IconButton label="Close guide assistant" onClick={onClose}>{"x"}</IconButton>
      </div>
      <div style={{ padding: 14, overflowY: "auto", display: "grid", alignContent: "start", gap: 10, background: "#fbfdff" }}>
        {messages.map((message) => (
          <div
            key={message.id}
            style={{
              justifySelf: message.role === "user" ? "end" : "start",
              maxWidth: "92%",
              borderRadius: message.role === "user" ? "10px 10px 2px 10px" : "10px 10px 10px 2px",
              border: `1px solid ${message.role === "user" ? "rgba(22,101,52,0.22)" : C.borderLight}`,
              background: message.role === "user" ? "#ecfdf5" : "#fff",
              color: C.text,
              padding: "10px 11px",
              boxShadow: "0 10px 24px rgba(15,23,42,0.05)",
            }}
          >
            <div style={{ fontSize: 12, lineHeight: 1.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{message.body}</div>
            {Array.isArray(message.bullets) && message.bullets.length > 0 && (
              <ul style={{ margin: "8px 0 0", paddingLeft: 18, display: "grid", gap: 5, color: C.textSec, fontSize: 12, lineHeight: 1.45 }}>
                {message.bullets.map((item, index) => <li key={index}>{item}</li>)}
              </ul>
            )}
          </div>
        ))}
        {working && (
          <div style={{ border: `1px solid ${C.borderLight}`, borderRadius: 10, background: "#fff", padding: 12, display: "grid", gap: 10, boxShadow: "0 10px 24px rgba(15,23,42,0.05)" }}>
            <div style={{ display: "flex", gap: 5, alignItems: "center", color: C.pri, fontSize: 12, fontWeight: 950 }}>
              <span>Working</span>
              <span className="interview-ai-dot" style={{ width: 4, height: 4, borderRadius: 999, background: C.pri }} />
              <span className="interview-ai-dot" style={{ width: 4, height: 4, borderRadius: 999, background: C.pri }} />
              <span className="interview-ai-dot" style={{ width: 4, height: 4, borderRadius: 999, background: C.pri }} />
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              {GUIDE_AI_WORK_STEPS.map((step, index) => {
                const done = index < workStepIndex;
                const active = index === workStepIndex;
                return (
                  <div key={step} style={{ display: "grid", gridTemplateColumns: "18px minmax(0, 1fr)", gap: 8, alignItems: "center", color: done || active ? C.text : C.textMut, fontSize: 12, fontWeight: active ? 950 : 800 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 999, background: done ? C.suc : active ? "#84cc16" : C.border, boxShadow: active ? "0 0 18px rgba(132,204,22,0.48)" : "none" }} />
                    <span>{step}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <div style={{ padding: 12, borderTop: `1px solid ${C.borderLight}`, background: "#fff" }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 8, alignItems: "end" }}>
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            placeholder="Tell AI what to infer across this guide"
            rows={1}
            disabled={working}
            style={{
              width: "100%",
              minHeight: 42,
              maxHeight: 150,
              boxSizing: "border-box",
              border: `1.5px solid ${C.border}`,
              borderRadius: 9,
              padding: "10px 11px",
              resize: "none",
              overflowY: "auto",
              outline: "none",
              fontFamily: "inherit",
              fontSize: 13,
              lineHeight: 1.45,
              color: C.text,
              background: working ? C.surfaceHover : "#fff",
            }}
          />
          <Btn variant="primary" size="sm" onClick={submit} disabled={working || !draft.trim()}>{working ? "Running" : "Send"}</Btn>
        </div>
      </div>
    </div>
  );
}
