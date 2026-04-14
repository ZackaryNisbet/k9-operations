import { describe, expect, it } from 'vitest';
import {
  buildPlaygroupAssignmentMap,
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
});
