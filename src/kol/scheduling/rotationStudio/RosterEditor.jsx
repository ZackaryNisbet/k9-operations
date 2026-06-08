import { ROLE_CONFIG } from "./rotationStudioStaffing";

export function RosterEditor({ rows, onChange, disabled }) {
  if (!rows.length) {
    return (
      <div className="rotation-roster-empty">
        Add at least one employee to this shift to enable name and time adjustments.
      </div>
    );
  }
  return (
    <div className="rotation-roster-grid">
      {rows.map((row) => (
        <div key={row.id} className="rotation-roster-row">
          <div className="rotation-roster-role">
            <strong>{row.label}</strong>
            <span>{ROLE_CONFIG.find((role) => role.key === row.roleKey)?.label}</span>
          </div>
          <input
            type="text"
            value={row.name}
            placeholder="Name optional"
            disabled={disabled}
            onChange={(event) => onChange(row.id, { name: event.target.value })}
          />
          <input
            type="time"
            value={row.shift_start}
            disabled={disabled}
            onChange={(event) => onChange(row.id, { shift_start: event.target.value })}
          />
          <input
            type="time"
            value={row.shift_end}
            disabled={disabled}
            onChange={(event) => onChange(row.id, { shift_end: event.target.value })}
          />
        </div>
      ))}
    </div>
  );
}
