// K9 Operations — RoleLayoutPage
// Matrix-style admin surface for configuring role layouts.
// 4 rows (Opening/Midday/Closing/As Needed) x 3 columns (PCT/CSR/MOD).
// Supports tasks and workflow references inside each cell with drag-and-drop.
// Isolated page component. See AGENTS.md for development contract.

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "../../supabaseClient";
import { C, WORKFLOW_SECTION_MAP, DEF_OPENING_TEMPLATE, DEF_FE_TEMPLATE, DEF_BE_TEMPLATE, DEF_CLOSING_TEMPLATE } from "../../shared/theme";
import { Btn, Modal, Inp, Badge } from "../../shared/ui";
import { useAuth } from "../../AuthProvider";

// ─── Constants ────────────────────────────────────────────────────────────────
const SECTIONS = [
  { id: "opening", label: "Opening", color: "#F59E0B", bg: "#FFFBEB" },
  { id: "midday", label: "Midday", color: "#3B82F6", bg: "#EFF6FF" },
  { id: "closing", label: "Closing", color: "#8B5CF6", bg: "#F5F3FF" },
  { id: "as_needed", label: "As Needed", color: "#6B7280", bg: "#F9FAFB" },
];

const ROLES = [
  { id: "pct", label: "PCT" },
  { id: "csr", label: "CSR" },
  { id: "supervisor", label: "MOD" },
];

const WORKFLOW_DEFS = [
  { id: "bathing", label: "Bathing" },
  { id: "room_cleaning", label: "Room Cleaning" },
  { id: "pp", label: "Private Play" },
  { id: "pamper", label: "Pamper Package" },
  { id: "lodging_transfer", label: "Lodging Transfers" },
  { id: "collars", label: "Next Day Collars" },
  { id: "belongings", label: "Belongings" },
  { id: "weekly_maintenance", label: "Weekly Maintenance" },
  { id: "enrichment", label: "Enrichment" },
  { id: "ice_cream", label: "Gourmet Ice Cream" },
  { id: "roll_call", label: "Roll Call" },
  { id: "emergency_contacts", label: "Emergency Contacts" },
  { id: "attendance", label: "Attendance" },
  { id: "meds", label: "Medications" },
  { id: "evaluations", label: "Evaluations" },
];

const LEGACY_SOURCES = {
  legacy_opening: "Opening",
  legacy_closing: "Closing",
  legacy_fe: "Front-End",
  legacy_be: "Back-End",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function cellKey(role, section) { return `${role}::${section}`; }

function buildDefaultTasks(role) {
  const tasks = [];
  let idx = 0;
  DEF_OPENING_TEMPLATE.forEach(item => {
    tasks.push({ task_id: `legacy_opening_${item.id}`, task_label: item.label, task_time: item.time || null, section: "opening", sort_order: idx++, source: "legacy_opening", day_of_week: item.dayOfWeek ?? null, item_type: "task" });
  });
  DEF_FE_TEMPLATE.forEach(item => {
    const hour = item.time ? parseInt(item.time.split(":")[0], 10) : 8;
    const section = hour < 11 ? "opening" : hour < 15 ? "midday" : "closing";
    tasks.push({ task_id: `legacy_fe_${item.id}`, task_label: item.label, task_time: item.time || null, section, sort_order: idx++, source: "legacy_fe", day_of_week: item.dayOfWeek ?? null, item_type: "task" });
  });
  DEF_BE_TEMPLATE.forEach(item => {
    const hour = item.time ? parseInt(item.time.split(":")[0], 10) : 8;
    const section = hour < 10 ? "opening" : hour < 15 ? "midday" : "closing";
    tasks.push({ task_id: `legacy_be_${item.id}`, task_label: item.label, task_time: item.time || null, section, sort_order: idx++, source: "legacy_be", day_of_week: item.dayOfWeek ?? null, item_type: "task" });
  });
  DEF_CLOSING_TEMPLATE.forEach(item => {
    tasks.push({ task_id: `legacy_closing_${item.id}`, task_label: item.label, task_time: item.time || null, section: "closing", sort_order: idx++, source: "legacy_closing", day_of_week: item.dayOfWeek ?? null, item_type: "task" });
  });
  return tasks;
}

// ─── Component ────────────────────────────────────────────────────────────────
function RoleLayoutPage({ profile: parentProfile, addGlobalToast }) {
  const { profile: authProfile } = useAuth();
  const profile = parentProfile || authProfile;
  const locationId = profile?.location_id || "cherry-hill";

  // All items keyed by cell: { "pct::opening": [...], ... }
  const [cellItems, setCellItems] = useState({});
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | error
  const saveTimerRef = useRef(null);
  const lastSavedRef = useRef(null);

  // Modal state
  const [addModal, setAddModal] = useState(null); // { role, section } or null
  const [addType, setAddType] = useState("task"); // task | workflow
  const [addLabel, setAddLabel] = useState("");
  const [addTime, setAddTime] = useState("");
  const [addDesc, setAddDesc] = useState("");
  const [addWorkflowId, setAddWorkflowId] = useState("");
  const [editModal, setEditModal] = useState(null); // { role, section, item } for edit modal
  const [editLabel, setEditLabel] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [seedModal, setSeedModal] = useState(null); // role string or null

  // Drag state
  const [dragItem, setDragItem] = useState(null); // { role, section, index, item }
  const [dragOver, setDragOver] = useState(null); // { role, section, index }

  // ─── Load all role configs ──────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true);
    const items = {};
    ROLES.forEach(r => SECTIONS.forEach(s => { items[cellKey(r.id, s.id)] = []; }));

    const { data: rows } = await supabase
      .from("role_page_config")
      .select("*")
      .eq("location_id", locationId)
      .in("role", ROLES.map(r => r.id))
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    (rows || []).forEach(row => {
      const key = cellKey(row.role, row.section);
      if (items[key]) {
        // Infer item_type from task_id prefix since the DB schema has no
        // item_type column — workflow refs are stored with `wf_` prefix.
        const isWf = row.task_id?.startsWith("wf_");
        items[key].push({
          ...row,
          item_type: isWf ? "workflow" : "task",
          ...(isWf ? { workflow_id: row.task_id.replace("wf_", "") } : {}),
        });
      }
    });

    // Add workflow references from WORKFLOW_SECTION_MAP only for roles that
    // have NO persisted rows at all (i.e. the role is unconfigured).  Once a
    // role has any DB rows the persisted state is authoritative — this prevents
    // deleted workflows from being silently re-injected on every load.
    ROLES.forEach(r => {
      const roleHasRows = SECTIONS.some(s => (items[cellKey(r.id, s.id)] || []).length > 0);
      if (!roleHasRows) {
        const roleMap = WORKFLOW_SECTION_MAP[r.id] || {};
        Object.entries(roleMap).forEach(([wfId, sectionId]) => {
          const key = cellKey(r.id, sectionId);
          if (!items[key]) return;
          const wfDef = WORKFLOW_DEFS.find(w => w.id === wfId);
          if (wfDef) {
            items[key].push({
              task_id: `wf_${wfId}`,
              task_label: wfDef.label,
              item_type: "workflow",
              workflow_id: wfId,
              section: sectionId,
              role: r.id,
              sort_order: 9000 + WORKFLOW_DEFS.indexOf(wfDef),
              source: "workflow",
              _isDefault: true,
            });
          }
        });
      }
      // Sort each cell by sort_order
      SECTIONS.forEach(s => {
        const key = cellKey(r.id, s.id);
        items[key].sort((a, b) => a.sort_order - b.sort_order);
      });
    });

    setCellItems(items);
    lastSavedRef.current = JSON.stringify(items);
    setLoading(false);
  }, [locationId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ─── Autosave with debounce ─────────────────────────────────────────────
  // Uses delete-then-insert to ensure DB exactly mirrors UI state.
  // This fixes: delete not persisting, ordering reverting, stale rows reappearing.
  const persistChanges = useCallback(async (items) => {
    setSaveState("saving");
    try {
      // Collect ALL items — including workflow references so their presence
      // (or absence after deletion) is persisted authoritatively in the DB.
      const rows = [];
      let globalIdx = 0;
      ROLES.forEach(r => {
        SECTIONS.forEach(s => {
          const key = cellKey(r.id, s.id);
          (items[key] || []).forEach((item) => {
            rows.push({
              location_id: locationId,
              role: r.id,
              section: s.id,
              task_id: item.task_id,
              task_label: item.task_label,
              task_time: item.task_time || null,
              task_description: item.task_description || null,
              sort_order: globalIdx++,
              source: item.source || "custom",
              day_of_week: item.day_of_week ?? null,
              is_active: true,
              updated_at: new Date().toISOString(),
            });
          });
        });
      });

      // Delete all existing rows for these roles, then re-insert.
      // This ensures removed items are gone and sort_order is authoritative.
      const roleIds = ROLES.map(r => r.id);
      const { error: delErr } = await supabase.from("role_page_config")
        .delete()
        .eq("location_id", locationId)
        .in("role", roleIds);
      if (delErr) throw delErr;

      if (rows.length > 0) {
        const { error: insErr } = await supabase.from("role_page_config")
          .insert(rows);
        if (insErr) throw insErr;
      }

      lastSavedRef.current = JSON.stringify(items);
      setSaveState("saved");
      setTimeout(() => setSaveState(prev => prev === "saved" ? "idle" : prev), 2000);
    } catch (err) {
      console.error("[RoleLayout] Save error:", err.message, err.details || "", err.code || "");
      setSaveState("error");
      addGlobalToast?.("Failed to save changes. Please try again.", "error");
    }
  }, [locationId, addGlobalToast]);

  const scheduleSave = useCallback((items) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => persistChanges(items), 800);
  }, [persistChanges]);

  const updateCellItems = useCallback((updater) => {
    setCellItems(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      scheduleSave(next);
      return next;
    });
  }, [scheduleSave]);

  // ─── Drag-and-Drop Handlers ─────────────────────────────────────────────
  const handleDragStart = useCallback((e, role, section, index, item) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", ""); // Required for Firefox
    setDragItem({ role, section, index, item });
  }, []);

  const handleDragOver = useCallback((e, role, section, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOver({ role, section, index });
  }, []);

  const handleDragOverCell = useCallback((e, role, section) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const key = cellKey(role, section);
    // Only set dragOver if the cell is empty or we're not already over an item
    setDragOver(prev => {
      if (prev && prev.role === role && prev.section === section) return prev;
      return { role, section, index: -1 };
    });
  }, []);

  const handleDrop = useCallback((e, targetRole, targetSection, targetIndex) => {
    e.preventDefault();
    if (!dragItem) return;

    const { role: srcRole, section: srcSection, index: srcIndex, item } = dragItem;
    const srcKey = cellKey(srcRole, srcSection);
    const tgtKey = cellKey(targetRole, targetSection);

    updateCellItems(prev => {
      const next = { ...prev };
      const srcList = [...(next[srcKey] || [])];
      const tgtList = srcKey === tgtKey ? srcList : [...(next[tgtKey] || [])];

      // Remove from source
      srcList.splice(srcIndex, 1);

      // Insert at target
      const insertIdx = targetIndex < 0 ? tgtList.length : (srcKey === tgtKey && srcIndex < targetIndex ? targetIndex - 1 : targetIndex);
      const movedItem = { ...item, role: targetRole, section: targetSection };
      if (srcKey === tgtKey) {
        srcList.splice(insertIdx, 0, movedItem);
        next[srcKey] = srcList;
      } else {
        tgtList.splice(insertIdx < 0 ? tgtList.length : insertIdx, 0, movedItem);
        next[srcKey] = srcList;
        next[tgtKey] = tgtList;
      }

      // Renumber sort_order
      [srcKey, tgtKey].forEach(k => {
        (next[k] || []).forEach((it, i) => { it.sort_order = i; });
      });

      return next;
    });

    setDragItem(null);
    setDragOver(null);
  }, [dragItem, updateCellItems]);

  const handleDragEnd = useCallback(() => {
    setDragItem(null);
    setDragOver(null);
  }, []);

  // ─── Add Item ───────────────────────────────────────────────────────────
  const addItem = useCallback(() => {
    if (!addModal) return;
    const { role, section } = addModal;
    const key = cellKey(role, section);

    if (addType === "task") {
      if (!addLabel.trim()) return;
      const taskId = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const newItem = {
        task_id: taskId,
        task_label: addLabel.trim(),
        task_time: addTime || null,
        task_description: addDesc.trim() || null,
        item_type: "task",
        section,
        role,
        sort_order: 999,
        source: "custom",
      };
      updateCellItems(prev => {
        const next = { ...prev };
        next[key] = [...(next[key] || []), newItem];
        next[key].forEach((it, i) => { it.sort_order = i; });
        return next;
      });
    } else {
      if (!addWorkflowId) return;
      const wfDef = WORKFLOW_DEFS.find(w => w.id === addWorkflowId);
      if (!wfDef) return;
      const taskId = `wf_${addWorkflowId}`;
      // Check if already exists in this cell
      const existing = (cellItems[key] || []).find(i => i.task_id === taskId);
      if (existing) {
        addGlobalToast?.(`${wfDef.label} is already in this cell.`, "info");
        return;
      }
      const newItem = {
        task_id: taskId,
        task_label: wfDef.label,
        item_type: "workflow",
        workflow_id: addWorkflowId,
        section,
        role,
        sort_order: 999,
        source: "workflow",
      };
      updateCellItems(prev => {
        const next = { ...prev };
        next[key] = [...(next[key] || []), newItem];
        next[key].forEach((it, i) => { it.sort_order = i; });
        return next;
      });
    }

    setAddModal(null);
    setAddLabel("");
    setAddTime("");
    setAddDesc("");
    setAddWorkflowId("");
    setAddType("task");
  }, [addModal, addType, addLabel, addTime, addDesc, addWorkflowId, cellItems, updateCellItems, addGlobalToast]);

  // ─── Delete Item ────────────────────────────────────────────────────────
  // Only updates UI state — the debounced persistChanges (delete-then-insert)
  // will remove it from DB, so there's no race condition.
  const deleteItem = useCallback((role, section, taskId) => {
    const key = cellKey(role, section);
    updateCellItems(prev => {
      const next = { ...prev };
      next[key] = (next[key] || []).filter(i => i.task_id !== taskId);
      next[key].forEach((it, i) => { it.sort_order = i; });
      return next;
    });
  }, [updateCellItems]);

  // ─── Edit Item (modal-based: label + time + description) ─────────────────
  const openEditModal = useCallback((role, section, item) => {
    setEditModal({ role, section, item });
    setEditLabel(item.task_label || "");
    setEditTime(item.task_time || "");
    setEditDesc(item.task_description || "");
  }, []);

  const saveEditModal = useCallback(() => {
    if (!editModal || !editLabel.trim()) return;
    const { role, section, item } = editModal;
    const key = cellKey(role, section);
    updateCellItems(prev => {
      const next = { ...prev };
      next[key] = (next[key] || []).map(i =>
        i.task_id === item.task_id
          ? { ...i, task_label: editLabel.trim(), task_time: editTime || null, task_description: editDesc.trim() || null }
          : i
      );
      return next;
    });
    setEditModal(null);
  }, [editModal, editLabel, editTime, editDesc, updateCellItems]);

  // ─── Seed from Legacy ───────────────────────────────────────────────────
  const seedRole = useCallback(async (role) => {
    setSeedModal(null);
    setSaveState("saving");
    const defaults = buildDefaultTasks(role);
    const rows = defaults.map((t, i) => ({
      location_id: locationId,
      role,
      section: t.section,
      task_id: t.task_id,
      task_label: t.task_label,
      task_time: t.task_time,
      sort_order: i,
      source: t.source,
      day_of_week: t.day_of_week,
      is_active: true,
    }));

    await supabase.from("role_page_config").delete()
      .eq("location_id", locationId).eq("role", role);
    const { error } = await supabase.from("role_page_config").insert(rows);
    if (error) {
      addGlobalToast?.("Import failed: " + error.message, "error");
      setSaveState("error");
    } else {
      addGlobalToast?.(`Imported legacy tasks for ${ROLES.find(r => r.id === role)?.label || role}.`, "success");
    }
    await loadAll();
    setSaveState("idle");
  }, [locationId, loadAll, addGlobalToast]);

  // ─── Manual Save ────────────────────────────────────────────────────────
  const manualSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    persistChanges(cellItems);
  }, [cellItems, persistChanges]);

  // Count items per role
  const roleCounts = useMemo(() => {
    const counts = {};
    ROLES.forEach(r => {
      let total = 0;
      SECTIONS.forEach(s => { total += (cellItems[cellKey(r.id, s.id)] || []).length; });
      counts[r.id] = total;
    });
    return counts;
  }, [cellItems]);

  // ─── Render ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: "center" }}>
        <div style={{ fontSize: 14, color: C.textMut }}>Loading Role Layout...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: "0 8px", maxWidth: 1400, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: "0 0 4px", letterSpacing: "-0.02em" }}>
            Role Layout
          </h2>
          <p style={{ margin: 0, fontSize: 13, color: C.textMut }}>
            Configure what appears on each mobile role page. Drag items to reorder or move between cells.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Save status indicator */}
          {saveState === "saving" && (
            <span style={{ fontSize: 12, fontWeight: 600, color: C.warn, display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.warn, animation: "pulse 1s infinite" }} />
              Saving...
            </span>
          )}
          {saveState === "saved" && (
            <span style={{ fontSize: 12, fontWeight: 600, color: C.suc, display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 14 }}>&#10003;</span> Saved
            </span>
          )}
          {saveState === "error" && (
            <span style={{ fontSize: 12, fontWeight: 600, color: C.dan, display: "flex", alignItems: "center", gap: 4 }}>
              Save failed
              <button onClick={manualSave} style={{
                padding: "3px 10px", borderRadius: 6, border: `1px solid ${C.dan}`,
                background: C.danLt, color: C.dan, fontSize: 11, fontWeight: 700,
                cursor: "pointer", fontFamily: "inherit",
              }}>Retry</button>
            </span>
          )}
          <button onClick={manualSave} style={{
            padding: "7px 16px", borderRadius: 8, border: `1.5px solid ${C.pri}`,
            background: `${C.pri}08`, color: C.pri, fontSize: 12, fontWeight: 700,
            cursor: "pointer", fontFamily: "inherit",
          }}>
            Save Now
          </button>
        </div>
      </div>

      {/* ─── Matrix Grid ──────────────────────────────────────────────────── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "100px 1fr 1fr 1fr",
        gap: 0,
        border: `1.5px solid ${C.border}`,
        borderRadius: 14,
        overflow: "hidden",
        background: C.surface,
      }}>
        {/* Column headers */}
        <div style={{ background: C.surfaceHover, padding: "12px 10px", borderBottom: `1.5px solid ${C.border}`, borderRight: `1px solid ${C.borderLight}` }} />
        {ROLES.map((role, ri) => (
          <div key={role.id} style={{
            background: C.surfaceHover, padding: "12px 14px",
            borderBottom: `1.5px solid ${C.border}`,
            borderRight: ri < ROLES.length - 1 ? `1px solid ${C.borderLight}` : "none",
            textAlign: "center",
          }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.text, letterSpacing: "0.02em" }}>{role.label}</div>
            <div style={{ fontSize: 11, color: C.textMut, fontWeight: 500, marginTop: 2 }}>
              {roleCounts[role.id]} item{roleCounts[role.id] !== 1 ? "s" : ""}
            </div>
          </div>
        ))}

        {/* Matrix rows */}
        {SECTIONS.map((section, si) => (
          <React.Fragment key={section.id}>
            {/* Row label */}
            <div style={{
              padding: "14px 10px",
              borderBottom: si < SECTIONS.length - 1 ? `1px solid ${C.borderLight}` : "none",
              borderRight: `1px solid ${C.borderLight}`,
              background: section.bg,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start",
              gap: 4, paddingTop: 18,
            }}>
              <div style={{
                width: 10, height: 10, borderRadius: "50%", background: section.color,
              }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: section.color, textAlign: "center", lineHeight: 1.2 }}>
                {section.label}
              </span>
            </div>

            {/* Cells */}
            {ROLES.map((role, ri) => {
              const key = cellKey(role.id, section.id);
              const items = cellItems[key] || [];
              const isDragTarget = dragOver && dragOver.role === role.id && dragOver.section === section.id;

              return (
                <div
                  key={key}
                  onDragOver={(e) => handleDragOverCell(e, role.id, section.id)}
                  onDrop={(e) => handleDrop(e, role.id, section.id, items.length)}
                  style={{
                    padding: "8px 8px 6px",
                    borderBottom: si < SECTIONS.length - 1 ? `1px solid ${C.borderLight}` : "none",
                    borderRight: ri < ROLES.length - 1 ? `1px solid ${C.borderLight}` : "none",
                    minHeight: 80,
                    background: isDragTarget && items.length === 0 ? `${section.color}08` : "transparent",
                    transition: "background 0.15s",
                  }}
                >
                  {/* Items */}
                  {items.map((item, idx) => {
                    const isBeingDragged = dragItem && dragItem.role === role.id && dragItem.section === section.id && dragItem.index === idx;
                    const isDropTarget = dragOver && dragOver.role === role.id && dragOver.section === section.id && dragOver.index === idx;
                    const isWorkflow = item.item_type === "workflow";

                    return (
                      <div
                        key={item.task_id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, role.id, section.id, idx, item)}
                        onDragOver={(e) => handleDragOver(e, role.id, section.id, idx)}
                        onDrop={(e) => handleDrop(e, role.id, section.id, idx)}
                        onDragEnd={handleDragEnd}
                        style={{
                          display: "flex", alignItems: "center", gap: 6,
                          padding: "5px 8px", marginBottom: 4, borderRadius: 8,
                          background: isWorkflow ? `${section.color}0A` : C.bg,
                          border: `1px solid ${isDropTarget ? section.color : isWorkflow ? `${section.color}25` : C.borderLight}`,
                          borderTop: isDropTarget ? `2.5px solid ${section.color}` : undefined,
                          cursor: "grab",
                          opacity: isBeingDragged ? 0.4 : 1,
                          transition: "opacity 0.15s, border-color 0.15s",
                          fontSize: 12,
                        }}
                      >
                        {/* Drag handle */}
                        <span style={{ color: C.textMut, fontSize: 10, cursor: "grab", userSelect: "none", flexShrink: 0, lineHeight: 1 }} title="Drag to reorder">
                          ⠿
                        </span>

                        {/* Type badge */}
                        {isWorkflow ? (
                          <span style={{
                            fontSize: 8, fontWeight: 700, padding: "2px 5px", borderRadius: 4,
                            background: `${section.color}18`, color: section.color,
                            textTransform: "uppercase", letterSpacing: "0.04em", flexShrink: 0,
                          }}>WF</span>
                        ) : item.task_time ? (
                          <span style={{
                            fontSize: 9, fontWeight: 700, color: C.textMut,
                            background: C.surfaceHover, padding: "1px 4px", borderRadius: 3, flexShrink: 0,
                          }}>{item.task_time}</span>
                        ) : null}

                        {/* Label — click opens edit modal for tasks */}
                        <span
                          onClick={() => !isWorkflow && openEditModal(role.id, section.id, item)}
                          style={{
                            flex: 1, fontSize: 11, fontWeight: isWorkflow ? 600 : 400,
                            color: isWorkflow ? section.color : C.text,
                            cursor: isWorkflow ? "default" : "pointer",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            minWidth: 0,
                          }}
                          title={isWorkflow ? `Workflow: ${item.task_label}` : "Click to edit"}
                        >
                          {item.task_label}
                        </span>

                        {/* Description indicator */}
                        {item.task_description && (
                          <span style={{
                            fontSize: 8, fontWeight: 700, padding: "1px 4px", borderRadius: 3,
                            background: `${C.pri}12`, color: C.pri, flexShrink: 0,
                          }} title={item.task_description}>DESC</span>
                        )}

                        {/* Source badge for legacy items */}
                        {item.source && LEGACY_SOURCES[item.source] && (
                          <span style={{
                            fontSize: 7, fontWeight: 700, padding: "1px 4px", borderRadius: 3,
                            background: "#DBEAFE", color: "#1D4ED8", flexShrink: 0, whiteSpace: "nowrap",
                          }}>{LEGACY_SOURCES[item.source]}</span>
                        )}

                        {/* Delete */}
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteItem(role.id, section.id, item.task_id); }}
                          style={{
                            padding: "1px 4px", borderRadius: 4, border: "none",
                            background: "transparent", color: C.textMut, fontSize: 11,
                            cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
                            opacity: 0.5, transition: "opacity 0.15s",
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.color = C.dan; }}
                          onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.5"; e.currentTarget.style.color = C.textMut; }}
                          title="Remove"
                        >&#10005;</button>
                      </div>
                    );
                  })}

                  {/* Empty cell drop zone / Add button */}
                  {items.length === 0 && !isDragTarget && (
                    <div style={{
                      padding: "10px 8px", textAlign: "center", fontSize: 11, color: C.textMut,
                      fontStyle: "italic",
                    }}>
                      No items
                    </div>
                  )}
                  {isDragTarget && items.length === 0 && (
                    <div style={{
                      padding: "10px 8px", textAlign: "center", fontSize: 11,
                      color: section.color, fontWeight: 600,
                      border: `1.5px dashed ${section.color}40`, borderRadius: 8,
                    }}>
                      Drop here
                    </div>
                  )}

                  {/* Add button */}
                  <button
                    onClick={() => { setAddModal({ role: role.id, section: section.id }); setAddType("task"); }}
                    style={{
                      width: "100%", padding: "4px 0", border: "none", borderRadius: 6,
                      background: "transparent", color: C.textMut, fontSize: 11, fontWeight: 600,
                      cursor: "pointer", fontFamily: "inherit", marginTop: 2,
                      transition: "all 0.15s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = `${section.color}08`; e.currentTarget.style.color = section.color; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.textMut; }}
                  >
                    + Add
                  </button>
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>

      {/* ─── Quick Actions ─────────────────────────────────────────────────── */}
      <div style={{
        display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap", alignItems: "center",
      }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.textSec }}>Quick import:</span>
        {ROLES.map(r => (
          <button key={r.id} onClick={() => setSeedModal(r.id)}
            style={{
              padding: "5px 12px", borderRadius: 7, border: `1px solid ${C.border}`,
              background: C.surface, color: C.textSec, fontSize: 11, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Seed {r.label} from Legacy
          </button>
        ))}
      </div>

      {/* Legend */}
      <div style={{
        display: "flex", gap: 16, marginTop: 12, padding: "10px 16px",
        borderRadius: 10, background: C.surfaceHover, border: `1px solid ${C.borderLight}`,
        flexWrap: "wrap", alignItems: "center",
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: C.textSec }}>Legend:</span>
        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: C.textSec }}>
          <span style={{ fontSize: 8, fontWeight: 700, padding: "2px 5px", borderRadius: 4, background: `${C.pri}18`, color: C.pri, textTransform: "uppercase" }}>WF</span>
          Workflow
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: C.textSec }}>
          <span style={{ fontSize: 10 }}>⠿</span>
          Drag to reorder or move
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: C.textSec }}>
          <span style={{ fontSize: 7, fontWeight: 700, padding: "1px 4px", borderRadius: 3, background: "#DBEAFE", color: "#1D4ED8" }}>Opening</span>
          Imported from legacy
        </span>
      </div>

      {/* ─── Add Item Modal ────────────────────────────────────────────────── */}
      {addModal && (
        <Modal title={`Add to ${ROLES.find(r => r.id === addModal.role)?.label} — ${SECTIONS.find(s => s.id === addModal.section)?.label}`} onClose={() => setAddModal(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Type tabs */}
            <div style={{ display: "flex", gap: 6 }}>
              {["task", "workflow"].map(t => (
                <button key={t} onClick={() => setAddType(t)}
                  style={{
                    padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, fontFamily: "inherit",
                    cursor: "pointer",
                    border: addType === t ? `2px solid ${C.pri}` : `1.5px solid ${C.border}`,
                    background: addType === t ? `${C.pri}12` : C.surface,
                    color: addType === t ? C.pri : C.textSec,
                  }}
                >
                  {t === "task" ? "Task" : "Workflow"}
                </button>
              ))}
            </div>

            {addType === "task" ? (
              <>
                <Inp label="Task Name" value={addLabel} onChange={setAddLabel} required />
                <Inp label="Time (optional, HH:MM)" value={addTime} onChange={setAddTime} />
                <Inp label="Description (optional)" value={addDesc} onChange={setAddDesc} rows={2} />
              </>
            ) : (
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: C.textSec, marginBottom: 4, display: "block" }}>Workflow</label>
                <select
                  value={addWorkflowId}
                  onChange={(e) => setAddWorkflowId(e.target.value)}
                  style={{
                    width: "100%", padding: "8px 12px", borderRadius: 8,
                    border: `1.5px solid ${C.border}`, background: C.bg,
                    color: C.text, fontSize: 13, fontFamily: "inherit",
                  }}
                >
                  <option value="">Select workflow...</option>
                  {WORKFLOW_DEFS.map(wf => (
                    <option key={wf.id} value={wf.id}>{wf.label}</option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <Btn variant="primary" onClick={addItem} disabled={addType === "task" ? !addLabel.trim() : !addWorkflowId}>
                Add {addType === "task" ? "Task" : "Workflow"}
              </Btn>
              <Btn variant="ghost" onClick={() => setAddModal(null)}>Cancel</Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── Edit Task Modal ──────────────────────────────────────────────── */}
      {editModal && (
        <Modal title="Edit Task" onClose={() => setEditModal(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Inp label="Task Name" value={editLabel} onChange={setEditLabel} required />
            <Inp label="Time (HH:MM)" value={editTime} onChange={setEditTime} />
            <Inp label="Description (optional)" value={editDesc} onChange={setEditDesc} rows={2} />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <Btn variant="primary" onClick={saveEditModal} disabled={!editLabel.trim()}>Save</Btn>
              <Btn variant="ghost" onClick={() => setEditModal(null)}>Cancel</Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── Seed Confirmation Modal ───────────────────────────────────────── */}
      {seedModal && (
        <Modal title="Import Legacy Checklists" onClose={() => setSeedModal(null)}>
          <p style={{ fontSize: 13, color: C.textSec, marginBottom: 16 }}>
            This will import tasks from the Opening, Front-End, Back-End, and Closing checklists
            into the {ROLES.find(r => r.id === seedModal)?.label} columns.
            <span style={{ color: C.dan, fontWeight: 600 }}>
              {" "}Existing tasks for this role will be replaced.
            </span>
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn variant="primary" onClick={() => seedRole(seedModal)}>Import</Btn>
            <Btn variant="ghost" onClick={() => setSeedModal(null)}>Cancel</Btn>
          </div>
        </Modal>
      )}

      {/* Pulse animation for save indicator */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}

export default RoleLayoutPage;
