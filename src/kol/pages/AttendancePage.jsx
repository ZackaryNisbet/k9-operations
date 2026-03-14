// K9 Operations — AttendanceTrackerPage
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

const ATTENDANCE_TYPES = ["Tardy", "Early Release", "Call Out (2+ hrs)", "Late Call Out (<2 hrs)", "No Call / No Show"];
const ATTENDANCE_TYPE_COLORS = { "Tardy": "#F0AD4E", "Early Release": "#E67E22", "Call Out (2+ hrs)": "#E74C3C", "Late Call Out (<2 hrs)": "#C0392B", "No Call / No Show": "#922B21" };

function AttendanceTrackerPage({ data, save, nav, profile }) {
  const [tab, setTab] = useState("roster");
  const hp = (k) => true; // Always allow in Lite version
  const canEdit = true;
  const canEditRoster = true;
  const today = new Date().toISOString().slice(0, 10);
  const userName = profile?.full_name || profile?.email || "Unknown";
  const userInitials = (profile?.full_name || "").split(" ").map(n => n[0]).join("").toUpperCase() || "—";

  // Attendance data from data store
  const roster = data.attendanceRoster || [];
  const entries = data.attendanceEntries || [];
  const auditLog = data.attendanceAuditLog || [];
  const activeRoster = roster.filter(r => !r.endDate);
  const inactiveRoster = roster.filter(r => !!r.endDate);

  // ── Audit Logging Helper ──
  const logAudit = (action, category, details, prev, next) => {
    const entry = {
      id: uuid(),
      timestamp: new Date().toISOString(),
      userId: profile?.id || "unknown",
      userName,
      userInitials,
      action,
      category,
      details,
      previousValue: prev || null,
      newValue: next || null,
    };
    return [...auditLog, entry];
  };

  const saveWithAudit = (changes, action, category, details, prev, next) => {
    const newAudit = logAudit(action, category, details, prev, next);
    save({ ...data, ...changes, attendanceAuditLog: newAudit });
  };

  const tabs = [
    { id: "roster", label: "Roster" },
    { id: "input", label: "Attendance Log" },
    { id: "summary", label: "Summary" },
    { id: "policy", label: "Policy Reference" },
    { id: "audit", label: "Audit Log" },
  ];

  // ── Roster Tab (state lifted to parent to survive re-renders) ──
  const [rosterShowAdd, setRosterShowAdd] = useState(false);
  const [rosterEditingField, setRosterEditingField] = useState(null);
  const [rosterEditValue, setRosterEditValue] = useState("");
  const [rosterForm, setRosterForm] = useState({ name: "", title: "", phone: "", email: "", startDate: today });
  const [rosterSortCol, setRosterSortCol] = useState("name");
  const [rosterSortDir, setRosterSortDir] = useState("asc");
  function RosterTab() {
    const showAdd = rosterShowAdd, setShowAdd = setRosterShowAdd;
    const editingField = rosterEditingField, setEditingField = setRosterEditingField;
    const editValue = rosterEditValue, setEditValue = setRosterEditValue;
    const form = rosterForm, setForm = setRosterForm;
    const sortCol = rosterSortCol, setSortCol = setRosterSortCol;
    const sortDir = rosterSortDir, setSortDir = setRosterSortDir;

    const sorted = useMemo(() => {
      return [...roster].sort((a, b) => {
        let va, vb;
        if (sortCol === "status") { va = a.endDate ? "Inactive" : "Active"; vb = b.endDate ? "Inactive" : "Active"; }
        else if (sortCol === "days") { va = Math.floor((Date.now() - new Date(a.startDate).getTime()) / 86400000); vb = Math.floor((Date.now() - new Date(b.startDate).getTime()) / 86400000); }
        else { va = (a[sortCol] || "").toLowerCase(); vb = (b[sortCol] || "").toLowerCase(); }
        if (va < vb) return sortDir === "asc" ? -1 : 1;
        if (va > vb) return sortDir === "asc" ? 1 : -1;
        return 0;
      });
    }, [roster, sortCol, sortDir]);

    const toggleSort = (col) => { if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortCol(col); setSortDir("asc"); } };
    const sortIcon = (col) => col === sortCol ? (sortDir === "asc" ? <I.SortAsc /> : <I.SortDesc />) : <I.SortNone />;

    const addMember = () => {
      if (!form.name.trim()) return;
      const newMember = { id: uuid(), ...form, name: form.name.trim(), createdAt: new Date().toISOString() };
      saveWithAudit(
        { attendanceRoster: [...roster, newMember] },
        "ADD_ROSTER_MEMBER", "Roster",
        `Added team member: ${form.name.trim()} (${form.title || "No title"})`,
        null,
        { name: form.name.trim(), title: form.title, phone: form.phone, email: form.email, startDate: form.startDate }
      );
      setForm({ name: "", title: "", phone: "", email: "", startDate: today });
      setShowAdd(false);
    };

    const startEdit = (memberId, field, currentValue) => {
      setEditingField({ id: memberId, field });
      setEditValue(currentValue || "");
    };

    const commitEdit = (memberId, field) => {
      const member = roster.find(r => r.id === memberId);
      if (!member) return;
      const oldVal = member[field] || "";
      const newVal = editValue.trim();
      if (oldVal === newVal) { setEditingField(null); return; }
      const fieldLabel = { name: "Name", title: "Title", phone: "Phone", email: "Email" }[field] || field;
      const newRoster = roster.map(r => r.id === memberId ? { ...r, [field]: newVal } : r);
      // If name changed, also update attendance entries to match
      let newEntries = entries;
      if (field === "name" && oldVal !== newVal) {
        newEntries = entries.map(e => e.name === oldVal ? { ...e, name: newVal } : e);
      }
      saveWithAudit(
        { attendanceRoster: newRoster, attendanceEntries: newEntries },
        "EDIT_ROSTER_FIELD", "Roster",
        `Updated ${fieldLabel} for ${member.name}: "${oldVal}" → "${newVal}"`,
        { [field]: oldVal },
        { [field]: newVal }
      );
      setEditingField(null);
    };

    const setEndDate = (memberId, endDate) => {
      const member = roster.find(r => r.id === memberId);
      if (!member) return;
      const newRoster = roster.map(r => r.id === memberId ? { ...r, endDate } : r);
      saveWithAudit(
        { attendanceRoster: newRoster },
        "SET_END_DATE", "Roster",
        `Set end date for ${member.name}: ${endDate}`,
        { endDate: member.endDate || null },
        { endDate }
      );
    };

    const clearEndDate = (memberId) => {
      const member = roster.find(r => r.id === memberId);
      if (!member) return;
      const newRoster = roster.map(r => r.id === memberId ? { ...r, endDate: undefined } : r);
      saveWithAudit(
        { attendanceRoster: newRoster },
        "REACTIVATE_MEMBER", "Roster",
        `Reactivated ${member.name} (cleared end date ${member.endDate})`,
        { endDate: member.endDate },
        { endDate: null }
      );
    };

    const setStartDate = (memberId, startDate) => {
      const member = roster.find(r => r.id === memberId);
      if (!member) return;
      const oldDate = member.startDate;
      const newRoster = roster.map(r => r.id === memberId ? { ...r, startDate } : r);
      saveWithAudit(
        { attendanceRoster: newRoster },
        "EDIT_ROSTER_FIELD", "Roster",
        `Updated Start Date for ${member.name}: "${oldDate}" → "${startDate}"`,
        { startDate: oldDate },
        { startDate }
      );
    };

    const cols = [
      { id: "name", label: "Name", w: "15%", editable: true },
      { id: "status", label: "Status", w: "8%" },
      { id: "title", label: "Title", w: "14%", editable: true },
      { id: "phone", label: "Phone", w: "11%", editable: true },
      { id: "email", label: "Email", w: "16%", editable: true },
      { id: "startDate", label: "Start Date", w: "12%" },
      { id: "endDate", label: "End Date", w: "12%" },
      { id: "days", label: "Days", w: "5%" },
    ];

    const isEditing = (id, field) => editingField && editingField.id === id && editingField.field === field;
    const inputSt = { padding: "4px 8px", borderRadius: 6, border: `1.5px solid ${C.pri}`, fontSize: 12, fontFamily: "inherit", width: "100%", boxSizing: "border-box", outline: "none" };

    return (
      <div>
        <button
          onClick={() => nav("ops-hub")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 12px",
            marginBottom: 24,
            border: "none",
            background: "none",
            color: C.pri,
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 600,
            fontFamily: "inherit",
          }}
        >
          ← Back to Operations
        </button>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ padding: "6px 14px", borderRadius: 8, background: "#D1FAE5", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: "#059669" }}>{activeRoster.length}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#059669" }}>Active</span>
              </div>
              <div style={{ padding: "6px 14px", borderRadius: 8, background: "#FEE2E2", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: "#DC2626" }}>{inactiveRoster.length}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#DC2626" }}>Inactive</span>
              </div>
              <div style={{ padding: "6px 14px", borderRadius: 8, background: C.bg, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: C.text }}>{roster.length}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: C.textMut }}>Total</span>
              </div>
            </div>
          </div>
          {canEditRoster && <Btn variant="primary" icon={<I.Plus />} onClick={() => setShowAdd(true)}>Add Team Member</Btn>}
        </div>

        {/* Add member form */}
        {showAdd && (
          <Card style={{ marginBottom: 16, padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 12 }}>New Team Member</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
              <input placeholder="Full Name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={{ padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 13, fontFamily: "inherit" }} />
              <input placeholder="Title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} style={{ padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 13, fontFamily: "inherit" }} />
              <input placeholder="Phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} style={{ padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 13, fontFamily: "inherit" }} />
              <input placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} style={{ padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 13, fontFamily: "inherit" }} />
            </div>
            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: C.textSec }}>Start Date:</span>
              <MiniDatePicker value={form.startDate} onChange={v => setForm({ ...form, startDate: v || today })} />
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
              <Btn variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Btn>
              <Btn variant="primary" onClick={addMember}>Add</Btn>
            </div>
          </Card>
        )}

        {/* Roster table */}
        <Card style={{ overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#1B3A5C" }}>
                  {cols.map(col => (
                    <th key={col.id} onClick={() => toggleSort(col.id)} style={{ padding: "10px 12px", textAlign: col.id === "name" ? "left" : "center", color: "#fff", fontWeight: 700, fontSize: 11, cursor: "pointer", whiteSpace: "nowrap", width: col.w, userSelect: "none", letterSpacing: "0.03em" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>{col.label} {sortIcon(col.id)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((member, idx) => {
                  const isActive = !member.endDate;
                  const endTs = member.endDate ? new Date(member.endDate + "T12:00:00").getTime() : Date.now();
                  const days = Math.max(0, Math.floor((endTs - new Date(member.startDate).getTime()) / 86400000));
                  const bgColor = idx % 2 === 0 ? "#E8F0FE" : "#FFFFFF";
                  return (
                    <tr key={member.id} style={{ background: bgColor, transition: "background 0.1s" }}
                      onMouseEnter={e => e.currentTarget.style.background = "#dde8f8"}
                      onMouseLeave={e => e.currentTarget.style.background = bgColor}>
                      {/* Name */}
                      <td style={{ padding: "9px 12px", fontWeight: 500 }}>
                        {isEditing(member.id, "name") ? (
                          <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={() => commitEdit(member.id, "name")} onKeyDown={e => { if (e.key === "Enter") commitEdit(member.id, "name"); if (e.key === "Escape") setEditingField(null); }} style={inputSt} />
                        ) : (
                          <span onClick={() => canEditRoster && startEdit(member.id, "name", member.name)} style={{ cursor: canEditRoster ? "pointer" : "default" }} title={canEditRoster ? "Click to edit" : ""}>{member.name}</span>
                        )}
                      </td>
                      {/* Status */}
                      <td style={{ padding: "9px 12px", textAlign: "center" }}>
                        <span onClick={() => { if (canEditRoster && !isActive) clearEndDate(member.id); }} style={{ fontWeight: 700, fontSize: 11, padding: "2px 8px", borderRadius: 10, background: isActive ? "#D1FAE5" : "#FEE2E2", color: isActive ? "#059669" : "#DC2626", cursor: canEditRoster && !isActive ? "pointer" : "default" }} title={canEditRoster && !isActive ? "Click to reactivate" : ""}>{isActive ? "Active" : "Inactive"}</span>
                      </td>
                      {/* Title */}
                      <td style={{ padding: "9px 12px", textAlign: "center", color: C.textSec }}>
                        {isEditing(member.id, "title") ? (
                          <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={() => commitEdit(member.id, "title")} onKeyDown={e => { if (e.key === "Enter") commitEdit(member.id, "title"); if (e.key === "Escape") setEditingField(null); }} style={inputSt} />
                        ) : (
                          <span onClick={() => canEditRoster && startEdit(member.id, "title", member.title)} style={{ cursor: canEditRoster ? "pointer" : "default" }} title={canEditRoster ? "Click to edit" : ""}>{member.title || "—"}</span>
                        )}
                      </td>
                      {/* Phone */}
                      <td style={{ padding: "9px 12px", textAlign: "center", color: C.textSec }}>
                        {isEditing(member.id, "phone") ? (
                          <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={() => commitEdit(member.id, "phone")} onKeyDown={e => { if (e.key === "Enter") commitEdit(member.id, "phone"); if (e.key === "Escape") setEditingField(null); }} style={inputSt} />
                        ) : (
                          <span onClick={() => canEditRoster && startEdit(member.id, "phone", member.phone)} style={{ cursor: canEditRoster ? "pointer" : "default" }} title={canEditRoster ? "Click to edit" : ""}>{member.phone || "—"}</span>
                        )}
                      </td>
                      {/* Email */}
                      <td style={{ padding: "9px 12px", textAlign: "center", color: C.textSec, fontSize: 11 }}>
                        {isEditing(member.id, "email") ? (
                          <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={() => commitEdit(member.id, "email")} onKeyDown={e => { if (e.key === "Enter") commitEdit(member.id, "email"); if (e.key === "Escape") setEditingField(null); }} style={inputSt} />
                        ) : (
                          <span onClick={() => canEditRoster && startEdit(member.id, "email", member.email)} style={{ cursor: canEditRoster ? "pointer" : "default" }} title={canEditRoster ? "Click to edit" : ""}>{member.email || "—"}</span>
                        )}
                      </td>
                      {/* Start Date */}
                      <td style={{ padding: "9px 12px", textAlign: "center" }}>
                        {canEditRoster ? (
                          <MiniDatePicker value={member.startDate} onChange={v => { if (v) setStartDate(member.id, v); }} />
                        ) : (
                          member.startDate ? new Date(member.startDate + "T12:00:00").toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }) : "—"
                        )}
                      </td>
                      {/* End Date */}
                      <td style={{ padding: "9px 12px", textAlign: "center" }}>
                        {canEditRoster && isActive ? (
                          <MiniDatePicker value="" onChange={v => { if (v) setEndDate(member.id, v); }} placeholder="—" />
                        ) : canEditRoster && !isActive ? (
                          <MiniDatePicker value={member.endDate} onChange={v => { if (v) { const m = roster.find(r => r.id === member.id); const old = m?.endDate; const newRoster = roster.map(r => r.id === member.id ? { ...r, endDate: v } : r); saveWithAudit({ attendanceRoster: newRoster }, "EDIT_ROSTER_FIELD", "Roster", `Updated End Date for ${member.name}: "${old}" → "${v}"`, { endDate: old }, { endDate: v }); } }} />
                        ) : (
                          member.endDate ? new Date(member.endDate + "T12:00:00").toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }) : "—"
                        )}
                      </td>
                      {/* Days */}
                      <td style={{ padding: "9px 12px", textAlign: "center", fontWeight: 600 }}>{days}</td>
                    </tr>
                  );
                })}
                {roster.length === 0 && (
                  <tr><td colSpan={8} style={{ padding: 40, textAlign: "center", color: C.textMut, fontSize: 13 }}>No team members yet. Click "Add Team Member" to get started.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    );
  }

  // ── Input Tab (Attendance Log) ──
  function InputTab() {
    const [showAdd, setShowAdd] = useState(false);
    const [form, setForm] = useState({ name: "", type: "", date: today, coverage: "No", notes: "", loggedBy: userName });
    const [editingEntry, setEditingEntry] = useState(null);
    const [editForm, setEditForm] = useState({});

    const sortedEntries = useMemo(() => [...entries].sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || "").localeCompare(a.createdAt || "")), [entries]);

    const addEntry = () => {
      if (!form.name || !form.type || !form.date) return;
      const newEntry = { id: uuid(), ...form, loggedBy: userName, loggedAt: new Date().toISOString(), createdAt: new Date().toISOString() };
      saveWithAudit(
        { attendanceEntries: [...entries, newEntry] },
        "ADD_ATTENDANCE_ENTRY", "Attendance Log",
        `Logged ${form.type} for ${form.name} on ${form.date}`,
        null,
        { name: form.name, type: form.type, date: form.date, coverage: form.coverage, notes: form.notes }
      );
      setForm({ name: "", type: "", date: today, coverage: "No", notes: "", loggedBy: userName });
      setShowAdd(false);
    };

    const deleteEntry = (entry) => {
      saveWithAudit(
        { attendanceEntries: entries.filter(e => e.id !== entry.id) },
        "DELETE_ATTENDANCE_ENTRY", "Attendance Log",
        `Deleted ${entry.type} entry for ${entry.name} on ${entry.date}`,
        { name: entry.name, type: entry.type, date: entry.date, coverage: entry.coverage, notes: entry.notes },
        null
      );
    };

    const startEditEntry = (entry) => {
      setEditingEntry(entry.id);
      setEditForm({ name: entry.name, type: entry.type, date: entry.date, coverage: entry.coverage || "No", notes: entry.notes || "" });
    };

    const commitEditEntry = (entryId) => {
      const original = entries.find(e => e.id === entryId);
      if (!original) return;
      const changes = [];
      if (editForm.name !== original.name) changes.push(`Name: "${original.name}" → "${editForm.name}"`);
      if (editForm.type !== original.type) changes.push(`Type: "${original.type}" → "${editForm.type}"`);
      if (editForm.date !== original.date) changes.push(`Date: "${original.date}" → "${editForm.date}"`);
      if (editForm.coverage !== (original.coverage || "No")) changes.push(`Coverage: "${original.coverage || "No"}" → "${editForm.coverage}"`);
      if (editForm.notes !== (original.notes || "")) changes.push(`Notes updated`);
      if (changes.length === 0) { setEditingEntry(null); return; }
      const newEntries = entries.map(e => e.id === entryId ? { ...e, ...editForm, lastEditedBy: userName, lastEditedAt: new Date().toISOString() } : e);
      saveWithAudit(
        { attendanceEntries: newEntries },
        "EDIT_ATTENDANCE_ENTRY", "Attendance Log",
        `Edited entry for ${original.name}: ${changes.join("; ")}`,
        { name: original.name, type: original.type, date: original.date, coverage: original.coverage, notes: original.notes },
        { ...editForm }
      );
      setEditingEntry(null);
    };

    const editInputSt = { padding: "4px 8px", borderRadius: 6, border: `1.5px solid ${C.pri}`, fontSize: 11, fontFamily: "inherit", width: "100%", boxSizing: "border-box", outline: "none" };

    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div style={{ padding: "6px 14px", borderRadius: 8, background: C.bg, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: C.text }}>{entries.length}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: C.textMut }}>Total Entries</span>
            </div>
          </div>
          {canEdit && <Btn variant="primary" icon={<I.Plus />} onClick={() => setShowAdd(true)}>Log Incident</Btn>}
        </div>

        {showAdd && (
          <Card style={{ marginBottom: 16, padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 16 }}>New Attendance Entry</div>
            {/* Employee */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Employee</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {activeRoster.map(r => (
                  <button key={r.id} onClick={() => setForm({ ...form, name: r.name })}
                    style={{ padding: "6px 14px", borderRadius: 8, border: `1.5px solid ${form.name === r.name ? C.pri : C.border}`, background: form.name === r.name ? C.priLt : C.surface, color: form.name === r.name ? C.pri : C.text, fontSize: 12, fontWeight: form.name === r.name ? 700 : 500, cursor: "pointer", fontFamily: "inherit", transition: "all 0.12s" }}
                    onMouseEnter={e => { if (form.name !== r.name) e.currentTarget.style.borderColor = C.pri + "80"; }}
                    onMouseLeave={e => { if (form.name !== r.name) e.currentTarget.style.borderColor = C.border; }}>
                    {r.name}
                  </button>
                ))}
                {activeRoster.length === 0 && <span style={{ fontSize: 12, color: C.textMut, fontStyle: "italic" }}>No active employees. Add team members in the Roster tab first.</span>}
              </div>
            </div>
            {/* Absence Type */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Absence Type</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {ATTENDANCE_TYPES.map(t => {
                  const clr = ATTENDANCE_TYPE_COLORS[t];
                  const sel = form.type === t;
                  return (
                    <button key={t} onClick={() => setForm({ ...form, type: t })}
                      style={{ padding: "7px 16px", borderRadius: 8, border: `2px solid ${sel ? clr : C.border}`, background: sel ? clr + "18" : C.surface, color: sel ? clr : C.textSec, fontSize: 12, fontWeight: sel ? 700 : 500, cursor: "pointer", fontFamily: "inherit", transition: "all 0.12s" }}
                      onMouseEnter={e => { if (!sel) { e.currentTarget.style.borderColor = clr; e.currentTarget.style.color = clr; } }}
                      onMouseLeave={e => { if (!sel) { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textSec; } }}>
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>
            {/* Coverage + Date row */}
            <div style={{ display: "flex", gap: 24, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Coverage Secured?</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => setForm({ ...form, coverage: "Yes" })}
                    style={{ padding: "6px 18px", borderRadius: 8, border: `1.5px solid ${form.coverage === "Yes" ? C.suc : C.border}`, background: form.coverage === "Yes" ? "#D1FAE5" : C.surface, color: form.coverage === "Yes" ? "#059669" : C.textMut, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", transition: "all 0.12s" }}>Yes</button>
                  <button onClick={() => setForm({ ...form, coverage: "No" })}
                    style={{ padding: "6px 18px", borderRadius: 8, border: `1.5px solid ${form.coverage === "No" ? C.dan : C.border}`, background: form.coverage === "No" ? "#FEE2E2" : C.surface, color: form.coverage === "No" ? "#DC2626" : C.textMut, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", transition: "all 0.12s" }}>No</button>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Shift Date</div>
                <MiniDatePicker value={form.date} onChange={v => setForm({ ...form, date: v || today })} />
              </div>
            </div>
            {/* Notes */}
            <div style={{ marginBottom: 16 }}>
              <textarea placeholder="Notes (optional)" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 13, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }} />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
              <span style={{ fontSize: 11, color: C.textMut, marginRight: "auto" }}>Logged by: {form.loggedBy}</span>
              <Btn variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Btn>
              <Btn variant="primary" onClick={addEntry}>Save Entry</Btn>
            </div>
          </Card>
        )}

        <Card style={{ overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#1B3A5C" }}>
                  <th style={{ padding: "10px 12px", textAlign: "left", color: "#fff", fontWeight: 700, fontSize: 11 }}>Name</th>
                  <th style={{ padding: "10px 12px", textAlign: "center", color: "#fff", fontWeight: 700, fontSize: 11 }}>Absence Type</th>
                  <th style={{ padding: "10px 12px", textAlign: "center", color: "#fff", fontWeight: 700, fontSize: 11 }}>Shift Date</th>
                  <th style={{ padding: "10px 12px", textAlign: "center", color: "#fff", fontWeight: 700, fontSize: 11 }}>Coverage?</th>
                  <th style={{ padding: "10px 12px", textAlign: "left", color: "#fff", fontWeight: 700, fontSize: 11 }}>Notes</th>
                  <th style={{ padding: "10px 12px", textAlign: "center", color: "#fff", fontWeight: 700, fontSize: 11 }}>Logged By</th>
                  {canEdit && <th style={{ padding: "10px 12px", textAlign: "center", color: "#fff", fontWeight: 700, fontSize: 11, width: 70 }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {sortedEntries.map((entry, idx) => {
                  const isEd = editingEntry === entry.id;
                  return (
                    <tr key={entry.id} style={{ background: idx % 2 === 0 ? "#F8F9FA" : "#FFFFFF" }}>
                      <td style={{ padding: "9px 12px", fontWeight: 500 }}>
                        {isEd ? (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                            {activeRoster.map(r => {
                              const sel = editForm.name === r.name;
                              return (
                                <button key={r.id} onClick={() => setEditForm({ ...editForm, name: r.name })}
                                  style={{ padding: "3px 9px", borderRadius: 6, border: `1.5px solid ${sel ? C.pri : C.border}`, background: sel ? C.priLt : C.surface, color: sel ? C.pri : C.text, fontSize: 10, fontWeight: sel ? 700 : 500, cursor: "pointer", fontFamily: "inherit", transition: "all 0.12s", whiteSpace: "nowrap" }}>
                                  {r.name}
                                </button>
                              );
                            })}
                          </div>
                        ) : entry.name}
                      </td>
                      <td style={{ padding: "9px 12px", textAlign: "center" }}>
                        {isEd ? (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 3, justifyContent: "center" }}>
                            {ATTENDANCE_TYPES.map(t => {
                              const clr = ATTENDANCE_TYPE_COLORS[t];
                              const sel = editForm.type === t;
                              return (
                                <button key={t} onClick={() => setEditForm({ ...editForm, type: t })}
                                  style={{ padding: "3px 8px", borderRadius: 6, border: `1.5px solid ${sel ? clr : C.border}`, background: sel ? clr + "18" : C.surface, color: sel ? clr : C.textSec, fontSize: 10, fontWeight: sel ? 700 : 500, cursor: "pointer", fontFamily: "inherit", transition: "all 0.12s", whiteSpace: "nowrap" }}>
                                  {t}
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10, background: (ATTENDANCE_TYPE_COLORS[entry.type] || "#999") + "20", color: ATTENDANCE_TYPE_COLORS[entry.type] || "#999" }}>{entry.type}</span>
                        )}
                      </td>
                      <td style={{ padding: "9px 12px", textAlign: "center" }}>
                        {isEd ? (
                          <MiniDatePicker value={editForm.date} onChange={v => setEditForm({ ...editForm, date: v || editForm.date })} />
                        ) : (
                          entry.date ? new Date(entry.date + "T12:00:00").toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }) : "—"
                        )}
                      </td>
                      <td style={{ padding: "9px 12px", textAlign: "center" }}>
                        {isEd ? (
                          <div style={{ display: "flex", gap: 3, justifyContent: "center" }}>
                            <button onClick={() => setEditForm({ ...editForm, coverage: "Yes" })}
                              style={{ padding: "3px 10px", borderRadius: 6, border: `1.5px solid ${editForm.coverage === "Yes" ? C.suc : C.border}`, background: editForm.coverage === "Yes" ? "#D1FAE5" : C.surface, color: editForm.coverage === "Yes" ? "#059669" : C.textMut, fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", transition: "all 0.12s" }}>Yes</button>
                            <button onClick={() => setEditForm({ ...editForm, coverage: "No" })}
                              style={{ padding: "3px 10px", borderRadius: 6, border: `1.5px solid ${editForm.coverage === "No" ? C.dan : C.border}`, background: editForm.coverage === "No" ? "#FEE2E2" : C.surface, color: editForm.coverage === "No" ? "#DC2626" : C.textMut, fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", transition: "all 0.12s" }}>No</button>
                          </div>
                        ) : (
                          <span style={{ fontWeight: 600, color: entry.coverage === "Yes" ? C.suc : C.dan }}>{entry.coverage || "No"}</span>
                        )}
                      </td>
                      <td style={{ padding: "9px 12px", color: C.textSec, minWidth: 200, maxWidth: 400 }}>
                        {isEd ? (
                          <textarea value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} style={{ ...editInputSt, minHeight: 60, resize: "vertical" }} placeholder="Notes..." rows={3} />
                        ) : (
                          <span style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", display: "block", fontSize: 12, lineHeight: 1.5 }}>{entry.notes || "—"}</span>
                        )}
                      </td>
                      <td style={{ padding: "9px 12px", textAlign: "center", fontSize: 11 }}>
                        <div style={{ fontWeight: 600, color: C.text }}>{entry.loggedBy || "—"}</div>
                        {entry.loggedAt && <div style={{ fontSize: 9, color: C.textMut, fontWeight: 400 }}>{new Date(entry.loggedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} {new Date(entry.loggedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}</div>}
                        {entry.lastEditedBy && <div style={{ fontSize: 9, color: C.textMut, fontWeight: 400, marginTop: 2, borderTop: `1px solid ${C.border}`, paddingTop: 2 }}>edited by {entry.lastEditedBy}{entry.lastEditedAt && <span> · {new Date(entry.lastEditedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} {new Date(entry.lastEditedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}</span>}</div>}
                      </td>
                      {canEdit && (
                        <td style={{ padding: "9px 12px", textAlign: "center" }}>
                          {isEd ? (
                            <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                              <button onClick={() => commitEditEntry(entry.id)} style={{ border: "none", background: "none", cursor: "pointer", color: C.suc, fontSize: 14 }} title="Save">✓</button>
                              <button onClick={() => setEditingEntry(null)} style={{ border: "none", background: "none", cursor: "pointer", color: C.textMut, fontSize: 12 }} title="Cancel">✕</button>
                            </div>
                          ) : (
                            <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                              <button onClick={() => startEditEntry(entry)} style={{ border: "none", background: "none", cursor: "pointer", color: C.pri, opacity: 0.6, fontSize: 11 }} title="Edit entry">
                                <I.Edit />
                              </button>
                              <button onClick={() => deleteEntry(entry)} style={{ border: "none", background: "none", cursor: "pointer", color: C.dan, opacity: 0.5, fontSize: 11 }} title="Delete entry">
                                <I.Trash />
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
                {entries.length === 0 && (
                  <tr><td colSpan={canEdit ? 7 : 6} style={{ padding: 40, textAlign: "center", color: C.textMut, fontSize: 13 }}>No attendance entries yet. Click "Log Incident" to record an occurrence.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    );
  }

  // ── Summary Tab ──
  function SummaryTab() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const summaryData = useMemo(() => {
      return activeRoster.map(member => {
        const memberEntries = entries.filter(e => e.name === member.name);
        const byType = {};
        ATTENDANCE_TYPES.forEach(type => {
          const allTime = memberEntries.filter(e => e.type === type).length;
          const last30 = memberEntries.filter(e => e.type === type && e.date > thirtyDaysAgo).length;
          byType[type] = { allTime, last30 };
        });
        const total30 = ATTENDANCE_TYPES.reduce((sum, t) => sum + byType[t].last30, 0);
        const totalAll = ATTENDANCE_TYPES.reduce((sum, t) => sum + byType[t].allTime, 0);
        return { ...member, byType, total30, totalAll };
      }).sort((a, b) => b.totalAll - a.totalAll);
    }, [activeRoster, entries, thirtyDaysAgo]);

    const grandTotals = useMemo(() => {
      const gt = {};
      ATTENDANCE_TYPES.forEach(type => {
        gt[type] = { last30: summaryData.reduce((s, m) => s + m.byType[type].last30, 0), allTime: summaryData.reduce((s, m) => s + m.byType[type].allTime, 0) };
      });
      gt.total30 = summaryData.reduce((s, m) => s + m.total30, 0);
      gt.totalAll = summaryData.reduce((s, m) => s + m.totalAll, 0);
      return gt;
    }, [summaryData]);

    return (
      <div>
        <Card style={{ overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr>
                  <th rowSpan={2} style={{ padding: "8px 10px", background: "#1B3A5C", color: "#fff", fontWeight: 700, textAlign: "left", fontSize: 11, verticalAlign: "bottom", borderRight: "1px solid rgba(255,255,255,0.1)" }}>Name</th>
                  {ATTENDANCE_TYPES.map(type => (
                    <th key={type} colSpan={2} style={{ padding: "6px 8px", background: ATTENDANCE_TYPE_COLORS[type], color: "#fff", fontWeight: 700, textAlign: "center", fontSize: 10, borderRight: "1px solid rgba(255,255,255,0.2)" }}>{type}</th>
                  ))}
                  <th colSpan={2} style={{ padding: "6px 8px", background: "#1B3A5C", color: "#fff", fontWeight: 700, textAlign: "center", fontSize: 10 }}>Total Marks</th>
                </tr>
                <tr>
                  {ATTENDANCE_TYPES.map(type => (
                    <React.Fragment key={type}>
                      <th style={{ padding: "5px 6px", background: "#2C3E50", color: "#fff", fontWeight: 600, textAlign: "center", fontSize: 9 }}>30 Days</th>
                      <th style={{ padding: "5px 6px", background: "#2C3E50", color: "#fff", fontWeight: 600, textAlign: "center", fontSize: 9, borderRight: "1px solid rgba(255,255,255,0.1)" }}>All Time</th>
                    </React.Fragment>
                  ))}
                  <th style={{ padding: "5px 6px", background: "#2C3E50", color: "#fff", fontWeight: 600, textAlign: "center", fontSize: 9 }}>30 Days</th>
                  <th style={{ padding: "5px 6px", background: "#2C3E50", color: "#fff", fontWeight: 600, textAlign: "center", fontSize: 9 }}>All Time</th>
                </tr>
              </thead>
              <tbody>
                {summaryData.map((member, idx) => (
                  <tr key={member.id} style={{ background: idx % 2 === 0 ? "#F8F9FA" : "#FFFFFF" }}>
                    <td style={{ padding: "8px 10px", fontWeight: 500, borderRight: "1px solid #E5E7EB" }}>{member.name}</td>
                    {ATTENDANCE_TYPES.map(type => (
                      <React.Fragment key={type}>
                        <td style={{ padding: "6px 8px", textAlign: "center", color: member.byType[type].last30 > 0 ? C.text : C.textMut, fontWeight: member.byType[type].last30 > 0 ? 700 : 400 }}>{member.byType[type].last30 || "—"}</td>
                        <td style={{ padding: "6px 8px", textAlign: "center", borderRight: "1px solid #E5E7EB", color: member.byType[type].allTime > 0 ? C.text : C.textMut, fontWeight: member.byType[type].allTime > 0 ? 700 : 400 }}>{member.byType[type].allTime || "—"}</td>
                      </React.Fragment>
                    ))}
                    <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 700, background: "#EBF0F7", color: member.total30 > 0 ? C.text : C.textMut }}>{member.total30 || "—"}</td>
                    <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 700, background: "#EBF0F7", color: member.totalAll > 0 ? C.text : C.textMut }}>{member.totalAll || "—"}</td>
                  </tr>
                ))}
                {summaryData.length === 0 && (
                  <tr><td colSpan={2 + ATTENDANCE_TYPES.length * 2 + 2} style={{ padding: 40, textAlign: "center", color: C.textMut, fontSize: 12 }}>No active roster members. Add team members in the Roster tab first.</td></tr>
                )}
              </tbody>
              {summaryData.length > 0 && (
                <tfoot>
                  <tr style={{ background: "#1B3A5C" }}>
                    <td style={{ padding: "8px 10px", fontWeight: 700, color: "#fff" }}>Total</td>
                    {ATTENDANCE_TYPES.map(type => (
                      <React.Fragment key={type}>
                        <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 700, color: "#fff" }}>{grandTotals[type].last30 || "—"}</td>
                        <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 700, color: "#fff", borderRight: "1px solid rgba(255,255,255,0.1)" }}>{grandTotals[type].allTime || "—"}</td>
                      </React.Fragment>
                    ))}
                    <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 700, color: "#fff" }}>{grandTotals.total30 || "—"}</td>
                    <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 700, color: "#fff" }}>{grandTotals.totalAll || "—"}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>
      </div>
    );
  }

  // ── Policy Tab ──
  function PolicyTab() {
    const sections = [
      {
        title: "ATTENDANCE TYPES",
        subtitle: "Use these categories when logging incidents on the Attendance Log tab. Listed from least to most severe.",
        items: [
          { type: "Tardy", def: "Employee arrived 5 or more minutes after their scheduled shift start time." },
          { type: "Early Release", def: "Employee left their shift before the scheduled end time (and was not sent home early by a MOD due to overstaffing)." },
          { type: "Call Out (2+ hrs)", def: "Employee called out at least 2 hours before shift start." },
          { type: "Late Call Out (<2 hrs)", def: "Employee called out with less than 2 hours notice before shift start. This is a violation of company policy." },
          { type: "No Call / No Show", def: "Employee did not report to work and did not contact management at all." },
        ],
      },
      {
        title: "PROGRESSIVE COUNSELING PROCESS",
        subtitle: "Discipline escalates with repeated violations. Each step requires documentation. Always consult your director when counseling is required.",
        items: [
          { type: "1. Verbal Warning (Documented)", def: "2 tardies OR 1 uncovered call-out in a rolling 30-day period. Document the conversation and save in employee file." },
          { type: "2. Written Warning", def: "Repeated incidents or any new attendance violation within 60 days of the Verbal Warning. Requires a formal written document signed by the employee." },
          { type: "3. Final Written Warning", def: "Ongoing attendance issues despite previous counseling steps. Employee is made aware that any further violation will result in termination." },
          { type: "4. Termination", def: "Repeated violations after Final Written Warning, or a single major offense such as a No Call / No Show." },
        ],
      },
      {
        title: "IMPORTANT NOTES",
        subtitle: null,
        items: [
          { type: "Emergencies", def: "Emergency situations will be reviewed on a case-by-case basis in partnership with HR. Documentation may be required (e.g., hospital discharge, doctor's note, return-to-work release)." },
          { type: "Voluntary Resignation", def: "An employee who fails to report to work or call in for 3 or more consecutive scheduled shifts is considered to have voluntarily resigned their employment." },
          { type: "Coverage Responsibility", def: "Employees are expected to actively seek coverage from other trained staff when calling out. Failure to attempt coverage may result in formal counseling." },
        ],
      },
    ];

    return (
      <div>
        {sections.map((section, si) => (
          <Card key={si} style={{ marginBottom: 20, overflow: "hidden" }}>
            <div style={{ background: "#1B3A5C", padding: "12px 18px" }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#fff", letterSpacing: "0.03em" }}>{section.title}</div>
            </div>
            {section.subtitle && <div style={{ padding: "10px 18px", fontSize: 12, color: C.textSec, fontStyle: "italic", borderBottom: `1px solid ${C.borderLight}` }}>{section.subtitle}</div>}
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#2C3E50" }}>
                  <th style={{ padding: "8px 18px", textAlign: "center", color: "#fff", fontWeight: 700, fontSize: 11, width: si === 0 ? "22%" : "28%" }}>{si === 0 ? "Type" : "Step"}</th>
                  <th style={{ padding: "8px 18px", textAlign: "center", color: "#fff", fontWeight: 700, fontSize: 11 }}>{si === 0 ? "Definition & When to Use" : "Trigger"}</th>
                </tr>
              </thead>
              <tbody>
                {section.items.map((item, idx) => (
                  <tr key={idx} style={{ background: idx % 2 === 0 ? "#F8F9FA" : "#FFFFFF" }}>
                    <td style={{ padding: "12px 18px", fontWeight: 700, textAlign: "center", verticalAlign: "top", fontSize: 12, borderRight: `1px solid ${C.borderLight}` }}>{item.type}</td>
                    <td style={{ padding: "12px 18px", fontSize: 12, lineHeight: 1.6, color: C.textSec }}>{item.def}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ))}
      </div>
    );
  }

  // ── Audit Log Tab ──
  function AuditTab() {
    const [filterCategory, setFilterCategory] = useState("all");
    const [filterUser, setFilterUser] = useState("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [expandedEntry, setExpandedEntry] = useState(null);

    const categories = useMemo(() => [...new Set(auditLog.map(e => e.category))].sort(), [auditLog]);
    const users = useMemo(() => [...new Set(auditLog.map(e => e.userName))].sort(), [auditLog]);

    const filteredLog = useMemo(() => {
      return [...auditLog]
        .filter(e => filterCategory === "all" || e.category === filterCategory)
        .filter(e => filterUser === "all" || e.userName === filterUser)
        .filter(e => {
          if (!searchQuery) return true;
          const q = searchQuery.toLowerCase();
          return (e.details || "").toLowerCase().includes(q) || (e.action || "").toLowerCase().includes(q) || (e.userName || "").toLowerCase().includes(q);
        })
        .sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
    }, [auditLog, filterCategory, filterUser, searchQuery]);

    const actionColors = {
      ADD_ROSTER_MEMBER: { bg: "#D1FAE5", color: "#059669", label: "Added" },
      EDIT_ROSTER_FIELD: { bg: "#DBEAFE", color: "#2563EB", label: "Edited" },
      SET_END_DATE: { bg: "#FEE2E2", color: "#DC2626", label: "Deactivated" },
      REACTIVATE_MEMBER: { bg: "#D1FAE5", color: "#059669", label: "Reactivated" },
      ADD_ATTENDANCE_ENTRY: { bg: "#FEF3C7", color: "#D97706", label: "Logged" },
      EDIT_ATTENDANCE_ENTRY: { bg: "#DBEAFE", color: "#2563EB", label: "Edited" },
      DELETE_ATTENDANCE_ENTRY: { bg: "#FEE2E2", color: "#DC2626", label: "Deleted" },
    };

    const formatTs = (ts) => {
      if (!ts) return "—";
      const d = new Date(ts);
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) + " at " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    };

    return (
      <div>
        {/* Filters */}
        <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: C.textMut }}>Category:</span>
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 11, fontFamily: "inherit", background: C.surface }}>
              <option value="all">All</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: C.textMut }}>User:</span>
            <select value={filterUser} onChange={e => setFilterUser(e.target.value)} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 11, fontFamily: "inherit", background: C.surface }}>
              <option value="all">All</option>
              {users.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <input placeholder="Search audit log..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ width: "100%", padding: "5px 10px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 11, fontFamily: "inherit", boxSizing: "border-box" }} />
          </div>
          <div style={{ fontSize: 11, color: C.textMut, fontWeight: 600 }}>{filteredLog.length} entries</div>
        </div>

        {/* Log entries */}
        <Card style={{ overflow: "hidden" }}>
          {filteredLog.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: C.textMut, fontSize: 13 }}>
              {auditLog.length === 0 ? "No audit log entries yet. All changes to the Attendance Tracker will be recorded here." : "No entries match your filters."}
            </div>
          ) : (
            <div style={{ maxHeight: 600, overflowY: "auto" }}>
              {filteredLog.map((entry, idx) => {
                const ac = actionColors[entry.action] || { bg: C.bg, color: C.textSec, label: entry.action };
                const isExpanded = expandedEntry === entry.id;
                return (
                  <div key={entry.id} style={{ borderBottom: idx < filteredLog.length - 1 ? `1px solid ${C.borderLight}` : "none", padding: "12px 16px", cursor: "pointer", background: isExpanded ? C.bg : "transparent", transition: "background 0.1s" }}
                    onClick={() => setExpandedEntry(isExpanded ? null : entry.id)}
                    onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = "#FAFBFC"; }}
                    onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = "transparent"; }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                      {/* Timestamp + User */}
                      <div style={{ width: 160, flexShrink: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: C.text }}>{formatTs(entry.timestamp)}</div>
                        <div style={{ fontSize: 10, color: C.textMut, marginTop: 2 }}>by {entry.userName} ({entry.userInitials})</div>
                      </div>
                      {/* Action badge */}
                      <div style={{ flexShrink: 0 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: ac.bg, color: ac.color, textTransform: "uppercase", letterSpacing: "0.03em" }}>{ac.label}</span>
                      </div>
                      {/* Category */}
                      <div style={{ flexShrink: 0, width: 100 }}>
                        <span style={{ fontSize: 10, fontWeight: 600, color: C.textMut, textTransform: "uppercase" }}>{entry.category}</span>
                      </div>
                      {/* Details */}
                      <div style={{ flex: 1, fontSize: 12, color: C.text, lineHeight: 1.5 }}>
                        {entry.details}
                      </div>
                      {/* Expand indicator */}
                      <div style={{ flexShrink: 0, fontSize: 10, color: C.textMut, transition: "transform 0.15s", transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}>▶</div>
                    </div>
                    {/* Expanded detail */}
                    {isExpanded && (entry.previousValue || entry.newValue) && (
                      <div style={{ marginTop: 12, marginLeft: 172, display: "flex", gap: 20, fontSize: 11 }}>
                        {entry.previousValue && (
                          <div style={{ flex: 1, padding: 10, borderRadius: 8, background: "#FEE2E2", border: "1px solid #FECACA" }}>
                            <div style={{ fontWeight: 700, color: "#DC2626", marginBottom: 4, fontSize: 10, textTransform: "uppercase" }}>Previous Value</div>
                            <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "'GT Eesti', monospace", fontSize: 11, color: "#7F1D1D" }}>{JSON.stringify(entry.previousValue, null, 2)}</pre>
                          </div>
                        )}
                        {entry.newValue && (
                          <div style={{ flex: 1, padding: 10, borderRadius: 8, background: "#D1FAE5", border: "1px solid #A7F3D0" }}>
                            <div style={{ fontWeight: 700, color: "#059669", marginBottom: 4, fontSize: 10, textTransform: "uppercase" }}>New Value</div>
                            <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "'GT Eesti', monospace", fontSize: 11, color: "#064E3B" }}>{JSON.stringify(entry.newValue, null, 2)}</pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div style={{ padding: "0 8px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
        <button onClick={() => nav("ops-hub")} style={{ border: "none", background: "none", cursor: "pointer", color: C.textMut, display: "flex", alignItems: "center", padding: 4 }}><I.Back /></button>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0 }}>Attendance Tracker</h2>
      </div>
      <div style={{ fontSize: 12, color: C.textSec, marginBottom: 20, marginLeft: 36 }}>
        {(data?.locationName) || "Location"}
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 2, marginBottom: 20, borderBottom: `2px solid ${C.borderLight}`, paddingBottom: 0 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: "10px 20px", border: "none", borderBottom: `3px solid ${tab === t.id ? C.pri : "transparent"}`, background: tab === t.id ? C.priLt : "transparent", color: tab === t.id ? C.pri : C.textSec, fontWeight: tab === t.id ? 700 : 500, fontSize: 13, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s", borderRadius: "8px 8px 0 0", marginBottom: -2 }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "roster" && <RosterTab />}
      {tab === "input" && <InputTab />}
      {tab === "summary" && <SummaryTab />}
      {tab === "policy" && <PolicyTab />}
      {tab === "audit" && <AuditTab />}
    </div>
  );
}


// ─── AUDIT LOG PAGE (from POS App) ────────────────────────────────────────

export default AttendanceTrackerPage;
