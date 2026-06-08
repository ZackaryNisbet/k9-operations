import { C } from "../constants/colors";
import { Card } from "../components/ui";
import { gid } from "../lib/format";
import { supabase } from "../../supabaseClient";
import { useState } from "react";

function OnlineBookingsPage({ data, save, nav, profile, addGlobalToast, allLocations }) {
  const [tab, setTab] = useState("pending");
  const [declineId, setDeclineId] = useState(null);
  const [declineReason, setDeclineReason] = useState("");
  const bookings = data.onlineBookings || [];
  const pending = bookings.filter(b => b.status === "pending");
  const processed = bookings.filter(b => b.status !== "pending");

  const currentLoc = (allLocations || []).find(l => !l.isEnterprise && l.id === (profile?.location_id));
  const bookingUrl = currentLoc ? `${window.location.origin}/book/${currentLoc.slug || "demo"}` : "";

  const updateBooking = async (bookingId, updates) => {
    // Write directly to online_bookings table
    const dbUpdates = {};
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.processedAt !== undefined) dbUpdates.processed_at = updates.processedAt;
    if (updates.declineReason !== undefined) dbUpdates.decline_reason = updates.declineReason;
    await supabase.from('online_bookings').update(dbUpdates).eq('id', bookingId);
  };

  const acceptBooking = async (booking) => {
    // Create client
    const clientId = gid();
    const newClient = { id: clientId, fields: { first_name: booking.client?.firstName || "", last_name: booking.client?.lastName || "", phone: booking.client?.phone || "", email: booking.client?.email || "", emergency_contact: booking.client?.emergencyContact || "", emergency_phone: booking.client?.emergencyPhone || "", notes: booking.notes || "", referral_source: "Online Booking" } };
    // Create dog
    const dogId = gid();
    const newDog = { id: dogId, clientId, tags: [], fields: { name: booking.dog?.name || "", breed: booking.dog?.breed || "", weight: booking.dog?.weight || "", sex: booking.dog?.sex || "", spayed_neutered: booking.dog?.spayedNeutered || "", dob: booking.dog?.dob || "", bath_type: booking.dog?.bathType || "", temperament: "" } };
    // Create reservation — auto-assign room number from available rooms
    const resId = gid();
    const isBoarding = booking.type === "boarding";
    let assignedRoom = "";
    if (isBoarding && booking.roomType) {
      const allRooms = Array.isArray(data.rooms?.[booking.roomType]) ? data.rooms[booking.roomType] : [];
      const bCheckIn = booking.checkIn || "";
      const bCheckOut = booking.checkOut || "";
      // Find rooms occupied during these dates
      const occupiedRooms = new Set(
        (data.reservations || []).filter(r =>
          r.type === "boarding" && r.roomType === booking.roomType && r.room &&
          r.status !== "cancelled" && r.status !== "checked-out" &&
          r.checkIn < bCheckOut && r.checkOut > bCheckIn
        ).map(r => r.room)
      );
      // Assign first available room
      assignedRoom = allRooms.find(rm => !occupiedRooms.has(rm)) || allRooms[0] || "";
    }
    const newRes = {
      id: resId, clientId, dogId, type: isBoarding ? "boarding" : "evaluation",
      checkIn: isBoarding ? booking.checkIn : booking.evalDate,
      checkOut: isBoarding ? booking.checkOut : booking.evalDate,
      checkInTime: booking.checkInTime || (isBoarding ? "" : (booking.evalTime || "10:00")),
      checkOutTime: booking.checkOutTime || (isBoarding ? "" : (booking.evalTime || "11:00")),
      status: "upcoming",
      ...(isBoarding ? { roomType: booking.roomType || "", room: assignedRoom } : { daycareSize: "large" }),
      parentDestination: booking.client?.parentDestination || "",
      belongings: "",
      notes: `[Online Booking ${booking.id}] ${booking.notes || ""}`.trim(),
      ...(isBoarding && booking.pricing ? { pricing: booking.pricing } : {}),
      careOverrides: isBoarding ? { bath_type: booking.dog?.bathType || "", feeding: booking.dog?.feedingNotes || "", medications: booking.dog?.medicationNotes || "" } : {},
      bookingSource: "online",
      createdAt: new Date().toISOString(),
    };
    // Save client, dog, reservation through normal save
    await save({
      ...data,
      clients: [...data.clients, newClient],
      dogs: [...data.dogs, newDog],
      reservations: [...data.reservations, newRes],
    });
    // Update booking status directly in online_bookings table
    await supabase.from('online_bookings').update({ status: 'accepted', processed_at: new Date().toISOString() }).eq('id', booking.id);
    if (addGlobalToast) addGlobalToast(`Booking accepted — client, dog, and reservation created${assignedRoom ? ` (Room ${assignedRoom})` : ""}`, "success");
  };

  const declineBooking = async (bookingId) => {
    await updateBooking(bookingId, { status: "declined", declineReason: declineReason, processedAt: new Date().toISOString() });
    setDeclineId(null);
    setDeclineReason("");
    if (addGlobalToast) addGlobalToast("Booking declined", "default");
  };

  const fmtDate = (d) => { if (!d) return "—"; try { return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); } catch { return d; } };

  const renderBookingCard = (b) => {
    const isBoarding = b.type === "boarding";
    const isPending = b.status === "pending";
    return (
      <Card key={b.id} style={{ padding: "20px 24px", marginBottom: 12, border: isPending ? `1.5px solid ${C.acc}30` : `1px solid ${C.borderLight}`, opacity: isPending ? 1 : 0.75 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ padding: "3px 10px", borderRadius: 6, background: isBoarding ? C.pri + "15" : C.suc + "15", color: isBoarding ? C.pri : C.suc, fontSize: 11, fontWeight: 700 }}>{isBoarding ? "Boarding" : "Evaluation"}</span>
              <span style={{ fontSize: 11, color: C.textMut, fontFamily: "monospace" }}>{b.id}</span>
              {b.status === "accepted" && <span style={{ padding: "2px 8px", borderRadius: 4, background: C.suc + "15", color: C.suc, fontSize: 10, fontWeight: 700 }}>Accepted</span>}
              {b.status === "declined" && <span style={{ padding: "2px 8px", borderRadius: 4, background: C.err + "15", color: C.err, fontSize: 10, fontWeight: 700 }}>Declined</span>}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 4 }}>
              {b.status === "accepted" && b.clientId ? (
                <span style={{ color: C.pri, cursor: "pointer", textDecoration: "none", borderBottom: `1px dashed ${C.pri}40` }}
                  onClick={() => navigateTo("clientDetail", { clientId: b.clientId })}
                  onMouseEnter={e => e.target.style.borderBottomColor = C.pri}
                  onMouseLeave={e => e.target.style.borderBottomColor = C.pri + "40"}>
                  {b.client?.firstName} {b.client?.lastName}
                </span>
              ) : (
                <>{b.client?.firstName} {b.client?.lastName}</>
              )}
            </div>
            <div style={{ fontSize: 13, color: C.textSec, marginBottom: 2 }}>{b.client?.phone} · {b.client?.email}</div>
            <div style={{ fontSize: 13, color: C.text, marginTop: 8 }}>
              <strong>Dog:</strong>{" "}
              {b.status === "accepted" && b.dogId ? (
                <span style={{ color: C.pri, cursor: "pointer", borderBottom: `1px dashed ${C.pri}40` }}
                  onClick={() => navigateTo("dogDetail", { dogId: b.dogId })}
                  onMouseEnter={e => e.target.style.borderBottomColor = C.pri}
                  onMouseLeave={e => e.target.style.borderBottomColor = C.pri + "40"}>
                  {b.dog?.name} ({b.dog?.breed}{b.dog?.weight ? `, ${b.dog.weight} lbs` : ""})
                </span>
              ) : (
                <>{b.dog?.name} ({b.dog?.breed}{b.dog?.weight ? `, ${b.dog.weight} lbs` : ""})</>
              )}
            </div>
            <div style={{ fontSize: 13, color: C.textSec, marginTop: 4 }}>
              {isBoarding ? (
                <><strong>Dates:</strong> {fmtDate(b.checkIn)} — {fmtDate(b.checkOut)} · <strong>Room:</strong> {b.roomType}</>
              ) : (
                <><strong>Eval Date:</strong> {fmtDate(b.evalDate)} · <strong>Time:</strong> {b.evalTime || "—"}</>
              )}
            </div>
            {isBoarding && b.pricing && (
              <div style={{ fontSize: 13, color: C.acc, fontWeight: 600, marginTop: 4 }}>
                Total: ${b.pricing.total?.toFixed(2)} · Deposit: ${b.pricing.deposit?.toFixed(2)}
              </div>
            )}
            {b.notes && <div style={{ fontSize: 12, color: C.textMut, marginTop: 6, fontStyle: "italic" }}>"{b.notes}"</div>}
            <div style={{ fontSize: 11, color: C.textMut, marginTop: 8 }}>Submitted {b.submittedAt ? new Date(b.submittedAt).toLocaleString() : "—"}</div>
          </div>
          {isPending && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 160 }}>
              <button onClick={() => acceptBooking(b)} style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: C.suc, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Accept & Create</button>
              <button onClick={() => setDeclineId(b.id)} style={{ padding: "10px 20px", borderRadius: 10, border: `1.5px solid ${C.err}40`, background: "transparent", color: C.err, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Decline</button>
            </div>
          )}
        </div>
        {declineId === b.id && (
          <div style={{ marginTop: 12, padding: 16, background: C.bg, borderRadius: 10, border: `1px solid ${C.borderLight}` }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 8 }}>Reason for declining (optional):</div>
            <textarea value={declineReason} onChange={e => setDeclineReason(e.target.value)} rows={2} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 13, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }} placeholder="e.g. No availability, incomplete info..." />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button onClick={() => declineBooking(b.id)} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: C.err, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Confirm Decline</button>
              <button onClick={() => { setDeclineId(null); setDeclineReason(""); }} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.border}`, background: "transparent", color: C.textSec, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
            </div>
          </div>
        )}
      </Card>
    );
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: 0 }}>Online Bookings</h2>
          <div style={{ fontSize: 13, color: C.textSec, marginTop: 4 }}>Review and process customer booking requests</div>
        </div>
        {bookingUrl && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: C.textMut }}>Booking page:</span>
            <code style={{ fontSize: 12, padding: "4px 10px", borderRadius: 6, background: C.bg, border: `1px solid ${C.borderLight}`, color: C.pri, fontWeight: 600 }}>{bookingUrl}</code>
            <button onClick={() => { navigator.clipboard.writeText(bookingUrl); if (addGlobalToast) addGlobalToast("Link copied!", "success"); }} style={{ padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", color: C.textSec }}>Copy</button>
            <button onClick={() => window.open(bookingUrl, "_blank")} title="Open booking page" style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.surface, cursor: "pointer", display: "flex", alignItems: "center" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.pri} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
        {[{ key: "pending", label: "Pending", count: pending.length }, { key: "processed", label: "Processed", count: processed.length }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{ padding: "8px 20px", borderRadius: 10, border: tab === t.key ? `1.5px solid ${C.pri}` : `1.5px solid ${C.border}`, background: tab === t.key ? C.priLt : "transparent", color: tab === t.key ? C.pri : C.textSec, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}>
            {t.label}
            {t.count > 0 && <span style={{ padding: "1px 7px", borderRadius: 10, background: tab === t.key ? C.pri : C.textMut, color: "#fff", fontSize: 10, fontWeight: 700 }}>{t.count}</span>}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === "pending" && (
        pending.length === 0 ? (
          <div style={{ padding: 60, textAlign: "center", color: C.textMut }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📬</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 4 }}>No pending bookings</div>
            <div style={{ fontSize: 13 }}>When customers submit booking requests, they'll appear here.</div>
            {bookingUrl && <div style={{ fontSize: 12, marginTop: 16 }}>Share your booking link: <a href={bookingUrl} target="_blank" rel="noreferrer" style={{ color: C.pri, fontWeight: 600 }}>{bookingUrl}</a></div>}
          </div>
        ) : pending.sort((a, b) => (b.submittedAt || "").localeCompare(a.submittedAt || "")).map(renderBookingCard)
      )}
      {tab === "processed" && (
        processed.length === 0 ? (
          <div style={{ padding: 60, textAlign: "center", color: C.textMut }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: C.text, marginBottom: 4 }}>No processed bookings yet</div>
          </div>
        ) : processed.sort((a, b) => (b.processedAt || "").localeCompare(a.processedAt || "")).map(renderBookingCard)
      )}
    </div>
  );
}

export { OnlineBookingsPage };
