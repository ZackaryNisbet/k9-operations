// Inline-editable label for renaming a section/subcategory in Edit Catalog mode.
// Extracted from InventoryPage.jsx.

import React, { useState, useEffect } from "react";
import { C } from "../../../shared/theme";

export function InvEditableLabel({ value, onCommit, style }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  const commit = () => {
    const next = draft.trim();
    if (!next || next === value) { setDraft(value); return; }
    onCommit(next);
  };
  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") { setDraft(value); e.currentTarget.blur(); }
      }}
      style={{ padding: "4px 8px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.surface, outline: "none", fontFamily: "inherit", ...style }}
    />
  );
}
