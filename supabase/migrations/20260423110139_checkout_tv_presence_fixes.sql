-- Align canonical Checkout TV playgroup display with the documented rule:
-- large + small GINGR Play icons are "Both Daycares", not unresolved.

create or replace view public.v_dog_playgroup_assignments_current
with (security_invoker = true) as
with tag_rollup as (
  select
    location_id,
    animal_gingr_id,
    bool_or(playgroup = 'private_play') as has_private_play,
    bool_or(playgroup = 'evaluation') as has_evaluation,
    bool_or(playgroup = 'large') as has_large,
    bool_or(playgroup = 'small') as has_small,
    coalesce(array_agg(distinct playgroup order by playgroup), array[]::text[]) as playgroup_tags,
    coalesce(
      array_agg(distinct nullif(btrim(icon_title), '') order by nullif(btrim(icon_title), ''))
        filter (where nullif(btrim(icon_title), '') is not null),
      array[]::text[]
    ) as source_icon_titles,
    coalesce(
      array_agg(distinct nullif(btrim(icon_comment), '') order by nullif(btrim(icon_comment), ''))
        filter (where nullif(btrim(icon_comment), '') is not null),
      array[]::text[]
    ) as source_icon_comments,
    max(nullif(btrim(icon_comment), '')) filter (where playgroup = 'private_play') as private_play_comment
  from public.v_dog_playgroup_icon_tags
  group by location_id, animal_gingr_id
)
select
  location_id,
  animal_gingr_id,
  case
    when has_large and not has_small then 'large'
    when has_small and not has_large then 'small'
    else null
  end as size_group,
  has_private_play,
  has_evaluation,
  (
    has_private_play
    and (
      (has_large and not has_small)
      or (has_small and not has_large)
    )
  ) as is_half_and_half,
  case
    when has_large and has_small then 'both_daycares'
    when has_private_play and (
      (has_large and not has_small)
      or (has_small and not has_large)
    ) then 'half_and_half'
    when has_private_play then 'private_play'
    when has_large and not has_small then 'large'
    when has_small and not has_large then 'small'
    when has_evaluation then 'evaluation'
    else null
  end as primary_display_playgroup,
  case
    when has_private_play then 'private_play'
    when has_large and not has_small then 'large'
    when has_small and not has_large then 'small'
    else null
  end as scheduling_playgroup,
  array(
    select tag
    from unnest(array['half_and_half', 'both_daycares', 'private_play', 'large', 'small', 'evaluation']) as ordered(tag)
    where (
      tag = 'half_and_half'
      and has_private_play
      and (
        (has_large and not has_small)
        or (has_small and not has_large)
      )
    )
    or (tag = 'both_daycares' and has_large and has_small)
    or (tag = any(playgroup_tags))
  ) as playgroup_tags,
  source_icon_titles,
  source_icon_comments,
  case
    when has_private_play and (
      (has_large and not has_small)
      or (has_small and not has_large)
    ) then private_play_comment
    else null
  end as half_and_half_note,
  case
    when not has_private_play and not has_large and not has_small and has_evaluation then 'evaluation_only'
    when not has_private_play and not has_large and not has_small then 'no_actionable_icon'
    else null
  end as unresolved_reason
from tag_rollup;

grant select on public.v_dog_playgroup_assignments_current to authenticated, service_role;
