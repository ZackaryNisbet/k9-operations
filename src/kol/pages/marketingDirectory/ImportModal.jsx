// Import-from-tracker dialog for the Marketing Directory page
// (src/kol/pages/MarketingDirectoryPage.jsx).
import React, { useState } from "react";
import { C } from "../../../shared/theme";
import { I } from "../../../shared/icons";
import { Btn, Modal } from "../../../shared/ui";
import { StatusPill } from "../../../shared/listSurface";
import { Glyph } from "./Glyph";
import { LABEL_STYLE } from "./styles";

function ImportCandidateRow({ candidate, label, checked, onToggle }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 10, background: checked ? C.priLt : C.surfaceHover, cursor: "pointer", border: `1px solid ${checked ? C.priL : "transparent"}` }}>
      <input type="checkbox" checked={checked} onChange={() => onToggle(candidate.key)} style={{ width: 16, height: 16, accentColor: C.pri }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{candidate.kind === "org" ? candidate.name : candidate.displayName}</div>
        <div style={{ fontSize: 11.5, color: C.textMut }}>{candidate.sourceLabel}{candidate.kind === "org" && candidate.contact ? ` · contact: ${candidate.contact.first_name} ${candidate.contact.last_name}` : ""}</div>
      </div>
      <StatusPill tone={candidate.kind === "org" ? "primary" : "info"}>{label}</StatusPill>
    </label>
  );
}

export function ImportModal({ candidates, saving, onClose, onImport }) {
  const [selected, setSelected] = useState(() => new Set([...candidates.orgs, ...candidates.individuals].map((c) => c.key)));
  const total = candidates.orgs.length + candidates.individuals.length;
  const toggle = (key) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  return (
    <Modal title="Import from marketing tracker" onClose={onClose} wide>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <p style={{ margin: 0, fontSize: 13, color: C.textMut, lineHeight: 1.5 }}>
          These organizers and businesses come from the marketing tracker and aren’t in the directory yet. Imported records stay linked to their tracker entry.
        </p>
        {total === 0 ? (
          <div style={{ padding: "28px 16px", textAlign: "center", color: C.textMut, fontSize: 13 }}>Nothing new to import — the directory is in sync with the tracker.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, maxHeight: "52vh", overflowY: "auto" }}>
            {candidates.orgs.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={LABEL_STYLE}>Organizations ({candidates.orgs.length})</span>
                {candidates.orgs.map((c) => <ImportCandidateRow key={c.key} candidate={c} label={c.org_type || "Business"} checked={selected.has(c.key)} onToggle={toggle} />)}
              </div>
            ) : null}
            {candidates.individuals.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={LABEL_STYLE}>Individuals ({candidates.individuals.length})</span>
                {candidates.individuals.map((c) => <ImportCandidateRow key={c.key} candidate={c} label="Individual" checked={selected.has(c.key)} onToggle={toggle} />)}
              </div>
            ) : null}
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, borderTop: `1px solid ${C.borderLight}`, paddingTop: 16 }}>
          <Btn variant="ghost" onClick={onClose} disabled={saving}>Cancel</Btn>
          <Btn variant="primary" onClick={() => onImport([...candidates.orgs, ...candidates.individuals].filter((c) => selected.has(c.key)))} disabled={saving || selected.size === 0} icon={<Glyph icon={I.Download} size={15} />}>
            {saving ? "Importing…" : `Import ${selected.size}`}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
