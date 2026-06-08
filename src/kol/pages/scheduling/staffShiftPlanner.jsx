import React, { useEffect, useMemo, useState } from "react";
import { C } from "../../../shared/theme";
import { Btn } from "../../../shared/ui";
import {
  SHIFT_POSITION_OPTIONS,
  deriveStaffPlanFromShiftEntries,
  getShiftEntries,
} from "../../../shared/schedulingEngine";
import {
  buildRotationTemplateMatches,
  getTemplateDisplayName,
} from "../../scheduling/rotationTemplateMatcher";
import {
  STAFFING_MATRIX_ROLES,
  STAFFING_MATRIX_SHIFTS,
  buildDefaultStaffingMatrix,
  buildShiftEntriesFromStaffingMatrix,
  createDefaultShiftEntry,
} from "./staffingMatrix";

function StaffingMatrixGenerator({ day, rotation, matrixMode, onGenerate, disabled }) {
  const defaultMatrix = useMemo(() => buildDefaultStaffingMatrix(day, rotation), [day?.date, rotation?.shift_recommendations]);
  const [staffingMatrix, setStaffingMatrix] = useState(defaultMatrix);
  const demandDisplay = matrixMode === "projected" ? day?.projectedDisplay : day?.currentDisplay;
  const matches = useMemo(
    () => buildRotationTemplateMatches({
      date: day?.date,
      staffingMatrix,
      demandDisplay,
    }),
    [day?.date, staffingMatrix, demandDisplay],
  );

  useEffect(() => {
    setStaffingMatrix(defaultMatrix);
  }, [defaultMatrix]);

  const inputStyle = {
    width: "100%",
    minWidth: 68,
    padding: "7px 8px",
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 800,
    color: C.text,
    fontFamily: "inherit",
    background: C.surface,
    textAlign: "center",
  };

  const updateCount = (shiftKey, roleKey, value) => {
    const count = Math.max(0, Math.min(24, Math.round(Number(value) || 0)));
    setStaffingMatrix((current) => ({
      ...current,
      [shiftKey]: {
        ...current[shiftKey],
        [roleKey]: count,
      },
    }));
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 580 }}>
          <thead>
            <tr>
              <th style={{ width: 120, padding: "8px 10px", textAlign: "left", borderBottom: `1px solid ${C.border}`, fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.05em", color: C.textMut, background: "#F8FAFC" }}>Shift</th>
              {STAFFING_MATRIX_ROLES.map((role) => (
                <th key={role.key} style={{ padding: "8px 10px", textAlign: "center", borderBottom: `1px solid ${C.border}`, fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.05em", color: C.textMut, background: "#F8FAFC" }}>
                  {role.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {STAFFING_MATRIX_SHIFTS.map((shift) => (
              <tr key={shift.key}>
                <td style={{ padding: "10px", borderBottom: `1px solid ${C.borderLight}`, fontSize: 13, fontWeight: 900, color: C.text }}>
                  {shift.label}
                </td>
                {STAFFING_MATRIX_ROLES.map((role) => (
                  <td key={role.key} style={{ padding: "8px 10px", borderBottom: `1px solid ${C.borderLight}` }}>
                    <input
                      type="number"
                      min="0"
                      max="24"
                      value={staffingMatrix[shift.key]?.[role.key] ?? 0}
                      onChange={(event) => updateCount(shift.key, role.key, event.target.value)}
                      disabled={disabled}
                      style={inputStyle}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 10 }}>
        {STAFFING_MATRIX_SHIFTS.map((shift) => {
          const match = matches[shift.key];
          const template = getTemplateDisplayName(match);
          return (
            <div key={shift.key} style={{ padding: "10px 12px", borderRadius: 10, border: `1px solid ${C.border}`, background: "#F8FAFC" }}>
              <div style={{ fontSize: 11, fontWeight: 900, color: C.text, marginBottom: 4 }}>{shift.label} Template Match</div>
              <div style={{ fontSize: 12, fontWeight: 900, color: match?.template ? C.pri : C.dan }}>
                {match?.template ? `Matched: ${template}` : "No matching template"}
              </div>
              <div style={{ fontSize: 11, color: C.textMut, marginTop: 4, lineHeight: 1.45 }}>
                {match?.template ? `Reason: ${match.explanation}` : match?.explanation}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Btn variant="primary" size="sm" onClick={() => onGenerate(staffingMatrix, matches)} disabled={disabled}>
          Generate From Staffing Matrix
        </Btn>
        <span style={{ fontSize: 11, color: C.textMut, lineHeight: 1.5 }}>
          Names and one-off time changes stay optional and can be adjusted below after generation.
        </span>
      </div>
    </div>
  );
}

export function StaffShiftPlanner({ day, rotation, matrixMode, onSave, onGenerated, disabled }) {
  const existingEntries = useMemo(() => getShiftEntries(day?.staffPlan), [day?.date, day?.staffPlan]);
  const [shiftEntries, setShiftEntries] = useState(existingEntries.length ? existingEntries : [createDefaultShiftEntry(day)]);
  const [dirty, setDirty] = useState(false);

  React.useEffect(() => {
    const nextEntries = existingEntries.length ? existingEntries : [createDefaultShiftEntry(day)];
    setShiftEntries(nextEntries);
    setDirty(false);
  }, [day?.date, day?.staffPlan, existingEntries]);

  const updateEntry = (id, patch) => {
    setShiftEntries((current) => current.map((entry) => entry.id === id ? { ...entry, ...patch } : entry));
    setDirty(true);
  };

  const removeEntry = (id) => {
    setShiftEntries((current) => current.filter((entry) => entry.id !== id));
    setDirty(true);
  };

  const addEntry = () => {
    setShiftEntries((current) => [...current, createDefaultShiftEntry(day)]);
    setDirty(true);
  };

  const buildPlanFromEntries = (entries) => {
    const cleaned = entries
      .map((entry) => ({
        ...entry,
        name: String(entry.name || "").trim(),
        shift_start: String(entry.shift_start || "").slice(0, 5),
        shift_end: String(entry.shift_end || "").slice(0, 5),
      }))
      .filter((entry) => entry.shift_start && entry.shift_end);

    return deriveStaffPlanFromShiftEntries({
      locationId: day?.matrix?.location_id,
      planDate: day.date,
      shiftEntries: cleaned,
    });
  };

  const handleSave = () => {
    const plan = buildPlanFromEntries(shiftEntries);

    onSave(plan);
    setDirty(false);
    onGenerated?.();
  };

  const handleGenerateFromMatrix = (staffingMatrix, templateMatches) => {
    const generatedEntries = buildShiftEntriesFromStaffingMatrix(day, staffingMatrix);
    setShiftEntries(generatedEntries);
    const plan = buildPlanFromEntries(generatedEntries);
    onSave(plan);
    setDirty(false);
    onGenerated?.(templateMatches);
  };

  const inputStyle = {
    width: "100%",
    padding: "6px 8px",
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    fontSize: 12,
    fontFamily: "inherit",
    background: C.surface,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <StaffingMatrixGenerator
        day={day}
        rotation={rotation}
        matrixMode={matrixMode}
        onGenerate={handleGenerateFromMatrix}
        disabled={disabled}
      />
      <div style={{ height: 1, background: C.borderLight, margin: "2px 0" }} />
      <div>
        <div style={{ fontSize: 12, fontWeight: 900, color: C.text, marginBottom: 4 }}>Shift Details</div>
        <div style={{ fontSize: 11, color: C.textMut, lineHeight: 1.45 }}>
          Use this table for optional names, custom roles, and start/end micro-adjustments after the staffing matrix creates the base plan.
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 620 }}>
          <thead>
            <tr>
              {["Position", "Name", "Shift Start", "Shift End", ""].map((label) => (
                <th
                  key={label || "actions"}
                  style={{
                    padding: "8px 10px",
                    textAlign: label === "" ? "right" : "left",
                    borderBottom: `1px solid ${C.border}`,
                    fontSize: 10,
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: C.textMut,
                    background: "#F8FAFC",
                  }}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shiftEntries.map((entry) => (
              <tr key={entry.id}>
                <td style={{ padding: "8px 10px", borderBottom: `1px solid ${C.borderLight}` }}>
                  <select value={entry.position} onChange={(e) => updateEntry(entry.id, { position: e.target.value })} style={inputStyle} disabled={disabled}>
                    {SHIFT_POSITION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </td>
                <td style={{ padding: "8px 10px", borderBottom: `1px solid ${C.borderLight}` }}>
                  <input value={entry.name} onChange={(e) => updateEntry(entry.id, { name: e.target.value })} placeholder="Optional name" style={inputStyle} disabled={disabled} />
                </td>
                <td style={{ padding: "8px 10px", borderBottom: `1px solid ${C.borderLight}` }}>
                  <input type="time" value={entry.shift_start} onChange={(e) => updateEntry(entry.id, { shift_start: e.target.value })} style={inputStyle} disabled={disabled} />
                </td>
                <td style={{ padding: "8px 10px", borderBottom: `1px solid ${C.borderLight}` }}>
                  <input type="time" value={entry.shift_end} onChange={(e) => updateEntry(entry.id, { shift_end: e.target.value })} style={inputStyle} disabled={disabled} />
                </td>
                <td style={{ padding: "8px 10px", borderBottom: `1px solid ${C.borderLight}`, textAlign: "right" }}>
                  <button
                    onClick={() => removeEntry(entry.id)}
                    disabled={disabled || shiftEntries.length === 1}
                    style={{ padding: "6px 10px", border: `1px solid ${C.border}`, borderRadius: 8, background: C.surface, color: C.textMut, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
        <button
          onClick={addEntry}
          disabled={disabled}
          style={{ padding: "6px 12px", border: `1px solid ${C.border}`, borderRadius: 8, background: C.surface, color: C.text, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
        >
          Add Shift
        </button>
        {dirty && <span style={{ fontSize: 11, color: C.warn }}>Unsaved shift edits</span>}
        <div style={{ flex: 1 }} />
        <Btn variant="primary" size="sm" onClick={handleSave} disabled={disabled}>
          Save Shifts & Generate Actual Staffing Schedule
        </Btn>
      </div>
    </div>
  );
}
