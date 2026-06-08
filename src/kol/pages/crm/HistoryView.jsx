// Global change-history view for the CRM page (src/kol/pages/CrmPage.jsx) — the
// Training History tab's exact layout, fed by ignite_lead_updates.
import React from "react";
import { C, fmtDate, fmtDateFull, todayStr } from "../../../shared/theme";
import { I } from "../../../shared/icons";
import { Btn, Badge, Inp, CustomSelect } from "../../../shared/ui";
import { updateTypeLabel } from "../../crmData";
import { fmtDateTime } from "./format";

// The follow-up "state change" — previous date crossed off, pointing to the new
// one (mirrors the Training History status-change pills).
export function CrmHistoryStatusChange({ prev, next }) {
  if (!prev && !next) return <span style={{ color: C.textMut }}>—</span>;
  const pill = (label, struck) => (
    <span style={{ display: "inline-flex", alignItems: "center", borderRadius: 999, border: `1px solid ${struck ? C.border : `${C.pri}40`}`, background: struck ? C.surfaceHover : C.priLt, color: struck ? C.textMut : C.pri, padding: "2px 8px", fontSize: 10.5, fontWeight: 900, textDecoration: struck ? "line-through" : "none", opacity: struck ? 0.72 : 1, whiteSpace: "nowrap" }}>{label}</span>
  );
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      {prev ? pill(fmtDate(prev), true) : null}
      {prev ? <span style={{ color: C.textMut, fontSize: 11, fontWeight: 900 }}>{"->"}</span> : null}
      {next ? pill(fmtDate(next), false) : <span style={{ color: C.textMut }}>—</span>}
    </span>
  );
}

// Global change history — the Training History tab's exact layout: a metrics
// header (changes logged / leads with activity / "N shown"), a filter toolbar
// (Activity Date · Lead · Type · Actor), then a table (When · Lead · Action ·
// Change with the crossed-off follow-up pills · Actor). Fed by ignite_lead_updates.
export function HistoryView({ allRows, rows, filterOptions, filters, onFilter, onClear, filterCount, metrics }) {
  const TH = { padding: "9px 10px", fontSize: 10.5, fontWeight: 900, color: C.textMut, textTransform: "uppercase", letterSpacing: 0, borderBottom: `2px solid ${C.border}`, textAlign: "left", whiteSpace: "nowrap" };
  const TD = { padding: "12px 10px", fontSize: 12.5, lineHeight: 1.35, fontWeight: 700, color: C.text, verticalAlign: "top" };
  const TD2 = { ...TD, color: C.textSec, fontWeight: 650 };
  const metricLabel = { fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em" };
  const metricNum = { fontSize: 22, fontWeight: 900, color: C.text, lineHeight: 1.1 };
  const metricCap = { fontSize: 11, color: C.textMut, fontStyle: "normal" };
  const filterLabel = { fontSize: 10, fontWeight: 700, color: C.textMut, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 };
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", padding: "16px 20px", borderBottom: `1px solid ${C.border}` }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900, color: C.text }}>Change history</div>
          <div style={{ marginTop: 4, fontSize: 12, color: C.textMut, fontWeight: 700 }}>Capture, calls, texts, emails, notes, and follow-up changes across all leads.</div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 22, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <span style={metricLabel}>Changes logged</span>
            <strong style={metricNum}>{metrics.activityCount}</strong>
            <em style={metricCap}>{metrics.date ? fmtDateFull(metrics.date) : "—"}</em>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <span style={metricLabel}>Leads with activity</span>
            <strong style={metricNum}>{metrics.leadCount}</strong>
            <em style={metricCap}>{filters.date ? "selected day" : "latest day"}</em>
          </div>
          <Badge color={rows.length > 0 ? "info" : "default"}>{rows.length} shown</Badge>
        </div>
      </div>
      <div style={{ padding: "12px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(150px, 1fr))", gap: 10, flex: 1, minWidth: 0 }}>
          <Inp label="Activity Date" type="date" value={filters.date} onChange={(v) => onFilter("date", v)} />
          <div>
            <div style={filterLabel}>Lead</div>
            <CustomSelect value={filters.lead} onChange={(v) => onFilter("lead", v)} options={filterOptions.leads} placeholder="All leads" searchable />
          </div>
          <div>
            <div style={filterLabel}>Type</div>
            <CustomSelect value={filters.type} onChange={(v) => onFilter("type", v)} options={filterOptions.types} placeholder="All types" />
          </div>
          <div>
            <div style={filterLabel}>Actor</div>
            <CustomSelect value={filters.actor} onChange={(v) => onFilter("actor", v)} options={filterOptions.actors} placeholder="All actors" searchable />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="ghost" size="sm" icon={<I.Calendar />} onClick={() => onFilter("date", todayStr())}>Today</Btn>
          <Btn variant="ghost" size="sm" onClick={onClear} disabled={filterCount === 0}>Clear Filters{filterCount > 0 ? ` (${filterCount})` : ""}</Btn>
        </div>
      </div>
      {allRows.length === 0 ? (
        <div style={{ padding: 28, textAlign: "center", color: C.textMut, fontSize: 13 }}>No change history yet.</div>
      ) : rows.length === 0 ? (
        <div style={{ padding: 28, textAlign: "center", color: C.textMut, fontSize: 13 }}>No history matches the current filters.</div>
      ) : (
        <div style={{ maxHeight: "70vh", overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={TH}>When</th>
                <th style={TH}>Lead</th>
                <th style={TH}>Action</th>
                <th style={TH}>Change</th>
                <th style={TH}>Actor</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                  <td style={{ ...TD2, whiteSpace: "nowrap" }}>{fmtDateTime(r.createdAt)}</td>
                  <td style={{ ...TD, minWidth: 150 }}>{r.leadName}</td>
                  <td style={{ ...TD, minWidth: 110 }}>{r.system ? "Lead captured" : updateTypeLabel(r.type)}</td>
                  <td style={{ ...TD2, minWidth: 280, lineHeight: 1.45 }}>
                    <div style={{ color: C.text, fontWeight: 800, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{r.notes || "—"}</div>
                    {(r.prevFollowUp || r.newFollowUp) && <div style={{ marginTop: 6 }}><CrmHistoryStatusChange prev={r.prevFollowUp} next={r.newFollowUp} /></div>}
                  </td>
                  <td style={{ ...TD2, whiteSpace: "nowrap" }}>{r.actor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
