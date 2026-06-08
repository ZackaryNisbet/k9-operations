// K9 Operations — stateless cell renderers for the client lifecycle list.
// Extracted verbatim from ClientsPage: pure functions of their arguments (no closure
// over page state), kept here to slim the page module. See AGENTS.md for the contract.

import React from "react";
import { C } from "../../../../shared/theme";

// ── Notes cell (shows last log note with date prefix) ──
export const renderNotes = (client, tab) => {
  const updates = client.lifecycle?.[tab]?.updates || [];
  if (updates.length === 0) {
    // For Ignite leads with no updates yet, show the received date from notes field
    if (client.lifecycle?.conversion?.source === "ignite" && client.fields?.notes) {
      return <span style={{fontSize:11,color:"#F97316",fontWeight:600,whiteSpace:"pre-wrap",wordBreak:"break-word",lineHeight:1.4}}>{client.fields.notes}</span>;
    }
    return <span style={{color:C.textMut,fontSize:11}}>—</span>;
  }
  const last = updates[0]; // most recent
  const dateStr = last.loggedAt ? new Date(last.loggedAt).toLocaleDateString("en-US",{month:"numeric",day:"numeric",year:"2-digit"}) : "";
  return <span style={{fontSize:11,color:C.text,whiteSpace:"pre-wrap",wordBreak:"break-word",lineHeight:1.4}}>{dateStr ? `${dateStr}: ` : ""}{last.notes}</span>;
};

// ── Reclassified reason badge ──
export const renderReasonBadge = (reason) => {
  const colors = { "Unresponsive": C.warn, "Uninterested": C.dan, "Spam": "#9333EA", "Other": C.textSec };
  const color = colors[reason] || C.textSec;
  return (
    <span style={{display:"inline-block",padding:"3px 10px",borderRadius:8,fontSize:10,fontWeight:700,background:`${color}15`,color,border:`1.5px solid ${color}30`}}>
      {reason}
    </span>
  );
};
