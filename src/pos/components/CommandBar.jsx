import ReactDOM from "react-dom";
import { C } from "../constants/colors";
import { K9LoadingAnimation } from "./K9LoadingAnimation";
import { renderAIFormattedText } from "../lib/aiText";
import { supabase } from "../../supabaseClient";
import { useEffect, useMemo, useRef, useState } from "react";

function CommandBar({ data, profile, isOpen, onClose, nav, allLocations, onLocationChange }) {
  const [inputValue, setInputValue] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [visibleParagraphs, setVisibleParagraphs] = useState(0);
  const inputRef = useRef(null);

  // Pages definition
  const pages = [
    { id: "dashboard", label: "Dashboard" },
    { id: "reservations", label: "Calendar" },
    { id: "clients", label: "Clients" },
    { id: "messages", label: "Messages" },
    { id: "payments", label: "Payments" },
    { id: "reports", label: "Reports" },
    { id: "ai", label: "AI Assistant" },
    { id: "settings", label: "Settings" },
  ];

  // Settings sub-pages
  const settingsPages = [
    { tab: "resort-info", label: "Resort Info" },
    { tab: "facility", label: "Facility" },
    { tab: "rooms", label: "Rooms" },
    { tab: "closed-dates", label: "Closed Dates" },
    { tab: "booking-settings", label: "Booking Settings" },
    { tab: "pricing", label: "Pricing" },
    { tab: "packages", label: "Packages" },
    { tab: "discounts", label: "Discounts" },
    { tab: "unpaid-deposits", label: "Unpaid Deposits" },
    { tab: "fields", label: "Fields" },
    { tab: "tags", label: "Tags" },
    { tab: "dropdowns", label: "Dropdowns" },
    { tab: "questionnaire", label: "Questionnaire" },
    { tab: "vets", label: "Vets" },
    { tab: "vaccines", label: "Vaccines" },
    { tab: "agreements", label: "Agreements" },
    { tab: "policies", label: "Policies" },
    { tab: "compliance-rules", label: "Compliance Rules" },
    { tab: "eod", label: "EOD" },
    { tab: "daily-ops", label: "Daily Ops" },
    { tab: "run-card", label: "Run Card" },
    { tab: "message-templates", label: "Message Templates" },
    { tab: "automations", label: "Automations" },
    { tab: "team", label: "Team" },
    { tab: "roles", label: "Roles" },
    { tab: "session-security", label: "Session Security" },
    { tab: "legal", label: "Legal" },
    { tab: "hotkeys", label: "Hotkeys" },
    { tab: "reset", label: "Reset" },
  ];

  // Actions
  const actions = [
    { id: "new-reservation", label: "New Reservation" },
    { id: "new-client", label: "New Client" },
    { id: "new-dog", label: "New Dog" },
  ];

  // Compute local results (instant)
  const localResults = useMemo(() => {
    const query = inputValue.toLowerCase().trim();
    if (!query) return { pages: [], settings: [], actions: [], clients: [], dogs: [], locations: [] };

    const results = { pages: [], settings: [], actions: [], clients: [], dogs: [], locations: [] };

    // Match pages
    pages.forEach(p => {
      if (p.label.toLowerCase().includes(query) || p.id.includes(query)) {
        results.pages.push(p);
      }
    });

    // Match settings
    settingsPages.forEach(s => {
      if (s.label.toLowerCase().includes(query) || s.tab.includes(query)) {
        results.settings.push(s);
      }
    });

    // Match actions
    actions.forEach(a => {
      if (a.label.toLowerCase().includes(query)) {
        results.actions.push(a);
      }
    });

    // Match clients
    if (data?.clients) {
      data.clients.forEach(c => {
        const fname = (c.fields?.first_name || "").toLowerCase();
        const lname = (c.fields?.last_name || "").toLowerCase();
        const phone = (c.fields?.phone || "").toLowerCase();
        const email = (c.fields?.email || "").toLowerCase();
        if (fname.includes(query) || lname.includes(query) || phone.includes(query) || email.includes(query)) {
          results.clients.push(c);
        }
      });
    }

    // Match dogs
    if (data?.dogs) {
      data.dogs.forEach(d => {
        const name = (d.fields?.name || "").toLowerCase();
        const breed = (d.fields?.breed || "").toLowerCase();
        if (name.includes(query) || breed.includes(query)) {
          results.dogs.push(d);
        }
      });
    }

    // Match locations
    if (allLocations) {
      allLocations.forEach(l => {
        if (!l.isEnterprise && (l.name.toLowerCase().includes(query) || l.slug.includes(query))) {
          results.locations.push(l);
        }
      });
    }

    // Limit results per category
    results.pages = results.pages.slice(0, 5);
    results.settings = results.settings.slice(0, 5);
    results.actions = results.actions.slice(0, 3);
    results.clients = results.clients.slice(0, 4);
    results.dogs = results.dogs.slice(0, 4);
    results.locations = results.locations.slice(0, 3);

    return results;
  }, [inputValue, data?.clients, data?.dogs, allLocations]);

  // Flatten all results into single array for keyboard navigation
  const allResults = useMemo(() => {
    const flat = [];
    if (localResults.pages.length > 0) {
      flat.push({ type: "header", label: "Pages" });
      localResults.pages.forEach(p => flat.push({ type: "page", ...p }));
    }
    if (localResults.settings.length > 0) {
      flat.push({ type: "header", label: "Settings" });
      localResults.settings.forEach(s => flat.push({ type: "setting", ...s }));
    }
    if (localResults.actions.length > 0) {
      flat.push({ type: "header", label: "Actions" });
      localResults.actions.forEach(a => flat.push({ type: "action", ...a }));
    }
    if (localResults.clients.length > 0) {
      flat.push({ type: "header", label: "Clients" });
      localResults.clients.forEach(c => flat.push({ type: "client", ...c }));
    }
    if (localResults.dogs.length > 0) {
      flat.push({ type: "header", label: "Dogs" });
      localResults.dogs.forEach(d => flat.push({ type: "dog", ...d }));
    }
    if (localResults.locations.length > 0) {
      flat.push({ type: "header", label: "Locations" });
      localResults.locations.forEach(l => flat.push({ type: "location", ...l }));
    }

    // Add "Ask AI" option if query exists and no perfect matches
    if (inputValue.trim()) {
      flat.push({ type: "ai-fallback", label: "Ask AI: " + inputValue });
    }

    return flat;
  }, [localResults, inputValue]);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      setInputValue("");
      setSelectedIdx(0);
      setAiResult(null);
      setVisibleParagraphs(0);
    }
  }, [isOpen]);

  // Progressive reveal: show one paragraph at a time
  const aiParagraphs = useMemo(() => {
    if (!aiResult?.response) return [];
    return aiResult.response.split(/\n\n+/).filter(p => p.trim());
  }, [aiResult?.response]);

  useEffect(() => {
    if (!aiResult || aiParagraphs.length === 0) return;
    if (visibleParagraphs >= aiParagraphs.length) return;
    const timer = setTimeout(() => {
      setVisibleParagraphs(v => v + 1);
    }, visibleParagraphs === 0 ? 100 : 600);
    return () => clearTimeout(timer);
  }, [aiResult, visibleParagraphs, aiParagraphs.length]);

  const handleSelect = async (item) => {
    if (!item || item.type === "header") return;

    if (item.type === "page") {
      nav(item.id);
      onClose();
    } else if (item.type === "setting") {
      nav("settings", { tab: item.tab });
      onClose();
    } else if (item.type === "action") {
      nav(item.id);
      onClose();
    } else if (item.type === "client") {
      nav("client-detail", { clientId: item.id });
      onClose();
    } else if (item.type === "dog") {
      nav("dog-detail", { clientId: item.client_id, dogId: item.id });
      onClose();
    } else if (item.type === "location") {
      onLocationChange(item.id);
      onClose();
    } else if (item.type === "ai-fallback") {
      // Ask AI
      setAiLoading(true);
      try {
        const { data: result, error } = await supabase.functions.invoke("ai-assistant", {
          body: {
            query: inputValue,
            conversationHistory: [],
            locationId: data._locationId || profile?.location_id,
            userId: profile?.id,
            compact: true
          }
        });
        console.log("[K9 AI] invoke result:", { result, error });
        if (error) {
          console.error("[K9 AI] Edge function error:", error);
          const errMsg = error?.message || error?.context?.body || (typeof error === "string" ? error : JSON.stringify(error));
          setAiResult({ response: "Edge function error: " + errMsg });
          setVisibleParagraphs(999);
        } else if (result) {
          setAiResult(result);
          setVisibleParagraphs(0);
        } else {
          setAiResult({ response: "No response from AI service." });
          setVisibleParagraphs(999);
        }
      } catch (err) {
        console.error("[K9 AI] Catch error:", err);
        setAiResult({ response: "Connection error: " + (err?.message || "Unknown error") });
      } finally {
        setAiLoading(false);
      }
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx(prev => {
        let next = prev + 1;
        while (next < allResults.length && allResults[next].type === "header") next++;
        return next < allResults.length ? next : prev;
      });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx(prev => {
        let next = prev - 1;
        while (next >= 0 && allResults[next].type === "header") next--;
        return next >= 0 ? next : prev;
      });
    } else if (e.key === "Enter") {
      e.preventDefault();
      const selected = allResults[selectedIdx];
      handleSelect(selected);
    }
  };

  if (!isOpen) return null;

  const selectedItem = allResults[selectedIdx];

  return ReactDOM.createPortal(
    <div style={{
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: "rgba(0,0,0,0.4)",
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "center",
      zIndex: 10000,
      backdropFilter: "blur(2px)",
      paddingTop: "15vh",
      fontFamily: "'Outfit', -apple-system, sans-serif"
    }} onClick={onClose}>
      <div style={{
        width: "90%",
        maxWidth: 650,
        background: C.surface,
        borderRadius: 12,
        border: `1px solid ${C.border}`,
        boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
        animation: "k9overlay 0.2s ease",
        fontFamily: "'Outfit', -apple-system, sans-serif",
        display: "flex",
        flexDirection: "column",
        maxHeight: "70vh"
      }} onClick={e => e.stopPropagation()}>
        {/* Input */}
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={e => {
              setInputValue(e.target.value);
              setSelectedIdx(0);
              setAiResult(null);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search pages, clients, dogs, settings..."
            style={{
              width: "100%",
              padding: "12px 14px",
              fontSize: 14,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              background: C.bg,
              color: C.text,
              outline: "none",
              fontFamily: "inherit"
            }}
          />
        </div>

        {/* Results or AI Response */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          {aiResult ? (
            // Show AI result with progressive reveal
            <div style={{ padding: "16px 20px" }}>
              {aiResult.response && (
                <div style={{ marginBottom: 16, color: C.text, lineHeight: 1.5 }}>
                  {aiParagraphs.slice(0, visibleParagraphs).map((para, i) => (
                    <div key={i} style={{ marginBottom: 10, animation: "k9fadeIn 0.4s ease", opacity: 1 }}>
                      {renderAIFormattedText(para)}
                    </div>
                  ))}
                  {visibleParagraphs < aiParagraphs.length && (
                    <div style={{ display: "flex", justifyContent: "center", padding: "8px 0" }}>
                      <K9LoadingAnimation size={36} />
                    </div>
                  )}
                </div>
              )}
              {aiResult.structured?.type === "table" && aiResult.structured?.data && (
                <div style={{ marginTop: 12 }}>
                  <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        {(aiResult.structured.data.headers || []).slice(0, 4).map((h, i) => (
                          <th key={i} style={{ padding: "6px 8px", textAlign: "left", fontWeight: 600, color: C.textMut, borderBottom: `1px solid ${C.border}` }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(aiResult.structured.data.rows || []).slice(0, 5).map((row, ri) => (
                        <tr key={ri}>
                          {(row || []).slice(0, 4).map((cell, ci) => (
                            <td key={ci} style={{ padding: "6px 8px", color: C.text, borderBottom: `1px solid ${C.borderLight}` }}>{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {(aiResult.structured.data.rows || []).length > 5 && (
                    <div style={{ fontSize: 10, color: C.textMut, padding: "8px 0", textAlign: "center" }}>
                      +{(aiResult.structured.data.rows || []).length - 5} more
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : aiLoading ? (
            <div style={{ padding: "20px", display: "flex", justifyContent: "center" }}>
              <K9LoadingAnimation size={48} />
            </div>
          ) : (
            // Show local results
            <div>
              {allResults.length === 0 && inputValue.trim() && (
                <div style={{ padding: "20px", textAlign: "center", color: C.textMut, fontSize: 13 }}>
                  No results. Press Enter to ask AI.
                </div>
              )}
              {allResults.length === 0 && !inputValue.trim() && (
                <div style={{ padding: "20px", textAlign: "center", color: C.textMut, fontSize: 13 }}>
                  Start typing to search...
                </div>
              )}
              {allResults.map((item, idx) => {
                const isSelected = idx === selectedIdx;
                if (item.type === "header") {
                  return (
                    <div key={idx} style={{
                      padding: "10px 16px 4px",
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: C.textMut,
                      userSelect: "none"
                    }}>
                      {item.label}
                    </div>
                  );
                }
                return (
                  <div
                    key={idx}
                    onClick={() => handleSelect(item)}
                    style={{
                      padding: "10px 16px",
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      background: isSelected ? `${C.pri}12` : "transparent",
                      color: isSelected ? C.pri : C.text,
                      cursor: "pointer",
                      fontSize: 13,
                      borderLeft: isSelected ? `3px solid ${C.pri}` : "3px solid transparent",
                      paddingLeft: "13px"
                    }}
                  >
                    {item.type === "page" && <span style={{ fontSize: 14 }}>📄</span>}
                    {item.type === "setting" && <span style={{ fontSize: 14 }}>⚙</span>}
                    {item.type === "action" && <span style={{ fontSize: 14 }}>✨</span>}
                    {item.type === "client" && <span style={{ fontSize: 14 }}>👤</span>}
                    {item.type === "dog" && <span style={{ fontSize: 14 }}>🐕</span>}
                    {item.type === "location" && <span style={{ fontSize: 14 }}>📍</span>}
                    {item.type === "ai-fallback" && <span style={{ fontSize: 14 }}>💭</span>}
                    <div style={{ flex: 1 }}>
                      {item.type === "client" && (
                        <div>
                          <div>{item.fields?.first_name} {item.fields?.last_name}</div>
                          <div style={{ fontSize: 11, color: C.textMut }}>
                            {item.fields?.email || item.fields?.phone}
                          </div>
                        </div>
                      )}
                      {item.type === "dog" && (
                        <div>
                          <div>{item.fields?.name}</div>
                          <div style={{ fontSize: 11, color: C.textMut }}>
                            {item.fields?.breed || "Unknown breed"}
                          </div>
                        </div>
                      )}
                      {item.type === "location" && (
                        <div>
                          <div>Switch to {item.name}</div>
                        </div>
                      )}
                      {(item.type === "page" || item.type === "setting" || item.type === "action" || item.type === "ai-fallback") && (
                        <div>{item.label}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "8px 16px", borderTop: `1px solid ${C.border}`, fontSize: 10, color: C.textMut, display: "flex", justifyContent: "space-between", flexShrink: 0 }}>
          <span>↑↓ to navigate • Enter to select</span>
          <span>Esc to close</span>
        </div>
      </div>
    </div>,
    document.body
  );
}

export { CommandBar };
