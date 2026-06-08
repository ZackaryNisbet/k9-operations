import { Badge, Card, CustomSelect } from "./ui";
import { C, TAG_COLORS } from "../constants/colors";
import { DEF_FOOD_TYPE_OPTIONS } from "../constants/dropdowns";
import { DEF_PRICING } from "../constants/pricing";
import { I } from "../icons";
import { ROOM_TYPES } from "../constants/forms";
import ReactDOM from "react-dom";
import { gid } from "../lib/format";
import { useState } from "react";

function PricingTab({ data, save }) {
  const p = data.pricing || DEF_PRICING;
  const [editingAddOn, setEditingAddOn] = useState(null); // null or { id?, name, price, serviceTypes:[], tagIds:[], autoApply }
  const [addOnConfirmDelete, setAddOnConfirmDelete] = useState(null);
  const SERVICE_TYPE_OPTIONS = [
    { id: "boarding", label: "Boarding" },
    { id: "dayboarding", label: "Day Board" },
    { id: "daycare", label: "Daycare" },
    { id: "evaluation", label: "Evaluation" },
    { id: "tour", label: "Tour" },
  ];
  const allAddOnRules = data.addOnRules || [];
  const dogTags = data.dogTags || [];

  const saveAddOnRule = async (rule) => {
    const rules = [...allAddOnRules];
    const idx = rules.findIndex(r => r.id === rule.id);
    if (idx >= 0) rules[idx] = rule; else rules.push({ ...rule, id: rule.id || gid() });
    // Also sync into pricing.addOns for backward compat
    const nextPricing = JSON.parse(JSON.stringify(p));
    if (!nextPricing.addOns) nextPricing.addOns = {};
    nextPricing.addOns[rule.name] = Number(rule.price) || 0;
    await save({ ...data, addOnRules: rules, pricing: nextPricing });
    setEditingAddOn(null);
  };
  const deleteAddOnRule = async (ruleId) => {
    const rule = allAddOnRules.find(r => r.id === ruleId);
    const rules = allAddOnRules.filter(r => r.id !== ruleId);
    // Remove from pricing.addOns too
    if (rule) {
      const nextPricing = JSON.parse(JSON.stringify(p));
      if (nextPricing.addOns) { delete nextPricing.addOns[rule.name]; }
      await save({ ...data, addOnRules: rules, pricing: nextPricing });
    } else {
      await save({ ...data, addOnRules: rules });
    }
    setAddOnConfirmDelete(null);
  };

  const update = async (path, val) => {
    const next = JSON.parse(JSON.stringify(p));
    const keys = path.split(".");
    let obj = next;
    for (let i = 0; i < keys.length - 1; i++) { if (!obj[keys[i]]) obj[keys[i]] = {}; obj = obj[keys[i]]; }
    obj[keys[keys.length - 1]] = val;
    await save({ ...data, pricing: next });
  };
  const fmtCurrency = (v) => `$${Number(v || 0).toFixed(2)}`;

  const sectionStyle = { marginBottom: 28 };
  const sectionTitle = (t, sub) => (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{t}</div>
      {sub && <div style={{ fontSize: 12, color: C.textSec, marginTop: 2 }}>{sub}</div>}
    </div>
  );
  const rateRow = (label, path, val, placeholder) => (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderRadius: 10, background: C.bg, border: `1px solid ${C.borderLight}`, marginBottom: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.textSec }}>$</span>
        <input type="number" value={val ?? ""} onChange={e => update(path, e.target.value === "" ? 0 : Number(e.target.value))}
          style={{ width: 80, padding: "6px 10px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.surface, fontSize: 13, fontWeight: 600, color: C.text, fontFamily: "inherit", textAlign: "right" }}
          placeholder={placeholder || "0"} />
      </div>
    </div>
  );



  return (
    <div>
      {/* Boarding Rates */}
      <Card style={{ padding: "24px 28px", marginBottom: 16 }}>
        {sectionTitle("Boarding Rates", "Per-night rate for each room type.")}
        {ROOM_TYPES.map(rt => rateRow(rt, `boardingRates.${rt}`, (p.boardingRates || {})[rt], "0"))}
      </Card>

      {/* Daycare Rates */}
      <Card style={{ padding: "24px 28px", marginBottom: 16 }}>
        {sectionTitle("Daycare Rates", `Full day and half day rates. Half day = under ${p.halfDayThreshold || 5} hours.`)}
        {rateRow("Full Day", "daycareRates.fullDay", (p.daycareRates || {}).fullDay, "45")}
        {rateRow("Half Day", "daycareRates.halfDay", (p.daycareRates || {}).halfDay, "30")}
        <div style={{ marginTop: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 10, background: C.bg, border: `1px solid ${C.borderLight}` }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Half-Day Threshold (hours)</span>
            <input type="number" value={p.halfDayThreshold ?? 5} onChange={e => update("halfDayThreshold", Number(e.target.value) || 5)}
              style={{ width: 60, padding: "6px 10px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.surface, fontSize: 13, fontWeight: 600, color: C.text, fontFamily: "inherit", textAlign: "right" }} />
          </div>
        </div>
      </Card>

      {/* Service Fees */}
      <Card style={{ padding: "24px 28px", marginBottom: 16 }}>
        {sectionTitle("Service Fees", "Evaluations, tours, and other services.")}
        {rateRow("Day Boarding", "dayboardingRate", p.dayboardingRate, "49")}
        {rateRow("Evaluation", "evaluationFee", p.evaluationFee, "25")}
        {rateRow("Tour", "tourFee", p.tourFee, "0")}
      </Card>

      {/* Food Type Pricing (per serving) */}
      <Card style={{ padding: "24px 28px", marginBottom: 16 }}>
        {sectionTitle("Food Pricing (Per Serving)", "Charge per feeding for each food type. AM/PM feeding is auto-calculated based on check-in/check-out times.")}
        {(data.foodTypeOptions || DEF_FOOD_TYPE_OPTIONS).map(ft => {
          const ftp = p.foodTypePricing || {};
          return rateRow(ft, `foodTypePricing.${ft}`, ftp[ft], "0");
        })}
      </Card>

      {/* Medication Pricing (per serving) */}
      <Card style={{ padding: "24px 28px", marginBottom: 16 }}>
        {sectionTitle("Medication Pricing (Per Serving)", "Charge per medication administration. Same AM/PM logic as food.")}
        {["Bagged", "Unbagged"].map(mt => {
          const mp = p.medPricing || {};
          return rateRow(`Medication (${mt})`, `medPricing.${mt}`, mp[mt], "0");
        })}
      </Card>

      {/* Add-Ons Management */}
      <Card style={{ padding: "24px 28px", marginBottom: 16 }}>
        {sectionTitle("Add-Ons", "Create, edit, and manage add-ons. Assign service types and dog tags to auto-apply add-ons to matching reservations.")}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {allAddOnRules.map(rule => (
            <div key={rule.id} style={{ padding: "12px 16px", borderRadius: 10, background: C.bg, border: `1px solid ${C.borderLight}`, display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{rule.name}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.suc }}>${Number(rule.price || 0).toFixed(2)}</span>
                  {rule.autoApply && <span style={{ fontSize: 9, fontWeight: 700, background: C.warn + "20", color: C.warn, padding: "2px 6px", borderRadius: 6 }}>AUTO-APPLY</span>}
                </div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {(rule.serviceTypes || []).length > 0 ? rule.serviceTypes.map(st => {
                    const label = SERVICE_TYPE_OPTIONS.find(o => o.id === st)?.label || st;
                    return <span key={st} style={{ fontSize: 10, background: C.priO, color: C.pri, padding: "1px 6px", borderRadius: 6, fontWeight: 600 }}>{label}</span>;
                  }) : <span style={{ fontSize: 10, color: C.textMut, fontStyle: "italic" }}>All service types</span>}
                  {(rule.tagIds || []).length > 0 && rule.tagIds.map(tid => {
                    const tag = dogTags.find(t => t.id === tid);
                    const tc = tag ? TAG_COLORS[tag.colorIdx % TAG_COLORS.length] : { bg: C.surfaceHover, text: C.textMut };
                    return <span key={tid} style={{ fontSize: 10, background: tc.bg, color: tc.text, padding: "1px 6px", borderRadius: 6, fontWeight: 600 }}>{tag?.name || tid}</span>;
                  })}
                  {(rule.tagIds || []).length === 0 && <span style={{ fontSize: 10, color: C.textMut, fontStyle: "italic" }}>All tags</span>}
                </div>
              </div>
              <button onClick={() => setEditingAddOn({ ...rule })} style={{ border: "none", background: "none", cursor: "pointer", color: C.textMut, padding: 4 }}><I.Edit /></button>
              {addOnConfirmDelete === rule.id ? (
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <button onClick={() => deleteAddOnRule(rule.id)} style={{ padding: "3px 8px", borderRadius: 6, border: "none", background: C.dan, color: "#fff", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Confirm</button>
                  <button onClick={() => setAddOnConfirmDelete(null)} style={{ padding: "3px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: C.textMut, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                </div>
              ) : (
                <button onClick={() => setAddOnConfirmDelete(rule.id)} style={{ border: "none", background: "none", cursor: "pointer", color: C.textMut, padding: 4 }}><I.Trash /></button>
              )}
            </div>
          ))}
          {allAddOnRules.length === 0 && (
            <div style={{ textAlign: "center", padding: 20, color: C.textMut, fontSize: 13, fontStyle: "italic" }}>No add-ons configured. Click below to create your first add-on.</div>
          )}
        </div>
        <button onClick={() => setEditingAddOn({ id: "", name: "", price: 0, serviceTypes: [], tagIds: [], autoApply: false })}
          style={{ marginTop: 12, padding: "10px 16px", borderRadius: 8, border: `1.5px dashed ${C.border}`, background: "transparent", color: C.pri, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", width: "100%", transition: "all 0.15s" }}>
          + Add New Add-On
        </button>

        {/* Add-On Editor Modal */}
        {editingAddOn && ReactDOM.createPortal(
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,10,30,0.55)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }} onClick={() => setEditingAddOn(null)}>
            <div onClick={e => e.stopPropagation()} style={{ background: C.surface, borderRadius: 20, width: 500, maxHeight: "85vh", overflowY: "auto", boxShadow: "0 24px 80px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.06)" }}>
              {/* Header */}
              <div style={{ padding: "24px 28px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: C.text, letterSpacing: "-0.02em", fontFamily: "'Outfit', -apple-system, sans-serif" }}>{editingAddOn.id ? "Edit Add-On" : "New Add-On"}</div>
                  <div style={{ fontSize: 12, color: C.textMut, marginTop: 2, fontFamily: "'Outfit', -apple-system, sans-serif" }}>Configure pricing, service types, and auto-apply rules</div>
                </div>
                <button onClick={() => setEditingAddOn(null)} style={{ width: 32, height: 32, borderRadius: 8, border: "none", background: C.surfaceHover, color: C.textMut, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontFamily: "inherit" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>

              <div style={{ padding: "20px 28px 28px" }}>
                {/* Name + Price row */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: 12, marginBottom: 20 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: C.textSec, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6, display: "block", fontFamily: "'Outfit', -apple-system, sans-serif" }}>Name</label>
                    <input value={editingAddOn.name} onChange={e => setEditingAddOn(prev => ({ ...prev, name: e.target.value }))}
                      autoFocus placeholder="Pamper Package"
                      style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: `1.5px solid ${editingAddOn.name.trim() ? C.border : C.dan + "60"}`, background: C.bg, fontSize: 14, fontWeight: 600, color: C.text, fontFamily: "'Outfit', -apple-system, sans-serif", boxSizing: "border-box", outline: "none", transition: "border-color 0.15s" }}
                      onFocus={e => e.target.style.borderColor = C.pri} onBlur={e => e.target.style.borderColor = editingAddOn.name.trim() ? C.border : C.dan + "60"} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: C.textSec, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6, display: "block", fontFamily: "'Outfit', -apple-system, sans-serif" }}>Price</label>
                    <div style={{ position: "relative" }}>
                      <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, fontWeight: 700, color: C.textMut, fontFamily: "'Outfit', -apple-system, sans-serif" }}>$</span>
                      <input type="number" min="0" step="0.01" value={editingAddOn.price || ""} onChange={e => {
                        const val = e.target.value === "" ? 0 : Math.max(0, Number(e.target.value));
                        setEditingAddOn(prev => ({ ...prev, price: val }));
                      }}
                        placeholder="0.00"
                        style={{ width: "100%", padding: "11px 14px 11px 28px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: C.bg, fontSize: 14, fontWeight: 700, color: C.text, fontFamily: "'Outfit', -apple-system, sans-serif", boxSizing: "border-box", outline: "none", transition: "border-color 0.15s" }}
                        onFocus={e => e.target.style.borderColor = C.pri} onBlur={e => e.target.style.borderColor = C.border} />
                    </div>
                  </div>
                </div>

                {/* Divider */}
                <div style={{ height: 1, background: C.borderLight, margin: "0 -28px 20px", width: "calc(100% + 56px)" }} />

                {/* Service Types */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 8 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: C.textSec, textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "'Outfit', -apple-system, sans-serif" }}>Applies to Services</label>
                    {(editingAddOn.serviceTypes || []).length === 0 && <span style={{ fontSize: 10, color: C.suc, fontWeight: 600, fontFamily: "'Outfit', -apple-system, sans-serif" }}>All types</span>}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {SERVICE_TYPE_OPTIONS.map(opt => {
                      const sel = (editingAddOn.serviceTypes || []).includes(opt.id);
                      return (
                        <button key={opt.id} onClick={() => setEditingAddOn(prev => {
                          const curr = prev.serviceTypes || [];
                          return { ...prev, serviceTypes: sel ? curr.filter(s => s !== opt.id) : [...curr, opt.id] };
                        })}
                          style={{ padding: "8px 16px", borderRadius: 20, border: `1.5px solid ${sel ? C.pri : C.border}`, background: sel ? C.pri : C.bg, color: sel ? "#fff" : C.textSec, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Outfit', -apple-system, sans-serif", transition: "all 0.15s", letterSpacing: "0.01em" }}>
                          {sel && <span style={{ marginRight: 4 }}>&#10003;</span>}{opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Dog Tags */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 8 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: C.textSec, textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "'Outfit', -apple-system, sans-serif" }}>Applies to Dog Tags</label>
                    {(editingAddOn.tagIds || []).length === 0 && <span style={{ fontSize: 10, color: C.suc, fontWeight: 600, fontFamily: "'Outfit', -apple-system, sans-serif" }}>All dogs</span>}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {dogTags.map(tag => {
                      const sel = (editingAddOn.tagIds || []).includes(tag.id);
                      const tc = TAG_COLORS[tag.colorIdx % TAG_COLORS.length];
                      return (
                        <button key={tag.id} onClick={() => setEditingAddOn(prev => {
                          const curr = prev.tagIds || [];
                          return { ...prev, tagIds: sel ? curr.filter(t => t !== tag.id) : [...curr, tag.id] };
                        })}
                          style={{ padding: "8px 16px", borderRadius: 20, border: `1.5px solid ${sel ? tc.text : C.border}`, background: sel ? tc.bg : C.bg, color: sel ? tc.text : C.textSec, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Outfit', -apple-system, sans-serif", transition: "all 0.15s" }}>
                          {sel && <span style={{ marginRight: 4 }}>&#10003;</span>}{tag.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Divider */}
                <div style={{ height: 1, background: C.borderLight, margin: "0 -28px 20px", width: "calc(100% + 56px)" }} />

                {/* Auto-Apply Toggle */}
                <div style={{ marginBottom: 24, display: "flex", alignItems: "center", gap: 12, padding: "16px 18px", borderRadius: 14, background: editingAddOn.autoApply ? `${C.suc}08` : C.bg, border: `1.5px solid ${editingAddOn.autoApply ? C.suc + "40" : C.borderLight}`, cursor: "pointer", transition: "all 0.2s" }}
                  onClick={() => setEditingAddOn(prev => ({ ...prev, autoApply: !prev.autoApply }))}>
                  <div style={{ width: 44, height: 24, borderRadius: 12, background: editingAddOn.autoApply ? C.suc : C.border, position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
                    <div style={{ width: 18, height: 18, borderRadius: 9, background: "#fff", position: "absolute", top: 3, left: editingAddOn.autoApply ? 23 : 3, transition: "left 0.2s cubic-bezier(0.4,0,0.2,1)", boxShadow: "0 1px 4px rgba(0,0,0,0.15)" }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.text, fontFamily: "'Outfit', -apple-system, sans-serif" }}>Auto-Apply to Matching Reservations</div>
                    <div style={{ fontSize: 11, color: C.textMut, marginTop: 1, fontFamily: "'Outfit', -apple-system, sans-serif" }}>
                      {editingAddOn.autoApply
                        ? `Will auto-add to ${(editingAddOn.serviceTypes || []).length > 0 ? (editingAddOn.serviceTypes || []).map(s => SERVICE_TYPE_OPTIONS.find(o => o.id === s)?.label || s).join(", ") : "all"} reservations` + ((editingAddOn.tagIds || []).length > 0 ? ` for ${(editingAddOn.tagIds || []).map(t => dogTags.find(d => d.id === t)?.name || t).join(", ")} dogs` : "")
                        : "When enabled, this add-on attaches automatically when service type and tags match"}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => setEditingAddOn(null)}
                    style={{ flex: 1, padding: "12px 20px", borderRadius: 12, border: `1.5px solid ${C.border}`, background: "transparent", color: C.textSec, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'Outfit', -apple-system, sans-serif", transition: "all 0.15s" }}
                    onMouseEnter={e => e.target.style.background = C.surfaceHover} onMouseLeave={e => e.target.style.background = "transparent"}>
                    Cancel
                  </button>
                  <button onClick={() => {
                    if (!editingAddOn.name.trim()) return;
                    saveAddOnRule({ ...editingAddOn, id: editingAddOn.id || gid(), price: Math.max(0, Number(editingAddOn.price) || 0) });
                  }} disabled={!editingAddOn.name.trim()}
                    style={{ flex: 2, padding: "12px 24px", borderRadius: 12, border: "none", background: editingAddOn.name.trim() ? C.pri : C.border, color: "#fff", fontSize: 13, fontWeight: 700, cursor: editingAddOn.name.trim() ? "pointer" : "default", fontFamily: "'Outfit', -apple-system, sans-serif", transition: "all 0.15s", boxShadow: editingAddOn.name.trim() ? "0 4px 12px rgba(0,40,100,0.2)" : "none" }}>
                    {editingAddOn.id ? "Save Changes" : "Create Add-On"}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
      </Card>

      {/* Discount Rules */}
      <Card style={{ padding: "24px 28px", marginBottom: 16 }}>
        {sectionTitle("Discount Rules", "Automatic discounts applied during booking.")}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderRadius: 10, background: C.bg, border: `1px solid ${C.borderLight}` }}>
          <div>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Multi-Dog Same Room Discount</span>
            <div style={{ fontSize: 11, color: C.textSec, marginTop: 2 }}>Applied to 2nd dog when same owner boards 2 dogs in the same room.</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <input type="number" value={p.multiDogDiscount ?? 20} onChange={e => update("multiDogDiscount", Number(e.target.value) || 0)}
              style={{ width: 60, padding: "6px 10px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.surface, fontSize: 13, fontWeight: 600, color: C.text, fontFamily: "inherit", textAlign: "right" }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: C.textSec }}>%</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderRadius: 10, background: C.bg, border: `1px solid ${C.borderLight}`, marginTop: 8 }}>
          <div>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Private Play Surcharge</span>
            <div style={{ fontSize: 11, color: C.textSec, marginTop: 2 }}>Auto-applied per night for dogs with a Private Play tag. Prorated if tag is added mid-stay.</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.textSec }}>$</span>
            <input type="number" value={p.privatePlaySurcharge ?? 10} onChange={e => update("privatePlaySurcharge", Number(e.target.value) || 0)}
              style={{ width: 60, padding: "6px 10px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.surface, fontSize: 13, fontWeight: 600, color: C.text, fontFamily: "inherit", textAlign: "right" }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: C.textSec }}>/night</span>
          </div>
        </div>
      </Card>

      {/* Payment Rules */}
      <Card style={{ padding: "24px 28px" }}>
        {sectionTitle("Payment Rules", "Deposit requirements and when payment is due for each reservation type.")}
        {["boarding", "dayboarding", "daycare", "evaluation", "tour"].map(type => {
          const rule = (p.paymentRules || {})[type] || {};
          const label = type.charAt(0).toUpperCase() + type.slice(1);
          return (
            <div key={type} style={{ padding: "14px 16px", borderRadius: 10, background: C.bg, border: `1px solid ${C.borderLight}`, marginBottom: 8 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 8 }}>{label}</div>
              <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.textSec }}>Deposit:</span>
                  <input type="number" value={rule.depositPercent ?? 0} onChange={e => update(`paymentRules.${type}.depositPercent`, Number(e.target.value) || 0)}
                    style={{ width: 60, padding: "5px 8px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.surface, fontSize: 12, fontWeight: 600, color: C.text, fontFamily: "inherit", textAlign: "right" }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.textSec }}>%</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.textSec }}>Pay at:</span>
                  <CustomSelect value={rule.payAt||"booking"} onChange={v=>update(`paymentRules.${type}.payAt`,v)} options={[{value:"booking",label:"Booking"},{value:"checkout",label:"Checkout"},{value:"free",label:"Free"}]} small style={{width:110}}/>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: C.textSec, cursor: "pointer" }}>
                  <input type="checkbox" checked={rule.depositRefundable || false} onChange={e => update(`paymentRules.${type}.depositRefundable`, e.target.checked)}
                    style={{ accentColor: C.pri }} />
                  Refundable deposit
                </label>
              </div>
            </div>
          );
        })}
      </Card>

      {/* Service Descriptions */}
      <Card style={{ padding: "24px 28px", marginTop: 16 }}>
        {sectionTitle("Service Descriptions", "These descriptions appear in auto-generated package details and on the customer booking page.")}
        {(() => {
          const allServices = [];
          Object.keys(p.boardingRates || {}).forEach(svc => { if ((p.boardingRates[svc] || 0) > 0) allServices.push({ name: svc, category: "Boarding" }); });
          if ((p.daycareRates?.fullDay || 0) > 0) allServices.push({ name: "Full Day Daycare", category: "Daycare" });
          if ((p.daycareRates?.halfDay || 0) > 0) allServices.push({ name: "Half Day Daycare", category: "Daycare" });
          if ((p.dayboardingRate || 0) > 0) allServices.push({ name: "Day Boarding", category: "Daycare" });
          if ((data.addOnRules || []).length > 0) {
            (data.addOnRules || []).forEach(r => { if ((r.price || 0) > 0) allServices.push({ name: r.name, category: "Add-On" }); });
          } else {
            Object.keys(p.addOns || {}).forEach(svc => { if ((p.addOns[svc] || 0) > 0) allServices.push({ name: svc, category: "Add-On" }); });
          }
          const descs = data.serviceDescriptions || {};
          const defaults = {
            "Luxury Suite": "Our most spacious cage-free suite featuring Kuranda luxury bedding, flat-screen TV tuned to Dog TV, glass privacy doors, and a sound-resistant environment.",
            "Executive Room": "A generous cage-free room with Kuranda bedding, glass privacy doors, and top-of-the-line Snyder enclosures. Ideal for one or two dogs.",
            "Double Compartment": "A comfortable compartment with comfort mat bedding, perfect for dogs up to 100 lbs or those who participate in daycare during the day.",
            "Single Compartment": "A cozy compartment ideal for smaller dogs under 35 lbs or those who are comfortably crate-trained at home.",
            "Full Day Daycare": "A full day of supervised play, socialization, and enrichment activities with other dogs, including meals and rest periods.",
            "Half Day Daycare": "A half day of supervised play and socialization, perfect for dogs who need a shorter session of enrichment.",
            "Day Boarding": "Daytime boarding with supervised play and socialization, ideal for dogs who need care during the day without overnight stays.",
          };
          return allServices.map(svc => (
            <div key={svc.name} style={{ marginBottom: 10, padding: "12px 16px", borderRadius: 10, background: C.bg, border: `1px solid ${C.borderLight}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{svc.name}</span>
                <Badge size="sm" color="default">{svc.category}</Badge>
              </div>
              <textarea
                value={descs[svc.name] ?? defaults[svc.name] ?? ""}
                onChange={(e) => save({ ...data, serviceDescriptions: { ...descs, [svc.name]: e.target.value } })}
                placeholder="Describe this service in 1-2 sentences..."
                rows={2}
                style={{ width: "100%", padding: "8px 10px", border: `1.5px solid ${C.border}`, borderRadius: 8, background: C.surface, fontSize: 12, color: C.text, fontFamily: "inherit", resize: "vertical", lineHeight: 1.5 }}
                className="no-focus-ring"
              />
            </div>
          ));
        })()}
      </Card>
    </div>
  );
}

export { PricingTab };
