// Category/subcategory taxonomy picker extracted from InventoryPage.jsx.
// A self-contained popover select with an inline "create new option" affordance.

import React, { useState, useEffect, useMemo, useRef } from "react";
import { C } from "../../../shared/theme";
import { I } from "../../../shared/icons";

export function InventoryTaxonomySelect({
  label,
  value,
  options = [],
  onChange,
  createLabel,
  placeholder,
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const ref = useRef(null);
  const cleanOptions = useMemo(() => (
    Array.from(new Set((options || []).map((option) => String(option || "").trim()).filter(Boolean)))
  ), [options]);

  useEffect(() => {
    if (!open) return undefined;
    const handler = (event) => {
      if (ref.current && !ref.current.contains(event.target)) {
        setOpen(false);
        setCreating(false);
        setDraft("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const commitCreate = () => {
    const nextValue = draft.trim();
    if (!nextValue) return;
    onChange(nextValue);
    setOpen(false);
    setCreating(false);
    setDraft("");
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5 }}>{label}</div>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((prev) => !prev)}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen(true);
          }
          if (event.key === "Escape") {
            event.preventDefault();
            setOpen(false);
            setCreating(false);
            setDraft("");
          }
        }}
        style={{
          width: "100%",
          minHeight: 45,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          padding: "10px 12px",
          borderRadius: 9,
          border: `1.5px solid ${open ? C.pri : C.border}`,
          background: disabled ? C.bg : C.surface,
          color: value ? C.text : C.textMut,
          fontSize: 13,
          fontWeight: 600,
          fontFamily: "inherit",
          textAlign: "left",
          outline: "none",
          boxShadow: open ? `0 0 0 4px ${C.pri}14` : "none",
          cursor: disabled ? "default" : "pointer",
          transition: "border 0.16s, box-shadow 0.16s, transform 0.16s",
          opacity: disabled ? 0.65 : 1,
        }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value || placeholder}</span>
        <span style={{ color: C.textMut, display: "flex", transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.18s cubic-bezier(0.22,1,0.36,1)" }}>
          <I.ChevronDown />
        </span>
      </button>
      {open && !disabled && (
        <div
          className="inventory-taxonomy-menu"
          role="listbox"
          aria-label={label}
          style={{
            position: "absolute",
            zIndex: 80,
            top: "calc(100% + 8px)",
            left: 0,
            right: 0,
            borderRadius: 14,
            border: `1px solid ${C.border}`,
            background: C.surface,
            boxShadow: "0 18px 44px rgba(15, 23, 42, 0.18)",
            overflow: "hidden",
          }}
        >
          <div style={{ maxHeight: 220, overflowY: "auto", padding: 6 }}>
            {cleanOptions.length === 0 && (
              <div style={{ padding: "10px 12px", fontSize: 12, fontWeight: 700, color: C.textMut }}>
                No saved options yet
              </div>
            )}
            {cleanOptions.map((option, index) => {
              const selected = option === value;
              return (
                <button
                  type="button"
                  key={option}
                  className="inventory-taxonomy-option"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onChange(option);
                    setOpen(false);
                    setCreating(false);
                    setDraft("");
                  }}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    padding: "10px 11px",
                    border: "none",
                    borderRadius: 10,
                    background: selected ? C.priLt : "transparent",
                    color: selected ? C.pri : C.text,
                    fontSize: 13,
                    fontWeight: selected ? 800 : 650,
                    fontFamily: "inherit",
                    textAlign: "left",
                    cursor: "pointer",
                    animationDelay: `${Math.min(index * 18, 120)}ms`,
                  }}
                >
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{option}</span>
                  {selected && <span style={{ display: "flex", color: C.pri }}><I.Check /></span>}
                </button>
              );
            })}
          </div>
          <div style={{ padding: 8, borderTop: `1px solid ${C.borderLight}`, background: C.bg }}>
            {creating ? (
              <div className="inventory-taxonomy-create" style={{ display: "flex", gap: 8 }}>
                <input
                  autoFocus
                  value={draft}
                  onChange={event => setDraft(event.target.value)}
                  onKeyDown={event => {
                    if (event.key === "Enter") commitCreate();
                    if (event.key === "Escape") {
                      setCreating(false);
                      setDraft("");
                    }
                  }}
                  placeholder={createLabel}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    padding: "9px 10px",
                    borderRadius: 9,
                    border: `1.5px solid ${C.pri}45`,
                    background: C.surface,
                    color: C.text,
                    fontSize: 13,
                    fontFamily: "inherit",
                    outline: "none",
                  }}
                />
                <button
                  type="button"
                  onClick={commitCreate}
                  style={{ padding: "0 12px", borderRadius: 9, border: "none", background: C.pri, color: "#fff", fontSize: 12, fontWeight: 800, fontFamily: "inherit", cursor: "pointer" }}
                >
                  Add
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  padding: "9px 10px",
                  borderRadius: 10,
                  border: `1px dashed ${C.pri}55`,
                  background: C.surface,
                  color: C.pri,
                  fontSize: 12,
                  fontWeight: 850,
                  fontFamily: "inherit",
                  cursor: "pointer",
                }}
              >
                <I.Plus /> {createLabel}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
