// Ad-hoc inventory item row extracted from InventoryPage.jsx.

import React from "react";
import { C } from "../../../shared/theme";
import { clampPositive, fmtCurrency } from "./format";

export function AdhocItemRow({ item, isReadOnly, canEditCounts, canMarkOrdered, onUpdate, onDelete }) {
  const hasFilled = item.stock_count != null && item.stock_count !== "";
  const stockValue = (hasFilled && item.unit_price != null)
    ? (parseInt(item.stock_count, 10) || 0) * parseFloat(item.unit_price || 0)
    : null;
  const countReadOnly = isReadOnly || !canEditCounts;
  const orderReadOnly = isReadOnly || !canMarkOrdered;
  const inputStyle = {
    width: "100%",
    padding: "6px 8px",
    borderRadius: 8,
    border: `2px solid ${countReadOnly ? C.border : hasFilled ? C.border : "#E6C200"}`,
    background: countReadOnly ? C.bg : hasFilled ? C.surface : "#FFFDE0",
    fontSize: 13,
    fontWeight: 600,
    textAlign: "center",
    fontFamily: "inherit",
    color: C.text,
    outline: "none",
    boxSizing: "border-box",
  };
  const cbStyle = {
    width: 18, height: 18, cursor: orderReadOnly ? "default" : "pointer",
    accentColor: C.pri, borderRadius: 4,
  };
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "2fr 80px 80px 50px 50px 80px 80px 32px",
      gap: 8,
      alignItems: "center",
      padding: "10px 16px",
      borderBottom: `1px solid ${C.borderLight}`,
      background: item.skipped ? C.bg : C.accLt + "44",
      opacity: item.skipped ? 0.5 : 1,
    }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{item.item_name}</div>
        {item.category && <div style={{ fontSize: 11, color: C.textMut }}>{item.category}</div>}
        {item.notes && <div style={{ fontSize: 11, color: C.textSec, fontStyle: "italic" }}>{item.notes}</div>}
      </div>
      {/* ON HAND */}
      <div>
        <input
          type="number" min="0"
          value={item.stock_count ?? ""}
          readOnly={countReadOnly}
          onChange={e => !countReadOnly && onUpdate(item.id, { stock_count: clampPositive(e.target.value) })}
          placeholder="0"
          style={inputStyle}
        />
      </div>
      {/* UNIT COST */}
      <div>
        <input
          type="number" min="0" step="0.01"
          value={item.unit_price ?? ""}
          readOnly={countReadOnly}
          onChange={e => !countReadOnly && onUpdate(item.id, { unit_price: e.target.value === "" ? null : e.target.value })}
          placeholder="0.00"
          style={{ ...inputStyle, fontSize: 12 }}
        />
      </div>
      {/* ORDERED */}
      <div style={{ textAlign: "center" }}>
        <input
          type="checkbox"
          checked={!!item.ordered}
          disabled={orderReadOnly}
          onChange={e => !orderReadOnly && onUpdate(item.id, { ordered: e.target.checked, ...(e.target.checked ? { skipped: false } : {}) })}
          style={cbStyle}
          title="Mark as ordered"
        />
      </div>
      {/* SKIP */}
      <div style={{ textAlign: "center" }}>
        <input
          type="checkbox"
          checked={!!item.skipped}
          disabled={orderReadOnly}
          onChange={e => !orderReadOnly && onUpdate(item.id, { skipped: e.target.checked, ...(e.target.checked ? { ordered: false } : {}) })}
          style={cbStyle}
          title="Skip this item"
        />
      </div>
      {/* VALUE */}
      <div style={{ fontSize: 12, fontWeight: 600, color: C.suc, textAlign: "right" }}>
        {stockValue != null ? fmtCurrency(stockValue) : "—"}
      </div>
      {/* TYPE */}
      <div style={{ fontSize: 11, color: C.textMut, textAlign: "center" }}>Ad-hoc</div>
      {/* DELETE */}
      {!countReadOnly && (
        <button
          onClick={() => onDelete(item.id)}
          title="Remove ad-hoc item"
          style={{ background: "none", border: "none", cursor: "pointer", color: C.dan, fontSize: 16, padding: 2, fontWeight: 700 }}
        >
          ×
        </button>
      )}
    </div>
  );
}
