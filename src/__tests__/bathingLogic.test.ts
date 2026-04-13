import { describe, expect, it } from 'vitest';
import {
  buildSuggestedBathStatusContext,
  extractBathLikeServices,
  getBathSchedulingForDate,
  normalizeBathDisplay,
} from '../../supabase/functions/_shared/bathing-logic.ts';

describe('bathing logic', () => {
  it('marks a yesterday bath as suggested for today instead of scheduled today', () => {
    const services = extractBathLikeServices([
      {
        id: 101,
        name: 'Bath',
        scheduled_at: '2026-04-12T08:00:00-04:00',
      },
    ], []);

    const schedule = getBathSchedulingForDate(services, '2026-04-13');
    const context = buildSuggestedBathStatusContext('2026-04-13', schedule.scheduledOtherDay);

    expect(schedule.scheduledToday).toBeNull();
    expect(schedule.scheduledOtherDay?.scheduledAt).toContain('2026-04-12');
    expect(context).toEqual({
      code: 'scheduled_other_day',
      scheduledDate: '2026-04-12',
      message: 'Bath scheduled Sun, Apr 12; departure Mon, Apr 13',
    });
  });

  it('uses no_bath_detected when no bath service exists during the stay', () => {
    expect(buildSuggestedBathStatusContext('2026-04-13', null)).toEqual({
      code: 'no_bath_detected',
      message: 'No bath detected during this stay',
    });
  });

  it('keeps modifier chips out of the primary bath type', () => {
    const normalized = normalizeBathDisplay({
      iconTitles: ['NO DRYER', 'Hypo - NO Spray'],
      serviceName: 'Hypo - NO Spray NO DRYER',
      rawModifiers: ['NO DRYER'],
      defaultType: 'Standard',
    });

    expect(normalized.bathType).toBe('Hypoallergenic - NO SPRAY');
    expect(normalized.bathIcons).toEqual(['Hypoallergenic - NO SPRAY']);
    expect(normalized.bathModifiers).toEqual(['NO DRYER']);
  });
});
