import { Btn, Card } from "./ui";
import { C } from "../constants/colors";
import { I } from "../icons";
import { gid } from "../lib/format";
import { useState } from "react";

function MessageTemplatesTab({ data, save }) {
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editBody, setEditBody] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const templates = data.messageTemplates || [];

  const VARIABLES = [
    { tag: "{clientName}", desc: "Client's full name" },
    { tag: "{clientFirstName}", desc: "Client's first name only" },
    { tag: "{clientLastName}", desc: "Client's last name only" },
    { tag: "{dogName}", desc: "Smart dog names (uses 'and' / commas)" },
    { tag: "{checkInDate}", desc: "Check-in date (formatted)" },
    { tag: "{checkInTime}", desc: "Check-in time" },
    { tag: "{checkOutDate}", desc: "Check-out date (formatted)" },
    { tag: "{checkOutTime}", desc: "Check-out time" },
    { tag: "{roomType}", desc: "Room type name (e.g., Executive Suite)" },
    { tag: "{roomNumber}", desc: "Specific room number" },
    { tag: "{servicetype}", desc: "Service type (boarding, daycare, evaluation)" },
    { tag: "{totalPrice}", desc: "Reservation total price" },
    { tag: "{depositRequired}", desc: "Deposit amount required" },
    { tag: "{depositCollected}", desc: "Deposit amount collected" },
    { tag: "{daycareDogCount}", desc: "Number of dogs in daycare group" },
    { tag: "{notes}", desc: "General reservation notes" },
    { tag: "{specialInstructions}", desc: "Special care instructions" },
  ];

  const startEdit = (tpl) => { setEditId(tpl.id); setEditName(tpl.name); setEditBody(tpl.body); };
  const cancelEdit = () => { setEditId(null); setEditName(""); setEditBody(""); setShowCreate(false); };

  const saveTemplate = async () => {
    if (!editName.trim() || !editBody.trim()) return;
    if (showCreate) {
      const newTpl = { id: gid(), name: editName.trim(), body: editBody.trim(), active: true };
      await save({ ...data, messageTemplates: [...templates, newTpl] });
    } else {
      await save({ ...data, messageTemplates: templates.map(t => t.id === editId ? { ...t, name: editName.trim(), body: editBody.trim() } : t) });
    }
    cancelEdit();
  };

  const toggleActive = async (id) => {
    await save({ ...data, messageTemplates: templates.map(t => t.id === id ? { ...t, active: !t.active } : t) });
  };

  const deleteTemplate = async (id) => {
    await save({ ...data, messageTemplates: templates.filter(t => t.id !== id) });
  };

  const insertVar = (tag) => {
    setEditBody(prev => prev + tag);
  };

  const isEditing = editId || showCreate;

  return (<>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>Message Templates</div>
        <div style={{ fontSize: 12, color: C.textSec, marginTop: 2 }}>Create and customize text message templates with smart variables</div>
      </div>
      {!isEditing && <Btn size="sm" onClick={() => { setShowCreate(true); setEditId(null); setEditName(""); setEditBody(""); }}>+ New Template</Btn>}
    </div>

    {/* Variable reference */}
    <Card style={{ padding: "12px 16px", marginBottom: 16, background: C.bg }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 8 }}>Available Variables</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {VARIABLES.map(v => (
          <div key={v.tag} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
            <code style={{ background: C.priLt, color: C.pri, padding: "2px 6px", borderRadius: 4, fontWeight: 600, fontSize: 11 }}>{v.tag}</code>
            <span style={{ color: C.textSec }}>{v.desc}</span>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: C.textMut, fontStyle: "italic" }}>
        Tip: {"{dogName}"} is smart — it handles grammar automatically: "Fluffy" for one dog, "Fluffy and Ginger" for two, "Fluffy, Ginger, and Darnell" for three+
      </div>
    </Card>

    {/* Edit/Create form */}
    {isEditing && (
      <Card style={{ padding: 16, marginBottom: 16, border: `1.5px solid ${C.pri}` }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 12 }}>{showCreate ? "Create Template" : "Edit Template"}</div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.textSec, marginBottom: 4 }}>Template Name</label>
          <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="e.g. Booking Confirmation" style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box", background: C.surface, color: C.text }} />
        </div>
        <div style={{ marginBottom: 8 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.textSec, marginBottom: 4 }}>Message Body</label>
          <textarea value={editBody} onChange={e => setEditBody(e.target.value)} placeholder="Hi {clientName}! We're excited to see {dogName}..." rows={5} style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1.5px solid ${C.border}`, fontSize: 13, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box", background: C.surface, color: C.text }} />
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 12 }}>
          {VARIABLES.map(v => (
            <button key={v.tag} onClick={() => insertVar(v.tag)} style={{ padding: "3px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.pri, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{v.tag}</button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: C.textMut, marginBottom: 12 }}>Character count: {editBody.length}</div>
        {editBody && (
          <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 8, background: C.bg, border: `1px solid ${C.borderLight}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.textSec, marginBottom: 4, textTransform: "uppercase" }}>Preview</div>
            <div style={{ fontSize: 12, color: C.text }}>{editBody.replace(/\{clientName\}/g, "Jane Vance").replace(/\{dogName\}/g, "Buddy and Max").replace(/\{checkInDate\}/g, "Mar 15").replace(/\{checkOutDate\}/g, "Mar 20").replace(/\{roomType\}/g, "Executive Suite").replace(/\{totalPrice\}/g, "450.00")}</div>
          </div>
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Btn variant="ghost" size="sm" onClick={cancelEdit}>Cancel</Btn>
          <Btn size="sm" onClick={saveTemplate} disabled={!editName.trim() || !editBody.trim()}>Save Template</Btn>
        </div>
      </Card>
    )}

    {/* Template list */}
    {templates.length === 0 && !isEditing ? (
      <Card style={{ padding: "40px 20px", textAlign: "center" }}>
        <I.MessageSquare style={{ width: 32, height: 32, color: C.textMut, marginBottom: 8 }} />
        <div style={{ fontSize: 14, fontWeight: 600, color: C.textSec }}>No templates yet</div>
        <div style={{ fontSize: 12, color: C.textMut, marginTop: 4 }}>Create your first message template to get started</div>
      </Card>
    ) : (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {templates.map(tpl => (
          <Card key={tpl.id} style={{ padding: "14px 16px", opacity: tpl.active === false ? 0.5 : 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{tpl.name}</div>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 10, background: tpl.active !== false ? C.sucLt : C.bg, color: tpl.active !== false ? C.suc : C.textMut }}>{tpl.active !== false ? "Active" : "Inactive"}</span>
                </div>
                <div style={{ fontSize: 12, color: C.textSec, lineHeight: 1.5 }}>{tpl.body}</div>
              </div>
              <div style={{ display: "flex", gap: 4, marginLeft: 12, flexShrink: 0 }}>
                <button onClick={() => toggleActive(tpl.id)} style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: C.textMut, fontSize: 10, cursor: "pointer", fontFamily: "inherit" }}>{tpl.active !== false ? "Disable" : "Enable"}</button>
                <button onClick={() => startEdit(tpl)} style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: C.pri, fontSize: 10, cursor: "pointer", fontFamily: "inherit" }}>Edit</button>
                <button onClick={() => deleteTemplate(tpl.id)} style={{ padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: C.dan, fontSize: 10, cursor: "pointer", fontFamily: "inherit" }}>Delete</button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    )}
  </>);
}

export { MessageTemplatesTab };
