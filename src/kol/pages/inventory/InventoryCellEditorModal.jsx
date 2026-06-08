// Per-column micro-editor modal extracted from InventoryPage.jsx.

import React, { useState } from "react";
import { C } from "../../../shared/theme";
import { Btn, Modal, Inp } from "../../../shared/ui";
import { normalizeCatalogNumber } from "./format";
import { InventoryTaxonomySelect } from "./InventoryTaxonomySelect";

// Per-column micro-editor (Marketing Events pattern): a small modal scoped to one
// field group — product (name/link/category/subcategory), GL code, par, or cost.
const INV_EDITOR_TITLES = { product: "Edit product", gl: "Edit GL code", par: "Edit par level", cost: "Edit unit cost" };
export function InventoryCellEditorModal({ editor, item, categories, subcategorySuggestions, onClose, onSave }) {
  const [draft, setDraft] = useState(() => ({
    item_name: item.item_name || "",
    vendor_link: item.vendor_link || "",
    category: item.category || "",
    subcategory: item.subcategory || "",
    gl_account: item.gl_account || "",
    par_level: item.par_level ?? "",
    unit_price: item.unit_price ?? "",
  }));
  const set = (field, value) => setDraft((prev) => ({ ...prev, [field]: value }));
  const save = () => {
    if (editor.group === "product") {
      onSave({ item_name: draft.item_name.trim() || item.item_name, vendor_link: draft.vendor_link, category: draft.category, subcategory: draft.subcategory });
    } else if (editor.group === "gl") {
      onSave({ gl_account: draft.gl_account });
    } else if (editor.group === "par") {
      onSave({ par_level: normalizeCatalogNumber(draft.par_level, true) });
    } else if (editor.group === "cost") {
      onSave({ unit_price: normalizeCatalogNumber(draft.unit_price, false) });
    }
    onClose();
  };
  const fieldLabel = { fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 };
  return (
    <Modal title={INV_EDITOR_TITLES[editor.group] || "Edit"} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {editor.group === "product" && (
          <>
            <div><div style={fieldLabel}>Product name</div><Inp value={draft.item_name} onChange={(v) => set("item_name", v)} autoFocus /></div>
            <div><div style={fieldLabel}>Product link</div><Inp value={draft.vendor_link} placeholder="amazon.com/…" onChange={(v) => set("vendor_link", v)} /></div>
            <InventoryTaxonomySelect label="Category" value={draft.category} options={categories} onChange={(v) => set("category", v)} createLabel="New category" placeholder="Category" />
            <InventoryTaxonomySelect label="Subcategory" value={draft.subcategory} options={subcategorySuggestions} onChange={(v) => set("subcategory", v)} createLabel="New subcategory" placeholder="Subcategory" />
          </>
        )}
        {editor.group === "gl" && (
          <div><div style={fieldLabel}>GL code</div><Inp value={draft.gl_account} onChange={(v) => set("gl_account", v)} autoFocus /></div>
        )}
        {editor.group === "par" && (
          <div><div style={fieldLabel}>Par level</div><Inp type="number" value={draft.par_level} onChange={(v) => set("par_level", v)} autoFocus /></div>
        )}
        {editor.group === "cost" && (
          <div><div style={fieldLabel}>Unit cost ($)</div><Inp type="number" value={draft.unit_price} onChange={(v) => set("unit_price", v)} autoFocus /></div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 2 }}>
          <Btn variant="secondary" size="sm" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" size="sm" onClick={save}>Save</Btn>
        </div>
      </div>
    </Modal>
  );
}
