import React from "react";
import { I } from "../../../shared/icons";
import { addMonths, getMonthLabel } from "../../enrichments/enrichmentData";

export function Header({ monthDate, setMonthDate, nav, canManage, onNew }) {
  return (
    <div className="page-header">
      <div>
        <button type="button" className="back-link" onClick={() => nav?.("home")}>
          <I.Back /> <span>Home</span>
        </button>
        <div className="eyebrow">K9 Operations Enrichment Portal</div>
        <h1>Enrichment</h1>
        <p>Run today’s dog queue, check the event SOP, and keep calendar planning one click away.</p>
      </div>
      <div className="header-actions">
        <div className="month-control">
          <button type="button" onClick={() => setMonthDate(addMonths(monthDate, -1))}><I.Back /></button>
          <span>{getMonthLabel(monthDate)}</span>
          <button type="button" onClick={() => setMonthDate(addMonths(monthDate, 1))}><I.ChevronRight /></button>
        </div>
        {canManage ? <button type="button" className="primary-btn" onClick={onNew}><I.Plus /> New Event</button> : null}
      </div>
    </div>
  );
}
