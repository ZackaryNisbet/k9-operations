import { useState, useEffect, useMemo, useRef } from 'react';
import { B } from '../../shared/bookingTheme';
import { DEF_BREEDS } from '../constants';

export function BkBreedSearch({ value, onChange, breeds }) {
  const [q, setQ] = useState(value || '');
  const [open, setOpen] = useState(false);
  const [hlIdx, setHlIdx] = useState(0);
  const ref = useRef(null);
  const listRef = useRef(null);
  const allBreeds = breeds && breeds.length > 0 ? breeds : DEF_BREEDS;

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return allBreeds.slice(0, 20);
    return allBreeds.filter(b => b.toLowerCase().includes(s)).slice(0, 20);
  }, [q, allBreeds]);

  useEffect(() => { setHlIdx(0); }, [q]);

  // Sync external value changes (e.g. returning client pre-fill)
  useEffect(() => { if (value !== q) setQ(value || ''); }, [value]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!open || !listRef.current) return;
    const items = listRef.current.children;
    if (items[hlIdx]) items[hlIdx].scrollIntoView({ block: 'nearest' });
  }, [hlIdx, open]);

  const select = (b) => { setQ(b); onChange(b); setOpen(false); };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHlIdx(i => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHlIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && open && filtered.length > 0) { e.preventDefault(); select(filtered[hlIdx]); }
    else if (e.key === 'Escape') { setOpen(false); }
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <label className="bk-label">Breed <span style={{ color: B.err }}>*</span></label>
      <input className="bk-input" value={q}
        onChange={e => { setQ(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)} onKeyDown={handleKeyDown}
        placeholder="Search breeds…"
        autoComplete="off" />
      {open && filtered.length > 0 && (
        <div ref={listRef} style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
          background: '#fff', border: `2px solid ${B.border}`, borderRadius: 12,
          boxShadow: '0 12px 40px rgba(0,0,0,0.12)', zIndex: 100,
          maxHeight: 220, overflow: 'auto'
        }}>
          {filtered.map((b, i) => (
            <button key={b} onClick={() => select(b)} onMouseEnter={() => setHlIdx(i)}
              style={{
                display: 'block', width: '100%', padding: '10px 16px', border: 'none',
                background: hlIdx === i ? B.navy + '10' : 'transparent',
                cursor: 'pointer', fontFamily: "'GT Eesti', sans-serif", textAlign: 'left',
                fontSize: 14, fontWeight: b === 'Unknown / Not Sure' || b === 'Mixed Breed' ? 700 : 500,
                color: hlIdx === i ? B.navy : B.text, transition: 'background 0.1s'
              }}>
              {b === 'Unknown / Not Sure' && <span style={{ color: B.textMut, fontSize: 12 }}>⚡ </span>}{b}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
