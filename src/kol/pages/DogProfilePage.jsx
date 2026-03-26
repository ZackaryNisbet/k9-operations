// K9 Operations — DogProfilePage
// Dog profile with aggregated EOD notes and stay history.

import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "../../supabaseClient";
import { C, todayStr, fmtDate, titleCase, gid } from "../../shared/theme";
import { Card, Badge, Btn } from "../../shared/ui";

// Render @mentions as blue clickable spans
function renderMentionContent(text, dogs, nav) {
  if (!text) return null;
  const parts = [];
  const regex = /@(\w+(?:\s+\w+)*)/g;
  let lastIdx = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) parts.push(text.slice(lastIdx, match.index));
    const mentionName = match[1];
    const dog = (dogs || []).find(d => {
      const dName = d.fields?.name || "";
      return dName === mentionName || mentionName.startsWith(dName);
    });
    if (dog) {
      parts.push(
        <span key={match.index} style={{ color: "#2563EB", fontWeight: 600, cursor: "pointer", textDecoration: "underline", textDecorationStyle: "dotted" }}
          onClick={() => nav && nav("dog-detail", { dogId: dog.id })}>@{mentionName}</span>
      );
    } else {
      parts.push("@" + mentionName);
    }
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return parts;
}

function DogProfilePage({ data, save, nav, profile, addGlobalToast, dogId }) {
  const today = todayStr();
  const dog = (data.dogs || []).find(d => d.id === dogId);
  const client = dog ? (data.clients || []).find(c => c.id === dog.clientId) : null;
  const dogName = dog?.fields?.name || "Unknown";
  const breed = dog?.fields?.breed || dog?.fields?.breed_name || "";
  const ownerName = client ? `${client.fields?.first_name || ""} ${client.fields?.last_name || ""}`.trim() : "";

  // All reservations for this dog
  const dogReservations = useMemo(() => {
    return (data.reservations || [])
      .filter(r => r.dogId === dogId)
      .sort((a, b) => (b.checkIn || "").localeCompare(a.checkIn || ""));
  }, [data.reservations, dogId]);

  const stayCount = dogReservations.length;
  const firstVisit = dogReservations.length > 0 ? dogReservations[dogReservations.length - 1].checkIn : null;
  const lastVisit = dogReservations.length > 0 ? dogReservations[0].checkOut || dogReservations[0].checkIn : null;

  // Current stay
  const currentStay = useMemo(() => {
    return dogReservations.find(r =>
      r.checkIn <= today && r.checkOut >= today &&
      (r.status === "checked-in" || r.status === "upcoming")
    );
  }, [dogReservations, today]);

  // Direct Supabase query for complete EOD notes
  const [supabaseEodEntries, setSupabaseEodEntries] = useState([]);
  const locationId = profile?.location_id || "cherry-hill";
  useEffect(() => {
    supabase
      .from("lite_daily_ops")
      .select("*")
      .eq("location_id", locationId)
      .eq("type", "eod")
      .order("date", { ascending: false })
      .then(({ data: rows }) => {
        if (rows) setSupabaseEodEntries(rows);
      });
  }, [locationId]);

  // Merge in-memory + supabase entries (prefer supabase for completeness, dedup by date)
  const allEodEntries = useMemo(() => {
    const byDate = {};
    (data.eodEntries || []).forEach(e => { byDate[e.date] = e; });
    supabaseEodEntries.forEach(r => {
      if (!byDate[r.date]) {
        byDate[r.date] = {
          date: r.date, sections: r.sections || [], mentions: r.mentions || [],
        };
      }
    });
    return Object.values(byDate).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }, [data.eodEntries, supabaseEodEntries]);

  // Filter EOD entries that mention this dog
  const eodNotes = useMemo(() => {
    const notes = [];
    allEodEntries.forEach(eod => {
      (eod.sections || []).forEach(sec => {
        const content = sec.content || "";
        if (!content.trim()) return;
        const hasMention = content.includes(`@${dogName}`) ||
          (eod.mentions || []).some(m => m.entityId === dogId);
        if (hasMention) {
          notes.push({
            date: eod.date,
            sectionId: sec.id,
            sectionTitle: sec.title || titleCase((sec.id || "").replace(/_/g, " ")),
            content,
          });
        }
      });
    });
    return notes.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  }, [allEodEntries, dogName, dogId]);

  // Days in current stay
  const daysSoFar = currentStay ? Math.max(1, Math.round((new Date(today + "T12:00:00") - new Date(currentStay.checkIn + "T12:00:00")) / 86400000)) : 0;

  if (!dog) {
    return (
      <div style={{ maxWidth: 800, margin: "0 auto", padding: 20 }}>
        <button onClick={() => nav && nav("dashboard")} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, color: C.pri, padding: "0 0 12px", fontFamily: "inherit" }}>{"← Back"}</button>
        <Card style={{ textAlign: "center", padding: 48 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: C.text }}>Dog not found</div>
          <div style={{ fontSize: 13, color: C.textMut, marginTop: 4 }}>The requested dog profile could not be found.</div>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <button onClick={() => nav && nav("eod")} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, color: C.pri, padding: "0 0 12px", fontFamily: "inherit" }}>{"← Back"}</button>

      {/* Header Card */}
      <Card style={{ padding: 24, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: 24, background: "#14532D", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 800, flexShrink: 0 }}>
            {dogName[0]}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: C.text }}>{dogName}</div>
            <div style={{ fontSize: 13, color: C.textSec, marginTop: 2 }}>
              {ownerName && <>{ownerName}</>}
              {ownerName && breed && " · "}
              {breed && <>{breed}</>}
            </div>
            <div style={{ fontSize: 12, color: C.textMut, marginTop: 6, display: "flex", gap: 12, flexWrap: "wrap" }}>
              <span>{stayCount} total stay{stayCount !== 1 ? "s" : ""}</span>
              {lastVisit && <span>Last visit: {fmtDate(lastVisit)}</span>}
              {firstVisit && <span>First visit: {fmtDate(firstVisit)}</span>}
            </div>
          </div>
        </div>
      </Card>

      {/* Current Stay */}
      {currentStay && (
        <Card style={{ padding: 18, marginBottom: 16, border: `1.5px solid ${C.pri}30` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.pri, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Current Stay</div>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", fontSize: 13, color: C.text }}>
            <div><span style={{ fontWeight: 600 }}>Check-in:</span> {fmtDate(currentStay.checkIn)}</div>
            <div><span style={{ fontWeight: 600 }}>Expected out:</span> {fmtDate(currentStay.checkOut)}</div>
            {currentStay.reservationType && <div><span style={{ fontWeight: 600 }}>Type:</span> {titleCase(currentStay.reservationType)}</div>}
            <div><span style={{ fontWeight: 600 }}>Day {daysSoFar}</span></div>
          </div>
        </Card>
      )}

      {/* EOD Notes History */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, padding: "0 2px" }}>EOD Notes</div>
        {eodNotes.length === 0 ? (
          <Card style={{ textAlign: "center", padding: 32 }}>
            <div style={{ fontSize: 13, color: C.textMut }}>No EOD notes for this dog yet</div>
          </Card>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {eodNotes.map((note, idx) => (
              <Card key={`${note.date}-${note.sectionId}-${idx}`} style={{ padding: "12px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.pri }}>{fmtDate(note.date)}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: C.textSec }}>{note.sectionTitle}</span>
                </div>
                <div style={{ fontSize: 12, color: C.text, lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {renderMentionContent(note.content, data.dogs || [], nav)}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Stay History */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10, padding: "0 2px" }}>Stay History</div>
        {dogReservations.length === 0 ? (
          <Card style={{ textAlign: "center", padding: 32 }}>
            <div style={{ fontSize: 13, color: C.textMut }}>No stay history</div>
          </Card>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {dogReservations.map((res, idx) => {
              const nights = Math.max(1, Math.round((new Date(res.checkOut + "T12:00:00") - new Date(res.checkIn + "T12:00:00")) / 86400000));
              const isCurrent = res.checkIn <= today && res.checkOut >= today && (res.status === "checked-in" || res.status === "upcoming");
              return (
                <Card key={res.id || idx} style={{ padding: "10px 16px", ...(isCurrent ? { border: `1.5px solid ${C.pri}30` } : {}) }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 13 }}>
                    <span style={{ fontWeight: 600, color: C.text }}>{fmtDate(res.checkIn)} → {fmtDate(res.checkOut)}</span>
                    {res.reservationType && <span style={{ fontSize: 11, color: C.textMut }}>{titleCase(res.reservationType)}</span>}
                    <span style={{ fontSize: 11, color: C.textMut }}>{nights} night{nights !== 1 ? "s" : ""}</span>
                    {isCurrent && <Badge color="primary" size="sm">Current</Badge>}
                    {res.status === "checked-out" && <Badge color="success" size="sm">Completed</Badge>}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default DogProfilePage;
