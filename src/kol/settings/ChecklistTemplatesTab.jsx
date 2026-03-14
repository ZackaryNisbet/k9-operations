// K9 Operations — ChecklistTemplatesTab
// Isolated page component. See AGENTS.md for development contract.

import React, { useState, useEffect, useMemo, useCallback, useRef, memo } from "react";
import ReactDOM from "react-dom";
import { supabase } from "../../supabaseClient";
import { C, OPERATIONS_CATALOG, OPS_TYPES, LITE_DEF_PRICING, CHART_PTS, DEF_CLIENT_FIELDS, DEF_DOG_FIELDS, DEFAULT_LIFECYCLE_BANNERS, LC_OP_LABELS, LC_FILTER_FIELDS, LITE_ACTION_LABELS, LITE_ACTION_LEVELS, DEF_LITE_EOD_TEMPLATE, DAY_NAMES_SHORT, ROOM_TYPES, K9_LOCATIONS, POS_BASE, PAGE_SLUGS, buildUrl, parseUrl, gid, titleCase, fmtPhone, fmtDate, fmtDateFull, fmtDateShort, fmtTime, fmtInstr, todayStr, addDays, formatTime12hr, countNights, countHours, DEF_OPENING_TEMPLATE, DEF_FE_TEMPLATE, DEF_BE_TEMPLATE, DEF_CLOSING_TEMPLATE, LEAN_PERMISSION_AREAS, LEAN_PERMISSION_MATRIX, LEAN_ROLES, NAV_ITEMS, K9_LOGO_SRC, K9_LOGO_PNG, SLUG_TO_PAGE, ENT_SLUG_TO_PAGE, formatDogNames, fmtPhoneInput, IDB_VERSION, idbGet, idbSet } from "../../shared/theme";
import { I, Icons } from "../../shared/icons";
import { Tip, Badge, Btn, CustomSelect, MiniDatePicker, ComplianceCheckItem, Inp, CalendarPicker, Modal, Card, K9Logo, K9LogoMini, isFieldRequired, validateClientFields } from "../../shared/ui";  // formatDogNames, fmtPhoneInput are in theme.js
import { hasPermission, hasLeanPermission, _resolveRole, LEGACY_ROLE_MAP, ROLE_CODE_MAP } from "../../shared/permissions";
import { classifyReservationType, classifyReservationStatus, extractRoomFromType, getRoomCleaningStats, resSvcIncludes, getPPStats, getOpsCardStatus, getOpsProgress, getOpsCountLabel } from "../../shared/opsHelpers";
import K9LoadingAnimation from "../../shared/K9LoadingAnimation";
import InteractiveLineChart from "../../shared/InteractiveLineChart";
import LocationSelector from "../../shared/LocationSelector";
import { applyStructuredFilters } from "../../hooks/useFilters";

function ChecklistTemplatesTab() {
  const { profile } = useAuth();
  const TEMPLATE_DEFS = [
    { id: "opening", label: "Opening Checklist", def: DEF_OPENING_TEMPLATE },
    { id: "fe", label: "Front-End Checklist", def: DEF_FE_TEMPLATE },
    { id: "be", label: "Back-End Checklist", def: DEF_BE_TEMPLATE },
    { id: "closing", label: "Closing Checklist", def: DEF_CLOSING_TEMPLATE },
  ];

  const [templates, setTemplates] = useState(() => {
    const m = {};
    TEMPLATE_DEFS.forEach(t => { m[t.id] = t.def.map(item => ({ ...item })); });
    return m;
  });
  const [editing, setEditing] = useState(null); // which template id is being edited
  const [editItems, setEditItems] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [addLabel, setAddLabel] = useState("");
  const [addTime, setAddTime] = useState("");

  // Load persisted templates from Supabase on mount
  useEffect(() => {
    const locationId = profile?.location_id || "cherry-hill";
    supabase.from("lite_checklist_templates").select("*").eq("location_id", locationId).then(({ data: rows }) => {
      if (rows && rows.length > 0) {
        const m = {};
        TEMPLATE_DEFS.forEach(t => { m[t.id] = t.def.map(item => ({ ...item })); });
        rows.forEach(r => {
          if (m[r.template_type] && Array.isArray(r.items)) {
            m[r.template_type] = r.items;
          }
        });
        setTemplates(m);
      }
    });
  }, []);

  const startEdit = (id) => {
    setEditing(id);
    setEditItems(templates[id].map(item => ({ ...item })));
    setDirty(false);
    setSaved(false);
    setAddLabel("");
    setAddTime("");
  };

  const cancelEdit = () => { setEditing(null); setEditItems([]); setDirty(false); };

  const moveItem = (idx, dir) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= editItems.length) return;
    const items = [...editItems];
    [items[idx], items[newIdx]] = [items[newIdx], items[idx]];
    setEditItems(items);
    setDirty(true);
  };

  const removeItem = (idx) => {
    setEditItems(editItems.filter((_, i) => i !== idx));
    setDirty(true);
  };

  const updateItem = (idx, field, value) => {
    const items = [...editItems];
    items[idx] = { ...items[idx], [field]: value };
    setEditItems(items);
    setDirty(true);
  };

  const addItem = () => {
    if (!addLabel.trim()) return;
    const newId = `${editing}_custom_${Date.now()}`;
    setEditItems([...editItems, { id: newId, label: addLabel.trim(), ...(addTime ? { time: addTime } : {}) }]);
    setAddLabel("");
    setAddTime("");
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const locationId = profile?.location_id || "cherry-hill";
    const { error } = await supabase.from("lite_checklist_templates").upsert({
      location_id: locationId,
      template_type: editing,
      items: editItems,
      updated_by: profile?.id || null,
    }, { onConflict: "location_id,template_type" });
    if (!error) {
      setTemplates(prev => ({ ...prev, [editing]: editItems.map(item => ({ ...item })) }));
      setDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  };

  const resetToDefault = () => {
    const def = TEMPLATE_DEFS.find(t => t.id === editing);
    if (def) {
      setEditItems(def.def.map(item => ({ ...item })));
      setDirty(true);
    }
  };

  // ── Editing view ──
  if (editing) {
    const tpl = TEMPLATE_DEFS.find(t => t.id === editing);
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <button onClick={cancelEdit} style={{ padding: "6px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.surface, color: C.text, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            ← Back
          </button>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.text }}>{tpl.label}</h3>
        </div>

        {/* Task list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
          {editItems.map((item, idx) => (
            <div key={item.id || idx} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, background: C.surface, border: `1.5px solid ${C.border}` }}>
              <span style={{ fontSize: 12, color: C.textMut, fontWeight: 700, minWidth: 24 }}>{idx + 1}</span>
              <input
                value={item.label}
                onChange={e => updateItem(idx, "label", e.target.value)}
                style={{ flex: 1, padding: "6px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13, fontFamily: "inherit" }}
              />
              <input
                value={item.time || ""}
                onChange={e => updateItem(idx, "time", e.target.value)}
                placeholder="HH:MM"
                style={{ width: 70, padding: "6px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13, fontFamily: "inherit", textAlign: "center" }}
              />
              <button onClick={() => moveItem(idx, -1)} disabled={idx === 0} style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: idx === 0 ? C.textMut : C.text, fontSize: 12, cursor: idx === 0 ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: idx === 0 ? 0.4 : 1 }}>↑</button>
              <button onClick={() => moveItem(idx, 1)} disabled={idx === editItems.length - 1} style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: idx === editItems.length - 1 ? C.textMut : C.text, fontSize: 12, cursor: idx === editItems.length - 1 ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: idx === editItems.length - 1 ? 0.4 : 1 }}>↓</button>
              <button onClick={() => removeItem(idx)} style={{ padding: "4px 8px", borderRadius: 6, border: "1px solid #FCA5A5", background: "#FEF2F2", color: "#DC2626", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>✕</button>
            </div>
          ))}
        </div>

        {/* Add new task */}
        <Card style={{ padding: "12px 16px", marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.textSec, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Add New Task</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              value={addLabel}
              onChange={e => setAddLabel(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addItem()}
              placeholder="Task description"
              style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13, fontFamily: "inherit" }}
            />
            <input
              value={addTime}
              onChange={e => setAddTime(e.target.value)}
              placeholder="HH:MM"
              style={{ width: 70, padding: "8px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 13, fontFamily: "inherit", textAlign: "center" }}
            />
            <button onClick={addItem} disabled={!addLabel.trim()} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: !addLabel.trim() ? C.surfaceHover : C.pri, color: !addLabel.trim() ? C.textMut : "#fff", fontSize: 12, fontWeight: 700, cursor: !addLabel.trim() ? "not-allowed" : "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>+ Add</button>
          </div>
        </Card>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={handleSave} disabled={!dirty || saving} style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: !dirty ? C.surfaceHover : C.pri, color: !dirty ? C.textMut : "#fff", fontSize: 13, fontWeight: 700, cursor: !dirty ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
            {saving ? "Saving…" : saved ? "✓ Saved" : "Save Changes"}
          </button>
          <button onClick={resetToDefault} style={{ padding: "10px 20px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.surface, color: C.text, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            Reset to Default
          </button>
          {dirty && <span style={{ fontSize: 12, color: C.acc, fontWeight: 600 }}>Unsaved changes</span>}
        </div>
      </div>
    );
  }

  // ── List view ──
  return (
    <div>
      <h3 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 700, color: C.text }}>Checklist Templates</h3>
      <p style={{ margin: "0 0 16px", fontSize: 14, color: C.textSec }}>View and customize your operation checklists. Click Edit to modify tasks, reorder items, or add new ones.</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {TEMPLATE_DEFS.map(cl => {
          const items = templates[cl.id] || cl.def;
          const isCustomized = JSON.stringify(items) !== JSON.stringify(cl.def);
          return (
            <Card key={cl.id} style={{ padding: "16px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{cl.label}</span>
                    {isCustomized && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "#DBEAFE", color: "#1D4ED8" }}>CUSTOMIZED</span>}
                  </div>
                  <div style={{ fontSize: 12, color: C.textSec, marginTop: 2 }}>{items.length} tasks</div>
                </div>
                <button onClick={() => startEdit(cl.id)} style={{ padding: "8px 16px", borderRadius: 8, border: `1.5px solid ${C.pri}`, background: "transparent", color: C.pri, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Edit</button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ─── Retention Thresholds Tab (mirrors POS Resort Policies) ─────────────────

export default ChecklistTemplatesTab;
