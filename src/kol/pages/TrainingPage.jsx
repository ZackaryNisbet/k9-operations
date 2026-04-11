// K9 Operations — Training Module (Wave 1)
// Implements Training Home, Templates, Active Records, Train New Employee flow,
// and Training Record Detail with section expand/collapse and item completion.

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../../supabaseClient";
import { C, todayStr, gid, fmtDate } from "../../shared/theme";
import { Btn, Modal, Card, Inp, Badge, CustomSelect } from "../../shared/ui";
import { I } from "../../shared/icons";
import { hasLeanPermission } from "../../shared/permissions";

// ─── Constants ──────────────────────────────────────────────────────────────

const STATUS_COLORS = {
  not_started: { bg: "#F1F5F9", text: "#64748B", label: "Not Started" },
  in_progress: { bg: "#DBEAFE", text: "#1D4ED8", label: "In Progress" },
  complete: { bg: "#DCFCE7", text: "#15803D", label: "Complete" },
  passed: { bg: "#DCFCE7", text: "#15803D", label: "Passed" },
  failed: { bg: "#FEE2E2", text: "#DC2626", label: "Failed" },
  needs_follow_up: { bg: "#FEF3C7", text: "#D97706", label: "Needs Follow-Up" },
  retest_required: { bg: "#FEF3C7", text: "#D97706", label: "Retest Required" },
  archived: { bg: "#F1F5F9", text: "#94A3B8", label: "Archived" },
};

const ITEM_STATUS_COLORS = {
  not_started: { bg: "#F1F5F9", text: "#94A3B8" },
  in_progress: { bg: "#DBEAFE", text: "#1D4ED8" },
  complete: { bg: "#DCFCE7", text: "#15803D" },
  passed: { bg: "#DCFCE7", text: "#15803D" },
  failed: { bg: "#FEE2E2", text: "#DC2626" },
  needs_coaching: { bg: "#FEF3C7", text: "#D97706" },
  blocked: { bg: "#F1F5F9", text: "#94A3B8" },
  waived: { bg: "#F1F5F9", text: "#94A3B8" },
};

const TABS = [
  { id: "home", label: "Home" },
  { id: "active", label: "Active Records" },
  { id: "templates", label: "Templates" },
  { id: "completed", label: "Completed" },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const s = STATUS_COLORS[status] || STATUS_COLORS.not_started;
  return <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600, background: s.bg, color: s.text }}>{s.label}</span>;
}

function ProgressBar({ percent, height = 6 }) {
  const p = Math.min(100, Math.max(0, percent || 0));
  const color = p >= 100 ? C.suc : p > 50 ? C.acc : C.info;
  return (
    <div style={{ width: "100%", height, borderRadius: height / 2, background: C.borderLight, overflow: "hidden" }}>
      <div style={{ width: `${p}%`, height: "100%", borderRadius: height / 2, background: color, transition: "width 0.3s" }} />
    </div>
  );
}

function EmptyState({ icon, title, subtitle }) {
  const IconComp = I[icon];
  return (
    <div style={{ textAlign: "center", padding: "60px 20px", color: C.textMut }}>
      {IconComp && <div style={{ marginBottom: 12, opacity: 0.4 }}><IconComp /></div>}
      <div style={{ fontSize: 16, fontWeight: 600, color: C.textSec, marginBottom: 4 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 13 }}>{subtitle}</div>}
    </div>
  );
}

function SectionHeader({ title, count, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{title}</span>
        {count != null && <Badge color="default">{count}</Badge>}
      </div>
      {children}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function TrainingPage({ data, save, nav, profile, addGlobalToast }) {
  const [tab, setTab] = useState("home");
  const [loading, setLoading] = useState(true);

  // Data state
  const [templates, setTemplates] = useState([]);
  const [templateVersions, setTemplateVersions] = useState([]);
  const [records, setRecords] = useState([]);
  const [sections, setSections] = useState([]);
  const [items, setItems] = useState([]);
  const [itemResults, setItemResults] = useState([]);
  const [notes, setNotes] = useState([]);
  const [signatures, setSignatures] = useState([]);

  // UI state
  const [showNewRecord, setShowNewRecord] = useState(false);
  const [selectedRecordId, setSelectedRecordId] = useState(null);
  const [expandedSections, setExpandedSections] = useState({});
  const [previewTemplateId, setPreviewTemplateId] = useState(null);

  // New record form
  const [newEmployeeName, setNewEmployeeName] = useState("");
  const [newTargetRole, setNewTargetRole] = useState("");
  const [newTemplateId, setNewTemplateId] = useState("");
  const [newHireDate, setNewHireDate] = useState("");
  const [newStartDate, setNewStartDate] = useState(todayStr());
  const [newTargetEndDate, setNewTargetEndDate] = useState("");
  const [newTrainerName, setNewTrainerName] = useState("");
  const [creating, setCreating] = useState(false);

  // Note form
  const [noteText, setNoteText] = useState("");
  const [noteInitials, setNoteInitials] = useState("");

  // Signature form
  const [sigName, setSigName] = useState("");
  const [sigRole, setSigRole] = useState("trainer");
  const [showSigModal, setShowSigModal] = useState(false);

  const locationId = profile?.location_id || data?.locationId || "demo";
  const canManageTemplates = hasLeanPermission(profile, "Checklist Templates");

  // ── Load data ──
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [tRes, tvRes, trRes] = await Promise.all([
        supabase.from("training_templates").select("*").order("name"),
        supabase.from("training_template_versions").select("*").eq("is_current", true).eq("status", "published"),
        supabase.from("training_records").select("*").order("created_at", { ascending: false }),
      ]);
      setTemplates(tRes.data || []);
      setTemplateVersions(tvRes.data || []);
      setRecords(trRes.data || []);

      // Load sections and items for published versions
      const versionIds = (tvRes.data || []).map(v => v.id);
      if (versionIds.length > 0) {
        const [sRes, iRes] = await Promise.all([
          supabase.from("training_template_sections").select("*").in("template_version_id", versionIds).order("sequence_order"),
          supabase.from("training_template_items").select("*").in("template_version_id", versionIds).order("sequence_order"),
        ]);
        setSections(sRes.data || []);
        setItems(iRes.data || []);
      }
    } catch (err) {
      console.error("Training data load error:", err);
      addGlobalToast("Failed to load training data", "error");
    }
    setLoading(false);
  }, [addGlobalToast]);

  useEffect(() => { loadData(); }, [loadData]);

  // Load record detail data when a record is selected
  useEffect(() => {
    if (!selectedRecordId) return;
    (async () => {
      const [irRes, nRes, sRes] = await Promise.all([
        supabase.from("training_record_item_results").select("*").eq("record_id", selectedRecordId),
        supabase.from("training_record_notes").select("*").eq("record_id", selectedRecordId).order("created_at", { ascending: false }),
        supabase.from("training_signatures").select("*").eq("record_id", selectedRecordId).order("signed_at", { ascending: false }),
      ]);
      setItemResults(irRes.data || []);
      setNotes(nRes.data || []);
      setSignatures(sRes.data || []);
    })();
  }, [selectedRecordId]);

  // ── Derived data ──
  const activeRecords = useMemo(() => records.filter(r => ["not_started", "in_progress", "needs_follow_up", "retest_required"].includes(r.overall_status)), [records]);
  const completedRecords = useMemo(() => records.filter(r => ["complete", "passed", "failed", "archived"].includes(r.overall_status)), [records]);
  const activeTemplates = useMemo(() => templates.filter(t => t.is_active), [templates]);

  const selectedRecord = useMemo(() => records.find(r => r.id === selectedRecordId), [records, selectedRecordId]);
  const selectedVersion = useMemo(() => {
    if (!selectedRecord) return null;
    return templateVersions.find(v => v.id === selectedRecord.template_version_id);
  }, [selectedRecord, templateVersions]);

  const recordSections = useMemo(() => {
    if (!selectedRecord) return [];
    return sections.filter(s => s.template_version_id === selectedRecord.template_version_id && !s.parent_section_id).sort((a, b) => a.sequence_order - b.sequence_order);
  }, [selectedRecord, sections]);

  const getChildSections = useCallback((parentId) => {
    return sections.filter(s => s.parent_section_id === parentId).sort((a, b) => a.sequence_order - b.sequence_order);
  }, [sections]);

  const getSectionItems = useCallback((sectionId) => {
    return items.filter(i => i.template_section_id === sectionId).sort((a, b) => a.sequence_order - b.sequence_order);
  }, [items]);

  const getItemResult = useCallback((itemId) => {
    return itemResults.find(r => r.template_item_id === itemId);
  }, [itemResults]);

  // Template stats: section and item counts per template
  const templateStats = useMemo(() => {
    const stats = {};
    templates.forEach(t => {
      const v = templateVersions.find(tv => tv.template_id === t.id);
      if (!v) { stats[t.id] = { sectionCount: 0, itemCount: 0 }; return; }
      const tSections = sections.filter(s => s.template_version_id === v.id && !s.parent_section_id);
      const tItems = items.filter(i => i.template_version_id === v.id);
      stats[t.id] = { sectionCount: tSections.length, itemCount: tItems.length };
    });
    return stats;
  }, [templates, templateVersions, sections, items]);

  // Template preview data
  const previewTemplate = useMemo(() => {
    if (!previewTemplateId) return null;
    const t = templates.find(x => x.id === previewTemplateId);
    if (!t) return null;
    const v = templateVersions.find(tv => tv.template_id === t.id);
    if (!v) return { ...t, version: null, sections: [] };
    const tSections = sections.filter(s => s.template_version_id === v.id && !s.parent_section_id)
      .sort((a, b) => a.sequence_order - b.sequence_order);
    const sectionData = tSections.map(sec => {
      const childSecs = sections.filter(s => s.parent_section_id === sec.id)
        .sort((a, b) => a.sequence_order - b.sequence_order);
      const directItems = items.filter(i => i.template_section_id === sec.id)
        .sort((a, b) => a.sequence_order - b.sequence_order);
      const childData = childSecs.map(cs => ({
        ...cs,
        items: items.filter(i => i.template_section_id === cs.id)
          .sort((a, b) => a.sequence_order - b.sequence_order),
      }));
      return { ...sec, children: childData, directItems };
    });
    return { ...t, version: v, sections: sectionData };
  }, [previewTemplateId, templates, templateVersions, sections, items]);

  // Role-filtered template options for new record
  const templateOptions = useMemo(() => {
    return activeTemplates
      .filter(t => t.template_class === "training_plan")
      .map(t => {
        const v = templateVersions.find(tv => tv.template_id === t.id);
        const stats = templateStats[t.id] || {};
        return { value: t.id, label: `${t.name} (${t.role_scopes.join(", ")})`, versionId: v?.id, roleScopes: t.role_scopes, stats };
      });
  }, [activeTemplates, templateVersions, templateStats]);

  // ── Create record ──
  const handleCreateRecord = useCallback(async () => {
    if (!newEmployeeName.trim() || !newTemplateId || !newTargetRole.trim()) {
      addGlobalToast("Please fill in required fields", "error");
      return;
    }
    setCreating(true);
    try {
      const template = templates.find(t => t.id === newTemplateId);
      const version = templateVersions.find(v => v.template_id === newTemplateId);
      if (!template || !version) throw new Error("Template version not found");

      // Get all items for this version to pre-create results
      const versionItems = items.filter(i => i.template_version_id === version.id);
      const requiredCount = versionItems.filter(i => i.required).length;
      const nameParts = newEmployeeName.trim().split(/\s+/);
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(" ") || "";

      const recordId = gid();
      const { error: recErr } = await supabase.from("training_records").insert({
        id: recordId,
        template_id: template.id,
        template_version_id: version.id,
        template_name_snapshot: template.name,
        template_class_snapshot: template.template_class,
        employee_name_first: firstName,
        employee_name_last: lastName,
        employee_full_name: newEmployeeName.trim(),
        target_role: newTargetRole.trim(),
        location_id: locationId,
        hire_date: newHireDate || null,
        training_start_date: newStartDate || null,
        target_end_date: newTargetEndDate || null,
        assigned_trainer_name: newTrainerName.trim() || null,
        overall_status: "not_started",
        progress_percent: 0,
        required_item_count: requiredCount,
        required_item_completed_count: 0,
        template_snapshot: version.published_snapshot || {},
        created_by_user_id: profile?.id || null,
      });
      if (recErr) throw recErr;

      // Pre-create item results for every template item
      if (versionItems.length > 0) {
        const resultRows = versionItems.map(item => ({
          id: gid(),
          record_id: recordId,
          template_item_id: item.id,
          template_section_id: item.template_section_id,
          status: "not_started",
        }));
        const { error: irErr } = await supabase.from("training_record_item_results").insert(resultRows);
        if (irErr) throw irErr;
      }

      // Insert audit event
      await supabase.from("training_record_events").insert({
        record_id: recordId,
        event_type: "record_created",
        actor_user_id: profile?.id || null,
        actor_name: profile?.name || profile?.email || "System",
        after_state: { employee_full_name: newEmployeeName.trim(), template: template.name, role: newTargetRole },
      });

      addGlobalToast(`Training record created for ${newEmployeeName.trim()}`, "success");
      setShowNewRecord(false);
      resetNewRecordForm();
      await loadData();
      setSelectedRecordId(recordId);
      setTab("active");
    } catch (err) {
      console.error("Create record error:", err);
      addGlobalToast("Failed to create record: " + (err.message || "Unknown error"), "error");
    }
    setCreating(false);
  }, [newEmployeeName, newTemplateId, newTargetRole, newHireDate, newStartDate, newTargetEndDate, newTrainerName, templates, templateVersions, items, locationId, profile, addGlobalToast, loadData]);

  const resetNewRecordForm = () => {
    setNewEmployeeName("");
    setNewTargetRole("");
    setNewTemplateId("");
    setNewHireDate("");
    setNewStartDate(todayStr());
    setNewTargetEndDate("");
    setNewTrainerName("");
  };

  // ── Toggle item completion ──
  const handleToggleItem = useCallback(async (itemId) => {
    const result = itemResults.find(r => r.template_item_id === itemId);
    if (!result) return;
    const newStatus = result.status === "complete" ? "not_started" : "complete";
    const now = new Date().toISOString();

    const { error } = await supabase.from("training_record_item_results")
      .update({
        status: newStatus,
        completed_at: newStatus === "complete" ? now : null,
        completed_by_name: newStatus === "complete" ? (profile?.name || profile?.email || "") : null,
        completed_by_user_id: newStatus === "complete" ? (profile?.id || null) : null,
      })
      .eq("id", result.id);

    if (error) {
      addGlobalToast("Failed to update item", "error");
      return;
    }

    // Update local state
    setItemResults(prev => prev.map(r => r.id === result.id ? {
      ...r,
      status: newStatus,
      completed_at: newStatus === "complete" ? now : null,
      completed_by_name: newStatus === "complete" ? (profile?.name || profile?.email || "") : null,
    } : r));

    // Recompute progress
    const updatedResults = itemResults.map(r => r.id === result.id ? { ...r, status: newStatus } : r);
    const requiredItemIds = new Set(items.filter(i => i.template_version_id === selectedRecord?.template_version_id && i.required).map(i => i.id));
    const completedCount = updatedResults.filter(r => requiredItemIds.has(r.template_item_id) && (r.status === "complete" || r.status === "passed")).length;
    const totalRequired = requiredItemIds.size;
    const newPercent = totalRequired > 0 ? Math.round((completedCount / totalRequired) * 100 * 100) / 100 : 0;
    const newOverallStatus = completedCount === 0 ? "not_started" : completedCount >= totalRequired ? "complete" : "in_progress";

    await supabase.from("training_records").update({
      progress_percent: newPercent,
      required_item_completed_count: completedCount,
      overall_status: newOverallStatus,
      actual_completion_date: newOverallStatus === "complete" ? todayStr() : null,
    }).eq("id", selectedRecordId);

    // Update local record
    setRecords(prev => prev.map(r => r.id === selectedRecordId ? {
      ...r,
      progress_percent: newPercent,
      required_item_completed_count: completedCount,
      overall_status: newOverallStatus,
    } : r));

    // Audit event
    await supabase.from("training_record_events").insert({
      record_id: selectedRecordId,
      template_item_id: itemId,
      event_type: "item_status_changed",
      actor_user_id: profile?.id || null,
      actor_name: profile?.name || profile?.email || "System",
      before_state: { status: result.status },
      after_state: { status: newStatus },
    });
  }, [itemResults, items, selectedRecord, selectedRecordId, profile, addGlobalToast]);

  // ── Add note ──
  const handleAddNote = useCallback(async () => {
    if (!noteText.trim() || !noteInitials.trim() || !selectedRecordId) return;
    const { error } = await supabase.from("training_record_notes").insert({
      record_id: selectedRecordId,
      note_text: noteText.trim(),
      initials: noteInitials.trim(),
      created_by_user_id: profile?.id || null,
      created_by_name: profile?.name || profile?.email || "",
    });
    if (error) {
      addGlobalToast("Failed to add note", "error");
      return;
    }
    setNoteText("");
    // Reload notes
    const { data: nData } = await supabase.from("training_record_notes").select("*").eq("record_id", selectedRecordId).order("created_at", { ascending: false });
    setNotes(nData || []);
    addGlobalToast("Note added", "success");
  }, [noteText, noteInitials, selectedRecordId, profile, addGlobalToast]);

  // ── Add signature ──
  const handleAddSignature = useCallback(async () => {
    if (!sigName.trim() || !selectedRecordId) return;
    const { error } = await supabase.from("training_signatures").insert({
      record_id: selectedRecordId,
      signature_role: sigRole,
      signer_name: sigName.trim(),
      signature_text: sigName.trim(),
      signer_user_id: profile?.id || null,
    });
    if (error) {
      addGlobalToast("Failed to add signature", "error");
      return;
    }
    setSigName("");
    setShowSigModal(false);
    const { data: sData } = await supabase.from("training_signatures").select("*").eq("record_id", selectedRecordId).order("signed_at", { ascending: false });
    setSignatures(sData || []);
    addGlobalToast("Signature recorded", "success");
  }, [sigName, sigRole, selectedRecordId, profile, addGlobalToast]);

  // ── Section toggle ──
  const toggleSection = useCallback((sectionId) => {
    setExpandedSections(prev => ({ ...prev, [sectionId]: !prev[sectionId] }));
  }, []);

  // ── Due soon records ──
  const dueSoonRecords = useMemo(() => {
    const today = todayStr();
    const sevenDays = new Date();
    sevenDays.setDate(sevenDays.getDate() + 7);
    const sevenStr = sevenDays.toISOString().split("T")[0];
    return activeRecords.filter(r => r.target_end_date && r.target_end_date <= sevenStr && r.target_end_date >= today);
  }, [activeRecords]);

  const overdueRecords = useMemo(() => {
    const today = todayStr();
    return activeRecords.filter(r => r.target_end_date && r.target_end_date < today);
  }, [activeRecords]);

  // ═══════════════════════════════════════════════════════════════════════════
  // RECORD DETAIL VIEW
  // ═══════════════════════════════════════════════════════════════════════════

  if (selectedRecordId && selectedRecord) {
    const sectionCompletionMap = useMemo(() => {
      const map = {};
      recordSections.forEach(sec => {
        const childSecs = getChildSections(sec.id);
        let total = 0, done = 0;
        const collectItems = (sectionIds) => {
          sectionIds.forEach(sid => {
            const sItems = getSectionItems(sid);
            sItems.forEach(item => {
              if (item.required) {
                total++;
                const res = getItemResult(item.id);
                if (res && (res.status === "complete" || res.status === "passed")) done++;
              }
            });
          });
        };
        if (childSecs.length > 0) {
          collectItems(childSecs.map(c => c.id));
        } else {
          collectItems([sec.id]);
        }
        map[sec.id] = { total, done };
      });
      return map;
    }, [recordSections, getChildSections, getSectionItems, getItemResult]);

    return (
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px" }}>
        {/* Back button */}
        <button onClick={() => { setSelectedRecordId(null); setExpandedSections({}); }} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: C.pri, fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 16, fontFamily: "inherit", padding: 0 }}>
          <I.Back /> Back to Training
        </button>

        {/* Record Header */}
        <Card style={{ padding: 24, marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: C.text, marginBottom: 4 }}>{selectedRecord.employee_full_name}</div>
              <div style={{ fontSize: 14, color: C.textSec, marginBottom: 8 }}>{selectedRecord.template_name_snapshot} — {selectedRecord.target_role}</div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12, color: C.textMut }}>
                {selectedRecord.hire_date && <span>Hire: {fmtDate(selectedRecord.hire_date)}</span>}
                {selectedRecord.training_start_date && <span>Start: {fmtDate(selectedRecord.training_start_date)}</span>}
                {selectedRecord.target_end_date && <span>Target: {fmtDate(selectedRecord.target_end_date)}</span>}
                {selectedRecord.assigned_trainer_name && <span>Trainer: {selectedRecord.assigned_trainer_name}</span>}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <StatusBadge status={selectedRecord.overall_status} />
              <div style={{ marginTop: 8, fontSize: 24, fontWeight: 800, color: C.pri }}>{Math.round(selectedRecord.progress_percent)}%</div>
              <div style={{ fontSize: 11, color: C.textMut }}>{selectedRecord.required_item_completed_count} / {selectedRecord.required_item_count} items</div>
            </div>
          </div>
          <div style={{ marginTop: 12 }}><ProgressBar percent={selectedRecord.progress_percent} height={8} /></div>
        </Card>

        {/* Sections */}
        <SectionHeader title="Training Plan" count={recordSections.length} />
        {recordSections.map(sec => {
          const isOpen = expandedSections[sec.id];
          const comp = sectionCompletionMap[sec.id] || { total: 0, done: 0 };
          const childSecs = getChildSections(sec.id);
          const directItems = getSectionItems(sec.id);
          const secPercent = comp.total > 0 ? Math.round((comp.done / comp.total) * 100) : 0;

          return (
            <Card key={sec.id} style={{ marginBottom: 8, padding: 0, overflow: "hidden" }}>
              <button onClick={() => toggleSection(sec.id)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: isOpen ? C.priLt : "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "background 0.15s" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                  <span style={{ transform: isOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s", flexShrink: 0 }}><I.ChevronRight /></span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sec.title}</div>
                    {sec.day_number && <div style={{ fontSize: 11, color: C.textMut }}>
                      {sec.time_block_start && sec.time_block_end ? `${sec.time_block_start} - ${sec.time_block_end}` : `Day ${sec.day_number}`}
                      {sec.time_block_note && <span style={{ color: C.warn, marginLeft: 6 }}>{sec.time_block_note}</span>}
                    </div>}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                  <span style={{ fontSize: 11, color: C.textMut, fontWeight: 600 }}>{comp.done}/{comp.total}</span>
                  <div style={{ width: 60 }}><ProgressBar percent={secPercent} /></div>
                </div>
              </button>

              {isOpen && (
                <div style={{ padding: "0 16px 14px" }}>
                  {/* Render child module sections */}
                  {childSecs.map(child => {
                    const childItems = getSectionItems(child.id);
                    return (
                      <div key={child.id} style={{ marginTop: 12 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: C.pri, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>{child.title}</div>
                        {childItems.map(item => {
                          const result = getItemResult(item.id);
                          const isDone = result && (result.status === "complete" || result.status === "passed");
                          return (
                            <label key={item.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", cursor: "pointer", borderBottom: `1px solid ${C.borderLight}` }}>
                              <input type="checkbox" checked={isDone} onChange={() => handleToggleItem(item.id)} style={{ width: 18, height: 18, accentColor: C.pri, cursor: "pointer", flexShrink: 0 }} />
                              <span style={{ fontSize: 13, color: isDone ? C.textMut : C.text, textDecoration: isDone ? "line-through" : "none", flex: 1 }}>{item.label}</span>
                              {!item.required && <span style={{ fontSize: 10, color: C.textMut, fontStyle: "italic" }}>optional</span>}
                            </label>
                          );
                        })}
                      </div>
                    );
                  })}
                  {/* Direct items (no child modules) */}
                  {childSecs.length === 0 && directItems.map(item => {
                    const result = getItemResult(item.id);
                    const isDone = result && (result.status === "complete" || result.status === "passed");
                    return (
                      <label key={item.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", cursor: "pointer", borderBottom: `1px solid ${C.borderLight}` }}>
                        <input type="checkbox" checked={isDone} onChange={() => handleToggleItem(item.id)} style={{ width: 18, height: 18, accentColor: C.pri, cursor: "pointer", flexShrink: 0 }} />
                        <span style={{ fontSize: 13, color: isDone ? C.textMut : C.text, textDecoration: isDone ? "line-through" : "none", flex: 1 }}>{item.label}</span>
                        {!item.required && <span style={{ fontSize: 10, color: C.textMut, fontStyle: "italic" }}>optional</span>}
                      </label>
                    );
                  })}
                </div>
              )}
            </Card>
          );
        })}

        {/* Notes Section */}
        <div style={{ marginTop: 28 }}>
          <SectionHeader title="Notes" count={notes.length} />
          <Card style={{ padding: 16 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <Inp label="Initials" value={noteInitials} onChange={e => setNoteInitials(e.target.value)} style={{ width: 70 }} />
              <div style={{ flex: 1 }}>
                <Inp label="Note" value={noteText} onChange={e => setNoteText(e.target.value)} />
              </div>
              <Btn variant="primary" onClick={handleAddNote} style={{ alignSelf: "flex-end" }}>Add</Btn>
            </div>
            {notes.length === 0 && <div style={{ fontSize: 12, color: C.textMut, fontStyle: "italic" }}>No notes yet</div>}
            {notes.map(n => (
              <div key={n.id} style={{ padding: "8px 0", borderBottom: `1px solid ${C.borderLight}`, fontSize: 13 }}>
                <span style={{ fontWeight: 700, color: C.pri, marginRight: 6 }}>{n.initials}</span>
                <span style={{ color: C.text }}>{n.note_text}</span>
                <span style={{ fontSize: 11, color: C.textMut, marginLeft: 8 }}>{n.created_at ? new Date(n.created_at).toLocaleString() : ""}</span>
              </div>
            ))}
          </Card>
        </div>

        {/* Signatures Section */}
        <div style={{ marginTop: 28 }}>
          <SectionHeader title="Signatures" count={signatures.filter(s => !s.revoked_at).length}>
            <Btn variant="ghost" onClick={() => setShowSigModal(true)}>Add Signature</Btn>
          </SectionHeader>
          <Card style={{ padding: 16 }}>
            {signatures.filter(s => !s.revoked_at).length === 0 && <div style={{ fontSize: 12, color: C.textMut, fontStyle: "italic" }}>No signatures yet</div>}
            {signatures.filter(s => !s.revoked_at).map(s => (
              <div key={s.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.borderLight}`, fontSize: 13 }}>
                <div>
                  <span style={{ fontWeight: 600, color: C.text }}>{s.signer_name}</span>
                  <span style={{ fontSize: 11, color: C.textMut, marginLeft: 8 }}>({s.signature_role})</span>
                </div>
                <span style={{ fontSize: 11, color: C.textMut }}>{s.signed_at ? new Date(s.signed_at).toLocaleString() : ""}</span>
              </div>
            ))}
          </Card>
        </div>

        {/* Signature Modal */}
        {showSigModal && (
          <Modal title="Add Signature" onClose={() => setShowSigModal(false)}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <CustomSelect label="Role" value={sigRole} onChange={v => setSigRole(v)} options={[
                { value: "employee", label: "Employee" },
                { value: "trainer", label: "Trainer" },
                { value: "evaluator", label: "Evaluator" },
                { value: "manager", label: "Manager" },
              ]} />
              <Inp label="Typed Name (Signature)" value={sigName} onChange={e => setSigName(e.target.value)} required />
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
                <Btn variant="ghost" onClick={() => setShowSigModal(false)}>Cancel</Btn>
                <Btn variant="primary" onClick={handleAddSignature}>Sign</Btn>
              </div>
            </div>
          </Modal>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LIST VIEWS
  // ═══════════════════════════════════════════════════════════════════════════

  // Record table row
  const RecordRow = ({ rec }) => (
    <tr onClick={() => setSelectedRecordId(rec.id)} style={{ cursor: "pointer" }}
      onMouseEnter={e => e.currentTarget.style.background = C.surfaceHover}
      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
      <td style={{ padding: "10px 12px", fontSize: 13, fontWeight: 600, color: C.text }}>{rec.employee_full_name}</td>
      <td style={{ padding: "10px 12px", fontSize: 12, color: C.textSec }}>{rec.target_role}</td>
      <td style={{ padding: "10px 12px", fontSize: 12, color: C.textSec }}>{rec.template_name_snapshot}</td>
      <td style={{ padding: "10px 12px", fontSize: 12, color: C.textSec }}>{rec.assigned_trainer_name || "—"}</td>
      <td style={{ padding: "10px 12px" }}><ProgressBar percent={rec.progress_percent} /><span style={{ fontSize: 10, color: C.textMut }}>{Math.round(rec.progress_percent)}%</span></td>
      <td style={{ padding: "10px 12px" }}><StatusBadge status={rec.overall_status} /></td>
      <td style={{ padding: "10px 12px", fontSize: 12, color: C.textMut }}>{rec.target_end_date ? fmtDate(rec.target_end_date) : "—"}</td>
    </tr>
  );

  const tableHeaderStyle = { padding: "8px 12px", fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: `2px solid ${C.border}`, textAlign: "left" };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px" }}>
      {/* Page Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <I.GraduationCap />
          <span style={{ fontSize: 22, fontWeight: 800, color: C.text }}>Training</span>
        </div>
        <Btn variant="primary" onClick={() => setShowNewRecord(true)}>Train New Employee</Btn>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: `2px solid ${C.borderLight}` }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: "10px 18px", fontSize: 13, fontWeight: tab === t.id ? 700 : 500,
            color: tab === t.id ? C.pri : C.textMut, background: "none", border: "none",
            borderBottom: tab === t.id ? `2px solid ${C.pri}` : "2px solid transparent",
            cursor: "pointer", fontFamily: "inherit", marginBottom: -2, transition: "color 0.15s",
          }}>{t.label}</button>
        ))}
      </div>

      {loading && <div style={{ textAlign: "center", padding: 60, color: C.textMut }}>Loading training data...</div>}

      {!loading && tab === "home" && (
        <div>
          {/* Stats Row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 24 }}>
            <Card style={{ padding: 16, textAlign: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: C.pri }}>{activeRecords.length}</div>
              <div style={{ fontSize: 12, color: C.textMut, fontWeight: 600 }}>Active Trainees</div>
            </Card>
            <Card style={{ padding: 16, textAlign: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: C.warn }}>{dueSoonRecords.length}</div>
              <div style={{ fontSize: 12, color: C.textMut, fontWeight: 600 }}>Due This Week</div>
            </Card>
            <Card style={{ padding: 16, textAlign: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: C.dan }}>{overdueRecords.length}</div>
              <div style={{ fontSize: 12, color: C.textMut, fontWeight: 600 }}>Overdue</div>
            </Card>
            <Card style={{ padding: 16, textAlign: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: C.suc }}>{completedRecords.length}</div>
              <div style={{ fontSize: 12, color: C.textMut, fontWeight: 600 }}>Completed</div>
            </Card>
          </div>

          {/* Active Trainees */}
          <SectionHeader title="Active Trainees" count={activeRecords.length}>
            <Btn variant="ghost" onClick={() => setTab("active")}>View All</Btn>
          </SectionHeader>
          {activeRecords.length === 0 ? (
            <EmptyState icon="GraduationCap" title="No active trainees" subtitle="Click 'Train New Employee' to start" />
          ) : (
            <Card style={{ padding: 0, overflow: "hidden", marginBottom: 24 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>
                  <th style={tableHeaderStyle}>Employee</th>
                  <th style={tableHeaderStyle}>Role</th>
                  <th style={tableHeaderStyle}>Template</th>
                  <th style={tableHeaderStyle}>Trainer</th>
                  <th style={tableHeaderStyle}>Progress</th>
                  <th style={tableHeaderStyle}>Status</th>
                  <th style={tableHeaderStyle}>Target</th>
                </tr></thead>
                <tbody>{activeRecords.slice(0, 5).map(r => <RecordRow key={r.id} rec={r} />)}</tbody>
              </table>
            </Card>
          )}

          {/* Available Templates */}
          <SectionHeader title="Available Templates" count={activeTemplates.filter(t => t.template_class === "training_plan").length}>
            <Btn variant="ghost" onClick={() => setTab("templates")}>View All</Btn>
          </SectionHeader>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
            {activeTemplates.filter(t => t.template_class === "training_plan").map(t => (
              <Card key={t.id} style={{ padding: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>{t.name}</div>
                <div style={{ fontSize: 12, color: C.textMut }}>{t.role_scopes.join(", ")}</div>
                <Badge color="green" style={{ marginTop: 8 }}>Active</Badge>
              </Card>
            ))}
          </div>
        </div>
      )}

      {!loading && tab === "active" && (
        <div>
          <SectionHeader title="Active Training Records" count={activeRecords.length} />
          {activeRecords.length === 0 ? (
            <EmptyState icon="GraduationCap" title="No active records" subtitle="Create a new training record to get started" />
          ) : (
            <Card style={{ padding: 0, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>
                  <th style={tableHeaderStyle}>Employee</th>
                  <th style={tableHeaderStyle}>Role</th>
                  <th style={tableHeaderStyle}>Template</th>
                  <th style={tableHeaderStyle}>Trainer</th>
                  <th style={tableHeaderStyle}>Progress</th>
                  <th style={tableHeaderStyle}>Status</th>
                  <th style={tableHeaderStyle}>Target</th>
                </tr></thead>
                <tbody>{activeRecords.map(r => <RecordRow key={r.id} rec={r} />)}</tbody>
              </table>
            </Card>
          )}
        </div>
      )}

      {!loading && tab === "templates" && !previewTemplateId && (
        <div>
          <SectionHeader title="Training Templates" count={templates.length} />
          {templates.length === 0 ? (
            <EmptyState icon="FileText" title="No templates found" subtitle="Templates are seeded from the Adair Forsythe training packet" />
          ) : (
            <Card style={{ padding: 0, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>
                  <th style={tableHeaderStyle}>Name</th>
                  <th style={tableHeaderStyle}>Class</th>
                  <th style={tableHeaderStyle}>Roles</th>
                  <th style={tableHeaderStyle}>Sections</th>
                  <th style={tableHeaderStyle}>Items</th>
                  <th style={tableHeaderStyle}>Version</th>
                  <th style={tableHeaderStyle}>Status</th>
                </tr></thead>
                <tbody>
                  {templates.map(t => {
                    const v = templateVersions.find(tv => tv.template_id === t.id);
                    const stats = templateStats[t.id] || {};
                    return (
                      <tr key={t.id} onClick={() => setPreviewTemplateId(t.id)} style={{ cursor: "pointer", borderBottom: `1px solid ${C.borderLight}` }}
                        onMouseEnter={e => e.currentTarget.style.background = C.surfaceHover}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <td style={{ padding: "10px 12px", fontSize: 13, fontWeight: 600, color: C.pri }}>{t.name}</td>
                        <td style={{ padding: "10px 12px", fontSize: 12, color: C.textSec }}>{t.template_class.replace(/_/g, " ")}</td>
                        <td style={{ padding: "10px 12px", fontSize: 12, color: C.textSec }}>{t.role_scopes.join(", ")}</td>
                        <td style={{ padding: "10px 12px", fontSize: 12, color: C.textSec, textAlign: "center" }}>{stats.sectionCount || 0}</td>
                        <td style={{ padding: "10px 12px", fontSize: 12, color: C.textSec, textAlign: "center" }}>{stats.itemCount || 0}</td>
                        <td style={{ padding: "10px 12px", fontSize: 12, color: C.textSec }}>{v ? `v${v.version_no}` : "—"}</td>
                        <td style={{ padding: "10px 12px" }}>{t.is_active ? <Badge color="green">Active</Badge> : <Badge color="default">Inactive</Badge>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      )}

      {/* ─── Template Detail / Preview ─────────────────────────────────────── */}
      {!loading && tab === "templates" && previewTemplateId && previewTemplate && (
        <div>
          <button onClick={() => setPreviewTemplateId(null)} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: C.pri, fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 16, fontFamily: "inherit", padding: 0 }}>
            <I.Back /> Back to Templates
          </button>

          <Card style={{ padding: 24, marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, color: C.text, marginBottom: 4 }}>{previewTemplate.name}</div>
                <div style={{ fontSize: 14, color: C.textSec, marginBottom: 8 }}>{previewTemplate.template_class.replace(/_/g, " ")} — {previewTemplate.role_scopes.join(", ")}</div>
                {previewTemplate.version && (
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12, color: C.textMut }}>
                    <span>Version {previewTemplate.version.version_no}</span>
                    <span>Source: {previewTemplate.version.source_packet || "—"}</span>
                    {previewTemplate.version.published_at && <span>Published: {fmtDate(previewTemplate.version.published_at)}</span>}
                  </div>
                )}
              </div>
              <div style={{ textAlign: "right" }}>
                {previewTemplate.is_active ? <Badge color="green">Active</Badge> : <Badge color="default">Inactive</Badge>}
                <div style={{ marginTop: 8, fontSize: 12, color: C.textMut }}>{(templateStats[previewTemplate.id] || {}).sectionCount || 0} sections — {(templateStats[previewTemplate.id] || {}).itemCount || 0} items</div>
              </div>
            </div>
          </Card>

          {previewTemplate.version?.metadata?.qa_flags?.length > 0 && (
            <Card style={{ padding: 14, marginBottom: 16, background: "#FEF3C7", border: "1.5px solid #F59E0B40" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#D97706", marginBottom: 4 }}>QA Flags</div>
              {previewTemplate.version.metadata.qa_flags.map((f, i) => (
                <div key={i} style={{ fontSize: 12, color: "#92400E", marginTop: 4 }}>{f}</div>
              ))}
            </Card>
          )}

          <SectionHeader title="Template Structure" count={previewTemplate.sections.length} />
          {previewTemplate.sections.map(sec => {
            const isOpen = expandedSections[`tpl_${sec.id}`];
            const totalItems = sec.children.reduce((sum, c) => sum + c.items.length, 0) + sec.directItems.length;
            return (
              <Card key={sec.id} style={{ marginBottom: 8, padding: 0, overflow: "hidden" }}>
                <button onClick={() => toggleSection(`tpl_${sec.id}`)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: isOpen ? C.priLt : "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "background 0.15s" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                    <span style={{ transform: isOpen ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s", flexShrink: 0 }}><I.ChevronRight /></span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sec.title}</div>
                      {sec.day_number && <div style={{ fontSize: 11, color: C.textMut }}>
                        {sec.time_block_start && sec.time_block_end ? `${sec.time_block_start} - ${sec.time_block_end}` : `Day ${sec.day_number}`}
                      </div>}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, color: C.textMut, fontWeight: 600, flexShrink: 0 }}>
                    {sec.children.length > 0 ? `${sec.children.length} module${sec.children.length !== 1 ? "s" : ""}` : ""}{sec.children.length > 0 && totalItems > 0 ? " — " : ""}{totalItems > 0 ? `${totalItems} item${totalItems !== 1 ? "s" : ""}` : ""}
                  </span>
                </button>

                {isOpen && (
                  <div style={{ padding: "0 16px 14px" }}>
                    {sec.children.map(child => (
                      <div key={child.id} style={{ marginTop: 12 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: C.pri, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em" }}>{child.title}</div>
                        {child.items.map(item => (
                          <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: `1px solid ${C.borderLight}` }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.border, flexShrink: 0 }} />
                            <span style={{ fontSize: 13, color: C.text, flex: 1 }}>{item.label}</span>
                            <span style={{ fontSize: 10, color: C.textMut }}>{item.item_type}</span>
                            {!item.required && <span style={{ fontSize: 10, color: C.textMut, fontStyle: "italic" }}>optional</span>}
                          </div>
                        ))}
                      </div>
                    ))}
                    {sec.directItems.map(item => (
                      <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: `1px solid ${C.borderLight}` }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.border, flexShrink: 0 }} />
                        <span style={{ fontSize: 13, color: C.text, flex: 1 }}>{item.label}</span>
                        <span style={{ fontSize: 10, color: C.textMut }}>{item.item_type}</span>
                        {!item.required && <span style={{ fontSize: 10, color: C.textMut, fontStyle: "italic" }}>optional</span>}
                      </div>
                    ))}
                    {sec.instructions && <div style={{ marginTop: 8, fontSize: 11, color: C.textMut, fontStyle: "italic" }}>{sec.instructions}</div>}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {!loading && tab === "completed" && (
        <div>
          <SectionHeader title="Completed Records" count={completedRecords.length} />
          {completedRecords.length === 0 ? (
            <EmptyState icon="CheckCircle" title="No completed records" subtitle="Completed training records will appear here" />
          ) : (
            <Card style={{ padding: 0, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>
                  <th style={tableHeaderStyle}>Employee</th>
                  <th style={tableHeaderStyle}>Role</th>
                  <th style={tableHeaderStyle}>Template</th>
                  <th style={tableHeaderStyle}>Status</th>
                  <th style={tableHeaderStyle}>Completed</th>
                </tr></thead>
                <tbody>
                  {completedRecords.map(r => (
                    <tr key={r.id} onClick={() => setSelectedRecordId(r.id)} style={{ cursor: "pointer", borderBottom: `1px solid ${C.borderLight}` }}
                      onMouseEnter={e => e.currentTarget.style.background = C.surfaceHover}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <td style={{ padding: "10px 12px", fontSize: 13, fontWeight: 600, color: C.text }}>{r.employee_full_name}</td>
                      <td style={{ padding: "10px 12px", fontSize: 12, color: C.textSec }}>{r.target_role}</td>
                      <td style={{ padding: "10px 12px", fontSize: 12, color: C.textSec }}>{r.template_name_snapshot}</td>
                      <td style={{ padding: "10px 12px" }}><StatusBadge status={r.overall_status} /></td>
                      <td style={{ padding: "10px 12px", fontSize: 12, color: C.textMut }}>{r.actual_completion_date ? fmtDate(r.actual_completion_date) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      )}

      {/* ─── Train New Employee Modal ──────────────────────────────────────── */}
      {showNewRecord && (
        <Modal title="Train New Employee" onClose={() => { setShowNewRecord(false); resetNewRecordForm(); }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <Inp label="Employee Full Name" value={newEmployeeName} onChange={e => setNewEmployeeName(e.target.value)} required />
            <CustomSelect label="Target Role" value={newTargetRole} onChange={v => {
              setNewTargetRole(v);
              // Auto-select first template whose role_scopes includes the selected role
              const match = templateOptions.find(t =>
                t.roleScopes.some(rs => rs.toUpperCase() === v.toUpperCase())
              );
              if (match) setNewTemplateId(match.value);
            }} options={[
              { value: "PCT", label: "PCT (Pet Care Tech)" },
              { value: "CSR", label: "CSR (Customer Service)" },
              { value: "Supervisor", label: "Supervisor" },
            ]} />
            <CustomSelect label="Training Template" value={newTemplateId} onChange={v => setNewTemplateId(v)} options={templateOptions} />
            {newTemplateId && (() => {
              const opt = templateOptions.find(o => o.value === newTemplateId);
              const st = opt?.stats || {};
              return st.sectionCount > 0 ? (
                <div style={{ padding: "8px 12px", borderRadius: 8, background: C.priLt, fontSize: 12, color: C.pri, fontWeight: 600 }}>
                  {st.sectionCount} section{st.sectionCount !== 1 ? "s" : ""} — {st.itemCount} checklist item{st.itemCount !== 1 ? "s" : ""}
                </div>
              ) : null;
            })()}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Inp label="Hire Date" type="date" value={newHireDate} onChange={e => setNewHireDate(e.target.value)} />
              <Inp label="Training Start Date" type="date" value={newStartDate} onChange={e => setNewStartDate(e.target.value)} />
            </div>
            <Inp label="Target End Date" type="date" value={newTargetEndDate} onChange={e => setNewTargetEndDate(e.target.value)} />
            <Inp label="Assigned Trainer Name" value={newTrainerName} onChange={e => setNewTrainerName(e.target.value)} />

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
              <Btn variant="ghost" onClick={() => { setShowNewRecord(false); resetNewRecordForm(); }}>Cancel</Btn>
              <Btn variant="primary" onClick={handleCreateRecord} disabled={creating}>{creating ? "Creating..." : "Create Record"}</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
