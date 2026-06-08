import { B } from '../../shared/bookingTheme';

export function BkSelect({ label, required, options, ...props }) {
  return (
    <div>
      {label && <label className="bk-label">{label}{required && <span style={{ color: B.err }}> *</span>}</label>}
      <select className="bk-input" style={{ cursor: 'pointer' }} {...props}>
        <option value="">Select...</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}
