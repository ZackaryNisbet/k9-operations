-- Manual private play overrides.
-- Lets staff add or remove dogs from the private play report without mutating GINGR.

create table if not exists public.ops_private_play_manual_overrides (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  override_date date not null,
  gingr_reservation_id text not null,
  animal_gingr_id text,
  room_label_override text not null default '',
  note text not null default '',
  added_by_user_id uuid references public.profiles(id) on delete set null,
  added_by_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by_user_id uuid references public.profiles(id) on delete set null,
  removed_by_name text not null default '',
  constraint ops_private_play_manual_overrides_location_date_reservation_key
    unique (location_id, override_date, gingr_reservation_id)
);

comment on table public.ops_private_play_manual_overrides is
  'Manual add/remove overrides for the ops private play report.';
comment on column public.ops_private_play_manual_overrides.override_date is
  'The report date the override applies to.';
comment on column public.ops_private_play_manual_overrides.gingr_reservation_id is
  'GINGR reservation id for the dog being manually added to private play.';
comment on column public.ops_private_play_manual_overrides.room_label_override is
  'Optional room label supplied by staff when the reservation has no synced room assignment yet.';
comment on column public.ops_private_play_manual_overrides.note is
  'Optional operator-entered note explaining why the manual add exists.';

alter table public.ops_private_play_manual_overrides enable row level security;

drop trigger if exists set_ops_private_play_manual_overrides_updated_at
  on public.ops_private_play_manual_overrides;

create trigger set_ops_private_play_manual_overrides_updated_at
before update on public.ops_private_play_manual_overrides
for each row
execute function public.update_updated_at_column();
