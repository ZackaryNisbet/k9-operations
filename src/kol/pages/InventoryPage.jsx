// K9 Operations — Weekly Inventory Count Page
// Comprehensive inventory management module for K9 Operations Lite (KOL)

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "../../supabaseClient";
import { useAuth } from "../../AuthProvider";
import { C, todayStr, addDays, gid, fmtDate } from "../../shared/theme";
import { Btn, Modal, Card, Inp, Badge, CustomSelect } from "../../shared/ui";
import { I } from "../../shared/icons";
import { getInventoryWorkflow } from "./inventoryStatus";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getWeekStart(dateStr) {
  // Returns the Monday of the week containing dateStr
  const dt = new Date(dateStr + "T12:00:00");
  const day = dt.getDay(); // 0=Sun, 1=Mon ... 6=Sat
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  dt.setDate(dt.getDate() + diff);
  return dt.toISOString().split("T")[0];
}

function fmtWeekLabel(weekStart) {
  const dt = new Date(weekStart + "T12:00:00");
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtCurrency(val) {
  if (val == null || val === "") return "$0.00";
  const n = parseFloat(val) || 0;
  return "$" + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function clampPositive(val) {
  if (val === "" || val == null) return "";
  const s = String(val).replace(/[^0-9]/g, ""); // digits only
  if (s === "") return "";
  return String(parseInt(s, 10)); // strips leading zeros: "02" → "2"
}

// ─── Dog-Days Helpers ─────────────────────────────────────────────────────────

function getDogDaysForWeek(reservations, weekStart) {
  if (!reservations || !reservations.length) return 0;
  const start = new Date(weekStart + "T00:00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 6); // Sunday
  let totalDogDays = 0;
  const validRes = reservations.filter(r => r.status !== "cancelled");
  for (const res of validRes) {
    const checkIn = new Date(res.checkIn + "T00:00:00");
    const checkOut = new Date(res.checkOut + "T00:00:00");
    const overlapStart = Math.max(checkIn.getTime(), start.getTime());
    const overlapEnd = Math.min(checkOut.getTime(), end.getTime());
    if (overlapEnd >= overlapStart) {
      const days = Math.ceil((overlapEnd - overlapStart) / (1000 * 60 * 60 * 24)) + 1;
      totalDogDays += days;
    }
  }
  return totalDogDays;
}

function getAvgDogsPerDay(reservations, weekStart) {
  if (!reservations || !reservations.length) return 0;
  const start = new Date(weekStart + "T00:00:00");
  let total = 0;
  for (let d = 0; d < 7; d++) {
    const day = new Date(start);
    day.setDate(day.getDate() + d);
    const dayStr = day.toISOString().split('T')[0];
    const dogsThisDay = reservations.filter(r =>
      r.status !== "cancelled" && r.checkIn <= dayStr && r.checkOut >= dayStr
    ).length;
    total += dogsThisDay;
  }
  return Math.round(total / 7);
}

// ─── Skeleton Loader ──────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 16px", borderBottom: `1px solid ${C.borderLight}` }}>
      {[180, 80, 60, 60, 80, 80, 70, 70].map((w, i) => (
        <div key={i} style={{ width: w, height: 14, borderRadius: 6, background: `linear-gradient(90deg, ${C.borderLight} 0%, ${C.bg} 50%, ${C.borderLight} 100%)`, backgroundSize: "200% 100%", animation: "shimmer 1.4s infinite" }} />
      ))}
    </div>
  );
}

function SkeletonSection() {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ padding: "14px 16px", background: C.bg, borderRadius: 10, marginBottom: 2 }}>
        <div style={{ width: 160, height: 16, borderRadius: 6, background: `linear-gradient(90deg, ${C.borderLight} 0%, ${C.bg} 50%, ${C.borderLight} 100%)`, animation: "shimmer 1.4s infinite" }} />
      </div>
      {[0, 1, 2].map(i => <SkeletonRow key={i} />)}
    </div>
  );
}

// ─── Item Row Component ───────────────────────────────────────────────────────

const fmtAuditTime = (ts) => {
  if (!ts) return "";
  const d = new Date(ts);
  const day = d.toLocaleDateString("en-US", { weekday: "short", timeZone: "America/New_York" });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
  return `${day} ${time}`;
};

const INVENTORY_REOPEN_ROLES = new Set([
  "supervisor",
  "manager",
  "location_admin",
  "enterprise_admin",
  "owner",
  "role_owner",
]);

const LITE_ROLE_PRIORITY = {
  enterprise_admin: 1,
  location_admin: 2,
  manager: 3,
  supervisor: 4,
  csr: 5,
  pct: 6,
};

function pickHighestLiteRole(rows, locationId) {
  const candidates = (rows || []).filter(row =>
    row?.role === "enterprise_admin" || row?.location_id === locationId
  );

  if (candidates.length === 0) return null;

  return [...candidates]
    .sort((a, b) => (LITE_ROLE_PRIORITY[a.role] || 99) - (LITE_ROLE_PRIORITY[b.role] || 99))[0]
    ?.role || null;
}

const ItemRow = React.memo(function ItemRow({ item, count, isReadOnly, onChange, onKeyDown, inputRef }) {
  const [hovered, setHovered] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  const stockCount = count?.stock_count ?? "";
  const inTransit = count?.in_transit ?? "";
  const notes = count?.notes ?? "";
  const ordered = count?.ordered ?? false;
  const countedBy = count?.counted_by;
  const countedAt = count?.counted_at;
  const orderedBy = count?.ordered_by;
  const orderedAt = count?.ordered_at;
  const skipped = count?.skipped ?? false;
  const skippedBy = count?.skipped_by;
  const skippedAt = count?.skipped_at;
  const hasFilled = stockCount !== "";
  const toOrder = (item.par_level != null && hasFilled)
    ? Math.max(0, (item.par_level || 0) - (parseInt(stockCount, 10) || 0) - (parseInt(inTransit, 10) || 0))
    : "";
  const stockValue = (hasFilled && item.unit_price != null)
    ? (parseInt(stockCount, 10) || 0) * parseFloat(item.unit_price || 0)
    : null;
  const needsOrder = toOrder !== "" && toOrder > 0;

  return (
    <>
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "grid",
        gridTemplateColumns: "2fr 80px 70px 70px 90px 80px 60px 80px 80px",
        gap: 8,
        alignItems: "center",
        padding: "8px 16px",
        borderBottom: showNotes ? "none" : `1px solid ${C.borderLight}`,
        background: skipped ? (hovered ? "#FFFCF0" : "#FFFEF7") : (hovered ? C.surfaceHover : C.surface),
        opacity: skipped ? 0.6 : 1,
        transition: "background 0.15s, opacity 0.15s",
      }}
    >
      {/* Item Name + Vendor Link + Notes Icon */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.item_name}
            {item.vendor_link && (
              <a
                href={item.vendor_link}
                target="_blank"
                rel="noopener noreferrer"
                title="Open vendor page"
                style={{ marginLeft: 6, color: C.info, display: "inline-flex", alignItems: "center", verticalAlign: "middle" }}
                onClick={e => e.stopPropagation()}
              >
                <I.Link />
              </a>
            )}
            <button
              onClick={e => { e.stopPropagation(); setShowNotes(!showNotes); }}
              title={notes ? "Edit note" : "Add note"}
              style={{
                marginLeft: 6,
                color: notes ? C.pri : C.textMut,
                opacity: notes ? 1 : (hovered ? 0.6 : 0),
                display: "inline-flex",
                alignItems: "center",
                verticalAlign: "middle",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
                transition: "opacity 0.15s",
              }}
            >
              <I.MessageSquare />
            </button>
          </div>
          {item.size && (
            <div style={{ fontSize: 11, color: C.textMut, marginTop: 1 }}>{item.size}</div>
          )}
        </div>
      </div>

      {/* GL Account */}
      <div>
        {item.gl_account ? (
          <span style={{ display: "inline-block", padding: "2px 7px", borderRadius: 6, background: C.infoLt, color: C.info, fontSize: 10, fontWeight: 700 }}>
            {item.gl_account}
          </span>
        ) : (
          <span style={{ color: C.textMut, fontSize: 11 }}>—</span>
        )}
      </div>

      {/* Par Level */}
      <div style={{ fontSize: 12, color: C.textSec, textAlign: "center" }}>
        {item.par_level != null ? item.par_level : <span style={{ color: C.textMut }}>—</span>}
      </div>

      {/* Stock Count — yellow when empty, neutral when filled */}
      <div title={countedBy ? `Counted by ${countedBy} · ${fmtAuditTime(countedAt)}` : ""}>
        <input
          ref={inputRef}
          type="number"
          min="0"
          value={stockCount}
          readOnly={isReadOnly}
          onChange={e => !isReadOnly && onChange("stock_count", clampPositive(e.target.value))}
          onKeyDown={onKeyDown}
          placeholder="0"
          data-item-id={item.id}
          data-field="stock_count"
          style={{
            width: "100%",
            padding: "6px 8px",
            borderRadius: 8,
            border: `2px solid ${isReadOnly ? C.border : hasFilled ? C.border : "#E6C200"}`,
            background: isReadOnly ? C.bg : hasFilled ? C.surface : "#FFFDE0",
            fontSize: 13,
            fontWeight: 600,
            color: C.text,
            textAlign: "center",
            outline: "none",
            cursor: isReadOnly ? "default" : "text",
            boxSizing: "border-box",
          }}
          onFocus={e => { if (!isReadOnly) e.target.style.borderColor = C.pri; }}
          onBlur={e => { if (!isReadOnly) e.target.style.borderColor = hasFilled ? C.border : "#E6C200"; }}
        />
      </div>

      {/* In Transit */}
      <div>
        <input
          type="number"
          min="0"
          value={inTransit}
          readOnly={isReadOnly}
          onChange={e => !isReadOnly && onChange("in_transit", clampPositive(e.target.value))}
          placeholder="0"
          style={{
            width: "100%",
            padding: "6px 8px",
            borderRadius: 8,
            border: `1.5px solid ${C.border}`,
            background: isReadOnly ? C.bg : C.surface,
            fontSize: 13,
            color: C.text,
            textAlign: "center",
            outline: "none",
            cursor: isReadOnly ? "default" : "text",
            boxSizing: "border-box",
          }}
          onFocus={e => { if (!isReadOnly) e.target.style.borderColor = C.pri; }}
          onBlur={e => { if (!isReadOnly) e.target.style.borderColor = C.border; }}
        />
      </div>

      {/* To Order (auto-calc) */}
      <div style={{ textAlign: "center" }}>
        {toOrder !== "" ? (
          <span style={{
            display: "inline-block",
            padding: "4px 10px",
            borderRadius: 8,
            background: toOrder > 0 ? C.warnLt : C.sucLt,
            color: toOrder > 0 ? C.warn : C.suc,
            fontSize: 12,
            fontWeight: 700,
          }}>
            {toOrder}
          </span>
        ) : (
          <span style={{ color: C.textMut, fontSize: 12 }}>—</span>
        )}
      </div>

      {/* Ordered / Skip / Undo — only shown when item needs reordering */}
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 2 }}>
        {needsOrder ? (
          skipped ? (
            /* State 3: Skipped */
            <>
              <span
                title={skippedBy ? `Skipped by ${skippedBy} · ${fmtAuditTime(skippedAt)}` : ""}
                style={{
                  display: "inline-block",
                  padding: "2px 8px",
                  borderRadius: 6,
                  background: "#FFF3CD",
                  color: "#856404",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: 0.3,
                }}
              >
                SKIPPED
              </span>
              {!isReadOnly && (
                <button
                  onClick={() => onChange("skipped", false)}
                  style={{
                    background: "none",
                    border: "none",
                    color: C.info,
                    fontSize: 10,
                    cursor: "pointer",
                    padding: 0,
                    textDecoration: "underline",
                  }}
                >
                  Undo
                </button>
              )}
            </>
          ) : ordered ? (
            /* State 2: Ordered */
            <div title={orderedBy ? `Ordered by ${orderedBy} · ${fmtAuditTime(orderedAt)}` : ""}>
              <label style={{ display: "flex", alignItems: "center", cursor: isReadOnly ? "default" : "pointer" }}>
                <input
                  type="checkbox"
                  checked={true}
                  disabled={isReadOnly}
                  onChange={e => !isReadOnly && onChange("ordered", e.target.checked)}
                  style={{
                    width: 18,
                    height: 18,
                    accentColor: C.suc,
                    cursor: isReadOnly ? "default" : "pointer",
                  }}
                />
              </label>
            </div>
          ) : (
            /* State 1: Needs ordering (not ordered, not skipped) */
            <>
              <label style={{ display: "flex", alignItems: "center", cursor: isReadOnly ? "default" : "pointer" }}>
                <input
                  type="checkbox"
                  checked={false}
                  disabled={isReadOnly}
                  onChange={e => !isReadOnly && onChange("ordered", e.target.checked)}
                  style={{
                    width: 18,
                    height: 18,
                    accentColor: C.suc,
                    cursor: isReadOnly ? "default" : "pointer",
                  }}
                />
              </label>
              {!isReadOnly && (
                <button
                  onClick={() => onChange("skipped", true)}
                  style={{
                    background: "none",
                    border: "none",
                    color: C.textMut,
                    fontSize: 10,
                    cursor: "pointer",
                    padding: 0,
                    textDecoration: "underline",
                  }}
                >
                  Skip
                </button>
              )}
            </>
          )
        ) : (
          <span style={{ color: C.textMut, fontSize: 11 }}>{toOrder === "" ? "" : "—"}</span>
        )}
      </div>

      {/* Unit Cost */}
      <div style={{ fontSize: 12, color: C.textSec, textAlign: "right" }}>
        {item.unit_price != null ? fmtCurrency(item.unit_price) : <span style={{ color: C.textMut }}>—</span>}
      </div>

      {/* Stock Value */}
      <div style={{ fontSize: 12, fontWeight: 600, color: stockValue != null && stockValue > 0 ? C.suc : C.textSec, textAlign: "right" }}>
        {stockValue != null ? fmtCurrency(stockValue) : <span style={{ color: C.textMut }}>—</span>}
      </div>
    </div>
    {showNotes && (
      <div style={{ padding: "4px 16px 8px", background: C.surface, borderBottom: `1px solid ${C.borderLight}` }}>
        <textarea
          value={notes}
          readOnly={isReadOnly}
          onChange={e => !isReadOnly && onChange("notes", e.target.value)}
          placeholder="Add a note for this item..."
          rows={2}
          style={{
            width: "100%",
            padding: "8px 10px",
            borderRadius: 8,
            border: `1.5px solid ${C.border}`,
            background: isReadOnly ? C.bg : C.surface,
            fontSize: 12,
            fontFamily: "inherit",
            color: C.text,
            resize: "none",
            outline: "none",
            boxSizing: "border-box",
          }}
          onFocus={e => { if (!isReadOnly) e.target.style.borderColor = C.pri; }}
          onBlur={e => { if (!isReadOnly) e.target.style.borderColor = C.border; }}
        />
      </div>
    )}
    </>
  );
});

// ─── Adhoc Item Row ───────────────────────────────────────────────────────────

function AdhocItemRow({ item, isReadOnly, onUpdate, onDelete }) {
  const hasFilled = item.stock_count != null && item.stock_count !== "";
  const stockValue = (hasFilled && item.unit_price != null)
    ? (parseInt(item.stock_count, 10) || 0) * parseFloat(item.unit_price || 0)
    : null;
  const inputStyle = {
    width: "100%",
    padding: "6px 8px",
    borderRadius: 8,
    border: `2px solid ${isReadOnly ? C.border : hasFilled ? C.border : "#E6C200"}`,
    background: isReadOnly ? C.bg : hasFilled ? C.surface : "#FFFDE0",
    fontSize: 13,
    fontWeight: 600,
    textAlign: "center",
    fontFamily: "inherit",
    color: C.text,
    outline: "none",
    boxSizing: "border-box",
  };
  const cbStyle = {
    width: 18, height: 18, cursor: isReadOnly ? "default" : "pointer",
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
          readOnly={isReadOnly}
          onChange={e => !isReadOnly && onUpdate(item.id, { stock_count: clampPositive(e.target.value) })}
          placeholder="0"
          style={inputStyle}
        />
      </div>
      {/* UNIT COST */}
      <div>
        <input
          type="number" min="0" step="0.01"
          value={item.unit_price ?? ""}
          readOnly={isReadOnly}
          onChange={e => !isReadOnly && onUpdate(item.id, { unit_price: e.target.value === "" ? null : e.target.value })}
          placeholder="0.00"
          style={{ ...inputStyle, fontSize: 12 }}
        />
      </div>
      {/* ORDERED */}
      <div style={{ textAlign: "center" }}>
        <input
          type="checkbox"
          checked={!!item.ordered}
          disabled={isReadOnly}
          onChange={e => !isReadOnly && onUpdate(item.id, { ordered: e.target.checked, ...(e.target.checked ? { skipped: false } : {}) })}
          style={cbStyle}
          title="Mark as ordered"
        />
      </div>
      {/* SKIP */}
      <div style={{ textAlign: "center" }}>
        <input
          type="checkbox"
          checked={!!item.skipped}
          disabled={isReadOnly}
          onChange={e => !isReadOnly && onUpdate(item.id, { skipped: e.target.checked, ...(e.target.checked ? { ordered: false } : {}) })}
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
      {!isReadOnly && (
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

// ─── Item Detail Drawer (Edit Mode) ──────────────────────────────────────────

const ItemDetailDrawer = React.memo(function ItemDetailDrawer({ item, onChange, onToggleActive }) {
  const fieldStyle = {
    fontSize: 12,
    padding: "6px 8px",
    borderRadius: 7,
    border: `1.5px solid ${C.border}`,
    background: C.surface,
    fontFamily: "inherit",
    color: C.text,
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  };

  return (
    <div style={{
      padding: "12px 16px 12px 46px",
      background: C.bg,
      borderBottom: `1px solid ${C.borderLight}`,
      animation: "invFadeIn 0.2s ease-out",
    }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.5fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: C.textMut, textTransform: "uppercase", marginBottom: 3 }}>Size</div>
          <input value={item.size || ""} onChange={e => onChange("size", e.target.value)} placeholder="Size" style={fieldStyle} />
        </div>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: C.textMut, textTransform: "uppercase", marginBottom: 3 }}>Vendor</div>
          <input value={item.vendor || ""} onChange={e => onChange("vendor", e.target.value)} placeholder="Vendor" style={fieldStyle} />
        </div>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: C.textMut, textTransform: "uppercase", marginBottom: 3 }}>Vendor Link</div>
          <input value={item.vendor_link || ""} onChange={e => onChange("vendor_link", e.target.value)} placeholder="https://..." style={{ ...fieldStyle, fontSize: 11 }} />
        </div>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: C.textMut, textTransform: "uppercase", marginBottom: 3 }}>Category</div>
          <input value={item.category || ""} onChange={e => onChange("category", e.target.value)} placeholder="Category" style={fieldStyle} />
        </div>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: C.textMut, textTransform: "uppercase", marginBottom: 3 }}>Subcategory</div>
          <input value={item.subcategory || ""} onChange={e => onChange("subcategory", e.target.value)} placeholder="Subcategory" style={fieldStyle} />
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ width: 100 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: C.textMut, textTransform: "uppercase", marginBottom: 3 }}>Min Reorder</div>
          <input type="number" min="0" value={item.min_reorder ?? ""} onChange={e => onChange("min_reorder", e.target.value === "" ? null : parseInt(e.target.value, 10))} style={{ ...fieldStyle, textAlign: "center" }} />
        </div>
        <div style={{ width: 80 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: C.textMut, textTransform: "uppercase", marginBottom: 3 }}>Sort Order</div>
          <input type="number" min="0" value={item.sort_order ?? ""} onChange={e => onChange("sort_order", e.target.value === "" ? null : parseInt(e.target.value, 10))} style={{ ...fieldStyle, textAlign: "center" }} />
        </div>
        <div style={{ marginLeft: "auto" }}>
          <button
            onClick={onToggleActive}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 14px", borderRadius: 8,
              border: `1.5px solid ${item.is_active ? C.dan + "40" : C.suc + "40"}`,
              background: item.is_active ? C.danLt : C.sucLt,
              color: item.is_active ? C.dan : C.suc,
              fontSize: 12, fontWeight: 600, fontFamily: "inherit",
              cursor: "pointer", transition: "all 0.15s",
            }}
          >
            {item.is_active ? <><I.X /> Deactivate</> : <><I.Check /> Activate</>}
          </button>
        </div>
      </div>
    </div>
  );
});

// ─── Edit Mode Item Row ──────────────────────────────────────────────────────

const EditModeItemRow = React.memo(function EditModeItemRow({
  item, count, editingField, onEditField, onCatalogChange, expandedEditId, onToggleExpand,
  onDragStart, onDragOver, onDrop, onDragEnd, dragOverIdx, itemIdx, onToggleActive,
}) {
  const [hovered, setHovered] = useState(false);
  const editRef = useRef(null);
  const isExpanded = expandedEditId === item.id;

  // Focus input when entering edit mode
  useEffect(() => {
    if (editingField?.itemId === item.id && editRef.current) {
      editRef.current.focus();
      editRef.current.select();
    }
  }, [editingField, item.id]);

  const isEditing = (field) => editingField?.itemId === item.id && editingField?.field === field;

  const renderEditableCell = (field, value, style = {}) => {
    if (isEditing(field)) {
      const isNumber = field === "par_level" || field === "unit_price";
      return (
        <input
          ref={editRef}
          type={isNumber ? "number" : "text"}
          min={isNumber ? "0" : undefined}
          step={field === "unit_price" ? "0.01" : undefined}
          value={value ?? ""}
          onChange={e => {
            const v = isNumber
              ? (e.target.value === "" ? null : field === "unit_price" ? parseFloat(e.target.value) : parseInt(e.target.value, 10))
              : e.target.value;
            onCatalogChange(item.id, field, v);
          }}
          onBlur={() => onEditField(null)}
          onKeyDown={e => {
            if (e.key === "Enter") onEditField(null);
            if (e.key === "Escape") onEditField(null);
          }}
          style={{
            width: "100%",
            padding: "4px 6px",
            borderRadius: 6,
            border: `2px solid ${C.pri}`,
            background: C.surface,
            fontSize: 13,
            fontWeight: 600,
            color: C.text,
            outline: "none",
            boxSizing: "border-box",
            ...style,
          }}
        />
      );
    }
    return (
      <div
        onClick={() => onEditField({ itemId: item.id, field })}
        style={{
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 4,
          minHeight: 28,
          padding: "2px 4px",
          borderRadius: 6,
          transition: "background 0.15s",
          background: hovered ? C.bg : "transparent",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: value ? C.text : C.textMut, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, ...style }}>
          {value || "\u2014"}
        </span>
        {hovered && (
          <span style={{ color: C.textMut, opacity: 0.5, flexShrink: 0 }}>
            <I.Pencil />
          </span>
        )}
      </div>
    );
  };

  const stockCount = count?.stock_count ?? "";
  const inTransit = count?.in_transit ?? "";
  const hasFilled = stockCount !== "";
  const toOrder = (item.par_level != null && hasFilled)
    ? Math.max(0, (item.par_level || 0) - (parseInt(stockCount, 10) || 0) - (parseInt(inTransit, 10) || 0))
    : "";

  return (
    <>
      <div
        draggable
        onDragStart={e => onDragStart(e, item.id)}
        onDragOver={e => onDragOver(e, itemIdx)}
        onDrop={e => onDrop(e)}
        onDragEnd={onDragEnd}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "grid",
          gridTemplateColumns: "30px 2fr 80px 70px 70px 90px 80px 60px 80px 80px 30px",
          gap: 8,
          alignItems: "center",
          padding: "8px 16px",
          borderTop: dragOverIdx === itemIdx ? `2px solid ${C.pri}` : "none",
          borderBottom: `1px solid ${C.borderLight}`,
          background: hovered ? C.surfaceHover : !item.is_active ? C.bg + "80" : C.surface,
          opacity: item.is_active ? 1 : 0.5,
          transition: "background 0.15s, opacity 0.15s",
          cursor: "grab",
        }}
      >
        {/* Drag handle */}
        <div style={{ color: C.textMut, cursor: "grab", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <I.GripVertical />
        </div>

        {/* Item Name — editable */}
        <div style={{ minWidth: 0 }}>
          {renderEditableCell("item_name", item.item_name)}
          {!item.is_active && (
            <span style={{ fontSize: 10, color: C.dan, fontWeight: 600 }}>INACTIVE</span>
          )}
        </div>

        {/* GL Account — editable */}
        <div>{renderEditableCell("gl_account", item.gl_account, { fontSize: 11 })}</div>

        {/* Par Level — editable */}
        <div>{renderEditableCell("par_level", item.par_level, { textAlign: "center" })}</div>

        {/* On Hand — muted in edit mode */}
        <div style={{ fontSize: 12, color: C.textMut, textAlign: "center", opacity: 0.4 }}>
          {hasFilled ? stockCount : "\u2014"}
        </div>

        {/* In Transit — muted */}
        <div style={{ fontSize: 12, color: C.textMut, textAlign: "center", opacity: 0.4 }}>
          {inTransit || "\u2014"}
        </div>

        {/* To Order — muted */}
        <div style={{ fontSize: 12, color: C.textMut, textAlign: "center", opacity: 0.4 }}>
          {toOrder !== "" ? toOrder : "\u2014"}
        </div>

        {/* Ordered — muted */}
        <div style={{ opacity: 0.4 }} />

        {/* Unit Price — editable */}
        <div>{renderEditableCell("unit_price", item.unit_price != null ? item.unit_price : null, { textAlign: "right", fontSize: 12 })}</div>

        {/* Value — muted */}
        <div style={{ fontSize: 12, color: C.textMut, textAlign: "right", opacity: 0.4 }}>
          {"\u2014"}
        </div>

        {/* Expand arrow */}
        <button
          onClick={() => onToggleExpand(isExpanded ? null : item.id)}
          style={{
            background: "none", border: "none", cursor: "pointer", padding: 2,
            color: isExpanded ? C.pri : C.textMut, transition: "color 0.15s, transform 0.2s",
            transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <I.ChevronDown />
        </button>
      </div>
      {isExpanded && (
        <ItemDetailDrawer
          item={item}
          onChange={(field, val) => onCatalogChange(item.id, field, val)}
          onToggleActive={() => onToggleActive(item.id, item.is_active)}
        />
      )}
    </>
  );
});

// ─── Add Item Row (Edit Mode) ────────────────────────────────────────────────

function AddItemRow({ category, subcategory, onAdd }) {
  return (
    <button
      onClick={() => onAdd(category, subcategory)}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "10px 16px",
        border: `1.5px dashed ${C.border}`,
        borderRadius: 0,
        background: "transparent",
        color: C.textMut,
        fontSize: 12,
        fontWeight: 500,
        fontFamily: "inherit",
        cursor: "pointer",
        transition: "all 0.15s",
      }}
      onMouseEnter={e => { e.currentTarget.style.background = C.surfaceHover; e.currentTarget.style.color = C.pri; e.currentTarget.style.borderColor = C.pri + "40"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.textMut; e.currentTarget.style.borderColor = C.border; }}
    >
      <I.Plus /> Add item
    </button>
  );
}

// ─── Category Section ─────────────────────────────────────────────────────────

function CategorySection({ category, subcategories, counts, isReadOnly, onCountChange, onKeyDown, inputRefs, searchQuery,
  catalogEditMode, editingField, onEditField, onCatalogChange, expandedEditId, onToggleExpand,
  onDragStart, onDragOver, onDrop, onDragEnd, dragState, onToggleCatalogActive, onAddCatalogItem,
}) {
  const [collapsed, setCollapsed] = useState(false);

  const totalItems = subcategories.reduce((sum, sub) => sum + sub.items.length, 0);
  const categoryValue = subcategories.reduce((sum, sub) =>
    sum + sub.items.reduce((s, item) => {
      const count = counts[item.id];
      const sc = count?.stock_count;
      if (sc != null && sc !== "" && item.unit_price != null) {
        return s + (parseInt(sc, 10) || 0) * parseFloat(item.unit_price || 0);
      }
      return s;
    }, 0), 0);

  const editCols = "30px 2fr 80px 70px 70px 90px 80px 60px 80px 80px 30px";
  const viewCols = "2fr 80px 70px 70px 90px 80px 60px 80px 80px";
  const editHeaders = ["", "Item", "GL Code", "Par", "On Hand", "In Transit", "To Order", "Ordered", "Unit Cost", "Value", ""];
  const viewHeaders = ["Item", "GL Code", "Par", "On Hand", "In Transit", "To Order", "Ordered", "Unit Cost", "Value"];

  return (
    <div style={{ marginBottom: 12, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
      {/* Category Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          background: `linear-gradient(135deg, ${C.pri}08, ${C.priLt})`,
          border: "none",
          borderBottom: collapsed ? "none" : `1px solid ${C.borderLight}`,
          cursor: "pointer",
          fontFamily: "inherit",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)", transition: "transform 0.2s", color: C.pri }}>
            <I.ChevronDown />
          </div>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.pri, fontFamily: "'Outfit', sans-serif" }}>
            {category}
          </span>
          <span style={{ fontSize: 11, color: C.textMut, fontWeight: 500 }}>
            {totalItems} item{totalItems !== 1 ? "s" : ""}
          </span>
        </div>
        {categoryValue > 0 && !catalogEditMode && (
          <span style={{ fontSize: 12, fontWeight: 700, color: C.suc }}>
            {fmtCurrency(categoryValue)}
          </span>
        )}
      </button>

      {/* Column Headers */}
      {!collapsed && (
        <div style={{
          display: "grid",
          gridTemplateColumns: catalogEditMode ? editCols : viewCols,
          gap: 8,
          padding: "6px 16px",
          background: C.bg,
          borderBottom: `1px solid ${C.borderLight}`,
        }}>
          {(catalogEditMode ? editHeaders : viewHeaders).map((h, i) => (
            <div key={i} style={{
              fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.06em",
              textAlign: catalogEditMode
                ? (i === 0 || i === 10 ? "center" : i >= 8 ? "right" : i >= 3 ? "center" : "left")
                : (i === 6 ? "center" : i >= 7 ? "right" : i >= 2 ? "center" : "left"),
            }}>
              {h}
            </div>
          ))}
        </div>
      )}

      {/* Items by Subcategory */}
      {!collapsed && subcategories.map((sub, si) => (
        <div key={si}>
          {sub.name && (
            <div style={{ padding: "6px 16px", background: C.bg + "80", borderBottom: `1px solid ${C.borderLight}` }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: C.textSec, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {sub.name}
              </span>
            </div>
          )}
          {catalogEditMode ? (
            <>
              {sub.items.map((item, idx) => (
                <EditModeItemRow
                  key={item.id}
                  item={item}
                  count={counts[item.id]}
                  editingField={editingField}
                  onEditField={onEditField}
                  onCatalogChange={onCatalogChange}
                  expandedEditId={expandedEditId}
                  onToggleExpand={onToggleExpand}
                  onDragStart={onDragStart}
                  onDragOver={onDragOver}
                  onDrop={(e) => onDrop(e, sub.items)}
                  onDragEnd={onDragEnd}
                  dragOverIdx={dragState.overIdx}
                  itemIdx={idx}
                  onToggleActive={onToggleCatalogActive}
                />
              ))}
              <AddItemRow category={category} subcategory={sub.name} onAdd={onAddCatalogItem} />
            </>
          ) : (
            sub.items.map(item => (
              <ItemRow
                key={item.id}
                item={item}
                count={counts[item.id]}
                isReadOnly={isReadOnly}
                onChange={(field, val) => onCountChange(item.id, field, val)}
                onKeyDown={(e) => onKeyDown(e, item.id)}
                inputRef={el => { if (el) inputRefs.current[item.id] = el; }}
              />
            ))
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Add Adhoc Modal ──────────────────────────────────────────────────────────

function AddAdhocModal({ onClose, onSave, categories }) {
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

  const catOptions = Array.from(new Set(categories.filter(Boolean))).map(c => ({ value: c, label: c }));

  return (
    <Modal title="Add Ad-hoc Item" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <Inp label="Item Name" value={form.item_name} onChange={v => setForm(f => ({ ...f, item_name: v }))} placeholder="e.g. Paper Towels" required />
          {errors.item_name && <div style={{ fontSize: 11, color: C.dan, marginTop: 4 }}>{errors.item_name}</div>}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.textSec, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.03em" }}>Category</div>
            <select
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              style={{ width: "100%", padding: "10px 14px", border: `1.5px solid ${C.border}`, borderRadius: 10, fontSize: 14, fontFamily: "inherit", color: form.category ? C.text : C.textMut, background: C.surface, outline: "none" }}
            >
              <option value="">Select category...</option>
              {catOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              <option value="__other__">Other</option>
            </select>
          </div>

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
            label="Unit Price ($)"
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

// ─── Submit Confirmation Modal ────────────────────────────────────────────────

function SubmitModal({ onClose, onConfirm, saving }) {
  return (
    <Modal title="Complete Inventory Count" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ padding: 16, borderRadius: 12, background: C.sucLt, border: `1px solid ${C.suc}30` }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.suc, marginBottom: 6 }}>
            Mark this count as completed?
          </div>
          <div style={{ fontSize: 13, color: C.textSec, lineHeight: 1.5 }}>
            Once submitted, this inventory count will be locked for editing. All counts will be saved and this week's snapshot will be marked complete.
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn variant="secondary" onClick={onClose} disabled={saving}>Cancel</Btn>
          <Btn variant="success" onClick={onConfirm} disabled={saving}>
            {saving ? "Submitting..." : "Submit Count"}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

function ReopenModal({ onClose, onConfirm, saving }) {
  const [reason, setReason] = useState("");
  const [showError, setShowError] = useState(false);

  const handleConfirm = () => {
    const trimmed = reason.trim();
    if (!trimmed) {
      setShowError(true);
      return;
    }
    onConfirm(trimmed);
  };

  return (
    <Modal title="Mark Inventory Incomplete" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ padding: 16, borderRadius: 12, background: C.warnLt, border: `1px solid ${C.warn}30` }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.warn, marginBottom: 6 }}>
            Reopen this completed count?
          </div>
          <div style={{ fontSize: 13, color: C.textSec, lineHeight: 1.5 }}>
            This will unlock the week for editing and write an audit trail showing who reopened it and why.
          </div>
        </div>

        <div>
          <Inp
            label="Reason"
            type="textarea"
            value={reason}
            onChange={(value) => {
              setReason(value);
              if (showError && value.trim()) setShowError(false);
            }}
            placeholder="Explain what still needs to be fixed or counted..."
            rows={3}
          />
          {showError && (
            <div style={{ fontSize: 11, color: C.dan, marginTop: 4 }}>
              A reason is required to reopen a completed inventory count.
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn variant="secondary" onClick={onClose} disabled={saving}>Cancel</Btn>
          <Btn variant="danger" onClick={handleConfirm} disabled={saving}>
            {saving ? "Reopening..." : "Mark Incomplete"}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

// ─── Depletion Rate Modal ─────────────────────────────────────────────────────

function DepletionRateModal({ locationId, reservations, currentWeekStart, onClose }) {
  const [depletionData, setDepletionData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [catalogMap, setCatalogMap] = useState({});

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // Load depletion rates
        const { data: rates, error: ratesErr } = await supabase
          .from("inventory_depletion_rates")
          .select("*")
          .eq("location_id", locationId)
          .order("week_start", { ascending: false });
        if (ratesErr) throw ratesErr;

        // Load catalog items for names
        const { data: catalog, error: catErr } = await supabase
          .from("inventory_catalog")
          .select("id, item_name, unit_price, par_level, category")
          .eq("location_id", locationId);
        if (catErr) throw catErr;

        const catMap = {};
        (catalog || []).forEach(c => { catMap[c.id] = c; });
        setCatalogMap(catMap);
        setDepletionData(rates || []);
      } catch (err) {
        console.error("Depletion data load error:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [locationId]);

  // Compute aggregated per-item depletion stats
  const itemStats = useMemo(() => {
    if (!depletionData.length) return [];

    // Group by catalog_item_id
    const grouped = {};
    depletionData.forEach(r => {
      if (!grouped[r.catalog_item_id]) grouped[r.catalog_item_id] = [];
      grouped[r.catalog_item_id].push(r);
    });

    const stats = [];
    Object.entries(grouped).forEach(([itemId, records]) => {
      if (records.length < 2) return; // Need 2+ weeks

      const catItem = catalogMap[itemId];
      if (!catItem) return;

      // Sort by week_start descending
      const sorted = [...records].sort((a, b) => b.week_start.localeCompare(a.week_start));

      // Average weekly usage
      const totalDepletion = sorted.reduce((s, r) => s + (r.depletion || 0), 0);
      const avgWeeklyUsage = totalDepletion / sorted.length;

      // Average rate per dog-day
      const ratesWithDogDay = sorted.filter(r => r.rate_per_dog_day != null);
      const avgRatePerDogDay = ratesWithDogDay.length > 0
        ? ratesWithDogDay.reduce((s, r) => s + r.rate_per_dog_day, 0) / ratesWithDogDay.length
        : null;

      // Trend: compare recent half vs older half
      const midpoint = Math.floor(sorted.length / 2);
      const recentAvg = sorted.slice(0, Math.max(1, midpoint)).reduce((s, r) => s + (r.depletion || 0), 0) / Math.max(1, midpoint);
      const olderAvg = sorted.slice(midpoint).reduce((s, r) => s + (r.depletion || 0), 0) / Math.max(1, sorted.length - midpoint);
      const trend = recentAvg > olderAvg * 1.1 ? "up" : recentAvg < olderAvg * 0.9 ? "down" : "stable";

      // Confidence
      const weeksOfData = sorted.length;
      const confidence = weeksOfData >= 9 ? "High" : weeksOfData >= 4 ? "Medium" : "Low";

      // Current week dog-days for recommended par
      const currentDogDays = getDogDaysForWeek(reservations, currentWeekStart);
      const avgDogDaysPerWeek = ratesWithDogDay.length > 0
        ? ratesWithDogDay.reduce((s, r) => s + (r.dog_days || 0), 0) / ratesWithDogDay.length
        : currentDogDays;

      // Recommended par = coefficient x avg dog-days x 1.2 safety factor
      const recommendedPar = avgRatePerDogDay != null
        ? Math.ceil(avgRatePerDogDay * avgDogDaysPerWeek * 1.2)
        : null;

      stats.push({
        itemId,
        itemName: catItem.item_name,
        category: catItem.category,
        unitPrice: catItem.unit_price,
        currentPar: catItem.par_level,
        avgWeeklyUsage: +avgWeeklyUsage.toFixed(1),
        avgRatePerDogDay: avgRatePerDogDay != null ? +avgRatePerDogDay.toFixed(4) : null,
        trend,
        confidence,
        weeksOfData,
        recommendedPar,
      });
    });

    // Sort by highest usage
    stats.sort((a, b) => b.avgWeeklyUsage - a.avgWeeklyUsage);
    return stats;
  }, [depletionData, catalogMap, reservations, currentWeekStart]);

  // Header metrics
  const headerMetrics = useMemo(() => {
    // Unique weeks
    const uniqueWeeks = new Set(depletionData.map(r => r.week_start));

    // Total inventory value this week (from depletion records for current week)
    const currentWeekRecords = depletionData.filter(r => r.week_start === currentWeekStart);
    let totalValue = 0;
    currentWeekRecords.forEach(r => {
      const cat = catalogMap[r.catalog_item_id];
      if (cat && cat.unit_price && r.closing_stock != null) {
        totalValue += r.closing_stock * parseFloat(cat.unit_price || 0);
      }
    });

    // Items below par
    let belowPar = 0;
    currentWeekRecords.forEach(r => {
      const cat = catalogMap[r.catalog_item_id];
      if (cat && cat.par_level != null && r.closing_stock != null && r.closing_stock < cat.par_level) {
        belowPar++;
      }
    });

    // Average cost per dog-day
    const currentDogDays = getDogDaysForWeek(reservations, currentWeekStart);
    const avgCostPerDogDay = currentDogDays > 0 ? totalValue / currentDogDays : 0;

    return {
      totalValue,
      belowPar,
      avgCostPerDogDay,
      weeksOfData: uniqueWeeks.size,
    };
  }, [depletionData, catalogMap, currentWeekStart, reservations]);

  const trendIcon = (trend) => {
    if (trend === "up") return <span style={{ color: C.dan }}>&#9650;</span>;
    if (trend === "down") return <span style={{ color: C.suc }}>&#9660;</span>;
    return <span style={{ color: C.textMut }}>&#8212;</span>;
  };

  const confidenceBadge = (confidence) => {
    const colors = {
      High: { bg: C.sucLt, color: C.suc },
      Medium: { bg: C.warnLt, color: C.warn },
      Low: { bg: C.bg, color: C.textMut },
    };
    const c = colors[confidence] || colors.Low;
    return (
      <span style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 6,
        background: c.bg,
        color: c.color,
        fontSize: 10,
        fontWeight: 700,
      }}>
        {confidence}
      </span>
    );
  };

  return (
    <Modal title="Depletion Rate Analytics" onClose={onClose} wide>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: C.textMut }}>Loading depletion data...</div>
        ) : (
          <>
            {/* Header Metrics */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              <div style={{ padding: "14px 16px", borderRadius: 10, background: C.bg, border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
                  Inventory Value
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, color: C.suc }}>{fmtCurrency(headerMetrics.totalValue)}</div>
              </div>
              <div style={{ padding: "14px 16px", borderRadius: 10, background: C.bg, border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
                  Below Par
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, color: headerMetrics.belowPar > 0 ? C.warn : C.suc }}>
                  {headerMetrics.belowPar} item{headerMetrics.belowPar !== 1 ? "s" : ""}
                </div>
              </div>
              <div style={{ padding: "14px 16px", borderRadius: 10, background: C.bg, border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
                  Avg Cost / Dog-Day
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, color: C.pri }}>
                  {fmtCurrency(headerMetrics.avgCostPerDogDay)}
                </div>
              </div>
              <div style={{ padding: "14px 16px", borderRadius: 10, background: C.bg, border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
                  Weeks of Data
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, color: C.pri }}>{headerMetrics.weeksOfData}</div>
              </div>
            </div>

            {/* Per-Item Table */}
            {itemStats.length === 0 ? (
              <div style={{ padding: 32, textAlign: "center", color: C.textMut, borderRadius: 10, background: C.bg, border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Not enough data yet</div>
                <div style={{ fontSize: 12 }}>Depletion rates require at least 2 completed weekly counts. Keep counting!</div>
              </div>
            ) : (
              <div style={{ borderRadius: 10, border: `1px solid ${C.border}`, overflow: "hidden" }}>
                {/* Table header */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 1fr 1fr 50px 80px 1fr",
                  gap: 8,
                  padding: "8px 14px",
                  background: C.bg,
                  borderBottom: `1px solid ${C.borderLight}`,
                }}>
                  {["Item", "Avg/Week", "Per Dog-Day", "Trend", "Confidence", "Rec. Par"].map((h, i) => (
                    <div key={i} style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      {h}
                    </div>
                  ))}
                </div>

                {/* Table rows */}
                {itemStats.map(stat => (
                  <div
                    key={stat.itemId}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "2fr 1fr 1fr 50px 80px 1fr",
                      gap: 8,
                      padding: "10px 14px",
                      borderBottom: `1px solid ${C.borderLight}`,
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{stat.itemName}</div>
                      {stat.category && <div style={{ fontSize: 10, color: C.textMut }}>{stat.category}</div>}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.pri }}>
                      {stat.avgWeeklyUsage} units
                    </div>
                    <div style={{ fontSize: 13, color: C.textSec }}>
                      {stat.avgRatePerDogDay != null ? stat.avgRatePerDogDay.toFixed(3) : "—"}
                    </div>
                    <div style={{ textAlign: "center" }}>{trendIcon(stat.trend)}</div>
                    <div>{confidenceBadge(stat.confidence)}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: C.pri }}>
                        {stat.recommendedPar != null ? stat.recommendedPar : "—"}
                      </span>
                      {stat.currentPar != null && stat.recommendedPar != null && stat.recommendedPar > stat.currentPar && (
                        <span style={{
                          display: "inline-block",
                          padding: "1px 6px",
                          borderRadius: 5,
                          background: C.warnLt,
                          color: C.warn,
                          fontSize: 9,
                          fontWeight: 700,
                        }}>
                          +{stat.recommendedPar - stat.currentPar}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Footer */}
            <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 4 }}>
              <Btn variant="secondary" onClick={onClose}>Close</Btn>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function InventoryPage({ data, save, nav, profile, addGlobalToast }) {
  const { user: authUser, profile: authProfile } = useAuth();

  // ── Week + Day navigation ──
  const [currentWeekStart, setCurrentWeekStart] = useState(() => getWeekStart(todayStr()));
  const thisWeekStart = getWeekStart(todayStr());
  const [countedDate, setCountedDate] = useState(() => {
    const saved = localStorage.getItem("k9_inventory_countedDate");
    const week = getWeekStart(todayStr());
    // Restore if saved date is within the current week
    if (saved && saved >= week && saved <= todayStr()) return saved;
    return todayStr();
  });

  // Persist countedDate to localStorage
  useEffect(() => {
    localStorage.setItem("k9_inventory_countedDate", countedDate);
  }, [countedDate]);

  // Reset countedDate when week changes — but NOT on initial mount
  const weekChangeRef = useRef(currentWeekStart);
  useEffect(() => {
    if (weekChangeRef.current === currentWeekStart) return; // skip initial mount
    weekChangeRef.current = currentWeekStart;
    if (currentWeekStart === thisWeekStart) setCountedDate(todayStr());
    else setCountedDate(currentWeekStart);
  }, [currentWeekStart]);

  // ── Data state ──
  const [catalogItems, setCatalogItems] = useState([]);
  const [snapshot, setSnapshot] = useState(null); // inventory_snapshots row
  const [counts, setCounts] = useState({}); // { [catalog_item_id]: { stock_count, in_transit, notes, id? } }
  const [adhocItems, setAdhocItems] = useState([]);

  // ── UI state ──
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [search, setSearch] = useState("");
  const [showAddAdhoc, setShowAddAdhoc] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [saveStatus, setSaveStatus] = useState("idle"); // idle | saving | saved | error
  const [submitSaving, setSubmitSaving] = useState(false);
  const [reopenSaving, setReopenSaving] = useState(false);
  const [showDepletionModal, setShowDepletionModal] = useState(false);
  const [catalogEditMode, setCatalogEditMode] = useState(false);
  const [editingField, setEditingField] = useState(null); // { itemId, field }
  const [expandedEditId, setExpandedEditId] = useState(null);
  const [catalogSaveStatus, setCatalogSaveStatus] = useState("idle");
  const [dragState, setDragState] = useState({ draggingId: null, overIdx: null });
  const [viewerLiteRole, setViewerLiteRole] = useState(null);

  // ── Refs ──
  const saveTimer = useRef(null);
  const inputRefs = useRef({});
  const pendingSave = useRef({}); // accumulated dirty counts to save
  const snapshotRef = useRef(null); // always-current snapshot for async ops
  const catalogSaveTimers = useRef({});
  const countsRef = useRef({});
  const countedDateRef = useRef(countedDate);
  const profileRef = useRef(profile);

  const locationId = profile?.location_id;
  const isReadOnly = snapshot?.status === "completed";

  // ── Dog-Days computed values ──
  const reservations = data?.reservations || [];
  const dogDays = useMemo(() => getDogDaysForWeek(reservations, currentWeekStart), [reservations, currentWeekStart]);
  const avgDogsPerDay = useMemo(() => getAvgDogsPerDay(reservations, currentWeekStart), [reservations, currentWeekStart]);

  // Sync snapshotRef
  useEffect(() => { snapshotRef.current = snapshot; }, [snapshot]);
  useEffect(() => { countsRef.current = counts; }, [counts]);
  useEffect(() => { countedDateRef.current = countedDate; }, [countedDate]);
  useEffect(() => { profileRef.current = profile; }, [profile]);

  useEffect(() => {
    let cancelled = false;

    if (!authUser?.id || !locationId) {
      setViewerLiteRole(null);
      return () => {
        cancelled = true;
      };
    }

    supabase
      .from("lite_profiles")
      .select("location_id, role")
      .eq("user_id", authUser.id)
      .eq("is_active", true)
      .then(({ data }) => {
        if (cancelled) return;
        setViewerLiteRole(pickHighestLiteRole(data || [], locationId));
      });

    return () => {
      cancelled = true;
    };
  }, [authUser?.id, locationId]);

  // ── CSS injection for shimmer + animations ──
  useEffect(() => {
    const styleId = "inv-shimmer-style";
    if (!document.getElementById(styleId)) {
      const s = document.createElement("style");
      s.id = styleId;
      s.textContent = `
        @keyframes shimmer {
          0%   { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes invFadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .inv-fade-in { animation: invFadeIn 0.35s cubic-bezier(0.22,1,0.36,1) both; }
        .inv-row-hover:hover { background: ${C.surfaceHover} !important; }
      `;
      document.head.appendChild(s);
    }
  }, []);

  // ── Data loading ──
  const loadData = useCallback(async () => {
    if (!locationId) return;
    setLoading(true);
    setLoadError(null);
    try {
      // 1. Load catalog items (sorted: category → subcategory → sort_order)
      // Only filter active items when not in catalog edit mode
      const catQuery = supabase
        .from("inventory_catalog")
        .select("*")
        .eq("location_id", locationId);
      if (!catalogEditMode) catQuery.eq("is_active", true);
      const { data: catalog, error: catErr } = await catQuery
        .order("category", { ascending: true })
        .order("subcategory", { ascending: true })
        .order("sort_order", { ascending: true });
      if (catErr) throw catErr;
      setCatalogItems(catalog || []);

      // 2. Find or create snapshot
      let snap = null;
      const { data: existing, error: snapErr } = await supabase
        .from("inventory_snapshots")
        .select("*")
        .eq("location_id", locationId)
        .eq("week_start", currentWeekStart)
        .maybeSingle();
      if (snapErr) throw snapErr;

      if (existing) {
        snap = existing;
      } else {
        // Only create a snapshot if it's the current week (don't auto-create for past weeks)
        if (currentWeekStart === thisWeekStart) {
          const { data: created, error: createErr } = await supabase
            .from("inventory_snapshots")
            .upsert({
              location_id: locationId,
              week_start: currentWeekStart,
              status: "in_progress",
              dog_count: null,
              notes: null,
              completed_at: null,
              completed_by: null,
            }, { onConflict: "location_id,week_start", ignoreDuplicates: true })
            .select()
            .single();
          if (createErr && createErr.code !== "PGRST116") throw createErr;
          // If upsert returned nothing (race condition), re-fetch
          if (!created) {
            const { data: refetched } = await supabase
              .from("inventory_snapshots")
              .select("*")
              .eq("location_id", locationId)
              .eq("week_start", currentWeekStart)
              .maybeSingle();
            snap = refetched;
          } else {
            snap = created;
          }
        }
      }
      setSnapshot(snap);
      snapshotRef.current = snap;

      // 3. Load counts for this snapshot
      const countMap = {};
      if (snap) {
        const { data: countRows, error: countErr } = await supabase
          .from("inventory_counts")
          .select("*")
          .eq("snapshot_id", snap.id);
        if (countErr) throw countErr;
        (countRows || []).forEach(row => {
          countMap[row.catalog_item_id] = {
            id: row.id,
            stock_count: row.stock_count,
            in_transit: row.in_transit ?? "",
            notes: row.notes ?? "",
            ordered: row.ordered ?? false,
            counted_by: row.counted_by || null,
            counted_at: row.counted_at || null,
            ordered_by: row.ordered_by || null,
            ordered_at: row.ordered_at || null,
            skipped: row.skipped ?? false,
            skipped_by: row.skipped_by || null,
            skipped_at: row.skipped_at || null,
          };
        });
      }
      setCounts(countMap);
      countsRef.current = countMap;

      // 4. Load adhoc items
      if (snap) {
        const { data: adhoc, error: adhocErr } = await supabase
          .from("inventory_adhoc_items")
          .select("*")
          .eq("snapshot_id", snap.id)
          .order("created_at", { ascending: true });
        if (adhocErr) throw adhocErr;
        setAdhocItems(adhoc || []);
      } else {
        setAdhocItems([]);
      }
    } catch (err) {
      console.error("Inventory load error:", err);
      setLoadError(err.message || "Failed to load inventory data.");
    } finally {
      setLoading(false);
    }
  }, [locationId, currentWeekStart, thisWeekStart, catalogEditMode]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Auto-save logic ──
  const flushSave = useCallback(async () => {
    const snap = snapshotRef.current;
    if (!snap || Object.keys(pendingSave.current).length === 0) return;

    const snapshotId = snap.id;
    const currentCounts = countsRef.current;
    const currentCountedDate = countedDateRef.current;
    const currentProfile = profileRef.current;
    setSaveStatus("saving");

    try {
      const itemIds = Object.keys(pendingSave.current);
      // Build upserts
      const userName = currentProfile?.full_name || currentProfile?.email || "Unknown";
      const now = new Date().toISOString();
      const toUpsert = itemIds.map(itemId => {
        const existing = currentCounts[itemId];
        const pending = pendingSave.current[itemId];
        const merged = { ...(existing || {}), ...pending };
        const row = {
          // Don't include 'id' — let onConflict(snapshot_id,catalog_item_id) handle upsert
          snapshot_id: snapshotId,
          catalog_item_id: itemId,
          stock_count: merged.stock_count != null && merged.stock_count !== "" ? parseInt(merged.stock_count, 10) : null,
          in_transit: merged.in_transit != null && merged.in_transit !== "" ? parseInt(merged.in_transit, 10) : null,
          notes: merged.notes || null,
          ordered: merged.ordered ?? false,
          skipped: merged.skipped ?? false,
        };
        // Audit: track who counted / who ordered
        if (pending.stock_count !== undefined || pending.in_transit !== undefined) {
          row.counted_by = userName;
          // Use the selected countedDate (supports backdating), with current time
          row.counted_at = currentCountedDate === todayStr() ? now : `${currentCountedDate}T${new Date().toISOString().split('T')[1]}`;
        }
        if (pending.ordered !== undefined) {
          row.ordered_by = userName;
          row.ordered_at = now;
        }
        if (pending.skipped !== undefined) {
          row.skipped_by = pending.skipped ? userName : null;
          row.skipped_at = pending.skipped ? now : null;
        }
        return row;
      });

      const { data: upserted, error } = await supabase
        .from("inventory_counts")
        .upsert(toUpsert, { onConflict: "snapshot_id,catalog_item_id" })
        .select();

      const nextCounts = { ...currentCounts };
      (upserted || []).forEach(row => {
        nextCounts[row.catalog_item_id] = {
          id: row.id,
          stock_count: row.stock_count,
          in_transit: row.in_transit ?? "",
          notes: row.notes ?? "",
          ordered: row.ordered ?? false,
          counted_by: row.counted_by || currentCounts[row.catalog_item_id]?.counted_by || null,
          counted_at: row.counted_at || currentCounts[row.catalog_item_id]?.counted_at || null,
          ordered_by: row.ordered_by || currentCounts[row.catalog_item_id]?.ordered_by || null,
          ordered_at: row.ordered_at || currentCounts[row.catalog_item_id]?.ordered_at || null,
          skipped: row.skipped ?? false,
          skipped_by: row.skipped_by || null,
          skipped_at: row.skipped_at || null,
        };
      });
      countsRef.current = nextCounts;
      setCounts(nextCounts);

      pendingSave.current = {};
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2200);
    } catch (err) {
      console.error("Auto-save error:", err);
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  }, []);

  const scheduleAutoSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      flushSave();
    }, 400); // Save quickly so data isn't lost on refresh
  }, [flushSave]);

  // Flush pending saves on unmount or page close
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Synchronously trigger save — can't await in beforeunload, but
      // navigator.sendBeacon can't do upserts. Instead, flush immediately.
      if (Object.keys(pendingSave.current).length > 0) {
        void flushSave();
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden" && Object.keys(pendingSave.current).length > 0) {
        void flushSave();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [flushSave]);

  // ── Count change handler ──
  const handleCountChange = useCallback((itemId, field, val) => {
    const updates = { [field]: val };
    // Enforce mutual exclusivity: ordered and skipped cannot both be true
    if (field === "ordered" && val === true) {
      updates.skipped = false;
    } else if (field === "skipped" && val === true) {
      updates.ordered = false;
    }
    setCounts(prev => ({
      ...prev,
      [itemId]: { ...(prev[itemId] || {}), ...updates },
    }));
    countsRef.current = {
      ...countsRef.current,
      [itemId]: { ...(countsRef.current[itemId] || {}), ...updates },
    };
    pendingSave.current[itemId] = {
      ...(pendingSave.current[itemId] || {}),
      ...updates,
    };
    scheduleAutoSave();
  }, [scheduleAutoSave]);

  // ── Catalog edit: debounced save ──
  const saveCatalogField = useCallback((itemId, updates) => {
    if (catalogSaveTimers.current[itemId]) clearTimeout(catalogSaveTimers.current[itemId]);
    setCatalogSaveStatus("saving");
    catalogSaveTimers.current[itemId] = setTimeout(async () => {
      try {
        const { error } = await supabase
          .from("inventory_catalog")
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq("id", itemId);
        if (error) throw error;
        setCatalogSaveStatus("saved");
        setTimeout(() => setCatalogSaveStatus("idle"), 2200);
      } catch (err) {
        console.error("Catalog save error:", err);
        setCatalogSaveStatus("error");
        setTimeout(() => setCatalogSaveStatus("idle"), 3000);
      }
    }, 1500);
  }, []);

  const handleCatalogFieldChange = useCallback((itemId, field, value) => {
    setCatalogItems(prev => prev.map(i => i.id === itemId ? { ...i, [field]: value } : i));
    saveCatalogField(itemId, { [field]: value });
  }, [saveCatalogField]);

  const handleToggleCatalogActive = useCallback(async (itemId, currentActive) => {
    const newActive = !currentActive;
    setCatalogItems(prev => prev.map(i => i.id === itemId ? { ...i, is_active: newActive } : i));
    setCatalogSaveStatus("saving");
    try {
      const { error } = await supabase
        .from("inventory_catalog")
        .update({ is_active: newActive, updated_at: new Date().toISOString() })
        .eq("id", itemId);
      if (error) throw error;
      setCatalogSaveStatus("saved");
      setTimeout(() => setCatalogSaveStatus("idle"), 2200);
      if (addGlobalToast) addGlobalToast({ type: "success", message: newActive ? "Item activated." : "Item deactivated." });
    } catch (err) {
      console.error("Toggle active error:", err);
      setCatalogSaveStatus("error");
      setTimeout(() => setCatalogSaveStatus("idle"), 3000);
    }
  }, [addGlobalToast]);

  const handleAddCatalogItem = useCallback(async (category, subcategory) => {
    setCatalogSaveStatus("saving");
    try {
      const maxSort = catalogItems.reduce((max, i) => Math.max(max, i.sort_order || 0), 0);
      const { data: newItem, error } = await supabase
        .from("inventory_catalog")
        .insert({
          location_id: locationId,
          item_name: "",
          category: category || "",
          subcategory: subcategory || "",
          vendor: "",
          vendor_link: "",
          gl_account: "",
          size: "",
          par_level: null,
          min_reorder: null,
          unit_price: null,
          sort_order: maxSort + 10,
          is_active: true,
        })
        .select()
        .single();
      if (error) throw error;
      setCatalogItems(prev => [...prev, newItem]);
      setCatalogSaveStatus("saved");
      setTimeout(() => setCatalogSaveStatus("idle"), 2200);
      // Auto-focus the name field
      setEditingField({ itemId: newItem.id, field: "item_name" });
    } catch (err) {
      console.error("Add catalog item error:", err);
      setCatalogSaveStatus("error");
      setTimeout(() => setCatalogSaveStatus("idle"), 3000);
    }
  }, [locationId, catalogItems]);

  // ── Drag and drop reorder ──
  const handleDragStart = useCallback((e, itemId) => {
    e.dataTransfer.effectAllowed = "move";
    setDragState(prev => ({ ...prev, draggingId: itemId }));
  }, []);

  const handleDragOver = useCallback((e, idx) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragState(prev => ({ ...prev, overIdx: idx }));
  }, []);

  const handleDrop = useCallback(async (e, subcatItems) => {
    e.preventDefault();
    const { draggingId, overIdx } = dragState;
    if (!draggingId || overIdx == null) { setDragState({ draggingId: null, overIdx: null }); return; }

    const fromIdx = subcatItems.findIndex(i => i.id === draggingId);
    if (fromIdx === -1 || fromIdx === overIdx) { setDragState({ draggingId: null, overIdx: null }); return; }

    const reordered = [...subcatItems];
    const [moved] = reordered.splice(fromIdx, 1);
    // After removing the dragged item, indices shift — adjust target if dragging down
    const targetIdx = fromIdx < overIdx ? overIdx - 1 : overIdx;
    reordered.splice(targetIdx, 0, moved);

    // Update sort_order for all items in this group
    const updates = reordered.map((item, i) => ({ id: item.id, sort_order: (i + 1) * 10 }));

    // Optimistic update
    setCatalogItems(prev => {
      const next = [...prev];
      updates.forEach(u => {
        const idx = next.findIndex(i => i.id === u.id);
        if (idx !== -1) next[idx] = { ...next[idx], sort_order: u.sort_order };
      });
      return next;
    });

    setDragState({ draggingId: null, overIdx: null });

    // Persist to DB
    for (const u of updates) {
      await supabase.from("inventory_catalog").update({ sort_order: u.sort_order }).eq("id", u.id);
    }
  }, [dragState]);

  const handleDragEnd = useCallback(() => {
    setDragState({ draggingId: null, overIdx: null });
  }, []);

  // ── Keyboard navigation ──
  const handleKeyDown = useCallback((e, itemId) => {
    if (e.key !== "Tab") return;
    // Find all stock count inputs in document order
    const allInputs = Object.values(inputRefs.current).filter(Boolean);
    const idx = allInputs.indexOf(e.target);
    if (idx === -1) return;
    const nextIdx = e.shiftKey ? idx - 1 : idx + 1;
    if (nextIdx >= 0 && nextIdx < allInputs.length) {
      e.preventDefault();
      allInputs[nextIdx].focus();
    }
  }, []);

  // ── Submit ──
  const handleSubmit = async () => {
    const snap = snapshotRef.current;
    if (!snap) return;

    // Flush any pending saves first
    if (saveTimer.current) clearTimeout(saveTimer.current);
    await flushSave();

    setSubmitSaving(true);
    try {
      const { data: completedSnapshot, error } = await supabase
        .rpc("complete_inventory_snapshot", { p_snapshot_id: snap.id });
      if (error) throw error;
      if (completedSnapshot) {
        setSnapshot(completedSnapshot);
        snapshotRef.current = completedSnapshot;
      }
      setShowSubmitModal(false);
      if (addGlobalToast) addGlobalToast({ type: "success", message: "Inventory count completed and locked!" });

      // ── Compute depletion rates ──
      try {
        // Get previous week's snapshot
        const prevWeekStart = addDays(currentWeekStart, -7);
        const { data: prevSnap } = await supabase
          .from("inventory_snapshots")
          .select("id")
          .eq("location_id", locationId)
          .eq("week_start", prevWeekStart)
          .eq("status", "completed")
          .maybeSingle();

        if (prevSnap) {
          // Get previous week's counts
          const { data: prevCounts } = await supabase
            .from("inventory_counts")
            .select("catalog_item_id, stock_count, in_transit")
            .eq("snapshot_id", prevSnap.id);

          const prevCountMap = {};
          (prevCounts || []).forEach(c => { prevCountMap[c.catalog_item_id] = c; });

          // Get current week's counts (already in state as `counts`)
          const currentDogDays = getDogDaysForWeek(reservations, currentWeekStart);
          const currentCounts = countsRef.current;

          // Build depletion records
          const depletionRecords = [];
          catalogItems.forEach(item => {
            const prev = prevCountMap[item.id];
            const curr = currentCounts[item.id];
            if (!prev || !curr || curr.stock_count == null || curr.stock_count === "") return;

            const openingStock = prev.stock_count || 0;
            const closingStock = parseInt(curr.stock_count, 10) || 0;
            const received = parseInt(curr.in_transit, 10) || 0;
            const depletion = openingStock - closingStock + received;

            depletionRecords.push({
              location_id: locationId,
              catalog_item_id: item.id,
              week_start: currentWeekStart,
              opening_stock: openingStock,
              closing_stock: closingStock,
              received,
              depletion,
              dog_days: currentDogDays,
              rate_per_dog_day: currentDogDays > 0 ? +(depletion / currentDogDays).toFixed(4) : null,
            });
          });

          if (depletionRecords.length > 0) {
            await supabase
              .from("inventory_depletion_rates")
              .upsert(depletionRecords, { onConflict: "location_id,catalog_item_id,week_start" });
          }
        }
      } catch (depErr) {
        console.error("Depletion rate calculation error:", depErr);
        // Non-fatal — don't block the submit
      }
    } catch (err) {
      console.error("Submit error:", err);
      if (addGlobalToast) addGlobalToast({ type: "error", message: "Failed to submit inventory count." });
    } finally {
      setSubmitSaving(false);
    }
  };

  const handleReopen = async (reason) => {
    const snap = snapshotRef.current;
    if (!snap) return;

    setReopenSaving(true);
    try {
      const { data: reopenedSnapshot, error } = await supabase
        .rpc("reopen_inventory_snapshot", {
          p_snapshot_id: snap.id,
          p_reason: reason,
        });
      if (error) throw error;
      if (reopenedSnapshot) {
        setSnapshot(reopenedSnapshot);
        snapshotRef.current = reopenedSnapshot;
      }
      setShowReopenModal(false);
      if (addGlobalToast) addGlobalToast({ type: "success", message: "Inventory count reopened for editing." });
    } catch (err) {
      console.error("Reopen error:", err);
      if (addGlobalToast) addGlobalToast({ type: "error", message: err.message || "Failed to reopen inventory count." });
    } finally {
      setReopenSaving(false);
    }
  };

  // ── Add adhoc item ──
  const handleAddAdhoc = async (formData) => {
    const snap = snapshotRef.current;
    if (!snap) return;
    try {
      const { data: newItem, error } = await supabase
        .from("inventory_adhoc_items")
        .insert({
          snapshot_id: snap.id,
          item_name: formData.item_name,
          category: formData.category || null,
          stock_count: formData.stock_count,
          unit_price: formData.unit_price,
          notes: formData.notes || null,
          add_to_catalog: formData.add_to_catalog || false,
        })
        .select()
        .single();
      if (error) throw error;
      setAdhocItems(prev => [...prev, newItem]);
      if (addGlobalToast) addGlobalToast({ type: "success", message: "Ad-hoc item added." });
    } catch (err) {
      console.error("Add adhoc error:", err);
      if (addGlobalToast) addGlobalToast({ type: "error", message: "Failed to add item." });
    }
  };

  // ── Update adhoc item (debounced save) ──
  const adhocTimers = useRef({});
  const updateAdhocItem = useCallback((itemId, updates) => {
    // Optimistic UI update
    setAdhocItems(prev => prev.map(item =>
      item.id === itemId ? { ...item, ...updates } : item
    ));
    // Debounced save to DB
    if (adhocTimers.current[itemId]) clearTimeout(adhocTimers.current[itemId]);
    adhocTimers.current[itemId] = setTimeout(async () => {
      try {
        const saveData = {};
        if (updates.stock_count !== undefined) {
          saveData.stock_count = updates.stock_count === "" || updates.stock_count == null ? null : parseInt(updates.stock_count, 10);
        }
        if (updates.unit_price !== undefined) {
          saveData.unit_price = updates.unit_price == null ? null : parseFloat(updates.unit_price);
        }
        if (updates.ordered !== undefined) saveData.ordered = updates.ordered;
        if (updates.skipped !== undefined) saveData.skipped = updates.skipped;
        const { error } = await supabase.from("inventory_adhoc_items").update(saveData).eq("id", itemId);
        if (error) throw error;
      } catch (err) {
        console.error("Adhoc update error:", err);
      }
    }, 400);
  }, []);

  // ── Delete adhoc item ──
  const deleteAdhocItem = useCallback(async (itemId) => {
    try {
      const { error } = await supabase.from("inventory_adhoc_items").delete().eq("id", itemId);
      if (error) throw error;
      setAdhocItems(prev => prev.filter(item => item.id !== itemId));
    } catch (err) {
      console.error("Adhoc delete error:", err);
    }
  }, []);

  // ── Filtered + grouped catalog ──
  const filteredGrouped = useMemo(() => {
    const q = search.toLowerCase().trim();
    const filtered = catalogItems.filter(item => {
      if (!q) return true;
      return (
        (item.item_name || "").toLowerCase().includes(q) ||
        (item.category || "").toLowerCase().includes(q) ||
        (item.vendor || "").toLowerCase().includes(q) ||
        (item.subcategory || "").toLowerCase().includes(q)
      );
    });

    // Group: category -> subcategory -> items
    const grouped = {};
    filtered.forEach(item => {
      const cat = item.category || "Uncategorized";
      const sub = item.subcategory || "";
      if (!grouped[cat]) grouped[cat] = {};
      if (!grouped[cat][sub]) grouped[cat][sub] = [];
      grouped[cat][sub].push(item);
    });

    // Convert to array, sort items within each subcategory by sort_order
    return Object.entries(grouped).map(([category, subs]) => ({
      category,
      subcategories: Object.entries(subs).map(([name, items]) => ({
        name,
        items: [...items].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
      })),
    }));
  }, [catalogItems, search]);

  // ── Total inventory value ──
  const totalValue = useMemo(() => {
    let total = 0;
    catalogItems.forEach(item => {
      const count = counts[item.id];
      const sc = count?.stock_count;
      if (sc != null && sc !== "" && item.unit_price != null) {
        total += (parseInt(sc, 10) || 0) * parseFloat(item.unit_price || 0);
      }
    });
    adhocItems.forEach(item => {
      if (item.stock_count != null && item.unit_price != null) {
        total += (parseInt(item.stock_count, 10) || 0) * parseFloat(item.unit_price || 0);
      }
    });
    return total;
  }, [catalogItems, counts, adhocItems]);

  const inventoryWorkflow = useMemo(() => getInventoryWorkflow({
    snapshotStatus: snapshot?.status,
    catalogItems,
    counts,
    adhocItems,
  }), [snapshot?.status, catalogItems, counts, adhocItems]);

  const canComplete = inventoryWorkflow.readyToSubmit;
  const viewerRole = viewerLiteRole || authProfile?.role || null;
  const canReopenSnapshot = snapshot?.status === "completed" && INVENTORY_REOPEN_ROLES.has(viewerRole);
  const snapshotHistory = useMemo(() => (
    Array.isArray(snapshot?.history)
      ? [...snapshot.history].sort((a, b) => new Date(b?.ts || 0).getTime() - new Date(a?.ts || 0).getTime())
      : []
  ), [snapshot?.history]);
  const latestReopenEntry = snapshotHistory.find(entry => entry?.action === "reopened") || null;

  const statusBadge = useMemo(() => {
    if (snapshot?.status === "completed") {
      return {
        label: "Completed",
        background: C.sucLt,
        color: C.suc,
        borderColor: `${C.suc}40`,
      };
    }
    if (inventoryWorkflow.readyToSubmit) {
      return {
        label: "Ready to Submit",
        background: C.priLt,
        color: C.pri,
        borderColor: `${C.pri}35`,
      };
    }
    if (snapshot?.status === "in_progress") {
      return {
        label: "In Progress",
        background: C.warnLt,
        color: C.warn,
        borderColor: `${C.warn}40`,
      };
    }
    return {
      label: "Draft",
      background: C.bg,
      color: C.textMut,
      borderColor: C.border,
    };
  }, [inventoryWorkflow.readyToSubmit, snapshot?.status]);

  // ── Unique categories for adhoc dropdown ──
  const allCategories = useMemo(() =>
    Array.from(new Set(catalogItems.map(i => i.category).filter(Boolean))).sort(),
    [catalogItems]
  );

  // ── Render ──
  return (
    <div style={{ fontFamily: "'Outfit', -apple-system, BlinkMacSystemFont, sans-serif", background: C.bg, minHeight: "100vh", padding: "24px 20px" }}>
      <style>{`
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
      `}</style>

      {/* ── Page Header ── */}
      <div className="inv-fade-in" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, color: C.text, fontFamily: "'Outfit', sans-serif", lineHeight: 1.2 }}>
              Weekly Inventory Count
            </h1>
            <div style={{ fontSize: 13, color: C.textSec, marginTop: 4, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span>{new Date().getDay() === 1 ? "Due today" : "Due every Monday"}</span>
              <span style={{ color: C.borderLight }}>·</span>
              <span>Track on-hand stock, transit items, and reorder needs</span>
            </div>
          </div>

          {/* Status badge + Manage Catalog */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            {!isReadOnly && (
              catalogEditMode ? (
                <Btn variant="success" size="sm" icon={<I.Check />} onClick={() => { setCatalogEditMode(false); loadData(); }}>
                  Done Editing
                </Btn>
              ) : (
                <Btn variant="secondary" size="sm" icon={<I.Edit />} onClick={() => setCatalogEditMode(true)}>
                  Edit Catalog
                </Btn>
              )
            )}

            {snapshot && (
              <span style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 14px",
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 700,
                background: statusBadge.background,
                color: statusBadge.color,
                border: `1.5px solid ${statusBadge.borderColor}`,
              }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: statusBadge.color, display: "inline-block" }} />
                {statusBadge.label}
              </span>
            )}

            {/* Overdue indicator — current week, past Monday, not completed */}
            {currentWeekStart === thisWeekStart && (() => {
              const dow = new Date().getDay();
              const isPastMonday = dow !== 1;
              const daysSince = dow === 0 ? 6 : dow - 1;
              return isPastMonday && (!snapshot || snapshot.status !== "completed") ? (
                <span style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "6px 14px",
                  borderRadius: 20,
                  fontSize: 12,
                  fontWeight: 700,
                  background: "#FEF2F2",
                  color: "#DC2626",
                  border: "1.5px solid #DC262640",
                }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#DC2626", display: "inline-block" }} />
                  {daysSince} day{daysSince !== 1 ? "s" : ""} overdue
                </span>
              ) : null;
            })()}

            {/* Auto-save indicator */}
            <span style={{
              fontSize: 11,
              fontWeight: 600,
              color: saveStatus === "saving" ? C.info : saveStatus === "saved" ? C.suc : saveStatus === "error" ? C.dan : C.textMut,
              display: "flex",
              alignItems: "center",
              gap: 4,
              transition: "color 0.3s",
            }}>
              {saveStatus === "saving" && <><I.RefreshCw /> Saving...</>}
              {saveStatus === "saved" && <><I.CheckCircle /> Saved</>}
              {saveStatus === "error" && <><I.XCircle /> Save failed</>}
            </span>
          </div>
        </div>
      </div>

      {/* ── Week Navigation + Controls ── */}
      <Card style={{ marginBottom: 16, padding: "14px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          {/* Week Navigator */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={() => setCurrentWeekStart(prev => addDays(prev, -7))}
              style={{ width: 34, height: 34, borderRadius: 9, border: `1.5px solid ${C.border}`, background: C.surface, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.textSec, transition: "all 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.background = C.surfaceHover; e.currentTarget.style.borderColor = C.pri; }}
              onMouseLeave={e => { e.currentTarget.style.background = C.surface; e.currentTarget.style.borderColor = C.border; }}
              title="Previous week"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 16px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: C.bg }}>
              <I.Calendar />
              <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                Week of {fmtWeekLabel(currentWeekStart)}
              </span>
              {currentWeekStart === thisWeekStart && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: C.priLt, color: C.pri }}>
                  CURRENT
                </span>
              )}
              {currentWeekStart === thisWeekStart && new Date().getDay() !== 1 && (!snapshot || snapshot.status !== "completed") && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: "#FEF2F2", color: "#DC2626" }}>
                  OVERDUE
                </span>
              )}
            </div>

            <button
              onClick={() => setCurrentWeekStart(prev => addDays(prev, 7))}
              style={{ width: 34, height: 34, borderRadius: 9, border: `1.5px solid ${C.border}`, background: C.surface, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.textSec, transition: "all 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.background = C.surfaceHover; e.currentTarget.style.borderColor = C.pri; }}
              onMouseLeave={e => { e.currentTarget.style.background = C.surface; e.currentTarget.style.borderColor = C.border; }}
              title="Next week"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>

            {currentWeekStart !== thisWeekStart && (
              <Btn variant="secondary" size="sm" onClick={() => setCurrentWeekStart(thisWeekStart)}>
                This Week
              </Btn>
            )}
          </div>

          {/* Day picker — Mon through today (or full week for past weeks) */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: C.textMut, marginRight: 4 }}>Counted on:</span>
            {(() => {
              const days = [];
              const start = new Date(currentWeekStart + "T12:00:00");
              const endDate = currentWeekStart === thisWeekStart ? new Date(todayStr() + "T12:00:00") : new Date(start);
              if (currentWeekStart !== thisWeekStart) endDate.setDate(endDate.getDate() + 6);
              const d = new Date(start);
              while (d <= endDate) {
                const ds = d.toISOString().split("T")[0];
                days.push(ds);
                d.setDate(d.getDate() + 1);
              }
              return days.map(ds => {
                const dayLabel = new Date(ds + "T12:00:00").toLocaleDateString("en-US", { weekday: "short" });
                const isSelected = ds === countedDate;
                return (
                  <button key={ds} onClick={() => setCountedDate(ds)}
                    style={{
                      padding: "4px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                      border: `1.5px solid ${isSelected ? C.pri : C.border}`,
                      background: isSelected ? C.pri : C.surface, color: isSelected ? "#fff" : C.textSec,
                      transition: "all 0.15s",
                    }}
                    onMouseEnter={e => { if (!isSelected) { e.currentTarget.style.borderColor = C.pri; e.currentTarget.style.background = C.surfaceHover; }}}
                    onMouseLeave={e => { if (!isSelected) { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.surface; }}}
                  >{dayLabel}</button>
                );
              });
            })()}
            {countedDate !== todayStr() && (
              <span style={{ fontSize: 10, fontWeight: 600, color: C.warn, marginLeft: 4 }}>backdated</span>
            )}
          </div>

          {/* Dog Occupancy Badge */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "6px 14px", borderRadius: 10,
              background: C.priLt, border: `1.5px solid ${C.pri}20`,
            }}>
              <I.TrendingUp />
              <span style={{ fontSize: 13, fontWeight: 600, color: C.pri }}>
                Avg {avgDogsPerDay} dogs/day
              </span>
              <span style={{ fontSize: 11, color: C.textSec }}>&middot;</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.pri }}>
                {dogDays} dog-days
              </span>
            </div>
            <Btn variant="ghost" size="sm" icon={<I.BarChart />} onClick={() => setShowDepletionModal(true)}>
              Depletion Rates
            </Btn>
          </div>
        </div>
      </Card>

      {/* ── Search bar ── */}
      <div style={{ position: "relative", marginBottom: 16 }}>
        <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: C.textMut, pointerEvents: "none" }}>
          <I.Search />
        </div>
        <input
          type="text"
          placeholder="Search items by name, category, or vendor..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: "100%",
            padding: "11px 16px 11px 44px",
            borderRadius: 12,
            border: `1.5px solid ${search ? C.pri : C.border}`,
            fontSize: 14,
            fontFamily: "inherit",
            color: C.text,
            background: C.surface,
            outline: "none",
            boxSizing: "border-box",
            transition: "border 0.15s",
          }}
          onFocus={e => e.target.style.borderColor = C.pri}
          onBlur={e => { if (!search) e.target.style.borderColor = C.border; }}
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: C.textMut, display: "flex", padding: 4, borderRadius: 6 }}
          >
            <I.X />
          </button>
        )}
      </div>

      {/* ── Main Content ── */}
      {loading ? (
        <div>
          {[0, 1, 2].map(i => <SkeletonSection key={i} />)}
        </div>
      ) : loadError ? (
        <Card style={{ padding: 32, textAlign: "center" }}>
          <div style={{ fontSize: 16, color: C.dan, marginBottom: 8, fontWeight: 600 }}>
            Failed to load inventory data
          </div>
          <div style={{ fontSize: 13, color: C.textSec, marginBottom: 16 }}>{loadError}</div>
          <Btn variant="secondary" onClick={loadData}>Retry</Btn>
        </Card>
      ) : catalogItems.length === 0 && !loading ? (
        <Card style={{ padding: 48, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 8, fontFamily: "'Outfit', sans-serif" }}>
            No inventory items yet
          </div>
          <div style={{ fontSize: 14, color: C.textSec }}>
            Add items to the inventory catalog in Settings to get started.
          </div>
        </Card>
      ) : (
        <div className="inv-fade-in">
          {/* Read-only banner */}
          {isReadOnly && (
            <div style={{ marginBottom: 14, padding: "12px 16px", borderRadius: 10, background: C.sucLt, border: `1px solid ${C.suc}30`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <I.CheckCircle />
                <div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.suc }}>Inventory count completed. </span>
                  <span style={{ fontSize: 13, color: C.textSec }}>
                    This count is locked for editing.
                    {snapshot?.completed_at && ` Submitted ${new Date(snapshot.completed_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.`}
                    {snapshot?.completed_by && ` By ${snapshot.completed_by}.`}
                  </span>
                </div>
              </div>
              {canReopenSnapshot && (
                <Btn variant="danger" size="sm" onClick={() => setShowReopenModal(true)} disabled={reopenSaving}>
                  {reopenSaving ? "Reopening..." : "Mark Incomplete"}
                </Btn>
              )}
            </div>
          )}

          {!isReadOnly && inventoryWorkflow.readyToSubmit && (
            <div style={{ marginBottom: 14, padding: "12px 16px", borderRadius: 10, background: C.priLt, border: `1px solid ${C.pri}25`, display: "flex", alignItems: "center", gap: 10 }}>
              <I.CheckCircle />
              <div style={{ fontSize: 13, color: C.textSec }}>
                <span style={{ fontWeight: 700, color: C.pri }}>Ready to submit. </span>
                All catalog and ad-hoc items have been counted, and every reorder has been handled. Use the submit button below to lock the week.
              </div>
            </div>
          )}

          {!isReadOnly && latestReopenEntry && (
            <div style={{ marginBottom: 14, padding: "12px 16px", borderRadius: 10, background: C.warnLt, border: `1px solid ${C.warn}30`, display: "flex", alignItems: "center", gap: 10 }}>
              <I.RefreshCw />
              <div style={{ fontSize: 13, color: C.textSec, lineHeight: 1.5 }}>
                <span style={{ fontWeight: 700, color: C.warn }}>Count reopened. </span>
                {latestReopenEntry.user_name && `Reopened by ${latestReopenEntry.user_name}`}
                {latestReopenEntry.ts && ` on ${new Date(latestReopenEntry.ts).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`}
                {latestReopenEntry.reason ? ` — ${latestReopenEntry.reason}` : "."}
              </div>
            </div>
          )}

          {snapshotHistory.length > 0 && (
            <Card style={{ marginBottom: 14, padding: "14px 16px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.text, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
                Count History
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {snapshotHistory.map((entry, idx) => (
                  <div key={`${entry?.ts || "history"}-${idx}`} style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, paddingBottom: idx === snapshotHistory.length - 1 ? 0 : 8, borderBottom: idx === snapshotHistory.length - 1 ? "none" : `1px solid ${C.borderLight}` }}>
                    <div style={{ fontSize: 13, color: C.textSec, lineHeight: 1.5 }}>
                      <span style={{ fontWeight: 700, color: entry?.action === "reopened" ? C.warn : C.suc }}>
                        {entry?.action === "reopened" ? "Marked incomplete" : "Completed"}
                      </span>
                      {entry?.user_name ? ` by ${entry.user_name}` : ""}
                      {entry?.reason ? ` — ${entry.reason}` : ""}
                    </div>
                    <div style={{ fontSize: 11, color: C.textMut, whiteSpace: "nowrap" }}>
                      {entry?.ts ? new Date(entry.ts).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : ""}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Catalog edit mode banner */}
          {catalogEditMode && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 16px", borderRadius: 10, marginBottom: 12,
              background: C.infoLt, border: `1.5px solid ${C.info}20`,
            }}>
              <I.Edit />
              <span style={{ fontSize: 13, color: C.info, fontWeight: 500 }}>
                Editing catalog — drag to reorder, click fields to edit. Changes auto-save.
              </span>
              {catalogSaveStatus === "saving" && <span style={{ marginLeft: "auto", fontSize: 11, color: C.info, fontWeight: 600 }}>Saving...</span>}
              {catalogSaveStatus === "saved" && <span style={{ marginLeft: "auto", fontSize: 11, color: C.suc, fontWeight: 600 }}>Saved</span>}
              {catalogSaveStatus === "error" && <span style={{ marginLeft: "auto", fontSize: 11, color: C.dan, fontWeight: 600 }}>Save failed</span>}
            </div>
          )}

          {/* No snapshot for historical week */}
          {!snapshot && currentWeekStart !== thisWeekStart && !loading && (
            <Card style={{ padding: 32, textAlign: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>🗓</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 6, fontFamily: "'Outfit', sans-serif" }}>
                No count for this week
              </div>
              <div style={{ fontSize: 13, color: C.textSec }}>
                No inventory count was recorded for the week of {fmtWeekLabel(currentWeekStart)}.
              </div>
            </Card>
          )}

          {/* Catalog Sections */}
          {filteredGrouped.length === 0 && search ? (
            <Card style={{ padding: 32, textAlign: "center" }}>
              <div style={{ fontSize: 20, marginBottom: 8 }}>🔍</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: C.textSec }}>
                No items match "{search}"
              </div>
            </Card>
          ) : (
            filteredGrouped.map(({ category, subcategories }) => (
              <CategorySection
                key={category}
                category={category}
                subcategories={subcategories}
                counts={counts}
                isReadOnly={isReadOnly}
                onCountChange={handleCountChange}
                onKeyDown={handleKeyDown}
                inputRefs={inputRefs}
                searchQuery={search}
                catalogEditMode={catalogEditMode}
                editingField={editingField}
                onEditField={setEditingField}
                onCatalogChange={handleCatalogFieldChange}
                expandedEditId={expandedEditId}
                onToggleExpand={setExpandedEditId}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
                dragState={dragState}
                onToggleCatalogActive={handleToggleCatalogActive}
                onAddCatalogItem={handleAddCatalogItem}
              />
            ))
          )}

          {/* ── Ad-hoc Items Section ── */}
          {snapshot && (
            <div style={{ marginTop: 24 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text, fontFamily: "'Outfit', sans-serif" }}>
                    Ad-hoc Items
                  </h3>
                  <div style={{ fontSize: 12, color: C.textSec, marginTop: 2 }}>
                    One-off items not in the standard catalog
                  </div>
                </div>
                {!isReadOnly && (
                  <Btn variant="accent" size="sm" icon={<I.Plus />} onClick={() => setShowAddAdhoc(true)}>
                    Add Item
                  </Btn>
                )}
              </div>

              {adhocItems.length === 0 ? (
                <Card style={{ padding: 20, textAlign: "center", border: `1.5px dashed ${C.border}`, background: C.bg }}>
                  <div style={{ fontSize: 13, color: C.textMut }}>No ad-hoc items for this week.</div>
                  {!isReadOnly && (
                    <div style={{ marginTop: 8 }}>
                      <button
                        onClick={() => setShowAddAdhoc(true)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: C.info, fontSize: 13, fontWeight: 600, fontFamily: "inherit", padding: 0, textDecoration: "underline" }}
                      >
                        Add one now
                      </button>
                    </div>
                  )}
                </Card>
              ) : (
                <div style={{ borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
                  {/* Adhoc column headers */}
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "2fr 80px 80px 50px 50px 80px 80px 32px",
                    gap: 8,
                    padding: "8px 16px",
                    background: C.bg,
                    borderBottom: `1px solid ${C.borderLight}`,
                  }}>
                    {["Item", "On Hand", "Unit Cost", "Ordered", "Skip", "Value", "Type", ""].map((h, i) => (
                      <div key={i} style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.06em", textAlign: i >= 3 ? "center" : "left" }}>
                        {h}
                      </div>
                    ))}
                  </div>
                  {adhocItems.map(item => (
                    <AdhocItemRow key={item.id} item={item} isReadOnly={isReadOnly} onUpdate={updateAdhocItem} onDelete={deleteAdhocItem} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Summary Footer ── */}
          {snapshot && (
            <div style={{ marginTop: 24 }}>
              <Card style={{ padding: "18px 24px", background: `linear-gradient(135deg, ${C.pri}08, ${C.priLt})`, border: `1.5px solid ${C.priLt}` }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
                  {/* Stats */}
                  <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: C.textSec, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>
                        Total Items
                      </div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: C.pri }}>
                        {inventoryWorkflow.totalItems}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: C.textSec, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>
                        Items Counted
                      </div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: C.pri }}>
                        {inventoryWorkflow.itemsCounted}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: C.textSec, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>
                        Items to Reorder
                      </div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: C.warn }}>
                        {inventoryWorkflow.itemsNeedingOrder}
                      </div>
                    </div>
                    {dogDays > 0 && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: C.textSec, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>
                          Dog-Days
                        </div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: C.pri }}>{dogDays}</div>
                      </div>
                    )}
                  </div>

                  {/* Total value */}
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: C.textSec, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>
                      Total Inventory Value
                    </div>
                    <div style={{ fontSize: 32, fontWeight: 800, color: C.suc, fontFamily: "'Outfit', sans-serif" }}>
                      {fmtCurrency(totalValue)}
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* ── Submit Button ── */}
          {snapshot && !isReadOnly && (
            <div style={{ marginTop: 20, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
              {!canComplete && (
                <div style={{ fontSize: 12, color: C.warn, fontWeight: 500 }}>
                  {!inventoryWorkflow.countingComplete
                    ? `${inventoryWorkflow.missingCountCount} item${inventoryWorkflow.missingCountCount !== 1 ? "s" : ""} still need counting`
                    : `${inventoryWorkflow.pendingOrderingCount} item${inventoryWorkflow.pendingOrderingCount !== 1 ? "s" : ""} still need an order decision`
                  }
                </div>
              )}
              <Btn
                variant="success"
                size="lg"
                icon={<I.CheckCircle />}
                onClick={() => setShowSubmitModal(true)}
                disabled={!canComplete}
              >
                Complete Inventory Count
              </Btn>
            </div>
          )}
        </div>
      )}

      {/* ── Modals ── */}
      {showAddAdhoc && (
        <AddAdhocModal
          onClose={() => setShowAddAdhoc(false)}
          onSave={handleAddAdhoc}
          categories={allCategories}
        />
      )}

      {showSubmitModal && (
        <SubmitModal
          onClose={() => setShowSubmitModal(false)}
          onConfirm={handleSubmit}
          saving={submitSaving}
        />
      )}

      {showReopenModal && (
        <ReopenModal
          onClose={() => setShowReopenModal(false)}
          onConfirm={handleReopen}
          saving={reopenSaving}
        />
      )}



      {showDepletionModal && (
        <DepletionRateModal
          locationId={locationId}
          reservations={reservations}
          currentWeekStart={currentWeekStart}
          onClose={() => setShowDepletionModal(false)}
        />
      )}
    </div>
  );
}
