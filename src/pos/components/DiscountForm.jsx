import { Btn, CustomSelect } from "./ui";
import { C } from "../constants/colors";
import { useState } from "react";

function DiscountForm({ discount, referralSources, onSave, onCancel }) {
  const [name, setName] = useState(discount?.name || "");
  const [type, setType] = useState(discount?.type || "percentage");
  const [value, setValue] = useState(discount?.value || 10);
  const [referralSourceId, setReferralSourceId] = useState(discount?.referralSourceId || "");
  const [lodgingTypes, setLodgingTypes] = useState(discount?.lodgingTypes || []);
  const [usageCap, setUsageCap] = useState(discount?.usageCap ?? 0);
  const [discountKind, setDiscountKind] = useState(discount?.discountKind || "one-time"); // "recurring" | "one-time"

  const toggleLodging = (lt) => setLodgingTypes(prev => prev.includes(lt) ? prev.filter(l => l !== lt) : [...prev, lt]);

  const inputStyle = { width: "100%", padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 14, fontFamily: "inherit", background: C.surface, color: C.text };
  const labelStyle = { fontSize: 12, fontWeight: 600, color: C.text, display: "block", marginBottom: 4 };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div><label style={labelStyle}>Discount Name *</label><input value={name} onChange={e => setName(e.target.value)} style={inputStyle} placeholder="e.g., First Responder, Friend Referral 10% Off" /></div>
      {/* Discount Kind: recurring vs one-time */}
      <div>
        <label style={labelStyle}>Discount Kind</label>
        <div style={{ display: "flex", gap: 8 }}>
          {[{ v: "recurring", l: "Recurring", d: "Auto-applies every visit for assigned clients" }, { v: "one-time", l: "One-Time", d: "Can only be used once per client" }].map(opt => (
            <button key={opt.v} onClick={() => setDiscountKind(opt.v)} style={{ flex: 1, padding: "10px 12px", borderRadius: 10, border: `2px solid ${discountKind === opt.v ? C.pri : C.border}`, background: discountKind === opt.v ? C.priLt : C.surface, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: discountKind === opt.v ? C.pri : C.text }}>{opt.l}</div>
              <div style={{ fontSize: 11, color: C.textMut, marginTop: 2 }}>{opt.d}</div>
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label style={labelStyle}>Type</label>
          <CustomSelect value={type} onChange={v=>setType(v)} options={[{value:"percentage",label:"Percentage (%)"},{value:"fixed",label:"Fixed Amount ($)"}]}/>
        </div>
        <div><label style={labelStyle}>{type === "percentage" ? "Discount %" : "Discount $"}</label><input type="number" value={value} onChange={e => setValue(parseFloat(e.target.value) || 0)} style={inputStyle} min="0" /></div>
      </div>
      <div>
        <label style={labelStyle}>Referral Source</label>
        <CustomSelect value={referralSourceId} onChange={v=>setReferralSourceId(v)} options={[{value:"",label:"Any / No specific source"},...referralSources.map(r=>({value:r.id,label:r.name}))]}/>
      </div>
      <div>
        <label style={labelStyle}>Applies to Lodging Types</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["boarding", "dayboarding", "daycare", "evaluation"].map(lt => {
            const active = lodgingTypes.includes(lt);
            return (
              <button key={lt} onClick={() => toggleLodging(lt)} style={{ padding: "6px 14px", borderRadius: 20, border: `1.5px solid ${active ? C.pri : C.border}`, background: active ? C.priLt : "transparent", color: active ? C.pri : C.text, fontSize: 13, fontWeight: active ? 600 : 400, cursor: "pointer", fontFamily: "inherit", textTransform: "capitalize" }}>
                {active && <span style={{ marginRight: 4 }}>✓</span>}{lt}
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: 11, color: C.textMut, marginTop: 4 }}>Leave empty to apply to all types</div>
      </div>
      {discountKind === "one-time" && <div>
        <label style={labelStyle}>Usage Cap per Client</label>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="number" value={usageCap} onChange={e => setUsageCap(parseInt(e.target.value) || 0)} style={{ ...inputStyle, width: 100 }} min="0" />
          <span style={{ fontSize: 12, color: C.textMut }}>{usageCap === 0 ? "Unlimited" : `Max ${usageCap} use${usageCap > 1 ? "s" : ""} per client`}</span>
        </div>
      </div>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 8 }}>
        <Btn variant="secondary" onClick={onCancel}>Cancel</Btn>
        <Btn onClick={() => { if (!name.trim()) return; onSave({ name, type, value, referralSourceId, lodgingTypes, usageCap: discountKind === "recurring" ? 0 : usageCap, discountKind }); }} disabled={!name.trim()}>
          {discount ? "Update" : "Create"}
        </Btn>
      </div>
    </div>
  );
}

export { DiscountForm };
