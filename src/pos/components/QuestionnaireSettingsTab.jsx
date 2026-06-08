import { Btn, Card } from "./ui";
import { C } from "../constants/colors";
import { DEF_QUESTIONNAIRE } from "../constants/forms";
import { I } from "../icons";
import { useState } from "react";
import { uuid } from "../lib/ids";

function QuestionnaireSettingsTab({ data, save }) {
  const questionnaires = data.questionnaires || [];
  const currentQ = questionnaires.find(q => q.isCurrent) || DEF_QUESTIONNAIRE;
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState(null);

  const startEdit = (qId) => {
    const q = questionnaires.find(x => x.id === qId);
    if (q) {
      setEditingId(qId);
      setEditData(JSON.parse(JSON.stringify(q)));
    }
  };

  const saveEdit = async () => {
    if (!editData) return;
    const updated = questionnaires.map(q => q.id === editingId ? editData : q);
    await save({ ...data, questionnaires: updated });
    setEditingId(null);
    setEditData(null);
  };

  const createNewVersion = async () => {
    const newId = uuid();
    const maxVer = Math.max(0, ...questionnaires.map(q => q.version || 1));
    const newVersion = maxVer + 1;
    const newQ = {
      ...JSON.parse(JSON.stringify(currentQ)),
      id: newId,
      version: newVersion,
      isCurrent: true,
      createdAt: new Date().toISOString(),
    };
    const updated = questionnaires.map(q => ({ ...q, isCurrent: false }));
    updated.push(newQ);
    await save({ ...data, questionnaires: updated });
  };

  const deleteQ = async (qId) => {
    const updated = questionnaires.filter(q => q.id !== qId);
    await save({ ...data, questionnaires: updated });
  };

  const setCurrent = async (qId) => {
    const updated = questionnaires.map(q => ({ ...q, isCurrent: q.id === qId }));
    await save({ ...data, questionnaires: updated });
  };

  // Editor view
  if (editingId && editData) {
    const allSections = [...(editData.clientSections || []), ...(editData.dogSections || [])];
    const updateSection = (sIdx, updates) => {
      const newSections = [...(editData.clientSections || []), ...(editData.dogSections || [])];
      newSections[sIdx] = { ...newSections[sIdx], ...updates };
      const clientCount = editData.clientSections?.length || 0;
      setEditData({
        ...editData,
        clientSections: newSections.slice(0, clientCount),
        dogSections: newSections.slice(clientCount),
      });
    };

    const addQuestion = (sIdx) => {
      const newSections = [...(editData.clientSections || []), ...(editData.dogSections || [])];
      const section = newSections[sIdx];
      const newField = {
        id: `field_${uuid()}`,
        label: "New Question",
        type: "text",
        required: false,
      };
      section.fields = [...(section.fields || []), newField];
      updateSection(sIdx, section);
    };

    const removeQuestion = (sIdx, fIdx) => {
      const newSections = [...(editData.clientSections || []), ...(editData.dogSections || [])];
      const section = newSections[sIdx];
      section.fields = section.fields.filter((_, i) => i !== fIdx);
      updateSection(sIdx, section);
    };

    const updateField = (sIdx, fIdx, updates) => {
      const newSections = [...(editData.clientSections || []), ...(editData.dogSections || [])];
      const section = newSections[sIdx];
      section.fields[fIdx] = { ...section.fields[fIdx], ...updates };
      updateSection(sIdx, section);
    };

    return (
      <div>
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <button onClick={() => { setEditingId(null); setEditData(null); }} style={{ display: "flex", alignItems: "center", gap: 6, border: "none", background: "none", cursor: "pointer", color: C.pri, fontSize: 13, fontWeight: 600, padding: "6px 0", fontFamily: "inherit" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            Back
          </button>
        </div>

        <Card style={{ padding: "24px 28px", marginBottom: 20 }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Questionnaire Title</label>
            <input type="text" value={editData.title || editData.name || ""} onChange={e => setEditData({ ...editData, title: e.target.value, name: e.target.value })} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: C.text, display: "block", marginBottom: 6 }}>Version</label>
            <div style={{ padding: "8px 12px", borderRadius: 8, background: C.bg, fontSize: 14, color: C.text, fontWeight: 600 }}>v{editData.version || 1}</div>
          </div>
        </Card>

        {allSections.map((section, sIdx) => (
          <Card key={section.id} style={{ marginBottom: 16, padding: "20px 24px" }}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: C.textMut, textTransform: "uppercase", display: "block", marginBottom: 4 }}>Section Title</label>
              <input type="text" value={section.title || ""} onChange={e => updateSection(sIdx, { title: e.target.value })} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 14, fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>

            {(section.fields || []).map((field, fIdx) => (
              <div key={field.id} style={{ padding: "12px", marginBottom: 8, background: C.bg, borderRadius: 8, border: `1px solid ${C.border}` }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 150px 80px", gap: 12, marginBottom: 8 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: C.textMut, display: "block", marginBottom: 2 }}>Label</label>
                    <input type="text" value={field.label || ""} onChange={e => updateField(sIdx, fIdx, { label: e.target.value })} style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: "inherit", boxSizing: "border-box" }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: C.textMut, display: "block", marginBottom: 2 }}>Type</label>
                    <select value={field.type || "text"} onChange={e => updateField(sIdx, fIdx, { type: e.target.value })} style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: "inherit", boxSizing: "border-box" }}>
                      <option value="text">Text</option>
                      <option value="textarea">Textarea</option>
                      <option value="select">Select</option>
                      <option value="multiselect">Multi-select</option>
                      <option value="radio">Radio</option>
                      <option value="checkbox">Checkbox</option>
                      <option value="date">Date</option>
                    </select>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end" }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: C.textMut, display: "block", marginBottom: 2, width: "100%" }}>Required</label>
                    <button onClick={() => updateField(sIdx, fIdx, { required: !field.required })} style={{ width: "100%", padding: "6px 10px", borderRadius: 6, background: field.required ? C.pri : C.border, border: "none", color: field.required ? "#fff" : C.text, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                      {field.required ? "Yes" : "No"}
                    </button>
                  </div>
                </div>
                {(field.type === "select" || field.type === "multiselect" || field.type === "radio") && (
                  <div style={{ marginBottom: 8 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: C.textMut, display: "block", marginBottom: 4 }}>Options (comma-separated)</label>
                    <input type="text" value={(field.options || []).join(", ")} onChange={e => updateField(sIdx, fIdx, { options: e.target.value.split(",").map(s => s.trim()).filter(s => s) })} style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 12, fontFamily: "inherit", boxSizing: "border-box" }} placeholder="Option 1, Option 2, Option 3" />
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button onClick={() => removeQuestion(sIdx, fIdx)} style={{ padding: "4px 12px", borderRadius: 6, background: C.danLt, border: "none", color: C.dan, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
            <Btn size="sm" variant="secondary" onClick={() => addQuestion(sIdx)} icon={<I.Plus />}>Add Question</Btn>
          </Card>
        ))}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
          <Btn variant="secondary" onClick={() => { setEditingId(null); setEditData(null); }}>Cancel</Btn>
          <Btn onClick={saveEdit}>Save Changes</Btn>
        </div>
      </div>
    );
  }

  // List view
  return (
    <div>
      <Card style={{ padding: "24px 28px", marginBottom: 20 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 4 }}>Questionnaire Templates</div>
        <div style={{ fontSize: 13, color: C.textSec, marginBottom: 16 }}>Manage and create versions of the "Getting to Know Your Dog" questionnaire.</div>
        <Btn onClick={createNewVersion}>Create New Version</Btn>
      </Card>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {questionnaires.map(q => (
          <Card key={q.id} style={{ padding: "16px 20px", cursor: "pointer" }} onClick={() => startEdit(q.id)}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{q.title || q.name || "Untitled"}</span>
                  <span style={{ fontSize: 12, color: C.textMut }}>v{q.version || 1}</span>
                  {q.isCurrent && <span style={{ padding: "2px 8px", borderRadius: 4, background: C.sucLt, color: C.suc, fontSize: 10, fontWeight: 700 }}>Current</span>}
                </div>
                <div style={{ fontSize: 12, color: C.textSec }}>
                  {((q.clientSections || []).length + (q.dogSections || []).length)} sections,{" "}
                  {((q.clientSections || []).concat(q.dogSections || []).reduce((sum, s) => sum + (s.fields || []).length, 0))} questions
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {!q.isCurrent && (
                  <Btn size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); setCurrent(q.id); }}>
                    Set as Current
                  </Btn>
                )}
                <Btn size="sm" variant="secondary" onClick={(e) => { e.stopPropagation(); deleteQ(q.id); }}>
                  Delete
                </Btn>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export { QuestionnaireSettingsTab };
