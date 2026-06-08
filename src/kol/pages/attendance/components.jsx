import React, { useState } from "react";
import { C } from "../../../shared/theme";
import { Badge, Card } from "../../../shared/ui";
import { I } from "../../../shared/icons";
import { ATTENDANCE_DEFAULT_SORT, ATTENDANCE_ROSTER_SORT_COLUMNS } from "./constants";

export function AttendanceSortControl({ sort, onChange }) {
  const [open, setOpen] = useState(false);
  const activeColumn = ATTENDANCE_ROSTER_SORT_COLUMNS.find((column) => column.key === sort.key) || ATTENDANCE_ROSTER_SORT_COLUMNS[0];
  const isDefault = sort.key === ATTENDANCE_DEFAULT_SORT.key && sort.direction === ATTENDANCE_DEFAULT_SORT.direction;
  const label = isDefault ? `Sort: ${activeColumn.label}` : `Sort: ${activeColumn.label} ${sort.direction === "desc" ? "Descending" : "Ascending"}`;
  return (
    <div className="attendance-sort-control">
      <button type="button" className={`attendance-sort-trigger${open ? " is-open" : ""}${!isDefault ? " is-active" : ""}`} onClick={() => setOpen((prev) => !prev)}>
        <I.SortNone />
        <span>{label}</span>
        <I.ChevronDown />
      </button>
      {open && (
        <div className="attendance-sort-panel">
          <button
            type="button"
            className={`attendance-sort-reset${isDefault ? " is-active" : ""}`}
            onClick={() => {
              onChange(ATTENDANCE_DEFAULT_SORT);
              setOpen(false);
            }}
          >
            Reset to position order
          </button>
          <div className="attendance-sort-options">
            {ATTENDANCE_ROSTER_SORT_COLUMNS.map((column, index) => (
              <div key={column.key} className="attendance-sort-row" style={{ animationDelay: `${index * 28}ms` }}>
                <span>{column.label}</span>
                <div>
                  {["asc", "desc"].map((direction) => (
                    <button
                      key={direction}
                      type="button"
                      className={sort.key === column.key && sort.direction === direction ? "is-active" : ""}
                      onClick={() => {
                        onChange({ key: column.key, direction });
                        setOpen(false);
                      }}
                    >
                      {direction === "desc" ? "Descending" : "Ascending"}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function StatusPill({ active }) {
  return active ? <Badge color="success">Active</Badge> : <Badge color="warning">Inactive</Badge>;
}

export function TypePill({ label, color }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 10px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        background: `${color}18`,
        color,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

export function EmptyState({ title, subtitle }) {
  return (
    <Card style={{ padding: 36, textAlign: "center", color: C.textMut }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 6 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 13 }}>{subtitle}</div>}
    </Card>
  );
}
