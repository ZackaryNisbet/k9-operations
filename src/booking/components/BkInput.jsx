import { B } from '../../shared/bookingTheme';

// ═══════════════════════════════════════════════════════════════════════════
// INPUT COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
// Format raw digits into (xxx) xxx-xxxx
function formatPhoneDisplay(val) {
  const d = (val || '').replace(/\D/g, '').slice(0, 10);
  if (d.length === 0) return '';
  if (d.length <= 3) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0,3)}) ${d.slice(3)}`;
  return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
}

export function BkInput({ label, required, ...props }) {
  // Phone mask: strip non-digits, format as (xxx) xxx-xxxx
  if (props.type === 'tel') {
    const handlePhoneChange = (e) => {
      const raw = e.target.value.replace(/\D/g, '').slice(0, 10);
      // Create a synthetic event-like object with the raw digits
      props.onChange?.({ target: { value: raw } });
    };
    const displayVal = formatPhoneDisplay(props.value);
    return (
      <div>
        {label && <label className="bk-label">{label}{required && <span style={{ color: B.err }}> *</span>}</label>}
        <input className="bk-input" {...props} type="tel" value={displayVal} onChange={handlePhoneChange} placeholder={props.placeholder || '(555) 123-4567'} maxLength={14} />
      </div>
    );
  }
  return (
    <div>
      {label && <label className="bk-label">{label}{required && <span style={{ color: B.err }}> *</span>}</label>}
      <input className="bk-input" {...props} />
    </div>
  );
}
