// K9 Operations — CheckoutNotesPage
// Shows aggregated EOD notes for all dogs checking out today.
// Designed for the front-desk checkout experience.

import React, { useState, useMemo } from "react";
import { C, todayStr, fmtDate, fmtPhone, titleCase, gid } from "../../shared/theme";
import { I } from "../../shared/icons";
import { Card, Badge, Btn } from "../../shared/ui";

function CheckoutNotesPage({ data, save, nav, profile, addGlobalToast }) {
  const today = todayStr();
  const [expandedDogs, setExpandedDogs] = useState(new Set());
  const [reviewedDogs, setReviewedDogs] = useState(new Set());
  const [checkoutNoteDrafts, setCheckoutNoteDrafts] = useState({});
  const [savingNote, setSavingNote] = useState(null);

  // Dogs checking out today: reservations with checkOut === today, status in [checked-in, upcoming]
  const checkoutData = useMemo(() => {
    const reservations = data.reservations || [];
    const dogs = data.dogs || [];
    const clients = data.clients || [];
    const eodEntries = data.eodEntries || [];

    const checkoutRes = reservations.filter(r =>
      r.checkOut === today &&
      (r.status === "checked-in" || r.status === "upcoming")
    );

    // Group by dog
    const dogMap = {};
    checkoutRes.forEach(res => {
      const dog = dogs.find(d => d.id === res.dogId);
      if (!dog) return;
      const client = clients.find(c => c.id === dog.clientId);
      if (!dogMap[dog.id]) {
        dogMap[dog.id] = {
          dog,
          client,
          reservations: [],
          notes: [],
        };
      }
      dogMap[dog.id].reservations.push(res);
    });

    // For each dog, find all EOD notes during their stay
    Object.values(dogMap).forEach(entry => {
      const stayStart = entry.reservations.reduce((min, r) => r.checkIn < min ? r.checkIn : min, entry.reservations[0].checkIn);
      const stayEnd = today;
      const dogName = entry.dog.fields?.name || "";
      const clientLastName = entry.client?.fields?.last_name || "";
      const fullMentionName = `${dogName} ${clientLastName}`.trim();

      // Scan EOD entries during the stay period
      eodEntries.forEach(eod => {
        if (eod.date < stayStart || eod.date > stayEnd) return;
        const sections = eod.sections || [];

        sections.forEach(sec => {
          const content = sec.content || "";
          if (!content.trim()) return;

          // Check for @mentions of this dog
          const hasMention = content.includes(`@${dogName}`) ||
            content.includes(`@${fullMentionName}`) ||
            (eod.mentions || []).some(m => m.entityId === entry.dog.id);

          // Also include boarding_notes, daycare sections (relevant to all dogs)
          const isRelevantSection = ["boarding_notes", "small_daycare_notes", "large_daycare_notes", "meds", "evaluations", "baths"].includes(sec.id);

          if (hasMention || isRelevantSection) {
            entry.notes.push({
              date: eod.date,
              sectionId: sec.id,
              sectionTitle: sec.title || titleCase(sec.id.replace(/_/g, " ")),
              content: content,
              hasMention,
              isRelevantSection,
            });
          }
        });
      });

      // Sort notes chronologically (oldest first — read the story of the stay)
      entry.notes.sort((a, b) => a.date.localeCompare(b.date));
    });

    return Object.values(dogMap).sort((a, b) =>
      (a.dog.fields?.name || "").localeCompare(b.dog.fields?.name || "")
    );
  }, [data.reservations, data.dogs, data.clients, data.eodEntries, today]);

  const totalDogsWithNotes = checkoutData.filter(d => d.notes.length > 0).length;
  const totalNotes = checkoutData.reduce((sum, d) => sum + d.notes.length, 0);
  const allReviewed = checkoutData.length > 0 && checkoutData.every(d => reviewedDogs.has(d.dog.id));

  const toggleExpand = (dogId) => {
    setExpandedDogs(prev => {
      const next = new Set(prev);
      if (next.has(dogId)) next.delete(dogId); else next.add(dogId);
      return next;
    });
  };

  const markReviewed = (dogId) => {
    setReviewedDogs(prev => new Set([...prev, dogId]));
    addGlobalToast?.({ message: "Marked as reviewed" });
  };

  const handleSaveCheckoutNote = async (dogId) => {
    const text = (checkoutNoteDrafts[dogId] || "").trim();
    if (!text) return;
    setSavingNote(dogId);
    const entry = checkoutData.find(d => d.dog.id === dogId);
    if (!entry) { setSavingNote(null); return; }

    // Save to client's checkout notes
    const clientId = entry.client?.id;
    if (clientId) {
      const updatedClients = (data.clients || []).map(c => {
        if (c.id !== clientId) return c;
        const existing = c.checkoutNotes || [];
        return {
          ...c,
          checkoutNotes: [...existing, {
            id: gid(),
            dogId,
            dogName: entry.dog.fields?.name || "Unknown",
            text,
            date: today,
            addedBy: profile?.full_name || profile?.email || "Staff",
            timestamp: new Date().toISOString(),
          }],
        };
      });
      await save({ ...data, clients: updatedClients });
    }

    setCheckoutNoteDrafts(prev => ({ ...prev, [dogId]: "" }));
    setSavingNote(null);
    addGlobalToast?.({ message: "Checkout note saved" });
  };

  const copyDogNotes = (entry) => {
    const lines = [
      `${entry.dog.fields?.name || "Dog"} — Checkout Notes (${fmtDate(today)})`,
      `Owner: ${entry.client?.fields?.first_name || ""} ${entry.client?.fields?.last_name || ""}`,
      `Stay: ${fmtDate(entry.reservations[0]?.checkIn)} → ${fmtDate(today)}`,
      "",
      ...entry.notes.map(n => `[${fmtDate(n.date)}] ${n.sectionTitle}: ${n.content}`),
    ];
    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      addGlobalToast?.({ message: "Notes copied to clipboard" });
    });
  };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <button onClick={() => nav && nav("dashboard")} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, color: C.pri, padding: "0 0 12px", fontFamily: "inherit" }}>{"← Dashboard"}</button>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: C.text }}>Checkout Notes</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: C.textMut }}>
            {fmtDate(today)} — {checkoutData.length} dog{checkoutData.length !== 1 ? "s" : ""} going home
            {totalNotes > 0 && ` · ${totalNotes} note${totalNotes !== 1 ? "s" : ""}`}
          </p>
        </div>
        {checkoutData.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {allReviewed ? (
              <Badge color="success" size="md">All Reviewed</Badge>
            ) : (
              <Badge color="warning" size="md">{checkoutData.length - reviewedDogs.size} Unreviewed</Badge>
            )}
          </div>
        )}
      </div>

      {/* Empty state */}
      {checkoutData.length === 0 && (
        <Card style={{ textAlign: "center", padding: 48 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🏠</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 4 }}>No dogs checking out today</div>
          <div style={{ fontSize: 13, color: C.textMut }}>Check back when there are upcoming checkouts</div>
        </Card>
      )}

      {/* Dog cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {checkoutData.map(entry => {
          const dogId = entry.dog.id;
          const dogName = entry.dog.fields?.name || "Unknown";
          const clientName = `${entry.client?.fields?.first_name || ""} ${entry.client?.fields?.last_name || ""}`.trim();
          const clientPhone = entry.client?.fields?.phone || "";
          const stayStart = entry.reservations.reduce((min, r) => r.checkIn < min ? r.checkIn : min, entry.reservations[0]?.checkIn || today);
          const isExpanded = expandedDogs.has(dogId) || entry.notes.length > 0; // Auto-expand if has notes
          const isReviewed = reviewedDogs.has(dogId);

          return (
            <Card key={dogId} style={{ padding: 0, overflow: "hidden", border: isReviewed ? `1.5px solid ${C.suc}40` : undefined }}>
              {/* Dog header */}
              <div
                onClick={() => toggleExpand(dogId)}
                style={{
                  padding: "14px 18px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  background: isReviewed ? `${C.suc}06` : "transparent",
                  transition: "background 0.15s",
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{dogName}</span>
                    {entry.dog.fields?.breed && <span style={{ fontSize: 12, color: C.textMut }}>{entry.dog.fields.breed}</span>}
                    {isReviewed && <Badge color="success" size="sm">Reviewed</Badge>}
                    {entry.notes.length > 0 && !isReviewed && <Badge color="warning" size="sm">{entry.notes.length} note{entry.notes.length !== 1 ? "s" : ""}</Badge>}
                    {entry.notes.length === 0 && <Badge color="default" size="sm">No notes</Badge>}
                  </div>
                  <div style={{ fontSize: 12, color: C.textSec, marginTop: 4 }}>
                    <span style={{ fontWeight: 600 }}>{clientName}</span>
                    {clientPhone && <> · {fmtPhone(clientPhone)}</>}
                    <> · Stay: {fmtDate(stayStart)} → {fmtDate(today)}</>
                    {entry.reservations.map(r => r.roomType).filter(Boolean).length > 0 && (
                      <> · Room: {entry.reservations.map(r => r.roomType).filter(Boolean).join(", ")}</>
                    )}
                  </div>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.textMut} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  style={{ transition: "transform 0.2s", transform: isExpanded ? "rotate(180deg)" : "rotate(0)" }}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>

              {/* Notes timeline */}
              {isExpanded && (
                <div style={{ borderTop: `1px solid ${C.borderLight}`, padding: "12px 18px" }}>
                  {entry.notes.length === 0 ? (
                    <div style={{ padding: 12, textAlign: "center", fontSize: 13, color: C.textMut }}>
                      No EOD notes found during this stay
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {entry.notes.map((note, idx) => (
                        <div key={`${note.date}-${note.sectionId}-${idx}`} style={{
                          padding: "10px 14px",
                          borderRadius: 8,
                          background: note.hasMention ? `${C.pri}06` : C.bg,
                          border: `1px solid ${note.hasMention ? C.pri + "20" : C.borderLight}`,
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: C.pri }}>{fmtDate(note.date)}</span>
                            <span style={{ fontSize: 11, fontWeight: 600, color: C.textSec }}>{note.sectionTitle}</span>
                            {note.hasMention && <Badge color="primary" size="sm">@mentioned</Badge>}
                          </div>
                          <div style={{ fontSize: 12, color: C.text, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                            {note.content}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add checkout note */}
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.borderLight}` }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                      Checkout Note
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <textarea
                        value={checkoutNoteDrafts[dogId] || ""}
                        onChange={e => setCheckoutNoteDrafts(prev => ({ ...prev, [dogId]: e.target.value }))}
                        placeholder="Add a note for the owner or for records..."
                        style={{
                          flex: 1, minHeight: 56, padding: "8px 10px",
                          border: `1.5px solid ${C.border}`, borderRadius: 8,
                          fontSize: 12, lineHeight: 1.5, fontFamily: "inherit",
                          color: C.text, background: "#fff", resize: "vertical",
                          outline: "none", boxSizing: "border-box",
                        }}
                      />
                    </div>
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
                      <Btn size="sm" variant="default" onClick={() => copyDogNotes(entry)} icon={<I.Copy />}>Copy All</Btn>
                      {(checkoutNoteDrafts[dogId] || "").trim() && (
                        <Btn size="sm" variant="primary" onClick={() => handleSaveCheckoutNote(dogId)} disabled={savingNote === dogId}>
                          {savingNote === dogId ? "Saving..." : "Save Note"}
                        </Btn>
                      )}
                      {!isReviewed && (
                        <Btn size="sm" variant="success" onClick={() => markReviewed(dogId)} icon={
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                        }>Mark Reviewed</Btn>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export default CheckoutNotesPage;
