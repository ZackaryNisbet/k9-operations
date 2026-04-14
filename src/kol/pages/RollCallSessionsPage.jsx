import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabaseClient";
import { C, todayStr, addDays } from "../../shared/theme";
import { Btn, Card } from "../../shared/ui";

function getRollCallId(session, date) {
  return `ops_roll_call_${session}_${date}`;
}

function sessionLabel(session) {
  return session === "opening" ? "Opening Roll Call" : "Closing Roll Call";
}

function formatShortDate(value) {
  if (!value) return "—";
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export default function RollCallSessionsPage({
  profile,
  currentLocation,
  initialSession = "closing",
}) {
  const locationId = currentLocation || profile?.location_id;
  const [session, setSession] = useState(initialSession);
  const [viewDate, setViewDate] = useState(todayStr());
  const [row, setRow] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setSession(initialSession);
  }, [initialSession]);

  useEffect(() => {
    if (!locationId) return;
    let cancelled = false;
    setLoading(true);

    supabase
      .from("lite_daily_ops")
      .select("id, items, computed_items, computed_at")
      .eq("id", getRollCallId(session, viewDate))
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.error("Failed to load roll call session:", error);
        setRow(data || null);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [locationId, session, viewDate]);

  const computed = row?.computed_items || null;
  const verifiedCount = useMemo(
    () => Object.values(row?.items || {}).filter((value) => value?.verified).length,
    [row],
  );
  const totalRooms = computed?.summary?.totalRooms || 0;
  const totalDogs = computed?.summary?.totalDogs || 0;

  return (
    <div style={{ padding: 24, display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: C.pri }}>
            Roll Call Snapshots
          </div>
          <h2 style={{ margin: "6px 0 0", fontSize: 28, color: C.text }}>{sessionLabel(session)}</h2>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Btn onClick={() => setSession("opening")} kind={session === "opening" ? "pri" : "ghost"}>Opening</Btn>
          <Btn onClick={() => setSession("closing")} kind={session === "closing" ? "pri" : "ghost"}>Closing</Btn>
        </div>
      </div>

      <Card style={{ padding: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <Btn kind="ghost" onClick={() => setViewDate(addDays(viewDate, -1))}>Previous Day</Btn>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{new Date(`${viewDate}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</div>
          <Btn kind="ghost" onClick={() => setViewDate(addDays(viewDate, 1))}>Next Day</Btn>
        </div>
        <div style={{ fontSize: 12, color: C.textSec }}>
          Shared completion lives in <code>lite_daily_ops</code>.
        </div>
      </Card>

      {loading ? (
        <Card style={{ padding: 24, textAlign: "center", color: C.textSec }}>Loading roll call snapshot…</Card>
      ) : !computed ? (
        <Card style={{ padding: 24, textAlign: "center", color: C.textSec }}>
          No saved {sessionLabel(session).toLowerCase()} snapshot for {viewDate}.
        </Card>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
            <Card style={{ padding: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: C.textSec }}>Rooms Verified</div>
              <div style={{ marginTop: 6, fontSize: 28, fontWeight: 800, color: C.text }}>{verifiedCount}/{totalRooms}</div>
            </Card>
            <Card style={{ padding: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: C.textSec }}>Dogs In Snapshot</div>
              <div style={{ marginTop: 6, fontSize: 28, fontWeight: 800, color: C.text }}>{totalDogs}</div>
            </Card>
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            {(computed.areas || []).map((area) => (
              <Card key={area.name} style={{ padding: 16, display: "grid", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>{area.name}</div>
                    <div style={{ fontSize: 12, color: C.textSec }}>{area.roomCount} rooms · {area.dogCount} dogs</div>
                  </div>
                </div>
                <div style={{ display: "grid", gap: 10 }}>
                  {area.rooms.map((room) => {
                    const verified = row?.items?.[room.roomKey]?.verified;
                    return (
                      <div key={room.roomKey} style={{ border: `1px solid ${C.borderLight}`, borderRadius: 12, padding: 14, background: verified ? `${C.suc}10` : C.bg }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 800, color: C.pri }}>{room.roomName}</div>
                            <div style={{ fontSize: 12, color: C.textSec }}>{room.dogs.length} dog{room.dogs.length === 1 ? "" : "s"}</div>
                          </div>
                          {verified && (
                            <div style={{ fontSize: 11, fontWeight: 700, color: C.suc }}>
                              Verified
                            </div>
                          )}
                        </div>
                        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                          {room.dogs.map((dog) => (
                            <div key={`${room.roomKey}-${dog.animalGingrId || dog.reservationGingrId || dog.dogName}`} style={{ display: "grid", gap: 4 }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                                {dog.dogName}
                                {dog.ownerName ? <span style={{ color: C.textSec, fontWeight: 500 }}> · {dog.ownerName}</span> : null}
                              </div>
                              <div style={{ fontSize: 12, color: C.textSec }}>
                                {formatShortDate(dog.startDate)} → {formatShortDate(dog.endDate)} · {dog.reservationTypeName || "Reservation type unavailable"}
                              </div>
                              {(dog.playgroup || dog.tags?.length > 0) && (
                                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
                                  {[...new Set([...(dog.playgroup ? [dog.playgroup] : []), ...(dog.tags || [])])].map((tag) => (
                                    <span key={tag} style={{ padding: "4px 8px", borderRadius: 999, background: C.bg2, fontSize: 11, fontWeight: 700, color: C.text }}>
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
