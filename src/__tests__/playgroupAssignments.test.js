import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  buildPlaygroupAssignmentMap,
  derivePlaygroupAssignmentsFromIcons,
  getDisplayPlaygroup,
  getDisplayTags,
  normalizePlaygroupAssignment,
} from '../shared/playgroupAssignments';

describe('playgroupAssignments', () => {
  it('normalizes raw Supabase rows', () => {
    const normalized = normalizePlaygroupAssignment({
      animal_gingr_id: '123',
      size_group: 'small',
      has_private_play: false,
      has_evaluation: true,
      is_half_and_half: false,
      primary_display_playgroup: 'small',
      scheduling_playgroup: 'small',
      playgroup_tags: ['small', 'evaluation'],
      source_icon_titles: ['Small Dog Playgroup', 'Evaluation'],
      source_icon_comments: ['n/a'],
      half_and_half_note: null,
      unresolved_reason: null,
    });

    expect(normalized).toEqual({
      animal_gingr_id: '123',
      size_group: 'small',
      has_private_play: false,
      has_evaluation: true,
      is_half_and_half: false,
      primary_display_playgroup: 'small',
      scheduling_playgroup: 'small',
      playgroup_tags: ['small', 'evaluation'],
      source_icon_titles: ['Small Dog Playgroup', 'Evaluation'],
      source_icon_comments: ['n/a'],
      half_and_half_note: null,
      unresolved_reason: null,
    });
  });

  it('accepts already-normalized camelCase assignments when building maps', () => {
    const map = buildPlaygroupAssignmentMap([
      {
        animalGingrId: '456',
        sizeGroup: 'large',
        hasPrivatePlay: false,
        hasEvaluation: false,
        isHalfAndHalf: false,
        primaryDisplayPlaygroup: 'large',
        schedulingPlaygroup: 'large',
        playgroupTags: ['large'],
        sourceIconTitles: ['Large Dog Playgroup'],
        sourceIconComments: [],
        halfAndHalfNote: null,
        unresolvedReason: null,
      },
    ]);

    expect(map['456']).toEqual({
      animal_gingr_id: '456',
      size_group: 'large',
      has_private_play: false,
      has_evaluation: false,
      is_half_and_half: false,
      primary_display_playgroup: 'large',
      scheduling_playgroup: 'large',
      playgroup_tags: ['large'],
      source_icon_titles: ['Large Dog Playgroup'],
      source_icon_comments: [],
      half_and_half_note: null,
      unresolved_reason: null,
    });
  });

  it('derives half and half assignments from raw Gingr play icons', () => {
    const rows = derivePlaygroupAssignmentsFromIcons([
      {
        animal_gingr_id: '789',
        icon_title: 'Private Play',
        icon_group: 'Play',
        icon_comment: 'AM only',
      },
      {
        animal_gingr_id: '789',
        icon_title: 'Large Dog Playgroup',
        icon_group: 'Play',
      },
    ]);

    expect(rows).toEqual([
      expect.objectContaining({
        animal_gingr_id: '789',
        size_group: 'large',
        has_private_play: true,
        is_half_and_half: true,
        primary_display_playgroup: 'half_and_half',
        scheduling_playgroup: 'private_play',
        playgroup_tags: ['half_and_half', 'private_play', 'large'],
        half_and_half_note: 'AM only',
      }),
    ]);
  });

  it('uses configured icon mappings before title fallback', () => {
    const rows = derivePlaygroupAssignmentsFromIcons([
      {
        animal_gingr_id: '246',
        icon_identity_key: 'play|custom-blue',
        icon_title: 'Blue Group',
        icon_group: 'Play',
      },
    ], [
      {
        capability_key: 'play.small_daycare',
        icon_identity_key: 'play|custom-blue',
        is_active: true,
      },
    ]);

    expect(rows).toEqual([
      expect.objectContaining({
        animal_gingr_id: '246',
        size_group: 'small',
        primary_display_playgroup: 'small',
        scheduling_playgroup: 'small',
        playgroup_tags: ['small'],
      }),
    ]);
  });

  it('labels large and small icons as Both Daycares for TV display', () => {
    const map = buildPlaygroupAssignmentMap(derivePlaygroupAssignmentsFromIcons([
      { animal_gingr_id: '135', icon_title: 'Large Dog Playgroup', icon_group: 'Play' },
      { animal_gingr_id: '135', icon_title: 'Small Dog Playgroup', icon_group: 'Play' },
    ]));

    expect(map['135'].unresolved_reason).toBeNull();
    expect(getDisplayPlaygroup(map['135'])).toBe('both_daycares');
    expect(getDisplayTags(map['135'])).toEqual(['both_daycares']);
  });

  it('keeps the canonical SQL view aligned with the Both Daycares rule', () => {
    const sql = readFileSync(
      new URL('../../supabase/migrations/20260423110139_checkout_tv_presence_fixes.sql', import.meta.url),
      'utf8',
    );

    expect(sql).toContain("when has_large and has_small then 'both_daycares'");
    expect(sql).not.toContain("when has_large and has_small then 'conflicting_size_icons'");
  });
});
