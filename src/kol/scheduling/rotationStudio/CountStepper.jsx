import { toCount } from "./rotationStudioStaffing";

export function CountStepper({ label, value, onChange, disabled }) {
  const count = toCount(value);
  return (
    <div className="rotation-count-stepper">
      <div>
        <span className="rotation-count-label">{label}</span>
        <span className="rotation-count-value">{count}</span>
      </div>
      <div className="rotation-count-controls">
        <button type="button" onClick={() => onChange(count - 1)} disabled={disabled || count <= 0} aria-label={`Decrease ${label}`}>
          -
        </button>
        <button type="button" onClick={() => onChange(count + 1)} disabled={disabled || count >= 24} aria-label={`Increase ${label}`}>
          +
        </button>
      </div>
    </div>
  );
}
