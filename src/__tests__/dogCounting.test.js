// Tests for dog counting, attendance, and classification logic
// Extracted from opsHelpers.js and reportHelpers.js

import { describe, it, expect } from 'vitest';

// ─── Reservation Type Classification (from opsHelpers.js) ──────────────────
function classifyReservationType(typeName) {
  if (!typeName) return "other";
  const t = typeName.toLowerCase();
  if (t.includes("evaluation") || t.includes("eval")) return "evaluation";
  if (t.includes("tour")) return "tour";
  if (t.includes("day boarding") || t === "day boarding") return "dayboarding";
  if (t.includes("daycare") || t.includes("day care")) return "daycare";
  if (t.includes("boarding")) return "boarding";
  if (t.includes("groom") || t.includes("bath")) return "grooming";
  return "other";
}

// ─── Reservation Status Classification (from opsHelpers.js) ────────────────
function classifyReservationStatus(r) {
  if (r.cancelled_date) return "cancelled";
  if (r.check_in_date && r.check_out_date) return "checked-out";
  if (r.check_in_date && !r.check_out_date) return "checked-in";
  const now = new Date();
  const start = r.start_date ? new Date(r.start_date) : null;
  if (start && start > now) return "upcoming";
  return "checked-out";
}

// ─── Room Extraction (from opsHelpers.js) ──────────────────────────────────
const ROOM_TYPES = ["Luxury Suite", "Executive Room", "Double Compartment", "Single Compartment"];

function extractRoomFromType(typeName) {
  if (!typeName) return null;
  for (const rt of ROOM_TYPES) {
    if (typeName.toLowerCase().includes(rt.toLowerCase())) return rt;
  }
  return null;
}

// ─── Active Dog Counting (from reportHelpers.js) ──────────────────────────
function countActiveDogs(reservations, date) {
  const activeBoarding = reservations.filter(
    (r) =>
      r.type === "boarding" && (
        (r.status === "checked-in") ||
        (r.status === "upcoming" && (r.scheduledCheckIn || r.checkIn) <= date && (r.scheduledCheckOut || r.checkOut) >= date)
      )
  );
  const activeDaycare = reservations.filter(
    (r) =>
      r.type === "daycare" && (
        (r.status === "checked-in") ||
        (r.status === "upcoming" && (r.scheduledCheckIn || r.checkIn) <= date && (r.scheduledCheckOut || r.checkOut) >= date)
      )
  );
  return {
    boardingCount: activeBoarding.length,
    daycareCount: activeDaycare.length,
    attendanceCount: activeBoarding.length + activeDaycare.length,
  };
}

// ─── PP (Private Play) Stats (from opsHelpers.js) ─────────────────────────
function resSvcIncludes(res, partial) {
  const svcs = res._services;
  if (!svcs) return false;
  const arr = Array.isArray(svcs) ? svcs : [];
  return arr.some(s => {
    const name = typeof s === "string" ? s : (s && s.name ? s.name : "");
    return name.toLowerCase().includes(partial.toLowerCase());
  });
}

function getPPStats(reservations, date) {
  const td = date;
  const ppRes = reservations.filter(r =>
    (r.type === "boarding" || r.type === "daycare" || r.type === "dayboarding") &&
    r.status === "checked-in" &&
    r.checkIn <= td && r.checkOut >= td &&
    (resSvcIncludes(r, "Private Play") || r.type === "dayboarding")
  );
  const totalDogs = ppRes.length;
  const requiredSessions = totalDogs * 3; // 3 required let-outs per dog
  return { totalDogs, requiredSessions };
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

describe('classifyReservationType', () => {
  describe('boarding types', () => {
    it('classifies standard boarding', () => {
      expect(classifyReservationType('Boarding')).toBe('boarding');
    });

    it('classifies boarding with room type', () => {
      expect(classifyReservationType('Boarding | Luxury Suite (All Inclusive)')).toBe('boarding');
    });

    it('classifies boarding with various casing', () => {
      expect(classifyReservationType('BOARDING')).toBe('boarding');
      expect(classifyReservationType('boarding')).toBe('boarding');
    });
  });

  describe('daycare types', () => {
    it('classifies standard daycare', () => {
      expect(classifyReservationType('Daycare')).toBe('daycare');
    });

    it('classifies day care (with space)', () => {
      expect(classifyReservationType('Day Care')).toBe('daycare');
    });

    it('classifies daycare with additional details', () => {
      expect(classifyReservationType('Full Day Daycare')).toBe('daycare');
    });
  });

  describe('day boarding', () => {
    it('classifies day boarding', () => {
      expect(classifyReservationType('Day Boarding')).toBe('dayboarding');
    });

    it('classifies exact match "day boarding"', () => {
      expect(classifyReservationType('day boarding')).toBe('dayboarding');
    });

    it('day boarding takes priority over plain boarding', () => {
      // "day boarding" includes "boarding" but should match "day boarding" first
      expect(classifyReservationType('Day Boarding Special')).toBe('dayboarding');
    });
  });

  describe('evaluation types', () => {
    it('classifies evaluation', () => {
      expect(classifyReservationType('Evaluation')).toBe('evaluation');
    });

    it('classifies eval shorthand', () => {
      expect(classifyReservationType('Eval')).toBe('evaluation');
    });

    it('classifies evaluation with details', () => {
      expect(classifyReservationType('Daycare Evaluation')).toBe('evaluation');
    });
  });

  describe('tour types', () => {
    it('classifies tour', () => {
      expect(classifyReservationType('Tour')).toBe('tour');
    });

    it('classifies facility tour', () => {
      expect(classifyReservationType('Facility Tour')).toBe('tour');
    });
  });

  describe('grooming types', () => {
    it('classifies grooming', () => {
      expect(classifyReservationType('Grooming')).toBe('grooming');
    });

    it('classifies bath', () => {
      expect(classifyReservationType('Bath')).toBe('grooming');
    });

    it('classifies full groom', () => {
      expect(classifyReservationType('Full Groom Package')).toBe('grooming');
    });
  });

  describe('edge cases', () => {
    it('returns other for null', () => {
      expect(classifyReservationType(null)).toBe('other');
    });

    it('returns other for undefined', () => {
      expect(classifyReservationType(undefined)).toBe('other');
    });

    it('returns other for empty string', () => {
      expect(classifyReservationType('')).toBe('other');
    });

    it('returns other for unrecognized types', () => {
      expect(classifyReservationType('Walking Service')).toBe('other');
    });
  });
});

describe('classifyReservationStatus', () => {
  it('classifies cancelled reservation', () => {
    expect(classifyReservationStatus({ cancelled_date: '2026-03-10' })).toBe('cancelled');
  });

  it('classifies checked-out reservation (both dates present)', () => {
    expect(classifyReservationStatus({
      check_in_date: '2026-03-01', check_out_date: '2026-03-04',
    })).toBe('checked-out');
  });

  it('classifies checked-in reservation (no check-out)', () => {
    expect(classifyReservationStatus({
      check_in_date: '2026-03-01',
    })).toBe('checked-in');
  });

  it('classifies upcoming reservation (future start date)', () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);
    expect(classifyReservationStatus({
      start_date: futureDate.toISOString().split('T')[0],
    })).toBe('upcoming');
  });

  it('defaults to checked-out for past reservation with no dates', () => {
    expect(classifyReservationStatus({})).toBe('checked-out');
  });

  it('cancelled takes priority over checked-in', () => {
    expect(classifyReservationStatus({
      cancelled_date: '2026-03-05', check_in_date: '2026-03-01',
    })).toBe('cancelled');
  });

  it('cancelled takes priority over checked-out', () => {
    expect(classifyReservationStatus({
      cancelled_date: '2026-03-05',
      check_in_date: '2026-03-01',
      check_out_date: '2026-03-04',
    })).toBe('cancelled');
  });
});

describe('extractRoomFromType', () => {
  it('extracts Luxury Suite from full type name', () => {
    expect(extractRoomFromType('Boarding | Luxury Suite (All Inclusive)')).toBe('Luxury Suite');
  });

  it('extracts Executive Room from full type name', () => {
    expect(extractRoomFromType('Boarding | Executive Room (All Inclusive)')).toBe('Executive Room');
  });

  it('extracts Double Compartment', () => {
    expect(extractRoomFromType('Boarding | Double Compartment (All Inclusive)')).toBe('Double Compartment');
  });

  it('extracts Single Compartment', () => {
    expect(extractRoomFromType('Boarding | Single Compartment (All Inclusive)')).toBe('Single Compartment');
  });

  it('returns null for unknown room type', () => {
    expect(extractRoomFromType('Daycare | Full Day')).toBeNull();
  });

  it('returns null for null input', () => {
    expect(extractRoomFromType(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(extractRoomFromType(undefined)).toBeNull();
  });

  it('is case insensitive', () => {
    expect(extractRoomFromType('boarding | luxury suite')).toBe('Luxury Suite');
  });
});

describe('Active Dog Counting', () => {
  describe('boarding dogs', () => {
    it('counts checked-in boarding dogs', () => {
      const reservations = [
        { type: 'boarding', status: 'checked-in', checkIn: '2026-03-01', checkOut: '2026-03-04' },
        { type: 'boarding', status: 'checked-in', checkIn: '2026-03-02', checkOut: '2026-03-05' },
      ];
      const result = countActiveDogs(reservations, '2026-03-03');
      expect(result.boardingCount).toBe(2);
    });

    it('counts upcoming boarding within date range', () => {
      const reservations = [
        { type: 'boarding', status: 'upcoming', checkIn: '2026-03-01', checkOut: '2026-03-04' },
      ];
      const result = countActiveDogs(reservations, '2026-03-02');
      expect(result.boardingCount).toBe(1);
    });

    it('excludes upcoming boarding outside date range', () => {
      const reservations = [
        { type: 'boarding', status: 'upcoming', checkIn: '2026-03-05', checkOut: '2026-03-08' },
      ];
      const result = countActiveDogs(reservations, '2026-03-02');
      expect(result.boardingCount).toBe(0);
    });

    it('excludes cancelled boarding', () => {
      const reservations = [
        { type: 'boarding', status: 'cancelled', checkIn: '2026-03-01', checkOut: '2026-03-04' },
      ];
      const result = countActiveDogs(reservations, '2026-03-02');
      expect(result.boardingCount).toBe(0);
    });

    it('excludes checked-out boarding', () => {
      const reservations = [
        { type: 'boarding', status: 'checked-out', checkIn: '2026-03-01', checkOut: '2026-03-02' },
      ];
      const result = countActiveDogs(reservations, '2026-03-02');
      expect(result.boardingCount).toBe(0);
    });
  });

  describe('daycare dogs', () => {
    it('counts checked-in daycare dogs', () => {
      const reservations = [
        { type: 'daycare', status: 'checked-in', checkIn: '2026-03-03', checkOut: '2026-03-03' },
      ];
      const result = countActiveDogs(reservations, '2026-03-03');
      expect(result.daycareCount).toBe(1);
    });

    it('counts upcoming daycare within date range', () => {
      const reservations = [
        { type: 'daycare', status: 'upcoming', checkIn: '2026-03-03', checkOut: '2026-03-03' },
      ];
      const result = countActiveDogs(reservations, '2026-03-03');
      expect(result.daycareCount).toBe(1);
    });
  });

  describe('total attendance', () => {
    it('calculates total attendance as boarding + daycare', () => {
      const reservations = [
        { type: 'boarding', status: 'checked-in', checkIn: '2026-03-01', checkOut: '2026-03-05' },
        { type: 'boarding', status: 'checked-in', checkIn: '2026-03-02', checkOut: '2026-03-06' },
        { type: 'daycare', status: 'checked-in', checkIn: '2026-03-03', checkOut: '2026-03-03' },
        { type: 'daycare', status: 'checked-in', checkIn: '2026-03-03', checkOut: '2026-03-03' },
        { type: 'daycare', status: 'checked-in', checkIn: '2026-03-03', checkOut: '2026-03-03' },
      ];
      const result = countActiveDogs(reservations, '2026-03-03');
      expect(result.boardingCount).toBe(2);
      expect(result.daycareCount).toBe(3);
      expect(result.attendanceCount).toBe(5);
    });

    it('returns 0 for all counts when no reservations', () => {
      const result = countActiveDogs([], '2026-03-03');
      expect(result.boardingCount).toBe(0);
      expect(result.daycareCount).toBe(0);
      expect(result.attendanceCount).toBe(0);
    });

    it('excludes non-boarding/daycare types from count', () => {
      const reservations = [
        { type: 'evaluation', status: 'checked-in', checkIn: '2026-03-03', checkOut: '2026-03-03' },
        { type: 'grooming', status: 'checked-in', checkIn: '2026-03-03', checkOut: '2026-03-03' },
      ];
      const result = countActiveDogs(reservations, '2026-03-03');
      expect(result.attendanceCount).toBe(0);
    });
  });
});

describe('Private Play Stats', () => {
  it('counts day boarding dogs as PP dogs', () => {
    const reservations = [
      { type: 'dayboarding', status: 'checked-in', checkIn: '2026-03-03', checkOut: '2026-03-03' },
    ];
    const { totalDogs, requiredSessions } = getPPStats(reservations, '2026-03-03');
    expect(totalDogs).toBe(1);
    expect(requiredSessions).toBe(3); // 3 sessions per dog
  });

  it('counts boarding dogs with Private Play add-on', () => {
    const reservations = [
      { type: 'boarding', status: 'checked-in', checkIn: '2026-03-01', checkOut: '2026-03-05', _services: ['Private Play'] },
    ];
    const { totalDogs, requiredSessions } = getPPStats(reservations, '2026-03-03');
    expect(totalDogs).toBe(1);
    expect(requiredSessions).toBe(3);
  });

  it('does not count boarding dogs without Private Play', () => {
    const reservations = [
      { type: 'boarding', status: 'checked-in', checkIn: '2026-03-01', checkOut: '2026-03-05', _services: ['Bath'] },
    ];
    const { totalDogs } = getPPStats(reservations, '2026-03-03');
    expect(totalDogs).toBe(0);
  });

  it('counts multiple PP dogs correctly', () => {
    const reservations = [
      { type: 'dayboarding', status: 'checked-in', checkIn: '2026-03-03', checkOut: '2026-03-03' },
      { type: 'dayboarding', status: 'checked-in', checkIn: '2026-03-03', checkOut: '2026-03-03' },
      { type: 'boarding', status: 'checked-in', checkIn: '2026-03-01', checkOut: '2026-03-05', _services: ['Private Play'] },
    ];
    const { totalDogs, requiredSessions } = getPPStats(reservations, '2026-03-03');
    expect(totalDogs).toBe(3);
    expect(requiredSessions).toBe(9); // 3 × 3
  });

  it('excludes dogs not checked in on the given date', () => {
    const reservations = [
      { type: 'dayboarding', status: 'checked-in', checkIn: '2026-03-05', checkOut: '2026-03-05' },
    ];
    const { totalDogs } = getPPStats(reservations, '2026-03-03');
    expect(totalDogs).toBe(0);
  });

  it('excludes non-checked-in dogs', () => {
    const reservations = [
      { type: 'dayboarding', status: 'upcoming', checkIn: '2026-03-03', checkOut: '2026-03-03' },
    ];
    const { totalDogs } = getPPStats(reservations, '2026-03-03');
    expect(totalDogs).toBe(0);
  });

  it('returns 0 for empty reservations', () => {
    const { totalDogs, requiredSessions } = getPPStats([], '2026-03-03');
    expect(totalDogs).toBe(0);
    expect(requiredSessions).toBe(0);
  });

  it('handles service objects with name property', () => {
    const reservations = [
      { type: 'boarding', status: 'checked-in', checkIn: '2026-03-01', checkOut: '2026-03-05', _services: [{ name: 'Private Play Session' }] },
    ];
    const { totalDogs } = getPPStats(reservations, '2026-03-03');
    expect(totalDogs).toBe(1);
  });

  it('handles no _services property', () => {
    const reservations = [
      { type: 'boarding', status: 'checked-in', checkIn: '2026-03-01', checkOut: '2026-03-05' },
    ];
    const { totalDogs } = getPPStats(reservations, '2026-03-03');
    expect(totalDogs).toBe(0);
  });
});

describe('resSvcIncludes', () => {
  it('finds service by partial string match', () => {
    const res = { _services: ['Private Play', 'Bath & Brush'] };
    expect(resSvcIncludes(res, 'Private Play')).toBe(true);
  });

  it('is case insensitive', () => {
    const res = { _services: ['PRIVATE PLAY'] };
    expect(resSvcIncludes(res, 'private play')).toBe(true);
  });

  it('finds partial matches', () => {
    const res = { _services: ['Private Play Session'] };
    expect(resSvcIncludes(res, 'Private Play')).toBe(true);
  });

  it('works with object services (name property)', () => {
    const res = { _services: [{ name: 'Private Play' }] };
    expect(resSvcIncludes(res, 'Private Play')).toBe(true);
  });

  it('returns false when service not found', () => {
    const res = { _services: ['Bath', 'Grooming'] };
    expect(resSvcIncludes(res, 'Private Play')).toBe(false);
  });

  it('returns false when _services is undefined', () => {
    const res = {};
    expect(resSvcIncludes(res, 'Private Play')).toBe(false);
  });

  it('returns false when _services is null', () => {
    const res = { _services: null };
    expect(resSvcIncludes(res, 'Private Play')).toBe(false);
  });

  it('returns false for empty services array', () => {
    const res = { _services: [] };
    expect(resSvcIncludes(res, 'Private Play')).toBe(false);
  });
});
