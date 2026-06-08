import { Btn, Card, Modal } from "./ui";
import { C } from "../constants/colors";
import { DiscountForm } from "./DiscountForm";
import { I } from "../icons";
import { React, useState } from "react";
import { gid, todayStr } from "../lib/format";

function DiscountsSection({ data, save }) {
  const [showCreate, setShowCreate] = useState(false);
  const [editDiscount, setEditDiscount] = useState(null);
  const discounts = data.discounts || [];
  const referralSources = data.referralSources || [
    { id: "ref_friend", name: "Friend/Family" },
    { id: "ref_google", name: "Google Search" },
    { id: "ref_social", name: "Social Media" },
    { id: "ref_vet", name: "Vet Referral" },
  ];

  const [newRefName, setNewRefName] = useState("");
  const [showRefManager, setShowRefManager] = useState(false);

  const addReferralSource = async () => {
    if (!newRefName.trim()) return;
    const newRef = { id: "ref_" + gid(), name: newRefName.trim() };
    await save({ ...data, referralSources: [...referralSources, newRef] });
    setNewRefName("");
  };

  const deleteReferralSource = async (refId) => {
    if (!window.confirm("Delete this referral source?")) return;
    await save({ ...data, referralSources: referralSources.filter(r => r.id !== refId) });
  };

  const handleSaveDiscount = async (disc) => {
    if (editDiscount) {
      await save({ ...data, discounts: discounts.map(d => d.id === editDiscount.id ? { ...editDiscount, ...disc } : d) });
    } else {
      await save({ ...data, discounts: [...discounts, { ...disc, id: gid(), createdAt: todayStr(), active: true }] });
    }
    setShowCreate(false);
    setEditDiscount(null);
  };

  const toggleActive = async (discId) => {
    await save({ ...data, discounts: discounts.map(d => d.id === discId ? { ...d, active: !d.active } : d) });
  };

  const deleteDiscount = async (discId) => {
    if (!window.confirm("Delete this discount?")) return;
    await save({ ...data, discounts: discounts.filter(d => d.id !== discId) });
  };

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: C.text }}>Discounts</h2>
          <p style={{ margin: "4px 0 0", fontSize: 14, color: C.textSec }}>Manage discounts linked to referral sources with usage caps</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="secondary" onClick={() => setShowRefManager(!showRefManager)} icon={<I.Users />}>Referral Sources</Btn>
          <Btn onClick={() => { setEditDiscount(null); setShowCreate(true); }} icon={<I.Plus />}>Create Discount</Btn>
        </div>
      </div>

      {/* Referral Sources Manager */}
      {showRefManager && (
        <Card style={{ marginBottom: 20, padding: "16px 20px" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 12 }}>Referral Sources</div>
          {referralSources.map(ref => (
            <div key={ref.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.borderLight}` }}>
              <span style={{ fontSize: 13, color: C.text }}>{ref.name}</span>
              <button onClick={() => deleteReferralSource(ref.id)} style={{ background: "none", border: "none", color: C.dan, cursor: "pointer", padding: 4 }}><I.Trash /></button>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <input value={newRefName} onChange={e => setNewRefName(e.target.value)} placeholder="New source name" style={{ flex: 1, padding: "6px 10px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: "inherit" }} onKeyDown={e => e.key === "Enter" && addReferralSource()} />
            <Btn size="sm" onClick={addReferralSource}>Add</Btn>
          </div>
        </Card>
      )}

      {/* Discounts List */}
      {discounts.length === 0 ? (
        <Card style={{ textAlign: "center", padding: "60px 20px" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>💰</div>
          <p style={{ fontSize: 16, fontWeight: 500, color: C.textMut, margin: 0 }}>No discounts yet. Create one to get started!</p>
        </Card>
      ) : (
        <Card>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 0.7fr 0.7fr 0.7fr 1.2fr 0.7fr 0.6fr 0.6fr", gap: 0 }}>
            {["Name", "Kind", "Type", "Value", "Referral Source", "Lodging Types", "Cap", ""].map(h => (
              <div key={h} style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", padding: "10px 12px", background: C.bg, borderBottom: `1px solid ${C.border}`, letterSpacing: "0.06em" }}>{h}</div>
            ))}
            {discounts.map(disc => {
              const ref = referralSources.find(r => r.id === disc.referralSourceId);
              const isRecurring = disc.discountKind === "recurring";
              return (
                <React.Fragment key={disc.id}>
                  <div style={{ padding: "12px 12px", borderBottom: `1px solid ${C.borderLight}`, display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: disc.active ? C.suc : C.border }} />
                    <span style={{ fontSize: 14, fontWeight: 600, color: disc.active ? C.text : C.textMut }}>{disc.name}</span>
                  </div>
                  <div style={{ padding: "12px 12px", borderBottom: `1px solid ${C.borderLight}`, fontSize: 12 }}>
                    <span style={{ padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: isRecurring ? "#DBEAFE" : "#FEF3C7", color: isRecurring ? "#1E40AF" : "#92400E" }}>{isRecurring ? "Recurring" : "One-Time"}</span>
                  </div>
                  <div style={{ padding: "12px 12px", borderBottom: `1px solid ${C.borderLight}`, fontSize: 13, color: C.text }}>{disc.type === "percentage" ? "%" : "$"}</div>
                  <div style={{ padding: "12px 12px", borderBottom: `1px solid ${C.borderLight}`, fontSize: 13, color: C.suc, fontWeight: 600 }}>{disc.type === "percentage" ? `${disc.value}%` : `$${disc.value}`}</div>
                  <div style={{ padding: "12px 12px", borderBottom: `1px solid ${C.borderLight}`, fontSize: 13, color: C.text }}>{ref ? ref.name : "Any"}</div>
                  <div style={{ padding: "12px 12px", borderBottom: `1px solid ${C.borderLight}`, fontSize: 12, color: C.textMut }}>{(disc.lodgingTypes || []).join(", ") || "All"}</div>
                  <div style={{ padding: "12px 12px", borderBottom: `1px solid ${C.borderLight}`, fontSize: 13, color: C.text }}>{isRecurring ? "—" : disc.usageCap > 0 ? `${disc.usageCap}x` : "∞"}</div>
                  <div style={{ padding: "12px 12px", borderBottom: `1px solid ${C.borderLight}`, display: "flex", gap: 4 }}>
                    <button onClick={() => toggleActive(disc.id)} style={{ background: "none", border: "none", cursor: "pointer", color: disc.active ? C.suc : C.textMut, padding: 4 }}>{disc.active ? <I.Check /> : <I.Edit />}</button>
                    <button onClick={() => { setEditDiscount(disc); setShowCreate(true); }} style={{ background: "none", border: "none", cursor: "pointer", color: C.pri, padding: 4 }}><I.Edit /></button>
                    <button onClick={() => deleteDiscount(disc.id)} style={{ background: "none", border: "none", cursor: "pointer", color: C.dan, padding: 4 }}><I.Trash /></button>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </Card>
      )}

      {/* Create/Edit Modal */}
      {showCreate && (
        <Modal title={editDiscount ? "Edit Discount" : "Create Discount"} onClose={() => { setShowCreate(false); setEditDiscount(null); }} width={480}>
          <DiscountForm discount={editDiscount} referralSources={referralSources} onSave={handleSaveDiscount} onCancel={() => { setShowCreate(false); setEditDiscount(null); }} />
        </Modal>
      )}
    </div>
  );
}

export { DiscountsSection };
