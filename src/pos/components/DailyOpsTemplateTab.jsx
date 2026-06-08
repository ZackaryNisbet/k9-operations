import { Badge, Btn, Card, CustomSelect } from "./ui";
import { C } from "../constants/colors";
import { DAY_NAMES_SHORT, DEF_BE_TEMPLATE, DEF_CLOSING_TEMPLATE, DEF_FE_TEMPLATE, DEF_OPENING_TEMPLATE } from "../constants/operations";
import { I } from "../icons";
import { gid } from "../lib/format";
import { useEffect, useState } from "react";

function DailyOpsTemplateTab({ data, save }) {
  const types = [
    { key: "openingTemplate", def: DEF_OPENING_TEMPLATE, label: "Opening", hasTime: false },
    { key: "feTemplate", def: DEF_FE_TEMPLATE, label: "FE Checklist", hasTime: true },
    { key: "beTemplate", def: DEF_BE_TEMPLATE, label: "BE Checklist", hasTime: true },
    { key: "closingTemplate", def: DEF_CLOSING_TEMPLATE, label: "Closing", hasTime: false },
  ];
  const [selType, setSelType] = useState(0);
  const t = types[selType];
  const [items, setItems] = useState(() => (data[t.key] || t.def).map(x => ({ ...x })));
  const [editIdx, setEditIdx] = useState(-1);
  const [draft, setDraft] = useState({ label: "", time: "", dayOfWeek: null });
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setItems((data[t.key] || t.def).map(x => ({ ...x })));
    setEditIdx(-1);
    setDirty(false);
  }, [selType, data]);

  const saveTemplate = async () => {
    await save({ ...data, [t.key]: items });
    setDirty(false);
  };

  const startEdit = (i) => { setEditIdx(i); setDraft({ label: items[i].label, time: items[i].time || "", dayOfWeek: items[i].dayOfWeek ?? null }); };
  const cancelEdit = () => setEditIdx(-1);
  const confirmEdit = () => { const nItems = [...items]; nItems[editIdx] = { ...nItems[editIdx], label: draft.label, time: draft.time || undefined, dayOfWeek: draft.dayOfWeek }; setItems(nItems); setEditIdx(-1); setDirty(true); };
  const moveItem = (i, dir) => { const nItems = [...items]; const [moved] = nItems.splice(i, 1); nItems.splice(i + dir, 0, moved); setItems(nItems); setDirty(true); };
  const deleteItem = (i) => { setItems(items.filter((_, j) => j !== i)); setDirty(true); };
  const addItem = () => { setItems([...items, { id: "custom_" + gid(), label: "New item", time: t.hasTime ? "" : undefined, dayOfWeek: null }]); setDirty(true); };

  return (
    <div>
      {/* Type selector */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16, background: C.surfaceHover, padding: 4, borderRadius: 10, width: "fit-content" }}>
        {types.map((tp, i) => (<button key={i} onClick={() => setSelType(i)} style={{ padding: "6px 16px", borderRadius: 8, border: "none", background: selType === i ? C.surface : "transparent", color: selType === i ? C.text : C.textSec, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", boxShadow: selType === i ? "0 1px 3px rgba(0,0,0,0.08)" : "none" }}>{tp.label}</button>))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{items.length} items</span>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn size="sm" onClick={addItem} icon={<I.Plus />}>Add Item</Btn>
          {dirty && <Btn size="sm" onClick={saveTemplate}>Save Template</Btn>}
        </div>
      </div>
      <Card>
        {items.map((item, i) => (
          <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: i < items.length - 1 ? `1px solid ${C.border}` : "none" }}>
            {editIdx === i ? (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {t.hasTime && <input type="text" value={draft.time} onChange={e => setDraft({ ...draft, time: e.target.value })} placeholder="HH:MM" style={{ width: 70, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 8px", fontSize: 12, fontFamily: "inherit" }} />}
                  <input type="text" value={draft.label} onChange={e => setDraft({ ...draft, label: e.target.value })} style={{ flex: 1, border: `1px solid ${C.border}`, borderRadius: 6, padding: "6px 8px", fontSize: 12, fontFamily: "inherit" }} />
                  {t.hasTime && <CustomSelect value={String(draft.dayOfWeek ?? "")} onChange={v=>setDraft({...draft,dayOfWeek:v===""?null:Number(v)})} options={[{value:"",label:"Daily"},...DAY_NAMES_SHORT.map((d,di)=>({value:String(di),label:d}))]} small style={{width:90}}/>}
                </div>
                <div style={{ display: "flex", gap: 6 }}><Btn size="sm" onClick={confirmEdit}>Save</Btn><Btn size="sm" variant="secondary" onClick={cancelEdit}>Cancel</Btn></div>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
                  <button onClick={() => i > 0 && moveItem(i, -1)} disabled={i === 0} style={{ border: "none", background: "none", cursor: i > 0 ? "pointer" : "default", padding: 0, color: i > 0 ? C.textMut : C.surfaceHover, fontSize: 10 }}>▲</button>
                  <button onClick={() => i < items.length - 1 && moveItem(i, 1)} disabled={i === items.length - 1} style={{ border: "none", background: "none", cursor: i < items.length - 1 ? "pointer" : "default", padding: 0, color: i < items.length - 1 ? C.textMut : C.surfaceHover, fontSize: 10 }}>▼</button>
                </div>
                {t.hasTime && <span style={{ width: 50, fontSize: 11, fontWeight: 600, color: item.time ? C.pri : C.textMut, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{item.time || "—"}</span>}
                <span style={{ flex: 1, fontSize: 12, color: C.text }}>{item.label}</span>
                {item.dayOfWeek != null && <Badge color="accent" size="sm">{DAY_NAMES_SHORT[item.dayOfWeek]}</Badge>}
                <button onClick={() => startEdit(i)} style={{ border: "none", background: "none", cursor: "pointer", color: C.textMut, padding: 2 }}><I.Edit /></button>
                <button onClick={() => deleteItem(i)} style={{ border: "none", background: "none", cursor: "pointer", color: C.dan, padding: 2 }}><I.Trash /></button>
              </>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}

export { DailyOpsTemplateTab };
