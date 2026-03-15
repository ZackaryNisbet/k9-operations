// K9 Operations — Weekly Inventory Count Page
// Comprehensive inventory management module for K9 Operations Lite (KOL)

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "../../supabaseClient";
import { C, todayStr, addDays, gid, fmtDate } from "../../shared/theme";
import { Btn, Modal, Card, Inp } from "../../shared/ui";
import { I } from "../../shared/icons";

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
  const n = parseInt(val, 10);
  if (isNaN(n) || n < 0) return 0;
  return n;
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

const ItemRow = React.memo(function ItemRow({ item, count, isReadOnly, onChange, onKeyDown, inputRef }) {
  const [hovered, setHovered] = useState(false);

  const stockCount = count?.stock_count ?? "";
  const inTransit = count?.in_transit ?? "";
  const toOrder = (item.par_level != null && stockCount !== "")
    ? Math.max(0, (item.par_level || 0) - (parseInt(stockCount, 10) || 0) - (parseInt(inTransit, 10) || 0))
    : "";
  const stockValue = (stockCount !== "" && item.unit_price != null)
    ? (parseInt(stockCount, 10) || 0) * parseFloat(item.unit_price || 0)
    : null;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "grid",
        gridTemplateColumns: "2fr 80px 70px 70px 90px 80px 80px 80px",
        gap: 8,
        alignItems: "center",
        padding: "8px 16px",
        borderBottom: `1px solid ${C.borderLight}`,
        background: hovered ? C.surfaceHover : C.surface,
        transition: "background 0.15s",
      }}
    >
      {/* Item Name + Vendor Link */}
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

      {/* Stock Count — highlighted yellow */}
      <div>
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
            border: `2px solid ${isReadOnly ? C.border : "#E6C200"}`,
            background: isReadOnly ? C.bg : "#FFFDE0",
            fontSize: 13,
            fontWeight: 600,
            color: C.text,
            textAlign: "center",
            outline: "none",
            cursor: isReadOnly ? "default" : "text",
            boxSizing: "border-box",
          }}
          onFocus={e => { if (!isReadOnly) e.target.style.borderColor = "#C4A400"; }}
          onBlur={e => { if (!isReadOnly) e.target.style.borderColor = "#E6C200"; }}
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

      {/* Unit Cost */}
      <div style={{ fontSize: 12, color: C.textSec, textAlign: "right" }}>
        {item.unit_price != null ? fmtCurrency(item.unit_price) : <span style={{ color: C.textMut }}>—</span>}
      </div>

      {/* Stock Value */}
      <div style={{ fontSize: 12, fontWeight: 600, color: stockValue != null && stockValue > 0 ? C.suc : C.textSec, textAlign: "right" }}>
        {stockValue != null ? fmtCurrency(stockValue) : <span style={{ color: C.textMut }}>—</span>}
      </div>
    </div>
  );
});

// ─── Adhoc Item Row ───────────────────────────────────────────────────────────

function AdhocItemRow({ item, isReadOnly }) {
  const stockValue = (item.stock_count != null && item.unit_price != null)
    ? (parseInt(item.stock_count, 10) || 0) * parseFloat(item.unit_price || 0)
    : null;
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "2fr 80px 80px 80px 80px",
      gap: 8,
      alignItems: "center",
      padding: "10px 16px",
      borderBottom: `1px solid ${C.borderLight}`,
      background: C.accLt + "44",
    }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{item.item_name}</div>
        {item.category && <div style={{ fontSize: 11, color: C.textMut }}>{item.category}</div>}
        {item.notes && <div style={{ fontSize: 11, color: C.textSec, fontStyle: "italic" }}>{item.notes}</div>}
      </div>
      <div style={{ fontSize: 11, color: C.textMut, textAlign: "center" }}>Ad-hoc</div>
      <div style={{ fontSize: 13, fontWeight: 600, textAlign: "center", color: C.text }}>{item.stock_count ?? "—"}</div>
      <div style={{ fontSize: 12, color: C.textSec, textAlign: "right" }}>
        {item.unit_price != null ? fmtCurrency(item.unit_price) : "—"}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.suc, textAlign: "right" }}>
        {stockValue != null ? fmtCurrency(stockValue) : "—"}
      </div>
    </div>
  );
}

// ─── Category Section ─────────────────────────────────────────────────────────

function CategorySection({ category, subcategories, counts, isReadOnly, onCountChange, onKeyDown, inputRefs, searchQuery }) {
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
          <span style={{ fontSize: 14, fontWeight: 700, color: C.pri, fontFamily: "'GT Eesti', sans-serif" }}>
            {category}
          </span>
          <span style={{ fontSize: 11, color: C.textMut, fontWeight: 500 }}>
            {totalItems} item{totalItems !== 1 ? "s" : ""}
          </span>
        </div>
        {categoryValue > 0 && (
          <span style={{ fontSize: 12, fontWeight: 700, color: C.suc }}>
            {fmtCurrency(categoryValue)}
          </span>
        )}
      </button>

      {/* Column Headers */}
      {!collapsed && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "2fr 80px 70px 70px 90px 80px 80px 80px",
          gap: 8,
          padding: "6px 16px",
          background: C.bg,
          borderBottom: `1px solid ${C.borderLight}`,
        }}>
          {["Item", "GL Code", "Par", "On Hand", "In Transit", "To Order", "Unit Cost", "Value"].map((h, i) => (
            <div key={i} style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.06em", textAlign: i >= 5 ? "right" : i >= 2 ? "center" : "left" }}>
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
          {sub.items.map(item => (
            <ItemRow
              key={item.id}
              item={item}
              count={counts[item.id]}
              isReadOnly={isReadOnly}
              onChange={(field, val) => onCountChange(item.id, field, val)}
              onKeyDown={(e) => onKeyDown(e, item.id)}
              inputRef={el => { if (el) inputRefs.current[item.id] = el; }}
            />
          ))}
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

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function InventoryPage({ data, save, nav, profile, addGlobalToast }) {
  // ── Week navigation ──
  const [currentWeekStart, setCurrentWeekStart] = useState(() => getWeekStart(todayStr()));
  const thisWeekStart = getWeekStart(todayStr());

  // ── Data state ──
  const [catalogItems, setCatalogItems] = useState([]);
  const [snapshot, setSnapshot] = useState(null); // inventory_snapshots row
  const [counts, setCounts] = useState({}); // { [catalog_item_id]: { stock_count, in_transit, notes, id? } }
  const [adhocItems, setAdhocItems] = useState([]);

  // ── UI state ──
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [search, setSearch] = useState("");
  const [dogCount, setDogCount] = useState("");
  const [showAddAdhoc, setShowAddAdhoc] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [saveStatus, setSaveStatus] = useState("idle"); // idle | saving | saved | error
  const [submitSaving, setSubmitSaving] = useState(false);

  // ── Refs ──
  const saveTimer = useRef(null);
  const inputRefs = useRef({});
  const pendingSave = useRef({}); // accumulated dirty counts to save
  const snapshotRef = useRef(null); // always-current snapshot for async ops

  const locationId = profile?.location_id;
  const isReadOnly = snapshot?.status === "completed";

  // Sync snapshotRef
  useEffect(() => { snapshotRef.current = snapshot; }, [snapshot]);

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
      // 1. Load catalog items
      const { data: catalog, error: catErr } = await supabase
        .from("inventory_catalog")
        .select("*")
        .eq("location_id", locationId)
        .eq("is_active", true)
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

      if (snap?.dog_count != null) setDogCount(String(snap.dog_count));
      else setDogCount("");

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
          };
        });
      }
      setCounts(countMap);

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
  }, [locationId, currentWeekStart, thisWeekStart]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Auto-save logic ──
  const flushSave = useCallback(async () => {
    const snap = snapshotRef.current;
    if (!snap || Object.keys(pendingSave.current).length === 0) return;

    const snapshotId = snap.id;
    setSaveStatus("saving");

    try {
      const itemIds = Object.keys(pendingSave.current);
      // Build upserts
      const toUpsert = itemIds.map(itemId => {
        const existing = counts[itemId];
        const pending = pendingSave.current[itemId];
        const merged = { ...(existing || {}), ...pending };
        return {
          ...(merged.id ? { id: merged.id } : {}),
          snapshot_id: snapshotId,
          catalog_item_id: itemId,
          stock_count: merged.stock_count != null && merged.stock_count !== "" ? parseInt(merged.stock_count, 10) : null,
          in_transit: merged.in_transit != null && merged.in_transit !== "" ? parseInt(merged.in_transit, 10) : null,
          notes: merged.notes || null,
        };
      });

      const { data: upserted, error } = await supabase
        .from("inventory_counts")
        .upsert(toUpsert, { onConflict: "snapshot_id,catalog_item_id" })
        .select();
      if (error) throw error;

      // Update counts state with returned IDs
      setCounts(prev => {
        const next = { ...prev };
        (upserted || []).forEach(row => {
          next[row.catalog_item_id] = {
            id: row.id,
            stock_count: row.stock_count,
            in_transit: row.in_transit ?? "",
            notes: row.notes ?? "",
          };
        });
        return next;
      });

      // Update snapshot status to in_progress if it was somehow not set
      if (snap.status !== "in_progress" && snap.status !== "completed") {
        await supabase
          .from("inventory_snapshots")
          .update({ status: "in_progress" })
          .eq("id", snapshotId);
      }

      pendingSave.current = {};
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2200);
    } catch (err) {
      console.error("Auto-save error:", err);
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  }, [counts]);

  const scheduleAutoSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      flushSave();
    }, 1500);
  }, [flushSave]);

  // Cleanup timer on unmount
  useEffect(() => () => { if (saveTimer.current) clearTimeout(saveTimer.current); }, []);

  // ── Count change handler ──
  const handleCountChange = useCallback((itemId, field, val) => {
    setCounts(prev => ({
      ...prev,
      [itemId]: { ...(prev[itemId] || {}), [field]: val },
    }));
    pendingSave.current[itemId] = {
      ...(pendingSave.current[itemId] || {}),
      [field]: val,
    };
    scheduleAutoSave();
  }, [scheduleAutoSave]);

  // ── Dog count save ──
  const saveDogCount = useCallback(async (val) => {
    const snap = snapshotRef.current;
    if (!snap) return;
    const n = val === "" ? null : parseInt(val, 10);
    await supabase
      .from("inventory_snapshots")
      .update({ dog_count: n })
      .eq("id", snap.id);
  }, []);

  const dogCountTimer = useRef(null);
  const handleDogCount = (v) => {
    const cleaned = v.replace(/\D/g, "");
    setDogCount(cleaned);
    if (dogCountTimer.current) clearTimeout(dogCountTimer.current);
    dogCountTimer.current = setTimeout(() => saveDogCount(cleaned), 1000);
  };

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
      const { error } = await supabase
        .from("inventory_snapshots")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          completed_by: profile?.name || profile?.email || "Unknown",
        })
        .eq("id", snap.id);
      if (error) throw error;
      setSnapshot(prev => ({ ...prev, status: "completed", completed_at: new Date().toISOString() }));
      setShowSubmitModal(false);
      if (addGlobalToast) addGlobalToast({ type: "success", message: "Inventory count completed and locked!" });
    } catch (err) {
      console.error("Submit error:", err);
      if (addGlobalToast) addGlobalToast({ type: "error", message: "Failed to submit inventory count." });
    } finally {
      setSubmitSaving(false);
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

    // Convert to array
    return Object.entries(grouped).map(([category, subs]) => ({
      category,
      subcategories: Object.entries(subs).map(([name, items]) => ({ name, items })),
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

  // ── Unique categories for adhoc dropdown ──
  const allCategories = useMemo(() =>
    Array.from(new Set(catalogItems.map(i => i.category).filter(Boolean))).sort(),
    [catalogItems]
  );

  // ── Render ──
  return (
    <div style={{ fontFamily: "'GT Eesti', -apple-system, BlinkMacSystemFont, sans-serif", background: C.bg, minHeight: "100vh", padding: "24px 20px" }}>
      <style>{`
        input[type=number]::-webkit-inner-spin-button,
        input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        input[type=number] { -moz-appearance: textfield; }
      `}</style>

      {/* ── Page Header ── */}
      <div className="inv-fade-in" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, color: C.text, fontFamily: "'Canela', Georgia, serif", lineHeight: 1.2 }}>
              Weekly Inventory Count
            </h1>
            <div style={{ fontSize: 13, color: C.textSec, marginTop: 4 }}>
              Track on-hand stock, transit items, and reorder needs
            </div>
          </div>

          {/* Status badge */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            {snapshot && (
              <span style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 14px",
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 700,
                background: snapshot.status === "completed" ? C.sucLt : snapshot.status === "in_progress" ? C.warnLt : C.bg,
                color: snapshot.status === "completed" ? C.suc : snapshot.status === "in_progress" ? C.warn : C.textMut,
                border: `1.5px solid ${snapshot.status === "completed" ? C.suc + "40" : snapshot.status === "in_progress" ? C.warn + "40" : C.border}`,
              }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: snapshot.status === "completed" ? C.suc : snapshot.status === "in_progress" ? C.warn : C.textMut, display: "inline-block" }} />
                {snapshot.status === "completed" ? "Completed" : snapshot.status === "in_progress" ? "In Progress" : "Draft"}
              </span>
            )}

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

          {/* Dog Count */}
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.textSec, whiteSpace: "nowrap" }}>Dog Count:</div>
            <input
              type="number"
              min="0"
              value={dogCount}
              onChange={e => handleDogCount(e.target.value)}
              disabled={isReadOnly}
              placeholder="—"
              style={{
                width: 70,
                padding: "7px 10px",
                borderRadius: 9,
                border: `1.5px solid ${C.border}`,
                fontSize: 14,
                fontWeight: 700,
                color: C.text,
                background: isReadOnly ? C.bg : C.surface,
                textAlign: "center",
                outline: "none",
                cursor: isReadOnly ? "default" : "text",
              }}
              onFocus={e => { if (!isReadOnly) e.target.style.borderColor = C.pri; }}
              onBlur={e => { if (!isReadOnly) e.target.style.borderColor = C.border; }}
            />
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
          <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 8, fontFamily: "'Canela', Georgia, serif" }}>
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
            <div style={{ marginBottom: 14, padding: "12px 16px", borderRadius: 10, background: C.sucLt, border: `1px solid ${C.suc}30`, display: "flex", alignItems: "center", gap: 10 }}>
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
          )}

          {/* No snapshot for historical week */}
          {!snapshot && currentWeekStart !== thisWeekStart && !loading && (
            <Card style={{ padding: 32, textAlign: "center", marginBottom: 16 }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>🗓</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 6, fontFamily: "'Canela', Georgia, serif" }}>
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
              />
            ))
          )}

          {/* ── Ad-hoc Items Section ── */}
          {snapshot && (
            <div style={{ marginTop: 24 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.text, fontFamily: "'Canela', Georgia, serif" }}>
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
                    gridTemplateColumns: "2fr 80px 80px 80px 80px",
                    gap: 8,
                    padding: "8px 16px",
                    background: C.bg,
                    borderBottom: `1px solid ${C.borderLight}`,
                  }}>
                    {["Item", "Type", "On Hand", "Unit Cost", "Value"].map((h, i) => (
                      <div key={i} style={{ fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.06em", textAlign: i >= 2 ? "right" : "left" }}>
                        {h}
                      </div>
                    ))}
                  </div>
                  {adhocItems.map(item => (
                    <AdhocItemRow key={item.id} item={item} isReadOnly={isReadOnly} />
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
                        {catalogItems.length + adhocItems.length}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: C.textSec, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>
                        Items Counted
                      </div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: C.pri }}>
                        {catalogItems.filter(i => counts[i.id]?.stock_count != null && counts[i.id]?.stock_count !== "").length + adhocItems.filter(i => i.stock_count != null).length}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: C.textSec, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>
                        Items to Reorder
                      </div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: C.warn }}>
                        {catalogItems.filter(item => {
                          const count = counts[item.id];
                          const sc = count?.stock_count;
                          if (sc == null || sc === "") return false;
                          const toOrder = Math.max(0, (item.par_level || 0) - (parseInt(sc, 10) || 0) - (parseInt(count?.in_transit, 10) || 0));
                          return toOrder > 0;
                        }).length}
                      </div>
                    </div>
                    {dogCount && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: C.textSec, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>
                          Dog Count
                        </div>
                        <div style={{ fontSize: 22, fontWeight: 800, color: C.pri }}>{dogCount}</div>
                      </div>
                    )}
                  </div>

                  {/* Total value */}
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: C.textSec, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>
                      Total Inventory Value
                    </div>
                    <div style={{ fontSize: 32, fontWeight: 800, color: C.suc, fontFamily: "'Canela', Georgia, serif" }}>
                      {fmtCurrency(totalValue)}
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* ── Submit Button ── */}
          {snapshot && !isReadOnly && (
            <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
              <Btn
                variant="success"
                size="lg"
                icon={<I.CheckCircle />}
                onClick={() => setShowSubmitModal(true)}
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
    </div>
  );
}
