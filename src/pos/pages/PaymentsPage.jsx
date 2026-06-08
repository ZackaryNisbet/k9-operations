import { Btn, CustomSelect, Modal } from "../components/ui";
import { C } from "../constants/colors";
import { DEF_PRICING } from "../constants/pricing";
import { I } from "../icons";
import { PaymentFormModal } from "../components/PaymentFormModal";
import { countNights } from "../lib/pricing";
import { useState } from "react";

function PaymentsPage({ data, save, nav, profile }) {
  const [search, setSearch] = useState("");
  const [typeF, setTypeF] = useState("all");
  const [methodF, setMethodF] = useState("all");
  const [statusF, setStatusF] = useState("all");
  const [sortBy, setSortBy] = useState("timestamp");
  const [sortDir, setSortDir] = useState("desc");
  const [showModal, setShowModal] = useState(false);
  const [editPmt, setEditPmt] = useState(null);
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");

  const payments = data.payments || [];
  const reservations = data.reservations || [];
  const clients = data.clients || [];
  const getClient = (id) => clients.find(c => c.id === id);
  const getRes = (id) => reservations.find(r => r.id === id);
  const cName = (c) => c ? `${c.fields?.first_name || ""} ${c.fields?.last_name || ""}`.trim() || "Client" : "N/A";

  const now = new Date(); const todayStr = now.toISOString().slice(0, 10);
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay()); const weekStr = weekStart.toISOString().slice(0, 10);
  const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const completed = payments.filter(p => p.status === "completed");
  const todayRev = completed.filter(p => p.timestamp.slice(0, 10) === todayStr).reduce((s, p) => s + p.amount, 0);
  const weekRev = completed.filter(p => p.timestamp.slice(0, 10) >= weekStr).reduce((s, p) => s + p.amount, 0);
  const monthRev = completed.filter(p => p.timestamp.slice(0, 7) === monthStr).reduce((s, p) => s + p.amount, 0);
  const outstanding = reservations.reduce((s, r) => s + Math.max(0, (r.totalPrice || 0) - (r.amountCollected || 0)), 0);

  let filtered = payments.filter(p => {
    const c = getClient(p.clientId);
    if (search && !cName(c).toLowerCase().includes(search.toLowerCase())) return false;
    if (typeF !== "all" && p.type !== typeF) return false;
    if (methodF !== "all" && p.method !== methodF) return false;
    if (statusF !== "all" && p.status !== statusF) return false;
    return true;
  });
  filtered = [...filtered].sort((a, b) => {
    const av = sortBy === "timestamp" ? new Date(a.timestamp).getTime() : a.amount;
    const bv = sortBy === "timestamp" ? new Date(b.timestamp).getTime() : b.amount;
    return sortDir === "asc" ? av - bv : bv - av;
  });

  const toggleSort = (f) => { if (sortBy === f) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortBy(f); setSortDir("desc"); } };

  const handleSave = async (pmt) => {
    const idx = payments.findIndex(p => p.id === pmt.id);
    const updated = idx >= 0 ? payments.map(p => p.id === pmt.id ? pmt : p) : [...payments, pmt];
    const newData = { ...data, payments: updated };
    // Update reservation amountCollected
    if (pmt.reservationId) {
      const ri = newData.reservations.findIndex(r => r.id === pmt.reservationId);
      if (ri >= 0) {
        const resPmts = updated.filter(p => p.reservationId === pmt.reservationId && p.status === "completed" && p.type !== "refund");
        const resRefunds = updated.filter(p => p.reservationId === pmt.reservationId && (p.status === "refunded" || p.type === "refund"));
        const newCollected = resPmts.reduce((s, p) => s + p.amount, 0) - resRefunds.reduce((s, p) => s + p.amount, 0);
        const res = newData.reservations[ri];
        const pricing = data.pricing || DEF_PRICING;
        const nights = Math.max(1, countNights(res.checkIn, res.checkOut));
        const rate = (pricing.boardingRates || {})[res.roomType] || 0;
        const estTotal = rate * nights;
        const depReq = Math.round(estTotal * 0.5 * 100) / 100;
        newData.reservations = [...newData.reservations];
        newData.reservations[ri] = { ...res, amountCollected: newCollected, noDeposit: newCollected < depReq };
      }
    }
    await save(newData);
    setShowModal(false); setEditPmt(null); setShowClientPicker(false);
  };

  const statusBg = { completed: "rgba(16,185,129,0.12)", pending: "rgba(245,158,11,0.12)", refunded: "rgba(239,68,68,0.12)", failed: "rgba(239,68,68,0.12)" };
  const statusClr = { completed: "#10b981", pending: "#f59e0b", refunded: "#ef4444", failed: "#ef4444" };
  const typeBg = { payment: `rgba(20,83,45,0.1)`, deposit: "rgba(14,165,233,0.1)", tip: "rgba(236,72,153,0.1)", refund: "rgba(239,68,68,0.1)" };
  const typeClr = { payment: C.pri, deposit: "#0ea5e9", tip: "#ec4899", refund: "#ef4444" };
  const thS = { padding: "10px 12px", textAlign: "left", fontSize: 12, fontWeight: 600, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.03em" };
  const tdS = { padding: "10px 12px", fontSize: 14, color: C.text };
  const cardS = { background: C.card, borderRadius: 10, border: `1px solid ${C.border}`, padding: 16 };
  const inputS = { width: "100%", padding: "10px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, color: C.text, background: C.surface, outline: "none", boxSizing: "border-box" };
  const SortIcon = ({ field }) => sortBy === field ? (sortDir === "asc" ? <I.SortAsc /> : <I.SortDesc />) : <I.SortNone />;

  const openRecordPayment = () => { setEditPmt(null); setShowClientPicker(true); setPickerSearch(""); };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, color: C.text }}>Payments</h1>
        <Btn onClick={openRecordPayment} variant="primary" icon={<I.Plus />}>Record Payment</Btn>
      </div>

      {/* Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 24 }}>
        {[["Today's Revenue", todayRev, C.pri], ["Outstanding", outstanding, "#ef4444"], ["This Week", weekRev, C.pri], ["This Month", monthRev, C.pri]].map(([label, val, clr]) => (
          <div key={label} style={cardS}>
            <div style={{ fontSize: 11, color: C.textMut, textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.04em", marginBottom: 6 }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: clr }}>${val.toFixed(2)}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ ...cardS, padding: 20 }}>
        <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ flex: 1, minWidth: 180, position: "relative" }}>
            <div style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", opacity: 0.4 }}><I.Search /></div>
            <input data-shortcut-search="1" placeholder="Search by client..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...inputS, paddingLeft: 34 }} />
          </div>
          {[["Type", typeF, setTypeF, ["all","payment","deposit","tip","refund"]], ["Method", methodF, setMethodF, ["all","card","cash","check"]], ["Status", statusF, setStatusF, ["all","completed","pending","refunded","failed"]]].map(([lbl, val, set, opts]) => (
            <CustomSelect key={lbl} value={val} onChange={v=>set(v)} options={opts.map(o=>({value:o,label:o==="all"?`All ${lbl}${lbl.endsWith("s")?"es":"s"}`:o.charAt(0).toUpperCase()+o.slice(1)}))} small style={{width:130}}/>
          ))}
        </div>

        {/* Table */}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${C.border}` }}>
                <th style={{ ...thS, cursor: "pointer" }} onClick={() => toggleSort("timestamp")}>Date <SortIcon field="timestamp" /></th>
                <th style={thS}>Client</th>
                <th style={thS}>Reservation</th>
                <th style={{ ...thS, textAlign: "right", cursor: "pointer" }} onClick={() => toggleSort("amount")}>Amount <SortIcon field="amount" /></th>
                <th style={thS}>Type</th>
                <th style={thS}>Method</th>
                <th style={thS}>Status</th>
                <th style={thS}>Staff</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const c = getClient(p.clientId); const r = getRes(p.reservationId);
                return (
                  <tr key={p.id} style={{ borderBottom: `1px solid ${C.border}` }} onClick={() => { setEditPmt(p); setShowModal(true); }}>
                    <td style={tdS}>{new Date(p.timestamp).toLocaleDateString()}</td>
                    <td style={{ ...tdS, color: C.pri, fontWeight: 500, cursor: "pointer" }} onClick={e => { e.stopPropagation(); if (c) nav("client-detail", { clientId: c.id }); }}>{cName(c)}</td>
                    <td style={{ ...tdS, fontSize: 13, color: C.textMut }}>{r ? `${r.roomType || r.type || "Reservation"} (${new Date(r.checkIn + "T12:00:00").toLocaleDateString()})` : "—"}</td>
                    <td style={{ ...tdS, textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>${p.amount.toFixed(2)}</td>
                    <td style={tdS}><span style={{ padding: "3px 8px", borderRadius: 4, fontSize: 12, fontWeight: 600, background: typeBg[p.type], color: typeClr[p.type] }}>{p.type}</span></td>
                    <td style={{ ...tdS, fontSize: 13 }}>{p.method === "card" ? `Card •••• ${p.cardLast4 || ""}` : p.method.charAt(0).toUpperCase() + p.method.slice(1)}</td>
                    <td style={tdS}><span style={{ padding: "3px 8px", borderRadius: 4, fontSize: 12, fontWeight: 600, background: statusBg[p.status], color: statusClr[p.status] }}>{p.status}</span></td>
                    <td style={{ ...tdS, fontSize: 13, fontWeight: 500 }}>{p.processedBy}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && <div style={{ textAlign: "center", padding: 40, color: C.textMut }}>No payments found</div>}
        <div style={{ marginTop: 12, fontSize: 12, color: C.textMut }}>{filtered.length} transaction{filtered.length !== 1 ? "s" : ""} · Stripe integration ready</div>
      </div>

      {/* Client Picker for new payment */}
      {showClientPicker && (
        <Modal title="Select Client for Payment" onClose={() => setShowClientPicker(false)}>
          <div style={{ padding: 16 }}>
            <input placeholder="Search clients..." value={pickerSearch} onChange={e => setPickerSearch(e.target.value)} style={inputS} autoFocus />
            <div style={{ maxHeight: 300, overflowY: "auto", marginTop: 12 }}>
              {clients.filter(c => !pickerSearch || cName(c).toLowerCase().includes(pickerSearch.toLowerCase())).slice(0, 20).map(c => (
                <div key={c.id} onClick={() => { setShowClientPicker(false); setEditPmt(null); setShowModal(true); setEditPmt({ __newForClient: c }); }} style={{ padding: "10px 12px", borderBottom: `1px solid ${C.border}`, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div><div style={{ fontWeight: 600, fontSize: 14, color: C.text }}>{cName(c)}</div><div style={{ fontSize: 12, color: C.textMut }}>{c.fields?.phone || ""}</div></div>
                  <I.ChevronRight />
                </div>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {/* Payment Form Modal */}
      {showModal && (
        <PaymentFormModal
          onClose={() => { setShowModal(false); setEditPmt(null); }}
          onSave={handleSave}
          reservation={editPmt?.__newForClient ? null : getRes(editPmt?.reservationId)}
          client={editPmt?.__newForClient || getClient(editPmt?.clientId)}
          existingPayment={editPmt?.__newForClient ? null : editPmt}
          profile={profile}
        />
      )}
    </div>
  );
}

export { PaymentsPage };
