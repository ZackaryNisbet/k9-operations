// Tests for night counting and time calculation logic
// These functions are the foundation of all revenue/accrual calculations

import { describe, it, expect } from 'vitest';

// ─── Extracted from src/shared/theme.js ────────────────────────────────────
const countNights = (ci, co) => {
  const a = new Date(ci + "T12:00:00"), b = new Date(co + "T12:00:00");
  return Math.max(0, Math.round((b - a) / 86400000));
};

const countHours = (tIn, tOut) => {
  if (!tIn || !tOut) return 8;
  const [h1, m1] = tIn.split(":").map(Number);
  const [h2, m2] = tOut.split(":").map(Number);
  return Math.max(0, (h2 * 60 + m2 - h1 * 60 - m1) / 60);
};

const addDays = (d, n) => {
  const dt = new Date(d + "T12:00:00");
  dt.setDate(dt.getDate() + n);
  return dt.toISOString().split("T")[0];
};

// ─── countNights Tests ─────────────────────────────────────────────────────

describe('countNights', () => {
  describe('typical boarding stays', () => {
    it('counts a single night stay', () => {
      expect(countNights('2026-03-01', '2026-03-02')).toBe(1);
    });

    it('counts a 2-night weekend stay', () => {
      expect(countNights('2026-03-06', '2026-03-08')).toBe(2);
    });

    it('counts a typical week-long stay (7 nights)', () => {
      expect(countNights('2026-03-01', '2026-03-08')).toBe(7);
    });

    it('counts a 2-week stay (14 nights)', () => {
      expect(countNights('2026-03-01', '2026-03-15')).toBe(14);
    });

    it('counts a 30-day long stay', () => {
      expect(countNights('2026-03-01', '2026-03-31')).toBe(30);
    });
  });

  describe('edge cases', () => {
    it('returns 0 for same-day check-in/out (no overnight stay)', () => {
      expect(countNights('2026-03-15', '2026-03-15')).toBe(0);
    });

    it('returns 0 when check-out is before check-in (invalid range)', () => {
      expect(countNights('2026-03-15', '2026-03-10')).toBe(0);
    });

    it('handles month boundaries correctly', () => {
      // Jan 30 → Feb 2 = 3 nights
      expect(countNights('2026-01-30', '2026-02-02')).toBe(3);
    });

    it('handles year boundaries correctly', () => {
      // Dec 30 → Jan 2 = 3 nights
      expect(countNights('2025-12-30', '2026-01-02')).toBe(3);
    });

    it('handles February in a non-leap year', () => {
      // Feb 27 → Mar 2 = 3 nights (2026 is not a leap year)
      expect(countNights('2026-02-27', '2026-03-02')).toBe(3);
    });

    it('handles February in a leap year', () => {
      // Feb 27 → Mar 1 = 2 nights in leap year 2028
      expect(countNights('2028-02-27', '2028-03-01')).toBe(3);
    });

    it('handles very long stays (90+ days)', () => {
      expect(countNights('2026-01-01', '2026-04-01')).toBe(90);
    });
  });

  describe('DST transitions', () => {
    it('handles spring forward (March DST)', () => {
      // DST typically happens in March — the T12:00:00 anchoring should prevent off-by-one
      expect(countNights('2026-03-07', '2026-03-09')).toBe(2);
    });

    it('handles fall back (November DST)', () => {
      expect(countNights('2026-11-01', '2026-11-03')).toBe(2);
    });
  });
});

// ─── countHours Tests ──────────────────────────────────────────────────────

describe('countHours', () => {
  describe('typical daycare hours', () => {
    it('calculates a full 8-hour day (7am to 3pm)', () => {
      expect(countHours('07:00', '15:00')).toBe(8);
    });

    it('calculates a half day (7am to 12pm)', () => {
      expect(countHours('07:00', '12:00')).toBe(5);
    });

    it('calculates a long day (6am to 6pm)', () => {
      expect(countHours('06:00', '18:00')).toBe(12);
    });

    it('calculates a short visit (9am to 11am)', () => {
      expect(countHours('09:00', '11:00')).toBe(2);
    });
  });

  describe('fractional hours', () => {
    it('calculates 7:00 to 10:30 as 3.5 hours', () => {
      expect(countHours('07:00', '10:30')).toBe(3.5);
    });

    it('calculates 8:15 to 16:45 as 8.5 hours', () => {
      expect(countHours('08:15', '16:45')).toBe(8.5);
    });

    it('calculates 9:00 to 9:15 as 0.25 hours', () => {
      expect(countHours('09:00', '09:15')).toBe(0.25);
    });
  });

  describe('default behavior', () => {
    it('returns 8 when both times are null', () => {
      expect(countHours(null, null)).toBe(8);
    });

    it('returns 8 when check-in is null', () => {
      expect(countHours(null, '15:00')).toBe(8);
    });

    it('returns 8 when check-out is null', () => {
      expect(countHours('07:00', null)).toBe(8);
    });

    it('returns 8 when both times are undefined', () => {
      expect(countHours(undefined, undefined)).toBe(8);
    });

    it('returns 8 when both times are empty strings', () => {
      expect(countHours('', '')).toBe(8);
    });
  });

  describe('edge cases', () => {
    it('returns 0 when check-in equals check-out', () => {
      expect(countHours('12:00', '12:00')).toBe(0);
    });

    it('returns 0 when check-out is before check-in (negative prevented)', () => {
      expect(countHours('15:00', '07:00')).toBe(0);
    });

    it('handles midnight correctly (00:00 to 08:00)', () => {
      expect(countHours('00:00', '08:00')).toBe(8);
    });

    it('handles late hours (20:00 to 23:00)', () => {
      expect(countHours('20:00', '23:00')).toBe(3);
    });
  });
});

// ─── addDays Tests ─────────────────────────────────────────────────────────

describe('addDays', () => {
  it('adds 1 day correctly', () => {
    expect(addDays('2026-03-15', 1)).toBe('2026-03-16');
  });

  it('adds 7 days correctly', () => {
    expect(addDays('2026-03-01', 7)).toBe('2026-03-08');
  });

  it('subtracts 1 day correctly (negative)', () => {
    expect(addDays('2026-03-15', -1)).toBe('2026-03-14');
  });

  it('handles month rollover', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
  });

  it('handles year rollover', () => {
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01');
  });

  it('handles February end in non-leap year', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('handles February end in leap year', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2028-02-29', 1)).toBe('2028-03-01');
  });

  it('adds 0 days (no change)', () => {
    expect(addDays('2026-03-15', 0)).toBe('2026-03-15');
  });

  it('adds 30 days', () => {
    expect(addDays('2026-03-01', 30)).toBe('2026-03-31');
  });

  it('subtracts 30 days', () => {
    expect(addDays('2026-03-31', -30)).toBe('2026-03-01');
  });
});
