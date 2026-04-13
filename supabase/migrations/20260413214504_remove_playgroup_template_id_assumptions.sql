create or replace view v_dog_playgroup_icon_tags
with (security_invoker = true) as
select distinct
  location_id,
  animal_gingr_id,
  case
    when lower(icon_title) = 'private play' then 'private_play'
    when lower(icon_title) = 'large dog playgroup' then 'large'
    when lower(icon_title) = 'small dog playgroup' then 'small'
    when lower(icon_title) = 'evaluation' then 'evaluation'
    else null
  end as playgroup,
  icon_title,
  icon_color,
  icon_template_id,
  icon_comment
from gingr_animal_icons_live
where icon_group = 'Play'
  and lower(icon_title) in ('private play', 'large dog playgroup', 'small dog playgroup', 'evaluation');
