// K9 Operations — RolePageConfigTab
// Admin configuration for fixed-section role pages (Opening/Midday/Closing/As Needed)
// Isolated settings tab component. See AGENTS.md for development contract.

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../../supabaseClient";
import { C, DEF_OPENING_TEMPLATE, DEF_FE_TEMPLATE, DEF_BE_TEMPLATE, DEF_CLOSING_TEMPLATE, LEAN_ROLES, WORKFLOW_SECTION_MAP } from "../../shared/theme";
import { Card, Btn, Modal, Inp, Badge, CustomSelect } from "../../shared/ui";
import { useAuth } from "../../AuthProvider";

const FIXED_SECTIONS = [
  { id: "opening", label: "Opening", color: "#F59E0B", bg: "#FFFBEB" },
  { id: "midday", label: "Midday", color: "#3B82F6", bg: "#EFF6FF" },
  { id: "closing", label: "Closing", color: "#8B5CF6", bg: "#F5F3FF" },
  { id: "as_needed", label: "As Needed", color: "#6B7280", bg: "#F9FAFB" },
];

const ROLE_OPTIONS = [
  { value: "pct", label: "PCT (Pet Care Technician)" },
  { value: "csr", label: "CSR (Customer Service)" },
  { value: "supervisor", label: "Supervisor" },
  { value: "manager", label: "Manager" },
  { value: "location_admin", label: "Location Admin" },
];

const SOURCE_LABELS = {
  legacy_opening: "Opening Checklist",
  legacy_closing: "Closing Checklist",
  legacy_fe: "Front-End Checklist",
  legacy_be: "Back-End Checklist",
  custom: "Custom",
};

const WORKFLOW_LABELS = {
  bathing: "Bathing",
  room_cleaning: "Room Cleaning",
  pp: "Private Play",
  pamper: "Pamper Package",
  lodging_transfer: "Lodging Transfers",
  collars: "Next Day Collars",
  belongings: "Belongings",
  weekly_maintenance: "Weekly Maintenance",
};

// Default task mappings from legacy checklists into fixed sections
function buildDefaultTasks(role) {
  const tasks = [];
  let sortIdx = 0;

  // Opening checklist → Opening section
  DEF_OPENING_TEMPLATE.forEach(item => {
    tasks.push({
      task_id: `legacy_opening_${item.id}`,
      task_label: item.label,
      task_time: item.time || null,
      section: "opening",
      sort_order: sortIdx++,
      source: "legacy_opening",
      day_of_week: item.dayOfWeek ?? null,
    });
  });

  // Front-end checklist morning tasks → Opening, afternoon → Midday
  DEF_FE_TEMPLATE.forEach(item => {
    const hour = item.time ? parseInt(item.time.split(":")[0], 10) : 8;
    const section = hour < 11 ? "opening" : hour < 15 ? "midday" : "closing";
    tasks.push({
      task_id: `legacy_fe_${item.id}`,
      task_label: item.label,
      task_time: item.time || null,
      section,
      sort_order: sortIdx++,
      source: "legacy_fe",
      day_of_week: item.dayOfWeek ?? null,
    });
  });

  // Back-end checklist → split by time
  DEF_BE_TEMPLATE.forEach(item => {
    const hour = item.time ? parseInt(item.time.split(":")[0], 10) : 8;
    const section = hour < 10 ? "opening" : hour < 15 ? "midday" : "closing";
    tasks.push({
      task_id: `legacy_be_${item.id}`,
      task_label: item.label,
      task_time: item.time || null,
      section,
      sort_order: sortIdx++,
      source: "legacy_be",
      day_of_week: item.dayOfWeek ?? null,
    });
  });

  // Closing checklist → Closing section
  DEF_CLOSING_TEMPLATE.forEach(item => {
    tasks.push({
      task_id: `legacy_closing_${item.id}`,
      task_label: item.label,
      task_time: item.time || null,
      section: "closing",
      sort_order: sortIdx++,
      source: "legacy_closing",
      day_of_week: item.dayOfWeek ?? null,
    });
  });

  return tasks;
}

function RolePageConfigTab() {
  const { profile } = useAuth();
  const locationId = profile?.location_id || "cherry-hill";

  const [selectedRole, setSelectedRole] = useState("pct");
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [addSection, setAddSection] = useState("opening");
  const [addLabel, setAddLabel] = useState("");
  const [addTime, setAddTime] = useState("");
  const [editingTask, setEditingTask] = useState(null);
  const [showSeedConfirm, setShowSeedConfirm] = useState(false);

  // Load tasks from Supabase
  const loadTasks = useCallback(async () => {
    setLoading(true);
    const { data: rows } = await supabase
      .from("role_page_config")
      .select("*")
      .eq("location_id", locationId)
      .eq("role", selectedRole)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    setTasks(rows || []);
    setLoading(false);
    setDirty(false);
  }, [locationId, selectedRole]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  // Group tasks by section
  const tasksBySection = useMemo(() => {
    const grouped = {};
    FIXED_SECTIONS.forEach(s => { grouped[s.id] = []; });
    tasks.forEach(t => {
      if (grouped[t.section]) grouped[t.section].push(t);
    });
    return grouped;
  }, [tasks]);

  // Seed from legacy checklists
  const seedFromLegacy = async () => {
    setSaving(true);
    const defaults = buildDefaultTasks(selectedRole);
    const rows = defaults.map((t, i) => ({
      location_id: locationId,
      role: selectedRole,
      section: t.section,
      task_id: t.task_id,
      task_label: t.task_label,
      task_time: t.task_time,
      sort_order: i,
      source: t.source,
      day_of_week: t.day_of_week,
      is_active: true,
    }));

    // Delete existing for this role, then insert
    await supabase.from("role_page_config").delete()
      .eq("location_id", locationId).eq("role", selectedRole);

    const { error } = await supabase.from("role_page_config").insert(rows);
    if (error) {
      console.log("[RolePageConfig] Seed error:", error.message);
    }
    setShowSeedConfirm(false);
    await loadTasks();
    setSaving(false);
  };

  // Save reordered/edited tasks
  const saveTasks = async () => {
    setSaving(true);
    // Rebuild sort order by section
    const allTasks = [];
    let idx = 0;
    FIXED_SECTIONS.forEach(section => {
      (tasksBySection[section.id] || []).forEach(t => {
        allTasks.push({ ...t, sort_order: idx++ });
      });
    });

    const rows = allTasks.map(t => ({
      id: t.id || undefined,
      location_id: locationId,
      role: selectedRole,
      section: t.section,
      task_id: t.task_id,
      task_label: t.task_label,
      task_time: t.task_time || null,
      sort_order: t.sort_order,
      source: t.source || "custom",
      day_of_week: t.day_of_week ?? null,
      is_active: true,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase.from("role_page_config")
      .upsert(rows, { onConflict: "location_id,role,section,task_id" });
    if (error) {
      console.log("[RolePageConfig] Save error:", error.message);
    }
    setSaving(false);
    setDirty(false);
    await loadTasks();
  };

  // Add a custom task
  const addTask = async () => {
    if (!addLabel.trim()) return;
    const taskId = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const maxSort = Math.max(0, ...tasks.filter(t => t.section === addSection).map(t => t.sort_order));

    const row = {
      location_id: locationId,
      role: selectedRole,
      section: addSection,
      task_id: taskId,
      task_label: addLabel.trim(),
      task_time: addTime || null,
      sort_order: maxSort + 1,
      source: "custom",
      is_active: true,
    };

    const { error } = await supabase.from("role_page_config").insert([row]);
    if (!error) {
      setAddLabel("");
      setAddTime("");
      setShowAddTask(false);
      await loadTasks();
    }
  };

  // Delete a task
  const deleteTask = async (taskId) => {
    await supabase.from("role_page_config")
      .delete()
      .eq("location_id", locationId)
      .eq("role", selectedRole)
      .eq("task_id", taskId);
    await loadTasks();
  };

  // Move task within section
  const moveTask = (sectionId, idx, dir) => {
    const sectionTasks = [...(tasksBySection[sectionId] || [])];
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= sectionTasks.length) return;
    [sectionTasks[idx], sectionTasks[newIdx]] = [sectionTasks[newIdx], sectionTasks[idx]];

    const newTasks = tasks.map(t => {
      const inSection = sectionTasks.find(st => st.task_id === t.task_id);
      if (inSection) {
        return { ...t, sort_order: sectionTasks.indexOf(inSection) };
      }
      return t;
    });
    setTasks(newTasks);
    setDirty(true);
  };

  // Move task to different section
  const moveToSection = (taskId, newSection) => {
    const newTasks = tasks.map(t =>
      t.task_id === taskId ? { ...t, section: newSection } : t
    );
    setTasks(newTasks);
    setDirty(true);
  };

  // Update task label
  const updateTaskLabel = (taskId, newLabel) => {
    const newTasks = tasks.map(t =>
      t.task_id === taskId ? { ...t, task_label: newLabel } : t
    );
    setTasks(newTasks);
    setDirty(true);
  };

  const totalTasks = tasks.length;

  return (
    <div>
      <h3 style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 700, color: C.text }}>Role Page Sections</h3>
      <p style={{ margin: "0 0 20px", fontSize: 14, color: C.textSec }}>
        Configure tasks for the four fixed sections on each role's main page.
        Legacy checklist items can be imported as a starting point.
      </p>

      {/* Role selector */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.textSec }}>Role:</span>
        <div style={{ display: "flex", gap: 6 }}>
          {ROLE_OPTIONS.map(r => (
            <button key={r.value} onClick={() => setSelectedRole(r.value)}
              style={{
                padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, fontFamily: "inherit",
                cursor: "pointer", transition: "all 0.15s",
                border: selectedRole === r.value ? `2px solid ${C.pri}` : `1.5px solid ${C.border}`,
                background: selectedRole === r.value ? `${C.pri}12` : C.surface,
                color: selectedRole === r.value ? C.pri : C.textSec,
              }}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: C.textMut }}>Loading...</div>
      ) : (
        <>
          {/* Actions bar */}
          <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
            {totalTasks === 0 && (
              <button onClick={() => setShowSeedConfirm(true)}
                style={{
                  padding: "8px 16px", borderRadius: 8, border: `1.5px solid ${C.pri}`,
                  background: `${C.pri}08`, color: C.pri, fontSize: 12, fontWeight: 700,
                  cursor: "pointer", fontFamily: "inherit",
                }}>
                Import from Legacy Checklists
              </button>
            )}
            <button onClick={() => setShowAddTask(true)}
              style={{
                padding: "8px 16px", borderRadius: 8, border: `1.5px solid ${C.acc}`,
                background: `${C.acc}12`, color: C.text, fontSize: 12, fontWeight: 700,
                cursor: "pointer", fontFamily: "inherit",
              }}>
              + Add Task
            </button>
            {dirty && (
              <button onClick={saveTasks} disabled={saving}
                style={{
                  padding: "8px 20px", borderRadius: 8, border: "none",
                  background: C.pri, color: "#fff", fontSize: 12, fontWeight: 700,
                  cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit",
                  opacity: saving ? 0.7 : 1,
                }}>
                {saving ? "Saving..." : "Save Changes"}
              </button>
            )}
            {dirty && <span style={{ fontSize: 12, color: C.acc, fontWeight: 600, alignSelf: "center" }}>Unsaved changes</span>}
            {totalTasks > 0 && (
              <button onClick={() => setShowSeedConfirm(true)}
                style={{
                  padding: "8px 14px", borderRadius: 8, border: `1.5px solid ${C.border}`,
                  background: C.surface, color: C.textSec, fontSize: 11, fontWeight: 600,
                  cursor: "pointer", fontFamily: "inherit", marginLeft: "auto",
                }}>
                Re-import Legacy
              </button>
            )}
          </div>

          {/* Summary */}
          <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
            {FIXED_SECTIONS.map(s => {
              const count = (tasksBySection[s.id] || []).length;
              return (
                <div key={s.id} style={{
                  padding: "8px 16px", borderRadius: 10, background: s.bg,
                  border: `1.5px solid ${s.color}30`, display: "flex", alignItems: "center", gap: 8,
                }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: s.color }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: s.color }}>{s.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: s.color }}>{count}</span>
                </div>
              );
            })}
          </div>

          {/* Section-based task list */}
          {FIXED_SECTIONS.map(section => {
            const sectionTasks = tasksBySection[section.id] || [];
            return (
              <div key={section.id} style={{ marginBottom: 24 }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 8, marginBottom: 8,
                  padding: "8px 12px", borderRadius: 8, background: section.bg,
                  border: `1.5px solid ${section.color}25`,
                }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: section.color }} />
                  <span style={{ fontSize: 14, fontWeight: 700, color: section.color }}>{section.label}</span>
                  <span style={{ fontSize: 11, color: `${section.color}99`, fontWeight: 600 }}>
                    {sectionTasks.length} task{sectionTasks.length !== 1 ? "s" : ""}
                  </span>
                </div>

                {/* Workflow assignments for this section (read-only) */}
                {(() => {
                  const roleMap = WORKFLOW_SECTION_MAP[selectedRole] || {};
                  const wfs = Object.entries(roleMap).filter(([, sec]) => sec === section.id);
                  if (wfs.length === 0) return null;
                  return (
                    <div style={{ padding: "6px 12px 4px", display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {wfs.map(([wfId]) => (
                        <span key={wfId} style={{
                          fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 6,
                          background: `${section.color}12`, color: section.color,
                          border: `1px solid ${section.color}25`,
                        }}>
                          {WORKFLOW_LABELS[wfId] || wfId}
                        </span>
                      ))}
                    </div>
                  );
                })()}

                {sectionTasks.length === 0 ? (
                  <div style={{ padding: "12px 16px", fontSize: 13, color: C.textMut, fontStyle: "italic" }}>
                    No tasks assigned to this section
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {sectionTasks.map((task, idx) => (
                      <div key={task.task_id} style={{
                        display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
                        borderRadius: 8, background: C.surface, border: `1px solid ${C.border}`,
                      }}>
                        <span style={{ fontSize: 11, color: C.textMut, fontWeight: 700, minWidth: 24 }}>{idx + 1}</span>
                        {task.task_time && (
                          <span style={{
                            fontSize: 10, fontWeight: 700, color: C.textMut, minWidth: 42,
                            background: C.surfaceHover, padding: "2px 6px", borderRadius: 4,
                          }}>
                            {task.task_time}
                          </span>
                        )}
                        {editingTask === task.task_id ? (
                          <input
                            autoFocus
                            value={task.task_label}
                            onChange={e => updateTaskLabel(task.task_id, e.target.value)}
                            onBlur={() => setEditingTask(null)}
                            onKeyDown={e => { if (e.key === "Enter") setEditingTask(null); }}
                            style={{
                              flex: 1, padding: "4px 8px", borderRadius: 6, border: `1.5px solid ${C.pri}`,
                              background: C.bg, color: C.text, fontSize: 12, fontFamily: "inherit",
                            }}
                          />
                        ) : (
                          <span
                            onClick={() => setEditingTask(task.task_id)}
                            style={{ flex: 1, fontSize: 12, color: C.text, cursor: "pointer" }}
                            title="Click to edit"
                          >
                            {task.task_label}
                          </span>
                        )}
                        {task.source && task.source !== "custom" && (
                          <span style={{
                            fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                            background: "#DBEAFE", color: "#1D4ED8",
                          }}>
                            {SOURCE_LABELS[task.source] || task.source}
                          </span>
                        )}
                        {/* Section move dropdown */}
                        <select
                          value={task.section}
                          onChange={e => moveToSection(task.task_id, e.target.value)}
                          style={{
                            padding: "3px 6px", borderRadius: 5, border: `1px solid ${C.border}`,
                            background: C.bg, color: C.textSec, fontSize: 10, fontFamily: "inherit", cursor: "pointer",
                          }}>
                          {FIXED_SECTIONS.map(s => (
                            <option key={s.id} value={s.id}>{s.label}</option>
                          ))}
                        </select>
                        <button onClick={() => moveTask(section.id, idx, -1)} disabled={idx === 0}
                          style={{
                            padding: "3px 6px", borderRadius: 5, border: `1px solid ${C.border}`, background: C.bg,
                            color: idx === 0 ? C.textMut : C.text, fontSize: 11, cursor: idx === 0 ? "not-allowed" : "pointer",
                            fontFamily: "inherit", opacity: idx === 0 ? 0.4 : 1,
                          }}>↑</button>
                        <button onClick={() => moveTask(section.id, idx, 1)} disabled={idx === sectionTasks.length - 1}
                          style={{
                            padding: "3px 6px", borderRadius: 5, border: `1px solid ${C.border}`, background: C.bg,
                            color: idx === sectionTasks.length - 1 ? C.textMut : C.text, fontSize: 11,
                            cursor: idx === sectionTasks.length - 1 ? "not-allowed" : "pointer",
                            fontFamily: "inherit", opacity: idx === sectionTasks.length - 1 ? 0.4 : 1,
                          }}>↓</button>
                        <button onClick={() => deleteTask(task.task_id)}
                          style={{
                            padding: "3px 6px", borderRadius: 5, border: "1px solid #FCA5A5", background: "#FEF2F2",
                            color: "#DC2626", fontSize: 11, cursor: "pointer", fontFamily: "inherit",
                          }}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}

      {/* Add task modal */}
      {showAddTask && (
        <Modal title="Add New Task" onClose={() => setShowAddTask(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: C.textSec, marginBottom: 4, display: "block" }}>Section</label>
              <select value={addSection} onChange={e => setAddSection(e.target.value)}
                style={{
                  width: "100%", padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`,
                  background: C.bg, color: C.text, fontSize: 13, fontFamily: "inherit",
                }}>
                {FIXED_SECTIONS.map(s => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </div>
            <Inp label="Task Description" value={addLabel} onChange={e => setAddLabel(e.target.value)} required />
            <Inp label="Time (optional, HH:MM)" value={addTime} onChange={e => setAddTime(e.target.value)} />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <Btn variant="primary" onClick={addTask} disabled={!addLabel.trim()}>Add Task</Btn>
              <Btn variant="ghost" onClick={() => setShowAddTask(false)}>Cancel</Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* Seed confirmation modal */}
      {showSeedConfirm && (
        <Modal title="Import Legacy Checklists" onClose={() => setShowSeedConfirm(false)}>
          <p style={{ fontSize: 13, color: C.textSec, marginBottom: 16 }}>
            This will import tasks from the Opening, Front-End, Back-End, and Closing checklists
            into the four fixed sections for the <strong>{ROLE_OPTIONS.find(r => r.value === selectedRole)?.label}</strong> role.
            {totalTasks > 0 && (
              <span style={{ color: "#DC2626", fontWeight: 600 }}>
                {" "}This will replace the current {totalTasks} tasks.
              </span>
            )}
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn variant="primary" onClick={seedFromLegacy} disabled={saving}>
              {saving ? "Importing..." : "Import"}
            </Btn>
            <Btn variant="ghost" onClick={() => setShowSeedConfirm(false)}>Cancel</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default RolePageConfigTab;
