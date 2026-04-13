alter table public.gingr_animal_icons_live
  add column if not exists icon_identity_key text;

update public.gingr_animal_icons_live
set icon_identity_key = concat_ws(
  '::',
  coalesce(icon_template_id, ''),
  lower(coalesce(icon_group, '')),
  lower(coalesce(icon_title, ''))
)
where icon_identity_key is null
   or icon_identity_key = '';

alter table public.gingr_animal_icons_live
  alter column icon_identity_key set not null;

alter table public.gingr_animal_icons_live
  drop constraint if exists gingr_animal_icons_live_location_id_animal_gingr_id_icon_template_id_key;

alter table public.gingr_animal_icons_live
  drop constraint if exists gingr_animal_icons_live_location_id_animal_gingr_id_icon_te_key;

create unique index if not exists gingr_animal_icons_live_identity_uidx
  on public.gingr_animal_icons_live (location_id, animal_gingr_id, icon_identity_key);
