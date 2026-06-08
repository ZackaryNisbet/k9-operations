import { Btn, Card, CustomSelect } from "./ui";
import { C } from "../constants/colors";
import { DEF_QUESTIONNAIRE } from "../constants/forms";
import { I } from "../icons";
import { fmtDate } from "../lib/format";
import { useState } from "react";

function QuestionnaireViewer({ data, save, clientId, dogId, nav }) {
  const client = data.clients.find(c => c.id === clientId);
  const dog = data.dogs.find(d => d.id === dogId);
  const template = data.questionnaireTemplate || DEF_QUESTIONNAIRE;
  const [responses, setResponses] = useState(() => ({ ...(client?.questionnaireResponses || {}), ...(dog?.questionnaireResponses || {}) }));
  const [saving, setSaving] = useState(false);
  const [expandedSections, setExpandedSections] = useState(() => {
    const all = {};
    (template.clientSections || []).forEach(s => { all[s.id] = true; });
    (template.dogSections || []).forEach(s => { all[s.id] = true; });
    return all;
  });

  if (!dog || !client) return <div style={{ padding: 40, textAlign: "center", color: C.textSec }}>Not found</div>;

  const toggleSection = (sid) => setExpandedSections(prev => ({ ...prev, [sid]: !prev[sid] }));

  const setVal = (fieldId, val) => setResponses(prev => ({ ...prev, [fieldId]: val }));

  const toggleMulti = (fieldId, option) => {
    setResponses(prev => {
      const arr = Array.isArray(prev[fieldId]) ? [...prev[fieldId]] : [];
      const idx = arr.indexOf(option);
      if (idx >= 0) arr.splice(idx, 1); else arr.push(option);
      return { ...prev, [fieldId]: arr };
    });
  };

  const shouldShow = (field) => {
    if (!field.showIf) return true;
    return responses[field.showIf.field] === field.showIf.value;
  };

  const handleSave = async () => {
    setSaving(true);
    const clientFieldIds = new Set();
    (template.clientSections || []).forEach(s => s.fields.forEach(f => clientFieldIds.add(f.id)));
    const clientResp = {};
    const dogResp = {};
    Object.entries(responses).forEach(([k, v]) => {
      if (clientFieldIds.has(k)) clientResp[k] = v; else dogResp[k] = v;
    });
    dogResp._completedAt = new Date().toISOString();
    dogResp._completedBy = "Staff";
    await save({
      ...data,
      clients: data.clients.map(c => c.id === clientId ? { ...c, questionnaireResponses: { ...(c.questionnaireResponses || {}), ...clientResp } } : c),
      dogs: data.dogs.map(d => d.id === dogId ? { ...d, questionnaireResponses: dogResp } : d),
    });
    setSaving(false);
    nav("dog-detail", { clientId, dogId });
  };

  const renderField = (field) => {
    if (!shouldShow(field)) return null;
    const val = responses[field.id] || "";
    const inputStyle = { width: "100%", padding: "8px 12px", borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 14, fontFamily: "inherit", background: C.surface, color: C.text };

    if (field.type === "text" || field.type === "phone") {
      return <input type={field.type === "phone" ? "tel" : "text"} value={val} onChange={e => setVal(field.id, e.target.value)} style={inputStyle} placeholder={field.label} />;
    }
    if (field.type === "textarea") {
      return <textarea value={val} onChange={e => setVal(field.id, e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical" }} placeholder="Type here..." />;
    }
    if (field.type === "select") {
      return (
        <CustomSelect value={val} onChange={v => setVal(field.id, v)} options={(field.options||[]).map(o=>({value:o,label:o}))} placeholder="— Select —"/>
      );
    }
    if (field.type === "radio") {
      return (
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {(field.options || []).map(o => (
            <label key={o} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: C.text, cursor: "pointer" }}>
              <input type="radio" name={field.id} checked={val === o} onChange={() => setVal(field.id, o)} />
              {o}
            </label>
          ))}
        </div>
      );
    }
    if (field.type === "multiselect") {
      const selected = Array.isArray(responses[field.id]) ? responses[field.id] : [];
      return (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(field.options || []).map(o => {
            const active = selected.includes(o);
            return (
              <button key={o} onClick={() => toggleMulti(field.id, o)} style={{ padding: "6px 14px", borderRadius: 20, border: `1.5px solid ${active ? C.pri : C.border}`, background: active ? C.priLt : "transparent", color: active ? C.pri : C.text, fontSize: 13, fontWeight: active ? 600 : 400, cursor: "pointer", fontFamily: "inherit" }}>
                {active && <span style={{ marginRight: 4 }}>✓</span>}{o}
              </button>
            );
          })}
        </div>
      );
    }
    if (field.type === "checkbox") {
      const checked = !!responses[field.id];
      return (
        <label style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 14, color: C.text, cursor: "pointer", lineHeight: 1.5 }}>
          <input type="checkbox" checked={checked} onChange={() => setVal(field.id, !checked)} style={{ marginTop: 3, width: 18, height: 18 }} />
          <span>{field.label}</span>
        </label>
      );
    }
    return null;
  };

  const renderSection = (section, idx) => {
    const expanded = expandedSections[section.id] !== false;
    const answeredCount = section.fields.filter(f => shouldShow(f) && responses[f.id] && (Array.isArray(responses[f.id]) ? responses[f.id].length > 0 : true)).length;
    const visibleFields = section.fields.filter(f => shouldShow(f));
    const totalVisible = visibleFields.length;
    const allDone = answeredCount === totalVisible && totalVisible > 0;

    return (
      <Card key={section.id} style={{ marginBottom: 16 }}>
        <button onClick={() => toggleSection(section.id)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, background: allDone ? C.sucLt : C.priLt, color: allDone ? C.suc : C.pri }}>{idx + 1}</div>
            <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{section.title}</span>
            <span style={{ fontSize: 12, color: C.textMut }}>({answeredCount}/{totalVisible})</span>
          </div>
          {expanded ? <I.ChevronDown /> : <I.ChevronRight />}
        </button>
        {expanded && (
          <div style={{ padding: "0 20px 20px" }}>
            {section.fields.map(field => {
              if (!shouldShow(field)) return null;
              return (
                <div key={field.id} style={{ marginBottom: 16 }}>
                  {field.type !== "checkbox" && (
                    <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 6 }}>
                      {field.label}{field.required && <span style={{ color: C.dan, marginLeft: 2 }}>*</span>}
                    </label>
                  )}
                  {renderField(field)}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    );
  };

  const completed = dog.questionnaireResponses?._completedAt;

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      <button onClick={() => nav("dog-detail", { clientId, dogId })} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: C.textSec, fontSize: 14, fontWeight: 600, padding: 0, marginBottom: 20, fontFamily: "inherit" }}><I.Back /> Back to {dog.fields.name}</button>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: C.text }}>{template.name}</h2>
          <p style={{ margin: "4px 0 0", fontSize: 14, color: C.textSec }}>for {dog.fields.name} ({client.fields.first_name} {client.fields.last_name})</p>
        </div>
        {completed && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 8, background: C.sucLt, color: C.suc, fontSize: 13, fontWeight: 600 }}>
            <I.Check /> Completed {fmtDate(completed.slice(0, 10))}
          </div>
        )}
      </div>

      {(template.clientSections || []).length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, paddingLeft: 4 }}>Owner Information (shared across dogs)</div>
          {template.clientSections.map((s, i) => renderSection(s, i))}
        </div>
      )}

      <div style={{ fontSize: 11, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, paddingLeft: 4 }}>Dog-Specific Questions</div>
      {template.dogSections.map((s, i) => renderSection(s, i + (template.clientSections || []).length))}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 24, marginBottom: 40 }}>
        <Btn variant="secondary" onClick={() => nav("dog-detail", { clientId, dogId })}>Cancel</Btn>
        <Btn onClick={handleSave} disabled={saving}>{saving ? "Saving..." : completed ? "Update Responses" : "Save & Complete"}</Btn>
      </div>
    </div>
  );
}

export { QuestionnaireViewer };
