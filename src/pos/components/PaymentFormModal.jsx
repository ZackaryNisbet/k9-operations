import { Btn, CustomSelect, Modal } from "./ui";
import { C } from "../constants/colors";
import { gid } from "../lib/format";
import { useState } from "react";

function PaymentFormModal({ onClose, onSave, reservation, client, existingPayment, defaultAmount, defaultType, profile }) {
  const [amt, setAmt] = useState(defaultAmount || existingPayment?.amount?.toString() || (reservation ? Math.max(0, (reservation.totalPrice || 0) - (reservation.amountCollected || 0)).toFixed(2) : ""));
  const [type, setType] = useState(defaultType || existingPayment?.type || "payment");
  const [method, setMethod] = useState(existingPayment?.method || "card");
  const [card4, setCard4] = useState(existingPayment?.cardLast4 || "");
  const [tip, setTip] = useState("");
  const [note, setNote] = useState(existingPayment?.note || "");
  const [staff, setStaff] = useState(existingPayment?.processedBy || (profile ? (profile.full_name || profile.email || "").split(/\s+/).map(w => w[0]).join("").toUpperCase().slice(0,3) : ""));
  const [err, setErr] = useState("");
  const labelS = { display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: C.text };
  const inputS = { width: "100%", padding: "10px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, color: C.text, background: C.surface, outline: "none", boxSizing: "border-box" };
  const handleSubmit = () => {
    if (!amt || parseFloat(amt) <= 0) { setErr("Enter a valid amount"); return; }
    if (!staff) { setErr("Staff initials required"); return; }
    if (method === "card" && card4.length < 4) { setErr("Enter last 4 digits of card"); return; }
    const payment = {
      id: existingPayment?.id || gid(), reservationId: reservation?.id || existingPayment?.reservationId || null,
      clientId: client?.id || existingPayment?.clientId || null, amount: parseFloat(amt) + (tip ? parseFloat(tip) : 0),
      type, method, cardLast4: method === "card" ? card4 : null, status: type === "refund" ? "refunded" : "completed",
      note: tip && parseFloat(tip) > 0 ? `${note}${note ? " | " : ""}Tip: $${parseFloat(tip).toFixed(2)}` : note,
      timestamp: existingPayment?.timestamp || new Date().toISOString(),
      stripePaymentIntentId: null, stripeRefundId: null, processedBy: staff,
    };
    onSave(payment);
  };
  const cName = client ? `${client.fields?.first_name || ""} ${client.fields?.last_name || ""}`.trim() : null;
  return (
    <Modal title={existingPayment ? "Edit Payment" : "Record Payment"} onClose={onClose}>
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        {err && <div style={{ color: "#dc2626", fontSize: 13, padding: "8px 12px", background: "rgba(220,38,38,0.08)", borderRadius: 6 }}>{err}</div>}
        {cName && <div style={{ fontSize: 13, color: C.textMut }}>Client: <strong style={{ color: C.text }}>{cName}</strong></div>}
        {reservation && <div style={{ fontSize: 13, color: C.textMut }}>Reservation: {reservation.roomType || reservation.type || "Reservation"} ({new Date(reservation.checkIn + "T12:00:00").toLocaleDateString()} – {new Date(reservation.checkOut + "T12:00:00").toLocaleDateString()})</div>}
        <div><label style={labelS}>Amount ($)</label><input type="number" step="0.01" value={amt} onChange={e => { setAmt(e.target.value); setErr(""); }} placeholder="0.00" style={inputS} /></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div><label style={labelS}>Type</label><CustomSelect value={type} onChange={v=>setType(v)} options={[{value:"payment",label:"Payment"},{value:"deposit",label:"Deposit"},{value:"tip",label:"Tip"},{value:"refund",label:"Refund"}]}/></div>
          <div><label style={labelS}>Method</label><CustomSelect value={method} onChange={v=>setMethod(v)} options={[{value:"card",label:"Card"},{value:"cash",label:"Cash"},{value:"check",label:"Check"}]}/></div>
        </div>
        {method === "card" && <div><label style={labelS}>Card Last 4</label><input maxLength={4} value={card4} onChange={e => setCard4(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="0000" style={inputS} /></div>}
        <div><label style={labelS}>Tip ($)</label><input type="number" step="0.01" value={tip} onChange={e => setTip(e.target.value)} placeholder="0.00" style={inputS} /></div>
        <div><label style={labelS}>Note</label><textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Optional note..." rows={2} style={{ ...inputS, resize: "none", fontFamily: "inherit" }} /></div>
        <div><label style={labelS}>Staff Initials</label><input maxLength={3} value={staff} onChange={e => setStaff(e.target.value.toUpperCase())} placeholder="e.g. ZN" style={inputS} /></div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
          <Btn onClick={onClose} variant="ghost">Cancel</Btn>
          <Btn onClick={handleSubmit} variant="primary">{type === "refund" ? "Issue Refund" : "Save Payment"}</Btn>
        </div>
      </div>
    </Modal>
  );
}

export { PaymentFormModal };
