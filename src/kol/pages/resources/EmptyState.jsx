// K9 Operations — ResourcesPage EmptyState
// Presentational leaf component extracted verbatim from ResourcesPage.jsx.

import React from "react";
import { C } from "../../../shared/theme";
import { Card } from "../../../shared/ui";

function EmptyState({ title, subtitle }) {
  return (
    <Card style={{ padding: 36, textAlign: "center", color: C.textMut }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 6 }}>{title}</div>
      {subtitle ? <div style={{ fontSize: 13 }}>{subtitle}</div> : null}
    </Card>
  );
}

export default EmptyState;
