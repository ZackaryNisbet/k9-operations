import React, { useMemo } from "react";
import { I } from "../../../shared/icons";
import { parseProducts, serializeProducts } from "../../enrichments/enrichmentData";

export function HealthFact({ label, value, color }) {
  return (
    <div className="enrichment-health-fact">
      <span>{label}</span>
      <strong style={{ color }}>{value == null || value === "" ? "-" : value}</strong>
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function ProductEditor({ value, onChange, disabled }) {
  const products = useMemo(() => parseProducts(value), [value]);
  const rows = [...products, { name: "", quantity: "", url: "" }];

  function commit(nextRows) {
    onChange(serializeProducts(nextRows));
  }

  function updateRow(index, field, nextValue) {
    const nextRows = rows.map((row) => ({ ...row }));
    nextRows[index] = { ...nextRows[index], [field]: nextValue };
    commit(nextRows);
  }

  function removeRow(index) {
    commit(rows.filter((_, rowIndex) => rowIndex !== index));
  }

  return (
    <div className="product-editor">
      {rows.map((product, index) => (
        <div key={`product-row-${index}`} className="product-editor-row">
          <input
            disabled={disabled}
            value={product.name}
            onChange={(event) => updateRow(index, "name", event.target.value)}
            placeholder="Product name"
          />
          <input
            disabled={disabled}
            value={product.quantity}
            onChange={(event) => updateRow(index, "quantity", event.target.value)}
            placeholder="Qty / note"
          />
          <input
            disabled={disabled}
            value={product.url}
            onChange={(event) => updateRow(index, "url", event.target.value)}
            placeholder="Link"
          />
          <button type="button" disabled={disabled || (!product.name && !product.quantity && !product.url)} aria-label={`Remove product ${index + 1}`} onClick={() => removeRow(index)}>
            <I.Trash />
          </button>
        </div>
      ))}
    </div>
  );
}
