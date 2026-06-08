import { C } from "../constants/colors";
import { K9LoadingAnimation } from "../components/K9LoadingAnimation";
import { gid } from "../lib/format";
import { renderAIFormattedText } from "../lib/aiText";
import { OPS_MANUAL_KB } from "../constants/opsManual";
import { findOpsManualAnswer } from "../lib/opsManual";
import { supabase } from "../../supabaseClient";
import { useEffect, useRef, useState } from "react";

function AIAssistantPage({ data, save, nav, profile }) {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const conversationHistory = messages.map(m => ({
    role: m.role,
    content: m.text
  }));

  const starterQueries = [
    "What's my revenue this month?",
    "What's the dress code?",
    "Explain the collar colors",
    "How many dogs are due for vaccines?"
  ];

  const handleSendMessage = async (messageText) => {
    const textToSend = messageText || inputValue;
    if (!textToSend.trim()) return;

    const userMessage = {
      id: gid(),
      role: "user",
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    };
    setMessages(prev => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);

    // Operations Manual: answer policy/procedure questions instantly from the local
    // knowledge base (hours, dress code, collar system, belongings, …). Live-data
    // questions (revenue, schedules, counts) fall through to the edge function below.
    const manualEntry = findOpsManualAnswer(OPS_MANUAL_KB, textToSend);
    if (manualEntry) {
      const manualMsg = {
        id: gid(),
        role: "assistant",
        text: `**${manualEntry.title}**\n\n${String(manualEntry.answer || "").replace(/\n/g, "\n\n")}`,
        source: "manual",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      };
      setMessages(prev => [...prev, manualMsg]);
      setIsLoading(false);
      return;
    }

    try {
      const { data: result, error } = await supabase.functions.invoke("ai-assistant", {
        body: {
          query: textToSend,
          conversationHistory,
          locationId: data._locationId || profile?.location_id,
          userId: profile?.id
        }
      });

      console.log("[K9 AI Chat] invoke result:", { result, error });
      if (error) {
        console.error("[K9 AI Chat] Edge function error:", error);
        const errDetail = error?.message || error?.context?.body || (typeof error === "string" ? error : JSON.stringify(error));
        const errorMsg = {
          id: gid(),
          role: "assistant",
          text: "Error: " + errDetail,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        };
        setMessages(prev => [...prev, errorMsg]);
      } else {
        // Map structured data from edge function format to frontend format
        let mappedStructured = null;
        if (result?.structured) {
          const s = result.structured;
          mappedStructured = {
            type: s.type,
            title: s.title,
            subtitle: s.subtitle,
            message: s.message,
            followUps: s.followUps,
            // Map data fields for tables and other types
            columns: s.data?.headers,
            rows: s.data?.rows,
            value: s.data?.value,
            label: s.data?.label,
            change: s.data?.change,
            items: s.data?.items
          };
        }

        const assistantMsg = {
          id: gid(),
          role: "assistant",
          text: result?.response || "I'm ready to help.",
          structured: mappedStructured,
          suggestions: result?.followUps || [],
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        };
        setMessages(prev => [...prev, assistantMsg]);
      }
    } catch (err) {
      const errorMsg = {
        id: gid(),
        role: "assistant",
        text: "Unable to reach the AI service. Please try again.",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggestionClick = (suggestion) => {
    setInputValue(suggestion);
  };

  const renderStructuredData = (structured) => {
    if (!structured) return null;

    switch (structured.type) {
      case "table":
        return (
          <div style={{ marginTop: 12, background: C.bg, borderRadius: 8, padding: 12, border: `1px solid ${C.border}` }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {structured.columns?.map((col, i) => (
                    <th key={i} style={{ padding: "8px", textAlign: i === 0 ? "left" : "right", fontWeight: 700, color: C.textMut, fontSize: 11, textTransform: "uppercase" }}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {structured.rows?.slice(0, 10).map((row, ri) => (
                  <tr key={ri} style={{ borderBottom: `1px solid ${C.borderLight}`, background: ri % 2 === 0 ? C.bg : "transparent" }}>
                    {row.map((cell, ci) => (
                      <td key={ci} style={{ padding: "8px", color: C.text, textAlign: ci === 0 ? "left" : "right" }}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );

      case "metric":
        return (
          <div style={{ marginTop: 12, padding: 16, background: C.bg, borderRadius: 8, border: `1px solid ${C.border}`, textAlign: "center" }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: C.pri, marginBottom: 4 }}>
              {structured.value}
            </div>
            <div style={{ fontSize: 12, color: C.textMut }}>{structured.label}</div>
            {structured.change !== undefined && (
              <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: structured.change >= 0 ? C.suc : C.dan }}>
                {structured.change >= 0 ? "↑" : "↓"} {Math.abs(structured.change).toFixed(1)}%
              </div>
            )}
          </div>
        );

      case "summary":
        return (
          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 8 }}>
            {structured.items?.map((item, i) => (
              <div key={i} style={{ padding: 10, background: C.bg, borderRadius: 6, border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 10, color: C.textMut, fontWeight: 600, marginBottom: 4 }}>{item.label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{item.value}</div>
              </div>
            ))}
          </div>
        );

      case "confirmation":
        return (
          <div style={{ marginTop: 12, padding: 12, background: C.priLt, borderRadius: 8, border: `1px solid ${C.pri}` }}>
            <div style={{ fontSize: 12, color: C.text, marginBottom: 10 }}>
              {structured.message}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => {
                // TODO: Call edge function to confirm
                handleSendMessage();
              }} style={{ flex: 1, padding: "8px 12px", background: C.pri, color: "white", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                Confirm
              </button>
              <button onClick={() => setMessages(prev => prev.slice(0, -1))} style={{ flex: 1, padding: "8px 12px", background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                Cancel
              </button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const renderMessageContent = (msg) => {
    return (
      <>
        {msg.source === "manual" && msg.role === "assistant" && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: C.pri }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#84CC16", display: "inline-block" }} />
            Operations Manual
          </div>
        )}
        <div style={{
          padding: "11px 15px",
          borderRadius: msg.role === "user" ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
          background: msg.role === "user" ? C.pri : C.surface,
          color: msg.role === "user" ? "#fff" : C.text,
          border: msg.role === "assistant" ? `1px solid ${C.border}` : "none",
          fontSize: 13,
          lineHeight: 1.5,
          fontWeight: 400
        }}>
          {msg.role === "assistant" ? renderAIFormattedText(msg.text) : msg.text}
        </div>
        {msg.structured && msg.role === "assistant" && renderStructuredData(msg.structured)}
        {msg.suggestions && msg.role === "assistant" && msg.suggestions.length > 0 && (
          <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>
            {msg.suggestions.slice(0, 3).map((s, i) => (
              <button key={i} onClick={() => handleSuggestionClick(s)} style={{
                padding: "6px 12px",
                background: "transparent",
                border: `1px solid ${C.border}`,
                borderRadius: 6,
                fontSize: 12,
                color: C.text,
                cursor: "pointer",
                transition: "all 0.15s",
                fontFamily: "'Outfit', -apple-system, sans-serif",
                fontWeight: 500
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = C.pri; e.currentTarget.style.background = C.priLt; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = "transparent"; }}>
                {s}
              </button>
            ))}
          </div>
        )}
        <div style={{ fontSize: 11, color: C.textMut, marginTop: 6, textAlign: msg.role === "user" ? "right" : "left" }}>
          {msg.timestamp}
        </div>
      </>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: C.bg, fontFamily: "'Outfit', -apple-system, sans-serif" }}>
      <style>{`
  @keyframes k9orbit { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  @keyframes k9pulse { 0%, 100% { transform: scale(1); opacity: 0.8; } 50% { transform: scale(1.15); opacity: 1; } }
  @keyframes k9fade { 0%, 100% { opacity: 0.3; } 50% { opacity: 0.7; } }
`}</style>

      {/* Chat Area */}
      <div style={{ flex: 1, overflowY: "auto", padding: "32px 40px" }}>
        {messages.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", textAlign: "center" }}>
            <h2 style={{ margin: 0, fontSize: 28, fontWeight: 700, color: C.text, marginBottom: 12 }}>K9 AI Assistant</h2>
            <p style={{ margin: 0, fontSize: 14, color: C.textMut, maxWidth: 480, marginBottom: 32, lineHeight: 1.6 }}>
              Ask me anything about your business — revenue and client insights from your live data, or facility policies and procedures straight from the operations manual.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", maxWidth: 600 }}>
              {starterQueries.map((q, i) => (
                <button key={i} onClick={() => handleSendMessage(q)}
                  style={{
                    padding: "8px 16px",
                    borderRadius: 6,
                    border: `1px solid ${C.border}`,
                    background: "transparent",
                    cursor: "pointer",
                    fontSize: 13,
                    color: C.text,
                    transition: "all 0.15s",
                    fontFamily: "'Outfit', -apple-system, sans-serif",
                    fontWeight: 500
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = C.pri; e.currentTarget.style.background = C.priLt; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = "transparent"; }}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map(msg => (
              <div key={msg.id} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start", marginBottom: 20 }}>
                <div style={{ maxWidth: "72%", minWidth: 60 }}>
                  {renderMessageContent(msg)}
                </div>
              </div>
            ))}
            {isLoading && (
              <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 20 }}>
                <div style={{ padding: "8px 20px", borderRadius: "12px 12px 12px 4px", background: C.surface, border: `1px solid ${C.border}` }}>
                  <K9LoadingAnimation size={56} />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </>
        )}
      </div>

      {/* Input Area */}
      <div style={{ padding: "20px 40px 24px", flexShrink: 0, borderTop: `1px solid ${C.border}` }}>
        <div style={{
          display: "flex",
          alignItems: "flex-end",
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 10,
          padding: "10px 14px",
          gap: 10,
          transition: "all 0.2s"
        }}>
          <textarea
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
            placeholder="Ask anything..."
            rows={1}
            style={{
              flex: 1,
              padding: "8px 0",
              border: "none",
              fontSize: 13,
              fontFamily: "'Outfit', -apple-system, sans-serif",
              color: C.text,
              background: "transparent",
              outline: "none",
              resize: "none",
              minHeight: 36,
              maxHeight: 100,
              boxSizing: "border-box"
            }}
          />
          <button
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isLoading}
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              border: "none",
              background: inputValue.trim() && !isLoading ? C.pri : C.border,
              color: inputValue.trim() && !isLoading ? "#fff" : C.textMut,
              cursor: inputValue.trim() && !isLoading ? "pointer" : "default",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              transition: "all 0.2s"
            }}
            title="Send message"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}

export { AIAssistantPage };
