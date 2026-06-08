import { Badge, Btn, Card, Inp, Modal } from "./ui";
import { C } from "../constants/colors";
import { DEF_EOD_TEMPLATE } from "../constants/operations";
import { I } from "../icons";
import { gid } from "../lib/format";
import { useState } from "react";

function EODTemplateTab({ data, save }) {
  const template = data.eodTemplate || DEF_EOD_TEMPLATE;
  const [sections, setSections] = useState(() => template.map(s => ({ ...s })));
  const [editIdx, setEditIdx] = useState(-1);
  const [draft, setDraft] = useState({ label: "", emoji: "", defaultContent: "", type: "text" });
  const [showAdd, setShowAdd] = useState(false);
  const [dirty, setDirty] = useState(false);

  const startEdit = (idx) => { const s = sections[idx]; setDraft({ ...s, label: s.title || s.label || "" }); setEditIdx(idx); };
  const cancelEdit = () => { setEditIdx(-1); setDraft({ label: "", emoji: "", defaultContent: "", type: "text" }); };
  const saveEdit = () => {
    const updated = sections.map((s, i) => i === editIdx ? { ...s, title: draft.label, label: draft.label, emoji: draft.emoji, defaultContent: draft.defaultContent, type: draft.type || "text" } : s);
    setSections(updated); setEditIdx(-1); setDirty(true);
  };
  const removeSection = (idx) => { setSections(sections.filter((_, i) => i !== idx)); setDirty(true); };
  const moveSection = (idx, dir) => {
    const arr = [...sections]; const swp = idx + dir;
    if (swp < 0 || swp >= arr.length) return;
    [arr[idx], arr[swp]] = [arr[swp], arr[idx]]; setSections(arr); setDirty(true);
  };
  const addSection = () => {
    const id = "custom_" + gid().slice(0, 8);
    setSections([...sections, { id, title: draft.label || "New Section", label: draft.label || "New Section", emoji: draft.emoji || "", defaultContent: draft.defaultContent || "", type: draft.type || "text" }]);
    setShowAdd(false); setDraft({ label: "", emoji: "", defaultContent: "", type: "text" }); setDirty(true);
  };
  const saveTemplate = async () => {
    await save({ ...data, eodTemplate: sections });
    setDirty(false);
  };

  return (
    <div>
      <Card style={{ padding: "24px 28px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>EOD Template Sections</div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn variant="secondary" size="sm" icon={<I.Plus />} onClick={() => { setDraft({ label: "", emoji: "", defaultContent: "", type: "text" }); setShowAdd(true); }}>Add Section</Btn>
            {dirty && <Btn size="sm" onClick={saveTemplate}>Save Template</Btn>}
          </div>
        </div>
        <p style={{ fontSize: 13, color: C.textSec, margin: "0 0 20px" }}>Define the sections that appear in each daily EOD report. Drag to reorder, edit labels and default content, or add custom sections.</p>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {sections.map((s, i) => (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderRadius: 10, border: `1.5px solid ${editIdx === i ? C.pri : C.border}`, background: editIdx === i ? C.priLt : C.surface, transition: "all 0.15s" }}>
              {editIdx === i ? (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", gap: 10 }}>
                    <div style={{ width: 60 }}><Inp label="Emoji" value={draft.emoji} onChange={v => setDraft({ ...draft, emoji: v })} placeholder="" /></div>
                    <div style={{ flex: 1 }}><Inp label="Section Label" value={draft.label} onChange={v => setDraft({ ...draft, label: v })} /></div>
                  </div>
                  <div style={{ marginBottom: 4 }}>
                    <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: C.textSec, marginBottom: 6, letterSpacing: "0.03em", textTransform: "uppercase" }}>Section Type</span>
                    <div style={{ display: "flex", gap: 6 }}>
                      {[{ v: "text", l: "Free Text" }, { v: "checklist", l: "Checklist" }].map(opt => (
                        <button key={opt.v} onClick={() => setDraft({ ...draft, type: opt.v })} style={{ padding: "6px 14px", borderRadius: 8, border: `1.5px solid ${(draft.type || "text") === opt.v ? C.pri : C.border}`, background: (draft.type || "text") === opt.v ? C.priLt : C.surface, color: (draft.type || "text") === opt.v ? C.pri : C.textSec, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>{opt.v === "checklist" ? "☑ " : "📝 "}{opt.l}</button>
                      ))}
                    </div>
                  </div>
                  <Inp label={(draft.type || "text") === "checklist" ? "Default Items (one per line)" : "Default Content"} type="textarea" value={draft.defaultContent} onChange={v => setDraft({ ...draft, defaultContent: v })} placeholder={(draft.type || "text") === "checklist" ? "One checklist item per line..." : "Pre-filled text for new EOD entries..."} />
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <Btn variant="secondary" size="sm" onClick={cancelEdit}>Cancel</Btn>
                    <Btn size="sm" onClick={saveEdit}>Apply</Btn>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", gap: 4, flexDirection: "column" }}>
                    <button onClick={() => moveSection(i, -1)} disabled={i === 0} style={{ background: "none", border: "none", cursor: i === 0 ? "default" : "pointer", opacity: i === 0 ? 0.3 : 1, fontSize: 11, color: C.textMut, padding: 0, lineHeight: 1 }}>▲</button>
                    <button onClick={() => moveSection(i, 1)} disabled={i === sections.length - 1} style={{ background: "none", border: "none", cursor: i === sections.length - 1 ? "default" : "pointer", opacity: i === sections.length - 1 ? 0.3 : 1, fontSize: 11, color: C.textMut, padding: 0, lineHeight: 1 }}>▼</button>
                  </div>
                  <span style={{ fontSize: 16 }}>{s.emoji}</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{s.title || s.label}</span>
                  {(s.type || "text") === "checklist" && <Badge color="primary" size="sm">☑ Checklist</Badge>}
                  <span style={{ flex: 1 }} />
                  {s.defaultContent && <span style={{ fontSize: 12, color: C.textMut, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.defaultContent}</span>}
                  <button onClick={() => startEdit(i)} style={{ background: "none", border: "none", cursor: "pointer", color: C.pri, fontSize: 12, fontWeight: 600, fontFamily: "inherit", padding: "4px 8px" }}>Edit</button>
                  <button onClick={() => removeSection(i)} style={{ background: "none", border: "none", cursor: "pointer", color: C.dan, fontSize: 12, fontWeight: 600, fontFamily: "inherit", padding: "4px 8px" }}>Remove</button>
                </>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Add Section Modal */}
      {showAdd && <Modal title="Add EOD Section" onClose={() => setShowAdd(false)}>
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <div style={{ width: 80 }}><Inp label="Emoji" value={draft.emoji} onChange={v => setDraft({ ...draft, emoji: v })} placeholder="" /></div>
          <div style={{ flex: 1 }}><Inp label="Section Label" value={draft.label} onChange={v => setDraft({ ...draft, label: v })} placeholder="e.g. Grooming Notes" /></div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: C.textSec, marginBottom: 6, letterSpacing: "0.03em", textTransform: "uppercase" }}>Section Type</span>
          <div style={{ display: "flex", gap: 6 }}>
            {[{ v: "text", l: "Free Text" }, { v: "checklist", l: "Checklist" }].map(opt => (
              <button key={opt.v} onClick={() => setDraft({ ...draft, type: opt.v })} style={{ padding: "6px 14px", borderRadius: 8, border: `1.5px solid ${(draft.type || "text") === opt.v ? C.pri : C.border}`, background: (draft.type || "text") === opt.v ? C.priLt : C.surface, color: (draft.type || "text") === opt.v ? C.pri : C.textSec, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>{opt.v === "checklist" ? "☑ " : "📝 "}{opt.l}</button>
            ))}
          </div>
        </div>
        <Inp label={(draft.type || "text") === "checklist" ? "Default Items (one per line)" : "Default Content (optional)"} type="textarea" value={draft.defaultContent} onChange={v => setDraft({ ...draft, defaultContent: v })} placeholder={(draft.type || "text") === "checklist" ? "One checklist item per line..." : "Pre-filled text for new entries..."} />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
          <Btn variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Btn>
          <Btn onClick={addSection} disabled={!draft.label.trim()}>Add Section</Btn>
        </div>
      </Modal>}
    </div>
  );
}

export { EODTemplateTab };
