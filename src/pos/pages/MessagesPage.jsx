import { C } from "../constants/colors";
import { I } from "../icons";
import { Modal } from "../components/ui";
import { formatDogNames, gid } from "../lib/format";
import { useEffect, useMemo, useRef, useState } from "react";

function MessagesPage({ data, save, nav, profile }) {
  const [selClient, setSelClient] = useState(null);
  const [search, setSearch] = useState("");
  const [compose, setCompose] = useState("");
  const [showTpl, setShowTpl] = useState(false);
  const [showNewMsg, setShowNewMsg] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [attachments, setAttachments] = useState([]);
  const threadRef = useRef(null);
  const fileInputRef = useRef(null);
  const msgs = data.messages || [];
  const templates = data.messageTemplates || [];
  const clients = data.clients || [];
  const dogs = data.dogs || [];

  const clientName = (c) => c ? `${c.fields?.first_name || ""} ${c.fields?.last_name || ""}`.trim() || "Client" : "";
  const clientPhone = (c) => c?.fields?.phone || "";
  const clientInitials = (c) => c ? `${(c.fields?.first_name || "?")[0]}${(c.fields?.last_name || "")[0]}`.toUpperCase() : "?";

  // Group messages by client, sorted by most recent
  const convos = useMemo(() => {
    const map = {};
    msgs.forEach(m => {
      if (!map[m.clientId]) map[m.clientId] = [];
      map[m.clientId].push(m);
    });
    return Object.entries(map).map(([cid, cmsgs]) => {
      const sorted = [...cmsgs].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      const client = clients.find(c => c.id === cid);
      const unread = cmsgs.filter(m => m.direction === "inbound" && !m.readAt).length;
      return { clientId: cid, client, messages: sorted, last: sorted[0], unread };
    }).sort((a, b) => new Date(b.last.timestamp) - new Date(a.last.timestamp));
  }, [msgs, clients]);

  const filteredConvos = search ? convos.filter(c => clientName(c.client).toLowerCase().includes(search.toLowerCase())) : convos;

  const thread = useMemo(() => {
    if (!selClient) return [];
    return msgs.filter(m => m.clientId === selClient).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }, [selClient, msgs]);

  const selClientObj = clients.find(c => c.id === selClient);
  const selClientDogs = dogs.filter(d => d.clientId === selClient);

  useEffect(() => { if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight; }, [thread]);

  useEffect(() => {
    if (!selClient) return;
    const unread = msgs.filter(m => m.clientId === selClient && m.direction === "inbound" && !m.readAt);
    if (unread.length > 0) {
      const now = new Date().toISOString();
      const updated = msgs.map(m => (m.clientId === selClient && m.direction === "inbound" && !m.readAt) ? { ...m, readAt: now } : m);
      save({ ...data, messages: updated });
    }
  }, [selClient]);

  const sendMessage = async () => {
    if ((!compose.trim() && attachments.length === 0) || !selClient) return;
    const msg = {
      id: gid(), clientId: selClient, direction: "outbound", channel: "sms",
      body: compose.trim(),
      attachments: attachments.length > 0 ? attachments.map(a => ({ name: a.name, size: a.size, type: a.type })) : undefined,
      timestamp: new Date().toISOString(), status: "sent", sentBy: profile ? (profile.full_name || profile.email || 'Staff') : 'Staff', twilioSid: null, templateId: null, readAt: null
    };
    await save({ ...data, messages: [...msgs, msg] });
    setCompose("");
    setAttachments([]);
  };

  const insertTemplate = (tpl) => {
    const c = selClientObj;
    const cDogs = dogs.filter(d => d.clientId === selClient);
    let body = tpl.body;
    body = body.replace(/\{clientName\}/g, clientName(c));
    body = body.replace(/\{dogName\}/g, formatDogNames(cDogs));
    body = body.replace(/\{checkInDate\}/g, "TBD");
    body = body.replace(/\{checkOutDate\}/g, "TBD");
    body = body.replace(/\{roomType\}/g, "TBD");
    body = body.replace(/\{totalPrice\}/g, "TBD");
    setCompose(body);
    setShowTpl(false);
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    setAttachments(prev => [...prev, ...files.map(f => ({ name: f.name, size: f.size, type: f.type }))]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeAttachment = (idx) => setAttachments(prev => prev.filter((_, i) => i !== idx));

  const selectNewClient = (cid) => { setSelClient(cid); setShowNewMsg(false); setClientSearch(""); };

  const fmtTime = (ts) => {
    const d = new Date(ts); const now = new Date();
    const diffD = Math.floor((now - d) / 86400000);
    if (diffD === 0) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    if (diffD === 1) return "Yesterday";
    if (diffD < 7) return d.toLocaleDateString([], { weekday: "short" });
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  };

  const fmtMsgTime = (ts) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  };

  const fmtFileSize = (bytes) => bytes < 1024 ? bytes + " B" : bytes < 1048576 ? (bytes / 1024).toFixed(1) + " KB" : (bytes / 1048576).toFixed(1) + " MB";

  const inputS = { width: "100%", padding: "10px 14px", border: `1.5px solid ${C.border}`, borderRadius: 12, fontSize: 14, color: C.text, background: C.surface, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };

  // Group consecutive messages from same direction together
  const groupedThread = useMemo(() => {
    const groups = [];
    thread.forEach((m, i) => {
      const prev = i > 0 ? thread[i - 1] : null;
      const sameDir = prev && prev.direction === m.direction;
      const sameMinute = prev && Math.abs(new Date(m.timestamp) - new Date(prev.timestamp)) < 120000;
      if (sameDir && sameMinute) {
        groups[groups.length - 1].messages.push(m);
      } else {
        groups.push({ direction: m.direction, messages: [m], timestamp: m.timestamp });
      }
    });
    return groups;
  }, [thread]);

  return (
    <div style={{ display: "flex", height: "calc(100vh - 56px)", gap: 0, marginTop: -28, marginLeft: -32, marginRight: -32, marginBottom: -28 }}>
      {/* Left Panel - Conversations */}
      <div style={{ width: 360, minWidth: 360, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", background: "#fff" }}>
        {/* Header */}
        <div style={{ padding: "20px 20px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: C.text, letterSpacing: "-0.02em" }}>Messages</h2>
            <button onClick={() => setShowNewMsg(true)} style={{ width: 34, height: 34, borderRadius: "50%", background: C.pri, color: "#fff", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "transform 0.15s" }}
              onMouseEnter={e => e.currentTarget.style.transform = "scale(1.05)"}
              onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}>
              <I.Plus />
            </button>
          </div>
          <div style={{ position: "relative" }}>
            <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: C.textMut, opacity: 0.5 }}><I.Search /></div>
            <input data-shortcut-search="1" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
              style={{ width: "100%", padding: "10px 14px 10px 38px", border: "none", borderRadius: 10, fontSize: 14, color: C.text, background: C.bg, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }} />
          </div>
        </div>

        {/* Conversation List */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {filteredConvos.length === 0 && <div style={{ padding: 32, textAlign: "center", color: C.textMut, fontSize: 14 }}>No conversations yet</div>}
          {filteredConvos.map(cv => {
            const active = selClient === cv.clientId;
            return (
              <div key={cv.clientId} onClick={() => setSelClient(cv.clientId)}
                style={{ padding: "14px 20px", cursor: "pointer", background: active ? C.priLt : "transparent", transition: "background 0.12s", display: "flex", gap: 12, alignItems: "center" }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = C.surfaceHover; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}>
                {/* Avatar */}
                <div style={{ width: 48, height: 48, borderRadius: "50%", background: active ? C.pri : `linear-gradient(135deg, ${C.pri}20, ${C.acc}30)`, color: active ? "#fff" : C.pri, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 15, flexShrink: 0, letterSpacing: "0.02em" }}>
                  {clientInitials(cv.client)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                    <span style={{ fontWeight: cv.unread > 0 ? 700 : 600, fontSize: 14, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{clientName(cv.client)}</span>
                    <span style={{ fontSize: 11, color: cv.unread > 0 ? C.pri : C.textMut, fontWeight: cv.unread > 0 ? 600 : 400, flexShrink: 0, marginLeft: 8 }}>{fmtTime(cv.last.timestamp)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 13, color: cv.unread > 0 ? C.text : C.textMut, fontWeight: cv.unread > 0 ? 500 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3 }}>
                      {cv.last.direction === "outbound" && <span style={{ color: C.textMut }}>You: </span>}
                      {cv.last.attachments ? "Sent a file" : cv.last.body}
                    </span>
                    {cv.unread > 0 && <span style={{ background: C.pri, color: "#fff", borderRadius: 12, fontSize: 11, fontWeight: 700, minWidth: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 7px", flexShrink: 0, marginLeft: 8 }}>{cv.unread}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right Panel - Thread */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", background: C.bg }}>
        {!selClient ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
            <div style={{ width: 72, height: 72, borderRadius: "50%", background: `linear-gradient(135deg, ${C.pri}12, ${C.acc}15)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={C.pri} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 4 }}>Your Messages</div>
              <div style={{ fontSize: 14, color: C.textMut }}>Select a conversation or start a new one</div>
            </div>
          </div>
        ) : (
          <>
            {/* Thread Header */}
            <div style={{ padding: "16px 24px", borderBottom: `1px solid ${C.border}`, background: "rgba(255,255,255,0.8)", backdropFilter: "blur(12px)", display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 42, height: 42, borderRadius: "50%", background: `linear-gradient(135deg, ${C.pri}, #004a8f)`, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 15, letterSpacing: "0.02em" }}>
                {clientInitials(selClientObj)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 16, color: C.text, letterSpacing: "-0.01em" }}>{clientName(selClientObj)}</div>
                <div style={{ fontSize: 12, color: C.textSec, marginTop: 1 }}>
                  {clientPhone(selClientObj) || "No phone"}
                  {selClientDogs.length > 0 && <span style={{ marginLeft: 8, color: C.textMut }}>{selClientDogs.map(d => d.fields.name).join(", ")}</span>}
                </div>
              </div>
              <button onClick={() => nav("client-detail", { clientId: selClient })} style={{ background: "none", border: `1.5px solid ${C.border}`, borderRadius: 10, padding: "8px 16px", fontSize: 13, color: C.pri, cursor: "pointer", fontWeight: 600, fontFamily: "inherit", transition: "all 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.background = C.priLt; e.currentTarget.style.borderColor = C.pri; }}
                onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.borderColor = C.border; }}>
                Profile
              </button>
            </div>

            {/* SMS Simulation Banner */}
            <div style={{ background: "#FEF3C7", border: "1px solid #F59E0B40", borderRadius: 10, padding: "10px 16px", margin: "0 0 12px", display: "flex", alignItems: "center", gap: 8 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <span style={{ fontSize: 13, color: "#92400E" }}>SMS simulation mode — no Twilio integration active. Outbound messages are stored locally only.</span>
            </div>

            {/* Thread Messages */}
            <div ref={threadRef} style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 4 }}>
              {groupedThread.map((group, gi) => {
                const isOut = group.direction === "outbound";
                return (
                  <div key={gi} style={{ marginBottom: 8 }}>
                    {group.messages.map((m, mi) => {
                      const isFirst = mi === 0;
                      const isLast = mi === group.messages.length - 1;
                      return (
                        <div key={m.id} style={{ display: "flex", justifyContent: isOut ? "flex-end" : "flex-start", marginBottom: 2 }}>
                          <div style={{
                            maxWidth: "65%", padding: "10px 16px",
                            borderRadius: 20,
                            borderTopLeftRadius: !isOut && !isFirst ? 6 : 20,
                            borderBottomLeftRadius: !isOut && !isLast ? 6 : 20,
                            borderTopRightRadius: isOut && !isFirst ? 6 : 20,
                            borderBottomRightRadius: isOut && !isLast ? 6 : 20,
                            background: isOut ? `linear-gradient(135deg, ${C.pri}, #004a8f)` : "#fff",
                            color: isOut ? "#fff" : C.text,
                            fontSize: 14, lineHeight: 1.5,
                            boxShadow: isOut ? "none" : "0 1px 3px rgba(0,0,0,0.06)",
                          }}>
                            <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.body}</div>
                            {m.attachments && m.attachments.length > 0 && (
                              <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                                {m.attachments.map((a, ai) => (
                                  <div key={ai} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 8, background: isOut ? "rgba(255,255,255,0.15)" : C.bg, fontSize: 12 }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                                    <span style={{ fontWeight: 500 }}>{a.name}</span>
                                    <span style={{ opacity: 0.6 }}>{fmtFileSize(a.size)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {/* Timestamp after group */}
                    <div style={{ textAlign: isOut ? "right" : "left", fontSize: 10, color: C.textMut, marginTop: 2, padding: isOut ? "0 4px 0 0" : "0 0 0 4px" }}>
                      {fmtMsgTime(group.messages[group.messages.length - 1].timestamp)}
                      {isOut && <span style={{ marginLeft: 4, opacity: 0.7 }}>Sent{group.messages[group.messages.length - 1].sentBy ? ` by ${group.messages[group.messages.length - 1].sentBy}` : ''}</span>}
                    </div>
                  </div>
                );
              })}
              {thread.length === 0 && (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8, padding: 40 }}>
                  <div style={{ fontSize: 14, color: C.textMut }}>No messages yet. Send one below to start the conversation.</div>
                </div>
              )}
            </div>

            {/* Compose Area */}
            <div style={{ padding: "14px 24px 16px", borderTop: `1px solid ${C.border}`, background: "rgba(255,255,255,0.8)", backdropFilter: "blur(12px)" }}>
              {/* Attachments Preview */}
              {attachments.length > 0 && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                  {attachments.map((a, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 8, background: C.bg, border: `1px solid ${C.border}`, fontSize: 12 }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.textSec} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                      <span style={{ fontWeight: 500, color: C.text, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
                      <button onClick={() => removeAttachment(i)} style={{ border: "none", background: "none", color: C.textMut, cursor: "pointer", padding: 0, fontSize: 14, lineHeight: 1 }}>×</button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
                {/* Action buttons */}
                <div style={{ display: "flex", gap: 4, paddingBottom: 4 }}>
                  <button onClick={() => fileInputRef.current?.click()} title="Attach file"
                    style={{ width: 36, height: 36, borderRadius: "50%", border: "none", background: "transparent", color: C.pri, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.12s" }}
                    onMouseEnter={e => e.currentTarget.style.background = C.priLt}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                  </button>
                  <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} onChange={handleFileSelect} />
                  <div style={{ position: "relative" }}>
                    <button onClick={() => setShowTpl(!showTpl)} title="Templates"
                      style={{ width: 36, height: 36, borderRadius: "50%", border: "none", background: showTpl ? C.priLt : "transparent", color: C.pri, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.12s" }}
                      onMouseEnter={e => e.currentTarget.style.background = C.priLt}
                      onMouseLeave={e => { if (!showTpl) e.currentTarget.style.background = "transparent"; }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
                    </button>
                    {showTpl && (
                      <div style={{ position: "absolute", bottom: "calc(100% + 8px)", left: 0, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 14, boxShadow: "0 8px 32px rgba(0,0,0,0.12)", minWidth: 280, zIndex: 10, overflow: "hidden" }}>
                        <div style={{ padding: "10px 16px", fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: `1px solid ${C.borderLight}` }}>Templates</div>
                        {templates.filter(t => t.active).map(t => (
                          <div key={t.id} onClick={() => insertTemplate(t)} style={{ padding: "12px 16px", cursor: "pointer", transition: "background 0.1s" }}
                            onMouseEnter={e => e.currentTarget.style.background = C.surfaceHover}
                            onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                            <div style={{ fontWeight: 600, fontSize: 13, color: C.text, marginBottom: 2 }}>{t.name}</div>
                            <div style={{ color: C.textMut, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.body.slice(0, 65)}...</div>
                          </div>
                        ))}
                        {templates.filter(t => t.active).length === 0 && <div style={{ padding: "14px 16px", fontSize: 13, color: C.textMut }}>No templates configured</div>}
                      </div>
                    )}
                  </div>
                </div>

                {/* Input */}
                <div style={{ flex: 1, position: "relative" }}>
                  <textarea value={compose} onChange={e => setCompose(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                    placeholder="Type a message..."
                    rows={1}
                    style={{ width: "100%", padding: "10px 16px", border: `1.5px solid ${C.border}`, borderRadius: 22, fontSize: 14, color: C.text, background: C.surface, resize: "none", outline: "none", fontFamily: "inherit", minHeight: 42, maxHeight: 120, boxSizing: "border-box", lineHeight: 1.5, transition: "border-color 0.15s" }}
                    onFocus={e => e.target.style.borderColor = C.pri}
                    onBlur={e => e.target.style.borderColor = C.border} />
                </div>

                {/* Send */}
                <button onClick={sendMessage} disabled={!compose.trim() && attachments.length === 0}
                  style={{ width: 42, height: 42, borderRadius: "50%", background: (compose.trim() || attachments.length > 0) ? C.pri : C.border, color: "#fff", border: "none", cursor: (compose.trim() || attachments.length > 0) ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.15s, transform 0.1s", flexShrink: 0, marginBottom: 0 }}
                  onMouseEnter={e => { if (compose.trim() || attachments.length > 0) e.currentTarget.style.transform = "scale(1.05)"; }}
                  onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                </button>
              </div>
              <div style={{ fontSize: 10, color: C.textMut, marginTop: 8, textAlign: "center" }}>Twilio SMS integration ready — messages are simulated until connected</div>
            </div>
          </>
        )}
      </div>

      {/* New Message Modal */}
      {showNewMsg && (
        <Modal title="New Message" onClose={() => { setShowNewMsg(false); setClientSearch(""); }}>
          <div style={{ padding: 16 }}>
            <input placeholder="Search clients..." value={clientSearch} onChange={e => setClientSearch(e.target.value)} style={inputS} autoFocus />
            <div style={{ maxHeight: 360, overflowY: "auto", marginTop: 12 }}>
              {clients.filter(c => !clientSearch || clientName(c).toLowerCase().includes(clientSearch.toLowerCase())).slice(0, 20).map(c => (
                <div key={c.id} onClick={() => selectNewClient(c.id)}
                  style={{ padding: "12px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, borderRadius: 10, transition: "background 0.1s" }}
                  onMouseEnter={e => e.currentTarget.style.background = C.surfaceHover}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", background: `linear-gradient(135deg, ${C.pri}20, ${C.acc}30)`, color: C.pri, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14 }}>
                    {clientInitials(c)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: C.text }}>{clientName(c)}</div>
                    <div style={{ fontSize: 12, color: C.textMut }}>{c.fields?.phone || "No phone"}</div>
                  </div>
                  <I.ChevronRight />
                </div>
              ))}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export { MessagesPage };
