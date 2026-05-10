// K9 Operations — Inventory Count Page
// Comprehensive inventory management module for K9 Operations Lite (KOL)

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "../../supabaseClient";
import { useAuth } from "../../AuthProvider";
import { C, todayStr, addDays, gid, fmtDate } from "../../shared/theme";
import { Btn, Modal, Card, Inp, Badge, CustomSelect } from "../../shared/ui";
import { I } from "../../shared/icons";
import { hasLeanPermission } from "../../shared/permissions";
import { getInventoryWorkflow } from "./inventoryStatus";
import {
  DEFAULT_INVENTORY_SCHEDULE,
  formatInventoryCadenceLabel,
  getInventoryCycleStart,
  getInventoryOverdueInfo,
  normalizeInventorySchedule,
} from "./inventorySchedule";
import {
  addDateDays,
  buildInventoryDepletionAnalytics,
  buildInventoryQualityBreakdown,
  computeDogDaysForRange,
  INVENTORY_DEPLETION_QUALITY_LABELS,
  projectInventoryUsage,
  summarizeLatestInventoryCycle,
  summarizeInventoryUsageForRange,
} from "./inventoryDepletion";
import {
  assignInventoryCatalogSortOrder,
  buildInventoryCatalogGroups,
  getInventoryCategorySuggestions,
  getInventorySubcategorySuggestions,
  inventorySectionId,
  moveInventoryCatalogItem,
  moveInventoryCategory,
  renameInventorySubcategory,
} from "./inventoryCatalog";

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

const INVENTORY_VIEW_COLS = "2fr 80px 70px 70px 90px 80px 60px 80px 80px";
const INVENTORY_EDIT_COLS = "30px 2fr 80px 70px 70px 90px 80px 60px 80px 80px 44px";
const INVENTORY_VIEW_HEADERS = ["Product", "GL Code", "Par", "On Hand", "In Transit", "To Order", "Ordered", "Unit Cost", "Value"];
const INVENTORY_EDIT_HEADERS = ["", "Product", "GL Code", "Par", "On Hand", "In Transit", "To Order", "Ordered", "Unit Cost", "Value", ""];

function catalogSortPayload(items) {
  return (items || []).map((item) => ({
    id: item.id,
    category: item.category || "",
    subcategory: item.subcategory || "",
    sort_order: item.sort_order,
  }));
}

function normalizeCatalogNumber(value, integer = false) {
  if (value === "" || value == null) return null;
  const parsed = integer ? parseInt(value, 10) : parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// ─── Dog-Days Helpers ─────────────────────────────────────────────────────────

function getDogDaysForWeek(reservations, weekStart, cycleDays = 7) {
  const end = addDateDays(weekStart, Math.max(0, cycleDays - 1));
  return computeDogDaysForRange(reservations, weekStart, end);
}

function getAvgDogsPerDay(reservations, weekStart, cycleDays = 7) {
  if (!reservations || !reservations.length) return 0;
  const start = new Date(weekStart + "T00:00:00");
  let total = 0;
  for (let d = 0; d < cycleDays; d++) {
    const day = new Date(start);
    day.setDate(day.getDate() + d);
    const dayStr = day.toISOString().split('T')[0];
    const dogsThisDay = reservations.filter(r =>
      r.status !== "cancelled" && r.checkIn <= dayStr && r.checkOut >= dayStr
    ).length;
    total += dogsThisDay;
  }
  return Math.round(total / Math.max(1, cycleDays));
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

const ItemRow = React.memo(function ItemRow({ item, count, isReadOnly, canEditCounts, canMarkOrdered, onChange, onKeyDown, inputRef }) {
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
  const countReadOnly = isReadOnly || !canEditCounts;
  const orderReadOnly = isReadOnly || !canMarkOrdered;

  return (
    <>
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "grid",
        gridTemplateColumns: INVENTORY_VIEW_COLS,
        gap: 8,
        alignItems: "center",
        padding: "8px 16px",
        borderBottom: showNotes ? "none" : `1px solid ${C.borderLight}`,
        background: skipped ? (hovered ? "#FFFCF0" : "#FFFEF7") : (hovered ? C.surfaceHover : C.surface),
        opacity: skipped ? 0.6 : 1,
        transition: "background 0.15s, opacity 0.15s",
      }}
    >
      {/* Product name + Product Link + Notes Icon */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.item_name}
            {item.vendor_link && (
              <a
                href={item.vendor_link}
                target="_blank"
                rel="noopener noreferrer"
                title="Open product link"
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
          readOnly={countReadOnly}
          onChange={e => !countReadOnly && onChange("stock_count", clampPositive(e.target.value))}
          onKeyDown={onKeyDown}
          placeholder="0"
          data-item-id={item.id}
          data-field="stock_count"
          style={{
            width: "100%",
            padding: "6px 8px",
            borderRadius: 8,
            border: `2px solid ${countReadOnly ? C.border : hasFilled ? C.border : "#E6C200"}`,
            background: countReadOnly ? C.bg : hasFilled ? C.surface : "#FFFDE0",
            fontSize: 13,
            fontWeight: 600,
            color: C.text,
            textAlign: "center",
            outline: "none",
            cursor: countReadOnly ? "default" : "text",
            boxSizing: "border-box",
          }}
          onFocus={e => { if (!countReadOnly) e.target.style.borderColor = C.pri; }}
          onBlur={e => { if (!countReadOnly) e.target.style.borderColor = hasFilled ? C.border : "#E6C200"; }}
        />
      </div>

      {/* In Transit */}
      <div>
        <input
          type="number"
          min="0"
          value={inTransit}
          readOnly={countReadOnly}
          onChange={e => !countReadOnly && onChange("in_transit", clampPositive(e.target.value))}
          placeholder="0"
          style={{
            width: "100%",
            padding: "6px 8px",
            borderRadius: 8,
            border: `1.5px solid ${C.border}`,
            background: countReadOnly ? C.bg : C.surface,
            fontSize: 13,
            color: C.text,
            textAlign: "center",
            outline: "none",
            cursor: countReadOnly ? "default" : "text",
            boxSizing: "border-box",
          }}
          onFocus={e => { if (!countReadOnly) e.target.style.borderColor = C.pri; }}
          onBlur={e => { if (!countReadOnly) e.target.style.borderColor = C.border; }}
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
              {!orderReadOnly && (
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
              <label style={{ display: "flex", alignItems: "center", cursor: orderReadOnly ? "default" : "pointer" }}>
                <input
                  type="checkbox"
                  checked={true}
                  disabled={orderReadOnly}
                  onChange={e => !orderReadOnly && onChange("ordered", e.target.checked)}
                  style={{
                    width: 18,
                    height: 18,
                    accentColor: C.suc,
                    cursor: orderReadOnly ? "default" : "pointer",
                  }}
                />
              </label>
            </div>
          ) : (
            /* State 1: Needs ordering (not ordered, not skipped) */
            <>
              <label style={{ display: "flex", alignItems: "center", cursor: orderReadOnly ? "default" : "pointer" }}>
                <input
                  type="checkbox"
                  checked={false}
                  disabled={orderReadOnly}
                  onChange={e => !orderReadOnly && onChange("ordered", e.target.checked)}
                  style={{
                    width: 18,
                    height: 18,
                    accentColor: C.suc,
                    cursor: orderReadOnly ? "default" : "pointer",
                  }}
                />
              </label>
              {!orderReadOnly && (
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
          readOnly={countReadOnly}
          onChange={e => !countReadOnly && onChange("notes", e.target.value)}
          placeholder="Add a note for this item..."
          rows={2}
          style={{
            width: "100%",
            padding: "8px 10px",
            borderRadius: 8,
            border: `1.5px solid ${C.border}`,
            background: countReadOnly ? C.bg : C.surface,
            fontSize: 12,
            fontFamily: "inherit",
            color: C.text,
            resize: "none",
            outline: "none",
            boxSizing: "border-box",
          }}
          onFocus={e => { if (!countReadOnly) e.target.style.borderColor = C.pri; }}
          onBlur={e => { if (!countReadOnly) e.target.style.borderColor = C.border; }}
        />
      </div>
    )}
    </>
  );
});

// ─── Adhoc Item Row ───────────────────────────────────────────────────────────

function AdhocItemRow({ item, isReadOnly, canEditCounts, canMarkOrdered, onUpdate, onDelete }) {
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
          <div style={{ fontSize: 9, fontWeight: 700, color: C.textMut, textTransform: "uppercase", marginBottom: 3 }}>Product Link</div>
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
  onDragStart, onDragOver, onDrop, onDragEnd, dragOverKey, targetContext, onToggleActive, onOpenDetails,
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
        onDragOver={e => onDragOver(e, { ...targetContext, targetItemId: item.id })}
        onDrop={e => onDrop(e, { ...targetContext, targetItemId: item.id })}
        onDragEnd={onDragEnd}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "grid",
          gridTemplateColumns: INVENTORY_EDIT_COLS,
          gap: 8,
          alignItems: "center",
          padding: "8px 16px",
          borderTop: dragOverKey === item.id ? `2px solid ${C.pri}` : "none",
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

        {/* Unit Cost — editable */}
        <div>{renderEditableCell("unit_price", item.unit_price != null ? item.unit_price : null, { textAlign: "right", fontSize: 12 })}</div>

        {/* Value — muted */}
        <div style={{ fontSize: 12, color: C.textMut, textAlign: "right", opacity: 0.4 }}>
          {"\u2014"}
        </div>

        {/* Edit details */}
        <button
          onClick={() => onOpenDetails(item)}
          title="Edit product details"
          style={{
            background: hovered ? C.priLt : C.bg,
            border: `1px solid ${hovered ? C.pri + "30" : C.borderLight}`,
            borderRadius: 8,
            cursor: "pointer",
            padding: 6,
            color: hovered ? C.pri : C.textMut,
            transition: "all 0.15s",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <I.Pencil />
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

function AddItemRow({ category, subcategory, onAdd, onDragOver, onDrop, isDragOver }) {
  return (
    <button
      onClick={() => onAdd(category, subcategory)}
      onDragOver={onDragOver}
      onDrop={onDrop}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "10px 16px",
        border: `1.5px dashed ${isDragOver ? C.pri : C.border}`,
        borderRadius: 0,
        background: isDragOver ? C.priLt : "transparent",
        color: isDragOver ? C.pri : C.textMut,
        fontSize: 12,
        fontWeight: 500,
        fontFamily: "inherit",
        cursor: "pointer",
        transition: "all 0.15s",
      }}
      onMouseEnter={e => { e.currentTarget.style.background = C.surfaceHover; e.currentTarget.style.color = C.pri; e.currentTarget.style.borderColor = C.pri + "40"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.textMut; e.currentTarget.style.borderColor = C.border; }}
    >
      <I.Plus /> Add product
    </button>
  );
}

function SubcategoryHeader({ category, subcategory, catalogEditMode, onRenameSubcategory, onDragOver, onDrop, isDragOver }) {
  const [draft, setDraft] = useState(subcategory);

  useEffect(() => {
    setDraft(subcategory);
  }, [subcategory]);

  const commitRename = () => {
    const nextName = draft.trim();
    if (!nextName || nextName === subcategory) {
      setDraft(subcategory);
      return;
    }
    onRenameSubcategory(category, subcategory, nextName);
  };

  if (!subcategory) return null;

  return (
    <div
      onDragOver={onDragOver}
      onDrop={onDrop}
      style={{
        padding: "6px 16px",
        background: isDragOver ? C.priLt : C.bg + "80",
        borderBottom: `1px solid ${isDragOver ? C.pri + "55" : C.borderLight}`,
        transition: "background 0.15s, border-color 0.15s",
      }}
    >
      {catalogEditMode ? (
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={e => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              setDraft(subcategory);
              e.currentTarget.blur();
            }
          }}
          style={{
            width: "min(320px, 100%)",
            padding: "4px 6px",
            borderRadius: 7,
            border: `1.5px solid ${C.border}`,
            background: C.surface,
            color: C.textSec,
            fontSize: 11,
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            fontFamily: "inherit",
            outline: "none",
          }}
        />
      ) : (
        <span style={{ fontSize: 11, fontWeight: 600, color: C.textSec, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          {subcategory}
        </span>
      )}
    </div>
  );
}

// ─── Category Section ─────────────────────────────────────────────────────────

function CategorySection({ category, subcategories, counts, isReadOnly, canEditCounts, canMarkOrdered, onCountChange, onKeyDown, inputRefs, searchQuery,
  catalogEditMode, editingField, onEditField, onCatalogChange, expandedEditId, onToggleExpand,
  onDragStart, onDragOver, onDrop, onDragEnd, dragState, onToggleCatalogActive, onAddCatalogItem,
  onOpenCatalogItem, onRenameCategory, onRenameSubcategory, onMoveCategory, categoryIndex, categoryCount,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState(category);

  useEffect(() => {
    setCategoryDraft(category);
  }, [category]);

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

  const commitCategoryRename = () => {
    const nextName = categoryDraft.trim();
    if (!nextName || nextName === category) {
      setCategoryDraft(category);
      return;
    }
    onRenameCategory(category, nextName);
  };

  return (
    <div id={inventorySectionId(category)} style={{ marginBottom: 12, borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", scrollMarginTop: 72 }}>
      {/* Category Header */}
      <div
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          background: `linear-gradient(135deg, ${C.pri}08, ${C.priLt})`,
          border: "none",
          borderBottom: collapsed ? "none" : `1px solid ${C.borderLight}`,
          fontFamily: "inherit",
          gap: 12,
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? "Expand category" : "Collapse category"}
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              border: `1px solid ${C.borderLight}`,
              background: C.surface,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
              transition: "transform 0.2s",
              color: C.pri,
            }}
          >
            <I.ChevronDown />
          </button>
          {catalogEditMode ? (
            <input
              value={categoryDraft}
              onChange={e => setCategoryDraft(e.target.value)}
              onBlur={commitCategoryRename}
              onKeyDown={e => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") {
                  setCategoryDraft(category);
                  e.currentTarget.blur();
                }
              }}
              style={{
                minWidth: 180,
                maxWidth: 320,
                padding: "6px 8px",
                borderRadius: 8,
                border: `1.5px solid ${C.border}`,
                background: C.surface,
                color: C.pri,
                fontSize: 14,
                fontWeight: 800,
                fontFamily: "'Outfit', sans-serif",
                outline: "none",
              }}
            />
          ) : (
            <span style={{ fontSize: 14, fontWeight: 700, color: C.pri, fontFamily: "'Outfit', sans-serif" }}>
              {category}
            </span>
          )}
          <span style={{ fontSize: 11, color: C.textMut, fontWeight: 500 }}>
            {totalItems} item{totalItems !== 1 ? "s" : ""}
          </span>
        </div>
        {catalogEditMode ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
            <button
              onClick={() => onMoveCategory(category, -1)}
              disabled={categoryIndex === 0}
              title="Move category up"
              style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${C.borderLight}`, background: C.surface, color: categoryIndex === 0 ? C.textMut : C.textSec, cursor: categoryIndex === 0 ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", transform: "rotate(180deg)", opacity: categoryIndex === 0 ? 0.4 : 1 }}
            >
              <I.ChevronDown />
            </button>
            <button
              onClick={() => onMoveCategory(category, 1)}
              disabled={categoryIndex === categoryCount - 1}
              title="Move category down"
              style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${C.borderLight}`, background: C.surface, color: categoryIndex === categoryCount - 1 ? C.textMut : C.textSec, cursor: categoryIndex === categoryCount - 1 ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: categoryIndex === categoryCount - 1 ? 0.4 : 1 }}
            >
              <I.ChevronDown />
            </button>
            <button
              onClick={() => onAddCatalogItem(category, "")}
              title="Add product to category"
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.pri}25`, background: C.surface, color: C.pri, fontSize: 12, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}
            >
              <I.Plus /> Product
            </button>
          </div>
        ) : (
          categoryValue > 0 && (
            <span style={{ fontSize: 12, fontWeight: 700, color: C.suc, marginLeft: "auto" }}>
              {fmtCurrency(categoryValue)}
            </span>
          )
        )}
      </div>

      {/* Items by Subcategory */}
      {!collapsed && subcategories.map((sub, si) => {
        const subDropKey = `${category}\u0000${sub.name}\u0000end`;
        const headerDropKey = `${category}\u0000${sub.name}\u0000header`;
        const dropContext = { category, subcategory: sub.name };
        return (
        <div key={si}>
          <SubcategoryHeader
            category={category}
            subcategory={sub.name}
            catalogEditMode={catalogEditMode}
            onRenameSubcategory={onRenameSubcategory}
            onDragOver={e => onDragOver(e, { ...dropContext, dropKey: headerDropKey, position: "before" })}
            onDrop={e => onDrop(e, { ...dropContext, position: "before" })}
            isDragOver={dragState.overKey === headerDropKey}
          />
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
                  onDrop={onDrop}
                  onDragEnd={onDragEnd}
                  dragOverKey={dragState.overKey}
                  targetContext={dropContext}
                  onToggleActive={onToggleCatalogActive}
                  onOpenDetails={onOpenCatalogItem}
                />
              ))}
              <AddItemRow
                category={category}
                subcategory={sub.name}
                onAdd={onAddCatalogItem}
                onDragOver={e => onDragOver(e, { ...dropContext, dropKey: subDropKey, position: "after" })}
                onDrop={e => onDrop(e, { ...dropContext, position: "after" })}
                isDragOver={dragState.overKey === subDropKey}
              />
            </>
          ) : (
            sub.items.map(item => (
              <ItemRow
                key={item.id}
                item={item}
                count={counts[item.id]}
                isReadOnly={isReadOnly}
                canEditCounts={canEditCounts}
                canMarkOrdered={canMarkOrdered}
                onChange={(field, val) => onCountChange(item.id, field, val)}
                onKeyDown={(e) => onKeyDown(e, item.id)}
                inputRef={el => { if (el) inputRefs.current[item.id] = el; }}
              />
            ))
          )}
        </div>
        );
      })}
    </div>
  );
}

function InventoryColumnHeader({ catalogEditMode }) {
  const headers = catalogEditMode ? INVENTORY_EDIT_HEADERS : INVENTORY_VIEW_HEADERS;
  return (
    <div className="inventory-sticky-columns" style={{
      display: "grid",
      gridTemplateColumns: catalogEditMode ? INVENTORY_EDIT_COLS : INVENTORY_VIEW_COLS,
      gap: 8,
      padding: "9px 16px",
      marginBottom: 8,
      background: C.surface,
      border: `1px solid ${C.border}`,
      borderRadius: 10,
      boxShadow: "0 6px 18px rgba(15,23,42,0.08)",
    }}>
      {headers.map((h, i) => (
        <div key={`${h}-${i}`} style={{
          fontSize: 10,
          fontWeight: 800,
          color: C.textMut,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          textAlign: catalogEditMode
            ? (i === 0 || i === 10 ? "center" : i >= 8 ? "right" : i >= 3 ? "center" : "left")
            : (i === 6 ? "center" : i >= 7 ? "right" : i >= 2 ? "center" : "left"),
        }}>
          {h}
        </div>
      ))}
    </div>
  );
}

function InventorySectionNav({ groups, counts, catalogEditMode, onAddProduct }) {
  return (
    <aside className="inventory-sidebar">
      <Card style={{ padding: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: C.text, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Sections
          </div>
          {catalogEditMode && (
            <button
              onClick={() => onAddProduct("", "")}
              title="Add product"
              style={{ width: 30, height: 30, borderRadius: 8, border: `1px solid ${C.pri}25`, background: C.priLt, color: C.pri, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <I.Plus />
            </button>
          )}
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          {groups.map(({ category, subcategories }) => {
            const items = subcategories.flatMap((sub) => sub.items);
            const counted = items.filter((item) => {
              const stock = counts[item.id]?.stock_count;
              return stock !== "" && stock != null;
            }).length;
            const total = items.length;
            const progress = total ? Math.round((counted / total) * 100) : 0;
            return (
              <button
                key={category}
                onClick={() => document.getElementById(inventorySectionId(category))?.scrollIntoView({ behavior: "smooth", block: "start" })}
                style={{
                  width: "100%",
                  border: `1px solid ${C.borderLight}`,
                  background: C.surface,
                  borderRadius: 8,
                  padding: "9px 10px",
                  cursor: "pointer",
                  textAlign: "left",
                  fontFamily: "inherit",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{category}</span>
                  <span style={{ fontSize: 10, fontWeight: 800, color: progress === 100 ? C.suc : C.textMut }}>{counted}/{total}</span>
                </div>
                <div style={{ height: 4, borderRadius: 999, background: C.bg, marginTop: 7, overflow: "hidden" }}>
                  <div style={{ width: `${progress}%`, height: "100%", borderRadius: 999, background: progress === 100 ? C.suc : C.pri }} />
                </div>
              </button>
            );
          })}
        </div>
      </Card>
    </aside>
  );
}

function CatalogItemModal({ mode, item, defaults, catalogItems, categories, subcategories, onClose, onSave, saving }) {
  const [form, setForm] = useState(() => ({
    item_name: item?.item_name || defaults?.item_name || "",
    gl_account: item?.gl_account || defaults?.gl_account || "",
    par_level: item?.par_level ?? defaults?.par_level ?? "",
    size: item?.size || defaults?.size || "",
    vendor: item?.vendor || defaults?.vendor || "",
    vendor_link: item?.vendor_link || defaults?.vendor_link || "",
    category: item?.category || defaults?.category || "",
    subcategory: item?.subcategory || defaults?.subcategory || "",
    unit_price: item?.unit_price ?? defaults?.unit_price ?? "",
  }));
  const [showError, setShowError] = useState(false);
  const categoryListId = `inventory-category-list-${item?.id || "new"}`;
  const subcategoryListId = `inventory-subcategory-list-${item?.id || "new"}`;
  const visibleSubcategories = useMemo(() => {
    const scoped = getInventorySubcategorySuggestions(catalogItems, form.category);
    return scoped.length > 0 ? scoped : subcategories;
  }, [catalogItems, form.category, subcategories]);

  const setField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (field === "item_name" && showError && value.trim()) setShowError(false);
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
      vendor_link: form.vendor_link.trim(),
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
      <datalist id={categoryListId}>
        {categories.map((category) => <option key={category} value={category} />)}
      </datalist>
      <datalist id={subcategoryListId}>
        {visibleSubcategories.map((subcategory) => <option key={subcategory} value={subcategory} />)}
      </datalist>
      <div style={{ display: "grid", gap: 16 }}>
        <div style={{ padding: 12, borderRadius: 10, background: C.bg, border: `1px solid ${C.borderLight}`, fontSize: 12, color: C.textSec }}>
          Product name is the only required field.
        </div>
        {renderField("Product Name", "item_name", { autoFocus: true, placeholder: "Product name" })}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {renderField("Category", "category", { list: categoryListId, placeholder: "Category" })}
          {renderField("Subcategory", "subcategory", { list: subcategoryListId, placeholder: "Subcategory" })}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          {renderField("GL Code", "gl_account", { placeholder: "GL code" })}
          {renderField("Par", "par_level", { type: "number", min: "0", placeholder: "0" })}
          {renderField("Size", "size", { placeholder: "Size" })}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 12 }}>
          {renderField("Vendor", "vendor", { placeholder: "Vendor" })}
          {renderField("Product Link", "vendor_link", { placeholder: "https://..." })}
        </div>
        {renderField("Unit Cost", "unit_price", { type: "number", min: "0", step: "0.01", placeholder: "0.00" })}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn variant="secondary" onClick={onClose} disabled={saving}>Cancel</Btn>
          <Btn variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : mode === "edit" ? "Save Product" : "Add Product"}
          </Btn>
        </div>
      </div>
    </Modal>
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

  const categoryListId = "inventory-adhoc-category-list";

  return (
    <Modal title="Add Ad-hoc Item" onClose={onClose}>
      <datalist id={categoryListId}>
        {categories.map((category) => <option key={category} value={category} />)}
      </datalist>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <Inp label="Item Name" value={form.item_name} onChange={v => setForm(f => ({ ...f, item_name: v }))} placeholder="e.g. Paper Towels" required />
          {errors.item_name && <div style={{ fontSize: 11, color: C.dan, marginTop: 4 }}>{errors.item_name}</div>}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.textSec, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.03em" }}>Category</div>
            <input
              value={form.category}
              list={categoryListId}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              placeholder="Category"
              style={{ width: "100%", padding: "10px 14px", border: `1.5px solid ${C.border}`, borderRadius: 10, fontSize: 14, fontFamily: "inherit", color: form.category ? C.text : C.textMut, background: C.surface, outline: "none" }}
            />
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
            Once submitted, this inventory count will be locked for editing. All counts will be saved and this cycle's snapshot will be marked complete.
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
            This will unlock the cycle for editing and write an audit trail showing who reopened it and why.
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

function InventoryScheduleModal({ draft, onChange, onClose, onConfirm, saving }) {
  const cadenceOptions = [
    { value: "7", label: "Every week" },
    { value: "14", label: "Every 2 weeks" },
    { value: "28", label: "Every 4 weeks" },
  ];
  const weekdayOptions = [
    { value: "0", label: "Sunday" },
    { value: "1", label: "Monday" },
    { value: "2", label: "Tuesday" },
    { value: "3", label: "Wednesday" },
    { value: "4", label: "Thursday" },
    { value: "5", label: "Friday" },
    { value: "6", label: "Saturday" },
  ];

  return (
    <Modal title="Inventory Schedule" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ padding: 14, borderRadius: 12, background: C.bg, border: `1px solid ${C.borderLight}`, fontSize: 13, color: C.textSec, lineHeight: 1.55 }}>
          Control the resort-level cadence, due day, and due time here. Enterprise overrides can layer on later without changing the local data shape.
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.textSec, marginBottom: 6 }}>Cadence</div>
            <CustomSelect value={String(draft.cadenceDays)} onChange={(value) => onChange({ ...draft, cadenceDays: Number(value) })} options={cadenceOptions} />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.textSec, marginBottom: 6 }}>Due Day</div>
            <CustomSelect value={String(draft.dueWeekday)} onChange={(value) => onChange({ ...draft, dueWeekday: Number(value) })} options={weekdayOptions} />
          </div>
          <Inp
            label="Due Time"
            type="time"
            value={draft.dueTime || "09:00"}
            onChange={(value) => onChange({ ...draft, dueTime: value || "09:00" })}
          />
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Btn variant="secondary" onClick={onClose} disabled={saving}>Cancel</Btn>
          <Btn variant="primary" onClick={onConfirm} disabled={saving}>{saving ? "Saving..." : "Save Schedule"}</Btn>
        </div>
      </div>
    </Modal>
  );
}

// ─── Depletion Rate Modal ─────────────────────────────────────────────────────

function DepletionRateModal({ locationId, reservations, currentWeekStart, inventorySchedule, onClose }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [countRows, setCountRows] = useState([]);
  const [periodMode, setPeriodMode] = useState("latest");
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [qualityFilter, setQualityFilter] = useState(null);

  useEffect(() => {
    (async () => {
      if (!locationId) return;
      setLoading(true);
      setLoadError(null);
      try {
        const { data: catalogData, error: catErr } = await supabase
          .from("inventory_catalog")
          .select("id, item_name, unit_price, par_level, category, is_active, sort_order")
          .eq("location_id", locationId)
          .order("category", { ascending: true })
          .order("sort_order", { ascending: true });
        if (catErr) throw catErr;

        const { data: snapshotData, error: snapErr } = await supabase
          .from("inventory_snapshots")
          .select("*")
          .eq("location_id", locationId)
          .order("week_start", { ascending: true });
        if (snapErr) throw snapErr;

        let loadedCounts = [];
        const snapshotIds = (snapshotData || []).map((snap) => snap.id).filter(Boolean);
        if (snapshotIds.length > 0) {
          const { data: countsData, error: countErr } = await supabase
            .from("inventory_counts")
            .select("*")
            .in("snapshot_id", snapshotIds);
          if (countErr) throw countErr;
          loadedCounts = countsData || [];
        }

        setCatalog(catalogData || []);
        setSnapshots(snapshotData || []);
        setCountRows(loadedCounts);
      } catch (err) {
        console.error("Depletion data load error:", err);
        setLoadError(err.message || "Failed to load depletion data");
      } finally {
        setLoading(false);
      }
    })();
  }, [locationId]);

  const analytics = useMemo(() => buildInventoryDepletionAnalytics({
    catalog,
    snapshots,
    counts: countRows,
    reservations,
  }), [catalog, snapshots, countRows, reservations]);

  const qualityBreakdown = useMemo(() => buildInventoryQualityBreakdown(analytics.cycles), [analytics.cycles]);

  const visibleItemStats = useMemo(() => {
    if (!qualityFilter) return analytics.itemStats;
    return analytics.itemStats.filter((item) =>
      item.cycles.some((cycle) => !cycle.usableForCoefficient && cycle.quality === qualityFilter)
    );
  }, [analytics.itemStats, qualityFilter]);

  const fallbackDogDaysPerDay = useMemo(() => {
    if (!analytics.cycleSummaries.length) return 0;
    const totalDays = analytics.cycleSummaries.reduce((sum, cycle) => {
      const start = new Date(`${cycle.cycleStart}T12:00:00`);
      const end = new Date(`${cycle.cycleEnd}T12:00:00`);
      const days = Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
      return sum + Math.max(days, 0);
    }, 0);
    return totalDays > 0 ? analytics.cycleSummaries.reduce((sum, cycle) => sum + (cycle.dogDays || 0), 0) / totalDays : 0;
  }, [analytics.cycleSummaries]);

  const period = useMemo(() => {
    const today = todayStr();
    const isProjection = periodMode.startsWith("next");
    const days = periodMode.endsWith("30") ? 30 : 7;

    if (isProjection) {
      const projection = projectInventoryUsage({
        itemStats: analytics.itemStats,
        reservations,
        startKey: today,
        days,
        fallbackDogDaysPerDay,
      });
      return {
        label: `Projected Next ${days} Days`,
        isProjection: true,
        isLatestCycle: false,
        usageValue: projection.projectedValue,
        consumedValue: projection.projectedValue,
        receivedValue: null,
        netInventoryValueChange: -projection.projectedValue,
        usageUnits: projection.projectedUnits,
        dogDays: projection.dogDays,
        cycleCount: analytics.cycleSummaries.length,
        items: projection.items,
      };
    }

    if (periodMode === "latest") {
      const summary = summarizeLatestInventoryCycle(analytics.cycles);
      return {
        label: summary.cycleStart ? `${summary.cycleStart} to ${summary.cycleEnd}` : "Latest Completed Cycle",
        isProjection: false,
        isLatestCycle: true,
        usageValue: summary.usageValue,
        consumedValue: summary.consumedValue,
        receivedValue: summary.receivedValue,
        netInventoryValueChange: summary.netInventoryValueChange,
        usageUnits: summary.usageUnits,
        dogDays: summary.dogDays,
        cycleCount: summary.cycleCount,
        items: analytics.itemStats,
      };
    }

    const start = addDateDays(today, -29);
    const summary = summarizeInventoryUsageForRange(analytics.cycles, start, today);
    return {
      label: "Completed cycles overlapping last 30 days",
      isProjection: false,
      isLatestCycle: false,
      usageValue: summary.usageValue,
      consumedValue: summary.consumedValue,
      receivedValue: summary.receivedValue,
      netInventoryValueChange: summary.netInventoryValueChange,
      usageUnits: summary.usageUnits,
      dogDays: summary.dogDays,
      cycleCount: summary.cycleCount,
      items: analytics.itemStats,
    };
  }, [analytics, fallbackDogDaysPerDay, periodMode, reservations]);

  const latestSnapshot = useMemo(() => {
    return [...snapshots]
      .sort((a, b) => String(b.week_start || "").localeCompare(String(a.week_start || "")))[0] || null;
  }, [snapshots]);

  const currentInventory = useMemo(() => {
    if (!latestSnapshot) return { value: 0, belowPar: 0 };
    const catalogMap = {};
    catalog.forEach((item) => { catalogMap[item.id] = item; });
    const latestCounts = countRows.filter((row) => row.snapshot_id === latestSnapshot.id);
    return latestCounts.reduce((acc, row) => {
      const item = catalogMap[row.catalog_item_id];
      if (!item) return acc;
      const stock = Number(row.stock_count || 0);
      const unitCost = Number(item.unit_price || 0);
      const par = item.par_level == null ? null : Number(item.par_level);
      acc.value += stock * unitCost;
      if (par != null && stock < par) acc.belowPar += 1;
      return acc;
    }, { value: 0, belowPar: 0 });
  }, [catalog, countRows, latestSnapshot]);

  const selectedItem = useMemo(() => {
    return visibleItemStats.find((item) => item.itemId === selectedItemId) || visibleItemStats[0] || null;
  }, [visibleItemStats, selectedItemId]);

  useEffect(() => {
    if (visibleItemStats.length > 0 && !visibleItemStats.some((item) => item.itemId === selectedItemId)) {
      setSelectedItemId(visibleItemStats[0].itemId);
    }
  }, [visibleItemStats, selectedItemId]);

  const confidenceBadge = (confidence) => {
    const colors = {
      High: { bg: C.sucLt, color: C.suc },
      Medium: { bg: C.warnLt, color: C.warn },
      Low: { bg: C.bg, color: C.textMut },
      Emerging: { bg: C.bg, color: C.textMut },
      Insufficient: { bg: C.danLt, color: C.dan },
    };
    const c = colors[confidence] || colors.Insufficient;
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

  const fmtQty = (value, digits = 1) => {
    if (value == null || Number.isNaN(Number(value))) return "-";
    return Number(value).toLocaleString("en-US", { maximumFractionDigits: digits });
  };
  const fmtRate = (value) => value == null ? "-" : Number(value).toFixed(4);
  const fmtMaybeCurrency = (value) => value == null || Number.isNaN(Number(value)) ? "-" : fmtCurrency(value);
  const fmtSignedCurrency = (value) => {
    if (value == null || Number.isNaN(Number(value))) return "-";
    const abs = fmtCurrency(Math.abs(Number(value)));
    if (Number(value) > 0) return `+${abs}`;
    if (Number(value) < 0) return `-${abs}`;
    return abs;
  };
  const confidenceColor = (confidence) => {
    if (confidence === "High") return C.suc;
    if (confidence === "Medium") return C.warn;
    if (confidence === "Low" || confidence === "Emerging") return C.warn;
    return C.dan;
  };
  const consumedValue = period.consumedValue ?? period.usageValue ?? 0;
  const costPerDogDay = period.dogDays > 0 ? consumedValue / period.dogDays : 0;
  const maxCycleValue = Math.max(1, ...analytics.cycleSummaries.map((cycle) => cycle.usageValue || 0));
  const visibleChartCycles = analytics.cycleSummaries.slice(-10);
  const confidenceCycleCount = new Set(analytics.validCycles.map((cycle) => cycle.closingWeekStart)).size;
  const confidenceCycleLabel = `${confidenceCycleCount} valid completed cycle${confidenceCycleCount === 1 ? "" : "s"}`;
  const qualityFilterLabel = qualityFilter ? INVENTORY_DEPLETION_QUALITY_LABELS[qualityFilter] || qualityFilter.replaceAll("_", " ") : null;

  return (
    <Modal title="Depletion Rate Analytics" onClose={onClose} wide>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: C.textMut }}>Loading depletion data...</div>
        ) : loadError ? (
          <div style={{ padding: 28, borderRadius: 10, background: C.danLt, border: `1px solid ${C.dan}30`, color: C.dan, fontSize: 13 }}>
            {loadError}
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {[
                  ["latest", "Latest Completed Cycle"],
                  ["last30", "Last 30 Days"],
                  ["next7", "Next 7 Days"],
                  ["next30", "Next 30 Days"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setPeriodMode(value)}
                    style={{
                      border: `1px solid ${periodMode === value ? C.pri : C.border}`,
                      background: periodMode === value ? C.pri : C.surface,
                      color: periodMode === value ? "#fff" : C.textSec,
                      borderRadius: 8,
                      padding: "7px 11px",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 12, color: C.textMut }}>
                {latestSnapshot ? `Latest count: ${fmtWeekLabel(latestSnapshot.week_start)}` : "No completed count loaded"}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
              {[
                { label: period.isProjection ? "Projected Consumed Value" : "Consumed Value", value: fmtCurrency(consumedValue), color: C.suc, sub: `${period.label} - all products` },
                { label: "Estimated Received Value", value: fmtMaybeCurrency(period.receivedValue), color: C.pri, sub: period.isProjection ? "Not projected" : "Prior in-transit estimate" },
                { label: period.isProjection ? "Net Drawdown" : "Net Inventory Change", value: fmtSignedCurrency(period.netInventoryValueChange), color: Number(period.netInventoryValueChange || 0) < 0 ? C.warn : C.text, sub: period.isProjection ? "No receipts assumed" : "Ending minus opening" },
                { label: "Dog-Days", value: fmtQty(period.dogDays, 0), color: C.pri, sub: period.isProjection ? "Booked or historical fallback" : `${period.cycleCount} completed cycle${period.cycleCount === 1 ? "" : "s"}` },
                { label: "Consumed / Dog-Day", value: fmtCurrency(costPerDogDay), color: C.acc, sub: "Consumed value per dog-day" },
                { label: "Data Confidence", value: analytics.confidence, color: confidenceColor(analytics.confidence), sub: confidenceCycleLabel },
                { label: "On-Hand Value", value: fmtCurrency(currentInventory.value), color: C.text, sub: `${currentInventory.belowPar} below par` },
              ].map((metric) => (
                <div key={metric.label} style={{ padding: "14px 16px", borderRadius: 10, background: C.bg, border: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
                    {metric.label}
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: metric.color }}>{metric.value}</div>
                  <div style={{ fontSize: 10, color: C.textMut, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {metric.sub}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ padding: "10px 12px", borderRadius: 10, background: C.bg, border: `1px solid ${C.borderLight}`, color: C.textSec, fontSize: 12, lineHeight: 1.45 }}>
              <span style={{ fontWeight: 800, color: C.text }}>Basis:</span> Consumed = opening on-hand + estimated received - closing on-hand. Estimated received uses prior in-transit until true receiving data exists.
            </div>

            {analytics.cycleSummaries.length === 0 ? (
              <div style={{ padding: 32, textAlign: "center", color: C.textMut, borderRadius: 10, background: C.bg, border: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6, color: C.text }}>No completed count-to-count cycles yet</div>
                <div style={{ fontSize: 12, lineHeight: 1.5 }}>
                  This view now computes directly from completed inventory snapshots. It needs at least two completed counts for the same resort.
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1.3fr 0.9fr", gap: 14 }}>
                  <div style={{ padding: 14, borderRadius: 10, background: C.surface, border: `1px solid ${C.border}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginBottom: 12 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>Consumed Value by Completed Cycle</div>
                        <div style={{ fontSize: 11, color: C.textMut }}>All-product dollar value consumed, normalized separately by dog-days below.</div>
                      </div>
                      <div style={{ fontSize: 11, color: C.textMut }}>{analytics.confidence} confidence</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "end", gap: 8, height: 150, padding: "4px 0 0" }}>
                      {visibleChartCycles.map((cycle) => {
                        const height = Math.max(6, (cycle.usageValue / maxCycleValue) * 120);
                        return (
                          <div key={cycle.key} style={{ flex: 1, minWidth: 34, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                            <div title={`${cycle.cycleStart} to ${cycle.cycleEnd}: ${fmtCurrency(cycle.usageValue)}`} style={{
                              width: "100%",
                              maxWidth: 42,
                              height,
                              borderRadius: "6px 6px 2px 2px",
                              background: C.pri,
                              opacity: cycle.validItems > 0 ? 0.9 : 0.25,
                            }} />
                            <div style={{ fontSize: 10, color: C.textMut, whiteSpace: "nowrap" }}>
                              {new Date(`${cycle.cycleEnd}T12:00:00`).toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div style={{ padding: 14, borderRadius: 10, background: C.surface, border: `1px solid ${C.border}` }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: C.text, marginBottom: 8 }}>Data Quality</div>
                    <div style={{ display: "grid", gap: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12 }}>
                        <span style={{ color: C.textSec }}>Completed cycles</span>
                        <span style={{ fontWeight: 800, color: C.text }}>{analytics.cycleSummaries.length}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12 }}>
                        <span style={{ color: C.textSec }}>Valid item-cycle coefficients</span>
                        <span style={{ fontWeight: 800, color: C.suc }}>{analytics.validCycles.length}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12 }}>
                        <span style={{ color: C.textSec }}>Excluded item-cycles</span>
                        <span style={{ fontWeight: 800, color: analytics.excludedCycles ? C.warn : C.text }}>{analytics.excludedCycles}</span>
                      </div>
                      {qualityBreakdown.length > 0 && (
                        <div style={{ display: "grid", gap: 6 }}>
                          {qualityBreakdown.map((row) => {
                            const active = row.quality === qualityFilter;
                            return (
                              <button
                                key={row.quality}
                                onClick={() => setQualityFilter(active ? null : row.quality)}
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  gap: 8,
                                  width: "100%",
                                  padding: "7px 8px",
                                  borderRadius: 7,
                                  border: `1px solid ${active ? C.warn : C.borderLight}`,
                                  background: active ? C.warnLt : C.bg,
                                  color: active ? C.warn : C.textSec,
                                  fontSize: 11,
                                  fontWeight: 700,
                                  fontFamily: "inherit",
                                  cursor: "pointer",
                                  textAlign: "left",
                                }}
                              >
                                <span>{row.label}</span>
                                <span>{row.count}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                      <div style={{ padding: 10, borderRadius: 8, background: analytics.excludedCycles ? C.warnLt : C.sucLt, color: analytics.excludedCycles ? C.warn : C.suc, fontSize: 11, lineHeight: 1.45 }}>
                        {analytics.excludedCycles
                          ? "Some cycles are excluded from coefficients. Click a reason above to focus the product picker on affected products."
                          : "All loaded item-cycles are usable for the current coefficient."}
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>Product Picker</div>
                    <div style={{ fontSize: 11, color: C.textMut }}>
                      {qualityFilterLabel ? `Focused on ${qualityFilterLabel.toLowerCase()} (${visibleItemStats.length} products)` : `${visibleItemStats.length} products loaded`}
                    </div>
                  </div>
                  {qualityFilter && (
                    <button
                      onClick={() => setQualityFilter(null)}
                      style={{
                        border: `1px solid ${C.border}`,
                        background: C.surface,
                        color: C.textSec,
                        borderRadius: 8,
                        padding: "6px 10px",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer",
                        fontFamily: "inherit",
                      }}
                    >
                      Clear focus
                    </button>
                  )}
                </div>

                <div style={{ borderRadius: 10, border: `1px solid ${C.border}`, overflow: "hidden", maxHeight: 260, overflowY: "auto" }}>
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "2fr 1fr 0.8fr",
                    gap: 8,
                    padding: "8px 14px",
                    background: C.bg,
                    borderBottom: `1px solid ${C.borderLight}`,
                    position: "sticky",
                    top: 0,
                    zIndex: 1,
                  }}>
                    {["Product", "Category", "Status"].map((h) => (
                      <div key={h} style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                        {h}
                      </div>
                    ))}
                  </div>

                  {visibleItemStats.map((stat) => {
                    const active = stat.itemId === selectedItem?.itemId;
                    return (
                      <button
                        key={stat.itemId}
                        onClick={() => setSelectedItemId(stat.itemId)}
                        style={{
                          width: "100%",
                          display: "grid",
                          gridTemplateColumns: "2fr 1fr 0.8fr",
                          gap: 8,
                          padding: "10px 14px",
                          border: "none",
                          borderBottom: `1px solid ${C.borderLight}`,
                          alignItems: "center",
                          background: active ? C.priLt : C.surface,
                          cursor: "pointer",
                          textAlign: "left",
                          fontFamily: "inherit",
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{stat.itemName}</div>
                          <div style={{ fontSize: 10, color: C.textMut }}>{stat.validCycles > 0 ? "Click for product depletion history" : "Click for count history"}</div>
                        </div>
                        <div style={{ fontSize: 12, color: C.textSec }}>{stat.category}</div>
                        <div>{confidenceBadge(stat.confidence)}</div>
                      </button>
                    );
                  })}
                  {visibleItemStats.length === 0 && (
                    <div style={{ padding: 18, color: C.textMut, fontSize: 12, textAlign: "center" }}>
                      No products match this data-quality focus.
                    </div>
                  )}
                </div>

                {selectedItem && (
                  <div style={{ padding: 14, borderRadius: 10, background: C.surface, border: `1px solid ${C.border}` }}>
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>{selectedItem.itemName}</div>
                        <div style={{ fontSize: 11, color: C.textMut }}>
                          Overall coefficient {fmtRate(selectedItem.avgRatePerDogDay)} units per dog-day. Unit cost {fmtCurrency(selectedItem.unitCost ?? selectedItem.unitPrice ?? 0)}.
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: C.textMut }}>
                        Recommended par: {selectedItem.recommendedPar ?? "-"} · Current par: {selectedItem.currentPar ?? "-"}
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 12 }}>
                      {[
                        { label: "Consumed Value", value: fmtCurrency(selectedItem.totalConsumedValue || 0), sub: "Included cycles" },
                        { label: "Estimated Received Value", value: fmtCurrency(selectedItem.totalReceivedValue || 0), sub: "Prior in-transit" },
                        { label: "Net Change", value: fmtSignedCurrency(selectedItem.totalNetInventoryValueChange || 0), sub: "Closing minus opening" },
                        { label: "Latest On-Hand", value: fmtMaybeCurrency(selectedItem.latestOnHandValue), sub: `${fmtQty(selectedItem.latestOnHand, 0)} units` },
                      ].map((metric) => (
                        <div key={metric.label} style={{ padding: "10px 12px", borderRadius: 8, background: C.bg, border: `1px solid ${C.borderLight}` }}>
                          <div style={{ fontSize: 9, fontWeight: 800, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em" }}>{metric.label}</div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginTop: 2 }}>{metric.value}</div>
                          <div style={{ fontSize: 10, color: C.textMut, marginTop: 2 }}>{metric.sub}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ overflowX: "auto" }}>
                      <div style={{
                        display: "grid",
                        gridTemplateColumns: "150px 64px 64px 78px 72px 88px 82px 88px 1fr",
                        gap: 8,
                        minWidth: 890,
                        padding: "8px 10px",
                        background: C.bg,
                        borderRadius: 8,
                        fontSize: 10,
                        fontWeight: 800,
                        color: C.textMut,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}>
                        {["Cycle", "Open", "Close", "Est. Received", "Used", "Consumed $", "Dog-Days", "Coeff.", "Status"].map((h) => <div key={h}>{h}</div>)}
                      </div>
                      {selectedItem.cycles.map((cycle) => (
                        <div
                          key={`${cycle.itemId}-${cycle.cycleStart}-${cycle.cycleEnd}`}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "150px 64px 64px 78px 72px 88px 82px 88px 1fr",
                            gap: 8,
                            minWidth: 890,
                            padding: "9px 10px",
                            borderBottom: `1px solid ${C.borderLight}`,
                            fontSize: 12,
                            color: C.textSec,
                            alignItems: "center",
                          }}
                        >
                          <div style={{ fontWeight: 700, color: C.text }}>{cycle.cycleStart} to {cycle.cycleEnd}</div>
                          <div>{fmtQty(cycle.openingStock, 0)}</div>
                          <div>{fmtQty(cycle.closingStock, 0)}</div>
                          <div>{fmtQty(cycle.receivedUnits, 0)}</div>
                          <div style={{ fontWeight: 800, color: cycle.usableForCoefficient ? C.pri : C.textMut }}>{fmtQty(cycle.depletion, 1)}</div>
                          <div style={{ fontWeight: 800, color: cycle.usableForCoefficient ? C.suc : C.textMut }}>{fmtCurrency(cycle.consumedValue || 0)}</div>
                          <div>{fmtQty(cycle.dogDays, 0)}</div>
                          <div>{fmtRate(cycle.ratePerDogDay)}</div>
                          <div style={{ color: cycle.usableForCoefficient ? C.suc : C.warn, fontWeight: 700 }}>
                            {cycle.usableForCoefficient ? "Included" : cycle.quality.replaceAll("_", " ")}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, paddingTop: 4 }}>
              <div style={{ fontSize: 11, color: C.textMut, lineHeight: 1.45 }}>
                Consumed value uses opening stock plus estimated received supply minus closing stock. Existing "in transit" values are treated as prior-cycle supply until explicit receiving data exists.
              </div>
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
  const { profile: authProfile } = useAuth();

  // ── Week + Day navigation ──
  const [inventorySchedule, setInventorySchedule] = useState(() => normalizeInventorySchedule(DEFAULT_INVENTORY_SCHEDULE, todayStr()));
  const [currentWeekStart, setCurrentWeekStart] = useState(() => getInventoryCycleStart(todayStr(), DEFAULT_INVENTORY_SCHEDULE));
  const thisWeekStart = useMemo(() => getInventoryCycleStart(todayStr(), inventorySchedule), [inventorySchedule]);
  const [countedDate, setCountedDate] = useState(() => {
    const saved = localStorage.getItem("k9_inventory_countedDate");
    const week = getInventoryCycleStart(todayStr(), DEFAULT_INVENTORY_SCHEDULE);
    // Restore if saved date is within the current cycle.
    if (saved && saved >= week && saved <= todayStr()) return saved;
    return todayStr();
  });

  // Persist countedDate to localStorage
  useEffect(() => {
    localStorage.setItem("k9_inventory_countedDate", countedDate);
  }, [countedDate]);

  // Reset countedDate when the viewed cycle changes, but not on initial mount.
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
  const [catalogItemModal, setCatalogItemModal] = useState(null);
  const [saveStatus, setSaveStatus] = useState("idle"); // idle | saving | saved | error
  const [submitSaving, setSubmitSaving] = useState(false);
  const [reopenSaving, setReopenSaving] = useState(false);
  const [showDepletionModal, setShowDepletionModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleDraft, setScheduleDraft] = useState(() => normalizeInventorySchedule(DEFAULT_INVENTORY_SCHEDULE, todayStr()));
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [catalogEditMode, setCatalogEditMode] = useState(false);
  const [editingField, setEditingField] = useState(null); // { itemId, field }
  const [expandedEditId, setExpandedEditId] = useState(null);
  const [catalogSaveStatus, setCatalogSaveStatus] = useState("idle");
  const [catalogItemSaving, setCatalogItemSaving] = useState(false);
  const [dragState, setDragState] = useState({ draggingId: null, overKey: null });
  const currentCycleRef = useRef(thisWeekStart);

  // ── Refs ──
  const saveTimer = useRef(null);
  const inputRefs = useRef({});
  const pendingSave = useRef({}); // accumulated dirty counts to save
  const snapshotRef = useRef(null); // always-current snapshot for async ops
  const catalogSaveTimers = useRef({});
  const countsRef = useRef({});
  const countedDateRef = useRef(countedDate);
  const profileRef = useRef(profile);

  const viewerProfile = profile || authProfile || {};
  const locationId = profile?.location_id || authProfile?.location_id;
  const isReadOnly = snapshot?.status === "completed";
  const canEditCounts = !isReadOnly && hasLeanPermission(viewerProfile, "Inventory Count On Hand");
  const canMarkOrdered = !isReadOnly && hasLeanPermission(viewerProfile, "Inventory Mark Ordered");
  const canCompleteInventory = hasLeanPermission(viewerProfile, "Inventory Complete Count");
  const canEditCatalog = hasLeanPermission(viewerProfile, "Inventory Edit Catalog");
  const canManageSchedule = hasLeanPermission(viewerProfile, "Inventory Manage Schedule");
  const canReopenInventory = hasLeanPermission(viewerProfile, "Inventory Reopen Count");

  // ── Dog-Days computed values ──
  const reservations = data?.reservations || [];
  const dogDays = useMemo(
    () => getDogDaysForWeek(reservations, currentWeekStart, inventorySchedule.cadenceDays),
    [inventorySchedule.cadenceDays, reservations, currentWeekStart]
  );
  const avgDogsPerDay = useMemo(
    () => getAvgDogsPerDay(reservations, currentWeekStart, inventorySchedule.cadenceDays),
    [inventorySchedule.cadenceDays, reservations, currentWeekStart]
  );

  // Sync snapshotRef
  useEffect(() => { snapshotRef.current = snapshot; }, [snapshot]);
  useEffect(() => { countsRef.current = counts; }, [counts]);
  useEffect(() => { countedDateRef.current = countedDate; }, [countedDate]);
  useEffect(() => { profileRef.current = profile; }, [profile]);

  useEffect(() => {
    let cancelled = false;
    if (!locationId) return () => { cancelled = true; };

    supabase
      .from("lite_settings")
      .select("setting_value")
      .eq("location_id", locationId)
      .eq("setting_key", "inventory_schedule")
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const nextSchedule = normalizeInventorySchedule(data?.setting_value || DEFAULT_INVENTORY_SCHEDULE, todayStr());
        setInventorySchedule(nextSchedule);
        setScheduleDraft(nextSchedule);
      });

    return () => {
      cancelled = true;
    };
  }, [locationId]);

  useEffect(() => {
    const previousCurrentCycle = currentCycleRef.current;
    if (currentWeekStart === previousCurrentCycle) {
      setCurrentWeekStart(thisWeekStart);
    }
    currentCycleRef.current = thisWeekStart;
  }, [currentWeekStart, thisWeekStart]);

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
        .inventory-workspace {
          display: grid;
          grid-template-columns: 220px minmax(0, 1fr);
          gap: 16px;
          align-items: start;
        }
        .inventory-sidebar {
          position: sticky;
          top: 12px;
          z-index: 12;
        }
        .inventory-sticky-columns {
          position: sticky;
          top: 0;
          z-index: 20;
        }
        @media (max-width: 1080px) {
          .inventory-workspace {
            display: block;
          }
          .inventory-sidebar {
            position: relative;
            top: auto;
            margin-bottom: 12px;
          }
        }
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
        // Only create a snapshot if it's the current cycle (don't auto-create for historical cycles)
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
    if (["stock_count", "in_transit", "notes"].includes(field) && !canEditCounts) {
      addGlobalToast?.("You do not have permission to mark inventory on hand.", "error");
      return;
    }
    if (["ordered", "skipped"].includes(field) && !canMarkOrdered) {
      addGlobalToast?.("You do not have permission to mark inventory ordering decisions.", "error");
      return;
    }
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
  }, [addGlobalToast, canEditCounts, canMarkOrdered, scheduleAutoSave]);

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
    if (!canEditCatalog) {
      addGlobalToast?.("You do not have permission to edit the inventory catalog.", "error");
      return;
    }
    setCatalogItems(prev => prev.map(i => i.id === itemId ? { ...i, [field]: value } : i));
    saveCatalogField(itemId, { [field]: value });
  }, [addGlobalToast, canEditCatalog, saveCatalogField]);

  const handleToggleCatalogActive = useCallback(async (itemId, currentActive) => {
    if (!canEditCatalog) {
      addGlobalToast?.("You do not have permission to edit the inventory catalog.", "error");
      return;
    }
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
  }, [addGlobalToast, canEditCatalog]);

  const openAddCatalogItem = useCallback((category = "", subcategory = "") => {
    if (!canEditCatalog) {
      addGlobalToast?.("You do not have permission to edit the inventory catalog.", "error");
      return;
    }
    setCatalogItemModal({
      mode: "add",
      defaults: {
        category: category || "",
        subcategory: subcategory || "",
      },
    });
  }, [addGlobalToast, canEditCatalog]);

  const openEditCatalogItem = useCallback((item) => {
    if (!canEditCatalog) {
      addGlobalToast?.("You do not have permission to edit the inventory catalog.", "error");
      return;
    }
    setCatalogItemModal({ mode: "edit", item });
  }, [addGlobalToast, canEditCatalog]);

  const persistCatalogSortOrder = useCallback(async (orderedItems) => {
    const updates = catalogSortPayload(orderedItems);
    setCatalogSaveStatus("saving");
    try {
      for (const update of updates) {
        await supabase
          .from("inventory_catalog")
          .update({
            category: update.category,
            subcategory: update.subcategory,
            sort_order: update.sort_order,
            updated_at: new Date().toISOString(),
          })
          .eq("id", update.id);
      }
      setCatalogSaveStatus("saved");
      setTimeout(() => setCatalogSaveStatus("idle"), 2200);
    } catch (err) {
      console.error("Catalog reorder error:", err);
      setCatalogSaveStatus("error");
      setTimeout(() => setCatalogSaveStatus("idle"), 3000);
    }
  }, []);

  const handleSaveCatalogItem = useCallback(async (formData) => {
    if (!canEditCatalog) {
      addGlobalToast?.("You do not have permission to edit the inventory catalog.", "error");
      return;
    }
    if (!locationId) return;

    const payload = {
      item_name: formData.item_name,
      category: formData.category || "",
      subcategory: formData.subcategory || "",
      vendor: formData.vendor || "",
      vendor_link: formData.vendor_link || "",
      gl_account: formData.gl_account || "",
      size: formData.size || "",
      par_level: formData.par_level,
      unit_price: formData.unit_price,
      min_reorder: null,
      updated_at: new Date().toISOString(),
    };

    setCatalogItemSaving(true);
    setCatalogSaveStatus("saving");
    try {
      if (catalogItemModal?.mode === "edit" && catalogItemModal.item?.id) {
        const { data: updatedItem, error } = await supabase
          .from("inventory_catalog")
          .update(payload)
          .eq("id", catalogItemModal.item.id)
          .select()
          .single();
        if (error) throw error;
        const normalized = assignInventoryCatalogSortOrder(catalogItems.map(item => item.id === updatedItem.id ? updatedItem : item));
        setCatalogItems(normalized);
        await persistCatalogSortOrder(normalized);
      } else {
        const maxSort = catalogItems.reduce((max, item) => Math.max(max, Number(item.sort_order || 0)), 0);
        const { data: newItem, error } = await supabase
          .from("inventory_catalog")
          .insert({
            location_id: locationId,
            ...payload,
            sort_order: maxSort + 10,
            is_active: true,
          })
          .select()
          .single();
        if (error) throw error;
        const normalized = assignInventoryCatalogSortOrder([...catalogItems, newItem]);
        setCatalogItems(normalized);
        await persistCatalogSortOrder(normalized);
      }
      setCatalogItemModal(null);
      setCatalogSaveStatus("saved");
      setTimeout(() => setCatalogSaveStatus("idle"), 2200);
      if (addGlobalToast) addGlobalToast({ type: "success", message: catalogItemModal?.mode === "edit" ? "Product updated." : "Product added." });
    } catch (err) {
      console.error("Catalog item save error:", err);
      setCatalogSaveStatus("error");
      setTimeout(() => setCatalogSaveStatus("idle"), 3000);
      if (addGlobalToast) addGlobalToast({ type: "error", message: err.message || "Failed to save product." });
    } finally {
      setCatalogItemSaving(false);
    }
  }, [addGlobalToast, canEditCatalog, catalogItemModal, catalogItems, locationId, persistCatalogSortOrder]);

  const handleRenameCategory = useCallback(async (oldCategory, nextCategory) => {
    if (!canEditCatalog) {
      addGlobalToast?.("You do not have permission to edit the inventory catalog.", "error");
      return;
    }
    const cleanNext = nextCategory.trim();
    if (!cleanNext || cleanNext === oldCategory) return;

    const affectedIds = catalogItems
      .filter(item => (item.category || "Uncategorized") === oldCategory || (!item.category && oldCategory === "Uncategorized"))
      .map(item => item.id);
    if (affectedIds.length === 0) return;

    const normalized = assignInventoryCatalogSortOrder(catalogItems.map(item => (
      affectedIds.includes(item.id) ? { ...item, category: cleanNext } : item
    )));
    setCatalogItems(normalized);
    setCatalogSaveStatus("saving");
    try {
      const { error } = await supabase
        .from("inventory_catalog")
        .update({ category: cleanNext, updated_at: new Date().toISOString() })
        .in("id", affectedIds);
      if (error) throw error;
      await persistCatalogSortOrder(normalized);
      setCatalogSaveStatus("saved");
      setTimeout(() => setCatalogSaveStatus("idle"), 2200);
      if (addGlobalToast) addGlobalToast({ type: "success", message: "Category renamed." });
    } catch (err) {
      console.error("Rename category error:", err);
      setCatalogSaveStatus("error");
      setTimeout(() => setCatalogSaveStatus("idle"), 3000);
      if (addGlobalToast) addGlobalToast({ type: "error", message: err.message || "Failed to rename category." });
    }
  }, [addGlobalToast, canEditCatalog, catalogItems, persistCatalogSortOrder]);

  const handleRenameSubcategory = useCallback(async (category, oldSubcategory, nextSubcategory) => {
    if (!canEditCatalog) {
      addGlobalToast?.("You do not have permission to edit the inventory catalog.", "error");
      return;
    }
    const cleanNext = nextSubcategory.trim();
    const cleanOld = oldSubcategory.trim();
    if (!cleanNext || cleanNext === cleanOld) return;

    const affectedIds = catalogItems
      .filter(item => (item.category || "Uncategorized") === category && (item.subcategory || "") === cleanOld)
      .map(item => item.id);
    if (affectedIds.length === 0) return;

    const normalized = renameInventorySubcategory(catalogItems, category, cleanOld, cleanNext);
    setCatalogItems(normalized);
    setCatalogSaveStatus("saving");
    try {
      const { error } = await supabase
        .from("inventory_catalog")
        .update({ subcategory: cleanNext, updated_at: new Date().toISOString() })
        .in("id", affectedIds);
      if (error) throw error;
      await persistCatalogSortOrder(normalized);
      setCatalogSaveStatus("saved");
      setTimeout(() => setCatalogSaveStatus("idle"), 2200);
      if (addGlobalToast) addGlobalToast({ type: "success", message: "Subcategory renamed." });
    } catch (err) {
      console.error("Rename subcategory error:", err);
      setCatalogSaveStatus("error");
      setTimeout(() => setCatalogSaveStatus("idle"), 3000);
      if (addGlobalToast) addGlobalToast({ type: "error", message: err.message || "Failed to rename subcategory." });
    }
  }, [addGlobalToast, canEditCatalog, catalogItems, persistCatalogSortOrder]);

  const handleMoveCategory = useCallback((category, direction) => {
    if (!canEditCatalog) {
      addGlobalToast?.("You do not have permission to edit the inventory catalog.", "error");
      return;
    }
    const nextItems = moveInventoryCategory(catalogItems, category, direction);
    setCatalogItems(nextItems);
    void persistCatalogSortOrder(nextItems);
  }, [addGlobalToast, canEditCatalog, catalogItems, persistCatalogSortOrder]);

  // ── Drag and drop reorder ──
  const handleDragStart = useCallback((e, itemId) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", itemId);
    setDragState(prev => ({ ...prev, draggingId: itemId }));
  }, []);

  const handleDragOver = useCallback((e, target = {}) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const overKey = target.dropKey || target.targetItemId || null;
    setDragState(prev => ({ ...prev, overKey }));
  }, []);

  const handleDrop = useCallback(async (e, target = {}) => {
    e.preventDefault();
    if (!canEditCatalog) {
      addGlobalToast?.("You do not have permission to edit the inventory catalog.", "error");
      setDragState({ draggingId: null, overKey: null });
      return;
    }
    const draggingId = dragState.draggingId || e.dataTransfer.getData("text/plain");
    if (!draggingId) { setDragState({ draggingId: null, overKey: null }); return; }
    if (target.targetItemId === draggingId) { setDragState({ draggingId: null, overKey: null }); return; }

    const nextItems = moveInventoryCatalogItem(catalogItems, draggingId, target);
    setCatalogItems(nextItems);
    setDragState({ draggingId: null, overKey: null });
    void persistCatalogSortOrder(nextItems);
  }, [addGlobalToast, canEditCatalog, catalogItems, dragState, persistCatalogSortOrder]);

  const handleDragEnd = useCallback(() => {
    setDragState({ draggingId: null, overKey: null });
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
    if (!canCompleteInventory) {
      addGlobalToast?.("You do not have permission to complete inventory counts.", "error");
      return;
    }

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
        // Get previous cycle's completed snapshot. The denominator for depletion
        // is the dog volume between counts, not the newly opened cycle.
        const cycleLength = Number(inventorySchedule?.cadenceDays) || 7;
        const prevWeekStart = addDays(currentWeekStart, -cycleLength);
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
          const currentDogDays = computeDogDaysForRange(reservations, prevWeekStart, addDateDays(currentWeekStart, -1));
          const currentCounts = countsRef.current;

          // Build depletion records
          const depletionRecords = [];
          catalogItems.forEach(item => {
            const prev = prevCountMap[item.id];
            const curr = currentCounts[item.id];
            if (!prev || !curr || curr.stock_count == null || curr.stock_count === "") return;

            const openingStock = prev.stock_count || 0;
            const closingStock = parseInt(curr.stock_count, 10) || 0;
            const received = parseInt(prev.in_transit, 10) || 0;
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
    if (!canReopenInventory) {
      addGlobalToast?.("You do not have permission to reopen inventory counts.", "error");
      return;
    }

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

  const handleSaveSchedule = useCallback(async () => {
    if (!locationId) return;
    if (!canManageSchedule) {
      addGlobalToast?.("You do not have permission to manage the inventory schedule.", "error");
      return;
    }
    setScheduleSaving(true);
    try {
      const nextSchedule = normalizeInventorySchedule({
        cadenceDays: Number(scheduleDraft.cadenceDays),
        dueWeekday: Number(scheduleDraft.dueWeekday),
        dueTime: scheduleDraft.dueTime,
      }, todayStr());
      nextSchedule.anchorDate = getInventoryCycleStart(todayStr(), nextSchedule);

      const { error } = await supabase
        .from("lite_settings")
        .upsert({
          location_id: locationId,
          setting_key: "inventory_schedule",
          setting_value: nextSchedule,
        }, { onConflict: "location_id,setting_key" });
      if (error) throw error;

      setInventorySchedule(nextSchedule);
      setScheduleDraft(nextSchedule);
      setShowScheduleModal(false);
      if (addGlobalToast) addGlobalToast({ type: "success", message: "Inventory schedule updated." });
    } catch (err) {
      console.error("Inventory schedule save error:", err);
      if (addGlobalToast) addGlobalToast({ type: "error", message: err.message || "Failed to save inventory schedule." });
    } finally {
      setScheduleSaving(false);
    }
  }, [addGlobalToast, canManageSchedule, locationId, scheduleDraft]);

  // ── Add adhoc item ──
  const handleAddAdhoc = async (formData) => {
    const snap = snapshotRef.current;
    if (!snap) return;
    if (!canEditCounts) {
      addGlobalToast?.("You do not have permission to mark inventory on hand.", "error");
      return;
    }
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
    const countFields = ["stock_count", "unit_price"];
    const orderFields = ["ordered", "skipped"];
    if (Object.keys(updates || {}).some((key) => countFields.includes(key)) && !canEditCounts) {
      addGlobalToast?.("You do not have permission to mark inventory on hand.", "error");
      return;
    }
    if (Object.keys(updates || {}).some((key) => orderFields.includes(key)) && !canMarkOrdered) {
      addGlobalToast?.("You do not have permission to mark inventory ordering decisions.", "error");
      return;
    }
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
  }, [addGlobalToast, canEditCounts, canMarkOrdered]);

  // ── Delete adhoc item ──
  const deleteAdhocItem = useCallback(async (itemId) => {
    if (!canEditCounts) {
      addGlobalToast?.("You do not have permission to mark inventory on hand.", "error");
      return;
    }
    try {
      const { error } = await supabase.from("inventory_adhoc_items").delete().eq("id", itemId);
      if (error) throw error;
      setAdhocItems(prev => prev.filter(item => item.id !== itemId));
    } catch (err) {
      console.error("Adhoc delete error:", err);
    }
  }, [addGlobalToast, canEditCounts]);

  // ── Filtered + grouped catalog ──
  const filteredGrouped = useMemo(() => {
    return buildInventoryCatalogGroups(catalogItems, search);
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
  const canReopenSnapshot = snapshot?.status === "completed" && canReopenInventory;
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

  const overdueInfo = getInventoryOverdueInfo(todayStr(), inventorySchedule, currentWeekStart === thisWeekStart && snapshot?.status === "completed");
  const inventoryCadenceLabel = formatInventoryCadenceLabel(inventorySchedule);
  const inventoryDueLabel = currentWeekStart !== thisWeekStart
    ? `Viewing cycle starting ${fmtWeekLabel(currentWeekStart)}`
    : snapshot?.status === "completed"
      ? "Completed this cycle"
      : overdueInfo.isDueToday
        ? "Due today"
        : `${overdueInfo.daysOverdue} day${overdueInfo.daysOverdue !== 1 ? "s" : ""} overdue`;

  // ── Unique categories for adhoc dropdown ──
  const allCategories = useMemo(() =>
    getInventoryCategorySuggestions(catalogItems),
    [catalogItems]
  );
  const allSubcategories = useMemo(() =>
    getInventorySubcategorySuggestions(catalogItems),
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
              Inventory Count
            </h1>
            <div style={{ fontSize: 13, color: C.textSec, marginTop: 4, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span>{inventoryCadenceLabel}</span>
              <span style={{ color: C.borderLight }}>·</span>
              <span>Track on-hand stock, transit items, and reorder needs</span>
            </div>
          </div>

          {/* Status badge + Manage Catalog */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            {canManageSchedule && (
              <Btn
                variant="secondary"
                size="sm"
                icon={<I.Calendar />}
                onClick={() => {
                  setScheduleDraft(inventorySchedule);
                  setShowScheduleModal(true);
                }}
              >
                Schedule
              </Btn>
            )}
            {!isReadOnly && canEditCatalog && (
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
              return overdueInfo.isOverdue && (!snapshot || snapshot.status !== "completed") ? (
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
                  {overdueInfo.daysOverdue} day{overdueInfo.daysOverdue !== 1 ? "s" : ""} overdue
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
              onClick={() => setCurrentWeekStart(prev => addDays(prev, -inventorySchedule.cadenceDays))}
              style={{ width: 34, height: 34, borderRadius: 9, border: `1.5px solid ${C.border}`, background: C.surface, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.textSec, transition: "all 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.background = C.surfaceHover; e.currentTarget.style.borderColor = C.pri; }}
              onMouseLeave={e => { e.currentTarget.style.background = C.surface; e.currentTarget.style.borderColor = C.border; }}
              title="Previous cycle"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 16px", borderRadius: 10, border: `1.5px solid ${C.border}`, background: C.bg }}>
              <I.Calendar />
              <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                Cycle starting {fmtWeekLabel(currentWeekStart)}
              </span>
              {currentWeekStart === thisWeekStart && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: C.priLt, color: C.pri }}>
                  CURRENT
                </span>
              )}
              {currentWeekStart === thisWeekStart && overdueInfo.isOverdue && (!snapshot || snapshot.status !== "completed") && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: "#FEF2F2", color: "#DC2626" }}>
                  OVERDUE
                </span>
              )}
            </div>

            <button
              onClick={() => setCurrentWeekStart(prev => addDays(prev, inventorySchedule.cadenceDays))}
              style={{ width: 34, height: 34, borderRadius: 9, border: `1.5px solid ${C.border}`, background: C.surface, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: C.textSec, transition: "all 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.background = C.surfaceHover; e.currentTarget.style.borderColor = C.pri; }}
              onMouseLeave={e => { e.currentTarget.style.background = C.surface; e.currentTarget.style.borderColor = C.border; }}
              title="Next cycle"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>

            {currentWeekStart !== thisWeekStart && (
              <Btn variant="secondary" size="sm" onClick={() => setCurrentWeekStart(thisWeekStart)}>
                Current Cycle
              </Btn>
            )}
          </div>

          {/* Day picker — cycle start through today (or full cycle for non-current views) */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: C.textMut, marginRight: 4 }}>Counted on:</span>
            {(() => {
              const days = [];
              const start = new Date(currentWeekStart + "T12:00:00");
              const endDate = currentWeekStart === thisWeekStart ? new Date(todayStr() + "T12:00:00") : new Date(start);
              if (currentWeekStart !== thisWeekStart) endDate.setDate(endDate.getDate() + Math.max(0, inventorySchedule.cadenceDays - 1));
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
          placeholder="Search products by name, category, vendor, size, or GL code..."
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

      <Card style={{ marginBottom: 16, padding: "14px 16px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
          {[
            { label: "Status", value: statusBadge.label, color: statusBadge.color },
            { label: "Phase", value: inventoryWorkflow.phaseLabel || "Not started", color: C.text },
            { label: "Cadence", value: inventoryCadenceLabel, color: C.text },
            { label: "Due", value: inventoryDueLabel, color: inventoryDueLabel.includes("overdue") ? C.dan : C.text },
          ].map((item) => (
            <div key={item.label} style={{ padding: "8px 10px", borderRadius: 12, background: C.bg, border: `1px solid ${C.borderLight}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
                {item.label}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: item.color, lineHeight: 1.4 }}>
                {item.value}
              </div>
            </div>
          ))}
        </div>
      </Card>

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
            Use Edit Catalog to add products to this resort.
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
                All catalog and ad-hoc items have been counted, and every reorder has been handled. Use the submit button below to lock the cycle.
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
                Editing catalog — rename categories, move sections, drag products, or open a product to edit details. Changes auto-save.
              </span>
              <button
                onClick={() => openAddCatalogItem("", "")}
                style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 8, border: `1px solid ${C.info}25`, background: C.surface, color: C.info, fontSize: 12, fontWeight: 700, fontFamily: "inherit", cursor: "pointer" }}
              >
                <I.Plus /> Add Product
              </button>
              {catalogSaveStatus === "saving" && <span style={{ fontSize: 11, color: C.info, fontWeight: 600 }}>Saving...</span>}
              {catalogSaveStatus === "saved" && <span style={{ fontSize: 11, color: C.suc, fontWeight: 600 }}>Saved</span>}
              {catalogSaveStatus === "error" && <span style={{ fontSize: 11, color: C.dan, fontWeight: 600 }}>Save failed</span>}
            </div>
          )}

          {/* No snapshot for historical week */}
          {!snapshot && currentWeekStart !== thisWeekStart && !loading && (
            <Card style={{ padding: 32, textAlign: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>🗓</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 6, fontFamily: "'Outfit', sans-serif" }}>
                No count for this cycle
              </div>
              <div style={{ fontSize: 13, color: C.textSec }}>
                No inventory count was recorded for the cycle starting {fmtWeekLabel(currentWeekStart)}.
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
            <div className="inventory-workspace">
              <InventorySectionNav
                groups={filteredGrouped}
                counts={counts}
                catalogEditMode={catalogEditMode}
                onAddProduct={openAddCatalogItem}
              />
              <div style={{ minWidth: 0 }}>
                <InventoryColumnHeader catalogEditMode={catalogEditMode} />
                {filteredGrouped.map(({ category, subcategories }, index) => (
                  <CategorySection
                    key={category}
                    category={category}
                    subcategories={subcategories}
                    counts={counts}
                    isReadOnly={isReadOnly}
                    canEditCounts={canEditCounts}
                    canMarkOrdered={canMarkOrdered}
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
                    onAddCatalogItem={openAddCatalogItem}
                    onOpenCatalogItem={openEditCatalogItem}
                    onRenameCategory={handleRenameCategory}
                    onRenameSubcategory={handleRenameSubcategory}
                    onMoveCategory={handleMoveCategory}
                    categoryIndex={index}
                    categoryCount={filteredGrouped.length}
                  />
                ))}
              </div>
            </div>
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
                {!isReadOnly && canEditCounts && (
                  <Btn variant="accent" size="sm" icon={<I.Plus />} onClick={() => setShowAddAdhoc(true)}>
                    Add Item
                  </Btn>
                )}
              </div>

              {adhocItems.length === 0 ? (
                <Card style={{ padding: 20, textAlign: "center", border: `1.5px dashed ${C.border}`, background: C.bg }}>
                  <div style={{ fontSize: 13, color: C.textMut }}>No ad-hoc items for this cycle.</div>
                  {!isReadOnly && canEditCounts && (
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
                    <AdhocItemRow
                      key={item.id}
                      item={item}
                      isReadOnly={isReadOnly}
                      canEditCounts={canEditCounts}
                      canMarkOrdered={canMarkOrdered}
                      onUpdate={updateAdhocItem}
                      onDelete={deleteAdhocItem}
                    />
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
              {!canCompleteInventory && (
                <div style={{ fontSize: 12, color: C.warn, fontWeight: 500 }}>
                  You do not have permission to complete inventory counts.
                </div>
              )}
              {canCompleteInventory && !canComplete && (
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
                disabled={!canComplete || !canCompleteInventory}
              >
                Complete Inventory Count
              </Btn>
            </div>
          )}
        </div>
      )}

      {/* ── Modals ── */}
      {catalogItemModal && (
        <CatalogItemModal
          mode={catalogItemModal.mode}
          item={catalogItemModal.item}
          defaults={catalogItemModal.defaults}
          catalogItems={catalogItems}
          categories={allCategories}
          subcategories={allSubcategories}
          onClose={() => setCatalogItemModal(null)}
          onSave={handleSaveCatalogItem}
          saving={catalogItemSaving}
        />
      )}

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

      {showScheduleModal && (
        <InventoryScheduleModal
          draft={scheduleDraft}
          onChange={setScheduleDraft}
          onClose={() => setShowScheduleModal(false)}
          onConfirm={handleSaveSchedule}
          saving={scheduleSaving}
        />
      )}

      {showDepletionModal && (
        <DepletionRateModal
          locationId={locationId}
          reservations={reservations}
          currentWeekStart={currentWeekStart}
          inventorySchedule={inventorySchedule}
          onClose={() => setShowDepletionModal(false)}
        />
      )}
    </div>
  );
}
