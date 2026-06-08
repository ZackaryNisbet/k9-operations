import { Btn } from "./ui";
import { C } from "../constants/colors";
import { useState } from "react";

function DogSelectButtons({ dogs, onSelect }) {
  const [selected, setSelected] = useState(dogs.map(d => d.id));
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
        {dogs.map(d => {
          const isSel = selected.includes(d.id);
          return (
            <button key={d.id} onClick={() => setSelected(prev => isSel ? prev.filter(x => x !== d.id) : [...prev, d.id])}
              style={{ padding: "8px 16px", borderRadius: 10, border: `1.5px solid ${isSel ? C.pri : C.border}`, background: isSel ? C.priLt : C.surface, cursor: "pointer", fontSize: 13, fontWeight: 500, color: isSel ? C.pri : C.text, transition: "all 0.15s", fontFamily: "inherit" }}>
              {isSel && <span style={{ marginRight: 6 }}>&#10003;</span>}{d.name}
            </button>
          );
        })}
      </div>
      {selected.length > 0 && <Btn size="sm" onClick={() => onSelect(selected)}>Select {selected.length} Dog{selected.length > 1 ? "s" : ""}</Btn>}
    </div>
  );
}

export { DogSelectButtons };
