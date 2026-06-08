// Catalog product add/edit modals extracted from InventoryPage.jsx.

import React, { useState, useMemo } from "react";
import { C } from "../../../shared/theme";
import { Btn, Modal, Inp } from "../../../shared/ui";
import { getInventorySubcategorySuggestions, normalizeInventoryVendorUrl } from "../inventoryCatalog";
import { normalizeCatalogNumber } from "./format";
import { InventoryTaxonomySelect } from "./InventoryTaxonomySelect";

export function CatalogItemModal({ mode, item, defaults, catalogItems, categories, onClose, onSave, onToggleActive, saving }) {
  const [form, setForm] = useState(() => ({
    item_name: item?.item_name || defaults?.item_name || "",
    gl_account: item?.gl_account || defaults?.gl_account || "",
    par_level: item?.par_level ?? defaults?.par_level ?? "",
    size: item?.size || defaults?.size || "",
    vendor: item?.vendor || defaults?.vendor || "",
    vendor_link: normalizeInventoryVendorUrl(item?.vendor_link || defaults?.vendor_link || ""),
    category: item?.category || defaults?.category || "",
    subcategory: item?.subcategory || defaults?.subcategory || "",
    unit_price: item?.unit_price ?? defaults?.unit_price ?? "",
  }));
  const [showError, setShowError] = useState(false);
  const visibleSubcategories = useMemo(() => {
    if (!form.category.trim()) return [];
    return getInventorySubcategorySuggestions(catalogItems, form.category);
  }, [catalogItems, form.category]);

  const setField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (field === "item_name" && showError && value.trim()) setShowError(false);
  };

  const setCategoryValue = (nextCategory) => {
    const scopedSubcategories = getInventorySubcategorySuggestions(catalogItems, nextCategory);
    setForm((prev) => ({
      ...prev,
      category: nextCategory,
      subcategory: scopedSubcategories.includes(prev.subcategory) ? prev.subcategory : "",
    }));
  };

  const fieldStyle = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 9,
    border: `1.5px solid ${C.border}`,
    background: C.surface,
    color: C.text,
    fontSize: 13,
    fontFamily: "inherit",
    outline: "none",
    boxSizing: "border-box",
  };
  const labelStyle = { fontSize: 10, fontWeight: 800, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5 };

  const handleSave = () => {
    if (!form.item_name.trim()) {
      setShowError(true);
      return;
    }
    onSave({
      ...form,
      item_name: form.item_name.trim(),
      category: form.category.trim(),
      subcategory: form.subcategory.trim(),
      gl_account: form.gl_account.trim(),
      size: form.size.trim(),
      vendor: form.vendor.trim(),
      vendor_link: normalizeInventoryVendorUrl(form.vendor_link),
      par_level: normalizeCatalogNumber(form.par_level, true),
      unit_price: normalizeCatalogNumber(form.unit_price, false),
    });
  };

  const renderField = (label, field, props = {}) => (
    <div>
      <div style={labelStyle}>{label}</div>
      <input
        value={form[field] ?? ""}
        onChange={e => setField(field, e.target.value)}
        style={fieldStyle}
        {...props}
      />
      {field === "item_name" && showError && (
        <div style={{ fontSize: 11, color: C.dan, marginTop: 4 }}>Product name is required.</div>
      )}
    </div>
  );

  return (
    <Modal title={mode === "edit" ? "Edit Product" : "Add Product"} onClose={onClose}>
      <div style={{ display: "grid", gap: 16 }}>
        <div style={{ padding: 12, borderRadius: 10, background: C.bg, border: `1px solid ${C.borderLight}`, fontSize: 12, color: C.textSec }}>
          Product name is the only required field.
        </div>
        {renderField("Product Name", "item_name", { autoFocus: true, placeholder: "Product name" })}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <InventoryTaxonomySelect
            label="Category"
            value={form.category}
            options={categories}
            onChange={setCategoryValue}
            createLabel="Create new category"
            placeholder="Select category"
          />
          <InventoryTaxonomySelect
            label="Subcategory"
            value={form.subcategory}
            options={visibleSubcategories}
            onChange={(value) => setField("subcategory", value)}
            createLabel="Create new subcategory"
            placeholder={form.category ? "Select subcategory" : "Choose category first"}
            disabled={!form.category.trim()}
          />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          {renderField("GL Code", "gl_account", { placeholder: "GL code" })}
          {renderField("Par", "par_level", { type: "number", min: "0", placeholder: "0" })}
          {renderField("Size", "size", { placeholder: "Size" })}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 12 }}>
          {renderField("Vendor", "vendor", { placeholder: "Vendor" })}
          {renderField("Product Link", "vendor_link", {
            placeholder: "https://...",
            onBlur: (event) => setField("vendor_link", normalizeInventoryVendorUrl(event.target.value)),
          })}
        </div>
        {renderField("Unit Cost", "unit_price", { type: "number", min: "0", step: "0.01", placeholder: "0.00" })}

        <div style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center" }}>
          <div>
            {mode === "edit" && item?.id && (
              <Btn
                variant={item.is_active ? "danger" : "success"}
                onClick={async () => {
                  const changed = await onToggleActive?.(item.id, item.is_active, item.item_name);
                  if (changed) onClose();
                }}
                disabled={saving}
              >
                {item.is_active ? "Remove Product" : "Restore Product"}
              </Btn>
            )}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
          <Btn variant="secondary" onClick={onClose} disabled={saving}>Cancel</Btn>
          <Btn variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : mode === "edit" ? "Save Product" : "Add Product"}
          </Btn>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ─── Add Adhoc Modal ──────────────────────────────────────────────────────────

export function AddAdhocModal({ onClose, onSave, categories }) {
  const [form, setForm] = useState({
    item_name: "",
    category: "",
    stock_count: "",
    unit_price: "",
    notes: "",
    add_to_catalog: false,
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const validate = () => {
    const errs = {};
    if (!form.item_name.trim()) errs.item_name = "Item name is required";
    if (form.stock_count !== "" && isNaN(parseInt(form.stock_count, 10))) errs.stock_count = "Must be a number";
    if (form.unit_price !== "" && isNaN(parseFloat(form.unit_price))) errs.unit_price = "Must be a number";
    return errs;
  };

  const handleSave = async () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setSaving(true);
    await onSave({
      ...form,
      stock_count: form.stock_count !== "" ? parseInt(form.stock_count, 10) : null,
      unit_price: form.unit_price !== "" ? parseFloat(form.unit_price) : null,
    });
    setSaving(false);
    onClose();
  };

  return (
    <Modal title="Add Ad-hoc Item" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <Inp label="Item Name" value={form.item_name} onChange={v => setForm(f => ({ ...f, item_name: v }))} placeholder="e.g. Paper Towels" required />
          {errors.item_name && <div style={{ fontSize: 11, color: C.dan, marginTop: 4 }}>{errors.item_name}</div>}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <InventoryTaxonomySelect
            label="Category"
            value={form.category}
            options={categories}
            onChange={(value) => setForm(f => ({ ...f, category: value }))}
            createLabel="Create new category"
            placeholder="Select category"
          />

          <div>
            <Inp
              label="Stock Count"
              type="number"
              value={form.stock_count}
              onChange={v => setForm(f => ({ ...f, stock_count: v }))}
              placeholder="0"
            />
            {errors.stock_count && <div style={{ fontSize: 11, color: C.dan, marginTop: 4 }}>{errors.stock_count}</div>}
          </div>
        </div>

        <div>
          <Inp
            label="Unit Cost ($)"
            type="number"
            value={form.unit_price}
            onChange={v => setForm(f => ({ ...f, unit_price: v }))}
            placeholder="0.00"
          />
          {errors.unit_price && <div style={{ fontSize: 11, color: C.dan, marginTop: 4 }}>{errors.unit_price}</div>}
        </div>

        <Inp label="Notes" type="textarea" value={form.notes} onChange={v => setForm(f => ({ ...f, notes: v }))} placeholder="Optional notes..." rows={2} />

        <Inp
          label="Add to catalog for future weeks"
          type="checkbox"
          value={form.add_to_catalog}
          onChange={v => setForm(f => ({ ...f, add_to_catalog: v }))}
        />

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
          <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Add Item"}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
