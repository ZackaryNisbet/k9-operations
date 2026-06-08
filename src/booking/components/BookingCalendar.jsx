import { useState, useEffect, useMemo } from 'react';
import { B } from '../../shared/bookingTheme';

// ═══════════════════════════════════════════════════════════════════════════
// MINI CALENDAR COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export function BookingCalendar({ label, value, onChange, minDate, required }) {
  const today = new Date();
  const minD = minDate ? new Date(minDate + 'T12:00:00') : today;
  const initDate = value ? new Date(value + 'T12:00:00') : today;
  const [month, setMonth] = useState(initDate.getMonth());
  const [year, setYear] = useState(initDate.getFullYear());

  // Update displayed month when value changes externally
  useEffect(() => {
    if (value) {
      const d = new Date(value + 'T12:00:00');
      setMonth(d.getMonth());
      setYear(d.getFullYear());
    }
  }, [value]);

  const days = useMemo(() => {
    const first = new Date(year, month, 1);
    const startDay = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    return cells;
  }, [month, year]);

  const monthLabel = new Date(year, month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const goPrev = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const goNext = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); };

  const isDisabled = (day) => {
    if (!day) return true;
    const d = new Date(year, month, day);
    d.setHours(12, 0, 0, 0);
    const min = new Date(minD);
    min.setHours(0, 0, 0, 0);
    return d < min;
  };

  const isSelected = (day) => {
    if (!day || !value) return false;
    const m = String(month + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return value === `${year}-${m}-${d}`;
  };

  const isToday = (day) => {
    if (!day) return false;
    return day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
  };

  const selectDay = (day) => {
    if (isDisabled(day)) return;
    const m = String(month + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    onChange(`${year}-${m}-${d}`);
  };

  // Prevent going to months before minDate
  const canGoPrev = !(year === minD.getFullYear() && month <= minD.getMonth());

  const DAY_NAMES = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  return (
    <div style={{ textAlign: 'left' }}>
      {label && <label className="bk-label">{label}{required && <span style={{ color: B.err }}> *</span>}</label>}
      <div style={{
        background: B.surface, border: `1.5px solid ${value ? B.gold : B.border}`, borderRadius: 16,
        padding: '16px 18px', minWidth: 260, transition: 'border-color .2s',
      }}>
        {/* Month nav */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <button type="button" onClick={goPrev} disabled={!canGoPrev}
            style={{ background: 'none', border: 'none', cursor: canGoPrev ? 'pointer' : 'default', padding: 4, color: canGoPrev ? B.navy : B.border, fontSize: 18, fontWeight: 700, borderRadius: 8 }}>
            ‹
          </button>
          <span style={{ fontFamily: "'Canela', Georgia, serif", fontSize: 16, fontWeight: 700, color: B.navy }}>{monthLabel}</span>
          <button type="button" onClick={goNext}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: B.navy, fontSize: 18, fontWeight: 700, borderRadius: 8 }}>
            ›
          </button>
        </div>

        {/* Day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
          {DAY_NAMES.map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: B.textMut, padding: '4px 0', textTransform: 'uppercase', letterSpacing: '.05em' }}>{d}</div>
          ))}
        </div>

        {/* Day cells */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
          {days.map((day, i) => {
            const disabled = isDisabled(day);
            const selected = isSelected(day);
            const todayMark = isToday(day);
            return (
              <div key={i}
                onClick={() => day && !disabled && selectDay(day)}
                style={{
                  textAlign: 'center', padding: '8px 0', fontSize: 14, fontWeight: selected ? 700 : 500, borderRadius: 10,
                  cursor: day && !disabled ? 'pointer' : 'default',
                  background: selected ? B.gold : 'transparent',
                  color: selected ? '#fff' : disabled ? B.border : todayMark ? B.gold : B.text,
                  border: todayMark && !selected ? `1.5px solid ${B.gold}` : '1.5px solid transparent',
                  transition: 'all .15s',
                }}>
                {day || ''}
              </div>
            );
          })}
        </div>

        {/* Selected date display */}
        {value && (
          <div style={{ textAlign: 'center', marginTop: 10, fontSize: 13, fontWeight: 600, color: B.navy }}>
            {new Date(value + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
          </div>
        )}
      </div>
    </div>
  );
}
