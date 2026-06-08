// Standardized dense-table cells extracted from InventoryPage.jsx (the listSurface
// rebuild). These render the inventory columns inside the shared <DenseTable>. They
// reuse the exact count/ordered logic from the legacy ItemRow, but fix the product
// cell so the link + note + edit affordances are always visible (never clipped by a
// long name), per the Marketing Events table treatment.

import React from "react";
import { C } from "../../../shared/theme";
import { I } from "../../../shared/icons";
import { getInventoryVendorHref } from "../inventoryCatalog";
import { clampPositive, fmtAuditTime } from "./format";

export const INV_DASH = <span style={{ color: C.textMut, fontSize: 12 }}>—</span>;
export const invMiniLinkStyle = { flexShrink: 0, color: C.info, display: "inline-flex", alignItems: "center" };

// Hover-revealed pencil (Marketing Events affordance). Stays put via flex-shrink:0
// so it never participates in the name's ellipsis truncation.
export function InvCellPencil({ onClick, title }) {
  return (
    <button
      className="inv-hover-affordance"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={title}
      style={{ flexShrink: 0, padding: 0, width: 16, height: 16, border: "none", background: "transparent", color: C.pri, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
    >
      <I.Edit />
    </button>
  );
}

// On Hand (emphasizeEmpty → amber until filled) and In Transit share this input.
export function InvCountInput({ value, readOnly, emphasizeEmpty = false, onChange, onKeyDown, registerInput, itemId, field, title }) {
  const filled = value !== "" && value != null;
  const idleBorder = emphasizeEmpty && !filled ? "#E6C200" : C.border;
  return (
    <input
      ref={registerInput}
      type="number"
      min="0"
      value={value ?? ""}
      readOnly={readOnly}
      title={title}
      onChange={(e) => { if (!readOnly) onChange(clampPositive(e.target.value)); }}
      onKeyDown={onKeyDown}
      placeholder="0"
      data-item-id={itemId}
      data-field={field}
      style={{
        width: "100%", padding: "5px 6px", borderRadius: 8,
        border: `${emphasizeEmpty ? 2 : 1.5}px solid ${readOnly ? C.border : idleBorder}`,
        background: readOnly ? C.bg : (emphasizeEmpty && !filled ? "#FFFDE0" : C.surface),
        fontSize: 13, fontWeight: emphasizeEmpty ? 600 : 400, color: C.text,
        textAlign: "center", outline: "none", cursor: readOnly ? "default" : "text", boxSizing: "border-box",
      }}
      onFocus={(e) => { if (!readOnly) e.target.style.borderColor = C.pri; }}
      onBlur={(e) => { if (!readOnly) e.target.style.borderColor = idleBorder; }}
    />
  );
}

export const invUnderlineBtn = (color) => ({ background: "none", border: "none", color, fontSize: 10, cursor: "pointer", padding: 0, textDecoration: "underline" });

// Ordered checkbox / Skip / Undo — only meaningful when the item needs reordering.
export function InvOrderedControl({ count, toOrder, readOnly, onChange }) {
  const ordered = count?.ordered ?? false;
  const skipped = count?.skipped ?? false;
  const needsOrder = toOrder !== "" && toOrder > 0;
  if (!needsOrder) return <span style={{ color: C.textMut, fontSize: 11 }}>{toOrder === "" ? "" : "—"}</span>;
  if (skipped) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
        <span title={count?.skipped_by ? `Skipped by ${count.skipped_by} · ${fmtAuditTime(count.skipped_at)}` : ""}
          style={{ padding: "2px 8px", borderRadius: 6, background: "#FFF3CD", color: "#856404", fontSize: 10, fontWeight: 700, letterSpacing: 0.3 }}>SKIPPED</span>
        {!readOnly && <button onClick={() => onChange("skipped", false)} style={invUnderlineBtn(C.info)}>Undo</button>}
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      <label style={{ display: "flex", alignItems: "center", cursor: readOnly ? "default" : "pointer" }}
        title={ordered && count?.ordered_by ? `Ordered by ${count.ordered_by} · ${fmtAuditTime(count.ordered_at)}` : ""}>
        <input type="checkbox" checked={ordered} disabled={readOnly}
          onChange={(e) => { if (!readOnly) onChange("ordered", e.target.checked); }}
          style={{ width: 18, height: 18, accentColor: C.suc, cursor: readOnly ? "default" : "pointer" }} />
      </label>
      {!ordered && !readOnly && <button onClick={() => onChange("skipped", true)} style={invUnderlineBtn(C.textMut)}>Skip</button>}
    </div>
  );
}

// Product cell — name IS the link; link/note/edit affordances are flex-shrink:0
// siblings, so a long name truncates with an ellipsis but never hides them.
export function InvProductCell({ item, hasNote, notesActive, onToggleNotes, editMode, onEditMeta }) {
  const vendorHref = getInventoryVendorHref(item.vendor_link);
  const nameStyle = { fontSize: 13, fontWeight: 600, color: C.text, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 };
  return (
    <div className="inv-product-cell" style={{ minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
        {vendorHref ? (
          <a href={vendorHref} target="_blank" rel="noopener noreferrer" title="Open product link" onClick={(e) => e.stopPropagation()} style={nameStyle}>{item.item_name}</a>
        ) : (
          <span style={nameStyle}>{item.item_name}</span>
        )}
        {vendorHref && (
          <a href={vendorHref} target="_blank" rel="noopener noreferrer" title="Open product link" onClick={(e) => e.stopPropagation()} style={invMiniLinkStyle}><I.Link /></a>
        )}
        <button
          className={`inv-hover-affordance${hasNote || notesActive ? " is-active" : ""}`}
          onClick={(e) => { e.stopPropagation(); onToggleNotes(); }}
          title={hasNote ? "Edit note" : "Add note"}
          style={{ flexShrink: 0, padding: 0, width: 16, height: 16, border: "none", background: "transparent", color: hasNote ? C.pri : C.textMut, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
        >
          <I.MessageSquare />
        </button>
        {editMode && <InvCellPencil onClick={onEditMeta} title="Edit product details" />}
      </div>
      {item.size && <div style={{ fontSize: 11, color: C.textMut, marginTop: 1 }}>{item.size}</div>}
    </div>
  );
}
