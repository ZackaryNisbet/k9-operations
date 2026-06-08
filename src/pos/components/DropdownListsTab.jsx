import { Badge, Btn, Card, Inp } from "./ui";
import { C } from "../constants/colors";
import { DEF_BATH_TYPE_OPTIONS, DEF_BREED_OPTIONS, DEF_FEEDING_INSTRUCTION_OPTIONS, DEF_FEEDING_TIME_OPTIONS, DEF_FEEDING_UNIT_OPTIONS, DEF_FOOD_TYPE_OPTIONS, DEF_MEDICATION_INSTRUCTION_OPTIONS, DEF_MEDICATION_NAME_OPTIONS, DEF_MEDICATION_TIME_OPTIONS, DEF_MEDICATION_UNIT_OPTIONS } from "../constants/dropdowns";
import { useState } from "react";

function DropdownListsTab({ data, save }) {
  const [addInputs, setAddInputs] = useState({});

  const lists = [
    { key: "breedOptions", label: "Dog Breeds", def: DEF_BREED_OPTIONS, desc: "Breeds shown in the searchable breed dropdown on dog profiles." },
    { key: "feedingTimeOptions", label: "Feeding Times", def: DEF_FEEDING_TIME_OPTIONS, desc: "Time slots for feeding schedules." },
    { key: "feedingUnitOptions", label: "Feeding Units", def: DEF_FEEDING_UNIT_OPTIONS, desc: "Units of measurement for food amounts." },
    { key: "foodTypeOptions", label: "Food Types", def: DEF_FOOD_TYPE_OPTIONS, desc: "Types of food available for dogs." },
    { key: "feedingInstructionOptions", label: "Feeding Instructions", def: DEF_FEEDING_INSTRUCTION_OPTIONS, desc: "Special feeding instructions." },
    { key: "medicationUnitOptions", label: "Medication Units", def: DEF_MEDICATION_UNIT_OPTIONS, desc: "Units for medication dosages." },
    { key: "medicationTimeOptions", label: "Medication Times", def: DEF_MEDICATION_TIME_OPTIONS, desc: "Time slots for medication schedules." },
    { key: "medicationNameOptions", label: "Medication Names", def: DEF_MEDICATION_NAME_OPTIONS, desc: "Common medications for quick selection." },
    { key: "medicationInstructionOptions", label: "Medication Instructions", def: DEF_MEDICATION_INSTRUCTION_OPTIONS, desc: "Special instructions for administering medications." },
    { key: "bathTypeOptions", label: "Bath Types", def: DEF_BATH_TYPE_OPTIONS, desc: "Bath service options offered." },
  ];

  const addItem = async (key, def) => {
    const val = (addInputs[key] || "").trim();
    if (!val) return;
    const current = data[key] || def;
    if (current.includes(val)) return;
    await save({ ...data, [key]: [...current, val] });
    setAddInputs(prev => ({ ...prev, [key]: "" }));
  };

  const removeItem = async (key, def, item) => {
    const current = data[key] || def;
    await save({ ...data, [key]: current.filter(x => x !== item) });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {lists.map(list => {
        const items = data[list.key] || list.def;
        const isBreed = list.key === "breedOptions";
        return (
          <Card key={list.key} style={{ padding: "20px 24px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{list.label}</div>
              <Badge>{items.length}</Badge>
            </div>
            <p style={{ fontSize: 12, color: C.textSec, margin: "0 0 12px" }}>{list.desc}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 12, maxHeight: isBreed ? 160 : "none", overflow: isBreed ? "auto" : "visible" }}>
              {items.map(item => (
                <span key={item} style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "3px 10px", borderRadius: 6, background: C.bg, border: `1px solid ${C.borderLight}`, fontSize: 12, fontWeight: 500, color: C.text }}>
                  {item}
                  <button onClick={() => removeItem(list.key, list.def, item)} style={{ background: "none", border: "none", cursor: "pointer", color: C.textMut, padding: 0, display: "inline-flex", marginLeft: 2 }} title="Remove"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
                </span>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <div style={{ flex: 1 }}>
                <Inp label={`Add to ${list.label}`} value={addInputs[list.key] || ""} onChange={v => setAddInputs(prev => ({ ...prev, [list.key]: v }))} placeholder={`New ${list.label.toLowerCase().replace(/s$/, "")}…`} />
              </div>
              <Btn size="sm" onClick={() => addItem(list.key, list.def)}>Add</Btn>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

export { DropdownListsTab };
